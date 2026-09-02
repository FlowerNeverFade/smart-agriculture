/**
 * Browser-scoped AgriLoop workspace presentation preferences.
 * These settings affect presentation and refresh behaviour only.
 */
export const USER_SETTINGS_KEY = 'agriloop-user-settings-v2';
export const LEGACY_USER_SETTINGS_KEY = 'agriloop-user-settings-v1';
export const SETTINGS_MIGRATION_KEY = 'agriloop-user-settings-v2-migrated';

export const DEFAULT_USER_SETTINGS = Object.freeze({
  theme: 'light', preset: 'codex', accent: 'green', customAccent: '',
  surfaceStyle: 'classic', surfaceStyleVersion: 7, fontFamily: 'system', density: 'comfortable', layout: 'standard',
  reducedMotion: false, autoRefresh: true, refreshInterval: 15, showDataOrigin: true,
  plotBackground: 'none'
});

export const PRESET_OPTIONS = Object.freeze([
  Object.freeze({ value: 'codex', label: 'Codex 中性', hint: '冷静、清晰、专注内容', icon: 'head_circuit' }),
  Object.freeze({ value: 'field', label: '田野绿', hint: '保留 AgriLoop 的自然气息', icon: 'eco' }),
  Object.freeze({ value: 'sky', label: '晴空蓝', hint: '轻盈明快，适合长时间查看', icon: 'rainy' }),
  Object.freeze({ value: 'harvest', label: '麦穗金', hint: '温暖、醒目但不过度', icon: 'light_mode' }),
  Object.freeze({ value: 'orchard', label: '果实紫', hint: '柔和、有层次的专业界面', icon: 'auto_awesome' })
]);

export const ACCENT_OPTIONS = Object.freeze([
  Object.freeze({ value: 'green', label: '田野绿', color: '#2f7d55', hover: '#22623f', background: '#e3f2e8' }),
  Object.freeze({ value: 'blue', label: '晴空蓝', color: '#2563a8', hover: '#1d4f87', background: '#e5effb' }),
  Object.freeze({ value: 'amber', label: '麦穗金', color: '#a96716', hover: '#82500f', background: '#fff2d9' }),
  Object.freeze({ value: 'purple', label: '果实紫', color: '#7657c4', hover: '#5d439f', background: '#eee8fb' })
]);

// Surface material is independent from the colour theme. Keep the choices
// deliberately distinct: a solid card surface or the newer liquid-glass
// treatment. The former soft-glass variant was too close to both and is
// normalized back to classic for existing browser profiles.
export const SURFACE_STYLE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'classic', label: '经典卡片', hint: '清爽白色卡片，边界明确' }),
  Object.freeze({ value: 'glass-latest', label: '液态玻璃', hint: '更强的景深与层次效果' }),
  Object.freeze({ value: 'minimal', label: '简约风格', hint: '极简无边框设计' })
]);

