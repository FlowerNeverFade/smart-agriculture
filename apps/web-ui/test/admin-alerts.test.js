import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.Vue = {
  ref: value => ({ value }),
  computed: getter => ({ get value() { return getter(); } }),
  inject: () => () => {},
  watch: () => {}
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const {
  AdminAlertCenter,
  chooseBestFarmer,
  assessAlertCredibility,
  finalizedAssignedTask,
  finalizedClosedAlert
} = await import('../js/admin-alerts.js');
const { api } = await import('../js/api.js');

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

test('后端百分制可信度会归一化，服务不可用时不能自动下发', () => {
  const high = assessAlertCredibility(
    { ruleState: 'CONFIRMED' },
    { confidence: 92, primaryCause: 'DEVICE_FAULT', missingInformation: [] }
  );
  const unavailable = assessAlertCredibility(
    { ruleState: 'CONFIRMED' },
    { confidence: 96, primaryCause: 'UNAVAILABLE', status: 'UNAVAILABLE', missingInformation: [] }
  );
  assert.equal(high.score, 0.92);
  assert.equal(high.highConfidence, true);
  assert.equal(unavailable.highConfidence, false);
  assert.ok(unavailable.score < 0.5);
});

test('告警页面保留 main 卡片详情结构并提供新的批量入口', () => {
  assert.match(AdminAlertCenter.template, /AI告警分析与智能处理/);
  assert.match(AdminAlertCenter.template, /全选当前列表/);
  assert.match(AdminAlertCenter.template, /一键关闭告警/);
  assert.match(AdminAlertCenter.template, /AI智能处理/);
  assert.match(AdminAlertCenter.template, /admin-alert-card-footer/);
  assert.match(AdminAlertCenter.template, /admin-alert-detail/);
  assert.doesNotMatch(AdminAlertCenter.template, /确认收到|升级处理|转成任务|一键下发任务/);
  assert.doesNotMatch(AdminAlertCenter.template, /<h2/);
});

test('管理员入口使用新名称且 AI 对话正文字号不小于 16px', () => {
  const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const chatSource = readFileSync(new URL('../js/modules/admin-ai-chat.js', import.meta.url), 'utf8');
  const chatCss = readFileSync(new URL('../css/modules/admin-ai-chat.css', import.meta.url), 'utf8');
  assert.match(appSource, /FARM_ADMIN: 'AI告警分析与智能处理'/);
  assert.doesNotMatch(appSource, /FARM_ADMIN: 'AI 告警处置'/);
  assert.match(chatCss, /\.admin-ai-bubble p\s*\{[^}]*font-size:\s*16px/s);
  assert.match(chatCss, /grid-template-rows:\s*auto minmax\(260px, 1fr\) auto/);
  assert.match(chatSource, /admin-ai-empty-state[\s\S]*admin-ai-suggestions[\s\S]*admin-ai-compose-area[\s\S]*admin-ai-composer/);
  assert.match(chatCss, /\.admin-ai-suggestions\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(chatCss, /\.admin-ai-composer\s*\{[^}]*border-radius:\s*24px/s);
  assert.doesNotMatch(chatSource, /<h2/);
});

test('派单与关闭响应会强制补齐可视状态', () => {
  const assigned = finalizedAssignedTask(
    { workItemId: 'wo-1', sourceType: 'ALERT', sourceRef: 'alert-1', status: 'OPEN' },
    { workItemId: 'wo-1' },
    { alertId: 'alert-1' },
    { userId: 'farmer-1', displayName: '小李' }
  );
  const closed = finalizedClosedAlert({ alertId: 'alert-1', status: 'ACTIVE' }, {});
  assert.equal(assigned.workOrderId, 'wo-1');
  assert.equal(assigned.assigneeId, 'farmer-1');
  assert.equal(assigned.assigneeName, '小李');
  assert.equal(assigned.status, 'ASSIGNED');
  assert.equal(closed.alertId, 'alert-1');
  assert.equal(closed.status, 'CLOSED');
});

test('AI 处理和关闭后会立即更新本地列表状态', async () => {
  const originals = {
    evaluateDiagnosis: api.evaluateDiagnosis,
    createWorkOrder: api.createWorkOrder,
    assignWorkOrder: api.assignWorkOrder,
    closeAlert: api.closeAlert
  };
  const alertToDispatch = { alertId: 'alert-dispatch', farmId: 'farm-demo', plotId: 'plot-a01', status: 'ACTIVE', level: 'HIGH', ruleState: 'CONFIRMED' };
  const alertToClose = { id: 'alert-close', farmId: 'farm-demo', plotId: 'plot-a01', status: 'ACTIVE', level: 'MEDIUM' };
  const state = {
    sessionMode: 'demo',
    adminContext: { farmId: 'farm-demo' },
    plots: [{ plotId: 'plot-a01', name: 'A01' }],
    alerts: [alertToDispatch, alertToClose],
    workOrders: [],
    farmMembers: [{ userId: 'farmer-1', displayName: '小李', role: 'FARMER', status: 'ACTIVE', plotIds: ['plot-a01'] }]
  };

  try {
    api.evaluateDiagnosis = async () => ({ confidence: 0.94, primaryCause: 'WATER_DEFICIT', missingInformation: [] });
    api.createWorkOrder = async () => ({ workItemId: 'wo-ai-1', status: 'OPEN' });
    api.assignWorkOrder = async () => ({ workItemId: 'wo-ai-1' });
    api.closeAlert = async alertId => ({ alertId });

    const view = AdminAlertCenter.setup({ state }, { emit: () => {} });
    await view.aiProcess([alertToDispatch]);
    assert.equal(view.reviewCount.value, 1);
    assert.equal(view.dispatchedCount.value, 1);
    assert.equal(state.workOrders[0].assigneeId, 'farmer-1');
    assert.equal(state.workOrders[0].sourceRef, 'alert-dispatch');

    await view.closeAlerts([alertToClose]);
    assert.equal(state.alerts.length, 2);
    assert.equal(state.alerts.find(item => (item.alertId || item.id) === 'alert-close').status, 'CLOSED');
    assert.equal(view.reviewCount.value, 0);
    assert.equal(view.closedCount.value, 1);
  } finally {
    Object.assign(api, originals);
  }
});

test('本地预览参数可直接进入农场管理员演示态', () => {
  const loginSource = readFileSync(new URL('../js/login.js', import.meta.url), 'utf8');
  assert.match(loginSource, /LOCAL_PREVIEW_ACCOUNTS/);
  assert.match(loginSource, /\['127\.0\.0\.1', 'localhost', '::1'\]/);
  assert.match(loginSource, /api\.saveSession\(\{ mode: 'demo', user: previewUser \}\)/);
  assert.match(loginSource, /index\.html#view=decision-console&farmId=farm-demo/);
});
