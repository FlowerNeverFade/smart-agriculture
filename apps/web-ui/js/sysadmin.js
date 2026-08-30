import { api, PLOT_SIMULATION_DEFAULTS, PLOT_SIMULATION_SCENARIOS } from './api.js?v=20260828-v58';
import { MOCK_DATA } from './mock-data.js?v=20260827-device-control-v1';
import { canExecuteIrrigation as canExecuteIrrigationRole, presentRoleUser, roleCan, roleDefinition, roleViews } from './roles.js';
import { buildAccountProfile } from './account-profile.js';
import { AdminAlertCenter } from './admin-alerts.js?v=20260827-alert-workflow-v3';
import { WorkOrderLifecycleView } from './work-order-lifecycle.js?v=20260827-work-order-flow-v3';
import { AdminDecisionView } from './modules/admin-decision.js';
import { AdminAiChatView } from './modules/admin-ai-chat.js?v=20260828-agent-buttons';
import { AdminResourcePlanningView } from './modules/admin-resource-planning.js?v=20260828-v58';
import { AdminWorkManagementView } from './modules/admin-work-management.js?v=20260827-work-order-flow-v3';
import { AdminResourceCenterView } from './modules/admin-resource-center.js';
import { AdminMemberManagementView } from './modules/admin-member-management.js';
import { adminHealthTone, adminMetricLabel, adminSummary, domainsForEventType, formatHealthScore, hasFarmPlotRefresh, isLatestFarmResponse, legacyAdminTabTarget, managerSummaryTarget, mergeFarmPlots, routeHash, selectAuthorizedFarm } from './admin-state.js';
import {
  agentResponseSource,
  agentResponseText,
  buildLiveFeedItems,
  emptyAdminOverview,
  mapAdminAlert,
  mapAdminDevice,
  mapAdminPlot,
  mapAdminRule,
  mapCropPack,
  mapStrategyCandidate,
  mapTimelineRecord,
  normalizePlot,
  relativeTime,
  alertStatusLabel,
  deviceTypeLabel,
  displayText,
  eventTypeLabel,
  levelLabel,
  metricStatusLabel,
  priorityLabel as localizedPriorityLabel,
  provenanceLabel,
  resourceTypeLabel,
  scenarioLabel,
  serviceNameLabel,
  serviceStatusLabel,
  modeLabel,
  sourceLabel as localizedSourceLabel,
  statusLabel as localizedStatusLabel,
  workStatusLabel
} from './live-data.js?v=20260827-boot-fix-1';

// 角色守卫：sysadmin.html 仅服务系统管理员，其余身份重定向到各自入口
const guardSession = api.readSession();
const guardUser = presentRoleUser(guardSession?.user) || presentRoleUser(MOCK_DATA.currentUser);
if (guardUser && guardUser.role !== 'SYSTEM_ADMIN') {
  const guardTarget = guardUser.role === 'FARMER' ? 'farmer.html' : 'index.html';
  window.location.replace(guardTarget);
}

const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick, watch, inject } = Vue;

const ICON_CLASS = Object.freeze({
  dashboard: 'ph-squares-four',
  warning_amber: 'ph-warning',
  warning: 'ph-warning',
  timeline: 'ph-chart-line-up',
  task_alt: 'ph-clipboard-text',
  task: 'ph-check-square',
  water_drop: 'ph-drop',
  group: 'ph-users',
  menu_book: 'ph-book-open',
  arrow_back: 'ph-arrow-left',
  arrow_forward: 'ph-arrow-right',
  monitoring: 'ph-monitor',
  dns: 'ph-hard-drives',
  gavel: 'ph-gavel',
  science: 'ph-flask',
  rule_folder: 'ph-folder-notch',
  admin_panel_settings: 'ph-user-gear',
  library_books: 'ph-books',
  account_balance_wallet: 'ph-wallet',
  menu: 'ph-list',
  light_mode: 'ph-sun',
  dark_mode: 'ph-moon',
  logout: 'ph-sign-out',
  error: 'ph-x-circle',
  check_circle: 'ph-check-circle',
  save: 'ph-floppy-disk',
  add_task: 'ph-note-pencil',
  calendar_today: 'ph-calendar-check',
  schedule: 'ph-clock',
  person_add: 'ph-user-plus',
  thermometer: 'ph-thermometer-simple',
  humidity: 'ph-drop-half-bottom',
  eco: 'ph-leaf',
  rainy: 'ph-cloud-rain',
  soil_ec: 'ph-wave-sine',
  nutrition: 'ph-plant',
  remove_circle_outline: 'ph-minus-circle',
  close: 'ph-x',
  psychology: 'ph-brain',
  receipt_long: 'ph-receipt',
  bolt: 'ph-lightning',
  policy: 'ph-shield-check',
  smart_toy: 'ph-robot',
  head_circuit: 'ph-head-circuit',
  auto_awesome: 'ph-sparkle',
  hourglass_empty: 'ph-hourglass',
  send: 'ph-paper-plane-tilt',
  analytics: 'ph-chart-line-up',
  fact_check: 'ph-clipboard-text',
  record_voice_over: 'ph-user-focus',
  group_off: 'ph-user-minus',
  refresh: 'ph-arrows-clockwise',
  block: 'ph-prohibit',
  psychiatry: 'ph-leaf',
  info: 'ph-info',
  more_vertical: 'ph-dots-three-vertical',
  edit: 'ph-pencil-simple',
  delete: 'ph-trash',
  add: 'ph-plus',
  expand_more: 'ph-caret-down',
  expand_less: 'ph-caret-up',
  lock_reset: 'ph-lock-key-open',
  help: 'ph-question',
  login: 'ph-sign-in',
  update: 'ph-arrow-up',
  settings: 'ph-gear',
  notifications_active: 'ph-bell',
  notifications: 'ph-bell',
  sensors: 'ph-broadcast',
  grid_view: 'ph-squares-four',
  play_arrow: 'ph-play',
  stop: 'ph-stop',
  category: 'ph-tag',
  compare_arrows: 'ph-arrows-left-right',
  replay: 'ph-arrow-counter-clockwise',
  speed: 'ph-gauge',
  agriculture: 'ph-plant',
  manage_accounts: 'ph-user-gear',
  tune: 'ph-sliders',
  history: 'ph-clock-counter-clockwise',
  chevron_right: 'ph-caret-right'
});

const AppIcon = {
  props: { name: { type: String, default: 'check_circle' } },
  setup(props) {
    const iconClass = computed(() => ICON_CLASS[props.name] || 'ph-circle');
    return { iconClass };
  },
  template: '<span class="material-symbols-outlined ph" :class="iconClass" aria-hidden="true"></span>'
};

const NAV_CATALOG = Object.freeze([
  { id: 'dashboard', label: '农智总览', icon: 'dashboard', labels: { FARMER: '我的农场', FARM_ADMIN: '农场总览', SYSTEM_ADMIN: '运行总览' } },
  { id: 'decision-console', label: '智能决策', icon: 'warning_amber', labels: { FARMER: '智能建议', FARM_ADMIN: 'AI告警分析与智能处理', SYSTEM_ADMIN: '决策审计' } },
  { id: 'work-orders', label: '农务工单', icon: 'task_alt', labels: { FARMER: '农务记录', FARM_ADMIN: '农务任务', SYSTEM_ADMIN: '工单审计' } },
  { id: 'resource-coordination', label: '设备与设施', icon: 'sensors' },
  { id: 'farm-members', label: '农场成员', icon: 'group' },
  { id: 'crop-manual', label: '作物培养手册', icon: 'menu_book', labels: { FARMER: '作物培养手册', FARM_ADMIN: '作物培养手册', SYSTEM_ADMIN: '作物培养手册' } },
  { id: 'crop-packs', label: '作物模型', icon: 'library_books', labels: { FARM_ADMIN: '作物模型', SYSTEM_ADMIN: '规则配置' } },
  { id: 'admin-overview', label: '平台总览', icon: 'monitoring', labels: { SYSTEM_ADMIN: '平台总览' } },
  { id: 'admin-ops', label: '运行监控', icon: 'dns', labels: { SYSTEM_ADMIN: '运行监控' } },
  { id: 'admin-audit', label: '决策审计', icon: 'gavel', labels: { SYSTEM_ADMIN: '决策审计' } },
  { id: 'admin-simulator', label: '仿真模拟', icon: 'science', labels: { SYSTEM_ADMIN: '仿真模拟' } },
  { id: 'admin-rules', label: '规则与版本', icon: 'rule_folder', labels: { SYSTEM_ADMIN: '规则与版本' } },
  { id: 'admin-settings', label: '系统管理', icon: 'admin_panel_settings', labels: { SYSTEM_ADMIN: '系统管理' } }
]);

const PLOT_METRIC_ORDER = Object.freeze(['SOIL_MOISTURE', 'AIR_TEMPERATURE', 'AIR_HUMIDITY', 'LIGHT', 'CO2', 'RAINFALL', 'SOIL_EC', 'NPK_RATIO']);
const PLOT_METRIC_ICONS = Object.freeze({
  SOIL_MOISTURE: 'water_drop',
  AIR_TEMPERATURE: 'thermometer',
  AIR_HUMIDITY: 'humidity',
  LIGHT: 'light_mode',
  CO2: 'eco',
  RAINFALL: 'rainy',
  SOIL_EC: 'soil_ec',
  NPK_RATIO: 'nutrition'
});

// The plot-detail simulator uses one axis at a time.  Keeping the unit and
// physical range beside the label prevents a temperature/CO₂ curve from
// being rendered with the soil-moisture 0–100% axis.
const SIMULATION_METRIC_OPTIONS = Object.freeze([
  { code: 'SOIL_MOISTURE', label: '土壤湿度', unit: '%', min: 0, max: 100, decimals: 1, defaultValue: 35, icon: 'water_drop' },
  { code: 'AIR_TEMPERATURE', label: '空气温度', unit: '°C', min: -40, max: 80, decimals: 1, defaultValue: 25, icon: 'thermometer' },
  { code: 'AIR_HUMIDITY', label: '空气湿度', unit: '%RH', min: 0, max: 100, decimals: 1, defaultValue: 68, icon: 'humidity' },
  { code: 'LIGHT', label: '光照', unit: 'lux', min: 0, max: 100000, decimals: 0, defaultValue: 42000, icon: 'light_mode' },
  { code: 'CO2', label: '二氧化碳', unit: 'ppm', min: 0, max: 10000, decimals: 0, defaultValue: 520, icon: 'eco' },
  { code: 'PH', label: '酸碱度', unit: 'pH', min: 0, max: 14, decimals: 2, defaultValue: 6.25, icon: 'soil_ec' },
  { code: 'WATER_LEVEL', label: '水位', unit: '%', min: 0, max: 100, decimals: 1, defaultValue: 78, icon: 'water_drop' },
  { code: 'RAINFALL', label: '降雨量', unit: 'mm/h', min: 0, max: 250, decimals: 1, defaultValue: 0.2, icon: 'rainy' }
]);
const SIMULATION_METRIC_BY_CODE = Object.freeze(Object.fromEntries(
  SIMULATION_METRIC_OPTIONS.map((item) => [item.code, item])
));
const FINISHED_WORK_STATUSES = Object.freeze(['DONE', 'COMPLETED', 'CANCELLED']);
const CROP_OPTIONS = Object.freeze([
  { code: 'tomato', name: '番茄' },
  { code: 'corn', name: '玉米' },
  { code: 'cucumber', name: '黄瓜' },
  { code: 'rice', name: '水稻' },
  { code: 'sunflower', name: '向日葵' },
  { code: 'strawberry', name: '草莓' }
]);
const STAGE_OPTIONS = Object.freeze([
  { code: 'seedling', label: '育苗期' },
  { code: 'vegetative', label: '营养生长期' },
  { code: 'flowering', label: '开花期' },
  { code: 'fruiting', label: '结果期' },
  { code: 'harvest', label: '采收期' }
]);

function normalizedStatus(value, fallback = 'UNKNOWN') {
  return String(value || fallback).trim().toUpperCase();
}

function isFinishedWork(item) {
  return FINISHED_WORK_STATUSES.includes(normalizedStatus(item?.status));
}

function metricTone(metric) {
  const status = normalizedStatus(metric?.status, 'UNAVAILABLE');
  if (['ERROR', 'DANGER', 'CRITICAL', 'BAD', 'OFFLINE'].includes(status)) return 'danger';
  if (['WARN', 'WARNING', 'DEGRADED', 'LOW', 'HIGH'].includes(status)) return 'warning';
  if (['NORMAL', 'GOOD', 'ONLINE', 'SUPPORTED'].includes(status)) return 'normal';
  return 'unavailable';
}

function isAbnormalPlot(plot) {
  const deviceStatus = normalizedStatus(plot?.deviceStatus);
  if (['OFFLINE', 'ERROR', 'FATAL', 'BAD'].includes(deviceStatus)) return true;
  if (['WARN', 'WARNING', 'HIGH', 'CRITICAL', 'DANGER'].includes(normalizedStatus(plot?.riskLevel))) return true;
  return PLOT_METRIC_ORDER.some((code) => ['warning', 'danger'].includes(metricTone(plot?.metrics?.[code])));
}

function formatMetricValue(metric) {
  if (!metric || metric.value === null || metric.value === undefined || metric.value === '') return '—';
  return String(metric.value);
}

function simulationMetricDefinition(code = 'SOIL_MOISTURE') {
  return SIMULATION_METRIC_BY_CODE[String(code || '').toUpperCase()] || SIMULATION_METRIC_BY_CODE.SOIL_MOISTURE;
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function telemetryTimestamp(item) {
  return new Date(item?.ts || item?.timestamp || item?.eventTs || 0).getTime();
}

function normalizedTelemetryPoints(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      ...item,
      ts: item?.ts || item?.timestamp || item?.eventTs,
      value: finiteNumber(item?.value)
    }))
    .filter((item) => telemetryTimestamp(item) > 0 && Number.isFinite(item.value))
    .sort((left, right) => telemetryTimestamp(left) - telemetryTimestamp(right));
}

