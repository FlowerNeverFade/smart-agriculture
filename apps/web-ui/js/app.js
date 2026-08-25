import { api } from './api.js';
import { MOCK_DATA } from './mock-data.js?v=1787645254016';
import { presentRoleUser, roleCan, roleDefinition, roleViews } from './roles.js';

const { createApp, ref, computed, onMounted, nextTick, watch, inject } = Vue;

const NAV_CATALOG = Object.freeze([
  { id: 'dashboard', label: '农智总览', icon: 'dashboard', labels: { FARMER: '我的农场', FARM_ADMIN: '农场总览', SYSTEM_ADMIN: '运行总览' } },
  { id: 'decision-console', label: '智能决策', icon: 'psychology', labels: { FARMER: '智能建议', FARM_ADMIN: '决策审批', SYSTEM_ADMIN: '决策审计' } },
  { id: 'risk-forecast', label: '风险推演', icon: 'timeline', labels: { FARMER: '风险预警' } },
  { id: 'work-orders', label: '农务工单', icon: 'task', labels: { FARMER: '农务记录', FARM_ADMIN: '任务调度', SYSTEM_ADMIN: '工单审计' } },
  { id: 'crop-packs', label: '作物模型', icon: 'library_books', labels: { FARM_ADMIN: '作物模型', SYSTEM_ADMIN: '规则配置' } },
  { id: 'value-ledger', label: '价值对账', icon: 'account_balance_wallet', labels: { FARM_ADMIN: '价值对账', SYSTEM_ADMIN: '价值审计' } },
  { id: 'admin-overview', label: '平台总览', icon: 'monitoring', labels: { SYSTEM_ADMIN: '平台总览' } },
  { id: 'admin-ops', label: '运行监控', icon: 'dns', labels: { SYSTEM_ADMIN: '运行监控' } },
  { id: 'admin-audit', label: '决策审计', icon: 'gavel', labels: { SYSTEM_ADMIN: '决策审计' } },
  { id: 'admin-simulator', label: '仿真验证', icon: 'science', labels: { SYSTEM_ADMIN: '仿真验证' } },
  { id: 'admin-rules', label: '规则与版本', icon: 'rule_folder', labels: { SYSTEM_ADMIN: '规则与版本' } },
  { id: 'admin-settings', label: '系统管理', icon: 'admin_panel_settings', labels: { SYSTEM_ADMIN: '系统管理' } }
]);

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
    const fallback = MOCK_DATA.plots.find((item) => item.plotId === plot.plotId) || {};
    const metrics = { ...(fallback.metrics || {}) };
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
      ...fallback,
      ...plot,
      metrics,
      deviceId: plot.device?.deviceId || fallback.deviceId,
      deviceStatus: plot.device?.status || fallback.deviceStatus || 'UNKNOWN',
      healthScore: plot.device?.healthScore ?? fallback.healthScore ?? 0,
      lastSeen: plot.device?.lastSeen || fallback.lastSeen || '暂无心跳'
    };
  });
}

function presentSystemEvent(event) {
  const payload = event?.data?.payload || event?.data || {};
  const type = event?.data?.eventType || event?.type || 'system';
  const category = /alert|warning/i.test(type) ? 'alert' : /login|auth/i.test(type) ? 'login' : /command|ack|execution/i.test(type) ? 'system' : 'system';
  const icon = category === 'alert' ? 'warning' : category === 'login' ? 'login' : 'notifications';
  const title = payload.title || payload.summary || payload.message || `${type} 事件已到达`;
  return { id: event?.data?.eventId || `event-${Date.now()}-${Math.random()}`, category, icon, title, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), traceId: payload.traceId };
}

