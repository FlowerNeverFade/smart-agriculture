package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * In-process telemetry simulator. Live samples are ingested directly and never published to MQTT.
 */
@Component
class SimulationEngine {
    static final double DEFAULT_TIME_SCALE = 144.0;
    static final int DEFAULT_SAMPLE_INTERVAL_SECONDS = 20;
    static final int MIN_SAMPLE_INTERVAL_SECONDS = 5;
    static final int MAX_SAMPLE_INTERVAL_SECONDS = 60;
    static final double MIN_TIME_SCALE = 1.0;
    static final double MAX_TIME_SCALE = 288.0;
    static final double SOIL_WATER_LITRES_PER_POINT_PER_M2 = 0.08;
    static final double DEFAULT_PLOT_AREA_M2 = 80.0;
    static final double RESERVOIR_CAPACITY_LITRES = 900.0;
    static final String ENGINE_RECORD_ID = "simulator-engine";
    static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final Logger log = LoggerFactory.getLogger(SimulationEngine.class);
    private static final int RNG_SEED = 42;
    private static final List<MetricSpec> METRICS = List.of(
            new MetricSpec("SOIL_MOISTURE", "%", 0, 100),
            new MetricSpec("AIR_TEMPERATURE", "°C", -40, 80),
            new MetricSpec("AIR_HUMIDITY", "%RH", 0, 100),
            new MetricSpec("LIGHT", "lux", 0, 100000),
            new MetricSpec("CO2", "ppm", 0, 10000),
            new MetricSpec("PH", "pH", 0, 14),
            new MetricSpec("WATER_LEVEL", "%", 0, 100),
            new MetricSpec("RAINFALL", "mm/h", 0, 250),
            new MetricSpec("NITROGEN", "mg/kg", 0, 300),
            new MetricSpec("PHOSPHORUS", "mg/kg", 0, 200),
            new MetricSpec("POTASSIUM", "mg/kg", 0, 400)
    );
    private static final Map<String, String> SCENARIO_ALIASES = Map.ofEntries(
            Map.entry("normal", "normal"),
            Map.entry("drought", "drought"),
            Map.entry("heavy-rain", "heavy-rain"),
            Map.entry("heavy_rain", "heavy-rain"),
            Map.entry("storm", "heavy-rain"),
            Map.entry("sensor-drift", "sensor-drift"),
            Map.entry("sensor_drift", "sensor-drift"),
            Map.entry("device-offline", "device-offline"),
            Map.entry("device_offline", "device-offline"),
            Map.entry("offline", "device-offline"),
            Map.entry("heat-wave", "heat-wave"),
            Map.entry("gradual-drydown", "gradual-drydown"),
            Map.entry("forecast-miss", "forecast-miss"),
            Map.entry("limited-water", "limited-water"),
            Map.entry("repeated-case", "repeated-case"),
            Map.entry("cost-shift", "cost-shift")
    );
    private static final Map<String, Map<String, Double>> SCENARIO_DEFAULTS = Map.of(
            "normal", Map.of("volatility", 1.25, "timeScale", DEFAULT_TIME_SCALE, "temperatureBias", 0.0,
                    "humidityBias", 0.0, "rainfallRate", 0.2, "soilMoistureTrendPerHour", -0.12,
                    "driftRatePerHour", 0.0, "offlineRatio", 0.0),
            "drought", Map.of("volatility", 1.75, "timeScale", DEFAULT_TIME_SCALE, "temperatureBias", 7.0,
                    "humidityBias", -20.0, "rainfallRate", 0.0, "soilMoistureTrendPerHour", -0.45,
                    "driftRatePerHour", 0.0, "offlineRatio", 0.0),
            "heavy-rain", Map.of("volatility", 1.9, "timeScale", DEFAULT_TIME_SCALE, "temperatureBias", -4.5,
                    "humidityBias", 20.0, "rainfallRate", 4.0, "soilMoistureTrendPerHour", 0.5,
                    "driftRatePerHour", 0.0, "offlineRatio", 0.0),
            "sensor-drift", Map.of("volatility", 1.45, "timeScale", DEFAULT_TIME_SCALE, "temperatureBias", 0.0,
                    "humidityBias", 0.0, "rainfallRate", 0.2, "soilMoistureTrendPerHour", -0.12,
                    "driftRatePerHour", 0.08, "offlineRatio", 0.0),
            "device-offline", Map.of("volatility", 1.3, "timeScale", DEFAULT_TIME_SCALE, "temperatureBias", 0.0,
                    "humidityBias", 0.0, "rainfallRate", 0.2, "soilMoistureTrendPerHour", -0.12,
                    "driftRatePerHour", 0.0, "offlineRatio", 0.55)
    );
    private static final Map<String, double[]> PARAMETER_LIMITS = Map.of(
            "volatility", new double[]{0.2, 3.0},
            "timeScale", new double[]{MIN_TIME_SCALE, MAX_TIME_SCALE},
            "temperatureBias", new double[]{-15, 15},
            "humidityBias", new double[]{-40, 40},
            "rainfallRate", new double[]{0, 120},
            "soilMoistureTrendPerHour", new double[]{-12, 12},
            "driftRatePerHour", new double[]{0, 10},
            "offlineRatio", new double[]{0, 1}
    );