function normalizedForecastPoints(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      minute: finiteNumber(item?.minute ?? item?.minutes, 0),
      expected: finiteNumber(item?.expected ?? item?.value),
      lower: finiteNumber(item?.lower ?? item?.expected ?? item?.value),
      upper: finiteNumber(item?.upper ?? item?.expected ?? item?.value)
    }))
    .filter((item) => Number.isFinite(item.minute) && Number.isFinite(item.expected))
    .sort((left, right) => left.minute - right.minute);
}

/**
 * Join a forecast to the last observed sample.  A server may generate a
 * forecast a few milliseconds after the telemetry request (or use a slightly
 * different rounding path); shifting the whole curve by that tiny delta keeps
 * the first point physically continuous while preserving its shape.
 */
function alignForecastToHistory(curve, anchorValue, definition) {
  const points = normalizedForecastPoints(curve);
  const anchor = finiteNumber(anchorValue);
  if (!points.length || !Number.isFinite(anchor)) return points;
  const delta = anchor - points[0].expected;
  const mapped = points.map((point, index) => {
    const expected = clampNumber(point.expected + delta, definition.min, definition.max);
    const lower = clampNumber(point.lower + delta, definition.min, definition.max);
    const upper = clampNumber(point.upper + delta, definition.min, definition.max);
    return {
      ...point,
      minute: Math.max(0, point.minute),
      expected: index === 0 ? anchor : expected,
      lower: Math.min(expected, lower),
      upper: Math.max(expected, upper)
    };
  });
  if (mapped[0].minute > 0) {
    mapped.unshift({ minute: 0, expected: anchor, lower: anchor, upper: anchor });
  } else {
    mapped[0] = { ...mapped[0], minute: 0, expected: anchor, lower: Math.min(anchor, mapped[0].lower), upper: Math.max(anchor, mapped[0].upper) };
  }
  return mapped;
}

function chartAxisRange(definition, values = []) {
  const finiteValues = values.map((value) => finiteNumber(value)).filter((value) => Number.isFinite(value));
  if (definition.code === 'SOIL_MOISTURE' || definition.code === 'AIR_HUMIDITY' || definition.code === 'WATER_LEVEL') {
    return { min: 0, max: 100 };
  }
  if (definition.code === 'PH') return { min: 0, max: 14 };
  const observedMin = finiteValues.length ? Math.min(...finiteValues) : definition.min;
  const observedMax = finiteValues.length ? Math.max(...finiteValues) : definition.max;
  const span = Math.max(definition.code === 'AIR_TEMPERATURE' ? 4 : 1, observedMax - observedMin);
  let min = observedMin - span * .12;
  let max = observedMax + span * .12;
  if (definition.min === 0) min = Math.max(0, min);
  min = Math.max(definition.min, min);
  max = Math.min(definition.max, max);
  if (max - min < span * .45) {
    const center = (min + max) / 2;
    min = Math.max(definition.min, center - span * .3);
    max = Math.min(definition.max, center + span * .3);
  }
  const step = definition.code === 'LIGHT' ? 1000 : definition.code === 'CO2' ? 50 : definition.code === 'RAINFALL' ? 5 : .5;
  return {
    min: Math.max(definition.min, Math.floor(min / step) * step),
    max: Math.min(definition.max, Math.ceil(max / step) * step)
  };
}

