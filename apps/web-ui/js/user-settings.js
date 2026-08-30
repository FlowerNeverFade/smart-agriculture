/**
 * Browser-scoped AgriLoop workspace preferences.
 *
 * These settings intentionally stay on the current browser.  They change
 * presentation and refresh behaviour only; they never change farm data,
 * simulator strategies, rules or device state on the server.
 */

export const USER_SETTINGS_KEY = 'agriloop-user-settings-v1';

export const DEFAULT_USER_SETTINGS = Object.freeze({
  // Keep the familiar white workspace as the first-run experience.  Users
  // can still opt into the dark or system theme from the settings page.
  theme: 'light',
  accent: 'green',
  surfaceStyle: 'glass-latest',
  surfaceStyleVersion: 2,
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

// Surface material is independent from the colour theme.  This lets a user
// keep a black (or white) canvas while choosing the older 4e9326a card
// treatment, a restrained transitional glass treatment, or the latest main
// liquid-glass treatment.
export const SURFACE_STYLE_OPTIONS = Object.freeze([
  Object.freeze({
    value: 'classic',
    label: '经典卡片',
    hint: '接近 main 4e9326a：白底、清爽边框'
  }),
  Object.freeze({
    value: 'glass-soft',
    label: '柔和玻璃',
    hint: '轻透明、低反光，信息更克制'
  }),
  Object.freeze({
    value: 'glass-latest',
    label: '当前 main 玻璃',
    hint: '最新液态玻璃层级与景深'
  })
]);

const ACCENT_VALUES = new Set(ACCENT_OPTIONS.map((item) => item.value));
const SURFACE_STYLE_VALUES = new Set(SURFACE_STYLE_OPTIONS.map((item) => item.value));
const SURFACE_STYLE_VERSION = 2;
const THEME_VALUES = new Set(['light', 'dark', 'system']);
const DENSITY_VALUES = new Set(['comfortable', 'compact']);
const LAYOUT_VALUES = new Set(['standard', 'wide']);
const REFRESH_INTERVALS = new Set([5, 15, 30, 60]);

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

export function normalizeUserSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const interval = Number(source.refreshInterval);
  return {
    theme: THEME_VALUES.has(source.theme) ? source.theme : DEFAULT_USER_SETTINGS.theme,
    accent: ACCENT_VALUES.has(source.accent) ? source.accent : DEFAULT_USER_SETTINGS.accent,
    surfaceStyle: SURFACE_STYLE_VALUES.has(source.surfaceStyle) ? source.surfaceStyle : DEFAULT_USER_SETTINGS.surfaceStyle,
    surfaceStyleVersion: SURFACE_STYLE_VERSION,
    density: DENSITY_VALUES.has(source.density) ? source.density : DEFAULT_USER_SETTINGS.density,
    layout: LAYOUT_VALUES.has(source.layout) ? source.layout : DEFAULT_USER_SETTINGS.layout,
    reducedMotion: booleanValue(source.reducedMotion, DEFAULT_USER_SETTINGS.reducedMotion),
    autoRefresh: booleanValue(source.autoRefresh, DEFAULT_USER_SETTINGS.autoRefresh),
    refreshInterval: REFRESH_INTERVALS.has(interval) ? interval : DEFAULT_USER_SETTINGS.refreshInterval,
    showDataOrigin: booleanValue(source.showDataOrigin, DEFAULT_USER_SETTINGS.showDataOrigin)
  };
}

export function readUserSettings(storage) {
  const store = browserStorage(storage);
  let parsed = {};
  if (store) {
    try {
      const raw = store.getItem(USER_SETTINGS_KEY);
      if (raw) parsed = JSON.parse(raw) || {};
      // Migrate the old theme-only preference without disturbing other
      // defaults when the new preference record does not exist yet.
      if (!raw) {
        const oldTheme = store.getItem('agriloop-theme');
        if (THEME_VALUES.has(oldTheme)) parsed.theme = oldTheme === 'system' ? DEFAULT_USER_SETTINGS.theme : oldTheme;
      } else if (Number(parsed.surfaceStyleVersion) < SURFACE_STYLE_VERSION) {
        // The first settings release used the classic card material as its
        // default.  Upgrade that implicit choice to the current main liquid
        // glass material; users can still select classic again explicitly.
        if (!Object.prototype.hasOwnProperty.call(parsed, 'surfaceStyle') || parsed.surfaceStyle === 'classic') {
          parsed.surfaceStyle = DEFAULT_USER_SETTINGS.surfaceStyle;
        }
        if (parsed.theme === 'system') parsed.theme = DEFAULT_USER_SETTINGS.theme;
        parsed.surfaceStyleVersion = SURFACE_STYLE_VERSION;
      }
    } catch (_error) {
      parsed = {};
    }
  }
  return normalizeUserSettings(parsed);
}

export function saveUserSettings(settings, storage) {
  const normalized = normalizeUserSettings(settings);
  const store = browserStorage(storage);
  if (store) {
    try {
      store.setItem(USER_SETTINGS_KEY, JSON.stringify(normalized));
      // Keep legacy consumers (and older cached tabs) in sync.
      if (normalized.theme !== 'system') store.setItem('agriloop-theme', normalized.theme);
    } catch (_error) {
      // Private browsing/storage quota errors should not break the workspace.
    }
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

export function applyUserSettings(settings, documentRef, windowRef) {
  const normalized = normalizeUserSettings(settings);
  const doc = documentRef || (typeof document !== 'undefined' ? document : null);
  if (!doc?.documentElement) return normalized;
  const root = doc.documentElement;
  const theme = resolveTheme(normalized.theme, windowRef);
  const accent = ACCENT_OPTIONS.find((item) => item.value === normalized.accent) || ACCENT_OPTIONS[0];
  root.dataset.theme = theme;
  root.dataset.userTheme = normalized.theme;
  root.dataset.accent = normalized.accent;
  root.dataset.surfaceStyle = normalized.surfaceStyle;
  root.dataset.density = normalized.density;
  root.dataset.layout = normalized.layout;
  root.dataset.reducedMotion = normalized.reducedMotion ? 'true' : 'false';
  root.dataset.showDataOrigin = normalized.showDataOrigin ? 'true' : 'false';
  root.style.colorScheme = theme;
  // Inline root variables win over role-level defaults while still allowing
  // the existing role styles to supply all secondary colours.
  root.style.setProperty('--agriloop-accent', accent.color);
  root.style.setProperty('--agriloop-accent-hover', accent.hover);
  root.style.setProperty('--agriloop-accent-bg', accent.background);
  return normalized;
}

export function initUserSettings(documentRef, windowRef, storage) {
  const settings = readUserSettings(storage);
  applyUserSettings(settings, documentRef, windowRef);
  return settings;
}