    private final AgriStore store;
    private final ObjectMapper mapper;
    private final AgriProperties properties;
    private final AgriEngine engine;
    private final Environment environment;
    private final Object lock = new Object();
    private final Map<String, PlotState> states = new ConcurrentHashMap<>();
    private final Map<String, String> configSignatures = new ConcurrentHashMap<>();
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicLong eventsEmitted = new AtomicLong();
    private final AtomicInteger tickIndex = new AtomicInteger();
    private final AtomicLong lastTickMillis = new AtomicLong();
    private volatile int sampleIntervalSeconds = DEFAULT_SAMPLE_INTERVAL_SECONDS;
    private volatile double timeScale = DEFAULT_TIME_SCALE;
    private volatile Instant updatedAt = Instant.EPOCH;
    private volatile Instant startedAt;
    private volatile Instant wallOrigin;
    private volatile Instant simOrigin;
    private volatile String runId = "in-process";
    private Random rng = new Random(RNG_SEED);
    private ScheduledExecutorService scheduler;
    private ScheduledFuture<?> loop;

    SimulationEngine(AgriStore store, ObjectMapper mapper, AgriProperties properties,
                     @Lazy AgriEngine engine, Environment environment) {
        this.store = store;
        this.mapper = mapper;
        this.properties = properties;
        this.engine = engine;
        this.environment = environment;
    }

    @PostConstruct
    void autoStart() {
        loadPersistedSettings();
        if (!properties.isSimulatorControlEnabled() || !properties.isSimulatorAutoStart()) return;
        if (Arrays.asList(environment.getActiveProfiles()).contains("test")) return;
        String mode = properties.getMode() == null ? "standalone" : properties.getMode();
        if ("standalone".equalsIgnoreCase(mode) || "simulation".equalsIgnoreCase(mode)) {
            start(true);
        }
    }

    @PreDestroy
    void shutdown() {
        stop();
        ScheduledExecutorService current = scheduler;
        if (current != null) current.shutdownNow();
    }

    Map<String, Object> status() {
        // Status fields are atomic or volatile. Do not wait for the simulation tick lock here:
        // one tick can ingest many plot metrics and may legitimately run longer than the UI timeout.
        Map<String, Object> response = snapshot();
        response.put("available", properties.isSimulatorControlEnabled());
        if (!properties.isSimulatorControlEnabled()) {
            response.put("status", "UNAVAILABLE");
            response.put("reason", "SIMULATOR_CONTROL_DISABLED");
            response.put("running", false);
        }
        return response;
    }

    Map<String, Object> start() {
        return start(true);
    }

    Map<String, Object> start(boolean schedule) {
        if (!properties.isSimulatorControlEnabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SIMULATOR_CONTROL_DISABLED", "服务器未启用模拟器控制");
        }
        synchronized (lock) {
            if (!running.get()) {
                running.set(true);
                startedAt = Instant.now();
                wallOrigin = startedAt;
                simOrigin = startedAt;
                runId = "in-process-" + startedAt.toEpochMilli();
                rng = new Random(RNG_SEED);
                ensureScheduler();
                if (schedule) {
                    tickOnceLocked();
                    scheduleLoopLocked();
                }
                persistLocked();
            }
            Map<String, Object> response = snapshot();
            response.put("action", "START");
            response.put("message", "进程内模拟器已启动");
            return response;
        }
    }

    Map<String, Object> stop() {
        if (!properties.isSimulatorControlEnabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SIMULATOR_CONTROL_DISABLED", "服务器未启用模拟器控制");
        }
        synchronized (lock) {
            running.set(false);
            if (loop != null) {
                loop.cancel(false);
                loop = null;
            }
            persistLocked();
            Map<String, Object> response = snapshot();
            response.put("action", "STOP");
            response.put("message", "进程内模拟器已停止");
            return response;
        }
    }

