import { api } from './api.js';
import { MOCK_DATA } from './mock-data.js?v=1787645254016';
import { presentRoleUser, roleCan, roleDefinition, roleViews } from './roles.js';
import { buildAccountProfile } from './account-profile.js';
import { AdminAlertCenter } from './admin-alerts.js';
import { WorkOrderLifecycleView } from './work-order-lifecycle.js';
import { AdminDecisionView } from './modules/admin-decision.js';
import { AdminResourcePlanningView } from './modules/admin-resource-planning.js';
import { AdminWorkManagementView } from './modules/admin-work-management.js';
import { AdminResourceCenterView } from './modules/admin-resource-center.js';
import { AdminMemberManagementView } from './modules/admin-member-management.js';
import { adminSummary, domainsForEventType, formatHealthScore, hasFarmPlotRefresh, isLatestFarmResponse, mergeFarmPlots, normalizeAdminTab, routeHash, selectAuthorizedFarm } from './admin-state.js';
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
  normalizePlot
} from './live-data.js';

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
  add_task: 'ph-note-pencil',
  remove_circle_outline: 'ph-minus-circle',
  close: 'ph-x',
  psychology: 'ph-brain',
  receipt_long: 'ph-receipt',
  bolt: 'ph-lightning',
  policy: 'ph-shield-check',
  smart_toy: 'ph-robot',
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
  add: 'ph-plus'
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
  { id: 'decision-console', label: '智能决策', icon: 'warning_amber', labels: { FARMER: '智能建议', FARM_ADMIN: '告警与诊断', SYSTEM_ADMIN: '决策审计' } },
  { id: 'risk-forecast', label: '风险推演', icon: 'timeline', labels: { FARMER: '风险预警' } },
  { id: 'work-orders', label: '农务工单', icon: 'task_alt', labels: { FARMER: '农务记录', FARM_ADMIN: '农务任务', SYSTEM_ADMIN: '工单审计' } },
  { id: 'resource-coordination', label: '设备与灌溉', icon: 'water_drop' },
  { id: 'farm-members', label: '农场成员', icon: 'group' },
  { id: 'crop-manual', label: '作物培养手册', icon: 'menu_book', labels: { FARMER: '作物培养手册', FARM_ADMIN: '作物培养手册', SYSTEM_ADMIN: '作物培养手册' } },
  { id: 'crop-packs', label: '作物模型', icon: 'library_books', labels: { FARM_ADMIN: '作物模型', SYSTEM_ADMIN: '规则配置' } },
  { id: 'value-ledger', label: '价值对账', icon: 'account_balance_wallet', labels: { FARM_ADMIN: '价值对账', SYSTEM_ADMIN: '价值审计' } },
  { id: 'admin-overview', label: '平台总览', icon: 'monitoring', labels: { SYSTEM_ADMIN: '平台总览' } },
  { id: 'admin-ops', label: '运行监控', icon: 'dns', labels: { SYSTEM_ADMIN: '运行监控' } },
  { id: 'admin-audit', label: '决策审计', icon: 'gavel', labels: { SYSTEM_ADMIN: '决策审计' } },
  { id: 'admin-simulator', label: '仿真验证', icon: 'science', labels: { SYSTEM_ADMIN: '仿真验证' } },
  { id: 'admin-rules', label: '规则与版本', icon: 'rule_folder', labels: { SYSTEM_ADMIN: '规则与版本' } },
  { id: 'admin-settings', label: '系统管理', icon: 'admin_panel_settings', labels: { SYSTEM_ADMIN: '系统管理' } }
]);

const PLOT_METRIC_ORDER = Object.freeze(['SOIL_MOISTURE', 'AIR_TEMPERATURE', 'AIR_HUMIDITY', 'LIGHT', 'CO2', 'SOIL_EC', 'NPK_RATIO']);
const METRIC_LABELS = Object.freeze({
  SOIL_MOISTURE: '土壤湿度', AIR_TEMPERATURE: '空气温度', AIR_HUMIDITY: '空气湿度',
  LIGHT: '光照', CO2: 'CO2', SOIL_EC: '土壤 EC', NPK_RATIO: '氮磷钾'
});
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

const EMPTY_VALUE_LEDGER = Object.freeze({
  summary: { plannedWaterLitres: '—', actualWaterLitres: '—', savedWaterLitres: '—', savedElectricityKwh: '—', labourSavedHours: '—', totalSavedRmb: '—' },
  provenance: [],
  counterfactual: [],
  daily: []
});

function liveStatusValue(status, fallback = 'UNKNOWN') {
  return String(status || fallback).trim().toUpperCase();
}

function adminServiceCards(systemStatus = {}) {
  const entries = [
    ['PostgreSQL', systemStatus.database],
    ['Redis Streams', systemStatus.redis],
    ['MQTT Broker', systemStatus.mqtt],
    ['SSE Gateway', 'UP'],
    ['API Service', 'UP'],
    ['AI 服务', systemStatus.ai]
  ];
  return entries.map(([name, status]) => ({
    name,
    status: liveStatusValue(status, 'UNKNOWN'),
    mode: name === 'AI 服务' ? (status || '—') : undefined,
    sourceMode: 'BACKEND'
  }));
}

