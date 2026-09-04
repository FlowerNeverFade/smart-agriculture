package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    @GetMapping("/users/me/preferences/farm-admin-workspace")
    ResponseEntity<?> farmAdminWorkspacePreference(@RequestParam(required = false) String farmId,
                                                   Authentication authentication) {
        return ok(engine.farmAdminWorkspacePreference(farmId, principal(authentication)));
    }

    @PutMapping("/users/me/preferences/farm-admin-workspace")
    ResponseEntity<?> updateFarmAdminWorkspacePreference(@RequestParam(required = false) String farmId,
                                                         @RequestBody(required = false) Map<String, Object> body,
                                                         Authentication authentication) {
        return ok(engine.updateFarmAdminWorkspacePreference(body == null ? Map.of() : body, farmId, principal(authentication)));
    }

    /**
     * Source-compatible adapter for callers that used the pre-existing
     * body-first controller signature.  It is intentionally not annotated so
     * Spring exposes only the request-param/body ordering above.
     */
    ResponseEntity<?> updateFarmAdminWorkspacePreference(Map<String, Object> body,
                                                         String farmId,
                                                         Authentication authentication) {
        return updateFarmAdminWorkspacePreference(farmId, body, authentication);
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
                // A system administrator's default overview is platform-wide;
                // an older JWT may still contain one explicit farmId, which
                // must not silently hide newly registered farm regions.
                ? (p.isSystemAdmin() ? null : p.farmIds.stream().filter(id -> !"*".equals(id)).findFirst().orElse(null))
                : farmId;
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

    @PostMapping("/lighting/estimate")
    ResponseEntity<?> lightingEstimate(@RequestBody(required = false) Map<String, Object> body, Authentication a) {
        return ok(engine.lightingPlan(body == null ? Map.of() : body, principal(a)));
    }

    @GetMapping("/plots/{plotId}/lighting-guard")
    ResponseEntity<?> lightingGuard(@PathVariable String plotId, Authentication a) {
        return ok(engine.lightingGuard(plotId, principal(a)));
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
                                   @RequestParam(defaultValue = "40") int limit,
                                   @RequestParam(required = false) String plotId,
                                   @RequestParam(required = false) String scope,
                                   Authentication a) {
        return ok(engine.agentHistory(conversationId, limit, plotId, scope, principal(a)));
    }

    @GetMapping("/agent/conversations")
    ResponseEntity<?> agentConversations(@RequestParam(defaultValue = "20") int limit,
                                         @RequestParam(defaultValue = "false") boolean archived,
                                         @RequestParam(required = false) String plotId,
                                         @RequestParam(required = false) String scope,
                                         Authentication a) {
        return ok(engine.agentConversations(limit, archived, plotId, scope, principal(a)));
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

    @GetMapping("/agent/tools/catalog")
    ResponseEntity<?> agentToolCatalog(Authentication a) { return ok(engine.agentToolCatalog(principal(a))); }

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
        Map<String, Map<String, Object>> plotsById = new LinkedHashMap<>();
        for (Map<String, Object> plot : store.list("plot")) {
            plotsById.put(Jsons.text(plot, "plotId", ""), plot);
        }
        return ok(store.list("alert").stream().filter(alert -> {
            String plotId = Jsons.text(alert, "plotId", "");
            Map<String, Object> plot = plotsById.get(plotId);
            String recordFarmId = Jsons.text(alert, "farmId", plot == null ? "" : Jsons.text(plot, "farmId", ""));
            if (farmId != null && !farmId.isBlank() && !farmId.equals(recordFarmId)) return false;
            if (p.isSystemAdmin()) return true;
            if (plot == null || recordFarmId.isBlank() || !p.canAccessFarm(recordFarmId)) return false;
            return p.isFarmAdmin() || p.canAccessPlot(plotId);
        }).sorted(Comparator.comparing((Map<String, Object> alert) -> Jsons.instant(alert.get("raisedAt"),
                Jsons.instant(alert.get("updatedAt"), Jsons.instant(alert.get("createdAt"), Instant.EPOCH)))).reversed()).toList());
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

    @GetMapping("/devices/{deviceId}/actuator-policy")
    ResponseEntity<?> actuatorPolicy(@PathVariable String deviceId, Authentication a) {
        return ok(engine.bearPiActuatorPolicy(deviceId, principal(a)));
    }

    @PutMapping("/devices/{deviceId}/actuator-policy")
    ResponseEntity<?> updateActuatorPolicy(@PathVariable String deviceId,
                                           @RequestBody(required = false) Map<String, Object> body,
                                           Authentication a) {
        return ok(engine.updateBearPiActuatorPolicy(deviceId, body == null ? Map.of() : body, principal(a)));
    }

    @PostMapping("/devices/{deviceId}/actuators/{actuator}/control")
    ResponseEntity<?> controlActuator(@PathVariable String deviceId,
                                      @PathVariable String actuator,
                                      @RequestBody(required = false) Map<String, Object> body,
                                      Authentication a) {
        return ok(engine.controlBearPiActuator(deviceId, actuator, body == null ? Map.of() : body, principal(a)));
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
    private List<Map<String, Object>> filterFarmScope(List<Map<String, Object>> farms, UserPrincipal p) {
        // System administrators have a cross-farm read scope even when an
        // older account record still carries a single farmId.  Keep the
        // account's explicit scope for farm/farmer roles, but do not let stale
        // claims hide farms from the platform-wide selector.
        return farms.stream()
                .filter(f -> p.isSystemAdmin()
                        || p.farmIds.contains("*")
                        || p.farmIds.contains(Jsons.text(f, "farmId", "")))
                .toList();
    }
    private UserPrincipal principal(Authentication a) { if (a == null || !(a.getPrincipal() instanceof UserPrincipal p)) throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "需要登录"); return p; }
    private ResponseEntity<Map<String, Object>> ok(Object data) { return ResponseEntity.ok(ApiResponses.success(data)); }
    private ObjectMapper engineMapper() { try { return new ObjectMapper().registerModule(new JavaTimeModule()); } catch (Exception e) { return new ObjectMapper(); } }
}
