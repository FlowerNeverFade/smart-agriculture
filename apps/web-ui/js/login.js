import { ApiError, api } from './api.js';
import { createAmbientLiquidField } from './login-webgl.js';

const ROLE_BY_ACCOUNT = {
  admin: { role: 'FARM_ADMIN', roleLabel: '农场管理员', avatar: '👑' },
  farmer: { role: 'FARMER', roleLabel: '种植农户', avatar: '🧑‍🌾' },
  operator: { role: 'FIELD_OPERATOR', roleLabel: '田间操作员', avatar: '🔧' },
  sysadmin: { role: 'SYSTEM_ADMIN', roleLabel: '系统管理员', avatar: '⚙️' }
};

const ROLE_PRESENTATION = Object.fromEntries(
  Object.values(ROLE_BY_ACCOUNT).map((value) => [value.role, value])
);

const form = document.getElementById('loginForm');
const username = document.getElementById('username');
const password = document.getElementById('password');
const revealPassword = document.getElementById('revealPassword');
const submitButton = document.getElementById('submitButton');
const demoToggle = document.getElementById('demoToggle');
const demoPanel = document.getElementById('demoPanel');
const forgotPassword = document.getElementById('forgotPassword');
const formError = document.getElementById('formError');
const toast = document.getElementById('toast');
const liquidCanvas = document.getElementById('ambientLiquidCanvas');
const liquidFallback = document.getElementById('liquidFieldFallback');
const glassPanel = document.querySelector('.auth');

let toastTimer;
let leaving = false;
let backgroundController = null;

function syncTaskMode() {
  const tasking = document.activeElement === username || document.activeElement === password;
  document.body.classList.toggle('is-tasking', tasking);
  backgroundController?.setTaskMode(tasking);
}

function handleTaskModeFocusOut() {
  queueMicrotask(syncTaskMode);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

function setError(message) {
  formError.textContent = message;
  form.classList.toggle('has-error', Boolean(message));
}

function presentUser(user) {
  const presentation = ROLE_PRESENTATION[user.role] || ROLE_BY_ACCOUNT[user.username] || {};
  return {
    ...user,
    roleLabel: presentation.roleLabel || user.role,
    avatar: presentation.avatar || ''
  };
}

function demoUserFor(account) {
  const role = ROLE_BY_ACCOUNT[account];
  return role ? { username: account, ...role } : null;
}

function beginExit(user, mode) {
  leaving = true;
  document.body.classList.add('is-leaving');
  showToast(mode === 'demo' ? `已进入${user.roleLabel}演示模式` : `欢迎进入${user.roleLabel}工作台`);
  window.setTimeout(() => window.location.replace('index.html'), 420);
}

async function submitLogin(event) {
  event.preventDefault();
  const account = username.value.trim();
  const secret = password.value;

  if (!account || !secret) {
    setError('请输入账号和密码');
    (!account ? username : password).focus();
    return;
  }

  setError('');
  submitButton.disabled = true;
  submitButton.classList.add('is-loading');

  try {
    const result = await api.login({ username: account, password: secret });
    const user = presentUser(result.user);
    api.saveSession({ mode: 'live', token: result.accessToken, user });
    beginExit(user, 'live');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.code === 'AUTH_INVALID')) {
      setError('账号或密码错误');
      password.focus();
    } else if (error instanceof ApiError && (error.isNetworkError || error.status === 0 || error.status === 404 || error.status === 405 || error.status === 501 || error.status >= 500)) {
      // 后端不可用（网络错误，或静态服务器对 POST 返回 404/405/501 等）→ 离线演示会话
      const demoUser = secret === 'demo123' ? demoUserFor(account) : null;
      if (demoUser) {
        api.saveSession({ mode: 'demo', user: demoUser });
        beginExit(demoUser, 'demo');
      } else {
        setError('后端暂不可用；演示账号需使用 demo123');
      }
    } else {
      setError(error instanceof ApiError ? error.message : '登录服务暂不可用');
    }
  } finally {
    if (!leaving) {
      submitButton.disabled = false;
      submitButton.classList.remove('is-loading');
    }
  }
}

revealPassword.addEventListener('click', () => {
  const showing = password.type === 'text';
  password.type = showing ? 'password' : 'text';
  revealPassword.textContent = showing ? '显示' : '隐藏';
  revealPassword.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
});

demoToggle.addEventListener('click', () => {
  const willOpen = demoPanel.hidden;
  demoPanel.hidden = !willOpen;
  demoToggle.setAttribute('aria-expanded', String(willOpen));
});

demoPanel.querySelectorAll('[data-user]').forEach((button) => {
  button.addEventListener('click', () => {
    const account = button.dataset.user;
    const user = demoUserFor(account);
    if (!user) return;
    username.value = account;
    password.value = 'demo123';
    demoPanel.hidden = true;
    demoToggle.setAttribute('aria-expanded', 'false');
    setError('');
    showToast(`已选择${user.roleLabel}`);
    username.focus();
  });
});

forgotPassword.addEventListener('click', () => showToast('演示环境暂不发送重置邮件'));
form.addEventListener('submit', submitLogin);
form.addEventListener('input', () => {
  if (formError.textContent) setError('');
});
form.addEventListener('focusin', syncTaskMode);
form.addEventListener('focusout', handleTaskModeFocusOut);

const storedSession = api.readSession();
if (storedSession?.mode === 'live' && storedSession.token) {
  window.location.replace('index.html');
} else {
  // A demo session is only valid while the backend is offline. Clear it here
  // so an already-open offline demo cannot loop between login.html and index.html
  // when the public API comes back online.
  if (storedSession?.mode === 'demo') api.clearSession();
  backgroundController = createAmbientLiquidField({
    canvas: liquidCanvas,
    fallback: liquidFallback,
    glassPanel
  });
  syncTaskMode();
  requestAnimationFrame(() => document.body.classList.add('is-mounted'));
}
