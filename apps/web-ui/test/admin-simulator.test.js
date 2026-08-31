import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const storage = new Map();
globalThis.localStorage ||= {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};

const { ApiService, DEFAULT_SIMULATION_TIME_SCALE } = await import('../js/api.js');

test('system admin simulator page exposes sampling interval and time scale controls', async () => {
  const [html, appSource] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/app.js', import.meta.url), 'utf8')
  ]);
  const template = html.slice(html.indexOf('id="tmpl-admin-simulator"'), html.indexOf('id="tmpl-admin-rules"'));
  assert.match(template, /采样间隔/);
  assert.match(template, /时间流速/);
  assert.match(template, /每隔多少墙上秒产生一批遥测/);
  assert.match(template, /默认 144：10 分钟 ≈ 1 个模拟日/);
  assert.match(template, /min="5"/);
  assert.match(template, /max="60"/);
  assert.match(template, /max="288"/);
  assert.match(appSource, /saveSimulatorSettings/);
  assert.match(appSource, /updateSimulatorSettings/);
});

test('demo simulator settings stay local and live settings call the in-process API', async () => {
  const demo = new ApiService();
  demo.saveSession({ mode: 'demo', user: { username: 'sysadmin', role: 'SYSTEM_ADMIN' } });
  const local = await demo.updateSimulatorSettings({ sampleIntervalSeconds: 8, timeScale: 120 });
  assert.equal(local.sampleIntervalSeconds, 8);
  assert.equal(local.timeScale, 120);
  assert.equal(local.pid, 'demo');
  const status = await demo.getSimulatorStatus();
  assert.equal(status.sampleIntervalSeconds, 8);
  assert.equal(status.timeScale, 120);

  const live = new ApiService();
  live.sessionMode = 'live';
  live.token = 'formal-test-token';
  live.isLive = true;
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options = {}) => {
    captured = { url: String(url), method: options.method, body: options.body };
    return new Response(JSON.stringify({
      data: { available: true, status: 'RUNNING', pid: 'api', sampleIntervalSeconds: 15, timeScale: 144 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const saved = await live.updateSimulatorSettings({ sampleIntervalSeconds: 15, timeScale: DEFAULT_SIMULATION_TIME_SCALE });
    assert.match(captured.url, /\/api\/v1\/simulator\/settings$/);
    assert.equal(captured.method, 'PUT');
    assert.equal(JSON.parse(captured.body).sampleIntervalSeconds, 15);
    assert.equal(JSON.parse(captured.body).timeScale, 144);
    assert.equal(saved.pid, 'api');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
