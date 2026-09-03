package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataAccessException;

import java.sql.ResultSet;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Predicate;
import java.util.stream.Collectors;

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
            "lighting-plan", 1_000,
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
    Map<String, Map<String, Map<String, Object>>> latestMetricWindows(Collection<String> plotIds,
                                                                        Instant latestFrom, Instant to,
                                                                        Instant activeRealFrom, Instant qualityFrom) {
        if (!databaseReady || !postgres) return null;
        List<String> ids = new ArrayList<>(new LinkedHashSet<>(plotIds == null ? List.of() : plotIds.stream()
                .filter(Objects::nonNull)
                .map(String::valueOf)
                .filter(id -> !id.isBlank())
                .toList()));
        if (ids.isEmpty()) return Map.of();
        try {
            Map<String, Map<String, Map<String, Object>>> result = new LinkedHashMap<>();
            String plotValues = String.join(",", Collections.nCopies(ids.size(), "(?)"));
            String columns = "event_id,farm_id,plot_id,device_id,metric,metric_value,unit,event_ts,"
                    + "quality_status,quality_json,scenario_id,branch_id,source_mode,provenance,data_origin";
            String pairs = "(VALUES " + plotValues + ") p(plot_id) CROSS JOIN (VALUES "
                    + "('SOIL_MOISTURE'),('AIR_TEMPERATURE'),('AIR_HUMIDITY'),('LIGHT'),('CO2'),('PH'),"
                    + "('WATER_LEVEL'),('RAINFALL'),('NITROGEN'),('PHOSPHORUS'),('POTASSIUM')) m(metric)";
            // Keep each probe bounded by the composite index.  The previous
            // DISTINCT ON query sorted every matching row in a 48-hour window,
            // which became several seconds once the telemetry table grew past
            // six million records.
            String latestSql = "SELECT p.plot_id,m.metric,l.* FROM " + pairs
                    + " JOIN LATERAL (SELECT " + columns + " FROM telemetry t "
                    + "WHERE t.plot_id=p.plot_id AND t.metric=m.metric AND t.event_ts>=? AND t.event_ts<=? "
                    + "ORDER BY t.event_ts DESC,t.event_id DESC LIMIT 1) l ON TRUE";
            List<Object> latestArgs = new ArrayList<>(ids);
            latestArgs.add(TimestampParser.sql(latestFrom));
            latestArgs.add(TimestampParser.sql(to));
            jdbc.query(latestSql, (rs, rowNum) -> {
                Map<String, Object> event = readTelemetryRow(rs);
                String plotId = Jsons.text(event, "plotId", "");
                String metric = Jsons.text(event, "metric", "");
                if (!plotId.isBlank() && !metric.isBlank()) {
                    result.computeIfAbsent(plotId, ignored -> new LinkedHashMap<>()).put(metric, event);
                }
                return event;
            }, latestArgs.toArray());

            // A fresh REAL sample wins over simulation regardless of which
            // source produced the newest event.  This is intentionally a
            // separate indexed probe so a physical device never gets hidden
            // by a high-frequency simulator stream.
            String realSql = "SELECT p.plot_id,m.metric,l.* FROM " + pairs
                    + " JOIN LATERAL (SELECT " + columns + " FROM telemetry t "
                    + "WHERE t.plot_id=p.plot_id AND t.metric=m.metric AND t.source_mode='REAL' "
                    + "AND t.event_ts>=? AND t.event_ts<=? "
                    + "ORDER BY t.event_ts DESC,t.event_id DESC LIMIT 1) l ON TRUE";
            List<Object> realArgs = new ArrayList<>(ids);
            realArgs.add(TimestampParser.sql(activeRealFrom));
            realArgs.add(TimestampParser.sql(to));
            try {
                jdbc.query(realSql, (rs, rowNum) -> {
                    Map<String, Object> event = readTelemetryRow(rs);
                    String plotId = Jsons.text(event, "plotId", "");
                    String metric = Jsons.text(event, "metric", "");
                    if (!plotId.isBlank() && !metric.isBlank()) {
                        result.computeIfAbsent(plotId, ignored -> new LinkedHashMap<>()).put(metric, event);
                    }
                    return event;
                }, realArgs.toArray());
            } catch (Exception ignored) {
                // The latest indexed sample is still a valid overview even if
                // the optional REAL-source arbitration query is unavailable.
            }

            String qualitySql = "SELECT p.plot_id,p.metric,COALESCE(recent.valid_samples,0) AS valid_samples FROM " + pairs
                    + " LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE sample.quality_status<>'BAD') AS valid_samples "
                    + "FROM (SELECT t.quality_status FROM telemetry t WHERE t.plot_id=p.plot_id "
                    + "AND t.metric=m.metric AND t.event_ts>=? AND t.event_ts<=? "
                    + "ORDER BY t.event_ts DESC,t.event_id DESC LIMIT 120) sample) recent ON TRUE";
            List<Object> qualityArgs = new ArrayList<>(ids);
            qualityArgs.add(TimestampParser.sql(qualityFrom));
            qualityArgs.add(TimestampParser.sql(to));
            try {
                jdbc.query(qualitySql, (rs, rowNum) -> {
                    String plotId = rs.getString("plot_id");
                    String metric = rs.getString("metric");
                    Map<String, Object> event = result.getOrDefault(plotId, Map.of()).get(metric);
                    if (event != null) event.put("_validSamples", rs.getLong("valid_samples"));
                    return event;
                }, qualityArgs.toArray());
            } catch (Exception ignored) {
                // Completeness is advisory; retain the latest values and use
                // a zero count when the optional quality window is unavailable.
            }
            result.values().forEach(byMetric -> byMetric.values().forEach(event -> event.putIfAbsent("_validSamples", 0L)));
            return result;
        } catch (Exception ignored) { return null; }
    }

    Map<String, Map<String, Object>> latestMetricWindow(String plotId, Instant latestFrom, Instant to,
                                                        Instant activeRealFrom, Instant qualityFrom) {
        Map<String, Map<String, Map<String, Object>>> windows = latestMetricWindows(
                List.of(plotId), latestFrom, to, activeRealFrom, qualityFrom);
        if (windows == null) return null;
        return windows.getOrDefault(plotId, new LinkedHashMap<>());
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
