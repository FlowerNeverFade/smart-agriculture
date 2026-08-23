import { ApiError, api } from './api.js';

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
const experience = document.querySelector('.experience');
const glassPanel = document.querySelector('.auth');

let toastTimer;
let leaving = false;

function createLoginMotion() {
  const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const supportsBackdrop = CSS.supports('backdrop-filter: blur(1px)')
    || CSS.supports('-webkit-backdrop-filter: blur(1px)');
  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => measureGlass())
    : null;

  const stateKeys = [
    'fieldX', 'fieldY', 'ambientX', 'ambientY',
    'glassX', 'glassY', 'glassProximity', 'strength'
  ];

  let tasking = false;
  let viewport = { width: window.innerWidth, height: window.innerHeight };
  let glassRect = glassPanel.getBoundingClientRect();
  let home = createHome();
  const current = { ...home };
  const target = { ...home };
  let rafId = 0;
  let lastTime = 0;
  let pointerPresent = false;
  let lastPointer = null;
  let paused = false;
  let destroyed = false;

  function createHome() {
    return {
      fieldX: viewport.width * .24,
      fieldY: viewport.height * .72,
      ambientX: viewport.width * .82,
      ambientY: viewport.height * .18,
      glassX: .46,
      glassY: .18,
      glassProximity: 0,
      strength: tasking ? .58 : 1
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function approach(value, destination, rate, delta) {
    const alpha = 1 - Math.pow(1 - rate, Math.min(delta, 32) / 16.667);
    return value + (destination - value) * alpha;
  }

  function smoothstep(value) {
    return value * value * (3 - 2 * value);
  }

  function motionAllowed() {
    return finePointer.matches && !reducedMotion.matches;
  }

  function glassMotionAllowed() {
    return motionAllowed() && supportsBackdrop;
  }

  function setProperty(targetElement, property, value) {
    if (targetElement.style.getPropertyValue(property) !== value) {
      targetElement.style.setProperty(property, value);
    }
  }

  function render() {
    const strength = current.strength;
    const fieldX = home.fieldX + (current.fieldX - home.fieldX) * strength;
    const fieldY = home.fieldY + (current.fieldY - home.fieldY) * strength;
    const ambientX = home.ambientX + (current.ambientX - home.ambientX) * strength;
    const ambientY = home.ambientY + (current.ambientY - home.ambientY) * strength;
    const proximity = glassMotionAllowed() ? current.glassProximity * strength : 0;
    const glassX = glassMotionAllowed() ? current.glassX : home.glassX;
    const glassY = glassMotionAllowed() ? current.glassY : home.glassY;
    const shiftX = -2 + (glassX - .5) * 48 * proximity;
    const shiftY = -8 + (glassY - .5) * 36 * proximity;
    const specularBase = tasking ? .3 : .5;
    const specular = specularBase * (.82 + proximity * .18);

    const panelCenterX = glassRect.left + glassRect.width / 2;
    const panelCenterY = glassRect.top + glassRect.height / 2;
    const fieldDistance = Math.hypot(fieldX - panelCenterX, fieldY - panelCenterY);
    const tint = .025 + clamp(1 - fieldDistance / 540, 0, 1) * .045 * strength;

    const topEdge = .20 + .12 * (1 - glassY) * proximity;
    const leftEdge = .14 + .10 * (1 - glassX) * proximity;
    const rightEdge = .08 + .08 * glassX * proximity;
    const bottomEdge = .06 + .06 * glassY * proximity;

    setProperty(experience, '--field-x', `${fieldX.toFixed(2)}px`);
    setProperty(experience, '--field-y', `${fieldY.toFixed(2)}px`);
    setProperty(experience, '--ambient-x', `${ambientX.toFixed(2)}px`);
    setProperty(experience, '--ambient-y', `${ambientY.toFixed(2)}px`);
    setProperty(glassPanel, '--glass-x', `${(glassX * 100).toFixed(2)}%`);
    setProperty(glassPanel, '--glass-y', `${(glassY * 100).toFixed(2)}%`);
    setProperty(glassPanel, '--glass-shift-x', `${shiftX.toFixed(2)}px`);
    setProperty(glassPanel, '--glass-shift-y', `${shiftY.toFixed(2)}px`);
    setProperty(glassPanel, '--glass-specular-opacity', specular.toFixed(3));
    setProperty(glassPanel, '--glass-tint-alpha', tint.toFixed(3));
    setProperty(glassPanel, '--edge-top-a', topEdge.toFixed(3));
    setProperty(glassPanel, '--edge-left-a', leftEdge.toFixed(3));
    setProperty(glassPanel, '--edge-right-a', rightEdge.toFixed(3));
    setProperty(glassPanel, '--edge-bottom-a', bottomEdge.toFixed(3));
  }

  function isSettled() {
    return stateKeys.every((key) => {
      const threshold = key.endsWith('X') || key.endsWith('Y')
        ? (key.startsWith('glass') ? .0005 : .12)
        : .001;
      return Math.abs(target[key] - current[key]) < threshold;
    });
  }

  function snapToTargets() {
    stateKeys.forEach((key) => { current[key] = target[key]; });
  }

  function tick(timestamp) {
    rafId = 0;
    if (paused || destroyed || !motionAllowed()) return;

    const delta = lastTime ? timestamp - lastTime : 16.667;
    lastTime = timestamp;
    current.fieldX = approach(current.fieldX, target.fieldX, .08, delta);
    current.fieldY = approach(current.fieldY, target.fieldY, .08, delta);
    current.ambientX = approach(current.ambientX, target.ambientX, .025, delta);
    current.ambientY = approach(current.ambientY, target.ambientY, .025, delta);
    current.glassX = approach(current.glassX, target.glassX, .12, delta);
    current.glassY = approach(current.glassY, target.glassY, .12, delta);
    current.glassProximity = approach(current.glassProximity, target.glassProximity, .10, delta);
    current.strength = approach(current.strength, target.strength, .10, delta);
    render();

    if (isSettled()) {
      snapToTargets();
      render();
      lastTime = 0;
    } else {
      schedule();
    }
  }

  function schedule() {
    if (!rafId && !paused && !destroyed && motionAllowed()) {
      rafId = requestAnimationFrame(tick);
    }
  }

  function cancel() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    lastTime = 0;
  }

  function updatePointerTargets(clientX, clientY) {
    target.fieldX = clientX;
    target.fieldY = clientY;
    target.ambientX = home.ambientX + (viewport.width / 2 - clientX) * .14;
    target.ambientY = home.ambientY + (viewport.height / 2 - clientY) * .08;

    if (!glassMotionAllowed()) {
      target.glassX = home.glassX;
      target.glassY = home.glassY;
      target.glassProximity = 0;
      return;
    }

    target.glassX = clamp((clientX - glassRect.left) / glassRect.width, .06, .94);
    target.glassY = clamp((clientY - glassRect.top) / glassRect.height, .06, .94);

    const dx = Math.max(glassRect.left - clientX, 0, clientX - glassRect.right);
    const dy = Math.max(glassRect.top - clientY, 0, clientY - glassRect.bottom);
    const normalizedDistance = clamp(1 - Math.hypot(dx, dy) / 230, 0, 1);
    target.glassProximity = smoothstep(normalizedDistance);
  }

  function onPointerMove(event) {
    if (!motionAllowed() || event.pointerType === 'touch') return;
    pointerPresent = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    updatePointerTargets(event.clientX, event.clientY);
    schedule();
  }

  function resetTargets() {
    pointerPresent = false;
    lastPointer = null;
    target.fieldX = home.fieldX;
    target.fieldY = home.fieldY;
    target.ambientX = home.ambientX;
    target.ambientY = home.ambientY;
    target.glassX = home.glassX;
    target.glassY = home.glassY;
    target.glassProximity = 0;
    target.strength = tasking ? .58 : 1;
  }

  function onPointerLeave() {
    resetTargets();
    schedule();
  }

  function measureGlass() {
    if (destroyed) return;
    glassRect = glassPanel.getBoundingClientRect();
    if (pointerPresent && lastPointer) {
      updatePointerTargets(lastPointer.x, lastPointer.y);
      schedule();
    }
  }

  function onResize() {
    viewport = { width: window.innerWidth, height: window.innerHeight };
    home = createHome();
    glassRect = glassPanel.getBoundingClientRect();
    if (pointerPresent && lastPointer) updatePointerTargets(lastPointer.x, lastPointer.y);
    else resetTargets();
    schedule();
  }

  function syncTaskMode() {
    tasking = document.activeElement === username || document.activeElement === password;
    document.body.classList.toggle('is-tasking', tasking);
    target.strength = tasking ? .58 : 1;
    if (motionAllowed()) schedule();
    else render();
  }

  function onFocusOut() {
    queueMicrotask(syncTaskMode);
  }

  function applyCapability() {
    document.body.dataset.motion = motionAllowed() ? 'interactive' : 'static';
    if (!motionAllowed()) {
      cancel();
      resetTargets();
      snapToTargets();
      render();
    } else {
      measureGlass();
      schedule();
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      paused = true;
      resetTargets();
      cancel();
    } else {
      paused = false;
      measureGlass();
      schedule();
    }
  }

  function onPageHide(event) {
    cancel();
    if (event.persisted) paused = true;
    else destroy();
  }

  function onPageShow(event) {
    if (!event.persisted || destroyed) return;
    paused = false;
    onResize();
  }

  function addMediaListener(query, listener) {
    if (query.addEventListener) query.addEventListener('change', listener);
    else query.addListener(listener);
  }

  function removeMediaListener(query, listener) {
    if (query.removeEventListener) query.removeEventListener('change', listener);
    else query.removeListener(listener);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancel();
    resizeObserver?.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointercancel', onPointerLeave);
    window.removeEventListener('blur', onPointerLeave);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    document.documentElement.removeEventListener('pointerleave', onPointerLeave);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    form.removeEventListener('focusin', syncTaskMode);
    form.removeEventListener('focusout', onFocusOut);
    removeMediaListener(finePointer, applyCapability);
    removeMediaListener(reducedMotion, applyCapability);
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointercancel', onPointerLeave, { passive: true });
  window.addEventListener('blur', onPointerLeave);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  document.documentElement.addEventListener('pointerleave', onPointerLeave);
  document.addEventListener('visibilitychange', onVisibilityChange);
  form.addEventListener('focusin', syncTaskMode);
  form.addEventListener('focusout', onFocusOut);
  addMediaListener(finePointer, applyCapability);
  addMediaListener(reducedMotion, applyCapability);
  resizeObserver?.observe(glassPanel);
  render();
  applyCapability();

  return { destroy };
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
    } else if (error instanceof ApiError && error.isNetworkError) {
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

if (api.readSession()) {
  window.location.replace('index.html');
} else {
  createLoginMotion();
  requestAnimationFrame(() => document.body.classList.add('is-mounted'));
}
