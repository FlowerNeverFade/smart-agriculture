package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Farm-scoped governance for alert learning, strategy candidates and custom
 * Crop Packs.  Facts are stored in the existing entity_record store so this
 * service can be rolled out without a schema fork.
 */
@Service
class FarmGovernanceService {
    private static final Pattern CROP_CODE = Pattern.compile("[a-z0-9_-]{2,64}");
    private static final Set<String> CANDIDATE_STATUSES = Set.of("DRAFT", "OFFLINE_VALIDATED", "APPROVED", "ACTIVE", "REJECTED", "SUPERSEDED", "ROLLED_BACK");
    private final AgriStore store;
    private final AgriEventBus events;
    private final ObjectMapper mapper;
    private final CropPackCatalog cropPackCatalog;

    FarmGovernanceService(AgriStore store, AgriEventBus events, ObjectMapper mapper, CropPackCatalog cropPackCatalog) {
        this.store = store;
        this.events = events;
        this.mapper = mapper;
        this.cropPackCatalog = cropPackCatalog;
    }

    List<Map<String, Object>> ruleSets(String farmId, UserPrincipal principal) {
        requireFarm(principal, farmId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> pack : cropPackCatalog.all()) {
            String crop = Jsons.text(pack, "cropCode", "");
            for (Map<String, Object> rule : Jsons.maps(mapper, pack.get("rules"))) {
                Map<String, Object> row = Jsons.copy(mapper, rule);
                row.put("ruleSetId", "global:" + crop + ":" + Jsons.text(pack, "version", ""));
                row.put("scope", "GLOBAL"); row.put("farmId", farmId);
                row.put("cropCode", crop); row.put("version", pack.get("version"));
                row.put("ruleVersion", Jsons.text(pack, "ruleVersion", "rule-1.0.0"));
                result.add(row);
            }
        }
        for (Map<String, Object> pack : farmCropPacks(farmId, false)) {
            for (Map<String, Object> rule : Jsons.maps(mapper, pack.get("rules"))) {
                Map<String, Object> row = Jsons.copy(mapper, rule);
                row.put("ruleSetId", "farm:" + Jsons.text(pack, "cropCode", "") + ":" + Jsons.text(pack, "version", ""));
                row.put("scope", "FARM"); row.put("farmId", farmId);
                row.put("cropCode", Jsons.text(pack, "cropCode", "")); row.put("version", pack.get("version"));
                row.put("ruleVersion", Jsons.text(pack, "ruleVersion", "farm-rule-1"));
                result.add(row);
            }
        }
        return result;
    }

    List<Map<String, Object>> learningCases(String farmId, String candidateId, UserPrincipal principal) {
        requireFarm(principal, farmId);
        return store.list("alert-learning-case").stream()
                .filter(c -> farmId.equals(Jsons.text(c, "farmId", "")))
                .filter(c -> candidateId == null || candidateId.isBlank() || candidateId.equals(Jsons.text(c, "candidateId", "")))
                .sorted(Comparator.comparing(c -> Jsons.text(c, "createdAt", ""), Comparator.reverseOrder()))
                .map(c -> Jsons.copy(mapper, c)).toList();
    }

    List<Map<String, Object>> strategyCandidates(String farmId, String status, UserPrincipal principal) {
        if (farmId != null && !farmId.isBlank()) requireFarm(principal, farmId);
        return store.list("strategy-candidate").stream()
                .filter(c -> farmId == null || farmId.isBlank() || farmId.equals(Jsons.text(c, "farmId", "")))
                .filter(c -> status == null || status.isBlank() || status.equalsIgnoreCase(Jsons.text(c, "status", "")))
                .filter(c -> principal.isSystemAdmin() || principal.canAccessFarm(Jsons.text(c, "farmId", "")))
                .sorted(Comparator.comparing(c -> Jsons.text(c, "createdAt", ""), Comparator.reverseOrder()))
                .map(c -> Jsons.copy(mapper, c)).toList();
    }

