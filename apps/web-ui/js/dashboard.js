/**
 * AgriLoop 新前端 · 主应用（Google Material 风格工作台）
 * 数据层：js/api.js（在线后端优先，离线使用显式标记的模拟数据）。
 */
import { api } from './api.js';
import { MOCK_DATA } from './mock-data.js';
import { icon } from './icons.js';
import { esc, badge, num, fmtDue, snackbar, confirmDialog, openDialog, alertDialog, PRIORITY_META } from './ui.js';
import { renderTrendChart, donutSVG, autoResize } from './charts.js';
import { renderToday, renderWork, renderRisk, renderBiz, openSettings, openHelp } from './views.js';

const state = {
  view: 'plots',
  plotId: 'plot-a01',
  range: '24h',
  plots: [],
  live: false,
  user: null,
  search: '',
  sysCollapsed: false,
  charts: [],
};

const NAV = [
  { id: 'today', icon: 'home', label: '今日', title: '今日农务' },
  { id: 'plots', icon: 'plots', label: '地块', title: '地块选择' },
  { id: 'work', icon: 'work', label: '农务', title: '农务中心' },
  { id: 'risk', icon: 'risk', label: '风险', title: '风险预测' },
  { id: 'biz', icon: 'biz', label: '经营', title: '经营价值' },
];

/* 演示口径常量（离线/在线均标注为模拟） */
const DEVICE_FLEET = { online: 18, total: 20 };
const CROP_IMG = {
  tomato: 'assets/crops/tomato.png', corn: 'assets/crops/corn.png', cucumber: 'assets/crops/cucumber.png',
  rice: 'assets/crops/rice.png', sunflower: 'assets/crops/sunflower.png', strawberry: 'assets/crops/strawberry.png',
};

