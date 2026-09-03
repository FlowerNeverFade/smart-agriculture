package com.agriloop;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "agriloop")
class AgriProperties {
    private String mode = "standalone";
    /** Prefer the configured OpenAI-compatible model; rules remain an explicit fallback. */
    private String aiMode = "openai-compatible";
    /** OpenAI-compatible endpoint used by the optional Qwen/vLLM adapter. */
    private String llmBaseUrl = "http://127.0.0.1:8000/v1";
    private String llmModel = "Qwen3.8-27B";
    /** Optional base multimodal model used when a chat turn contains images. */
    private String llmVisionModel = "Qwen3.8-27B";
    private String llmApiKey = "";
    private long llmTimeoutMs = 30000;
    private int llmMaxTokens = 768;
    /**
     * Retained for configuration compatibility. The production chat path is
     * intentionally forced to direct generation regardless of an old .env
     * value; deterministic safety checks still run before and after the call.
     */
    private boolean llmEnableThinking = false;
    private boolean llmPreserveThinking = false;
    private String llmReasoningEffort = "none";
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
    private long maxLightingSeconds = 8 * 60 * 60;
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
    public long getMaxLightingSeconds() { return maxLightingSeconds; }
    public void setMaxLightingSeconds(long maxLightingSeconds) { this.maxLightingSeconds = maxLightingSeconds; }
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
