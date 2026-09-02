import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLiveFeedItems, metricLabel, normalizeFarmerTask } from '../js/live-data.js';
import { MOCK_DATA } from '../js/mock-data.js';
import { canExecuteIrrigation, roleCan } from '../js/roles.js';

const storage = new Map();
globalThis.localStorage ||= {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};

const { ApiService, moistureDeltaFromWater } = await import('../js/api.js');

test('legacy farmer task records retain an actionable work-order identity', () => {
  const task = normalizeFarmerTask({ id: 'ft-demo', status: 'IN_PROGRESS', title: '演示任务' });
  assert.equal(task.id, 'ft-demo');
  assert.equal(task.workOrderId, 'ft-demo');
});

test('demo farmer task issue reporting keeps task state and admin visibility in one idempotent flow', async () => {
  const service = new ApiService();
  service.saveSession({ mode: 'demo', user: { userId: 'user-admin', username: 'admin', role: 'FARM_ADMIN', permissions: [] } });
  const created = await service.createWorkOrder({ farmId: 'farm-demo', plotId: 'plot-a01', title: '问题上报演示任务', reason: '检查滴灌设施', actionType: 'INSPECTION', priority: 'HIGH' });
  await service.assignWorkOrder(created.workOrderId, { assigneeId: 'user-farmer' });
  service.saveSession({ mode: 'demo', user: { userId: 'user-farmer', username: 'farmer', role: 'FARMER', permissions: [] } });

  const report = await service.reportWorkOrderIssue(created.workOrderId, { description: '北侧滴灌管接头持续漏水，无法按计划完成补水' });
  assert.equal(report.sourceType, 'FARMER_REPORT');
  assert.equal(report.reason, '北侧滴灌管接头持续漏水，无法按计划完成补水');
  assert.equal(report.sourceWorkOrderId, created.workOrderId);
  assert.equal(report.reused, false);
  const repeated = await service.reportWorkOrderIssue(created.workOrderId, { description: '北侧滴灌管接头持续漏水，无法按计划完成补水' });
  assert.equal(repeated.workOrderId, report.workOrderId);
  assert.equal(repeated.reused, true);
  assert.equal((await service.getWorkOrders()).some((item) => item.workOrderId === report.workOrderId), false);

  service.saveSession({ mode: 'demo', user: { userId: 'user-admin', username: 'admin', role: 'FARM_ADMIN', permissions: [] } });
  assert.equal((await service.getWorkOrders()).some((item) => item.workOrderId === report.workOrderId), true);
  const feed = buildLiveFeedItems({ workOrders: [report] });
  assert.equal(feed[0].category, '农户问题上报');
  assert.match(feed[0].summary, /北侧滴灌管接头持续漏水/);
});