    Map<String, Object> updateSettings(Map<String, Object> input) {
        if (!properties.isSimulatorControlEnabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SIMULATOR_CONTROL_DISABLED", "服务器未启用模拟器控制");
        }
        synchronized (lock) {
            boolean intervalChanged = false;
            if (input != null && input.containsKey("sampleIntervalSeconds")) {
                int next = (int) Math.round(Jsons.number(input, "sampleIntervalSeconds", sampleIntervalSeconds));
                int bounded = (int) Math.round(clamp(next, MIN_SAMPLE_INTERVAL_SECONDS, MAX_SAMPLE_INTERVAL_SECONDS));
                intervalChanged = bounded != sampleIntervalSeconds;
                sampleIntervalSeconds = bounded;
            }
            if (input != null && input.containsKey("timeScale")) {
                double next = Jsons.number(input, "timeScale", timeScale);
                timeScale = normalizeTimeScale(clamp(next, MIN_TIME_SCALE, MAX_TIME_SCALE));
                engine.applyGlobalSimulationTimeScale(timeScale);
            }
            updatedAt = Instant.now();
            if (running.get() && intervalChanged) scheduleLoopLocked();
            persistLocked();
            Map<String, Object> response = snapshot();
            response.put("action", "SETTINGS");
            response.put("message", "模拟器采样间隔与时间流速已更新");
            return response;
        }
    }

    /** Apply delivered water to the in-memory plot state without ingesting a second time. */
    void applyIrrigation(String plotId, double waterLitre, double areaM2) {
        if (plotId == null || plotId.isBlank()) return;
        synchronized (lock) {
            PlotState state = states.computeIfAbsent(plotId, id -> initialState(id, rng));
            state.soil = clamp(state.soil + irrigationMoistureDelta(waterLitre, areaM2), 4, 92);
            state.water = clamp(state.water - Math.max(0, waterLitre) / RESERVOIR_CAPACITY_LITRES * 100.0, 0, 100);
        }
    }

    /** Snap engine state to the latest observed values before applying irrigation. */
    void syncPlotMetrics(String plotId, double soil, double waterLevel) {
        if (plotId == null || plotId.isBlank()) return;
        synchronized (lock) {
            PlotState state = states.computeIfAbsent(plotId, id -> initialState(id, rng));
            if (Double.isFinite(soil)) state.soil = clamp(soil, 4, 92);
            if (Double.isFinite(waterLevel)) state.water = clamp(waterLevel, 0, 100);
        }
    }

    void tickOnce() {
        synchronized (lock) {
            tickOnceLocked();
        }
    }

    int currentSampleIntervalSeconds() {
        return sampleIntervalSeconds;
    }

    double currentTimeScale() {
        return timeScale;
    }

    long eventsEmitted() {
        return eventsEmitted.get();
    }

    PlotState plotState(String plotId) {
        synchronized (lock) {
            PlotState state = states.get(plotId);
            return state == null ? null : state.copy();
        }
    }

    static double irrigationMoistureDelta(double waterLitre, double areaM2) {
        double area = Math.max(1.0, areaM2 <= 0 ? DEFAULT_PLOT_AREA_M2 : areaM2);
        return Math.max(0, waterLitre) / (area * SOIL_WATER_LITRES_PER_POINT_PER_M2);
    }

    static String normalizeScenario(String value) {
        String key = String.valueOf(value == null ? "normal" : value).trim().toLowerCase(Locale.ROOT).replace(' ', '-').replace('_', '-');
        if ("heavyrain".equals(key)) key = "heavy-rain";
        if ("sensordrift".equals(key)) key = "sensor-drift";
        if ("deviceoffline".equals(key)) key = "device-offline";
        return SCENARIO_ALIASES.getOrDefault(key, SCENARIO_DEFAULTS.containsKey(key) ? key : "normal");
    }

