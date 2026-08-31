import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminDeviceMatchesFilters,
  adminDeviceSummary,
  adminDeviceTypeLabel,
  adminCropEmoji,
  adminCropKey,
  adminHealthTone,
  adminMetricLabel,
  adminSummary,
  adminWorkActionMeta,
  adminWorkAttentionSummary,
  adminWorkLifecycleSummary,
  alertAcknowledgementAction,
  deviceRelatedAlerts,
  deviceRelatedWorkOrders,
  domainsForEventType,
  formatHealthScore,
  hasFarmPlotRefresh,
  isLatestFarmResponse,
  legacyAdminTabTarget,
  managerSummaryTarget,
  mergeFarmPlots,
  normalizeAdminTab,
  normalizeWorkSummaryScope,
  routeHash,
  selectAuthorizedFarm,
  workOrderMatchesAttention,
  workOrderMatchesSummaryScope
} from '../js/admin-state.js';

test('farm dashboard crop Emoji use stable aliases and a neutral fallback', () => {
  assert.equal(adminCropKey({ cropCode: 'tomato', cropName: '设施番茄' }), 'tomato');
  assert.equal(adminCropKey({ cropName: '鲜食玉米' }), 'corn');
  assert.equal(adminCropKey({ cropName: '油葵花海' }), 'sunflower');
  assert.equal(adminCropKey({ cropCode: 'pepper', cropName: '辣椒' }), 'pepper');
  assert.equal(adminCropKey({ cropCode: 'dragon-fruit', cropName: '火龙果' }), 'unknown');
  assert.equal(adminCropEmoji({ cropCode: 'tomato' }), '🍅');
  assert.equal(adminCropEmoji({ cropName: '鲜食玉米' }), '🌽');
  assert.equal(adminCropEmoji({ cropCode: 'dragon-fruit', cropName: '火龙果' }), '🌱');
});

test('authorized farm selection never invents a live farm', () => {
  const farms = [{ farmId: 'farm-a' }, { farmId: 'farm-b' }];
  assert.equal(selectAuthorizedFarm(farms, 'farm-b'), 'farm-b');
  assert.equal(selectAuthorizedFarm(farms, 'unknown'), 'farm-a');
  assert.equal(selectAuthorizedFarm([], 'farm-demo'), '');
});

test('admin tabs and hash routes retain the shared farm context', () => {
  assert.equal(normalizeAdminTab('dashboard', 'plots'), 'overview');
  assert.equal(normalizeAdminTab('farm-members', 'permissions'), 'members');
  assert.equal(normalizeAdminTab('work-orders', 'plans'), 'plans');
  assert.equal(normalizeAdminTab('work-orders', 'resources'), 'resources');
  assert.equal(normalizeAdminTab('resource-coordination', 'simulator'), 'devices');
  assert.equal(normalizeAdminTab('work-orders', 'unknown'), 'tasks');
  assert.equal(routeHash('resource-coordination', { tab: 'devices', farmId: 'farm-a' }), '#view=resource-coordination&tab=devices&farmId=farm-a');
});

test('legacy farm admin resource addresses preserve the farm and reach the new owner', () => {
  assert.deepEqual(legacyAdminTabTarget('resource-coordination', 'irrigation', 'farm-a'), {
    view: 'work-orders', params: { tab: 'resources', farmId: 'farm-a' }
  });
  assert.deepEqual(legacyAdminTabTarget('resource-coordination', 'value', 'farm-b'), {
    view: 'work-orders', params: { tab: 'resources', farmId: 'farm-b' }
  });
  assert.deepEqual(legacyAdminTabTarget('resource-coordination', 'simulator', 'farm-a'), {
    view: 'resource-coordination', params: { tab: 'devices', farmId: 'farm-a' }
  });
  assert.deepEqual(legacyAdminTabTarget('admin-simulator', '', 'farm-a'), {
    view: 'resource-coordination', params: { tab: 'devices', farmId: 'farm-a' }
  });
  assert.equal(legacyAdminTabTarget('work-orders', 'tasks', 'farm-a'), null);
});

