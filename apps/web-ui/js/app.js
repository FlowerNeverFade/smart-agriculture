/**
 * AgriLoop Frontend - Main Application Controller
 * High-density operational dashboard with modular router & interactive closed-loop
 */
import { MOCK_DATA } from './mock-data.js';
import { api } from './api.js';
import { FarmMonitor } from './farm-monitor.js';
import { CropSandbox } from './crop-sandbox.js';

const RECLAIMED_PLOTS_STORAGE_KEY = 'agriloop.reclaimedPlots.v1';
const PLOT_STATE_STORAGE_KEY = 'agriloop.plotState.v2';

const ROLE_CONFIG = {
  FARM_ADMIN: {
    label: '农场负责人', homeTitle: '农场总览',
    nav: [
      ['home', 'ph-house', '总览'], ['plot-detail', 'ph-map-trifold', '农田'],
      ['decision-console', 'ph-sparkle', '决策'], ['work-orders', 'ph-clipboard-text', '农务'],
      ['risk-forecast', 'ph-warning', '预测'], ['resource-coordination', 'ph-drop', '调水'],
      ['value-ledger', 'ph-chart-pie-slice', '经营'], ['decision-passport', 'ph-shield-check', '追溯'],
      ['scenario-replay', 'ph-lightning', '模拟']
    ],
    foot: [['crop-packs', 'ph-books', '作物规则'], ['help', 'ph-question', '帮助']]
  },
  FARMER: {
    label: '种植农艺人员', homeTitle: '我的作物',
    nav: [
      ['home', 'ph-house', '作物'], ['plot-detail', 'ph-map-trifold', '农田'],
      ['decision-console', 'ph-magnifying-glass', '诊断'], ['work-orders', 'ph-clipboard-text', '农务'],
      ['risk-forecast', 'ph-warning', '预测'], ['scenario-replay', 'ph-lightning', '模拟'],
      ['crop-packs', 'ph-plant', '作物规则']
    ],
    foot: [['decision-passport', 'ph-shield-check', '处理记录'], ['help', 'ph-question', '帮助']]
  },
  FIELD_OPERATOR: {
    label: '田间操作员', homeTitle: '我的今日任务',
    nav: [
      ['home', 'ph-check-square', '任务'], ['plot-detail', 'ph-map-trifold', '地图'],
      ['work-orders', 'ph-clipboard-text', '农务'], ['inspection-records', 'ph-camera', '巡田'],
      ['completed-work', 'ph-check-circle', '已完成'], ['messages', 'ph-bell', '消息']
    ],
    foot: [['help', 'ph-question', '帮助']]
  },
  SYSTEM_ADMIN: {
    label: '系统管理员', homeTitle: '系统运行中心',
    nav: [
      ['home', 'ph-gauge', '系统'], ['device-management', 'ph-broadcast', '设备'],
      ['user-permissions', 'ph-users', '用户'], ['farm-config', 'ph-buildings', '农场'],
      ['data-status', 'ph-waveform', '数据'], ['agent-status', 'ph-brain', '智能服务'],
      ['operation-logs', 'ph-list-magnifying-glass', '日志'], ['scenario-replay', 'ph-test-tube', '模拟器']
    ],
    foot: [['crop-packs', 'ph-books', '作物规则'], ['help', 'ph-question', '帮助']]
  }
};

const EXTRA_VIEW_META = {
  'plot-detail': { title: '农田监测大地图', desc: '在同一张地图上查看每块地种了什么、长势怎样、有没有预警。', status: '农田数据已同步' },
  'decision-console': { title: '作物诊断与处理建议', desc: '说明作物出了什么问题、为什么这样判断，以及今天应该怎么处理。', status: '建议已更新' },
  'work-orders': { title: '今日农务', desc: '安排补水、巡田和设备检查，并记录谁来做、何时做完。', status: '任务中心可用' },
  'risk-forecast': { title: '未来风险', desc: '看看继续不处理会发生什么，以及及时处理后能不能恢复。', status: '风险推演可用' },
  'resource-coordination': { title: '水源安排', desc: '在水量有限时安排各地块的补水先后，避免抢水和空转。', status: '水源排程可用' },
  'value-ledger': { title: '经营情况', desc: '查看用了多少水、节省多少工时，以及处理风险挽回了多少损失。', status: '经营数据可用' },
  'decision-passport': { title: '处理记录', desc: '按时间查看问题发现、建议确认、执行和效果，方便追溯。', status: '记录完整' },
  'scenario-replay': { title: '风险情景模拟', desc: '模拟缺水、高温、积水和设备故障，比较处理与不处理的结果。', status: '模拟器可用' },
  'crop-packs': { title: '作物种植规则', desc: '维护不同作物和生长阶段适合的湿度、温度及日常管理要求。', status: '作物规则可用' },
  'inspection-records': { title: '巡田记录', desc: '拍照记录作物、设备和现场情况，系统会自动带上地块与时间。', status: '现场记录可用' },
  'completed-work': { title: '已完成任务', desc: '查看今天已经完成的农务，以及补水、巡田和维修结果。', status: '任务记录可用' },
  messages: { title: '工作消息', desc: '只显示与你负责地块和任务有关的消息。', status: '消息中心可用' },
  'device-management': { title: '设备管理', desc: '查看设备在线情况、故障位置、心跳时间，并安排检查。', status: '设备中心可用' },
  'user-permissions': { title: '用户与权限', desc: '给人员分配身份、农场和可操作地块。', status: '权限管理可用' },
  'farm-config': { title: '农场配置', desc: '维护农场、地块、作物和设备归属。', status: '配置中心可用' },
  'data-status': { title: '数据状态', desc: '查看数据是否及时、连续、可信，并处理异常数据。', status: '数据检查可用' },
  'agent-status': { title: '智能分析服务', desc: '查看模型服务、知识库和自动分析任务是否正常。', status: '智能服务可用' },
  'operation-logs': { title: '操作日志', desc: '追踪登录、配置修改、指令下发和系统异常。', status: '日志审计可用' },
  help: { title: '使用帮助', desc: '按照当前身份查看常用操作和问题说明。', status: '帮助中心可用' }
};

class AgriApp {
  constructor() {
    this.state = {
      currentPlotId: 'plot-a01',
      activeFilter: 'ALL',
      selectedFarmId: 'farm-demo',
      plots: [...MOCK_DATA.plots],
      feedItems: [...MOCK_DATA.feedItems],
      activeSubview: null,
      isLive: false,
      user: null
    };

    this.dom = {};
    this.farmMonitor = null;
    this.cropSandbox = null;
    this.workspaceStarted = false;
  }

  async init() {
    this.cacheDom();
    this.bindEvents();

    // Demo parameters intentionally pin the local simulation state and avoid a
    // misleading health request when the static frontend is used for acceptance.
    const demoParams = new URLSearchParams(window.location.search);
    const isPinnedDemo = demoParams.has('demoTime') || demoParams.has('demoWeather');
    const isStaticPreview = ['4173', '5173'].includes(window.location.port);
    this.state.isLive = isPinnedDemo || isStaticPreview ? false : await api.checkHealth();
    const projectUser = this.readProjectUser();
    if (!projectUser) {
      this.showLogin();
      return;
    }
    const session = await api.restoreSession();
    const user = {
      ...(session || {}),
      ...projectUser,
      displayName: session?.displayName || projectUser.displayName || projectUser.roleLabel || projectUser.username,
      farmIds: session?.farmIds || projectUser.farmIds || ['farm-demo'],
      plotIds: session?.plotIds || projectUser.plotIds || ['*']
    };
    await this.enterWorkspace(user);
  }

