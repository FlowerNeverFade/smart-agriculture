import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const storage = new Map();
globalThis.localStorage = globalThis.localStorage || {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};
globalThis.Vue = globalThis.Vue || {
  ref: (value) => ({ value }),
  computed: (getter) => ({ get value() { return getter(); } }),
  watch: () => {},
  onMounted: () => {},
  onBeforeUnmount: () => {},
  nextTick: async () => {},
  inject: () => null
};

const { ApiService } = await import('../js/api.js');
const { roleViews } = await import('../js/roles.js');
const { legacyAdminTabTarget } = await import('../js/admin-state.js');
const { buildResourceRows, resourceQuotaSummary, mergeAllocationRows, validateResourceAdjustment } = await import('../js/modules/admin-resource-planning.js');

test('demo what-if evaluation is deterministic, versioned, and does not save the plot strategy', async () => {
  const service = new ApiService();
  service.sessionMode = 'demo';
  const before = JSON.stringify(service.demoSimulationStrategies.get('plot-a01'));
  const drought = await service.evaluateRiskForecast({
    plotId: 'plot-a01', metric: 'SOIL_MOISTURE', scenario: 'DROUGHT', requestVersion: 41,
    parameters: { soilMoistureTrendPerHour: -5, forecastHours: 2 }
  });
  const rain = await service.evaluateRiskForecast({
    plotId: 'plot-a01', metric: 'SOIL_MOISTURE', scenario: 'HEAVY_RAIN', requestVersion: 42,
    parameters: { rainfallRate: 48, forecastHours: 2 }
  });
  assert.equal(drought.persisted, false);
  assert.equal(drought.requestVersion, 41);
  assert.equal(drought.modelMode, 'DETERMINISTIC_WHAT_IF');
  assert.equal(drought.curve[0].expected, drought.startValue);
  assert.ok(drought.curve.at(-1).expected < drought.curve[0].expected);
  assert.ok(rain.curve.at(-1).expected > rain.curve[0].expected);
  assert.equal(JSON.stringify(service.demoSimulationStrategies.get('plot-a01')), before);
  const bounded = await service.evaluateRiskForecast({
    plotId: 'plot-a01', scenario: 'DROUGHT', parameters: { volatility: 99 }
  });
  assert.equal(bounded.inputSnapshot.parameters.volatility, 3);
  assert.ok(bounded.warnings.some((warning) => warning.includes('volatility')));
  await assert.rejects(service.evaluateRiskForecast({
    plotId: 'plot-a01', scenario: 'DROUGHT', parameters: { riskThreshold: 90, waterloggingThreshold: 80 }
  }), (error) => error.code === 'SIMULATION_THRESHOLD_INVALID');
  await assert.rejects(service.evaluateRiskForecast({ plotId: 'plot-a01', scenario: 'ALIEN_WEATHER' }), (error) => error.code === 'SIMULATION_SCENARIO_INVALID');
  await assert.rejects(service.evaluateRiskForecast({ scenario: 'DROUGHT' }), (error) => error.code === 'PLOT_CONTEXT_REQUIRED');
});

test('resource helpers rank risk, expose quota facts, merge shortages, and require adjustment reasons', () => {
  const rows = buildResourceRows([
    { plotId: 'p-low', name: '低风险田', areaM2: 80, riskLevel: 'LOW', metrics: { SOIL_MOISTURE: { value: 30, target: '20~40%' } } },
    { plotId: 'p-high', name: '高风险田', areaM2: 100, riskLevel: 'HIGH', metrics: { SOIL_MOISTURE: { value: 14, target: '20~40%' } } }
  ], [{ deviceId: 'dev-high', plotId: 'p-high', status: 'ONLINE' }]);
  assert.equal(rows[0].plotId, 'p-high');
  assert.equal(rows[0].deviceId, 'dev-high');
  const summary = resourceQuotaSummary({ capacityLitres: 900, usedTodayLitres: 120 }, {
    constraints: { waterCapacityLitres: 800 }, allocations: [{ plotId: 'p-high', allocatedLitres: 200 }]
  }, rows);
  assert.deepEqual({ capacity: summary.capacity, actual: summary.actual, reserved: summary.reserved, balance: summary.balance }, { capacity: 800, actual: 120, reserved: 200, balance: 600 });
  const merged = mergeAllocationRows(rows, { allocations: [{ plotId: 'p-high', allocatedLitres: 50 }], unmetDemands: [{ plotId: 'p-high', unmetLitres: 20 }] });
  assert.equal(merged[0].allocationStatus, 'SHORTAGE');
  assert.equal(validateResourceAdjustment({ requestedLitres: 30, windowStart: '08:00', windowEnd: '09:00', reason: '' }), '人工调整必须填写原因');
  assert.equal(validateResourceAdjustment({ requestedLitres: 30, windowStart: '08:00', windowEnd: '09:00', reason: '高风险优先' }), '');
});

