import test from 'node:test';
import assert from 'node:assert/strict';

// api.js is browser code.  These tiny shims let the contract test exercise the
// session boundary without starting a browser or a real HTTP server.
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};
globalThis.fetch = async () => {
  throw new Error('backend offline');
};

const { ApiService } = await import('../js/api.js');

test('formal sessions never fall back to demo records when backend is offline', async () => {
  const service = new ApiService();
  service.sessionMode = 'live';
  service.token = 'formal-test-token';
  service.isLive = false;

  await assert.rejects(service.getFarms(), (error) => error.code === 'NETWORK_ERROR');
  await assert.rejects(service.getWorkOrders(), (error) => error.code === 'NETWORK_ERROR');
  await assert.rejects(service.agentChat('查看当前地块状态'), (error) => error.code === 'NETWORK_ERROR');
  await assert.rejects(service.getPlotTelemetryAll('plot-a01', 5), (error) => error.code === 'NETWORK_ERROR');
});

test('demo sessions remain explicitly local and switching sessions clears live health', async () => {
  const service = new ApiService();
  service.isLive = true;
  service.saveSession({ mode: 'demo', user: { username: 'farmer', role: 'FARMER' } });
  assert.equal(service.isLive, false);
  const farms = await service.getFarms();
  assert.ok(farms.length > 0);
  assert.ok(farms.every((farm) => farm.sourceMode === 'SIMULATED'));
});

test('formal reads recover after a transient health-probe failure', async () => {
  const service = new ApiService();
  service.sessionMode = 'live';
  service.token = 'formal-test-token';
  service.isLive = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/api\/v1\/farm-members\?farmId=farm-demo$/);
    return new Response(JSON.stringify({ data: [{ userId: 'user-farmer', username: 'farmer', role: 'FARMER', status: 'ACTIVE', farmIds: ['farm-demo'], plotIds: ['plot-a01'] }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const members = await service.getFarmMembers({ farmId: 'farm-demo' });
    assert.equal(members[0].userId, 'user-farmer');
    assert.equal(service.isLive, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('demo device binding and farmer membership mutations remain visible on reread', async () => {
  const service = new ApiService();
  service.sessionMode = 'demo';

  const device = await service.registerDevice({ deviceId: 'sensor-contract-1', farmId: 'farm-demo', name: '合同测试传感器', type: 'ENVIRONMENTAL_SENSOR' });
  assert.equal(device.bindingState, 'UNBOUND');
  const bound = await service.bindDevice(device.deviceId, 'plot-a01');
  assert.equal(bound.plotId, 'plot-a01');
  assert.equal((await service.getDevices({ farmId: 'farm-demo' })).find(item => item.deviceId === device.deviceId)?.bindingState, 'BOUND');

  const member = await service.createFarmMember({ farmId: 'farm-demo', username: 'worker.qa', password: 'Field2026!', plotIds: ['plot-a01'] });
  assert.equal((await service.getFarmMembers({ farmId: 'farm-demo' })).some(item => item.userId === member.userId), true);
  const updated = await service.updateFarmMemberScope(member.userId, { farmId: 'farm-demo', plotIds: ['plot-a02'] });
  assert.deepEqual(updated.plotIds, ['plot-a02']);
  await service.deleteFarmMember(member.userId, { farmId: 'farm-demo' });
  assert.equal((await service.getFarmMembers({ farmId: 'farm-demo' })).some(item => item.userId === member.userId), false);
});

test('escalated demo alerts can return to acknowledged through the frozen ack contract', async () => {
  const service = new ApiService();
  service.sessionMode = 'demo';

  const escalated = await service.escalateAlert('alert-contract-1');
  assert.equal(escalated.status, 'ESCALATED');
  const downgraded = await service.ackAlert('alert-contract-1');
  assert.equal(downgraded.status, 'ACKED');
});
