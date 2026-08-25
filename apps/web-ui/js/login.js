import { ApiError, api } from './api.js';
import { createAmbientLiquidField } from './login-webgl.js';
import { DEMO_ACCOUNTS, presentRoleUser } from './roles.js';

const authViews = [...document.querySelectorAll('[data-auth-view]')];
const glassPanel = document.querySelector('.auth');
const loginForm = document.getElementById('loginForm');
const username = document.getElementById('username');
const loginRole = document.getElementById('loginRole');
const password = document.getElementById('password');
const loginButton = document.getElementById('loginButton');
const loginError = document.getElementById('loginError');
const registerForm = document.getElementById('registerForm');
const registerUsername = document.getElementById('registerUsername');
const registerRole = document.getElementById('registerRole');
const registerPassword = document.getElementById('registerPassword');
const registerConfirm = document.getElementById('registerConfirm');
const registerButton = document.getElementById('registerButton');
const registerError = document.getElementById('registerError');
const recoveryForm = document.getElementById('recoveryForm');
const recoveryUsername = document.getElementById('recoveryUsername');
const recoveryCodeInput = document.getElementById('recoveryCodeInput');
const newPassword = document.getElementById('newPassword');
const newPasswordConfirm = document.getElementById('newPasswordConfirm');
const recoveryButton = document.getElementById('recoveryButton');
const recoveryError = document.getElementById('recoveryError');
const recoveryCodeTitle = document.getElementById('recoveryCodeTitle');
const recoveryCodeSummary = document.getElementById('recoveryCodeSummary');
const recoveryCodeValue = document.getElementById('recoveryCodeValue');
const recoveryCodeContinue = document.getElementById('recoveryCodeContinue');
const copyRecoveryCode = document.getElementById('copyRecoveryCode');
const demoToggle = document.getElementById('demoToggle');
const demoPanel = document.getElementById('demoPanel');
const toast = document.getElementById('toast');
const liquidCanvas = document.getElementById('ambientLiquidCanvas');
const liquidFallback = document.getElementById('liquidFieldFallback');

let toastTimer;
let leaving = false;
let backgroundController = null;
let pendingRegistration = null;
let recoveryCodeContext = 'register';

function syncTaskMode() {
  const tasking = document.activeElement?.matches('.auth input, .auth select') ?? false;
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
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function setFormError(form, target, message) {
  target.textContent = message;
  form.classList.toggle('has-error', Boolean(message));
}

function setLoading(button, loading) {
  button.disabled = loading;
  button.classList.toggle('is-loading', loading);
}

function switchView(name, focusTarget = null) {
  authViews.forEach((view) => { view.hidden = view.dataset.authView !== name; });
  glassPanel.dataset.view = name;
  demoPanel.hidden = true;
  demoToggle.setAttribute('aria-expanded', 'false');
  setFormError(loginForm, loginError, '');
  setFormError(registerForm, registerError, '');
  setFormError(recoveryForm, recoveryError, '');
  requestAnimationFrame(() => {
    focusTarget?.focus();
    syncTaskMode();
  });
}

function presentUser(user) {
  return presentRoleUser(user);
}

function demoUserFor(account) {
  const role = DEMO_ACCOUNTS[account];
  return role ? { username: account, ...role } : null;
}

function beginExit(user, mode) {
  leaving = true;
  document.body.classList.add('is-leaving');
  showToast(mode === 'demo' ? `已进入${user.roleLabel}演示模式` : `欢迎进入${user.roleLabel}工作台`);
  const target = user.role === 'FARMER' ? 'farmer.html' : 'index.html';
  window.setTimeout(() => window.location.replace(target), 420);
}

function validateUsername(value) {
  return /^[a-z0-9][a-z0-9._-]{3,31}$/i.test(value);
}

function validatePassword(account, secret) {
  return secret.length >= 8 && secret.length <= 64
    && /\p{L}/u.test(secret) && /\d/.test(secret)
    && !secret.toLowerCase().includes(account.toLowerCase());
}

async function submitLogin(event) {
  event.preventDefault();
  const account = username.value.trim();
  const selectedRole = loginRole.value;
  const secret = password.value;

  if (!account) {
    setFormError(loginForm, loginError, '请输入账号');
    username.focus();
    return;
  }
  if (!selectedRole) {
    setFormError(loginForm, loginError, '请选择登录身份');
    loginRole.focus();
    return;
  }
  if (!secret) {
    setFormError(loginForm, loginError, '请输入密码');
    password.focus();
    return;
  }

  setFormError(loginForm, loginError, '');
  setLoading(loginButton, true);

  try {
    const result = await api.login({ username: account, password: secret, role: selectedRole });
    const user = presentUser(result.user);
    api.saveSession({ mode: 'live', token: result.accessToken, user });
    beginExit(user, 'live');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.code === 'AUTH_INVALID')) {
      setFormError(loginForm, loginError, '账号、密码或身份不匹配');
      password.focus();
    } else if (error instanceof ApiError && error.isNetworkError) {
      const demoUser = secret === 'demo123' ? demoUserFor(account) : null;
      if (demoUser && demoUser.role === selectedRole) {
        api.saveSession({ mode: 'demo', user: demoUser });
        beginExit(demoUser, 'demo');
      } else if (demoUser) {
        setFormError(loginForm, loginError, '账号与所选身份不匹配');
      } else {
        setFormError(loginForm, loginError, '后端暂不可用；演示账号需使用 demo123');
      }
    } else {
      setFormError(loginForm, loginError, error instanceof ApiError ? error.message : '登录服务暂不可用');
    }
  } finally {
    if (!leaving) setLoading(loginButton, false);
  }
}