export const FONT_FAMILY_OPTIONS = Object.freeze([
  Object.freeze({ value: 'system', label: '系统默认', hint: '跟随当前设备的界面字体', stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', 'Microsoft YaHei', sans-serif" }),
  Object.freeze({ value: 'yahei', label: '微软雅黑', hint: 'Windows 中文界面更清晰', stack: "'Microsoft YaHei', 'Noto Sans SC', sans-serif" }),
  Object.freeze({ value: 'pingfang', label: '苹方 / 思源', hint: '轻盈、现代的中文字体', stack: "'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif" }),
  Object.freeze({ value: 'sans', label: '现代无衬线', hint: '紧凑的英文与数字排版', stack: "Inter, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif" }),
  Object.freeze({ value: 'serif', label: '人文衬线', hint: '更有编辑感的阅读体验', stack: "'Noto Serif SC', 'Songti SC', 'SimSun', serif" })
]);

const THEME_VALUES = new Set(['light', 'dark', 'system']);
const PRESET_VALUES = new Set(PRESET_OPTIONS.map(item => item.value));
const ACCENT_VALUES = new Set(ACCENT_OPTIONS.map(item => item.value));
const SURFACE_VALUES = new Set(SURFACE_STYLE_OPTIONS.map(item => item.value));
const FONT_VALUES = new Set(FONT_FAMILY_OPTIONS.map(item => item.value));
const DENSITY_VALUES = new Set(['comfortable', 'compact']);
const LAYOUT_VALUES = new Set(['standard', 'wide']);
const REFRESH_INTERVALS = new Set([5, 15, 30, 60]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const PRESET_PALETTES = Object.freeze({
  codex: { light: { base: '#f6f7f9', surface: '#ffffff', subtle: '#eef1f4', hover: '#e8ebef', border: '#dfe3e8', borderSubtle: '#e9edf1', text: '#1f2329', secondary: '#626a73', sidebar: '#fbfcfd' }, dark: { base: '#17191c', surface: '#202327', subtle: '#2a2e34', hover: '#323740', border: '#3d444d', borderSubtle: '#30353c', text: '#f1f3f5', secondary: '#aeb6bf', sidebar: '#1c1f23' } },
  field: { light: { base: '#f3f7f4', surface: '#ffffff', subtle: '#eaf2ed', hover: '#e3eee7', border: '#d5e3d9', borderSubtle: '#e5eee8', text: '#1d2921', secondary: '#607067', sidebar: '#f9fcfa' }, dark: { base: '#161d19', surface: '#202a24', subtle: '#29372e', hover: '#34443a', border: '#435349', borderSubtle: '#35443b', text: '#edf5ef', secondary: '#afc0b5', sidebar: '#1b241f' } },
  sky: { light: { base: '#f2f6fb', surface: '#ffffff', subtle: '#e9f0f8', hover: '#e1eaf5', border: '#d6e1ee', borderSubtle: '#e6edf5', text: '#1d2733', secondary: '#607080', sidebar: '#f9fbfe' }, dark: { base: '#161b22', surface: '#202832', subtle: '#293541', hover: '#334250', border: '#435262', borderSubtle: '#34414f', text: '#eef3f8', secondary: '#afbdca', sidebar: '#1b222b' } },
  harvest: { light: { base: '#faf7f1', surface: '#ffffff', subtle: '#f5eee2', hover: '#f0e7d8', border: '#e6dccb', borderSubtle: '#efe7da', text: '#2a261f', secondary: '#746b5d', sidebar: '#fdfbf8' }, dark: { base: '#201c17', surface: '#2b251e', subtle: '#3a3126', hover: '#483a2b', border: '#5a4b39', borderSubtle: '#493d30', text: '#f6f0e6', secondary: '#c0b3a1', sidebar: '#252019' } },
  orchard: { light: { base: '#f7f5fb', surface: '#ffffff', subtle: '#f0ecf8', hover: '#e9e3f4', border: '#dfd8ed', borderSubtle: '#ebe7f3', text: '#282330', secondary: '#746b7e', sidebar: '#fcfbfe' }, dark: { base: '#1b1821', surface: '#282331', subtle: '#352d40', hover: '#43384f', border: '#554965', borderSubtle: '#443a50', text: '#f4eff8', secondary: '#bdb1c8', sidebar: '#211d28' } }
});

function browserStorage(storage) {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (_error) {
    return null;
  }
}

function booleanValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function accountKey(account) {
  const raw = typeof account === 'string' ? account : account?.userId || account?.id || account?.username;
  return String(raw || 'demo-user').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 80) || 'demo-user';
}

export function userSettingsKey(account) { return `${USER_SETTINGS_KEY}:${accountKey(account)}`; }
export function isHexColor(value) { return typeof value === 'string' && HEX_COLOR.test(value.trim()); }
function hexToRgb(hex) { const value = hex.replace('#', ''); return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16)); }
function rgbToHex(rgb) { return `#${rgb.map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`; }
function mixColors(first, second, amount) { const a = hexToRgb(first); const b = hexToRgb(second); return rgbToHex(a.map((channel, index) => channel * (1 - amount) + b[index] * amount)); }
function relativeLuminance(hex) { return hexToRgb(hex).map(channel => channel / 255).map(channel => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0); }
function contrastRatio(first, second) { const a = relativeLuminance(first); const b = relativeLuminance(second); const [high, low] = a > b ? [a, b] : [b, a]; return (high + .05) / (low + .05); }
function safeAccent(input, theme, fallback) {
  const candidate = isHexColor(input) ? input.trim().toLowerCase() : '';
  if (!candidate) return fallback;
  const lightRatio = contrastRatio(candidate, '#ffffff');
  const darkRatio = contrastRatio(candidate, '#17191c');
  if (Math.max(lightRatio, darkRatio) < 3) return fallback;
  return { value: 'custom', label: '自定义', color: candidate, hover: theme === 'dark' ? mixColors(candidate, '#ffffff', .18) : mixColors(candidate, '#000000', .16), background: theme === 'dark' ? mixColors(candidate, '#17191c', .42) : mixColors(candidate, '#ffffff', .88), contrast: lightRatio >= darkRatio ? '#ffffff' : '#17191c' };
}

