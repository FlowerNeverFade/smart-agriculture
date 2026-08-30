package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.regex.Pattern;

/**
 * Versioned Crop Pack directory plus stage-aware resolution.
 *
 * Crop differences stay in YAML: the platform kernel only reads the resolved
 * stage, effective rules, forecast bounds, health weights and handbook text.
 */
@Service
class CropPackCatalog {
    private static final Pattern CROP_CODE_PATTERN = Pattern.compile("^[a-z0-9][a-z0-9_-]{1,63}$");
    private static final Pattern VERSION_PATTERN = Pattern.compile("^[0-9]+\\.[0-9]+\\.[0-9]+$");
    private static final Map<String, String> STAGE_LABELS = Map.of(
            "seedling", "苗期",
            "vegetative", "营养生长期",
            "flowering", "开花期",
            "fruiting", "结果期");
    private static final Map<String, String> METRIC_LABELS = Map.of(
            "SOIL_MOISTURE", "土壤湿度",
            "AIR_TEMPERATURE", "空气温度",
            "AIR_HUMIDITY", "空气湿度",
            "LIGHT", "光照强度",
            "CO2", "CO2",
            "PH", "土壤酸碱度",
            "WATER_LEVEL", "水箱水位");
    private static final Map<String, String> RISK_LABELS = Map.of(
            "WATER_DEFICIT", "缺水风险",
            "HEAT_STRESS", "高温胁迫",
            "COLD_STRESS", "低温冷害",
            "SENSOR_DRIFT", "传感器漂移",
            "DEVICE_FAULT", "设备异常");
    private static final Map<String, String> TASK_LABELS = Map.of(
            "INSPECTION", "现场巡田",
            "IRRIGATION_CHECK", "灌溉巡检",
            "FERTILIZATION", "施肥检查");
    private static final Map<String, String> AVAILABILITY_NOTES = Map.of(
            "SUPPORTED", "可监测指标",
            "SIMULATION_ONLY", "模型参考区间",
            "UNAVAILABLE", "当前不可用，不得由模型补值");
    private static final Map<String, Double> DEFAULT_METRIC_WEIGHTS = Map.of(
            "SOIL_MOISTURE", 0.30,
            "AIR_TEMPERATURE", 0.20,
            "AIR_HUMIDITY", 0.16,
            "LIGHT", 0.12,
            "WATER_LEVEL", 0.12,
            "CO2", 0.10);
    private static final Map<String, Double> RISK_SCORES = Map.of(
            "LOW", 0.90,
            "MEDIUM", 0.66,
            "WARN", 0.66,
            "HIGH", 0.35,
            "CRITICAL", 0.22,
            "UNKNOWN", 0.58);

    private final ObjectMapper mapper;
    private final AgriStore store;
    private volatile List<Map<String, Object>> packs = List.of();
    /** Immutable baseline used to reveal a built-in pack after an override is deleted. */
    private volatile List<Map<String, Object>> builtInPacks = List.of();

    CropPackCatalog(ObjectMapper mapper, AgriStore store) {
        this.mapper = mapper;
        this.store = store;
    }