function adminOverviewFromLive({ overview = {}, systemStatus = {}, simulator = {}, alerts = [], devices = [], recentEvents = [] } = {}) {
  const statuses = alerts.map((alert) => liveStatusValue(alert.status, 'ACTIVE'));
  const open = statuses.filter((status) => ['ACTIVE', 'OPEN', 'UNACKNOWLEDGED'].includes(status)).length;
  const acknowledged = statuses.filter((status) => ['ACK', 'ACKED'].includes(status)).length;
  const online = devices.filter((device) => ['ONLINE', 'UP', 'ACTIVE'].includes(liveStatusValue(device.status))).length;
  const simStatus = liveStatusValue(simulator.status, 'UNAVAILABLE');
  return {
    uptime: '—',
    apiVersion: '—',
    aiMode: String(systemStatus.ai || overview.aiMode || '—').toLowerCase(),
    llmModel: '—',
    alerts: { open, acknowledged, closedToday: statuses.filter((status) => ['CLOSED', 'RESOLVED'].includes(status)).length },
    devices: { total: devices.length, online, offline: Math.max(0, devices.length - online) },
    simulator: {
      running: simStatus === 'RUNNING',
      scenario: simulator.scenario || simulator.scenarioId || '',
      eventsEmitted: Number(simulator.eventsEmitted || simulator.eventCount || overview.eventCount || 0),
      startTime: simulator.startedAt || null
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
const SILENT_SYSTEM_EVENT_TYPES = new Set([
  'telemetry.received',
  'device.heartbeat',
  'scenario.telemetry'
]);

function systemEventType(event) {
  return String(event?.data?.eventType || event?.type || 'system').trim().toLowerCase();
}

function isSilentSystemEventType(type) {
  const normalized = String(type || '').toLowerCase();
  return SILENT_SYSTEM_EVENT_TYPES.has(normalized)
    || normalized.includes('telemetry')
    || normalized.includes('heartbeat');
}

function presentSystemEvent(event) {
  const payload = event?.data?.payload || event?.data || {};
  const type = systemEventType(event);
  const category = /alert|warning/i.test(type) ? 'alert' : /login|auth/i.test(type) ? 'login' : /command|ack|execution/i.test(type) ? 'system' : 'system';
  const icon = category === 'alert' ? 'warning' : category === 'login' ? 'login' : 'notifications';
  const silent = isSilentSystemEventType(type);
  const title = payload.title || payload.summary || payload.message || (silent ? '实时数据已更新' : `${type} 事件已到达`);
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
  props: ['state', 'routeParams'],
  emits: ['navigate', 'open-plot-detail', 'plot-change', 'data-invalidated', 'context-changed'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const isFarmAdmin = computed(() => props.state.currentUser?.role === 'FARM_ADMIN');
    const activeTab = ref(normalizeAdminTab('dashboard', props.routeParams?.tab));
    watch(() => props.routeParams?.tab, tab => { activeTab.value = normalizeAdminTab('dashboard', tab); });
    const selectedFarmId = computed({
      get: () => props.state.adminContext?.farmId || '',
      set: farmId => emit('context-changed', { farmId, plotId: null, sessionMode: props.state.sessionMode })
    });
    const visiblePlots = computed(() => activeTab.value === 'plots' ? (props.state.allPlots || []) : (props.state.plots || []));
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
      growthCycleDays: 120,
      areaM2: 100
    });
    const plotDraft = ref(emptyPlotDraft());
    const managerSummary = computed(() => {
      const summary = adminSummary({ plots: props.state.plots, workOrders: props.state.workOrders });
      return [
        { id: 'today', label: '今日任务', value: summary.today },
        { id: 'overdue', label: '已逾期', value: summary.overdue },
        { id: 'abnormal', label: '异常地块', value: summary.abnormal },
        { id: 'unassigned', label: '待分配', value: summary.unassigned },
        { id: 'approval', label: '待审批', value: summary.approval }
      ];
    });

    const plotMetrics = (plot) => PLOT_METRIC_ORDER.map((code) => ({
      code,
      label: plot?.metrics?.[code]?.label || METRIC_LABELS[code] || code,
      target: plot?.metrics?.[code]?.target || '—',
      unit: plot?.metrics?.[code]?.unit || '',
      value: plot?.metrics?.[code]?.value,
      status: plot?.metrics?.[code]?.status || 'UNAVAILABLE'
    }));
    const formatMetric = (metric) => formatMetricValue(metric);
    const healthScore = (plot) => formatHealthScore(plot?.healthScore);
    const cardTone = (plot) => isAbnormalPlot(plot) ? 'attention' : 'normal';
    const metricStatusIcon = (metric) => metricTone(metric) === 'normal' ? 'check_circle' : metricTone(metric) === 'unavailable' ? 'remove_circle_outline' : 'warning_amber';
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
        growthCycleDays: Number(plot.growthCycleDays || 120),
        areaM2: Number(plot.areaM2 || 100)
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
        growthCycleDays: Math.max(1, Math.round(Number(draft.growthCycleDays) || 1)),
        areaM2: Math.max(1, Number(draft.areaM2) || 1),
        lastSeen: plotEditor.value.mode === 'edit' ? '刚刚更新' : '等待设备接入',
        metrics: current && !cropChanged ? current.metrics : metricTemplateFor(crop.code, draft.plotId),
        deviceStatus: current?.deviceStatus || 'UNBOUND',
        healthScore: current?.healthScore ?? null,
        riskLevel: current?.riskLevel || 'LOW'
      };
      plotSaving.value = true;
      try {
        if (plotEditor.value.mode === 'edit') {
          const saved = await api.updatePlot(draft.plotId, payload);
          emit('plot-change', { type: 'update', plot: { ...payload, ...saved, metrics: payload.metrics } });
          emit('data-invalidated', { domains: ['plots', 'overview'], record: saved });
          toast(`${payload.name}已更新，其他模块已同步`);
        } else {
          const saved = await api.createPlot(payload);
          emit('plot-change', { type: 'create', plot: { ...payload, ...saved, metrics: payload.metrics } });
          emit('data-invalidated', { domains: ['plots', 'overview'], record: saved });
          toast(`${payload.name}已添加到农场`);
        }
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
    const setTab = tab => emit('navigate', 'dashboard', { tab, farmId: selectedFarmId.value });
    const visibleActions = (actions = []) => actions.filter((action) => {
      if (action.action === 'execute-irrigation') return roleCan(props.state.currentUser, 'irrigation:approve');
      if (action.action === 'open-subview') return props.state.allowedViews.includes(action.view);
      return true;
    });
    const handleAction = (action) => {
      if (action.action === 'open-subview') {
        // [INTERCONNECTIVITY] Navigate with context payload
        emit('navigate', action.view, { highlight: 'diagnosis' });
      } else if (action.action === 'execute-irrigation' && !roleCan(props.state.currentUser, 'irrigation:approve')) {
        toast('当前身份只能提交建议，灌溉执行需由农场管理员审批', 'error');
      } else {
        toast('执行成功: ' + action.label);
      }
    };
    return {
      isFarmAdmin,
      activeTab,
      selectedFarmId,
      visiblePlots,
      managerSummary,
      plotMetrics,
      formatMetric,
      healthScore,
      cardTone,
      metricTone,
      metricStatusIcon,
      openPlotDetail,
      plotMenuId,
      plotSaving,
      plotEditor,
      plotDraft,
      deleteConfirm,
      cropOptions: CROP_OPTIONS,
      stageOptions: STAGE_OPTIONS,
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
      setTab,
      handleAction,
      visibleActions
    };
  }
};

const PlotDetailModal = {
  template: '#tmpl-plot-detail-modal',
  props: ['plot', 'workOrders'],
  emits: ['close', 'navigate'],
  setup(props, { emit }) {
    const metrics = computed(() => PLOT_METRIC_ORDER.map((code) => ({
      code,
      label: props.plot?.metrics?.[code]?.label || METRIC_LABELS[code] || code,
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
        detail: '六项关键数据和采集设备目前都在可用范围内，按计划巡田即可。'
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
      metricTone,
      formatMetric: formatMetricValue,
      healthScore: formatHealthScore,
      statusLabel,
      dueLabel,
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
      { role: 'agent', content: '您好，我是 AgriLoop 农业决策智能体。我已经接入了当前地块的传感器实时数据和生长阶段的阈值模型。\n\n关于番茄当前阶段的灌溉处方，或者刚才生成的诊断结论，您有任何疑问都可以随时问我。', sourceLabel: 'AgriLoop AI' }
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
          chatHistory.value.push({ role: 'agent', content: `正式智能服务暂不可用：${error.message || '读取失败'}`, sourceLabel: 'AI 暂不可用' });
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
          reply = '我注意到当前的土壤湿度连续低于 20%（番茄结果期基线）。同时，空气温度 26.4°C 加速了蒸散，且传感器数据质量评分为 GOOD（排除了硬件漂移）。因此诊断为真实水分胁迫。';
        } else if (userMessage.includes('处方') || userMessage.includes('水')) {
          reply = '针对此情况，处方引擎计算出需要 153 升水。根据您农场主管道的 18L/min 恒定流速，换算出的执行时长为 8 分 30 秒。该时长低于 900 秒的安全阈值上限。';
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
    const canApproveIrrigation = computed(() => roleCan(props.state.currentUser, 'irrigation:approve'));
    let dualChart = null;

    const openExecution = () => {
      if (canApproveIrrigation.value) {
        showDualTrackModal.value = true;
        return;
      }
      toast('灌溉建议已提交给农场管理员审批');
      emit('navigate', 'work-orders', { highlight: 'approval-request' });
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
          legend: { data: ['执行处方 (With Action)', '不执行 (No Action)'], textStyle: { color: textColor } },
          xAxis: { type: 'category', data: ['0h', '1h', '2h', '3h', '4h'], axisLabel: { color: textColor } },
          yAxis: { type: 'value', min: 10, max: 35, axisLabel: { color: textColor } },
          series: [
            {
              name: '执行处方 (With Action)',
              type: 'line',
              smooth: true,
              itemStyle: { color: '#1e8e3e' },
              data: [16.8, 30.0, 28.5, 27.0, 26.1]
            },
            {
              name: '不执行 (No Action)',
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
      if (!canApproveIrrigation.value) {
        showDualTrackModal.value = false;
        toast('当前身份没有灌溉执行权限', 'error');
        return;
      }
      showDualTrackModal.value = false;
      const plotId = props.routeParams?.plotId || props.state.plots[0]?.plotId;
      if (props.state.sessionMode === 'live') {
        try {
          const saved = await api.createWorkOrder({
            farmId: props.state.adminContext?.farmId || props.state.farms[0]?.farmId,
            plotId,
            title: '执行灌溉处方',
            reason: '已通过当前决策护照的人工确认，等待执行工单流转',
            actionType: 'IRRIGATION_REVIEW',
            sourceType: 'AGENT',
            priority: 'HIGH',
            provenance: 'DERIVED'
          });
          props.state.workOrders.unshift(saved);
          emit('data-invalidated', { domains: ['workOrders', 'overview'], farmId: saved.farmId, plotId: saved.plotId, record: saved });
          toast('灌溉执行申请已写入后端工单，农场管理员可继续审批');
        } catch (error) {
          toast(error.message || '灌溉执行申请失败', 'error');
        }
      } else {
        props.state.workOrders.unshift({
          workOrderId: 'wo-' + Date.now(), plotId: plotId || 'plot-a01', title: '执行 153L 灌溉处方',
          reason: '演示决策下发', status: 'OPEN', priority: 'HIGH', sourceMode: 'SIMULATED'
        });
        toast('演示工单已创建');
      }
      emit('navigate', 'work-orders', { highlight: 'new-order' });
    };

    return { 
      diagnosis, prescription, highlightDiagnosis,
      chatInput, chatHistory, isTyping, chatBox, sendMessage, 
      showPassportModal, showDualTrackModal, canApproveIrrigation, openExecution, confirmExecution
    };
  }
};

const RoleAwareDecisionConsoleView = {
  components: { AdminAlertCenter, AdminDecision: AdminDecisionView, LegacyDecisionConsole: DecisionConsoleView },
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props) {
    const showDiagnosis = ref(Boolean(props.routeParams?.highlight === 'diagnosis' || props.routeParams?.section === 'diagnosis'));
    watch(() => props.routeParams?.highlight, (value) => {
      if (value === 'diagnosis') showDiagnosis.value = true;
    });
    watch(() => props.routeParams?.section, (value) => {
      if (value === 'diagnosis') showDiagnosis.value = true;
      if (value === 'alerts') showDiagnosis.value = false;
    });
    const isFarmAdmin = computed(() => props.state.currentUser?.role === 'FARM_ADMIN');
    const isFarmer = computed(() => props.state.currentUser?.role === 'FARMER');
    return { showDiagnosis, isFarmAdmin, isFarmer };
  },
  template: `
    <div class="role-decision-shell">
      <template v-if="isFarmAdmin">
        <nav class="admin-decision-tabs" aria-label="告警与诊断功能切换">
          <button class="g-btn" :class="showDiagnosis ? 'g-btn-outline' : 'g-btn-primary'" type="button" @click="showDiagnosis = false">告警处置</button>
          <button class="g-btn" :class="showDiagnosis ? 'g-btn-primary' : 'g-btn-outline'" type="button" @click="showDiagnosis = true">智能诊断与灌溉</button>
        </nav>
        <admin-alert-center v-if="!showDiagnosis" :state="state" @show-diagnosis="showDiagnosis = true" @navigate="(view, params) => $emit('navigate', view, params)"></admin-alert-center>
        <admin-decision v-else :state="state" :route-params="routeParams"
                        @navigate="(view, params) => $emit('navigate', view, params)"
                        @data-invalidated="payload => $emit('data-invalidated', payload)"></admin-decision>
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

const RiskForecastView = {
  template: '#tmpl-risk-forecast',
  props: ['state', 'routeParams'],
  setup(props) {
    let chart = null;
    const currentScenario = ref('NORMAL');
    const selectedPlotId = ref(props.state.plots[0]?.plotId || '');
    const highlightChart = ref(false);
    const forecast = ref(null);
    const loading = ref(false);
    const error = ref('');
    const DEFAULT_SCENARIOS = Object.freeze([
      { code: 'NORMAL', emoji: '🌱', label: '当前状态', desc: '读取后端最新遥测与风险预测', color: '#1a73e8' },
      { code: 'DROUGHT', emoji: '🏜️', label: '干旱情景', desc: '由后端仿真服务生成只读情景记录', color: '#d97706' },
      { code: 'STORM', emoji: '🌧️', label: '暴雨情景', desc: '由后端仿真服务生成只读情景记录', color: '#2563eb' },
      { code: 'SENSOR_DRIFT', emoji: '📡', label: '传感器漂移', desc: '由后端仿真服务生成只读情景记录', color: '#7c3aed' },
      { code: 'DEVICE_OFFLINE', emoji: '🔌', label: '设备离线', desc: '后端将按设备数据质量门禁返回结果', color: '#6b7280' }
    ]);
    const scenarioOptions = computed(() => {
      const configured = props.state.riskForecastConfig?.scenarioCatalog;
      return Array.isArray(configured) && configured.length ? configured : DEFAULT_SCENARIOS;
    });

    watch(() => props.routeParams, (newParams) => {
      if (newParams && newParams.targetPlot) {
        selectedPlotId.value = newParams.targetPlot;
        highlightChart.value = true;
        setTimeout(() => { highlightChart.value = false; }, 4000);
      }
    }, { immediate: true });

    const currentPlotBaseMoisture = computed(() => {
      const plot = props.state.plots.find(p => p.plotId === selectedPlotId.value);
      if (plot && plot.metrics && plot.metrics.SOIL_MOISTURE) {
        return parseFloat(plot.metrics.SOIL_MOISTURE.value);
      }
      return '—';
    });

    const loadForecast = async () => {
      if (!selectedPlotId.value) { forecast.value = null; return; }
      loading.value = true;
      error.value = '';
      try {
        if (props.state.sessionMode === 'live') {
          forecast.value = await api.getRiskForecast(selectedPlotId.value, 'SOIL_MOISTURE');
        } else {
          forecast.value = await api.getRiskForecast(selectedPlotId.value, 'SOIL_MOISTURE');
        }
      } catch (caught) {
        forecast.value = null;
        error.value = caught?.message || '风险预测读取失败';
      } finally {
        loading.value = false;
        renderChart();
      }
    };

    const loadScenario = async (scenario) => {
      currentScenario.value = scenario.code;
      if (props.state.sessionMode !== 'live' || scenario.code === 'NORMAL') {
        await loadForecast();
        return;
      }
      loading.value = true;
      error.value = '';
      try {
        const run = await api.runScenario({ scenario: scenario.code, plotId: selectedPlotId.value });
        forecast.value = {
          ...run,
          status: run?.status || run?.runStatus || 'RECORDED',
          curve: Array.isArray(run?.curve) ? run.curve : [],
          horizons: Array.isArray(run?.horizons) ? run.horizons : [],
          dataOrigin: 'BACKEND'
        };
        if (!forecast.value.curve.length && !forecast.value.horizons.length) {
          error.value = '后端已记录该情景，但暂未提供可绘制的曲线数据';
        }
      } catch (caught) {
        forecast.value = null;
        error.value = caught?.message || '情景记录读取失败';
      } finally {
        loading.value = false;
        renderChart();
      }
    };

    const renderChart = async () => {
      await nextTick();
      const dom = document.getElementById('riskChart');
      if (!dom) return;
      if (!chart) {
        chart = echarts.init(dom);
        window.addEventListener('resize', () => chart.resize());
      }
      
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = isDark ? '#e8eaed' : '#202124';
      
      const scenario = scenarioOptions.value.find(s => s.code === currentScenario.value) || {};
      const points = (forecast.value?.curve?.length ? forecast.value.curve : forecast.value?.horizons || [])
        .map((point) => ({
          minute: Number(point.minute ?? point.minutes ?? 0),
          expected: Number(point.expected ?? point.value),
          lower: Number(point.lower ?? point.expected ?? point.value),
          upper: Number(point.upper ?? point.expected ?? point.value)
        }))
        .filter((point) => Number.isFinite(point.minute) && Number.isFinite(point.expected));
      const times = points.map((point) => point.minute === 0 ? '现在' : `${point.minute}m`);
      const values = points.map((point) => point.expected);
      const baseMoisture = Number(currentPlotBaseMoisture.value);
      const finiteValues = values.filter(Number.isFinite);
      const minValue = finiteValues.length ? Math.min(...finiteValues) : 0;
      const maxValue = finiteValues.length ? Math.max(...finiteValues) : 40;
      const boundary = Number(forecast.value?.stressBoundary ?? forecast.value?.riskBoundary?.value);
      
      chart.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: times, axisLabel: { color: textColor } },
        yAxis: { 
          type: 'value', 
          name: '推演含水率 (%)', 
          min: Math.max(0, Math.floor(Math.min(minValue, Number.isFinite(baseMoisture) ? baseMoisture : minValue) - 5)),
          max: Math.ceil(Math.max(35, maxValue + 5, Number.isFinite(baseMoisture) ? baseMoisture + 5 : 0)),
          axisLabel: { color: textColor },
          nameTextStyle: { color: textColor }
        },
        series: [{
          data: values,
          type: 'line',
          smooth: true,
          itemStyle: { color: scenario.color || '#1a73e8' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: scenario.color || '#1a73e8' },
              { offset: 1, color: 'rgba(0,0,0,0.0)' }
            ]),
            opacity: 0.2
          },
          markLine: Number.isFinite(boundary) ? {
            data: [{ yAxis: boundary, name: `胁迫阈值 ${boundary}%` }],
            lineStyle: { color: '#d93025', type: 'dashed' },
            label: { position: 'insideStartTop', color: textColor, formatter: '{b}' }
          } : undefined
        }]
      });
    };

    const changeScenario = (scenario) => loadScenario(scenario);

    const changePlot = () => {
      loadForecast();
    };

    onMounted(() => {
        currentScenario.value = scenarioOptions.value[0]?.code || 'NORMAL';
        loadForecast();
    });
    
    const observer = new MutationObserver(() => renderChart());
    onMounted(() => observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }));
    
    return { currentScenario, selectedPlotId, currentPlotBaseMoisture, highlightChart, scenarioOptions, forecast, loading, error, changeScenario, changePlot };
  }
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
        const payload = {
          ...draft,
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

    return {
      showFormModal,
      showWorkOrderModal,
      workOrderForm,
      form,
      submitInspection,
      submitWorkOrder,
      highlightNewOrder,
      canRecordInspection,
      canCreateWorkOrder
    };
  }
};

const ResourceCoordinationView = {
  template: '#tmpl-resource-coordination',
  props: ['state', 'routeParams'],
  setup(props, { emit }) {
    const devices = computed(() => props.state.plots.map((plot) => ({
      deviceId: plot.deviceId || '—',
      plotId: plot.plotId,
      plotName: plot.name,
      status: normalizedStatus(plot.deviceStatus),
      lastSeen: plot.lastSeen || '—',
      healthScore: formatHealthScore(plot.healthScore)
    })));
    const onlineCount = computed(() => devices.value.filter((device) => device.status === 'ONLINE').length);
    const statusLabel = (status) => status === 'ONLINE' ? '在线' : status === 'OFFLINE' ? '离线' : '状态未知';
    const openIrrigation = (plotId) => emit('navigate', 'decision-console', { plotId, highlight: 'diagnosis' });
    return { devices, onlineCount, statusLabel, openIrrigation };
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
    const memberSource = (member) => member?.sourceMode === 'SIMULATED' || isDemo.value ? 'SIMULATED' : '正式账号';
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
  props: ['state', 'routeParams']
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
    WATER_LEVEL: '水位',
    LIGHT: '光照',
    CO2: 'CO2',
    SOIL_EC: '土壤 EC',
    NPK_RATIO: '氮磷钾'
  };
  const items = [
    { code: 'SOIL_MOISTURE', label: metricLabels.SOIL_MOISTURE, range: `${target.soilMoistureLow ?? '—'}~${target.soilMoistureHigh ?? '—'}`, unit: '%', availability: 'SUPPORTED', note: '阶段核心管控指标' },
    { code: 'AIR_TEMPERATURE', label: metricLabels.AIR_TEMPERATURE, range: `${target.airTemperatureLow ?? '—'}~${target.airTemperatureHigh ?? '—'}`, unit: '°C', availability: 'SUPPORTED', note: '阶段核心管控指标' }
  ];
  (pack.metrics || []).forEach((metric) => {
    if (['SOIL_MOISTURE', 'AIR_TEMPERATURE', 'WATER_LEVEL'].includes(metric.code)) return;
    const fallbackRange = metric.range ? `${metric.range.min}~${metric.range.max}` : '—';
    items.push({
      code: metric.code,
      label: metric.label || metricLabels[metric.code] || metric.code,
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
  if (stage.riskFocus?.length) {
    lines.push(`本阶段重点防范：${stage.riskFocus.map((code) => RISK_FOCUS_LABELS[code] || code).join('、')}。`);
  }
  if (stage.taskTemplates?.length) {
    const tasks = stage.taskTemplates.map((task) => {
      const action = TASK_ACTION_LABELS[task.actionType] || task.actionType;
      return `${action}（每 ${task.intervalDays} 天，优先级 ${task.priority}）`;
    }).join('；');
    lines.push(`建议农务节奏：${tasks}。`);
  }
  const ruleNotes = (pack.rules || []).map((rule) => {
    const op = rule.operator === 'LT' ? '低于' : '高于';
    return `${rule.code}：${rule.metric} ${op} ${rule.threshold} 且持续 ${rule.durationMinutes} 分钟需重点关注`;
  });
  if (ruleNotes.length) lines.push(`规则参考：${ruleNotes.join('；')}。`);
  const knowledgeLines = (pack.knowledge?.content || []).filter((line) => line && !line.startsWith('>') && !line.startsWith('#')).slice(0, 5);
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
    onMounted(() => observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }));

    return {};
  }
};



// ---- SYSTEM ADMIN COMPONENTS ----

const AdminOverviewView = {
  template: '#tmpl-admin-overview',
  props: ['state', 'routeParams'],
  setup(props) {
    const toast = inject('toast');
    const showEvents = ref(true);
    const farmFilter = ref('all');
    const statusFilter = ref('all');
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
      if (!selectedPlot.value) return;
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
      const statusMatches = statusFilter.value === 'all' || plot.status === statusFilter.value;
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
    return { showEvents, farmFilter, statusFilter, filteredPlots, plotFarms, plotSummary, healthPercent, telemetryMetrics: TELEMETRY_METRICS, selectedPlot, showPlotModal, plotMetricForm, telemetryLoading, openPlotMetrics, refreshPlotMetrics, savePlotMetrics };
  }
};

const TELEMETRY_METRICS = [
  { code: 'SOIL_MOISTURE', label: '土壤湿度' },
  { code: 'AIR_TEMPERATURE', label: '空气温度' },
  { code: 'AIR_HUMIDITY', label: '空气湿度' },
  { code: 'LIGHT', label: '光照' },
  { code: 'CO2', label: 'CO2' },
  { code: 'PH', label: 'PH' },
  { code: 'WATER_LEVEL', label: '水位' }
];

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

    return { activeTab, deviceFilter, alertFilter, alertLevel, filteredDevices, filteredAlerts, transitionAlert };
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

    return { auditTab, searchQuery, typeFilter, expandedPassport, filteredRecords, togglePassport };
  }
};

const AdminSimulatorView = {
  template: '#tmpl-admin-simulator',
  props: ['state', 'routeParams'],
  setup(props) {
    const toast = inject('toast');
    const simRunning = ref(props.state.adminOverview?.simulator?.running || false);
    const simBusy = ref(false);
    const selectedScenario = ref('NORMAL');
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
        toast(simRunning.value ? '模拟器已启动，状态来自 Supervisor' : '模拟器已停止，状态来自 Supervisor');
      } catch (error) {
        toast(error.message || '模拟器控制失败', 'error');
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
            agent: event.branchId || event.source || '后端仿真'
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

    return { simRunning, simBusy, selectedScenario, scenarios, adminDualTrackModal, selectedDualTrackScenario, openDualTrack, adminReplayModal, replayEvents, selectedReplayScenario, openReplay, toggleSimulator };
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
        toast('正式 Crop Pack 由后端版本目录维护，当前页面只提供读取，未修改本地假数据。', 'error');
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
        toast('正式 Crop Pack 暂无删除接口，未修改后端数据。', 'error');
        return;
      }
      if (confirm(`确定删除作物包“${pack.name}”吗？`)) {
        const index = props.state.adminCropPacks.findIndex(item => item.id === pack.id);
        if (index >= 0) props.state.adminCropPacks.splice(index, 1);
      }
    };
    const togglePackStatus = (pack) => {
      if (isLiveSession.value) {
        toast('正式 Crop Pack 状态由后端发布流程维护，当前只读。', 'error');
        return;
      }
      pack.status = pack.status === 'published' ? 'draft' : 'published';
    };
    const transitionCandidate = async (candidate, status) => {
      if (!candidate?.id) return;
      try {
        const saved = await api.transitionStrategyCandidate(candidate.id, status);
        candidate.status = String(saved?.status || status).toLowerCase();
        toast(`策略候选已更新为 ${candidate.status}，后端记录已同步`);
      } catch (error) { toast(error.message || '策略候选更新失败', 'error'); }
    };
    const addStage = () => packForm.value.stages.push('');
    const removeStage = (index) => packForm.value.stages.splice(index, 1);
    const addKnowledgeDoc = () => packForm.value.knowledgeDocs.push({ title: '', content: '' });
    const removeKnowledgeDoc = (index) => packForm.value.knowledgeDocs.splice(index, 1);
    const expandedKnowledge = ref(null);
    const toggleKnowledge = (packId, index) => {
      const key = `${packId}:${index}`;
      expandedKnowledge.value = expandedKnowledge.value === key ? null : key;
    };
    return { activeTab, expandedPacks, togglePack, showPackModal, editingPackId, packForm, cropIcons, expandedKnowledge, openCreatePack, openEditPack, savePack, deletePack, togglePackStatus, addStage, removeStage, addKnowledgeDoc, removeKnowledgeDoc, toggleKnowledge, transitionCandidate };
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
      { module: '智能诊断', farmer: '👁 查看结论', farmAdmin: '✅ 跨地块诊断/审批', sysAdmin: '❌ 不提供入口' },
      { module: '灌溉控制', farmer: '✅ 执行低风险', farmAdmin: '✅ 审批高风险', sysAdmin: '❌ 默认不控制' },
      { module: '设备管理', farmer: '👁 查看/报修', farmAdmin: '✅ 绑定/配置', sysAdmin: '👁 接入异常' },
      { module: '成员管理', farmer: '👁 个人资料', farmAdmin: '✅ 本场农户', sysAdmin: '✅ 全部账号/角色' },
      { module: '作物与规则', farmer: '👁 当前标准', farmAdmin: '✅ 农场参数', sysAdmin: '✅ Crop Pack/版本发布' },
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

    const createUser = () => {
      if (isLiveSession.value) {
        toast('正式账号创建请走注册/授权流程，当前页面不会写入浏览器假数据。', 'error');
        return;
      }
      const roleLabels = { FARMER: '种植农户', FARM_ADMIN: '农场管理员', SYSTEM_ADMIN: '系统管理员' };
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

    return { activeTab, roleFilter, logFilter, showCreateUser, newUser, filteredUsers, filteredLogs, permissionMatrix, createUser, deleteUser, toggleUser };
  }
};

// 2. Setup App
const app = createApp({
  components: {
    'dashboard-view': DashboardView,
    'plot-detail-modal': PlotDetailModal,
    'decision-console-view': RoleAwareDecisionConsoleView,
    'risk-forecast-view': RiskForecastView,
    'work-orders-view': RoleAwareWorkOrdersView,
    'resource-coordination-view': AdminResourceCenterView,
    'farm-members-view': AdminMemberManagementView,
    'crop-manual-view': CropManualView,
    'crop-packs-view': CropPacksView,
    'value-ledger-view': ValueLedgerView,
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
      valueLedger: isDemoSession ? MOCK_DATA.valueLedger : EMPTY_VALUE_LEDGER,
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
    const scheduleSystemRefresh = () => {
      if (systemRefreshTimer) return;
      systemRefreshTimer = window.setTimeout(async () => {
        systemRefreshTimer = null;
        await refreshSystemAdminData({ announceErrors: false });
      }, 450);
    };
    let requestContextChange = async () => {};
    const selectedFarmId = computed({
      get: () => state.value.adminContext.farmId || state.value.farms[0]?.farmId || '',
      set: farmId => {
        if (state.value.currentUser?.role === 'FARM_ADMIN') requestContextChange({ farmId, plotId: null, sessionMode: state.value.sessionMode });
        else state.value.adminContext = { ...state.value.adminContext, farmId };
      }
    });

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

    const changePassword = () => {
      passwordError.value = '';
      if (!passwordForm.value.current) {
        passwordError.value = '请输入当前密码';
        return;
      }
      if (passwordForm.value.next.length < 6) {
        passwordError.value = '新密码至少需要 6 位';
        return;
      }
      if (passwordForm.value.next !== passwordForm.value.confirm) {
        passwordError.value = '两次输入的新密码不一致';
        return;
      }
      if (state.value.sessionMode === 'live') {
        passwordError.value = '正式账号暂未开放在线改密，请退出后在登录页使用恢复码重设密码';
        return;
      }
      closeAccountModal();
      showToast('演示密码修改成功，接入账号服务后将正式生效');
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
        const merged = mergeFarmPlots(Array.isArray(facts) ? facts : [], overview?.plots || []);
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
        systemStatus: api.getSystemStatus(),
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
      const recentEvents = auditRecords.slice(0, 20).map((record) => ({
        id: `audit:${record.traceId}`,
        category: record.type === 'ALERT' ? 'alert' : 'system',
        icon: record.type === 'ALERT' ? 'warning' : 'history',
        title: `${record.plotId !== '—' ? `${record.plotId} · ` : ''}${record.summary}`,
        time: record.time,
        traceId: record.traceId,
        dataOrigin: 'BACKEND'
      }));
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
        seed: run.seed,
        plotId: run.plotId,
        startTime: run.startedAt || run.createdAt || '—',
        endTime: run.completedAt || run.endedAt || null,
        events: Number(run.events || run.mainEvents || run.replayEvents || 0),
        status: liveStatusValue(run.status, 'UNKNOWN'),
        dataOrigin: 'BACKEND'
      }));
      state.value.adminCropPacks = adminCropPacks;
      state.value.adminRules = adminRules;
      state.value.adminStrategyCandidates = adminStrategyCandidates;
      state.value.adminUsers = adminUsers;
      state.value.adminAuditLogs = adminAuditLogs;
      state.value.adminOverview = adminOverviewFromLive({ overview, systemStatus: results.systemStatus?.status === 'fulfilled' ? results.systemStatus.value : {}, simulator: state.value.simulatorStatus, alerts, devices, recentEvents });
      if (failures.length && announceErrors) showToast(`部分正式平台数据读取失败：${failures.join('；')}`, 'error');
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

    const handleDataInvalidated = async ({ domains = [], record } = {}) => {
      if (record?.workOrderId && domains.includes('workOrders')) {
        state.value.workOrders = [record, ...state.value.workOrders.filter((item) => item.workOrderId !== record.workOrderId)];
      }
      if (state.value.currentUser?.role !== 'FARM_ADMIN') return;
      const normalized = [...new Set(domains.flatMap(domain => {
        if (domain === 'resourcePlans') return ['overview'];
        return [domain];
      }))];
      await refreshFarmData(state.value.adminContext.farmId, normalized.length ? normalized : ['all']);
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
        } catch (error) {
          state.value.farms = [];
          state.value.plots = [];
          state.value.allPlots = [];
          showToast(`读取管理员农场上下文失败：${error.message}`, 'error');
        }
      } else if (session.mode === 'live') {
        if (state.value.currentUser?.role === 'SYSTEM_ADMIN') {
          await refreshSystemAdminData();
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
      if (api.isLive && session.mode === 'live') {
        try {
          await api.subscribeEvents((event) => {
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
            const domains = domainsForEventType(event.type);
            if (state.value.currentUser?.role === 'FARM_ADMIN' && domains.length) {
              refreshFarmData(state.value.adminContext.farmId, domains, { announceErrors: false });
            }
            if (state.value.currentUser?.role === 'SYSTEM_ADMIN' && domains.length) {
              scheduleSystemRefresh();
            }
            if (systemEvent.silent) return;
            if (!Array.isArray(state.value.adminOverview.recentEvents)) state.value.adminOverview.recentEvents = [];
            state.value.adminOverview.recentEvents.unshift(systemEvent);
            state.value.adminOverview.recentEvents = state.value.adminOverview.recentEvents.slice(0, 20);
            showToast(systemEvent.title, systemEvent.category === 'alert' ? 'error' : 'success');
          });
        } catch (error) { showToast('系统消息暂不可用：' + error.message, 'error'); }
      }
      await applyHashRoute();
      if (state.value.currentUser?.role === 'FARM_ADMIN' && state.value.adminContext.farmId && !parseHashRoute().params?.farmId) {
        const params = { ...routeParams.value, farmId: state.value.adminContext.farmId };
        routeParams.value = params;
        window.history.replaceState(null, '', routeHash(currentView.value, params));
      }
      if (!state.value.allowedViews.includes(currentView.value)) navigate(currentRole.value.defaultView);
    });

    // Provide toast globally
    app.provide('toast', showToast);

    return {
      selectedFarmId,
      isLive,
      isDark,
      isSidebarOpen,
      showProfileMenu,
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
app.mount('#app');
