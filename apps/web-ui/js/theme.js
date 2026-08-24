/**
 * Light / dark theme toggle with animated cross-fade transition.
 * Transition implementation follows rium_dev: 2s CSS color cross-fade + JS-driven overlay.
 */
const STORAGE_KEY = 'agriloop-theme';
const TRANSITION_MS = 2000;

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

function setThemeAttribute(theme) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
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
  // background-color / color / border-color on themed elements. JS drives
  // the overlay + 3D background palette blending separately.
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
  if (theme === current && animated) return current;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (animated && !reducedMotion && current !== theme) {
    animateTheme(current, theme);
    return theme;
  }

  cancelAnimationFrame(transitionRaf);
  hideTransitionOverlay();
  document.documentElement.classList.remove('theme-animating');
  setThemeAttribute(theme);
  localStorage.setItem(STORAGE_KEY, theme);
  updateThemeToggleUI(theme);
  document.dispatchEvent(new CustomEvent('agriloop-theme-change', { detail: { theme } }));
  return theme;
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next, { animated: true });
  return next;
}

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) || 'dark';
  applyTheme(saved === 'light' ? 'light' : 'dark', { animated: false });

  const button = document.getElementById('btnThemeToggle');
  button?.addEventListener('click', toggleTheme);

  return () => {
    cancelAnimationFrame(transitionRaf);
    hideTransitionOverlay();
    button?.removeEventListener('click', toggleTheme);
  };
}