test('demo P0 contracts expose deterministic guard, dual branches and direct farmer execution', async () => {
  const service = new ApiService();
  service.saveSession({ mode: 'demo', user: { userId: 'demo-farmer', username: 'farmer', role: 'FARMER', permissions: ['plots:read', 'irrigation:request', 'irrigation:execute'] } });
  assert.equal(canExecuteIrrigation('FARMER'), true);
  assert.equal(roleCan('FARMER', 'irrigation:approve'), false);
  assert.equal(canExecuteIrrigation('FARM_ADMIN'), true);
  const guard = await service.getIrrigationGuard('plot-a01');
  assert.equal(guard.provenance, 'SIMULATED');
  assert.ok(['TRIGGERED', 'HOLD', 'RESET'].includes(guard.hysteresis.state));
  assert.equal(guard.cooldownMinutes, 0);
  assert.equal(guard.automaticWatering.threshold, 10);
  assert.equal(guard.automaticWatering.enabled, true);

  const compare = await service.compareScenario({ scenario: 'DROUGHT', seed: 42, plotId: 'plot-a01' });
  assert.equal(compare.seed, 42);
  assert.ok(compare.branches.EXECUTE.points.length > 10);
  assert.equal(compare.branches.EXECUTE.points.length, compare.branches.NO_ACTION.points.length);
  assert.equal(compare.frozenSnapshot.plotId, 'plot-a01');
  // 真实化双轨（branch-compare-v5）：执行分支按面积/流量/作物目标/水箱余量推导真实灌溉。
  assert.equal(compare.comparisonVersion, 'branch-compare-v5');
  assert.equal(compare.intervention.measure, 'IRRIGATION');
  assert.equal(compare.intervention.status, 'PLANNED');
  assert.ok(compare.intervention.waterLitre > 0);
  assert.ok(compare.intervention.reservoirAvailableLitres > 0);
  assert.ok(Number.isFinite(compare.divergence.moistureDeltaAtHorizon));
  assert.ok(compare.markers.some((marker) => String(marker.label).includes('补水')));

  const audit = await service.getAgentRun('demo-audit');
  assert.ok(audit.knowledgeEvidence.length >= 2);
  assert.ok(audit.tools.length >= 4);
  assert.equal(audit.tools[0].validated, true);
  assert.equal(audit.tools[0].schemaVersion, 'agent-tool-v1');

  const plan = await service.estimateIrrigation({ plotId: 'plot-a01', traceId: 'trace-approval-demo' });
  assert.equal(plan.requiresApproval, false);
  assert.equal(plan.requiresAdminApproval, false);
  assert.equal(plan.confirmationRequired, true);
  assert.equal(plan.executionMode, 'OPERATOR_CONFIRMED');
  assert.equal(plan.readinessStatus, 'READY');
  assert.equal(plan.executable, true);
  const beforeMoisture = (await service.getPlots()).find((plot) => plot.plotId === plan.plotId).metrics.SOIL_MOISTURE.value;
  const beforeTelemetry = (await service.getTelemetry(plan.plotId, 'SOIL_MOISTURE', 1))[0].value;
  await assert.rejects(
    () => service.executeIrrigation(plan.planId, plan.plotId, { idempotencyKey: 'direct-farmer-key' }),
    (error) => error.code === 'CONFIRMATION_REQUIRED'
  );
  const firstCommand = await service.executeIrrigation(plan.planId, plan.plotId, {
    confirmed: true,
    idempotencyKey: 'direct-farmer-key'
  });
  const repeatedCommand = await service.executeIrrigation(plan.planId, plan.plotId, {
    confirmed: true,
    idempotencyKey: 'direct-farmer-key'
  });
  assert.equal(firstCommand.commandId, repeatedCommand.commandId);
  assert.equal(firstCommand.approvalRequired, false);
  assert.equal(firstCommand.confirmationMode, 'OPERATOR_CONFIRMED');
  assert.equal(firstCommand.ack.status, 'SUCCEEDED');
  const afterMoisture = (await service.getPlots()).find((plot) => plot.plotId === plan.plotId).metrics.SOIL_MOISTURE.value;
  const expectedDelta = moistureDeltaFromWater(firstCommand.ack.actualWaterLitre, 80);
  assert.ok(Math.abs(afterMoisture - (beforeMoisture + expectedDelta)) < 0.2);
  const afterTelemetry = (await service.getTelemetry(plan.plotId, 'SOIL_MOISTURE', 1))[0].value;
  assert.ok(afterTelemetry > beforeTelemetry);
  const passport = await service.getDecisionPassport(plan.traceId);
  assert.equal(passport.commands.at(-1).commandId, firstCommand.commandId);
  assert.equal(passport.evaluations.at(-1).commandId, firstCommand.commandId);
});

test('demo automatic watering setting gates the automatic trigger without changing manual irrigation', async () => {
  const service = new ApiService();
  service.saveSession({ mode: 'demo', user: { userId: 'toggle-farmer', username: 'farmer', role: 'FARMER', permissions: ['irrigation:request', 'irrigation:execute'] } });
  const disabled = await service.setAutomaticWateringSetting('plot-a02', false);
  assert.equal(disabled.enabled, false);
  assert.equal((await service.getIrrigationGuard('plot-a02')).automaticWatering.enabled, false);
  assert.equal((await service.autoWaterIfNeeded('plot-a02')).status, 'DISABLED');
  const enabled = await service.setAutomaticWateringSetting('plot-a02', true);
  assert.equal(enabled.enabled, true);
  assert.equal((await service.getAutomaticWateringSetting('plot-a02')).enabled, true);
});