    @PostConstruct
    void load() {
        List<Map<String, Object>> loaded = new ArrayList<>();
        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources("classpath*:/crop-packs/*/pack.yaml");
            Yaml yaml = new Yaml();
            for (Resource resource : resources) {
                try (InputStream stream = resource.getInputStream()) {
                    Object value = yaml.load(stream);
                    if (!(value instanceof Map<?, ?> raw)) continue;
                    Map<String, Object> pack = mapper.convertValue(raw, Map.class);
                    enrichPack(pack, resolver);
                    pack.putIfAbsent("sourceMode", "BUILT_IN");
                    pack.putIfAbsent("builtIn", true);
                    loaded.add(pack);
                }
            }
        } catch (Exception error) {
            throw new IllegalStateException("Crop Pack 加载失败", error);
        }
        loaded.sort(packComparator());
        builtInPacks = loaded.stream().map(pack -> Jsons.copy(mapper, pack)).toList();
        packs = mergeManagedPacks(loaded);
    }

    List<Map<String, Object>> all() {
        return packs.stream().map(pack -> Jsons.copy(mapper, pack)).toList();
    }

    /**
     * Status changes are persisted as a managed override, even when the pack
     * started life in the classpath catalog. This keeps all role workspaces in
     * sync after a restart and avoids the old in-memory-only behaviour.
     */
    synchronized Map<String, Object> updateStatus(String cropCode, String version, String status, UserPrincipal principal) {
        Map<String, Object> existing = findMutable(cropCode, version);
        if (existing == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "CROP_PACK_NOT_FOUND", "没有找到要更新的作物包");
        }
        existing.put("status", normalisePackStatus(status));
        markManaged(existing, principal == null ? "" : principal.userId);
        persistPack(existing);
        replacePack(existing);
        return Jsons.copy(mapper, existing);
    }

    /** Create a user-managed pack shared by every role through AgriStore. */
    synchronized Map<String, Object> create(Map<String, Object> input, UserPrincipal principal) {
        Map<String, Object> body = input == null ? Map.of() : input;
        String cropCode = normaliseCropCode(Jsons.text(body, "cropCode", Jsons.text(body, "id", "")));
        String version = normaliseVersion(Jsons.text(body, "version", "1.0.0"));
        if (findMutable(cropCode, version) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "CROP_PACK_EXISTS", "相同作物编号和版本的作物包已存在");
        }
        Map<String, Object> pack = canonicalisePack(body, null, cropCode, version);
        markManaged(pack, principal == null ? "" : principal.userId);
        persistPack(pack);
        replacePack(pack);
        return Jsons.copy(mapper, pack);
    }

    /** Update a complete or partial user-managed pack without dropping hidden agronomic fields. */
    synchronized Map<String, Object> update(String cropCode, String version, Map<String, Object> input, UserPrincipal principal) {
        String normalizedCrop = normaliseCropCode(cropCode);
        String normalizedVersion = normaliseVersion(version);
        Map<String, Object> existing = findMutable(normalizedCrop, normalizedVersion);
        if (existing == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "CROP_PACK_NOT_FOUND", "没有找到要编辑的作物包");
        }
        Map<String, Object> pack = canonicalisePack(input == null ? Map.of() : input, existing, normalizedCrop, normalizedVersion);
        markManaged(pack, principal == null ? "" : principal.userId);
        persistPack(pack);
        replacePack(pack);
        return Jsons.copy(mapper, pack);
    }

    /** Delete only a managed pack/override; built-in catalog entries stay available. */
    synchronized void delete(String cropCode, String version) {
        String normalizedCrop = normaliseCropCode(cropCode);
        String normalizedVersion = normaliseVersion(version);
        Map<String, Object> existing = findMutable(normalizedCrop, normalizedVersion);
        if (existing == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "CROP_PACK_NOT_FOUND", "没有找到要删除的作物包");
        }
        if (Jsons.bool(existing, "builtIn", false)
                || !"USER_MANAGED".equalsIgnoreCase(Jsons.text(existing, "sourceMode", ""))) {
            throw new ApiException(HttpStatus.CONFLICT, "CROP_PACK_BUILTIN", "内置作物包不能删除，可编辑后作为版本覆盖");
        }
        store.delete("crop-pack", packKey(normalizedCrop, normalizedVersion));
        reloadManagedPacks();
    }

    private Comparator<Map<String, Object>> packComparator() {
        return Comparator.comparing((Map<String, Object> pack) -> Jsons.text(pack, "cropCode", ""))
                .thenComparing(pack -> Jsons.text(pack, "version", ""));
    }

    private String packKey(String cropCode, String version) {
        return normaliseCropCode(cropCode).toLowerCase(Locale.ROOT) + "@" + normaliseVersion(version);
    }

    private Map<String, Object> findMutable(String cropCode, String version) {
        if (cropCode == null || cropCode.isBlank()) return null;
        return packs.stream()
                .filter(pack -> cropCode.equalsIgnoreCase(Jsons.text(pack, "cropCode", "")))
                .filter(pack -> version == null || version.isBlank() || version.equals(Jsons.text(pack, "version", "")))
                .findFirst()
                .map(pack -> Jsons.copy(mapper, pack))
                .orElse(null);
    }

    private void replacePack(Map<String, Object> updated) {
        String key = packKey(Jsons.text(updated, "cropCode", ""), Jsons.text(updated, "version", "1.0.0"));
        List<Map<String, Object>> next = new ArrayList<>();
        boolean replaced = false;
        for (Map<String, Object> current : packs) {
            String currentKey = packKey(Jsons.text(current, "cropCode", ""), Jsons.text(current, "version", "1.0.0"));
            if (key.equals(currentKey)) {
                next.add(Jsons.copy(mapper, updated));
                replaced = true;
            } else {
                next.add(Jsons.copy(mapper, current));
            }
        }
        if (!replaced) next.add(Jsons.copy(mapper, updated));
        next.sort(packComparator());
        packs = List.copyOf(next);
    }

    private void persistPack(Map<String, Object> pack) {
        store.save("crop-pack", packKey(Jsons.text(pack, "cropCode", ""), Jsons.text(pack, "version", "1.0.0")), pack);
    }

    private List<Map<String, Object>> mergeManagedPacks(List<Map<String, Object>> base) {
        Map<String, Map<String, Object>> byKey = new LinkedHashMap<>();
        for (Map<String, Object> pack : base) {
            byKey.put(packKey(Jsons.text(pack, "cropCode", ""), Jsons.text(pack, "version", "1.0.0")), Jsons.copy(mapper, pack));
        }
        for (Map<String, Object> stored : store.list("crop-pack")) {
            String cropCode = Jsons.text(stored, "cropCode", "");
            String version = Jsons.text(stored, "version", "");
            if (cropCode.isBlank() || version.isBlank()) continue;
            Map<String, Object> copy = Jsons.copy(mapper, stored);
            byKey.put(packKey(cropCode, version), copy);
        }
        List<Map<String, Object>> merged = new ArrayList<>(byKey.values());
        merged.sort(packComparator());
        return List.copyOf(merged);
    }

    private synchronized void reloadManagedPacks() {
        packs = mergeManagedPacks(builtInPacks.stream().map(pack -> Jsons.copy(mapper, pack)).toList());
    }

    private String normaliseCropCode(String value) {
        String normalized = String.valueOf(value == null ? "" : value).trim().toLowerCase(Locale.ROOT);
        if (!CROP_CODE_PATTERN.matcher(normalized).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CROP_PACK_CODE_INVALID", "作物编号需为 2~64 位字母、数字、下划线或短横线");
        }
        return normalized;
    }

    private String normaliseVersion(String value) {
        String normalized = String.valueOf(value == null ? "" : value).trim();
        if (!VERSION_PATTERN.matcher(normalized).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CROP_PACK_VERSION_INVALID", "作物包版本需使用类似 1.0.0 的格式");
        }
        return normalized;
    }

    private String normalisePackStatus(String value) {
        String key = String.valueOf(value == null ? "DRAFT" : value).trim().toUpperCase(Locale.ROOT);
        return switch (key) {
            case "ACTIVE", "PUBLISHED", "ENABLED" -> "ACTIVE";
            case "DRAFT", "INACTIVE", "DISABLED", "ARCHIVED" -> "DRAFT";
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "CROP_PACK_STATUS_INVALID", "作物包状态只能是已发布或草稿");
        };
    }

    private void markManaged(Map<String, Object> pack, String actor) {
        pack.put("sourceMode", "USER_MANAGED");
        pack.putIfAbsent("builtIn", false);
        pack.put("updatedAt", Instant.now().toString());
        if (actor != null && !actor.isBlank()) pack.put("updatedBy", actor);
        pack.put("status", normalisePackStatus(Jsons.text(pack, "status", "DRAFT")));
        pack.put("id", Jsons.text(pack, "id", Jsons.text(pack, "cropCode", "")));
    }

    /**
     * Convert the compact editor payload used by both web workspaces into a
     * complete Crop Pack. Existing hidden fields (targets, rules and forecast
     * constraints) are deliberately retained when an editor only changes the
     * name, stages or knowledge documents.
     */
    private Map<String, Object> canonicalisePack(Map<String, Object> input,
                                                  Map<String, Object> existing,
                                                  String cropCode,
                                                  String version) {
        Map<String, Object> pack = existing == null ? new LinkedHashMap<>() : Jsons.copy(mapper, existing);
        if (input != null) {
            Set<String> editorOnly = Set.of("id", "name", "icon", "knowledgeDocs", "availableForPlanting", "status", "cropCode", "version");
            for (Map.Entry<String, Object> entry : input.entrySet()) {
                if (editorOnly.contains(entry.getKey()) || entry.getValue() == null) continue;
                pack.put(entry.getKey(), copyValue(entry.getValue()));
            }
        }
        pack.put("cropCode", cropCode);
        pack.put("version", version);
        pack.putIfAbsent("schemaVersion", "1.0");
        pack.put("status", normalisePackStatus(Jsons.text(input, "status", Jsons.text(pack, "status", "DRAFT"))));

        Map<String, Object> identity = Jsons.map(mapper, pack.get("identity"));
        Map<String, Object> inputIdentity = Jsons.map(mapper, input == null ? null : input.get("identity"));
        identity.putAll(inputIdentity);
        String name = Jsons.text(input, "name", Jsons.text(identity, "name", "")).trim();
        if (name.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CROP_PACK_NAME_REQUIRED", "请填写作物名称");
        }
        identity.put("name", name);
        identity.putIfAbsent("variety", "通用品种");
        identity.putIfAbsent("region", "本地");
        identity.putIfAbsent("environment", "greenhouse");
        pack.put("identity", identity);
        if (input != null && input.containsKey("icon")) pack.put("icon", Jsons.text(input, "icon", "🌱"));
        pack.putIfAbsent("icon", "🌱");
        if (input != null && input.containsKey("availableForPlanting")) {
            pack.put("availableForPlanting", Jsons.bool(input, "availableForPlanting", true));
        } else {
            pack.putIfAbsent("availableForPlanting", true);
        }

        List<Map<String, Object>> oldStages = Jsons.maps(mapper, pack.get("stages"));
        Object rawStages = input != null && input.containsKey("stages") ? input.get("stages") : oldStages;
        List<Map<String, Object>> stages = normaliseStages(rawStages, oldStages);
        if (stages.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "CROP_PACK_STAGES_REQUIRED", "至少需要一个生长阶段");
        pack.put("stages", stages);

        List<Map<String, Object>> metrics = Jsons.maps(mapper, pack.get("metrics"));
        if (metrics.isEmpty()) metrics = defaultMetrics();
        metrics.forEach(metric -> {
            String code = Jsons.text(metric, "code", "");
            metric.putIfAbsent("label", METRIC_LABELS.getOrDefault(code, code));
            metric.putIfAbsent("unit", defaultMetricUnit(code));
            metric.putIfAbsent("availability", "SIMULATION_ONLY");
        });
        pack.put("metrics", metrics);

        List<Map<String, Object>> rules = Jsons.maps(mapper, pack.get("rules"));
        if (rules.isEmpty()) rules = defaultRules();
        pack.put("rules", rules);
        if (!(pack.get("healthProfile") instanceof Map<?, ?>)) pack.put("healthProfile", defaultHealthProfile());
        if (!(pack.get("prescriptionConstraints") instanceof Map<?, ?>)) pack.put("prescriptionConstraints", defaultPrescriptionConstraints());
        if (!(pack.get("forecastProfile") instanceof Map<?, ?>)) pack.put("forecastProfile", defaultForecastProfile());
        if (!(pack.get("scenarios") instanceof Map<?, ?>)) pack.put("scenarios", defaultScenarios());
        pack.putIfAbsent("ruleVersion", "rule-1.0.0");
        pack.putIfAbsent("knowledgeVersion", "kb-1.0.0");

        Map<String, Object> knowledge = Jsons.map(mapper, pack.get("knowledge"));
        Object rawDocs = input != null && input.containsKey("knowledgeDocs")
                ? input.get("knowledgeDocs") : knowledge.get("docs");
        if (rawDocs == null) rawDocs = knowledge.get("documents");
        List<Map<String, Object>> docs = normaliseKnowledgeDocs(rawDocs, cropCode, stages);
        if (docs.isEmpty() && existing != null) docs = normaliseKnowledgeDocs(Jsons.map(mapper, existing.get("knowledge")).get("docs"), cropCode, stages);
        knowledge.put("docs", docs);
        knowledge.put("documents", docs.stream().map(doc -> Jsons.text(doc, "source", Jsons.text(doc, "id", ""))).filter(s -> !s.isBlank()).toList());
        knowledge.put("fallback", List.of("plot", "region", "stage", "crop", "general"));
        knowledge.put("byStage", docsByStage(docs, stages));
        knowledge.put("content", docs.stream().map(doc -> Jsons.text(doc, "content", "")).filter(s -> !s.isBlank()).toList());
        pack.put("knowledge", knowledge);
        return pack;
    }

    private Object copyValue(Object value) {
        if (value == null) return null;
        return mapper.convertValue(value, Object.class);
    }

    private List<Map<String, Object>> normaliseStages(Object raw, List<Map<String, Object>> existing) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (raw instanceof Collection<?> values) {
            int index = 0;
            for (Object value : values) {
                Map<String, Object> stage;
                if (value instanceof Map<?, ?>) {
                    stage = Jsons.map(mapper, value);
                } else {
                    String label = String.valueOf(value == null ? "" : value).trim();
                    if (label.isBlank()) continue;
                    stage = index < existing.size() ? Jsons.copy(mapper, existing.get(index)) : new LinkedHashMap<>();
                    stage.put("label", label);
                }
                String label = Jsons.text(stage, "label", Jsons.text(stage, "code", "阶段 " + (index + 1))).trim();
                if (label.isBlank()) label = "阶段 " + (index + 1);
                stage.put("label", label);
                stage.putIfAbsent("code", stageCode(label, index));
                stage.putIfAbsent("sequence", index + 1);
                Map<String, Object> target = Jsons.map(mapper, stage.get("target"));
                if (target.isEmpty()) target = defaultStageTarget(index);
                stage.put("target", target);
                if (!(stage.get("riskFocus") instanceof Collection<?>)) stage.put("riskFocus", List.of("WATER_DEFICIT"));
                if (!(stage.get("taskTemplates") instanceof Collection<?>)) stage.put("taskTemplates", List.of(Map.of("actionType", "INSPECTION", "intervalDays", 2, "priority", "MEDIUM")));
                result.add(stage);
                index++;
            }
        }
        if (result.isEmpty() && existing != null) result = existing.stream().map(stage -> Jsons.copy(mapper, stage)).collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        return result;
    }

    private String stageCode(String label, int index) {
        String normalized = label.toLowerCase(Locale.ROOT);
        for (Map.Entry<String, String> entry : STAGE_LABELS.entrySet()) if (label.equals(entry.getValue()) || normalized.contains(entry.getKey())) return entry.getKey();
        String slug = normalized.replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        return slug.isBlank() ? "stage-" + (index + 1) : slug;
    }

    private List<Map<String, Object>> normaliseKnowledgeDocs(Object raw, String cropCode, List<Map<String, Object>> stages) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (!(raw instanceof Collection<?> values)) return result;
        int index = 0;
        for (Object value : values) {
            Map<String, Object> doc = new LinkedHashMap<>();
            if (value instanceof Map<?, ?>) doc.putAll(Jsons.map(mapper, value));
            else if (value != null) doc.put("title", String.valueOf(value));
            String source = Jsons.text(doc, "source", "").trim();
            String title = Jsons.text(doc, "title", Jsons.text(doc, "name", "")).trim();
            String markdown = Jsons.text(doc, "markdown", "");
            String content = Jsons.text(doc, "content", Jsons.text(doc, "body", ""));
            if (content.isBlank() && !markdown.isBlank()) content = cleanDocumentText(markdown);
            if (title.isBlank() && !source.isBlank()) title = source.substring(source.lastIndexOf('/') + 1).replaceAll("\\.md$", "");
            if (title.isBlank()) title = "知识文档 " + (index + 1);
            if (source.isBlank()) source = "crop-packs/" + cropCode + "/knowledge/doc-" + (index + 1) + ".md";
            String id = Jsons.text(doc, "id", cropCode + "-doc-" + (index + 1));
            doc.put("id", id); doc.put("title", title); doc.put("content", content.trim()); doc.put("source", source);
            String stageCode = Jsons.text(doc, "stageCode", "").trim();
            if (stageCode.isBlank() && stages.size() == 1) stageCode = Jsons.text(stages.get(0), "code", "");
            if (!stageCode.isBlank()) doc.put("stageCode", stageCode);
            result.add(doc);
            index++;
        }
        return result;
    }

    private Map<String, Object> docsByStage(List<Map<String, Object>> docs, List<Map<String, Object>> stages) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map<String, Object> doc : docs) {
            String stageCode = Jsons.text(doc, "stageCode", "");
            if (stageCode.isBlank()) stageCode = inferStageFromSource(Jsons.text(doc, "source", ""), stages);
            if (!stageCode.isBlank()) result.put(stageCode, Jsons.text(doc, "content", ""));
        }
        return result;
    }

    private String inferStageFromSource(String source, List<Map<String, Object>> stages) {
        String lower = source.toLowerCase(Locale.ROOT);
        for (Map<String, Object> stage : stages) {
            String code = Jsons.text(stage, "code", "");
            if (!code.isBlank() && lower.contains(code.toLowerCase(Locale.ROOT))) return code;
        }
        return "";
    }

    private String cleanDocumentText(String markdown) {
        if (markdown == null || markdown.isBlank()) return "";
        return java.util.Arrays.stream(markdown.split("\\R"))
                .map(String::trim)
                .filter(line -> !line.isBlank() && !line.matches("^#{1,6}\\s*.*") && !line.matches("^[-*_]{3,}$"))
                .map(line -> line.replaceFirst("^[-*+]\\s+", "").replaceFirst("^>\\s*", ""))
                .collect(Collectors.joining("\\n"));
    }

    private Map<String, Object> defaultStageTarget(int index) {
        int offset = Math.min(index, 3);
        Map<String, Object> target = new LinkedHashMap<>();
        target.put("soilMoistureLow", 30 - offset * 3); target.put("soilMoistureHigh", 50 - offset * 3);
        target.put("airTemperatureLow", 18); target.put("airTemperatureHigh", 30 + Math.min(offset, 2));
        target.put("airHumidityLow", 55); target.put("airHumidityHigh", 80);
        target.put("lightLow", 15000 + offset * 5000); target.put("lightHigh", 30000 + offset * 5000);
        target.put("co2Low", 400 + offset * 50); target.put("co2High", 800 + offset * 50);
        target.put("phLow", 5.8); target.put("phHigh", 6.8); target.put("waterLevelLow", 30); target.put("waterLevelHigh", 95);
        return target;
    }

    private List<Map<String, Object>> defaultMetrics() {
        List<Map<String, Object>> result = new ArrayList<>();
        result.add(metric("SOIL_MOISTURE", "%", "SUPPORTED", 0, 100));
        result.add(metric("AIR_TEMPERATURE", "°C", "SUPPORTED", -40, 80));
        result.add(metric("AIR_HUMIDITY", "%RH", "SUPPORTED", 0, 100));
        result.add(metric("LIGHT", "lux", "SIMULATION_ONLY", 0, 100000));
        result.add(metric("CO2", "ppm", "SIMULATION_ONLY", 0, 10000));
        result.add(metric("PH", "pH", "SIMULATION_ONLY", 0, 14));
        result.add(metric("WATER_LEVEL", "%", "SUPPORTED", 0, 100));
        return result;
    }

    private Map<String, Object> metric(String code, String unit, String availability, double min, double max) {
        Map<String, Object> metric = new LinkedHashMap<>(); metric.put("code", code); metric.put("label", METRIC_LABELS.getOrDefault(code, code)); metric.put("unit", unit); metric.put("availability", availability); metric.put("range", Map.of("min", min, "max", max)); return metric;
    }

    private String defaultMetricUnit(String code) { return switch (code) { case "SOIL_MOISTURE", "WATER_LEVEL" -> "%"; case "AIR_TEMPERATURE" -> "°C"; case "AIR_HUMIDITY" -> "%RH"; case "LIGHT" -> "lux"; case "CO2" -> "ppm"; case "PH" -> "pH"; default -> ""; }; }

    private List<Map<String, Object>> defaultRules() {
        return List.of(
                new LinkedHashMap<>(Map.of("code", "WATER_DEFICIT", "metric", "SOIL_MOISTURE", "operator", "LT", "threshold", 25, "durationMinutes", 5, "hysteresis", 2, "cooldownMinutes", 120)),
                new LinkedHashMap<>(Map.of("code", "HEAT_STRESS", "metric", "AIR_TEMPERATURE", "operator", "GT", "threshold", 35, "durationMinutes", 10, "hysteresis", 1, "cooldownMinutes", 60)),
                new LinkedHashMap<>(Map.of("code", "COLD_STRESS", "metric", "AIR_TEMPERATURE", "operator", "LT", "threshold", 16, "durationMinutes", 10, "hysteresis", 1, "cooldownMinutes", 60)));
    }

    private Map<String, Object> defaultPrescriptionConstraints() { return new LinkedHashMap<>(Map.of("maxDurationSeconds", 900, "cooldownMinutes", 120, "maxDailyWaterLitres", 5000)); }
    private Map<String, Object> defaultForecastProfile() { return new LinkedHashMap<>(Map.of("algorithm", "robust-trend-v1", "horizonsMinutes", List.of(60, 120, 240), "minValidSamples", 6, "maxStalenessSeconds", 120)); }
    private Map<String, Object> defaultScenarios() { return new LinkedHashMap<>(Map.of("normal", Map.of("quality", "GOOD", "expected", "stable"), "drought", Map.of("quality", "GOOD", "expected", "soil_moisture_decline"), "heavy-rain", Map.of("quality", "GOOD", "expected", "soil_moisture_rise"), "sensor-drift", Map.of("quality", "DEGRADED", "expected", "quality_gate"), "device-offline", Map.of("quality", "BAD", "expected", "device_gate"))); }

    Map<String, Object> require(String cropCode, String version) {
        return packs.stream()
                .filter(pack -> cropCode != null && cropCode.equalsIgnoreCase(Jsons.text(pack, "cropCode", "")))
                .filter(pack -> version == null || version.isBlank() || version.equals(Jsons.text(pack, "version", "")))
                .findFirst()
                .map(pack -> Jsons.copy(mapper, pack))
                .orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "CROP_PACK_NOT_FOUND", "没有找到该作物对应的 Crop Pack"));
    }

    Map<String, Object> findOrDefault(String cropCode, String version) {
        if (cropCode != null && !cropCode.isBlank()) {
            try {
                return require(cropCode, version);
            } catch (ApiException ignored) {
                // Prefer the latest pack for the same crop when a stale
                // cropPackVersion is still stored on plots/batches.
                if (version != null && !version.isBlank()) {
                    try {
                        return require(cropCode, null);
                    } catch (ApiException ignoredAgain) {
                        // Unknown demonstration crops fall back below.
                    }
                }
            }
        }
        if (packs.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CROP_PACK_NOT_FOUND", "没有可用的 Crop Pack");
        }
        return Jsons.copy(mapper, packs.get(0));
    }

    Map<String, Object> resolve(String cropCode, String version, String stageCode) {
        Map<String, Object> pack = findOrDefault(cropCode, version);
        Map<String, Object> stage = resolveStage(pack, stageCode);
        boolean stageMatched = stageCode == null || stageCode.isBlank()
                || Jsons.text(stage, "code", "").equalsIgnoreCase(stageCode);
        Map<String, Object> target = Jsons.map(mapper, stage.get("target"));
        List<Map<String, Object>> effectiveRules = effectiveRules(pack, stage, target);
        Map<String, Object> forecastProfile = Jsons.map(mapper, pack.get("forecastProfile"));
        Map<String, Object> healthProfile = Jsons.map(mapper, pack.get("healthProfile"));
        Map<String, Object> resolved = new LinkedHashMap<>();
        resolved.put("cropCode", pack.get("cropCode"));
        resolved.put("cropPackVersion", pack.get("version"));
        resolved.put("ruleVersion", Jsons.text(pack, "ruleVersion", "rule-1.0.0"));
        resolved.put("knowledgeVersion", Jsons.text(pack, "knowledgeVersion", "kb-1.0.0"));
        resolved.put("agentVersion", "rules-agent-1.0");
        resolved.put("stageCode", Jsons.text(stage, "code", ""));
        resolved.put("stageLabel", Jsons.text(stage, "label", STAGE_LABELS.getOrDefault(Jsons.text(stage, "code", ""), "")));
        resolved.put("stageMatched", stageMatched);
        resolved.put("stage", stage);
        resolved.put("target", target);
        resolved.put("effectiveRules", effectiveRules);
        resolved.put("forecastProfile", forecastProfile);
        resolved.put("healthProfile", healthProfile);
        resolved.put("prescriptionConstraints", pack.get("prescriptionConstraints"));
        resolved.put("metrics", pack.get("metrics"));
        resolved.put("identity", pack.get("identity"));
        resolved.put("pack", pack);
        resolved.put("parameterResolution", List.of("SYSTEM_DEFAULT", "CROP_PACK", "STAGE"));
        return resolved;
    }

    List<Map<String, Object>> manualIndex() {
        List<Map<String, Object>> index = new ArrayList<>();
        for (Map<String, Object> pack : all()) {
            Map<String, Object> identity = Jsons.map(mapper, pack.get("identity"));
            List<Map<String, Object>> stages = sortedStages(pack);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("cropCode", pack.get("cropCode"));
            item.put("version", pack.get("version"));
            item.put("ruleVersion", pack.get("ruleVersion"));
            item.put("knowledgeVersion", pack.get("knowledgeVersion"));
            item.put("name", identity.get("name"));
            item.put("variety", identity.get("variety"));
            item.put("region", identity.get("region"));
            item.put("environment", identity.get("environment"));
            item.put("stageCount", stages.size());
            item.put("stages", stages.stream().map(stage -> Map.of(
                    "code", Jsons.text(stage, "code", ""),
                    "label", Jsons.text(stage, "label", ""),
                    "sequence", Jsons.whole(stage, "sequence", 0)
            )).toList());
            index.add(item);
        }
        return index;
    }

    Map<String, Object> handbook(String cropCode, String stageCode) {
        require(cropCode, null);
        Map<String, Object> resolved = resolve(cropCode, null, stageCode);
        if (stageCode != null && !stageCode.isBlank() && !Jsons.bool(resolved, "stageMatched", true)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "CROP_STAGE_NOT_FOUND", "该作物没有对应的生长阶段");
        }
        Map<String, Object> pack = Jsons.map(mapper, resolved.get("pack"));
        Map<String, Object> stage = Jsons.map(mapper, resolved.get("stage"));
        Map<String, Object> identity = Jsons.map(mapper, pack.get("identity"));
        Map<String, Object> knowledge = Jsons.map(mapper, pack.get("knowledge"));
        List<String> stageKnowledge = knowledgeLines(pack, Jsons.text(stage, "code", ""));
        List<Map<String, Object>> knowledgeDocs = Jsons.maps(mapper, knowledge.get("docs"));
        Map<String, Object> handbook = new LinkedHashMap<>();
        handbook.put("cropCode", pack.get("cropCode"));
        handbook.put("version", pack.get("version"));
        handbook.put("ruleVersion", resolved.get("ruleVersion"));
        handbook.put("knowledgeVersion", resolved.get("knowledgeVersion"));
        handbook.put("identity", identity);
        handbook.put("stages", sortedStages(pack));
        handbook.put("stage", stage);
        handbook.put("envMetrics", envMetrics(pack, stage));
        handbook.put("guideParagraphs", guideParagraphs(pack, stage, Jsons.maps(mapper, resolved.get("effectiveRules")), stageKnowledge));
        handbook.put("rules", resolved.get("effectiveRules"));
        handbook.put("riskFocus", stage.get("riskFocus"));
        handbook.put("taskTemplates", stage.get("taskTemplates"));
        Map<String, Object> handbookKnowledge = new LinkedHashMap<>();
        handbookKnowledge.put("documents", knowledge.getOrDefault("documents", List.of()));
        handbookKnowledge.put("docs", knowledgeDocs);
        handbookKnowledge.put("fallback", knowledge.getOrDefault("fallback", List.of()));
        handbookKnowledge.put("content", stageKnowledge);
        handbookKnowledge.put("evidenceScope", "作物：" + identity.getOrDefault("name", pack.get("cropCode"))
                + "，阶段：" + Jsons.text(stage, "label", Jsons.text(stage, "code", ""))
                + "，地区：" + identity.getOrDefault("region", "本地")
                + "，知识版本：" + resolved.get("knowledgeVersion"));
        handbook.put("knowledge", handbookKnowledge);
        handbook.put("provenance", "DERIVED");
        handbook.put("sourceMode", "CROP_PACK");
        return handbook;
    }

    Map<String, Object> scoreHealth(Map<String, Object> resolved,
                                    Map<String, Object> latestMetrics,
                                    Map<String, Object> device,
                                    String riskLevel) {
        Map<String, Object> healthProfile = Jsons.map(mapper, resolved.get("healthProfile"));
        Map<String, Object> target = Jsons.map(mapper, resolved.get("target"));
        Map<String, Object> metricWeights = Jsons.map(mapper, healthProfile.get("metricWeights"));
        if (metricWeights.isEmpty()) metricWeights = new LinkedHashMap<>(DEFAULT_METRIC_WEIGHTS);
        List<Map<String, Object>> metrics = Jsons.maps(mapper, resolved.get("metrics"));
        Map<String, Map<String, Object>> metricByCode = new LinkedHashMap<>();
        for (Map<String, Object> metric : metrics) metricByCode.put(Jsons.text(metric, "code", ""), metric);

        double weightedTotal = 0;
        double weightTotal = 0;
        double requiredWeight = 0;
        List<String> missing = new ArrayList<>();
        List<Map<String, Object>> metricScores = new ArrayList<>();
        for (Map.Entry<String, Object> entry : metricWeights.entrySet()) {
            String code = entry.getKey();
            double weight = entry.getValue() instanceof Number n ? n.doubleValue() : DEFAULT_METRIC_WEIGHTS.getOrDefault(code, 0.0);
            if (weight <= 0) continue;
            Map<String, Object> profile = metricByCode.getOrDefault(code, Map.of());
            String availability = Jsons.text(profile, "availability", "SUPPORTED").toUpperCase(Locale.ROOT);
            if ("UNAVAILABLE".equals(availability)) continue;
            if ("SUPPORTED".equals(availability)) requiredWeight += weight;
            Map<String, Object> sample = latestMetrics.get(code) instanceof Map<?, ?> m ? Jsons.map(mapper, m) : Map.of();
            if (sample.isEmpty()) {
                if ("SUPPORTED".equals(availability)) missing.add(code);
                continue;
            }
            double alignment = metricAlignment(code, Jsons.number(sample, "value", Double.NaN), target);
            String quality = Jsons.text(Jsons.map(mapper, sample.get("quality")), "status", "GOOD").toUpperCase(Locale.ROOT);
            double qualityFactor = "BAD".equals(quality) ? 0.40 : "DEGRADED".equals(quality) ? 0.70 : 1.0;
            double score = clamp(alignment * qualityFactor);
            weightedTotal += score * weight;
            weightTotal += weight;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("code", code);
            row.put("score", round(score));
            row.put("weight", weight);
            row.put("quality", quality);
            row.put("availability", availability);
            metricScores.add(row);
        }
        double metricScore = weightTotal > 0 ? weightedTotal / weightTotal : 0.38;
        double completeness = requiredWeight > 0 ? Math.min(1.0, weightTotal / requiredWeight) : (weightTotal > 0 ? 1.0 : 0);
        double completenessPenalty = (1 - completeness) * 0.12;
        double deviceScore = deviceHealth(device);
        String riskKey = riskLevel == null || riskLevel.isBlank() ? "UNKNOWN" : riskLevel.toUpperCase(Locale.ROOT);
        double riskScore = RISK_SCORES.getOrDefault(riskKey, RISK_SCORES.get("UNKNOWN"));
        double metricWeight = Jsons.number(healthProfile, "metricWeight", 0.68);
        double deviceWeight = Jsons.number(healthProfile, "deviceWeight", 0.14);
        double riskWeight = Jsons.number(healthProfile, "riskWeight", 0.18);
        double score = clamp(metricScore * metricWeight + deviceScore * deviceWeight + riskScore * riskWeight - completenessPenalty);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("score", round(score));
        result.put("level", healthLevel(score));
        result.put("metricScore", round(metricScore));
        result.put("deviceScore", round(deviceScore));
        result.put("riskScore", round(riskScore));
        result.put("completeness", round(completeness));
        result.put("missingMetrics", missing);
        result.put("metrics", metricScores);
        result.put("algorithmVersion", Jsons.text(healthProfile, "algorithm", "crop-stage-health-v1"));
        result.put("cropCode", resolved.get("cropCode"));
        result.put("stageCode", resolved.get("stageCode"));
        result.put("cropPackVersion", resolved.get("cropPackVersion"));
        result.put("provenance", "DERIVED");
        result.put("sourceMode", "SIMULATION");
        return result;
    }

    Map<String, Object> rule(Map<String, Object> resolved, String code) {
        return Jsons.maps(mapper, resolved.get("effectiveRules")).stream()
                .filter(rule -> code.equalsIgnoreCase(Jsons.text(rule, "code", "")))
                .findFirst()
                .orElse(Map.of());
    }

    double threshold(Map<String, Object> resolved, String ruleCode, double fallback) {
        Map<String, Object> matched = rule(resolved, ruleCode);
        return Jsons.number(matched, "threshold", fallback);
    }

    double irrigationTarget(Map<String, Object> resolved) {
        Map<String, Object> target = Jsons.map(mapper, resolved.get("target"));
        double high = Jsons.number(target, "soilMoistureHigh", Double.NaN);
        double low = Jsons.number(target, "soilMoistureLow", Double.NaN);
        if (!Double.isNaN(high) && !Double.isNaN(low)) return round((low + high) / 2.0);
        if (!Double.isNaN(high)) return high;
        return 30;
    }

    String knowledgeSnippet(Map<String, Object> resolved) {
        Map<String, Object> pack = Jsons.map(mapper, resolved.get("pack"));
        List<String> lines = knowledgeLines(pack, Jsons.text(resolved, "stageCode", ""));
        if (lines.isEmpty()) return "";
        String text = String.join("\n", lines);
        return text.length() > 1800 ? text.substring(0, 1800) + "…" : text;
    }

    String knowledgeSource(Map<String, Object> resolved) {
        Map<String, Object> stage = Jsons.map(mapper, resolved.get("stage"));
        String ref = Jsons.text(stage, "knowledgeRef", "");
        if (!ref.isBlank()) return "crop-packs/" + resolved.get("cropCode") + "/" + ref;
        return "crop-packs/" + resolved.get("cropCode") + "/knowledge/irrigation.md";
    }

    private void enrichPack(Map<String, Object> pack, PathMatchingResourcePatternResolver resolver) {
        pack.putIfAbsent("status", "ACTIVE");
        pack.putIfAbsent("ruleVersion", "rule-1.0.0");
        pack.putIfAbsent("knowledgeVersion", "kb-1.0.0");
        Map<String, Object> identity = Jsons.map(mapper, pack.get("identity"));
        identity.putIfAbsent("environment", "greenhouse");
        pack.put("identity", identity);
        List<Map<String, Object>> stages = Jsons.maps(mapper, pack.get("stages"));
        for (Map<String, Object> stage : stages) {
            String code = Jsons.text(stage, "code", "");
            stage.putIfAbsent("label", STAGE_LABELS.getOrDefault(code, code));
            if (!(stage.get("taskTemplates") instanceof List<?>)) stage.put("taskTemplates", List.of());
            if (!(stage.get("riskFocus") instanceof List<?>)) stage.put("riskFocus", List.of());
        }
        pack.put("stages", stages);
        List<Map<String, Object>> metrics = Jsons.maps(mapper, pack.get("metrics"));
        for (Map<String, Object> metric : metrics) {
            metric.putIfAbsent("label", METRIC_LABELS.getOrDefault(Jsons.text(metric, "code", ""), Jsons.text(metric, "code", "")));
        }
        pack.put("metrics", metrics);
        if (!(pack.get("healthProfile") instanceof Map<?, ?>)) {
            pack.put("healthProfile", defaultHealthProfile());
        }
        Map<String, Object> knowledge = Jsons.map(mapper, pack.get("knowledge"));
        Map<String, String> documents = loadKnowledgeDocuments(Jsons.text(pack, "cropCode", ""), resolver);
        knowledge.putIfAbsent("fallback", List.of("plot", "region", "stage", "crop", "general"));
        List<Map<String, Object>> existingDocs = Jsons.maps(mapper, knowledge.get("docs"));
        List<Map<String, Object>> catalogDocs = existingDocs.isEmpty()
                ? knowledgeDocuments(Jsons.text(pack, "cropCode", ""), documents, stages)
                : existingDocs;
        if (!catalogDocs.isEmpty()) knowledge.put("docs", catalogDocs);
        knowledge.put("documentSources", documents.keySet().stream().map(key -> "crop-packs/" + Jsons.text(pack, "cropCode", "") + "/knowledge/" + key + ".md").toList());
        Map<String, Object> byStage = new LinkedHashMap<>();
        if (!documents.isEmpty()) byStage.putAll(documents);
        if (!catalogDocs.isEmpty()) {
            for (Map<String, Object> doc : catalogDocs) {
                String stageCode = Jsons.text(doc, "stageCode", "");
                if (stageCode.isBlank()) stageCode = inferStageFromSource(Jsons.text(doc, "source", ""), stages);
                if (!stageCode.isBlank() && !Jsons.text(doc, "content", "").isBlank()) byStage.put(stageCode, Jsons.text(doc, "content", ""));
            }
        }
        knowledge.put("byStage", byStage);
        String fallbackStage = stages.isEmpty() ? "" : Jsons.text(stages.get(stages.size() - 1), "code", "fruiting");
        List<String> catalogContent = documentLines(Jsons.text(byStage, fallbackStage, Jsons.text(byStage, "irrigation", "")));
        if (catalogContent.isEmpty() && !catalogDocs.isEmpty()) {
            catalogContent = documentLines(Jsons.text(catalogDocs.get(0), "content", ""));
        }
        knowledge.put("content", catalogContent);
        pack.put("knowledge", knowledge);
        Map<String, Object> lastTarget = stages.isEmpty() ? Map.of() : Jsons.map(mapper, stages.get(stages.size() - 1).get("target"));
        pack.put("rules", overlayRuleThresholds(Jsons.maps(mapper, pack.get("rules")), lastTarget));
    }

    private Map<String, String> loadKnowledgeDocuments(String cropCode, PathMatchingResourcePatternResolver resolver) {
        Map<String, String> documents = new LinkedHashMap<>();
        try {
            Resource[] resources = resolver.getResources("classpath*:/crop-packs/" + cropCode + "/knowledge/*.md");
            for (Resource resource : resources) {
                String filename = resource.getFilename() == null ? "" : resource.getFilename();
                String key = filename.replace(".md", "");
                try (InputStream stream = resource.getInputStream()) {
                    documents.put(key, new String(stream.readAllBytes(), StandardCharsets.UTF_8));
                }
            }
        } catch (Exception ignored) {
            return documents;
        }
        return documents;
    }

    private List<Map<String, Object>> knowledgeDocuments(String cropCode,
                                                          Map<String, String> documents,
                                                          List<Map<String, Object>> stages) {
        List<Map<String, Object>> result = new ArrayList<>();
        int index = 0;
        for (Map.Entry<String, String> entry : documents.entrySet()) {
            String key = entry.getKey();
            String markdown = entry.getValue() == null ? "" : entry.getValue();
            String title = firstMarkdownHeading(markdown);
            if (title.isBlank()) title = STAGE_LABELS.getOrDefault(key, key);
            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("id", cropCode + "-" + key);
            doc.put("title", title);
            doc.put("content", cleanDocumentText(markdown));
            doc.put("markdown", markdown);
            doc.put("source", "crop-packs/" + cropCode + "/knowledge/" + key + ".md");
            String stageCode = inferStageFromSource(key, stages);
            if (!stageCode.isBlank()) doc.put("stageCode", stageCode);
            result.add(doc);
            index++;
        }
        return result;
    }

    private String firstMarkdownHeading(String markdown) {
        if (markdown == null) return "";
        for (String line : markdown.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.matches("^#{1,6}\\s+.+")) return trimmed.replaceFirst("^#{1,6}\\s+", "").trim();
        }
        return "";
    }

    private Map<String, Object> resolveStage(Map<String, Object> pack, String stageCode) {
        List<Map<String, Object>> stages = sortedStages(pack);
        if (stages.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CROP_PACK_STAGES_MISSING", "Crop Pack 没有可用阶段");
        }
        if (stageCode != null && !stageCode.isBlank()) {
            for (Map<String, Object> stage : stages) {
                if (stageCode.equalsIgnoreCase(Jsons.text(stage, "code", ""))) return Jsons.copy(mapper, stage);
            }
        }
        return Jsons.copy(mapper, stages.get(stages.size() - 1));
    }

    private List<Map<String, Object>> sortedStages(Map<String, Object> pack) {
        return Jsons.maps(mapper, pack.get("stages")).stream()
                .sorted(Comparator.comparingLong(stage -> Jsons.whole(stage, "sequence", Long.MAX_VALUE)))
                .toList();
    }

    private List<Map<String, Object>> effectiveRules(Map<String, Object> pack, Map<String, Object> stage, Map<String, Object> target) {
        Map<String, Map<String, Object>> merged = new LinkedHashMap<>();
        for (Map<String, Object> rule : Jsons.maps(mapper, pack.get("rules"))) {
            merged.put(Jsons.text(rule, "code", ""), Jsons.copy(mapper, rule));
        }
        for (Map<String, Object> rule : Jsons.maps(mapper, stage.get("rules"))) {
            merged.put(Jsons.text(rule, "code", ""), Jsons.copy(mapper, rule));
        }
        List<Map<String, Object>> rules = overlayRuleThresholds(new ArrayList<>(merged.values()), target);
        String stageCode = Jsons.text(stage, "code", "");
        for (Map<String, Object> rule : rules) {
            rule.put("stageCode", stageCode);
            rule.putIfAbsent("ruleVersion", Jsons.text(pack, "ruleVersion", "rule-1.0.0"));
        }
        return rules;
    }

    private List<Map<String, Object>> overlayRuleThresholds(List<Map<String, Object>> rules, Map<String, Object> target) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> source : rules) {
            Map<String, Object> rule = Jsons.copy(mapper, source);
            String code = Jsons.text(rule, "code", "");
            if ("WATER_DEFICIT".equals(code) && target.containsKey("soilMoistureLow")) {
                rule.put("threshold", Jsons.number(target, "soilMoistureLow", 20));
            } else if ("HEAT_STRESS".equals(code) && target.containsKey("airTemperatureHigh")) {
                rule.put("threshold", Jsons.number(target, "airTemperatureHigh", 35));
            } else if ("COLD_STRESS".equals(code) && target.containsKey("airTemperatureLow")) {
                rule.put("threshold", Jsons.number(target, "airTemperatureLow", 18));
            } else if ("OVER_WET".equals(code) && target.containsKey("soilMoistureHigh")) {
                rule.put("threshold", Jsons.number(target, "soilMoistureHigh", 50));
            }
            result.add(rule);
        }
        return result;
    }

    private List<Map<String, Object>> envMetrics(Map<String, Object> pack, Map<String, Object> stage) {
        Map<String, Object> target = Jsons.map(mapper, stage.get("target"));
        List<Map<String, Object>> items = new ArrayList<>();
        items.add(envMetric("SOIL_MOISTURE", pack,
                rangeText(target.get("soilMoistureLow"), target.get("soilMoistureHigh")),
                "%", "SUPPORTED", "阶段核心管控指标"));
        items.add(envMetric("AIR_TEMPERATURE", pack,
                rangeText(target.get("airTemperatureLow"), target.get("airTemperatureHigh")),
                "°C", "SUPPORTED", "阶段核心管控指标"));
        if (target.containsKey("airHumidityLow") || target.containsKey("airHumidityHigh")) {
            items.add(envMetric("AIR_HUMIDITY", pack,
                    rangeText(target.get("airHumidityLow"), target.get("airHumidityHigh")),
                    "%RH", "SUPPORTED", "阶段环境湿度目标"));
        }
        addStageTargetMetric(items, pack, target, "LIGHT", "lightLow", "lightHigh", "lux", "阶段模型参考区间");
        addStageTargetMetric(items, pack, target, "CO2", "co2Low", "co2High", "ppm", "阶段模型参考区间");
        addStageTargetMetric(items, pack, target, "PH", "phLow", "phHigh", "pH", "阶段模型参考区间");
        addStageTargetMetric(items, pack, target, "WATER_LEVEL", "waterLevelLow", "waterLevelHigh", "%", "可监测指标");
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        items.forEach(item -> seen.add(Jsons.text(item, "code", "")));
        for (Map<String, Object> metric : Jsons.maps(mapper, pack.get("metrics"))) {
            String code = Jsons.text(metric, "code", "");
            if (seen.contains(code)) continue;
            Map<String, Object> range = Jsons.map(mapper, metric.get("range"));
            String availability = Jsons.text(metric, "availability", "SIMULATION_ONLY");
            items.add(envMetric(code, pack,
                    rangeText(range.get("min"), range.get("max")),
                    Jsons.text(metric, "unit", ""),
                    availability,
                    AVAILABILITY_NOTES.getOrDefault(availability, "模型参考区间")));
        }
        return items;
    }

    private void addStageTargetMetric(List<Map<String, Object>> items, Map<String, Object> pack,
                                      Map<String, Object> target, String code, String lowKey, String highKey,
                                      String unit, String note) {
        if (!target.containsKey(lowKey) && !target.containsKey(highKey)) return;
        Map<String, Object> profile = metricProfile(pack, code);
        String availability = Jsons.text(profile, "availability", "SIMULATION_ONLY");
        items.add(envMetric(code, pack, rangeText(target.get(lowKey), target.get(highKey)), unit, availability, note));
    }

    private Map<String, Object> envMetric(String code, Map<String, Object> pack, String range, String unit,
                                          String availability, String note) {
        Map<String, Object> metric = metricProfile(pack, code);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("code", code);
        item.put("label", Jsons.text(metric, "label", METRIC_LABELS.getOrDefault(code, code)));
        item.put("range", range);
        item.put("unit", unit.isBlank() ? Jsons.text(metric, "unit", "") : unit);
        item.put("availability", Jsons.text(metric, "availability", availability));
        item.put("note", note);
        return item;
    }

    private Map<String, Object> metricProfile(Map<String, Object> pack, String code) {
        return Jsons.maps(mapper, pack.get("metrics")).stream()
                .filter(metric -> code.equals(Jsons.text(metric, "code", "")))
                .findFirst()
                .orElse(Map.of());
    }

    private List<String> guideParagraphs(Map<String, Object> pack, Map<String, Object> stage,
                                         List<Map<String, Object>> rules, List<String> knowledgeLines) {
        Map<String, Object> identity = Jsons.map(mapper, pack.get("identity"));
        Map<String, Object> target = Jsons.map(mapper, stage.get("target"));
        String name = Jsons.text(identity, "name", Jsons.text(pack, "cropCode", ""));
        String region = Jsons.text(identity, "region", "本地");
        String label = Jsons.text(stage, "label", Jsons.text(stage, "code", ""));
        List<String> lines = new ArrayList<>();
        lines.add(name + "（" + region + "）处于「" + label + "」时，应优先保障根区水热环境稳定，避免忽干忽湿或温度骤变。");
        lines.add("适宜土壤湿度 " + target.get("soilMoistureLow") + "%~" + target.get("soilMoistureHigh")
                + "%，空气温度 " + target.get("airTemperatureLow") + "~" + target.get("airTemperatureHigh") + "°C。");
        if (target.containsKey("airHumidityLow") || target.containsKey("airHumidityHigh")) {
            lines.add("适宜空气湿度 " + target.get("airHumidityLow") + "%~" + target.get("airHumidityHigh") + "%RH。");
        }
        if (target.containsKey("lightLow") || target.containsKey("lightHigh")) {
            lines.add("本阶段光照参考 " + target.get("lightLow") + "~" + target.get("lightHigh")
                    + " lux，CO₂ 参考 " + target.getOrDefault("co2Low", "—") + "~" + target.getOrDefault("co2High", "—")
                    + " ppm，土壤酸碱度参考 pH " + target.getOrDefault("phLow", "—") + "~" + target.getOrDefault("phHigh", "—")
                    + "；光照/CO₂/pH 当前为演示参考，不作为可执行处方输入。");
        }
        List<String> risks = Jsons.strings(stage.get("riskFocus"));
        if (!risks.isEmpty()) {
            lines.add("本阶段重点防范：" + String.join("、", risks.stream().map(code -> RISK_LABELS.getOrDefault(code, code)).toList()) + "。");
        }
        List<Map<String, Object>> templates = Jsons.maps(mapper, stage.get("taskTemplates"));
        if (!templates.isEmpty()) {
            String tasks = String.join("；", templates.stream().map(task -> {
                String action = TASK_LABELS.getOrDefault(Jsons.text(task, "actionType", ""), Jsons.text(task, "actionType", ""));
                return action + "（每 " + Jsons.whole(task, "intervalDays", 1) + " 天，优先级 " + Jsons.text(task, "priority", "MEDIUM") + "）";
            }).toList());
            lines.add("建议农务节奏：" + tasks + "。");
        }
        if (!rules.isEmpty()) {
            String notes = String.join("；", rules.stream().map(rule -> {
                String op = "LT".equals(Jsons.text(rule, "operator", "")) ? "低于" : "高于";
                return Jsons.text(rule, "code", "") + "：" + Jsons.text(rule, "metric", "") + " " + op + " "
                        + rule.get("threshold") + " 且持续 " + Jsons.whole(rule, "durationMinutes", 0) + " 分钟需重点关注";
            }).toList());
            lines.add("规则参考：" + notes + "。");
        }
        knowledgeLines.stream()
                .filter(line -> !line.isBlank() && !line.startsWith("#") && !line.startsWith(">") && !line.startsWith("证据范围"))
                .limit(5)
                .forEach(lines::add);
        return lines;
    }

    private List<String> knowledgeLines(Map<String, Object> pack, String stageCode) {
        Map<String, Object> knowledge = Jsons.map(mapper, pack.get("knowledge"));
        Map<String, Object> byStage = Jsons.map(mapper, knowledge.get("byStage"));
        String text = Jsons.text(byStage, stageCode, "");
        if (text.isBlank()) text = Jsons.text(byStage, "irrigation", "");
        if (text.isBlank()) {
            for (Map<String, Object> doc : Jsons.maps(mapper, knowledge.get("docs"))) {
                String docStage = Jsons.text(doc, "stageCode", "");
                if (stageCode.isBlank() || docStage.isBlank() || stageCode.equalsIgnoreCase(docStage)) {
                    text = Jsons.text(doc, "content", "");
                    if (!text.isBlank()) break;
                }
            }
        }
        return documentLines(text);
    }

    private List<String> documentLines(String text) {
        if (text == null || text.isBlank()) return List.of();
        List<String> lines = new ArrayList<>();
        for (String line : text.split("\\R")) {
            String trimmed = line.trim();
            if (!trimmed.isBlank()) lines.add(trimmed);
        }
        return lines;
    }

    private Map<String, Object> defaultHealthProfile() {
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("algorithm", "crop-stage-health-v1");
        profile.put("metricWeight", 0.68);
        profile.put("deviceWeight", 0.14);
        profile.put("riskWeight", 0.18);
        profile.put("metricWeights", new LinkedHashMap<>(DEFAULT_METRIC_WEIGHTS));
        return profile;
    }

    private double metricAlignment(String code, double value, Map<String, Object> target) {
        if (Double.isNaN(value)) return 0.38;
        double[] band = targetBand(code, target);
        if (band == null) {
            if ("WATER_LEVEL".equals(code)) band = new double[]{20, 90};
            else return 0.75;
        }
        double low = band[0];
        double high = band[1];
        double half = Math.max((high - low) / 2.0, 0.001);
        double midpoint = (low + high) / 2.0;
        double distance = Math.abs(value - midpoint) / half;
        if (distance <= 1) return 0.72 + (1 - distance) * 0.22;
        return Math.max(0.12, 0.72 - Math.min(1.8, distance - 1) * 0.34);
    }

    private double[] targetBand(String code, Map<String, Object> target) {
        return switch (code) {
            case "SOIL_MOISTURE" -> numbers(target, "soilMoistureLow", "soilMoistureHigh");
            case "AIR_TEMPERATURE" -> numbers(target, "airTemperatureLow", "airTemperatureHigh");
            case "AIR_HUMIDITY" -> numbers(target, "airHumidityLow", "airHumidityHigh");
            case "LIGHT" -> numbers(target, "lightLow", "lightHigh");
            case "CO2" -> numbers(target, "co2Low", "co2High");
            case "PH" -> numbers(target, "phLow", "phHigh");
            case "WATER_LEVEL" -> numbers(target, "waterLevelLow", "waterLevelHigh");
            default -> null;
        };
    }

    private double[] numbers(Map<String, Object> target, String lowKey, String highKey) {
        double low = Jsons.number(target, lowKey, Double.NaN);
        double high = Jsons.number(target, highKey, Double.NaN);
        if (Double.isNaN(low) || Double.isNaN(high)) return null;
        return new double[]{low, high};
    }

    private double deviceHealth(Map<String, Object> device) {
        String status = Jsons.text(device, "status", "UNKNOWN").toUpperCase(Locale.ROOT);
        double base = switch (status) {
            case "ONLINE" -> 0.94;
            case "DEGRADED" -> 0.62;
            case "OFFLINE", "UNBOUND" -> 0.18;
            default -> 0.45;
        };
        Instant lastSeen = Jsons.instant(device.get("lastSeen"), null);
        double freshness = 0.62;
        if (lastSeen != null) {
            long seconds = Math.max(0, Duration.between(lastSeen, Instant.now()).getSeconds());
            if (seconds <= 60) freshness = 1.0;
            else if (seconds <= 300) freshness = 0.92;
            else if (seconds <= 900) freshness = 0.80;
            else if (seconds <= 3600) freshness = 0.62;
            else freshness = 0.40;
        }
        return clamp(base * freshness);
    }

    private String healthLevel(double score) {
        if (score < 0.55) return "HIGH";
        if (score < 0.72) return "ATTENTION";
        if (score < 0.86) return "WATCH";
        return "GOOD";
    }

    private String rangeText(Object low, Object high) {
        if (low == null && high == null) return "—";
        return String.valueOf(low == null ? "—" : low) + "~" + String.valueOf(high == null ? "—" : high);
    }

    private double clamp(double value) {
        if (Double.isNaN(value)) return 0.05;
        return Math.max(0.05, Math.min(0.98, value));
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
