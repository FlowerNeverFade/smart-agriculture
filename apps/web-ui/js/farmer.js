import { api, DEFAULT_SIMULATION_TIME_SCALE, PLOT_SIMULATION_DEFAULTS, PLOT_SIMULATION_SCENARIOS, moistureDeltaFromWater } from './api.js?v=20260902-manager-plot-order-v1';
import { ICON_CLASS } from './modules/icon-map.js?v=20260902-v5911-zhcn-v1';
import { MOCK_DATA } from './mock-data.js?v=20260902-v5911-zhcn-v1';
import { presentRoleUser } from './roles.js?v=20260902-v5911-zhcn-v1';
import { buildAccountProfile } from './account-profile.js';
import { agentRolePresentation } from './agent-presentation.js?v=20260902-v5911-zhcn-v1';
import { AdminAiChatView } from './modules/admin-ai-chat.js?v=20260902-ai-direct-v2';
import { orderedPlotMetrics, plotMetricValue, reconcilePlotOrder, stablePlotSort } from './plot-display.js?v=20260902-v5911-zhcn-v1';
import { ACCENT_OPTIONS, DEFAULT_USER_SETTINGS, PRESET_OPTIONS, SURFACE_STYLE_OPTIONS, applyUserSettings, readUserSettings, saveUserSettings, resolveTheme } from './user-settings.js?v=20260902-v5911-zhcn-v1';
import { createWorkspaceSettingsView } from './modules/workspace-settings.js?v=20260902-shell-fixes-v1';
import {
  agentResponseSource,
  agentResponseText,
  agentHistoryUserText,
  buildFarmerMessages,
  buildFarmerProfile,
  dueLabel,
  displayText,
  mergePlotTelemetryWindow,
  mergeFarmerWorkOrders,
  metricLabel,
  metricStatusLabel,
  normalizeAgentTurn,
  normalizeFarmerTask,
  normalizePlot,
  normalizeWorkStatus,
  provenanceLabel,
  resourceTypeLabel,
  scenarioLabel,
  sourceLabel,
  statusLabel as genericStatusLabel,
  workStatusLabel
} from './live-data.js?v=20260902-scenario-summary-v1';

const { createApp, ref, computed, onMounted, onBeforeUnmount, watch, nextTick, provide } = Vue;

// Keep the standalone farmer shell in lock-step with the shared role pages.
const initial_user_settings = readUserSettings(undefined, api.readSession()?.user);
applyUserSettings(initial_user_settings);

// Keep farmer.html independent from the remote Google icon font.  The same
// local Phosphor set is used by the shared admin shell, so icon geometry and
// fallback behaviour stay consistent when the server has no internet access.

const FarmerAppIcon = {
  props: { name: { type: String, default: 'check_circle' } },
  setup(props) {
    const iconClass = computed(() => ICON_CLASS[props.name] || 'ph-circle');
    return { iconClass };
  },
  template: '<span class="material-symbols-outlined ph" :class="iconClass" aria-hidden="true"></span>'
};

const STATUS_LABELS = {
  OPEN: '待分配',
  PENDING: '未开始',
  ASSIGNED: '已分配',
  IN_PROGRESS: '执行中',
  SUBMITTED: '待验收',
  REJECTED: '需返工',
  DONE: '已完成',
  CANCELLED: '已取消'
};

const PRIORITY_LABELS = {
  HIGH: '高优先级',
  MEDIUM: '中优先级',
  LOW: '低优先级'
};

const CATEGORY_LABELS = {
  alert: '告警',
  task: '任务',
  system: '系统',
  notice: '通知'
};

const MESSAGE_FILTER_OPTIONS = Object.freeze([
  { id: 'all', label: '全部', icon: 'inbox' },
  { id: 'alert', label: '告警', icon: 'warning' },
  { id: 'task', label: '任务', icon: 'assignment' },
  { id: 'notice', label: '通知', icon: 'campaign' }
]);

const ALERT_LEVEL_LABELS = Object.freeze({
  CRITICAL: '紧急',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
  INFO: '提示'
});

const ALERT_STATUS_LABELS = Object.freeze({
  ACTIVE: '待处理',
  OPEN: '待处理',
  ACKED: '处理中',
  ACKNOWLEDGED: '处理中',
  ESCALATED: '已升级',
  CLOSED: '已关闭',
  RESOLVED: '已解决'
});

function normalize_demo_message(msg = {}) {
  const copy = { ...msg };
  if (!copy.plotId) {
    if (/温室1|A01|plot-a01/i.test(`${copy.title} ${copy.snippet}`)) copy.plotId = 'plot-a01';
    else if (/温室2|A02|plot-a02|流量计/i.test(`${copy.title} ${copy.snippet}`)) copy.plotId = 'plot-a02';
    else if (/温室3|黄瓜|plot-b01/i.test(`${copy.title} ${copy.snippet}`)) copy.plotId = 'plot-b01';
  }
  if (copy.category === 'alert') {
    copy.alertLevel = copy.alertLevel || (/紧急|严重/.test(copy.title) ? 'HIGH' : 'MEDIUM');
    copy.alertStatus = copy.alertStatus || (copy.read ? 'CLOSED' : 'ACTIVE');
    copy.alertSource = copy.alertSource || (/设备|心跳|流量/.test(`${copy.title} ${copy.snippet}`) ? 'DEVICE_FRESHNESS' : 'SOIL_MOISTURE');
    copy.alertId = copy.alertId || copy.id;
  }
  if (copy.category === 'task') {
    copy.workOrderId = copy.workOrderId || copy.id?.replace(/^msg-/, 'wo-');
    copy.taskStatus = copy.taskStatus || (copy.read ? 'DONE' : 'ASSIGNED');
  }
  return copy;
}

const CROP_ICONS = {
  tomato: '🍅',
  corn: '🌽',
  cucumber: '🥒',
  rice: '🌾',
  sunflower: '🌻',
  strawberry: '🍓',
  pepper: '🌶️',
  lettuce: '🥬',
  eggplant: '🍆'
};

const CROP_MANUAL_AVAILABILITY = Object.freeze({
  SUPPORTED: '已接入',
  SIMULATION_ONLY: '演示参考',
  UNAVAILABLE: '不可用'
});

const CROP_MANUAL_RISK_LABELS = Object.freeze({
  WATER_DEFICIT: '缺水风险',
  HEAT_STRESS: '高温胁迫',
  COLD_STRESS: '低温冷害'
});

const CROP_MANUAL_TASK_LABELS = Object.freeze({
  INSPECTION: '现场巡田',
  IRRIGATION_CHECK: '灌溉巡检'
});

const PLOT_CHART_SPECS = [
  { code: 'SOIL_MOISTURE', label: '土壤湿度', unit: '%', min: 0, max: 60, amplitude: 3, precision: 1, color: 'var(--g-success)' },
  { code: 'AIR_TEMPERATURE', label: '空气温度', unit: '°C', min: 10, max: 40, amplitude: 1.8, precision: 1, color: 'var(--g-primary)' },
  { code: 'AIR_HUMIDITY', label: '空气湿度', unit: '%', min: 0, max: 100, amplitude: 2.2, precision: 1, color: 'var(--g-info)' },
  { code: 'LIGHT', label: '光照强度', unit: '勒克斯', min: 0, max: 70000, amplitude: 4500, precision: 0, color: 'var(--g-warning)' },
  { code: 'CO2', label: '二氧化碳浓度', unit: 'ppm', min: 300, max: 1200, amplitude: 60, precision: 0, color: 'var(--g-info)' },
  { code: 'RAINFALL', label: '降雨强度', unit: '毫米/小时', min: 0, max: 120, amplitude: 8, precision: 1, color: 'var(--g-primary)' },
  { code: 'NITROGEN', label: '速效氮', unit: 'mg/kg', min: 0, max: 300, amplitude: 10, precision: 0, color: 'var(--g-success)' },
  { code: 'PHOSPHORUS', label: '速效磷', unit: 'mg/kg', min: 0, max: 200, amplitude: 5, precision: 0, color: 'var(--g-primary)' },
  { code: 'POTASSIUM', label: '速效钾', unit: 'mg/kg', min: 0, max: 400, amplitude: 12, precision: 0, color: 'var(--g-warning)' }
];

const CHART_RANGE_OPTIONS = [
  {
    id: '7h',
    label: '7 小时',
    title: '近 7 小时',
    simHours: 7,
    amplitude_scale: 0.35,
    labels: ['7 时前', '5 时前', '3 时前', '2 时前', '1 时前', '0.5 时前', '现在']
  },
  {
    id: '1d',
    label: '1 天',
    title: '近 1 天',
    simHours: 24,
    amplitude_scale: 1,
    labels: ['0 时', '4 时', '8 时', '12 时', '16 时', '20 时', '现在']
  },
  {
    id: '7d',
    label: '7 天',
    title: '近 7 天',
    simHours: 168,
    amplitude_scale: 1,
    labels: ['7 日前', '5 日前', '3 日前', '2 日前', '1 日前', '0.5 日前', '现在']
  }
];

const FARMER_VIEWS = Object.freeze([
  'dashboard',
  'plots',
  'tasks',
  'inspections',
  'advice',
  'messages',
  'assistant',
  'tools',
  'settings'
]);

function parse_farmer_hash(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '').trim();
  if (!raw) return 'dashboard';
  const view = raw.split(/[?&/]/)[0];
  return FARMER_VIEWS.includes(view) ? view : 'dashboard';
}

