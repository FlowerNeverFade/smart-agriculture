import { api } from './api.js';
import { MOCK_DATA } from './mock-data.js';
import { presentRoleUser } from './roles.js';
import { buildAccountProfile } from './account-profile.js';
import {
  agentResponseSource,
  agentResponseText,
  buildFarmerMessages,
  buildFarmerProfile,
  dueLabel,
  normalizeFarmerTask,
  normalizePlot,
  normalizeWorkStatus,
  workStatusLabel
} from './live-data.js';

const { createApp, ref, computed, onMounted } = Vue;

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

const CROP_ICONS = {
  tomato: '🍅',
  corn: '🌽',
  cucumber: '🥒',
  rice: '🌾',
  sunflower: '🌻',
  strawberry: '🍓'
};

const PLOT_CHART_SPECS = [
  { code: 'SOIL_MOISTURE', label: '土壤湿度', unit: '%', min: 0, max: 60, amplitude: 3, precision: 1, color: 'var(--g-success)' },
  { code: 'AIR_TEMPERATURE', label: '空气温度', unit: '°C', min: 10, max: 40, amplitude: 1.8, precision: 1, color: 'var(--g-primary)' },
  { code: 'AIR_HUMIDITY', label: '空气湿度', unit: '%RH', min: 0, max: 100, amplitude: 2.2, precision: 1, color: 'var(--g-info)' },
  { code: 'LIGHT', label: '光照强度', unit: 'lux', min: 0, max: 70000, amplitude: 4500, precision: 0, color: 'var(--g-warning)' },
  { code: 'CO2', label: 'CO2 浓度', unit: 'ppm', min: 300, max: 1200, amplitude: 60, precision: 0, color: 'var(--g-info)' },
  { code: 'SOIL_EC', label: '土壤 EC 值', unit: 'mS/cm', min: 0, max: 3, amplitude: 0.12, precision: 2, color: 'var(--g-danger)' },
  { code: 'NPK_RATIO', label: '氮磷钾肥力', unit: 'mg/kg', min: 0, max: 300, amplitude: 14, precision: 0, multi: true }
];

const CHART_RANGE_OPTIONS = [
  {
    id: '7h',
    label: '7h',
    title: '近 7 小时',
    amplitude_scale: 0.35,
    labels: ['6h前', '5h前', '4h前', '3h前', '2h前', '1h前', '现在']
  },
  {
    id: '24h',
    label: '24h',
    title: '近 24 小时',
    amplitude_scale: 0.7,
    labels: ['24h前', '20h前', '16h前', '12h前', '8h前', '4h前', '现在']
  },
  {
    id: '7d',
    label: '7天',
    title: '近 7 天',
    amplitude_scale: 1,
    labels: ['6日前', '5日前', '4日前', '3日前', '2日前', '昨日', '今天']
  }
];

const SHARED_MODULE_LINKS = [
  { id: 'decision-console', label: '智能诊断与处方', icon: 'psychology', description: '查看根因、证据和灌溉处方' },
  { id: 'risk-forecast', label: '风险推演', icon: 'timeline', description: '切换情景并查看未来趋势' },
  { id: 'work-orders', label: '工单与巡田', icon: 'assignment', description: '查看工单流转和人工核验' }
];

const SHARED_CONTEXT_KEY = 'agriloop-farmer-shared-context';

// The farmer view keeps this catalogue separate from MOCK_DATA so the same
// moisture bands can be replaced by the backend Crop Pack response as soon as
// a formal session is loaded.
let crop_pack_catalog = MOCK_DATA.cropPackDetails || [];

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
  if (Math.abs(value) >= 1000) return `${Number((value / 1000).toFixed(1))}k`;
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

