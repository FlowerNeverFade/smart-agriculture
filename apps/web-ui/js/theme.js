/**
 * Lightweight theme controller shared by the rium_dev background and the main shell.
 * It deliberately owns only the theme attribute and transition events; the dashboard
 * remains the source of truth for all application state.
 */
const STORAGE_KEY = 'agriloop-theme';

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme, { animated = false } = {}) {
  const next = theme === 'light' ? 'light' : 'dark';
  const previous = getTheme();
  if (previous === next) {
    document.documentElement.setAttribute('data-theme', next);
    return next;
  }
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_KEY, next);
  document.dispatchEvent(new CustomEvent('agriloop-theme-change', { detail: { theme: next, previous, animated } }));
  return next;
}

export function toggleTheme() {
  return applyTheme(getTheme() === 'dark' ? 'light' : 'dark', { animated: true });
}

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
  const button = document.getElementById('btnThemeToggle');
  const update = () => {
    const light = getTheme() === 'light';
    if (!button) return;
    button.dataset.theme = light ? 'light' : 'dark';
    button.setAttribute('aria-label', light ? '切换至深色主题' : '切换至浅色主题');
    button.title = light ? '切换至深色主题' : '切换至浅色主题';
    const icon = button.querySelector('.theme-toggle-icon');
    const label = button.querySelector('.theme-toggle-label');
    if (icon) icon.textContent = light ? '🌙' : '☀️';
    if (label) label.textContent = light ? '深色' : '浅色';
  };
  button?.addEventListener('click', toggleTheme);
  document.addEventListener('agriloop-theme-change', update);
  update();
  return () => {
    button?.removeEventListener('click', toggleTheme);
    document.removeEventListener('agriloop-theme-change', update);
  };
}
