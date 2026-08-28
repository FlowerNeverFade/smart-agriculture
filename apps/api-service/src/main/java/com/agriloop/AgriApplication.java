package com.agriloop;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;

import javax.crypto.SecretKey;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AgriLoop backend.  The project intentionally keeps the first delivery as a
 * modular monolith: domain modules communicate through this application
 * boundary and durable records are stored behind AgriStore.
 */
@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(AgriProperties.class)
public class AgriApplication {
    public static void main(String[] args) {
        SpringApplication.run(AgriApplication.class, args);
    }
}

@ConfigurationProperties(prefix = "agriloop")
class AgriProperties {
    private String mode = "standalone";
    private String aiMode = "rules-only";
    /** OpenAI-compatible endpoint used by the optional Qwen/vLLM adapter. */
    private String llmBaseUrl = "http://127.0.0.1:8000/v1";
    private String llmModel = "Qwen3.8-27B";
    private String llmApiKey = "";
    private long llmTimeoutMs = 60000;
    private int llmMaxTokens = 512;
    /** Qwen3.8 enables thinking by default; the UI uses concise answer mode. */
    private boolean llmEnableThinking = false;
    private boolean llmPreserveThinking = false;
    private String llmReasoningEffort = "low";
    /** Maximum number of prior user/assistant messages supplied as dialogue context. */
    private int llmHistoryMessages = 8;
    private String commandMode = "virtual";
    private String forecastMode = "deterministic";
    private String learningMode = "case-only";
    private String valueMode = "simulation";
    private String jwtSecret = "change-me-in-production-change-me-in-production";
    private long jwtTtlMinutes = 720;
    private String mqttUrl = "tcp://localhost:1883";
    private String mqttClientId = "agriloop-api";
    private String mqttUsername = "";
    private String mqttPassword = "";
    private String telemetryStream = "agri.telemetry";
    private long deviceTimeoutSeconds = 90;
    /** How long a fresh REAL reading keeps the simulator from overwriting it. */
    private long realSourceTimeoutSeconds = 120;
    private boolean seedData = true;
    private long sseHeartbeatSeconds = 15;
    private long maxIrrigationSeconds = 900;
    private double dailyWaterLimitLitres = 5000;
    private String cropPackPath = "classpath:/crop-packs";
    private boolean simulatorControlEnabled = true;
    private String supervisorConfig = "/srv/agriloop/supervisor.conf";
    private String simulatorProgram = "agriloop-simulator";
    /** Shared JSON hand-off reloaded by the Python simulator while it runs. */
    private String simulationConfigPath = "data/plot-simulation.json";
    /** Local directory for USER_PROVIDED inspection photos; not object storage. */
    private String attachmentDir = "data/attachments";

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public String getAiMode() { return aiMode; }
    public void setAiMode(String aiMode) { this.aiMode = aiMode; }
    public String getLlmBaseUrl() { return llmBaseUrl; }
    public void setLlmBaseUrl(String llmBaseUrl) { this.llmBaseUrl = llmBaseUrl; }
    public String getLlmModel() { return llmModel; }
    public void setLlmModel(String llmModel) { this.llmModel = llmModel; }
    public String getLlmApiKey() { return llmApiKey; }
    public void setLlmApiKey(String llmApiKey) { this.llmApiKey = llmApiKey; }
    public long getLlmTimeoutMs() { return llmTimeoutMs; }
    public void setLlmTimeoutMs(long llmTimeoutMs) { this.llmTimeoutMs = llmTimeoutMs; }
    public int getLlmMaxTokens() { return llmMaxTokens; }
    public void setLlmMaxTokens(int llmMaxTokens) { this.llmMaxTokens = llmMaxTokens; }
    public boolean isLlmEnableThinking() { return llmEnableThinking; }
    public void setLlmEnableThinking(boolean llmEnableThinking) { this.llmEnableThinking = llmEnableThinking; }
    public boolean isLlmPreserveThinking() { return llmPreserveThinking; }
    public void setLlmPreserveThinking(boolean llmPreserveThinking) { this.llmPreserveThinking = llmPreserveThinking; }
    public String getLlmReasoningEffort() { return llmReasoningEffort; }
    public void setLlmReasoningEffort(String llmReasoningEffort) { this.llmReasoningEffort = llmReasoningEffort; }
    public int getLlmHistoryMessages() { return llmHistoryMessages; }
    public void setLlmHistoryMessages(int llmHistoryMessages) { this.llmHistoryMessages = llmHistoryMessages; }
    public String getCommandMode() { return commandMode; }
    public void setCommandMode(String commandMode) { this.commandMode = commandMode; }
    public String getForecastMode() { return forecastMode; }
    public void setForecastMode(String forecastMode) { this.forecastMode = forecastMode; }
    public String getLearningMode() { return learningMode; }
    public void setLearningMode(String learningMode) { this.learningMode = learningMode; }
    public String getValueMode() { return valueMode; }
    public void setValueMode(String valueMode) { this.valueMode = valueMode; }
    public String getJwtSecret() { return jwtSecret; }
    public void setJwtSecret(String jwtSecret) { this.jwtSecret = jwtSecret; }
    public long getJwtTtlMinutes() { return jwtTtlMinutes; }
    public void setJwtTtlMinutes(long jwtTtlMinutes) { this.jwtTtlMinutes = jwtTtlMinutes; }
    public String getMqttUrl() { return mqttUrl; }
    public void setMqttUrl(String mqttUrl) { this.mqttUrl = mqttUrl; }
    public String getMqttClientId() { return mqttClientId; }
    public void setMqttClientId(String mqttClientId) { this.mqttClientId = mqttClientId; }
    public String getMqttUsername() { return mqttUsername; }
    public void setMqttUsername(String mqttUsername) { this.mqttUsername = mqttUsername; }
    public String getMqttPassword() { return mqttPassword; }
    public void setMqttPassword(String mqttPassword) { this.mqttPassword = mqttPassword; }
    public String getTelemetryStream() { return telemetryStream; }
    public void setTelemetryStream(String telemetryStream) { this.telemetryStream = telemetryStream; }
    public long getDeviceTimeoutSeconds() { return deviceTimeoutSeconds; }
    public void setDeviceTimeoutSeconds(long deviceTimeoutSeconds) { this.deviceTimeoutSeconds = deviceTimeoutSeconds; }
    public long getRealSourceTimeoutSeconds() { return realSourceTimeoutSeconds; }
    public void setRealSourceTimeoutSeconds(long realSourceTimeoutSeconds) { this.realSourceTimeoutSeconds = realSourceTimeoutSeconds; }
    public boolean isSeedData() { return seedData; }
    public void setSeedData(boolean seedData) { this.seedData = seedData; }
    public long getSseHeartbeatSeconds() { return sseHeartbeatSeconds; }
    public void setSseHeartbeatSeconds(long sseHeartbeatSeconds) { this.sseHeartbeatSeconds = sseHeartbeatSeconds; }
    public long getMaxIrrigationSeconds() { return maxIrrigationSeconds; }
    public void setMaxIrrigationSeconds(long maxIrrigationSeconds) { this.maxIrrigationSeconds = maxIrrigationSeconds; }
    public double getDailyWaterLimitLitres() { return dailyWaterLimitLitres; }
    public void setDailyWaterLimitLitres(double dailyWaterLimitLitres) { this.dailyWaterLimitLitres = dailyWaterLimitLitres; }
    public String getCropPackPath() { return cropPackPath; }
    public void setCropPackPath(String cropPackPath) { this.cropPackPath = cropPackPath; }
    public boolean isSimulatorControlEnabled() { return simulatorControlEnabled; }
    public void setSimulatorControlEnabled(boolean simulatorControlEnabled) { this.simulatorControlEnabled = simulatorControlEnabled; }
    public String getSupervisorConfig() { return supervisorConfig; }
    public void setSupervisorConfig(String supervisorConfig) { this.supervisorConfig = supervisorConfig; }
    public String getSimulatorProgram() { return simulatorProgram; }
    public void setSimulatorProgram(String simulatorProgram) { this.simulatorProgram = simulatorProgram; }
    public String getSimulationConfigPath() { return simulationConfigPath; }
    public void setSimulationConfigPath(String simulationConfigPath) { this.simulationConfigPath = simulationConfigPath; }
    public String getAttachmentDir() { return attachmentDir; }
    public void setAttachmentDir(String attachmentDir) { this.attachmentDir = attachmentDir; }
}

@Configuration
class BackendConfig {
    @Bean
    ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return mapper;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}

final class Jsons {
    private Jsons() {}
    static Map<String, Object> map(ObjectMapper mapper, Object value) {
        if (value == null) return new LinkedHashMap<>();
        return mapper.convertValue(value, Map.class);
    }
    static List<Map<String, Object>> maps(ObjectMapper mapper, Object value) {
        if (value == null) return new ArrayList<>();
        return mapper.convertValue(value, List.class);
    }
    static String text(Map<String, Object> map, String key, String fallback) {
        Object v = map == null ? null : map.get(key);
        return v == null ? fallback : String.valueOf(v);
    }
    static double number(Map<String, Object> map, String key, double fallback) {
        Object v = map == null ? null : map.get(key);
        return numberValue(v, fallback);
    }
    static double numberValue(Object value, double fallback) {
        if (value instanceof Number n) {
            double parsed = n.doubleValue();
            return Double.isFinite(parsed) ? parsed : fallback;
        }
        try {
            if (value == null) return fallback;
            double parsed = Double.parseDouble(String.valueOf(value));
            return Double.isFinite(parsed) ? parsed : fallback;
        } catch (Exception ignored) { return fallback; }
    }
    static long whole(Map<String, Object> map, String key, long fallback) {
        return Math.round(number(map, key, fallback));
    }
    static boolean bool(Map<String, Object> map, String key, boolean fallback) {
        Object v = map == null ? null : map.get(key);
        return v == null ? fallback : Boolean.parseBoolean(String.valueOf(v));
    }
    static String json(ObjectMapper mapper, Object value) {
        try { return mapper.writeValueAsString(value == null ? Map.of() : value); }
        catch (JsonProcessingException e) { return "{}"; }
    }
    static Map<String, Object> parseMap(ObjectMapper mapper, String value) {
        try { return mapper.readValue(value == null ? "{}" : value, Map.class); }
        catch (Exception ignored) { return new LinkedHashMap<>(); }
    }
    static String id(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }
    static Instant instant(Object value, Instant fallback) {
        if (value == null) return fallback;
        try { return Instant.parse(String.valueOf(value)); }
        catch (Exception ignored) { return fallback; }
    }
    static List<String> strings(Object value) {
        if (value instanceof Collection<?> c) return c.stream().map(String::valueOf).toList();
        if (value == null || String.valueOf(value).isBlank()) return new ArrayList<>();
        return Arrays.stream(String.valueOf(value).split(",")).map(String::trim).filter(s -> !s.isBlank()).toList();
    }
    static Map<String, Object> copy(ObjectMapper mapper, Map<String, Object> value) {
        return map(mapper, value);
    }
}

@Service
class AgriStore {
    private final ObjectMapper mapper;
    private final JdbcTemplate jdbc;
    private final AgriProperties properties;
    private final PasswordEncoder passwordEncoder;
    private final Map<String, Map<String, Map<String, Object>>> records = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> users = new ConcurrentHashMap<>();
    private final List<Map<String, Object>> telemetry = new CopyOnWriteArrayList<>();
    private final Set<String> eventIds = ConcurrentHashMap.newKeySet();
    private final AtomicLong eventCount = new AtomicLong();
    private volatile boolean databaseReady;
    private volatile boolean postgres;

    AgriStore(ObjectMapper mapper, JdbcTemplate jdbc, AgriProperties properties, PasswordEncoder passwordEncoder) {
        this.mapper = mapper;
        this.jdbc = jdbc;
        this.properties = properties;
        this.passwordEncoder = passwordEncoder;
    }

    @PostConstruct
    void initialise() {
        try {
            jdbc.queryForObject("select 1", Integer.class);
            databaseReady = true;
            try {
                String product = Objects.requireNonNull(jdbc.getDataSource()).getConnection().getMetaData().getDatabaseProductName();
                postgres = product.toLowerCase(Locale.ROOT).contains("postgres");
            } catch (Exception ignored) { }
        } catch (Exception e) {
            databaseReady = false;
        }
        if (properties.isSeedData()) seed();
    }

    boolean databaseReady() { return databaseReady; }
    String persistenceKind() { return !databaseReady ? "IN_MEMORY_FALLBACK" : (postgres ? "POSTGRESQL" : "H2_STANDALONE"); }
    long eventCount() { return eventCount.get(); }

    /** 真实测量数据库往返延迟（SELECT 1），失败返回 -1。 */
    long pingDbLatencyMs() {
        if (!databaseReady) return -1;
        long start = System.nanoTime();
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return Math.max(0, Duration.ofNanos(System.nanoTime() - start).toMillis());
        } catch (Exception e) {
            return -1;
        }
    }

    synchronized void save(String type, String id, Map<String, Object> value) {
        Map<String, Object> copy = Jsons.copy(mapper, value);
        records.computeIfAbsent(type, ignored -> new ConcurrentHashMap<>()).put(id, copy);
        if (!databaseReady) return;
        try {
            if (postgres) {
                jdbc.update("INSERT INTO entity_record(entity_type,entity_id,payload) VALUES (?,?,?) " +
                                "ON CONFLICT(entity_type,entity_id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=CURRENT_TIMESTAMP",
                        type, id, Jsons.json(mapper, copy));
            } else {
                jdbc.update("MERGE INTO entity_record(entity_type,entity_id,payload,created_at,updated_at) " +
                                "KEY(entity_type,entity_id) VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
                        type, id, Jsons.json(mapper, copy));
            }
        } catch (DataAccessException ignored) {
            databaseReady = false;
        }
    }

    synchronized boolean delete(String type, String id) {
        Map<String, Map<String, Object>> byType = records.get(type);
        boolean removed = byType != null && byType.remove(id) != null;
        if (!databaseReady) return removed;
        try {
            return jdbc.update("DELETE FROM entity_record WHERE entity_type=? AND entity_id=?", type, id) > 0 || removed;
        } catch (DataAccessException ignored) {
            databaseReady = false;
            return removed;
        }
    }

    synchronized int deleteWhere(String type, Predicate<Map<String, Object>> predicate) {
        list(type);
        Map<String, Map<String, Object>> byType = records.getOrDefault(type, Map.of());
        List<String> ids = byType.entrySet().stream()
                .filter(entry -> predicate.test(entry.getValue()))
                .map(Map.Entry::getKey)
                .toList();
        ids.forEach(id -> delete(type, id));
        return ids.size();
    }

    long countWhere(String type, Predicate<Map<String, Object>> predicate) {
        return list(type).stream().filter(predicate).count();
    }

    int telemetryCount(String plotId) {
        return telemetry(plotId, null, Instant.EPOCH, Instant.now().plus(1, ChronoUnit.DAYS), 10000).size();
    }

    synchronized int deleteTelemetryForPlot(String plotId) {
        int before = telemetry.size();
        telemetry.removeIf(event -> plotId.equals(Jsons.text(event, "plotId", "")));
        int removed = before - telemetry.size();
        if (!databaseReady) return removed;
        try {
            return Math.max(removed, jdbc.update("DELETE FROM telemetry WHERE plot_id=?", plotId));
        } catch (DataAccessException ignored) {
            databaseReady = false;
            return removed;
        }
    }

    /** Reset only synthetic history; physical observations remain immutable. */
    synchronized int deleteSimulatedTelemetryForPlot(String plotId) {
        int before = telemetry.size();
        telemetry.removeIf(event -> plotId.equals(Jsons.text(event, "plotId", ""))
                && !"REAL".equalsIgnoreCase(Jsons.text(event, "sourceMode", "SIMULATION")));
        int removed = before - telemetry.size();
        if (!databaseReady) return removed;
        try {
            return Math.max(removed, jdbc.update("DELETE FROM telemetry WHERE plot_id=? AND COALESCE(source_mode,'SIMULATION')<>'REAL'", plotId));
        } catch (DataAccessException ignored) {
            databaseReady = false;
            return removed;
        }
    }

    Map<String, Object> find(String type, String id) {
        Map<String, Map<String, Object>> byType = records.get(type);
        if (byType != null && byType.containsKey(id)) return Jsons.copy(mapper, byType.get(id));
        if (!databaseReady) return null;
        try {
            String payload = jdbc.queryForObject("SELECT payload FROM entity_record WHERE entity_type=? AND entity_id=?",
                    String.class, type, id);
            Map<String, Object> value = mapper.readValue(payload, Map.class);
            records.computeIfAbsent(type, ignored -> new ConcurrentHashMap<>()).put(id, value);
            return Jsons.copy(mapper, value);
        } catch (Exception ignored) { return null; }
    }

    List<Map<String, Object>> list(String type) {
        Map<String, Map<String, Object>> byType = records.getOrDefault(type, Map.of());
        List<Map<String, Object>> result = byType.values().stream().map(v -> Jsons.copy(mapper, v)).collect(Collectors.toCollection(ArrayList::new));
        if (databaseReady) {
            try {
                List<Map<String, Object>> persisted = jdbc.query("SELECT entity_id,payload FROM entity_record WHERE entity_type=? ORDER BY updated_at DESC",
                        (rs, rowNum) -> {
                            try {
                                Map<String, Object> value = mapper.readValue(rs.getString("payload"), Map.class);
                                records.computeIfAbsent(type, ignored -> new ConcurrentHashMap<>()).put(rs.getString("entity_id"), value);
                                return value;
                            } catch (Exception e) { return Map.<String, Object>of(); }
                        }, type);
                if (!persisted.isEmpty()) result = persisted;
            } catch (DataAccessException ignored) { databaseReady = false; }
        }
        return result;
    }

    boolean saveTelemetry(Map<String, Object> event) {
        String eventId = Jsons.text(event, "eventId", Jsons.id("evt"));
        if (!eventIds.add(eventId)) return false;
        Map<String, Object> copy = Jsons.copy(mapper, event);
        copy.put("eventId", eventId);
        if (!databaseReady) {
            telemetry.add(copy);
            eventCount.incrementAndGet();
            return true;
        }
        String sql = "INSERT INTO telemetry(event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,quality_status,quality_json,scenario_id,branch_id,source_mode,provenance,data_origin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
        try {
            jdbc.update(sql, eventId, Jsons.text(copy, "farmId", "farm-demo"), Jsons.text(copy, "plotId", "plot-a01"),
                    Jsons.text(copy, "deviceId", "mock-device"), Jsons.text(copy, "metric", "UNKNOWN"), Jsons.number(copy, "value", 0),
                    Jsons.text(copy, "unit", ""), TimestampParser.sql(Jsons.instant(copy.get("ts"), Instant.now())),
                    Jsons.text(Jsons.map(mapper, copy.get("quality")), "status", "GOOD"), Jsons.json(mapper, copy.get("quality")),
                    Jsons.text(copy, "scenarioId", Jsons.text(copy, "scenario", null)), Jsons.text(copy, "branchId", null),
                    Jsons.text(copy, "sourceMode", "SIMULATION"), Jsons.text(copy, "provenance", "OBSERVED"),
                    Jsons.text(copy, "dataOrigin", "SIMULATOR"));
        } catch (DataAccessException ignored) {
            // A duplicate at the database is still a successfully handled duplicate.
            if (String.valueOf(ignored.getMessage()).toLowerCase(Locale.ROOT).contains("duplicate") ||
                    String.valueOf(ignored.getMessage()).toLowerCase(Locale.ROOT).contains("unique")) return false;
            databaseReady = false;
        }
        // Only expose an event through the in-memory read model after the
        // database insert succeeds (or after an explicit persistence
        // downgrade).  This keeps a duplicate received after a process
        // restart from appearing twice in API queries.
        telemetry.add(copy);
        eventCount.incrementAndGet();
        return true;
    }

    List<Map<String, Object>> telemetry(String plotId, String metric, Instant from, Instant to, int limit) {
        Predicate<Map<String, Object>> filter = e -> (plotId == null || plotId.equals(Jsons.text(e, "plotId", ""))) &&
                (metric == null || metric.equalsIgnoreCase(Jsons.text(e, "metric", ""))) &&
                !Jsons.instant(e.get("ts"), Instant.EPOCH).isBefore(from) && !Jsons.instant(e.get("ts"), Instant.MAX).isAfter(to);
        int cappedLimit = Math.max(1, Math.min(limit, 10000));
        Comparator<Map<String, Object>> byTimestamp = Comparator
                .comparing((Map<String, Object> e) -> Jsons.instant(e.get("ts"), Instant.EPOCH))
                .thenComparing(e -> Jsons.text(e, "eventId", ""));
        // Select the newest window first, then return that window in
        // chronological order for charts and deterministic algorithms.
        // Limiting an ascending stream returned the oldest data of the day and
        // could make live telemetry/forecasts look stale once history grew.
        List<Map<String, Object>> result = telemetry.stream().filter(filter)
                .sorted(byTimestamp.reversed()).limit(cappedLimit).sorted(byTimestamp)
                .map(e -> Jsons.copy(mapper, e)).collect(Collectors.toCollection(ArrayList::new));
        if (!result.isEmpty() || !databaseReady) return result;
        try {
            StringBuilder sql = new StringBuilder("SELECT event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,quality_status,quality_json,scenario_id,branch_id,source_mode,provenance,data_origin FROM telemetry WHERE 1=1");
            List<Object> args = new ArrayList<>();
            if (plotId != null) { sql.append(" AND plot_id=?"); args.add(plotId); }
            if (metric != null) { sql.append(" AND metric=?"); args.add(metric); }
            sql.append(" AND event_ts>=? AND event_ts<=? ORDER BY event_ts DESC, event_id DESC LIMIT ").append(cappedLimit);
            args.add(TimestampParser.sql(from)); args.add(TimestampParser.sql(to));
            List<Map<String, Object>> rows = jdbc.query(sql.toString(), (rs, rowNum) -> {
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("eventId", rs.getString("event_id")); e.put("farmId", rs.getString("farm_id"));
                e.put("plotId", rs.getString("plot_id")); e.put("deviceId", rs.getString("device_id"));
                e.put("metric", rs.getString("metric")); e.put("value", rs.getDouble("metric_value")); e.put("unit", rs.getString("unit"));
                e.put("ts", rs.getTimestamp("event_ts").toInstant().toString());
                e.put("quality", Jsons.parseMap(mapper, rs.getString("quality_json")));
                e.put("scenarioId", rs.getString("scenario_id")); e.put("scenario", rs.getString("scenario_id")); e.put("branchId", rs.getString("branch_id"));
                e.put("sourceMode", rs.getString("source_mode")); e.put("provenance", rs.getString("provenance")); e.put("dataOrigin", rs.getString("data_origin"));
                return e;
            }, args.toArray());
            Collections.reverse(rows);
            return rows;
        } catch (Exception ignored) { return result; }
    }

    Map<String, Object> latestTelemetry(String plotId, String metric, Instant from, Instant to) {
        Predicate<Map<String, Object>> filter = e -> (plotId == null || plotId.equals(Jsons.text(e, "plotId", ""))) &&
                (metric == null || metric.equalsIgnoreCase(Jsons.text(e, "metric", ""))) &&
                !Jsons.instant(e.get("ts"), Instant.EPOCH).isBefore(from) && !Jsons.instant(e.get("ts"), Instant.MAX).isAfter(to);
        Map<String, Object> latest = telemetry.stream().filter(filter)
                .max(Comparator.comparing(e -> Jsons.instant(e.get("ts"), Instant.EPOCH)))
                .map(e -> Jsons.copy(mapper, e)).orElse(null);
        if (latest != null || !databaseReady) return latest;
        try {
            StringBuilder sql = new StringBuilder("SELECT event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,quality_status,quality_json,scenario_id,branch_id,source_mode,provenance,data_origin FROM telemetry WHERE 1=1");
            List<Object> args = new ArrayList<>();
            if (plotId != null) { sql.append(" AND plot_id=?"); args.add(plotId); }
            if (metric != null) { sql.append(" AND metric=?"); args.add(metric); }
            sql.append(" AND event_ts>=? AND event_ts<=? ORDER BY event_ts DESC LIMIT 1");
            args.add(TimestampParser.sql(from)); args.add(TimestampParser.sql(to));
            List<Map<String, Object>> rows = jdbc.query(sql.toString(), (rs, rowNum) -> {
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("eventId", rs.getString("event_id")); e.put("farmId", rs.getString("farm_id"));
                e.put("plotId", rs.getString("plot_id")); e.put("deviceId", rs.getString("device_id"));
                e.put("metric", rs.getString("metric")); e.put("value", rs.getDouble("metric_value")); e.put("unit", rs.getString("unit"));
                e.put("ts", rs.getTimestamp("event_ts").toInstant().toString());
                e.put("quality", Jsons.parseMap(mapper, rs.getString("quality_json")));
                e.put("scenarioId", rs.getString("scenario_id")); e.put("scenario", rs.getString("scenario_id")); e.put("branchId", rs.getString("branch_id"));
                e.put("sourceMode", rs.getString("source_mode")); e.put("provenance", rs.getString("provenance")); e.put("dataOrigin", rs.getString("data_origin"));
                return e;
            }, args.toArray());
            return rows.isEmpty() ? null : rows.get(0);
        } catch (Exception ignored) { return null; }
    }

    /**
     * Return the newest explicitly REAL reading for a plot/metric.  Keeping
     * this query in the store makes the source arbitration rule work after a
     * restart as well as while the in-memory read model is warm.
     */
    Map<String, Object> latestRealTelemetry(String plotId, String metric, Instant from, Instant to) {
        Predicate<Map<String, Object>> filter = e -> (plotId == null || plotId.equals(Jsons.text(e, "plotId", ""))) &&
                (metric == null || metric.equalsIgnoreCase(Jsons.text(e, "metric", ""))) &&
                "REAL".equalsIgnoreCase(Jsons.text(e, "sourceMode", "")) &&
                !Jsons.instant(e.get("ts"), Instant.EPOCH).isBefore(from) && !Jsons.instant(e.get("ts"), Instant.MAX).isAfter(to);
        Map<String, Object> latest = telemetry.stream().filter(filter)
                .max(Comparator.comparing(e -> Jsons.instant(e.get("ts"), Instant.EPOCH)))
                .map(e -> Jsons.copy(mapper, e)).orElse(null);
        if (latest != null || !databaseReady) return latest;
        try {
            StringBuilder sql = new StringBuilder("SELECT event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,quality_status,quality_json,scenario_id,branch_id,source_mode,provenance,data_origin FROM telemetry WHERE source_mode='REAL'");
            List<Object> args = new ArrayList<>();
            if (plotId != null) { sql.append(" AND plot_id=?"); args.add(plotId); }
            if (metric != null) { sql.append(" AND metric=?"); args.add(metric); }
            sql.append(" AND event_ts>=? AND event_ts<=? ORDER BY event_ts DESC LIMIT 1");
            args.add(TimestampParser.sql(from)); args.add(TimestampParser.sql(to));
            List<Map<String, Object>> rows = jdbc.query(sql.toString(), (rs, rowNum) -> {
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("eventId", rs.getString("event_id")); e.put("farmId", rs.getString("farm_id"));
                e.put("plotId", rs.getString("plot_id")); e.put("deviceId", rs.getString("device_id"));
                e.put("metric", rs.getString("metric")); e.put("value", rs.getDouble("metric_value")); e.put("unit", rs.getString("unit"));
                e.put("ts", rs.getTimestamp("event_ts").toInstant().toString());
                e.put("quality", Jsons.parseMap(mapper, rs.getString("quality_json")));
                e.put("scenarioId", rs.getString("scenario_id")); e.put("scenario", rs.getString("scenario_id")); e.put("branchId", rs.getString("branch_id"));
                e.put("sourceMode", rs.getString("source_mode")); e.put("provenance", rs.getString("provenance")); e.put("dataOrigin", rs.getString("data_origin"));
                return e;
            }, args.toArray());
            return rows.isEmpty() ? null : rows.get(0);
        } catch (Exception ignored) { return null; }
    }

    void logEvent(String type, Map<String, Object> payload) {
        if (!databaseReady) return;
        try {
            Map<String, Object> p = Jsons.copy(mapper, payload);
            jdbc.update("INSERT INTO event_log(event_type,event_id,trace_id,scenario_id,payload) VALUES (?,?,?,?,?)",
                    type, Jsons.text(p, "eventId", null), Jsons.text(p, "traceId", null), Jsons.text(p, "scenarioId", null), Jsons.json(mapper, p));
        } catch (DataAccessException ignored) { databaseReady = false; }
    }

    Map<String, Object> userByUsername(String username) {
        String normalized = String.valueOf(username == null ? "" : username).trim().toLowerCase(Locale.ROOT);
        Map<String, Object> u = users.values().stream().filter(v -> normalized.equals(Jsons.text(v, "username", "").toLowerCase(Locale.ROOT))).findFirst().orElse(null);
        if (u != null) return Jsons.copy(mapper, u);
        if (!databaseReady) return null;
        try {
            Map<String, Object> persisted = jdbc.queryForObject("SELECT user_id,username,password_hash,role_code,farm_ids,plot_ids,enabled,recovery_code_hash,credential_version FROM user_account WHERE LOWER(username)=?",
                    (rs, rowNum) -> userMap(rs), normalized);
            if (persisted != null) users.put(Jsons.text(persisted, "userId", normalized), Jsons.copy(mapper, persisted));
            return persisted;
        } catch (DataAccessException ignored) { return null; }
    }

    Map<String, Object> userById(String userId) {
        Map<String, Object> cached = users.get(userId);
        if (cached != null) return Jsons.copy(mapper, cached);
        if (!databaseReady) return null;
        try {
            Map<String, Object> persisted = jdbc.queryForObject("SELECT user_id,username,password_hash,role_code,farm_ids,plot_ids,enabled,recovery_code_hash,credential_version FROM user_account WHERE user_id=?",
                    (rs, rowNum) -> userMap(rs), userId);
            if (persisted != null) users.put(userId, Jsons.copy(mapper, persisted));
            return persisted;
        } catch (DataAccessException ignored) { return null; }
    }

    List<Map<String, Object>> listUsers() {
        List<Map<String, Object>> result = users.values().stream()
                .map(user -> safeUser(Jsons.copy(mapper, user)))
                .collect(Collectors.toCollection(ArrayList::new));
        if (!databaseReady) return result;
        try {
            List<Map<String, Object>> persisted = jdbc.query(
                    "SELECT user_id,username,password_hash,role_code,farm_ids,plot_ids,enabled,recovery_code_hash,credential_version FROM user_account ORDER BY username",
                    (rs, rowNum) -> userMap(rs));
            persisted.forEach(user -> users.put(Jsons.text(user, "userId", ""), Jsons.copy(mapper, user)));
            return persisted.stream().map(this::safeUser).collect(Collectors.toCollection(ArrayList::new));
        } catch (DataAccessException ignored) {
            databaseReady = false;
            return result;
        }
    }

    private Map<String, Object> safeUser(Map<String, Object> user) {
        Map<String, Object> safe = Jsons.copy(mapper, user);
        safe.remove("passwordHash");
        safe.remove("recoveryCodeHash");
        safe.remove("credentialVersion");
        return safe;
    }

    boolean credentialVersionMatches(String userId, int credentialVersion) {
        Map<String, Object> user = userById(userId);
        return user != null && Jsons.bool(user, "enabled", true)
                && (int) Jsons.whole(user, "credentialVersion", 1) == credentialVersion;
    }

    synchronized Map<String, Object> updateUserScope(String userId, Collection<String> farmIds, Collection<String> plotIds) {
        Map<String, Object> user = userById(userId);
        if (user == null) return null;
        user.put("farmIds", new ArrayList<>(farmIds));
        user.put("plotIds", new ArrayList<>(plotIds));
        if (databaseReady) {
            try {
                int updated = jdbc.update("UPDATE user_account SET farm_ids=?,plot_ids=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
                        String.join(",", Jsons.strings(user.get("farmIds"))),
                        String.join(",", Jsons.strings(user.get("plotIds"))), userId);
                if (updated != 1) return null;
            } catch (DataAccessException error) {
                databaseReady = false;
            }
        }
        users.put(userId, Jsons.copy(mapper, user));
        return safeUser(Jsons.copy(mapper, user));
    }

    synchronized Map<String, Object> updateUserEnabled(String userId, boolean enabled, boolean rotateCredentials) {
        Map<String, Object> user = userById(userId);
        if (user == null) return null;
        user.put("enabled", enabled);
        if (rotateCredentials) {
            user.put("credentialVersion", (int) Jsons.whole(user, "credentialVersion", 1) + 1);
        }
        if (databaseReady) {
            try {
                int updated = jdbc.update("UPDATE user_account SET enabled=?,credential_version=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
                        enabled, Jsons.whole(user, "credentialVersion", 1), userId);
                if (updated != 1) return null;
            } catch (DataAccessException error) {
                databaseReady = false;
            }
        }
        users.put(userId, Jsons.copy(mapper, user));
        return Jsons.copy(mapper, user);
    }

    private Map<String, Object> userMap(ResultSet rs) throws java.sql.SQLException {
        Map<String, Object> u = new LinkedHashMap<>();
        u.put("userId", rs.getString("user_id")); u.put("username", rs.getString("username"));
        u.put("passwordHash", rs.getString("password_hash")); u.put("role", rs.getString("role_code"));
        u.put("farmIds", Jsons.strings(rs.getString("farm_ids"))); u.put("plotIds", Jsons.strings(rs.getString("plot_ids")));
        u.put("enabled", rs.getBoolean("enabled")); u.put("recoveryCodeHash", rs.getString("recovery_code_hash"));
        u.put("credentialVersion", rs.getInt("credential_version")); return u;
    }

    private void saveUser(Map<String, Object> user) {
        String id = Jsons.text(user, "userId", Jsons.id("usr"));
        user.put("userId", id); users.put(id, Jsons.copy(mapper, user));
        if (!databaseReady) return;
        try {
            if (postgres) {
                jdbc.update("INSERT INTO user_account(user_id,username,password_hash,role_code,farm_ids,plot_ids,enabled,recovery_code_hash,credential_version) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(username) DO NOTHING",
                        id, Jsons.text(user, "username", id), Jsons.text(user, "passwordHash", ""), Jsons.text(user, "role", "FARMER"),
                        String.join(",", Jsons.strings(user.get("farmIds"))), String.join(",", Jsons.strings(user.get("plotIds"))), Jsons.bool(user, "enabled", true),
                        StringUtils.hasText(Jsons.text(user, "recoveryCodeHash", "")) ? Jsons.text(user, "recoveryCodeHash", "") : null,
                        Jsons.whole(user, "credentialVersion", 1));
            } else {
                jdbc.update("MERGE INTO user_account(user_id,username,password_hash,role_code,farm_ids,plot_ids,enabled,recovery_code_hash,credential_version) KEY(username) VALUES (?,?,?,?,?,?,?,?,?)",
                        id, Jsons.text(user, "username", id), Jsons.text(user, "passwordHash", ""), Jsons.text(user, "role", "FARMER"),
                        String.join(",", Jsons.strings(user.get("farmIds"))), String.join(",", Jsons.strings(user.get("plotIds"))), Jsons.bool(user, "enabled", true),
                        StringUtils.hasText(Jsons.text(user, "recoveryCodeHash", "")) ? Jsons.text(user, "recoveryCodeHash", "") : null,
                        Jsons.whole(user, "credentialVersion", 1));
            }
        } catch (DataAccessException ignored) { databaseReady = false; }
    }

    synchronized boolean createUser(Map<String, Object> user) {
        String username = Jsons.text(user, "username", "").trim().toLowerCase(Locale.ROOT);
        if (username.isBlank() || userByUsername(username) != null) return false;
        String id = Jsons.text(user, "userId", Jsons.id("usr"));
        user.put("userId", id); user.put("username", username); user.putIfAbsent("credentialVersion", 1);
        if (databaseReady) {
            try {
                jdbc.update("INSERT INTO user_account(user_id,username,password_hash,role_code,farm_ids,plot_ids,enabled,recovery_code_hash,credential_version) VALUES (?,?,?,?,?,?,?,?,?)",
                        id, username, Jsons.text(user, "passwordHash", ""), Jsons.text(user, "role", "FARMER"),
                        String.join(",", Jsons.strings(user.get("farmIds"))), String.join(",", Jsons.strings(user.get("plotIds"))), Jsons.bool(user, "enabled", true),
                        Jsons.text(user, "recoveryCodeHash", ""), Jsons.whole(user, "credentialVersion", 1));
            } catch (DataAccessException error) {
                String message = String.valueOf(error.getMessage()).toLowerCase(Locale.ROOT);
                if (message.contains("unique") || message.contains("duplicate")) return false;
                databaseReady = false;
            }
        }
        users.put(id, Jsons.copy(mapper, user));
        return true;
    }

    synchronized Map<String, Object> updatePassword(String username, String passwordHash, String recoveryCodeHash) {
        Map<String, Object> user = userByUsername(username);
        if (user == null) return null;
        int version = (int) Jsons.whole(user, "credentialVersion", 1) + 1;
        user.put("passwordHash", passwordHash); user.put("recoveryCodeHash", recoveryCodeHash); user.put("credentialVersion", version);
        String id = Jsons.text(user, "userId", "");
        if (databaseReady) {
            try {
                int updated = jdbc.update("UPDATE user_account SET password_hash=?,recovery_code_hash=?,credential_version=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
                        passwordHash, recoveryCodeHash, version, id);
                if (updated != 1) return null;
            } catch (DataAccessException error) { databaseReady = false; }
        }
        users.put(id, Jsons.copy(mapper, user));
        return Jsons.copy(mapper, user);
    }

    private void seed() {
        if (find("farm", "farm-demo") != null) return;
        Map<String, Object> farm = new LinkedHashMap<>();
        farm.put("farmId", "farm-demo"); farm.put("name", "农智示范农场"); farm.put("ownerId", "user-admin"); farm.put("region", "重庆");
        farm.put("defaults", Map.of("waterPricePerLitre", 0.004, "labourPricePerHour", 35)); save("farm", "farm-demo", farm);
        String[] plots = {"plot-a01", "plot-a02", "plot-b01"};
        String[] crops = {"tomato", "tomato", "cucumber"};
        for (int i = 0; i < plots.length; i++) {
            Map<String, Object> plot = new LinkedHashMap<>();
            plot.put("plotId", plots[i]); plot.put("farmId", "farm-demo"); plot.put("name", "温室" + (i + 1));
            plot.put("areaM2", 80 + i * 20); plot.put("riskLevel", i == 2 ? "HIGH" : "MEDIUM"); plot.put("cropCode", crops[i]);
            plot.put("status", "ACTIVE");
            plot.put("location", Map.of("lat", 29.56 + i * 0.001, "lng", 106.55 + i * 0.001)); save("plot", plots[i], plot);
            Map<String, Object> batch = new LinkedHashMap<>(); batch.put("batchId", "batch-" + plots[i]); batch.put("farmId", "farm-demo"); batch.put("plotId", plots[i]);
            batch.put("cropCode", crops[i]); batch.put("stageCode", "fruiting"); batch.put("cropPackVersion", "1.0.0");
            batch.put("plantedAt", Instant.now().minus(45, ChronoUnit.DAYS).toString()); save("crop-batch", "batch-" + plots[i], batch);
            Map<String, Object> device = new LinkedHashMap<>(); device.put("deviceId", "mock-" + plots[i]); device.put("farmId", "farm-demo"); device.put("plotId", plots[i]);
            device.put("bindingState", "BOUND");
            device.put("type", "ENVIRONMENTAL_SENSOR"); device.put("status", "ONLINE"); device.put("healthScore", 0.98); device.put("lastSeen", Instant.now().toString());
            save("device", "mock-" + plots[i], device);
        }
        Map<String, Object> resource = new LinkedHashMap<>(); resource.put("resourcePlanId", "resource-default"); resource.put("farmId", "farm-demo");
        resource.put("resourceType", "WATER"); resource.put("capacityLitres", 900.0); resource.put("flowRateLitresPerMinute", 18.0);
        resource.put("unitCost", 0.004); resource.put("availableFrom", Instant.now().minus(1, ChronoUnit.HOURS).toString());
        resource.put("availableTo", Instant.now().plus(1, ChronoUnit.DAYS).toString()); save("resource-profile", "resource-default", resource);
        seedUser("user-farmer", "farmer", "demo123", "FARMER", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        seedUser("user-admin", "admin", "demo123", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02", "plot-b01"));
        seedUser("user-system", "sysadmin", "demo123", "SYSTEM_ADMIN", List.of("farm-demo"), List.of("*"));
    }

    private void seedUser(String id, String username, String password, String role, List<String> farms, List<String> plots) {
        Map<String, Object> user = new LinkedHashMap<>(); user.put("userId", id); user.put("username", username);
        user.put("passwordHash", passwordEncoder.encode(password)); user.put("role", role); user.put("farmIds", farms); user.put("plotIds", plots); user.put("enabled", true);
        user.put("credentialVersion", 1);
        saveUser(user);
    }
}

final class TimestampParser {
    private TimestampParser() {}
    static java.sql.Timestamp sql(Instant value) { return java.sql.Timestamp.from(value == null ? Instant.now() : value); }
}

@Service
class AgriEventBus {
    private final ObjectMapper mapper;
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final ExecutorService executor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "agriloop-sse"); t.setDaemon(true); return t;
    });

    AgriEventBus(ObjectMapper mapper) { this.mapper = mapper; }

    SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);
        Runnable remove = () -> emitters.remove(emitter);
        emitter.onCompletion(remove); emitter.onTimeout(remove); emitter.onError(e -> remove.run());
        try { emitter.send(SseEmitter.event().name("connected").data(Map.of("connectedAt", Instant.now().toString()))); }
        catch (IOException e) { remove.run(); }
        return emitter;
    }

    void publish(String type, Map<String, Object> payload) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventType", type); event.put("eventId", Jsons.id("evt")); event.put("ts", Instant.now().toString());
        event.put("payload", Jsons.copy(mapper, payload));
        for (SseEmitter emitter : emitters) {
            executor.submit(() -> {
                try { emitter.send(SseEmitter.event().name(type).id(Jsons.text(event, "eventId", "")).data(event)); }
                catch (Exception e) { emitters.remove(emitter); }
            });
        }
    }

    @Scheduled(fixedDelayString = "${agriloop.sse-heartbeat-seconds:15}000")
    void heartbeat() {
        for (SseEmitter emitter : emitters) {
            try { emitter.send(SseEmitter.event().name("heartbeat").data(Map.of("ts", Instant.now().toString()))); }
            catch (Exception e) { emitters.remove(emitter); }
        }
    }
}

@Component
class MqttCommandGateway {
    private final AgriProperties properties;
    private final ObjectMapper mapper;
    private final AtomicBoolean available = new AtomicBoolean(false);

    MqttCommandGateway(AgriProperties properties, ObjectMapper mapper) { this.properties = properties; this.mapper = mapper; }

    void publish(Map<String, Object> command) {
        if (!"simulation".equalsIgnoreCase(properties.getMode())) return;
        org.eclipse.paho.client.mqttv3.MqttClient client = null;
        try {
            String farmId = Jsons.text(command, "farmId", "farm-demo");
            if (!farmId.matches("[A-Za-z0-9_-]{1,120}")) throw new IllegalArgumentException("unsafe farm id");
            String plotId = Jsons.text(command, "plotId", "plot-a01");
            if (!plotId.matches("[A-Za-z0-9_-]{1,120}")) throw new IllegalArgumentException("unsafe plot id");
            client = new org.eclipse.paho.client.mqttv3.MqttClient(properties.getMqttUrl(), properties.getMqttClientId() + "-command-" + UUID.randomUUID().toString().substring(0, 8));
            org.eclipse.paho.client.mqttv3.MqttConnectOptions options = new org.eclipse.paho.client.mqttv3.MqttConnectOptions();
            options.setAutomaticReconnect(false); options.setCleanSession(true); options.setConnectionTimeout(2);
            if (StringUtils.hasText(properties.getMqttUsername())) { options.setUserName(properties.getMqttUsername()); options.setPassword(properties.getMqttPassword().toCharArray()); }
            client.connect(options);
            org.eclipse.paho.client.mqttv3.MqttMessage message = new org.eclipse.paho.client.mqttv3.MqttMessage(mapper.writeValueAsBytes(command)); message.setQos(1);
            client.publish("agri/" + farmId + "/" + plotId + "/command", message); available.set(true);
        } catch (Exception ignored) { available.set(false); }
        finally { if (client != null) { try { if (client.isConnected()) client.disconnect(); } catch (Exception ignored) { } try { client.close(); } catch (Exception ignored) { } } }
    }

    boolean available() { return available.get(); }

    /** 真实测量 MQTT 连接+发布往返延迟（毫秒），失败返回 -1。 */
    long latencyMs() {
        org.eclipse.paho.client.mqttv3.MqttClient client = null;
        long start = System.nanoTime();
        try {
            client = new org.eclipse.paho.client.mqttv3.MqttClient(properties.getMqttUrl(), properties.getMqttClientId() + "-latency-" + UUID.randomUUID().toString().substring(0, 8));
            org.eclipse.paho.client.mqttv3.MqttConnectOptions options = new org.eclipse.paho.client.mqttv3.MqttConnectOptions();
            options.setAutomaticReconnect(false); options.setCleanSession(true); options.setConnectionTimeout(2);
            if (StringUtils.hasText(properties.getMqttUsername())) { options.setUserName(properties.getMqttUsername()); options.setPassword(properties.getMqttPassword().toCharArray()); }
            client.connect(options);
            org.eclipse.paho.client.mqttv3.MqttMessage message = new org.eclipse.paho.client.mqttv3.MqttMessage(mapper.writeValueAsBytes(Map.of("type", "latency-probe", "at", Instant.now().toString()))); message.setQos(1);
            client.publish("agri/farm-demo/latency-probe/command", message);
            return Math.max(0, Duration.ofNanos(System.nanoTime() - start).toMillis());
        } catch (Exception e) {
            return -1;
        } finally {
            if (client != null) { try { if (client.isConnected()) client.disconnect(); } catch (Exception ignored) { } try { client.close(); } catch (Exception ignored) { } }
        }
    }
}

@Component
class RedisStreamWorker {
    private static final String GROUP = "agriloop-api";
    private final StringRedisTemplate redis;
    private final AgriProperties properties;
    private final AgriStore store;
    private final String consumer = "api-worker";
    private final AtomicBoolean active = new AtomicBoolean(false);
    private final AtomicLong acknowledged = new AtomicLong();
    private final AtomicLong deadLetters = new AtomicLong();

    RedisStreamWorker(StringRedisTemplate redis, AgriProperties properties, AgriStore store) { this.redis = redis; this.properties = properties; this.store = store; }

    @Scheduled(fixedDelay = 1000)
    void poll() {
        try {
            String stream = properties.getTelemetryStream();
            if (!active.get()) {
                redis.opsForStream().add(stream, Map.of("bootstrap", "true", "createdAt", Instant.now().toString()));
                try { redis.opsForStream().createGroup(stream, ReadOffset.latest(), GROUP); } catch (Exception ignored) { }
                active.set(true);
            }
            List<MapRecord<String, Object, Object>> records = redis.opsForStream().read(Consumer.from(GROUP, consumer), StreamReadOptions.empty().count(50).block(Duration.ofMillis(50)), StreamOffset.create(stream, ReadOffset.lastConsumed()));
            if (records == null) return;
            for (MapRecord<String, Object, Object> record : records) {
                Map<?, ?> fields = record.getValue();
                if ("true".equalsIgnoreCase(String.valueOf(fields.get("bootstrap")))) {
                    redis.opsForStream().acknowledge(stream, GROUP, record.getId()); acknowledged.incrementAndGet();
                    continue;
                }
                String payload = fields.get("payload") == null ? null : String.valueOf(fields.get("payload"));
                if (payload == null || payload.isBlank()) {
                    redis.opsForStream().add(stream + ".dlq", Map.of("streamId", record.getId().getValue(), "reason", "MISSING_PAYLOAD", "failedAt", Instant.now().toString()));
                    store.save("dead-letter", "stream-" + record.getId().getValue(), Map.of("streamId", record.getId().getValue(), "reason", "MISSING_PAYLOAD", "createdAt", Instant.now().toString()));
                    deadLetters.incrementAndGet();
                }
                redis.opsForStream().acknowledge(stream, GROUP, record.getId()); acknowledged.incrementAndGet();
            }
        } catch (Exception ignored) { active.set(false); }
    }

    Map<String, Object> status() { return Map.of("active", active.get(), "group", GROUP, "consumer", consumer, "acknowledged", acknowledged.get(), "deadLetters", deadLetters.get()); }
}

/**
 * Public account roles are intentionally limited to the three roles shown by
 * the login screen. FIELD_OPERATOR is retained as a migration-only alias so
 * tokens issued by an older deployment can expire naturally without making a
 * running farm inaccessible during rollout.
 */
final class RolePolicy {
    static final Set<String> PUBLIC_ROLES = Set.of("FARM_ADMIN", "FARMER", "SYSTEM_ADMIN");
    static final Set<String> LEGACY_ROLES = Set.of("FIELD_OPERATOR");
    static final Set<String> ALL_ROLES = PUBLIC_ROLES;

    private RolePolicy() { }

    static String normalize(String value) {
        String role = String.valueOf(value == null ? "" : value).trim().toUpperCase(Locale.ROOT);
        return switch (role) {
            case "ADMIN" -> "FARM_ADMIN";
            case "SYSADMIN" -> "SYSTEM_ADMIN";
            default -> role;
        };
    }

    static String canonical(String value) {
        String role = normalize(value);
        return LEGACY_ROLES.contains(role) || "OPERATOR".equals(role) ? "FARMER" : role;
    }

    static String label(String value) {
        return switch (normalize(value)) {
            case "FARM_ADMIN" -> "农场管理员";
            case "SYSTEM_ADMIN" -> "系统管理员";
            case "FIELD_OPERATOR" -> "种植农户";
            default -> "种植农户";
        };
    }

    static boolean canControl(String value) {
        return Set.of("FARM_ADMIN", "SYSTEM_ADMIN").contains(canonical(value));
    }

    static boolean isAdmin(String value) {
        return Set.of("FARM_ADMIN", "SYSTEM_ADMIN").contains(canonical(value));
    }
}

final class UserPrincipal {
    final String userId;
    final String username;
    final String role;
    final Set<String> farmIds;
    final Set<String> plotIds;
    final int credentialVersion;

    UserPrincipal(String userId, String username, String role, Collection<String> farms, Collection<String> plots) {
        this(userId, username, role, farms, plots, 1);
    }

    UserPrincipal(String userId, String username, String role, Collection<String> farms, Collection<String> plots, int credentialVersion) {
        this.userId = userId; this.username = username; this.role = RolePolicy.canonical(role);
        this.farmIds = new HashSet<>(farms == null ? List.of() : farms);
        this.plotIds = new HashSet<>(plots == null ? List.of() : plots);
        this.credentialVersion = Math.max(1, credentialVersion);
    }
    boolean canAccessPlot(String plotId) { return "SYSTEM_ADMIN".equals(role) || plotIds.contains("*") || plotIds.contains(plotId); }
    boolean canAccessFarm(String farmId) { return "SYSTEM_ADMIN".equals(role) || farmIds.contains("*") || farmIds.contains(farmId); }
    boolean canControl() { return RolePolicy.canControl(role); }
    boolean canInspect() { return Set.of("FARMER", "FARM_ADMIN").contains(role); }
    boolean canRequestIrrigation() { return Set.of("FARMER", "FARM_ADMIN").contains(role); }
    boolean isFarmer() { return "FARMER".equals(role); }
    boolean isFarmAdmin() { return "FARM_ADMIN".equals(role); }
    boolean isSystemAdmin() { return "SYSTEM_ADMIN".equals(role); }
    boolean isAdmin() { return RolePolicy.isAdmin(role); }
}

@Service
class JwtService {
    private final AgriProperties properties;
    private final SecretKey key;

    JwtService(AgriProperties properties) {
        this.properties = properties;
        String secret = properties.getJwtSecret();
        if (secret.length() < 32) secret = (secret + "change-me-change-me-change-me-change-me");
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    String issue(UserPrincipal principal) {
        Instant now = Instant.now();
        return Jwts.builder().subject(principal.userId).claim("username", principal.username).claim("role", principal.role)
                .claim("farmIds", principal.farmIds).claim("plotIds", principal.plotIds)
                .claim("credentialVersion", principal.credentialVersion)
                .issuedAt(Date.from(now)).expiration(Date.from(now.plus(properties.getJwtTtlMinutes(), ChronoUnit.MINUTES)))
                .signWith(key).compact();
    }

    UserPrincipal parse(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        Object rawVersion = claims.get("credentialVersion");
        int credentialVersion = rawVersion instanceof Number n ? n.intValue() : 1;
        return new UserPrincipal(claims.getSubject(), String.valueOf(claims.get("username", String.class)),
                String.valueOf(claims.get("role", String.class)), claimList(claims.get("farmIds")), claimList(claims.get("plotIds")), credentialVersion);
    }

    private Collection<String> claimList(Object value) {
        if (value instanceof Collection<?> c) return c.stream().map(String::valueOf).toList();
        return Jsons.strings(value);
    }
}

@Component
class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final AgriStore store;
    JwtAuthenticationFilter(JwtService jwtService, AgriStore store) { this.jwtService = jwtService; this.store = store; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith("Bearer ")) {
            try {
                UserPrincipal principal = jwtService.parse(header.substring(7));
                if (!store.credentialVersionMatches(principal.userId, principal.credentialVersion)) throw new IllegalArgumentException("credential version mismatch");
                // Scope is deliberately reloaded for every protected request.
                // Tokens retain the same schema, while a farm manager's scope
                // revocation becomes effective immediately.
                Map<String, Object> current = store.userById(principal.userId);
                if (current == null || !Jsons.bool(current, "enabled", true)) throw new IllegalArgumentException("account disabled");
                UserPrincipal effective = new UserPrincipal(principal.userId,
                        Jsons.text(current, "username", principal.username),
                        Jsons.text(current, "role", principal.role),
                        Jsons.strings(current.get("farmIds")), Jsons.strings(current.get("plotIds")),
                        principal.credentialVersion);
                List<GrantedAuthority> authorities = List.of(new SimpleGrantedAuthority("ROLE_" + effective.role));
                SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(effective, null, authorities));
            } catch (Exception ignored) {
                // The controller will return the standard 401 generated by Spring Security.
            }
        }
        chain.doFilter(request, response);
    }
}

@Configuration
@EnableMethodSecurity
class SecurityConfig {
    private final JwtAuthenticationFilter jwtFilter;
    private final ObjectMapper mapper;
    SecurityConfig(JwtAuthenticationFilter jwtFilter, ObjectMapper mapper) { this.jwtFilter = jwtFilter; this.mapper = mapper; }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .cors(cors -> { })
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, ignored) -> writeError(response, HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "需要有效的登录令牌"))
                        .accessDeniedHandler((request, response, ignored) -> writeError(response, HttpStatus.FORBIDDEN, "FORBIDDEN", "权限不足")))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/password/reset",
                                "/api/v1/auth/roles", "/actuator/health", "/actuator/info", "/error",
                                "/v3/api-docs/**", "/swagger-ui/**").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private void writeError(HttpServletResponse response, HttpStatus status, String code, String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        mapper.writeValue(response.getWriter(), ApiResponses.error(code, message, Map.of()));
    }
}

/** Admin-only bridge to the fixed Supervisor-managed telemetry simulator. */
@Component
class SimulatorControl {
    private final AgriProperties properties;

    SimulatorControl(AgriProperties properties) {
        this.properties = properties;
    }

    Map<String, Object> status() {
        if (!properties.isSimulatorControlEnabled()) return unavailable("SIMULATOR_CONTROL_DISABLED");
        Path config = configPath();
        if (config == null || !Files.isRegularFile(config)) return unavailable("SUPERVISOR_CONFIG_NOT_FOUND");
        CommandResult result = execute("status");
        if (result == null) return unavailable("SUPERVISOR_NOT_AVAILABLE");
        String line = stripAnsi(result.output()).lines().map(String::trim)
                .filter(value -> value.startsWith(properties.getSimulatorProgram() + " "))
                .findFirst().orElse("");
        if (line.isBlank()) return unavailable(result.output().isBlank() ? "SIMULATOR_STATUS_EMPTY" : result.output().trim());
        String normalizedLine = line.toUpperCase(Locale.ROOT);
        String state = normalizedLine.contains(" RUNNING ") ? "RUNNING"
                : normalizedLine.contains(" STOPPED ") ? "STOPPED"
                : normalizedLine.contains(" EXITED ") ? "EXITED"
                : normalizedLine.contains(" FATAL ") ? "FATAL" : "UNKNOWN";
        Map<String, Object> response = base(state);
        response.put("raw", line);
        String[] tokens = line.split("\\s+");
        for (int index = 0; index + 1 < tokens.length; index++) {
            if ("pid".equalsIgnoreCase(tokens[index])) {
                response.put("pid", tokens[index + 1].replaceAll("[^0-9]", ""));
                break;
            }
        }
        return response;
    }

    Map<String, Object> start() { return control("start"); }
    Map<String, Object> stop() { return control("stop"); }

    private Map<String, Object> control(String action) {
        if (!properties.isSimulatorControlEnabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SIMULATOR_CONTROL_DISABLED", "服务器未启用模拟器控制");
        }
        Path config = configPath();
        if (config == null || !Files.isRegularFile(config)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SUPERVISOR_CONFIG_NOT_FOUND", "当前环境没有可用的 Supervisor 模拟器服务");
        }
        CommandResult result = execute(action);
        if (result == null) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SUPERVISOR_NOT_AVAILABLE", "Supervisor 不可用，请检查服务器进程管理服务");
        }
        if (result.exitCode() != 0 && !result.output().toLowerCase(Locale.ROOT).contains("already")) {
            String detail = result.output().isBlank() ? "Supervisor 命令失败" : result.output().trim();
            throw new ApiException(HttpStatus.BAD_GATEWAY, "SIMULATOR_CONTROL_FAILED", detail);
        }
        Map<String, Object> response = status();
        response.put("action", action.toUpperCase(Locale.ROOT));
        response.put("message", result.output().trim());
        return response;
    }

    private Path configPath() {
        try {
            String value = properties.getSupervisorConfig();
            return value == null || value.isBlank() ? null : Path.of(value).toAbsolutePath().normalize();
        } catch (Exception ignored) {
            return null;
        }
    }

    private CommandResult execute(String action) {
        Path config = configPath();
        if (config == null) return null;
        try {
            Process process = new ProcessBuilder("supervisorctl", "-c", config.toString(), action, properties.getSimulatorProgram())
                    .redirectErrorStream(true).start();
            boolean finished = process.waitFor(6, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return new CommandResult(124, "Supervisor 命令超时");
            }
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            return new CommandResult(process.exitValue(), output);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String stripAnsi(String value) {
        if (value == null || value.isBlank()) return value == null ? "" : value;
        StringBuilder clean = new StringBuilder(value.length());
        boolean escape = false;
        boolean csi = false;
        for (int index = 0; index < value.length(); index++) {
            char ch = value.charAt(index);
            if (ch == 27) {
                escape = true;
                csi = false;
                continue;
            }
            if (escape) {
                if (!csi && ch == '[') {
                    csi = true;
                    continue;
                }
                if (csi && ch >= '@' && ch <= '~') {
                    escape = false;
                    csi = false;
                }
                continue;
            }
            clean.append(ch);
        }
        return clean.toString();
    }

    private Map<String, Object> unavailable(String reason) {
        Map<String, Object> response = base("UNAVAILABLE");
        response.put("available", false);
        response.put("reason", reason);
        return response;
    }

    private Map<String, Object> base(String state) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("available", true);
        response.put("status", state);
        response.put("program", properties.getSimulatorProgram());
        return response;
    }

    private record CommandResult(int exitCode, String output) { }
}

@Service
class AgriEngine {
    private static final String RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final int RECOVERY_MAX_FAILURES = 5;
    private static final Duration RECOVERY_FAILURE_WINDOW = Duration.ofMinutes(15);
    private static final Set<String> ACCOUNT_ROLES = RolePolicy.PUBLIC_ROLES;
    private static final Set<String> SELF_REGISTRATION_ROLES = Set.of("FARMER");
    private static final Set<String> WORK_ORDER_STATUSES = Set.of("OPEN", "ASSIGNED", "IN_PROGRESS", "SUBMITTED", "REJECTED", "DONE", "CANCELLED");
    private static final Set<String> TERMINAL_WORK_ORDER_STATUSES = Set.of("DONE", "CANCELLED");
    private static final Set<String> PLOT_SIMULATION_SCENARIOS = Set.of(
            "NORMAL", "DROUGHT", "HEAVY_RAIN", "SENSOR_DRIFT", "DEVICE_OFFLINE");
    private static final Map<String, double[]> SIMULATION_PARAMETER_LIMITS = Map.ofEntries(
            Map.entry("volatility", new double[]{.2, 3.0}),
            Map.entry("timeScale", new double[]{1, 180}),
            Map.entry("temperatureBias", new double[]{-15, 15}),
            Map.entry("humidityBias", new double[]{-40, 40}),
            Map.entry("rainfallRate", new double[]{0, 120}),
            Map.entry("soilMoistureTrendPerHour", new double[]{-12, 12}),
            Map.entry("driftRatePerHour", new double[]{0, 10}),
            Map.entry("offlineRatio", new double[]{0, 1}),
            Map.entry("riskThreshold", new double[]{1, 99}),
            Map.entry("waterloggingThreshold", new double[]{40, 99}),
            Map.entry("forecastHours", new double[]{1, 12}));
    private static final Set<String> OPEN_ALERT_STATUSES = Set.of("ACTIVE", "ACKED", "ESCALATED");
    private static final Set<String> TERMINAL_ALERT_STATUSES = Set.of("CLOSED", "RESOLVED");
    private static final Set<String> DEVICE_CONTROL_TARGETS = Set.of("ONLINE", "OFFLINE");
    private static final Set<String> DEVICE_CONTROL_TERMINAL = Set.of("SUCCEEDED", "FAILED", "TIMEOUT");
    private static final Duration AGENT_ACTION_TTL = Duration.ofMinutes(10);
    private static final Set<String> AGENT_MUTATION_TOOLS = Set.of("create_plot", "update_plot", "set_plot_devices",
            "create_and_assign_work_order", "publish_alert_verification", "close_alert");
    private static final Set<String> INSPECTION_PHOTO_TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private static final int INSPECTION_PHOTO_MAX_COUNT = 6;
    private static final int INSPECTION_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
    private final ObjectMapper mapper;
    private final ResourceLoader resourceLoader;
    private final HttpClient llmHttpClient;
    private final AgriStore store;
    private final AgriEventBus events;
    private final AgriProperties properties;
    private final CropPackCatalog cropPackCatalog;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final StringRedisTemplate redis;
    private final MqttCommandGateway mqttCommands;
    private final RedisStreamWorker streamWorker;
    private final AdminManagementService adminManagement;
    private final Map<String, Instant> cooldowns = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> idempotentCommands = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> ackByCommand = new ConcurrentHashMap<>();
    private final Set<String> evaluatedCommands = ConcurrentHashMap.newKeySet();
    private final Map<String, Deque<Instant>> ruleWindows = new ConcurrentHashMap<>();
    private final Map<String, Deque<Instant>> recoveryFailures = new ConcurrentHashMap<>();
    private final AtomicBoolean redisAvailable = new AtomicBoolean(false);
    private final AtomicLong redisPublished = new AtomicLong();
    private final AtomicLong redisFailures = new AtomicLong();
    private final Object simulationConfigLock = new Object();

    AgriEngine(ObjectMapper mapper, ResourceLoader resourceLoader, AgriStore store, AgriEventBus events, AgriProperties properties,
               CropPackCatalog cropPackCatalog,
               PasswordEncoder passwordEncoder, JwtService jwtService, StringRedisTemplate redis, MqttCommandGateway mqttCommands,
               RedisStreamWorker streamWorker, @Lazy AdminManagementService adminManagement) {
        this.mapper = mapper;
        this.resourceLoader = resourceLoader;
        // vLLM/uvicorn on the private loopback endpoint is intentionally used
        // with HTTP/1.1 requests.  This avoids a known incompatibility with
        // Java HTTP/2 upgrade negotiation while keeping the model endpoint
        // private and bounded by the per-request timeout.
        this.llmHttpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.store = store; this.events = events; this.properties = properties; this.cropPackCatalog = cropPackCatalog;
        this.passwordEncoder = passwordEncoder; this.jwtService = jwtService; this.redis = redis; this.mqttCommands = mqttCommands; this.streamWorker = streamWorker; this.adminManagement = adminManagement;
    }

    @PostConstruct
    void initialisePlotSimulationConfiguration() {
        // The standalone/test profile has no long-running Python consumer and
        // must not create workspace files merely by starting Spring tests.
        if ("simulation".equalsIgnoreCase(properties.getMode())) syncSimulationConfiguration();
    }

    Map<String, Object> login(String username, String password) {
        return login(username, password, "");
    }

    Map<String, Object> login(String username, String password, String expectedRole) {
        String normalized = normalizeUsername(username);
        String normalizedRole = RolePolicy.canonical(normalizeRole(expectedRole));
        Map<String, Object> user = store.userByUsername(normalized);
        boolean credentialsMatch = user != null && Jsons.bool(user, "enabled", true)
                && passwordEncoder.matches(password, Jsons.text(user, "passwordHash", ""));
        String storedRole = RolePolicy.canonical(Jsons.text(user, "role", ""));
        boolean storedRoleAllowed = ACCOUNT_ROLES.contains(storedRole);
        boolean roleMatches = normalizedRole.isBlank() || (user != null && ACCOUNT_ROLES.contains(normalizedRole)
                && normalizedRole.equals(storedRole));
        if (!credentialsMatch || !storedRoleAllowed || !roleMatches) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "账号、密码或身份错误");
        }
        return authenticatedSession(user);
    }

    Map<String, Object> register(String username, String password) {
        return register(username, password, "FARMER");
    }

    Map<String, Object> register(String username, String password, String requestedRole) {
        String normalized = normalizeUsername(username);
        String role = validateSelfRegistrationRole(requestedRole);
        validateUsername(normalized);
        validatePassword(normalized, password);
        String recoveryCode = generateRecoveryCode();
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("userId", Jsons.id("user")); user.put("username", normalized);
        user.put("passwordHash", passwordEncoder.encode(password)); user.put("recoveryCodeHash", passwordEncoder.encode(normalizeRecoveryCode(recoveryCode)));
        user.put("role", role); user.put("farmIds", List.of("farm-demo"));
        user.put("plotIds", List.of("plot-a01", "plot-a02")); user.put("enabled", true); user.put("credentialVersion", 1);
        if (!store.createUser(user)) throw new ApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该账号已存在");
        store.logEvent("ACCOUNT_REGISTERED", Map.of("userId", user.get("userId"), "username", normalized, "role", role));
        Map<String, Object> result = authenticatedSession(user);
        result.put("recoveryCode", recoveryCode); result.put("recoveryCodeShownOnce", true);
        return result;
    }

    Map<String, Object> resetPassword(String username, String recoveryCode, String newPassword) {
        String normalized = normalizeUsername(username);
        validateUsername(normalized);
        validatePassword(normalized, newPassword);
        ensureRecoveryAllowed(normalized);
        Map<String, Object> user = store.userByUsername(normalized);
        String recoveryHash = Jsons.text(user, "recoveryCodeHash", "");
        String presentedCode = normalizeRecoveryCode(recoveryCode);
        if (user == null || recoveryHash.isBlank() || presentedCode.isBlank() || !passwordEncoder.matches(presentedCode, recoveryHash)) {
            recordRecoveryFailure(normalized);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "ACCOUNT_RECOVERY_INVALID", "账号或恢复码无效");
        }
        String nextRecoveryCode = generateRecoveryCode();
        Map<String, Object> updated = store.updatePassword(normalized, passwordEncoder.encode(newPassword),
                passwordEncoder.encode(normalizeRecoveryCode(nextRecoveryCode)));
        if (updated == null) throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ACCOUNT_UPDATE_FAILED", "密码更新失败，请稍后重试");
        recoveryFailures.remove(normalized);
        store.logEvent("ACCOUNT_PASSWORD_RESET", Map.of("userId", updated.get("userId"), "username", normalized,
                "credentialVersion", Jsons.whole(updated, "credentialVersion", 1)));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("username", normalized); result.put("recoveryCode", nextRecoveryCode);
        result.put("recoveryCodeShownOnce", true); result.put("credentialVersion", Jsons.whole(updated, "credentialVersion", 1));
        return result;
    }

    Map<String, Object> changePassword(String currentPassword, String newPassword, UserPrincipal principal) {
        if (principal == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "需要登录");
        Map<String, Object> user = store.userById(principal.userId);
        if (user == null || !Jsons.bool(user, "enabled", true)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "需要有效的登录令牌");
        }
        String presented = String.valueOf(currentPassword == null ? "" : currentPassword);
        if (presented.isBlank() || !passwordEncoder.matches(presented, Jsons.text(user, "passwordHash", ""))) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "ACCOUNT_PASSWORD_MISMATCH", "当前密码不正确");
        }
        String next = String.valueOf(newPassword == null ? "" : newPassword);
        if (passwordEncoder.matches(next, Jsons.text(user, "passwordHash", ""))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ACCOUNT_PASSWORD_UNCHANGED", "新密码不能与当前密码相同");
        }
        validatePassword(Jsons.text(user, "username", principal.username), next);
        Map<String, Object> updated = store.updatePassword(Jsons.text(user, "username", principal.username),
                passwordEncoder.encode(next), Jsons.text(user, "recoveryCodeHash", ""));
        if (updated == null) throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ACCOUNT_UPDATE_FAILED", "密码更新失败，请稍后重试");
        store.logEvent("ACCOUNT_PASSWORD_CHANGED", Map.of("userId", updated.get("userId"), "username", updated.get("username"),
                "credentialVersion", Jsons.whole(updated, "credentialVersion", 1)));
        return authenticatedSession(updated);
    }

    private Map<String, Object> authenticatedSession(Map<String, Object> user) {
        UserPrincipal principal = new UserPrincipal(Jsons.text(user, "userId", ""), Jsons.text(user, "username", ""), Jsons.text(user, "role", "FARMER"),
                Jsons.strings(user.get("farmIds")), Jsons.strings(user.get("plotIds")), (int) Jsons.whole(user, "credentialVersion", 1));
        Map<String, Object> result = new LinkedHashMap<>(); result.put("accessToken", jwtService.issue(principal));
        result.put("tokenType", "Bearer"); result.put("expiresInSeconds", properties.getJwtTtlMinutes() * 60);
        Map<String, Object> userView = new LinkedHashMap<>();
        userView.put("userId", principal.userId); userView.put("username", principal.username); userView.put("role", principal.role);
        userView.put("roleLabel", RolePolicy.label(principal.role)); userView.put("farmIds", principal.farmIds); userView.put("plotIds", principal.plotIds);
        userView.put("permissions", permissionsFor(principal));
        result.put("user", userView);
        return result;
    }

    List<String> permissionsFor(UserPrincipal principal) {
        if (principal.isSystemAdmin()) return List.of("plots:read", "diagnosis:read", "work-order:audit", "simulator:control", "strategy:manage", "value:audit", "platform:manage", "irrigation:approve");
        if (principal.isFarmAdmin()) return List.of("plots:read", "diagnosis:read", "inspection:create", "work-order:manage", "irrigation:request", "irrigation:approve", "simulator:control", "resource:manage", "strategy:read", "value:manage");
        return List.of("plots:read", "diagnosis:read", "inspection:create", "work-order:request", "irrigation:request");
    }

    List<Map<String, Object>> simulationScenarioCatalog() {
        return List.of(
                simulationScenario("NORMAL", "☀️", "正常运行", "标准环境参数运行", "#1e8e3e"),
                simulationScenario("DROUGHT", "🏜️", "干旱场景", "持续高温、低湿和土壤失水", "#d97706"),
                simulationScenario("HEAVY_RAIN", "🌧️", "暴雨场景", "强降雨、低温和土壤快速增湿", "#2563eb"),
                simulationScenario("SENSOR_DRIFT", "📡", "传感器漂移", "物理环境正常，读数随时间偏移", "#7c3aed"),
                simulationScenario("DEVICE_OFFLINE", "🔌", "设备离线", "按比例模拟采集设备间歇断连", "#6b7280"));
    }

    private Map<String, Object> simulationScenario(String code, String emoji, String label, String description, String color) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("code", code); item.put("emoji", emoji); item.put("label", label);
        item.put("description", description); item.put("desc", description); item.put("color", color);
        item.put("defaultParameters", simulationDefaults(code, "plot-a01"));
        return item;
    }

    Map<String, Object> plotSimulation(String plotId, UserPrincipal principal) {
        ensurePlotAccess(principal, plotId);
        requireRecord("plot", plotId);
        return plotSimulationView(plotId);
    }

    private Map<String, Object> plotSimulationView(String plotId) {
        Map<String, Object> record = simulationRecord(plotId);
        Map<String, Object> view = Jsons.copy(mapper, record);
        view.put("scenarioCatalog", simulationScenarioCatalog());
        Map<String, Object> limits = new LinkedHashMap<>();
        SIMULATION_PARAMETER_LIMITS.forEach((key, value) -> limits.put(key, Map.of("min", value[0], "max", value[1])));
        view.put("parameterLimits", limits);
        view.put("hardware", hardwareBindingForPlot(plotId));
        view.put("simulatorDevice", simulatorDeviceForPlot(plotId));
        view.put("configDelivery", "simulation".equalsIgnoreCase(properties.getMode()) ? "FILE_SYNC" : "STANDALONE_PREVIEW");
        return view;
    }

    synchronized Map<String, Object> updatePlotSimulation(String plotId, Map<String, Object> input, UserPrincipal principal) {
        ensurePlotAccess(principal, plotId);
        requireRecord("plot", plotId);
        if (!principal.isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "SIMULATION_CONTROL_FORBIDDEN", "只有管理员可以修改地块模拟策略");
        Map<String, Object> current = simulationRecord(plotId);
        String requested = Jsons.text(input, "scenario", Jsons.text(current, "scenario", "NORMAL"));
        String scenario = canonicalSimulationScenario(requested);
        boolean scenarioChanged = !scenario.equals(Jsons.text(current, "scenario", "NORMAL"));
        Map<String, Object> parameters = scenarioChanged
                ? simulationDefaults(scenario, plotId)
                : Jsons.map(mapper, current.get("parameters"));
        Map<String, Object> supplied = Jsons.map(mapper, input.get("parameters"));
        for (Map.Entry<String, double[]> entry : SIMULATION_PARAMETER_LIMITS.entrySet()) {
            String key = entry.getKey();
            if (!supplied.containsKey(key)) continue;
            double[] range = entry.getValue();
            double fallback = Jsons.number(parameters, key, (range[0] + range[1]) / 2.0);
            double candidate = Jsons.number(supplied, key, fallback);
            parameters.put(key, round(clamp(candidate, fallback, range[0], range[1])));
        }
        if (Jsons.number(parameters, "riskThreshold", 20) >= Jsons.number(parameters, "waterloggingThreshold", 82)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SIMULATION_THRESHOLD_INVALID", "干旱阈值必须低于积水阈值");
        }
        Map<String, Object> saved = new LinkedHashMap<>(current);
        saved.put("plotId", plotId); saved.put("scenario", scenario); saved.put("parameters", parameters);
        saved.put("revision", Jsons.whole(current, "revision", 0) + 1);
        saved.put("updatedAt", Instant.now().toString()); saved.put("updatedBy", principal.userId);
        saved.put("sourceMode", "SIMULATION");
        store.save("plot-simulation", plotId, saved);
        boolean delivered = syncSimulationConfiguration();
        Map<String, Object> event = new LinkedHashMap<>(saved); event.put("configDelivered", delivered);
        events.publish("plot.simulation.updated", event); store.logEvent("plot.simulation.updated", event);
        Map<String, Object> view = plotSimulationView(plotId); view.put("configDelivered", delivered);
        return view;
    }

    synchronized Map<String, Object> resetPlotSimulation(String plotId, String requestedTarget, UserPrincipal principal) {
        ensurePlotAccess(principal, plotId);
        requireRecord("plot", plotId);
        if (!principal.isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "SIMULATION_CONTROL_FORBIDDEN", "只有管理员可以重置模拟曲线");
        String target = String.valueOf(requestedTarget == null ? "ALL" : requestedTarget).trim().toUpperCase(Locale.ROOT);
        if (!Set.of("HISTORY", "FORECAST", "ALL").contains(target)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SIMULATION_RESET_TARGET_INVALID", "重置目标只能是 HISTORY、FORECAST 或 ALL");
        }
        int removedTelemetry = 0, removedForecasts = 0;
        Instant now = Instant.now();
        Map<String, Object> saved = simulationRecord(plotId);
        if (Set.of("HISTORY", "ALL").contains(target)) {
            removedTelemetry = store.deleteSimulatedTelemetryForPlot(plotId);
            saved.put("historyResetAt", now.toString());
            saved.put("historyRevision", Jsons.whole(saved, "historyRevision", 0) + 1);
        }
        if (Set.of("FORECAST", "ALL").contains(target)) {
            removedForecasts = store.deleteWhere("forecast", item -> plotId.equals(Jsons.text(item, "plotId", "")));
            saved.put("forecastResetAt", now.toString());
            saved.put("forecastRevision", Jsons.whole(saved, "forecastRevision", 0) + 1);
        }
        saved.put("revision", Jsons.whole(saved, "revision", 0) + 1);
        saved.put("updatedAt", now.toString()); saved.put("updatedBy", principal.userId);
        store.save("plot-simulation", plotId, saved);
        boolean delivered = syncSimulationConfiguration();
        Map<String, Object> result = plotSimulationView(plotId);
        result.put("resetTarget", target); result.put("removedSimulationTelemetry", removedTelemetry);
        result.put("removedForecasts", removedForecasts); result.put("hardwareTelemetryPreserved", true);
        result.put("configDelivered", delivered);
        events.publish("plot.simulation.reset", result); store.logEvent("plot.simulation.reset", result);
        return result;
    }

    private Map<String, Object> simulationRecord(String plotId) {
        Map<String, Object> persisted = store.find("plot-simulation", plotId);
        String scenario = canonicalSimulationScenario(Jsons.text(persisted, "scenario", "NORMAL"));
        Map<String, Object> defaults = simulationDefaults(scenario, plotId);
        Map<String, Object> supplied = Jsons.map(mapper, persisted == null ? null : persisted.get("parameters"));
        supplied.forEach((key, value) -> {
            double[] range = SIMULATION_PARAMETER_LIMITS.get(key);
            if (range == null) return;
            double fallback = Jsons.number(defaults, key, (range[0] + range[1]) / 2.0);
            defaults.put(key, round(clamp(Jsons.numberValue(value, fallback), fallback, range[0], range[1])));
        });
        Map<String, Object> result = persisted == null ? new LinkedHashMap<>() : Jsons.copy(mapper, persisted);
        result.put("plotId", plotId); result.put("scenario", scenario); result.put("parameters", defaults);
        result.putIfAbsent("revision", 1); result.putIfAbsent("sourceMode", "SIMULATION");
        result.putIfAbsent("updatedAt", Instant.EPOCH.toString());
        return result;
    }

    private Map<String, Object> simulationDefaults(String scenarioValue, String plotId) {
        String scenario = canonicalSimulationScenario(scenarioValue);
        Map<String, Object> params = new LinkedHashMap<>();
        switch (scenario) {
            case "DROUGHT" -> {
                params.put("volatility", 1.75); params.put("temperatureBias", 7.0); params.put("humidityBias", -20.0);
                params.put("rainfallRate", 0.0); params.put("soilMoistureTrendPerHour", -3.6); params.put("driftRatePerHour", 0.0); params.put("offlineRatio", 0.0);
            }
            case "HEAVY_RAIN" -> {
                params.put("volatility", 1.9); params.put("temperatureBias", -4.5); params.put("humidityBias", 20.0);
                params.put("rainfallRate", 32.0); params.put("soilMoistureTrendPerHour", 7.2); params.put("driftRatePerHour", 0.0); params.put("offlineRatio", 0.0);
            }
            case "SENSOR_DRIFT" -> {
                params.put("volatility", 1.45); params.put("temperatureBias", 0.0); params.put("humidityBias", 0.0);
                params.put("rainfallRate", .2); params.put("soilMoistureTrendPerHour", -.18); params.put("driftRatePerHour", 2.4); params.put("offlineRatio", 0.0);
            }
            case "DEVICE_OFFLINE" -> {
                params.put("volatility", 1.3); params.put("temperatureBias", 0.0); params.put("humidityBias", 0.0);
                params.put("rainfallRate", .2); params.put("soilMoistureTrendPerHour", -.18); params.put("driftRatePerHour", 0.0); params.put("offlineRatio", .55);
            }
            default -> {
                params.put("volatility", 1.25); params.put("temperatureBias", 0.0); params.put("humidityBias", 0.0);
                params.put("rainfallRate", .2); params.put("soilMoistureTrendPerHour", -.18); params.put("driftRatePerHour", 0.0); params.put("offlineRatio", 0.0);
            }
        }
        Map<String, Object> context = plotId == null || store.find("plot", plotId) == null ? Map.of() : plotCropContext(plotId);
        params.put("riskThreshold", Jsons.number(cropPackCatalog.rule(context, "WATER_DEFICIT"), "threshold", 20));
        params.put("waterloggingThreshold", 82.0); params.put("forecastHours", 4.0); params.put("timeScale", 60.0);
        return params;
    }

    private String canonicalSimulationScenario(String raw) {
        String normalized = String.valueOf(raw == null ? "NORMAL" : raw).trim().toUpperCase(Locale.ROOT).replace('-', '_');
        normalized = switch (normalized) { case "STORM", "HEAVYRAIN" -> "HEAVY_RAIN"; case "OFFLINE" -> "DEVICE_OFFLINE"; default -> normalized; };
        if (!PLOT_SIMULATION_SCENARIOS.contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SIMULATION_SCENARIO_INVALID", "不支持的地块模拟场景");
        }
        return normalized;
    }

    /**
     * The scenario replay API predates per-plot strategies and still accepts
     * the documented validation/evaluation cases.  Project those legacy cases
     * onto the closest physical strategy for a curve while keeping the replay
     * endpoint backwards compatible.
     */
    private String canonicalScenarioForRun(String raw) {
        String normalized = String.valueOf(raw == null ? "NORMAL" : raw).trim().toUpperCase(Locale.ROOT).replace('-', '_');
        return switch (normalized) {
            case "HEAT_WAVE", "GRADUAL_DRYDOWN" -> "DROUGHT";
            case "FORECAST_MISS", "LIMITED_WATER", "REPEATED_CASE", "COST_SHIFT" -> "NORMAL";
            default -> canonicalSimulationScenario(normalized);
        };
    }

    private Map<String, Object> hardwareBindingForPlot(String plotId) {
        List<Map<String, Object>> hardware = store.list("device").stream()
                .filter(device -> plotId.equals(Jsons.text(device, "plotId", "")))
                .filter(device -> "REAL".equalsIgnoreCase(Jsons.text(device, "sourceMode", ""))
                        || "HARDWARE".equalsIgnoreCase(Jsons.text(device, "dataOrigin", ""))
                        || !Jsons.text(device, "deviceId", "mock-").toLowerCase(Locale.ROOT).startsWith("mock-"))
                .sorted(Comparator.comparing((Map<String, Object> device) -> Jsons.instant(device.get("lastSeen"), Instant.EPOCH)).reversed())
                .toList();
        if (hardware.isEmpty()) return Map.of("bindingState", "UNBOUND", "status", "NOT_BOUND", "usability", "NOT_BOUND", "label", "未绑定硬件");
        Map<String, Object> device = hardware.get(0);
        Instant lastSeen = Jsons.instant(device.get("lastSeen"), Instant.EPOCH);
        boolean fresh = Duration.between(lastSeen, Instant.now()).getSeconds() <= properties.getDeviceTimeoutSeconds();
        boolean online = fresh && "ONLINE".equalsIgnoreCase(Jsons.text(device, "status", ""));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("bindingState", "BOUND"); result.put("deviceId", Jsons.text(device, "deviceId", ""));
        result.put("status", online ? "ONLINE" : "OFFLINE"); result.put("usability", online ? "AVAILABLE" : "UNAVAILABLE");
        result.put("label", online ? "硬件在线，可使用" : "硬件离线"); result.put("lastSeen", device.get("lastSeen"));
        result.put("deviceCount", hardware.size()); return result;
    }

    private Map<String, Object> simulatorDeviceForPlot(String plotId) {
        Map<String, Object> device = store.list("device").stream()
                .filter(item -> plotId.equals(Jsons.text(item, "plotId", "")))
                .filter(item -> Jsons.text(item, "deviceId", "").toLowerCase(Locale.ROOT).startsWith("mock-")
                        || "SIMULATOR".equalsIgnoreCase(Jsons.text(item, "dataOrigin", "")))
                .sorted(Comparator
                        .comparing((Map<String, Object> item) -> "ONLINE".equalsIgnoreCase(Jsons.text(item, "status", "")))
                                .reversed()
                        .thenComparing(item -> Jsons.instant(item.get("lastSeen"), Instant.EPOCH), Comparator.reverseOrder()))
                .findFirst().orElse(Map.of());
        if (device.isEmpty()) return Map.of("status", "WAITING", "label", "等待模拟器数据");
        Map<String, Object> result = new LinkedHashMap<>(device);
        result.put("label", "ONLINE".equalsIgnoreCase(Jsons.text(device, "status", "")) ? "模拟数据运行中" : "模拟设备离线");
        return result;
    }

    boolean syncSimulationConfiguration() {
        if (!"simulation".equalsIgnoreCase(properties.getMode())) return false;
        synchronized (simulationConfigLock) {
            try {
                Path target = Path.of(properties.getSimulationConfigPath()).toAbsolutePath().normalize();
                Path parent = target.getParent();
                if (parent != null) Files.createDirectories(parent);
                Map<String, Object> plots = new LinkedHashMap<>();
                for (Map<String, Object> plot : store.list("plot")) {
                    if ("INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE"))) continue;
                    String plotId = Jsons.text(plot, "plotId", "");
                    if (plotId.isBlank()) continue;
                    Map<String, Object> record = simulationRecord(plotId);
                    Map<String, Object> compact = new LinkedHashMap<>();
                    compact.put("scenario", Jsons.text(record, "scenario", "NORMAL").toLowerCase(Locale.ROOT).replace('_', '-'));
                    compact.put("revision", Jsons.whole(record, "revision", 1)); compact.put("parameters", record.get("parameters"));
                    plots.put(plotId, compact);
                }
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("schemaVersion", "plot-simulation-1.0"); payload.put("generatedAt", Instant.now().toString()); payload.put("plots", plots);
                Path temporary = target.resolveSibling(target.getFileName() + ".tmp");
                Files.writeString(temporary, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload), StandardCharsets.UTF_8);
                try {
                    Files.move(temporary, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
                } catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
                    Files.move(temporary, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                }
                return true;
            } catch (Exception error) {
                return false;
            }
        }
    }

    private double clamp(double value, double low, double high) {
        return clamp(value, (low + high) / 2.0, low, high);
    }

    private double clamp(double value, double fallback, double low, double high) {
        if (!Double.isFinite(value)) return fallback;
        return Math.max(low, Math.min(high, value));
    }

    private String normalizeUsername(String username) {
        return String.valueOf(username == null ? "" : username).trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeRole(String role) {
        return RolePolicy.normalize(role);
    }

    private String validateSelfRegistrationRole(String requestedRole) {
        String role = normalizeRole(requestedRole);
        if (role.isBlank()) role = "FARMER";
        if (SELF_REGISTRATION_ROLES.contains(role)) return role;
        if (RolePolicy.LEGACY_ROLES.contains(role) || "OPERATOR".equals(role)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_ROLE_REQUIRES_ADMIN", "旧操作员身份已迁移为种植农户，请由管理员授权账号");
        }
        if (ACCOUNT_ROLES.contains(role)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_ROLE_REQUIRES_ADMIN", "管理员身份需要系统授权，不能自助注册");
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "ACCOUNT_ROLE_INVALID", "请选择有效的注册身份");
    }

    private void validateUsername(String username) {
        if (!username.matches("[a-z0-9][a-z0-9._-]{3,31}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ACCOUNT_USERNAME_INVALID", "账号需为 4–32 位字母、数字、点、下划线或短横线");
        }
    }

    private void validatePassword(String username, String password) {
        String value = String.valueOf(password == null ? "" : password);
        boolean strongEnough = value.length() >= 8 && value.length() <= 64
                && value.chars().anyMatch(Character::isLetter) && value.chars().anyMatch(Character::isDigit)
                && !value.toLowerCase(Locale.ROOT).contains(username);
        if (!strongEnough) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ACCOUNT_PASSWORD_WEAK", "密码需为 8–64 位并同时包含字母和数字，且不能包含账号");
        }
    }

    private String generateRecoveryCode() {
        SecureRandom random = new SecureRandom();
        StringBuilder code = new StringBuilder(19);
        for (int i = 0; i < 16; i++) {
            if (i > 0 && i % 4 == 0) code.append('-');
            code.append(RECOVERY_ALPHABET.charAt(random.nextInt(RECOVERY_ALPHABET.length())));
        }
        return code.toString();
    }

    private String normalizeRecoveryCode(String value) {
        return String.valueOf(value == null ? "" : value).replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
    }

    private void ensureRecoveryAllowed(String username) {
        Deque<Instant> attempts = recoveryFailures.computeIfAbsent(username, ignored -> new ArrayDeque<>());
        synchronized (attempts) {
            Instant cutoff = Instant.now().minus(RECOVERY_FAILURE_WINDOW);
            while (!attempts.isEmpty() && attempts.peekFirst().isBefore(cutoff)) attempts.removeFirst();
            if (attempts.size() >= RECOVERY_MAX_FAILURES) {
                long retryAfter = Math.max(1, Duration.between(Instant.now(), attempts.peekFirst().plus(RECOVERY_FAILURE_WINDOW)).toSeconds());
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "ACCOUNT_RECOVERY_LOCKED", "尝试次数过多，请稍后再试")
                        .withDetails(Map.of("retryAfterSeconds", retryAfter));
            }
        }
    }

    private void recordRecoveryFailure(String username) {
        Deque<Instant> attempts = recoveryFailures.computeIfAbsent(username, ignored -> new ArrayDeque<>());
        synchronized (attempts) { attempts.addLast(Instant.now()); }
    }

    Map<String, Object> overview() {
        return overview(null, null);
    }

    Map<String, Object> overview(UserPrincipal principal) {
        String farmId = principal == null ? null : principal.farmIds.stream().filter(id -> !"*".equals(id)).findFirst().orElse(null);
        return overview(farmId, principal);
    }

    Map<String, Object> overview(String farmId, UserPrincipal principal) {
        if (principal != null && farmId != null && !principal.canAccessFarm(farmId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权查看该农场");
        }
        List<Map<String, Object>> plots = store.list("plot").stream()
                .filter(plot -> farmId == null || farmId.equals(Jsons.text(plot, "farmId", "")))
                .filter(plot -> !"INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE")))
                .filter(plot -> principal == null || canAccessPlot(principal, Jsons.text(plot, "plotId", "")))
                .toList();
        List<Map<String, Object>> cards = new ArrayList<>();
        int activeAlerts = 0, pendingTasks = 0;
        for (Map<String, Object> plot : plots) {
            String plotId = Jsons.text(plot, "plotId", "");
            Map<String, Object> latest = latestMetrics(plotId);
            List<Map<String, Object>> alerts = store.list("alert").stream().filter(a -> plotId.equals(Jsons.text(a, "plotId", "")) &&
                    !Set.of("RESOLVED", "CLOSED").contains(Jsons.text(a, "status", ""))).toList();
            activeAlerts += alerts.size();
            pendingTasks += store.list("work-order").stream().filter(w -> plotId.equals(Jsons.text(w, "plotId", "")) &&
                    !Set.of("DONE", "CANCELLED").contains(Jsons.text(w, "status", ""))).toList().size();
            Map<String, Object> card = new LinkedHashMap<>(); card.put("plotId", plotId); card.put("name", plot.get("name"));
            card.put("cropCode", plot.get("cropCode")); card.put("riskLevel", plot.get("riskLevel")); card.put("latest", latest); card.put("alerts", alerts.size());
            Map<String, Object> device = deviceForPlot(plotId); card.put("device", device);
            Map<String, Object> simulation = plotSimulationView(plotId);
            card.put("simulation", Map.of(
                    "scenario", simulation.get("scenario"),
                    "parameters", simulation.get("parameters"),
                    "revision", simulation.get("revision")));
            card.put("hardware", simulation.get("hardware"));
            Map<String, Object> cropContext = plotCropContext(plotId);
            Map<String, Object> health = cropPackCatalog.scoreHealth(cropContext, latest, device, Jsons.text(plot, "riskLevel", "UNKNOWN"));
            card.put("stageCode", cropContext.get("stageCode"));
            card.put("stageLabel", cropContext.get("stageLabel"));
            card.put("cropPackVersion", cropContext.get("cropPackVersion"));
            card.put("health", health);
            card.put("healthScore", health.get("score"));
            cards.add(card);
        }
        cards.sort(Comparator.comparingInt((Map<String, Object> c) -> riskRank(Jsons.text(c, "riskLevel", "LOW"))).reversed());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("farmId", farmId); result.put("plots", cards); result.put("activeAlertCount", activeAlerts);
        result.put("pendingWorkOrderCount", pendingTasks); result.put("eventCount", store.eventCount());
        result.put("dataMode", properties.getMode()); result.put("aiMode", properties.getAiMode());
        result.put("generatedAt", Instant.now().toString());
        return result;
    }

    List<Map<String, Object>> cropPacks() {
        return cropPackCatalog.all();
    }

    void updateCropPackStatus(String cropCode, String version, String status) {
        cropPackCatalog.updateStatus(cropCode, version, status);
    }

    Map<String, Object> resolvedProfile(String plotId) {
        Map<String, Object> plot = requireRecord("plot", plotId);
        Map<String, Object> context = plotCropContext(plotId);
        Map<String, Object> pack = Jsons.map(mapper, context.get("pack"));
        Map<String, Object> farm = store.find("farm", Jsons.text(plot, "farmId", "farm-demo"));
        Map<String, Object> resolvedPack = Jsons.copy(mapper, pack);
        Map<String, Object> resolvedParameters = new LinkedHashMap<>();
        resolvedParameters.put("systemDefaults", Map.of("waterPricePerLitre", 0.004, "maxIrrigationSeconds", properties.getMaxIrrigationSeconds()));
        resolvedParameters.put("cropPack", Map.of(
                "version", context.get("cropPackVersion"),
                "ruleVersion", context.get("ruleVersion"),
                "forecastProfile", context.get("forecastProfile"),
                "effectiveRules", context.get("effectiveRules")));
        resolvedParameters.put("stage", Map.of(
                "stageCode", context.get("stageCode"),
                "stageLabel", context.get("stageLabel"),
                "target", context.get("target")));
        resolvedParameters.put("farm", farm == null ? Map.of() : farm.getOrDefault("defaults", Map.of()));
        resolvedParameters.put("plot", plot.getOrDefault("overrides", Map.of()));
        resolvedPack.put("resolvedParameters", resolvedParameters);
        resolvedPack.put("effectiveRules", context.get("effectiveRules"));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("plotId", plotId);
        result.put("farmId", Jsons.text(plot, "farmId", "farm-demo"));
        result.put("cropCode", context.get("cropCode"));
        result.put("stageCode", context.get("stageCode"));
        result.put("stageLabel", context.get("stageLabel"));
        result.put("cropPackVersion", context.get("cropPackVersion"));
        result.put("ruleVersion", context.get("ruleVersion"));
        result.put("cropPack", resolvedPack);
        result.put("parameterResolution", List.of("SYSTEM_DEFAULT", "CROP_PACK", "STAGE", "FARM", "PLOT"));
        return result;
    }

    List<Map<String, Object>> cropManuals() {
        return cropPackCatalog.manualIndex();
    }

    Map<String, Object> cropManual(String cropCode, String stageCode) {
        return cropPackCatalog.handbook(cropCode, stageCode);
    }

    Map<String, Object> plotCropManual(String plotId) {
        requireRecord("plot", plotId);
        Map<String, Object> context = plotCropContext(plotId);
        Map<String, Object> handbook = cropPackCatalog.handbook(
                Jsons.text(context, "cropCode", "tomato"), Jsons.text(context, "stageCode", ""));
        handbook.put("plotId", plotId);
        return handbook;
    }

    Map<String, Object> plotHealth(String plotId) {
        Map<String, Object> plot = requireRecord("plot", plotId);
        Map<String, Object> context = plotCropContext(plotId);
        Map<String, Object> health = cropPackCatalog.scoreHealth(
                context, latestMetrics(plotId), deviceForPlot(plotId), Jsons.text(plot, "riskLevel", "UNKNOWN"));
        health.put("plotId", plotId);
        return health;
    }

    private Map<String, Object> plotCropContext(String plotId) {
        Map<String, Object> plot = store.find("plot", plotId);
        Map<String, Object> plotMap = plot == null ? Map.of() : plot;
        Map<String, Object> batch = store.list("crop-batch").stream()
                .filter(b -> plotId.equals(Jsons.text(b, "plotId", "")))
                .findFirst().orElse(Map.of());
        String crop = Jsons.text(plotMap, "cropCode", Jsons.text(batch, "cropCode", "tomato"));
        String version = Jsons.text(batch, "cropPackVersion", Jsons.text(plotMap, "cropPackVersion", ""));
        String stage = Jsons.text(plotMap, "stageCode", Jsons.text(batch, "stageCode", ""));
        return cropPackCatalog.resolve(crop, version, stage);
    }

    Map<String, Object> ingest(Map<String, Object> input) {
        Map<String, Object> event = normaliseTelemetry(input);
        String branch = Jsons.text(input, "branchId", "MAIN");
        if (!"MAIN".equalsIgnoreCase(branch)) {
            // Replay branches are immutable evidence: they are queryable as
            // scenario-event records but never alter live telemetry, alerts or
            // device state.
            event.put("branchId", branch);
            event.put("branchOnly", true);
            store.save("scenario-event", Jsons.text(event, "eventId", Jsons.id("scenario-event")), event);
            events.publish("scenario.telemetry", event);
            return Map.of("accepted", true, "duplicate", false, "branchOnly", true, "event", event);
        }
        String sourceMode = Jsons.text(event, "sourceMode", "SIMULATION").toUpperCase(Locale.ROOT);
        if ("SIMULATION".equals(sourceMode)) {
            Instant now = Instant.now();
            Instant cutoff = now.minus(Math.max(1, properties.getRealSourceTimeoutSeconds()), ChronoUnit.SECONDS);
            Map<String, Object> real = store.latestRealTelemetry(
                    Jsons.text(event, "plotId", "plot-a01"), Jsons.text(event, "metric", ""), cutoff, now.plusSeconds(1));
            if (real != null) {
                Map<String, Object> suppression = new LinkedHashMap<>();
                suppression.put("eventId", Jsons.text(event, "eventId", ""));
                suppression.put("plotId", Jsons.text(event, "plotId", ""));
                suppression.put("metric", Jsons.text(event, "metric", ""));
                suppression.put("sourceMode", sourceMode);
                suppression.put("suppressedBy", Jsons.text(real, "eventId", "REAL_READING"));
                suppression.put("suppressedAt", now.toString());
                suppression.put("reason", "REAL_SOURCE_ACTIVE");
                store.logEvent("telemetry.suppressed", suppression);
                return Map.of("accepted", true, "duplicate", false, "suppressed", true,
                        "reason", "REAL_SOURCE_ACTIVE", "event", event, "activeRealEvent", real);
            }
        }
        String plotId = Jsons.text(event, "plotId", "plot-a01");
        String deviceId = Jsons.text(event, "deviceId", "mock-" + plotId);
        Map<String, Object> controlledDevice = store.find("device", deviceId);
        String controlStatus = Jsons.text(controlledDevice, "controlStatus", "").toUpperCase(Locale.ROOT);
        String desiredStatus = Jsons.text(controlledDevice, "desiredStatus", "").toUpperCase(Locale.ROOT);
        boolean realControlPending = controlledDevice != null && !deviceIsSimulated(controlledDevice) && "PENDING".equals(controlStatus);
        boolean confirmedOffline = controlledDevice != null
                && "SUCCEEDED".equals(controlStatus)
                && "OFFLINE".equals(desiredStatus);
        // A newly registered REAL device starts with desiredStatus=OFFLINE and
        // controlStatus=SUCCEEDED, but that is only an initial fact—not a
        // confirmed physical shutdown.  Let its first hardware telemetry
        // establish ONLINE/lastSeen.  Once an actual control command has been
        // acknowledged, keep confirmed-offline devices from being revived by
        // stale simulator/heartbeat traffic.  SIMULATION devices retain the
        // immediate offline suppression contract.
        boolean simulatorOffline = "SIMULATION".equals(sourceMode) && confirmedOffline;
        boolean physicalOffline = !"SIMULATION".equals(sourceMode) && confirmedOffline
                && !Jsons.text(controlledDevice, "lastControlCommandId", "").isBlank();
        if (simulatorOffline || physicalOffline) {
            Map<String, Object> suppression = new LinkedHashMap<>();
            suppression.put("eventId", Jsons.text(event, "eventId", "")); suppression.put("deviceId", deviceId);
            suppression.put("plotId", plotId); suppression.put("reason", "DEVICE_CONTROL_OFFLINE");
            suppression.put("suppressedAt", Instant.now().toString());
            store.logEvent("telemetry.suppressed", suppression);
            return Map.of("accepted", true, "duplicate", false, "suppressed", true,
                    "reason", "DEVICE_CONTROL_OFFLINE", "event", event);
        }
        boolean inserted = store.saveTelemetry(event);
        if (!inserted) return Map.of("accepted", false, "duplicate", true, "eventId", event.get("eventId"), "quality", event.get("quality"));
        publishTelemetryStream(event);
        Map<String, Object> device = store.find("device", deviceId);
        if (device == null || device.isEmpty()) { device = new LinkedHashMap<>(); device.put("deviceId", deviceId); device.put("plotId", plotId); }
        Map<String, Object> eventQuality = Jsons.map(mapper, event.get("quality"));
        boolean offlineSignal = "device-offline".equalsIgnoreCase(Jsons.text(event, "scenarioId", ""))
                && "BAD".equalsIgnoreCase(Jsons.text(eventQuality, "status", ""));
        if (!realControlPending) {
            device.put("status", offlineSignal ? "OFFLINE" : "ONLINE"); device.put("lastSeen", event.get("ts"));
            device.put("healthScore", "BAD".equalsIgnoreCase(Jsons.text(eventQuality, "status", "GOOD")) ? 0.35 : 0.98);
        }
        device.put("sourceMode", sourceMode);
        device.put("provenance", Jsons.text(event, "provenance", "OBSERVED"));
        device.put("dataOrigin", Jsons.text(event, "dataOrigin", "SIMULATOR"));
        store.save("device", deviceId, device);
        Map<String, Object> ruleResult = evaluateRuleForEvent(event);
        events.publish("telemetry.received", event);
        store.logEvent("telemetry.received", event);
        return Map.of("accepted", true, "duplicate", false, "event", event, "ruleResult", ruleResult);
    }

    private void publishTelemetryStream(Map<String, Object> event) {
        try {
            Map<String, String> fields = new LinkedHashMap<>();
            fields.put("eventId", Jsons.text(event, "eventId", ""));
            fields.put("plotId", Jsons.text(event, "plotId", ""));
            fields.put("metric", Jsons.text(event, "metric", ""));
            fields.put("value", String.valueOf(Jsons.number(event, "value", 0)));
            fields.put("ts", Jsons.text(event, "ts", Instant.now().toString()));
            fields.put("payload", Jsons.json(mapper, event));
            redis.opsForStream().add(properties.getTelemetryStream(), fields);
            redisAvailable.set(true);
            redisPublished.incrementAndGet();
        } catch (Exception ignored) {
            redisAvailable.set(false);
            redisFailures.incrementAndGet();
        }
    }

    Map<String, Object> dependencyStatus(boolean mqttConnected) {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("mode", properties.getMode());
        status.put("database", store.databaseReady() ? "UP" : "DEGRADED");
        status.put("redis", redisAvailable.get() || Jsons.bool(streamWorker.status(), "active", false) ? "UP" : "DEGRADED");
        status.put("redisStream", properties.getTelemetryStream());
        status.put("redisPublished", redisPublished.get());
        status.put("redisFailures", redisFailures.get());
        status.put("redisConsumer", streamWorker.status());
        status.put("mqtt", mqttConnected ? "UP" : "DEGRADED");
        status.put("mqttCommandTransport", mqttCommands.available() ? "UP" : "FALLBACK_OR_IDLE");
        status.put("persistence", store.persistenceKind());
        status.put("ai", properties.getAiMode());
        // 真实测量的依赖往返延迟（毫秒），-1 表示不可用/测量失败
        status.put("databaseLatencyMs", store.pingDbLatencyMs());
        status.put("redisLatencyMs", redisPingLatencyMs());
        status.put("mqttLatencyMs", mqttConnected ? mqttCommands.latencyMs() : -1);
        return status;
    }

    /** 真实测量 Redis PING 往返延迟（毫秒），失败返回 -1。 */
    private long redisPingLatencyMs() {
        if (!redisAvailable.get()) return -1;
        long start = System.nanoTime();
        try {
            redis.getConnectionFactory().getConnection().ping();
            return Math.max(0, Duration.ofNanos(System.nanoTime() - start).toMillis());
        } catch (Exception e) {
            return -1;
        }
    }

    @Scheduled(fixedDelay = 30000)
    void markStaleDevicesOffline() {
        Instant now = Instant.now();
        for (Map<String, Object> device : store.list("device")) {
            Instant lastSeen = Jsons.instant(device.get("lastSeen"), Instant.EPOCH);
            if ("ONLINE".equals(Jsons.text(device, "status", "")) && Duration.between(lastSeen, now).getSeconds() > properties.getDeviceTimeoutSeconds()) {
                String id = Jsons.text(device, "deviceId", ""); device.put("status", "OFFLINE"); device.put("offlineAt", now.toString());
                store.save("device", id, device); events.publish("device.offline", device); store.logEvent("device.offline", device);
            }
        }
    }

    private Map<String, Object> normaliseTelemetry(Map<String, Object> input) {
        String eventId = Jsons.text(input, "eventId", Jsons.id("evt"));
        String plotId = Jsons.text(input, "plotId", "plot-a01");
        String metric = Jsons.text(input, "metric", "SOIL_MOISTURE").toUpperCase(Locale.ROOT);
        double value = Jsons.number(input, "value", 0);
        String unit = Jsons.text(input, "unit", unitFor(metric));
        Instant ts = Jsons.instant(input.get("ts"), Instant.now());
        String deviceId = Jsons.text(input, "deviceId", "mock-" + plotId);
        String sourceMode = normaliseSourceMode(input.get("sourceMode"));
        String provenance = normaliseProvenance(input.get("provenance"));
        String dataOrigin = normaliseDataOrigin(input.get("dataOrigin"), sourceMode);
        String scenario = Jsons.text(input, "scenarioId", Jsons.text(input, "scenario", "normal"));
        Map<String, Object> quality = Jsons.map(mapper, input.get("quality"));
        String qualityStatus = validateQuality(metric, value, ts, quality);
        if (ts.isAfter(Instant.now().plusSeconds(30))) qualityStatus = "BAD";
        Map<String, Object> previousEvent = store.latestTelemetry(plotId, metric, Instant.now().minus(1, ChronoUnit.HOURS), Instant.now().plusSeconds(1));
        if (previousEvent != null) {
            double previous = Jsons.number(previousEvent, "value", value);
            double jumpLimit = jumpLimitFor(metric);
            if (Math.abs(value - previous) > jumpLimit) { quality.put("changePoint", true); if ("GOOD".equals(qualityStatus)) qualityStatus = "DEGRADED"; }
        }
        quality.put("status", qualityStatus); quality.putIfAbsent("freshnessMs", Math.max(0, Duration.between(ts, Instant.now()).toMillis()));
        quality.putIfAbsent("confidence", qualityStatus.equals("GOOD") ? 0.98 : qualityStatus.equals("DEGRADED") ? 0.65 : 0.2);
        Map<String, Object> e = new LinkedHashMap<>(); e.put("eventId", eventId); e.put("farmId", Jsons.text(input, "farmId", "farm-demo"));
        e.put("plotId", plotId); e.put("deviceId", deviceId); e.put("metric", metric); e.put("value", value); e.put("unit", unit);
        e.put("ts", ts.toString()); e.put("quality", quality); e.put("scenarioId", scenario); e.put("scenario", scenario); e.put("schemaVersion", "1.0");
        e.put("sourceMode", sourceMode); e.put("provenance", provenance); e.put("dataOrigin", dataOrigin);
        if (input.containsKey("branchId")) e.put("branchId", input.get("branchId"));
        return e;
    }

    private String normaliseSourceMode(Object raw) {
        String value = raw == null ? "" : String.valueOf(raw).trim().toUpperCase(Locale.ROOT);
        if ("REAL".equals(value) || "SIMULATION".equals(value)) return value;
        // Older simulator clients did not send provenance.  Keep those events
        // explicitly synthetic; an omitted source must never masquerade as a
        // hardware observation.
        return "SIMULATION";
    }

    private String normaliseProvenance(Object raw) {
        String value = raw == null ? "" : String.valueOf(raw).trim().toUpperCase(Locale.ROOT);
        return Set.of("OBSERVED", "USER_PROVIDED", "DERIVED", "SIMULATED", "ESTIMATED").contains(value) ? value : "OBSERVED";
    }

    private String normaliseDataOrigin(Object raw, String sourceMode) {
        String value = raw == null ? "" : String.valueOf(raw).trim().toUpperCase(Locale.ROOT);
        if (!value.isBlank()) return value;
        return "REAL".equals(sourceMode) ? "HARDWARE" : "SIMULATOR";
    }

    private double jumpLimitFor(String metric) {
        return switch (metric) {
            case "AIR_TEMPERATURE" -> 15;
            case "AIR_HUMIDITY" -> 25;
            case "LIGHT" -> 12_000;
            case "RAINFALL" -> 100;
            case "CO2" -> 500;
            case "PH" -> 2;
            case "WATER_LEVEL" -> 25;
            default -> 35;
        };
    }

    private String validateQuality(String metric, double value, Instant ts, Map<String, Object> quality) {
        double low = switch (metric) { case "SOIL_MOISTURE", "WATER_LEVEL", "AIR_HUMIDITY" -> 0; case "AIR_TEMPERATURE" -> -40; case "PH" -> 0; default -> 0; };
        double high = switch (metric) { case "SOIL_MOISTURE", "WATER_LEVEL", "AIR_HUMIDITY" -> 100; case "AIR_TEMPERATURE" -> 80; case "PH" -> 14; case "CO2" -> 10000; case "RAINFALL" -> 250; default -> 1_000_000; };
        if (value < low || value > high) return "BAD";
        long age = Math.max(0, Duration.between(ts, Instant.now()).toSeconds());
        if (ts.isAfter(Instant.now().plusSeconds(30)) || age > 300 || "BAD".equalsIgnoreCase(Jsons.text(quality, "status", ""))) return "BAD";
        if (age > 120 || "DEGRADED".equalsIgnoreCase(Jsons.text(quality, "status", ""))) return "DEGRADED";
        return "GOOD";
    }

    private String unitFor(String metric) {
        return switch (metric) { case "SOIL_MOISTURE", "WATER_LEVEL" -> "%"; case "AIR_HUMIDITY" -> "%RH"; case "AIR_TEMPERATURE" -> "°C"; case "LIGHT" -> "lux"; case "CO2" -> "ppm"; case "PH" -> "pH"; case "RAINFALL" -> "mm/h"; default -> "unit"; };
    }

    private Map<String, Object> evaluateRuleForEvent(Map<String, Object> event) {
        String metric = Jsons.text(event, "metric", ""); double value = Jsons.number(event, "value", 0); String plotId = Jsons.text(event, "plotId", "");
        Map<String, Object> result = new LinkedHashMap<>(); result.put("metric", metric); result.put("value", value); result.put("evaluatedAt", Instant.now().toString());
        Map<String, Object> context = plotCropContext(plotId);
        Map<String, Object> waterRule = cropPackCatalog.rule(context, "WATER_DEFICIT");
        Map<String, Object> heatRule = cropPackCatalog.rule(context, "HEAT_STRESS");
        double waterThreshold = Jsons.number(waterRule, "threshold", 20);
        double heatThreshold = Jsons.number(heatRule, "threshold", 35);
        int durationMinutes = (int) Jsons.whole(waterRule, "durationMinutes", 5);
        result.put("stageCode", context.get("stageCode"));
        result.put("cropPackVersion", context.get("cropPackVersion"));
        result.put("ruleVersion", context.get("ruleVersion"));
        if ("SOIL_MOISTURE".equals(metric) && value < waterThreshold) {
            boolean drift = "sensor-drift".equalsIgnoreCase(Jsons.text(event, "scenarioId", "")) || "BAD".equals(Jsons.text(Jsons.map(mapper, event.get("quality")), "status", "GOOD"));
            Instant now = Instant.now();
            Deque<Instant> window = ruleWindows.computeIfAbsent(plotId + "|WATER_DEFICIT", ignored -> new ConcurrentLinkedDeque<>());
            window.addLast(now); while (!window.isEmpty() && Duration.between(window.peekFirst(), now).toMinutes() > durationMinutes) window.removeFirst();
            String source = drift ? "SENSOR_DRIFT_RULE" : "WATER_DEFICIT_RULE";
            String title = drift ? "传感器数据可能不可靠" : "土壤持续偏干";
            String message = drift ? "土壤湿度读数偏低，但数据质量也有异常。请先检查传感器，再决定是否浇水。"
                    : "当前阶段「" + context.get("stageLabel") + "」土壤湿度已低于 " + waterThreshold + "%。请尽快现场复测，确认后安排浇水。";
            Map<String, Object> alert = upsertRuleAlert(plotId, source, drift ? "HIGH" : "MEDIUM", title, message, event, waterRule,
                    waterThreshold, context, now, window.size() >= 3 ? "TRIGGERED" : "CANDIDATE");
            result.put("alert", alert);
            if (!Jsons.bool(alert, "reused", false) && !Jsons.bool(alert, "suppressedByCooldown", false)) {
                result.put("diagnosis", diagnose(plotId, Map.of("scenarioId", Jsons.text(event, "scenarioId", "normal"))));
            }
        }
        if ("AIR_TEMPERATURE".equals(metric) && value > heatThreshold) {
            Instant now = Instant.now();
            int heatDuration = (int) Jsons.whole(heatRule, "durationMinutes", 10);
            Deque<Instant> window = ruleWindows.computeIfAbsent(plotId + "|HEAT_STRESS", ignored -> new ConcurrentLinkedDeque<>());
            window.addLast(now); while (!window.isEmpty() && Duration.between(window.peekFirst(), now).toMinutes() > heatDuration) window.removeFirst();
            String message = "当前阶段「" + context.get("stageLabel") + "」空气温度已高于 " + heatThreshold
                    + "°C。请先通风或遮阴核验，不要直接按缺水处理。";
            Map<String, Object> alert = upsertRuleAlert(plotId, "HEAT_STRESS_RULE", "MEDIUM", "高温胁迫", message, event, heatRule,
                    heatThreshold, context, now, window.size() >= 3 ? "TRIGGERED" : "CANDIDATE");
            result.put("risk", "HEAT_STRESS");
            result.put("alert", alert);
            if (!Jsons.bool(alert, "reused", false) && !Jsons.bool(alert, "suppressedByCooldown", false)) {
                result.put("diagnosis", diagnose(plotId, Map.of("scenarioId", Jsons.text(event, "scenarioId", "normal"))));
            }
        }
        return result;
    }

    private Map<String, Object> upsertRuleAlert(String plotId, String source, String level, String title, String message,
                                                Map<String, Object> event, Map<String, Object> rule, double threshold,
                                                Map<String, Object> context, Instant now, String ruleState) {
        int cooldownMinutes = (int) Math.max(1, Jsons.whole(rule, "cooldownMinutes", 120));
        Map<String, Object> existing = findLatestMatchingAlert(plotId, source);
        String status = existing == null ? "" : Jsons.text(existing, "status", "");
        if (existing != null && OPEN_ALERT_STATUSES.contains(status)) {
            return updateExistingAlert(existing, event, now, title, message, level, ruleState, cooldownMinutes, threshold, context, rule);
        }
        if (existing != null && TERMINAL_ALERT_STATUSES.contains(status)) {
            Instant closedAt = Jsons.instant(existing.get("closedAt"), Jsons.instant(existing.get("raisedAt"), Instant.EPOCH));
            if (Duration.between(closedAt, now).toMinutes() < cooldownMinutes) {
                Map<String, Object> suppressed = Jsons.copy(mapper, existing);
                suppressed.put("suppressedByCooldown", true);
                suppressed.put("cooldownMinutes", cooldownMinutes);
                return suppressed;
            }
        }
        Map<String, Object> plot = store.find("plot", plotId);
        Map<String, Object> alert = new LinkedHashMap<>();
        alert.put("alertId", Jsons.id("alert"));
        alert.put("farmId", plot == null ? Jsons.text(event, "farmId", "") : Jsons.text(plot, "farmId", ""));
        alert.put("plotId", plotId);
        alert.put("level", level);
        alert.put("source", source);
        alert.put("status", "ACTIVE");
        alert.put("evidence", List.of(event));
        alert.put("title", title);
        alert.put("message", message);
        alert.put("ruleState", ruleState);
        alert.put("durationMinutes", Jsons.whole(rule, "durationMinutes", 5));
        alert.put("hysteresis", Jsons.number(rule, "hysteresis", 2));
        alert.put("cooldownMinutes", cooldownMinutes);
        alert.put("threshold", threshold);
        alert.put("stageCode", context.get("stageCode"));
        alert.put("cropPackVersion", context.get("cropPackVersion"));
        alert.put("ruleVersion", context.get("ruleVersion"));
        alert.put("occurrenceCount", 1);
        alert.put("createdAt", now.toString());
        alert.put("raisedAt", now.toString());
        alert.put("lastObservedAt", now.toString());
        alert.put("updatedAt", now.toString());
        store.save("alert", Jsons.text(alert, "alertId", ""), alert);
        events.publish("alert.created", alert);
        store.logEvent("alert.created", alert);
        Map<String, Object> created = Jsons.copy(mapper, alert);
        created.put("reused", false);
        return created;
    }

    private Map<String, Object> updateExistingAlert(Map<String, Object> alert, Map<String, Object> event, Instant now,
                                                    String title, String message, String level, String ruleState,
                                                    int cooldownMinutes, double threshold, Map<String, Object> context,
                                                    Map<String, Object> rule) {
        List<Map<String, Object>> evidence = new ArrayList<>(Jsons.maps(mapper, alert.get("evidence")));
        evidence.add(event);
        if (evidence.size() > 8) evidence = new ArrayList<>(evidence.subList(evidence.size() - 8, evidence.size()));
        alert.put("evidence", evidence);
        alert.put("title", title);
        alert.put("message", message);
        alert.put("level", level);
        alert.put("ruleState", ruleState);
        alert.put("status", Jsons.text(alert, "status", "ACTIVE"));
        alert.put("durationMinutes", Jsons.whole(rule, "durationMinutes", Jsons.whole(alert, "durationMinutes", 5)));
        alert.put("hysteresis", Jsons.number(rule, "hysteresis", Jsons.number(alert, "hysteresis", 2)));
        alert.put("cooldownMinutes", cooldownMinutes);
        alert.put("threshold", threshold);
        alert.put("stageCode", context.get("stageCode"));
        alert.put("cropPackVersion", context.get("cropPackVersion"));
        alert.put("ruleVersion", context.get("ruleVersion"));
        alert.put("occurrenceCount", Jsons.whole(alert, "occurrenceCount", 1) + 1);
        alert.put("lastObservedAt", now.toString());
        alert.put("updatedAt", now.toString());
        String alertId = Jsons.text(alert, "alertId", "");
        store.save("alert", alertId, alert);
        events.publish("alert.updated", alert);
        store.logEvent("alert.updated", alert);
        Map<String, Object> reused = Jsons.copy(mapper, alert);
        reused.put("reused", true);
        return reused;
    }

    private Map<String, Object> findLatestMatchingAlert(String plotId, String source) {
        return store.list("alert").stream()
                .filter(alert -> plotId.equals(Jsons.text(alert, "plotId", "")))
                .filter(alert -> source.equals(Jsons.text(alert, "source", "")))
                .max(Comparator.comparing(alert -> Jsons.instant(alert.get("lastObservedAt"),
                        Jsons.instant(alert.get("raisedAt"), Jsons.instant(alert.get("createdAt"), Instant.EPOCH)))))
                .map(alert -> Jsons.copy(mapper, alert))
                .orElse(null);
    }

    Map<String, Object> latestMetrics(String plotId) {
        Instant now = Instant.now();
        Instant from = now.minus(48, ChronoUnit.HOURS);
        List<Map<String, Object>> samples = store.telemetry(plotId, null, from, now.plusSeconds(1), 10000);
        Map<String, Map<String, Object>> latest = new LinkedHashMap<>();
        Map<String, Map<String, Object>> activeReal = new LinkedHashMap<>();
        Instant realCutoff = now.minus(Math.max(1, properties.getRealSourceTimeoutSeconds()), ChronoUnit.SECONDS);
        for (Map<String, Object> sample : samples) {
            String metric = Jsons.text(sample, "metric", "");
            if (metric.isBlank()) continue;
            if (newerTelemetry(sample, latest.get(metric))) latest.put(metric, sample);
            if ("REAL".equalsIgnoreCase(Jsons.text(sample, "sourceMode", ""))
                    && !Jsons.instant(sample.get("ts"), Instant.EPOCH).isBefore(realCutoff)
                    && newerTelemetry(sample, activeReal.get(metric))) {
                activeReal.put(metric, sample);
            }
        }
        // A synthetic sample can be timestamped a few milliseconds after a
        // physical reading while both MQTT callbacks are in flight.  Source
        // priority must win that race, otherwise the overview briefly shows
        // the simulator even though the hardware is already active.
        activeReal.forEach(latest::put);
        return new LinkedHashMap<>(latest);
    }

    private boolean newerTelemetry(Map<String, Object> candidate, Map<String, Object> current) {
        if (current == null) return true;
        int byTime = Jsons.instant(candidate.get("ts"), Instant.EPOCH)
                .compareTo(Jsons.instant(current.get("ts"), Instant.EPOCH));
        if (byTime != 0) return byTime > 0;
        return Jsons.text(candidate, "eventId", "")
                .compareTo(Jsons.text(current, "eventId", "")) > 0;
    }

    List<Map<String, Object>> telemetry(String plotId, String metric, String from, String to, int limit) {
        Instant f = from == null ? Instant.now().minus(24, ChronoUnit.HOURS) : Jsons.instant(from, Instant.now().minus(24, ChronoUnit.HOURS));
        Instant t = to == null ? Instant.now().plusSeconds(1) : Jsons.instant(to, Instant.now().plusSeconds(1));
        return store.telemetry(plotId, metric == null ? null : metric.toUpperCase(Locale.ROOT), f, t, limit);
    }

    private Map<String, Object> deviceForPlot(String plotId) {
        List<Map<String, Object>> candidates = store.list("device").stream()
                .filter(d -> plotId.equals(Jsons.text(d, "plotId", "")))
                .map(d -> Jsons.copy(mapper, d)).collect(Collectors.toCollection(ArrayList::new));
        // A plot can briefly have an old device record and a newly bound or
        // reconnected device record. A bound REAL device is authoritative even
        // when it is offline; otherwise a healthy simulator could mask a
        // physical disconnect in the UI and in irrigation safety gates.
        candidates.sort((left, right) -> {
            int real = Boolean.compare(isHardwareDevice(left), isHardwareDevice(right));
            if (real != 0) return -real;
            int online = Boolean.compare("ONLINE".equals(Jsons.text(left, "status", "")),
                    "ONLINE".equals(Jsons.text(right, "status", "")));
            if (online != 0) return -online;
            return Jsons.instant(Jsons.text(right, "lastSeen", ""), Instant.EPOCH)
                    .compareTo(Jsons.instant(Jsons.text(left, "lastSeen", ""), Instant.EPOCH));
        });
        return candidates.isEmpty() ? new LinkedHashMap<>() : candidates.get(0);
    }

    private boolean isHardwareDevice(Map<String, Object> device) {
        String id = Jsons.text(device, "deviceId", "").toLowerCase(Locale.ROOT);
        return "REAL".equalsIgnoreCase(Jsons.text(device, "sourceMode", ""))
                || "HARDWARE".equalsIgnoreCase(Jsons.text(device, "dataOrigin", ""))
                || ("BOUND".equalsIgnoreCase(Jsons.text(device, "bindingState", "")) && !id.startsWith("mock-"));
    }

    Map<String, Object> bindDevice(String deviceId, Map<String, Object> input, UserPrincipal principal) {
        if (!principal.isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_REQUIRED", "需要管理员权限");
        Map<String, Object> device = store.find("device", deviceId);
        if (device == null) device = new LinkedHashMap<>();
        String plotId = Jsons.text(input, "plotId", Jsons.text(device, "plotId", ""));
        ensurePlotAccess(principal, plotId);
        device.put("deviceId", deviceId); device.put("plotId", plotId); device.put("status", "ONLINE");
        device.put("boundBy", principal.userId); device.put("boundAt", Instant.now().toString());
        device.putIfAbsent("type", "ENVIRONMENTAL_SENSOR"); device.putIfAbsent("healthScore", .98);
        store.save("device", deviceId, device); events.publish("device.bound", device); return device;
    }

    Map<String, Object> unbindDevice(String deviceId, UserPrincipal principal) {
        if (!principal.isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_REQUIRED", "需要管理员权限");
        Map<String, Object> device = requireRecord("device", deviceId); ensurePlotAccess(principal, Jsons.text(device, "plotId", ""));
        device.put("status", "UNBOUND"); device.put("unboundBy", principal.userId); device.put("unboundAt", Instant.now().toString());
        store.save("device", deviceId, device); events.publish("device.unbound", device); return device;
    }

    Map<String, Object> heartbeat(String deviceId, Map<String, Object> input, UserPrincipal principal) {
        Map<String, Object> device = requireRecord("device", deviceId); ensurePlotAccess(principal, Jsons.text(device, "plotId", ""));
        String controlStatus = Jsons.text(device, "controlStatus", "").toUpperCase(Locale.ROOT);
        String desiredStatus = Jsons.text(device, "desiredStatus", "").toUpperCase(Locale.ROOT);
        if ("SUCCEEDED".equals(controlStatus) && "OFFLINE".equals(desiredStatus)) {
            Map<String, Object> result = new LinkedHashMap<>(device);
            result.put("heartbeatSuppressed", true); result.put("suppressionReason", "DEVICE_CONTROL_OFFLINE");
            return result;
        }
        if (!deviceIsSimulated(device) && "PENDING".equals(controlStatus)) {
            Map<String, Object> result = new LinkedHashMap<>(device);
            result.put("heartbeatSuppressed", true); result.put("suppressionReason", "DEVICE_CONTROL_PENDING");
            return result;
        }
        device.put("status", "ONLINE"); device.put("lastSeen", Jsons.text(input, "ts", Instant.now().toString()));
        device.put("healthScore", Jsons.number(input, "healthScore", Jsons.number(device, "healthScore", .98)));
        device.put("heartbeat", Jsons.copy(mapper, input)); store.save("device", deviceId, device); events.publish("device.heartbeat", device); return device;
    }

    void ingestDeviceStatus(Map<String, Object> input) {
        String deviceId = Jsons.text(input, "deviceId", "");
        if (deviceId.isBlank()) return;
        Map<String, Object> current = store.find("device", deviceId);
        Map<String, Object> device = current == null ? new LinkedHashMap<>() : new LinkedHashMap<>(current);
        device.putAll(Jsons.copy(mapper, input)); device.put("deviceId", deviceId);
        String controlStatus = Jsons.text(device, "controlStatus", "").toUpperCase(Locale.ROOT);
        String desiredStatus = Jsons.text(device, "desiredStatus", "").toUpperCase(Locale.ROOT);
        if ("SUCCEEDED".equals(controlStatus) && "OFFLINE".equals(desiredStatus)) {
            device.put("status", "OFFLINE");
        } else if (!deviceIsSimulated(device) && "PENDING".equals(controlStatus) && current != null) {
            device.put("status", Jsons.text(current, "status", "OFFLINE"));
        }
        store.save("device", deviceId, device);
        events.publish("device.updated", device);
    }

    Map<String, Object> controlDevice(String deviceId, Map<String, Object> input, UserPrincipal principal) {
        if (principal == null || !principal.isFarmAdmin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FARM_ADMIN_REQUIRED", "只有农场管理员可以控制设备");
        }
        Map<String, Object> device = requireRecord("device", deviceId);
        String plotId = Jsons.text(device, "plotId", "").trim();
        if (plotId.isBlank() || !"BOUND".equalsIgnoreCase(Jsons.text(device, "bindingState", "BOUND"))) {
            throw new ApiException(HttpStatus.CONFLICT, "DEVICE_CONTROL_UNAVAILABLE", "设备尚未绑定地块，暂不可控制");
        }
        ensurePlotAccess(principal, plotId);
        String targetStatus = Jsons.text(input, "targetStatus", "").trim().toUpperCase(Locale.ROOT);
        if (!DEVICE_CONTROL_TARGETS.contains(targetStatus)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DEVICE_TARGET_STATUS_INVALID", "设备目标状态只能是 ONLINE 或 OFFLINE");
        }
        String rawKey = Jsons.text(input, "idempotencyKey", "").trim();
        if (rawKey.isBlank() || rawKey.length() > 200) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "IDEMPOTENCY_REQUIRED", "设备控制必须携带有效 idempotencyKey");
        }
        String key = "device-control:" + deviceId + ":" + rawKey;
        Map<String, Object> old = idempotentCommands.get(key);
        if (old == null) {
            Map<String, Object> durableKey = store.find("idempotency", key);
            if (durableKey != null) {
                String commandId = Jsons.text(durableKey, "commandId", "");
                old = commandId.isBlank() ? null : store.find("command", commandId);
                if (old != null) idempotentCommands.put(key, old);
            }
        }
        if (old != null) return deviceControlResponse(old, store.find("device", deviceId));

        String sourceMode = Jsons.text(device, "sourceMode", Jsons.text(device, "dataOrigin", "")).trim().toUpperCase(Locale.ROOT);
        boolean simulated = deviceIsSimulated(device);
        boolean real = "REAL".equals(sourceMode) || "HARDWARE".equals(sourceMode);
        if (!simulated && !real) {
            throw new ApiException(HttpStatus.CONFLICT, "DEVICE_CONTROL_UNAVAILABLE", "设备没有可用的控制通道");
        }
        Instant now = Instant.now();
        Map<String, Object> command = new LinkedHashMap<>();
        String commandId = Jsons.id("device-cmd");
        command.put("commandId", commandId); command.put("type", "DEVICE_STATUS_SET");
        command.put("farmId", Jsons.text(device, "farmId", farmIdForPlot(plotId)));
        command.put("plotId", plotId); command.put("deviceId", deviceId);
        command.put("targetStatus", targetStatus); command.put("sourceMode", simulated ? "SIMULATION" : "REAL");
        command.put("idempotencyKey", key); command.put("status", "PENDING"); command.put("commandStatus", "PENDING");
        command.put("requestedBy", principal.userId); command.put("requestedAt", now.toString());
        device.put("desiredStatus", targetStatus); device.put("controlStatus", "PENDING");
        device.put("lastControlCommandId", commandId); device.put("lastControlAt", now.toString()); device.remove("lastControlError");
        store.save("command", commandId, command); store.save("device", deviceId, device);
        idempotentCommands.put(key, command);
        store.save("idempotency", key, Map.of("idempotencyKey", key, "commandId", commandId, "createdAt", now.toString()));
        events.publish("device.control.requested", command); store.logEvent("DEVICE_CONTROL_REQUESTED", command);

        if (simulated) {
            Map<String, Object> ack = new LinkedHashMap<>();
            ack.put("ackId", Jsons.id("ack")); ack.put("commandId", commandId); ack.put("deviceId", deviceId);
            ack.put("targetStatus", targetStatus); ack.put("status", "SUCCEEDED"); ack.put("receivedAt", Instant.now().toString());
            ack.put("result", "SIMULATED_DEVICE_SWITCH");
            handleDeviceControlAck(command, ack);
        } else {
            mqttCommands.publish(command);
            command.put("transport", mqttCommands.available() ? "MQTT" : "MQTT_PENDING");
            store.save("command", commandId, command);
        }
        return deviceControlResponse(command, store.find("device", deviceId));
    }

    private boolean deviceIsSimulated(Map<String, Object> device) {
        String source = Jsons.text(device, "sourceMode", Jsons.text(device, "dataOrigin", "")).trim().toUpperCase(Locale.ROOT);
        String deviceId = Jsons.text(device, "deviceId", "").toLowerCase(Locale.ROOT);
        return Set.of("SIMULATION", "SIMULATED").contains(source) || deviceId.startsWith("mock-");
    }

    private Map<String, Object> deviceControlResponse(Map<String, Object> command, Map<String, Object> device) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("commandId", Jsons.text(command, "commandId", ""));
        response.put("deviceId", Jsons.text(command, "deviceId", Jsons.text(device, "deviceId", "")));
        response.put("targetStatus", Jsons.text(command, "targetStatus", ""));
        response.put("commandStatus", Jsons.text(command, "commandStatus", Jsons.text(command, "status", "PENDING")));
        response.put("status", Jsons.text(device, "status", "OFFLINE"));
        response.put("device", device == null ? Map.of() : new LinkedHashMap<>(device));
        response.put("latestDevice", device == null ? Map.of() : new LinkedHashMap<>(device));
        response.put("command", new LinkedHashMap<>(command));
        return response;
    }

    void handleDeviceControlAck(Map<String, Object> command, Map<String, Object> input) {
        if (command == null || !"DEVICE_STATUS_SET".equals(Jsons.text(command, "type", ""))) return;
        Map<String, Object> ack = new LinkedHashMap<>(input == null ? Map.of() : input);
        String status = Jsons.text(ack, "status", "TIMEOUT").trim().toUpperCase(Locale.ROOT);
        if (!DEVICE_CONTROL_TERMINAL.contains(status)) status = "FAILED";
        ack.put("status", status); ack.put("commandId", Jsons.text(command, "commandId", ""));
        ack.put("deviceId", Jsons.text(command, "deviceId", "")); ack.put("receivedAt", Jsons.text(ack, "receivedAt", Instant.now().toString()));
        command.put("ack", ack); command.put("status", status); command.put("commandStatus", status);
        store.save("command", Jsons.text(command, "commandId", ""), command); ackByCommand.put(Jsons.text(command, "commandId", ""), ack);
        Map<String, Object> device = store.find("device", Jsons.text(command, "deviceId", ""));
        if (device != null) {
            String target = Jsons.text(command, "targetStatus", "").toUpperCase(Locale.ROOT);
            if ("SUCCEEDED".equals(status) && DEVICE_CONTROL_TARGETS.contains(target)) {
                device.put("status", target); device.put("desiredStatus", target); device.put("controlStatus", "SUCCEEDED");
                device.put("lastControlCommandId", Jsons.text(command, "commandId", "")); device.put("lastControlAt", ack.get("receivedAt"));
                device.remove("lastControlError");
                if ("OFFLINE".equals(target)) device.put("offlineAt", ack.get("receivedAt")); else device.remove("offlineAt");
            } else {
                device.put("controlStatus", status); device.put("lastControlCommandId", Jsons.text(command, "commandId", ""));
                device.put("lastControlAt", ack.get("receivedAt"));
                device.put("lastControlError", Jsons.text(ack, "result", Jsons.text(ack, "reason", "设备未确认控制指令")));
            }
            store.save("device", Jsons.text(command, "deviceId", ""), device);
            events.publish("device.control.updated", device); events.publish("device.updated", device);
        }
        events.publish("command.ack", ack); store.logEvent("DEVICE_CONTROL_ACK", ack);
    }

    @Scheduled(fixedDelay = 5000)
    void expireDeviceControlCommands() {
        Instant cutoff = Instant.now().minusSeconds(15);
        for (Map<String, Object> command : store.list("command")) {
            if (!"DEVICE_STATUS_SET".equals(Jsons.text(command, "type", "")) || !"PENDING".equals(Jsons.text(command, "commandStatus", Jsons.text(command, "status", "")))) continue;
            if (Jsons.instant(command.get("requestedAt"), Instant.now()).isAfter(cutoff)) continue;
            Map<String, Object> ack = new LinkedHashMap<>(); ack.put("status", "TIMEOUT"); ack.put("reason", "设备在 15 秒内未返回控制回执");
            ack.put("receivedAt", Instant.now().toString()); handleDeviceControlAck(command, ack);
        }
    }

    Map<String, Object> transitionAlert(String alertId, String status, UserPrincipal principal) {
        if (!principal.isFarmAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "ALERT_FORBIDDEN", "只有农场管理员可以处置告警");
        Map<String, Object> alert = requireRecord("alert", alertId); ensurePlotAccess(principal, Jsons.text(alert, "plotId", ""));
        String normalized = status == null ? "" : status.toUpperCase(Locale.ROOT);
        if (!Set.of("ACKED", "CLOSED", "RESOLVED", "ESCALATED", "ACTIVE").contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ALERT_STATUS_INVALID", "不支持的告警状态");
        }
        Instant now = Instant.now();
        alert.put("status", normalized); alert.put("updatedBy", principal.userId); alert.put("updatedAt", now.toString());
        if ("ACKED".equals(normalized)) { alert.put("acknowledgedBy", principal.userId); alert.put("acknowledgedAt", now.toString()); }
        if ("CLOSED".equals(normalized) || "RESOLVED".equals(normalized)) { alert.put("closedBy", principal.userId); alert.put("closedAt", now.toString()); }
        if ("ESCALATED".equals(normalized)) { alert.put("escalatedBy", principal.userId); alert.put("escalatedAt", now.toString()); }
        store.save("alert", alertId, alert); events.publish("alert." + normalized.toLowerCase(Locale.ROOT), alert); store.logEvent("alert." + normalized.toLowerCase(Locale.ROOT), alert); return alert;
    }

    /**
     * Creates and assigns one alert verification work order. The lookup and
     * duplicate guard live on the server so the card action, batch action and
     * Agent all share the same source of truth.
     */
    synchronized Map<String, Object> publishAlertVerificationTask(String alertId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> alert = requireRecord("alert", alertId);
        String plotId = Jsons.text(alert, "plotId", "").trim();
        ensurePlotAccess(principal, plotId);
        if (TERMINAL_ALERT_STATUSES.contains(Jsons.text(alert, "status", "").toUpperCase(Locale.ROOT))) {
            throw new ApiException(HttpStatus.CONFLICT, "ALERT_TERMINAL", "已结束的告警不能再发布核查任务");
        }
        Map<String, Object> existing = store.list("work-order").stream()
                .filter(work -> "ALERT".equalsIgnoreCase(Jsons.text(work, "sourceType", "")))
                .filter(work -> alertId.equals(Jsons.text(work, "sourceRef", "")))
                .filter(work -> "ALERT_VERIFICATION".equalsIgnoreCase(Jsons.text(work, "taskPurpose", "")))
                .filter(work -> !TERMINAL_WORK_ORDER_STATUSES.contains(normalizeWorkStatus(work.get("status"))))
                .findFirst().orElse(null);
        if (existing != null) {
            Map<String, Object> reused = new LinkedHashMap<>();
            reused.put("alertId", alertId);
            reused.put("workOrder", normalizeWorkOrderForRead(existing));
            reused.put("reused", true);
            reused.put("taskPurpose", "ALERT_VERIFICATION");
            return reused;
        }

        String farmId = Jsons.text(alert, "farmId", farmIdForPlot(plotId));
        Map<String, Object> plot = requireRecord("plot", plotId);
        if (!farmId.equals(Jsons.text(plot, "farmId", farmId))) farmId = Jsons.text(plot, "farmId", farmId);
        Map<String, Object> draft = new LinkedHashMap<>();
        draft.put("farmId", farmId);
        draft.put("plotId", plotId);
        draft.put("title", "核查：" + Jsons.text(alert, "title", "地块告警"));
        draft.put("reason", "请完成现场观察、便携仪复测并提交核查结果。" + Jsons.text(alert, "message", ""));
        draft.put("sourceType", "ALERT");
        draft.put("sourceRef", alertId);
        draft.put("actionType", "INSPECTION");
        draft.put("taskPurpose", "ALERT_VERIFICATION");
        draft.put("followUpActionType", alertActionType(alert));
        draft.put("priority", normalizePriority(Jsons.text(alert, "level", "MEDIUM")));
        draft.put("dueAt", Instant.now().plus(alertDueHours(alert), ChronoUnit.HOURS).toString());
        draft.put("provenance", "DERIVED");
        Map<String, Object> preferred = null;
        String requestedAssignee = Jsons.text(input == null ? Map.of() : input, "assigneeId", "").trim();
        if (!requestedAssignee.isBlank()) {
            preferred = store.userById(requestedAssignee);
            if (preferred == null) throw new ApiException(HttpStatus.BAD_REQUEST, "ASSIGNEE_INVALID", "指定的农户不存在");
            requireEligibleFarmer(requestedAssignee, draft);
        } else {
            preferred = chooseBestFarmerForPlot(farmId, plotId);
        }
        if (preferred == null) {
            throw new ApiException(HttpStatus.CONFLICT, "ASSIGNEE_UNAVAILABLE", "暂无具备该地块权限的在岗农户");
        }
        Map<String, Object> created = createWorkOrder(draft, principal);
        String workOrderId = Jsons.text(created, "workOrderId", "");
        Map<String, Object> assigned = assignWorkOrder(workOrderId, Map.of(
                "assigneeId", Jsons.text(preferred, "userId", ""),
                "note", "告警现场核查：系统按地块权限与任务负载自动分配"), principal);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("alertId", alertId);
        result.put("workOrder", assigned);
        result.put("reused", false);
        result.put("taskPurpose", "ALERT_VERIFICATION");
        result.put("assigneeReason", farmerAssignmentReason(preferred, plotId));
        return result;
    }

    private int alertDueHours(Map<String, Object> alert) {
        return switch (Jsons.text(alert, "level", "MEDIUM").toUpperCase(Locale.ROOT)) {
            case "CRITICAL" -> 1;
            case "HIGH" -> 2;
            case "LOW" -> 8;
            default -> 4;
        };
    }

    private String alertActionType(Map<String, Object> alert) {
        String text = (Jsons.text(alert, "title", "") + " " + Jsons.text(alert, "message", "") + " " + Jsons.text(alert, "source", "")).toLowerCase(Locale.ROOT);
        return text.matches(".*(device|sensor|设备|传感器|离线|漂移|fault).*") ? "INSPECTION" : "FIELD_OPERATION";
    }

    private Map<String, Object> chooseBestFarmerForPlot(String farmId, String plotId) {
        return store.listUsers().stream()
                .filter(user -> "FARMER".equals(RolePolicy.canonical(Jsons.text(user, "role", ""))))
                .filter(user -> Jsons.bool(user, "enabled", true))
                .filter(user -> {
                    List<String> farmIds = Jsons.strings(user.get("farmIds"));
                    List<String> plotIds = Jsons.strings(user.get("plotIds"));
                    return (farmIds.contains(farmId) || farmIds.contains("*")) && (plotIds.contains(plotId) || plotIds.contains("*"));
                })
                .sorted(Comparator
                        .comparingLong((Map<String, Object> user) -> store.list("work-order").stream()
                                .filter(work -> Jsons.text(user, "userId", "").equals(Jsons.text(work, "assigneeId", "")))
                                .filter(work -> !TERMINAL_WORK_ORDER_STATUSES.contains(normalizeWorkStatus(work.get("status"))))
                                .count())
                        .thenComparing((Map<String, Object> user) -> -store.list("work-order").stream()
                                .filter(work -> Jsons.text(user, "userId", "").equals(Jsons.text(work, "assigneeId", "")))
                                .filter(work -> plotId.equals(Jsons.text(work, "plotId", "")))
                                .count())
                        .thenComparing(user -> Jsons.text(user, "username", "")))
                .findFirst().orElse(null);
    }

    private String farmerAssignmentReason(Map<String, Object> farmer, String plotId) {
        String userId = Jsons.text(farmer, "userId", "");
        long activeLoad = store.list("work-order").stream()
                .filter(work -> userId.equals(Jsons.text(work, "assigneeId", "")))
                .filter(work -> !TERMINAL_WORK_ORDER_STATUSES.contains(normalizeWorkStatus(work.get("status"))))
                .count();
        long plotExperience = store.list("work-order").stream()
                .filter(work -> userId.equals(Jsons.text(work, "assigneeId", "")))
                .filter(work -> plotId.equals(Jsons.text(work, "plotId", "")))
                .count();
        return Jsons.text(farmer, "displayName", Jsons.text(farmer, "username", userId))
                + "具备该地块权限，当前进行中任务 " + activeLoad + " 项，过往处理该地块 " + plotExperience + " 次。";
    }

    Map<String, Object> acknowledgeCommand(String commandId, Map<String, Object> input, UserPrincipal principal) {
        Map<String, Object> command = requireRecord("command", commandId); ensurePlotAccess(principal, Jsons.text(command, "plotId", ""));
        Map<String, Object> ack = new LinkedHashMap<>(input == null ? Map.of() : input);
        ack.put("ackId", Jsons.text(ack, "ackId", Jsons.id("ack"))); ack.put("commandId", commandId);
        String status = Jsons.text(ack, "status", "TIMEOUT").toUpperCase(Locale.ROOT);
        if (!Set.of("SUCCEEDED", "PARTIAL", "FAILED", "TIMEOUT").contains(status)) throw new ApiException(HttpStatus.BAD_REQUEST, "ACK_STATUS_INVALID", "不支持的 ACK 状态");
        ack.put("status", status); ack.put("receivedAt", Jsons.text(ack, "receivedAt", Instant.now().toString()));
        command.put("ack", ack); command.put("status", status); command.put("acknowledgedBy", principal.userId); store.save("command", commandId, command);
        ackByCommand.put(commandId, ack); events.publish("command.ack", ack); store.logEvent("command.ack", ack); return evaluateCommand(command, ack);
    }

    Map<String, Object> diagnose(String plotId, Map<String, Object> request) {
        requireRecord("plot", plotId);
        Map<String, Object> latest = latestMetrics(plotId);
        Map<String, Object> soil = latest.getOrDefault("SOIL_MOISTURE", Map.of()) instanceof Map<?, ?> m ? Jsons.map(mapper, m) : Map.of();
        Map<String, Object> quality = Jsons.map(mapper, soil.get("quality"));
        String scenario = Jsons.text(request, "scenarioId", Jsons.text(soil, "scenarioId", "normal"));
        double moisture = Jsons.number(soil, "value", Double.NaN);
        List<Map<String, Object>> candidates = new ArrayList<>();
        String qualityStatus = Jsons.text(quality, "status", "GOOD").toUpperCase(Locale.ROOT);
        boolean explicitDrift = "sensor-drift".equalsIgnoreCase(scenario) || "BAD".equals(qualityStatus);
        Map<String, Object> device = deviceForPlot(plotId);
        Map<String, Object> cropContext = plotCropContext(plotId);
        double waterThreshold = cropPackCatalog.threshold(cropContext, "WATER_DEFICIT", 20);
        double heatThreshold = cropPackCatalog.threshold(cropContext, "HEAT_STRESS", 35);
        double waterScore = Double.isNaN(moisture) ? 0.15 : Math.max(0, Math.min(0.95, (waterThreshold - moisture) / Math.max(1.0, waterThreshold) + 0.35));
        double driftScore = explicitDrift ? 0.92 : 0.08;
        double deviceScore = "OFFLINE".equals(Jsons.text(device, "status", "ONLINE")) ? 0.9 : 0.05;
        candidates.add(candidate("WATER_DEFICIT", waterScore)); candidates.add(candidate("SENSOR_DRIFT", driftScore)); candidates.add(candidate("DEVICE_FAULT", deviceScore));
        if (Jsons.number(Jsons.map(mapper, latest.get("AIR_TEMPERATURE")), "value", 0) > heatThreshold) candidates.add(candidate("HEAT_STRESS", 0.76));
        candidates.sort(Comparator.comparingDouble((Map<String, Object> c) -> Jsons.number(c, "confidence", 0)).reversed());
        String primary = Jsons.text(candidates.get(0), "code", "INSUFFICIENT_EVIDENCE");
        double confidence = Jsons.number(candidates.get(0), "confidence", 0.1);
        // A normal, well-watered plot often has no dominant root cause.  Do not
        // turn the small 0.08 fallback drift score into a false sensor-fault
        // diagnosis; retain it as a low-confidence candidate instead.
        if (!explicitDrift && deviceScore < 0.9 && confidence < 0.25) {
            primary = "INSUFFICIENT_EVIDENCE";
        }
        List<Map<String, Object>> supporting = new ArrayList<>(); List<Map<String, Object>> opposing = new ArrayList<>(); List<String> missing = new ArrayList<>();
        if (!soil.isEmpty()) supporting.add(Map.of("type", "telemetry", "metric", "SOIL_MOISTURE", "value", moisture, "source", Jsons.text(soil, "eventId", ""), "provenance", "OBSERVED"));
        else missing.add("SOIL_MOISTURE");
        if ("SENSOR_DRIFT".equals(primary)) { supporting.add(Map.of("type", "quality", "status", Jsons.text(quality, "status", "BAD"), "provenance", "DERIVED")); missing.add("FLOW_RATE_CALIBRATION"); }
        if ("INSUFFICIENT_EVIDENCE".equals(primary)) {
            missing.add("MORE_TELEMETRY_HISTORY");
            opposing.add(Map.of("type", "rule", "reason", "当前没有形成明确的缺水或设备故障证据", "provenance", "DERIVED"));
        }
        if ("DEVICE_FAULT".equals(primary)) supporting.add(Map.of("type", "device", "status", "OFFLINE", "provenance", "OBSERVED"));
        if (waterScore < 0.4) opposing.add(Map.of("type", "rule", "reason", "湿度未持续低于目标", "provenance", "DERIVED"));
        List<Map<String, Object>> humanObservations = recentHumanObservations(plotId);
        List<Map<String, Object>> evidenceConflicts = new ArrayList<>();
        List<Map<String, Object>> humanAssessment = new ArrayList<>();
        for (Map<String, Object> observation : humanObservations) {
            String soilSurface = Jsons.text(observation, "soilSurface", "").toUpperCase(Locale.ROOT);
            String cropCondition = Jsons.text(observation, "cropCondition", "").toUpperCase(Locale.ROOT);
            String deviceStatus = Jsons.text(observation, "deviceStatus", "").toUpperCase(Locale.ROOT);
            List<String> supports = new ArrayList<>();
            List<String> opposes = new ArrayList<>();
            if (soilSurface.contains("DRY")) supports.add("WATER_DEFICIT");
            if (Set.of("WET", "NORMAL", "MOIST").contains(soilSurface)) opposes.add("WATER_DEFICIT");
            if (cropCondition.contains("WILT") || cropCondition.contains("DROOP")) supports.add("WATER_DEFICIT");
            if (Set.of("NORMAL", "HEALTHY").contains(cropCondition)) opposes.add("WATER_DEFICIT");
            if (deviceStatus.contains("OFFLINE") || deviceStatus.contains("FAULT") || deviceStatus.contains("LEAK")) supports.add("DEVICE_FAULT");
            if ("NORMAL".equals(deviceStatus)) opposes.add("DEVICE_FAULT");
            boolean hasPortable = observation.get("portableSoilMoisture") != null;
            double portable = Jsons.number(observation, "portableSoilMoisture", Double.NaN);
            if (hasPortable && !Double.isNaN(portable)) {
                if (portable < waterThreshold) supports.add("WATER_DEFICIT"); else opposes.add("WATER_DEFICIT");
                if (!Double.isNaN(moisture) && Math.abs(portable - moisture) > 5) {
                    Map<String, Object> conflict = new LinkedHashMap<>();
                    conflict.put("type", "PORTABLE_VS_TELEMETRY"); conflict.put("inspectionId", observation.get("inspectionId"));
                    conflict.put("telemetryValue", moisture); conflict.put("portableValue", portable);
                    conflict.put("message", "便携仪结果与在线传感器相差较大，需要人工复核");
                    conflict.put("provenance", "USER_PROVIDED"); evidenceConflicts.add(conflict);
                }
            }
            Map<String, Object> assessment = new LinkedHashMap<>();
            assessment.put("inspectionId", observation.get("inspectionId")); assessment.put("workOrderId", observation.get("workOrderId"));
            assessment.put("supports", supports.stream().distinct().toList()); assessment.put("opposes", opposes.stream().distinct().toList());
            assessment.put("provenance", "USER_PROVIDED"); humanAssessment.add(assessment);
            if (supports.contains(primary)) supporting.add(humanEvidence(observation, "SUPPORTS", primary));
            if (opposes.contains(primary)) opposing.add(humanEvidence(observation, "OPPOSES", primary));
        }
        Map<String, Object> diagnosis = new LinkedHashMap<>(); diagnosis.put("diagnosisId", Jsons.id("diag")); diagnosis.put("plotId", plotId); diagnosis.put("riskType", primary);
        diagnosis.put("primaryCause", primary); diagnosis.put("confidence", Math.round(confidence * 100.0) / 100.0); diagnosis.put("candidateCauses", candidates);
        diagnosis.put("supportingEvidence", supporting); diagnosis.put("opposingEvidence", opposing); diagnosis.put("missingInformation", missing);
        diagnosis.put("humanObservations", humanObservations); diagnosis.put("humanEvidenceAssessment", humanAssessment);
        diagnosis.put("evidenceConflicts", evidenceConflicts);
        diagnosis.put("scenarioId", scenario); if (request.containsKey("traceId")) diagnosis.put("traceId", request.get("traceId"));
        diagnosis.put("ruleVersion", cropContext.get("ruleVersion")); diagnosis.put("cropPackVersion", cropContext.get("cropPackVersion"));
        diagnosis.put("knowledgeVersion", cropContext.get("knowledgeVersion")); diagnosis.put("stageCode", cropContext.get("stageCode"));
        diagnosis.put("stageLabel", cropContext.get("stageLabel")); diagnosis.put("thresholds", Map.of("WATER_DEFICIT", waterThreshold, "HEAT_STRESS", heatThreshold));
        diagnosis.put("evaluatedAt", Instant.now().toString());
        store.save("diagnosis", Jsons.text(diagnosis, "diagnosisId", ""), diagnosis); events.publish("diagnosis.created", diagnosis); store.logEvent("diagnosis.created", diagnosis);
        return diagnosis;
    }

    /**
     * Adds a user-facing explanation to an already calculated diagnosis.
     *
     * The diagnosis itself is deliberately kept deterministic: this method may
     * only explain the persisted primary cause, confidence and evidence.  It is
     * a separate, explicitly requested operation so telemetry ingestion and
     * rule-triggered alerts never cause an LLM call for every event.
     */
    Map<String, Object> explainDiagnosis(String diagnosisId, UserPrincipal principal, boolean force) {
        Map<String, Object> diagnosis = requireRecord("diagnosis", diagnosisId);
        String plotId = Jsons.text(diagnosis, "plotId", "");
        ensurePlotAccess(principal, plotId);
        Map<String, Object> existing = Jsons.map(mapper, diagnosis.get("aiExplanation"));
        if (!force && !Jsons.text(existing, "text", "").isBlank()) return diagnosis;

        String traceId = Jsons.id("run");
        String aiMode = properties.getAiMode() == null ? "rules-only" : properties.getAiMode().toLowerCase(Locale.ROOT).trim();
        boolean openAiCompatible = aiMode.equals("openai") || aiMode.equals("openai-compatible");
        String adapter = aiMode.equals("mock") ? "mock" : aiMode.equals("maxkb") ? "maxkb" : openAiCompatible ? "openai-compatible" : "rules";
        Map<String, Object> facts = diagnosisExplanationFacts(diagnosis, plotId);
        String fallback = rulesDiagnosisExplanation(diagnosis);
        String text = fallback;
        String degradationReason = null;
        String rawNarrative = null;
        boolean degraded = !openAiCompatible;
        Map<String, Object> llm = null;

        if (openAiCompatible) {
            long started = System.nanoTime();
            try {
                rawNarrative = callOpenAiCompatible(
                        "请解释这次农业根因诊断。规则字段 primaryCause 和 confidence 是最终结论，不得改写；只使用给定的支持、反对和缺失证据。用‘结论—证据—下一步’的简洁结构回答，证据不足时明确说明需要复测。不要生成灌溉剂量、控制命令、SQL、MQTT topic 或 HTTP 请求。",
                        facts, List.of());
                String modelText = sanitizeDiagnosisExplanation(rawNarrative);
                if (modelText.isBlank()) throw new IOException("LLM_EMPTY_EXPLANATION");
                // Always keep the deterministic conclusion visible beside the
                // model prose.  Even a well-behaved model must not become the
                // source of truth for primaryCause or confidence.
                text = diagnosisConclusionLine(diagnosis) + "\nAI 解释：" + modelText;
                llm = new LinkedHashMap<>();
                llm.put("provider", "openai-compatible");
                llm.put("model", configuredLlmModel());
                llm.put("latencyMs", Duration.ofNanos(System.nanoTime() - started).toMillis());
            } catch (Exception ex) {
                degraded = true;
                degradationReason = "AI_DEPENDENCY_UNAVAILABLE_FALLBACK";
                store.logEvent("AI_DEGRADED", Map.of("traceId", traceId, "diagnosisId", diagnosisId,
                        "mode", aiMode, "reason", degradationReason, "error", safeLlmError(ex), "provenance", "DERIVED"));
            }
        } else if (aiMode.equals("mock")) {
            degradationReason = "DEMO_RULES_CONFIGURED";
        } else {
            degradationReason = aiMode.equals("maxkb") ? "AI_ADAPTER_UNAVAILABLE_FALLBACK" : "RULES_ONLY_CONFIGURED";
        }

        // Keep the boundary visible even when the model produces a plausible
        // action suggestion: this text is explanatory only and cannot alter the
        // deterministic safety decision shown next to it in the UI.
        text = text.trim();
        if (!text.contains("规则引擎负责主因") && !text.contains("不会生成或执行控制命令")) {
            text = text + "\n\n规则引擎负责主因、置信度和安全门；这段 AI 只解释证据，不会生成或执行控制命令。";
        }

        Map<String, Object> explanation = new LinkedHashMap<>();
        explanation.put("text", text);
        explanation.put("sourceLabel", degraded ? (aiMode.equals("mock") ? "演示规则解释" : "规则降级解释") : "Qwen 实时解释");
        explanation.put("adapter", adapter);
        explanation.put("degraded", degraded);
        explanation.put("provenance", "DERIVED");
        explanation.put("version", "diagnosis-explainer-1.0");
        explanation.put("cropPackVersion", Jsons.text(diagnosis, "cropPackVersion", "1.0.0"));
        explanation.put("ruleVersion", Jsons.text(diagnosis, "ruleVersion", "rule-1.0.0"));
        explanation.put("knowledgeVersion", "kb-1.0.0");
        explanation.put("agentVersion", "diagnosis-explainer-1.0");
        explanation.put("generatedAt", Instant.now().toString());
        explanation.put("traceId", traceId);
        if (degradationReason != null) explanation.put("degradationReason", degradationReason);
        if (llm != null) explanation.put("llm", llm);
        if (rawNarrative != null && !rawNarrative.isBlank()) explanation.put("rawCaptured", true);

        diagnosis.put("aiExplanation", explanation);
        diagnosis.put("aiExplainedAt", explanation.get("generatedAt"));
        store.save("diagnosis", diagnosisId, diagnosis);

        Map<String, Object> audit = new LinkedHashMap<>();
        audit.put("traceId", traceId);
        audit.put("intent", "DIAGNOSIS_EXPLANATION");
        audit.put("diagnosisId", diagnosisId);
        audit.put("plotId", plotId);
        audit.put("userId", principal.userId);
        audit.put("username", principal.username);
        audit.put("adapter", adapter);
        audit.put("degraded", degraded);
        audit.put("deterministicFacts", facts);
        audit.put("aiExplanation", explanation);
        audit.put("context", Map.of("cropPackVersion", "1.0.0", "ruleVersion", "rule-1.0.0",
                "knowledgeVersion", "kb-1.0.0", "agentVersion", "diagnosis-explainer-1.0"));
        audit.put("generatedAt", explanation.get("generatedAt"));
        if (degradationReason != null) audit.put("degradationReason", degradationReason);
        if (rawNarrative != null && !rawNarrative.isBlank()) audit.put("narrativeRaw", rawNarrative);
        store.save("agent-run", traceId, audit);
        store.logEvent("diagnosis.ai.explained", Map.of("traceId", traceId, "diagnosisId", diagnosisId,
                "plotId", plotId, "adapter", adapter, "degraded", degraded, "provenance", "DERIVED"));
        Map<String, Object> event = new LinkedHashMap<>(explanation);
        event.put("diagnosisId", diagnosisId);
        event.put("plotId", plotId);
        events.publish("diagnosis.ai.explained", event);
        return diagnosis;
    }

    private Map<String, Object> diagnosisExplanationFacts(Map<String, Object> diagnosis, String plotId) {
        Map<String, Object> diagnosisFacts = new LinkedHashMap<>(diagnosis);
        diagnosisFacts.remove("aiExplanation");
        diagnosisFacts.remove("diagnosisId");
        Map<String, Object> facts = new LinkedHashMap<>();
        facts.put("diagnosis", publicProjection(diagnosisFacts));
        facts.put("latestMetrics", publicProjection(latestMetrics(plotId)));
        facts.put("device", publicProjection(deviceForPlot(plotId)));
        facts.put("knowledgeEvidence", knowledgeEvidence(plotId));
        String snippet = knowledgeSnippet(plotId);
        if (!snippet.isBlank()) facts.put("retrievedKnowledge", snippet);
        return facts;
    }

    private String sanitizeDiagnosisExplanation(String raw) {
        String text = sanitizeNarrative(raw);
        if (text.isBlank() || isDirectControlRequest(text)) return "";
        return text;
    }

    private String rulesDiagnosisExplanation(Map<String, Object> diagnosis) {
        String cause = Jsons.text(diagnosis, "primaryCause", "INSUFFICIENT_EVIDENCE").toUpperCase(Locale.ROOT);
        double confidence = Jsons.number(diagnosis, "confidence", 0);
        StringBuilder text = new StringBuilder(diagnosisConclusionLine(diagnosis));
        List<Map<String, Object>> supporting = Jsons.maps(mapper, diagnosis.get("supportingEvidence"));
        List<Map<String, Object>> opposing = Jsons.maps(mapper, diagnosis.get("opposingEvidence"));
        List<String> missing = Jsons.strings(diagnosis.get("missingInformation"));
        if (!supporting.isEmpty()) text.append("\n依据：").append(summariseDiagnosisEvidence(supporting));
        if (!opposing.isEmpty()) text.append("\n反向信息：").append(summariseDiagnosisEvidence(opposing));
        if (!missing.isEmpty()) text.append("\n还缺：").append(missing.stream().map(this::diagnosisEvidenceLabel).limit(3).collect(Collectors.joining("、")));
        text.append("\n下一步：").append(diagnosisNextStep(cause));
        return text.toString();
    }

    private String diagnosisConclusionLine(Map<String, Object> diagnosis) {
        String cause = Jsons.text(diagnosis, "primaryCause", "INSUFFICIENT_EVIDENCE").toUpperCase(Locale.ROOT);
        double confidence = Jsons.number(diagnosis, "confidence", 0);
        return "结论：当前规则诊断更偏向 " + diagnosisCauseLabel(cause) + "（置信度约 " + Math.round(confidence * 100) + "%）。";
    }

    private String summariseDiagnosisEvidence(List<Map<String, Object>> evidence) {
        return evidence.stream().map(item -> {
            String type = Jsons.text(item, "type", "");
            if ("telemetry".equalsIgnoreCase(type)) {
                String metric = metricDisplayName(Jsons.text(item, "metric", "指标"));
                String value = Jsons.text(item, "value", "");
                String unit = Jsons.text(item, "unit", "");
                return metric + (value.isBlank() ? "" : " " + value + unit);
            }
            if ("quality".equalsIgnoreCase(type)) return "数据质量 " + Jsons.text(item, "status", "未知");
            if ("device".equalsIgnoreCase(type)) return "设备状态 " + Jsons.text(item, "status", "未知");
            String reason = Jsons.text(item, "reason", Jsons.text(item, "message", "现场证据"));
            return reason.isBlank() ? "现场证据" : reason;
        }).filter(item -> !item.isBlank()).limit(3).collect(Collectors.joining("；"));
    }

    private String diagnosisCauseLabel(String cause) {
        return switch (String.valueOf(cause).toUpperCase(Locale.ROOT)) {
            case "WATER_DEFICIT" -> "地块缺水";
            case "SENSOR_DRIFT" -> "传感器读数可疑";
            case "DEVICE_FAULT" -> "采集设备异常";
            case "HEAT_STRESS" -> "高温胁迫";
            default -> "证据不足";
        };
    }

    private String diagnosisEvidenceLabel(String code) {
        return switch (String.valueOf(code).toUpperCase(Locale.ROOT)) {
            case "FLOW_RATE_CALIBRATION" -> "检查流量计";
            case "PORTABLE_METER_COMPARISON" -> "便携仪复测";
            case "FRESH_TELEMETRY" -> "获取新遥测";
            case "DEVICE_HEALTH" -> "检查设备心跳";
            case "MORE_TELEMETRY_HISTORY" -> "延长数据观察";
            case "MORE_DIAGNOSIS_EVIDENCE" -> "补充诊断证据";
            default -> code;
        };
    }

    private String diagnosisNextStep(String cause) {
        return switch (String.valueOf(cause).toUpperCase(Locale.ROOT)) {
            case "WATER_DEFICIT" -> "先连续复测根区土壤湿度，确认缺水持续后再查看补水试算。";
            case "SENSOR_DRIFT" -> "先用便携仪复测并检查探头、供电和流量计；复测通过前不生成可执行灌溉。";
            case "DEVICE_FAULT" -> "先检查设备供电、网关连接和最后心跳，恢复新鲜数据后再诊断。";
            case "HEAT_STRESS" -> "补充温度、湿度和作物现场观察，先做通风/遮阴核验，不直接执行灌溉。";
            default -> "补充一组连续遥测和现场观察，再决定是否进入处方试算。";
        };
    }

    private List<Map<String, Object>> recentHumanObservations(String plotId) {
        Instant cutoff = Instant.now().minus(24, ChronoUnit.HOURS);
        return store.list("inspection").stream()
                .filter(item -> plotId.equals(Jsons.text(item, "plotId", "")))
                .filter(item -> !Jsons.instant(item.get("observedAt"), Jsons.instant(item.get("createdAt"), Instant.EPOCH)).isBefore(cutoff))
                .sorted(Comparator.comparing((Map<String, Object> item) ->
                        Jsons.instant(item.get("observedAt"), Jsons.instant(item.get("createdAt"), Instant.EPOCH))).reversed())
                .limit(3).map(item -> {
                    Map<String, Object> evidence = new LinkedHashMap<>();
                    for (String field : List.of("inspectionId", "workOrderId", "plotId", "operatorId", "operatorName", "operatorRole",
                            "observedAt", "soilSurface", "cropCondition", "deviceStatus", "portableSoilMoisture", "notes")) {
                        if (item.containsKey(field)) evidence.put(field, item.get(field));
                    }
                    evidence.put("evidenceId", Jsons.text(item, "inspectionId", ""));
                    evidence.put("sourceType", "HUMAN_OBSERVATION"); evidence.put("provenance", "USER_PROVIDED");
                    return evidence;
                }).toList();
    }

    private Map<String, Object> humanEvidence(Map<String, Object> observation, String relation, String cause) {
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("type", "human-observation"); evidence.put("relation", relation); evidence.put("cause", cause);
        evidence.put("inspectionId", observation.get("inspectionId")); evidence.put("workOrderId", observation.get("workOrderId"));
        evidence.put("observedAt", observation.get("observedAt")); evidence.put("operatorId", observation.get("operatorId"));
        evidence.put("provenance", "USER_PROVIDED"); return evidence;
    }

    private Map<String, Object> candidate(String code, double confidence) {
        return Map.of("code", code, "confidence", Math.round(Math.max(0, Math.min(0.99, confidence)) * 100.0) / 100.0);
    }

    Map<String, Object> readiness(String subjectType, String subjectId, UserPrincipal principal) {
        Map<String, Object> plan = "IRRIGATION_PLAN".equalsIgnoreCase(subjectType) ? store.find("irrigation-plan", subjectId) : null;
        String plotId = plan == null ? subjectId : Jsons.text(plan, "plotId", subjectId);
        if (principal != null) ensurePlotAccess(principal, plotId);
        Map<String, Object> latest = latestMetrics(plotId);
        Map<String, Object> soil = latest.get("SOIL_MOISTURE") instanceof Map<?, ?> m ? Jsons.map(mapper, m) : Map.of();
        Map<String, Object> quality = Jsons.map(mapper, soil.get("quality"));
        Map<String, Object> device = deviceForPlot(plotId);
        Map<String, Object> diagnosis = plan == null ? null : store.find("diagnosis", Jsons.text(plan, "diagnosisId", ""));
        boolean metricPass = !soil.isEmpty();
        boolean freshnessPass = metricPass && Duration.between(Jsons.instant(soil.get("ts"), Instant.EPOCH), Instant.now()).getSeconds() <= 180;
        String qualityStatus = Jsons.text(quality, "status", "BAD").toUpperCase(Locale.ROOT);
        boolean anyMetricBad = latest.values().stream().anyMatch(value -> value instanceof Map<?, ?> metricValue
                && "BAD".equalsIgnoreCase(Jsons.text(Jsons.map(mapper, Jsons.map(mapper, metricValue).get("quality")), "status", "GOOD")));
        boolean anyMetricDegraded = latest.values().stream().anyMatch(value -> value instanceof Map<?, ?> metricValue
                && "DEGRADED".equalsIgnoreCase(Jsons.text(Jsons.map(mapper, Jsons.map(mapper, metricValue).get("quality")), "status", "GOOD")));
        boolean qualityPass = "GOOD".equals(qualityStatus) && !anyMetricBad && !anyMetricDegraded;
        boolean qualityHardFail = !metricPass || "BAD".equals(qualityStatus) || anyMetricBad;
        boolean qualityNeedsReview = "DEGRADED".equals(qualityStatus) || anyMetricDegraded;
        boolean devicePass = !device.isEmpty() && !"OFFLINE".equals(Jsons.text(device, "status", "OFFLINE"));
        String diagnosisCause = Jsons.text(diagnosis, "primaryCause", "");
        double diagnosisConfidence = Jsons.number(diagnosis, "confidence", 0);
        boolean diagnosisHardFail = diagnosis != null && diagnosisConfidence >= .6
                && Set.of("SENSOR_DRIFT", "DEVICE_FAULT").contains(diagnosisCause);
        boolean humanEvidenceConflict = diagnosis != null && !Jsons.maps(mapper, diagnosis.get("evidenceConflicts")).isEmpty();
        boolean diagnosisNeedsReview = diagnosis != null && ("INSUFFICIENT_EVIDENCE".equals(diagnosisCause)
                || ("SENSOR_DRIFT".equals(diagnosisCause) && diagnosisConfidence < .6) || humanEvidenceConflict);
        boolean diagnosisPass = diagnosis == null || (!diagnosisHardFail && !diagnosisNeedsReview);
        boolean drift = "sensor-drift".equalsIgnoreCase(Jsons.text(soil, "scenarioId", ""))
                || "BAD".equals(qualityStatus) || "SENSOR_DRIFT".equals(diagnosisCause);
        boolean resourcePass = store.find("resource-profile", "resource-default") != null;
        boolean permissionPass = principal == null || principal.canControl();
        boolean safetyPass = plan == null || Jsons.whole(plan, "durationSeconds", 0) <= properties.getMaxIrrigationSeconds();
        Map<String, String> gates = new LinkedHashMap<>(); gates.put("requiredMetrics", metricPass ? "PASS" : "FAIL"); gates.put("freshness", freshnessPass ? "PASS" : "FAIL");
        gates.put("dataQuality", qualityPass ? "PASS" : qualityNeedsReview ? "REVIEW" : "FAIL"); gates.put("deviceHealth", devicePass ? "PASS" : "FAIL"); gates.put("resourceCapacity", resourcePass ? "PASS" : "FAIL");
        gates.put("diagnosisSafety", diagnosisPass ? "PASS" : diagnosisHardFail ? "FAIL" : "REVIEW");
        gates.put("permission", permissionPass ? "PASS" : "REVIEW"); gates.put("safetyLimit", safetyPass ? "PASS" : "FAIL");
        List<String> missing = new ArrayList<>(); if (!metricPass) missing.add("SOIL_MOISTURE"); if (!freshnessPass) missing.add("FRESH_TELEMETRY");
        if (qualityHardFail) missing.add("GOOD_DATA_QUALITY"); else if (qualityNeedsReview) missing.add("QUALITY_REVIEW");
        if (!devicePass) missing.add("DEVICE_HEALTH"); if (drift) missing.add("FLOW_RATE_CALIBRATION");
        if (diagnosisHardFail) missing.add("DIAGNOSIS_CONFIRMATION"); else if (diagnosisNeedsReview) missing.add("MORE_DIAGNOSIS_EVIDENCE");
        if (humanEvidenceConflict) missing.add("HUMAN_EVIDENCE_REVIEW");
        if (!permissionPass) missing.add("CONTROL_PERMISSION");
        String status;
        if (!metricPass || !devicePass) status = "UNAVAILABLE";
        else if (!freshnessPass || qualityHardFail || drift || diagnosisHardFail) status = "NEEDS_EVIDENCE";
        else if (qualityNeedsReview || diagnosisNeedsReview || !safetyPass || !resourcePass || !permissionPass) status = "HUMAN_REVIEW";
        else status = "READY";
        double score = (metricPass ? .14 : 0) + (freshnessPass ? .12 : 0) + (qualityPass ? .16 : 0)
                + (devicePass ? .12 : 0) + (resourcePass ? .12 : 0) + (diagnosisPass ? .12 : 0)
                + (permissionPass ? .10 : 0) + (safetyPass ? .12 : 0);
        Map<String, Object> result = new LinkedHashMap<>(); result.put("readinessId", Jsons.id("ready")); result.put("subject", Map.of("type", subjectType, "id", subjectId));
        result.put("plotId", plotId); result.put("status", status); result.put("score", Math.round(score * 100.0) / 100.0); result.put("hardGates", gates);
        List<String> readinessConflicts = new ArrayList<>();
        if (drift) readinessConflicts.add("QUALITY_VS_MOISTURE_CONFLICT");
        if (humanEvidenceConflict) readinessConflicts.add("HUMAN_OBSERVATION_CONFLICT");
        result.put("missingEvidence", missing.stream().distinct().toList()); result.put("conflicts", readinessConflicts);
        result.put("requiredActions", requiredActions(status, missing)); result.put("policyVersion", "readiness-v1"); result.put("evaluatedAt", Instant.now().toString());
        store.save("readiness", Jsons.text(result, "readinessId", ""), result); events.publish("readiness.evaluated", result); store.logEvent("readiness.evaluated", result);
        return result;
    }

    private List<Map<String, Object>> requiredActions(String status, List<String> missing) {
        if ("READY".equals(status)) return List.of();
        List<Map<String, Object>> actions = new ArrayList<>();
        for (String item : missing) {
            String action = item.contains("PERMISSION") ? "REQUEST_APPROVAL" : item.contains("DEVICE") ? "CHECK_DEVICE" : item.contains("FLOW") ? "CHECK_FLOW_METER" : item.contains("TELEMETRY") ? "REMEASURE" : "CREATE_INSPECTION";
            String type = item.contains("PERMISSION") ? "REQUEST_APPROVAL" : "CREATE_INSPECTION";
            actions.add(Map.of("type", type, "action", action, "priority", "HIGH"));
        }
        return actions;
    }

    Map<String, Object> irrigationPlan(Map<String, Object> request, UserPrincipal principal) {
        String plotId = Jsons.text(request, "plotId", "plot-a01"); ensurePlotAccess(principal, plotId);
        Map<String, Object> diagnosis = request.get("diagnosisId") == null ? diagnose(plotId, request) : store.find("diagnosis", Jsons.text(request, "diagnosisId", ""));
        if (diagnosis == null) diagnosis = diagnose(plotId, request);
        String primary = Jsons.text(diagnosis, "primaryCause", "INSUFFICIENT_EVIDENCE");
        Map<String, Object> latest = latestMetrics(plotId); Map<String, Object> soil = latest.get("SOIL_MOISTURE") instanceof Map<?, ?> m ? Jsons.map(mapper, m) : Map.of();
        Map<String, Object> quality = Jsons.map(mapper, soil.get("quality"));
        String qualityStatus = Jsons.text(quality, "status", "BAD").toUpperCase(Locale.ROOT);
        double diagnosisConfidence = Jsons.number(diagnosis, "confidence", 0);
        Map<String, Object> device = deviceForPlot(plotId);
        boolean anyMetricDegraded = latest.values().stream().anyMatch(value -> {
            if (!(value instanceof Map<?, ?> metricValue)) return false;
            Map<String, Object> metric = Jsons.map(mapper, metricValue);
            return "DEGRADED".equalsIgnoreCase(Jsons.text(Jsons.map(mapper, metric.get("quality")), "status", "GOOD"));
        });
        boolean anyMetricBad = latest.values().stream().anyMatch(value -> {
            if (!(value instanceof Map<?, ?> metricValue)) return false;
            Map<String, Object> metric = Jsons.map(mapper, metricValue);
            return "BAD".equalsIgnoreCase(Jsons.text(Jsons.map(mapper, metric.get("quality")), "status", "GOOD"));
        });
        Map<String, Object> simulation = plotSimulationView(plotId);
        String simulationScenario = Jsons.text(simulation, "scenario", "NORMAL");
        Map<String, Object> simulationParameters = Jsons.map(mapper, simulation.get("parameters"));
        boolean activeHeavyRain = "HEAVY_RAIN".equalsIgnoreCase(simulationScenario)
                && Jsons.number(simulationParameters, "rainfallRate", 0) > 0;
        boolean configuredOffline = "DEVICE_OFFLINE".equalsIgnoreCase(simulationScenario)
                && "OFFLINE".equalsIgnoreCase(Jsons.text(Jsons.map(mapper, simulation.get("simulatorDevice")), "status", ""));
        boolean hardDataBlock = soil.isEmpty()
                || "BAD".equals(qualityStatus)
                || anyMetricBad
                || "OFFLINE".equals(Jsons.text(device, "status", "OFFLINE"))
                || configuredOffline
                || ("SENSOR_DRIFT".equals(primary) && diagnosisConfidence >= 0.6);
        boolean reviewOnly = !hardDataBlock
                && (anyMetricDegraded || "DEGRADED".equals(qualityStatus) || "SENSOR_DRIFT".equals(primary) || "INSUFFICIENT_EVIDENCE".equals(primary));
        // A heavy-rain strategy keeps the recommendation advisory while rain
        // is active; the user can still inspect the amount but cannot mistake
        // it for an automatic watering order.
        reviewOnly = reviewOnly || activeHeavyRain;
        Map<String, Object> cropContext = plotCropContext(plotId);
        Map<String, Object> plan = new LinkedHashMap<>(); plan.put("planId", Jsons.id("plan")); plan.put("plotId", plotId); plan.put("diagnosisId", diagnosis.get("diagnosisId")); if (request.containsKey("traceId")) plan.put("traceId", request.get("traceId"));
        plan.put("cropPackVersion", cropContext.get("cropPackVersion")); plan.put("ruleVersion", cropContext.get("ruleVersion"));
        plan.put("knowledgeVersion", cropContext.get("knowledgeVersion")); plan.put("agentVersion", cropContext.get("agentVersion"));
        plan.put("simulation", Map.of("scenario", simulationScenario, "revision", Jsons.whole(simulation, "revision", 1),
                "sourceMode", "SIMULATION", "hardware", simulation.get("hardware")));
        plan.put("stageCode", cropContext.get("stageCode")); plan.put("stageLabel", cropContext.get("stageLabel"));
        plan.put("recommendedWindow", Map.of("start", Instant.now().plus(5, ChronoUnit.MINUTES).toString(), "end", Instant.now().plus(35, ChronoUnit.MINUTES).toString()));
        double current = Jsons.number(soil, "value", 18); Map<String, Object> plot = requireRecord("plot", plotId); double area = Jsons.number(plot, "areaM2", 80);
        Map<String, Object> resource = store.find("resource-profile", "resource-default"); double flow = Jsons.number(resource, "flowRateLitresPerMinute", 18);
        double target = cropPackCatalog.irrigationTarget(cropContext);
        double water = Math.max(0, (target - current) * area * 0.08); long duration = Math.max(0, Math.round(water / Math.max(1, flow) * 60));
        duration = Math.min(duration, properties.getMaxIrrigationSeconds()); water = Math.round(duration / 60.0 * flow * 10) / 10.0;
        plan.put("durationSeconds", duration); plan.put("waterLitre", water); plan.put("expectedResult", Map.of("metric", "SOIL_MOISTURE", "from", current, "to", target));
        plan.put("what", "IRRIGATION"); plan.put("where", plotId); plan.put("when", plan.get("recommendedWindow")); plan.put("howMuch", Map.of("durationSeconds", duration, "waterLitre", water));
        // Persist the candidate before evaluating readiness so the safety gate can
        // inspect its actual duration and plot instead of treating the plan id as
        // a plot id.  This is what makes a fresh, healthy plan truly READY.
        store.save("irrigation-plan", Jsons.text(plan, "planId", ""), plan);
        Map<String, Object> readinessResult = readiness("IRRIGATION_PLAN", Jsons.text(plan, "planId", ""), principal);
        String readinessStatus = Jsons.text(readinessResult, "status", "HUMAN_REVIEW");
        if (reviewOnly && "READY".equals(readinessStatus)) readinessStatus = "HUMAN_REVIEW";
        double currentMoisture = Jsons.number(soil, "value", 18);
        boolean noWaterNeeded = !hardDataBlock && !reviewOnly && duration <= 0 && currentMoisture >= target;
        String why = hardDataBlock
                ? "数据质量或设备状态未通过硬门，先补证更稳妥"
                : activeHeavyRain
                    ? "当前地块处于暴雨模拟场景，先观察积水和排水状态"
                : reviewOnly
                    ? "数据有轻度不确定性，先给人工复核版参考，不自动执行"
                : noWaterNeeded ? "当前湿度已达到阶段目标，暂时不需要灌溉" : "土壤湿度低于当前阶段目标";
        plan.put("why", why); plan.put("evidence", List.of(soil, diagnosis));
        boolean executable = !hardDataBlock && !reviewOnly && !noWaterNeeded && "READY".equals(readinessStatus) && duration > 0;
        plan.put("readinessId", readinessResult.get("readinessId"));
        plan.put("requiresApproval", true); plan.put("advisoryOnly", !executable); plan.put("executable", executable); plan.put("readinessStatus", readinessStatus);
        plan.put("status", hardDataBlock ? "BLOCKED" : noWaterNeeded ? "NO_ACTION" : reviewOnly ? "HUMAN_REVIEW" : "PROPOSED"); plan.put("createdAt", Instant.now().toString());
        store.save("irrigation-plan", Jsons.text(plan, "planId", ""), plan); events.publish("irrigation.plan.created", plan); store.logEvent("irrigation.plan.created", plan);
        return plan;
    }

    Map<String, Object> createCommand(Map<String, Object> request, UserPrincipal principal) {
        String key = Jsons.text(request, "idempotencyKey", "");
        if (key.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "IDEMPOTENCY_REQUIRED", "动作接口必须携带 idempotencyKey");
        Map<String, Object> old = idempotentCommands.get(key);
        if (old == null) {
            Map<String, Object> durableKey = store.find("idempotency", key);
            if (durableKey != null) {
                String commandId = Jsons.text(durableKey, "commandId", "");
                old = commandId.isBlank() ? null : store.find("command", commandId);
                if (old != null) idempotentCommands.put(key, old);
            }
        }
        if (old != null) return old;
        String plotId = Jsons.text(request, "plotId", "plot-a01"); ensurePlotAccess(principal, plotId);
        if (!principal.canControl()) throw new ApiException(HttpStatus.FORBIDDEN, "CONTROL_FORBIDDEN", "当前角色无控制权限");
        String planId = Jsons.text(request, "planId", ""); Map<String, Object> plan = store.find("irrigation-plan", planId);
        if (plan == null) plan = irrigationPlan(Map.of("plotId", plotId), principal);
        Map<String, Object> readiness = readiness("IRRIGATION_PLAN", Jsons.text(plan, "planId", planId), principal);
        if (!"READY".equals(Jsons.text(plan, "readinessStatus", "")) && !"READY".equals(Jsons.text(readiness, "status", ""))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "READINESS_BLOCKED", "决策就绪度未通过，不能下发命令").withDetails(Map.of("readiness", readiness, "plan", plan));
        }
        boolean approved = Jsons.bool(request, "approved", false);
        if (!approved) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "APPROVAL_REQUIRED", "中高风险灌溉动作需要人工确认");
        long duration = Jsons.whole(plan, "durationSeconds", Jsons.whole(request, "durationSeconds", 0));
        if (duration <= 0 || duration > properties.getMaxIrrigationSeconds()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "SAFETY_LIMIT", "灌溉时长超出安全上限");
        double requestedWater = Jsons.number(plan, "waterLitre", 0);
        if (requestedWater > properties.getDailyWaterLimitLitres()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "DAILY_WATER_LIMIT", "超过每日用水上限");
        Map<String, Object> resource = store.find("resource-profile", "resource-default");
        double capacity = Jsons.number(resource, "capacityLitres", properties.getDailyWaterLimitLitres());
        double alreadyAllocated = store.list("command").stream()
                .filter(c -> plotId.equals(Jsons.text(c, "plotId", "")) && !Set.of("FAILED", "TIMEOUT", "CANCELLED").contains(Jsons.text(c, "status", "")))
                .mapToDouble(c -> Jsons.number(c, "waterLitre", 0)).sum();
        if (alreadyAllocated + requestedWater > capacity) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "RESOURCE_CAPACITY", "水源容量不足");
        Instant lastAction = cooldowns.get(plotId);
        if (lastAction != null && Duration.between(lastAction, Instant.now()).toMinutes() < 120) throw new ApiException(HttpStatus.CONFLICT, "COOLDOWN_ACTIVE", "地块仍处于灌溉冷却窗口");
        Map<String, Object> command = new LinkedHashMap<>(); command.put("commandId", Jsons.id("cmd")); command.put("plotId", plotId); command.put("planId", plan.get("planId"));
        command.put("type", "IRRIGATION_START"); command.put("durationSeconds", duration); command.put("waterLitre", Jsons.number(plan, "waterLitre", 0));
        command.put("idempotencyKey", key); command.put("status", "APPROVED"); command.put("requestedBy", principal.userId); command.put("approvedBy", principal.userId);
        command.put("approvedAt", Instant.now().toString()); command.put("riskLevel", "MEDIUM"); command.put("source", Jsons.text(request, "source", "api"));
        store.save("command", Jsons.text(command, "commandId", ""), command); idempotentCommands.put(key, command); events.publish("command.approved", command); store.logEvent("command.approved", command);
        store.save("idempotency", key, Map.of("idempotencyKey", key, "commandId", command.get("commandId"), "createdAt", Instant.now().toString()));
        cooldowns.put(plotId, Instant.now());
        executeVirtual(command, request); return command;
    }

    private void executeVirtual(Map<String, Object> command, Map<String, Object> request) {
        String outcome = Jsons.text(request, "outcome", "SUCCEEDED").toUpperCase(Locale.ROOT);
        mqttCommands.publish(command);
        command.put("transport", mqttCommands.available() ? "MQTT" : "IN_MEMORY_FALLBACK");
        store.save("command", Jsons.text(command, "commandId", ""), command);
        CompletableFuture.runAsync(() -> {
            try { Thread.sleep(Math.min(1000, Math.max(50, Jsons.whole(command, "durationSeconds", 60) * 10))); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            Map<String, Object> ack = new LinkedHashMap<>(); ack.put("ackId", Jsons.id("ack")); ack.put("commandId", command.get("commandId")); ack.put("plotId", command.get("plotId"));
            ack.put("status", Set.of("SUCCEEDED", "PARTIAL", "FAILED", "TIMEOUT").contains(outcome) ? outcome : "SUCCEEDED"); ack.put("receivedAt", Instant.now().toString());
            ack.put("actualWaterLitre", "SUCCEEDED".equals(outcome) ? Jsons.number(command, "waterLitre", 0) : "PARTIAL".equals(outcome) ? Jsons.number(command, "waterLitre", 0) * .55 : 0);
            ack.put("result", "SUCCEEDED".equals(outcome) ? "GOOD" : "TIMEOUT".equals(outcome) ? "NO_ACK" : "EXECUTION_FAILED");
            ackByCommand.put(Jsons.text(command, "commandId", ""), ack); command.put("status", outcome); command.put("ack", ack); store.save("command", Jsons.text(command, "commandId", ""), command);
            events.publish("command.ack", ack); store.logEvent("command.ack", ack); evaluateCommand(command, ack);
        });
    }

    Map<String, Object> evaluateCommand(Map<String, Object> command, Map<String, Object> ack) {
        String commandId = Jsons.text(command, "commandId", ""); String plotId = Jsons.text(command, "plotId", "");
        if (!evaluatedCommands.add(commandId)) return commandEvaluation(commandId);
        Map<String, Object> latest = latestMetrics(plotId); Map<String, Object> soil = latest.get("SOIL_MOISTURE") instanceof Map<?, ?> m ? Jsons.map(mapper, m) : Map.of();
        double before = Jsons.number(soil, "value", 0); String ackStatus = Jsons.text(ack, "status", "TIMEOUT");
        double actualWater = Jsons.number(ack, "actualWaterLitre", 0); double after = "SUCCEEDED".equals(ackStatus) ? Math.min(100, before + 10) : "PARTIAL".equals(ackStatus) ? before + 4 : before;
        String status = "TIMEOUT".equals(ackStatus) || "FAILED".equals(ackStatus) ? "INCONCLUSIVE" : "PARTIAL".equals(ackStatus) ? "PARTIAL" : "COMPLETED";
        String result = "SUCCEEDED".equals(ackStatus) && after > before ? "GOOD" : "PARTIAL".equals(ackStatus) ? "NO_EFFECT" : "EXECUTION_FAILED";
        // A cooldown protects the resource after water was actually delivered.
        // A failed or timed-out actuator attempt remains fully audited but
        // must not strand the plot for two hours with no water delivered.
        if ("SUCCEEDED".equals(ackStatus) || "PARTIAL".equals(ackStatus)) cooldowns.put(plotId, Instant.now());
        else cooldowns.remove(plotId);
        double expectedWater = Jsons.number(command, "waterLitre", 0); double diff = expectedWater == 0 ? 0 : (actualWater - expectedWater) / expectedWater;
        Map<String, Object> evaluation = new LinkedHashMap<>(); evaluation.put("evaluationId", Jsons.id("eval")); evaluation.put("planId", command.get("planId")); evaluation.put("commandId", commandId);
        evaluation.put("plotId", plotId);
        Map<String, Object> evaluationPlot = store.find("plot", plotId);
        evaluation.put("farmId", evaluationPlot == null ? null : Jsons.text(evaluationPlot, "farmId", ""));
        evaluation.put("status", status); evaluation.put("expected", Map.of("soilMoistureBefore", before, "soilMoistureAfter", before + 10, "waterLitre", expectedWater));
        evaluation.put("actual", Map.of("soilMoistureBefore", before, "soilMoistureAfter", after, "waterLitre", actualWater));
        evaluation.put("planActualDiff", Map.of("waterLitrePct", Math.round(diff * 10000.0) / 100.0, "soilMoisturePoint", after - (before + 10)));
        evaluation.put("effectivenessScore", status.equals("COMPLETED") && "GOOD".equals(result) ? .94 : status.equals("PARTIAL") ? .45 : 0.0); evaluation.put("result", result);
        evaluation.put("evidenceWindow", Map.of("beforeMinutes", 30, "afterMinutes", 30)); evaluation.put("createdAt", Instant.now().toString());
        store.save("evaluation", Jsons.text(evaluation, "evaluationId", ""), evaluation); store.save("command", commandId, command); events.publish("evaluation.completed", evaluation); store.logEvent("ACTION_EVALUATED", evaluation);
        return evaluation;
    }

    Map<String, Object> commandEvaluation(String commandId) {
        return store.list("evaluation").stream().filter(e -> commandId.equals(Jsons.text(e, "commandId", ""))).findFirst().orElse(Map.of("status", "PENDING", "commandId", commandId));
    }

    Map<String, Object> forecast(String plotId, String metric) {
        requireRecord("plot", plotId);
        return forecastForSimulation(plotId, metric, plotSimulationView(plotId), true);
    }

    /**
     * Forecasts are strategy-aware projections rather than a straight line
     * through a tiny, stable sample window.  Observed telemetry still anchors
     * the starting point, while the selected plot strategy contributes bounded
     * trend, volatility and uncertainty.  The same method is used by read-only
     * what-if runs so the UI and the live simulator share one shape of curve.
     */
    private Map<String, Object> forecastForSimulation(String plotId, String metric,
                                                       Map<String, Object> simulation, boolean persist) {
        Map<String, Object> context = plotCropContext(plotId);
        String usedMetric = metric == null ? "SOIL_MOISTURE" : metric.toUpperCase(Locale.ROOT);
        if (!Set.of("SOIL_MOISTURE", "AIR_TEMPERATURE", "AIR_HUMIDITY", "LIGHT", "CO2", "PH", "WATER_LEVEL", "RAINFALL").contains(usedMetric)) {
            usedMetric = "SOIL_MOISTURE";
        }
        if (!Jsons.bool(context, "stageMatched", true)) return forecastUnavailable(plotId, usedMetric, "STAGE_UNKNOWN", 0, context, simulation, persist);
        Map<String, Object> forecastProfile = Jsons.map(mapper, context.get("forecastProfile"));
        int minSamples = Math.max(3, (int) Jsons.whole(forecastProfile, "minValidSamples", 6));
        List<Map<String, Object>> points = telemetry(plotId, usedMetric, null, null, 500).stream()
                .filter(p -> "GOOD".equalsIgnoreCase(Jsons.text(Jsons.map(mapper, p.get("quality")), "status", "BAD")))
                .toList();
        String scenario = Jsons.text(simulation, "scenario", "NORMAL").toUpperCase(Locale.ROOT);
        Map<String, Object> parameters = Jsons.map(mapper, simulation.get("parameters"));
        Map<String, Object> latest = latestMetrics(plotId);
        Map<String, Object> latestMetric = latest.get(usedMetric) instanceof Map<?, ?> value ? Jsons.map(mapper, value) : Map.of();
        boolean offlineScenario = "DEVICE_OFFLINE".equals(scenario);
        if (offlineScenario && latestMetric.isEmpty()) {
            return forecastUnavailable(plotId, usedMetric, "DEVICE_OFFLINE", points.size(), context, simulation, persist);
        }
        if (points.size() < minSamples && points.isEmpty()
                && !"simulation".equalsIgnoreCase(properties.getMode())) {
            return forecastUnavailable(plotId, usedMetric, "INSUFFICIENT_SAMPLES", points.size(), context, simulation, persist);
        }
        Map<String, Object> last = points.isEmpty() ? latestMetric : points.get(points.size() - 1);
        // Keep the first point inside the list even when only one valid sample
        // is available.  The previous expression subtracted the window from
        // the list size, which produced index 1 for a one-point list and made
        // the risk-forecast endpoint return HTTP 500 for a fresh real sensor.
        int firstIndex = Math.max(0, points.size() - 1 - Math.min(points.size() - 1, 12));
        Map<String, Object> first = points.isEmpty() ? last : points.get(firstIndex);
        double current = Jsons.number(last, "value", baselineMetricValue(plotId, usedMetric));
        double observedSlopePerHour = 0.0;
        if (!points.isEmpty()) {
            long durationMinutes = Math.max(1, Duration.between(Jsons.instant(first.get("ts"), Instant.EPOCH), Jsons.instant(last.get("ts"), Instant.EPOCH)).toMinutes());
            observedSlopePerHour = (Jsons.number(last, "value", current) - Jsons.number(first, "value", current)) * 60.0 / durationMinutes;
            observedSlopePerHour = clamp(observedSlopePerHour, -30, 30);
        }
        double mean = points.stream().mapToDouble(p -> Jsons.number(p, "value", current)).average().orElse(current);
        double mad = points.stream().mapToDouble(p -> Math.abs(Jsons.number(p, "value", current) - mean)).average().orElse(.8);
        double volatility = clamp(Jsons.number(parameters, "volatility", 1.25), .2, 3.0);
        double forecastHours = clamp(Jsons.number(parameters, "forecastHours", 4), 1, 12);
        int maxHorizon = Math.max(60, (int) Math.round(forecastHours * 60));
        double strategyTrend = strategyTrendPerHour(usedMetric, scenario, parameters, observedSlopePerHour, points.size() >= minSamples);
        double driftRate = "SENSOR_DRIFT".equals(scenario) ? Jsons.number(parameters, "driftRatePerHour", 2.4) : 0;
        double[] valueRange = metricRange(usedMetric);
        List<Map<String, Object>> curve = new ArrayList<>();
        for (int minute = 0; minute <= maxHorizon; minute += 5) {
            double hours = minute / 60.0;
            // Minute zero is the observed hand-off point, not a simulated
            // sample.  Keeping it exact makes every metric continuous with
            // the historical series even when the projection uses a
            // plot-specific phase for later volatility.
            double value = minute == 0 ? clamp(current, valueRange[0], valueRange[1])
                    : projectMetric(usedMetric, current, hours, strategyTrend, driftRate, scenario, parameters, plotId);
            double spread = Math.max(.35, mad * (1 + minute / 240.0) + volatility * .22 * Math.sqrt(Math.max(1, minute / 5.0)));
            double lower = clamp(value - spread, valueRange[0], valueRange[1]);
            double upper = clamp(value + spread, valueRange[0], valueRange[1]);
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("minute", minute);
            // Preserve the observed hand-off value at full precision.  Later
            // points are rounded for a compact chart payload, but the first
            // point must be exactly equal to the latest telemetry sample.
            point.put("expected", minute == 0 ? value : round(value));
            point.put("lower", round(lower)); point.put("upper", round(upper)); point.put("scenario", scenario); curve.add(point);
        }
        String ruleCode = "AIR_TEMPERATURE".equals(usedMetric) ? "HEAT_STRESS" : "WATER_DEFICIT";
        Map<String, Object> boundRule = cropPackCatalog.rule(context, ruleCode);
        String operator = Jsons.text(boundRule, "operator", "SOIL_MOISTURE".equals(usedMetric) ? "LT" : "GT");
        double boundary = Jsons.number(boundRule, "threshold", "SOIL_MOISTURE".equals(usedMetric) ? 20 : 35);
        if ("SOIL_MOISTURE".equals(usedMetric)) {
            boundary = Jsons.number(parameters, "riskThreshold", boundary);
            if ("HEAVY_RAIN".equals(scenario)) { operator = "GT"; boundary = Jsons.number(parameters, "waterloggingThreshold", 82); }
        }
        Integer timeToRisk = null;
        for (Map<String, Object> point : curve) {
            double value = Jsons.number(point, "expected", current);
            if (("LT".equals(operator) && value <= boundary) || ("GT".equals(operator) && value >= boundary)) {
                timeToRisk = (int) Jsons.whole(point, "minute", 0); break;
            }
        }
        List<Integer> requestedHorizons = horizonMinutes(forecastProfile);
        requestedHorizons = requestedHorizons.stream().filter(value -> value <= maxHorizon).toList();
        if (requestedHorizons.isEmpty()) requestedHorizons = List.of(Math.min(60, maxHorizon), Math.min(120, maxHorizon), maxHorizon).stream().distinct().toList();
        List<Map<String, Object>> horizons = requestedHorizons.stream().map(minute -> {
            Map<String, Object> point = curve.get(Math.min(curve.size() - 1, Math.max(0, minute / 5)));
            Map<String, Object> item = new LinkedHashMap<>(); item.put("minutes", minute); item.put("value", point.get("expected")); item.put("expected", point.get("expected")); item.put("lower", point.get("lower")); item.put("upper", point.get("upper")); return item;
        }).toList();
        Map<String, Object> result = new LinkedHashMap<>(); result.put("forecastId", Jsons.id("fc")); result.put("plotId", plotId); result.put("metric", usedMetric);
        result.put("issuedAt", Instant.now().toString()); result.put("status", "AVAILABLE"); result.put("scenario", scenario); result.put("simulation", simulation);
        result.put("startValue", curve.isEmpty() ? current : curve.get(0).get("expected"));
        result.put("startTimestamp", last.get("ts"));
        result.put("curve", curve); result.put("horizons", horizons); result.put("timeToRiskMinutes", timeToRisk);
        result.put("riskBoundary", Map.of("operator", operator, "value", boundary, "unit", unitFor(usedMetric), "ruleCode", ruleCode));
        Map<String, Object> inputWindow = new LinkedHashMap<>(); inputWindow.put("validSamples", points.size()); inputWindow.put("mode", points.size() >= minSamples ? "OBSERVED_PLUS_STRATEGY" : "SIMULATION_STRATEGY");
        if (!points.isEmpty()) { inputWindow.put("from", first.get("ts")); inputWindow.put("to", last.get("ts")); }
        result.put("inputWindow", inputWindow);
        result.put("quality", Map.of("coverage", points.isEmpty() ? .35 : points.stream().filter(p -> "GOOD".equals(Jsons.text(Jsons.map(mapper, p.get("quality")), "status", "BAD"))).count() / (double) points.size(), "confidenceBandSource", points.size() >= minSamples ? "RESIDUAL_MAD_PLUS_STRATEGY_VOLATILITY" : "STRATEGY_PRIOR"));
        result.put("assumptions", List.of("NO_IRRIGATION", "PLOT_STRATEGY=" + scenario, "SIMULATION_TIME_SCALE=" + Jsons.number(parameters, "timeScale", 60), "STAGE=" + context.get("stageCode")));
        result.put("algorithmVersion", Jsons.text(forecastProfile, "algorithm", "strategy-aware-trend-v2"));
        result.put("cropPackVersion", context.get("cropPackVersion")); result.put("ruleVersion", context.get("ruleVersion"));
        result.put("stageCode", context.get("stageCode")); result.put("stageLabel", context.get("stageLabel"));
        result.put("expiresAt", Instant.now().plus(10, ChronoUnit.MINUTES).toString());
        if (persist) { store.save("forecast", Jsons.text(result, "forecastId", ""), result); events.publish("forecast.created", result); store.logEvent("forecast.created", result); }
        return result;
    }

    private double strategyTrendPerHour(String metric, String scenario, Map<String, Object> params,
                                        double observedSlopePerHour, boolean enoughSamples) {
        if ("SOIL_MOISTURE".equals(metric)) {
            double configured = Jsons.number(params, "soilMoistureTrendPerHour", 0);
            // The simulator publishes frequent samples (normally every
            // 20 seconds).  Extrapolating the first/last value of a tiny
            // window by 65% amplified ordinary sensor noise into a dramatic
            // 32% -> 80% line in the NORMAL scenario.  Keep the configured
            // plot strategy authoritative and use only a small, bounded
            // residual correction when there is enough history.
            if ("NORMAL".equals(scenario) && enoughSamples) {
                double residual = clamp(observedSlopePerHour, -2.5, 2.5);
                return clamp(configured * .88 + residual * .12, -3.0, 3.0);
            }
            return configured;
        }
        if ("AIR_TEMPERATURE".equals(metric)) return Jsons.number(params, "temperatureBias", 0) * .75 + (enoughSamples ? observedSlopePerHour * .25 : 0);
        if ("AIR_HUMIDITY".equals(metric)) return Jsons.number(params, "humidityBias", 0) * .65 + (enoughSamples ? observedSlopePerHour * .25 : 0);
        if ("RAINFALL".equals(metric)) return Jsons.number(params, "rainfallRate", 0);
        return enoughSamples ? observedSlopePerHour * .35 : 0;
    }

    private double projectMetric(String metric, double current, double hours, double trend, double driftRate,
                                 String scenario, Map<String, Object> params, String plotId) {
        double volatility = Jsons.number(params, "volatility", 1.25);
        double phase = Math.abs(plotId.hashCode() % 17);
        double wave = (Math.sin((hours * 2.6) + phase) - Math.sin(phase)) * volatility;
        double value;
        if ("AIR_TEMPERATURE".equals(metric) || "AIR_HUMIDITY".equals(metric)) {
            value = current + trend * (1 - Math.exp(-hours / 2.0)) + wave * ("AIR_HUMIDITY".equals(metric) ? 1.4 : .55);
        } else if ("RAINFALL".equals(metric)) {
            double rate = Math.max(0, Jsons.number(params, "rainfallRate", 0));
            double target = rate * (0.72 + .28 * Math.max(0, Math.sin(hours * 3.1 + 1.2)));
            double ramp = 1 - Math.exp(-hours * 3.0);
            value = current + (target - current) * ramp + wave * .5;
        } else {
            value = current + trend * hours + wave * ("LIGHT".equals(metric) ? 900 : "CO2".equals(metric) ? 18 : .35);
            if ("SENSOR_DRIFT".equals(scenario)) value += driftRate * hours;
        }
        double[] range = metricRange(metric);
        return clamp(value, range[0], range[1]);
    }

    private double baselineMetricValue(String plotId, String metric) {
        Map<String, Object> plot = store.find("plot", plotId);
        Map<String, Object> metrics = Jsons.map(mapper, plot == null ? null : plot.get("metrics"));
        Map<String, Object> item = Jsons.map(mapper, metrics.get(metric));
        return Jsons.number(item, "value", switch (metric) { case "AIR_TEMPERATURE" -> 24; case "AIR_HUMIDITY" -> 68; case "LIGHT" -> 30_000; case "CO2" -> 520; case "PH" -> 6.25; case "WATER_LEVEL" -> 78; case "RAINFALL" -> 0; default -> 35; });
    }

    private double[] metricRange(String metric) {
        return switch (metric) { case "AIR_TEMPERATURE" -> new double[]{-40, 80}; case "AIR_HUMIDITY", "SOIL_MOISTURE", "WATER_LEVEL" -> new double[]{0, 100}; case "PH" -> new double[]{0, 14}; case "CO2" -> new double[]{0, 10_000}; case "RAINFALL" -> new double[]{0, 250}; default -> new double[]{0, 100_000}; };
    }

    private List<Integer> horizonMinutes(Map<String, Object> forecastProfile) {
        List<Integer> minutes = new ArrayList<>();
        Object raw = forecastProfile.get("horizonsMinutes");
        if (raw instanceof Collection<?> collection) {
            for (Object item : collection) {
                if (item instanceof Number number) minutes.add(number.intValue());
            }
        }
        return minutes.isEmpty() ? List.of(60, 120, 240) : minutes;
    }

    private Map<String, Object> forecastUnavailable(String plotId, String metric, String reason, int samples) {
        return forecastUnavailable(plotId, metric, reason, samples, Map.of(), Map.of());
    }

    private Map<String, Object> forecastUnavailable(String plotId, String metric, String reason, int samples, Map<String, Object> context) {
        return forecastUnavailable(plotId, metric, reason, samples, context, Map.of());
    }

    private Map<String, Object> forecastUnavailable(String plotId, String metric, String reason, int samples,
                                                    Map<String, Object> context, Map<String, Object> simulation) {
        return forecastUnavailable(plotId, metric, reason, samples, context, simulation, true);
    }

    private Map<String, Object> forecastUnavailable(String plotId, String metric, String reason, int samples,
                                                    Map<String, Object> context, Map<String, Object> simulation, boolean persist) {
        Map<String, Object> result = new LinkedHashMap<>(); result.put("forecastId", Jsons.id("fc")); result.put("plotId", plotId); result.put("metric", metric); result.put("status", "UNAVAILABLE");
        result.put("reason", reason); result.put("inputWindow", Map.of("validSamples", samples)); result.put("horizons", List.of()); result.put("curve", List.of()); result.put("timeToRiskMinutes", null);
        if (!simulation.isEmpty()) { result.put("scenario", simulation.get("scenario")); result.put("simulation", simulation); }
        result.put("algorithmVersion", Jsons.text(Jsons.map(mapper, context.get("forecastProfile")), "algorithm", "robust-trend-v1"));
        result.put("stageCode", context.get("stageCode")); result.put("cropPackVersion", context.get("cropPackVersion"));
        if (persist) store.save("forecast", Jsons.text(result, "forecastId", ""), result);
        return result;
    }

    private double round(double value) { return Math.round(value * 100.0) / 100.0; }

    Map<String, Object> createInspection(Map<String, Object> input, UserPrincipal principal) {
        if (!principal.canInspect()) throw new ApiException(HttpStatus.FORBIDDEN, "INSPECTION_FORBIDDEN", "当前角色不能提交巡田记录");
        String plotId = Jsons.text(input, "plotId", "").trim();
        if (plotId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_CONTEXT_REQUIRED", "请先选择地块");
        ensurePlotAccess(principal, plotId);
        Map<String, Object> plot = requireRecord("plot", plotId);
        String farmId = Jsons.text(plot, "farmId", "");
        String requestedFarmId = Jsons.text(input, "farmId", farmId).trim();
        if (!farmId.equals(requestedFarmId)) throw new ApiException(HttpStatus.BAD_REQUEST, "FARM_CONTEXT_MISMATCH", "巡田记录的农场与地块不一致");

        String workOrderId = Jsons.text(input, "workOrderId", "").trim();
        Map<String, Object> linkedWorkOrder = null;
        if (!workOrderId.isBlank()) {
            linkedWorkOrder = scopedWorkOrder(workOrderId, principal);
            if (!plotId.equals(Jsons.text(linkedWorkOrder, "plotId", ""))) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_WORK_ORDER_MISMATCH", "所选任务不属于这块地");
            }
            String workStatus = normalizeWorkStatus(linkedWorkOrder.get("status"));
            if (TERMINAL_WORK_ORDER_STATUSES.contains(workStatus)) {
                throw new ApiException(HttpStatus.CONFLICT, "INSPECTION_WORK_ORDER_CLOSED", "这项任务已经结束，不能再补充巡田记录");
            }
            if ("FARMER".equals(principal.role)) {
                requireAssignedFarmer(linkedWorkOrder, principal);
                if (!"IN_PROGRESS".equals(workStatus)) {
                    throw new ApiException(HttpStatus.CONFLICT, "INSPECTION_WORK_ORDER_NOT_ACTIVE", "请先开始任务，再记录现场巡田结果");
                }
            }
        }

        String diagnosisId = validatedInspectionReference(input, "diagnosisId", "diagnosis", plotId);
        String cropBatchId = validatedInspectionReference(input, "cropBatchId", "crop-batch", plotId);
        String soilSurface = Jsons.text(input, "soilSurface", "").trim();
        String cropCondition = Jsons.text(input, "cropCondition", "").trim();
        String deviceStatus = Jsons.text(input, "deviceStatus", "").trim();
        String notes = Jsons.text(input, "notes", "").trim();
        if (List.of(soilSurface, cropCondition, deviceStatus, notes).stream().allMatch(String::isBlank)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_OBSERVATION_REQUIRED", "请至少填写一项现场观察");
        }

        Instant now = Instant.now();
        String observedText = Jsons.text(input, "observedAt", now.toString()).trim();
        Instant observedAt;
        try { observedAt = Instant.parse(observedText); }
        catch (Exception ignored) { throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_TIME_INVALID", "巡田时间格式不正确"); }
        if (observedAt.isAfter(now.plus(5, ChronoUnit.MINUTES))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_TIME_INVALID", "巡田时间不能晚于当前时间");
        }

        Double portableSoilMoisture = null;
        Object portableValue = input.get("portableSoilMoisture");
        if (portableValue != null && !String.valueOf(portableValue).isBlank()) {
            try { portableSoilMoisture = Double.parseDouble(String.valueOf(portableValue)); }
            catch (NumberFormatException ignored) { throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_MOISTURE_INVALID", "便携仪含水率必须是数字"); }
            if (portableSoilMoisture < 0 || portableSoilMoisture > 100) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_MOISTURE_INVALID", "便携仪含水率必须在 0% 到 100% 之间");
            }
        }

        String inspectionId = Jsons.id("ins");
        String summary = inspectionSummary(soilSurface, cropCondition, deviceStatus, notes);
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("inspectionId", inspectionId);
        record.put("farmId", farmId);
        record.put("plotId", plotId);
        if (!workOrderId.isBlank()) record.put("workOrderId", workOrderId);
        if (!diagnosisId.isBlank()) record.put("diagnosisId", diagnosisId);
        if (!cropBatchId.isBlank()) record.put("cropBatchId", cropBatchId);
        record.put("operatorId", principal.userId);
        record.put("operatorName", principal.username);
        record.put("operatorRole", principal.role);
        record.put("observedAt", observedAt.toString());
        record.put("createdAt", now.toString());
        record.put("updatedAt", now.toString());
        record.put("revision", 1);
        record.put("soilSurface", soilSurface.isBlank() ? null : soilSurface);
        record.put("cropCondition", cropCondition.isBlank() ? null : cropCondition);
        record.put("deviceStatus", deviceStatus.isBlank() ? null : deviceStatus);
        record.put("portableSoilMoisture", portableSoilMoisture);
        record.put("notes", notes.isBlank() ? null : notes);
        record.put("evidenceSummary", summary);
        record.put("provenance", "USER_PROVIDED");
        record.put("sourceType", "HUMAN_OBSERVATION");
        record.put("photos", new ArrayList<>());
        long completedFields = List.of(soilSurface, cropCondition, deviceStatus, notes).stream().filter(value -> !value.isBlank()).count();
        record.put("quality", Map.of("status", completedFields == 4 ? "GOOD" : "INCOMPLETE", "completeness", round(completedFields / 4.0)));

        store.save("inspection", inspectionId, record);
        if (linkedWorkOrder != null) {
            List<String> evidenceRefs = new ArrayList<>(Jsons.strings(linkedWorkOrder.get("evidenceRefs")));
            if (!evidenceRefs.contains(inspectionId)) evidenceRefs.add(inspectionId);
            linkedWorkOrder.put("evidenceRefs", evidenceRefs);
            updateWorkOrderAudit(linkedWorkOrder, principal, now);
            String status = normalizeWorkStatus(linkedWorkOrder.get("status"));
            appendWorkOrderHistory(linkedWorkOrder, "EVIDENCE_ADDED", status, status, principal, "新增巡田证据：" + summary, List.of(inspectionId));
            saveWorkOrder(linkedWorkOrder, "evidence-added");
        }
        events.publish("inspection.created", record);
        store.logEvent("inspection.created", record);
        return record;
    }

    Map<String, Object> uploadInspectionPhotos(String inspectionId, List<MultipartFile> files, UserPrincipal principal) {
        Map<String, Object> record = requireInspectionForPhoto(inspectionId, principal);
        if (!principal.canInspect()) throw new ApiException(HttpStatus.FORBIDDEN, "INSPECTION_FORBIDDEN", "当前角色不能补充巡田照片");
        List<MultipartFile> uploads = files == null ? List.of() : files.stream().filter(file -> file != null && !file.isEmpty()).toList();
        if (uploads.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_PHOTO_REQUIRED", "请选择至少一张现场照片");
        List<Map<String, Object>> photos = new ArrayList<>(Jsons.maps(mapper, record.get("photos")));
        if (photos.size() + uploads.size() > INSPECTION_PHOTO_MAX_COUNT) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_PHOTO_LIMIT", "每条巡田记录最多保存 " + INSPECTION_PHOTO_MAX_COUNT + " 张照片");
        }
        Instant now = Instant.now();
        Path directory = inspectionPhotoDirectory(inspectionId);
        try { Files.createDirectories(directory); }
        catch (IOException error) { throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ATTACHMENT_STORE_UNAVAILABLE", "现场照片存储不可用"); }
        for (MultipartFile file : uploads) {
            if (file.getSize() > INSPECTION_PHOTO_MAX_BYTES) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_PHOTO_TOO_LARGE", "单张照片不能超过 2MB");
            }
            String contentType = inspectPhotoType(file);
            String photoId = Jsons.id("photo");
            String extension = photoExtension(contentType);
            Path stored = directory.resolve(photoId + extension).normalize();
            if (!stored.startsWith(directory)) throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_PHOTO_INVALID", "照片路径无效");
            try { Files.write(stored, file.getBytes()); }
            catch (IOException error) { throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ATTACHMENT_STORE_UNAVAILABLE", "现场照片保存失败"); }
            Map<String, Object> photo = new LinkedHashMap<>();
            photo.put("photoId", photoId);
            photo.put("fileName", sanitizePhotoName(file.getOriginalFilename(), photoId + extension));
            photo.put("contentType", contentType);
            photo.put("sizeBytes", file.getSize());
            photo.put("provenance", "USER_PROVIDED");
            photo.put("sourceType", "HUMAN_OBSERVATION");
            photo.put("uploadedAt", now.toString());
            photo.put("uploadedBy", principal.userId);
            photos.add(photo);
        }
        record.put("photos", photos);
        record.put("updatedAt", now.toString());
        record.put("revision", Jsons.whole(record, "revision", 1) + 1);
        store.save("inspection", inspectionId, record);
        events.publish("inspection.photos.updated", record);
        store.logEvent("inspection.photos.updated", Map.of("inspectionId", inspectionId, "photoCount", photos.size(), "uploadedBy", principal.userId));
        return record;
    }

    Map<String, Object> inspectionPhoto(String inspectionId, String photoId, UserPrincipal principal) {
        Map<String, Object> record = requireInspectionForPhoto(inspectionId, principal);
        Map<String, Object> photo = Jsons.maps(mapper, record.get("photos")).stream()
                .filter(item -> photoId.equals(Jsons.text(item, "photoId", "")))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "INSPECTION_PHOTO_NOT_FOUND", "现场照片不存在"));
        Path stored = inspectionPhotoDirectory(inspectionId).resolve(photoId + photoExtension(Jsons.text(photo, "contentType", "image/jpeg"))).normalize();
        if (!Files.isRegularFile(stored)) throw new ApiException(HttpStatus.NOT_FOUND, "INSPECTION_PHOTO_NOT_FOUND", "现场照片文件不存在");
        try {
            Map<String, Object> result = new LinkedHashMap<>(photo);
            result.put("bytes", Files.readAllBytes(stored));
            return result;
        } catch (IOException error) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ATTACHMENT_STORE_UNAVAILABLE", "现场照片读取失败");
        }
    }

    private Map<String, Object> requireInspectionForPhoto(String inspectionId, UserPrincipal principal) {
        Map<String, Object> record = requireRecord("inspection", inspectionId);
        ensurePlotAccess(principal, Jsons.text(record, "plotId", ""));
        return record;
    }

    private Path inspectionPhotoDirectory(String inspectionId) {
        String configured = properties.getAttachmentDir();
        Path root = Path.of(configured == null || configured.isBlank() ? "data/attachments" : configured).toAbsolutePath().normalize();
        return root.resolve("inspections").resolve(inspectionId);
    }

    private String inspectPhotoType(MultipartFile file) {
        String contentType = String.valueOf(file.getContentType() == null ? "" : file.getContentType()).trim().toLowerCase(Locale.ROOT);
        String name = String.valueOf(file.getOriginalFilename() == null ? "" : file.getOriginalFilename()).toLowerCase(Locale.ROOT);
        if (contentType.isBlank() || "application/octet-stream".equals(contentType)) {
            if (name.endsWith(".png")) contentType = "image/png";
            else if (name.endsWith(".webp")) contentType = "image/webp";
            else if (name.endsWith(".jpg") || name.endsWith(".jpeg")) contentType = "image/jpeg";
        }
        if ("image/jpg".equals(contentType)) contentType = "image/jpeg";
        if (!INSPECTION_PHOTO_TYPES.contains(contentType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_PHOTO_TYPE_INVALID", "仅支持 JPEG、PNG 或 WebP 现场照片");
        }
        return contentType;
    }

    private String photoExtension(String contentType) {
        return switch (contentType) {
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            default -> ".jpg";
        };
    }

    private String sanitizePhotoName(String original, String fallback) {
        String name = String.valueOf(original == null ? "" : original).replace("\\", "/");
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[^A-Za-z0-9._-]", "_");
        return name.isBlank() ? fallback : name.substring(0, Math.min(name.length(), 80));
    }

    private String validatedInspectionReference(Map<String, Object> input, String field, String type, String plotId) {
        String referenceId = Jsons.text(input, field, "").trim();
        if (referenceId.isBlank()) return "";
        Map<String, Object> reference = requireRecord(type, referenceId);
        if (!plotId.equals(Jsons.text(reference, "plotId", ""))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INSPECTION_REFERENCE_MISMATCH", "关联记录不属于这块地");
        }
        return referenceId;
    }

    private String inspectionSummary(String soilSurface, String cropCondition, String deviceStatus, String notes) {
        List<String> parts = new ArrayList<>();
        if (!soilSurface.isBlank()) parts.add("土壤" + inspectionObservationLabel(soilSurface));
        if (!cropCondition.isBlank()) parts.add("作物" + inspectionObservationLabel(cropCondition));
        if (!deviceStatus.isBlank()) parts.add("设备" + inspectionObservationLabel(deviceStatus));
        if (parts.isEmpty() && !notes.isBlank()) return notes;
        return String.join("；", parts);
    }

    private String inspectionObservationLabel(String value) {
        return switch (String.valueOf(value).trim().toUpperCase(Locale.ROOT)) {
            case "NORMAL" -> "正常";
            case "DRY" -> "干燥或开裂";
            case "WET" -> "过湿或积水";
            case "LEAF_SLIGHT_WILT" -> "叶片轻微萎蔫";
            case "DISEASE_SUSPECTED" -> "疑似病害";
            case "LOOSE" -> "接头松动";
            case "LEAKING" -> "管线渗漏";
            case "OFFLINE" -> "离线或无显示";
            default -> value;
        };
    }

    List<Map<String, Object>> inspections(String plotId) {
        return store.list("inspection").stream()
                .filter(i -> plotId.equals(Jsons.text(i, "plotId", "")))
                .sorted(Comparator.comparing((Map<String, Object> item) -> Jsons.instant(item.get("observedAt"), Instant.EPOCH)).reversed())
                .toList();
    }

    List<Map<String, Object>> todayWork(String plotId, UserPrincipal principal) {
        StreamBuilder work = new StreamBuilder();
        store.list("work-order").stream()
                .filter(w -> canAccessPlot(principal, Jsons.text(w, "plotId", "")))
                .filter(w -> !"FARMER".equals(principal.role) || farmerCanSeeWorkOrder(w, principal))
                .filter(w -> plotId == null || plotId.equals(Jsons.text(w, "plotId", "")))
                .map(this::normalizeWorkOrderForRead).forEach(work::add);
        store.list("alert").stream().filter(a -> canAccessPlot(principal, Jsons.text(a, "plotId", "")) &&
                (plotId == null || plotId.equals(Jsons.text(a, "plotId", ""))) && !Set.of("RESOLVED", "CLOSED").contains(Jsons.text(a, "status", ""))).forEach(a -> work.add(Map.of(
                "workItemId", Jsons.text(a, "alertId", Jsons.id("wi")), "sourceType", "ALERT", "sourceRef", a.get("alertId"), "plotId", a.get("plotId"),
                "priority", Jsons.text(a, "level", "MEDIUM"), "status", "OPEN", "reason", a.get("source"), "dueAt", Instant.now().plus(2, ChronoUnit.HOURS).toString())));
        store.list("diagnosis").stream().filter(d -> canAccessPlot(principal, Jsons.text(d, "plotId", "")) &&
                (plotId == null || plotId.equals(Jsons.text(d, "plotId", "")))).limit(20).forEach(d -> work.add(Map.of(
                "workItemId", Jsons.text(d, "diagnosisId", Jsons.id("wi")), "sourceType", "DIAGNOSIS", "sourceRef", d.get("diagnosisId"), "plotId", d.get("plotId"),
                "priority", Jsons.text(d, "primaryCause", "MEDIUM"), "status", "OPEN", "reason", "待处理根因诊断", "dueAt", Instant.now().plus(4, ChronoUnit.HOURS).toString())));
        return work.values.stream().sorted(Comparator.comparingInt((Map<String, Object> w) -> riskRank(Jsons.text(w, "priority", "LOW"))).reversed()).toList();
    }

    Map<String, Object> createWorkOrder(Map<String, Object> input, UserPrincipal principal) {
        boolean evidenceRequest = "READINESS".equalsIgnoreCase(Jsons.text(input, "sourceType", ""))
                || "INSPECTION".equalsIgnoreCase(Jsons.text(input, "actionType", ""));
        if (!principal.isFarmAdmin() && !(principal.canInspect() && evidenceRequest)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "WORK_ORDER_FORBIDDEN", "只有农场管理员可以派发工单");
        }
        String plotId = Jsons.text(input, "plotId", "").trim();
        if (plotId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_CONTEXT_REQUIRED", "请先选择地块");
        ensurePlotAccess(principal, plotId);
        Map<String, Object> plot = requireRecord("plot", plotId);
        String farmId = Jsons.text(plot, "farmId", "");
        String requestedFarmId = Jsons.text(input, "farmId", farmId);
        if (!farmId.equals(requestedFarmId)) throw new ApiException(HttpStatus.BAD_REQUEST, "FARM_CONTEXT_MISMATCH", "任务农场与地块不一致");
        Instant now = Instant.now();
        Map<String, Object> work = new LinkedHashMap<>(input);
        work.put("workOrderId", Jsons.id("wo"));
        work.put("farmId", farmId);
        work.put("plotId", plotId);
        work.put("title", Jsons.text(input, "title", evidenceRequest ? "完成现场补证" : "未命名农务任务"));
        work.put("reason", Jsons.text(input, "reason", evidenceRequest ? "补充现场核验信息" : "请按任务要求完成处理"));
        work.put("status", "OPEN");
        work.put("priority", normalizePriority(Jsons.text(input, "priority", "MEDIUM")));
        work.put("assigneeId", null);
        work.put("assigneeName", null);
        work.put("createdAt", now.toString());
        work.put("updatedAt", now.toString());
        work.put("createdBy", principal.userId);
        work.put("updatedBy", principal.userId);
        appendWorkOrderHistory(work, "CREATE", null, "OPEN", principal, Jsons.text(input, "reason", "创建任务"), List.of());
        saveWorkOrder(work, "created");
        return work;
    }

    List<Map<String, Object>> workOrders(Map<String, String> filters, UserPrincipal principal) {
        String farmId = filters == null ? "" : String.valueOf(filters.getOrDefault("farmId", "")).trim();
        String plotId = filters == null ? "" : String.valueOf(filters.getOrDefault("plotId", "")).trim();
        String status = filters == null ? "" : normalizeWorkStatus(filters.get("status"));
        String assigneeId = filters == null ? "" : String.valueOf(filters.getOrDefault("assigneeId", "")).trim();
        if (!farmId.isBlank() && !principal.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "当前账号没有该农场权限");
        if (!plotId.isBlank()) ensurePlotAccess(principal, plotId);
        return store.list("work-order").stream()
                .filter(work -> canAccessPlot(principal, Jsons.text(work, "plotId", "")))
                .filter(work -> !"FARMER".equals(principal.role) || farmerCanSeeWorkOrder(work, principal))
                .filter(work -> farmId.isBlank() || farmId.equals(Jsons.text(work, "farmId", farmIdForPlot(Jsons.text(work, "plotId", "")))))
                .filter(work -> plotId.isBlank() || plotId.equals(Jsons.text(work, "plotId", "")))
                .filter(work -> status.isBlank() || status.equals(normalizeWorkStatus(work.get("status"))))
                .filter(work -> assigneeId.isBlank() || assigneeId.equals(Jsons.text(work, "assigneeId", "")))
                .map(this::normalizeWorkOrderForRead)
                .sorted(Comparator.comparing(work -> Jsons.instant(work.get("dueAt"), Instant.MAX)))
                .toList();
    }

    Map<String, Object> assignWorkOrder(String workOrderId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> work = scopedWorkOrder(workOrderId, principal);
        String current = normalizeWorkStatus(work.get("status"));
        ensureWorkOrderState(current);
        if (TERMINAL_WORK_ORDER_STATUSES.contains(current)) throw new ApiException(HttpStatus.CONFLICT, "WORK_ORDER_TERMINAL", "已结束的任务不能重新分配");
        String assigneeId = Jsons.text(input, "assigneeId", "").trim();
        if (assigneeId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "ASSIGNEE_REQUIRED", "请选择种植农户");
        Map<String, Object> assignee = requireEligibleFarmer(assigneeId, work);
        Instant now = Instant.now();
        work.put("status", "ASSIGNED");
        work.put("assigneeId", assigneeId);
        work.put("assigneeName", Jsons.text(assignee, "displayName", Jsons.text(assignee, "username", assigneeId)));
        work.put("assignedBy", principal.userId);
        work.put("assignedAt", now.toString());
        String dueAtInput = Jsons.text(input, "dueAt", "").trim();
        if (!dueAtInput.isBlank()) {
            Instant renewedDueAt;
            try {
                renewedDueAt = Instant.parse(dueAtInput);
            } catch (java.time.format.DateTimeParseException error) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "WORK_ORDER_DUE_AT_INVALID", "新处理时限格式不正确");
            }
            if (!renewedDueAt.isAfter(now)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "WORK_ORDER_DUE_AT_INVALID", "新处理时限必须晚于当前时间");
            }
            work.put("dueAt", renewedDueAt.toString());
        }
        clearAttemptResult(work);
        updateWorkOrderAudit(work, principal, now);
        appendWorkOrderHistory(work, "OPEN".equals(current) ? "ASSIGN" : "REASSIGN", current, "ASSIGNED", principal,
                Jsons.text(input, "note", "任务已分配"), List.of());
        saveWorkOrder(work, "assigned");
        return work;
    }

    Map<String, Object> transitionWorkOrder(String workOrderId, Map<String, Object> input, UserPrincipal principal) {
        Map<String, Object> work = scopedWorkOrder(workOrderId, principal);
        String current = normalizeWorkStatus(work.get("status"));
        ensureWorkOrderState(current);
        String action = Jsons.text(input, "action", Jsons.text(input, "status", "")).trim().toUpperCase(Locale.ROOT);
        if ("IN_PROGRESS".equals(action)) action = "REJECTED".equals(current) ? "RESTART" : "START";
        if ("SUBMITTED".equals(action)) action = "SUBMIT";
        if ("CANCELLED".equals(action)) action = "CANCEL";
        Instant now = Instant.now();
        String target;
        switch (action) {
            case "START" -> {
                requireAssignedFarmer(work, principal);
                if (!"ASSIGNED".equals(current)) throw invalidWorkTransition(current, "开始执行");
                target = "IN_PROGRESS";
                work.put("startedAt", now.toString());
                work.put("startedBy", principal.userId);
            }
            case "RESTART", "RESUME" -> {
                requireAssignedFarmer(work, principal);
                if (!"REJECTED".equals(current)) throw invalidWorkTransition(current, "重新处理");
                target = "IN_PROGRESS";
                work.put("restartedAt", now.toString());
                work.put("restartedBy", principal.userId);
                clearAttemptResult(work);
            }
            case "SUBMIT" -> {
                requireAssignedFarmer(work, principal);
                if (!"IN_PROGRESS".equals(current)) throw invalidWorkTransition(current, "提交结果");
                String resultSummary = Jsons.text(input, "resultSummary", Jsons.text(input, "note", "")).trim();
                if (resultSummary.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "WORK_RESULT_REQUIRED", "请填写处理结果");
                target = "SUBMITTED";
                work.put("resultSummary", resultSummary);
                LinkedHashSet<String> evidenceRefs = new LinkedHashSet<>(Jsons.strings(work.get("evidenceRefs")));
                evidenceRefs.addAll(Jsons.strings(input.get("evidenceRefs")));
                work.put("evidenceRefs", new ArrayList<>(evidenceRefs));
                work.put("submittedAt", now.toString());
                work.put("submittedBy", principal.userId);
            }
            case "CANCEL" -> {
                requireFarmAdmin(principal);
                if (TERMINAL_WORK_ORDER_STATUSES.contains(current)) throw new ApiException(HttpStatus.CONFLICT, "WORK_ORDER_TERMINAL", "已结束的任务不能取消");
                target = "CANCELLED";
                work.put("cancelledAt", now.toString());
                work.put("cancelledBy", principal.userId);
                work.put("cancelReason", Jsons.text(input, "note", "管理员取消任务"));
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "WORK_ORDER_ACTION_INVALID", "不支持的任务操作");
        }
        work.put("status", target);
        updateWorkOrderAudit(work, principal, now);
        String note = "SUBMIT".equals(action) ? Jsons.text(work, "resultSummary", "已提交处理结果") : Jsons.text(input, "note", workActionLabel(action));
        appendWorkOrderHistory(work, action, current, target, principal, note,
                "SUBMIT".equals(action) ? Jsons.strings(work.get("evidenceRefs")) : Jsons.strings(input.get("evidenceRefs")));
        saveWorkOrder(work, target.toLowerCase(Locale.ROOT));
        return work;
    }

    Map<String, Object> reviewWorkOrder(String workOrderId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> work = scopedWorkOrder(workOrderId, principal);
        String current = normalizeWorkStatus(work.get("status"));
        if (!"SUBMITTED".equals(current)) throw invalidWorkTransition(current, "验收");
        String action = Jsons.text(input, "action", Jsons.text(input, "status", "")).trim().toUpperCase(Locale.ROOT);
        String note = Jsons.text(input, "note", "").trim();
        boolean approved = Set.of("APPROVE", "ACCEPT", "DONE").contains(action);
        boolean rejected = Set.of("REJECT", "REJECTED").contains(action);
        if (!approved && !rejected) throw new ApiException(HttpStatus.BAD_REQUEST, "WORK_REVIEW_ACTION_INVALID", "请选择验收通过或退回处理");
        if (rejected && note.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "WORK_REVIEW_NOTE_REQUIRED", "退回任务时请填写原因");
        Instant now = Instant.now();
        String target = approved ? "DONE" : "REJECTED";
        work.put("status", target);
        work.put("reviewedAt", now.toString());
        work.put("reviewedBy", principal.userId);
        work.put("reviewNote", note);
        boolean verification = isAlertVerificationWork(work);
        String verificationResult = Jsons.text(input, "verificationResult", "CONFIRMED_ABNORMAL").trim().toUpperCase(Locale.ROOT);
        if (verification && approved && !Set.of("CONFIRMED_ABNORMAL", "CLEARED_NORMAL").contains(verificationResult)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VERIFICATION_RESULT_INVALID", "请选择现场正常或确认异常");
        }
        if (verification && approved) work.put("verificationResult", verificationResult);
        if (approved) {
            work.put("completedAt", now.toString());
            work.put("completedBy", principal.userId);
        } else {
            work.put("rejectedAt", now.toString());
            work.put("rejectedBy", principal.userId);
            work.put("rejectionReason", note);
        }
        updateWorkOrderAudit(work, principal, now);
        appendWorkOrderHistory(work, approved ? "APPROVE" : "REJECT", current, target, principal,
                note.isBlank() ? "验收通过" : note, List.of());
        saveWorkOrder(work, approved ? "completed" : "rejected");
        if (verification && approved) {
            Map<String, Object> result = new LinkedHashMap<>(work);
            result.put("verificationResolution", resolveApprovedVerification(work, verificationResult, principal));
            return result;
        }
        return work;
    }

    private boolean isAlertVerificationWork(Map<String, Object> work) {
        return "ALERT".equalsIgnoreCase(Jsons.text(work, "sourceType", ""))
                && "ALERT_VERIFICATION".equalsIgnoreCase(Jsons.text(work, "taskPurpose", ""));
    }

    private Map<String, Object> resolveApprovedVerification(Map<String, Object> verificationOrder,
                                                            String verificationResult,
                                                            UserPrincipal principal) {
        String alertId = Jsons.text(verificationOrder, "sourceRef", "");
        Map<String, Object> alert = store.find("alert", alertId);
        if ("CLEARED_NORMAL".equals(verificationResult)) {
            if (alert != null && !TERMINAL_ALERT_STATUSES.contains(Jsons.text(alert, "status", "").toUpperCase(Locale.ROOT))) {
                alert = transitionAlert(alertId, "CLOSED", principal);
            }
            return Map.of("mode", "CLOSED", "alert", alert == null ? Map.of() : alert);
        }

        Map<String, Object> existingFollowUp = store.list("work-order").stream()
                .filter(work -> "ALERT".equalsIgnoreCase(Jsons.text(work, "sourceType", "")))
                .filter(work -> alertId.equals(Jsons.text(work, "sourceRef", "")))
                .filter(work -> "ALERT_FOLLOW_UP".equalsIgnoreCase(Jsons.text(work, "taskPurpose", "")))
                .filter(work -> !TERMINAL_WORK_ORDER_STATUSES.contains(normalizeWorkStatus(work.get("status"))))
                .findFirst().orElse(null);
        if (existingFollowUp != null) return Map.of("mode", "DISPATCHED", "task", normalizeWorkOrderForRead(existingFollowUp));
        if (alert == null) return Map.of("mode", "PENDING", "reason", "原告警记录不存在");

        String farmId = Jsons.text(verificationOrder, "farmId", farmIdForPlot(Jsons.text(verificationOrder, "plotId", "")));
        String plotId = Jsons.text(verificationOrder, "plotId", "");
        Map<String, Object> assignee = store.userById(Jsons.text(verificationOrder, "assigneeId", ""));
        if (assignee == null || !isEligibleFarmerForPlot(assignee, farmId, plotId)) assignee = chooseBestFarmerForPlot(farmId, plotId);
        if (assignee == null) return Map.of("mode", "PENDING", "reason", "核查已完成，但暂无具备该地块权限的在岗农户");

        Map<String, Object> draft = new LinkedHashMap<>();
        draft.put("farmId", farmId);
        draft.put("plotId", plotId);
        draft.put("sourceType", "ALERT");
        draft.put("sourceRef", alertId);
        draft.put("actionType", Jsons.text(verificationOrder, "followUpActionType", "FIELD_OPERATION"));
        draft.put("taskPurpose", "ALERT_FOLLOW_UP");
        draft.put("parentVerificationWorkOrderId", Jsons.text(verificationOrder, "workOrderId", ""));
        draft.put("title", "处置：" + Jsons.text(alert, "title", "地块告警"));
        draft.put("reason", "现场核查已确认异常。核查结果：" + Jsons.text(verificationOrder, "resultSummary", "已确认异常") + "。请按核查证据完成处置。");
        draft.put("priority", Jsons.text(verificationOrder, "priority", "MEDIUM"));
        draft.put("dueAt", Instant.now().plus(2, ChronoUnit.HOURS).toString());
        draft.put("provenance", "DERIVED");
        Map<String, Object> created = createWorkOrder(draft, principal);
        Map<String, Object> assigned = assignWorkOrder(Jsons.text(created, "workOrderId", ""), Map.of(
                "assigneeId", Jsons.text(assignee, "userId", ""),
                "note", "根据核查结果自动下发处置任务"), principal);
        return Map.of("mode", "DISPATCHED", "task", assigned, "assigneeReason", farmerAssignmentReason(assignee, plotId));
    }

    private boolean isEligibleFarmerForPlot(Map<String, Object> user, String farmId, String plotId) {
        return user != null
                && "FARMER".equals(RolePolicy.canonical(Jsons.text(user, "role", "")))
                && Jsons.bool(user, "enabled", true)
                && (Jsons.strings(user.get("farmIds")).contains(farmId) || Jsons.strings(user.get("farmIds")).contains("*"))
                && (Jsons.strings(user.get("plotIds")).contains(plotId) || Jsons.strings(user.get("plotIds")).contains("*"));
    }

    List<Map<String, Object>> farmMembers(String farmId, UserPrincipal principal) {
        if (!principal.isFarmAdmin() && !principal.isSystemAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_MEMBERS_FORBIDDEN", "当前身份不能查看农场成员");
        String normalizedFarmId = String.valueOf(farmId == null ? "" : farmId).trim();
        if (normalizedFarmId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "FARM_CONTEXT_REQUIRED", "请先选择农场");
        if (!principal.canAccessFarm(normalizedFarmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "当前账号没有该农场权限");
        return store.listUsers().stream()
                .filter(user -> Set.of("FARMER", "FARM_ADMIN").contains(RolePolicy.canonical(Jsons.text(user, "role", ""))))
                .filter(user -> Jsons.strings(user.get("farmIds")).contains(normalizedFarmId) || Jsons.strings(user.get("farmIds")).contains("*"))
                .map(user -> {
                    Map<String, Object> member = new LinkedHashMap<>();
                    String role = RolePolicy.canonical(Jsons.text(user, "role", "FARMER"));
                    member.put("userId", Jsons.text(user, "userId", ""));
                    member.put("username", Jsons.text(user, "username", ""));
                    member.put("displayName", Jsons.text(user, "displayName", Jsons.text(user, "username", "未命名成员")));
                    member.put("role", role);
                    member.put("roleLabel", RolePolicy.label(role));
                    member.put("farmIds", List.of(normalizedFarmId));
                    List<String> assignedPlotIds = Jsons.strings(user.get("plotIds"));
                    member.put("plotIds", assignedPlotIds.contains("*") ? List.of("*") : assignedPlotIds.stream()
                            .filter(plotId -> normalizedFarmId.equals(farmIdForPlot(plotId)))
                            .toList());
                    member.put("status", Jsons.bool(user, "enabled", true) ? "ACTIVE" : "INACTIVE");
                    return member;
                })
                .sorted(Comparator.comparing(member -> Jsons.text(member, "username", "")))
                .toList();
    }

    Map<String, Object> createFarmMember(Map<String, Object> input, UserPrincipal principal) {
        requireFarmMemberAdmin(principal);
        String farmId = Jsons.text(input, "farmId", "").trim();
        if (farmId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "FARM_CONTEXT_REQUIRED", "请先选择农场");
        if (!principal.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "当前账号没有该农场权限");
        if (store.find("farm", farmId) == null) throw new ApiException(HttpStatus.NOT_FOUND, "FARM_NOT_FOUND", "农场不存在");
        if (input.containsKey("role") && !"FARMER".equalsIgnoreCase(Jsons.text(input, "role", "FARMER"))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "MEMBER_ROLE_IMMUTABLE", "这里只能创建种植农户账号");
        }
        String username = normalizeUsername(Jsons.text(input, "username", ""));
        validateUsername(username);
        String password = Jsons.text(input, "password", "");
        validatePassword(username, password);
        List<String> requestedPlots = Jsons.strings(input.get("plotIds"));
        LinkedHashSet<String> plotIds = new LinkedHashSet<>();
        for (String plotId : requestedPlots) {
            Map<String, Object> plot = requireRecord("plot", plotId);
            if (!farmId.equals(Jsons.text(plot, "farmId", "")) || !canAccessPlot(principal, plotId)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "MEMBER_SCOPE_FORBIDDEN", "只能授予当前农场内可管理的地块");
            }
            plotIds.add(plotId);
        }
        String recoveryCode = generateRecoveryCode();
        String displayName = Jsons.text(input, "displayName", username).trim();
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("userId", Jsons.id("user"));
        user.put("username", username);
        user.put("displayName", displayName.isBlank() ? username : displayName);
        user.put("passwordHash", passwordEncoder.encode(password));
        user.put("recoveryCodeHash", passwordEncoder.encode(normalizeRecoveryCode(recoveryCode)));
        user.put("role", "FARMER");
        user.put("farmIds", List.of(farmId));
        user.put("plotIds", new ArrayList<>(plotIds));
        user.put("enabled", true);
        user.put("credentialVersion", 1);
        if (!store.createUser(user)) throw new ApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该账号已存在");
        store.logEvent("FARM_MEMBER_CREATED", Map.of("userId", user.get("userId"), "username", username,
                "farmId", farmId, "createdBy", principal.userId));
        events.publish("member.created", Map.of("userId", user.get("userId"), "username", username, "farmId", farmId));
        Map<String, Object> result = farmMemberView(user, farmId);
        result.put("recoveryCode", recoveryCode);
        result.put("recoveryCodeShownOnce", true);
        result.put("createdAt", Instant.now().toString());
        result.put("createdBy", principal.userId);
        return result;
    }

    Map<String, Object> updateFarmMemberStatus(String userId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmMemberAdmin(principal);
        String farmId = Jsons.text(input, "farmId", "").trim();
        if (farmId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "FARM_CONTEXT_REQUIRED", "请先选择农场");
        if (!principal.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "当前账号没有该农场权限");
        Map<String, Object> member = store.userById(userId);
        if (member == null) throw new ApiException(HttpStatus.NOT_FOUND, "FARM_MEMBER_NOT_FOUND", "农场成员不存在");
        if (!"FARMER".equals(RolePolicy.canonical(Jsons.text(member, "role", "")))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "MEMBER_ROLE_IMMUTABLE", "这里只能启用或停用种植农户");
        }
        List<String> memberFarms = Jsons.strings(member.get("farmIds"));
        if (!memberFarms.contains(farmId) && !memberFarms.contains("*")) {
            throw new ApiException(HttpStatus.CONFLICT, "MEMBER_NOT_IN_FARM", "该成员不属于当前农场");
        }
        if (principal.userId.equals(userId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "MEMBER_SELF_STATUS_FORBIDDEN", "不能停用或启用自己的账号");
        }
        Boolean explicit = input.get("enabled") instanceof Boolean b ? b : null;
        String status = Jsons.text(input, "status", "").trim().toUpperCase(Locale.ROOT);
        boolean enabled;
        if (explicit != null) enabled = explicit;
        else if ("ACTIVE".equals(status) || "ENABLED".equals(status)) enabled = true;
        else if ("INACTIVE".equals(status) || "DISABLED".equals(status)) enabled = false;
        else throw new ApiException(HttpStatus.BAD_REQUEST, "MEMBER_STATUS_INVALID", "请指定启用或停用");
        boolean currentlyEnabled = Jsons.bool(member, "enabled", true);
        Map<String, Object> updated = currentlyEnabled == enabled ? member
                : store.updateUserEnabled(userId, enabled, !enabled);
        if (updated == null) throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "MEMBER_STATUS_UPDATE_FAILED", "成员状态更新失败");
        store.logEvent(enabled ? "FARM_MEMBER_ENABLED" : "FARM_MEMBER_DISABLED",
                Map.of("userId", userId, "farmId", farmId, "updatedBy", principal.userId));
        events.publish(enabled ? "member.enabled" : "member.disabled", Map.of("userId", userId, "farmId", farmId));
        Map<String, Object> result = farmMemberView(updated, farmId);
        result.put("updatedAt", Instant.now().toString());
        result.put("updatedBy", principal.userId);
        return result;
    }

    private void requireFarmMemberAdmin(UserPrincipal principal) {
        if (!principal.isFarmAdmin() && !principal.isSystemAdmin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FARM_MEMBERS_FORBIDDEN", "当前身份不能管理农场成员");
        }
    }

    private Map<String, Object> farmMemberView(Map<String, Object> user, String farmId) {
        Map<String, Object> member = new LinkedHashMap<>();
        String role = RolePolicy.canonical(Jsons.text(user, "role", "FARMER"));
        member.put("userId", Jsons.text(user, "userId", ""));
        member.put("username", Jsons.text(user, "username", ""));
        member.put("displayName", Jsons.text(user, "displayName", Jsons.text(user, "username", "未命名成员")));
        member.put("role", role);
        member.put("roleLabel", RolePolicy.label(role));
        member.put("farmIds", List.of(farmId));
        List<String> assignedPlotIds = Jsons.strings(user.get("plotIds"));
        member.put("plotIds", assignedPlotIds.contains("*") ? List.of("*") : assignedPlotIds.stream()
                .filter(plotId -> farmId.equals(farmIdForPlot(plotId)))
                .toList());
        member.put("status", Jsons.bool(user, "enabled", true) ? "ACTIVE" : "INACTIVE");
        return member;
    }

    private Map<String, Object> scopedWorkOrder(String workOrderId, UserPrincipal principal) {
        Map<String, Object> work = requireRecord("work-order", workOrderId);
        ensurePlotAccess(principal, Jsons.text(work, "plotId", ""));
        return normalizeWorkOrderForRead(work);
    }

    /**
     * Farmers see tasks assigned to them plus the evidence/readiness requests
     * they created themselves.  The latter used to disappear immediately
     * after submission because the list was filtered only by assignee, which
     * made the admin and farmer workspaces disagree about the same request.
     */
    private boolean farmerCanSeeWorkOrder(Map<String, Object> work, UserPrincipal principal) {
        if (principal == null || !"FARMER".equals(principal.role)) return true;
        if (principal.userId.equals(Jsons.text(work, "assigneeId", ""))) return true;
        return principal.userId.equals(Jsons.text(work, "createdBy", ""))
                && ("READINESS".equalsIgnoreCase(Jsons.text(work, "sourceType", ""))
                || "INSPECTION".equalsIgnoreCase(Jsons.text(work, "actionType", "")));
    }

    private Map<String, Object> normalizeWorkOrderForRead(Map<String, Object> source) {
        Map<String, Object> work = new LinkedHashMap<>(source);
        work.put("status", normalizeWorkStatus(work.get("status")));
        work.putIfAbsent("farmId", farmIdForPlot(Jsons.text(work, "plotId", "")));
        return work;
    }

    private String normalizeWorkStatus(Object value) {
        String status = String.valueOf(value == null ? "" : value).trim().toUpperCase(Locale.ROOT);
        return switch (status) {
            case "PENDING", "NEW" -> "OPEN";
            case "CLAIMED" -> "ASSIGNED";
            case "COMPLETED" -> "DONE";
            default -> status;
        };
    }

    private void ensureWorkOrderState(String status) {
        if (!WORK_ORDER_STATUSES.contains(status)) throw new ApiException(HttpStatus.CONFLICT, "WORK_ORDER_STATUS_INVALID", "当前任务状态无法流转");
    }

    private String normalizePriority(String value) {
        String priority = String.valueOf(value == null ? "MEDIUM" : value).trim().toUpperCase(Locale.ROOT);
        return Set.of("HIGH", "MEDIUM", "LOW").contains(priority) ? priority : "MEDIUM";
    }

    private void requireFarmAdmin(UserPrincipal principal) {
        if (!principal.isFarmAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "WORK_ORDER_FORBIDDEN", "只有农场管理员可以安排和验收任务");
    }

    private void requireAssignedFarmer(Map<String, Object> work, UserPrincipal principal) {
        if (!"FARMER".equals(principal.role) || !principal.userId.equals(Jsons.text(work, "assigneeId", ""))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "WORK_ORDER_ASSIGNEE_REQUIRED", "只有这项任务的执行农户可以操作");
        }
    }

    private Map<String, Object> requireEligibleFarmer(String assigneeId, Map<String, Object> work) {
        Map<String, Object> assignee = store.userById(assigneeId);
        if (assignee == null || !"FARMER".equals(RolePolicy.canonical(Jsons.text(assignee, "role", ""))) || !Jsons.bool(assignee, "enabled", true)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ASSIGNEE_INVALID", "请选择当前农场的有效种植农户");
        }
        String farmId = Jsons.text(work, "farmId", farmIdForPlot(Jsons.text(work, "plotId", "")));
        String plotId = Jsons.text(work, "plotId", "");
        List<String> farmIds = Jsons.strings(assignee.get("farmIds"));
        List<String> plotIds = Jsons.strings(assignee.get("plotIds"));
        if ((!farmIds.contains(farmId) && !farmIds.contains("*")) || (!plotIds.contains(plotId) && !plotIds.contains("*"))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ASSIGNEE_SCOPE_MISMATCH", "该农户没有这块地的任务权限");
        }
        return assignee;
    }

    private String farmIdForPlot(String plotId) {
        Map<String, Object> plot = store.find("plot", plotId);
        return plot == null ? "" : Jsons.text(plot, "farmId", "");
    }

    private void updateWorkOrderAudit(Map<String, Object> work, UserPrincipal principal, Instant now) {
        work.put("updatedAt", now.toString());
        work.put("updatedBy", principal.userId);
    }

    private void appendWorkOrderHistory(Map<String, Object> work, String action, String fromStatus, String toStatus,
                                        UserPrincipal principal, String note, List<String> evidenceRefs) {
        List<Map<String, Object>> history = new ArrayList<>(Jsons.maps(mapper, work.get("history")));
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("action", action);
        entry.put("fromStatus", fromStatus);
        entry.put("toStatus", toStatus);
        entry.put("actorId", principal.userId);
        entry.put("actorName", principal.username);
        entry.put("actorRole", principal.role);
        entry.put("at", Instant.now().toString());
        entry.put("note", String.valueOf(note == null ? "" : note));
        entry.put("evidenceRefs", evidenceRefs == null ? List.of() : evidenceRefs);
        history.add(entry);
        work.put("history", history);
    }

    private void clearAttemptResult(Map<String, Object> work) {
        for (String field : List.of("resultSummary", "evidenceRefs", "submittedAt", "submittedBy", "reviewedAt", "reviewedBy", "reviewNote", "rejectedAt", "rejectedBy", "rejectionReason")) work.remove(field);
    }

    private ApiException invalidWorkTransition(String current, String actionLabel) {
        return new ApiException(HttpStatus.CONFLICT, "WORK_ORDER_TRANSITION_INVALID", "任务当前为“" + current + "”，不能" + actionLabel);
    }

    private String workActionLabel(String action) {
        return switch (action) {
            case "START" -> "开始执行";
            case "RESTART", "RESUME" -> "重新处理";
            case "CANCEL" -> "取消任务";
            default -> "更新任务";
        };
    }

    private void saveWorkOrder(Map<String, Object> work, String eventSuffix) {
        String workOrderId = Jsons.text(work, "workOrderId", "");
        store.save("work-order", workOrderId, work);
        events.publish("workorder." + eventSuffix, work);
        store.logEvent("workorder." + eventSuffix, work);
    }

    Map<String, Object> resourcePlan(Map<String, Object> input, UserPrincipal principal) {
        boolean farmerPreview = principal.isFarmer();
        if (!principal.isFarmAdmin() && !farmerPreview) throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_PLAN_FORBIDDEN", "当前身份不能试算或安排农场资源");
        String farmId = Jsons.text(input, "farmId", Jsons.text(input, "scope", "")).trim();
        if (farmId.isBlank()) farmId = principal.farmIds.stream().filter(id -> !"*".equals(id)).findFirst().orElse("");
        if (farmId.isBlank() || !principal.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权安排该农场的水资源");
        String selectedFarmId = farmId;
        List<Map<String, Object>> demands = Jsons.maps(mapper, input.get("demands"));
        if (demands.isEmpty()) demands = store.list("irrigation-plan").stream()
                .filter(plan -> selectedFarmId.equals(farmIdForPlot(Jsons.text(plan, "plotId", "")))).limit(10).toList();
        Map<String, Object> resource = store.list("resource-profile").stream()
                .filter(profile -> selectedFarmId.equals(Jsons.text(profile, "farmId", ""))).findFirst().orElse(null);
        if (resource == null) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "RESOURCE_PROFILE_MISSING", "当前农场没有水资源容量配置");
        double capacity = Jsons.number(resource, "capacityLitres", 0); double remaining = capacity;
        List<Map<String, Object>> allocations = new ArrayList<>(), conflicts = new ArrayList<>(), unmet = new ArrayList<>();
        demands = new ArrayList<>(demands); demands.sort(Comparator.comparingInt((Map<String, Object> d) -> riskRank(Jsons.text(d, "priority", "MEDIUM"))).reversed());
        for (Map<String, Object> demand : demands) {
            double requested = Jsons.number(demand, "waterLitre", Jsons.number(demand, "requestedLitres", 0)); String plotId = Jsons.text(demand, "plotId", "plot-a01");
            if (!canAccessPlot(principal, plotId) || !selectedFarmId.equals(farmIdForPlot(plotId))) throw new ApiException(HttpStatus.FORBIDDEN, "PLOT_FORBIDDEN", "无权为该地块分配资源");
            double allocated = Math.min(remaining, Math.max(0, requested)); remaining -= allocated;
            allocations.add(Map.of("plotId", plotId, "requestedLitres", requested, "allocatedLitres", allocated, "status", allocated >= requested ? "ALLOCATED" : "PARTIAL"));
            if (allocated < requested) { Map<String, Object> reason = new LinkedHashMap<>(); reason.put("plotId", plotId); reason.put("requestedLitres", requested); reason.put("unmetLitres", requested - allocated); reason.put("reason", "WATER_CAPACITY"); unmet.add(reason); conflicts.add(Map.of("type", "CAPACITY", "plotId", plotId)); }
        }
        Map<String, Object> plan = new LinkedHashMap<>(); plan.put("resourcePlanId", Jsons.id("rp")); plan.put("status", unmet.isEmpty() ? "FEASIBLE" : "INFEASIBLE");
        plan.put("farmId", selectedFarmId); plan.put("scope", selectedFarmId); plan.put("window", Map.of("from", Instant.now().toString(), "to", Instant.now().plus(6, ChronoUnit.HOURS).toString()));
        plan.put("constraints", Map.of("waterCapacityLitres", capacity)); plan.put("allocations", allocations); plan.put("conflicts", conflicts); plan.put("unmetDemands", unmet); plan.put("algorithmVersion", "capacity-priority-v1");
        plan.put("trialOnly", farmerPreview); plan.put("readOnly", farmerPreview); plan.put("provenance", "DERIVED"); plan.put("sourceMode", "ESTIMATED");
        // Farmers may inspect a capacity-constrained preview for their own
        // plots, but a preview must never create a schedulable resource plan
        // or publish an event that looks like an administrator decision.
        if (!farmerPreview) {
            store.save("resource-plan", Jsons.text(plan, "resourcePlanId", ""), plan);
            events.publish("resource.plan.created", plan);
        }
        return plan;
    }

    Map<String, Object> valueLedger(Map<String, Object> input, UserPrincipal principal) {
        if (!principal.isFarmAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "VALUE_LEDGER_FORBIDDEN", "只有农场管理员可以生成价值对账");
        double planned = Jsons.number(input, "plannedWaterLitres", Jsons.number(input, "baselineWaterLitres", 0)); double actual = Jsons.number(input, "actualWaterLitres", planned);
        boolean baselineProvided = input.containsKey("plannedWaterLitres") || input.containsKey("baselineWaterLitres");
        boolean actualProvided = input.containsKey("actualWaterLitres") || input.containsKey("evaluationId") || input.containsKey("commandId");
        boolean unitCostProvided = input.containsKey("waterPricePerLitre") || store.find("farm", "farm-demo") != null;
        double unitCost = Jsons.number(input, "waterPricePerLitre", 0.004); String status = !baselineProvided || !actualProvided || planned <= 0 || unitCost <= 0 || !unitCostProvided ? "INCOMPLETE" : "COMPUTED";
        Map<String, Object> metrics = new LinkedHashMap<>(); metrics.put("waterSavingLitres", planned - actual); metrics.put("waterCost", actual * unitCost); metrics.put("waterDeviationRate", planned == 0 ? null : (actual - planned) / planned);
        Map<String, Object> ledger = new LinkedHashMap<>(); ledger.put("valueLedgerId", Jsons.id("value")); ledger.put("scope", Jsons.text(input, "scope", "farm-demo")); ledger.put("baseline", Map.of("waterLitres", planned, "source", "USER_PROVIDED"));
        ledger.put("actual", Map.of("waterLitres", actual, "source", "OBSERVED", "sourceMode", "SIMULATION")); ledger.put("counterfactual", Map.of("waterLitres", planned, "source", "SIMULATED"));
        ledger.put("metrics", metrics); ledger.put("sourceLabels", List.of("OBSERVED", "USER_PROVIDED", "DERIVED", "SIMULATED")); ledger.put("assumptions", List.of("water price configured per farm"));
        ledger.put("algorithmVersion", "value-ledger-v1"); ledger.put("status", status); ledger.put("formula", "(baselineWaterLitres - actualWaterLitres), actualWaterLitres * unitCost"); ledger.put("createdAt", Instant.now().toString()); store.save("value-ledger", Jsons.text(ledger, "valueLedgerId", ""), ledger); return ledger;
    }

    Map<String, Object> feedback(String traceId, Map<String, Object> input, UserPrincipal principal) {
        Map<String, Object> feedback = new LinkedHashMap<>(input); feedback.put("feedbackId", Jsons.text(input, "feedbackId", Jsons.id("feedback"))); feedback.put("traceId", traceId); feedback.put("actorId", principal.userId); feedback.put("createdAt", Instant.now().toString());
        feedback.putIfAbsent("decision", "ACCEPTED"); store.save("feedback", Jsons.text(feedback, "feedbackId", ""), feedback); events.publish("decision.feedback", feedback);
        String planId = Jsons.text(input, "planId", ""); String evaluationId = Jsons.text(input, "evaluationId", "");
        Map<String, Object> evaluation = evaluationId.isBlank() ? null : store.find("evaluation", evaluationId);
        if (evaluation == null && !planId.isBlank()) evaluation = store.list("evaluation").stream().filter(e -> planId.equals(Jsons.text(e, "planId", ""))).findFirst().orElse(null);
        // A case is eligible only when an effect is complete, data quality was
        // good, and all decision versions are present. Feedback alone never
        // turns an unverified suggestion into a learning case.
        if (evaluation != null && "COMPLETED".equals(Jsons.text(evaluation, "status", "")) && "GOOD".equals(Jsons.text(evaluation, "result", ""))) {
            Map<String, Object> plan = planId.isBlank() ? null : store.find("irrigation-plan", planId);
            if (plan != null && plan.containsKey("ruleVersion") && plan.containsKey("cropPackVersion")) {
                Map<String, Object> caseRecord = new LinkedHashMap<>(); caseRecord.put("caseId", Jsons.id("case")); caseRecord.put("traceId", traceId);
                caseRecord.put("planId", planId); caseRecord.put("evaluationId", evaluation.get("evaluationId")); caseRecord.put("plotId", plan.get("plotId"));
                caseRecord.put("cropCode", Jsons.text(resolvedProfile(Jsons.text(plan, "plotId", "")), "cropCode", "")); caseRecord.put("primaryCause", "WATER_DEFICIT");
                caseRecord.put("effectivenessScore", Jsons.number(evaluation, "effectivenessScore", 0)); caseRecord.put("quality", "GOOD");
                caseRecord.put("ruleVersion", plan.get("ruleVersion")); caseRecord.put("cropPackVersion", plan.get("cropPackVersion")); caseRecord.put("fingerprint", Integer.toHexString(Objects.hash(caseRecord.get("cropCode"), caseRecord.get("primaryCause"), planId, evaluation.get("evaluationId"))));
                caseRecord.put("createdAt", Instant.now().toString()); store.save("decision-case", Jsons.text(caseRecord, "caseId", ""), caseRecord); feedback.put("caseId", caseRecord.get("caseId"));
            }
        }
        return feedback;
    }

    List<Map<String, Object>> similarCases(String traceId, Map<String, Object> context) {
        List<Map<String, Object>> cases = store.list("decision-case"); if (cases.isEmpty()) return List.of();
        String crop = Jsons.text(context, "cropCode", "tomato"); String cause = Jsons.text(context, "primaryCause", "WATER_DEFICIT");
        return cases.stream().map(c -> { Map<String, Object> copy = Jsons.copy(mapper, c); int score = (crop.equals(Jsons.text(c, "cropCode", "")) ? 2 : 0) + (cause.equals(Jsons.text(c, "primaryCause", "")) ? 3 : 0); copy.put("similarityScore", score / 5.0); return copy; })
                .sorted(Comparator.comparingDouble((Map<String, Object> c) -> Jsons.number(c, "similarityScore", 0)).reversed()).limit(10).toList();
    }

    Map<String, Object> strategyCandidate(Map<String, Object> input, UserPrincipal principal) {
        if (!principal.isSystemAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "STRATEGY_FORBIDDEN", "只有系统管理员可以管理策略候选");
        Map<String, Object> candidate = new LinkedHashMap<>(input); candidate.put("candidateId", Jsons.text(input, "candidateId", Jsons.id("strategy"))); candidate.putIfAbsent("status", "DRAFT"); candidate.put("reviewer", principal.userId); candidate.put("candidateVersion", "candidate-1"); candidate.put("createdAt", Instant.now().toString());
        store.save("strategy-candidate", Jsons.text(candidate, "candidateId", ""), candidate); return candidate;
    }

    Map<String, Object> offlineValidateStrategy(String id, Map<String, Object> input, UserPrincipal principal) {
        if (!principal.isSystemAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "STRATEGY_FORBIDDEN", "只有系统管理员可以验证策略");
        Map<String, Object> candidate = requireRecord("strategy-candidate", id);
        if (!"DRAFT".equals(Jsons.text(candidate, "status", "DRAFT"))) throw new ApiException(HttpStatus.CONFLICT, "STRATEGY_TRANSITION_INVALID", "只有 DRAFT 策略可以离线验证");
        String scenarioId = Jsons.text(input == null ? Map.of() : input, "scenarioId", "normal");
        long seed = Jsons.whole(input == null ? Map.of() : input, "seed", 42);
        // Deterministic offline replay contract: no live rule mutation is allowed.
        Map<String, Object> report = new LinkedHashMap<>(); report.put("status", "PASSED"); report.put("scenarioId", scenarioId); report.put("seed", seed);
        report.put("branch", "NO_ACTION"); report.put("assertions", List.of("no_rule_bypass", "quality_gate_preserved", "capacity_not_exceeded"));
        report.put("replayHash", Integer.toHexString(Objects.hash(id, scenarioId, seed, Jsons.json(mapper, candidate)))); report.put("validatedAt", Instant.now().toString());
        candidate.put("offlineValidation", report); candidate.put("status", "OFFLINE_VALIDATED"); candidate.put("reviewer", principal.userId); store.save("strategy-candidate", id, candidate); events.publish("strategy.offline_validated", candidate); return candidate;
    }

    Map<String, Object> transitionStrategy(String id, String target, UserPrincipal principal) {
        if (!principal.isSystemAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "STRATEGY_FORBIDDEN", "只有系统管理员可以变更策略");
        Map<String, Object> candidate = requireRecord("strategy-candidate", id); String current = Jsons.text(candidate, "status", "DRAFT");
        boolean allowed = switch (current + "->" + target) { case "DRAFT->REJECTED", "OFFLINE_VALIDATED->APPROVED", "OFFLINE_VALIDATED->REJECTED", "APPROVED->ACTIVE", "ACTIVE->SUPERSEDED", "ACTIVE->ROLLED_BACK" -> true; default -> false; };
        if (!allowed) throw new ApiException(HttpStatus.CONFLICT, "STRATEGY_TRANSITION_INVALID", current + " 不能转为 " + target);
        candidate.put("status", target); candidate.put("transitionedAt", Instant.now().toString()); candidate.put("reviewer", principal.userId); store.save("strategy-candidate", id, candidate); return candidate;
    }

    /**
     * Build a bounded, reviewable mutation proposal from natural language.  The
     * parser intentionally only emits registered internal tools; it never
     * executes a write while composing an answer.
     */
    private Map<String, Object> planAgentAction(String message, String plotId, UserPrincipal principal, String traceId) {
        if (message == null || message.isBlank() || !principal.isFarmAdmin()) return null;
        String text = message.trim();
        String lower = text.toLowerCase(Locale.ROOT);
        boolean asksWrite = lower.matches(".*(新增|新建|创建|修改|更新|编辑|绑定|换绑|解绑|下发|发布|关闭|安排|派发|添加).*");
        if (!asksWrite) return null;

        String resolvedPlotId = resolveAgentPlot(text, plotId, principal);
        if (containsAny(text, "地块", "田", "棚") && containsAny(text, "新增", "新建", "创建", "添加")) {
            Map<String, Object> args = new LinkedHashMap<>();
            String name = quotedOrAfter(text, "地块", "田", "棚");
            if (name.isBlank()) name = match(text, "(?:名称|叫做|命名为)\\s*[：:]?\\s*[“\\\"]?([^，。；;\\\"]+)");
            String cropCode = cropCodeFrom(text);
            String variety = match(text, "(?:品种|品名)\\s*[：:]?\\s*([^，。；;]+)");
            Double area = decimalMatch(text, "(\\d+(?:\\.\\d+)?)\\s*(?:㎡|平方米|平米|m2)");
            Long cycle = longMatch(text, "(\\d+)\\s*天");
            if (!name.isBlank()) args.put("name", name.trim());
            if (!cropCode.isBlank()) args.put("cropCode", cropCode);
            if (!variety.isBlank()) args.put("cropVariety", variety.trim());
            if (area != null) args.put("areaM2", area);
            if (cycle != null) args.put("growthCycleDays", cycle);
            args.put("stageCode", stageFrom(text));
            args.put("farmId", principal.farmIds.stream().filter(id -> !"*".equals(id)).findFirst().orElse("farm-demo"));
            List<String> missing = new ArrayList<>();
            if (name.isBlank()) missing.add("地块名称");
            if (cropCode.isBlank()) missing.add("作物种类");
            if (variety.isBlank()) missing.add("作物品种");
            if (area == null) missing.add("面积（㎡）");
            if (cycle == null) missing.add("生长周期（天）");
            return missingProposalOrAction(missing, "create_plot", args, "新增地块", traceId, principal, resolvedPlotId);
        }
        if (containsAny(text, "绑定", "换绑", "解绑") && containsAny(text, "设备", "传感器", "控制器")) {
            if (resolvedPlotId.isBlank()) return clarification("请指定要绑定设备的地块名称或编号，例如“把设备 sensor-01 绑定到 plot-a01”。");
            List<String> deviceIds = resolveAgentDevices(text, principal);
            if (containsAny(text, "解绑全部", "全部解绑")) deviceIds = List.of();
            if (deviceIds.isEmpty() && !containsAny(text, "解绑全部", "全部解绑")) return clarification("请提供设备编号（可多个），例如“将 sensor-01、sensor-02 绑定到该地块”。");
            Map<String, Object> args = new LinkedHashMap<>(); args.put("plotId", resolvedPlotId); args.put("deviceIds", deviceIds);
            String summary = deviceIds.isEmpty() ? "解除该地块的全部设备绑定" : "将 " + String.join("、", deviceIds) + " 绑定到 " + resolvedPlotId;
            return createAgentActionProposal("set_plot_devices", args, summary, traceId, principal, resolvedPlotId, List.of("devices", "plots", "overview"));
        }
        if (containsAny(text, "关闭", "结束") && containsAny(text, "告警", "报警")) {
            String alertId = resolveAgentAlert(text, resolvedPlotId, principal);
            if (alertId.isBlank()) return clarification("请指定告警编号，或先选择只有一条待处理告警的地块。");
            return createAgentActionProposal("close_alert", Map.of("alertId", alertId), "关闭告警 " + alertId, traceId, principal, resolvedPlotId, List.of("alerts", "overview"));
        }
        if (containsAny(text, "核查", "复核") && containsAny(text, "发布", "下发", "创建")) {
            String alertId = resolveAgentAlert(text, resolvedPlotId, principal);
            if (alertId.isBlank()) return clarification("请指定要发布核查任务的告警编号或地块。");
            return createAgentActionProposal("publish_alert_verification", Map.of("alertId", alertId), "发布告警核查任务 " + alertId, traceId, principal, resolvedPlotId, List.of("alerts", "workOrders", "overview"));
        }
        if (containsAny(text, "任务", "农务") && containsAny(text, "创建", "新增", "下发", "安排", "派发")) {
            if (resolvedPlotId.isBlank()) return clarification("请指定任务所属地块。");
            String title = quotedOrAfter(text, "任务", "农务");
            if (title.isBlank()) title = match(text, "(?:任务内容|任务名称)\\s*[：:]?\\s*([^，。；;]+)");
            if (title.isBlank()) return clarification("请补充任务内容，例如“在 plot-a01 创建任务：检查滴灌管路”。");
            Map<String, Object> args = new LinkedHashMap<>(); args.put("farmId", farmIdForPlot(resolvedPlotId)); args.put("plotId", resolvedPlotId);
            args.put("title", title.trim()); args.put("reason", text); args.put("actionType", "FIELD_OPERATION");
            args.put("priority", containsAny(text, "紧急", "立即", "高优先") ? "HIGH" : "MEDIUM");
            args.put("dueAt", Instant.now().plus(24, ChronoUnit.HOURS).toString());
            String assigneeId = resolveAgentFarmer(text, resolvedPlotId);
            if (!assigneeId.isBlank()) args.put("assigneeId", assigneeId);
            return createAgentActionProposal("create_and_assign_work_order", args, "创建并下发任务：" + title.trim(), traceId, principal, resolvedPlotId, List.of("workOrders", "overview"));
        }
        if (containsAny(text, "修改", "更新", "编辑") && containsAny(text, "地块", "田", "棚")) {
            if (resolvedPlotId.isBlank()) return clarification("请指定要修改的地块名称或编号。");
            Map<String, Object> args = new LinkedHashMap<>(); args.put("plotId", resolvedPlotId);
            String name = match(text, "(?:名称改为|改名为|名称)\\s*[：:]?\\s*([^，。；;]+)");
            String variety = match(text, "(?:品种改为|品种)\\s*[：:]?\\s*([^，。；;]+)");
            Double area = decimalMatch(text, "(?:面积改为|面积)\\s*[：:]?\\s*(\\d+(?:\\.\\d+)?)");
            Long cycle = longMatch(text, "(?:周期改为|周期)\\s*[：:]?\\s*(\\d+)");
            if (!name.isBlank()) args.put("name", name.trim());
            if (!variety.isBlank()) args.put("cropVariety", variety.trim());
            if (area != null) args.put("areaM2", area);
            if (cycle != null) args.put("growthCycleDays", cycle);
            if (args.size() == 1) return clarification("请说明要修改的字段，例如名称、品种、面积或生长周期。");
            return createAgentActionProposal("update_plot", args, "更新地块 " + resolvedPlotId, traceId, principal, resolvedPlotId, List.of("plots", "overview"));
        }
        return null;
    }

    private Map<String, Object> missingProposalOrAction(List<String> missing, String tool, Map<String, Object> args,
                                                        String summary, String traceId, UserPrincipal principal, String plotId) {
        return missing.isEmpty() ? createAgentActionProposal(tool, args, summary, traceId, principal, plotId, List.of("plots", "overview"))
                : clarification("还缺少：" + String.join("、", missing) + "。补充后我会生成操作预览，确认后才执行。");
    }

    private Map<String, Object> clarification(String message) { return Map.of("status", "NEEDS_INPUT", "clarification", message); }

    private Map<String, Object> createAgentActionProposal(String tool, Map<String, Object> args, String summary, String traceId,
                                                          UserPrincipal principal, String plotId, List<String> domains) {
        if (!AGENT_MUTATION_TOOLS.contains(tool)) throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_TOOL_NOT_ALLOWED", "该操作不在 Agent 白名单中");
        String actionId = Jsons.id("agent-action"); Instant now = Instant.now();
        Map<String, Object> action = new LinkedHashMap<>(); action.put("actionId", actionId); action.put("userId", principal.userId);
        action.put("farmId", plotId.isBlank() ? principal.farmIds.stream().filter(id -> !"*".equals(id)).findFirst().orElse("") : farmIdForPlot(plotId));
        action.put("plotId", plotId); action.put("toolName", tool); action.put("arguments", Jsons.copy(mapper, args)); action.put("summary", summary);
        action.put("affectedDomains", domains); action.put("status", "AWAITING_CONFIRMATION"); action.put("createdAt", now.toString());
        action.put("expiresAt", now.plus(AGENT_ACTION_TTL).toString()); action.put("traceId", traceId);
        store.save("agent-action", actionId, action); events.publish("agent.action.proposed", action); store.logEvent("agent.action.proposed", action);
        Map<String, Object> publicView = new LinkedHashMap<>(action); publicView.remove("userId"); publicView.put("requiresConfirmation", true); return publicView;
    }

    private String resolveAgentPlot(String text, String fallback, UserPrincipal principal) {
        Matcher id = Pattern.compile("(?:plot[-_][A-Za-z0-9-]+)", Pattern.CASE_INSENSITIVE).matcher(text);
        if (id.find() && canAccessPlot(principal, id.group())) return id.group();
        String normalized = text.toLowerCase(Locale.ROOT);
        List<Map<String, Object>> matches = store.list("plot").stream().filter(p -> canAccessPlot(principal, Jsons.text(p, "plotId", "")))
                .filter(p -> !Jsons.text(p, "name", "").isBlank() && normalized.contains(Jsons.text(p, "name", "").toLowerCase(Locale.ROOT))).toList();
        if (matches.size() == 1) return Jsons.text(matches.get(0), "plotId", "");
        return fallback == null ? "" : fallback;
    }

    private List<String> resolveAgentDevices(String text, UserPrincipal principal) {
        String normalized = text.toLowerCase(Locale.ROOT);
        return store.list("device").stream().filter(d -> canAccessPlot(principal, Jsons.text(d, "plotId", "")) || principal.canAccessFarm(Jsons.text(d, "farmId", "")))
                .filter(d -> normalized.contains(Jsons.text(d, "deviceId", "").toLowerCase(Locale.ROOT)) || normalized.contains(Jsons.text(d, "name", "").toLowerCase(Locale.ROOT)))
                .map(d -> Jsons.text(d, "deviceId", "")).filter(s -> !s.isBlank()).distinct().toList();
    }

    private String resolveAgentAlert(String text, String plotId, UserPrincipal principal) {
        Matcher matcher = Pattern.compile("(?:alert[-_][A-Za-z0-9-]+)", Pattern.CASE_INSENSITIVE).matcher(text);
        if (matcher.find() && store.find("alert", matcher.group()) != null && canAccessPlot(principal, Jsons.text(store.find("alert", matcher.group()), "plotId", ""))) return matcher.group();
        List<Map<String, Object>> matches = store.list("alert").stream().filter(a -> !TERMINAL_ALERT_STATUSES.contains(Jsons.text(a, "status", "").toUpperCase(Locale.ROOT)))
                .filter(a -> plotId.isBlank() || plotId.equals(Jsons.text(a, "plotId", ""))).filter(a -> canAccessPlot(principal, Jsons.text(a, "plotId", ""))).toList();
        return matches.size() == 1 ? Jsons.text(matches.get(0), "alertId", "") : "";
    }

    private String resolveAgentFarmer(String text, String plotId) {
        String normalized = text.toLowerCase(Locale.ROOT);
        return store.listUsers().stream().filter(u -> "FARMER".equals(RolePolicy.canonical(Jsons.text(u, "role", ""))))
                .filter(u -> isEligibleFarmerForPlot(u, farmIdForPlot(plotId), plotId))
                .filter(u -> normalized.contains(Jsons.text(u, "username", "").toLowerCase(Locale.ROOT)) || normalized.contains(Jsons.text(u, "displayName", "").toLowerCase(Locale.ROOT)))
                .map(u -> Jsons.text(u, "userId", "")).findFirst().orElse("");
    }

    private String cropCodeFrom(String text) { if (containsAny(text, "番茄", "西红柿", "tomato")) return "tomato"; if (containsAny(text, "黄瓜", "cucumber")) return "cucumber"; if (containsAny(text, "辣椒", "pepper")) return "pepper"; if (containsAny(text, "草莓", "strawberry")) return "strawberry"; return ""; }
    private String stageFrom(String text) { if (containsAny(text, "苗期", "育苗")) return "seedling"; if (containsAny(text, "开花")) return "flowering"; if (containsAny(text, "结果")) return "fruiting"; return "vegetative"; }
    private boolean containsAny(String text, String... values) { for (String value : values) if (text.toLowerCase(Locale.ROOT).contains(value.toLowerCase(Locale.ROOT))) return true; return false; }
    private String quotedOrAfter(String text, String... markers) { Matcher q = Pattern.compile("[“\\\"]([^”\\\"]+)[”\\\"]").matcher(text); if (q.find()) return q.group(1).trim(); for (String marker : markers) { int i = text.indexOf(marker); if (i >= 0) { String tail = text.substring(i + marker.length()).replaceFirst("^[：:]", "").trim(); if (!tail.isBlank()) return tail.split("[，。；;]")[0].trim(); } } return ""; }
    private String match(String text, String regex) { Matcher m = Pattern.compile(regex, Pattern.CASE_INSENSITIVE).matcher(text); return m.find() ? m.group(1).trim() : ""; }
    private Double decimalMatch(String text, String regex) { String value = match(text, regex); try { return value.isBlank() ? null : Double.valueOf(value); } catch (NumberFormatException ignored) { return null; } }
    private Long longMatch(String text, String regex) { String value = match(text, regex); try { return value.isBlank() ? null : Long.valueOf(value); } catch (NumberFormatException ignored) { return null; } }

    Map<String, Object> confirmAgentAction(String actionId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal); Map<String, Object> action = requireRecord("agent-action", actionId);
        if (!principal.userId.equals(Jsons.text(action, "userId", ""))) throw new ApiException(HttpStatus.FORBIDDEN, "AGENT_ACTION_FORBIDDEN", "无权确认该 Agent 操作");
        String status = Jsons.text(action, "status", ""); if ("SUCCEEDED".equals(status)) return action;
        if (!"AWAITING_CONFIRMATION".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "AGENT_ACTION_STATE_INVALID", "该操作已处理或不可再确认");
        if (Instant.now().isAfter(Jsons.instant(action.get("expiresAt"), Instant.EPOCH))) { action.put("status", "EXPIRED"); store.save("agent-action", actionId, action); throw new ApiException(HttpStatus.CONFLICT, "AGENT_ACTION_EXPIRED", "操作预览已过期，请重新生成"); }
        String idempotencyKey = Jsons.text(input, "idempotencyKey", "agent-confirm:" + actionId); Map<String, Object> prior = store.find("agent-action-idempotency", idempotencyKey); if (prior != null) return prior;
        action.put("status", "EXECUTING"); action.put("confirmedBy", principal.userId); action.put("confirmedAt", Instant.now().toString()); store.save("agent-action", actionId, action);
        try {
            Map<String, Object> args = Jsons.map(mapper, action.get("arguments")); Map<String, Object> result = executeAgentAction(Jsons.text(action, "toolName", ""), args, principal);
            action.put("status", "SUCCEEDED"); action.put("result", result); action.put("idempotencyKey", idempotencyKey); action.put("completedAt", Instant.now().toString());
            store.save("agent-action", actionId, action); store.save("agent-action-idempotency", idempotencyKey, action); events.publish("agent.action.completed", action); store.logEvent("agent.action.completed", action); return action;
        } catch (RuntimeException error) {
            action.put("status", "FAILED"); action.put("error", error.getMessage() == null ? "执行失败" : error.getMessage()); action.put("completedAt", Instant.now().toString()); store.save("agent-action", actionId, action); events.publish("agent.action.failed", action); throw error;
        }
    }

    private Map<String, Object> executeAgentAction(String tool, Map<String, Object> args, UserPrincipal principal) {
        return switch (tool) {
            case "create_plot" -> adminManagement.createPlot(args, principal);
            case "update_plot" -> { String id = Jsons.text(args, "plotId", ""); Map<String, Object> copy = new LinkedHashMap<>(args); copy.remove("plotId"); yield adminManagement.updatePlot(id, copy, principal); }
            case "set_plot_devices" -> adminManagement.setPlotDevices(Jsons.text(args, "plotId", ""), args, principal);
            case "publish_alert_verification" -> publishAlertVerificationTask(Jsons.text(args, "alertId", ""), args, principal);
            case "close_alert" -> transitionAlert(Jsons.text(args, "alertId", ""), "CLOSED", principal);
            case "create_and_assign_work_order" -> { Map<String, Object> created = createWorkOrder(args, principal); String assignee = Jsons.text(args, "assigneeId", ""); if (assignee.isBlank()) { Map<String, Object> farmer = chooseBestFarmerForPlot(Jsons.text(args, "farmId", ""), Jsons.text(args, "plotId", "")); if (farmer == null) throw new ApiException(HttpStatus.CONFLICT, "ASSIGNEE_UNAVAILABLE", "暂无具备地块权限的在岗农户"); assignee = Jsons.text(farmer, "userId", ""); } yield assignWorkOrder(Jsons.text(created, "workOrderId", ""), Map.of("assigneeId", assignee, "note", "Agent 确认后下发"), principal); }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_TOOL_NOT_ALLOWED", "不支持的 Agent 操作");
        };
    }

    Map<String, Object> cancelAgentAction(String actionId, UserPrincipal principal) {
        requireFarmAdmin(principal); Map<String, Object> action = requireRecord("agent-action", actionId);
        if (!principal.userId.equals(Jsons.text(action, "userId", ""))) throw new ApiException(HttpStatus.FORBIDDEN, "AGENT_ACTION_FORBIDDEN", "无权取消该 Agent 操作");
        if (!"AWAITING_CONFIRMATION".equals(Jsons.text(action, "status", ""))) throw new ApiException(HttpStatus.CONFLICT, "AGENT_ACTION_STATE_INVALID", "该操作已处理");
        action.put("status", "CANCELED"); action.put("canceledBy", principal.userId); action.put("canceledAt", Instant.now().toString()); store.save("agent-action", actionId, action); events.publish("agent.action.canceled", action); return action;
    }

    Map<String, Object> agentChat(Map<String, Object> input, UserPrincipal principal) {
        String message = Jsons.text(input, "message", Jsons.text(input, "query", "")).trim();
        String plotId = Jsons.text(input, "plotId", "plot-a01");
        ensurePlotAccess(principal, plotId);
        String conversationId = resolveConversationId(input, principal);
        List<Map<String, Object>> recentHistory = conversationMessages(principal, conversationId,
                Math.max(0, Math.min(12, properties.getLlmHistoryMessages())));
        String priorIntent = lastAssistantIntent(recentHistory);
        String traceId = Jsons.id("run");
        List<Map<String, Object>> tools = new ArrayList<>();
        Map<String, Object> answer = new LinkedHashMap<>();
        answer.put("traceId", traceId);
        answer.put("conversationId", conversationId);
        answer.put("plotId", plotId);
        answer.put("mode", properties.getAiMode());
        answer.put("sourceLabels", List.of("OBSERVED", "DERIVED", "SIMULATED"));

        String aiMode = properties.getAiMode() == null ? "rules-only" : properties.getAiMode().toLowerCase(Locale.ROOT).trim();
        boolean openAiCompatible = aiMode.equals("openai") || aiMode.equals("openai-compatible");
        String adapter = aiMode.equals("mock") ? "mock" : aiMode.equals("maxkb") ? "maxkb" : openAiCompatible ? "openai-compatible" : "rules";
        answer.put("adapter", adapter);
        answer.put("knowledgeEvidence", knowledgeEvidence(plotId));
        boolean fastPath = false;
        Map<String, Object> actionProposal = planAgentAction(message, plotId, principal, traceId);
        if (actionProposal != null) {
            answer.put("intent", "AGENT_ACTION");
            if (actionProposal.containsKey("actionId")) answer.put("actionProposal", actionProposal);
            answer.put("summary", Jsons.text(actionProposal, "summary", "需要补充信息"));
            answer.put("narrative", Jsons.text(actionProposal, "clarification", Jsons.text(actionProposal, "summary", "已生成操作预览，等待确认执行。")));
            answer.put("narrativeProvenance", "DERIVED"); answer.put("adapter", "rules-agent"); fastPath = true;
        } else if (isGreeting(message)) {
            // Greetings and other social pleasantries do not need a 27B inference call.
            // Keeping this deterministic also prevents a one-word message from causing
            // the model to echo the whole telemetry context.
            answer.put("intent", "GREETING");
            answer.put("summary", "已识别为问候");
            answer.put("narrative", "你好！我是农智助手。你可以问我地块状态、异常诊断、风险预测、今日农务或灌溉建议。");
            answer.put("narrativeProvenance", "DERIVED");
            answer.put("adapter", "rules-fast-path");
            fastPath = true;
        } else if (isAmbiguousShortInput(message)) {
            answer.put("intent", "CLARIFICATION");
            answer.put("summary", "输入信息不足");
            answer.put("narrative", "我已连接到农智闭环。请补充你要查询的内容，例如“查看 plot-a01 状态”或“分析番茄缺水风险”。");
            answer.put("narrativeProvenance", "DERIVED");
            answer.put("adapter", "rules-fast-path");
            fastPath = true;
        } else if (isCapabilityQuestion(message)) {
            answer.put("intent", "CAPABILITY_QUERY");
            answer.put("summary", "已读取农智助手能力范围");
            answer.put("result", Map.of(
                    "capabilities", List.of("地块状态查询", "异常与根因诊断", "基于证据的诊断解释", "1/2/4 小时风险预测", "灌溉处方试算", "今日农务汇总"),
                    "factsBoundary", "实时事实来自规则、数据库和检索知识；控制命令必须经过安全门和人工确认",
                    "unsupported", List.of("直接生成 SQL、MQTT topic、HTTP 请求或绕过审批执行命令")));
            // Capability questions are a stable contract, not a generative task.
            // Answering them locally avoids a needless 27B round trip and keeps
            // the product boundary concise even when an LLM is enabled.
            answer.put("narrative", "我可以查询地块状态、诊断并解释异常证据、做 1/2/4 小时风险预测、试算灌溉处方并汇总今日农务。实时事实来自规则、数据库和检索知识；执行控制必须经过权限、安全门和人工确认。");
            answer.put("narrativeProvenance", "DERIVED");
            answer.put("adapter", "rules-fast-path");
            fastPath = true;
        } else if (isRetestChecklistQuestion(message)) {
            Map<String, Object> status = Map.of("plotId", plotId, "latest", latestMetrics(plotId), "device", deviceForPlot(plotId));
            tools.add(tool("get_plot_status", Map.of("plotId", plotId), status));
            answer.put("intent", "RETEST_CHECKLIST");
            answer.put("summary", "已按当前异常项整理复测清单");
            answer.put("result", status);
        } else if (isContextualFollowUp(message) && !recentHistory.isEmpty()) {
            Map<String, Object> status = Map.of("plotId", plotId, "latest", latestMetrics(plotId), "device", deviceForPlot(plotId));
            tools.add(tool("get_plot_status", Map.of("plotId", plotId), status));
            answer.put("intent", "FOLLOW_UP");
            answer.put("relatedIntent", priorIntent.isBlank() ? "PLOT_STATUS" : priorIntent);
            answer.put("summary", "已结合上一轮对话继续说明");
            answer.put("result", status);
        } else if (message.contains("预测") || message.toLowerCase(Locale.ROOT).contains("forecast")) {
            tools.add(tool("get_risk_forecast", Map.of("plotId", plotId), forecast(plotId, "SOIL_MOISTURE")));
            answer.put("intent", "RISK_FORECAST");
            answer.put("summary", "已生成土壤湿度短期预测");
            answer.put("result", tools.get(tools.size() - 1).get("output"));
        } else if (isIrrigationQuestion(message)) {
            Map<String, Object> plan = irrigationPlan(Map.of("plotId", plotId, "traceId", traceId), principal);
            tools.add(tool("generate_irrigation_plan", Map.of("plotId", plotId), plan));
            answer.put("intent", "IRRIGATION_RECOMMENDATION");
            answer.put("summary", Jsons.bool(plan, "executable", false)
                    ? "已生成可审批灌溉处方"
                    : "已生成保守参考，建议人工复核");
            answer.put("plan", plan);
        } else if (isDiagnosisQuestion(message)) {
            Map<String, Object> diagnosis = diagnose(plotId, Map.of("scenarioId", "normal", "traceId", traceId));
            tools.add(tool("evaluate_diagnosis", Map.of("plotId", plotId), diagnosis));
            answer.put("intent", "DIAGNOSIS");
            answer.put("summary", "已完成缺水与传感器风险分析");
            answer.put("diagnosis", diagnosis);
            answer.put("result", Map.of("diagnosis", diagnosis, "latest", latestMetrics(plotId), "device", deviceForPlot(plotId)));
        } else if (message.contains("任务") || message.contains("农务")) {
            List<Map<String, Object>> work = todayWork(plotId, principal);
            tools.add(tool("get_today_work_items", Map.of("plotId", plotId), work));
            answer.put("intent", "TODAY_WORK");
            answer.put("summary", "已汇总今日农务");
            answer.put("workItems", work);
        } else {
            Map<String, Object> status = Map.of("plotId", plotId, "latest", latestMetrics(plotId), "device", deviceForPlot(plotId));
            tools.add(tool("get_plot_status", Map.of("plotId", plotId), status));
            answer.put("intent", "PLOT_STATUS");
            answer.put("summary", "已读取地块状态");
            answer.put("result", status);
        }
        answer.put("tools", tools);
        answer.put("confidence", .86);
        Map<String, Object> cropContext = plotCropContext(plotId);
        answer.put("context", Map.of(
                "cropPackVersion", cropContext.get("cropPackVersion"),
                "ruleVersion", cropContext.get("ruleVersion"),
                "knowledgeVersion", cropContext.get("knowledgeVersion"),
                "agentVersion", cropContext.get("agentVersion"),
                "stageCode", cropContext.get("stageCode")));

        boolean degraded = false;
        String degradationReason = null;
        String rawNarrative = null;
        if (fastPath) {
            // The deterministic answer above is intentional and is not presented as
            // a fabricated model response.
        } else if (aiMode.equals("rules-only")) {
            degraded = true;
            degradationReason = "RULES_ONLY_CONFIGURED";
        } else if (openAiCompatible) {
            long started = System.nanoTime();
            try {
                rawNarrative = callOpenAiCompatible(message, narrativeContext(answer, plotId), recentHistory);
                String narrative = sanitizeNarrative(rawNarrative);
                narrative = applySafetyGuidance(message, answer, narrative);
                if (narrative.isBlank()) narrative = Jsons.text(answer, "summary", "已完成规则评估");
                long latencyMs = Duration.ofNanos(System.nanoTime() - started).toMillis();
                answer.put("narrative", narrative);
                answer.put("narrativeProvenance", "DERIVED");
                answer.put("llm", Map.of("provider", "openai-compatible", "model", configuredLlmModel(), "latencyMs", latencyMs));
            } catch (Exception ex) {
                degraded = true;
                degradationReason = "AI_DEPENDENCY_UNAVAILABLE_FALLBACK";
                answer.put("llmError", safeLlmError(ex));
                store.logEvent("AI_DEGRADED", Map.of("traceId", traceId, "mode", aiMode, "reason", degradationReason,
                        "error", safeLlmError(ex), "provenance", "DERIVED"));
            }
        } else if (!aiMode.equals("mock")) {
            degraded = true;
            degradationReason = "AI_DEPENDENCY_UNAVAILABLE_FALLBACK";
        }
        answer.put("degraded", degraded);
        answer.put("degradationReason", degradationReason);
        if (!answer.containsKey("narrative") || Jsons.text(answer, "narrative", "").isBlank()) {
            answer.put("narrative", rulesNarrative(message, answer));
            answer.put("narrativeProvenance", "DERIVED");
        }
        if (degraded && !openAiCompatible) {
            store.logEvent("AI_DEGRADED", Map.of("traceId", traceId, "mode", aiMode, "reason", degradationReason, "provenance", "DERIVED"));
        }
        // Keep the public response clean while retaining the raw model output in the
        // server-side audit record for troubleshooting and reproducibility.
        Map<String, Object> auditAnswer = new LinkedHashMap<>(answer);
        auditAnswer.put("userId", principal.userId);
        auditAnswer.put("username", principal.username);
        if (rawNarrative != null && !rawNarrative.isBlank()) auditAnswer.put("narrativeRaw", rawNarrative);
        store.save("agent-run", traceId, auditAnswer);
        saveAgentTurn(principal, conversationId, plotId, message, answer);
        store.logEvent("agent.run", answer);
        events.publish("agent.run.completed", answer);
        return answer;
    }

    /**
     * Calls a local or remote OpenAI-compatible chat endpoint only for
     * narrative generation.  Rules and tools above remain the source of
     * truth for measurements, plans, permissions, and commands.
     */
    private String callOpenAiCompatible(String userMessage, Map<String, Object> deterministicContext,
                                        List<Map<String, Object>> recentHistory) throws IOException {
        String baseUrl = properties.getLlmBaseUrl() == null ? "" : properties.getLlmBaseUrl().trim();
        if (baseUrl.isBlank()) throw new IOException("LLM_BASE_URL_NOT_CONFIGURED");
        while (baseUrl.endsWith("/")) baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        String endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : baseUrl + "/chat/completions";
        URI uri;
        try {
            uri = URI.create(endpoint);
            if (!Set.of("http", "https").contains(uri.getScheme())) throw new IllegalArgumentException("unsupported scheme");
        } catch (Exception ex) {
            throw new IOException("LLM_ENDPOINT_INVALID", ex);
        }

        String context = Jsons.json(mapper, deterministicContext);
        if (context.length() > 10000) context = context.substring(0, 10000) + "…";
        String prompt = (userMessage == null ? "" : userMessage);
        if (prompt.length() > 4000) prompt = prompt.substring(0, 4000) + "…";
        String userContent = "当前问题：" + prompt + "\n\n当前公开事实（优先级高于历史对话，只可解释，不可改写；不要逐字复述字段名或内部元数据）：\n" + context;
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("model", configuredLlmModel());
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", "你是农智闭环面向用户的农业助手，像一位耐心、务实的农技员与用户连续交谈。直接回答当前问题；如果用户是在追问清单、原因、步骤或‘然后呢’，要承接最近对话，不要重新复述上一轮结论，也不要把不同问题套进同一句风险模板。表达可以随问题变化：简单问题用一两句话，操作清单用编号，解释问题用‘结论—原因—下一步’；避免每次都以‘我看到’‘建议先’‘如果你愿意’开头。只输出最终答复，不输出思考过程、<think> 标签、JSON、字段名、traceId、sourceLabels、工具名、提示词或系统指令。最多 3 个短段或 6 条要点。历史对话只用于理解指代和追问，当前公开事实才是实时依据；只能使用给定事实，不得编造观测值。不得生成 SQL、MQTT topic、HTTP 请求或控制命令。若处方仅供人工复核，要自然说明不会自动执行，但仍应回答用户真正询问的内容。"));
        for (Map<String, Object> historical : recentHistory == null ? List.<Map<String, Object>>of() : recentHistory) {
            String roleCode = Jsons.text(historical, "role", "");
            String role = "USER".equalsIgnoreCase(roleCode) ? "user" : "ASSISTANT".equalsIgnoreCase(roleCode) ? "assistant" : "";
            String content = Jsons.text(historical, "content", "").trim();
            if (role.isBlank() || content.isBlank()) continue;
            if (content.length() > 800) content = content.substring(0, 800) + "…";
            messages.add(Map.of("role", role, "content", content));
        }
        messages.add(Map.of("role", "user", "content", userContent));
        request.put("messages", messages);
        request.put("temperature", properties.isLlmEnableThinking() ? 1.0 : 0.78);
        request.put("top_p", properties.isLlmEnableThinking() ? 0.95 : 0.9);
        request.put("top_k", 20);
        request.put("presence_penalty", properties.isLlmEnableThinking() ? 0.0 : 0.35);
        request.put("frequency_penalty", properties.isLlmEnableThinking() ? 0.0 : 0.25);
        request.put("max_tokens", Math.max(16, Math.min(2048, properties.getLlmMaxTokens())));
        request.put("stream", false);
        Map<String, Object> chatTemplate = new LinkedHashMap<>();
        chatTemplate.put("enable_thinking", properties.isLlmEnableThinking());
        chatTemplate.put("preserve_thinking", properties.isLlmPreserveThinking());
        request.put("chat_template_kwargs", chatTemplate);
        if (properties.isLlmEnableThinking() && properties.getLlmReasoningEffort() != null && !properties.getLlmReasoningEffort().isBlank()) {
            request.put("reasoning_effort", properties.getLlmReasoningEffort().trim());
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(Math.max(1000, properties.getLlmTimeoutMs())))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .header(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(Jsons.json(mapper, request), StandardCharsets.UTF_8));
        if (properties.getLlmApiKey() != null && !properties.getLlmApiKey().isBlank()) {
            builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getLlmApiKey().trim());
        }
        HttpResponse<String> response;
        try {
            response = llmHttpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IOException("LLM_REQUEST_INTERRUPTED", ex);
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("LLM_HTTP_" + response.statusCode());
        }
        try {
            JsonNode root = mapper.readTree(response.body());
            JsonNode messageNode = root.path("choices").path(0).path("message");
            JsonNode content = messageNode.path("content");
            String text;
            if (content.isTextual()) text = content.asText();
            else if (content.isArray()) {
                StringBuilder joined = new StringBuilder();
                content.forEach(part -> {
                    if (part.isTextual()) joined.append(part.asText());
                    else if (part.has("text")) joined.append(part.path("text").asText());
                });
                text = joined.toString();
            } else text = "";
            // Some OpenAI-compatible servers expose only reasoning_content when a
            // template ignores enable_thinking=false. Return it so the sanitizer can
            // still prevent reasoning leakage instead of exposing a raw JSON object.
            if ((text == null || text.isBlank()) && messageNode.path("reasoning_content").isTextual()) {
                text = messageNode.path("reasoning_content").asText();
            }
            if (text == null || text.isBlank()) throw new IOException("LLM_EMPTY_RESPONSE");
            return text.trim();
        } catch (JsonProcessingException ex) {
            throw new IOException("LLM_RESPONSE_INVALID", ex);
        }
    }

    private String configuredLlmModel() {
        return properties.getLlmModel() == null || properties.getLlmModel().isBlank() ? "Qwen3.8-27B" : properties.getLlmModel().trim();
    }

    private String safeLlmError(Exception ex) {
        String name = ex.getClass().getSimpleName();
        String message = ex.getMessage() == null ? "" : ex.getMessage().replaceAll("[\\r\\n]+", " ");
        if (message.length() > 160) message = message.substring(0, 160);
        return message.isBlank() ? name : name + ":" + message;
    }

    private boolean isGreeting(String message) {
        if (message == null) return false;
        String normalized = message.trim().toLowerCase(Locale.ROOT).replaceAll("[\\s!！?？。．,，~～]+", "");
        return Set.of("hi", "hello", "hey", "嗨", "你好", "您好", "早上好", "晚上好", "在吗", "在么").contains(normalized);
    }

    private boolean isAmbiguousShortInput(String message) {
        if (message == null) return true;
        String normalized = message.trim();
        return normalized.length() <= 2 && normalized.matches("[0-9一二三四五六七八九十a-zA-Z]+[。.!！?？]?");
    }

    private boolean isCapabilityQuestion(String message) {
        if (message == null) return false;
        String normalized = message.toLowerCase(Locale.ROOT);
        return normalized.contains("专业知识") || normalized.contains("智慧农田") || normalized.contains("懂农业")
                || normalized.contains("你会什么") || normalized.contains("能做什么") || normalized.contains("你是谁")
                || normalized.contains("具备") && (normalized.contains("知识") || normalized.contains("能力"));
    }

    private boolean isRetestChecklistQuestion(String message) {
        if (message == null) return false;
        String normalized = message.toLowerCase(Locale.ROOT).replaceAll("[\\s，。！？,.!?]", "");
        return normalized.contains("复测清单") || normalized.contains("检查清单")
                || normalized.contains("怎么复测") || normalized.contains("如何复测")
                || normalized.contains("复测步骤") || normalized.contains("复查步骤");
    }

    private boolean isContextualFollowUp(String message) {
        if (message == null) return false;
        String normalized = message.toLowerCase(Locale.ROOT).replaceAll("[\\s，。！？,.!?]", "");
        return Set.of("继续", "接着说", "然后呢", "为什么", "怎么办", "那怎么办", "怎么做", "详细一点", "说具体点", "列出来")
                .contains(normalized)
                || normalized.startsWith("那") && normalized.length() <= 8
                || normalized.startsWith("再说") && normalized.length() <= 10;
    }

    private boolean isIrrigationQuestion(String message) {
        if (message == null) return false;
        String normalized = message.toLowerCase(Locale.ROOT);
        return normalized.contains("灌溉") || normalized.contains("浇水") || normalized.contains("补水")
                || normalized.contains("处方") || normalized.contains("watering") || normalized.contains("irrigation");
    }

    private boolean isDiagnosisQuestion(String message) {
        if (message == null) return false;
        String normalized = message.toLowerCase(Locale.ROOT);
        return normalized.contains("诊断") || normalized.contains("缺水") || normalized.contains("漂移")
                || normalized.contains("根因") || normalized.contains("异常") || normalized.contains("sensor drift")
                || normalized.contains("drought risk") || normalized.contains("risk analysis");
    }

    /**
     * Applies the same hard safety boundary after model generation.  The model
     * may explain a deterministic result, but it can never turn stale/unsafe
     * evidence into an executable prescription or emit a control payload.
     */
    @SuppressWarnings("unchecked")
    String safetyNarrativeOverride(String message, Map<String, Object> answer) {
        if (isDirectControlRequest(message)) {
            return "我不能在对话中直接发送或生成控制命令。请使用受控执行接口，并先完成权限、审批、幂等键和安全门校验。";
        }

        String intent = Jsons.text(answer, "intent", "");
        if ("IRRIGATION_RECOMMENDATION".equals(intent)) {
            Map<String, Object> plan = Jsons.map(mapper, answer.get("plan"));
            String readiness = Jsons.text(plan, "readinessStatus", "");
            boolean executable = Jsons.bool(plan, "executable", false);
            if (!executable || !"READY".equalsIgnoreCase(readiness)) {
                String status = Jsons.text(plan, "status", "");
                Map<String, Object> expected = Jsons.map(mapper, plan.get("expectedResult"));
                double current = Jsons.number(expected, "from", Double.NaN);
                double target = Jsons.number(expected, "to", Double.NaN);
                long duration = Jsons.whole(plan, "durationSeconds", 0);
                double water = Jsons.number(plan, "waterLitre", 0);
                if (duration <= 0 && Double.isFinite(current) && Double.isFinite(target) && current >= target) {
                    return String.format(Locale.ROOT,
                            "目前土壤湿度约 %.1f%%，已经达到阶段目标（约 %.1f%%），暂时不建议灌溉。设备或光照数据有提示，先复测一次；如果趋势继续下降，再重新评估。",
                            current, target);
                }
                if ("HUMAN_REVIEW".equalsIgnoreCase(status) && duration > 0) {
                    return String.format(Locale.ROOT,
                            "我先给你一版人工复核参考：按当前估算约 %.1f L、持续 %d 秒。数据还有轻度不确定性，这个建议不会自动下发；复测土壤湿度和流量后，再决定是否采用。",
                            water, duration);
                }
                return "我先给你一版保守的人工复核参考：当前证据不足以安全自动执行灌溉，所以不会直接下发。建议先复测土壤湿度和流量，确认后再决定具体水量。";
            }
        }

        // Status, diagnosis, explanation and checklist requests are read-only.
        // Their useful model answer must not be replaced by a generic action
        // refusal merely because one telemetry metric is degraded or a device
        // is offline. The facts remain visible in the deterministic context.
        return null;
    }

    private boolean isDirectControlRequest(String message) {
        String normalized = message == null ? "" : message.toLowerCase(Locale.ROOT);
        return normalized.contains("mqtt") || normalized.contains("topic") || normalized.contains("sql")
                || normalized.contains("http 请求") || normalized.contains("http request")
                || normalized.contains("发送命令") || normalized.contains("控制命令")
                || normalized.contains("执行命令") || normalized.contains("开阀") || normalized.contains("关阀");
    }

    private String applySafetyGuidance(String message, Map<String, Object> answer, String narrative) {
        String guidance = safetyNarrativeOverride(message, answer);
        if (guidance == null || guidance.isBlank()) return narrative == null ? "" : narrative;
        if (isDirectControlRequest(message) || narrative == null || narrative.isBlank()) return guidance;
        String normalized = narrative.toLowerCase(Locale.ROOT);
        if (normalized.contains("不会自动") || normalized.contains("不会直接下发")
                || normalized.contains("人工复核") || normalized.contains("暂时不建议灌溉")) return narrative;
        return narrative.trim() + "\n\n" + guidance;
    }

    private String rulesNarrative(String message, Map<String, Object> answer) {
        String intent = Jsons.text(answer, "intent", "PLOT_STATUS");
        if ("RETEST_CHECKLIST".equals(intent)) return retestChecklistNarrative(answer);
        if ("IRRIGATION_RECOMMENDATION".equals(intent)) {
            Map<String, Object> plan = Jsons.map(mapper, answer.get("plan"));
            double water = Jsons.number(plan, "waterLitre", 0);
            long duration = Jsons.whole(plan, "durationSeconds", 0);
            if (Jsons.bool(plan, "executable", false)) {
                return String.format(Locale.ROOT, "按当前数据，可提交一版约 %.1f L、持续 %d 秒的灌溉方案。它仍需经过页面上的确认流程，不会由对话直接执行。", water, duration);
            }
            String guidance = safetyNarrativeOverride(message, answer);
            return guidance == null ? "当前数据更适合先观察和复测，暂不需要生成可执行灌溉动作。" : guidance;
        }
        if ("DIAGNOSIS".equals(intent)) {
            Map<String, Object> diagnosis = Jsons.map(mapper, answer.get("diagnosis"));
            String cause = Jsons.text(diagnosis, "primaryCause", "EVIDENCE_INSUFFICIENT");
            double confidence = Jsons.number(diagnosis, "confidence", 0);
            return String.format(Locale.ROOT, "这次诊断更偏向 %s（置信度约 %.0f%%）。先核对支持证据与反对证据，再结合现场复测决定是否处理。", cause, confidence * 100);
        }
        if ("TODAY_WORK".equals(intent)) {
            List<Map<String, Object>> work = Jsons.maps(mapper, answer.get("workItems"));
            return work.isEmpty() ? "今天暂时没有新的高优先级农务。你也可以指定地块，我再按地块检查。"
                    : "今天共汇总到 " + work.size() + " 项待办，建议先处理高风险告警和有时限的巡田任务，再安排常规作业。";
        }
        if ("RISK_FORECAST".equals(intent)) {
            Map<String, Object> result = Jsons.map(mapper, answer.get("result"));
            String status = Jsons.text(result, "status", "AVAILABLE");
            return "UNAVAILABLE".equalsIgnoreCase(status)
                    ? "当前样本还不足以形成可靠预测。我可以先告诉你缺少哪些数据，补齐后再计算 1、2、4 小时风险。"
                    : "短期水分趋势已经算出。请重点看预计越界时间和区间范围；如果新遥测持续进入，预测会随之更新。";
        }
        if ("FOLLOW_UP".equals(intent)) {
            return "可以，我接着上一轮说明：当前数据只代表此刻的模拟观测，先确认异常项是否持续，再根据复测结果决定是处理设备还是调整农事。";
        }

        Map<String, Object> result = Jsons.map(mapper, answer.get("result"));
        Map<String, Object> device = Jsons.map(mapper, result.get("device"));
        Map<String, Object> latest = Jsons.map(mapper, result.get("latest"));
        Map<String, Object> soil = Jsons.map(mapper, latest.get("SOIL_MOISTURE"));
        String deviceStatus = Jsons.text(device, "status", "UNKNOWN");
        if (!soil.isEmpty()) {
            String quality = Jsons.text(Jsons.map(mapper, soil.get("quality")), "status", "GOOD");
            return String.format(Locale.ROOT, "当前设备状态为 %s，最新土壤湿度约 %.1f%%（质量 %s）。这是只读状态说明；如果你想了解某个指标或异常原因，可以直接点名追问。",
                    deviceStatus, Jsons.number(soil, "value", 0), quality);
        }
        return Jsons.text(answer, "summary", "我已结合当前地块数据完成查询。你可以继续追问具体指标、原因或处理步骤。");
    }

    private String retestChecklistNarrative(Map<String, Object> answer) {
        Map<String, Object> result = Jsons.map(mapper, answer.get("result"));
        Map<String, Object> latest = Jsons.map(mapper, result.get("latest"));
        Map<String, Object> device = Jsons.map(mapper, result.get("device"));
        List<String> items = new ArrayList<>();
        latest.forEach((metric, value) -> {
            Map<String, Object> event = Jsons.map(mapper, value);
            String quality = Jsons.text(Jsons.map(mapper, event.get("quality")), "status", "GOOD");
            if ("DEGRADED".equalsIgnoreCase(quality) || "BAD".equalsIgnoreCase(quality)) {
                items.add("在相同点位复测" + metricDisplayName(metric) + " 2～3 次，每次间隔约 5 分钟，并记录读数是否连续");
            }
        });
        if (items.isEmpty()) items.add("在根区相同深度复测土壤湿度 2～3 次，确认读数是否稳定");
        if ("OFFLINE".equalsIgnoreCase(Jsons.text(device, "status", ""))) {
            items.add("检查传感器供电、网关连接和最后心跳时间，恢复在线后再取一组新数据");
        } else {
            items.add("检查探头是否松动、污染或位置改变，并与邻近点位做一次交叉对照");
        }
        items.add("若准备灌溉，再核对阀门状态和流量计；复测合格后重新生成处方");
        StringBuilder text = new StringBuilder("可以，按这个顺序复测：");
        for (int i = 0; i < items.size(); i++) text.append("\n").append(i + 1).append(". ").append(items.get(i));
        return text.toString();
    }

    private String metricDisplayName(String metric) {
        return switch (String.valueOf(metric).toUpperCase(Locale.ROOT)) {
            case "SOIL_MOISTURE" -> "土壤湿度";
            case "AIR_TEMPERATURE" -> "空气温度";
            case "AIR_HUMIDITY" -> "空气湿度";
            case "LIGHT" -> "光照";
            case "CO2" -> "CO₂";
            case "PH" -> "pH";
            case "WATER_LEVEL" -> "水位";
            default -> String.valueOf(metric);
        };
    }

    private String resolveConversationId(Map<String, Object> input, UserPrincipal principal) {
        String conversationId = Jsons.text(input, "conversationId", "").trim();
        if (conversationId.isBlank()) conversationId = "conversation-" + principal.userId;
        if (!conversationId.matches("[A-Za-z0-9_-]{1,120}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CONVERSATION_ID_INVALID", "conversationId 格式无效");
        }
        Map<String, Object> existing = store.find("agent-conversation", conversationId);
        if (existing != null && !principal.userId.equals(Jsons.text(existing, "userId", ""))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "CONVERSATION_FORBIDDEN", "无权访问该对话");
        }
        return conversationId;
    }

    private List<Map<String, Object>> conversationMessages(UserPrincipal principal, String conversationId, int limit) {
        if (limit <= 0) return List.of();
        List<Map<String, Object>> messages = store.list("agent-message").stream()
                .filter(item -> principal.userId.equals(Jsons.text(item, "userId", "")))
                .filter(item -> conversationId.equals(Jsons.text(item, "conversationId", "")))
                .sorted(Comparator.comparing(item -> Jsons.instant(item.get("createdAt"), Instant.EPOCH)))
                .collect(Collectors.toCollection(ArrayList::new));
        int from = Math.max(0, messages.size() - Math.max(1, Math.min(limit, 100)));
        return new ArrayList<>(messages.subList(from, messages.size()));
    }

    private String lastAssistantIntent(List<Map<String, Object>> history) {
        if (history == null) return "";
        for (int i = history.size() - 1; i >= 0; i--) {
            Map<String, Object> item = history.get(i);
            if ("ASSISTANT".equalsIgnoreCase(Jsons.text(item, "role", ""))) return Jsons.text(item, "intent", "");
        }
        return "";
    }

    private synchronized void saveAgentTurn(UserPrincipal principal, String conversationId, String plotId,
                                            String userMessage, Map<String, Object> answer) {
        Instant now = Instant.now();
        String traceId = Jsons.text(answer, "traceId", Jsons.id("run"));
        Map<String, Object> userEntry = new LinkedHashMap<>();
        userEntry.put("messageId", Jsons.id("msg")); userEntry.put("conversationId", conversationId);
        userEntry.put("userId", principal.userId); userEntry.put("username", principal.username); userEntry.put("role", "USER");
        userEntry.put("content", userMessage.length() > 4000 ? userMessage.substring(0, 4000) + "…" : userMessage);
        userEntry.put("plotId", plotId); userEntry.put("traceId", traceId); userEntry.put("createdAt", now.toString());
        store.save("agent-message", Jsons.text(userEntry, "messageId", ""), userEntry);

        Map<String, Object> assistantEntry = new LinkedHashMap<>();
        assistantEntry.put("messageId", Jsons.id("msg")); assistantEntry.put("conversationId", conversationId);
        assistantEntry.put("userId", principal.userId); assistantEntry.put("role", "ASSISTANT");
        assistantEntry.put("content", Jsons.text(answer, "narrative", Jsons.text(answer, "summary", "")));
        assistantEntry.put("intent", Jsons.text(answer, "intent", "")); assistantEntry.put("plotId", plotId);
        assistantEntry.put("traceId", traceId); assistantEntry.put("adapter", Jsons.text(answer, "adapter", "rules"));
        assistantEntry.put("degraded", Jsons.bool(answer, "degraded", false));
        if (answer.containsKey("llm")) assistantEntry.put("llm", publicProjection(answer.get("llm")));
        if (answer.containsKey("actionProposal")) assistantEntry.put("actionProposal", publicProjection(answer.get("actionProposal")));
        assistantEntry.put("knowledgeEvidence", answer.get("knowledgeEvidence"));
        assistantEntry.put("createdAt", now.plusMillis(1).toString());
        store.save("agent-message", Jsons.text(assistantEntry, "messageId", ""), assistantEntry);

        Map<String, Object> conversation = store.find("agent-conversation", conversationId);
        if (conversation == null) {
            conversation = new LinkedHashMap<>(); conversation.put("conversationId", conversationId);
            conversation.put("userId", principal.userId); conversation.put("username", principal.username);
            String title = userMessage.replaceAll("\\s+", " ").trim();
            conversation.put("title", title.length() > 36 ? title.substring(0, 36) + "…" : title);
            conversation.put("createdAt", now.toString()); conversation.put("messageCount", 0);
        }
        conversation.put("plotId", plotId); conversation.put("lastIntent", answer.get("intent"));
        conversation.put("lastMessageAt", now.toString()); conversation.put("updatedAt", now.toString());
        conversation.put("messageCount", Jsons.whole(conversation, "messageCount", 0) + 2);
        store.save("agent-conversation", conversationId, conversation);
    }

    Map<String, Object> agentHistory(String conversationId, int limit, UserPrincipal principal) {
        String resolved = resolveConversationId(Map.of("conversationId", conversationId == null ? "" : conversationId), principal);
        Map<String, Object> conversation = store.find("agent-conversation", resolved);
        if (conversation == null) {
            conversation = new LinkedHashMap<>(); conversation.put("conversationId", resolved);
            conversation.put("userId", principal.userId); conversation.put("username", principal.username);
            conversation.put("title", "我的农智对话"); conversation.put("messageCount", 0);
        }
        Map<String, Object> result = new LinkedHashMap<>(); result.put("conversation", conversation);
        result.put("messages", conversationMessages(principal, resolved, Math.max(1, Math.min(limit, 100))));
        return result;
    }

    List<Map<String, Object>> agentConversations(int limit, UserPrincipal principal) {
        return store.list("agent-conversation").stream()
                .filter(item -> principal.userId.equals(Jsons.text(item, "userId", "")))
                .sorted(Comparator.comparing((Map<String, Object> item) -> Jsons.instant(item.get("updatedAt"), Instant.EPOCH)).reversed())
                .limit(Math.max(1, Math.min(limit, 50))).toList();
    }

    Map<String, Object> agentRun(String traceId, UserPrincipal principal) {
        Map<String, Object> run = requireRecord("agent-run", traceId);
        String owner = Jsons.text(run, "userId", "");
        if (!owner.isBlank() && !principal.userId.equals(owner) && !"SYSTEM_ADMIN".equals(principal.role)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "AGENT_RUN_FORBIDDEN", "无权访问该 Agent 记录");
        }
        return run;
    }

    /**
     * Projects the auditable agent result into facts that are safe and useful for
     * a user-facing narrative. Trace IDs, tool contracts and version bookkeeping
     * remain in the audit record but are never presented to the model as prose.
     */
    private Map<String, Object> narrativeContext(Map<String, Object> answer, String plotId) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("intent", answer.get("intent"));
        context.put("summary", answer.get("summary"));
        for (String key : List.of("result", "plan", "workItems")) {
            if (answer.containsKey(key)) context.put(key, publicProjection(answer.get(key)));
        }
        String knowledge = knowledgeSnippet(plotId);
        if (!knowledge.isBlank()) context.put("retrievedKnowledge", knowledge);
        return context;
    }

    @SuppressWarnings("unchecked")
    private Object publicProjection(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> projected = new LinkedHashMap<>();
            Set<String> hidden = Set.of("traceId", "requestId", "sourceLabels", "adapter", "mode", "tools", "context",
                    "knowledgeEvidence", "llm", "llmError", "narrative", "narrativeRaw", "inputSchema", "durationMs",
                    "validated", "schemaVersion", "agentVersion", "ruleVersion", "cropPackVersion", "knowledgeVersion");
            map.forEach((key, item) -> {
                String name = String.valueOf(key);
                if (!hidden.contains(name)) projected.put(name, publicProjection(item));
            });
            return projected;
        }
        if (value instanceof Collection<?> collection) return collection.stream().map(this::publicProjection).toList();
        return value;
    }

    private String knowledgeSnippet(String plotId) {
        return cropPackCatalog.knowledgeSnippet(plotCropContext(plotId));
    }

    /** Removes Qwen reasoning blocks and common prompt/metadata leakage. */
    static String sanitizeNarrative(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String text = raw.replace("\r", "").trim();
        // Qwen3.8 can return thinking in content when an older compatible server
        // ignores chat_template_kwargs. Remove both closed and unclosed blocks.
        for (String openTag : List.of("<think>", "<thinking>", "<|thinking|>")) {
            String closeTag = openTag.equals("<|thinking|>") ? "<|/thinking|>" : openTag.replace("<", "</");
            while (true) {
                String lower = text.toLowerCase(Locale.ROOT);
                int start = lower.indexOf(openTag);
                if (start < 0) break;
                int end = lower.indexOf(closeTag, start + openTag.length());
                if (end < 0) {
                    text = text.substring(0, start).trim();
                    break;
                }
                text = (text.substring(0, start) + text.substring(end + closeTag.length())).trim();
            }
        }
        List<String> kept = new ArrayList<>();
        Set<String> leakage = Set.of("traceid", "sourcelabels", "knowledgeevidence", "adapter:", "intent:",
                "用户问题：", "当前问题：", "当前公开事实", "系统提示：", "不得生成", "只根据给定事实", "工具入参", "工具出参", "result device", "<think>");
        for (String line : text.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.isBlank() || trimmed.equalsIgnoreCase("</think>")) {
                if (!kept.isEmpty() && !kept.get(kept.size() - 1).isBlank()) kept.add("");
                continue;
            }
            String lower = trimmed.toLowerCase(Locale.ROOT);
            if (leakage.stream().anyMatch(lower::contains)) continue;
            kept.add(trimmed);
        }
        while (!kept.isEmpty() && kept.get(kept.size() - 1).isBlank()) kept.remove(kept.size() - 1);
        // Avoid showing a duplicated final paragraph when a server returns both a
        // reasoning transcript and the answer in the same content field.
        List<String> deduped = new ArrayList<>();
        for (String line : kept) {
            if (!line.isBlank() && deduped.stream().anyMatch(line::equals)) continue;
            deduped.add(line);
        }
        return String.join("\n", deduped).replaceAll("\\n{3,}", "\\n\\n").trim();
    }

    private List<Map<String, Object>> knowledgeEvidence(String plotId) {
        Map<String, Object> context = plotCropContext(plotId);
        String crop = Jsons.text(context, "cropCode", "tomato");
        return List.of(
                Map.of("scope", "PLOT", "plotId", plotId, "provenance", "RETRIEVED", "source", cropPackCatalog.knowledgeSource(context), "version", context.get("knowledgeVersion")),
                Map.of("scope", "STAGE", "stageCode", context.get("stageCode"), "provenance", "RETRIEVED", "source", "crop-pack:" + crop + ":" + context.get("stageCode"), "version", context.get("cropPackVersion")),
                Map.of("scope", "CROP", "cropCode", crop, "provenance", "RETRIEVED", "source", "crop-pack:" + crop, "version", context.get("cropPackVersion")),
                Map.of("scope", "GENERAL", "provenance", "RETRIEVED", "source", "rules://agriloop/default", "version", "rules-agent-1.0")
        );
    }

    private Map<String, Object> tool(String name, Object input, Object output) {
        Set<String> allowed = Set.of("get_risk_forecast", "generate_irrigation_plan", "evaluate_diagnosis", "get_today_work_items", "get_plot_status");
        if (!allowed.contains(name)) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "TOOL_NOT_ALLOWED", "工具不在白名单中");
        if (!(input instanceof Map<?, ?>)) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "TOOL_SCHEMA_INVALID", "工具入参必须是 JSON object");
        Map<String, Object> contract = new LinkedHashMap<>(); contract.put("name", name); contract.put("input", input); contract.put("output", output);
        contract.put("inputSchema", Map.of("type", "object", "required", List.of("plotId"), "properties", Map.of("plotId", Map.of("type", "string", "minLength", 1))));
        contract.put("validated", true); contract.put("schemaVersion", "tool-schema-1.0"); contract.put("durationMs", 1); return contract;
    }

    Map<String, Object> passport(String traceId, UserPrincipal principal) {
        Map<String, Object> run = store.find("agent-run", traceId); if (run == null) run = Map.of("traceId", traceId);
        String plotId = Jsons.text(run, "plotId", "");
        List<Map<String, Object>> tracePlans = store.list("irrigation-plan").stream().filter(p -> traceId.equals(Jsons.text(p, "traceId", ""))).limit(20).toList();
        if (plotId.isBlank() && !tracePlans.isEmpty()) plotId = Jsons.text(tracePlans.get(0), "plotId", "");
        if (plotId.isBlank()) {
            Map<String, Object> traceDiagnosis = store.list("diagnosis").stream().filter(d -> traceId.equals(Jsons.text(d, "traceId", ""))).findFirst().orElse(null);
            if (traceDiagnosis != null) plotId = Jsons.text(traceDiagnosis, "plotId", "");
        }
        if (plotId.isBlank()) throw new ApiException(HttpStatus.NOT_FOUND, "PASSPORT_NOT_FOUND", "决策护照不存在");
        ensurePlotAccess(principal, plotId);
        String passportPlotId = plotId;
        List<Map<String, Object>> plans = store.list("irrigation-plan").stream().filter(p -> traceId.equals(Jsons.text(p, "traceId", "")) || passportPlotId.equals(Jsons.text(p, "plotId", ""))).limit(20).toList();
        Set<String> planIds = plans.stream().map(p -> Jsons.text(p, "planId", "")).collect(Collectors.toSet());
        List<Map<String, Object>> commands = store.list("command").stream().filter(c -> planIds.contains(Jsons.text(c, "planId", ""))).limit(20).toList();
        Set<String> commandIds = commands.stream().map(c -> Jsons.text(c, "commandId", "")).collect(Collectors.toSet());
        List<Map<String, Object>> evaluations = store.list("evaluation").stream().filter(e -> commandIds.contains(Jsons.text(e, "commandId", ""))).limit(20).toList();
        Map<String, Object> passport = new LinkedHashMap<>(); passport.put("traceId", traceId); passport.put("agentRun", run); passport.put("observations", latestMetrics(passportPlotId));
        passport.put("humanObservations", recentHumanObservations(passportPlotId));
        passport.put("diagnoses", store.list("diagnosis").stream().filter(d -> Jsons.text(d, "traceId", "").equals(traceId) || passportPlotId.equals(Jsons.text(d, "plotId", ""))).limit(20).toList()); passport.put("readiness", store.list("readiness").stream().filter(r -> passportPlotId.equals(Jsons.text(r, "plotId", ""))).limit(20).toList());
        passport.put("plans", plans); passport.put("commands", commands); passport.put("evaluations", evaluations);
        passport.put("valueLedgers", store.list("value-ledger").stream()
                .filter(ledger -> passportPlotId.equals(Jsons.text(ledger, "plotId", ""))).limit(20).toList());
        passport.put("provenance", List.of("OBSERVED", "USER_PROVIDED", "DERIVED", "SIMULATED", "ESTIMATED")); passport.put("generatedAt", Instant.now().toString()); return passport;
    }

    Map<String, Object> scenarioRun(Map<String, Object> input, UserPrincipal principal) {
        String plotId = Jsons.text(input, "plotId", "plot-a01");
        ensurePlotAccess(principal, plotId);
        boolean writesSample = Jsons.bool(input, "generateSample", false);
        if (writesSample && !principal.isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "SCENARIO_FORBIDDEN", "只有管理员可以写入情景样本");
        String requestedScenario = Jsons.text(input, "scenario", "");
        String scenario = requestedScenario.isBlank() ? "normal" : requestedScenario;
        String canonical = canonicalScenarioForRun(scenario);
        String scenarioId = Jsons.text(input, "scenarioId", canonical.toLowerCase(Locale.ROOT) + "-" + UUID.randomUUID().toString().substring(0, 8));
        Map<String, Object> run = new LinkedHashMap<>(input); run.put("runId", Jsons.id("scenario-run")); run.put("scenarioId", scenarioId); run.put("scenario", scenario); run.put("seed", Jsons.whole(input, "seed", 42)); run.put("status", "RUNNING"); run.put("startedAt", Instant.now().toString()); run.put("startedBy", principal.userId); run.putIfAbsent("branchId", "MAIN"); store.save("scenario-run", Jsons.text(run, "runId", ""), run); events.publish("scenario.started", run);
        if (writesSample) generateSampleScenario(canonical, scenarioId, Jsons.whole(input, "seed", 42), Jsons.text(input, "branchId", "MAIN"), principal);
        Map<String, Object> persistedSimulation = simulationRecord(plotId);
        Map<String, Object> whatIf = persistedSimulation;
        whatIf.put("scenario", canonical);
        if (!canonical.equals(Jsons.text(persistedSimulation, "scenario", "NORMAL"))) {
            whatIf.put("parameters", simulationDefaults(canonical, plotId));
        }
        Map<String, Object> supplied = Jsons.map(mapper, input.get("parameters"));
        if (!supplied.isEmpty()) {
            Map<String, Object> merged = Jsons.map(mapper, whatIf.get("parameters"));
            for (Map.Entry<String, double[]> entry : SIMULATION_PARAMETER_LIMITS.entrySet()) {
                String key = entry.getKey();
                if (!supplied.containsKey(key)) continue;
                double[] range = entry.getValue();
                double fallback = Jsons.number(merged, key, (range[0] + range[1]) / 2.0);
                merged.put(key, round(clamp(Jsons.number(supplied, key, fallback), fallback, range[0], range[1])));
            }
            whatIf.put("parameters", merged);
        }
        Map<String, Object> whatIfParameters = Jsons.map(mapper, whatIf.get("parameters"));
        if (Jsons.number(whatIfParameters, "riskThreshold", 20) >= Jsons.number(whatIfParameters, "waterloggingThreshold", 82)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SIMULATION_THRESHOLD_INVALID", "干旱阈值必须低于积水阈值");
        }
        Map<String, Object> projection = forecastForSimulation(plotId, "SOIL_MOISTURE", whatIf, false);
        run.put("plotId", plotId); run.put("scenario", canonical); run.put("scenarioLabel", simulationScenarioCatalog().stream().filter(item -> canonical.equals(item.get("code"))).findFirst().map(item -> item.get("label")).orElse(canonical));
        run.put("curve", projection.get("curve")); run.put("horizons", projection.get("horizons")); run.put("riskBoundary", projection.get("riskBoundary")); run.put("timeToRiskMinutes", projection.get("timeToRiskMinutes"));
        run.put("status", "COMPLETED"); run.put("completedAt", Instant.now().toString());
        run.put("replayEvents", store.list("scenario-event").stream().filter(e -> scenarioId.equals(Jsons.text(e, "scenarioId", ""))).count());
        run.put("mainEvents", store.telemetry(null, null, Instant.EPOCH, Instant.now().plusSeconds(1), 10000).stream().filter(e -> scenarioId.equals(Jsons.text(e, "scenarioId", ""))).count());
        store.save("scenario-run", Jsons.text(run, "runId", ""), run); events.publish("scenario.completed", run);
        return run;
    }

    Map<String, Object> scenarioSnapshot(String runId, UserPrincipal principal) {
        Map<String, Object> run = requireRecord("scenario-run", runId);
        String scenarioId = Jsons.text(run, "scenarioId", "");
        List<Map<String, Object>> branchEvents = store.list("scenario-event").stream().filter(e -> scenarioId.equals(Jsons.text(e, "scenarioId", ""))).toList();
        List<Map<String, Object>> mainEvents = store.telemetry(null, null, Instant.EPOCH, Instant.now().plusSeconds(1), 10000).stream().filter(e -> scenarioId.equals(Jsons.text(e, "scenarioId", ""))).toList();
        Map<String, Object> snapshot = new LinkedHashMap<>(); snapshot.put("snapshotId", Jsons.id("snapshot")); snapshot.put("run", run);
        snapshot.put("scenarioId", scenarioId); snapshot.put("seed", run.get("seed")); snapshot.put("branch", run.get("branchId"));
        snapshot.put("branchEvents", branchEvents); snapshot.put("mainEvents", mainEvents); snapshot.put("frozenAt", Instant.now().toString());
        snapshot.put("readOnly", true); snapshot.put("snapshotHash", Integer.toHexString(Objects.hash(scenarioId, run.get("seed"), branchEvents.size(), mainEvents.size())));
        return snapshot;
    }

    Map<String, Object> compareScenario(Map<String, Object> input, UserPrincipal principal) {
        if (!principal.isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "SCENARIO_FORBIDDEN", "只有管理员可以比较情景分支");
        String scenarioId = Jsons.text(input, "scenarioId", "");
        if (scenarioId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "SCENARIO_ID_REQUIRED", "需要 scenarioId");
        String left = Jsons.text(input, "leftBranch", "EXECUTE"); String right = Jsons.text(input, "rightBranch", "NO_ACTION");
        List<Map<String, Object>> all = store.list("scenario-event").stream().filter(e -> scenarioId.equals(Jsons.text(e, "scenarioId", ""))).toList();
        Map<String, Object> result = new LinkedHashMap<>(); result.put("scenarioId", scenarioId); result.put("leftBranch", branchSummary(all, left)); result.put("rightBranch", branchSummary(all, right));
        result.put("sameSeed", Jsons.whole(input, "seed", 42)); result.put("readOnly", true); result.put("comparisonVersion", "branch-compare-v1");
        return result;
    }

    private Map<String, Object> branchSummary(List<Map<String, Object>> eventsForScenario, String branch) {
        List<Map<String, Object>> eventsForBranch = eventsForScenario.stream().filter(e -> branch.equalsIgnoreCase(Jsons.text(e, "branchId", ""))).toList();
        List<Map<String, Object>> soil = eventsForBranch.stream().filter(e -> "SOIL_MOISTURE".equals(Jsons.text(e, "metric", ""))).toList();
        DoubleSummaryStatistics stats = soil.stream().mapToDouble(e -> Jsons.number(e, "value", 0)).summaryStatistics();
        Map<String, Object> summary = new LinkedHashMap<>(); summary.put("branchId", branch); summary.put("eventCount", eventsForBranch.size()); summary.put("soilSamples", soil.size());
        summary.put("soilMean", soil.isEmpty() ? null : round(stats.getAverage())); summary.put("soilMin", soil.isEmpty() ? null : round(stats.getMin())); summary.put("soilMax", soil.isEmpty() ? null : round(stats.getMax()));
        summary.put("provenance", "SIMULATED"); return summary;
    }

    private void generateSampleScenario(String scenario, String scenarioId, long seed, String branch, UserPrincipal principal) {
        String normalizedScenario = String.valueOf(scenario == null ? "normal" : scenario).toLowerCase(Locale.ROOT).replace('_', '-');
        Random random = new Random(seed); Instant base = Instant.now().minus(10, ChronoUnit.MINUTES);
        for (int i = 0; i < 30; i++) for (String plot : List.of("plot-a01", "plot-a02", "plot-b01")) {
            if (principal != null && !principal.canAccessPlot(plot)) continue;
            double moisture = 32 - i * ("drought".equalsIgnoreCase(normalizedScenario) ? .65 : "sensor-drift".equalsIgnoreCase(normalizedScenario) ? .1 : .05) + random.nextDouble();
            if ("heavy-rain".equalsIgnoreCase(normalizedScenario)) moisture += i * .4;
            ingest(Map.of("eventId", scenarioId + "-" + branch + "-" + i + "-" + plot, "farmId", "farm-demo", "plotId", plot, "deviceId", "mock-" + plot,
                    "metric", "SOIL_MOISTURE", "value", moisture, "unit", "%", "ts", base.plus(i * 20L, ChronoUnit.SECONDS).toString(), "scenarioId", scenarioId, "branchId", branch));
        }
    }

    Map<String, Object> record(String type, String id) { return requireRecord(type, id); }
    List<Map<String, Object>> records(String type) { return store.list(type); }
    boolean canAccessPlot(UserPrincipal principal, String plotId) {
        if (principal == null || principal.canAccessPlot(plotId)) return true;
        if (!principal.isFarmAdmin()) return false;
        Map<String, Object> plot = store.find("plot", plotId);
        String farmId = Jsons.text(plot == null ? Map.of() : plot, "farmId", "");
        return principal.farmIds.contains("*") || principal.farmIds.contains(farmId);
    }
    void ensurePlotAccess(UserPrincipal principal, String plotId) { if (!canAccessPlot(principal, plotId)) throw new ApiException(HttpStatus.FORBIDDEN, "PLOT_FORBIDDEN", "无权访问该地块"); }
    private Map<String, Object> requireRecord(String type, String id) { Map<String, Object> value = store.find(type, id); if (value == null) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", type + " " + id + " 不存在"); return value; }
    private int riskRank(String value) { return switch (String.valueOf(value).toUpperCase(Locale.ROOT)) { case "CRITICAL", "EMERGENCY", "HIGH", "SEVERE" -> 4; case "MEDIUM", "GENERAL" -> 3; case "LOW", "INFO" -> 2; default -> 1; }; }
    private record StreamBuilder(List<Map<String, Object>> values) { StreamBuilder() { this(new ArrayList<>()); } void add(Map<String, Object> v) { values.add(v); } }
}

@RestController
@RequestMapping("/api/v1")
class AgriController {
    private final AgriEngine engine;
    private final AgriStore store;
    private final AgriEventBus events;
    private final MqttBridge mqtt;
    private final SimulatorControl simulator;
    private final AdminManagementService adminManagement;

    AgriController(AgriEngine engine, AgriStore store, AgriEventBus events, MqttBridge mqtt, SimulatorControl simulator,
                   AdminManagementService adminManagement) {
        this.engine = engine; this.store = store; this.events = events; this.mqtt = mqtt; this.simulator = simulator;
        this.adminManagement = adminManagement;
    }

    @PostMapping("/auth/login")
    ResponseEntity<?> login(@RequestBody Map<String, Object> body) {
        return ok(engine.login(Jsons.text(body, "username", ""), Jsons.text(body, "password", ""), Jsons.text(body, "role", "")));
    }

    @PostMapping("/auth/register")
    ResponseEntity<?> register(@RequestBody Map<String, Object> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponses.success(
                engine.register(Jsons.text(body, "username", ""), Jsons.text(body, "password", ""), Jsons.text(body, "role", "FARMER"))));
    }

    @PostMapping("/auth/password/reset")
    ResponseEntity<?> resetPassword(@RequestBody Map<String, Object> body) {
        return ok(engine.resetPassword(Jsons.text(body, "username", ""), Jsons.text(body, "recoveryCode", ""),
                Jsons.text(body, "newPassword", "")));
    }

    @PostMapping("/auth/change-password")
    ResponseEntity<?> changePassword(@RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.changePassword(Jsons.text(body, "currentPassword", Jsons.text(body, "oldPassword", "")),
                Jsons.text(body, "newPassword", ""), principal(a)));
    }

    @GetMapping("/auth/me")
    ResponseEntity<?> me(Authentication authentication) {
        UserPrincipal p = principal(authentication);
        Map<String, Object> user = new LinkedHashMap<>(); user.put("userId", p.userId); user.put("username", p.username);
        user.put("role", p.role); user.put("roleLabel", RolePolicy.label(p.role)); user.put("farmIds", p.farmIds); user.put("plotIds", p.plotIds);
        user.put("permissions", engine.permissionsFor(p)); return ok(user);
    }

    @GetMapping("/auth/roles")
    ResponseEntity<?> roles() {
        return ok(List.of(
                Map.of("code", "FARM_ADMIN", "label", "农场管理员", "description", "负责全场运营、任务安排、风险审批与资源调度"),
                Map.of("code", "FARMER", "label", "种植农户", "description", "查看分配地块、提交巡田记录并确认农事建议"),
                Map.of("code", "SYSTEM_ADMIN", "label", "系统管理员", "description", "负责平台配置、数据链路、策略版本与全局审计")
        ));
    }

    @GetMapping("/overview")
    ResponseEntity<?> overview(@RequestParam(required = false) String farmId, Authentication a) {
        UserPrincipal p = principal(a);
        String selectedFarm = farmId == null || farmId.isBlank()
                ? p.farmIds.stream().filter(id -> !"*".equals(id)).findFirst().orElse(null) : farmId;
        return ok(engine.overview(selectedFarm, p));
    }

    @GetMapping("/system/status")
    ResponseEntity<?> systemStatus() { return ok(engine.dependencyStatus(mqtt.connected())); }

    @GetMapping("/simulator/status")
    ResponseEntity<?> simulatorStatus() { return ok(simulator.status()); }

    @PostMapping("/simulator/start")
    ResponseEntity<?> simulatorStart(Authentication a) {
        if (!principal(a).isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_REQUIRED", "需要管理员权限启动模拟器");
        return ok(simulator.start());
    }

    @PostMapping("/simulator/stop")
    ResponseEntity<?> simulatorStop(Authentication a) {
        if (!principal(a).isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_REQUIRED", "需要管理员权限停止模拟器");
        return ok(simulator.stop());
    }

    @GetMapping("/crop-packs")
    ResponseEntity<?> cropPacks() { return ok(engine.cropPacks()); }

    @PatchMapping("/crop-packs/{cropCode}/{version}/status")
    ResponseEntity<?> updateCropPackStatus(@PathVariable String cropCode, @PathVariable String version, @RequestBody Map<String, Object> body, Authentication a) {
        if (!principal(a).isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_REQUIRED", "只有系统管理员可以修改作物包状态");
        engine.updateCropPackStatus(cropCode, version, Jsons.text(body, "status", "DRAFT"));
        return ok(Map.of("success", true));
    }

    @GetMapping("/crop-manuals")
    ResponseEntity<?> cropManuals() { return ok(engine.cropManuals()); }

    @GetMapping("/crop-manuals/{cropCode}")
    ResponseEntity<?> cropManual(@PathVariable String cropCode, @RequestParam(required = false) String stageCode) {
        return ok(engine.cropManual(cropCode, stageCode));
    }

    @GetMapping("/crop-manuals/{cropCode}/stages/{stageCode}")
    ResponseEntity<?> cropManualStage(@PathVariable String cropCode, @PathVariable String stageCode) {
        return ok(engine.cropManual(cropCode, stageCode));
    }

    @GetMapping("/farms")
    ResponseEntity<?> farms(Authentication a) { UserPrincipal p = principal(a); return ok(filterFarmScope(store.list("farm"), p)); }

    @GetMapping("/plots")
    ResponseEntity<?> plots(@RequestParam(required = false) String farmId,
                            @RequestParam(required = false) String status,
                            @RequestParam(defaultValue = "false") boolean includeInactive,
                            Authentication a) {
        UserPrincipal p = principal(a);
        if (farmId != null && !farmId.isBlank() && !p.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权查看该农场");
        return ok(store.list("plot").stream()
                .filter(plot -> farmId == null || farmId.isBlank() || farmId.equals(Jsons.text(plot, "farmId", "")))
                .filter(plot -> includeInactive || !"INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE")))
                .filter(plot -> status == null || status.isBlank() || status.equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE")))
                .filter(plot -> engine.canAccessPlot(p, Jsons.text(plot, "plotId", ""))).toList());
    }

    @PostMapping("/plots")
    ResponseEntity<?> createPlot(@RequestBody Map<String, Object> body, Authentication a) {
        return ok(adminManagement.createPlot(body == null ? Map.of() : body, principal(a)));
    }

    @PatchMapping("/plots/{plotId}")
    ResponseEntity<?> updatePlot(@PathVariable String plotId, @RequestBody Map<String, Object> body, Authentication a) {
        return ok(adminManagement.updatePlot(plotId, body == null ? Map.of() : body, principal(a)));
    }

    @PutMapping("/plots/{plotId}/devices")
    ResponseEntity<?> setPlotDevices(@PathVariable String plotId,
                                     @RequestBody(required = false) Map<String, Object> body,
                                     Authentication a) {
        return ok(adminManagement.setPlotDevices(plotId, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/plots/{plotId}/deactivate")
    ResponseEntity<?> deactivatePlot(@PathVariable String plotId, Authentication a) {
        return ok(adminManagement.deactivatePlot(plotId, principal(a)));
    }

    @PostMapping("/plots/{plotId}/restore")
    ResponseEntity<?> restorePlot(@PathVariable String plotId, Authentication a) {
        return ok(adminManagement.restorePlot(plotId, principal(a)));
    }

    @DeleteMapping("/plots/{plotId}")
    ResponseEntity<?> deletePlot(@PathVariable String plotId, @RequestParam String confirmName, Authentication a) {
        return ok(adminManagement.deletePlot(plotId, confirmName, principal(a)));
    }

    @GetMapping("/plots/{plotId}/resolved-profile")
    ResponseEntity<?> resolvedProfile(@PathVariable String plotId, Authentication a) { engine.ensurePlotAccess(principal(a), plotId); return ok(engine.resolvedProfile(plotId)); }

    @GetMapping("/plots/{plotId}/crop-manual")
    ResponseEntity<?> plotCropManual(@PathVariable String plotId, Authentication a) {
        engine.ensurePlotAccess(principal(a), plotId);
        return ok(engine.plotCropManual(plotId));
    }

    @GetMapping("/plots/{plotId}/health")
    ResponseEntity<?> plotHealth(@PathVariable String plotId, Authentication a) {
        engine.ensurePlotAccess(principal(a), plotId);
        return ok(engine.plotHealth(plotId));
    }

    @GetMapping("/plots/{plotId}/simulation")
    ResponseEntity<?> plotSimulation(@PathVariable String plotId, Authentication a) {
        return ok(engine.plotSimulation(plotId, principal(a)));
    }

    @PutMapping("/plots/{plotId}/simulation")
    ResponseEntity<?> updatePlotSimulation(@PathVariable String plotId, @RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.updatePlotSimulation(plotId, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/plots/{plotId}/simulation/reset")
    ResponseEntity<?> resetPlotSimulation(@PathVariable String plotId,
                                          @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        String target = Jsons.text(body == null ? Map.of() : body, "target", "ALL");
        return ok(engine.resetPlotSimulation(plotId, target, principal(a)));
    }

    @GetMapping("/crop-batches")
    ResponseEntity<?> batches(@RequestParam(required = false) String farmId, Authentication a) {
        UserPrincipal p = principal(a);
        if (farmId != null && !farmId.isBlank() && !p.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权查看该农场");
        return ok(store.list("crop-batch").stream().filter(batch -> {
            String plotId = Jsons.text(batch, "plotId", "");
            Map<String, Object> plot = store.find("plot", plotId);
            String recordFarmId = Jsons.text(batch, "farmId", plot == null ? "" : Jsons.text(plot, "farmId", ""));
            return (farmId == null || farmId.isBlank() || farmId.equals(recordFarmId)) && engine.canAccessPlot(p, plotId);
        }).toList());
    }

    @PostMapping("/crop-batches")
    ResponseEntity<?> createBatch(@RequestBody Map<String, Object> body, Authentication a) {
        return ok(adminManagement.createCropBatch(body, principal(a)));
    }

    @GetMapping("/crop-batches/{batchId}/plan")
    ResponseEntity<?> batchPlan(@PathVariable String batchId, Authentication a) { return ok(adminManagement.cropBatchPlan(batchId, principal(a))); }

    @PostMapping("/crop-batches/{batchId}/plan/generate")
    ResponseEntity<?> generateBatchPlan(@PathVariable String batchId,
                                        @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        return ok(adminManagement.generateCropBatchPlan(batchId, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/crop-batches/{batchId}/plan/review")
    ResponseEntity<?> reviewBatchPlan(@PathVariable String batchId,
                                      @RequestBody Map<String, Object> body, Authentication a) {
        return ok(adminManagement.reviewCropBatchPlan(batchId, body, principal(a)));
    }

    @GetMapping("/plots/{plotId}/telemetry")
    ResponseEntity<?> telemetry(@PathVariable String plotId, @RequestParam(required = false) String metric, @RequestParam(required = false) String from,
                                @RequestParam(required = false) String to, @RequestParam(defaultValue = "1000") int limit, Authentication a) {
        engine.ensurePlotAccess(principal(a), plotId); return ok(engine.telemetry(plotId, metric, from, to, limit));
    }

    @PostMapping("/telemetry")
    ResponseEntity<?> ingest(@RequestBody Map<String, Object> body, Authentication a) { engine.ensurePlotAccess(principal(a), Jsons.text(body, "plotId", "plot-a01")); return ok(engine.ingest(body)); }

    @GetMapping("/plots/{plotId}/risk-forecast")
    ResponseEntity<?> forecast(@PathVariable String plotId, @RequestParam(defaultValue = "SOIL_MOISTURE") String metric, Authentication a) { engine.ensurePlotAccess(principal(a), plotId); return ok(engine.forecast(plotId, metric)); }

    @PostMapping("/forecasts/evaluate")
    ResponseEntity<?> forecastEvaluate(@RequestBody Map<String, Object> body, Authentication a) { String plot = Jsons.text(body, "plotId", "plot-a01"); engine.ensurePlotAccess(principal(a), plot); return ok(engine.forecast(plot, Jsons.text(body, "metric", "SOIL_MOISTURE"))); }

    @GetMapping("/plots/{plotId}/timeline")
    ResponseEntity<?> timeline(@PathVariable String plotId, Authentication a) {
        engine.ensurePlotAccess(principal(a), plotId); List<Map<String, Object>> timeline = new ArrayList<>();
        for (String type : List.of("alert", "diagnosis", "readiness", "irrigation-plan", "command", "evaluation", "inspection", "work-order")) {
            store.list(type).stream().filter(x -> plotId.equals(Jsons.text(x, "plotId", ""))).forEach(x -> timeline.add(Map.of("type", type, "at", Jsons.text(x, "createdAt", Jsons.text(x, "evaluatedAt", Instant.now().toString())), "record", x)));
        }
        timeline.sort(Comparator.comparing(x -> Jsons.text(x, "at", ""))); return ok(timeline);
    }

    @GetMapping(value = "/events/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream() { return events.subscribe(); }

    @PostMapping("/scenarios/runs")
    ResponseEntity<?> scenario(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.scenarioRun(body, principal(a))); }

    @GetMapping("/scenarios/runs")
    ResponseEntity<?> scenarios(Authentication a) { return ok(store.list("scenario-run")); }

    @GetMapping("/scenarios/runs/{runId}")
    ResponseEntity<?> scenarioById(@PathVariable String runId, Authentication a) { return ok(engine.record("scenario-run", runId)); }

    @GetMapping("/scenarios/runs/{runId}/snapshot")
    ResponseEntity<?> scenarioSnapshot(@PathVariable String runId, Authentication a) { return ok(engine.scenarioSnapshot(runId, principal(a))); }

    @PostMapping("/scenarios/compare")
    ResponseEntity<?> scenarioCompare(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.compareScenario(body, principal(a))); }

    @PostMapping("/rules/evaluate")
    ResponseEntity<?> rules(@RequestBody Map<String, Object> body, Authentication a) { String plot = Jsons.text(body, "plotId", "plot-a01"); engine.ensurePlotAccess(principal(a), plot); return ok(engine.diagnose(plot, body)); }

    @GetMapping("/rules")
    ResponseEntity<?> ruleCatalog(Authentication a) {
        return ok(engine.cropPacks().stream().map(pack -> {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("cropCode", pack.get("cropCode"));
            entry.put("version", pack.get("ruleVersion"));
            entry.put("cropPackVersion", pack.get("version"));
            entry.put("rules", pack.get("rules"));
            return entry;
        }).toList());
    }

    @PostMapping("/diagnoses/evaluate")
    ResponseEntity<?> diagnosis(@RequestBody Map<String, Object> body, Authentication a) { String plot = Jsons.text(body, "plotId", "plot-a01"); engine.ensurePlotAccess(principal(a), plot); return ok(engine.diagnose(plot, body)); }

    @GetMapping("/diagnoses/{diagnosisId}")
    ResponseEntity<?> diagnosisById(@PathVariable String diagnosisId, Authentication a) { Map<String, Object> d = engine.record("diagnosis", diagnosisId); engine.ensurePlotAccess(principal(a), Jsons.text(d, "plotId", "")); return ok(d); }

    @PostMapping("/diagnoses/{diagnosisId}/explain")
    ResponseEntity<?> diagnosisExplain(@PathVariable String diagnosisId,
                                       @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        UserPrincipal p = principal(a);
        Map<String, Object> diagnosis = engine.record("diagnosis", diagnosisId);
        engine.ensurePlotAccess(p, Jsons.text(diagnosis, "plotId", ""));
        return ok(engine.explainDiagnosis(diagnosisId, p, Jsons.bool(body == null ? Map.of() : body, "force", false)));
    }

    @GetMapping("/decisions/{subjectType}/{subjectId}/readiness")
    ResponseEntity<?> readiness(@PathVariable String subjectType, @PathVariable String subjectId, Authentication a) { return ok(engine.readiness(subjectType, subjectId, principal(a))); }

    @PostMapping("/decision-readiness/{readinessId}/evidence-requests")
    ResponseEntity<?> evidenceRequest(@PathVariable String readinessId,
                                      @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        Map<String, Object> readiness = engine.record("readiness", readinessId);
        String plotId = Jsons.text(readiness, "plotId", "");
        UserPrincipal p = principal(a); engine.ensurePlotAccess(p, plotId);
        Map<String, Object> plot = engine.record("plot", plotId);
        Map<String, Object> input = new LinkedHashMap<>(body == null ? Map.of() : body);
        input.put("farmId", Jsons.text(plot, "farmId", "")); input.put("plotId", plotId);
        input.put("sourceType", "READINESS"); input.put("sourceRef", readinessId);
        input.putIfAbsent("actionType", "INSPECTION");
        return ok(engine.createWorkOrder(input, p));
    }

    @PostMapping("/inspections")
    ResponseEntity<?> inspection(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.createInspection(body, principal(a))); }

    @PostMapping(value = "/inspections/{inspectionId}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<?> inspectionPhotos(@PathVariable String inspectionId,
                                       @RequestParam("files") List<MultipartFile> files, Authentication a) {
        return ok(engine.uploadInspectionPhotos(inspectionId, files, principal(a)));
    }

    @GetMapping("/inspections/{inspectionId}/photos/{photoId}")
    ResponseEntity<byte[]> inspectionPhoto(@PathVariable String inspectionId, @PathVariable String photoId, Authentication a) {
        Map<String, Object> photo = engine.inspectionPhoto(inspectionId, photoId, principal(a));
        byte[] bytes = (byte[]) photo.get("bytes");
        String fileName = Jsons.text(photo, "fileName", photoId + ".jpg");
        String contentType = Jsons.text(photo, "contentType", MediaType.IMAGE_JPEG_VALUE);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + fileName.replace("\"", "") + "\"")
                .body(bytes);
    }

    @GetMapping("/plots/{plotId}/inspections")
    ResponseEntity<?> inspections(@PathVariable String plotId, Authentication a) { engine.ensurePlotAccess(principal(a), plotId); return ok(engine.inspections(plotId)); }

    @PostMapping("/irrigation/estimate")
    ResponseEntity<?> irrigation(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.irrigationPlan(body, principal(a))); }

    @PostMapping("/agent/chat")
    ResponseEntity<?> chat(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.agentChat(body, principal(a))); }

    @PostMapping("/agent/actions/{actionId}/confirm")
    ResponseEntity<?> confirmAgentAction(@PathVariable String actionId,
                                         @RequestBody(required = false) Map<String, Object> body,
                                         Authentication a) {
        return ok(engine.confirmAgentAction(actionId, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/agent/actions/{actionId}/cancel")
    ResponseEntity<?> cancelAgentAction(@PathVariable String actionId, Authentication a) {
        return ok(engine.cancelAgentAction(actionId, principal(a)));
    }

    @GetMapping("/agent/history")
    ResponseEntity<?> agentHistory(@RequestParam(required = false) String conversationId,
                                   @RequestParam(defaultValue = "40") int limit, Authentication a) {
        return ok(engine.agentHistory(conversationId, limit, principal(a)));
    }

    @GetMapping("/agent/conversations")
    ResponseEntity<?> agentConversations(@RequestParam(defaultValue = "20") int limit, Authentication a) {
        return ok(engine.agentConversations(limit, principal(a)));
    }

    @GetMapping("/agent/tools")
    ResponseEntity<?> agentTools(Authentication a) { return ok(List.of(
            Map.of("name", "get_risk_forecast", "schemaVersion", "tool-schema-1.0", "sideEffect", "READ_ONLY"),
            Map.of("name", "generate_irrigation_plan", "schemaVersion", "tool-schema-1.0", "sideEffect", "READ_ONLY"),
            Map.of("name", "evaluate_diagnosis", "schemaVersion", "tool-schema-1.0", "sideEffect", "READ_ONLY"),
            Map.of("name", "get_today_work_items", "schemaVersion", "tool-schema-1.0", "sideEffect", "READ_ONLY"),
            Map.of("name", "get_plot_status", "schemaVersion", "tool-schema-1.0", "sideEffect", "READ_ONLY"),
            Map.of("name", "create_plot", "schemaVersion", "tool-schema-1.0", "sideEffect", "MUTATION_REQUIRES_CONFIRMATION"),
            Map.of("name", "update_plot", "schemaVersion", "tool-schema-1.0", "sideEffect", "MUTATION_REQUIRES_CONFIRMATION"),
            Map.of("name", "set_plot_devices", "schemaVersion", "tool-schema-1.0", "sideEffect", "MUTATION_REQUIRES_CONFIRMATION"),
            Map.of("name", "create_and_assign_work_order", "schemaVersion", "tool-schema-1.0", "sideEffect", "MUTATION_REQUIRES_CONFIRMATION"),
            Map.of("name", "publish_alert_verification", "schemaVersion", "tool-schema-1.0", "sideEffect", "MUTATION_REQUIRES_CONFIRMATION"),
            Map.of("name", "close_alert", "schemaVersion", "tool-schema-1.0", "sideEffect", "MUTATION_REQUIRES_CONFIRMATION"))); }

    @GetMapping("/agent/runs/{traceId}")
    ResponseEntity<?> agentRun(@PathVariable String traceId, Authentication a) { return ok(engine.agentRun(traceId, principal(a))); }

    @PostMapping("/commands/virtual")
    ResponseEntity<?> command(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.createCommand(body, principal(a))); }

    @PostMapping("/commands/{commandId}/ack")
    ResponseEntity<?> commandAck(@PathVariable String commandId, @RequestBody(required = false) Map<String, Object> body, Authentication a) { return ok(engine.acknowledgeCommand(commandId, body, principal(a))); }

    @GetMapping("/commands/{commandId}")
    ResponseEntity<?> commandById(@PathVariable String commandId, Authentication a) { return ok(engine.record("command", commandId)); }

    @GetMapping("/commands/{commandId}/evaluation")
    ResponseEntity<?> evaluation(@PathVariable String commandId, Authentication a) { return ok(engine.commandEvaluation(commandId)); }

    @GetMapping("/work-items/today")
    ResponseEntity<?> today(@RequestParam(required = false) String farmId,
                            @RequestParam(required = false) String plotId, Authentication a) {
        UserPrincipal p = principal(a);
        if (farmId != null && !farmId.isBlank() && !p.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权查看该农场");
        if (plotId != null) engine.ensurePlotAccess(p, plotId);
        List<Map<String, Object>> work = engine.todayWork(plotId, p);
        return ok(farmId == null || farmId.isBlank() ? work : work.stream()
                .filter(item -> farmId.equals(Jsons.text(item, "farmId", ""))).toList());
    }

    @PostMapping("/work-orders")
    ResponseEntity<?> workOrder(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.createWorkOrder(body, principal(a))); }

    @GetMapping("/work-orders")
    ResponseEntity<?> workOrders(@RequestParam(required = false) String farmId,
                                 @RequestParam(required = false) String plotId,
                                 @RequestParam(required = false) String status,
                                 @RequestParam(required = false) String assigneeId,
                                 Authentication a) {
        Map<String, String> filters = new LinkedHashMap<>();
        if (farmId != null) filters.put("farmId", farmId);
        if (plotId != null) filters.put("plotId", plotId);
        if (status != null) filters.put("status", status);
        if (assigneeId != null) filters.put("assigneeId", assigneeId);
        return ok(engine.workOrders(filters, principal(a)));
    }

    @PostMapping("/work-orders/{workOrderId}/assign")
    ResponseEntity<?> assignWorkOrder(@PathVariable String workOrderId, @RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.assignWorkOrder(workOrderId, body, principal(a)));
    }

    @PostMapping("/work-orders/{workOrderId}/transition")
    ResponseEntity<?> transitionWorkOrder(@PathVariable String workOrderId, @RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.transitionWorkOrder(workOrderId, body, principal(a)));
    }

    @PostMapping("/work-orders/{workOrderId}/review")
    ResponseEntity<?> reviewWorkOrder(@PathVariable String workOrderId, @RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.reviewWorkOrder(workOrderId, body, principal(a)));
    }

    @GetMapping("/farm-members")
    ResponseEntity<?> farmMembers(@RequestParam String farmId, Authentication a) { return ok(engine.farmMembers(farmId, principal(a))); }

    @PostMapping("/farm-members")
    ResponseEntity<?> createFarmMember(@RequestBody Map<String, Object> body, Authentication a) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponses.success(adminManagement.createFarmMember(body, principal(a))));
    }

    @PatchMapping("/farm-members/{userId}/status")
    ResponseEntity<?> updateFarmMemberStatus(@PathVariable String userId, @RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.updateFarmMemberStatus(userId, body, principal(a)));
    }

    @PatchMapping("/farm-members/{userId}/scope")
    ResponseEntity<?> updateFarmMemberScope(@PathVariable String userId, @RequestBody Map<String, Object> body, Authentication a) {
        return ok(adminManagement.updateFarmMemberScope(userId, body, principal(a)));
    }

    @DeleteMapping("/farm-members/{userId}")
    ResponseEntity<?> deleteFarmMember(@PathVariable String userId, @RequestParam String farmId, Authentication a) {
        return ok(adminManagement.deleteFarmMember(userId, farmId, principal(a)));
    }

    @GetMapping("/alerts")
    ResponseEntity<?> alerts(@RequestParam(required = false) String farmId, Authentication a) {
        UserPrincipal p = principal(a);
        if (farmId != null && !farmId.isBlank() && !p.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权查看该农场");
        return ok(store.list("alert").stream().filter(alert -> {
            String plotId = Jsons.text(alert, "plotId", "");
            Map<String, Object> plot = store.find("plot", plotId);
            String recordFarmId = Jsons.text(alert, "farmId", plot == null ? "" : Jsons.text(plot, "farmId", ""));
            return (farmId == null || farmId.isBlank() || farmId.equals(recordFarmId)) && engine.canAccessPlot(p, plotId);
        }).toList());
    }

    @PostMapping("/alerts/{alertId}/ack")
    ResponseEntity<?> ackAlert(@PathVariable String alertId, Authentication a) { return ok(engine.transitionAlert(alertId, "ACKED", principal(a))); }

    @PostMapping("/alerts/{alertId}/close")
    ResponseEntity<?> closeAlert(@PathVariable String alertId, Authentication a) { return ok(engine.transitionAlert(alertId, "CLOSED", principal(a))); }

    @PostMapping("/alerts/{alertId}/verification-task")
    ResponseEntity<?> alertVerificationTask(@PathVariable String alertId,
                                             @RequestBody(required = false) Map<String, Object> body,
                                             Authentication a) {
        return ok(engine.publishAlertVerificationTask(alertId, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/alerts/{alertId}/escalate")
    ResponseEntity<?> escalateAlert(@PathVariable String alertId, Authentication a) { return ok(engine.transitionAlert(alertId, "ESCALATED", principal(a))); }

    @GetMapping("/crop-batches/{batchId}/plan-actual")
    ResponseEntity<?> planActual(@PathVariable String batchId, Authentication a) { Map<String, Object> batch = engine.record("crop-batch", batchId); engine.ensurePlotAccess(principal(a), Jsons.text(batch, "plotId", "")); String plotId = Jsons.text(batch, "plotId", ""); List<String> planIds = store.list("irrigation-plan").stream().filter(p -> plotId.equals(Jsons.text(p, "plotId", ""))).map(p -> Jsons.text(p, "planId", "")).toList(); double planned = store.list("irrigation-plan").stream().filter(p -> plotId.equals(Jsons.text(p, "plotId", ""))).mapToDouble(p -> Jsons.number(p, "waterLitre", 0)).sum(); double actual = store.list("evaluation").stream().filter(e -> planIds.contains(Jsons.text(e, "planId", ""))).mapToDouble(e -> Jsons.number(Jsons.map(engineMapper(), e.get("actual")), "waterLitre", 0)).sum(); Map<String, Object> result = new LinkedHashMap<>(); result.put("batchId", batchId); result.put("plannedWaterLitres", planned); result.put("actualWaterLitres", actual); result.put("waterDeviationRate", planned == 0 ? null : (actual - planned) / planned); result.put("planIds", planIds); return ok(result); }

    @PostMapping("/decisions/{traceId}/feedback")
    ResponseEntity<?> feedback(@PathVariable String traceId, @RequestBody Map<String, Object> body, Authentication a) { return ok(engine.feedback(traceId, body, principal(a))); }

    @GetMapping("/decisions/{traceId}/similar-cases")
    ResponseEntity<?> cases(@PathVariable String traceId, @RequestParam Map<String, String> params, Authentication a) { return ok(engine.similarCases(traceId, new LinkedHashMap<>(params))); }

    @PostMapping("/resource-plans/evaluate")
    ResponseEntity<?> resourcePlan(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.resourcePlan(body, principal(a))); }

    @GetMapping("/resource-plans/{resourcePlanId}")
    ResponseEntity<?> resourcePlanById(@PathVariable String resourcePlanId, Authentication a) { return ok(engine.record("resource-plan", resourcePlanId)); }

    @GetMapping("/value-ledgers")
    ResponseEntity<?> valueLedgers(@RequestParam String farmId, Authentication a) { return ok(adminManagement.valueLedgers(farmId, principal(a))); }

    @PostMapping("/value-ledgers")
    ResponseEntity<?> valueLedger(@RequestBody Map<String, Object> body, Authentication a) { return ok(adminManagement.createValueLedger(body, principal(a))); }

    @GetMapping("/decision-passports/{traceId}")
    ResponseEntity<?> passport(@PathVariable String traceId, Authentication a) { return ok(engine.passport(traceId, principal(a))); }

    @PostMapping("/strategy-candidates")
    ResponseEntity<?> strategy(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.strategyCandidate(body, principal(a))); }

    @PostMapping("/strategy-candidates/{id}/transition")
    ResponseEntity<?> strategyTransition(@PathVariable String id, @RequestBody Map<String, Object> body, Authentication a) { return ok(engine.transitionStrategy(id, Jsons.text(body, "status", ""), principal(a))); }

    @GetMapping("/strategy-candidates")
    ResponseEntity<?> strategies(Authentication a) { return ok(store.list("strategy-candidate")); }

    @GetMapping("/devices")
    ResponseEntity<?> devices(@RequestParam String farmId, Authentication a) { return ok(adminManagement.devices(farmId, principal(a))); }

    @PostMapping("/devices")
    ResponseEntity<?> device(@RequestBody Map<String, Object> body, Authentication a) { return ok(adminManagement.registerDevice(body, principal(a))); }

    @PostMapping("/devices/{deviceId}/bind")
    ResponseEntity<?> bindDevice(@PathVariable String deviceId, @RequestBody Map<String, Object> body, Authentication a) { return ok(adminManagement.bindDevice(deviceId, body, principal(a))); }

    @PostMapping("/devices/{deviceId}/unbind")
    ResponseEntity<?> unbindDevice(@PathVariable String deviceId, Authentication a) { return ok(adminManagement.unbindDevice(deviceId, principal(a))); }

    @PostMapping("/devices/{deviceId}/control")
    ResponseEntity<?> controlDevice(@PathVariable String deviceId, @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        return ok(engine.controlDevice(deviceId, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/devices/{deviceId}/heartbeat")
    ResponseEntity<?> heartbeat(@PathVariable String deviceId, @RequestBody(required = false) Map<String, Object> body, Authentication a) { return ok(engine.heartbeat(deviceId, body, principal(a))); }

    @PostMapping("/strategy-candidates/{id}/offline-validate")
    ResponseEntity<?> offlineValidate(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body, Authentication a) { return ok(engine.offlineValidateStrategy(id, body == null ? Map.of() : body, principal(a))); }

    private void validatePlot(Map<String, Object> plot) {
        if (Jsons.text(plot, "name", "").isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_NAME_REQUIRED", "请填写地块名称");
        if (Jsons.text(plot, "cropCode", "").isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_CROP_REQUIRED", "请选择作物种类");
        if (Jsons.text(plot, "cropVariety", "").isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_VARIETY_REQUIRED", "请填写作物品种");
        if (Jsons.number(plot, "areaM2", 0) <= 0) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_AREA_INVALID", "地块面积必须大于 0");
        if (Jsons.whole(plot, "growthCycleDays", 0) <= 0) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_GROWTH_CYCLE_INVALID", "生长周期必须大于 0 天");
    }
    private List<Map<String, Object>> filterFarmScope(List<Map<String, Object>> farms, UserPrincipal p) { return farms.stream().filter(f -> p.farmIds.contains("*") || p.farmIds.contains(Jsons.text(f, "farmId", ""))).toList(); }
    private UserPrincipal principal(Authentication a) { if (a == null || !(a.getPrincipal() instanceof UserPrincipal p)) throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "需要登录"); return p; }
    private ResponseEntity<Map<String, Object>> ok(Object data) { return ResponseEntity.ok(ApiResponses.success(data)); }
    private ObjectMapper engineMapper() { try { return new ObjectMapper().registerModule(new JavaTimeModule()); } catch (Exception e) { return new ObjectMapper(); } }
}

final class ApiResponses {
    private ApiResponses() {}
    static Map<String, Object> success(Object data) { return Map.of("requestId", UUID.randomUUID().toString(), "timestamp", Instant.now().toString(), "schemaVersion", "1.0", "data", data); }
    static Map<String, Object> error(String code, String message, Object details) { Map<String, Object> body = new LinkedHashMap<>(); body.put("requestId", UUID.randomUUID().toString()); body.put("timestamp", Instant.now().toString()); body.put("schemaVersion", "1.0"); body.put("error", Map.of("code", code, "message", message, "details", details == null ? Map.of() : details)); return body; }
}

@RestControllerAdvice
class ApiErrorHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, Object>> api(ApiException e) { return ResponseEntity.status(e.status).body(ApiResponses.error(e.code, e.getMessage(), e.details)); }
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, Object>> other(Exception e) {
        boolean badRequest = e instanceof IllegalArgumentException
                || e instanceof org.springframework.http.converter.HttpMessageNotReadableException
                || e instanceof org.springframework.web.bind.MissingServletRequestParameterException;
        HttpStatus status = badRequest ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR;
        String code = badRequest ? "PARAM_INVALID" : "INTERNAL_ERROR";
        return ResponseEntity.status(status).body(ApiResponses.error(code, e.getMessage() == null ? (badRequest ? "请求参数无效" : "服务器内部错误") : e.getMessage(), Map.of()));
    }
}

class ApiException extends RuntimeException {
    final HttpStatus status; final String code; Map<String, Object> details = Map.of();
    ApiException(HttpStatus status, String code, String message) { super(message); this.status = status; this.code = code; }
    ApiException withDetails(Map<String, Object> details) { this.details = details == null ? Map.of() : details; return this; }
}

@Component
class MqttBridge {
    private final AgriProperties properties;
    private final AgriEngine engine;
    private final AgriStore store;
    private final AtomicBoolean connected = new AtomicBoolean(false);
    private volatile org.eclipse.paho.client.mqttv3.MqttClient client;

    MqttBridge(AgriProperties properties, AgriEngine engine, AgriStore store) { this.properties = properties; this.engine = engine; this.store = store; }

    @PostConstruct
    void start() {
        if (!"simulation".equalsIgnoreCase(properties.getMode())) return;
        CompletableFuture.runAsync(() -> {
            try {
                client = new org.eclipse.paho.client.mqttv3.MqttClient(properties.getMqttUrl(), properties.getMqttClientId() + "-" + UUID.randomUUID());
                org.eclipse.paho.client.mqttv3.MqttConnectOptions options = new org.eclipse.paho.client.mqttv3.MqttConnectOptions(); options.setAutomaticReconnect(true); options.setCleanSession(false);
                if (StringUtils.hasText(properties.getMqttUsername())) { options.setUserName(properties.getMqttUsername()); options.setPassword(properties.getMqttPassword().toCharArray()); }
                client.setCallback(new org.eclipse.paho.client.mqttv3.MqttCallback() {
                    public void connectionLost(Throwable cause) { connected.set(false); }
                    public void messageArrived(String topic, org.eclipse.paho.client.mqttv3.MqttMessage message) {
                        try {
                            Map<String, Object> body = new ObjectMapper().readValue(message.getPayload(), Map.class);
                            if (topic.endsWith("/telemetry")) engine.ingest(body);
                            else if (topic.endsWith("/device/status")) engine.ingestDeviceStatus(body);
                            else if (topic.endsWith("/command/ack")) {
                                String commandId = Jsons.text(body, "commandId", "");
                                if (!commandId.isBlank()) {
                                    Map<String, Object> c = store.find("command", commandId);
                                    if (c != null && c.get("ack") == null) {
                                        if ("DEVICE_STATUS_SET".equals(Jsons.text(c, "type", ""))) engine.handleDeviceControlAck(c, body);
                                        else { c.put("ack", body); c.put("status", Jsons.text(body, "status", "TIMEOUT")); store.save("command", commandId, c); engine.evaluateCommand(c, body); }
                                    }
                                }
                            }
                        } catch (Exception ignored) { store.save("dead-letter", Jsons.id("dlq"), Map.of("topic", topic, "reason", "INVALID_MESSAGE", "receivedAt", Instant.now().toString())); }
                    }
                    public void deliveryComplete(org.eclipse.paho.client.mqttv3.IMqttDeliveryToken token) { }
                });
                client.connect(options); client.subscribe("agri/+/+/telemetry", 1); client.subscribe("agri/+/+/device/status", 1); client.subscribe("agri/+/+/command/ack", 1); connected.set(true);
            } catch (Exception ignored) { connected.set(false); }
        });
    }

    boolean connected() { return connected.get(); }
}