    static Map<String, Double> scenarioParameters(String scenario, Map<String, Object> supplied) {
        String normalized = normalizeScenario(scenario);
        Map<String, Double> defaults = SCENARIO_DEFAULTS.getOrDefault(normalized, SCENARIO_DEFAULTS.get("normal"));
        Map<String, Double> result = new LinkedHashMap<>();
        for (Map.Entry<String, double[]> entry : PARAMETER_LIMITS.entrySet()) {
            String key = entry.getKey();
            double[] range = entry.getValue();
            double fallback = defaults.getOrDefault(key, SCENARIO_DEFAULTS.get("normal").getOrDefault(key, 0.0));
            double value = supplied == null || !supplied.containsKey(key) ? fallback : Jsons.numberValue(supplied.get(key), fallback);
            result.put(key, clamp(value, range[0], range[1]));
        }
        if (Math.abs(result.get("timeScale") - 1.0) < 1e-9) result.put("timeScale", DEFAULT_TIME_SCALE);
        return result;
    }

    static PlotState initialState(String plotId, Random rng) {
        Map<String, Double> offsets = Map.of("plot-a01", 0.0, "plot-a02", 1.0, "plot-b01", -0.8);
        double offset = offsets.getOrDefault(plotId, 0.0);
        PlotState state = new PlotState();
        state.soil = 35.0 + offset + uniform(rng, -1.0, 1.0);
        state.temperature = 24.0 + offset * 0.4;
        state.humidity = 69.0 - offset;
        state.co2 = 520.0 + uniform(rng, -20.0, 20.0);
        state.ph = 6.25 + uniform(rng, -0.06, 0.06);
        state.water = 78.0 + uniform(rng, -2.0, 2.0);
        state.scenarioSteps = 0;
        return state;
    }

    static void evolveState(PlotState state, Random rng, String scenario, ZonedDateTime ts, int index,
                            Map<String, Double> parameters, double stepSeconds) {
        evolveState(state, rng, scenario, ts, index, parameters, stepSeconds, PlotFacility.OPEN_FIELD);
    }

    static void evolveState(PlotState state, Random rng, String scenario, ZonedDateTime ts, int index,
                            Map<String, Double> parameters, double stepSeconds, String facilityType) {
        String normalized = normalizeScenario(scenario);
        Map<String, Double> params = parameters != null ? parameters : scenarioParameters(normalized, null);
        double volatility = params.get("volatility");
        double simulatedHours = Math.max(0.1, stepSeconds) * params.get("timeScale") / 3600.0;
        double daylight = daylightFraction(ts);
        double climateResponse = PlotFacility.climateResponse(facilityType);
        double heatOffset = ("heat-wave".equals(normalized) ? 7.0 : params.get("temperatureBias")) * climateResponse;
        double temperatureTarget = 20.5 + 8.0 * daylight + heatOffset;
        double humidityTarget = 82.0 - 30.0 * daylight + params.get("humidityBias") * climateResponse;
        double relax = Math.min(1.0, 1.0 - Math.exp(-simulatedHours / 2.4));
        state.temperature += (temperatureTarget - state.temperature) * relax + uniform(rng, -0.08, 0.08) * volatility * simulatedHours;
        state.temperature = clamp(state.temperature, -20, 55);
        state.humidity += (humidityTarget - state.humidity) * relax + uniform(rng, -0.18, 0.18) * volatility * simulatedHours;
        state.humidity = clamp(state.humidity, 10, 99.5);
        double legacySoilRate = "gradual-drydown".equals(normalized) ? -0.35 : "limited-water".equals(normalized) ? -0.22 : 0.0;
        double soilResponse = PlotFacility.soilTrendResponse(facilityType, normalized);
        double soilRate = (params.get("soilMoistureTrendPerHour") + legacySoilRate) * soilResponse * simulatedHours;
        double rainAbsorption = Math.min(params.get("rainfallRate"), 20.0) * PlotFacility.rainExposure(facilityType) * simulatedHours * 0.025;
        state.soil += soilRate + rainAbsorption + uniform(rng, -0.12, 0.12) * volatility * simulatedHours;
        state.soil = clamp(state.soil, 4, 92);
        double co2Target = 430.0 + 180.0 * (1.0 - daylight);
        state.co2 += (co2Target - state.co2) * Math.min(1.0, 0.35 * simulatedHours) + uniform(rng, -2.0, 2.0) * volatility * simulatedHours;
        state.co2 = clamp(state.co2, 300, 1400);
        state.ph += (6.25 - state.ph) * Math.min(1.0, 0.08 * simulatedHours) + uniform(rng, -0.01, 0.01) * volatility * simulatedHours;
        double waterRate = ("limited-water".equals(normalized) ? -0.3 : "heavy-rain".equals(normalized) ? 0.8 : -0.05) * simulatedHours;
        state.water = clamp(state.water + waterRate + uniform(rng, -0.04, 0.04) * volatility * simulatedHours, 8, 100);
        state.scenarioSteps += 1;
    }

