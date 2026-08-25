import { api } from './api.js';
import { MOCK_DATA } from './mock-data.js';
import { presentRoleUser, roleCan, roleDefinition, roleViews } from './roles.js';
import { AdminDecisionView } from './modules/admin-decision.js';
import { AdminResourcePlanningView } from './modules/admin-resource-planning.js';

const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick, watch, inject } = Vue;

const ICON_CLASS = Object.freeze({
  dashboard: 'ph-squares-four',
  warning_amber: 'ph-warning',
  warning: 'ph-warning',
  timeline: 'ph-chart-line-up',
  task_alt: 'ph-clipboard-text',
  water_drop: 'ph-drop',
  group: 'ph-users',
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
  task: 'ph-check-square',
  record_voice_over: 'ph-user-focus',
  group_off: 'ph-user-minus',
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
  { id: 'crop-packs', label: '作物模型', icon: 'library_books', labels: { FARM_ADMIN: '作物模型', SYSTEM_ADMIN: '规则配置' } },
  { id: 'value-ledger', label: '价值对账', icon: 'account_balance_wallet', labels: { FARM_ADMIN: '价值对账', SYSTEM_ADMIN: '价值审计' } }
]);

const PLOT_METRIC_ORDER = Object.freeze(['SOIL_MOISTURE', 'AIR_TEMPERATURE', 'LIGHT', 'CO2', 'SOIL_EC', 'NPK_RATIO']);
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

function formatHealthScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return String(Math.round(numeric <= 1 ? numeric * 100 : numeric));
}

function parseHashRoute(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return { view: '', params: {} };
  if (!raw.includes('=') && !raw.includes('&')) return { view: raw, params: {} };
  const query = new URLSearchParams(raw);
  const params = Object.fromEntries(query.entries());
  return { view: params.view || '', params };
}

