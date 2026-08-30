import test from 'node:test';
import assert from 'node:assert/strict';

const { DEFAULT_USER_SETTINGS, applyUserSettings, normalizeUserSettings, readUserSettings, saveUserSettings } = await import('../js/user-settings.js?settings-test');

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
