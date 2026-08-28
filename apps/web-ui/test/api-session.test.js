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

test('SSE reconnects after a dropped stream and stops cleanly', async () => {
  const service = new ApiService();
  service.sessionMode = 'live';
  service.token = 'formal-test-token';
  service.isLive = true;
  const originalFetch = globalThis.fetch;
  const events = [];
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'event: telemetry.received\n' +
          `data: {"eventId":"sse-${calls}","eventType":"telemetry.received"}\n\n`
        ));
        controller.close();
      }
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    const stop = await service.subscribeEvents((event) => events.push(event));
    await new Promise((resolve) => setTimeout(resolve, 1250));
    stop();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(calls >= 2, `expected a reconnect, got ${calls} request(s)`);
    assert.ok(events.some((event) => event.type === 'telemetry.received' && event.data.eventType === 'telemetry.received'));
  } finally {
    service.clearSession();
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
  const unbound = await service.unbindDevice(device.deviceId);
  assert.equal(unbound.plotId, null);
  assert.equal((await service.getDevices({ farmId: 'farm-demo' })).find(item => item.deviceId === device.deviceId)?.bindingState, 'UNBOUND');

  const member = await service.createFarmMember({ farmId: 'farm-demo', username: 'worker.qa', password: 'Field2026!', plotIds: ['plot-a01'] });
  assert.equal((await service.getFarmMembers({ farmId: 'farm-demo' })).some(item => item.userId === member.userId), true);
  const updated = await service.updateFarmMemberScope(member.userId, { farmId: 'farm-demo', plotIds: ['plot-a02'] });
  assert.deepEqual(updated.plotIds, ['plot-a02']);
  await service.deleteFarmMember(member.userId, { farmId: 'farm-demo' });
  assert.equal((await service.getFarmMembers({ farmId: 'farm-demo' })).some(item => item.userId === member.userId), false);
});

test('demo device control switches actual status immediately and remains idempotent', async () => {
  const service = new ApiService();
  service.sessionMode = 'demo';
  const device = (await service.getDevices({ farmId: 'farm-demo' })).find(item => item.plotId);
  assert.ok(device);
  const target = String(device.status).toUpperCase() === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
  const key = `device-control-test-${device.deviceId}-${Date.now()}`;
  const first = await service.controlDevice(device.deviceId, { targetStatus: target, idempotencyKey: key });
  assert.equal(first.commandStatus, 'SUCCEEDED');
  assert.equal(first.device.status, target);
  assert.equal((await service.getDevices({ farmId: 'farm-demo' })).find(item => item.deviceId === device.deviceId)?.status, target);
  const restored = await service.controlDevice(device.deviceId, { targetStatus: device.status, idempotencyKey: `${key}-restore` });
  assert.equal(restored.device.status, device.status);
  const unbound = (await service.getDevices({ farmId: 'farm-demo' })).find(item => !item.plotId);
  if (unbound) await assert.rejects(service.controlDevice(unbound.deviceId, { targetStatus: 'OFFLINE', idempotencyKey: `${key}-unbound` }), /设备尚未绑定/);
});

test('demo alert closure remains visible after refreshing alerts', async () => {
  const service = new ApiService();
  service.sessionMode = 'demo';
  const alert = (await service.getAlerts({ farmId: 'farm-demo' })).find(item => item.status !== 'CLOSED');
  assert.ok(alert);

  await service.closeAlert(alert.alertId || alert.id);
  const refreshed = await service.getAlerts({ farmId: 'farm-demo' });
  assert.equal(refreshed.find(item => (item.alertId || item.id) === (alert.alertId || alert.id))?.status, 'CLOSED');
});

test('demo alert actions and alert-sourced task creation preserve their frozen contracts', async () => {
  const service = new ApiService();
  service.sessionMode = 'demo';
  service.user = { userId: 'user-admin', username: 'admin', role: 'FARM_ADMIN' };

  const acknowledged = await service.ackAlert('alert-contract-active');
  assert.equal(acknowledged.status, 'ACKED');
  const escalated = await service.escalateAlert('alert-contract-1');
  assert.equal(escalated.status, 'ESCALATED');
  const downgraded = await service.ackAlert('alert-contract-1');
  assert.equal(downgraded.status, 'ACKED');
  const closed = await service.closeAlert('alert-contract-1');
  assert.equal(closed.status, 'CLOSED');

  const task = await service.createWorkOrder({
    plotId: 'plot-a01',
    title: '处理：合同测试告警',
    reason: '验证告警转任务合同',
    sourceType: 'ALERT',
    sourceRef: 'alert-contract-1',
    actionType: 'FIELD_OPERATION',
    priority: 'HIGH',
    status: 'OPEN'
  });
  assert.equal(task.sourceType, 'ALERT');
  assert.equal(task.sourceRef, 'alert-contract-1');
  assert.equal((await service.getWorkOrders({ farmId: 'farm-demo' })).some(item => item.workOrderId === task.workOrderId), true);
});

test('new demo devices persist source metadata and plot binding can transfer as a set', async () => {
  const service = new ApiService();
  service.sessionMode = 'demo';
  service.user = { userId: 'user-admin', username: 'admin', role: 'FARM_ADMIN', farmIds: ['farm-demo'], plotIds: ['*'] };
  const first = await service.registerDevice({ deviceId: 'device-source-test', name: '来源测试设备', type: 'ENVIRONMENTAL_SENSOR', farmId: 'farm-demo' });
  assert.equal(first.sourceMode, 'SIMULATION');
  assert.equal(first.dataOrigin, 'SIMULATOR');
  const bound = await service.setPlotDevices('plot-a01', [first.deviceId]);
  assert.deepEqual(bound.deviceIds, [first.deviceId]);
  assert.equal((await service.getDevices({ farmId: 'farm-demo' })).find(item => item.deviceId === first.deviceId).plotId, 'plot-a01');
  const moved = await service.setPlotDevices('plot-a02', [first.deviceId]);
  assert.deepEqual(moved.movedDeviceIds, [first.deviceId]);
  assert.equal((await service.getDevices({ farmId: 'farm-demo' })).find(item => item.deviceId === first.deviceId).plotId, 'plot-a02');
});

test('demo Agent mutation uses preview then explicit confirmation', async () => {
  const service = new ApiService();
  service.sessionMode = 'demo';
  service.user = { userId: 'user-admin', username: 'admin', role: 'FARM_ADMIN', farmIds: ['farm-demo'], plotIds: ['*'] };
  const response = await service.agentChat('请在 plot-a01 创建任务：检查滴灌管路', 'plot-a01');
  assert.equal(response.actionProposal.status, 'AWAITING_CONFIRMATION');
  const result = await service.confirmAgentAction(response.actionProposal.actionId);
  assert.equal(result.status, 'SUCCEEDED');
  const repeated = await service.confirmAgentAction(response.actionProposal.actionId);
  assert.equal(repeated.status, 'SUCCEEDED');
});