    static double metricValue(PlotState state, Random rng, String scenario, String metric, ZonedDateTime ts,
                              int index, Map<String, Double> parameters, double stepSeconds) {
        return metricValue(state, rng, scenario, metric, ts, index, parameters, stepSeconds, PlotFacility.OPEN_FIELD);
    }

    static double metricValue(PlotState state, Random rng, String scenario, String metric, ZonedDateTime ts,
                              int index, Map<String, Double> parameters, double stepSeconds, String facilityType) {
        String normalized = normalizeScenario(scenario);
        Map<String, Double> params = parameters != null ? parameters : scenarioParameters(normalized, null);
        double volatility = params.get("volatility");
        double simulatedHours = state.scenarioSteps * Math.max(0.1, stepSeconds) * params.get("timeScale") / 3600.0;
        double value;
        switch (metric) {
            case "SOIL_MOISTURE" -> {
                value = state.soil;
                if ("sensor-drift".equals(normalized)) {
                    value += params.get("driftRatePerHour") * simulatedHours + Math.sin(index / 2.0) * 0.8;
                }
            }
            case "AIR_TEMPERATURE" -> value = state.temperature;
            case "AIR_HUMIDITY" -> value = state.humidity;
            case "LIGHT" -> {
                double cloud = "heavy-rain".equals(normalized) ? 0.35 : "drought".equals(normalized) ? 1.12 : 1.0;
                value = 45.0 + daylightFraction(ts) * 47_000.0 * cloud * PlotFacility.lightTransmission(facilityType);
            }
            case "CO2" -> value = state.co2;
            case "PH" -> {
                value = state.ph;
                if ("sensor-drift".equals(normalized)) {
                    value += params.get("driftRatePerHour") * simulatedHours * 0.035;
                }
            }
            case "WATER_LEVEL" -> value = state.water;
            case "NITROGEN" -> value = 120.0 + Math.sin(index / 5.5) * 10.0 + Math.cos(simulatedHours / 9.0) * 6.0;
            case "PHOSPHORUS" -> value = 45.0 + Math.sin(index / 7.0 + 1.2) * 5.0 + Math.cos(simulatedHours / 14.0) * 3.0;
            case "POTASSIUM" -> value = 180.0 + Math.sin(index / 6.0 + 2.4) * 12.0 + Math.cos(simulatedHours / 11.0) * 7.0;
            default -> {
                double rainfall = params.get("rainfallRate");
                if ("heavy-rain".equals(normalized)) {
                    rainfall *= 0.78 + 0.28 * Math.sin(index / 2.4) + uniform(rng, -0.12, 0.18) * volatility;
                } else if (rainfall > 0) {
                    rainfall *= Math.max(0.0, 0.25 + Math.sin(index / 5.0) * 0.18 + uniform(rng, -0.2, 0.2));
                }
                value = Math.max(0.0, rainfall);
            }
        }
        double noise = switch (metric) {
            case "LIGHT" -> 680.0;
            case "PH" -> 0.02;
            case "AIR_HUMIDITY" -> 0.35;
            case "AIR_TEMPERATURE" -> 0.16;
            case "SOIL_MOISTURE" -> 0.12;
            case "CO2" -> 5.0;
            case "WATER_LEVEL" -> 0.16;
            case "NITROGEN" -> 2.4;
            case "PHOSPHORUS" -> 1.2;
            case "POTASSIUM" -> 3.0;
            case "RAINFALL" -> 0.7;
            default -> 0.08;
        } * volatility;
        MetricSpec spec = METRICS.stream().filter(item -> item.code.equals(metric)).findFirst()
                .orElse(new MetricSpec(metric, "", 0, 100000));
        return clamp(value + uniform(rng, -noise, noise), spec.low, spec.high);
    }

    static double daylightFraction(ZonedDateTime ts) {
        double hour = ts.getHour() + ts.getMinute() / 60.0;
        if (hour <= 5.5 || hour >= 19.5) return 0.0;
        double phase = (hour - 5.5) / 14.0;
        return Math.max(0.0, Math.min(1.0, Math.sin(Math.PI * phase)));
    }

    static double normalizeTimeScale(double value) {
        return Math.abs(value - 1.0) < 1e-9 ? DEFAULT_TIME_SCALE : value;
    }

    static double clamp(double value, double low, double high) {
        return Math.max(low, Math.min(high, value));
    }

