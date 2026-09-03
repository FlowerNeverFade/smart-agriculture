package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * Controlled learning governance built on top of the existing generic
 * {@code entity_record} store.  This class deliberately does not train a
 * model or mutate production rules.  It normalises the two existing case
 * streams (decision-case and alert-learning-case), applies a deterministic
 * quality gate, and records the resulting audit trail.
 */
@Service
class ControlledLearningService {
    static final String PENDING = "PENDING";
    static final String QUALIFIED = "QUALIFIED";
    static final String REJECTED = "REJECTED";

    static final String POSITIVE_RETRIEVAL = "POSITIVE_RETRIEVAL";
    static final String STRATEGY_CANDIDATE = "STRATEGY_CANDIDATE";
    static final String OFFLINE_TRAINING = "OFFLINE_TRAINING";
    static final String NEGATIVE_EVALUATION = "NEGATIVE_EVALUATION";
    static final String NONE = "NONE";

    private static final Set<String> QUALITY_STATUSES = Set.of(PENDING, QUALIFIED, REJECTED);
    private static final Set<String> POSITIVE_RESULTS = Set.of("GOOD", "SUCCESS", "SUCCEEDED", "COMPLETED", "CLEARED_NORMAL", "RESOLVED", "CLOSED");
    private static final Set<String> PARTIAL_RESULTS = Set.of("PARTIAL", "PARTIALLY_SUCCESSFUL", "EVALUABLE_PARTIAL");
    private static final Set<String> ACK_SUCCESS = Set.of("SUCCEEDED", "SUCCESS", "COMPLETED", "ACKNOWLEDGED");
    private static final Set<String> ACK_PARTIAL = Set.of("PARTIAL", "PARTIALLY_SUCCESSFUL", "EVALUABLE_PARTIAL");
    private static final Set<String> BAD_QUALITY = Set.of("BAD", "STALE", "EXPIRED", "MISSING", "INVALID", "UNKNOWN", "CONFLICT", "DRIFT", "DEGRADED");
    private static final Set<String> TERMINAL_FAILURE = Set.of("FAILED", "TIMEOUT", "TIMED_OUT", "NO_ACK", "CANCELLED", "EXECUTION_FAILED");
    private static final Duration MAX_SNAPSHOT_AGE = Duration.ofHours(6);
    private static final int MIN_CANDIDATE_CASES = 2;
    private static final double MIN_CANDIDATE_SUCCESS_RATE = .80d;
    private static final String EVALUATOR_VERSION = "controlled-learning-gate-1.2";

    private final AgriStore store;
    private final AgriEventBus events;
    private final ObjectMapper mapper;

    ControlledLearningService(AgriStore store, AgriEventBus events, ObjectMapper mapper) {
        this.store = store;
        this.events = events;
        this.mapper = mapper;
    }

