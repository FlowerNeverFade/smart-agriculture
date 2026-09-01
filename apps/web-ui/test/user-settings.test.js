import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { DEFAULT_USER_SETTINGS, SURFACE_STYLE_OPTIONS, applyUserSettings, getAppearancePalette, getFontFamily, normalizeUserSettings, readUserSettings, saveUserSettings, userSettingsKey } = await import('../js/user-settings.js?settings-test');

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

test('工作台设置应用主题、布局、密度和纯色地块数据属性', () => {
  const root = { dataset: {}, style: { setProperty() {}, colorScheme: '' } };
  const normalized = applyUserSettings({ ...DEFAULT_USER_SETTINGS, theme: 'dark', layout: 'wide', density: 'compact', fontFamily: 'yahei', showDataOrigin: false, plotBackground: 'crop' }, { documentElement: root });
  assert.equal(normalized.theme, 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.dataset.layout, 'wide');
  assert.equal(root.dataset.density, 'compact');
  assert.equal(Object.hasOwn(normalized, 'language'), false);
  assert.equal(root.dataset.language, undefined);
  assert.equal(root.lang, 'zh-CN');
  assert.equal(root.dataset.fontFamily, 'yahei');
  assert.equal(root.dataset.showDataOrigin, 'false');
  assert.equal(normalized.plotBackground, 'none');
  assert.equal(root.dataset.plotBackground, 'none');
  assert.match(getFontFamily('yahei'), /Microsoft YaHei/);
});

test('旧柔和玻璃与作物背景设置自动迁移到清晰纯色外观', () => {
  assert.deepEqual(SURFACE_STYLE_OPTIONS.map((item) => item.value), ['classic', 'glass-latest']);
  const normalized = normalizeUserSettings({ surfaceStyle: 'glass-soft', plotBackground: 'crop' });
  assert.equal(normalized.surfaceStyle, 'classic');
  assert.equal(normalized.plotBackground, 'none');
  assert.equal(normalized.surfaceStyleVersion, 7);
});

test('三个工作台隐藏地块背景选项且外观切换静默生效', () => {
  const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const farmerSource = readFileSync(new URL('../js/farmer.js', import.meta.url), 'utf8');
  const sysadminSource = readFileSync(new URL('../js/sysadmin.js', import.meta.url), 'utf8');
  const appSettings = appSource.slice(appSource.indexOf('const SettingsView ='), appSource.indexOf('const AdminSettingsView ='));
  const farmerSettings = farmerSource.slice(farmerSource.indexOf('const update_user_setting ='), farmerSource.indexOf('const toggle_theme ='));
  const sysadminSettings = sysadminSource.slice(sysadminSource.indexOf('const SettingsView ='), sysadminSource.indexOf('const AdminSettingsView ='));
  assert.doesNotMatch(appSettings, /toast\s*\(/);
  assert.doesNotMatch(farmerSettings, /show_toast\s*\(/);
  assert.doesNotMatch(sysadminSettings, /toast\s*\(/);
  for (const page of ['../index.html', '../farmer.html', '../sysadmin.html']) {
    const html = readFileSync(new URL(page, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /settings-plot-background-options|plot_background_options|plotBackgroundLabel/);
  }
});

test('三种角色入口都加载统一工作台主题桥接', () => {
  const sharedCss = readFileSync(new URL('../css/modules/workspace-settings-shared.css', import.meta.url), 'utf8');
  assert.match(sharedCss, /html\[data-workspace-preset\] :is\(#app, #farmer_app\)/);
  assert.match(sharedCss, /--g-bg-base:\s*var\(--workspace-bg-base\)/);
  assert.match(sharedCss, /--g-primary:\s*var\(--workspace-primary\)/);
  assert.match(sharedCss, /data-surface-style="glass-latest"/);
  for (const page of ['../index.html', '../farmer.html', '../sysadmin.html']) {
    const html = readFileSync(new URL(page, import.meta.url), 'utf8');
    assert.match(html, /workspace-settings-shared\.css\?v=20260901-v5910-main-merge-v2/);
  }
});

test('三种角色复用同一工作台设置视图和同一配置控制器', () => {
  const shared = readFileSync(new URL('../js/modules/workspace-settings.js', import.meta.url), 'utf8');
  const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const farmerSource = readFileSync(new URL('../js/farmer.js', import.meta.url), 'utf8');
  const sysadminSource = readFileSync(new URL('../js/sysadmin.js', import.meta.url), 'utf8');
  const farmerHtml = readFileSync(new URL('../farmer.html', import.meta.url), 'utf8');
  assert.match(shared, /export function createWorkspaceSettingsController/);
  assert.match(shared, /export function createWorkspaceSettingsView/);
  assert.match(shared, /const WORKSPACE_SETTINGS_TEMPLATE/);
  for (const source of [appSource, farmerSource, sysadminSource]) {
    assert.match(source, /createWorkspaceSettingsView/);
    assert.doesNotMatch(source, /template:\s*['"]#tmpl-settings['"]/);
  }
  assert.match(farmerHtml, /<workspace-settings-view/);
  assert.match(farmerHtml, /:user-settings="user_settings"/);
  assert.doesNotMatch(farmerHtml, /farmer-settings-(grid|choice|preset)/);
  assert.match(shared, /主题与颜色/);
  assert.match(shared, /卡片风格/);
  assert.match(shared, /刷新与提示/);
});

test('工作台设置按账号隔离，并支持主题预设与安全自选色', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  const alice = { userId: 'User-A', username: 'Alice' };
  const bob = { userId: 'User-B', username: 'Bob' };
  saveUserSettings({ ...DEFAULT_USER_SETTINGS, preset: 'sky', customAccent: '#abcdef', fontFamily: 'sans' }, storage, alice);
  assert.equal(readUserSettings(storage, alice).preset, 'sky');
  assert.equal(readUserSettings(storage, alice).customAccent, '#abcdef');
  assert.equal(Object.hasOwn(readUserSettings(storage, alice), 'language'), false);
  assert.equal(readUserSettings(storage, alice).fontFamily, 'sans');
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