    private void tickOnceLocked() {
        Instant wallNow = Instant.now();
        Instant origin = wallOrigin == null ? wallNow : wallOrigin;
        Instant simBase = simOrigin == null ? wallNow : simOrigin;
        int index = tickIndex.getAndIncrement();
        int interval = Math.max(MIN_SAMPLE_INTERVAL_SECONDS, sampleIntervalSeconds);
        long emitted = 0;
        for (Map<String, Object> plot : activePlots()) {
            String plotId = Jsons.text(plot, "plotId", "");
            if (plotId.isBlank()) continue;
            String facilityType = PlotFacility.forPlot(plot);
            Map<String, Object> simulation = engine.plotSimulationRecord(plotId);
            if (!Jsons.bool(simulation, "enabled", true)) continue;
            if (mockDeviceControlledOffline(plotId)) continue;
            // A successful administrator ONLINE command is a deliberate
            // override of the DEVICE_OFFLINE scenario. Keep producing the
            // virtual readings so the device can recover instead of being
            // overwritten by the next scenario tick.
            boolean manualOnlineOverride = mockDeviceManuallyOnline(plotId);
            String scenario = normalizeScenario(Jsons.text(simulation, "scenario", "NORMAL"));
            Map<String, Object> rawParams = Jsons.map(mapper, simulation.get("parameters"));
            Map<String, Double> params = scenarioParameters(scenario, rawParams);
            boolean explicit = Jsons.bool(simulation, "timeScaleExplicit", false);
            double plotScale = explicit ? clamp(Jsons.number(rawParams, "timeScale", timeScale), MIN_TIME_SCALE, MAX_TIME_SCALE)
                    : timeScale;
            if (!explicit) plotScale = normalizeTimeScale(plotScale);
            else if (Math.abs(plotScale - 1.0) < 1e-9) plotScale = 1.0;
            params.put("timeScale", plotScale);
            int revision = (int) Jsons.whole(simulation, "revision", 1);
            String signature = scenario + "|" + revision + "|" + facilityType + "|" + params.get("volatility") + "|" + params.get("soilMoistureTrendPerHour")
                    + "|" + params.get("rainfallRate") + "|" + params.get("driftRatePerHour");
            if (!signature.equals(configSignatures.get(plotId)) || !states.containsKey(plotId)) {
                PlotState created = initialState(plotId, rng);
                if ("drought".equals(scenario)) {
                    double soilResponse = PlotFacility.soilTrendResponse(facilityType, scenario);
                    double climateResponse = PlotFacility.climateResponse(facilityType);
                    created.soil = Math.min(created.soil, 35.0 - 8.0 * soilResponse);
                    created.temperature += (31.0 - created.temperature) * climateResponse;
                    created.humidity += (43.0 - created.humidity) * climateResponse;
                } else if ("heavy-rain".equals(scenario)) {
                    double exposure = PlotFacility.rainExposure(facilityType);
                    double climateResponse = PlotFacility.climateResponse(facilityType);
                    created.soil = Math.max(created.soil, 35.0 + 21.0 * exposure);
                    created.temperature += (20.5 - created.temperature) * climateResponse;
                    created.humidity += (90.0 - created.humidity) * climateResponse;
                    created.water = 90.0;
                }
                states.put(plotId, created);
                configSignatures.put(plotId, signature);
            }
            PlotState state = states.get(plotId);
            double elapsedWall = Math.max(0, Duration.between(origin, wallNow).toMillis()) / 1000.0;
            ZonedDateTime physicsTs = simBase.plusMillis(Math.round(elapsedWall * plotScale * 1000.0)).atZone(ZONE);
            double offlineRatio = "device-offline".equals(scenario) ? params.get("offlineRatio") : 0.0;
            int phase = (index + plotId.chars().sum()) % 20;
            boolean scenarioOffline = !manualOnlineOverride && offlineRatio > 0
                    && phase < Math.max(1, (int) Math.round(offlineRatio * 20));
            if (!scenarioOffline) {
                evolveState(state, rng, scenario, physicsTs, index, params, interval, facilityType);
            }
            String farmId = Jsons.text(plot, "farmId", "farm-demo");
            String deviceId = "mock-" + plotId;
            if (scenarioOffline) {
                publishDeviceStatus(deviceId, farmId, plotId, "OFFLINE", scenario, revision, wallNow);
                continue;
            }
            for (MetricSpec metric : METRICS) {
                Map<String, Object> event = buildEvent(state, rng, scenario, plotId, farmId, deviceId, metric, index,
                        physicsTs, wallNow, params, interval, revision, facilityType);
                try {
                    engine.ingest(event);
                    emitted += 1;
                } catch (RuntimeException error) {
                    log.warn("simulator ingest failed plot={} metric={}: {}", plotId, metric.code, error.getMessage());
                }
            }
            publishDeviceStatus(deviceId, farmId, plotId, "ONLINE", scenario, revision, wallNow);
        }
        eventsEmitted.addAndGet(emitted);
        lastTickMillis.set(wallNow.toEpochMilli());
        updatedAt = wallNow;
        persistLocked();
    }