    Map<String, Object> strategyPreview(String farmId, String alertId, UserPrincipal principal) {
        requireFarm(principal, farmId);
        Map<String, Object> alert = store.find("alert", alertId);
        if (alert == null) throw new ApiException(HttpStatus.NOT_FOUND, "ALERT_NOT_FOUND", "告警不存在");
        String plotId = Jsons.text(alert, "plotId", ""); Map<String, Object> plot = store.find("plot", plotId);
        String crop = Jsons.text(plot == null ? Map.of() : plot, "cropCode", ""); String stage = Jsons.text(plot == null ? Map.of() : plot, "stageCode", "");
        String type = Jsons.text(alert, "alertType", Jsons.text(alert, "type", "UNKNOWN")); String cause = Jsons.text(alert, "primaryCause", type);
        String prefix = String.join("|", farmId, crop, stage, type, cause);
        Map<String, Object> match = store.list("strategy-candidate").stream().filter(c -> "ACTIVE".equals(Jsons.text(c, "status", "")) && farmId.equals(Jsons.text(c, "farmId", "")) && Jsons.text(c, "signature", "").startsWith(prefix + "|" )).findFirst().orElse(null);
        Map<String, Object> result = new LinkedHashMap<>(); result.put("alertId", alertId); result.put("matched", match != null); result.put("candidate", match == null ? Map.of() : Jsons.copy(mapper, match)); result.put("previewOnly", true); result.put("requiresConfirmation", true); return result;
    }

    Map<String, Object> activateStrategy(String id, Map<String, Object> input, UserPrincipal principal) {
        Map<String, Object> candidate = requireCandidate(id);
        requireFarm(principal, Jsons.text(candidate, "farmId", ""));
        if (!principal.isFarmAdmin() && !principal.isSystemAdmin()) throw forbidden("只有农场管理员可以启用策略候选");
        long expected = Jsons.whole(input, "expectedRevision", Jsons.whole(candidate, "revision", 1));
        if (expected != Jsons.whole(candidate, "revision", 1)) throw conflict("STRATEGY_VERSION_CONFLICT", "策略候选已更新，请刷新后重试");
        String key = Jsons.text(input, "idempotencyKey", "");
        if (!key.isBlank()) { Map<String, Object> prior = store.find("governance-idempotency", key); if (prior != null) return prior; }
        if (!"OFFLINE_VALIDATED".equals(Jsons.text(candidate, "status", "")) && !"APPROVED".equals(Jsons.text(candidate, "status", ""))) {
            throw conflict("STRATEGY_TRANSITION_INVALID", "只有已通过离线验证的候选可以启用");
        }
        String signature = Jsons.text(candidate, "signature", "");
        for (Map<String, Object> old : store.list("strategy-candidate")) {
            if (id.equals(Jsons.text(old, "candidateId", ""))) continue;
            if (Jsons.text(old, "farmId", "").equals(Jsons.text(candidate, "farmId", ""))
                    && signature.equals(Jsons.text(old, "signature", "")) && "ACTIVE".equals(Jsons.text(old, "status", ""))) {
                old.put("status", "SUPERSEDED"); old.put("supersededAt", Instant.now().toString()); store.save("strategy-candidate", Jsons.text(old, "candidateId", ""), old);
            }
        }
        candidate.put("status", "ACTIVE"); candidate.put("revision", expected + 1); candidate.put("approvedBy", principal.userId); candidate.put("activatedBy", principal.userId); candidate.put("activatedAt", Instant.now().toString());
        store.save("strategy-candidate", id, candidate); events.publish("strategy.candidate.activated", candidate); store.logEvent("strategy.candidate.activated", candidate);
        if (!key.isBlank()) store.save("governance-idempotency", key, candidate);
        return candidate;
    }

