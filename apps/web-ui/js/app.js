/**
 * AgriLoop 前端 · Vue 3 工作台
 * 在线：数据全部来自后端 /api/v1 合同；离线：回落 main 模拟数据（显式 SIMULATED 口径）。
 * 前端只负责展示与发送操作，不持有业务决策逻辑。
 */
import { api, ApiError } from './api.js';
import { icon } from './icons.js';

/* ---------------- 展示层常量（文案/图标映射，非数据） ---------------- */
const METRIC_META = {
  SOIL_MOISTURE: { label: '土壤湿度', icon: 'drop', tone: 'mi-blue' },
  AIR_TEMPERATURE: { label: '空气温度', icon: 'thermo', tone: 'mi-green' },
  LIGHT: { label: '光照强度', icon: 'sun', tone: 'mi-amber' },
  CO2: { label: 'CO2 浓度', icon: 'cloud', tone: 'mi-purple' },
  PH: { label: 'pH', icon: 'info', tone: 'mi-gray' },
  WATER_LEVEL: { label: '水位', icon: 'water', tone: 'mi-blue' },
};
const STAGE_LABEL = { seedling: '苗期', vegetative: '营养生长期', flowering: '开花坐果期', fruiting: '挂果采收期' };
const ROLE_LABEL = { FARM_ADMIN: '农场管理员', SYSTEM_ADMIN: '系统管理员', FARMER: '种植农户', FIELD_OPERATOR: '田间操作员' };
const PRIORITY_META = { HIGH: { label: '高', tone: 'red' }, MEDIUM: { label: '中', tone: 'amber' }, LOW: { label: '低', tone: 'blue' } };
const WO_STATUS_META = { OPEN: { label: '待处理', tone: 'red' }, ASSIGNED: { label: '已指派', tone: 'blue' }, IN_PROGRESS: { label: '进行中', tone: 'amber' }, DONE: { label: '已完成', tone: 'green' }, CANCELLED: { label: '已取消', tone: 'gray' }, CLOSED: { label: '已关闭', tone: 'gray' } };
const CROP_IMG = { tomato: 'assets/crops/tomato.png', cucumber: 'assets/crops/cucumber.png', corn: 'assets/crops/corn.png', rice: 'assets/crops/rice.png', sunflower: 'assets/crops/sunflower.png', strawberry: 'assets/crops/strawberry.png' };
const SCENARIOS = [
  { code: 'DROUGHT', label: '持续干旱', emoji: '☀️' },
  { code: 'HEAT_WAVE', label: '极端热浪', emoji: '🔥' },
  { code: 'STORM', label: '暴雨积水', emoji: '🌧️' },
  { code: 'SENSOR_DRIFT', label: '传感器零点漂移', emoji: '⚠️' },
  { code: 'OFFLINE', label: '设备断网离线', emoji: '🔌' },
];
const NAV = [
  { id: 'today', icon: 'home', label: '今日', title: '今日农务' },
  { id: 'plots', icon: 'plots', label: '地块', title: '地块选择' },
  { id: 'work', icon: 'work', label: '农务', title: '农务中心' },
  { id: 'risk', icon: 'risk', label: '风险', title: '风险预测' },
  { id: 'biz', icon: 'biz', label: '经营', title: '经营价值' },
];