function parse_tools_tab(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '').trim();
  const match = raw.match(/^tools(?:\/([^?&#/]+)|[?&]tab=([^&#/]+))/i);
  const tab = String(match?.[1] || match?.[2] || 'manual').toLowerCase();
  return ['risk', 'manual'].includes(tab) ? tab : 'manual';
}

function farmer_hash_for(view_id, tab = 'manual') {
  const view = FARMER_VIEWS.includes(view_id) ? view_id : 'dashboard';
  if (view === 'tools') return `#tools/${['risk', 'manual'].includes(tab) ? tab : 'manual'}`;
  return `#${view}`;
}

function crop_manual_metrics(pack, stage) {
  const target = stage?.target || {};
  const labels = {
    SOIL_MOISTURE: '土壤湿度',
    AIR_TEMPERATURE: '空气温度',
    AIR_HUMIDITY: '空气湿度',
    WATER_LEVEL: '水箱水位',
    LIGHT: '光照强度',
    CO2: 'CO2',
    PH: '土壤酸碱度',
    SOIL_EC: '土壤 EC',
    NITROGEN: '速效氮',
    PHOSPHORUS: '速效磷',
    POTASSIUM: '速效钾'
  };
  const items = [
    { code: 'SOIL_MOISTURE', label: labels.SOIL_MOISTURE, range: `${target.soilMoistureLow ?? '—'}~${target.soilMoistureHigh ?? '—'}`, unit: '%', availability: 'SUPPORTED', note: '阶段核心管控指标' },
    { code: 'AIR_TEMPERATURE', label: labels.AIR_TEMPERATURE, range: `${target.airTemperatureLow ?? '—'}~${target.airTemperatureHigh ?? '—'}`, unit: '°C', availability: 'SUPPORTED', note: '阶段核心管控指标' }
  ];
  if (target.airHumidityLow != null || target.airHumidityHigh != null) {
    items.push({
      code: 'AIR_HUMIDITY',
      label: labels.AIR_HUMIDITY,
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
    const profile = (pack?.metrics || []).find((metric) => metric.code === item.code) || {};
    items.push({
      code: item.code,
      label: profile.label || labels[item.code] || '其他指标',
      range: `${item.low ?? '—'}~${item.high ?? '—'}`,
      unit: profile.unit || item.unit,
      availability: profile.availability || (item.code === 'WATER_LEVEL' ? 'SUPPORTED' : 'SIMULATION_ONLY'),
      note: item.note
    });
  });
  const covered = new Set(items.map((item) => item.code));
  (pack?.metrics || []).forEach((metric) => {
    if (covered.has(metric.code)) return;
    items.push({
      code: metric.code,
      label: metric.label || labels[metric.code] || metric.code,
      range: metric.range ? `${metric.range.min}~${metric.range.max}` : '—',
      unit: metric.unit || '',
      availability: metric.availability || 'SIMULATION_ONLY',
      note: metric.availability === 'SUPPORTED' ? '可监测指标' : '模型参考区间'
    });
  });
  return items;
}

function crop_manual_guide(pack, stage) {
  const target = stage?.target || {};
  const identity = pack?.identity || {};
  const lines = [
    `${identity.name || pack?.cropCode || '作物'}（${identity.region || '本地'}）处于「${stage?.label || '当前阶段'}」时，应优先保障根区水热环境稳定，避免忽干忽湿或温度骤变。`,
    `适宜土壤湿度 ${target.soilMoistureLow ?? '—'}%~${target.soilMoistureHigh ?? '—'}%，空气温度 ${target.airTemperatureLow ?? '—'}~${target.airTemperatureHigh ?? '—'}°C。`
  ];
  if (target.airHumidityLow != null || target.airHumidityHigh != null) {
    lines.push(`适宜空气湿度 ${target.airHumidityLow ?? '—'}%~${target.airHumidityHigh ?? '—'}%RH。`);
  }
  if (target.lightLow != null || target.lightHigh != null) {
    lines.push(`本阶段光照参考 ${target.lightLow ?? '—'}~${target.lightHigh ?? '—'} lux，CO₂ 参考 ${target.co2Low ?? '—'}~${target.co2High ?? '—'} ppm，土壤酸碱度参考 pH ${target.phLow ?? '—'}~${target.phHigh ?? '—'}；光照/CO₂/pH 当前为演示参考，不作为可执行处方输入。`);
  }
  if (stage?.riskFocus?.length) {
    lines.push(`本阶段重点防范：${stage.riskFocus.map((code) => CROP_MANUAL_RISK_LABELS[code] || '其他风险').join('、')}。`);
  }
  if (stage?.taskTemplates?.length) {
    const tasks = stage.taskTemplates.map((task) => {
      const action = CROP_MANUAL_TASK_LABELS[task.actionType] || task.actionType;
      return `${action}（每 ${task.intervalDays} 天，优先级 ${task.priority}）`;
    }).join('；');
    lines.push(`建议农务节奏：${tasks}。`);
  }
  const stageKnowledge = pack?.knowledge?.byStage?.[stage?.code];
  const knowledgeSource = Array.isArray(stageKnowledge) && stageKnowledge.length
    ? stageKnowledge
    : (pack?.knowledge?.content || []);
  const knowledgeLines = knowledgeSource.filter((line) => line && !String(line).startsWith('>') && !String(line).startsWith('#') && !String(line).startsWith('-')).slice(0, 5);
  return [...lines, ...knowledgeLines];
}

const DEFAULT_CHART_LAYOUT = Object.freeze({
  width: 360,
  height: 132,
  left: 28,
  right: 8,
  top: 10,
  bottom: 18
});
function chart_inner_size(layout = DEFAULT_CHART_LAYOUT) {
  return {
    width: layout.width - layout.left - layout.right,
    height: layout.height - layout.top - layout.bottom
  };
}

function chart_x_at(index, count, layout = DEFAULT_CHART_LAYOUT) {
  const inner = chart_inner_size(layout);
  return layout.left + (index / Math.max(1, count - 1)) * inner.width;
}

function chart_x_at_ratio(ratio, layout = DEFAULT_CHART_LAYOUT) {
  const inner = chart_inner_size(layout);
  return layout.left + Math.max(0, Math.min(1, ratio)) * inner.width;
}

function chart_y_at(value, min, max, layout = DEFAULT_CHART_LAYOUT) {
  const inner = chart_inner_size(layout);
  const span = Math.max(1, max - min);
  return layout.top + (1 - ((Number(value) - min) / span)) * inner.height;
}

function parse_chart_ts(point) {
  if (point == null) return NaN;
  if (typeof point === 'number') {
    if (point > 1e12) return point;
    if (point > 1e9) return point * 1000;
    return NaN;
  }
  const raw = typeof point === 'object'
    ? (point.ts ?? point.observedAt ?? point.timestamp ?? point.eventTs)
    : point;
  if (typeof raw === 'number') return parse_chart_ts(raw);
  const parsed = Date.parse(raw || '');
  return Number.isFinite(parsed) ? parsed : NaN;
}

function chart_points_in_window(samples, min, max, layout = DEFAULT_CHART_LAYOUT) {
  return (Array.isArray(samples) ? samples : []).map((sample) => (
    `${chart_x_at_ratio(sample.ratio, layout).toFixed(1)},${chart_y_at(sample.value, min, max, layout).toFixed(1)}`
  )).join(' ');
}

// moisture bands can be replaced by the backend Crop Pack response as soon as
// a formal session is loaded.
let crop_pack_catalog = MOCK_DATA.cropPackDetails || [];

const FARMER_SIMILAR_CASES = Object.freeze([
  { id: 'case-042', title: '番茄结果期轻度缺水', result: '分两次补水后 3 小时回到目标区间，效果评价为有效。', similarity: '87%', source: '演示数据 · 已完成评价案例' },
  { id: 'case-038', title: '高温时段延后灌溉', result: '改到傍晚执行后蒸散压力下降，未出现重复告警。', similarity: '81%', source: '演示数据 · 已完成评价案例' }
]);

const FEEDBACK_CAUSE_LABELS = Object.freeze({
  WATER_DEFICIT: '地块缺水',
  SENSOR_DRIFT: '传感器读数可疑',
  DEVICE_FAULT: '采集设备异常',
  HEAT_STRESS: '高温胁迫',
  INSUFFICIENT_EVIDENCE: '证据不足'
});

const FEEDBACK_DECISION_MAP = Object.freeze({
  '采纳建议': 'ACCEPTED',
  '需要调整': 'MODIFIED',
  '修改方案': 'MODIFIED',
  '暂不处理': 'DEFERRED',
  '确认采用（待审批）': 'ACCEPTED'
});

const READINESS_STATUS_LABELS = Object.freeze({
  READY: '可以执行',
  NEEDS_EVIDENCE: '需要补充检查',
  HUMAN_REVIEW: '等待人工复核',
  UNAVAILABLE: '当前不可执行'
});

const READINESS_GATE_LABELS = Object.freeze({
  requiredMetrics: '关键数据',
  freshness: '数据新鲜度',
  dataQuality: '数据可靠性',
  deviceHealth: '设备在线',
  diagnosisSafety: '诊断安全',
  resourceCapacity: '水源容量',
  permission: '执行权限',
  safetyLimit: '用水上限'
});

const MANUAL_GATE_LABELS = Object.freeze({
  DATA_QUALITY: '数据质量',
  DATA_CONFLICT: '数据冲突',
  DEVICE_HEALTH: '设备状态',
  DIAGNOSIS_EVIDENCE: '诊断证据',
  DECISION_READINESS: '决策就绪度'
});

const EVIDENCE_LABELS = Object.freeze({
  FLOW_RATE_CALIBRATION: '检查流量计校准', PORTABLE_METER_COMPARISON: '使用便携仪复测',
  FRESH_TELEMETRY: '获取最新传感器数据', DEVICE_HEALTH: '检查设备在线状态',
  MORE_TELEMETRY_HISTORY: '延长遥测观察时间', CONTROL_PERMISSION: '当前账号无执行权限',
  GOOD_DATA_QUALITY: '补充质量合格数据', QUALITY_REVIEW: '复核数据质量', HUMAN_EVIDENCE_REVIEW: '复核人工现场证据',
  DIAGNOSIS_CONFIRMATION: '人工确认诊断', MORE_DIAGNOSIS_EVIDENCE: '现场复核（仅在读数异常时需要）'
});

function evidence_view(item, index = 0) {
  if (typeof item === 'string') return { id: `${item}-${index}`, label: EVIDENCE_LABELS[item] || item, meta: '缺失证据' };
  const metric = item?.metric ? `${item.metric} ${item.value ?? ''}`.trim() : '';
  const reason = item?.reason || item?.message || item?.status || item?.type || '证据记录';
  return {
    id: item?.eventId || item?.inspectionId || item?.source || `${reason}-${index}`,
    label: metric || reason,
    meta: [item?.provenance, item?.source, item?.observedAt || item?.ts].filter(Boolean).join(' · ') || 'DERIVED'
  };
}

function advice_trace_id() {
  return `farmer-advice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalize_similar_cases(raw) {
  return (Array.isArray(raw) ? raw : []).map((item, index) => {
    const cause = String(item.primaryCause || '').toUpperCase();
    const crop = item.cropCode || '作物';
    const score = Number(item.similarityScore ?? item.similarity ?? 0);
    const similarity = Number.isFinite(score)
      ? `${Math.round(score <= 1 ? score * 100 : score)}%`
      : '—';
    const effectiveness = Number(item.effectivenessScore);
    const result = Number.isFinite(effectiveness)
      ? `效果评分 ${Math.round(effectiveness <= 1 ? effectiveness * 100 : effectiveness)}%，已完成评价。`
      : '已完成评价案例，可供人工参考。';
    return {
      id: item.caseId || item.id || `case-${index}`,
      title: `${crop} · ${FEEDBACK_CAUSE_LABELS[cause] || cause || '相似情境'}`,
      result,
      similarity,
      source: `模拟数据 · ${item.ruleVersion || '已完成评价案例'}`,
      raw: item
    };
  });
}

function feedback_decision_code(label) {
  return FEEDBACK_DECISION_MAP[label] || 'ACCEPTED';
}

const FARMER_REPORT_CATALOG = Object.freeze({
  daily: {
    title: '今日农务日报',
    period: '今日 00:00—当前',
    source: '演示数据',
    items: [
      { label: '今日待办', value: '3 项', note: '含 1 项高优先级核验' },
      { label: '执行中', value: '1 项', note: '番茄疏花打杈' },
      { label: '风险提醒', value: '1 条', note: 'A01 土壤偏干' },
      { label: '设备情况', value: '已恢复', note: 'A02 流量计复测完成' }
    ]
  },
  weekly: {
    title: '本周农情周报',
    period: '本周一—今日',
    source: '演示数据',
    items: [
      { label: '完成任务', value: '12 项', note: '完成率 86%' },
      { label: '巡田记录', value: '7 条', note: '均保留人工来源' },
      { label: '计划用水', value: '—', note: '等待已确认配水计划' },
      { label: '风险变化', value: '下降 2 条', note: '不代表真实收益' }
    ]
  }
});

const SIMULATION_METRIC_OPTIONS = Object.freeze([
  { code: 'SOIL_MOISTURE', label: '土壤湿度', unit: '%', min: 0, max: 100, decimals: 1, defaultValue: 35 },
  { code: 'AIR_TEMPERATURE', label: '空气温度', unit: '°C', min: -40, max: 80, decimals: 1, defaultValue: 25 },
  { code: 'AIR_HUMIDITY', label: '空气湿度', unit: '%RH', min: 0, max: 100, decimals: 1, defaultValue: 68 },
  { code: 'LIGHT', label: '光照', unit: 'lux', min: 0, max: 100000, decimals: 0, defaultValue: 42000 },
  { code: 'CO2', label: '二氧化碳', unit: 'ppm', min: 0, max: 10000, decimals: 0, defaultValue: 520 },
  { code: 'PH', label: '酸碱度', unit: 'pH', min: 0, max: 14, decimals: 2, defaultValue: 6.25 },
  { code: 'WATER_LEVEL', label: '水位', unit: '%', min: 0, max: 100, decimals: 1, defaultValue: 78 },
  { code: 'RAINFALL', label: '降雨量', unit: 'mm/h', min: 0, max: 250, decimals: 1, defaultValue: 0.2 }
]);
const SIMULATION_METRIC_BY_CODE = Object.freeze(Object.fromEntries(
  SIMULATION_METRIC_OPTIONS.map((item) => [item.code, item])
));

function simulation_metric_definition(code = 'SOIL_MOISTURE') {
  return SIMULATION_METRIC_BY_CODE[String(code || '').toUpperCase()] || SIMULATION_METRIC_BY_CODE.SOIL_MOISTURE;
}

function simulation_finite_number(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function simulation_clamp_number(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function simulation_telemetry_timestamp(item) {
  return new Date(item?.ts || item?.timestamp || item?.eventTs || 0).getTime();
}

function simulation_normalized_telemetry(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      ...item,
      ts: item?.ts || item?.timestamp || item?.eventTs,
      value: simulation_finite_number(item?.value)
    }))
    .filter((item) => simulation_telemetry_timestamp(item) > 0 && Number.isFinite(item.value))
    .sort((left, right) => simulation_telemetry_timestamp(left) - simulation_telemetry_timestamp(right));
}

function simulation_normalized_forecast(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      minute: simulation_finite_number(item?.minute ?? item?.minutes, 0),
      expected: simulation_finite_number(item?.expected ?? item?.value),
      lower: simulation_finite_number(item?.lower ?? item?.expected ?? item?.value),
      upper: simulation_finite_number(item?.upper ?? item?.expected ?? item?.value)
    }))
    .filter((item) => Number.isFinite(item.minute) && Number.isFinite(item.expected))
    .sort((left, right) => left.minute - right.minute);
}

function simulation_align_forecast(curve, anchorValue, definition) {
  const points = simulation_normalized_forecast(curve);
  const anchor = simulation_finite_number(anchorValue);
  if (!points.length || !Number.isFinite(anchor)) return points;
  const delta = anchor - points[0].expected;
  const mapped = points.map((point, index) => {
    const expected = simulation_clamp_number(point.expected + delta, definition.min, definition.max);
    const lower = simulation_clamp_number(point.lower + delta, definition.min, definition.max);
    const upper = simulation_clamp_number(point.upper + delta, definition.min, definition.max);
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

function simulation_chart_axis_range(definition, values = []) {
  const finiteValues = values.map((value) => simulation_finite_number(value)).filter((value) => Number.isFinite(value));
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

function simulation_format_curve_value(value, definition) {
  const number = simulation_finite_number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('zh-CN', { maximumFractionDigits: definition.decimals, minimumFractionDigits: definition.decimals > 1 ? 1 : 0 });
}

function chart_seed(value) {
  return [...String(value || '')].reduce((seed, char) => ((seed * 31) + char.charCodeAt(0)) % 997, 17);
}

function clamp_chart_value(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parse_npk(value) {
  const raw = String(value || '').trim();
  const parts = raw.split(':').map((item) => Number(item));
  if (parts.length === 3 && parts.every((item) => Number.isFinite(item))) return parts;
  // 后端 NPK_RATIO 遥测存的是综合肥力单值（mg/kg），按常见比例派生氮/磷/钾基线。
  const single = Number(raw);
  if (Number.isFinite(single) && single > 0) return [single, single * 0.4, single * 0.6];
  return [0, 0, 0];
}

function format_chart_axis_value(value, precision = 0) {
  if (Math.abs(value) >= 10000) return `${Number((value / 10000).toFixed(1))} 万`;
  if (Math.abs(value) >= 1000) return `${Number((value / 1000).toFixed(1))} 千`;
  return Number(value.toFixed(precision)).toString();
}

function format_chart_current_value(value, precision = 0) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toLocaleString('zh-CN') : Number(value.toFixed(precision)).toString();
  }
  return String(value ?? '--');
}

function chart_points(values, min, max, layout = DEFAULT_CHART_LAYOUT) {
  const total = values.length;
  return values.map((value, index) => {
    const numeric = Number(value);
    const yValue = Number.isFinite(numeric) ? numeric : min;
    return `${chart_x_at(index, total, layout).toFixed(1)},${chart_y_at(yValue, min, max, layout).toFixed(1)}`;
  }).join(' ');
}

function simulation_forecast_chart(forecast, baseMoisture) {
  const raw = (forecast?.curve?.length ? forecast.curve : forecast?.horizons || [])
    .map((point) => ({
      minute: Number(point.minute ?? point.minutes ?? 0),
      expected: Number(point.expected ?? point.value),
      lower: Number(point.lower ?? point.expected ?? point.value),
      upper: Number(point.upper ?? point.expected ?? point.value)
    }))
    .filter((point) => Number.isFinite(point.minute) && Number.isFinite(point.expected));
  if (!raw.length) return null;
  const values = raw.map((point) => point.expected);
  const lowers = raw.map((point) => Number.isFinite(point.lower) ? point.lower : point.expected);
  const uppers = raw.map((point) => Number.isFinite(point.upper) ? point.upper : point.expected);
  const all = [...values, ...lowers, ...uppers, Number(baseMoisture)].filter(Number.isFinite);
  const min = Math.max(0, Math.floor(Math.min(...all) - 5));
  const max = Math.ceil(Math.max(35, ...all) + 5);
  const layout = { width: 360, height: 220, left: 30, right: 8, top: 12, bottom: 24 };
  const labels = raw.map((point) => point.minute === 0 ? '现在' : `${Math.max(1, Math.round(point.minute / 60))} 小时`);
  const xTicks = [0, Math.floor((raw.length - 1) / 2), raw.length - 1]
    .filter((index, position, list) => index >= 0 && list.indexOf(index) === position)
    .map((index, position, list) => ({ x: chart_x_at(index, raw.length, layout), y: layout.height - 4, label: labels[index], anchor: position === 0 ? 'start' : (position === list.length - 1 ? 'end' : 'middle') }));
  const grid = [max, (max + min) / 2, min].map((value) => ({ y: chart_y_at(value, min, max, layout), label: `${Number(value.toFixed(0))}%` }));
  const bandPolygon = `${chart_points(uppers, min, max, layout)} ${chart_points(lowers.slice().reverse(), min, max, layout)}`;
  const boundary = Number(forecast?.stressBoundary ?? forecast?.riskBoundary?.value);
  return {
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    plotLeft: layout.left,
    plotRight: layout.width - layout.right,
    grid,
    xTicks,
    bandPolygon,
    boundaryY: Number.isFinite(boundary) ? chart_y_at(boundary, min, max, layout) : null,
    series: [
      { label: '当前推演', color: 'var(--g-success)', points: chart_points(values, min, max, layout), values, primary: true },
      { label: '置信上界', color: 'var(--g-success)', points: chart_points(uppers, min, max, layout), values: uppers, dashed: true },
      { label: '置信下界', color: 'var(--g-success)', points: chart_points(lowers, min, max, layout), values: lowers, dashed: true }
    ],
    labels,
    sample_labels: labels,
    legend: [
      { label: '当前推演', color: 'var(--g-success)', style: 'solid' },
      { label: '置信区间', color: 'var(--g-success)', style: 'band' },
      ...(Number.isFinite(boundary) ? [{ label: '风险阈值', color: '#f9ab00', style: 'threshold' }] : [])
    ]
  };
}

function find_chart_range(range_id) {
  return CHART_RANGE_OPTIONS.find((item) => item.id === range_id)
    || CHART_RANGE_OPTIONS.find((item) => item.id === '1d')
    || CHART_RANGE_OPTIONS[1];
}

function chart_time_scale(plot) {
  const value = Number(plot?.simulation?.parameters?.timeScale);
  return Number.isFinite(value) && value >= 1 ? value : DEFAULT_SIMULATION_TIME_SCALE;
}

function downsample_chart_samples(samples, maxPoints = 48) {
  if (!Array.isArray(samples) || samples.length <= maxPoints) return samples || [];
  const step = (samples.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => samples[Math.round(index * step)]);
}

function simulation_axis_labels(simHours) {
  const ticks = 7;
  const span = Number(simHours);
  if (!Number.isFinite(span) || span <= 0) {
    return ['0 时', '4 时', '8 时', '12 时', '16 时', '20 时', '现在'];
  }
  return Array.from({ length: ticks }, (_, index) => {
    if (index === ticks - 1) return '现在';
    const hour = span * index / (ticks - 1);
    if (span <= 36) return `${Math.round(hour)} 时`;
    return `${(hour / 24).toFixed(1)} 日前`;
  });
}

function format_sim_clock_label(elapsedHours, spanHours) {
  const span = Number(spanHours) || 24;
  const elapsed = Number(elapsedHours);
  if (!Number.isFinite(elapsed)) return '—';
  if (elapsed >= span - 0.08) return '现在';
  if (span <= 36) return `${Math.round(Math.max(0, elapsed))} 时`;
  return `${(Math.max(0, span - elapsed) / 24).toFixed(1)} 日前`;
}

function metric_chart(plot, code, range_id = '1d', stage_override = null) {
  const spec = PLOT_CHART_SPECS.find((item) => item.code === code);
  const metric = plot?.metrics?.[code];
  if (!spec || !metric) return null;

  const range = find_chart_range(range_id);
  const is_risk = metric.status === 'WARN' || metric.status === 'ALERT';
  const seed = chart_seed(`${plot.plotId}:${code}:${range.id}`);
  const pattern = [-1, -0.42, 0.55, 1.05, -0.52, 0.68, 0];
  const phase = ((seed % 7) - 3) * 0.12;
  const historyPoints = Array.isArray(metric.history) ? metric.history : [];
  const timeScale = chart_time_scale(plot);
  const windowMs = Math.max(60_000, (Number(range.simHours) || 24) * 3600 * 1000 / timeScale);
  const nowMs = Date.now();
  const rawTimed = historyPoints.map((point) => ({
    ts: parse_chart_ts(point),
    value: Number(point?.value ?? point)
  })).filter((sample) => Number.isFinite(sample.ts) && Number.isFinite(sample.value))
    .sort((left, right) => left.ts - right.ts);
  const latestTs = rawTimed.length ? rawTimed[rawTimed.length - 1].ts : nowMs;
  const windowEnd = Math.min(nowMs, latestTs);
  const windowStart = windowEnd - windowMs;
  const timedSamples = rawTimed
    .filter((sample) => sample.ts >= windowStart - 1000 && sample.ts <= windowEnd + 5000)
    .map((sample) => ({
      ...sample,
      ratio: Math.max(0, Math.min(1, (sample.ts - windowStart) / windowMs))
    }));
  const samples = downsample_chart_samples(timedSamples);
  const observedValues = samples.map((sample) => sample.value);
  const hasObservedHistory = observedValues.length >= 2;
  const allowDerived = plot?.dataOrigin !== 'BACKEND';
  const build_values = (base, amplitude = spec.amplitude, series_offset = 0) => pattern.map((point, index) => {
    const scaled = amplitude * range.amplitude_scale;
    const wave = (point + phase + series_offset * 0.18) * scaled;
    const drift = (index < 3 ? (2 - index) * scaled * 0.06 : 0);
    return Number(clamp_chart_value(Number(base) + wave + drift, spec.min, spec.max).toFixed(spec.precision));
  });
  const derivedSamples = (values) => values.map((value, index, list) => ({
    value,
    ratio: list.length <= 1 ? 1 : index / (list.length - 1),
    ts: windowStart + (list.length <= 1 ? windowMs : windowMs * index / (list.length - 1))
  }));

  const risk_color = metric.status === 'ALERT' ? 'var(--g-danger)' : 'var(--g-warning)';
  const series = spec.multi
    ? parse_npk(metric.value).map((base, index) => {
      // NPK_RATIO 为 SIMULATION_ONLY 综合肥力，三元素按基线派生合成展示；
      // 不依赖单值历史（单值无法还原氮/磷/钾三条独立曲线）。
      const values = build_values(base, spec.amplitude * (index === 1 ? 0.65 : 1), index);
      const plotted = derivedSamples(values);
      return {
        label: ['氮', '磷', '钾'][index],
        color: is_risk ? risk_color : ['var(--g-success)', 'var(--g-primary)', 'var(--g-warning)'][index],
        values,
        samples: plotted,
        points: chart_points_in_window(plotted, spec.min, spec.max)
      };
    })
    : (() => {
      const values = hasObservedHistory ? observedValues : (allowDerived ? build_values(Number(metric.value)) : []);
      const plotted = hasObservedHistory ? samples : derivedSamples(values);
      return [{
        label: spec.label,
        color: is_risk ? risk_color : spec.color,
        values,
        samples: plotted,
        points: chart_points_in_window(plotted, spec.min, spec.max)
      }];
    })();

  const grid = [
    { y: 10, label: format_chart_axis_value(spec.max, spec.precision) },
    { y: 62, label: format_chart_axis_value((spec.max + spec.min) / 2, spec.precision) },
    { y: 114, label: format_chart_axis_value(spec.min, spec.precision) }
  ];
  const targetBand = stage_target_band(plot, code, stage_override);
  const span = Math.max(1, spec.max - spec.min);
  const quality = metric.quality || {};
  const isDemoMetric = plot?.dataOrigin !== 'BACKEND';
  const expectedSamples = Number(quality.expectedSamples ?? 90);
  const demoValidSamples = metric.status === 'ALERT' ? 84 : (metric.status === 'WARN' ? 86 : 88);
  const validSamples = Number(quality.validSamples ?? (isDemoMetric ? demoValidSamples : NaN));
  const freshnessMs = Number(quality.freshnessMs ?? (metric.ts ? Date.now() - Date.parse(metric.ts) : (isDemoMetric ? 15000 : NaN)));
  const completeness = Number(quality.completeness ?? (
    Number.isFinite(validSamples) && Number.isFinite(expectedSamples) && expectedSamples > 0
      ? validSamples / expectedSamples
      : NaN
  ));
  const confidence = Number(quality.confidence ?? (isDemoMetric ? (metric.status === 'ALERT' ? 0.91 : 0.97) : NaN));
  const axisLabels = range.labels || simulation_axis_labels(range.simHours);
  const primarySamples = series[0]?.samples || [];
  const sampleLabels = primarySamples.map((sample) => format_sim_clock_label(sample.ratio * (range.simHours || 24), range.simHours));

  return {
    ...spec,
    current_label: `${format_chart_current_value(metric.value, spec.precision)} ${metric.unit || spec.unit}`,
    target: metric.target || '—',
    targetBand: targetBand ? {
      low: targetBand[0], high: targetBand[1],
      yLow: 10 + (1 - ((targetBand[0] - spec.min) / span)) * 104,
      yHigh: 10 + (1 - ((targetBand[1] - spec.min) / span)) * 104
    } : null,
    stageLabel: stage_override?.label || plot?.stageLabel || crop_stage_for(plot)?.label || '当前阶段',
    quality: {
      status: String(quality.status || metric.status || 'UNKNOWN').toUpperCase(),
      freshnessLabel: Number.isFinite(freshnessMs) ? (freshnessMs < 60000 ? '1 分钟内' : `${Math.round(freshnessMs / 60000)} 分钟`) : '不可用',
      completenessLabel: Number.isFinite(completeness) ? `${Math.round(completeness * 100)}%` : '不可用',
      confidenceLabel: Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '不可用',
      windowMinutes: Number(quality.windowMinutes ?? 30),
      validSamples: Number.isFinite(validSamples) ? validSamples : null,
      expectedSamples: Number.isFinite(expectedSamples) ? expectedSamples : null,
      calculationVersion: quality.calculationVersion || 'telemetry-quality-v1'
    },
    status: metric.status || 'NORMAL',
    is_risk,
    risk_label: metric.status === 'ALERT' ? '告警偏离' : (metric.status === 'WARN' ? '偏离目标' : ''),
    range_title: range.title,
    simHours: range.simHours,
    timeScale,
    windowStart,
    windowEnd,
    labels: axisLabels,
    sample_labels: sampleLabels,
    samples: primarySamples,
    grid,
    is_multi: Boolean(spec.multi),
    history_source: hasObservedHistory ? 'BACKEND' : (allowDerived ? 'DERIVED' : 'UNAVAILABLE'),
    history_available: hasObservedHistory,
    series
  };
}

function format_relative_label(iso) {
  if (!iso) return '';
  const diff_ms = Date.now() - new Date(iso).getTime();
  if (diff_ms < 0) return '即将到期';
  const min = Math.floor(diff_ms / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  return `${day} 天前`;
}

function is_today(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function is_due_soon(task) {
  if (!task.due_iso || task.status === 'DONE') return false;
  const diff_ms = new Date(task.due_iso).getTime() - Date.now();
  return diff_ms > 0 && diff_ms < 6 * 60 * 60 * 1000;
}

function find_plot_by_id(plots, plot_id) {
  return plots.find((plot) => plot.plotId === plot_id);
}

/** 土壤湿度相对当前生长阶段目标值带 / 告警阈值的分级：NORMAL | WARN | ALERT */
function crop_pack_for(plot) {
  return (crop_pack_catalog || []).find((pack) => pack.cropCode === plot?.cropCode) || null;
}

function crop_stage_for(plot) {
  const pack = crop_pack_for(plot);
  if (!pack?.stages?.length) return null;
  return pack.stages.find((stage) => stage.code === plot?.stageCode) || pack.stages[pack.stages.length - 1];
}

/** Crop Pack 规则常不内嵌 threshold，正式解析顺序与后端一致：规则显式值 -> 阶段 soilMoistureLow。 */
function water_deficit_rule(pack) {
  return (pack?.rules || []).find((rule) => rule.code === 'WATER_DEFICIT' && (!rule.metric || rule.metric === 'SOIL_MOISTURE')) || null;
}

function resolve_water_deficit_threshold(pack, stage) {
  const deficit = water_deficit_rule(pack);
  const fromRule = Number(deficit?.threshold);
  if (Number.isFinite(fromRule)) return fromRule;
  const fromStage = Number(stage?.target?.soilMoistureLow);
  return Number.isFinite(fromStage) ? fromStage : null;
}

function resolve_moisture_band_status(plot) {
  const value = Number(plot?.metrics?.SOIL_MOISTURE?.value);
  if (!Number.isFinite(value)) return 'NORMAL';
  const pack = crop_pack_for(plot);
  let low = null;
  let high = null;
  let alertThreshold = null;
  let hysteresis = 2;
  if (pack) {
    const stage = crop_stage_for(plot);
    low = Number(stage?.target?.soilMoistureLow);
    high = Number(stage?.target?.soilMoistureHigh);
    alertThreshold = resolve_water_deficit_threshold(pack, stage);
    const deficit = water_deficit_rule(pack);
    const fromHysteresis = Number(deficit?.hysteresis);
    if (Number.isFinite(fromHysteresis)) hysteresis = fromHysteresis;
  } else {
    const nums = String(plot.metrics?.SOIL_MOISTURE?.target || '').match(/(\d+(?:\.\d+)?)/g);
    if (nums && nums.length >= 2) {
      low = Number(nums[0]);
      high = Number(nums[1]);
      alertThreshold = low;
    }
  }
  if (!Number.isFinite(low)) low = null;
  if (!Number.isFinite(high)) high = null;
  if (Number.isFinite(alertThreshold) && value < alertThreshold) return 'ALERT';
  // 接近下限（含阈值等于阶段下限的作物）给出偏离提示，避免只有玉米因 mock 写了 threshold 才有告警感。
  if (Number.isFinite(alertThreshold) && value < alertThreshold + Math.max(0, hysteresis)) return 'WARN';
  if (Number.isFinite(low) && value < low) return 'WARN';
  if (Number.isFinite(high) && value > high) return 'WARN';
  return 'NORMAL';
}

/** 光照相对 Crop Pack 阶段目标的状态：NORMAL | WARN_LOW | ALERT_LOW | WARN_HIGH | ALERT_HIGH */
function resolve_light_band_status(plot) {
  const value = Number(plot?.metrics?.LIGHT?.value);
  if (!Number.isFinite(value)) return 'NORMAL';
  const range = stage_target_band(plot, 'LIGHT');
  if (!range) return 'NORMAL';
  const [low, high] = range;
  const margin = Math.max(500, (high - low) * 0.08);
  if (value < low - margin) return 'ALERT_LOW';
  if (value < low) return 'WARN_LOW';
  if (value > high + margin) return 'ALERT_HIGH';
  if (value > high) return 'WARN_HIGH';
  return 'NORMAL';
}

const LIGHT_STATUS_LABELS = Object.freeze({
  NORMAL: '光照正常',
  WARN_LOW: '光照偏低',
  ALERT_LOW: '光照不足',
  WARN_HIGH: '光照偏高',
  ALERT_HIGH: '光照过强'
});

const BAND_STATUS_LABELS = {
  NORMAL: '正常',
  WARN: '偏离目标',
  ALERT: '低于阈值'
};

// 综合健康优先使用后端按 Crop Pack 生长阶段计算的结果；演示或后端缺失时
// 用同一套权重在前端复算：阶段指标 68% + 设备/新鲜度 14% + 风险 18%。
const HEALTH_METRIC_WEIGHTS = Object.freeze({
  SOIL_MOISTURE: 0.30,
  AIR_TEMPERATURE: 0.20,
  AIR_HUMIDITY: 0.16,
  LIGHT: 0.12,
  WATER_LEVEL: 0.12,
  CO2: 0.10
});
const HEALTH_LEVEL_LABELS = Object.freeze({
  HIGH: '高风险',
  ATTENTION: '需要处理',
  WATCH: '关注中',
  GOOD: '状态良好'
});

const HEALTH_STATUS_MULTIPLIERS = Object.freeze({
  NORMAL: 1,
  WARN: 0.70,
  ALERT: 0.42,
  DEGRADED: 0.58,
  UNKNOWN: 0.60
});

const HEALTH_RISK_SCORES = Object.freeze({
  LOW: 0.90,
  WARN: 0.66,
  HIGH: 0.35,
  CRITICAL: 0.22,
  UNKNOWN: 0.58
});

function clamp_health_score(value) {
  return Math.max(0.05, Math.min(0.98, Number(value) || 0));
}

function parse_target_range(target) {
  const matches = String(target || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k)?/gi) || [];
  const values = matches.map((raw) => {
    const match = raw.match(/(\d+(?:\.\d+)?)\s*(k)?/i);
    return match ? Number(match[1]) * (match[2] ? 1000 : 1) : NaN;
  }).filter(Number.isFinite);
  return values.length >= 2 ? [values[0], values[1]] : null;
}

function stage_target_band(plot, code, stage_override = null) {
  const target = (stage_override || crop_stage_for(plot))?.target || {};
  if (code === 'SOIL_MOISTURE' && Number.isFinite(Number(target.soilMoistureLow)) && Number.isFinite(Number(target.soilMoistureHigh))) {
    return [Number(target.soilMoistureLow), Number(target.soilMoistureHigh)];
  }
  if (code === 'AIR_TEMPERATURE' && Number.isFinite(Number(target.airTemperatureLow)) && Number.isFinite(Number(target.airTemperatureHigh))) {
    return [Number(target.airTemperatureLow), Number(target.airTemperatureHigh)];
  }
  if (code === 'AIR_HUMIDITY' && Number.isFinite(Number(target.airHumidityLow)) && Number.isFinite(Number(target.airHumidityHigh))) {
    return [Number(target.airHumidityLow), Number(target.airHumidityHigh)];
  }
  if (code === 'LIGHT' && Number.isFinite(Number(target.lightLow)) && Number.isFinite(Number(target.lightHigh))) {
    return [Number(target.lightLow), Number(target.lightHigh)];
  }
  if (code === 'CO2' && Number.isFinite(Number(target.co2Low)) && Number.isFinite(Number(target.co2High))) {
    return [Number(target.co2Low), Number(target.co2High)];
  }
  if (code === 'PH' && Number.isFinite(Number(target.phLow)) && Number.isFinite(Number(target.phHigh))) {
    return [Number(target.phLow), Number(target.phHigh)];
  }
  if (code === 'WATER_LEVEL') {
    if (Number.isFinite(Number(target.waterLevelLow)) && Number.isFinite(Number(target.waterLevelHigh))) {
      return [Number(target.waterLevelLow), Number(target.waterLevelHigh)];
    }
    return [20, 90];
  }
  return parse_target_range(plot?.metrics?.[code]?.target);
}

function metric_health_alignment(plot, code, metric) {
  if (!metric) return 0.38;
  const range = stage_target_band(plot, code);
  const value = Number(metric.value);
  let alignment = 0.68;
  if (range && Number.isFinite(value)) {
    const [low, high] = range;
    const half = Math.max((high - low) / 2, 0.001);
    const midpoint = (low + high) / 2;
    const distance = Math.abs(value - midpoint) / half;
    alignment = distance <= 1
      ? 0.72 + (1 - distance) * 0.22
      : Math.max(0.12, 0.72 - Math.min(1.8, distance - 1) * 0.34);
  } else if (Number.isFinite(value)) {
    alignment = 0.75;
  }
  const quality = String(metric.quality?.status || metric.status || 'UNKNOWN').toUpperCase();
  const qualityFactor = quality === 'BAD' ? 0.40 : (quality === 'DEGRADED' ? 0.70 : 1);
  const status = String(metric.status || 'UNKNOWN').toUpperCase();
  return clamp_health_score(alignment * qualityFactor * (HEALTH_STATUS_MULTIPLIERS[status] || HEALTH_STATUS_MULTIPLIERS.UNKNOWN));
}

function device_health_score(plot) {
  const status = String(plot?.deviceStatus || 'UNKNOWN').toUpperCase();
  const base = status === 'ONLINE' ? 0.94 : (status === 'DEGRADED' ? 0.62 : (status === 'OFFLINE' || status === 'UNBOUND' ? 0.18 : 0.45));
  const lastSeen = String(plot?.lastSeen || '');
  const parsed = Date.parse(lastSeen);
  let freshness = 0.62;
  if (Number.isFinite(parsed)) {
    const seconds = Math.max(0, (Date.now() - parsed) / 1000);
    freshness = seconds <= 60 ? 1 : (seconds <= 300 ? 0.92 : (seconds <= 900 ? 0.80 : (seconds <= 3600 ? 0.62 : 0.40)));
  } else {
  const minuteMatch = lastSeen.match(/(\d+)\s*分钟/);
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
    freshness = lastSeen.includes('刚刚') ? 1 : (minutes <= 1 ? 0.98 : (minutes <= 5 ? 0.92 : (minutes <= 15 ? 0.80 : 0.62)));
  }
  return clamp_health_score(base * freshness);
}

function health_breakdown(plot) {
  if (plot?.health && Number.isFinite(Number(plot.health.score))) {
    return {
      score: Number(plot.health.score),
      metricScore: Number(plot.health.metricScore ?? plot.health.score),
      deviceScore: Number(plot.health.deviceScore ?? 0.5),
      riskScore: Number(plot.health.riskScore ?? 0.5),
      completeness: Number(plot.health.completeness ?? 1),
      level: plot.health.level
    };
  }
  const packWeights = crop_pack_for(plot)?.healthProfile?.metricWeights || HEALTH_METRIC_WEIGHTS;
  let weightedTotal = 0;
  let weightTotal = 0;
  Object.entries(packWeights).forEach(([code, weight]) => {
    const metric = plot?.metrics?.[code];
    if (!metric) return;
    weightedTotal += metric_health_alignment(plot, code, metric) * Number(weight);
    weightTotal += Number(weight);
  });
  const metricScore = weightTotal ? weightedTotal / weightTotal : 0.38;
  const completenessPenalty = (1 - Math.min(1, weightTotal)) * 0.12;
  const riskKey = String(plot?.riskLevel || 'UNKNOWN').toUpperCase();
  const riskScore = HEALTH_RISK_SCORES[riskKey] || HEALTH_RISK_SCORES.UNKNOWN;
  const deviceScore = device_health_score(plot);
  const score = clamp_health_score(metricScore * 0.68 + deviceScore * 0.14 + riskScore * 0.18 - completenessPenalty);
  return { score, metricScore, deviceScore, riskScore, completeness: weightTotal };
}

function health_level(score, plot) {
  const coded = plot?.health?.level;
  if (coded && HEALTH_LEVEL_LABELS[coded]) return HEALTH_LEVEL_LABELS[coded];
  if (score < 0.55) return '高风险';
  if (score < 0.72) return '需要处理';
  if (score < 0.86) return '关注中';
  return '状态良好';
}

function compute_plot_health_score(plot) {
  if (Number.isFinite(Number(plot?.health?.score))) return Number(plot.health.score);
  return health_breakdown(plot).score;
}

const app = createApp({
  setup() {
    const is_live = ref(false);
    const user_settings = ref(readUserSettings(undefined, api.readSession()?.user));
    const is_dark = ref(resolveTheme(user_settings.value.theme) === 'dark');
    const current_accent_label = computed(() => ACCENT_OPTIONS.find((item) => item.value === user_settings.value.accent)?.label || '田野绿');
    const current_surface_style_label = computed(() => SURFACE_STYLE_OPTIONS.find((item) => item.value === user_settings.value.surfaceStyle)?.label || '经典卡片');
    const current_preset_label = computed(() => PRESET_OPTIONS.find((item) => item.value === user_settings.value.preset)?.label || '简洁中性');
    const is_sidebar_open = ref(typeof window === 'undefined' || window.innerWidth > 760);
    const toasts = ref([]);
    const data_updated_label = ref('刚刚');
    const bootstrap_loading = ref(true);
    const workspace_loading = ref(false);
    const workspace_load_progress = ref(0);
    const workspace_load_label = ref('正在准备农户数据…');
    let workspace_progress_hide_timer = null;

    const set_workspace_progress = (progress, label = '') => {
      workspace_load_progress.value = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
      if (label) workspace_load_label.value = label;
    };

    const begin_workspace_progress = (label = '正在加载数据…') => {
      if (workspace_progress_hide_timer) {
        window.clearTimeout(workspace_progress_hide_timer);
        workspace_progress_hide_timer = null;
      }
      workspace_loading.value = true;
      set_workspace_progress(6, label);
    };

    const finish_workspace_progress = (label = '加载完成') => {
      set_workspace_progress(100, label);
      if (workspace_progress_hide_timer) window.clearTimeout(workspace_progress_hide_timer);
      workspace_progress_hide_timer = window.setTimeout(() => {
        workspace_loading.value = false;
        workspace_load_progress.value = 0;
        workspace_progress_hide_timer = null;
      }, 320);
    };

    const show_toast = (message, type = 'success') => {
      const id = Date.now() + Math.random();
      toasts.value.push({ id, message, type });
      setTimeout(() => {
        toasts.value = toasts.value.filter((t) => t.id !== id);
      }, 3000);
    };
    provide('toast', show_toast);

    const session = api.readSession();
    const session_user = presentRoleUser(session?.user);
    const is_formal_session = session?.mode === 'live';
    const fallback_user = MOCK_DATA.farmer_profile;
    const initial_user = session_user || {};

    const user = ref(is_formal_session ? {
      ...initial_user,
      role_label: initial_user?.roleLabel || '种植农户'
    } : {
      ...initial_user,
      role_label: initial_user?.roleLabel || fallback_user.role_label,
      joined_at: fallback_user.joined_at,
      contact: fallback_user.contact,
      plot_names: fallback_user.plot_names
    });
    const workspace_settings_state = computed(() => ({
      currentUser: {
        ...user.value,
        roleLabel: user.value?.roleLabel || user.value?.role_label || '种植农户'
      }
    }));
    const handle_workspace_settings_changed = (next) => {
      user_settings.value = next;
      is_dark.value = resolveTheme(next.theme) === 'dark';
      if (typeof start_live_polling === 'function') start_live_polling();
    };
    const current_role = computed(() => user.value?.role || 'FARMER');
    const role_presentation = computed(() => agentRolePresentation(current_role.value));

    const farm = ref(is_formal_session ? {} : MOCK_DATA.farms[0]);
    const assigned_plot_names = new Set(fallback_user.plot_names || []);
    // The demo API hydrates browser-session effects before the app mounts.
    // Read that snapshot here instead of rebuilding cards from MOCK_DATA, so
    // a completed virtual irrigation remains visible after a full reload.
    const demo_plot_source = is_formal_session ? [] : Array.from(api.demoPlots?.values?.() || MOCK_DATA.plots);
    const assigned_plots = is_formal_session ? [] : demo_plot_source.filter((plot) => assigned_plot_names.has(plot.name)).map((plot) => ({
      ...plot,
      healthScore: compute_plot_health_score(plot)
    }));
    const initial_ordered_plots = stablePlotSort(assigned_plots);
    const plots = ref(initial_ordered_plots);
    const plot_order_ids = ref(initial_ordered_plots.map((plot) => String(plot.plotId || '').trim()).filter(Boolean));
    const plot_order_revision = ref(0);
    const plot_order_loaded = ref(false);
    const plot_order_error = ref('');
    const plot_order_busy = ref(false);
    const plot_drag_state = ref({
      active: false,
      pointerId: null,
      sourceIndex: -1,
      targetIndex: -1,
      startX: 0,
      startY: 0,
      longPressTimer: null,
      movedBeforeActivation: false,
      suppressClick: false,
      snapshot: [],
      dragPlotId: '',
      dropTargetId: ''
    });
    const assistant_view_state = computed(() => ({
      currentUser: user.value,
      plots: plots.value,
      allPlots: plots.value,
      sessionMode: is_formal_session ? 'live' : 'demo'
    }));

    const messages = ref(is_formal_session ? [] : (MOCK_DATA.farmer_messages || []).map(normalize_demo_message));
    const deleted_message_ids = ref(new Set(JSON.parse(localStorage.getItem('agriloop_deleted_messages') || '[]')));
    const tasks = ref(is_formal_session ? [] : MOCK_DATA.farmer_tasks.map((task) => ({ ...task })));
    const inspection_records = ref(is_formal_session ? [] : (MOCK_DATA.inspections || []).map((record) => ({
      ...record,
      plotName: find_plot_by_id(MOCK_DATA.plots, record.plotId)?.name || record.plotId
    })));
    const load_error = ref('');
    const operation_record_load_error = ref('');
    let workspace_request_version = 0;
    const evidence_requests = ref([]);

    const load_demo_operation_records = async () => {
      if (is_formal_session) return false;
      try {
        const farmId = farm.value?.farmId || 'farm-demo';
        const [records, workOrders] = await Promise.all([
          api.getInspections({ farmId }),
          api.getWorkOrders({ farmId })
        ]);
        const plotMap = new Map(plots.value.map((plot) => [String(plot.plotId), plot]));
        const normalizedRecords = (records || []).map((record) => ({
          ...record,
          plotName: plotMap.get(String(record.plotId))?.name || record.plotId
        })).sort((a, b) => new Date(b.observedAt || b.createdAt || 0) - new Date(a.observedAt || a.createdAt || 0));
        replace_ref_array(inspection_records, normalizedRecords);
        evidence_requests.value = (workOrders || [])
          .filter((task) => String(task.sourceType || '').toUpperCase() === 'READINESS')
          .map((task) => ({
            id: task.workOrderId || task.id,
            plotId: task.plotId,
            type: task.evidenceType || 'FIELD_INSPECTION',
            reason: task.reason,
            status: task.status,
            createdAt: task.createdAt,
            requesterId: task.requesterId || task.createdBy,
            requesterName: task.requesterName || task.createdBy,
            dataOrigin: 'SIMULATED'
          }));
        operation_record_load_error.value = '';
        return true;
      } catch (error) {
        operation_record_load_error.value = error?.message || '巡田记录和补证申请读取失败';
        return false;
      }
    };

    const current_view = ref(parse_farmer_hash());
    const tools_tab = ref(parse_tools_tab());
    const selected_plot = ref(plots.value[0] || null);
    const chart_range = ref('1d');
    const plot_stage_preview = ref(selected_plot.value?.stageCode || '');
    const plot_stage_options = computed(() => (crop_pack_for(selected_plot.value)?.stages || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0)));
    const plot_stage_preview_item = computed(() => plot_stage_options.value.find((stage) => stage.code === plot_stage_preview.value) || crop_stage_for(selected_plot.value));
    const chart_range_options = CHART_RANGE_OPTIONS;
    const chart_tooltip = ref(null);
    const show_chart_tooltip = (event, chart, key = chart?.code) => {
      const svg = event?.currentTarget;
      const series = Array.isArray(chart?.series) ? chart.series : [];
      const pointCount = series.reduce((count, item) => Math.max(count, item?.values?.length || 0), 0);
      if (!svg || !pointCount) {
        chart_tooltip.value = null;
        return;
      }
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const left = Number(chart?.plotLeft ?? DEFAULT_CHART_LAYOUT.left) / Number(chart?.layoutWidth ?? DEFAULT_CHART_LAYOUT.width);
      const right = Number(chart?.plotRight ?? (DEFAULT_CHART_LAYOUT.width - DEFAULT_CHART_LAYOUT.right)) / Number(chart?.layoutWidth ?? DEFAULT_CHART_LAYOUT.width);
      const inner = Math.max(0.001, right - left);
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const innerRatio = Math.max(0, Math.min(1, (ratio - left) / inner));
      const samples = chart.samples || series[0]?.samples || [];
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      samples.forEach((sample, index) => {
        const distance = Math.abs(Number(sample.ratio) - innerRatio);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      const index = samples.length ? nearestIndex : Math.round(innerRatio * Math.max(0, pointCount - 1));
      const simHours = Number(chart.simHours) || 24;
      const labels = chart.sample_labels || chart.labels || [];
      const values = series
        .filter((item) => item.tooltip !== false)
        .map((item) => ({
          label: item.label,
          color: item.color,
          value: item.samples?.[index]?.value ?? item.values?.[index]
        }))
        .filter((item) => Number.isFinite(Number(item.value)));
      chart_tooltip.value = {
        key,
        label: format_sim_clock_label(innerRatio * simHours, simHours) || labels[index] || `第 ${index + 1} 个采样点`,
        values,
        left: Math.max(9, Math.min(91, ratio * 100)),
        top: Math.max(18, Math.min(82, ((event.clientY - rect.top) / rect.height) * 100))
      };
    };
    const hide_chart_tooltip = () => { chart_tooltip.value = null; };
    const plot_simulation = ref(null);
    const plot_charts = computed(() => PLOT_CHART_SPECS
      .map((spec) => {
        const chart = metric_chart(
          { ...selected_plot.value, simulation: plot_simulation.value || selected_plot.value.simulation },
          spec.code,
          chart_range.value,
          plot_stage_preview_item.value
        );
        if (!chart) return { ...spec, unavailable: true, current_label: 'UNAVAILABLE', target: '无可用数据', stageLabel: plot_stage_preview_item.value?.label || selected_plot.value?.stageLabel || '当前阶段', quality: { status: 'UNAVAILABLE', freshnessLabel: '不可用', completenessLabel: '不可用', confidenceLabel: '不可用' } };
        if (spec.code !== 'SOIL_MOISTURE' || !selected_plot.value) return chart;
        const status = resolve_moisture_band_status(selected_plot.value);
        const is_risk = status === 'WARN' || status === 'ALERT';
        const risk_color = status === 'ALERT' ? 'var(--g-danger)' : 'var(--g-warning)';
        return {
          ...chart,
          status,
          is_risk,
          risk_label: status === 'ALERT' ? '低于阈值' : (status === 'WARN' ? '偏离目标' : ''),
          series: chart.series.map((item) => ({ ...item, color: is_risk ? risk_color : item.color }))
        };
      })
      .filter(Boolean)
      .flatMap((chart, _, arr) => {
        // 把速效氮/磷/钾三张独立卡片聚合成一张三线图，统一坐标重算。
        const NPK_CODES = ['NITROGEN', 'PHOSPHORUS', 'POTASSIUM'];
        const npkReady = NPK_CODES.every((code) => arr.some((item) => item.code === code && !item.unavailable));
        if (!npkReady) return [chart];
        // 氮触发聚合，磷/钾被吞入聚合卡片，其余 6 个原样保留。
        if (chart.code !== 'NITROGEN') return NPK_CODES.includes(chart.code) ? [] : [chart];
        const npkCharts = NPK_CODES.map((code) => arr.find((item) => item.code === code));
        const npkSpec = { code: 'NPK', label: '氮磷钾肥力', unit: 'mg/kg', min: 0, max: 400, precision: 0, multi: true };
        const labels = ['速效氮', '速效磷', '速效钾'];
        const colors = ['var(--g-success)', 'var(--g-primary)', 'var(--g-warning)'];
        const series = npkCharts.map((c, index) => {
          const samples = c.series[0]?.samples || [];
          return {
            label: labels[index],
            color: colors[index],
            values: samples.map((sample) => sample.value),
            samples,
            points: chart_points_in_window(samples, npkSpec.min, npkSpec.max)
          };
        });
        const base = npkCharts[0];
        return [{
          ...npkSpec,
          current_label: npkCharts.map((c) => c.current_label).join(' / '),
          target: '—',
          targetBand: null,
          stageLabel: base.stageLabel,
          quality: base.quality,
          status: 'NORMAL',
          is_risk: false,
          risk_label: '',
          range_title: base.range_title,
          simHours: base.simHours,
          timeScale: base.timeScale,
          windowStart: base.windowStart,
          windowEnd: base.windowEnd,
          labels: base.labels,
          sample_labels: base.sample_labels,
          samples: series[0]?.samples || [],
          grid: [
            { y: 10, label: format_chart_axis_value(npkSpec.max, npkSpec.precision) },
            { y: 62, label: format_chart_axis_value((npkSpec.max + npkSpec.min) / 2, npkSpec.precision) },
            { y: 114, label: format_chart_axis_value(npkSpec.min, npkSpec.precision) }
          ],
          is_multi: true,
          history_source: base.history_source,
          history_available: base.history_available,
          series
        }];
      }));

    // 农户只读查看管理员维护的地块模拟策略和风险预测。
    const plot_simulation_forecast = ref(null);
    const plot_simulation_loading = ref(false);
    const plot_simulation_error = ref('');
    const plot_simulation_history = ref([]);
    const plot_simulation_metric = ref('SOIL_MOISTURE');
    const plot_simulation_metric_loading = ref(false);
    const plot_simulation_chart_el = ref(null);
    const plot_simulation_chart_instance = ref(null);
    const plot_simulation_form = ref({ scenario: 'NORMAL', parameters: { ...PLOT_SIMULATION_DEFAULTS.NORMAL } });
    const plot_simulation_evaluating = ref(false);
    const plot_simulation_preview_dirty = ref(false);
    // 双轨对比：同一冻结快照与随机种子下的“执行处方 / 不干预”两条只读预测。
    const plot_simulation_dual_track = ref(null);
    const plot_simulation_dual_loading = ref(false);
    const show_dual_track = ref(true);
    let plot_simulation_dual_request_version = 0;
    const plot_simulation_parameter_meta = Object.freeze({
      volatility: { label: '波动强度', unit: '倍', min: .2, max: 3, step: .05, help: '控制环境扰动幅度' },
      timeScale: { label: '时间倍率', unit: '倍', min: 1, max: 288, step: 1, help: '墙上时钟与模拟时间的比例' },
      temperatureBias: { label: '温度偏移', unit: '°C', min: -15, max: 15, step: .5, help: '相对标准环境的偏移' },
      humidityBias: { label: '湿度偏移', unit: '%RH', min: -40, max: 40, step: 1, help: '相对标准环境的偏移' },
      rainfallRate: { label: '降雨强度', unit: 'mm/h', min: 0, max: 120, step: 1, help: '场景平均降雨强度' },
      soilMoistureTrendPerHour: { label: '土壤变化速率', unit: '%/h', min: -12, max: 12, step: .1, help: '每模拟小时的自然失水/增湿' },
      driftRatePerHour: { label: '漂移速率', unit: '%/h', min: 0, max: 10, step: .1, help: '仅作用于传感器读数' },
      offlineRatio: { label: '离线比例', unit: '%', min: 0, max: 1, step: .01, help: '设备周期内断连比例' },
      riskThreshold: { label: '干旱阈值', unit: '%', min: 1, max: 99, step: .5, help: '低于此值触发缺水风险' },
      waterloggingThreshold: { label: '积水阈值', unit: '%', min: 40, max: 99, step: .5, help: '高于此值触发积水风险' },
      forecastHours: { label: '预测时长', unit: '小时', min: 1, max: 12, step: 1, help: '未来趋势的时间范围' }
    });
    const plot_simulation_fields = computed(() => {
      const scenario = String(plot_simulation_form.value.scenario || 'NORMAL').toUpperCase();
      const extra = scenario === 'DROUGHT'
        ? ['temperatureBias', 'humidityBias', 'soilMoistureTrendPerHour']
        : scenario === 'HEAVY_RAIN'
          ? ['rainfallRate', 'temperatureBias', 'humidityBias', 'soilMoistureTrendPerHour', 'waterloggingThreshold']
          : scenario === 'SENSOR_DRIFT'
            ? ['driftRatePerHour', 'soilMoistureTrendPerHour']
            : scenario === 'DEVICE_OFFLINE' ? ['offlineRatio'] : ['temperatureBias', 'humidityBias', 'soilMoistureTrendPerHour'];
      return [...new Set(['volatility', 'timeScale', 'riskThreshold', 'forecastHours', ...extra])]
        .map((key) => ({ key, ...plot_simulation_parameter_meta[key] }));
    });
    const plot_simulation_options = computed(() => {
      const catalog = plot_simulation.value?.scenarioCatalog;
      return Array.isArray(catalog) && catalog.length ? catalog : PLOT_SIMULATION_SCENARIOS;
    });
    const plot_simulation_scenario = computed(() => {
      const code = String(plot_simulation_form.value?.scenario || plot_simulation.value?.scenario || 'NORMAL').toUpperCase();
      return plot_simulation_options.value.find((item) => item.code === code) || PLOT_SIMULATION_SCENARIOS[0];
    });

    const plot_simulation_device_label = computed(() => plot_simulation.value?.simulatorDevice?.label || '模拟数据运行中');
    const plot_simulation_device_status = computed(() => String(plot_simulation.value?.simulatorDevice?.status || '').toUpperCase());
    const plot_simulation_metric_options = computed(() => SIMULATION_METRIC_OPTIONS);
    const plot_simulation_selected_metric = computed(() => simulation_metric_definition(plot_simulation_metric.value));
    const plot_simulation_metric_label = computed(() => plot_simulation_selected_metric.value.label);
    const plot_simulation_chart_available = computed(() => {
      const forecast = plot_simulation_forecast.value;
      const hasHistory = Array.isArray(plot_simulation_history.value) && plot_simulation_history.value.length > 0;
      const hasForecast = forecast && String(forecast.status || '').toUpperCase() === 'AVAILABLE'
        && Array.isArray(forecast.curve) && forecast.curve.length > 0;
      return hasHistory || hasForecast;
    });
    const plot_simulation_preview_message = computed(() => {
      const scenario = plot_simulation_scenario.value;
      const forecast = plot_simulation_forecast.value;
      if (plot_simulation_evaluating.value) return '正在使用当前参数刷新只读预测曲线…';
      if (plot_simulation_preview_dirty.value) return '参数尚未保存，曲线来自只读后端试算；农户调整不会修改管理员策略或主状态。';
      if (forecast && String(forecast.status || '').toUpperCase() !== 'AVAILABLE') {
        const reason = forecast.reason || '当前样本或设备状态未满足预测条件';
        return `${scenario.label}：预测暂不可用（${reason}），历史实测仍可查看。`;
      }
      return `${scenario.label}已绑定到 ${selected_plot.value?.name || selected_plot.value?.plotId || ''}，历史实测与策略预测只读展示。`;
    });

    const plot_simulation_dual_available = computed(() => {
      const track = plot_simulation_dual_track.value;
      const execute = track?.branches?.EXECUTE?.points;
      const noAction = track?.branches?.NO_ACTION?.points;
      return Array.isArray(execute) && execute.length > 0
        && Array.isArray(noAction) && noAction.length > 0
        && String(track.status || '').toUpperCase() === 'AVAILABLE';
    });
    const plot_simulation_dual_summary = computed(() => {
      if (!plot_simulation_dual_available.value) return null;
      const track = plot_simulation_dual_track.value;
      const formatTime = (minutes) => Number.isFinite(Number(minutes)) && Number(minutes) > 0
        ? `约 ${Math.round(Number(minutes))} 分钟后`
        : `${track?.parameters?.forecastHours || 4} 小时内未触达`;
      const execute = track.branches.EXECUTE || {};
      const noAction = track.branches.NO_ACTION || {};
      const boundary = Number(track.stressBoundary);
      const isStorm = String(track.scenario || '').toUpperCase() === 'HEAVY_RAIN';
      const boundaryLabel = Number.isFinite(boundary) ? `${isStorm ? '积水' : '干旱'}阈值 ${boundary}%` : '风险边界';
      const horizonHours = Number(track?.parameters?.forecastHours || 4);
      const intervention = track.intervention;
      const divergence = track.divergence;
      const parts = [
        `措施后：${formatTime(execute.timeToRiskMinutes)}${isStorm ? '高于' : '低于'}${boundaryLabel}`,
        `不干预：${formatTime(noAction.timeToRiskMinutes)}${isStorm ? '高于' : '低于'}${boundaryLabel}`
      ];
      if (intervention?.measure === 'IRRIGATION' && intervention.status === 'PLANNED') {
        parts.push(`预计 ${Math.round(Number(intervention.triggerMinute))} 分钟后补水 ${intervention.waterLitre} 升（${intervention.durationMinutes} 分钟），湿度回升至 ${intervention.moistureAfterIrrigation}% 后继续自然回落`);
        if (intervention.reservoirSufficient === false) {
          parts.push(`水箱仅剩 ${intervention.reservoirLevelPercent}%（约 ${intervention.reservoirAvailableLitres} 升），只能按余量补水`);
        }
      } else if (intervention?.status === 'NO_RISK_IN_WINDOW') {
        parts.push('预测窗口内不会跌破干旱预警线，无需灌溉，双轨重合');
      } else if (intervention?.measure === 'DRAINAGE') {
        parts.push('措施为启动排水：削峰并加快退水');
      }
      const deltaAtHorizon = Number(divergence?.moistureDeltaAtHorizon);
      if (Number.isFinite(deltaAtHorizon) && deltaAtHorizon > 0) {
        parts.push(`${horizonHours} 小时时点措施后比不干预高约 ${deltaAtHorizon.toFixed(1)} 个百分点`);
      }
      if (divergence?.riskAvoidedWithinWindow) {
        parts.push(`措施可把风险推迟到 ${horizonHours} 小时窗口之外`);
      } else if (Number.isFinite(Number(divergence?.riskDelayMinutes)) && Number(divergence.riskDelayMinutes) > 0) {
        parts.push(`风险触发推迟约 ${Math.round(Number(divergence.riskDelayMinutes))} 分钟`);
      }
      return `${parts.join('；')}。双轨基于同一冻结快照与随机种子，只读对比，不写回主状态。`;
    });

    const load_plot_simulation_dual_track = async () => {
      const plotId = selected_plot.value?.plotId;
      if (!plotId) {
        plot_simulation_dual_track.value = null;
        return;
      }
      const requestId = ++plot_simulation_dual_request_version;
      plot_simulation_dual_loading.value = true;
      try {
        const result = await api.compareScenario({
          plotId,
          scenario: plot_simulation_form.value.scenario,
          parameters: { ...(plot_simulation_form.value.parameters || {}) }
        });
        if (requestId !== plot_simulation_dual_request_version) return;
        plot_simulation_dual_track.value = result || { status: 'UNAVAILABLE', reason: '双轨对比响应为空' };
      } catch (error) {
        if (requestId !== plot_simulation_dual_request_version) return;
        plot_simulation_dual_track.value = { status: 'UNAVAILABLE', reason: error?.message || '双轨对比暂不可用' };
      } finally {
        if (requestId === plot_simulation_dual_request_version) {
          plot_simulation_dual_loading.value = false;
          void render_plot_simulation_chart();
        }
      }
    };

    const toggle_dual_track = () => {
      show_dual_track.value = !show_dual_track.value;
      void render_plot_simulation_chart();
    };

    const render_plot_simulation_chart = async () => {
      await nextTick();
      const chartLibrary = window.echarts;
      if (!plot_simulation_chart_el.value || !chartLibrary) return;
      if (plot_simulation_chart_instance.value?.getDom?.() !== plot_simulation_chart_el.value) {
        plot_simulation_chart_instance.value?.dispose();
        plot_simulation_chart_instance.value = null;
      }
      if (!plot_simulation_chart_instance.value) plot_simulation_chart_instance.value = chartLibrary.init(plot_simulation_chart_el.value);
      const definition = plot_simulation_selected_metric.value;
      const historicalPoints = simulation_normalized_telemetry(plot_simulation_history.value);
      const timeScale = Math.max(1, Number(plot_simulation_form.value?.parameters?.timeScale || DEFAULT_SIMULATION_TIME_SCALE));
      const now = Date.now();
      const toSimulated = (wall) => now - (now - wall) * timeScale;
      const historicalAll = historicalPoints.map((item) => [toSimulated(simulation_telemetry_timestamp(item)), item.value]);
      const fallback = (() => {
        const configured = simulation_finite_number(selected_plot.value?.metrics?.[definition.code]?.value);
        return Number.isFinite(configured) ? configured : definition.defaultValue;
      })();
      const anchorPoint = historicalPoints.at(-1);
      const anchorValue = anchorPoint?.value ?? fallback;
      const anchorTimestamp = anchorPoint ? simulation_telemetry_timestamp(anchorPoint) : NaN;
      const forecastAvailable = String(plot_simulation_forecast.value?.status || '').toUpperCase() === 'AVAILABLE'
        && Array.isArray(plot_simulation_forecast.value?.curve) && plot_simulation_forecast.value.curve.length > 0;
      const forecastSource = forecastAvailable ? plot_simulation_forecast.value.curve : [];
      const forecastPoints = simulation_align_forecast(forecastSource, anchorValue, definition);
      const forecastStart = Number.isFinite(anchorTimestamp) ? toSimulated(anchorTimestamp) : now;
      const predicted = forecastPoints.map((item) => [forecastStart + item.minute * 60000, item.expected]);
      const lower = forecastPoints.map((item) => [forecastStart + item.minute * 60000, item.lower]);
      const upper = forecastPoints.map((item) => [forecastStart + item.minute * 60000, item.upper]);
      // 双轨曲线：与主预测共用同一时间锚点，展示“措施后 / 不干预”对比。
      const dualUsable = definition.code === 'SOIL_MOISTURE'
        && show_dual_track.value
        && plot_simulation_dual_available.value;
      const dualTrack = dualUsable ? plot_simulation_dual_track.value : null;
      const dualIntervention = dualTrack?.intervention;
      const dualIsStorm = String(dualTrack?.scenario || '').toUpperCase() === 'HEAVY_RAIN';
      const dualBoundary = Number(dualTrack?.stressBoundary);
      // 双轨标注：风险边界横线 + 灌溉触发竖线，让“何时补水、跌破哪条线”在图上可见。
      const dualMarkLine = dualTrack
        ? {
            silent: true,
            symbol: 'none',
            data: [
              ...(Number.isFinite(dualBoundary)
                ? [{
                    yAxis: dualBoundary,
                    lineStyle: { color: '#f59e0b', type: 'dotted', width: 1 },
                    label: { formatter: `${dualIsStorm ? '积水' : '干旱'}阈值 ${dualBoundary}%`, color: '#f59e0b', fontSize: 10, position: 'insideEndTop' }
                  }]
                : []),
              ...(dualIntervention?.measure === 'IRRIGATION' && dualIntervention.status === 'PLANNED'
                ? [{
                    xAxis: forecastStart + Number(dualIntervention.triggerMinute) * 60000,
                    lineStyle: { color: '#3fb950', type: 'dashed', width: 1 },
                    label: { formatter: `补水 ${dualIntervention.waterLitre} L`, color: '#3fb950', fontSize: 10, position: 'insideEndBottom' }
                  }]
                : [])
            ]
          }
        : null;
      const toDualSeries = (points) => points.map((item) => [forecastStart + Number(item.minute) * 60000, Number(item.value)]);
      const executeSeries = dualTrack ? toDualSeries(dualTrack.branches.EXECUTE.points) : [];
      const noActionSeries = dualTrack ? toDualSeries(dualTrack.branches.NO_ACTION.points) : [];
      // Keep one forecast-window of history in view. A long-running simulator
      // can otherwise stretch the time axis so far into the past that the
      // forecast and dual-track sections collapse into a few pixels.
      const forecastHorizonMinutes = Math.max(
        60,
        ...forecastPoints.map((item) => Number(item.minute) || 0),
        ...(dualTrack ? [
          ...dualTrack.branches.EXECUTE.points.map((item) => Number(item.minute) || 0),
          ...dualTrack.branches.NO_ACTION.points.map((item) => Number(item.minute) || 0)
        ] : [])
      );
      const historyWindowStart = forecastStart - forecastHorizonMinutes * 60000;
      const historical = historicalAll.filter(([timestamp]) => timestamp >= historyWindowStart && timestamp <= forecastStart);
      if (!historical.length && Number.isFinite(anchorValue)) historical.push([forecastStart, anchorValue]);
      const axis = simulation_chart_axis_range(definition, [
        ...historical.map((item) => item[1]),
        ...forecastPoints.flatMap((item) => [item.expected, item.lower, item.upper]),
        ...(dualTrack ? [...executeSeries, ...noActionSeries].map((item) => item[1]) : [])
      ]);
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = dark ? '#e8eaed' : '#3c4043';
      plot_simulation_chart_instance.value.setOption({
        backgroundColor: 'transparent', animation: false,
        tooltip: { trigger: 'axis', confine: true, formatter: (items) => {
          const list = Array.isArray(items) ? items : [items];
          const axisValue = simulation_finite_number(list[0]?.axisValue);
          const time = Number.isFinite(axisValue) ? `模拟 ${new Date(axisValue).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}` : '—';
          return `<strong>${time}</strong><br>${list.filter((item) => item.value?.[1] != null).map((item) => `${item.marker}${item.seriesName}：${simulation_format_curve_value(item.value[1], definition)} ${definition.unit}`).join('<br>')}`;
        }},
        legend: {
          data: dualTrack
            ? ['历史实测', '策略预测', '措施后预测', '不干预预测']
            : ['历史实测', '策略预测', '预测下界', '预测上界'],
          textStyle: { color: textColor, fontSize: 11 }
        },
        grid: { left: 42, right: 18, top: 32, bottom: 30 },
        xAxis: { type: 'time', axisLabel: { color: textColor, fontSize: 10 }, axisPointer: { snap: true } },
        yAxis: {
          type: 'value', min: axis.min, max: axis.max, name: definition.unit,
          nameTextStyle: { color: textColor }, axisLabel: { color: textColor, fontSize: 10, formatter: (value) => simulation_format_curve_value(value, definition) }
        },
        series: [
          { name: '历史实测', type: 'line', data: historical, showSymbol: false, connectNulls: false, smooth: true, lineStyle: { color: '#1e8e3e', width: 2 } },
          { name: '策略预测', type: 'line', data: predicted, showSymbol: false, connectNulls: true, smooth: true, lineStyle: { color: '#2563eb', width: 2, type: 'dashed', opacity: plot_simulation_evaluating.value ? .42 : 1 } },
          ...(dualTrack ? [
            { name: '措施后预测', type: 'line', data: executeSeries, showSymbol: false, connectNulls: true, smooth: true, lineStyle: { color: '#3fb950', width: 2, opacity: plot_simulation_dual_loading.value ? .45 : 1 }, ...(dualMarkLine ? { markLine: dualMarkLine } : {}) },
            { name: '不干预预测', type: 'line', data: noActionSeries, showSymbol: false, connectNulls: true, smooth: true, lineStyle: { color: '#f85149', width: 2, type: 'dashed', opacity: plot_simulation_dual_loading.value ? .45 : 1 } }
          ] : [
            { name: '预测下界', type: 'line', data: lower, showSymbol: false, connectNulls: true, smooth: true, lineStyle: { color: '#93c5fd', width: 1, type: 'dotted', opacity: plot_simulation_evaluating.value ? .32 : 1 } },
            { name: '预测上界', type: 'line', data: upper, showSymbol: false, connectNulls: true, smooth: true, lineStyle: { color: '#93c5fd', width: 1, type: 'dotted', opacity: plot_simulation_evaluating.value ? .32 : 1 } }
          ])
        ]
      }, true);
      plot_simulation_chart_instance.value.resize();
    };

    let plot_simulation_request_version = 0;
    let plot_simulation_metric_request_version = 0;
    let plot_simulation_preview_request_version = 0;
    let plot_simulation_preview_timer = null;
    const load_plot_simulation = async (plotId = selected_plot.value?.plotId) => {
      if (plot_simulation_preview_timer) window.clearTimeout(plot_simulation_preview_timer);
      plot_simulation_preview_timer = null;
      plot_simulation_preview_request_version += 1;
      plot_simulation_preview_dirty.value = false;
      plot_simulation_evaluating.value = false;
      const requestVersion = ++plot_simulation_request_version;
      if (!plotId) {
        plot_simulation.value = null;
        plot_simulation_forecast.value = null;
        plot_simulation_history.value = [];
        plot_simulation_error.value = '没有可查看的地块';
        return;
      }
      plot_simulation_loading.value = true;
      plot_simulation_error.value = '';
      try {
        const metric = plot_simulation_metric.value;
        const [configResult, historyResult, forecastResult] = await Promise.allSettled([
          api.getPlotSimulation(plotId),
          api.getTelemetry(plotId, metric, 120),
          api.getRiskForecast(plotId, metric)
        ]);
        if (requestVersion !== plot_simulation_request_version) return;
        plot_simulation.value = configResult.status === 'fulfilled' ? configResult.value : null;
        if (configResult.status === 'fulfilled') {
          plot_simulation_form.value = {
            scenario: String(configResult.value?.scenario || 'NORMAL').toUpperCase(),
            parameters: { ...(configResult.value?.parameters || PLOT_SIMULATION_DEFAULTS.NORMAL) }
          };
        }
        plot_simulation_preview_dirty.value = false;
        plot_simulation_evaluating.value = false;
        plot_simulation_history.value = historyResult.status === 'fulfilled' ? (historyResult.value || []) : [];
        plot_simulation_forecast.value = forecastResult.status === 'fulfilled' ? forecastResult.value : null;
        const errors = [configResult, forecastResult].filter((result) => result.status === 'rejected').map((result) => result.reason?.message || '地块模拟策略读取失败');
        if (String(plot_simulation_forecast.value?.status || '').toUpperCase() === 'UNAVAILABLE') errors.push(plot_simulation_forecast.value.reason || '样本、数据质量或设备状态不足');
        plot_simulation_error.value = [...new Set(errors)].join('；');
        await render_plot_simulation_chart();
        void load_plot_simulation_dual_track();
      } catch (error) {
        if (requestVersion !== plot_simulation_request_version) return;
        plot_simulation_error.value = error?.message || '地块预测加载失败';
      } finally {
        if (requestVersion === plot_simulation_request_version) plot_simulation_loading.value = false;
      }
    };

    const evaluate_plot_simulation_preview = async (requestId) => {
      const plotId = selected_plot.value?.plotId;
      if (!plotId) return;
      try {
        const evaluated = await api.evaluateRiskForecast({
          plotId,
          metric: plot_simulation_metric.value,
          scenario: plot_simulation_form.value.scenario,
          parameters: { ...(plot_simulation_form.value.parameters || {}) },
          requestVersion: requestId
        });
        if (requestId !== plot_simulation_preview_request_version) return;
        plot_simulation_forecast.value = evaluated || { status: 'UNAVAILABLE', reason: '预测响应为空' };
      } catch (error) {
        if (requestId !== plot_simulation_preview_request_version) return;
        plot_simulation_forecast.value = { status: 'UNAVAILABLE', reason: error?.message || '风险预测暂不可用' };
      } finally {
        if (requestId === plot_simulation_preview_request_version) {
          plot_simulation_evaluating.value = false;
          await render_plot_simulation_chart();
          void load_plot_simulation_dual_track();
        }
      }
    };

    const schedule_plot_simulation_preview = (delay = 300) => {
      if (plot_simulation_preview_timer) window.clearTimeout(plot_simulation_preview_timer);
      const requestId = ++plot_simulation_preview_request_version;
      plot_simulation_preview_dirty.value = true;
      plot_simulation_evaluating.value = true;
      // Keep the current curve visible while the next preview is in flight.
      void render_plot_simulation_chart();
      plot_simulation_preview_timer = window.setTimeout(() => {
        plot_simulation_preview_timer = null;
        void evaluate_plot_simulation_preview(requestId);
      }, delay);
    };

    const select_plot_simulation_scenario = (code) => {
      const normalized = String(code || 'NORMAL').toUpperCase();
      const scenario = plot_simulation_options.value.find((item) => item.code === normalized) || PLOT_SIMULATION_SCENARIOS[0];
      plot_simulation_form.value = {
        scenario: scenario.code,
        parameters: { ...(PLOT_SIMULATION_DEFAULTS[scenario.code] || PLOT_SIMULATION_DEFAULTS.NORMAL) }
      };
      schedule_plot_simulation_preview();
    };

    const reset_plot_simulation_preview = () => {
      if (!plot_simulation.value) return;
      plot_simulation_form.value = {
        scenario: String(plot_simulation.value.scenario || 'NORMAL').toUpperCase(),
        parameters: { ...(plot_simulation.value.parameters || PLOT_SIMULATION_DEFAULTS.NORMAL) }
      };
      if (plot_simulation_preview_timer) window.clearTimeout(plot_simulation_preview_timer);
      plot_simulation_preview_timer = null;
      plot_simulation_preview_request_version += 1;
      plot_simulation_preview_dirty.value = false;
      plot_simulation_evaluating.value = false;
      void load_plot_simulation(selected_plot.value?.plotId);
    };

    const load_plot_simulation_metric = async (metric = plot_simulation_metric.value, {
      preserveOnError = false,
      silent = false,
      historyOnly = false
    } = {}) => {
      const normalized = simulation_metric_definition(metric).code;
      const requestId = ++plot_simulation_metric_request_version;
      if (!silent) plot_simulation_metric_loading.value = true;
      try {
        if (historyOnly) {
          const historyResult = await Promise.allSettled([api.getTelemetry(selected_plot.value?.plotId, normalized, 120)]);
          if (requestId !== plot_simulation_metric_request_version) return;
          if (historyResult[0].status === 'fulfilled') plot_simulation_history.value = historyResult[0].value || [];
          else if (!preserveOnError) plot_simulation_history.value = [];
        } else {
          const [historyResult, forecastResult] = await Promise.allSettled([
            api.getTelemetry(selected_plot.value?.plotId, normalized, 120),
            api.getRiskForecast(selected_plot.value?.plotId, normalized)
          ]);
          if (requestId !== plot_simulation_metric_request_version) return;
          if (historyResult.status === 'fulfilled') plot_simulation_history.value = historyResult.value || [];
          else if (!preserveOnError) plot_simulation_history.value = [];
          if (forecastResult.status === 'fulfilled') plot_simulation_forecast.value = forecastResult.value || { status: 'UNAVAILABLE', reason: '预测响应为空' };
          else if (!preserveOnError) plot_simulation_forecast.value = { status: 'UNAVAILABLE', reason: forecastResult.reason?.message || '预测服务暂不可用' };
        }
        await nextTick();
        render_plot_simulation_chart();
      } finally {
        if (!silent && requestId === plot_simulation_metric_request_version) plot_simulation_metric_loading.value = false;
      }
    };

    const select_plot_simulation_metric = (eventOrCode) => {
      const requested = typeof eventOrCode === 'string' ? eventOrCode : eventOrCode?.target?.value;
      const normalized = simulation_metric_definition(requested).code;
      if (normalized === plot_simulation_metric.value && !plot_simulation_metric_loading.value) return;
      plot_simulation_metric.value = normalized;
      if (plot_simulation_preview_dirty.value) {
        // Keep history current while the what-if forecast continues to use local parameters.
        load_plot_simulation_metric(normalized, { preserveOnError: false, historyOnly: true });
        schedule_plot_simulation_preview();
        return;
      }
      load_plot_simulation_metric(normalized, { preserveOnError: false });
    };

    let plot_simulation_live_timer = null;
    let plot_simulation_live_in_flight = false;
    let plot_simulation_live_queued = false;
    let plot_simulation_live_kick_timer = null;
    let plot_simulation_live_visibility_handler = null;
    const plot_simulation_is_live = () => is_formal_session && api.isLive;
    const refresh_plot_simulation_live = async () => {
      if (!plot_simulation_is_live() || document.hidden || plot_simulation_loading.value || plot_simulation_metric_loading.value || plot_simulation_evaluating.value) return;
      if (plot_simulation_live_in_flight) {
        plot_simulation_live_queued = true;
        return;
      }
      plot_simulation_live_in_flight = true;
      try {
        // Background polls must not unmount the chart; keep the current curve and refresh quietly.
        if (plot_simulation_preview_dirty.value) {
          await load_plot_simulation_metric(plot_simulation_metric.value, { preserveOnError: true, silent: true, historyOnly: true });
        } else {
          await load_plot_simulation_metric(plot_simulation_metric.value, { preserveOnError: true, silent: true });
        }
      } finally {
        plot_simulation_live_in_flight = false;
        if (plot_simulation_live_queued && !document.hidden) {
          plot_simulation_live_queued = false;
          if (!plot_simulation_live_kick_timer) {
            plot_simulation_live_kick_timer = window.setTimeout(() => {
              plot_simulation_live_kick_timer = null;
              refresh_plot_simulation_live();
            }, 120);
          }
        }
      }
    };
    const stop_plot_simulation_live = () => {
      if (plot_simulation_live_timer) window.clearInterval(plot_simulation_live_timer);
      plot_simulation_live_timer = null;
      if (plot_simulation_live_kick_timer) window.clearTimeout(plot_simulation_live_kick_timer);
      plot_simulation_live_kick_timer = null;
      if (plot_simulation_live_visibility_handler) document.removeEventListener('visibilitychange', plot_simulation_live_visibility_handler);
      plot_simulation_live_visibility_handler = null;
      plot_simulation_live_queued = false;
    };
    const start_plot_simulation_live = () => {
      stop_plot_simulation_live();
      if (!plot_simulation_is_live()) return;
      plot_simulation_live_timer = window.setInterval(refresh_plot_simulation_live, 4000);
      plot_simulation_live_visibility_handler = () => { if (!document.hidden) refresh_plot_simulation_live(); };
      document.addEventListener('visibilitychange', plot_simulation_live_visibility_handler);
    };

    // The farmer risk page mirrors the administrator plot-detail forecast.
    // Only the plot selector remains local; strategy and forecast data come
    // from the same read-only resources as the plot detail view.
    const risk_tool_plot_id = ref(plots.value[0]?.plotId || '');
    const risk_tool_plot = computed(() => plots.value.find((plot) => plot.plotId === risk_tool_plot_id.value) || plots.value[0] || null);
    const select_risk_tool_plot = (plotId) => {
      const plot = plots.value.find((item) => item.plotId === plotId);
      if (!plot) return;
      risk_tool_plot_id.value = plot.plotId;
      selected_plot.value = plot;
      plot_stage_preview.value = plot.stageCode || crop_stage_for(plot)?.code || '';
    };

    const advice_selected_plot = ref(plots.value[0] || null);
    const advice_plot = computed(() => advice_selected_plot.value || plots.value[0] || null);
    const select_advice_plot = (plot_id) => {
      const plot = plots.value.find((p) => p.plotId === plot_id);
      if (plot) {
        advice_selected_plot.value = plot;
        // 处方随地块切换重新读取，避免确认弹窗沿用上一块地的数据。
        load_irrigation_plan(plot.plotId, { silent: true });
      }
    };
    const operation_subsystem = ref('irrigation');
    const operation_subsystem_options = Object.freeze([
      { id: 'irrigation', label: '灌溉系统', icon: 'water_drop', description: '土壤湿度、灌水预警与补水执行' },
      { id: 'lighting', label: '光照系统', icon: 'light_mode', description: '光照强度、光照预警与补光执行' }
    ]);
    const select_operation_subsystem = (id) => {
      const next = operation_subsystem_options.find((item) => item.id === id);
      if (next) operation_subsystem.value = next.id;
    };
    const advice_soil_chart = computed(() => metric_chart(advice_plot.value, 'SOIL_MOISTURE', '1d'));
    const lighting_range = ref('1d');
    const lighting_range_options = CHART_RANGE_OPTIONS;
    const advice_light_chart = computed(() => {
      const plot = advice_plot.value;
      const chart = metric_chart(plot, 'LIGHT', lighting_range.value);
      if (!chart || !plot) return null;
      const band = selected_crop_band.value;
      return {
        ...chart,
        plotName: plot.name || plot.plotId,
        cropLabel: band?.cropLabel || plot.cropName,
        stageLabel: band?.stageLabel || chart.stageLabel,
        currentLight: plot.metrics?.LIGHT?.value,
        currentTarget: Number.isFinite(Number(band?.lightLow)) && Number.isFinite(Number(band?.lightHigh))
          ? `${Math.round(band.lightLow).toLocaleString()}~${Math.round(band.lightHigh).toLocaleString()} lux`
          : (plot.metrics?.LIGHT?.target || '—')
      };
    });

    // 操作系统页：按地块的风险小卡片（黄=偏离目标，红=低于告警阈值）
    const risk_plot_cards = computed(() => plots.value.map((plot) => {
      const bandStatus = resolve_moisture_band_status(plot);
      const lightStatus = resolve_light_band_status(plot);
      const lightRange = stage_target_band(plot, 'LIGHT');
      return {
        plotId: plot.plotId,
        name: plot.name,
        cropName: plot.cropName,
        stageLabel: plot.stageLabel,
        riskLevel: plot.riskLevel,
        bandStatus,
        bandLabel: BAND_STATUS_LABELS[bandStatus] || '正常',
        isWarn: bandStatus === 'WARN',
        isAlert: bandStatus === 'ALERT',
        moisture: plot.metrics?.SOIL_MOISTURE?.value,
        moistureTarget: plot.metrics?.SOIL_MOISTURE?.target,
        moistureStatus: bandStatus,
        healthScore: health_score(plot),
        lightStatus,
        lightLabel: LIGHT_STATUS_LABELS[lightStatus] || '光照正常',
        lightValue: plot.metrics?.LIGHT?.value,
        lightTarget: lightRange ? `${Math.round(lightRange[0]).toLocaleString()}~${Math.round(lightRange[1]).toLocaleString()} lux` : (plot.metrics?.LIGHT?.target || '—'),
        selected: advice_selected_plot.value?.plotId === plot.plotId
      };
    }));

    // 操作系统页：选中地块的目标值带（Crop Pack 阶段）与告警阈值（规则）
    const moisture_range = ref('1d');
    const moisture_range_options = CHART_RANGE_OPTIONS;
    const irrigation_plan = ref(null);
    const irrigation_readiness_detail = ref(null);
    const irrigation_plan_loading = ref(false);
    const irrigation_plan_error = ref('');
    let irrigation_plan_request_version = 0;
    // 农户只读查看农场水库/蓄水池水量（今日配额、已用、余额）。
    const water_resource_profile = ref(null);
    const water_resource_loading = ref(false);
    const water_resource_error = ref('');
    const water_resource_summary = computed(() => {
      const profile = water_resource_profile.value;
      if (!profile) return null;
      const quota = Number(profile.dailyQuotaLitres ?? 0);
      const used = Number(profile.actualUsedLitres ?? profile.balance?.actualUsedLitres ?? 0);
      const reserved = Number(profile.reservedLitres ?? profile.balance?.reservedLitres ?? 0);
      const remaining = Number(profile.remainingLitres ?? profile.balance?.remainingLitres ?? Math.max(0, quota - used - reserved));
      const percent = quota > 0 ? Math.round((remaining / quota) * 100) : 0;
      return { quota, used, reserved, remaining, percent };
    });
    const load_water_resource_profile = async () => {
      const farmId = farm.value?.farmId || session_user?.farmIds?.find((id) => id !== '*') || 'farm-demo';
      water_resource_loading.value = true;
      water_resource_error.value = '';
      try {
        water_resource_profile.value = null;
        water_resource_profile.value = await api.getWaterResourceProfile(farmId);
      } catch (error) {
        water_resource_error.value = error?.message || '水库水量读取失败';
      } finally {
        water_resource_loading.value = false;
      }
    };
    const selected_crop_band = computed(() => {
      const plot = advice_selected_plot.value;
      if (!plot) return null;
      const pack = crop_pack_catalog.find((p) => p.cropCode === plot.cropCode);
      let low = 0;
      let high = 0;
      let cropLabel = plot.cropName;
      let stageLabel = plot.stageLabel;
      let alertThreshold = null;
      let lightLow = null;
      let lightHigh = null;
      if (pack) {
        const stage = pack.stages?.find((s) => s.code === plot.stageCode) || pack.stages?.[pack.stages.length - 1];
        low = Number(stage?.target?.soilMoistureLow ?? 0);
        high = Number(stage?.target?.soilMoistureHigh ?? 0);
        cropLabel = pack.identity?.name || plot.cropName;
        stageLabel = stage?.label || plot.stageLabel;
        alertThreshold = resolve_water_deficit_threshold(pack, stage);
        lightLow = Number(stage?.target?.lightLow);
        lightHigh = Number(stage?.target?.lightHigh);
      } else {
        const targetText = plot.metrics?.SOIL_MOISTURE?.target || '';
        const nums = String(targetText).match(/(\d+(?:\.\d+)?)/g);
        if (nums && nums.length >= 2) {
          low = Number(nums[0]);
          high = Number(nums[1]);
          alertThreshold = low;
        }
      }
      if (!low && !high) return null;
      return {
        cropCode: plot.cropCode,
        cropLabel,
        stageLabel,
        low,
        high,
        targetText: `${low}~${high}%`,
        alertThreshold,
        lightLow: Number.isFinite(lightLow) ? lightLow : null,
        lightHigh: Number.isFinite(lightHigh) ? lightHigh : null
      };
    });
    const advice_light_status = computed(() => {
      const plot = advice_plot.value;
      const status = resolve_light_band_status(plot);
      const metric = plot?.metrics?.LIGHT;
      const range = stage_target_band(plot, 'LIGHT');
      return {
        status,
        label: LIGHT_STATUS_LABELS[status] || '光照正常',
        value: Number.isFinite(Number(metric?.value)) ? Number(metric.value) : null,
        low: range?.[0] ?? null,
        high: range?.[1] ?? null,
        deviceOffline: String(plot?.deviceStatus || '').toUpperCase() === 'OFFLINE',
        needsAttention: status !== 'NORMAL'
      };
    });
    const light_operation_available = computed(() => advice_light_status.value.status === 'ALERT_LOW' && Boolean(advice_plot.value?.plotId));
    const light_operation_label = computed(() => advice_light_status.value.deviceOffline ? '虚拟补光（离线演示）' : '执行补光');
    const show_virtual_lighting = ref(false);
    const virtual_lighting_stage = ref('FORM');
    const virtual_lighting_confirmed = ref(false);
    const virtual_lighting_result = ref(null);
    const virtual_lighting_error = ref('');
    const virtual_lighting_busy = ref(false);
    const virtual_lighting_idempotency_key = ref('');
    const virtual_lighting_boost = ref(6000);
    const virtual_lighting_preview = computed(() => {
      const info = advice_light_status.value;
      const boost = Math.max(1000, Number(virtual_lighting_boost.value) || 0);
      const after = info.value === null ? null : Math.min(Number(info.high || info.value + boost), info.value + boost);
      return { ...info, boost, after };
    });
    const irrigation_readiness = computed(() => {
      const score = irrigation_readiness_detail.value?.score ?? advice_readiness.value?.score;
      if (score !== undefined && score !== null && Number.isFinite(Number(score))) {
        return Math.round(Number(score) * 100);
      }
      const plot = advice_plot.value;
      const moisture = plot?.metrics?.SOIL_MOISTURE;
      if (!plot || moisture?.value === undefined || moisture?.value === null) return 0;
      const status = String(irrigation_plan.value?.readinessStatus || '').toUpperCase();
      if (status === 'READY') return 100;
      if (status === 'HUMAN_REVIEW') return 72;
      if (status === 'NEEDS_EVIDENCE') return 35;
      if (status === 'UNAVAILABLE') return 0;
      return plot.deviceStatus === 'ONLINE' ? 82 : 42;
    });
    const irrigation_amount = computed(() => {
      const value = Number(irrigation_plan.value?.waterLitre ?? irrigation_plan.value?.howMuch?.waterLitre);
      return Number.isFinite(value) && value > 0 ? Math.round(value) : '—';
    });
    const irrigation_duration_label = computed(() => {
      const seconds = Number(irrigation_plan.value?.durationSeconds ?? irrigation_plan.value?.howMuch?.durationSeconds);
      if (Number.isFinite(seconds) && seconds > 0) return `建议 ${Math.round(seconds / 6) / 10} 分钟`;
      if (String(irrigation_plan.value?.status || '').toUpperCase() === 'NO_ACTION') return '当前无需补水';
      if (irrigation_plan_loading.value) return '正在读取处方';
      if (irrigation_plan_error.value) return '处方暂不可用';
      return '等待后端处方';
    });
    const irrigation_target_label = computed(() => {
      const plot = advice_plot.value;
      if (!plot) return '暂无地块数据';
      const band = selected_crop_band.value;
      return `当前 ${plot.metrics?.SOIL_MOISTURE?.value ?? '—'}% · 目标 ${band?.targetText || plot.metrics?.SOIL_MOISTURE?.target || '—'}`;
    });
    const advice_diagnosis_summary = computed(() => {
      const diagnosis = advice_diagnosis.value;
      if (!diagnosis) return null;
      const cause = String(diagnosis.primaryCause || '').toUpperCase();
      const confidence = Number(diagnosis.confidence);
      return {
        causeLabel: FEEDBACK_CAUSE_LABELS[cause] || '待分析',
        confidenceLabel: Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '—',
        summary: diagnosis.summary || diagnosis.explanation || irrigation_plan.value?.why || advice_plan.value?.why || '系统已根据当前地块数据完成规则诊断。',
        candidates: (diagnosis.candidateCauses || []).slice(0, 3).map((item) => ({
          code: item.code,
          label: FEEDBACK_CAUSE_LABELS[String(item.code || '').toUpperCase()] || '其他原因',
          confidence: Number.isFinite(Number(item.confidence)) ? `${Math.round(Number(item.confidence) * 100)}%` : '—'
        })),
        supporting: (diagnosis.supportingEvidence || []).map(evidence_view),
        opposing: (diagnosis.opposingEvidence || []).map(evidence_view),
        missing: (diagnosis.missingInformation || []).map(evidence_view),
        conflicts: (diagnosis.evidenceConflicts || []).map(evidence_view)
      };
    });
    const advice_is_no_action = computed(() => {
      const plotId = advice_plot.value?.plotId;
      const plan = irrigation_plan.value?.plotId === plotId ? irrigation_plan.value : advice_plan.value;
      return String(plan?.status || '').toUpperCase() === 'NO_ACTION';
    });
    const advice_readiness_summary = computed(() => {
      const readiness = advice_readiness.value;
      if (!readiness) return null;
      const status = String(readiness.status || 'UNAVAILABLE').toUpperCase();
      return {
        status,
        statusLabel: READINESS_STATUS_LABELS[status] || '状态未知',
        score: Number.isFinite(Number(readiness.score)) ? Math.round(Number(readiness.score) * 100) : null,
        missing: (readiness.missingEvidence || []).slice(0, 6).map((item, index) => evidence_view(item, index)),
        requiredActions: (readiness.requiredActions || []).slice(0, 6).map((item, index) => ({
          id: `${item.type || 'ACTION'}-${item.action || index}`,
          label: EVIDENCE_LABELS[item.action] || EVIDENCE_LABELS[item.type] || '补充检查',
          priority: item.priority || 'HIGH'
        })),
        gates: Object.entries(readiness.hardGates || {}).map(([key, value]) => ({
          key,
          label: READINESS_GATE_LABELS[key] || key,
          status: String(value || '').toUpperCase()
        })),
        canRequestReview: Boolean(irrigation_plan.value?.planId || advice_plan.value?.planId)
      };
    });
    const manual_irrigation_fallback = computed(() => {
      const plotId = advice_plot.value?.plotId;
      const plan = irrigation_plan.value?.plotId === plotId ? irrigation_plan.value : advice_plan.value;
      return plan?.manualFallback || null;
    });
    const manual_irrigation_available = computed(() => manual_irrigation_fallback.value?.available === true && !advice_is_no_action.value);
    const manual_irrigation_limits = computed(() => manual_irrigation_fallback.value?.constraints || {
      minWaterLitre: 0.1,
      maxWaterLitre: 0,
      maxDurationSeconds: 900,
      flowRateLitresPerMinute: 18,
      dailyRemainingLitres: 0,
      resourceRemainingLitres: 0,
      areaM2: Number(advice_plot.value?.areaM2 || 80)
    });
    const manual_irrigation_bypassed_gates = computed(() => (manual_irrigation_fallback.value?.bypassedGates || [])
      .map((gate) => MANUAL_GATE_LABELS[gate] || READINESS_GATE_LABELS[gate] || gate));
    const manual_irrigation_preview = computed(() => {
      const plot = advice_plot.value;
      const current = Number(plot?.metrics?.SOIL_MOISTURE?.value);
      const water = Number(manual_irrigation_water.value);
      const area = Number(manual_irrigation_limits.value.areaM2 || plot?.areaM2 || 80);
      const flow = Number(manual_irrigation_limits.value.flowRateLitresPerMinute || 18);
      const validWater = Number.isFinite(water) && water > 0;
      const delta = validWater && Number.isFinite(current) ? moistureDeltaFromWater(water, area) : null;
      return {
        current: Number.isFinite(current) ? current : null,
        water: validWater ? water : null,
        delta,
        after: delta === null ? null : Number(Math.min(100, current + delta).toFixed(1)),
        durationSeconds: validWater ? Math.max(1, Math.ceil(water / Math.max(1, flow) * 60)) : null
      };
    });
    const advice_execution_summary = computed(() => {
      const commands = advice_passport.value?.commands || [];
      const evaluations = advice_passport.value?.evaluations || [];
      const directCommand = manual_irrigation_result.value?.commandId
        ? manual_irrigation_result.value
        : suggestion_result.value?.commandId ? suggestion_result.value : null;
      const command = directCommand || commands[commands.length - 1] || null;
      const evaluation = command
        ? command.evaluation || evaluations.find((item) => item.commandId === command.commandId) || evaluations[evaluations.length - 1]
        : null;
      const expected = evaluation?.expected || {};
      const actual = evaluation?.actual || {};
      const parse_percent = (value) => {
        const numeric = Number.parseFloat(String(value ?? '').replace('%', ''));
        return Number.isFinite(numeric) ? numeric : null;
      };
      const planExpected = irrigation_plan.value?.expectedResult || {};
      return {
        approvalStatus: suggestion_result.value?.approvalStatus || (suggestion_result.value?.workOrderId ? 'PENDING' : command ? 'NOT_REQUIRED' : 'NOT_REQUESTED'),
        workOrderId: suggestion_result.value?.workOrderId || null,
        command,
        evaluation,
        commandStatus: String(command?.ack?.status || command?.status || 'PENDING').toUpperCase(),
        ackAt: command?.ack?.receivedAt || null,
        actualWater: command?.ack?.actualWaterLitre ?? actual.waterLitre,
        before: actual.soilMoistureBefore ?? expected.soilMoistureBefore ?? planExpected.from,
        after: actual.soilMoistureAfter ?? parse_percent(evaluation?.actualMoisture),
        score: Number.isFinite(Number(evaluation?.effectivenessScore)) ? Math.round(Number(evaluation.effectivenessScore) * 100) : null
      };
    });
    const advice_moisture_chart = computed(() => {
      const plot = advice_selected_plot.value;
      if (!plot) return null;
      const base = metric_chart(plot, 'SOIL_MOISTURE', moisture_range.value);
      if (!base) return null;
      const scale = { min: 0, max: 60, label: '自适应' };
      const width = 360;
      const height = 132;
      const pad = { left: 32, right: 10, top: 12, bottom: 20 };
      const innerW = width - pad.left - pad.right;
      const innerH = height - pad.top - pad.bottom;
      const span = Math.max(1, scale.max - scale.min);
      const toY = (v) => pad.top + (1 - (Math.min(scale.max, Math.max(scale.min, v)) - scale.min) / span) * innerH;
      const toX = (ratio) => pad.left + Math.max(0, Math.min(1, Number(ratio) || 0)) * innerW;
      const series = base.series.map((s) => ({
        ...s,
        points: (s.samples || []).map((sample) => `${toX(sample.ratio).toFixed(1)},${toY(sample.value).toFixed(1)}`).join(' ')
          || s.values.map((v, i) => `${toX(s.values.length <= 1 ? 1 : i / (s.values.length - 1)).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
      }));
      const band = selected_crop_band.value;
      const bandStatus = resolve_moisture_band_status(plot);
      const lineColor = bandStatus === 'ALERT'
        ? 'var(--g-danger)'
        : (bandStatus === 'WARN' ? 'var(--g-warning)' : (series[0]?.color || 'var(--g-success)'));
      const tintedSeries = series.map((s) => ({ ...s, color: lineColor }));
      const targetBands = band ? [{
        ...band,
        yLow: toY(band.low),
        yHigh: toY(band.high)
      }] : [];
      const alertLine = band && Number.isFinite(band.alertThreshold)
        ? { value: band.alertThreshold, y: toY(band.alertThreshold), label: `告警阈值 ${band.alertThreshold}%` }
        : null;
      const grid = [
        { y: pad.top, label: String(scale.max) },
        { y: pad.top + innerH / 2, label: String(Math.round((scale.max + scale.min) / 2)) },
        { y: pad.top + innerH, label: String(scale.min) }
      ];
      return {
        ...base,
        rangeId: moisture_range.value,
        rangeLabel: (moisture_range_options.find((o) => o.id === moisture_range.value) || {}).title || '',
        series: tintedSeries,
        targetBands,
        alertLine,
        grid,
        bandStatus,
        bandLabel: BAND_STATUS_LABELS[bandStatus] || '正常',
        plotName: plot.name,
        cropLabel: band?.cropLabel || plot.cropName,
        stageLabel: band?.stageLabel || plot.stageLabel,
        currentMoisture: plot.metrics?.SOIL_MOISTURE?.value,
        currentTarget: band?.targetText || plot.metrics?.SOIL_MOISTURE?.target
      };
    });
    const selected_message = ref(null);
    const message_filter = ref('all');
    const selected_task = ref(null);
    const show_issue_report_modal = ref(false);
    const issue_report_busy = ref(false);
    const issue_report_error = ref('');
    const issue_report_task = ref(null);
    const issue_report_form = ref({ description: '', priority: 'HIGH' });
    const analyzing = ref(false);
    const analysis_result = ref('');
    const analysis_error = ref('');
    const analysis_source_label = ref('');
    const show_inspection_form = ref(false);
    const show_evidence_form = ref(false);
    const show_account_modal = ref(false);
    const show_profile_menu = ref(false);
    const show_report_modal = ref(false);
    const show_weather_controls = ref(false);
    const show_resource_allocation = ref(false);
    const show_suggestion_flow = ref(false);
    const show_manual_irrigation = ref(false);
    const show_no_action_reason = ref(false);
    const active_suggestion = ref(null);
    const suggestion_flow_stage = ref('VIEW');
    const suggestion_confirm_checked = ref(false);
    const suggestion_result_form = ref({
      outcome: 'SUCCEEDED',
      note: '',
      actual_water_litre: '',
      actual_duration_seconds: '',
      water_source_mode: 'EXTERNAL'
    });
    const suggestion_result = ref(null);
    const suggestion_recovery_status = ref('');
    const suggestion_busy = ref(false);
    const suggestion_idempotency_key = ref('');
    const manual_irrigation_stage = ref('FORM');
    const manual_irrigation_water = ref('');
    const manual_irrigation_confirmed = ref(false);
    const manual_irrigation_result = ref(null);
    const manual_irrigation_error = ref('');
    const manual_irrigation_busy = ref(false);
    const manual_irrigation_idempotency_key = ref('');
    const report_subscribed = ref(localStorage.getItem('agriloop-farmer-weekly-report') === 'true');
    const active_report_key = ref('daily');
    const weather_inputs = ref({ temperature: 34, rainfall: 0, light: 62 });
    const risk_forecast = ref(null);
    const resource_plan = ref(null);
    const resource_persistence_status = ref(is_formal_session ? 'UNKNOWN' : 'DEMO');
    const resource_requests = ref([]);
    const resource_request_busy = ref(false);
    const resource_request_response_note = ref('');
    const resource_request_form = ref({ requestedLitres: 60, preferredStart: '', preferredEnd: '', constraints: '', note: '' });
    const selected_case_id = ref('');
    const human_confirmation_checked = ref(false);
    const decision_confirmation = ref('');
    const inspection_form = ref({
      plot_id: plots.value[0]?.plotId || '',
      work_order_id: '',
      soil_surface: 'NORMAL',
      crop_condition: 'HEALTHY',
      moisture: plots.value[0]?.metrics?.SOIL_MOISTURE?.value ?? '',
      notes: '',
      photos: []
    });
    const evidence_form = ref({
      plot_id: plots.value[0]?.plotId || '',
      type: 'FIELD_INSPECTION',
      reason: ''
    });
    const password_form = ref({ current: '', next: '', confirm: '' });
    const password_error = ref('');
    const irrigation_running = ref(false);
    const irrigation_progress = ref(0);
    const advice_trace = ref('');
    const advice_plan = ref(null);
    const advice_diagnosis = ref(null);
    const advice_readiness = ref(null);
    const irrigation_guard = ref(null);
    const automatic_watering_result = ref(null);
    const automatic_watering_busy = ref(false);
    const automatic_watering_setting = ref(null);
    const automatic_watering_setting_busy = ref(false);
    const advice_passport = ref(null);
    const evidence_request_busy = ref(false);
    const advice_loading = ref(false);
    const advice_error = ref('');
    const show_advice_diagnosis = ref(false);
    const feedback_busy = ref(false);
    const similar_cases_live = ref([]);
    const suggestion_feedback = ref('');
    const assistant_input = ref('');
    const assistant_messages = ref([]);
    const assistant_conversations = ref([]);
    const assistant_conversation_id = ref('');
    const assistant_drawer_open = ref(false);
    const assistant_busy = ref(false);
    const assistant_action_busy = ref('');
    const assistant_error = ref('');
    const assistant_service_status = ref(is_formal_session ? 'CONNECTING' : 'DEMO');
    const assistant_plot_id = ref(plots.value[0]?.plotId || '');
    const assistant_message_list = ref(null);
    const assistant_shortcuts = computed(() => role_presentation.value.shortcutQuestions);

    const automatic_watering_status = computed(() => {
      const plot = advice_plot.value || plots.value[0];
      const moisture = Number(automatic_watering_result.value?.currentMoisture
        ?? irrigation_guard.value?.automaticWatering?.currentMoisture
        ?? irrigation_plan.value?.automaticWatering?.currentMoisture
        ?? plot?.metrics?.SOIL_MOISTURE?.value);
      const threshold = Number(automatic_watering_result.value?.threshold
        ?? irrigation_guard.value?.automaticWatering?.threshold
        ?? irrigation_plan.value?.automaticWatering?.threshold
        ?? 10);
      const enabled = automatic_watering_setting.value?.enabled
        ?? irrigation_guard.value?.automaticWatering?.enabled
        ?? irrigation_plan.value?.automaticWatering?.enabled
        ?? true;
      const resultStatus = String(automatic_watering_result.value?.status || '').toUpperCase();
      const eligible = Number.isFinite(moisture) && moisture < threshold;
      const status = !enabled ? 'DISABLED' : resultStatus === 'TRIGGERED' ? 'TRIGGERED' : resultStatus === 'BLOCKED' ? 'BLOCKED' : eligible ? 'READY' : 'MONITORING';
      const statusLabel = { DISABLED: '未开启', TRIGGERED: '已自动发起', BLOCKED: '已阻断', READY: '待触发', MONITORING: '监测中' }[status] || '监测中';
      const label = !enabled ? '自动浇水未开启' : status === 'TRIGGERED' ? '已根据最新读数发起' : status === 'BLOCKED' ? '低湿度已识别，但安全校验未通过' : eligible ? '土壤偏干，达到自动浇水阈值' : '土壤含水量正常';
      return { enabled: Boolean(enabled), threshold, moisture: Number.isFinite(moisture) ? moisture : null, eligible: Boolean(enabled) && eligible, status, statusLabel, label, plotId: plot?.plotId || '' };
    });

    // Keep the old QA names as local aliases for the existing advice helpers;
    // the farmer-facing surface now lives at #assistant instead of a popup.
    const qa_input = assistant_input;
    const qa_active_turn = ref(null);
    const qa_history = assistant_messages;
    const qa_audit = ref(null);
    const qa_details_open = ref(false);
    const qa_source_label = ref(is_formal_session ? '后端智能服务' : '演示助手（未连接模型）');
    const qa_busy = assistant_busy;
    const qa_plot_id = assistant_plot_id;
    const crop_manuals = ref([]);
    const crop_manual_code = ref(plots.value[0]?.cropCode || crop_pack_catalog[0]?.cropCode || 'tomato');
    const crop_manual_stage = ref(plots.value[0]?.stageCode || crop_pack_catalog[0]?.stages?.[0]?.code || 'seedling');
    const crop_manual_live = ref(null);
    const crop_manual_error = ref('');

    const on_app_click = () => {
      close_profile_menu();
    };

    // 农户任务看板状态：保留 PENDING（未开始），隐藏真正的 OPEN（待分配）。
    const farmer_task_status = (task) => {
      const raw = String(task?.status || '').trim().toUpperCase();
      if (raw === 'PENDING') return 'PENDING';
      return normalizeWorkStatus(raw);
    };

    // 农户端不展示「待分配」(OPEN)：这类任务仍归管理员分配队列。
    const farmer_visible_tasks = computed(() =>
      tasks.value.filter((t) => farmer_task_status(t) !== 'OPEN')
    );

    const nav_items = computed(() => {
      const unread = messages.value.filter((m) => !m.read).length;
      const pending = farmer_visible_tasks.value.filter((t) => ['PENDING', 'ASSIGNED', 'REJECTED'].includes(farmer_task_status(t))).length;
      const risks = plots.value.filter((plot) => plot.riskLevel !== 'LOW').length;
      return [
        { id: 'dashboard', label: '主面板', icon: 'dashboard' },
        { id: 'plots', label: '我的地块', icon: 'grass' },
        { id: 'tasks', label: '今日农务', icon: 'task', badge: pending || undefined },
        { id: 'inspections', label: '巡田记录', icon: 'fact_check', badge: inspection_records.value.length || undefined },
        { id: 'advice', label: '操作系统', icon: 'water_drop', badge: risks || undefined },
        { id: 'messages', label: '消息中心', icon: 'forum', badge: unread || undefined },
        { id: 'assistant', label: '农智助手', icon: 'smart_toy' },
        { id: 'tools', label: '更多工具', icon: 'apps', is_footer: true },
        { id: 'settings', label: '工作台设置', icon: 'settings', is_footer: true }
      ];
    });

    const greeting = computed(() => {
      const hr = new Date().getHours();
      if (hr < 6) return '凌晨好';
      if (hr < 12) return '上午好';
      if (hr < 14) return '中午好';
      if (hr < 18) return '下午好';
      return '晚上好';
    });

    const stats = computed(() => {
      const today_todo = farmer_visible_tasks.value.filter((t) =>
        ['PENDING', 'ASSIGNED', 'REJECTED'].includes(farmer_task_status(t)) && is_today(t.due_iso)
      ).length;
      const dispatched = farmer_visible_tasks.value.length;
      const done = farmer_visible_tasks.value.filter((t) => farmer_task_status(t) === 'DONE').length;
      const pending = farmer_visible_tasks.value.filter((t) => ['PENDING', 'ASSIGNED', 'REJECTED'].includes(farmer_task_status(t))).length;
      const in_progress = farmer_visible_tasks.value.filter((t) => farmer_task_status(t) === 'IN_PROGRESS').length;
      const unread_messages = messages.value.filter((m) => !m.read).length;
      const risk_alerts = plots.value.filter((plot) => plot.riskLevel !== 'LOW').length;
      return { today_todo, dispatched, done, pending, in_progress, unread_messages, risk_alerts };
    });

    const recent_tasks = computed(() =>
      farmer_visible_tasks.value
        .slice()
        .sort((a, b) => new Date(b.created_iso) - new Date(a.created_iso))
        .slice(0, 5)
    );

    const recent_messages = computed(() =>
      messages.value
        .slice()
        .sort((a, b) => new Date(b.time_iso) - new Date(a.time_iso))
        .slice(0, 5)
    );

    const sorted_messages = computed(() =>
      messages.value
        .slice()
        .sort((a, b) => new Date(b.time_iso) - new Date(a.time_iso))
    );

    const message_filter_counts = computed(() => ({
      all: messages.value.length,
      alert: messages.value.filter((item) => item.category === 'alert').length,
      task: messages.value.filter((item) => item.category === 'task').length,
      notice: messages.value.filter((item) => ['notice', 'system'].includes(item.category)).length
    }));

    const filtered_messages = computed(() => {
      if (message_filter.value === 'all') return sorted_messages.value;
      if (message_filter.value === 'notice') {
        return sorted_messages.value.filter((item) => ['notice', 'system'].includes(item.category));
      }
      return sorted_messages.value.filter((item) => item.category === message_filter.value);
    });

    const unread_count = computed(() => messages.value.filter((m) => !m.read).length);

    const task_columns = computed(() => [
      { status: 'PENDING', label: '未开始', items: farmer_visible_tasks.value.filter((t) => farmer_task_status(t) === 'PENDING') },
      { status: 'ASSIGNED', label: '已分配', items: farmer_visible_tasks.value.filter((t) => farmer_task_status(t) === 'ASSIGNED') },
      { status: 'IN_PROGRESS', label: '执行中', items: farmer_visible_tasks.value.filter((t) => farmer_task_status(t) === 'IN_PROGRESS') },
      { status: 'SUBMITTED', label: '待验收', items: farmer_visible_tasks.value.filter((t) => farmer_task_status(t) === 'SUBMITTED') },
      { status: 'REJECTED', label: '需返工', items: farmer_visible_tasks.value.filter((t) => farmer_task_status(t) === 'REJECTED') },
      { status: 'DONE', label: '已完成', items: farmer_visible_tasks.value.filter((t) => ['DONE', 'CANCELLED'].includes(farmer_task_status(t))) }
    ]);

    const profile_stats = computed(() => {
      const total_done = Number.isFinite(Number(user.value.total_done)) ? Number(user.value.total_done) : farmer_visible_tasks.value.filter((t) => ['DONE', 'COMPLETED'].includes(farmer_task_status(t))).length;
      const month_done = Number.isFinite(Number(user.value.month_done)) ? Number(user.value.month_done) : 0;
      const in_progress = farmer_visible_tasks.value.filter((t) => farmer_task_status(t) === 'IN_PROGRESS').length;
      const pending = farmer_visible_tasks.value.filter((t) => ['PENDING', 'ASSIGNED', 'REJECTED'].includes(farmer_task_status(t))).length;
      const due_soon = farmer_visible_tasks.value.filter(is_due_soon).length;
      const completion_rate = Number.isFinite(Number(user.value.completion_rate))
        ? Number(user.value.completion_rate)
        : farmer_visible_tasks.value.length ? Math.round((farmer_visible_tasks.value.filter((t) => ['DONE', 'COMPLETED'].includes(farmer_task_status(t))).length / farmer_visible_tasks.value.length) * 100) : 0;
      const inspections = inspection_records.value.length;
      const messages_count = messages.value.length;
      const unread = messages.value.filter((m) => !m.read).length;
      return { total_done, month_done, in_progress, pending, due_soon, completion_rate, inspections, messages: messages_count, unread };
    });

    const account_profile = computed(() => buildAccountProfile(user.value, {
      farm: farm.value,
      plots: plots.value,
      tasks: tasks.value,
      messages: messages.value,
      inspections: inspection_records.value,
      profile: is_formal_session ? {} : MOCK_DATA.farmer_profile,
      isLive: is_formal_session
    }));

    const degradation_banner = computed(() => {
      if (!is_live.value) {
        return {
          tone: 'mock', icon: 'science', mode: '演示模式', title: '当前为模拟演示模式',
          detail: '天气、预测、排程和报告均使用可重复的模拟数据；不会控制真实水泵或修改生产策略。'
        };
      }
      if (risk_forecast.value && String(risk_forecast.value.status).toUpperCase() !== 'AVAILABLE') {
        return {
          tone: 'warning', icon: 'wifi_off', mode: '暂不可用', title: '风险预测暂不可用',
          detail: risk_forecast.value.reason || risk_forecast.value.unavailableReason || '样本、数据质量或设备状态不足，请先巡田或复测。'
        };
      }
      return null;
    });

    const weather_risk_card = computed(() => {
      const target = plots.value.slice().sort((a, b) => health_score(a) - health_score(b))[0] || {};
      const forecast = risk_forecast.value || {};
      const temperature = Number(weather_inputs.value.temperature) || 0;
      const rainfall = Number(weather_inputs.value.rainfall) || 0;
      const light = Number(weather_inputs.value.light) || 0;
      const baseTtr = Number(forecast.timeToRiskMinutes ?? 72);
      let statusLabel = '持续干旱';
      let tone = 'warning';
      let icon = '☀️';
      let impact = `${target.name || '重点地块'}可能继续失水，建议优先核验土壤湿度。`;
      let ttr = baseTtr;
      if (rainfall >= 15) {
        statusLabel = '暴雨积水'; tone = 'primary'; icon = '🌧️'; ttr = null;
        impact = '降雨假设较高，应暂停补水并关注积水风险。';
      } else if (temperature >= 36 || light >= 75) {
        statusLabel = '高温强光'; tone = 'danger'; icon = '🔥'; ttr = Math.max(15, Math.round(baseTtr * 0.67));
        impact = '高温强光会加快蒸散，建议缩短复测间隔并避开正午操作。';
      } else if (rainfall > 2) {
        statusLabel = '有降雨'; tone = 'success'; icon = '🌦️'; ttr = null;
        impact = '预计降雨可缓解短期缺水，执行前仍需确认现场实际降雨。';
      }
      const unavailable = String(forecast.status || '').toUpperCase() === 'UNAVAILABLE';
      return {
        plotId: target.plotId,
        statusLabel: unavailable ? '预测不可用' : statusLabel,
        tone: unavailable ? 'warning' : tone,
        icon: unavailable ? '⚠️' : icon,
        impact: unavailable ? (forecast.reason || '数据不足，请先完成现场核验。') : impact,
        ttrLabel: unavailable ? '不可用' : (ttr == null ? '暂未越界' : `${ttr} 分钟`)
      };
    });

    const device_attention = computed(() => {
      const deviceTasks = tasks.value.filter((task) => /设备|流量计|水泵|阀门|通信|心跳|巡检/.test(`${task.title || ''}${task.reason || ''}`));
      const task = deviceTasks.find((item) => item.status !== 'DONE') || deviceTasks[0] || null;
      const offlinePlot = plots.value.find((plot) => String(plot.deviceStatus).toUpperCase() !== 'ONLINE');
      const needsAction = Boolean(offlinePlot || (task && task.status !== 'DONE'));
      const plotId = offlinePlot?.plotId || task?.plot_id || plots.value[0]?.plotId;
      const status = task?.status || (offlinePlot ? 'PENDING' : 'DONE');
      const reached = status === 'DONE' ? 4 : (status === 'IN_PROGRESS' ? 2 : 1);
      const labels = ['发现异常', '检修任务', '现场复测', '确认恢复'];
      return {
        task, plotId, needsAction,
        statusLabel: needsAction ? '待处理' : '已恢复',
        title: task?.title || (offlinePlot ? `${offlinePlot.name}设备离线` : '负责地块设备运行正常'),
        detail: task?.reason || (offlinePlot ? '需要检查供电、通信和设备心跳。' : '最近一次设备复测已完成，当前没有异常任务。'),
        steps: labels.map((label, index) => ({ label, state: index < reached ? 'done' : (index === reached ? 'current' : 'upcoming') }))
      };
    });

    // 首页只展示可行动的三件事：设备/高风险优先，其次是逾期和即将到期工单。
    // 任务仍来自统一工单读模型，风险和设备只是聚合出的入口，不创建第二套事实表。
    const plot_issue_summary = (plot) => {
      const deviceOffline = String(plot?.deviceStatus || '').toUpperCase() !== 'ONLINE';
      const band = resolve_moisture_band_status(plot);
      const risk = String(plot?.riskLevel || 'LOW').toUpperCase();
      if (deviceOffline) {
        return {
          kind: 'DEVICE',
          statusLabel: '设备离线',
          issue: '设备离线，数据可能不准确',
          detail: '先检查供电、通信和设备心跳，再决定是否操作。',
          actionLabel: '先检查设备',
          icon: 'build_circle'
        };
      }
      if (band === 'ALERT') {
        return {
          kind: 'IRRIGATION',
          statusLabel: '需要补水',
          issue: '土壤湿度低于目标',
          detail: '查看补水建议，满足安全门后再确认执行。',
          actionLabel: '查看建议并执行',
          icon: 'water_drop'
        };
      }
      if (band === 'WARN') {
        return {
          kind: 'IRRIGATION',
          statusLabel: '关注湿度',
          issue: '土壤湿度偏离目标',
          detail: '建议先巡田或复测，再决定是否补水。',
          actionLabel: '查看补水建议',
          icon: 'water_drop'
        };
      }
      if (risk !== 'LOW') {
        return {
          kind: 'RISK',
          statusLabel: '有风险提醒',
          issue: '当前地块存在风险提醒',
          detail: '查看风险说明和下一步核验动作。',
          actionLabel: '查看风险建议',
          icon: 'warning'
        };
      }
      return {
        kind: 'NORMAL',
        statusLabel: '状态正常',
        issue: '暂未发现明显问题',
        detail: '保持日常巡查，点开可查看详细指标。',
        actionLabel: '查看详情',
        icon: 'check_circle'
      };
    };

    const today_priorities = computed(() => {
      const now = Date.now();
      const candidates = [];
      const activeStatuses = new Set(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'REJECTED']);
      const taskPriorityScore = { HIGH: 72, MEDIUM: 48, LOW: 24 };
      farmer_visible_tasks.value.forEach((task) => {
        const status = farmer_task_status(task);
        if (!activeStatuses.has(status)) return;
        const due = Date.parse(task.due_iso || '');
        const overdue = Number.isFinite(due) && due < now;
        const dueSoon = Number.isFinite(due) && due >= now && due - now <= 6 * 60 * 60 * 1000;
        const deviceTask = /设备|流量计|水泵|阀门|通信|心跳|巡检/.test(`${task.title || ''}${task.reason || ''}`);
        const plot = find_plot_by_id(plots.value, task.plot_id);
        const score = (deviceTask ? 108 : (taskPriorityScore[String(task.priority || 'MEDIUM').toUpperCase()] || 40))
          + (overdue ? 34 : (dueSoon ? 16 : 0));
        candidates.push({
          id: `task-${task.id}`,
          kind: deviceTask ? 'DEVICE' : 'TASK',
          plotId: task.plot_id || plot?.plotId || '',
          task,
          title: task.title,
          reason: task.reason || '按任务说明完成现场处理。',
          urgency: overdue ? '已逾期' : (String(task.priority || '').toUpperCase() === 'HIGH' ? '高优先级' : (dueSoon ? '即将到期' : '今日任务')),
          urgencyTone: overdue || String(task.priority || '').toUpperCase() === 'HIGH' ? 'danger' : (dueSoon ? 'warning' : 'primary'),
          dueLabel: overdue ? `截止 ${task.due_label || '已逾期'}` : (task.due_label || '按计划完成'),
          actionLabel: deviceTask ? '去处理' : (status === 'IN_PROGRESS' ? '填写结果' : '打开任务'),
          icon: deviceTask ? 'build_circle' : 'event_available',
          score,
          sortTime: Number.isFinite(due) ? due : Number.MAX_SAFE_INTEGER
        });
      });

      plots.value.forEach((plot) => {
        const issue = plot_issue_summary(plot);
        if (issue.kind === 'NORMAL') return;
        const riskLevel = String(plot.riskLevel || '').toUpperCase();
        const score = issue.kind === 'DEVICE'
          ? 116
          : (issue.statusLabel === '需要补水' || riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 101 : 78);
        candidates.push({
          id: `plot-${issue.kind}-${plot.plotId}`,
          kind: issue.kind,
          plotId: plot.plotId,
          title: `${plot.name} · ${issue.issue}`,
          reason: issue.detail,
          urgency: issue.kind === 'DEVICE' || issue.statusLabel === '需要补水' ? '立即处理' : '需要关注',
          urgencyTone: issue.kind === 'DEVICE' || issue.statusLabel === '需要补水' ? 'danger' : 'warning',
          dueLabel: issue.kind === 'DEVICE' ? '尽快检查' : '建议今天核验',
          actionLabel: issue.actionLabel,
          icon: issue.icon,
          score,
          sortTime: now
        });
      });

      const unique = new Map();
      candidates.sort((a, b) => b.score - a.score || a.sortTime - b.sortTime).forEach((item) => {
        // 同一地块同一类入口只保留得分更高的一项，避免首页重复提醒。
        const key = `${item.kind}:${item.plotId || item.id}`;
        if (!unique.has(key)) unique.set(key, item);
      });
      return [...unique.values()].sort((a, b) => b.score - a.score || a.sortTime - b.sortTime).slice(0, 3);
    });

    // 首页右侧只展示聚合后的风险摘要，具体处置仍从“今天先做什么”进入。
    // 设备离线已经属于地块问题的一种，不与风险地块重复计数。
    const dashboard_risk_summary = computed(() => {
      const issues = plots.value
        .map((plot) => ({ plot, issue: plot_issue_summary(plot) }))
        .filter(({ issue }) => issue.kind !== 'NORMAL');
      const deviceCount = issues.filter(({ issue }) => issue.kind === 'DEVICE').length;
      const environmentCount = issues.length - deviceCount;
      const total = issues.length;
      const statusLabel = total === 0 ? '运行正常' : (issues.some(({ issue }) => issue.kind === 'DEVICE' || issue.statusLabel === '需要补水') ? '重点处理' : '需要关注');
      const tone = total === 0 ? 'success' : (statusLabel === '重点处理' ? 'danger' : 'warning');
      return {
        total,
        tone,
        statusLabel,
        deviceLabel: deviceCount ? `${deviceCount} 个地块设备离线，先检查心跳` : '设备均在线',
        environmentLabel: environmentCount ? `${environmentCount} 个地块有湿度或风险提醒` : '暂无明显环境异常',
        readinessLabel: deviceCount ? '数据可能不可用，先补充现场证据' : (environmentCount ? '查看建议前先核对现场' : '可按计划巡查'),
        actionView: environmentCount ? 'advice' : (deviceCount ? 'inspections' : 'plots'),
        actionLabel: total ? '查看风险建议' : '查看全部地块'
      };
    });

    // 首页动态只保留任务和普通通知；告警集中在风险摘要和优先行动中，避免重复轰炸。
    const recent_activity = computed(() => {
      const taskItems = recent_tasks.value.map((task) => ({
        id: `activity-task-${task.id}`,
        kind: 'TASK',
        icon: farmer_task_status(task) === 'DONE' ? 'task_alt' : 'event_available',
        title: task.title,
        label: status_label(farmer_task_status(task)),
        plotLabel: task.plot_name || find_plot_by_id(plots.value, task.plot_id)?.name || '',
        timeLabel: task.due_label || format_relative_label(task.created_iso) || '按计划',
        sortTime: Date.parse(task.created_iso || '') || 0,
        task
      }));
      const messageItems = recent_messages.value
        .filter((message) => message.category !== 'alert')
        .map((message) => ({
          id: `activity-message-${message.id}`,
          kind: 'MESSAGE',
          icon: message.category === 'task' ? 'assignment' : 'campaign',
          title: message.title,
          label: category_label(message.category),
          plotLabel: message.plotId ? find_plot_name(message.plotId) : '',
          timeLabel: message.time_label || format_relative_label(message.time_iso) || '刚刚',
          sortTime: Date.parse(message.time_iso || '') || 0,
          message
        }));
      return [...taskItems, ...messageItems]
        .sort((a, b) => b.sortTime - a.sortTime)
        .slice(0, 5);
    });

    const suggestion_flow_steps = computed(() => {
      const order = ['VIEW', 'CONFIRM', 'RESULT', 'RECOVERY'];
      const current = Math.max(0, order.indexOf(suggestion_flow_stage.value));
      const irrigationSteps = [
        { id: 'VIEW', label: '查看建议' },
        { id: 'CONFIRM', label: '确认处方' },
        { id: 'RESULT', label: '执行与效果证据' },
        { id: 'RECOVERY', label: '效果评价' }
      ];
      const fieldActionSteps = [
        { id: 'VIEW', label: '查看建议' },
        { id: 'CONFIRM', label: '确认执行' },
        { id: 'RESULT', label: '填写结果' },
        { id: 'RECOVERY', label: '查看是否恢复' }
      ];
      return (active_suggestion.value?.kind === 'IRRIGATION' ? irrigationSteps : fieldActionSteps).map((step, index) => ({
        ...step,
        state: index < current ? 'done' : (index === current ? 'current' : 'upcoming')
      }));
    });

    const batch_timeline = computed(() => {
      const plot = selected_plot.value;
      if (!plot) return [];
      const pack = (MOCK_DATA.cropPackDetails || []).find((item) => item.cropCode === plot.cropCode);
      const stages = pack?.stages || [];
      const currentIndex = Math.max(0, stages.findIndex((stage) => stage.code === plot.stageCode));
      return stages.map((stage, index) => {
        const state = index < currentIndex ? 'done' : (index === currentIndex ? 'current' : 'upcoming');
        const linkedTasks = tasks.value.filter((task) => task.plot_id === plot.plotId && (state === 'current' || task.status === 'DONE')).length;
        const target = stage.target ? `湿度 ${stage.target.soilMoistureLow}~${stage.target.soilMoistureHigh}%` : '按作物包执行';
        return {
          code: stage.code, label: stage.label, state,
          icon: state === 'done' ? 'check' : (state === 'current' ? 'agriculture' : 'schedule'),
          stateLabel: state === 'done' ? '已完成' : (state === 'current' ? '当前阶段' : '后续计划'),
          detail: `${target}${linkedTasks ? ` · 关联 ${linkedTasks} 项工单` : ''}`
        };
      });
    });

    const selected_allocation = computed(() => {
      const plot = advice_selected_plot.value || advice_plot.value || plots.value[0];
      const plan = resource_plan.value || {};
      const rows = plan.allocations || [];
      const rowIndex = Math.max(0, rows.findIndex((item) => item.plotId === plot?.plotId));
      const row = rows[rowIndex] || {};
      const requested = Number(row.requestedLitres ?? 0);
      const allocated = Number(row.allocatedLitres ?? 0);
      const unmet = Math.max(0, requested - allocated);
      const hasConflict = unmet > 0 || ['PARTIAL', 'FALLBACK_REQUIRED', 'FAILED'].includes(String(row.executionStatus || row.status || '').toUpperCase());
      const slot = row.scheduledStart ? format_suggestion_time(row.scheduledStart) : '待管理员排程';
      return {
        requested, allocated, slot, hasConflict,
        summary: hasConflict ? `仅分配 ${allocated}/${requested} 升` : (allocated > 0 ? `已分配 ${allocated} 升 · ${slot}` : '当前计划未分配自动用水'),
        explanation: hasConflict ? `仍有 ${unmet} 升未满足，系统会保留人工兜底任务。` : '当前分配来自管理员确认的后端资源计划。',
        provenance: provenanceLabel(plan.provenance || (is_live.value ? 'BACKEND' : 'SIMULATED'))
      };
    });

    const selected_resource_request = computed(() => {
      const plot = advice_selected_plot.value || advice_plot.value || plots.value[0];
      const priority = { CONFLICT_REPORTED: 6, PENDING_ACK: 5, IN_REVIEW: 4, SUBMITTED: 3, ACKNOWLEDGED: 2, COMPLETED: 1, CANCELLED: 0 };
      return resource_requests.value.filter(item => item.plotId === plot?.plotId)
        .sort((a, b) => (priority[b.status] || 0) - (priority[a.status] || 0) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0] || null;
    });
    const resource_request_locked = computed(() => ['PENDING_ACK', 'ACKNOWLEDGED'].includes(String(selected_resource_request.value?.status || '').toUpperCase()));
    const resource_persistence_ready = computed(() => ['POSTGRESQL', 'H2_STANDALONE'].includes(String(resource_persistence_status.value || '').toUpperCase()));
    const resource_collaboration_read_only = computed(() => is_formal_session && !resource_persistence_ready.value);
    const resource_sync_label = computed(() => {
      if (!is_formal_session) return '演示数据 · 不跨账号';
      if (resource_persistence_ready.value) return '持久化后端协同';
      if (String(resource_persistence_status.value || '').toUpperCase() === 'IN_MEMORY_FALLBACK') return '数据库不可用 · 仅可查看';
      return '后端状态待确认 · 仅可查看';
    });
    const resource_request_status_label = status => ({ SUBMITTED: '已提交，等待排程', IN_REVIEW: '管理员正在编制方案', PENDING_ACK: '分配结果待你确认', ACKNOWLEDGED: '你已确认执行安排', CONFLICT_REPORTED: '冲突已反馈管理员', COMPLETED: '本次协同已完成', CANCELLED: '需求已撤回' }[String(status || '').toUpperCase()] || '尚未提交需求');

    const suggestion_plot = computed(() => {
      const plotId = active_suggestion.value?.plotId;
      return find_plot_by_id(plots.value, plotId) || advice_plot.value || plots.value[0] || null;
    });
    const suggestion_kind_label = computed(() => ({
      TASK: '任务建议',
      RISK: '风险建议',
      DEVICE: '设备建议',
      IRRIGATION: '灌溉建议'
    }[active_suggestion.value?.kind] || '农事建议'));
    const suggestion_block_reason = computed(() => {
      if (!active_suggestion.value || active_suggestion.value.kind !== 'IRRIGATION') return '';
      const plan = irrigation_plan.value;
      const status = String(plan?.readinessStatus || plan?.status || '').toUpperCase();
      if (irrigation_plan_loading.value) return '正在读取最新处方和安全门，请稍候。';
      if (irrigation_plan_error.value) return irrigation_plan_error.value;
      if (!active_suggestion.value.plotId || !suggestion_plot.value) return '未明确涉及地块，请先选择要处理的地块。';
      if (!plan) return '暂未生成处方，请先查看地块湿度或发起复测。';
      const readinessGate = String(irrigation_readiness_detail.value?.status || '').toUpperCase();
      const missing = (irrigation_readiness_detail.value?.missingEvidence || []).map((item) => EVIDENCE_LABELS[item] || '其他证据').filter(Boolean).slice(0, 3);
      if (['NEEDS_EVIDENCE', 'UNAVAILABLE', 'BLOCKED', 'HUMAN_REVIEW'].includes(readinessGate)) return missing.length ? `暂不能执行：还缺少 ${missing.join('、')}。` : '暂不能执行：当前数据或诊断需要人工复核。';
      if (status === 'NO_ACTION') return '当前湿度已达到目标，无需灌溉。';
      if (status === 'NEEDS_EVIDENCE') return missing.length ? `暂不能执行：还缺少 ${missing.join('、')}。` : '数据质量或诊断证据不足，请先巡田或复测。';
      if (status === 'UNAVAILABLE') return '暂不能执行：设备或最新数据不可用，请先检查设备并获取新遥测。';
      if (status === 'BLOCKED') return '暂不能执行：安全门未通过，请先补充必要证据。';
      if (status === 'HUMAN_REVIEW') return missing.length ? `暂不能执行：还缺少 ${missing.join('、')}。` : '暂不能执行：当前数据或诊断需要人工复核。';
      const guard = irrigation_guard.value;
      if (!guard) return '暂不能执行：安全门状态暂不可用，请稍后重试。';
      const water = Number(plan.waterLitre ?? plan.howMuch?.waterLitre);
      const duration = Number(plan.durationSeconds ?? plan.howMuch?.durationSeconds);
      const start = plan.when?.start || plan.recommendedWindow?.start;
      const end = plan.when?.end || plan.recommendedWindow?.end;
      if (!Number.isFinite(water) || water <= 0) return '处方缺少有效水量，不能执行灌溉。';
      if (!Number.isFinite(duration) || duration <= 0) return '处方缺少有效执行时长，不能执行灌溉。';
      if (!start || !end) return '处方缺少执行时间窗口，请先补充证据。';
      return '';
    });
    const suggestion_emergency_notice = computed(() => {
      if (!active_suggestion.value || active_suggestion.value.kind !== 'IRRIGATION') return '';
      const plan = irrigation_plan.value;
      if (plan?.emergency?.eligible !== true) return '';
      const moisture = Number(plan.emergency.currentMoisture);
      const threshold = Number(plan.emergency.threshold);
      const moistureText = Number.isFinite(moisture) ? `${moisture.toFixed(1)}%` : '当前值';
      const thresholdText = Number.isFinite(threshold) ? `${threshold.toFixed(1)}%` : '自动浇水阈值';
      return `当前湿度 ${moistureText} 已低于自动浇水阈值 ${thresholdText}；系统会在数据质量、设备和水量校验通过后发起虚拟浇水。`;
    });
    const suggestion_emergency_mode = computed(() => {
      // Legacy suggestion cards still bind this value; irrigation no longer
      // has a special cooldown-bypass mode, so manual execution stays a
      // normal confirmed virtual command.
      return false;
    });
    const suggestion_confirm_enabled = computed(() => {
      if (!active_suggestion.value || suggestion_busy.value || suggestion_flow_stage.value !== 'CONFIRM') return false;
      if (active_suggestion.value.kind === 'IRRIGATION') {
        return suggestion_confirm_checked.value && !suggestion_block_reason.value;
      }
      return suggestion_confirm_checked.value;
    });

    const crop_manual_options = computed(() => {
      const source = crop_manuals.value.length
        ? crop_manuals.value
        : (crop_pack_catalog || []).map((pack) => ({
          cropCode: pack.cropCode,
          name: pack.identity?.name,
          region: pack.identity?.region,
          stageCount: pack.stages?.length || 0
        }));
      return source
        .slice()
        .sort((a, b) => String(a.name || a.label || '').localeCompare(String(b.name || b.label || ''), 'zh-CN'))
        .map((item) => ({
          cropCode: item.cropCode,
          label: item.name || item.label || item.cropCode,
          region: item.region || '本地',
          stageCount: item.stageCount || item.stages?.length || 0,
          icon: CROP_ICONS[item.cropCode] || '🌱'
        }));
    });
    const crop_manual_pack = computed(() => {
      if (crop_manual_live.value) return crop_manual_live.value;
      return (crop_pack_catalog || []).find((pack) => pack.cropCode === crop_manual_code.value) || crop_pack_catalog[0] || null;
    });
    const crop_manual_stages = computed(() => (crop_manual_pack.value?.stages || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0)));
    const crop_manual_stage_item = computed(() => crop_manual_live.value?.stage || crop_manual_stages.value.find((stage) => stage.code === crop_manual_stage.value) || crop_manual_stages.value[0] || null);
    const crop_manual_rules = computed(() => crop_manual_live.value?.rules || crop_manual_pack.value?.rules || []);
    const crop_manual_documents = computed(() => {
      const knowledge = crop_manual_live.value?.knowledge || crop_manual_pack.value?.knowledge || {};
      return knowledge.documents || [];
    });
    const crop_manual_metrics_list = computed(() => {
      if (crop_manual_live.value?.envMetrics?.length) return crop_manual_live.value.envMetrics;
      return crop_manual_pack.value && crop_manual_stage_item.value
        ? crop_manual_metrics(crop_manual_pack.value, crop_manual_stage_item.value)
        : [];
    });
    const crop_manual_guide_list = computed(() => {
      if (crop_manual_live.value?.guideParagraphs?.length) return crop_manual_live.value.guideParagraphs;
      return crop_manual_pack.value && crop_manual_stage_item.value
        ? crop_manual_guide(crop_manual_pack.value, crop_manual_stage_item.value)
        : [];
    });

    const select_crop_manual = (code) => {
      crop_manual_code.value = code;
      const listed = crop_manuals.value.find((item) => item.cropCode === code);
      const pack = (crop_pack_catalog || []).find((item) => item.cropCode === code);
      crop_manual_stage.value = listed?.stages?.[0]?.code || pack?.stages?.[0]?.code || 'seedling';
    };

    const load_crop_manual = async () => {
      try {
        if (!crop_manuals.value.length) crop_manuals.value = await api.getCropManuals();
        if (is_formal_session) {
          crop_manual_live.value = await api.getCropManual(crop_manual_code.value, crop_manual_stage.value);
        } else {
          crop_manual_live.value = null;
        }
        crop_manual_error.value = '';
      } catch (error) {
        crop_manual_error.value = error.message || '培养手册读取失败';
        crop_manual_live.value = null;
      }
    };

    const availability_label = (code) => CROP_MANUAL_AVAILABILITY[code] || '—';
    const similar_cases = computed(() => {
      if (similar_cases_live.value.length) return similar_cases_live.value;
      if (is_formal_session) return [];
      return FARMER_SIMILAR_CASES;
    });
    const active_report = computed(() => {
      const base = FARMER_REPORT_CATALOG[active_report_key.value] || FARMER_REPORT_CATALOG.daily;
      const items = base.items.map(item => item.label === '计划用水'
        ? { ...item, value: `${Number(resource_plan.value?.totalAllocatedLitres ?? resource_plan.value?.totalRequestedLitres ?? 0).toFixed(1)} L`, note: '已确认配水计划口径' }
        : item);
      return { ...base, items, sourceLabel: sourceLabel(base.source), generatedAt: data_updated_label.value };
    });

    const close_sidebar_on_mobile = () => {
      if (typeof window === 'undefined') return;
      const is_mobile = window.innerWidth <= 760
        || (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches);
      if (is_mobile) is_sidebar_open.value = false;
    };

    const handle_sidebar_keydown = (event) => {
      if (event.key === 'Escape' && is_sidebar_open.value) close_sidebar_on_mobile();
    };
    onMounted(() => window.addEventListener('keydown', handle_sidebar_keydown));
    onBeforeUnmount(() => window.removeEventListener('keydown', handle_sidebar_keydown));

    const navigate = (view_id, { sync_hash = true, tab } = {}) => {
      const next_view = FARMER_VIEWS.includes(view_id) ? view_id : 'dashboard';
      current_view.value = next_view;
      close_sidebar_on_mobile();
      if (next_view === 'tools' && tab) tools_tab.value = parse_tools_tab(`#tools/${tab}`);
      if (sync_hash) {
        const target = farmer_hash_for(next_view, tools_tab.value);
        if (window.location.hash !== target) {
          window.location.hash = target.slice(1);
        }
      }
      if (next_view !== 'messages') {
        selected_message.value = null;
        analysis_result.value = '';
        analysis_error.value = '';
      }
      if (next_view !== 'tasks') {
        selected_task.value = null;
      }
      if (next_view !== 'plots') {
        selected_plot.value = null;
      } else if (!selected_plot.value) {
        selected_plot.value = plots.value[0] || null;
      }
      if (next_view !== 'inspections') {
        show_inspection_form.value = false;
        show_evidence_form.value = false;
      }
    };

    const apply_farmer_hash = () => {
      const view = parse_farmer_hash();
      const tab = parse_tools_tab();
      if (view === current_view.value && (view !== 'tools' || tab === tools_tab.value)) return;
      navigate(view, { sync_hash: false, tab });
    };

    const toggle_sidebar = () => { is_sidebar_open.value = !is_sidebar_open.value; };
    const toggle_profile_menu = () => { show_profile_menu.value = !show_profile_menu.value; };
    const close_profile_menu = () => { show_profile_menu.value = false; };

    const open_report = (reportKey) => {
      active_report_key.value = FARMER_REPORT_CATALOG[reportKey] ? reportKey : 'daily';
      close_profile_menu();
      show_report_modal.value = true;
    };

    const close_report = () => { show_report_modal.value = false; };

    const toggle_report_subscription = () => {
      report_subscribed.value = !report_subscribed.value;
      localStorage.setItem('agriloop-farmer-weekly-report', String(report_subscribed.value));
      show_toast(report_subscribed.value ? '已开启本机周报提醒（演示）' : '已关闭本机周报提醒');
    };

    const update_user_setting = (key, value) => {
      const patch = key === 'accent' ? { [key]: value, customAccent: '' } : { [key]: value };
      const next = saveUserSettings({ ...user_settings.value, ...patch }, undefined, user.value);
      user_settings.value = next;
      applyUserSettings(next);
      is_dark.value = resolveTheme(next.theme) === 'dark';
      if (['autoRefresh', 'refreshInterval'].includes(key) && typeof start_live_polling === 'function') {
        start_live_polling();
      }
    };

    const reset_user_settings = () => {
      const next = saveUserSettings(DEFAULT_USER_SETTINGS, undefined, user.value);
      user_settings.value = next;
      applyUserSettings(next);
      is_dark.value = resolveTheme(next.theme) === 'dark';
      if (typeof start_live_polling === 'function') start_live_polling();
    };

    const toggle_theme = () => {
      const current = resolveTheme(user_settings.value.theme);
      update_user_setting('theme', current === 'dark' ? 'light' : 'dark');
    };

    const logout = () => {
      api.clearSession();
      window.location.replace('login.html');
    };

    const status_label = (status) => STATUS_LABELS[status] || workStatusLabel(status);
    const priority_label = (priority) => PRIORITY_LABELS[priority] || (String(priority || '').toUpperCase() === 'CRITICAL' ? '紧急' : priority || '普通');
    const category_label = (category) => CATEGORY_LABELS[category] || sourceLabel(category, '系统');
    const source_label = (value) => sourceLabel(value, '—');
    const device_status_label = (value) => genericStatusLabel(value, '状态未知');
    const metric_label = (value, fallback = '未知指标') => metricLabel(value, fallback);
    const metric_status_label = (value) => metricStatusLabel(value, '未知');
    const request_status_label = (value) => status_label(value);
    const scenario_label = (value) => scenarioLabel(value, '未设置');
    const alert_level_label = (level) => ALERT_LEVEL_LABELS[String(level || '').toUpperCase()] || level || '—';
    const alert_status_label = (status) => ALERT_STATUS_LABELS[String(status || '').toUpperCase()] || '—';

    const message_actions = (msg) => {
      if (!msg) return [];
      if (msg.category === 'task') {
        return [{ id: 'task', label: '查看关联任务', icon: 'task' }];
      }
      if (msg.category === 'alert') {
        const actions = [];
        if (msg.linkedWorkOrderId) actions.push({ id: 'task', label: '查看关联任务', icon: 'task' });
        const source = String(msg.alertSource || '').toUpperCase();
        const textBlob = `${msg.title} ${msg.snippet}`;
        if (source.includes('SOIL') || source.includes('WATER') || /缺水|湿度|灌溉|干旱/.test(textBlob)) {
          actions.push({ id: 'irrigation', label: '查看灌溉建议', icon: 'water_drop' });
        }
        if (source.includes('DEVICE') || /设备|心跳|流量|离线/.test(textBlob)) {
          actions.push({ id: 'inspection', label: '申请设备检查', icon: 'fact_check' });
        }
        actions.push({ id: 'plot', label: '查看地块详情', icon: 'grass' });
        return actions;
      }
      if (['notice', 'system'].includes(msg.category)) {
        return [{ id: 'inspections', label: '查看巡田记录', icon: 'history' }];
      }
      return [];
    };

    const handle_message_action = async (msg, actionId) => {
      if (!msg) return;
      mark_read(msg);
      const plotId = msg.plotId || plots.value[0]?.plotId;
      if (actionId === 'task') {
        const taskId = msg.linkedWorkOrderId || msg.workOrderId;
        const task = farmer_visible_tasks.value.find((item) => (
          item.id === taskId || item.workOrderId === taskId
        ));
        navigate('tasks');
        if (task) open_task(task);
        else show_toast('关联任务暂未同步到今日农务，请稍后刷新', 'error');
        return;
      }
      if (actionId === 'irrigation') {
        if (plotId) select_advice_plot(plotId);
        navigate('advice');
        open_suggestion('IRRIGATION', {
          plotId,
          title: `${find_plot_by_id(plots.value, plotId)?.name || '当前地块'}补水建议`,
          reason: msg.snippet || msg.body_paragraphs?.[0] || '请结合告警说明核对是否需要补水。'
        });
        return;
      }
      if (actionId === 'inspection') {
        navigate('inspections');
        open_evidence_form(plotId);
        return;
      }
      if (actionId === 'plot') {
        const plot = find_plot_by_id(plots.value, plotId);
        navigate('plots');
        if (plot) open_plot(plot);
        return;
      }
      if (actionId === 'inspections') {
        navigate('inspections');
      }
    };
    const crop_icon = (crop_code) => CROP_ICONS[crop_code] || '🌱';
    const plot_band_status = (plot) => resolve_moisture_band_status(plot);
    const plot_band_label = (plot) => BAND_STATUS_LABELS[resolve_moisture_band_status(plot)] || '正常';
    const metric_status_of = (plot, code, metric) => {
      if (metric?.available === false || metric?.value === null || metric?.value === undefined) return 'UNAVAILABLE';
      return code === 'SOIL_MOISTURE' ? resolve_moisture_band_status(plot) : (metric?.status || 'NORMAL');
    };
    const health_score = (plot) => health_breakdown(plot).score;
    const health_level_label = (plot) => health_level(health_score(plot), plot);
    const health_summary = (plot) => {
      const breakdown = health_breakdown(plot);
      return `指标 ${Math.round(breakdown.metricScore * 100)} · 设备 ${Math.round(breakdown.deviceScore * 100)} · 风险 ${Math.round(breakdown.riskScore * 100)}；${health_level_label(plot)}`;
    };
    const health_ring_style = (plot) => {
      const score = Math.round(health_score(plot) * 100);
      const band = resolve_moisture_band_status(plot);
      const color = band === 'ALERT'
        ? 'var(--g-danger)'
        : (band === 'WARN' ? 'var(--g-warning)' : 'var(--g-success)');
      return { background: `conic-gradient(${color} ${score}%, var(--g-border-subtle) 0)` };
    };
    const format_record_time = (iso) => format_relative_label(iso) || '刚刚';
    const soil_surface_label = (code) => ({ DRY: '偏干', NORMAL: '正常', WET: '偏湿' }[code] || '—');
    const crop_condition_label = (code) => ({
      HEALTHY: '长势正常',
      LEAF_SLIGHT_WILT: '叶片轻微萎蔫',
      PEST_SUSPECTED: '疑似病虫害'
    }[code] || (code ? '其他长势' : '—'));
    const evidence_type_label = (code) => ({
      FIELD_INSPECTION: '现场巡田',
      RETEST: '传感器复测',
      DEVICE_CHECK: '设备检查'
    }[code] || (code ? '其他证据' : '—'));
    const find_plot_name = (plot_id) => find_plot_by_id(plots.value, plot_id)?.name || plot_id || '—';

    const replace_ref_array = (target, values) => {
      target.value.splice(0, target.value.length, ...(Array.isArray(values) ? values : []));
    };

    const plot_metrics = (plot) => orderedPlotMetrics(plot);
    const metric_value = (metric) => plotMetricValue(metric);
    const plot_order_of = (items) => (Array.isArray(items) ? items : [])
      .map((plot) => String(plot?.plotId || '').trim())
      .filter(Boolean);
    const ordered_plot_values = (items) => {
      const visualOrder = plot_drag_state.value.active ? plot_order_of(plots.value) : plot_order_ids.value;
      return reconcilePlotOrder(items, visualOrder);
    };
    const replace_plots_in_order = (items, { commitOrder = true } = {}) => {
      const ordered = ordered_plot_values(items);
      if (commitOrder) plot_order_ids.value = plot_order_of(ordered);
      replace_ref_array(plots, ordered);
      return ordered;
    };

    let plot_order_request_version = 0;
    let plot_drag_element = null;
    let plot_click_suppress_timer = null;
    const schedule_plot_click_suppression_reset = () => {
      if (plot_click_suppress_timer !== null) window.clearTimeout(plot_click_suppress_timer);
      plot_click_suppress_timer = window.setTimeout(() => {
        plot_click_suppress_timer = null;
        if (!plot_drag_state.value.active) plot_drag_state.value.suppressClick = false;
      }, 500);
    };
    const clear_plot_drag_timer = () => {
      const timer = plot_drag_state.value.longPressTimer;
      if (timer !== null) window.clearTimeout(timer);
      plot_drag_state.value.longPressTimer = null;
    };
    const reset_plot_drag_state = ({ suppressClick = false } = {}) => {
      plot_drag_state.value = {
        active: false,
        pointerId: null,
        sourceIndex: -1,
        targetIndex: -1,
        startX: 0,
        startY: 0,
        longPressTimer: null,
        movedBeforeActivation: false,
        suppressClick,
        snapshot: [],
        dragPlotId: '',
        dropTargetId: ''
      };
    };
    const restore_plot_order = (order) => {
      const ordered = reconcilePlotOrder(plots.value, order);
      plot_order_ids.value = plot_order_of(ordered);
      replace_ref_array(plots, ordered);
      return ordered;
    };
    const load_plot_order_preference = async ({ announce = false } = {}) => {
      if (plot_order_loaded.value) return true;
      const requestVersion = ++plot_order_request_version;
      try {
        const preference = await api.getFarmerWorkspacePreference();
        if (requestVersion !== plot_order_request_version) return false;
        plot_order_revision.value = Number(preference?.revision || 0);
        const ordered = reconcilePlotOrder(plots.value, preference?.plotOrder || []);
        plot_order_ids.value = plot_order_of(ordered);
        replace_ref_array(plots, ordered);
        plot_order_error.value = '';
        return true;
      } catch (error) {
        if (requestVersion !== plot_order_request_version) return false;
        plot_order_error.value = error?.message || '地块顺序暂未同步';
        if (announce) show_toast(`地块顺序暂未同步：${plot_order_error.value}`, 'error');
        // Keep a deterministic local order and let an explicit drag surface
        // the persistence error instead of blocking the farmer workspace.
        const ordered = reconcilePlotOrder(plots.value, plot_order_ids.value);
        plot_order_ids.value = plot_order_of(ordered);
        replace_ref_array(plots, ordered);
        return false;
      } finally {
        if (requestVersion === plot_order_request_version) plot_order_loaded.value = true;
      }
    };
    const save_plot_order = async (nextOrder, previousOrder) => {
      plot_order_busy.value = true;
      try {
        const saved = await api.saveFarmerWorkspacePreference(nextOrder, plot_order_revision.value);
        plot_order_revision.value = Number(saved?.revision || plot_order_revision.value + 1);
        const ordered = reconcilePlotOrder(plots.value, saved?.plotOrder || nextOrder);
        plot_order_ids.value = plot_order_of(ordered);
        replace_ref_array(plots, ordered);
        plot_order_error.value = '';
        show_toast('地块排列已保存', 'success');
        return true;
      } catch (error) {
        if (error?.code === 'FARMER_WORKSPACE_PREFERENCE_CONFLICT') {
          try {
            const latest = await api.getFarmerWorkspacePreference();
            plot_order_revision.value = Number(latest?.revision || 0);
            restore_plot_order(latest?.plotOrder || previousOrder);
            show_toast('其他设备已更新地块顺序，页面已同步最新排列', 'error');
          } catch (refreshError) {
            restore_plot_order(previousOrder);
            show_toast(`地块顺序冲突，恢复原排列失败：${refreshError?.message || '请刷新页面'}`, 'error');
          }
        } else {
          restore_plot_order(previousOrder);
          show_toast(`地块排列保存失败：${error?.message || '请稍后重试'}`, 'error');
        }
        return false;
      } finally {
        plot_order_busy.value = false;
      }
    };
    const plot_index_at_point = (clientX, clientY) => {
      const elements = document.elementsFromPoint?.(clientX, clientY)
        || [document.elementFromPoint(clientX, clientY)];
      const draggingId = String(plot_drag_state.value.dragPlotId || '');
      const card = elements.map((element) => element?.closest?.('[data-farmer-plot-id]'))
        .find((candidate) => candidate && String(candidate.dataset?.farmerPlotId || '') !== draggingId);
      const plotId = String(card?.dataset?.farmerPlotId || '').trim();
      if (!plotId) return -1;
      return plots.value.findIndex((plot) => String(plot.plotId) === plotId);
    };
    const activate_plot_drag = () => {
      const state = plot_drag_state.value;
      if (state.pointerId === null || state.movedBeforeActivation || state.active) return;
      state.active = true;
      state.targetIndex = state.sourceIndex;
      state.dragPlotId = String(plots.value[state.sourceIndex]?.plotId || '');
      state.dropTargetId = '';
      document.body.classList.add('farmer-plot-dragging');
      plot_drag_element?.setPointerCapture?.(state.pointerId);
    };
    const remove_plot_drag_listeners = () => {
      window.removeEventListener('pointermove', handle_plot_pointer_move);
      window.removeEventListener('pointerup', handle_plot_pointer_up);
      window.removeEventListener('pointercancel', cancel_plot_drag);
    };
    const finish_plot_drag = ({ suppressClick = false } = {}) => {
      clear_plot_drag_timer();
      remove_plot_drag_listeners();
      if (plot_drag_element && plot_drag_state.value.pointerId !== null) {
        try { plot_drag_element.releasePointerCapture?.(plot_drag_state.value.pointerId); } catch { /* pointer already released */ }
      }
      document.body.classList.remove('farmer-plot-dragging');
      plot_drag_element = null;
      reset_plot_drag_state({ suppressClick });
    };
    const handle_plot_pointer_move = (event) => {
      const state = plot_drag_state.value;
      if (state.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.active) {
        if (distance > 8) {
          state.movedBeforeActivation = true;
          clear_plot_drag_timer();
        }
        return;
      }
      event.preventDefault();
      const targetIndex = plot_index_at_point(event.clientX, event.clientY);
      if (targetIndex < 0 || targetIndex === state.sourceIndex) {
        state.targetIndex = state.sourceIndex;
        state.dropTargetId = '';
        return;
      }
      const targetId = String(plots.value[targetIndex]?.plotId || '');
      state.targetIndex = targetIndex;
      state.dropTargetId = targetId;
    };
    const move_plot_to_index = (items, sourceIndex, targetIndex) => {
      const next = Array.isArray(items) ? items.slice() : [];
      if (sourceIndex < 0 || sourceIndex >= next.length || targetIndex < 0 || targetIndex >= next.length || sourceIndex === targetIndex) return next;
      const [dragged] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, dragged);
      return next;
    };
    const handle_plot_pointer_up = async (event) => {
      const state = plot_drag_state.value;
      if (state.pointerId !== event.pointerId) return;
      const wasActive = state.active;
      const previousOrder = state.snapshot.slice();
      const nextPlots = wasActive ? move_plot_to_index(plots.value, state.sourceIndex, state.targetIndex) : plots.value;
      const nextOrder = plot_order_of(nextPlots);
      const changed = nextOrder.join('\u0001') !== previousOrder.join('\u0001');
      if (wasActive && changed) replace_ref_array(plots, nextPlots);
      finish_plot_drag({ suppressClick: wasActive });
      if (wasActive) schedule_plot_click_suppression_reset();
      if (!wasActive || !changed) return;
      await save_plot_order(nextOrder, previousOrder);
    };
    const cancel_plot_drag = () => {
      const state = plot_drag_state.value;
      if (state.pointerId === null && !state.active) return;
      const previousOrder = state.snapshot.slice();
      const wasActive = state.active;
      finish_plot_drag({ suppressClick: wasActive });
      if (wasActive) schedule_plot_click_suppression_reset();
      if (wasActive && previousOrder.length) restore_plot_order(previousOrder);
    };
    const handle_plot_pointer_down = (event, plot, index) => {
      if (plot_order_busy.value || plot_drag_state.value.pointerId !== null) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      plot_drag_element = event.currentTarget;
      plot_drag_state.value = {
        active: false,
        pointerId: event.pointerId,
        sourceIndex: index,
        targetIndex: index,
        startX: event.clientX,
        startY: event.clientY,
        longPressTimer: null,
        movedBeforeActivation: false,
        suppressClick: false,
        snapshot: plot_order_of(plots.value),
        dragPlotId: String(plot?.plotId || ''),
        dropTargetId: ''
      };
      window.addEventListener('pointermove', handle_plot_pointer_move, { passive: false });
      window.addEventListener('pointerup', handle_plot_pointer_up);
      window.addEventListener('pointercancel', cancel_plot_drag);
      plot_drag_state.value.longPressTimer = window.setTimeout(activate_plot_drag, 400);
    };
    const handle_plot_card_click = (plot) => {
      if (plot_drag_state.value.suppressClick) {
        plot_drag_state.value.suppressClick = false;
        return;
      }
      open_plot(plot);
    };

    const task_identity = (task) => String(task?.workOrderId || task?.id || '').trim();
    const find_task_by_identity = (collection, target) => {
      const identity = task_identity(target);
      if (!identity) return null;
      return (Array.isArray(collection) ? collection : []).find((item) => task_identity(item) === identity) || null;
    };
    const enrich_task = (task) => {
      if (!task) return task;
      const enriched = { ...task };
      if (task.plot_id) {
        const plot = find_plot_by_id(plots.value, task.plot_id);
        if (plot) {
          enriched.plot = {
            plotId: plot.plotId,
            name: plot.name,
            crop_name: plot.cropName,
            crop_variety: plot.cropVariety,
            stage_label: plot.stageLabel,
            cultivation_status_label: plot.cultivationStatusLabel || '正常种植',
            facility_label: plot.facilityLabel || '露地（裸地）',
            device_status: plot.deviceStatus,
            metrics: plot.metrics
          };
        }
      }
      return enriched;
    };
    const sync_task_references = (nextTasks = tasks.value) => {
      const refresh = (current) => {
        const latest = find_task_by_identity(nextTasks, current);
        return latest ? enrich_task(latest) : current;
      };
      if (selected_task.value) selected_task.value = refresh(selected_task.value);
      if (active_suggestion.value?.task) {
        active_suggestion.value = { ...active_suggestion.value, task: refresh(active_suggestion.value.task) };
      }
      if (issue_report_task.value) issue_report_task.value = refresh(issue_report_task.value);
    };
    const patch_task_state = (task, changes = {}) => {
      const source = find_task_by_identity(tasks.value, task);
      if (source) Object.assign(source, changes);
      if (task && typeof task === 'object') Object.assign(task, changes);
      sync_task_references();
      return source || task;
    };

    const message_fingerprint = (list) => (Array.isArray(list) ? list : [])
      .map((message) => [message.id, message.read ? 1 : 0, message.title, message.snippet, message.time_iso].join('\u0001'))
      .join('\n');

    const apply_messages = (nextMessages) => {
      const incoming = (Array.isArray(nextMessages) ? nextMessages : []).filter((message) => !deleted_message_ids.value.has(message.id));
      const readState = new Map(messages.value.map((message) => [message.id, Boolean(message.read)]));
      incoming.forEach((message) => {
        if (readState.has(message.id)) message.read = readState.get(message.id);
      });
      if (message_fingerprint(messages.value) === message_fingerprint(incoming)) {
        // Keep object identity so the message center does not flicker while
        // telemetry keeps the rest of the workspace fresh.
        return false;
      }
      replace_ref_array(messages, incoming);
      if (selected_message.value?.id) {
        selected_message.value = messages.value.find((message) => message.id === selected_message.value.id) || null;
      }
      return true;
    };

    const telemetry_refresh_targets = (sourcePlots) => {
      const source = Array.isArray(sourcePlots) ? sourcePlots : [];
      const ids = new Set([selected_plot.value?.plotId].filter(Boolean));
      if (current_view.value === 'advice') ids.add(advice_selected_plot.value?.plotId);
      if (current_view.value === 'tools' && tools_tab.value === 'risk') ids.add(risk_tool_plot_id.value);
      if (!ids.size && source[0]?.plotId) ids.add(source[0].plotId);
      const matches = source.filter((plot) => ids.has(plot.plotId));
      return matches.length ? matches : source.slice(0, 1);
    };

    const CORE_REQUEST_BUDGET_MS = 2200;
    const settleCoreRequest = (promise, timeoutMs = CORE_REQUEST_BUDGET_MS) => {
      const operation = Promise.resolve(promise).then(
        value => ({ status: 'fulfilled', value }),
        reason => ({ status: 'rejected', reason })
      );
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return operation;
      let timer = null;
      const timeout = new Promise(resolve => {
        timer = window.setTimeout(() => resolve({ status: 'timeout' }), timeoutMs);
      });
      return Promise.race([operation, timeout]).finally(() => {
        if (timer !== null) window.clearTimeout(timer);
      });
    };

    const refresh_plot_telemetry = async () => {
      if (!is_formal_session || !plots.value.length) return false;
      const snapshot = plots.value.slice();
      const targets = telemetry_refresh_targets(snapshot);
      const telemetryResults = await Promise.allSettled(targets.map((plot) => api.getPlotTelemetryAll(plot.plotId, 120)));
      if (!plots.value.length) return false;
      const refreshed = new Map(targets.map((plot, index) => {
        const result = telemetryResults[index];
        if (result?.status !== 'fulfilled') return [plot.plotId, plot];
        const merged = mergePlotTelemetryWindow(plot, result.value || []);
        return [plot.plotId, { ...merged, healthScore: compute_plot_health_score(merged) }];
      }));
      const nextPlots = snapshot.map((plot) => refreshed.get(plot.plotId) || plot);
      // Preserve references when the farmer is reading messages; only swap plots.
      replace_ref_array(plots, nextPlots);
      selected_plot.value = nextPlots.find((plot) => plot.plotId === selected_plot.value?.plotId) || nextPlots[0] || null;
      advice_selected_plot.value = nextPlots.find((plot) => plot.plotId === advice_selected_plot.value?.plotId) || nextPlots[0] || null;
      if (!qa_plot_id.value || !nextPlots.some((plot) => plot.plotId === qa_plot_id.value)) {
        qa_plot_id.value = nextPlots[0]?.plotId || '';
      }
      data_updated_label.value = '刚刚';
      return true;
    };

    // The farmer page needs only the current farm, plot cards, tasks and
    // alerts to become useful.  Keep this pass independent from crop manuals,
    // resource plans and inspection history; those endpoints are reconciled by
    // the existing full loader after the first paint.
    const load_live_workspace_core = async ({ announce = false, trackProgress = false } = {}) => {
      if (!is_formal_session) return false;
      const version = ++workspace_request_version;
      const showProgress = Boolean(trackProgress || announce || bootstrap_loading.value);
      if (showProgress) begin_workspace_progress('正在读取农场与地块…');
      const jobs = [
        api.getFarms(),
        api.getPlots({ includeInactive: true }),
        api.getOverview(),
        api.getWorkOrders(),
        api.getTodayWorkItems(),
        api.getAlerts()
      ];
      const results = await Promise.all(jobs.map((promise) => settleCoreRequest(promise)));
      if (version !== workspace_request_version) return false;
      const authFailure = results.find((result) => result.status === 'rejected'
        && (result.reason?.status === 401 || result.reason?.code === 'AUTH_REQUIRED' || result.reason?.code === 'AUTH_INVALID'));
      if (authFailure) {
        const error = authFailure.reason;
        if (error?.status === 401 || error?.code === 'AUTH_REQUIRED' || error?.code === 'AUTH_INVALID') {
          api.clearSession();
          window.location.replace('login.html?reason=session_expired');
          return false;
        }
      }
      const coreIndexes = [0, 1, 2, 3, 5];
      const hasCoreData = coreIndexes.some((index) => results[index]?.status === 'fulfilled');
      if (!hasCoreData) {
        const error = results.find((result) => result.status === 'rejected')?.reason;
        load_error.value = error?.message || '正式数据读取失败';
        if (announce) show_toast(`正式农户数据读取失败：${load_error.value}`, 'error');
        return false;
      }
      const farms = results[0].status === 'fulfilled' ? results[0].value || [] : [];
      const rawPlots = results[1].status === 'fulfilled' ? results[1].value || plots.value || [] : plots.value || [];
      const overview = results[2].status === 'fulfilled' ? results[2].value || {} : {};
      const rawWorkOrders = mergeFarmerWorkOrders(
        results[3].status === 'fulfilled' ? results[3].value || [] : tasks.value || [],
        results[4].status === 'fulfilled' ? results[4].value || [] : []
      );
      const rawAlerts = results[5].status === 'fulfilled' ? results[5].value || [] : [];
      const farmId = session_user?.farmIds?.find((id) => id !== '*') || farms[0]?.farmId || '';
      const selectedFarm = farms.find((item) => item.farmId === farmId) || farms[0] || {};
      const cards = new Map((overview?.plots || []).map((card) => [String(card.plotId), card]));
      let normalizedPlots = rawPlots
        .map((plot) => {
          const normalized = normalizePlot(plot, cards.get(String(plot.plotId)) || {});
          return { ...normalized, healthScore: compute_plot_health_score(normalized) };
        })
        .filter((plot) => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');
      normalizedPlots = replace_plots_in_order(normalizedPlots, { commitOrder: !plot_drag_state.value.active });
      const plotMap = new Map(normalizedPlots.map((plot) => [String(plot.plotId), plot]));
      const normalizedTasks = rawWorkOrders.map((work) => normalizeFarmerTask(work, plotMap));
      const records = (inspection_records.value || []).map((record) => ({
        ...record,
        plotName: plotMap.get(String(record.plotId))?.name || record.plotId
      }));
      const nextMessages = buildFarmerMessages({ alerts: rawAlerts, tasks: normalizedTasks, inspections: records, plots: normalizedPlots });
      const profile = buildFarmerProfile({ user: user.value, farm: selectedFarm, plots: normalizedPlots, tasks: normalizedTasks, inspections: records, messages: nextMessages });
      farm.value = selectedFarm;
      replace_ref_array(plots, normalizedPlots);
      replace_ref_array(tasks, normalizedTasks);
      sync_task_references(normalizedTasks);
      apply_messages(nextMessages);
      replace_ref_array(inspection_records, records);
      evidence_requests.value = normalizedTasks
        .filter((task) => String(task.sourceType || '').toUpperCase() === 'READINESS')
        .map((task) => ({
          id: task.workOrderId || task.id,
          plotId: task.plot_id,
          type: task.evidenceType || 'FIELD_INSPECTION',
          reason: task.reason,
          status: task.status,
          createdAt: task.created_iso,
          requesterId: task.requesterId || task.createdBy,
          requesterName: task.requesterName || task.createdBy,
          dataOrigin: 'BACKEND'
        }));
      user.value = {
        ...user.value,
        displayName: profile.displayName,
        role_label: user.value.roleLabel || profile.role_label,
        plot_names: profile.plot_names,
        total_done: profile.total_done,
        month_done: profile.month_done,
        completion_rate: profile.completion_rate
      };
      selected_plot.value = normalizedPlots.find((plot) => plot.plotId === selected_plot.value?.plotId) || normalizedPlots[0] || null;
      advice_selected_plot.value = normalizedPlots.find((plot) => plot.plotId === advice_selected_plot.value?.plotId) || normalizedPlots[0] || null;
      if (!qa_plot_id.value || !normalizedPlots.some((plot) => plot.plotId === qa_plot_id.value)) qa_plot_id.value = normalizedPlots[0]?.plotId || '';
      if (!inspection_form.value.plot_id || !plotMap.has(inspection_form.value.plot_id)) inspection_form.value.plot_id = normalizedPlots[0]?.plotId || '';
      if (!evidence_form.value.plot_id || !plotMap.has(evidence_form.value.plot_id)) evidence_form.value.plot_id = normalizedPlots[0]?.plotId || '';
      data_updated_label.value = '刚刚';
      if (showProgress) set_workspace_progress(86, '正在完成首屏…');
      return true;
    };

    const load_live_workspace = async ({ announce = false, trackProgress = false } = {}) => {
      if (!is_formal_session) return false;
      const version = ++workspace_request_version;
      load_error.value = '';
      operation_record_load_error.value = '';
      const showProgress = Boolean(trackProgress || announce || bootstrap_loading.value);
      if (showProgress) begin_workspace_progress('正在读取农场与地块…');
      try {
        if (showProgress) set_workspace_progress(18, '正在读取农场、任务与告警…');
        const results = await Promise.allSettled([
          api.getFarms(),
          api.getPlots({ includeInactive: true }),
          api.getOverview(),
          api.getWorkOrders(),
          api.getTodayWorkItems(),
          api.getAlerts(),
          api.getCropPacks(),
          api.getCropBatches(),
          api.getWaterResourceProfile(),
          api.listResourcePlans({}),
          api.listResourceRequests({}),
          api.getSystemStatus()
        ]);
        const coreFailure = [0, 1, 2, 3, 5]
          .map((index) => ({ index, result: results[index] }))
          .find(({ result }) => result.status === 'rejected');
        if (coreFailure) {
          if (coreFailure.index === 3) operation_record_load_error.value = coreFailure.result.reason?.message || '巡田记录和补证申请读取失败';
          throw coreFailure.result.reason;
        }
        const [farmsResult, plotsResult, overviewResult, workOrdersResult, todayWorkResult, alertsResult, packsResult, batchesResult, resourceProfileResult, resourcePlansResult, resourceRequestsResult, systemStatusResult] = results;
        const farms = farmsResult.value || [];
        const rawPlots = plotsResult.value || [];
        const overview = overviewResult.value || {};
        const rawWorkOrders = mergeFarmerWorkOrders(
          workOrdersResult.value || [],
          todayWorkResult.status === 'fulfilled' ? todayWorkResult.value || [] : []
        );
        const rawAlerts = alertsResult.value || [];
        const packs = packsResult.status === 'fulfilled' ? packsResult.value || [] : [];
        const batches = batchesResult.status === 'fulfilled' ? batchesResult.value || [] : [];
        const optionalFailures = [packsResult, batchesResult, resourceProfileResult, resourcePlansResult, resourceRequestsResult, systemStatusResult]
          .filter((result) => result.status === 'rejected');
        if (optionalFailures.length) load_error.value = '作物包或种植批次暂不可用，已显示其余正式数据';
        resource_persistence_status.value = String(systemStatusResult.status === 'fulfilled' ? systemStatusResult.value?.persistence || 'UNKNOWN' : 'UNKNOWN').toUpperCase();
        if (resourceProfileResult.status === 'fulfilled' || resourcePlansResult.status === 'fulfilled') {
          const waterProfile = resourceProfileResult.status === 'fulfilled' ? resourceProfileResult.value : null;
          const planList = resourcePlansResult.status === 'fulfilled' ? resourcePlansResult.value : [];
          resource_plan.value = planList.find((plan) => ['CONFIRMED', 'RUNNING', 'COMPLETED', 'PARTIAL'].includes(String(plan.status || '').toUpperCase())) || planList.find((plan) => plan.status === 'DRAFT') || (waterProfile ? { allocations: [], waterProfile } : null);
        }
        if (version !== workspace_request_version) return false;
        if (resourceRequestsResult.status === 'fulfilled') resource_requests.value = resourceRequestsResult.value || [];
        crop_pack_catalog = Array.isArray(packs) ? packs : [];
        const farmId = session_user?.farmIds?.find((id) => id !== '*') || farms[0]?.farmId || '';
        const selectedFarm = farms.find((item) => item.farmId === farmId) || farms[0] || {};
        const cards = new Map((overview?.plots || []).map((card) => [String(card.plotId), card]));
        const batchMap = new Map((batches || []).map((batch) => [String(batch.plotId), batch]));
        let normalizedPlots = (rawPlots || [])
          .map((plot) => {
            const batch = batchMap.get(String(plot.plotId)) || {};
            const normalized = normalizePlot({
              ...plot,
              stageCode: plot.stageCode || batch.stageCode,
              stageLabel: plot.stageLabel || batch.stageLabel,
              cropPackVersion: plot.cropPackVersion || batch.cropPackVersion
            }, cards.get(String(plot.plotId)) || {});
            return { ...normalized, healthScore: compute_plot_health_score(normalized) };
          })
          .filter((plot) => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');
        if (showProgress) set_workspace_progress(52, '正在同步地块遥测…');
        // The overview already contains each plot's latest values. Blocking
        // the first screen on one 120-point history request per plot turned a
        // 20-plot farm into several browser connection batches. Load only the
        // active plot's chart window now; other plots load when selected.
        const initialTelemetryTargets = telemetry_refresh_targets(normalizedPlots);
        const telemetryResults = await Promise.allSettled(initialTelemetryTargets.map((plot) => api.getPlotTelemetryAll(plot.plotId, 120)));
        const telemetryByPlot = new Map(initialTelemetryTargets.map((plot, index) => [plot.plotId, telemetryResults[index]]));
        normalizedPlots = normalizedPlots.map((plot) => {
          const result = telemetryByPlot.get(plot.plotId);
          if (result?.status !== 'fulfilled') return plot;
          const merged = mergePlotTelemetryWindow(plot, result.value || []);
          return { ...merged, healthScore: compute_plot_health_score(merged) };
        });
        const orderedNormalizedPlots = replace_plots_in_order(normalizedPlots, { commitOrder: !plot_drag_state.value.active });
        normalizedPlots = orderedNormalizedPlots;
        if (showProgress) set_workspace_progress(78, '正在整理巡田与消息…');
        const plotMap = new Map(normalizedPlots.map((plot) => [String(plot.plotId), plot]));
        const normalizedTasks = (rawWorkOrders || []).map((work) => normalizeFarmerTask(work, plotMap));
        const inspectionResult = await Promise.allSettled([api.getInspections()]);
        const inspectionSucceeded = inspectionResult[0]?.status === 'fulfilled';
        const sourceRecords = inspectionSucceeded ? inspectionResult[0].value || [] : inspection_records.value;
        const records = Array.from(new Map(sourceRecords.map((record) => [record.inspectionId, {
          ...record,
          plotName: plotMap.get(String(record.plotId))?.name || record.plotId
        }])).values()).sort((a, b) => new Date(b.observedAt || b.createdAt || 0) - new Date(a.observedAt || a.createdAt || 0));
        if (inspectionSucceeded) operation_record_load_error.value = '';
        else operation_record_load_error.value = inspectionResult[0]?.reason?.message || '巡田记录读取失败，已保留已有记录';
        const nextMessages = buildFarmerMessages({ alerts: rawAlerts, tasks: normalizedTasks, inspections: records, plots: normalizedPlots });
        const profile = buildFarmerProfile({ user: user.value, farm: selectedFarm, plots: normalizedPlots, tasks: normalizedTasks, inspections: records, messages: nextMessages });
        farm.value = selectedFarm;
        replace_ref_array(plots, normalizedPlots);
        replace_ref_array(tasks, normalizedTasks);
        // Reloads replace the task array in place. Rebind every open dialog and
        // suggestion flow to the fresh backend object so stale statuses cannot
        // leave an executable button visible after START/SUBMIT.
        sync_task_references(normalizedTasks);
        apply_messages(nextMessages);
        replace_ref_array(inspection_records, records);
        evidence_requests.value = normalizedTasks.filter((task) => String(task.sourceType || '').toUpperCase() === 'READINESS').map((task) => ({
          id: task.workOrderId || task.id,
          plotId: task.plot_id,
          type: task.evidenceType || 'FIELD_INSPECTION',
          reason: task.reason,
          status: task.status,
          createdAt: task.created_iso,
          requesterId: task.requesterId || task.createdBy,
          requesterName: task.requesterName || task.createdBy,
          dataOrigin: 'BACKEND'
        }));
        user.value = {
          ...user.value,
          displayName: profile.displayName,
          role_label: user.value.roleLabel || profile.role_label,
          plot_names: profile.plot_names,
          total_done: profile.total_done,
          month_done: profile.month_done,
          completion_rate: profile.completion_rate
        };
        selected_plot.value = orderedNormalizedPlots.find((plot) => plot.plotId === selected_plot.value?.plotId) || orderedNormalizedPlots[0] || null;
        advice_selected_plot.value = orderedNormalizedPlots.find((plot) => plot.plotId === advice_selected_plot.value?.plotId) || orderedNormalizedPlots[0] || null;
        if (!qa_plot_id.value || !orderedNormalizedPlots.some((plot) => plot.plotId === qa_plot_id.value)) {
          qa_plot_id.value = orderedNormalizedPlots[0]?.plotId || '';
        }
        if (!crop_manual_code.value && (normalizedPlots[0]?.cropCode || crop_pack_catalog[0]?.cropCode)) {
          crop_manual_code.value = normalizedPlots[0]?.cropCode || crop_pack_catalog[0]?.cropCode;
        }
        if (!inspection_form.value.plot_id || !plotMap.has(inspection_form.value.plot_id)) inspection_form.value.plot_id = normalizedPlots[0]?.plotId || '';
        if (!evidence_form.value.plot_id || !plotMap.has(evidence_form.value.plot_id)) evidence_form.value.plot_id = normalizedPlots[0]?.plotId || '';
        data_updated_label.value = '刚刚';
        if (showProgress) set_workspace_progress(94, '正在完成工作台初始化…');
        return true;
      } catch (error) {
        if (version !== workspace_request_version) return false;
        // 会话已失效（token 过期、后端内存库重启导致账号丢失等）时，
        // 自动清除本地会话并回到登录页，避免停留在没有田地的空工作台。
        if (error?.status === 401 || error?.code === 'AUTH_REQUIRED' || error?.code === 'AUTH_INVALID') {
          api.clearSession();
          window.location.replace('login.html?reason=session_expired');
          return false;
        }
        load_error.value = error?.message || '正式数据读取失败';
        // Do not leave the module-level demo Crop Pack available after a
        // formal load fails.  A failed live request must render an empty
        // state, otherwise target bands could look like backend facts.
        crop_pack_catalog = [];
        replace_ref_array(plots, []);
        replace_ref_array(tasks, []);
        replace_ref_array(messages, []);
        farm.value = {};
        if (announce) show_toast(`正式农户数据读取失败：${load_error.value}`, 'error');
        return false;
      } finally {
        if (showProgress && version === workspace_request_version && !bootstrap_loading.value) {
          finish_workspace_progress(load_error.value ? '加载未完成' : '数据已更新');
        }
      }
    };

    let workspace_refresh_timer = null;
    let telemetry_refresh_timer = null;
    let live_workspace_poll_timer = null;
    let live_telemetry_poll_timer = null;
    let live_poll_visibility_handler = null;
    let live_poll_online_handler = null;
    let live_workspace_poll_in_flight = false;
    let live_telemetry_poll_in_flight = false;
    let live_events_stop = null;
    let live_events_connecting = false;
    let live_health_probe_in_flight = false;
    let farmer_enhancements_refresh_in_flight = false;
    const schedule_live_refresh = (scope = 'workspace') => {
      if (!is_formal_session) return;
      if (scope === 'telemetry') {
        if (telemetry_refresh_timer) return;
        telemetry_refresh_timer = window.setTimeout(async () => {
          telemetry_refresh_timer = null;
          // Skip heavy plot refreshes while the farmer is reading messages.
          if (current_view.value === 'messages') return;
          await refresh_plot_telemetry();
        }, 2500);
        return;
      }
      if (workspace_refresh_timer) return;
      workspace_refresh_timer = window.setTimeout(async () => {
        workspace_refresh_timer = null;
        const refreshed = await load_live_workspace({ announce: false });
        if (refreshed) await load_farmer_enhancements();
      }, 800);
    };

    const poll_live_workspace = async () => {
      if (!is_formal_session || document.hidden || live_workspace_poll_in_flight) return;
      live_workspace_poll_in_flight = true;
      try {
        const refreshed = await load_live_workspace({ announce: false });
        if (refreshed) await load_farmer_enhancements();
        is_live.value = api.isLive;
        if (api.isLive) connect_live_events({ announce: false });
      }
      finally { live_workspace_poll_in_flight = false; }
    };
    const poll_live_telemetry = async () => {
      if (!is_formal_session || document.hidden || current_view.value === 'messages' || live_telemetry_poll_in_flight) return;
      live_telemetry_poll_in_flight = true;
      try {
        await refresh_plot_telemetry();
        is_live.value = api.isLive;
        if (api.isLive) connect_live_events({ announce: false });
      }
      finally { live_telemetry_poll_in_flight = false; }
    };
    const stop_live_polling = () => {
      if (live_workspace_poll_timer) window.clearInterval(live_workspace_poll_timer);
      if (live_telemetry_poll_timer) window.clearInterval(live_telemetry_poll_timer);
      if (workspace_refresh_timer) window.clearTimeout(workspace_refresh_timer);
      if (telemetry_refresh_timer) window.clearTimeout(telemetry_refresh_timer);
      live_workspace_poll_timer = null;
      live_telemetry_poll_timer = null;
      workspace_refresh_timer = null;
      telemetry_refresh_timer = null;
      if (live_poll_visibility_handler) document.removeEventListener('visibilitychange', live_poll_visibility_handler);
      if (live_poll_online_handler) window.removeEventListener('online', live_poll_online_handler);
      live_poll_visibility_handler = null;
      live_poll_online_handler = null;
    };
    const start_live_polling = () => {
      stop_live_polling();
      if (!is_formal_session) return;
      if (!user_settings.value.autoRefresh) {
        // The SSE connection still delivers immediate events; disabling the
        // preference only turns off the REST recovery timers.
        ensure_live_connection();
        return;
      }
      // SSE normally updates immediately; these low-frequency polls recover
      // from missed events and keep secondary resources (tasks, inspections,
      // crop batches and device state) current as well.
      const refresh_ms = Math.max(5000, Number(user_settings.value.refreshInterval || 15) * 1000);
      live_telemetry_poll_timer = window.setInterval(poll_live_telemetry, refresh_ms);
      live_workspace_poll_timer = window.setInterval(poll_live_workspace, refresh_ms);
      live_poll_visibility_handler = () => {
        if (!document.hidden) {
          poll_live_telemetry();
          poll_live_workspace();
        }
      };
      live_poll_online_handler = () => {
        poll_live_telemetry();
        poll_live_workspace();
      };
      document.addEventListener('visibilitychange', live_poll_visibility_handler);
      window.addEventListener('online', live_poll_online_handler);
      poll_live_telemetry();
      ensure_live_connection();
    };

    const handle_live_event = (event) => {
      const type = String(event?.data?.eventType || event?.type || '').toLowerCase();
      if (['connected', 'heartbeat'].includes(type)) return;
      // Telemetry only refreshes plot metrics. Rebuilding the whole workspace
      // for every sample makes the message center flicker and is unnecessary.
      if (type.includes('telemetry') || type.includes('device.heartbeat')) {
        schedule_live_refresh('telemetry');
        return;
      }
      if (type.includes('workorder') || type.includes('work-order') || type.includes('alert') || type.includes('inspection')
        || type.includes('plot.') || type.includes('resource') || type.includes('water.balance')
        || type.includes('irrigation.plan') || type.includes('command') || type.includes('evaluation')) {
        schedule_live_refresh('workspace');
      }
    };
    const connect_live_events = async ({ announce = true } = {}) => {
      if (!is_formal_session || !api.isLive || live_events_stop || live_events_connecting) return false;
      live_events_connecting = true;
      try {
        live_events_stop = await api.subscribeEvents(handle_live_event);
        return true;
      } catch (error) {
        if (announce) show_toast(`实时同步暂不可用：${error.message || '事件流连接失败'}`, 'error');
        return false;
      } finally {
        live_events_connecting = false;
      }
    };
    const ensure_live_connection = () => {
      if (!is_formal_session || document.hidden) return;
      if (api.isLive) {
        connect_live_events({ announce: false });
        return;
      }
      if (live_health_probe_in_flight) return;
      live_health_probe_in_flight = true;
      api.checkHealth().then((healthy) => {
        is_live.value = healthy;
        if (healthy) connect_live_events({ announce: false });
      }).catch(() => {}).finally(() => { live_health_probe_in_flight = false; });
    };

    const open_message = (msg) => {
      selected_message.value = msg;
      analysis_result.value = '';
      analysis_error.value = '';
      // 不在打开时自动标记已读，保留“标记已读”按钮的可操作性；
      // 未读状态由用户在详情页主动点击按钮后切换。
    };

    const open_message_from_dashboard = (msg) => {
      navigate('messages');
      open_message(msg);
    };

    const close_message = () => {
      selected_message.value = null;
      analysis_result.value = '';
      analysis_error.value = '';
    };

    const mark_read = (msg) => {
      if (msg.read) return;
      msg.read = true;
      show_toast('已标记为已读');
    };

    const clear_read_messages = () => {
      const readMessages = messages.value.filter((m) => m.read);
      if (!readMessages.length) {
        show_toast('没有已读消息可清除');
        return;
      }
      readMessages.forEach((m) => deleted_message_ids.value.add(m.id));
      localStorage.setItem('agriloop_deleted_messages', JSON.stringify([...deleted_message_ids.value]));
      messages.value = messages.value.filter((m) => !m.read);
      if (selected_message.value && selected_message.value.read) {
        selected_message.value = null;
      }
      show_toast(`已清除 ${readMessages.length} 条已读消息`);
    };

    const generate_analysis = async (msg) => {
      analyzing.value = true;
      analysis_result.value = '';
      analysis_error.value = '';
      analysis_source_label.value = '';
      try {
        if (!is_formal_session) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          throw Object.assign(new Error('OFFLINE'), { is_network: true });
        }
        const result = await api.agentChat(
          `请概括这条消息：${msg.title}\n${msg.body_paragraphs?.join('；') || msg.snippet || ''}`,
          msg.plotId || plots.value[0]?.plotId
        );
        analysis_result.value = agentResponseText(result, '后端智能服务未返回摘要。');
        analysis_source_label.value = agentResponseSource(result, 'live');
      } catch (error) {
        if (error.is_network || !is_live.value) {
          analysis_error.value = '当前为离线模式，智能概括服务不可用。请启动后端服务后再试，或联系农场管理员获取人工分析。';
        } else {
          analysis_error.value = error.message || '智能分析服务暂时不可用，请稍后重试。';
        }
        analysis_source_label.value = '智能分析暂不可用';
      } finally {
        analyzing.value = false;
      }
    };

    const open_task = (task) => {
      const latest = find_task_by_identity(tasks.value, task) || task;
      selected_task.value = enrich_task(latest);
    };

    const open_task_from_dashboard = (task) => {
      navigate('tasks');
      open_task(task);
    };

    const open_activity_item = (item) => {
      if (!item) return;
      if (item.kind === 'TASK' && item.task) {
        open_task_from_dashboard(item.task);
        return;
      }
      if (item.kind === 'MESSAGE' && item.message) {
        open_message_from_dashboard(item.message);
      }
    };

    const open_device_attention = () => {
      open_suggestion('DEVICE', {
        task: device_attention.value.task,
        plotId: device_attention.value.plotId,
        title: device_attention.value.title,
        reason: device_attention.value.detail,
        actionLabel: device_attention.value.needsAction ? '进入设备核验' : '查看处理记录'
      });
    };

    const open_plot = (plot) => {
      navigate('plots');
      selected_plot.value = plot;
    };

    const open_tools = () => {
      tools_tab.value = 'manual';
      navigate('tools', { tab: 'manual' });
    };

    const load_irrigation_plan = async (plot_id = advice_plot.value?.plotId, { silent = false } = {}) => {
      const plotId = plot_id || advice_plot.value?.plotId;
      if (!plotId) {
        irrigation_plan.value = null;
        irrigation_readiness_detail.value = null;
        irrigation_plan_error.value = '没有可生成建议的地块';
        return null;
      }
      const version = ++irrigation_plan_request_version;
      irrigation_plan_loading.value = true;
      irrigation_plan_error.value = '';
      irrigation_guard.value = null;
      automatic_watering_setting.value = null;
      if (automatic_watering_result.value?.plotId !== plotId) automatic_watering_result.value = null;
      try {
        const plan = await api.estimateIrrigation({
          farmId: farm.value.farmId || session_user?.farmIds?.find((id) => id !== '*') || 'farm-demo',
          plotId,
          scenarioId: 'NORMAL'
        });
        if (version !== irrigation_plan_request_version) return plan;
        irrigation_plan.value = plan;
        irrigation_readiness_detail.value = null;
        if (plan?.planId) {
          try {
            irrigation_readiness_detail.value = await api.getDecisionReadiness('IRRIGATION_PLAN', plan.planId, { plan, plotId });
      } catch (error) {
            // 处方仍可展示；读取就绪度失败时保留明确的降级文案。
            irrigation_readiness_detail.value = { status: plan.readinessStatus || 'UNAVAILABLE', reason: error?.message || '就绪度暂不可用' };
          }
          try {
            irrigation_guard.value = await api.getIrrigationGuard(plotId);
          } catch {
            // The prescription remains visible; the execution button will
            // stay disabled until the guard can be read again.
            irrigation_guard.value = null;
          }
          try {
            automatic_watering_setting.value = await api.getAutomaticWateringSetting(plotId);
          } catch {
            // Keep the existing default-on behavior if an older server does
            // not expose the optional setting endpoint yet.  The guard remains
            // the source of truth for eligibility and safety checks.
            automatic_watering_setting.value = {
              plotId,
              enabled: irrigation_guard.value?.automaticWatering?.enabled !== false,
              threshold: irrigation_guard.value?.automaticWatering?.threshold || 10,
              sourceMode: 'SIMULATION',
              provenance: 'DERIVED'
            };
          }
          // The server also evaluates this on every telemetry event.  The
          // page-level check catches an already-low reading when a farmer
          // opens the irrigation view and is idempotent per reading in demo
          // mode.
          if (automatic_watering_status.value.enabled && (plan?.automaticWatering?.eligible === true || irrigation_guard.value?.automaticWatering?.eligible === true)) {
            void check_automatic_watering(plotId, { silent: true });
          }
        }
        return plan;
      } catch (error) {
        if (version !== irrigation_plan_request_version) return null;
        irrigation_plan.value = null;
        irrigation_readiness_detail.value = null;
        irrigation_plan_error.value = error?.message || '灌溉处方读取失败';
        if (!silent) show_toast(irrigation_plan_error.value, 'error');
        return null;
      } finally {
        if (version === irrigation_plan_request_version) irrigation_plan_loading.value = false;
      }
    };

    const toggle_automatic_watering = async (plotId = advice_plot.value?.plotId) => {
      if (!plotId || automatic_watering_setting_busy.value) return null;
      const currentEnabled = automatic_watering_setting.value?.enabled
        ?? automatic_watering_status.value.enabled;
      automatic_watering_setting_busy.value = true;
      try {
        const setting = await api.setAutomaticWateringSetting(plotId, !currentEnabled);
        automatic_watering_setting.value = setting;
        automatic_watering_result.value = null;
        try {
          irrigation_guard.value = await api.getIrrigationGuard(plotId);
        } catch {
          // The saved setting is still reflected immediately; a later refresh
          // can fill the guard details when the service is available again.
        }
        show_toast(setting.enabled ? '已开启自动浇水' : '已关闭自动浇水');
        return setting;
      } catch (error) {
        show_toast(error?.message || '自动浇水设置保存失败', 'error');
        return null;
      } finally {
        automatic_watering_setting_busy.value = false;
      }
    };

    const check_automatic_watering = async (plotId = advice_plot.value?.plotId, { silent = false } = {}) => {
      if (!plotId || automatic_watering_busy.value) return null;
      if (!automatic_watering_status.value.enabled) {
        if (!silent) show_toast('请先开启自动浇水');
        return { plotId, enabled: false, status: 'DISABLED', reason: 'AUTOMATIC_WATERING_DISABLED' };
      }
      automatic_watering_busy.value = true;
      try {
        const result = await api.autoWaterIfNeeded(plotId);
        automatic_watering_result.value = result;
        if (result?.status === 'TRIGGERED' && !result?.reused) {
          show_toast('土壤含水量低于 10%，已自动发起虚拟浇水');
          if (is_live.value) {
            await load_live_workspace({ announce: false });
            await load_irrigation_plan(plotId, { silent: true });
          }
        }
        return result;
      } catch (error) {
        if (!silent) show_toast(error?.message || '自动浇水检查失败', 'error');
        return null;
      } finally {
        automatic_watering_busy.value = false;
      }
    };

    const format_suggestion_time = (value) => {
      if (!value) return '—';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return String(value);
      return parsed.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const suggestion_outcome_label = (outcome) => ({
      SUCCEEDED: '成功',
      PARTIAL: '部分完成',
      FAILED: '失败',
      TIMEOUT: '超时'
    }[String(outcome || '').toUpperCase()] || outcome || '—');
    const suggestion_recovery_detail = computed(() => {
      if (!active_suggestion.value) return '';
      if (suggestion_recovery_status.value) return suggestion_recovery_status.value;
      if (active_suggestion.value.kind === 'IRRIGATION') return '命令已提交，等待设备执行回执和效果评价。';
      if (active_suggestion.value.kind === 'TASK') return '任务结果已提交，等待管理员验收。';
      return '已确认处理，等待现场复测或设备心跳恢复。';
    });

    const open_no_action_reason = () => {
      show_suggestion_flow.value = false;
      show_no_action_reason.value = true;
    };

    const close_no_action_reason = () => {
      show_no_action_reason.value = false;
    };

    const open_manual_irrigation = () => {
      if (!manual_irrigation_available.value) {
        show_toast('当前地块没有可用的人工浇灌兜底', 'error');
        return;
      }
      show_suggestion_flow.value = false;
      manual_irrigation_stage.value = 'FORM';
      manual_irrigation_water.value = '';
      manual_irrigation_confirmed.value = false;
      manual_irrigation_result.value = null;
      manual_irrigation_error.value = '';
      manual_irrigation_busy.value = false;
      const plotId = advice_plot.value?.plotId;
      const plan = irrigation_plan.value?.plotId === plotId ? irrigation_plan.value : advice_plan.value;
      manual_irrigation_idempotency_key.value = `manual-irrigation-${plan?.planId || plotId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      show_manual_irrigation.value = true;
    };

    const close_manual_irrigation = () => {
      if (manual_irrigation_busy.value) return;
      show_manual_irrigation.value = false;
    };

    const submit_manual_irrigation = async () => {
      if (manual_irrigation_busy.value) return;
      const plotId = advice_plot.value?.plotId;
      const plan = irrigation_plan.value?.plotId === plotId ? irrigation_plan.value : advice_plan.value;
      const water = Number(manual_irrigation_water.value);
      const limits = manual_irrigation_limits.value;
      manual_irrigation_error.value = '';
      if (!manual_irrigation_available.value || !plan?.planId || !plotId) {
        manual_irrigation_error.value = '当前地块已不再处于可人工兜底状态，请刷新后重试';
        return;
      }
      if (!Number.isFinite(water) || water < Number(limits.minWaterLitre || 0.1)) {
        manual_irrigation_error.value = `请输入不小于 ${Number(limits.minWaterLitre || 0.1)} L 的有效水量`;
        return;
      }
      if (Number.isFinite(Number(limits.maxWaterLitre)) && water > Number(limits.maxWaterLitre) + 0.0001) {
        manual_irrigation_error.value = `本次最多可输入 ${Number(limits.maxWaterLitre).toFixed(1)} L，仍受每日和资源上限约束`;
        return;
      }
      if (!manual_irrigation_confirmed.value) {
        manual_irrigation_error.value = '请先确认地块、阻塞原因和本次水量';
        return;
      }
      manual_irrigation_busy.value = true;
      try {
        let result = await api.executeManualIrrigation({
          plotId,
          sourcePlanId: plan.planId,
          waterLitre: water,
          confirmed: true,
          idempotencyKey: manual_irrigation_idempotency_key.value,
          source: 'farmer-manual-fallback'
        });
        if (is_live.value) {
          result = await wait_for_irrigation_completion(result);
          await refresh_plot_telemetry();
          await load_live_workspace({ announce: false });
          if (result?.commandId) {
            const evaluation = await api.getCommandEvaluation(result.commandId).catch(() => null);
            if (evaluation) result = { ...result, evaluation };
          }
        } else {
          await load_live_workspace({ announce: false });
          await load_irrigation_plan(plotId, { silent: true });
        }
        manual_irrigation_result.value = result;
        manual_irrigation_stage.value = 'RESULT';
        show_toast(is_live.value ? '人工浇灌命令已提交，等待设备回执' : '演示人工浇灌已完成，不会控制真实水泵');
      } catch (error) {
        manual_irrigation_error.value = error?.message || '人工浇灌失败，请稍后重试';
        manual_irrigation_confirmed.value = false;
        show_toast(manual_irrigation_error.value, 'error');
      } finally {
        manual_irrigation_busy.value = false;
      }
    };

    const open_virtual_lighting = () => {
      if (!light_operation_available.value) {
        show_toast('只有光照不足时才可执行补光，请先确认当前光照状态', 'error');
        return;
      }
      virtual_lighting_stage.value = 'FORM';
      virtual_lighting_confirmed.value = false;
      virtual_lighting_result.value = null;
      virtual_lighting_error.value = '';
      virtual_lighting_busy.value = false;
      virtual_lighting_boost.value = Math.max(1000, Math.round((Number(advice_light_status.value.high || 30000) - Number(advice_light_status.value.value || 0)) * .65));
      virtual_lighting_idempotency_key.value = `virtual-lighting-${advice_plot.value.plotId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      show_virtual_lighting.value = true;
    };

    const close_virtual_lighting = () => {
      if (virtual_lighting_busy.value) return;
      show_virtual_lighting.value = false;
    };

    const submit_virtual_lighting = async () => {
      if (virtual_lighting_busy.value) return;
      const plotId = advice_plot.value?.plotId;
      const preview = virtual_lighting_preview.value;
      virtual_lighting_error.value = '';
      if (!light_operation_available.value || !plotId) {
        virtual_lighting_error.value = '当前地块不满足离线演示补光条件，请刷新后重试';
        return;
      }
      if (!virtual_lighting_confirmed.value) {
        virtual_lighting_error.value = '请先确认这是离线虚拟演示，不会控制真实补光灯';
        return;
      }
      virtual_lighting_busy.value = true;
      try {
        let result = await api.executeVirtualLighting({
          plotId,
          boostLux: preview.boost,
          durationSeconds: 60,
          confirmed: true,
          allowOfflineDemo: true,
          idempotencyKey: virtual_lighting_idempotency_key.value,
          source: 'farmer-operation-system'
        });
        virtual_lighting_result.value = result;
        virtual_lighting_stage.value = 'RESULT';
        await load_live_workspace({ announce: false });
        show_toast('离线设备已完成虚拟补光，结果已写入模拟遥测');
      } catch (error) {
        virtual_lighting_error.value = error?.message || '虚拟补光失败，请稍后重试';
        virtual_lighting_confirmed.value = false;
        show_toast(virtual_lighting_error.value, 'error');
      } finally {
        virtual_lighting_busy.value = false;
      }
    };

    const open_suggestion = (kind = 'RISK', context = {}) => {
      const task = context.task || (kind === 'TASK' ? context : null);
      if (kind === 'TASK' && !['PENDING', 'ASSIGNED', 'REJECTED', 'IN_PROGRESS'].includes(farmer_task_status(task))) {
        show_toast('任务状态已更新，请按最新状态处理', 'warning');
        return;
      }
      const plotId = context.plotId || task?.plot_id || (kind === 'RISK' ? weather_risk_card.value.plotId : advice_plot.value?.plotId);
      const plot = find_plot_by_id(plots.value, plotId);
      const issue = plot ? plot_issue_summary(plot) : null;
      const title = context.title
        || task?.title
        || (kind === 'DEVICE' ? device_attention.value.title : '')
        || (kind === 'IRRIGATION' ? `${plot?.name || '当前地块'}补水建议` : `${plot?.name || '当前地块'}风险建议`);
      const reason = context.reason
        || task?.reason
        || (kind === 'DEVICE' ? device_attention.value.detail : '')
        || issue?.detail
        || weather_risk_card.value.impact;
      active_suggestion.value = {
        id: context.id || `${String(kind).toLowerCase()}-${plotId || 'farm'}-${Date.now()}`,
        kind,
        plotId,
        task,
        title,
        reason,
        actionLabel: context.actionLabel || (kind === 'IRRIGATION' ? '查看建议并执行' : (kind === 'TASK' ? '开始并填写结果' : '进入现场核验')),
        traceId: context.traceId || null
      };
      suggestion_flow_stage.value = 'VIEW';
      suggestion_confirm_checked.value = false;
      suggestion_result.value = null;
      suggestion_recovery_status.value = '';
      suggestion_result_form.value = { outcome: 'SUCCEEDED', note: '', actual_water_litre: '', actual_duration_seconds: '', water_source_mode: 'EXTERNAL' };
      suggestion_idempotency_key.value = '';
      show_suggestion_flow.value = true;
      if (kind === 'IRRIGATION') {
        if (!irrigation_plan.value || irrigation_plan.value.plotId !== plotId) {
          load_irrigation_plan(plotId, { silent: true });
        } else {
          api.getIrrigationGuard(plotId).then((guard) => { irrigation_guard.value = guard; }).catch(() => { irrigation_guard.value = null; });
        }
      }
    };

    const close_suggestion_flow = () => {
      if (suggestion_busy.value) return;
      show_suggestion_flow.value = false;
    };

    const wait_for_irrigation_completion = async (submitted) => {
      if (!is_live.value || !submitted?.commandId) return submitted;
      let current = submitted;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const status = String(current?.ack?.status || current?.status || '').toUpperCase();
        if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'TIMEOUT'].includes(status)) {
          for (let evaluationAttempt = 0; evaluationAttempt < 6; evaluationAttempt += 1) {
            const evaluation = await api.getCommandEvaluation(submitted.commandId).catch(() => null);
            if (evaluation && evaluation.status !== 'PENDING') return { ...current, evaluation };
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
          return current;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
        try {
          current = await api.getCommand(submitted.commandId);
        } catch {
          break;
        }
      }
      return current;
    };

    const prepare_suggestion_confirmation = async () => {
      if (!active_suggestion.value) return;
      if (active_suggestion.value.kind === 'IRRIGATION') {
        if (!irrigation_plan.value || irrigation_plan.value.plotId !== active_suggestion.value.plotId) {
          await load_irrigation_plan(active_suggestion.value.plotId);
        }
      }
      suggestion_confirm_checked.value = false;
      suggestion_flow_stage.value = 'CONFIRM';
    };

    const confirm_suggestion_action = async () => {
      if (!suggestion_confirm_enabled.value || !active_suggestion.value) return;
      const active = active_suggestion.value;
      suggestion_busy.value = true;
      try {
        if (active.kind === 'IRRIGATION') {
          const plan = irrigation_plan.value;
          const key = suggestion_idempotency_key.value || `farmer-irrigation-${plan.planId}`;
          suggestion_idempotency_key.value = key;
          if (!suggestion_result.value) {
            suggestion_result.value = await api.executeIrrigation(plan.planId, active.plotId, {
              confirmed: true,
              // Backwards-compatible alias for an older deployed API.
              approved: true,
              approvalRequired: false,
              confirmationMode: 'OPERATOR_CONFIRMED',
              idempotencyKey: key,
              emergencyOverride: suggestion_emergency_mode.value,
              source: 'farmer-advice-direct',
              ...(is_live.value ? {} : { outcome: 'SUCCEEDED' })
            });
            if (is_live.value) {
              suggestion_result.value = await wait_for_irrigation_completion(suggestion_result.value);
              await refresh_plot_telemetry();
              await load_live_workspace({ announce: false });
              if (suggestion_result.value?.commandId) {
                const evaluation = await api.getCommandEvaluation(suggestion_result.value.commandId).catch(() => null);
                if (evaluation) suggestion_result.value = { ...suggestion_result.value, evaluation };
              }
            } else {
              await load_live_workspace({ announce: false });
              await load_irrigation_plan(active.plotId, { silent: true });
            }
          }
          suggestion_recovery_status.value = '灌溉命令已提交，等待设备执行回执和效果评价。';
          suggestion_flow_stage.value = 'RESULT';
          show_toast(is_live.value ? '灌溉命令已提交，等待设备回执' : '演示灌溉已执行，不会控制真实水泵');
        } else if (active.kind === 'TASK') {
          const task = active.task;
          const status = farmer_task_status(task);
          if (['PENDING', 'ASSIGNED', 'REJECTED'].includes(status)) {
            if (is_formal_session) {
              const saved = await api.transitionWorkOrder(task.workOrderId, { action: status === 'REJECTED' ? 'RESTART' : 'START', note: '农户确认开始执行任务' });
              patch_task_state(task, { ...(saved || {}), status: saved?.status || 'IN_PROGRESS' });
              await load_live_workspace({ announce: false });
            } else {
              patch_task_state(task, { status: 'IN_PROGRESS' });
            }
          }
          suggestion_flow_stage.value = 'RESULT';
          suggestion_recovery_status.value = '任务已开始，完成后填写结果。';
          show_toast(`已确认任务：${task.title}`);
        } else {
          suggestion_flow_stage.value = 'RESULT';
          suggestion_recovery_status.value = active.kind === 'DEVICE' ? '已确认设备处理，完成检查后填写结果。' : '已确认风险处理，完成巡田或复测后填写结果。';
          show_toast('已确认下一步处理，请完成现场动作后填写结果');
        }
      } catch (error) {
        const guard = error?.details?.guard || error?.payload?.guard || error?.payload?.error?.details?.guard;
        if (guard) irrigation_guard.value = guard;
        suggestion_confirm_checked.value = false;
        show_toast(error?.message || '确认操作失败，请稍后重试', 'error');
      } finally {
        suggestion_busy.value = false;
      }
    };

    const open_suggestion_inspection = () => {
      const plotId = active_suggestion.value?.plotId;
      close_suggestion_flow();
      open_inspection_form(plotId, active_suggestion.value?.task?.workOrderId || '');
    };

    const submit_suggestion_result = async () => {
      const active = active_suggestion.value;
      const form = suggestion_result_form.value;
      const note = String(form.note || '').trim();
      if (!active || !note || !form.outcome) {
        show_toast('请选择结果并填写处理备注', 'error');
        return;
      }
      if (suggestion_busy.value) return;
      const actualWater = String(form.actual_water_litre ?? '').trim();
      const actualDuration = String(form.actual_duration_seconds ?? '').trim();
      if (active.task?.actionType === 'MANUAL_IRRIGATION' && !actualWater) {
        show_toast('人工浇水任务请填写实际用水量', 'error');
        return;
      }
      if (actualWater && !Number.isFinite(Number(actualWater))) {
        show_toast('实际用水量必须是数字', 'error');
        return;
      }
      if (actualDuration && !Number.isFinite(Number(actualDuration))) {
        show_toast('实际执行时长必须是数字', 'error');
        return;
      }
      suggestion_busy.value = true;
      try {
        let saved;
        if (active.kind === 'TASK' && active.task?.workOrderId) {
          saved = await api.transitionWorkOrder(active.task.workOrderId, {
            action: 'SUBMIT',
            resultSummary: `${suggestion_outcome_label(form.outcome)}：${note}`,
            outcome: form.outcome,
            actualWaterLitre: actualWater ? Number(actualWater) : undefined,
            actualDurationSeconds: actualDuration ? Number(actualDuration) : undefined,
            ...(active.task?.actionType === 'MANUAL_IRRIGATION' ? { waterSourceMode: form.water_source_mode || 'EXTERNAL' } : {})
          });
          if (is_formal_session) await load_live_workspace({ announce: false });
        } else {
          saved = await api.submitDecisionFeedback(active.traceId || `${String(active.kind).toLowerCase()}-${active.plotId || 'farm'}`, {
            decision: 'RESULT',
            action: active.kind,
            plotId: active.plotId,
            outcome: form.outcome,
            note,
            actualWaterLitre: actualWater ? Number(actualWater) : undefined,
            actualDurationSeconds: actualDuration ? Number(actualDuration) : undefined,
            idempotencyKey: suggestion_idempotency_key.value || undefined,
            provenance: is_live.value ? 'BACKEND' : 'SIMULATED'
          });
        }
        if (active.kind === 'TASK') {
          patch_task_state(active.task, {
            ...(saved || {}),
            status: is_formal_session ? (saved?.status || 'SUBMITTED') : 'SUBMITTED'
          });
        }
        suggestion_result.value = saved;
        suggestion_recovery_status.value = active.kind === 'IRRIGATION'
          ? '复测结果已记录；系统执行回执和效果评价仍以设备与遥测为准。'
          : (active.kind === 'TASK' ? '结果已提交，等待管理员验收。' : '结果已记录，等待现场复测或设备心跳恢复。');
        suggestion_flow_stage.value = 'RECOVERY';
        show_toast('处理结果已记录');
      } catch (error) {
        show_toast(error?.message || '结果提交失败', 'error');
      } finally {
        suggestion_busy.value = false;
      }
    };

    const refresh_suggestion_recovery = async () => {
      if (!active_suggestion.value) return;
      suggestion_busy.value = true;
      try {
        if (active_suggestion.value.kind === 'IRRIGATION') {
          const traceId = advice_trace.value || irrigation_plan.value?.traceId;
          const plotId = active_suggestion.value.plotId || advice_plot.value?.plotId;
          const [passportResult, guardResult] = await Promise.allSettled([
            traceId ? api.getDecisionPassport(traceId) : Promise.resolve(null),
            plotId ? api.getIrrigationGuard(plotId) : Promise.resolve(null)
          ]);
          if (passportResult.status === 'fulfilled' && passportResult.value) advice_passport.value = passportResult.value;
          if (guardResult.status === 'fulfilled' && guardResult.value) irrigation_guard.value = guardResult.value;
        }
      if (is_formal_session) {
          await refresh_plot_telemetry();
          await load_live_workspace({ announce: false });
        }
        const plot = suggestion_plot.value;
        const band = plot ? resolve_moisture_band_status(plot) : 'UNKNOWN';
        const online = String(plot?.deviceStatus || '').toUpperCase() === 'ONLINE';
        if (active_suggestion.value.kind === 'TASK') {
          const status = farmer_task_status(active_suggestion.value.task);
          suggestion_recovery_status.value = status === 'DONE' ? '已验收完成' : '等待管理员验收';
        } else if (is_live.value && online && band === 'NORMAL') {
          suggestion_recovery_status.value = '已恢复（最新遥测已回到目标范围）';
        } else if (!is_live.value && online && band === 'NORMAL') {
          suggestion_recovery_status.value = '演示数据已回到目标范围，等待正式复测确认';
        } else {
          suggestion_recovery_status.value = '等待复测，当前尚未确认恢复';
        }
      } catch (error) {
        suggestion_recovery_status.value = `恢复状态暂不可用：${error?.message || '请稍后重试'}`;
      } finally {
        suggestion_busy.value = false;
      }
    };

    const open_priority_item = (item) => {
      if (!item) return;
      if (item.kind === 'TASK') {
        navigate('tasks');
        open_task(item.task);
      } else if (item.kind === 'DEVICE') {
        if (item.task) {
          navigate('tasks');
          open_task(item.task);
        } else {
          navigate('inspections');
          open_inspection_form(item.plotId);
        }
      } else if (item.kind === 'IRRIGATION') {
        select_advice_plot(item.plotId);
        open_suggestion('IRRIGATION', item);
      } else {
        open_suggestion('RISK', item);
      }
    };

    const toggle_irrigation = () => {
      if (advice_is_no_action.value) {
        open_no_action_reason();
        return;
      }
      // 农户与管理员都进入同一条安全确认、幂等和虚拟执行闭环。
      open_suggestion('IRRIGATION', { plotId: advice_plot.value?.plotId });
    };

    const reset_advice_feedback_state = () => {
      selected_case_id.value = '';
      human_confirmation_checked.value = false;
      suggestion_feedback.value = '';
      decision_confirmation.value = '';
    };

    const load_advice_decision = async (plotId) => {
      const plot = find_plot_by_id(plots.value, plotId) || advice_plot.value;
      if (!plot?.plotId) return;
      advice_loading.value = true;
      advice_error.value = '';
      reset_advice_feedback_state();
      try {
        const plan = (irrigation_plan.value?.plotId === plot.plotId && irrigation_plan.value?.planId)
          ? irrigation_plan.value
          : await load_irrigation_plan(plot.plotId, { silent: true });
        if (!plan?.planId) {
          advice_error.value = irrigation_plan_error.value || '灌溉建议尚未就绪';
          return;
        }
        const traceId = plan.traceId || advice_trace.value || advice_trace_id();
        advice_trace.value = traceId;
        advice_plan.value = plan;
        const diagnosis = await api.evaluateDiagnosis(plot.plotId, { traceId });
        advice_diagnosis.value = diagnosis;
        advice_readiness.value = irrigation_readiness_detail.value || await api.getDecisionReadiness('IRRIGATION_PLAN', plan.planId, {
          farmId: farm.value.farmId || session_user?.farmIds?.find((id) => id !== '*'),
          plotId: plot.plotId,
          diagnosis,
          plan
        });
        const [guardResult, passportResult] = await Promise.allSettled([
          api.getIrrigationGuard(plot.plotId),
          api.getDecisionPassport(traceId)
        ]);
        irrigation_guard.value = guardResult.status === 'fulfilled' ? guardResult.value : null;
        advice_passport.value = passportResult.status === 'fulfilled' ? passportResult.value : null;
        const cases = await api.getSimilarCases(traceId, {
          cropCode: plot.cropCode || 'tomato',
          primaryCause: diagnosis.primaryCause || 'WATER_DEFICIT'
        });
        similar_cases_live.value = normalize_similar_cases(cases);
      } catch (error) {
        advice_error.value = error.message || '灌溉建议加载失败';
        advice_plan.value = null;
        advice_diagnosis.value = null;
        advice_readiness.value = null;
        irrigation_guard.value = null;
        advice_passport.value = null;
        advice_trace.value = '';
        similar_cases_live.value = [];
      } finally {
        advice_loading.value = false;
      }
    };

    const request_missing_evidence = async () => {
      const readiness = advice_readiness.value;
      const plot = advice_plot.value;
      if (!readiness?.readinessId || !plot?.plotId || evidence_request_busy.value) return;
      evidence_request_busy.value = true;
      try {
        const action = readiness.requiredActions?.[0] || {};
        const key = `farmer-evidence-${readiness.readinessId}-${action.action || action.type || 'inspection'}`;
        const requestedEvidenceType = action.action === 'CHECK_DEVICE' ? 'DEVICE_CHECK' : action.action === 'REMEASURE' ? 'RETEST' : 'FIELD_INSPECTION';
        const saved = await api.createDecisionEvidenceRequest(readiness.readinessId, {
          farmId: farm.value.farmId || session_user?.farmIds?.find((id) => id !== '*'),
          plotId: plot.plotId,
          title: `决策补证：${EVIDENCE_LABELS[action.action] || EVIDENCE_LABELS[readiness.missingEvidence?.[0]] || '现场复测'}`,
          reason: `就绪度 ${readiness.status}，需要补充最小证据`,
          actionType: action.type === 'REQUEST_APPROVAL' ? 'IRRIGATION_REVIEW' : 'INSPECTION',
          evidenceType: requestedEvidenceType,
          priority: action.priority || 'HIGH',
          idempotencyKey: key
        });
        evidence_requests.value.unshift({
          id: saved.workOrderId || saved.id,
          plotId: saved.plotId || plot.plotId,
          type: saved.evidenceType || requestedEvidenceType,
          reason: saved.reason || `就绪度 ${readiness.status}，需要补充最小证据`,
          status: saved.status || 'OPEN',
          createdAt: saved.createdAt || new Date().toISOString(),
          requesterId: saved.requesterId || saved.createdBy || session_user?.userId,
          requesterName: saved.requesterName || saved.createdBy || session_user?.username,
          dataOrigin: 'BACKEND'
        });
        const refreshed = await load_live_workspace({ announce: false });
        show_toast(refreshed ? `补证任务已创建：${saved.workOrderId || '待同步'}` : `补证任务已创建，但列表刷新失败：${load_error.value || '请稍后重试'}`, refreshed ? 'success' : 'warning');
      } catch (error) {
        show_toast(error.message || '补证任务创建失败', 'error');
      } finally {
        evidence_request_busy.value = false;
      }
    };

    const open_advice_diagnosis = async () => {
      const plot = advice_plot.value;
      if (!plot?.plotId) {
        show_toast('请先选择地块', 'error');
        return;
      }
      if (!advice_diagnosis.value && !advice_loading.value) {
        await load_advice_decision(plot.plotId);
      }
      if (!advice_diagnosis.value && advice_error.value) {
        show_toast(advice_error.value, 'error');
        return;
      }
      show_advice_diagnosis.value = !show_advice_diagnosis.value;
    };

    const set_suggestion_feedback = async (feedback) => {
      decision_confirmation.value = '';
      if (is_formal_session) {
        if (!advice_trace.value) {
          await load_advice_decision(advice_plot.value?.plotId);
        }
        const traceId = advice_trace.value || irrigation_plan.value?.traceId;
        const planId = advice_plan.value?.planId || irrigation_plan.value?.planId;
        if (!traceId) {
          show_toast('灌溉建议尚未就绪，请稍后再反馈', 'error');
          return;
        }
        if (feedback_busy.value) return;
        feedback_busy.value = true;
        try {
          await api.submitDecisionFeedback(traceId, {
            decision: feedback_decision_code(feedback),
            planId,
            note: feedback,
            reasonCodes: feedback_decision_code(feedback) === 'MODIFIED' ? ['FARMER_ADJUSTMENT'] : []
          });
          suggestion_feedback.value = feedback;
          show_toast(`反馈已记录：${feedback}`);
        } catch (error) {
          show_toast(error.message || '反馈提交失败', 'error');
        } finally {
          feedback_busy.value = false;
        }
        return;
      }
      suggestion_feedback.value = feedback;
      show_toast(`演示反馈已记录：${feedback}`);
    };

    const confirm_suggestion = async () => {
      if (!selected_case_id.value || !human_confirmation_checked.value) {
        show_toast('请先选择参考案例并完成现场确认', 'error');
        return;
      }
      const selected = similar_cases.value.find((item) => item.id === selected_case_id.value);
      if (is_formal_session) {
        if (!advice_trace.value) {
          await load_advice_decision(advice_plot.value?.plotId);
        }
        const traceId = advice_trace.value || irrigation_plan.value?.traceId;
        const planId = advice_plan.value?.planId || irrigation_plan.value?.planId;
        if (!traceId) {
          show_toast('灌溉建议尚未就绪', 'error');
          return;
        }
        if (feedback_busy.value) return;
        feedback_busy.value = true;
        try {
          await api.submitDecisionFeedback(traceId, {
            decision: 'ACCEPTED',
            planId,
            note: '农户已核对案例并确认采用，等待安全检查',
            referenceCaseId: selected?.raw?.caseId || selected_case_id.value,
            humanConfirmed: true
          });
          decision_confirmation.value = '已提交待复核';
          suggestion_feedback.value = '确认采用（待复核）';
          show_toast('正式采用已记录为待复核，不会直接修改处方或策略');
        } catch (error) {
          show_toast(error.message || '确认提交失败', 'error');
        } finally {
          feedback_busy.value = false;
        }
        return;
      }
      decision_confirmation.value = '已提交人工确认';
      suggestion_feedback.value = '确认采用（待复核）';
      show_toast('演示确认已记录，策略和处方尚未被修改');
    };

    const assistant_shortcut_icon = (question) => {
      const found = assistant_shortcuts.value.find((item) => item.question === question);
      return found?.icon || 'smart_toy';
    };

    const assistant_tool_labels = Object.freeze({
      transition_assigned_work_order: '更新本人任务',
      create_inspection_record: '提交巡田记录',
      create_evidence_request: '申请补证任务',
      execute_virtual_irrigation: '执行虚拟灌溉',
      create_plot: '新增地块',
      update_plot: '更新地块',
      set_plot_devices: '绑定设备',
      create_and_assign_work_order: '创建并下发任务',
      publish_alert_verification: '发布告警核查',
      close_alert: '关闭告警'
    });
    const assistant_action_status_labels = Object.freeze({
      AWAITING_CONFIRMATION: '待确认', EXECUTING: '执行中', SUCCEEDED: '已完成',
      FAILED: '失败', PARTIAL: '部分完成', TIMEOUT: '超时', CANCELED: '已取消', EXPIRED: '已过期'
    });
    const assistant_create_conversation_id = () => {
      const identity = String(session_user?.userId || session_user?.username || user.value?.username || 'farmer')
        .replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 42) || 'farmer';
      return `conversation-${identity}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.slice(0, 116);
    };
    const assistant_service_label = computed(() => ({
      CONNECTING: '连接中…', READY: '服务正常', DEGRADED: '服务降级', DEMO: '演示助手'
    }[assistant_service_status.value] || '服务状态未知'));
    const assistant_service_tone = computed(() => assistant_service_status.value === 'DEGRADED' ? 'is-degraded' : assistant_service_status.value === 'DEMO' ? 'is-demo' : 'is-ready');
    const assistant_source_label = computed(() => is_formal_session ? (assistant_service_status.value === 'DEGRADED' ? '安全降级回答' : '后端智能服务') : '演示助手（未连接模型）');
    const assistant_action_tone = (proposal) => String(proposal?.status || 'AWAITING_CONFIRMATION').toLowerCase().replaceAll('_', '-');
    const assistant_action_status_label = (status) => assistant_action_status_labels[String(status || '').toUpperCase()] || '待处理';
    const assistant_risk_label = (risk) => ({ LOW: '低风险', MEDIUM: '中风险', HIGH: '高风险', CRITICAL: '高风险' }[String(risk || 'LOW').toUpperCase()] || '需复核');
    const assistant_action_button_label = (proposal) => proposal?.executionMode === 'AUTOMATIC_THRESHOLD' ? '自动浇水' : '确认执行';
    const assistant_action_hint = (proposal) => proposal?.executionMode === 'AUTOMATIC_THRESHOLD'
      ? '土壤含水量低于 10% 时触发虚拟浇水；系统会再次检查最新数据、设备健康和水量上限。'
      : '写操作仅在你确认后执行；确认时会再次检查权限、安全门和资源范围。';
    const assistant_tool_label = (tool) => assistant_tool_labels[tool] || tool || '受控操作';
    const assistant_source_label_for = (source) => ({ SIMULATED: '模拟数据', SIMULATION: '模拟结果', USER_PROVIDED: '人工提供', DERIVED: '推导结果', OBSERVED: '观测数据', BACKEND: '后端记录' }[String(source || '').toUpperCase()] || '智能助手');
    const assistant_action_arguments = (proposal) => {
      const summary = proposal?.argumentSummary || proposal?.argumentsSummary || proposal?.parameterSummary;
      if (summary) return summary;
      const args = proposal?.arguments || {};
      const plotName = find_plot_name(args.plotId || proposal?.plotId);
      if (proposal?.toolName === 'execute_virtual_irrigation') return `${plotName} · ${args.waterLitre ?? '—'} L · ${Math.round(Number(args.durationSeconds || 0) / 60) || '—'} 分钟`;
      if (proposal?.toolName === 'create_inspection_record') return `${plotName} · ${args.notes || '现场说明待补充'}`;
      if (proposal?.toolName === 'transition_assigned_work_order') return `${args.workOrderId || '本人任务'} · ${args.action || '更新状态'}`;
      if (proposal?.toolName === 'create_evidence_request') return `${plotName} · ${args.evidenceType || '现场巡田'}`;
      return Object.entries(args).filter(([key]) => !['farmId'].includes(key)).slice(0, 3).map(([key, value]) => `${key}=${value}`).join(' · ') || '参数已校验';
    };
    const assistant_action_expiry_label = (proposal) => {
      const expires = new Date(proposal?.expiresAt || 0);
      if (!Number.isFinite(expires.getTime()) || expires.getTime() < Date.now()) return '已过期';
      const minutes = Math.max(1, Math.ceil((expires.getTime() - Date.now()) / 60000));
      return `${minutes} 分钟内有效`;
    };
    const assistant_action_result = (proposal) => {
      const result = proposal?.result || {};
      if (proposal?.error) return proposal.error;
      if (result?.ack?.status) return `虚拟执行/模拟结果：${assistant_action_status_label(result.ack.status)}`;
      if (result?.status) return result.status === 'SUCCEEDED' ? '已写入记录' : assistant_action_status_label(result.status);
      return result?.message || '已完成本次受控操作';
    };
    const assistant_conversation_time = (conversation) => format_record_time(conversation?.updatedAt || conversation?.lastMessageAt || conversation?.createdAt);
    const assistant_conversation_plot_label = (conversation) => {
      const plotId = conversation?.plotId;
      return plotId ? (find_plot_name(plotId) || plotId) : '未关联地块';
    };

    const apply_qa_turn = (turn) => {
      if (!turn) return;
      qa_active_turn.value = turn;
      qa_details_open.value = false;
      qa_source_label.value = turn.sourceLabel || qa_source_label.value;
    };

    const toggle_qa_details = () => { qa_details_open.value = !qa_details_open.value; };

    const select_qa_history = (turn) => {
      apply_qa_turn(turn);
      qa_input.value = turn.question || '';
    };

    const open_qa_decision_action = async (turn) => {
      const card = turn?.decisionCard;
      if (!card) return;
      if (card.plotId) {
        select_advice_plot(card.plotId);
        const plot = find_plot_by_id(plots.value, card.plotId);
        if (plot) selected_plot.value = plot;
      }
      if (card.traceId) advice_trace.value = card.traceId;
      if (card.kind === 'IRRIGATION') {
        // Keep the Agent loop inside the chat.  A recommendation is read-only;
        // clicking its action button now sends an explicit execution request,
        // which produces the inline preview/confirm card instead of opening
        // the legacy four-step advice modal.
        if (card.plotId) assistant_plot_id.value = card.plotId;
        assistant_input.value = '执行当前地块灌溉';
        await send_assistant_message();
        return;
      }
      if (card.kind === 'DIAGNOSIS') {
        navigate('advice');
        await load_advice_decision(card.plotId);
        show_advice_diagnosis.value = true;
        return;
      }
      if (card.kind === 'TASK') {
        navigate('tasks');
        return;
      }
      if (card.kind === 'FORECAST') {
        const plot = find_plot_by_id(plots.value, card.plotId);
        if (plot) open_plot(plot);
        else navigate('dashboard');
        return;
      }
      if (card.kind === 'INSPECTION') {
        navigate('inspections');
        open_evidence_form(card.plotId);
      }
    };

    const assistant_history_message = (item, question, plot) => {
      const response = {
        narrative: item.content,
        summary: item.content,
        intent: item.intent,
        traceId: item.traceId,
        adapter: item.adapter,
        degraded: item.degraded,
        knowledgeEvidence: item.knowledgeEvidence,
        actionProposal: item.actionProposal,
        agentRole: item.agentRole,
        role: item.agentRole,
        roleLabel: item.roleLabel,
        roleProfile: item.roleProfile,
        result: item.result,
        plan: item.plan,
        diagnosis: item.diagnosis,
        workItems: item.workItems,
        context: item.context,
        confidence: item.confidence,
        readiness: item.readiness,
        warnings: item.warnings,
        scenarioLabel: item.scenarioLabel
      };
      const turn = normalizeAgentTurn(response, question, { plot, role: user.value?.role || 'FARMER', sessionMode: is_formal_session ? 'live' : 'demo' });
      return { id: item.messageId || `assistant-${Date.now()}-${Math.random()}`, role: 'assistant', content: turn.answer, sourceLabel: turn.sourceLabel, degraded: turn.degraded, intentLabel: turn.intentLabel, facts: turn.facts || [], recommendations: turn.recommendations || [], turn, actionProposal: turn.actionProposal || item.actionProposal || null, detailsOpen: false };
    };

    const refresh_assistant_action_states = async (messageList = assistant_messages.value) => {
      const proposals = [];
      const seen = new Set();
      (Array.isArray(messageList) ? messageList : []).forEach((message) => {
        const proposal = message?.actionProposal;
        if (!proposal?.actionId || seen.has(proposal.actionId)) return;
        seen.add(proposal.actionId);
        proposals.push({ message, proposal });
      });
      await Promise.all(proposals.map(async ({ message, proposal }) => {
        try {
          const latest = await api.getAgentAction(proposal.actionId);
          Object.assign(proposal, latest);
          // `normalizeAgentTurn` keeps its own proposal copy.  Keep both
          // references aligned so the card and the expanded audit details
          // cannot disagree after a conversation is re-opened.
          if (message?.turn?.actionProposal && message.turn.actionProposal !== proposal) {
            Object.assign(message.turn.actionProposal, latest);
          }
        } catch {
          // A missing legacy action row should not erase the immutable
          // proposal embedded in history; retain it as the best fallback.
        }
      }));
      return messageList;
    };

    const load_assistant_conversations = async ({ openRecent = true } = {}) => {
      try {
        assistant_service_status.value = is_formal_session ? 'CONNECTING' : 'DEMO';
        const list = await api.getAgentConversations(20);
        assistant_conversations.value = Array.isArray(list) ? list : [];
        assistant_error.value = '';
        assistant_service_status.value = is_formal_session ? 'READY' : 'DEMO';
        if (openRecent && assistant_conversations.value.length) {
          const currentId = assistant_conversation_id.value;
          const currentExists = currentId && assistant_conversations.value.some((item) => item.conversationId === currentId);
          if (!assistant_messages.value.length || !currentExists) {
            await select_assistant_conversation(assistant_conversations.value[0].conversationId);
          } else {
            // Returning from another route must re-read durable action state;
            // history messages intentionally contain only a render snapshot.
            await refresh_assistant_action_states();
          }
        }
        if (!assistant_conversation_id.value) assistant_conversation_id.value = assistant_create_conversation_id();
      } catch (error) {
        assistant_service_status.value = is_formal_session ? 'DEGRADED' : 'DEMO';
        assistant_error.value = `历史对话暂不可用：${error.message || '服务异常'}`;
        if (!assistant_conversation_id.value) assistant_conversation_id.value = assistant_create_conversation_id();
      }
    };

    const select_assistant_conversation = async (conversationId) => {
      if (!conversationId || assistant_busy.value) return;
      assistant_busy.value = true;
      assistant_error.value = '';
      try {
        const payload = await api.getAgentHistory(conversationId, 100);
        const rawMessages = Array.isArray(payload?.messages) ? payload.messages : [];
        const next = [];
        let latestQuestion = '';
        rawMessages.forEach((item) => {
          const role = String(item?.role || '').toUpperCase();
          if (role === 'USER') {
            latestQuestion = agentHistoryUserText(item.content, '已上传现场图片');
            next.push({ id: item.messageId || `user-${Date.now()}-${next.length}`, role: 'user', content: latestQuestion, plotId: item.plotId || '' });
          } else if (role === 'ASSISTANT') {
            const plot = find_plot_by_id(plots.value, item.plotId || assistant_plot_id.value);
            next.push(assistant_history_message(item, latestQuestion, plot));
          }
        });
        await refresh_assistant_action_states(next);
        assistant_messages.value = next;
        assistant_conversation_id.value = conversationId;
        if (payload?.conversation?.plotId) assistant_plot_id.value = payload.conversation.plotId;
        assistant_drawer_open.value = false;
      } catch (error) {
        assistant_error.value = error.message || '历史消息读取失败';
      } finally {
        assistant_busy.value = false;
        await nextTick();
        const host = assistant_message_list.value;
        if (host) host.scrollTop = host.scrollHeight;
      }
    };

    const start_assistant_conversation = () => {
      assistant_conversation_id.value = assistant_create_conversation_id();
      assistant_messages.value = [];
      assistant_input.value = '';
      assistant_error.value = '';
      assistant_drawer_open.value = false;
      assistant_action_busy.value = '';
    };

    const refresh_assistant_impacts = async () => {
      if (is_formal_session) {
        await load_live_workspace({ announce: false });
        return;
      }
      try {
        const assignedPlotIds = new Set(plots.value.map((plot) => String(plot.plotId)));
        const rawPlots = await api.getPlots({ farmId: farm.value.farmId || 'farm-demo', includeInactive: true });
        const normalizedPlots = (rawPlots || [])
          .filter((plot) => !assignedPlotIds.size || assignedPlotIds.has(String(plot.plotId)))
          .filter((plot) => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE')
          .map((plot) => ({ ...plot, healthScore: compute_plot_health_score(plot) }));
        const selectedPlotId = selected_plot.value?.plotId || advice_selected_plot.value?.plotId || assistant_plot_id.value;
        const orderedNormalizedPlots = replace_plots_in_order(normalizedPlots);
        selected_plot.value = orderedNormalizedPlots.find((plot) => plot.plotId === selectedPlotId) || orderedNormalizedPlots[0] || null;
        advice_selected_plot.value = orderedNormalizedPlots.find((plot) => plot.plotId === advice_selected_plot.value?.plotId) || orderedNormalizedPlots[0] || null;
        if (!orderedNormalizedPlots.some((plot) => plot.plotId === assistant_plot_id.value)) assistant_plot_id.value = orderedNormalizedPlots[0]?.plotId || '';
        const rawTasks = await api.getWorkOrders({ farmId: farm.value.farmId || 'farm-demo' });
        const plotMap = new Map(normalizedPlots.map((plot) => [String(plot.plotId), plot]));
        const normalizedTasks = rawTasks.map((work) => normalizeFarmerTask(work, plotMap));
        replace_ref_array(tasks, normalizedTasks);
        const records = [];
        for (const plot of normalizedPlots) records.push(...await api.getInspections(plot.plotId));
        replace_ref_array(inspection_records, records);
        apply_messages(buildFarmerMessages({ alerts: Array.from(api.demoAlerts?.values?.() || []), tasks: normalizedTasks, inspections: records, plots: normalizedPlots }));
      } catch (error) {
        assistant_error.value = `数据刷新失败：${error.message || '请稍后重试'}`;
      }
    };

    const wait_for_assistant_action = async (proposal) => {
      if (!is_formal_session || !proposal?.actionId) return proposal;
      const terminal = new Set(['SUCCEEDED', 'FAILED', 'PARTIAL', 'TIMEOUT', 'CANCELED', 'EXPIRED']);
      let latest = proposal;
      for (let attempt = 0; attempt < 12 && !terminal.has(String(latest?.status || '').toUpperCase()); attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        try {
          latest = await api.getAgentAction(proposal.actionId);
          Object.assign(proposal, latest);
        } catch {
          // The initial confirmation result remains useful when an older
          // backend does not expose the optional action status endpoint.
          break;
        }
      }
      return latest;
    };

    const confirm_assistant_action = async (proposal) => {
      if (!proposal?.actionId || proposal.status !== 'AWAITING_CONFIRMATION' || assistant_action_busy.value) return;
      assistant_action_busy.value = proposal.actionId;
      try {
        const result = await api.confirmAgentAction(proposal.actionId, { idempotencyKey: `agent-confirm:${proposal.actionId}` });
        Object.assign(proposal, result, { status: result?.status || 'SUCCEEDED' });
        if (proposal.status === 'EXECUTING') await wait_for_assistant_action(proposal);
        await refresh_assistant_impacts();
        show_toast(proposal.status === 'SUCCEEDED' ? '操作已完成，相关数据已刷新' : '操作未完成，请查看结果', proposal.status === 'SUCCEEDED' ? 'success' : 'error');
      } catch (error) {
        Object.assign(proposal, { status: error.code === 'AGENT_ACTION_EXPIRED' ? 'EXPIRED' : 'FAILED', error: error.message || '操作失败' });
        show_toast(error.message || '操作失败', 'error');
      } finally {
        assistant_action_busy.value = '';
      }
    };

    const cancel_assistant_action = async (proposal) => {
      if (!proposal?.actionId || proposal.status !== 'AWAITING_CONFIRMATION' || assistant_action_busy.value) return;
      assistant_action_busy.value = proposal.actionId;
      try {
        const result = await api.cancelAgentAction(proposal.actionId);
        Object.assign(proposal, result, { status: result?.status || 'CANCELED' });
        show_toast('已取消该操作预览');
      } catch (error) {
        Object.assign(proposal, { status: error.code === 'AGENT_ACTION_EXPIRED' ? 'EXPIRED' : 'FAILED', error: error.message || '取消失败' });
        show_toast(error.message || '取消失败', 'error');
      } finally {
        assistant_action_busy.value = '';
      }
    };

    const toggle_assistant_details = (message) => { if (message) message.detailsOpen = !message.detailsOpen; };

    const send_assistant_message = async () => {
      const question = assistant_input.value.trim();
      if (!question) {
        show_toast('请先输入想了解的农事问题', 'error');
        return;
      }
      if (assistant_busy.value) return;
      if (!assistant_conversation_id.value) assistant_conversation_id.value = assistant_create_conversation_id();
      const plot_id = assistant_plot_id.value || advice_selected_plot.value?.plotId || selected_plot.value?.plotId || plots.value[0]?.plotId;
      const plot = find_plot_by_id(plots.value, plot_id);
      assistant_messages.value.push({ id: `user-${Date.now()}`, role: 'user', content: question, plotId: plot_id || '' });
      assistant_input.value = '';
      assistant_busy.value = true;
      assistant_error.value = '';
      try {
        const response = await api.agentChat(question, plot_id || undefined, assistant_conversation_id.value);
        const turn = normalizeAgentTurn(response, question, {
          plot,
          role: user.value?.role || 'FARMER',
          sessionMode: is_formal_session ? 'live' : 'demo'
        });
        const auditTraceId = response?.traceId || `demo-${Date.now()}`;
        const audit = await api.getAgentRun(auditTraceId).catch(() => null);
        turn.audit = audit;
        qa_audit.value = audit;
        apply_qa_turn(turn);
        assistant_messages.value.push({ id: `assistant-${response?.traceId || Date.now()}`, role: 'assistant', content: turn.answer, sourceLabel: turn.sourceLabel, degraded: turn.degraded, intentLabel: turn.intentLabel, facts: turn.facts || [], recommendations: turn.recommendations || [], turn, actionProposal: turn.actionProposal || response?.actionProposal || null, audit, detailsOpen: false });
        assistant_service_status.value = turn.degraded ? 'DEGRADED' : (is_formal_session ? 'READY' : 'DEMO');
        await load_assistant_conversations({ openRecent: false });
      } catch (error) {
        assistant_service_status.value = is_formal_session ? 'DEGRADED' : 'DEMO';
        assistant_error.value = `智能问答暂不可用：${error.message || '后端服务错误'}`;
        show_toast(assistant_error.value, 'error');
      } finally {
        assistant_busy.value = false;
        await nextTick();
        const host = assistant_message_list.value;
        if (host) host.scrollTop = host.scrollHeight;
      }
    };

    const ask_assistant_shortcut = (question) => {
      assistant_input.value = question;
      void send_assistant_message();
    };

    const assistant_keydown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void send_assistant_message();
      }
    };

    const ask_question = send_assistant_message;

    const open_inspection_form = (plot_id = selected_plot.value?.plotId || plots.value[0]?.plotId, work_order_id = '') => {
      navigate('inspections');
      inspection_form.value = {
        plot_id: plot_id || '',
        work_order_id: work_order_id || '',
        soil_surface: 'NORMAL',
        crop_condition: 'HEALTHY',
        moisture: find_plot_by_id(plots.value, plot_id)?.metrics?.SOIL_MOISTURE?.value ?? '',
        notes: '',
        photos: []
      };
      show_inspection_form.value = true;
    };

    const close_inspection_form = () => { show_inspection_form.value = false; };

    const on_inspection_photos = (event) => {
      inspection_form.value.photos = Array.from(event.target.files || []).slice(0, 6);
    };

    const submit_inspection = async () => {
      const plot = find_plot_by_id(plots.value, inspection_form.value.plot_id);
      if (!plot || !inspection_form.value.notes) {
        show_toast('请填写地块和现场说明', 'error');
        return;
      }
      const moisture_text = String(inspection_form.value.moisture ?? '').trim();
      const portable_moisture = moisture_text === '' ? null : Number(moisture_text);
      if (moisture_text !== '' && !Number.isFinite(portable_moisture)) {
        show_toast('便携仪含水率必须是数字，未知时请留空', 'error');
        return;
      }
      if (is_formal_session) {
        try {
          const saved = await api.createInspection({
            farmId: farm.value.farmId || session_user?.farmIds?.find((id) => id !== '*'),
            plotId: plot.plotId,
            workOrderId: inspection_form.value.work_order_id || undefined,
            observedAt: new Date().toISOString(),
            soilSurface: inspection_form.value.soil_surface,
            cropCondition: inspection_form.value.crop_condition,
            portableSoilMoisture: portable_moisture,
            notes: inspection_form.value.notes.trim()
          }, inspection_form.value.photos);
          const recordWithName = {
            ...saved,
            plotName: plot.name
          };
          const existingIndex = inspection_records.value.findIndex((record) => record.inspectionId === saved.inspectionId);
          if (existingIndex >= 0) inspection_records.value.splice(existingIndex, 1, recordWithName);
          else inspection_records.value.unshift(recordWithName);
          close_inspection_form();
          const refreshed = await load_live_workspace({ announce: false });
          if (saved?.photoUploadError) {
            show_toast(`巡田记录已保存，照片上传失败：${saved.photoUploadError}`, 'warning');
          } else if (!refreshed || operation_record_load_error.value) {
            show_toast(`巡田记录已保存，但列表刷新失败：${operation_record_load_error.value || load_error.value || '请稍后重试'}`, 'warning');
          } else {
            show_toast('巡田记录已保存，管理员和诊断模块可读取');
          }
          if (saved?.sensorConflict) {
            show_toast(saved.sensorConflict.message, 'error');
          }
        } catch (error) {
          show_toast(error.message || '巡田记录保存失败', 'error');
        }
        return;
      }
      try {
        const saved = await api.createInspection({
          farmId: farm.value.farmId || 'farm-demo',
          plotId: plot.plotId,
          workOrderId: inspection_form.value.work_order_id || undefined,
          observedAt: new Date().toISOString(),
          soilSurface: inspection_form.value.soil_surface,
          cropCondition: inspection_form.value.crop_condition,
          portableSoilMoisture: portable_moisture,
          notes: inspection_form.value.notes.trim()
        }, inspection_form.value.photos);
        inspection_records.value.unshift({ ...saved, plotName: plot.name });
        close_inspection_form();
        show_toast('演示巡田记录已保存');
        if (saved?.sensorConflict) {
          show_toast(saved.sensorConflict.message, 'error');
        }
      } catch (error) {
        show_toast(error.message || '巡田记录保存失败', 'error');
      }
    };

    const open_evidence_form = (plot_id = selected_plot.value?.plotId || plots.value[0]?.plotId) => {
      navigate('inspections');
      evidence_form.value = { plot_id: plot_id || '', type: 'FIELD_INSPECTION', reason: '' };
      show_evidence_form.value = true;
    };

    const close_evidence_form = () => { show_evidence_form.value = false; };

    const submit_evidence_request = async () => {
      if (!evidence_form.value.reason) {
        show_toast('请填写申请原因', 'error');
        return;
      }
      if (is_formal_session) {
        const plot = find_plot_by_id(plots.value, evidence_form.value.plot_id);
        if (!plot) {
          show_toast('请选择有效地块', 'error');
          return;
        }
        try {
          const saved = await api.createWorkOrder({
            farmId: farm.value.farmId || session_user?.farmIds?.find((id) => id !== '*'),
            plotId: plot.plotId,
            title: `${evidence_type_label(evidence_form.value.type)}补证申请`,
            reason: evidence_form.value.reason.trim(),
            sourceType: 'READINESS',
            actionType: 'INSPECTION',
            priority: 'MEDIUM',
            evidenceType: evidence_form.value.type
          });
          evidence_requests.value.unshift({
            id: saved.workOrderId || saved.id,
            plotId: saved.plotId || plot.plotId,
            type: saved.evidenceType || evidence_form.value.type,
            reason: saved.reason || evidence_form.value.reason.trim(),
            status: saved.status || 'OPEN',
            createdAt: saved.createdAt || new Date().toISOString(),
            requesterId: saved.requesterId || saved.createdBy || session_user?.userId,
            requesterName: saved.requesterName || saved.createdBy || session_user?.username,
            dataOrigin: 'BACKEND'
          });
          close_evidence_form();
          const refreshed = await load_live_workspace({ announce: false });
          if (!refreshed) show_toast(`补证申请已提交，但列表刷新失败：${load_error.value || '请稍后重试'}`, 'warning');
          else show_toast('补证申请已提交，管理员工作台可直接分配');
        } catch (error) {
          show_toast(error.message || '补证申请提交失败', 'error');
        }
        return;
      }
      try {
        const plot = find_plot_by_id(plots.value, evidence_form.value.plot_id);
        if (!plot) {
          show_toast('请选择有效地块', 'error');
          return;
        }
        const saved = await api.createDecisionEvidenceRequest(`demo-readiness-${Date.now()}`, {
          farmId: farm.value.farmId || 'farm-demo',
          plotId: plot.plotId,
          title: `${evidence_type_label(evidence_form.value.type)}补证申请`,
          reason: evidence_form.value.reason.trim(),
          sourceType: 'READINESS',
          actionType: 'INSPECTION',
          priority: 'MEDIUM',
          evidenceType: evidence_form.value.type
        });
        evidence_requests.value.unshift({
          id: saved.workOrderId || saved.id,
          plotId: saved.plotId || plot.plotId,
          type: saved.evidenceType || evidence_form.value.type,
          reason: saved.reason || evidence_form.value.reason.trim(),
          status: saved.status || 'OPEN',
          createdAt: saved.createdAt || new Date().toISOString(),
          requesterId: saved.requesterId || saved.createdBy || session_user?.userId,
          requesterName: saved.requesterName || saved.createdBy || session_user?.username,
          dataOrigin: 'SIMULATED'
        });
        close_evidence_form();
        show_toast('演示补证申请已提交，管理员会安排处理');
      } catch (error) {
        show_toast(error.message || '补证申请提交失败', 'error');
      }
    };

    const open_account_modal = () => {
      close_profile_menu();
      password_form.value = { current: '', next: '', confirm: '' };
      password_error.value = '';
      show_account_modal.value = true;
    };

    const close_account_modal = () => { show_account_modal.value = false; };

    const change_password = async () => {
      password_error.value = '';
      if (!password_form.value.current) {
        password_error.value = '请输入当前密码';
        return;
      }
      if (password_form.value.next.length < 8) {
        password_error.value = '新密码至少需要 8 位，并同时包含字母和数字';
        return;
      }
      if (password_form.value.next !== password_form.value.confirm) {
        password_error.value = '两次输入的新密码不一致';
        return;
      }
      if (is_formal_session) {
        try {
          await api.changePassword({ currentPassword: password_form.value.current, newPassword: password_form.value.next });
      close_account_modal();
          show_toast('密码已更新，当前登录仍然有效，旧令牌已失效');
        } catch (error) {
          password_error.value = error.message || '密码修改失败';
        }
        return;
      }
      close_account_modal();
      show_toast('演示密码修改成功');
    };

    const forgot_password = () => {
      close_profile_menu();
      show_toast(is_formal_session ? '请退出后在登录页使用恢复码重设密码' : `演示找回密码指引：${user.value.contact}`);
    };

    const close_task = () => { selected_task.value = null; };

    const task_has_active_issue_report = (task) => {
      if (!task?.issueReportId) return false;
      const status = String(task.issueReportStatus || 'OPEN').trim().toUpperCase();
      return !['DONE', 'CANCELLED', 'REJECTED'].includes(status);
    };

    const open_issue_report = (task) => {
      if (!task?.workOrderId && is_formal_session) {
        show_toast('当前任务缺少工单编号，暂不能上报问题', 'error');
        return;
      }
      if (['DONE', 'CANCELLED'].includes(farmer_task_status(task))) {
        show_toast('已结束任务不能上报新问题', 'warning');
        return;
      }
      if (task_has_active_issue_report(task)) {
        show_toast('该任务的问题已上报，等待农场管理员处理', 'warning');
        return;
      }
      issue_report_task.value = find_task_by_identity(tasks.value, task) || task;
      issue_report_form.value = { description: '', priority: 'HIGH' };
      issue_report_error.value = '';
      show_issue_report_modal.value = true;
    };

    const close_issue_report = (force = false) => {
      if (issue_report_busy.value && !force) return;
      show_issue_report_modal.value = false;
      issue_report_task.value = null;
      issue_report_error.value = '';
    };

    const submit_issue_report = async () => {
      if (issue_report_busy.value) return;
      const task = issue_report_task.value;
      const description = String(issue_report_form.value.description || '').trim();
      if (description.length < 2) {
        issue_report_error.value = '请具体描述遇到的问题（至少 2 个字）';
        return;
      }
      if (description.length > 1000) {
        issue_report_error.value = '问题描述不能超过 1000 个字';
        return;
      }
      if (!task?.workOrderId && is_formal_session) {
        issue_report_error.value = '当前任务缺少工单编号，无法上报';
        return;
      }
      if (!task?.workOrderId) {
        const now = new Date().toISOString();
        patch_task_state(task, {
          issueReportId: task.issueReportId || `demo-farmer-report-${task.id || Date.now()}`,
          issueReportStatus: 'OPEN',
          issueReportDescription: description,
          issueReportedAt: now,
          issueReportedBy: session_user?.userId || user.value?.userId || ''
        });
        close_issue_report(true);
        show_toast('演示问题已记录；正式环境提交后会同步给农场管理员');
        return;
      }
      issue_report_busy.value = true;
      issue_report_error.value = '';
      try {
        const saved = await api.reportWorkOrderIssue(task.workOrderId, {
          description,
          priority: issue_report_form.value.priority || 'HIGH'
        });
        const report = saved?.report || saved || {};
        const reportId = report.workOrderId || report.workItemId || saved?.reportWorkOrderId;
        patch_task_state(task, {
          issueReportId: reportId || task.issueReportId,
          issueReportStatus: report.status || 'OPEN',
          issueReportDescription: description,
          issueReportedAt: new Date().toISOString(),
          issueReportedBy: session_user?.userId || user.value?.userId || ''
        });
        if (is_formal_session) await load_live_workspace({ announce: false });
        close_issue_report(true);
        show_toast(saved?.reused ? '该问题已上报，管理员正在处理' : '问题已上报，农场管理员已收到');
      } catch (error) {
        issue_report_error.value = error?.message || '问题上报失败，请稍后重试';
        show_toast(issue_report_error.value, 'error');
      } finally {
        issue_report_busy.value = false;
      }
    };

    const retry_operation_records = async () => {
      const refreshed = await load_live_workspace({ announce: false, trackProgress: false });
      if (!refreshed) show_toast(`巡田记录和补证申请刷新失败：${load_error.value || '正式数据读取失败'}`, 'error');
      else if (operation_record_load_error.value) show_toast(`巡田记录刷新失败：${operation_record_load_error.value}`, 'error');
      else show_toast('巡田记录和补证申请已刷新');
      return refreshed && !operation_record_load_error.value;
    };

    const start_task = async (task) => {
      if (is_formal_session) {
        try {
          const saved = await api.transitionWorkOrder(task.workOrderId, { action: 'START', note: '农户开始执行任务' });
          patch_task_state(task, { ...(saved || {}), status: saved?.status || 'IN_PROGRESS' });
          close_task();
          await load_live_workspace({ announce: false });
          show_toast(`已开始执行：${task.title}`);
        } catch (error) { show_toast(error.message || '开始任务失败', 'error'); }
        return;
      }
      patch_task_state(task, { status: 'IN_PROGRESS' });
      show_toast(`已开始执行：${task.title}`);
      close_task();
    };

    const complete_task = async (task) => {
      if (is_formal_session) {
        try {
          const saved = await api.transitionWorkOrder(task.workOrderId, { action: 'SUBMIT', resultSummary: '农户已提交现场处理结果' });
          patch_task_state(task, { ...(saved || {}), status: saved?.status || 'SUBMITTED' });
          close_task();
          await load_live_workspace({ announce: false });
          show_toast(`已提交完成：${task.title}，等待管理员验收`);
        } catch (error) { show_toast(error.message || '提交任务失败', 'error'); }
        return;
      }
      patch_task_state(task, { status: 'DONE' });
      show_toast(`已提交完成：${task.title}`);
      close_task();
    };

    // Keep the old method name for any embedded callers while routing all
    // reports through the form and the dedicated idempotent API.
    const report_issue = (task) => open_issue_report(task);

    const submit_resource_request = async () => {
      if (resource_request_busy.value) return;
      if (resource_collaboration_read_only.value) { show_toast(resource_sync_label.value, 'error'); return; }
      if (resource_request_locked.value) { show_toast('当前需求已进入确认或执行阶段，请先完成本轮协同', 'error'); return; }
      const plot = advice_selected_plot.value || advice_plot.value || plots.value[0];
      const amount = Number(resource_request_form.value.requestedLitres);
      if (!plot || !Number.isFinite(amount) || amount <= 0) { show_toast('请选择地块并填写有效申请水量', 'error'); return; }
      const toIso = value => value ? new Date(value).toISOString() : '';
      resource_request_busy.value = true;
      try {
        const saved = await api.createResourceRequest({
          farmId: farm.value.farmId || plot.farmId || 'farm-demo', plotId: plot.plotId, requestedLitres: amount,
          preferredStart: toIso(resource_request_form.value.preferredStart), preferredEnd: toIso(resource_request_form.value.preferredEnd),
          constraints: resource_request_form.value.constraints, note: resource_request_form.value.note
        });
        resource_requests.value = [saved, ...resource_requests.value.filter(item => item.resourceRequestId !== saved.resourceRequestId)];
        resource_request_form.value.note = ''; resource_request_response_note.value = '';
        show_toast('用水需求已提交，农场管理员将收到协同提醒');
      } catch (error) {
        if (error?.code === 'RESOURCE_PERSISTENCE_UNAVAILABLE') resource_persistence_status.value = 'IN_MEMORY_FALLBACK';
        show_toast(error.message || '用水需求提交失败', 'error');
      }
      finally { resource_request_busy.value = false; }
    };

    const respond_resource_request = async action => {
      const request = selected_resource_request.value;
      if (!request || resource_request_busy.value) return;
      if (resource_collaboration_read_only.value) { show_toast(resource_sync_label.value, 'error'); return; }
      if (action === 'REPORT_CONFLICT' && !resource_request_response_note.value.trim()) { show_toast('请先说明时段、人员或水量冲突', 'error'); return; }
      resource_request_busy.value = true;
      try {
        const saved = await api.actOnResourceRequest(request.resourceRequestId, { action, note: resource_request_response_note.value.trim() });
        resource_requests.value = resource_requests.value.map(item => item.resourceRequestId === saved.resourceRequestId ? saved : item);
        resource_request_response_note.value = '';
        show_toast(action === 'ACKNOWLEDGE' ? '已确认分配安排，管理员端将实时同步' : action === 'WITHDRAW' ? '需求已撤回' : '冲突已反馈，管理员将重新复核');
      } catch (error) {
        if (error?.code === 'RESOURCE_PERSISTENCE_UNAVAILABLE') resource_persistence_status.value = 'IN_MEMORY_FALLBACK';
        show_toast(error.message || '协同回执提交失败', 'error');
      }
      finally { resource_request_busy.value = false; }
    };

    const delete_task = async (task) => {
      const workOrderId = task.workOrderId || task.id;
      try {
        await api.deleteWorkOrder(workOrderId);
        tasks.value = tasks.value.filter((t) => (t.workOrderId || t.id) !== workOrderId);
        if (selected_task.value && (selected_task.value.workOrderId || selected_task.value.id) === workOrderId) {
          selected_task.value = null;
        }
        show_toast('已删除完成任务');
      } catch (error) {
        show_toast(error.message || '删除失败', 'error');
      }
    };

    const delete_all_completed_tasks = async () => {
      const completed = farmer_visible_tasks.value.filter((t) => ['DONE', 'CANCELLED'].includes(farmer_task_status(t)));
      if (!completed.length) {
        show_toast('没有可删除的已完成任务');
        return;
      }
      try {
        await Promise.all(completed.map((task) => api.deleteWorkOrder(task.workOrderId || task.id)));
        const ids = new Set(completed.map((task) => task.workOrderId || task.id));
        tasks.value = tasks.value.filter((t) => !ids.has(t.workOrderId || t.id));
        if (selected_task.value && ids.has(selected_task.value.workOrderId || selected_task.value.id)) {
          selected_task.value = null;
        }
        show_toast(`已删除 ${completed.length} 个已完成任务`);
      } catch (error) {
        show_toast(error.message || '删除失败', 'error');
      }
    };

    const load_farmer_enhancements = async () => {
      if (farmer_enhancements_refresh_in_flight) return false;
      farmer_enhancements_refresh_in_flight = true;
      try {
        const forecastPlot = plots.value.slice().sort((a, b) => {
          try { return health_score(a) - health_score(b); }
          catch (error) { return 0; }
        })[0] || plots.value[0];
        const forecastPromise = forecastPlot
          ? api.getRiskForecast(forecastPlot.plotId, 'SOIL_MOISTURE')
          : Promise.resolve({ status: 'UNAVAILABLE', reason: '没有可预测的地块' });
        const demands = plots.value.map((plot) => {
          let band = 'OK';
          try { band = resolve_moisture_band_status(plot); }
          catch (error) { band = 'OK'; }
          return {
            plotId: plot.plotId,
            requestedLitres: band === 'ALERT' ? 153 : (band === 'WARN' ? 96 : 60),
            priority: band === 'ALERT' ? 'HIGH' : (band === 'WARN' ? 'MEDIUM' : 'LOW'),
            windowStart: '18:00',
            windowEnd: '20:00'
          };
        });
        const resourcePromise = Promise.all([
          api.getWaterResourceProfile(farm.value.farmId || 'farm-demo'),
          api.listResourcePlans({ farmId: farm.value.farmId || 'farm-demo' }),
          api.listResourceRequests({ farmId: farm.value.farmId || 'farm-demo' }),
          api.evaluateResourcePlan({
            scope: farm.value.farmId || 'farm-demo',
            constraints: { waterCapacityLitres: MOCK_DATA.resourceProfile?.remainingLitres || 0 },
            demands
          }).catch(() => null)
        ]);
        const [forecastResult, resourceResult] = await Promise.allSettled([forecastPromise, resourcePromise]);
        risk_forecast.value = forecastResult.status === 'fulfilled'
          ? forecastResult.value
          : { status: 'UNAVAILABLE', reason: forecastResult.reason?.message || '预测服务暂不可用' };
        if (resourceResult.status === 'fulfilled') {
          const [waterProfile, plans, requests, evaluation] = resourceResult.value || [];
          const authoritative = (plans || []).find((plan) => ['CONFIRMED', 'RUNNING', 'COMPLETED', 'PARTIAL'].includes(String(plan.status || '').toUpperCase())) || (plans || []).find((plan) => plan.status === 'DRAFT');
          resource_plan.value = authoritative
            ? { ...authoritative, waterProfile }
            : evaluation
              ? { ...evaluation, waterProfile, previewOnly: true }
              : { allocations: [], waterProfile };
          resource_requests.value = requests || [];
        } else resource_plan.value = null;
        return true;
      } catch (error) {
        risk_forecast.value = { status: 'UNAVAILABLE', reason: error?.message || '预测服务暂不可用' };
        resource_plan.value = null;
        return false;
      } finally {
        farmer_enhancements_refresh_in_flight = false;
      }
    };

    // Enhancement endpoints are useful but must not gate the first usable
    // farmer screen. A stalled proxy/device request is allowed to finish in
    // the background while the bootstrap continues after this deadline.
    const BOOTSTRAP_TIMEOUT = Symbol('farmer-bootstrap-timeout');
    const with_bootstrap_timeout = (task, timeout_ms = 8000) => {
      let timer = null;
      const operation = Promise.resolve().then(task);
      const timeout = new Promise((resolve) => {
        timer = window.setTimeout(() => resolve(BOOTSTRAP_TIMEOUT), timeout_ms);
      });
      return Promise.race([operation, timeout]).finally(() => {
        if (timer !== null) window.clearTimeout(timer);
      });
    };
    const defer_workspace_refresh = (task) => {
      const run = () => {
        Promise.resolve().then(task).catch((error) => {
          console.warn('[农智闭环] 延迟刷新失败：', error);
        });
      };
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1400 });
      else window.setTimeout(run, 900);
    };

    onMounted(async () => {
      bootstrap_loading.value = true;
      begin_workspace_progress('正在准备农户工作台…');
      try {
        user_settings.value = readUserSettings(undefined, user.value);
        applyUserSettings(user_settings.value);
        is_dark.value = resolveTheme(user_settings.value.theme) === 'dark';
        // Keep the current farmer page across refresh / back-forward.
        if (!window.location.hash) {
          window.history.replaceState(null, '', farmer_hash_for(current_view.value, tools_tab.value));
        } else {
          apply_farmer_hash();
        }
        window.addEventListener('hashchange', apply_farmer_hash);
        if (is_formal_session) {
          // Core authenticated calls establish live availability themselves.
          // A separate public health round trip added several seconds through
          // the remote tunnel before useful data loading could even begin.
          set_workspace_progress(12, '正在读取正式数据…');
          // Preference ordering is cosmetic; resolve it alongside the core
          // requests instead of making it another serial gate.
          void load_plot_order_preference({ announce: false });
          const corePromise = load_live_workspace_core({ announce: true, trackProgress: true });
          // Never keep the full-screen bootstrap overlay behind a slow proxy;
          // the core pass continues in the background and applies its result
          // when it eventually arrives.
          await with_bootstrap_timeout(() => corePromise, 2600);
          void corePromise.then(() => {
            defer_workspace_refresh(() => load_live_workspace({ announce: false, trackProgress: false }));
          }).then(() => {
            // A successful core request is also the first reliable transport
            // signal. Update the badge and start SSE without blocking paint.
            is_live.value = api.isLive;
            if (api.isLive) void connect_live_events({ announce: false });
          }).catch(() => {});
          is_live.value = api.isLive;
          // SSE is an enhancement backed by polling. Never keep the full-page
          // bootstrap overlay visible while a proxy holds the stream open.
          void connect_live_events({ announce: false });
        } else {
          set_workspace_progress(12, '正在检查服务状态…');
          void load_plot_order_preference({ announce: false });
          is_live.value = await api.checkHealth();
          set_workspace_progress(55, '正在载入演示数据…');
          await load_demo_operation_records();
        }
        // Forecast, simulation, irrigation and assistant panels are secondary
        // data. Hydrate them after the shell is usable so a slow endpoint can
        // never strand the full-screen bootstrap overlay.
        set_workspace_progress(96, '正在完成首屏…');
        const secondaryTasks = [
          () => load_farmer_enhancements(),
          () => load_plot_simulation(selected_plot.value?.plotId),
          () => load_irrigation_plan(advice_plot.value?.plotId, { silent: true })
        ];
        if (current_view.value === 'advice' && advice_plot.value?.plotId) {
          secondaryTasks.push(() => load_advice_decision(advice_plot.value.plotId));
        }
        if (current_view.value === 'tools') {
          secondaryTasks.push(() => tools_tab.value === 'manual'
            ? load_crop_manual()
            : load_plot_simulation(risk_tool_plot_id.value));
        }
        if (current_view.value === 'assistant') {
          secondaryTasks.push(() => load_assistant_conversations({ openRecent: true }));
        }
        void Promise.allSettled(secondaryTasks.map((task) => with_bootstrap_timeout(task))).then((results) => {
          if (results.some((result) => result.status === 'rejected' || result.value === BOOTSTRAP_TIMEOUT) && !load_error.value) {
            load_error.value = '部分预警、模拟、灌溉或辅助数据暂不可用，工作台会继续自动刷新';
          }
        });
        start_live_polling();
        start_plot_simulation_live();
      } catch (error) {
        // Optional enhancement/assistant calls must never strand the user
        // behind the bootstrap overlay. Core data that did load remains
        // visible while the error card/toast explains what is unavailable.
        if (!load_error.value) load_error.value = error?.message || '农户工作台数据加载失败';
        show_toast(`农户工作台部分数据未加载：${load_error.value}`, 'error');
      } finally {
        bootstrap_loading.value = false;
        finish_workspace_progress(load_error.value ? '部分数据未就绪' : '农户数据已就绪');
      }
    });

    watch([current_view, tools_tab], () => {
      if (current_view.value !== 'tools') return;
      if (tools_tab.value === 'manual') load_crop_manual();
      else if (risk_tool_plot.value && risk_tool_plot.value.plotId !== selected_plot.value?.plotId) {
        select_risk_tool_plot(risk_tool_plot.value.plotId);
      } else if (!plot_simulation.value || plot_simulation.value.plotId !== risk_tool_plot.value?.plotId) {
        void load_plot_simulation(risk_tool_plot.value?.plotId);
      }
      if (tools_tab.value === 'risk') void render_plot_simulation_chart();
    });

    watch([crop_manual_code, crop_manual_stage], () => {
      if (current_view.value !== 'tools' || tools_tab.value !== 'manual') return;
      load_crop_manual();
    });

    watch(selected_plot, (plot, previous) => {
      risk_tool_plot_id.value = plot?.plotId || risk_tool_plot_id.value;
      plot_stage_preview.value = plot?.stageCode || crop_stage_for(plot)?.code || '';
      // 遥测轮询会整体替换 plots 数组，同一地块也会拿到新对象引用；
      // 只有 plotId 真正变化时才重新加载模拟与预测，避免曲线容器被
      // 反复销毁重建造成闪烁。
      if (!plot?.plotId || plot.plotId === previous?.plotId) return;
      void load_plot_simulation(plot?.plotId);
    });

    watch(plots, (nextPlots) => {
      if (!nextPlots.some((plot) => plot.plotId === risk_tool_plot_id.value)) {
        risk_tool_plot_id.value = nextPlots[0]?.plotId || '';
      }
    }, { deep: true });

    watch(advice_selected_plot, (plot, previous) => {
      if (!plot?.plotId || plot.plotId === previous?.plotId) return;
      show_advice_diagnosis.value = false;
      load_irrigation_plan(plot.plotId, { silent: true });
      if (current_view.value === 'advice') void load_advice_decision(plot.plotId);
    });

    watch(current_view, (view) => {
      if (view === 'tools' && tools_tab.value === 'risk') void render_plot_simulation_chart();
      if (view === 'advice' && advice_plot.value?.plotId) {
        void load_advice_decision(advice_plot.value.plotId);
      }
      if (view === 'advice') void load_water_resource_profile();
      if (view === 'assistant') void load_assistant_conversations({ openRecent: true });
    }, { immediate: true });

    onBeforeUnmount(() => {
      if (workspace_progress_hide_timer) window.clearTimeout(workspace_progress_hide_timer);
      cancel_plot_drag();
      if (plot_click_suppress_timer !== null) window.clearTimeout(plot_click_suppress_timer);
      stop_live_polling();
      stop_plot_simulation_live();
      plot_simulation_chart_instance.value?.dispose();
      plot_simulation_chart_instance.value = null;
      window.removeEventListener('hashchange', apply_farmer_hash);
      live_events_stop?.();
      live_events_stop = null;
      api.sseAbortController?.abort();
    });

    return {
      is_formal_session,
      is_live,
      load_error,
      bootstrap_loading,
      workspace_loading,
      workspace_load_progress,
      workspace_load_label,
      is_dark,
      user_settings,
      accent_options: ACCENT_OPTIONS,
      preset_options: PRESET_OPTIONS,
      surface_style_options: SURFACE_STYLE_OPTIONS,
      current_accent_label,
      current_surface_style_label,
      current_preset_label,
      update_user_setting,
      reset_user_settings,
      is_sidebar_open,
      data_updated_label,
      user,
      farm,
      nav_items,
      current_view,
      messages,
      tasks,
      plots,
      plot_drag_state,
      plot_order_busy,
      plot_metrics,
      metric_value,
      handle_plot_card_click,
      handle_plot_pointer_down,
      cancel_plot_drag,
      selected_plot,
      chart_range,
      chart_range_options,
      plot_stage_preview,
      plot_stage_options,
      plot_stage_preview_item,
      chart_tooltip,
      show_chart_tooltip,
      hide_chart_tooltip,
      plot_charts,
      plot_simulation,
      plot_simulation_forecast,
      plot_simulation_loading,
      plot_simulation_error,
      plot_simulation_options,
      plot_simulation_scenario,

      plot_simulation_device_label,
      plot_simulation_device_status,
      plot_simulation_chart_available,
      plot_simulation_chart_el,
      plot_simulation_metric,
      plot_simulation_metric_options,
      plot_simulation_metric_label,
      plot_simulation_metric_loading,
      plot_simulation_form,
      plot_simulation_fields,
      plot_simulation_evaluating,
      plot_simulation_preview_dirty,
      plot_simulation_preview_message,
      plot_simulation_dual_track,
      plot_simulation_dual_loading,
      plot_simulation_dual_available,
      plot_simulation_dual_summary,
      show_dual_track,
      toggle_dual_track,
      select_plot_simulation_metric,
      select_plot_simulation_scenario,
      schedule_plot_simulation_preview,
      reset_plot_simulation_preview,
      load_plot_simulation,
      risk_tool_plot_id,
      risk_tool_plot,
      select_risk_tool_plot,
      advice_plot,
      advice_selected_plot,
      select_advice_plot,
      operation_subsystem,
      operation_subsystem_options,
      select_operation_subsystem,
      advice_soil_chart,
      lighting_range,
      lighting_range_options,
      advice_light_chart,
      risk_plot_cards,
      moisture_range,
      moisture_range_options,
      selected_crop_band,
      irrigation_readiness,
      irrigation_amount,
      irrigation_duration_label,
      irrigation_plan,
      irrigation_readiness_detail,
      irrigation_plan_loading,
      irrigation_plan_error,
      water_resource_profile,
      water_resource_loading,
      water_resource_error,
      water_resource_summary,
      irrigation_target_label,
      advice_moisture_chart,
      selected_message,
      selected_task,
      show_issue_report_modal,
      issue_report_busy,
      issue_report_error,
      issue_report_task,
      issue_report_form,
      analyzing,
      analysis_result,
      analysis_error,
      analysis_source_label,
      inspection_records,
      evidence_requests,
      operation_record_load_error,
      retry_operation_records,
      show_inspection_form,
      show_evidence_form,
      show_account_modal,
      show_profile_menu,
      show_report_modal,
      show_weather_controls,
      show_resource_allocation,
      show_suggestion_flow,
      show_no_action_reason,
      show_manual_irrigation,
      active_suggestion,
      suggestion_flow_stage,
      suggestion_flow_steps,
      suggestion_kind_label,
      suggestion_plot,
      suggestion_block_reason,
      suggestion_emergency_notice,
      suggestion_emergency_mode,
      suggestion_confirm_checked,
      suggestion_confirm_enabled,
      suggestion_result_form,
      suggestion_result,
      suggestion_recovery_detail,
      suggestion_recovery_status,
      suggestion_busy,
      manual_irrigation_stage,
      manual_irrigation_water,
      manual_irrigation_confirmed,
      manual_irrigation_result,
      manual_irrigation_error,
      manual_irrigation_busy,
      manual_irrigation_limits,
      manual_irrigation_fallback,
      manual_irrigation_available,
      manual_irrigation_bypassed_gates,
      manual_irrigation_preview,
      format_suggestion_time,
      suggestion_outcome_label,
      report_subscribed,
      active_report,
      weather_inputs,
      degradation_banner,
      weather_risk_card,
      tools_tab,
      crop_manual_code,
      crop_manual_stage,
      crop_manual_options,
      crop_manual_pack,
      crop_manual_stages,
      crop_manual_stage_item,
      crop_manual_rules,
      crop_manual_documents,
      crop_manual_metrics_list,
      crop_manual_guide_list,
      crop_manual_error,
      select_crop_manual,
      availability_label,
      device_attention,
      batch_timeline,
      selected_allocation,
      resource_requests,
      selected_resource_request,
      resource_request_locked,
      resource_persistence_status,
      resource_persistence_ready,
      resource_collaboration_read_only,
      resource_sync_label,
      resource_request_form,
      resource_request_response_note,
      resource_request_busy,
      resource_request_status_label,
      similar_cases,
      selected_case_id,
      human_confirmation_checked,
      decision_confirmation,
      inspection_form,
      evidence_form,
      password_form,
      password_error,
      irrigation_running,
      irrigation_progress,
      advice_loading,
      advice_error,
      show_advice_diagnosis,
      advice_diagnosis_summary,
      advice_is_no_action,
      advice_readiness_summary,
      advice_execution_summary,
      advice_light_status,
      light_operation_available,
      light_operation_label,
      virtual_lighting_stage,
      virtual_lighting_confirmed,
      virtual_lighting_result,
      virtual_lighting_error,
      virtual_lighting_busy,
      virtual_lighting_boost,
      virtual_lighting_preview,
      irrigation_guard,
      automatic_watering_status,
      automatic_watering_result,
      automatic_watering_busy,
      automatic_watering_setting,
      automatic_watering_setting_busy,
      advice_passport,
      evidence_request_busy,
      advice_plan,
      advice_trace,
      feedback_busy,
      suggestion_feedback,
      assistant_input,
      assistant_messages,
      assistant_conversations,
      assistant_conversation_id,
      assistant_drawer_open,
      assistant_busy,
      assistant_action_busy,
      assistant_error,
      assistant_service_label,
      assistant_service_tone,
      assistant_source_label,
      assistant_view_state,
      current_role,
      role_presentation,
      workspace_settings_state,
      handle_workspace_settings_changed,
      assistant_plot_id,
      assistant_message_list,
      assistant_shortcuts,
      assistant_action_tone,
      assistant_action_status_label,
      assistant_risk_label,
      assistant_action_button_label,
      assistant_action_hint,
      assistant_tool_label,
      assistant_source_label_for,
      assistant_action_arguments,
      assistant_action_expiry_label,
      assistant_action_result,
      assistant_conversation_time,
      assistant_conversation_plot_label,
      start_assistant_conversation,
      select_assistant_conversation,
      ask_assistant_shortcut,
      assistant_keydown,
      send_assistant_message,
      toggle_assistant_details,
      confirm_assistant_action,
      cancel_assistant_action,
      wait_for_assistant_action,
      refresh_assistant_impacts,
      qa_input,
      qa_active_turn,
      qa_history,
      qa_audit,
      qa_details_open,
      qa_source_label,
      qa_busy,
      qa_plot_id,
      select_qa_history,
      toggle_qa_details,
      open_qa_decision_action,
      on_app_click,
      toasts,
      greeting,
      stats,
      today_priorities,
      dashboard_risk_summary,
      plot_issue_summary,
      recent_tasks,
      recent_messages,
      recent_activity,
      sorted_messages,
      filtered_messages,
      message_filter,
      message_filter_options: MESSAGE_FILTER_OPTIONS,
      message_filter_counts,
      unread_count,
      task_columns,
      farmer_task_status,
      task_has_active_issue_report,
      profile_stats,
      account_profile,
      navigate,
      toggle_sidebar,
      close_sidebar_on_mobile,
      toggle_profile_menu,
      close_profile_menu,
      open_report,
      close_report,
      toggle_report_subscription,
      toggle_theme,
      logout,
      status_label,
      priority_label,
      category_label,
      source_label,
      device_status_label,
      metric_label,
      metric_status_label,
      request_status_label,
      scenario_label,
      resource_type_label: resourceTypeLabel,
      displayText,
      alert_level_label,
      alert_status_label,
      message_actions,
      handle_message_action,
      crop_icon,
      plot_band_status,
      plot_band_label,
      metric_status_of,
      health_score,
      health_level_label,
      health_summary,
      health_ring_style,
      format_record_time,
      soil_surface_label,
      crop_condition_label,
      evidence_type_label,
      find_plot_name,
      open_message,
      open_message_from_dashboard,
      clear_read_messages,
      close_message,
      mark_read,
      generate_analysis,
      open_task,
      open_task_from_dashboard,
      open_activity_item,
      open_device_attention,
      open_priority_item,
      close_task,
      open_issue_report,
      close_issue_report,
      submit_issue_report,
      delete_task,
      delete_all_completed_tasks,
      open_plot,
      open_tools,
      load_irrigation_plan,
      toggle_automatic_watering,
      check_automatic_watering,
      toggle_irrigation,
      submit_resource_request,
      respond_resource_request,
      open_suggestion,
      close_suggestion_flow,
      open_no_action_reason,
      close_no_action_reason,
      open_manual_irrigation,
      close_manual_irrigation,
      submit_manual_irrigation,
      open_virtual_lighting,
      close_virtual_lighting,
      submit_virtual_lighting,
      prepare_suggestion_confirmation,
      confirm_suggestion_action,
      open_suggestion_inspection,
      submit_suggestion_result,
      refresh_suggestion_recovery,
      open_advice_diagnosis,
      request_missing_evidence,
      set_suggestion_feedback,
      confirm_suggestion,
      ask_question,
      open_inspection_form,
      close_inspection_form,
      on_inspection_photos,
      submit_inspection,
      open_evidence_form,
      close_evidence_form,
      submit_evidence_request,
      open_account_modal,
      close_account_modal,
      change_password,
      forgot_password,
      start_task,
      complete_task,
      report_issue
    };
  }
});

const _session = api.readSession();
const _session_user = presentRoleUser(_session?.user);
app.component('app-icon', FarmerAppIcon);
app.component('admin-ai-chat-view', AdminAiChatView);
app.component('workspace-settings-view', createWorkspaceSettingsView({ ref, computed, watch }));
if (!_session || !_session_user) {
  window.location.replace('login.html');
} else if (_session_user.role !== 'FARMER') {
  window.location.replace('index.html');
} else {
  app.mount('#farmer_app');
}
