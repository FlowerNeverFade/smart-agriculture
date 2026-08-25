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