/* ---------------- 小工具 ---------------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 1) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('zh-CN', { maximumFractionDigits: d }) : '--'; };
function fmtDue(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  const now = new Date();
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - day0) / 86400000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `明天 ${hm}`;
  if (diff === 2) return `后天 ${hm}`;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hm}`;
}
function donutSVG(pct, { size = 92, stroke = 9, color = '#1e8e3e' } = {}) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const f = Math.max(0, Math.min(100, pct)) / 100;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#e6e9e7" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" style="font:600 ${Math.round(size / 5.6)}px sans-serif;fill:#202124">${Math.round(pct)}%</text></svg>`;
}
const errText = (e) => (e instanceof ApiError ? e.message : (e?.message || '加载失败'));

/* ---------------- ECharts 选项 ---------------- */
const AXIS = { color: '#5f6368', fontSize: 11 };
function trendOption(m, t) {
  return {
    color: ['#1a73e8', '#1e8e3e'],
    textStyle: { fontFamily: 'inherit' },
    tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#dadce0', textStyle: { color: '#202124', fontSize: 12 } },
    legend: { top: 0, left: 0, itemWidth: 14, itemHeight: 3, icon: 'roundRect', textStyle: { ...AXIS, color: '#3c4043' } },
    grid: { left: 40, right: 40, top: 30, bottom: 28 },
    xAxis: { type: 'category', boundaryGap: false, data: m.map(p => p.label), axisLine: { lineStyle: { color: '#dadce0' } }, axisTick: { show: false }, axisLabel: { ...AXIS, interval: Math.max(0, Math.ceil(m.length / 6) - 1) } },
    yAxis: [
      { type: 'value', name: '%', nameTextStyle: AXIS, axisLabel: AXIS, splitLine: { lineStyle: { color: '#f1f3f4' } } },
      { type: 'value', name: '°C', nameTextStyle: AXIS, axisLabel: AXIS, splitLine: { show: false } },
    ],
    series: [
      { name: '土壤湿度（%）', type: 'line', smooth: 0.25, symbol: 'circle', symbolSize: 4, lineStyle: { width: 2 }, data: m.map(p => p.value) },
      { name: '空气温度（°C）', type: 'line', smooth: 0.25, symbol: 'circle', symbolSize: 4, yAxisIndex: 1, lineStyle: { width: 2 }, data: t.map(p => p.value) },
    ],
  };
}
function compareOption(cmp) {
  const exec = cmp?.branches?.EXECUTE?.points || [];
  const noAct = cmp?.branches?.NO_ACTION?.points || [];
  return {
    textStyle: { fontFamily: 'inherit' },
    tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#dadce0', textStyle: { color: '#202124', fontSize: 12 } },
    legend: { top: 0, left: 0, itemWidth: 14, itemHeight: 3, icon: 'roundRect', textStyle: { ...AXIS, color: '#3c4043' } },
    grid: { left: 40, right: 20, top: 30, bottom: 28 },
    xAxis: { type: 'category', boundaryGap: false, data: exec.map(p => `${p.minute}m`), axisLine: { lineStyle: { color: '#dadce0' } }, axisTick: { show: false }, axisLabel: { ...AXIS, interval: 5 } },
    yAxis: { type: 'value', name: '%', nameTextStyle: AXIS, axisLabel: AXIS, splitLine: { lineStyle: { color: '#f1f3f4' } } },
    series: [
      { name: '执行灌溉', type: 'line', showSymbol: false, smooth: 0.2, lineStyle: { width: 2, color: '#1e8e3e' }, itemStyle: { color: '#1e8e3e' }, data: exec.map(p => p.value) },
      { name: '不采取措施', type: 'line', showSymbol: false, smooth: 0.2, lineStyle: { width: 2, color: '#d93025' }, itemStyle: { color: '#d93025' }, data: noAct.map(p => p.value) },
    ],
  };
}
function barOption(rows) {
  return {
    color: ['#9aa0a6', '#1e8e3e'],
    textStyle: { fontFamily: 'inherit' },
    tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#dadce0', textStyle: { color: '#202124', fontSize: 12 } },
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, icon: 'roundRect', textStyle: { ...AXIS, color: '#3c4043' } },
    grid: { left: 44, right: 12, top: 30, bottom: 28 },
    xAxis: { type: 'category', data: rows.map(r => r.label), axisLine: { lineStyle: { color: '#dadce0' } }, axisTick: { show: false }, axisLabel: AXIS },
    yAxis: { type: 'value', name: 'L', nameTextStyle: AXIS, axisLabel: AXIS, splitLine: { lineStyle: { color: '#f1f3f4' } } },
    series: [
      { name: '计划用水', type: 'bar', barWidth: 6, itemStyle: { borderRadius: 3 }, data: rows.map(r => r.planned) },
      { name: '实际用水', type: 'bar', barWidth: 6, itemStyle: { borderRadius: 3 }, data: rows.map(r => r.actual) },
    ],
  };
}

/* ---------------- Vue 应用 ---------------- */
const { createApp } = window.Vue;