test('bound device without heartbeat is reflected on its plot immediately', () => {
  const plots = mergeFarmPlots(
    [{ plotId: 'p-new', name: '新地块', lastSeen: '等待设备接入', deviceStatus: 'UNBOUND' }],
    [{ plotId: 'p-new', device: {} }],
    [{ deviceId: 'sensor-new', plotId: 'p-new', bindingState: 'BOUND', status: 'OFFLINE', lastSeen: null }]
  );
  assert.equal(plots[0].deviceId, 'sensor-new');
  assert.equal(plots[0].deviceStatus, 'OFFLINE');
  assert.equal(plots[0].lastSeen, '设备已绑定，等待首次数据');
});

test('farm summary and merged plot facts use current records', () => {
  const plots = mergeFarmPlots([{ plotId: 'p1', status: 'ACTIVE', areaM2: 80 }], [{ plotId: 'p1', riskLevel: 'HIGH', latest: { SOIL_MOISTURE: { value: 12, unit: '%', quality: { status: 'GOOD' } } } }]);
  const summary = adminSummary({ plots, workOrders: [{ status: 'OPEN', dueAt: '2026-01-01T00:00:00Z' }] }, Date.parse('2026-08-26T00:00:00Z'));
  assert.equal(plots[0].areaM2, 80);
  assert.equal(plots[0].metrics.SOIL_MOISTURE.value, 12);
  assert.deepEqual(summary, { today: 1, overdue: 1, abnormal: 1, unassigned: 1, approval: 0 });
});

test('manager summary entries route to a real destination with the farm context', () => {
  assert.deepEqual(managerSummaryTarget('today', 'farm-a'), {
    view: 'work-orders', params: { tab: 'tasks', scope: 'today', farmId: 'farm-a' }
  });
  assert.deepEqual(managerSummaryTarget('overdue', 'farm-a'), {
    view: 'work-orders', params: { tab: 'tasks', scope: 'overdue', farmId: 'farm-a' }
  });
  assert.deepEqual(managerSummaryTarget('abnormal', 'farm-a'), {
    view: 'decision-console', params: { section: 'alerts', farmId: 'farm-a' }
  });
  assert.deepEqual(managerSummaryTarget('unassigned', 'farm-a'), {
    view: 'work-orders', params: { tab: 'tasks', scope: 'unassigned', farmId: 'farm-a' }
  });
  assert.deepEqual(managerSummaryTarget('approval', 'farm-a'), {
    view: 'work-orders', params: { tab: 'tasks', scope: 'approval', farmId: 'farm-a' }
  });
  assert.equal(managerSummaryTarget('unknown', 'farm-a'), null);
});

test('dashboard task scopes reproduce overdue, unassigned, and approval queues', () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  const overdue = { status: 'ASSIGNED', assigneeId: 'farmer-a', dueAt: '2026-08-26T10:00:00Z', actionType: 'FIELD_OPERATION' };
  const unassigned = { status: 'OPEN', assigneeId: '', dueAt: '2026-08-27T10:00:00Z', actionType: 'FIELD_OPERATION' };
  const approval = { status: 'OPEN', assigneeId: 'farmer-a', dueAt: '2026-08-27T10:00:00Z', actionType: 'IRRIGATION_REVIEW' };
  assert.equal(normalizeWorkSummaryScope('OVERDUE'), 'overdue');
  assert.equal(normalizeWorkSummaryScope('invalid'), '');
  assert.equal(workOrderMatchesSummaryScope(overdue, 'overdue', now), true);
  assert.equal(workOrderMatchesSummaryScope(unassigned, 'unassigned', now), true);
  assert.equal(workOrderMatchesSummaryScope(approval, 'approval', now), true);
  assert.equal(workOrderMatchesSummaryScope({ ...approval, status: 'DONE' }, 'approval', now), false);
});

test('farm admin metrics prefer concise Chinese names for known backend codes', () => {
  assert.equal(adminMetricLabel('SOIL_MOISTURE', 'Soil Moisture'), '土壤湿度');
  assert.equal(adminMetricLabel('soilMoisture', ''), '土壤湿度');
  assert.equal(adminMetricLabel('CO2', 'CO2 Concentration'), '二氧化碳');
  assert.equal(adminMetricLabel('SOIL_EC', 'Soil EC'), '土壤电导率');
  assert.equal(adminMetricLabel('custom', 'Air Temperature'), '空气温度');
  assert.equal(adminMetricLabel('DEVICE_FRESHNESS', ''), '设备数据新鲜度');
  assert.equal(adminMetricLabel('CUSTOM_INDEX', '自定义指标'), '自定义指标');
});