export function normalizeUserSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const interval = Number(source.refreshInterval);
  return {
    theme: THEME_VALUES.has(source.theme) ? source.theme : DEFAULT_USER_SETTINGS.theme,
    preset: PRESET_VALUES.has(source.preset) ? source.preset : DEFAULT_USER_SETTINGS.preset,
    accent: ACCENT_VALUES.has(source.accent) ? source.accent : DEFAULT_USER_SETTINGS.accent,
    customAccent: isHexColor(source.customAccent) ? source.customAccent.trim().toLowerCase() : DEFAULT_USER_SETTINGS.customAccent,
    surfaceStyle: SURFACE_VALUES.has(source.surfaceStyle) ? source.surfaceStyle : DEFAULT_USER_SETTINGS.surfaceStyle,
    surfaceStyleVersion: 7,
    fontFamily: FONT_VALUES.has(source.fontFamily) ? source.fontFamily : DEFAULT_USER_SETTINGS.fontFamily,
    density: DENSITY_VALUES.has(source.density) ? source.density : DEFAULT_USER_SETTINGS.density,
    layout: LAYOUT_VALUES.has(source.layout) ? source.layout : DEFAULT_USER_SETTINGS.layout,
    reducedMotion: booleanValue(source.reducedMotion, DEFAULT_USER_SETTINGS.reducedMotion),
    autoRefresh: booleanValue(source.autoRefresh, DEFAULT_USER_SETTINGS.autoRefresh),
    refreshInterval: REFRESH_INTERVALS.has(interval) ? interval : DEFAULT_USER_SETTINGS.refreshInterval,
    showDataOrigin: booleanValue(source.showDataOrigin, DEFAULT_USER_SETTINGS.showDataOrigin),
    // Plot imagery is no longer a user-facing preference. Always migrate old
    // `crop` selections to the solid workspace surface.
    plotBackground: DEFAULT_USER_SETTINGS.plotBackground
  };
}

export function readUserSettings(storage, account) {
  const store = browserStorage(storage); let parsed = {};
  if (store) {
    try {
      const key = userSettingsKey(account); const raw = store.getItem(key);
      if (raw) parsed = JSON.parse(raw) || {};
      if (!raw && !account && store.getItem(USER_SETTINGS_KEY)) parsed = JSON.parse(store.getItem(USER_SETTINGS_KEY)) || {};
      if (!raw && account && !store.getItem(SETTINGS_MIGRATION_KEY)) {
        const legacy = store.getItem(LEGACY_USER_SETTINGS_KEY);
        if (legacy) {
          parsed = JSON.parse(legacy) || {};
          const migrated = normalizeUserSettings(parsed);
          store.setItem(key, JSON.stringify(migrated));
          store.setItem(SETTINGS_MIGRATION_KEY, accountKey(account));
          parsed = migrated;
        }
      }
      if (!raw && !parsed.theme) { const legacyTheme = store.getItem('agriloop-theme'); if (THEME_VALUES.has(legacyTheme) && legacyTheme !== 'system') parsed.theme = legacyTheme; }
    } catch (error) { parsed = {}; }
  }
  return normalizeUserSettings(parsed);
}

export function saveUserSettings(settings, storage, account) {
  const normalized = normalizeUserSettings(settings); const store = browserStorage(storage);
  if (store) {
    try { store.setItem(userSettingsKey(account), JSON.stringify(normalized)); if (!account) store.setItem(LEGACY_USER_SETTINGS_KEY, JSON.stringify(normalized)); if (normalized.theme !== 'system') store.setItem('agriloop-theme', normalized.theme); } catch (error) { /* private browsing or quota exhaustion */ }
  }
  return normalized;
}