function formatCurveValue(value, definition) {
  const number = finiteNumber(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('zh-CN', { maximumFractionDigits: definition.decimals, minimumFractionDigits: definition.decimals > 1 ? 1 : 0 });
}

function parseHashRoute(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return { view: '', params: {} };
  if (!raw.includes('=') && !raw.includes('&')) return { view: raw, params: {} };
  const query = new URLSearchParams(raw);
  const params = Object.fromEntries(query.entries());
  return { view: params.view || '', params };
}

function plotDetailHash(plotId, farmId = '') {
  const query = new URLSearchParams({ view: 'plot-detail', plotId: String(plotId || '') });
  if (farmId) query.set('farmId', farmId);
  return `#${query.toString()}`;
}

const FARMER_SHARED_CONTEXT_KEY = 'agriloop-farmer-shared-context';

function readFarmerReturnPage() {
  try {
    const raw = sessionStorage.getItem(FARMER_SHARED_CONTEXT_KEY);
    if (!raw) return '';
    const context = JSON.parse(raw);
    if (context?.source !== 'farmer') return '';
    const page = String(context.returnPage || 'farmer.html').trim();
    // Accept farmer.html or farmer.html#advice so returning keeps the page.
    if (/^[A-Za-z0-9._-]+\.html(#[A-Za-z0-9_-]+)?$/.test(page)) return page;
    return 'farmer.html';
  } catch (error) {
    return '';
  }
}

function scopePlots(plots, user) {
  const catalog = Array.isArray(plots) ? plots : [];
  const assigned = Array.isArray(user?.plotIds) ? user.plotIds.map(String) : [];
  if (assigned.includes('*')) return catalog;
  if (assigned.length) {
    const allowed = new Set(assigned);
    return catalog.filter((plot) => allowed.has(String(plot.plotId)));
  }
  return user?.role === 'FARMER' ? catalog.slice(0, 2) : catalog;
}

function mergeOverviewPlots(plots) {
  return (Array.isArray(plots) ? plots : []).map((plot) => {
    const metrics = { ...(plot.metrics || {}) };
    Object.entries(plot.latest || {}).forEach(([code, event]) => {
      if (!event || event.value === undefined) return;
      metrics[code] = {
        ...(metrics[code] || { label: code, target: '—' }),
        value: event.value,
        unit: event.unit || metrics[code]?.unit || '',
        status: event.quality?.status === 'GOOD' ? 'NORMAL' : (event.quality?.status || metrics[code]?.status || 'NORMAL')
      };
    });
    return {
      ...plot,
      metrics,
      deviceId: plot.device?.deviceId || plot.deviceId || null,
      deviceStatus: plot.device?.status || plot.deviceStatus || 'UNKNOWN',
      healthScore: plot.device?.healthScore ?? plot.healthScore ?? null,
      lastSeen: plot.device?.lastSeen || plot.lastSeen || null
    };
  });
}

const EMPTY_RISK_FORECAST_CONFIG = Object.freeze({
  baselineMoisture: null,
  stressBoundary: null,
  scenarioCatalog: []
});

function liveStatusValue(status, fallback = 'UNKNOWN') {
  return String(status || fallback).trim().toUpperCase();
}

// The backend dependency status exposes `ai` as the configured adapter mode
// (rules-only / openai-compatible / mock / ...) rather than an UP/DEGRADED
// status code.  Map the mode to a service-status so the health matrix card
// can show a real dot colour and label; the mode itself stays visible as a
// secondary hint on the card.  Only real model adapters (openai / compatible /
// full) are UP; mock (fixed output) and rules-only are degraded — this matches
// the backend `degraded = !openAiCompatible` semantics.
function aiServiceStatus(mode) {
  const m = String(mode || '').trim().toLowerCase();
  if (!m) return 'UNKNOWN';
  if (['openai', 'openai-compatible', 'full'].includes(m)) return 'UP';
  return 'DEGRADED';
}

// demo 模式下总览初始化时应用持久化的智能模型模式（localStorage），
// 并同步服务健康矩阵卡片，保证刷新后与保存时一致。
// 注意：services 必须深拷贝，避免改动污染 MOCK_DATA 原始数据。
function applyDemoAiMode(overview) {
  const mode = api.loadDemoAiMode();
  const next = { ...overview };
  const services = (Array.isArray(next.services) ? next.services : []).map(s => ({ ...s }));
  if (mode && mode !== 'full') {
    next.aiMode = mode;
    for (const svc of services) {
      if (svc.name === '智能模型服务' || svc.name === 'Qwen LLM') {
        svc.mode = mode;
        svc.status = aiServiceStatus(mode);
        if (svc.statusLabel !== undefined) delete svc.statusLabel;
      }
    }
  }
  next.services = services;
  return next;
}

function adminServiceCards(systemStatus = {}) {
  const entries = [
    { name: 'PostgreSQL 数据库', status: systemStatus.database, latencyMs: systemStatus.databaseLatencyMs },
    { name: 'Redis 消息流', status: systemStatus.redis, latencyMs: systemStatus.redisLatencyMs },
    { name: 'MQTT 消息代理', status: systemStatus.mqtt, latencyMs: systemStatus.mqttLatencyMs },
    { name: 'SSE 实时推送', status: 'UP', latencyMs: systemStatus.requestLatencyMs },
    { name: '接口服务', status: 'UP', latencyMs: systemStatus.requestLatencyMs },
    { name: '智能模型服务', status: aiServiceStatus(systemStatus.ai), isAi: true, mode: systemStatus.ai === 'openai-compatible' ? 'full' : systemStatus.ai }
  ];
  return entries.map(({ name, status, isAi = false, latencyMs, mode }) => ({
    name,
    status: liveStatusValue(status, 'UNKNOWN'),
    statusLabel: serviceStatusLabel(status, '未知'),
    mode: isAi ? (mode || '—') : undefined,
    latency: typeof latencyMs === 'number' && latencyMs >= 0 ? latencyMs + ' ms' : undefined,
    latencySource: typeof latencyMs === 'number' && latencyMs >= 0 ? 'OBSERVED' : undefined,
    sourceMode: 'BACKEND'
  }));
}

function adminOverviewFromLive({ overview, systemStatus, simulator, alerts, devices, recentEvents } = {}) {
  overview = overview || {};
  systemStatus = systemStatus || {};
  simulator = simulator || {};
  alerts = alerts || [];
  devices = devices || [];
  recentEvents = recentEvents || [];
  const statuses = alerts.map((alert) => liveStatusValue(alert.status, 'ACTIVE'));
  const open = statuses.filter((status) => ['ACTIVE', 'OPEN', 'UNACKNOWLEDGED'].includes(status)).length;
  const acknowledged = statuses.filter((status) => ['ACK', 'ACKED'].includes(status)).length;
  const online = devices.filter((device) => ['ONLINE', 'UP', 'ACTIVE'].includes(liveStatusValue(device.status))).length;
  const simStatus = liveStatusValue(simulator.status, 'UNAVAILABLE');
  const rawAiMode = String(systemStatus.ai || overview.aiMode || '—').trim().toLowerCase();
  // The backend calls a configured Qwen/OpenAI-compatible adapter
  // `openai-compatible`; the overview uses the concise product-facing mode
  // names used by the demo card.
  const aiMode = rawAiMode === 'openai-compatible' ? 'full' : rawAiMode;
  const scenarios = [...new Set((overview.plots || [])
    .map((plot) => plot?.simulation?.scenario || plot?.simulation?.scenarioId)
    .filter(Boolean)
    .map((scenario) => String(scenario).toUpperCase()))];
  const scenario = simulator.scenario || simulator.scenarioId || (scenarios.length === 1 ? scenarios[0] : scenarios.length > 1 ? `多场景（${scenarios.length}）` : '');
  return {
    uptime: systemStatus.uptime || overview.uptime || (systemStatus.mode ? '运行中' : '—'),
    apiVersion: systemStatus.apiVersion || overview.apiVersion || '—',
    aiMode,
    llmModel: systemStatus.llmModel || overview.llmModel || (aiMode === 'full' ? 'Qwen 服务' : '—'),
    alerts: { open, acknowledged, closedToday: statuses.filter((status) => ['CLOSED', 'RESOLVED'].includes(status)).length },
    devices: { total: devices.length, online, offline: Math.max(0, devices.length - online) },
    simulator: {
      running: simStatus === 'RUNNING',
      scenario,
      eventsEmitted: Number(simulator.eventsEmitted || simulator.eventCount || overview.eventCount || 0),
      startTime: simulator.startedAt || null,
      history: simulator.history || []
    },
    services: adminServiceCards(systemStatus),
    recentEvents: Array.isArray(recentEvents) ? recentEvents.slice(0, 20) : [],
    generatedAt: overview.generatedAt || new Date().toISOString(),
    dataOrigin: 'BACKEND'
  };
}

function mapSystemMembers(members, farms) {
  const farmMap = new Map((farms || []).map((farm) => [farm.farmId, farm]));
  return (Array.isArray(members) ? members : []).map((member) => ({
    ...member,
    farmName: (member.farmIds || []).map((id) => farmMap.get(id)?.name).filter(Boolean).join('、') || '—',
    plotIds: Array.isArray(member.plotIds) ? member.plotIds : [],
    enabled: liveStatusValue(member.status, 'ACTIVE') !== 'INACTIVE',
    createdAt: member.createdAt || '—',
    dataOrigin: 'BACKEND'
  }));
}

// Telemetry and device heartbeats are useful to live data views, but they are
// intentionally not user notifications.  The simulator emits a batch of
// these events every second, so surfacing each one as a toast makes the admin
// workbench unusable while adding no actionable information.
// alert.updated is also silent: open alerts keep receiving occurrence bumps
// from rules, and toasting “土壤持续偏干” on every bump is noise.
const SILENT_SYSTEM_EVENT_TYPES = new Set([
  'telemetry.received',
  'device.heartbeat',
  'scenario.telemetry',
  'alert.updated'
]);

// Only announce a new alert toast once per plot+source within the cooldown.
// Duplicate ACTIVE alerts (or reconnect storms) must not keep interrupting
// the farm admin with the same drought warning.
const ALERT_TOAST_COOLDOWN_MS = 5 * 60 * 1000;
const recentAlertToastKeys = new Map();

function systemEventType(event) {
  return String(event?.data?.eventType || event?.type || 'system').trim().toLowerCase();
}

function isSilentSystemEventType(type) {
  const normalized = String(type || '').toLowerCase();
  return SILENT_SYSTEM_EVENT_TYPES.has(normalized)
    || normalized.includes('telemetry')
    || normalized.includes('heartbeat');
}

function shouldAnnounceSystemToast(systemEvent, payload = {}) {
  if (systemEvent?.silent) return false;
  const type = String(systemEvent?.type || '').toLowerCase();
  if (!type.startsWith('alert.')) return true;
  // Updates are already silent; created/escalated still need plot-level cooldown.
  const key = [
    String(payload.plotId || payload.plot_id || '').trim(),
    String(payload.source || '').trim().toUpperCase(),
    String(payload.title || systemEvent.title || '').trim()
  ].join('|');
  const now = Date.now();
  const last = recentAlertToastKeys.get(key) || 0;
  if (now - last < ALERT_TOAST_COOLDOWN_MS) return false;
  recentAlertToastKeys.set(key, now);
  if (recentAlertToastKeys.size > 128) {
    const oldest = recentAlertToastKeys.keys().next().value;
    if (oldest) recentAlertToastKeys.delete(oldest);
  }
  return true;
}

function presentSystemEvent(event) {
  const payload = event?.data?.payload || event?.data || {};
  const type = systemEventType(event);
  const category = /alert|warning/i.test(type) ? 'alert' : /login|auth/i.test(type) ? 'login' : /command|ack|execution/i.test(type) ? 'system' : 'system';
  const icon = category === 'alert' ? 'warning' : category === 'login' ? 'login' : 'notifications';
  const silent = isSilentSystemEventType(type);
  const title = displayText(payload.title || payload.summary || payload.message || (silent ? '实时数据已更新' : `${eventTypeLabel(type)}已到达`));
  return {
    id: event?.data?.eventId || `event-${Date.now()}-${Math.random()}`,
    type,
    category,
    icon,
    title,
    silent,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    traceId: payload.traceId
  };
}

// 1. Define Components
const AdminOverviewView = {
  template: '#tmpl-admin-overview',
  props: ['state', 'routeParams'],
  emits: ['navigate'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const showEvents = ref(true);
    const farmFilter = ref('all');
    const statusFilter = ref('abnormal');
    const selectedPlot = ref(null);
    const showPlotModal = ref(false);
    const plotMetricForm = ref([]);
    const telemetryLoading = ref(false);
    const openPlotMetrics = async (plot) => {
      selectedPlot.value = plot;
      plotMetricForm.value = [...(plot.monitoredMetrics || TELEMETRY_METRICS.map(metric => metric.code))];
      showPlotModal.value = true;
      await refreshPlotMetrics();
    };
    const refreshPlotMetrics = async () => {
      if (!selectedPlot.value || telemetryLoading.value || document.hidden) return;
      telemetryLoading.value = true;
      try {
        const results = await Promise.allSettled(plotMetricForm.value.map(async (metric) => {
          const points = await api.getTelemetry(selectedPlot.value.id, metric, 1);
          return [metric, points[points.length - 1]];
        }));
        results.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          const [metric, point] = result.value;
          if (point) selectedPlot.value.metrics[metric] = `${point.value} ${point.unit || ''}`.trim();
        });
      } finally {
        telemetryLoading.value = false;
      }
    };
    let plotMetricsRefreshTimer = null;
    let plotMetricsVisibilityHandler = null;
    const stopPlotMetricsRefresh = () => {
      if (plotMetricsRefreshTimer) window.clearInterval(plotMetricsRefreshTimer);
      plotMetricsRefreshTimer = null;
      if (plotMetricsVisibilityHandler) document.removeEventListener('visibilitychange', plotMetricsVisibilityHandler);
      plotMetricsVisibilityHandler = null;
    };
    const startPlotMetricsRefresh = () => {
      stopPlotMetricsRefresh();
      if (props.state?.sessionMode !== 'live') return;
      plotMetricsRefreshTimer = window.setInterval(refreshPlotMetrics, 4000);
      plotMetricsVisibilityHandler = () => { if (!document.hidden && showPlotModal.value) refreshPlotMetrics(); };
      document.addEventListener('visibilitychange', plotMetricsVisibilityHandler);
    };
    watch(showPlotModal, (visible) => {
      if (visible) {
        startPlotMetricsRefresh();
        refreshPlotMetrics();
      } else {
        stopPlotMetricsRefresh();
      }
    });
    onBeforeUnmount(stopPlotMetricsRefresh);
    const savePlotMetrics = () => {
      if (props.state.sessionMode === 'live') {
        toast('正式会话只读显示后端遥测指标，监测项配置请通过设备配置接口维护', 'error');
        showPlotModal.value = false;
        return;
      }
      if (selectedPlot.value) selectedPlot.value.monitoredMetrics = [...plotMetricForm.value];
      showPlotModal.value = false;
    };
    const filteredPlots = computed(() => (props.state.adminGlobalPlots || []).filter((plot) => {
      const farmMatches = farmFilter.value === 'all' || plot.farm === farmFilter.value;
      let statusMatches = true;
      if (statusFilter.value === 'abnormal') {
        statusMatches = plot.status !== 'HEALTHY';
      } else if (statusFilter.value !== 'all') {
        statusMatches = plot.status === statusFilter.value;
      }
      return farmMatches && statusMatches;
    }));
    const plotFarms = computed(() => [...new Set((props.state.adminGlobalPlots || []).map(plot => plot.farm))]);
    const plotSummary = computed(() => {
      const plots = props.state.adminGlobalPlots || [];
      return {
        total: plots.length,
        healthy: plots.filter(plot => plot.status === 'HEALTHY').length,
        warning: plots.filter(plot => plot.status === 'WARNING').length,
        critical: plots.filter(plot => plot.status === 'CRITICAL').length,
        offline: plots.filter(plot => plot.status === 'OFFLINE').length
      };
    });
    const healthPercent = (plot) => {
      if (plot?.healthScore !== undefined && plot?.healthScore !== null && plot.healthScore !== '') {
        const numeric = Number(plot.healthScore);
        if (Number.isFinite(numeric)) return Math.round(numeric <= 1 ? numeric * 100 : numeric);
      }
      if (props.state.sessionMode === 'live') return 0;
      if (plot.status === 'HEALTHY') return 92;
      if (plot.status === 'WARNING') return 64;
      if (plot.status === 'CRITICAL') return 28;
      return 0;
    };
    const goToOps = (plot) => {
      emit('navigate', 'admin-ops', { tab: 'devices', search: plot.id });
    };
    return {
      showEvents, farmFilter, statusFilter, filteredPlots, plotFarms, plotSummary, healthPercent,
      telemetryMetrics: TELEMETRY_METRICS, selectedPlot, showPlotModal, plotMetricForm, telemetryLoading,
      openPlotMetrics, refreshPlotMetrics, savePlotMetrics, goToOps,
      serviceStatusLabel, serviceNameLabel, modeLabel, scenarioLabel, metricStatusLabel, displayText
    };
  }
};

const TELEMETRY_METRICS = SIMULATION_METRIC_OPTIONS.map(({ code, label }) => ({ code, label }));

const AdminOpsView = {
  template: '#tmpl-admin-ops',
  props: ['state', 'routeParams'],
  setup(props) {
    const toast = inject('toast');
    const activeTab = ref(props.routeParams?.tab || 'services');
    const deviceFilter = ref('all');
    const alertFilter = ref('all');
    const alertLevel = ref('all');

    watch(() => props.routeParams, (p) => {
      if (p?.tab) activeTab.value = p.tab;
    });

    const filteredDevices = computed(() => {
      const devs = props.state.adminDevices || [];
      if (deviceFilter.value === 'all') return devs;
      return devs.filter(d => d.status === deviceFilter.value);
    });

    const filteredAlerts = computed(() => {
      let alerts = props.state.adminAlerts || [];
      if (alertFilter.value !== 'all') alerts = alerts.filter(a => a.status === alertFilter.value);
      if (alertLevel.value !== 'all') alerts = alerts.filter(a => a.level === alertLevel.value);
      return alerts;
    });

    const transitionAlert = async (alert, action) => {
      if (!alert?.id) return;
      try {
        const saved = action === 'ack' ? await api.ackAlert(alert.id) : await api.closeAlert(alert.id);
        const nextStatus = String(saved?.status || (action === 'ack' ? 'ACKED' : 'CLOSED')).toUpperCase();
        alert.status = nextStatus === 'ACKED' ? 'ACK' : nextStatus === 'ACTIVE' ? 'OPEN' : 'CLOSED';
        toast(action === 'ack' ? '告警已确认，已同步后端' : '告警已关闭，已同步后端');
      } catch (error) {
        toast(error.message || '告警状态更新失败', 'error');
      }
    };

    return { activeTab, deviceFilter, alertFilter, alertLevel, filteredDevices, filteredAlerts, transitionAlert, serviceStatusLabel, serviceNameLabel, modeLabel, deviceTypeLabel, alertStatusLabel, levelLabel, localizedSourceLabel, displayText };
  }
};

const AdminAuditView = {
  template: '#tmpl-admin-audit',
  props: ['state', 'routeParams'],
  setup(props) {
    const auditTab = ref('passport');
    const searchQuery = ref(props.routeParams?.traceId || '');
    const typeFilter = ref('all');
    const expandedPassport = ref(props.routeParams?.traceId || null);

    watch(() => props.routeParams, (p) => {
      if (p?.traceId) {
        searchQuery.value = p.traceId;
        expandedPassport.value = p.traceId;
      }
    });

    const filteredRecords = computed(() => {
      let records = props.state.adminAuditRecords || [];
      if (typeFilter.value !== 'all') records = records.filter(r => r.type === typeFilter.value);
      if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase();
        records = records.filter(r =>
          r.traceId.toLowerCase().includes(q) ||
          r.operator.toLowerCase().includes(q) ||
          r.plotId.toLowerCase().includes(q)
        );
      }
      return records;
    });

    const togglePassport = (traceId) => {
      expandedPassport.value = expandedPassport.value === traceId ? null : traceId;
    };

    return { auditTab, searchQuery, typeFilter, expandedPassport, filteredRecords, togglePassport, localizedStatusLabel, provenanceLabel, levelLabel, displayText };
  }
};