/* ---------------- 工具 ---------------- */
export function parseTarget(target = '') {
  const m = String(target).match(/([\d.]+)\s*~\s*([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** 确定性灌溉建议（P0 扩展 irrigation_plan 演示口径，在线时以后端合同为准） */
export function computePlan(plot) {
  const m = plot?.metrics?.SOIL_MOISTURE;
  const range = parseTarget(m?.target);
  if (!m || !range || m.status === 'NORMAL' || m.value >= range[0]) return null;
  const mid = (range[0] + range[1]) / 2;
  const waterLitre = Math.max(30, Math.round((plot.areaM2 || 100) * (mid - m.value) * 0.1));
  const durationSeconds = Math.min(900, Math.round((waterLitre / 18) * 60));
  return {
    planId: `plan-${plot.plotId}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    plotId: plot.plotId, waterLitre, durationSeconds,
    zones: ['1区', '2区'], readiness: 'READY', provenance: state.live ? 'BACKEND' : 'SIMULATED',
  };
}

function mulberry32(seed) {
  let a = (Number(seed) || 0) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 1)) >>> 0) / 4294967296;
  };
}
function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; }

function metricBadge(m) {
  if (m.status === 'NORMAL') return badge('适宜', 'green');
  const range = parseTarget(m.target);
  if (range && m.value < range[0]) return badge('偏低', 'blue');
  if (range && m.value > range[1]) return badge('偏高', 'amber');
  return badge('告警', 'red');
}

function healthMeta(plot) {
  const score = Math.round((plot.healthScore ?? 0.9) * 100);
  const label = score >= 90 ? '良好' : score >= 75 ? '一般' : '需关注';
  const tone = score >= 90 ? 'green' : score >= 75 ? 'amber' : 'red';
  return { score, label, tone };
}

function warnMetric(plot) {
  return Object.entries(plot.metrics || {}).find(([, m]) => m.status && m.status !== 'NORMAL');
}

/* ---------------- 骨架渲染 ---------------- */
function renderRail() {
  document.getElementById('railLogo').innerHTML = `${icon('logo', 30)}<span>AgriLoop</span>`;
  document.getElementById('railNav').innerHTML = NAV.map(n =>
    `<button class="nav-item" data-view="${n.id}">${icon(n.icon, 20)}<span>${n.label}</span></button>`).join('');
  document.getElementById('railBottom').innerHTML =
    `<button class="nav-item" data-act="settings">${icon('settings', 20)}<span>设置</span></button>
     <button class="nav-item" data-act="help">${icon('help', 20)}<span>帮助</span></button>`;
  document.getElementById('railNav').addEventListener('click', e => {
    const btn = e.target.closest('[data-view]');
    if (btn) setView(btn.dataset.view);
  });
  document.getElementById('railBottom').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (btn?.dataset.act === 'settings') openSettings({ live: state.live });
    if (btn?.dataset.act === 'help') openHelp();
  });
}

function renderTopbar() {
  document.getElementById('searchBox').innerHTML =
    `${icon('search', 18)}<input id="searchInput" placeholder="搜索地块名称..." />`;
  document.getElementById('bellBtn').innerHTML = `${icon('bell', 20)}<i class="dot"></i>`;
  document.getElementById('searchInput').addEventListener('input', e => {
    state.search = e.target.value.trim();
    if (state.view === 'plots') renderPlotBar();
  });
  document.getElementById('bellBtn').addEventListener('click', showAlerts);
}

function renderUserChip() {
  const u = state.user || {};
  const name = u.roleLabel || (u.username === 'admin' ? '管理员' : u.username) || '用户';
  const el = document.getElementById('userChip');
  el.innerHTML = `<span class="avatar">${esc(String(name).slice(0, 1))}</span><span class="name">${esc(name)}</span>${icon('chevDown', 16)}`;
  el.onclick = () => openDialog({
    title: '账户',
    bodyHTML: `
      <div class="kv"><span>用户名</span><b>${esc(u.username || '--')}</b></div>
      <div class="kv"><span>角色</span><b>${esc(u.roleLabel || u.role || '--')}</b></div>
      <div class="kv"><span>会话模式</span><b>${state.live ? '实时（JWT）' : '离线演示'}</b></div>
      <div class="kv"><span>后端状态</span><b>${state.live ? '在线' : '离线'}</b></div>`,
    actions: [
      { label: '退出登录', tone: 'text', onClick: () => { api.logout(); location.replace(state.live ? 'login.html' : 'index.html'); } },
      { label: '关闭', tone: 'filled', onClick: () => {} },
    ],
  });
}

function showAlerts() {
  const alerts = state.plots.filter(p => p.riskLevel === 'HIGH' || warnMetric(p));
  if (!alerts.length) { snackbar('当前没有活跃告警'); return; }
  openDialog({
    title: `活跃告警（${alerts.length}）`,
    bodyHTML: alerts.map(p => {
      const [code, m] = warnMetric(p) || [null, null];
      return `<h4>${esc(p.name)} ${badge(p.riskLevel === 'HIGH' ? '高风险' : '关注', 'red')}</h4>
        <div class="kv"><span>${esc(m?.label || code || '风险')}</span><b>${num(m?.value)}${esc(m?.unit || '')}（适宜 ${esc(m?.target || '--')}）</b></div>`;
    }).join(''),
    actions: [{ label: '知道了', tone: 'filled', onClick: () => {} }],
  });
}

/* ---------------- 视图切换 ---------------- */
export function setView(id) {
  state.view = id;
  state.charts.forEach(c => c?.dispose?.());
  state.charts = [];
  document.querySelectorAll('#railNav .nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === id));
  const meta = NAV.find(n => n.id === id);
  document.getElementById('viewTitle').textContent = meta?.title || '';
  document.getElementById('plotBar').style.display = id === 'plots' ? 'flex' : 'none';
  document.getElementById('sysRail').style.display = id === 'plots' ? '' : 'none';
  const view = document.getElementById('view');
  view.scrollTop = 0;
  if (id === 'plots') { renderPlotBar(); renderWorkbench(); renderSysRail(); }
  else if (id === 'today') renderToday(state);
  else if (id === 'work') renderWork(state);
  else if (id === 'risk') renderRisk(state);
  else if (id === 'biz') renderBiz(state);
}

/* ---------------- 地块选择条 ---------------- */
function renderPlotBar() {
  const farm = MOCK_DATA.farms[0];
  const list = state.plots.filter(p => !state.search || p.name.includes(state.search) || (p.cropName || '').includes(state.search));
  document.getElementById('plotBar').innerHTML = `
    <button class="farm-select" id="farmBtn">${icon('home', 18, 'lead')}<span>${esc(farm.name)}</span>${icon('chevDown', 16)}</button>
    <div class="plot-chips">
      ${list.map(p => `<button class="chip ${p.plotId === state.plotId ? 'active' : ''}" data-plot="${p.plotId}">${esc(p.name.replace(/(示范田|高产田|立体架|精品区|花海|生态)/g, '').slice(0, 8) || p.name)}</button>`).join('')}
      <button class="chip ghost" id="addPlot">${icon('plus', 15)} 添加地块</button>
    </div>`;
  document.getElementById('farmBtn').onclick = () => alertDialog({
    title: '农场',
    bodyHTML: `
      <div class="kv"><span>名称</span><b>${esc(farm.name)}</b></div>
      <div class="kv"><span>区域</span><b>${esc(farm.region)}</b></div>
      <div class="kv"><span>地块数</span><b>${state.plots.length}</b></div>
      <div class="kv"><span>水价</span><b>${farm.waterPricePerLitre} 元/L</b></div>`,
  });
  document.getElementById('addPlot').onclick = () => alertDialog({
    title: '添加地块',
    bodyHTML: '本期演示环境的地块由后端与 Crop Pack 配置统一管理，前端暂不开放新建入口。可在 <b>crop-packs/</b> 中扩展作物包后由后端加载。',
  });
  document.querySelectorAll('[data-plot]').forEach(btn => btn.onclick = () => {
    state.plotId = btn.dataset.plot;
    renderPlotBar(); renderWorkbench(); renderSysRail();
  });
}

/* ---------------- 地块工作台 ---------------- */
function currentPlot() {
  return state.plots.find(p => p.plotId === state.plotId) || state.plots[0];
}

function renderWorkbench() {
  const plot = currentPlot();
  if (!plot) return;
  const health = healthMeta(plot);
  const [warnCode, warnM] = warnMetric(plot) || [null, null];
  const plan = computePlan(plot);
  const img = CROP_IMG[plot.cropCode] || CROP_IMG.tomato;
  const view = document.getElementById('view');

  view.innerHTML = `
    <section class="card">
      <div class="plot-head">
        <img class="plot-photo" src="${img}" alt="${esc(plot.cropName || plot.name)}" />
        <div class="plot-head-main">
          <div class="plot-title-row"><h2>${esc(plot.name)} 工作台</h2>${badge(plot.stageLabel || '生长期', 'green')}</div>
          <div class="plot-meta">
            <span>${icon('pin', 15)}${esc(plot.cropName || '--')} · ${esc(plot.cropVariety || '')}</span>
            <span>${icon('area', 15)}种植面积 ${num(plot.areaM2, 0)} m²</span>
            <span>${icon('clock', 15)}数据更新 ${esc(plot.lastSeen || '刚刚')}</span>
          </div>
          <div class="plot-head-lower">
            <div class="health-box">
              <div class="row">健康状态 ${badge(health.label, health.tone)}</div>
              <div class="progress"><i style="width:${health.score}%"></i></div>
              <div class="score">综合评分 ${health.score} / 100</div>
            </div>
            ${warnM ? `
            <div class="risk-banner">
              <div class="t">${icon('alertCircle', 18)}轻度${esc(warnM.label)}风险</div>
              <div class="d">${esc(warnM.label)}${num(warnM.value)}${esc(warnM.unit)}，${warnM.status === 'WARN' ? '低于' : '偏离'}适宜范围 ${esc(warnM.target)}，建议今日傍晚滴灌补水。</div>
              <button class="link" id="headRiskLink">查看详情 ${icon('chevRight', 14)}</button>
            </div>` : `
            <div class="risk-banner ok">
              <div class="t">${icon('check', 18)}运行正常</div>
              <div class="d">各项指标处于适宜范围，保持当前管理节奏即可。</div>
            </div>`}
          </div>
        </div>
      </div>
    </section>

    <div class="metric-grid">
      ${metricCard('drop', 'mi-blue', '土壤湿度', plot.metrics.SOIL_MOISTURE)}
      ${metricCard('thermo', 'mi-green', '空气温度', plot.metrics.AIR_TEMPERATURE)}
      ${metricCard('sun', 'mi-amber', '光照强度', plot.metrics.LIGHT)}
      <section class="card metric-card">
        <div class="head"><span class="metric-ic mi-purple">${icon('device', 20)}</span>设备状态</div>
        <div class="value-row"><span class="value">${DEVICE_FLEET.online}</span><span class="unit">/ ${DEVICE_FLEET.total} 在线</span>${badge('正常', 'green')}</div>
        <div class="foot">在线率 ${Math.round(DEVICE_FLEET.online / DEVICE_FLEET.total * 100)}%</div>
      </section>
    </div>

    <div class="tri-grid">
      <section class="card">
        <div class="card-title">近${state.range === '24h' ? '24小时' : state.range === '7d' ? '7天' : '30天'}趋势 ${icon('info', 15, 'muted-ic')}</div>
        <div class="chart-box" id="trendChart"></div>
        <div class="range-switch">
          ${['24h', '7d', '30d'].map(r => `<button class="range-btn ${r === state.range ? 'active' : ''}" data-range="${r}">${r === '24h' ? '24小时' : r === '7d' ? '7天' : '30天'}</button>`).join('')}
        </div>
      </section>
      <section class="card">
        <div class="card-title">待处理事项 <span id="taskCount"></span></div>
        <div class="task-list" id="taskList"><div class="empty">加载中…</div></div>
        <div class="center-link"><button class="link" id="allTasks">查看全部任务 ${icon('chevRight', 14)}</button></div>
      </section>
      <section class="card">
        <div class="card-title">风险诊断与建议</div>
        ${plan ? `
        <div class="diag-alert">
          <div style="color:var(--red);padding-top:2px">${icon('drop', 20)}</div>
          <div>
            <div class="t">检测到轻度缺水风险</div>
            <div class="d">近24小时土壤湿度低于适宜下限，若持续偏低将影响果实膨大。</div>
          </div>
        </div>
        <div class="advice-box">
          <div class="t">灌溉建议</div>
          <div class="s">建议今日傍晚滴灌补水</div>
          <div class="big">${num(plan.waterLitre, 0)} <small>L</small></div>
          <div class="meta">分区：${plan.zones.join('、')} ｜ 时长：${Math.round(plan.durationSeconds / 60)} 分钟</div>
          <div class="btns">
            <button class="btn btn-filled" id="dispatchBtn">一键下发灌溉</button>
            <button class="btn btn-outline" id="adjustBtn">调整方案</button>
          </div>
        </div>
        <div class="center-link"><button class="link" id="diagLink">查看诊断详情 ${icon('chevRight', 14)}</button></div>` : `
        <div class="advice-box" style="margin-top:14px">
          <div class="t">${icon('check', 16)} 运行正常</div>
          <div class="s" style="margin-top:8px">当前土壤湿度、温度与光照均处于 ${esc(plot.cropName || '作物')} ${esc(plot.stageLabel || '')} 适宜区间，暂无灌溉处方需求。</div>
          <div class="meta">规则版本 rule-1.0.0 ｜ 数据质量 GOOD</div>
        </div>
        <div class="center-link"><button class="link" id="diagLink">查看诊断详情 ${icon('chevRight', 14)}</button></div>`}
      </section>
    </div>`;

  view.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { state.range = b.dataset.range; renderWorkbench(); });
  view.querySelector('#allTasks')?.addEventListener('click', () => setView('work'));
  view.querySelector('#headRiskLink')?.addEventListener('click', () => setView('risk'));
  view.querySelector('#diagLink')?.addEventListener('click', () => showDiagnosis(plot));
  view.querySelector('#dispatchBtn')?.addEventListener('click', () => dispatchIrrigation(plot, plan));
  view.querySelector('#adjustBtn')?.addEventListener('click', () => adjustPlan(plot, plan));

  loadTasks(plot);
  loadTrend(plot);
}

function metricCard(icName, tone, label, m) {
  if (!m) return '';
  return `
  <section class="card metric-card">
    <div class="head"><span class="metric-ic ${tone}">${icon(icName, 20)}</span>${esc(m.label || label)}</div>
    <div class="value-row"><span class="value">${num(m.value, m.value >= 1000 ? 0 : 1)}</span><span class="unit">${esc(m.unit)}</span>${metricBadge(m)}</div>
    <div class="foot">适宜范围 ${esc(m.target || '--')}</div>
  </section>`;
}

async function loadTasks(plot) {
  const host = document.getElementById('taskList');
  const count = document.getElementById('taskCount');
  try {
    const items = await api.getTodayWorkItems(plot.plotId);
    count.innerHTML = badge(`${items.length} 项`, 'green');
    if (!items.length) { host.innerHTML = `<div class="empty">${icon('check', 26)}当前地块暂无待处理事项</div>`; return; }
    host.innerHTML = items.map(w => {
      const pm = PRIORITY_META[w.priority] || PRIORITY_META.LOW;
      const ic = /IRRIG/.test(w.actionType) ? ['drop', 'mi-purple'] : w.actionType === 'INSPECTION' ? ['sprout', 'mi-green'] : w.actionType === 'DEVICE_CHECK' ? ['device', 'mi-gray'] : ['fert', 'mi-green'];
      return `
      <div class="task-item">
        <span class="t-ic ${ic[1]}">${icon(ic[0], 18)}</span>
        <div class="t-main">
          <div class="t-title">${badge(pm.label, pm.tone)}${esc(w.title)}</div>
          <div class="t-sub">${esc(w.reason || '')}</div>
        </div>
        <div class="t-due">${fmtDue(w.dueAt)}</div>
      </div>`;
    }).join('');
  } catch (e) {
    host.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

async function loadTrend(plot) {
  const el = document.getElementById('trendChart');
  if (!el) return;
  let moisture, temperature;
  if (state.range === '24h') {
    const [m, t] = await Promise.all([
      api.getTelemetry(plot.plotId, 'SOIL_MOISTURE').catch(() => []),
      api.getTelemetry(plot.plotId, 'AIR_TEMPERATURE').catch(() => []),
    ]);
    moisture = m.map(p => ({ label: fmtHM(p.ts), value: p.value }));
    temperature = t.map(p => ({ label: fmtHM(p.ts), value: p.value }));
  } else {
    ({ moisture, temperature } = synthTrend(plot, state.range));
  }
  const chart = renderTrendChart(el, moisture, temperature);
  if (chart) state.charts.push(chart, autoResize(chart));
}

function fmtHM(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function synthTrend(plot, range) {
  const days = range === '7d' ? 7 : 30;
  const rnd = mulberry32(hashCode(plot.plotId + range));
  const mBase = plot.metrics.SOIL_MOISTURE?.value ?? 25;
  const tBase = plot.metrics.AIR_TEMPERATURE?.value ?? 26;
  const moisture = [], temperature = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    moisture.push({ label, value: Number((mBase + Math.sin(i / 2.2) * 2.4 + (rnd() - 0.5) * 1.6).toFixed(1)) });
    temperature.push({ label, value: Number((tBase + Math.cos(i / 2.6) * 2.2 + (rnd() - 0.5) * 1.4).toFixed(1)) });
  }
  return { moisture, temperature };
}

/* ---------------- 灌溉下发 / 调整 / 诊断 ---------------- */
async function dispatchIrrigation(plot, plan) {
  if (!plan) return;
  const ok = await confirmDialog({
    title: '下发虚拟灌溉命令',
    bodyHTML: `
      <div class="kv"><span>地块</span><b>${esc(plot.name)}</b></div>
      <div class="kv"><span>计划编号</span><b>${esc(plan.planId)}</b></div>
      <div class="kv"><span>补水量</span><b>${num(plan.waterLitre, 0)} L</b></div>
      <div class="kv"><span>时长</span><b>${Math.round(plan.durationSeconds / 60)} 分钟（安全上限 15 分钟）</b></div>
      <div class="kv"><span>分区</span><b>${plan.zones.join('、')}</b></div>
      <div class="kv"><span>幂等保护</span><b>已启用（冷却 120 分钟）</b></div>`,
    confirmText: '确认下发',
  });
  if (!ok) return;
  try {
    const res = await api.executeIrrigation(plan.planId, plot.plotId);
    const ackStatus = res.ack?.status || res.status;
    if (ackStatus === 'SUCCEEDED') {
      snackbar(`灌溉执行成功：实际用水 ${num(res.ack?.actualWaterLitre ?? res.waterLitre, 0)} L，效果评分 ${num((res.evaluation?.effectivenessScore ?? 0) * 100, 0)}%`, { tone: 'green' });
    } else {
      snackbar(`灌溉命令返回非成功状态：${esc(ackStatus || 'UNKNOWN')}`, { tone: 'red' });
    }
  } catch (e) {
    snackbar(`下发失败：${e.message}`, { tone: 'red' });
  }
}

function adjustPlan(plot, plan) {
  if (!plan) return;
  openDialog({
    title: '调整灌溉方案',
    bodyHTML: `
      <div class="field" style="margin-bottom:12px"><label>补水量（L，上限 900s 对应约 270L）</label>
        <input id="adjWater" type="number" min="30" max="270" step="10" value="${plan.waterLitre}" /></div>
      <div class="kv"><span>预计时长</span><b id="adjDur">${Math.round(plan.durationSeconds / 60)} 分钟</b></div>
      <div class="kv"><span>硬安全门</span><b>时长 ≤ 900s · 冷却 120min · 日限额 5000L</b></div>
      <div class="kv"><span>口径</span><b>${plan.provenance === 'BACKEND' ? '后端合同' : 'SIMULATED 演示'}</b></div>`,
    actions: [
      { label: '取消', tone: 'text', onClick: () => {} },
      {
        label: '按新方案下发', tone: 'filled', onClick: () => {
          const litres = Math.max(30, Math.min(270, Number(document.getElementById('adjWater')?.value) || plan.waterLitre));
          dispatchIrrigation(plot, { ...plan, waterLitre: litres, durationSeconds: Math.min(900, Math.round(litres / 18 * 60)) });
        },
      },
    ],
  });
  document.getElementById('adjWater')?.addEventListener('input', e => {
    const l = Number(e.target.value) || 0;
    const el = document.getElementById('adjDur');
    if (el) el.textContent = `${Math.round(Math.min(900, (l / 18) * 60) / 60)} 分钟`;
  });
}

function showDiagnosis(plot) {
  const [code, m] = warnMetric(plot) || [null, null];
  const feed = MOCK_DATA.feedItems.find(f => f.type === 'DIAGNOSIS' && f.plotId === plot.plotId);
  const detail = feed?.details;
  const body = m ? `
    <div class="kv"><span>首要根因</span><b>${esc(detail?.primaryCause || 'WATER_DEFICIT（真实土壤缺水）')}</b></div>
    <div class="kv"><span>置信度</span><b>${num((detail?.confidence ?? 0.92) * 100, 0)}%</b></div>
    <div class="kv"><span>传感器漂移评分</span><b>${num(detail?.sensorDriftScore ?? 0.08, 2)}（已排除漂移）</b></div>
    <h4>支持证据</h4>
    ${(detail?.supportingEvidence || [`${m.label} ${num(m.value)}${m.unit}，低于适宜下限`, '数据新鲜度与质量 GOOD', '设备在线']).map(e => `<div>· ${esc(e)}</div>`).join('')}
    <h4>反对证据</h4>
    ${(detail?.opposingEvidence || ['无突发阶跃跳变']).map(e => `<div>· ${esc(e)}</div>`).join('')}
    <div style="margin-top:10px"><span class="prov-tag">证据范围：PLOT · ${esc(plot.name)}</span> <span class="prov-tag">provenance: SIMULATION</span></div>`
    : `<div>各项指标处于适宜区间，未触发风险规则。</div><div class="kv"><span>规则版本</span><b>rule-1.0.0</b></div>`;
  alertDialog({ title: `风险诊断 · ${plot.name}`, bodyHTML: body, okText: '关闭' });
}

/* ---------------- 右侧系统栏 ---------------- */
function renderSysRail() {
  const rail = document.getElementById('sysRail');
  const rp = MOCK_DATA.resourceProfile;
  const usedPct = Math.round(rp.usedTodayLitres / rp.dailyLimitLitres * 100);
  const devPct = Math.round(DEVICE_FLEET.online / DEVICE_FLEET.total * 100);
  rail.classList.toggle('collapsed', state.sysCollapsed);
  rail.innerHTML = `
    <div class="sys-head">
      <button class="icon-btn" id="sysToggle" style="width:28px;height:28px" aria-label="${state.sysCollapsed ? '展开' : '收起'}">${icon('collapse', 16, state.sysCollapsed ? 'flip' : '')}</button>
      <span class="sys-title">系统信息</span> <span class="muted">（可收回）</span>
    </div>
    <div id="sysBody">
      <div class="sys-card">
        <div class="row"><span class="metric-ic ${state.live ? 'mi-green' : 'mi-amber'}" style="width:34px;height:34px">${icon('cloud', 18)}</span>${state.live ? '后端在线' : '后端离线'}</div>
        <div class="sub" style="color:${state.live ? 'var(--primary)' : 'var(--amber)'}">${state.live ? '运行正常' : '离线演示模式'}</div>
        <div class="muted">${state.live ? '最后心跳：刚刚' : '使用本地模拟数据，等待后端连接'}</div>
      </div>
      <div class="sys-card">
        <div class="row">设备在线率</div>
        <div class="center" style="margin-top:10px">${donutSVG(devPct, { size: 92 })}
          <div style="font-weight:600">${DEVICE_FLEET.online} / ${DEVICE_FLEET.total} 在线</div>
          <div class="red">${DEVICE_FLEET.total - DEVICE_FLEET.online} 离线设备</div>
        </div>
      </div>
      <div class="sys-card">
        <div class="row">今日水资源</div>
        <div class="big" style="margin-top:10px"><span class="metric-ic mi-blue" style="width:30px;height:30px">${icon('drop', 16)}</span>${num(rp.usedTodayLitres, 0)} <small>L</small></div>
        <div class="muted" style="margin-top:4px">计划 ${num(rp.dailyLimitLitres, 0)} L</div>
        <div class="prow"><div class="progress blue" style="flex:1"><i style="width:${usedPct}%"></i></div><span class="pct">${usedPct}%</span></div>
      </div>
      <div class="sys-card">
        <div class="row"><span class="metric-ic mi-green" style="width:34px;height:34px">${icon('chat', 18)}</span>消息 / 日志</div>
        <div class="sub" style="color:var(--on-surface)">${MOCK_DATA.feedItems.length} 条未读</div>
        <button class="link" id="msgLink" style="margin-top:6px">查看系统消息与操作日志 ${icon('chevRight', 14)}</button>
      </div>
      <div class="sys-card">
        <div class="row"><span class="metric-ic mi-green" style="width:34px;height:34px">${icon('chip', 18)}</span>AI 状态</div>
        <div class="sub" style="color:var(--on-surface)">${state.live ? '分析中' : '规则模式（LLM 未接入）'}</div>
        <div class="muted">模型版本 ${esc(MOCK_DATA.riskForecastConfig.algorithmVersion)}</div>
        <div class="muted">置信度 92%</div>
      </div>
    </div>`;
  rail.querySelector('#sysToggle').onclick = () => {
    state.sysCollapsed = !state.sysCollapsed;
    renderSysRail();
  };
  rail.querySelector('#msgLink')?.addEventListener('click', () => openDialog({
    title: '系统消息与操作日志',
    bodyHTML: MOCK_DATA.changelog.map(c => `<h4>${esc(c.time)} · ${esc(c.tag)}</h4><div><b style="color:var(--on-surface)">${esc(c.title)}</b><br>${esc(c.content)}</div>`).join(''),
    actions: [{ label: '关闭', tone: 'filled', onClick: () => {} }],
  }));
}

/* ---------------- 启动 ---------------- */
async function boot() {
  renderRail();
  renderTopbar();
  state.live = await api.checkHealth();
  if (state.live) {
    const u = await api.restoreSession();
    if (!u) { location.replace('login.html'); return; }
    state.user = u;
  } else {
    if (!api.readSession()) api.saveSession({ mode: 'demo', user: MOCK_DATA.currentUser });
    state.user = api.getUser() || MOCK_DATA.currentUser;
  }
  renderUserChip();
  try { state.plots = await api.getPlots(); } catch (e) { state.plots = []; }
  if (!state.plots?.length) state.plots = MOCK_DATA.plots;
  setView('plots');
}

boot();
