import test from 'node:test';
import assert from 'node:assert/strict';
import { adminSummary, domainsForEventType, formatHealthScore, hasFarmPlotRefresh, isLatestFarmResponse, mergeFarmPlots, normalizeAdminTab, routeHash, selectAuthorizedFarm } from '../js/admin-state.js';

test('authorized farm selection never invents a live farm', () => {
  const farms = [{ farmId: 'farm-a' }, { farmId: 'farm-b' }];
  assert.equal(selectAuthorizedFarm(farms, 'farm-b'), 'farm-b');
  assert.equal(selectAuthorizedFarm(farms, 'unknown'), 'farm-a');
  assert.equal(selectAuthorizedFarm([], 'farm-demo'), '');
});

test('admin tabs and hash routes retain the shared farm context', () => {
  assert.equal(normalizeAdminTab('dashboard', 'plots'), 'overview');
  assert.equal(normalizeAdminTab('work-orders', 'plans'), 'plans');
  assert.equal(normalizeAdminTab('work-orders', 'unknown'), 'tasks');
  assert.equal(routeHash('resource-coordination', { tab: 'devices', farmId: 'farm-a' }), '#view=resource-coordination&tab=devices&farmId=farm-a');
});

test('farm summary and merged plot facts use current records', () => {
  const plots = mergeFarmPlots([{ plotId: 'p1', status: 'ACTIVE', areaM2: 80 }], [{ plotId: 'p1', riskLevel: 'HIGH', latest: { SOIL_MOISTURE: { value: 12, unit: '%', quality: { status: 'GOOD' } } } }]);
  const summary = adminSummary({ plots, workOrders: [{ status: 'OPEN', dueAt: '2026-01-01T00:00:00Z' }] }, Date.parse('2026-08-26T00:00:00Z'));
  assert.equal(plots[0].areaM2, 80);
  assert.equal(plots[0].metrics.SOIL_MOISTURE.value, 12);
  assert.deepEqual(summary, { today: 1, overdue: 1, abnormal: 1, unassigned: 1, approval: 0 });
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