    /**
     * List both existing case streams through one permission-filtered read
     * model.  A blank farm is allowed only for the platform administrator;
     * farm managers and farmers must remain in their current scope.
     */
    List<Map<String, Object>> listCases(String farmId, String plotId, String cropCode,
                                         String scenarioId, String qualityStatus, String candidateId,
                                         UserPrincipal principal) {
        requirePrincipal(principal);
        String requestedFarm = text(farmId);
        String requestedPlot = text(plotId);
        if (!requestedFarm.isBlank() && store.find("farm", requestedFarm) == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "FARM_NOT_FOUND", "农场不存在：" + requestedFarm);
        }
        if (!requestedFarm.isBlank() && !principal.isSystemAdmin() && !principal.canAccessFarm(requestedFarm)) {
            throw forbidden("无权访问该农场的学习案例");
        }
        if (!requestedPlot.isBlank()) {
            Map<String, Object> requestedPlotRecord = store.find("plot", requestedPlot);
            if (requestedPlotRecord == null) throw new ApiException(HttpStatus.NOT_FOUND, "PLOT_NOT_FOUND", "地块不存在：" + requestedPlot);
            String requestedPlotFarm = text(requestedPlotRecord.get("farmId"));
            if (!requestedFarm.isBlank() && !requestedFarm.equals(requestedPlotFarm)) {
                throw forbidden("传入的农场与地块不一致");
            }
            if (!canAccessPlot(principal, requestedPlotFarm, requestedPlot)) {
                throw forbidden("无权访问该地块的学习案例");
            }
        }
        String wantedStatus = upper(qualityStatus);
        if (!wantedStatus.isBlank() && !QUALITY_STATUSES.contains(wantedStatus)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "QUALITY_STATUS_INVALID", "案例质量状态无效");
        }
        // A migration can leave the same case in both legacy streams.  The
        // caseId is the global identity, so do not show it twice.
        Set<String> seen = new HashSet<>();
        List<Map<String, Object>> result = new ArrayList<>();
        for (String type : List.of("decision-case", "alert-learning-case")) {
            for (Map<String, Object> raw : store.list(type)) {
                Map<String, Object> row = normalize(type, raw);
                String id = text(row.get("caseId"));
                if (id.isBlank() || !seen.add(id)) continue;
                String rowFarm = text(row.get("farmId"));
                String rowPlot = text(row.get("plotId"));
                if (!requestedFarm.isBlank() && !requestedFarm.equals(rowFarm)) continue;
                if (!requestedPlot.isBlank() && !requestedPlot.equals(rowPlot)) continue;
                if (!text(cropCode).isBlank() && !text(cropCode).equalsIgnoreCase(text(row.get("cropCode")))) continue;
                if (!text(scenarioId).isBlank() && !text(scenarioId).equalsIgnoreCase(text(row.get("scenarioId")))) continue;
                if (!wantedStatus.isBlank() && !wantedStatus.equals(upper(row.get("qualityStatus")))) continue;
                if (!canRead(row, principal)) continue;
                if (!text(candidateId).isBlank() && !caseReferencesCandidate(row, text(candidateId))) continue;
                result.add(row);
            }
        }
        result.sort(Comparator.comparing((Map<String, Object> row) -> Jsons.instant(row.get("createdAt"), Instant.EPOCH)).reversed());
        return result;
    }

    /** Backward-compatible farm-scoped method used by FarmGovernanceService. */
    List<Map<String, Object>> listCases(String farmId, String candidateId, UserPrincipal principal) {
        return listCases(farmId, "", "", "", "", candidateId, principal);
    }

    /**
     * Create an alert outcome as PENDING and immediately run the deterministic
     * gate.  A candidate is never created as already validated.
     */
    Map<String, Object> createAlertCase(Map<String, Object> alert, Map<String, Object> outcome,
                                        UserPrincipal principal) {
        if (alert == null || principal == null) return Map.of();
        String plotId = text(alert.get("plotId"));
        Map<String, Object> plot = store.find("plot", plotId);
        String farmId = firstNonBlank(text(alert.get("farmId")), text(plot == null ? null : plot.get("farmId")));
        if (farmId.isBlank() || !principal.canAccessFarm(farmId) || !canAccessPlot(principal, farmId, plotId)) return Map.of();
        String alertId = text(alert.get("alertId"));
        String result = firstNonBlank(text(outcome == null ? null : outcome.get("verificationResult")),
                text(outcome == null ? null : outcome.get("result")), text(alert.get("status")), "CLOSED");
        String action = firstNonBlank(text(outcome == null ? null : outcome.get("resolutionAction")), result);
        String cause = firstNonBlank(text(outcome == null ? null : outcome.get("primaryCause")),
                text(alert.get("primaryCause")), text(alert.get("type")), "UNKNOWN");
        String crop = text(plot == null ? null : plot.get("cropCode"));
        String stage = text(plot == null ? null : plot.get("stageCode"));
        String alertType = firstNonBlank(text(alert.get("alertType")), text(alert.get("type")), "UNKNOWN");
        String signature = String.join("|", farmId, crop, stage, alertType, cause, action);

        Map<String, Object> duplicate = store.list("alert-learning-case").stream()
                .filter(c -> alertId.equals(text(c.get("alertId"))) && signature.equals(text(c.get("signature"))))
                .findFirst().orElse(null);
        if (duplicate != null) return normalize("alert-learning-case", duplicate);

        Map<String, Object> record = new LinkedHashMap<>();
        record.put("caseId", Jsons.id("alert-case"));
        record.put("alertId", alertId);
        record.put("farmId", farmId);
        record.put("plotId", plotId);
        record.put("cropCode", crop);
        record.put("stageCode", stage);
        record.put("alertType", alertType);
        record.put("primaryCause", cause);
        record.put("resolutionAction", action);
        record.put("result", result);
        String alertDataQuality = firstNonBlank(text(outcome == null ? null : outcome.get("dataQuality")), text(alert.get("dataQuality")), "UNKNOWN").toUpperCase(Locale.ROOT);
        record.put("quality", alertDataQuality);
        record.put("dataQuality", alertDataQuality);
        record.put("eligibility", PENDING);
        record.put("signature", signature);
        record.put("createdAt", Instant.now().toString());
        record.put("evidence", outcome == null ? alert.getOrDefault("evidenceRefs", List.of())
                : outcome.getOrDefault("evidenceRefs", alert.getOrDefault("evidenceRefs", List.of())));
        record.put("evidenceRefs", record.get("evidence"));
        record.put("actorId", principal.userId);
        record.put("accountId", principal.userId);
        record.put("sourceMode", firstNonBlank(text(outcome == null ? null : outcome.get("sourceMode")), text(alert.get("sourceMode")), "SIMULATION"));
        record.put("scenarioId", firstNonBlank(text(outcome == null ? null : outcome.get("scenarioId")), text(alert.get("scenarioId")), ""));
        record.put("conversationId", firstNonBlank(text(outcome == null ? null : outcome.get("conversationId")), text(alert.get("conversationId")), ""));
        record.put("simulationConfirmed", bool(outcome == null ? null : outcome.get("simulationConfirmed"))
                || bool(outcome == null ? null : outcome.get("userConfirmed")));
        record.put("sourceSnapshot", snapshotFor(record, alert, outcome, null, null, null, null));
        record.put("qualityStatus", PENDING);
        record.put("learningUses", List.of(NONE));
        record.put("qualityEvaluatorVersion", EVALUATOR_VERSION);
        store.save("alert-learning-case", text(record.get("caseId")), record);
        Map<String, Object> evaluated = evaluateAndPersist("alert-learning-case", text(record.get("caseId")), principal, true);
        events.publish("alert.learning.case.created", evaluated);
        store.logEvent("alert.learning.case.created", evaluated);
        return evaluated;
    }

    /** Create a decision case from feedback while preserving idempotency. */
    Map<String, Object> createDecisionCase(String traceId, Map<String, Object> input,
                                            Map<String, Object> feedback, Map<String, Object> plan,
                                            Map<String, Object> evaluation, UserPrincipal principal) {
        if (plan == null || principal == null) return Map.of();
        String normalizedTrace = text(traceId);
        if (normalizedTrace.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "TRACE_ID_REQUIRED", "缺少决策记录编号");
        String plotId = text(plan.get("plotId"));
        Map<String, Object> plot = store.find("plot", plotId);
        String farmId = firstNonBlank(text(plan.get("farmId")), text(plot == null ? null : plot.get("farmId")));
        if (plot == null || farmId.isBlank() || !canAccessPlot(principal, farmId, plotId)) {
            throw forbidden("无权为该地块创建学习案例");
        }
        Map<String, Object> run = store.find("agent-run", normalizedTrace);
        String runOwner = firstNonBlank(text(run == null ? null : run.get("userId")), text(run == null ? null : run.get("accountId")));
        if (!runOwner.isBlank() && !principal.userId.equals(runOwner)) throw forbidden("不能把其他账号的决策写入当前学习案例");
        String runPlot = text(run == null ? null : run.get("plotId"));
        if (!runPlot.isBlank() && !runPlot.equals(plotId)) throw forbidden("决策记录与灌溉处方地块不一致");
        String runFarm = text(run == null ? null : run.get("farmId"));
        if (!runFarm.isBlank() && !runFarm.equals(farmId)) throw forbidden("决策记录与灌溉处方农场不一致");
        String evaluationId = text(evaluation == null ? null : evaluation.get("evaluationId"));
        String planId = text(plan.get("planId"));
        String feedbackId = text(feedback == null ? null : feedback.get("feedbackId"));
        if (evaluation != null) {
            String evaluationPlan = text(evaluation.get("planId"));
            String evaluationCommand = text(evaluation.get("commandId"));
            String planCommand = text(plan.get("commandId"));
            if ((!evaluationPlan.isBlank() && !planId.equals(evaluationPlan))
                    && (planCommand.isBlank() || !planCommand.equals(evaluationCommand))) {
                throw new ApiException(HttpStatus.CONFLICT, "EVALUATION_SCOPE_MISMATCH", "效果评价与灌溉处方不一致");
            }
            String evaluationPlot = text(evaluation.get("plotId"));
            if (!evaluationPlot.isBlank() && !plotId.equals(evaluationPlot)) {
                throw new ApiException(HttpStatus.CONFLICT, "EVALUATION_SCOPE_MISMATCH", "效果评价与地块不一致");
            }
        }
        Map<String, Object> existing = store.list("decision-case").stream()
                .filter(c -> normalizedTrace.equals(text(c.get("traceId"))))
                .filter(c -> planId.isBlank() || planId.equals(text(c.get("planId"))))
                .filter(c -> evaluationId.isBlank() || evaluationId.equals(text(c.get("evaluationId"))))
                .findFirst().orElse(null);
        if (existing != null) {
            Map<String, Object> normalized = normalize("decision-case", existing);
            if (feedback != null && feedbackId.equals(text(normalized.get("feedbackId")))) return normalized;
            return normalized;
        }
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("caseId", Jsons.id("case"));
        record.put("traceId", normalizedTrace);
        record.put("planId", planId);
        record.put("evaluationId", evaluationId);
        record.put("feedbackId", feedbackId);
        record.put("farmId", farmId);
        record.put("plotId", plotId);
        record.put("cropCode", firstNonBlank(text(plot == null ? null : plot.get("cropCode")), text(plan.get("cropCode"))));
        record.put("stageCode", firstNonBlank(text(plot == null ? null : plot.get("stageCode")), text(plan.get("stageCode"))));
        record.put("primaryCause", firstNonBlank(text(input == null ? null : input.get("primaryCause")), "WATER_DEFICIT"));
        record.put("effectivenessScore", Jsons.number(evaluation, "effectivenessScore", 0));
        record.put("quality", firstNonBlank(text(evaluation == null ? null : evaluation.get("result")), "PENDING"));
        record.put("dataQuality", firstNonBlank(text(input == null ? null : input.get("dataQuality")), text(input == null ? null : input.get("telemetryQuality"))));
        record.put("ruleVersion", firstNonBlank(text(plan.get("ruleVersion")), text(plan.get("rulesVersion"))));
        record.put("cropPackVersion", firstNonBlank(text(plan.get("cropPackVersion")), text(plan.get("cropPack"))));
        record.put("scenarioId", firstNonBlank(text(input == null ? null : input.get("scenarioId")),
                Jsons.text(Jsons.map(mapper, plan.get("simulation")), "scenario", "")));
        record.put("sourceMode", firstNonBlank(text(input == null ? null : input.get("sourceMode")),
                Jsons.text(Jsons.map(mapper, plan.get("simulation")), "sourceMode", "SIMULATION")));
        record.put("simulationConfirmed", bool(input == null ? null : input.get("simulationConfirmed"))
                || bool(input == null ? null : input.get("userConfirmed"))
                || "ACCEPTED".equalsIgnoreCase(text(feedback == null ? null : feedback.get("decision")))
                || "CONFIRMED".equalsIgnoreCase(text(feedback == null ? null : feedback.get("decision"))));
        String canonicalConversation = firstNonBlank(text(run == null ? null : run.get("conversationId")),
                text(run == null ? null : run.get("sessionId")),
                text(feedback == null ? null : feedback.get("conversationId")));
        String suppliedConversation = text(input == null ? null : input.get("conversationId"));
        if (!canonicalConversation.isBlank() && !suppliedConversation.isBlank() && !canonicalConversation.equals(suppliedConversation)) {
            throw forbidden("反馈会话与决策记录不一致");
        }
        record.put("conversationId", canonicalConversation);
        // Never trust identity fields from the request body.  The principal
        // and the trace reservation are the sole source of account scope.
        record.put("accountId", principal.userId);
        record.put("actorId", principal.userId);
        record.put("agentVersion", firstNonBlank(text(plan.get("agentVersion")), "rules-only"));
        record.put("fingerprint", Integer.toHexString(Objects.hash(traceId, planId, evaluationId, feedbackId)));
        record.put("createdAt", Instant.now().toString());
        record.put("evidence", firstNonEmpty(input == null ? null : input.get("evidenceRefs"), plan.get("evidence"), List.of()));
        record.put("evidenceRefs", record.get("evidence"));
        record.put("sourceSnapshot", snapshotFor(record, null, input, plan, evaluation, null, feedback));
        record.put("qualityStatus", PENDING);
        record.put("learningUses", List.of(NONE));
        record.put("selectionReason", List.of("反馈已记录，等待确定性质量门"));
        record.put("excludedReason", List.of());
        record.put("qualityEvaluatorVersion", EVALUATOR_VERSION);
        store.save("decision-case", text(record.get("caseId")), record);
        Map<String, Object> evaluated = evaluateAndPersist("decision-case", text(record.get("caseId")), principal, true);
        events.publish("decision.case.created", evaluated);
        store.logEvent("decision.case.created", evaluated);
        return evaluated;
    }

    Map<String, Object> reEvaluate(String caseId, UserPrincipal principal) {
        CaseRef ref = findCase(caseId);
        Map<String, Object> current = normalize(ref.type, ref.record);
        if (!canRead(current, principal)) throw forbidden("无权重新评估该学习案例");
        return evaluateAndPersist(ref.type, caseId, principal, false);
    }

    /**
     * Human review can approve a complete, safe case or reject it.  It cannot
     * override a deterministic hard exclusion (failed ACK, bad data, gate
     * violation, conflict, or unconfirmed simulation).
     */
    Map<String, Object> review(String caseId, String decision, String note, UserPrincipal principal) {
        CaseRef ref = findCase(caseId);
        Map<String, Object> current = normalize(ref.type, ref.record);
        if (!canReview(current, principal)) throw forbidden("当前角色无权审核该学习案例");
        String target = upper(decision);
        if (!Set.of(QUALIFIED, REJECTED, "APPROVED").contains(target)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "QUALITY_REVIEW_INVALID", "审核结果只能是 QUALIFIED 或 REJECTED");
        }
        if ("APPROVED".equals(target)) target = QUALIFIED;
        String reviewNote = text(note);
        // Repeating the same review must be idempotent.  This is important
        // for a double-click or a retried request after a network timeout.
        if (target.equals(upper(current.get("reviewDecision")))
                && target.equals(upper(current.get("qualityStatus")))
                && reviewNote.equals(text(current.get("reviewNote")))) {
            return current;
        }
        Map<String, Object> reviewSource = new LinkedHashMap<>(current);
        if (QUALIFIED.equals(target)) {
            // A human approval is one of the explicitly allowed ways to
            // establish reproducibility. It must satisfy that condition while
            // leaving all other deterministic quality gates in force.
            reviewSource.put("humanReviewed", true);
            reviewSource.put("reviewedBy", principal.userId);
        }
        Map<String, Object> evaluated = evaluate(reviewSource, false);
        List<String> hard = strings(evaluated.get("excludedReason"));
        List<String> pending = strings(evaluated.get("pendingReason"));
        if (QUALIFIED.equals(target) && REJECTED.equals(upper(current.get("qualityStatus")))
                && !QUALIFIED.equals(upper(current.get("reviewDecision")))) {
            throw new ApiException(HttpStatus.CONFLICT, "QUALITY_CASE_REJECTED",
                    "已驳回案例不能通过普通审核重新纳入正向学习，请创建新的案例或走重新复核流程");
        }
        if (QUALIFIED.equals(target) && (!hard.isEmpty() || !pending.isEmpty())) {
            throw new ApiException(HttpStatus.CONFLICT, "QUALITY_GATE_BLOCKED", "确定性质量门仍有排除原因，不能人工强行纳入正向学习")
                    .withDetails(Map.of("excludedReason", hard, "pendingReason", pending));
        }
        current.putAll(evaluated);
        current.put("reviewedBy", principal.userId);
        current.put("reviewedAt", Instant.now().toString());
        current.put("reviewNote", reviewNote);
        current.put("reviewDecision", target);
        current.put("qualityStatus", target);
        current.put("selectionReason", target.equals(QUALIFIED)
                ? List.of("人工审核确认", "确定性质量门通过") : List.of("人工审核排除"));
        current.put("excludedReason", target.equals(REJECTED) && hard.isEmpty()
                ? List.of(firstNonBlank(text(note), "人工审核未纳入正向学习")) : hard);
        current.put("learningUses", learningUses(target, target.equals(QUALIFIED), true));
        current.put("qualityReviewRevision", Jsons.whole(current, "qualityReviewRevision", 0) + 1);
        // The review mutates the fields that participate in the quality
        // fingerprint (most importantly reviewDecision/humanReviewed).  Keep
        // the persisted fingerprint in sync so a subsequent list/read does
        // not immediately downgrade an approved case back to PENDING.
        current.put("qualityEvaluationFingerprint", evaluationFingerprint(current));
        current.put("qualityEvaluatedAt", Instant.now().toString());
        current.put("qualityEvaluatorVersion", EVALUATOR_VERSION);
        store.save(ref.type, caseId, current);
        events.publish("learning.case.reviewed", current);
        store.logEvent("learning.case.reviewed", current);
        return normalize(ref.type, current);
    }

    /**
     * Similar-case retrieval is intentionally strict.  Qualified cases from
     * another conversation/plot/farm are not returned unless an explicit
     * approved cross-scope request is made by a system administrator.
     */
    List<Map<String, Object>> similarCases(String traceId, Map<String, Object> context, UserPrincipal principal) {
        if (principal == null) principal = systemCompatibilityPrincipal();
        Map<String, Object> target = targetContext(traceId, context, principal);
        String farmId = text(target.get("farmId"));
        String plotId = text(target.get("plotId"));
        if (!farmId.isBlank() && !principal.isSystemAdmin() && !principal.canAccessFarm(farmId)) throw forbidden("无权检索该农场的学习案例");
        boolean crossFarmScope = bool(target.get("allowFarmScope")) && principal.isSystemAdmin()
                && "APPROVED".equalsIgnoreCase(text(target.get("reuseApproval")));
        String targetConversation = text(target.get("conversationId"));
        String targetAccount = text(target.get("accountId"));
        String crop = firstNonBlank(text(target.get("cropCode")), "tomato");
        String cause = firstNonBlank(text(target.get("primaryCause")), "WATER_DEFICIT");
        String stage = text(target.get("stageCode"));
        String scenario = text(target.get("scenarioId"));
        Set<String> seenCases = new HashSet<>();
        List<Map<String, Object>> result = new ArrayList<>();
        for (String type : List.of("decision-case", "alert-learning-case")) {
          for (Map<String, Object> raw : store.list(type)) {
            Map<String, Object> row = normalize(type, raw);
            if (!QUALIFIED.equals(upper(row.get("qualityStatus"))) || !strings(row.get("learningUses")).contains(POSITIVE_RETRIEVAL)) continue;
            // Governance users may inspect malformed legacy rows, but a row
            // without a live, matching farm/plot scope is never positive
            // retrieval evidence for any role.
            if (!validCaseScope(row)) continue;
            if (!canRead(row, principal)) continue;
            String rowFarm = text(row.get("farmId"));
            String rowPlot = text(row.get("plotId"));
            if (crossFarmScope) {
                if (!farmId.isBlank() && !farmId.equals(rowFarm)) continue;
            } else if (!plotId.isBlank()) {
                if (!plotId.equals(rowPlot)) continue;
            } else {
                // Without an explicit plot, a farm-level request must never
                // broaden into a plot-specific case. This keeps a case from
                // one plot out of another conversation that omitted plotId.
                if (!rowPlot.isBlank()) continue;
                if (!farmId.isBlank() && !farmId.equals(rowFarm)) continue;
            }
            // A missing context value must not broaden retrieval to another
            // session or another plot.  Legacy cases without these fields are
            // still usable only when the current request also has no value.
            if (!crossFarmScope) {
                if (targetConversation.isBlank() != text(row.get("conversationId")).isBlank()) continue;
                if (!targetConversation.isBlank() && !targetConversation.equals(text(row.get("conversationId")))) continue;
                if (targetAccount.isBlank() != text(row.get("accountId")).isBlank()) continue;
                if (!targetAccount.isBlank() && !targetAccount.equals(text(row.get("accountId")))) continue;
            }
            if (!seenCases.add(text(row.get("caseId")))) continue;
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("caseId", row.get("caseId"));
            view.put("cropCode", row.get("cropCode"));
            view.put("plotId", row.get("plotId"));
            view.put("farmId", row.get("farmId"));
            view.put("primaryCause", row.get("primaryCause"));
            view.put("result", row.get("result"));
            view.put("scenarioId", row.get("scenarioId"));
            view.put("caseType", row.get("caseType"));
            view.put("createdAt", row.get("createdAt"));
            view.put("qualityScore", row.get("qualityScore"));
            view.put("cropPackVersion", row.get("cropPackVersion"));
            view.put("selectionReason", row.get("selectionReason"));
            view.put("learningUses", List.of(POSITIVE_RETRIEVAL));
            if (crossFarmScope) {
                // Cross-farm reuse is a governance action.  Do not return the
                // originating account, conversation or raw evidence snapshot
                // to the caller even though the system administrator can read
                // the aggregate case for approval purposes.
                view.remove("accountId");
                view.remove("conversationId");
                view.put("scope", "APPROVED_CROSS_FARM");
            }
            int score = (crop.equalsIgnoreCase(text(row.get("cropCode"))) ? 3 : 0)
                    + (cause.equalsIgnoreCase(text(row.get("primaryCause"))) ? 4 : 0)
                    + (!stage.isBlank() && stage.equalsIgnoreCase(text(row.get("stageCode"))) ? 1 : 0)
                    + (!scenario.isBlank() && scenario.equalsIgnoreCase(text(row.get("scenarioId"))) ? 1 : 0)
                    + (plotId.equals(text(row.get("plotId"))) ? 1 : 0);
            view.put("similarityScore", score / 10d);
            result.add(view);
          }
        }
        result.sort(Comparator.comparingDouble((Map<String, Object> row) -> Jsons.number(row, "similarityScore", 0)).reversed()
                .thenComparing(row -> Jsons.instant(row.get("createdAt"), Instant.EPOCH), Comparator.reverseOrder()));
        return result.stream().limit(10).toList();
    }

    /** Generate a safe DRAFT candidate from already qualified cases. */
    Map<String, Object> generateStrategyCandidate(Map<String, Object> input, UserPrincipal principal) {
        requireCandidateEditor(principal);
        Map<String, Object> request = input == null ? Map.of() : input;
        String farmId = text(request.get("farmId"));
        String plotId = text(request.get("plotId"));
        if (farmId.isBlank() && !principal.isSystemAdmin()) farmId = principal.farmIds.stream().filter(id -> !"*".equals(id)).findFirst().orElse("");
        if (!farmId.isBlank() && store.find("farm", farmId) == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "FARM_NOT_FOUND", "农场不存在：" + farmId);
        }
        if (!farmId.isBlank() && !principal.isSystemAdmin() && !principal.canAccessFarm(farmId)) throw forbidden("无权为该农场生成策略候选");
        boolean crossFarmScope = principal.isSystemAdmin() && farmId.isBlank()
                && bool(request.get("allowFarmScope"))
                && "APPROVED".equalsIgnoreCase(text(request.get("reuseApproval")));
        if (farmId.isBlank() && !crossFarmScope) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "STRATEGY_SCOPE_REQUIRED", "生成策略候选必须指定农场；跨农场复用需要系统管理员明确批准");
        }
        if (!plotId.isBlank()) {
            Map<String, Object> requestedPlot = store.find("plot", plotId);
            if (requestedPlot == null) throw new ApiException(HttpStatus.NOT_FOUND, "PLOT_NOT_FOUND", "地块不存在：" + plotId);
            String requestedFarm = text(requestedPlot.get("farmId"));
            if (!farmId.isBlank() && !farmId.equals(requestedFarm)) throw forbidden("传入的农场与地块不一致");
            if (!canAccessPlot(principal, requestedFarm, plotId)) throw forbidden("无权为该地块生成策略候选");
            if (farmId.isBlank()) farmId = requestedFarm;
        }
        if (plotId.isBlank() && !principal.isSystemAdmin() && !crossFarmScope) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "STRATEGY_PLOT_REQUIRED", "生成策略候选必须指定地块范围");
        }
        List<String> requestedIds = new ArrayList<>(strings(request.get("caseIds")));
        requestedIds.addAll(strings(request.get("evidenceCaseIds")));
        requestedIds = requestedIds.stream().map(String::trim).filter(id -> !id.isBlank()).distinct().toList();
        String crop = text(request.get("cropCode"));
        String scenario = text(request.get("scenarioId"));
        List<Map<String, Object>> candidates = new ArrayList<>();
        if (!requestedIds.isEmpty()) {
            // Explicit evidence is a security boundary. Never silently drop
            // an unknown, out-of-scope, or rejected id and continue with a
            // different set of cases.
            for (String requestedId : requestedIds) {
                CaseRef requested = findCaseOrNull(requestedId);
                if (requested == null) throw new ApiException(HttpStatus.NOT_FOUND, "LEARNING_CASE_NOT_FOUND", "学习案例不存在：" + requestedId);
                Map<String, Object> row = normalize(requested.type, requested.record);
                if (!validCaseScope(row)) throw new ApiException(HttpStatus.CONFLICT, "STRATEGY_EVIDENCE_SCOPE_INVALID", "学习案例缺少有效的农场或地块归属：" + requestedId);
                if (!canRead(row, principal)) throw forbidden("无权引用学习案例：" + requestedId);
                if (!caseMatchesStrategyScope(row, farmId, plotId, crop, scenario, crossFarmScope)) {
                    throw forbidden("学习案例不在请求的农场或地块范围内：" + requestedId);
                }
                if (!QUALIFIED.equals(upper(row.get("qualityStatus")))
                        || !strings(row.get("learningUses")).contains(STRATEGY_CANDIDATE)) {
                    throw new ApiException(HttpStatus.CONFLICT, "STRATEGY_EVIDENCE_NOT_QUALIFIED", "学习案例尚未通过质量门：" + requestedId);
                }
                candidates.add(row);
            }
        }
        for (Map<String, Object> raw : store.list("decision-case")) {
            Map<String, Object> row = normalize("decision-case", raw);
            if (!QUALIFIED.equals(upper(row.get("qualityStatus")))) continue;
            if (!strings(row.get("learningUses")).contains(STRATEGY_CANDIDATE)) continue;
            if (!requestedIds.isEmpty()) continue;
            if (!canRead(row, principal)) continue;
            if (!validCaseScope(row)) continue;
            if (!farmId.isBlank() && !farmId.equals(text(row.get("farmId")))) continue;
            if (!plotId.isBlank() && !plotId.equals(text(row.get("plotId")))) continue;
            if (plotId.isBlank() && !crossFarmScope && !text(row.get("plotId")).isBlank()) continue;
            if (!crop.isBlank() && !crop.equalsIgnoreCase(text(row.get("cropCode")))) continue;
            if (!scenario.isBlank() && !scenario.equalsIgnoreCase(text(row.get("scenarioId")))) continue;
            candidates.add(row);
        }
        // Alert-learning cases are also valid evidence; do not silently omit
        // them when an older deployment has not yet copied them to decision-case.
        for (Map<String, Object> raw : store.list("alert-learning-case")) {
            Map<String, Object> row = normalize("alert-learning-case", raw);
            if (!QUALIFIED.equals(upper(row.get("qualityStatus")))) continue;
            if (!strings(row.get("learningUses")).contains(STRATEGY_CANDIDATE)) continue;
            if (!requestedIds.isEmpty()) continue;
            if (!canRead(row, principal)) continue;
            if (!validCaseScope(row)) continue;
            if (!farmId.isBlank() && !farmId.equals(text(row.get("farmId")))) continue;
            if (!plotId.isBlank() && !plotId.equals(text(row.get("plotId")))) continue;
            if (plotId.isBlank() && !crossFarmScope && !text(row.get("plotId")).isBlank()) continue;
            if (!crop.isBlank() && !crop.equalsIgnoreCase(text(row.get("cropCode")))) continue;
            if (!scenario.isBlank() && !scenario.equalsIgnoreCase(text(row.get("scenarioId")))) continue;
            candidates.add(row);
        }
        // Keep one copy of an evidence case if a migration wrote it to both
        // streams.
        Map<String, Map<String, Object>> unique = new LinkedHashMap<>();
        candidates.forEach(row -> unique.putIfAbsent(text(row.get("caseId")), row));
        candidates = new ArrayList<>(unique.values());
        if (candidates.size() < MIN_CANDIDATE_CASES) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "STRATEGY_EVIDENCE_INSUFFICIENT", "至少需要 2 个通过质量门的案例才能生成策略候选")
                    .withDetails(Map.of("qualifiedCaseCount", candidates.size(), "minimum", MIN_CANDIDATE_CASES));
        }
        String signature = firstNonBlank(text(request.get("signature")), signature(candidates));
        final String candidateFarmId = farmId;
        final String candidatePlotId = plotId;
        Map<String, Object> existing = store.list("strategy-candidate").stream()
                .filter(c -> signature.equals(text(c.get("signature"))) && candidateFarmId.equals(text(c.get("farmId"))))
                .filter(c -> candidatePlotId.equals(text(c.get("plotId"))))
                .filter(c -> !Set.of("REJECTED", "ROLLED_BACK").contains(upper(c.get("status"))))
                .findFirst().orElse(null);
        if (existing != null) return existing;
        Map<String, Object> candidate = new LinkedHashMap<>();
        candidate.put("candidateId", Jsons.id("strategy"));
        candidate.put("farmId", farmId);
        candidate.put("plotId", plotId);
        candidate.put("scope", crossFarmScope ? "GLOBAL" : plotId.isBlank() ? "FARM" : "PLOT");
        candidate.put("signature", signature);
        candidate.put("status", "DRAFT");
        candidate.put("revision", 1);
        candidate.put("evidenceCaseIds", candidates.stream().map(row -> text(row.get("caseId"))).toList());
        candidate.put("evidenceCount", candidates.size());
        candidate.put("evidenceQualityStatuses", Map.of("QUALIFIED", candidates.size(), "REJECTED", 0));
        candidate.put("baselineStrategy", firstNonEmpty(request.get("baselineStrategy"), Map.of("source", "current-rules")));
        candidate.put("proposedStrategy", firstNonEmpty(request.get("proposedStrategy"), Map.of("source", "qualified-cases", "signature", signature)));
        candidate.put("provenance", "QUALIFIED_CASES_ONLY");
        candidate.put("createdBy", principal.userId);
        candidate.put("createdAt", Instant.now().toString());
        candidate.put("offlineValidation", Map.of("status", "NOT_RUN"));
        store.save("strategy-candidate", text(candidate.get("candidateId")), candidate);
        events.publish("strategy.candidate.created", candidate);
        store.logEvent("strategy.candidate.created", candidate);
        return candidate;
    }

    /** Deterministic offline replay; only a passing report advances the state. */
    Map<String, Object> offlineValidateCandidate(String candidateId, Map<String, Object> input, UserPrincipal principal) {
        requireCandidateEditor(principal);
        Map<String, Object> candidate = store.find("strategy-candidate", candidateId);
        if (candidate == null) throw new ApiException(HttpStatus.NOT_FOUND, "STRATEGY_NOT_FOUND", "策略候选不存在");
        String candidateFarm = text(candidate.get("farmId"));
        String candidatePlot = text(candidate.get("plotId"));
        if (!principal.isSystemAdmin() && (candidateFarm.isBlank() || !principal.canAccessFarm(candidateFarm))) {
            throw forbidden("无权验证该策略候选");
        }
        if (!"DRAFT".equals(upper(candidate.get("status")))) throw new ApiException(HttpStatus.CONFLICT, "STRATEGY_TRANSITION_INVALID", "只有 DRAFT 候选可以进行离线验证");
        long seed = Jsons.whole(input == null ? Map.of() : input, "seed", 42);
        String scenario = firstNonBlank(text(input == null ? null : input.get("scenarioId")), "normal");
        boolean manualBaseline = isManualBaselineCandidate(candidate);
        List<String> evidenceIds = strings(candidate.get("evidenceCaseIds"));
        List<Map<String, Object>> evidence = new ArrayList<>();
        List<String> failures = new ArrayList<>();
        boolean globalScope = "GLOBAL".equals(upper(candidate.get("scope")))
                && principal.isSystemAdmin() && candidateFarm.isBlank() && candidatePlot.isBlank();
        if (!candidateFarm.isBlank() && store.find("farm", candidateFarm) == null) failures.add("CANDIDATE_FARM_MISSING");
        if (!candidatePlot.isBlank()) {
            Map<String, Object> plot = store.find("plot", candidatePlot);
            if (plot == null) {
                failures.add("CANDIDATE_PLOT_MISSING");
            } else {
                String actualFarm = text(plot.get("farmId"));
                if (!candidateFarm.isBlank() && !candidateFarm.equals(actualFarm)) failures.add("CANDIDATE_SCOPE_MISMATCH");
                if (!principal.isSystemAdmin() && !canAccessPlot(principal, actualFarm, candidatePlot)) {
                    throw forbidden("无权验证该策略候选的地块范围");
                }
            }
        }
        if (candidateFarm.isBlank() && candidatePlot.isBlank() && !manualBaseline && !globalScope) {
            failures.add("CANDIDATE_SCOPE_MISSING");
        }
        for (String evidenceId : evidenceIds) {
            CaseRef ref = findCaseOrNull(evidenceId);
            if (ref == null) continue;
            Map<String, Object> row = normalize(ref.type, ref.record);
            evidence.add(row);
            if (!validCaseScope(row)) failures.add("EVIDENCE_SCOPE_INVALID");
            if (!canRead(row, principal)) failures.add("EVIDENCE_FORBIDDEN");
            if (!globalScope && (!candidateFarm.equals(text(row.get("farmId"))))) failures.add("EVIDENCE_FARM_MISMATCH");
            if (!globalScope && !candidatePlot.equals(text(row.get("plotId")))) failures.add("EVIDENCE_PLOT_MISMATCH");
        }
        // Legacy/manual candidates are validated against a deterministic
        // baseline contract.  They are intentionally not learning evidence:
        // they remain tagged NONE and can never be exported to positive
        // retrieval or offline training.  Case-generated candidates continue
        // to require the full evidence gate below.
        if (!manualBaseline && evidence.size() != evidenceIds.size()) failures.add("EVIDENCE_CASE_MISSING");
        if (!manualBaseline && evidence.size() < MIN_CANDIDATE_CASES) failures.add("EVIDENCE_INSUFFICIENT");
        if (!manualBaseline && evidence.stream().anyMatch(row -> !QUALIFIED.equals(upper(row.get("qualityStatus"))))) failures.add("EVIDENCE_NOT_QUALIFIED");
        if (!manualBaseline && evidence.stream().anyMatch(row -> !strings(row.get("learningUses")).contains(STRATEGY_CANDIDATE))) failures.add("EVIDENCE_USE_NOT_ALLOWED");
        double successRate = evidence.isEmpty() ? 0 : evidence.stream().filter(this::successfulCase).count() / (double) evidence.size();
        if (!manualBaseline && successRate < MIN_CANDIDATE_SUCCESS_RATE) failures.add("SUCCESS_RATE_BELOW_THRESHOLD");
        if (!manualBaseline && evidence.stream().anyMatch(row -> !strings(row.get("excludedReason")).isEmpty())) failures.add("QUALITY_GATE_REGRESSION");
        boolean safetyPassed = manualBaseline || evidence.stream().noneMatch(row -> hasGateFailure(row, "safety"));
        boolean resourcePassed = manualBaseline || evidence.stream().noneMatch(row -> hasGateFailure(row, "resource"));
        if (!safetyPassed) failures.add("SAFETY_GATE_FAILED");
        if (!resourcePassed) failures.add("RESOURCE_LIMIT_FAILED");
        String status = failures.isEmpty() ? "PASSED" : "FAILED";
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("status", status);
        report.put("validationMode", manualBaseline ? "MANUAL_BASELINE" : "QUALIFIED_CASE_REPLAY");
        report.put("learningEligible", !manualBaseline);
        report.put("evidenceRequired", !manualBaseline);
        report.put("scenarioId", scenario);
        report.put("seed", seed);
        report.put("evidenceCaseIds", evidenceIds);
        report.put("evidenceCount", evidence.size());
        report.put("successRate", successRate);
        report.put("safetyPassed", safetyPassed);
        report.put("resourcePassed", resourcePassed);
        report.put("baselineStrategy", Jsons.copy(mapper, Jsons.map(mapper, candidate.get("baselineStrategy"))));
        report.put("proposedStrategy", Jsons.copy(mapper, Jsons.map(mapper, candidate.get("proposedStrategy"))));
        report.put("caseResults", evidence.stream().map(row -> {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("caseId", text(row.get("caseId")));
            result.put("qualityStatus", text(row.get("qualityStatus")));
            result.put("result", text(row.get("result")));
            result.put("qualityScore", row.get("qualityScore"));
            result.put("digest", stableCaseDigest(row));
            return result;
        }).toList());
        report.put("assertions", List.of("quality_gate_preserved", "no_rule_bypass", "capacity_not_exceeded", "rejected_cases_excluded"));
        report.put("failures", failures);
        report.put("replayHash", Integer.toHexString(Objects.hash(candidateId, scenario, seed, evidenceIds, evidence.stream().map(this::stableCaseDigest).toList())));
        report.put("validatedAt", Instant.now().toString());
        candidate.put("offlineValidation", report);
        candidate.put("validationStatus", status);
        candidate.put("validationSeed", seed);
        candidate.put("validatedBy", principal.userId);
        if ("PASSED".equals(status)) candidate.put("status", "OFFLINE_VALIDATED");
        candidate.put("revision", Jsons.whole(candidate, "revision", 1) + 1);
        store.save("strategy-candidate", candidateId, candidate);
        events.publish("strategy.offline_validated", candidate);
        store.logEvent("strategy.offline_validated", candidate);
        return candidate;
    }

    /** Export only explicitly approved cases for an offline training job. */
    Map<String, Object> exportApprovedTrainingSet(String farmId, String plotId, UserPrincipal principal) {
        if (principal == null || !principal.isSystemAdmin()) throw forbidden("只有系统管理员可以导出离线训练集");
        List<Map<String, Object>> rows = listCases(farmId, plotId, "", "", QUALIFIED, "", principal).stream()
                .filter(row -> !text(row.get("reviewedBy")).isBlank())
                .filter(row -> "QUALIFIED".equals(upper(row.get("reviewDecision"))) || "APPROVED".equals(upper(row.get("reviewDecision"))))
                .filter(row -> strings(row.get("learningUses")).contains(OFFLINE_TRAINING))
                .map(this::trainingProjection).toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("format", "agriloop-controlled-learning-v1");
        result.put("qualityFilter", QUALIFIED);
        result.put("caseCount", rows.size());
        result.put("cases", rows);
        result.put("exportedAt", Instant.now().toString());
        result.put("modelUpdate", "NOT_PERFORMED");
        result.put("note", "仅生成离线数据，不会自动更新模型权重或生产规则");
        store.logEvent("learning.training.exported", result);
        return result;
    }

    List<Map<String, Object>> audit(int limit, UserPrincipal principal) {
        if (principal == null || !principal.isSystemAdmin()) throw forbidden("只有系统管理员可以查看学习审计");
        return store.auditLogs(limit).stream().filter(row -> text(row.get("action")).toLowerCase(Locale.ROOT).contains("learning")
                || text(row.get("action")).toLowerCase(Locale.ROOT).contains("strategy")) .toList();
    }

    /** Used by governance when a newly qualified alert case is available. */
    void maybeCreateDraftCandidate(Map<String, Object> record, UserPrincipal actor) {
        if (record == null || !QUALIFIED.equals(upper(record.get("qualityStatus")))) return;
        String signature = text(record.get("signature"));
        if (signature.isBlank()) return;
        List<Map<String, Object>> cases = listAllNormalised().stream()
                .filter(row -> QUALIFIED.equals(upper(row.get("qualityStatus"))))
                .filter(row -> signature.equals(text(row.get("signature"))))
                .filter(row -> strings(row.get("learningUses")).contains(STRATEGY_CANDIDATE))
                .toList();
        if (cases.size() < MIN_CANDIDATE_CASES) return;
        if (store.list("strategy-candidate").stream().anyMatch(c -> signature.equals(text(c.get("signature")))
                && text(record.get("farmId")).equals(text(c.get("farmId")))
                && !Set.of("REJECTED", "ROLLED_BACK").contains(upper(c.get("status"))))) return;
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("farmId", record.get("farmId"));
        input.put("plotId", record.get("plotId"));
        input.put("signature", signature);
        input.put("caseIds", cases.stream().map(row -> text(row.get("caseId"))).toList());
        try { generateStrategyCandidate(input, actor == null ? systemCompatibilityPrincipal() : actor); }
        catch (RuntimeException ignored) { /* automatic draft creation must not break alert handling */ }
    }

    // ---------------------------------------------------------------------
    // Deterministic evaluator and normalisation
    // ---------------------------------------------------------------------

    private Map<String, Object> evaluateAndPersist(String type, String caseId, UserPrincipal actor, boolean emitCandidate) {
        Map<String, Object> raw = store.find(type, caseId);
        if (raw == null) throw new ApiException(HttpStatus.NOT_FOUND, "LEARNING_CASE_NOT_FOUND", "学习案例不存在");
        Map<String, Object> normalized = normalize(type, raw);
        String fingerprint = evaluationFingerprint(normalized);
        if (fingerprint.equals(text(raw.get("qualityEvaluationFingerprint")))
                && EVALUATOR_VERSION.equals(text(raw.get("qualityEvaluatorVersion")))) return normalized;
        Map<String, Object> evaluated = evaluate(normalized, true);
        evaluated.put("qualityEvaluationFingerprint", fingerprint);
        evaluated.put("qualityEvaluatedAt", Instant.now().toString());
        evaluated.put("qualityEvaluatorVersion", EVALUATOR_VERSION);
        store.save(type, caseId, evaluated);
        store.logEvent("learning.case.evaluated", evaluated);
        if (emitCandidate && QUALIFIED.equals(upper(evaluated.get("qualityStatus")))) maybeCreateDraftCandidate(evaluated, actor);
        return normalize(type, evaluated);
    }

    private Map<String, Object> evaluate(Map<String, Object> source, boolean automatic) {
        Map<String, Object> row = new LinkedHashMap<>(source);
        List<String> positive = new ArrayList<>();
        List<String> exclusions = new ArrayList<>();
        List<String> pending = new ArrayList<>();
        Map<String, Object> snapshot = Jsons.map(mapper, row.get("sourceSnapshot"));
        Map<String, Object> plan = linkedRecord(row, "planId", "irrigation-plan");
        Map<String, Object> evaluation = linkedEvaluation(row);
        Map<String, Object> command = linkedCommand(row, plan, evaluation);
        Map<String, Object> diagnosis = linkedDiagnosis(row, plan);
        Map<String, Object> feedback = linkedFeedback(row);

        boolean snapshotPresent = !snapshot.isEmpty();
        // A case must carry the snapshot that was used for the decision. A
        // later live reading is deliberately not substituted here; doing so
        // would make an old/incomplete case appear complete by accident.
        boolean telemetryPresent = hasTelemetry(snapshot);
        String dataQuality = firstNonBlank(text(row.get("dataQuality")), snapshotQuality(snapshot),
                text(row.get("telemetryQuality")), text(row.get("quality")), "UNKNOWN").toUpperCase(Locale.ROOT);
        boolean explicitBad = BAD_QUALITY.contains(dataQuality) || bool(row.get("telemetryExpired")) || bool(row.get("dataQualityBad"));
        Instant snapshotAt = snapshotTimestamp(snapshot, row);
        boolean stale = snapshotAt != null && snapshotAt.isBefore(Instant.now().minus(MAX_SNAPSHOT_AGE));
        if (explicitBad) exclusions.add("遥测质量为" + dataQuality + "，不允许正向学习");
        if (stale) exclusions.add("输入快照或遥测已过期");
        if (bool(row.get("sensorDrift")) || bool(row.get("evidenceConflict")) || bool(row.get("sourceConflict"))
                || containsAnyIgnoreCase(text(row.get("scenarioId")), "DRIFT", "漂移")
                || containsAnyIgnoreCase(text(row.get("primaryCause")), "SENSOR_DRIFT", "传感器漂移")
                || !strings(snapshot.get("conflicts")).isEmpty()) exclusions.add("存在传感器漂移或关键证据冲突");
        if (!snapshotPresent) pending.add("缺少输入快照");
        if (!telemetryPresent) exclusions.add("缺少完整且可追溯的遥测证据，不允许正向学习");
        if (text(row.get("farmId")).isBlank() || text(row.get("plotId")).isBlank() || text(row.get("cropCode")).isBlank()) pending.add("农场、地块或作物上下文不完整");

        boolean evidence = traceableEvidence(row, snapshot, diagnosis, plan);
        boolean modelOnly = bool(row.get("modelOnly")) || bool(row.get("guessOnly"))
                || containsAnyIgnoreCase(text(row.get("provenance")), "MODEL_GUESS", "MODEL_ONLY", "GUESS");
        if (modelOnly || !evidence) exclusions.add(modelOnly ? "案例只有模型猜测，没有可追溯事实" : "缺少可追溯诊断依据");
        else positive.add("诊断依据可追溯");

        String sourceMode = upper(firstNonBlank(text(row.get("sourceMode")), Jsons.text(Jsons.map(mapper, plan == null ? null : plan.get("simulation")), "sourceMode", "")));
        boolean simulation = "SIMULATION".equals(sourceMode) || "SIMULATED".equals(sourceMode) || containsAnyIgnoreCase(text(row.get("provenance")), "SIMULATED", "SIMULATION");
        // A human quality review is not, by itself, confirmation that a
        // simulated outcome reflects an observed field result.  Simulation
        // evidence must carry an explicit confirmation marker (or an
        // explicitly confirmed feedback decision) before it can pass this
        // hard gate.
        boolean confirmedSimulation = bool(row.get("simulationConfirmed"))
                || bool(row.get("userConfirmed"))
                || (feedback != null && Set.of("ACCEPTED", "CONFIRMED").contains(upper(feedback.get("decision"))));
        if (simulation && !confirmedSimulation) exclusions.add("模拟结果尚未得到明确确认");
        else if (simulation) positive.add("模拟来源已明确标记并确认");

        String ackStatus = executionStatus(command, row);
        boolean hasAck = hasAck(command, row);
        boolean executionPending = command == null && !hasAny(row, "ackId", "ackStatus", "executionStatus");
        if (executionPending) pending.add("尚未关联执行命令");
        else if (!hasAck) {
            exclusions.add("执行没有有效 ACK，不能作为正向经验");
        } else if (TERMINAL_FAILURE.contains(ackStatus)) exclusions.add("执行结果为" + ackStatus + "，不能作为正向经验");
        else if (ACK_SUCCESS.contains(ackStatus)) positive.add("执行 ACK 成功");
        else if (ACK_PARTIAL.contains(ackStatus)) {
            if (evaluation == null || !Set.of("PARTIAL", "COMPLETED").contains(upper(evaluation.get("status")))) exclusions.add("部分成功但没有可评价结果");
            else positive.add("执行为可评价的部分成功");
        } else pending.add("执行结果尚未明确");

        String evaluationStatus = upper(evaluation == null ? row.get("evaluationStatus") : evaluation.get("status"));
        String evaluationResult = upper(evaluation == null ? row.get("evaluationResult") : evaluation.get("result"));
        boolean effectComplete = Set.of("COMPLETED", "PARTIAL", "EVALUATED").contains(evaluationStatus)
                && !evaluationResult.isBlank() && !Set.of("PENDING", "INCONCLUSIVE", "UNKNOWN", "BASELINE_UNAVAILABLE").contains(evaluationResult);
        // An absent or incomplete effect evaluation is a deterministic hard
        // exclusion.  Keeping it as PENDING would allow a caller to treat an
        // unmeasured outcome as a future positive example by accident.
        if (!effectComplete) exclusions.add("效果评价未完成或不可解释");
        else if (POSITIVE_RESULTS.contains(evaluationResult) || PARTIAL_RESULTS.contains(evaluationResult)) positive.add("效果评价已完成");

        checkGates(row, snapshot, plan, command, diagnosis, exclusions, positive);
        boolean reproducible = bool(row.get("reproducible")) || bool(row.get("reproducibility"))
                || "REPRODUCIBLE".equalsIgnoreCase(text(row.get("reproducibilityStatus")))
                || bool(snapshot.get("reproducible"));
        boolean manuallyReviewed = !text(row.get("reviewedBy")).isBlank() || bool(row.get("humanReviewed"));
        if (!reproducible && !manuallyReviewed) pending.add("尚未证明相似场景可复现或完成人工审核");
        else positive.add(reproducible ? "相似场景具备可复现标记" : "已完成人工审核");

        int dataScore = (!explicitBad && !stale && snapshotPresent && telemetryPresent) ? 20 : snapshotPresent ? 10 : 0;
        int evidenceScore = modelOnly ? 0 : evidence ? 20 : 0;
        int executionScore = ACK_SUCCESS.contains(ackStatus) ? 25 : ACK_PARTIAL.contains(ackStatus) && effectComplete ? 15 : 0;
        int effectScore = effectComplete && POSITIVE_RESULTS.contains(evaluationResult) ? 20 : effectComplete ? 12 : 0;
        int feedbackScore = (reproducible || manuallyReviewed) ? 15 : (feedback != null ? 7 : 0);
        int qualityScore = Math.max(0, Math.min(100, dataScore + evidenceScore + executionScore + effectScore + feedbackScore));

        String status;
        if (!exclusions.isEmpty()) status = REJECTED;
        else if (!pending.isEmpty() || qualityScore < 70) status = PENDING;
        else status = QUALIFIED;
        String reviewedDecision = upper(row.get("reviewDecision"));
        if (QUALIFIED.equals(reviewedDecision) && exclusions.isEmpty() && pending.isEmpty()) status = QUALIFIED;
        if (REJECTED.equals(reviewedDecision)) status = REJECTED;
        row.put("qualityStatus", status);
        row.put("eligibility", status); // compatibility with the old alert-learning-case contract
        row.put("qualityScore", qualityScore);
        row.put("selectionReason", positive.isEmpty() ? List.of("尚未通过质量门") : positive.stream().distinct().toList());
        row.put("excludedReason", exclusions.stream().distinct().toList());
        row.put("pendingReason", pending.stream().distinct().toList());
        row.put("qualityDecision", Map.of("status", status, "score", qualityScore,
                "dataQuality", dataScore, "evidence", evidenceScore, "execution", executionScore,
                "effect", effectScore, "feedbackReproducibility", feedbackScore,
                "hardExclusions", exclusions.stream().distinct().toList(), "pending", pending.stream().distinct().toList(),
                "evaluatorVersion", EVALUATOR_VERSION));
        boolean approved = QUALIFIED.equals(reviewedDecision);
        row.put("learningUses", learningUses(status, approved, manuallyReviewed));
        return row;
    }

    private Map<String, Object> normalize(String type, Map<String, Object> raw) {
        Map<String, Object> row = raw == null ? new LinkedHashMap<>() : Jsons.copy(mapper, raw);
        row.put("caseType", type);
        row.putIfAbsent("caseId", firstNonBlank(text(row.get("id")), Jsons.id("case")));
        Map<String, Object> plan = linkedRecord(row, "planId", "irrigation-plan");
        Map<String, Object> evaluation = linkedEvaluation(row);
        // Resolve the linked plan before looking up the plot.  Legacy cases
        // often carry only planId; looking up the blank plot first loses the
        // farm/crop scope and can make an otherwise valid case appear
        // incomplete.
        if (text(row.get("plotId")).isBlank() && plan != null) row.put("plotId", plan.get("plotId"));
        Map<String, Object> plot = store.find("plot", text(row.get("plotId")));
        if (text(row.get("farmId")).isBlank()) row.put("farmId", firstNonBlank(text(plan == null ? null : plan.get("farmId")), text(plot == null ? null : plot.get("farmId"))));
        if (text(row.get("cropCode")).isBlank()) row.put("cropCode", firstNonBlank(text(plot == null ? null : plot.get("cropCode")), text(plan == null ? null : plan.get("cropCode"))));
        if (text(row.get("stageCode")).isBlank()) row.put("stageCode", firstNonBlank(text(plot == null ? null : plot.get("stageCode")), text(plan == null ? null : plan.get("stageCode"))));
        if (text(row.get("evaluationId")).isBlank() && evaluation != null) row.put("evaluationId", evaluation.get("evaluationId"));
        if (text(row.get("planId")).isBlank() && evaluation != null) row.put("planId", evaluation.get("planId"));
        Map<String, Object> simulation = Jsons.map(mapper, plan == null ? null : plan.get("simulation"));
        row.putIfAbsent("scenarioId", firstNonBlank(text(simulation.get("scenarioId")), text(simulation.get("scenario")), ""));
        row.putIfAbsent("sourceMode", firstNonBlank(text(simulation.get("sourceMode")), text(row.get("dataOrigin")), ""));
        row.putIfAbsent("ruleVersion", text(plan == null ? null : plan.get("ruleVersion")));
        row.putIfAbsent("cropPackVersion", text(plan == null ? null : plan.get("cropPackVersion")));
        row.putIfAbsent("agentVersion", firstNonBlank(text(plan == null ? null : plan.get("agentVersion")), "rules-only"));
        row.putIfAbsent("conversationId", findConversationId(row));
        row.putIfAbsent("accountId", firstNonBlank(text(row.get("actorId")), text(row.get("userId")), text(row.get("submittedBy"))));
        row.putIfAbsent("sourceSnapshot", Map.of());
        String rawQualityStatus = upper(row.get("qualityStatus"));
        String normalizedQualityStatus = defaultStatus(row);
        row.put("qualityStatus", normalizedQualityStatus);
        row.putIfAbsent("qualityScore", null);
        // If a legacy QUALIFIED record has no matching evaluator fingerprint,
        // expose the reason for returning it to PENDING instead of retaining a
        // stale "passed" explanation in the governance view.
        if (QUALIFIED.equals(rawQualityStatus) && !QUALIFIED.equals(normalizedQualityStatus)) {
            row.put("selectionReason", List.of("旧质量判断已失效，等待当前质量评估器重新判断"));
            row.put("pendingReason", List.of("质量评估器版本或输入快照已变化，需要重新评估"));
        } else {
            row.putIfAbsent("selectionReason", defaultSelectionReason(row));
        }
        row.putIfAbsent("excludedReason", defaultExcludedReason(row));
        row.put("learningUses", learningUses(upper(row.get("qualityStatus")),
                "QUALIFIED".equalsIgnoreCase(text(row.get("reviewDecision"))), !text(row.get("reviewedBy")).isBlank()));
        return row;
    }

    private String defaultStatus(Map<String, Object> row) {
        String value = upper(row.get("qualityStatus"));
        // Rejected cases remain available as negative examples and audit
        // records; they must never be silently promoted by normalization.
        if (REJECTED.equals(value)) return REJECTED;
        if (PENDING.equals(value)) return PENDING;
        // A qualified status is only valid for the exact evaluator version
        // and input fingerprint that produced it.  Older records, or records
        // changed after evaluation, return to the deterministic quality gate.
        if (QUALIFIED.equals(value)) {
            String recordedFingerprint = text(row.get("qualityEvaluationFingerprint"));
            boolean current = !recordedFingerprint.isBlank()
                    && EVALUATOR_VERSION.equals(text(row.get("qualityEvaluatorVersion")))
                    && recordedFingerprint.equals(evaluationFingerprint(row));
            return current ? QUALIFIED : PENDING;
        }
        // Legacy eligibility=QUALIFIED was produced before a deterministic
        // gate existed; keep it out of retrieval until it is re-evaluated.
        return PENDING;
    }

    private List<String> defaultSelectionReason(Map<String, Object> row) {
        if (QUALIFIED.equals(upper(row.get("qualityStatus")))) return List.of("已通过质量门");
        return List.of("等待确定性质量判断");
    }

    private List<String> defaultExcludedReason(Map<String, Object> row) {
        Object value = row.get("excludedReason");
        if (value != null) return strings(value);
        if ("INCOMPLETE".equalsIgnoreCase(text(row.get("eligibility")))) return List.of("旧记录信息不完整，需重新评估");
        return List.of();
    }

    private List<String> learningUses(String status, boolean approved, boolean reviewed) {
        return switch (upper(status)) {
            case QUALIFIED -> {
                List<String> uses = new ArrayList<>(List.of(POSITIVE_RETRIEVAL, STRATEGY_CANDIDATE));
                if (approved && reviewed) uses.add(OFFLINE_TRAINING);
                yield uses;
            }
            case REJECTED -> List.of(NEGATIVE_EVALUATION);
            default -> List.of(NONE);
        };
    }

    // ---------------------------------------------------------------------
    // Linkage, scope, and small deterministic helpers
    // ---------------------------------------------------------------------

    private Map<String, Object> linkedRecord(Map<String, Object> row, String idField, String type) {
        String id = text(row.get(idField));
        return id.isBlank() ? null : store.find(type, id);
    }

    private Map<String, Object> linkedEvaluation(Map<String, Object> row) {
        String id = text(row.get("evaluationId"));
        if (!id.isBlank()) {
            Map<String, Object> value = store.find("evaluation", id);
            if (value != null) return value;
        }
        String planId = text(row.get("planId"));
        String commandId = text(row.get("commandId"));
        return store.list("evaluation").stream().filter(e -> (!planId.isBlank() && planId.equals(text(e.get("planId"))))
                || (!commandId.isBlank() && commandId.equals(text(e.get("commandId"))))).findFirst().orElse(null);
    }

    private Map<String, Object> linkedCommand(Map<String, Object> row, Map<String, Object> plan, Map<String, Object> evaluation) {
        String id = firstNonBlank(text(row.get("commandId")), text(evaluation == null ? null : evaluation.get("commandId")), text(plan == null ? null : plan.get("commandId")));
        if (!id.isBlank()) {
            Map<String, Object> value = store.find("command", id);
            if (value != null) return value;
        }
        String planId = text(row.get("planId"));
        return store.list("command").stream().filter(c -> !planId.isBlank() && planId.equals(text(c.get("planId")))).findFirst().orElse(null);
    }

    private Map<String, Object> linkedDiagnosis(Map<String, Object> row, Map<String, Object> plan) {
        String id = firstNonBlank(text(row.get("diagnosisId")), text(plan == null ? null : plan.get("diagnosisId")));
        if (!id.isBlank()) {
            Map<String, Object> value = store.find("diagnosis", id);
            if (value != null) return value;
        }
        String traceId = text(row.get("traceId"));
        return store.list("diagnosis").stream().filter(d -> !traceId.isBlank() && traceId.equals(text(d.get("traceId")))).findFirst().orElse(null);
    }

    private Map<String, Object> linkedFeedback(Map<String, Object> row) {
        String id = text(row.get("feedbackId"));
        if (!id.isBlank()) {
            Map<String, Object> value = store.find("feedback", id);
            if (value != null) return value;
        }
        String traceId = text(row.get("traceId"));
        return store.list("feedback").stream().filter(f -> !traceId.isBlank() && traceId.equals(text(f.get("traceId")))).findFirst().orElse(null);
    }

    private String findConversationId(Map<String, Object> row) {
        String direct = firstNonBlank(text(row.get("conversationId")), text(row.get("sessionId")));
        if (!direct.isBlank()) return direct;
        String trace = text(row.get("traceId"));
        if (trace.isBlank()) return "";
        return store.list("agent-run").stream().filter(run -> trace.equals(text(run.get("traceId"))))
                .map(run -> firstNonBlank(text(run.get("conversationId")), text(run.get("sessionId")))).filter(v -> !v.isBlank()).findFirst().orElse("");
    }

    private boolean canRead(Map<String, Object> row, UserPrincipal principal) {
        if (principal == null) return false;
        if (principal.isSystemAdmin()) return true;
        if (!validCaseScope(row)) return false;
        String farmId = text(row.get("farmId"));
        String plotId = text(row.get("plotId"));
        if (farmId.isBlank() || !principal.canAccessFarm(farmId)) return false;
        if (principal.isFarmer()) {
            if (plotId.isBlank() || !principal.canAccessPlot(plotId)) return false;
            String owner = firstNonBlank(text(row.get("accountId")), text(row.get("actorId")));
            // A farmer can see only cases explicitly owned by that account.
            // Legacy rows without an owner are not safe to expose as private
            // experience and therefore remain governance-only.
            return !owner.isBlank() && principal.userId.equals(owner);
        }
        return true;
    }

    /**
     * Scope is part of the learning-case identity, not merely a display
     * filter.  A row whose plot was deleted or moved to another farm is kept
     * for governance/audit, but it cannot be read by farm users or used as
     * positive evidence.
     */
    private boolean validCaseScope(Map<String, Object> row) {
        if (row == null) return false;
        String farmId = text(row.get("farmId"));
        String plotId = text(row.get("plotId"));
        if (farmId.isBlank() || plotId.isBlank()) return false;
        Map<String, Object> plot = store.find("plot", plotId);
        return plot != null && farmId.equals(text(plot.get("farmId")));
    }

    private boolean canReview(Map<String, Object> row, UserPrincipal principal) {
        if (principal == null || principal.isFarmer()) return false;
        return principal.isSystemAdmin() || (principal.isFarmAdmin() && principal.canAccessFarm(text(row.get("farmId"))));
    }

    private boolean canAccessPlot(UserPrincipal principal, String farmId, String plotId) {
        if (principal == null || farmId == null || farmId.isBlank() || plotId == null || plotId.isBlank()) return false;
        Map<String, Object> plot = store.find("plot", plotId);
        if (plot == null || !farmId.equals(text(plot.get("farmId")))) return false;
        if (principal.isSystemAdmin()) return true;
        if (!principal.canAccessFarm(farmId)) return false;
        if (principal.isFarmAdmin()) return true;
        return principal.canAccessPlot(plotId);
    }

    private boolean caseMatchesStrategyScope(Map<String, Object> row, String farmId, String plotId,
                                              String crop, String scenario, boolean crossFarmScope) {
        String rowFarm = text(row.get("farmId"));
        String rowPlot = text(row.get("plotId"));
        if (!farmId.isBlank() && !farmId.equals(rowFarm)) return false;
        if (!plotId.isBlank() && !plotId.equals(rowPlot)) return false;
        if (plotId.isBlank() && !crossFarmScope && !rowPlot.isBlank()) return false;
        if (!crop.isBlank() && !crop.equalsIgnoreCase(text(row.get("cropCode")))) return false;
        return scenario.isBlank() || scenario.equalsIgnoreCase(text(row.get("scenarioId")));
    }

    private void requireCandidateEditor(UserPrincipal principal) {
        if (principal == null || (!principal.isSystemAdmin() && !principal.isFarmAdmin())) throw forbidden("只有管理员可以治理策略候选");
    }

    private CaseRef findCase(String caseId) {
        for (String type : List.of("decision-case", "alert-learning-case")) {
            Map<String, Object> row = store.find(type, caseId);
            if (row != null) return new CaseRef(type, row);
        }
        throw new ApiException(HttpStatus.NOT_FOUND, "LEARNING_CASE_NOT_FOUND", "学习案例不存在");
    }

    private CaseRef findCaseOrNull(String caseId) {
        if (caseId == null || caseId.isBlank()) return null;
        for (String type : List.of("decision-case", "alert-learning-case")) {
            Map<String, Object> row = store.find(type, caseId);
            if (row != null) return new CaseRef(type, row);
        }
        return null;
    }

    private List<Map<String, Object>> listAllNormalised() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (String type : List.of("decision-case", "alert-learning-case")) for (Map<String, Object> row : store.list(type)) result.add(normalize(type, row));
        return result;
    }

    private Map<String, Object> targetContext(String traceId, Map<String, Object> input, UserPrincipal principal) {
        String trace = text(traceId);
        if (trace.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "TRACE_ID_REQUIRED", "缺少决策记录编号");
        Map<String, Object> target = input == null ? new LinkedHashMap<>() : new LinkedHashMap<>(input);
        target.put("traceId", trace);

        // Build an immutable anchor from the trace itself.  Request parameters
        // are hints only; they must not be able to move a lookup to another
        // account, conversation, farm or plot.
        Map<String, Object> anchor = new LinkedHashMap<>();
        Map<String, Object> run = store.find("agent-run", trace);
        if (run != null) anchor.putAll(run);
        Map<String, Object> tracePlan = store.list("irrigation-plan").stream()
                .filter(p -> trace.equals(text(p.get("traceId")))).findFirst().orElse(null);
        Map<String, Object> traceDiagnosis = store.list("diagnosis").stream()
                .filter(d -> trace.equals(text(d.get("traceId")))).findFirst().orElse(null);
        Map<String, Object> traceCase = listAllNormalised().stream()
                .filter(c -> trace.equals(text(c.get("traceId")))).findFirst().orElse(null);
        if (tracePlan != null) {
            putIfBlank(anchor, "farmId", tracePlan.get("farmId"));
            putIfBlank(anchor, "plotId", tracePlan.get("plotId"));
            putIfBlank(anchor, "conversationId", tracePlan.get("conversationId"));
        }
        if (traceDiagnosis != null) {
            putIfBlank(anchor, "farmId", traceDiagnosis.get("farmId"));
            putIfBlank(anchor, "plotId", traceDiagnosis.get("plotId"));
        }
        if (traceCase != null) {
            putIfBlank(anchor, "farmId", traceCase.get("farmId"));
            putIfBlank(anchor, "plotId", traceCase.get("plotId"));
            putIfBlank(anchor, "conversationId", traceCase.get("conversationId"));
            putIfBlank(anchor, "accountId", traceCase.get("accountId"));
        }
        String anchorOwner = firstNonBlank(text(anchor.get("userId")), text(anchor.get("accountId")), text(anchor.get("ownerId")));
        String requestedFarm = text(target.get("farmId"));
        String requestedPlot = text(target.get("plotId"));
        String requestedConversation = text(target.get("conversationId"));
        String requestedAccount = text(target.get("accountId"));
        String anchorFarm = text(anchor.get("farmId"));
        String anchorPlot = text(anchor.get("plotId"));
        String anchorConversation = firstNonBlank(text(anchor.get("conversationId")), text(anchor.get("sessionId")));
        String anchorAccount = firstNonBlank(text(anchor.get("accountId")), text(anchor.get("userId")));

        if (principal != null && !principal.isSystemAdmin()) {
            if (!anchorOwner.isBlank() && !principal.userId.equals(anchorOwner)) {
                throw forbidden("无权检索该决策记录的学习案例");
            }
            if (!requestedAccount.isBlank() && !principal.userId.equals(requestedAccount)) {
                throw forbidden("不能使用其他账号的学习上下文");
            }
            if (!anchorAccount.isBlank() && !principal.userId.equals(anchorAccount)) {
                throw forbidden("不能使用其他账号的学习上下文");
            }
            if (!anchorFarm.isBlank() && !requestedFarm.isBlank() && !anchorFarm.equals(requestedFarm)) {
                throw forbidden("传入的农场与决策记录不一致");
            }
            if (!anchorPlot.isBlank() && !requestedPlot.isBlank() && !anchorPlot.equals(requestedPlot)) {
                throw forbidden("传入的地块与决策记录不一致");
            }
            if (!anchorConversation.isBlank() && !requestedConversation.isBlank() && !anchorConversation.equals(requestedConversation)) {
                throw forbidden("传入的会话与决策记录不一致");
            }
            target.put("accountId", principal.userId);
            if (!anchorFarm.isBlank()) target.put("farmId", anchorFarm);
            if (!anchorPlot.isBlank()) target.put("plotId", anchorPlot);
            if (!anchorConversation.isBlank()) target.put("conversationId", anchorConversation);
        } else {
            // Governance lookups may name an explicit farm/plot, but an
            // existing trace remains the source of truth when it is scoped.
            if (!anchorFarm.isBlank() && !requestedFarm.isBlank() && !anchorFarm.equals(requestedFarm)
                    && !approvedCrossFarmRequest(target)) {
                throw forbidden("传入的农场与决策记录不一致");
            }
            if (!anchorPlot.isBlank() && !requestedPlot.isBlank() && !anchorPlot.equals(requestedPlot)
                    && !approvedCrossFarmRequest(target)) {
                throw forbidden("传入的地块与决策记录不一致");
            }
            if (requestedFarm.isBlank() && !anchorFarm.isBlank()) target.put("farmId", anchorFarm);
            if (requestedPlot.isBlank() && !anchorPlot.isBlank()) target.put("plotId", anchorPlot);
            if (requestedConversation.isBlank() && !anchorConversation.isBlank() && !approvedCrossFarmRequest(target)) {
                target.put("conversationId", anchorConversation);
            }
            if (requestedAccount.isBlank() && !anchorAccount.isBlank() && !approvedCrossFarmRequest(target)) {
                target.put("accountId", anchorAccount);
            }
        }

        String finalFarm = text(target.get("farmId"));
        String finalPlot = text(target.get("plotId"));
        if (!finalFarm.isBlank() && store.find("farm", finalFarm) == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "FARM_NOT_FOUND", "农场不存在：" + finalFarm);
        }
        if (!finalPlot.isBlank()) {
            Map<String, Object> plot = store.find("plot", finalPlot);
            if (plot == null) throw new ApiException(HttpStatus.NOT_FOUND, "PLOT_NOT_FOUND", "地块不存在：" + finalPlot);
            String actualFarm = text(plot.get("farmId"));
            if (!finalFarm.isBlank() && !finalFarm.equals(actualFarm)) throw forbidden("农场与地块归属不一致");
            if (finalFarm.isBlank()) target.put("farmId", actualFarm);
            if (principal != null && !canAccessPlot(principal, actualFarm, finalPlot)) throw forbidden("无权检索该地块的学习案例");
        }
        if (principal != null && !principal.isSystemAdmin() && !finalFarm.isBlank() && !principal.canAccessFarm(finalFarm)) {
            throw forbidden("无权检索该农场的学习案例");
        }
        validateConversationScope(target, principal, finalPlot);
        return target;
    }

    /** Compatibility hook for older package-level callers. */
    private Map<String, Object> targetContext(String traceId, Map<String, Object> input) {
        return targetContext(traceId, input, systemCompatibilityPrincipal());
    }

    private boolean approvedCrossFarmRequest(Map<String, Object> target) {
        return bool(target.get("allowFarmScope"))
                && "APPROVED".equalsIgnoreCase(text(target.get("reuseApproval")));
    }

    private void putIfBlank(Map<String, Object> target, String key, Object value) {
        if (text(target.get(key)).isBlank() && !text(value).isBlank()) target.put(key, value);
    }

    private void validateConversationScope(Map<String, Object> target, UserPrincipal principal, String plotId) {
        String conversationId = text(target.get("conversationId"));
        if (conversationId.isBlank()) return;
        Map<String, Object> conversation = store.find("agent-conversation", conversationId);
        if (conversation == null) {
            // A caller may be asking about a legacy trace that predates the
            // conversation table.  Do not broaden the lookup, but keep the
            // supplied id as an exact filter (which will normally return no
            // private cases).
            return;
        }
        String owner = firstNonBlank(text(conversation.get("userId")), text(conversation.get("accountId")));
        if (principal != null && !principal.isSystemAdmin() && !owner.isBlank() && !principal.userId.equals(owner)) {
            throw forbidden("无权使用该会话的学习上下文");
        }
        String conversationPlot = text(conversation.get("plotId"));
        if (!conversationPlot.isBlank() && !plotId.isBlank() && !conversationPlot.equals(plotId)) {
            throw forbidden("会话与地块范围不一致");
        }
        String conversationRole = RolePolicy.canonical(text(conversation.get("agentRole")));
        if (principal != null && !conversationRole.isBlank() && !conversationRole.equals(RolePolicy.canonical(principal.role))) {
            throw forbidden("会话身份与当前账号不一致");
        }
    }

    private Map<String, Object> trainingProjection(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String key : List.of("caseId", "traceId", "farmId", "plotId", "cropCode", "stageCode", "primaryCause", "resolutionAction", "result", "sourceSnapshot", "scenarioId", "ruleVersion", "cropPackVersion", "agentVersion", "selectionReason", "reviewedBy", "reviewedAt")) {
            if (row.containsKey(key)) out.put(key, row.get(key));
        }
        out.put("label", "QUALIFIED");
        out.put("learningUse", OFFLINE_TRAINING);
        return out;
    }

    private String signature(List<Map<String, Object>> rows) {
        Map<String, Object> first = rows.get(0);
        return String.join("|", text(first.get("farmId")), text(first.get("cropCode")), text(first.get("stageCode")), text(first.get("primaryCause")), text(first.get("resolutionAction")));
    }

    private boolean caseReferencesCandidate(Map<String, Object> row, String candidateId) {
        if (candidateId.equals(text(row.get("candidateId")))) return true;
        Map<String, Object> candidate = store.find("strategy-candidate", candidateId);
        return candidate != null && strings(candidate.get("evidenceCaseIds")).contains(text(row.get("caseId")));
    }

    /**
     * Candidates created through the legacy strategy endpoint are authored
     * baselines, rather than learning output.  They still have to pass the
     * deterministic offline replay and human approval flow, but they do not
     * need (and must never acquire) positive learning evidence.
     */
    private boolean isManualBaselineCandidate(Map<String, Object> candidate) {
        return "MANUAL_AUTHORED".equals(upper(candidate == null ? null : candidate.get("provenance")))
                && !Jsons.bool(candidate == null ? Map.of() : candidate, "learningEligible", true)
                && strings(candidate == null ? null : candidate.get("evidenceCaseIds")).isEmpty();
    }

    private boolean successfulCase(Map<String, Object> row) {
        String result = upper(row.get("result"));
        if (POSITIVE_RESULTS.contains(result)) return true;
        Map<String, Object> evaluation = linkedEvaluation(row);
        return evaluation != null && POSITIVE_RESULTS.contains(upper(evaluation.get("result")));
    }

    private boolean hasGateFailure(Map<String, Object> row, String kind) {
        for (String key : List.of(kind + "Check", kind + "Gate", "hardGates", "gates")) {
            Object value = row.get(key);
            if (value instanceof Map<?, ?> map) for (Object entry : map.values()) if (isFailure(entry)) return true;
            if (isFailure(value)) return true;
        }
        return false;
    }

    private void checkGates(Map<String, Object> row, Map<String, Object> snapshot, Map<String, Object> plan,
                            Map<String, Object> command, Map<String, Object> diagnosis,
                            List<String> exclusions, List<String> positive) {
        List<Map<String, Object>> sources = List.of(row, snapshot, plan == null ? Map.of() : plan,
                command == null ? Map.of() : command, diagnosis == null ? Map.of() : diagnosis,
                Jsons.map(mapper, row.get("readiness")));
        boolean failed = false;
        for (Map<String, Object> source : sources) {
            for (String key : List.of("ruleCheck", "safetyGate", "resourceCheck", "permissionCheck", "hardGates", "gates", "bypassedGates")) {
                Object value = source.get(key);
                if ("bypassedGates".equals(key) && !strings(value).isEmpty()) { failed = true; continue; }
                if (isFailure(value)) failed = true;
                if (value instanceof Map<?, ?> map && map.values().stream().anyMatch(this::isFailure)) failed = true;
            }
        }
        if (failed) exclusions.add("规则集、安全门、资源上限或权限检查未通过");
        else positive.add("规则与安全检查通过");
    }

    private boolean traceableEvidence(Map<String, Object> row, Map<String, Object> snapshot,
                                      Map<String, Object> diagnosis, Map<String, Object> plan) {
        if (!strings(row.get("evidenceRefs")).isEmpty() || !strings(row.get("evidence")).isEmpty()
                || !strings(row.get("evidenceLinks")).isEmpty()) return true;
        if (diagnosis != null && (!strings(diagnosis.get("supportingEvidence")).isEmpty() || !strings(diagnosis.get("evidence")).isEmpty()
                || !strings(diagnosis.get("evidenceRefs")).isEmpty())) return true;
        if (plan != null && !strings(plan.get("evidence")).isEmpty()) return true;
        return hasTelemetry(snapshot) && (!text(row.get("primaryCause")).isBlank() || !text(row.get("diagnosis")).isBlank());
    }

    private boolean hasTelemetry(Map<String, Object> snapshot) {
        if (snapshot == null || snapshot.isEmpty()) return false;
        for (String key : List.of("telemetry", "observations", "metrics", "input", "inputSnapshot")) {
            Object value = snapshot.get(key);
            if (hasCompleteTelemetryValue(value)) return true;
        }
        return false;
    }

    private boolean hasCompleteTelemetryValue(Object value) {
        if (value instanceof Map<?, ?> raw) {
            Map<String, Object> item = Jsons.map(mapper, raw);
            String metric = firstNonBlank(text(item.get("metric")), text(item.get("metricCode")));
            String ts = firstNonBlank(text(item.get("ts")), text(item.get("eventTs")), text(item.get("timestamp")), text(item.get("observedAt")));
            String eventId = firstNonBlank(text(item.get("eventId")), text(item.get("telemetryId")));
            if (!metric.isBlank() && item.get("value") != null && (!ts.isBlank() || !eventId.isBlank())) return true;
            return item.values().stream().anyMatch(this::hasCompleteTelemetryValue);
        }
        if (value instanceof Collection<?> collection) return collection.stream().anyMatch(this::hasCompleteTelemetryValue);
        return false;
    }

    private Instant snapshotTimestamp(Map<String, Object> snapshot, Map<String, Object> row) {
        // Prefer the observation time embedded in the telemetry payload. The
        // snapshot wrapper is written after the fact and its capturedAt value
        // must never make an old reading look fresh.
        List<Instant> observations = new ArrayList<>();
        Set<Object> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        for (String key : List.of("telemetry", "observations", "metrics", "input", "inputSnapshot")) {
            collectTelemetryTimestamps(snapshot.get(key), observations, visited);
        }
        if (!observations.isEmpty()) return observations.stream().max(Comparator.naturalOrder()).orElse(null);
        for (String key : List.of("telemetryAt", "observedAt", "timestamp", "ts", "eventTs")) {
            Instant value = Jsons.instant(snapshot.get(key), null);
            if (value != null) return value;
        }
        return Jsons.instant(row.get("snapshotAt"), null);
    }

    /** Collect timestamps only from identifiable metric readings. */
    private void collectTelemetryTimestamps(Object value, List<Instant> output, Set<Object> visited) {
        if (value == null || !visited.add(value)) return;
        if (value instanceof Map<?, ?> raw) {
            Map<String, Object> item = Jsons.map(mapper, raw);
            String metric = firstNonBlank(text(item.get("metric")), text(item.get("metricCode")));
            if (!metric.isBlank() && item.get("value") != null) {
                String timestamp = firstNonBlank(text(item.get("ts")), text(item.get("eventTs")),
                        text(item.get("timestamp")), text(item.get("observedAt")));
                Instant parsed = Jsons.instant(timestamp, null);
                if (parsed != null) output.add(parsed);
            }
            item.values().forEach(child -> collectTelemetryTimestamps(child, output, visited));
        } else if (value instanceof Collection<?> collection) {
            collection.forEach(child -> collectTelemetryTimestamps(child, output, visited));
        }
    }

    private String snapshotQuality(Map<String, Object> snapshot) {
        for (String key : List.of("telemetryQuality", "qualityStatus", "dataQuality", "quality")) {
            Object value = snapshot.get(key);
            if (value instanceof Map<?, ?> map) {
                String status = text(Jsons.map(mapper, map).get("status"));
                if (!status.isBlank()) return status;
            }
            if (!text(value).isBlank()) return text(value);
        }
        Object telemetry = snapshot.get("telemetry");
        if (telemetry instanceof Collection<?> values) {
            for (Object value : values) {
                Map<String, Object> item = Jsons.map(mapper, value);
                String quality = firstNonBlank(text(item.get("qualityStatus")), text(item.get("quality")), text(item.get("dataQuality")));
                if (!quality.isBlank()) return quality;
            }
        }
        return "";
    }

    private boolean hasAck(Map<String, Object> command, Map<String, Object> row) {
        return command != null && (command.get("ack") instanceof Map<?, ?> || !text(command.get("ackId")).isBlank())
                || row.get("ack") instanceof Map<?, ?> || !text(row.get("ackId")).isBlank();
    }

    private String executionStatus(Map<String, Object> command, Map<String, Object> row) {
        Map<String, Object> ack = command == null ? Jsons.map(mapper, row.get("ack")) : Jsons.map(mapper, command.get("ack"));
        return upper(firstNonBlank(text(ack.get("status")), text(command == null ? null : command.get("status")), text(row.get("ackStatus")), text(row.get("executionStatus")), ""));
    }

    private Map<String, Object> snapshotFor(Map<String, Object> base, Map<String, Object> alert, Map<String, Object> outcome,
                                            Map<String, Object> plan, Map<String, Object> evaluation,
                                            Map<String, Object> command, Map<String, Object> feedback) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("capturedAt", Instant.now().toString());
        if (alert != null) snapshot.put("alert", compact(alert));
        if (outcome != null) snapshot.put("outcome", compact(outcome));
        if (plan != null) snapshot.put("plan", compact(plan));
        if (command != null) snapshot.put("command", compact(command));
        if (evaluation != null) snapshot.put("evaluation", compact(evaluation));
        if (feedback != null) snapshot.put("feedback", compact(feedback));
        if (base != null) {
            if (base.get("evidence") != null) snapshot.put("evidence", base.get("evidence"));
            if (base.get("sourceMode") != null) snapshot.put("sourceMode", base.get("sourceMode"));
        }
        List<Map<String, Object>> telemetry = new ArrayList<>();
        Set<Object> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Object value : Arrays.asList(base, alert, outcome, plan, evaluation, command, feedback)) {
            collectTelemetry(value, telemetry, visited);
        }
        if (!telemetry.isEmpty()) {
            snapshot.put("telemetry", telemetry);
            snapshot.put("observations", telemetry.stream().map(item -> new LinkedHashMap<>(item)).toList());
            Instant latest = telemetry.stream()
                    .map(item -> Jsons.instant(firstNonBlank(text(item.get("ts")), text(item.get("observedAt"))), null))
                    .filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null);
            if (latest != null) snapshot.put("telemetryAt", latest.toString());
            String quality = telemetry.stream()
                    .map(item -> firstNonBlank(text(item.get("qualityStatus")), qualityStatus(item.get("quality")), text(item.get("dataQuality"))))
                    .filter(value -> !value.isBlank()).findFirst().orElse("");
            if (!quality.isBlank()) snapshot.put("telemetryQuality", quality);
            if (!quality.isBlank()) snapshot.put("qualityStatus", quality);
            String sourceMode = telemetry.stream().map(item -> text(item.get("sourceMode")))
                    .filter(value -> !value.isBlank()).findFirst().orElse("");
            if (!sourceMode.isBlank()) snapshot.put("sourceMode", sourceMode);
            if (latest != null) snapshot.put("observedAt", latest.toString());
        }
        return snapshot;
    }

    /** Extract only compact, auditable metric readings from nested evidence. */
    private void collectTelemetry(Object value, List<Map<String, Object>> output, Set<Object> visited) {
        if (value == null || !visited.add(value)) return;
        if (value instanceof Map<?, ?> raw) {
            Map<String, Object> item = Jsons.map(mapper, raw);
            String metric = firstNonBlank(text(item.get("metric")), text(item.get("metricCode")));
            Object metricValue = item.get("value");
            String ts = firstNonBlank(text(item.get("ts")), text(item.get("eventTs")), text(item.get("timestamp")), text(item.get("observedAt")));
            String eventId = firstNonBlank(text(item.get("eventId")), text(item.get("telemetryId")));
            if (!metric.isBlank() && metricValue != null && (!ts.isBlank() || !eventId.isBlank())) {
                Map<String, Object> reading = new LinkedHashMap<>();
                for (String key : List.of("eventId", "telemetryId", "farmId", "plotId", "deviceId", "metric", "metricCode", "value", "unit", "ts", "eventTs", "timestamp", "observedAt", "qualityStatus", "quality", "dataQuality", "scenarioId", "sourceMode", "provenance")) {
                    if (item.containsKey(key)) reading.put(key, item.get(key));
                }
                reading.putIfAbsent("metric", metric);
                reading.putIfAbsent("ts", ts);
                String quality = firstNonBlank(text(item.get("qualityStatus")), qualityStatus(item.get("quality")), text(item.get("dataQuality")));
                if (!quality.isBlank()) reading.put("qualityStatus", quality);
                output.add(reading);
            }
            item.values().forEach(child -> collectTelemetry(child, output, visited));
        } else if (value instanceof Collection<?> collection) {
            collection.forEach(child -> collectTelemetry(child, output, visited));
        }
    }

    private String qualityStatus(Object value) {
        if (value instanceof Map<?, ?> raw) {
            return firstNonBlank(text(Jsons.map(mapper, raw).get("status")), text(Jsons.map(mapper, raw).get("qualityStatus")));
        }
        return text(value);
    }

    private Map<String, Object> compact(Map<String, Object> value) {
        if (value == null) return Map.of();
        Map<String, Object> result = new LinkedHashMap<>();
        for (String key : List.of("id", "caseId", "alertId", "traceId", "planId", "evaluationId", "commandId", "plotId", "farmId", "metric", "value", "unit", "ts", "status", "result", "quality", "ruleVersion", "cropPackVersion", "scenarioId", "scenario", "sourceMode", "provenance", "evidenceRefs", "supportingEvidence", "hardGates", "safetyGate", "resourceCheck", "permissionCheck")) if (value.containsKey(key)) result.put(key, value.get(key));
        return result;
    }

    private String evaluationFingerprint(Map<String, Object> row) {
        return Integer.toHexString(Objects.hash(text(row.get("caseId")), text(row.get("traceId")), text(row.get("planId")), text(row.get("evaluationId")),
                text(row.get("quality")), text(row.get("result")), text(row.get("sourceMode")), text(row.get("scenarioId")),
                Jsons.json(mapper, row.get("sourceSnapshot")), Jsons.json(mapper, row.get("evidence")), Jsons.json(mapper, row.get("reviewDecision"))));
    }

    private String stableCaseDigest(Map<String, Object> row) {
        return Integer.toHexString(Objects.hash(text(row.get("caseId")), text(row.get("qualityStatus")), text(row.get("result")), text(row.get("qualityScore")),
                text(row.get("ruleVersion")), text(row.get("cropPackVersion")), text(row.get("scenarioId")), Jsons.json(mapper, row.get("sourceSnapshot"))));
    }

    private boolean isFailure(Object value) {
        if (value == null) return false;
        if (value instanceof Boolean b) return !b;
        String text = text(value).toUpperCase(Locale.ROOT);
        return Set.of("FAIL", "FAILED", "BLOCKED", "DENIED", "FALSE", "UNSAFE", "EXCEEDED", "VIOLATION", "TIMEOUT").contains(text);
    }

    private boolean successfulCaseValue(Map<String, Object> row) { return successfulCase(row); }

    private record CaseRef(String type, Map<String, Object> record) { }

    private UserPrincipal systemCompatibilityPrincipal() {
        return new UserPrincipal("learning-system", "learning-system", "SYSTEM_ADMIN", List.of("*"), List.of("*"));
    }

    private void requirePrincipal(UserPrincipal principal) {
        if (principal == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "需要登录");
    }

    private ApiException forbidden(String message) { return new ApiException(HttpStatus.FORBIDDEN, "LEARNING_FORBIDDEN", message); }

    private String text(Object value) { return value == null ? "" : String.valueOf(value).trim(); }
    private String upper(Object value) { return text(value).toUpperCase(Locale.ROOT); }
    private String firstNonBlank(String... values) { for (String value : values) if (value != null && !value.isBlank()) return value; return ""; }
    private Object firstNonEmpty(Object... values) { for (Object value : values) if (value instanceof Collection<?> c && !c.isEmpty()) return value; else if (value instanceof Map<?, ?> m && !m.isEmpty()) return value; else if (value != null && !text(value).isBlank()) return value; return values.length == 0 ? "" : values[values.length - 1]; }
    private boolean bool(Object value) { if (value == null) return false; if (value instanceof Boolean b) return b; return Boolean.parseBoolean(text(value)); }
    private boolean hasAny(Map<String, Object> row, String... keys) { for (String key : keys) if (row.containsKey(key) && !text(row.get(key)).isBlank()) return true; return false; }
    private boolean containsAnyIgnoreCase(String value, String... terms) { String normalized = text(value).toLowerCase(Locale.ROOT); for (String term : terms) if (normalized.contains(term.toLowerCase(Locale.ROOT))) return true; return false; }
    private List<String> strings(Object value) { return Jsons.strings(value).stream().map(String::trim).filter(v -> !v.isBlank()).toList(); }
}