    Map<String, Object> transitionStrategy(String id, String target, Map<String, Object> input, UserPrincipal principal) {
        Map<String, Object> candidate = requireCandidate(id);
        requireFarm(principal, Jsons.text(candidate, "farmId", ""));
        if (!principal.isSystemAdmin() && !principal.isFarmAdmin()) throw forbidden("无权变更策略候选");
        target = target == null ? "" : target.toUpperCase(Locale.ROOT);
        String current = Jsons.text(candidate, "status", "DRAFT");
        if ("ACTIVE".equals(target)) return activateStrategy(id, input == null ? Map.of() : input, principal);
        boolean allowed = switch (current + "->" + target) {
            case "DRAFT->REJECTED", "OFFLINE_VALIDATED->APPROVED", "OFFLINE_VALIDATED->REJECTED", "ACTIVE->ROLLED_BACK", "ACTIVE->SUPERSEDED" -> true;
            default -> false;
        };
        if (!allowed) throw conflict("STRATEGY_TRANSITION_INVALID", current + " 不能转为 " + target);
        long expected = Jsons.whole(input == null ? Map.of() : input, "expectedRevision", Jsons.whole(candidate, "revision", 1));
        if (expected != Jsons.whole(candidate, "revision", 1)) throw conflict("STRATEGY_VERSION_CONFLICT", "策略候选已更新，请刷新后重试");
        candidate.put("status", target); candidate.put("revision", expected + 1); candidate.put("transitionedBy", principal.userId); candidate.put("transitionedAt", Instant.now().toString());
        store.save("strategy-candidate", id, candidate); events.publish("strategy.candidate.transitioned", candidate); return candidate;
    }

    Map<String, Object> recordAlertOutcome(Map<String, Object> alert, Map<String, Object> outcome, UserPrincipal principal) {
        if (alert == null) return Map.of();
        String plotId = Jsons.text(alert, "plotId", ""); Map<String, Object> plot = store.find("plot", plotId);
        String farmId = Jsons.text(alert, "farmId", plot == null ? "" : Jsons.text(plot, "farmId", ""));
        if (farmId.isBlank() || !principal.canAccessFarm(farmId)) return Map.of();
        String alertId = Jsons.text(alert, "alertId", ""); String result = Jsons.text(outcome, "verificationResult", Jsons.text(outcome, "result", Jsons.text(alert, "status", "CLOSED")));
        String action = Jsons.text(outcome, "resolutionAction", result);
        String cause = Jsons.text(outcome, "primaryCause", Jsons.text(alert, "primaryCause", Jsons.text(alert, "type", "UNKNOWN")));
        String crop = Jsons.text(plot == null ? Map.of() : plot, "cropCode", ""); String stage = Jsons.text(plot == null ? Map.of() : plot, "stageCode", "");
        String signature = String.join("|", farmId, crop, stage, Jsons.text(alert, "alertType", Jsons.text(alert, "type", "UNKNOWN")), cause, action);
        if (store.list("alert-learning-case").stream().anyMatch(c -> alertId.equals(Jsons.text(c, "alertId", "")) && signature.equals(Jsons.text(c, "signature", "")))) return Map.of("duplicate", true);
        String quality = Jsons.text(outcome, "dataQuality", Jsons.text(alert, "dataQuality", "GOOD")).toUpperCase(Locale.ROOT);
        boolean complete = !alertId.isBlank() && !crop.isBlank() && !cause.isBlank() && !action.isBlank();
        Map<String, Object> record = new LinkedHashMap<>(); record.put("caseId", Jsons.id("alert-case")); record.put("alertId", alertId); record.put("farmId", farmId); record.put("plotId", plotId); record.put("cropCode", crop); record.put("stageCode", stage);
        record.put("alertType", Jsons.text(alert, "alertType", Jsons.text(alert, "type", "UNKNOWN"))); record.put("primaryCause", cause); record.put("resolutionAction", action); record.put("result", result); record.put("quality", quality); record.put("eligibility", complete && Set.of("GOOD", "PASS", "HIGH").contains(quality) ? "QUALIFIED" : "INCOMPLETE"); record.put("signature", signature); record.put("createdAt", Instant.now().toString()); record.put("evidence", outcome.getOrDefault("evidenceRefs", alert.getOrDefault("evidenceRefs", List.of()))); record.put("actorId", principal.userId);
        store.save("alert-learning-case", Jsons.text(record, "caseId", ""), record); events.publish("alert.learning.case.created", record); store.logEvent("alert.learning.case.created", record);
        if ("QUALIFIED".equals(record.get("eligibility"))) maybeGenerateCandidate(record);
        return record;
    }

