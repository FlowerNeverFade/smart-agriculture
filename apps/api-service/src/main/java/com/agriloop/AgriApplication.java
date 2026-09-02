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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.TransactionTemplate;
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
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BinaryOperator;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import java.util.stream.Stream;
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
    /** Optional base multimodal model used when a chat turn contains images. */
    private String llmVisionModel = "Qwen3.8-27B";
    private String llmApiKey = "";
    private long llmTimeoutMs = 30000;
    private int llmMaxTokens = 768;
    /** Short private reasoning is enabled by default; callers fall back on timeout. */
    private boolean llmEnableThinking = true;
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
    /** Shared server-side code required whenever a SYSTEM_ADMIN account is created. */
    private String systemAdminAuthorizationCode = "";
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
    private boolean simulatorAutoStart = true;
    private String supervisorConfig = "/srv/agriloop/supervisor.conf";
    private String simulatorProgram = "agriloop-simulator";
    /** Shared JSON hand-off reloaded by the in-process simulation engine while it runs. */
    private String simulationConfigPath = "data/plot-simulation.json";
    /** Local directory for USER_PROVIDED inspection photos; not object storage. */
    private String attachmentDir = "data/attachments";
    /** Daily wholesale-price provider used by the farm-admin market workspace. */
    private boolean marketPriceEnabled = true;
    private String marketPriceBaseUrl = "https://pfsc.agri.cn";
    private String marketPriceProvinceCode = "500000";
    private String marketPriceProvinceName = "重庆市";
    private String marketPricePreferredMarket = "重庆双福国际农贸城";
    /** The provider publishes this browser-side protocol key; deployments may override it when the upstream rotates. */
    private String marketPriceAesKey = "7s9K$pG2xQ8zR5mB7vA3sD9fH2jW40cV";
    private long marketPriceTimeoutMs = 8000;
    private long marketPriceCacheMinutes = 30;

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public String getAiMode() { return aiMode; }
    public void setAiMode(String aiMode) { this.aiMode = aiMode; }
    public String getLlmBaseUrl() { return llmBaseUrl; }
    public void setLlmBaseUrl(String llmBaseUrl) { this.llmBaseUrl = llmBaseUrl; }
    public String getLlmModel() { return llmModel; }
    public void setLlmModel(String llmModel) { this.llmModel = llmModel; }
    public String getLlmVisionModel() { return llmVisionModel; }
    public void setLlmVisionModel(String llmVisionModel) { this.llmVisionModel = llmVisionModel; }
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
    public String getSystemAdminAuthorizationCode() { return systemAdminAuthorizationCode; }
    public void setSystemAdminAuthorizationCode(String systemAdminAuthorizationCode) { this.systemAdminAuthorizationCode = systemAdminAuthorizationCode; }
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
    public boolean isSimulatorAutoStart() { return simulatorAutoStart; }
    public void setSimulatorAutoStart(boolean simulatorAutoStart) { this.simulatorAutoStart = simulatorAutoStart; }
    public String getSupervisorConfig() { return supervisorConfig; }
    public void setSupervisorConfig(String supervisorConfig) { this.supervisorConfig = supervisorConfig; }
    public String getSimulatorProgram() { return simulatorProgram; }
    public void setSimulatorProgram(String simulatorProgram) { this.simulatorProgram = simulatorProgram; }
    public String getSimulationConfigPath() { return simulationConfigPath; }
    public void setSimulationConfigPath(String simulationConfigPath) { this.simulationConfigPath = simulationConfigPath; }
    public String getAttachmentDir() { return attachmentDir; }
    public void setAttachmentDir(String attachmentDir) { this.attachmentDir = attachmentDir; }
    public boolean isMarketPriceEnabled() { return marketPriceEnabled; }
    public void setMarketPriceEnabled(boolean marketPriceEnabled) { this.marketPriceEnabled = marketPriceEnabled; }
    public String getMarketPriceBaseUrl() { return marketPriceBaseUrl; }
    public void setMarketPriceBaseUrl(String marketPriceBaseUrl) { this.marketPriceBaseUrl = marketPriceBaseUrl; }
    public String getMarketPriceProvinceCode() { return marketPriceProvinceCode; }
    public void setMarketPriceProvinceCode(String marketPriceProvinceCode) { this.marketPriceProvinceCode = marketPriceProvinceCode; }
    public String getMarketPriceProvinceName() { return marketPriceProvinceName; }
    public void setMarketPriceProvinceName(String marketPriceProvinceName) { this.marketPriceProvinceName = marketPriceProvinceName; }
    public String getMarketPricePreferredMarket() { return marketPricePreferredMarket; }
    public void setMarketPricePreferredMarket(String marketPricePreferredMarket) { this.marketPricePreferredMarket = marketPricePreferredMarket; }
    public String getMarketPriceAesKey() { return marketPriceAesKey; }
    public void setMarketPriceAesKey(String marketPriceAesKey) { this.marketPriceAesKey = marketPriceAesKey; }
    public long getMarketPriceTimeoutMs() { return marketPriceTimeoutMs; }
    public void setMarketPriceTimeoutMs(long marketPriceTimeoutMs) { this.marketPriceTimeoutMs = marketPriceTimeoutMs; }
    public long getMarketPriceCacheMinutes() { return marketPriceCacheMinutes; }
    public void setMarketPriceCacheMinutes(long marketPriceCacheMinutes) { this.marketPriceCacheMinutes = marketPriceCacheMinutes; }
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
    private static final int IN_MEMORY_TELEMETRY_LIMIT = 20_000;
    private static final long LIST_CACHE_TTL_MS = 1_000L;
    private static final long REAL_LOOKUP_CACHE_TTL_MS = 5_000L;
    private static final Map<String, Integer> ENTITY_CACHE_LIMITS = Map.of(
            "forecast", 1_000,
            "diagnosis", 1_000,
            "readiness", 1_000,
            "irrigation-plan", 1_000,
            "evaluation", 1_000,
            "scenario-run", 1_000,
            "market-price-snapshot", 5_000
    );
    private final ObjectMapper mapper;
    private final JdbcTemplate jdbc;
    private final AgriProperties properties;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate transactionTemplate;
    private final Map<String, Map<String, Map<String, Object>>> records = new ConcurrentHashMap<>();
    private final Map<String, Long> listLoadedAt = new ConcurrentHashMap<>();
    private final Set<String> loadedTypes = ConcurrentHashMap.newKeySet();
    private final Map<String, Map<String, Object>> users = new ConcurrentHashMap<>();
    /**
     * Emergency read model used only when the database is unavailable. In
     * database mode PostgreSQL is already the authoritative indexed store, so
     * mirroring every sample here would make every append copy an ever-growing
     * array and eventually consume tens of gigabytes of temporary heap.
     */
    private final Deque<Map<String, Object>> telemetry = new ConcurrentLinkedDeque<>();
    private final Set<String> eventIds = ConcurrentHashMap.newKeySet();
    private final AtomicLong telemetryCacheSize = new AtomicLong();
    private final Map<String, Map<String, Object>> latestRealTelemetry = new ConcurrentHashMap<>();
    private final Map<String, Long> realLookupAt = new ConcurrentHashMap<>();
    private final AtomicLong eventCount = new AtomicLong();
    private volatile boolean databaseReady;
    private volatile boolean postgres;

    AgriStore(ObjectMapper mapper, JdbcTemplate jdbc, AgriProperties properties, PasswordEncoder passwordEncoder,
              PlatformTransactionManager transactionManager) {
        this.mapper = mapper;
        this.jdbc = jdbc;
        this.properties = properties;
        this.passwordEncoder = passwordEncoder;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
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

    private void cacheRecord(String type, String id, Map<String, Object> value) {
        Map<String, Map<String, Object>> byType = records.computeIfAbsent(type, ignored -> new ConcurrentHashMap<>());
        byType.put(id, value);
        int limit = ENTITY_CACHE_LIMITS.getOrDefault(type, Integer.MAX_VALUE);
        if (byType.size() <= limit) return;
        for (String candidate : byType.keySet()) {
            if (byType.size() <= limit) break;
            if (!id.equals(candidate)) byType.remove(candidate);
        }
    }

    private void invalidateListCache(String type) {
        listLoadedAt.remove(type);
        loadedTypes.remove(type);
    }

    private boolean addFallbackTelemetry(String eventId, Map<String, Object> event) {
        if (!eventIds.add(eventId)) return false;
        telemetry.addLast(event);
        long size = telemetryCacheSize.incrementAndGet();
        while (size > IN_MEMORY_TELEMETRY_LIMIT) {
            Map<String, Object> removed = telemetry.pollFirst();
            if (removed == null) break;
            telemetryCacheSize.decrementAndGet();
            eventIds.remove(Jsons.text(removed, "eventId", ""));
            size = telemetryCacheSize.get();
        }
        eventCount.incrementAndGet();
        return true;
    }

    synchronized void save(String type, String id, Map<String, Object> value) {
        Map<String, Object> copy = Jsons.copy(mapper, value);
        cacheRecord(type, id, copy);
        invalidateListCache(type);
        if (!databaseReady) return;
        try {
            persistEntity(type, id, copy);
        } catch (DataAccessException ignored) {
            databaseReady = false;
        }
    }

    synchronized void saveDurably(String type, String id, Map<String, Object> value) {
        saveDurably(type, id, value, "RESOURCE_PERSISTENCE_UNAVAILABLE", "资源协同数据库不可用，当前仅可查看", "资源协同数据库不可用，写入未保存");
    }

    synchronized void saveDurably(String type, String id, Map<String, Object> value,
                                  String errorCode, String errorMessage) {
        saveDurably(type, id, value, errorCode, errorMessage, errorMessage);
    }

    synchronized void saveDurably(String type, String id, Map<String, Object> value,
                                  String errorCode, String unavailableMessage, String failureMessage) {
        if (!databaseReady) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, errorCode, unavailableMessage);
        }
        Map<String, Object> copy = Jsons.copy(mapper, value);
        try {
            // Persist first so a failed collaborative write never appears in
            // the shared in-memory read model or emits a false success event.
            persistEntity(type, id, copy);
            cacheRecord(type, id, copy);
            invalidateListCache(type);
        } catch (DataAccessException error) {
            databaseReady = false;
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, errorCode, failureMessage);
        }
    }

    private void persistEntity(String type, String id, Map<String, Object> copy) {
        if (postgres) {
            jdbc.update("INSERT INTO entity_record(entity_type,entity_id,payload) VALUES (?,?,?) " +
                            "ON CONFLICT(entity_type,entity_id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=CURRENT_TIMESTAMP",
                    type, id, Jsons.json(mapper, copy));
        } else {
            jdbc.update("MERGE INTO entity_record(entity_type,entity_id,payload,created_at,updated_at) " +
                            "KEY(entity_type,entity_id) VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
                    type, id, Jsons.json(mapper, copy));
        }
    }

    synchronized boolean delete(String type, String id) {
        Map<String, Map<String, Object>> byType = records.get(type);
        boolean removed = byType != null && byType.remove(id) != null;
        invalidateListCache(type);
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
            cacheRecord(type, id, value);
            return Jsons.copy(mapper, value);
        } catch (Exception ignored) { return null; }
    }

    List<Map<String, Object>> list(String type) {
        Map<String, Map<String, Object>> byType = records.getOrDefault(type, Map.of());
        List<Map<String, Object>> result = byType.values().stream().map(v -> Jsons.copy(mapper, v)).collect(Collectors.toCollection(ArrayList::new));
        if (databaseReady) {
            long now = System.currentTimeMillis();
            Long loaded = listLoadedAt.get(type);
            if (loadedTypes.contains(type) && loaded != null && now - loaded < LIST_CACHE_TTL_MS) return result;
            try {
                int readLimit = ENTITY_CACHE_LIMITS.getOrDefault(type, 0);
                String sql = "SELECT entity_id,payload FROM entity_record WHERE entity_type=? ORDER BY updated_at DESC"
                        + (readLimit > 0 ? " LIMIT " + readLimit : "");
                List<Map<String, Object>> persisted = jdbc.query(sql,
                        (rs, rowNum) -> {
                            try {
                                Map<String, Object> value = mapper.readValue(rs.getString("payload"), Map.class);
                                cacheRecord(type, rs.getString("entity_id"), value);
                                return value;
                            } catch (Exception e) { return Map.<String, Object>of(); }
                }, type);
                if (!persisted.isEmpty()) result = persisted;
                loadedTypes.add(type);
                listLoadedAt.put(type, now);
            } catch (DataAccessException ignored) { databaseReady = false; }
        }
        return result;
    }

    /** timeline 专用：按地块取最近 limit 条，避免对全量历史做深拷贝（200 万级事件场景）。 */
    List<Map<String, Object>> timelineForPlot(String type, String plotId, int limit) {
        java.util.Comparator<Map<String, Object>> newest = java.util.Comparator.comparing(
                (Map<String, Object> x) -> Jsons.text(x, "createdAt", Jsons.text(x, "evaluatedAt", "")), Comparator.reverseOrder());
        List<Map<String, Object>> result = records.getOrDefault(type, Map.of()).values().stream()
                .filter(v -> plotId.equals(Jsons.text(v, "plotId", "")))
                .sorted(newest)
                .limit(limit)
                .map(v -> Jsons.copy(mapper, v))
                .collect(Collectors.toCollection(ArrayList::new));
        if (databaseReady && result.size() < limit) {
            try {
                int need = limit - result.size();
                String sql = "SELECT entity_id,payload FROM entity_record WHERE entity_type=? AND payload->>'plotId'=? ORDER BY updated_at DESC LIMIT " + Math.max(1, need);
                List<Map<String, Object>> persisted = jdbc.query(sql,
                        (rs, rowNum) -> {
                            try { return mapper.readValue(rs.getString("payload"), Map.class); }
                            catch (Exception e) { return Map.<String, Object>of(); }
                        }, type, plotId);
                for (Map<String, Object> v : persisted) {
                    if (v.isEmpty()) continue;
                    String key = Jsons.text(v, "createdAt", "");
                    boolean duplicate = false;
                    for (Map<String, Object> existing : result) {
                        if (Jsons.text(existing, "createdAt", "").equals(key)) { duplicate = true; break; }
                    }
                    if (!duplicate) result.add(v);
                }
                result.sort(newest);
                if (result.size() > limit) result = new ArrayList<>(result.subList(0, limit));
            } catch (DataAccessException ignored) { /* 内存结果可用 */ }
        }
        return result;
    }

    boolean saveTelemetry(Map<String, Object> event) {
        String eventId = Jsons.text(event, "eventId", Jsons.id("evt"));
        Map<String, Object> copy = Jsons.copy(mapper, event);
        copy.put("eventId", eventId);
        String sourceMode = Jsons.text(copy, "sourceMode", "SIMULATION").toUpperCase(Locale.ROOT);
        String realCacheKey = Jsons.text(copy, "plotId", "") + "|" + Jsons.text(copy, "metric", "").toUpperCase(Locale.ROOT);
        if (!databaseReady) {
            boolean inserted = addFallbackTelemetry(eventId, copy);
            if (inserted && "REAL".equals(sourceMode)) latestRealTelemetry.put(realCacheKey, copy);
            return inserted;
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
            boolean inserted = addFallbackTelemetry(eventId, copy);
            if (inserted && "REAL".equals(sourceMode)) latestRealTelemetry.put(realCacheKey, copy);
            return inserted;
        }
        // PostgreSQL is the indexed read model in database mode. Keeping a
        // second unbounded Java copy made inserts and reads progressively
        // slower because the previous CopyOnWriteArrayList copied its entire
        // backing array for every simulator sample.
        if ("REAL".equals(sourceMode)) latestRealTelemetry.put(realCacheKey, copy);
        eventCount.incrementAndGet();
        return true;
    }

    private Map<String, Object> readTelemetryRow(ResultSet rs) throws java.sql.SQLException {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", rs.getString("event_id")); event.put("farmId", rs.getString("farm_id"));
        event.put("plotId", rs.getString("plot_id")); event.put("deviceId", rs.getString("device_id"));
        event.put("metric", rs.getString("metric")); event.put("value", rs.getDouble("metric_value")); event.put("unit", rs.getString("unit"));
        event.put("ts", rs.getTimestamp("event_ts").toInstant().toString());
        event.put("quality", Jsons.parseMap(mapper, rs.getString("quality_json")));
        event.put("scenarioId", rs.getString("scenario_id")); event.put("scenario", rs.getString("scenario_id")); event.put("branchId", rs.getString("branch_id"));
        event.put("sourceMode", rs.getString("source_mode")); event.put("provenance", rs.getString("provenance")); event.put("dataOrigin", rs.getString("data_origin"));
        return event;
    }

    private List<Map<String, Object>> telemetryFromMemory(String plotId, String metric, Instant from, Instant to, int limit) {
        Predicate<Map<String, Object>> filter = event -> (plotId == null || plotId.equals(Jsons.text(event, "plotId", "")))
                && (metric == null || metric.equalsIgnoreCase(Jsons.text(event, "metric", "")))
                && !Jsons.instant(event.get("ts"), Instant.EPOCH).isBefore(from)
                && !Jsons.instant(event.get("ts"), Instant.MAX).isAfter(to);
        Comparator<Map<String, Object>> byTimestamp = Comparator
                .comparing((Map<String, Object> event) -> Jsons.instant(event.get("ts"), Instant.EPOCH))
                .thenComparing(event -> Jsons.text(event, "eventId", ""));
        return telemetry.stream().filter(filter)
                .sorted(byTimestamp.reversed()).limit(limit).sorted(byTimestamp)
                .map(event -> Jsons.copy(mapper, event)).collect(Collectors.toCollection(ArrayList::new));
    }

    List<Map<String, Object>> telemetry(String plotId, String metric, Instant from, Instant to, int limit) {
        int cappedLimit = Math.max(1, Math.min(limit, 10000));
        if (!databaseReady) return telemetryFromMemory(plotId, metric, from, to, cappedLimit);
        try {
            StringBuilder sql = new StringBuilder("SELECT event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,quality_status,quality_json,scenario_id,branch_id,source_mode,provenance,data_origin FROM telemetry WHERE 1=1");
            List<Object> args = new ArrayList<>();
            if (plotId != null) { sql.append(" AND plot_id=?"); args.add(plotId); }
            if (metric != null) { sql.append(" AND metric=?"); args.add(metric); }
            sql.append(" AND event_ts>=? AND event_ts<=? ORDER BY event_ts DESC, event_id DESC LIMIT ").append(cappedLimit);
            args.add(TimestampParser.sql(from)); args.add(TimestampParser.sql(to));
            List<Map<String, Object>> rows = jdbc.query(sql.toString(), (rs, rowNum) -> readTelemetryRow(rs), args.toArray());
            Collections.reverse(rows);
            return rows;
        } catch (Exception ignored) {
            databaseReady = false;
            return telemetryFromMemory(plotId, metric, from, to, cappedLimit);
        }
    }

    Map<String, Object> latestTelemetry(String plotId, String metric, Instant from, Instant to) {
        if (!databaseReady) {
            List<Map<String, Object>> rows = telemetryFromMemory(plotId, metric, from, to, 1);
            return rows.isEmpty() ? null : rows.get(0);
        }
        try {
            StringBuilder sql = new StringBuilder("SELECT event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,quality_status,quality_json,scenario_id,branch_id,source_mode,provenance,data_origin FROM telemetry WHERE 1=1");
            List<Object> args = new ArrayList<>();
            if (plotId != null) { sql.append(" AND plot_id=?"); args.add(plotId); }
            if (metric != null) { sql.append(" AND metric=?"); args.add(metric); }
            sql.append(" AND event_ts>=? AND event_ts<=? ORDER BY event_ts DESC LIMIT 1");
            args.add(TimestampParser.sql(from)); args.add(TimestampParser.sql(to));
            List<Map<String, Object>> rows = jdbc.query(sql.toString(), (rs, rowNum) -> readTelemetryRow(rs), args.toArray());
            return rows.isEmpty() ? null : rows.get(0);
        } catch (Exception ignored) {
            databaseReady = false;
            List<Map<String, Object>> rows = telemetryFromMemory(plotId, metric, from, to, 1);
            return rows.isEmpty() ? null : rows.get(0);
        }
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
        String cacheKey = String.valueOf(plotId) + "|" + String.valueOf(metric).toUpperCase(Locale.ROOT);
        Map<String, Object> cached = latestRealTelemetry.get(cacheKey);
        if (cached != null && filter.test(cached)) return Jsons.copy(mapper, cached);
        long nowMillis = System.currentTimeMillis();
        Long lastLookup = realLookupAt.get(cacheKey);
        if (lastLookup != null && nowMillis - lastLookup < REAL_LOOKUP_CACHE_TTL_MS) return null;
        realLookupAt.put(cacheKey, nowMillis);
        if (!databaseReady) return telemetry.stream().filter(filter)
                .max(Comparator.comparing(e -> Jsons.instant(e.get("ts"), Instant.EPOCH)))
                .map(e -> Jsons.copy(mapper, e)).orElse(null);
        try {
            StringBuilder sql = new StringBuilder("SELECT event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,quality_status,quality_json,scenario_id,branch_id,source_mode,provenance,data_origin FROM telemetry WHERE source_mode='REAL'");
            List<Object> args = new ArrayList<>();
            if (plotId != null) { sql.append(" AND plot_id=?"); args.add(plotId); }
            if (metric != null) { sql.append(" AND metric=?"); args.add(metric); }
            sql.append(" AND event_ts>=? AND event_ts<=? ORDER BY event_ts DESC LIMIT 1");
            args.add(TimestampParser.sql(from)); args.add(TimestampParser.sql(to));
            List<Map<String, Object>> rows = jdbc.query(sql.toString(), (rs, rowNum) -> readTelemetryRow(rs), args.toArray());
            if (!rows.isEmpty()) latestRealTelemetry.put(cacheKey, rows.get(0));
            return rows.isEmpty() ? null : rows.get(0);
        } catch (Exception ignored) {
            databaseReady = false;
            return telemetry.stream().filter(filter)
                    .max(Comparator.comparing(e -> Jsons.instant(e.get("ts"), Instant.EPOCH)))
                    .map(e -> Jsons.copy(mapper, e)).orElse(null);
        }
    }

    /**
     * Fetch one latest sample per metric plus the 30-minute valid-sample
     * counts. PostgreSQL can answer this with indexed, compact result sets;
     * returning thousands of raw rows for every overview card made a
     * 20-plot dashboard needlessly parse hundreds of thousands of records.
     * A null result asks the engine to use the bounded in-memory fallback.
     */
    Map<String, Map<String, Object>> latestMetricWindow(String plotId, Instant latestFrom, Instant to,
                                                        Instant activeRealFrom, Instant qualityFrom) {
        if (!databaseReady || !postgres) return null;
        String columns = "event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,quality_status,quality_json,scenario_id,branch_id,source_mode,provenance,data_origin";
        try {
            List<Map<String, Object>> newest = jdbc.query(
                    "WITH metrics(metric) AS (VALUES "
                            + "('SOIL_MOISTURE'),('AIR_TEMPERATURE'),('AIR_HUMIDITY'),('LIGHT'),('CO2'),('PH'),"
                            + "('WATER_LEVEL'),('RAINFALL'),('NITROGEN'),('PHOSPHORUS'),('POTASSIUM')) "
                            + "SELECT t." + columns.replace(",", ",t.") + " FROM metrics m "
                            + "CROSS JOIN LATERAL (SELECT " + columns + " FROM telemetry "
                            + "WHERE plot_id=? AND metric=m.metric AND event_ts>=? AND event_ts<=? "
                            + "ORDER BY event_ts DESC,event_id DESC LIMIT 1) t",
                    (rs, rowNum) -> readTelemetryRow(rs), plotId, TimestampParser.sql(latestFrom), TimestampParser.sql(to));
            List<Map<String, Object>> activeReal = jdbc.query(
                    "WITH metrics(metric) AS (VALUES "
                            + "('SOIL_MOISTURE'),('AIR_TEMPERATURE'),('AIR_HUMIDITY'),('LIGHT'),('CO2'),('PH'),"
                            + "('WATER_LEVEL'),('RAINFALL'),('NITROGEN'),('PHOSPHORUS'),('POTASSIUM')) "
                            + "SELECT t." + columns.replace(",", ",t.") + " FROM metrics m "
                            + "CROSS JOIN LATERAL (SELECT " + columns + " FROM telemetry "
                            + "WHERE plot_id=? AND metric=m.metric AND source_mode='REAL' AND event_ts>=? AND event_ts<=? "
                            + "ORDER BY event_ts DESC,event_id DESC LIMIT 1) t",
                    (rs, rowNum) -> readTelemetryRow(rs), plotId, TimestampParser.sql(activeRealFrom), TimestampParser.sql(to));
            Map<String, Long> validCounts = new HashMap<>();
            List<Map.Entry<String, Long>> countRows = jdbc.query(
                    "WITH metrics(metric) AS (VALUES "
                            + "('SOIL_MOISTURE'),('AIR_TEMPERATURE'),('AIR_HUMIDITY'),('LIGHT'),('CO2'),('PH'),"
                            + "('WATER_LEVEL'),('RAINFALL'),('NITROGEN'),('PHOSPHORUS'),('POTASSIUM')) "
                            + "SELECT m.metric,COALESCE(window.valid_count,0) AS valid_count FROM metrics m "
                            + "LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE quality_status<>'BAD') AS valid_count "
                            + "FROM (SELECT quality_status FROM telemetry WHERE plot_id=? AND metric=m.metric "
                            + "AND event_ts>=? AND event_ts<=? ORDER BY event_ts DESC,event_id DESC LIMIT 120) recent) window ON TRUE",
                    (rs, rowNum) -> Map.entry(rs.getString("metric"), rs.getLong("valid_count")),
                    plotId, TimestampParser.sql(qualityFrom), TimestampParser.sql(to));
            countRows.forEach(entry -> validCounts.put(entry.getKey(), entry.getValue()));
            Map<String, Map<String, Object>> result = new LinkedHashMap<>();
            for (Map<String, Object> event : newest) result.put(Jsons.text(event, "metric", ""), event);
            // A fresh hardware reading is authoritative even when a simulator
            // sample arrives a few milliseconds later.
            for (Map<String, Object> event : activeReal) result.put(Jsons.text(event, "metric", ""), event);
            result.forEach((metric, event) -> event.put("_validSamples", validCounts.getOrDefault(metric, 0L)));
            return result;
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

    // 操作审计日志：最近 limit 条系统事件（event_log 表），按时间倒序
    List<Map<String, Object>> auditLogs(int limit) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (!databaseReady) return result;
        try {
            return jdbc.query("SELECT id, event_type, event_id, payload, created_at FROM event_log ORDER BY id DESC LIMIT ?",
                    (rs, rowNum) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", "evt-" + rs.getLong("id"));
                        m.put("action", rs.getString("event_type"));
                        m.put("eventId", rs.getString("event_id"));
                        m.put("payload", rs.getString("payload"));
                        m.put("time", rs.getTimestamp("created_at").toInstant().toString());
                        return m;
                    }, Math.max(1, Math.min(limit, 200)));
        } catch (DataAccessException ignored) { databaseReady = false; }
        return result;
    }

    Map<String, Object> userByUsername(String username) {
        String normalized = String.valueOf(username == null ? "" : username).trim().toLowerCase(Locale.ROOT);
        Map<String, Object> u = users.values().stream().filter(v -> normalized.equals(Jsons.text(v, "username", "").toLowerCase(Locale.ROOT))).findFirst().orElse(null);
        if (u != null) return Jsons.copy(mapper, u);
        if (!databaseReady) return null;
        try {
            Map<String, Object> persisted = jdbc.queryForObject("SELECT user_id,username,password_hash,role_code,farm_ids,plot_ids,enabled,recovery_code_hash,credential_version,created_at,updated_at FROM user_account WHERE LOWER(username)=?",
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
            Map<String, Object> persisted = jdbc.queryForObject("SELECT user_id,username,password_hash,role_code,farm_ids,plot_ids,enabled,recovery_code_hash,credential_version,created_at,updated_at FROM user_account WHERE user_id=?",
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
                    "SELECT user_id,username,password_hash,role_code,farm_ids,plot_ids,enabled,recovery_code_hash,credential_version,created_at,updated_at FROM user_account ORDER BY username",
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
        if (!databaseReady) return null;
        user.put("farmIds", new ArrayList<>(farmIds));
        user.put("plotIds", new ArrayList<>(plotIds));
        try {
            int updated = jdbc.update("UPDATE user_account SET farm_ids=?,plot_ids=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
                    String.join(",", Jsons.strings(user.get("farmIds"))),
                    String.join(",", Jsons.strings(user.get("plotIds"))), userId);
            if (updated != 1) return null;
        } catch (DataAccessException error) {
            databaseReady = false;
            return null;
        }
        user.put("updatedAt", Instant.now().toString());
        users.put(userId, Jsons.copy(mapper, user));
        return safeUser(Jsons.copy(mapper, user));
    }

    synchronized Map<String, Object> updateUserEnabled(String userId, boolean enabled, boolean rotateCredentials) {
        Map<String, Object> user = userById(userId);
        if (user == null) return null;
        if (!databaseReady) return null;
        user.put("enabled", enabled);
        if (rotateCredentials) {
            user.put("credentialVersion", (int) Jsons.whole(user, "credentialVersion", 1) + 1);
        }
        try {
            int updated = jdbc.update("UPDATE user_account SET enabled=?,credential_version=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
                    enabled, Jsons.whole(user, "credentialVersion", 1), userId);
            if (updated != 1) return null;
        } catch (DataAccessException error) {
            databaseReady = false;
            return null;
        }
        user.put("updatedAt", Instant.now().toString());
        users.put(userId, Jsons.copy(mapper, user));
        return Jsons.copy(mapper, user);
    }

    synchronized boolean deleteUserAccount(String userId) {
        Map<String, Object> user = userById(userId);
        if (user == null) return false;
        if (!databaseReady) return false;
        try {
            int deleted = jdbc.update("DELETE FROM user_account WHERE user_id=?", userId);
            if (deleted != 1) return false;
        } catch (DataAccessException error) {
            databaseReady = false;
            return false;
        }
        users.remove(userId);
        return true;
    }

    private Map<String, Object> userMap(ResultSet rs) throws java.sql.SQLException {
        Map<String, Object> u = new LinkedHashMap<>();
        u.put("userId", rs.getString("user_id")); u.put("username", rs.getString("username"));
        u.put("passwordHash", rs.getString("password_hash")); u.put("role", rs.getString("role_code"));
        u.put("farmIds", Jsons.strings(rs.getString("farm_ids"))); u.put("plotIds", Jsons.strings(rs.getString("plot_ids")));
        u.put("enabled", rs.getBoolean("enabled")); u.put("recoveryCodeHash", rs.getString("recovery_code_hash"));
        u.put("credentialVersion", rs.getInt("credential_version"));
        java.sql.Timestamp createdAt = rs.getTimestamp("created_at");
        java.sql.Timestamp updatedAt = rs.getTimestamp("updated_at");
        if (createdAt != null) u.put("createdAt", createdAt.toInstant().toString());
        if (updatedAt != null) u.put("updatedAt", updatedAt.toInstant().toString());
        return u;
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
        if (!databaseReady) return false;
        String id = Jsons.text(user, "userId", Jsons.id("usr"));
        user.put("userId", id); user.put("username", username); user.putIfAbsent("credentialVersion", 1);
        try {
            jdbc.update("INSERT INTO user_account(user_id,username,password_hash,role_code,farm_ids,plot_ids,enabled,recovery_code_hash,credential_version) VALUES (?,?,?,?,?,?,?,?,?)",
                    id, username, Jsons.text(user, "passwordHash", ""), Jsons.text(user, "role", "FARMER"),
                    String.join(",", Jsons.strings(user.get("farmIds"))), String.join(",", Jsons.strings(user.get("plotIds"))), Jsons.bool(user, "enabled", true),
                    Jsons.text(user, "recoveryCodeHash", ""), Jsons.whole(user, "credentialVersion", 1));
        } catch (DataAccessException error) {
            String message = String.valueOf(error.getMessage()).toLowerCase(Locale.ROOT);
            if (message.contains("unique") || message.contains("duplicate")) return false;
            databaseReady = false;
            return false;
        }
        Instant now = Instant.now();
        user.putIfAbsent("createdAt", now.toString());
        user.put("updatedAt", now.toString());
        users.put(id, Jsons.copy(mapper, user));
        return true;
    }

    synchronized void createUserWithFarmDurably(Map<String, Object> user, Map<String, Object> farm) {
        String username = Jsons.text(user, "username", "").trim().toLowerCase(Locale.ROOT);
        String userId = Jsons.text(user, "userId", Jsons.id("user"));
        String farmId = Jsons.text(farm, "farmId", "").trim();
        if (username.isBlank() || userByUsername(username) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该账号已存在");
        }
        if (farmId.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "FARM_PROFILE_INVALID", "无法生成农场编号");
        }
        if (!databaseReady) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_PERSISTENCE_UNAVAILABLE", "账号数据库当前不可用，暂时不能创建农场账号");
        }

        user.put("userId", userId);
        user.put("username", username);
        user.putIfAbsent("credentialVersion", 1);
        Map<String, Object> farmCopy = Jsons.copy(mapper, farm);
        try {
            transactionTemplate.executeWithoutResult(status -> {
                try {
                    jdbc.update("INSERT INTO user_account(user_id,username,password_hash,role_code,farm_ids,plot_ids,enabled,recovery_code_hash,credential_version) VALUES (?,?,?,?,?,?,?,?,?)",
                            userId, username, Jsons.text(user, "passwordHash", ""), Jsons.text(user, "role", "FARM_ADMIN"),
                            String.join(",", Jsons.strings(user.get("farmIds"))), String.join(",", Jsons.strings(user.get("plotIds"))), Jsons.bool(user, "enabled", true),
                            Jsons.text(user, "recoveryCodeHash", ""), Jsons.whole(user, "credentialVersion", 1));
                } catch (DataAccessException error) {
                    String message = String.valueOf(error.getMessage()).toLowerCase(Locale.ROOT);
                    if (message.contains("unique") || message.contains("duplicate") || message.contains("primary key")) {
                        throw new ApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该账号已存在");
                    }
                    databaseReady = false;
                    throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_PERSISTENCE_UNAVAILABLE", "账号数据库当前不可用，暂时不能创建农场账号");
                }
                try {
                    persistEntity("farm", farmId, farmCopy);
                } catch (DataAccessException error) {
                    databaseReady = false;
                    throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_PERSISTENCE_UNAVAILABLE", "农场资料写入失败，账号与农场均未创建");
                }
            });
        } catch (TransactionException error) {
            databaseReady = false;
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_PERSISTENCE_UNAVAILABLE", "农场资料写入失败，账号与农场均未创建");
        }

        Instant now = Instant.now();
        user.putIfAbsent("createdAt", now.toString());
        user.put("updatedAt", now.toString());
        invalidateListCache("farm");
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
        String[][] seedCases = {
                {"case-seed-001", "trace-seed-001", "plan-seed-001", "eval-seed-001", "plot-a01", "tomato", "WATER_DEFICIT", "0.85"},
                {"case-seed-002", "trace-seed-002", "plan-seed-002", "eval-seed-002", "plot-b01", "cucumber", "WATER_DEFICIT", "0.78"},
                {"case-seed-003", "trace-seed-003", "plan-seed-003", "eval-seed-003", "plot-a02", "tomato", "SENSOR_DRIFT", "0.72"}
        };
        for (String[] c : seedCases) {
            Map<String, Object> caseRecord = new LinkedHashMap<>();
            caseRecord.put("caseId", c[0]); caseRecord.put("traceId", c[1]); caseRecord.put("planId", c[2]);
            caseRecord.put("evaluationId", c[3]); caseRecord.put("plotId", c[4]); caseRecord.put("cropCode", c[5]);
            caseRecord.put("primaryCause", c[6]); caseRecord.put("effectivenessScore", Double.parseDouble(c[7]));
            caseRecord.put("quality", "GOOD"); caseRecord.put("ruleVersion", "rules-v1"); caseRecord.put("cropPackVersion", "1.0.0");
            caseRecord.put("fingerprint", Integer.toHexString(Objects.hash(c[5], c[6], c[2], c[3])));
            // Legacy demo cases are intentionally pending until a complete
            // snapshot, execution ACK and effect evaluation are rechecked.
            caseRecord.put("qualityStatus", "PENDING"); caseRecord.put("qualityScore", null);
            caseRecord.put("selectionReason", List.of("等待确定性质量判断")); caseRecord.put("excludedReason", List.of());
            caseRecord.put("learningUses", List.of("NONE")); caseRecord.put("accountId", "seed");
            caseRecord.put("farmId", "farm-demo"); caseRecord.put("sourceSnapshot", Map.of());
            caseRecord.put("scenarioId", ""); caseRecord.put("agentVersion", "rules-only");
            caseRecord.put("createdAt", Instant.now().toString()); save("decision-case", c[0], caseRecord);
        }
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
    private final AgriStore store;
    private record ScopedEmitter(SseEmitter emitter, UserPrincipal principal) { }
    private final List<ScopedEmitter> emitters = new CopyOnWriteArrayList<>();
    private final ExecutorService executor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "agriloop-sse"); t.setDaemon(true); return t;
    });

    AgriEventBus(ObjectMapper mapper, AgriStore store) { this.mapper = mapper; this.store = store; }

    SseEmitter subscribe(UserPrincipal principal) {
        SseEmitter emitter = new SseEmitter(0L);
        ScopedEmitter subscription = new ScopedEmitter(emitter, principal);
        emitters.add(subscription);
        Runnable remove = () -> emitters.remove(subscription);
        emitter.onCompletion(remove); emitter.onTimeout(remove); emitter.onError(e -> remove.run());
        try { emitter.send(SseEmitter.event().name("connected").data(Map.of("connectedAt", Instant.now().toString()))); }
        catch (IOException e) { remove.run(); }
        return emitter;
    }

    boolean canReceive(UserPrincipal principal, Map<String, Object> payload) {
        return canReceive(principal, "", payload);
    }

    private boolean canReceive(UserPrincipal principal, String eventType, Map<String, Object> payload) {
        if (principal == null) return false;
        if (principal.isSystemAdmin()) return true;
        if (Jsons.bool(payload, "systemAdminOnly", false)) return false;
        String farmId = Jsons.text(payload, "farmId", Jsons.text(payload, "scope", "")).trim();
        String plotId = Jsons.text(payload, "plotId", "").trim();
        if (!farmId.isBlank() && !principal.canAccessFarm(farmId)) return false;
        if (!plotId.isBlank() && !canReceivePlot(principal, farmId, plotId)) return false;
        if (principal.isFarmer() && "inspection.created".equals(eventType)) {
            return principal.userId.equals(Jsons.text(payload, "operatorId", ""))
                    || principal.userId.equals(Jsons.text(payload, "assignedFarmerId", ""));
        }
        if (principal.isFarmer() && eventType.startsWith("workorder.")
                && "READINESS".equalsIgnoreCase(Jsons.text(payload, "sourceType", ""))) {
            return principal.userId.equals(Jsons.text(payload, "createdBy", ""))
                    || principal.userId.equals(Jsons.text(payload, "assigneeId", ""));
        }
        if (principal.isFarmer() && !Jsons.text(payload, "resourceRequestId", "").isBlank()) {
            return principal.userId.equals(Jsons.text(payload, "requestedBy", ""))
                    || principal.userId.equals(Jsons.text(payload, "assignedFarmerId", ""));
        }
        if (principal.isFarmer() && payload.get("allocations") instanceof Collection<?>) {
            return Jsons.maps(mapper, payload.get("allocations")).stream()
                    .anyMatch(allocation -> principal.canAccessPlot(Jsons.text(allocation, "plotId", "")));
        }
        // Unscoped platform events are intentionally withheld from farmers.
        // Their REST refresh remains the recovery path for secondary state.
        return !farmId.isBlank() || !plotId.isBlank() || principal.isFarmAdmin();
    }

    private boolean canReceivePlot(UserPrincipal principal, String payloadFarmId, String plotId) {
        if (!principal.isFarmAdmin()) return principal.canAccessPlot(plotId);
        String farmId = payloadFarmId;
        if (farmId == null || farmId.isBlank()) {
            Map<String, Object> plot = store.find("plot", plotId);
            farmId = Jsons.text(plot == null ? Map.of() : plot, "farmId", "");
        }
        return !farmId.isBlank() && principal.canAccessFarm(farmId);
    }

    private Map<String, Object> scopedPayload(UserPrincipal principal, Map<String, Object> payload) {
        Map<String, Object> copy = Jsons.copy(mapper, payload);
        if (!principal.isFarmer() || !(copy.get("allocations") instanceof Collection<?>)) return copy;
        List<Map<String, Object>> allocations = Jsons.maps(mapper, copy.get("allocations")).stream()
                .filter(allocation -> principal.canAccessPlot(Jsons.text(allocation, "plotId", ""))).toList();
        copy.put("allocations", allocations);
        copy.put("totalRequestedLitres", allocations.stream().mapToDouble(allocation -> Jsons.number(allocation, "requestedLitres", 0)).sum());
        copy.put("totalAllocatedLitres", allocations.stream().mapToDouble(allocation -> Jsons.number(allocation, "allocatedLitres", 0)).sum());
        copy.put("totalUnmetLitres", allocations.stream().mapToDouble(allocation -> Jsons.number(allocation, "unmetLitres", 0)).sum());
        return copy;
    }

    void publish(String type, Map<String, Object> payload) {
        String eventId = Jsons.id("evt"); String timestamp = Instant.now().toString();
        for (ScopedEmitter subscription : emitters) {
            if (!canReceive(subscription.principal(), type, payload)) continue;
            Map<String, Object> event = new LinkedHashMap<>(); event.put("eventType", type); event.put("eventId", eventId); event.put("ts", timestamp);
            event.put("payload", scopedPayload(subscription.principal(), payload));
            executor.submit(() -> {
                try { subscription.emitter().send(SseEmitter.event().name(type).id(Jsons.text(event, "eventId", "")).data(event)); }
                catch (Exception e) { emitters.remove(subscription); }
            });
        }
    }

    @Scheduled(fixedDelayString = "${agriloop.sse-heartbeat-seconds:15}000")
    void heartbeat() {
        for (ScopedEmitter subscription : emitters) {
            try { subscription.emitter().send(SseEmitter.event().name("heartbeat").data(Map.of("ts", Instant.now().toString()))); }
            catch (Exception e) { emitters.remove(subscription); }
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
        return Set.of("FARMER", "FARM_ADMIN", "SYSTEM_ADMIN").contains(canonical(value));
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

/** Admin-only proxy for the in-process telemetry {@link SimulationEngine}. */
@Component
class SimulatorControl {
    private final AgriProperties properties;
    private final SimulationEngine engine;

    SimulatorControl(AgriProperties properties, SimulationEngine engine) {
        this.properties = properties;
        this.engine = engine;
    }

    Map<String, Object> status() {
        if (!properties.isSimulatorControlEnabled()) return unavailable("SIMULATOR_CONTROL_DISABLED");
        if (engine == null) return unavailable("SIMULATION_ENGINE_NOT_READY");
        return engine.status();
    }

    Map<String, Object> start() { return requireEngine().start(); }
    Map<String, Object> stop() { return requireEngine().stop(); }
    Map<String, Object> updateSettings(Map<String, Object> body) { return requireEngine().updateSettings(body); }

    private SimulationEngine requireEngine() {
        if (!properties.isSimulatorControlEnabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SIMULATOR_CONTROL_DISABLED", "服务器未启用模拟器控制");
        }
        if (engine == null) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SIMULATION_ENGINE_NOT_READY", "进程内模拟器尚未就绪");
        }
        return engine;
    }

    private Map<String, Object> unavailable(String reason) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("available", false);
        response.put("status", "UNAVAILABLE");
        response.put("reason", reason);
        response.put("program", "in-process");
        response.put("pid", "api");
        return response;
    }
}

@Service
class AgriEngine {
    private static final String RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final int RECOVERY_MAX_FAILURES = 5;
    private static final Duration RECOVERY_FAILURE_WINDOW = Duration.ofMinutes(15);
    private final java.time.Instant startedAt = java.time.Instant.now();
    private static final int SYSTEM_ADMIN_AUTHORIZATION_MAX_FAILURES = 5;
    private static final Duration SYSTEM_ADMIN_AUTHORIZATION_FAILURE_WINDOW = Duration.ofMinutes(15);
    private static final Set<String> ACCOUNT_ROLES = RolePolicy.PUBLIC_ROLES;
    private static final Set<String> SELF_REGISTRATION_ROLES = Set.of("FARMER", "FARM_ADMIN");
    private static final String FARMER_WORKSPACE_PREFERENCE_TYPE = "user-preference";
    private static final String FARMER_WORKSPACE_PREFERENCE_SCOPE = "FARMER_WORKSPACE";
    private static final int FARMER_WORKSPACE_MAX_PLOTS = 500;
    private static final Set<String> WORK_ORDER_STATUSES = Set.of("OPEN", "ASSIGNED", "IN_PROGRESS", "SUBMITTED", "REJECTED", "DONE", "CANCELLED");
    private static final Set<String> TERMINAL_WORK_ORDER_STATUSES = Set.of("DONE", "CANCELLED");
    private static final Set<String> PLOT_SIMULATION_SCENARIOS = Set.of(
            "NORMAL", "DROUGHT", "HEAVY_RAIN", "SENSOR_DRIFT", "DEVICE_OFFLINE");
    private static final Map<String, double[]> SIMULATION_PARAMETER_LIMITS = Map.ofEntries(
            Map.entry("volatility", new double[]{.2, 3.0}),
            Map.entry("timeScale", new double[]{1, 288}),
            Map.entry("temperatureBias", new double[]{-15, 15}),
            Map.entry("humidityBias", new double[]{-40, 40}),
            Map.entry("rainfallRate", new double[]{0, 120}),
            Map.entry("soilMoistureTrendPerHour", new double[]{-12, 12}),
            Map.entry("driftRatePerHour", new double[]{0, 10}),
            Map.entry("offlineRatio", new double[]{0, 1}),
            Map.entry("riskThreshold", new double[]{1, 99}),
            Map.entry("waterloggingThreshold", new double[]{40, 99}),
            Map.entry("forecastHours", new double[]{1, 12}));
    /** 10 minutes of wall-clock time equals one simulated day. */
    private static final double DEFAULT_SIMULATION_TIME_SCALE = 144.0;
    private static final double SOIL_WATER_LITRES_PER_POINT_PER_M2 = 0.08;
    private static final double DEFAULT_PLOT_AREA_M2 = 80.0;
    private static final double DEFAULT_RESERVOIR_LITRES = 900.0;
    /** Soil moisture below this percentage can trigger virtual auto-watering. */
    private static final double AUTO_WATERING_THRESHOLD = 10.0;
    /** Smallest explicit amount accepted by the farmer's manual fallback. */
    private static final double MIN_MANUAL_IRRIGATION_LITRES = 0.1;
    private static final Set<String> OPEN_ALERT_STATUSES = Set.of("ACTIVE", "ACKED", "ESCALATED");
    private static final Set<String> TERMINAL_ALERT_STATUSES = Set.of("CLOSED", "RESOLVED");
    private static final Set<String> DEVICE_CONTROL_TARGETS = Set.of("ONLINE", "OFFLINE");
    private static final Set<String> DEVICE_CONTROL_TERMINAL = Set.of("SUCCEEDED", "FAILED", "TIMEOUT");
    private static final Duration AGENT_ACTION_TTL = Duration.ofMinutes(10);
    private static final Set<String> AGENT_MUTATION_TOOLS = Set.of("create_plot", "update_plot", "set_plot_devices",
            "create_and_assign_work_order", "publish_alert_verification", "close_alert",
            "transition_assigned_work_order", "create_inspection_record", "create_evidence_request",
            "execute_virtual_irrigation");
    private static final Set<String> INSPECTION_PHOTO_TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private static final int INSPECTION_PHOTO_MAX_COUNT = 6;
    private static final int INSPECTION_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
    private static final Set<String> AGENT_IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private static final int AGENT_IMAGE_MAX_COUNT = 4;
    private static final int AGENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
    private static final int AGENT_IMAGE_MAX_TOTAL_BYTES = 24 * 1024 * 1024;
    /** Keep private reasoning responsive; a plain generation retry follows on timeout. */
    private static final long AGENT_THINKING_TIMEOUT_MS = 12000L;
    private static final long AGENT_PLAIN_TIMEOUT_MS = 30000L;
    private static final Pattern AGENT_IMAGE_DATA_URL = Pattern.compile(
            "^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern AGENT_VISION_HISTORY_MARKER = Pattern.compile(
            "\\s*(?:图片|图像)(?:会|将)(?:(?:随(?:本次)?请求)|(?:以原文件字节)|直接)?(?:直接)?送入视觉模型[\\s\\S]*$", Pattern.CASE_INSENSITIVE);
    private final ObjectMapper mapper;
    private final ResourceLoader resourceLoader;
    private volatile HttpClient llmHttpClient;
    private final Object llmHttpClientLock = new Object();
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
    private final SimulationEngine simulationEngine;
    private final FarmGovernanceService governance;
    private final ControlledLearningService controlledLearning;
    private final Map<String, Map<String, Object>> idempotentCommands = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> ackByCommand = new ConcurrentHashMap<>();
    private final Set<String> evaluatedCommands = ConcurrentHashMap.newKeySet();
    private final Map<String, Deque<Instant>> ruleWindows = new ConcurrentHashMap<>();
    private final Map<String, Deque<Instant>> recoveryFailures = new ConcurrentHashMap<>();
    private final Map<String, Deque<Instant>> systemAdminAuthorizationFailures = new ConcurrentHashMap<>();
    private final AtomicBoolean redisAvailable = new AtomicBoolean(false);
    private final AtomicLong redisPublished = new AtomicLong();
    private final AtomicLong redisFailures = new AtomicLong();
    private final Object simulationConfigLock = new Object();
    private final Object resourcePlanLock = new Object();
    private static final Set<String> RESOURCE_PLAN_STATUSES = Set.of("DRAFT", "CONFIRMED", "RUNNING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED", "EXPIRED");
    private static final Set<String> RESOURCE_ALLOCATION_TERMINAL = Set.of("COMPLETED", "PARTIAL", "FAILED", "BLOCKED", "FALLBACK_REQUIRED", "CANCELLED");
    private static final Set<String> RESOURCE_REQUEST_STATUSES = Set.of("SUBMITTED", "IN_REVIEW", "PENDING_ACK", "ACKNOWLEDGED", "CONFLICT_REPORTED", "COMPLETED", "CANCELLED");
    private static final Set<String> RESOURCE_REQUEST_ACTIVE = Set.of("SUBMITTED", "IN_REVIEW", "CONFLICT_REPORTED");
    private static final Set<String> RESOURCE_REQUEST_OPEN = Set.of("SUBMITTED", "IN_REVIEW", "PENDING_ACK", "ACKNOWLEDGED", "CONFLICT_REPORTED");

    AgriEngine(ObjectMapper mapper, ResourceLoader resourceLoader, AgriStore store, AgriEventBus events, AgriProperties properties,
               CropPackCatalog cropPackCatalog,
               PasswordEncoder passwordEncoder, JwtService jwtService, StringRedisTemplate redis, MqttCommandGateway mqttCommands,
               RedisStreamWorker streamWorker, @Lazy AdminManagementService adminManagement,
               @Lazy SimulationEngine simulationEngine, FarmGovernanceService governance,
               ControlledLearningService controlledLearning) {
        this.mapper = mapper;
        this.resourceLoader = resourceLoader;
        this.store = store; this.events = events; this.properties = properties; this.cropPackCatalog = cropPackCatalog;
        this.passwordEncoder = passwordEncoder; this.jwtService = jwtService; this.redis = redis; this.mqttCommands = mqttCommands; this.streamWorker = streamWorker; this.adminManagement = adminManagement;
        this.simulationEngine = simulationEngine;
        this.governance = governance;
        this.controlledLearning = controlledLearning;
    }

    private HttpClient llmHttpClient() throws IOException {
        HttpClient existing = llmHttpClient;
        if (existing != null) return existing;
        synchronized (llmHttpClientLock) {
            if (llmHttpClient != null) return llmHttpClient;
            try {
                // vLLM/uvicorn on the private loopback endpoint is intentionally used
                // with HTTP/1.1 requests. Keep this dependency lazy so a local selector
                // failure cannot prevent unrelated API domains from starting.
                llmHttpClient = HttpClient.newBuilder()
                        .version(HttpClient.Version.HTTP_1_1)
                        .connectTimeout(Duration.ofSeconds(10))
                        .build();
                return llmHttpClient;
            } catch (java.io.UncheckedIOException error) {
                throw new IOException("LLM_HTTP_CLIENT_UNAVAILABLE", error);
            }
        }
    }

    @PostConstruct
    void initialisePlotSimulationConfiguration() {
        // The standalone/test profile has no long-running Python consumer and
        // must not create workspace files merely by starting Spring tests.
        if ("simulation".equalsIgnoreCase(properties.getMode())) syncSimulationConfiguration();
        // 服务重启系统告警（INFO）：由引擎记录服务启动告警，此时事件总线和存储依赖已完成注入
        createSystemAlert("SYSTEM", "INFO", "接口服务已启动", "AgriLoop 后端已完成启动并加载配置。", "");
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
        return register(username, password, requestedRole, "");
    }

    Map<String, Object> register(String username, String password, String requestedRole, String authorizationCode) {
        return register(username, password, requestedRole, authorizationCode, Map.of());
    }

    Map<String, Object> register(String username, String password, String requestedRole, String authorizationCode, Object rawFarmProfile) {
        String normalized = normalizeUsername(username);
        validateUsername(normalized);
        validatePassword(normalized, password);
        String role = validateSelfRegistrationRole(requestedRole, authorizationCode, "register:" + normalized);
        String recoveryCode = generateRecoveryCode();
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("userId", Jsons.id("user")); user.put("username", normalized);
        user.put("passwordHash", passwordEncoder.encode(password)); user.put("recoveryCodeHash", passwordEncoder.encode(normalizeRecoveryCode(recoveryCode)));
        user.put("role", role);
        if ("SYSTEM_ADMIN".equals(role)) {
            user.put("farmIds", List.of("*"));
            user.put("plotIds", List.of("*"));
        } else if ("FARM_ADMIN".equals(role)) {
            Map<String, Object> farmProfile = validateFarmProfile(rawFarmProfile);
            String farmId = Jsons.id("farm");
            user.put("farmIds", List.of(farmId));
            user.put("plotIds", List.of());
            user.put("enabled", true); user.put("credentialVersion", 1);

            Map<String, Object> farm = new LinkedHashMap<>();
            farm.put("farmId", farmId);
            farm.put("name", farmProfile.get("name"));
            farm.put("region", farmProfile.get("region"));
            farm.put("ownerId", user.get("userId"));
            farm.put("status", "ACTIVE");
            farm.put("createdAt", Instant.now().toString());
            farm.put("createdBy", user.get("userId"));
            store.createUserWithFarmDurably(user, farm);
            store.logEvent("ACCOUNT_REGISTERED", Map.of("userId", user.get("userId"), "username", normalized, "role", role, "farmId", farmId));
            events.publish("farm.created", farm);
            Map<String, Object> result = authenticatedSession(user);
            result.put("recoveryCode", recoveryCode); result.put("recoveryCodeShownOnce", true);
            return result;
        } else {
            user.put("farmIds", List.of("farm-demo"));
            user.put("plotIds", List.of("plot-a01", "plot-a02"));
        }
        user.put("enabled", true); user.put("credentialVersion", 1);
        persistNewAccount(user, "ACCOUNT_EXISTS", "该账号已存在");
        store.logEvent("ACCOUNT_REGISTERED", Map.of("userId", user.get("userId"), "username", normalized, "role", role));
        Map<String, Object> result = authenticatedSession(user);
        result.put("recoveryCode", recoveryCode); result.put("recoveryCodeShownOnce", true);
        return result;
    }

    List<Map<String, Object>> userAccounts(UserPrincipal principal) {
        requireSystemAccountAdministrator(principal);
        return store.listUsers().stream()
                .map(this::accountView)
                .sorted(Comparator.comparing(account -> Jsons.text(account, "username", "")))
                .toList();
    }

    Map<String, Object> createUserAccount(Map<String, Object> input, UserPrincipal principal) {
        requireSystemAccountAdministrator(principal);
        String username = normalizeUsername(Jsons.text(input, "username", ""));
        String password = Jsons.text(input, "password", "");
        String role = normalizeRole(Jsons.text(input, "role", "FARMER"));
        validateUsername(username);
        validatePassword(username, password);
        if (!ACCOUNT_ROLES.contains(role)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ACCOUNT_ROLE_INVALID", "请选择有效的账号身份");
        }
        if ("SYSTEM_ADMIN".equals(role)) {
            verifySystemAdminAuthorization(Jsons.text(input, "authorizationCode", ""), "operator:" + principal.userId);
        }

        List<String> farmIds;
        List<String> plotIds;
        String farmId = "";
        if ("SYSTEM_ADMIN".equals(role)) {
            farmIds = List.of("*");
            plotIds = List.of("*");
        } else {
            farmId = Jsons.text(input, "farmId", "").trim();
            if (farmId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "FARM_CONTEXT_REQUIRED", "请选择账号所属农场");
            if (store.find("farm", farmId) == null) throw new ApiException(HttpStatus.NOT_FOUND, "FARM_NOT_FOUND", "农场不存在");
            farmIds = List.of(farmId);
            plotIds = "FARM_ADMIN".equals(role) ? plotIdsForFarm(farmId) : validateAccountPlotScope(farmId, input.get("plotIds"));
        }

        String recoveryCode = generateRecoveryCode();
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("userId", Jsons.id("user"));
        user.put("username", username);
        user.put("passwordHash", passwordEncoder.encode(password));
        user.put("recoveryCodeHash", passwordEncoder.encode(normalizeRecoveryCode(recoveryCode)));
        user.put("role", role);
        user.put("farmIds", farmIds);
        user.put("plotIds", plotIds);
        user.put("enabled", true);
        user.put("credentialVersion", 1);
        persistNewAccount(user, "ACCOUNT_EXISTS", "该账号已存在");
        Map<String, Object> audit = new LinkedHashMap<>();
        audit.put("userId", user.get("userId")); audit.put("username", username); audit.put("role", role);
        audit.put("createdBy", principal.userId);
        audit.put("systemAdminOnly", true);
        if (!farmId.isBlank()) audit.put("farmId", farmId);
        store.logEvent("ACCOUNT_CREATED", audit);
        events.publish("account.created", audit);
        Map<String, Object> result = accountView(user);
        result.put("recoveryCode", recoveryCode);
        result.put("recoveryCodeShownOnce", true);
        result.put("createdBy", principal.userId);
        return result;
    }

    Map<String, Object> updateUserAccountStatus(String userId, Map<String, Object> input, UserPrincipal principal) {
        requireSystemAccountAdministrator(principal);
        Map<String, Object> user = store.userById(userId);
        if (user == null) throw new ApiException(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "账号不存在");
        if ("SYSTEM_ADMIN".equals(RolePolicy.canonical(Jsons.text(user, "role", "")))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_SYSTEM_ADMIN_PROTECTED", "系统管理员账号受永久保护，不能停用或启用");
        }
        if (!(input.get("enabled") instanceof Boolean enabled)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ACCOUNT_STATUS_INVALID", "请指定账号是否启用");
        }
        Map<String, Object> updated = store.updateUserEnabled(userId, enabled, !enabled);
        if (updated == null) {
            if (!store.databaseReady()) throw accountPersistenceUnavailable();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ACCOUNT_STATUS_UPDATE_FAILED", "账号状态更新失败");
        }
        String action = enabled ? "ACCOUNT_ENABLED" : "ACCOUNT_DISABLED";
        Map<String, Object> audit = Map.of("userId", userId, "username", Jsons.text(user, "username", userId),
                "role", Jsons.text(user, "role", ""), "updatedBy", principal.userId, "systemAdminOnly", true);
        store.logEvent(action, audit);
        events.publish(enabled ? "account.enabled" : "account.disabled", audit);
        Map<String, Object> result = accountView(updated);
        result.put("updatedBy", principal.userId);
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
        if (principal.isSystemAdmin()) return List.of("plots:read", "diagnosis:read", "work-order:audit", "simulator:control", "strategy:manage", "value:audit", "platform:manage", "irrigation:execute", "irrigation:approve");
        if (principal.isFarmAdmin()) return List.of("plots:read", "diagnosis:read", "inspection:create", "work-order:manage", "irrigation:request", "irrigation:execute", "irrigation:approve", "simulator:control", "resource:manage", "market-price:read", "strategy:read", "value:manage");
        return List.of("plots:read", "diagnosis:read", "inspection:create", "work-order:request", "irrigation:request", "irrigation:execute");
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
        view.put("configDelivery", "IN_PROCESS");
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
        if (scenarioChanged && !supplied.containsKey("timeScale")) {
            Map<String, Object> previous = Jsons.map(mapper, current.get("parameters"));
            parameters.put("timeScale", Jsons.number(previous, "timeScale", DEFAULT_SIMULATION_TIME_SCALE));
        }
        if (Jsons.number(parameters, "riskThreshold", 20) >= Jsons.number(parameters, "waterloggingThreshold", 82)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SIMULATION_THRESHOLD_INVALID", "干旱阈值必须低于积水阈值");
        }
        Map<String, Object> saved = new LinkedHashMap<>(current);
        saved.put("plotId", plotId); saved.put("scenario", scenario); saved.put("parameters", parameters);
        saved.put("revision", Jsons.whole(current, "revision", 0) + 1);
        saved.put("updatedAt", Instant.now().toString()); saved.put("updatedBy", principal.userId);
        saved.put("sourceMode", "SIMULATION");
        boolean timeScaleExplicit = Jsons.bool(current, "timeScaleExplicit", false) || supplied.containsKey("timeScale");
        saved.put("timeScaleExplicit", timeScaleExplicit);
        if (input.containsKey("enabled")) saved.put("enabled", Jsons.bool(input, "enabled", true));
        store.save("plot-simulation", plotId, saved);
        boolean delivered = syncSimulationConfiguration();
        if (scenarioChanged) {
            recordScenarioRun(plotId, scenario, principal);
        }
        Map<String, Object> event = new LinkedHashMap<>(saved); event.put("configDelivered", delivered);
        events.publish("plot.simulation.updated", event); store.logEvent("plot.simulation.updated", event);
        Map<String, Object> view = plotSimulationView(plotId); view.put("configDelivered", delivered);
        return view;
    }

    // 切换场景 = 结束该地块旧的运行记录 + 按新场景开始一条新运行（供'运行历史'展示）
    private void recordScenarioRun(String plotId, String scenario, UserPrincipal principal) {
        Instant now = Instant.now();
        for (Map<String, Object> oldRun : store.list("scenario-run")) {
            if (plotId.equals(Jsons.text(oldRun, "plotId", ""))
                    && "RUNNING".equalsIgnoreCase(Jsons.text(oldRun, "status", ""))) {
                oldRun.put("status", "COMPLETED");
                oldRun.put("endedAt", now.toString());
                oldRun.put("endedBy", principal.userId);
                store.save("scenario-run", Jsons.text(oldRun, "runId", ""), oldRun);
            }
        }
        Map<String, Object> run = new LinkedHashMap<>();
        run.put("runId", Jsons.id("scenario-run"));
        run.put("scenarioId", Jsons.id("scenario-run"));
        run.put("plotId", plotId);
        run.put("scenario", scenario.toLowerCase(Locale.ROOT));
        run.put("seed", 42);
        run.put("status", "RUNNING");
        run.put("startedAt", now.toString());
        run.put("startedBy", principal.userId);
        run.put("branchId", "MAIN");
        run.put("sourceMode", "SIMULATION");
        store.save("scenario-run", Jsons.text(run, "runId", ""), run);
        events.publish("scenario.started", run);
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

    Map<String, Object> plotSimulationRecord(String plotId) {
        return simulationRecord(plotId);
    }

    synchronized void applyGlobalSimulationTimeScale(double timeScale) {
        double bounded = SimulationEngine.normalizeTimeScale(SimulationEngine.clamp(timeScale, SimulationEngine.MIN_TIME_SCALE, SimulationEngine.MAX_TIME_SCALE));
        Instant now = Instant.now();
        for (Map<String, Object> plot : store.list("plot")) {
            String plotId = Jsons.text(plot, "plotId", "");
            if (plotId.isBlank()) continue;
            Map<String, Object> saved = simulationRecord(plotId);
            Map<String, Object> parameters = Jsons.map(mapper, saved.get("parameters"));
            parameters.put("timeScale", bounded);
            saved.put("parameters", parameters);
            saved.put("timeScaleExplicit", true);
            saved.put("revision", Jsons.whole(saved, "revision", 0) + 1);
            saved.put("updatedAt", now.toString());
            saved.put("updatedBy", "simulator-engine");
            store.save("plot-simulation", plotId, saved);
        }
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
        if (!Jsons.bool(persisted, "timeScaleExplicit", false)
                && Math.abs(Jsons.number(defaults, "timeScale", DEFAULT_SIMULATION_TIME_SCALE) - 1.0) < 1e-6) {
            defaults.put("timeScale", DEFAULT_SIMULATION_TIME_SCALE);
        }
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
                params.put("rainfallRate", 0.0); params.put("soilMoistureTrendPerHour", -0.45); params.put("driftRatePerHour", 0.0); params.put("offlineRatio", 0.0);
            }
            case "HEAVY_RAIN" -> {
                params.put("volatility", 1.9); params.put("temperatureBias", -4.5); params.put("humidityBias", 20.0);
                params.put("rainfallRate", 4.0); params.put("soilMoistureTrendPerHour", 0.5); params.put("driftRatePerHour", 0.0); params.put("offlineRatio", 0.0);
            }
            case "SENSOR_DRIFT" -> {
                params.put("volatility", 1.45); params.put("temperatureBias", 0.0); params.put("humidityBias", 0.0);
                params.put("rainfallRate", .2); params.put("soilMoistureTrendPerHour", -0.12); params.put("driftRatePerHour", 0.08); params.put("offlineRatio", 0.0);
            }
            case "DEVICE_OFFLINE" -> {
                params.put("volatility", 1.3); params.put("temperatureBias", 0.0); params.put("humidityBias", 0.0);
                params.put("rainfallRate", .2); params.put("soilMoistureTrendPerHour", -0.12); params.put("driftRatePerHour", 0.0); params.put("offlineRatio", .55);
            }
            default -> {
                params.put("volatility", 1.25); params.put("temperatureBias", 0.0); params.put("humidityBias", 0.0);
                params.put("rainfallRate", .2); params.put("soilMoistureTrendPerHour", -0.12); params.put("driftRatePerHour", 0.0); params.put("offlineRatio", 0.0);
            }
        }
        Map<String, Object> context = plotId == null || store.find("plot", plotId) == null ? Map.of() : plotCropContext(plotId);
        params.put("riskThreshold", Jsons.number(cropPackCatalog.rule(context, "WATER_DEFICIT"), "threshold", 20));
        params.put("waterloggingThreshold", 82.0); params.put("forecastHours", 4.0); params.put("timeScale", DEFAULT_SIMULATION_TIME_SCALE);
        return params;
    }

    private double moistureDeltaFromWater(double waterLitre, double areaM2) {
        return Math.max(0, waterLitre) / (Math.max(1.0, areaM2) * SOIL_WATER_LITRES_PER_POINT_PER_M2);
    }

    private double applyIrrigationMoisture(double before, double waterLitre, double areaM2) {
        return round(clamp(before + moistureDeltaFromWater(waterLitre, areaM2), 0, 100));
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
                .filter(device -> isHardwareDevice(device))
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
                .filter(this::deviceIsSimulated)
                .filter(item -> !"UNBOUND".equalsIgnoreCase(Jsons.text(item, "bindingState", ""))
                        && !"UNBOUND".equalsIgnoreCase(Jsons.text(item, "status", "")))
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
                    compact.put("enabled", Jsons.bool(record, "enabled", true));
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

    private String validateSelfRegistrationRole(String requestedRole, String authorizationCode, String attemptKey) {
        String role = normalizeRole(requestedRole);
        if (role.isBlank()) role = "FARMER";
        if (SELF_REGISTRATION_ROLES.contains(role)) return role;
        if (RolePolicy.LEGACY_ROLES.contains(role) || "OPERATOR".equals(role)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_ROLE_REQUIRES_ADMIN", "旧操作员身份已迁移为种植农户，请由管理员授权账号");
        }
        if ("SYSTEM_ADMIN".equals(role)) {
            verifySystemAdminAuthorization(authorizationCode, attemptKey);
            return role;
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "ACCOUNT_ROLE_INVALID", "请选择有效的注册身份");
    }

    private void verifySystemAdminAuthorization(String authorizationCode, String attemptKey) {
        String configured = String.valueOf(properties.getSystemAdminAuthorizationCode() == null ? "" : properties.getSystemAdminAuthorizationCode());
        if (configured.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SYSTEM_ADMIN_CREATION_DISABLED", "系统管理员创建尚未配置，请联系服务维护人员");
        }
        String key = String.valueOf(attemptKey == null ? "unknown" : attemptKey);
        ensureSystemAdminAuthorizationAllowed(key);
        byte[] expected = configured.getBytes(StandardCharsets.UTF_8);
        byte[] presented = String.valueOf(authorizationCode == null ? "" : authorizationCode).getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, presented)) {
            recordSystemAdminAuthorizationFailure(key);
            throw new ApiException(HttpStatus.FORBIDDEN, "SYSTEM_ADMIN_AUTHORIZATION_INVALID", "系统管理员授权码无效");
        }
        systemAdminAuthorizationFailures.remove(key);
    }

    private void ensureSystemAdminAuthorizationAllowed(String key) {
        Deque<Instant> attempts = systemAdminAuthorizationFailures.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (attempts) {
            pruneAuthorizationFailures(attempts);
            if (attempts.size() >= SYSTEM_ADMIN_AUTHORIZATION_MAX_FAILURES) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "SYSTEM_ADMIN_AUTHORIZATION_RATE_LIMITED", "授权码尝试次数过多，请 15 分钟后重试");
            }
        }
    }

    private void recordSystemAdminAuthorizationFailure(String key) {
        Deque<Instant> attempts = systemAdminAuthorizationFailures.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (attempts) {
            pruneAuthorizationFailures(attempts);
            attempts.addLast(Instant.now());
            if (attempts.size() >= SYSTEM_ADMIN_AUTHORIZATION_MAX_FAILURES) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "SYSTEM_ADMIN_AUTHORIZATION_RATE_LIMITED", "授权码尝试次数过多，请 15 分钟后重试");
            }
        }
    }

    private void pruneAuthorizationFailures(Deque<Instant> attempts) {
        Instant cutoff = Instant.now().minus(SYSTEM_ADMIN_AUTHORIZATION_FAILURE_WINDOW);
        while (!attempts.isEmpty() && attempts.peekFirst().isBefore(cutoff)) attempts.removeFirst();
    }

    private List<String> plotIdsForFarm(String farmId) {
        return store.list("plot").stream()
                .filter(plot -> farmId.equals(Jsons.text(plot, "farmId", "")))
                .map(plot -> Jsons.text(plot, "plotId", ""))
                .filter(plotId -> !plotId.isBlank())
                .sorted()
                .toList();
    }

    private List<String> validateAccountPlotScope(String farmId, Object rawPlotIds) {
        LinkedHashSet<String> plotIds = new LinkedHashSet<>(Jsons.strings(rawPlotIds));
        for (String plotId : plotIds) {
            Map<String, Object> plot = store.find("plot", plotId);
            if (plot == null || !farmId.equals(Jsons.text(plot, "farmId", ""))) {
                throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_SCOPE_FORBIDDEN", "只能分配账号所属农场内的地块");
            }
        }
        return new ArrayList<>(plotIds);
    }

    private void persistNewAccount(Map<String, Object> user, String conflictCode, String conflictMessage) {
        if (!store.createUser(user)) {
            if (!store.databaseReady()) throw accountPersistenceUnavailable();
            throw new ApiException(HttpStatus.CONFLICT, conflictCode, conflictMessage);
        }
    }

    private ApiException accountPersistenceUnavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNT_PERSISTENCE_UNAVAILABLE", "账号数据库当前不可用，暂时不能修改账号");
    }

    private void requireSystemAccountAdministrator(UserPrincipal principal) {
        if (principal == null || !principal.isSystemAdmin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_MANAGEMENT_FORBIDDEN", "只有系统管理员可以管理全平台账号");
        }
    }

    private Map<String, Object> accountView(Map<String, Object> user) {
        Map<String, Object> view = new LinkedHashMap<>();
        String role = RolePolicy.canonical(Jsons.text(user, "role", "FARMER"));
        boolean enabled = Jsons.bool(user, "enabled", true);
        view.put("userId", Jsons.text(user, "userId", ""));
        view.put("username", Jsons.text(user, "username", ""));
        view.put("role", role);
        view.put("roleLabel", RolePolicy.label(role));
        List<String> farmIds = Jsons.strings(user.get("farmIds"));
        List<String> plotIds = "FARM_ADMIN".equals(role)
                ? farmIds.stream().filter(farmId -> !"*".equals(farmId)).flatMap(farmId -> plotIdsForFarm(farmId).stream()).distinct().sorted().toList()
                : Jsons.strings(user.get("plotIds"));
        view.put("farmIds", farmIds);
        view.put("plotIds", plotIds);
        view.put("enabled", enabled);
        view.put("status", enabled ? "ACTIVE" : "INACTIVE");
        view.put("createdAt", Jsons.text(user, "createdAt", ""));
        view.put("updatedAt", Jsons.text(user, "updatedAt", ""));
        return view;
    }

    private Map<String, Object> validateFarmProfile(Object rawFarmProfile) {
        Map<String, Object> profile = Jsons.map(mapper, rawFarmProfile);
        String name = Jsons.text(profile, "name", "").trim();
        String region = Jsons.text(profile, "region", "").trim();
        if (name.length() < 2 || name.length() > 60) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "FARM_PROFILE_INVALID", "农场名称需为 2–60 个字符");
        }
        if (region.length() < 2 || region.length() > 80) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "FARM_PROFILE_INVALID", "所在地区需为 2–80 个字符");
        }
        return Map.of("name", name, "region", region);
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

    synchronized Map<String, Object> farmerWorkspacePreference(UserPrincipal principal) {
        requireFarmerWorkspacePreferenceAccess(principal);
        return farmerWorkspacePreferenceView(principal, store.find(FARMER_WORKSPACE_PREFERENCE_TYPE, farmerWorkspacePreferenceId(principal)));
    }

    synchronized Map<String, Object> updateFarmerWorkspacePreference(Map<String, Object> input, UserPrincipal principal) {
        requireFarmerWorkspacePreferenceAccess(principal);
        Map<String, Object> current = store.find(FARMER_WORKSPACE_PREFERENCE_TYPE, farmerWorkspacePreferenceId(principal));
        long currentRevision = current == null ? 0 : Jsons.whole(current, "revision", 0);
        Map<String, Object> request = input == null ? Map.of() : input;
        if (!(request.get("plotOrder") instanceof Collection<?>)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "FARMER_WORKSPACE_PREFERENCE_INVALID", "plotOrder 必须是数组");
        }
        long expectedRevision = requiredFarmerWorkspaceRevision(request);
        if (expectedRevision != currentRevision) {
            throw new ApiException(HttpStatus.CONFLICT, "FARMER_WORKSPACE_PREFERENCE_CONFLICT", "地块顺序已在其他设备更新，请刷新后重试");
        }

        List<Map<String, Object>> availablePlots = activeFarmerPlots(principal);
        Set<String> availableIds = availablePlots.stream()
                .map(plot -> Jsons.text(plot, "plotId", ""))
                .filter(id -> !id.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));
        List<String> requestedOrder = normalizePreferenceOrder(request.get("plotOrder"));
        if (requestedOrder.size() > FARMER_WORKSPACE_MAX_PLOTS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "FARMER_WORKSPACE_PREFERENCE_INVALID", "地块顺序数量超过上限");
        }

        LinkedHashSet<String> order = new LinkedHashSet<>();
        for (String plotId : requestedOrder) {
            if (availableIds.contains(plotId)) {
                order.add(plotId);
                continue;
            }
            // A plot may disappear or become inactive while a drag is in
            // progress. Ignore that stale id, but never accept an id that is
            // currently owned by another farmer.
            Map<String, Object> plot = store.find("plot", plotId);
            if (plot != null && !principal.canAccessPlot(plotId)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "PLOT_FORBIDDEN", "无权设置该地块顺序");
            }
        }
        availablePlots.forEach(plot -> {
            String plotId = Jsons.text(plot, "plotId", "");
            if (!plotId.isBlank()) order.add(plotId);
        });

        Instant now = Instant.now();
        Map<String, Object> saved = new LinkedHashMap<>();
        saved.put("preferenceId", farmerWorkspacePreferenceId(principal));
        saved.put("userId", principal.userId);
        saved.put("scope", FARMER_WORKSPACE_PREFERENCE_SCOPE);
        saved.put("plotOrder", new ArrayList<>(order));
        saved.put("revision", currentRevision + 1);
        saved.put("updatedAt", now.toString());
        saved.put("updatedBy", principal.userId);
        // Durable preference writes must not silently fall back to this
        // process's cache: another browser must be able to read the order.
        store.saveDurably(FARMER_WORKSPACE_PREFERENCE_TYPE, farmerWorkspacePreferenceId(principal), saved);
        return farmerWorkspacePreferenceView(principal, saved);
    }

    private long requiredFarmerWorkspaceRevision(Map<String, Object> input) {
        Object value = input == null ? null : input.get("expectedRevision");
        double revision = Jsons.numberValue(value, Double.NaN);
        if (!Double.isFinite(revision) || revision < 0 || Math.rint(revision) != revision || revision > Long.MAX_VALUE) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "FARMER_WORKSPACE_PREFERENCE_INVALID", "expectedRevision 必须是非负整数");
        }
        return (long) revision;
    }

    private void requireFarmerWorkspacePreferenceAccess(UserPrincipal principal) {
        if (principal == null || !principal.isFarmer()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FARMER_WORKSPACE_PREFERENCE_FORBIDDEN", "只有农户可以设置自己的地块顺序");
        }
    }

    private String farmerWorkspacePreferenceId(UserPrincipal principal) {
        return principal.userId + ":" + FARMER_WORKSPACE_PREFERENCE_SCOPE;
    }

    private List<Map<String, Object>> activeFarmerPlots(UserPrincipal principal) {
        return store.list("plot").stream()
                .filter(plot -> !"INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE")))
                .filter(plot -> principal.canAccessPlot(Jsons.text(plot, "plotId", "")))
                .sorted(Comparator.comparing(plot -> Jsons.text(plot, "plotId", "")))
                .toList();
    }

    private List<String> normalizePreferenceOrder(Object value) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (String plotId : Jsons.strings(value)) {
            String normalized = String.valueOf(plotId == null ? "" : plotId).trim();
            if (!normalized.isBlank()) ids.add(normalized);
        }
        return new ArrayList<>(ids);
    }

    private Map<String, Object> farmerWorkspacePreferenceView(UserPrincipal principal, Map<String, Object> stored) {
        List<Map<String, Object>> availablePlots = activeFarmerPlots(principal);
        Set<String> availableIds = availablePlots.stream()
                .map(plot -> Jsons.text(plot, "plotId", ""))
                .filter(id -> !id.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));
        LinkedHashSet<String> order = new LinkedHashSet<>();
        normalizePreferenceOrder(stored == null ? null : stored.get("plotOrder")).forEach(id -> {
            if (availableIds.contains(id)) order.add(id);
        });
        availablePlots.forEach(plot -> {
            String plotId = Jsons.text(plot, "plotId", "");
            if (!plotId.isBlank()) order.add(plotId);
        });

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", principal.userId);
        result.put("scope", FARMER_WORKSPACE_PREFERENCE_SCOPE);
        result.put("plotOrder", new ArrayList<>(order));
        result.put("revision", stored == null ? 0 : Jsons.whole(stored, "revision", 0));
        result.put("updatedAt", stored == null ? null : stored.get("updatedAt"));
        return result;
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
            String facilityType = PlotFacility.forPlot(plot);
            card.put("facilityType", facilityType); card.put("facilityLabel", PlotFacility.label(facilityType));
            card.put("cultivationStatus", Jsons.text(plot, "cultivationStatus", "GROWING"));
            card.put("cultivationStatusLabel", Jsons.text(plot, "cultivationStatusLabel", "正常种植"));
            card.put("lastOperationType", Jsons.text(plot, "lastOperationType", ""));
            card.put("lastOperationLabel", Jsons.text(plot, "lastOperationLabel", ""));
            card.put("lastOperationAt", Jsons.text(plot, "lastOperationAt", ""));
            card.put("lastOperationSummary", Jsons.text(plot, "lastOperationSummary", ""));
            card.put("operationRevision", Jsons.whole(plot, "operationRevision", 0));
            card.put("operationHistory", plot.getOrDefault("operationHistory", List.of()));
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

    Map<String, Object> createCropPack(Map<String, Object> body, UserPrincipal principal) {
        return cropPackCatalog.create(body, principal);
    }

    Map<String, Object> updateCropPack(String cropCode, String version, Map<String, Object> body, UserPrincipal principal) {
        return cropPackCatalog.update(cropCode, version, body, principal);
    }

    void deleteCropPack(String cropCode, String version) {
        cropPackCatalog.delete(cropCode, version);
    }

    Map<String, Object> updateCropPackStatus(String cropCode, String version, String status, UserPrincipal principal) {
        return cropPackCatalog.updateStatus(cropCode, version, status, principal);
    }

    List<Map<String, Object>> cropPacks(String farmId, boolean includeDrafts, UserPrincipal principal) {
        if (farmId != null && !farmId.isBlank() && !principal.canAccessFarm(farmId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权查看该农场");
        }
        return cropPackCatalog.allForFarm(farmId, includeDrafts);
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

    List<Map<String, Object>> cropManuals(String farmId, boolean includeDrafts, UserPrincipal principal) {
        if (farmId == null || farmId.isBlank()) return cropPackCatalog.manualIndex();
        if (!principal.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权查看该农场");
        return cropPackCatalog.manualIndexForFarm(farmId, includeDrafts);
    }

    Map<String, Object> cropManual(String cropCode, String stageCode) {
        return cropPackCatalog.handbook(cropCode, stageCode);
    }

    Map<String, Object> plotCropManual(String plotId) {
        Map<String, Object> plot = requireRecord("plot", plotId);
        Map<String, Object> context = plotCropContext(plotId);
        Map<String, Object> handbook = cropPackCatalog.handbookForFarm(
                Jsons.text(context, "cropCode", "tomato"), Jsons.text(context, "stageCode", ""), Jsons.text(plot, "farmId", ""));
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
        String farmId = Jsons.text(plotMap, "farmId", "");
        return cropPackCatalog.resolveForFarm(crop, version, stage, farmId);
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
        String metric = Jsons.text(event, "metric", "");
        // A simulator tick emits many metrics for the same device. One
        // heartbeat-style device update per plot is sufficient; writing the
        // identical device JSON for all eleven metrics multiplied database
        // work without changing any visible state. Physical telemetry still
        // refreshes the device on every reading.
        if (!"SIMULATION".equals(sourceMode) || "SOIL_MOISTURE".equalsIgnoreCase(metric)) {
            Map<String, Object> device = store.find("device", deviceId);
            if (device == null || device.isEmpty()) { device = new LinkedHashMap<>(); device.put("deviceId", deviceId); device.put("plotId", plotId); }
            Map<String, Object> eventQuality = Jsons.map(mapper, event.get("quality"));
            boolean offlineSignal = "device-offline".equalsIgnoreCase(Jsons.text(event, "scenarioId", ""))
                    && "BAD".equalsIgnoreCase(Jsons.text(eventQuality, "status", ""));
            boolean simulatorOnlineOverride = simulatorManualOnlineOverride(device, sourceMode);
            if (!realControlPending) {
                device.put("status", simulatorOnlineOverride || !offlineSignal ? "ONLINE" : "OFFLINE");
                device.put("lastSeen", event.get("ts"));
                device.put("healthScore", "BAD".equalsIgnoreCase(Jsons.text(eventQuality, "status", "GOOD")) ? 0.35 : 0.98);
            }
            device.put("sourceMode", sourceMode);
            device.put("provenance", Jsons.text(event, "provenance", "OBSERVED"));
            device.put("dataOrigin", Jsons.text(event, "dataOrigin", "SIMULATOR"));
            store.save("device", deviceId, device);
        }
        Map<String, Object> ruleResult = evaluateRuleForEvent(event);
        // A fresh, good-quality soil reading below the farmer's emergency
        // threshold starts one virtual watering run immediately.  The action
        // still goes through the same permission, readiness, device, resource
        // and idempotency checks as a manually confirmed command.  Telemetry
        // ingestion must never fail just because the automatic action is
        // blocked, so the helper returns an auditable status instead of
        // throwing.
        if ("SOIL_MOISTURE".equalsIgnoreCase(Jsons.text(event, "metric", ""))) {
            ruleResult.put("automaticWatering", automaticWateringForEvent(event));
        }
        events.publish("telemetry.received", event);
        // Keep one representative audit row per plot/tick. The telemetry
        // table remains the complete metric-level record, while logging all
        // eleven metrics separately only multiplied high-frequency writes.
        if ("SOIL_MOISTURE".equalsIgnoreCase(metric)) store.logEvent("telemetry.received", event);
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
        // ai 字段为真实连通性探测结果（UP/DEGRADED/DOWN/规则模式），aiMode 保留配置模式
        status.put("ai", checkLlmHealth());
        status.put("aiMode", properties.getAiMode());
        status.put("llmModel", properties.getLlmModel());
        // 运行时长（秒）与接口版本
        status.put("uptimeSeconds", Math.max(0, java.time.Duration.between(startedAt, java.time.Instant.now()).getSeconds()));
        status.put("apiVersion", "v1");
        // 真实测量的依赖往返延迟（毫秒），-1 表示不可用/测量失败
        status.put("databaseLatencyMs", store.pingDbLatencyMs());
        status.put("redisLatencyMs", redisPingLatencyMs());
        status.put("mqttLatencyMs", mqttConnected ? mqttCommands.latencyMs() : -1);
        return status;
    }

    // ---- 外部 AI 服务真实连通性探测（结果缓存 15 秒）----
    private volatile String llmHealthStatus = null;
    private volatile long llmHealthCheckedAt = 0L;
    private final Object llmHealthLock = new Object();

    /**
     * 探测配置的外部 AI 服务是否真实在线。
     * - openai / openai-compatible：GET {baseUrl}/models，3 秒超时，2xx=UP，否则 DOWN
     * - maxkb / mock：未接入真实适配器，保守返回 DEGRADED（不宣称外部 AI 在线）
     * - rules-only 等规则模式：不依赖外部 AI，返回配置模式（由前端展示为规则模式）
     */
    String checkLlmHealth() {
        String aiMode = properties.getAiMode() == null ? "rules-only" : properties.getAiMode().toLowerCase(Locale.ROOT).trim();
        boolean needsExternal = aiMode.equals("openai") || aiMode.equals("openai-compatible");
        if (!needsExternal) {
            // 规则/演示/未接通适配：不探测，返回保守语义
            return aiMode.equals("mock") || aiMode.equals("maxkb") ? "DEGRADED" : aiMode;
        }
        long now = System.currentTimeMillis();
        if (now - llmHealthCheckedAt < 15_000 && llmHealthStatus != null) return llmHealthStatus;
        synchronized (llmHealthLock) {
            now = System.currentTimeMillis();
            if (now - llmHealthCheckedAt < 15_000 && llmHealthStatus != null) return llmHealthStatus;
            llmHealthStatus = probeLlmModels(aiMode);
            llmHealthCheckedAt = System.currentTimeMillis();
            return llmHealthStatus;
        }
    }

    /** OpenAI-compatible 端点探测：GET {baseUrl}/models，2xx 视为在线。 */
    private String probeLlmModels(String aiMode) {
        String baseUrl = properties.getLlmBaseUrl() == null ? "" : properties.getLlmBaseUrl().trim();
        if (baseUrl.isBlank()) return "DOWN";
        while (baseUrl.endsWith("/")) baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        String endpoint;
        if (baseUrl.endsWith("/chat/completions")) {
            endpoint = baseUrl.substring(0, baseUrl.length() - "/chat/completions".length()) + "/models";
        } else {
            endpoint = baseUrl + "/models";
        }
        try {
            URI uri = URI.create(endpoint);
            if (!Set.of("http", "https").contains(uri.getScheme())) return "DOWN";
            HttpRequest.Builder builder = HttpRequest.newBuilder(uri).GET().timeout(Duration.ofSeconds(3));
            if (properties.getLlmApiKey() != null && !properties.getLlmApiKey().isBlank()) {
                builder.header("Authorization", "Bearer " + properties.getLlmApiKey());
            }
            HttpResponse<String> response = llmHttpClient().send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            int code = response.statusCode();
            return code >= 200 && code < 300 ? "UP" : "DOWN";
        } catch (Exception ex) {
            return "DOWN";
        }
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
            if ("ONLINE".equals(Jsons.text(device, "status", ""))
                    && !simulatorManualOnlineOverride(device, Jsons.text(device, "sourceMode", ""))
                    && Duration.between(lastSeen, now).getSeconds() > properties.getDeviceTimeoutSeconds()) {
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
        quality.putIfAbsent("completeness", 1.0);
        quality.putIfAbsent("windowMinutes", 60);
        quality.putIfAbsent("calculationVersion", "quality-v2");
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
        // Crop Pack rules cover soil moisture, temperature and the simulated
        // light channel. Other metrics remain telemetry-only until a pack
        // explicitly adds a deterministic rule for them.
        if (!Set.of("SOIL_MOISTURE", "AIR_TEMPERATURE", "LIGHT").contains(metric)) return result;
        Map<String, Object> context = plotCropContext(plotId);
        Map<String, Object> waterRule = cropPackCatalog.rule(context, "WATER_DEFICIT");
        Map<String, Object> heatRule = cropPackCatalog.rule(context, "HEAT_STRESS");
        Map<String, Object> lightLowRule = cropPackCatalog.rule(context, "LIGHT_DEFICIT");
        Map<String, Object> lightHighRule = cropPackCatalog.rule(context, "LIGHT_EXCESS");
        double waterThreshold = Jsons.number(waterRule, "threshold", 20);
        double heatThreshold = Jsons.number(heatRule, "threshold", 35);
        double lightLowThreshold = Jsons.number(lightLowRule, "threshold", 15000);
        double lightHighThreshold = Jsons.number(lightHighRule, "threshold", 30000);
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
        if ("LIGHT".equals(metric) && value < lightLowThreshold) {
            Instant now = Instant.now();
            int lightDuration = (int) Jsons.whole(lightLowRule, "durationMinutes", 5);
            Deque<Instant> window = ruleWindows.computeIfAbsent(plotId + "|LIGHT_DEFICIT", ignored -> new ConcurrentLinkedDeque<>());
            window.addLast(now); while (!window.isEmpty() && Duration.between(window.peekFirst(), now).toMinutes() > lightDuration) window.removeFirst();
            String message = "当前阶段「" + context.get("stageLabel") + "」光照强度仅 " + round(value)
                    + " lux，低于参考下限 " + round(lightLowThreshold) + " lux。请检查遮挡或启用补光。";
            Map<String, Object> alert = upsertRuleAlert(plotId, "LIGHT_DEFICIT_RULE", "MEDIUM", "光照不足", message, event, lightLowRule,
                    lightLowThreshold, context, now, window.size() >= 3 ? "TRIGGERED" : "CANDIDATE");
            result.put("risk", "LIGHT_DEFICIT"); result.put("alert", alert);
            if (store.find("plot", plotId) != null && !Jsons.bool(alert, "reused", false) && !Jsons.bool(alert, "suppressedByCooldown", false)) {
                result.put("diagnosis", diagnose(plotId, Map.of("scenarioId", Jsons.text(event, "scenarioId", "normal"))));
            }
        }
        if ("LIGHT".equals(metric) && value > lightHighThreshold) {
            Instant now = Instant.now();
            int lightDuration = (int) Jsons.whole(lightHighRule, "durationMinutes", 5);
            Deque<Instant> window = ruleWindows.computeIfAbsent(plotId + "|LIGHT_EXCESS", ignored -> new ConcurrentLinkedDeque<>());
            window.addLast(now); while (!window.isEmpty() && Duration.between(window.peekFirst(), now).toMinutes() > lightDuration) window.removeFirst();
            String message = "当前阶段「" + context.get("stageLabel") + "」光照强度已达 " + round(value)
                    + " lux，高于参考上限 " + round(lightHighThreshold) + " lux。请检查遮阳或通风。";
            Map<String, Object> alert = upsertRuleAlert(plotId, "LIGHT_EXCESS_RULE", "MEDIUM", "光照过强", message, event, lightHighRule,
                    lightHighThreshold, context, now, window.size() >= 3 ? "TRIGGERED" : "CANDIDATE");
            result.put("risk", "LIGHT_EXCESS"); result.put("alert", alert);
            if (store.find("plot", plotId) != null && !Jsons.bool(alert, "reused", false) && !Jsons.bool(alert, "suppressedByCooldown", false)) {
                result.put("diagnosis", diagnose(plotId, Map.of("scenarioId", Jsons.text(event, "scenarioId", "normal"))));
            }
        }
        return result;
    }

    // ---- 系统级自动告警（非规则触发：服务/设备/超时/延迟）----
    private final Map<String, Long> systemAlertCooldown = new ConcurrentHashMap<>();

    /**
     * 创建系统级告警（设备心跳、命令超时、Redis 延迟、服务重启等）。
     * 同一 source+plotId 10 分钟冷却，避免定时扫描刷屏。
     */
    private Map<String, Object> createSystemAlert(String source, String level, String title, String message, String plotId) {
        Instant now = Instant.now();
        String cooldownKey = source + ":" + (plotId == null ? "" : plotId);
        Long last = systemAlertCooldown.get(cooldownKey);
        if (last != null && now.toEpochMilli() - last < 10 * 60 * 1000L) return null;
        systemAlertCooldown.put(cooldownKey, now.toEpochMilli());
        Map<String, Object> alert = new LinkedHashMap<>();
        alert.put("alertId", Jsons.id("alert"));
        alert.put("farmId", "farm-demo");
        alert.put("plotId", plotId == null ? "" : plotId);
        alert.put("level", level);
        alert.put("source", source);
        alert.put("status", "ACTIVE");
        alert.put("title", title);
        alert.put("message", message);
        alert.put("createdAt", now.toString());
        alert.put("updatedAt", now.toString());
        store.save("alert", Jsons.text(alert, "alertId", ""), alert);
        events.publish("alert.created", alert);
        store.logEvent("alert.created", alert);
        return alert;
    }

    /** 定时检查设备心跳超时（默认 90 秒），超时产生 MEDIUM 告警。 */
    @Scheduled(fixedDelay = 30000)
    void checkDeviceHeartbeatAlerts() {
        Instant now = Instant.now();
        long timeoutSeconds = properties.getDeviceTimeoutSeconds();
        for (Map<String, Object> device : store.list("device")) {
            if (!"ONLINE".equalsIgnoreCase(Jsons.text(device, "status", ""))) continue;
            Instant lastSeen = Jsons.instant(device.get("lastSeen"), Instant.EPOCH);
            if (lastSeen.getEpochSecond() <= 0) continue;
            long seconds = Duration.between(lastSeen, now).getSeconds();
            if (seconds > timeoutSeconds) {
                createSystemAlert("DEVICE_HEARTBEAT", "MEDIUM", "设备心跳超时",
                        "设备 " + Jsons.text(device, "deviceId", "未知") + " 已 " + seconds + " 秒未上报心跳（阈值 " + timeoutSeconds + " 秒）。",
                        Jsons.text(device, "plotId", ""));
            }
        }
    }

    /** 定时检查 Redis 往返延迟，超过 5 秒产生 WARNING 告警。 */
    @Scheduled(fixedDelay = 30000)
    void checkRedisLatencyAlert() {
        long latency = redisPingLatencyMs();
        if (latency >= 5000) {
            createSystemAlert("REDIS_LATENCY", "WARNING", "Redis 响应延迟过高",
                    "Redis PING 往返延迟 " + latency + "ms，超过 5 秒阈值。", "");
        }
    }

    private Map<String, Object> upsertRuleAlert(String plotId, String source, String level, String title, String message,
                                                Map<String, Object> event, Map<String, Object> rule, double threshold,
                                                Map<String, Object> context, Instant now, String ruleState) {
        // Alert de-duplication is independent from irrigation execution.  A
        // WATER_DEFICIT rule may now set cooldownMinutes=0 (no watering
        // protection) while retaining a small alert-only quiet period.
        int cooldownMinutes = (int) Math.max(0, Jsons.whole(rule, "alertCooldownMinutes",
                Jsons.whole(rule, "cooldownMinutes", 120)));
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
        Instant to = now.plusSeconds(1);
        Instant qualityWindowStart = now.minus(30, ChronoUnit.MINUTES);
        Instant realCutoff = now.minus(Math.max(1, properties.getRealSourceTimeoutSeconds()), ChronoUnit.SECONDS);
        Map<String, Map<String, Object>> latest = new LinkedHashMap<>();
        Map<String, Long> validSamplesByMetric = new HashMap<>();
        Map<String, Map<String, Object>> databaseWindow = store.latestMetricWindow(
                plotId, from, to, realCutoff, qualityWindowStart);
        if (databaseWindow != null) {
            databaseWindow.forEach((metric, sample) -> {
                Map<String, Object> copy = Jsons.copy(mapper, sample);
                validSamplesByMetric.put(metric, Jsons.whole(copy, "_validSamples", 0));
                copy.remove("_validSamples");
                latest.put(metric, copy);
            });
        } else {
            List<Map<String, Object>> samples = store.telemetry(plotId, null, from, to, 10000);
            Map<String, Map<String, Object>> activeReal = new LinkedHashMap<>();
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
            activeReal.forEach(latest::put);
            for (String metric : latest.keySet()) {
                long count = samples.stream()
                        .filter(item -> metric.equalsIgnoreCase(Jsons.text(item, "metric", "")))
                        .filter(item -> !Jsons.instant(item.get("ts"), Instant.EPOCH).isBefore(qualityWindowStart))
                        .filter(item -> !"BAD".equalsIgnoreCase(Jsons.text(Jsons.map(mapper, item.get("quality")), "status", "GOOD")))
                        .count();
                validSamplesByMetric.put(metric, count);
            }
        }
        int expectedSamples = 90; // simulator/default collection cadence: 20 seconds
        latest.replaceAll((metric, sample) -> {
            Map<String, Object> enriched = Jsons.copy(mapper, sample);
            Map<String, Object> quality = Jsons.map(mapper, enriched.get("quality"));
            long validSamples = validSamplesByMetric.getOrDefault(metric, 0L);
            quality.put("freshnessMs", Math.max(0, Duration.between(Jsons.instant(enriched.get("ts"), now), now).toMillis()));
            quality.put("validSamples", validSamples);
            quality.put("expectedSamples", expectedSamples);
            quality.put("completeness", round(Math.min(1.0, validSamples / (double) expectedSamples)));
            quality.putIfAbsent("confidence", "GOOD".equalsIgnoreCase(Jsons.text(quality, "status", "GOOD")) ? .98 : .65);
            quality.put("windowMinutes", 30);
            quality.put("calculationVersion", "telemetry-quality-v1");
            enriched.put("quality", quality);
            return enriched;
        });
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
        if (deviceIsSimulated(device)) return false;
        String source = Jsons.text(device, "sourceMode", Jsons.text(device, "dataOrigin", ""))
                .trim().toUpperCase(Locale.ROOT);
        String id = Jsons.text(device, "deviceId", "").trim().toLowerCase(Locale.ROOT);
        return "REAL".equals(source)
                || "HARDWARE".equals(source)
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
        } else if (simulatorManualOnlineOverride(device, Jsons.text(input, "sourceMode", ""))) {
            // Ignore a stale/scene-generated OFFLINE status after the
            // administrator has explicitly brought a simulated device back.
            device.put("status", "ONLINE");
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
        if (device == null || device.isEmpty()) return false;
        String source = Jsons.text(device, "sourceMode", Jsons.text(device, "dataOrigin", "")).trim().toUpperCase(Locale.ROOT);
        String deviceId = Jsons.text(device, "deviceId", "").trim().toLowerCase(Locale.ROOT);
        if ("REAL".equals(source) || "HARDWARE".equals(source)) return false;
        return Set.of("SIMULATION", "SIMULATED", "SIMULATOR").contains(source) || deviceId.startsWith("mock-");
    }

    private boolean simulatorManualOnlineOverride(Map<String, Object> device, String incomingSourceMode) {
        if (!deviceIsSimulated(device)) return false;
        String deviceId = Jsons.text(device, "deviceId", "").toLowerCase(Locale.ROOT);
        String source = incomingSourceMode == null || incomingSourceMode.isBlank()
                ? Jsons.text(device, "sourceMode", Jsons.text(device, "dataOrigin", ""))
                : incomingSourceMode;
        if (!("SIMULATION".equalsIgnoreCase(source) || "SIMULATED".equalsIgnoreCase(source)
                || "SIMULATOR".equalsIgnoreCase(source) || deviceId.startsWith("mock-"))) return false;
        String override = Jsons.text(device, "manualStatusOverride", "").trim().toUpperCase(Locale.ROOT);
        if ("ONLINE".equals(override)) return true;
        // Backward compatibility for successful ONLINE controls written by an
        // older server before the explicit override field existed.
        return "SUCCEEDED".equals(Jsons.text(device, "controlStatus", "").toUpperCase(Locale.ROOT))
                && "ONLINE".equals(Jsons.text(device, "desiredStatus", "").toUpperCase(Locale.ROOT))
                && !Jsons.text(device, "lastControlCommandId", "").isBlank();
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
                if (deviceIsSimulated(device)) {
                    device.put("manualStatusOverride", target);
                    device.put("manualStatusOverrideAt", ack.get("receivedAt"));
                    if ("ONLINE".equals(target)) device.put("lastSeen", ack.get("receivedAt"));
                } else {
                    device.remove("manualStatusOverride");
                    device.remove("manualStatusOverrideAt");
                }
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
            // 控制命令执行超时告警（HIGH）：设备未在窗口内返回回执
            createSystemAlert("CONTROL_TIMEOUT", "HIGH", "控制命令执行超时",
                    "命令 " + Jsons.text(command, "commandId", "未知") + "（" + Jsons.text(command, "type", "") + "）未在 15 秒内收到设备回执。",
                    Jsons.text(command, "plotId", ""));
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
        store.save("alert", alertId, alert); events.publish("alert." + normalized.toLowerCase(Locale.ROOT), alert); store.logEvent("alert." + normalized.toLowerCase(Locale.ROOT), alert);
        if ("CLOSED".equals(normalized) || "RESOLVED".equals(normalized)) governance.recordAlertOutcome(alert, Map.of("result", normalized, "resolutionAction", "CLOSE"), principal);
        return alert;
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

    private Map<String, Object> chooseResourceAssignee(String farmId, String plotId, List<Map<String, Object>> requests) {
        Map<String, Object> requester = requests.stream()
                .map(request -> store.userById(Jsons.text(request, "requestedBy", "")))
                .filter(user -> isEligibleFarmerForPlot(user, farmId, plotId))
                .findFirst().orElse(null);
        return requester != null ? requester : chooseBestFarmerForPlot(farmId, plotId);
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
        double lightLowThreshold = cropPackCatalog.threshold(cropContext, "LIGHT_DEFICIT", 15000);
        double lightHighThreshold = cropPackCatalog.threshold(cropContext, "LIGHT_EXCESS", 30000);
        double waterScore = Double.isNaN(moisture) ? 0.15 : Math.max(0, Math.min(0.95, (waterThreshold - moisture) / Math.max(1.0, waterThreshold) + 0.35));
        double driftScore = explicitDrift ? 0.92 : 0.08;
        double deviceScore = "OFFLINE".equals(Jsons.text(device, "status", "ONLINE")) ? 0.9 : 0.05;
        candidates.add(candidate("WATER_DEFICIT", waterScore)); candidates.add(candidate("SENSOR_DRIFT", driftScore)); candidates.add(candidate("DEVICE_FAULT", deviceScore));
        if (Jsons.number(Jsons.map(mapper, latest.get("AIR_TEMPERATURE")), "value", 0) > heatThreshold) candidates.add(candidate("HEAT_STRESS", 0.76));
        Map<String, Object> light = latest.get("LIGHT") instanceof Map<?, ?> value ? Jsons.map(mapper, value) : Map.of();
        double lightValue = Jsons.number(light, "value", Double.NaN);
        if (Double.isFinite(lightValue) && lightValue < lightLowThreshold) {
            double confidence = Math.max(.45, Math.min(.92, (lightLowThreshold - lightValue) / Math.max(1, lightLowThreshold) + .45));
            candidates.add(candidate("LIGHT_DEFICIT", confidence));
        }
        if (Double.isFinite(lightValue) && lightValue > lightHighThreshold) {
            double confidence = Math.max(.45, Math.min(.92, (lightValue - lightHighThreshold) / Math.max(1, lightHighThreshold) + .45));
            candidates.add(candidate("LIGHT_EXCESS", confidence));
        }
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
        if ("LIGHT_DEFICIT".equals(primary) || "LIGHT_EXCESS".equals(primary)) {
            supporting.add(Map.of("type", "telemetry", "metric", "LIGHT", "value", lightValue, "unit", "lux", "provenance", "OBSERVED"));
            missing.add("现场遮挡/遮阳核验");
        }
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
        diagnosis.put("stageLabel", cropContext.get("stageLabel")); diagnosis.put("thresholds", Map.of("WATER_DEFICIT", waterThreshold, "HEAT_STRESS", heatThreshold,
                "LIGHT_DEFICIT", lightLowThreshold, "LIGHT_EXCESS", lightHighThreshold));
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
                rawNarrative = callOpenAiCompatibleWithFallback(
                        "请结合这次诊断的当前地块事实和用户上下文，像农技员一样自然解释结果。规则字段是事实来源，只使用给定的支持、反向和缺失证据；不要为了格式固定标题，也不要主动输出置信度。证据不足就说明还需要什么复测。不要生成灌溉剂量、控制命令、SQL、MQTT topic 或 HTTP 请求。",
                        facts, List.of(), List.of());
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
        return "结论：当前规则诊断更偏向 " + diagnosisCauseLabel(cause) + "。";
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
            case "INSUFFICIENT_EVIDENCE", "EVIDENCE_INSUFFICIENT" -> "证据不足";
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
            case "HUMAN_EVIDENCE_REVIEW" -> "复核人工现场证据";
            case "SOIL_MOISTURE" -> "土壤湿度数据";
            case "GOOD_DATA_QUALITY" -> "合格数据质量";
            case "QUALITY_REVIEW" -> "数据质量复核";
            case "CONTROL_PERMISSION" -> "灌溉执行权限";
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
        boolean automaticWatering = Jsons.bool(request, "automatic", false);
        boolean canControl = principal != null && principal.canControl();
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
        boolean dataQualityBlocked = soil.isEmpty()
                || "BAD".equals(qualityStatus)
                || anyMetricBad
                || ("SENSOR_DRIFT".equals(primary) && diagnosisConfidence >= 0.6);
        boolean deviceBlocked = "OFFLINE".equals(Jsons.text(device, "status", "OFFLINE"))
                || configuredOffline
                || ("DEVICE_FAULT".equals(primary) && diagnosisConfidence >= 0.6);
        boolean hardDataBlock = dataQualityBlocked || deviceBlocked;
        boolean reviewOnly = !hardDataBlock
                && (anyMetricDegraded || "DEGRADED".equals(qualityStatus) || "SENSOR_DRIFT".equals(primary) || "INSUFFICIENT_EVIDENCE".equals(primary));
        // A heavy-rain strategy keeps the recommendation advisory while rain
        // is active; the user can still inspect the amount but cannot mistake
        // it for an automatic watering order.
        reviewOnly = reviewOnly || activeHeavyRain;
        Map<String, Object> cropContext = plotCropContext(plotId);
        Map<String, Object> waterRule = cropPackCatalog.rule(cropContext, "WATER_DEFICIT");
        double waterThreshold = Jsons.number(waterRule, "threshold", 20);
        double emergencyThreshold = Math.max(1, Jsons.number(waterRule, "automaticWateringThreshold",
                Jsons.number(waterRule, "emergencyThreshold", AUTO_WATERING_THRESHOLD)));
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
        // A healthy reading at or above the deterministic irrigation target is
        // a complete NO_ACTION decision.  A low-confidence root-cause label is
        // not a reason to send the farmer through an evidence workflow when
        // there is no moisture deficit to treat.
        boolean noWaterNeeded = !hardDataBlock && duration <= 0 && currentMoisture >= target;
        boolean automaticEnabled = automaticWateringEnabled(plotId);
        boolean emergencyEligible = automaticEnabled && !hardDataBlock && !reviewOnly && "READY".equals(readinessStatus)
                && duration > 0 && currentMoisture < emergencyThreshold;
        String why = hardDataBlock
                ? "数据质量或设备状态未通过硬门，先补证更稳妥"
                : activeHeavyRain
                    ? "当前地块处于暴雨模拟场景，先观察积水和排水状态"
                : noWaterNeeded
                    ? "当前湿度已达到阶段目标，暂时不需要灌溉"
                : reviewOnly
                    ? "数据有轻度不确定性，先给人工复核版参考，不自动执行"
                : emergencyEligible ? "当前土壤湿度已低于 10%，满足自动浇水触发条件"
                : "土壤湿度低于当前阶段目标";
        plan.put("why", why); plan.put("evidence", List.of(soil, diagnosis));
        Map<String, Object> emergency = new LinkedHashMap<>();
        emergency.put("eligible", emergencyEligible);
        emergency.put("threshold", emergencyThreshold);
        emergency.put("currentMoisture", currentMoisture);
        emergency.put("mode", "AUTOMATIC_SOIL_MOISTURE");
        emergency.put("note", emergencyEligible
                ? "低于 10% 时可自动发起虚拟浇水；仍会重新检查数据、设备、资源和权限"
                : hardDataBlock ? "数据质量或设备状态不足，不能发起应急补水"
                : reviewOnly ? "需要人工复核或补证后才能判断是否应急"
                : "当前湿度未达到应急阈值");
        plan.put("emergency", emergency);
        plan.put("emergencyEligible", emergencyEligible);
        Map<String, Object> automatic = new LinkedHashMap<>();
        automatic.put("enabled", automaticEnabled);
        automatic.put("threshold", AUTO_WATERING_THRESHOLD);
        automatic.put("currentMoisture", currentMoisture);
        automatic.put("eligible", emergencyEligible);
        automatic.put("mode", "AUTOMATIC_SOIL_MOISTURE");
        automatic.put("sourceMode", "SIMULATION");
        automatic.put("status", !automaticEnabled ? "DISABLED" : emergencyEligible ? "READY" : hardDataBlock || reviewOnly ? "BLOCKED" : "NOT_TRIGGERED");
        automatic.put("note", emergencyEligible
                ? "土壤含水量低于 10%，满足自动虚拟浇水触发条件"
                : "土壤含水量达到 10% 或以上时不自动浇水");
        plan.put("automaticWatering", automatic);
        boolean executable = !hardDataBlock && !reviewOnly && !noWaterNeeded && "READY".equals(readinessStatus) && duration > 0;
        plan.put("readinessId", readinessResult.get("readinessId"));
        plan.put("requiresApproval", false); plan.put("requiresAdminApproval", false);
        plan.put("confirmationRequired", !automaticWatering);
        plan.put("executionMode", automaticWatering ? "AUTOMATIC_THRESHOLD" : "OPERATOR_CONFIRMED");
        plan.put("advisoryOnly", !executable); plan.put("executable", executable); plan.put("readinessStatus", readinessStatus);
        plan.put("status", hardDataBlock ? "BLOCKED" : noWaterNeeded ? "NO_ACTION" : reviewOnly ? "HUMAN_REVIEW" : "PROPOSED"); plan.put("createdAt", Instant.now().toString());
        Map<String, Object> manualLimits = irrigationWaterLimits(plotId, plot, resource);
        List<String> bypassedGates = new ArrayList<>();
        if (dataQualityBlocked || anyMetricDegraded || "DEGRADED".equals(qualityStatus)) {
            bypassedGates.add("DATA_QUALITY");
        }
        if ("SENSOR_DRIFT".equals(primary) && hardDataBlock) bypassedGates.add("DATA_CONFLICT");
        if (deviceBlocked) bypassedGates.add("DEVICE_HEALTH");
        if (reviewOnly) bypassedGates.add("DIAGNOSIS_EVIDENCE");
        if (!"READY".equals(readinessStatus)) bypassedGates.add("DECISION_READINESS");
        boolean manualBlockedState = !noWaterNeeded && !executable && !bypassedGates.isEmpty();
        double manualMaxWater = Jsons.number(manualLimits, "maxWaterLitre", 0);
        boolean manualAvailable = manualBlockedState && canControl && resource != null
                && manualMaxWater >= MIN_MANUAL_IRRIGATION_LITRES;
        Map<String, Object> manualFallback = new LinkedHashMap<>();
        manualFallback.put("available", manualAvailable);
        manualFallback.put("reasonCode", manualBlockedState ? ("SENSOR_DRIFT".equals(primary) ? "DATA_CONFLICT" : "SAFETY_GATE_BLOCKED") : "NONE");
        manualFallback.put("reason", manualBlockedState ? why : "当前没有需要人工兜底的灌溉阻塞");
        manualFallback.put("bypassedGates", bypassedGates);
        manualFallback.put("virtualOnly", true);
        manualFallback.put("noCooldown", true);
        manualFallback.put("constraints", manualLimits);
        plan.put("manualFallback", manualFallback);
        store.save("irrigation-plan", Jsons.text(plan, "planId", ""), plan); events.publish("irrigation.plan.created", plan); store.logEvent("irrigation.plan.created", plan);
        return plan;
    }

    private Map<String, Object> irrigationWaterLimits(String plotId, Map<String, Object> plot, Map<String, Object> resource) {
        Map<String, Object> limits = new LinkedHashMap<>();
        double flow = Math.max(1, Jsons.number(resource, "flowRateLitresPerMinute", 18));
        double maxByDuration = flow * properties.getMaxIrrigationSeconds() / 60.0;
        double dailyRemaining = properties.getDailyWaterLimitLitres();
        double capacityRemaining = Jsons.number(resource, "capacityLitres", properties.getDailyWaterLimitLitres());
        if (resource != null) {
            String farmId = Jsons.text(plot, "farmId", farmIdForPlot(plotId));
            Map<String, Object> balance = currentWaterBalance(farmId, LocalDate.now(waterZone(resource)));
            dailyRemaining = Math.max(0, Jsons.number(balance, "remainingLitres", dailyRemaining));
            double allocated = store.list("command").stream()
                    .filter(c -> plotId.equals(Jsons.text(c, "plotId", "")))
                    .filter(c -> !Set.of("SUCCEEDED", "PARTIAL", "FAILED", "TIMEOUT", "CANCELLED")
                            .contains(Jsons.text(c, "status", "").toUpperCase(Locale.ROOT)))
                    .mapToDouble(c -> Jsons.number(c, "waterLitre", 0)).sum();
            capacityRemaining = Math.max(0, Jsons.number(resource, "capacityLitres", dailyRemaining) - allocated);
        } else {
            capacityRemaining = 0;
        }
        double maxWater = Math.max(0, Math.min(maxByDuration, Math.min(dailyRemaining, capacityRemaining)));
        limits.put("minWaterLitre", MIN_MANUAL_IRRIGATION_LITRES);
        limits.put("maxWaterLitre", roundLitres(maxWater));
        limits.put("maxDurationSeconds", properties.getMaxIrrigationSeconds());
        limits.put("flowRateLitresPerMinute", flow);
        limits.put("dailyRemainingLitres", roundLitres(dailyRemaining));
        limits.put("resourceRemainingLitres", roundLitres(capacityRemaining));
        return limits;
    }

    Map<String, Object> irrigationGuard(String plotId, UserPrincipal principal) {
        ensurePlotAccess(principal, plotId);
        Map<String, Object> context = plotCropContext(plotId);
        Map<String, Object> rule = cropPackCatalog.rule(context, "WATER_DEFICIT");
        double threshold = Jsons.number(rule, "threshold", 20);
        double emergencyThreshold = Math.max(1, Jsons.number(rule, "automaticWateringThreshold",
                Jsons.number(rule, "emergencyThreshold", AUTO_WATERING_THRESHOLD)));
        double hysteresis = Math.max(0, Jsons.number(rule, "hysteresis", 2));
        Map<String, Object> soil = latestMetrics(plotId).get("SOIL_MOISTURE") instanceof Map<?, ?> metric
                ? Jsons.map(mapper, metric) : Map.of();
        double moisture = Jsons.number(soil, "value", Double.NaN);
        String hysteresisState = Double.isNaN(moisture) ? "UNAVAILABLE"
                : moisture <= threshold ? "TRIGGERED"
                : moisture <= threshold + hysteresis ? "HOLD"
                : "RESET";

        Map<String, Object> lastCommand = store.list("command").stream()
                .filter(command -> plotId.equals(Jsons.text(command, "plotId", "")))
                .filter(command -> "IRRIGATION_START".equals(Jsons.text(command, "type", "")))
                .filter(command -> Set.of("SUCCEEDED", "PARTIAL", "CONFIRMED", "APPROVED", "EXECUTING").contains(Jsons.text(command, "status", "").toUpperCase(Locale.ROOT)))
                .max(Comparator.comparing(command -> Jsons.instant(
                        Jsons.map(mapper, command.get("ack")).get("receivedAt"),
                        Jsons.instant(command.get("cooldownStartedAt"), Jsons.instant(command.get("approvedAt"), Instant.EPOCH)))))
                .map(command -> Jsons.copy(mapper, command)).orElse(null);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("plotId", plotId);
        // Irrigation deliberately has no time-based duplicate/cooldown
        // protection.  Idempotency keys still prevent a retried request from
        // creating the same command twice, while every new request is checked
        // against the current safety gates.
        result.put("state", "AVAILABLE");
        result.put("cooldownMinutes", 0);
        result.put("cooldownStartedAt", null);
        result.put("cooldownUntil", null);
        result.put("remainingSeconds", 0);
        result.put("lastCommandId", lastCommand == null ? null : lastCommand.get("commandId"));
        result.put("lastOutcome", lastCommand == null ? null : lastCommand.get("status"));
        Map<String, Object> emergency = new LinkedHashMap<>();
        emergency.put("threshold", emergencyThreshold);
        emergency.put("currentMoisture", Double.isNaN(moisture) ? null : moisture);
        emergency.put("eligibleByMoisture", !Double.isNaN(moisture) && moisture < emergencyThreshold);
        emergency.put("mode", "AUTOMATIC_SOIL_MOISTURE");
        emergency.put("note", "低于 10% 时可自动发起虚拟浇水；仍需通过最新数据、设备健康和资源上限校验");
        result.put("emergency", emergency);
        boolean automaticEnabled = automaticWateringEnabled(plotId);
        Map<String, Object> automatic = new LinkedHashMap<>();
        automatic.put("enabled", automaticEnabled);
        automatic.put("threshold", AUTO_WATERING_THRESHOLD);
        automatic.put("currentMoisture", Double.isNaN(moisture) ? null : moisture);
        automatic.put("eligible", automaticEnabled && !Double.isNaN(moisture) && moisture < AUTO_WATERING_THRESHOLD);
        automatic.put("mode", "AUTOMATIC_SOIL_MOISTURE");
        automatic.put("sourceMode", "SIMULATION");
        automatic.put("status", !automaticEnabled ? "DISABLED" : Double.isNaN(moisture) ? "UNAVAILABLE" : moisture < AUTO_WATERING_THRESHOLD ? "READY" : "NOT_TRIGGERED");
        result.put("automaticWatering", automatic);
        Map<String, Object> hysteresisView = new LinkedHashMap<>();
        hysteresisView.put("state", hysteresisState);
        hysteresisView.put("threshold", threshold);
        hysteresisView.put("resetThreshold", threshold + hysteresis);
        hysteresisView.put("currentValue", Double.isNaN(moisture) ? null : moisture);
        hysteresisView.put("unit", Jsons.text(soil, "unit", "%"));
        result.put("hysteresis", hysteresisView);
        result.put("ruleVersion", context.get("ruleVersion"));
        result.put("cropPackVersion", context.get("cropPackVersion"));
        result.put("evaluatedAt", Instant.now().toString());
        result.put("provenance", "DERIVED");
        return result;
    }

    private boolean automaticWateringEnabled(String plotId) {
        Map<String, Object> plot = store.find("plot", plotId);
        return plot == null || Jsons.bool(plot, "automaticWateringEnabled", true);
    }

    Map<String, Object> automaticWateringSetting(String plotId, UserPrincipal principal) {
        ensurePlotAccess(principal, plotId);
        Map<String, Object> plot = requireRecord("plot", plotId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("plotId", plotId);
        result.put("enabled", Jsons.bool(plot, "automaticWateringEnabled", true));
        result.put("threshold", AUTO_WATERING_THRESHOLD);
        result.put("updatedAt", plot.get("automaticWateringUpdatedAt"));
        result.put("updatedBy", plot.get("automaticWateringUpdatedBy"));
        result.put("sourceMode", "SIMULATION");
        result.put("provenance", plot.get("automaticWateringUpdatedBy") == null ? "DERIVED" : "USER_PROVIDED");
        return result;
    }

    Map<String, Object> updateAutomaticWateringSetting(String plotId, Map<String, Object> input, UserPrincipal principal) {
        ensurePlotAccess(principal, plotId);
        if (!principal.canRequestIrrigation()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "CONTROL_FORBIDDEN", "当前角色不能修改自动浇水设置");
        }
        Map<String, Object> plot = requireRecord("plot", plotId);
        boolean enabled = Jsons.bool(input, "enabled", Jsons.bool(plot, "automaticWateringEnabled", true));
        Instant now = Instant.now();
        plot.put("automaticWateringEnabled", enabled);
        plot.put("automaticWateringUpdatedAt", now.toString());
        plot.put("automaticWateringUpdatedBy", principal.userId);
        store.save("plot", plotId, plot);
        Map<String, Object> result = automaticWateringSetting(plotId, principal);
        events.publish("irrigation.automatic.updated", result);
        store.logEvent("irrigation.automatic.updated", result);
        return result;
    }

    Map<String, Object> commandById(String commandId, UserPrincipal principal) {
        Map<String, Object> command = requireRecord("command", commandId);
        ensurePlotAccess(principal, Jsons.text(command, "plotId", ""));
        return command;
    }

    Map<String, Object> irrigationPlanById(String planId, UserPrincipal principal) {
        Map<String, Object> plan = requireRecord("irrigation-plan", planId);
        ensurePlotAccess(principal, Jsons.text(plan, "plotId", ""));
        return plan;
    }

    /**
     * Evaluate the farmer's soil-moisture threshold and, when every existing
     * deterministic gate is healthy, start one virtual watering command.  This
     * is deliberately event/idempotency based rather than time based: there is
     * no irrigation cooldown, but the same telemetry event can never create a
     * second command when the browser polls or retries the endpoint.
     */
    Map<String, Object> automaticWatering(Map<String, Object> request, UserPrincipal principal) {
        Map<String, Object> input = request == null ? Map.of() : request;
        String plotId = Jsons.text(input, "plotId", "plot-a01");
        ensurePlotAccess(principal, plotId);
        Map<String, Object> latest = latestMetrics(plotId);
        Map<String, Object> soil = latest.get("SOIL_MOISTURE") instanceof Map<?, ?> metric
                ? Jsons.map(mapper, metric) : Map.of();
        Map<String, Object> quality = Jsons.map(mapper, soil.get("quality"));
        double moisture = Jsons.number(soil, "value", Double.NaN);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("plotId", plotId);
        boolean enabled = automaticWateringEnabled(plotId);
        result.put("enabled", enabled);
        result.put("threshold", AUTO_WATERING_THRESHOLD);
        result.put("currentMoisture", Double.isFinite(moisture) ? moisture : null);
        result.put("sourceMode", "SIMULATION");
        result.put("mode", "AUTOMATIC_SOIL_MOISTURE");
        result.put("virtualExecution", true);
        if (!enabled) {
            result.put("status", "DISABLED");
            result.put("reason", "AUTOMATIC_WATERING_DISABLED");
            return result;
        }
        if (!Double.isFinite(moisture)) {
            result.put("status", "BLOCKED");
            result.put("reason", "SOIL_MOISTURE_UNAVAILABLE");
            return result;
        }
        if (moisture >= AUTO_WATERING_THRESHOLD) {
            result.put("status", "NOT_TRIGGERED");
            result.put("reason", "MOISTURE_ABOVE_THRESHOLD");
            return result;
        }
        String qualityStatus = Jsons.text(quality, "status", "BAD").toUpperCase(Locale.ROOT);
        if (!"GOOD".equals(qualityStatus)) {
            result.put("status", "BLOCKED");
            result.put("reason", "SOIL_MOISTURE_QUALITY_" + qualityStatus);
            result.put("qualityStatus", qualityStatus);
            return result;
        }
        String eventId = Jsons.text(soil, "eventId", "");
        String traceId = Jsons.text(input, "traceId", "");
        if (traceId.isBlank()) traceId = "auto-watering-" + (eventId.isBlank() ? plotId + "-" + Jsons.text(soil, "ts", "now") : eventId);
        Map<String, Object> planRequest = new LinkedHashMap<>();
        planRequest.put("plotId", plotId);
        planRequest.put("traceId", traceId);
        planRequest.put("automatic", true);
        Map<String, Object> plan;
        try {
            plan = irrigationPlan(planRequest, principal);
            result.put("planId", plan.get("planId"));
            if (!Jsons.bool(plan, "executable", false) || !"READY".equals(Jsons.text(plan, "readinessStatus", ""))) {
                result.put("status", "BLOCKED");
                result.put("reason", Jsons.text(plan, "why", "IRRIGATION_PLAN_NOT_READY"));
                result.put("plan", plan);
                return result;
            }
            String idempotencyKey = Jsons.text(input, "idempotencyKey", "");
            if (idempotencyKey.isBlank()) idempotencyKey = "auto-watering:" + plotId + ":" + (eventId.isBlank() ? Jsons.text(soil, "ts", "latest") : eventId);
            Map<String, Object> commandRequest = new LinkedHashMap<>();
            commandRequest.put("plotId", plotId);
            commandRequest.put("planId", plan.get("planId"));
            commandRequest.put("idempotencyKey", idempotencyKey);
            commandRequest.put("confirmed", true);
            commandRequest.put("automatic", true);
            commandRequest.put("source", "auto-soil-moisture");
            commandRequest.put("traceId", traceId);
            Map<String, Object> command = createCommand(commandRequest, principal);
            result.put("status", "TRIGGERED");
            result.put("reason", "SOIL_MOISTURE_BELOW_THRESHOLD");
            result.put("idempotencyKey", idempotencyKey);
            result.put("command", command);
            result.put("plan", plan);
            return result;
        } catch (ApiException error) {
            result.put("status", "BLOCKED");
            result.put("reason", error.code);
            result.put("message", error.getMessage());
            return result;
        } catch (RuntimeException error) {
            result.put("status", "BLOCKED");
            result.put("reason", "AUTO_WATERING_FAILED");
            result.put("message", error.getMessage() == null ? "自动浇水未能发起" : error.getMessage());
            return result;
        }
    }

    private Map<String, Object> automaticWateringForEvent(Map<String, Object> event) {
        UserPrincipal systemActor = new UserPrincipal("system:auto-watering", "auto-watering", "SYSTEM_ADMIN", List.of("*"), List.of("*"));
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("plotId", Jsons.text(event, "plotId", "plot-a01"));
        request.put("traceId", "auto-watering:" + Jsons.text(event, "eventId", Jsons.id("telemetry")));
        request.put("idempotencyKey", "auto-watering:" + Jsons.text(event, "plotId", "plot-a01") + ":" + Jsons.text(event, "eventId", "latest"));
        return automaticWatering(request, systemActor);
    }

    Map<String, Object> commandEvaluation(String commandId, UserPrincipal principal) {
        Map<String, Object> command = commandById(commandId, principal);
        return commandEvaluation(Jsons.text(command, "commandId", commandId));
    }

    /**
     * Start a bounded virtual fill-light operation.  An offline device is
     * accepted only for the local standalone/simulation demo and is explicitly
     * marked as virtual; no hardware command is implied by this endpoint.
     */
    Map<String, Object> virtualLighting(Map<String, Object> request, UserPrincipal principal) {
        Map<String, Object> input = request == null ? Map.of() : request;
        String key = Jsons.text(input, "idempotencyKey", "").trim();
        if (key.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "IDEMPOTENCY_REQUIRED", "补光操作必须携带 idempotencyKey");
        String plotId = Jsons.text(input, "plotId", "plot-a01");
        ensurePlotAccess(principal, plotId);
        if (!principal.canControl()) throw new ApiException(HttpStatus.FORBIDDEN, "CONTROL_FORBIDDEN", "当前角色无补光执行权限");

        Map<String, Object> old = idempotentCommands.get(key);
        if (old == null) {
            Map<String, Object> durableKey = store.find("idempotency", key);
            if (durableKey != null) old = store.find("command", Jsons.text(durableKey, "commandId", ""));
            if (old != null) idempotentCommands.put(key, old);
        }
        if (old != null) {
            if (!plotId.equals(Jsons.text(old, "plotId", ""))) throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_PLOT_MISMATCH", "幂等键已绑定其他地块的补光命令");
            if (!"LIGHT_BOOST".equals(Jsons.text(old, "type", ""))) throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONTEXT_MISMATCH", "幂等键已绑定其他类型的操作");
            return old;
        }
        if (!Jsons.bool(input, "confirmed", Jsons.bool(input, "approved", false))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CONFIRMATION_REQUIRED", "执行补光前需要当前操作人明确确认");
        }

        Map<String, Object> latest = latestMetrics(plotId);
        Map<String, Object> light = latest.get("LIGHT") instanceof Map<?, ?> value ? Jsons.map(mapper, value) : Map.of();
        double current = Jsons.number(light, "value", Double.NaN);
        if (!Double.isFinite(current)) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "LIGHT_UNAVAILABLE", "当前没有可用的光照模拟值，暂不能补光");
        Map<String, Object> context = plotCropContext(plotId);
        Map<String, Object> target = Jsons.map(mapper, context.get("target"));
        double low = Jsons.number(target, "lightLow", 15000);
        double high = Jsons.number(target, "lightHigh", 30000);
        if (current >= high && !Jsons.bool(input, "force", false)) {
            throw new ApiException(HttpStatus.CONFLICT, "LIGHT_ALREADY_HIGH", "当前光照已高于阶段目标，不应继续补光");
        }
        double requestedBoost = Jsons.number(input, "boostLux", Double.NaN);
        if (!Double.isFinite(requestedBoost) || requestedBoost <= 0) requestedBoost = Math.max(1000, (low + high) / 2.0 - current);
        requestedBoost = Math.min(50_000, requestedBoost);
        long duration = Math.max(1, Math.min(900, Jsons.whole(input, "durationSeconds", 60)));
        Map<String, Object> device = deviceForPlot(plotId);
        String deviceStatus = Jsons.text(device, "status", "UNKNOWN").toUpperCase(Locale.ROOT);
        boolean offline = "OFFLINE".equals(deviceStatus);
        boolean demoMode = Set.of("standalone", "simulation").contains(String.valueOf(properties.getMode()).toLowerCase(Locale.ROOT));
        boolean offlineDemo = offline && demoMode && Jsons.bool(input, "allowOfflineDemo", false);
        if (offline && !offlineDemo) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "DEVICE_OFFLINE", "补光设备离线；仅本地演示模式允许虚拟执行");
        double expectedAfter = Math.min(high, current + requestedBoost);
        Map<String, Object> plot = requireRecord("plot", plotId);
        Map<String, Object> command = new LinkedHashMap<>();
        command.put("commandId", Jsons.id("cmd")); command.put("farmId", Jsons.text(plot, "farmId", "farm-demo")); command.put("plotId", plotId);
        command.put("deviceId", Jsons.text(device, "deviceId", "mock-" + plotId)); command.put("type", "LIGHT_BOOST");
        command.put("durationSeconds", duration); command.put("lightLux", requestedBoost); command.put("expectedLightBefore", current); command.put("expectedLightAfter", expectedAfter);
        command.put("targetLightLow", low); command.put("targetLightHigh", high); command.put("deviceStatusAtRequest", deviceStatus);
        command.put("offlineDemoOverride", offlineDemo); command.put("virtualOnly", true); command.put("executionMode", "SIMULATED"); command.put("provenance", "SIMULATED");
        command.put("sourceMode", "SIMULATION"); command.put("idempotencyKey", key); command.put("status", "CONFIRMED"); command.put("requestedBy", principal.userId);
        command.put("confirmedBy", principal.userId); command.put("confirmedAt", Instant.now().toString()); command.put("approvalRequired", false); command.put("confirmationMode", "OPERATOR_CONFIRMED");
        command.put("riskLevel", "MEDIUM"); command.put("source", Jsons.text(input, "source", "farmer-operation-system"));
        store.save("command", Jsons.text(command, "commandId", ""), command); idempotentCommands.put(key, command);
        events.publish("lighting.virtual.confirmed", command); store.logEvent("lighting.virtual.confirmed", command);
        store.save("idempotency", key, Map.of("idempotencyKey", key, "commandId", command.get("commandId"), "createdAt", Instant.now().toString()));
        executeVirtual(command, input);
        return command;
    }

    Map<String, Object> createCommand(Map<String, Object> request, UserPrincipal principal) {
        String key = Jsons.text(request, "idempotencyKey", "");
        if (key.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "IDEMPOTENCY_REQUIRED", "动作接口必须携带 idempotencyKey");
        String plotId = Jsons.text(request, "plotId", "plot-a01");
        boolean manualOverride = Jsons.bool(request, "manualOverride", false);
        String sourcePlanId = Jsons.text(request, "sourcePlanId", "").trim();
        if (manualOverride && sourcePlanId.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "MANUAL_SOURCE_PLAN_REQUIRED", "人工浇灌必须关联被阻塞的灌溉处方");
        }
        // Scope the idempotency replay before looking up a prior command.  A
        // key from another plot must never become a cross-plot read shortcut.
        ensurePlotAccess(principal, plotId);
        if (manualOverride) {
            Map<String, Object> sourcePlanRecord = store.find("irrigation-plan", sourcePlanId);
            if (sourcePlanRecord == null || !plotId.equals(Jsons.text(sourcePlanRecord, "plotId", ""))) {
                throw new ApiException(HttpStatus.CONFLICT, "MANUAL_SOURCE_PLAN_PLOT_MISMATCH", "人工浇灌处方不属于当前地块");
            }
        }
        Map<String, Object> old = idempotentCommands.get(key);
        if (old == null) {
            Map<String, Object> durableKey = store.find("idempotency", key);
            if (durableKey != null) {
                String commandId = Jsons.text(durableKey, "commandId", "");
                old = commandId.isBlank() ? null : store.find("command", commandId);
                if (old != null) idempotentCommands.put(key, old);
            }
        }
        if (old != null) {
            if (manualOverride && !principal.canControl()) {
                throw new ApiException(HttpStatus.FORBIDDEN, "CONTROL_FORBIDDEN", "当前角色无人工浇灌执行权限");
            }
            if (!plotId.equals(Jsons.text(old, "plotId", ""))) {
                throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_PLOT_MISMATCH", "幂等键已绑定其他地块的灌溉命令");
            }
            String requestedPlanId = Jsons.text(request, "planId", sourcePlanId);
            String existingPlanId = manualOverride ? Jsons.text(old, "sourcePlanId", Jsons.text(old, "planId", "")) : Jsons.text(old, "planId", "");
            if (!requestedPlanId.isBlank() && !requestedPlanId.equals(existingPlanId)) {
                throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_PLAN_MISMATCH", "幂等键已绑定其他灌溉处方");
            }
            if (manualOverride) {
                if (!Jsons.bool(old, "manualOverride", false)) {
                    throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONTEXT_MISMATCH", "幂等键已绑定非人工浇灌命令");
                }
                double requestedWater = Jsons.number(request, "waterLitre", Double.NaN);
                double existingWater = Jsons.number(old, "waterLitre", Jsons.number(old, "manualWaterLitre", Double.NaN));
                if (!Double.isFinite(requestedWater) || !Double.isFinite(existingWater) || Math.abs(requestedWater - existingWater) > .0001) {
                    throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_WATER_MISMATCH", "幂等键已绑定其他人工浇灌水量");
                }
            }
            return old;
        }
        if (!principal.canControl()) throw new ApiException(HttpStatus.FORBIDDEN, "CONTROL_FORBIDDEN", "当前角色无控制权限");
        boolean automaticWatering = !manualOverride && Jsons.bool(request, "automatic", false);
        String planId = manualOverride ? sourcePlanId : Jsons.text(request, "planId", ""); Map<String, Object> plan = store.find("irrigation-plan", planId);
        if (plan == null) {
            if (manualOverride) {
                throw new ApiException(HttpStatus.NOT_FOUND, "MANUAL_SOURCE_PLAN_NOT_FOUND", "未找到被阻塞的灌溉处方，请刷新当前地块后重试");
            }
            Map<String, Object> planRequest = new LinkedHashMap<>();
            planRequest.put("plotId", plotId);
            planRequest.put("automatic", automaticWatering);
            if (request.containsKey("traceId")) planRequest.put("traceId", request.get("traceId"));
            plan = irrigationPlan(planRequest, principal);
        }
        if (!plotId.equals(Jsons.text(plan, "plotId", ""))) {
            throw new ApiException(HttpStatus.CONFLICT, "IRRIGATION_PLAN_PLOT_MISMATCH", "灌溉处方与当前地块不一致");
        }
        boolean confirmed = Jsons.bool(request, "confirmed", Jsons.bool(request, "approved", false));
        if (!automaticWatering && !confirmed) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CONFIRMATION_REQUIRED", "执行灌溉前需要当前操作人明确确认（人工确认），无需管理员审批");
        }
        if (manualOverride) {
            Map<String, Object> sourcePlan = plan;
            String freshTraceId = Jsons.text(sourcePlan, "traceId", "manual-fallback:" + sourcePlanId);
            Map<String, Object> refreshed = irrigationPlan(Map.of("plotId", plotId, "traceId", freshTraceId), principal);
            Map<String, Object> refreshedFallback = Jsons.map(mapper, refreshed.get("manualFallback"));
            String refreshedStatus = Jsons.text(refreshed, "status", "").toUpperCase(Locale.ROOT);
            boolean fallbackAvailable = Jsons.bool(refreshedFallback, "available", false);
            if ("NO_ACTION".equals(refreshedStatus) || !fallbackAvailable) {
                throw new ApiException(HttpStatus.CONFLICT, "MANUAL_FALLBACK_NOT_AVAILABLE", "当前地块已不再处于可人工兜底的灌溉阻塞状态")
                        .withDetails(Map.of("sourcePlanId", sourcePlanId, "plan", refreshed));
            }
            plan = refreshed;
            planId = Jsons.text(refreshed, "planId", planId);
        }
        Map<String, Object> readiness = manualOverride
                ? Map.of("status", "BYPASSED", "source", "MANUAL_OPERATOR_OVERRIDE")
                : readiness("IRRIGATION_PLAN", Jsons.text(plan, "planId", planId), principal);
        // A preview may sit for several minutes while telemetry, device health
        // or resource state changes. Confirmation must therefore require both
        // the frozen plan and a fresh safety-gate evaluation to be READY; a
        // stale READY flag may never bypass a current block.
        if (!manualOverride && (!"READY".equals(Jsons.text(plan, "readinessStatus", "")) || !"READY".equals(Jsons.text(readiness, "status", "")))) {
            List<String> missing = Jsons.strings(readiness.get("missingEvidence"));
            String missingText = missing.stream().map(this::diagnosisEvidenceLabel).limit(4).collect(Collectors.joining("、"));
            String message = missingText.isBlank()
                    ? "当前数据或设备状态未满足灌溉执行条件"
                    : "还缺少：" + missingText;
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "READINESS_BLOCKED", message)
                    .withDetails(Map.of("readiness", readiness, "plan", plan));
        }
        Map<String, Object> plotRecord = requireRecord("plot", plotId);
        Map<String, Object> resource = store.find("resource-profile", "resource-default");
        long duration;
        double requestedWater;
        if (manualOverride) {
            requestedWater = Jsons.number(request, "waterLitre", Double.NaN);
            if (!Double.isFinite(requestedWater) || requestedWater < MIN_MANUAL_IRRIGATION_LITRES) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "MANUAL_WATER_INVALID", "人工浇灌水量必须不小于 0.1 L");
            }
            double flow = Math.max(1, Jsons.number(resource, "flowRateLitresPerMinute", 18));
            duration = Math.max(1, (long) Math.ceil(requestedWater / flow * 60));
            Map<String, Object> limits = irrigationWaterLimits(plotId, plotRecord, resource);
            double maxWater = Jsons.number(limits, "maxWaterLitre", 0);
            if (requestedWater > maxWater + .0001) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "MANUAL_WATER_LIMIT", "人工浇灌水量超过当前单次、每日或资源可用上限")
                        .withDetails(Map.of("limits", limits, "requestedWaterLitre", requestedWater));
            }
        } else {
            duration = Jsons.whole(plan, "durationSeconds", Jsons.whole(request, "durationSeconds", 0));
            requestedWater = Jsons.number(plan, "waterLitre", 0);
        }
        if (duration <= 0 || duration > properties.getMaxIrrigationSeconds()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "SAFETY_LIMIT", "灌溉时长超出安全上限");
        if (requestedWater > properties.getDailyWaterLimitLitres()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "DAILY_WATER_LIMIT", "超过每日用水上限");
        double capacity = Jsons.number(resource, "capacityLitres", properties.getDailyWaterLimitLitres());
        double alreadyAllocated = store.list("command").stream()
                .filter(c -> plotId.equals(Jsons.text(c, "plotId", "")))
                .filter(c -> manualOverride
                        ? !Set.of("SUCCEEDED", "PARTIAL", "FAILED", "TIMEOUT", "CANCELLED")
                        .contains(Jsons.text(c, "status", "").toUpperCase(Locale.ROOT))
                        : !Set.of("FAILED", "TIMEOUT", "CANCELLED")
                        .contains(Jsons.text(c, "status", "").toUpperCase(Locale.ROOT)))
                .mapToDouble(c -> Jsons.number(c, "waterLitre", 0)).sum();
        if (alreadyAllocated + requestedWater > capacity) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "RESOURCE_CAPACITY", "水源容量不足");
        Map<String, Object> guard = irrigationGuard(plotId, principal);
        Map<String, Object> guardAutomatic = Jsons.map(mapper, guard.get("automaticWatering"));
        boolean automaticEligible = Jsons.bool(guardAutomatic, "eligible", false)
                && "READY".equals(Jsons.text(readiness, "status", ""));
        if (automaticWatering && !automaticEligible) {
            throw new ApiException(HttpStatus.CONFLICT, "AUTO_WATERING_NOT_ELIGIBLE", "当前土壤湿度、数据质量或设备状态未满足自动浇水条件")
                    .withDetails(Map.of("guard", guard, "readiness", readiness, "plan", plan));
        }
        boolean requestedEmergencyOverride = Jsons.bool(request, "emergencyOverride", Jsons.bool(request, "emergency", false));
        // The legacy emergency flag is accepted for deployed clients, but no
        // longer changes a cooldown.  It only annotates a low-moisture run.
        boolean emergencyOverride = requestedEmergencyOverride && automaticEligible;
        Map<String, Object> command = new LinkedHashMap<>(); command.put("commandId", Jsons.id("cmd")); command.put("plotId", plotId); command.put("planId", plan.get("planId"));
        command.put("farmId", Jsons.text(plotRecord, "farmId", "farm-demo"));
        command.put("areaM2", Jsons.number(plotRecord, "areaM2", DEFAULT_PLOT_AREA_M2));
        command.put("type", "IRRIGATION_START"); command.put("durationSeconds", duration); command.put("waterLitre", requestedWater);
        command.put("idempotencyKey", key); command.put("status", "CONFIRMED"); command.put("requestedBy", principal.userId);
        command.put("confirmedBy", automaticWatering ? "SYSTEM_AUTO_WATERING" : principal.userId); command.put("confirmedAt", Instant.now().toString()); command.put("approvalRequired", false);
        command.put("confirmationMode", manualOverride ? "OPERATOR_MANUAL_OVERRIDE" : automaticWatering ? "AUTOMATIC_THRESHOLD" : "OPERATOR_CONFIRMED"); command.put("riskLevel", manualOverride || automaticWatering || emergencyOverride ? "HIGH" : "MEDIUM");
        command.put("emergencyMode", manualOverride ? "MANUAL_OPERATOR_OVERRIDE" : automaticWatering ? "AUTOMATIC_SOIL_MOISTURE" : emergencyOverride ? "AUTOMATIC_SOIL_MOISTURE" : "NORMAL");
        command.put("cooldownMinutes", 0); command.put("automaticWatering", automaticWatering);
        if (manualOverride) {
            Map<String, Object> manualFallback = Jsons.map(mapper, plan.get("manualFallback"));
            command.put("manualOverride", true);
            command.put("sourcePlanId", sourcePlanId);
            command.put("manualWaterLitre", requestedWater);
            command.put("bypassedGates", Jsons.strings(manualFallback.get("bypassedGates")));
            command.put("overrideReasonCode", Jsons.text(manualFallback, "reasonCode", "SAFETY_GATE_BLOCKED"));
            command.put("executionMode", "SIMULATED");
            command.put("provenance", "SIMULATED");
            command.put("virtualOnly", true);
        }
        if (automaticWatering) command.put("automaticTrigger", Map.of("metric", "SOIL_MOISTURE", "threshold", AUTO_WATERING_THRESHOLD,
                "mode", "AUTOMATIC_SOIL_MOISTURE", "sourceMode", "SIMULATION"));
        command.put("source", Jsons.text(request, "source", automaticWatering ? "auto-soil-moisture" : "api"));
        String agentActionId = Jsons.text(request, "agentActionId", "").trim();
        if (!agentActionId.isBlank()) command.put("agentActionId", agentActionId);
        String workOrderId = Jsons.text(request, "workOrderId", "").trim();
        if (!workOrderId.isBlank()) {
            Map<String, Object> approvalWork = scopedWorkOrder(workOrderId, principal);
            if (!"IRRIGATION_REVIEW".equalsIgnoreCase(Jsons.text(approvalWork, "actionType", ""))
                    || !Jsons.text(plan, "planId", "").equals(Jsons.text(approvalWork, "planId", Jsons.text(approvalWork, "sourceRef", "")))) {
                throw new ApiException(HttpStatus.CONFLICT, "APPROVAL_PLAN_MISMATCH", "审批任务与灌溉处方不一致");
            }
            command.put("workOrderId", workOrderId);
            command.put("status", "APPROVED"); command.put("approvedBy", principal.userId); command.put("approvedAt", Instant.now().toString());
            approvalWork.put("status", "IN_PROGRESS"); approvalWork.put("approvalDecision", "APPROVED");
            approvalWork.put("approvedBy", principal.userId); approvalWork.put("approvedAt", Instant.now().toString());
            approvalWork.put("commandId", command.get("commandId")); approvalWork.put("updatedAt", Instant.now().toString());
            saveWorkOrder(approvalWork, "irrigation-approved");
        }
        store.save("command", Jsons.text(command, "commandId", ""), command); idempotentCommands.put(key, command);
        String commandEvent = manualOverride ? "irrigation.manual.override" : workOrderId.isBlank() ? "command.confirmed" : "command.approved";
        events.publish(commandEvent, command); store.logEvent(commandEvent, command);
        store.save("idempotency", key, Map.of("idempotencyKey", key, "commandId", command.get("commandId"), "createdAt", Instant.now().toString()));
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
            boolean lighting = "LIGHT_BOOST".equalsIgnoreCase(Jsons.text(command, "type", ""));
            if (lighting) {
                double requestedLight = Jsons.number(command, "lightLux", 0);
                ack.put("actualLightLux", "SUCCEEDED".equals(outcome) ? requestedLight : "PARTIAL".equals(outcome) ? requestedLight * .55 : 0);
            } else {
                ack.put("actualWaterLitre", "SUCCEEDED".equals(outcome) ? Jsons.number(command, "waterLitre", 0) : "PARTIAL".equals(outcome) ? Jsons.number(command, "waterLitre", 0) * .55 : 0);
            }
            ack.put("result", "SUCCEEDED".equals(outcome) ? "GOOD" : "TIMEOUT".equals(outcome) ? "NO_ACK" : "EXECUTION_FAILED");
            if (lighting) { ack.put("executionMode", "SIMULATED"); ack.put("provenance", "SIMULATED"); ack.put("virtualOnly", true); }
            if (Jsons.bool(command, "manualOverride", false)) {
                ack.put("executionMode", "SIMULATED");
                ack.put("provenance", "SIMULATED");
            }
            ackByCommand.put(Jsons.text(command, "commandId", ""), ack); command.put("status", outcome); command.put("ack", ack); store.save("command", Jsons.text(command, "commandId", ""), command);
            events.publish("command.ack", ack); store.logEvent("command.ack", ack);
            Map<String, Object> evaluation = evaluateCommand(command, ack);
            completeAgentActionFromCommand(command, ack, evaluation);
        });
    }

    private void recordVirtualIrrigationEffect(String plotId, String commandId, String outcome,
                                               double soilMoistureAfter, double actualWater) {
        if (!Set.of("SUCCEEDED", "PARTIAL").contains(outcome)) return;
        Map<String, Object> plot = store.find("plot", plotId);
        Map<String, Object> latest = latestMetrics(plotId);
        Map<String, Object> soil = latest.get("SOIL_MOISTURE") instanceof Map<?, ?> value
                ? Jsons.map(mapper, value) : Map.of();
        String farmId = Jsons.text(plot, "farmId", "farm-demo");
        String deviceId = Jsons.text(deviceForPlot(plotId), "deviceId", "mock-" + plotId);
        String scenarioId = Jsons.text(soil, "scenarioId", "irrigation-virtual");
        Instant effectAt = Instant.now();

        if (Double.isFinite(soilMoistureAfter)) {
            Map<String, Object> moistureEvent = new LinkedHashMap<>();
            moistureEvent.put("eventId", "virtual-irrigation-soil-" + commandId);
            moistureEvent.put("farmId", farmId);
            moistureEvent.put("plotId", plotId);
            moistureEvent.put("deviceId", deviceId);
            moistureEvent.put("metric", "SOIL_MOISTURE");
            moistureEvent.put("value", Math.min(100, Math.max(0, soilMoistureAfter)));
            moistureEvent.put("unit", "%");
            moistureEvent.put("ts", effectAt.toString());
            moistureEvent.put("sourceMode", "SIMULATION");
            moistureEvent.put("provenance", "SIMULATED");
            moistureEvent.put("dataOrigin", Jsons.bool(store.find("command", commandId), "manualOverride", false)
                    ? "MANUAL_VIRTUAL_IRRIGATION" : "VIRTUAL_ACTUATOR");
            moistureEvent.put("scenarioId", scenarioId);
            moistureEvent.put("quality", Map.of("status", "GOOD", "confidence", .98));
            ingest(moistureEvent);
        }

        Map<String, Object> water = latest.get("WATER_LEVEL") instanceof Map<?, ?> value
                ? Jsons.map(mapper, value) : Map.of();
        double waterBefore = Jsons.number(water, "value", Double.NaN);
        if (Double.isFinite(waterBefore)) {
            Map<String, Object> waterEvent = new LinkedHashMap<>();
            waterEvent.put("eventId", "virtual-irrigation-water-" + commandId);
            waterEvent.put("farmId", farmId);
            waterEvent.put("plotId", plotId);
            waterEvent.put("deviceId", deviceId);
            waterEvent.put("metric", "WATER_LEVEL");
            waterEvent.put("value", Math.min(100, Math.max(0, waterBefore - actualWater / DEFAULT_RESERVOIR_LITRES * 100.0)));
            waterEvent.put("unit", "%");
            waterEvent.put("ts", effectAt.plusMillis(1).toString());
            waterEvent.put("sourceMode", "SIMULATION");
            waterEvent.put("provenance", "SIMULATED");
            waterEvent.put("dataOrigin", "VIRTUAL_ACTUATOR");
            waterEvent.put("scenarioId", scenarioId);
            waterEvent.put("quality", Map.of("status", "GOOD", "confidence", .98));
            ingest(waterEvent);
        }
    }

    private void recordVirtualLightEffect(String plotId, String commandId, String outcome, double lightAfter) {
        if (!Set.of("SUCCEEDED", "PARTIAL").contains(outcome) || !Double.isFinite(lightAfter)) return;
        Map<String, Object> plot = store.find("plot", plotId);
        Map<String, Object> device = deviceForPlot(plotId);
        Map<String, Object> latest = latestMetrics(plotId);
        Map<String, Object> light = latest.get("LIGHT") instanceof Map<?, ?> value ? Jsons.map(mapper, value) : Map.of();
        double before = Jsons.number(light, "value", Double.NaN);
        if (!Double.isFinite(before)) return;
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", "virtual-lighting-" + commandId); event.put("farmId", Jsons.text(plot, "farmId", "farm-demo")); event.put("plotId", plotId);
        event.put("deviceId", Jsons.text(device, "deviceId", "mock-" + plotId)); event.put("metric", "LIGHT"); event.put("value", Math.max(0, lightAfter));
        event.put("unit", "lux"); event.put("ts", Instant.now().toString()); event.put("sourceMode", "SIMULATION"); event.put("provenance", "SIMULATED");
        event.put("dataOrigin", "VIRTUAL_ACTUATOR"); event.put("scenarioId", "lighting-virtual"); event.put("quality", Map.of("status", "GOOD", "confidence", .98));
        ingest(event);
        Map<String, Object> command = store.find("command", commandId);
        if (Jsons.bool(command, "offlineDemoOverride", false) && device != null) {
            device.put("status", "OFFLINE");
            device.put("lastSeen", Jsons.text(device, "lastSeen", Instant.now().toString()));
            device.put("offlineDemoOverride", true);
            store.save("device", Jsons.text(device, "deviceId", "mock-" + plotId), device);
        }
    }

    private void completeAgentActionFromCommand(Map<String, Object> command, Map<String, Object> ack, Map<String, Object> evaluation) {
        String actionId = Jsons.text(command, "agentActionId", "").trim();
        if (actionId.isBlank()) return;
        Map<String, Object> action = store.find("agent-action", actionId);
        if (action == null || !"EXECUTING".equals(Jsons.text(action, "status", ""))) return;
        String outcome = Jsons.text(ack, "status", "TIMEOUT").toUpperCase(Locale.ROOT);
        String next = Set.of("FAILED", "PARTIAL", "TIMEOUT").contains(outcome) ? outcome : "SUCCEEDED";
        action.put("status", next);
        action.put("result", Map.of("commandId", command.get("commandId"), "ack", ack, "evaluation", evaluation == null ? Map.of() : evaluation));
        action.put("completedAt", Instant.now().toString());
        store.save("agent-action", actionId, action);
        String key = Jsons.text(action, "idempotencyKey", "").trim();
        if (!key.isBlank()) store.save("agent-action-idempotency", key, action);
        events.publish("agent.action.completed", action);
        store.logEvent("agent.action.completed", action);
    }

    Map<String, Object> evaluateCommand(Map<String, Object> command, Map<String, Object> ack) {
        String commandId = Jsons.text(command, "commandId", ""); String plotId = Jsons.text(command, "plotId", "");
        if ("LIGHT_BOOST".equalsIgnoreCase(Jsons.text(command, "type", ""))) return evaluateLightCommand(command, ack);
        if (!evaluatedCommands.add(commandId)) return commandEvaluation(commandId);
        Map<String, Object> latest = latestMetrics(plotId); Map<String, Object> soil = latest.get("SOIL_MOISTURE") instanceof Map<?, ?> m ? Jsons.map(mapper, m) : Map.of();
        double observedBefore = Jsons.number(soil, "value", Double.NaN);
        boolean manualOverride = Jsons.bool(command, "manualOverride", false);
        boolean moistureBaselineAvailable = Double.isFinite(observedBefore);
        double before = moistureBaselineAvailable ? observedBefore : 0;
        String ackStatus = Jsons.text(ack, "status", "TIMEOUT");
        double actualWater = Jsons.number(ack, "actualWaterLitre", 0);
        Map<String, Object> evaluationPlot = store.find("plot", plotId);
        double areaM2 = Jsons.number(evaluationPlot, "areaM2", Jsons.number(command, "areaM2", DEFAULT_PLOT_AREA_M2));
        double expectedWater = Jsons.number(command, "waterLitre", 0);
        double expectedAfter = applyIrrigationMoisture(before, expectedWater, areaM2);
        double after = Set.of("SUCCEEDED", "PARTIAL").contains(ackStatus) ? applyIrrigationMoisture(before, actualWater, areaM2) : before;
        String status = !moistureBaselineAvailable && manualOverride ? "INCONCLUSIVE" : "TIMEOUT".equals(ackStatus) || "FAILED".equals(ackStatus) ? "INCONCLUSIVE" : "PARTIAL".equals(ackStatus) ? "PARTIAL" : "COMPLETED";
        String result = !moistureBaselineAvailable && manualOverride ? "BASELINE_UNAVAILABLE" : "SUCCEEDED".equals(ackStatus) && after > before ? "GOOD" : "PARTIAL".equals(ackStatus) ? "NO_EFFECT" : "EXECUTION_FAILED";
        double diff = expectedWater == 0 ? 0 : (actualWater - expectedWater) / expectedWater;
        Map<String, Object> evaluation = new LinkedHashMap<>(); evaluation.put("evaluationId", Jsons.id("eval")); evaluation.put("planId", command.get("planId")); evaluation.put("commandId", commandId);
        evaluation.put("plotId", plotId);
        evaluation.put("farmId", evaluationPlot == null ? null : Jsons.text(evaluationPlot, "farmId", ""));
        evaluation.put("status", status);
        Map<String, Object> expected = new LinkedHashMap<>(); expected.put("soilMoistureBefore", moistureBaselineAvailable ? before : null); expected.put("soilMoistureAfter", moistureBaselineAvailable ? expectedAfter : null); expected.put("waterLitre", expectedWater);
        Map<String, Object> actual = new LinkedHashMap<>(); actual.put("soilMoistureBefore", moistureBaselineAvailable ? before : null); actual.put("soilMoistureAfter", moistureBaselineAvailable ? after : null); actual.put("waterLitre", actualWater);
        evaluation.put("expected", expected); evaluation.put("actual", actual);
        Map<String, Object> planActualDiff = new LinkedHashMap<>(); planActualDiff.put("waterLitrePct", Math.round(diff * 10000.0) / 100.0); planActualDiff.put("soilMoisturePoint", moistureBaselineAvailable ? round(after - expectedAfter) : null);
        evaluation.put("planActualDiff", planActualDiff);
        evaluation.put("effectivenessScore", status.equals("COMPLETED") && "GOOD".equals(result) ? .94 : status.equals("PARTIAL") ? .45 : 0.0); evaluation.put("result", result);
        if (manualOverride) {
            evaluation.put("manualOverride", true);
            evaluation.put("sourcePlanId", command.get("sourcePlanId"));
            evaluation.put("bypassedGates", Jsons.strings(command.get("bypassedGates")));
            evaluation.put("executionMode", "SIMULATED");
            evaluation.put("provenance", "SIMULATED");
        }
        evaluation.put("evidenceWindow", Map.of("beforeMinutes", 30, "afterMinutes", 30)); evaluation.put("createdAt", Instant.now().toString());
        Map<String, Object> waterMetric = latest.get("WATER_LEVEL") instanceof Map<?, ?> waterValue ? Jsons.map(mapper, waterValue) : Map.of();
        double waterBefore = Jsons.number(waterMetric, "value", Double.NaN);
        if (simulationEngine != null && moistureBaselineAvailable && Set.of("SUCCEEDED", "PARTIAL").contains(ackStatus)) {
            simulationEngine.syncPlotMetrics(plotId, before, waterBefore);
            simulationEngine.applyIrrigation(plotId, actualWater, areaM2);
        }
        recordVirtualIrrigationEffect(plotId, commandId, ackStatus, moistureBaselineAvailable ? after : Double.NaN, actualWater);
        Map<String, Object> manualResourceUsage = settleManualIrrigationResource(command, ack, evaluation);
        if (!manualResourceUsage.isEmpty()) evaluation.put("resourceUsage", manualResourceUsage);
        store.save("evaluation", Jsons.text(evaluation, "evaluationId", ""), evaluation); store.save("command", commandId, command); events.publish("evaluation.completed", evaluation); store.logEvent("ACTION_EVALUATED", evaluation);
        settleResourceAllocation(command, ack, evaluation);
        return evaluation;
    }

    private Map<String, Object> evaluateLightCommand(Map<String, Object> command, Map<String, Object> ack) {
        String commandId = Jsons.text(command, "commandId", "");
        if (!evaluatedCommands.add(commandId)) return commandEvaluation(commandId);
        String plotId = Jsons.text(command, "plotId", "");
        Map<String, Object> latest = latestMetrics(plotId);
        Map<String, Object> light = latest.get("LIGHT") instanceof Map<?, ?> value ? Jsons.map(mapper, value) : Map.of();
        double before = Jsons.number(light, "value", Double.NaN);
        double requested = Jsons.number(command, "lightLux", 0);
        double actual = Jsons.number(ack, "actualLightLux", 0);
        String ackStatus = Jsons.text(ack, "status", "TIMEOUT").toUpperCase(Locale.ROOT);
        boolean success = Set.of("SUCCEEDED", "PARTIAL").contains(ackStatus) && Double.isFinite(before);
        double after = success ? Math.min(Jsons.number(command, "targetLightHigh", before + requested), before + actual) : before;
        String status = !Double.isFinite(before) || Set.of("FAILED", "TIMEOUT").contains(ackStatus) ? "INCONCLUSIVE" : "PARTIAL".equals(ackStatus) ? "PARTIAL" : "COMPLETED";
        String result = !Double.isFinite(before) ? "BASELINE_UNAVAILABLE" : "SUCCEEDED".equals(ackStatus) && after > before ? "GOOD" : "PARTIAL".equals(ackStatus) ? "PARTIAL_EFFECT" : "EXECUTION_FAILED";
        Map<String, Object> plot = store.find("plot", plotId);
        Map<String, Object> evaluation = new LinkedHashMap<>();
        evaluation.put("evaluationId", Jsons.id("eval")); evaluation.put("commandId", commandId); evaluation.put("plotId", plotId); evaluation.put("planId", command.get("planId"));
        evaluation.put("farmId", plot == null ? null : Jsons.text(plot, "farmId", "")); evaluation.put("status", status);
        Map<String, Object> expected = new LinkedHashMap<>(); expected.put("lightLuxBefore", Double.isFinite(before) ? before : null); expected.put("lightLuxAfter", Double.isFinite(before) ? Jsons.number(command, "expectedLightAfter", before + requested) : null); expected.put("lightLux", requested);
        Map<String, Object> actualView = new LinkedHashMap<>(); actualView.put("lightLuxBefore", Double.isFinite(before) ? before : null); actualView.put("lightLuxAfter", Double.isFinite(after) ? after : null); actualView.put("lightLux", actual);
        evaluation.put("expected", expected); evaluation.put("actual", actualView);
        evaluation.put("effectivenessScore", "COMPLETED".equals(status) && "GOOD".equals(result) ? .94 : "PARTIAL".equals(status) ? .45 : 0.0);
        evaluation.put("result", result); evaluation.put("executionMode", "SIMULATED"); evaluation.put("provenance", "SIMULATED"); evaluation.put("offlineDemoOverride", Jsons.bool(command, "offlineDemoOverride", false));
        evaluation.put("evidenceWindow", Map.of("beforeMinutes", 10, "afterMinutes", 10)); evaluation.put("createdAt", Instant.now().toString());
        if (success) recordVirtualLightEffect(plotId, commandId, ackStatus, after);
        command.put("evaluation", evaluation); store.save("evaluation", Jsons.text(evaluation, "evaluationId", ""), evaluation); store.save("command", commandId, command);
        events.publish("evaluation.completed", evaluation); store.logEvent("ACTION_EVALUATED", evaluation);
        return evaluation;
    }

    private Map<String, Object> settleManualIrrigationResource(Map<String, Object> command,
                                                                Map<String, Object> ack,
                                                                Map<String, Object> evaluation) {
        if (!Jsons.bool(command, "manualOverride", false)) return Map.of();
        String ackStatus = Jsons.text(ack, "status", "FAILED").toUpperCase(Locale.ROOT);
        double actual = roundLitres(Jsons.number(ack, "actualWaterLitre", Jsons.number(ack, "actualWaterLitres", 0)));
        String farmId = Jsons.text(command, "farmId", farmIdForPlot(Jsons.text(command, "plotId", "")));
        Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("sourceType", "MANUAL_IRRIGATION");
        usage.put("sourceRef", Jsons.text(command, "commandId", ""));
        usage.put("requestedWaterLitre", roundLitres(Jsons.number(command, "waterLitre", 0)));
        usage.put("actualWaterLitre", actual);
        usage.put("sourceMode", "SIMULATION");
        usage.put("provenance", "SIMULATED");
        boolean consumed = Set.of("SUCCEEDED", "PARTIAL").contains(ackStatus) && actual > 0;
        usage.put("status", consumed ? "CONSUMED" : "NOT_CONSUMED");
        Map<String, Object> profile = ensureWaterProfile(farmId);
        LocalDate date = LocalDate.now(waterZone(profile));
        synchronized (resourcePlanLock) {
            Map<String, Object> balance = currentWaterBalance(farmId, date);
            if (consumed) {
                double used = roundLitres(Jsons.number(balance, "actualUsedLitres", 0) + actual);
                balance.put("actualUsedLitres", used);
                balance.put("usedLitres", used);
                balance.put("remainingLitres", roundLitres(Math.max(0,
                        Jsons.number(balance, "dailyQuotaLitres", 900)
                                - Jsons.number(balance, "reservedLitres", 0) - used)));
                balance.put("revision", Jsons.whole(balance, "revision", 0) + 1);
                balance.put("updatedAt", Instant.now().toString());
                store.save("water-daily-balance", Jsons.text(balance, "waterBalanceId", "water:" + farmId + ":" + date), balance);
                events.publish("water.balance.updated", balance);
            }
            usage.put("businessDate", date.toString());
            usage.put("remainingLitres", Jsons.number(balance, "remainingLitres", 0));
        }
        Map<String, Object> ledger = new LinkedHashMap<>();
        ledger.put("valueLedgerId", Jsons.id("value"));
        ledger.put("farmId", farmId);
        ledger.put("scope", farmId);
        ledger.put("sourceType", "MANUAL_IRRIGATION");
        ledger.put("sourceRef", Jsons.text(command, "commandId", ""));
        ledger.put("baseline", Map.of("waterLitres", roundLitres(Jsons.number(command, "waterLitre", 0)), "source", "MANUAL_OPERATOR_OVERRIDE"));
        ledger.put("actual", Map.of("waterLitres", actual, "source", "OBSERVED", "sourceMode", "SIMULATION"));
        ledger.put("status", consumed ? "COMPUTED" : "NOT_CONSUMED");
        ledger.put("algorithmVersion", "manual-irrigation-ledger-v1");
        ledger.put("evaluationId", Jsons.text(evaluation, "evaluationId", ""));
        ledger.put("provenance", "SIMULATED");
        ledger.put("createdAt", Instant.now().toString());
        store.save("value-ledger", Jsons.text(ledger, "valueLedgerId", ""), ledger);
        usage.put("ledgerId", ledger.get("valueLedgerId"));
        return usage;
    }

    Map<String, Object> commandEvaluation(String commandId) {
        return store.list("evaluation").stream().filter(e -> commandId.equals(Jsons.text(e, "commandId", ""))).findFirst().orElse(Map.of("status", "PENDING", "commandId", commandId));
    }

    Map<String, Object> forecast(String plotId, String metric) {
        requireRecord("plot", plotId);
        // A GET refresh is a read-only projection. Persisting a brand-new
        // forecast and event-log record on every browser poll created tens of
        // thousands of history rows and made later timeline reads slower.
        return forecastForSimulation(plotId, metric, plotSimulationView(plotId), false);
    }

    /**
     * Evaluate an unsaved plot strategy with the same deterministic model used
     * by persisted forecasts.  This endpoint is deliberately read-only: it
     * neither changes the plot strategy nor writes a forecast/event record.
     */
    Map<String, Object> evaluateForecast(Map<String, Object> input, UserPrincipal principal) {
        String plotId = Jsons.text(input, "plotId", "").trim();
        if (plotId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_CONTEXT_REQUIRED", "请先选择地块");
        ensurePlotAccess(principal, plotId);
        requireRecord("plot", plotId);

        String metric = Jsons.text(input, "metric", "SOIL_MOISTURE").trim().toUpperCase(Locale.ROOT);
        Map<String, Object> current = simulationRecord(plotId);
        String scenario = canonicalSimulationScenario(Jsons.text(input, "scenario", Jsons.text(current, "scenario", "NORMAL")));
        boolean scenarioChanged = !scenario.equals(Jsons.text(current, "scenario", "NORMAL"));
        Map<String, Object> parameters = scenarioChanged
                ? simulationDefaults(scenario, plotId)
                : new LinkedHashMap<>(Jsons.map(mapper, current.get("parameters")));
        Map<String, Object> supplied = Jsons.map(mapper, input.get("parameters"));
        List<String> warnings = new ArrayList<>();
        for (String key : supplied.keySet()) {
            if (!SIMULATION_PARAMETER_LIMITS.containsKey(key)) warnings.add("已忽略未知参数：" + key);
        }
        for (Map.Entry<String, double[]> entry : SIMULATION_PARAMETER_LIMITS.entrySet()) {
            String key = entry.getKey();
            if (!supplied.containsKey(key)) continue;
            double[] range = entry.getValue();
            double fallback = Jsons.number(parameters, key, (range[0] + range[1]) / 2.0);
            double requested = Jsons.number(supplied, key, fallback);
            double bounded = round(clamp(requested, fallback, range[0], range[1]));
            parameters.put(key, bounded);
            if (Double.compare(requested, bounded) != 0) {
                warnings.add(key + " 已限制在 " + range[0] + "–" + range[1] + " 范围内");
            }
        }
        if (Jsons.number(parameters, "riskThreshold", 20) >= Jsons.number(parameters, "waterloggingThreshold", 82)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SIMULATION_THRESHOLD_INVALID", "干旱阈值必须低于积水阈值");
        }

        Map<String, Object> whatIf = new LinkedHashMap<>(current);
        whatIf.put("plotId", plotId);
        whatIf.put("scenario", scenario);
        whatIf.put("parameters", parameters);
        whatIf.put("sourceMode", "WHAT_IF");
        Map<String, Object> projection = new LinkedHashMap<>(forecastForSimulation(plotId, metric, whatIf, false));
        Object requestVersion = input.get("requestVersion");
        Map<String, Object> inputWindow = Jsons.map(mapper, projection.get("inputWindow"));
        String dataSource = Jsons.text(inputWindow, "mode", "SIMULATION_STRATEGY");
        if ("UNAVAILABLE".equals(Jsons.text(projection, "status", ""))) {
            warnings.add("当前数据条件不足，未生成可执行曲线");
        }
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("plotId", plotId); snapshot.put("metric", projection.getOrDefault("metric", metric));
        snapshot.put("scenario", scenario); snapshot.put("parameters", new LinkedHashMap<>(parameters));
        snapshot.put("startValue", projection.get("startValue")); snapshot.put("startTimestamp", projection.get("startTimestamp"));
        snapshot.put("requestVersion", requestVersion); snapshot.put("evaluatedAt", Instant.now().toString());
        projection.put("persisted", false);
        projection.put("requestVersion", requestVersion);
        projection.put("modelMode", "DETERMINISTIC_WHAT_IF");
        projection.put("dataSource", dataSource);
        projection.put("inputSnapshot", snapshot);
        projection.put("explanation", Map.of(
                "summary", "使用当前遥测锚点与未保存的地块策略进行只读确定性试算",
                "strategySource", scenarioChanged ? "SCENARIO_DEFAULTS_WITH_OVERRIDES" : "CURRENT_STRATEGY_WITH_OVERRIDES",
                "persistence", "NONE"));
        projection.put("warnings", warnings);
        return projection;
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
        Map<String, Object> plotRecord = requireRecord("plot", plotId);
        String facilityType = PlotFacility.forPlot(plotRecord);
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
        double strategyTrend = strategyTrendPerHour(usedMetric, scenario, parameters, observedSlopePerHour,
                points.size() >= minSamples, facilityType);
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
                    : projectMetric(usedMetric, current, hours, strategyTrend, driftRate, scenario, parameters, plotId, facilityType);
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
        result.put("facilityType", facilityType); result.put("facilityLabel", PlotFacility.label(facilityType));
        result.put("startValue", curve.isEmpty() ? current : curve.get(0).get("expected"));
        result.put("startTimestamp", last.get("ts"));
        result.put("curve", curve); result.put("horizons", horizons); result.put("timeToRiskMinutes", timeToRisk);
        result.put("riskBoundary", Map.of("operator", operator, "value", boundary, "unit", unitFor(usedMetric), "ruleCode", ruleCode));
        Map<String, Object> inputWindow = new LinkedHashMap<>(); inputWindow.put("validSamples", points.size()); inputWindow.put("mode", points.size() >= minSamples ? "OBSERVED_PLUS_STRATEGY" : "SIMULATION_STRATEGY");
        if (!points.isEmpty()) { inputWindow.put("from", first.get("ts")); inputWindow.put("to", last.get("ts")); }
        result.put("inputWindow", inputWindow);
        result.put("quality", Map.of("coverage", points.isEmpty() ? .35 : points.stream().filter(p -> "GOOD".equals(Jsons.text(Jsons.map(mapper, p.get("quality")), "status", "BAD"))).count() / (double) points.size(), "confidenceBandSource", points.size() >= minSamples ? "RESIDUAL_MAD_PLUS_STRATEGY_VOLATILITY" : "STRATEGY_PRIOR"));
        result.put("assumptions", List.of("NO_IRRIGATION", "PLOT_STRATEGY=" + scenario,
                "FACILITY_TYPE=" + facilityType,
                "SIMULATION_TIME_SCALE=" + Jsons.number(parameters, "timeScale", DEFAULT_SIMULATION_TIME_SCALE),
                "STAGE=" + context.get("stageCode")));
        result.put("algorithmVersion", Jsons.text(forecastProfile, "algorithm", "strategy-aware-trend-v2"));
        result.put("cropPackVersion", context.get("cropPackVersion")); result.put("ruleVersion", context.get("ruleVersion"));
        result.put("stageCode", context.get("stageCode")); result.put("stageLabel", context.get("stageLabel"));
        result.put("expiresAt", Instant.now().plus(10, ChronoUnit.MINUTES).toString());
        if (persist) { store.save("forecast", Jsons.text(result, "forecastId", ""), result); events.publish("forecast.created", result); store.logEvent("forecast.created", result); }
        return result;
    }

    private double strategyTrendPerHour(String metric, String scenario, Map<String, Object> params,
                                        double observedSlopePerHour, boolean enoughSamples, String facilityType) {
        if ("SOIL_MOISTURE".equals(metric)) {
            double configured = Jsons.number(params, "soilMoistureTrendPerHour", 0);
            double facilityResponse = PlotFacility.soilTrendResponse(facilityType, scenario);
            // The simulator publishes frequent samples (normally every
            // 20 seconds).  Extrapolating the first/last value of a tiny
            // window by 65% amplified ordinary sensor noise into a dramatic
            // 32% -> 80% line in the NORMAL scenario.  Keep the configured
            // plot strategy authoritative and use only a small, bounded
            // residual correction when there is enough history.
            if ("NORMAL".equals(scenario) && enoughSamples) {
                double residual = clamp(observedSlopePerHour, -2.5, 2.5);
                return clamp((configured * .88 + residual * .12) * facilityResponse, -3.0, 3.0);
            }
            return configured * facilityResponse;
        }
        if ("AIR_TEMPERATURE".equals(metric)) return (Jsons.number(params, "temperatureBias", 0) * .75 + (enoughSamples ? observedSlopePerHour * .25 : 0)) * PlotFacility.climateResponse(facilityType);
        if ("AIR_HUMIDITY".equals(metric)) return (Jsons.number(params, "humidityBias", 0) * .65 + (enoughSamples ? observedSlopePerHour * .25 : 0)) * PlotFacility.climateResponse(facilityType);
        if ("RAINFALL".equals(metric)) return Jsons.number(params, "rainfallRate", 0);
        return enoughSamples ? observedSlopePerHour * .35 : 0;
    }

    private double projectMetric(String metric, double current, double hours, double trend, double driftRate,
                                 String scenario, Map<String, Object> params, String plotId, String facilityType) {
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
            value = current + trend * hours + wave * ("LIGHT".equals(metric)
                    ? 900 * PlotFacility.lightTransmission(facilityType) : "CO2".equals(metric) ? 18 : .35);
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
        Map<String, Object> sensorConflictAlert = null;
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

        if (portableSoilMoisture != null) {
            Object soilRaw = latestMetrics(plotId).get("SOIL_MOISTURE"); Map<String, Object> soilMetric = soilRaw instanceof Map<?, ?> m ? Jsons.map(mapper, m) : null;
            if (soilMetric != null) {
                double sensorMoisture = Jsons.number(soilMetric, "value", Double.NaN);
                if (!Double.isNaN(sensorMoisture) && Math.abs(portableSoilMoisture - sensorMoisture) > 10) {
                    double deviation = Math.round(Math.abs(portableSoilMoisture - sensorMoisture) * 10) / 10.0;
                    Map<String, Object> conflict = new LinkedHashMap<>();
                    conflict.put("type", "PORTABLE_VS_TELEMETRY");
                    conflict.put("inspectionId", inspectionId);
                    conflict.put("plotId", plotId);
                    conflict.put("portableValue", portableSoilMoisture);
                    conflict.put("telemetryValue", sensorMoisture);
                    conflict.put("deviation", deviation);
                    conflict.put("message", "便携仪实测 " + portableSoilMoisture + "% 与传感器读数 " + Math.round(sensorMoisture * 10) / 10.0 + "% 相差 " + deviation + " 个百分点，该地块传感器可能存在漂移或故障");
                    record.put("sensorConflict", conflict);
                    Map<String, Object> alert = new LinkedHashMap<>();
                    String alertId = Jsons.id("alert");
                    alert.put("alertId", alertId);
                    alert.put("farmId", farmId);
                    alert.put("plotId", plotId);
                    alert.put("level", "WARNING");
                    alert.put("source", "INSPECTION_CONFLICT");
                    alert.put("status", "ACTIVE");
                    alert.put("title", "传感器与人工巡田数据差异较大");
                    alert.put("message", conflict.get("message"));
                    alert.put("inspectionId", inspectionId);
                    alert.put("portableValue", portableSoilMoisture);
                    alert.put("telemetryValue", sensorMoisture);
                    alert.put("deviation", deviation);
                    alert.put("createdAt", now.toString());
                    alert.put("raisedAt", now.toString());
                    alert.put("updatedAt", now.toString());
                    sensorConflictAlert = alert;
                }
            }
        }

        store.saveDurably("inspection", inspectionId, record,
                "OPERATION_RECORD_PERSISTENCE_UNAVAILABLE", "巡田记录数据库不可用，写入未保存");
        if (sensorConflictAlert != null) {
            store.save("alert", Jsons.text(sensorConflictAlert, "alertId", ""), sensorConflictAlert);
            events.publish("alert.created", sensorConflictAlert);
            store.logEvent("alert.created", sensorConflictAlert);
        }
        if (linkedWorkOrder != null) {
            List<String> evidenceRefs = new ArrayList<>(Jsons.strings(linkedWorkOrder.get("evidenceRefs")));
            if (!evidenceRefs.contains(inspectionId)) evidenceRefs.add(inspectionId);
            linkedWorkOrder.put("evidenceRefs", evidenceRefs);
            updateWorkOrderAudit(linkedWorkOrder, principal, now);
            String status = normalizeWorkStatus(linkedWorkOrder.get("status"));
            appendWorkOrderHistory(linkedWorkOrder, "EVIDENCE_ADDED", status, status, principal, "新增巡田证据：" + summary, List.of(inspectionId));
            saveWorkOrder(linkedWorkOrder, "evidence-added");
        }
        Map<String, Object> inspectionEvent = new LinkedHashMap<>(record);
        if (linkedWorkOrder != null) {
            String assignedFarmerId = Jsons.text(linkedWorkOrder, "assigneeId", "");
            if (!assignedFarmerId.isBlank()) inspectionEvent.put("assignedFarmerId", assignedFarmerId);
        }
        events.publish("inspection.created", inspectionEvent);
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

    List<Map<String, Object>> inspections(UserPrincipal principal) {
        return inspections(principal, "", "");
    }

    List<Map<String, Object>> inspections(String plotId, UserPrincipal principal) {
        return inspections(principal, "", plotId);
    }

    List<Map<String, Object>> inspections(UserPrincipal principal, String farmId, String plotId) {
        String requestedFarmId = farmId == null ? "" : farmId.trim();
        String requestedPlotId = plotId == null ? "" : plotId.trim();
        if (principal != null && !requestedFarmId.isBlank() && !principal.canAccessFarm(requestedFarmId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权查看该农场");
        }
        if (principal != null && !requestedPlotId.isBlank()) ensurePlotAccess(principal, requestedPlotId);
        return store.list("inspection").stream()
                .filter(item -> {
                    String itemFarmId = Jsons.text(item, "farmId", farmIdForPlot(Jsons.text(item, "plotId", "")));
                    return requestedFarmId.isBlank() || requestedFarmId.equals(itemFarmId);
                })
                .filter(item -> requestedPlotId.isBlank() || requestedPlotId.equals(Jsons.text(item, "plotId", "")))
                .filter(item -> principal == null || canAccessPlot(principal, Jsons.text(item, "plotId", "")))
                .filter(item -> principal == null || !principal.isFarmer() || farmerCanSeeInspection(item, principal))
                .sorted(Comparator.comparing((Map<String, Object> item) -> Jsons.instant(item.get("observedAt"), Instant.EPOCH)).reversed())
                .toList();
    }

    private boolean farmerCanSeeInspection(Map<String, Object> inspection, UserPrincipal principal) {
        if (principal == null || !principal.isFarmer()) return true;
        if (principal.userId.equals(Jsons.text(inspection, "operatorId", ""))) return true;
        String workOrderId = Jsons.text(inspection, "workOrderId", "").trim();
        if (workOrderId.isBlank()) return false;
        Map<String, Object> workOrder = store.find("work-order", workOrderId);
        return workOrder != null && principal.userId.equals(Jsons.text(workOrder, "assigneeId", ""));
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
        String sourceType = Jsons.text(input, "sourceType", "").trim().toUpperCase(Locale.ROOT);
        boolean readinessEvidenceRequest = "READINESS".equals(sourceType);
        boolean evidenceRequest = readinessEvidenceRequest
                || "INSPECTION".equalsIgnoreCase(Jsons.text(input, "actionType", ""));
        boolean irrigationReview = "IRRIGATION_REVIEW".equalsIgnoreCase(Jsons.text(input, "actionType", ""));
        if (!principal.isFarmAdmin() && !(principal.canInspect() && evidenceRequest)
                && !(principal.canRequestIrrigation() && irrigationReview)) {
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
        String actionType = canonicalWorkActionType(Jsons.text(input, "actionType", evidenceRequest ? "INSPECTION" : "FIELD_OPERATION"));
        work.put("actionType", actionType);
        work.put("actionLabel", workOperationLabel(actionType));
        if (readinessEvidenceRequest) {
            work.put("sourceType", "READINESS");
            work.put("evidenceType", canonicalEvidenceType(Jsons.text(input, "evidenceType", "FIELD_INSPECTION")));
            work.put("requesterId", principal.userId);
            work.put("requesterName", principal.username);
        }
        work.put("status", "OPEN");
        work.put("priority", normalizePriority(Jsons.text(input, "priority", "MEDIUM")));
        work.put("assigneeId", null);
        work.put("assigneeName", null);
        work.put("createdAt", now.toString());
        work.put("updatedAt", now.toString());
        work.put("createdBy", principal.userId);
        work.put("updatedBy", principal.userId);
        appendWorkOrderHistory(work, "CREATE", null, "OPEN", principal, Jsons.text(input, "reason", "创建任务"), List.of());
        if (readinessEvidenceRequest) saveWorkOrderDurably(work, "created");
        else saveWorkOrder(work, "created");
        return work;
    }

    synchronized Map<String, Object> reportWorkOrderIssue(String workOrderId, Map<String, Object> input, UserPrincipal principal) {
        Map<String, Object> request = input == null ? Map.of() : input;
        Map<String, Object> original = requireRecord("work-order", workOrderId);
        ensurePlotAccess(principal, Jsons.text(original, "plotId", ""));
        requireAssignedFarmer(original, principal);
        String current = normalizeWorkStatus(original.get("status"));
        ensureWorkOrderState(current);
        if (TERMINAL_WORK_ORDER_STATUSES.contains(current)) {
            throw new ApiException(HttpStatus.CONFLICT, "WORK_ORDER_TERMINAL", "已结束的任务不能上报新问题");
        }
        String description = Jsons.text(request, "description", Jsons.text(request, "issueDescription", Jsons.text(request, "note", ""))).trim();
        if (description.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ISSUE_DESCRIPTION_REQUIRED", "请具体描述遇到的问题");
        }
        if (description.length() > 1000) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ISSUE_DESCRIPTION_TOO_LONG", "问题描述不能超过 1000 个字");
        }
        Map<String, Object> existing = store.list("work-order").stream()
                .filter(item -> "FARMER_REPORT".equalsIgnoreCase(Jsons.text(item, "sourceType", "")))
                .filter(item -> workOrderId.equals(Jsons.text(item, "sourceRef", "")))
                .filter(item -> principal.userId.equals(Jsons.text(item, "reporterId", Jsons.text(item, "createdBy", ""))))
                .filter(item -> !Set.of("DONE", "CANCELLED", "REJECTED").contains(normalizeWorkStatus(item.get("status"))))
                .findFirst()
                .orElse(null);
        if (existing != null) {
            Map<String, Object> result = new LinkedHashMap<>(normalizeWorkOrderForRead(existing));
            result.put("reused", true);
            result.put("sourceWorkOrderId", workOrderId);
            result.put("originalWorkOrder", normalizeWorkOrderForRead(original));
            return result;
        }

        Instant now = Instant.now();
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("workOrderId", Jsons.id("wo"));
        report.put("farmId", Jsons.text(original, "farmId", farmIdForPlot(Jsons.text(original, "plotId", ""))));
        report.put("plotId", Jsons.text(original, "plotId", ""));
        report.put("sourceType", "FARMER_REPORT");
        report.put("sourceRef", workOrderId);
        report.put("parentWorkOrderId", workOrderId);
        report.put("title", "农户问题上报：" + Jsons.text(original, "title", "农务任务"));
        report.put("reason", description);
        report.put("description", description);
        report.put("issueDescription", description);
        report.put("reporterId", principal.userId);
        report.put("reporterName", principal.username);
        report.put("reporterRole", "FARMER");
        report.put("actionType", "INSPECTION");
        report.put("actionLabel", workOperationLabel("INSPECTION"));
        report.put("priority", normalizePriority(Jsons.text(request, "priority", "HIGH")));
        report.put("status", "OPEN");
        report.put("createdBy", principal.userId);
        report.put("updatedBy", principal.userId);
        report.put("createdAt", now.toString());
        report.put("updatedAt", now.toString());
        report.put("provenance", "USER_PROVIDED");
        report.put("sourceMode", "SIMULATION");
        appendWorkOrderHistory(report, "CREATE", null, "OPEN", principal, description, List.of());
        saveWorkOrder(report, "farmer-report");

        original.put("issueReportId", report.get("workOrderId"));
        original.put("issueReportStatus", "OPEN");
        original.put("issueReportDescription", description);
        original.put("issueReportedAt", now.toString());
        original.put("issueReportedBy", principal.userId);
        updateWorkOrderAudit(original, principal, now);
        appendWorkOrderHistory(original, "ISSUE_REPORTED", current, current, principal, description, List.of(Jsons.text(report, "workOrderId", "")));
        // The report event is the single admin notification. Keep the parent
        // marker auditable without publishing a duplicate SSE notification.
        store.save("work-order", workOrderId, original);
        store.logEvent("workorder.issue-reported", original);

        Map<String, Object> result = new LinkedHashMap<>(normalizeWorkOrderForRead(report));
        result.put("reused", false);
        result.put("sourceWorkOrderId", workOrderId);
        result.put("originalWorkOrder", normalizeWorkOrderForRead(original));
        return result;
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
        syncFarmerIssueReportParent(work, "ASSIGNED", principal, now);
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
                String outcome = Jsons.text(input, "outcome", "SUCCEEDED").trim().toUpperCase(Locale.ROOT);
                if (!Set.of("SUCCEEDED", "PARTIAL", "FAILED", "TIMEOUT").contains(outcome)) outcome = "SUCCEEDED";
                work.put("outcome", outcome);
                LinkedHashSet<String> evidenceRefs = new LinkedHashSet<>(Jsons.strings(work.get("evidenceRefs")));
                evidenceRefs.addAll(Jsons.strings(input.get("evidenceRefs")));
                work.put("evidenceRefs", new ArrayList<>(evidenceRefs));
                if (isManualIrrigationWork(work)) {
                    double actualWater = Jsons.number(input, "actualWaterLitres", Jsons.number(input, "actualWaterLitre", -1));
                    if (actualWater < 0) throw new ApiException(HttpStatus.BAD_REQUEST, "ACTUAL_WATER_REQUIRED", "人工浇水任务请填写实际用水量");
                    if (actualWater > 100000) throw new ApiException(HttpStatus.BAD_REQUEST, "ACTUAL_WATER_INVALID", "实际用水量超出允许范围");
                    String sourceMode = Jsons.text(input, "waterSourceMode", "EXTERNAL").trim().toUpperCase(Locale.ROOT);
                    if (!Set.of("RESERVOIR", "EXTERNAL", "OTHER", "MANUAL").contains(sourceMode)) {
                        throw new ApiException(HttpStatus.BAD_REQUEST, "WATER_SOURCE_INVALID", "请选择蓄水池、外部水源或其他水源");
                    }
                    work.put("actualWaterLitres", Math.round(actualWater * 10.0) / 10.0);
                    work.put("waterSourceMode", sourceMode);
                    work.put("manualIrrigationNotes", Jsons.text(input, "notes", Jsons.text(input, "manualIrrigationNotes", "")));
                }
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
        syncFarmerIssueReportParent(work, target, principal, now);
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
            applyCompletedWorkEffect(work, principal, now);
        } else {
            work.put("rejectedAt", now.toString());
            work.put("rejectedBy", principal.userId);
            work.put("rejectionReason", note);
        }
        updateWorkOrderAudit(work, principal, now);
        appendWorkOrderHistory(work, approved ? "APPROVE" : "REJECT", current, target, principal,
                note.isBlank() ? "验收通过" : note, List.of());
        saveWorkOrder(work, approved ? "completed" : "rejected");
        syncFarmerIssueReportParent(work, target, principal, now);
        if (approved && isManualIrrigationWork(work)) settleManualIrrigationWork(work, principal);
        if (verification && approved) {
            Map<String, Object> result = new LinkedHashMap<>(work);
            result.put("verificationResolution", resolveApprovedVerification(work, verificationResult, principal));
            Map<String, Object> sourceAlert = store.find("alert", Jsons.text(work, "sourceRef", ""));
            if (sourceAlert != null) {
                Map<String, Object> learning = new LinkedHashMap<>();
                learning.put("verificationResult", verificationResult);
                learning.put("resolutionAction", "CLEARED_NORMAL".equals(verificationResult) ? "CLOSE" : "FOLLOW_UP");
                learning.put("evidenceRefs", work.getOrDefault("evidenceRefs", List.of()));
                learning.put("dataQuality", Jsons.text(work, "dataQuality", "GOOD"));
                governance.recordAlertOutcome(sourceAlert, learning, principal);
            }
            return result;
        }
        return work;
    }

    Map<String, Object> deleteWorkOrder(String workOrderId, UserPrincipal principal) {
        Map<String, Object> work = scopedWorkOrder(workOrderId, principal);
        String current = normalizeWorkStatus(work.get("status"));
        if (!TERMINAL_WORK_ORDER_STATUSES.contains(current)) {
            throw new ApiException(HttpStatus.CONFLICT, "WORK_ORDER_NOT_TERMINAL", "只有已完成的任务可以删除");
        }
        store.delete("work-order", workOrderId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("workOrderId", workOrderId); result.put("deleted", true); result.put("deletedBy", principal.userId);
        events.publish("work-order.deleted", result);
        store.logEvent("work-order.deleted", result);
        return result;
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
                .filter(user -> "FARMER".equals(RolePolicy.canonical(Jsons.text(user, "role", ""))))
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
        boolean adminWide = principal.isSystemAdmin();
        if (farmId.isBlank() && !adminWide) throw new ApiException(HttpStatus.BAD_REQUEST, "FARM_CONTEXT_REQUIRED", "请先选择农场");
        if (!principal.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "当前账号没有该农场权限");
        Map<String, Object> member = store.userById(userId);
        if (member == null) throw new ApiException(HttpStatus.NOT_FOUND, "FARM_MEMBER_NOT_FOUND", "农场成员不存在");
        if ("SYSTEM_ADMIN".equals(RolePolicy.canonical(Jsons.text(member, "role", "")))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_SYSTEM_ADMIN_PROTECTED", "系统管理员账号受永久保护，不能停用或启用");
        }
        if (!"FARMER".equals(RolePolicy.canonical(Jsons.text(member, "role", "")))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "MEMBER_ROLE_IMMUTABLE", "农场成员接口只能启用或停用种植农户账号");
        }
        List<String> memberFarms = Jsons.strings(member.get("farmIds"));
        if (!adminWide && !memberFarms.contains(farmId) && !memberFarms.contains("*")) {
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
        if (updated == null) {
            if (!store.databaseReady()) throw accountPersistenceUnavailable();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "MEMBER_STATUS_UPDATE_FAILED", "成员状态更新失败");
        }
        store.logEvent(enabled ? "FARM_MEMBER_ENABLED" : "FARM_MEMBER_DISABLED",
                Map.of("userId", userId, "farmId", farmId, "updatedBy", principal.userId));
        events.publish(enabled ? "member.enabled" : "member.disabled", Map.of("userId", userId, "farmId", farmId));
        Map<String, Object> result = farmMemberView(updated, farmId);
        result.put("updatedAt", Instant.now().toString());
        result.put("updatedBy", principal.userId);
        return result;
    }

    // 操作审计日志视图：event_log → 前端可读格式（操作人/详情）
    List<Map<String, Object>> auditLogsView(int limit) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : store.auditLogs(limit)) {
            Map<String, Object> payload = Jsons.map(mapper, Jsons.text(row, "payload", "{}"));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.get("id"));
            item.put("time", Jsons.text(row, "time", ""));
            item.put("action", row.get("action"));
            item.put("operator", Stream.of("updatedBy", "userId", "username", "operator", "initiator")
                    .map(key -> Jsons.text(payload, key, "").trim()).filter(s -> !s.isEmpty()).findFirst().orElse("system"));
            String detail = auditLogDetail(Jsons.text(row, "action", ""), payload);
            item.put("detail", detail);
            result.add(item);
        }
        return result;
    }

    // 事件类型 → 中文操作详情（读 payload 关键字段）
    private String auditLogDetail(String action, Map<String, Object> payload) {
        if (action == null || action.isBlank()) return "系统事件";
        String summary = Jsons.text(payload, "summary", "").trim();
        if (!summary.isEmpty()) return summary;
        String username = Jsons.text(payload, "username", "").trim();
        if (!username.isEmpty()) return "账号：" + username;
        String userId = Jsons.text(payload, "userId", "").trim();
        if (!userId.isEmpty()) return "用户：" + userId;
        String plotId = Jsons.text(payload, "plotId", "").trim();
        if (!plotId.isEmpty()) return "地块：" + plotId;
        String target = Jsons.text(payload, "target", "").trim();
        if (!target.isEmpty()) return "对象：" + target;
        String reason = Jsons.text(payload, "reason", "").trim();
        if (!reason.isEmpty()) return reason;
        return action.replace('.', ' ') + "（" + payload.size() + " 字段）";
    }

    Map<String, Object> deleteAccount(String userId, UserPrincipal principal) {
        if (!principal.isSystemAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_DELETE_FORBIDDEN", "只有系统管理员可以删除账号");
        if (principal.userId.equals(userId)) throw new ApiException(HttpStatus.BAD_REQUEST, "ACCOUNT_SELF_DELETE_FORBIDDEN", "不能删除自己的账号");
        Map<String, Object> user = store.userById(userId);
        if (user == null) throw new ApiException(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "账号不存在");
        String role = RolePolicy.canonical(Jsons.text(user, "role", ""));
        if ("SYSTEM_ADMIN".equals(role)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_SYSTEM_ADMIN_PROTECTED", "系统管理员账号受永久保护，不能删除");
        }
        String username = Jsons.text(user, "username", userId);
        if (!store.deleteUserAccount(userId)) {
            if (!store.databaseReady()) throw accountPersistenceUnavailable();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ACCOUNT_DELETE_FAILED", "账号删除失败");
        }
        Map<String, Object> audit = Map.of("userId", userId, "username", username, "role", role,
                "deletedBy", principal.userId, "systemAdminOnly", true);
        store.logEvent("ACCOUNT_DELETED", audit);
        events.publish("account.deleted", audit);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", userId); result.put("username", username);
        result.put("removed", true); result.put("deletedAt", Instant.now().toString());
        result.put("deletedBy", principal.userId);
        return result;
    }

    Map<String, Object> updateAiMode(String aiMode, UserPrincipal principal) {
        if (!principal.isSystemAdmin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "AI_MODE_UPDATE_FORBIDDEN", "只有系统管理员可以修改智能模型模式");
        }
        String normalized = aiMode == null ? "" : aiMode.trim().toLowerCase(Locale.ROOT);
        String canonical;
        switch (normalized) {
            case "full", "openai", "openai-compatible" -> canonical = "openai-compatible";
            case "rules-only", "rules" -> canonical = "rules-only";
            case "mock" -> canonical = "mock";
            case "maxkb" -> canonical = "maxkb";
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "AI_MODE_INVALID", "不支持的智能模型模式: " + aiMode);
        }
        String previous = properties.getAiMode();
        boolean changed = !canonical.equals(previous);
        if (changed) {
            properties.setAiMode(canonical);
            store.logEvent("AI_MODE_CHANGED", Map.of("mode", canonical, "previous", previous, "updatedBy", principal.userId));
            events.publish("ai.mode.changed", Map.of("mode", canonical, "previous", previous, "updatedBy", principal.userId));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("aiMode", canonical);
        result.put("changed", changed);
        result.put("previous", previous);
        result.put("updatedBy", principal.userId);
        result.put("updatedAt", Instant.now().toString());
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
        if ("FARMER_REPORT".equalsIgnoreCase(Jsons.text(work, "sourceType", ""))) return false;
        if (principal.userId.equals(Jsons.text(work, "assigneeId", ""))) return true;
        return principal.userId.equals(Jsons.text(work, "createdBy", ""))
                && ("READINESS".equalsIgnoreCase(Jsons.text(work, "sourceType", ""))
                || "INSPECTION".equalsIgnoreCase(Jsons.text(work, "actionType", "")));
    }

    private Map<String, Object> normalizeWorkOrderForRead(Map<String, Object> source) {
        Map<String, Object> work = new LinkedHashMap<>(source);
        work.put("status", normalizeWorkStatus(work.get("status")));
        work.putIfAbsent("farmId", farmIdForPlot(Jsons.text(work, "plotId", "")));
        String actionType = canonicalWorkActionType(Jsons.text(work, "actionType", "FIELD_OPERATION"));
        work.put("actionType", actionType);
        work.put("actionLabel", workOperationLabel(actionType));
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

    private String canonicalEvidenceType(String value) {
        String normalized = String.valueOf(value == null ? "FIELD_INSPECTION" : value)
                .trim().toUpperCase(Locale.ROOT).replace('-', '_');
        if (!Set.of("FIELD_INSPECTION", "RETEST", "DEVICE_CHECK").contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "EVIDENCE_TYPE_INVALID", "补证类型只能是现场巡田、传感器复测或设备检查");
        }
        return normalized;
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

    private void syncFarmerIssueReportParent(Map<String, Object> report, String status, UserPrincipal principal, Instant now) {
        if (!"FARMER_REPORT".equalsIgnoreCase(Jsons.text(report, "sourceType", ""))) return;
        String parentId = Jsons.text(report, "parentWorkOrderId", Jsons.text(report, "sourceRef", ""));
        if (parentId.isBlank()) return;
        Map<String, Object> parent = store.find("work-order", parentId);
        if (parent == null) return;
        String parentStatus = normalizeWorkStatus(parent.get("status"));
        parent.put("issueReportStatus", status);
        parent.put("issueReportUpdatedAt", now.toString());
        parent.put("issueReportUpdatedBy", principal.userId);
        updateWorkOrderAudit(parent, principal, now);
        appendWorkOrderHistory(parent, "ISSUE_REPORT_STATUS_UPDATED", parentStatus, parentStatus, principal,
                "问题上报工单状态更新为：" + status, List.of(Jsons.text(report, "workOrderId", "")));
        store.save("work-order", parentId, parent);
        store.logEvent("workorder.issue-report-updated", parent);
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
        for (String field : List.of("resultSummary", "outcome", "evidenceRefs", "submittedAt", "submittedBy", "reviewedAt", "reviewedBy", "reviewNote", "rejectedAt", "rejectedBy", "rejectionReason")) work.remove(field);
    }

    private String canonicalWorkActionType(String raw) {
        String value = String.valueOf(raw == null ? "" : raw).trim().toUpperCase(Locale.ROOT)
                .replace('-', '_').replace(' ', '_');
        return switch (value) {
            case "", "FIELD_WORK", "GENERAL_OPERATION" -> "FIELD_OPERATION";
            case "SOW", "SEED", "SEEDING", "PLANT", "PLANTING" -> "SOWING";
            case "TRANSPLANT" -> "TRANSPLANTING";
            case "HARVESTING" -> "HARVEST";
            case "FERTILIZE", "FERTILIZING" -> "FERTILIZATION";
            case "PLANT_PROTECTION", "SPRAY", "SPRAYING" -> "PEST_CONTROL";
            case "WEED" -> "WEEDING";
            case "PRUNE" -> "PRUNING";
            case "IRRIGATE", "WATERING" -> "IRRIGATION";
            case "FIELD_INSPECTION" -> "INSPECTION";
            default -> value;
        };
    }

    private String workOperationLabel(String actionType) {
        return switch (canonicalWorkActionType(actionType)) {
            case "SOWING" -> "播种";
            case "TRANSPLANTING" -> "移栽";
            case "HARVEST" -> "采收";
            case "FERTILIZATION" -> "施肥";
            case "PEST_CONTROL" -> "植保";
            case "WEEDING" -> "除草";
            case "PRUNING" -> "整枝";
            case "IRRIGATION", "MANUAL_IRRIGATION" -> "灌溉";
            case "IRRIGATION_CHECK" -> "灌溉巡检";
            case "INSPECTION" -> "巡田核验";
            case "DEVICE_CHECK" -> "设备检查";
            case "IRRIGATION_REVIEW" -> "灌溉方案审批";
            case "FIELD_OPERATION" -> "田间作业";
            default -> "农务作业";
        };
    }

    /**
     * Applies the operational consequence only after the manager accepts the
     * farmer's result.  Sensor values remain observations: completing a task
     * updates lifecycle and operational state, but never fabricates telemetry.
     */
    private void applyCompletedWorkEffect(Map<String, Object> work, UserPrincipal reviewer, Instant completedAt) {
        if (work.containsKey("plotEffectResolvedAt")) return;
        String actionType = canonicalWorkActionType(Jsons.text(work, "actionType", "FIELD_OPERATION"));
        if ("IRRIGATION_REVIEW".equals(actionType)) return;
        String plotId = Jsons.text(work, "plotId", "");
        if (plotId.isBlank()) return;
        Map<String, Object> plot = requireRecord("plot", plotId);
        String actionLabel = workOperationLabel(actionType);
        String completedAtText = completedAt.toString();
        String outcome = Jsons.text(work, "outcome", "SUCCEEDED").toUpperCase(Locale.ROOT);
        String operatorId = Jsons.text(work, "submittedBy", Jsons.text(work, "assigneeId", reviewer.userId));
        String operatorName = Jsons.text(work, "assigneeName", operatorId);

        Map<String, Object> before = plotOperationalSnapshot(plot);
        if (Set.of("FAILED", "TIMEOUT").contains(outcome)) {
            Map<String, Object> effect = new LinkedHashMap<>();
            effect.put("plotId", plotId);
            effect.put("workOrderId", Jsons.text(work, "workOrderId", ""));
            effect.put("actionType", actionType);
            effect.put("actionLabel", actionLabel);
            effect.put("summary", actionLabel + "结果为" + ("TIMEOUT".equals(outcome) ? "超时" : "失败") + "，地块作业状态未改变");
            effect.put("before", before);
            effect.put("after", before);
            effect.put("appliedAt", completedAtText);
            effect.put("applied", false);
            effect.put("outcome", outcome);
            effect.put("telemetryChanged", false);
            work.put("plotEffect", effect);
            work.put("plotEffectResolvedAt", completedAtText);
            return;
        }
        plot.put("lastOperationType", actionType);
        plot.put("lastOperationLabel", actionLabel);
        plot.put("lastOperationAt", completedAtText);
        plot.put("lastOperationBy", operatorId);
        plot.put("lastOperationByName", operatorName);
        plot.put("lastOperationWorkOrderId", Jsons.text(work, "workOrderId", ""));
        plot.put("lastOperationSummary", Jsons.text(work, "resultSummary", actionLabel + "已完成"));
        plot.put("operationRevision", Jsons.whole(plot, "operationRevision", 0) + 1);

        Map<String, Object> counters = new LinkedHashMap<>();
        Object rawCounters = plot.get("operationCounters");
        if (rawCounters instanceof Map<?, ?> source) {
            source.forEach((key, value) -> counters.put(String.valueOf(key), value));
        }
        counters.put(actionType, Jsons.whole(counters, actionType, 0) + 1);
        plot.put("operationCounters", counters);

        switch (actionType) {
            case "SOWING" -> {
                plot.put("cultivationStatus", "SOWN");
                plot.put("cultivationStatusLabel", "已播种");
                plot.put("stageCode", Jsons.text(work, "targetStageCode", "seedling"));
                plot.put("stageLabel", Jsons.text(work, "targetStageLabel", "苗期"));
                plot.put("sownAt", completedAtText);
                plot.remove("harvestedAt");
            }
            case "TRANSPLANTING" -> {
                plot.put("cultivationStatus", "GROWING");
                plot.put("cultivationStatusLabel", "生长中");
                plot.put("stageCode", Jsons.text(work, "targetStageCode", "vegetative"));
                plot.put("stageLabel", Jsons.text(work, "targetStageLabel", "营养生长期"));
                plot.put("transplantedAt", completedAtText);
                plot.remove("harvestedAt");
            }
            case "HARVEST" -> {
                plot.put("cultivationStatus", "HARVESTED");
                plot.put("cultivationStatusLabel", "已采收待整地");
                plot.put("stageCode", Jsons.text(work, "targetStageCode", "fruiting"));
                plot.put("stageLabel", Jsons.text(work, "targetStageLabel", "采收完成"));
                plot.put("harvestedAt", completedAtText);
                plot.put("lastHarvestAt", completedAtText);
            }
            case "FERTILIZATION" -> {
                plot.put("lastFertilizedAt", completedAtText);
                plot.put("soilManagementStatus", "FERTILIZED");
                plot.put("soilManagementStatusLabel", "已完成施肥");
            }
            case "PEST_CONTROL" -> {
                plot.put("lastPestControlAt", completedAtText);
                plot.put("cropCareStatus", "PROTECTED");
                plot.put("cropCareStatusLabel", "已完成植保");
            }
            case "WEEDING" -> {
                plot.put("lastWeededAt", completedAtText);
                plot.put("cropCareStatus", "WEEDING_COMPLETED");
                plot.put("cropCareStatusLabel", "已完成除草");
            }
            case "PRUNING" -> {
                plot.put("lastPrunedAt", completedAtText);
                plot.put("cropCareStatus", "PRUNING_COMPLETED");
                plot.put("cropCareStatusLabel", "已完成整枝");
            }
            case "IRRIGATION", "MANUAL_IRRIGATION" -> {
                plot.put("lastIrrigatedAt", completedAtText);
                plot.put("waterManagementStatus", "IRRIGATED");
                plot.put("waterManagementStatusLabel", "已完成灌溉");
            }
            case "IRRIGATION_CHECK" -> {
                plot.put("lastIrrigationCheckedAt", completedAtText);
                plot.put("waterManagementStatus", "CHECKED");
                plot.put("waterManagementStatusLabel", "已完成灌溉巡检");
            }
            case "INSPECTION" -> {
                plot.put("lastInspectedAt", completedAtText);
                plot.put("fieldInspectionStatus", "CHECKED");
                plot.put("fieldInspectionStatusLabel", "已完成巡田核验");
            }
            case "DEVICE_CHECK" -> {
                plot.put("lastDeviceCheckedAt", completedAtText);
                plot.put("deviceInspectionStatus", "CHECKED");
                plot.put("deviceInspectionStatusLabel", "已完成设备检查");
            }
            default -> plot.put("lastFieldOperationAt", completedAtText);
        }

        Map<String, Object> historyEntry = new LinkedHashMap<>();
        historyEntry.put("workOrderId", Jsons.text(work, "workOrderId", ""));
        historyEntry.put("actionType", actionType);
        historyEntry.put("actionLabel", actionLabel);
        historyEntry.put("title", Jsons.text(work, "title", actionLabel));
        historyEntry.put("resultSummary", Jsons.text(work, "resultSummary", actionLabel + "已完成"));
        historyEntry.put("completedAt", completedAtText);
        historyEntry.put("completedBy", operatorId);
        historyEntry.put("completedByName", operatorName);
        historyEntry.put("verifiedBy", reviewer.userId);
        historyEntry.put("sourceType", Jsons.text(work, "sourceType", "MANUAL"));
        List<Map<String, Object>> operationHistory = new ArrayList<>(Jsons.maps(mapper, plot.get("operationHistory")));
        operationHistory.add(historyEntry);
        if (operationHistory.size() > 30) operationHistory = new ArrayList<>(operationHistory.subList(operationHistory.size() - 30, operationHistory.size()));
        plot.put("operationHistory", operationHistory);
        plot.put("updatedAt", completedAtText);
        store.save("plot", plotId, plot);

        Map<String, Object> after = plotOperationalSnapshot(plot);
        Map<String, Object> effect = new LinkedHashMap<>();
        effect.put("plotId", plotId);
        effect.put("workOrderId", Jsons.text(work, "workOrderId", ""));
        effect.put("actionType", actionType);
        effect.put("actionLabel", actionLabel);
        effect.put("summary", actionLabel + ("PARTIAL".equals(outcome) ? "部分完成并已验收，地块作业状态已同步" : "已验收，地块作业状态已同步"));
        effect.put("before", before);
        effect.put("after", after);
        effect.put("appliedAt", completedAtText);
        effect.put("applied", true);
        effect.put("outcome", outcome);
        effect.put("telemetryChanged", false);
        work.put("plotEffect", effect);
        work.put("plotEffectAppliedAt", completedAtText);
        work.put("plotEffectResolvedAt", completedAtText);
        events.publish("plot.operation.completed", effect);
        store.logEvent("plot.operation.completed", effect);
    }

    private Map<String, Object> plotOperationalSnapshot(Map<String, Object> plot) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("cultivationStatus", Jsons.text(plot, "cultivationStatus", "GROWING"));
        snapshot.put("cultivationStatusLabel", Jsons.text(plot, "cultivationStatusLabel", "正常种植"));
        snapshot.put("stageCode", Jsons.text(plot, "stageCode", ""));
        snapshot.put("stageLabel", Jsons.text(plot, "stageLabel", ""));
        snapshot.put("lastOperationType", Jsons.text(plot, "lastOperationType", ""));
        snapshot.put("lastOperationLabel", Jsons.text(plot, "lastOperationLabel", ""));
        snapshot.put("lastOperationAt", Jsons.text(plot, "lastOperationAt", ""));
        snapshot.put("operationRevision", Jsons.whole(plot, "operationRevision", 0));
        return snapshot;
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

    private void saveWorkOrderDurably(Map<String, Object> work, String eventSuffix) {
        String workOrderId = Jsons.text(work, "workOrderId", "");
        store.saveDurably("work-order", workOrderId, work,
                "OPERATION_RECORD_PERSISTENCE_UNAVAILABLE", "补证申请数据库不可用，写入未保存");
        events.publish("workorder." + eventSuffix, work);
        store.logEvent("workorder." + eventSuffix, work);
    }

    private void appendResourceRequestHistory(Map<String, Object> request, String action, UserPrincipal principal, String note) {
        List<Map<String, Object>> history = new ArrayList<>(Jsons.maps(mapper, request.get("history")));
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("action", action); entry.put("actorId", principal.userId); entry.put("actorName", principal.username);
        entry.put("actorRole", principal.role); entry.put("at", Instant.now().toString());
        if (note != null && !note.isBlank()) entry.put("note", note.trim());
        history.add(entry); request.put("history", history);
    }

    private void requireResourcePersistence() {
        if (!store.databaseReady()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "RESOURCE_PERSISTENCE_UNAVAILABLE", "资源协同数据库不可用，当前仅可查看");
        }
    }

    private Map<String, Object> saveResourceRequest(Map<String, Object> request, String eventType) {
        String requestId = Jsons.text(request, "resourceRequestId", "");
        request.put("updatedAt", Instant.now().toString());
        store.saveDurably("resource-request", requestId, request);
        events.publish(eventType, request); store.logEvent(eventType, request);
        return request;
    }

    Map<String, Object> createResourceRequest(Map<String, Object> input, UserPrincipal principal) {
        if (!principal.isFarmer() && !principal.isFarmAdmin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_REQUEST_FORBIDDEN", "当前身份不能提交地块用水需求");
        }
        requireResourcePersistence();
        String plotId = Jsons.text(input, "plotId", "").trim();
        if (plotId.isBlank() || !canAccessPlot(principal, plotId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "PLOT_FORBIDDEN", "无权为该地块提交用水需求");
        }
        String farmId = farmIdForPlot(plotId);
        if (farmId.isBlank() || !principal.canAccessFarm(farmId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权为该农场提交用水需求");
        }
        double requested = Jsons.number(input, "requestedLitres", -1);
        if (requested <= 0 || requested > 100000) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "RESOURCE_REQUEST_AMOUNT_INVALID", "申请水量必须在 0 到 100000 L 之间");
        }
        String preferredStart = Jsons.text(input, "preferredStart", "").trim();
        String preferredEnd = Jsons.text(input, "preferredEnd", "").trim();
        try {
            if (!preferredStart.isBlank()) Instant.parse(preferredStart);
            if (!preferredEnd.isBlank()) Instant.parse(preferredEnd);
            if (!preferredStart.isBlank() && !preferredEnd.isBlank() && !Instant.parse(preferredEnd).isAfter(Instant.parse(preferredStart))) {
                throw new IllegalArgumentException("end before start");
            }
        } catch (Exception error) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "RESOURCE_REQUEST_WINDOW_INVALID", "期望执行时间窗无效");
        }
        Map<String, Object> request = store.list("resource-request").stream()
                .filter(item -> plotId.equals(Jsons.text(item, "plotId", "")))
                .filter(item -> principal.userId.equals(Jsons.text(item, "requestedBy", "")))
                .filter(item -> RESOURCE_REQUEST_OPEN.contains(Jsons.text(item, "status", "")))
                .findFirst().map(LinkedHashMap::new).orElseGet(LinkedHashMap::new);
        boolean existing = !request.isEmpty();
        if (existing && !RESOURCE_REQUEST_ACTIVE.contains(Jsons.text(request, "status", ""))) {
            throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_REQUEST_LOCKED", "当前需求已进入确认或执行阶段，请先完成本轮协同");
        }
        String requestId = Jsons.text(request, "resourceRequestId", Jsons.id("resource-request"));
        request.put("resourceRequestId", requestId); request.put("farmId", farmId); request.put("plotId", plotId);
        request.put("requestedLitres", roundLitres(requested)); request.put("preferredStart", preferredStart.isBlank() ? null : preferredStart);
        request.put("preferredEnd", preferredEnd.isBlank() ? null : preferredEnd); request.put("note", Jsons.text(input, "note", "").trim());
        request.put("constraints", Jsons.text(input, "constraints", "").trim()); request.put("status", "SUBMITTED");
        request.put("requestedBy", principal.userId); request.put("requestedByName", principal.username); request.put("requestedByRole", principal.role);
        request.put("revision", existing ? Jsons.whole(request, "revision", 1) + 1 : 1); request.putIfAbsent("createdAt", Instant.now().toString());
        request.remove("resourcePlanId"); request.remove("allocatedLitres"); request.remove("scheduledStart"); request.remove("scheduledEnd");
        request.remove("assignedFarmerId"); request.remove("assignedFarmerName"); request.remove("responseNote"); request.remove("respondedAt");
        request.put("provenance", "USER_PROVIDED"); request.put("sourceMode", "SIMULATION");
        appendResourceRequestHistory(request, existing ? "RESUBMITTED" : "SUBMITTED", principal, Jsons.text(input, "note", ""));
        return saveResourceRequest(request, existing ? "resource.request.resubmitted" : "resource.request.created");
    }

    List<Map<String, Object>> listResourceRequests(Map<String, String> filters, UserPrincipal principal) {
        String farmId = filters == null ? "" : String.valueOf(filters.getOrDefault("farmId", "")).trim();
        String plotId = filters == null ? "" : String.valueOf(filters.getOrDefault("plotId", "")).trim();
        String status = filters == null ? "" : String.valueOf(filters.getOrDefault("status", "")).trim().toUpperCase(Locale.ROOT);
        if (!status.isBlank() && !RESOURCE_REQUEST_STATUSES.contains(status)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "RESOURCE_REQUEST_STATUS_INVALID", "未知的资源需求状态");
        }
        if (!farmId.isBlank() && !principal.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权查看该农场的用水需求");
        if (!plotId.isBlank() && !canAccessPlot(principal, plotId)) throw new ApiException(HttpStatus.FORBIDDEN, "PLOT_FORBIDDEN", "无权查看该地块的用水需求");
        final String selectedFarm = farmId; final String selectedPlot = plotId; final String selectedStatus = status;
        return store.list("resource-request").stream()
                .filter(item -> {
                    if (principal.isSystemAdmin()) return true;
                    boolean inScope = principal.canAccessFarm(Jsons.text(item, "farmId", "")) && canAccessPlot(principal, Jsons.text(item, "plotId", ""));
                    if (!inScope) return false;
                    if (principal.isFarmAdmin()) return true;
                    return principal.userId.equals(Jsons.text(item, "requestedBy", ""))
                            || principal.userId.equals(Jsons.text(item, "assignedFarmerId", ""));
                })
                .filter(item -> selectedFarm.isBlank() || selectedFarm.equals(Jsons.text(item, "farmId", "")))
                .filter(item -> selectedPlot.isBlank() || selectedPlot.equals(Jsons.text(item, "plotId", "")))
                .filter(item -> selectedStatus.isBlank() || selectedStatus.equals(Jsons.text(item, "status", "")))
                .sorted(Comparator.comparing((Map<String, Object> item) -> Jsons.instant(item.get("updatedAt"), Instant.EPOCH)).reversed())
                .toList();
    }

    Map<String, Object> actOnResourceRequest(String resourceRequestId, Map<String, Object> input, UserPrincipal principal) {
        if (!principal.isFarmer()) throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_REQUEST_RESPONSE_FORBIDDEN", "只有地块农户可以确认或反馈分配结果");
        requireResourcePersistence();
        Map<String, Object> request = requireRecord("resource-request", resourceRequestId);
        String plotId = Jsons.text(request, "plotId", "");
        if (!canAccessPlot(principal, plotId) || !principal.canAccessFarm(Jsons.text(request, "farmId", ""))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_REQUEST_FORBIDDEN", "无权处理该用水需求");
        }
        boolean participant = principal.userId.equals(Jsons.text(request, "requestedBy", ""))
                || principal.userId.equals(Jsons.text(request, "assignedFarmerId", ""));
        if (!participant) throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_REQUEST_FORBIDDEN", "只能处理本人申请或分配给本人的用水需求");
        String action = Jsons.text(input, "action", "").trim().toUpperCase(Locale.ROOT);
        String note = Jsons.text(input, "note", "").trim();
        String current = Jsons.text(request, "status", "SUBMITTED");
        if ("WITHDRAW".equals(action)) {
            if (!principal.userId.equals(Jsons.text(request, "requestedBy", ""))) throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_REQUEST_WITHDRAW_FORBIDDEN", "只能撤回本人提交的需求");
            if (!Set.of("SUBMITTED", "IN_REVIEW", "CONFLICT_REPORTED").contains(current)) throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_REQUEST_NOT_WITHDRAWABLE", "当前需求不能撤回");
            request.put("status", "CANCELLED");
        } else if ("ACKNOWLEDGE".equals(action)) {
            if (!Set.of("PENDING_ACK", "CONFLICT_REPORTED", "ACKNOWLEDGED").contains(current)) throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_REQUEST_NOT_CONFIRMABLE", "当前还没有可确认的分配结果");
            request.put("status", "ACKNOWLEDGED");
        } else if ("REPORT_CONFLICT".equals(action)) {
            if (!Set.of("PENDING_ACK", "ACKNOWLEDGED", "CONFLICT_REPORTED").contains(current)) throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_REQUEST_NOT_RESPONDABLE", "当前还没有可反馈的分配结果");
            if (note.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "RESOURCE_REQUEST_CONFLICT_NOTE_REQUIRED", "反馈冲突必须说明原因");
            request.put("status", "CONFLICT_REPORTED");
        } else {
            throw new ApiException(HttpStatus.BAD_REQUEST, "RESOURCE_REQUEST_ACTION_INVALID", "仅支持 ACKNOWLEDGE、REPORT_CONFLICT 或 WITHDRAW");
        }
        request.put("responseNote", note); request.put("respondedBy", principal.userId); request.put("respondedByName", principal.username);
        request.put("respondedAt", Instant.now().toString()); request.put("revision", Jsons.whole(request, "revision", 1) + 1);
        appendResourceRequestHistory(request, action, principal, note);
        Map<String, Object> saved = saveResourceRequest(request, "resource.request." + action.toLowerCase(Locale.ROOT));
        updateResourcePlanCollaboration(saved);
        if ("REPORT_CONFLICT".equals(action)) ensureResourceConflictWorkOrder(saved);
        return saved;
    }

    private void updateResourcePlanCollaboration(Map<String, Object> request) {
        String resourcePlanId = Jsons.text(request, "resourcePlanId", "");
        if (resourcePlanId.isBlank()) return;
        synchronized (resourcePlanLock) {
            Map<String, Object> plan = store.find("resource-plan", resourcePlanId);
            if (plan == null) return;
            String requestId = Jsons.text(request, "resourceRequestId", "");
            List<Map<String, Object>> allocations = new ArrayList<>();
            Map<String, Object> changedAllocation = null;
            for (Map<String, Object> source : Jsons.maps(mapper, plan.get("allocations"))) {
                Map<String, Object> allocation = new LinkedHashMap<>(source);
                List<String> requestIds = Jsons.strings(allocation.get("resourceRequestIds"));
                if (requestIds.contains(requestId)) {
                    List<String> statuses = requestIds.stream().map(id -> store.find("resource-request", id))
                            .filter(Objects::nonNull).map(item -> Jsons.text(item, "status", "")).toList();
                    String collaborationStatus = statuses.stream().anyMatch("CONFLICT_REPORTED"::equals) ? "CONFLICT_REPORTED"
                            : !statuses.isEmpty() && statuses.stream().allMatch(status -> Set.of("ACKNOWLEDGED", "COMPLETED").contains(status)) ? "ACKNOWLEDGED"
                            : "PENDING_ACK";
                    allocation.put("collaborationStatus", collaborationStatus);
                    changedAllocation = allocation;
                }
                allocations.add(allocation);
            }
            if (changedAllocation == null) return;
            plan.put("allocations", allocations); plan.put("revision", Jsons.whole(plan, "revision", 1) + 1);
            plan.put("updatedAt", Instant.now().toString()); store.saveDurably("resource-plan", resourcePlanId, plan);
            events.publish("resource.plan.collaboration_updated", changedAllocation); store.logEvent("resource.plan.collaboration_updated", changedAllocation);
        }
    }

    private void ensureResourceConflictWorkOrder(Map<String, Object> request) {
        String requestId = Jsons.text(request, "resourceRequestId", "");
        boolean exists = store.list("work-order").stream().anyMatch(work -> requestId.equals(Jsons.text(work, "sourceRef", ""))
                && "RESOURCE_REQUEST".equals(Jsons.text(work, "sourceType", ""))
                && !TERMINAL_WORK_ORDER_STATUSES.contains(normalizeWorkStatus(work.get("status"))));
        if (exists) return;
        Map<String, Object> work = new LinkedHashMap<>(); work.put("workOrderId", Jsons.id("wo"));
        work.put("farmId", request.get("farmId")); work.put("plotId", request.get("plotId")); work.put("sourceType", "RESOURCE_REQUEST");
        work.put("sourceRef", requestId); work.put("taskPurpose", "RESOURCE_COLLABORATION"); work.put("actionType", "RESOURCE_REVIEW");
        work.put("title", "配水冲突复核：" + Jsons.text(request, "plotId", "")); work.put("reason", Jsons.text(request, "responseNote", "农户反馈执行冲突"));
        work.put("priority", "HIGH"); work.put("status", "OPEN"); work.put("createdAt", Instant.now().toString()); work.put("updatedAt", Instant.now().toString());
        work.put("provenance", "USER_PROVIDED"); saveWorkOrder(work, "created");
    }

    Map<String, Object> resourcePlan(Map<String, Object> input, UserPrincipal principal) {
        boolean auto = "AUTO".equalsIgnoreCase(Jsons.text(input, "mode", ""));
        if (auto) return evaluateAutoResourcePlan(input, principal);
        return legacyResourcePlan(input, principal);
    }

    /** Keeps the original demand based endpoint contract for older clients. */
    private Map<String, Object> legacyResourcePlan(Map<String, Object> input, UserPrincipal principal) {
        boolean farmerPreview = principal.isFarmer();
        if (!principal.isFarmAdmin() && !farmerPreview) throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_PLAN_FORBIDDEN", "当前身份不能试算或安排农场资源");
        if (!farmerPreview) requireResourcePersistence();
        String farmId = resolveResourceFarm(input, principal);
        Map<String, Object> resource = ensureWaterProfile(farmId);
        List<Map<String, Object>> demands = Jsons.maps(mapper, input.get("demands"));
        if (demands.isEmpty()) demands = store.list("irrigation-plan").stream()
                .filter(plan -> farmId.equals(farmIdForPlot(Jsons.text(plan, "plotId", "")))).limit(10).toList();
        double capacity = Jsons.number(resource, "dailyQuotaLitres", Jsons.number(resource, "capacityLitres", 900));
        double remaining = currentWaterBalance(farmId, LocalDate.now(waterZone(resource))).get("remainingLitres") instanceof Number n ? n.doubleValue() : capacity;
        List<Map<String, Object>> allocations = new ArrayList<>(), conflicts = new ArrayList<>(), unmet = new ArrayList<>();
        demands = new ArrayList<>(demands); demands.sort(Comparator.comparingInt((Map<String, Object> d) -> riskRank(Jsons.text(d, "priority", "MEDIUM"))).reversed());
        for (Map<String, Object> demand : demands) {
            double requested = Jsons.number(demand, "waterLitre", Jsons.number(demand, "requestedLitres", 0)); String plotId = Jsons.text(demand, "plotId", "plot-a01");
            if (!canAccessPlot(principal, plotId) || !farmId.equals(farmIdForPlot(plotId))) throw new ApiException(HttpStatus.FORBIDDEN, "PLOT_FORBIDDEN", "无权为该地块分配资源");
            double allocated = roundLitres(Math.min(remaining, Math.max(0, requested))); remaining = Math.max(0, remaining - allocated);
            Map<String, Object> allocation = new LinkedHashMap<>(); allocation.put("plotId", plotId); allocation.put("requestedLitres", roundLitres(requested)); allocation.put("allocatedLitres", allocated); allocation.put("unmetLitres", roundLitres(Math.max(0, requested - allocated))); allocation.put("status", allocated >= requested ? "ALLOCATED" : "PARTIAL");
            allocations.add(allocation);
            if (allocated < requested) { Map<String, Object> reason = new LinkedHashMap<>(); reason.put("plotId", plotId); reason.put("requestedLitres", requested); reason.put("unmetLitres", roundLitres(requested - allocated)); reason.put("reason", "WATER_CAPACITY"); unmet.add(reason); conflicts.add(Map.of("type", "CAPACITY", "plotId", plotId)); }
        }
        Map<String, Object> plan = new LinkedHashMap<>(); plan.put("resourcePlanId", Jsons.id("rp")); plan.put("status", unmet.isEmpty() ? "FEASIBLE" : "INFEASIBLE");
        plan.put("farmId", farmId); plan.put("scope", farmId); plan.put("window", Map.of("from", Instant.now().toString(), "to", Instant.now().plus(6, ChronoUnit.HOURS).toString()));
        plan.put("constraints", Map.of("waterCapacityLitres", capacity)); plan.put("allocations", allocations); plan.put("conflicts", conflicts); plan.put("unmetDemands", unmet); plan.put("algorithmVersion", "capacity-priority-v1");
        plan.put("trialOnly", farmerPreview); plan.put("readOnly", farmerPreview); plan.put("provenance", "DERIVED"); plan.put("sourceMode", "ESTIMATED");
        if (!farmerPreview) { store.saveDurably("resource-plan", Jsons.text(plan, "resourcePlanId", ""), plan); events.publish("resource.plan.created", plan); }
        return plan;
    }

    private String resolveResourceFarm(Map<String, Object> input, UserPrincipal principal) {
        String farmId = Jsons.text(input, "farmId", Jsons.text(input, "scope", "")).trim();
        if (farmId.isBlank()) farmId = principal.farmIds.stream().filter(id -> !"*".equals(id)).findFirst().orElse("");
        if (farmId.isBlank() || !principal.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权安排该农场的水资源");
        return farmId;
    }

    private ZoneId waterZone(Map<String, Object> profile) {
        try { return ZoneId.of(Jsons.text(profile, "timezone", "Asia/Shanghai")); } catch (Exception ignored) { return ZoneId.of("Asia/Shanghai"); }
    }

    private Map<String, Object> ensureWaterProfile(String farmId) {
        Map<String, Object> profile = store.list("resource-profile").stream()
                .filter(item -> farmId.equals(Jsons.text(item, "farmId", ""))).findFirst().orElse(null);
        if (profile == null && "farm-demo".equals(farmId)) profile = store.find("resource-profile", "resource-default");
        if (profile == null) profile = new LinkedHashMap<>(); else profile = new LinkedHashMap<>(profile);
        profile.put("resourceProfileId", Jsons.text(profile, "resourceProfileId", Jsons.text(profile, "resourcePlanId", "water-" + farmId)));
        profile.put("farmId", farmId); profile.put("resourceType", "WATER");
        double quota = Jsons.number(profile, "dailyQuotaLitres", Jsons.number(profile, "capacityLitres", 900));
        if (quota <= 0) quota = 900;
        profile.put("dailyQuotaLitres", roundLitres(quota)); profile.put("capacityLitres", roundLitres(quota));
        profile.put("flowRateLitresPerMinute", Jsons.number(profile, "flowRateLitresPerMinute", 18));
        profile.put("timezone", Jsons.text(profile, "timezone", "Asia/Shanghai"));
        profile.put("futureQuotas", Jsons.maps(mapper, profile.get("futureQuotas")));
        profile.put("updatedAt", Jsons.text(profile, "updatedAt", Instant.now().toString()));
        String id = Jsons.text(profile, "resourceProfileId", "water-" + farmId); store.save("resource-profile", id, profile);
        return profile;
    }

    private double quotaForDate(Map<String, Object> profile, LocalDate date) {
        double quota = Jsons.number(profile, "dailyQuotaLitres", 900);
        for (Map<String, Object> item : Jsons.maps(mapper, profile.get("futureQuotas"))) {
            try { if (!LocalDate.parse(Jsons.text(item, "effectiveFrom", "")).isAfter(date)) quota = Jsons.number(item, "dailyQuotaLitres", quota); }
            catch (Exception ignored) { }
        }
        return Math.max(0, roundLitres(quota));
    }

    private Map<String, Object> currentWaterBalance(String farmId, LocalDate date) {
        Map<String, Object> profile = ensureWaterProfile(farmId); String key = "water:" + farmId + ":" + date;
        Map<String, Object> balance = store.find("water-daily-balance", key);
        if (balance == null) balance = new LinkedHashMap<>(); else balance = new LinkedHashMap<>(balance);
        double quota = quotaForDate(profile, date); double reserved = Math.max(0, Jsons.number(balance, "reservedLitres", 0)); double used = Math.max(0, Jsons.number(balance, "actualUsedLitres", Jsons.number(balance, "usedLitres", 0)));
        balance.put("waterBalanceId", key); balance.put("farmId", farmId); balance.put("businessDate", date.toString()); balance.put("dailyQuotaLitres", quota);
        balance.put("reservedLitres", roundLitres(reserved)); balance.put("actualUsedLitres", roundLitres(used)); balance.put("usedLitres", roundLitres(used));
        balance.put("remainingLitres", roundLitres(Math.max(0, quota - reserved - used))); balance.put("revision", Jsons.whole(balance, "revision", 0));
        balance.put("resetsAt", date.plusDays(1).atStartOfDay(waterZone(profile)).toInstant().toString()); balance.put("updatedAt", Instant.now().toString());
        store.save("water-daily-balance", key, balance); return balance;
    }

    private double roundLitres(double value) { return Math.round(Math.max(0, value) * 10.0) / 10.0; }

    private Instant resourceWindowBoundary(List<Map<String, Object>> requests, String key, boolean latest) {
        Comparator<Instant> order = Comparator.naturalOrder();
        return requests.stream().filter(request -> !Jsons.text(request, key, "").isBlank())
                .map(request -> Jsons.instant(request.get(key), null)).filter(Objects::nonNull)
                .reduce(latest ? BinaryOperator.maxBy(order) : BinaryOperator.minBy(order)).orElse(null);
    }

    Map<String, Object> waterResourceProfile(String farmId, String requestedDate, UserPrincipal principal) {
        String selectedFarm = (farmId == null || farmId.isBlank()) ? resolveResourceFarm(Map.of(), principal) : farmId.trim();
        if (!principal.canAccessFarm(selectedFarm)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权查看该农场的水资源");
        Map<String, Object> profile = ensureWaterProfile(selectedFarm); LocalDate date;
        try { date = requestedDate == null || requestedDate.isBlank() ? LocalDate.now(waterZone(profile)) : LocalDate.parse(requestedDate); }
        catch (Exception e) { throw new ApiException(HttpStatus.BAD_REQUEST, "BUSINESS_DATE_INVALID", "业务日期格式应为 YYYY-MM-DD"); }
        Map<String, Object> balance = currentWaterBalance(selectedFarm, date); Map<String, Object> result = new LinkedHashMap<>(profile); result.put("balance", balance); result.putAll(balance); result.put("farmId", selectedFarm); result.put("businessDate", date.toString());
        result.put("futureQuotas", Jsons.maps(mapper, profile.get("futureQuotas"))); return result;
    }

    Map<String, Object> updateWaterResourceProfile(Map<String, Object> input, UserPrincipal principal) {
        if (!principal.isFarmAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_PROFILE_FORBIDDEN", "只有农场管理员可以设置水资源配额");
        requireResourcePersistence();
        String farmId = resolveResourceFarm(input, principal); Map<String, Object> profile = ensureWaterProfile(farmId); String rawDate = Jsons.text(input, "effectiveFrom", "").trim();
        if (rawDate.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "EFFECTIVE_DATE_REQUIRED", "请指定配额生效日期");
        LocalDate effective; try { effective = LocalDate.parse(rawDate); } catch (Exception e) { throw new ApiException(HttpStatus.BAD_REQUEST, "EFFECTIVE_DATE_INVALID", "生效日期格式应为 YYYY-MM-DD"); }
        LocalDate today = LocalDate.now(waterZone(profile)); if (!effective.isAfter(today)) throw new ApiException(HttpStatus.BAD_REQUEST, "CURRENT_QUOTA_FROZEN", "当前日及过去日期的配额不可修改");
        double quota = Jsons.number(input, "dailyQuotaLitres", -1); if (quota <= 0 || quota > 100000) throw new ApiException(HttpStatus.BAD_REQUEST, "DAILY_QUOTA_INVALID", "每日配额必须在 0 到 100000 L 之间");
        List<Map<String, Object>> schedule = new ArrayList<>(Jsons.maps(mapper, profile.get("futureQuotas"))); schedule.removeIf(item -> effective.toString().equals(Jsons.text(item, "effectiveFrom", ""))); schedule.add(new LinkedHashMap<>(Map.of("effectiveFrom", effective.toString(), "dailyQuotaLitres", roundLitres(quota)))); schedule.sort(Comparator.comparing(item -> Jsons.text(item, "effectiveFrom", "")));
        profile.put("futureQuotas", schedule); profile.put("updatedAt", Instant.now().toString()); profile.put("updatedBy", principal.userId); store.saveDurably("resource-profile", Jsons.text(profile, "resourceProfileId", "water-" + farmId), profile);
        events.publish("resource.profile.updated", profile); store.logEvent("resource.profile.updated", profile); return waterResourceProfile(farmId, today.toString(), principal);
    }

    List<Map<String, Object>> listResourcePlans(Map<String, String> filters, UserPrincipal principal) {
        String farmId = filters == null ? "" : String.valueOf(filters.getOrDefault("farmId", "")).trim();
        if (farmId.isBlank() && !principal.isSystemAdmin()) farmId = resolveResourceFarm(Map.of(), principal); else if (!farmId.isBlank() && !principal.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权查看该农场的水资源计划");
        String date = filters == null ? "" : String.valueOf(filters.getOrDefault("businessDate", "")).trim(); String status = filters == null ? "" : String.valueOf(filters.getOrDefault("status", "")).trim().toUpperCase(Locale.ROOT);
        final String selectedFarm = farmId;
        return store.list("resource-plan").stream().filter(plan -> selectedFarm.isBlank() || selectedFarm.equals(Jsons.text(plan, "farmId", ""))).filter(plan -> date.isBlank() || date.equals(Jsons.text(plan, "businessDate", ""))).filter(plan -> status.isBlank() || status.equals(Jsons.text(plan, "status", "").toUpperCase(Locale.ROOT))).map(plan -> resourcePlanForPrincipal(plan, principal)).filter(Objects::nonNull).toList();
    }

    Map<String, Object> resourcePlanById(String resourcePlanId, UserPrincipal principal) {
        Map<String, Object> plan = requireRecord("resource-plan", resourcePlanId); ensureResourcePlanFarm(plan, principal); Map<String, Object> view = resourcePlanForPrincipal(plan, principal); if (view == null) throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_PLAN_FORBIDDEN", "该计划没有当前农户授权地块"); return view;
    }

    private Map<String, Object> resourcePlanForPrincipal(Map<String, Object> plan, UserPrincipal principal) {
        if (!principal.isFarmer()) return plan;
        List<Map<String, Object>> allocations = Jsons.maps(mapper, plan.get("allocations")).stream().filter(item -> canAccessPlot(principal, Jsons.text(item, "plotId", ""))).toList();
        if (allocations.isEmpty()) return null; Map<String, Object> copy = new LinkedHashMap<>(plan); copy.put("allocations", allocations); copy.put("totalRequestedLitres", roundLitres(allocations.stream().mapToDouble(item -> Jsons.number(item, "requestedLitres", 0)).sum())); copy.put("totalAllocatedLitres", roundLitres(allocations.stream().mapToDouble(item -> Jsons.number(item, "allocatedLitres", 0)).sum())); copy.put("totalUnmetLitres", roundLitres(allocations.stream().mapToDouble(item -> Jsons.number(item, "unmetLitres", 0)).sum())); copy.put("readOnly", true); return copy;
    }

    private double needScore(Map<String, Object> plot, Map<String, Object> plan, Map<String, Object> diagnosis) {
        double moisture = Jsons.number(plan, "moistureDeficitPct", 0); double risk = Math.min(1, riskRank(Jsons.text(plot, "riskLevel", "LOW")) / 3.0); double severity = Math.min(1, Jsons.number(diagnosis, "confidence", 0.5)); double trend = Math.min(1, Math.max(0, -Jsons.number(plan, "trendPerHour", 0) / 5.0)); double stale = Math.min(1, Jsons.number(plan, "hoursSinceLastSuccess", 24) / 48.0);
        return Math.round((moisture * .5 + Math.max(risk, severity) * .25 + trend * .15 + stale * .10) * 1000.0) / 1000.0;
    }

    Map<String, Object> evaluateAutoResourcePlan(Map<String, Object> input, UserPrincipal principal) {
        boolean farmerPreview = principal.isFarmer(); if (!principal.isFarmAdmin() && !farmerPreview) throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_PLAN_FORBIDDEN", "当前身份不能分析农场资源");
        if (!farmerPreview) requireResourcePersistence();
        String farmId = resolveResourceFarm(input, principal); Map<String, Object> profile = ensureWaterProfile(farmId); LocalDate businessDate;
        try { businessDate = LocalDate.parse(Jsons.text(input, "businessDate", LocalDate.now(waterZone(profile)).toString())); } catch (Exception e) { throw new ApiException(HttpStatus.BAD_REQUEST, "BUSINESS_DATE_INVALID", "业务日期格式应为 YYYY-MM-DD"); }
        Map<String, Object> balance = currentWaterBalance(farmId, businessDate); double available = Jsons.number(balance, "remainingLitres", 0); List<Map<String, Object>> candidates = new ArrayList<>();
        Map<String, List<Map<String, Object>>> requestsByPlot = listResourceRequests(Map.of("farmId", farmId), principal).stream()
                .filter(request -> RESOURCE_REQUEST_ACTIVE.contains(Jsons.text(request, "status", "")))
                .collect(Collectors.groupingBy(request -> Jsons.text(request, "plotId", "")));
        for (Map<String, Object> plot : store.list("plot")) {
            String plotId = Jsons.text(plot, "plotId", ""); if (!farmId.equals(Jsons.text(plot, "farmId", farmId)) || !canAccessPlot(principal, plotId)) continue;
            String plotStatus = Jsons.text(plot, "status", "ACTIVE").toUpperCase(Locale.ROOT); if (Set.of("INACTIVE", "ARCHIVED", "DELETED").contains(plotStatus)) continue;
            try {
                Map<String, Object> irrigation = irrigationPlan(Map.of("plotId", plotId, "traceId", Jsons.id("water")), principal); Map<String, Object> latest = latestMetrics(plotId); Map<String, Object> soil = latest.get("SOIL_MOISTURE") instanceof Map<?, ?> m ? Jsons.map(mapper, m) : Map.of(); Map<String, Object> diagnosis = store.list("diagnosis").stream().filter(d -> plotId.equals(Jsons.text(d, "plotId", ""))).max(Comparator.comparing(d -> Jsons.instant(d.get("createdAt"), Instant.EPOCH))).orElse(Map.of());
                double target = Jsons.number(Jsons.map(mapper, irrigation.get("expectedResult")), "to", 30); double current = Jsons.number(soil, "value", 0); double recommended = roundLitres(Jsons.number(irrigation, "waterLitre", 0));
                List<Map<String, Object>> plotRequests = requestsByPlot.getOrDefault(plotId, List.of()); double submitted = roundLitres(plotRequests.stream().mapToDouble(request -> Jsons.number(request, "requestedLitres", 0)).sum());
                double requested = submitted > 0 ? roundLitres(Math.min(submitted, recommended)) : recommended; Map<String, Object> device = deviceForPlot(plotId); boolean deviceReady = "READY".equals(Jsons.text(irrigation, "readinessStatus", "")) && isIrrigationControllerReady(device);
                Instant preferredStart = resourceWindowBoundary(plotRequests, "preferredStart", true); Instant preferredEnd = resourceWindowBoundary(plotRequests, "preferredEnd", false);
                boolean timeWindowConflict = preferredStart != null && preferredEnd != null && !preferredEnd.isAfter(preferredStart);
                boolean ready = deviceReady && !timeWindowConflict; Map<String, Object> assignee = chooseResourceAssignee(farmId, plotId, plotRequests);
                Map<String, Object> allocation = new LinkedHashMap<>(); allocation.put("plotId", plotId); allocation.put("farmId", farmId); allocation.put("requestedLitres", requested); allocation.put("recommendedLitres", recommended); allocation.put("submittedDemandLitres", submitted); allocation.put("safetyCappedLitres", roundLitres(Math.max(0, submitted - recommended))); allocation.put("resourceRequestIds", plotRequests.stream().map(request -> Jsons.text(request, "resourceRequestId", "")).filter(id -> !id.isBlank()).toList()); allocation.put("requesterNames", plotRequests.stream().map(request -> Jsons.text(request, "requestedByName", "")).filter(name -> !name.isBlank()).distinct().toList()); allocation.put("preferredStart", preferredStart == null ? null : preferredStart.toString()); allocation.put("preferredEnd", preferredEnd == null ? null : preferredEnd.toString()); allocation.put("timeWindowStatus", timeWindowConflict ? "CONFLICT" : plotRequests.isEmpty() ? "OPEN" : "DECLARED"); allocation.put("allocatedLitres", 0.0); allocation.put("unmetLitres", requested); allocation.put("needScore", needScore(plot, Map.of("moistureDeficitPct", Math.max(0, target - current), "trendPerHour", 0, "hoursSinceLastSuccess", plotRequests.isEmpty() ? 24 : 36), diagnosis)); allocation.put("readinessStatus", timeWindowConflict ? "TIME_WINDOW_CONFLICT" : ready ? "READY" : Jsons.text(irrigation, "readinessStatus", "UNAVAILABLE")); allocation.put("deviceId", Jsons.text(device, "deviceId", "")); allocation.put("assignedFarmerId", assignee == null ? null : Jsons.text(assignee, "userId", "")); allocation.put("assignedFarmerName", assignee == null ? null : Jsons.text(assignee, "displayName", Jsons.text(assignee, "username", ""))); allocation.put("executionStatus", requested <= 0 ? "NO_ACTION" : ready ? "PENDING" : "FALLBACK_REQUIRED"); allocation.put("explanation", timeWindowConflict ? "多个农户时间窗没有交集，需管理员与现场重新确认" : submitted > recommended ? "农户需求已按处方安全上限收敛，结合风险与近期灌溉记录排序" : !plotRequests.isEmpty() ? "已合并农户提交需求、湿度缺口与近期灌溉记录" : ready ? "湿度缺口、风险与近期灌溉记录综合排序" : "设备或安全门未满足自动灌溉条件，将保留人工兜底"); allocation.put("irrigationPlanId", irrigation.get("planId")); allocation.put("moisture", current); allocation.put("targetMoisture", target); candidates.add(allocation);
            } catch (ApiException ignored) { }
        }
        List<Map<String, Object>> eligible = candidates.stream().filter(a -> Jsons.number(a, "requestedLitres", 0) > 0 && "READY".equals(Jsons.text(a, "readinessStatus", ""))).toList(); double floorTotal = eligible.stream().mapToDouble(a -> Jsons.number(a, "requestedLitres", 0) * .4).sum();
        if (available >= floorTotal && !eligible.isEmpty()) {
            double remaining = available - floorTotal; for (Map<String, Object> allocation : eligible) allocation.put("allocatedLitres", roundLitres(Jsons.number(allocation, "requestedLitres", 0) * .4));
            double scoreTotal = eligible.stream().mapToDouble(a -> Math.max(.001, Jsons.number(a, "needScore", 0))).sum(); for (Map<String, Object> allocation : eligible) { double req = Jsons.number(allocation, "requestedLitres", 0); double add = Math.min(req - Jsons.number(allocation, "allocatedLitres", 0), remaining * Math.max(.001, Jsons.number(allocation, "needScore", 0)) / scoreTotal); allocation.put("allocatedLitres", roundLitres(Jsons.number(allocation, "allocatedLitres", 0) + add)); }
        } else if (!eligible.isEmpty() && available > 0) {
            double scoreTotal = eligible.stream().mapToDouble(a -> Math.max(.001, Jsons.number(a, "needScore", 0))).sum(); for (Map<String, Object> allocation : eligible) allocation.put("allocatedLitres", roundLitres(available * Math.max(.001, Jsons.number(allocation, "needScore", 0)) / scoreTotal));
        }
        double allocatedTotal = candidates.stream().mapToDouble(a -> Jsons.number(a, "allocatedLitres", 0)).sum(); if (allocatedTotal > available) { Map<String, Object> last = candidates.stream().filter(a -> Jsons.number(a, "allocatedLitres", 0) > 0).reduce((first, second) -> second).orElse(null); if (last != null) last.put("allocatedLitres", roundLitres(Math.max(0, Jsons.number(last, "allocatedLitres", 0) - (allocatedTotal - available)))); }
        Instant cursor = Instant.now().plus(5, ChronoUnit.SECONDS); for (Map<String, Object> allocation : candidates) { double allocated = roundLitres(Jsons.number(allocation, "allocatedLitres", 0)); double requested = Jsons.number(allocation, "requestedLitres", 0); Instant preferredStart = Jsons.instant(allocation.get("preferredStart"), null); Instant preferredEnd = Jsons.instant(allocation.get("preferredEnd"), null); Instant scheduledStart = preferredStart != null && preferredStart.isAfter(cursor) ? preferredStart : cursor; long seconds = Math.max(60, Math.min(properties.getMaxIrrigationSeconds(), Math.round(allocated / Math.max(1, Jsons.number(profile, "flowRateLitresPerMinute", 18)) * 60))); Instant scheduledEnd = scheduledStart.plusSeconds(seconds); if (allocated > 0 && preferredEnd != null && scheduledEnd.isAfter(preferredEnd)) { allocated = 0; allocation.put("readinessStatus", "TIME_WINDOW_CONFLICT"); allocation.put("executionStatus", "FALLBACK_REQUIRED"); allocation.put("timeWindowStatus", "CONFLICT"); allocation.put("explanation", "可执行时长超出农户申报时间窗，需重新协商"); } allocation.put("allocatedLitres", allocated); allocation.put("unmetLitres", roundLitres(Math.max(0, requested - allocated))); allocation.put("scheduledStart", scheduledStart.toString()); allocation.put("scheduledEnd", scheduledEnd.toString()); if (allocated > 0 && "READY".equals(Jsons.text(allocation, "readinessStatus", ""))) cursor = scheduledEnd.plusSeconds(30); }
        Map<String, Object> plan = new LinkedHashMap<>(); String planId = Jsons.id("resource-plan"); plan.put("resourcePlanId", planId); plan.put("farmId", farmId); plan.put("businessDate", businessDate.toString()); plan.put("status", "DRAFT"); plan.put("revision", 1); plan.put("algorithmVersion", "water-allocation-v2"); plan.put("ruleVersion", "water-allocation-v2"); plan.put("cropPackVersion", "mixed-current"); plan.put("snapshot", Map.of("profile", profile, "balance", balance, "plotCount", candidates.size())); plan.put("expiresAt", Instant.now().plus(10, ChronoUnit.MINUTES).toString()); plan.put("allocations", candidates); plan.put("totalRequestedLitres", roundLitres(candidates.stream().mapToDouble(a -> Jsons.number(a, "requestedLitres", 0)).sum())); plan.put("totalAllocatedLitres", roundLitres(candidates.stream().mapToDouble(a -> Jsons.number(a, "allocatedLitres", 0)).sum())); plan.put("totalUnmetLitres", roundLitres(candidates.stream().mapToDouble(a -> Jsons.number(a, "unmetLitres", 0)).sum())); plan.put("trialOnly", farmerPreview); plan.put("readOnly", farmerPreview); plan.put("provenance", "DERIVED"); plan.put("sourceMode", "AI_RULES");
        if (!farmerPreview) { store.saveDurably("resource-plan", planId, plan); markResourceRequestsInReview(plan, principal); events.publish("resource.plan.created", plan); store.logEvent("resource.plan.created", plan); }
        return plan;
    }

    private void markResourceRequestsInReview(Map<String, Object> plan, UserPrincipal principal) {
        String planId = Jsons.text(plan, "resourcePlanId", "");
        for (Map<String, Object> allocation : Jsons.maps(mapper, plan.get("allocations"))) {
            for (String requestId : Jsons.strings(allocation.get("resourceRequestIds"))) {
                Map<String, Object> request = store.find("resource-request", requestId);
                if (request == null || !RESOURCE_REQUEST_ACTIVE.contains(Jsons.text(request, "status", ""))) continue;
                request.put("status", "IN_REVIEW"); request.put("resourcePlanId", planId); request.put("planRevision", plan.get("revision"));
                request.put("revision", Jsons.whole(request, "revision", 1) + 1); appendResourceRequestHistory(request, "PLAN_DRAFTED", principal, "已纳入配水草案");
                saveResourceRequest(request, "resource.request.reviewing");
            }
        }
    }

    private boolean isIrrigationControllerReady(Map<String, Object> device) {
        if (device == null || device.isEmpty() || !"BOUND".equalsIgnoreCase(Jsons.text(device, "bindingState", "BOUND")) || !"ONLINE".equalsIgnoreCase(Jsons.text(device, "status", "OFFLINE")) || !deviceIsSimulated(device)) return false;
        String type = Jsons.text(device, "type", "").toUpperCase(Locale.ROOT); return type.contains("IRRIGATION") || type.contains("WATER") || Jsons.bool(device, "supportsControl", false) || !Jsons.text(device, "controlChannel", "").isBlank();
    }

    Map<String, Object> adjustResourcePlan(String resourcePlanId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal); requireResourcePersistence(); synchronized (resourcePlanLock) {
            Map<String, Object> plan = requireRecord("resource-plan", resourcePlanId); ensureResourcePlanFarm(plan, principal);
            if (!"DRAFT".equals(Jsons.text(plan, "status", ""))) throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_PLAN_NOT_DRAFT", "只有草稿计划可以调整");
            if (Jsons.instant(plan.get("expiresAt"), Instant.MAX).isBefore(Instant.now())) { plan.put("status", "EXPIRED"); store.saveDurably("resource-plan", resourcePlanId, plan); throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_PLAN_EXPIRED", "资源计划已过期，请重新分析"); }
            long expected = Jsons.whole(input, "expectedRevision", Jsons.whole(plan, "revision", 1)); if (expected != Jsons.whole(plan, "revision", 1)) throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_PLAN_VERSION_CONFLICT", "资源计划已被更新，请刷新后再调整");
            String reason = Jsons.text(input, "reason", "").trim(); if (reason.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "ADJUSTMENT_REASON_REQUIRED", "调整配水方案必须填写原因");
            List<Map<String, Object>> adjustments = Jsons.maps(mapper, input.get("adjustments")); Map<String, Object> profile = ensureWaterProfile(Jsons.text(plan, "farmId", "")); double available = Jsons.number(currentWaterBalance(Jsons.text(plan, "farmId", ""), LocalDate.parse(Jsons.text(plan, "businessDate", LocalDate.now().toString()))), "remainingLitres", 0); double total = 0;
            List<Map<String, Object>> allocations = new ArrayList<>(); for (Map<String, Object> source : Jsons.maps(mapper, plan.get("allocations"))) { Map<String, Object> allocation = new LinkedHashMap<>(source); String plotId = Jsons.text(allocation, "plotId", ""); Map<String, Object> change = adjustments.stream().filter(item -> plotId.equals(Jsons.text(item, "plotId", ""))).findFirst().orElse(null); if (change != null) { double max = Jsons.number(allocation, "requestedLitres", 0); double requested = Jsons.number(change, "allocatedLitres", Jsons.number(allocation, "allocatedLitres", 0)); if (requested < 0 || requested > max) throw new ApiException(HttpStatus.BAD_REQUEST, "ALLOCATION_OUT_OF_RANGE", "调整量不能超过地块建议量"); allocation.put("allocatedLitres", roundLitres(requested)); if (change.containsKey("scheduledStart")) allocation.put("scheduledStart", Jsons.text(change, "scheduledStart", Jsons.text(allocation, "scheduledStart", ""))); }
                total += Jsons.number(allocation, "allocatedLitres", 0); allocation.put("unmetLitres", roundLitres(Math.max(0, Jsons.number(allocation, "requestedLitres", 0) - Jsons.number(allocation, "allocatedLitres", 0)))); allocations.add(allocation); }
            if (total > available + .0001) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "RESOURCE_CAPACITY", "调整后的配水量超过当日可分配余额");
            plan.put("allocations", allocations); plan.put("totalAllocatedLitres", roundLitres(total)); plan.put("totalUnmetLitres", roundLitres(allocations.stream().mapToDouble(a -> Jsons.number(a, "unmetLitres", 0)).sum())); plan.put("revision", expected + 1); plan.put("adjustmentReason", reason); plan.put("adjustedBy", principal.userId); plan.put("adjustedAt", Instant.now().toString()); store.saveDurably("resource-plan", resourcePlanId, plan); events.publish("resource.plan.adjusted", plan); store.logEvent("resource.plan.adjusted", plan); return plan;
        }
    }

    Map<String, Object> confirmResourcePlan(String resourcePlanId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal); requireResourcePersistence(); String key = Jsons.text(input, "idempotencyKey", "").trim(); if (key.isBlank()) key = "resource-confirm:" + resourcePlanId;
        synchronized (resourcePlanLock) {
            Map<String, Object> plan = requireRecord("resource-plan", resourcePlanId); ensureResourcePlanFarm(plan, principal); String currentStatus = Jsons.text(plan, "status", "");
            if ("CONFIRMED".equals(currentStatus) || Set.of("RUNNING", "COMPLETED", "PARTIAL", "FAILED").contains(currentStatus)) return plan;
            if (!"DRAFT".equals(currentStatus)) throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_PLAN_NOT_CONFIRMABLE", "当前计划不能确认");
            if (Jsons.instant(plan.get("expiresAt"), Instant.MAX).isBefore(Instant.now())) { plan.put("status", "EXPIRED"); store.saveDurably("resource-plan", resourcePlanId, plan); throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_PLAN_EXPIRED", "资源计划已过期，请重新分析"); }
            long expected = Jsons.whole(input, "expectedRevision", Jsons.whole(plan, "revision", 1)); if (expected != Jsons.whole(plan, "revision", 1)) throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_PLAN_VERSION_CONFLICT", "资源计划版本已更新，请刷新后再确认");
            String farmId = Jsons.text(plan, "farmId", ""); LocalDate date = LocalDate.parse(Jsons.text(plan, "businessDate", LocalDate.now().toString())); Map<String, Object> balance = currentWaterBalance(farmId, date); double allocatedTotal = roundLitres(Jsons.number(plan, "totalAllocatedLitres", 0)); if (allocatedTotal > Jsons.number(balance, "remainingLitres", 0) + .0001) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "RESOURCE_CAPACITY", "蓄水池余额不足，不能确认整批计划");
            balance.put("reservedLitres", roundLitres(Jsons.number(balance, "reservedLitres", 0) + allocatedTotal)); balance.put("revision", Jsons.whole(balance, "revision", 0) + 1); balance.put("remainingLitres", roundLitres(Math.max(0, Jsons.number(balance, "dailyQuotaLitres", 900) - Jsons.number(balance, "reservedLitres", 0) - Jsons.number(balance, "actualUsedLitres", 0)))); store.saveDurably("water-daily-balance", Jsons.text(balance, "waterBalanceId", "water:" + farmId + ":" + date), balance); events.publish("water.balance.updated", balance);
            plan.put("status", "CONFIRMED"); plan.put("revision", expected + 1); plan.put("confirmedBy", principal.userId); plan.put("confirmedAt", Instant.now().toString()); plan.put("approvalIdempotencyKey", key); store.saveDurably("idempotency", key, Map.of("idempotencyKey", key, "resourcePlanId", resourcePlanId, "createdAt", Instant.now().toString()));
            List<Map<String, Object>> allocations = new ArrayList<>(); for (Map<String, Object> source : Jsons.maps(mapper, plan.get("allocations"))) { Map<String, Object> allocation = new LinkedHashMap<>(source); List<String> activeRequestIds = Jsons.strings(allocation.get("resourceRequestIds")).stream().filter(requestId -> { Map<String, Object> request = store.find("resource-request", requestId); return request != null && !Set.of("CANCELLED", "COMPLETED").contains(Jsons.text(request, "status", "")); }).toList(); allocation.put("resourceRequestIds", activeRequestIds); double allocated = Jsons.number(allocation, "allocatedLitres", 0); double unmet = Jsons.number(allocation, "unmetLitres", 0); boolean ready = allocated > 0 && "READY".equals(Jsons.text(allocation, "readinessStatus", "")) && isIrrigationControllerReady(deviceForPlot(Jsons.text(allocation, "plotId", ""))); if (ready) { allocation.put("executionStatus", "SCHEDULED"); events.publish("resource.allocation.scheduled", allocation); if (unmet > 0) allocation.put("fallbackWorkOrderId", ensureManualIrrigationFallback(plan, allocation, unmet, "固定日配额不足，需人工补足缺口")); } else { allocation.put("executionStatus", "FALLBACK_REQUIRED"); double residual = roundLitres(unmet + (allocated > 0 ? allocated : 0)); if (residual > 0) allocation.put("fallbackWorkOrderId", ensureManualIrrigationFallback(plan, allocation, residual, "设备、安全门或容量未满足自动灌溉条件")); }
                allocation.put("collaborationStatus", activeRequestIds.isEmpty() ? "NO_REQUEST" : "PENDING_ACK");
                allocations.add(allocation); }
            plan.put("allocations", allocations); store.saveDurably("resource-plan", resourcePlanId, plan); markResourceRequestsAllocated(plan, principal); events.publish("resource.plan.confirmed", plan); store.logEvent("resource.plan.confirmed", plan); return plan;
        }
    }

    Map<String, Object> cancelResourcePlan(String resourcePlanId, UserPrincipal principal) {
        requireFarmAdmin(principal); requireResourcePersistence(); synchronized (resourcePlanLock) { Map<String, Object> plan = requireRecord("resource-plan", resourcePlanId); ensureResourcePlanFarm(plan, principal); String status = Jsons.text(plan, "status", ""); if (Set.of("RUNNING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED").contains(status)) { if ("CANCELLED".equals(status)) return plan; throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_PLAN_ALREADY_STARTED", "计划已开始执行，不能整批取消"); } if (!"DRAFT".equals(status) && !"CONFIRMED".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "RESOURCE_PLAN_NOT_CANCELLABLE", "当前计划不能取消");
            if ("CONFIRMED".equals(status)) { String farmId = Jsons.text(plan, "farmId", ""); LocalDate date = LocalDate.parse(Jsons.text(plan, "businessDate", LocalDate.now().toString())); Map<String, Object> balance = currentWaterBalance(farmId, date); balance.put("reservedLitres", roundLitres(Math.max(0, Jsons.number(balance, "reservedLitres", 0) - Jsons.number(plan, "totalAllocatedLitres", 0)))); balance.put("revision", Jsons.whole(balance, "revision", 0) + 1); balance.put("remainingLitres", roundLitres(Math.max(0, Jsons.number(balance, "dailyQuotaLitres", 900) - Jsons.number(balance, "reservedLitres", 0) - Jsons.number(balance, "actualUsedLitres", 0)))); store.saveDurably("water-daily-balance", Jsons.text(balance, "waterBalanceId", "water:" + farmId + ":" + date), balance); events.publish("water.balance.updated", balance); }
            plan.put("status", "CANCELLED"); plan.put("cancelledBy", principal.userId); plan.put("cancelledAt", Instant.now().toString()); store.saveDurably("resource-plan", resourcePlanId, plan); releaseResourceRequests(plan, principal); events.publish("resource.plan.cancelled", plan); store.logEvent("resource.plan.cancelled", plan); return plan; }
    }

    private void markResourceRequestsAllocated(Map<String, Object> plan, UserPrincipal principal) {
        for (Map<String, Object> allocation : Jsons.maps(mapper, plan.get("allocations"))) {
            for (String requestId : Jsons.strings(allocation.get("resourceRequestIds"))) {
                Map<String, Object> request = store.find("resource-request", requestId);
                if (request == null || "CANCELLED".equals(Jsons.text(request, "status", ""))) continue;
                request.put("status", "PENDING_ACK"); request.put("resourcePlanId", plan.get("resourcePlanId")); request.put("planRevision", plan.get("revision"));
                request.put("allocatedLitres", allocation.get("allocatedLitres")); request.put("unmetLitres", allocation.get("unmetLitres"));
                request.put("scheduledStart", allocation.get("scheduledStart")); request.put("scheduledEnd", allocation.get("scheduledEnd"));
                request.put("assignedFarmerId", allocation.get("assignedFarmerId")); request.put("assignedFarmerName", allocation.get("assignedFarmerName"));
                request.put("executionStatus", allocation.get("executionStatus")); request.put("revision", Jsons.whole(request, "revision", 1) + 1);
                appendResourceRequestHistory(request, "PLAN_CONFIRMED", principal, "等待农户确认执行时段"); saveResourceRequest(request, "resource.request.allocated");
            }
        }
    }

    private void releaseResourceRequests(Map<String, Object> plan, UserPrincipal principal) {
        for (Map<String, Object> allocation : Jsons.maps(mapper, plan.get("allocations"))) {
            for (String requestId : Jsons.strings(allocation.get("resourceRequestIds"))) {
                Map<String, Object> request = store.find("resource-request", requestId);
                if (request == null || Set.of("COMPLETED", "CANCELLED").contains(Jsons.text(request, "status", ""))) continue;
                request.put("status", "SUBMITTED"); request.remove("resourcePlanId"); request.remove("allocatedLitres"); request.remove("scheduledStart"); request.remove("scheduledEnd");
                request.put("revision", Jsons.whole(request, "revision", 1) + 1); appendResourceRequestHistory(request, "PLAN_CANCELLED", principal, "计划取消，需求已退回待排程");
                saveResourceRequest(request, "resource.request.reopened");
            }
        }
    }

    private void ensureResourcePlanFarm(Map<String, Object> plan, UserPrincipal principal) { String farmId = Jsons.text(plan, "farmId", ""); if (farmId.isBlank() || !principal.canAccessFarm(farmId)) throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权操作该农场的资源计划"); }

    @Scheduled(fixedDelay = 5000)
    void dispatchDueResourcePlans() {
        if (!store.databaseReady()) return;
        synchronized (resourcePlanLock) {
            Instant now = Instant.now(); for (Map<String, Object> planView : store.list("resource-plan")) { String status = Jsons.text(planView, "status", ""); if (!Set.of("CONFIRMED", "RUNNING").contains(status)) continue; Map<String, Object> plan = store.find("resource-plan", Jsons.text(planView, "resourcePlanId", "")); if (plan == null) continue; List<Map<String, Object>> allocations = new ArrayList<>(); boolean changed = false; for (Map<String, Object> source : Jsons.maps(mapper, plan.get("allocations"))) { Map<String, Object> allocation = new LinkedHashMap<>(source); boolean awaitingFarmer = !Jsons.strings(allocation.get("resourceRequestIds")).isEmpty() && !"ACKNOWLEDGED".equals(Jsons.text(allocation, "collaborationStatus", "")); if (!"SCHEDULED".equals(Jsons.text(allocation, "executionStatus", "")) || awaitingFarmer || Jsons.instant(allocation.get("scheduledStart"), Instant.MAX).isAfter(now)) { allocations.add(allocation); continue; } dispatchResourceAllocation(plan, allocation); allocations.add(allocation); changed = true; }
                if (changed) { plan.put("status", "RUNNING"); plan.put("allocations", allocations); boolean allTerminal = allocations.stream().allMatch(a -> RESOURCE_ALLOCATION_TERMINAL.contains(Jsons.text(a, "executionStatus", "")) || Jsons.number(a, "allocatedLitres", 0) <= 0); if (allTerminal) plan.put("status", allocations.stream().anyMatch(a -> Set.of("FAILED", "PARTIAL", "FALLBACK_REQUIRED").contains(Jsons.text(a, "executionStatus", "")) || Jsons.number(a, "unmetLitres", 0) > 0) ? "PARTIAL" : "COMPLETED"); store.saveDurably("resource-plan", Jsons.text(plan, "resourcePlanId", ""), plan); events.publish("resource.plan.running", plan); }
            }
        }
    }

    private void dispatchResourceAllocation(Map<String, Object> plan, Map<String, Object> allocation) {
        String plotId = Jsons.text(allocation, "plotId", ""); Map<String, Object> device = deviceForPlot(plotId); double water = Jsons.number(allocation, "allocatedLitres", 0); if (water <= 0) { allocation.put("executionStatus", "COMPLETED"); return; }
        if (!isIrrigationControllerReady(device)) { allocation.put("executionStatus", "FALLBACK_REQUIRED"); allocation.put("fallbackWorkOrderId", ensureManualIrrigationFallback(plan, allocation, water, "执行前安全门复核未通过")); return; }
        String commandId = Jsons.id("resource-cmd"); String key = "resource:" + Jsons.text(plan, "resourcePlanId", "") + ":" + Jsons.text(allocation, "plotId", "") + ":" + commandId; long duration = Math.max(60, Math.min(properties.getMaxIrrigationSeconds(), Math.round(water / Math.max(1, Jsons.number(ensureWaterProfile(Jsons.text(plan, "farmId", "")), "flowRateLitresPerMinute", 18)) * 60)));
        Map<String, Object> command = new LinkedHashMap<>(); command.put("commandId", commandId); command.put("resourcePlanId", plan.get("resourcePlanId")); command.put("allocationId", Jsons.text(allocation, "plotId", "")); command.put("plotId", plotId); command.put("deviceId", device.get("deviceId")); command.put("type", "IRRIGATION_START"); command.put("durationSeconds", duration); command.put("waterLitre", water); command.put("status", "APPROVED"); command.put("source", "RESOURCE_PLAN"); command.put("approvedBy", plan.get("confirmedBy")); command.put("approvalIdempotencyKey", plan.get("approvalIdempotencyKey")); command.put("idempotencyKey", key); command.put("requestedAt", Instant.now().toString()); store.save("command", commandId, command); events.publish("command.approved", command); mqttCommands.publish(command); allocation.put("executionStatus", "RUNNING"); allocation.put("commandId", commandId); allocation.put("durationSeconds", duration); executeVirtual(command, Map.of("outcome", Jsons.text(allocation, "simulatedOutcome", "SUCCEEDED"))); }

    private String ensureManualIrrigationFallback(Map<String, Object> plan, Map<String, Object> allocation, double residual, String reason) {
        String planId = Jsons.text(plan, "resourcePlanId", ""); String plotId = Jsons.text(allocation, "plotId", ""); String fallbackKey = planId + ":" + plotId + ":" + Jsons.text(allocation, "commandId", "NO_COMMAND"); Map<String, Object> existing = store.list("work-order").stream().filter(w -> "RESOURCE_PLAN".equals(Jsons.text(w, "sourceType", "")) && fallbackKey.equals(Jsons.text(w, "fallbackKey", "")) && !TERMINAL_WORK_ORDER_STATUSES.contains(normalizeWorkStatus(w.get("status")))).findFirst().orElse(null); if (existing != null) { existing.put("requiredWaterLitres", roundLitres(Math.max(residual, Jsons.number(existing, "requiredWaterLitres", 0)))); store.save("work-order", Jsons.text(existing, "workOrderId", ""), existing); return Jsons.text(existing, "workOrderId", ""); }
        String farmId = Jsons.text(plan, "farmId", farmIdForPlot(plotId)); Map<String, Object> assignee = chooseBestFarmerForPlot(farmId, plotId); Map<String, Object> work = new LinkedHashMap<>(); work.put("workOrderId", Jsons.id("wo")); work.put("farmId", farmId); work.put("plotId", plotId); work.put("sourceType", "RESOURCE_PLAN"); work.put("sourceRef", planId); work.put("taskPurpose", "RESOURCE_FALLBACK"); work.put("actionType", "MANUAL_IRRIGATION"); work.put("title", "人工兜底浇水：" + plotId); work.put("reason", reason); work.put("requiredWaterLitres", roundLitres(residual)); work.put("waterSourceMode", "EXTERNAL"); work.put("fallbackKey", fallbackKey); work.put("priority", "HIGH"); work.put("status", assignee == null ? "OPEN" : "ASSIGNED"); work.put("createdAt", Instant.now().toString()); work.put("updatedAt", Instant.now().toString()); work.put("provenance", "DERIVED"); if (assignee != null) { work.put("assigneeId", Jsons.text(assignee, "userId", "")); work.put("assigneeName", Jsons.text(assignee, "displayName", Jsons.text(assignee, "username", ""))); work.put("assignedAt", Instant.now().toString()); work.put("assignmentReason", farmerAssignmentReason(assignee, plotId)); } else { work.put("assigneeId", null); work.put("assigneeName", null); }
        store.save("work-order", Jsons.text(work, "workOrderId", ""), work); events.publish("workorder.created", work); store.logEvent("workorder.created", work); return Jsons.text(work, "workOrderId", "");
    }

    private boolean isManualIrrigationWork(Map<String, Object> work) {
        return "MANUAL_IRRIGATION".equalsIgnoreCase(Jsons.text(work, "actionType", ""))
                && "RESOURCE_PLAN".equalsIgnoreCase(Jsons.text(work, "sourceType", ""));
    }

    private void settleManualIrrigationWork(Map<String, Object> work, UserPrincipal principal) {
        if (Jsons.bool(work, "ledgerSettled", false)) return;
        requireResourcePersistence();
        double actual = roundLitres(Jsons.number(work, "actualWaterLitres", 0)); String source = Jsons.text(work, "waterSourceMode", "EXTERNAL").toUpperCase(Locale.ROOT); String farmId = Jsons.text(work, "farmId", farmIdForPlot(Jsons.text(work, "plotId", "")));
        if ("RESERVOIR".equals(source) && actual > 0) {
            Map<String, Object> profile = ensureWaterProfile(farmId); LocalDate date = LocalDate.now(waterZone(profile)); Map<String, Object> balance = currentWaterBalance(farmId, date); double available = Jsons.number(balance, "remainingLitres", 0); double used = Math.min(actual, available); balance.put("actualUsedLitres", roundLitres(Jsons.number(balance, "actualUsedLitres", 0) + used)); balance.put("usedLitres", balance.get("actualUsedLitres")); balance.put("revision", Jsons.whole(balance, "revision", 0) + 1); balance.put("remainingLitres", roundLitres(Math.max(0, Jsons.number(balance, "dailyQuotaLitres", 900) - Jsons.number(balance, "reservedLitres", 0) - Jsons.number(balance, "actualUsedLitres", 0)))); store.saveDurably("water-daily-balance", Jsons.text(balance, "waterBalanceId", "water:" + farmId + ":" + date), balance); events.publish("water.balance.updated", balance);
        }
        Map<String, Object> ledger = new LinkedHashMap<>(); ledger.put("valueLedgerId", Jsons.id("value")); ledger.put("farmId", farmId); ledger.put("scope", farmId); ledger.put("sourceType", "MANUAL_IRRIGATION"); ledger.put("sourceRef", Jsons.text(work, "workOrderId", "")); ledger.put("baseline", Map.of("waterLitres", Jsons.number(work, "requiredWaterLitres", 0), "source", "RESOURCE_PLAN")); ledger.put("actual", Map.of("waterLitres", actual, "source", "USER_PROVIDED", "sourceMode", source)); ledger.put("status", "COMPUTED"); ledger.put("algorithmVersion", "value-ledger-v2"); ledger.put("createdAt", Instant.now().toString()); store.save("value-ledger", Jsons.text(ledger, "valueLedgerId", ""), ledger); work.put("ledgerSettled", true); work.put("ledgerId", ledger.get("valueLedgerId")); work.put("settledAt", Instant.now().toString()); store.save("work-order", Jsons.text(work, "workOrderId", ""), work); events.publish("value-ledger.updated", ledger);
    }

    private void settleResourceAllocation(Map<String, Object> command, Map<String, Object> ack, Map<String, Object> evaluation) {
        String resourcePlanId = Jsons.text(command, "resourcePlanId", ""); if (resourcePlanId.isBlank() || !store.databaseReady()) return; synchronized (resourcePlanLock) {
            Map<String, Object> plan = store.find("resource-plan", resourcePlanId); if (plan == null) return; String plotId = Jsons.text(command, "plotId", ""); double allocated = roundLitres(Jsons.number(command, "waterLitre", 0)); double actual = roundLitres(Jsons.number(ack, "actualWaterLitre", Jsons.number(ack, "actualWaterLitres", 0))); String ackStatus = Jsons.text(ack, "status", "FAILED").toUpperCase(Locale.ROOT); String execution = "SUCCEEDED".equals(ackStatus) ? "COMPLETED" : "PARTIAL".equals(ackStatus) ? "PARTIAL" : "FAILED";
            List<Map<String, Object>> allocations = new ArrayList<>(); Map<String, Object> target = null; for (Map<String, Object> source : Jsons.maps(mapper, plan.get("allocations"))) { Map<String, Object> a = new LinkedHashMap<>(source); if (plotId.equals(Jsons.text(a, "plotId", ""))) target = a; allocations.add(a); } if (target == null) return; target.put("executionStatus", execution); target.put("collaborationStatus", "COMPLETED".equals(execution) ? "COMPLETED" : "CONFLICT_REPORTED"); target.put("actualWaterLitres", actual); target.put("evaluationId", Jsons.text(evaluation, "evaluationId", "")); target.put("completedAt", Instant.now().toString()); if (actual < allocated) { double residual = roundLitres(allocated - actual); target.put("unmetLitres", roundLitres(Jsons.number(target, "unmetLitres", 0) + residual)); target.put("fallbackWorkOrderId", ensureManualIrrigationFallback(plan, target, residual, "自动灌溉未完成，需人工补水")); }
            String farmId = Jsons.text(plan, "farmId", ""); LocalDate date = LocalDate.parse(Jsons.text(plan, "businessDate", LocalDate.now().toString())); Map<String, Object> balance = currentWaterBalance(farmId, date); balance.put("reservedLitres", roundLitres(Math.max(0, Jsons.number(balance, "reservedLitres", 0) - allocated))); balance.put("actualUsedLitres", roundLitres(Jsons.number(balance, "actualUsedLitres", 0) + Math.min(actual, allocated))); balance.put("usedLitres", balance.get("actualUsedLitres")); balance.put("revision", Jsons.whole(balance, "revision", 0) + 1); balance.put("remainingLitres", roundLitres(Math.max(0, Jsons.number(balance, "dailyQuotaLitres", 900) - Jsons.number(balance, "reservedLitres", 0) - Jsons.number(balance, "actualUsedLitres", 0)))); store.saveDurably("water-daily-balance", Jsons.text(balance, "waterBalanceId", "water:" + farmId + ":" + date), balance); events.publish("water.balance.updated", balance);
            Map<String, Object> ledger = new LinkedHashMap<>(); ledger.put("valueLedgerId", Jsons.id("value")); ledger.put("farmId", farmId); ledger.put("scope", farmId); ledger.put("sourceType", "RESOURCE_PLAN"); ledger.put("sourceRef", resourcePlanId); ledger.put("baseline", Map.of("waterLitres", allocated, "source", "AI_RULES")); ledger.put("actual", Map.of("waterLitres", actual, "source", "OBSERVED", "sourceMode", "SIMULATION")); ledger.put("status", "COMPUTED"); ledger.put("algorithmVersion", "value-ledger-v2"); ledger.put("createdAt", Instant.now().toString()); store.save("value-ledger", Jsons.text(ledger, "valueLedgerId", ""), ledger); events.publish("value-ledger.updated", ledger);
            updateResourceRequestsAfterExecution(target, execution, actual);
            boolean allDone = allocations.stream().allMatch(a -> RESOURCE_ALLOCATION_TERMINAL.contains(Jsons.text(a, "executionStatus", "")) || Jsons.number(a, "allocatedLitres", 0) <= 0); boolean anyFailure = allocations.stream().anyMatch(a -> Set.of("FAILED", "PARTIAL", "FALLBACK_REQUIRED").contains(Jsons.text(a, "executionStatus", "")) || Jsons.number(a, "unmetLitres", 0) > 0); plan.put("allocations", allocations); if (allDone) plan.put("status", anyFailure ? "PARTIAL" : "COMPLETED"); store.saveDurably("resource-plan", resourcePlanId, plan); events.publish("resource.allocation.updated", target); events.publish("resource.plan.updated", plan);
        }
    }

    private void updateResourceRequestsAfterExecution(Map<String, Object> allocation, String executionStatus, double actualWaterLitres) {
        for (String requestId : Jsons.strings(allocation.get("resourceRequestIds"))) {
            Map<String, Object> request = store.find("resource-request", requestId);
            if (request == null || "CANCELLED".equals(Jsons.text(request, "status", ""))) continue;
            boolean completed = "COMPLETED".equals(executionStatus);
            request.put("status", completed ? "COMPLETED" : "CONFLICT_REPORTED"); request.put("executionStatus", executionStatus);
            request.put("actualWaterLitres", roundLitres(actualWaterLitres)); request.put("completedAt", Instant.now().toString());
            if (!completed) request.put("responseNote", "模拟执行未完全成功，已转入人工复核");
            request.put("revision", Jsons.whole(request, "revision", 1) + 1);
            List<Map<String, Object>> history = new ArrayList<>(Jsons.maps(mapper, request.get("history")));
            history.add(new LinkedHashMap<>(Map.of("action", completed ? "EXECUTION_COMPLETED" : "EXECUTION_EXCEPTION", "actorId", "system", "actorName", "AgriLoop", "actorRole", "SYSTEM", "at", Instant.now().toString())));
            request.put("history", history); saveResourceRequest(request, completed ? "resource.request.completed" : "resource.request.execution_exception");
        }
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
        String planId = Jsons.text(input, "planId", ""); String evaluationId = Jsons.text(input, "evaluationId", "");
        String decision = Jsons.text(input, "decision", "ACCEPTED").toUpperCase(Locale.ROOT);
        String idempotencyKey = Jsons.text(input, "idempotencyKey", "").trim();
        if ("REQUEST_APPROVAL".equals(decision)) {
            if (planId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "PLAN_ID_REQUIRED", "提交审批必须关联灌溉处方");
            if (idempotencyKey.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "IDEMPOTENCY_REQUIRED", "提交审批必须携带幂等键");
            Map<String, Object> repeated = store.list("feedback").stream()
                    .filter(item -> idempotencyKey.equals(Jsons.text(item, "idempotencyKey", "")))
                    .findFirst().orElse(null);
            if (repeated != null) return repeated;
            Map<String, Object> plan = irrigationPlanById(planId, principal);
            String planTraceId = Jsons.text(plan, "traceId", "");
            if (!planTraceId.isBlank() && !traceId.equals(planTraceId)) {
                throw new ApiException(HttpStatus.CONFLICT, "TRACE_PLAN_MISMATCH", "决策记录与灌溉处方不一致");
            }
            Map<String, Object> approval = createWorkOrder(Map.ofEntries(
                    Map.entry("farmId", farmIdForPlot(Jsons.text(plan, "plotId", ""))),
                    Map.entry("plotId", Jsons.text(plan, "plotId", "")),
                    Map.entry("title", "灌溉处方审批：" + Jsons.text(plan, "planId", "")),
                    Map.entry("reason", "兼容旧流程：农户已核对处方，请管理员审批并执行虚拟命令"),
                    Map.entry("actionType", "IRRIGATION_REVIEW"),
                    Map.entry("sourceType", "DECISION"),
                    Map.entry("sourceRef", planId),
                    Map.entry("traceId", traceId),
                    Map.entry("planId", planId),
                    Map.entry("readinessId", Jsons.text(plan, "readinessId", "")),
                    Map.entry("priority", "HIGH"),
                    Map.entry("dueAt", Instant.now().plus(2, ChronoUnit.HOURS).toString()),
                    Map.entry("idempotencyKey", idempotencyKey)
            ), principal);
            input = new LinkedHashMap<>(input);
            input.put("workOrderId", approval.get("workOrderId"));
            input.put("approvalStatus", "PENDING");
        }
        Map<String, Object> feedback = new LinkedHashMap<>(input); feedback.put("feedbackId", Jsons.text(input, "feedbackId", Jsons.id("feedback"))); feedback.put("traceId", traceId); feedback.put("actorId", principal.userId); feedback.put("createdAt", Instant.now().toString());
        feedback.put("decision", decision); store.save("feedback", Jsons.text(feedback, "feedbackId", ""), feedback);
        if (!idempotencyKey.isBlank()) store.save("feedback-idempotency", idempotencyKey, feedback);
        events.publish("decision.feedback", feedback);
        Map<String, Object> evaluation = evaluationId.isBlank() ? null : store.find("evaluation", evaluationId);
        if (evaluation == null && !planId.isBlank()) evaluation = store.list("evaluation").stream().filter(e -> planId.equals(Jsons.text(e, "planId", ""))).findFirst().orElse(null);
        // Every feedback-linked plan becomes an auditable PENDING case first.
        // The controlled-learning service applies the deterministic quality
        // gate; feedback alone can never make a case positive.
        Map<String, Object> plan = planId.isBlank() ? null : store.find("irrigation-plan", planId);
        if (plan != null) {
            Map<String, Object> caseRecord = controlledLearning.createDecisionCase(traceId, input, feedback, plan, evaluation, principal);
            if (!caseRecord.isEmpty()) feedback.put("caseId", caseRecord.get("caseId"));
        }
        return feedback;
    }

    List<Map<String, Object>> similarCases(String traceId, Map<String, Object> context, UserPrincipal principal) {
        return controlledLearning.similarCases(traceId, context == null ? Map.of() : context, principal);
    }

    /** Retain the old package-level call shape for existing integrations. */
    List<Map<String, Object>> similarCases(String traceId, Map<String, Object> context) {
        return controlledLearning.similarCases(traceId, context == null ? Map.of() : context, null);
    }

    Map<String, Object> strategyCandidate(Map<String, Object> input, UserPrincipal principal) {
        if (input != null && (!Jsons.strings(input.get("caseIds")).isEmpty()
                || !Jsons.strings(input.get("evidenceCaseIds")).isEmpty()
                || Jsons.bool(input, "generateFromCases", false))) {
            return controlledLearning.generateStrategyCandidate(input, principal);
        }
        if (!principal.isSystemAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "STRATEGY_FORBIDDEN", "只有系统管理员可以管理策略候选");
        Map<String, Object> request = input == null ? Map.of() : input;
        Map<String, Object> candidate = new LinkedHashMap<>(request);
        candidate.put("candidateId", Jsons.text(request, "candidateId", Jsons.id("strategy")));
        candidate.put("status", "DRAFT");
        candidate.put("reviewer", principal.userId);
        candidate.put("candidateVersion", "candidate-1");
        candidate.put("createdAt", Instant.now().toString());
        // This endpoint predates controlled learning and is still used by
        // existing integrations to author a strategy from the current rules.
        // Mark it explicitly as a manual baseline candidate so it can follow
        // the offline-validation/approval workflow without being mistaken for
        // a positive learning case.  The controlled-learning generator never
        // accepts this marker from client input.
        candidate.put("provenance", "MANUAL_AUTHORED");
        candidate.put("learningEligible", false);
        candidate.put("learningUses", List.of(ControlledLearningService.NONE));
        candidate.put("evidenceCaseIds", List.of());
        candidate.put("evidenceCount", 0);
        candidate.put("baselineStrategy", request.containsKey("baselineStrategy")
                ? request.get("baselineStrategy") : Map.of("source", "manual-input"));
        candidate.put("proposedStrategy", request.containsKey("proposedStrategy")
                ? request.get("proposedStrategy") : Map.of("source", "manual-input"));
        store.save("strategy-candidate", Jsons.text(candidate, "candidateId", ""), candidate); return candidate;
    }

    Map<String, Object> generateStrategyCandidate(Map<String, Object> input, UserPrincipal principal) {
        return controlledLearning.generateStrategyCandidate(input == null ? Map.of() : input, principal);
    }

    Map<String, Object> offlineValidateStrategy(String id, Map<String, Object> input, UserPrincipal principal) {
        return controlledLearning.offlineValidateCandidate(id, input == null ? Map.of() : input, principal);
    }

    Map<String, Object> transitionStrategy(String id, String target, UserPrincipal principal) {
        return governance.transitionStrategy(id, target, Map.of(), principal);
    }

    private Map<String, Object> planFarmerAgentAction(String message, String plotId, UserPrincipal principal, String traceId) {
        String text = message.trim();
        String lower = text.toLowerCase(Locale.ROOT);
        String resolvedPlotId = resolveAgentPlot(text, plotId, principal);

        // Farmer accounts never receive administrator write previews.  Keep the
        // refusal explicit so a model suggestion cannot be mistaken for an
        // available tool.
        if (containsAny(text, "新增地块", "新建地块", "绑定设备", "换绑设备", "解绑设备", "关闭告警", "分配他人", "派发任务", "修改地块")) {
            return clarification("农户账号不能执行新增地块、绑定设备、关闭告警或分配他人任务；请联系农场管理员处理。");
        }

        if (text.matches(".*(记录|提交).*(巡田|复测).*")) {
            if (resolvedPlotId.isBlank()) return clarification("请先指定巡田地块名称或编号。");
            String notes = match(text, "(?:说明|备注|记录|结果)\\s*[：:]\\s*(.+)");
            if (notes.isBlank()) notes = match(text, "(?:巡田|复测)\\s*[：:]\\s*(.+)");
            if (notes.isBlank()) return clarification("请补充现场说明，例如“帮我记录一次巡田：叶片正常，土壤表面偏干”。聊天页本期只支持文字，照片请到巡田记录页补充。");
            Map<String, Object> args = new LinkedHashMap<>();
            args.put("farmId", farmIdForPlot(resolvedPlotId)); args.put("plotId", resolvedPlotId);
            args.put("notes", notes.trim()); args.put("sourceType", "HUMAN_OBSERVATION");
            String surface = containsAny(notes, "干", "开裂") ? "DRY" : containsAny(notes, "积水", "过湿") ? "WET" : "NORMAL";
            String crop = containsAny(notes, "萎蔫", "发蔫") ? "LEAF_SLIGHT_WILT" : "HEALTHY";
            args.put("soilSurface", surface); args.put("cropCondition", crop);
            return createAgentActionProposal("create_inspection_record", args, "在 " + resolvedPlotId + " 提交巡田记录", traceId, principal, resolvedPlotId, List.of("inspections", "messages"));
        }

        if (containsAny(text, "申请巡田", "申请复测", "申请设备检查", "申请补证", "请求巡田", "请求复测")) {
            if (resolvedPlotId.isBlank()) return clarification("请指定需要补证的地块名称或编号。");
            String evidenceType = containsAny(text, "设备") ? "DEVICE_CHECK" : containsAny(text, "复测") ? "RETEST" : "FIELD_INSPECTION";
            String reason = match(text, "(?:原因|说明|备注)\\s*[：:]\\s*(.+)");
            if (reason.isBlank()) reason = "农户申请" + ("DEVICE_CHECK".equals(evidenceType) ? "设备检查" : "RETEST".equals(evidenceType) ? "传感器复测" : "现场巡田");
            Map<String, Object> args = new LinkedHashMap<>();
            args.put("farmId", farmIdForPlot(resolvedPlotId)); args.put("plotId", resolvedPlotId);
            args.put("evidenceType", evidenceType); args.put("reason", reason);
            args.put("sourceType", "READINESS"); args.put("actionType", "INSPECTION");
            return createAgentActionProposal("create_evidence_request", args, "为 " + resolvedPlotId + " 申请" + ("DEVICE_CHECK".equals(evidenceType) ? "设备检查" : "RETEST".equals(evidenceType) ? "传感器复测" : "现场巡田"), traceId, principal, resolvedPlotId, List.of("workOrders", "messages"));
        }

        if (containsAny(text, "开始任务", "开始执行", "继续任务", "重新处理", "提交任务", "提交结果", "完成任务")) {
            List<Map<String, Object>> candidates = farmerAgentWorkCandidates(text, resolvedPlotId, principal);
            if (candidates.isEmpty()) return clarification("没有找到当前账号负责的匹配任务，请补充任务编号或任务名称。");
            if (candidates.size() > 1) {
                String options = candidates.stream().limit(5).map(item -> Jsons.text(item, "workOrderId", "任务") + "（" + Jsons.text(item, "title", "未命名") + "）").collect(Collectors.joining("、"));
                return clarification("匹配到多项任务，请选择一项：" + options);
            }
            Map<String, Object> work = candidates.get(0);
            String current = normalizeWorkStatus(work.get("status"));
            String action = containsAny(text, "提交", "完成") ? "SUBMIT" : ("REJECTED".equals(current) || containsAny(text, "继续", "重新")) ? "RESTART" : "START";
            if ("START".equals(action) && !"ASSIGNED".equals(current)) return clarification("该任务当前状态为" + current + "，只有已分配任务可以开始。");
            if ("RESTART".equals(action) && !"REJECTED".equals(current)) return clarification("只有被退回的任务可以重新处理。");
            if ("SUBMIT".equals(action) && !"IN_PROGRESS".equals(current)) return clarification("请先开始任务，再提交处理结果。");
            Map<String, Object> args = new LinkedHashMap<>(); args.put("workOrderId", Jsons.text(work, "workOrderId", "")); args.put("action", action);
            if ("SUBMIT".equals(action)) {
                String result = match(text, "(?:结果|说明|备注)\\s*[：:]\\s*(.+)");
                if (result.isBlank()) return clarification("提交任务必须包含处理结果，例如“提交任务 wo-001：已完成滴灌管路检查，未发现渗漏”。");
                args.put("resultSummary", result.trim());
            }
            return createAgentActionProposal("transition_assigned_work_order", args, ("START".equals(action) ? "开始" : "RESTART".equals(action) ? "继续" : "提交") + "任务：" + Jsons.text(work, "title", Jsons.text(work, "workOrderId", "")), traceId, principal, resolvedPlotId, List.of("workOrders", "messages"));
        }

        if (containsAny(text, "执行灌溉", "启动灌溉", "开始灌溉", "执行浇水", "启动浇水")) {
            if (resolvedPlotId.isBlank()) return clarification("请先指定要灌溉的地块。");
            Map<String, Object> plan = irrigationPlan(Map.of("plotId", resolvedPlotId, "traceId", traceId), principal);
            if ("NO_ACTION".equals(Jsons.text(plan, "status", ""))) {
                Map<String, Object> expected = Jsons.map(mapper, plan.get("expectedResult"));
                double current = Math.round(Jsons.number(expected, "from", 0) * 10.0) / 10.0;
                double target = Math.round(Jsons.number(expected, "to", 0) * 10.0) / 10.0;
                return Map.of(
                        "status", "NO_ACTION",
                        "clarification", "当前土壤湿度 " + current + "% 已达到补水目标 " + target
                                + "%，本次无需灌溉，也不用补证。若现场情况与读数不符，再记录一次巡田或便携仪复测。",
                        "plan", plan);
            }
            String readinessStatus = Jsons.text(plan, "readinessStatus", "HUMAN_REVIEW");
            if (!Jsons.bool(plan, "executable", false) || !"READY".equals(readinessStatus)) {
                Map<String, Object> readiness = readiness("IRRIGATION_PLAN", Jsons.text(plan, "planId", ""), principal);
                List<String> missing = Jsons.strings(readiness.get("missingEvidence"));
                String missingText = missing.stream().map(this::diagnosisEvidenceLabel).limit(4).collect(Collectors.joining("、"));
                String reason = Jsons.text(plan, "why", "数据质量、安全门或设备状态未通过");
                String next = missingText.isBlank() ? reason : "还缺少：" + missingText;
                return Map.of("status", "NEEDS_EVIDENCE", "clarification", "暂不能生成灌溉执行卡：" + next + "。请先完成对应检查，再重新生成处方。", "readiness", readiness);
            }
            Map<String, Object> guard = irrigationGuard(resolvedPlotId, principal);
            Map<String, Object> emergency = Jsons.map(mapper, plan.get("emergency"));
            Map<String, Object> args = new LinkedHashMap<>(); args.put("plotId", resolvedPlotId); args.put("planId", Jsons.text(plan, "planId", ""));
            args.put("waterLitre", plan.get("waterLitre")); args.put("durationSeconds", plan.get("durationSeconds"));
            args.put("emergencyOverride", false);
            String summary = "对 " + resolvedPlotId + " 执行虚拟灌溉约 " + Jsons.number(plan, "waterLitre", 0) + " L";
            return createAgentActionProposal("execute_virtual_irrigation", args, summary, traceId, principal, resolvedPlotId, List.of("irrigation", "plots", "messages"));
        }
        return null;
    }

    private List<Map<String, Object>> farmerAgentWorkCandidates(String text, String plotId, UserPrincipal principal) {
        String lower = text.toLowerCase(Locale.ROOT);
        List<Map<String, Object>> scoped = store.list("work-order").stream()
                .filter(work -> canAccessPlot(principal, Jsons.text(work, "plotId", "")))
                .filter(work -> principal.userId.equals(Jsons.text(work, "assigneeId", "")))
                .filter(work -> plotId.isBlank() || plotId.equals(Jsons.text(work, "plotId", "")))
                .filter(work -> !TERMINAL_WORK_ORDER_STATUSES.contains(normalizeWorkStatus(work.get("status"))))
                .toList();
        // An explicit id/title is preferred.  When the farmer says only
        // “开始我的任务” (or similar), return every open task in scope so the
        // caller can present a bounded candidate list instead of guessing.
        List<Map<String, Object>> explicit = scoped.stream()
                .filter(work -> {
                    String id = Jsons.text(work, "workOrderId", "").toLowerCase(Locale.ROOT);
                    String title = Jsons.text(work, "title", "").toLowerCase(Locale.ROOT);
                    return lower.contains(id) || (!title.isBlank() && lower.contains(title));
                })
                .map(this::normalizeWorkOrderForRead).toList();
        return explicit.isEmpty() ? scoped.stream().map(this::normalizeWorkOrderForRead).toList() : explicit;
    }

    /**
     * Build a bounded, reviewable mutation proposal from natural language.  The
     * parser intentionally only emits registered internal tools; it never
     * executes a write while composing an answer.
     */
    private Map<String, Object> planAgentAction(String message, String plotId, UserPrincipal principal, String traceId) {
        if (message == null || message.isBlank()) return null;
        if (principal.isFarmer()) return planFarmerAgentAction(message, plotId, principal, traceId);
        if (!principal.isFarmAdmin()) return null;
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
        action.put("actorRole", principal.role);
        action.put("riskLevel", "execute_virtual_irrigation".equals(tool) ? "HIGH" : "transition_assigned_work_order".equals(tool) ? "MEDIUM" : "LOW");
        action.put("sourceMode", "execute_virtual_irrigation".equals(tool) ? "SIMULATED" : Set.of("create_inspection_record", "create_evidence_request", "transition_assigned_work_order").contains(tool) ? "USER_PROVIDED" : "DERIVED");
        if ("execute_virtual_irrigation".equals(tool)) {
            action.put("executionMode", Jsons.bool(args, "automatic", false) ? "AUTOMATIC_THRESHOLD" : "NORMAL");
        }
        action.put("argumentSummary", agentActionArgumentSummary(tool, args, plotId));
        action.put("affectedDomains", domains); action.put("status", "AWAITING_CONFIRMATION"); action.put("createdAt", now.toString());
        action.put("expiresAt", now.plus(AGENT_ACTION_TTL).toString()); action.put("traceId", traceId);
        store.save("agent-action", actionId, action); events.publish("agent.action.proposed", action); store.logEvent("agent.action.proposed", action);
        Map<String, Object> publicView = new LinkedHashMap<>(action); publicView.remove("userId"); publicView.put("requiresConfirmation", true); return publicView;
    }

    private String agentActionArgumentSummary(String tool, Map<String, Object> args, String plotId) {
        String plot = plotId.isBlank() ? "当前范围" : plotId;
        return switch (tool) {
            case "execute_virtual_irrigation" -> (Jsons.bool(args, "emergencyOverride", false) ? "应急补水 · " : "")
                    + plot + " · " + Jsons.number(args, "waterLitre", 0) + " L · " + Jsons.whole(args, "durationSeconds", 0) / 60.0 + " 分钟";
            case "create_inspection_record" -> plot + " · " + Jsons.text(args, "notes", "现场说明");
            case "transition_assigned_work_order" -> Jsons.text(args, "workOrderId", "本人任务") + " · " + Jsons.text(args, "action", "更新状态");
            case "create_evidence_request" -> plot + " · " + Jsons.text(args, "evidenceType", "现场巡田");
            default -> Jsons.json(mapper, args).length() > 160 ? Jsons.json(mapper, args).substring(0, 160) + "…" : Jsons.json(mapper, args);
        };
    }

    private String resolveAgentPlot(String text, String fallback, UserPrincipal principal) {
        Matcher id = Pattern.compile("(?:plot[-_][A-Za-z0-9-]+)", Pattern.CASE_INSENSITIVE).matcher(text);
        if (id.find()) return canAccessPlot(principal, id.group()) ? id.group() : "";
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

    private boolean agentToolAllowed(String tool, UserPrincipal principal) {
        if (!AGENT_MUTATION_TOOLS.contains(tool)) return false;
        if (principal == null) return false;
        if (principal.isFarmer()) return Set.of("transition_assigned_work_order", "create_inspection_record", "create_evidence_request", "execute_virtual_irrigation").contains(tool);
        return principal.isFarmAdmin() && !Set.of("transition_assigned_work_order", "create_inspection_record", "create_evidence_request", "execute_virtual_irrigation").contains(tool);
    }

    private void authorizeAgentAction(Map<String, Object> action, UserPrincipal principal) {
        String tool = Jsons.text(action, "toolName", "");
        if (!agentToolAllowed(tool, principal)) throw new ApiException(HttpStatus.FORBIDDEN, "AGENT_TOOL_NOT_ALLOWED", "当前身份不能执行该 Agent 操作");
        if (!principal.userId.equals(Jsons.text(action, "userId", ""))) throw new ApiException(HttpStatus.FORBIDDEN, "AGENT_ACTION_FORBIDDEN", "无权确认该 Agent 操作");
        String plotId = Jsons.text(action, "plotId", "");
        if (!plotId.isBlank()) ensurePlotAccess(principal, plotId);
        String actorRole = Jsons.text(action, "actorRole", principal.role);
        if (!principal.role.equals(actorRole)) throw new ApiException(HttpStatus.FORBIDDEN, "AGENT_ACTION_ROLE_CHANGED", "当前角色与操作预览不一致，请重新生成操作");
    }

    Map<String, Object> confirmAgentAction(String actionId, Map<String, Object> input, UserPrincipal principal) {
        Map<String, Object> action = requireRecord("agent-action", actionId);
        authorizeAgentAction(action, principal);
        String status = Jsons.text(action, "status", ""); if ("SUCCEEDED".equals(status)) return action;
        if (!"AWAITING_CONFIRMATION".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "AGENT_ACTION_STATE_INVALID", "该操作已处理或不可再确认");
        if (Instant.now().isAfter(Jsons.instant(action.get("expiresAt"), Instant.EPOCH))) { action.put("status", "EXPIRED"); store.save("agent-action", actionId, action); throw new ApiException(HttpStatus.CONFLICT, "AGENT_ACTION_EXPIRED", "操作预览已过期，请重新生成"); }
        String idempotencyKey = Jsons.text(input, "idempotencyKey", "agent-confirm:" + actionId); Map<String, Object> prior = store.find("agent-action-idempotency", idempotencyKey); if (prior != null) return prior;
        action.put("status", "EXECUTING"); action.put("confirmedBy", principal.userId); action.put("confirmedAt", Instant.now().toString()); store.save("agent-action", actionId, action);
        try {
            Map<String, Object> args = Jsons.map(mapper, action.get("arguments"));
            args.put("idempotencyKey", idempotencyKey); args.put("confirmed", true);
            if ("execute_virtual_irrigation".equals(Jsons.text(action, "toolName", ""))) args.put("agentActionId", actionId);
            Map<String, Object> result = executeAgentAction(Jsons.text(action, "toolName", ""), args, principal);
            String tool = Jsons.text(action, "toolName", "");
            String resultStatus = Jsons.text(result, "status", "");
            boolean virtualPending = "execute_virtual_irrigation".equals(tool)
                    && Set.of("CONFIRMED", "APPROVED", "PENDING", "EXECUTING", "" ).contains(resultStatus);
            action.put("status", virtualPending ? "EXECUTING" : Set.of("FAILED", "PARTIAL", "TIMEOUT").contains(resultStatus) ? resultStatus : "SUCCEEDED");
            action.put("result", result); action.put("idempotencyKey", idempotencyKey);
            if (!"EXECUTING".equals(Jsons.text(action, "status", ""))) action.put("completedAt", Instant.now().toString());
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
            case "transition_assigned_work_order" -> transitionWorkOrder(Jsons.text(args, "workOrderId", ""), args, principal);
            case "create_inspection_record" -> createInspection(args, principal);
            case "create_evidence_request" -> createWorkOrder(args, principal);
            case "execute_virtual_irrigation" -> createCommand(args, principal);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_TOOL_NOT_ALLOWED", "不支持的 Agent 操作");
        };
    }

    Map<String, Object> agentAction(String actionId, UserPrincipal principal) {
        Map<String, Object> action = requireRecord("agent-action", actionId);
        authorizeAgentAction(action, principal);
        return action;
    }

    Map<String, Object> cancelAgentAction(String actionId, UserPrincipal principal) {
        Map<String, Object> action = requireRecord("agent-action", actionId);
        authorizeAgentAction(action, principal);
        if (!"AWAITING_CONFIRMATION".equals(Jsons.text(action, "status", ""))) throw new ApiException(HttpStatus.CONFLICT, "AGENT_ACTION_STATE_INVALID", "该操作已处理");
        if (Instant.now().isAfter(Jsons.instant(action.get("expiresAt"), Instant.EPOCH))) {
            action.put("status", "EXPIRED");
            store.save("agent-action", actionId, action);
            throw new ApiException(HttpStatus.CONFLICT, "AGENT_ACTION_EXPIRED", "操作预览已过期，请重新生成");
        }
        action.put("status", "CANCELED"); action.put("canceledBy", principal.userId); action.put("canceledAt", Instant.now().toString()); store.save("agent-action", actionId, action); events.publish("agent.action.canceled", action); return action;
    }

    /**
     * The Agent endpoint is shared by all three workspaces, but its useful
     * answer surface is intentionally role-scoped.  Keeping the profile in
     * the response lets the UI share one visual language without suggesting
     * that a farmer has platform-admin capabilities (or vice versa).
     */
    private Map<String, Object> agentRoleProfile(UserPrincipal principal) {
        if (principal != null && principal.isSystemAdmin()) {
            return Map.of(
                    "scopeLabel", "全平台（跨农场）",
                    "capabilities", List.of("查看平台与服务状态", "跨农场风险概览", "查询规则、策略与版本", "查看决策与工具审计", "排查数据链路与设备接入"),
                    "restrictions", List.of("不直接修改农场业务数据", "不绕过审批、安全门或审计记录"),
                    "guidance", "以平台稳定性、规则版本、数据链路和审计证据为重点；不要把农场操作建议写成已执行结果");
        }
        if (principal != null && principal.isFarmAdmin()) {
            return Map.of(
                    "scopeLabel", "当前农场（全场地块）",
                    "capabilities", List.of("查看全场地块与告警", "诊断异常根因", "安排和分派农务任务", "管理设备绑定与灌溉计划", "复核执行结果"),
                    "restrictions", List.of("只能操作当前农场范围", "写入操作必须预览、复核并确认"),
                    "guidance", "以农场运营、告警处置、任务分派、设备健康和资源安排为重点；明确区分建议与已执行操作");
        }
        return Map.of(
                "scopeLabel", "本人负责地块",
                "capabilities", List.of("查看负责地块状态", "理解告警与诊断结论", "查看今日待办", "获取灌溉建议", "提交巡田、复测和任务结果"),
                "restrictions", List.of("不能新增或修改地块", "不能绑定设备、关闭告警或给他人派任务", "灌溉等写入操作必须经过安全门和本人确认"),
                "guidance", "以现场巡田、本人任务、地块风险和可执行的农事步骤为重点；用易懂语言说明需要补充的证据");
    }

    private String agentGreeting(UserPrincipal principal) {
        if (principal != null && principal.isSystemAdmin()) return "你好！我是农智助手，负责平台运行、规则版本、跨农场风险和决策审计。";
        if (principal != null && principal.isFarmAdmin()) return "你好！我是农智助手，协助你管理全农场告警、农务任务、设备和灌溉安排。";
        return "你好！我是农智助手，专注你负责的地块、巡田记录、任务进度和灌溉建议。";
    }

    private String agentCapabilityNarrative(UserPrincipal principal, Map<String, Object> profile) {
        String scope = Jsons.text(profile, "scopeLabel", "当前范围");
        if (principal != null && principal.isSystemAdmin()) {
            return "我服务于" + scope + "，可以查看平台与服务状态、跨农场风险、规则/策略版本、数据链路和决策审计。这里的实时事实来自后端记录；我不会直接修改农场业务数据，也不会绕过审批、安全门或审计。";
        }
        if (principal != null && principal.isFarmAdmin()) {
            return "我服务于" + scope + "，可以汇总告警、诊断根因、安排农务任务、检查设备和试算灌溉计划。写入操作会先展示参数预览，再经过权限、安全门和你的确认；我不会把建议当成已执行结果。";
        }
        return "我服务于" + scope + "，可以查看地块状态、解释风险、整理今日待办、生成灌溉建议，并帮你提交巡田/复测/任务结果。涉及写入的操作会先展示预览并等待你的确认；新增地块、设备绑定和关闭告警请联系农场管理员。";
    }

    Map<String, Object> agentChat(Map<String, Object> input, UserPrincipal principal) {
        String message = Jsons.text(input, "message", Jsons.text(input, "query", "")).trim();
        String displayMessage = Jsons.text(input, "displayMessage", "").trim();
        if (displayMessage.isBlank()) displayMessage = cleanAgentHistoryUserMessage(message);
        String plotId = Jsons.text(input, "plotId", "plot-a01");
        ensurePlotAccess(principal, plotId);
        List<Map<String, Object>> agentImages = normalizeAgentImages(input.get("images"));
        if (agentImages.isEmpty() && isLegacyBrowserVisionPrompt(message)) {
            throw new ApiException(HttpStatus.CONFLICT, "CLIENT_VISION_VERSION_STALE",
                    "页面仍在使用旧识图组件，系统已拒绝根据分类标签猜图。请刷新页面后重新上传原图");
        }
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
        Map<String, Object> roleProfile = agentRoleProfile(principal);
        answer.put("role", principal.role);
        answer.put("roleLabel", RolePolicy.label(principal.role));
        answer.put("roleProfile", roleProfile);
        if (!agentImages.isEmpty()) {
            answer.put("vision", Map.of(
                    "imageCount", agentImages.size(),
                    "provider", "openai-compatible",
                    "model", configuredVisionModel(),
                    "provenance", "USER_PROVIDED",
                    "images", agentImageMetadata(agentImages)));
        }

        String aiMode = properties.getAiMode() == null ? "rules-only" : properties.getAiMode().toLowerCase(Locale.ROOT).trim();
        boolean openAiCompatible = aiMode.equals("openai") || aiMode.equals("openai-compatible");
        String adapter = aiMode.equals("mock") ? "mock" : aiMode.equals("maxkb") ? "maxkb" : openAiCompatible ? "openai-compatible" : "rules";
        answer.put("adapter", adapter);
        answer.put("knowledgeEvidence", knowledgeEvidence(plotId));
        boolean fastPath = false;
        // A photo is evidence for a model-assisted observation, not a safe basis
        // for silently triggering the deterministic mutation parser.
        Map<String, Object> actionProposal = agentImages.isEmpty() ? planAgentAction(message, plotId, principal, traceId) : null;
        if (actionProposal != null) {
            boolean hasPreview = actionProposal.containsKey("actionId");
            answer.put("intent", hasPreview ? "AGENT_ACTION" : "CLARIFICATION");
            if (actionProposal.containsKey("status")) answer.put("status", actionProposal.get("status"));
            if (actionProposal.containsKey("clarification")) answer.put("clarification", actionProposal.get("clarification"));
            if (hasPreview) answer.put("actionProposal", actionProposal);
            answer.put("summary", Jsons.text(actionProposal, "summary", "需要补充信息"));
            answer.put("narrative", Jsons.text(actionProposal, "clarification", Jsons.text(actionProposal, "summary", "已生成操作预览，等待确认执行。")));
            answer.put("narrativeProvenance", "DERIVED"); answer.put("adapter", "rules-agent"); fastPath = true;
        } else if (!agentImages.isEmpty()) {
            answer.put("intent", "IMAGE_ANALYSIS");
            answer.put("summary", "已读取 " + agentImages.size() + " 张用户图片并结合问题分析");
            answer.put("result", Map.of(
                    "imageCount", agentImages.size(),
                    "inputSource", "USER_PROVIDED",
                    "plotId", plotId,
                    "cropContext", plotCropContext(plotId)));
        } else if (isGreeting(message)) {
            // Greetings and other social pleasantries do not need a 27B inference call.
            // Keeping this deterministic also prevents a one-word message from causing
            // the model to echo the whole telemetry context.
            answer.put("intent", "GREETING");
            answer.put("summary", "已识别为问候");
            answer.put("narrative", agentGreeting(principal));
            answer.put("narrativeProvenance", "DERIVED");
            answer.put("adapter", "rules-fast-path");
            fastPath = true;
        } else if (isContextualFollowUp(message) && !recentHistory.isEmpty()) {
            // Resolve short follow-ups from this conversation before the
            // low-information guard, so "为什么/继续/怎么办" can refer to
            // the immediately preceding answer without reading other chats.
            Map<String, Object> status = Map.of("plotId", plotId, "latest", latestMetrics(plotId), "device", deviceForPlot(plotId));
            tools.add(tool("get_plot_status", Map.of("plotId", plotId), status));
            answer.put("intent", "FOLLOW_UP");
            answer.put("relatedIntent", priorIntent.isBlank() ? "PLOT_STATUS" : priorIntent);
            answer.put("summary", "已结合上一轮对话继续说明");
            answer.put("result", status);
        } else if (isAmbiguousShortInput(message)) {
            answer.put("intent", "CLARIFICATION");
            answer.put("summary", "输入信息不足");
            answer.put("narrative", lowInformationNarrative(principal, message));
            // There is no data question in this turn. Hiding retrieved plot
            // evidence keeps the clarification card from looking like a status
            // report and avoids implying that telemetry informed the reply.
            answer.put("knowledgeEvidence", List.of());
            answer.put("narrativeProvenance", "DERIVED");
            answer.put("adapter", "rules-fast-path");
            fastPath = true;
        } else if (isCapabilityQuestion(message)) {
            answer.put("intent", "CAPABILITY_QUERY");
            answer.put("summary", "已读取农智助手能力范围");
            answer.put("result", Map.of(
                    "capabilities", roleProfile.get("capabilities"),
                    "factsBoundary", "实时事实来自规则、数据库和检索知识；控制命令必须经过安全门和人工确认",
                    "scope", roleProfile.get("scopeLabel"),
                    "unsupported", roleProfile.get("restrictions")));
            // Capability questions are a stable contract, not a generative task.
            // Answering them locally avoids a needless 27B round trip and keeps
            // the product boundary concise even when an LLM is enabled.
            answer.put("narrative", agentCapabilityNarrative(principal, roleProfile));
            answer.put("narrativeProvenance", "DERIVED");
            answer.put("adapter", "rules-fast-path");
            fastPath = true;
        } else if (principal.isSystemAdmin() && isPlatformStatusQuestion(message)) {
            boolean mqttCommandAvailable = mqttCommands.available();
            Map<String, Object> status = dependencyStatus(mqttCommandAvailable);
            // The Agent has access to the command gateway state, not the
            // long-lived telemetry subscriber owned by the controller. Do not
            // mislabel an idle command gateway as a confirmed broker outage.
            if (!mqttCommandAvailable) status.put("mqtt", "UNKNOWN");
            tools.add(tool("get_platform_status", Map.of("scope", "PLATFORM"), status));
            answer.put("knowledgeEvidence", List.of());
            answer.put("intent", "PLATFORM_STATUS");
            answer.put("summary", "已读取平台服务与数据链路状态");
            answer.put("result", status);
        } else if (principal.isSystemAdmin() && isRuleStrategyStatusQuestion(message)) {
            List<Map<String, Object>> packs = cropPacks();
            List<Map<String, Object>> farmPacks = store.list("farm-crop-pack");
            List<Map<String, Object>> candidates = governance.strategyCandidates(null, null, principal);
            long ruleCount = Stream.concat(packs.stream(), farmPacks.stream())
                    .mapToLong(pack -> Jsons.maps(mapper, pack.get("rules")).size()).sum();
            long activeStrategies = candidates.stream().filter(candidate -> "ACTIVE".equalsIgnoreCase(Jsons.text(candidate, "status", ""))).count();
            Map<String, Object> status = new LinkedHashMap<>();
            status.put("cropPackCount", packs.size() + farmPacks.size());
            status.put("ruleCount", ruleCount);
            status.put("strategyCandidateCount", candidates.size());
            status.put("activeStrategyCount", activeStrategies);
            status.put("latestCandidates", candidates.stream().limit(5).map(this::publicProjection).toList());
            tools.add(tool("get_rule_strategy_status", Map.of("scope", "PLATFORM"), status));
            answer.put("knowledgeEvidence", List.of());
            answer.put("intent", "RULE_STRATEGY_STATUS");
            answer.put("summary", "已读取规则集、作物包与策略候选状态");
            answer.put("result", status);
        } else if (principal.isSystemAdmin() && isPlatformOverviewQuestion(message)) {
            Map<String, Object> platform = overview(null, principal);
            tools.add(tool("get_platform_risk_overview", Map.of("scope", "PLATFORM"), platform));
            answer.put("knowledgeEvidence", List.of());
            answer.put("intent", "PLATFORM_OVERVIEW");
            answer.put("summary", "已汇总全平台地块风险与待处理事项");
            answer.put("result", platform);
        } else if (principal.isFarmAdmin() && isFarmOverviewQuestion(message)) {
            String farmId = farmIdForPlot(plotId);
            Map<String, Object> farm = overview(farmId, principal);
            tools.add(tool("get_farm_overview", Map.of("farmId", farmId), farm));
            answer.put("knowledgeEvidence", List.of());
            answer.put("intent", "FARM_OVERVIEW");
            answer.put("summary", "已汇总当前农场风险与待处理事项");
            answer.put("result", farm);
        } else if (isRetestChecklistQuestion(message)) {
            Map<String, Object> status = Map.of("plotId", plotId, "latest", latestMetrics(plotId), "device", deviceForPlot(plotId));
            tools.add(tool("get_plot_status", Map.of("plotId", plotId), status));
            answer.put("intent", "RETEST_CHECKLIST");
            answer.put("summary", "已按当前异常项整理复测清单");
            answer.put("result", status);
        } else if (containsAny(message, "蓄水池", "水量余额", "配额", "用水计划", "water resource")) {
            Map<String, Object> water = waterResourceProfile(farmIdForPlot(plotId), null, principal);
            tools.add(tool("get_water_resource_status", Map.of("farmId", farmIdForPlot(plotId)), water));
            answer.put("intent", "WATER_RESOURCE_STATUS"); answer.put("summary", "已读取当前农场水资源余额与计划状态"); answer.put("result", water);
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
                    ? "已生成可执行灌溉处方"
                    : "已生成保守参考，建议人工复核");
            answer.put("plan", plan);
        } else if (isDiagnosisQuestion(message)) {
            Map<String, Object> diagnosis = diagnose(plotId, Map.of("scenarioId", "normal", "traceId", traceId));
            tools.add(tool("evaluate_diagnosis", Map.of("plotId", plotId), diagnosis));
            answer.put("intent", "DIAGNOSIS");
            answer.put("summary", "已完成缺水与传感器风险分析");
            answer.put("diagnosis", diagnosis);
            answer.put("result", Map.of("diagnosis", diagnosis, "latest", latestMetrics(plotId), "device", deviceForPlot(plotId)));
        } else if (message.contains("任务") || message.contains("农务") || message.contains("待办")) {
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
        if (agentImages.isEmpty()) answer.put("confidence", .86);
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
                rawNarrative = callOpenAiCompatibleWithFallback(message, narrativeContext(answer, plotId), recentHistory, agentImages);
                String narrative = agentImages.isEmpty()
                        ? sanitizeNarrative(rawNarrative)
                        : sanitizeVisionNarrative(rawNarrative);
                narrative = applySafetyGuidance(message, answer, narrative);
                if (narrative.isBlank()) narrative = Jsons.text(answer, "summary", "已完成规则评估");
                long latencyMs = Duration.ofNanos(System.nanoTime() - started).toMillis();
                answer.put("narrative", narrative);
                answer.put("narrativeProvenance", "DERIVED");
                answer.put("llm", Map.of("provider", "openai-compatible",
                        "model", agentImages.isEmpty() ? configuredLlmModel() : configuredVisionModel(),
                        "latencyMs", latencyMs,
                        "multimodal", !agentImages.isEmpty()));
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
        saveAgentTurn(principal, conversationId, plotId, displayMessage, answer);
        store.logEvent("agent.run", answer);
        events.publish("agent.run.completed", answer);
        return answer;
    }

    private boolean isLegacyBrowserVisionPrompt(String message) {
        if (message == null || message.isBlank()) return false;
        return message.contains("图片已由浏览器端视觉模型真实读取像素")
                || message.contains("候选物体：")
                || message.contains("候选结果不确定时必须明说并请用户补拍");
    }

    private List<Map<String, Object>> normalizeAgentImages(Object rawImages) {
        if (rawImages == null) return List.of();
        if (!(rawImages instanceof Collection<?> collection)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_IMAGES_INVALID", "图片参数格式无效");
        }
        if (collection.size() > AGENT_IMAGE_MAX_COUNT) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_IMAGE_LIMIT_EXCEEDED", "单次最多分析 4 张图片");
        }
        List<Map<String, Object>> normalized = new ArrayList<>();
        int totalBytes = 0;
        int index = 0;
        for (Object value : collection) {
            index++;
            Map<String, Object> image = Jsons.map(mapper, value);
            String dataUrl = Jsons.text(image, "dataUrl", "").trim();
            Matcher matcher = AGENT_IMAGE_DATA_URL.matcher(dataUrl);
            if (!matcher.matches()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_IMAGE_FORMAT_UNSUPPORTED",
                        "第 " + index + " 张图片不是有效的 JPG、PNG 或 WebP 数据");
            }
            String mimeType = matcher.group(1).toLowerCase(Locale.ROOT);
            if (!AGENT_IMAGE_TYPES.contains(mimeType)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_IMAGE_FORMAT_UNSUPPORTED", "不支持该图片格式");
            }
            String encoded = matcher.group(2);
            if (encoded.length() > ((AGENT_IMAGE_MAX_BYTES + 2) / 3) * 4 + 8) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_IMAGE_TOO_LARGE", "单张原图不能超过 8MB");
            }
            byte[] decoded;
            try {
                decoded = Base64.getDecoder().decode(encoded);
            } catch (IllegalArgumentException error) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_IMAGE_BASE64_INVALID", "图片数据损坏，请重新选择");
            }
            if (decoded.length == 0 || decoded.length > AGENT_IMAGE_MAX_BYTES) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_IMAGE_TOO_LARGE", "单张原图不能超过 8MB");
            }
            totalBytes += decoded.length;
            if (totalBytes > AGENT_IMAGE_MAX_TOTAL_BYTES) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_IMAGE_TOTAL_TOO_LARGE", "单次原图总量不能超过 24MB");
            }
            String name = Jsons.text(image, "name", "图片" + index)
                    .replaceAll("[\\r\\n\\p{Cntrl}]+", " ").trim();
            if (name.isBlank()) name = "图片" + index;
            if (name.length() > 100) name = name.substring(0, 100);
            int width = (int) Math.max(0, Math.min(10000, Jsons.whole(image, "width", 0)));
            int height = (int) Math.max(0, Math.min(10000, Jsons.whole(image, "height", 0)));
            Map<String, Object> accepted = new LinkedHashMap<>();
            accepted.put("name", name);
            accepted.put("mimeType", mimeType);
            accepted.put("width", width);
            accepted.put("height", height);
            accepted.put("byteSize", decoded.length);
            accepted.put("quality", Jsons.text(image, "quality", "UNKNOWN"));
            accepted.put("dataUrl", dataUrl);
            normalized.add(accepted);
        }
        return normalized;
    }

    private List<Map<String, Object>> agentImageMetadata(List<Map<String, Object>> images) {
        return images.stream().map(image -> Map.<String, Object>of(
                "name", Jsons.text(image, "name", "图片"),
                "mimeType", Jsons.text(image, "mimeType", "image/jpeg"),
                "width", Jsons.whole(image, "width", 0),
                "height", Jsons.whole(image, "height", 0),
                "byteSize", Jsons.whole(image, "byteSize", 0),
                "quality", Jsons.text(image, "quality", "UNKNOWN"))).toList();
    }

    /**
     * Prefer a short private-reasoning pass when enabled, then retry without
     * thinking if the model is slow or the compatible server rejects the
     * thinking parameters. The user should never wait for a second long pass.
     */
    private String callOpenAiCompatibleWithFallback(String userMessage, Map<String, Object> deterministicContext,
                                                    List<Map<String, Object>> recentHistory,
                                                    List<Map<String, Object>> imageInputs) throws IOException {
        if (!properties.isLlmEnableThinking()) {
            return callOpenAiCompatible(userMessage, deterministicContext, recentHistory, imageInputs,
                    false, Math.min(Math.max(1000L, properties.getLlmTimeoutMs()), AGENT_PLAIN_TIMEOUT_MS));
        }
        IOException thinkingFailure;
        try {
            long configuredTimeout = Math.max(1000L, properties.getLlmTimeoutMs());
            long thinkingTimeout = Math.min(configuredTimeout, AGENT_THINKING_TIMEOUT_MS);
            return callOpenAiCompatible(userMessage, deterministicContext, recentHistory, imageInputs,
                    true, thinkingTimeout);
        } catch (IOException ex) {
            thinkingFailure = ex;
        }
        try {
            return callOpenAiCompatible(userMessage, deterministicContext, recentHistory, imageInputs,
                    false, Math.min(Math.max(1000L, properties.getLlmTimeoutMs()), AGENT_PLAIN_TIMEOUT_MS));
        } catch (IOException plainFailure) {
            plainFailure.addSuppressed(thinkingFailure);
            throw plainFailure;
        }
    }

    private String callOpenAiCompatible(String userMessage, Map<String, Object> deterministicContext,
                                        List<Map<String, Object>> recentHistory,
                                        List<Map<String, Object>> imageInputs) throws IOException {
        return callOpenAiCompatible(userMessage, deterministicContext, recentHistory, imageInputs,
                properties.isLlmEnableThinking(), Math.min(Math.max(1000L, properties.getLlmTimeoutMs()), AGENT_PLAIN_TIMEOUT_MS));
    }

    private String callOpenAiCompatible(String userMessage, Map<String, Object> deterministicContext,
                                        List<Map<String, Object>> recentHistory,
                                        List<Map<String, Object>> imageInputs,
                                        boolean enableThinking, long timeoutMs) throws IOException {
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
        boolean hasImages = imageInputs != null && !imageInputs.isEmpty();
        String imageNotice = hasImages
                ? "\n\n本轮附有 " + imageInputs.size() + " 张用户现场图片。请直接观察图片像素；图片是 USER_PROVIDED 证据，与下列平台事实分开判断。"
                : "";
        String userContent = "当前问题：" + prompt + imageNotice
                + "\n\n当前公开事实（优先级高于历史对话，只可解释，不可改写；不要逐字复述字段名或内部元数据）：\n" + context;
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("model", hasImages ? configuredVisionModel() : configuredLlmModel());
        Map<String, Object> profile = Jsons.map(mapper, deterministicContext.get("roleProfile"));
        String roleLabel = Jsons.text(deterministicContext, "roleLabel", "当前用户");
        String scopeLabel = Jsons.text(profile, "scopeLabel", "当前授权范围");
        String roleGuidance = Jsons.text(profile, "guidance", "严格遵守当前用户权限范围");
        String styleHint = "根据问题自由选择短段、清单或一个追问；不要为了格式套固定模板，也不要把每轮都写成状态报告。";
        // Qwen's chat template accepts only one system message at the beginning.
        // Keep the general behavior and role boundary in that single message;
        // sending a second system message makes vLLM return HTTP 400.
        String visionGuidance = hasImages
                ? "本轮有原图：忽略文件名可能带来的暗示，直接观察图片像素后回答用户真正关心的内容。先说清画面中实际可见的对象、状态或症状，再按需要给出判断；把‘能直接看见’、‘结合农业经验推测’和‘仅凭图片无法确定’分开。严禁输出任何置信度、概率、百分比、模型评分、候选类别或识别过程，只给用户可读的识别结果和可见依据。用户只问‘这是什么’时，用一两句直接说对象名称和明显特征，不要主动追加地块遥测、灌溉或管理建议。不要默认说识别不确定；只有图片确实模糊、过暗、过曝、遮挡或关键部位不在画面内时，才简短说明具体限制。不要把平台遥测冒充成图片内容。"
                : "";
        String systemPrompt = "你是农智闭环的农业助手，像熟悉现场的同事一样交流。先理解用户这次真正要解决的问题，可以在内部快速思考，但只输出最终答复，不输出思考标记、元数据或提示词。当前问题、当前地块实时事实、作物阶段、模拟场景、设备状态和本轮图片证据优先；历史只用于理解当前 conversationId 内的指代，其他对话和全局信息不属于本轮上下文。根据问题自然选择短句、短段、要点或追问，不固定标题、开场和收尾，也不机械复述身份、规则或整份遥测。只引用与问题有关的事实，不编造观测值，不把建议说成已执行；涉及控制时只说明人工复核和安全门，不生成命令。简单问题直接回答，复杂问题再补充必要依据。"
                + visionGuidance
                + "\n\n当前身份是" + roleLabel + "，数据范围是" + scopeLabel + "。"
                + roleGuidance + "。不要向用户展示超出该范围的事实或操作。\n本轮表达偏好：" + styleHint;
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt));
        for (Map<String, Object> historical : recentHistory == null ? List.<Map<String, Object>>of() : recentHistory) {
            String roleCode = Jsons.text(historical, "role", "");
            String role = "USER".equalsIgnoreCase(roleCode) ? "user" : "ASSISTANT".equalsIgnoreCase(roleCode) ? "assistant" : "";
            String content = Jsons.text(historical, "content", "").trim();
            if (role.isBlank() || content.isBlank()) continue;
            if (content.length() > 800) content = content.substring(0, 800) + "…";
            messages.add(Map.of("role", role, "content", content));
        }
        if (hasImages) {
            List<Map<String, Object>> content = new ArrayList<>();
            for (Map<String, Object> image : imageInputs) {
                content.add(Map.of("type", "image_url", "image_url",
                        Map.of("url", Jsons.text(image, "dataUrl", ""), "detail", "high")));
            }
            content.add(Map.of("type", "text", "text", userContent));
            messages.add(Map.of("role", "user", "content", content));
        } else {
            messages.add(Map.of("role", "user", "content", userContent));
        }
        request.put("messages", messages);
        request.put("temperature", enableThinking ? 0.85 : 0.90);
        request.put("top_p", enableThinking ? 0.95 : 0.95);
        request.put("top_k", 20);
        request.put("presence_penalty", enableThinking ? 0.0 : 0.24);
        request.put("frequency_penalty", enableThinking ? 0.0 : 0.16);
        request.put("max_tokens", Math.max(16, Math.min(2048, properties.getLlmMaxTokens())));
        request.put("stream", false);
        Map<String, Object> chatTemplate = new LinkedHashMap<>();
        chatTemplate.put("enable_thinking", enableThinking);
        chatTemplate.put("preserve_thinking", enableThinking && properties.isLlmPreserveThinking());
        request.put("chat_template_kwargs", chatTemplate);
        if (enableThinking && properties.getLlmReasoningEffort() != null && !properties.getLlmReasoningEffort().isBlank()) {
            request.put("reasoning_effort", properties.getLlmReasoningEffort().trim());
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(Math.max(1000L, timeoutMs)))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .header(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(Jsons.json(mapper, request), StandardCharsets.UTF_8));
        if (properties.getLlmApiKey() != null && !properties.getLlmApiKey().isBlank()) {
            builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getLlmApiKey().trim());
        }
        HttpResponse<String> response;
        try {
            response = llmHttpClient().send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
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

    private String configuredVisionModel() {
        return properties.getLlmVisionModel() == null || properties.getLlmVisionModel().isBlank()
                ? configuredLlmModel() : properties.getLlmVisionModel().trim();
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
        return Set.of("hi", "hello", "hey", "嗨", "你好", "您好", "早上好", "下午好", "晚上好", "在吗", "在么").contains(normalized)
                || normalized.matches("(?:你好|您好|嗨|早上好|下午好|晚上好)(?:呀|啊|喽)+")
                || normalized.matches("(?:hi|hello|hey)(?:there|呀|啊)+");
    }

    private boolean isAmbiguousShortInput(String message) {
        if (message == null) return true;
        String normalized = message.trim();
        if (normalized.isBlank()) return true;
        String compact = normalized.replaceAll("[\\s，。！？,.!?、:：;；]+", "");
        // Natural status questions such as “目前情况怎么样” contain no metric
        // keyword, but they are still a clear request for the selected plot.
        if (isGeneralPlotStatusQuestion(compact)) return false;
        if (compact.isBlank() || isNumberOrIdentifierInput(compact) || isSocialSmallTalk(compact)) return true;

        // A topic word on its own is not enough to justify reading live telemetry.
        // Require either a direct metric/operation or a question about the topic.
        boolean hasTopic = containsAny(compact,
                "地块", "田", "棚", "温室", "大棚", "裸地", "土壤", "湿度", "温度", "降雨", "下雨", "天气", "光照",
                "二氧化碳", "co2", "作物", "番茄", "西红柿", "黄瓜", "辣椒", "草莓", "农场", "灌溉", "浇水", "补水",
                "风险", "告警", "报警", "设备", "传感器", "任务", "农务", "待办", "播种", "采收", "病", "虫", "叶", "苗",
                "预测", "规则", "策略", "系统", "平台", "服务", "数据", "巡田", "复测", "审计", "在线", "离线", "状态",
                "指标", "分析", "诊断", "根因", "建议", "计划", "阈值", "配置", "控制", "水量", "蓄水", "配额", "成员",
                "用户", "权限", "模型", "生长", "长势", "营养", "施肥", "ph", "氮", "磷", "钾", "plot", "soil", "moisture",
                "temperature", "humidity", "rain", "weather", "light", "crop", "farm", "greenhouse", "irrigation", "watering",
                "risk", "alert", "device", "sensor", "task", "forecast", "diagnosis", "status", "offline", "online", "data",
                "rule", "strategy", "platform", "service", "audit");
        if (!hasTopic) return true;
        boolean hasDirectIntent = containsAny(compact,
                "查看", "查询", "查一下", "告诉我", "多少", "几", "哪块", "哪个", "哪里", "现在", "当前", "今天", "明天",
                "未来", "怎么", "如何", "为什么", "是否", "能否", "吗", "怎么样", "如何", "异常", "需要", "应该", "可以吗",
                "开", "关", "执行", "启动", "开始", "提交", "记录", "申请", "创建", "新增", "修改", "更新", "绑定", "解除",
                "复测", "清单", "巡田", "show", "view", "check", "what", "how", "why", "is", "can", "please", "analyze", "explain");
        boolean directMetric = containsAny(compact,
                "湿度", "温度", "降雨", "下雨", "天气", "光照", "风险", "告警", "报警", "设备", "传感器", "任务", "农务", "待办",
                "灌溉", "浇水", "补水", "预测", "规则", "策略", "系统", "平台", "服务", "数据", "状态", "指标", "诊断", "在线", "离线",
                "水量", "蓄水", "配额", "审计", "生长", "长势", "营养", "施肥", "病", "虫", "叶", "苗", "花", "果",
                "发黄", "变黄", "萎蔫", "枯萎", "开裂", "积水", "过湿", "干旱", "干燥", "症状", "表现", "图片", "照片", "识别",
                "soil", "moisture", "temperature", "humidity", "rain", "weather", "light", "irrigation", "watering", "risk", "alert",
                "device", "sensor", "task", "forecast", "diagnosis", "status", "offline", "online", "data", "rule", "strategy", "platform", "service", "audit");
        return !directMetric && !hasDirectIntent;
    }

    private boolean isNumberOrIdentifierInput(String value) {
        if (value == null || value.isBlank()) return false;
        return value.matches("[0-9０-９一二三四五六七八九十]+")
                || value.matches("[0-9０-９]+(?:[-_/][0-9０-９]+)+")
                || value.matches("[a-zA-Z]{1,24}(?:[-_/][a-zA-Z0-9]{1,24})*[0-9]+")
                || value.matches("[0-9０-９]{4,}");
    }

    private boolean isSocialSmallTalk(String value) {
        if (value == null || value.isBlank()) return false;
        String normalized = value.toLowerCase(Locale.ROOT);
        return Set.of("谢谢", "感谢", "多谢", "好的", "好吧", "行", "嗯", "哦", "哈哈", "呵呵", "收到", "明白", "知道了",
                        "辛苦了", "再见", "拜拜", "你好吗", "你还好吗", "在吗", "在么", "hello", "hi", "hey")
                .contains(normalized);
    }

    private String lowInformationNarrative(UserPrincipal principal, String message) {
        String compact = message == null ? "" : message.trim().replaceAll("[\\s，。！？,.!?、:：;；]+", "");
        if (isNumberOrIdentifierInput(compact)) {
            return "看起来像一串编号。你想查哪块地、哪台设备，还是哪条记录？";
        }
        if (isSocialSmallTalk(compact)) {
            if (principal != null && principal.isSystemAdmin()) return "我在。想看平台服务、数据链路、规则版本，还是审计记录？";
            if (principal != null && principal.isFarmAdmin()) return "我在。你想看农场告警、任务、设备，还是灌溉安排？";
            return "我在。告诉我地块和想做的事，我可以帮你看状态、风险、待办或补水建议。";
        }
        if (principal != null && principal.isSystemAdmin()) {
            return "我还没听出具体要查什么。可以直接说平台服务、数据链路、规则版本或审计内容。";
        }
        if (principal != null && principal.isFarmAdmin()) {
            return "我还没听出具体要查什么。可以直接说农场、地块、告警、任务、设备或灌溉安排。";
        }
        return "我还没听出具体要查什么。可以告诉我地块和想做的事，例如查看湿度、风险、待办或补水建议。";
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

    private boolean isGeneralPlotStatusQuestion(String message) {
        if (message == null || message.isBlank()) return false;
        String normalized = message.toLowerCase(Locale.ROOT).replaceAll("[\\s，。！？,.!?、:：;；]+", "");
        if (normalized.isBlank()) return false;
        if (Set.of("目前情况", "现在情况", "当前情况", "目前怎么样", "现在怎么样", "当前怎么样", "情况怎么样", "状态怎么样", "现在状态", "当前状态").contains(normalized)) {
            return true;
        }
        return normalized.matches(".*(?:目前|现在|当前|此刻|最近|这块地|该地块).*(?:情况|状态|怎么样|如何|正常|变化).*");
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
                || normalized.contains("根因") || normalized.contains("异常") || normalized.contains("风险") || normalized.contains("sensor drift")
                || normalized.contains("drought risk") || normalized.contains("risk analysis");
    }

    private boolean isPlatformStatusQuestion(String message) {
        return containsAny(message, "系统资源", "平台状态", "系统状态", "服务状态", "服务健康", "数据链路", "platform status", "service health");
    }

    private boolean isRuleStrategyStatusQuestion(String message) {
        return containsAny(message, "规则变更", "规则状态", "规则版本", "策略状态", "策略版本", "策略候选", "rule version", "strategy status");
    }

    private boolean isPlatformOverviewQuestion(String message) {
        return containsAny(message, "所有地块", "全局地块", "全平台风险", "跨农场风险", "平台风险概览", "platform risk");
    }

    private boolean isFarmOverviewQuestion(String message) {
        return containsAny(message, "农场风险概览", "全场风险", "农场概览", "全场概览", "农场现在最需要", "farm overview");
    }

    /**
     * Applies the same hard safety boundary after model generation.  The model
     * may explain a deterministic result, but it can never turn stale/unsafe
     * evidence into an executable prescription or emit a control payload.
     */
    @SuppressWarnings("unchecked")
    String safetyNarrativeOverride(String message, Map<String, Object> answer) {
        if (isDirectControlRequest(message)) {
            return "我不能在对话中直接发送或生成控制命令。请使用受控执行接口，并先完成权限、安全门、当前操作人确认和幂等键校验。";
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
        String role = agentRoleCode(answer);
        if ("RETEST_CHECKLIST".equals(intent)) return retestChecklistNarrative(answer, role);
        if ("IMAGE_ANALYSIS".equals(intent)) {
            return "图片已经收到，但视觉模型这次没有完成分析。图片不会被当成遥测数据猜测；请稍后重试，或先补充你想确认的作物、部位和异常表现。";
        }
        if ("PLATFORM_STATUS".equals(intent)) {
            Map<String, Object> result = Jsons.map(mapper, answer.get("result"));
            return "平台服务状态：数据库" + dependencyStateLabel(result.get("database"))
                    + "、Redis " + dependencyStateLabel(result.get("redis"))
                    + "、MQTT " + dependencyStateLabel(result.get("mqtt"))
                    + "；当前智能模型模式为“" + Jsons.text(result, "ai", "未配置")
                    + "”。建议优先排查处于降级状态的依赖，再核对消费积压与事件时间。";
        }
        if ("RULE_STRATEGY_STATUS".equals(intent)) {
            Map<String, Object> result = Jsons.map(mapper, answer.get("result"));
            return String.format(Locale.ROOT,
                    "平台当前登记 %d 个作物包、%d 条规则和 %d 个策略候选，其中 %d 个策略已启用。策略候选只在通过离线验证并人工启用后参与处置预览，不会绕过诊断、安全门或确认。",
                    Jsons.whole(result, "cropPackCount", 0), Jsons.whole(result, "ruleCount", 0),
                    Jsons.whole(result, "strategyCandidateCount", 0), Jsons.whole(result, "activeStrategyCount", 0));
        }
        if ("PLATFORM_OVERVIEW".equals(intent) || "FARM_OVERVIEW".equals(intent)) {
            Map<String, Object> result = Jsons.map(mapper, answer.get("result"));
            List<Map<String, Object>> plots = Jsons.maps(mapper, result.get("plots"));
            long elevated = plots.stream().filter(plot -> Set.of("HIGH", "CRITICAL", "WARNING").contains(Jsons.text(plot, "riskLevel", "").toUpperCase(Locale.ROOT))).count();
            String scope = "PLATFORM_OVERVIEW".equals(intent) ? "全平台" : "当前农场";
            String handoff = "PLATFORM_OVERVIEW".equals(intent)
                    ? "系统管理员可继续核对数据链路、设备在线率和规则版本，农场业务处置仍由对应农场完成。"
                    : "建议先处理高风险地块和进行中告警，再结合人员与水资源安排任务。";
            return String.format(Locale.ROOT, "%s共 %d 个在用地块，其中 %d 个需要关注；进行中告警 %d 条、待处理任务 %d 项。%s",
                    scope, plots.size(), elevated, Jsons.whole(result, "activeAlertCount", 0),
                    Jsons.whole(result, "pendingWorkOrderCount", 0), handoff);
        }
        if ("IRRIGATION_RECOMMENDATION".equals(intent)) {
            Map<String, Object> plan = Jsons.map(mapper, answer.get("plan"));
            double water = Jsons.number(plan, "waterLitre", 0);
            long duration = Jsons.whole(plan, "durationSeconds", 0);
            if (Jsons.bool(plan, "executable", false)) {
                if ("SYSTEM_ADMIN".equals(role)) {
                    return String.format(Locale.ROOT, "平台已为该地块算出一版约 %.1f L、持续 %d 秒的灌溉试算。请核对数据新鲜度、规则版本和安全门；系统管理员不会直接修改农场业务或下发灌溉。", water, duration);
                }
                if ("FARM_ADMIN".equals(role)) {
                    return String.format(Locale.ROOT, "当前农场可为该地块编排约 %.1f L、持续 %d 秒的灌溉计划。请复核水资源、设备状态和作业窗口，确认后才会下发。", water, duration);
                }
                return String.format(Locale.ROOT, "你负责的地块可准备约 %.1f L、持续 %d 秒的补水方案。先核对现场和阀门状态，页面确认后才会执行，不会由对话直接启动设备。", water, duration);
            }
            String guidance = safetyNarrativeOverride(message, answer);
            if (guidance != null) return guidance;
            if ("SYSTEM_ADMIN".equals(role)) return "当前证据或安全门未通过，平台只保留只读试算；请先检查遥测新鲜度、设备心跳和规则配置。";
            if ("FARM_ADMIN".equals(role)) return "当前证据或安全门未通过，先复核该地块的设备、水资源和现场任务，再决定是否安排灌溉。";
            return "当前证据或安全门未通过，先完成现场观察或复测，暂不生成可执行灌溉动作。";
        }
        if ("DIAGNOSIS".equals(intent) || "RISK_DIAGNOSIS".equals(intent)) {
            Map<String, Object> diagnosis = Jsons.map(mapper, answer.get("diagnosis"));
            String cause = diagnosisCauseLabel(Jsons.text(diagnosis, "primaryCause", "EVIDENCE_INSUFFICIENT"));
            if ("SYSTEM_ADMIN".equals(role)) {
                return "平台证据目前更支持该地块存在" + cause + "。请从遥测质量、设备心跳和规则版本核对证据，再判断是否需要转给农场处理。";
            }
            if ("FARM_ADMIN".equals(role)) {
                return "该农场地块目前更像是" + cause + "，请查看支持和反向证据，并安排现场核查或设备检查后再分派处置任务。";
            }
            return "你负责的地块目前更像是" + cause + "，先看支持和反向证据，按复测清单核对现场，再决定是否处理。";
        }
        if ("TODAY_WORK".equals(intent)) {
            List<Map<String, Object>> work = Jsons.maps(mapper, answer.get("workItems"));
            if (work.isEmpty()) {
                if ("SYSTEM_ADMIN".equals(role)) return "当前没有需要平台侧审计的高优先级工单；可以继续查看服务健康、数据链路和规则变更。";
                if ("FARM_ADMIN".equals(role)) return "当前农场没有新的高优先级待办；可以继续检查告警、资源安排和待验收任务。";
                return "今天暂时没有分配给你的高优先级农务，可以按计划巡查负责地块。";
            }
            if ("SYSTEM_ADMIN".equals(role)) return "平台侧汇总到 " + work.size() + " 项相关工单记录，建议先看逾期、失败和待审计项，再核对数据链路。";
            if ("FARM_ADMIN".equals(role)) return "当前农场共汇总到 " + work.size() + " 项待办，建议先处理高风险告警，再安排派单和待验收任务。";
            return "你今天有 " + work.size() + " 项相关农务，建议先处理有时限的巡田和高风险地块，再提交执行结果。";
        }
        if ("RISK_FORECAST".equals(intent)) {
            Map<String, Object> result = Jsons.map(mapper, answer.get("result"));
            String status = Jsons.text(result, "status", "AVAILABLE");
            if ("UNAVAILABLE".equalsIgnoreCase(status)) {
                if ("SYSTEM_ADMIN".equals(role)) return "当前样本不足以形成可靠预测。请检查遥测覆盖、时间戳和设备在线率，补齐窗口后再计算 1、2、4 小时风险。";
                if ("FARM_ADMIN".equals(role)) return "当前样本不足以形成可靠预测。请先补齐该地块的遥测或安排复测，再决定是否调整农务计划。";
                return "当前样本还不足以形成可靠预测。先补一组现场或传感器数据，补齐后再计算 1、2、4 小时风险。";
            }
            if ("SYSTEM_ADMIN".equals(role)) return "平台已算出短期水分趋势。请重点核对预测窗口、数据覆盖和算法版本；新遥测进入后结果会更新。";
            if ("FARM_ADMIN".equals(role)) return "该地块的短期水分趋势已经算出。请结合全场资源和作业窗口安排处置，重点看预计越界时间与区间范围。";
            return "你负责地块的短期水分趋势已经算出。重点看预计越界时间和区间范围，现场新数据进入后预测会随之更新。";
        }
        if ("FOLLOW_UP".equals(intent)) {
            if ("SYSTEM_ADMIN".equals(role)) return "可以，我接着上一轮说明：当前数据是此刻的模拟观测，请先核对事件时间、设备心跳和规则版本，再判断是否需要转交农场处理。";
            if ("FARM_ADMIN".equals(role)) return "可以，我接着上一轮说明：先确认异常是否持续，再结合设备、资源和现场结果安排或调整农务任务。";
            return "可以，我接着上一轮说明：先确认异常项是否持续，再根据现场复测决定是报修设备还是调整农事。";
        }

        Map<String, Object> result = Jsons.map(mapper, answer.get("result"));
        Map<String, Object> device = Jsons.map(mapper, result.get("device"));
        Map<String, Object> latest = Jsons.map(mapper, result.get("latest"));
        Map<String, Object> soil = Jsons.map(mapper, latest.get("SOIL_MOISTURE"));
        String deviceStatus = Jsons.text(device, "status", "UNKNOWN");
        if (!soil.isEmpty()) {
            String quality = Jsons.text(Jsons.map(mapper, soil.get("quality")), "status", "GOOD");
            double moisture = Jsons.number(soil, "value", 0);
            if ("SYSTEM_ADMIN".equals(role)) {
                return String.format(Locale.ROOT, "平台记录该地块设备状态为 %s，最新土壤湿度约 %.1f%%（质量 %s）。这是平台侧只读事实；还可以继续查看数据链路、规则版本或审计记录。", deviceStatus, moisture, quality);
            }
            if ("FARM_ADMIN".equals(role)) {
                return String.format(Locale.ROOT, "当前农场记录该地块设备状态为 %s，最新土壤湿度约 %.1f%%（质量 %s）。可以继续查看告警、安排任务或核对灌溉计划。", deviceStatus, moisture, quality);
            }
            return String.format(Locale.ROOT, "你负责的地块设备状态为 %s，最新土壤湿度约 %.1f%%（质量 %s）。这是只读状态；需要处理时可以继续问风险、巡田或补水建议。", deviceStatus, moisture, quality);
        }
        if ("SYSTEM_ADMIN".equals(role)) return "平台暂未拿到该地块的完整遥测。可以先检查设备心跳、数据接入和规则状态。";
        if ("FARM_ADMIN".equals(role)) return "当前农场暂未拿到该地块的完整数据。可以先检查设备、告警和待办任务。";
        return "当前地块暂未拿到完整数据。可以先检查设备是否在线，或提交一次现场巡田记录。";
    }

    private String agentRoleCode(Map<String, Object> answer) {
        return RolePolicy.canonical(Jsons.text(answer, "role", "FARMER"));
    }

    private String dependencyStateLabel(Object value) {
        return switch (String.valueOf(value).toUpperCase(Locale.ROOT)) {
            case "UP", "ONLINE", "HEALTHY" -> "正常";
            case "DEGRADED", "FALLBACK_OR_IDLE" -> "降级或空闲";
            case "DOWN", "OFFLINE", "UNAVAILABLE" -> "不可用";
            default -> String.valueOf(value == null ? "未知" : value);
        };
    }

    private String retestChecklistNarrative(Map<String, Object> answer, String role) {
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
        String heading = "SYSTEM_ADMIN".equals(role)
                ? "平台排查建议（现场动作需由农场人员执行）："
                : "FARM_ADMIN".equals(role)
                ? "建议为该地块安排以下核查："
                : "可以，按这个顺序复测：";
        StringBuilder text = new StringBuilder(heading);
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
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> item : messages.subList(from, messages.size())) {
            Map<String, Object> copy = new LinkedHashMap<>(item);
            if ("USER".equalsIgnoreCase(Jsons.text(item, "role", ""))) {
                copy.put("content", cleanAgentHistoryUserMessage(Jsons.text(item, "content", "")));
            }
            result.add(copy);
        }
        return result;
    }

    /** Hide the private image prompt from conversation history and model context. */
    private String cleanAgentHistoryUserMessage(String value) {
        String raw = value == null ? "" : value.replace("\r", "")
                .replaceAll("[\\u200B\\u200C\\u200D\\uFEFF]", "").trim();
        if (raw.isBlank()) return "已上传现场图片";
        Matcher marker = AGENT_VISION_HISTORY_MARKER.matcher(raw);
        if (marker.find()) {
            String question = raw.substring(0, marker.start()).trim();
            return question.isBlank() ? "已上传现场图片" : question;
        }
        return raw;
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
        String persistedUserMessage = cleanAgentHistoryUserMessage(userMessage);
        Map<String, Object> userEntry = new LinkedHashMap<>();
        userEntry.put("messageId", Jsons.id("msg")); userEntry.put("conversationId", conversationId);
        userEntry.put("userId", principal.userId); userEntry.put("username", principal.username); userEntry.put("role", "USER");
        userEntry.put("content", persistedUserMessage.length() > 4000 ? persistedUserMessage.substring(0, 4000) + "…" : persistedUserMessage);
        userEntry.put("plotId", plotId); userEntry.put("traceId", traceId); userEntry.put("createdAt", now.toString());
        store.save("agent-message", Jsons.text(userEntry, "messageId", ""), userEntry);

        Map<String, Object> assistantEntry = new LinkedHashMap<>();
        assistantEntry.put("messageId", Jsons.id("msg")); assistantEntry.put("conversationId", conversationId);
        assistantEntry.put("userId", principal.userId); assistantEntry.put("role", "ASSISTANT");
        assistantEntry.put("content", Jsons.text(answer, "narrative", Jsons.text(answer, "summary", "")));
        assistantEntry.put("intent", Jsons.text(answer, "intent", "")); assistantEntry.put("plotId", plotId);
        assistantEntry.put("traceId", traceId); assistantEntry.put("adapter", Jsons.text(answer, "adapter", "rules"));
        assistantEntry.put("degraded", Jsons.bool(answer, "degraded", false));
        // Keep the role contract and the small deterministic result pieces with
        // the history record.  The chat can therefore render the same facts,
        // recommendations and scope after a reload instead of falling back to
        // a plain text-only message.
        assistantEntry.put("agentRole", answer.get("role"));
        assistantEntry.put("roleLabel", answer.get("roleLabel"));
        assistantEntry.put("roleProfile", publicProjection(answer.get("roleProfile")));
        for (String key : List.of("result", "plan", "diagnosis", "workItems", "context", "confidence", "readiness", "warnings", "scenarioLabel", "vision")) {
            if (answer.containsKey(key) && answer.get(key) != null) assistantEntry.put(key, publicProjection(answer.get(key)));
        }
        if (answer.containsKey("llm")) assistantEntry.put("llm", publicProjection(answer.get("llm")));
        if (answer.containsKey("actionProposal")) assistantEntry.put("actionProposal", publicProjection(answer.get("actionProposal")));
        assistantEntry.put("knowledgeEvidence", answer.get("knowledgeEvidence"));
        assistantEntry.put("createdAt", now.plusMillis(1).toString());
        store.save("agent-message", Jsons.text(assistantEntry, "messageId", ""), assistantEntry);

        Map<String, Object> conversation = store.find("agent-conversation", conversationId);
        if (conversation == null) {
            conversation = new LinkedHashMap<>(); conversation.put("conversationId", conversationId);
            conversation.put("userId", principal.userId); conversation.put("username", principal.username);
            String title = persistedUserMessage.replaceAll("\\s+", " ").trim();
            conversation.put("title", title.length() > 36 ? title.substring(0, 36) + "…" : title);
            conversation.put("createdAt", now.toString()); conversation.put("messageCount", 0); conversation.put("archived", false);
            conversation.put("pinned", false);
        }
        conversation.put("plotId", plotId); conversation.put("lastIntent", answer.get("intent"));
        conversation.put("agentRole", answer.get("role")); conversation.put("roleLabel", answer.get("roleLabel"));
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
            conversation.put("title", "我的农智对话"); conversation.put("messageCount", 0); conversation.put("archived", false); conversation.put("pinned", false);
        } else {
            // Existing conversations may have a title generated from the old
            // image prompt. Project the readable question on history reads.
            conversation = new LinkedHashMap<>(conversation);
            conversation.put("title", cleanAgentHistoryUserMessage(Jsons.text(conversation, "title", "")));
            conversation.putIfAbsent("pinned", false);
        }
        Map<String, Object> result = new LinkedHashMap<>(); result.put("conversation", conversation);
        result.put("messages", conversationMessages(principal, resolved, Math.max(1, Math.min(limit, 200))));
        return result;
    }

    List<Map<String, Object>> agentConversations(int limit, boolean archived, UserPrincipal principal) {
        return agentConversations(limit, archived, null, principal);
    }

    List<Map<String, Object>> agentConversations(int limit, boolean archived, String plotId, UserPrincipal principal) {
        String normalizedPlotId = plotId == null ? "" : plotId.trim();
        if (!normalizedPlotId.isBlank()) ensurePlotAccess(principal, normalizedPlotId);
        return store.list("agent-conversation").stream()
                .filter(item -> principal.userId.equals(Jsons.text(item, "userId", "")))
                .filter(item -> archived == Boolean.TRUE.equals(item.get("archived")))
                .filter(item -> normalizedPlotId.isBlank() || normalizedPlotId.equals(Jsons.text(item, "plotId", "")))
                .sorted(Comparator.comparing((Map<String, Object> item) -> Jsons.instant(item.get("updatedAt"), Instant.EPOCH)).reversed())
                .limit(Math.max(1, Math.min(limit, 50)))
                .map(item -> {
                    Map<String, Object> copy = new LinkedHashMap<>(item);
                    copy.put("title", cleanAgentHistoryUserMessage(Jsons.text(item, "title", "")));
                    copy.putIfAbsent("pinned", false);
                    return copy;
                }).toList();
    }

    Map<String, Object> archiveAgentConversation(String conversationId, boolean archived, UserPrincipal principal) {
        String resolved = resolveConversationId(Map.of("conversationId", conversationId == null ? "" : conversationId), principal);
        Map<String, Object> conversation = store.find("agent-conversation", resolved);
        if (conversation == null) throw new ApiException(HttpStatus.NOT_FOUND, "CONVERSATION_NOT_FOUND", "对话不存在");
        if (!principal.userId.equals(Jsons.text(conversation, "userId", "")))
            throw new ApiException(HttpStatus.FORBIDDEN, "CONVERSATION_FORBIDDEN", "无权归档该对话");
        conversation.put("archived", archived);
        conversation.put("updatedAt", Instant.now().toString());
        store.save("agent-conversation", resolved, conversation);
        return conversation;
    }

    void deleteAgentConversation(String conversationId, UserPrincipal principal) {
        String resolved = resolveConversationId(Map.of("conversationId", conversationId == null ? "" : conversationId), principal);
        Map<String, Object> conversation = store.find("agent-conversation", resolved);
        if (conversation == null) throw new ApiException(HttpStatus.NOT_FOUND, "CONVERSATION_NOT_FOUND", "对话不存在");
        if (!principal.userId.equals(Jsons.text(conversation, "userId", "")))
            throw new ApiException(HttpStatus.FORBIDDEN, "CONVERSATION_FORBIDDEN", "无权删除该对话");
        store.delete("agent-conversation", resolved);
        store.list("agent-message").stream()
                .filter(item -> resolved.equals(Jsons.text(item, "conversationId", "")))
                .forEach(item -> store.delete("agent-message", Jsons.text(item, "messageId", "")));
    }

    Map<String, Object> renameAgentConversation(String conversationId, String title, UserPrincipal principal) {
        return updateAgentConversation(conversationId, title, null, principal);
    }

    Map<String, Object> updateAgentConversation(String conversationId, String title, Boolean pinned, UserPrincipal principal) {
        String resolved = resolveConversationId(Map.of("conversationId", conversationId == null ? "" : conversationId), principal);
        Map<String, Object> conversation = store.find("agent-conversation", resolved);
        if (conversation == null) throw new ApiException(HttpStatus.NOT_FOUND, "CONVERSATION_NOT_FOUND", "对话不存在");
        if (!principal.userId.equals(Jsons.text(conversation, "userId", "")))
            throw new ApiException(HttpStatus.FORBIDDEN, "CONVERSATION_FORBIDDEN", "无权修改该对话");
        if (title != null) {
            String clean = title.replaceAll("\\s+", " ").trim();
            if (clean.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "CONVERSATION_TITLE_INVALID", "对话标题不能为空");
            conversation.put("title", clean.length() > 36 ? clean.substring(0, 36) + "…" : clean);
        }
        if (pinned != null) conversation.put("pinned", pinned);
        if (title == null && pinned == null)
            throw new ApiException(HttpStatus.BAD_REQUEST, "CONVERSATION_UPDATE_EMPTY", "没有可更新的对话字段");
        conversation.put("updatedAt", Instant.now().toString());
        store.save("agent-conversation", resolved, conversation);
        return conversation;
    }

    List<Map<String, Object>> agentTools(UserPrincipal principal) {
        List<Map<String, Object>> tools = new ArrayList<>();
        List.of("get_risk_forecast", "generate_irrigation_plan", "evaluate_diagnosis", "get_today_work_items", "get_plot_status", "get_water_resource_status")
                .forEach(name -> tools.add(Map.of("name", name, "schemaVersion", "tool-schema-1.0", "sideEffect", "READ_ONLY")));
        if (principal != null && principal.isFarmer()) {
            List.of("transition_assigned_work_order", "create_inspection_record", "create_evidence_request", "execute_virtual_irrigation")
                    .forEach(name -> tools.add(Map.of("name", name, "schemaVersion", "tool-schema-1.0", "sideEffect", "MUTATION_REQUIRES_CONFIRMATION")));
        } else if (principal != null && principal.isFarmAdmin()) {
            List.of("create_plot", "update_plot", "set_plot_devices", "create_and_assign_work_order", "publish_alert_verification", "close_alert")
                    .forEach(name -> tools.add(Map.of("name", name, "schemaVersion", "tool-schema-1.0", "sideEffect", "MUTATION_REQUIRES_CONFIRMATION")));
        }
        return tools;
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
        context.put("role", answer.get("role"));
        context.put("roleLabel", answer.get("roleLabel"));
        context.put("roleProfile", publicProjection(answer.get("roleProfile")));
        context.put("intent", answer.get("intent"));
        context.put("summary", answer.get("summary"));
        for (String key : List.of("result", "plan", "workItems")) {
            if (answer.containsKey(key)) context.put(key, publicProjection(answer.get(key)));
        }
        Map<String, Object> plot = store.find("plot", plotId);
        if (plot != null && !plot.isEmpty()) {
            Map<String, Object> currentPlot = new LinkedHashMap<>();
            for (String key : List.of("plotId", "name", "farmId", "cropCode", "cropName", "cropVariety",
                    "stageCode", "stageLabel", "riskLevel", "cultivationStatus", "cultivationStatusLabel",
                    "lastOperationType", "lastOperationLabel", "lastOperationAt", "operationRevision")) {
                if (plot.containsKey(key) && plot.get(key) != null) currentPlot.put(key, publicProjection(plot.get(key)));
            }
            String facilityType = PlotFacility.forPlot(plot);
            currentPlot.put("facilityType", facilityType);
            currentPlot.put("facilityLabel", PlotFacility.label(facilityType));
            Map<String, Object> simulation = simulationRecord(plotId);
            if (!simulation.isEmpty()) {
                currentPlot.put("simulationScenario", Jsons.text(simulation, "scenario", "NORMAL"));
                currentPlot.put("simulationParameters", publicProjection(simulation.get("parameters")));
            }
            context.put("currentPlot", currentPlot);
        }
        context.put("liveTelemetry", publicProjection(latestMetrics(plotId)));
        context.put("hardware", publicProjection(deviceForPlot(plotId)));
        String knowledge = knowledgeSnippet(plotId);
        if (!knowledge.isBlank()) context.put("retrievedKnowledge", knowledge);
        context.put("contextBoundary", "仅当前地块和当前 conversationId；其他对话、账号和全局审计不属于本轮上下文");
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

    /** Removes model-scoring language from user-facing image answers. */
    static String sanitizeVisionNarrative(String raw) {
        String text = sanitizeNarrative(raw);
        if (text.isBlank()) return text;
        text = text.replaceAll("(?i)[^，。！？；;\\n]{0,36}(?:置信度|confidence)[^，。！？；;\\n]{0,36}", "")
                .replaceAll("[^，。！？；;\\n]{0,36}(?:识别概率|模型评分|识别评分)[^，。！？；;\\n]{0,36}", "")
                .replaceAll("[，,]{2,}", "，")
                .replaceAll("(?m)^[，,；;\\s]+", "")
                .replaceAll("[，,]\\s*([。！？])", "$1")
                .replaceAll("[ \\t]{2,}", " ")
                .replaceAll("\\n{3,}", "\\n\\n")
                .trim();
        return text;
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
        Set<String> allowed = Set.of("get_risk_forecast", "generate_irrigation_plan", "evaluate_diagnosis", "get_today_work_items", "get_plot_status",
                "get_platform_status", "get_platform_risk_overview", "get_rule_strategy_status", "get_farm_overview");
        if (!allowed.contains(name)) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "TOOL_NOT_ALLOWED", "工具不在白名单中");
        if (!(input instanceof Map<?, ?>)) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "TOOL_SCHEMA_INVALID", "工具入参必须是 JSON object");
        Map<String, Object> contract = new LinkedHashMap<>(); contract.put("name", name); contract.put("input", input); contract.put("output", output);
        String scopeKey = Set.of("get_platform_status", "get_platform_risk_overview", "get_rule_strategy_status").contains(name)
                ? "scope" : "get_farm_overview".equals(name) ? "farmId" : "plotId";
        contract.put("inputSchema", Map.of("type", "object", "required", List.of(scopeKey), "properties", Map.of(scopeKey, Map.of("type", "string", "minLength", 1))));
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
        if (!principal.isAdmin() && !principal.isFarmer()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "SCENARIO_FORBIDDEN", "只有管理员或具备地块权限的农户可以比较情景分支");
        }
        String plotId = Jsons.text(input, "plotId", "plot-a01");
        ensurePlotAccess(principal, plotId);
        String scenarioId = Jsons.text(input, "scenarioId", "");
        long seed = Jsons.whole(input, "seed", 42);
        String scenarioRaw = Jsons.text(input, "scenario", "");
        if (scenarioRaw.isBlank() && !scenarioId.isBlank()) {
            String prefix = scenarioId.split("-")[0].toUpperCase(Locale.ROOT).replace('-', '_');
            scenarioRaw = switch (prefix) {
                case "DROUGHT", "HEAVY", "HEAVY_RAIN", "STORM" -> prefix.startsWith("HEAVY") || "STORM".equals(prefix) ? "HEAVY_RAIN" : prefix;
                case "SENSOR", "SENSOR_DRIFT", "DRIFT" -> "SENSOR_DRIFT";
                default -> "DROUGHT";
            };
        }
        if (scenarioRaw.isBlank()) scenarioRaw = "DROUGHT";
        String scenario = canonicalScenarioForRun(scenarioRaw);
        if (scenarioId.isBlank()) scenarioId = scenario.toLowerCase(Locale.ROOT) + "-" + seed;
        Map<String, Object> plot = requireRecord("plot", plotId);
        String facilityType = PlotFacility.forPlot(plot);
        Map<String, Object> latest = latestMetrics(plotId);
        Map<String, Object> latestMetric = Jsons.map(mapper, latest.get("SOIL_MOISTURE"));
        double startMoisture = Jsons.number(latestMetric, "value", baselineMetricValue(plotId, "SOIL_MOISTURE"));
        Map<String, Object> parameters = simulationDefaults(scenario, plotId);
        Map<String, Object> suppliedParameters = Jsons.map(mapper, input.get("parameters"));
        for (Map.Entry<String, double[]> entry : SIMULATION_PARAMETER_LIMITS.entrySet()) {
            String key = entry.getKey();
            if (!suppliedParameters.containsKey(key)) continue;
            double[] range = entry.getValue();
            double fallback = Jsons.number(parameters, key, (range[0] + range[1]) / 2.0);
            double candidate = Jsons.number(suppliedParameters, key, fallback);
            parameters.put(key, round(clamp(candidate, fallback, range[0], range[1])));
        }
        if (Jsons.number(parameters, "riskThreshold", 20) >= Jsons.number(parameters, "waterloggingThreshold", 82)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SIMULATION_THRESHOLD_INVALID", "干旱阈值必须低于积水阈值");
        }
        Random random = new Random(seed);
        double volatility = Jsons.number(parameters, "volatility", 1.0);
        double rainBoost = ("HEAVY_RAIN".equals(scenario) ? Jsons.number(parameters, "rainfallRate", 4.0) : 0.0) * (0.8 + random.nextDouble() * 0.4);
        double driftRate = Jsons.number(parameters, "driftRatePerHour", 0.08) * (0.9 + random.nextDouble() * 0.2);
        double decayK = 0.03 + random.nextDouble() * 0.012;
        double configuredTrend = Jsons.number(parameters, "soilMoistureTrendPerHour", -0.45);
        double temperatureBias = Jsons.number(parameters, "temperatureBias", 0.0);
        double humidityBias = Jsons.number(parameters, "humidityBias", 0.0);
        double droughtTrend = (configuredTrend - temperatureBias * (temperatureBias >= 0 ? 0.08 : 0.03) + humidityBias * 0.02)
                * PlotFacility.soilTrendResponse(facilityType, scenario);
        double rainPeak = "HEAVY_RAIN".equals(scenario)
                ? Math.min(18, Math.max(4, rainBoost * 2.4)) * PlotFacility.rainExposure(facilityType) : 0;
        int forecastMinutes = (int) Math.round(Jsons.number(parameters, "forecastHours", 4.0) * 60.0);
        String operator = "HEAVY_RAIN".equals(scenario) ? "GT" : "LT";
        double boundary = "HEAVY_RAIN".equals(scenario)
                ? Jsons.number(parameters, "waterloggingThreshold", 82)
                : Jsons.number(parameters, "riskThreshold", 20);
        List<Map<String, Object>> noActionPoints = buildScenarioBranchPoints(scenario, startMoisture, false, droughtTrend, rainPeak, driftRate, decayK, forecastMinutes, null);
        // 真实化执行分支：不再用随机跳跃模拟“措施后”，而是按地块面积、水泵流量、
        // 作物阶段目标湿度与水箱余量推导一次真实灌溉——需要多少水、泵最多送多少、
        // 水箱还剩多少；缺水时只能补到实际可用的量。
        double areaM2 = Math.max(1, Jsons.number(plot, "areaM2", DEFAULT_PLOT_AREA_M2));
        double irrigationTarget = cropPackCatalog.irrigationTarget(plotCropContext(plotId));
        Map<String, Object> resource = store.find("resource-profile", "resource-default");
        double flowLitresPerMinute = Math.max(1, Jsons.number(resource, "flowRateLitresPerMinute", 18));
        Map<String, Object> waterLevelMetric = Jsons.map(mapper, latest.get("WATER_LEVEL"));
        double reservoirLevelPercent = Jsons.number(waterLevelMetric, "value", 100);
        double reservoirAvailableLitres = Math.max(0, reservoirLevelPercent) / 100.0 * DEFAULT_RESERVOIR_LITRES;
        Map<String, Object> intervention = scenarioInterventionPlan(scenario, noActionPoints, parameters, areaM2,
                irrigationTarget, flowLitresPerMinute, reservoirLevelPercent, reservoirAvailableLitres, volatility, random);
        List<Map<String, Object>> executePoints = buildScenarioBranchPoints(scenario, startMoisture, true, droughtTrend, rainPeak, driftRate, decayK, forecastMinutes, intervention);
        Map<String, Object> branches = new LinkedHashMap<>();
        Map<String, Object> noActionPayload = scenarioBranchPayload("NO_ACTION", noActionPoints, boundary, operator);
        Map<String, Object> executePayload = scenarioBranchPayload("EXECUTE", executePoints, boundary, operator);
        branches.put("NO_ACTION", noActionPayload);
        branches.put("EXECUTE", executePayload);
        // 双轨差异指标：时点湿度差与风险推迟时长，供前端摘要直接引用。
        Map<String, Object> divergence = new LinkedHashMap<>();
        double executeFinal = Jsons.number(executePoints.get(executePoints.size() - 1), "value", 0);
        double noActionFinal = Jsons.number(noActionPoints.get(noActionPoints.size() - 1), "value", 0);
        divergence.put("moistureDeltaAtHorizon", round(executeFinal - noActionFinal));
        Integer executeRisk = (Integer) executePayload.get("timeToRiskMinutes");
        Integer noActionRisk = (Integer) noActionPayload.get("timeToRiskMinutes");
        if (noActionRisk != null) {
            divergence.put("riskDelayMinutes", executeRisk == null ? forecastMinutes - noActionRisk : executeRisk - noActionRisk);
            divergence.put("riskAvoidedWithinWindow", executeRisk == null);
        }
        Map<String, Object> frozenSnapshot = new LinkedHashMap<>();
        frozenSnapshot.put("plotId", plotId);
        frozenSnapshot.put("plotName", Jsons.text(plot, "name", plotId));
        frozenSnapshot.put("startMoisture", round(startMoisture));
        frozenSnapshot.put("facilityType", facilityType);
        frozenSnapshot.put("facilityLabel", PlotFacility.label(facilityType));
        frozenSnapshot.put("capturedAt", Instant.now().toString());
        frozenSnapshot.put("snapshotLabel", "冻结快照（只读，不写回主状态）");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", "AVAILABLE");
        result.put("scenarioId", scenarioId);
        result.put("scenario", scenario);
        result.put("plotId", plotId);
        result.put("facilityType", facilityType);
        result.put("facilityLabel", PlotFacility.label(facilityType));
        result.put("seed", seed);
        result.put("branches", branches);
        result.put("leftBranch", branches.get("EXECUTE"));
        result.put("rightBranch", branches.get("NO_ACTION"));
        result.put("sameSeed", seed);
        result.put("parameters", parameters);
        result.put("frozenSnapshot", frozenSnapshot);
        result.put("stressBoundary", boundary);
        result.put("intervention", intervention);
        result.put("divergence", divergence);
        result.put("readOnly", true);
        result.put("comparisonVersion", "branch-compare-v5");
        result.put("note", "双轨使用同一冻结快照与随机种子；执行分支按地块面积、水泵流量、作物目标湿度与水箱余量推导真实灌溉，结果只读，不写回主状态");
        result.put("provenance", "SIMULATED");
        return result;
    }

    private List<Map<String, Object>> buildScenarioBranchPoints(String scenario, double startMoisture, boolean execute,
                                                                  double droughtTrend, double rainPeak, double driftRate,
                                                                  double decayK, int horizonMinutes, Map<String, Object> intervention) {
        List<Map<String, Object>> points = new ArrayList<>();
        for (int index = 0; index * 5 <= horizonMinutes; index++) {
            int minute = index * 5;
            double hours = minute / 60.0;
            double value = scenarioMoistureAtMinute(scenario, minute, hours, startMoisture, execute, droughtTrend, rainPeak, driftRate, decayK, intervention);
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("minute", minute);
            point.put("value", round(value));
            points.add(point);
        }
        return points;
    }

    private double scenarioMoistureAtMinute(String scenario, int minute, double hours, double startMoisture, boolean execute,
                                            double droughtTrend, double rainPeak, double driftRate, double decayK,
                                            Map<String, Object> intervention) {
        double value;
        if ("HEAVY_RAIN".equals(scenario)) {
            double wetting = minute <= 45
                    ? startMoisture + rainPeak * (minute / 45.0)
                    : (startMoisture + rainPeak) * Math.exp(-decayK * (minute - 45) / 45.0);
            if (!execute) value = wetting;
            else {
                double managedPeak = startMoisture + rainPeak * 0.72;
                value = minute <= 45
                        ? startMoisture + rainPeak * 0.72 * (minute / 45.0)
                        : managedPeak * Math.exp(-decayK * 1.35 * (minute - 45) / 45.0);
            }
        } else if ("SENSOR_DRIFT".equals(scenario)) {
            double physical = startMoisture + droughtTrend * hours * 0.15;
            if (!execute) value = startMoisture + driftRate * hours;
            else if (minute < 30) value = startMoisture + driftRate * hours;
            else {
                double driftAt30 = startMoisture + driftRate * 0.5;
                double blend = 1 - Math.exp(-(minute - 30) / 35.0);
                value = driftAt30 + (physical - driftAt30) * blend;
            }
        } else if ("DROUGHT".equals(scenario)) {
            value = startMoisture + droughtTrend * hours;
            if (execute) value = irrigationAdjustedValue(value, intervention, minute, droughtTrend / 60.0);
        } else {
            double natural = Math.max(0, startMoisture - minute * 0.025);
            value = execute ? irrigationAdjustedValue(natural, intervention, minute, -0.025) : natural;
        }
        return clamp(value, 0, 100);
    }

    /**
     * 灌溉干预下的曲线：干预前与不干预完全一致；灌溉时长内水位线性爬升到补水后
     * 水位，灌溉结束后恢复自然失水——浇过一次水并不能让土壤停止蒸发。
     */
    private double irrigationAdjustedValue(double naturalValue, Map<String, Object> intervention, int minute, double trendPerMinute) {
        if (intervention == null || !"PLANNED".equals(intervention.get("status"))
                || !"IRRIGATION".equals(intervention.get("measure"))) {
            return naturalValue;
        }
        int triggerMinute = (int) Jsons.whole(intervention, "triggerMinute", 0);
        if (minute <= triggerMinute) return naturalValue;
        double moistureAtTrigger = Jsons.number(intervention, "moistureAtTrigger", naturalValue);
        double gain = Jsons.number(intervention, "moistureGain", 0);
        int durationMinutes = (int) Math.max(1, Jsons.whole(intervention, "durationMinutes", 1));
        if (minute <= triggerMinute + durationMinutes) {
            double progress = (minute - triggerMinute) / (double) durationMinutes;
            return moistureAtTrigger + gain * progress;
        }
        return moistureAtTrigger + gain + trendPerMinute * (minute - triggerMinute - durationMinutes);
    }

    /**
     * 干旱/常景下的干预计划：以“不干预曲线预计跌破干旱阈值 + 3 个百分点预警线”
     * 为触发时点（再叠加人工确认与开泵的响应延迟），按作物阶段目标湿度算出
     * 需水量，依次受水泵流量上限与水箱余量约束；预测窗口内无风险则不安排灌溉。
     */
    private Map<String, Object> scenarioInterventionPlan(String scenario, List<Map<String, Object>> noActionPoints,
                                                         Map<String, Object> parameters, double areaM2, double irrigationTarget,
                                                         double flowLitresPerMinute, double reservoirLevelPercent,
                                                         double reservoirAvailableLitres, double volatility, Random random) {
        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("reservoirLevelPercent", round(reservoirLevelPercent));
        plan.put("reservoirAvailableLitres", round(reservoirAvailableLitres));
        plan.put("pumpFlowLitresPerMinute", flowLitresPerMinute);
        plan.put("irrigationTargetMoisture", round(irrigationTarget));
        if ("HEAVY_RAIN".equals(scenario)) {
            plan.put("measure", "DRAINAGE");
            plan.put("status", "PLANNED");
            plan.put("triggerMinute", 0);
            plan.put("triggerReason", "暴雨来临即启动排水，削峰并加快退水");
            return plan;
        }
        if ("SENSOR_DRIFT".equals(scenario)) {
            plan.put("measure", "SENSOR_RECALIBRATION");
            plan.put("status", "PLANNED");
            plan.put("triggerMinute", 30);
            plan.put("triggerReason", "读数漂移 30 分钟后安排复测校准");
            return plan;
        }
        plan.put("measure", "IRRIGATION");
        double earlyWarning = Jsons.number(parameters, "riskThreshold", 20) + 3;
        int horizonMinutes = noActionPoints.isEmpty() ? 0 : (int) Jsons.whole(noActionPoints.get(noActionPoints.size() - 1), "minute", 0);
        Map<String, Object> crossPoint = noActionPoints.stream()
                .filter(point -> Jsons.number(point, "value", 0) <= earlyWarning)
                .findFirst().orElse(null);
        if (crossPoint == null) {
            plan.put("status", "NO_RISK_IN_WINDOW");
            plan.put("triggerReason", "预测窗口内不会跌破干旱预警线，无需灌溉");
            return plan;
        }
        int responseDelayMinutes = 15;
        int triggerMinute = (int) Math.min(horizonMinutes, Jsons.whole(crossPoint, "minute", 0) + responseDelayMinutes);
        final int trigger = triggerMinute;
        Map<String, Object> triggerPoint = noActionPoints.stream()
                .filter(point -> Jsons.whole(point, "minute", 0) == trigger)
                .findFirst().orElse(crossPoint);
        double moistureAtTrigger = Jsons.number(triggerPoint, "value", 0);
        double neededLitres = Math.max(0, (irrigationTarget - moistureAtTrigger) * areaM2 * SOIL_WATER_LITRES_PER_POINT_PER_M2);
        double pumpCapLitres = flowLitresPerMinute * properties.getMaxIrrigationSeconds() / 60.0;
        double plannedLitres = Math.min(neededLitres, pumpCapLitres);
        boolean reservoirSufficient = reservoirAvailableLitres + 0.5 >= plannedLitres;
        double deliveredLitres = Math.min(plannedLitres, reservoirAvailableLitres);
        // 泵送损耗随波动强度浮动并限制在 85%~100%，同一随机种子结果仍可复现。
        double deliveryEfficiency = Math.min(1.0, Math.max(0.85, 0.94 + (random.nextDouble() - 0.5) * 0.08 * volatility));
        double moistureGain = moistureDeltaFromWater(deliveredLitres, areaM2) * deliveryEfficiency;
        plan.put("status", "PLANNED");
        plan.put("triggerMinute", triggerMinute);
        plan.put("triggerReason", "不干预曲线预计跌破干旱预警线（阈值+3 个百分点），触发补水");
        plan.put("responseDelayMinutes", responseDelayMinutes);
        plan.put("durationMinutes", (int) Math.max(1, Math.round(deliveredLitres / Math.max(1, flowLitresPerMinute))));
        plan.put("neededWaterLitre", round(neededLitres));
        plan.put("waterLitre", round(deliveredLitres));
        plan.put("reservoirSufficient", reservoirSufficient);
        plan.put("moistureAtTrigger", round(moistureAtTrigger));
        plan.put("moistureGain", round(moistureGain));
        plan.put("moistureAfterIrrigation", round(Math.min(100, moistureAtTrigger + moistureGain)));
        return plan;
    }

    private Map<String, Object> scenarioBranchPayload(String branchId, List<Map<String, Object>> points, double boundary, String operator) {
        Integer timeToRisk = null;
        for (Map<String, Object> point : points) {
            double value = Jsons.number(point, "value", 0);
            if (("LT".equals(operator) && value <= boundary) || ("GT".equals(operator) && value >= boundary)) {
                timeToRisk = (int) Jsons.whole(point, "minute", 0);
                break;
            }
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("branchId", branchId);
        payload.put("points", points);
        payload.put("timeToRiskMinutes", timeToRisk);
        payload.put("provenance", "SIMULATED");
        return payload;
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
        if (principal == null || principal.isSystemAdmin()) return true;
        if (!principal.isFarmAdmin()) return principal.canAccessPlot(plotId);
        Map<String, Object> plot = store.find("plot", plotId);
        String farmId = Jsons.text(plot == null ? Map.of() : plot, "farmId", "");
        return !farmId.isBlank() && principal.canAccessFarm(farmId);
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
    private final FarmGovernanceService governance;
    private final MarketPriceService marketPrices;

    AgriController(AgriEngine engine, AgriStore store, AgriEventBus events, MqttBridge mqtt, SimulatorControl simulator,
                   AdminManagementService adminManagement, FarmGovernanceService governance, MarketPriceService marketPrices) {
        this.engine = engine; this.store = store; this.events = events; this.mqtt = mqtt; this.simulator = simulator;
        this.adminManagement = adminManagement; this.governance = governance; this.marketPrices = marketPrices;
    }

    @PostMapping("/auth/login")
    ResponseEntity<?> login(@RequestBody Map<String, Object> body) {
        return ok(engine.login(Jsons.text(body, "username", ""), Jsons.text(body, "password", ""), Jsons.text(body, "role", "")));
    }

    @PostMapping("/auth/register")
    ResponseEntity<?> register(@RequestBody Map<String, Object> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponses.success(
                engine.register(Jsons.text(body, "username", ""), Jsons.text(body, "password", ""),
                        Jsons.text(body, "role", "FARMER"), Jsons.text(body, "authorizationCode", ""), body.get("farmProfile"))));
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

    @GetMapping("/users/me/preferences/farmer-workspace")
    ResponseEntity<?> farmerWorkspacePreference(Authentication authentication) {
        return ok(engine.farmerWorkspacePreference(principal(authentication)));
    }

    @PutMapping("/users/me/preferences/farmer-workspace")
    ResponseEntity<?> updateFarmerWorkspacePreference(@RequestBody(required = false) Map<String, Object> body,
                                                      Authentication authentication) {
        return ok(engine.updateFarmerWorkspacePreference(body == null ? Map.of() : body, principal(authentication)));
    }

    @GetMapping("/auth/roles")
    ResponseEntity<?> roles() {
        return ok(List.of(
                Map.of("code", "FARM_ADMIN", "label", "农场管理员", "description", "负责全场运营、任务安排、灌溉执行与资源调度"),
                Map.of("code", "FARMER", "label", "种植农户", "description", "查看分配地块、提交巡田记录并确认和执行灌溉建议"),
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

    @GetMapping("/market-prices")
    ResponseEntity<?> marketPrices(@RequestParam String farmId,
                                   @RequestParam(defaultValue = "30") int rangeDays,
                                   @RequestParam(defaultValue = "farm") String scope,
                                   Authentication a) {
        return ok(marketPrices.overview(farmId, rangeDays, "all".equalsIgnoreCase(scope), principal(a)));
    }

    @GetMapping("/system/status")
    ResponseEntity<?> systemStatus() { return ok(engine.dependencyStatus(mqtt.connected())); }

    @PutMapping("/system/ai-mode")
    ResponseEntity<?> updateAiMode(@RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.updateAiMode(Jsons.text(body, "aiMode", ""), principal(a)));
    }

    @GetMapping("/system/audit-logs")
    ResponseEntity<?> auditLogs(@RequestParam(defaultValue = "50") int limit, Authentication a) {
        UserPrincipal principal = principal(a);
        if (!principal.isSystemAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "AUDIT_FORBIDDEN", "只有系统管理员可以查看操作审计日志");
        return ok(engine.auditLogsView(limit));
    }

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

    @PutMapping("/simulator/settings")
    ResponseEntity<?> simulatorSettings(@RequestBody Map<String, Object> body, Authentication a) {
        if (!principal(a).isAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_REQUIRED", "需要管理员权限调整模拟器采样与流速");
        return ok(simulator.updateSettings(body == null ? Map.of() : body));
    }

    @GetMapping("/crop-packs")
    ResponseEntity<?> cropPacks(@RequestParam(required = false) String farmId,
                                @RequestParam(defaultValue = "false") boolean includeDrafts,
                                Authentication a) {
        UserPrincipal p = principal(a);
        return ok(farmId == null || farmId.isBlank() ? engine.cropPacks() : engine.cropPacks(farmId, includeDrafts, p));
    }

    @GetMapping("/rule-sets")
    ResponseEntity<?> ruleSets(@RequestParam String farmId, Authentication a) { return ok(governance.ruleSets(farmId, principal(a))); }

    @PostMapping("/rule-sets")
    ResponseEntity<?> createRuleSet(@RequestBody Map<String, Object> body, Authentication a) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponses.success(governance.createRuleSet(body == null ? Map.of() : body, principal(a))));
    }

    @GetMapping("/alert-learning-cases")
    ResponseEntity<?> alertLearningCases(@RequestParam(required = false) String farmId,
                                         @RequestParam(required = false) String plotId,
                                         @RequestParam(required = false) String cropCode,
                                         @RequestParam(required = false) String scenarioId,
                                         @RequestParam(required = false) String qualityStatus,
                                         @RequestParam(required = false) String candidateId,
                                         Authentication a) {
        return ok(governance.learningCases(farmId, plotId, cropCode, scenarioId, qualityStatus, candidateId, principal(a)));
    }

    /** Explicit learning-governance alias; the legacy alert-learning-cases route remains supported. */
    @GetMapping("/learning/cases")
    ResponseEntity<?> learningCases(@RequestParam(required = false) String farmId,
                                    @RequestParam(required = false) String plotId,
                                    @RequestParam(required = false) String cropCode,
                                    @RequestParam(required = false) String scenarioId,
                                    @RequestParam(required = false) String qualityStatus,
                                    @RequestParam(required = false) String candidateId,
                                    Authentication a) {
        return ok(governance.learningCases(farmId, plotId, cropCode, scenarioId, qualityStatus, candidateId, principal(a)));
    }

    @PostMapping("/alert-learning-cases/{caseId}/re-evaluate")
    ResponseEntity<?> reEvaluateLearningCase(@PathVariable String caseId, Authentication a) {
        return ok(governance.reEvaluateLearningCase(caseId, principal(a)));
    }

    @PostMapping("/learning/cases/{caseId}/re-evaluate")
    ResponseEntity<?> reEvaluateLearningCaseAlias(@PathVariable String caseId, Authentication a) {
        return ok(governance.reEvaluateLearningCase(caseId, principal(a)));
    }

    @PostMapping("/alert-learning-cases/{caseId}/review")
    ResponseEntity<?> reviewLearningCase(@PathVariable String caseId,
                                         @RequestBody(required = false) Map<String, Object> body,
                                         Authentication a) {
        Map<String, Object> input = body == null ? Map.of() : body;
        return ok(governance.reviewLearningCase(caseId, Jsons.text(input, "decision", Jsons.text(input, "status", "")),
                Jsons.text(input, "note", Jsons.text(input, "reviewNote", "")), principal(a)));
    }

    @PostMapping("/learning/cases/{caseId}/review")
    ResponseEntity<?> reviewLearningCaseAlias(@PathVariable String caseId,
                                              @RequestBody(required = false) Map<String, Object> body,
                                              Authentication a) {
        Map<String, Object> input = body == null ? Map.of() : body;
        return ok(governance.reviewLearningCase(caseId, Jsons.text(input, "decision", Jsons.text(input, "status", "")),
                Jsons.text(input, "note", Jsons.text(input, "reviewNote", "")), principal(a)));
    }

    @GetMapping("/learning/audit")
    ResponseEntity<?> learningAudit(@RequestParam(defaultValue = "100") int limit, Authentication a) {
        return ok(governance.learningAudit(limit, principal(a)));
    }

    @GetMapping("/learning/training-export")
    ResponseEntity<?> learningTrainingExport(@RequestParam(required = false) String farmId,
                                             @RequestParam(required = false) String plotId,
                                             Authentication a) {
        return ok(governance.exportApprovedTrainingSet(farmId, plotId, principal(a)));
    }

    @PostMapping("/learning/strategy-candidates/generate")
    ResponseEntity<?> generateLearningStrategy(@RequestBody(required = false) Map<String, Object> body, Authentication a) {
        return ok(governance.generateStrategyCandidate(body == null ? Map.of() : body, principal(a)));
    }

    @GetMapping("/strategy-candidates")
    ResponseEntity<?> strategies(@RequestParam(required = false) String farmId,
                                 @RequestParam(required = false) String status, Authentication a) {
        return ok(governance.strategyCandidates(farmId, status, principal(a)));
    }

    @PostMapping("/strategy-candidates/{id}/activate")
    ResponseEntity<?> activateStrategy(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        return ok(governance.activateStrategy(id, body == null ? Map.of() : body, principal(a)));
    }

    @GetMapping("/strategy-candidates/preview")
    ResponseEntity<?> strategyPreview(@RequestParam String farmId, @RequestParam String alertId, Authentication a) {
        return ok(governance.strategyPreview(farmId, alertId, principal(a)));
    }

    @PostMapping("/strategy-candidates/{id}/transition")
    ResponseEntity<?> strategyTransition(@PathVariable String id, @RequestBody Map<String, Object> body, Authentication a) {
        return ok(governance.transitionStrategy(id, Jsons.text(body, "status", ""), body, principal(a)));
    }

    @PostMapping("/farms/{farmId}/crop-packs")
    ResponseEntity<?> createFarmCropPack(@PathVariable String farmId, @RequestBody Map<String, Object> body, Authentication a) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponses.success(governance.createCropPack(farmId, body == null ? Map.of() : body, principal(a))));
    }

    @PutMapping("/farms/{farmId}/crop-packs/{cropCode}/{version}")
    ResponseEntity<?> updateFarmCropPack(@PathVariable String farmId, @PathVariable String cropCode, @PathVariable String version,
                                         @RequestBody Map<String, Object> body, Authentication a) {
        return ok(governance.updateCropPack(farmId, cropCode, version, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/farms/{farmId}/crop-packs/{cropCode}/{version}/validate")
    ResponseEntity<?> validateFarmCropPack(@PathVariable String farmId, @PathVariable String cropCode, @PathVariable String version, Authentication a) {
        return ok(governance.validateCropPack(farmId, cropCode, version, principal(a)));
    }

    @PostMapping("/farms/{farmId}/crop-packs/{cropCode}/{version}/activate")
    ResponseEntity<?> activateFarmCropPack(@PathVariable String farmId, @PathVariable String cropCode, @PathVariable String version,
                                            @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        return ok(governance.activateCropPack(farmId, cropCode, version, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/farms/{farmId}/crop-packs/{cropCode}/{version}/archive")
    ResponseEntity<?> archiveFarmCropPack(@PathVariable String farmId, @PathVariable String cropCode, @PathVariable String version,
                                          @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        return ok(governance.archiveCropPack(farmId, cropCode, version, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/crop-packs")
    ResponseEntity<?> createCropPack(@RequestBody(required = false) Map<String, Object> body, Authentication a) {
        UserPrincipal p = principal(a);
        if (!p.isSystemAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "SYSTEM_ADMIN_REQUIRED", "只有系统管理员可以新增作物包");
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponses.success(engine.createCropPack(body == null ? Map.of() : body, p)));
    }

    @PutMapping("/crop-packs/{cropCode}/{version}")
    ResponseEntity<?> updateCropPack(@PathVariable String cropCode, @PathVariable String version,
                                     @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        UserPrincipal p = principal(a);
        if (!p.isSystemAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "SYSTEM_ADMIN_REQUIRED", "只有系统管理员可以编辑作物包");
        return ok(engine.updateCropPack(cropCode, version, body == null ? Map.of() : body, p));
    }

    @DeleteMapping("/crop-packs/{cropCode}/{version}")
    ResponseEntity<?> deleteCropPack(@PathVariable String cropCode, @PathVariable String version, Authentication a) {
        UserPrincipal p = principal(a);
        if (!p.isSystemAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "SYSTEM_ADMIN_REQUIRED", "只有系统管理员可以删除作物包");
        engine.deleteCropPack(cropCode, version);
        return ok(Map.of("success", true));
    }

    @PatchMapping("/crop-packs/{cropCode}/{version}/status")
    ResponseEntity<?> updateCropPackStatus(@PathVariable String cropCode, @PathVariable String version, @RequestBody Map<String, Object> body, Authentication a) {
        UserPrincipal p = principal(a);
        if (!p.isSystemAdmin()) throw new ApiException(HttpStatus.FORBIDDEN, "SYSTEM_ADMIN_REQUIRED", "只有系统管理员可以修改作物包状态");
        return ok(engine.updateCropPackStatus(cropCode, version, Jsons.text(body, "status", "DRAFT"), p));
    }

    @GetMapping("/crop-manuals")
    ResponseEntity<?> cropManuals(@RequestParam(required = false) String farmId,
                                  @RequestParam(defaultValue = "false") boolean includeDrafts,
                                  Authentication a) {
        return ok(engine.cropManuals(farmId, includeDrafts, principal(a)));
    }

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
                .filter(plot -> engine.canAccessPlot(p, Jsons.text(plot, "plotId", "")))
                .sorted(Comparator.comparing(plot -> Jsons.text(plot, "plotId", ""))).toList());
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

    @GetMapping("/plots/{plotId}/irrigation-guard")
    ResponseEntity<?> irrigationGuard(@PathVariable String plotId, Authentication a) {
        return ok(engine.irrigationGuard(plotId, principal(a)));
    }

    @GetMapping("/plots/{plotId}/automatic-watering")
    ResponseEntity<?> automaticWateringSetting(@PathVariable String plotId, Authentication a) {
        return ok(engine.automaticWateringSetting(plotId, principal(a)));
    }

    @PutMapping("/plots/{plotId}/automatic-watering")
    ResponseEntity<?> updateAutomaticWateringSetting(@PathVariable String plotId,
                                                      @RequestBody(required = false) Map<String, Object> body,
                                                      Authentication a) {
        return ok(engine.updateAutomaticWateringSetting(plotId, body == null ? Map.of() : body, principal(a)));
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
    ResponseEntity<?> forecastEvaluate(@RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.evaluateForecast(body, principal(a)));
    }

    @GetMapping("/plots/{plotId}/timeline")
    ResponseEntity<?> timeline(@PathVariable String plotId,
                               @RequestParam(defaultValue = "50") int limit, Authentication a) {
        engine.ensurePlotAccess(principal(a), plotId);
        // 每类型只返回最近 cap 条（按时间倒序截取），避免全量历史导致平台总览加载缓慢
        int cap = Math.max(1, Math.min(limit, 200));
        List<Map<String, Object>> timeline = new ArrayList<>();
        for (String type : List.of("alert", "diagnosis", "readiness", "irrigation-plan", "command", "evaluation", "inspection", "work-order")) {
            for (Map<String, Object> x : store.timelineForPlot(type, plotId, cap)) {
                timeline.add(Map.of("type", type, "at", Jsons.text(x, "createdAt", Jsons.text(x, "evaluatedAt", Instant.now().toString())), "record", x));
            }
        }
        timeline.sort(Comparator.comparing(x -> Jsons.text(x, "at", ""))); return ok(timeline);
    }

    @GetMapping(value = "/events/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream(Authentication a) { return events.subscribe(principal(a)); }

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

    @GetMapping("/inspections")
    ResponseEntity<?> inspections(@RequestParam(required = false) String farmId,
                                  @RequestParam(required = false) String plotId,
                                  Authentication a) {
        return ok(engine.inspections(principal(a), farmId, plotId));
    }

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
    ResponseEntity<?> inspections(@PathVariable String plotId, Authentication a) {
        return ok(engine.inspections(plotId, principal(a)));
    }

    @PostMapping("/irrigation/estimate")
    ResponseEntity<?> irrigation(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.irrigationPlan(body, principal(a))); }

    @PostMapping("/irrigation/auto")
    ResponseEntity<?> automaticIrrigation(@RequestBody(required = false) Map<String, Object> body, Authentication a) {
        return ok(engine.automaticWatering(body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/irrigation/manual")
    ResponseEntity<?> manualIrrigation(@RequestBody Map<String, Object> body, Authentication a) {
        Map<String, Object> input = new LinkedHashMap<>(body == null ? Map.of() : body);
        input.put("manualOverride", true);
        input.putIfAbsent("source", "farmer-manual-fallback");
        return ok(engine.createCommand(input, principal(a)));
    }

    @PostMapping("/lighting/virtual")
    ResponseEntity<?> virtualLighting(@RequestBody(required = false) Map<String, Object> body, Authentication a) {
        return ok(engine.virtualLighting(body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/agent/chat")
    ResponseEntity<?> chat(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.agentChat(body, principal(a))); }

    @PostMapping("/agent/actions/{actionId}/confirm")
    ResponseEntity<?> confirmAgentAction(@PathVariable String actionId,
                                         @RequestBody(required = false) Map<String, Object> body,
                                         Authentication a) {
        return ok(engine.confirmAgentAction(actionId, body == null ? Map.of() : body, principal(a)));
    }

    @GetMapping("/agent/actions/{actionId}")
    ResponseEntity<?> agentAction(@PathVariable String actionId, Authentication a) {
        return ok(engine.agentAction(actionId, principal(a)));
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
    ResponseEntity<?> agentConversations(@RequestParam(defaultValue = "20") int limit,
                                         @RequestParam(defaultValue = "false") boolean archived,
                                         @RequestParam(required = false) String plotId, Authentication a) {
        return ok(engine.agentConversations(limit, archived, plotId, principal(a)));
    }

    @DeleteMapping("/agent/conversations/{conversationId}")
    ResponseEntity<?> deleteAgentConversation(@PathVariable String conversationId, Authentication a) {
        engine.deleteAgentConversation(conversationId, principal(a));
        return ok(Map.of("success", true, "conversationId", conversationId));
    }

    @PutMapping("/agent/conversations/{conversationId}")
    ResponseEntity<?> renameAgentConversation(@PathVariable String conversationId, @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        String title = body != null && body.containsKey("title") ? Jsons.text(body, "title", "") : null;
        Boolean pinned = body != null && body.containsKey("pinned") ? Jsons.bool(body, "pinned", false) : null;
        return ok(engine.updateAgentConversation(conversationId, title, pinned, principal(a)));
    }

    @PostMapping("/agent/conversations/{conversationId}/archive")
    ResponseEntity<?> archiveAgentConversation(@PathVariable String conversationId, @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        boolean archived = body == null || !Boolean.FALSE.equals(body.get("archived"));
        return ok(engine.archiveAgentConversation(conversationId, archived, principal(a)));
    }

    @GetMapping("/agent/tools")
    ResponseEntity<?> agentTools(Authentication a) { return ok(engine.agentTools(principal(a))); }

    @GetMapping("/agent/runs/{traceId}")
    ResponseEntity<?> agentRun(@PathVariable String traceId, Authentication a) { return ok(engine.agentRun(traceId, principal(a))); }

    @PostMapping("/commands/virtual")
    ResponseEntity<?> command(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.createCommand(body, principal(a))); }

    @PostMapping("/commands/{commandId}/ack")
    ResponseEntity<?> commandAck(@PathVariable String commandId, @RequestBody(required = false) Map<String, Object> body, Authentication a) { return ok(engine.acknowledgeCommand(commandId, body, principal(a))); }

    @GetMapping("/commands/{commandId}")
    ResponseEntity<?> commandById(@PathVariable String commandId, Authentication a) { return ok(engine.commandById(commandId, principal(a))); }

    @GetMapping("/commands/{commandId}/evaluation")
    ResponseEntity<?> evaluation(@PathVariable String commandId, Authentication a) { return ok(engine.commandEvaluation(commandId, principal(a))); }

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

    @PostMapping("/work-orders/{workOrderId}/report-issue")
    ResponseEntity<?> reportWorkOrderIssue(@PathVariable String workOrderId,
                                            @RequestBody(required = false) Map<String, Object> body,
                                            Authentication a) {
        return ok(engine.reportWorkOrderIssue(workOrderId, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/work-orders/{workOrderId}/review")
    ResponseEntity<?> reviewWorkOrder(@PathVariable String workOrderId, @RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.reviewWorkOrder(workOrderId, body, principal(a)));
    }

    @DeleteMapping("/work-orders/{workOrderId}")
    ResponseEntity<?> deleteWorkOrder(@PathVariable String workOrderId, Authentication a) {
        return ok(engine.deleteWorkOrder(workOrderId, principal(a)));
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

    @GetMapping("/users")
    ResponseEntity<?> users(Authentication a) {
        return ok(engine.userAccounts(principal(a)));
    }

    @PostMapping("/users")
    ResponseEntity<?> createUserAccount(@RequestBody Map<String, Object> body, Authentication a) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponses.success(engine.createUserAccount(body, principal(a))));
    }

    @PatchMapping("/users/{userId}/status")
    ResponseEntity<?> updateUserAccountStatus(@PathVariable String userId, @RequestBody Map<String, Object> body,
                                              Authentication a) {
        return ok(engine.updateUserAccountStatus(userId, body, principal(a)));
    }

    @DeleteMapping("/users/{userId}")
    ResponseEntity<?> deleteUserAccount(@PathVariable String userId, Authentication a) {
        return ok(engine.deleteAccount(userId, principal(a)));
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
    ResponseEntity<?> cases(@PathVariable String traceId, @RequestParam Map<String, String> params, Authentication a) {
        return ok(engine.similarCases(traceId, new LinkedHashMap<>(params), principal(a)));
    }

    @PostMapping("/resource-plans/evaluate")
    ResponseEntity<?> resourcePlan(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.resourcePlan(body, principal(a))); }

    @PostMapping("/resource-requests")
    ResponseEntity<?> createResourceRequest(@RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.createResourceRequest(body, principal(a)));
    }

    @GetMapping("/resource-requests")
    ResponseEntity<?> resourceRequests(@RequestParam(required = false) String farmId,
                                       @RequestParam(required = false) String plotId,
                                       @RequestParam(required = false) String status, Authentication a) {
        Map<String, String> filters = new LinkedHashMap<>();
        if (farmId != null) filters.put("farmId", farmId); if (plotId != null) filters.put("plotId", plotId); if (status != null) filters.put("status", status);
        return ok(engine.listResourceRequests(filters, principal(a)));
    }

    @PostMapping("/resource-requests/{resourceRequestId}/actions")
    ResponseEntity<?> actOnResourceRequest(@PathVariable String resourceRequestId, @RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.actOnResourceRequest(resourceRequestId, body, principal(a)));
    }

    @GetMapping("/resource-profiles/water")
    ResponseEntity<?> waterResourceProfile(@RequestParam(required = false) String farmId,
                                            @RequestParam(required = false) String date, Authentication a) {
        return ok(engine.waterResourceProfile(farmId, date, principal(a)));
    }

    @PutMapping("/resource-profiles/water")
    ResponseEntity<?> updateWaterResourceProfile(@RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.updateWaterResourceProfile(body, principal(a)));
    }

    @GetMapping("/resource-plans")
    ResponseEntity<?> resourcePlans(@RequestParam(required = false) String farmId,
                                    @RequestParam(required = false) String businessDate,
                                    @RequestParam(required = false) String status, Authentication a) {
        Map<String, String> filters = new LinkedHashMap<>(); if (farmId != null) filters.put("farmId", farmId); if (businessDate != null) filters.put("businessDate", businessDate); if (status != null) filters.put("status", status);
        return ok(engine.listResourcePlans(filters, principal(a)));
    }

    @PatchMapping("/resource-plans/{resourcePlanId}")
    ResponseEntity<?> adjustResourcePlan(@PathVariable String resourcePlanId, @RequestBody Map<String, Object> body, Authentication a) {
        return ok(engine.adjustResourcePlan(resourcePlanId, body, principal(a)));
    }

    @PostMapping("/resource-plans/{resourcePlanId}/confirm")
    ResponseEntity<?> confirmResourcePlan(@PathVariable String resourcePlanId, @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        return ok(engine.confirmResourcePlan(resourcePlanId, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/resource-plans/{resourcePlanId}/cancel")
    ResponseEntity<?> cancelResourcePlan(@PathVariable String resourcePlanId, Authentication a) {
        return ok(engine.cancelResourcePlan(resourcePlanId, principal(a)));
    }

    @GetMapping("/resource-plans/{resourcePlanId}")
    ResponseEntity<?> resourcePlanById(@PathVariable String resourcePlanId, Authentication a) { return ok(engine.resourcePlanById(resourcePlanId, principal(a))); }

    @GetMapping("/value-ledgers")
    ResponseEntity<?> valueLedgers(@RequestParam String farmId, Authentication a) { return ok(adminManagement.valueLedgers(farmId, principal(a))); }

    @PostMapping("/value-ledgers")
    ResponseEntity<?> valueLedger(@RequestBody Map<String, Object> body, Authentication a) { return ok(adminManagement.createValueLedger(body, principal(a))); }

    @GetMapping("/decision-passports/{traceId}")
    ResponseEntity<?> passport(@PathVariable String traceId, Authentication a) { return ok(engine.passport(traceId, principal(a))); }

    @PostMapping("/strategy-candidates")
    ResponseEntity<?> strategy(@RequestBody Map<String, Object> body, Authentication a) { return ok(engine.strategyCandidate(body, principal(a))); }

    @GetMapping("/devices")
    ResponseEntity<?> devices(@RequestParam String farmId, Authentication a) { return ok(adminManagement.devices(farmId, principal(a))); }

    @PostMapping("/devices")
    ResponseEntity<?> device(@RequestBody Map<String, Object> body, Authentication a) { return ok(adminManagement.registerDevice(body, principal(a))); }

    @PatchMapping("/devices/{deviceId}")
    ResponseEntity<?> updateDevice(@PathVariable String deviceId, @RequestBody(required = false) Map<String, Object> body, Authentication a) {
        return ok(adminManagement.updateDevice(deviceId, body == null ? Map.of() : body, principal(a)));
    }

    @DeleteMapping("/devices/{deviceId}")
    ResponseEntity<?> deleteDevice(@PathVariable String deviceId, @RequestParam(required = false) String confirmName, Authentication a) {
        return ok(adminManagement.deleteDevice(deviceId, confirmName, principal(a)));
    }

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
