/**
 * AgriLoop Frontend - 全局 ⌘K 命令面板（任务包 5 · 快捷键系统）
 * 按 ⌘K / Ctrl+K / "/" 呼出毛玻璃搜索面板：
 *   - 实时过滤：地块 / 功能视图 / 作物包 / 规则 / 关键动态
 *   - ↑↓ 选择、Enter 跳转、ESC 关闭
 * 通过 app 实例的公开方法执行跳转（selectPlot / openSubview）
 */
import { MOCK_DATA } from './mock-data.js?v=20260824-module-v5';

/** 作物图标映射（与 crop-packs 视图一致） */
const CROP_EMOJI = { tomato: '🍅', cucumber: '🥒', strawberry: '🍓', pepper: '🌶️' };

export function initCommandPalette(app) {
  let items = [];
  let activeIndex = 0;

  const backdrop = document.getElementById('cmdPaletteBackdrop');
  const input = document.getElementById('cmdInput');
  const resultsEl = document.getElementById('cmdResults');
  if (!backdrop || !input || !resultsEl) return () => {};

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** 构建可搜索条目（打开面板时刷新） */
  const buildItems = () => {
    items = [];
    (app.state.plots || MOCK_DATA.plots).forEach(p => {
      items.push({
        group: '地块',
        icon: CROP_EMOJI[p.cropCode] || '🌾',
        title: p.name,
        sub: `${p.cropName} · ${p.stageLabel} · 湿度 ${p.metrics.SOIL_MOISTURE.value}%`,
        keywords: `${p.name} ${p.cropName} ${p.plotId} ${p.cropCode}`,
        run: () => app.selectPlot(p.plotId)
      });
    });
    Object.entries(MOCK_DATA.subviewsMeta).forEach(([view, meta]) => {
      items.push({
        group: '功能视图',
        icon: app.getViewIcon(view),
        title: meta.title,
        sub: (meta.tags || []).join(' · '),
        keywords: `${view} ${meta.title} ${meta.desc}`,
        run: () => app.openSubview(view, { plotId: app.state.currentPlotId })
      });
    });
    MOCK_DATA.cropPackDetails.forEach(p => {
      items.push({
        group: '作物包',
        icon: CROP_EMOJI[p.cropCode] || '🌾',
        title: `${p.identity.name} Pack v${p.version}`,
        sub: `${p.ruleVersion} · ${p.knowledgeVersion} · ${p.stages.length} 阶段`,
        keywords: `${p.cropCode} ${p.identity.name} pack`,
        run: () => app.openSubview('crop-packs')
      });
    });
    MOCK_DATA.cropPackDetails.flatMap(p => p.rules.map(r => ({ ...r, cropName: p.identity.name }))).forEach(r => {
      items.push({
        group: '规则',
        icon: '⚖️',
        title: `${r.code} · ${r.metric} ${r.operator} ${r.threshold}`,
        sub: `${r.cropName} · 冷却 ${r.cooldownMinutes}min`,
        keywords: `${r.code} ${r.metric} ${r.cropName}`,
        run: () => app.openSubview('crop-packs')
      });
    });
    (app.state.feedItems || MOCK_DATA.feedItems).forEach(f => {
      items.push({
        group: '关键动态',
        icon: f.badge?.color === 'green' ? '✅' : f.badge?.color === 'amber' ? '⚠️' : '📌',
        title: f.title,
        sub: f.category,
        keywords: `${f.title} ${f.summary} ${f.plotName}`,
        run: () => app.navigate('decision-feed')
      });
    });
  };

  const filter = (kw) => {
    const q = kw.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it => `${it.title} ${it.sub} ${it.keywords}`.toLowerCase().includes(q));
  };

  const render = (kw) => {
    const list = filter(kw);
    activeIndex = Math.min(activeIndex, Math.max(list.length - 1, 0));
    if (!list.length) {
      resultsEl.innerHTML = `<div class="cmd-empty">未找到匹配项：<b>${esc(kw)}</b></div>`;
      return;
    }
    resultsEl.innerHTML = list.map((it, i) => `
      <div class="cmd-item ${i === activeIndex ? 'active' : ''}" data-idx="${i}">
        <span class="cmd-item-icon">${it.icon}</span>
        <div class="cmd-item-main">
          <div class="cmd-item-title">${esc(it.title)}</div>
          <div class="cmd-item-sub">${esc(it.sub)}</div>
        </div>
        <span class="cmd-item-group">${esc(it.group)}</span>
      </div>
    `).join('');
    resultsEl.querySelectorAll('.cmd-item').forEach(el => {
      el.addEventListener('click', () => runItem(Number(el.dataset.idx)));
      el.addEventListener('mousemove', () => {
        activeIndex = Number(el.dataset.idx);
        resultsEl.querySelectorAll('.cmd-item').forEach(x => x.classList.toggle('active', Number(x.dataset.idx) === activeIndex));
      });
    });
  };

  const runItem = (idx) => {
    const list = filter(input.value);
    const it = list[idx];
    if (!it) return;
    close();
    try { it.run(); } catch (e) { console.warn('Command palette action failed:', e); }
  };

  const open = () => {
    buildItems();
    activeIndex = 0;
    input.value = '';
    render('');
    backdrop.classList.add('active');
    input.focus();
  };

  const close = () => {
    backdrop.classList.remove('active');
  };

  const onKey = (e) => {
    const isOpen = backdrop.classList.contains('active');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      isOpen ? close() : open();
      return;
    }
    if (e.key === '/' && !isOpen && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      open();
      return;
    }
    if (!isOpen) return;
    const list = filter(input.value);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, Math.max(list.length - 1, 0)); render(input.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); render(input.value); }
    else if (e.key === 'Enter') { e.preventDefault(); runItem(activeIndex); }
  };

  input.addEventListener('input', () => { activeIndex = 0; render(input.value); });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  window.addEventListener('keydown', onKey);

  return () => {
    window.removeEventListener('keydown', onKey);
  };
}
