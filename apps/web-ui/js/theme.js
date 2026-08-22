/**
 * Light / dark theme toggle with localStorage persistence.
 */
const STORAGE_KEY = 'agriloop-theme';

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
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

export function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem(STORAGE_KEY, theme);
  updateThemeToggleUI(theme);
  document.dispatchEvent(new CustomEvent('agriloop-theme-change', { detail: { theme } }));
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

/** Apply saved theme on startup and wire the toggle button. */
export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) || 'dark';
  applyTheme(saved === 'light' ? 'light' : 'dark');

  document.getElementById('btnThemeToggle')?.addEventListener('click', () => toggleTheme());
}