    private List<Map<String, Object>> activePlots() {
        List<Map<String, Object>> plots = new ArrayList<>();
        for (Map<String, Object> plot : store.list("plot")) {
            if (!"ACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE"))) continue;
            plots.add(plot);
        }
        return plots;
    }

    private boolean mockDeviceControlledOffline(String plotId) {
        Map<String, Object> device = store.find("device", "mock-" + plotId);
        if (device == null || device.isEmpty()) return false;
        String controlStatus = Jsons.text(device, "controlStatus", "").toUpperCase(Locale.ROOT);
        String desired = Jsons.text(device, "desiredStatus", "").toUpperCase(Locale.ROOT);
        String override = Jsons.text(device, "manualStatusOverride", "").toUpperCase(Locale.ROOT);
        return "OFFLINE".equals(override)
                || ("SUCCEEDED".equals(controlStatus) && "OFFLINE".equals(desired));
    }

    private boolean mockDeviceManuallyOnline(String plotId) {
        Map<String, Object> device = store.find("device", "mock-" + plotId);
        if (device == null || device.isEmpty()) return false;
        String source = Jsons.text(device, "sourceMode", Jsons.text(device, "dataOrigin", ""))
                .toUpperCase(Locale.ROOT);
        String deviceId = Jsons.text(device, "deviceId", "").toLowerCase(Locale.ROOT);
        if (!("SIMULATION".equals(source) || "SIMULATED".equals(source) || deviceId.startsWith("mock-"))) return false;
        String override = Jsons.text(device, "manualStatusOverride", "").toUpperCase(Locale.ROOT);
        if ("ONLINE".equals(override)) return true;
        // Commands created before manualStatusOverride was introduced still
        // carry the durable command fields, so they must remain recoverable.
        return "SUCCEEDED".equals(Jsons.text(device, "controlStatus", "").toUpperCase(Locale.ROOT))
                && "ONLINE".equals(Jsons.text(device, "desiredStatus", "").toUpperCase(Locale.ROOT))
                && !Jsons.text(device, "lastControlCommandId", "").isBlank();
    }

    private Map<String, Object> buildEvent(PlotState state, Random rng, String scenario, String plotId, String farmId,
                                           String deviceId, MetricSpec metric, int index, ZonedDateTime physicsTs,
                                           Instant wallNow, Map<String, Double> params, double stepSeconds, int revision,
                                           String facilityType) {
        double value = metricValue(state, rng, scenario, metric.code, physicsTs, index, params, stepSeconds, facilityType);
        String qualityStatus = "GOOD";
        double confidence = 0.98;
        if ("sensor-drift".equals(scenario) && Set.of("SOIL_MOISTURE", "PH").contains(metric.code)) {
            qualityStatus = index % 4 == 0 ? "BAD" : "DEGRADED";
            confidence = "BAD".equals(qualityStatus) ? 0.2 : 0.55;
        }
        if ("device-offline".equals(scenario) && index >= 15) {
            qualityStatus = "BAD";
            confidence = 0.1;
        }
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", runId + "-" + revision + "-MAIN-" + plotId + "-" + metric.code + "-" + String.format("%09d", index));
        event.put("farmId", farmId);
        event.put("plotId", plotId);
        event.put("deviceId", deviceId);
        event.put("metric", metric.code);
        event.put("value", Math.round(value * 1000.0) / 1000.0);
        event.put("unit", metric.unit);
        event.put("ts", wallNow.toString());
        event.put("quality", Map.of("status", qualityStatus, "freshnessMs", 200, "confidence", confidence));
        event.put("scenarioId", scenario);
        event.put("branchId", "MAIN");
        event.put("sourceMode", "SIMULATION");
        event.put("provenance", "OBSERVED");
        event.put("dataOrigin", "SIMULATOR");
        event.put("schemaVersion", "1.0");
        event.put("simulationRunId", runId);
        event.put("simulationRevision", revision);
        event.put("facilityType", facilityType);
        event.put("facilityLabel", PlotFacility.label(facilityType));
        return event;
    }

    private void publishDeviceStatus(String deviceId, String farmId, String plotId, String status, String scenario,
                                     int revision, Instant wallNow) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("deviceId", deviceId);
        payload.put("farmId", farmId);
        payload.put("plotId", plotId);
        payload.put("status", status);
        payload.put("lastSeen", wallNow.toString());
        payload.put("sourceMode", "SIMULATION");
        payload.put("dataOrigin", "SIMULATOR");
        payload.put("provenance", "OBSERVED");
        payload.put("scenarioId", scenario);
        payload.put("simulationRunId", runId);
        payload.put("simulationRevision", revision);
        payload.put("bindingState", "BOUND");
        payload.put("type", "ENVIRONMENTAL_SENSOR");
        try {
            engine.ingestDeviceStatus(payload);
        } catch (RuntimeException error) {
            log.warn("simulator device status failed {}: {}", deviceId, error.getMessage());
        }
    }

    private void scheduleLoopLocked() {
        ensureScheduler();
        if (loop != null) loop.cancel(false);
        int interval = Math.max(MIN_SAMPLE_INTERVAL_SECONDS, sampleIntervalSeconds);
        loop = scheduler.scheduleAtFixedRate(() -> {
            try {
                if (running.get()) tickOnce();
            } catch (RuntimeException error) {
                log.warn("simulator tick failed: {}", error.getMessage());
            }
        }, interval, interval, TimeUnit.SECONDS);
    }

    private void ensureScheduler() {
        if (scheduler == null || scheduler.isShutdown()) {
            scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
                Thread thread = new Thread(runnable, "agriloop-simulation-engine");
                thread.setDaemon(true);
                return thread;
            });
        }
    }

    private void loadPersistedSettings() {
        Map<String, Object> persisted = store.find("config", ENGINE_RECORD_ID);
        if (persisted == null || persisted.isEmpty()) return;
        sampleIntervalSeconds = (int) Math.round(clamp(Jsons.number(persisted, "sampleIntervalSeconds", DEFAULT_SAMPLE_INTERVAL_SECONDS),
                MIN_SAMPLE_INTERVAL_SECONDS, MAX_SAMPLE_INTERVAL_SECONDS));
        timeScale = normalizeTimeScale(clamp(Jsons.number(persisted, "timeScale", DEFAULT_TIME_SCALE), MIN_TIME_SCALE, MAX_TIME_SCALE));
        eventsEmitted.set(Jsons.whole(persisted, "eventsEmitted", 0));
        String updated = Jsons.text(persisted, "updatedAt", "");
        if (!updated.isBlank()) {
            try { updatedAt = Instant.parse(updated); } catch (RuntimeException ignored) { }
        }
    }

    private void persistLocked() {
        Map<String, Object> record = snapshot();
        store.save("config", ENGINE_RECORD_ID, record);
    }

    private Map<String, Object> snapshot() {
        Map<String, Object> response = new LinkedHashMap<>();
        boolean isRunning = running.get();
        response.put("available", true);
        response.put("status", isRunning ? "RUNNING" : "STOPPED");
        response.put("running", isRunning);
        response.put("program", "in-process");
        response.put("pid", "api");
        response.put("sampleIntervalSeconds", sampleIntervalSeconds);
        response.put("timeScale", timeScale);
        response.put("eventsEmitted", eventsEmitted.get());
        response.put("updatedAt", (updatedAt == null ? Instant.now() : updatedAt).toString());
        if (startedAt != null) response.put("startedAt", startedAt.toString());
        if (lastTickMillis.get() > 0) response.put("lastTickAt", Instant.ofEpochMilli(lastTickMillis.get()).toString());
        response.put("runId", runId);
        return response;
    }

    private static double uniform(Random rng, double low, double high) {
        return low + (high - low) * rng.nextDouble();
    }

    static final class PlotState {
        double soil;
        double temperature;
        double humidity;
        double co2;
        double ph;
        double water;
        double scenarioSteps;

        PlotState copy() {
            PlotState copy = new PlotState();
            copy.soil = soil;
            copy.temperature = temperature;
            copy.humidity = humidity;
            copy.co2 = co2;
            copy.ph = ph;
            copy.water = water;
            copy.scenarioSteps = scenarioSteps;
            return copy;
        }
    }

    private record MetricSpec(String code, String unit, double low, double high) { }
}