test('farm admin device cards translate known types without guessing unknown values', () => {
  assert.equal(adminDeviceTypeLabel('ENVIRONMENTAL_SENSOR'), '环境传感器');
  assert.equal(adminDeviceTypeLabel('irrigation-controller'), '灌溉控制器');
  assert.equal(adminDeviceTypeLabel('FLOW_METER'), '流量计');
  assert.equal(adminDeviceTypeLabel('土壤传感器'), '土壤传感器');
  assert.equal(adminDeviceTypeLabel('CUSTOM_SENSOR'), 'CUSTOM_SENSOR');
  assert.equal(adminDeviceTypeLabel(''), '类型未知');
});

test('device overview and filters use current device facts', () => {
  const devices = [
    { deviceId: 'dev-a', name: 'A01 土壤', type: 'ENVIRONMENTAL_SENSOR', status: 'ONLINE', plotId: 'plot-a', bindingState: 'BOUND', plotName: 'A01 番茄示范田' },
    { deviceId: 'dev-b', name: '备用流量计', type: 'FLOW_METER', status: 'OFFLINE', plotId: null, bindingState: 'UNBOUND' },
    { deviceId: 'dev-c', name: '自定义终端', type: 'CUSTOM_GATEWAY', status: 'DEGRADED', plotId: 'plot-b', bindingState: 'BOUND', plotName: 'B01 水稻田' }
  ];
  assert.deepEqual(adminDeviceSummary(devices), { all: 3, online: 1, attention: 2, unbound: 1 });
  assert.equal(adminDeviceMatchesFilters(devices[0], { status: 'ONLINE' }), true);
  assert.equal(adminDeviceMatchesFilters(devices[0], { status: 'ATTENTION' }), false);
  assert.equal(adminDeviceMatchesFilters(devices[1], { binding: 'UNBOUND' }), true);
  assert.equal(adminDeviceMatchesFilters(devices[2], { type: 'CUSTOM_GATEWAY' }), true);
  assert.equal(adminDeviceMatchesFilters(devices[0], { keyword: '番茄' }), true);
  assert.equal(adminDeviceMatchesFilters(devices[0], { keyword: '不存在' }), false);
});

test('device detail derives only device-class alerts and device-check tasks', () => {
  const device = { deviceId: 'dev-a', plotId: 'plot-a' };
  const alerts = [
    { alertId: 'direct', sourceRef: 'dev-a', plotId: 'plot-z', source: 'CUSTOM' },
    { alertId: 'same-plot-device', plotId: 'plot-a', source: 'DEVICE_FRESHNESS' },
    { alertId: 'same-plot-crop', plotId: 'plot-a', source: 'SOIL_MOISTURE' },
    { alertId: 'other-device', plotId: 'plot-b', source: 'DEVICE_HEALTH' }
  ];
  const tasks = [
    { workOrderId: 'direct-task', actionType: 'DEVICE_CHECK', sourceRef: 'dev-a', plotId: 'plot-z' },
    { workOrderId: 'same-plot-task', actionType: 'DEVICE_CHECK', plotId: 'plot-a' },
    { workOrderId: 'irrigation-task', actionType: 'IRRIGATION_REVIEW', plotId: 'plot-a' },
    { workOrderId: 'other-task', actionType: 'DEVICE_CHECK', plotId: 'plot-b' }
  ];
  assert.deepEqual(deviceRelatedAlerts(device, alerts).map(item => item.alertId), ['direct', 'same-plot-device']);
  assert.deepEqual(deviceRelatedWorkOrders(device, tasks).map(item => item.workOrderId), ['direct-task', 'same-plot-task']);
});