  async enterWorkspace(user) {
    this.state.user = user;
    this.applyRole(user);
    this.dom.dashboardShell.hidden = false;
    this.updateSystemStatusPill();

    if (this.workspaceStarted) {
      this.renderRoleHome();
      return;
    }
    this.workspaceStarted = true;
    await this.loadOverview();

    this.cropSandbox = new CropSandbox({
      onExit: () => this.navigate('plot-detail', { plotId: this.state.currentPlotId }),
      onPrescribe: (plotId, scenario) => {
        this.openSubview('decision-console', { plotId });
        const scenarioLabel = { drought: '缺水', heatwave: '高温', flood: '积水', drift: '数据异常', stuck: '水阀故障' }[scenario] || '当前';
        this.showToast(`已根据【${scenarioLabel}】情况生成处理方案`);
      }
    });

    this.farmMonitor = new FarmMonitor({
      plots: this.state.plots,
      onExit: () => this.navigate('home'),
      onSandbox: (plotId) => {
        this.state.currentPlotId = plotId;
        this.openSubview('scenario-replay', { plotId });
      },
      onPlotReclaimed: (newPlot) => this.registerReclaimedPlot(newPlot),
      onPlotUpdated: (plot) => this.updateRegisteredPlot(plot)
    });

    this.renderPlots();
    this.renderDashboard();
    this.renderChangelog();
    this.renderRoleHome();
    this.handleRoute();

    window.addEventListener('hashchange', () => this.handleRoute());
  }

  showLogin() {
    this.dom.dashboardShell.hidden = true;
    const next = new URL('login.html', window.location.href);
    window.location.replace(next.href);
  }

  readProjectUser() {
    try {
      const user = JSON.parse(window.localStorage.getItem('agriloop_user') || 'null');
      return user?.username && ROLE_CONFIG[user?.role] ? user : null;
    } catch (error) {
      window.localStorage.removeItem('agriloop_user');
      return null;
    }
  }

  cacheDom() {
    this.dom.headerCurrentView = document.getElementById('headerCurrentView');
    this.dom.systemStatusPill = document.getElementById('systemStatusPill');
    this.dom.systemStatusText = document.getElementById('systemStatusText');
    this.dom.rightAiModeTag = document.getElementById('rightAiModeTag');
    this.dom.userDisplayName = document.getElementById('userDisplayName');
    this.dom.plotListContainer = document.getElementById('plotListContainer');
    this.dom.plotsCountTag = document.getElementById('plotsCountTag');
    this.dom.plotSearchInput = document.getElementById('plotSearchInput');
    this.dom.globalSearchInput = document.getElementById('globalSearchInput');
    this.dom.currentPlotContextBadge = document.getElementById('currentPlotContextBadge');
    this.dom.copilotInput = document.getElementById('copilotInput');
    this.dom.btnSendCopilot = document.getElementById('btnSendCopilot');
    this.dom.copilotOutputBanner = document.getElementById('copilotOutputBanner');
    this.dom.copilotOutputTitle = document.getElementById('copilotOutputTitle');
    this.dom.copilotOutputText = document.getElementById('copilotOutputText');
    this.dom.copilotTraceId = document.getElementById('copilotTraceId');
    this.dom.feedTabButtons = document.getElementById('feedTabButtons');
    this.dom.feedStreamContainer = document.getElementById('feedStreamContainer');
    this.dom.feedCountTag = document.getElementById('feedCountTag');
    this.dom.changelogContainer = document.getElementById('changelogContainer');
    this.dom.moduleNavList = document.getElementById('moduleNavList');
    this.dom.subviewModal = document.getElementById('subviewModal');
    this.dom.btnCloseModal = document.getElementById('btnCloseModal');
    this.dom.btnBackToHome = document.getElementById('btnBackToHome');
    this.dom.modalIcon = document.getElementById('modalIcon');
    this.dom.modalTitle = document.getElementById('modalTitle');
    this.dom.modalTag = document.getElementById('modalTag');
    this.dom.placeholderIcon = document.getElementById('placeholderIcon');
    this.dom.placeholderTitle = document.getElementById('placeholderTitle');
    this.dom.placeholderDesc = document.getElementById('placeholderDesc');
    this.dom.modalDynamicContent = document.getElementById('modalDynamicContent');
    this.dom.modalCodeContract = document.getElementById('modalCodeContract');
    this.dom.toastContainer = document.getElementById('toastContainer');
    this.dom.btnLogoHome = document.getElementById('btnLogoHome');
    this.dom.btnViewResourceDetail = document.getElementById('btnViewResourceDetail');
    this.dom.btnQuickAction = document.getElementById('btnQuickAction');
    this.dom.dashboardShell = document.getElementById('dashboardShell');
    this.dom.plotSwitcherRow = document.querySelector('.plot-switcher-row');
    this.dom.systemRail = document.querySelector('.system-rail');
    this.dom.farmWorkspace = document.getElementById('farmWorkspace');
    this.dom.operatorWorkspace = document.getElementById('operatorWorkspace');
    this.dom.systemWorkspace = document.getElementById('systemWorkspace');
    this.dom.managerOverview = document.getElementById('managerOverview');
    this.dom.operatorTaskList = document.getElementById('operatorTaskList');
    this.dom.systemSummaryGrid = document.getElementById('systemSummaryGrid');
    this.dom.btnUserMenu = document.getElementById('btnUserMenu');
    this.dom.userMenu = document.getElementById('userMenu');
    this.dom.btnLogout = document.getElementById('btnLogout');
    this.dom.userRoleLabel = document.getElementById('userRoleLabel');
    this.dom.menuUserName = document.getElementById('menuUserName');
    this.dom.menuUserRole = document.getElementById('menuUserRole');
    this.dom.sidebarFoot = document.querySelector('.sidebar-foot');
    [
      'dashboardCropImage', 'dashboardPlotTitle', 'dashboardStageTag', 'dashboardPlotLocation',
      'dashboardCropVariety', 'dashboardPlotArea', 'dashboardHealthLabel', 'dashboardHealthScore',
      'dashboardHealthBar', 'dashboardHealthTip', 'dashboardRiskCard', 'dashboardRiskTitle',
      'dashboardRiskText', 'soilMoistureState', 'soilMoistureValue', 'soilMoistureTarget',
      'airTemperatureState', 'airTemperatureValue', 'airTemperatureTarget', 'lightState',
      'lightValue', 'lightPlainTip', 'deviceState', 'deviceOnlineValue', 'deviceLastSeen',
      'overviewTrendCanvas', 'dashboardTaskCount', 'dashboardTaskList', 'adviceRiskTitle',
      'adviceRiskDetail', 'adviceActionTitle', 'adviceWaterValue', 'adviceActionMeta',
      'deviceOnlineRing', 'deviceOnlineRate', 'deviceOnlineSummary', 'deviceOfflineSummary'
    ].forEach(id => { this.dom[id] = document.getElementById(id); });
  }

