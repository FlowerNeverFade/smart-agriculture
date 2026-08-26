import test from 'node:test';
import assert from 'node:assert/strict';
import { adminSummary, domainsForEventType, formatHealthScore, hasFarmPlotRefresh, isLatestFarmResponse, managerSummaryTarget, mergeFarmPlots, normalizeAdminTab, normalizeWorkSummaryScope, routeHash, selectAuthorizedFarm, workOrderMatchesSummaryScope } from '../js/admin-state.js';

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
  assert.equal(normalizeAdminTab('work-orders', 'unknown'), 'tasks');
  assert.equal(routeHash('resource-coordination', { tab: 'devices', farmId: 'farm-a' }), '#view=resource-coordination&tab=devices&farmId=farm-a');
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
