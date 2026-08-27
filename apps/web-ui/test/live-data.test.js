import test from 'node:test';
import assert from 'node:assert/strict';

import {
  agentResponseSource,
  agentResponseText,
  buildFarmerMessages,
  displayText,
  mapStrategyCandidate,
  mapTimelineRecord,
  mergePlotTelemetryWindow,
  normalizeFarmerTask,
  normalizeWorkStatus,
  relativeTime,
  scenarioLabel,
  serviceNameLabel,
  serviceStatusLabel,
  sourceLabel
} from '../js/live-data.js';

test('presentation helpers localize shared technical labels without changing identifiers', () => {
  assert.equal(serviceNameLabel('MQTT Broker'), 'MQTT 消息代理');
  assert.equal(serviceStatusLabel('DEGRADED'), '降级');
  assert.equal(sourceLabel('SIMULATED'), '模拟数据');
  assert.equal(scenarioLabel('SENSOR_DRIFT'), '传感器漂移');
  assert.equal(displayText('WATER_DEFICIT · READY · 153L / 8m30s'), '缺水风险 · 就绪 · 153 升 / 8 分 30 秒');
  assert.equal(displayText('Crop Pack rules-only Time-to-Risk'), '作物模型包 规则兜底 风险到达时间');
  assert.equal(displayText('plot-a01'), 'plot-a01');
});

test('fresh telemetry updates farmer card values without a full overview reload', () => {
  const plot = {
    plotId: 'plot-a01',
    metrics: {
      SOIL_MOISTURE: { label: '土壤湿度', value: 28, unit: '%', history: [] },
      AIR_TEMPERATURE: { label: '空气温度', value: 25, unit: '°C', history: [] }
    }
  };
  const merged = mergePlotTelemetryWindow(plot, [
    { metric: 'SOIL_MOISTURE', value: 31.2, unit: '%', ts: '2026-08-26T10:00:00Z', quality: { status: 'GOOD' } },
    { metric: 'SOIL_MOISTURE', value: 32.7, unit: '%', ts: '2026-08-26T10:00:05Z', quality: { status: 'GOOD' } },
    { metric: 'AIR_TEMPERATURE', value: 26.4, unit: '°C', ts: '2026-08-26T10:00:05Z', quality: { status: 'GOOD' } }
  ]);
  assert.equal(merged.metrics.SOIL_MOISTURE.value, 32.7);
  assert.equal(merged.metrics.SOIL_MOISTURE.observedAt, '2026-08-26T10:00:05Z');
  assert.equal(merged.metrics.SOIL_MOISTURE.history.length, 2);
  assert.equal(merged.metrics.AIR_TEMPERATURE.value, 26.4);
});

test('timeline cards ignore epoch placeholders and keep actionable summaries', () => {
  assert.equal(relativeTime(0, Date.parse('2026-08-26T00:00:00Z')), '—');
  const record = mapTimelineRecord({
    type: 'diagnosis',
    at: '2026-08-26T10:00:00Z',
    record: { plotId: 'plot-a01', riskType: 'DEVICE_FAULT', diagnosisId: 'diag-1' }
  });
  assert.equal(record.summary, '诊断完成：DEVICE_FAULT');
  assert.equal(record.typeLabel, '诊断');
});

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

test('farmer inbox collapses duplicate active alerts for the same plot and source', () => {
  const messages = buildFarmerMessages({
    plots: [{ plotId: 'plot-a01', name: '温室1' }],
    alerts: [
      { alertId: 'alert-1', plotId: 'plot-a01', source: 'WATER_DEFICIT_RULE', title: '土壤持续偏干', status: 'ACTIVE', raisedAt: '2026-08-26T10:01:00Z' },
      { alertId: 'alert-2', plotId: 'plot-a01', source: 'WATER_DEFICIT_RULE', title: '土壤持续偏干', status: 'ACTIVE', raisedAt: '2026-08-26T10:02:00Z' },
      { alertId: 'alert-3', plotId: 'plot-a01', source: 'SENSOR_DRIFT_RULE', title: '传感器数据可能不可靠', status: 'ACTIVE', raisedAt: '2026-08-26T10:03:00Z' }
    ]
  });
  assert.deepEqual(messages.map((item) => item.id), ['alert:alert-3', 'alert:alert-2']);
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
