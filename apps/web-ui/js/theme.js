/**
 * Light/dark theme controller shared by the dashboard and the rium_dev scene.
 * The two-second transition drives both CSS liquid glass and the 3D day/night palette.
 */
const STORAGE_KEY = 'agriloop-theme';
const TRANSITION_MS = 2000;

let transitionRaf = 0;
let overlayEl = null;

function cancelTransitionFrame(handle) {
  if (!handle) return;
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(handle);
  } else {
    window.clearTimeout(handle);
  }
}

function requestTransitionFrame(callback) {
  if (typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(() => callback(window.performance?.now?.() ?? Date.now()), 16);
}

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function easeInOutSine(value) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
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

function setThemeAttribute(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}

function updateThemeToggle(theme) {
  const button = document.getElementById('btnThemeToggle');
  if (!button) return;
  const light = theme === 'light';
  button.dataset.theme = theme;
  button.setAttribute('aria-label', light ? '切换至深色主题' : '切换至浅色主题');
  button.title = light ? '切换至深色主题' : '切换至浅色主题';
  const icon = button.querySelector('.theme-toggle-icon');
  const label = button.querySelector('.theme-toggle-label');
  if (icon) icon.textContent = light ? '🌙' : '☀️';
  if (label) label.textContent = light ? '深色' : '浅色';
}

function dispatchTransition(from, to, progress) {
  document.dispatchEvent(new window.CustomEvent('agriloop-theme-transition', {
    detail: { from, to, progress }
  }));
}

function finishTheme(theme, previous) {
  const root = document.documentElement;
  root.classList.remove('theme-animating');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {
    // Storage can be disabled; the in-memory theme still works.
  }
  updateThemeToggle(theme);
  const button = document.getElementById('btnThemeToggle');
  if (button) button.disabled = false;
  if (overlayEl) {
    overlayEl.classList.remove('active');
    overlayEl.style.background = 'transparent';
  }
  document.dispatchEvent(new window.CustomEvent('agriloop-theme-change', {
    detail: { theme, previous }
  }));
}

function animateTheme(from, to) {
  cancelTransitionFrame(transitionRaf);
  const root = document.documentElement;
  const button = document.getElementById('btnThemeToggle');
  const overlay = ensureOverlay();
  root.classList.add('theme-animating');
  setThemeAttribute(to);
  updateThemeToggle(to);
  if (button) button.disabled = true;

  const start = window.performance?.now?.() ?? Date.now();
  const step = now => {
    const raw = Math.min((now - start) / TRANSITION_MS, 1);
    const progress = easeInOutSine(raw);
    const peak = Math.sin(progress * Math.PI);
    overlay.style.background = to === 'light'
      ? `rgba(255, 236, 180, ${peak * 0.72})`
      : `rgba(6, 10, 28, ${peak * 0.78})`;
    overlay.classList.add('active');
    dispatchTransition(from, to, progress);
    if (raw < 1) {
      transitionRaf = requestTransitionFrame(step);
    } else {
      finishTheme(to, from);
    }
  };
  transitionRaf = requestTransitionFrame(step);
}

export function applyTheme(theme, { animated = false } = {}) {
  const next = theme === 'light' ? 'light' : 'dark';
  const previous = getTheme();
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (animated && !reducedMotion && previous !== next) {
    animateTheme(previous, next);
    return next;
  }

  cancelTransitionFrame(transitionRaf);
  setThemeAttribute(next);
  finishTheme(next, previous);
  return next;
}

export function toggleTheme() {
  return applyTheme(getTheme() === 'dark' ? 'light' : 'dark', { animated: true });
}

export function initTheme() {
  let saved = 'dark';
  try {
    saved = localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch (_) {
    // Storage can be disabled; the dark default remains usable.
  }
  applyTheme(saved);
  const button = document.getElementById('btnThemeToggle');
  button?.addEventListener('click', toggleTheme);
  return () => {
    cancelTransitionFrame(transitionRaf);
    button?.removeEventListener('click', toggleTheme);
    overlayEl?.remove();
    overlayEl = null;
  };
}
