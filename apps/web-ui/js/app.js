import { api, DEFAULT_SIMULATION_TIME_SCALE, PLOT_SIMULATION_DEFAULTS, PLOT_SIMULATION_SCENARIOS } from './api.js?v=20260901-v59-main-compat-v1';
import { MOCK_DATA } from './mock-data.js?v=20260901-v59-main-compat-v1';
import { canExecuteIrrigation as canExecuteIrrigationRole, presentRoleUser, roleCan, roleDefinition, roleViews } from './roles.js?v=20260901-v59-main-compat-v1';
import { buildAccountProfile } from './account-profile.js';
import { ACCENT_OPTIONS, DEFAULT_USER_SETTINGS, PLOT_BACKGROUND_OPTIONS, SURFACE_STYLE_OPTIONS, applyUserSettings, readUserSettings, saveUserSettings, resolveTheme } from './user-settings.js?v=20260901-v59-main-compat-v1';
import { AdminAlertCenter } from './admin-alerts.js?v=20260901-v59-main-compat-v1';
import { WorkOrderLifecycleView } from './work-order-lifecycle.js?v=20260901-v59-main-compat-v1';
import { AdminDecisionView } from './modules/admin-decision.js?v=20260901-v59-main-compat-v1';
import { AdminAiChatView } from './modules/admin-ai-chat.js?v=20260901-v59-main-compat-v1';
import { AdminResourcePlanningView } from './modules/admin-resource-planning.js?v=20260901-v59-main-compat-v1';
import { AdminWorkManagementView } from './modules/admin-work-management.js?v=20260901-v59-main-compat-v1';
import { AdminResourceCenterView } from './modules/admin-resource-center.js?v=20260901-v59-main-compat-v1';
import { AdminMemberManagementView } from './modules/admin-member-management.js?v=20260901-v59-main-compat-v1';
import { AdminRulesStrategiesView } from './modules/admin-rules-strategies.js?v=20260901-v59-main-compat-v1';
import { cropBackgroundFor } from './plot-background.js?v=20260901-v59-main-compat-v1';
import { ADMIN_PLOT_METRIC_CODES, adminCropEmoji, adminCropKey, adminHealthTone, adminMetricLabel, adminSummary, domainsForEventType, formatHealthScore, hasFarmPlotRefresh, isLatestFarmResponse, legacyAdminTabTarget, managerSummaryTarget, mergeFarmPlots, routeHash, selectAuthorizedFarm } from './admin-state.js?v=20260901-v59-main-compat-v1';
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
} from './live-data.js?v=20260901-v59-main-compat-v1';

// index.html serves the farm manager and farmer workspaces. Keep the system
// administrator on the dedicated entry so its platform-level navigation and
// account controls are isolated from farm-scoped views.
const guardSession = api.readSession();
const guardUser = presentRoleUser(guardSession?.user) || presentRoleUser(MOCK_DATA.currentUser);
if (guardUser && guardUser.role === 'SYSTEM_ADMIN') {
  window.location.replace('sysadmin.html');
}

const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick, watch, inject } = Vue;

const bootSession = api.readSession();
const initialSettingsAccount = bootSession?.user || MOCK_DATA.currentUser;
const initialUserSettings = readUserSettings(undefined, initialSettingsAccount);
applyUserSettings(initialUserSettings);

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
  sync: 'ph-arrows-clockwise',
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
  chevron_right: 'ph-caret-right',
  chevron_left: 'ph-caret-left',
  attach_file: 'ph-paperclip',
  image_search: 'ph-image-square'
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
  { id: 'decision-console', label: '智能决策', icon: 'warning_amber', labels: { FARMER: '智能建议', FARM_ADMIN: '告警智能处理', SYSTEM_ADMIN: '决策审计' } },
  { id: 'rules-strategies', label: '规则与策略', icon: 'rule_folder', labels: { FARM_ADMIN: '规则与策略' } },
  { id: 'ai-assistant', label: 'AI助手', icon: 'smart_toy', labels: { FARM_ADMIN: 'AI助手' } },
  { id: 'work-orders', label: '农务工单', icon: 'task_alt', labels: { FARMER: '农务记录', FARM_ADMIN: '农务任务', SYSTEM_ADMIN: '工单审计' } },
  { id: 'resource-coordination', label: '设备与设施', icon: 'sensors' },
  { id: 'farm-members', label: '农场成员', icon: 'group' },
  { id: 'crop-manual', label: '作物培养手册', icon: 'menu_book', labels: { FARMER: '作物培养手册', FARM_ADMIN: '作物培养手册', SYSTEM_ADMIN: '作物培养手册' } },
  { id: 'crop-packs', label: '作物模型', icon: 'library_books', labels: { FARM_ADMIN: '作物模型', SYSTEM_ADMIN: '规则配置' } },
  { id: 'admin-overview', label: '平台总览', icon: 'monitoring', labels: { SYSTEM_ADMIN: '平台总览' } },
  { id: 'admin-ops', label: '运行监控', icon: 'dns', labels: { SYSTEM_ADMIN: '运行监控' } },
  { id: 'admin-resources', label: '资源协同', icon: 'water_drop', labels: { SYSTEM_ADMIN: '资源协同审计' } },
  { id: 'admin-audit', label: '决策审计', icon: 'gavel', labels: { SYSTEM_ADMIN: '决策审计' } },
  { id: 'admin-simulator', label: '仿真模拟', icon: 'science', labels: { SYSTEM_ADMIN: '仿真模拟' } },
  { id: 'admin-rules', label: '规则与版本', icon: 'rule_folder', labels: { SYSTEM_ADMIN: '规则与版本' } },
  { id: 'admin-settings', label: '系统管理', icon: 'admin_panel_settings', labels: { SYSTEM_ADMIN: '系统管理' } },
  { id: 'settings', label: '工作台设置', icon: 'settings', isFooter: true, labels: { FARMER: '工作台设置', FARM_ADMIN: '工作台设置', SYSTEM_ADMIN: '工作台设置' } }
]);

