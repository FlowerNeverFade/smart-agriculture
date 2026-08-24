/**
 * AgriLoop 新前端 · 基础 UI 组件（Material 风格）
 * snackbar / dialog / badge / 格式化工具。
 * 安全约定：所有外部数据（用户输入/网络响应/存储）进入 innerHTML 前必须经 esc() 转义。
 */
import { icon } from './icons.js';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 状态徽章：tone = green|blue|red|amber|purple|gray */
export function badge(text, tone = 'gray') {
  return `<span class="badge b-${tone}">${esc(text)}</span>`;
}

export function num(v, digits = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** ISO 时间 -> 今天 18:00 / 明天 09:00 / 后天 10:00 / 08-30 10:00 */
export function fmtDue(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso || '--');
  const now = new Date();
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - day0) / 86400000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `明天 ${hm}`;
  if (diff === 2) return `后天 ${hm}`;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hm}`;
}

export const PRIORITY_META = {
  HIGH: { label: '高', tone: 'red' },
  MEDIUM: { label: '中', tone: 'amber' },
  LOW: { label: '低', tone: 'blue' },
};

export const WO_STATUS_META = {
  OPEN: { label: '待处理', tone: 'red' },
  ASSIGNED: { label: '已指派', tone: 'blue' },
  IN_PROGRESS: { label: '进行中', tone: 'amber' },
  DONE: { label: '已完成', tone: 'green' },
  CLOSED: { label: '已关闭', tone: 'gray' },
};

/* ---------------- Snackbar ---------------- */
export function snackbar(text, { tone = 'dark', timeout = 4200 } = {}) {
  let host = document.querySelector('.snack-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'snack-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `snackbar sn-${tone}`;
  el.innerHTML = `<span>${esc(text)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }, timeout);
}

/* ---------------- Dialog ---------------- */
/**
 * openDialog({ title, bodyHTML, actions }) -> 关闭函数
 * actions: [{ label, tone('filled'|'outline'|'text'), close=true, onClick }]
 */
export function openDialog({ title = '', bodyHTML = '', actions = [] } = {}) {
  let scrim = document.querySelector('.dialog-scrim');
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.className = 'dialog-scrim';
    document.body.appendChild(scrim);
  }
  const dlg = document.createElement('div');
  dlg.className = 'dialog';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  const btns = actions.map((a, i) =>
    `<button class="btn btn-${a.tone || 'text'}" data-act="${i}">${esc(a.label)}</button>`).join('');
  dlg.innerHTML = `
    <div class="dialog-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="关闭">${icon('x', 18)}</button></div>
    <div class="dialog-body">${bodyHTML}</div>
    ${btns ? `<div class="dialog-actions">${btns}</div>` : ''}`;
  const close = () => {
    dlg.remove();
    if (!scrim.querySelector('.dialog')) scrim.classList.remove('on');
  };
  dlg.querySelector('[data-close]')?.addEventListener('click', close);
  actions.forEach((a, i) => {
    dlg.querySelector(`[data-act="${i}"]`)?.addEventListener('click', async () => {
      const r = a.onClick?.({ close });
      if (a.close !== false) close();
      await r;
    });
  });
  scrim.classList.add('on');
  scrim.appendChild(dlg);
  return close;
}

/** 确认对话框，返回 Promise<boolean> */
export function confirmDialog({ title, bodyHTML, confirmText = '确认', tone = 'filled' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    openDialog({
      title, bodyHTML,
      actions: [
        { label: '取消', tone: 'text', onClick: () => { done = true; resolve(false); } },
        { label: confirmText, tone, onClick: () => { done = true; resolve(true); } },
      ],
    });
    // 点击遮罩关闭视为取消
    const scrim = document.querySelector('.dialog-scrim');
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim && !done) { done = true; resolve(false); }
    }, { once: true });
  });
}

/** 信息对话框 */
export function alertDialog({ title, bodyHTML, okText = '知道了' } = {}) {
  return openDialog({ title, bodyHTML, actions: [{ label: okText, tone: 'filled', onClick: () => {} }] });
}