test('farm admin task types use agricultural labels and preserve unknown backend values', () => {
  assert.deepEqual(adminWorkActionMeta('INSPECTION'), {
    code: 'INSPECTION', key: 'inspection', label: '巡田核验', icon: 'fact_check', tone: 'inspection'
  });
  assert.equal(adminWorkActionMeta('IRRIGATION_CHECK').label, '灌溉巡检');
  assert.equal(adminWorkActionMeta('FERTILIZATION').label, '施肥检查');
  assert.equal(adminWorkActionMeta('CUSTOM_FIELD_JOB').label, 'CUSTOM_FIELD_JOB');
});

test('farm admin lifecycle summary keeps every task in one explicit stage', () => {
  const summary = adminWorkLifecycleSummary([
    { status: 'OPEN' },
    { status: 'ASSIGNED' },
    { status: 'IN_PROGRESS' },
    { status: 'SUBMITTED' },
    { status: 'REJECTED' },
    { status: 'DONE' },
    { status: 'COMPLETED' },
    { status: 'CANCELLED' }
  ]);
  assert.deepEqual(summary, { all: 8, open: 1, assigned: 1, inProgress: 1, submitted: 1, rejected: 1, finished: 3 });
});

test('farm admin attention filters stay independent from lifecycle status', () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  const orders = [
    { status: 'ASSIGNED', priority: 'MEDIUM', dueAt: '2026-08-26T10:00:00Z' },
    { status: 'IN_PROGRESS', priority: 'HIGH', dueAt: '2026-08-26T13:00:00Z' },
    { status: 'SUBMITTED', priority: 'LOW', dueAt: '2026-08-29T09:00:00Z' },
    { status: 'DONE', priority: 'HIGH', dueAt: '2026-08-25T09:00:00Z' }
  ];
  assert.equal(workOrderMatchesAttention(orders[0], 'OVERDUE', now), true);
  assert.equal(workOrderMatchesAttention(orders[1], 'DUE_TODAY', now), true);
  assert.equal(workOrderMatchesAttention(orders[2], 'UPCOMING', now), true);
  assert.equal(workOrderMatchesAttention(orders[3], 'HIGH', now), false);
  assert.deepEqual(adminWorkAttentionSummary(orders, now), { overdue: 1, dueToday: 1, upcoming: 1, high: 1 });
});

test('escalated alerts expose the existing acknowledgement action as downgrade', () => {
  assert.deepEqual(alertAcknowledgementAction('ESCALATED'), {
    label: '降级处理',
    successMessage: '告警已降级为已确认，继续保留以便后续处理'
  });
  assert.equal(alertAcknowledgementAction('ACKED'), null);
});

test('backend events invalidate every affected fact domain', () => {
  assert.deepEqual(domainsForEventType('device.bound'), ['devices', 'plots', 'overview']);
  assert.deepEqual(domainsForEventType('cropplan.approved'), ['workOrders', 'overview', 'batches']);
});

test('an old farm response cannot overwrite the newly selected farm', () => {
  assert.equal(isLatestFarmResponse(4, 4, 'farm-b', 'farm-b'), true);
  assert.equal(isLatestFarmResponse(3, 4, 'farm-a', 'farm-b'), false);
  assert.equal(isLatestFarmResponse(4, 4, 'farm-a', 'farm-b'), false);
});

test('a ledger-only refresh never replaces plot facts with overview cards', () => {
  assert.equal(hasFarmPlotRefresh({ ledgers: { status: 'fulfilled', value: [] } }), false);
  assert.equal(hasFarmPlotRefresh({ overview: { status: 'fulfilled', value: { plots: [] } } }), true);
});

test('missing health never masquerades as a zero score', () => {
  assert.equal(formatHealthScore(null), '—');
  assert.equal(formatHealthScore(undefined), '—');
  assert.equal(formatHealthScore(0.98), '98');
});

test('farm admin health color depends only on the displayed score', () => {
  assert.equal(adminHealthTone(0.88), 'good');
  assert.equal(adminHealthTone(88), 'good');
  assert.equal(adminHealthTone(0.855), 'good');
  assert.equal(adminHealthTone(0.72), 'attention');
  assert.equal(adminHealthTone(0.52), 'danger');
  assert.equal(adminHealthTone(null), 'unavailable');
});