test('risk prediction is grouped under farmer tools while admin stays on shared routes', async () => {
  assert.ok(!roleViews('FARM_ADMIN').includes('risk-forecast'));
  assert.ok(!roleViews('FARMER').includes('risk-forecast'));
  assert.deepEqual(legacyAdminTabTarget('risk-forecast', '', 'farm-demo'), { view: 'dashboard', params: { farmId: 'farm-demo' } });
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const farmer = await readFile(new URL('../js/farmer.js', import.meta.url), 'utf8');
  const farmerHtml = await readFile(new URL('../farmer.html', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /RiskForecastView|localPreviewCurve|risk-forecast-view/);
  assert.doesNotMatch(index, /tmpl-risk-forecast/);
  assert.match(farmerHtml, /tools_tab === 'risk'/);
  assert.match(farmerHtml, /历史 \+ 策略预测/);
  assert.match(farmerHtml, /打开地块详情/);
  assert.match(farmer, /const match = raw\.match\(\/\^tools/);
  assert.match(farmer, /return \['risk', 'manual'\]\.includes\(tab\) \? tab : 'manual'/);
  assert.match(farmer, /const plot_simulation_forecast = ref\(null\)/);
  assert.match(farmer, /api\.getRiskForecast/);
});

test('plot detail uses debounced backend preview and stale-response sequencing', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /scheduleSimulationPreview/);
  assert.match(app, /evaluateRiskForecast/);
  assert.match(app, /previewRequestSerial/);
  assert.match(app, /requestId !== previewRequestSerial/);
  assert.match(app, /}, delay\);/);
  assert.match(app, /persisted: false/);
});

test('system admin resource audit remains reachable from the standalone shell', async () => {
  const sysadmin = await readFile(new URL('../js/sysadmin.js', import.meta.url), 'utf8');
  const sysadminHtml = await readFile(new URL('../sysadmin.html', import.meta.url), 'utf8');
  assert.ok(roleViews('SYSTEM_ADMIN').includes('admin-resources'));
  assert.match(sysadmin, /id: 'admin-resources'/);
  assert.match(sysadmin, /'admin-resources-view': AdminResourcesView/);
  assert.match(sysadmin, /resourcePlans: api\.listResourcePlans\(\{\}\)/);
  assert.match(sysadmin, /resourceRequests: api\.listResourceRequests\(\{\}\)/);
  assert.match(sysadmin, /api\.getWaterResourceProfile\(farmId\)/);
  assert.match(sysadminHtml, /id="tmpl-admin-resources"/);
  assert.match(sysadminHtml, /SYSTEM_ADMIN \/ READ ONLY/);
  assert.match(sysadminHtml, /农户需求与回执审计/);
});

test('farm admin names the water-only workspace irrigation scheduling without changing its route', async () => {
  const management = await readFile(new URL('../js/modules/admin-work-management.js', import.meta.url), 'utf8');
  const resource = await readFile(new URL('../js/modules/admin-resource-planning.js', import.meta.url), 'utf8');

  assert.match(management, />灌溉调度<\/button>/);
  assert.match(management, /activeTab === 'resources'/);
  assert.match(resource, /农务任务 \/ 灌溉调度/);
  assert.match(resource, /id="resource-title">灌溉调度工作台/);
  assert.doesNotMatch(management, />资源安排<\/button>/);
});

test('all three resource workspaces identify durable sync and disable live writes when persistence is unavailable', async () => {
  const adminResource = await readFile(new URL('../js/modules/admin-resource-planning.js', import.meta.url), 'utf8');
  const farmer = await readFile(new URL('../js/farmer.js', import.meta.url), 'utf8');
  const farmerHtml = await readFile(new URL('../farmer.html', import.meta.url), 'utf8');
  const sysadmin = await readFile(new URL('../js/sysadmin.js', import.meta.url), 'utf8');
  const sysadminHtml = await readFile(new URL('../sysadmin.html', import.meta.url), 'utf8');

  assert.match(adminResource, /持久化后端协同/);
  assert.match(adminResource, /数据库不可用 · 仅可查看/);
  assert.match(adminResource, /api\.getSystemStatus/);
  assert.match(adminResource, /collaborationReadOnly/);

  assert.match(farmer, /resource_persistence_status/);
  assert.match(farmer, /api\.getSystemStatus\(\)/);
  assert.match(farmer, /RESOURCE_PERSISTENCE_UNAVAILABLE/);
  assert.match(farmerHtml, /resource_collaboration_read_only/);
  assert.match(farmerHtml, /演示数据 · 不跨账号|resource_sync_label/);

  assert.match(sysadmin, /resourcePersistence/);
  assert.match(sysadmin, /持久化后端共享事实/);
  assert.match(sysadminHtml, /collaborationLabel/);
  assert.match(sysadminHtml, /SYSTEM_ADMIN \/ READ ONLY/);
});