async function submitRegistration(event) {
  event.preventDefault();
  const account = registerUsername.value.trim().toLowerCase();
  const selectedRole = registerRole.value;
  const secret = registerPassword.value;

  if (!validateUsername(account)) {
    setFormError(registerForm, registerError, '账号需为 4–32 位字母、数字、点、下划线或短横线');
    registerUsername.focus();
    return;
  }
  if (!selectedRole) {
    setFormError(registerForm, registerError, '请选择注册身份');
    registerRole.focus();
    return;
  }
  if (!validatePassword(account, secret)) {
    setFormError(registerForm, registerError, '密码需为 8–64 位并包含字母和数字，且不能包含账号');
    registerPassword.focus();
    return;
  }
  if (secret !== registerConfirm.value) {
    setFormError(registerForm, registerError, '两次输入的密码不一致');
    registerConfirm.focus();
    return;
  }

  setFormError(registerForm, registerError, '');
  setLoading(registerButton, true);
  try {
    const result = await api.register({ username: account, password: secret, role: selectedRole });
    pendingRegistration = { token: result.accessToken, user: presentUser(result.user) };
    showRecoveryCode(result.recoveryCode, 'register');
    registerForm.reset();
  } catch (error) {
    const message = error instanceof ApiError && error.isNetworkError
      ? '注册需要连接账户服务，请检查后端后重试'
      : (error instanceof ApiError ? error.message : '账号创建失败，请稍后重试');
    setFormError(registerForm, registerError, message);
  } finally {
    setLoading(registerButton, false);
  }
}

async function submitRecovery(event) {
  event.preventDefault();
  const account = recoveryUsername.value.trim().toLowerCase();
  const secret = newPassword.value;

  if (!validateUsername(account)) {
    setFormError(recoveryForm, recoveryError, '请输入有效账号');
    recoveryUsername.focus();
    return;
  }
  if (!recoveryCodeInput.value.trim()) {
    setFormError(recoveryForm, recoveryError, '请输入账户恢复码');
    recoveryCodeInput.focus();
    return;
  }
  if (!validatePassword(account, secret)) {
    setFormError(recoveryForm, recoveryError, '新密码需为 8–64 位并包含字母和数字，且不能包含账号');
    newPassword.focus();
    return;
  }
  if (secret !== newPasswordConfirm.value) {
    setFormError(recoveryForm, recoveryError, '两次输入的新密码不一致');
    newPasswordConfirm.focus();
    return;
  }

  setFormError(recoveryForm, recoveryError, '');
  setLoading(recoveryButton, true);
  try {
    const result = await api.resetPassword({
      username: account,
      recoveryCode: recoveryCodeInput.value,
      newPassword: secret
    });
    username.value = result.username || account;
    api.clearSession();
    showRecoveryCode(result.recoveryCode, 'reset');
    recoveryForm.reset();
  } catch (error) {
    const message = error instanceof ApiError && error.isNetworkError
      ? '密码重设需要连接账户服务，请检查后端后重试'
      : (error instanceof ApiError ? error.message : '密码重设失败，请稍后重试');
    setFormError(recoveryForm, recoveryError, message);
  } finally {
    setLoading(recoveryButton, false);
  }
}

