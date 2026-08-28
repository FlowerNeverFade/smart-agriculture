import { api, PLOT_SIMULATION_SCENARIOS } from './api.js';
import { MOCK_DATA } from './mock-data.js';
import { presentRoleUser } from './roles.js';
import { buildAccountProfile } from './account-profile.js';
import {
  agentResponseSource,
  agentResponseText,
  buildFarmerMessages,
  buildFarmerProfile,
  dueLabel,
  displayText,
  mergePlotTelemetryWindow,
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
} from './live-data.js?v=20260827-boot-fix-1';

const { createApp, ref, computed, onMounted, onBeforeUnmount, watch } = Vue;

// Keep farmer.html independent from the remote Google icon font.  The same
// local Phosphor set is used by the shared admin shell, so icon geometry and
// fallback behaviour stay consistent when the server has no internet access.
const FARMER_ICON_CLASS = Object.freeze({
  menu: 'ph-list', light_mode: 'ph-sun', dark_mode: 'ph-moon', logout: 'ph-sign-out',
  expand_more: 'ph-caret-down', expand_less: 'ph-caret-up', close: 'ph-x',
  agriculture: 'ph-plant', manage_accounts: 'ph-user-gear', admin_panel_settings: 'ph-user-gear',
  today: 'ph-calendar-check', date_range: 'ph-calendar', lock_reset: 'ph-lock-key-open', help: 'ph-question',
  dashboard: 'ph-squares-four', grass: 'ph-plant', task: 'ph-check-square', fact_check: 'ph-clipboard-text',
  water_drop: 'ph-drop', forum: 'ph-chat-circle', apps: 'ph-squares-four', assignment: 'ph-clipboard-text',
  error: 'ph-x-circle', warning: 'ph-warning', warning_amber: 'ph-warning', sync: 'ph-arrows-clockwise',
  arrow_forward: 'ph-arrow-right', build_circle: 'ph-wrench', verified: 'ph-seal-check',
  event_available: 'ph-calendar-check', psychology: 'ph-brain', timeline: 'ph-chart-line-up',
  stop_circle: 'ph-stop-circle', water: 'ph-drop', check_circle: 'ph-check-circle', thumb_up: 'ph-thumbs-up',
  edit_note: 'ph-note-pencil', schedule: 'ph-clock', history: 'ph-clock-counter-clockwise',
  radio_button_checked: 'ph-check-circle', radio_button_unchecked: 'ph-circle', verified_user: 'ph-shield-check',
  smart_toy: 'ph-robot', mark_email_unread: 'ph-envelope-open', auto_awesome: 'ph-sparkle',
  insights: 'ph-chart-line-up', cloud_off: 'ph-cloud-slash', add_task: 'ph-note-pencil', assignment_late: 'ph-clipboard-text', info: 'ph-info',
  science: 'ph-flask', wifi_off: 'ph-wifi-slash', check: 'ph-check', hourglass_empty: 'ph-hourglass',
  send: 'ph-paper-plane-tilt', inbox: 'ph-tray', campaign: 'ph-megaphone'
});

const FarmerAppIcon = {
  props: { name: { type: String, default: 'check_circle' } },
  setup(props) {
    const iconClass = computed(() => FARMER_ICON_CLASS[props.name] || 'ph-circle');
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
  pepper: '🌶️'
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
  { code: 'SOIL_EC', label: '土壤电导率', unit: 'mS/cm', min: 0, max: 3, amplitude: 0.12, precision: 2, color: 'var(--g-danger)' },
  { code: 'NPK_RATIO', label: '氮磷钾肥力', unit: 'mg/kg', min: 0, max: 300, amplitude: 14, precision: 0, multi: true }
];

const CHART_RANGE_OPTIONS = [
  {
    id: '7h',
    label: '7 小时',
    title: '近 7 小时',
    amplitude_scale: 0.35,
    labels: ['6 小时前', '5 小时前', '4 小时前', '3 小时前', '2 小时前', '1 小时前', '现在']
  },
  {
    id: '24h',
    label: '24 小时',
    title: '近 24 小时',
    amplitude_scale: 0.7,
    labels: ['24 小时前', '20 小时前', '16 小时前', '12 小时前', '8 小时前', '4 小时前', '现在']
  },
  {
    id: '7d',
    label: '7 天',
    title: '近 7 天',
    amplitude_scale: 1,
    labels: ['6日前', '5日前', '4日前', '3日前', '2日前', '昨日', '今天']
  }
];

const FARMER_VIEWS = Object.freeze([
  'dashboard',
  'plots',
  'tasks',
  'inspections',
  'advice',
  'messages',
  'tools'
]);

function parse_farmer_hash(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '').trim();
  if (!raw) return 'dashboard';
  const view = raw.split(/[?&/]/)[0];
  return FARMER_VIEWS.includes(view) ? view : 'dashboard';
}

function parse_tools_tab(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '').trim();
  if (!raw.startsWith('tools')) return 'risk';
  const rest = raw.slice('tools'.length).replace(/^[/?]/, '');
  const tab = rest.split(/[?&/]/)[0];
  if (tab === 'manual') return 'manual';
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : rest;
  return new URLSearchParams(query).get('tab') === 'manual' ? 'manual' : 'risk';
}

function farmer_hash_for(view_id, tab = 'risk') {
  const view = FARMER_VIEWS.includes(view_id) ? view_id : 'dashboard';
  if (view === 'tools') return `#tools/${tab === 'manual' ? 'manual' : 'risk'}`;
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
    NPK_RATIO: '氮磷钾'
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
      label: profile.label || labels[item.code] || item.code,
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
    lines.push(`本阶段重点防范：${stage.riskFocus.map((code) => CROP_MANUAL_RISK_LABELS[code] || code).join('、')}。`);
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

function forecast_chart_model(forecast, baseMoisture, color = 'var(--g-success)') {
  const points = (forecast?.curve?.length ? forecast.curve : forecast?.horizons || [])
    .map((point) => ({
      minute: Number(point.minute ?? point.minutes ?? 0),
      expected: Number(point.expected ?? point.value)
    }))
    .filter((point) => Number.isFinite(point.minute) && Number.isFinite(point.expected));
  if (!points.length) return null;
  const values = points.map((point) => point.expected);
  const base = Number(baseMoisture);
  const min = Math.max(0, Math.floor(Math.min(...values, Number.isFinite(base) ? base : values[0]) - 5));
  const max = Math.ceil(Math.max(35, ...values, Number.isFinite(base) ? base + 5 : 0));
  const labels = points.map((point) => (point.minute === 0 ? '现在' : `${point.minute}m`));
  const boundary = Number(forecast?.stressBoundary ?? forecast?.riskBoundary?.value);
  const span = Math.max(1, max - min);
  const boundaryY = Number.isFinite(boundary) ? (10 + (1 - ((boundary - min) / span)) * 104) : null;
  return {
    labels,
    values,
    current: values[0],
    min,
    max,
    color,
    points: chart_points(values, min, max),
    grid: [
      { y: 10, label: `${max}%` },
      { y: 62, label: `${Math.round((max + min) / 2)}%` },
      { y: 114, label: `${min}%` }
    ],
    boundary,
    boundaryY,
    sample_labels: labels,
    series: [{ label: '推演含水率', color, values }]
  };
}

// The farmer view keeps this catalogue separate from MOCK_DATA so the same
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
  READY: '可以提交审批',
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
  permission: '审批权限',
  safetyLimit: '用水上限'
});

