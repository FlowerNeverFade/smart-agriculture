/**
 * AgriLoop 新前端 · 登录页逻辑
 * 在线：JWT 登录；离线：显式进入本地演示会话（不伪装为真实登录）。
 */
import { api } from './api.js';
import { MOCK_DATA } from './mock-data.js';
import { icon } from './icons.js';
import { esc } from './ui.js';

const note = document.getElementById('loginNote');
const setNote = (html, tone = '') => {
  note.innerHTML = html;
  note.style.color = tone === 'red' ? 'var(--red)' : tone === 'green' ? 'var(--primary-strong)' : '';
};

document.getElementById('brand').innerHTML =
  `${icon('logo', 44)}<div class="t">AgriLoop</div><div class="s">农智闭环 · 智慧农业工作台</div>`;

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) { setNote('请输入用户名和密码。', 'red'); return; }
  btn.disabled = true; btn.textContent = '验证中…';
  try {
    const live = await api.checkHealth();
    if (!live) { setNote('后端不在线，无法验证账号。可点击“进入离线演示”。', 'red'); return; }
    await api.login({ username, password });
    location.replace('index.html');
  } catch (err) {
    setNote(`登录失败：${esc(err.message)}`, 'red');
  } finally {
    btn.disabled = false; btn.textContent = '登录';
  }
});

document.getElementById('demoBtn').addEventListener('click', async () => {
  const live = await api.checkHealth();
  if (live) { setNote('后端在线，请使用账号登录（演示会话仅用于离线）。', 'red'); return; }
  api.saveSession({ mode: 'demo', user: MOCK_DATA.currentUser });
  setNote('已进入离线演示模式。', 'green');
  setTimeout(() => location.replace('index.html'), 350);
});