  bindEvents() {
    this.dom.btnUserMenu?.addEventListener('click', (event) => {
      event.stopPropagation();
      const nextHidden = !this.dom.userMenu.hidden;
      this.dom.userMenu.hidden = nextHidden;
      this.dom.btnUserMenu.setAttribute('aria-expanded', String(!nextHidden));
    });
    document.addEventListener('click', () => {
      if (this.dom.userMenu) this.dom.userMenu.hidden = true;
      this.dom.btnUserMenu?.setAttribute('aria-expanded', 'false');
    });
    this.dom.btnLogout?.addEventListener('click', () => {
      api.logout();
      window.location.hash = '';
      window.location.href = 'login.html';
    });

    // Logo Click -> Go to Home
    this.dom.btnLogoHome?.addEventListener('click', () => this.navigate('home'));

    // New plot entry: opens the existing farm map where the planning tool lives.
    this.dom.btnQuickAction?.addEventListener('click', () => {
      this.openSubview('plot-detail', { plotId: this.state.currentPlotId });
      this.showToast('已进入农田地图，点击“新建地块”即可规划。', 'info');
    });

    // Resource schedule click
    this.dom.btnViewResourceDetail?.addEventListener('click', () => {
      this.openSubview('resource-coordination');
    });

    // Search input filter for plots
    this.dom.plotSearchInput?.addEventListener('input', (e) => {
      this.filterPlots(e.target.value);
    });
    this.dom.globalSearchInput?.addEventListener('input', (e) => {
      const keyword = e.target.value.trim();
      if (this.dom.plotSearchInput) this.dom.plotSearchInput.value = keyword;
      this.filterPlots(keyword);
    });

    // Global Search Keyboard Shortcut (⌘K / Ctrl+K / Slash)
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.dom.globalSearchInput?.focus();
      } else if (e.key === '/' && document.activeElement !== this.dom.copilotInput && document.activeElement !== this.dom.globalSearchInput) {
        e.preventDefault();
        this.dom.globalSearchInput?.focus();
      } else if (e.key === 'Escape') {
        this.closeModal();
      }
    });

    // Copilot Chips Click
    document.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const intent = btn.dataset.intent;
        this.handleCopilotChip(intent);
      });
    });

    // Copilot Send button
    this.dom.btnSendCopilot?.addEventListener('click', () => this.handleCopilotSubmit());
    this.dom.copilotInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleCopilotSubmit();
      }
    });

    // Feed Tabs Filter
    this.dom.feedTabButtons?.addEventListener('click', (e) => {
      const btn = e.target.closest('.feed-tab-btn');
      if (!btn) return;
      document.querySelectorAll('.feed-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.state.activeFilter = btn.dataset.filter || 'ALL';
      this.renderFeed();
    });

    // Module Navigation Links
    this.dom.moduleNavList?.addEventListener('click', (e) => {
      const item = e.target.closest('.module-nav-item');
      if (!item) return;
      const view = item.dataset.view;
      if (view === 'home') {
        this.navigate('home');
      } else {
        this.openSubview(view, { plotId: this.state.currentPlotId });
      }
    });

    // Close Modal Button
    this.dom.btnCloseModal?.addEventListener('click', () => this.closeModal());
    this.dom.btnBackToHome?.addEventListener('click', () => this.closeModal());
    this.dom.subviewModal?.addEventListener('click', (e) => {
      if (e.target === this.dom.subviewModal) this.closeModal();
    });
    this.dom.modalDynamicContent?.addEventListener('click', (event) => {
      const viewTrigger = event.target.closest('[data-dashboard-view]');
      if (viewTrigger) this.openSubview(viewTrigger.dataset.dashboardView, { plotId: this.state.currentPlotId });
    });

    this.dom.dashboardShell?.addEventListener('click', (e) => {
      const viewTrigger = e.target.closest('[data-dashboard-view]');
      if (viewTrigger) {
        this.openSubview(viewTrigger.dataset.dashboardView, { plotId: this.state.currentPlotId });
        return;
      }

      const actionTrigger = e.target.closest('[data-dashboard-action]');
      if (actionTrigger?.dataset.dashboardAction === 'start-operator-task') {
        actionTrigger.innerHTML = '<i class="ph ph-check-circle"></i>任务进行中';
        actionTrigger.disabled = true;
        this.showToast('任务已开始，系统会记录时间和地块。', 'success');
        return;
      }
      if (actionTrigger?.dataset.dashboardAction === 'irrigate') {
        this.executeIrrigationAction(`plan-${this.state.currentPlotId}-dashboard`, this.state.currentPlotId, actionTrigger);
        return;
      }

      const taskItem = e.target.closest('[data-task-item]');
      if (taskItem) {
        taskItem.classList.toggle('done');
        const completed = taskItem.classList.contains('done');
        this.showToast(completed ? '已标记完成。' : '已恢复为待办。', completed ? 'success' : 'info');
      }
    });

    document.querySelectorAll('.period-tabs button').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.period-tabs button').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        this.showToast(`${button.textContent.trim()}趋势已切换。`, 'info');
      });
    });

    let resizeFrame = null;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => this.drawOverviewTrend());
    });
  }

  applyRole(user) {
    const role = ROLE_CONFIG[user?.role] ? user.role : 'FARMER';
    const config = ROLE_CONFIG[role];
    document.body.dataset.role = role;
    this.state.user = { ...user, role };
    this.dom.userDisplayName.textContent = user.displayName || user.username || config.label;
    this.dom.userRoleLabel.textContent = config.label;
    this.dom.menuUserName.textContent = user.displayName || user.username || config.label;
    this.dom.menuUserRole.textContent = `${config.label} · 农智示范农场`;
    this.dom.headerCurrentView.textContent = config.homeTitle;
    if (this.dom.globalSearchInput) {
      this.dom.globalSearchInput.placeholder = role === 'SYSTEM_ADMIN' ? '搜索设备、账号或日志' : role === 'FIELD_OPERATOR' ? '搜索任务或地块' : '搜索地块或作物';
    }
    this.renderRoleNavigation(role);
  }

  renderRoleNavigation(role = this.state.user?.role) {
    const config = ROLE_CONFIG[role] || ROLE_CONFIG.FARMER;
    this.dom.moduleNavList.innerHTML = config.nav.map(([view, icon, label], index) => `
      <button class="module-nav-item ${index === 0 ? 'active' : ''}" type="button" data-view="${view}" title="${label}">
        <i class="ph ${icon}" aria-hidden="true"></i><span>${label}</span>
      </button>
    `).join('');
    this.dom.sidebarFoot.innerHTML = config.foot.map(([view, icon, label]) => `
      <button class="sidebar-quiet-button" type="button" data-dashboard-view="${view}" title="${label}">
        <i class="ph ${icon}" aria-hidden="true"></i><span>${label}</span>
      </button>
    `).join('');
  }

  renderRoleHome() {
    const role = this.state.user?.role || 'FARMER';
    const showFarm = role === 'FARM_ADMIN' || role === 'FARMER';
    this.dom.farmWorkspace.hidden = !showFarm;
    this.dom.operatorWorkspace.hidden = role !== 'FIELD_OPERATOR';
    this.dom.systemWorkspace.hidden = role !== 'SYSTEM_ADMIN';
    this.dom.systemRail.hidden = !showFarm;
    this.dom.plotSwitcherRow.hidden = role === 'SYSTEM_ADMIN' || role === 'FIELD_OPERATOR';
    this.dom.managerOverview.hidden = role !== 'FARM_ADMIN';
    this.dom.btnQuickAction.hidden = role !== 'FARM_ADMIN';
    if (showFarm) {
      const risky = this.state.plots.filter(plot => plot.riskLevel === 'HIGH' || plot.metrics?.SOIL_MOISTURE?.status === 'LOW').length;
      const riskNode = document.getElementById('managerRiskPlots');
      if (riskNode) riskNode.textContent = String(risky);
    } else if (role === 'FIELD_OPERATOR') {
      this.renderOperatorWorkspace();
    } else {
      this.renderSystemWorkspace();
    }
  }

  renderOperatorWorkspace() {
    if (!this.dom.operatorTaskList) return;
    const tasks = [
      { number: '01', urgent: true, title: 'A01 番茄地补水', note: '土壤偏干，建议补水 153 升', time: '18:00 前', distance: '步行 3 分钟' },
      { number: '02', title: 'A02 玉米地巡查', note: '查看叶片和滴灌带是否正常', time: '今天完成', distance: '步行 6 分钟' },
      { number: '03', title: 'B01 水稻田看水位', note: '水位保持在田面上方约 3 厘米', time: '16:30 前', distance: '步行 8 分钟' },
      { number: '04', title: '温室水泵复查', note: '已修复，拍照确认运行声音正常', time: '已完成', distance: '13:56', done: true }
    ];
    this.dom.operatorTaskList.innerHTML = tasks.map(task => `
      <article class="operator-task ${task.urgent ? 'urgent' : ''} ${task.done ? 'done' : ''}">
        <span class="operator-task-number">${task.done ? '<i class="ph ph-check"></i>' : task.number}</span>
        <div><h3>${task.title}</h3><p>${task.note}</p><div class="operator-task-meta"><span>${task.time}</span><span>${task.distance}</span></div></div>
        <button type="button" data-dashboard-view="${task.done ? 'completed-work' : 'work-orders'}">${task.done ? '看记录' : '看步骤'}</button>
      </article>
    `).join('');
  }

  renderSystemWorkspace() {
    if (!this.dom.systemSummaryGrid) return;
    const cards = [
      ['green', 'ph-plugs-connected', '核心服务', '5 / 5', '全部正常'],
      ['blue', 'ph-broadcast', '设备在线', '18 / 20', '2 台待检查'],
      ['amber', 'ph-waveform', '数据异常', '1 条', '已暂停自动执行'],
      ['purple', 'ph-users', '今日登录', '12 人', '没有异常登录']
    ];
    this.dom.systemSummaryGrid.innerHTML = cards.map(([tone, icon, label, value, tip]) => `
      <article class="system-summary-card ${tone}"><span><i class="ph ${icon}"></i></span><div><small>${label}</small><strong>${value}</strong><b>${tip}</b></div></article>
    `).join('');
  }

  canAccessView(viewName) {
    if (!viewName || viewName === 'home') return true;
    const config = ROLE_CONFIG[this.state.user?.role] || ROLE_CONFIG.FARMER;
    return [...config.nav, ...config.foot].some(([view]) => view === viewName);
  }

  getHomeTitle() {
    return (ROLE_CONFIG[this.state.user?.role] || ROLE_CONFIG.FARMER).homeTitle;
  }

  async loadOverview() {
    const overview = await api.getOverview();
    const basePlots = overview?.plots || this.state.plots;
    const reclaimedPlots = this.readStoredPlotSnapshots();
    const mergedPlots = new Map(basePlots.map(plot => [plot.plotId, plot]));
    reclaimedPlots.forEach(plot => {
      const base = mergedPlots.get(plot.plotId);
      mergedPlots.set(plot.plotId, base ? { ...base, ...plot, metrics: { ...base.metrics, ...plot.metrics } } : plot);
    });
    this.state.plots = [...mergedPlots.values()];
  }

  readStoredPlotSnapshots() {
    try {
      const current = JSON.parse(window.localStorage.getItem(PLOT_STATE_STORAGE_KEY) || '[]');
      const migrated = JSON.parse(window.localStorage.getItem(RECLAIMED_PLOTS_STORAGE_KEY) || '[]');
      const merged = new Map();
      if (Array.isArray(current)) current.forEach(plot => plot?.plotId && merged.set(plot.plotId, plot));
      if (Array.isArray(migrated)) migrated.forEach(plot => plot?.plotId && !merged.has(plot.plotId) && merged.set(plot.plotId, plot));
      return [...merged.values()].filter(plot => plot?.metrics?.SOIL_MOISTURE);
    } catch (error) {
      console.warn('无法读取本地地块状态，已回退到默认农场数据。', error);
      return [];
    }
  }

  readStoredReclaimedPlots() {
    return this.readStoredPlotSnapshots().filter(plot => plot.isReclaimed);
  }

  persistPlotSnapshot(plot) {
    if (!plot?.plotId) return;
    const stored = this.readStoredPlotSnapshots();
    const snapshot = JSON.parse(JSON.stringify(plot));
    const index = stored.findIndex(item => item.plotId === snapshot.plotId);
    if (index >= 0) stored[index] = snapshot;
    else stored.push(snapshot);
    window.localStorage.setItem(PLOT_STATE_STORAGE_KEY, JSON.stringify(stored));
  }

  persistReclaimedPlot(plot) {
    if (!plot?.plotId) return;
    const snapshot = JSON.parse(JSON.stringify({
      ...plot,
      isReclaimed: true,
      createdAt: plot.createdAt || new Date().toISOString()
    }));
    this.persistPlotSnapshot(snapshot);
  }

  registerReclaimedPlot(newPlot) {
    if (!newPlot?.plotId) return;
    const existing = this.state.plots.find(plot => plot.plotId === newPlot.plotId);
    const normalized = {
      ...newPlot,
      isReclaimed: true,
      createdAt: newPlot.createdAt || existing?.createdAt || new Date().toISOString()
    };
    if (existing) Object.assign(existing, normalized);
    else this.state.plots.push(normalized);

    this.persistReclaimedPlot(existing || normalized);
    this.farmMonitor?.setPlots(this.state.plots);
    this.state.currentPlotId = normalized.plotId;
    this.renderPlots(this.dom.plotSearchInput?.value || '');
    this.renderDashboard();
  }

  updateRegisteredPlot(updatedPlot) {
    if (!updatedPlot?.plotId) return;
    const existing = this.state.plots.find(plot => plot.plotId === updatedPlot.plotId);
    if (existing && existing !== updatedPlot) Object.assign(existing, updatedPlot);
    this.persistPlotSnapshot(existing || updatedPlot);
    this.farmMonitor?.setPlots(this.state.plots);
    this.renderPlots(this.dom.plotSearchInput?.value || '');
    this.renderDashboard();
  }

  updateSystemStatusPill() {
    if (this.state.isLive) {
      if (this.dom.systemStatusText) this.dom.systemStatusText.textContent = "运行正常";
      const dot = this.dom.systemStatusPill?.querySelector('.dot');
      if (dot) dot.style.backgroundColor = "var(--green-bright)";
      if (this.dom.rightAiModeTag) this.dom.rightAiModeTag.textContent = "在线分析";
    } else {
      if (this.dom.systemStatusText) this.dom.systemStatusText.textContent = "本地演示正常";
      const dot = this.dom.systemStatusPill?.querySelector('.dot');
      if (dot) dot.style.backgroundColor = "var(--green-bright)";
      if (this.dom.rightAiModeTag) this.dom.rightAiModeTag.textContent = "本地分析";
    }
  }

  renderPlots(filterKeyword = '') {
    if (!this.dom.plotListContainer) return;
    const filtered = this.state.plots.filter(p => {
      const match = `${p.name || ''}${p.cropName || ''}${p.cropVariety || ''}${p.plotId || ''}`.toLowerCase();
      return match.includes(filterKeyword.toLowerCase());
    });

    if (this.dom.plotsCountTag) this.dom.plotsCountTag.textContent = `${filtered.length} 个地块`;

    this.dom.plotListContainer.innerHTML = filtered.map(plot => {
      const isActive = plot.plotId === this.state.currentPlotId;
      const code = (plot.name || plot.plotId).split(/\s+/)[0].toUpperCase();
      const shortCrop = {
        tomato: '番茄', corn: '玉米', cucumber: '水果黄瓜', rice: '水稻',
        sunflower: '向日葵', strawberry: '红颊草莓'
      }[plot.cropCode] || plot.cropName || '待种植';

      return `
        <button class="plot-tab ${isActive ? 'active' : ''}" type="button" data-plot-id="${plot.plotId}" title="${plot.name} · ${plot.stageLabel}">
          <strong>${code}</strong><span>${shortCrop}</span>
        </button>
      `;
    }).join('');

    // Attach click listeners to plot items
    this.dom.plotListContainer.querySelectorAll('.plot-tab').forEach(item => {
      item.addEventListener('click', () => {
        const plotId = item.dataset.plotId;
        this.selectPlot(plotId);
      });
    });
  }

  filterPlots(keyword) {
    this.renderPlots(keyword);
  }

  selectPlot(plotId) {
    this.state.currentPlotId = plotId;
    const plot = this.state.plots.find(p => p.plotId === plotId);
    if (plot && this.dom.currentPlotContextBadge) {
      this.dom.currentPlotContextBadge.textContent = `/ 当前选中：${plot.name} (${plot.cropName} · ${plot.stageLabel})`;
    }
    this.renderPlots(this.dom.plotSearchInput?.value || '');
    this.renderDashboard(plotId);
    this.showToast(`已切换当前工作地块至：${plot ? plot.name : plotId}`, 'info');
  }

  renderDashboard(plotId = this.state.currentPlotId) {
    const plot = this.state.plots.find(item => item.plotId === plotId) || this.state.plots[0];
    if (!plot) return;

    const moisture = plot.metrics?.SOIL_MOISTURE || { value: 0, target: '--' };
    const temperature = plot.metrics?.AIR_TEMPERATURE || { value: 0, target: '--' };
    const light = plot.metrics?.LIGHT || { value: 0, target: '--' };
    const lowerMoisture = Number((String(moisture.target).match(/[\d.]+/) || [20])[0]);
    const isDry = Number(moisture.value) < lowerMoisture || plot.riskLevel === 'HIGH';
    const health = Math.round(Number(plot.healthScore || .9) * 100);
    const cropImage = {
      tomato: 'tomato.png', corn: 'corn.png', cucumber: 'cucumber.png', rice: 'rice.png',
      sunflower: 'sunflower.png', strawberry: 'strawberry.png'
    }[plot.cropCode] || 'tomato.png';
    const plotCode = (plot.name || plot.plotId).split(/\s+/)[0].toUpperCase();
    const plainCropName = plot.cropName || '当前作物';
    const waterAmount = Math.max(90, Math.round((plot.areaM2 || 120) * (isDry ? 1.28 : .72)));
    const duration = Math.max(5, Math.round(waterAmount / 18));
    const deviceOnline = plot.deviceStatus === 'OFFLINE' ? 17 : 18;
    const onlineRate = Math.round(deviceOnline / 20 * 100);

    const setText = (name, value) => { if (this.dom[name]) this.dom[name].textContent = value; };
    setText('dashboardPlotTitle', `${plotCode} ${plainCropName}工作台`);
    setText('dashboardStageTag', plot.stageLabel || '生长期');
    setText('dashboardPlotLocation', plot.isReclaimed ? '新建露天地块' : plot.plotId === 'plot-c01' ? '智能连栋温室' : '示范农场');
    setText('dashboardCropVariety', plot.cropVariety || plainCropName);
    setText('dashboardPlotArea', `${plot.areaM2 || '--'} 平方米`);
    setText('dashboardHealthLabel', health >= 95 ? '很好' : health >= 85 ? '良好' : '需留意');
    setText('dashboardHealthScore', health);
    setText('dashboardHealthTip', isDry ? `长势总体良好，${plainCropName}地稍偏干。` : '长势稳定，今天按计划巡田即可。');
    if (this.dom.dashboardHealthBar) this.dom.dashboardHealthBar.style.width = `${health}%`;

    if (this.dom.dashboardCropImage) {
      this.dom.dashboardCropImage.style.opacity = '.45';
      this.dom.dashboardCropImage.alt = `${plainCropName}地块实景`;
      const nextSrc = `assets/crops/${cropImage}`;
      const reveal = () => { this.dom.dashboardCropImage.style.opacity = '1'; };
      if (this.dom.dashboardCropImage.getAttribute('src') === nextSrc) reveal();
      else {
        this.dom.dashboardCropImage.onload = reveal;
        this.dom.dashboardCropImage.src = nextSrc;
      }
    }

    this.dom.dashboardRiskCard?.classList.toggle('safe', !isDry);
    const riskIcon = this.dom.dashboardRiskCard?.querySelector('.risk-icon i');
    if (riskIcon) riskIcon.className = `ph ${isDry ? 'ph-warning' : 'ph-check-circle'}`;
    setText('dashboardRiskTitle', isDry ? '土壤偏干，需要补水' : '当前没有明显风险');
    setText('dashboardRiskText', isDry ? `建议今天傍晚前补一次水，避免${plainCropName}打蔫。` : `${plainCropName}长势稳定，继续观察即可。`);

    setText('soilMoistureValue', moisture.value);
    setText('soilMoistureTarget', moisture.target || '--');
    setText('soilMoistureState', isDry ? '偏低' : '合适');
    this.dom.soilMoistureState?.classList.toggle('good', !isDry);
    setText('airTemperatureValue', temperature.value);
    setText('airTemperatureTarget', temperature.target || '--');
    setText('airTemperatureState', Number(temperature.value) > 34 ? '偏高' : '合适');
    this.dom.airTemperatureState?.classList.toggle('good', Number(temperature.value) <= 34);
    setText('lightValue', (Number(light.value || 0) / 1000).toFixed(1));
    setText('lightState', Number(light.value) > 70000 ? '偏强' : '合适');
    setText('lightPlainTip', Number(light.value) > 70000 ? '光照较强，注意叶片晒伤' : '阳光充足，适合作物生长');
    setText('deviceState', plot.deviceStatus === 'OFFLINE' ? '需检查' : '正常');
    setText('deviceOnlineValue', deviceOnline);
    setText('deviceLastSeen', `${plot.lastSeen || '刚刚'}收到数据`);

    setText('adviceRiskTitle', isDry ? `${plainCropName}地有缺水风险` : `${plainCropName}地状态正常`);
    setText('adviceRiskDetail', isDry ? `继续偏干可能影响${plot.stageLabel || '当前阶段'}的长势。` : '未来几小时风险较低，不用额外处理。');
    setText('adviceActionTitle', isDry ? '今天傍晚补水' : '按原计划巡田');
    setText('adviceWaterValue', isDry ? waterAmount : 0);
    setText('adviceActionMeta', isDry ? `预计约 ${duration} 分钟 · 下发前会自动核对设备` : '无需额外用水 · 继续观察即可');
    const irrigateButton = this.dom.dashboardShell?.querySelector('[data-dashboard-action="irrigate"]');
    if (irrigateButton) {
      irrigateButton.disabled = !isDry;
      irrigateButton.innerHTML = isDry
        ? '<i class="ph ph-drop" aria-hidden="true"></i>执行补水'
        : '<i class="ph ph-check" aria-hidden="true"></i>暂不需要补水';
    }

    setText('deviceOnlineRate', `${onlineRate}%`);
    setText('deviceOnlineSummary', `${deviceOnline} / 20`);
    setText('deviceOfflineSummary', `${20 - deviceOnline} 台需要检查`);
    if (this.dom.deviceOnlineRing) this.dom.deviceOnlineRing.style.background = `conic-gradient(var(--green) 0 ${onlineRate}%, #e9eeea ${onlineRate}% 100%)`;

    this.renderDashboardTasks(plot, isDry, waterAmount);
    requestAnimationFrame(() => this.drawOverviewTrend(plot));
  }

  renderDashboardTasks(plot, isDry, waterAmount) {
    if (!this.dom.dashboardTaskList) return;
    const crop = plot.cropName || '当前作物';
    const tasks = isDry ? [
      { icon: 'ph-drop', tone: 'urgent', title: '傍晚补水', note: `建议补水约 ${waterAmount} 升`, time: '今天 18:00' },
      { icon: 'ph-magnifying-glass', tone: 'inspect', title: '查看叶片', note: `看看${crop}有没有打蔫`, time: '补水前' },
      { icon: 'ph-broadcast', tone: 'plan', title: '检查水阀', note: '确认设备在线、出水正常', time: '今天' }
    ] : [
      { icon: 'ph-path', tone: 'inspect', title: '例行巡田', note: `查看${crop}长势和病叶`, time: '明天 09:00' },
      { icon: 'ph-drop', tone: 'urgent', title: '按计划浇水', note: '目前不用提前补水', time: '后天 10:00' },
      { icon: 'ph-note-pencil', tone: 'plan', title: '记录长势', note: '拍照并记录作物阶段', time: '本周' }
    ];
    setTimeout(() => {
      if (this.dom.dashboardTaskCount) this.dom.dashboardTaskCount.textContent = `${tasks.length} 项`;
    }, 0);
    this.dom.dashboardTaskList.innerHTML = tasks.map((task, index) => `
      <button class="task-item" type="button" data-task-item="${index}">
        <span class="task-item-icon ${task.tone}"><i class="ph ${task.icon}" aria-hidden="true"></i></span>
        <span><strong>${task.title}</strong><p>${task.note}</p></span>
        <span class="task-time">${task.time}</span>
      </button>
    `).join('');
  }

  drawOverviewTrend(plot = null) {
    const canvas = this.dom.overviewTrendCanvas;
    if (!canvas) return;
    const activePlot = plot || this.state.plots.find(item => item.plotId === this.state.currentPlotId) || this.state.plots[0];
    if (!activePlot) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const width = rect.width;
    const height = rect.height;
    const pad = { top: 12, right: 12, bottom: 26, left: 32 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const moistureNow = Number(activePlot.metrics?.SOIL_MOISTURE?.value || 25);
    const temperatureNow = Number(activePlot.metrics?.AIR_TEMPERATURE?.value || 26);
    const moisture = [5.8, 4.2, 5.2, 2.8, 3.9, 1.1, -2.2, -1.4, -3.8, -2.7, -1.2, 0].map(delta => Math.max(5, moistureNow + delta));
    const temperature = [-3.6, -2.1, -2.8, -1.5, -2.3, -.7, .4, 1.2, 2.1, 2.7, 1.5, 0].map(delta => temperatureNow + delta);

    ctx.clearRect(0, 0, width, height);
    ctx.font = '9px Inter, Microsoft YaHei, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i += 1) {
      const y = pad.top + chartH * i / 4;
      ctx.strokeStyle = '#edf1ee';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
      ctx.fillStyle = '#9aa49c';
      ctx.fillText(String(40 - i * 10), pad.left - 8, y);
    }
    const labels = ['12:00', '18:00', '00:00', '06:00', '12:00'];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    labels.forEach((label, index) => {
      const x = pad.left + chartW * index / (labels.length - 1);
      ctx.fillStyle = '#9aa49c';
      ctx.fillText(label, x, height - 17);
    });

    const drawLine = (values, min, max, color) => {
      ctx.beginPath();
      values.forEach((value, index) => {
        const x = pad.left + chartW * index / (values.length - 1);
        const y = pad.top + chartH * (1 - (value - min) / (max - min));
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      values.forEach((value, index) => {
        if (index % 2 !== 0 && index !== values.length - 1) return;
        const x = pad.left + chartW * index / (values.length - 1);
        const y = pad.top + chartH * (1 - (value - min) / (max - min));
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      });
    };
    drawLine(moisture, 0, 45, '#4086f4');
    drawLine(temperature, 15, 40, '#21a657');
  }

  renderFeed() {
    if (!this.dom.feedStreamContainer) return;
    const items = this.state.feedItems.filter(item => {
      if (this.state.activeFilter === 'ALL') return true;
      return item.type === this.state.activeFilter;
    });

    this.dom.feedCountTag.textContent = `共 ${items.length} 条关键动态`;

    this.dom.feedStreamContainer.innerHTML = items.map(item => {
      return this.renderFeedItemHtml(item);
    }).join('');

    this.bindFeedActions();
  }

  renderFeedItemHtml(item) {
    const isDiagnosis = item.type === 'DIAGNOSIS';
    const isPrescription = item.type === 'PRESCRIPTION';
    const isForecast = item.type === 'FORECAST';
    const isWorkOrder = item.type === 'WORK_ORDER';

    let extraDetailsHtml = '';

    if (isDiagnosis && item.details) {
      extraDetailsHtml = `
        <div class="feed-details-box">
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">
            根因判定：${item.details.primaryCause} (置信度: ${Math.round(item.details.confidence * 100)}%)
          </div>
          <ul class="evidence-list">
            ${item.details.supportingEvidence.map(ev => `<li class="evidence-item">${ev}</li>`).join('')}
          </ul>
        </div>
      `;
    } else if (isPrescription && item.details) {
      const gates = item.details.hardGates || {};
      extraDetailsHtml = `
        <div class="feed-details-box">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 600; color: var(--text-primary);">处方参数：灌溉 ${item.details.durationFormatted} / 需水 ${item.details.waterLitre}L</span>
            <span style="color: var(--text-muted); font-size: 11px;">预计成本：${item.details.costEstimate}</span>
          </div>
          <div class="hard-gates-grid">
            ${Object.entries(gates).map(([name, status]) => `
              <div class="gate-chip">
                <span>${name}</span>
                <span class="status-pass">✓ ${status}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (isForecast && item.details) {
      extraDetailsHtml = `
        <div class="feed-details-box">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-weight: 600; color: var(--text-primary);">Time-to-Risk 倒计时：</span>
            <span style="color: var(--amber-primary); font-weight: 600;">⏱️ ${item.details.timeToRiskMinutes} 分钟</span>
          </div>
          <div style="display: flex; gap: 12px; font-size: 12px; color: var(--text-secondary);">
            ${item.details.horizons.map(h => `
              <div style="background: var(--bg-surface); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-default); flex: 1;">
                <div><strong>+${h.minute}m</strong></div>
                <div style="color: var(--text-primary); font-family: var(--font-mono);">${h.expectedMoisture}%</div>
                <div style="font-size: 10px; color: var(--text-muted);">${h.band}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (isWorkOrder && item.details) {
      extraDetailsHtml = `
        <div class="feed-details-box">
          <ul class="evidence-list">
            ${item.details.tasks.map(t => `
              <li class="evidence-item" style="justify-content: space-between;">
                <span>${t.name}</span>
                <span style="font-size: 11px; color: var(--amber-primary);">${t.due}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    return `
      <article class="feed-card" data-feed-id="${item.id}">
        <div class="feed-card-header">
          <div class="feed-author-meta">
            <div class="feed-avatar">${item.author.avatar}</div>
            <div class="feed-author-info">
              <span class="feed-author-name">
                ${item.author.name}
                <span class="feed-author-tag">${item.author.tag}</span>
              </span>
              <span class="feed-timestamp">${item.category} · ${item.timestamp}</span>
            </div>
          </div>
          <span class="feed-card-badge ${item.badge.color}">${item.badge.text}</span>
        </div>

        <h2 class="feed-card-title">${item.title}</h2>
        <p class="feed-card-summary">${item.summary}</p>

        ${extraDetailsHtml}

        <div class="feed-actions-group">
          ${item.actions.map(act => {
            const btnClass = act.type === 'primary' ? 'btn-primary' : act.type === 'success' ? 'btn-success' : act.type === 'secondary' ? 'btn-secondary' : 'btn-ghost';
            return `
              <button class="btn ${btnClass}" 
                data-action="${act.action}" 
                data-view="${act.view || ''}" 
                data-plot-id="${act.plotId || ''}" 
                data-plan-id="${act.planId || ''}"
                data-trace-id="${act.traceId || ''}">
                ${act.label}
              </button>
            `;
          }).join('')}
        </div>
      </article>
    `;
  }

  bindFeedActions() {
    this.dom.feedStreamContainer.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        const view = btn.dataset.view;
        const plotId = btn.dataset.plotId || this.state.currentPlotId;
        const planId = btn.dataset.planId;
        const traceId = btn.dataset.traceId;

        if (action === 'execute-irrigation') {
          this.executeIrrigationAction(planId, plotId, btn);
        } else if (action === 'generate-prescription') {
          this.generatePrescriptionAction(plotId);
        } else if (action === 'open-subview') {
          this.openSubview(view, { plotId, traceId });
        }
      });
    });
  }

  async executeIrrigationAction(planId, plotId, triggerBtn) {
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = `<span>正在下发...</span>`;
    }

    this.showToast('正在检查设备并下发补水指令...', 'info');

    try {
      const result = await api.executeIrrigation(planId, plotId);

      setTimeout(() => {
        if (triggerBtn) {
          triggerBtn.disabled = false;
          triggerBtn.innerHTML = `<span>补水完成</span>`;
        }

        // Update plot soil moisture in state to reflect the closed loop
        const plot = this.state.plots.find(p => p.plotId === plotId);
        if (plot) {
          plot.metrics.SOIL_MOISTURE.value = 29.8;
          plot.metrics.SOIL_MOISTURE.status = "NORMAL";
          plot.riskLevel = "LOW";
          this.persistPlotSnapshot(plot);
          this.farmMonitor?.setPlots(this.state.plots);
        }
        this.renderPlots(this.dom.plotSearchInput?.value || '');
        this.renderDashboard(plotId);

        this.showToast(`【${plot ? plot.name : plotId}】补水完成，土壤湿度已回升至 29.8%。`, 'success');
      }, 1000);
    } catch (e) {
      this.showToast('下发指令失败: ' + e.message, 'error');
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = `<span>重新尝试</span>`;
      }
    }
  }

  async generatePrescriptionAction(plotId) {
    this.showToast(`正在基于【${plotId}】Crop Pack 模型生成精准处方...`, 'info');
    const chatResult = await api.agentChat('生成灌溉处方', plotId);
    this.displayCopilotBanner(chatResult);
  }

  handleCopilotChip(intent) {
    const plot = this.state.plots.find(p => p.plotId === this.state.currentPlotId) || this.state.plots[0];
    let query = '';
    switch (intent) {
      case 'diagnose': query = `分析【${plot.name}】的缺水与传感器漂移风险`; break;
      case 'irrigation': query = `为【${plot.name}】生成阶段精准补水处方与就绪度检查`; break;
      case 'forecast': query = `预测【${plot.name}】未来 1~4 小时土壤水分与失水时间`; break;
      case 'work': query = `汇总今日全场待办农事工单与巡田任务`; break;
      case 'status': query = `读取【${plot.name}】实时遥测与设备健康度`; break;
    }
    if (this.dom.copilotInput) {
      this.dom.copilotInput.value = query;
      this.handleCopilotSubmit();
    }
  }

  async handleCopilotSubmit() {
    const query = this.dom.copilotInput?.value.trim();
    if (!query) return;

    this.dom.btnSendCopilot.disabled = true;
    this.dom.btnSendCopilot.innerHTML = `<i class="ph ph-circle-notch" aria-hidden="true"></i>`;

    try {
      const response = await api.agentChat(query, this.state.currentPlotId);
      this.displayCopilotBanner(response);
    } catch (e) {
      this.showToast('Agent 协同异常: ' + e.message, 'error');
    } finally {
      this.dom.btnSendCopilot.disabled = false;
      this.dom.btnSendCopilot.innerHTML = `<i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>`;
    }
  }

  displayCopilotBanner(response) {
    if (!this.dom.copilotOutputBanner) return;
    this.dom.copilotOutputBanner.classList.add('active');
    this.dom.copilotTraceId.textContent = `traceId: ${response.traceId || 'run-mock'}`;
    
    let citations = '';
    if (response.knowledgeEvidence && response.knowledgeEvidence.length > 0) {
      citations = `\n\n📚 知识与规则引用来源：\n` + response.knowledgeEvidence.map(k => `  • [${k.scope}] ${k.source} (${k.provenance})`).join('\n');
    }

    this.dom.copilotOutputText.textContent = response.summary + citations;
    this.dom.copilotOutputBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  renderChangelog() {
    if (!this.dom.changelogContainer) return;
    const plainMessages = [
      { time: '14:28', title: 'A01 番茄地土壤偏干' },
      { time: '14:21', title: '1 台湿度设备需要检查' },
      { time: '13:56', title: '灌溉水泵已恢复在线' }
    ];
    this.dom.changelogContainer.innerHTML = plainMessages.map(item => `
      <li class="changelog-item">
        <span class="changelog-time">${item.time}</span>
        <span class="changelog-title">${item.title}</span>
      </li>
    `).join('');
  }

  /**
   * Router and Sub-view modal/drawer controller
   */
  handleRoute() {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const view = params.get('view');
    const plotId = params.get('plotId') || this.state.currentPlotId;

    if (view && view !== 'home') {
      this.openSubview(view, { plotId, updateHash: false });
    } else {
      this.closeModal(false);
    }
  }

  navigate(viewName, params = {}) {
    if (viewName === 'home') {
      window.location.hash = '';
      this.closeModal(false);
    } else {
      const searchParams = new URLSearchParams({ view: viewName, ...params });
      window.location.hash = searchParams.toString();
    }
  }

  openSubview(viewName, options = {}) {
    if (!this.canAccessView(viewName)) {
      this.showToast('当前身份不需要使用这个功能。', 'info');
      this.navigate('home');
      return;
    }
    const plotId = options.plotId || this.state.currentPlotId;
    if (viewName === 'plot-detail') {
      this.dom.subviewModal.classList.remove('active');
      this.cropSandbox?.close();
      this.farmMonitor?.setPlots(this.state.plots);
      this.farmMonitor?.open(plotId);
      this.dom.headerCurrentView.textContent = '农田监测大地图';
      document.querySelectorAll('.module-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
      });
      if (options.updateHash !== false) {
        this.navigate(viewName, { plotId });
      }
      return;
    }

    if (viewName === 'scenario-replay' || viewName === 'risk-forecast') {
      this.dom.subviewModal.classList.remove('active');
      this.farmMonitor?.close(false);
      const plot = this.state.plots.find(p => p.plotId === plotId) || this.state.plots[0];
      this.cropSandbox?.open(plotId, plot);
      this.dom.headerCurrentView.textContent = '风险情景模拟';
      document.querySelectorAll('.module-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName || item.dataset.view === 'risk-forecast');
      });
      if (options.updateHash !== false) {
        this.navigate(viewName, { plotId });
      }
      return;
    }

    this.farmMonitor?.close(false);
    this.cropSandbox?.close();
    const meta = EXTRA_VIEW_META[viewName] || MOCK_DATA.subviewsMeta[viewName] || {
      title: viewName,
      desc: '预留独立子模块界面',
      tags: ['Reserved View'],
      status: '模块独立路由就绪'
    };

    const plot = this.state.plots.find(p => p.plotId === plotId) || this.state.plots[0];

    this.dom.modalIcon.textContent = this.getViewIcon(viewName);
    const plotScoped = !['device-management', 'user-permissions', 'farm-config', 'data-status', 'agent-status', 'operation-logs', 'help', 'messages', 'completed-work'].includes(viewName);
    this.dom.modalTitle.textContent = plotScoped ? `${meta.title} · ${plot.name}` : meta.title;
    this.dom.modalTag.textContent = meta.status;
    this.dom.placeholderTitle.textContent = `${meta.title}`;
    this.dom.placeholderDesc.textContent = meta.desc;

    // Render Contextual Data Preview
    this.renderSubviewContextualContent(viewName, plot);

    // Render Code Contract / API Endpoint Spec
    this.dom.modalCodeContract.hidden = this.state.user?.role !== 'SYSTEM_ADMIN';
    this.dom.modalCodeContract.textContent = this.getViewCodeContract(viewName, plot);

    this.dom.subviewModal.classList.add('active');
    this.dom.headerCurrentView.textContent = meta.title;

    // Highlight left nav item
    document.querySelectorAll('.module-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    if (options.updateHash !== false) {
      const searchParams = new URLSearchParams({ view: viewName, plotId });
      window.location.hash = searchParams.toString();
    }
  }

  closeModal(updateHash = true) {
    this.dom.subviewModal.classList.remove('active');
    this.farmMonitor?.close(false);
    this.cropSandbox?.close();
    this.dom.headerCurrentView.textContent = this.getHomeTitle();
    this.renderRoleHome();
    document.querySelectorAll('.module-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === 'home');
    });
    if (updateHash && window.location.hash) {
      window.location.hash = '';
    }
  }

  getViewIcon(viewName) {
    const map = {
      'plot-detail': '📊',
      'decision-console': '🧠',
      'work-orders': '📋',
      'risk-forecast': '🔮',
      'resource-coordination': '💧',
      'value-ledger': '💰',
      'decision-passport': '🛡️',
      'scenario-replay': '⚡',
      'crop-packs': '📦'
    };
    return map[viewName] || '📐';
  }

  renderSubviewContextualContent(viewName, plot) {
    let contentHtml = '';

    if (viewName === 'plot-detail') {
      contentHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px;">
          ${Object.entries(plot.metrics).map(([k, v]) => `
            <div style="background: var(--bg-canvas); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 12px;">
              <div style="font-size: 11px; color: var(--text-secondary);">${v.label} (${k})</div>
              <div style="font-size: 20px; font-weight: 600; color: var(--text-primary); font-family: var(--font-mono); margin: 4px 0;">
                ${v.value} <span style="font-size: 12px; font-weight: normal; color: var(--text-muted);">${v.unit}</span>
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">适宜区间: ${v.target}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (viewName === 'crop-packs') {
      contentHtml = `
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
          ${MOCK_DATA.cropPacks.map(cp => `
            <div style="background: var(--bg-canvas); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 12px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong style="color: var(--text-primary);">${cp.name} (Pack v${cp.version})</strong>
                <span class="dep-tag">${cp.ruleVersion}</span>
              </div>
              <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">${cp.description}</p>
              <div style="font-size: 11px; color: var(--text-muted);">包含阶段：${cp.stages.join(' → ')}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (viewName === 'decision-passport') {
      contentHtml = `
        <div style="background: var(--bg-canvas); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 14px; margin-bottom: 16px; font-size: 12px;">
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">🛡️ 决策审计护照链 (Audit Provenance)</div>
          <div style="display: flex; flex-direction: column; gap: 6px; color: var(--text-secondary);">
            <div>• 遥测输入 (OBSERVED): SOIL_MOISTURE 16.8% (200ms 新鲜度 / GOOD 质量)</div>
            <div>• 诊断推断 (DERIVED): WATER_DEFICIT (置信度 0.92, 排除漂移)</div>
            <div>• 处方规则 (RULES_AGENT): 补水 153L (8.5分钟) / 决策就绪分 0.98</div>
            <div>• 虚拟执行 (VIRTUAL_ACTUATOR): MQTT Command cmd-a01-ack -> ACK: SUCCEEDED</div>
            <div>• 闭环验证 (COMPLETED): 土壤湿度 16.8% -> 29.8% (效果分 0.96)</div>
          </div>
        </div>
      `;
    } else if (viewName === 'inspection-records') {
      contentHtml = `<div class="plain-function-grid"><article><i class="ph ph-camera"></i><strong>拍一张现场照片</strong><p>系统会自动记录 ${plot.name}、时间和操作人员。</p><button type="button">添加巡田记录</button></article><article><i class="ph ph-note-pencil"></i><strong>记录发现的问题</strong><p>可选择“作物打蔫、病虫害、设备漏水、其他”。</p><button type="button">填写现场情况</button></article></div>`;
    } else if (viewName === 'completed-work') {
      contentHtml = `<div class="plain-record-list"><div><i class="ph ph-check-circle"></i><span><strong>温室水泵复查完成</strong><small>李师傅 · 今天 13:56 · 运行正常</small></span></div><div><i class="ph ph-check-circle"></i><span><strong>B03 草莓地巡田完成</strong><small>张师傅 · 今天 11:20 · 未发现异常</small></span></div><div><i class="ph ph-check-circle"></i><span><strong>A02 玉米地滴灌带检查完成</strong><small>李师傅 · 昨天 17:42 · 已更换 1 个接头</small></span></div></div>`;
    } else if (viewName === 'messages') {
      contentHtml = `<div class="plain-record-list"><div><i class="ph ph-warning"></i><span><strong>A01 番茄地需要补水</strong><small>今天 14:28 · 请在 18:00 前完成</small></span></div><div><i class="ph ph-wrench"></i><span><strong>水泵维修结果已确认</strong><small>今天 13:56 · 无需继续处理</small></span></div></div>`;
    } else if (['device-management', 'data-status', 'agent-status'].includes(viewName)) {
      const rows = viewName === 'device-management'
        ? [['A03-湿度-01', '离线 18 分钟', '安排检查'], ['B02-湿度-02', '离线 11 分钟', '安排检查'], ['A01-水阀-01', '运行正常', '查看']]
        : viewName === 'data-status'
          ? [['A02 土壤湿度', '变化过快，待核对', '查看数据'], ['A01 空气温度', '连续正常', '查看'], ['天气数据', '8 分钟前更新', '查看']]
          : [['智能诊断', '运行正常', '查看'], ['农场知识库', '今天 08:00 已更新', '查看'], ['报告生成', '运行正常', '查看']];
      contentHtml = `<div class="plain-admin-list">${rows.map(([name, status, action]) => `<div><span><strong>${name}</strong><small>${status}</small></span><button type="button">${action}</button></div>`).join('')}</div>`;
    } else if (viewName === 'user-permissions') {
      contentHtml = `<div class="plain-function-grid"><article><i class="ph ph-user-plus"></i><strong>新建人员账号</strong><p>选择身份，再分配可查看和可操作的地块。</p><button type="button">新建账号</button></article><article><i class="ph ph-users"></i><strong>当前 12 个账号</strong><p>农场负责人 1 人、农艺人员 3 人、操作员 6 人、系统管理员 2 人。</p><button type="button">查看人员</button></article></div>`;
    } else if (viewName === 'farm-config') {
      contentHtml = `<div class="plain-function-grid"><article><i class="ph ph-map-trifold"></i><strong>${this.state.plots.length} 个地块</strong><p>地块资料与全景大地图使用同一份数据。</p><button type="button" data-dashboard-view="plot-detail">打开农田地图</button></article><article><i class="ph ph-plant"></i><strong>6 类作物</strong><p>修改作物后，首页、地图和风险模拟会一起更新。</p><button type="button" data-dashboard-view="crop-packs">查看作物规则</button></article></div>`;
    } else if (viewName === 'operation-logs') {
      contentHtml = `<div class="plain-record-list"><div><i class="ph ph-sign-in"></i><span><strong>系统管理员登录</strong><small>王工 · 今天 14:12 · 本机演示环境</small></span></div><div><i class="ph ph-drop"></i><span><strong>A01 补水方案已生成</strong><small>今天 14:05 · 尚未下发</small></span></div><div><i class="ph ph-broadcast"></i><span><strong>水泵设备恢复在线</strong><small>今天 13:56 · 心跳正常</small></span></div></div>`;
    } else if (viewName === 'help') {
      const roleLabel = ROLE_CONFIG[this.state.user?.role]?.label || '当前用户';
      contentHtml = `<div class="plain-function-grid"><article><i class="ph ph-book-open-text"></i><strong>${roleLabel}快速上手</strong><p>从左侧第一个页面开始，系统已经按你的工作顺序排好功能。</p><button type="button">查看 3 分钟说明</button></article><article><i class="ph ph-headset"></i><strong>遇到问题</strong><p>记录当前页面和地块，联系系统管理员处理。</p><button type="button">提交问题</button></article></div>`;
    }

    this.dom.modalDynamicContent.innerHTML = contentHtml;
  }

  getViewCodeContract(viewName, plot) {
    const contracts = {
      'plot-detail': `// GET /api/v1/plots/${plot.plotId}/telemetry?metric=SOIL_MOISTURE&limit=1000\n// GET /api/v1/plots/${plot.plotId}/resolved-profile\n// GET /api/v1/plots/${plot.plotId}/timeline`,
      'decision-console': `// POST /api/v1/diagnoses/evaluate { plotId: "${plot.plotId}" }\n// POST /api/v1/irrigation/estimate { plotId: "${plot.plotId}" }\n// GET  /api/v1/decisions/IRRIGATION_PLAN/{planId}/readiness`,
      'work-orders': `// GET  /api/v1/work-items/today?plotId=${plot.plotId}\n// POST /api/v1/work-orders { plotId: "${plot.plotId}", priority: "HIGH" }\n// POST /api/v1/inspections { plotId: "${plot.plotId}", observation: "..." }`,
      'risk-forecast': `// GET  /api/v1/plots/${plot.plotId}/risk-forecast?metric=SOIL_MOISTURE\n// POST /api/v1/forecasts/evaluate { plotId: "${plot.plotId}" }`,
      'resource-coordination': `// POST /api/v1/resource-plans/evaluate { demands: [...] }\n// GET  /api/v1/resource-plans/{resourcePlanId}`,
      'value-ledger': `// GET  /api/v1/value-ledgers\n// POST /api/v1/value-ledgers { plannedWaterLitres: 153, actualWaterLitres: 150 }\n// GET  /api/v1/crop-batches/batch-${plot.plotId}/plan-actual`,
      'decision-passport': `// GET  /api/v1/decision-passports/{traceId}\n// GET  /api/v1/decisions/{traceId}/similar-cases`,
      'scenario-replay': `// POST /api/v1/scenarios/runs { scenario: "drought", seed: 42 }\n// POST /api/v1/scenarios/compare { scenarioId: "drought-42", leftBranch: "EXECUTE", rightBranch: "NO_ACTION" }`,
      'crop-packs': `// GET  /api/v1/crop-packs\n// GET  /api/v1/rules`
    };
    return contracts[viewName] || `// Endpoint: /api/v1/${viewName}`;
  }

  showToast(message, type = 'info') {
    if (!this.dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'ph-check-circle' : type === 'error' ? 'ph-warning-circle' : 'ph-info';
    toast.innerHTML = `<i class="ph ${icon}" aria-hidden="true"></i><span>${message}</span>`;
    this.dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

// Instantiate and start app
document.addEventListener('DOMContentLoaded', () => {
  const app = new AgriApp();
  app.init();
});