const app = createApp({
  data() {
    return {
      view: 'plots', search: '', live: false, user: null, booted: false,
      farms: [], plots: [], overview: null, batches: [], packs: [], devices: [], alerts: [], sysStatus: null, resource: null,
      shellErr: '',
      plotId: '', range: '24h',
      trend: { m: [], t: [] }, trendErr: '',
      workItems: [], workErr: '',
      forecast: null, plan: null, diagErr: '',
      workOrders: [], inspections: [], workPageErr: '',
      forecasts: {},
      ledger: [], planActuals: [], bizErr: '',
      sysCollapsed: false,
      dialog: null, snacks: [],
      NAV, SCENARIOS,
    };
  },
  computed: {
    viewTitle() { return NAV.find(n => n.id === this.view)?.title || ''; },
    filteredPlots() {
      const q = this.search.trim();
      return this.plots.filter(p => !q || (p.name || '').includes(q) || (p.plotId || '').toLowerCase().includes(q.toLowerCase()));
    },
    farm() { return this.farms[0] || null; },
    currentPlot() { return this.plots.find(p => p.plotId === this.plotId) || this.plots[0] || null; },
    card() { return this.overview?.plots?.find(c => c.plotId === (this.currentPlot?.plotId)) || null; },
    batch() { return this.batches.find(b => b.plotId === this.currentPlot?.plotId) || null; },
    pack() { return this.packs.find(p => p.cropCode === this.currentPlot?.cropCode) || null; },
    cropName() { return this.pack?.name || this.currentPlot?.cropCode || '--'; },
    stageLabel() { return STAGE_LABEL[this.batch?.stageCode] || this.batch?.stageCode || '--'; },
    cropImg() { return CROP_IMG[this.currentPlot?.cropCode] || CROP_IMG.tomato; },
    deviceStats() {
      const total = this.devices.length;
      const online = this.devices.filter(d => String(d.status || '').toUpperCase() === 'ONLINE').length;
      return { total, online, pct: total ? Math.round((online / total) * 100) : 0, offline: total - online };
    },
    healthMeta() {
      const score = Math.round(Number(this.card?.device?.healthScore ?? 0) * 100);
      if (!Number.isFinite(score) || score <= 0) return null;
      return { score, label: score >= 90 ? '良好' : score >= 75 ? '一般' : '需关注', tone: score >= 90 ? 'green' : score >= 75 ? 'amber' : 'red' };
    },
    plotAlerts() {
      const pid = this.currentPlot?.plotId;
      return this.alerts.filter(a => a.plotId === pid && !['RESOLVED', 'CLOSED'].includes(a.status));
    },
    metricCards() {
      const latest = this.card?.latest || {};
      const ranges = {};
      (this.pack?.metrics || []).forEach(m => { ranges[m.code] = m; });
      const cards = Object.entries(latest).slice(0, 3).map(([code, m]) => {
        const meta = METRIC_META[code] || { label: code, icon: 'info', tone: 'mi-gray' };
        const range = ranges[code]?.range || ranges[code]?.target || null;
        const lo = Number(range?.min ?? range?.low ?? NaN);
        const hi = Number(range?.max ?? range?.high ?? NaN);
        const v = Number(m?.value);
        let badge = null;
        if (Number.isFinite(v) && Number.isFinite(lo) && Number.isFinite(hi)) {
          badge = v < lo ? { text: '偏低', tone: 'blue' } : v > hi ? { text: '偏高', tone: 'amber' } : { text: '适宜', tone: 'green' };
        }
        return { code, label: meta.label, icon: meta.icon, tone: meta.tone, value: v, unit: m?.unit || ranges[code]?.unit || '', badge, rangeText: Number.isFinite(lo) && Number.isFinite(hi) ? `${lo} ~ ${hi}` : (m?.target || '--'), quality: m?.quality?.status || '' };
      });
      if (cards.length) return cards;
      // 离线模拟合同（main mock）没有 overview.latest 时，直接读 plot.metrics 展示
      const pm = this.currentPlot?.metrics || {};
      return Object.entries(pm).slice(0, 3).map(([code, m]) => {
        const meta = METRIC_META[code] || { label: m.label || code, icon: 'info', tone: 'mi-gray' };
        const mm = String(m.target || '').match(/([\d.]+)\s*~\s*([\d.]+)/);
        const lo = mm ? Number(mm[1]) : NaN; const hi = mm ? Number(mm[2]) : NaN;
        const v = Number(m.value);
        let badge = null;
        if (m.status === 'NORMAL') badge = { text: '适宜', tone: 'green' };
        else if (Number.isFinite(v) && Number.isFinite(lo) && v < lo) badge = { text: '偏低', tone: 'blue' };
        else if (Number.isFinite(v) && Number.isFinite(hi) && v > hi) badge = { text: '偏高', tone: 'amber' };
        else badge = { text: '告警', tone: 'red' };
        return { code, label: m.label || meta.label, icon: meta.icon, tone: meta.tone, value: v, unit: m.unit || '', badge, rangeText: m.target || '--', quality: '' };
      });
    },
    userName() { return ROLE_LABEL[this.user?.role] || this.user?.roleLabel || this.user?.username || '用户'; },
    openWorkCount() { return this.workOrders.filter(w => !['DONE', 'CANCELLED', 'CLOSED'].includes(w.status)).length; },
  },
  methods: {
    icon, num, fmtDue, esc, donutSVG,
    pmeta(p) { return PRIORITY_META[p] || { label: '低', tone: 'blue' }; },
    wstatus(s) { return WO_STATUS_META[s] || { label: s || '--', tone: 'gray' }; },
    pname(pid) { return this.plots.find(x => x.plotId === pid)?.name || pid; },
    /* ---------- 启动 ---------- */
    async boot() {
      this.live = await api.checkHealth();
      if (!api.readSession()) { location.replace('login.html'); return; }
      if (this.live) {
        const u = await api.restoreSession();
        if (!u) { location.replace('login.html'); return; }
        this.user = u;
      } else {
        this.user = api.getUser();
      }
      await this.loadShell();
      this.booted = true;
      this.setView('plots');
    },
    async loadShell() {
      const grab = (fn) => fn().catch(e => { this.shellErr = errText(e); return null; });
      const [farms, plots, overview, batches, packs, devices, alerts, sysStatus, resource] = await Promise.all([
        grab(() => api.getFarms()), grab(() => api.getPlots()), grab(() => api.getOverview()),
        grab(() => api.getCropBatches()), grab(() => api.getCropPacks()), grab(() => api.getDevices()),
        grab(() => api.getAlerts()), grab(() => api.getSystemStatus()), grab(() => api.getResourcePlan()),
      ]);
      this.farms = farms || []; this.plots = plots || []; this.overview = overview;
      this.batches = batches || []; this.packs = packs || []; this.devices = devices || [];
      this.alerts = alerts || []; this.sysStatus = sysStatus; this.resource = resource;
      if (this.plots.length && !this.plotId) this.plotId = this.plots[0].plotId;
      this.workOrders = (await grab(() => api.getWorkOrders())) || [];
    },
    /* ---------- 视图切换 ---------- */
    setView(v) {
      this.view = v;
      this.disposeCharts();
      if (v === 'plots') this.loadWorkbench();
      else if (v === 'today') this.loadToday();
      else if (v === 'work') this.loadWork();
      else if (v === 'risk') this.loadRisk();
      else if (v === 'biz') this.loadBiz();
    },
    selectPlot(pid) { this.plotId = pid; this.loadWorkbench(); },
    setRange(r) { this.range = r; this.loadTrend(); },
    /* ---------- 地块工作台 ---------- */
    async loadWorkbench() {
      if (!this.currentPlot) return;
      this.loadTrend();
      this.workErr = ''; this.diagErr = '';
      try { this.workItems = await api.getTodayWorkItems(this.currentPlot.plotId); }
      catch (e) { this.workItems = []; this.workErr = errText(e); }
      try { this.forecast = await api.getRiskForecast(this.currentPlot.plotId); }
      catch (e) { this.forecast = null; this.diagErr = errText(e); }
      try { this.plan = await api.estimateIrrigation({ plotId: this.currentPlot.plotId }); }
      catch (e) { this.plan = null; if (!this.diagErr) this.diagErr = errText(e); }
      this.$nextTick(this.renderTrend);
    },
    async loadTrend() {
      this.trendErr = '';
      const hours = this.range === '24h' ? 24 : this.range === '7d' ? 24 * 7 : 24 * 30;
      const from = new Date(Date.now() - hours * 3600000).toISOString();
      const pid = this.currentPlot?.plotId;
      if (!pid) return;
      try {
        const [m, t] = await Promise.all([
          api.getTelemetry(pid, 'SOIL_MOISTURE', { fromIso: from, limit: 400 }),
          api.getTelemetry(pid, 'AIR_TEMPERATURE', { fromIso: from, limit: 400 }),
        ]);
        const fmt = (ts) => { const d = new Date(ts); return hours <= 24 ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : `${d.getMonth() + 1}/${d.getDate()}`; };
        this.trend = {
          m: m.map(p => ({ label: fmt(p.ts), value: p.value })),
          t: t.map(p => ({ label: fmt(p.ts), value: p.value })),
        };
      } catch (e) { this.trend = { m: [], t: [] }; this.trendErr = errText(e); }
      this.$nextTick(this.renderTrend);
    },
    renderTrend() {
      const el = this.$refs.trendEl;
      if (!el || !window.echarts) return;
      this._trendChart?.dispose();
      this._trendChart = window.echarts.init(el);
      this._trendChart.setOption(trendOption(this.trend.m, this.trend.t));
    },
    /* ---------- 灌溉下发 ---------- */
    async dispatch() {
      const plan = this.plan;
      if (!plan?.planId) return;
      this.openDialog({
        title: '下发虚拟灌溉命令',
        html: `
          <div class="kv"><span>地块</span><b>${esc(this.currentPlot?.name)}（${esc(this.currentPlot?.plotId)}）</b></div>
          <div class="kv"><span>计划编号</span><b>${esc(plan.planId)}</b></div>
          <div class="kv"><span>补水量 / 时长</span><b>${num(plan.waterLitre, 0)} L · ${num(plan.durationSeconds, 0)} s</b></div>
          <div class="kv"><span>就绪度</span><b>${esc(plan.readinessStatus)} · ${esc(plan.status)}</b></div>
          <div class="kv"><span>依据</span><b>${esc(plan.why)}</b></div>
          <div class="kv"><span>幂等保护</span><b>后端 idempotencyKey + 冷却窗口</b></div>`,
        actions: [
          { label: '取消', tone: 'text' },
          { label: '确认下发', tone: 'filled', fn: () => this.doDispatch(plan) },
        ],
      });
    },
    async doDispatch(plan) {
      try {
        const res = await api.executeCommand({
          plotId: this.currentPlot.plotId, planId: plan.planId,
          idempotencyKey: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          approved: true, source: 'web-material-ui',
        });
        const st = res?.ack?.status || res?.status || 'UNKNOWN';
        if (st === 'SUCCEEDED') this.snack(`灌溉执行成功：实际用水 ${num(res?.ack?.actualWaterLitre ?? res?.waterLitre, 0)} L`, 'green');
        else this.snack(`灌溉命令返回非成功状态：${st}`, 'red');
      } catch (e) { this.snack(`下发失败：${errText(e)}`, 'red'); }
    },
    planDetail() {
      const p = this.plan;
      if (!p) { this.snack(this.diagErr || '后端未返回处方', 'red'); return; }
      this.openDialog({
        title: '结构化灌溉处方（后端计算）',
        html: `
          <div class="kv"><span>planId</span><b>${esc(p.planId)}</b></div>
          <div class="kv"><span>诊断</span><b>${esc(p.diagnosisId)}</b></div>
          <div class="kv"><span>建议窗口</span><b>${fmtDue(p.recommendedWindow?.start)} ~ ${fmtDue(p.recommendedWindow?.end)}</b></div>
          <div class="kv"><span>预期效果</span><b>${esc(p.expectedResult?.metric)} ${num(p.expectedResult?.from)}% → ${num(p.expectedResult?.to)}%</b></div>
          <div class="kv"><span>版本</span><b>pack ${esc(p.cropPackVersion)} · ${esc(p.ruleVersion)} · ${esc(p.knowledgeVersion)} · ${esc(p.agentVersion)}</b></div>
          <div class="kv"><span>executable</span><b>${String(p.executable)}</b></div>
          <h4>后端判定</h4><div>${esc(p.why)}</div>`,
        actions: [{ label: '关闭', tone: 'filled' }],
      });
    },
    diagDetail() {
      const f = this.forecast;
      const rows = (f?.horizons || []).map(h => `<div class="kv"><span>${h.minutes / 60}h</span><b>${num(h.value)}%（${num(h.lower)} ~ ${num(h.upper)}）</b></div>`).join('');
      this.openDialog({
        title: `风险诊断 · ${esc(this.currentPlot?.name || '')}`,
        html: f?.status === 'AVAILABLE' ? `
          <div class="kv"><span>状态</span><b>AVAILABLE</b></div>
          <div class="kv"><span>触达风险边界</span><b>${f.timeToRiskMinutes == null ? '未预测到' : num(f.timeToRiskMinutes, 0) + ' 分钟'}</b></div>
          <div class="kv"><span>风险边界</span><b>${esc(f.riskBoundary?.operator)} ${num(f.riskBoundary?.value)}${esc(f.riskBoundary?.unit)}</b></div>
          <div class="kv"><span>有效样本</span><b>${num(f.inputWindow?.validSamples, 0)}</b></div>
          <h4>预测时点</h4>${rows || '<div>无</div>'}
          <h4>假设</h4><div>${(f.assumptions || []).map(esc).join('；')}</div>
          <div style="margin-top:10px"><span class="prov-tag">algorithm ${esc(f.algorithmVersion)}</span></div>`
          : `<div>后端返回 ${esc(f?.status || 'UNAVAILABLE')}：${esc(f?.reason || this.diagErr || '样本/质量不足，拒绝预测')}</div>`,
        actions: [{ label: '关闭', tone: 'filled' }],
      });
    },
    /* ---------- 其它视图 ---------- */
    async loadToday() { this.workErr = ''; try { this.workItems = await api.getTodayWorkItems(''); } catch (e) { this.workItems = []; this.workErr = errText(e); } },
    async loadWork() {
      this.workPageErr = '';
      const ins = await Promise.allSettled(this.plots.map(p => api.getInspections(p.plotId)));
      this.inspections = ins.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      if (ins.length && ins.every(r => r.status === 'rejected')) this.workPageErr = errText(ins[0].reason);
    },
    async loadRisk() {
      const list = await Promise.allSettled(this.plots.map(p => api.getRiskForecast(p.plotId)));
      this.forecasts = Object.fromEntries(this.plots.map((p, i) => [p.plotId, list[i].status === 'fulfilled' ? list[i].value : { status: 'UNAVAILABLE', reason: errText(list[i].reason) }]));
    },
    async loadBiz() {
      this.bizErr = '';
      try { this.ledger = await api.getValueLedgers(); } catch (e) { this.ledger = []; this.bizErr = errText(e); }
      const pa = await Promise.allSettled(this.batches.map(b => api._fetch(`/api/v1/crop-batches/${encodeURIComponent(b.batchId)}/plan-actual`).then(r => ({ batchId: b.batchId, ...r?.data }))));
      this.planActuals = pa.filter(r => r.status === 'fulfilled').map(r => r.value);
      this.$nextTick(this.renderBizChart);
    },
    renderBizChart() {
      const el = this.$refs.bizEl;
      if (!el || !window.echarts || !this.planActuals.length) return;
      this._bizChart?.dispose();
      this._bizChart = window.echarts.init(el);
      this._bizChart.setOption(barOption(this.planActuals.map(r => ({ label: r.batchId, planned: Number(r.plannedWaterLitres || 0), actual: Number(r.actualWaterLitres || 0) }))));
    },
    async runScenario(code) {
      try {
        const cmp = await api.compareScenario({ scenario: code, seed: 42, plotId: this.currentPlot?.plotId, leftBranch: 'EXECUTE', rightBranch: 'NO_ACTION' });
        const hasCurve = cmp?.branches?.EXECUTE?.points;
        this.openDialog({
          title: `${SCENARIOS.find(s => s.code === code)?.label || code} · 执行 vs 不执行`,
          html: `
            <div class="kv"><span>情景</span><b>${esc(cmp?.scenario || code)}</b></div>
            <div class="kv"><span>种子</span><b>${esc(cmp?.seed ?? 42)}</b></div>
            ${hasCurve ? '<div class="chart-box" id="cmpChart"></div>' : `<h4>后端汇总</h4><div>${esc(JSON.stringify(cmp?.serverSummary || cmp || {})).slice(0, 600)}</div>`}
            <div style="margin-top:8px"><span class="prov-tag">同一冻结快照 + 种子 · 不写回主状态</span></div>`,
          actions: [{ label: '关闭', tone: 'filled' }],
        });
        if (hasCurve) this.$nextTick(() => {
          const el = document.getElementById('cmpChart');
          if (el && window.echarts) { this._cmpChart?.dispose(); this._cmpChart = window.echarts.init(el); this._cmpChart.setOption(compareOption(cmp)); }
        });
      } catch (e) { this.snack(`情景推演失败：${errText(e)}`, 'red'); }
    },
    newInspection() {
      this.openDialog({
        title: '录入人工巡田观察',
        html: `
          <div class="field" style="margin-bottom:10px"><label>地块</label>
            <select id="insPlot" style="width:100%;height:42px;border-radius:10px;border:1px solid var(--outline-strong);padding:0 10px;font:inherit">
              ${this.plots.map(p => `<option value="${esc(p.plotId)}">${esc(p.name)}（${esc(p.plotId)}）</option>`).join('')}
            </select></div>
          <div class="field" style="margin-bottom:10px"><label>土表状态</label>
            <select id="insSurface" style="width:100%;height:42px;border-radius:10px;border:1px solid var(--outline-strong);padding:0 10px;font:inherit">
              <option value="DRY">干燥</option><option value="NORMAL">正常</option><option value="WET">偏湿</option></select></div>
          <div class="field" style="margin-bottom:10px"><label>便携仪土壤湿度（%）</label>
            <input id="insMoisture" type="number" min="0" max="100" step="0.1" value="20"></div>
          <div class="field"><label>备注</label><input id="insNotes" placeholder="现场观察描述…"></div>`,
        actions: [
          { label: '取消', tone: 'text' },
          {
            label: '保存记录', tone: 'filled', fn: async () => {
              try {
                await api.createInspection({
                  plotId: document.getElementById('insPlot').value,
                  soilSurface: document.getElementById('insSurface').value,
                  cropCondition: 'NORMAL', deviceStatus: 'NORMAL',
                  portableSoilMoisture: Number(document.getElementById('insMoisture').value) || 0,
                  notes: document.getElementById('insNotes').value || '',
                });
                this.snack('巡田记录已保存（USER_PROVIDED）', 'green');
                this.loadWork();
              } catch (e) { this.snack(`保存失败：${errText(e)}`, 'red'); }
            },
          },
        ],
      });
    },
    /* ---------- 顶栏/右栏对话框 ---------- */
    showAlertsDialog() {
      if (!this.alerts.length) { this.snack('后端暂无告警记录'); return; }
      this.openDialog({
        title: `告警（${this.alerts.length}）`,
        html: this.alerts.map(a => `
          <h4>${esc(a.plotId)} · ${esc(a.status || 'OPEN')} ${a.level ? `<span class="badge b-${PRIORITY_META[a.level]?.tone || 'gray'}">${esc(PRIORITY_META[a.level]?.label || a.level)}</span>` : ''}</h4>
          <div class="kv"><span>来源</span><b>${esc(a.source || a.alertId)}</b></div>
          <div class="kv"><span>时间</span><b>${fmtDue(a.createdAt || a.raisedAt || '')}</b></div>`).join(''),
        actions: [{ label: '关闭', tone: 'filled' }],
      });
    },
    openAccount() {
      this.openDialog({
        title: '账户',
        html: `
          <div class="kv"><span>用户名</span><b>${esc(this.user?.username || '--')}</b></div>
          <div class="kv"><span>角色</span><b>${esc(this.userName)}</b></div>
          <div class="kv"><span>会话模式</span><b>${this.live ? '实时（JWT）' : '离线演示'}</b></div>
          <div class="kv"><span>后端状态</span><b>${this.live ? '在线' : '离线'}</b></div>`,
        actions: [
          { label: '退出登录', tone: 'text', fn: () => { api.logout(); location.replace('login.html'); } },
          { label: '关闭', tone: 'filled' },
        ],
      });
    },
    farmDetail() {
      const f = this.farm;
      this.openDialog({
        title: '农场',
        html: f ? `
          <div class="kv"><span>名称</span><b>${esc(f.name)}</b></div>
          <div class="kv"><span>区域</span><b>${esc(f.region || '--')}</b></div>
          <div class="kv"><span>水价</span><b>${num(f.defaults?.waterPricePerLitre, 3)} 元/L</b></div>
          <div class="kv"><span>人工</span><b>${num(f.defaults?.labourPricePerHour, 0)} 元/h</b></div>`
          : '<div>后端未提供农场数据</div>',
        actions: [{ label: '关闭', tone: 'filled' }],
      });
    },
    addPlotInfo() {
      this.openDialog({
        title: '添加地块',
        html: '<div>地块由后端 <b>POST /api/v1/plots</b> 统一管理，前端演示不开放新建入口。</div>',
        actions: [{ label: '知道了', tone: 'filled' }],
      });
    },
    messagesDialog() {
      this.openDialog({
        title: '系统消息与操作日志',
        html: `
          <h4>活跃告警 ${this.plotAlerts.length ? `（当前地块 ${this.plotAlerts.length}）` : ''}</h4>
          ${this.alerts.slice(0, 8).map(a => `<div>· ${esc(a.plotId)} ${esc(a.source || a.alertId)}（${esc(a.status || 'OPEN')}）</div>`).join('') || '<div>无</div>'}
          <h4>未完成工单</h4>
          ${this.workOrders.filter(w => !['DONE', 'CANCELLED', 'CLOSED'].includes(w.status)).slice(0, 8).map(w => `<div>· ${esc(w.title || w.workOrderId)}（${esc(w.status)}）</div>`).join('') || '<div>无</div>'}`,
        actions: [{ label: '关闭', tone: 'filled' }],
      });
    },
    openSettings() {
      const s = this.sysStatus;
      this.openDialog({
        title: '设置 · 系统信息',
        html: `
          <div class="kv"><span>后端连接</span><b>${this.live ? '在线（/api/v1）' : '离线'}</b></div>
          <div class="kv"><span>运行模式</span><b>${esc(s?.mode || '--')}</b></div>
          <div class="kv"><span>数据库 / Redis / MQTT</span><b>${esc(s?.database || '--')} / ${esc(s?.redis || '--')} / ${esc(s?.mqtt || '--')}</b></div>
          <div class="kv"><span>AI 模式</span><b>${esc(s?.ai || this.overview?.aiMode || '--')}</b></div>
          <div class="kv"><span>会话</span><b>${esc(api.sessionMode || '--')}</b></div>
          <h4>后端作物包</h4>
          ${this.packs.map(p => `<div class="kv"><span>${esc(p.name || p.cropCode)}</span><b>v${esc(p.version)} · ${esc(p.schemaVersion)}</b></div>`).join('') || '<div>无</div>'}`,
        actions: [{ label: '关闭', tone: 'filled' }],
      });
    },
    openHelp() {
      this.openDialog({
        title: '帮助',
        html: `
          <div>AgriLoop 农智闭环工作台：前端仅展示与操作，数据与决策逻辑全部来自后端 /api/v1；离线时展示与后端合同一致的模拟数据（SIMULATED）。</div>
          <h4>演示提示</h4>
          <div>· 地块视图的趋势/处方/预测均实时请求后端（离线为模拟合同数据）。</div>
          <div>· 风险视图提供 1~4h 预测与情景双轨推演（只读，不写回主状态）。</div>`,
        actions: [{ label: '关闭', tone: 'filled' }],
      });
    },
    /* ---------- 对话框 / snackbar ---------- */
    openDialog({ title = '', html = '', actions = [] }) {
      this.dialog = { title, html, actions };
    },
    closeDialog() { this.dialog = null; },
    runAction(a) {
      const keep = a.close === false;
      if (!keep) this.closeDialog();
      a.fn?.();
    },
    snack(text, tone = 'dark') {
      const id = Date.now() + Math.random();
      this.snacks.push({ id, text, tone });
      setTimeout(() => { this.snacks = this.snacks.filter(s => s.id !== id); }, 4200);
    },
    disposeCharts() {
      this._trendChart?.dispose(); this._trendChart = null;
      this._bizChart?.dispose(); this._bizChart = null;
      this._cmpChart?.dispose(); this._cmpChart = null;
    },
  },
  async mounted() {
    await this.boot();
    window.addEventListener('resize', () => { this._trendChart?.resize(); this._bizChart?.resize(); this._cmpChart?.resize(); });
  },
});

app.component('v-icon', {
  props: { name: { type: String, required: true }, size: { type: Number, default: 20 } },
  computed: { svg() { return icon(this.name, this.size); } },
  template: '<span class="ic-wrap" v-html="svg"></span>',
});

app.mount('#app');