const PLOT_METRIC_ORDER = ADMIN_PLOT_METRIC_CODES;
const PLOT_METRIC_ICONS = Object.freeze({
  SOIL_MOISTURE: 'water_drop',
  AIR_TEMPERATURE: 'thermometer',
  AIR_HUMIDITY: 'humidity',
  LIGHT: 'light_mode',
  CO2: 'eco',
  RAINFALL: 'rainy',
  PH: 'soil_ec',
  WATER_LEVEL: 'water_drop',
  NITROGEN: 'eco',
  PHOSPHORUS: 'science',
  POTASSIUM: 'nutrition'
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
const PLOT_FACILITY_OPTIONS = Object.freeze([
  { code: 'OPEN_FIELD', label: '露地（裸地）', description: '直接受降雨、风和温湿度变化影响' },
  { code: 'GREENHOUSE', label: '大棚', description: '隔绝大部分降雨，温湿度变化更缓和' },
  { code: 'SHADE_HOUSE', label: '遮阳棚', description: '部分遮雨遮光，环境响应介于大棚与露地之间' },
  { code: 'ORCHARD', label: '果园', description: '冠层有缓冲，但仍会明显响应降雨' }
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

function adminServiceCards(systemStatus = {}) {
  const entries = [
    { name: 'PostgreSQL 数据库', status: systemStatus.database, latencyMs: systemStatus.databaseLatencyMs },
    { name: 'Redis 消息流', status: systemStatus.redis, latencyMs: systemStatus.redisLatencyMs },
    { name: 'MQTT 消息代理', status: systemStatus.mqtt, latencyMs: systemStatus.mqttLatencyMs },
    { name: 'SSE 实时推送', status: 'UP', latencyMs: systemStatus.requestLatencyMs },
    { name: '接口服务', status: 'UP', latencyMs: systemStatus.requestLatencyMs },
    { name: '智能模型服务', status: systemStatus.ai, isAi: true }
  ];
  return entries.map(({ name, status, isAi = false, latencyMs }) => ({
    name,
    status: liveStatusValue(status, 'UNKNOWN'),
    statusLabel: serviceStatusLabel(status, '未知'),
    mode: isAi ? (status || '—') : undefined,
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
      sampleIntervalSeconds: Number(simulator.sampleIntervalSeconds || 20),
      timeScale: Number(simulator.timeScale || 144),
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
const DashboardView = {
  template: '#tmpl-dashboard',
  props: ['state', 'userSettings', 'routeParams'],
  emits: ['navigate', 'open-plot-detail', 'plot-change', 'data-invalidated', 'context-changed'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const isFarmAdmin = computed(() => props.state.currentUser?.role === 'FARM_ADMIN');
    const selectedFarmId = computed({
      get: () => props.state.adminContext?.farmId || '',
      set: farmId => emit('context-changed', { farmId, plotId: null, sessionMode: props.state.sessionMode })
    });
    const visiblePlots = computed(() => (
      Array.isArray(props.state.allPlots) && props.state.allPlots.length
        ? props.state.allPlots
        : (props.state.plots || [])
    ));
    const devices = computed(() => props.state.devices || []);
    const deviceOptions = computed(() => devices.value
      .filter(device => !device.farmId || device.farmId === selectedFarmId.value)
      .sort((a, b) => String(a.name || a.deviceId).localeCompare(String(b.name || b.deviceId), 'zh-CN')));
    const deviceLabel = device => {
      if (!device.plotId) return `${device.name || device.deviceId}（未绑定）`;
      if (device.plotId === plotDraft.value.plotId) return `${device.name || device.deviceId}（当前地块）`;
      return `${device.name || device.deviceId}（已绑定：${visiblePlots.value.find(plot => plot.plotId === device.plotId)?.name || device.plotId}）`;
    };
    const plotMenuId = ref('');
    const plotSaving = ref(false);
    const plotEditor = ref({ open: false, mode: 'create' });
    const deleteConfirm = ref({ open: false, plot: null, confirmation: '' });
    const emptyPlotDraft = () => ({
      plotId: '',
      name: '',
      cropCode: 'tomato',
      cropVariety: '',
      stageCode: 'vegetative',
      facilityType: 'OPEN_FIELD',
      growthCycleDays: 120,
      areaM2: 100,
      deviceIds: []
    });
    const plotDraft = ref(emptyPlotDraft());
    const managerSummary = computed(() => {
      const summary = adminSummary({ plots: props.state.plots, workOrders: props.state.workOrders });
      return [
        { id: 'today', icon: 'calendar_today', label: '今日任务', value: summary.today, hint: '查看今天的农务任务' },
        { id: 'overdue', icon: 'schedule', label: '已逾期', value: summary.overdue, hint: '查看已经超过截止时间的任务' },
        { id: 'abnormal', icon: 'warning_amber', label: '异常地块', value: summary.abnormal, hint: '进入告警处置，查看异常地块' },
        { id: 'unassigned', icon: 'person_add', label: '待分配', value: summary.unassigned, hint: '查看还没有负责人的任务' },
        { id: 'approval', icon: 'task_alt', label: '待处理灌溉', value: summary.approval, hint: '查看历史审批记录或待处理的灌溉任务' }
      ];
    });

    const openManagerSummary = (item) => {
      const target = managerSummaryTarget(item?.id, selectedFarmId.value);
      if (target) emit('navigate', target.view, target.params);
    };

    const plotMetrics = (plot) => PLOT_METRIC_ORDER.map((code) => ({
      code,
      label: adminMetricLabel(code, plot?.metrics?.[code]?.label),
      target: plot?.metrics?.[code]?.target || '—',
      unit: plot?.metrics?.[code]?.unit || '',
      value: plot?.metrics?.[code]?.value,
      status: plot?.metrics?.[code]?.status || 'UNAVAILABLE'
    }));
    const formatMetric = (metric) => formatMetricValue(metric);
    const healthScore = (plot) => formatHealthScore(plot?.healthScore);
    const healthTone = (plot) => adminHealthTone(plot?.healthScore);
    const cardTone = (plot) => normalizedStatus(plot?.status, 'ACTIVE') === 'INACTIVE' ? 'inactive' : isAbnormalPlot(plot) ? 'attention' : 'normal';
    const metricVisualIcon = (metric) => PLOT_METRIC_ICONS[metric?.code] || 'monitoring';
    const metricStatusIcon = (metric) => metricTone(metric) === 'normal' ? 'check_circle' : metricTone(metric) === 'unavailable' ? 'remove_circle_outline' : 'warning_amber';
    const cropKeyFor = (plot) => adminCropKey(plot);
    const cropEmojiFor = (plot) => adminCropEmoji(plot);
    const cropLabelFor = (plot) => plot?.cropName || CROP_OPTIONS.find((crop) => crop.code === cropKeyFor(plot))?.name || '其他作物';
    const openPlotDetail = (plot, event) => emit('open-plot-detail', {
      plotId: plot.plotId,
      trigger: event?.currentTarget || null
    });
    const togglePlotMenu = (plotId) => {
      plotMenuId.value = plotMenuId.value === plotId ? '' : plotId;
    };
    const closePlotMenu = () => { plotMenuId.value = ''; };
    const openCreatePlot = () => {
      closePlotMenu();
      plotDraft.value = emptyPlotDraft();
      plotEditor.value = { open: true, mode: 'create' };
    };
    const openEditPlot = (plot) => {
      closePlotMenu();
      plotDraft.value = {
        plotId: plot.plotId,
        name: plot.name || '',
        cropCode: plot.cropCode || 'tomato',
        cropVariety: plot.cropVariety || '',
        stageCode: plot.stageCode || 'vegetative',
        facilityType: plot.facilityType || 'OPEN_FIELD',
        growthCycleDays: Number(plot.growthCycleDays || 120),
        areaM2: Number(plot.areaM2 || 100),
        deviceIds: devices.value.filter(device => device.plotId === plot.plotId).map(device => device.deviceId)
      };
      plotEditor.value = { open: true, mode: 'edit' };
    };
    const closePlotEditor = () => {
      if (plotSaving.value) return;
      plotEditor.value.open = false;
    };
    const metricTemplateFor = (cropCode, excludedPlotId = '') => {
      const source = props.state.plots.find((plot) => plot.cropCode === cropCode && plot.plotId !== excludedPlotId);
      return source?.metrics ? JSON.parse(JSON.stringify(source.metrics)) : Object.fromEntries(PLOT_METRIC_ORDER.map((code) => [code, {
        label: code,
        value: null,
        unit: '',
        status: 'UNAVAILABLE',
        target: '待配置'
      }]));
    };
    const submitPlot = async () => {
      const draft = plotDraft.value;
      if (!draft.name.trim() || !draft.cropVariety.trim()) {
        toast('请填写地块名称和作物品种', 'error');
        return;
      }
      const crop = CROP_OPTIONS.find((item) => item.code === draft.cropCode) || CROP_OPTIONS[0];
      const stage = STAGE_OPTIONS.find((item) => item.code === draft.stageCode) || STAGE_OPTIONS[1];
      const current = (props.state.allPlots || props.state.plots).find((plot) => plot.plotId === draft.plotId);
      const cropChanged = Boolean(current && current.cropCode !== crop.code);
      const payload = {
        ...(current || {}),
        farmId: selectedFarmId.value || current?.farmId || '',
        name: draft.name.trim(),
        cropCode: crop.code,
        cropName: crop.name,
        cropVariety: draft.cropVariety.trim(),
        stageCode: stage.code,
        stageLabel: stage.label,
        facilityType: draft.facilityType || 'OPEN_FIELD',
        growthCycleDays: Math.max(1, Math.round(Number(draft.growthCycleDays) || 1)),
        areaM2: Math.max(1, Number(draft.areaM2) || 1),
        lastSeen: plotEditor.value.mode === 'edit' ? '刚刚更新' : '等待设备接入',
        metrics: current && !cropChanged ? current.metrics : metricTemplateFor(crop.code, draft.plotId),
        deviceStatus: current?.deviceStatus || 'UNBOUND',
        healthScore: current?.healthScore ?? null,
        riskLevel: current?.riskLevel || 'LOW'
      };
      const requestedDeviceIds = [...new Set((draft.deviceIds || []).filter(Boolean))];
      const moving = devices.value.filter(device => requestedDeviceIds.includes(device.deviceId) && device.plotId && device.plotId !== draft.plotId);
      if (moving.length && !window.confirm(`以下设备当前绑定在其他地块：${moving.map(device => device.name || device.deviceId).join('、')}。确认转移到“${payload.name}”吗？`)) return;
      plotSaving.value = true;
      try {
        let saved;
        if (plotEditor.value.mode === 'edit') {
          const { deviceIds, ...plotPayload } = payload;
          saved = await api.updatePlot(draft.plotId, plotPayload);
          emit('plot-change', { type: 'update', plot: { ...payload, ...saved, metrics: payload.metrics } });
        } else {
          const { deviceIds, ...plotPayload } = payload;
          saved = await api.createPlot(plotPayload);
          emit('plot-change', { type: 'create', plot: { ...payload, ...saved, metrics: payload.metrics } });
        }
        const binding = await api.setPlotDevices(saved.plotId, requestedDeviceIds);
        emit('data-invalidated', { domains: ['plots', 'overview', 'devices'], record: { ...saved, binding } });
        toast(`${payload.name}${plotEditor.value.mode === 'edit' ? '已更新' : '已添加到农场'}，设备绑定已同步`);
        plotEditor.value.open = false;
      } catch (error) {
        toast(error.message || '保存地块失败', 'error');
      } finally {
        plotSaving.value = false;
      }
    };
    const requestDeletePlot = (plot) => {
      closePlotMenu();
      deleteConfirm.value = { open: true, plot, confirmation: '' };
    };
    const cancelDeletePlot = () => {
      if (plotSaving.value) return;
      deleteConfirm.value = { open: false, plot: null, confirmation: '' };
    };
    const deactivatePlot = async (plot) => {
      closePlotMenu(); plotSaving.value = true;
      try {
        const saved = await api.deactivatePlot(plot.plotId);
        emit('plot-change', { type: 'update', plot: saved });
        emit('data-invalidated', { domains: ['plots', 'overview', 'devices'], record: saved });
        toast(`${plot.name}已停用，活跃业务页面将不再显示`);
      } catch (error) { toast(error.message || '停用地块失败', 'error'); }
      finally { plotSaving.value = false; }
    };
    const restorePlot = async (plot) => {
      closePlotMenu(); plotSaving.value = true;
      try {
        const saved = await api.restorePlot(plot.plotId);
        emit('plot-change', { type: 'update', plot: saved });
        emit('data-invalidated', { domains: ['plots', 'overview'], record: saved });
        toast(`${plot.name}已恢复使用`);
      } catch (error) { toast(error.message || '恢复地块失败', 'error'); }
      finally { plotSaving.value = false; }
    };
    const confirmDeletePlot = async () => {
      const plot = deleteConfirm.value.plot;
      if (!plot) return;
      if (String(deleteConfirm.value.confirmation || '').trim() !== String(plot.name || '').trim()) {
        toast('请输入完整地块名称进行确认', 'error'); return;
      }
      plotSaving.value = true;
      try {
        await api.deletePlot(plot.plotId, deleteConfirm.value.confirmation);
        emit('plot-change', { type: 'delete', plot });
        emit('data-invalidated', { domains: ['plots', 'overview'], record: { ...plot, deleted: true } });
        deleteConfirm.value = { open: false, plot: null, confirmation: '' };
        toast(`${plot.name}已永久删除`);
      } catch (error) {
        toast(error.message || '删除地块失败', 'error');
      } finally {
        plotSaving.value = false;
      }
    };
    onMounted(() => document.addEventListener('click', closePlotMenu));
    onBeforeUnmount(() => document.removeEventListener('click', closePlotMenu));
    const createTask = () => emit('navigate', 'work-orders', { tab: 'tasks', openCreateTask: true, farmId: selectedFarmId.value });
    const visibleActions = (actions = []) => actions.filter((action) => {
      if (action.action === 'execute-irrigation') return canExecuteIrrigationRole(props.state.currentUser);
      if (action.action === 'open-subview' && action.view === 'plot-detail') return Boolean(action.plotId);
      if (action.action === 'open-subview') return props.state.allowedViews.includes(action.view);
      return true;
    });
    const handleAction = (action) => {
      if (action.action === 'open-subview' && action.view === 'plot-detail') {
        emit('open-plot-detail', { plotId: action.plotId, trigger: null });
      } else if (action.action === 'open-subview') {
        // [INTERCONNECTIVITY] Navigate with context payload
        emit('navigate', action.view, { highlight: 'diagnosis' });
      } else if (action.action === 'execute-irrigation' && !canExecuteIrrigationRole(props.state.currentUser)) {
        toast('当前身份没有灌溉执行权限', 'error');
      } else {
        toast('执行成功: ' + action.label);
      }
    };
    return {
      isFarmAdmin,
      selectedFarmId,
      visiblePlots,
      devices,
      deviceOptions,
      deviceLabel,
      managerSummary,
      openManagerSummary,
      plotMetrics,
      formatMetric,
      healthScore,
      healthTone,
      cardTone,
      metricTone,
      metricVisualIcon,
      metricStatusIcon,
      cropKeyFor,
      cropEmojiFor,
      cropLabelFor,
      cropBackgroundFor,
      openPlotDetail,
      plotMenuId,
      plotSaving,
      plotEditor,
      plotDraft,
      deleteConfirm,
      cropOptions: CROP_OPTIONS,
      stageOptions: STAGE_OPTIONS,
      facilityOptions: PLOT_FACILITY_OPTIONS,
      togglePlotMenu,
      openCreatePlot,
      openEditPlot,
      closePlotEditor,
      submitPlot,
      requestDeletePlot,
      deactivatePlot,
      restorePlot,
      cancelDeletePlot,
      confirmDeletePlot,
      createTask,
      handleAction,
      visibleActions,
      metricStatusLabel,
      localizedSourceLabel,
      localizedStatusLabel,
      displayText
    };
  }
};

const PlotDetailModal = {
  template: '#tmpl-plot-detail-modal',
  props: ['plot', 'workOrders', 'state'],
  emits: ['close', 'navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const simulation = ref(null);
    const simulationForm = ref({ scenario: 'NORMAL', parameters: {} });
    const simulationHistory = ref([]);
    const simulationForecast = ref(null);
    const simulationBusy = ref(false);
    const simulationMetric = ref('SOIL_MOISTURE');
    const simulationMetricLoading = ref(false);
    const simulationPreviewLoading = ref(false);
    const simulationPreviewError = ref('');
    const simulationChartEl = ref(null);
    const simulationChart = ref(null);
    const simulationPreviewDirty = ref(false);
    const simulationEvaluating = ref(false);
    let metricRequestSerial = 0;
    let previewRequestSerial = 0;
    // One debounced queue is shared by slider changes and scenario changes;
    // the request serial prevents an older response from replacing a newer
    // preview.
    let previewTimer = null;
    let hydratingSimulation = false;
    const simulationScenarioOptions = computed(() => {
      const configured = simulation.value?.scenarioCatalog;
      return Array.isArray(configured) && configured.length ? configured : PLOT_SIMULATION_SCENARIOS;
    });
    const simulationMetricOptions = computed(() => SIMULATION_METRIC_OPTIONS);
    const selectedSimulationMetric = computed(() => simulationMetricDefinition(simulationMetric.value));
    const simulationMetricLabel = computed(() => selectedSimulationMetric.value.label);
    const canConfigureSimulation = computed(() => roleCan(props.state?.currentUser, 'strategy:manage') || roleCan(props.state?.currentUser, 'simulator:control'));
    const selectedSimulationScenario = computed(() => simulationScenarioOptions.value.find((item) => item.code === simulationForm.value.scenario) || PLOT_SIMULATION_SCENARIOS[0]);
    const parameterMeta = Object.freeze({
      volatility: { label: '波动强度', unit: '倍', min: .2, max: 3, step: .05, help: '控制随机扰动幅度' },
      timeScale: { label: '模拟时间倍率', unit: '倍', min: 1, max: 288, step: 1, help: '默认 144 倍：墙上时钟 10 分钟 ≈ 1 个模拟日' },
      temperatureBias: { label: '温度偏移', unit: '°C', min: -15, max: 15, step: .5, help: '相对标准环境的偏移' },
      humidityBias: { label: '湿度偏移', unit: '%RH', min: -40, max: 40, step: 1, help: '相对标准环境的偏移' },
      rainfallRate: { label: '降雨强度', unit: 'mm/h', min: 0, max: 120, step: 1, help: '暴雨时的平均降雨强度' },
      soilMoistureTrendPerHour: { label: '土壤变化速率', unit: '%/h', min: -12, max: 12, step: .1, help: '每模拟小时的自然失水/增湿；正数增湿，负数失水' },
      driftRatePerHour: { label: '漂移速率', unit: '%/h', min: 0, max: 10, step: .1, help: '仅作用于传感器读数' },
      offlineRatio: { label: '离线比例', unit: '比例', min: 0, max: 1, step: .01, help: '设备周期内断连比例（0.55 表示 55%）' },
      riskThreshold: { label: '干旱阈值', unit: '%', min: 1, max: 99, step: .5, help: '低于此值触发缺水风险' },
      waterloggingThreshold: { label: '积水阈值', unit: '%', min: 40, max: 99, step: .5, help: '暴雨时高于此值触发积水风险' },
      forecastHours: { label: '预测时长', unit: '小时', min: 1, max: 12, step: 1, help: '预测曲线的时间范围' }
    });
    const simulationFields = computed(() => {
      const code = simulationForm.value.scenario;
      const common = ['volatility', 'timeScale', 'riskThreshold', 'forecastHours'];
      const extra = code === 'DROUGHT' ? ['temperatureBias', 'humidityBias', 'soilMoistureTrendPerHour']
        : code === 'HEAVY_RAIN' ? ['rainfallRate', 'temperatureBias', 'humidityBias', 'soilMoistureTrendPerHour', 'waterloggingThreshold']
          : code === 'SENSOR_DRIFT' ? ['driftRatePerHour', 'soilMoistureTrendPerHour']
            : code === 'DEVICE_OFFLINE' ? ['offlineRatio']
              : ['temperatureBias', 'humidityBias', 'soilMoistureTrendPerHour'];
      return [...new Set([...common, ...extra])].map((key) => {
        const fromApi = simulation.value?.parameterLimits?.[key];
        const meta = parameterMeta[key] || { label: key, unit: '', min: 0, max: 100, step: 1, help: '' };
        return { key, ...meta, min: Number(fromApi?.min ?? meta.min), max: Number(fromApi?.max ?? meta.max) };
      });
    });
    const simulationDeviceLabel = computed(() => simulation.value?.simulatorDevice?.label || '等待模拟器数据');
    const simulationDeviceTone = computed(() => String(simulation.value?.simulatorDevice?.status || '').toUpperCase() === 'ONLINE' ? 'is-online' : 'is-offline');
    const simulatorTone = computed(() => simulationDeviceTone.value === 'is-online' ? 'is-online' : 'is-offline');
    const hardware = computed(() => simulation.value?.hardware || {});
    const hardwareLabel = computed(() => hardware.value.label || (hardware.value.status === 'ONLINE' ? '硬件在线，可使用' : '未绑定硬件'));
    const hardwareTone = computed(() => hardware.value.status === 'ONLINE' ? 'is-online' : 'is-offline');
    const hardwareLastSeen = computed(() => {
      if (!hardware.value.lastSeen) return '';
      const date = new Date(hardware.value.lastSeen);
      return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '';
    });
    const simulationPreviewMessage = computed(() => {
      const scenario = selectedSimulationScenario.value;
      if (simulationForm.value.scenario === 'DEVICE_OFFLINE') return `${scenario.label}：设备断连时保留最后一条实测值，不生成可执行预测。`;
      if (simulationPreviewLoading.value || simulationEvaluating.value) return '正在调用后端模型重新推演，上一条曲线暂保留并已降低强调度…';
      if (simulationPreviewError.value) return `实时推演失败：${simulationPreviewError.value}`;
      if (simulationPreviewDirty.value) return '参数尚未保存，曲线来自只读后端试算；点击“保存到此地块”后服务器模拟器会热加载。';
      if (simulationForecast.value && String(simulationForecast.value.status || '').toUpperCase() !== 'AVAILABLE') {
        const reason = simulationForecast.value.reason || '当前样本或设备状态未满足预测条件';
        return `${scenario.label}：预测暂不可用（${reason}），历史实测仍可查看。`;
      }
      return `${scenario.label}已绑定到 ${props.plot?.name || props.plot?.plotId}，历史数据只清除模拟样本，硬件实测数据始终保留。`;
    });

    const cloneForm = (record) => ({
      scenario: String(record?.scenario || 'NORMAL').toUpperCase(),
      parameters: { ...(record?.parameters || {}) }
    });

    const plotMetricFallback = (metric) => {
      const definition = simulationMetricDefinition(metric);
      const configured = finiteNumber(props.plot?.metrics?.[metric]?.value);
      return Number.isFinite(configured) ? configured : definition.defaultValue;
    };

    const renderSimulationChart = async () => {
      await nextTick();
      if (!simulationChartEl.value || typeof echarts === 'undefined') return;
      if (!simulationChart.value) simulationChart.value = echarts.init(simulationChartEl.value);
      const definition = selectedSimulationMetric.value;
      const historicalPoints = normalizedTelemetryPoints(simulationHistory.value);
      const timeScale = Math.max(1, Number(simulation.value?.parameters?.timeScale || DEFAULT_SIMULATION_TIME_SCALE));
      const now = Date.now();
      const toSimulated = (wall) => now - (now - wall) * timeScale;
      const historicalAll = historicalPoints.map((item) => [toSimulated(telemetryTimestamp(item)), item.value]);
      const fallback = plotMetricFallback(definition.code);
      const anchorPoint = historicalPoints.at(-1);
      const anchorValue = anchorPoint?.value ?? fallback;
      // telemetryTimestamp(undefined) intentionally returns epoch 0 for normalisation,
      // but an empty history must use the current time instead of rendering at 1970.
      const anchorTimestamp = anchorPoint ? telemetryTimestamp(anchorPoint) : NaN;
      const forecastAvailable = String(simulationForecast.value?.status || '').toUpperCase() === 'AVAILABLE'
        && Array.isArray(simulationForecast.value?.curve) && simulationForecast.value.curve.length > 0;
      // Every forecast curve is returned by the API.  The component never
      // fabricates what-if points because those would look like measured data.
      const forecastSource = forecastAvailable ? simulationForecast.value.curve : [];
      const forecastPoints = alignForecastToHistory(forecastSource, anchorValue, definition);
      const forecastStart = Number.isFinite(anchorTimestamp) ? toSimulated(anchorTimestamp) : now;
      const predicted = forecastPoints.map((item) => [forecastStart + item.minute * 60000, item.expected]);
      const lower = forecastPoints.map((item) => [forecastStart + item.minute * 60000, item.lower]);
      const upper = forecastPoints.map((item) => [forecastStart + item.minute * 60000, item.upper]);
      // Keep the default viewport balanced when a sparse device history spans
      // weeks or months.  The complete history remains in the series and can
      // be inspected with the time slider; the initial window gives the
      // forecast enough horizontal space to read its slope and band.
      const configuredForecastHours = Number(simulationForecast.value?.simulation?.parameters?.forecastHours
        || simulation.value?.parameters?.forecastHours || 4);
      const forecastMinutes = Math.max(60, forecastPoints.length
        ? Math.max(...forecastPoints.map((point) => point.minute), configuredForecastHours * 60)
        : configuredForecastHours * 60);
      const forecastSpanMs = forecastMinutes * 60000;
      const historyWindowMs = Math.max(3 * 3600000, forecastSpanMs * 1.35);
      const focusStart = forecastStart - historyWindowMs;
      const historyInFocus = historicalAll.filter((item) => item[0] >= focusStart && item[0] <= forecastStart + 1000);
      const historical = historyInFocus.length >= 2
        ? historyInFocus
        : historicalAll.slice(-Math.min(24, historicalAll.length));
      const xMin = Math.min(focusStart, historical[0]?.[0] ?? forecastStart);
      const xMax = Math.max(forecastStart + forecastSpanMs, historical.at(-1)?.[0] ?? forecastStart);
      const axis = chartAxisRange(definition, [
        ...historicalAll.map((item) => item[1]),
        ...forecastPoints.flatMap((item) => [item.expected, item.lower, item.upper])
      ]);
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = dark ? '#e8eaed' : '#3c4043';
      simulationChart.value.setOption({
        backgroundColor: 'transparent', animation: false,
        tooltip: { trigger: 'axis', confine: true, formatter: (items) => {
          const list = Array.isArray(items) ? items : [items];
          const axisValue = finiteNumber(list[0]?.axisValue);
          const time = Number.isFinite(axisValue) ? `模拟 ${new Date(axisValue).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}` : '—';
          return `<strong>${time}</strong><br>${list.filter((item) => item.value?.[1] != null).map((item) => `${item.marker}${item.seriesName}：${formatCurveValue(item.value[1], definition)} ${definition.unit}`).join('<br>')}`;
        }},
        legend: { data: ['历史实测', '策略预测', '预测下界', '预测上界'], textStyle: { color: textColor, fontSize: 11 } },
        grid: { left: 42, right: 18, top: 32, bottom: 48 },
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none', startValue: xMin, endValue: xMax },
          { type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 14, bottom: 8, startValue: xMin, endValue: xMax,
            borderColor: dark ? '#4b5563' : '#d1d5db', fillerColor: dark ? 'rgba(96,165,250,.18)' : 'rgba(37,99,235,.12)', handleSize: 10,
            textStyle: { color: textColor, fontSize: 9 } }
        ],
        xAxis: { type: 'time', min: xMin, max: xMax, axisLabel: { color: textColor, fontSize: 10 }, axisPointer: { snap: true } },
        yAxis: {
          type: 'value', min: axis.min, max: axis.max, name: definition.unit,
          nameTextStyle: { color: textColor }, axisLabel: { color: textColor, fontSize: 10, formatter: (value) => formatCurveValue(value, definition) }
        },
        series: [
          { name: '历史实测', type: 'line', data: historicalAll, showSymbol: false, connectNulls: false, smooth: true, lineStyle: { color: '#1e8e3e', width: 2 } },
          { name: '策略预测', type: 'line', data: predicted, showSymbol: false, connectNulls: true, smooth: true, lineStyle: { color: '#2563eb', width: 2, type: 'dashed', opacity: (simulationPreviewLoading.value || simulationEvaluating.value) ? .35 : 1 } },
          { name: '预测下界', type: 'line', data: lower, showSymbol: false, connectNulls: true, lineStyle: { color: '#93c5fd', width: 1, type: 'dotted', opacity: (simulationPreviewLoading.value || simulationEvaluating.value) ? .25 : .85 } },
          { name: '预测上界', type: 'line', data: upper, showSymbol: false, connectNulls: true, lineStyle: { color: '#93c5fd', width: 1, type: 'dotted', opacity: (simulationPreviewLoading.value || simulationEvaluating.value) ? .25 : .85 } }
        ]
      }, true);
    };

    const queueSimulationPreview = (delay = 300) => {
      if (hydratingSimulation || simulationBusy.value || !props.plot?.plotId) return;
      simulationPreviewDirty.value = true;
      simulationPreviewError.value = '';
      const requestId = ++previewRequestSerial;
      if (previewTimer) window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(async () => {
        previewTimer = null;
        simulationPreviewLoading.value = true;
        await renderSimulationChart();
        try {
          const result = await api.evaluateRiskForecast({
            plotId: props.plot.plotId,
            metric: simulationMetric.value,
            scenario: simulationForm.value.scenario,
            parameters: { ...(simulationForm.value.parameters || {}) },
            requestVersion: String(requestId)
          });
          if (requestId !== previewRequestSerial) return;
          simulationForecast.value = result
            ? { ...result, persisted: false }
            : { status: 'UNAVAILABLE', reason: '预测响应为空', persisted: false };
          await nextTick();
          await renderSimulationChart();
        } catch (error) {
          if (requestId === previewRequestSerial) simulationPreviewError.value = error?.message || '预测服务暂不可用';
        } finally {
          if (requestId === previewRequestSerial) {
            simulationPreviewLoading.value = false;
            await renderSimulationChart();
          }
        }
      }, delay);
    };

    const loadMetricSeries = async (metric = simulationMetric.value, { resetPreview = false, preserveOnError = false } = {}) => {
      const normalized = simulationMetricDefinition(metric).code;
      const requestId = ++metricRequestSerial;
      simulationMetricLoading.value = true;
      try {
        const [historyResult, forecastResult] = await Promise.allSettled([
          api.getTelemetry(props.plot?.plotId, normalized, 120),
          api.getRiskForecast(props.plot?.plotId, normalized)
        ]);
        if (requestId !== metricRequestSerial) return;
      if (historyResult.status === 'fulfilled') simulationHistory.value = historyResult.value || [];
        else if (!preserveOnError) simulationHistory.value = [];
        if (forecastResult.status === 'fulfilled') simulationForecast.value = forecastResult.value || { status: 'UNAVAILABLE', reason: '预测响应为空' };
        else if (!preserveOnError) simulationForecast.value = { status: 'UNAVAILABLE', reason: forecastResult.reason?.message || '预测服务暂不可用' };
        if (resetPreview) simulationPreviewDirty.value = false;
        await nextTick();
        renderSimulationChart();
        if (simulationPreviewDirty.value) queueSimulationPreview();
      } finally {
        if (requestId === metricRequestSerial) simulationMetricLoading.value = false;
      }
    };

    const loadMetricHistory = async (metric = simulationMetric.value, { preserveOnError = true } = {}) => {
      const normalized = simulationMetricDefinition(metric).code;
      const requestId = ++metricRequestSerial;
      simulationMetricLoading.value = true;
      try {
        const history = await api.getTelemetry(props.plot?.plotId, normalized, 120);
        if (requestId !== metricRequestSerial) return;
        simulationHistory.value = history || [];
        await nextTick();
        renderSimulationChart();
      } catch (error) {
        if (requestId === metricRequestSerial && !preserveOnError) simulationHistory.value = [];
      } finally {
        if (requestId === metricRequestSerial) simulationMetricLoading.value = false;
      }
    };

    // Kept as a small compatibility wrapper for callers that used the older
    // scheduler name.  All previews now use the single queue above so loading,
    // error handling and stale-response protection stay consistent.
    const scheduleSimulationPreview = () => queueSimulationPreview();

    const cancelSimulationPreview = () => {
      if (previewTimer) window.clearTimeout(previewTimer);
      previewTimer = null;
      previewRequestSerial += 1;
      simulationEvaluating.value = false;
      simulationPreviewLoading.value = false;
    };

    const loadSimulation = async () => {
      const metric = simulationMetric.value;
      hydratingSimulation = true;
      try {
        const [configResult, historyResult, forecastResult] = await Promise.allSettled([
          api.getPlotSimulation(props.plot?.plotId),
          api.getTelemetry(props.plot?.plotId, metric, 120),
          api.getRiskForecast(props.plot?.plotId, metric)
        ]);
        if (configResult.status === 'fulfilled') {
          simulation.value = configResult.value;
          simulationForm.value = cloneForm(configResult.value);
        }
        if (historyResult.status === 'fulfilled') simulationHistory.value = historyResult.value || [];
        else simulationHistory.value = [];
        if (forecastResult.status === 'fulfilled') simulationForecast.value = forecastResult.value || { status: 'UNAVAILABLE', reason: '预测响应为空' };
        else simulationForecast.value = { status: 'UNAVAILABLE', reason: forecastResult.reason?.message || '预测服务暂不可用' };
        await nextTick();
        simulationPreviewDirty.value = false;
        renderSimulationChart();
      } catch (error) {
        toast?.(error.message || '地块模拟策略读取失败', 'error');
      } finally {
        hydratingSimulation = false;
      }
    };

    let liveSeriesTimer = null;
    let liveSeriesInFlight = false;
    let liveSeriesQueued = false;
    let liveSeriesKickTimer = null;
    let liveConfigRefreshedAt = 0;
    let liveSeriesVisibilityHandler = null;
    const isLivePlot = () => props.state?.sessionMode === 'live' || api.sessionMode === 'live';
    const refreshLiveSeries = async () => {
      if (!isLivePlot() || document.hidden || simulationBusy.value || simulationMetricLoading.value) return;
      if (liveSeriesInFlight) {
        liveSeriesQueued = true;
        return;
      }
      liveSeriesInFlight = true;
      try {
        if (simulationPreviewDirty.value) await loadMetricHistory(simulationMetric.value, { preserveOnError: true });
        else await loadMetricSeries(simulationMetric.value, { preserveOnError: true });
        // The simulator/device state is a separate resource from the curve;
        // refresh it periodically without overwriting unsaved what-if inputs.
        if (!simulationPreviewDirty.value && Date.now() - liveConfigRefreshedAt >= 10000) {
          liveConfigRefreshedAt = Date.now();
          try {
            const latest = await api.getPlotSimulation(props.plot?.plotId);
            if (latest && !simulationBusy.value) {
              hydratingSimulation = true;
              simulation.value = latest;
              simulationForm.value = cloneForm(latest);
              await nextTick();
              hydratingSimulation = false;
            }
          } catch (error) { /* keep the last known simulator state */ }
        }
      } finally {
        liveSeriesInFlight = false;
        if (liveSeriesQueued && !document.hidden) {
          liveSeriesQueued = false;
          if (!liveSeriesKickTimer) {
            liveSeriesKickTimer = window.setTimeout(() => {
              liveSeriesKickTimer = null;
              refreshLiveSeries();
            }, 120);
          }
        }
      }
    };
    const stopLiveSeriesRefresh = () => {
      if (liveSeriesTimer) window.clearInterval(liveSeriesTimer);
      liveSeriesTimer = null;
      if (liveSeriesKickTimer) window.clearTimeout(liveSeriesKickTimer);
      liveSeriesKickTimer = null;
      if (liveSeriesVisibilityHandler) document.removeEventListener('visibilitychange', liveSeriesVisibilityHandler);
      liveSeriesVisibilityHandler = null;
      liveSeriesQueued = false;
    };
    const startLiveSeriesRefresh = () => {
      stopLiveSeriesRefresh();
      if (!isLivePlot()) return;
      liveSeriesTimer = window.setInterval(refreshLiveSeries, 4000);
      liveSeriesVisibilityHandler = () => { if (!document.hidden) refreshLiveSeries(); };
      document.addEventListener('visibilitychange', liveSeriesVisibilityHandler);
      refreshLiveSeries();
    };

    const selectSimulationMetric = (eventOrCode) => {
      const requested = typeof eventOrCode === 'string' ? eventOrCode : eventOrCode?.target?.value;
      const normalized = simulationMetricDefinition(requested).code;
      if (normalized === simulationMetric.value && !simulationMetricLoading.value) return;
      simulationMetric.value = normalized;
      loadMetricHistory(normalized, { preserveOnError: false });
      simulationPreviewDirty.value = true;
      scheduleSimulationPreview(normalized);
    };

    const selectSimulationScenario = (code) => {
      const normalized = String(code || 'NORMAL').toUpperCase();
      const scenario = simulationScenarioOptions.value.find((item) => item.code === normalized) || PLOT_SIMULATION_SCENARIOS[0];
      const defaults = scenario.defaultParameters || PLOT_SIMULATION_DEFAULTS[normalized] || PLOT_SIMULATION_DEFAULTS.NORMAL;
      simulationForm.value = { scenario: normalized, parameters: { ...defaults } };
      queueSimulationPreview();
    };
    const saveSimulation = async () => {
      cancelSimulationPreview();
      simulationBusy.value = true;
      try {
        const saved = await api.updatePlotSimulation(props.plot.plotId, simulationForm.value);
        hydratingSimulation = true;
        simulation.value = saved; simulationForm.value = cloneForm(saved); simulationPreviewDirty.value = false;
        await nextTick();
        hydratingSimulation = false;
        await loadSimulation();
        toast?.('该地块模拟策略已保存，服务器将从下一采样点应用', 'success');
        emit('data-invalidated', { domains: ['overview', 'plots'], plotId: props.plot.plotId, record: saved });
      } catch (error) { hydratingSimulation = false; toast?.(error.message || '模拟策略保存失败', 'error'); }
      finally { simulationBusy.value = false; }
    };
    const resetSimulation = async (target) => {
      cancelSimulationPreview();
      simulationBusy.value = true;
      const metric = simulationMetric.value;
      try {
        const resetResult = await api.resetPlotSimulation(props.plot.plotId, target);
        hydratingSimulation = true;
        simulation.value = resetResult;
        simulationForm.value = cloneForm(resetResult);
        simulationPreviewDirty.value = false;
        await nextTick();
        hydratingSimulation = false;
        const refreshes = [];
        if (target === 'HISTORY' || target === 'ALL') {
          refreshes.push(api.getTelemetry(props.plot?.plotId, metric, 120));
        }
        if (target === 'FORECAST' || target === 'ALL') refreshes.push(api.getRiskForecast(props.plot?.plotId, metric));
        const refreshed = await Promise.allSettled(refreshes);
        let resultIndex = 0;
        if (target === 'HISTORY' || target === 'ALL') {
          const historyResult = refreshed[resultIndex++];
          if (historyResult?.status === 'fulfilled') simulationHistory.value = historyResult.value || [];
          else simulationHistory.value = [];
        }
        if (target === 'FORECAST' || target === 'ALL') {
          const forecastResult = refreshed[resultIndex++];
          simulationForecast.value = forecastResult?.status === 'fulfilled'
            ? (forecastResult.value || { status: 'UNAVAILABLE', reason: '预测响应为空' })
            : { status: 'UNAVAILABLE', reason: forecastResult?.reason?.message || '预测服务暂不可用' };
        }
        await nextTick();
        renderSimulationChart();
        emit('data-invalidated', { domains: ['overview', 'plots', 'telemetry'], plotId: props.plot.plotId, metric, resetTarget: target });
        toast?.(`${target === 'HISTORY' ? '历史' : target === 'FORECAST' ? '预测' : '历史与预测'}曲线已重置（硬件实测数据未删除）`, 'success');
      } catch (error) { hydratingSimulation = false; toast?.(error.message || '曲线重置失败', 'error'); }
      finally { simulationBusy.value = false; }
    };
    watch(simulationForm, () => {
      if (hydratingSimulation || simulationBusy.value) return;
      simulationPreviewDirty.value = true;
      queueSimulationPreview();
    }, { deep: true });
    onMounted(async () => {
      await loadSimulation();
      startLiveSeriesRefresh();
    });
    onBeforeUnmount(() => {
      stopLiveSeriesRefresh();
      cancelSimulationPreview();
      simulationChart.value?.dispose();
      simulationChart.value = null;
    });
    const metrics = computed(() => PLOT_METRIC_ORDER.map((code) => ({
      code,
      label: adminMetricLabel(code, props.plot?.metrics?.[code]?.label),
      target: props.plot?.metrics?.[code]?.target || '—',
      unit: props.plot?.metrics?.[code]?.unit || '',
      value: props.plot?.metrics?.[code]?.value,
      status: props.plot?.metrics?.[code]?.status || 'UNAVAILABLE'
    })));
    const relatedWork = computed(() => (Array.isArray(props.workOrders) ? props.workOrders : [])
      .filter((item) => item.plotId === props.plot?.plotId)
      .sort((a, b) => {
        if (isFinishedWork(a) !== isFinishedWork(b)) return isFinishedWork(a) ? 1 : -1;
        return new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime();
      })
      .slice(0, 3));
    const issueSummary = computed(() => {
      const deviceStatus = normalizedStatus(props.plot?.deviceStatus);
      if (['OFFLINE', 'ERROR', 'FATAL', 'BAD'].includes(deviceStatus)) {
        return {
          tone: 'danger',
          title: '采集设备没有上传新数据',
          detail: '请先检查设备供电和连接，确认数据恢复后再安排浇水或其他操作。'
        };
      }
      const abnormalMetric = metrics.value.find((metric) => ['warning', 'danger'].includes(metricTone(metric)));
      if (abnormalMetric) {
        const current = `${formatMetricValue(abnormalMetric)}${abnormalMetric.unit ? ` ${abnormalMetric.unit}` : ''}`;
        return {
          tone: metricTone(abnormalMetric),
          title: `${abnormalMetric.label}需要关注`,
          detail: `当前读数为 ${current}，建议范围为 ${abnormalMetric.target}。建议先复测一次，再根据结果安排处理。`
        };
      }
      return {
        tone: 'normal',
        title: '当前没有需要立即处理的问题',
        detail: '关键环境数据和采集设备目前都在可用范围内，按计划巡田即可。'
      };
    });
    const statusLabel = (item) => {
      const status = normalizedStatus(item?.status, 'OPEN');
      if (['DONE', 'COMPLETED'].includes(status)) return '已完成';
      if (status === 'IN_PROGRESS') return '进行中';
      if (status === 'ASSIGNED') return '已分配';
      if (status === 'PENDING') return '待处理';
      return item?.assigneeId ? '已分配' : '待分配';
    };
    const dueLabel = (item) => {
      if (isFinishedWork(item)) return '已完成';
      const dueAt = new Date(item?.dueAt || 0);
      if (!Number.isFinite(dueAt.getTime())) return '时间待确认';
      return dueAt.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    };
    const openView = (view, params = {}) => emit('navigate', view, { plotId: props.plot?.plotId, ...params });
    return {
      metrics,
      relatedWork,
      issueSummary,
      simulation,
      simulationForm,
      simulationScenarioOptions,
      simulationFields,
      simulationBusy,
      simulationMetric,
      simulationMetricOptions,
      simulationMetricLabel,
      simulationMetricLoading,
      simulationEvaluating,
      simulationPreviewLoading,
      simulationPreviewError,
      simulationChartEl,
      canConfigureSimulation,
      simulationDeviceLabel,
      simulationDeviceTone,
      hardwareLabel,
      hardwareTone,
      hardwareLastSeen,
      simulatorTone,
      simulationPreviewMessage,
      selectSimulationMetric,
      selectSimulationScenario,
      saveSimulation,
      resetSimulation,
      metricTone,
      formatMetric: formatMetricValue,
      healthScore: formatHealthScore,
      statusLabel,
      dueLabel,
      displayText,
      openView,
      close: () => emit('close')
    };
  }
};

const DecisionConsoleView = {
  template: '#tmpl-decision-console',
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const diagnosis = computed(() => props.state.feedItems.find(f => f.type === 'DIAGNOSIS'));
    const prescription = computed(() => props.state.feedItems.find(f => f.type === 'PRESCRIPTION'));
    
    // [INTERCONNECTIVITY] Highlight logic
    const highlightDiagnosis = ref(false);
    watch(() => props.routeParams, (newParams) => {
      if (newParams && newParams.highlight === 'diagnosis') {
        highlightDiagnosis.value = true;
        setTimeout(() => { highlightDiagnosis.value = false; }, 4000);
      }
    }, { immediate: true });

    // Chat Logic
    const chatInput = ref('');
    const chatHistory = ref([
      { role: 'agent', content: '您好，我是 AgriLoop 农业决策智能体。我已经接入了当前地块的传感器实时数据和生长阶段的阈值模型。\n\n关于番茄当前阶段的灌溉处方，或者刚才生成的诊断结论，您有任何疑问都可以随时问我。', sourceLabel: 'AgriLoop 智能助手' }
    ]);
    const isTyping = ref(false);
    const chatBox = ref(null);

    const sendMessage = async () => {
      if (!chatInput.value.trim()) return;
      
      const userMessage = chatInput.value.trim();
      chatHistory.value.push({ role: 'user', content: userMessage });
      chatInput.value = '';
      
      isTyping.value = true;
      scrollToBottom();

      if (props.state.sessionMode === 'live') {
        try {
          const plotId = props.routeParams?.plotId || props.state.plots[0]?.plotId;
          const response = await api.agentChat(userMessage, plotId);
          chatHistory.value.push({
            role: 'agent',
            content: agentResponseText(response, '后端智能服务未返回可展示的回答。'),
            sourceLabel: agentResponseSource(response, 'live'),
            traceId: response?.traceId,
            dataOrigin: 'BACKEND'
          });
        } catch (error) {
          chatHistory.value.push({ role: 'agent', content: `正式智能服务暂不可用：${error.message || '读取失败'}`, sourceLabel: '智能服务暂不可用' });
        } finally {
          isTyping.value = false;
          scrollToBottom();
        }
        return;
      }
      
      setTimeout(() => {
        isTyping.value = false;
        let reply = '基于当前环境遥测与生长模型，系统判断您的要求在安全阈值内，已为您记录参考。';
        if (userMessage.includes('为什么') || userMessage.includes('原因')) {
          reply = '我注意到当前的土壤湿度连续低于 20%（番茄结果期基线）。同时，空气温度 26.4°C 加速了蒸散，且传感器数据质量评分为正常（排除了硬件漂移）。因此诊断为真实水分胁迫。';
        } else if (userMessage.includes('处方') || userMessage.includes('水')) {
          reply = '针对此情况，处方引擎计算出需要 153 升水。根据您农场主管道的 18 升/分钟恒定流速，换算出的执行时长为 8 分 30 秒。该时长低于 900 秒的安全阈值上限。';
        }
        
        chatHistory.value.push({ role: 'agent', content: reply, sourceLabel: '演示规则' });
        scrollToBottom();
      }, 1500);
    };

    const scrollToBottom = () => {
      nextTick(() => {
        if (chatBox.value) {
          chatBox.value.scrollTop = chatBox.value.scrollHeight;
        }
      });
    };
    
    // Modals
    const showPassportModal = ref(false);
    const showDualTrackModal = ref(false);
    const canExecuteIrrigation = computed(() => canExecuteIrrigationRole(props.state.currentUser));
    const executionBusy = ref(false);
    let dualChart = null;

    const openExecution = () => {
      if (canExecuteIrrigation.value) {
        showDualTrackModal.value = true;
        return;
      }
      toast('当前身份没有灌溉执行权限', 'error');
    };

    watch(showDualTrackModal, async (newVal) => {
      if (newVal) {
        await nextTick();
        const dom = document.getElementById('dualTrackChart');
        if (!dom) return;
        if (!dualChart) {
          dualChart = echarts.init(dom);
        }
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#e8eaed' : '#202124';
        
        dualChart.setOption({
          backgroundColor: 'transparent',
          tooltip: { trigger: 'axis' },
          legend: { data: ['执行处方（有干预）', '不执行（无干预）'], textStyle: { color: textColor } },
          xAxis: { type: 'category', data: ['0 小时', '1 小时', '2 小时', '3 小时', '4 小时'], axisLabel: { color: textColor } },
          yAxis: { type: 'value', min: 10, max: 35, axisLabel: { color: textColor } },
          series: [
            {
              name: '执行处方（有干预）',
              type: 'line',
              smooth: true,
              itemStyle: { color: '#1e8e3e' },
              data: [16.8, 30.0, 28.5, 27.0, 26.1]
            },
            {
              name: '不执行（无干预）',
              type: 'line',
              smooth: true,
              itemStyle: { color: '#d93025' },
              data: [16.8, 15.2, 13.8, 12.0, 11.5]
            }
          ]
        });
      }
    });

    const confirmExecution = async () => {
      if (!canExecuteIrrigation.value) {
        showDualTrackModal.value = false;
        toast('当前身份没有灌溉执行权限', 'error');
        return;
      }
      showDualTrackModal.value = false;
      const plotId = props.routeParams?.plotId || props.state.plots[0]?.plotId;
      if (!plotId || executionBusy.value) return;
      executionBusy.value = true;
      try {
        const traceId = props.routeParams?.traceId || `legacy-irrigation-${plotId}`;
        const diagnosisResult = props.state.sessionMode === 'live'
          ? await api.evaluateDiagnosis(plotId, { traceId })
          : null;
        const plan = await api.estimateIrrigation({
          plotId,
          traceId,
          ...(diagnosisResult?.diagnosisId ? { diagnosisId: diagnosisResult.diagnosisId } : {})
        });
        if (plan?.executable !== true || plan?.readinessStatus !== 'READY') {
          throw new Error('当前处方未通过安全门，暂不能执行灌溉');
        }
        await api.executeIrrigation(plan.planId, plotId, {
          confirmed: true,
          approved: true,
          idempotencyKey: `legacy-irrigation-${plan.planId}`,
          source: 'legacy-decision-console',
          ...(props.state.sessionMode === 'demo' ? { outcome: 'SUCCEEDED' } : {})
        });
        emit('data-invalidated', { domains: ['commands', 'overview'], plotId, record: plan });
        toast(props.state.sessionMode === 'demo' ? '演示灌溉已执行，不会控制真实水泵' : '灌溉命令已提交，等待设备回执');
      } catch (error) {
        toast(error.message || '灌溉执行失败', 'error');
      } finally {
        executionBusy.value = false;
      }
    };

    return { 
      diagnosis, prescription, highlightDiagnosis,
      chatInput, chatHistory, isTyping, chatBox, sendMessage, 
      showPassportModal, showDualTrackModal, canExecuteIrrigation, executionBusy, openExecution, confirmExecution,
      displayText
    };
  }
};

const RoleAwareDecisionConsoleView = {
  components: { AdminAlertCenter, AdminDecision: AdminDecisionView, LegacyDecisionConsole: DecisionConsoleView },
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props) {
    const isFarmAdmin = computed(() => props.state.currentUser?.role === 'FARM_ADMIN');
    const isFarmer = computed(() => props.state.currentUser?.role === 'FARMER');
    return { isFarmAdmin, isFarmer };
  },
  template: `
    <div class="role-decision-shell">
      <template v-if="isFarmAdmin">
        <admin-alert-center :state="state"
                            @navigate="(view, params) => $emit('navigate', view, params)"
                            @data-invalidated="payload => $emit('data-invalidated', payload)"></admin-alert-center>
      </template>
      <admin-decision v-else-if="isFarmer" :state="state" :route-params="routeParams"
                      @navigate="(view, params) => $emit('navigate', view, params)"
                      @data-invalidated="payload => $emit('data-invalidated', payload)"></admin-decision>
      <legacy-decision-console v-else :state="state" :route-params="routeParams"
                               @navigate="(view, params) => $emit('navigate', view, params)"
                               @data-invalidated="payload => $emit('data-invalidated', payload)"></legacy-decision-console>
    </div>
  `
};

const WorkOrdersView = {
  template: '#tmpl-work-orders',
  props: ['state', 'routeParams'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const canRecordInspection = computed(() => roleCan(props.state.currentUser, 'inspection:create'));
    const canCreateWorkOrder = computed(() => roleCan(props.state.currentUser, 'work-order:manage'));
    
    // [INTERCONNECTIVITY] Highlight logic for new order
    const highlightNewOrder = ref(false);
    watch(() => props.routeParams, (newParams) => {
      if (newParams && newParams.highlight === 'new-order') {
        highlightNewOrder.value = true;
        setTimeout(() => { highlightNewOrder.value = false; }, 4000);
      }
    }, { immediate: true });

    const showFormModal = ref(false);
    const showWorkOrderModal = ref(false);
    const defaultDueAt = () => {
      const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      return new Date(dueAt.getTime() - dueAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };
    const workOrderForm = ref({
      title: '',
      plotId: props.state.plots[0]?.plotId || '',
      priority: 'MEDIUM',
      actionType: 'FIELD_OPERATION',
      dueAt: defaultDueAt(),
      reason: ''
    });
    const form = ref({
      plotId: 'plot-a01',
      soilSurface: '',
      cropCondition: '',
      portableSoilMoisture: '',
      notes: ''
    });

    watch(() => props.routeParams, (newParams) => {
      if (newParams?.openCreateTask && canCreateWorkOrder.value) {
        workOrderForm.value = {
          title: '',
          plotId: newParams.plotId || props.state.plots[0]?.plotId || '',
          priority: 'MEDIUM',
          actionType: 'FIELD_OPERATION',
          dueAt: defaultDueAt(),
          reason: ''
        };
        showWorkOrderModal.value = true;
      }
    }, { immediate: true });

    const submitWorkOrder = async () => {
      if (!canCreateWorkOrder.value) {
        toast('当前身份不能创建农务任务', 'error');
        return;
      }
      const draft = workOrderForm.value;
      if (!draft.title.trim() || !draft.plotId || !draft.dueAt || !draft.reason.trim()) {
        toast('请完整填写任务标题、地块、截止时间和执行说明', 'error');
        return;
      }
      try {
        const lifecycleTarget = ({
          SOWING: { targetStageCode: 'seedling', targetStageLabel: '苗期' },
          TRANSPLANTING: { targetStageCode: 'vegetative', targetStageLabel: '营养生长期' },
          HARVEST: { targetStageCode: 'fruiting', targetStageLabel: '采收完成' }
        })[String(draft.actionType || '').toUpperCase()] || {};
        const payload = {
          ...draft,
          ...lifecycleTarget,
          title: draft.title.trim(),
          reason: draft.reason.trim(),
          dueAt: new Date(draft.dueAt).toISOString(),
          sourceType: 'MANUAL',
          provenance: 'USER_PROVIDED',
          status: 'OPEN',
          assigneeId: null
        };
        const saved = await api.saveWorkOrder(payload);
        props.state.workOrders.unshift({ ...payload, ...saved });
        showWorkOrderModal.value = false;
        window.history.replaceState(null, '', '#work-orders');
        toast('农务任务已创建，当前进入待分配队列');
      } catch (error) {
        toast(error.message || '创建农务任务失败', 'error');
      }
    };

    const submitInspection = async () => {
      if (!canRecordInspection.value) {
        toast('当前身份只能查看工单，不能提交巡田记录', 'error');
        return;
      }
      if (!form.value.soilSurface || !form.value.portableSoilMoisture) {
        toast('请填写必填项', 'error');
        return;
      }
      
      if (props.state.sessionMode === 'live') {
        try {
          const saved = await api.createInspection({
            farmId: props.state.adminContext?.farmId || props.state.plots.find((plot) => plot.plotId === form.value.plotId)?.farmId,
            plotId: form.value.plotId,
            observedAt: new Date().toISOString(),
            soilSurface: form.value.soilSurface,
            cropCondition: form.value.cropCondition,
            portableSoilMoisture: Number(form.value.portableSoilMoisture),
            notes: form.value.notes || '现场无异常情况'
          });
          showFormModal.value = false;
          emit('data-invalidated', { domains: ['inspections', 'overview'], plotIds: [form.value.plotId], record: saved });
          toast('巡田记录已保存，管理员与系统审计可读取');
          form.value = { plotId: props.state.plots[0]?.plotId || '', soilSurface: '', cropCondition: '', portableSoilMoisture: '', notes: '' };
        } catch (error) {
          toast(error.message || '巡田记录保存失败', 'error');
        }
        return;
      }

      const newIns = {
        inspectionId: 'ins-new-' + Date.now(),
        plotId: form.value.plotId,
        observedAt: new Date().toISOString(),
        soilSurface: form.value.soilSurface,
        cropCondition: form.value.cropCondition,
        portableSoilMoisture: form.value.portableSoilMoisture,
        notes: form.value.notes || '现场无异常情况'
      };
      
      // Mutate state to show reactivity
      props.state.inspections.unshift(newIns);
      
      // [INTERCONNECTIVITY] Create a Feed Item to loop back to dashboard
      props.state.feedItems.unshift({
        id: 'fd-' + Date.now(),
        type: 'INFO',
        category: '人机协同反馈',
        title: `收到人工巡田报告 (${form.value.plotId})`,
        summary: `现场土壤: ${form.value.soilSurface}, 植被: ${form.value.cropCondition}, 实测水分: ${form.value.portableSoilMoisture}%。已将该实测值校准回遥测模型。`,
        timestamp: new Date().toLocaleTimeString(),
        badge: { color: 'green' },
        actions: []
      });

      showFormModal.value = false;
      toast('演示巡田记录已录入');
      
      // Reset form
      form.value = { plotId: 'plot-a01', soilSurface: '', cropCondition: '', portableSoilMoisture: '', notes: '' };
    };

    const inspectionObservationLabel = (group, value) => ({
      soil: { NORMAL: '正常', DRY: '干燥或开裂', WET: '过湿或积水' },
      crop: { NORMAL: '长势正常', LEAF_SLIGHT_WILT: '叶片轻微萎蔫', DISEASE_SUSPECTED: '疑似病害' }
    }[group]?.[String(value || '').toUpperCase()] || value || '—');

    return {
      showFormModal,
      showWorkOrderModal,
      workOrderForm,
      form,
      submitInspection,
      submitWorkOrder,
      highlightNewOrder,
      canRecordInspection,
      canCreateWorkOrder,
      resourceTypeLabel,
      priorityLabel: localizedPriorityLabel,
      workStatusLabel,
      inspectionObservationLabel
    };
  }
};

const FarmMembersView = {
  template: '#tmpl-farm-members',
  props: ['state', 'routeParams'],
  emits: ['navigate'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const isDemo = computed(() => props.state.sessionMode === 'demo');
    const isLoading = ref(false);
    const loadError = ref('');
    const currentFarmId = computed(() => props.state.currentUser?.farmIds?.find((farmId) => farmId !== '*') ||
      (isDemo.value ? 'farm-demo' : ''));
    const members = computed(() => Array.isArray(props.state.farmMembers) ? props.state.farmMembers : []);
    const activeFarmerCount = computed(() => members.value.filter((member) =>
      member.role === 'FARMER' && normalizedStatus(member.status) === 'ACTIVE').length);
    const plotNames = (member) => {
      if (member?.plotIds?.includes('*')) return '全部地块';
      const names = (member?.plotIds || [])
        .map((plotId) => props.state.plots.find((plot) => plot.plotId === plotId)?.name)
        .filter(Boolean);
      return names.length ? names.join('、') : '未授权地块';
    };
    const taskCount = (member) => props.state.workOrders.filter((item) => item.assigneeId === member.userId && !isFinishedWork(item)).length;
    const taskCountLabel = (member) => member.role === 'FARMER' ? `${taskCount(member)} 项` : '—';
    const memberStatus = (member) => {
      if (member.role !== 'FARMER') return '负责农场管理';
      return normalizedStatus(member?.status) === 'ACTIVE' ? '可分配任务' : '已停用，不能分配';
    };
    const memberSource = (member) => member?.sourceMode === 'SIMULATED' || isDemo.value ? '演示数据' : '正式账号';
    const refreshMembers = async (announce = true) => {
      if (!currentFarmId.value) {
        loadError.value = '当前账号没有可读取的农场范围';
        return;
      }
      isLoading.value = true;
      loadError.value = '';
      try {
        const loaded = await api.getFarmMembers({ farmId: currentFarmId.value });
        props.state.farmMembers.splice(0, props.state.farmMembers.length, ...loaded);
        if (announce) toast(`已读取 ${loaded.length} 名${isDemo.value ? '演示' : '正式'}成员`);
      } catch (error) {
        loadError.value = error?.message || '成员读取失败';
        if (announce) toast('读取正式成员失败：' + loadError.value, 'error');
      } finally {
        isLoading.value = false;
      }
    };
    const openTaskAssignment = () => emit('navigate', 'work-orders', { status: 'OPEN' });
    onMounted(() => {
      if (!isDemo.value) refreshMembers(false);
    });
    return {
      isDemo, isLoading, loadError, members, activeFarmerCount,
      plotNames, taskCountLabel, memberStatus, memberSource, refreshMembers, openTaskAssignment
    };
  }
};

const RoleAwareWorkOrdersView = {
  components: {
    'admin-work-management': AdminWorkManagementView,
    'work-order-lifecycle': WorkOrderLifecycleView
  },
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  template: `
    <admin-work-management v-if="state.currentUser?.role === 'FARM_ADMIN'" :state="state" :route-params="routeParams"
      @navigate="(view, params) => $emit('navigate', view, params)"
      @data-invalidated="payload => $emit('data-invalidated', payload)"></admin-work-management>
    <work-order-lifecycle v-else :state="state" :route-params="routeParams"
      @navigate="(view, params) => $emit('navigate', view, params)"
      @data-invalidated="payload => $emit('data-invalidated', payload)"></work-order-lifecycle>
  `
};

const CropPacksView = {
  template: '#tmpl-crop-packs',
  props: ['state', 'routeParams'],
  setup() {
    const riskFocusLabel = (value) => RISK_FOCUS_LABELS[value] || value || '—';
    const ruleOperatorLabel = (value) => ({ LT: '低于', LTE: '不高于', GT: '高于', GTE: '不低于', EQ: '等于' }[String(value || '').toUpperCase()] || value || '—');
    const varietyLabel = (value) => ({ demonstration: '示范品种', greenhouse: '设施栽培' }[String(value || '').trim().toLowerCase()] || value || '—');
    return { riskFocusLabel, ruleOperatorLabel, metricLabel: adminMetricLabel, varietyLabel, displayText };
  }
};

const RISK_FOCUS_LABELS = {
  WATER_DEFICIT: '缺水风险',
  HEAT_STRESS: '高温胁迫',
  COLD_STRESS: '低温冷害'
};
const TASK_ACTION_LABELS = { INSPECTION: '现场巡田', IRRIGATION_CHECK: '灌溉巡检' };
const METRIC_AVAILABILITY_LABELS = { SUPPORTED: '已接入', SIMULATION_ONLY: '演示参考', UNAVAILABLE: '不可用' };

function manualEnvMetrics(pack, stage) {
  const target = stage?.target || {};
  const metricLabels = {
    SOIL_MOISTURE: '土壤湿度',
    AIR_TEMPERATURE: '空气温度',
    AIR_HUMIDITY: '空气湿度',
    WATER_LEVEL: '水箱水位',
    LIGHT: '光照强度',
    CO2: 'CO2',
    PH: '土壤酸碱度',
    SOIL_EC: '土壤电导率',
    NITROGEN: '速效氮', PHOSPHORUS: '速效磷', POTASSIUM: '速效钾'
  };
  const items = [
    { code: 'SOIL_MOISTURE', label: metricLabels.SOIL_MOISTURE, range: `${target.soilMoistureLow ?? '—'}~${target.soilMoistureHigh ?? '—'}`, unit: '%', availability: 'SUPPORTED', note: '阶段核心管控指标' },
    { code: 'AIR_TEMPERATURE', label: metricLabels.AIR_TEMPERATURE, range: `${target.airTemperatureLow ?? '—'}~${target.airTemperatureHigh ?? '—'}`, unit: '°C', availability: 'SUPPORTED', note: '阶段核心管控指标' }
  ];
  if (target.airHumidityLow != null || target.airHumidityHigh != null) {
    items.push({
      code: 'AIR_HUMIDITY',
      label: metricLabels.AIR_HUMIDITY,
      range: `${target.airHumidityLow ?? '—'}~${target.airHumidityHigh ?? '—'}`,
      unit: '%RH',
      availability: 'SUPPORTED',
      note: '阶段环境湿度目标'
    });
  }
  const stageTargets = [
    { code: 'LIGHT', low: target.lightLow, high: target.lightHigh, unit: 'lux', note: '阶段模型参考区间' },
    { code: 'CO2', low: target.co2Low, high: target.co2High, unit: 'ppm', note: '阶段模型参考区间' },
    { code: 'PH', low: target.phLow, high: target.phHigh, unit: 'pH', note: '阶段模型参考区间' },
    { code: 'WATER_LEVEL', low: target.waterLevelLow, high: target.waterLevelHigh, unit: '%', note: '可监测指标' }
  ];
  stageTargets.forEach((item) => {
    if (item.low == null && item.high == null) return;
    const profile = (pack.metrics || []).find((metric) => metric.code === item.code) || {};
    items.push({
      code: item.code,
      label: adminMetricLabel(item.code, profile.label || metricLabels[item.code]),
      range: `${item.low ?? '—'}~${item.high ?? '—'}`,
      unit: profile.unit || item.unit,
      availability: profile.availability || (item.code === 'WATER_LEVEL' ? 'SUPPORTED' : 'SIMULATION_ONLY'),
      note: item.note
    });
  });
  const covered = new Set(items.map((item) => item.code));
  (pack.metrics || []).forEach((metric) => {
    if (covered.has(metric.code)) return;
    const fallbackRange = metric.range ? `${metric.range.min}~${metric.range.max}` : '—';
    items.push({
      code: metric.code,
      label: adminMetricLabel(metric.code, metric.label || metricLabels[metric.code]),
      range: fallbackRange,
      unit: metric.unit || '',
      availability: metric.availability || 'SIMULATION_ONLY',
      note: metric.availability === 'SUPPORTED' ? '可监测指标' : '模型参考区间'
    });
  });
  return items;
}

function buildStageGuide(pack, stage) {
  const target = stage?.target || {};
  const lines = [
    `${pack.identity.name}（${pack.identity.region || '本地'}）处于「${stage.label}」时，应优先保障根区水热环境稳定，避免忽干忽湿或温度骤变。`,
    `适宜土壤湿度 ${target.soilMoistureLow}%~${target.soilMoistureHigh}%，空气温度 ${target.airTemperatureLow}~${target.airTemperatureHigh}°C。`
  ];
  if (target.airHumidityLow != null || target.airHumidityHigh != null) {
    lines.push(`适宜空气湿度 ${target.airHumidityLow ?? '—'}%~${target.airHumidityHigh ?? '—'}%RH。`);
  }
  if (target.lightLow != null || target.lightHigh != null) {
    lines.push(`本阶段光照参考 ${target.lightLow ?? '—'}~${target.lightHigh ?? '—'} lux，CO₂ 参考 ${target.co2Low ?? '—'}~${target.co2High ?? '—'} ppm，土壤酸碱度参考 pH ${target.phLow ?? '—'}~${target.phHigh ?? '—'}；光照/CO₂/pH 当前为演示参考，不作为可执行处方输入。`);
  }
  if (stage.riskFocus?.length) {
    lines.push(`本阶段重点防范：${stage.riskFocus.map((code) => RISK_FOCUS_LABELS[code] || code).join('、')}。`);
  }
  if (stage.taskTemplates?.length) {
    const tasks = stage.taskTemplates.map((task) => {
      const action = TASK_ACTION_LABELS[task.actionType] || task.actionType;
      return `${action}（每 ${task.intervalDays} 天，优先级${localizedPriorityLabel(task.priority)}）`;
    }).join('；');
    lines.push(`建议农务节奏：${tasks}。`);
  }
  const stageBound = {
    WATER_DEFICIT: target.soilMoistureLow,
    HEAT_STRESS: target.airTemperatureHigh,
    COLD_STRESS: target.airTemperatureLow
  };
  const ruleNotes = (pack.rules || []).map((rule) => {
    const op = rule.operator === 'LT' ? '低于' : '高于';
    const bound = rule.threshold ?? stageBound[rule.code];
    const boundText = bound == null ? '阶段目标' : String(bound);
    return `${RISK_FOCUS_LABELS[rule.code] || rule.code}：${adminMetricLabel(rule.metric)}${op}${boundText}，且持续 ${rule.durationMinutes} 分钟时需重点关注`;
  });
  if (ruleNotes.length) lines.push(`规则参考：${ruleNotes.join('；')}。`);
  const stageKnowledge = pack.knowledge?.byStage?.[stage.code];
  const knowledgeSource = Array.isArray(stageKnowledge) && stageKnowledge.length
    ? stageKnowledge
    : (pack.knowledge?.content || []);
  const knowledgeLines = knowledgeSource.filter((line) => line && !line.startsWith('>') && !line.startsWith('#') && !line.startsWith('-')).slice(0, 5);
  return [...lines, ...knowledgeLines];
}

const CROP_MANUAL_ICONS = {
  tomato: '🍅',
  corn: '🌽',
  cucumber: '🥒',
  rice: '🌾',
  sunflower: '🌻',
  strawberry: '🍓',
  pepper: '🌶️'
};

const CropManualView = {
  template: '#tmpl-crop-manual',
  props: ['state', 'routeParams'],
  setup(props) {
    const packs = computed(() => (props.state.cropPackDetails || []).slice().sort((a, b) => a.identity.name.localeCompare(b.identity.name, 'zh-CN')));
    const manuals = ref([]);
    const liveManual = ref(null);
    const loadError = ref('');
    const cropCode = ref((props.state.plots?.[0]?.cropCode) || packs.value[0]?.cropCode || 'tomato');
    const stageCode = ref((props.state.plots?.[0]?.stageCode) || packs.value.find((p) => p.cropCode === cropCode.value)?.stages?.[0]?.code || 'seedling');

    const cropOptions = computed(() => {
      const source = manuals.value.length ? manuals.value : packs.value.map((pack) => ({
        cropCode: pack.cropCode,
        name: pack.identity?.name,
        region: pack.identity?.region,
        stageCount: pack.stages?.length || 0
      }));
      return source.map((item) => ({
        cropCode: item.cropCode,
        label: item.name || item.label,
        region: item.region || '本地',
        stageCount: item.stageCount || item.stages?.length || 0,
        icon: CROP_MANUAL_ICONS[item.cropCode] || '🌱'
      }));
    });
    const cropPack = computed(() => {
      if (liveManual.value) return liveManual.value;
      return packs.value.find((pack) => pack.cropCode === cropCode.value) || packs.value[0] || null;
    });
    const stageOptions = computed(() => (cropPack.value?.stages || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0)));
    const stage = computed(() => liveManual.value?.stage || stageOptions.value.find((s) => s.code === stageCode.value) || stageOptions.value[0] || null);
    const envMetrics = computed(() => {
      if (liveManual.value?.envMetrics?.length) return liveManual.value.envMetrics;
      return cropPack.value && stage.value ? manualEnvMetrics(cropPack.value, stage.value) : [];
    });
    const guideParagraphs = computed(() => {
      if (liveManual.value?.guideParagraphs?.length) return liveManual.value.guideParagraphs;
      return cropPack.value && stage.value ? buildStageGuide(cropPack.value, stage.value) : [];
    });

    const selectCrop = (code) => {
      cropCode.value = code;
      const listed = manuals.value.find((item) => item.cropCode === code);
      const pack = packs.value.find((item) => item.cropCode === code);
      stageCode.value = listed?.stages?.[0]?.code || pack?.stages?.[0]?.code || 'seedling';
    };
    const selectStage = (code) => { stageCode.value = code; };
    const availabilityLabel = (code) => METRIC_AVAILABILITY_LABELS[code] || code || '—';

    const loadManual = async () => {
      if (props.state.sessionMode !== 'live') {
        liveManual.value = null;
        return;
      }
      try {
        if (!manuals.value.length) manuals.value = await api.getCropManuals();
        liveManual.value = await api.getCropManual(cropCode.value, stageCode.value);
        loadError.value = '';
      } catch (error) {
        loadError.value = error.message || '培养手册读取失败';
        liveManual.value = null;
      }
    };

    watch([cropCode, stageCode], loadManual);
    onMounted(loadManual);

    return { cropCode, stageCode, cropOptions, cropPack, stageOptions, stage, envMetrics, guideParagraphs, selectCrop, selectStage, availabilityLabel, loadError };
  }
};

const ValueLedgerView = {
  template: '#tmpl-value-ledger',
  props: ['state', 'routeParams'],
  setup(props) {
    let chart = null;

    const renderChart = async () => {
      await nextTick();
      const dom = document.getElementById('ledgerChart');
      if (!dom) return;
      if (!chart) {
        chart = echarts.init(dom);
        window.addEventListener('resize', () => chart.resize());
      }

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = isDark ? '#e8eaed' : '#202124';
      const dailyData = props.state.valueLedger.daily;

      chart.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', formatter: '{b}: {c}% 偏差' },
        xAxis: { 
          type: 'category', 
          data: dailyData.map(d => d.date.split('-')[1]),
          axisLabel: { color: textColor }
        },
        yAxis: { 
          type: 'value', 
          name: '水量偏差率 (%)',
          axisLabel: { color: textColor },
          nameTextStyle: { color: textColor }
        },
        series: [{
          data: dailyData.map(d => d.deviationRatePct),
          type: 'bar',
          itemStyle: {
            color: (params) => params.value <= 0 ? '#1e8e3e' : '#d93025'
          }
        }]
      });
    };

    onMounted(renderChart);
    const observer = new MutationObserver(() => renderChart());
    const appearanceChanged = () => renderChart();
    onMounted(() => { observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-workspace-preset', 'data-accent', 'data-surface-style'] }); document.documentElement.addEventListener('agriloop:appearance-changed', appearanceChanged); });
    onBeforeUnmount(() => { observer.disconnect(); document.documentElement.removeEventListener('agriloop:appearance-changed', appearanceChanged); });

    return { provenanceLabel };
  }
};

// ---- SYSTEM ADMIN COMPONENTS ----

const AdminOverviewView = {
  template: '#tmpl-admin-overview',
  props: ['state', 'userSettings', 'routeParams'],
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
      showEvents, farmFilter, statusFilter, filteredPlots, plotFarms, plotSummary, healthPercent, cropBackgroundFor,
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

const AdminResourcesView = {
  template: '#tmpl-admin-resources',
  props: ['state', 'routeParams'],
  setup(props) {
    const farmFilter = ref(props.routeParams?.farmId || 'all');
    const statusFilter = ref('active');
    const activeRequestStatuses = new Set(['SUBMITTED', 'IN_REVIEW', 'PENDING_ACK', 'ACKNOWLEDGED', 'CONFLICT_REPORTED']);
    const farms = computed(() => props.state.farms || []);
    const profiles = computed(() => props.state.resourceProfiles || []);
    const plans = computed(() => (props.state.resourcePlans || []).filter(plan => farmFilter.value === 'all' || plan.farmId === farmFilter.value));
    const requests = computed(() => (props.state.resourceRequests || [])
      .filter(request => farmFilter.value === 'all' || request.farmId === farmFilter.value)
      .filter(request => statusFilter.value === 'all' || (statusFilter.value === 'active' ? activeRequestStatuses.has(request.status) : request.status === statusFilter.value))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)));
    const selectedProfiles = computed(() => profiles.value.filter(profile => farmFilter.value === 'all' || profile.farmId === farmFilter.value));
    const totals = computed(() => ({
      farms: selectedProfiles.value.length,
      quota: selectedProfiles.value.reduce((sum, profile) => sum + Number(profile.dailyQuotaLitres || profile.balance?.dailyQuotaLitres || 0), 0),
      remaining: selectedProfiles.value.reduce((sum, profile) => sum + Number(profile.remainingLitres ?? profile.balance?.remainingLitres ?? 0), 0),
      conflicts: requests.value.filter(request => request.status === 'CONFLICT_REPORTED').length,
      pendingAck: requests.value.filter(request => request.status === 'PENDING_ACK').length
    }));
    const farmName = farmId => farms.value.find(farm => farm.farmId === farmId)?.name || farmId || '未知农场';
    const plotName = plotId => (props.state.allPlots || []).find(plot => plot.plotId === plotId)?.name || plotId || '未知地块';
    const requestStatusLabel = status => ({ SUBMITTED: '待纳入计划', IN_REVIEW: '方案编制中', PENDING_ACK: '待农户确认', ACKNOWLEDGED: '农户已确认', CONFLICT_REPORTED: '冲突待复核', COMPLETED: '已完成', CANCELLED: '已撤回' }[String(status || '').toUpperCase()] || status || '待处理');
    const planStatusLabel = status => ({ DRAFT: '草案', CONFIRMED: '已确认', RUNNING: '执行中', COMPLETED: '已完成', PARTIAL: '部分完成', FAILED: '失败', CANCELLED: '已取消', EXPIRED: '已过期' }[String(status || '').toUpperCase()] || status || '未知');
    const timeLabel = value => { const date = new Date(value || 0); return Number.isNaN(date.getTime()) || date.getTime() <= 0 ? '—' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }); };
    return { farmFilter, statusFilter, farms, profiles, plans, requests, selectedProfiles, totals, farmName, plotName, requestStatusLabel, planStatusLabel, timeLabel };
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
    const sampleInterval = ref(Number(props.state.adminOverview?.simulator?.sampleIntervalSeconds || 20));
    const timeScale = ref(Number(props.state.adminOverview?.simulator?.timeScale || DEFAULT_SIMULATION_TIME_SCALE));
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
      const interval = Number(status.sampleIntervalSeconds || props.state.adminOverview.simulator?.sampleIntervalSeconds || 20);
      const scale = Number(status.timeScale || props.state.adminOverview.simulator?.timeScale || DEFAULT_SIMULATION_TIME_SCALE);
      props.state.adminOverview.simulator = {
        ...(props.state.adminOverview.simulator || {}),
        running: String(status.status || '').toUpperCase() === 'RUNNING',
        scenario: status.scenario || status.scenarioId || '',
        eventsEmitted: Number(status.eventsEmitted || status.eventCount || 0),
        sampleIntervalSeconds: interval,
        timeScale: scale
      };
      simRunning.value = props.state.adminOverview.simulator.running;
      if (Number.isFinite(interval) && interval > 0) sampleInterval.value = interval;
      if (Number.isFinite(scale) && scale > 0) timeScale.value = scale;
    };
    const toggleSimulator = async () => {
      if (simBusy.value) return;
      simBusy.value = true;
      try {
        const status = simRunning.value ? await api.stopSimulator() : await api.startSimulator();
        syncSimulator(status);
        toast(simRunning.value ? '模拟器已启动' : '模拟器已停止');
      } catch (error) {
        toast(error.message || '模拟器控制失败', 'error');
      } finally { simBusy.value = false; }
    };
    const saveSimulatorSettings = async () => {
      if (simBusy.value) return;
      simBusy.value = true;
      try {
        const status = await api.updateSimulatorSettings({
          sampleIntervalSeconds: sampleInterval.value,
          timeScale: timeScale.value
        });
        syncSimulator(status);
        toast('采样间隔与时间流速已保存，下一拍开始生效');
      } catch (error) {
        toast(error.message || '模拟器设置保存失败', 'error');
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

    watch(() => props.state.simulatorStatus, (status) => {
      if (status && typeof status === 'object') syncSimulator(status);
    }, { immediate: true });

    return {
      simRunning, simBusy, sampleInterval, timeScale, plotScenarios, globalScenario, scenarios,
      adminDualTrackModal, selectedDualTrackScenario, openDualTrack,
      adminReplayModal, replayEvents, selectedReplayScenario, openReplay, toggleSimulator, saveSimulatorSettings, applyPlotScenarios, togglePlotSimulation,
      scenarioLabel, localizedStatusLabel
    };
  }
};

const AdminRulesView = {
  template: '#tmpl-admin-rules',
  props: ['state', 'routeParams'],
  setup(props) {
    const toast = inject('toast');
    const activeTab = ref('packs');
    const expandedPacks = ref({});
    const showPackModal = ref(false);
    const editingPackId = ref(null);
    const savingPack = ref(false);
    const emptyPackForm = () => ({ id: '', cropCode: '', version: '1.0.0', icon: '🌱', name: '', status: 'draft', stages: ['苗期'], knowledgeDocs: [{ title: '栽培要点', content: '' }], availableForPlanting: true });
    const packForm = ref(emptyPackForm());
    const cropIcons = ['🌱', '🍅', '🥒', '🍓', '🍇', '🌶️', '🥬', '🥕', '🌽', '🍆', '🍉', '🍎'];
    const packKey = (pack = {}) => `${pack.cropCode || pack.id || ''}@${pack.version || '1.0.0'}`;
    const togglePack = (id) => {
      expandedPacks.value[id] = !expandedPacks.value[id];
    };
    const resetPackForm = () => {
      packForm.value = emptyPackForm();
      editingPackId.value = null;
    };
    const openCreatePack = () => {
      resetPackForm();
      showPackModal.value = true;
    };
    const openEditPack = (pack) => {
      const cropCode = pack.cropCode || pack.id;
      packForm.value = {
        ...emptyPackForm(),
        ...pack,
        id: cropCode,
        cropCode,
        version: pack.version || '1.0.0',
        stages: Array.isArray(pack.stages) && pack.stages.length ? [...pack.stages] : ['苗期'],
        knowledgeDocs: Array.isArray(pack.knowledgeDocs) && pack.knowledgeDocs.length
          ? pack.knowledgeDocs.map((doc) => typeof doc === 'string' ? { title: doc, content: '' } : { ...doc })
          : [{ title: '栽培要点', content: '' }]
      };
      editingPackId.value = packKey(pack);
      showPackModal.value = true;
    };
    const replacePackInState = (saved, previousKey = '') => {
      const mapped = mapCropPack(saved);
      const targetKey = packKey(mapped);
      const adminPacks = props.state.adminCropPacks || (props.state.adminCropPacks = []);
      const adminIndex = adminPacks.findIndex((item) => packKey(item) === (previousKey || targetKey));
      if (adminIndex >= 0) adminPacks.splice(adminIndex, 1, mapped);
      else adminPacks.push(mapped);
      const rawPacks = props.state.cropPacks || (props.state.cropPacks = []);
      const rawIndex = rawPacks.findIndex((item) => packKey(item) === (previousKey || targetKey));
      if (rawIndex >= 0) rawPacks.splice(rawIndex, 1, saved);
      else rawPacks.push(saved);
      props.state.cropPackDetails = [...rawPacks];
      return mapped;
    };
    const removePackFromState = (key) => {
      props.state.adminCropPacks = (props.state.adminCropPacks || []).filter((item) => packKey(item) !== key);
      props.state.cropPacks = (props.state.cropPacks || []).filter((item) => packKey(item) !== key);
      props.state.cropPackDetails = [...props.state.cropPacks];
      delete expandedPacks.value[key];
    };
    const savePack = async () => {
      if (savingPack.value) return;
      const form = packForm.value;
      const cropCode = String(form.cropCode || form.id || '').trim().toLowerCase();
      const version = String(form.version || '1.0.0').trim();
      const name = String(form.name || '').trim();
      const stages = (form.stages || []).map((item) => String(item || '').trim()).filter(Boolean);
      if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(cropCode)) return toast('作物包编号需为 2~64 位字母、数字、下划线或短横线', 'error');
      if (!/^\d+\.\d+\.\d+$/.test(version)) return toast('版本号需使用类似 1.0.0 的格式', 'error');
      if (!name) return toast('请填写作物名称', 'error');
      if (!stages.length) return toast('至少填写一个生长阶段', 'error');
      const payload = {
        cropCode,
        version,
        id: cropCode,
        name,
        icon: form.icon || '🌱',
        status: form.status === 'published' ? 'ACTIVE' : 'DRAFT',
        stages,
        knowledgeDocs: (form.knowledgeDocs || []).map((doc, index) => ({
          id: doc.id || `${cropCode}-doc-${index + 1}`,
          title: String(doc.title || '').trim(),
          content: String(doc.content || '').trim(),
          stageCode: doc.stageCode || ''
        })).filter((doc) => doc.title),
        availableForPlanting: form.availableForPlanting !== false
      };
      savingPack.value = true;
      try {
        const previousKey = editingPackId.value || '';
        const saved = previousKey
          ? await api.updateCropPack(cropCode, version, payload)
          : await api.createCropPack(payload);
        const mapped = replacePackInState(saved, previousKey);
        expandedPacks.value[packKey(mapped)] = true;
        showPackModal.value = false;
        resetPackForm();
        toast(previousKey ? '作物包已保存，三种角色会读取同一后端版本' : '作物包已新增，三种角色会读取同一后端版本');
      } catch (error) {
        toast(error.message || '作物包保存失败', 'error');
      } finally {
        savingPack.value = false;
      }
    };
    const canDeletePack = (pack) => !pack?.builtIn && String(pack?.sourceMode || '').toUpperCase() === 'USER_MANAGED';
    const deletePack = async (pack) => {
      if (savingPack.value || !confirm(`确定删除作物包“${pack.name}”吗？内置版本不会被物理删除。`)) return;
      savingPack.value = true;
      try {
        const key = packKey(pack);
        await api.deleteCropPack(pack.cropCode || pack.id, pack.version || '1.0.0');
        removePackFromState(key);
        toast('作物包已删除，三种角色的数据目录已同步');
      } catch (error) {
        toast(error.message || '作物包删除失败', 'error');
      } finally {
        savingPack.value = false;
      }
    };
    const togglePackStatus = async (pack) => {
      if (savingPack.value) return;
      const nextStatus = pack.status === 'published' ? 'draft' : 'published';
      savingPack.value = true;
      try {
        const saved = await api.updateCropPackStatus(pack.cropCode || pack.id, pack.version || '1.0.0', nextStatus);
        replacePackInState(saved, packKey(pack));
        toast(`作物包状态已更新为“${nextStatus === 'published' ? '已发布' : '草稿'}”`);
      } catch (error) {
        toast(error.message || '作物包状态更新失败', 'error');
      } finally {
        savingPack.value = false;
      }
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
      (props.state.adminCropPacks || []).forEach((pack, i) => {
        cols[i % masonryCols.value].push(pack);
      });
      return cols;
    });
    const toggleKnowledge = (packId, index) => {
      const key = `${packId}:${index}`;
      expandedKnowledge.value = expandedKnowledge.value === key ? null : key;
    };
    return {
      activeTab, expandedPacks, togglePack, showPackModal, editingPackId, packForm, cropIcons, savingPack, packKey, canDeletePack,
      expandedKnowledge, masonryCols, masonryColumns, openCreatePack, openEditPack, savePack,
      deletePack, togglePackStatus, addStage, removeStage, addKnowledgeDoc, removeKnowledgeDoc,
      toggleKnowledge, transitionCandidate, localizedStatusLabel, localizedSourceLabel, displayText
    };
  }
};

const SETTINGS_COPY = Object.freeze({
  'zh-CN': Object.freeze({
    preference: '个人偏好', localOnly: '仅本机保存', title: '工作台设置', description: '自定义当前浏览器中的外观、信息密度和数据刷新方式。设置即时生效，不会修改服务器上的业务数据。',
    appearance: '显示外观', themeColor: '主题与颜色', themeDescription: '保持农场管理员工作台清晰统一，也可以按个人习惯调整。', theme: '主题', workspaceTheme: '工作台主题',
    cardStyle: '卡片风格', accent: '强调色', custom: '自定义', preview: '实时预览', previewCaption: '当前主题会同步到管理员工作台', density: '显示密度', comfortable: '舒适', compact: '紧凑',
    contentWidth: '内容宽度', standard: '标准', wide: '宽屏', reducedMotion: '减少动效', reducedMotionHint: '减少过渡和动画，适合低性能设备或对动效敏感时使用。',
    dataExperience: '数据体验', refreshTips: '刷新与提示', refreshDescription: '控制工作台如何更新信息，以及是否保留来源标识。', autoRefresh: '自动刷新工作台', autoRefreshHint: '保持页面打开时拉取最新任务、遥测和建议。',
    refreshInterval: '刷新间隔', seconds: ' 秒', showOrigin: '显示数据来源', showOriginHint: '保留模拟、后端或人工记录标识，便于核对信息。', info: '外观和工作台偏好只写入当前浏览器的本地存储，不会修改地块、设备或任务事实。',
    current: '当前设置', restore: '恢复默认设置', font: '界面字体', fontHint: '选择适合当前设备和阅读习惯的字体。',
    themeLight: '白色', themeDark: '黑色', themeSystem: '跟随系统', themeLightHint: '清爽明亮的工作台', themeDarkHint: '低光环境更舒适', themeSystemHint: '自动适配设备明暗',
    changed: { theme: '主题已更新', preset: '工作台主题已更新', accent: '强调色已更新', customAccent: '自定义主题色已更新', density: '显示密度已更新', layout: '内容宽度已更新', surfaceStyle: '卡片风格已更新', plotBackground: '地块背景已更新', fontFamily: '字体已更新' }
  })
});

/**
 * Shared workspace preferences.  This page is available to all three roles;
 * it deliberately controls only the current browser's presentation and
 * refresh preferences, leaving platform/account settings to System Admin.
 */
const SettingsView = {
  template: '#tmpl-settings',
  props: ['state'],
  emits: ['settings-changed'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const account = computed(() => props.state?.currentUser || null);
    const settings = ref(readUserSettings(undefined, account.value));
    const copy = computed(() => SETTINGS_COPY['zh-CN']);
    const themeOptions = computed(() => [
      { value: 'light', label: copy.value.themeLight, hint: copy.value.themeLightHint },
      { value: 'dark', label: copy.value.themeDark, hint: copy.value.themeDarkHint },
      { value: 'system', label: copy.value.themeSystem, hint: copy.value.themeSystemHint }
    ]);
    const presetOptions = computed(() => PRESET_OPTIONS);
    const accentOptions = computed(() => ACCENT_OPTIONS);
    const surfaceStyleOptions = computed(() => SURFACE_STYLE_OPTIONS);
    const plotBackgroundOptions = computed(() => PLOT_BACKGROUND_OPTIONS);
    const fontOptions = computed(() => FONT_FAMILY_OPTIONS);
    const refreshOptions = [5, 15, 30, 60];
    const roleLabel = computed(() => props.state?.currentUser?.roleLabel || '当前身份');
    const themeLabel = computed(() => themeOptions.value.find(item => item.value === settings.value.theme)?.label || copy.value.themeLight);
    const presetLabel = computed(() => presetOptions.value.find(item => item.value === settings.value.preset)?.label || 'Codex');
    const accentLabel = computed(() => accentOptions.value.find(item => item.value === settings.value.accent)?.label || copy.value.accent);
    const surfaceStyleLabel = computed(() => surfaceStyleOptions.value.find(item => item.value === settings.value.surfaceStyle)?.label || copy.value.cardStyle);
    const plotBackgroundLabel = computed(() => plotBackgroundOptions.value.find(item => item.value === settings.value.plotBackground)?.label || '纯色背景');
    const fontLabel = computed(() => fontOptions.value.find(item => item.value === settings.value.fontFamily)?.label || 'System default');
    const updateSetting = (key, value) => {
      const patch = key === 'accent' ? { [key]: value, customAccent: '' } : { [key]: value };
      const next = saveUserSettings({ ...settings.value, ...patch }, undefined, account.value);
      settings.value = next;
      applyUserSettings(next);
      emit('settings-changed', next);
      // Card style is a visual preference and its live preview is already
      // visible, so do not interrupt the user with a success toast.
      if (key !== 'surfaceStyle' && copy.value.changed[key]) toast(copy.value.changed[key]);
    };
    const resetSettings = () => {
      const next = saveUserSettings(DEFAULT_USER_SETTINGS, undefined, account.value);
      settings.value = next;
      applyUserSettings(next);
      emit('settings-changed', next);
      toast(SETTINGS_COPY['zh-CN'].restore);
    };
    return {
      settings,
      copy,
      presetOptions,
      accentOptions,
      surfaceStyleOptions,
      plotBackgroundOptions,
      fontOptions,
      themeOptions,
      refreshOptions,
      roleLabel,
      themeLabel,
      presetLabel,
      accentLabel,
      surfaceStyleLabel,
      plotBackgroundLabel,
      fontLabel,
      updateSetting,
      resetSettings
    };
  }
};

const AdminSettingsView = {
  template: '#tmpl-admin-settings',
  props: ['state', 'routeParams'],
  emits: ['settings-changed'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const isLiveSession = computed(() => props.state.sessionMode === 'live');
    const activeTab = ref(props.routeParams?.tab || 'users');
    const roleFilter = ref('all');
    const logFilter = ref('all');
    const showCreateUser = ref(false);
    const newUser = ref({ username: '', password: '', role: 'FARMER', farmId: 'farm-demo' });
    const surfaceStyleOptions = SURFACE_STYLE_OPTIONS;
    const appearanceStyleOptions = surfaceStyleOptions.filter((item) => item.value !== DEFAULT_USER_SETTINGS.surfaceStyle);
    const appearanceSettings = ref(readUserSettings());
    const appearanceStyleLabel = computed(() => surfaceStyleOptions.find((item) => item.value === appearanceSettings.value.surfaceStyle)?.label || '经典卡片');

    watch(() => props.routeParams, (params) => {
      if (params?.tab) activeTab.value = params.tab;
    });

    const selectAppearanceStyle = (value) => {
      const option = surfaceStyleOptions.find((item) => item.value === value);
      if (!option) return;
      const next = saveUserSettings({ ...appearanceSettings.value, surfaceStyle: option.value });
      appearanceSettings.value = next;
      applyUserSettings(next);
      emit('settings-changed', next);
      toast(`界面风格已切换为${option.label}`);
    };

    const resetAppearanceStyle = () => selectAppearanceStyle(DEFAULT_USER_SETTINGS.surfaceStyle);

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
      if (isLiveSession.value) {
        toast('正式账号的停用/删除接口尚未开放，未修改后端数据。', 'error');
        return;
      }
      if (confirm('确定要删除该用户吗？')) {
        const idx = props.state.adminUsers.findIndex(u => u.userId === userId);
        if (idx > -1) {
          const u = props.state.adminUsers[idx];
          props.state.adminUsers.splice(idx, 1);
          props.state.adminAuditLogs.unshift({
            id: 'log-' + Date.now(),
            time: new Date().toLocaleTimeString().substring(0, 5),
            operator: 'sysadmin',
            action: 'CONFIG_CHANGE',
            actionLabel: '删除用户',
            detail: '删除用户 ' + u.username,
            ip: '127.0.0.1'
          });
          toast('用户已删除');
        }
      }
    };

    const toggleUser = (user) => {
      if (isLiveSession.value) {
        toast('正式账号状态由账号服务维护，当前页面只读。', 'error');
        return;
      }
      user.enabled = !user.enabled;
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

      const formatPerm = (text) => {
        if (!text) return '';
        return text
          .replace('👁', '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom; color: var(--g-text-tertiary)">visibility</span>')
          .replace('✅', '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom; color: var(--g-success)">check_circle</span>')
          .replace('❌', '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom; color: var(--g-danger)">cancel</span>')
          .replace('➖', '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom; color: var(--g-text-tertiary)">horizontal_rule</span>');
      };
    return {
      activeTab, roleFilter, logFilter, showCreateUser, newUser, filteredUsers, filteredLogs,
      permissionMatrix, formatPerm, createUser, deleteUser, toggleUser, localizedStatusLabel, displayText,
      surfaceStyleOptions, appearanceStyleOptions, appearanceSettings, appearanceStyleLabel,
      selectAppearanceStyle, resetAppearanceStyle
    };
  }
};

// 2. Setup App
const app = createApp({
  components: {
    'dashboard-view': DashboardView,
    'plot-detail-modal': PlotDetailModal,
    'decision-console-view': RoleAwareDecisionConsoleView,
    'ai-assistant-view': AdminAiChatView,
    'rules-strategies-view': AdminRulesStrategiesView,
    'work-orders-view': RoleAwareWorkOrdersView,
    'resource-coordination-view': AdminResourceCenterView,
    'farm-members-view': AdminMemberManagementView,
    'crop-manual-view': CropManualView,
    'crop-packs-view': CropPacksView,
    'admin-overview-view': AdminOverviewView,
    'admin-ops-view': AdminOpsView,
    'admin-resources-view': AdminResourcesView,
    'admin-audit-view': AdminAuditView,
    'admin-simulator-view': AdminSimulatorView,
    'admin-rules-view': AdminRulesView,
    'admin-settings-view': AdminSettingsView,
    'settings-view': SettingsView
  },
  setup() {
    const isLive = ref(false);
    const userSettings = ref(initialUserSettings);
    const isDark = ref(resolveTheme(userSettings.value.theme) === 'dark');
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
      simulatorStatus: isDemoSession
        ? { available: true, status: 'RUNNING', pid: 'demo', program: 'in-process', sampleIntervalSeconds: 20, timeScale: 144, eventsEmitted: 1847 }
        : { available: false, status: 'UNAVAILABLE', reason: 'BACKEND_OFFLINE' },
      inspections: isDemoSession ? (MOCK_DATA.inspections || []).map((item) => ({ ...item })) : [],
      resourceProfile: isDemoSession ? MOCK_DATA.resourceProfile : {},
      resourceProfiles: isDemoSession ? [MOCK_DATA.resourceProfile] : [],
      resourcePlans: isDemoSession ? [] : [],
      resourceRequests: isDemoSession ? (MOCK_DATA.resourceRequests || []).map(item => ({ ...item })) : [],
      cropPackDetails: isDemoSession ? MOCK_DATA.cropPackDetails : [],
      riskForecastConfig: isDemoSession ? MOCK_DATA.riskForecastConfig : EMPTY_RISK_FORECAST_CONFIG,
      farmerMessages: isDemoSession ? (MOCK_DATA.farmer_messages || []).map((item) => ({ ...item })) : [],
      farmerTasks: isDemoSession ? (MOCK_DATA.farmer_tasks || []).map((item) => ({ ...item })) : [],
      farmerProfile: isDemoSession ? (MOCK_DATA.farmer_profile || {}) : {},
      gapCoverage: isDemoSession ? (MOCK_DATA.gapCoverage || {}) : {},
      adminOverview: isDemoSession ? (MOCK_DATA.adminOverview || {}) : emptyAdminOverview(),
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
    const pendingFarmPlots = new Map();
    const LIVE_FARM_REFRESH_DOMAINS = Object.freeze([
      'overview', 'plots', 'workOrders', 'alerts', 'devices', 'members', 'batches', 'ledgers', 'simulator',
      'resourceProfiles', 'resourcePlans', 'resourceRequests', 'rulesStrategies'
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
    const shellCopy = Object.freeze({
      toggleTheme: '切换主题', logout: '退出登录', openProfile: '打开个人中心', closeProfile: '关闭个人中心',
      simulation: '仿真模式', online: '系统在线', offline: '后端离线', chooseFarm: '选择农场'
    });
    const sessionModeLabel = computed(() => state.value.sessionMode === 'demo' ? shellCopy.simulation : (isLive.value ? shellCopy.online : shellCopy.offline));
    const navItems = computed(() => {
      return state.value.allowedViews
        .map((viewId) => NAV_CATALOG.find((item) => item.id === viewId))
        .filter(Boolean)
        .map((item) => ({ ...item, label: item.labels?.[currentRole.value?.code] || item.label }));
    });
    // Keep preference controls out of the operational navigation.  The
    // footer is pinned by the sidebar layout, so “工作台设置” is always easy
    // to find in the lower-left corner for every shared role.
    const mainNavItems = computed(() => navItems.value.filter((item) => !item.isFooter));
    const footerNavItems = computed(() => navItems.value.filter((item) => item.isFooter));
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

    const applySettings = (patch = {}) => {
      const next = saveUserSettings({ ...userSettings.value, ...patch }, undefined, state.value.currentUser);
      userSettings.value = next;
      applyUserSettings(next);
      isDark.value = resolveTheme(next.theme) === 'dark';
      return next;
    };
    const handleSettingsChanged = (next) => {
      userSettings.value = saveUserSettings(next, undefined, state.value.currentUser);
      applyUserSettings(userSettings.value);
      isDark.value = resolveTheme(userSettings.value.theme) === 'dark';
      // Rebuild the fallback polling timer immediately when the preference
      // changes; SSE remains active for low-latency events.
      if (typeof startLiveRefresh === 'function') startLiveRefresh();
    };

    const toggleTheme = () => applySettings({ theme: resolveTheme(userSettings.value.theme) === 'dark' ? 'light' : 'dark' });
    let systemThemeMedia = null;
    const handleSystemThemeChange = () => {
      if (userSettings.value.theme !== 'system') return;
      applyUserSettings(userSettings.value);
      isDark.value = resolveTheme('system') === 'dark';
    };
    onMounted(() => {
      try {
        systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
        systemThemeMedia.addEventListener?.('change', handleSystemThemeChange);
      } catch (error) { systemThemeMedia = null; }
    });

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
      if (wants('resourceProfiles') || wants('overview')) jobs.resourceProfile = api.getWaterResourceProfile(farmId);
      if (wants('resourcePlans') || wants('overview')) jobs.resourcePlans = api.listResourcePlans({ farmId });
      if (wants('resourceRequests') || wants('resourcePlans') || wants('overview')) jobs.resourceRequests = api.listResourceRequests({ farmId });
      if (wants('cropPacks') || wants('overview')) jobs.cropPacks = api.getCropPacks({ farmId, includeDrafts: true });
      if (wants('cropPacks') || wants('rulesStrategies') || wants('overview')) {
        jobs.adminRules = api.getRuleSets(farmId);
        jobs.adminStrategyCandidates = api.getStrategyCandidates({ farmId });
      }
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
      const plotsReadSucceeded = results.plots?.status === 'fulfilled';
      const facts = results.plots?.status === 'fulfilled' ? results.plots.value : state.value.allPlots;
      if (results.overview?.status === 'fulfilled') state.value.overview = overview || {};
      if (hasFarmPlotRefresh(results)) {
        const refreshedDevices = results.devices?.status === 'fulfilled' ? results.devices.value : state.value.devices;
        const fetchedFacts = Array.isArray(facts) ? facts : [];
        const fetchedIds = new Set(fetchedFacts.map(item => String(item?.plotId || '')));
        const now = Date.now();
        const pending = [...pendingFarmPlots.entries()].filter(([, entry]) => entry?.farmId === farmId);
        pending.forEach(([plotId, entry]) => {
          if ((plotsReadSucceeded && fetchedIds.has(String(plotId))) || Number(entry?.expiresAt || 0) <= now) pendingFarmPlots.delete(plotId);
        });
        const pendingFacts = pending
          .filter(([plotId, entry]) => pendingFarmPlots.has(plotId) && !fetchedIds.has(String(plotId)))
          .map(([, entry]) => entry.plot);
        const merged = mergeFarmPlots([...fetchedFacts, ...pendingFacts], overview?.plots || [], refreshedDevices || []);
        state.value.allPlots = merged;
        state.value.plots = merged.filter(plot => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');
      }
      if (results.workOrders?.status === 'fulfilled') state.value.workOrders = results.workOrders.value || [];
      if (results.alerts?.status === 'fulfilled') state.value.alerts = results.alerts.value || [];
      if (results.devices?.status === 'fulfilled') state.value.devices = results.devices.value || [];
      if (results.members?.status === 'fulfilled') state.value.farmMembers = results.members.value || [];
      if (results.batches?.status === 'fulfilled') state.value.cropBatches = results.batches.value || [];
      if (results.ledgers?.status === 'fulfilled') state.value.valueLedgers = results.ledgers.value || [];
      if (results.resourceProfile?.status === 'fulfilled') state.value.resourceProfile = results.resourceProfile.value || {};
      if (results.resourceProfile?.status === 'fulfilled') state.value.resourceProfiles = [results.resourceProfile.value || {}];
      if (results.resourcePlans?.status === 'fulfilled') state.value.resourcePlans = results.resourcePlans.value || [];
      if (results.resourceRequests?.status === 'fulfilled') state.value.resourceRequests = results.resourceRequests.value || [];
      if (results.cropPacks?.status === 'fulfilled') {
        state.value.cropPacks = results.cropPacks.value || [];
        state.value.cropPackDetails = state.value.cropPacks;
      }
      if (results.adminRules?.status === 'fulfilled') state.value.adminRules = results.adminRules.value || [];
      if (results.adminStrategyCandidates?.status === 'fulfilled') state.value.adminStrategyCandidates = results.adminStrategyCandidates.value || [];
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
        resourcePlans: api.listResourcePlans({}),
        resourceRequests: api.listResourceRequests({}),
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
      const resourceProfiles = [];
      const timelineEntries = [];
      const inspectionEntries = [];
      const farmIds = farms.map((farm) => farm.farmId).filter(Boolean);
      const farmJobs = await Promise.all(farmIds.map(async (farmId) => {
        const [deviceResult, memberResult, ledgerResult, resourceProfileResult] = await Promise.allSettled([
          api.getDevices({ farmId }),
          api.getFarmMembers({ farmId }),
          api.getValueLedgers({ farmId }),
          api.getWaterResourceProfile(farmId)
        ]);
        return { farmId, deviceResult, memberResult, ledgerResult, resourceProfileResult };
      }));
      farmJobs.forEach(({ deviceResult, memberResult, ledgerResult, resourceProfileResult }) => {
        if (deviceResult.status === 'fulfilled') devices.push(...(deviceResult.value || []));
        if (memberResult.status === 'fulfilled') members.push(...(memberResult.value || []));
        if (ledgerResult.status === 'fulfilled') ledgers.push(...(ledgerResult.value || []));
        if (resourceProfileResult.status === 'fulfilled' && resourceProfileResult.value) resourceProfiles.push(resourceProfileResult.value);
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
      state.value.resourceProfiles = resourceProfiles;
      state.value.resourceProfile = resourceProfiles[0] || {};
      state.value.resourcePlans = results.resourcePlans?.status === 'fulfilled' ? results.resourcePlans.value || [] : [];
      state.value.resourceRequests = results.resourceRequests?.status === 'fulfilled' ? results.resourceRequests.value || [] : [];
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
      if (!userSettings.value.autoRefresh) return;
      const interval = Math.max(5000, Number(userSettings.value.refreshInterval || 15) * 1000);
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
        ? legacyAdminTabTarget(
          route.view,
          route.params?.tab || route.params?.section || route.params?.highlight,
          route.params?.farmId || state.value.adminContext.farmId,
          route.params
        )
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
      const normalized = normalizePlot({ status: 'ACTIVE', ...plot });
      const allIndex = state.value.allPlots.findIndex((item) => item.plotId === normalized.plotId);
      if (allIndex >= 0) {
        state.value.allPlots.splice(allIndex, 1, { ...state.value.allPlots[allIndex], ...normalized });
      } else {
        state.value.allPlots.push(normalized);
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
      const plotRecord = record?.plotId
        ? record
        : (record?.plot?.plotId ? record.plot : (record?.result?.plotId ? record.result : null));
      if (plotRecord?.plotId && domains.includes('plots')) {
        const farmId = state.value.adminContext.farmId;
        if (!plotRecord.farmId || !farmId || plotRecord.farmId === farmId) {
          const normalizedPlot = normalizePlot({ status: 'ACTIVE', ...plotRecord });
          applyPlotChange({ type: 'upsert', plot: normalizedPlot });
          pendingFarmPlots.set(normalizedPlot.plotId, { farmId, plot: normalizedPlot, expiresAt: Date.now() + 30000 });
        }
      }
      const normalized = [...new Set(domains.flatMap(domain => {
        if (domain === 'resourcePlans') return ['resourcePlans', 'resourceRequests', 'resourceProfiles', 'workOrders', 'ledgers', 'overview'];
        if (domain === 'resourceRequests') return ['resourceRequests', 'resourcePlans', 'workOrders', 'overview'];
        if (domain === 'resourceProfiles') return ['resourceProfiles', 'overview'];
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
      userSettings.value = readUserSettings(undefined, state.value.currentUser);
      applyUserSettings(userSettings.value);
      isDark.value = resolveTheme(userSettings.value.theme) === 'dark';
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
      systemThemeMedia?.removeEventListener?.('change', handleSystemThemeChange);
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
      shellCopy,
      sessionModeLabel,
      roleClass,
      currentRole,
      isFarmer,
      navItems,
      mainNavItems,
      footerNavItems,
      currentView,
      currentViewComponent,
      routeParams,
      selectedPlot,
      state,
      toasts,
      showToast,
      userSettings,
      toggleTheme,
      handleSettingsChanged,
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
    settings: 'settings',
    dashboard: 'dashboard'
  }[view] || 'tools';
  window.location.replace(`farmer.html#${farmerHash}`);
} else {
  app.mount('#app');
}
