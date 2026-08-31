import test from 'node:test';
import assert from 'node:assert/strict';

const { DEFAULT_USER_SETTINGS, applyUserSettings, getAppearancePalette, normalizeUserSettings, readUserSettings, saveUserSettings, userSettingsKey } = await import('../js/user-settings.js?settings-test');

test('工作台设置按白名单归一化并保存到浏览器本地', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  const normalized = normalizeUserSettings({ theme: 'dark', accent: 'purple', density: 'compact', layout: 'wide', refreshInterval: 60, unknown: 'ignored' });
  assert.equal(normalized.theme, 'dark');
  assert.equal(normalized.accent, 'purple');
  assert.equal(normalized.density, 'compact');
  assert.equal(normalized.layout, 'wide');
  assert.equal(normalized.refreshInterval, 60);
  saveUserSettings(normalized, storage);
  assert.deepEqual(readUserSettings(storage), normalized);
});

test('工作台设置应用主题、布局、密度和来源标记数据属性', () => {
  const root = { dataset: {}, style: { setProperty() {}, colorScheme: '' } };
  const normalized = applyUserSettings({ ...DEFAULT_USER_SETTINGS, theme: 'dark', layout: 'wide', density: 'compact', showDataOrigin: false }, { documentElement: root });
  assert.equal(normalized.theme, 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.dataset.layout, 'wide');
  assert.equal(root.dataset.density, 'compact');
  assert.equal(root.dataset.showDataOrigin, 'false');
});

test('工作台设置按账号隔离，并支持主题预设与安全自选色', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  const alice = { userId: 'User-A', username: 'Alice' };
  const bob = { userId: 'User-B', username: 'Bob' };
  saveUserSettings({ ...DEFAULT_USER_SETTINGS, preset: 'sky', customAccent: '#abcdef' }, storage, alice);
  assert.equal(readUserSettings(storage, alice).preset, 'sky');
  assert.equal(readUserSettings(storage, alice).customAccent, '#abcdef');
  assert.equal(readUserSettings(storage, bob).preset, DEFAULT_USER_SETTINGS.preset);
  assert.equal(userSettingsKey(alice), 'agriloop-user-settings-v2:user-a');
  assert.equal(normalizeUserSettings({ preset: 'missing', customAccent: 'red' }).preset, 'codex');
  const palette = getAppearancePalette({ ...DEFAULT_USER_SETTINGS, preset: 'orchard', customAccent: '#7657c4' });
  assert.equal(palette.theme, 'light');
  assert.equal(palette.accent.color, '#7657c4');
  assert.ok(palette.accent.background.startsWith('#'));
});

test('旧版浏览器设置只迁移给首次账号并可在刷新后恢复', () => {
  const data = new Map([['agriloop-user-settings-v1', JSON.stringify({ theme: 'dark', preset: 'orchard' })]]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  const first = { userId: 'first-admin', username: 'first' };
  const second = { userId: 'second-admin', username: 'second' };
  assert.equal(readUserSettings(storage, first).theme, 'dark');
  assert.equal(readUserSettings(storage, first).preset, 'orchard');
  assert.equal(readUserSettings(storage, second).theme, DEFAULT_USER_SETTINGS.theme);
});