const AdminSimulatorView = {
  template: '#tmpl-admin-simulator',
  props: ['state', 'routeParams'],
  setup(props) {
    const toast = inject('toast');
    const simRunning = ref(props.state.adminOverview?.simulator?.running || false);
    const simBusy = ref(false);
    const plotScenarios = ref([]);
    const plots = computed(() => props.state.allPlots || props.state.plots || []);

    watch(plots, (newPlots) => {
      plotScenarios.value = newPlots.map(p => {
        const existing = plotScenarios.value.find(ex => ex.plotId === p.plotId);
        const configuredScenario = p.simulation?.scenario || p.simulation?.scenarioId || p.scenario || 'NORMAL';
        return {
          plotId: p.plotId,
          name: p.name || p.plotName || p.plotId,
          cropName: p.cropName || p.cropCode || '未知作物',
          scenario: existing ? existing.scenario : String(configuredScenario).toUpperCase(),
          enabled: existing ? existing.enabled : (p.simulation?.enabled !== false)
        };
      });
    }, { immediate: true });

    const globalScenario = computed({
      get: () => {
        if (!plotScenarios.value || plotScenarios.value.length === 0) return '';
        const first = plotScenarios.value[0].scenario;
        return plotScenarios.value.every(p => p.scenario === first) ? first : '';
      },
      set: (val) => {
        if (val) {
          plotScenarios.value.forEach(p => p.scenario = val);
        }
      }
    });
    const adminDualTrackModal = ref(false);
    const adminReplayModal = ref(false);
    const replayEvents = ref([]);
    const selectedReplayScenario = ref('');
    const selectedDualTrackScenario = ref('');

    const syncSimulator = (status = {}) => {
      props.state.simulatorStatus = status;
      props.state.adminOverview.simulator = {
        ...(props.state.adminOverview.simulator || {}),
        running: String(status.status || '').toUpperCase() === 'RUNNING',
        scenario: status.scenario || status.scenarioId || '',
        eventsEmitted: Number(status.eventsEmitted || status.eventCount || 0)
      };
      simRunning.value = props.state.adminOverview.simulator.running;
    };
    const toggleSimulator = async () => {
      if (simBusy.value) return;
      simBusy.value = true;
      try {
        const status = simRunning.value ? await api.stopSimulator() : await api.startSimulator();
        syncSimulator(status);
        toast(simRunning.value ? '模拟器已启动，状态来自模拟器控制服务' : '模拟器已停止，状态来自模拟器控制服务');
      } catch (error) {
        toast(error.message || '模拟器控制失败', 'error');
      } finally { simBusy.value = false; }
    };
    const applyPlotScenarios = async () => {
      if (simBusy.value) return;
      const targets = (plotScenarios.value || []).filter((plot) => plot && plot.plotId);
      if (targets.length === 0) { toast('没有可保存的地块场景配置', 'error'); return; }
      simBusy.value = true;
      let updated = 0;
      const failures = [];
      try {
        for (const plot of targets) {
          const scenario = String(plot.scenario || 'NORMAL').toUpperCase();
          try {
            await api.updatePlotSimulation(plot.plotId, { scenario });
            updated += 1;
          } catch (error) {
            failures.push(`${plot.name || plot.plotId}: ${error.message || '保存失败'}`);
          }
        }
        if (updated > 0) toast(`已保存 ${updated}/${targets.length} 个地块的场景配置，模拟器将按新策略生成数据`);
        if (failures.length) toast(`保存失败：${failures.join('；')}`, 'error');
      } catch (error) {
        toast(error.message || '场景配置保存失败', 'error');
      } finally { simBusy.value = false; }
    };
    const togglePlotSimulation = async (plot) => {
      if (!plot || !plot.plotId || simBusy.value) return;
      if (props.state.sessionMode !== 'live') {
        toast('演示会话不能控制后端模拟器', 'error');
        return;
      }
      const target = plot;
      simBusy.value = true;
      try {
        const nextEnabled = !target.enabled;
        await api.updatePlotSimulation(target.plotId, { scenario: target.scenario, enabled: nextEnabled });
        target.enabled = nextEnabled;
        toast(`${target.name || target.plotId} 模拟${nextEnabled ? '已启动' : '已停止'}`);
      } catch (error) {
        toast(error.message || '地块模拟启停失败', 'error');
      } finally { simBusy.value = false; }
    };
    const openReplay = async (run) => {
      selectedReplayScenario.value = run.scenarioId || run.runId || '—';
      adminReplayModal.value = true;
      if (props.state.sessionMode !== 'live') {
        replayEvents.value = [
          { time: '00:00', action: '初始化演示推演环境', agent: '演示引擎' },
          { time: '00:05', action: '记录情景事件', agent: '演示数据' },
          { time: '00:30', action: '生成只读对比结果', agent: '演示引擎' }
        ];
        return;
      }
      try {
        const snapshot = await api.getScenarioSnapshot(run.runId || run.scenarioId);
        const events = [...(snapshot?.branchEvents || []), ...(snapshot?.mainEvents || [])]
          .sort((a, b) => new Date(a.ts || a.createdAt || 0).getTime() - new Date(b.ts || b.createdAt || 0).getTime())
          .map((event) => ({
            time: new Date(event.ts || event.createdAt || 0).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            action: `${event.metric || event.eventType || '情景'}：${event.value ?? event.message ?? '已记录'}`,
            agent: event.branchId || localizedSourceLabel(event.source, '后端仿真')
          }));
        replayEvents.value = events.length ? events : [{ time: '—', action: '后端未提供该运行的事件明细', agent: '后端记录' }];
      } catch (error) {
        replayEvents.value = [{ time: '—', action: error.message || '仿真快照读取失败', agent: '后端' }];
        toast(error.message || '仿真快照读取失败', 'error');
      }
    };

    const openDualTrack = async (run) => {
      selectedDualTrackScenario.value = run.scenarioId || 'NORMAL';
      adminDualTrackModal.value = true;
      if (props.state.sessionMode === 'live') {
        try {
          const comparison = await api.compareScenario({ scenario: run.type, scenarioId: run.scenarioId, seed: run.seed || 42, plotId: run.plotId || props.state.allPlots?.[0]?.plotId || 'plot-a01' });
          Vue.nextTick(() => {
            const chartDom = document.getElementById('adminDualTrackChart');
            if (!chartDom || !window.echarts) return;
            const myChart = echarts.init(chartDom);
            const left = comparison?.leftBranch || {};
            const right = comparison?.rightBranch || {};
            myChart.setOption({
              tooltip: { trigger: 'axis' },
              legend: { data: ['执行分支', '未执行分支'] },
              xAxis: { type: 'category', data: ['样本数', '均值', '最低值', '最高值'] },
              yAxis: { type: 'value', name: '后端统计值' },
              series: [
                { name: '执行分支', type: 'bar', data: [left.eventCount, left.soilMean, left.soilMin, left.soilMax], itemStyle: { color: '#2ea043' } },
                { name: '未执行分支', type: 'bar', data: [right.eventCount, right.soilMean, right.soilMin, right.soilMax], itemStyle: { color: '#f85149' } }
              ]
            });
          });
        } catch (error) {
          toast(error.message || '双轨结果读取失败', 'error');
        }
        return;
      }
      Vue.nextTick(() => {
        const chartDom = document.getElementById('adminDualTrackChart');
        if (chartDom && window.echarts) {
          const myChart = echarts.init(chartDom);
          const times = Array.from({length: 24}, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`);
          const option = {
            tooltip: { trigger: 'axis' },
            legend: { data: ['执行处方 (有干预)', '未执行 (基线漂移)'] },
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
            xAxis: { type: 'category', boundaryGap: false, data: times },
            yAxis: { type: 'value', name: '土壤含水率 (%)', min: 10, max: 40 },
            series: [
              {
                name: '执行处方 (有干预)',
                type: 'line',
                data: times.map((_, i) => i < 8 ? 22 - (i * 0.5) : (i === 8 ? 35 : 35 - ((i - 8) * 0.4))),
                itemStyle: { color: '#2ea043' },
                smooth: true
              },
              {
                name: '未执行 (基线漂移)',
                type: 'line',
                data: times.map((_, i) => 22 - (i * 0.5)),
                itemStyle: { color: '#f85149' },
                lineStyle: { type: 'dashed' },
                smooth: true
              }
            ]
          };
          myChart.setOption(option);
        }
      });
    };

    const scenarios = [
      { id: 'NORMAL', icon: '☀️', label: '正常运行', desc: '标准环境参数运行' },
      { id: 'DROUGHT', icon: '🏜️', label: '干旱场景', desc: '持续高温低湿' },
      { id: 'STORM', icon: '🌧️', label: '暴雨场景', desc: '大量降水+低温' },
      { id: 'SENSOR_DRIFT', icon: '📡', label: '传感器漂移', desc: '读数逐步偏移' },
      { id: 'DEVICE_OFFLINE', icon: '🔌', label: '设备离线', desc: '部分设备断连' }
    ];

    return {
      simRunning, simBusy, plotScenarios, globalScenario, scenarios,
      adminDualTrackModal, selectedDualTrackScenario, openDualTrack,
      adminReplayModal, replayEvents, selectedReplayScenario, openReplay, toggleSimulator, applyPlotScenarios, togglePlotSimulation,
      scenarioLabel, localizedStatusLabel
    };
  }
};

const AdminRulesView = {
  template: '#tmpl-admin-rules',
  props: ['state', 'routeParams'],
  setup(props) {
    const toast = inject('toast');
    const isLiveSession = computed(() => props.state.sessionMode === 'live');
    const activeTab = ref('packs');
    const expandedPacks = ref({});
    const showPackModal = ref(false);
    const editingPackId = ref(null);
    const packForm = ref({ id: '', icon: '🌱', name: '', status: 'draft', stages: [''], knowledgeDocs: [{ title: '', content: '' }], availableForPlanting: true });
    const cropIcons = ['🌱', '🍅', '🥒', '🍓', '🍇', '🌶️', '🥬', '🥕', '🌽', '🍆', '🍉', '🍎'];
    const togglePack = (id) => {
      expandedPacks.value[id] = !expandedPacks.value[id];
    };
    const resetPackForm = () => {
      packForm.value = { id: '', icon: '🌱', name: '', status: 'draft', stages: [''], knowledgeDocs: [{ title: '', content: '' }], availableForPlanting: true };
      editingPackId.value = null;
    };
    const openCreatePack = () => {
      resetPackForm();
      showPackModal.value = true;
    };
    const openEditPack = (pack) => {
      packForm.value = { ...pack, stages: [...pack.stages], knowledgeDocs: pack.knowledgeDocs.map(doc => typeof doc === 'string' ? { title: doc, content: '' } : { ...doc }) };
      editingPackId.value = pack.id;
      showPackModal.value = true;
    };
    const savePack = () => {
      if (isLiveSession.value) {
        toast('正式作物模型包由后端版本目录维护，当前页面只提供读取，未修改本地演示数据。', 'error');
        return;
      }
      const form = packForm.value;
      if (!form.name.trim() || !form.id.trim()) return;
      const normalized = {
        ...form,
        id: form.id.trim(),
        name: form.name.trim(),
        stages: form.stages.map(item => item.trim()).filter(Boolean),
        knowledgeDocs: form.knowledgeDocs.map(doc => ({ title: doc.title.trim(), content: doc.content.trim() })).filter(doc => doc.title)
      };
      const packs = props.state.adminCropPacks;
      if (editingPackId.value) {
        const index = packs.findIndex(pack => pack.id === editingPackId.value);
        if (index >= 0) packs.splice(index, 1, normalized);
      } else if (!packs.some(pack => pack.id === normalized.id)) {
        packs.push(normalized);
      }
      showPackModal.value = false;
      resetPackForm();
    };
    const deletePack = (pack) => {
      if (isLiveSession.value) {
        toast('正式作物模型包暂无删除接口，未修改后端数据。', 'error');
        return;
      }
      if (confirm(`确定删除作物包“${pack.name}”吗？`)) {
        const index = props.state.adminCropPacks.findIndex(item => item.id === pack.id);
        if (index >= 0) props.state.adminCropPacks.splice(index, 1);
      }
    };
    const togglePackStatus = async (pack) => {
      const nextStatus = pack.status === 'published' ? 'draft' : 'published';
      if (isLiveSession.value) {
        try {
          await api.updateCropPackStatus(pack.cropCode, pack.version, nextStatus);
          pack.status = nextStatus;
          toast(`作物模型包状态已更新为“${localizedStatusLabel(nextStatus)}”`);
        } catch (error) {
          toast(error.message || 'Crop Pack 状态更新失败', 'error');
        }
        return;
      }
      pack.status = nextStatus;
    };
    const transitionCandidate = async (candidate, status) => {
      if (!candidate?.id) return;
      try {
        const saved = await api.transitionStrategyCandidate(candidate.id, status);
        candidate.status = String(saved?.status || status).toLowerCase();
        toast(`策略候选已更新为“${localizedStatusLabel(candidate.status)}”，后端记录已同步`);
      } catch (error) { toast(error.message || '策略候选更新失败', 'error'); }
    };
    const addStage = () => packForm.value.stages.push('');
    const removeStage = (index) => packForm.value.stages.splice(index, 1);
    const addKnowledgeDoc = () => packForm.value.knowledgeDocs.push({ title: '', content: '' });
    const removeKnowledgeDoc = (index) => packForm.value.knowledgeDocs.splice(index, 1);
    const expandedKnowledge = ref(null);
    const masonryCols = ref(3);
    const updateMasonryCols = () => {
      if (window.innerWidth < 768) masonryCols.value = 1;
      else if (window.innerWidth < 1100) masonryCols.value = 2;
      else if (window.innerWidth < 1600) masonryCols.value = 3;
      else masonryCols.value = 4;
    };
    onMounted(() => {
      updateMasonryCols();
      window.addEventListener('resize', updateMasonryCols);
    });
    onBeforeUnmount(() => {
      window.removeEventListener('resize', updateMasonryCols);
    });
    const masonryColumns = computed(() => {
      const cols = Array.from({ length: masonryCols.value }, () => []);
      props.state.adminCropPacks.forEach((pack, i) => {
        cols[i % masonryCols.value].push(pack);
      });
      return cols;
    });
    const toggleKnowledge = (packId, index) => {
      const key = `${packId}:${index}`;
      expandedKnowledge.value = expandedKnowledge.value === key ? null : key;
    };
    return {
      activeTab, expandedPacks, togglePack, showPackModal, editingPackId, packForm, cropIcons,
      expandedKnowledge, masonryCols, masonryColumns, openCreatePack, openEditPack, savePack,
      deletePack, togglePackStatus, addStage, removeStage, addKnowledgeDoc, removeKnowledgeDoc,
      toggleKnowledge, transitionCandidate, localizedStatusLabel, localizedSourceLabel, displayText
    };
  }
};

const AdminSettingsView = {
  template: '#tmpl-admin-settings',
  props: ['state', 'routeParams'],
  setup(props) {
    const toast = inject('toast');
    const isLiveSession = computed(() => props.state.sessionMode === 'live');
    const activeTab = ref(props.routeParams?.tab || 'users');
    const roleFilter = ref('all');
    const logFilter = ref('all');
    const showCreateUser = ref(false);
    const newUser = ref({ username: '', password: '', role: 'FARMER', farmId: 'farm-demo' });
    const pendingUserAction = ref(null);
    // 智能模型模式选择是"草稿"：下拉只改本地草稿，点击保存才写回总览/服务健康并（live 下）提交后端
    // live 初始化时 emptyAdminOverview().aiMode 为 '—'（占位符），视为无值，兜底为默认完整模式
    const initialAiMode = props.state.adminOverview && props.state.adminOverview.aiMode;
    const draftAiMode = ref(initialAiMode && initialAiMode !== '—' ? initialAiMode : 'full');
    watch(() => props.state.adminOverview && props.state.adminOverview.aiMode, (mode) => {
      if (mode) draftAiMode.value = mode;
    });

    watch(() => props.routeParams, (params) => {
      if (params?.tab) activeTab.value = params.tab;
    });

    const filteredUsers = computed(() => {
      const users = props.state.adminUsers || [];
      if (roleFilter.value === 'all') return users;
      return users.filter(u => u.role === roleFilter.value);
    });

    const filteredLogs = computed(() => {
      const logs = props.state.adminAuditLogs || [];
      if (logFilter.value === 'all') return logs;
      return logs.filter(l => l.action === logFilter.value);
    });

    const permissionMatrix = [
      { module: '地块监测', farmer: '👁 只读 (分配地块)', farmAdmin: '✅ 全部地块', sysAdmin: '👁 只读 (排查)' },
      { module: '农务工单', farmer: '✅ 接受/完成', farmAdmin: '✅ 创建/分派/验收', sysAdmin: '👁 审计记录' },
      { module: '告警处理', farmer: '👁 自己地块', farmAdmin: '✅ 确认/关闭/升级', sysAdmin: '✅ 系统级告警' },
      { module: '智能诊断', farmer: '👁 查看结论', farmAdmin: '✅ 跨地块诊断', sysAdmin: '❌ 不提供入口' },
      { module: '灌溉控制', farmer: '✅ 确认并执行', farmAdmin: '✅ 确认并执行', sysAdmin: '✅ 受控执行' },
      { module: '设备管理', farmer: '👁 查看/报修', farmAdmin: '✅ 绑定/配置', sysAdmin: '👁 接入异常' },
      { module: '成员管理', farmer: '👁 个人资料', farmAdmin: '✅ 本场农户', sysAdmin: '✅ 全部账号/角色' },
      { module: '作物与规则', farmer: '👁 当前标准', farmAdmin: '✅ 农场参数', sysAdmin: '✅ 作物模型包与版本发布' },
      { module: '审计记录', farmer: '👁 个人记录', farmAdmin: '👁 本场记录', sysAdmin: '✅ 全平台审计' }
    ];

    const deleteUser = (userId) => {
      const user = (props.state.adminUsers || []).find(u => u.userId === userId);
      if (!user) return;
      pendingUserAction.value = { type: 'delete', user };
    };

    const toggleUser = (user) => {
      pendingUserAction.value = { type: user.enabled ? 'disable' : 'enable', user };
    };

    const confirmUserAction = async () => {
      const action = pendingUserAction.value;
      if (!action) return;
      const { type, user } = action;
      const username = user.username || user.userId;
      try {
        if (type === 'delete') {
          if (isLiveSession.value) {
            await api.deleteUserAccount(user.userId);
          }
          const idx = props.state.adminUsers.findIndex(u => u.userId === user.userId);
          if (idx > -1) {
            props.state.adminUsers.splice(idx, 1);
            props.state.adminAuditLogs.unshift({
              id: 'log-' + Date.now(),
              time: new Date().toLocaleTimeString().substring(0, 5),
              operator: 'sysadmin',
              action: 'CONFIG_CHANGE',
              actionLabel: '删除用户',
              detail: '删除用户 ' + username + ' (' + (user.roleLabel || user.role || '') + ')',
              ip: '127.0.0.1'
            });
          }
          toast(`账号 ${username} 已删除`);
        } else {
          const enabled = type === 'enable';
          if (isLiveSession.value) {
            const farmId = (user.farmIds && user.farmIds[0]) || 'farm-demo';
            await api.updateFarmMemberStatus(user.userId, { farmId, enabled });
          }
          user.enabled = enabled;
          if (user.status) user.status = enabled ? 'ACTIVE' : 'INACTIVE';
          props.state.adminAuditLogs.unshift({
            id: 'log-' + Date.now(),
            time: new Date().toLocaleTimeString().substring(0, 5),
            operator: 'sysadmin',
            action: 'CONFIG_CHANGE',
            actionLabel: enabled ? '启用用户' : '停用用户',
            detail: (enabled ? '启用' : '停用') + '账号 ' + username + ' (' + (user.roleLabel || user.role || '') + ')',
            ip: '127.0.0.1'
          });
          toast(enabled ? `账号 ${username} 已启用` : `账号 ${username} 已停用`);
        }
      } catch (error) {
        toast(error.message || '操作失败', 'error');
      } finally {
        pendingUserAction.value = null;
      }
    };

    const createUser = async () => {
      const roleLabels = { FARMER: '种植农户', FARM_ADMIN: '农场管理员', SYSTEM_ADMIN: '系统管理员' };
      if (isLiveSession.value) {
        try {
          const user = await api.createFarmMember({
            farmId: newUser.value.farmId || 'farm-demo',
            username: newUser.value.username,
            password: newUser.value.password,
            role: newUser.value.role,
            plotIds: []
          });
          props.state.adminUsers.push({
            userId: user.userId || 'user-' + Date.now(),
            username: user.username || newUser.value.username,
            role: user.role || newUser.value.role,
            roleLabel: roleLabels[user.role || newUser.value.role],
            farmName: '远程农场',
            plotIds: user.plotIds || [],
            enabled: user.enabled !== false,
            createdAt: new Date().toISOString().split('T')[0]
          });
          toast(`账号 ${newUser.value.username} 创建成功`);
          showCreateUser.value = false;
          newUser.value = { username: '', password: '', role: 'FARMER', farmId: 'farm-demo' };
        } catch (error) {
          toast(error.message || '账号创建失败', 'error');
        }
        return;
      }
      props.state.adminUsers.push({
        userId: 'user-' + Date.now(),
        username: newUser.value.username,
        role: newUser.value.role,
        roleLabel: roleLabels[newUser.value.role],
        farmName: '农智示范农场',
        plotIds: ['plot-a01'],
        enabled: true,
        createdAt: new Date().toISOString().split('T')[0]
      });
      props.state.adminAuditLogs.unshift({
        id: 'log-' + Date.now(),
        time: new Date().toLocaleTimeString().substring(0, 5),
        operator: 'sysadmin',
        action: 'USER_CREATE',
        actionLabel: '创建用户',
        detail: '创建用户 ' + newUser.value.username + ' (' + roleLabels[newUser.value.role] + ')',
        ip: '127.0.0.1'
      });
      showCreateUser.value = false;
      newUser.value = { username: '', password: '', role: 'FARMER', farmId: 'farm-demo' };
      toast('用户创建成功');
    };

    // 保存成功后把新模式写回总览与服务健康矩阵（总览/服务健康保持一致）
    const applyAiModeToOverview = (mode) => {
      const ov = props.state.adminOverview;
      if (!ov) return;
      ov.aiMode = mode;
      const svc = (Array.isArray(ov.services) ? ov.services : []).find(
        s => s.name === '智能模型服务' || s.name === 'Qwen LLM'
      );
      if (svc) {
        svc.mode = mode;
        svc.status = aiServiceStatus(mode);
        if (svc.statusLabel !== undefined) delete svc.statusLabel;
      }
    };

    const saveAiMode = async () => {
      const mode = String(draftAiMode.value || '').trim().toLowerCase();
      // 只允许下拉的三个合法模式；防止 '—' 占位等异常草稿被提交到后端（后端会 400）
      if (!['full', 'rules-only', 'mock'].includes(mode)) {
        toast('请先选择有效的智能模型模式（完整 / 规则兜底 / 模拟）', 'error');
        return;
      }
      try {
        const saved = await api.updateAiMode(mode);
        const savedMode = saved.aiMode === 'openai-compatible' ? 'full' : (saved.aiMode || mode);
        applyAiModeToOverview(savedMode);
        draftAiMode.value = savedMode;
        if (isLiveSession.value) {
          props.state.adminAuditLogs.unshift({
            id: 'log-' + Date.now(),
            time: new Date().toLocaleTimeString().substring(0, 5),
            operator: 'sysadmin',
            action: 'CONFIG_CHANGE',
            actionLabel: '修改配置',
            detail: '智能模型模式切换：' + (saved.previous || '—') + ' → ' + savedMode,
            ip: '127.0.0.1'
          });
          toast(`智能模型模式已保存为「${modeLabel(savedMode, savedMode)}」`);
        } else {
          toast('演示模式已保存（刷新后保留）');
        }
      } catch (error) {
        toast(error.message || '模式保存失败', 'error');
      }
    };

      const formatPerm = (text) => {
        if (!text) return '';
        return text
          .replace('👁', '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom; color: var(--g-text-tertiary)">visibility</span>')
          .replace('✅', '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom; color: var(--g-success)">check_circle</span>')
          .replace('❌', '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom; color: var(--g-danger)">cancel</span>')
          .replace('➖', '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom; color: var(--g-text-tertiary)">horizontal_rule</span>');
      };
    return {
      activeTab, roleFilter, logFilter, showCreateUser, newUser, pendingUserAction, draftAiMode, filteredUsers, filteredLogs,
      permissionMatrix, formatPerm, createUser, deleteUser, toggleUser, confirmUserAction, saveAiMode, localizedStatusLabel, displayText
    };
  }
};

// 2. Setup App
const app = createApp({
  components: {
    'admin-overview-view': AdminOverviewView,
    'admin-ops-view': AdminOpsView,
    'admin-audit-view': AdminAuditView,
    'admin-simulator-view': AdminSimulatorView,
    'admin-rules-view': AdminRulesView,
    'admin-settings-view': AdminSettingsView
  },
  setup() {
    const isLive = ref(false);
    const isDark = ref(false);
    const isSidebarOpen = ref(!window.matchMedia('(max-width: 760px)').matches);
    const showProfileMenu = ref(false);
    const showFarmMenu = ref(false);
    const showAccountModal = ref(false);
    const passwordForm = ref({ current: '', next: '', confirm: '' });
    const passwordError = ref('');

    const toasts = ref([]);
    const seenSystemEventIds = new Set();

    const showToast = (message, type = 'success') => {
      const id = Date.now() + Math.random();
      toasts.value.push({ id, message, type });
      setTimeout(() => {
        toasts.value = toasts.value.filter(t => t.id !== id);
      }, 3000);
    };
    const session = api.readSession();
    const sessionUser = presentRoleUser(session?.user);
    const initialUser = sessionUser || presentRoleUser(MOCK_DATA.currentUser);
    const isDemoSession = session?.mode !== 'live';

    // Reactive State representing all the data originally rendered manually
    const state = ref({
      currentUser: initialUser,
      allowedViews: roleViews(initialUser),
      sessionMode: session?.mode || 'demo',
      adminContext: { farmId: '', plotId: null, sessionMode: session?.mode || 'demo' },
      farms: isDemoSession ? MOCK_DATA.farms.map(farm => ({ ...farm, sourceMode: 'SIMULATED' })) : [],
      plots: isDemoSession ? scopePlots(MOCK_DATA.plots, initialUser) : [],
      allPlots: isDemoSession ? scopePlots(MOCK_DATA.plots, initialUser).map(plot => ({ ...plot, status: plot.status || 'ACTIVE' })) : [],
      overview: isDemoSession ? {} : {},
      feedItems: isDemoSession ? MOCK_DATA.feedItems.map((item) => ({ ...item })) : [],
      alerts: isDemoSession ? (MOCK_DATA.alerts || []).map((item) => ({ ...item })) : [],
      workOrders: isDemoSession ? MOCK_DATA.workOrders.map((item) => ({ ...item })) : [],
      farmMembers: isDemoSession ? (MOCK_DATA.farmMembers || []).map((item) => ({ ...item })) : [],
      devices: [],
      cropBatches: [],
      cropPacks: isDemoSession ? (MOCK_DATA.cropPackDetails || []) : [],
      valueLedgers: [],
      simulatorStatus: isDemoSession ? { available: false, status: 'UNAVAILABLE', reason: 'DEMO_SESSION' } : { available: false, status: 'UNAVAILABLE', reason: 'BACKEND_OFFLINE' },
      inspections: isDemoSession ? (MOCK_DATA.inspections || []).map((item) => ({ ...item })) : [],
      resourceProfile: isDemoSession ? MOCK_DATA.resourceProfile : {},
      cropPackDetails: isDemoSession ? MOCK_DATA.cropPackDetails : [],
      riskForecastConfig: isDemoSession ? MOCK_DATA.riskForecastConfig : EMPTY_RISK_FORECAST_CONFIG,
      farmerMessages: isDemoSession ? (MOCK_DATA.farmer_messages || []).map((item) => ({ ...item })) : [],
      farmerTasks: isDemoSession ? (MOCK_DATA.farmer_tasks || []).map((item) => ({ ...item })) : [],
      farmerProfile: isDemoSession ? (MOCK_DATA.farmer_profile || {}) : {},
      gapCoverage: isDemoSession ? (MOCK_DATA.gapCoverage || {}) : {},
      adminOverview: isDemoSession ? applyDemoAiMode(MOCK_DATA.adminOverview || {}) : emptyAdminOverview(),
      adminGlobalPlots: isDemoSession ? (MOCK_DATA.adminGlobalPlots || []) : [],
      adminDevices: isDemoSession ? (MOCK_DATA.adminDevices || []) : [],
      adminAlerts: isDemoSession ? (MOCK_DATA.adminAlerts || []) : [],
      adminAuditRecords: isDemoSession ? (MOCK_DATA.adminAuditRecords || []) : [],
      adminSimHistory: isDemoSession ? (MOCK_DATA.adminSimHistory || []) : [],
      adminCropPacks: isDemoSession ? (MOCK_DATA.adminCropPacks || []) : [],
      adminRules: isDemoSession ? (MOCK_DATA.adminRules || []) : [],
      adminStrategyCandidates: isDemoSession ? (MOCK_DATA.adminStrategyCandidates || []) : [],
      adminUsers: isDemoSession ? (MOCK_DATA.adminUsers || []) : [],
      adminAuditLogs: isDemoSession ? (MOCK_DATA.adminAuditLogs || []) : []
    });

    let contextRequestVersion = 0;
    let systemRequestVersion = 0;
    let systemRefreshTimer = null;
    let farmRefreshTimer = null;
    let systemRefreshInFlight = false;
    let systemRefreshQueued = false;
    let systemLastRefreshAt = 0;
    let farmRefreshInFlight = false;
    let farmRefreshQueued = false;
    let farmLastRefreshAt = 0;
    let livePollTimer = null;
    let liveVisibilityHandler = null;
    let liveOnlineHandler = null;
    let liveEventsStop = null;
    let liveEventsConnecting = false;
    let liveHealthProbeInFlight = false;
    const pendingFarmDomains = new Set();
    const LIVE_FARM_REFRESH_DOMAINS = Object.freeze([
      'overview', 'plots', 'workOrders', 'alerts', 'devices', 'members', 'batches', 'ledgers', 'simulator'
    ]);
    const scheduleSystemRefresh = (delay = 450) => {
      if (state.value.sessionMode !== 'live') return;
      if (systemRefreshInFlight) {
        systemRefreshQueued = true;
        return;
      }
      if (systemRefreshTimer) return;
      const waitForThrottle = Math.max(0, 3000 - (Date.now() - systemLastRefreshAt));
      systemRefreshTimer = window.setTimeout(async () => {
        systemRefreshTimer = null;
        if (document.hidden) {
          systemRefreshQueued = true;
          return;
        }
        if (systemRefreshInFlight) {
          systemRefreshQueued = true;
          return;
        }
        systemRefreshInFlight = true;
        try {
          await refreshSystemAdminData({ announceErrors: false });
        } finally {
          isLive.value = api.isLive;
          systemLastRefreshAt = Date.now();
          systemRefreshInFlight = false;
          if (systemRefreshQueued && !document.hidden) {
            systemRefreshQueued = false;
            scheduleSystemRefresh(250);
          }
        }
      }, Math.max(delay, waitForThrottle));
    };
    const scheduleFarmRefresh = (domains = [], delay = 450) => {
      domains.forEach((domain) => pendingFarmDomains.add(domain));
      if (state.value.sessionMode !== 'live') return;
      if (farmRefreshInFlight) {
        farmRefreshQueued = true;
        return;
      }
      if (farmRefreshTimer) return;
      const waitForThrottle = Math.max(0, 1800 - (Date.now() - farmLastRefreshAt));
      farmRefreshTimer = window.setTimeout(async () => {
        farmRefreshTimer = null;
        if (document.hidden) {
          farmRefreshQueued = true;
          return;
        }
        if (farmRefreshInFlight) {
          farmRefreshQueued = true;
          return;
        }
        const requested = [...pendingFarmDomains];
        pendingFarmDomains.clear();
        farmRefreshInFlight = true;
        try {
          await refreshFarmData(state.value.adminContext.farmId, requested.length ? requested : ['overview', 'plots'], { announceErrors: false });
        } finally {
          isLive.value = api.isLive;
          farmLastRefreshAt = Date.now();
          farmRefreshInFlight = false;
          if (farmRefreshQueued && !document.hidden) {
            farmRefreshQueued = false;
            scheduleFarmRefresh([], 250);
          }
        }
      }, Math.max(delay, waitForThrottle));
    };
    let requestContextChange = async () => {};
    const selectedFarmId = computed({
      get: () => state.value.adminContext.farmId || state.value.farms[0]?.farmId || '',
      set: farmId => {
        if (state.value.currentUser?.role === 'FARM_ADMIN') requestContextChange({ farmId, plotId: null, sessionMode: state.value.sessionMode });
        else state.value.adminContext = { ...state.value.adminContext, farmId };
      }
    });

    const selectedFarm = computed(() => state.value.farms.find(f => f.farmId === selectedFarmId.value) || {});
    const accountProfile = computed(() => buildAccountProfile(state.value.currentUser, {
      state: state.value,
      farms: state.value.farms,
      farmId: state.value.adminContext.farmId || selectedFarmId.value,
      isLive: state.value.sessionMode === 'live'
    }));

    const currentRole = computed(() => roleDefinition(state.value.currentUser?.role));
    const isFarmer = computed(() => state.value.currentUser?.role === 'FARMER');
    const navItems = computed(() => {
      return state.value.allowedViews
        .map((viewId) => NAV_CATALOG.find((item) => item.id === viewId))
        .filter(Boolean)
        .map((item) => ({ ...item, label: item.labels?.[currentRole.value?.code] || item.label }));
    });
    const initialRoute = parseHashRoute();
    const initialView = initialRoute.view === 'plot-detail' ? currentRole.value.defaultView : initialRoute.view;
    const currentView = ref(state.value.allowedViews.includes(initialView) ? initialView : currentRole.value.defaultView);
    const routeParams = ref(initialRoute.view === 'plot-detail' ? {} : initialRoute.params);
    const selectedPlotId = ref(initialRoute.view === 'plot-detail' ? initialRoute.params.plotId || '' : '');

    const currentViewComponent = computed(() => `${currentView.value}-view`);
    const selectedPlot = computed(() => (state.value.allPlots || state.value.plots).find((plot) => plot.plotId === selectedPlotId.value) || null);
    const roleClass = computed(() => `role-${String(state.value.currentUser?.role || 'unknown').toLowerCase().replaceAll('_', '-')}`);
    watch(roleClass, (className) => {
      document.getElementById('app')?.setAttribute('class', className);
    }, { immediate: true });

    const toggleTheme = () => {
      isDark.value = !isDark.value;
      const theme = isDark.value ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.colorScheme = theme;
      localStorage.setItem('agriloop-theme', theme);
    };

    const toggleSidebar = () => {
      isSidebarOpen.value = !isSidebarOpen.value;
    };

    const toggleProfileMenu = () => {
      showProfileMenu.value = !showProfileMenu.value;
    };

    const closeProfileMenu = () => {
      showProfileMenu.value = false;
    };

    const handleGlobalClick = (e) => {
      if (!e.target.closest('.account-profile-anchor')) {
        closeProfileMenu();
      }
      if (!e.target.closest('.g-header-center')) {
        showFarmMenu.value = false;
      }
    };
    onMounted(() => document.addEventListener('click', handleGlobalClick, true));
    onBeforeUnmount(() => document.removeEventListener('click', handleGlobalClick, true));

    const openAccountModal = () => {
      closeProfileMenu();
      passwordForm.value = { current: '', next: '', confirm: '' };
      passwordError.value = '';
      showAccountModal.value = true;
    };

    const closeAccountModal = () => {
      showAccountModal.value = false;
      passwordError.value = '';
    };

    const changePassword = async () => {
      passwordError.value = '';
      if (!passwordForm.value.current) {
        passwordError.value = '请输入当前密码';
        return;
      }
      if (passwordForm.value.next.length < 8) {
        passwordError.value = '新密码至少需要 8 位，并同时包含字母和数字';
        return;
      }
      if (passwordForm.value.next !== passwordForm.value.confirm) {
        passwordError.value = '两次输入的新密码不一致';
        return;
      }
      if (state.value.sessionMode === 'live') {
        try {
          await api.changePassword({ currentPassword: passwordForm.value.current, newPassword: passwordForm.value.next });
          closeAccountModal();
          showToast('密码已更新，当前登录仍然有效，旧令牌已失效');
        } catch (error) {
          passwordError.value = error.message || '密码修改失败';
        }
        return;
      }
      closeAccountModal();
      showToast('演示密码修改成功');
    };

    const forgotPassword = () => {
      closeProfileMenu();
      showToast(state.value.sessionMode === 'live'
        ? '请退出后在登录页使用恢复码重设密码'
        : `演示找回密码指引：${accountProfile.value.contact}`);
    };

    const logout = () => {
      api.clearSession();
      window.location.replace('login.html');
    };

    const farmerReturnPage = ref(readFarmerReturnPage());
    if (farmerReturnPage.value) {
      isSidebarOpen.value = true;
    }
    const returnToFarmer = () => {
      const page = farmerReturnPage.value || 'farmer.html';
      try {
        sessionStorage.removeItem(FARMER_SHARED_CONTEXT_KEY);
      } catch (error) {
        // Ignore storage failures; navigation still works.
      }
      window.location.assign(page);
    };

    const refreshFarmData = async (farmId, domains = ['all'], { announceErrors = true } = {}) => {
      if (!farmId || state.value.currentUser?.role !== 'FARM_ADMIN') return;
      const version = ++contextRequestVersion;
      const requested = new Set(domains || []);
      const all = requested.has('all');
      const wants = domain => all || requested.has(domain);
      const jobs = {};
      if (wants('overview') || wants('plots')) {
        jobs.overview = api.getOverview({ farmId });
        jobs.plots = api.getPlots({ farmId, includeInactive: true });
      }
      if (wants('workOrders') || wants('overview')) jobs.workOrders = api.getWorkOrders({ farmId });
      if (wants('alerts') || wants('overview')) jobs.alerts = api.getAlerts({ farmId });
      if (wants('devices')) jobs.devices = api.getDevices({ farmId });
      if (wants('members')) jobs.members = api.getFarmMembers({ farmId });
      if (wants('batches')) jobs.batches = api.getCropBatches({ farmId });
      if (wants('ledgers')) jobs.ledgers = api.getValueLedgers({ farmId });
      if (wants('cropPacks')) jobs.cropPacks = api.getCropPacks();
      if (wants('simulator')) jobs.simulator = api.getSimulatorStatus();
      if (wants('inspections') || wants('overview')) {
        jobs.inspections = api.getPlots({ farmId, includeInactive: false })
          .then((plots) => Promise.allSettled((plots || []).map((plot) => api.getInspections(plot.plotId))))
          .then((results) => results
            .filter((result) => result.status === 'fulfilled')
            .flatMap((result) => result.value || []));
      }
      const entries = Object.entries(jobs);
      const settled = await Promise.all(entries.map(async ([key, promise]) => {
        try { return [key, { status: 'fulfilled', value: await promise }]; }
        catch (reason) { return [key, { status: 'rejected', reason }]; }
      }));
      if (!isLatestFarmResponse(version, contextRequestVersion, farmId, state.value.adminContext.farmId)) return;
      const results = Object.fromEntries(settled);
      const failed = [];
      Object.entries(results).forEach(([key, result]) => {
        if (result.status === 'rejected') failed.push(`${key}: ${result.reason?.message || '读取失败'}`);
      });
      const overview = results.overview?.status === 'fulfilled' ? results.overview.value : state.value.overview;
      const facts = results.plots?.status === 'fulfilled' ? results.plots.value : state.value.allPlots;
      if (results.overview?.status === 'fulfilled') state.value.overview = overview || {};
      if (hasFarmPlotRefresh(results)) {
        const refreshedDevices = results.devices?.status === 'fulfilled' ? results.devices.value : state.value.devices;
        const merged = mergeFarmPlots(Array.isArray(facts) ? facts : [], overview?.plots || [], refreshedDevices || []);
        state.value.allPlots = merged;
        state.value.plots = merged.filter(plot => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');
      }
      if (results.workOrders?.status === 'fulfilled') state.value.workOrders = results.workOrders.value || [];
      if (results.alerts?.status === 'fulfilled') state.value.alerts = results.alerts.value || [];
      if (results.devices?.status === 'fulfilled') state.value.devices = results.devices.value || [];
      if (results.members?.status === 'fulfilled') state.value.farmMembers = results.members.value || [];
      if (results.batches?.status === 'fulfilled') state.value.cropBatches = results.batches.value || [];
      if (results.ledgers?.status === 'fulfilled') state.value.valueLedgers = results.ledgers.value || [];
      if (results.cropPacks?.status === 'fulfilled') {
        state.value.cropPacks = results.cropPacks.value || [];
        state.value.cropPackDetails = state.value.cropPacks;
      }
      if (results.simulator?.status === 'fulfilled') state.value.simulatorStatus = results.simulator.value || state.value.simulatorStatus;
      if (results.inspections?.status === 'fulfilled') {
        state.value.inspections = Array.from(new Map((results.inspections.value || []).map((record) => [record.inspectionId, record])).values());
      }
      state.value.feedItems = buildLiveFeedItems({
        alerts: state.value.alerts,
        workOrders: state.value.workOrders,
        inspections: state.value.inspections,
        plots: state.value.allPlots
      });
      if (selectedPlotId.value && !state.value.allPlots.some(plot => plot.plotId === selectedPlotId.value)) selectedPlotId.value = '';
      if (failed.length && announceErrors) showToast(`部分正式数据读取失败：${failed.join('；')}`, 'error');
    };

    const refreshSystemAdminData = async ({ announceErrors = true } = {}) => {
      if (state.value.currentUser?.role !== 'SYSTEM_ADMIN' || state.value.sessionMode !== 'live') return;
      const version = ++systemRequestVersion;
      const jobs = {
        farms: api.getFarms(),
        overview: api.getOverview(),
        plots: api.getPlots({ includeInactive: true }),
        workOrders: api.getWorkOrders(),
        alerts: api.getAlerts(),
        cropPacks: api.getCropPacks(),
        rules: api.getRules(),
        strategies: api.getStrategyCandidates(),
        simulator: api.getSimulatorStatus(),
        systemStatus: (async () => {
          const startedAt = performance.now();
          const status = await api.getSystemStatus();
          return { ...(status || {}), requestLatencyMs: Math.round(performance.now() - startedAt) };
        })(),
        scenarios: api.getScenarioRuns()
      };
      const settled = await Promise.all(Object.entries(jobs).map(async ([key, promise]) => {
        try { return [key, { status: 'fulfilled', value: await promise }]; }
        catch (reason) { return [key, { status: 'rejected', reason }]; }
      }));
      if (version !== systemRequestVersion || state.value.currentUser?.role !== 'SYSTEM_ADMIN') return;
      const results = Object.fromEntries(settled);
      const failures = Object.entries(results)
        .filter(([, result]) => result.status === 'rejected')
        .map(([key, result]) => `${key}: ${result.reason?.message || '读取失败'}`);
      const farms = results.farms?.status === 'fulfilled' ? (results.farms.value || []) : state.value.farms;
      const rawPlots = results.plots?.status === 'fulfilled' ? (results.plots.value || []) : [];
      const overview = results.overview?.status === 'fulfilled' ? (results.overview.value || {}) : {};
      const overviewCards = Array.isArray(overview.plots) ? overview.plots : [];
      const cardMap = new Map(overviewCards.map((card) => [String(card.plotId), card]));
      const plots = rawPlots.map((plot) => normalizePlot(plot, cardMap.get(String(plot.plotId)) || {}));
      const plotMap = new Map(plots.map((plot) => [String(plot.plotId), plot]));
      const farmMap = new Map(farms.map((farm) => [String(farm.farmId), farm]));
      const workOrders = results.workOrders?.status === 'fulfilled' ? (results.workOrders.value || []) : [];
      const alerts = results.alerts?.status === 'fulfilled' ? (results.alerts.value || []) : [];
      const devices = [];
      const members = [];
      const ledgers = [];
      const timelineEntries = [];
      const inspectionEntries = [];
      const farmIds = farms.map((farm) => farm.farmId).filter(Boolean);
      const farmJobs = await Promise.all(farmIds.map(async (farmId) => {
        const [deviceResult, memberResult, ledgerResult] = await Promise.allSettled([
          api.getDevices({ farmId }),
          api.getFarmMembers({ farmId }),
          api.getValueLedgers({ farmId })
        ]);
        return { farmId, deviceResult, memberResult, ledgerResult };
      }));
      farmJobs.forEach(({ deviceResult, memberResult, ledgerResult }) => {
        if (deviceResult.status === 'fulfilled') devices.push(...(deviceResult.value || []));
        if (memberResult.status === 'fulfilled') members.push(...(memberResult.value || []));
        if (ledgerResult.status === 'fulfilled') ledgers.push(...(ledgerResult.value || []));
      });
      const timelineResults = await Promise.allSettled(plots.map(async (plot) => Promise.allSettled([
        api.getPlotTimeline(plot.plotId),
        api.getInspections(plot.plotId)
      ])));
      timelineResults.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        const [timelineResult, inspectionResult] = result.value;
        if (timelineResult.status === 'fulfilled') timelineEntries.push(...(timelineResult.value || []));
        if (inspectionResult.status === 'fulfilled') inspectionEntries.push(...(inspectionResult.value || []));
      });
      const auditRecords = timelineEntries
        .map((entry, index) => mapTimelineRecord(entry, plotMap, index))
        .sort((a, b) => (new Date(b.timeIso || 0).getTime() || 0) - (new Date(a.timeIso || 0).getTime() || 0))
        .filter((record, index, list) => list.findIndex((candidate) => candidate.traceId === record.traceId) === index);
      // The timeline also contains high-volume telemetry/heartbeat rows. They
      // belong in the audit view, but a platform overview should show a
      // concise, actionable digest instead of twenty identical sensor rows.
      const recentEventRecords = auditRecords
        .filter((record) => !['TELEMETRY', 'HEARTBEAT', 'SCENARIO.TELEMETRY'].includes(record.type))
        .filter((record) => record.summary && record.summary !== 'EVENT 事件')
        .filter((record, index, list) => list.findIndex((candidate) =>
          candidate.plotId === record.plotId && candidate.type === record.type && candidate.summary === record.summary
        ) === index)
        .slice(0, 20);
      const recentEvents = recentEventRecords.map((record) => ({
        id: `audit:${record.traceId}`,
        category: record.type === 'ALERT' || record.result === 'REJECT' ? 'alert' : record.type === 'DIAGNOSIS' ? 'agent' : 'system',
        icon: record.type === 'ALERT' || record.result === 'REJECT' ? 'warning' : record.type === 'DIAGNOSIS' ? 'psychology' : record.type === 'COMMAND' ? 'login' : 'history',
        title: `${record.plotId !== '—' ? `${record.plotId} · ` : ''}${record.summary}`,
        time: record.time,
        traceId: record.traceId,
        dataOrigin: 'BACKEND'
      }));
      if (!recentEvents.length) {
        recentEvents.push(...alerts.slice(0, 8).map((alert, index) => ({
          id: `alert:${alert.alertId || alert.id || index}`,
          category: 'alert',
          icon: 'warning',
          title: `${alert.plotId ? `${alert.plotId} · ` : ''}${alert.title || alert.message || alert.source || '平台告警'}`,
          time: relativeTime(alert.createdAt || alert.raisedAt || alert.updatedAt),
          traceId: alert.alertId || alert.id,
          dataOrigin: 'BACKEND'
        })));
      }
      const adminPlots = plots.map((plot) => mapAdminPlot(plot, farmMap));
      const adminDevices = devices.map((device) => mapAdminDevice(device, plotMap));
      const adminAlerts = alerts.map((alert) => mapAdminAlert(alert, plotMap));
      const adminCropPacks = (results.cropPacks?.status === 'fulfilled' ? results.cropPacks.value : []).map(mapCropPack);
      const adminRules = (results.rules?.status === 'fulfilled' ? results.rules.value : []).map(mapAdminRule);
      const adminStrategyCandidates = (results.strategies?.status === 'fulfilled' ? results.strategies.value : []).map(mapStrategyCandidate);
      const currentUser = state.value.currentUser;
      const adminUsers = mapSystemMembers(members, farms);
      if (!adminUsers.some((member) => member.userId === currentUser.userId)) {
        adminUsers.unshift({
          userId: currentUser.userId,
          username: currentUser.username,
          displayName: currentUser.displayName || currentUser.username,
          role: currentUser.role,
          roleLabel: currentUser.roleLabel,
          farmIds: currentUser.farmIds || ['*'],
          plotIds: currentUser.plotIds || ['*'],
          farmName: '全平台',
          enabled: true,
          status: 'ACTIVE',
          createdAt: '—',
          dataOrigin: 'BACKEND'
        });
      }
      const adminAuditLogs = auditRecords.map((record) => ({
        id: `log:${record.traceId}`,
        time: record.time,
        operator: record.operator,
        action: record.type,
        actionLabel: record.typeLabel,
        detail: record.summary,
        ip: '—',
        dataOrigin: 'BACKEND'
      }));
      state.value.farms = farms;
      state.value.overview = overview;
      state.value.plots = plots.filter((plot) => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');
      state.value.allPlots = plots;
      state.value.workOrders = workOrders;
      state.value.alerts = alerts;
      state.value.inspections = Array.from(new Map(inspectionEntries.map((record) => [record.inspectionId, record])).values());
      state.value.feedItems = buildLiveFeedItems({ alerts, workOrders, inspections: state.value.inspections, plots });
      state.value.devices = devices;
      state.value.farmMembers = members;
      state.value.valueLedgers = ledgers;
      state.value.cropPacks = results.cropPacks?.status === 'fulfilled' ? results.cropPacks.value || [] : [];
      state.value.cropPackDetails = state.value.cropPacks;
      state.value.simulatorStatus = results.simulator?.status === 'fulfilled' ? results.simulator.value : state.value.simulatorStatus;
      state.value.adminGlobalPlots = adminPlots;
      state.value.adminDevices = adminDevices;
      state.value.adminAlerts = adminAlerts;
      state.value.adminAuditRecords = auditRecords;
      state.value.adminSimHistory = (results.scenarios?.status === 'fulfilled' ? results.scenarios.value : []).map((run) => ({
        runId: run.runId,
        scenarioId: run.scenarioId || run.runId,
        type: run.scenario || run.scenarioId || '—',
        typeLabel: scenarioLabel(run.scenario || run.scenarioId, '未设置'),
        seed: run.seed,
        plotId: run.plotId,
        startTime: run.startedAt || run.createdAt || '—',
        endTime: run.completedAt || run.endedAt || null,
        events: Number(run.events || run.mainEvents || run.replayEvents || 0),
        status: liveStatusValue(run.status, 'UNKNOWN'),
        statusLabel: localizedStatusLabel(run.status, '未知'),
        dataOrigin: 'BACKEND'
      }));
      state.value.adminCropPacks = adminCropPacks;
      state.value.adminRules = adminRules;
      state.value.adminStrategyCandidates = adminStrategyCandidates;
      state.value.adminUsers = adminUsers;
      state.value.adminAuditLogs = adminAuditLogs;
      state.value.adminOverview = adminOverviewFromLive({ overview, systemStatus: results.systemStatus?.status === 'fulfilled' ? results.systemStatus.value : {}, simulator: { ...state.value.simulatorStatus, history: state.value.adminSimHistory }, alerts, devices, recentEvents });
      if (failures.length && announceErrors) showToast(`部分正式平台数据读取失败：${failures.join('；')}`, 'error');
    };

    const runLivePoll = () => {
      if (document.hidden || state.value.sessionMode !== 'live') return;
      if (api.isLive) {
        connectLiveEvents({ announce: false });
      } else if (!liveHealthProbeInFlight) {
        liveHealthProbeInFlight = true;
        api.checkHealth().then((healthy) => {
          isLive.value = healthy;
          if (healthy) {
            connectLiveEvents({ announce: false });
            runLivePoll();
          }
        }).catch(() => {}).finally(() => { liveHealthProbeInFlight = false; });
      }
      if (state.value.currentUser?.role === 'SYSTEM_ADMIN') {
        scheduleSystemRefresh(0);
      } else if (state.value.currentUser?.role === 'FARM_ADMIN') {
        scheduleFarmRefresh(LIVE_FARM_REFRESH_DOMAINS, 0);
      }
    };
    const stopLiveRefresh = () => {
      if (livePollTimer) window.clearInterval(livePollTimer);
      livePollTimer = null;
      if (liveVisibilityHandler) document.removeEventListener('visibilitychange', liveVisibilityHandler);
      if (liveOnlineHandler) window.removeEventListener('online', liveOnlineHandler);
      liveVisibilityHandler = null;
      liveOnlineHandler = null;
      if (systemRefreshTimer) window.clearTimeout(systemRefreshTimer);
      if (farmRefreshTimer) window.clearTimeout(farmRefreshTimer);
      systemRefreshTimer = null;
      farmRefreshTimer = null;
      systemRefreshQueued = false;
      farmRefreshQueued = false;
      pendingFarmDomains.clear();
    };
    const startLiveRefresh = () => {
      stopLiveRefresh();
      if (state.value.sessionMode !== 'live') return;
      const interval = state.value.currentUser?.role === 'SYSTEM_ADMIN' ? 12000 : 8000;
      livePollTimer = window.setInterval(runLivePoll, interval);
      liveVisibilityHandler = () => { if (!document.hidden) runLivePoll(); };
      liveOnlineHandler = () => runLivePoll();
      document.addEventListener('visibilitychange', liveVisibilityHandler);
      window.addEventListener('online', liveOnlineHandler);
      runLivePoll();
    };
    const handleLiveEvent = (event) => {
      if (event.type === 'connected' || event.type === 'heartbeat') return;
      const systemEvent = presentSystemEvent(event);
      const eventId = String(event?.data?.eventId || '').trim();
      if (eventId) {
        if (seenSystemEventIds.has(eventId)) return;
        seenSystemEventIds.add(eventId);
        // Keep the dedupe set bounded during a long-running dashboard
        // session; event IDs are only needed for the recent window.
        if (seenSystemEventIds.size > 256) {
          const oldest = seenSystemEventIds.values().next().value;
          if (oldest) seenSystemEventIds.delete(oldest);
        }
      }
      // Some proxies normalize the SSE event name to `message`; the payload
      // still carries the authoritative eventType.
      const domains = domainsForEventType(systemEvent.type || event.type);
      if (state.value.currentUser?.role === 'FARM_ADMIN' && domains.length) {
        scheduleFarmRefresh(domains, systemEvent.silent ? 450 : 120);
      }
      if (state.value.currentUser?.role === 'SYSTEM_ADMIN' && domains.length) {
        scheduleSystemRefresh(systemEvent.silent ? 450 : 120);
      }
      if (systemEvent.silent) return;
      if (!Array.isArray(state.value.adminOverview.recentEvents)) state.value.adminOverview.recentEvents = [];
      state.value.adminOverview.recentEvents.unshift(systemEvent);
      state.value.adminOverview.recentEvents = state.value.adminOverview.recentEvents.slice(0, 20);
      // 系统事件仅记入最近事件列表，不再弹出 toast 通知，避免高频事件堆积遮挡视线。
    };
    const connectLiveEvents = async ({ announce = true } = {}) => {
      if (state.value.sessionMode !== 'live' || !api.isLive || liveEventsStop || liveEventsConnecting) return false;
      liveEventsConnecting = true;
      try {
        liveEventsStop = await api.subscribeEvents(handleLiveEvent);
        return true;
      } catch (error) {
        if (announce) showToast('系统消息暂不可用：' + error.message, 'error');
        return false;
      } finally {
        liveEventsConnecting = false;
      }
    };

    const handleContextChanged = async ({ farmId, plotId = null, sessionMode = state.value.sessionMode } = {}, options = {}) => {
      const selected = selectAuthorizedFarm(state.value.farms, farmId);
      if (!selected) {
        showToast('当前账户没有可用农场', 'error');
        return;
      }
      const changed = selected !== state.value.adminContext.farmId;
      state.value.adminContext = { farmId: selected, plotId, sessionMode };
      if (changed) {
        selectedPlotId.value = '';
        state.value.overview = {};
        state.value.plots = [];
        state.value.allPlots = [];
        state.value.workOrders = [];
        state.value.alerts = [];
        state.value.devices = [];
        state.value.farmMembers = [];
        state.value.cropBatches = [];
        state.value.valueLedgers = [];
      }
      await refreshFarmData(selected, ['all']);
      if (options.updateRoute === false) return;
      const params = { ...routeParams.value, farmId: selected };
      delete params.view;
      routeParams.value = params;
      window.history.replaceState(null, '', routeHash(currentView.value, params));
    };
    requestContextChange = handleContextChanged;

    let plotDetailReturnHash = initialRoute.view === 'plot-detail' ? '#dashboard' : '';
    let lastPlotTrigger = null;

    const focusPlotDialog = async () => {
      await nextTick();
      document.querySelector('[data-plot-detail-close]')?.focus();
    };

    const restorePlotTrigger = async () => {
      await nextTick();
      if (lastPlotTrigger?.isConnected) lastPlotTrigger.focus();
      lastPlotTrigger = null;
    };

    const applyHashRoute = async () => {
      const route = parseHashRoute();
      if (state.value.currentUser?.role === 'FARM_ADMIN' && route.params?.farmId && route.params.farmId !== state.value.adminContext.farmId) {
        await handleContextChanged({ farmId: route.params.farmId, plotId: route.params.plotId || null, sessionMode: state.value.sessionMode }, { updateRoute: false });
      }
      const legacyTarget = state.value.currentUser?.role === 'FARM_ADMIN'
        ? legacyAdminTabTarget(route.view, route.params?.tab, route.params?.farmId || state.value.adminContext.farmId)
        : null;
      if (legacyTarget) {
        const targetHash = routeHash(legacyTarget.view, legacyTarget.params);
        window.history.replaceState(null, '', targetHash);
        currentView.value = legacyTarget.view;
        routeParams.value = legacyTarget.params;
        return;
      }
      if (route.view === 'plot-detail') {
        const plot = (state.value.allPlots || state.value.plots).find((item) => item.plotId === route.params.plotId);
        if (!plot || !roleCan(state.value.currentUser, 'plots:read')) {
          selectedPlotId.value = '';
          window.history.replaceState(null, '', routeHash('dashboard', { farmId: state.value.adminContext.farmId }));
          currentView.value = 'dashboard';
          routeParams.value = {};
          showToast('没有找到该地块，已返回农场总览', 'error');
          return;
        }
        if (!plotDetailReturnHash) plotDetailReturnHash = routeHash('dashboard', { farmId: state.value.adminContext.farmId });
        currentView.value = 'dashboard';
        selectedPlotId.value = plot.plotId;
        routeParams.value = route.params;
        await focusPlotDialog();
        return;
      }

      const wasShowingPlotDetail = Boolean(selectedPlotId.value);
      selectedPlotId.value = '';
      if (wasShowingPlotDetail) {
        plotDetailReturnHash = '';
        await restorePlotTrigger();
      }
      if (!route.view) {
        currentView.value = currentRole.value.defaultView;
        routeParams.value = {};
        return;
      }
      if (state.value.allowedViews.includes(route.view)) {
        currentView.value = route.view;
        routeParams.value = route.params;
        return;
      }
      const fallback = state.value.allowedViews[0] || 'dashboard';
      window.history.replaceState(null, '', routeHash(fallback, state.value.currentUser?.role === 'FARM_ADMIN' ? { farmId: state.value.adminContext.farmId } : {}));
      currentView.value = fallback;
      routeParams.value = {};
    };

    const navigate = (viewId, params = {}) => {
      if (!state.value.allowedViews.includes(viewId)) {
        showToast(`“${NAV_CATALOG.find((item) => item.id === viewId)?.label || viewId}”不在${currentRole.value?.label || '当前身份'}的权限范围内`, 'error');
        return;
      }
      const nextParams = state.value.currentUser?.role === 'FARM_ADMIN'
        ? { ...params, farmId: params.farmId || state.value.adminContext.farmId }
        : { ...params };
      selectedPlotId.value = '';
      currentView.value = viewId;
      routeParams.value = nextParams;
      const targetHash = routeHash(viewId, nextParams);
      if (window.location.hash === targetHash) return;
      window.location.hash = targetHash.slice(1);
    };

    const applyPlotChange = ({ type, plot } = {}) => {
      if (!plot?.plotId) return;
      if (type === 'delete') {
        state.value.allPlots = state.value.allPlots.filter((item) => item.plotId !== plot.plotId);
        state.value.plots = state.value.plots.filter((item) => item.plotId !== plot.plotId);
        if (selectedPlotId.value === plot.plotId) selectedPlotId.value = '';
        return;
      }
      const allIndex = state.value.allPlots.findIndex((item) => item.plotId === plot.plotId);
      if (allIndex >= 0) {
        state.value.allPlots.splice(allIndex, 1, { ...state.value.allPlots[allIndex], ...plot });
      } else {
        state.value.allPlots.push(plot);
      }
      state.value.plots = state.value.allPlots.filter(item => String(item.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');
    };

    const handleDataInvalidated = async ({ domains = [], record, records = [], reason = '' } = {}) => {
      if (record?.workOrderId && domains.includes('workOrders')) {
        state.value.workOrders = [record, ...state.value.workOrders.filter((item) => item.workOrderId !== record.workOrderId)];
      }
      if (state.value.currentUser?.role === 'SYSTEM_ADMIN') {
        scheduleSystemRefresh();
        return;
      }
      if (state.value.currentUser?.role !== 'FARM_ADMIN') return;
      const normalized = [...new Set(domains.flatMap(domain => {
        if (domain === 'resourcePlans') return ['overview'];
        return [domain];
      }))];
      await refreshFarmData(state.value.adminContext.farmId, normalized.length ? normalized : ['all']);
      if (reason === 'alerts-closed' && records.length) {
        const closedById = new Map(records.map(item => [String(item?.alertId || item?.id || ''), { ...item, status: 'CLOSED' }]));
        const presentIds = new Set(state.value.alerts.map(item => String(item?.alertId || item?.id || '')));
        state.value.alerts = [
          ...state.value.alerts.map(item => {
            const closed = closedById.get(String(item?.alertId || item?.id || ''));
            return closed ? { ...item, ...closed } : item;
          }),
          ...records.filter(item => !presentIds.has(String(item?.alertId || item?.id || ''))).map(item => ({ ...item, status: 'CLOSED' }))
        ];
        state.value.feedItems = buildLiveFeedItems({
          alerts: state.value.alerts,
          workOrders: state.value.workOrders,
          inspections: state.value.inspections,
          plots: state.value.allPlots
        });
      }
    };

    const openPlotDetail = async ({ plotId, trigger } = {}) => {
      const plot = (state.value.allPlots || state.value.plots).find((item) => item.plotId === plotId);
      if (!plot) {
        showToast('没有找到该地块', 'error');
        return;
      }
      const activeRoute = parseHashRoute();
      if (activeRoute.view !== 'plot-detail') plotDetailReturnHash = window.location.hash || routeHash(currentView.value, { farmId: state.value.adminContext.farmId });
      lastPlotTrigger = trigger || document.activeElement;
      const targetHash = plotDetailHash(plotId, state.value.adminContext.farmId);
      if (window.location.hash === targetHash) {
        selectedPlotId.value = plotId;
        await focusPlotDialog();
        return;
      }
      window.location.hash = targetHash.slice(1);
    };

    const closePlotDetail = async () => {
      selectedPlotId.value = '';
      const targetHash = plotDetailReturnHash && plotDetailReturnHash !== '#view=plot-detail'
        ? plotDetailReturnHash : routeHash('dashboard', { farmId: state.value.adminContext.farmId });
      plotDetailReturnHash = '';
      if (window.location.hash === targetHash) await applyHashRoute();
      else window.location.hash = targetHash.slice(1);
      await restorePlotTrigger();
    };

    const navigateFromPlotDetail = (viewId, params = {}) => {
      selectedPlotId.value = '';
      plotDetailReturnHash = '';
      lastPlotTrigger = null;
      navigate(viewId, params);
    };

    window.addEventListener('hashchange', applyHashRoute);

    onMounted(async () => {
      if (!session) {
        window.location.replace('login.html');
        return;
      }
      const savedTheme = localStorage.getItem('agriloop-theme');
      if (savedTheme === 'dark') {
        isDark.value = true;
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
      }
      isLive.value = await api.checkHealth();
      if (isLive.value && session.mode === 'live') {
        const restoredUser = await api.restoreSession();
        if (!restoredUser) {
          window.location.replace('login.html');
          return;
        }
        state.value.currentUser = presentRoleUser(restoredUser);
        state.value.allowedViews = roleViews(state.value.currentUser);
        state.value.sessionMode = 'live';
        state.value.farmMembers = [];
      }
      state.value.adminContext.sessionMode = state.value.sessionMode;
      if (state.value.currentUser?.role === 'FARM_ADMIN') {
        try {
          state.value.farms = await api.getFarms();
          const requestedFarm = initialRoute.params?.farmId || '';
          const farmId = selectAuthorizedFarm(state.value.farms, requestedFarm);
          if (!farmId) throw new Error('当前账户没有授权农场');
           state.value.adminContext = { farmId, plotId: initialRoute.params?.plotId || null, sessionMode: state.value.sessionMode };
           await refreshFarmData(farmId, ['all']);
           farmLastRefreshAt = Date.now();
        } catch (error) {
          state.value.farms = [];
          state.value.plots = [];
          state.value.allPlots = [];
          showToast(`读取管理员农场上下文失败：${error.message}`, 'error');
        }
      } else if (session.mode === 'live') {
        if (state.value.currentUser?.role === 'SYSTEM_ADMIN') {
          await refreshSystemAdminData();
          systemLastRefreshAt = Date.now();
        } else {
          const [farmsResult, overviewResult, plotsResult, workOrdersResult, alertsResult] = await Promise.allSettled([
            api.getFarms(), api.getOverview(), api.getPlots({ includeInactive: true }), api.getWorkOrders(), api.getAlerts()
          ]);
          if (farmsResult.status === 'fulfilled') state.value.farms = farmsResult.value || [];
          if (overviewResult.status === 'fulfilled' && plotsResult.status === 'fulfilled' && Array.isArray(overviewResult.value?.plots)) {
            const cards = overviewResult.value.plots;
            const rawPlots = plotsResult.value || [];
            const cardMap = new Map(cards.map((card) => [String(card.plotId), card]));
            const normalized = rawPlots.map((plot) => normalizePlot(plot, cardMap.get(String(plot.plotId)) || {}));
            state.value.plots = scopePlots(normalized, state.value.currentUser);
            state.value.allPlots = [...state.value.plots];
            state.value.overview = overviewResult.value;
          } else if (overviewResult.status === 'rejected' || plotsResult.status === 'rejected') {
            const reason = overviewResult.status === 'rejected' ? overviewResult.reason : plotsResult.reason;
            showToast('读取角色范围内的地块失败：' + (reason?.message || '后端返回异常'), 'error');
          }
          if (workOrdersResult.status === 'fulfilled') state.value.workOrders = workOrdersResult.value || [];
          if (alertsResult.status === 'fulfilled') state.value.alerts = alertsResult.value || [];
          const plotMap = new Map(state.value.plots.map((plot) => [String(plot.plotId), plot]));
          const inspectionResults = await Promise.allSettled(state.value.plots.map((plot) => api.getInspections(plot.plotId)));
          state.value.inspections = inspectionResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
          state.value.feedItems = buildLiveFeedItems({ alerts: state.value.alerts, workOrders: state.value.workOrders, inspections: state.value.inspections, plots: state.value.plots });
          if (state.value.currentUser?.role === 'FARM_ADMIN') {
            state.value.farmMembers = [];
          }
        }
      } else if (session.mode === 'demo') {
        state.value.plots = scopePlots(MOCK_DATA.plots, state.value.currentUser);
        state.value.allPlots = state.value.plots.map(plot => ({ ...plot, status: plot.status || 'ACTIVE' }));
        state.value.alerts = (MOCK_DATA.alerts || []).map((item) => ({ ...item }));
        state.value.workOrders = await api.getWorkOrders();
      } else {
        state.value.plots = [];
        state.value.allPlots = [];
        state.value.alerts = [];
        state.value.workOrders = [];
        state.value.farmMembers = [];
        showToast('当前未连接后端服务，正式数据暂不可用', 'error');
      }
      // A successful API call can recover from a transient health-probe
      // failure. Use the service transport flag here so formal sessions can
      // start SSE after their REST refresh has proved the backend works.
      isLive.value = api.isLive;
      if (api.isLive && session.mode === 'live') await connectLiveEvents();
      await applyHashRoute();
      if (state.value.currentUser?.role === 'FARM_ADMIN' && state.value.adminContext.farmId && !parseHashRoute().params?.farmId) {
        const params = { ...routeParams.value, farmId: state.value.adminContext.farmId };
        routeParams.value = params;
        window.history.replaceState(null, '', routeHash(currentView.value, params));
      }
      if (!state.value.allowedViews.includes(currentView.value)) navigate(currentRole.value.defaultView);
      startLiveRefresh();
    });

    onBeforeUnmount(() => {
      stopLiveRefresh();
      liveEventsStop?.();
      liveEventsStop = null;
      api.sseAbortController?.abort();
      window.removeEventListener('hashchange', applyHashRoute);
    });

    // Provide toast globally
    app.provide('toast', showToast);

    return {
      selectedFarmId,
      isLive,
      isDark,
      isSidebarOpen,
      showProfileMenu,
      showFarmMenu,
      selectedFarm,
      showAccountModal,
      passwordForm,
      passwordError,
      accountProfile,
      roleClass,
      currentRole,
      isFarmer,
      navItems,
      currentView,
      currentViewComponent,
      routeParams,
      selectedPlot,
      state,
      toasts,
      showToast,
      toggleTheme,
      toggleSidebar,
      toggleProfileMenu,
      closeProfileMenu,
      openAccountModal,
      closeAccountModal,
      changePassword,
      forgotPassword,
      logout,
      navigate,
      applyPlotChange,
      handleDataInvalidated,
      handleContextChanged,
      openPlotDetail,
      closePlotDetail,
      navigateFromPlotDetail,
      farmerReturnPage,
      returnToFarmer
    };
  }
});

app.component('app-icon', AppIcon);

const indexSession = api.readSession();
const indexUser = presentRoleUser(indexSession?.user);
if (indexUser?.role === 'FARMER') {
  const hash = String(window.location.hash || '').replace(/^#/, '');
  const view = hash.split(/[?&/]/)[0];
  const farmerHash = {
    'risk-forecast': 'dashboard',
    'crop-manual': 'tools/manual',
    'work-orders': 'tools',
    'decision-console': 'advice',
    dashboard: 'dashboard'
  }[view] || 'tools';
  window.location.replace(`farmer.html#${farmerHash}`);
} else {
  app.mount('#app');
}