export function resolveTheme(theme, windowRef) {
  if (theme !== 'system') return theme === 'dark' ? 'dark' : 'light';
  const win = windowRef || (typeof window !== 'undefined' ? window : null);
  try {
    return win?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (_error) {
    return 'light';
  }
}

export function getFontFamily(fontFamily) {
  return FONT_FAMILY_OPTIONS.find(item => item.value === fontFamily)?.stack || FONT_FAMILY_OPTIONS[0].stack;
}

export function getAppearancePalette(settings, windowRef) {
  const normalized = normalizeUserSettings(settings); const theme = resolveTheme(normalized.theme, windowRef);
  const palette = PRESET_PALETTES[normalized.preset]?.[theme] || PRESET_PALETTES.codex[theme];
  const baseAccent = ACCENT_OPTIONS.find(item => item.value === normalized.accent) || ACCENT_OPTIONS[0];
  const presetColor = theme === 'dark' ? mixColors(baseAccent.color, '#ffffff', .44) : baseAccent.color;
  const presetAccent = { ...baseAccent, color: presetColor, hover: theme === 'dark' ? mixColors(presetColor, '#ffffff', .16) : baseAccent.hover, contrast: contrastRatio(presetColor, '#ffffff') >= contrastRatio(presetColor, '#17191c') ? '#ffffff' : '#17191c' };
  const accent = safeAccent(normalized.customAccent, theme, presetAccent);
  const primaryBg = accent.value === 'custom' ? accent.background : (theme === 'dark' ? mixColors(accent.color, palette.base, .42) : mixColors(accent.color, '#ffffff', .88));
  return { theme, ...palette, accent: { ...accent, background: primaryBg }, focus: mixColors(accent.color, theme === 'dark' ? '#ffffff' : '#000000', .2) };
}

export function applyUserSettings(settings, documentRef, windowRef) {
  const normalized = normalizeUserSettings(settings); const doc = documentRef || (typeof document !== 'undefined' ? document : null);
  if (!doc?.documentElement) return normalized;
  const root = doc.documentElement; const appearance = getAppearancePalette(normalized, windowRef); const theme = appearance.theme;
  root.dataset.theme = theme; root.dataset.userTheme = normalized.theme; root.dataset.accent = appearance.accent.value; root.dataset.workspacePreset = normalized.preset;
  root.dataset.surfaceStyle = normalized.surfaceStyle; root.dataset.fontFamily = normalized.fontFamily; root.dataset.density = normalized.density; root.dataset.layout = normalized.layout; root.dataset.reducedMotion = normalized.reducedMotion ? 'true' : 'false'; root.dataset.showDataOrigin = normalized.showDataOrigin ? 'true' : 'false'; root.dataset.plotBackground = normalized.plotBackground; root.lang = 'zh-CN'; root.style.colorScheme = theme;
  const variables = {
    '--workspace-bg-base': appearance.base, '--workspace-bg-surface': appearance.surface, '--workspace-bg-subtle': appearance.subtle, '--workspace-bg-hover': appearance.hover,
    '--workspace-border': appearance.border, '--workspace-border-subtle': appearance.borderSubtle, '--workspace-text': appearance.text, '--workspace-text-secondary': appearance.secondary,
    '--workspace-sidebar': appearance.sidebar, '--workspace-primary': appearance.accent.color, '--workspace-primary-hover': appearance.accent.hover, '--workspace-primary-bg': appearance.accent.background,
    '--workspace-primary-contrast': appearance.accent.contrast || '#ffffff', '--workspace-focus': appearance.focus, '--workspace-font-family': getFontFamily(normalized.fontFamily), '--g-font-family': getFontFamily(normalized.fontFamily), '--agriloop-accent': appearance.accent.color, '--agriloop-accent-hover': appearance.accent.hover, '--agriloop-accent-bg': appearance.accent.background
  };
  Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
  if (typeof root.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') root.dispatchEvent(new CustomEvent('agriloop:appearance-changed', { detail: normalized }));
  return normalized;
}

export function initUserSettings(documentRef, windowRef, storage) {
  const settings = readUserSettings(storage);
  applyUserSettings(settings, documentRef, windowRef);
  return settings;
}