test('demo blocked irrigation exposes manual fallback and updates virtual soil moisture', async () => {
  const service = new ApiService();
  const userId = `manual-fallback-${Date.now()}`;
  service.saveSession({ mode: 'demo', user: { userId, username: 'farmer', role: 'FARMER', permissions: ['plots:read', 'irrigation:request', 'irrigation:execute'] } });
  const plan = await service.estimateIrrigation({ plotId: 'plot-a01', scenarioId: 'sensor-drift', traceId: `manual-fallback-trace-${userId}` });
  assert.equal(plan.status, 'BLOCKED');
  assert.equal(plan.manualFallback.available, true);
  assert.ok(plan.manualFallback.bypassedGates.includes('DATA_CONFLICT'));
  assert.equal(plan.manualFallback.virtualOnly, true);
  const before = (await service.getPlots()).find((plot) => plot.plotId === plan.plotId).metrics.SOIL_MOISTURE.value;
  const key = `manual-fallback-key-${userId}`;
  await assert.rejects(
    () => service.executeManualIrrigation({ plotId: plan.plotId, sourcePlanId: plan.planId, waterLitre: 20, idempotencyKey: key }),
    (error) => error.code === 'CONFIRMATION_REQUIRED'
  );
  const command = await service.executeManualIrrigation({ plotId: plan.plotId, sourcePlanId: plan.planId, waterLitre: 20, confirmed: true, idempotencyKey: key });
  assert.equal(command.manualOverride, true);
  assert.equal(command.sourcePlanId, plan.planId);
  assert.equal(command.confirmationMode, 'OPERATOR_MANUAL_OVERRIDE');
  assert.equal(command.executionMode, 'SIMULATED');
  assert.equal(command.provenance, 'SIMULATED');
  assert.equal(command.virtualOnly, true);
  assert.equal(command.ack.status, 'SUCCEEDED');
  assert.equal(command.evaluation.status, 'COMPLETED');
  assert.equal(command.evaluation.result, 'GOOD');
  assert.ok(command.evaluation.actual.soilMoistureAfter > before);
  const after = (await service.getPlots()).find((plot) => plot.plotId === plan.plotId).metrics.SOIL_MOISTURE.value;
  assert.ok(after > before);
  const repeated = await service.executeManualIrrigation({ plotId: plan.plotId, sourcePlanId: plan.planId, waterLitre: 20, confirmed: true, idempotencyKey: key });
  assert.equal(repeated.commandId, command.commandId);
  const second = await service.executeManualIrrigation({ plotId: plan.plotId, sourcePlanId: plan.planId, waterLitre: 10, confirmed: true, idempotencyKey: `${key}-second` });
  assert.notEqual(second.commandId, command.commandId);
});

test('demo normal and no-action irrigation never expose manual fallback', async () => {
  storage.clear();
  const service = new ApiService();
  service.saveSession({ mode: 'demo', user: { userId: 'manual-fallback-gates', username: 'farmer', role: 'FARMER', permissions: ['plots:read', 'irrigation:request', 'irrigation:execute'] } });
  const normal = await service.estimateIrrigation({ plotId: 'plot-a01', scenarioId: 'normal', traceId: 'manual-normal-gate' });
  assert.equal(normal.manualFallback.available, false);

  const plot = service.demoPlots.get('plot-a01');
  service.demoPlots.set('plot-a01', {
    ...plot,
    metrics: { ...plot.metrics, SOIL_MOISTURE: { ...plot.metrics.SOIL_MOISTURE, value: 42 } }
  });
  const noAction = await service.estimateIrrigation({ plotId: 'plot-a01', scenarioId: 'normal', traceId: 'manual-no-action-gate' });
  assert.equal(noAction.status, 'NO_ACTION');
  assert.equal(noAction.manualFallback.available, false);
});

