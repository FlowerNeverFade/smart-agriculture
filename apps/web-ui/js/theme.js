/**
 * Light / dark theme toggle with CSS color cross-fade + 3D palette blending.
 * No fullscreen color wash overlay.
 */
const STORAGE_KEY = 'agriloop-theme';
const TRANSITION_MS = 2000;

let transitionRaf = 0;

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
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

  // Flip theme immediately so CSS transitions animate colors;
  // JS only drives 3D background palette blending.
  root.classList.add('theme-animating');
  setThemeAttribute(to);
  updateThemeToggleUI(to);
  setThemeToggleDisabled(true);

  const start = performance.now();

  const step = (now) => {
    const raw = Math.min((now - start) / TRANSITION_MS, 1);
    const progress = easeInOutSine(raw);
    dispatchTransition(from, to, progress);

    if (raw < 1) {
      transitionRaf = requestAnimationFrame(step);
    } else {
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
    button?.removeEventListener('click', toggleTheme);
  };
}