function plotDetailHash(plotId) {
  const query = new URLSearchParams({ view: 'plot-detail', plotId: String(plotId || '') });
  return `#${query.toString()}`;
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

// 1. Define Components
const DashboardView = {
  template: '#tmpl-dashboard',
  props: ['state', 'routeParams'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const isFarmAdmin = computed(() => props.state.currentUser?.role === 'FARM_ADMIN');
    const selectedFarmId = ref(props.state.farms[0]?.farmId || '');
    const plotMenuId = ref('');
    const plotSaving = ref(false);
    const plotEditor = ref({ open: false, mode: 'create' });
    const deleteConfirm = ref({ open: false, plot: null });
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
      const workItems = Array.isArray(props.state.workOrders) ? props.state.workOrders : [];
      const activeItems = workItems.filter((item) => !isFinishedWork(item));
      const now = Date.now();
      return [
        { id: 'today', label: '今日任务', value: workItems.length },
        {
          id: 'overdue',
          label: '已逾期',
          value: activeItems.filter((item) => {
            const dueAt = new Date(item.dueAt || 0).getTime();
            return Number.isFinite(dueAt) && dueAt > 0 && dueAt < now;
          }).length
        },
        { id: 'abnormal', label: '异常地块', value: props.state.plots.filter(isAbnormalPlot).length },
        { id: 'unassigned', label: '待分配', value: activeItems.filter((item) => !item.assigneeId).length },
        { id: 'approval', label: '待审批', value: activeItems.filter((item) => normalizedStatus(item.actionType) === 'IRRIGATION_REVIEW').length }
      ];
    });

    const plotMetrics = (plot) => PLOT_METRIC_ORDER.map((code) => ({
      code,
      label: plot?.metrics?.[code]?.label || code,
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
      const current = props.state.plots.find((plot) => plot.plotId === draft.plotId);
      const cropChanged = Boolean(current && current.cropCode !== crop.code);
      const payload = {
        ...(current || {}),
        farmId: selectedFarmId.value || current?.farmId || props.state.farms[0]?.farmId || 'farm-demo',
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
          toast(`${payload.name}已更新，其他模块已同步`);
        } else {
          const saved = await api.createPlot(payload);
          emit('plot-change', { type: 'create', plot: { ...payload, ...saved, metrics: payload.metrics } });
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
      deleteConfirm.value = { open: true, plot };
    };
    const cancelDeletePlot = () => {
      if (plotSaving.value) return;
      deleteConfirm.value = { open: false, plot: null };
    };
    const confirmDeletePlot = async () => {
      const plot = deleteConfirm.value.plot;
      if (!plot) return;
      plotSaving.value = true;
      try {
        await api.deletePlot(plot.plotId);
        emit('plot-change', { type: 'delete', plot });
        deleteConfirm.value = { open: false, plot: null };
        toast(`${plot.name}已删除，关联页面已同步`);
      } catch (error) {
        toast(error.message || '删除地块失败', 'error');
      } finally {
        plotSaving.value = false;
      }
    };
    onMounted(() => document.addEventListener('click', closePlotMenu));
    onBeforeUnmount(() => document.removeEventListener('click', closePlotMenu));
    const createTask = () => emit('navigate', 'work-orders', { openCreateTask: true });
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
      selectedFarmId,
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
      cancelDeletePlot,
      confirmDeletePlot,
      createTask,
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
      label: props.plot?.metrics?.[code]?.label || code,
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
      { role: 'agent', content: '您好，我是 AgriLoop 农业决策智能体。我已经接入了当前地块的传感器实时数据和生长阶段的阈值模型。<br><br>关于番茄当前阶段的灌溉处方，或者刚才生成的诊断结论，您有任何疑问都可以随时问我。' }
    ]);
    const isTyping = ref(false);
    const chatBox = ref(null);

    const sendMessage = () => {
      if (!chatInput.value.trim()) return;
      
      const userMessage = chatInput.value.trim();
      chatHistory.value.push({ role: 'user', content: userMessage });
      chatInput.value = '';
      
      isTyping.value = true;
      scrollToBottom();
      
      setTimeout(() => {
        isTyping.value = false;
        let reply = '基于当前环境遥测与生长模型，系统判断您的要求在安全阈值内，已为您记录参考。';
        if (userMessage.includes('为什么') || userMessage.includes('原因')) {
          reply = '我注意到当前的土壤湿度连续低于 20%（番茄结果期基线）。同时，空气温度 26.4°C 加速了蒸散，且传感器数据质量评分为 GOOD（排除了硬件漂移）。因此诊断为真实水分胁迫。';
        } else if (userMessage.includes('处方') || userMessage.includes('水')) {
          reply = '针对此情况，处方引擎计算出需要 153 升水。根据您农场主管道的 18L/min 恒定流速，换算出的执行时长为 8 分 30 秒。该时长低于 900 秒的安全阈值上限。';
        }
        
        chatHistory.value.push({ role: 'agent', content: reply });
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

    const confirmExecution = () => {
      if (!canApproveIrrigation.value) {
        showDualTrackModal.value = false;
        toast('当前身份没有灌溉执行权限', 'error');
        return;
      }
      showDualTrackModal.value = false;
      toast('下行控制指令已下发执行');
      
      // [INTERCONNECTIVITY] Mutate work orders state and navigate to it
      props.state.workOrders.unshift({
        workOrderId: 'wo-' + Date.now(),
        plotId: 'plot-a01',
        title: '执行 153L 灌溉处方',
        reason: 'Agent 推演下发',
        status: 'PENDING',
        priority: 'HIGH'
      });
      
      emit('navigate', 'work-orders', { highlight: 'new-order' });
    };

    return { 
      diagnosis, prescription, highlightDiagnosis,
      chatInput, chatHistory, isTyping, chatBox, sendMessage, 
      showPassportModal, showDualTrackModal, canApproveIrrigation, openExecution, confirmExecution
    };
  }
};

const RiskForecastView = {
  template: '#tmpl-risk-forecast',
  props: ['state', 'routeParams'],
  setup(props) {
    let chart = null;
    const currentScenario = ref('DROUGHT');
    const selectedPlotId = ref(props.state.plots[0].plotId);
    const highlightChart = ref(false);

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
      return props.state.riskForecastConfig.baselineMoisture; // Fallback
    });

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
      
      const scenario = props.state.riskForecastConfig.scenarioCatalog.find(s => s.code === currentScenario.value);
      const decay = scenario ? scenario.decayFactor : 1.0;
      
      const times = ["0h (Now)", "1h", "2h", "3h", "4h"];
      const baseMoisture = currentPlotBaseMoisture.value;
      const mockCurve = times.map((t, i) => {
        if (scenario && scenario.code === 'STORM') {
            return i === 0 ? baseMoisture : (i === 1 ? baseMoisture + 6 : baseMoisture + 4 - i);
        }
        return Math.max(8.0, baseMoisture - (i * 2.8 * decay));
      });
      
      chart.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: times, axisLabel: { color: textColor } },
        yAxis: { 
          type: 'value', 
          name: '推演含水率 (%)', 
          min: 5, max: Math.max(35, baseMoisture + 10),
          axisLabel: { color: textColor },
          nameTextStyle: { color: textColor }
        },
        series: [{
          data: mockCurve,
          type: 'line',
          smooth: true,
          itemStyle: { color: scenario ? scenario.color : '#1a73e8' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: scenario ? scenario.color : '#1a73e8' },
              { offset: 1, color: 'rgba(0,0,0,0.0)' }
            ]),
            opacity: 0.2
          },
          markLine: {
            data: [{ yAxis: props.state.riskForecastConfig.stressBoundary, name: '胁迫极限 14%' }],
            lineStyle: { color: '#d93025', type: 'dashed' },
            label: { position: 'insideStartTop', color: textColor, formatter: '{b}' }
          }
        }]
      });
    };

    const changeScenario = (scenario) => {
      currentScenario.value = scenario.code;
      renderChart();
    };

    const changePlot = () => {
      renderChart();
    };

    onMounted(() => {
        currentScenario.value = props.state.riskForecastConfig.scenarioCatalog[0].code;
        renderChart();
    });
    
    const observer = new MutationObserver(() => renderChart());
    onMounted(() => observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }));
    
    return { currentScenario, selectedPlotId, currentPlotBaseMoisture, highlightChart, changeScenario, changePlot };
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

    const submitInspection = () => {
      if (!canRecordInspection.value) {
        toast('当前身份只能查看工单，不能提交巡田记录', 'error');
        return;
      }
      if (!form.value.soilSurface || !form.value.portableSoilMoisture) {
        toast('请填写必填项', 'error');
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
      toast('巡田记录已成功录入，并已同步至主反馈流');
      
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
  setup(props) {
    const isDemo = computed(() => props.state.sessionMode === 'demo');
    const members = computed(() => isDemo.value ? props.state.farmMembers : []);
    const plotNames = (member) => {
      const names = (member?.plotIds || [])
        .map((plotId) => props.state.plots.find((plot) => plot.plotId === plotId)?.name)
        .filter(Boolean);
      return names.length ? names.join('、') : '—';
    };
    const taskCount = (member) => props.state.workOrders.filter((item) => item.assigneeId === member.userId && !isFinishedWork(item)).length;
    const memberStatus = (member) => normalizedStatus(member?.status) === 'ACTIVE' ? '可分配任务' : '暂不在线';
    return { isDemo, members, plotNames, taskCount, memberStatus };
  }
};

const CropPacksView = {
  template: '#tmpl-crop-packs',
  props: ['state', 'routeParams']
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

// 2. Setup App
const app = createApp({
  components: {
    'dashboard-view': DashboardView,
    'plot-detail-modal': PlotDetailModal,
    'decision-console-view': AdminDecisionView,
    'risk-forecast-view': RiskForecastView,
    'work-orders-view': WorkOrdersView,
    'resource-coordination-view': AdminResourcePlanningView,
    'farm-members-view': FarmMembersView,
    'crop-packs-view': CropPacksView,
    'value-ledger-view': ValueLedgerView
  },
  setup() {
    const isLive = ref(false);
    const isDark = ref(false);
    const isSidebarOpen = ref(!window.matchMedia('(max-width: 760px)').matches);
    
    const toasts = ref([]);
    
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

    // Reactive State representing all the data originally rendered manually
    const state = ref({
      currentUser: initialUser,
      allowedViews: roleViews(initialUser),
      sessionMode: session?.mode || 'demo',
      farms: MOCK_DATA.farms,
      plots: session?.mode === 'demo' ? scopePlots(MOCK_DATA.plots, initialUser) : [],
      feedItems: MOCK_DATA.feedItems,
      workOrders: session?.mode === 'demo' ? MOCK_DATA.workOrders : [],
      farmMembers: session?.mode === 'demo' ? (MOCK_DATA.farmMembers || []) : [],
      inspections: MOCK_DATA.inspections,
      resourceProfile: MOCK_DATA.resourceProfile,
      cropPackDetails: MOCK_DATA.cropPackDetails,
      riskForecastConfig: MOCK_DATA.riskForecastConfig,
      valueLedger: MOCK_DATA.valueLedger
    });

    const currentRole = computed(() => roleDefinition(state.value.currentUser?.role));
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
    const selectedPlot = computed(() => state.value.plots.find((plot) => plot.plotId === selectedPlotId.value) || null);
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

    const logout = () => {
      api.clearSession();
      window.location.replace('login.html');
    };

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
      if (route.view === 'plot-detail') {
        const plot = state.value.plots.find((item) => item.plotId === route.params.plotId);
        if (!plot || !roleCan(state.value.currentUser, 'plots:read')) {
          selectedPlotId.value = '';
          window.history.replaceState(null, '', '#dashboard');
          currentView.value = 'dashboard';
          routeParams.value = {};
          showToast('没有找到该地块，已返回农场总览', 'error');
          return;
        }
        if (!plotDetailReturnHash) plotDetailReturnHash = '#dashboard';
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
      window.history.replaceState(null, '', `#${fallback}`);
      currentView.value = fallback;
      routeParams.value = {};
    };

    const navigate = (viewId, params = {}) => {
      if (!state.value.allowedViews.includes(viewId)) {
        showToast(`“${NAV_CATALOG.find((item) => item.id === viewId)?.label || viewId}”不在${currentRole.value?.label || '当前身份'}的权限范围内`, 'error');
        return;
      }
      selectedPlotId.value = '';
      currentView.value = viewId;
      routeParams.value = params;
      const routeEntries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
      const targetHash = routeEntries.length
        ? `#${new URLSearchParams({ view: viewId, ...Object.fromEntries(routeEntries) }).toString()}`
        : `#${viewId}`;
      if (window.location.hash === targetHash) return;
      window.location.hash = targetHash.slice(1);
    };

    const applyPlotChange = ({ type, plot } = {}) => {
      if (!plot?.plotId) return;
      const index = state.value.plots.findIndex((item) => item.plotId === plot.plotId);
      if (type === 'delete') {
        state.value.plots = state.value.plots.filter((item) => item.plotId !== plot.plotId);
        state.value.workOrders = state.value.workOrders.filter((item) => item.plotId !== plot.plotId);
        state.value.farmMembers = state.value.farmMembers.map((member) => ({
          ...member,
          plotIds: Array.isArray(member.plotIds) ? member.plotIds.filter((plotId) => plotId !== plot.plotId) : []
        }));
        if (selectedPlotId.value === plot.plotId) selectedPlotId.value = '';
        return;
      }
      if (index >= 0) {
        state.value.plots.splice(index, 1, { ...state.value.plots[index], ...plot });
      } else {
        state.value.plots.push(plot);
      }
    };

    const handleDataInvalidated = async ({ domains = [], record } = {}) => {
      if (record?.workOrderId && domains.includes('workOrders')) {
        state.value.workOrders = [record, ...state.value.workOrders.filter((item) => item.workOrderId !== record.workOrderId)];
      }
      if (!(isLive.value && state.value.sessionMode === 'live')) return;
      const jobs = [];
      if (domains.includes('plots')) {
        jobs.push(api.getOverview().then((overview) => {
          if (Array.isArray(overview?.plots)) state.value.plots = scopePlots(mergeOverviewPlots(overview.plots), state.value.currentUser);
        }));
      }
      if (domains.includes('workOrders')) {
        jobs.push(api.getWorkOrders().then((items) => { if (Array.isArray(items)) state.value.workOrders = items; }));
      }
      const results = await Promise.allSettled(jobs);
      if (results.some((item) => item.status === 'rejected')) showToast('业务已提交，但关联页面刷新失败，请稍后手动刷新', 'error');
    };

    const openPlotDetail = async ({ plotId, trigger } = {}) => {
      const plot = state.value.plots.find((item) => item.plotId === plotId);
      if (!plot) {
        showToast('没有找到该地块', 'error');
        return;
      }
      const activeRoute = parseHashRoute();
      if (activeRoute.view !== 'plot-detail') plotDetailReturnHash = window.location.hash || `#${currentView.value}`;
      lastPlotTrigger = trigger || document.activeElement;
      const targetHash = plotDetailHash(plotId);
      if (window.location.hash === targetHash) {
        selectedPlotId.value = plotId;
        await focusPlotDialog();
        return;
      }
      window.location.hash = targetHash.slice(1);
    };

    const closePlotDetail = async () => {
      selectedPlotId.value = '';
      const targetHash = plotDetailReturnHash && plotDetailReturnHash !== '#view=plot-detail' ? plotDetailReturnHash : '#dashboard';
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
      if (isLive.value && session.mode === 'live') {
        const [overviewResult, workItemsResult] = await Promise.allSettled([
          api.getOverview(),
          api.getTodayWorkItems()
        ]);
        if (overviewResult.status === 'fulfilled' && Array.isArray(overviewResult.value?.plots)) {
          state.value.plots = scopePlots(mergeOverviewPlots(overviewResult.value.plots), state.value.currentUser);
        } else if (overviewResult.status === 'rejected') {
          showToast('读取角色范围内的地块失败：' + overviewResult.reason.message, 'error');
        }
        if (workItemsResult.status === 'fulfilled' && Array.isArray(workItemsResult.value)) {
          state.value.workOrders = workItemsResult.value;
        } else if (workItemsResult.status === 'rejected') {
          showToast('读取今日农务失败：' + workItemsResult.reason.message, 'error');
        }
      } else if (session.mode === 'demo') {
        state.value.plots = scopePlots(MOCK_DATA.plots, state.value.currentUser);
        state.value.workOrders = (MOCK_DATA.workOrders || []).map((item) => ({ ...item }));
        state.value.farmMembers = (MOCK_DATA.farmMembers || []).map((member) => ({ ...member }));
      } else {
        state.value.plots = [];
        state.value.workOrders = [];
        state.value.farmMembers = [];
        showToast('当前未连接后端服务，正式数据暂不可用', 'error');
      }
      await applyHashRoute();
      if (!state.value.allowedViews.includes(currentView.value)) navigate(currentRole.value.defaultView);
    });

    // Provide toast globally
    app.provide('toast', showToast);

    return {
      isLive,
      isDark,
      isSidebarOpen,
      roleClass,
      currentRole,
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
      logout,
      navigate,
      applyPlotChange,
      handleDataInvalidated,
      openPlotDetail,
      closePlotDetail,
      navigateFromPlotDetail
    };
  }
});

app.component('app-icon', AppIcon);
app.mount('#app');