test('farmer page keeps P0 evidence and exposes risk prediction under more tools', async () => {
  const [html, source, presentation, css] = await Promise.all([
    readFile(new URL('../farmer.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/farmer.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/agent-presentation.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/farmer.css', import.meta.url), 'utf8')
  ]);
  const farmerSurface = `${html}\n${source}\n${presentation}`;
  for (const marker of ['阶段目标预览', '完整率', '支持证据', '反对证据', '缺失证据', '回答依据与执行记录', '工具调用记录', '查看建议并执行', '人工浇灌', '无需灌溉原因', '农户不能自行填写执行成功', '人工复核或补充现场证据', '具体问题', '提交给农场管理员', '问题已提交给农场管理员']) {
    assert.match(farmerSurface, new RegExp(marker));
  }
  // 我的地块不再内置风险预测卡片；风险预测仅保留在更多工具页。
  assert.doesNotMatch(html, /地块模拟策略/);
  assert.equal((html.match(/farmer-plot-simulation-panel/g) || []).length, 1);
  for (const marker of ['更多工具', '风险预测', '作物培养手册', '未来预测', '历史 \\+ 策略预测', '参数尚未保存', 'plot_simulation_form', 'risk_tool_plot_id', 'wait_for_irrigation_completion', 'refresh_plot_telemetry', '双轨对比', '措施后预测', '不干预预测', 'executeManualIrrigation', 'manualFallback', 'show_no_action_reason', 'manual_irrigation_water', 'sync_task_references', 'reportWorkOrderIssue', 'task_has_active_issue_report']) {
    assert.match(html + source, new RegExp(marker));
  }
  // 双轨对比必须走后端 compareScenario（同一冻结快照与随机种子，只读不回写）。
  assert.match(source, /compareScenario/);
  assert.match(source, /load_plot_simulation_dual_track/);
  // 双轨摘要与图表标注消费 intervention / divergence 载荷，并画出风险边界与补水触发线。
  assert.match(source, /intervention/);
  assert.match(source, /moistureDeltaAtHorizon/);
  assert.match(source, /riskDelayMinutes/);
  assert.match(source, /markLine/);
  assert.match(source, /getRiskForecast/);
  assert.match(source, /window\.echarts/);
  assert.match(source, /getDom\?\.\(\)/);
  assert.match(source, /silent: true/);
  assert.match(html, /farmer-plot-simulation-chart-stage/);
  assert.match(html, /is-overlay/);
  assert.match(source, /getIrrigationGuard/);
  assert.match(source, /getDecisionPassport/);
  assert.match(source, /request_missing_evidence/);
  assert.match(source, /HUMAN_EVIDENCE_REVIEW: '复核人工现场证据'/);
  assert.match(source, /\['NEEDS_EVIDENCE', 'UNAVAILABLE', 'BLOCKED', 'HUMAN_REVIEW'\]\.includes\(readinessGate\)/);
  assert.match(source, /status === 'HUMAN_REVIEW'/);
  assert.match(source, /api\.executeIrrigation\(plan\.planId/);
  assert.match(source, /farmer-irrigation-\$\{plan\.planId\}/);
  assert.match(source, /load_plot_simulation/);
  assert.match(source, /plot_simulation_chart/);
  assert.match(source, /chart_points_in_window/);
  assert.match(source, /windowStart/);
  assert.match(html, /<span class="farmer-section-kicker">自动浇水<\/span>/);
  assert.doesNotMatch(html, /自动浇水 · 虚拟执行/);
  assert.match(html, /toggle_automatic_watering/);
  assert.match(source, /setAutomaticWateringSetting/);
  assert.match(source, /if \(advice_is_no_action\.value\)/);
  assert.match(source, /open_no_action_reason\(\)/);
  assert.match(html, /v-if="manual_irrigation_available"/);
  assert.match(html, /farmer-no-action-modal/);
  assert.match(html, /farmer-manual-irrigation-modal/);
  assert.match(html, /仅提供关闭操作|本面板不会直接执行浇灌/);
  assert.match(html, /操作系统/);
  assert.match(html, /farmer-operation-subsystem-tabs/);
  assert.match(farmerSurface, /灌溉系统/);
  assert.match(farmerSurface, /光照系统/);
  assert.match(source, /operation_subsystem/);
  assert.match(source, /select_operation_subsystem/);
  assert.match(html + source, /advice_light_chart/);
  assert.match(farmerSurface, /光照不足|光照过强/);
  assert.match(farmerSurface, /虚拟补光（离线演示）|light_operation_label/);
  assert.match(farmerSurface, /查看建议并执行/);
  assert.match(farmerSurface, /查看智能诊断/);
  assert.match(source, /open_light_advice/);
  assert.match(source, /open_lighting_diagnosis/);
  assert.match(source, /lighting_advice_summary/);
  assert.match(source, /show_virtual_lighting,/);
  assert.match(source, /executeVirtualLighting/);
  assert.match(source, /resolve_light_band_status/);
  assert.match(farmerSurface, /夜间目标|夜间休息/);
  assert.match(source, /light_target_context/);
  assert.match(source, /LIGHT_NOT_REQUIRED_AT_NIGHT|isNight/);
  assert.match(css, /\.g-btn:not\(:disabled\):active/);
  assert.match(css, /\.farmer-risk-mini-card:focus-visible/);
  assert.match(css, /\.farmer-operation-subsystem-tab:not\(\.active\):hover/);
});

test('demo operation system can execute offline virtual lighting and write a light effect', async () => {
  const service = new ApiService();
  service.saveSession({ mode: 'demo', user: { userId: 'demo-farmer', username: 'farmer', role: 'FARMER', permissions: ['plots:read', 'irrigation:execute'] } });
  const plot = service.demoPlots.get('plot-a01');
  service.demoPlots.set('plot-a01', {
    ...plot,
    deviceStatus: 'OFFLINE',
    metrics: { ...plot.metrics, LIGHT: { ...plot.metrics.LIGHT, value: 1000 } }
  });
  try {
    const command = await service.executeVirtualLighting({ plotId: 'plot-a01', boostLux: 6000, durationSeconds: 1, confirmed: true, allowOfflineDemo: true, idempotencyKey: `lighting-test-${Date.now()}` });
    assert.equal(command.type, 'LIGHT_BOOST');
    assert.equal(command.executionMode, 'SIMULATED');
    assert.equal(command.offlineDemoOverride, true);
    assert.equal(service.demoPlots.get('plot-a01').metrics.LIGHT.value, 7000);
  } finally {
    service.demoPlots.set('plot-a01', plot);
    service._demoSaveWorkspaceState();
  }
});

test('farmer can read plot simulation strategy and forecast curve', async () => {
  const service = new ApiService();
  service.saveSession({ mode: 'demo', user: { userId: 'demo-farmer', username: 'farmer', role: 'FARMER', permissions: ['plots:read'] } });
  const strategy = await service.getPlotSimulation('plot-a01');
  assert.equal(strategy.parameters.timeScale, 144);
  assert.equal(strategy.parameterLimits.timeScale.max, 288);
  const forecast = await service.getRiskForecast('plot-a01', 'SOIL_MOISTURE');
  assert.equal(strategy.plotId, 'plot-a01');
  assert.ok(strategy.scenario);
  assert.ok(Array.isArray(strategy.scenarioCatalog) && strategy.scenarioCatalog.length >= 4);
  assert.ok(Array.isArray(forecast.curve) && forecast.curve.length > 1);
  const comparison = await service.compareScenario({
    plotId: 'plot-a01',
    scenario: 'DROUGHT',
    seed: 42,
    parameters: { soilMoistureTrendPerHour: -8 }
  });
  assert.equal(comparison.parameters.soilMoistureTrendPerHour, -8);
  assert.ok(comparison.branches.EXECUTE.points.length > 10);
  assert.equal(comparison.intervention.measure, 'IRRIGATION');
  assert.ok(comparison.intervention.waterLitre > 0);
  const manuals = await service.getCropManuals();
  assert.deepEqual(
    manuals.map((item) => item.cropCode).sort(),
    MOCK_DATA.cropPackDetails.map((item) => item.cropCode).sort()
  );
  for (const cropCode of ['lettuce', 'eggplant']) {
    const manual = MOCK_DATA.cropPackDetails.find((item) => item.cropCode === cropCode);
    assert.ok(manual, `${cropCode} manual should be listed`);
    assert.equal(manual.stages.length, 4);
    assert.ok(Object.keys(manual.knowledge.byStage).length >= 4);
    assert.ok(manual.knowledge.sourceNotes.length >= 2);
  }
});

test('farmer plot cards hide soil EC charts and localize metric codes', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../farmer.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/farmer.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(source, /code:\s*['"]SOIL_EC['"]/);
  assert.doesNotMatch(html, /I-19\s*·/);
  assert.match(html, /plot_metrics\(plot\)/);
  assert.match(html, /metric_label\(metric\.code, metric\.label\)/);
  assert.match(html, /data-farmer-plot-id/);
  assert.match(source, /load_plot_order_preference/);
  assert.equal(metricLabel('AIR_HUMIDITY'), '空气湿度');
  assert.equal(metricLabel('LIGHT'), '光照');
  assert.equal(metricLabel('PH'), '酸碱度');
});

test('farmer assistant is a primary route with drawer history and safe action affordances', async () => {
  const [html, source, api, css, presentation] = await Promise.all([
    readFile(new URL('../farmer.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/farmer.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/farmer.css', import.meta.url), 'utf8'),
    readFile(new URL('../js/agent-presentation.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /current_view === 'assistant'/);
  assert.doesNotMatch(html, /farmer-ai-dock|farmer-ai-consult|show_ai_consult/);
  const surface = `${html}\n${source}\n${presentation}`;
  for (const marker of ['农智助手', '查看今天待办', '当前地块有什么风险', '生成当前地块补水建议', '帮我记录一次巡田', '历史对话', '新对话', '查看依据与执行记录', 'Enter 发送', '待确认', '执行中', '已完成', '已取消', '已过期']) {
    assert.match(surface, new RegExp(marker));
  }
  assert.match(surface, /Shift\+Enter 换行/);
  assert.match(source, /id: 'assistant', label: '农智助手'/);
  assert.match(source, /assistant_drawer_open/);
  assert.match(source, /getAgentConversations/);
  assert.match(source, /assistant_keydown/);
  assert.match(source, /confirm_assistant_action/);
  assert.match(source, /cancel_assistant_action/);
  assert.match(source, /refresh_assistant_action_states/);
  assert.match(source, /currentExists/);
  assert.match(source, /proposal\.status !== 'AWAITING_CONFIRMATION'/);
  assert.match(html, /v-if="message\.actionProposal\.status === 'AWAITING_CONFIRMATION'"/);
  assert.doesNotMatch(html, /\['AWAITING_CONFIRMATION', 'EXECUTING'\]\.includes\(message\.actionProposal\.status\)/);
  assert.match(api, /getAgentConversations\(limit = 20\)/);
  assert.match(api, /getAgentHistory\(conversationId/);
  assert.match(api, /\/api\/v1\/agent\/actions\/\$\{encodeURIComponent\(actionId\)\}/);

  const messageRule = css.match(/\.farmer-agent-message \{([^}]*)\}/)?.[1] || '';
  const userBubbleRule = css.match(/\.farmer-agent-user-bubble \{([^}]*)\}/)?.[1] || '';
  const answerRule = css.match(/\.farmer-agent-answer \{([^}]*)\}/)?.[1] || '';
  assert.match(messageRule, /width:\s*100%/);
  assert.match(messageRule, /min-width:\s*0/);
  assert.match(userBubbleRule, /width:\s*fit-content/);
  assert.match(userBubbleRule, /overflow-wrap:\s*break-word/);
  assert.match(userBubbleRule, /word-break:\s*normal/);
  assert.match(answerRule, /overflow-wrap:\s*break-word/);
  assert.match(answerRule, /word-break:\s*normal/);
  assert.match(api, /agriloop-workspace-session/);
  assert.match(api, /_demoSaveWorkspaceState/);
});