function showRecoveryCode(code, context) {
  recoveryCodeContext = context;
  recoveryCodeValue.textContent = code;
  if (context === 'register') {
    recoveryCodeTitle.textContent = '账号创建成功';
    recoveryCodeSummary.textContent = '此恢复码只显示一次，请保存后再进入系统。';
    recoveryCodeContinue.querySelector('.submit__label').textContent = '我已保存，进入系统';
  } else {
    recoveryCodeTitle.textContent = '密码已更新';
    recoveryCodeSummary.textContent = '旧恢复码已失效，请保存新的账户恢复码。';
    recoveryCodeContinue.querySelector('.submit__label').textContent = '我已保存，返回登录';
  }
  switchView('recovery-code');
}

async function copyCode() {
  const code = recoveryCodeValue.textContent;
  try {
    await navigator.clipboard.writeText(code);
    showToast('恢复码已复制');
  } catch {
    const range = document.createRange();
    range.selectNodeContents(recoveryCodeValue);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    showToast('已选中恢复码，请手动复制');
  }
}

function continueAfterRecoveryCode() {
  if (recoveryCodeContext === 'register' && pendingRegistration) {
    api.saveSession({ mode: 'live', token: pendingRegistration.token, user: pendingRegistration.user });
    beginExit(pendingRegistration.user, 'live');
    return;
  }
  pendingRegistration = null;
  password.value = '';
  switchView('login', password);
  showToast('请使用新密码登录');
}

document.querySelectorAll('[data-reveal]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.reveal);
    const showing = target.type === 'text';
    target.type = showing ? 'password' : 'text';
    button.textContent = showing ? '显示' : '隐藏';
    button.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
  });
});

document.getElementById('showRegister').addEventListener('click', () => switchView('register', registerUsername));
document.getElementById('showRecovery').addEventListener('click', () => {
  recoveryUsername.value = username.value.trim();
  switchView('recovery', recoveryUsername.value ? recoveryCodeInput : recoveryUsername);
});
document.querySelectorAll('[data-back-to-login]').forEach((button) => {
  button.addEventListener('click', () => switchView('login', username));
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
    loginRole.value = user.role;
    demoPanel.hidden = true;
    demoToggle.setAttribute('aria-expanded', 'false');
    setFormError(loginForm, loginError, '');
    showToast(`已选择${user.roleLabel}`);
    username.focus();
  });
});

loginForm.addEventListener('submit', submitLogin);
registerForm.addEventListener('submit', submitRegistration);
recoveryForm.addEventListener('submit', submitRecovery);
copyRecoveryCode.addEventListener('click', copyCode);
recoveryCodeContinue.addEventListener('click', continueAfterRecoveryCode);

[
  [loginForm, loginError],
  [registerForm, registerError],
  [recoveryForm, recoveryError]
].forEach(([form, error]) => {
  form.addEventListener('input', () => {
    if (error.textContent) setFormError(form, error, '');
  });
  form.addEventListener('focusin', syncTaskMode);
  form.addEventListener('focusout', handleTaskModeFocusOut);
});

const storedSession = api.readSession();
if (storedSession?.mode === 'live' && storedSession.token) {
  const storedUser = presentRoleUser(storedSession?.user);
  const target = storedUser?.role === 'FARMER' ? 'farmer.html' : 'index.html';
  window.location.replace(target);
} else {
  if (storedSession?.mode === 'demo') api.clearSession();
  backgroundController = createAmbientLiquidField({
    canvas: liquidCanvas,
    fallback: liquidFallback,
    glassPanel
  });
  syncTaskMode();
  requestAnimationFrame(() => document.body.classList.add('is-mounted'));
}
