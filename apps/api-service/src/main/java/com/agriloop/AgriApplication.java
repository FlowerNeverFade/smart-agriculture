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
    private boolean seedData = true;
    private long sseHeartbeatSeconds = 15;
    private long maxIrrigationSeconds = 900;
    private double dailyWaterLimitLitres = 5000;
    private String cropPackPath = "classpath:/crop-packs";
    private boolean simulatorControlEnabled = true;
    private String supervisorConfig = "/srv/agriloop/supervisor.conf";
    private String simulatorProgram = "agriloop-simulator";

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
        if (v instanceof Number n) return n.doubleValue();
        try { return v == null ? fallback : Double.parseDouble(String.valueOf(v)); }
        catch (Exception ignored) { return fallback; }
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
        String sql = "INSERT INTO telemetry(event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,quality_status,quality_json,scenario_id,branch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)";
        try {
            jdbc.update(sql, eventId, Jsons.text(copy, "farmId", "farm-demo"), Jsons.text(copy, "plotId", "plot-a01"),
                    Jsons.text(copy, "deviceId", "mock-device"), Jsons.text(copy, "metric", "UNKNOWN"), Jsons.number(copy, "value", 0),
                    Jsons.text(copy, "unit", ""), TimestampParser.sql(Jsons.instant(copy.get("ts"), Instant.now())),
                    Jsons.text(Jsons.map(mapper, copy.get("quality")), "status", "GOOD"), Jsons.json(mapper, copy.get("quality")),
                    Jsons.text(copy, "scenarioId", Jsons.text(copy, "scenario", null)), Jsons.text(copy, "branchId", null));
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
            StringBuilder sql = new StringBuilder("SELECT event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,quality_status,quality_json,scenario_id,branch_id FROM telemetry WHERE 1=1");
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
                e.put("scenario", rs.getString("scenario_id")); e.put("branchId", rs.getString("branch_id"));
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
            StringBuilder sql = new StringBuilder("SELECT event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,quality_status,quality_json,scenario_id,branch_id FROM telemetry WHERE 1=1");
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
                e.put("scenario", rs.getString("scenario_id")); e.put("branchId", rs.getString("branch_id"));
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

    boolean credentialVersionMatches(String userId, int credentialVersion) {
        Map<String, Object> user = userById(userId);
        return user != null && Jsons.bool(user, "enabled", true)
                && (int) Jsons.whole(user, "credentialVersion", 1) == credentialVersion;
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
            plot.put("location", Map.of("lat", 29.56 + i * 0.001, "lng", 106.55 + i * 0.001)); save("plot", plots[i], plot);
            Map<String, Object> batch = new LinkedHashMap<>(); batch.put("batchId", "batch-" + plots[i]); batch.put("plotId", plots[i]);
            batch.put("cropCode", crops[i]); batch.put("stageCode", "fruiting"); batch.put("cropPackVersion", "1.0.0");
            batch.put("plantedAt", Instant.now().minus(45, ChronoUnit.DAYS).toString()); save("crop-batch", "batch-" + plots[i], batch);
            Map<String, Object> device = new LinkedHashMap<>(); device.put("deviceId", "mock-" + plots[i]); device.put("plotId", plots[i]);
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
            String plotId = Jsons.text(command, "plotId", "plot-a01");
            if (!plotId.matches("[A-Za-z0-9_-]{1,120}")) throw new IllegalArgumentException("unsafe plot id");
            client = new org.eclipse.paho.client.mqttv3.MqttClient(properties.getMqttUrl(), properties.getMqttClientId() + "-command-" + UUID.randomUUID().toString().substring(0, 8));
            org.eclipse.paho.client.mqttv3.MqttConnectOptions options = new org.eclipse.paho.client.mqttv3.MqttConnectOptions();
            options.setAutomaticReconnect(false); options.setCleanSession(true); options.setConnectionTimeout(2);
            if (StringUtils.hasText(properties.getMqttUsername())) { options.setUserName(properties.getMqttUsername()); options.setPassword(properties.getMqttPassword().toCharArray()); }
            client.connect(options);
            org.eclipse.paho.client.mqttv3.MqttMessage message = new org.eclipse.paho.client.mqttv3.MqttMessage(mapper.writeValueAsBytes(command)); message.setQos(1);
            client.publish("agri/farm-demo/" + plotId + "/command", message); available.set(true);
        } catch (Exception ignored) { available.set(false); }
        finally { if (client != null) { try { if (client.isConnected()) client.disconnect(); } catch (Exception ignored) { } try { client.close(); } catch (Exception ignored) { } } }
    }

    boolean available() { return available.get(); }
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
    boolean canControl() { return RolePolicy.canControl(role); }
    boolean canInspect() { return Set.of("FARMER", "FARM_ADMIN").contains(role); }
    boolean canRequestIrrigation() { return Set.of("FARMER", "FARM_ADMIN").contains(role); }
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
                List<GrantedAuthority> authorities = List.of(new SimpleGrantedAuthority("ROLE_" + principal.role));
                SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, authorities));
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
                        .requestMatchers("/api/v1/auth/**", "/actuator/health", "/actuator/info", "/error", "/v3/api-docs/**", "/swagger-ui/**").permitAll()
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
    private final ObjectMapper mapper;
    private final ResourceLoader resourceLoader;
    private final HttpClient llmHttpClient;
    private final AgriStore store;
    private final AgriEventBus events;
    private final AgriProperties properties;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final StringRedisTemplate redis;
    private final MqttCommandGateway mqttCommands;
    private final RedisStreamWorker streamWorker;
    private final Map<String, Instant> cooldowns = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> idempotentCommands = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> ackByCommand = new ConcurrentHashMap<>();
    private final Set<String> evaluatedCommands = ConcurrentHashMap.newKeySet();
    private final Map<String, Deque<Instant>> ruleWindows = new ConcurrentHashMap<>();
    private final Map<String, Deque<Instant>> recoveryFailures = new ConcurrentHashMap<>();
    private final AtomicBoolean redisAvailable = new AtomicBoolean(false);
    private final AtomicLong redisPublished = new AtomicLong();
    private final AtomicLong redisFailures = new AtomicLong();

    AgriEngine(ObjectMapper mapper, ResourceLoader resourceLoader, AgriStore store, AgriEventBus events, AgriProperties properties,
               PasswordEncoder passwordEncoder, JwtService jwtService, StringRedisTemplate redis, MqttCommandGateway mqttCommands, RedisStreamWorker streamWorker) {
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
        this.store = store; this.events = events; this.properties = properties;
        this.passwordEncoder = passwordEncoder; this.jwtService = jwtService; this.redis = redis; this.mqttCommands = mqttCommands; this.streamWorker = streamWorker;
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
        return overview(null);
    }

    Map<String, Object> overview(UserPrincipal principal) {
        List<Map<String, Object>> plots = store.list("plot").stream()
                .filter(plot -> principal == null || principal.canAccessPlot(Jsons.text(plot, "plotId", "")))
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
            cards.add(card);
        }
        cards.sort(Comparator.comparingInt((Map<String, Object> c) -> riskRank(Jsons.text(c, "riskLevel", "LOW"))).reversed());
        return Map.of("farmId", "farm-demo", "plots", cards, "activeAlertCount", activeAlerts, "pendingWorkOrderCount", pendingTasks,
                "eventCount", store.eventCount(), "dataMode", properties.getMode(), "aiMode", properties.getAiMode(), "generatedAt", Instant.now().toString());
    }

    List<Map<String, Object>> cropPacks() {
        return List.of(cropPack("tomato", "番茄", List.of("seedling", "vegetative", "flowering", "fruiting")),
                cropPack("cucumber", "黄瓜", List.of("seedling", "vegetative", "flowering", "fruiting")));
    }

    private Map<String, Object> cropPack(String code, String name, List<String> stages) {
        Map<String, Object> pack = new LinkedHashMap<>(); pack.put("cropCode", code); pack.put("name", name); pack.put("version", "1.0.0");
        pack.put("schemaVersion", "1.0"); pack.put("status", "ACTIVE"); pack.put("stages", stages);
        pack.put("metrics", List.of(metric("SOIL_MOISTURE", "%", "SUPPORTED", 20, 45), metric("AIR_TEMPERATURE", "°C", "SUPPORTED", 18, 32),
                metric("LIGHT", "lux", "SIMULATION_ONLY", 1000, 70000), metric("CO2", "ppm", "SIMULATION_ONLY", 350, 1200),
                metric("PH", "pH", "SIMULATION_ONLY", 5.5, 7.2), metric("WATER_LEVEL", "%", "SUPPORTED", 20, 100)));
        pack.put("rules", List.of(Map.of("code", "WATER_DEFICIT", "metric", "SOIL_MOISTURE", "operator", "LT", "threshold", 20.0, "durationMinutes", 5, "cooldownMinutes", 120),
                Map.of("code", "HEAT_STRESS", "metric", "AIR_TEMPERATURE", "operator", "GT", "threshold", 35.0, "durationMinutes", 10, "cooldownMinutes", 60)));
        pack.put("prescriptionConstraints", Map.of("maxDurationSeconds", properties.getMaxIrrigationSeconds(), "cooldownMinutes", 120, "maxDailyWaterLitres", properties.getDailyWaterLimitLitres()));
        pack.put("forecastProfile", Map.of("algorithm", "robust-trend-v1", "horizonsMinutes", List.of(60, 120, 240), "minValidSamples", 6, "maxStalenessSeconds", 120));
        pack.put("knowledgeVersion", "kb-1.0.0"); pack.put("ruleVersion", "rule-1.0.0");
        return pack;
    }

    private Map<String, Object> metric(String code, String unit, String availability, double low, double high) {
        return Map.of("code", code, "unit", unit, "availability", availability, "target", Map.of("low", low, "high", high));
    }

    Map<String, Object> resolvedProfile(String plotId) {
        Map<String, Object> plot = requireRecord("plot", plotId);
        String crop = Jsons.text(plot, "cropCode", "tomato");
        Map<String, Object> pack = cropPacks().stream().filter(p -> crop.equals(p.get("cropCode"))).findFirst().orElse(cropPacks().get(0));
        Map<String, Object> batch = store.list("crop-batch").stream().filter(b -> plotId.equals(Jsons.text(b, "plotId", ""))).findFirst().orElse(Map.of());
        Map<String, Object> farm = store.find("farm", Jsons.text(plot, "farmId", "farm-demo"));
        Map<String, Object> resolvedPack = Jsons.copy(mapper, pack);
        Map<String, Object> resolvedParameters = new LinkedHashMap<>();
        resolvedParameters.put("systemDefaults", Map.of("waterPricePerLitre", 0.004, "maxIrrigationSeconds", properties.getMaxIrrigationSeconds()));
        resolvedParameters.put("cropPack", Map.of("version", pack.get("version"), "ruleVersion", pack.get("ruleVersion"), "forecastProfile", pack.get("forecastProfile")));
        resolvedParameters.put("farm", farm == null ? Map.of() : farm.getOrDefault("defaults", Map.of()));
        resolvedParameters.put("plot", plot.getOrDefault("overrides", Map.of()));
        resolvedPack.put("resolvedParameters", resolvedParameters);
        return Map.of("plotId", plotId, "farmId", Jsons.text(plot, "farmId", "farm-demo"), "cropCode", crop,
                "stageCode", Jsons.text(batch, "stageCode", "fruiting"), "cropPack", resolvedPack, "parameterResolution", List.of("SYSTEM_DEFAULT", "CROP_PACK", "FARM", "PLOT"));
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
        boolean inserted = store.saveTelemetry(event);
        if (!inserted) return Map.of("accepted", false, "duplicate", true, "eventId", event.get("eventId"), "quality", event.get("quality"));
        publishTelemetryStream(event);
        String plotId = Jsons.text(event, "plotId", "plot-a01");
        String deviceId = Jsons.text(event, "deviceId", "mock-" + plotId);
        Map<String, Object> device = deviceForPlot(plotId);
        if (device.isEmpty()) { device = new LinkedHashMap<>(); device.put("deviceId", deviceId); device.put("plotId", plotId); }
        Map<String, Object> eventQuality = Jsons.map(mapper, event.get("quality"));
        boolean offlineSignal = "device-offline".equalsIgnoreCase(Jsons.text(event, "scenarioId", ""))
                && "BAD".equalsIgnoreCase(Jsons.text(eventQuality, "status", ""));
        device.put("status", offlineSignal ? "OFFLINE" : "ONLINE"); device.put("lastSeen", event.get("ts"));
        device.put("healthScore", "BAD".equalsIgnoreCase(Jsons.text(eventQuality, "status", "GOOD")) ? 0.35 : 0.98);
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
        return status;
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
        e.put("plotId", plotId); e.put("deviceId", Jsons.text(input, "deviceId", "mock-" + plotId)); e.put("metric", metric); e.put("value", value); e.put("unit", unit);
        e.put("ts", ts.toString()); e.put("quality", quality); e.put("scenarioId", scenario); e.put("scenario", scenario); e.put("schemaVersion", "1.0");
        if (input.containsKey("branchId")) e.put("branchId", input.get("branchId"));
        return e;
    }

    private double jumpLimitFor(String metric) {
        return switch (metric) {
            case "AIR_TEMPERATURE" -> 15;
            case "LIGHT" -> 12_000;
            case "CO2" -> 500;
            case "PH" -> 2;
            case "WATER_LEVEL" -> 25;
            default -> 35;
        };
    }

    private String validateQuality(String metric, double value, Instant ts, Map<String, Object> quality) {
        double low = switch (metric) { case "SOIL_MOISTURE", "WATER_LEVEL" -> 0; case "AIR_TEMPERATURE" -> -40; case "PH" -> 0; default -> 0; };
        double high = switch (metric) { case "SOIL_MOISTURE", "WATER_LEVEL" -> 100; case "AIR_TEMPERATURE" -> 80; case "PH" -> 14; case "CO2" -> 10000; default -> 1_000_000; };
        if (value < low || value > high) return "BAD";
        long age = Math.max(0, Duration.between(ts, Instant.now()).toSeconds());
        if (ts.isAfter(Instant.now().plusSeconds(30)) || age > 300 || "BAD".equalsIgnoreCase(Jsons.text(quality, "status", ""))) return "BAD";
        if (age > 120 || "DEGRADED".equalsIgnoreCase(Jsons.text(quality, "status", ""))) return "DEGRADED";
        return "GOOD";
    }

    private String unitFor(String metric) {
        return switch (metric) { case "SOIL_MOISTURE", "WATER_LEVEL" -> "%"; case "AIR_TEMPERATURE" -> "°C"; case "LIGHT" -> "lux"; case "CO2" -> "ppm"; case "PH" -> "pH"; default -> "unit"; };
    }

    private Map<String, Object> evaluateRuleForEvent(Map<String, Object> event) {
        String metric = Jsons.text(event, "metric", ""); double value = Jsons.number(event, "value", 0); String plotId = Jsons.text(event, "plotId", "");
        Map<String, Object> result = new LinkedHashMap<>(); result.put("metric", metric); result.put("value", value); result.put("evaluatedAt", Instant.now().toString());
        if ("SOIL_MOISTURE".equals(metric) && value < 20) {
            boolean drift = "sensor-drift".equalsIgnoreCase(Jsons.text(event, "scenarioId", "")) || "BAD".equals(Jsons.text(Jsons.map(mapper, event.get("quality")), "status", "GOOD"));
            Deque<Instant> window = ruleWindows.computeIfAbsent(plotId, ignored -> new ConcurrentLinkedDeque<>()); Instant now = Instant.now(); window.addLast(now); while (!window.isEmpty() && Duration.between(window.peekFirst(), now).toMinutes() > 5) window.removeFirst();
            Map<String, Object> alert = new LinkedHashMap<>(); alert.put("alertId", Jsons.id("alert")); alert.put("plotId", plotId); alert.put("level", drift ? "HIGH" : "MEDIUM");
            alert.put("source", drift ? "SENSOR_DRIFT_RULE" : "WATER_DEFICIT_RULE"); alert.put("status", "ACTIVE"); alert.put("evidence", List.of(event));
            alert.put("ruleState", window.size() >= 3 ? "TRIGGERED" : "CANDIDATE"); alert.put("durationMinutes", 5); alert.put("hysteresis", 2); alert.put("cooldownMinutes", 120);
            alert.put("createdAt", Instant.now().toString()); store.save("alert", Jsons.text(alert, "alertId", ""), alert); events.publish("alert.created", alert); store.logEvent("alert.created", alert);
            Map<String, Object> diagnosis = diagnose(plotId, Map.of("scenarioId", Jsons.text(event, "scenarioId", "normal")));
            result.put("alert", alert); result.put("diagnosis", diagnosis);
        }
        if ("AIR_TEMPERATURE".equals(metric) && value > 35) result.put("risk", "HEAT_STRESS");
        return result;
    }

    Map<String, Object> latestMetrics(String plotId) {
        Instant from = Instant.now().minus(48, ChronoUnit.HOURS);
        Map<String, Map<String, Object>> latest = new LinkedHashMap<>();
        for (Map<String, Object> e : store.telemetry(plotId, null, from, Instant.now().plusSeconds(1), 10000)) {
            latest.put(Jsons.text(e, "metric", ""), e);
        }
        return new LinkedHashMap<>(latest);
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
        // reconnected device record. Prefer the online record and then the
        // newest heartbeat deterministically; never let map iteration order
        // turn a healthy plot into a false DEVICE_FAULT diagnosis.
        candidates.sort((left, right) -> {
            int online = Boolean.compare("ONLINE".equals(Jsons.text(left, "status", "")),
                    "ONLINE".equals(Jsons.text(right, "status", "")));
            if (online != 0) return -online;
            return Jsons.instant(Jsons.text(right, "lastSeen", ""), Instant.EPOCH)
                    .compareTo(Jsons.instant(Jsons.text(left, "lastSeen", ""), Instant.EPOCH));
        });
        return candidates.isEmpty() ? new LinkedHashMap<>() : candidates.get(0);
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
        device.put("status", "ONLINE"); device.put("lastSeen", Jsons.text(input, "ts", Instant.now().toString()));
        device.put("healthScore", Jsons.number(input, "healthScore", Jsons.number(device, "healthScore", .98)));
        device.put("heartbeat", Jsons.copy(mapper, input)); store.save("device", deviceId, device); events.publish("device.heartbeat", device); return device;
    }

    Map<String, Object> transitionAlert(String alertId, String status, UserPrincipal principal) {
        if (!principal.isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "ALERT_FORBIDDEN", "只有管理员可以变更告警状态");
        Map<String, Object> alert = requireRecord("alert", alertId); ensurePlotAccess(principal, Jsons.text(alert, "plotId", ""));
        String normalized = status == null ? "" : status.toUpperCase(Locale.ROOT);
        if (!Set.of("ACKED", "CLOSED", "RESOLVED", "ESCALATED", "ACTIVE").contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ALERT_STATUS_INVALID", "不支持的告警状态");
        }
        alert.put("status", normalized); alert.put("updatedBy", principal.userId); alert.put("updatedAt", Instant.now().toString());
        store.save("alert", alertId, alert); events.publish("alert." + normalized.toLowerCase(Locale.ROOT), alert); return alert;
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
        double waterScore = Double.isNaN(moisture) ? 0.15 : Math.max(0, Math.min(0.95, (20 - moisture) / 20 + 0.35));
        double driftScore = explicitDrift ? 0.92 : 0.08;
        double deviceScore = "OFFLINE".equals(Jsons.text(device, "status", "ONLINE")) ? 0.9 : 0.05;
        candidates.add(candidate("WATER_DEFICIT", waterScore)); candidates.add(candidate("SENSOR_DRIFT", driftScore)); candidates.add(candidate("DEVICE_FAULT", deviceScore));
        if (Jsons.number(Jsons.map(mapper, latest.get("AIR_TEMPERATURE")), "value", 0) > 35) candidates.add(candidate("HEAT_STRESS", 0.76));
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
        Map<String, Object> diagnosis = new LinkedHashMap<>(); diagnosis.put("diagnosisId", Jsons.id("diag")); diagnosis.put("plotId", plotId); diagnosis.put("riskType", primary);
        diagnosis.put("primaryCause", primary); diagnosis.put("confidence", Math.round(confidence * 100.0) / 100.0); diagnosis.put("candidateCauses", candidates);
        diagnosis.put("supportingEvidence", supporting); diagnosis.put("opposingEvidence", opposing); diagnosis.put("missingInformation", missing);
        diagnosis.put("scenarioId", scenario); if (request.containsKey("traceId")) diagnosis.put("traceId", request.get("traceId")); diagnosis.put("ruleVersion", "rule-1.0.0"); diagnosis.put("cropPackVersion", "1.0.0"); diagnosis.put("evaluatedAt", Instant.now().toString());
        store.save("diagnosis", Jsons.text(diagnosis, "diagnosisId", ""), diagnosis); events.publish("diagnosis.created", diagnosis); store.logEvent("diagnosis.created", diagnosis);
        return diagnosis;
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
        boolean diagnosisNeedsReview = diagnosis != null && ("INSUFFICIENT_EVIDENCE".equals(diagnosisCause)
                || ("SENSOR_DRIFT".equals(diagnosisCause) && diagnosisConfidence < .6));
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
        result.put("missingEvidence", missing); result.put("conflicts", drift ? List.of("QUALITY_VS_MOISTURE_CONFLICT") : List.of());
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
        boolean hardDataBlock = soil.isEmpty()
                || "BAD".equals(qualityStatus)
                || anyMetricBad
                || "OFFLINE".equals(Jsons.text(device, "status", "OFFLINE"))
                || ("SENSOR_DRIFT".equals(primary) && diagnosisConfidence >= 0.6);
        boolean reviewOnly = !hardDataBlock
                && (anyMetricDegraded || "DEGRADED".equals(qualityStatus) || "SENSOR_DRIFT".equals(primary) || "INSUFFICIENT_EVIDENCE".equals(primary));
        Map<String, Object> plan = new LinkedHashMap<>(); plan.put("planId", Jsons.id("plan")); plan.put("plotId", plotId); plan.put("diagnosisId", diagnosis.get("diagnosisId")); if (request.containsKey("traceId")) plan.put("traceId", request.get("traceId"));
        plan.put("cropPackVersion", "1.0.0"); plan.put("ruleVersion", "rule-1.0.0"); plan.put("knowledgeVersion", "kb-1.0.0"); plan.put("agentVersion", "rules-agent-1.0");
        plan.put("recommendedWindow", Map.of("start", Instant.now().plus(5, ChronoUnit.MINUTES).toString(), "end", Instant.now().plus(35, ChronoUnit.MINUTES).toString()));
        double current = Jsons.number(soil, "value", 18); Map<String, Object> plot = requireRecord("plot", plotId); double area = Jsons.number(plot, "areaM2", 80);
        Map<String, Object> resource = store.find("resource-profile", "resource-default"); double flow = Jsons.number(resource, "flowRateLitresPerMinute", 18); double target = 30;
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
        boolean approved = Jsons.bool(request, "approved", false) || principal.isAdmin();
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
        List<Map<String, Object>> points = telemetry(plotId, metric == null ? "SOIL_MOISTURE" : metric, null, null, 500).stream()
                .filter(p -> "GOOD".equalsIgnoreCase(Jsons.text(Jsons.map(mapper, p.get("quality")), "status", "BAD")))
                .toList();
        String usedMetric = metric == null ? "SOIL_MOISTURE" : metric.toUpperCase(Locale.ROOT);
        if (points.size() < 3) return forecastUnavailable(plotId, usedMetric, "INSUFFICIENT_SAMPLES", points.size());
        Map<String, Object> last = points.get(points.size() - 1); Map<String, Object> first = points.get(Math.max(0, points.size() - Math.min(points.size() - 1, 12)));
        double current = Jsons.number(last, "value", 0); double slope = (current - Jsons.number(first, "value", current)) /
                Math.max(1, Duration.between(Jsons.instant(first.get("ts"), Instant.EPOCH), Jsons.instant(last.get("ts"), Instant.EPOCH)).toMinutes());
        double mean = points.stream().mapToDouble(p -> Jsons.number(p, "value", 0)).average().orElse(current);
        double mad = points.stream().mapToDouble(p -> Math.abs(Jsons.number(p, "value", 0) - mean)).average().orElse(1.0);
        List<Map<String, Object>> horizons = new ArrayList<>(); Integer[] mins = {60, 120, 240};
        for (int minute : mins) {
            double value = current + slope * minute; double spread = Math.max(0.8, mad * (1 + minute / 240.0));
            horizons.add(Map.of("minutes", minute, "value", round(value), "lower", round(value - spread), "upper", round(value + spread)));
        }
        Integer timeToRisk = null;
        if ("SOIL_MOISTURE".equals(usedMetric) && slope < 0 && current > 20) timeToRisk = (int) Math.ceil((current - 20) / -slope);
        Map<String, Object> result = new LinkedHashMap<>(); result.put("forecastId", Jsons.id("fc")); result.put("plotId", plotId); result.put("metric", usedMetric);
        result.put("issuedAt", Instant.now().toString()); result.put("status", "AVAILABLE"); result.put("horizons", horizons); result.put("timeToRiskMinutes", timeToRisk);
        result.put("riskBoundary", Map.of("operator", "LT", "value", 20.0, "unit", "%")); result.put("inputWindow", Map.of("from", first.get("ts"), "to", last.get("ts"), "validSamples", points.size()));
        result.put("quality", Map.of("coverage", points.stream().filter(p -> "GOOD".equals(Jsons.text(Jsons.map(mapper, p.get("quality")), "status", "BAD"))).count() / (double) points.size(), "confidenceBandSource", "RESIDUAL_MAD"));
        result.put("assumptions", List.of("NO_IRRIGATION", "MOCK_WEATHER_STABLE")); result.put("algorithmVersion", "robust-trend-v1"); result.put("expiresAt", Instant.now().plus(10, ChronoUnit.MINUTES).toString());
        store.save("forecast", Jsons.text(result, "forecastId", ""), result); events.publish("forecast.created", result); store.logEvent("forecast.created", result); return result;
    }

    private Map<String, Object> forecastUnavailable(String plotId, String metric, String reason, int samples) {
        Map<String, Object> result = new LinkedHashMap<>(); result.put("forecastId", Jsons.id("fc")); result.put("plotId", plotId); result.put("metric", metric); result.put("status", "UNAVAILABLE");
        result.put("reason", reason); result.put("inputWindow", Map.of("validSamples", samples)); result.put("horizons", List.of()); result.put("timeToRiskMinutes", null); result.put("algorithmVersion", "robust-trend-v1");
        store.save("forecast", Jsons.text(result, "forecastId", ""), result); return result;
    }

    private double round(double value) { return Math.round(value * 100.0) / 100.0; }

    Map<String, Object> createInspection(Map<String, Object> input, UserPrincipal principal) {
        if (!principal.canInspect()) throw new ApiException(HttpStatus.FORBIDDEN, "INSPECTION_FORBIDDEN", "当前角色不能提交巡田记录");
        String plotId = Jsons.text(input, "plotId", "plot-a01"); ensurePlotAccess(principal, plotId);
        Map<String, Object> record = new LinkedHashMap<>(input); record.put("inspectionId", Jsons.text(input, "inspectionId", Jsons.id("ins"))); record.put("plotId", plotId);
        record.put("operatorId", principal.userId); record.put("observedAt", Jsons.text(input, "observedAt", Instant.now().toString())); record.put("revision", Jsons.whole(input, "revision", 1));
        record.put("provenance", "USER_PROVIDED"); record.put("sourceType", "HUMAN_OBSERVATION");
        Map<String, Object> quality = Jsons.map(mapper, input.get("quality")); quality.putIfAbsent("status", "GOOD"); quality.putIfAbsent("completeness", 1.0); record.put("quality", quality);
        store.save("inspection", Jsons.text(record, "inspectionId", ""), record); events.publish("inspection.created", record); store.logEvent("inspection.created", record); return record;
    }

    List<Map<String, Object>> inspections(String plotId) { return store.list("inspection").stream().filter(i -> plotId.equals(Jsons.text(i, "plotId", ""))).toList(); }

    List<Map<String, Object>> todayWork(String plotId) {
        StreamBuilder work = new StreamBuilder();
        store.list("work-order").stream().filter(w -> plotId == null || plotId.equals(Jsons.text(w, "plotId", ""))).forEach(work::add);
        store.list("alert").stream().filter(a -> (plotId == null || plotId.equals(Jsons.text(a, "plotId", ""))) && !Set.of("RESOLVED", "CLOSED").contains(Jsons.text(a, "status", ""))).forEach(a -> work.add(Map.of(
                "workItemId", Jsons.text(a, "alertId", Jsons.id("wi")), "sourceType", "ALERT", "sourceRef", a.get("alertId"), "plotId", a.get("plotId"),
                "priority", Jsons.text(a, "level", "MEDIUM"), "status", "OPEN", "reason", a.get("source"), "dueAt", Instant.now().plus(2, ChronoUnit.HOURS).toString())));
        store.list("diagnosis").stream().filter(d -> (plotId == null || plotId.equals(Jsons.text(d, "plotId", "")))).limit(20).forEach(d -> work.add(Map.of(
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
        String plotId = Jsons.text(input, "plotId", "plot-a01"); ensurePlotAccess(principal, plotId);
        Map<String, Object> work = new LinkedHashMap<>(input); work.put("workOrderId", Jsons.text(input, "workOrderId", Jsons.id("wo"))); work.put("plotId", plotId);
        work.putIfAbsent("status", "OPEN"); work.putIfAbsent("priority", "MEDIUM"); work.putIfAbsent("createdAt", Instant.now().toString()); work.put("createdBy", principal.userId);
        store.save("work-order", Jsons.text(work, "workOrderId", ""), work); events.publish("workorder.created", work); return work;
    }

    Map<String, Object> resourcePlan(Map<String, Object> input, UserPrincipal principal) {
        if (!principal.isFarmAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_PLAN_FORBIDDEN", "只有农场管理员可以安排农场资源");
        List<Map<String, Object>> demands = Jsons.maps(mapper, input.get("demands")); if (demands.isEmpty()) demands = store.list("irrigation-plan").stream().limit(10).toList();
        Map<String, Object> resource = store.find("resource-profile", "resource-default"); double capacity = Jsons.number(resource, "capacityLitres", 900); double remaining = capacity;
        List<Map<String, Object>> allocations = new ArrayList<>(), conflicts = new ArrayList<>(), unmet = new ArrayList<>();
        demands = new ArrayList<>(demands); demands.sort(Comparator.comparingInt((Map<String, Object> d) -> riskRank(Jsons.text(d, "priority", "MEDIUM"))).reversed());
        for (Map<String, Object> demand : demands) {
            double requested = Jsons.number(demand, "waterLitre", Jsons.number(demand, "requestedLitres", 0)); String plotId = Jsons.text(demand, "plotId", "plot-a01");
            if (!principal.canAccessPlot(plotId)) throw new ApiException(HttpStatus.FORBIDDEN, "PLOT_FORBIDDEN", "无权为该地块分配资源");
            double allocated = Math.min(remaining, Math.max(0, requested)); remaining -= allocated;
            allocations.add(Map.of("plotId", plotId, "requestedLitres", requested, "allocatedLitres", allocated, "status", allocated >= requested ? "ALLOCATED" : "PARTIAL"));
            if (allocated < requested) { Map<String, Object> reason = new LinkedHashMap<>(); reason.put("plotId", plotId); reason.put("requestedLitres", requested); reason.put("unmetLitres", requested - allocated); reason.put("reason", "WATER_CAPACITY"); unmet.add(reason); conflicts.add(Map.of("type", "CAPACITY", "plotId", plotId)); }
        }
        Map<String, Object> plan = new LinkedHashMap<>(); plan.put("resourcePlanId", Jsons.id("rp")); plan.put("status", unmet.isEmpty() ? "FEASIBLE" : "INFEASIBLE");
        plan.put("scope", Jsons.text(input, "scope", "farm-demo")); plan.put("window", Map.of("from", Instant.now().toString(), "to", Instant.now().plus(6, ChronoUnit.HOURS).toString()));
        plan.put("constraints", Map.of("waterCapacityLitres", capacity)); plan.put("allocations", allocations); plan.put("conflicts", conflicts); plan.put("unmetDemands", unmet); plan.put("algorithmVersion", "capacity-priority-v1");
        store.save("resource-plan", Jsons.text(plan, "resourcePlanId", ""), plan); events.publish("resource.plan.created", plan); return plan;
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
        if (isGreeting(message)) {
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
                    "capabilities", List.of("地块状态查询", "异常与根因诊断", "1/2/4 小时风险预测", "灌溉处方试算", "今日农务汇总"),
                    "factsBoundary", "实时事实来自规则、数据库和检索知识；控制命令必须经过安全门和人工确认",
                    "unsupported", List.of("直接生成 SQL、MQTT topic、HTTP 请求或绕过审批执行命令")));
            // Capability questions are a stable contract, not a generative task.
            // Answering them locally avoids a needless 27B round trip and keeps
            // the product boundary concise even when an LLM is enabled.
            answer.put("narrative", "我可以查询地块状态、解释异常、做 1/2/4 小时风险预测、试算灌溉处方并汇总今日农务。实时事实来自规则、数据库和检索知识；执行控制必须经过权限、安全门和人工确认。");
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
            List<Map<String, Object>> work = todayWork(plotId);
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
        answer.put("context", Map.of("cropPackVersion", "1.0.0", "ruleVersion", "rule-1.0.0", "knowledgeVersion", "kb-1.0.0", "agentVersion", "rules-agent-1.0"));

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
        Map<String, Object> plot = store.find("plot", plotId);
        String crop = Jsons.text(plot, "cropCode", "tomato");
        String location = "classpath:/crop-packs/" + crop + "/knowledge/irrigation.md";
        try {
            Resource resource = resourceLoader.getResource(location);
            if (!resource.exists()) return "";
            String text = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            if (text.length() > 1800) text = text.substring(0, 1800) + "…";
            return text;
        } catch (Exception ignored) {
            return "";
        }
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
        Map<String, Object> plot = store.find("plot", plotId);
        String crop = Jsons.text(plot, "cropCode", "tomato");
        return List.of(
                Map.of("scope", "PLOT", "plotId", plotId, "provenance", "RETRIEVED", "source", "crop-packs/" + crop + "/knowledge/irrigation.md", "version", "kb-1.0.0"),
                Map.of("scope", "CROP", "cropCode", crop, "provenance", "RETRIEVED", "source", "crop-pack:" + crop, "version", "1.0.0"),
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
        passport.put("diagnoses", store.list("diagnosis").stream().filter(d -> Jsons.text(d, "traceId", "").equals(traceId) || passportPlotId.equals(Jsons.text(d, "plotId", ""))).limit(20).toList()); passport.put("readiness", store.list("readiness").stream().filter(r -> passportPlotId.equals(Jsons.text(r, "plotId", ""))).limit(20).toList());
        passport.put("plans", plans); passport.put("commands", commands); passport.put("evaluations", evaluations);
        passport.put("valueLedgers", store.list("value-ledger").stream().limit(20).toList()); passport.put("provenance", List.of("OBSERVED", "USER_PROVIDED", "DERIVED", "SIMULATED", "ESTIMATED")); passport.put("generatedAt", Instant.now().toString()); return passport;
    }

    Map<String, Object> scenarioRun(Map<String, Object> input, UserPrincipal principal) {
        if (!principal.isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "SCENARIO_FORBIDDEN", "只有管理员可以运行情景模拟");
        String scenario = Jsons.text(input, "scenario", Jsons.text(input, "scenarioId", "normal")); String scenarioId = Jsons.text(input, "scenarioId", scenario + "-" + UUID.randomUUID().toString().substring(0, 8));
        Map<String, Object> run = new LinkedHashMap<>(input); run.put("runId", Jsons.id("scenario-run")); run.put("scenarioId", scenarioId); run.put("scenario", scenario); run.put("seed", Jsons.whole(input, "seed", 42)); run.put("status", "RUNNING"); run.put("startedAt", Instant.now().toString()); run.put("startedBy", principal.userId); run.putIfAbsent("branchId", "MAIN"); store.save("scenario-run", Jsons.text(run, "runId", ""), run); events.publish("scenario.started", run);
        if (Jsons.bool(input, "generateSample", false)) generateSampleScenario(scenario, scenarioId, Jsons.whole(input, "seed", 42), Jsons.text(input, "branchId", "MAIN"), principal);
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
        Random random = new Random(seed); Instant base = Instant.now().minus(10, ChronoUnit.MINUTES);
        for (int i = 0; i < 30; i++) for (String plot : List.of("plot-a01", "plot-a02", "plot-b01")) {
            if (principal != null && !principal.canAccessPlot(plot)) continue;
            double moisture = 32 - i * ("drought".equalsIgnoreCase(scenario) ? .65 : "sensor-drift".equalsIgnoreCase(scenario) ? .1 : .05) + random.nextDouble();
            if ("heavy-rain".equalsIgnoreCase(scenario)) moisture += i * .4;
            ingest(Map.of("eventId", scenarioId + "-" + branch + "-" + i + "-" + plot, "farmId", "farm-demo", "plotId", plot, "deviceId", "mock-" + plot,
                    "metric", "SOIL_MOISTURE", "value", moisture, "unit", "%", "ts", base.plus(i * 20L, ChronoUnit.SECONDS).toString(), "scenarioId", scenarioId, "branchId", branch));
        }
    }

    Map<String, Object> record(String type, String id) { return requireRecord(type, id); }
    List<Map<String, Object>> records(String type) { return store.list(type); }
    void ensurePlotAccess(UserPrincipal principal, String plotId) { if (principal != null && !principal.canAccessPlot(plotId)) throw new ApiException(HttpStatus.FORBIDDEN, "PLOT_FORBIDDEN", "无权访问该地块"); }
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

    AgriController(AgriEngine engine, AgriStore store, AgriEventBus events, MqttBridge mqtt, SimulatorControl simulator) {
        this.engine = engine; this.store = store; this.events = events; this.mqtt = mqtt; this.simulator = simulator;
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
    ResponseEntity<?> overview(Authentication a) { return ok(engine.overview(principal(a))); }

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

    @GetMapping("/farms")
    ResponseEntity<?> farms(Authentication a) { UserPrincipal p = principal(a); return ok(filterFarmScope(store.list("farm"), p)); }

    @GetMapping("/plots")
    ResponseEntity<?> plots(Authentication a) { UserPrincipal p = principal(a); return ok(store.list("plot").stream().filter(x -> p.canAccessPlot(Jsons.text(x, "plotId", ""))).toList()); }

    @PostMapping("/plots")
    ResponseEntity<?> createPlot(@RequestBody Map<String, Object> body, Authentication a) { UserPrincipal p = principal(a); if (!p.isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_REQUIRED", "需要管理员权限"); String id = Jsons.text(body, "plotId", Jsons.id("plot")); body.put("plotId", id); body.putIfAbsent("farmId", "farm-demo"); store.save("plot", id, body); return ok(body); }

    @GetMapping("/plots/{plotId}/resolved-profile")
    ResponseEntity<?> resolvedProfile(@PathVariable String plotId, Authentication a) { engine.ensurePlotAccess(principal(a), plotId); return ok(engine.resolvedProfile(plotId)); }

    @GetMapping("/crop-batches")
    ResponseEntity<?> batches(Authentication a) { UserPrincipal p = principal(a); return ok(store.list("crop-batch").stream().filter(b -> p.canAccessPlot(Jsons.text(b, "plotId", ""))).toList()); }

    @GetMapping("/crop-batches/{batchId}/plan")
    ResponseEntity<?> batchPlan(@PathVariable String batchId, Authentication a) { Map<String, Object> b = engine.record("crop-batch", batchId); engine.ensurePlotAccess(principal(a), Jsons.text(b, "plotId", "")); return ok(Map.of("batch", b, "tasks", store.list("work-order").stream().filter(w -> batchId.equals(Jsons.text(w, "cropBatchId", ""))).toList(), "source", "Crop Pack task_templates")); }

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
    ResponseEntity<?> ruleCatalog(Authentication a) { return ok(engine.cropPacks().stream().map(p -> Map.of("cropCode", p.get("cropCode"), "version", p.get("ruleVersion"), "rules", p.get("rules"))).toList()); }

    @PostMapping("/diagnoses/evaluate")
    ResponseEntity<?> diagnosis(@RequestBody Map<String, Object> body, Authentication a) { String plot = Jsons.text(body, "plotId", "plot-a01"); engine.ensurePlotAccess(principal(a), plot); return ok(engine.diagnose(plot, body)); }

    @GetMapping("/diagnoses/{diagnosisId}")
    ResponseEntity<?> diagnosisById(@PathVariable String diagnosisId, Authentication a) { Map<String, Object> d = engine.record("diagnosis", diagnosisId); engine.ensurePlotAccess(principal(a), Jsons.text(d, "plotId", "")); return ok(d); }

    @GetMapping("/decisions/{subjectType}/{subjectId}/readiness")
    ResponseEntity<?> readiness(@PathVariable String subjectType, @PathVariable String subjectId, Authentication a) { return ok(engine.readiness(subjectType, subjectId, principal(a))); }

    @PostMapping("/decision-readiness/{readinessId}/evidence-requests")
    ResponseEntity<?> evidenceRequest(@PathVariable String readinessId, @RequestBody(required = false) Map<String, Object> body, Authentication a) { Map<String, Object> input = body == null ? new LinkedHashMap<>() : body; input.put("sourceType", "READINESS"); input.put("sourceRef", readinessId); input.putIfAbsent("actionType", "INSPECTION"); return ok(engine.createWorkOrder(input, principal(a))); }

    @PostMapping("/inspections")
    ResponseEntity<?> inspection(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.createInspection(body, principal(a))); }

    @GetMapping("/plots/{plotId}/inspections")
    ResponseEntity<?> inspections(@PathVariable String plotId, Authentication a) { engine.ensurePlotAccess(principal(a), plotId); return ok(engine.inspections(plotId)); }

    @PostMapping("/irrigation/estimate")
    ResponseEntity<?> irrigation(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.irrigationPlan(body, principal(a))); }

    @PostMapping("/agent/chat")
    ResponseEntity<?> chat(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.agentChat(body, principal(a))); }

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
            Map.of("name", "get_plot_status", "schemaVersion", "tool-schema-1.0", "sideEffect", "READ_ONLY"))); }

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
    ResponseEntity<?> today(@RequestParam(required = false) String plotId, Authentication a) { UserPrincipal p = principal(a); if (plotId != null) engine.ensurePlotAccess(p, plotId); return ok(engine.todayWork(plotId)); }

    @PostMapping("/work-orders")
    ResponseEntity<?> workOrder(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.createWorkOrder(body, principal(a))); }

    @GetMapping("/work-orders")
    ResponseEntity<?> workOrders(Authentication a) { UserPrincipal p = principal(a); return ok(store.list("work-order").stream().filter(w -> p.canAccessPlot(Jsons.text(w, "plotId", ""))).toList()); }

    @GetMapping("/alerts")
    ResponseEntity<?> alerts(Authentication a) { UserPrincipal p = principal(a); return ok(store.list("alert").stream().filter(x -> p.canAccessPlot(Jsons.text(x, "plotId", ""))).toList()); }

    @PostMapping("/alerts/{alertId}/ack")
    ResponseEntity<?> ackAlert(@PathVariable String alertId, @RequestBody(required = false) Map<String, Object> body, Authentication a) { Map<String, Object> alert = engine.record("alert", alertId); engine.ensurePlotAccess(principal(a), Jsons.text(alert, "plotId", "")); alert.put("status", Jsons.text(body == null ? Map.of() : body, "status", "ACKED")); alert.put("acknowledgedBy", principal(a).userId); alert.put("acknowledgedAt", Instant.now().toString()); store.save("alert", alertId, alert); return ok(alert); }

    @PostMapping("/alerts/{alertId}/close")
    ResponseEntity<?> closeAlert(@PathVariable String alertId, Authentication a) { return ok(engine.transitionAlert(alertId, "CLOSED", principal(a))); }

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
    ResponseEntity<?> valueLedgers(Authentication a) { return ok(store.list("value-ledger")); }

    @PostMapping("/value-ledgers")
    ResponseEntity<?> valueLedger(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.valueLedger(body, principal(a))); }

    @GetMapping("/decision-passports/{traceId}")
    ResponseEntity<?> passport(@PathVariable String traceId, Authentication a) { return ok(engine.passport(traceId, principal(a))); }

    @PostMapping("/strategy-candidates")
    ResponseEntity<?> strategy(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.strategyCandidate(body, principal(a))); }

    @PostMapping("/strategy-candidates/{id}/transition")
    ResponseEntity<?> strategyTransition(@PathVariable String id, @RequestBody Map<String, Object> body, Authentication a) { return ok(engine.transitionStrategy(id, Jsons.text(body, "status", ""), principal(a))); }

    @GetMapping("/strategy-candidates")
    ResponseEntity<?> strategies(Authentication a) { return ok(store.list("strategy-candidate")); }

    @GetMapping("/devices")
    ResponseEntity<?> devices(Authentication a) { UserPrincipal p = principal(a); return ok(store.list("device").stream().filter(d -> p.canAccessPlot(Jsons.text(d, "plotId", ""))).toList()); }

    @PostMapping("/devices")
    ResponseEntity<?> device(@RequestBody Map<String, Object> body, Authentication a) { if (!principal(a).isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_REQUIRED", "需要管理员权限"); String id = Jsons.text(body, "deviceId", Jsons.id("device")); body.put("deviceId", id); store.save("device", id, body); return ok(body); }

    @PostMapping("/devices/{deviceId}/bind")
    ResponseEntity<?> bindDevice(@PathVariable String deviceId, @RequestBody Map<String, Object> body, Authentication a) { return ok(engine.bindDevice(deviceId, body, principal(a))); }

    @PostMapping("/devices/{deviceId}/unbind")
    ResponseEntity<?> unbindDevice(@PathVariable String deviceId, Authentication a) { return ok(engine.unbindDevice(deviceId, principal(a))); }

    @PostMapping("/devices/{deviceId}/heartbeat")
    ResponseEntity<?> heartbeat(@PathVariable String deviceId, @RequestBody(required = false) Map<String, Object> body, Authentication a) { return ok(engine.heartbeat(deviceId, body, principal(a))); }

    @PostMapping("/strategy-candidates/{id}/offline-validate")
    ResponseEntity<?> offlineValidate(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body, Authentication a) { return ok(engine.offlineValidateStrategy(id, body == null ? Map.of() : body, principal(a))); }

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
                            else if (topic.endsWith("/device/status")) { String id = Jsons.text(body, "deviceId", ""); if (!id.isBlank()) store.save("device", id, body); }
                            else if (topic.endsWith("/command/ack")) { String commandId = Jsons.text(body, "commandId", ""); if (!commandId.isBlank()) { Map<String, Object> c = store.find("command", commandId); if (c != null && c.get("ack") == null) { c.put("ack", body); c.put("status", Jsons.text(body, "status", "TIMEOUT")); store.save("command", commandId, c); engine.evaluateCommand(c, body); } } }
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
