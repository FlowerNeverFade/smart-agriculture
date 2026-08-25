import { api } from './api.js';
import { MOCK_DATA } from './mock-data.js';
import { presentRoleUser } from './roles.js';

const { createApp, ref, computed, onMounted } = Vue;

const STATUS_LABELS = {
  PENDING: '未开始',
  ASSIGNED: '已分配',
  IN_PROGRESS: '执行中',
  DONE: '已完成'
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
      values: build_values(base, spec.amplitude * (index === 1 ? 0.65 : 1), index)
    }))
    : [{
      label: spec.label,
      color: is_risk ? risk_color : spec.color,
      values: build_values(Number(metric.value))
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

/** 土壤湿度相对目标值带 / 告警阈值的分级：NORMAL | WARN | ALERT */
function resolve_moisture_band_status(plot) {
  const value = Number(plot?.metrics?.SOIL_MOISTURE?.value);
  if (!Number.isFinite(value)) return 'NORMAL';
  const pack = (MOCK_DATA.cropPackDetails || []).find((p) => p.cropCode === plot.cropCode);
  let low = null;
  let high = null;
  let alertThreshold = null;
  if (pack) {
    const stage = pack.stages?.find((s) => s.code === plot.stageCode) || pack.stages?.[pack.stages.length - 1];
    low = stage?.target?.soilMoistureLow;
    high = stage?.target?.soilMoistureHigh;
    const deficit = (pack.rules || []).find((r) => r.code === 'WATER_DEFICIT' && r.metric === 'SOIL_MOISTURE');
    if (deficit && Number.isFinite(deficit.threshold)) alertThreshold = deficit.threshold;
  } else {
    const nums = String(plot.metrics?.SOIL_MOISTURE?.target || '').match(/(\d+(?:\.\d+)?)/g);
    if (nums && nums.length >= 2) {
      low = Number(nums[0]);
      high = Number(nums[1]);
    }
  }
  if (Number.isFinite(alertThreshold) && value < alertThreshold) return 'ALERT';
  if (Number.isFinite(low) && value < low) return 'WARN';
  if (Number.isFinite(high) && value > high) return 'WARN';
  return 'NORMAL';
}

const BAND_STATUS_LABELS = {
  NORMAL: '正常',
  WARN: '偏离目标',
  ALERT: '低于阈值'
};

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
    const fallback_user = MOCK_DATA.farmer_profile;


    const initial_user = session_user;

    const user = ref({
      ...initial_user,
      joined_at: fallback_user.joined_at,
      contact: fallback_user.contact,
      plot_names: fallback_user.plot_names
    });

    const farm = ref(MOCK_DATA.farms[0]);
    const assigned_plot_names = new Set(fallback_user.plot_names || []);
    const assigned_plots = MOCK_DATA.plots.filter((plot) => assigned_plot_names.has(plot.name)).map((plot) => ({ ...plot }));
    if (assigned_plot_names.size > assigned_plots.length) {
      const cucumber_plot = MOCK_DATA.plots.find((plot) => plot.cropCode === 'cucumber');
      const missing_name = [...assigned_plot_names].find((name) => !assigned_plots.some((plot) => plot.name === name));
      if (cucumber_plot && missing_name) assigned_plots.push({ ...cucumber_plot, name: missing_name });
    }
    const plots = ref(assigned_plots);

    const messages = ref(MOCK_DATA.farmer_messages.map((msg) => ({ ...msg })));
    const tasks = ref(MOCK_DATA.farmer_tasks.map((task) => ({ ...task })));
    const inspection_records = ref((MOCK_DATA.inspections || []).map((record) => ({
      ...record,
      plotName: find_plot_by_id(MOCK_DATA.plots, record.plotId)?.name || record.plotId
    })));
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
    const advice_plot = computed(() => plots.value[0] || null);
    const advice_selected_plot = ref(plots.value[0] || null);
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
        healthScore: plot.healthScore,
        selected: advice_selected_plot.value?.plotId === plot.plotId
      };
    }));

    // 灌溉系统页：选中地块的目标值带（Crop Pack 阶段）与告警阈值（规则）
    const moisture_range = ref('7d');
    const moisture_range_options = CHART_RANGE_OPTIONS;
    const selected_crop_band = computed(() => {
      const plot = advice_selected_plot.value;
      if (!plot) return null;
      const pack = (MOCK_DATA.cropPackDetails || []).find((p) => p.cropCode === plot.cropCode);
      let low = 0;
      let high = 0;
      let cropLabel = plot.cropName;
      let stageLabel = plot.stageLabel;
      let alertThreshold = null;
      if (pack) {
        const stage = pack.stages?.find((s) => s.code === plot.stageCode) || pack.stages?.[pack.stages.length - 1];
        low = stage?.target?.soilMoistureLow ?? 0;
        high = stage?.target?.soilMoistureHigh ?? 0;
        cropLabel = pack.identity?.name || plot.cropName;
        stageLabel = stage?.label || plot.stageLabel;
        const deficit = (pack.rules || []).find((r) => r.code === 'WATER_DEFICIT' && r.metric === 'SOIL_MOISTURE');
        if (deficit && Number.isFinite(deficit.threshold)) alertThreshold = deficit.threshold;
      } else {
        const targetText = plot.metrics?.SOIL_MOISTURE?.target || '';
        const nums = String(targetText).match(/(\d+(?:\.\d+)?)/g);
        if (nums && nums.length >= 2) {
          low = Number(nums[0]);
          high = Number(nums[1]);
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
    const show_inspection_form = ref(false);
    const show_evidence_form = ref(false);
    const show_account_modal = ref(false);
    const inspection_form = ref({
      plot_id: plots.value[0]?.plotId || '',
      soil_surface: 'NORMAL',
      crop_condition: 'HEALTHY',
      moisture: plots.value[0]?.metrics?.SOIL_MOISTURE?.value || 0,
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

    const nav_items = computed(() => {
      const unread = messages.value.filter((m) => !m.read).length;
      const pending = tasks.value.filter((t) => t.status === 'PENDING' || t.status === 'ASSIGNED').length;
      const risks = plots.value.filter((plot) => plot.riskLevel !== 'LOW').length;
      return [
        { id: 'dashboard', label: '主面板', icon: 'dashboard' },
        { id: 'plots', label: '我的地块', icon: 'grass' },
        { id: 'tasks', label: '今日农务', icon: 'task', badge: pending || undefined },
        { id: 'inspections', label: '巡田记录', icon: 'fact_check', badge: inspection_records.value.length || undefined },
        { id: 'advice', label: '灌溉系统', icon: 'water_drop', badge: risks || undefined },
        { id: 'messages', label: '消息中心', icon: 'forum', badge: unread || undefined },
        { id: 'profile', label: '个人中心', icon: 'account_circle' },
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
        (t.status === 'PENDING' || t.status === 'ASSIGNED') && is_today(t.due_iso)
      ).length;
      const dispatched = tasks.value.length;
      const done = tasks.value.filter((t) => t.status === 'DONE').length;
      const pending = tasks.value.filter((t) => t.status === 'PENDING' || t.status === 'ASSIGNED').length;
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
      { status: 'PENDING', label: '未开始', items: tasks.value.filter((t) => t.status === 'PENDING') },
      { status: 'ASSIGNED', label: '已分配', items: tasks.value.filter((t) => t.status === 'ASSIGNED') },
      { status: 'IN_PROGRESS', label: '执行中', items: tasks.value.filter((t) => t.status === 'IN_PROGRESS') },
      { status: 'DONE', label: '已完成', items: tasks.value.filter((t) => t.status === 'DONE') }
    ]);

    const profile_stats = computed(() => {
      const total_done = user.value.total_done || MOCK_DATA.farmer_profile.total_done;
      const month_done = MOCK_DATA.farmer_profile.month_done;
      const in_progress = tasks.value.filter((t) => t.status === 'IN_PROGRESS').length;
      const pending = tasks.value.filter((t) => t.status === 'PENDING' || t.status === 'ASSIGNED').length;
      const due_soon = tasks.value.filter(is_due_soon).length;
      const completion_rate = MOCK_DATA.farmer_profile.completion_rate;
      const inspections = inspection_records.value.length;
      const messages_count = messages.value.length;
      const unread = messages.value.filter((m) => !m.read).length;
      return { total_done, month_done, in_progress, pending, due_soon, completion_rate, inspections, messages: messages_count, unread };
    });

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
    const health_ring_style = (plot) => {
      const score = Math.round((plot?.healthScore || 0) * 100);
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
      try {
        if (!is_live.value) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          throw Object.assign(new Error('OFFLINE'), { is_network: true });
        }
        const base_url = api.baseUrl || '';
        const response = await fetch(`${base_url}/api/v1/ai/message-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: msg.id, title: msg.title, body: msg.body_paragraphs })
        });
        if (!response.ok) throw new Error(`服务返回 ${response.status}`);
        const result = await response.json();
        analysis_result.value = result.summary || result.analysis || '分析完成，但未返回概括内容。';
      } catch (error) {
        if (error.is_network || !is_live.value) {
          analysis_error.value = '当前为离线模式，AI 概括服务不可用。请启动后端服务后再试，或联系农场管理员获取人工分析。';
        } else {
          analysis_error.value = error.message || 'AI 分析服务暂时不可用，请稍后重试。';
        }
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
      irrigation_running.value = !irrigation_running.value;
      irrigation_progress.value = irrigation_running.value ? 18 : 0;
      show_toast(irrigation_running.value ? '演示灌溉已开始，不会控制真实水泵' : '演示灌溉已停止');
    };

    const set_suggestion_feedback = (feedback) => {
      suggestion_feedback.value = feedback;
      show_toast(`已记录反馈：${feedback}`);
    };

    const ask_question = () => {
      const question = qa_input.value.trim();
      if (!question) {
        show_toast('请先输入想了解的农事问题', 'error');
        return;
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
      qa_history.value.unshift({ id: Date.now(), question, answer });
      qa_history.value = qa_history.value.slice(0, 4);
      qa_input.value = '';
    };

    const open_inspection_form = (plot_id = selected_plot.value?.plotId || plots.value[0]?.plotId) => {
      navigate('inspections');
      inspection_form.value = {
        plot_id: plot_id || '',
        soil_surface: 'NORMAL',
        crop_condition: 'HEALTHY',
        moisture: find_plot_by_id(plots.value, plot_id)?.metrics?.SOIL_MOISTURE?.value || 0,
        notes: ''
      };
      show_inspection_form.value = true;
    };

    const close_inspection_form = () => { show_inspection_form.value = false; };

    const submit_inspection = () => {
      const plot = find_plot_by_id(plots.value, inspection_form.value.plot_id);
      if (!plot || !inspection_form.value.notes) {
        show_toast('请填写地块和现场说明', 'error');
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
      show_toast('巡田记录已保存，等待管理员复核');
    };

    const open_evidence_form = (plot_id = selected_plot.value?.plotId || plots.value[0]?.plotId) => {
      navigate('inspections');
      evidence_form.value = { plot_id: plot_id || '', type: 'FIELD_INSPECTION', reason: '' };
      show_evidence_form.value = true;
    };

    const close_evidence_form = () => { show_evidence_form.value = false; };

    const submit_evidence_request = () => {
      if (!evidence_form.value.reason) {
        show_toast('请填写申请原因', 'error');
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
      show_toast('补证申请已提交，管理员会安排处理');
    };

    const open_account_modal = () => {
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
      show_toast('演示密码修改成功，接入账号服务后将正式生效');
    };

    const forgot_password = () => {
      show_toast(`找回密码指引已发送到 ${user.value.contact}`);
    };

    const close_task = () => { selected_task.value = null; };

    const start_task = (task) => {
      const source = tasks.value.find((item) => item.id === task.id);
      if (source) source.status = 'IN_PROGRESS';
      task.status = 'IN_PROGRESS';
      show_toast(`已开始执行：${task.title}`);
      close_task();
    };

    const complete_task = (task) => {
      const source = tasks.value.find((item) => item.id === task.id);
      if (source) source.status = 'DONE';
      task.status = 'DONE';
      show_toast(`已提交完成：${task.title}`);
      close_task();
    };

    const report_issue = (task) => {
      show_toast(`已上报问题：${task.title}，农场管理员将收到通知`, 'error');
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
    });

    return {
      is_live,
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
      advice_moisture_chart,
      selected_message,
      selected_task,
      analyzing,
      analysis_result,
      analysis_error,
      inspection_records,
      evidence_requests,
      show_inspection_form,
      show_evidence_form,
      show_account_modal,
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
      toasts,
      greeting,
      stats,
      recent_tasks,
      recent_messages,
      sorted_messages,
      unread_count,
      task_columns,
      profile_stats,
      navigate,
      toggle_sidebar,
      toggle_theme,
      logout,
      status_label,
      priority_label,
      category_label,
      crop_icon,
      plot_band_status,
      plot_band_label,
      metric_status_of,
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
