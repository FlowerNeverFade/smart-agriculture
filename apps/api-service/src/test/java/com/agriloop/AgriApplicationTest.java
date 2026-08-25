package com.agriloop;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Map;
import java.util.List;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
class AgriApplicationTest {
    @Autowired AgriEngine engine;
    @Autowired AgriStore store;
    @Autowired JwtService jwtService;

    @Test
    void seededLoginAndCropPacksWork() {
        Map<String, Object> login = engine.login("farmer", "demo123");
        assertThat(login).containsKey("accessToken");
        assertThat(engine.cropPacks()).hasSize(2);
        assertThat(new AgriProperties().getLlmMaxTokens()).isEqualTo(512);
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
        assertThat(farmerReadiness.get("status")).isEqualTo("HUMAN_REVIEW");
        assertThat(String.valueOf(farmerReadiness.get("hardGates"))).contains("permission=REVIEW");
        assertThat(String.valueOf(farmerReadiness.get("missingEvidence"))).contains("CONTROL_PERMISSION");
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
        Map<String, Object> compare = engine.compareScenario(Map.of("scenarioId", "test-branch-snapshot", "leftBranch", "NO_ACTION", "rightBranch", "EXECUTE"), systemAdmin);
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
        assertThat(String.valueOf(shortInput.get("narrative"))).contains("补充");
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
        assertThat(engine.agentConversations(20, farmer)).allMatch(item -> "user-farmer".equals(item.get("userId")));
        assertThat(engine.agentConversations(20, secondFarmer)).allMatch(item -> "user-farmer-b".equals(item.get("userId")));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.agentHistory(farmerConversation, 20, secondFarmer))
                .isInstanceOf(ApiException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.agentRun(String.valueOf(farmerAnswer.get("traceId")), secondFarmer))
                .isInstanceOf(ApiException.class);
    }
}
