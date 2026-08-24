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

    @Test
    void seededLoginAndCropPacksWork() {
        Map<String, Object> login = engine.login("farmer", "demo123");
        assertThat(login).containsKey("accessToken");
        assertThat(engine.cropPacks()).hasSize(2);
        assertThat(new AgriProperties().getLlmMaxTokens()).isEqualTo(512);
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
    void strategyCannotSkipOfflineValidation() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01", "plot-a02", "plot-b01"));
        Map<String, Object> draft = engine.strategyCandidate(Map.of("name", "safe-threshold"), admin);
        String id = String.valueOf(draft.get("candidateId"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.transitionStrategy(id, "OFFLINE_VALIDATED", admin))
                .isInstanceOf(ApiException.class);
        Map<String, Object> validated = engine.offlineValidateStrategy(id, Map.of("scenarioId", "drought", "seed", 7), admin);
        assertThat(validated.get("status")).isEqualTo("OFFLINE_VALIDATED");
        assertThat(engine.transitionStrategy(id, "APPROVED", admin).get("status")).isEqualTo("APPROVED");
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
        Map<String, Object> run = engine.scenarioRun(Map.of("scenario", "drought", "scenarioId", "test-branch-snapshot", "seed", 9, "branchId", "NO_ACTION", "generateSample", true), admin);
        Map<String, Object> snapshot = engine.scenarioSnapshot(String.valueOf(run.get("runId")), admin);
        assertThat(snapshot.get("readOnly")).isEqualTo(true);
        assertThat(((List<?>) snapshot.get("branchEvents")).size()).isGreaterThan(0);
        Map<String, Object> compare = engine.compareScenario(Map.of("scenarioId", "test-branch-snapshot", "leftBranch", "NO_ACTION", "rightBranch", "EXECUTE"), admin);
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
        UserPrincipal operator = new UserPrincipal("user-operator", "operator", "FIELD_OPERATOR", List.of("farm-demo"), List.of("plot-a01"));
        String farmerConversation = "conversation-farmer-private";
        String operatorConversation = "conversation-operator-private";

        Map<String, Object> farmerAnswer = engine.agentChat(Map.of(
                "message", "番茄现在需要关注什么", "plotId", "plot-a01", "conversationId", farmerConversation), farmer);
        engine.agentChat(Map.of(
                "message", "今天有哪些农务", "plotId", "plot-a01", "conversationId", operatorConversation), operator);

        List<?> farmerMessages = (List<?>) engine.agentHistory(farmerConversation, 20, farmer).get("messages");
        assertThat(farmerMessages).hasSize(2);
        assertThat(farmerMessages.toString()).contains("番茄现在需要关注什么").doesNotContain("今天有哪些农务");
        assertThat(engine.agentConversations(20, farmer)).allMatch(item -> "user-farmer".equals(item.get("userId")));
        assertThat(engine.agentConversations(20, operator)).allMatch(item -> "user-operator".equals(item.get("userId")));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.agentHistory(farmerConversation, 20, operator))
                .isInstanceOf(ApiException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> engine.agentRun(String.valueOf(farmerAnswer.get("traceId")), operator))
                .isInstanceOf(ApiException.class);
    }
}
