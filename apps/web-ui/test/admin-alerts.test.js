import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.Vue = {
  ref: value => ({ value }),
  computed: getter => ({ get value() { return getter(); } }),
  inject: () => () => {}
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const { chooseBestFarmer, assessAlertCredibility } = await import('../js/admin-alerts.js');

test('AI 派单只选择在岗且有地块权限的农户', () => {
  const members = [
    { userId: 'busy', displayName: '老张', role: 'FARMER', status: 'ACTIVE', plotIds: ['plot-a01'] },
    { userId: 'free', displayName: '小李', role: 'FARMER', status: 'ACTIVE', plotIds: ['plot-a01'] },
    { userId: 'wrong-plot', displayName: '小王', role: 'FARMER', status: 'ACTIVE', plotIds: ['plot-b01'] },
    { userId: 'inactive', displayName: '老周', role: 'FARMER', status: 'INACTIVE', plotIds: ['*'] }
  ];
  const workOrders = [
    { assigneeId: 'busy', plotId: 'plot-a01', status: 'ASSIGNED' },
    { assigneeId: 'busy', plotId: 'plot-a01', status: 'IN_PROGRESS' },
    { assigneeId: 'free', plotId: 'plot-a01', status: 'DONE' }
  ];

  const result = chooseBestFarmer(members, workOrders, 'plot-a01');
  assert.equal(result.member.userId, 'free');
  assert.equal(result.activeLoad, 0);
  assert.match(result.reason, /当前进行中任务 0 项/);
});

test('AI 派单在工作量相同时优先有该地块经验的农户', () => {
  const members = [
    { userId: 'experienced', username: 'farmer-a', role: 'FARMER', status: 'ACTIVE', plotIds: ['plot-a01'] },
    { userId: 'newcomer', username: 'farmer-b', role: 'FARMER', status: 'ACTIVE', plotIds: ['plot-a01'] }
  ];
  const workOrders = [{ assigneeId: 'experienced', plotId: 'plot-a01', status: 'DONE' }];
  assert.equal(chooseBestFarmer(members, workOrders, 'plot-a01').member.userId, 'experienced');
});

test('多项证据可靠且无缺失信息时可自动处理', () => {
  const result = assessAlertCredibility(
    { ruleState: 'CONFIRMED' },
    { confidence: 0.91, primaryCause: 'WATER_DEFICIT', missingInformation: [] }
  );
  assert.equal(result.highConfidence, true);
  assert.equal(result.status, 'AUTO_READY');
  assert.equal(result.score, 0.91);
});

test('缺少关键检查或候选告警必须留给人工审核', () => {
  const missing = assessAlertCredibility(
    { ruleState: 'CONFIRMED' },
    { confidence: 0.95, primaryCause: 'SENSOR_DRIFT', missingInformation: ['PORTABLE_METER_COMPARISON'] }
  );
  const candidate = assessAlertCredibility(
    { ruleState: 'CANDIDATE' },
    { confidence: 0.96, primaryCause: 'WATER_DEFICIT', missingInformation: [] }
  );
  assert.equal(missing.highConfidence, false);
  assert.ok(missing.score < 0.78);
  assert.equal(candidate.highConfidence, false);
  assert.ok(candidate.score < 0.78);
});
