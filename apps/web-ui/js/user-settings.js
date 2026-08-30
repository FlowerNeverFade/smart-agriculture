/** Browser-scoped workspace presentation preferences. */
export const USER_SETTINGS_KEY = 'agriloop-user-settings-v1';

export const DEFAULT_USER_SETTINGS = Object.freeze({
  theme: 'light',
  accent: 'green',
  surfaceStyle: 'classic',
  surfaceStyleVersion: 4,
  density: 'comfortable',
  layout: 'standard',
  reducedMotion: false,
  autoRefresh: true,
  refreshInterval: 15,
  showDataOrigin: true
});

export const ACCENT_OPTIONS = Object.freeze([
  Object.freeze({ value: 'green', label: '田野绿', color: '#2f7d55', hover: '#22623f', background: '#e3f2e8' }),
  Object.freeze({ value: 'blue', label: '晴空蓝', color: '#2563a8', hover: '#1d4f87', background: '#e5effb' }),
  Object.freeze({ value: 'amber', label: '麦穗金', color: '#a96716', hover: '#82500f', background: '#fff2d9' }),
  Object.freeze({ value: 'purple', label: '果实紫', color: '#7657c4', hover: '#5d439f', background: '#eee8fb' })
]);

export const SURFACE_STYLE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'classic', label: '经典卡片', hint: '清爽白色玻璃卡片' }),
  Object.freeze({ value: 'glass-soft', label: '柔和玻璃', hint: '轻透明、低反光，信息更克制' }),
  Object.freeze({ value: 'glass-latest', label: '液态玻璃', hint: '更强的景深与层次效果' })
]);

const THEME_VALUES = new Set(['light', 'dark', 'system']);
const ACCENT_VALUES = new Set(ACCENT_OPTIONS.map(item => item.value));
const SURFACE_VALUES = new Set(SURFACE_STYLE_OPTIONS.map(item => item.value));
const DENSITY_VALUES = new Set(['comfortable', 'compact']);
const LAYOUT_VALUES = new Set(['standard', 'wide']);
const REFRESH_INTERVALS = new Set([5, 15, 30, 60]);

function browserStorage(storage) {
  if (storage) return storage;
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (error) { return null; }
}

export function normalizeUserSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const interval = Number(source.refreshInterval);
  return {
    theme: THEME_VALUES.has(source.theme) ? source.theme : DEFAULT_USER_SETTINGS.theme,
    accent: ACCENT_VALUES.has(source.accent) ? source.accent : DEFAULT_USER_SETTINGS.accent,
    surfaceStyle: SURFACE_VALUES.has(source.surfaceStyle) ? source.surfaceStyle : DEFAULT_USER_SETTINGS.surfaceStyle,
    surfaceStyleVersion: 4,
    density: DENSITY_VALUES.has(source.density) ? source.density : DEFAULT_USER_SETTINGS.density,
    layout: LAYOUT_VALUES.has(source.layout) ? source.layout : DEFAULT_USER_SETTINGS.layout,
    reducedMotion: typeof source.reducedMotion === 'boolean' ? source.reducedMotion : DEFAULT_USER_SETTINGS.reducedMotion,
    autoRefresh: typeof source.autoRefresh === 'boolean' ? source.autoRefresh : DEFAULT_USER_SETTINGS.autoRefresh,
    refreshInterval: REFRESH_INTERVALS.has(interval) ? interval : DEFAULT_USER_SETTINGS.refreshInterval,
    showDataOrigin: typeof source.showDataOrigin === 'boolean' ? source.showDataOrigin : DEFAULT_USER_SETTINGS.showDataOrigin
  };
}

export function readUserSettings(storage) {
  const store = browserStorage(storage);
  let parsed = {};
  if (store) {
    try {
      const raw = store.getItem(USER_SETTINGS_KEY);
      if (raw) parsed = JSON.parse(raw) || {};
      if (!raw) {
        const legacyTheme = store.getItem('agriloop-theme');
        if (THEME_VALUES.has(legacyTheme) && legacyTheme !== 'system') parsed.theme = legacyTheme;
      }
    } catch (error) { parsed = {}; }
  }
  return normalizeUserSettings(parsed);
}

export function saveUserSettings(settings, storage) {
  const normalized = normalizeUserSettings(settings);
  const store = browserStorage(storage);
  if (store) {
    try {
      store.setItem(USER_SETTINGS_KEY, JSON.stringify(normalized));
      if (normalized.theme !== 'system') store.setItem('agriloop-theme', normalized.theme);
    } catch (error) { /* private browsing or quota exhaustion */ }
  }
  return normalized;
}

export function resolveTheme(theme, windowRef) {
  if (theme !== 'system') return theme === 'dark' ? 'dark' : 'light';
  const win = windowRef || (typeof window !== 'undefined' ? window : null);
  try { return win?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (error) { return 'light'; }
}

export function applyUserSettings(settings, documentRef, windowRef) {
  const normalized = normalizeUserSettings(settings);
  const doc = documentRef || (typeof document !== 'undefined' ? document : null);
  if (!doc?.documentElement) return normalized;
  const root = doc.documentElement;
  const theme = resolveTheme(normalized.theme, windowRef);
  const accent = ACCENT_OPTIONS.find(item => item.value === normalized.accent) || ACCENT_OPTIONS[0];
  root.dataset.theme = theme;
  root.dataset.userTheme = normalized.theme;
  root.dataset.accent = normalized.accent;
  root.dataset.surfaceStyle = normalized.surfaceStyle;
  root.dataset.density = normalized.density;
  root.dataset.layout = normalized.layout;
  root.dataset.reducedMotion = normalized.reducedMotion ? 'true' : 'false';
  root.dataset.showDataOrigin = normalized.showDataOrigin ? 'true' : 'false';
  root.style.colorScheme = theme;
  root.style.setProperty('--agriloop-accent', accent.color);
  root.style.setProperty('--agriloop-accent-hover', accent.hover);
  root.style.setProperty('--agriloop-accent-bg', accent.background);
  return normalized;
}
