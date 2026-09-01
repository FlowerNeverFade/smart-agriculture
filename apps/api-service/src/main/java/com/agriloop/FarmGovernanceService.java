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
    private final ControlledLearningService controlledLearning;

    FarmGovernanceService(AgriStore store, AgriEventBus events, ObjectMapper mapper, CropPackCatalog cropPackCatalog,
                          ControlledLearningService controlledLearning) {
        this.store = store;
        this.events = events;
        this.mapper = mapper;
        this.cropPackCatalog = cropPackCatalog;
        this.controlledLearning = controlledLearning;
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
        for (Map<String, Object> rule : store.list("farm-rule-set").stream()
                .filter(r -> farmId.equals(Jsons.text(r, "farmId", "")))
                .map(r -> Jsons.copy(mapper, r)).toList()) {
            rule.put("scope", "FARM");
            rule.put("farmId", farmId);
            result.add(rule);
        }
        return result;
    }

    Map<String, Object> createRuleSet(Map<String, Object> input, UserPrincipal principal) {
        String farmId = Jsons.text(input, "farmId", "");
        requireFarmAdmin(principal, farmId);
        String idempotencyKey = Jsons.text(input, "idempotencyKey", "");
        if (!idempotencyKey.isBlank()) {
            Map<String, Object> prior = store.find("governance-idempotency", idempotencyKey);
            if (prior != null && farmId.equals(Jsons.text(prior, "farmId", ""))) return prior;
        }
        String code = Jsons.text(input, "code", Jsons.text(input, "ruleId", "")).trim().toLowerCase(Locale.ROOT);
        if (!CROP_CODE.matcher(code).matches()) throw new ApiException(HttpStatus.BAD_REQUEST, "RULE_CODE_INVALID", "规则编号格式无效");
        if (store.list("farm-rule-set").stream().anyMatch(r -> farmId.equals(Jsons.text(r, "farmId", "")) && code.equals(Jsons.text(r, "ruleId", "")))) {
            throw conflict("RULE_EXISTS", "该农场已存在相同规则编号");
        }
        String name = Jsons.text(input, "name", Jsons.text(input, "description", "")).trim();
        if (name.isBlank()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "RULE_NAME_REQUIRED", "请填写规则名称");
        Map<String, Object> rule = new LinkedHashMap<>(input);
        rule.put("farmId", farmId); rule.put("ruleSetId", "farm:" + farmId + ":" + code); rule.put("ruleId", code); rule.put("code", code); rule.put("name", name); rule.put("description", name);
        rule.put("scope", "FARM"); rule.put("status", "ACTIVE"); rule.put("revision", 1);
        rule.put("ruleVersion", Jsons.text(input, "ruleVersion", "farm-rule-1.0.0"));
        rule.put("createdBy", principal.userId); rule.put("createdAt", Instant.now().toString()); rule.put("updatedAt", Instant.now().toString());
        store.save("farm-rule-set", farmId + ":" + code, rule);
        events.publish("rule-set.created", rule); store.logEvent("rule-set.created", rule);
        if (!idempotencyKey.isBlank()) store.save("governance-idempotency", idempotencyKey, rule);
        return rule;
    }

    List<Map<String, Object>> learningCases(String farmId, String candidateId, UserPrincipal principal) {
        return controlledLearning.listCases(farmId, candidateId, principal);
    }

    List<Map<String, Object>> learningCases(String farmId, String plotId, String cropCode, String scenarioId,
                                             String qualityStatus, String candidateId, UserPrincipal principal) {
        return controlledLearning.listCases(farmId, plotId, cropCode, scenarioId, qualityStatus, candidateId, principal);
    }

    Map<String, Object> reEvaluateLearningCase(String caseId, UserPrincipal principal) {
        return controlledLearning.reEvaluate(caseId, principal);
    }

    Map<String, Object> reviewLearningCase(String caseId, String decision, String note, UserPrincipal principal) {
        return controlledLearning.review(caseId, decision, note, principal);
    }

    Map<String, Object> generateStrategyCandidate(Map<String, Object> input, UserPrincipal principal) {
        return controlledLearning.generateStrategyCandidate(input, principal);
    }

    Map<String, Object> offlineValidateLearningCandidate(String id, Map<String, Object> input, UserPrincipal principal) {
        return controlledLearning.offlineValidateCandidate(id, input, principal);
    }

    Map<String, Object> exportApprovedTrainingSet(String farmId, String plotId, UserPrincipal principal) {
        return controlledLearning.exportApprovedTrainingSet(farmId, plotId, principal);
    }

    List<Map<String, Object>> learningAudit(int limit, UserPrincipal principal) {
        return controlledLearning.audit(limit, principal);
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
        Map<String, Object> request = input == null ? Map.of() : input;
        long expected = Jsons.whole(request, "expectedRevision", Jsons.whole(candidate, "revision", 1));
        if (expected != Jsons.whole(candidate, "revision", 1)) throw conflict("STRATEGY_VERSION_CONFLICT", "策略候选已更新，请刷新后重试");
        String key = Jsons.text(request, "idempotencyKey", "");
        if (!key.isBlank()) { Map<String, Object> prior = store.find("governance-idempotency", key); if (prior != null) return prior; }
        if (!"APPROVED".equals(Jsons.text(candidate, "status", ""))) throw conflict("STRATEGY_TRANSITION_INVALID", "只有已批准的候选可以启用，请先完成人工批准");
        Map<String, Object> validation = Jsons.map(mapper, candidate.get("offlineValidation"));
        if (!"PASSED".equalsIgnoreCase(Jsons.text(validation, "status", ""))) throw conflict("STRATEGY_OFFLINE_VALIDATION_REQUIRED", "策略候选必须先通过离线验证");
        if (!evidenceCasesStillQualified(candidate)) throw conflict("STRATEGY_EVIDENCE_STALE", "策略引用案例已不再全部合格，请重新生成或验证候选");
        String signature = Jsons.text(candidate, "signature", "");
        for (Map<String, Object> old : store.list("strategy-candidate")) {
            if (id.equals(Jsons.text(old, "candidateId", ""))) continue;
            if (Jsons.text(old, "farmId", "").equals(Jsons.text(candidate, "farmId", ""))
                    && signature.equals(Jsons.text(old, "signature", "")) && "ACTIVE".equals(Jsons.text(old, "status", ""))) {
                old.put("status", "SUPERSEDED"); old.put("supersededAt", Instant.now().toString()); store.save("strategy-candidate", Jsons.text(old, "candidateId", ""), old);
            }
        }
        candidate.put("status", "ACTIVE"); candidate.put("revision", expected + 1); candidate.put("activatedBy", principal.userId); candidate.put("activatedAt", Instant.now().toString());
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
        Map<String, Object> request = input == null ? Map.of() : input;
        long expected = Jsons.whole(request, "expectedRevision", Jsons.whole(candidate, "revision", 1));
        if (expected != Jsons.whole(candidate, "revision", 1)) throw conflict("STRATEGY_VERSION_CONFLICT", "策略候选已更新，请刷新后重试");
        if ("APPROVED".equals(target)) {
            Map<String, Object> validation = Jsons.map(mapper, candidate.get("offlineValidation"));
            if (!"PASSED".equalsIgnoreCase(Jsons.text(validation, "status", ""))) throw conflict("STRATEGY_OFFLINE_VALIDATION_REQUIRED", "只有离线验证通过的候选可以批准");
            if (!evidenceCasesStillQualified(candidate)) throw conflict("STRATEGY_EVIDENCE_STALE", "策略引用案例已不再全部合格，请重新生成或验证候选");
            candidate.put("approvedBy", principal.userId);
            candidate.put("approvedAt", Instant.now().toString());
        }
        candidate.put("status", target); candidate.put("revision", expected + 1); candidate.put("transitionedBy", principal.userId); candidate.put("transitionedAt", Instant.now().toString());
        if ("ROLLED_BACK".equals(target)) {
            candidate.put("rolledBackBy", principal.userId);
            candidate.put("rolledBackAt", Instant.now().toString());
        }
        store.save("strategy-candidate", id, candidate); events.publish("strategy.candidate.transitioned", candidate); store.logEvent("strategy.candidate.transitioned", candidate); return candidate;
    }

    private boolean evidenceCasesStillQualified(Map<String, Object> candidate) {
        List<String> ids = Jsons.strings(candidate.get("evidenceCaseIds"));
        if (ids.isEmpty()) return false;
        for (String id : ids) {
            Map<String, Object> row = store.find("decision-case", id);
            if (row == null) row = store.find("alert-learning-case", id);
            if (row == null || !"QUALIFIED".equalsIgnoreCase(Jsons.text(row, "qualityStatus", ""))
                    || !Jsons.strings(row.get("learningUses")).contains("POSITIVE_RETRIEVAL")
                    || !Jsons.strings(row.get("excludedReason")).isEmpty()) return false;
        }
        return true;
    }

    Map<String, Object> recordAlertOutcome(Map<String, Object> alert, Map<String, Object> outcome, UserPrincipal principal) {
        return controlledLearning.createAlertCase(alert, outcome == null ? Map.of() : outcome, principal);
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
