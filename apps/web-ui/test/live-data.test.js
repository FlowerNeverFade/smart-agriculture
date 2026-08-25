import test from 'node:test';
import assert from 'node:assert/strict';

import {
  agentResponseSource,
  agentResponseText,
  buildFarmerMessages,
  mapStrategyCandidate,
  mapTimelineRecord,
  normalizeFarmerTask,
  normalizeWorkStatus
} from '../js/live-data.js';

test('agent surfaces show the generated narrative instead of the card summary', () => {
  const response = {
    adapter: 'openai-compatible',
    degraded: false,
    summary: '已读取地块状态',
    narrative: '**当前地块状态**\n土壤湿度正常。'
  };
  assert.equal(agentResponseText(response), '当前地块状态\n土壤湿度正常。');
  assert.equal(agentResponseSource(response), 'Qwen 实时回答');
  assert.equal(agentResponseSource({ degraded: true, adapter: 'openai-compatible' }), '规则降级回答');
  assert.equal(agentResponseText({ summary: '规则摘要' }), '规则摘要');
});

test('formal work-order records keep backend status and plot context', () => {
  assert.equal(normalizeWorkStatus('CLAIMED'), 'ASSIGNED');
  const plot = { plotId: 'plot-a01', name: '温室1' };
  const task = normalizeFarmerTask({
    workOrderId: 'wo-flow-1',
    plotId: 'plot-a01',
    status: 'CLAIMED',
    title: '现场复测',
    createdAt: '2026-08-26T10:00:00Z'
  }, new Map([['plot-a01', plot]]));
  assert.equal(task.status, 'ASSIGNED');
  assert.equal(task.plot_name, '温室1');
  assert.equal(task.dataOrigin, 'BACKEND');
});

test('farmer messages are rebuilt from backend alerts, tasks and inspections', () => {
  const messages = buildFarmerMessages({
    plots: [{ plotId: 'plot-a01', name: '温室1' }],
    alerts: [{ alertId: 'alert-1', plotId: 'plot-a01', title: '土壤偏干', status: 'ACTIVE', raisedAt: '2026-08-26T10:01:00Z' }],
    tasks: [{ workOrderId: 'wo-1', plotId: 'plot-a01', title: '复测', status: 'OPEN', createdAt: '2026-08-26T10:02:00Z' }],
    inspections: [{ inspectionId: 'ins-1', plotId: 'plot-a01', notes: '表层略干', observedAt: '2026-08-26T10:03:00Z' }]
  });
  assert.deepEqual(messages.map((item) => item.id), ['inspection:ins-1', 'work:wo-1', 'alert:alert-1']);
  assert.ok(messages.every((item) => item.dataOrigin === 'BACKEND'));
});

test('system-admin records preserve backend strategy and audit states', () => {
  assert.equal(mapStrategyCandidate({ candidateId: 'c-1', status: 'ROLLED_BACK' }).status, 'rolled_back');
  const timeline = mapTimelineRecord({
    type: 'inspection',
    at: '2026-08-26T10:04:00Z',
    record: { inspectionId: 'ins-2', plotId: 'plot-a01', notes: '设备正常' }
  });
  assert.equal(timeline.typeLabel, '巡田');
  assert.equal(timeline.timeIso, '2026-08-26T10:04:00Z');
  assert.equal(timeline.dataOrigin, 'BACKEND');
});
