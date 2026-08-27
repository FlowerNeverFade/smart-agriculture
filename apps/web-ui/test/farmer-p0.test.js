import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metricLabel } from '../js/live-data.js';

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

test('farmer page renders P0 evidence, quality, dual-track and read-only execution surfaces', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../farmer.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/farmer.js', import.meta.url), 'utf8')
  ]);
  for (const marker of ['阶段目标预览', '完整率', '支持证据', '反对证据', '缺失证据', '执行 / 不执行双轨对比', '知识证据与工具审计', '农户不能自行填写执行成功']) {
    assert.match(html, new RegExp(marker));
  }
  assert.match(source, /getIrrigationGuard/);
  assert.match(source, /getDecisionPassport/);
  assert.match(source, /request_missing_evidence/);
  assert.doesNotMatch(source, /api\.executeIrrigation\(/);
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
