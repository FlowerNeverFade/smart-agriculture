package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Map;
import java.util.List;
import java.util.Set;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
class AgriApplicationTest {
    @Autowired AgriEngine engine;
    @Autowired AgriStore store;
    @Autowired JwtService jwtService;
    @Autowired AgriController controller;
    @Autowired AdminManagementService adminManagement;
    @Autowired AgriEventBus eventBus;
    @Autowired SimulationEngine simulationEngine;
    @Autowired SimulatorControl simulatorControl;

    @AfterEach
    void stopInProcessSimulator() {
        if (simulationEngine == null) return;
        simulationEngine.stop();
        simulationEngine.updateSettings(Map.of("sampleIntervalSeconds", 20, "timeScale", 144));
        for (String plotId : List.of("plot-a01", "plot-a02", "plot-b01")) {
            store.deleteSimulatedTelemetryForPlot(plotId);
        }
    }

    @Test
    void legacyPlotAllowsPartialMetadataUpdate() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("*"));
        String plotId = "plot-legacy-partial-" + System.nanoTime();
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", "旧地块", "cropCode", "tomato", "areaM2", 80)));
        Map<String, Object> updated = adminManagement.updatePlot(plotId, Map.of("name", "旧地块（已改名）"), admin);
        assertThat(updated.get("name")).isEqualTo("旧地块（已改名）");
        store.delete("plot", plotId);
    }

    @Test
    void farmAdminCanCreateUpdateDeactivateRestoreAndSafelyDeletePlot() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        var authentication = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(admin, null, List.of());
        String plotId = "plot-lifecycle-" + System.nanoTime();
        Map<String, Object> created = responseData(controller.createPlot(new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId,
                "farmId", "farm-demo",
                "name", "测试番茄田",
                "cropCode", "tomato",
                "cropName", "番茄",
                "cropVariety", "千禧番茄",
                "stageCode", "vegetative",
                "stageLabel", "营养生长期",
                "growthCycleDays", 120,
                "areaM2", 88
        )), authentication));
        assertThat(created.get("plotId")).isEqualTo(plotId);
        assertThat(engine.canAccessPlot(admin, plotId)).isTrue();

        Map<String, Object> updated = responseData(controller.updatePlot(plotId, Map.of(
                "cropCode", "cucumber",
                "cropName", "黄瓜",
                "cropVariety", "水果黄瓜",
                "stageCode", "flowering",
                "stageLabel", "开花期",
                "growthCycleDays", 95
        ), authentication));
        assertThat(updated.get("cropCode")).isEqualTo("cucumber");
        assertThat(updated.get("growthCycleDays")).isEqualTo(95);

        Map<String, Object> inactive = responseData(controller.deactivatePlot(plotId, authentication));
        assertThat(inactive).containsEntry("status", "INACTIVE").containsKeys("deactivatedAt", "deactivatedBy");
        Map<String, Object> active = responseData(controller.restorePlot(plotId, authentication));
        assertThat(active).containsEntry("status", "ACTIVE").containsKeys("restoredAt", "restoredBy");
        responseData(controller.deactivatePlot(plotId, authentication));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.deletePlot(plotId, "错误名称", authentication))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("PLOT_CONFIRMATION_MISMATCH"));
        Map<String, Object> deleted = responseData(controller.deletePlot(plotId, "测试番茄田", authentication));
        assertThat(deleted.get("deleted")).isEqualTo(true);
        assertThat(store.find("plot", plotId)).isNull();
    }

    @Test
    void inactivePlotWithHistoryIsNotCascadeDeleted() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        String plotId = "plot-protected-" + System.nanoTime();
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", "保留历史测试田", "status", "INACTIVE")));
        String workId = "wo-" + plotId;
        store.save("work-order", workId, new java.util.LinkedHashMap<>(Map.of(
                "workOrderId", workId, "farmId", "farm-demo", "plotId", plotId, "status", "DONE")));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> adminManagement.deletePlot(plotId, "保留历史测试田", admin))
                .isInstanceOfSatisfying(ApiException.class, error -> {
                    assertThat(error.code).isEqualTo("PLOT_HAS_DEPENDENCIES");
                    assertThat(String.valueOf(error.details)).contains("work-order");
                });
        assertThat(store.find("plot", plotId)).isNotNull();
        assertThat(store.find("work-order", workId)).isNotNull();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> responseData(org.springframework.http.ResponseEntity<?> response) {
        return (Map<String, Object>) ((Map<String, Object>) response.getBody()).get("data");
    }

    @Test
    void seededLoginAndCropPacksWork() {
        Map<String, Object> login = engine.login("farmer", "demo123");
        assertThat(login).containsKey("accessToken");
        assertThat(engine.cropPacks()).hasSize(9);
        assertThat(new AgriProperties().getLlmMaxTokens()).isEqualTo(768);
    }

    @Test
    void accountRoleSelectionIsVerifiedAndAdminSelfRegistrationIsBlocked() {
        assertThat(RolePolicy.canonical("FIELD_OPERATOR")).isEqualTo("FARMER");
        assertThat(RolePolicy.canonical("operator")).isEqualTo("FARMER");
        Map<String, Object> farmerLogin = engine.login("farmer", "demo123", "FARMER");
        Map<String, Object> farmAdminLogin = engine.login("admin", "demo123", "FARM_ADMIN");
        Map<String, Object> systemAdminLogin = engine.login("sysadmin", "demo123", "SYSTEM_ADMIN");
        assertThat(farmerLogin).containsKey("accessToken");
        assertThat(farmAdminLogin).containsKey("accessToken");
        assertThat(systemAdminLogin).containsKey("accessToken");
        assertThat(((Map<?, ?>) farmerLogin.get("user")).get("role")).isEqualTo("FARMER");
        assertThat(((Map<?, ?>) farmAdminLogin.get("user")).get("role")).isEqualTo("FARM_ADMIN");
        assertThat(((Map<?, ?>) systemAdminLogin.get("user")).get("role")).isEqualTo("SYSTEM_ADMIN");
        assertThat(((Map<?, ?>) farmerLogin.get("user")).get("permissions").toString()).contains("irrigation:execute");
        assertThat(((Map<?, ?>) systemAdminLogin.get("user")).get("permissions").toString()).contains("platform:manage");

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.login("farmer", "demo123", "FARM_ADMIN"))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("AUTH_INVALID"));

        String username = "grower" + System.nanoTime();
        Map<String, Object> registration = engine.register(username, "FieldPass2026", "FARMER");
        assertThat(((Map<?, ?>) registration.get("user")).get("role")).isEqualTo("FARMER");
        assertThat(engine.login(username, "FieldPass2026", "FARMER")).containsKey("accessToken");

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.register("farmadmin" + System.nanoTime(), "AdminPass2026", "FARM_ADMIN"))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("ACCOUNT_ROLE_REQUIRES_ADMIN"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.register("admin" + System.nanoTime(), "AdminPass2026", "SYSTEM_ADMIN"))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("ACCOUNT_ROLE_REQUIRES_ADMIN"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.register("other" + System.nanoTime(), "OtherPass2026", "UNKNOWN"))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("ACCOUNT_ROLE_INVALID"));
    }

    @Test
    void accountRegistrationAndRecoveryRotateCredentials() {
        String username = "grower" + System.nanoTime();
        String firstPassword = "FieldPass2026";
        Map<String, Object> registration = engine.register(username, firstPassword);
        assertThat(registration).containsKeys("accessToken", "recoveryCode", "user");
        assertThat(((Map<?, ?>) registration.get("user")).get("role")).isEqualTo("FARMER");

        UserPrincipal original = jwtService.parse(String.valueOf(registration.get("accessToken")));
        assertThat(store.credentialVersionMatches(original.userId, original.credentialVersion)).isTrue();

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.register(username.toUpperCase(), firstPassword))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("ACCOUNT_EXISTS"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.resetPassword(username, "WRONG-CODE", "NextPass2027"))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("ACCOUNT_RECOVERY_INVALID"));

        Map<String, Object> reset = engine.resetPassword(username, String.valueOf(registration.get("recoveryCode")), "NextPass2027");
        assertThat(reset.get("recoveryCode")).isNotEqualTo(registration.get("recoveryCode"));
        assertThat(store.credentialVersionMatches(original.userId, original.credentialVersion)).isFalse();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.login(username, firstPassword))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("AUTH_INVALID"));
        assertThat(engine.login(username, "NextPass2027")).containsKey("accessToken");
    }

    @Test
    void accountValidationAndRecoveryThrottleAreEnforced() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.register("bad", "weak"))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("ACCOUNT_USERNAME_INVALID"));

        String username = "limited" + System.nanoTime();
        engine.register(username, "StrongPass2026");
        for (int attempt = 0; attempt < 5; attempt++) {
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.resetPassword(username, "WRONG-CODE", "NextPass2027"))
                    .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("ACCOUNT_RECOVERY_INVALID"));
        }
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.resetPassword(username, "WRONG-CODE", "NextPass2027"))
                .isInstanceOfSatisfying(ApiException.class, error -> {
                    assertThat(error.code).isEqualTo("ACCOUNT_RECOVERY_LOCKED");
                    assertThat(error.details).containsKey("retryAfterSeconds");
                });
    }

    @Test
    void duplicateTelemetryIsIdempotentAndDriftIsNotIrrigation() {
        Map<String, Object> event = Map.of("eventId", "test-event-1", "plotId", "plot-a01", "deviceId", "mock-plot-a01",
                "metric", "SOIL_MOISTURE", "value", 12.0, "unit", "%", "scenarioId", "sensor-drift", "ts", java.time.Instant.now().toString());
        Map<String, Object> first = engine.ingest(event);
        Map<String, Object> second = engine.ingest(event);
        assertThat(first.get("accepted")).isEqualTo(true);
        assertThat(second.get("duplicate")).isEqualTo(true);
        Map<String, Object> diagnosis = engine.diagnose("plot-a01", Map.of("scenarioId", "sensor-drift"));
        assertThat(diagnosis.get("primaryCause")).isEqualTo("SENSOR_DRIFT");
    }

    @Test
    void farmerVirtualIrrigationUpdatesSoilAndReservoirWithoutAdminWorkOrder() throws Exception {
        String suffix = String.valueOf(System.nanoTime());
        String plotId = "plot-virtual-water-" + suffix;
        String deviceId = "mock-" + plotId;
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", "虚拟灌溉测试田",
                "cropCode", "tomato", "stageCode", "vegetative", "areaM2", 80)));
        UserPrincipal farmer = new UserPrincipal("farmer-virtual-" + suffix, "farmer", "FARMER",
                List.of("farm-demo"), List.of(plotId));
        Instant observedAt = Instant.now();
        engine.ingest(Map.ofEntries(Map.entry("eventId", "virtual-soil-before-" + suffix), Map.entry("farmId", "farm-demo"),
                Map.entry("plotId", plotId), Map.entry("deviceId", deviceId), Map.entry("metric", "SOIL_MOISTURE"),
                Map.entry("value", 16.0), Map.entry("unit", "%"), Map.entry("ts", observedAt.toString()),
                Map.entry("sourceMode", "SIMULATION"), Map.entry("scenarioId", "drought"),
                Map.entry("quality", Map.of("status", "GOOD", "confidence", .99))));
        engine.ingest(Map.ofEntries(Map.entry("eventId", "virtual-water-before-" + suffix), Map.entry("farmId", "farm-demo"),
                Map.entry("plotId", plotId), Map.entry("deviceId", deviceId), Map.entry("metric", "WATER_LEVEL"),
                Map.entry("value", 82.0), Map.entry("unit", "%"), Map.entry("ts", observedAt.plusMillis(1).toString()),
                Map.entry("sourceMode", "SIMULATION"), Map.entry("scenarioId", "drought"),
                Map.entry("quality", Map.of("status", "GOOD", "confidence", .99))));

        Map<String, Object> plan = engine.irrigationPlan(Map.of("plotId", plotId, "traceId", "trace-" + suffix), farmer);
        assertThat(plan).containsEntry("readinessStatus", "READY").containsEntry("executable", true);
        Map<String, Object> command = engine.createCommand(Map.of(
                "plotId", plotId, "planId", plan.get("planId"), "idempotencyKey", "farmer-virtual-" + suffix,
                "approved", true, "executionMode", "FARMER_VIRTUAL", "source", "farmer-irrigation-system"), farmer);
        assertThat(command).containsEntry("confirmationMode", "OPERATOR_CONFIRMED");

        String commandId = String.valueOf(command.get("commandId"));
        Map<String, Object> completed = command;
        for (int attempt = 0; attempt < 30 && !"SUCCEEDED".equals(completed.get("status")); attempt++) {
            Thread.sleep(100);
            completed = engine.commandById(commandId, farmer);
        }
        assertThat(completed).containsEntry("status", "SUCCEEDED");
        Map<String, Object> evaluation = engine.commandEvaluation(commandId, farmer);
        for (int attempt = 0; attempt < 30 && !"COMPLETED".equals(evaluation.get("status")); attempt++) {
            Thread.sleep(100);
            evaluation = engine.commandEvaluation(commandId, farmer);
        }
        assertThat(evaluation).containsEntry("status", "COMPLETED");
        Map<String, Object> actual = Jsons.map(new ObjectMapper(), evaluation.get("actual"));
        assertThat(Jsons.number(actual, "soilMoistureAfter", 0)).isGreaterThan(Jsons.number(actual, "soilMoistureBefore", 0));
        assertThat(Jsons.number(actual, "waterLitre", 0)).isGreaterThan(0);
        assertThat(Jsons.number(actual, "soilMoistureAfter", 0))
                .isCloseTo(16.0 + Jsons.number(plan, "waterLitre", 0) / (80.0 * 0.08), org.assertj.core.data.Offset.offset(0.2));
        Map<String, Object> virtualSoil = store.latestTelemetry(plotId, "SOIL_MOISTURE",
                observedAt, Instant.now().plusSeconds(1));
        assertThat(Jsons.number(virtualSoil, "value", 0)).isGreaterThan(16.0);
        assertThat(virtualSoil).containsEntry("sourceMode", "SIMULATION").containsEntry("dataOrigin", "VIRTUAL_ACTUATOR");
        Map<String, Object> virtualWater = store.latestTelemetry(plotId, "WATER_LEVEL",
                observedAt, Instant.now().plusSeconds(1));
        assertThat(Jsons.number(virtualWater, "value", 100)).isLessThan(82.0);
        assertThat(store.list("work-order").stream().noneMatch(work -> commandId.equals(Jsons.text(work, "commandId", "")))).isTrue();
    }

    @Test
    void farmerManualIrrigationBypassesBlockedGatesWithVirtualEffectAndIdempotency() throws Exception {
        String suffix = String.valueOf(System.nanoTime());
        String farmId = "farm-manual-" + suffix;
        String plotId = "plot-manual-fallback-" + suffix;
        String deviceId = "mock-" + plotId;
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", farmId, "name", "人工兜底测试田",
                "cropCode", "tomato", "stageCode", "vegetative", "areaM2", 80, "status", "ACTIVE")));
        store.save("device", deviceId, new java.util.LinkedHashMap<>(Map.of(
                "deviceId", deviceId, "farmId", farmId, "plotId", plotId,
                "status", "ONLINE", "bindingState", "BOUND", "sourceMode", "SIMULATION")));
        Instant observedAt = Instant.now();
        engine.ingest(Map.ofEntries(
                Map.entry("eventId", "manual-soil-before-" + suffix), Map.entry("farmId", farmId),
                Map.entry("plotId", plotId), Map.entry("deviceId", deviceId), Map.entry("metric", "SOIL_MOISTURE"),
                Map.entry("value", 12.0), Map.entry("unit", "%"), Map.entry("ts", observedAt.toString()),
                Map.entry("sourceMode", "SIMULATION"), Map.entry("scenarioId", "sensor-drift"),
                Map.entry("quality", Map.of("status", "GOOD", "confidence", .98))));
        engine.ingest(Map.ofEntries(
                Map.entry("eventId", "manual-water-before-" + suffix), Map.entry("farmId", farmId),
                Map.entry("plotId", plotId), Map.entry("deviceId", deviceId), Map.entry("metric", "WATER_LEVEL"),
                Map.entry("value", 82.0), Map.entry("unit", "%"), Map.entry("ts", observedAt.plusMillis(1).toString()),
                Map.entry("sourceMode", "SIMULATION"), Map.entry("scenarioId", "sensor-drift"),
                Map.entry("quality", Map.of("status", "GOOD", "confidence", .98))));

        UserPrincipal farmer = new UserPrincipal("farmer-manual-" + suffix, "manual-farmer", "FARMER",
                List.of(farmId), List.of(plotId));
        Map<String, Object> plan = engine.irrigationPlan(Map.of(
                "plotId", plotId, "scenarioId", "sensor-drift", "traceId", "trace-manual-" + suffix), farmer);
        Map<String, Object> fallback = Jsons.map(new ObjectMapper(), plan.get("manualFallback"));
        assertThat(plan).containsEntry("status", "BLOCKED").containsEntry("executable", false);
        assertThat(fallback).containsEntry("available", true).containsEntry("virtualOnly", true).containsEntry("noCooldown", true);
        assertThat(Jsons.strings(fallback.get("bypassedGates"))).contains("DATA_QUALITY", "DATA_CONFLICT");

        var authentication = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(farmer, null, List.of());
        Map<String, Object> invalidConfirmation = new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "sourcePlanId", plan.get("planId"), "waterLitre", 20.0,
                "idempotencyKey", "manual-confirmation-" + suffix, "confirmed", false));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.manualIrrigation(invalidConfirmation, authentication))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("CONFIRMATION_REQUIRED"));
        Map<String, Object> invalidWater = new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "sourcePlanId", plan.get("planId"), "waterLitre", 0.0,
                "idempotencyKey", "manual-invalid-water-" + suffix, "confirmed", true));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.manualIrrigation(invalidWater, authentication))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("MANUAL_WATER_INVALID"));
        UserPrincipal readOnlyFarmer = new UserPrincipal("farmer-manual-readonly-" + suffix, "readonly", "VIEWER",
                List.of(farmId), List.of(plotId));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.createCommand(new java.util.LinkedHashMap<>(Map.of(
                        "plotId", plotId, "sourcePlanId", plan.get("planId"), "waterLitre", 20.0,
                        "idempotencyKey", "manual-forbidden-" + suffix, "confirmed", true, "manualOverride", true)), readOnlyFarmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("CONTROL_FORBIDDEN"));
        Map<String, Object> overLimit = new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "sourcePlanId", plan.get("planId"), "waterLitre", 1000.0,
                "idempotencyKey", "manual-over-limit-" + suffix, "confirmed", true));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.manualIrrigation(overLimit, authentication))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("MANUAL_WATER_LIMIT"));

        Map<String, Object> request = new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "sourcePlanId", plan.get("planId"), "waterLitre", 20.0,
                "idempotencyKey", "manual-success-" + suffix, "confirmed", true,
                "source", "farmer-manual-fallback"));
        Map<String, Object> command = responseData(controller.manualIrrigation(request, authentication));
        assertThat(command).containsEntry("manualOverride", true)
                .containsEntry("sourcePlanId", plan.get("planId"))
                .containsEntry("confirmationMode", "OPERATOR_MANUAL_OVERRIDE")
                .containsEntry("executionMode", "SIMULATED")
                .containsEntry("provenance", "SIMULATED")
                .containsEntry("virtualOnly", true)
                .containsEntry("cooldownMinutes", 0);
        String commandId = String.valueOf(command.get("commandId"));
        Map<String, Object> completed = command;
        for (int attempt = 0; attempt < 30 && !Set.of("SUCCEEDED", "PARTIAL", "FAILED", "TIMEOUT").contains(Jsons.text(completed, "status", "")); attempt++) {
            Thread.sleep(100);
            completed = engine.commandById(commandId, farmer);
        }
        assertThat(completed).containsEntry("status", "SUCCEEDED");
        Map<String, Object> evaluation = engine.commandEvaluation(commandId, farmer);
        for (int attempt = 0; attempt < 30 && !"COMPLETED".equals(Jsons.text(evaluation, "status", "")); attempt++) {
            Thread.sleep(100);
            evaluation = engine.commandEvaluation(commandId, farmer);
        }
        Map<String, Object> actual = Jsons.map(new ObjectMapper(), evaluation.get("actual"));
        assertThat(evaluation).containsEntry("status", "COMPLETED").containsEntry("result", "GOOD");
        assertThat(evaluation).containsEntry("manualOverride", true).containsEntry("executionMode", "SIMULATED").containsEntry("provenance", "SIMULATED");
        assertThat(Jsons.map(new ObjectMapper(), evaluation.get("resourceUsage"))).containsEntry("status", "CONSUMED");
        assertThat(Jsons.text(Jsons.map(new ObjectMapper(), completed.get("ack")), "provenance", "")).isEqualTo("SIMULATED");
        assertThat(Jsons.number(actual, "soilMoistureAfter", 0)).isGreaterThan(Jsons.number(actual, "soilMoistureBefore", 0));
        Map<String, Object> virtualSoil = store.latestTelemetry(plotId, "SOIL_MOISTURE", observedAt, Instant.now().plusSeconds(1));
        assertThat(virtualSoil).containsEntry("sourceMode", "SIMULATION").containsEntry("provenance", "SIMULATED").containsEntry("dataOrigin", "MANUAL_VIRTUAL_IRRIGATION");

        Map<String, Object> repeated = responseData(controller.manualIrrigation(request, authentication));
        assertThat(repeated.get("commandId")).isEqualTo(commandId);
        Map<String, Object> secondRequest = new java.util.LinkedHashMap<>(request);
        secondRequest.put("idempotencyKey", "manual-success-second-" + suffix);
        secondRequest.put("waterLitre", 10.0);
        Map<String, Object> second = responseData(controller.manualIrrigation(secondRequest, authentication));
        assertThat(second.get("commandId")).isNotEqualTo(commandId);
    }

    @Test
    void manualIrrigationEvaluationSeparatesPartialFailureTimeoutAndMissingBaseline() {
        String suffix = String.valueOf(System.nanoTime());
        String farmId = "farm-manual-evaluation-" + suffix;
        String plotId = "plot-manual-evaluation-" + suffix;
        String deviceId = "mock-" + plotId;
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", farmId, "name", "人工效果评价测试田",
                "cropCode", "tomato", "stageCode", "vegetative", "areaM2", 80)));
        Instant observedAt = Instant.now().minusSeconds(1);
        engine.ingest(Map.ofEntries(
                Map.entry("eventId", "manual-evaluation-soil-" + suffix), Map.entry("farmId", farmId),
                Map.entry("plotId", plotId), Map.entry("deviceId", deviceId), Map.entry("metric", "SOIL_MOISTURE"),
                Map.entry("value", 20.0), Map.entry("unit", "%"), Map.entry("ts", observedAt.toString()),
                Map.entry("sourceMode", "SIMULATION"), Map.entry("scenarioId", "manual-evaluation"),
                Map.entry("quality", Map.of("status", "GOOD", "confidence", .98))));
        engine.ingest(Map.ofEntries(
                Map.entry("eventId", "manual-evaluation-water-" + suffix), Map.entry("farmId", farmId),
                Map.entry("plotId", plotId), Map.entry("deviceId", deviceId), Map.entry("metric", "WATER_LEVEL"),
                Map.entry("value", 82.0), Map.entry("unit", "%"), Map.entry("ts", observedAt.plusMillis(1).toString()),
                Map.entry("sourceMode", "SIMULATION"), Map.entry("scenarioId", "manual-evaluation"),
                Map.entry("quality", Map.of("status", "GOOD", "confidence", .98))));

        Map<String, Object> partialCommand = new java.util.LinkedHashMap<>(Map.of(
                "commandId", "manual-partial-" + suffix, "planId", "plan-manual-partial-" + suffix,
                "plotId", plotId, "waterLitre", 20.0, "manualOverride", true));
        Map<String, Object> partial = engine.evaluateCommand(partialCommand, Map.of(
                "commandId", partialCommand.get("commandId"), "status", "PARTIAL", "actualWaterLitre", 10.0));
        Map<String, Object> partialActual = Jsons.map(new ObjectMapper(), partial.get("actual"));
        assertThat(partial).containsEntry("status", "PARTIAL").containsEntry("result", "NO_EFFECT");
        assertThat(Jsons.number(partialActual, "soilMoistureAfter", 0))
                .isGreaterThan(Jsons.number(partialActual, "soilMoistureBefore", 0));

        Map<String, Object> failedCommand = new java.util.LinkedHashMap<>(Map.of(
                "commandId", "manual-failed-" + suffix, "planId", "plan-manual-failed-" + suffix,
                "plotId", plotId, "waterLitre", 20.0, "manualOverride", true));
        Map<String, Object> failed = engine.evaluateCommand(failedCommand, Map.of(
                "commandId", failedCommand.get("commandId"), "status", "FAILED", "actualWaterLitre", 0));
        Map<String, Object> failedActual = Jsons.map(new ObjectMapper(), failed.get("actual"));
        assertThat(failed).containsEntry("status", "INCONCLUSIVE").containsEntry("result", "EXECUTION_FAILED");
        assertThat(Jsons.number(failedActual, "soilMoistureAfter", 0))
                .isEqualTo(Jsons.number(failedActual, "soilMoistureBefore", 0));

        Map<String, Object> timeoutCommand = new java.util.LinkedHashMap<>(Map.of(
                "commandId", "manual-timeout-" + suffix, "planId", "plan-manual-timeout-" + suffix,
                "plotId", plotId, "waterLitre", 20.0, "manualOverride", true));
        Map<String, Object> timeout = engine.evaluateCommand(timeoutCommand, Map.of(
                "commandId", timeoutCommand.get("commandId"), "status", "TIMEOUT", "actualWaterLitre", 0));
        assertThat(timeout).containsEntry("status", "INCONCLUSIVE").containsEntry("result", "EXECUTION_FAILED");

        String noBaselinePlotId = "plot-manual-no-baseline-" + suffix;
        store.save("plot", noBaselinePlotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", noBaselinePlotId, "farmId", farmId, "name", "人工无基线测试田", "areaM2", 80)));
        Map<String, Object> noBaselineCommand = new java.util.LinkedHashMap<>(Map.of(
                "commandId", "manual-no-baseline-" + suffix, "planId", "plan-manual-no-baseline-" + suffix,
                "plotId", noBaselinePlotId, "waterLitre", 10.0, "manualOverride", true));
        Map<String, Object> noBaseline = engine.evaluateCommand(noBaselineCommand, Map.of(
                "commandId", noBaselineCommand.get("commandId"), "status", "SUCCEEDED", "actualWaterLitre", 10.0));
        Map<String, Object> noBaselineExpected = Jsons.map(new ObjectMapper(), noBaseline.get("expected"));
        Map<String, Object> noBaselineActual = Jsons.map(new ObjectMapper(), noBaseline.get("actual"));
        assertThat(noBaseline).containsEntry("status", "INCONCLUSIVE").containsEntry("result", "BASELINE_UNAVAILABLE");
        assertThat(noBaselineExpected).containsEntry("soilMoistureBefore", null).containsEntry("soilMoistureAfter", null);
        assertThat(noBaselineActual).containsEntry("soilMoistureBefore", null).containsEntry("soilMoistureAfter", null);
        assertThat(store.latestTelemetry(noBaselinePlotId, "SOIL_MOISTURE", Instant.now().minusSeconds(5), Instant.now().plusSeconds(1))).isNull();
    }

    @Test
    @SuppressWarnings("unchecked")
    void dualTrackCompareDerivesRealIrrigationFromPlotResources() {
        String suffix = String.valueOf(System.nanoTime());
        String plotId = "plot-dual-" + suffix;
        String deviceId = "mock-" + plotId;
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", "双轨现实性测试田",
                "cropCode", "tomato", "stageCode", "vegetative", "areaM2", 80)));
        Instant now = Instant.now();
        engine.ingest(Map.ofEntries(Map.entry("eventId", "dual-soil-" + suffix), Map.entry("farmId", "farm-demo"),
                Map.entry("plotId", plotId), Map.entry("deviceId", deviceId), Map.entry("metric", "SOIL_MOISTURE"),
                Map.entry("value", 30.0), Map.entry("unit", "%"), Map.entry("ts", now.toString()),
                Map.entry("sourceMode", "SIMULATION"), Map.entry("scenarioId", "drought"),
                Map.entry("quality", Map.of("status", "GOOD", "confidence", .99))));
        engine.ingest(Map.ofEntries(Map.entry("eventId", "dual-water-" + suffix), Map.entry("farmId", "farm-demo"),
                Map.entry("plotId", plotId), Map.entry("deviceId", deviceId), Map.entry("metric", "WATER_LEVEL"),
                Map.entry("value", 5.0), Map.entry("unit", "%"), Map.entry("ts", now.plusMillis(1).toString()),
                Map.entry("sourceMode", "SIMULATION"), Map.entry("scenarioId", "drought"),
                Map.entry("quality", Map.of("status", "GOOD", "confidence", .99))));
        UserPrincipal farmer = new UserPrincipal("farmer-dual-" + suffix, "farmer", "FARMER",
                List.of("farm-demo"), List.of(plotId));

        Map<String, Object> compare = engine.compareScenario(Map.of(
                "plotId", plotId, "scenario", "DROUGHT", "seed", 7,
                "parameters", Map.of("soilMoistureTrendPerHour", -3.0, "riskThreshold", 20.0, "forecastHours", 4.0)), farmer);
        assertThat(compare).containsEntry("comparisonVersion", "branch-compare-v5");

        Map<String, Object> intervention = Jsons.map(new ObjectMapper(), compare.get("intervention"));
        assertThat(intervention).containsEntry("measure", "IRRIGATION").containsEntry("status", "PLANNED");
        // 水箱只剩 5%（约 45 升）：干预只能按实际余量补水，并明确标记水箱不足。
        assertThat(Jsons.number(intervention, "reservoirAvailableLitres", 0)).isCloseTo(45.0, org.assertj.core.data.Offset.offset(0.5));
        assertThat((Boolean) intervention.get("reservoirSufficient")).isFalse();
        assertThat(Jsons.number(intervention, "waterLitre", 0)).isLessThanOrEqualTo(45.0);
        assertThat(Jsons.number(intervention, "waterLitre", 0)).isGreaterThan(0);
        // 触发时点：起点已低于预警线，至少要留出人工确认与开泵的响应延迟。
        assertThat(Jsons.whole(intervention, "triggerMinute", -1)).isGreaterThanOrEqualTo(15);

        Map<String, Object> branches = Jsons.map(new ObjectMapper(), compare.get("branches"));
        List<Map<String, Object>> executePoints = (List<Map<String, Object>>) Jsons.map(new ObjectMapper(), branches.get("EXECUTE")).get("points");
        List<Map<String, Object>> noActionPoints = (List<Map<String, Object>>) Jsons.map(new ObjectMapper(), branches.get("NO_ACTION")).get("points");
        // 措施后曲线：补水后明显抬升，且灌溉结束后恢复自然失水（终点低于峰值）。
        double executePeak = executePoints.stream().mapToDouble(p -> Jsons.number(p, "value", 0)).max().orElse(0);
        double executeFinal = Jsons.number(executePoints.get(executePoints.size() - 1), "value", 0);
        double noActionFinal = Jsons.number(noActionPoints.get(noActionPoints.size() - 1), "value", 0);
        assertThat(executePeak).isGreaterThan(24.0);
        assertThat(executeFinal).isLessThan(executePeak);
        assertThat(executeFinal).isGreaterThan(noActionFinal);

        Map<String, Object> divergence = Jsons.map(new ObjectMapper(), compare.get("divergence"));
        assertThat(Jsons.number(divergence, "moistureDeltaAtHorizon", 0)).isGreaterThan(0);
        // 不干预分支会在窗口内跌破阈值，措施后分支全程避开风险。
        assertThat((Boolean) divergence.get("riskAvoidedWithinWindow")).isTrue();
        assertThat(Jsons.whole(divergence, "riskDelayMinutes", 0)).isGreaterThan(0);
    }

    @Test
    void diagnosisExplanationKeepsRuleFactsAndLeavesAuditableFallback() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        Map<String, Object> diagnosis = engine.diagnose("plot-a01", Map.of("scenarioId", "normal", "traceId", "test-diagnosis-explanation"));
        String diagnosisId = String.valueOf(diagnosis.get("diagnosisId"));
        String primaryCause = String.valueOf(diagnosis.get("primaryCause"));
        Object confidence = diagnosis.get("confidence");

        Map<String, Object> explained = engine.explainDiagnosis(diagnosisId, admin, false);
        Map<String, Object> explanation = Jsons.map(new ObjectMapper(), explained.get("aiExplanation"));
        assertThat(explained).containsEntry("diagnosisId", diagnosisId)
                .containsEntry("primaryCause", primaryCause)
                .containsEntry("confidence", confidence);
        assertThat(explanation).containsEntry("adapter", "rules")
                .containsEntry("degraded", true)
                .containsEntry("provenance", "DERIVED")
                .containsKey("text");
        assertThat(String.valueOf(explanation.get("text"))).contains("规则引擎负责主因");

        Map<String, Object> cached = engine.explainDiagnosis(diagnosisId, admin, false);
        Map<String, Object> cachedExplanation = Jsons.map(new ObjectMapper(), cached.get("aiExplanation"));
        assertThat(cachedExplanation.get("traceId")).isEqualTo(explanation.get("traceId"));
        assertThat(store.find("agent-run", String.valueOf(explanation.get("traceId"))))
                .containsEntry("intent", "DIAGNOSIS_EXPLANATION");

        var authentication = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(admin, null, List.of());
        Map<String, Object> endpointResult = responseData(controller.diagnosisExplain(diagnosisId, Map.of(), authentication));
        assertThat(endpointResult.get("aiExplanation")).isEqualTo(cached.get("aiExplanation"));
    }

    @Test
    void realTelemetryWinsOverRecentSimulatorValueAndHumidityIsNormalised() {
        String plotId = "hardware-plot-" + System.nanoTime();
        String realId = "hardware-real-" + System.nanoTime();
        String simId = "hardware-sim-" + System.nanoTime();
        Instant now = Instant.now();
        Map<String, Object> real = Map.of(
                "eventId", realId, "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "bearpi-e53-ia1-test", "metric", "AIR_TEMPERATURE",
                "value", 26.4, "ts", now.toString(), "sourceMode", "REAL",
                "provenance", "OBSERVED", "dataOrigin", "HARDWARE");
        Map<String, Object> simulator = Map.ofEntries(
                Map.entry("eventId", simId), Map.entry("farmId", "farm-demo"), Map.entry("plotId", plotId),
                Map.entry("deviceId", "mock-" + plotId), Map.entry("metric", "AIR_TEMPERATURE"),
                Map.entry("value", 31.0), Map.entry("unit", "°C"), Map.entry("ts", now.plusMillis(1).toString()),
                Map.entry("sourceMode", "SIMULATION"), Map.entry("provenance", "OBSERVED"), Map.entry("dataOrigin", "SIMULATOR"));

        assertThat(engine.ingest(real)).containsEntry("accepted", true);
        Map<String, Object> suppressed = engine.ingest(simulator);
        assertThat(suppressed).containsEntry("accepted", true).containsEntry("suppressed", true)
                .containsEntry("reason", "REAL_SOURCE_ACTIVE");
        Map<String, Object> latestTemperature = Jsons.map(new ObjectMapper(), engine.latestMetrics(plotId).get("AIR_TEMPERATURE"));
        assertThat(Jsons.text(latestTemperature, "eventId", "")).isEqualTo(realId);

        Map<String, Object> humidity = engine.ingest(Map.of(
                "eventId", "hardware-humidity-" + System.nanoTime(), "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "bearpi-e53-ia1-test", "metric", "AIR_HUMIDITY", "value", 63.2,
                "ts", now.plusSeconds(1).toString(), "sourceMode", "REAL", "dataOrigin", "HARDWARE"));
        Map<String, Object> humidityEvent = Jsons.map(new ObjectMapper(), humidity.get("event"));
        assertThat(humidityEvent).containsEntry("unit", "%RH").containsEntry("sourceMode", "REAL")
                .containsEntry("dataOrigin", "HARDWARE");
    }

    @Test
    void activeRealReadingWinsWhenAQueuedSimulatorSampleHasALaterTimestamp() {
        String plotId = "hardware-race-" + System.nanoTime();
        Instant now = Instant.now();
        Map<String, Object> queuedSimulator = Map.ofEntries(
                Map.entry("eventId", "queued-sim-" + System.nanoTime()), Map.entry("farmId", "farm-demo"),
                Map.entry("plotId", plotId), Map.entry("deviceId", "mock-" + plotId),
                Map.entry("metric", "LIGHT"), Map.entry("value", 12_345.0), Map.entry("unit", "lux"),
                Map.entry("ts", now.plusMillis(1).toString()), Map.entry("sourceMode", "SIMULATION"),
                Map.entry("provenance", "OBSERVED"), Map.entry("dataOrigin", "SIMULATOR"));
        Map<String, Object> real = Map.ofEntries(
                Map.entry("eventId", "queued-real-" + System.nanoTime()), Map.entry("farmId", "farm-demo"),
                Map.entry("plotId", plotId), Map.entry("deviceId", "bearpi-e53-ia1-race"),
                Map.entry("metric", "LIGHT"), Map.entry("value", 432.1), Map.entry("unit", "lux"),
                Map.entry("ts", now.toString()), Map.entry("sourceMode", "REAL"),
                Map.entry("provenance", "OBSERVED"), Map.entry("dataOrigin", "HARDWARE"));

        // Store the queued synthetic sample first to model the MQTT callback
        // race, then accept the physical sample.  The read model must still
        // expose the physical value while its source lease is active.
        assertThat(store.saveTelemetry(queuedSimulator)).isTrue();
        assertThat(engine.ingest(real)).containsEntry("accepted", true);
        Map<String, Object> latestLight = Jsons.map(new ObjectMapper(), engine.latestMetrics(plotId).get("LIGHT"));
        assertThat(Jsons.text(latestLight, "eventId", "")).isEqualTo(real.get("eventId"));
        assertThat(Jsons.text(latestLight, "sourceMode", "")).isEqualTo("REAL");
    }

    @Test
    void telemetryLimitReturnsTheNewestWindowInChronologicalOrder() {
        Instant base = Instant.parse("2026-08-24T00:00:00Z");
        for (int index = 0; index < 4; index++) {
            assertThat(store.saveTelemetry(Map.of(
                    "eventId", "telemetry-window-" + index,
                    "farmId", "farm-demo",
                    "plotId", "plot-b01",
                    "deviceId", "window-test-device",
                    "metric", "WINDOW_TEST",
                    "value", index,
                    "unit", "unit",
                    "ts", base.plusSeconds(index).toString(),
                    "quality", Map.of("status", "GOOD"))))
                    .isTrue();
        }

        List<Map<String, Object>> newest = store.telemetry(
                "plot-b01", "WINDOW_TEST", base.minusSeconds(1), base.plusSeconds(10), 2);

        assertThat(newest).extracting(event -> event.get("eventId"))
                .containsExactly("telemetry-window-2", "telemetry-window-3");
    }

    @Test
    void diagnosisSafetyAndRolePermissionArePartOfDecisionReadiness() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02", "plot-b01"));
        engine.ingest(Map.of("eventId", "decision-drift-event", "plotId", "plot-b01", "deviceId", "mock-plot-b01",
                "metric", "SOIL_MOISTURE", "value", 11.0, "unit", "%", "scenarioId", "sensor-drift", "ts", Instant.now().toString()));
        Map<String, Object> diagnosis = engine.diagnose("plot-b01", Map.of("scenarioId", "sensor-drift", "traceId", "trace-drift-gate"));
        Map<String, Object> plan = engine.irrigationPlan(Map.of("plotId", "plot-b01", "diagnosisId", diagnosis.get("diagnosisId"), "traceId", "trace-drift-gate"), admin);
        Map<String, Object> readiness = engine.readiness("IRRIGATION_PLAN", String.valueOf(plan.get("planId")), admin);

        assertThat(plan.get("executable")).isEqualTo(false);
        assertThat(plan.get("readinessStatus")).isEqualTo("NEEDS_EVIDENCE");
        assertThat(plan).containsKey("readinessId");
        assertThat(readiness.get("status")).isEqualTo("NEEDS_EVIDENCE");
        assertThat(String.valueOf(readiness.get("hardGates"))).contains("diagnosisSafety=FAIL");
        assertThat(String.valueOf(readiness.get("missingEvidence"))).contains("FLOW_RATE_CALIBRATION", "DIAGNOSIS_CONFIRMATION");
        assertThat(engine.passport("trace-drift-gate", admin).get("traceId")).isEqualTo("trace-drift-gate");
        UserPrincipal unrelatedFarmer = new UserPrincipal("user-farmer-a02", "farmer-a02", "FARMER", List.of("farm-demo"), List.of("plot-a02"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.passport("trace-drift-gate", unrelatedFarmer))
                .isInstanceOf(ApiException.class);

        engine.ingest(Map.of("eventId", "decision-role-event", "plotId", "plot-a02", "deviceId", "mock-plot-a02",
                "metric", "SOIL_MOISTURE", "value", 17.0, "unit", "%", "scenarioId", "normal", "ts", Instant.now().toString()));
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a02"));
        Map<String, Object> farmerReadiness = engine.readiness("PLOT", "plot-a02", farmer);
        assertThat(farmerReadiness.get("status")).isIn("READY", "HUMAN_REVIEW");
        assertThat(String.valueOf(farmerReadiness.get("hardGates"))).contains("permission=PASS");
        assertThat(String.valueOf(farmerReadiness.get("missingEvidence"))).doesNotContain("CONTROL_PERMISSION");
    }

    @Test
    void healthyTelemetryProducesReadyPlanAndResourceLimitIsHard() {
        Map<String, Object> event = Map.of("eventId", "ready-event-1", "plotId", "plot-a02", "deviceId", "mock-plot-a02",
                "metric", "SOIL_MOISTURE", "value", 15.0, "unit", "%", "scenarioId", "normal", "ts", Instant.now().toString());
        engine.ingest(event);
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02", "plot-b01"));
        Map<String, Object> plan = engine.irrigationPlan(Map.of("plotId", "plot-a02"), admin);
        assertThat(plan.get("readinessStatus")).isEqualTo("READY");
        assertThat(plan.get("executable")).isEqualTo(true);
        Map<String, Object> resource = engine.resourcePlan(Map.of("demands", List.of(
                Map.of("plotId", "plot-a01", "waterLitre", 800, "priority", "HIGH"),
                Map.of("plotId", "plot-a02", "waterLitre", 800, "priority", "MEDIUM"))), admin);
        assertThat(resource.get("status")).isEqualTo("INFEASIBLE");
    }

    @Test
    void farmAdminCanHandleAlertAndConvertItToWorkOrder() {
        String alertId = "alert-operations-test";
        store.save("alert", alertId, new java.util.LinkedHashMap<>(Map.of(
                "alertId", alertId,
                "farmId", "farm-demo",
                "plotId", "plot-a01",
                "level", "HIGH",
                "status", "ACTIVE",
                "source", "SOIL_MOISTURE",
                "message", "土壤偏干，请确认是否需要浇水",
                "raisedAt", Instant.now().toString())));
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal systemAdmin = new UserPrincipal("user-system", "sysadmin", "SYSTEM_ADMIN", List.of("farm-demo"), List.of("*"));

        Map<String, Object> acknowledged = engine.transitionAlert(alertId, "ACKED", admin);
        assertThat(acknowledged).containsEntry("status", "ACKED").containsEntry("acknowledgedBy", "user-admin");
        assertThat(acknowledged).containsKeys("acknowledgedAt", "updatedAt");

        Map<String, Object> escalated = engine.transitionAlert(alertId, "ESCALATED", admin);
        assertThat(escalated).containsEntry("status", "ESCALATED").containsEntry("escalatedBy", "user-admin");

        Map<String, Object> workOrder = engine.createWorkOrder(Map.of(
                "plotId", "plot-a01",
                "title", "处理土壤偏干告警",
                "reason", "现场复测并确认是否浇水",
                "sourceType", "ALERT",
                "sourceRef", alertId,
                "status", "OPEN"), admin);
        assertThat(workOrder).containsEntry("sourceType", "ALERT").containsEntry("sourceRef", alertId).containsEntry("status", "OPEN");

        Map<String, Object> closed = engine.transitionAlert(alertId, "CLOSED", admin);
        assertThat(closed).containsEntry("status", "CLOSED").containsEntry("closedBy", "user-admin");
        assertThat(closed).containsKey("closedAt");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.transitionAlert(alertId, "ACTIVE", farmer)).isInstanceOf(ApiException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.transitionAlert(alertId, "ACTIVE", systemAdmin)).isInstanceOf(ApiException.class);
    }

    @Test
    void workOrderLifecycleKeepsRoleBoundariesAndAuditHistory() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        UserPrincipal otherFarmer = new UserPrincipal("user-other", "other", "FARMER", List.of("farm-demo"), List.of("plot-a01"));

        Map<String, Object> created = engine.createWorkOrder(Map.of(
                "farmId", "farm-demo",
                "plotId", "plot-a01",
                "title", "复测土壤湿度",
                "reason", "复测三处并填写结果",
                "actionType", "INSPECTION",
                "priority", "HIGH",
                "dueAt", Instant.now().plusSeconds(3600).toString()), admin);
        String workOrderId = String.valueOf(created.get("workOrderId"));
        assertThat(created).containsEntry("status", "OPEN").containsEntry("assigneeId", null).containsEntry("farmId", "farm-demo");

        String renewedDueAt = Instant.now().plusSeconds(7200).toString();
        Map<String, Object> assigned = engine.assignWorkOrder(workOrderId, Map.of(
                "assigneeId", "user-farmer", "note", "请在午前完成", "dueAt", renewedDueAt), admin);
        assertThat(assigned).containsEntry("status", "ASSIGNED").containsEntry("assigneeId", "user-farmer")
                .containsEntry("dueAt", renewedDueAt);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.transitionWorkOrder(workOrderId, Map.of("action", "START"), otherFarmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("WORK_ORDER_ASSIGNEE_REQUIRED"));

        Map<String, Object> started = engine.transitionWorkOrder(workOrderId, Map.of("action", "START"), farmer);
        assertThat(started).containsEntry("status", "IN_PROGRESS").containsKeys("startedAt", "startedBy");
        Map<String, Object> submitted = engine.transitionWorkOrder(workOrderId, Map.of(
                "action", "SUBMIT",
                "resultSummary", "三处复测值为 21%、22%、21.5%",
                "evidenceRefs", List.of("inspection-test-01")), farmer);
        assertThat(submitted).containsEntry("status", "SUBMITTED").containsEntry("submittedBy", "user-farmer");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.reviewWorkOrder(workOrderId, Map.of("action", "APPROVE"), farmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("WORK_ORDER_FORBIDDEN"));

        Map<String, Object> completed = engine.reviewWorkOrder(workOrderId, Map.of("action", "APPROVE", "note", "数据完整，验收通过"), admin);
        assertThat(completed).containsEntry("status", "DONE").containsEntry("reviewedBy", "user-admin").containsKeys("completedAt", "updatedAt");
        List<Map<String, Object>> history = Jsons.maps(new com.fasterxml.jackson.databind.ObjectMapper(), completed.get("history"));
        assertThat(history).extracting(entry -> entry.get("action")).containsExactly("CREATE", "ASSIGN", "START", "SUBMIT", "APPROVE");
        assertThat(history).allSatisfy(entry -> assertThat(entry).containsKeys("actorId", "actorRole", "at", "toStatus", "evidenceRefs"));
    }

    @Test
    void farmerCanReportSpecificIssueOnceAndFarmAdminReceivesReport() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal otherFarmer = new UserPrincipal("user-other", "other", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        String suffix = String.valueOf(System.nanoTime());
        Map<String, Object> created = engine.createWorkOrder(Map.of(
                "farmId", "farm-demo", "plotId", "plot-a01", "title", "问题上报闭环测试-" + suffix,
                "reason", "执行后反馈异常", "actionType", "INSPECTION", "priority", "HIGH"), admin);
        String workOrderId = String.valueOf(created.get("workOrderId"));
        engine.assignWorkOrder(workOrderId, Map.of("assigneeId", "user-farmer"), admin);

        Map<String, Object> report = engine.reportWorkOrderIssue(workOrderId,
                Map.of("description", "北侧滴灌管接头持续漏水，无法按计划完成补水", "priority", "HIGH"), farmer);
        assertThat(report).containsEntry("sourceType", "FARMER_REPORT")
                .containsEntry("sourceRef", workOrderId)
                .containsEntry("reason", "北侧滴灌管接头持续漏水，无法按计划完成补水")
                .containsEntry("reused", false)
                .containsEntry("sourceWorkOrderId", workOrderId);
        String reportId = String.valueOf(report.get("workOrderId"));
        assertThat(store.find("work-order", workOrderId))
                .containsEntry("issueReportId", reportId)
                .containsEntry("issueReportStatus", "OPEN")
                .containsEntry("issueReportDescription", "北侧滴灌管接头持续漏水，无法按计划完成补水");

        Map<String, Object> repeated = engine.reportWorkOrderIssue(workOrderId,
                Map.of("description", "北侧滴灌管接头持续漏水，无法按计划完成补水"), farmer);
        assertThat(repeated).containsEntry("workOrderId", reportId).containsEntry("reused", true);
        assertThat(store.list("work-order").stream()
                .filter(item -> workOrderId.equals(Jsons.text(item, "sourceRef", "")))
                .filter(item -> "FARMER_REPORT".equals(Jsons.text(item, "sourceType", "")))
                .count()).isEqualTo(1);

        assertThat(engine.workOrders(Map.of(), admin)).anyMatch(item -> reportId.equals(item.get("workOrderId")));
        assertThat(engine.workOrders(Map.of(), farmer)).anyMatch(item -> workOrderId.equals(item.get("workOrderId")));
        assertThat(engine.workOrders(Map.of(), farmer)).noneMatch(item -> reportId.equals(item.get("workOrderId")));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.reportWorkOrderIssue(workOrderId,
                        Map.of("description", "其他农户尝试上报"), otherFarmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("WORK_ORDER_ASSIGNEE_REQUIRED"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.reportWorkOrderIssue(workOrderId,
                        Map.of("description", " "), farmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("ISSUE_DESCRIPTION_REQUIRED"));
    }

    @Test
    void overdueReassignmentRequiresAFutureRenewedDueAt() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        Map<String, Object> created = engine.createWorkOrder(Map.of(
                "plotId", "plot-a01", "title", "处置逾期任务", "reason", "验证新的处理时限",
                "dueAt", Instant.now().minusSeconds(3600).toString()), admin);
        String workOrderId = String.valueOf(created.get("workOrderId"));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.assignWorkOrder(workOrderId, Map.of(
                        "assigneeId", "user-farmer", "dueAt", Instant.now().minusSeconds(60).toString()), admin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("WORK_ORDER_DUE_AT_INVALID"));

        String renewedDueAt = Instant.now().plusSeconds(14400).toString();
        assertThat(engine.assignWorkOrder(workOrderId, Map.of(
                "assigneeId", "user-farmer", "dueAt", renewedDueAt), admin))
                .containsEntry("status", "ASSIGNED")
                .containsEntry("dueAt", renewedDueAt);
    }

    @Test
    void farmerCanReadOwnUnassignedEvidenceRequestAcrossRoleWorkspaces() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal otherFarmer = new UserPrincipal("user-other", "other", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal systemAdmin = new UserPrincipal("user-system", "sysadmin", "SYSTEM_ADMIN", List.of("*"), List.of("*"));

        Map<String, Object> request = engine.createWorkOrder(Map.of(
                "farmId", "farm-demo",
                "plotId", "plot-a01",
                "sourceType", "READINESS",
                "actionType", "INSPECTION",
                "title", "申请现场复测",
                "reason", "请补充便携仪含水率"), farmer);
        String workOrderId = String.valueOf(request.get("workOrderId"));

        assertThat(engine.workOrders(Map.of(), farmer)).anySatisfy(item ->
                assertThat(item).containsEntry("workOrderId", workOrderId).containsEntry("assigneeId", null));
        assertThat(engine.workOrders(Map.of(), otherFarmer)).noneMatch(item -> workOrderId.equals(item.get("workOrderId")));
        assertThat(engine.workOrders(Map.of(), admin)).anyMatch(item -> workOrderId.equals(item.get("workOrderId")));
        assertThat(engine.workOrders(Map.of(), systemAdmin)).anyMatch(item -> workOrderId.equals(item.get("workOrderId")));
    }

    @Test
    void inspectionEvidencePersistsAndStaysLinkedToItsWorkOrder() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        Map<String, Object> created = engine.createWorkOrder(Map.of(
                "plotId", "plot-a01",
                "title", "复测土壤并记录现场情况",
                "reason", "记录土壤、作物和设备外观",
                "actionType", "INSPECTION"), admin);
        String workOrderId = String.valueOf(created.get("workOrderId"));
        engine.assignWorkOrder(workOrderId, Map.of("assigneeId", "user-farmer"), admin);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.createInspection(Map.of(
                        "plotId", "plot-a01", "workOrderId", workOrderId, "soilSurface", "DRY"), farmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("INSPECTION_WORK_ORDER_NOT_ACTIVE"));
        engine.transitionWorkOrder(workOrderId, Map.of("action", "START"), farmer);

        Map<String, Object> input = new java.util.LinkedHashMap<>();
        input.put("inspectionId", "client-cannot-overwrite");
        input.put("farmId", "farm-demo");
        input.put("plotId", "plot-a01");
        input.put("workOrderId", workOrderId);
        input.put("observedAt", Instant.now().minusSeconds(30).toString());
        input.put("soilSurface", "DRY");
        input.put("cropCondition", "LEAF_SLIGHT_WILT");
        input.put("deviceStatus", "NORMAL");
        input.put("portableSoilMoisture", 18.6);
        input.put("notes", "畦面局部干裂，叶片轻微下垂");
        Map<String, Object> inspection = engine.createInspection(input, farmer);
        String inspectionId = String.valueOf(inspection.get("inspectionId"));

        assertThat(inspectionId).startsWith("ins-").isNotEqualTo("client-cannot-overwrite");
        assertThat(inspection).containsEntry("farmId", "farm-demo")
                .containsEntry("plotId", "plot-a01")
                .containsEntry("workOrderId", workOrderId)
                .containsEntry("operatorId", "user-farmer")
                .containsEntry("operatorName", "farmer")
                .containsEntry("operatorRole", "FARMER")
                .containsEntry("provenance", "USER_PROVIDED")
                .containsEntry("sourceType", "HUMAN_OBSERVATION")
                .containsKeys("createdAt", "updatedAt", "evidenceSummary", "quality");
        assertThat(Jsons.map(new com.fasterxml.jackson.databind.ObjectMapper(), inspection.get("quality")))
                .containsEntry("status", "GOOD").containsEntry("completeness", 1.0);
        assertThat(engine.inspections("plot-a01")).anySatisfy(item -> assertThat(item).containsEntry("inspectionId", inspectionId));
        assertThat(store.find("inspection", inspectionId)).containsEntry("notes", "畦面局部干裂，叶片轻微下垂");

        Map<String, Object> linkedWorkOrder = store.find("work-order", workOrderId);
        assertThat(Jsons.strings(linkedWorkOrder.get("evidenceRefs"))).containsExactly(inspectionId);
        assertThat(Jsons.maps(new com.fasterxml.jackson.databind.ObjectMapper(), linkedWorkOrder.get("history")))
                .anySatisfy(entry -> assertThat(entry).containsEntry("action", "EVIDENCE_ADDED"));
        Map<String, Object> submitted = engine.transitionWorkOrder(workOrderId, Map.of(
                "action", "SUBMIT", "resultSummary", "现场核验已完成"), farmer);
        assertThat(Jsons.strings(submitted.get("evidenceRefs"))).containsExactly(inspectionId);

        Map<String, Object> otherPlotOrder = engine.createWorkOrder(Map.of(
                "plotId", "plot-a02", "title", "检查另一地块", "reason", "例行检查"), admin);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.createInspection(Map.of(
                        "plotId", "plot-a01", "workOrderId", otherPlotOrder.get("workOrderId"), "notes", "现场正常"), admin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("INSPECTION_WORK_ORDER_MISMATCH"));
    }

    @Test
    void rejectedWorkOrderCanBeRestartedAndTerminalOrdersCannotMove() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        Map<String, Object> created = engine.createWorkOrder(Map.of("plotId", "plot-a01", "title", "检查接线", "reason", "补拍接线端子"), admin);
        String workOrderId = String.valueOf(created.get("workOrderId"));
        engine.assignWorkOrder(workOrderId, Map.of("assigneeId", "user-farmer"), admin);
        engine.transitionWorkOrder(workOrderId, Map.of("action", "START"), farmer);
        engine.transitionWorkOrder(workOrderId, Map.of("action", "SUBMIT", "resultSummary", "已检查接线"), farmer);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.reviewWorkOrder(workOrderId, Map.of("action", "REJECT"), admin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("WORK_REVIEW_NOTE_REQUIRED"));
        Map<String, Object> rejected = engine.reviewWorkOrder(workOrderId, Map.of("action", "REJECT", "note", "请补充端子近照"), admin);
        assertThat(rejected).containsEntry("status", "REJECTED").containsEntry("rejectionReason", "请补充端子近照");
        Map<String, Object> restarted = engine.transitionWorkOrder(workOrderId, Map.of("action", "RESTART"), farmer);
        assertThat(restarted).containsEntry("status", "IN_PROGRESS").doesNotContainKey("resultSummary");
        engine.transitionWorkOrder(workOrderId, Map.of("action", "SUBMIT", "resultSummary", "已补充近照"), farmer);
        engine.reviewWorkOrder(workOrderId, Map.of("action", "APPROVE"), admin);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.assignWorkOrder(workOrderId, Map.of("assigneeId", "user-farmer"), admin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("WORK_ORDER_TERMINAL"));
    }

    @Test
    void workOrderCancellationAndFarmerAssignmentRespectFarmScope() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02", "plot-b01"));
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        Map<String, Object> cancellable = engine.createWorkOrder(Map.of("plotId", "plot-a02", "title", "临时检查", "reason", "确认现场情况"), admin);
        String cancellableId = String.valueOf(cancellable.get("workOrderId"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.transitionWorkOrder(cancellableId, Map.of("action", "CANCEL"), farmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("WORK_ORDER_FORBIDDEN"));
        assertThat(engine.transitionWorkOrder(cancellableId, Map.of("action", "CANCEL", "note", "现场已无需处理"), admin))
                .containsEntry("status", "CANCELLED").containsEntry("cancelReason", "现场已无需处理");

        Map<String, Object> outOfScope = engine.createWorkOrder(Map.of("plotId", "plot-b01", "title", "检查水稻田", "reason", "例行检查"), admin);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.assignWorkOrder(String.valueOf(outOfScope.get("workOrderId")), Map.of("assigneeId", "user-farmer"), admin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("ASSIGNEE_SCOPE_MISMATCH"));

        List<Map<String, Object>> members = engine.farmMembers("farm-demo", admin);
        assertThat(members).anySatisfy(member -> assertThat(member).containsEntry("userId", "user-farmer").containsEntry("role", "FARMER"));
        assertThat(members).anySatisfy(member -> assertThat(member).containsEntry("userId", "user-admin").containsEntry("role", "FARM_ADMIN"));
        assertThat(members).noneSatisfy(member -> assertThat(member.get("role")).isEqualTo("SYSTEM_ADMIN"));
        assertThat(members).allSatisfy(member -> {
            assertThat(member).containsOnlyKeys("userId", "username", "displayName", "role", "roleLabel", "farmIds", "plotIds", "status");
            assertThat(member.get("farmIds")).isEqualTo(List.of("farm-demo"));
        });
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.farmMembers("farm-demo", farmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("FARM_MEMBERS_FORBIDDEN"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.farmMembers("farm-other", admin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("FARM_FORBIDDEN"));
    }

    @Test
    void resourceTrialDoesNotConsumeCapacityAndNonSuccessAckStaysNonSuccess() {
        UserPrincipal admin = new UserPrincipal("user-admin-b-round1", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        double capacityBefore = Jsons.number(store.find("resource-profile", "resource-default"), "capacityLitres", 0);
        Map<String, Object> trial = engine.resourcePlan(Map.of("scope", "farm-demo", "demands", List.of(
                Map.of("plotId", "plot-a01", "requestedLitres", 700, "priority", "HIGH"),
                Map.of("plotId", "plot-a02", "requestedLitres", 700, "priority", "LOW")
        )), admin);
        double capacityAfter = Jsons.number(store.find("resource-profile", "resource-default"), "capacityLitres", 0);
        assertThat(trial.get("status")).isEqualTo("INFEASIBLE");
        assertThat(capacityAfter).isEqualTo(capacityBefore);

        UserPrincipal farmer = new UserPrincipal("user-farmer-preview", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        Map<String, Object> preview = engine.resourcePlan(Map.of("scope", "farm-demo", "demands", List.of(
                Map.of("plotId", "plot-a01", "requestedLitres", 80, "priority", "HIGH")
        )), farmer);
        assertThat(preview).containsEntry("trialOnly", true).containsEntry("readOnly", true)
                .containsEntry("provenance", "DERIVED").containsEntry("sourceMode", "ESTIMATED");
        assertThat(store.find("resource-plan", String.valueOf(preview.get("resourcePlanId")))).isNull();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.resourcePlan(Map.of("scope", "farm-demo", "demands", List.of(
                        Map.of("plotId", "plot-a02", "requestedLitres", 80, "priority", "HIGH")
                )), farmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("PLOT_FORBIDDEN"));

        String approvalPlanId = "plan-approval-" + System.nanoTime();
        store.save("irrigation-plan", approvalPlanId, new java.util.LinkedHashMap<>(Map.of(
                "planId", approvalPlanId, "plotId", "plot-a01", "readinessStatus", "READY",
                "executable", true, "durationSeconds", 120, "waterLitre", 40.0)));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.createCommand(Map.of(
                        "plotId", "plot-a01", "planId", approvalPlanId,
                        "idempotencyKey", "approval-required-" + System.nanoTime(), "approved", false), admin))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("人工确认");

        String failedId = "cmd-failed-" + System.nanoTime();
        Map<String, Object> failed = engine.evaluateCommand(
                new java.util.LinkedHashMap<>(Map.of("commandId", failedId, "planId", "plan-failed", "plotId", "plot-a01", "waterLitre", 120.0)),
                Map.of("commandId", failedId, "status", "FAILED", "actualWaterLitre", 0.0));
        assertThat(failed.get("status")).isEqualTo("INCONCLUSIVE");
        assertThat(failed.get("result")).isEqualTo("EXECUTION_FAILED");

        String partialId = "cmd-partial-" + System.nanoTime();
        Map<String, Object> partial = engine.evaluateCommand(
                new java.util.LinkedHashMap<>(Map.of("commandId", partialId, "planId", "plan-partial", "plotId", "plot-a02", "waterLitre", 120.0)),
                Map.of("commandId", partialId, "status", "PARTIAL", "actualWaterLitre", 66.0));
        assertThat(partial.get("status")).isEqualTo("PARTIAL");
        assertThat(partial.get("result")).isNotEqualTo("GOOD");
    }

    @Test
    void resourceRequestsAreSharedByRoleAndExecutionWaitsForFarmerAcknowledgement() {
        String suffix = String.valueOf(System.nanoTime());
        String farmId = "farm-resource-" + suffix;
        String plotId = "plot-resource-" + suffix;
        String deviceId = "mock-irrigation-" + suffix;
        String planId = "resource-plan-" + suffix;
        UserPrincipal farmer = new UserPrincipal("farmer-resource-" + suffix, "farmer-resource", "FARMER", List.of(farmId), List.of(plotId));
        UserPrincipal otherFarmer = new UserPrincipal("farmer-other-" + suffix, "farmer-other", "FARMER", List.of(farmId), List.of(plotId));
        UserPrincipal admin = new UserPrincipal("admin-resource-" + suffix, "admin-resource", "FARM_ADMIN", List.of(farmId), List.of());
        UserPrincipal systemAdmin = new UserPrincipal("system-resource-" + suffix, "system-resource", "SYSTEM_ADMIN", List.of("*"), List.of("*"));
        store.save("farm", farmId, new java.util.LinkedHashMap<>(Map.of("farmId", farmId, "name", "资源协同测试农场")));
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of("plotId", plotId, "farmId", farmId, "name", "资源协同测试地块", "status", "ACTIVE")));
        store.save("device", deviceId, new java.util.LinkedHashMap<>(Map.ofEntries(
                Map.entry("deviceId", deviceId), Map.entry("farmId", farmId), Map.entry("plotId", plotId),
                Map.entry("type", "IRRIGATION_CONTROLLER"), Map.entry("status", "ONLINE"), Map.entry("bindingState", "BOUND"),
                Map.entry("supportsControl", true), Map.entry("sourceMode", "SIMULATION"), Map.entry("lastSeen", Instant.now().toString()))));

        Map<String, Object> request = engine.createResourceRequest(Map.of(
                "plotId", plotId, "requestedLitres", 48.0, "constraints", "16:00 后可配合"), farmer);
        String requestId = String.valueOf(request.get("resourceRequestId"));
        assertThat(request).containsEntry("status", "SUBMITTED").containsEntry("sourceMode", "SIMULATION");
        assertThat(engine.listResourceRequests(Map.of("farmId", farmId), farmer)).extracting(item -> item.get("resourceRequestId")).contains(requestId);
        assertThat(engine.listResourceRequests(Map.of("farmId", farmId), otherFarmer)).isEmpty();
        assertThat(engine.listResourceRequests(Map.of("farmId", farmId), admin)).extracting(item -> item.get("resourceRequestId")).contains(requestId);
        assertThat(engine.listResourceRequests(Map.of("farmId", farmId), systemAdmin)).extracting(item -> item.get("resourceRequestId")).contains(requestId);

        Map<String, Object> allocation = new java.util.LinkedHashMap<>(Map.ofEntries(
                Map.entry("plotId", plotId), Map.entry("farmId", farmId), Map.entry("requestedLitres", 48.0),
                Map.entry("allocatedLitres", 48.0), Map.entry("unmetLitres", 0.0), Map.entry("readinessStatus", "READY"),
                Map.entry("executionStatus", "PENDING"), Map.entry("deviceId", deviceId), Map.entry("resourceRequestIds", List.of(requestId)),
                Map.entry("assignedFarmerId", farmer.userId), Map.entry("assignedFarmerName", farmer.username),
                Map.entry("scheduledStart", Instant.now().minusSeconds(30).toString()), Map.entry("scheduledEnd", Instant.now().plusSeconds(300).toString())));
        Map<String, Object> plan = new java.util.LinkedHashMap<>(Map.ofEntries(
                Map.entry("resourcePlanId", planId), Map.entry("farmId", farmId), Map.entry("businessDate", java.time.LocalDate.now().toString()),
                Map.entry("status", "DRAFT"), Map.entry("revision", 1), Map.entry("expiresAt", Instant.now().plusSeconds(600).toString()),
                Map.entry("allocations", List.of(allocation)), Map.entry("totalRequestedLitres", 48.0), Map.entry("totalAllocatedLitres", 48.0),
                Map.entry("totalUnmetLitres", 0.0), Map.entry("provenance", "DERIVED"), Map.entry("sourceMode", "SIMULATION")));
        store.save("resource-plan", planId, plan);

        Map<String, Object> confirmed = engine.confirmResourcePlan(planId, Map.of("expectedRevision", 1, "idempotencyKey", "confirm-" + planId), admin);
        assertThat(confirmed).containsEntry("status", "CONFIRMED");
        assertThat(store.find("resource-request", requestId)).containsEntry("status", "PENDING_ACK").containsEntry("assignedFarmerId", farmer.userId);
        engine.dispatchDueResourcePlans();
        Map<String, Object> heldPlan = store.find("resource-plan", planId);
        Map<String, Object> heldAllocation = Jsons.maps(new ObjectMapper(), heldPlan.get("allocations")).get(0);
        assertThat(heldAllocation).containsEntry("executionStatus", "SCHEDULED").containsEntry("collaborationStatus", "PENDING_ACK");
        assertThat(store.list("command")).noneMatch(command -> planId.equals(command.get("resourcePlanId")));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.actOnResourceRequest(requestId, Map.of("action", "ACKNOWLEDGE"), otherFarmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("RESOURCE_REQUEST_FORBIDDEN"));
        Map<String, Object> acknowledged = engine.actOnResourceRequest(requestId, Map.of("action", "ACKNOWLEDGE"), farmer);
        assertThat(acknowledged).containsEntry("status", "ACKNOWLEDGED");
        assertThat(Jsons.maps(new ObjectMapper(), store.find("resource-plan", planId).get("allocations")).get(0))
                .containsEntry("collaborationStatus", "ACKNOWLEDGED");
        engine.dispatchDueResourcePlans();
        assertThat(store.list("command")).anyMatch(command -> planId.equals(command.get("resourcePlanId")));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.createResourceRequest(Map.of("plotId", plotId, "requestedLitres", 12.0), farmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("RESOURCE_REQUEST_LOCKED"));
    }

    @Test
    void sseEventsAreScopedByFarmPlotAndResourceParticipant() {
        UserPrincipal farmer = new UserPrincipal("farmer-a", "farmer-a", "FARMER", List.of("farm-a"), List.of("plot-a"));
        UserPrincipal otherFarmer = new UserPrincipal("farmer-b", "farmer-b", "FARMER", List.of("farm-a"), List.of("plot-a"));
        UserPrincipal farmAdmin = new UserPrincipal("admin-a", "admin-a", "FARM_ADMIN", List.of("farm-a"), List.of());
        UserPrincipal otherAdmin = new UserPrincipal("admin-b", "admin-b", "FARM_ADMIN", List.of("farm-b"), List.of("*"));
        UserPrincipal systemAdmin = new UserPrincipal("system", "system", "SYSTEM_ADMIN", List.of("*"), List.of("*"));
        Map<String, Object> privateRequest = Map.of(
                "resourceRequestId", "request-a", "farmId", "farm-a", "plotId", "plot-a", "requestedBy", "farmer-a");
        assertThat(eventBus.canReceive(farmer, privateRequest)).isTrue();
        assertThat(eventBus.canReceive(otherFarmer, privateRequest)).isFalse();
        assertThat(eventBus.canReceive(farmAdmin, privateRequest)).isTrue();
        assertThat(eventBus.canReceive(otherAdmin, privateRequest)).isFalse();
        assertThat(eventBus.canReceive(systemAdmin, privateRequest)).isTrue();
        assertThat(eventBus.canReceive(farmer, Map.of("event", "unscoped"))).isFalse();
    }

    @Test
    void resourceCollaborationRejectsWritesWhenPersistenceIsUnavailable() throws Exception {
        UserPrincipal farmer = new UserPrincipal("farmer-persistence", "farmer-persistence", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        long before = store.countWhere("resource-request", request -> "farmer-persistence".equals(request.get("requestedBy")));
        var databaseReady = AgriStore.class.getDeclaredField("databaseReady");
        databaseReady.setAccessible(true);
        boolean original = databaseReady.getBoolean(store);
        try {
            databaseReady.setBoolean(store, false);
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.createResourceRequest(Map.of(
                            "plotId", "plot-a01", "requestedLitres", 24.0), farmer))
                    .isInstanceOfSatisfying(ApiException.class, error -> {
                        assertThat(error.status).isEqualTo(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE);
                        assertThat(error.code).isEqualTo("RESOURCE_PERSISTENCE_UNAVAILABLE");
                    });
            assertThat(store.countWhere("resource-request", request -> "farmer-persistence".equals(request.get("requestedBy")))).isEqualTo(before);
        } finally {
            databaseReady.setBoolean(store, original);
        }
    }

    @Test
    void normalLightVariationIsNotMistakenForSensorDegradation() {
        engine.ingest(Map.of("eventId", "light-baseline-event", "plotId", "plot-a02", "deviceId", "mock-plot-a02",
                "metric", "LIGHT", "value", 38_000.0, "unit", "lux", "scenarioId", "normal", "ts", Instant.now().toString()));
        Map<String, Object> normal = engine.ingest(Map.of("eventId", "light-normal-variation-event", "plotId", "plot-a02", "deviceId", "mock-plot-a02",
                "metric", "LIGHT", "value", 38_650.0, "unit", "lux", "scenarioId", "normal", "ts", Instant.now().plusMillis(1).toString()));
        Map<String, Object> normalEvent = Jsons.map(new com.fasterxml.jackson.databind.ObjectMapper(), normal.get("event"));
        assertThat(Jsons.text(Jsons.map(new com.fasterxml.jackson.databind.ObjectMapper(), normalEvent.get("quality")), "status", ""))
                .isEqualTo("GOOD");

        Map<String, Object> abrupt = engine.ingest(Map.of("eventId", "light-abrupt-change-event", "plotId", "plot-a02", "deviceId", "mock-plot-a02",
                "metric", "LIGHT", "value", 52_000.0, "unit", "lux", "scenarioId", "normal", "ts", Instant.now().plusMillis(2).toString()));
        Map<String, Object> abruptEvent = Jsons.map(new com.fasterxml.jackson.databind.ObjectMapper(), abrupt.get("event"));
        Map<String, Object> abruptQuality = Jsons.map(new com.fasterxml.jackson.databind.ObjectMapper(), abruptEvent.get("quality"));
        assertThat(abruptQuality.get("status")).isEqualTo("DEGRADED");
        assertThat(abruptQuality.get("changePoint")).isEqualTo(true);
    }

    @Test
    void strategyCannotSkipOfflineValidation() {
        UserPrincipal systemAdmin = new UserPrincipal("user-system", "sysadmin", "SYSTEM_ADMIN", List.of("farm-demo"), List.of("*"));
        Map<String, Object> draft = engine.strategyCandidate(Map.of("name", "safe-threshold"), systemAdmin);
        String id = String.valueOf(draft.get("candidateId"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.transitionStrategy(id, "OFFLINE_VALIDATED", systemAdmin))
                .isInstanceOf(ApiException.class);
        Map<String, Object> validated = engine.offlineValidateStrategy(id, Map.of("scenarioId", "drought", "seed", 7), systemAdmin);
        assertThat(validated.get("status")).isEqualTo("OFFLINE_VALIDATED");
        assertThat(engine.transitionStrategy(id, "APPROVED", systemAdmin).get("status")).isEqualTo("APPROVED");
    }

    @Test
    void replayBranchDoesNotPolluteMainTelemetry() {
        long before = store.eventCount();
        Map<String, Object> result = engine.ingest(Map.of("eventId", "branch-only-1", "plotId", "plot-a01", "deviceId", "mock-plot-a01",
                "metric", "SOIL_MOISTURE", "value", 10.0, "unit", "%", "branchId", "NO_ACTION", "scenarioId", "branch-check", "ts", Instant.now().toString()));
        assertThat(result.get("branchOnly")).isEqualTo(true);
        assertThat(store.eventCount()).isEqualTo(before);
        assertThat(store.list("scenario-event")).anyMatch(e -> "branch-only-1".equals(e.get("eventId")));
    }

    @Test
    void scenarioSnapshotAndValueLedgerExposeExplicitUncertainty() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02", "plot-b01"));
        UserPrincipal systemAdmin = new UserPrincipal("user-system", "sysadmin", "SYSTEM_ADMIN", List.of("farm-demo"), List.of("*"));
        Map<String, Object> run = engine.scenarioRun(Map.of("scenario", "drought", "scenarioId", "test-branch-snapshot", "seed", 9, "branchId", "NO_ACTION", "generateSample", true), systemAdmin);
        Map<String, Object> snapshot = engine.scenarioSnapshot(String.valueOf(run.get("runId")), systemAdmin);
        assertThat(snapshot.get("readOnly")).isEqualTo(true);
        assertThat(((List<?>) snapshot.get("branchEvents")).size()).isGreaterThan(0);
        Map<String, Object> compare = engine.compareScenario(Map.of("scenarioId", "test-branch-snapshot", "plotId", "plot-a01", "seed", 9, "leftBranch", "NO_ACTION", "rightBranch", "EXECUTE"), systemAdmin);
        assertThat(compare.get("readOnly")).isEqualTo(true);
        assertThat(engine.valueLedger(Map.of("actualWaterLitres", 10), admin).get("status")).isEqualTo("INCOMPLETE");
    }

    @Test
    void qwenThinkingAndInternalMetadataAreNeverShownAsNarrative() {
        String raw = "<think>内部推理 traceId: run-secret</think>\n\n你好！\n\n当前问题：不应泄漏\ntraceId: run-secret\nsourceLabels: OBSERVED";
        assertThat(AgriEngine.sanitizeNarrative(raw)).isEqualTo("你好！");
    }

    @Test
    void greetingAndAmbiguousShortInputUseConciseFastPath() {
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        Map<String, Object> greeting = engine.agentChat(Map.of("message", "hi", "plotId", "plot-a01"), farmer);
        assertThat(greeting.get("intent")).isEqualTo("GREETING");
        assertThat(greeting.get("adapter")).isEqualTo("rules-fast-path");
        assertThat(String.valueOf(greeting.get("narrative"))).doesNotContain("traceId", "<think>");

        Map<String, Object> shortInput = engine.agentChat(Map.of("message", "1", "plotId", "plot-a01"), farmer);
        assertThat(shortInput.get("intent")).isEqualTo("CLARIFICATION");
        assertThat(String.valueOf(shortInput.get("narrative"))).contains("编号");
    }

    @Test
    void capabilityQuestionIsConciseAndSafetyBoundaryWins() {
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        Map<String, Object> capability = engine.agentChat(Map.of("message", "你具备智慧农田专业知识吗", "plotId", "plot-a01"), farmer);
        assertThat(capability.get("intent")).isEqualTo("CAPABILITY_QUERY");
        assertThat(capability.get("adapter")).isEqualTo("rules-fast-path");
        assertThat(String.valueOf(capability.get("narrative"))).doesNotContain("traceId", "<think>");

        assertThat(engine.safetyNarrativeOverride("请通过 MQTT 发送开阀命令", Map.of()))
                .contains("不能", "控制命令");
        Map<String, Object> offline = Map.of("intent", "PLOT_STATUS", "result", Map.of(
                "device", Map.of("status", "OFFLINE"), "latest", Map.of()));
        assertThat(engine.safetyNarrativeOverride("查看地块状态", offline)).isNull();
        Map<String, Object> blockedPlan = Map.of("intent", "IRRIGATION_RECOMMENDATION", "plan", Map.of(
                "executable", false, "readinessStatus", "NEEDS_EVIDENCE"));
        assertThat(engine.safetyNarrativeOverride("给我灌溉建议", blockedPlan))
                .contains("证据不足", "人工复核");
    }

    @Test
    void chineseQuickIntentsReachTheMatchingDeterministicTool() {
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));

        Map<String, Object> irrigation = engine.agentChat(Map.of(
                "message", "为温室1生成阶段精准补水处方与就绪度检查", "plotId", "plot-a01"), farmer);
        assertThat(irrigation.get("intent")).isEqualTo("IRRIGATION_RECOMMENDATION");
        assertThat(irrigation).containsKey("plan");

        Map<String, Object> diagnosis = engine.agentChat(Map.of(
                "message", "分析温室1的缺水与传感器漂移风险", "plotId", "plot-a01"), farmer);
        assertThat(diagnosis.get("intent")).isEqualTo("DIAGNOSIS");
        assertThat(diagnosis).containsKey("diagnosis");
    }

    @Test
    void retestChecklistIsARealFollowUpInsteadOfTheRepeatedSafetyTemplate() {
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        String conversationId = "conversation-retest-checklist";
        Map<String, Object> first = engine.agentChat(Map.of(
                "message", "读取温室1实时遥测与设备健康度", "plotId", "plot-a01", "conversationId", conversationId), farmer);
        Map<String, Object> checklist = engine.agentChat(Map.of(
                "message", "复测清单", "plotId", "plot-a01", "conversationId", conversationId), farmer);

        assertThat(checklist.get("intent")).isEqualTo("RETEST_CHECKLIST");
        assertThat(String.valueOf(checklist.get("narrative"))).contains("复测", "1.");
        assertThat(checklist.get("narrative")).isNotEqualTo(first.get("narrative"));
        assertThat(((List<?>) engine.agentHistory(conversationId, 20, farmer).get("messages"))).hasSize(4);
    }

    @Test
    void agentHistoryIsPersistedAndStrictlyIsolatedByUser() {
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal secondFarmer = new UserPrincipal("user-farmer-b", "farmer-b", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        String farmerConversation = "conversation-farmer-private";
        String secondFarmerConversation = "conversation-farmer-b-private";

        Map<String, Object> farmerAnswer = engine.agentChat(Map.of(
                "message", "番茄现在需要关注什么", "plotId", "plot-a01", "conversationId", farmerConversation), farmer);
        engine.agentChat(Map.of(
                "message", "今天有哪些农务", "plotId", "plot-a01", "conversationId", secondFarmerConversation), secondFarmer);

        List<?> farmerMessages = (List<?>) engine.agentHistory(farmerConversation, 20, farmer).get("messages");
        assertThat(farmerMessages).hasSize(2);
        assertThat(farmerMessages.toString()).contains("番茄现在需要关注什么").doesNotContain("今天有哪些农务");
        assertThat(engine.agentConversations(20, false, farmer)).allMatch(item -> "user-farmer".equals(item.get("userId")));
        assertThat(engine.agentConversations(20, false, secondFarmer)).allMatch(item -> "user-farmer-b".equals(item.get("userId")));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.agentHistory(farmerConversation, 20, secondFarmer))
                .isInstanceOf(ApiException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.agentRun(String.valueOf(farmerAnswer.get("traceId")), secondFarmer))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void farmerAgentOnlyExposesSafeToolsAndRunsOwnTaskThroughPreview() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal otherFarmer = new UserPrincipal("user-other-agent", "other-agent", "FARMER", List.of("farm-demo"), List.of("plot-a01"));

        assertThat(engine.agentTools(farmer)).extracting(item -> item.get("name"))
                .containsExactly("get_risk_forecast", "generate_irrigation_plan", "evaluate_diagnosis", "get_today_work_items", "get_plot_status", "get_water_resource_status",
                        "transition_assigned_work_order", "create_inspection_record", "create_evidence_request", "execute_virtual_irrigation");
        assertThat(engine.agentTools(farmer)).noneMatch(item -> String.valueOf(item.get("name")).equals("create_plot"));

        Map<String, Object> created = engine.createWorkOrder(Map.of(
                "farmId", "farm-demo", "plotId", "plot-a01", "title", "检查滴灌管路 Agent 测试",
                "reason", "核对接口是否渗漏", "actionType", "FIELD_OPERATION"), admin);
        String workOrderId = String.valueOf(created.get("workOrderId"));
        engine.assignWorkOrder(workOrderId, Map.of("assigneeId", farmer.userId), admin);

        Map<String, Object> preview = engine.agentChat(Map.of("message", "开始任务 " + workOrderId,
                "plotId", "plot-a01", "conversationId", "conversation-agent-task"), farmer);
        Map<String, Object> proposal = Jsons.map(new ObjectMapper(), preview.get("actionProposal"));
        assertThat(preview.get("intent")).isEqualTo("AGENT_ACTION");
        assertThat(proposal).containsEntry("toolName", "transition_assigned_work_order")
                .containsEntry("status", "AWAITING_CONFIRMATION")
                .containsEntry("actorRole", "FARMER")
                .containsEntry("riskLevel", "MEDIUM")
                .containsEntry("sourceMode", "USER_PROVIDED")
                .containsEntry("requiresConfirmation", true)
                .containsKey("expiresAt");
        String actionId = String.valueOf(proposal.get("actionId"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.agentAction(actionId, otherFarmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("AGENT_ACTION_FORBIDDEN"));

        Map<String, Object> confirmed = engine.confirmAgentAction(actionId, Map.of("idempotencyKey", "agent-confirm:" + actionId), farmer);
        assertThat(confirmed).containsEntry("status", "SUCCEEDED");
        assertThat(store.find("work-order", workOrderId)).containsEntry("status", "IN_PROGRESS");
        assertThat(engine.confirmAgentAction(actionId, Map.of("idempotencyKey", "agent-confirm:" + actionId), farmer))
                .containsEntry("status", "SUCCEEDED");

        Map<String, Object> submitPreview = engine.agentChat(Map.of("message", "提交任务 " + workOrderId + "：结果：已完成滴灌管路检查，未发现渗漏",
                "plotId", "plot-a01", "conversationId", "conversation-agent-task"), farmer);
        Map<String, Object> submitProposal = Jsons.map(new ObjectMapper(), submitPreview.get("actionProposal"));
        assertThat(submitProposal).containsEntry("toolName", "transition_assigned_work_order");
        Map<String, Object> submitted = engine.confirmAgentAction(String.valueOf(submitProposal.get("actionId")), Map.of(), farmer);
        assertThat(submitted).containsEntry("status", "SUCCEEDED");
        assertThat(store.find("work-order", workOrderId)).containsEntry("status", "SUBMITTED");
    }

    @Test
    void farmerAgentInspectionAndEvidenceRequestsStayUserProvided() {
        UserPrincipal farmer = new UserPrincipal("user-farmer-inspection", "farmer-inspection", "FARMER", List.of("farm-demo"), List.of("plot-a01"));

        Map<String, Object> inspectionPreview = engine.agentChat(Map.of(
                "message", "帮我记录一次巡田：叶片正常，土壤表面偏干", "plotId", "plot-a01", "conversationId", "conversation-agent-inspection"), farmer);
        Map<String, Object> inspectionProposal = Jsons.map(new ObjectMapper(), inspectionPreview.get("actionProposal"));
        assertThat(inspectionProposal).containsEntry("toolName", "create_inspection_record")
                .containsEntry("sourceMode", "USER_PROVIDED").containsEntry("status", "AWAITING_CONFIRMATION");
        Map<String, Object> inspection = engine.confirmAgentAction(String.valueOf(inspectionProposal.get("actionId")), Map.of(), farmer);
        assertThat(inspection).containsEntry("status", "SUCCEEDED");
        Map<String, Object> record = Jsons.map(new ObjectMapper(), inspection.get("result"));
        assertThat(record).containsEntry("plotId", "plot-a01").containsEntry("provenance", "USER_PROVIDED")
                .containsEntry("sourceType", "HUMAN_OBSERVATION").containsEntry("operatorId", farmer.userId);

        Map<String, Object> evidencePreview = engine.agentChat(Map.of(
                "message", "申请复测：原因是在线传感器读数与现场不一致", "plotId", "plot-a01", "conversationId", "conversation-agent-evidence"), farmer);
        Map<String, Object> evidenceProposal = Jsons.map(new ObjectMapper(), evidencePreview.get("actionProposal"));
        assertThat(evidenceProposal).containsEntry("toolName", "create_evidence_request")
                .containsEntry("sourceMode", "USER_PROVIDED");
        Map<String, Object> evidence = engine.confirmAgentAction(String.valueOf(evidenceProposal.get("actionId")), Map.of(), farmer);
        assertThat(evidence).containsEntry("status", "SUCCEEDED");
        Map<String, Object> evidenceWork = Jsons.map(new ObjectMapper(), evidence.get("result"));
        assertThat(evidenceWork).containsEntry("sourceType", "READINESS").containsEntry("actionType", "INSPECTION")
                .containsEntry("status", "OPEN").containsEntry("createdBy", farmer.userId);

        Map<String, Object> refused = engine.agentChat(Map.of(
                "message", "帮我新增地块并绑定设备", "plotId", "plot-a01", "conversationId", "conversation-agent-refused"), farmer);
        assertThat(refused).doesNotContainKey("actionProposal");
        assertThat(String.valueOf(refused.get("narrative"))).contains("不能执行");
    }

    @Test
    void farmerAgentSkipsEvidenceWorkflowWhenMoistureAlreadyMeetsTarget() {
        String suffix = String.valueOf(System.nanoTime());
        String plotId = "plot-agent-no-action-" + suffix;
        UserPrincipal farmer = new UserPrincipal("user-farmer-no-action-" + suffix, "farmer-no-action-" + suffix,
                "FARMER", List.of("farm-demo"), List.of(plotId));
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", "无需补水测试田", "cropCode", "tomato", "stageCode", "fruiting", "areaM2", 80, "status", "ACTIVE")));
        store.save("device", "mock-" + plotId, new java.util.LinkedHashMap<>(Map.of(
                "deviceId", "mock-" + plotId, "farmId", "farm-demo", "plotId", plotId, "status", "ONLINE", "bindingState", "BOUND")));
        engine.ingest(Map.of("eventId", "agent-no-action-good-" + suffix, "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", 35.0, "unit", "%",
                "scenarioId", "normal", "ts", Instant.now().toString()));

        Map<String, Object> response = engine.agentChat(Map.of("message", "启动灌溉", "plotId", plotId,
                "conversationId", "conversation-agent-no-action-" + suffix), farmer);

        assertThat(response).doesNotContainKey("actionProposal").containsEntry("status", "NO_ACTION");
        assertThat(String.valueOf(response.get("clarification"))).contains("无需灌溉", "不用补证");
    }

    @Test
    void farmerAgentIrrigationRechecksReadinessAndCompletesAfterVirtualAck() throws Exception {
        String suffix = String.valueOf(System.nanoTime());
        String plotId = "plot-agent-irrigation-" + suffix;
        UserPrincipal farmer = new UserPrincipal("user-farmer-irrigation-" + suffix, "farmer-irrigation-" + suffix,
                "FARMER", List.of("farm-demo"), List.of(plotId));
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", "Agent 灌溉测试田", "cropCode", "tomato", "stageCode", "fruiting", "areaM2", 80, "status", "ACTIVE")));
        store.save("device", "mock-" + plotId, new java.util.LinkedHashMap<>(Map.of(
                "deviceId", "mock-" + plotId, "farmId", "farm-demo", "plotId", plotId, "status", "ONLINE", "bindingState", "BOUND")));
        engine.ingest(Map.of("eventId", "agent-irrigation-good-" + suffix, "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", 10.0, "unit", "%",
                "scenarioId", "normal", "ts", Instant.now().toString()));

        Map<String, Object> preview = engine.agentChat(Map.of("message", "启动灌溉", "plotId", plotId,
                "conversationId", "conversation-agent-irrigation-" + suffix), farmer);
        Map<String, Object> proposal = Jsons.map(new ObjectMapper(), preview.get("actionProposal"));
        assertThat(proposal).containsEntry("toolName", "execute_virtual_irrigation")
                .containsEntry("riskLevel", "HIGH").containsEntry("sourceMode", "SIMULATED")
                .containsEntry("status", "AWAITING_CONFIRMATION");
        String actionId = String.valueOf(proposal.get("actionId"));
        Map<String, Object> confirmed = engine.confirmAgentAction(actionId, Map.of(), farmer);
        assertThat(confirmed).containsEntry("status", "EXECUTING");
        Map<String, Object> completed = confirmed;
        for (int attempt = 0; attempt < 20 && "EXECUTING".equals(Jsons.text(completed, "status", "")); attempt++) {
            Thread.sleep(100);
            completed = engine.agentAction(actionId, farmer);
        }
        assertThat(completed).containsEntry("status", "SUCCEEDED");
        assertThat(Jsons.map(new ObjectMapper(), completed.get("result"))).containsKey("ack");

        store.save("device", "mock-" + plotId, new java.util.LinkedHashMap<>(Map.of(
                "deviceId", "mock-" + plotId, "farmId", "farm-demo", "plotId", plotId, "status", "ONLINE", "bindingState", "BOUND")));
        engine.ingest(Map.of("eventId", "agent-irrigation-drift-" + suffix, "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", 9.0, "unit", "%",
                "scenarioId", "sensor-drift", "ts", Instant.now().plusMillis(1).toString()));
        Map<String, Object> blocked = engine.agentChat(Map.of("message", "启动灌溉", "plotId", plotId,
                "conversationId", "conversation-agent-irrigation-drift-" + suffix), farmer);
        assertThat(blocked).doesNotContainKey("actionProposal").containsEntry("status", "NEEDS_EVIDENCE");
        assertThat(String.valueOf(blocked.get("clarification"))).contains("不能生成灌溉执行卡");
    }

    @Test
    void severeDroughtStartsAutomaticWateringAndAllowsImmediateRepeat() {
        String suffix = String.valueOf(System.nanoTime());
        String plotId = "plot-emergency-irrigation-" + suffix;
        UserPrincipal farmer = new UserPrincipal("user-farmer-emergency-" + suffix, "farmer-emergency-" + suffix,
                "FARMER", List.of("farm-demo"), List.of(plotId));
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", "应急补水测试田", "cropCode", "tomato", "stageCode", "fruiting", "areaM2", 80, "status", "ACTIVE")));
        store.save("device", "mock-" + plotId, new java.util.LinkedHashMap<>(Map.of(
                "deviceId", "mock-" + plotId, "farmId", "farm-demo", "plotId", plotId, "status", "ONLINE", "bindingState", "BOUND")));
        Map<String, Object> telemetry = engine.ingest(Map.of("eventId", "emergency-good-" + suffix, "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", 4.0, "unit", "%",
                "scenarioId", "normal", "ts", Instant.now().toString()));
        assertThat(Jsons.map(new ObjectMapper(), Jsons.map(new ObjectMapper(), telemetry.get("ruleResult")).get("automaticWatering")))
                .containsEntry("status", "TRIGGERED");

        Map<String, Object> firstPlan = engine.irrigationPlan(Map.of("plotId", plotId, "traceId", "trace-emergency-" + suffix), farmer);
        assertThat(firstPlan).containsEntry("readinessStatus", "READY").containsEntry("emergencyEligible", true);
        Map<String, Object> first = engine.createCommand(new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "planId", firstPlan.get("planId"), "idempotencyKey", "emergency-first-" + suffix,
                "confirmed", true)), farmer);
        assertThat(first).containsEntry("emergencyMode", "NORMAL");
        assertThat(engine.irrigationGuard(plotId, farmer)).containsEntry("state", "AVAILABLE").containsEntry("cooldownMinutes", 0);

        Map<String, Object> secondPlan = engine.irrigationPlan(Map.of("plotId", plotId, "traceId", "trace-emergency-second-" + suffix), farmer);
        Map<String, Object> repeated = engine.createCommand(new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "planId", secondPlan.get("planId"), "idempotencyKey", "emergency-repeat-" + suffix,
                "confirmed", true)), farmer);
        assertThat(repeated).containsEntry("cooldownMinutes", 0);

        Map<String, Object> emergency = engine.createCommand(new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "planId", secondPlan.get("planId"), "idempotencyKey", "emergency-bypass-" + suffix,
                "confirmed", true, "emergencyOverride", true)), farmer);
        assertThat(emergency).containsEntry("emergencyMode", "AUTOMATIC_SOIL_MOISTURE")
                .containsEntry("riskLevel", "HIGH").containsEntry("cooldownMinutes", 0);
    }

    @Test
    void farmerCanToggleAutomaticWateringAndDisabledStateBlocksOnlyAutomaticTrigger() {
        String suffix = String.valueOf(System.nanoTime());
        String plotId = "plot-auto-toggle-" + suffix;
        UserPrincipal farmer = new UserPrincipal("user-farmer-auto-toggle-" + suffix, "farmer-auto-toggle-" + suffix,
                "FARMER", List.of("farm-demo"), List.of(plotId));
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", "自动浇水开关测试田", "cropCode", "tomato",
                "stageCode", "fruiting", "areaM2", 80, "status", "ACTIVE")));
        try {
            Map<String, Object> disabled = engine.updateAutomaticWateringSetting(plotId, Map.of("enabled", false), farmer);
            assertThat(disabled).containsEntry("plotId", plotId).containsEntry("enabled", false)
                    .containsEntry("sourceMode", "SIMULATION");
            Map<String, Object> guard = engine.irrigationGuard(plotId, farmer);
            assertThat(Jsons.map(new ObjectMapper(), guard.get("automaticWatering")))
                    .containsEntry("enabled", false).containsEntry("eligible", false).containsEntry("status", "DISABLED");
            assertThat(engine.automaticWatering(Map.of("plotId", plotId), farmer))
                    .containsEntry("enabled", false).containsEntry("status", "DISABLED")
                    .containsEntry("reason", "AUTOMATIC_WATERING_DISABLED");

            Map<String, Object> enabled = engine.updateAutomaticWateringSetting(plotId, Map.of("enabled", true), farmer);
            assertThat(enabled).containsEntry("enabled", true).containsKeys("updatedAt", "updatedBy");
            assertThat(engine.automaticWatering(Map.of("plotId", plotId), farmer))
                    .containsEntry("enabled", true).containsEntry("status", "BLOCKED")
                    .containsEntry("reason", "SOIL_MOISTURE_UNAVAILABLE");
        } finally {
            store.delete("plot", plotId);
        }
    }

    @Test
    void farmerAgentActionExpiryAndCancelAreOwnerBound() {
        UserPrincipal farmer = new UserPrincipal("user-farmer-expiry", "farmer-expiry", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        Map<String, Object> preview = engine.agentChat(Map.of("message", "申请巡田", "plotId", "plot-a01",
                "conversationId", "conversation-agent-expiry"), farmer);
        Map<String, Object> proposal = Jsons.map(new ObjectMapper(), preview.get("actionProposal"));
        String actionId = String.valueOf(proposal.get("actionId"));
        Map<String, Object> action = store.find("agent-action", actionId);
        action.put("expiresAt", Instant.now().minusSeconds(1).toString());
        store.save("agent-action", actionId, action);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.cancelAgentAction(actionId, farmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("AGENT_ACTION_EXPIRED"));
        assertThat(store.find("agent-action", actionId)).containsEntry("status", "EXPIRED");
    }

    @Test
    void deviceRegistrationBindingAndUnbindingDoNotFakeAnOnlineHeartbeat() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        String deviceId = "device-management-" + System.nanoTime();
        Map<String, Object> registered = adminManagement.registerDevice(new java.util.LinkedHashMap<>(Map.of(
                "deviceId", deviceId, "farmId", "farm-demo", "name", "测试采集器", "type", "ENVIRONMENTAL_SENSOR")), admin);
        assertThat(registered).containsEntry("status", "OFFLINE").containsEntry("bindingState", "UNBOUND").containsEntry("plotId", null);

        Map<String, Object> bound = adminManagement.bindDevice(deviceId, Map.of("plotId", "plot-a01"), admin);
        assertThat(bound).containsEntry("plotId", "plot-a01").containsEntry("bindingState", "BOUND").containsEntry("status", "OFFLINE");
        Map<String, Object> unbound = adminManagement.unbindDevice(deviceId, admin);
        assertThat(unbound).containsEntry("bindingState", "UNBOUND").containsEntry("plotId", null).containsEntry("previousPlotId", "plot-a01");
    }

    @Test
    void deviceBindingRejectsCrossFarmAndInactivePlots() {
        String suffix = String.valueOf(System.nanoTime());
        String otherFarmId = "farm-device-other-" + suffix;
        String otherPlotId = "plot-device-other-" + suffix;
        String inactivePlotId = "plot-device-inactive-" + suffix;
        store.save("farm", otherFarmId, new java.util.LinkedHashMap<>(Map.of("farmId", otherFarmId, "name", "其他设备农场")));
        store.save("plot", otherPlotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", otherPlotId, "farmId", otherFarmId, "name", "其他农场地块", "status", "ACTIVE")));
        store.save("plot", inactivePlotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", inactivePlotId, "farmId", "farm-demo", "name", "停用地块", "status", "INACTIVE")));
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN",
                List.of("farm-demo", otherFarmId), List.of("plot-a01", otherPlotId, inactivePlotId));
        String deviceId = "device-cross-farm-" + suffix;
        adminManagement.registerDevice(new java.util.LinkedHashMap<>(Map.of(
                "deviceId", deviceId, "farmId", "farm-demo", "name", "边界测试采集器", "type", "ENVIRONMENTAL_SENSOR")), admin);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> adminManagement.bindDevice(deviceId, Map.of("plotId", otherPlotId), admin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("DEVICE_PLOT_FARM_MISMATCH"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> adminManagement.bindDevice(deviceId, Map.of("plotId", inactivePlotId), admin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("PLOT_INACTIVE"));
    }

    @Test
    void simulatedDeviceControlUpdatesStatusAndSuppressesTelemetryUntilReenabled() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        String deviceId = "mock-device-control-" + System.nanoTime();
        engine.ingest(Map.ofEntries(
                Map.entry("eventId", "device-control-seed-" + deviceId), Map.entry("farmId", "farm-demo"),
                Map.entry("plotId", "plot-a01"), Map.entry("deviceId", deviceId), Map.entry("metric", "SOIL_MOISTURE"),
                Map.entry("value", 32.0), Map.entry("unit", "%"), Map.entry("sourceMode", "SIMULATION"),
                Map.entry("dataOrigin", "SIMULATOR"), Map.entry("ts", Instant.now().toString())));
        Map<String, Object> offline = engine.controlDevice(deviceId,
                Map.of("targetStatus", "OFFLINE", "idempotencyKey", "test-offline-" + deviceId), admin);
        assertThat(offline).containsEntry("commandStatus", "SUCCEEDED");
        assertThat(Jsons.map(new ObjectMapper(), offline.get("device"))).containsEntry("status", "OFFLINE");
        Map<String, Object> suppressed = engine.ingest(Map.ofEntries(
                Map.entry("eventId", "device-control-suppressed-" + deviceId), Map.entry("farmId", "farm-demo"),
                Map.entry("plotId", "plot-a01"), Map.entry("deviceId", deviceId), Map.entry("metric", "SOIL_MOISTURE"),
                Map.entry("value", 31.0), Map.entry("unit", "%"), Map.entry("sourceMode", "SIMULATION"),
                Map.entry("ts", Instant.now().toString())));
        assertThat(suppressed).containsEntry("suppressed", true).containsEntry("reason", "DEVICE_CONTROL_OFFLINE");
        Map<String, Object> online = engine.controlDevice(deviceId,
                Map.of("targetStatus", "ONLINE", "idempotencyKey", "test-online-" + deviceId), admin);
        assertThat(online).containsEntry("commandStatus", "SUCCEEDED");
        assertThat(Jsons.map(new ObjectMapper(), online.get("device"))).containsEntry("status", "ONLINE");
    }

    @Test
    void realDeviceControlChangesStatusOnlyAfterAck() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        String deviceId = "real-device-control-" + System.nanoTime();
        store.save("device", deviceId, new java.util.LinkedHashMap<>(Map.of(
                "deviceId", deviceId, "farmId", "farm-demo", "plotId", "plot-a01", "bindingState", "BOUND",
                "status", "ONLINE", "sourceMode", "REAL", "dataOrigin", "HARDWARE")));
        Map<String, Object> pending = engine.controlDevice(deviceId,
                Map.of("targetStatus", "OFFLINE", "idempotencyKey", "real-offline-" + deviceId), admin);
        assertThat(pending).containsEntry("commandStatus", "PENDING").containsEntry("status", "ONLINE");
        Map<String, Object> command = store.find("command", String.valueOf(pending.get("commandId")));
        engine.handleDeviceControlAck(command, Map.of("status", "SUCCEEDED", "receivedAt", Instant.now().toString()));
        assertThat(store.find("device", deviceId)).containsEntry("status", "OFFLINE").containsEntry("controlStatus", "SUCCEEDED");
    }

    @Test
    void memberScopeUpdatePreservesOtherFarmAndRejectsRoleMutation() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        String suffix = String.valueOf(System.nanoTime());
        String farmId = "farm-other-" + suffix;
        String plotId = "plot-other-" + suffix;
        String userId = "farmer-scope-" + suffix;
        store.save("farm", farmId, new java.util.LinkedHashMap<>(Map.of("farmId", farmId, "name", "其他农场")));
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of("plotId", plotId, "farmId", farmId, "name", "其他农场地块", "status", "ACTIVE")));
        assertThat(store.createUser(new java.util.LinkedHashMap<>(Map.of(
                "userId", userId, "username", userId, "passwordHash", "unused", "role", "FARMER",
                "farmIds", List.of("farm-demo", farmId), "plotIds", List.of("plot-a01", plotId), "enabled", true, "credentialVersion", 1)))).isTrue();

        Map<String, Object> updated = adminManagement.updateFarmMemberScope(userId,
                Map.of("farmId", "farm-demo", "plotIds", List.of("plot-a02")), admin);
        assertThat(updated.get("plotIds")).isEqualTo(List.of("plot-a02"));
        assertThat(Jsons.strings(store.userById(userId).get("plotIds"))).containsExactlyInAnyOrder("plot-a02", plotId);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> adminManagement.updateFarmMemberScope(userId,
                        Map.of("farmId", "farm-demo", "plotIds", List.of("plot-a01"), "role", "FARM_ADMIN"), admin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("MEMBER_ROLE_IMMUTABLE"));
    }

    @Test
    void farmManagerCanCreateUpdateAndRemoveFarmerMembership() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        String suffix = String.valueOf(System.nanoTime());
        String username = "worker." + suffix;

        Map<String, Object> created = adminManagement.createFarmMember(new java.util.LinkedHashMap<>(Map.of(
                "farmId", "farm-demo", "username", username, "password", "Field2026!",
                "plotIds", List.of("plot-a01"))), admin);
        String userId = String.valueOf(created.get("userId"));
        assertThat(created).containsEntry("username", username).containsEntry("role", "FARMER");
        assertThat(created.get("plotIds")).isEqualTo(List.of("plot-a01"));

        Map<String, Object> updated = adminManagement.updateFarmMemberScope(userId,
                Map.of("farmId", "farm-demo", "plotIds", List.of("plot-a02")), admin);
        assertThat(updated.get("plotIds")).isEqualTo(List.of("plot-a02"));

        Map<String, Object> removed = adminManagement.deleteFarmMember(userId, "farm-demo", admin);
        assertThat(removed).containsEntry("removed", true).containsEntry("userId", userId);
        assertThat(Jsons.strings(store.userById(userId).get("farmIds"))).doesNotContain("farm-demo");
    }

    @Test
    void simulatorControlDisabledIsUnavailableWithoutSupervisor() {
        AgriProperties properties = new AgriProperties();
        properties.setSimulatorControlEnabled(false);
        SimulatorControl simulator = new SimulatorControl(properties, null);
        assertThat(simulator.status()).containsEntry("available", false)
                .containsEntry("status", "UNAVAILABLE")
                .containsEntry("reason", "SIMULATOR_CONTROL_DISABLED");
        org.assertj.core.api.Assertions.assertThatThrownBy(simulator::start)
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("SIMULATOR_CONTROL_DISABLED"));
    }

    @Test
    void cropPackPlanKeepsTemplateProvenanceAndApprovalIsIdempotent() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        Map<String, Object> batch = adminManagement.createCropBatch(new java.util.LinkedHashMap<>(Map.of(
                "farmId", "farm-demo", "plotId", "plot-a02", "cropCode", "tomato",
                "plantedAt", java.time.LocalDate.now().toString(), "plannedCycleDays", 8)), admin);
        String batchId = String.valueOf(batch.get("batchId"));
        Map<String, Object> plan = adminManagement.generateCropBatchPlan(batchId, Map.of(), admin);
        List<Map<String, Object>> tasks = Jsons.maps(new com.fasterxml.jackson.databind.ObjectMapper(), plan.get("tasks"));
        assertThat(plan).containsEntry("sourceMode", "DERIVED").containsEntry("scheduleMethod", "EVEN_STAGE_SPLIT");
        assertThat(tasks).isNotEmpty().allSatisfy(task -> assertThat(task).containsKeys("templateRef", "stageCode", "scheduleDate", "sourceMode"));

        List<Map<String, Object>> adjusted = tasks.stream().map(java.util.LinkedHashMap::new).map(task -> (Map<String, Object>) task).toList();
        adjusted.get(0).put("scheduleDate", java.time.LocalDate.parse(String.valueOf(adjusted.get(0).get("scheduleDate"))).plusDays(1).toString());
        Map<String, Object> approved = adminManagement.reviewCropBatchPlan(batchId,
                Map.of("decision", "APPROVE", "idempotencyKey", "approve-" + batchId, "tasks", adjusted), admin);
        List<String> firstIds = Jsons.strings(approved.get("workOrderIds"));
        assertThat(firstIds).isNotEmpty();
        assertThat(store.list("work-order").stream().filter(work -> firstIds.contains(Jsons.text(work, "workOrderId", ""))).toList())
                .allSatisfy(work -> assertThat(work).containsEntry("sourceType", "CROP_PLAN")
                        .containsEntry("sourceRef", approved.get("planId")).containsEntry("cropBatchId", batchId).containsKey("templateRef"));

        Map<String, Object> repeated = adminManagement.reviewCropBatchPlan(batchId, Map.of("decision", "APPROVE"), admin);
        assertThat(Jsons.strings(repeated.get("workOrderIds"))).containsExactlyElementsOf(firstIds);
    }

    @Test
    void valueLedgerUsesOnlyExplicitOrObservedFacts() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        Map<String, Object> incomplete = adminManagement.createValueLedger(new java.util.LinkedHashMap<>(Map.of(
                "farmId", "farm-demo", "plotId", "plot-a01", "plannedWaterLitres", 100)), admin);
        assertThat(incomplete).containsEntry("status", "INCOMPLETE");
        assertThat(Jsons.map(new com.fasterxml.jackson.databind.ObjectMapper(), incomplete.get("metrics")).get("waterCost")).isNull();

        Map<String, Object> computed = adminManagement.createValueLedger(new java.util.LinkedHashMap<>(Map.of(
                "farmId", "farm-demo", "plotId", "plot-a01", "plannedWaterLitres", 100,
                "actualWaterLitres", 80, "waterPricePerLitre", 0.004, "sourceMode", "USER_PROVIDED")), admin);
        assertThat(computed).containsEntry("status", "COMPUTED").containsEntry("sourceMode", "USER_PROVIDED");
        assertThat(Jsons.map(new com.fasterxml.jackson.databind.ObjectMapper(), computed.get("metrics")))
                .containsEntry("waterSavingLitres", 20.0).containsEntry("waterCost", 0.32);
    }

    @Test
    void recentInspectionEvidenceAppearsInDiagnosisAndDecisionPassportWithoutReplacingTelemetry() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        engine.ingest(Map.of("eventId", "human-conflict-" + System.nanoTime(), "farmId", "farm-demo", "plotId", "plot-a01",
                "deviceId", "mock-plot-a01", "metric", "SOIL_MOISTURE", "value", 31.0, "unit", "%",
                "scenarioId", "normal", "ts", Instant.now().toString()));
        Map<String, Object> inspection = engine.createInspection(new java.util.LinkedHashMap<>(Map.of(
                "farmId", "farm-demo", "plotId", "plot-a01", "observedAt", Instant.now().toString(),
                "soilSurface", "DRY", "cropCondition", "LEAF_SLIGHT_WILT", "deviceStatus", "NORMAL",
                "portableSoilMoisture", 18.0, "notes", "现场复测与在线值存在差异")), admin);
        String traceId = "human-passport-" + System.nanoTime();
        Map<String, Object> diagnosis = engine.diagnose("plot-a01", Map.of("traceId", traceId, "scenarioId", "normal"));
        assertThat(Jsons.maps(new com.fasterxml.jackson.databind.ObjectMapper(), diagnosis.get("humanObservations")))
                .anySatisfy(item -> assertThat(item).containsEntry("inspectionId", inspection.get("inspectionId")).containsEntry("provenance", "USER_PROVIDED"));
        assertThat(Jsons.maps(new com.fasterxml.jackson.databind.ObjectMapper(), diagnosis.get("evidenceConflicts")))
                .anySatisfy(item -> assertThat(item).containsEntry("type", "PORTABLE_VS_TELEMETRY"));
        Map<String, Object> passport = engine.passport(traceId, admin);
        assertThat(Jsons.maps(new com.fasterxml.jackson.databind.ObjectMapper(), passport.get("humanObservations")))
                .anySatisfy(item -> assertThat(item).containsEntry("inspectionId", inspection.get("inspectionId")));
    }

    @Test
    void cropPacksExposeStageTemplatesAndHandbook() {
        assertThat(engine.cropPacks()).hasSize(9).allSatisfy(pack -> {
            assertThat(pack).containsKeys("identity", "stages", "metrics", "rules", "healthProfile", "knowledge");
            assertThat(Jsons.maps(new ObjectMapper(), pack.get("stages"))).isNotEmpty().allSatisfy(stage -> {
                assertThat(stage).containsKeys("code", "label", "target", "riskFocus", "taskTemplates");
                assertThat(Jsons.maps(new ObjectMapper(), stage.get("taskTemplates"))).isNotEmpty();
            });
        });
        Map<String, Object> manuals = Map.of("index", engine.cropManuals());
        assertThat(Jsons.maps(new ObjectMapper(), manuals.get("index"))).extracting(item -> item.get("cropCode"))
                .containsExactly("corn", "cucumber", "eggplant", "lettuce", "pepper", "rice", "strawberry", "sunflower", "tomato");

        Map<String, Object> seedling = engine.cropManual("tomato", "seedling");
        Map<String, Object> fruiting = engine.cropManual("tomato", "fruiting");
        assertThat(Jsons.text(Jsons.map(new ObjectMapper(), seedling.get("stage")), "label", "")).isEqualTo("苗期");
        assertThat(Jsons.maps(new ObjectMapper(), seedling.get("rules")))
                .anySatisfy(rule -> assertThat(rule).containsEntry("code", "WATER_DEFICIT").containsEntry("threshold", 30.0));
        assertThat(Jsons.maps(new ObjectMapper(), fruiting.get("rules")))
                .anySatisfy(rule -> assertThat(rule).containsEntry("code", "WATER_DEFICIT").containsEntry("threshold", 20.0));
        assertThat((List<?>) seedling.get("guideParagraphs")).isNotEmpty();
        assertThat(Jsons.map(new ObjectMapper(), seedling.get("knowledge")).get("content")).asList().isNotEmpty();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.cropManual("tomato", "unknown-stage"))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("CROP_STAGE_NOT_FOUND"));
    }

    @Test
    void rulesDiagnosisForecastAndHealthFollowGrowthStage() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02", "plot-b01"));
        String plotId = "plot-stage-" + System.nanoTime();
        var authentication = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(admin, null, List.of());
        responseData(controller.createPlot(new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", "阶段解析试验田",
                "cropCode", "tomato", "cropName", "番茄", "cropVariety", "demonstration",
                "stageCode", "seedling", "areaM2", 80, "growthCycleDays", 90
        )), authentication));
        Map<String, Object> batch = store.find("crop-batch", "batch-" + plotId);
        if (batch == null) {
            batch = new java.util.LinkedHashMap<>();
            batch.put("batchId", "batch-" + plotId); batch.put("farmId", "farm-demo"); batch.put("plotId", plotId);
            batch.put("cropCode", "tomato"); batch.put("stageCode", "seedling"); batch.put("cropPackVersion", "1.1.0");
            store.save("crop-batch", "batch-" + plotId, batch);
        } else {
            batch.put("stageCode", "seedling");
            batch.put("cropPackVersion", "1.1.0");
            store.save("crop-batch", Jsons.text(batch, "batchId", "batch-" + plotId), batch);
        }

        Instant now = Instant.now();
        engine.ingest(Map.of("eventId", "stage-moist-" + System.nanoTime(), "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", 25.0, "unit", "%",
                "scenarioId", "normal", "ts", now.toString()));
        Map<String, Object> seedlingDiagnosis = engine.diagnose(plotId, Map.of("scenarioId", "normal"));
        assertThat(seedlingDiagnosis).containsEntry("primaryCause", "WATER_DEFICIT").containsEntry("stageCode", "seedling");
        assertThat(Jsons.map(new ObjectMapper(), seedlingDiagnosis.get("thresholds"))).containsEntry("WATER_DEFICIT", 30.0);

        Map<String, Object> plot = store.find("plot", plotId);
        plot.put("stageCode", "fruiting");
        store.save("plot", plotId, plot);
        batch.put("stageCode", "fruiting");
        store.save("crop-batch", Jsons.text(batch, "batchId", "batch-" + plotId), batch);
        Map<String, Object> fruitingDiagnosis = engine.diagnose(plotId, Map.of("scenarioId", "normal"));
        assertThat(fruitingDiagnosis).containsEntry("primaryCause", "INSUFFICIENT_EVIDENCE").containsEntry("stageCode", "fruiting");

        Instant forecastAt = Instant.now();
        for (int i = 0; i < 8; i++) {
            engine.ingest(Map.of("eventId", "stage-fc-" + i + "-" + System.nanoTime(), "farmId", "farm-demo", "plotId", plotId,
                    "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", 28.0 - i, "unit", "%",
                    "scenarioId", "normal", "ts", forecastAt.minusSeconds(8L - i).toString()));
        }
        Map<String, Object> fruitingForecast = engine.forecast(plotId, "SOIL_MOISTURE");
        assertThat(fruitingForecast).containsEntry("status", "AVAILABLE").containsEntry("stageCode", "fruiting");
        assertThat(Jsons.map(new ObjectMapper(), fruitingForecast.get("riskBoundary"))).containsEntry("value", 20.0);

        plot.put("stageCode", "seedling");
        store.save("plot", plotId, plot);
        batch.put("stageCode", "seedling");
        store.save("crop-batch", Jsons.text(batch, "batchId", "batch-" + plotId), batch);
        Map<String, Object> seedlingForecast = engine.forecast(plotId, "SOIL_MOISTURE");
        assertThat(Jsons.map(new ObjectMapper(), seedlingForecast.get("riskBoundary"))).containsEntry("value", 30.0);

        Map<String, Object> health = engine.plotHealth(plotId);
        assertThat(health).containsKeys("score", "level", "metricScore", "deviceScore", "algorithmVersion", "stageCode");
        assertThat((Double) health.get("score")).isBetween(0.05, 0.98);
        Map<String, Object> handbook = engine.plotCropManual(plotId);
        assertThat(handbook).containsEntry("cropCode", "tomato").containsEntry("plotId", plotId);
        assertThat(Jsons.text(Jsons.map(new ObjectMapper(), handbook.get("stage")), "code", "")).isEqualTo("seedling");

        Map<String, Object> cucumberProfile = engine.resolvedProfile("plot-b01");
        assertThat(cucumberProfile).containsEntry("cropCode", "cucumber").containsEntry("stageCode", "fruiting");
        assertThat(Jsons.maps(new ObjectMapper(), Jsons.map(new ObjectMapper(), cucumberProfile.get("cropPack")).get("effectiveRules")))
                .anySatisfy(rule -> assertThat(rule).containsEntry("code", "WATER_DEFICIT").containsEntry("threshold", 24.0));
    }

    @Test
    void plotSimulationStrategiesAreIndependentAndResetKeepsHardwareTelemetry() {
        String suffix = String.valueOf(System.nanoTime());
        String droughtPlot = "plot-sim-drought-" + suffix;
        String rainPlot = "plot-sim-rain-" + suffix;
        for (String plotId : List.of(droughtPlot, rainPlot)) {
            store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                    "plotId", plotId, "farmId", "farm-demo", "name", plotId,
                    "status", "ACTIVE", "cropCode", "tomato", "cropName", "番茄",
                    "stageCode", "fruiting", "stageLabel", "结果期", "cropPackVersion", "1.0.0")));
        }
        UserPrincipal systemAdmin = new UserPrincipal("user-system-simulation", "sysadmin", "SYSTEM_ADMIN",
                List.of("farm-demo"), List.of("*"));

        Map<String, Object> drought = engine.updatePlotSimulation(droughtPlot, Map.of(
                "scenario", "DROUGHT", "parameters", Map.of("volatility", 2.4, "soilMoistureTrendPerHour", -5.0)), systemAdmin);
        Map<String, Object> heavyRain = engine.updatePlotSimulation(rainPlot, Map.of(
                "scenario", "HEAVY_RAIN", "parameters", Map.of("rainfallRate", 55.0)), systemAdmin);
        assertThat(drought).containsEntry("scenario", "DROUGHT");
        assertThat(heavyRain).containsEntry("scenario", "HEAVY_RAIN");
        assertThat(Jsons.number(Jsons.map(new ObjectMapper(), drought.get("parameters")), "soilMoistureTrendPerHour", 0))
                .isEqualTo(-5.0);
        assertThat(Jsons.number(Jsons.map(new ObjectMapper(), drought.get("parameters")), "timeScale", 0))
                .isEqualTo(144.0);
        assertThat(Jsons.number(Jsons.map(new ObjectMapper(), heavyRain.get("parameters")), "rainfallRate", 0))
                .isEqualTo(55.0);
        assertThat(engine.plotSimulation(droughtPlot, systemAdmin).get("scenario")).isEqualTo("DROUGHT");
        assertThat(engine.plotSimulation(rainPlot, systemAdmin).get("scenario")).isEqualTo("HEAVY_RAIN");

        String simulatedEvent = "sim-reset-" + suffix;
        String realEvent = "real-preserve-" + suffix;
        engine.ingest(Map.ofEntries(Map.entry("eventId", simulatedEvent), Map.entry("farmId", "farm-demo"), Map.entry("plotId", droughtPlot),
                Map.entry("deviceId", "mock-" + droughtPlot), Map.entry("metric", "SOIL_MOISTURE"), Map.entry("value", 41.0), Map.entry("unit", "%"),
                Map.entry("sourceMode", "SIMULATION"), Map.entry("dataOrigin", "SIMULATOR"), Map.entry("scenarioId", "drought"), Map.entry("ts", Instant.now().toString())));
        engine.ingest(Map.ofEntries(Map.entry("eventId", realEvent), Map.entry("farmId", "farm-demo"), Map.entry("plotId", droughtPlot),
                Map.entry("deviceId", "bearpi-e53"), Map.entry("metric", "SOIL_MOISTURE"), Map.entry("value", 40.5), Map.entry("unit", "%"),
                Map.entry("sourceMode", "REAL"), Map.entry("dataOrigin", "HARDWARE"), Map.entry("scenarioId", "hardware"), Map.entry("ts", Instant.now().plusMillis(10).toString())));

        Map<String, Object> reset = engine.resetPlotSimulation(droughtPlot, "HISTORY", systemAdmin);
        assertThat(reset).containsEntry("hardwareTelemetryPreserved", true).containsEntry("resetTarget", "HISTORY");
        assertThat(store.telemetry(droughtPlot, "SOIL_MOISTURE", Instant.EPOCH, Instant.now().plusSeconds(5), 100))
                .anySatisfy(event -> assertThat(event).containsEntry("eventId", realEvent)
                        .containsEntry("sourceMode", "REAL"))
                .noneMatch(event -> simulatedEvent.equals(event.get("eventId")));
    }

    @Test
    void strategyAwareForecastCurvesMoveInOppositeDirections() {
        String plotId = "plot-sim-forecast-" + System.nanoTime();
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", plotId, "status", "ACTIVE",
                "cropCode", "tomato", "cropName", "番茄", "stageCode", "fruiting", "stageLabel", "结果期",
                "cropPackVersion", "1.0.0", "metrics", Map.of("SOIL_MOISTURE", Map.of("value", 45.0, "unit", "%")))));
        Instant start = Instant.now().minusSeconds(8 * 60L);
        for (int i = 0; i < 8; i++) {
            engine.ingest(Map.of("eventId", "sim-forecast-" + plotId + "-" + i, "farmId", "farm-demo", "plotId", plotId,
                    "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", 45.0, "unit", "%",
                    "sourceMode", "SIMULATION", "scenarioId", "normal", "ts", start.plusSeconds(i * 60L).toString()));
        }
        UserPrincipal admin = new UserPrincipal("user-system-forecast", "sysadmin", "SYSTEM_ADMIN",
                List.of("farm-demo"), List.of("*"));
        engine.updatePlotSimulation(plotId, Map.of("scenario", "DROUGHT"), admin);
        Map<String, Object> drought = engine.forecast(plotId, "SOIL_MOISTURE");
        engine.updatePlotSimulation(plotId, Map.of("scenario", "HEAVY_RAIN"), admin);
        Map<String, Object> rain = engine.forecast(plotId, "SOIL_MOISTURE");
        List<Map<String, Object>> droughtCurve = Jsons.maps(new ObjectMapper(), drought.get("curve"));
        List<Map<String, Object>> rainCurve = Jsons.maps(new ObjectMapper(), rain.get("curve"));
        assertThat(drought).containsEntry("status", "AVAILABLE");
        assertThat(rain).containsEntry("status", "AVAILABLE");
        assertThat(Jsons.text(Jsons.map(new ObjectMapper(), drought.get("riskBoundary")), "operator", ""))
                .isEqualTo("LT");
        assertThat(Jsons.text(Jsons.map(new ObjectMapper(), rain.get("riskBoundary")), "operator", ""))
                .isEqualTo("GT");
        assertThat(Jsons.number(droughtCurve.get(droughtCurve.size() - 1), "expected", 0))
                .isLessThan(Jsons.number(droughtCurve.get(0), "expected", 0));
        assertThat(Jsons.number(rainCurve.get(rainCurve.size() - 1), "expected", 0))
                .isGreaterThan(Jsons.number(rainCurve.get(0), "expected", 0));
    }

    @Test
    void readOnlyForecastEvaluationEchoesVersionAndNeverPersistsStrategyOrForecast() {
        String plotId = "plot-what-if-" + System.nanoTime();
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", plotId, "status", "ACTIVE",
                "cropCode", "tomato", "cropName", "番茄", "stageCode", "fruiting", "stageLabel", "结果期",
                "cropPackVersion", "1.0.0", "metrics", Map.of("SOIL_MOISTURE", Map.of("value", 45.0, "unit", "%")))));
        Instant start = Instant.now().minusSeconds(8 * 60L);
        for (int i = 0; i < 8; i++) {
            engine.ingest(Map.of("eventId", "what-if-" + plotId + "-" + i, "farmId", "farm-demo", "plotId", plotId,
                    "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", 45.0, "unit", "%",
                    "sourceMode", "SIMULATION", "scenarioId", "normal", "ts", start.plusSeconds(i * 60L).toString()));
        }
        UserPrincipal admin = new UserPrincipal("user-what-if", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of(plotId));
        Map<String, Object> beforeStrategy = engine.plotSimulation(plotId, admin);
        int forecastCount = store.list("forecast").size();

        Map<String, Object> drought = engine.evaluateForecast(Map.of(
                "plotId", plotId, "metric", "SOIL_MOISTURE", "scenario", "DROUGHT", "requestVersion", "preview-17",
                "parameters", Map.of("soilMoistureTrendPerHour", -5.0, "forecastHours", 2)), admin);
        Map<String, Object> rain = engine.evaluateForecast(Map.of(
                "plotId", plotId, "metric", "SOIL_MOISTURE", "scenario", "HEAVY_RAIN", "requestVersion", "preview-18",
                "parameters", Map.of("rainfallRate", 48.0, "forecastHours", 2)), admin);
        List<Map<String, Object>> droughtCurve = Jsons.maps(new ObjectMapper(), drought.get("curve"));
        List<Map<String, Object>> rainCurve = Jsons.maps(new ObjectMapper(), rain.get("curve"));

        assertThat(drought).containsEntry("persisted", false)
                .containsEntry("requestVersion", "preview-17")
                .containsEntry("modelMode", "DETERMINISTIC_WHAT_IF")
                .containsKeys("dataSource", "inputSnapshot", "explanation", "warnings");
        assertThat(Jsons.number(droughtCurve.get(0), "expected", 0)).isEqualTo(45.0);
        assertThat(Jsons.number(droughtCurve.get(droughtCurve.size() - 1), "expected", 0)).isLessThan(45.0);
        assertThat(Jsons.number(rainCurve.get(rainCurve.size() - 1), "expected", 0)).isGreaterThan(45.0);
        assertThat(store.list("forecast")).hasSize(forecastCount);
        Map<String, Object> afterStrategy = engine.plotSimulation(plotId, admin);
        assertThat(afterStrategy.get("scenario")).isEqualTo(beforeStrategy.get("scenario"));
        assertThat(afterStrategy.get("parameters")).isEqualTo(beforeStrategy.get("parameters"));
        assertThat(afterStrategy.get("revision")).isEqualTo(beforeStrategy.get("revision"));

        Map<String, Object> bounded = engine.evaluateForecast(Map.of(
                "plotId", plotId, "scenario", "DROUGHT", "parameters", Map.of("volatility", 99)), admin);
        Map<String, Object> boundedSnapshot = Jsons.map(new ObjectMapper(), bounded.get("inputSnapshot"));
        assertThat(Jsons.number(Jsons.map(new ObjectMapper(), boundedSnapshot.get("parameters")), "volatility", 0)).isEqualTo(3.0);
        assertThat(Jsons.strings(bounded.get("warnings"))).anyMatch(value -> value.contains("volatility"));
        assertThat(store.list("forecast")).hasSize(forecastCount);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.evaluateForecast(Map.of(
                        "plotId", plotId, "scenario", "DROUGHT",
                        "parameters", Map.of("riskThreshold", 85, "waterloggingThreshold", 80)), admin))
                .isInstanceOfSatisfying(ApiException.class, exception -> assertThat(exception.code).isEqualTo("SIMULATION_THRESHOLD_INVALID"));
        UserPrincipal outsider = new UserPrincipal("user-outsider", "farmer-x", "FARMER", List.of("farm-other"), List.of());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.evaluateForecast(Map.of("plotId", plotId), outsider))
                .isInstanceOfSatisfying(ApiException.class, exception -> assertThat(exception.code).isEqualTo("PLOT_FORBIDDEN"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.evaluateForecast(Map.of("scenario", "DROUGHT"), admin))
                .isInstanceOfSatisfying(ApiException.class, exception -> assertThat(exception.code).isEqualTo("PLOT_CONTEXT_REQUIRED"));
    }

    @Test
    void readOnlyForecastEvaluationReturnsUnavailableWithoutInventingCurve() {
        String plotId = "plot-what-if-empty-" + System.nanoTime();
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", plotId, "status", "ACTIVE",
                "cropCode", "tomato", "cropName", "番茄", "stageCode", "fruiting", "stageLabel", "结果期")));
        UserPrincipal admin = new UserPrincipal("user-what-if-empty", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of(plotId));
        int forecastCount = store.list("forecast").size();
        Map<String, Object> evaluated = engine.evaluateForecast(Map.of(
                "plotId", plotId, "metric", "SOIL_MOISTURE", "scenario", "NORMAL", "requestVersion", 3), admin);
        assertThat(evaluated).containsEntry("status", "UNAVAILABLE").containsEntry("persisted", false).containsEntry("requestVersion", 3);
        assertThat(Jsons.maps(new ObjectMapper(), evaluated.get("curve"))).isEmpty();
        assertThat(store.list("forecast")).hasSize(forecastCount);
    }

    @Test
    void normalForecastAnchorsEveryMetricAndDoesNotAmplifyShortWindowNoise() {
        String plotId = "plot-multimetric-forecast-" + System.nanoTime();
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", plotId, "status", "ACTIVE",
                "cropCode", "tomato", "cropName", "番茄", "stageCode", "fruiting", "stageLabel", "结果期",
                "cropPackVersion", "1.0.0", "metrics", Map.of(
                        "SOIL_MOISTURE", Map.of("value", 32.1, "unit", "%"),
                        "AIR_TEMPERATURE", Map.of("value", 26.4, "unit", "°C")))));
        Instant start = Instant.now().minusSeconds(160);
        for (int i = 0; i < 8; i++) {
            double soil = 30.0 + i * .3;
            double temperature = 25.7 + i * .1;
            engine.ingest(Map.of("eventId", "normal-soil-" + plotId + "-" + i, "farmId", "farm-demo", "plotId", plotId,
                    "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", soil, "unit", "%",
                    "sourceMode", "SIMULATION", "scenarioId", "normal", "ts", start.plusSeconds(i * 20L).toString()));
            engine.ingest(Map.of("eventId", "normal-temp-" + plotId + "-" + i, "farmId", "farm-demo", "plotId", plotId,
                    "deviceId", "mock-" + plotId, "metric", "AIR_TEMPERATURE", "value", temperature, "unit", "°C",
                    "sourceMode", "SIMULATION", "scenarioId", "normal", "ts", start.plusSeconds(i * 20L + 1).toString()));
        }
        UserPrincipal admin = new UserPrincipal("user-system-normal-forecast", "sysadmin", "SYSTEM_ADMIN",
                List.of("farm-demo"), List.of("*"));
        engine.updatePlotSimulation(plotId, Map.of("scenario", "NORMAL"), admin);

        Map<String, Object> soilForecast = engine.forecast(plotId, "SOIL_MOISTURE");
        Map<String, Object> temperatureForecast = engine.forecast(plotId, "AIR_TEMPERATURE");
        List<Map<String, Object>> soilCurve = Jsons.maps(new ObjectMapper(), soilForecast.get("curve"));
        List<Map<String, Object>> temperatureCurve = Jsons.maps(new ObjectMapper(), temperatureForecast.get("curve"));

        assertThat(soilForecast).containsEntry("status", "AVAILABLE").containsEntry("metric", "SOIL_MOISTURE");
        assertThat(temperatureForecast).containsEntry("status", "AVAILABLE").containsEntry("metric", "AIR_TEMPERATURE");
        assertThat(Jsons.number(soilCurve.get(0), "expected", 0)).isEqualTo(32.1);
        assertThat(Jsons.number(temperatureCurve.get(0), "expected", 0)).isEqualTo(26.4);
        assertThat(Math.abs(Jsons.number(soilCurve.get(soilCurve.size() - 1), "expected", 0)
                - Jsons.number(soilCurve.get(0), "expected", 0))).isLessThan(5.0);
    }

    @Test
    void forecastWithSingleRealSensorSampleDoesNotFail() {
        String plotId = "plot-single-real-" + System.nanoTime();
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", plotId, "status", "ACTIVE",
                "cropCode", "tomato", "cropName", "番茄", "stageCode", "fruiting", "stageLabel", "结果期",
                "cropPackVersion", "1.0.0")));
        engine.ingest(Map.ofEntries(
                Map.entry("eventId", "single-real-" + plotId), Map.entry("farmId", "farm-demo"),
                Map.entry("plotId", plotId), Map.entry("deviceId", "e53-ia1"),
                Map.entry("metric", "SOIL_MOISTURE"), Map.entry("value", 64.0), Map.entry("unit", "%"),
                Map.entry("sourceMode", "REAL"), Map.entry("dataOrigin", "HARDWARE"),
                Map.entry("scenarioId", "hardware"), Map.entry("ts", Instant.now().toString())));

        Map<String, Object> forecast = engine.forecast(plotId, "SOIL_MOISTURE");
        assertThat(forecast).containsEntry("status", "AVAILABLE");
        assertThat(Jsons.maps(new ObjectMapper(), forecast.get("curve"))).isNotEmpty();
        assertThat(Jsons.map(new ObjectMapper(), forecast.get("inputWindow"))).containsEntry("validSamples", 1);
    }

    @Test
    void hardwareBindingIsPlotScopedAndOverridesSimulatorStatus() {
        String suffix = String.valueOf(System.nanoTime());
        String plotId = "plot-hardware-scope-" + suffix;
        String deviceId = "e53-ia1-" + suffix;
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", plotId, "status", "ACTIVE",
                "cropCode", "tomato", "cropName", "番茄", "stageCode", "fruiting", "stageLabel", "结果期")));
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN",
                List.of("farm-demo"), List.of(plotId));
        Map<String, Object> registered = adminManagement.registerDevice(Map.of(
                "deviceId", deviceId, "farmId", "farm-demo", "name", "E53 IA1", "type", "ENVIRONMENTAL_SENSOR"), admin);
        assertThat(registered).containsEntry("bindingState", "UNBOUND");
        Map<String, Object> bound = adminManagement.bindDevice(deviceId, Map.of("plotId", plotId), admin);
        assertThat(bound).containsEntry("bindingState", "BOUND");
        engine.ingest(Map.ofEntries(
                Map.entry("eventId", "hardware-scope-" + suffix), Map.entry("farmId", "farm-demo"),
                Map.entry("plotId", plotId), Map.entry("deviceId", deviceId), Map.entry("metric", "AIR_TEMPERATURE"),
                Map.entry("value", 26.0), Map.entry("unit", "°C"), Map.entry("sourceMode", "REAL"),
                Map.entry("dataOrigin", "HARDWARE"), Map.entry("provenance", "OBSERVED"),
                Map.entry("ts", Instant.now().toString())));

        Map<String, Object> online = engine.plotSimulation(plotId, admin);
        assertThat(Jsons.map(new ObjectMapper(), online.get("hardware")))
                .containsEntry("bindingState", "BOUND")
                .containsEntry("status", "ONLINE")
                .containsEntry("usability", "AVAILABLE")
                .containsEntry("deviceId", deviceId);

        Map<String, Object> device = store.find("device", deviceId);
        device.put("status", "OFFLINE");
        device.put("lastSeen", Instant.now().minusSeconds(600).toString());
        store.save("device", deviceId, device);
        Map<String, Object> offline = engine.plotSimulation(plotId, admin);
        assertThat(Jsons.map(new ObjectMapper(), offline.get("hardware")))
                .containsEntry("bindingState", "BOUND")
                .containsEntry("status", "OFFLINE")
                .containsEntry("usability", "UNAVAILABLE");

        Map<String, Object> unbound = adminManagement.unbindDevice(deviceId, admin);
        assertThat(unbound).containsEntry("bindingState", "UNBOUND");
        assertThat(Jsons.map(new ObjectMapper(), engine.plotSimulation(plotId, admin).get("hardware")))
                .containsEntry("bindingState", "UNBOUND");
    }

    @Test
    void ruleAlertsReuseActiveRecordDuringCooldownAndHeatStressCreatesAlert() {
        String plotId = "plot-alert-" + System.nanoTime();
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", "冷却测试田", "status", "ACTIVE",
                "cropCode", "tomato", "stageCode", "fruiting")));
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of(plotId, "plot-a01"));

        Map<String, Object> first = engine.ingest(Map.of(
                "eventId", "cool-a-" + System.nanoTime(), "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", 12.0, "unit", "%",
                "scenarioId", "drought", "ts", Instant.now().toString()));
        Map<String, Object> firstAlert = Jsons.map(new ObjectMapper(), Jsons.map(new ObjectMapper(), first.get("ruleResult")).get("alert"));
        String alertId = Jsons.text(firstAlert, "alertId", "");
        assertThat(alertId).startsWith("alert-");
        assertThat(firstAlert).containsEntry("source", "WATER_DEFICIT_RULE").containsEntry("status", "ACTIVE");

        Map<String, Object> second = engine.ingest(Map.of(
                "eventId", "cool-b-" + System.nanoTime(), "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", 11.0, "unit", "%",
                "scenarioId", "drought", "ts", Instant.now().toString()));
        Map<String, Object> secondAlert = Jsons.map(new ObjectMapper(), Jsons.map(new ObjectMapper(), second.get("ruleResult")).get("alert"));
        assertThat(secondAlert).containsEntry("alertId", alertId).containsEntry("reused", true);
        assertThat(Jsons.whole(secondAlert, "occurrenceCount", 0)).isEqualTo(2);
        assertThat(store.list("alert").stream().filter(alert -> plotId.equals(Jsons.text(alert, "plotId", ""))
                && "WATER_DEFICIT_RULE".equals(Jsons.text(alert, "source", ""))).count()).isEqualTo(1);

        engine.transitionAlert(alertId, "CLOSED", admin);
        Map<String, Object> suppressed = engine.ingest(Map.of(
                "eventId", "cool-c-" + System.nanoTime(), "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "mock-" + plotId, "metric", "SOIL_MOISTURE", "value", 10.0, "unit", "%",
                "scenarioId", "drought", "ts", Instant.now().toString()));
        Map<String, Object> suppressedAlert = Jsons.map(new ObjectMapper(), Jsons.map(new ObjectMapper(), suppressed.get("ruleResult")).get("alert"));
        assertThat(suppressedAlert).containsEntry("alertId", alertId).containsEntry("suppressedByCooldown", true);
        assertThat(store.list("alert").stream().filter(alert -> plotId.equals(Jsons.text(alert, "plotId", ""))
                && "WATER_DEFICIT_RULE".equals(Jsons.text(alert, "source", ""))).count()).isEqualTo(1);

        Map<String, Object> heat = engine.ingest(Map.of(
                "eventId", "heat-a-" + System.nanoTime(), "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "mock-" + plotId, "metric", "AIR_TEMPERATURE", "value", 41.0, "unit", "°C",
                "scenarioId", "heat-wave", "ts", Instant.now().toString()));
        Map<String, Object> heatResult = Jsons.map(new ObjectMapper(), heat.get("ruleResult"));
        Map<String, Object> heatAlert = Jsons.map(new ObjectMapper(), heatResult.get("alert"));
        assertThat(heatResult).containsEntry("risk", "HEAT_STRESS");
        assertThat(heatAlert).containsEntry("source", "HEAT_STRESS_RULE").containsEntry("status", "ACTIVE")
                .containsEntry("title", "高温胁迫");
        Map<String, Object> heatAgain = engine.ingest(Map.of(
                "eventId", "heat-b-" + System.nanoTime(), "farmId", "farm-demo", "plotId", plotId,
                "deviceId", "mock-" + plotId, "metric", "AIR_TEMPERATURE", "value", 42.0, "unit", "°C",
                "scenarioId", "heat-wave", "ts", Instant.now().toString()));
        assertThat(Jsons.map(new ObjectMapper(), Jsons.map(new ObjectMapper(), heatAgain.get("ruleResult")).get("alert")))
                .containsEntry("alertId", heatAlert.get("alertId")).containsEntry("reused", true);
    }

    @Test
    void livePasswordChangeRotatesCredentialVersionAndInvalidatesPreviousJwt() {
        String username = "changer" + System.nanoTime();
        Map<String, Object> registration = engine.register(username, "FieldPass2026");
        UserPrincipal original = jwtService.parse(String.valueOf(registration.get("accessToken")));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.changePassword("wrong-pass", "NextPass2027", original))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("ACCOUNT_PASSWORD_MISMATCH"));
        Map<String, Object> changed = engine.changePassword("FieldPass2026", "NextPass2027", original);
        assertThat(changed).containsKey("accessToken");
        assertThat(store.credentialVersionMatches(original.userId, original.credentialVersion)).isFalse();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.login(username, "FieldPass2026"))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("AUTH_INVALID"));
        assertThat(engine.login(username, "NextPass2027")).containsKey("accessToken");
        UserPrincipal rotated = jwtService.parse(String.valueOf(changed.get("accessToken")));
        assertThat(store.credentialVersionMatches(rotated.userId, rotated.credentialVersion)).isTrue();
    }

    @Test
    void farmAdminCanCreateEnableAndDisableFarmerMembers() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        String username = "member" + System.nanoTime();
        Map<String, Object> created = engine.createFarmMember(new java.util.LinkedHashMap<>(Map.of(
                "farmId", "farm-demo", "username", username, "password", "MemberPass2026",
                "displayName", "测试农户", "plotIds", List.of("plot-a01"))), admin);
        assertThat(created).containsEntry("role", "FARMER").containsEntry("status", "ACTIVE")
                .containsEntry("username", username).containsKey("recoveryCode");
        assertThat(Jsons.strings(created.get("plotIds"))).containsExactly("plot-a01");
        assertThat(engine.login(username, "MemberPass2026", "FARMER")).containsKey("accessToken");

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.createFarmMember(Map.of(
                "farmId", "farm-demo", "username", username, "password", "MemberPass2026"), farmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("FARM_MEMBERS_FORBIDDEN"));

        String userId = Jsons.text(created, "userId", "");
        Map<String, Object> disabled = engine.updateFarmMemberStatus(userId, Map.of("farmId", "farm-demo", "status", "INACTIVE"), admin);
        assertThat(disabled).containsEntry("status", "INACTIVE");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.login(username, "MemberPass2026"))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("AUTH_INVALID"));
        Map<String, Object> enabled = engine.updateFarmMemberStatus(userId, Map.of("farmId", "farm-demo", "enabled", true), admin);
        assertThat(enabled).containsEntry("status", "ACTIVE");
        assertThat(engine.login(username, "MemberPass2026")).containsKey("accessToken");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.updateFarmMemberStatus("user-admin",
                Map.of("farmId", "farm-demo", "status", "INACTIVE"), admin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("MEMBER_ROLE_IMMUTABLE"));
    }

    @Test
    void inspectionPhotosPersistAsUserProvidedAttachments() throws Exception {
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        Map<String, Object> inspection = engine.createInspection(new java.util.LinkedHashMap<>(Map.of(
                "farmId", "farm-demo", "plotId", "plot-a01", "observedAt", Instant.now().toString(),
                "soilSurface", "DRY", "notes", "现场拍照核验")), farmer);
        String inspectionId = String.valueOf(inspection.get("inspectionId"));
        assertThat(Jsons.maps(new ObjectMapper(), inspection.get("photos"))).isEmpty();

        org.springframework.mock.web.MockMultipartFile photo = new org.springframework.mock.web.MockMultipartFile(
                "files", "field.jpg", "image/jpeg", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xD9});
        Map<String, Object> updated = engine.uploadInspectionPhotos(inspectionId, List.of(photo), farmer);
        List<Map<String, Object>> photos = Jsons.maps(new ObjectMapper(), updated.get("photos"));
        assertThat(photos).hasSize(1);
        assertThat(photos.get(0)).containsEntry("provenance", "USER_PROVIDED")
                .containsEntry("sourceType", "HUMAN_OBSERVATION")
                .containsEntry("contentType", "image/jpeg")
                .containsEntry("fileName", "field.jpg");
        String photoId = Jsons.text(photos.get(0), "photoId", "");
        Map<String, Object> stored = engine.inspectionPhoto(inspectionId, photoId, farmer);
        assertThat((byte[]) stored.get("bytes")).startsWith((byte) 0xFF, (byte) 0xD8);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.uploadInspectionPhotos(inspectionId,
                        List.of(new org.springframework.mock.web.MockMultipartFile("files", "notes.txt", "text/plain", "x".getBytes())), farmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("INSPECTION_PHOTO_TYPE_INVALID"));
    }

    @Test
    void farmerP0QualityGuardScenarioAndDirectExecutionContractsRemainScoped() {
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        UserPrincipal otherFarmer = new UserPrincipal("user-farmer-a02", "farmer-a02", "FARMER", List.of("farm-demo"), List.of("plot-a02"));
        engine.ingest(Map.of("eventId", "p0-quality-" + System.nanoTime(), "plotId", "plot-a01", "deviceId", "mock-plot-a01",
                "metric", "SOIL_MOISTURE", "value", 16.0, "unit", "%", "scenarioId", "normal", "ts", Instant.now().toString()));
        Map<String, Object> quality = Jsons.map(new ObjectMapper(), Jsons.map(new ObjectMapper(), engine.latestMetrics("plot-a01").get("SOIL_MOISTURE")).get("quality"));
        assertThat(quality).containsKeys("freshnessMs", "completeness", "confidence", "windowMinutes", "calculationVersion");

        Map<String, Object> compare = engine.compareScenario(Map.of("scenarioId", "farmer-readonly", "plotId", "plot-a01", "seed", 42,
                "leftBranch", "EXECUTE", "rightBranch", "NO_ACTION"), farmer);
        assertThat(compare).containsEntry("readOnly", true).containsEntry("comparisonVersion", "branch-compare-v5");
        assertThat(Jsons.map(new ObjectMapper(), compare.get("branches"))).containsKeys("EXECUTE", "NO_ACTION");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.compareScenario(Map.of(
                        "scenarioId", "forbidden", "plotId", "plot-a01", "seed", 42), otherFarmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("PLOT_FORBIDDEN"));

        String traceId = "trace-approval-" + System.nanoTime();
        String planId = "plan-approval-" + System.nanoTime();
        store.save("irrigation-plan", planId, new java.util.LinkedHashMap<>(Map.of(
                "planId", planId, "plotId", "plot-a01", "traceId", traceId, "readinessId", "ready-p0",
                "readinessStatus", "HUMAN_REVIEW", "durationSeconds", 120, "waterLitre", 40.0)));
        String key = "approval-idem-" + System.nanoTime();
        Map<String, Object> first = engine.feedback(traceId, new java.util.LinkedHashMap<>(Map.of(
                "decision", "REQUEST_APPROVAL", "planId", planId, "idempotencyKey", key)), farmer);
        Map<String, Object> repeated = engine.feedback(traceId, new java.util.LinkedHashMap<>(Map.of(
                "decision", "REQUEST_APPROVAL", "planId", planId, "idempotencyKey", key)), farmer);
        assertThat(first.get("workOrderId")).isEqualTo(repeated.get("workOrderId"));
        assertThat(store.find("work-order", String.valueOf(first.get("workOrderId"))))
                .containsEntry("actionType", "IRRIGATION_REVIEW").containsEntry("planId", planId);

        String directPlanId = "plan-direct-" + System.nanoTime();
        String directTraceId = "trace-direct-" + System.nanoTime();
        store.save("irrigation-plan", directPlanId, new java.util.LinkedHashMap<>(Map.of(
                "planId", directPlanId, "plotId", "plot-a01", "traceId", directTraceId, "readinessId", "ready-direct-p0",
                "readinessStatus", "READY", "durationSeconds", 120, "waterLitre", 40.0)));
        String directKey = "direct-idem-" + System.nanoTime();
        Map<String, Object> direct = engine.createCommand(new java.util.LinkedHashMap<>(Map.of(
                "planId", directPlanId, "plotId", "plot-a01", "idempotencyKey", directKey, "confirmed", true)), farmer);
        Map<String, Object> repeatedDirect = engine.createCommand(new java.util.LinkedHashMap<>(Map.of(
                "planId", directPlanId, "plotId", "plot-a01", "idempotencyKey", directKey, "confirmed", true)), farmer);
        assertThat(direct.get("commandId")).isEqualTo(repeatedDirect.get("commandId"));
        assertThat(direct).containsEntry("approvalRequired", false)
                .containsEntry("confirmationMode", "OPERATOR_CONFIRMED")
                .containsEntry("confirmedBy", farmer.userId);
        UserPrincipal farmAdmin = new UserPrincipal("user-admin-direct-p0", "admin-direct-p0", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.createCommand(new java.util.LinkedHashMap<>(Map.of(
                        "planId", directPlanId, "plotId", "plot-a02", "idempotencyKey", directKey, "confirmed", true)), farmAdmin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("IDEMPOTENCY_PLOT_MISMATCH"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.createCommand(new java.util.LinkedHashMap<>(Map.of(
                        "planId", directPlanId, "plotId", "plot-a01", "idempotencyKey", directKey, "confirmed", true)), otherFarmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("PLOT_FORBIDDEN"));

        String commandId = "cmd-scoped-" + System.nanoTime();
        store.save("command", commandId, new java.util.LinkedHashMap<>(Map.of(
                "commandId", commandId, "planId", planId, "plotId", "plot-a01", "status", "SUCCEEDED",
                "ack", Map.of("status", "SUCCEEDED", "receivedAt", Instant.now().toString(), "actualWaterLitre", 40.0))));
        assertThat(engine.commandById(commandId, farmer)).containsEntry("plotId", "plot-a01");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.commandById(commandId, otherFarmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("PLOT_FORBIDDEN"));
        Map<String, Object> guard = engine.irrigationGuard("plot-a01", farmer);
        assertThat(guard).containsEntry("state", "AVAILABLE").containsEntry("cooldownMinutes", 0).containsKeys("remainingSeconds", "hysteresis", "ruleVersion", "automaticWatering");
    }

    @Test
    void inProcessSimulatorUsesDefaultScaleAndDoesNotCallSupervisor() {
        simulationEngine.stop();
        simulationEngine.updateSettings(Map.of("sampleIntervalSeconds", 20, "timeScale", 144));
        Map<String, Object> status = simulatorControl.status();
        assertThat(status).containsEntry("available", true)
                .containsEntry("pid", "api")
                .containsEntry("program", "in-process");
        assertThat(Jsons.number(status, "sampleIntervalSeconds", 0)).isEqualTo(20.0);
        assertThat(Jsons.number(status, "timeScale", 0)).isEqualTo(144.0);
        assertThat(String.valueOf(status.get("status"))).isIn("RUNNING", "STOPPED");
        assertThat(status).doesNotContainKey("raw");
        Map<String, Object> started = simulationEngine.start(false);
        assertThat(started).containsEntry("status", "RUNNING").containsEntry("pid", "api");
        Map<String, Object> settings = simulationEngine.updateSettings(Map.of("sampleIntervalSeconds", 5, "timeScale", 144));
        assertThat(Jsons.number(settings, "sampleIntervalSeconds", 0)).isEqualTo(5.0);
        assertThat(Jsons.number(settings, "timeScale", 0)).isEqualTo(144.0);
        assertThat(simulationEngine.currentSampleIntervalSeconds()).isEqualTo(5);
        simulationEngine.stop();
        simulationEngine.updateSettings(Map.of("sampleIntervalSeconds", 20, "timeScale", 144));
    }

    @Test
    void simulatorSettingsAreForbiddenForFarmers() {
        UserPrincipal farmer = new UserPrincipal("user-farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a01"));
        var authentication = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(farmer, null, List.of());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.simulatorSettings(
                        Map.of("sampleIntervalSeconds", 5, "timeScale", 144), authentication))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("ADMIN_REQUIRED"));
    }

    @Test
    void inProcessIrrigationStaysInEngineStateOnFollowingTick() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        engine.updatePlotSimulation("plot-a01", Map.of("scenario", "NORMAL"), admin);
        simulationEngine.stop();
        simulationEngine.tickOnce();
        SimulationEngine.PlotState before = simulationEngine.plotState("plot-a01");
        assertThat(before).isNotNull();
        simulationEngine.applyIrrigation("plot-a01", 51.2, 80);
        SimulationEngine.PlotState watered = simulationEngine.plotState("plot-a01");
        assertThat(watered.soil).isCloseTo(before.soil + 8.0, org.assertj.core.data.Offset.offset(0.2));
        simulationEngine.tickOnce();
        SimulationEngine.PlotState afterTick = simulationEngine.plotState("plot-a01");
        assertThat(afterTick.soil).isGreaterThan(before.soil + 6.0);
    }

    @Test
    void changingSampleIntervalChangesTickSpacing() throws InterruptedException {
        simulationEngine.stop();
        simulationEngine.updateSettings(Map.of("sampleIntervalSeconds", 5, "timeScale", 144));
        long before = simulationEngine.eventsEmitted();
        simulationEngine.start(true);
        long afterImmediate = simulationEngine.eventsEmitted();
        assertThat(afterImmediate).isGreaterThan(before);
        long deadline = System.currentTimeMillis() + 7000;
        long next = afterImmediate;
        while (System.currentTimeMillis() < deadline && next <= afterImmediate) {
            Thread.sleep(200);
            next = simulationEngine.eventsEmitted();
        }
        simulationEngine.stop();
        simulationEngine.updateSettings(Map.of("sampleIntervalSeconds", 20, "timeScale", 144));
        assertThat(simulationEngine.currentSampleIntervalSeconds()).isEqualTo(20);
        assertThat(next).isGreaterThan(afterImmediate);
    }
}