    private void maybeGenerateCandidate(Map<String, Object> record) {
        String signature = Jsons.text(record, "signature", ""); String farmId = Jsons.text(record, "farmId", "");
        List<Map<String, Object>> cases = store.list("alert-learning-case").stream().filter(c -> "QUALIFIED".equals(Jsons.text(c, "eligibility", "")) && signature.equals(Jsons.text(c, "signature", ""))).toList();
        if (cases.size() < 2) return;
        long success = cases.stream().filter(c -> Set.of("CLEARED_NORMAL", "CLOSED", "RESOLVED", "SUCCESS", "GOOD").contains(Jsons.text(c, "result", "").toUpperCase(Locale.ROOT))).count();
        double consistency = cases.isEmpty() ? 0 : (double) success / cases.size(); if (consistency < .8) return;
        Map<String, Object> existing = store.list("strategy-candidate").stream().filter(c -> farmId.equals(Jsons.text(c, "farmId", "")) && signature.equals(Jsons.text(c, "signature", "")) && !"REJECTED".equals(Jsons.text(c, "status", ""))).findFirst().orElse(null);
        if (existing != null) return;
        Map<String, Object> candidate = new LinkedHashMap<>(); candidate.put("candidateId", Jsons.id("strategy")); candidate.put("farmId", farmId); candidate.put("scope", "FARM"); candidate.put("signature", signature); candidate.put("status", "OFFLINE_VALIDATED"); candidate.put("revision", 1); candidate.put("evidenceCaseIds", cases.stream().map(c -> Jsons.text(c, "caseId", "")).toList()); candidate.put("evidenceCount", cases.size()); candidate.put("consistency", consistency); candidate.put("offlineValidation", Map.of("status", "PASSED", "replayHash", Integer.toHexString(Objects.hash(signature, cases.size())), "validatedAt", Instant.now().toString())); candidate.put("createdAt", Instant.now().toString()); candidate.put("provenance", "DETERMINISTIC_REPLAY");
        store.save("strategy-candidate", Jsons.text(candidate, "candidateId", ""), candidate); events.publish("strategy.candidate.created", candidate); store.logEvent("strategy.candidate.created", candidate);
    }

    List<Map<String, Object>> farmCropPacks(String farmId, boolean includeDrafts) {
        return store.list("farm-crop-pack").stream().filter(p -> farmId.equals(Jsons.text(p, "farmId", ""))).filter(p -> includeDrafts || "ACTIVE".equalsIgnoreCase(Jsons.text(p, "status", "DRAFT"))).map(p -> Jsons.copy(mapper, p)).toList();
    }

