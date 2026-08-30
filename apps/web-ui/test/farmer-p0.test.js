import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metricLabel } from '../js/live-data.js';
import { MOCK_DATA } from '../js/mock-data.js';
import { canExecuteIrrigation, roleCan } from '../js/roles.js';

const storage = new Map();
globalThis.localStorage ||= {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};

const { ApiService } = await import('../js/api.js');

test('demo P0 contracts expose deterministic guard, dual branches and direct farmer execution', async () => {
  const service = new ApiService();
  service.saveSession({ mode: 'demo', user: { userId: 'demo-farmer', username: 'farmer', role: 'FARMER', permissions: ['plots:read', 'irrigation:request', 'irrigation:execute'] } });
  assert.equal(canExecuteIrrigation('FARMER'), true);
  assert.equal(roleCan('FARMER', 'irrigation:approve'), false);
  assert.equal(canExecuteIrrigation('FARM_ADMIN'), true);
  const guard = await service.getIrrigationGuard('plot-a01');
  assert.equal(guard.provenance, 'SIMULATED');
  assert.ok(['TRIGGERED', 'HOLD', 'RESET'].includes(guard.hysteresis.state));
  assert.equal(typeof guard.cooldownMinutes, 'number');

  const compare = await service.compareScenario({ scenario: 'DROUGHT', seed: 42, plotId: 'plot-a01' });
  assert.equal(compare.seed, 42);
  assert.ok(compare.branches.EXECUTE.points.length > 10);
  assert.equal(compare.branches.EXECUTE.points.length, compare.branches.NO_ACTION.points.length);
  assert.equal(compare.frozenSnapshot.plotId, 'plot-a01');

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
  assert.ok(afterMoisture > beforeMoisture);
  const afterTelemetry = (await service.getTelemetry(plan.plotId, 'SOIL_MOISTURE', 1))[0].value;
  assert.ok(afterTelemetry > beforeTelemetry + 5);
  const passport = await service.getDecisionPassport(plan.traceId);
  assert.equal(passport.commands.at(-1).commandId, firstCommand.commandId);
  assert.equal(passport.evaluations.at(-1).commandId, firstCommand.commandId);
});

test('farmer page keeps P0 evidence and exposes risk prediction under more tools', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../farmer.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/farmer.js', import.meta.url), 'utf8')
  ]);
  for (const marker of ['阶段目标预览', '完整率', '支持证据', '反对证据', '缺失证据', '知识证据与工具审计', '查看建议并执行', '农户不能自行填写执行成功', '地块模拟策略', '策略预测曲线', '策略由管理员维护']) {
    assert.match(html, new RegExp(marker));
  }
  for (const marker of ['更多工具', '风险预测', '作物培养手册', '生成双轨预测', 'risk_tool_parameters']) {
    assert.match(html + source, new RegExp(marker));
  }
  assert.match(source, /compareScenario/);
  assert.match(source, /getIrrigationGuard/);
  assert.match(source, /getDecisionPassport/);
  assert.match(source, /request_missing_evidence/);
  assert.match(source, /api\.executeIrrigation\(plan\.planId/);
  assert.match(source, /farmer-irrigation-\$\{plan\.planId\}/);
  assert.match(source, /load_plot_simulation/);
  assert.match(source, /plot_simulation_chart/);
});

test('farmer can read plot simulation strategy and forecast curve', async () => {
  const service = new ApiService();
  service.saveSession({ mode: 'demo', user: { userId: 'demo-farmer', username: 'farmer', role: 'FARMER', permissions: ['plots:read'] } });
  const strategy = await service.getPlotSimulation('plot-a01');
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
  assert.match(html, /metric_label\(code, metric\.label\)/);
  assert.match(html, /metric_label\(metric\.code, metric\.label\)/);
  assert.equal(metricLabel('AIR_HUMIDITY'), '空气湿度');
  assert.equal(metricLabel('LIGHT'), '光照');
  assert.equal(metricLabel('PH'), '酸碱度');
});
