import { ApiError, api } from './api.js';
import { createAmbientLiquidField } from './login-webgl.js';

const ROLE_BY_ACCOUNT = {
  admin: { role: 'FARM_ADMIN', roleLabel: '农场管理员', avatar: '👑' },
  farmer: { role: 'FARMER', roleLabel: '种植农户', avatar: '🧑‍🌾' },
  operator: { role: 'FIELD_OPERATOR', roleLabel: '田间操作员', avatar: '🔧' },
  sysadmin: { role: 'SYSTEM_ADMIN', roleLabel: '系统管理员', avatar: '⚙️' }
};

const DEMO_PASSWORD = 'demo123';
const BACKEND_REQUIRED_MESSAGE = '当前只启动了前端页面，正式登录需要启动后端服务；也可以选择演示身份体验系统。';

const ROLE_PRESENTATION = Object.fromEntries(
  Object.values(ROLE_BY_ACCOUNT).map((value) => [value.role, value])
);

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
const customSelectControllers = new Map();

let toastTimer;
let leaving = false;
let backgroundController = null;
let pendingRegistration = null;
let recoveryCodeContext = 'register';
let selectedDemoAccount = null;

function syncTaskMode() {
  const tasking = document.activeElement?.matches('.auth input, .auth select, .auth [role="combobox"]') ?? false;
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

function closeCustomSelects(except = null) {
  customSelectControllers.forEach((controller, select) => {
    if (select !== except) controller.close();
  });
}

function createSelectCheck() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('field__select-check');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm3.5 8.3 2.8 2.8 6.2-6.2');
  svg.append(path);
  return svg;
}

function enhanceRoleSelect(select) {
  const field = select.closest('.field--select');
  const label = field?.querySelector(':scope > span');
  const arrow = field?.querySelector(':scope > .field__select-arrow');
  if (!field || !label || !arrow) return null;

  const trigger = document.createElement('button');
  const value = document.createElement('span');
  const menu = document.createElement('div');
  const selectableOptions = [...select.options].filter((option) => option.value && !option.disabled);
  const optionButtons = selectableOptions.map((option, index) => {
    const button = document.createElement('button');
    const text = document.createElement('span');
    button.type = 'button';
    button.id = `${select.id}Option${index}`;
    button.className = 'field__select-option';
    button.dataset.value = option.value;
    button.setAttribute('role', 'option');
    button.setAttribute('tabindex', '-1');
    button.setAttribute('aria-selected', 'false');
    text.textContent = option.textContent;
    button.append(text, createSelectCheck());
    menu.append(button);
    return button;
  });

  value.id = `${select.id}Value`;
  value.className = 'field__select-value';
  trigger.type = 'button';
  trigger.className = 'field__select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${select.id}Menu`);
  trigger.setAttribute('aria-labelledby', `${label.id} ${value.id}`);
  trigger.append(value, arrow);

  menu.id = `${select.id}Menu`;
  menu.className = 'field__select-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-labelledby', label.id);
  menu.hidden = true;

  let activeIndex = -1;

  function setActive(index) {
    if (!optionButtons.length) return;
    activeIndex = (index + optionButtons.length) % optionButtons.length;
    optionButtons.forEach((button, buttonIndex) => button.classList.toggle('is-active', buttonIndex === activeIndex));
    trigger.setAttribute('aria-activedescendant', optionButtons[activeIndex].id);
    optionButtons[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function sync() {
    const selectedOption = [...select.options].find((option) => option.value === select.value);
    value.textContent = selectedOption?.textContent || select.options[0]?.textContent || '';
    value.classList.toggle('is-placeholder', !select.value);
    optionButtons.forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.value === select.value));
    });
  }

  function close() {
    menu.hidden = true;
    field.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    optionButtons.forEach((button) => button.classList.remove('is-active'));
    activeIndex = -1;
  }

  function open(direction = 1) {
    closeCustomSelects(select);
    menu.hidden = false;
    field.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    const selectedIndex = optionButtons.findIndex((button) => button.dataset.value === select.value);
    setActive(selectedIndex >= 0 ? selectedIndex : (direction < 0 ? optionButtons.length - 1 : 0));
  }

  function choose(index) {
    const optionButton = optionButtons[index];
    if (!optionButton) return;
    select.value = optionButton.dataset.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
    close();
    trigger.focus();
  }

  trigger.addEventListener('click', () => {
    if (menu.hidden) open();
    else close();
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab' && !menu.hidden) {
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (menu.hidden) open(event.key === 'ArrowUp' ? -1 : 1);
      else setActive(activeIndex + (event.key === 'ArrowUp' ? -1 : 1));
      return;
    }
    if (event.key === 'Home' && !menu.hidden) {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === 'End' && !menu.hidden) {
      event.preventDefault();
      setActive(optionButtons.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (menu.hidden) open();
      else choose(activeIndex);
    }
  });

  optionButtons.forEach((button, index) => {
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('pointerenter', () => setActive(index));
    button.addEventListener('click', () => choose(index));
  });

  select.addEventListener('change', sync);
  select.form?.addEventListener('reset', () => requestAnimationFrame(sync));
  select.hidden = true;
  field.append(trigger, menu);
  field.classList.add('is-enhanced');
  sync();

  return { close, focus: () => trigger.focus(), sync };
}

