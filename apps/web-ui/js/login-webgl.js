const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const roles = {
  admin: { role: 'FARM_ADMIN', label: '农场管理员' },
  farmer: { role: 'FARMER', label: '种植农户' },
  operator: { role: 'FIELD_OPERATOR', label: '田间操作员' },
  sysadmin: { role: 'SYSTEM_ADMIN', label: '系统管理员' }
};

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
    username.value = account;
    password.value = 'demo123';
    demoPanel.hidden = true;
    demoToggle.setAttribute('aria-expanded', 'false');
    formError.textContent = '';
    showToast('已选择' + roles[account].label);
    username.focus();
  });
});

forgotPassword.addEventListener('click', () => showToast('演示环境暂不发送重置邮件'));

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const account = username.value.trim();
  if (!account || !password.value) {
    formError.textContent = '请输入账号和密码';
    (!account ? username : password).focus();
    return;
  }

  formError.textContent = '';
  submitButton.disabled = true;
  submitButton.classList.add('is-loading');
  const selected = roles[account] || roles.admin;
  localStorage.setItem('agriloop_user', JSON.stringify({
    username: account,
    role: selected.role,
    roleLabel: selected.label,
    avatar: ''
  }));

  window.setTimeout(() => {
    showToast('欢迎进入' + selected.label + '工作台');
    window.setTimeout(() => { window.location.href = 'index.html'; }, reducedMotion ? 100 : 500);
  }, reducedMotion ? 100 : 520);
});

let toastTimer;
function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

requestAnimationFrame(() => document.body.classList.add('is-mounted'));
