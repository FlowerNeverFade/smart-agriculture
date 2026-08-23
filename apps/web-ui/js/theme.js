/**
 * Light / dark theme toggle with animated cross-fade transition.
 */
const STORAGE_KEY = 'agriloop-theme';
const TRANSITION_MS = 2000;

const THEME_VARS = {
  dark: {
    '--bg-base': '#070b16',
    '--bg-canvas': 'rgba(13, 17, 23, 0.22)',
    '--bg-surface': 'rgba(22, 27, 34, 0.38)',
    '--bg-subtle': 'rgba(28, 33, 40, 0.32)',
    '--bg-card': 'rgba(33, 38, 45, 0.36)',
    '--bg-card-hover': 'rgba(41, 46, 54, 0.46)',
    '--bg-input': 'rgba(13, 17, 23, 0.36)',
    '--bg-overlay': 'rgba(13, 17, 23, 0.72)',
    '--border-default': '#30363d',
    '--border-muted': '#21262d',
    '--text-primary': '#f0f6fc',
    '--text-secondary': '#8b949e',
    '--text-muted': '#6e7681',
    '--text-link': '#58a6ff',
  },
  light: {
    '--bg-base': '#f2f7fc',
    '--bg-canvas': 'rgba(255, 255, 255, 0.28)',
    '--bg-surface': 'rgba(246, 248, 250, 0.42)',
    '--bg-subtle': 'rgba(238, 241, 244, 0.36)',
    '--bg-card': 'rgba(255, 255, 255, 0.4)',
    '--bg-card-hover': 'rgba(243, 244, 246, 0.5)',
    '--bg-input': 'rgba(255, 255, 255, 0.4)',
    '--bg-overlay': 'rgba(255, 255, 255, 0.72)',
    '--border-default': '#d0d7de',
    '--border-muted': '#eaeef2',
    '--text-primary': '#1f2328',
    '--text-secondary': '#59636e',
    '--text-muted': '#818b98',
    '--text-link': '#0969da',
  },
};

let transitionRaf = 0;
let overlayEl = null;

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function ensureOverlay() {
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'themeTransitionOverlay';
    overlayEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlayEl);
  }
  return overlayEl;
}

function updateTransitionOverlay(from, to, progress) {
  const el = ensureOverlay();
  const peak = Math.sin(progress * Math.PI);
  const goingLight = to === 'light';
  if (goingLight) {
    el.style.background = `rgba(255, 236, 180, ${peak * 0.72})`;
  } else {
    el.style.background = `rgba(6, 10, 28, ${peak * 0.78})`;
  }
  el.classList.add('active');
}

function hideTransitionOverlay() {
  if (!overlayEl) return;
  overlayEl.classList.remove('active');
  overlayEl.style.background = 'transparent';
}

function parseColor(input) {
  if (input.startsWith('#')) {
    const hex = input.slice(1);
    const full = hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const parts = input.replace(/rgba?\(|\)|\s/g, '').split(',');
  return {
    r: Number(parts[0]),
    g: Number(parts[1]),
    b: Number(parts[2]),
    a: parts[3] !== undefined ? Number(parts[3]) : 1,
  };
}

function lerpColor(from, to, t) {
  const a = parseColor(from);
  const b = parseColor(to);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  const alpha = a.a + (b.a - a.a) * t;
  if (alpha < 0.999) {
    return `rgba(${r}, ${g}, ${bl}, ${alpha.toFixed(3)})`;
  }
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function setThemeAttribute(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function clearInlineThemeVars() {
  for (const key of Object.keys(THEME_VARS.dark)) {
    document.documentElement.style.removeProperty(key);
  }
}

function applyCssVars(theme, t, fromTheme, toTheme) {
  const from = THEME_VARS[fromTheme];
  const to = THEME_VARS[toTheme];
  for (const key of Object.keys(from)) {
    document.documentElement.style.setProperty(key, lerpColor(from[key], to[key], t));
  }
}

function updateThemeToggleUI(theme) {
  const btn = document.getElementById('btnThemeToggle');
  if (!btn) return;

  const isLight = theme === 'light';
  btn.dataset.theme = theme;
  btn.setAttribute('aria-label', isLight ? '切换至深色主题' : '切换至浅色主题');
  btn.setAttribute('title', isLight ? '切换至深色主题' : '切换至浅色主题');

  const icon = btn.querySelector('.theme-toggle-icon');
  const label = btn.querySelector('.theme-toggle-label');
  if (icon) icon.textContent = isLight ? '🌙' : '☀️';
  if (label) label.textContent = isLight ? '深色' : '浅色';
}

function dispatchTransition(from, to, progress) {
  document.dispatchEvent(new CustomEvent('agriloop-theme-transition', {
    detail: { from, to, progress },
  }));
}

function setThemeToggleDisabled(disabled) {
  const btn = document.getElementById('btnThemeToggle');
  if (btn) btn.disabled = disabled;
}

function animateTheme(from, to) {
  cancelAnimationFrame(transitionRaf);
  const root = document.documentElement;

  // Flip the theme attribute immediately so CSS transitions (2s) animate
  // background-color / color / border-color on themed elements. JS no longer
  // lerps CSS vars inline — that fought with per-element CSS transitions and
  // made the animation look stuck. JS now only drives the overlay + 3D bg.
  clearInlineThemeVars();
  root.classList.add('theme-animating');
  setThemeAttribute(to);
  updateThemeToggleUI(to);
  setThemeToggleDisabled(true);
  ensureOverlay();

  const start = performance.now();

  const step = (now) => {
    const raw = Math.min((now - start) / TRANSITION_MS, 1);
    const progress = easeInOutSine(raw);
    updateTransitionOverlay(from, to, progress);
    dispatchTransition(from, to, progress);

    if (raw < 1) {
      transitionRaf = requestAnimationFrame(step);
    } else {
      hideTransitionOverlay();
      root.classList.remove('theme-animating');
      localStorage.setItem(STORAGE_KEY, to);
      setThemeToggleDisabled(false);
      document.dispatchEvent(new CustomEvent('agriloop-theme-change', { detail: { theme: to } }));
    }
  };

  transitionRaf = requestAnimationFrame(step);
}

export function applyTheme(theme, options = {}) {
  const { animated = false } = options;
  const current = getTheme();
  if (theme === current && animated) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (animated && !reducedMotion && current !== theme) {
    animateTheme(current, theme);
    return;
  }

  cancelAnimationFrame(transitionRaf);
  hideTransitionOverlay();
  document.documentElement.classList.remove('theme-animating');
  clearInlineThemeVars();
  setThemeAttribute(theme);
  localStorage.setItem(STORAGE_KEY, theme);
  updateThemeToggleUI(theme);
  document.dispatchEvent(new CustomEvent('agriloop-theme-change', { detail: { theme } }));
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next, { animated: true });
  return next;
}

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) || 'dark';
  applyTheme(saved === 'light' ? 'light' : 'dark', { animated: false });

  document.getElementById('btnThemeToggle')?.addEventListener('click', () => toggleTheme());
}