function focusRoleSelect(select) {
  const controller = customSelectControllers.get(select);
  if (controller) controller.focus();
  else select.focus();
}

function switchView(name, focusTarget = null) {
  if (name !== 'login') selectedDemoAccount = null;
  closeCustomSelects();
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

function selectedDemoUserFor(account, secret, selectedRole) {
  if (!selectedDemoAccount || account !== selectedDemoAccount || secret !== DEMO_PASSWORD) return null;
  const demoUser = demoUserFor(selectedDemoAccount);
  return demoUser?.role === selectedRole ? demoUser : null;
}

function beginExit(user, mode) {
  leaving = true;
  document.body.classList.add('is-leaving');
  showToast(mode === 'demo' ? `已进入${user.roleLabel}演示模式` : `欢迎进入${user.roleLabel}工作台`);
  window.setTimeout(() => window.location.replace('index.html'), 420);
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
    focusRoleSelect(loginRole);
    return;
  }
  if (!secret) {
    setFormError(loginForm, loginError, '请输入密码');
    password.focus();
    return;
  }

  setFormError(loginForm, loginError, '');
  setLoading(loginButton, true);
  const explicitDemoUser = selectedDemoUserFor(account, secret, selectedRole);
  let backendOnline = false;

  try {
    backendOnline = await api.checkHealth();
    if (explicitDemoUser && !backendOnline) {
      api.saveSession({ mode: 'demo', user: explicitDemoUser });
      beginExit(explicitDemoUser, 'demo');
      return;
    }

    const result = await api.login({ username: account, password: secret, role: selectedRole });
    const user = presentUser(result.user);
    api.saveSession({ mode: 'live', token: result.accessToken, user });
    beginExit(user, 'live');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.code === 'AUTH_INVALID')) {
      setFormError(loginForm, loginError, '账号、密码或身份不匹配');
      password.focus();
    } else if (error instanceof ApiError && (error.status === 501 || error.isNetworkError || !backendOnline)) {
      setFormError(loginForm, loginError, BACKEND_REQUIRED_MESSAGE);
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
    focusRoleSelect(registerRole);
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
    loginRole.dispatchEvent(new Event('change', { bubbles: true }));
    selectedDemoAccount = account;
    demoPanel.hidden = true;
    demoToggle.setAttribute('aria-expanded', 'false');
    setFormError(loginForm, loginError, '');
    showToast(`已选择${user.roleLabel}`);
    username.focus();
  });
});

[username, password, loginRole].forEach((control) => {
  control.addEventListener('input', () => { selectedDemoAccount = null; });
  control.addEventListener('change', () => { selectedDemoAccount = null; });
});

[loginRole, registerRole].forEach((select) => {
  const controller = enhanceRoleSelect(select);
  if (controller) customSelectControllers.set(select, controller);
});

document.addEventListener('pointerdown', (event) => {
  customSelectControllers.forEach((controller, select) => {
    if (!select.closest('.field--select')?.contains(event.target)) controller.close();
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
  window.location.replace('index.html');
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