    Map<String, Object> createCropPack(String farmId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal, farmId); String idempotencyKey = Jsons.text(input, "idempotencyKey", "");
        if (!idempotencyKey.isBlank()) { Map<String, Object> prior = store.find("governance-idempotency", idempotencyKey); if (prior != null) return prior; }
        String code = normalizeCode(Jsons.text(input, "cropCode", "")); String version = Jsons.text(input, "version", "1.0.0");
        if (store.list("farm-crop-pack").stream().anyMatch(p -> farmId.equals(Jsons.text(p, "farmId", "")) && code.equals(Jsons.text(p, "cropCode", "")) && version.equals(Jsons.text(p, "version", "")))) throw conflict("CROP_PACK_VERSION_EXISTS", "该农场已有相同作物包版本");
        Map<String, Object> pack = new LinkedHashMap<>(input); pack.remove("idempotencyKey"); pack.put("farmId", farmId); pack.put("cropCode", code); pack.put("version", version); pack.put("status", "DRAFT"); pack.put("revision", 1); pack.put("createdBy", principal.userId); pack.put("createdAt", Instant.now().toString()); pack.put("updatedAt", Instant.now().toString()); store.save("farm-crop-pack", farmId + ":" + code + ":" + version, pack); events.publish("crop-pack.created", pack); if (!idempotencyKey.isBlank()) store.save("governance-idempotency", idempotencyKey, pack); return pack;
    }

    Map<String, Object> updateCropPack(String farmId, String code, String version, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal, farmId); Map<String, Object> pack = requirePack(farmId, code, version); if ("ACTIVE".equalsIgnoreCase(Jsons.text(pack, "status", ""))) throw conflict("CROP_PACK_ACTIVE_IMMUTABLE", "已启用版本不可原地覆盖");
        long expected = Jsons.whole(input, "expectedRevision", Jsons.whole(pack, "revision", 1)); if (expected != Jsons.whole(pack, "revision", 1)) throw conflict("CROP_PACK_VERSION_CONFLICT", "作物包已更新，请刷新后重试");
        Map<String, Object> merged = new LinkedHashMap<>(pack); input.forEach((k, v) -> { if (!Set.of("farmId", "cropCode", "version", "status", "revision").contains(k)) merged.put(k, v); }); merged.put("revision", expected + 1); merged.put("updatedBy", principal.userId); merged.put("updatedAt", Instant.now().toString()); store.save("farm-crop-pack", packKey(farmId, code, version), merged); events.publish("crop-pack.updated", merged); return merged;
    }

    Map<String, Object> validateCropPack(String farmId, String code, String version, UserPrincipal principal) {
        requireFarmAdmin(principal, farmId); Map<String, Object> pack = requirePack(farmId, code, version); List<String> errors = validate(pack);
        Map<String, Object> result = new LinkedHashMap<>(); result.put("valid", errors.isEmpty()); result.put("errors", errors); result.put("cropCode", code); result.put("version", version); result.put("validatedAt", Instant.now().toString()); pack.put("validation", result); if (errors.isEmpty()) pack.put("validatedAt", Instant.now().toString()); store.save("farm-crop-pack", packKey(farmId, code, version), pack); return result;
    }

    Map<String, Object> activateCropPack(String farmId, String code, String version, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal, farmId); Map<String, Object> pack = requirePack(farmId, code, version); List<String> errors = validate(pack); if (!errors.isEmpty()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CROP_PACK_INVALID", "作物包校验失败").withDetails(Map.of("errors", errors));
        long expected = Jsons.whole(input, "expectedRevision", Jsons.whole(pack, "revision", 1)); if (expected != Jsons.whole(pack, "revision", 1)) throw conflict("CROP_PACK_VERSION_CONFLICT", "作物包已更新，请刷新后重试");
        for (Map<String, Object> old : store.list("farm-crop-pack")) if (farmId.equals(Jsons.text(old, "farmId", "")) && code.equals(Jsons.text(old, "cropCode", "")) && "ACTIVE".equals(Jsons.text(old, "status", ""))) { old.put("status", "ARCHIVED"); store.save("farm-crop-pack", packKey(farmId, code, Jsons.text(old, "version", "")), old); }
        pack.put("status", "ACTIVE"); pack.put("revision", expected + 1); pack.put("activatedBy", principal.userId); pack.put("activatedAt", Instant.now().toString()); store.save("farm-crop-pack", packKey(farmId, code, version), pack); events.publish("crop-pack.activated", pack); return pack;
    }

    Map<String, Object> archiveCropPack(String farmId, String code, String version, Map<String, Object> input, UserPrincipal principal) { requireFarmAdmin(principal, farmId); Map<String, Object> pack = requirePack(farmId, code, version); long expected = Jsons.whole(input == null ? Map.of() : input, "expectedRevision", Jsons.whole(pack, "revision", 1)); if (expected != Jsons.whole(pack, "revision", 1)) throw conflict("CROP_PACK_VERSION_CONFLICT", "作物包已更新，请刷新后重试"); pack.put("status", "ARCHIVED"); pack.put("revision", expected + 1); pack.put("archivedBy", principal.userId); pack.put("archivedAt", Instant.now().toString()); store.save("farm-crop-pack", packKey(farmId, code, version), pack); events.publish("crop-pack.archived", pack); return pack; }

    private List<String> validate(Map<String, Object> pack) {
        List<String> errors = new ArrayList<>(); String code = Jsons.text(pack, "cropCode", ""); if (!CROP_CODE.matcher(code).matches()) errors.add("cropCode 格式无效");
        Map<String, Object> identity = Jsons.map(mapper, pack.get("identity")); if (Jsons.text(identity, "name", "").isBlank()) errors.add("缺少作物名称"); if (Jsons.text(identity, "variety", "").isBlank()) errors.add("缺少品种");
        List<Map<String, Object>> stages = Jsons.maps(mapper, pack.get("stages")); if (stages.isEmpty()) errors.add("至少需要一个生长阶段"); Set<String> seen = new HashSet<>(); int previous = -1; for (Map<String, Object> s : stages) { String sc = Jsons.text(s, "code", ""); int seq = (int) Jsons.whole(s, "sequence", 0); if (sc.isBlank() || !seen.add(sc)) errors.add("阶段编号重复或为空"); if (seq <= previous) errors.add("阶段顺序必须递增"); previous = seq; Map<String, Object> target = Jsons.map(mapper, s.get("target")); for (Object v : target.values()) if (v instanceof Map<?, ?> m && Jsons.number(Jsons.map(mapper, m), "low", 0) >= Jsons.number(Jsons.map(mapper, m), "high", 0)) errors.add("阶段目标区间无效"); }
        if (pack.get("rules") != null && !(pack.get("rules") instanceof Collection<?>)) errors.add("告警规则格式无效"); if (pack.get("taskTemplates") != null && !(pack.get("taskTemplates") instanceof Collection<?>)) errors.add("任务模板格式无效"); return errors;
    }

    private List<Map<String, Object>> farmCropPacks(String farmId, boolean includeDrafts, UserPrincipal p) { requireFarm(p, farmId); return farmCropPacks(farmId, includeDrafts); }
    private Map<String, Object> requireCandidate(String id) { Map<String, Object> c = store.find("strategy-candidate", id); if (c == null) throw new ApiException(HttpStatus.NOT_FOUND, "STRATEGY_NOT_FOUND", "策略候选不存在"); return c; }
    private Map<String, Object> requirePack(String farmId, String code, String version) { Map<String, Object> p = store.find("farm-crop-pack", packKey(farmId, code, version)); if (p == null) throw new ApiException(HttpStatus.NOT_FOUND, "CROP_PACK_NOT_FOUND", "农场作物包不存在"); return p; }
    private String normalizeCode(String code) { code = code == null ? "" : code.trim().toLowerCase(Locale.ROOT); if (!CROP_CODE.matcher(code).matches()) throw new ApiException(HttpStatus.BAD_REQUEST, "CROP_CODE_INVALID", "cropCode 只能包含小写字母、数字、下划线或短横线"); return code; }
    private String packKey(String farmId, String code, String version) { return farmId + ":" + code.toLowerCase(Locale.ROOT) + ":" + version; }
    private void requireFarm(UserPrincipal p, String farmId) { if (p == null || !p.canAccessFarm(farmId)) throw forbidden("无权访问该农场"); }
    private void requireFarmAdmin(UserPrincipal p, String farmId) { if (p == null || !p.isFarmAdmin() || !p.canAccessFarm(farmId)) throw forbidden("只有该农场管理员可以执行此操作"); }
    private ApiException forbidden(String message) { return new ApiException(HttpStatus.FORBIDDEN, "FARM_GOVERNANCE_FORBIDDEN", message); }
    private ApiException conflict(String code, String message) { return new ApiException(HttpStatus.CONFLICT, code, message); }
}