const EVIDENCE_LABELS = Object.freeze({
  FLOW_RATE_CALIBRATION: '检查流量计校准', PORTABLE_METER_COMPARISON: '使用便携仪复测',
  FRESH_TELEMETRY: '获取最新传感器数据', DEVICE_HEALTH: '检查设备在线状态',
  MORE_TELEMETRY_HISTORY: '延长遥测观察时间', CONTROL_PERMISSION: '等待管理员审批',
  GOOD_DATA_QUALITY: '补充质量合格数据', QUALITY_REVIEW: '复核数据质量',
  DIAGNOSIS_CONFIRMATION: '人工确认诊断', MORE_DIAGNOSIS_EVIDENCE: '补充诊断证据'
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
      source: `SIMULATED · ${item.ruleVersion || '已完成评价案例'}`,
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
      { label: '计划用水', value: '860 升', note: '模拟排程口径' },
      { label: '风险变化', value: '下降 2 条', note: '不代表真实收益' }
    ]
  }
});

function chart_seed(value) {
  return [...String(value || '')].reduce((seed, char) => ((seed * 31) + char.charCodeAt(0)) % 997, 17);
}

function clamp_chart_value(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parse_npk(value) {
  const numbers = String(value || '').split(':').map((item) => Number(item));
  return numbers.length === 3 && numbers.every((item) => Number.isFinite(item)) ? numbers : [0, 0, 0];
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

function chart_points(values, min, max) {
  const width = 360;
  const height = 132;
  const pad = { left: 28, right: 8, top: 10, bottom: 18 };
  const inner_width = width - pad.left - pad.right;
  const inner_height = height - pad.top - pad.bottom;
  const span = Math.max(1, max - min);
  return values.map((value, index) => {
    const x = pad.left + (index / Math.max(1, values.length - 1)) * inner_width;
    const y = pad.top + (1 - ((value - min) / span)) * inner_height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function find_chart_range(range_id) {
  return CHART_RANGE_OPTIONS.find((item) => item.id === range_id) || CHART_RANGE_OPTIONS[2];
}

function metric_chart(plot, code, range_id = '7d', stage_override = null) {
  const spec = PLOT_CHART_SPECS.find((item) => item.code === code);
  const metric = plot?.metrics?.[code];
  if (!spec || !metric) return null;

  const range = find_chart_range(range_id);
  const is_risk = metric.status === 'WARN' || metric.status === 'ALERT';
  const seed = chart_seed(`${plot.plotId}:${code}:${range.id}`);
  const pattern = [-1, -0.42, 0.55, 1.05, -0.52, 0.68, 0];
  const phase = ((seed % 7) - 3) * 0.12;
  const observedValues = Array.isArray(metric.history)
    ? metric.history
      .map((point) => Number(point?.value ?? point))
      .filter(Number.isFinite)
      .slice(-7)
    : [];
  const hasObservedHistory = observedValues.length >= 2;
  const allowDerived = plot?.dataOrigin !== 'BACKEND';
  const build_values = (base, amplitude = spec.amplitude, series_offset = 0) => pattern.map((point, index) => {
    const scaled = amplitude * range.amplitude_scale;
    const wave = (point + phase + series_offset * 0.18) * scaled;
    const drift = (index < 3 ? (2 - index) * scaled * 0.06 : 0);
    return Number(clamp_chart_value(Number(base) + wave + drift, spec.min, spec.max).toFixed(spec.precision));
  });

  const risk_color = metric.status === 'ALERT' ? 'var(--g-danger)' : 'var(--g-warning)';
  const series = spec.multi
    ? parse_npk(metric.value).map((base, index) => ({
      label: ['氮', '磷', '钾'][index],
      color: is_risk ? risk_color : ['var(--g-success)', 'var(--g-primary)', 'var(--g-warning)'][index],
      values: hasObservedHistory ? observedValues : (allowDerived ? build_values(base, spec.amplitude * (index === 1 ? 0.65 : 1), index) : [])
    }))
    : [{
      label: spec.label,
      color: is_risk ? risk_color : spec.color,
      values: hasObservedHistory ? observedValues : (allowDerived ? build_values(Number(metric.value)) : [])
    }];

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
    labels: range.labels,
    sample_labels: range.labels,
    grid,
    is_multi: Boolean(spec.multi),
    history_source: hasObservedHistory ? 'BACKEND' : (allowDerived ? 'DERIVED' : 'UNAVAILABLE'),
    history_available: hasObservedHistory,
    series: series.map((item) => ({ ...item, points: chart_points(item.values, spec.min, spec.max) }))
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
    const is_dark = ref(false);
    const is_sidebar_open = ref(true);
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

    const farm = ref(is_formal_session ? {} : MOCK_DATA.farms[0]);
    const assigned_plot_names = new Set(fallback_user.plot_names || []);
    const assigned_plots = is_formal_session ? [] : MOCK_DATA.plots.filter((plot) => assigned_plot_names.has(plot.name)).map((plot) => ({
      ...plot,
      healthScore: compute_plot_health_score(plot)
    }));
    const plots = ref(assigned_plots);

    const messages = ref(is_formal_session ? [] : (MOCK_DATA.farmer_messages || []).map(normalize_demo_message));
    const tasks = ref(is_formal_session ? [] : MOCK_DATA.farmer_tasks.map((task) => ({ ...task })));
    const inspection_records = ref(is_formal_session ? [] : (MOCK_DATA.inspections || []).map((record) => ({
      ...record,
      plotName: find_plot_by_id(MOCK_DATA.plots, record.plotId)?.name || record.plotId
    })));
    const load_error = ref('');
    let workspace_request_version = 0;
    const evidence_requests = ref([]);

    const current_view = ref(parse_farmer_hash());
    const tools_tab = ref(parse_tools_tab());
    const selected_plot = ref(plots.value[0] || null);
    const chart_range = ref('7d');
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
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const index = Math.round(ratio * Math.max(0, pointCount - 1));
      const labels = chart.sample_labels || chart.labels || [];
      const values = series
        .map((item) => ({ label: item.label, color: item.color, value: item.values?.[index] }))
        .filter((item) => Number.isFinite(Number(item.value)));
      chart_tooltip.value = {
        key,
        label: labels[index] || `第 ${index + 1} 个采样点`,
        values,
        left: Math.max(9, Math.min(91, ratio * 100)),
        top: Math.max(18, Math.min(82, ((event.clientY - rect.top) / rect.height) * 100))
      };
    };
    const hide_chart_tooltip = () => { chart_tooltip.value = null; };
    const plot_charts = computed(() => PLOT_CHART_SPECS
      .map((spec) => {
        const chart = metric_chart(selected_plot.value, spec.code, chart_range.value, plot_stage_preview_item.value);
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
      .filter(Boolean));
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
    const advice_soil_chart = computed(() => metric_chart(advice_plot.value, 'SOIL_MOISTURE', '7d'));

    // 灌溉系统页：按地块的风险小卡片（黄=偏离目标，红=低于告警阈值）
    const risk_plot_cards = computed(() => plots.value.map((plot) => {
      const bandStatus = resolve_moisture_band_status(plot);
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
        selected: advice_selected_plot.value?.plotId === plot.plotId
      };
    }));

    // 灌溉系统页：选中地块的目标值带（Crop Pack 阶段）与告警阈值（规则）
    const moisture_range = ref('7d');
    const moisture_range_options = CHART_RANGE_OPTIONS;
    const irrigation_plan = ref(null);
    const irrigation_readiness_detail = ref(null);
    const irrigation_plan_loading = ref(false);
    const irrigation_plan_error = ref('');
    let irrigation_plan_request_version = 0;
    const selected_crop_band = computed(() => {
      const plot = advice_selected_plot.value;
      if (!plot) return null;
      const pack = crop_pack_catalog.find((p) => p.cropCode === plot.cropCode);
      let low = 0;
      let high = 0;
      let cropLabel = plot.cropName;
      let stageLabel = plot.stageLabel;
      let alertThreshold = null;
      if (pack) {
        const stage = pack.stages?.find((s) => s.code === plot.stageCode) || pack.stages?.[pack.stages.length - 1];
        low = Number(stage?.target?.soilMoistureLow ?? 0);
        high = Number(stage?.target?.soilMoistureHigh ?? 0);
        cropLabel = pack.identity?.name || plot.cropName;
        stageLabel = stage?.label || plot.stageLabel;
        alertThreshold = resolve_water_deficit_threshold(pack, stage);
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
        alertThreshold
      };
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
        causeLabel: FEEDBACK_CAUSE_LABELS[cause] || cause || '待分析',
        confidenceLabel: Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '—',
        summary: diagnosis.summary || diagnosis.explanation || irrigation_plan.value?.why || advice_plan.value?.why || '系统已根据当前地块数据完成规则诊断。',
        candidates: (diagnosis.candidateCauses || []).slice(0, 3).map((item) => ({
          code: item.code,
          label: FEEDBACK_CAUSE_LABELS[String(item.code || '').toUpperCase()] || item.code,
          confidence: Number.isFinite(Number(item.confidence)) ? `${Math.round(Number(item.confidence) * 100)}%` : '—'
        })),
        supporting: (diagnosis.supportingEvidence || []).map(evidence_view),
        opposing: (diagnosis.opposingEvidence || []).map(evidence_view),
        missing: (diagnosis.missingInformation || []).map(evidence_view),
        conflicts: (diagnosis.evidenceConflicts || []).map(evidence_view)
      };
    });
    const advice_readiness_summary = computed(() => {
      const readiness = advice_readiness.value;
      if (!readiness) return null;
      const status = String(readiness.status || 'UNAVAILABLE').toUpperCase();
      return {
        status,
        statusLabel: READINESS_STATUS_LABELS[status] || status,
        score: Number.isFinite(Number(readiness.score)) ? Math.round(Number(readiness.score) * 100) : null,
        missing: (readiness.missingEvidence || []).slice(0, 6).map((item, index) => evidence_view(item, index)),
        requiredActions: (readiness.requiredActions || []).slice(0, 6).map((item, index) => ({
          id: `${item.type || 'ACTION'}-${item.action || index}`,
          label: EVIDENCE_LABELS[item.action] || EVIDENCE_LABELS[item.type] || item.action || item.type || '补充检查',
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
    const advice_execution_summary = computed(() => {
      const commands = advice_passport.value?.commands || [];
      const evaluations = advice_passport.value?.evaluations || [];
      const command = commands[commands.length - 1] || null;
      const evaluation = command
        ? evaluations.find((item) => item.commandId === command.commandId) || evaluations[evaluations.length - 1]
        : null;
      const expected = evaluation?.expected || {};
      const actual = evaluation?.actual || {};
      return {
        approvalStatus: suggestion_result.value?.approvalStatus || (suggestion_result.value?.workOrderId ? 'PENDING' : 'NOT_REQUESTED'),
        workOrderId: suggestion_result.value?.workOrderId || null,
        command,
        evaluation,
        commandStatus: String(command?.ack?.status || command?.status || 'PENDING').toUpperCase(),
        ackAt: command?.ack?.receivedAt || null,
        actualWater: command?.ack?.actualWaterLitre ?? actual.waterLitre,
        before: actual.soilMoistureBefore ?? expected.soilMoistureBefore,
        after: actual.soilMoistureAfter,
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
      const toX = (i, n) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const series = base.series.map((s) => ({
        ...s,
        points: s.values.map((v, i) => `${toX(i, s.values.length).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
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
    const active_suggestion = ref(null);
    const suggestion_flow_stage = ref('VIEW');
    const suggestion_confirm_checked = ref(false);
    const suggestion_result_form = ref({
      outcome: 'SUCCEEDED',
      note: '',
      actual_water_litre: '',
      actual_duration_seconds: ''
    });
    const suggestion_result = ref(null);
    const suggestion_recovery_status = ref('');
    const suggestion_busy = ref(false);
    const suggestion_idempotency_key = ref('');
    const report_subscribed = ref(localStorage.getItem('agriloop-farmer-weekly-report') === 'true');
    const active_report_key = ref('daily');
    const weather_inputs = ref({ temperature: 34, rainfall: 0, light: 62 });
    const risk_forecast = ref(null);
    const resource_plan = ref(null);
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
    const advice_passport = ref(null);
    const evidence_request_busy = ref(false);
    const advice_loading = ref(false);
    const advice_error = ref('');
    const show_advice_diagnosis = ref(false);
    const feedback_busy = ref(false);
    const similar_cases_live = ref([]);
    const suggestion_feedback = ref('');
    const qa_input = ref('');
    const qa_active_turn = ref(null);
    const qa_history = ref([]);
    const qa_audit = ref(null);
    const qa_details_open = ref(false);
    const qa_source_label = ref(is_formal_session ? '后端智能服务' : '演示规则');
    const show_ai_consult = ref(false);
    const qa_busy = ref(false);
    const qa_plot_id = ref(plots.value[0]?.plotId || '');
    const tools_plot_id = ref(plots.value[0]?.plotId || '');
    const tools_scenario = ref('NORMAL');
    const tools_forecast = ref(null);
    const tools_compare = ref(null);
    const tools_forecast_error = ref('');
    const tools_forecast_loading = ref(false);
    const crop_manuals = ref([]);
    const crop_manual_code = ref(plots.value[0]?.cropCode || crop_pack_catalog[0]?.cropCode || 'tomato');
    const crop_manual_stage = ref(plots.value[0]?.stageCode || crop_pack_catalog[0]?.stages?.[0]?.code || 'seedling');
    const crop_manual_live = ref(null);
    const crop_manual_error = ref('');

    const toggle_ai_consult = () => {
      show_ai_consult.value = !show_ai_consult.value;
      if (show_ai_consult.value && !qa_plot_id.value && plots.value[0]?.plotId) {
        qa_plot_id.value = plots.value[0].plotId;
      }
    };
    const close_ai_consult = () => { show_ai_consult.value = false; };
    const on_app_click = () => {
      close_profile_menu();
      close_ai_consult();
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
        { id: 'advice', label: '灌溉系统', icon: 'water_drop', badge: risks || undefined },
        { id: 'messages', label: '消息中心', icon: 'forum', badge: unread || undefined },
        { id: 'tools', label: '更多工具', icon: 'apps', is_footer: true }
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
          detail: '查看补水建议，确认地块和水量后提交审批。',
          actionLabel: '查看补水建议',
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

    const suggestion_flow_steps = computed(() => {
      const order = ['VIEW', 'CONFIRM', 'RESULT', 'RECOVERY'];
      const current = Math.max(0, order.indexOf(suggestion_flow_stage.value));
      const irrigationSteps = [
        { id: 'VIEW', label: '查看建议' },
        { id: 'CONFIRM', label: '确认处方' },
        { id: 'RESULT', label: '审批与执行证据' },
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
      const requested = Math.round(Number(row.requestedLitres ?? 153));
      const allocated = Math.round(Number(row.allocatedLitres ?? Math.min(requested, 153)));
      const unmet = Math.max(0, requested - allocated);
      const hasConflict = unmet > 0 || row.status === 'PARTIAL';
      const startMinutes = 18 * 60 + rowIndex * 20;
      const slot = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`;
      return {
        requested, allocated, slot, hasConflict,
        summary: hasConflict ? `仅分配 ${allocated}/${requested} 升` : `已分配 ${allocated} 升 · ${slot}`,
        explanation: hasConflict ? `受可用水量限制，仍有 ${unmet} 升未满足，请等待管理员调整。` : '当前分配未超过可用水量，暂未发现地块间冲突。',
        provenance: provenanceLabel(plan.provenance || (is_live.value ? 'BACKEND' : 'SIMULATED'))
      };
    });

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
      if (['NEEDS_EVIDENCE', 'UNAVAILABLE', 'BLOCKED'].includes(readinessGate)) return '当前安全门未通过，请先巡田、复测或检查设备。';
      if (status === 'NO_ACTION') return '当前湿度已达到目标，无需灌溉。';
      if (status === 'NEEDS_EVIDENCE') return '数据质量或诊断证据不足，请先巡田或复测。';
      if (status === 'UNAVAILABLE') return '设备或预测服务不可用，请先检查设备并联系管理员。';
      if (status === 'BLOCKED') return '安全门未通过，不能提交灌溉申请，请先补充证据。';
      const water = Number(plan.waterLitre ?? plan.howMuch?.waterLitre);
      const duration = Number(plan.durationSeconds ?? plan.howMuch?.durationSeconds);
      const start = plan.when?.start || plan.recommendedWindow?.start;
      const end = plan.when?.end || plan.recommendedWindow?.end;
      if (!Number.isFinite(water) || water <= 0) return '处方缺少有效水量，不能提交审批。';
      if (!Number.isFinite(duration) || duration <= 0) return '处方缺少有效执行时长，不能提交审批。';
      if (!start || !end) return '处方缺少执行时间窗口，请先补充证据。';
      return '';
    });
    const suggestion_confirm_enabled = computed(() => {
      if (!active_suggestion.value || suggestion_busy.value || suggestion_flow_stage.value !== 'CONFIRM') return false;
      if (active_suggestion.value.kind === 'IRRIGATION') {
        return suggestion_confirm_checked.value && !suggestion_block_reason.value;
      }
      return suggestion_confirm_checked.value;
    });

    const tools_plot = computed(() => plots.value.find((plot) => plot.plotId === tools_plot_id.value) || plots.value[0] || null);
    // 农户情景假设只做环境/质量对照；设备离线保留在管理端与模拟器，不作为 What-if 选项。
    const tools_scenarios = computed(() => PLOT_SIMULATION_SCENARIOS
      .filter((item) => item.code !== 'DEVICE_OFFLINE')
      .map((item) => ({ ...item, desc: item.description })));
    const tools_forecast_chart = computed(() => {
      const moisture = Number(tools_plot.value?.metrics?.SOIL_MOISTURE?.value);
      const scenario = tools_scenarios.value.find((item) => item.code === tools_scenario.value);
      return forecast_chart_model(tools_forecast.value, moisture, scenario?.color || 'var(--g-success)');
    });
    const tools_compare_chart = computed(() => {
      const branches = tools_compare.value?.branches;
      if (!branches?.EXECUTE || !branches?.NO_ACTION) return null;
      const execute = branches.EXECUTE.points || [];
      const noAction = branches.NO_ACTION.points || [];
      const values = [...execute, ...noAction].map((point) => Number(point.value ?? point.moisture)).filter(Number.isFinite);
      if (!values.length) return null;
      const min = Math.max(0, Math.floor(Math.min(...values) - 3));
      const max = Math.ceil(Math.max(...values) + 3);
      const labels = execute.map((point) => `${point.minute}m`);
      return {
        min, max, labels,
        grid: [{ y: 10, label: `${max}%` }, { y: 62, label: `${Math.round((max + min) / 2)}%` }, { y: 114, label: `${min}%` }],
        series: [branches.EXECUTE, branches.NO_ACTION].map((branch) => {
          const branchValues = (branch.points || []).map((point) => Number(point.value ?? point.moisture));
          return { label: branch.label, color: branch.color, values: branchValues, points: chart_points(branchValues, min, max), finalMoisture: branch.finalMoisture ?? branchValues[branchValues.length - 1], timeToRiskMinutes: branch.timeToRiskMinutes };
        })
      };
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

    const load_tools_forecast = async (scenario = tools_scenario.value) => {
      const plotId = tools_plot_id.value || plots.value[0]?.plotId;
      if (!plotId) {
        tools_forecast.value = null;
        tools_forecast_error.value = '没有可预测的地块';
        return;
      }
      tools_forecast_loading.value = true;
      tools_forecast_error.value = '';
      tools_compare.value = null;
      try {
        if (!scenario || scenario === 'NORMAL') {
          const result = await api.getRiskForecast(plotId, 'SOIL_MOISTURE');
          tools_forecast.value = result;
          if (String(result?.status || '').toUpperCase() === 'UNAVAILABLE') {
            tools_forecast_error.value = result.reason || result.unavailableReason || '样本、数据质量或设备状态不足';
          }
        } else {
          const run = await api.runScenario({ scenario, plotId });
          tools_forecast.value = {
            ...run,
            status: run?.status || run?.runStatus || 'RECORDED',
            curve: Array.isArray(run?.curve) ? run.curve : [],
            horizons: Array.isArray(run?.horizons) ? run.horizons : []
          };
          tools_compare.value = await api.compareScenario({
            scenario,
            plotId,
            scenarioId: run?.scenarioId,
            seed: Number(run?.seed ?? 42)
          });
          if (!tools_forecast.value.curve.length && !tools_forecast.value.horizons.length) {
            tools_forecast_error.value = '该情景暂未返回可绘制的曲线数据';
          }
        }
      } catch (error) {
        tools_forecast.value = null;
        tools_compare.value = null;
        tools_forecast_error.value = error?.message || '风险预警读取失败';
      } finally {
        tools_forecast_loading.value = false;
      }
    };

    const change_tools_scenario = (scenario) => {
      const code = scenario?.code === 'STORM' ? 'HEAVY_RAIN' : (scenario?.code || 'NORMAL');
      tools_scenario.value = code === 'DEVICE_OFFLINE' ? 'NORMAL' : code;
    };

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

    const availability_label = (code) => CROP_MANUAL_AVAILABILITY[code] || code || '—';
    const similar_cases = computed(() => {
      if (similar_cases_live.value.length) return similar_cases_live.value;
      if (is_formal_session) return [];
      return FARMER_SIMILAR_CASES;
    });
    const active_report = computed(() => {
      const base = FARMER_REPORT_CATALOG[active_report_key.value] || FARMER_REPORT_CATALOG.daily;
      return { ...base, sourceLabel: sourceLabel(base.source), generatedAt: data_updated_label.value };
    });

    const navigate = (view_id, { sync_hash = true, tab } = {}) => {
      const next_view = FARMER_VIEWS.includes(view_id) ? view_id : 'dashboard';
      current_view.value = next_view;
      if (next_view === 'tools' && (tab === 'risk' || tab === 'manual')) {
        tools_tab.value = tab;
      }
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

    const toggle_theme = () => {
      is_dark.value = !is_dark.value;
      const theme = is_dark.value ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.colorScheme = theme;
      localStorage.setItem('agriloop-theme', theme);
    };

    const logout = () => {
      api.clearSession();
      window.location.replace('login.html');
    };

    const status_label = (status) => STATUS_LABELS[status] || workStatusLabel(status);
    const priority_label = (priority) => PRIORITY_LABELS[priority] || (String(priority || '').toUpperCase() === 'CRITICAL' ? '紧急' : priority || '普通');
    const category_label = (category) => CATEGORY_LABELS[category] || sourceLabel(category, category || '系统');
    const source_label = (value) => sourceLabel(value, '—');
    const device_status_label = (value) => genericStatusLabel(value, '状态未知');
    const metric_status_label = (value) => metricStatusLabel(value, '未知');
    const request_status_label = (value) => status_label(value);
    const scenario_label = (value) => scenarioLabel(value, '未设置');
    const alert_level_label = (level) => ALERT_LEVEL_LABELS[String(level || '').toUpperCase()] || level || '—';
    const alert_status_label = (status) => ALERT_STATUS_LABELS[String(status || '').toUpperCase()] || status || '—';

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
    const metric_status_of = (plot, code, metric) => (
      code === 'SOIL_MOISTURE' ? resolve_moisture_band_status(plot) : (metric?.status || 'NORMAL')
    );
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
    const soil_surface_label = (code) => ({ DRY: '偏干', NORMAL: '正常', WET: '偏湿' }[code] || code || '—');
    const crop_condition_label = (code) => ({
      HEALTHY: '长势正常',
      LEAF_SLIGHT_WILT: '叶片轻微萎蔫',
      PEST_SUSPECTED: '疑似病虫害'
    }[code] || code || '—');
    const evidence_type_label = (code) => ({
      FIELD_INSPECTION: '现场巡田',
      RETEST: '传感器复测',
      DEVICE_CHECK: '设备检查'
    }[code] || code || '—');
    const find_plot_name = (plot_id) => find_plot_by_id(plots.value, plot_id)?.name || plot_id || '—';

    const replace_ref_array = (target, values) => {
      target.value.splice(0, target.value.length, ...(Array.isArray(values) ? values : []));
    };

    const message_fingerprint = (list) => (Array.isArray(list) ? list : [])
      .map((message) => [message.id, message.read ? 1 : 0, message.title, message.snippet, message.time_iso].join('\u0001'))
      .join('\n');

    const apply_messages = (nextMessages) => {
      const incoming = Array.isArray(nextMessages) ? nextMessages : [];
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

    const refresh_plot_telemetry = async () => {
      if (!is_formal_session || !plots.value.length) return false;
      const snapshot = plots.value.slice();
      const telemetryResults = await Promise.allSettled(snapshot.map((plot) => api.getPlotTelemetryAll(plot.plotId, 120)));
      if (!plots.value.length) return false;
      const nextPlots = snapshot.map((plot, index) => {
        const result = telemetryResults[index];
        if (result?.status !== 'fulfilled') return plot;
        const merged = mergePlotTelemetryWindow(plot, result.value || []);
        return { ...merged, healthScore: compute_plot_health_score(merged) };
      });
      // Preserve references when the farmer is reading messages; only swap plots.
      replace_ref_array(plots, nextPlots);
      selected_plot.value = nextPlots.find((plot) => plot.plotId === selected_plot.value?.plotId) || nextPlots[0] || null;
      advice_selected_plot.value = nextPlots.find((plot) => plot.plotId === advice_selected_plot.value?.plotId) || nextPlots[0] || null;
      if (!qa_plot_id.value || !nextPlots.some((plot) => plot.plotId === qa_plot_id.value)) {
        qa_plot_id.value = nextPlots[0]?.plotId || '';
      }
      if (!tools_plot_id.value || !nextPlots.some((plot) => plot.plotId === tools_plot_id.value)) {
        tools_plot_id.value = nextPlots[0]?.plotId || '';
      }
      data_updated_label.value = '刚刚';
      return true;
    };

    const load_live_workspace = async ({ announce = false, trackProgress = false } = {}) => {
      if (!is_formal_session) return false;
      const version = ++workspace_request_version;
      load_error.value = '';
      const showProgress = Boolean(trackProgress || announce || bootstrap_loading.value);
      if (showProgress) begin_workspace_progress('正在读取农场与地块…');
      try {
        if (showProgress) set_workspace_progress(18, '正在读取农场、任务与告警…');
        const results = await Promise.allSettled([
          api.getFarms(),
          api.getPlots({ includeInactive: true }),
          api.getOverview(),
          api.getWorkOrders(),
          api.getAlerts(),
          api.getCropPacks(),
          api.getCropBatches()
        ]);
        const coreFailure = results.slice(0, 5).find((result) => result.status === 'rejected');
        if (coreFailure) throw coreFailure.reason;
        const [farmsResult, plotsResult, overviewResult, workOrdersResult, alertsResult, packsResult, batchesResult] = results;
        const farms = farmsResult.value || [];
        const rawPlots = plotsResult.value || [];
        const overview = overviewResult.value || {};
        const rawWorkOrders = workOrdersResult.value || [];
        const rawAlerts = alertsResult.value || [];
        const packs = packsResult.status === 'fulfilled' ? packsResult.value || [] : [];
        const batches = batchesResult.status === 'fulfilled' ? batchesResult.value || [] : [];
        const optionalFailures = [packsResult, batchesResult].filter((result) => result.status === 'rejected');
        if (optionalFailures.length) load_error.value = '作物包或种植批次暂不可用，已显示其余正式数据';
        if (version !== workspace_request_version) return false;
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
        const telemetryResults = await Promise.allSettled(normalizedPlots.map((plot) => api.getPlotTelemetryAll(plot.plotId, 120)));
        normalizedPlots = normalizedPlots.map((plot, index) => {
          const result = telemetryResults[index];
          if (result?.status !== 'fulfilled') return plot;
          const merged = mergePlotTelemetryWindow(plot, result.value || []);
          return { ...merged, healthScore: compute_plot_health_score(merged) };
        });
        if (showProgress) set_workspace_progress(78, '正在整理巡田与消息…');
        const plotMap = new Map(normalizedPlots.map((plot) => [String(plot.plotId), plot]));
        const normalizedTasks = (rawWorkOrders || []).map((work) => normalizeFarmerTask(work, plotMap));
        const inspectionResults = await Promise.allSettled(normalizedPlots.map((plot) => api.getInspections(plot.plotId)));
        const records = Array.from(new Map(inspectionResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []).map((record) => [record.inspectionId, {
          ...record,
          plotName: plotMap.get(String(record.plotId))?.name || record.plotId
        }])).values()).sort((a, b) => new Date(b.observedAt || b.createdAt || 0) - new Date(a.observedAt || a.createdAt || 0));
        const nextMessages = buildFarmerMessages({ alerts: rawAlerts, tasks: normalizedTasks, inspections: records, plots: normalizedPlots });
        const profile = buildFarmerProfile({ user: user.value, farm: selectedFarm, plots: normalizedPlots, tasks: normalizedTasks, inspections: records, messages: nextMessages });
        farm.value = selectedFarm;
        replace_ref_array(plots, normalizedPlots);
        replace_ref_array(tasks, normalizedTasks);
        apply_messages(nextMessages);
        replace_ref_array(inspection_records, records);
        evidence_requests.value = normalizedTasks.filter((task) => String(task.sourceType || '').toUpperCase() === 'READINESS').map((task) => ({
          id: task.workOrderId || task.id,
          plotId: task.plot_id,
          type: task.actionType || 'FIELD_INSPECTION',
          reason: task.reason,
          status: task.status,
          createdAt: task.created_iso,
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
        if (!qa_plot_id.value || !normalizedPlots.some((plot) => plot.plotId === qa_plot_id.value)) {
          qa_plot_id.value = normalizedPlots[0]?.plotId || '';
        }
        if (!tools_plot_id.value || !normalizedPlots.some((plot) => plot.plotId === tools_plot_id.value)) {
          tools_plot_id.value = normalizedPlots[0]?.plotId || '';
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
        load_error.value = error?.message || '正式数据读取失败';
        // Do not leave the module-level demo Crop Pack available after a
        // formal load fails.  A failed live request must render an empty
        // state, otherwise target bands could look like backend facts.
        crop_pack_catalog = [];
        replace_ref_array(plots, []);
        replace_ref_array(tasks, []);
        replace_ref_array(messages, []);
        replace_ref_array(inspection_records, []);
        evidence_requests.value = [];
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
      // SSE normally updates immediately; these low-frequency polls recover
      // from missed events and keep secondary resources (tasks, inspections,
      // crop batches and device state) current as well.
      live_telemetry_poll_timer = window.setInterval(poll_live_telemetry, 5000);
      live_workspace_poll_timer = window.setInterval(poll_live_workspace, 15000);
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
      if (type.includes('workorder') || type.includes('work-order') || type.includes('alert') || type.includes('inspection') || type.includes('plot.')) {
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
      if (!msg.read) {
        msg.read = true;
      }
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
            device_status: plot.deviceStatus,
            metrics: plot.metrics
          };
        }
      }
      selected_task.value = enriched;
    };

    const open_task_from_dashboard = (task) => {
      navigate('tasks');
      open_task(task);
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

    const open_tools = (tab = 'risk', plot_id = '') => {
      if (plot_id) tools_plot_id.value = plot_id;
      tools_tab.value = tab === 'manual' ? 'manual' : 'risk';
      navigate('tools', { tab: tools_tab.value });
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
      if (active_suggestion.value.kind === 'IRRIGATION') return '提交审批后，等待管理员执行并复测湿度。';
      if (active_suggestion.value.kind === 'TASK') return '任务结果已提交，等待管理员验收。';
      return '已确认处理，等待现场复测或设备心跳恢复。';
    });

    const open_suggestion = (kind = 'RISK', context = {}) => {
      const task = context.task || (kind === 'TASK' ? context : null);
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
        actionLabel: context.actionLabel || (kind === 'IRRIGATION' ? '提交管理员审批' : (kind === 'TASK' ? '开始并填写结果' : '进入现场核验')),
        traceId: context.traceId || null
      };
      suggestion_flow_stage.value = 'VIEW';
      suggestion_confirm_checked.value = false;
      suggestion_result.value = null;
      suggestion_recovery_status.value = '';
      suggestion_result_form.value = { outcome: 'SUCCEEDED', note: '', actual_water_litre: '', actual_duration_seconds: '' };
      suggestion_idempotency_key.value = '';
      show_suggestion_flow.value = true;
      if (kind === 'IRRIGATION' && (!irrigation_plan.value || irrigation_plan.value.plotId !== plotId)) {
        load_irrigation_plan(plotId, { silent: true });
      }
    };

    const close_suggestion_flow = () => {
      if (suggestion_busy.value) return;
      show_suggestion_flow.value = false;
    };

    const prepare_suggestion_confirmation = async () => {
      if (!active_suggestion.value) return;
      if (active_suggestion.value.kind === 'IRRIGATION') {
        if (!irrigation_plan.value || irrigation_plan.value.plotId !== active_suggestion.value.plotId) {
          await load_irrigation_plan(active_suggestion.value.plotId);
        }
        if (suggestion_block_reason.value) {
          show_toast(suggestion_block_reason.value, 'error');
          return;
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
          const key = suggestion_idempotency_key.value || `farmer-approval-${plan.planId}-${Date.now()}`;
          suggestion_idempotency_key.value = key;
          if (!suggestion_result.value) {
            suggestion_result.value = await api.submitDecisionFeedback(plan.traceId || active.traceId || `farmer-${plan.planId}`, {
              decision: 'REQUEST_APPROVAL',
              action: 'IRRIGATION_REQUEST',
              status: 'PENDING_APPROVAL',
              plotId: active.plotId,
              planId: plan.planId,
              waterLitre: Number(plan.waterLitre ?? plan.howMuch?.waterLitre),
              durationSeconds: Number(plan.durationSeconds ?? plan.howMuch?.durationSeconds),
              requestedWindow: plan.when || plan.recommendedWindow,
              idempotencyKey: key,
              requiresApproval: true,
              provenance: is_live.value ? 'BACKEND' : 'SIMULATED'
            });
          }
          suggestion_recovery_status.value = '已提交管理员审批，执行后等待复测。';
          suggestion_flow_stage.value = 'RESULT';
          show_toast(is_live.value ? '灌溉申请已提交管理员审批' : '演示申请已记录，不会控制真实水泵');
        } else if (active.kind === 'TASK') {
          const task = active.task;
          const status = farmer_task_status(task);
          if (['PENDING', 'ASSIGNED', 'REJECTED'].includes(status)) {
      if (is_formal_session) {
              await api.transitionWorkOrder(task.workOrderId, { action: status === 'REJECTED' ? 'RESTART' : 'START', note: '农户确认开始执行任务' });
              await load_live_workspace({ announce: false });
            } else {
              const source = tasks.value.find((item) => item.id === task.id);
              if (source) source.status = 'IN_PROGRESS';
              task.status = 'IN_PROGRESS';
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
            actualDurationSeconds: actualDuration ? Number(actualDuration) : undefined
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
          const source = tasks.value.find((item) => item.id === active.task?.id);
          if (source) source.status = is_formal_session ? (saved?.status || 'SUBMITTED') : 'SUBMITTED';
          active.task.status = is_formal_session ? (saved?.status || 'SUBMITTED') : 'SUBMITTED';
        }
        suggestion_result.value = saved;
        suggestion_recovery_status.value = active.kind === 'IRRIGATION'
          ? '结果已记录；等待管理员执行后复测湿度。'
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
      // 农户没有 irrigation:approve，按钮只进入处方确认和管理员审批闭环。
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
        const saved = await api.createDecisionEvidenceRequest(readiness.readinessId, {
          farmId: farm.value.farmId || session_user?.farmIds?.find((id) => id !== '*'),
          plotId: plot.plotId,
          title: `决策补证：${EVIDENCE_LABELS[action.action] || EVIDENCE_LABELS[readiness.missingEvidence?.[0]] || '现场复测'}`,
          reason: `就绪度 ${readiness.status}，需要补充最小证据`,
          actionType: action.type === 'REQUEST_APPROVAL' ? 'IRRIGATION_REVIEW' : 'INSPECTION',
          priority: action.priority || 'HIGH',
          idempotencyKey: key
        });
        evidence_requests.value.unshift(saved);
        show_toast(`补证任务已创建：${saved.workOrderId || '待同步'}`);
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
            note: '农户已核对案例并确认采用，等待安全检查与审批',
            referenceCaseId: selected?.raw?.caseId || selected_case_id.value,
            humanConfirmed: true
          });
          decision_confirmation.value = '已提交待复核';
          suggestion_feedback.value = '确认采用（待审批）';
          show_toast('正式采用已记录为待复核，不会直接修改处方或策略');
        } catch (error) {
          show_toast(error.message || '确认提交失败', 'error');
        } finally {
          feedback_busy.value = false;
        }
        return;
      }
      decision_confirmation.value = '已提交人工确认';
      suggestion_feedback.value = '确认采用（待审批）';
      show_toast('演示确认已记录，策略和处方尚未被修改');
    };

    const apply_qa_turn = (turn) => {
      if (!turn) return;
      qa_active_turn.value = turn;
      qa_details_open.value = false;
      qa_source_label.value = turn.sourceLabel || qa_source_label.value;
    };

    const toggle_qa_details = () => {
      qa_details_open.value = !qa_details_open.value;
    };

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
        tools_plot_id.value = card.plotId;
      }
      if (card.traceId) advice_trace.value = card.traceId;
      close_ai_consult();
      if (card.kind === 'IRRIGATION') {
        navigate('advice');
        open_suggestion('IRRIGATION', {
          plotId: card.plotId,
          traceId: card.traceId,
          title: `${card.plotName || '当前地块'}补水建议`
        });
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
        navigate('tools', { tab: 'risk' });
        await load_tools_forecast();
        return;
      }
      if (card.kind === 'INSPECTION') {
        navigate('inspections');
        open_evidence_form(card.plotId);
      }
    };

    const ask_question = async () => {
      const question = qa_input.value.trim();
      if (!question) {
        show_toast('请先输入想了解的农事问题', 'error');
        return;
      }
      if (qa_busy.value) return;
      show_ai_consult.value = true;
      const plot_id = qa_plot_id.value || advice_selected_plot.value?.plotId || selected_plot.value?.plotId || plots.value[0]?.plotId;
      const plot = find_plot_by_id(plots.value, plot_id);
      qa_busy.value = true;
      try {
        const response = await api.agentChat(question, plot_id || undefined);
        const turn = normalizeAgentTurn(response, question, {
          plot,
          sessionMode: is_formal_session ? 'live' : 'demo'
        });
        const auditTraceId = response?.traceId || `demo-${Date.now()}`;
        const audit = await api.getAgentRun(auditTraceId).catch(() => null);
        turn.audit = audit;
        qa_audit.value = audit;
        apply_qa_turn(turn);
        qa_history.value = [turn, ...qa_history.value].slice(0, 6);
          qa_input.value = '';
        } catch (error) {
        qa_source_label.value = '智能问答暂不可用';
          show_toast(`智能问答暂不可用：${error.message || '后端服务错误'}`, 'error');
      } finally {
        qa_busy.value = false;
      }
    };

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
          await api.createInspection({
            farmId: farm.value.farmId || session_user?.farmIds?.find((id) => id !== '*'),
            plotId: plot.plotId,
            workOrderId: inspection_form.value.work_order_id || undefined,
            observedAt: new Date().toISOString(),
            soilSurface: inspection_form.value.soil_surface,
            cropCondition: inspection_form.value.crop_condition,
            portableSoilMoisture: portable_moisture,
            notes: inspection_form.value.notes.trim()
          }, inspection_form.value.photos);
          close_inspection_form();
          await load_live_workspace({ announce: false });
          show_toast('巡田记录已保存，管理员和诊断模块可读取');
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
          await api.createWorkOrder({
            farmId: farm.value.farmId || session_user?.farmIds?.find((id) => id !== '*'),
            plotId: plot.plotId,
            title: `${evidence_type_label(evidence_form.value.type)}补证申请`,
            reason: evidence_form.value.reason.trim(),
            sourceType: 'READINESS',
            actionType: 'INSPECTION',
            priority: 'MEDIUM'
          });
          close_evidence_form();
          await load_live_workspace({ announce: false });
          show_toast('补证申请已提交，管理员工作台可直接分配');
        } catch (error) {
          show_toast(error.message || '补证申请提交失败', 'error');
        }
        return;
      }
      evidence_requests.value.unshift({
        id: `evidence-${Date.now()}`,
        plotId: evidence_form.value.plot_id,
        type: evidence_form.value.type,
        reason: evidence_form.value.reason,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      });
      close_evidence_form();
      show_toast('演示补证申请已提交，管理员会安排处理');
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

    const start_task = async (task) => {
      if (is_formal_session) {
        try {
          await api.transitionWorkOrder(task.workOrderId, { action: 'START', note: '农户开始执行任务' });
          close_task();
          await load_live_workspace({ announce: false });
          show_toast(`已开始执行：${task.title}`);
        } catch (error) { show_toast(error.message || '开始任务失败', 'error'); }
        return;
      }
      const source = tasks.value.find((item) => item.id === task.id);
      if (source) source.status = 'IN_PROGRESS';
      task.status = 'IN_PROGRESS';
      show_toast(`已开始执行：${task.title}`);
      close_task();
    };

    const complete_task = async (task) => {
      if (is_formal_session) {
        try {
          await api.transitionWorkOrder(task.workOrderId, { action: 'SUBMIT', resultSummary: '农户已提交现场处理结果' });
          close_task();
          await load_live_workspace({ announce: false });
          show_toast(`已提交完成：${task.title}，等待管理员验收`);
        } catch (error) { show_toast(error.message || '提交任务失败', 'error'); }
        return;
      }
      const source = tasks.value.find((item) => item.id === task.id);
      if (source) source.status = 'DONE';
      task.status = 'DONE';
      show_toast(`已提交完成：${task.title}`);
      close_task();
    };

    const report_issue = async (task) => {
      if (is_formal_session && task?.plot_id) {
        try {
          await api.createWorkOrder({
            farmId: farm.value.farmId || session_user?.farmIds?.find((id) => id !== '*'),
            plotId: task.plot_id,
            title: `任务异常：${task.title}`,
            reason: `农户上报：${task.reason || '执行过程中发现异常'}`,
            sourceType: 'READINESS',
            actionType: 'INSPECTION',
            priority: 'HIGH'
          });
          close_task();
          await load_live_workspace({ announce: false });
          show_toast(`问题已上报：${task.title}`, 'error');
        } catch (error) { show_toast(error.message || '问题上报失败', 'error'); }
        return;
      }
      show_toast(`演示问题已上报：${task.title}`, 'error');
      close_task();
    };

    const load_farmer_enhancements = async () => {
      if (farmer_enhancements_refresh_in_flight) return false;
      farmer_enhancements_refresh_in_flight = true;
      try {
        const forecastPlot = plots.value.slice().sort((a, b) => health_score(a) - health_score(b))[0] || plots.value[0];
        const forecastPromise = forecastPlot
          ? api.getRiskForecast(forecastPlot.plotId, 'SOIL_MOISTURE')
          : Promise.resolve({ status: 'UNAVAILABLE', reason: '没有可预测的地块' });
        const demands = plots.value.map((plot) => {
          const band = resolve_moisture_band_status(plot);
          return {
            plotId: plot.plotId,
            requestedLitres: band === 'ALERT' ? 153 : (band === 'WARN' ? 96 : 60),
            priority: band === 'ALERT' ? 'HIGH' : (band === 'WARN' ? 'MEDIUM' : 'LOW'),
            windowStart: '18:00',
            windowEnd: '20:00'
          };
        });
        const resourcePromise = api.evaluateResourcePlan({
          scope: farm.value.farmId || 'farm-demo',
          constraints: { waterCapacityLitres: MOCK_DATA.resourceProfile?.remainingLitres || 0 },
          demands
        });
        const [forecastResult, resourceResult] = await Promise.allSettled([forecastPromise, resourcePromise]);
        risk_forecast.value = forecastResult.status === 'fulfilled'
          ? forecastResult.value
          : { status: 'UNAVAILABLE', reason: forecastResult.reason?.message || '预测服务暂不可用' };
        resource_plan.value = resourceResult.status === 'fulfilled' ? resourceResult.value : null;
        return true;
      } finally {
        farmer_enhancements_refresh_in_flight = false;
      }
    };

    onMounted(async () => {
      bootstrap_loading.value = true;
      begin_workspace_progress('正在准备农户工作台…');

      const saved_theme = localStorage.getItem('agriloop-theme');
      if (saved_theme === 'dark') {
        is_dark.value = true;
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
      }
      // Keep the current farmer page across refresh / back-forward.
      if (!window.location.hash) {
        window.history.replaceState(null, '', farmer_hash_for(current_view.value, tools_tab.value));
      } else {
        apply_farmer_hash();
      }
      window.addEventListener('hashchange', apply_farmer_hash);
      set_workspace_progress(12, '正在检查服务状态…');
      is_live.value = await api.checkHealth();
      if (is_formal_session) {
        await load_live_workspace({ announce: true, trackProgress: true });
        is_live.value = api.isLive;
        set_workspace_progress(96, '正在连接实时事件…');
        await connect_live_events();
      } else {
        set_workspace_progress(55, '正在载入演示数据…');
      }
      set_workspace_progress(88, '正在加载预警与资源协同…');
      await load_farmer_enhancements();
      await load_irrigation_plan(advice_plot.value?.plotId, { silent: true });
      if (current_view.value === 'advice' && advice_plot.value?.plotId) {
        void load_advice_decision(advice_plot.value.plotId);
      }
      if (current_view.value === 'tools') {
        if (tools_tab.value === 'manual') await load_crop_manual();
        else await load_tools_forecast();
      }
      start_live_polling();
      bootstrap_loading.value = false;
      finish_workspace_progress(load_error.value ? '部分数据未就绪' : '农户数据已就绪');
    });

    watch([current_view, tools_tab, tools_plot_id, tools_scenario, crop_manual_code, crop_manual_stage], () => {
      if (current_view.value !== 'tools') return;
      if (tools_tab.value === 'manual') load_crop_manual();
      else load_tools_forecast(tools_scenario.value);
    });

    watch(selected_plot, (plot) => {
      plot_stage_preview.value = plot?.stageCode || crop_stage_for(plot)?.code || '';
    });

    watch(advice_selected_plot, (plot, previous) => {
      if (!plot?.plotId || plot.plotId === previous?.plotId) return;
      show_advice_diagnosis.value = false;
      load_irrigation_plan(plot.plotId, { silent: true });
      if (current_view.value === 'advice') void load_advice_decision(plot.plotId);
    });

    watch(current_view, (view) => {
      if (view === 'advice' && advice_plot.value?.plotId) {
        void load_advice_decision(advice_plot.value.plotId);
      }
    });

    onBeforeUnmount(() => {
      if (workspace_progress_hide_timer) window.clearTimeout(workspace_progress_hide_timer);
      stop_live_polling();
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
      is_sidebar_open,
      data_updated_label,
      user,
      farm,
      nav_items,
      current_view,
      messages,
      tasks,
      plots,
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
      advice_plot,
      advice_selected_plot,
      select_advice_plot,
      advice_soil_chart,
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
      irrigation_target_label,
      advice_moisture_chart,
      selected_message,
      selected_task,
      analyzing,
      analysis_result,
      analysis_error,
      analysis_source_label,
      inspection_records,
      evidence_requests,
      show_inspection_form,
      show_evidence_form,
      show_account_modal,
      show_profile_menu,
      show_report_modal,
      show_weather_controls,
      show_resource_allocation,
      show_suggestion_flow,
      active_suggestion,
      suggestion_flow_stage,
      suggestion_flow_steps,
      suggestion_kind_label,
      suggestion_plot,
      suggestion_block_reason,
      suggestion_confirm_checked,
      suggestion_confirm_enabled,
      suggestion_result_form,
      suggestion_result,
      suggestion_recovery_detail,
      suggestion_recovery_status,
      suggestion_busy,
      format_suggestion_time,
      suggestion_outcome_label,
      report_subscribed,
      active_report,
      weather_inputs,
      degradation_banner,
      weather_risk_card,
      tools_tab,
      tools_plot_id,
      tools_plot,
      tools_scenario,
      tools_scenarios,
      tools_forecast,
      tools_compare,
      tools_forecast_error,
      tools_forecast_loading,
      tools_forecast_chart,
      tools_compare_chart,
      crop_manual_code,
      crop_manual_stage,
      crop_manual_options,
      crop_manual_pack,
      crop_manual_stages,
      crop_manual_stage_item,
      crop_manual_metrics_list,
      crop_manual_guide_list,
      crop_manual_error,
      change_tools_scenario,
      select_crop_manual,
      availability_label,
      device_attention,
      batch_timeline,
      selected_allocation,
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
      advice_readiness_summary,
      advice_execution_summary,
      irrigation_guard,
      advice_passport,
      evidence_request_busy,
      advice_plan,
      advice_trace,
      feedback_busy,
      suggestion_feedback,
      qa_input,
      qa_active_turn,
      qa_history,
      qa_audit,
      qa_details_open,
      qa_source_label,
      show_ai_consult,
      qa_busy,
      qa_plot_id,
      select_qa_history,
      toggle_qa_details,
      open_qa_decision_action,
      toggle_ai_consult,
      close_ai_consult,
      on_app_click,
      toasts,
      greeting,
      stats,
      today_priorities,
      plot_issue_summary,
      recent_tasks,
      recent_messages,
      sorted_messages,
      filtered_messages,
      message_filter,
      message_filter_options: MESSAGE_FILTER_OPTIONS,
      message_filter_counts,
      unread_count,
      task_columns,
      profile_stats,
      account_profile,
      navigate,
      toggle_sidebar,
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
      close_message,
      mark_read,
      generate_analysis,
      open_task,
      open_task_from_dashboard,
      open_device_attention,
      open_priority_item,
      close_task,
      open_plot,
      open_tools,
      load_irrigation_plan,
      toggle_irrigation,
      open_suggestion,
      close_suggestion_flow,
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
if (!_session || !_session_user) {
  window.location.replace('login.html');
} else if (_session_user.role !== 'FARMER') {
  window.location.replace('index.html');
} else {
  app.mount('#farmer_app');
}