// 1. Define Components
const DashboardView = {
  template: '#tmpl-dashboard',
  props: ['state', 'routeParams'],
  setup(props, { emit }) {
    const toast = inject('toast');
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
    return { handleAction, visibleActions };
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
    
    // [INTERCONNECTIVITY] Highlight logic for new order
    const highlightNewOrder = ref(false);
    watch(() => props.routeParams, (newParams) => {
      if (newParams && newParams.highlight === 'new-order') {
        highlightNewOrder.value = true;
        setTimeout(() => { highlightNewOrder.value = false; }, 4000);
      }
    }, { immediate: true });

    const showFormModal = ref(false);
    const form = ref({
      plotId: 'plot-a01',
      soilSurface: '',
      cropCondition: '',
      portableSoilMoisture: '',
      notes: ''
    });

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

    return { showFormModal, form, submitInspection, highlightNewOrder, canRecordInspection };
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



// ---- SYSTEM ADMIN COMPONENTS ----

const AdminOverviewView = {
  template: '#tmpl-admin-overview',
  props: ['state', 'routeParams'],
  setup(props) {
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
      if (plot.status === 'HEALTHY') return 92;
      if (plot.status === 'WARNING') return 64;
      if (plot.status === 'CRITICAL') return 28;
      return 0;
    };
    return { farmFilter, statusFilter, filteredPlots, plotFarms, plotSummary, healthPercent, telemetryMetrics: TELEMETRY_METRICS, selectedPlot, showPlotModal, plotMetricForm, telemetryLoading, openPlotMetrics, refreshPlotMetrics, savePlotMetrics };
  }
};

const TELEMETRY_METRICS = [
  { code: 'SOIL_MOISTURE', label: '土壤湿度' },
  { code: 'AIR_TEMPERATURE', label: '空气温度' },
  { code: 'LIGHT', label: '光照' },
  { code: 'CO2', label: 'CO2' },
  { code: 'PH', label: 'PH' },
  { code: 'WATER_LEVEL', label: '水位' }
];

const AdminOpsView = {
  template: '#tmpl-admin-ops',
  props: ['state', 'routeParams'],
  setup(props) {
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

    return { activeTab, deviceFilter, alertFilter, alertLevel, filteredDevices, filteredAlerts };
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
    const simRunning = ref(props.state.adminOverview?.simulator?.running || false);
    const selectedScenario = ref('NORMAL');
    const adminDualTrackModal = ref(false);
    const adminReplayModal = ref(false);
    const replayEvents = ref([]);
    const selectedReplayScenario = ref('');
    const selectedDualTrackScenario = ref('');

    const openReplay = (run) => {
      selectedReplayScenario.value = run.scenarioId;
      adminReplayModal.value = true;
      replayEvents.value = [
        { time: '00:00', action: '初始化推演环境', agent: 'System' },
        { time: '00:05', action: '注入偏差事件', agent: 'Mock Gateway' },
        { time: '00:15', action: '诊断异常并下发调整规则', agent: 'Diagnose Agent' },
        { time: '00:30', action: '执行处方 ACK 确认', agent: 'Actuator Mock' },
        { time: '01:00', action: '生成推演效果对比报告', agent: 'System' }
      ];
    };

    const openDualTrack = (run) => {
      selectedDualTrackScenario.value = run.scenarioId || 'NORMAL';
      adminDualTrackModal.value = true;
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

    return { simRunning, selectedScenario, scenarios, adminDualTrackModal, selectedDualTrackScenario, openDualTrack, adminReplayModal, replayEvents, selectedReplayScenario, openReplay };
  }
};

const AdminRulesView = {
  template: '#tmpl-admin-rules',
  props: ['state', 'routeParams'],
  setup(props) {
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
      if (confirm(`确定删除作物包“${pack.name}”吗？`)) {
        const index = props.state.adminCropPacks.findIndex(item => item.id === pack.id);
        if (index >= 0) props.state.adminCropPacks.splice(index, 1);
      }
    };
    const togglePackStatus = (pack) => {
      pack.status = pack.status === 'published' ? 'draft' : 'published';
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
    return { activeTab, expandedPacks, togglePack, showPackModal, editingPackId, packForm, cropIcons, expandedKnowledge, openCreatePack, openEditPack, savePack, deletePack, togglePackStatus, addStage, removeStage, addKnowledgeDoc, removeKnowledgeDoc, toggleKnowledge };
  }
};

const AdminSettingsView = {
  template: '#tmpl-admin-settings',
  props: ['state', 'routeParams'],
  setup(props) {
    const toast = inject('toast');
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

    const createUser = () => {
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

    return { activeTab, roleFilter, logFilter, showCreateUser, newUser, filteredUsers, filteredLogs, permissionMatrix, createUser, deleteUser };
  }
};

// 2. Setup App
const app = createApp({
  components: {
    'dashboard-view': DashboardView,
    'decision-console-view': DecisionConsoleView,
    'risk-forecast-view': RiskForecastView,
    'work-orders-view': WorkOrdersView,
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
    const selectedFarm = ref('farm-science');
    const isLive = ref(false);
    const isDark = ref(false);
    const isSidebarOpen = ref(true);
    
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
      farms: MOCK_DATA.farms,
      plots: scopePlots(MOCK_DATA.plots, initialUser),
      feedItems: MOCK_DATA.feedItems,
      workOrders: MOCK_DATA.workOrders,
      inspections: MOCK_DATA.inspections,
      resourceProfile: MOCK_DATA.resourceProfile,
      cropPackDetails: MOCK_DATA.cropPackDetails,
      riskForecastConfig: MOCK_DATA.riskForecastConfig,
      valueLedger: MOCK_DATA.valueLedger,
      adminOverview: MOCK_DATA.adminOverview || {},
      adminGlobalPlots: MOCK_DATA.adminGlobalPlots || [],
      adminDevices: MOCK_DATA.adminDevices || [],
      adminAlerts: MOCK_DATA.adminAlerts || [],
      adminAuditRecords: MOCK_DATA.adminAuditRecords || [],
      adminSimHistory: MOCK_DATA.adminSimHistory || [],
      adminCropPacks: MOCK_DATA.adminCropPacks || [],
      adminRules: MOCK_DATA.adminRules || [],
      adminStrategyCandidates: MOCK_DATA.adminStrategyCandidates || [],
      adminUsers: MOCK_DATA.adminUsers || [],
      adminAuditLogs: MOCK_DATA.adminAuditLogs || []
    });

    const currentRole = computed(() => roleDefinition(state.value.currentUser?.role));
    const navItems = computed(() => {
      const allowed = new Set(state.value.allowedViews);
      return NAV_CATALOG
        .filter((item) => allowed.has(item.id))
        .map((item) => ({ ...item, label: item.labels?.[currentRole.value.code] || item.label }));
    });
    const initialView = window.location.hash ? window.location.hash.substring(1) : currentRole.value.defaultView;
    const currentView = ref(state.value.allowedViews.includes(initialView) ? initialView : currentRole.value.defaultView);
    const routeParams = ref({}); // [INTERCONNECTIVITY] Global route state

    const currentViewComponent = computed(() => `${currentView.value}-view`);

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

    const navigate = (viewId, params = {}) => {
      if (!state.value.allowedViews.includes(viewId)) {
        showToast(`“${NAV_CATALOG.find((item) => item.id === viewId)?.label || viewId}”不在${currentRole.value.label}的权限范围内`, 'error');
        return;
      }
      currentView.value = viewId;
      routeParams.value = params;
      window.location.hash = viewId;
    };

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.substring(1);
      if (hash && state.value.allowedViews.includes(hash)) {
        currentView.value = hash;
      } else if (hash) {
        window.location.hash = state.value.allowedViews[0] || 'dashboard';
      }
    });

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
      }
      state.value.plots = scopePlots(MOCK_DATA.plots, state.value.currentUser);
      if (isLive.value && session.mode === 'live') {
        try {
          const overview = await api.getOverview();
          if (Array.isArray(overview?.plots)) state.value.plots = scopePlots(mergeOverviewPlots(overview.plots), state.value.currentUser);
        } catch (error) {
          showToast('读取角色范围内的地块失败：' + error.message, 'error');
        }
        try {
          await api.subscribeEvents((event) => {
            if (event.type === 'connected' || event.type === 'heartbeat') return;
            const systemEvent = presentSystemEvent(event);
            state.value.adminOverview.recentEvents.unshift(systemEvent);
            state.value.adminOverview.recentEvents = state.value.adminOverview.recentEvents.slice(0, 20);
            showToast(systemEvent.title, systemEvent.category === 'alert' ? 'error' : 'success');
          });
        } catch (error) {
          showToast('系统消息暂不可用：' + error.message, 'error');
        }
      }
      if (!state.value.allowedViews.includes(currentView.value)) navigate(currentRole.value.defaultView);
    });

    // Provide toast globally
    app.provide('toast', showToast);

    return {
      selectedFarm,
      isLive,
      isDark,
      isSidebarOpen,
      currentRole,
      navItems,
      currentView,
      currentViewComponent,
      routeParams,
      state,
      toasts,
      showToast,
      toggleTheme,
      toggleSidebar,
      logout,
      navigate
    };
  }
});

app.mount('#app');