function metric_chart(plot, code, range_id = '7d') {
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

  return {
    ...spec,
    current_label: `${format_chart_current_value(metric.value, spec.precision)} ${metric.unit || spec.unit}`,
    target: metric.target || '—',
    status: metric.status || 'NORMAL',
    is_risk,
    risk_label: metric.status === 'ALERT' ? '告警偏离' : (metric.status === 'WARN' ? '偏离目标' : ''),
    range_title: range.title,
    labels: range.labels,
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

function stage_target_band(plot, code) {
  const target = crop_stage_for(plot)?.target || {};
  if (code === 'SOIL_MOISTURE' && Number.isFinite(Number(target.soilMoistureLow)) && Number.isFinite(Number(target.soilMoistureHigh))) {
    return [Number(target.soilMoistureLow), Number(target.soilMoistureHigh)];
  }
  if (code === 'AIR_TEMPERATURE' && Number.isFinite(Number(target.airTemperatureLow)) && Number.isFinite(Number(target.airTemperatureHigh))) {
    return [Number(target.airTemperatureLow), Number(target.airTemperatureHigh)];
  }
  if (code === 'AIR_HUMIDITY' && Number.isFinite(Number(target.airHumidityLow)) && Number.isFinite(Number(target.airHumidityHigh))) {
    return [Number(target.airHumidityLow), Number(target.airHumidityHigh)];
  }
  if (code === 'WATER_LEVEL') return [20, 90];
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
    if (!is_formal_session && assigned_plot_names.size > assigned_plots.length) {
      const cucumber_plot = MOCK_DATA.plots.find((plot) => plot.cropCode === 'cucumber');
      const missing_name = [...assigned_plot_names].find((name) => !assigned_plots.some((plot) => plot.name === name));
      if (cucumber_plot && missing_name) {
        const patched = { ...cucumber_plot, name: missing_name };
        assigned_plots.push({ ...patched, healthScore: compute_plot_health_score(patched) });
      }
    }
    const plots = ref(assigned_plots);

    const messages = ref(is_formal_session ? [] : MOCK_DATA.farmer_messages.map((msg) => ({ ...msg })));
    const tasks = ref(is_formal_session ? [] : MOCK_DATA.farmer_tasks.map((task) => ({ ...task })));
    const inspection_records = ref(is_formal_session ? [] : (MOCK_DATA.inspections || []).map((record) => ({
      ...record,
      plotName: find_plot_by_id(MOCK_DATA.plots, record.plotId)?.name || record.plotId
    })));
    const load_error = ref('');
    let workspace_request_version = 0;
    const evidence_requests = ref([]);

    const current_view = ref('dashboard');
    const selected_plot = ref(plots.value[0] || null);
    const shared_module_links = SHARED_MODULE_LINKS;
    const chart_range = ref('7d');
    const chart_range_options = CHART_RANGE_OPTIONS;
    const plot_charts = computed(() => PLOT_CHART_SPECS
      .map((spec) => {
        const chart = metric_chart(selected_plot.value, spec.code, chart_range.value);
        if (!chart) return null;
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
      if (plot) advice_selected_plot.value = plot;
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
      const plot = advice_plot.value;
      const moisture = plot?.metrics?.SOIL_MOISTURE;
      if (!plot || moisture?.value === undefined || moisture?.value === null) return 0;
      return plot.deviceStatus === 'ONLINE' ? 100 : 50;
    });
    const irrigation_amount = computed(() => '—');
    const irrigation_duration_label = computed(() => '等待后端处方');
    const irrigation_target_label = computed(() => {
      const plot = advice_plot.value;
      if (!plot) return '暂无地块数据';
      const band = selected_crop_band.value;
      return `当前 ${plot.metrics?.SOIL_MOISTURE?.value ?? '—'}% · 目标 ${band?.targetText || plot.metrics?.SOIL_MOISTURE?.target || '—'}`;
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
    const selected_task = ref(null);
    const analyzing = ref(false);
    const analysis_result = ref('');
    const analysis_error = ref('');
    const analysis_source_label = ref('');
    const show_inspection_form = ref(false);
    const show_evidence_form = ref(false);
    const show_account_modal = ref(false);
    const show_profile_menu = ref(false);
    const inspection_form = ref({
      plot_id: plots.value[0]?.plotId || '',
      work_order_id: '',
      soil_surface: 'NORMAL',
      crop_condition: 'HEALTHY',
      moisture: plots.value[0]?.metrics?.SOIL_MOISTURE?.value ?? '',
      notes: ''
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
    const suggestion_feedback = ref('');
    const qa_input = ref('');
    const latest_answer = ref('');
    const qa_history = ref([]);
    const qa_source_label = ref(is_formal_session ? '后端 AI' : '演示规则');

    const nav_items = computed(() => {
      const unread = messages.value.filter((m) => !m.read).length;
      const pending = tasks.value.filter((t) => ['PENDING', 'OPEN', 'ASSIGNED', 'REJECTED'].includes(t.status)).length;
      const risks = plots.value.filter((plot) => plot.riskLevel !== 'LOW').length;
      return [
        { id: 'dashboard', label: '主面板', icon: 'dashboard' },
        { id: 'plots', label: '我的地块', icon: 'grass' },
        { id: 'tasks', label: '今日农务', icon: 'task', badge: pending || undefined },
        { id: 'inspections', label: '巡田记录', icon: 'fact_check', badge: inspection_records.value.length || undefined },
        { id: 'advice', label: '灌溉系统', icon: 'water_drop', badge: risks || undefined },
        { id: 'messages', label: '消息中心', icon: 'forum', badge: unread || undefined },
        { id: 'more-tools', label: '更多工具', icon: 'apps', is_footer: true, target: 'work-orders' }
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
      const today_todo = tasks.value.filter((t) =>
        ['PENDING', 'OPEN', 'ASSIGNED', 'REJECTED'].includes(t.status) && is_today(t.due_iso)
      ).length;
      const dispatched = tasks.value.length;
      const done = tasks.value.filter((t) => t.status === 'DONE').length;
      const pending = tasks.value.filter((t) => ['PENDING', 'OPEN', 'ASSIGNED', 'REJECTED'].includes(t.status)).length;
      const in_progress = tasks.value.filter((t) => t.status === 'IN_PROGRESS').length;
      const unread_messages = messages.value.filter((m) => !m.read).length;
      const risk_alerts = plots.value.filter((plot) => plot.riskLevel !== 'LOW').length;
      return { today_todo, dispatched, done, pending, in_progress, unread_messages, risk_alerts };
    });

    const recent_tasks = computed(() =>
      tasks.value
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

    const unread_count = computed(() => messages.value.filter((m) => !m.read).length);

    const task_columns = computed(() => [
      { status: 'PENDING', label: '未开始', items: tasks.value.filter((t) => ['PENDING', 'OPEN'].includes(t.status)) },
      { status: 'ASSIGNED', label: '已分配', items: tasks.value.filter((t) => t.status === 'ASSIGNED') },
      { status: 'IN_PROGRESS', label: '执行中', items: tasks.value.filter((t) => t.status === 'IN_PROGRESS') },
      { status: 'SUBMITTED', label: '待验收', items: tasks.value.filter((t) => t.status === 'SUBMITTED') },
      { status: 'REJECTED', label: '需返工', items: tasks.value.filter((t) => t.status === 'REJECTED') },
      { status: 'DONE', label: '已完成', items: tasks.value.filter((t) => ['DONE', 'CANCELLED'].includes(t.status)) }
    ]);

    const profile_stats = computed(() => {
      const total_done = Number.isFinite(Number(user.value.total_done)) ? Number(user.value.total_done) : tasks.value.filter((t) => ['DONE', 'COMPLETED'].includes(normalizeWorkStatus(t.status))).length;
      const month_done = Number.isFinite(Number(user.value.month_done)) ? Number(user.value.month_done) : 0;
      const in_progress = tasks.value.filter((t) => t.status === 'IN_PROGRESS').length;
      const pending = tasks.value.filter((t) => ['PENDING', 'OPEN', 'ASSIGNED', 'REJECTED'].includes(t.status)).length;
      const due_soon = tasks.value.filter(is_due_soon).length;
      const completion_rate = Number.isFinite(Number(user.value.completion_rate))
        ? Number(user.value.completion_rate)
        : tasks.value.length ? Math.round((tasks.value.filter((t) => ['DONE', 'COMPLETED'].includes(normalizeWorkStatus(t.status))).length / tasks.value.length) * 100) : 0;
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

    const navigate = (view_id) => {
      current_view.value = view_id;
      if (view_id !== 'messages') {
        selected_message.value = null;
        analysis_result.value = '';
        analysis_error.value = '';
      }
      if (view_id !== 'tasks') {
        selected_task.value = null;
      }
      if (view_id !== 'plots') {
        selected_plot.value = null;
      } else if (!selected_plot.value) {
        selected_plot.value = plots.value[0] || null;
      }
      if (view_id !== 'inspections') {
        show_inspection_form.value = false;
        show_evidence_form.value = false;
      }
    };

    const toggle_sidebar = () => { is_sidebar_open.value = !is_sidebar_open.value; };
    const toggle_profile_menu = () => { show_profile_menu.value = !show_profile_menu.value; };
    const close_profile_menu = () => { show_profile_menu.value = false; };

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

    const status_label = (status) => STATUS_LABELS[status] || status;
    const priority_label = (priority) => PRIORITY_LABELS[priority] || priority;
    const category_label = (category) => CATEGORY_LABELS[category] || category;
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
        const history = {};
        (result.value || []).forEach((point) => {
          const metric = String(point?.metric || '').trim();
          if (!metric) return;
          (history[metric] ||= []).push(point);
        });
        const metrics = { ...plot.metrics };
        Object.entries(history).forEach(([code, points]) => {
          metrics[code] = { ...(metrics[code] || {}), history: points };
        });
        return { ...plot, metrics, history, healthScore: compute_plot_health_score({ ...plot, metrics }) };
      });
      // Preserve references when the farmer is reading messages; only swap plots.
      replace_ref_array(plots, nextPlots);
      selected_plot.value = nextPlots.find((plot) => plot.plotId === selected_plot.value?.plotId) || nextPlots[0] || null;
      advice_selected_plot.value = nextPlots.find((plot) => plot.plotId === advice_selected_plot.value?.plotId) || nextPlots[0] || null;
      data_updated_label.value = '刚刚';
      return true;
    };

    const load_live_workspace = async ({ announce = false } = {}) => {
      if (!is_formal_session) return false;
      const version = ++workspace_request_version;
      load_error.value = '';
      try {
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
        const telemetryResults = await Promise.allSettled(normalizedPlots.map((plot) => api.getPlotTelemetryAll(plot.plotId, 120)));
        normalizedPlots = normalizedPlots.map((plot, index) => {
          const result = telemetryResults[index];
          if (result?.status !== 'fulfilled') return plot;
          const history = {};
          (result.value || []).forEach((point) => {
            const metric = String(point?.metric || '').trim();
            if (!metric) return;
            (history[metric] ||= []).push(point);
          });
          const metrics = { ...plot.metrics };
          Object.entries(history).forEach(([code, points]) => { metrics[code] = { ...(metrics[code] || {}), history: points }; });
          return { ...plot, metrics, history };
        });
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
        if (!inspection_form.value.plot_id || !plotMap.has(inspection_form.value.plot_id)) inspection_form.value.plot_id = normalizedPlots[0]?.plotId || '';
        if (!evidence_form.value.plot_id || !plotMap.has(evidence_form.value.plot_id)) evidence_form.value.plot_id = normalizedPlots[0]?.plotId || '';
        data_updated_label.value = '刚刚';
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
      }
    };

    let workspace_refresh_timer = null;
    let telemetry_refresh_timer = null;
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
        await load_live_workspace({ announce: false });
      }, 800);
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
          analysis_error.value = '当前为离线模式，AI 概括服务不可用。请启动后端服务后再试，或联系农场管理员获取人工分析。';
        } else {
          analysis_error.value = error.message || 'AI 分析服务暂时不可用，请稍后重试。';
        }
        analysis_source_label.value = 'AI 暂不可用';
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

    const open_plot = (plot) => {
      navigate('plots');
      selected_plot.value = plot;
    };

    const open_shared_view = (view_id, plot_id = selected_plot.value?.plotId || plots.value[0]?.plotId) => {
      const module = SHARED_MODULE_LINKS.find((item) => item.id === view_id);
      if (!module) return;
      try {
        sessionStorage.setItem(SHARED_CONTEXT_KEY, JSON.stringify({
          source: 'farmer',
          plotId: plot_id || '',
          returnPage: 'farmer.html',
          createdAt: new Date().toISOString()
        }));
      } catch (error) {
        // Session storage may be unavailable in a restricted browser; navigation still works.
      }
      window.location.assign(`index.html#${module.id}`);
    };

    const toggle_irrigation = () => {
      if (is_formal_session) {
        open_shared_view('decision-console', advice_plot.value?.plotId);
        show_toast('正式会话不会直接操作水泵，请在智能诊断页完成人工审批', 'error');
        return;
      }
      irrigation_running.value = !irrigation_running.value;
      irrigation_progress.value = irrigation_running.value ? 18 : 0;
      show_toast(irrigation_running.value ? '演示灌溉已开始，不会控制真实水泵' : '演示灌溉已停止');
    };

    const set_suggestion_feedback = (feedback) => {
      if (is_formal_session) {
        show_toast('正式建议反馈需要关联具体决策记录，请在智能诊断页提交', 'error');
        return;
      }
      suggestion_feedback.value = feedback;
      show_toast(`演示反馈已记录：${feedback}`);
    };

    const ask_question = async () => {
      const question = qa_input.value.trim();
      if (!question) {
        show_toast('请先输入想了解的农事问题', 'error');
        return;
      }
      if (is_formal_session) {
        const plot_id = advice_selected_plot.value?.plotId || selected_plot.value?.plotId || plots.value[0]?.plotId;
        try {
          const response = await api.agentChat(question, plot_id);
          const answer = agentResponseText(response, '后端智能服务已返回，但没有可展示的回答。');
          latest_answer.value = answer;
          qa_source_label.value = agentResponseSource(response, 'live');
          qa_history.value.unshift({ id: Date.now(), question, answer, sourceLabel: qa_source_label.value, traceId: response?.traceId, dataOrigin: 'BACKEND' });
          qa_history.value = qa_history.value.slice(0, 4);
          qa_input.value = '';
          return;
        } catch (error) {
          qa_source_label.value = 'AI 暂不可用';
          show_toast(`智能问答暂不可用：${error.message || '后端服务错误'}`, 'error');
          return;
        }
      }
      const lower = question.toLowerCase();
      let answer = '建议先查看“我的地块”的最新数据，再结合现场观察决定是否操作；数据不足时请申请补证。';
      if (question.includes('水') || question.includes('浇') || lower.includes('irrig')) {
        answer = 'A01 当前土壤湿度为 16.8%，系统建议补水约 153 升、执行约 8 分 30 秒。请先完成现场核验，并等待管理员审批。';
      } else if (question.includes('温度') || question.includes('热')) {
        answer = '当前示范地块温度在 23.8~27.6°C，暂未触发高温告警；如果棚内持续升温，建议先通风并记录现场情况。';
      } else if (question.includes('病') || question.includes('虫')) {
        answer = '系统没有足够的图像证据判断病虫害。请在「巡田记录」中申请巡田或录入现场观察，再由管理员复核。';
      }
      latest_answer.value = answer;
      qa_source_label.value = '演示规则';
      qa_history.value.unshift({ id: Date.now(), question, answer, sourceLabel: qa_source_label.value });
      qa_history.value = qa_history.value.slice(0, 4);
      qa_input.value = '';
    };

    const open_inspection_form = (plot_id = selected_plot.value?.plotId || plots.value[0]?.plotId, work_order_id = '') => {
      navigate('inspections');
      inspection_form.value = {
        plot_id: plot_id || '',
        work_order_id: work_order_id || '',
        soil_surface: 'NORMAL',
        crop_condition: 'HEALTHY',
        moisture: find_plot_by_id(plots.value, plot_id)?.metrics?.SOIL_MOISTURE?.value ?? '',
        notes: ''
      };
      show_inspection_form.value = true;
    };

    const close_inspection_form = () => { show_inspection_form.value = false; };

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
          });
          close_inspection_form();
          await load_live_workspace({ announce: false });
          show_toast('巡田记录已保存，管理员和诊断模块可读取');
        } catch (error) {
          show_toast(error.message || '巡田记录保存失败', 'error');
        }
        return;
      }
      inspection_records.value.unshift({
        inspectionId: `ins-${Date.now()}`,
        plotId: plot.plotId,
        plotName: plot.name,
        operatorId: user.value.userId || 'user-farmer',
        observedAt: new Date().toISOString(),
        soilSurface: inspection_form.value.soil_surface,
        cropCondition: inspection_form.value.crop_condition,
        portableSoilMoisture: inspection_form.value.moisture,
        notes: inspection_form.value.notes,
        provenance: 'USER_PROVIDED',
        sourceType: 'HUMAN_OBSERVATION',
        quality: { status: 'GOOD', completeness: 1.0 }
      });
      close_inspection_form();
      show_toast('演示巡田记录已保存');
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

    const change_password = () => {
      password_error.value = '';
      if (password_form.value.next.length < 6) {
        password_error.value = '新密码至少需要 6 位';
        return;
      }
      if (password_form.value.next !== password_form.value.confirm) {
        password_error.value = '两次输入的新密码不一致';
        return;
      }
      close_account_modal();
      show_toast(is_formal_session ? '当前账号服务暂未开放密码修改接口，请使用登录页的找回密码' : '演示密码修改成功');
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

    onMounted(async () => {

      const saved_theme = localStorage.getItem('agriloop-theme');
      if (saved_theme === 'dark') {
        is_dark.value = true;
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
      }
      is_live.value = await api.checkHealth();
      if (is_formal_session) {
        await load_live_workspace({ announce: true });
        is_live.value = api.isLive;
        try {
          await api.subscribeEvents((event) => {
            const type = String(event?.data?.eventType || event?.type || '').toLowerCase();
            if (['connected', 'heartbeat'].includes(type)) return;
            // Telemetry only refreshes plot metrics.  Rebuilding the whole
            // workspace on every sample made the message center flicker as if
            // the same notice were arriving again and again.
            if (type.includes('telemetry') || type.includes('device.heartbeat')) {
              schedule_live_refresh('telemetry');
              return;
            }
            if (type.includes('workorder') || type.includes('work-order') || type.includes('alert') || type.includes('inspection') || type.includes('plot.')) {
              schedule_live_refresh('workspace');
            }
          });
        } catch (error) {
          show_toast(`实时同步暂不可用：${error.message || '事件流连接失败'}`, 'error');
        }
      }
    });

    return {
      is_live,
      load_error,
      is_dark,
      is_sidebar_open,
      data_updated_label,
      user,
      farm,
      nav_items,
      shared_module_links,
      current_view,
      messages,
      tasks,
      plots,
      selected_plot,
      chart_range,
      chart_range_options,
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
      inspection_form,
      evidence_form,
      password_form,
      password_error,
      irrigation_running,
      irrigation_progress,
      suggestion_feedback,
      qa_input,
      latest_answer,
      qa_history,
      qa_source_label,
      toasts,
      greeting,
      stats,
      recent_tasks,
      recent_messages,
      sorted_messages,
      unread_count,
      task_columns,
      profile_stats,
      account_profile,
      navigate,
      toggle_sidebar,
      toggle_profile_menu,
      close_profile_menu,
      toggle_theme,
      logout,
      status_label,
      priority_label,
      category_label,
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
      close_task,
      open_plot,
      open_shared_view,
      toggle_irrigation,
      set_suggestion_feedback,
      ask_question,
      open_inspection_form,
      close_inspection_form,
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
if (!_session || !_session_user) {
  window.location.replace('login.html');
} else if (_session_user.role !== 'FARMER') {
  window.location.replace('index.html');
} else {
  app.mount('#farmer_app');
}
