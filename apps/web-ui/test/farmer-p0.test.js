import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const storage = new Map();
globalThis.localStorage ||= {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};

const { ApiService } = await import('../js/api.js');

test('demo P0 contracts expose deterministic guard and dual branches', async () => {
  const service = new ApiService();
  service.saveSession({ mode: 'demo', user: { userId: 'demo-farmer', username: 'farmer', role: 'FARMER', permissions: ['plots:read', 'irrigation:request'] } });
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
  const approvalInput = { decision: 'REQUEST_APPROVAL', plotId: plan.plotId, planId: plan.planId, idempotencyKey: 'approval-demo-key' };
  const firstApproval = await service.submitDecisionFeedback(plan.traceId, approvalInput);
  const repeatedApproval = await service.submitDecisionFeedback(plan.traceId, approvalInput);
  assert.equal(firstApproval.workOrderId, repeatedApproval.workOrderId);
  assert.equal(firstApproval.approvalStatus, 'PENDING');
});

test('farmer can execute a virtual irrigation and update both simulated metrics', async () => {
  const service = new ApiService();
  service.saveSession({ mode: 'demo', user: { userId: 'demo-farmer', username: 'farmer', role: 'FARMER', permissions: ['plots:read', 'irrigation:request'] } });
  const before = (await service.getPlots({ farmId: 'farm-demo' })).find((plot) => plot.plotId === 'plot-a01');
  const plan = await service.estimateIrrigation({ plotId: 'plot-a01', traceId: 'trace-virtual-demo' });
  assert.equal(plan.executable, true);
  const command = await service.executeIrrigation(plan.planId, plan.plotId, {
    approved: true,
    executionMode: 'FARMER_VIRTUAL',
    idempotencyKey: 'virtual-demo-key'
  });
  assert.equal(command.status, 'SUCCEEDED');
  const after = (await service.getPlots({ farmId: 'farm-demo' })).find((plot) => plot.plotId === 'plot-a01');
  assert.ok(after.metrics.SOIL_MOISTURE.value > before.metrics.SOIL_MOISTURE.value);
  assert.ok(after.metrics.WATER_LEVEL.value < before.metrics.WATER_LEVEL.value);
  assert.equal(command.ack.sensorEffect.sourceMode, 'SIMULATION');
});

test('farmer page renders P0 evidence, quality, dual-track and read-only execution surfaces', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../farmer.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/farmer.js', import.meta.url), 'utf8')
  ]);
  for (const marker of ['阶段目标预览', '完整率', '支持证据', '反对证据', '缺失证据', '不干预 / 执行处方', '知识证据与工具审计', '确认并开始虚拟浇水', '水库水位', '地块模拟策略', '策略预测曲线', '策略由管理员维护']) {
    assert.match(html, new RegExp(marker));
  }
  assert.match(source, /getIrrigationGuard/);
  assert.match(source, /getDecisionPassport/);
  assert.match(source, /request_missing_evidence/);
  assert.match(source, /api\.executeIrrigation\(/);
  assert.match(source, /getPlotSimulation/);
  assert.match(source, /load_plot_simulation/);
  assert.match(source, /plot_simulation_chart/);
});

test('farmer can read the plot strategy and risk forecast without changing it', async () => {
  const service = new ApiService();
  service.saveSession({ mode: 'demo', user: { userId: 'demo-farmer', username: 'farmer', role: 'FARMER', permissions: ['plots:read'] } });
  const strategy = await service.getPlotSimulation('plot-a01');
  const forecast = await service.getRiskForecast('plot-a01', 'SOIL_MOISTURE');
  assert.equal(strategy.plotId, 'plot-a01');
  assert.ok(strategy.scenario);
  assert.ok(Array.isArray(strategy.scenarioCatalog) && strategy.scenarioCatalog.length >= 4);
  assert.ok(Array.isArray(forecast.curve) && forecast.curve.length > 1);
  assert.equal(forecast.metric, 'SOIL_MOISTURE');
});
