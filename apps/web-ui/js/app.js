/**
 * AgriLoop Frontend - Main Application Controller
 * High-density operational dashboard with modular router & interactive closed-loop
 */
import { MOCK_DATA } from './mock-data.js?v=20260824-module-v5';
import { api } from './api.js?v=20260824-telemetry-risk';
import { FarmMonitor } from './farm-monitor.js';
import { PlotTelemetryView } from './plot-telemetry-view.js?v=20260824-telemetry-risk';
import { initParticles } from './particles.js';
import { initCommandPalette } from './command-palette.js';
import { initTheme } from './theme.js';
import { initRiumBackground } from './rium-background.js';
import { getResourceWaterState, syncWaterVisuals } from './water-visual.js';

const LOGIN_ENTRY = 'login.html';

function redirectToLogin() {
  api.logout();
  window.location.replace(LOGIN_ENTRY);
}

// yyx 分支的增强视图按需加载，首屏不阻塞；plot-detail 仍由 lxh 的
// Three.js Digital Twin 接管，避免两个渲染器争夺同一个全屏画布。
const SUBVIEW_ASSET = '20260824-text-lean';
/** 不展示工作区地块选择条：核心闭环部分视图 + 第三子区「经营与指导」 */
const PLOT_INDEPENDENT_VIEWS = new Set([
  'home',
  'plot-detail',
  'decision-console',
  'decision-feed',
  'crop-packs',
  'value-ledger'
]);
const SUBVIEW_RENDERERS = {
  'risk-forecast': async (container, plotId, app) => (await import(`./modules/risk-forecast.js?v=${SUBVIEW_ASSET}`)).renderRiskForecast(container, plotId, {
    plot: app.state.plots.find(item => item.plotId === plotId)
  }),
  'scenario-replay': async (container, plotId) => (await import(`./modules/risk-forecast.js?v=${SUBVIEW_ASSET}`)).renderScenarioReplay(container, plotId),
  'value-ledger': async (container) => (await import(`./modules/value-ledger.js?v=${SUBVIEW_ASSET}`)).renderValueLedger(container),
  'crop-packs': async (container, _plotId, app) => (await import(`./modules/crop-packs.js?v=${SUBVIEW_ASSET}`)).renderCropPacks(container, { app }),
  'work-orders': async (container, plotId, app) => {
    const { renderWorkOrders } = await import(`./modules/work-orders.js?v=${SUBVIEW_ASSET}`);
    return renderWorkOrders(container, {
      api,
      plots: app.state.plots,
      selectedPlotId: plotId,
      user: app.state.user || (!app.state.isLive ? MOCK_DATA.currentUser : null),
      showToast: (message, type) => app.showToast(message, type)
    });
  },
  'resource-coordination': async (container, plotId, app) => {
    const { renderResourceCoordination } = await import(`./modules/work-orders.js?v=${SUBVIEW_ASSET}`);
    return renderResourceCoordination(container, {
      api,
      plots: app.state.plots,
      selectedPlotId: plotId,
      user: app.state.user || (!app.state.isLive ? MOCK_DATA.currentUser : null),
      showToast: (message, type) => app.showToast(message, type)
    });
  }
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
      activeMainView: 'home',
      isLive: false,
      authenticated: api.isAuthenticated(),
      user: api.getUser(),
      backendAiMode: null,
      simulator: { available: false, status: 'UNAVAILABLE', reason: 'AUTH_REQUIRED' },
      rightRailCollapsed: false
    };

    this.dom = {};
    this.farmMonitor = null;
    this.riumBackground = null;
    this.plotTelemetryView = new PlotTelemetryView(this);
    this._themeCleanup = null;
    this._savedScrollPos = null;   // 弹窗打开前的主页滚动位置
    this._lastHandledHash = null;  // hash 路由幂等去重
  }

  async init() {
    if (!api.readSession()) {
      redirectToLogin();
      return;
    }

    this.cacheDom();
    this.initRightRailCollapse();
    this.bindEvents();

    // rium_dev 的主题事件与液态玻璃背景是可选增强；WebGL 不可用时不阻断主应用。
    this._themeCleanup = initTheme();
    const webglAvailable = typeof window.WebGLRenderingContext === 'function'
      || typeof window.WebGL2RenderingContext === 'function';
    if (webglAvailable) {
      try {
        this.riumBackground = initRiumBackground();
        this.riumBackground?.setBootProgress?.(0.18, '渲染麦田场景…');
      } catch (error) {
        console.warn('Rium background unavailable; continuing with CSS glass shell:', error);
      }
    }

    // 轻量背景动效与全局命令面板来自 yyx；二者均有无 Canvas/无 DOM 的安全降级。
    this._particlesCleanup = initParticles();
    this._paletteCleanup = initCommandPalette(this);

    // Check backend connection
    this.riumBackground?.setBootProgress?.(0.36, '连接后端服务…');
    this.state.isLive = await api.checkHealth();
    if (this.state.isLive) {
      if (!api.isAuthenticated() || !await api.restoreSession()) {
        redirectToLogin();
        return;
      }
    }
    this.syncAuthState();
    this.updateSystemStatusPill();

    // Load initial data
    this.riumBackground?.setBootProgress?.(0.54, '加载地块数据…');
    await this.loadOverview();
    await this.refreshSimulatorStatus(true);
    this.farmMonitor = new FarmMonitor({
      plots: this.state.plots,
      onExit: () => this.navigate('home'),
      onSandbox: (plotId) => {
        this.state.currentPlotId = plotId;
      }
    });
    this.riumBackground?.setBootProgress?.(0.72, '初始化仪表盘…');
    // 仪表盘渲染为非关键路径：任一子步骤抛错也不能让加载动画永久卡住。
    try {
      this.renderPlots();
      this.renderFeed();
      this.renderChangelog();
      this.renderHomeSummary();
      syncWaterVisuals(document);
      this.handleRoute();
      window.addEventListener('hashchange', () => this.handleRoute());
    } catch (renderErr) {
      console.error('[AgriLoop] dashboard render failed; continuing with loading teardown', renderErr);
    }

    this.riumBackground?.setBootProgress?.(1, '就绪');
    try {
      await this.riumBackground?.waitUntilBootProgress?.(0.94);
      this.riumBackground?.revealFromBoot?.();
    } catch (_) { /* ignore */ }
    const appLoading = document.getElementById('appLoading');
    if (appLoading) {
      appLoading.classList.add('hidden');
      setTimeout(() => appLoading.remove(), 900);
    }
    document.documentElement.classList.remove('is-booting');
  }

  cacheDom() {
    this.dom.headerCurrentView = document.getElementById('headerCurrentView');
    this.dom.systemStatusPill = document.getElementById('systemStatusPill');
    this.dom.systemStatusText = document.getElementById('systemStatusText');
    this.dom.rightAiModeTag = document.getElementById('rightAiModeTag');
    this.dom.userDisplayName = document.getElementById('userDisplayName');
    this.dom.userAvatar = document.getElementById('userAvatar');
    this.dom.btnUserMenu = document.getElementById('btnUserMenu');
    this.dom.copilotConnectionStatus = document.getElementById('copilotConnectionStatus');
    this.dom.btnCopilotLogin = document.getElementById('btnCopilotLogin');
    this.dom.plotSliderTrack = document.getElementById('plotSliderTrack');
    this.dom.workspacePlotContext = document.getElementById('workspacePlotContext');
    this.dom.plotsCountTag = document.getElementById('plotsCountTag');
    this.dom.plotSearchInput = document.getElementById('plotSearchInput');
    this.dom.globalSearchInput = document.getElementById('globalSearchInput');
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
    this.dom.modalIcon = document.getElementById('modalIcon');
    this.dom.modalTitle = document.getElementById('modalTitle');
    this.dom.modalTag = document.getElementById('modalTag');
    this.dom.modalDynamicContent = document.getElementById('modalDynamicContent');
    this.dom.toastContainer = document.getElementById('toastContainer');
    this.dom.btnLogoHome = document.getElementById('btnLogoHome');
    this.dom.btnViewResourceDetail = document.getElementById('btnViewResourceDetail');
    this.dom.btnQuickAction = document.getElementById('btnQuickAction');
    this.dom.simulatorStatusTag = document.getElementById('simulatorStatusTag');
    this.dom.simulatorStatusText = document.getElementById('simulatorStatusText');
    this.dom.simulatorStatusHint = document.getElementById('simulatorStatusHint');
    this.dom.btnToggleSimulator = document.getElementById('btnToggleSimulator');
    this.dom.btnRefreshSimulator = document.getElementById('btnRefreshSimulator');
    this.dom.plotTelemetryPanel = document.getElementById('plotTelemetryPanel');
    this.dom.decisionFeedPanel = document.getElementById('decisionFeedPanel');
    this.dom.btnDecisionFeedBackHome = document.getElementById('btnDecisionFeedBackHome');
    this.dom.homeFeedContent = document.getElementById('homeFeedContent');
    this.dom.moduleContentPanel = document.getElementById('moduleContentPanel');
    this.dom.moduleContentBody = document.getElementById('moduleContentBody');
    this.dom.appContainer = document.querySelector('.app-container');
    this.dom.btnToggleRightRail = document.getElementById('btnToggleRightRail');
    if (this.dom.plotTelemetryPanel) this.plotTelemetryView?.bind(this.dom.plotTelemetryPanel);
  }

  initRightRailCollapse() {
    let collapsed = false;
    try {
      collapsed = localStorage.getItem('agriloop-right-rail-collapsed') === '1';
    } catch {
      collapsed = false;
    }
    this.state.rightRailCollapsed = collapsed;
    this.applyRightRailCollapsed(collapsed);
  }

  setRightRailCollapsed(collapsed) {
    this.state.rightRailCollapsed = collapsed;
    this.applyRightRailCollapsed(collapsed);
    try {
      localStorage.setItem('agriloop-right-rail-collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore storage failures */
    }
  }

  applyRightRailCollapsed(collapsed) {
    this.dom.appContainer?.classList.toggle('right-rail-collapsed', collapsed);
    const btn = this.dom.btnToggleRightRail;
    if (!btn) return;
    btn.style.cssText = '';
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.title = collapsed ? '展开系统状态面板' : '收起系统状态面板';
    const label = btn.querySelector('.right-rail-toggle-text');
    if (label) label.textContent = collapsed ? '展开状态' : '收回';
  }

  bindEvents() {
    // Logo Click -> Go to Home
    this.dom.btnLogoHome?.addEventListener('click', () => this.navigate('home'));

    // Quick Action button
    this.dom.btnQuickAction?.addEventListener('click', () => {
      this.openSubview('decision-console', { plotId: this.state.currentPlotId });
    });

    this.dom.btnToggleSimulator?.addEventListener('click', () => this.toggleSimulator());
    this.dom.btnRefreshSimulator?.addEventListener('click', () => this.refreshSimulatorStatus());
    this.dom.btnDecisionFeedBackHome?.addEventListener('click', () => this.navigate('home'));
    this.dom.btnToggleRightRail?.addEventListener('click', () => {
      this.setRightRailCollapsed(!this.state.rightRailCollapsed);
    });

    // Resource schedule click
    this.dom.btnViewResourceDetail?.addEventListener('click', () => {
      this.openSubview('resource-coordination');
    });

    // Authentication entry points
    this.dom.btnUserMenu?.addEventListener('click', () => {
      redirectToLogin();
    });
    this.dom.btnCopilotLogin?.addEventListener('click', () => {
      redirectToLogin();
    });

    // Search input filter for plots
    this.dom.plotSearchInput?.addEventListener('input', (e) => {
      this.filterPlots(e.target.value);
    });

    // ⌘K / Ctrl+K / "/" 交给 yyx 命令面板；这里仅负责 Escape 关闭本应用弹窗。
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
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
      } else if (view === 'plot-telemetry') {
        this.showPlotTelemetryView(this.state.currentPlotId);
      } else if (view === 'decision-feed') {
        this.showDecisionFeedView();
      } else if (PLOT_INDEPENDENT_VIEWS.has(view)) {
        this.openSubview(view);
      } else {
        this.openSubview(view, { plotId: this.state.currentPlotId });
      }
    });

    // Close Modal Button
    this.dom.btnCloseModal?.addEventListener('click', () => this.closeModal());
    this.dom.subviewModal?.addEventListener('click', (e) => {
      if (e.target === this.dom.subviewModal) this.closeModal();
    });
  }

  async loadOverview() {
    if (this.state.isLive && !api.isAuthenticated()) return;
    try {
      const overview = await api.getOverview();
      if (overview && overview.plots) {
        this.state.plots = overview.plots.map(plot => this.normalizePlot(plot));
      }
      this.state.backendAiMode = overview?.aiMode || this.state.backendAiMode;
    } catch (e) {
      if (e.status === 401 || e.code === 'AUTH_REQUIRED' || e.code === 'AUTH_INVALID') {
        this.handleSessionExpired(false);
      } else if (this.state.isLive) {
        this.showToast('读取后端总览失败：' + e.message, 'error');
      }
    }
  }

  async refreshSimulatorStatus(silent = false) {
    if (!this.state.isLive || !api.isAuthenticated()) {
      this.state.simulator = { available: false, status: 'UNAVAILABLE', reason: 'AUTH_REQUIRED' };
      this.renderSimulatorControl();
      return this.state.simulator;
    }
    try {
      this.state.simulator = await api.getSimulatorStatus();
      this.renderSimulatorControl();
      return this.state.simulator;
    } catch (e) {
      if (e.status === 401 || e.code === 'AUTH_REQUIRED' || e.code === 'AUTH_INVALID') this.handleSessionExpired(false);
      this.state.simulator = { available: false, status: 'UNAVAILABLE', reason: e.code || 'STATUS_FAILED' };
      this.renderSimulatorControl();
      if (!silent) this.showToast(`读取模拟器状态失败：${e.message || '后端未响应'}`, 'error');
      return this.state.simulator;
    }
  }

  renderSimulatorControl() {
    const tag = this.dom.simulatorStatusTag;
    const text = this.dom.simulatorStatusText;
    const hint = this.dom.simulatorStatusHint;
    const toggle = this.dom.btnToggleSimulator;
    const refresh = this.dom.btnRefreshSimulator;
    if (!tag || !text || !hint || !toggle) return;

    const user = this.state.user;
    const isAdmin = ['FARM_ADMIN', 'SYSTEM_ADMIN'].includes(String(user?.role || '').toUpperCase());
    const simulator = this.state.simulator || {};
    const status = String(simulator.status || 'UNAVAILABLE').toUpperCase();
    const running = status === 'RUNNING';
    const available = simulator.available !== false && status !== 'UNAVAILABLE';

    tag.className = 'simulator-status-tag';
    tag.classList.toggle('running', running);
    tag.classList.toggle('stopped', status === 'STOPPED');
    tag.classList.toggle('unavailable', !available || status === 'FATAL' || status === 'EXITED');
    tag.textContent = !this.state.isLive || !user ? '需登录' : (running ? 'RUNNING' : status);

    if (!this.state.isLive || !user) {
      text.textContent = '登录后查看状态';
      hint.textContent = '仅管理员可以启动或停止服务器模拟器。';
    } else if (!available) {
      text.textContent = '模拟器控制不可用';
      hint.textContent = '当前运行环境没有可用的 Supervisor 控制服务。';
    } else if (running) {
      text.textContent = '模拟器运行中';
      hint.textContent = '正在通过 MQTT 为 3 个演示地块发送遥测。';
    } else {
      text.textContent = '模拟器已停止';
      hint.textContent = '启动后会恢复设备心跳和实时遥测。';
    }

    toggle.disabled = !this.state.isLive || !user || !isAdmin || !available;
    toggle.classList.toggle('stop', running);
    toggle.textContent = running ? '停止' : '启动';
    toggle.title = isAdmin ? (running ? '停止服务器上的数据模拟器' : '启动服务器上的数据模拟器') : '需要农场管理员或系统管理员权限';
    toggle.setAttribute('aria-pressed', String(running));
    if (refresh) refresh.disabled = !this.state.isLive || !user;
  }

  async toggleSimulator() {
    if (!api.isAuthenticated()) {
      redirectToLogin();
      return;
    }
    const role = String(this.state.user?.role || '').toUpperCase();
    if (!['FARM_ADMIN', 'SYSTEM_ADMIN'].includes(role)) {
      this.showToast('只有农场管理员或系统管理员可以控制模拟器。', 'error');
      return;
    }
    const running = String(this.state.simulator?.status || '').toUpperCase() === 'RUNNING';
    const button = this.dom.btnToggleSimulator;
    if (button) {
      button.disabled = true;
      button.textContent = running ? '停止中…' : '启动中…';
    }
    try {
      if (running) {
        await api.stopSimulator();
        this.showToast('模拟器已停止；设备将在数据过期后显示离线。', 'success');
      } else {
        await api.startSimulator();
        this.showToast('模拟器已启动，正在恢复 MQTT 遥测。', 'success');
      }
      await this.refreshSimulatorStatus(true);
      window.setTimeout(async () => {
        try {
          await this.loadOverview();
          this.renderPlots(this.dom.plotSearchInput?.value || '');
        } catch (e) {
          console.warn('[AgriLoop] 刷新模拟器遥测失败。', e);
        }
      }, 2500);
    } catch (e) {
      if (e.status === 401 || e.code === 'AUTH_REQUIRED' || e.code === 'AUTH_INVALID') this.handleSessionExpired();
      else this.showToast(`模拟器操作失败：${e.message || '后端未响应'}`, 'error');
    } finally {
      await this.refreshSimulatorStatus(true);
    }
  }

  normalizePlot(plot) {
    const fallback = MOCK_DATA.plots.find(item => item.plotId === plot?.plotId) || MOCK_DATA.plots[0];
    const metrics = { ...(fallback?.metrics || {}) };
    const latest = plot?.latest || {};
    Object.entries(latest).forEach(([metric, event]) => {
      if (!event || event.value === undefined || event.value === null) return;
      const base = metrics[metric] || { label: metric, target: '—' };
      metrics[metric] = {
        ...base,
        value: Number(event.value),
        unit: event.unit || base.unit || '',
        status: event.quality?.status || base.status || 'GOOD',
        ts: event.ts || event.timestamp
      };
    });
    const device = plot?.device || {};
    return {
      ...fallback,
      ...plot,
      cropName: plot?.cropName || fallback?.cropName || plot?.cropCode || '作物',
      stageLabel: plot?.stageLabel || fallback?.stageLabel || '当前阶段',
      metrics,
      deviceId: device.deviceId || fallback?.deviceId,
      deviceStatus: device.status || fallback?.deviceStatus || 'UNKNOWN',
      healthScore: device.healthScore ?? fallback?.healthScore,
      lastSeen: device.lastSeen || fallback?.lastSeen
    };
  }

  updateSystemStatusPill() {
    if (this.state.isLive) {
      this.dom.systemStatusText.textContent = api.isAuthenticated() ? "后端在线 · 已登录" : "后端在线 · 需要登录";
      this.dom.systemStatusPill?.querySelector('.dot')?.style.setProperty('backgroundColor', "var(--green-bright)");
      const mode = this.state.backendAiMode || 'openai-compatible';
      this.dom.rightAiModeTag.textContent = api.isAuthenticated()
        ? (mode === 'openai-compatible' ? 'Qwen3.8-27B · 已连接' : `${mode} · 已连接`)
        : 'AI 需登录';
    } else {
      this.dom.systemStatusText.textContent = "本地演示数据 · 后端离线";
      this.dom.systemStatusPill?.querySelector('.dot')?.style.setProperty('backgroundColor', "var(--amber-primary)");
      this.dom.rightAiModeTag.textContent = "本地 mock";
    }
  }

  syncAuthState() {
    this.state.authenticated = api.isAuthenticated();
    this.state.user = api.getUser();
    const user = this.state.user;
    if (this.dom.userDisplayName) this.dom.userDisplayName.textContent = user?.username || '未登录';
    if (this.dom.userAvatar) this.dom.userAvatar.textContent = user ? '🧑‍🌾' : '🔐';
    if (this.dom.btnUserMenu) {
      this.dom.btnUserMenu.title = user
        ? `${user.username} · ${user.role || '已登录'} · 点击退出`
        : '登录后使用真实 Agent';
    }
    if (this.dom.copilotConnectionStatus) {
      const connected = Boolean(user && this.state.isLive);
      this.dom.copilotConnectionStatus.classList.toggle('connected', connected);
      this.dom.copilotConnectionStatus.textContent = connected
        ? '已登录 · Copilot 将调用服务器上的 Qwen3.8-27B'
        : (this.state.isLive ? '登录后连接服务器上的 Qwen3.8-27B' : '后端离线 · 当前为本地演示数据');
    }
    if (this.dom.btnCopilotLogin) this.dom.btnCopilotLogin.textContent = user ? '退出' : '登录';
    this.renderSimulatorControl();
  }

  handleSessionExpired() {
    redirectToLogin();
  }

  isPlotContextVisible(viewName = this.state.activeMainView) {
    return !PLOT_INDEPENDENT_VIEWS.has(viewName);
  }

  updatePlotContextVisibility(viewName = this.state.activeMainView) {
    const visible = this.isPlotContextVisible(viewName);
    if (this.dom.workspacePlotContext) {
      this.dom.workspacePlotContext.hidden = !visible;
    }
  }

  getCropEmoji(cropCode) {
    const map = {
      tomato: '🍅',
      cucumber: '🥒',
      corn: '🌽',
      rice: '🌾',
      sunflower: '🌻',
      strawberry: '🍓',
      pepper: '🌶️',
    };
    return map[cropCode] || '🌱';
  }

  renderPlots(filterKeyword = '') {
    if (!this.dom.plotSliderTrack) return;
    const filtered = this.state.plots.filter(p => {
      const match = (p.name + p.cropName + p.cropVariety + p.plotId).toLowerCase();
      return match.includes(filterKeyword.toLowerCase());
    });

    if (this.dom.plotsCountTag) {
      this.dom.plotsCountTag.textContent = `${filtered.length} 个地块`;
    }

    this.dom.plotSliderTrack.innerHTML = filtered.map(plot => {
      const isActive = plot.plotId === this.state.currentPlotId;
      const moisture = plot.metrics.SOIL_MOISTURE.value;
      const isWarn = moisture < 20.0;

      return `
        <button type="button"
          class="plot-slider-item ${isActive ? 'active' : ''} ${isWarn ? 'has-warn' : ''}"
          data-plot-id="${plot.plotId}"
          role="tab"
          aria-selected="${isActive}">
          <span class="plot-slider-emoji">${this.getCropEmoji(plot.cropCode)}</span>
          <span class="plot-slider-name">${plot.name}</span>
          <span class="plot-slider-meta">${plot.cropName} · 湿度 ${moisture}%</span>
        </button>
      `;
    }).join('');

    this.dom.plotSliderTrack.querySelectorAll('.plot-slider-item').forEach(item => {
      item.addEventListener('click', () => {
        const plotId = item.dataset.plotId;
        if (plotId) this.selectPlot(plotId);
      });
    });
  }

  filterPlots(keyword) {
    this.renderPlots(keyword);
  }

  selectPlot(plotId, options = {}) {
    const plot = this.state.plots.find(p => p.plotId === plotId);
    if (!plot) {
      if (!options.silent) this.showToast(`未找到地块：${plotId}`, 'error');
      return;
    }

    const plotChanged = this.state.currentPlotId !== plotId;
    this.state.currentPlotId = plotId;
    this.renderPlots(this.dom.plotSearchInput?.value || '');
    this.renderHomeSummary();

    // 左侧地块是整个工作台的上下文选择器。切换后必须让当前右侧视图
    // 重新接收 plotId，避免模块继续显示打开时捕获的旧地块数据。
    if (plotChanged && options.syncView !== false) {
      this.syncActiveViewToPlot(plotId);
    }
    if (!options.silent) {
      this.showToast(`已切换当前工作地块至：${plot.name}`, 'info');
    }
  }

  syncActiveViewToPlot(plotId) {
    const viewName = this.state.activeMainView || 'home';
    if (PLOT_INDEPENDENT_VIEWS.has(viewName)) return;

    if (viewName === 'plot-telemetry') {
      this.showPlotTelemetryView(plotId);
      return;
    }
    this.openSubview(viewName, { plotId });
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
    if (this.state.isLive && !api.isAuthenticated()) {
      redirectToLogin();
      return;
    }
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = `<span>⏳ 正在通过 MQTT 指令下发...</span>`;
    }

    this.showToast('正在向 MQTT Broker 下发虚拟灌溉控制指令...', 'info');

    try {
      const result = await api.executeIrrigation(planId, plotId);

      setTimeout(() => {
        if (triggerBtn) {
          triggerBtn.disabled = false;
          triggerBtn.innerHTML = `<span>✓ 指令已 ACK 执行 (已补水 153L)</span>`;
          triggerBtn.className = 'btn btn-secondary';
        }

        // Update plot soil moisture in state to reflect the closed loop
        const plot = this.state.plots.find(p => p.plotId === plotId);
        if (plot) {
          plot.metrics.SOIL_MOISTURE.value = 29.8;
          plot.metrics.SOIL_MOISTURE.status = "NORMAL";
          plot.riskLevel = "LOW";
        }
        this.renderPlots(this.dom.plotSearchInput?.value || '');

        this.showToast(`【${plot ? plot.name : plotId}】虚拟灌溉执行完毕！ACK 状态：SUCCEEDED，土壤湿度由 16.8% 回升至 29.8%`, 'success');
      }, 1000);
    } catch (e) {
      this.showToast('下发指令失败: ' + e.message, 'error');
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = `<span>⚡ 重试下发</span>`;
      }
    }
  }

  async generatePrescriptionAction(plotId) {
    if (this.state.isLive && !api.isAuthenticated()) {
      redirectToLogin();
      return;
    }
    this.showToast(`正在基于【${plotId}】Crop Pack 模型生成精准处方...`, 'info');
    try {
      const chatResult = await api.agentChat('生成灌溉处方', plotId);
      this.displayCopilotBanner(chatResult);
    } catch (e) {
      if (e.status === 401) this.handleSessionExpired();
      else this.showToast('处方生成失败：' + e.message, 'error');
    }
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

    if (this.state.isLive && !api.isAuthenticated()) {
      redirectToLogin();
      return;
    }

    this.dom.btnSendCopilot.disabled = true;
    this.dom.btnSendCopilot.innerHTML = `<span>⏳ 分析中...</span>`;
    // Do not leave the previous answer visible while a new model request is
    // pending; that made a fresh query look as if it had already completed.
    this.dom.copilotOutputBanner?.classList.add('active');
    if (this.dom.copilotOutputTitle) this.dom.copilotOutputTitle.textContent = '🤖 正在读取最新数据';
    if (this.dom.copilotOutputText) this.dom.copilotOutputText.textContent = '正在结合遥测、规则和作物知识生成回答…';
    if (this.dom.copilotTraceId) this.dom.copilotTraceId.textContent = '请求处理中';

    try {
      const response = await api.agentChat(query, this.state.currentPlotId);
      this.displayCopilotBanner(response);
    } catch (e) {
      if (e.status === 401) {
        this.handleSessionExpired();
      } else {
        this.showToast('Agent 协同异常: ' + e.message, 'error');
      }
    } finally {
      this.dom.btnSendCopilot.disabled = false;
      this.dom.btnSendCopilot.innerHTML = `<span>✨ 智能分析</span>`;
    }
  }

  /**
   * Defense in depth for model responses. The API removes Qwen reasoning blocks,
   * but the browser also sanitizes responses so an older backend or a mock
   * adapter can never render internal prompts/metadata as user-facing text.
   */
  sanitizeNarrative(value) {
    let text = String(value || '').replace(/\r/g, '').trim();
    for (const [open, close] of [['<think>', '</think>'], ['<thinking>', '</thinking>'], ['<|thinking|>', '<|/thinking|>']]) {
      while (text.toLowerCase().includes(open)) {
        const lower = text.toLowerCase();
        const start = lower.indexOf(open);
        const end = lower.indexOf(close, start + open.length);
        if (end < 0) {
          text = text.slice(0, start).trim();
          break;
        }
        text = `${text.slice(0, start)}${text.slice(end + close.length)}`.trim();
      }
    }
    const leakage = /(traceid|sourcelabels|knowledgeevidence|adapter\s*:|intent\s*:|用户问题：|系统提示：|不得生成|工具入参|工具出参|<think>)/i;
    const lines = [];
    for (const line of text.split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.toLowerCase() === '</think>') {
        if (lines.length && lines[lines.length - 1] !== '') lines.push('');
        continue;
      }
      if (!leakage.test(trimmed)) lines.push(trimmed);
    }
    while (lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  formatKnowledgeEvidence(evidence) {
    const labels = { PLOT: '地块知识', CROP: '作物规则', GENERAL: '通用安全规则', REGION: '地区知识', STAGE: '阶段知识' };
    return (evidence || []).map(item => labels[item.scope] || '检索知识').filter(Boolean);
  }

  displayModelName(response) {
    const model = response?.llm?.model || 'Qwen3.8-27B';
    return model === 'agriloop-qwen38-agri' ? 'Qwen3.8-27B · 农智适配器' : model;
  }

  displayCopilotBanner(response) {
    if (!this.dom.copilotOutputBanner) return;
    this.dom.copilotOutputBanner.classList.add('active');
    // Trace IDs remain available through the decision-passport/audit APIs, but
    // are deliberately not shown in the conversational answer area.
    this.dom.copilotTraceId.textContent = response.traceId ? '已保存审计记录' : '演示记录';

    const hasQwenNarrative = response.adapter === 'openai-compatible'
      && Boolean(response.narrative)
      && response.degraded !== true;
    const title = hasQwenNarrative
      ? `🤖 Qwen3.8-27B 实时回答`
      : response.adapter === 'rules-fast-path'
        ? `🤝 农智助手快捷回复`
      : response.degraded
        ? `🛡️ 规则引擎回答 · AI 已降级`
        : `🤖 AgriLoop Agent 协同结果`;
    this.dom.copilotOutputTitle.textContent = title;

    if (this.dom.copilotConnectionStatus) {
      this.dom.copilotConnectionStatus.classList.toggle('connected', hasQwenNarrative);
      if (hasQwenNarrative) {
        const model = this.displayModelName(response);
        this.dom.copilotConnectionStatus.textContent = `已连接 · ${model} · 规则事实 + 模型解释`;
      } else if (response.degraded) {
        this.dom.copilotConnectionStatus.textContent = `后端在线 · ${response.degradationReason || 'AI 降级'} · 规则结果仍可用`;
      }
    }
    if (hasQwenNarrative) this.dom.rightAiModeTag.textContent = `${this.displayModelName(response)} · 已连接`;

    let citations = '';
    const evidenceLabels = this.formatKnowledgeEvidence(response.knowledgeEvidence);
    if (evidenceLabels.length > 0) citations = `\n\n📚 依据：${[...new Set(evidenceLabels)].join(' · ')}`;

    const body = this.sanitizeNarrative(response.narrative || response.summary || '后端未返回可展示的回答。')
      || '后端未返回可展示的回答。';
    const metadata = response.llm
      ? `\n\n模型：${this.displayModelName(response)} · 延迟：${response.llm.latencyMs ?? '—'} ms`
      : '';
    const degradation = response.degraded
      ? `\n\n⚠️ ${response.degradationReason || 'AI_DEPENDENCY_UNAVAILABLE_FALLBACK'}：以上为规则/工具结果，不是模型生成文本。`
      : '';
    this.dom.copilotOutputText.textContent = body + metadata + degradation + citations;
    this.dom.copilotOutputBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  renderChangelog() {
    if (!this.dom.changelogContainer) return;
    this.dom.changelogContainer.innerHTML = MOCK_DATA.changelog.map(item => `
      <li class="changelog-item">
        <span class="changelog-time">${item.time} · <span class="dep-tag" style="padding: 0 4px;">${item.tag}</span></span>
        <span class="changelog-title">${item.title}</span>
        <span style="color: var(--text-secondary); font-size: 11px; margin-top: 2px;">${item.content}</span>
      </li>
    `).join('');
  }

  /** 主面板方形快捷卡：农务/动态/风险/用水 + 作物手册/经营收益/情景模拟。 */
  renderHomeSummary() {
    const grid = document.getElementById('homeSummaryGrid');
    const toolsGrid = document.getElementById('homeSummaryToolsGrid');
    if (!grid || !toolsGrid) return;
    const plots = this.state.plots || MOCK_DATA.plots;
    const pendingTasks = (MOCK_DATA.workOrders || []).filter((item) => item.status !== 'DONE');
    const urgentTasks = pendingTasks.filter((item) => item.priority === 'HIGH');
    const feedCount = (this.state.feedItems || MOCK_DATA.feedItems || []).length;
    const atRiskPlots = plots.filter((plot) => {
      const level = String(plot.riskLevel || 'LOW').toUpperCase();
      if (level === 'HIGH' || level === 'MEDIUM') return true;
      return Object.values(plot.metrics || {}).some((metric) =>
        ['WARN', 'ALERT', 'CRITICAL'].includes(String(metric.status || '').toUpperCase())
      );
    });
    const water = getResourceWaterState();
    const remaining = Math.round(Number(water.remainingLitres || 0));
    const used = Math.round(Number(water.usedTodayLitres || 0));
    const remainingPct = Math.round(Number(water.remainingPercent || 0));
    const remainingDisplay = `${remaining.toLocaleString('zh-CN')}L`;
    const waterTone = Number(water.remainingPercent || 0) < 60 ? 'warn' : 'ok';
    const riskTone = atRiskPlots.length ? 'danger' : 'ok';
    const taskTone = urgentTasks.length ? 'warn' : pendingTasks.length ? 'ok' : '';
    const badgeText = feedCount > 99 ? '99+' : String(feedCount);
    const riskNames = atRiskPlots.slice(0, 2).map((plot) => this.escapeHtml(plot.name)).join('、');
    const cropCatalog = MOCK_DATA.cropPackDetails || MOCK_DATA.cropPacks || [];
    const cropSpeciesCount = cropCatalog.length;
    const ledgerSummary = MOCK_DATA.valueLedger?.summary || {};
    const totalSavedRmb = Number(ledgerSummary.totalSavedRmb || 0);
    const valueDisplay = `¥${totalSavedRmb.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const scenarioCount = (MOCK_DATA.riskForecastConfig?.scenarioCatalog || []).length;
    const telemetryMetricCount = 6;
    const plotCount = plots.length;

    grid.innerHTML = `
      <button type="button" class="home-summary-card" data-view="work-orders" data-role="home-task-card" title="打开今日农务">
        <span class="hs-icon" aria-hidden="true">📋</span>
        <span class="hs-title">任务提示</span>
        <strong class="hs-value ${taskTone}">${pendingTasks.length}</strong>
        <span class="hs-sub">${pendingTasks.length
          ? `待处理工单${urgentTasks.length ? ` · ${urgentTasks.length} 项紧急` : ''}`
          : '今日暂无待办'}</span>
      </button>
      <button type="button" class="home-summary-card" data-view="decision-feed" data-role="home-feed-card" title="打开关键动态消息">
        <span class="hs-icon-wrap">
          <span class="hs-icon" aria-hidden="true">📡</span>
          ${feedCount ? `<span class="hs-badge" aria-label="${feedCount} 条动态消息">${badgeText}</span>` : ''}
        </span>
        <span class="hs-title">动态消息</span>
        <strong class="hs-value">${feedCount}</strong>
        <span class="hs-sub">${feedCount ? '诊断、处方与农务闭环动态' : '暂无新消息'}</span>
      </button>
      <button type="button" class="home-summary-card" data-view="risk-forecast" data-role="home-risk-card" title="打开风险预测">
        <span class="hs-icon" aria-hidden="true">⚠️</span>
        <span class="hs-title">风险地块</span>
        <strong class="hs-value ${riskTone}">${atRiskPlots.length}</strong>
        <span class="hs-sub">${atRiskPlots.length ? `${riskNames} 需关注` : '当前无风险地块'}</span>
      </button>
      <button type="button" class="home-summary-card" data-view="resource-coordination" data-role="home-water-card" title="打开用水资源协同排程">
        <span class="hs-icon" aria-hidden="true">💧</span>
        <span class="hs-title">用水协同</span>
        <strong class="hs-value ${waterTone}">${remainingDisplay}</strong>
        <span class="hs-sub">已用 ${used.toLocaleString('zh-CN')}L · 余 ${remainingPct}%</span>

      </button>`;

    toolsGrid.innerHTML = `
      <button type="button" class="home-summary-card" data-view="plot-telemetry" data-role="home-telemetry-card" title="打开地块数据监测">
        <span class="hs-icon" aria-hidden="true">📈</span>
        <span class="hs-title">数据监测</span>
        <strong class="hs-value ok">${telemetryMetricCount}</strong>
        <span class="hs-sub">${plotCount} 块地 · ${telemetryMetricCount} 项指标时序与偏离风险</span>
      </button>
      <button type="button" class="home-summary-card" data-view="crop-packs" data-role="home-crop-manual-card" title="打开作物培养指导">
        <span class="hs-icon" aria-hidden="true">📦</span>
        <span class="hs-title">作物手册</span>
        <strong class="hs-value ok">${cropSpeciesCount}</strong>
        <span class="hs-sub">已收录 ${cropSpeciesCount} 种作物培养资料</span>
      </button>
      <button type="button" class="home-summary-card" data-view="scenario-replay" data-role="home-scenario-card" title="打开情景模拟与双轨回放">
        <span class="hs-icon" aria-hidden="true">⚡</span>
        <span class="hs-title">情景模拟</span>
        <strong class="hs-value">${scenarioCount || 5}</strong>
        <span class="hs-sub">${scenarioCount ? `${scenarioCount} 种情景可一键双轨推演` : '干旱/热浪/暴雨等情景推演'}</span>
      </button>
      <button type="button" class="home-summary-card" data-view="value-ledger" data-role="home-value-card" title="打开经营价值与效益对账">
        <span class="hs-icon" aria-hidden="true">💰</span>
        <span class="hs-title">经营收益</span>
        <strong class="hs-value ok">${valueDisplay}</strong>
        <span class="hs-sub">本期综合折算价值 · 节水节电与工时</span>
      </button>`;

    const panel = document.getElementById('homeSummaryPanel') || grid.parentElement;
    panel?.querySelectorAll('.home-summary-card').forEach((card) => {
      card.addEventListener('click', () => {
        const view = card.dataset.view;
        if (view === 'risk-forecast' && atRiskPlots[0]) {
          this.navigate(view, { plotId: atRiskPlots[0].plotId });
          return;
        }
        if (view === 'plot-telemetry') {
          this.showPlotTelemetryView(this.state.currentPlotId);
          return;
        }
        if (view === 'scenario-replay') {
          this.navigate(view, { plotId: this.state.currentPlotId });
          return;
        }
        this.navigate(view);
      });
    });
  }

  /**
   * Router and Sub-view modal/drawer controller
   */
  handleRoute() {
    const hash = window.location.hash;
    // 幂等：同一 hash 重复派发（pushState + 浏览器自动/手动事件）只处理一次
    if (hash === this._lastHandledHash) return;
    this._lastHandledHash = hash;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const view = params.get('view');
    const plotId = params.get('plotId') || this.state.currentPlotId;

    if (view === 'plot-telemetry') {
      this.showPlotTelemetryView(plotId, { updateHash: false });
    } else if (view === 'decision-feed') {
      this.showDecisionFeedView({ updateHash: false });
    } else if (view === 'plot-detail') {
      void this.openFarmMonitor(plotId, { updateHash: false, skipTransition: true });
    } else if (view && view !== 'home') {
      const plotIndependent = PLOT_INDEPENDENT_VIEWS.has(view);
      this.openSubview(view, plotIndependent ? {} : { plotId, updateHash: false });
    } else {
      this.closeModal(false);
      this.showHomeView({ updateHash: false });
    }
  }

  /**
   * 更新 URL hash 而不触发浏览器锚点滚动：
   * location.hash 赋值会执行锚点定位，把主页 window 滚动位置重置；
   * history.pushState/replaceState 只改 URL（不滚动），再手动派发 hashchange。
   * jsdom 等环境 pushState 不更新 location.hash 时兜底赋值（该环境无布局，无滚动副作用）。
   */
  _setHash(hashStr, replace = false) {
    const base = window.location.href.split('#')[0];
    const url = hashStr ? `${base}#${hashStr}` : base;
    if (replace) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
    const expect = hashStr ? `#${hashStr}` : '';
    if (window.location.hash !== expect) {
      window.location.hash = expect;
    }
    // 手动派发，驱动 handleRoute（幂等去重防重复渲染）
    const HashChange = window.HashChangeEvent || window.Event;
    window.dispatchEvent(new HashChange('hashchange'));
  }

  navigate(viewName, params = {}) {
    if (viewName === 'home') {
      this._setHash('', true);
      this.closeModal(false);
      this.showHomeView({ updateHash: false });
    } else {
      this._setHash(new URLSearchParams({ view: viewName, ...params }).toString());
    }
  }

  openSubview(viewName, options = {}) {
    const plotIndependent = PLOT_INDEPENDENT_VIEWS.has(viewName);
    const plotId = plotIndependent ? this.state.currentPlotId : (options.plotId || this.state.currentPlotId);
    if (!plotIndependent && options.plotId && options.plotId !== this.state.currentPlotId) {
      this.selectPlot(options.plotId, { silent: true, syncView: false });
    }
    if (viewName === 'plot-detail') {
      void this.openFarmMonitor(options.plotId || this.state.currentPlotId, options);
      return;
    }

    this.farmMonitor?.close(false);
    this.riumBackground?.setVisible(true);
    this.plotTelemetryView?.close();
    this.cleanupActiveSubview();
    const plot = this.state.plots.find(p => p.plotId === plotId) || this.state.plots[0];
    this.dom.subviewModal.classList.remove('active');
    if (this.dom.homeFeedContent) this.dom.homeFeedContent.hidden = true;
    if (this.dom.plotTelemetryPanel) this.dom.plotTelemetryPanel.hidden = true;
    if (this.dom.decisionFeedPanel) this.dom.decisionFeedPanel.hidden = true;
    if (this.dom.moduleContentPanel) {
      this.dom.moduleContentPanel.hidden = false;
      this.dom.moduleContentPanel.classList.add('is-headerless');
    }
    this.state.activeMainView = viewName;
    this.updatePlotContextVisibility(viewName);

    // yyx 增强模块：异步渲染完整预测/回放/价值/Crop Pack 视图。
    const renderer = SUBVIEW_RENDERERS[viewName];
    this._subviewGen = (this._subviewGen || 0) + 1;
    const viewGen = this._subviewGen;
    const body = this.dom.moduleContentBody;
    if (!body) {
      console.error('[AgriLoop] moduleContentBody missing; cannot render', viewName);
      return;
    }

    // 视图切换淡出
    body.classList.add('agri-view-leaving');

    const triggerEnter = () => {
      body.classList.remove('agri-view-leaving');
      body.classList.remove('agri-view-enter');
      void body.offsetWidth;
      body.classList.add('agri-view-enter');
    };

    if (renderer) {
      body.innerHTML = '<div class="agri-module-loading">正在加载功能模块…</div>';
      triggerEnter();
      Promise.resolve(renderer(body, plotId, this)).then(cleanup => {
        if (viewGen !== this._subviewGen) {
          if (typeof cleanup === 'function') cleanup();
          return;
        }
        if (typeof cleanup === 'function') this._activeSubviewCleanup = cleanup;
        triggerEnter();
      }).catch(error => {
        if (viewGen !== this._subviewGen) return;
        console.error(`[AgriLoop] module ${viewName} failed:`, error);
        body.innerHTML = `<div class="agri-alert agri-alert-danger"><div class="agri-alert-icon">⚠️</div><div><strong>模块加载失败</strong><p>${this.escapeHtml(String(error?.message || error))}</p></div></div>`;
        triggerEnter();
      });
    } else {
      this.renderSubviewContextualContent(viewName, plot, body);
      triggerEnter();
    }

    const viewMeta = MOCK_DATA.subviewsMeta?.[viewName];
    this.dom.headerCurrentView.textContent = (viewMeta?.title || viewName).split(/[(（]/)[0].trim();

    // Highlight left nav item
    document.querySelectorAll('.module-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    // 打开弹窗前保存主页滚动位置（关闭时恢复，避免回到初始位置）
    if (this._savedScrollPos === null) {
      this._savedScrollPos = { x: window.scrollX || 0, y: window.scrollY || 0 };
    }
    document.getElementById('mainFeedArea')?.scrollTo?.({ top: 0, behavior: 'smooth' });

    if (options.updateHash !== false) {
      const params = { view: viewName };
      if (!plotIndependent) params.plotId = plotId;
      this._setHash(new URLSearchParams(params).toString());
    }
  }

  cleanupActiveSubview() {
    this._subviewGen = (this._subviewGen || 0) + 1;
    if (typeof this._activeSubviewCleanup === 'function') {
      try { this._activeSubviewCleanup(); } catch (error) { console.warn('Subview cleanup failed:', error); }
    }
    this._activeSubviewCleanup = null;
  }

  _ensureFarmEntryOverlay() {
    if (this._farmEntryOverlay) return this._farmEntryOverlay;
    const el = document.createElement('div');
    el.className = 'farm-entry-overlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="farm-entry-overlay__vignette"></div>
      <div class="farm-entry-overlay__content">
        <i class="ph ph-spinner-gap" aria-hidden="true"></i>
        <strong data-farm-entry-title>正在进入农田动态监测</strong>
        <span data-farm-entry-sub>视角切入田野…</span>
      </div>
    `;
    document.body.appendChild(el);
    this._farmEntryOverlay = el;
    return el;
  }

  _setFarmEntryOverlayText(title, sub) {
    const overlay = this._farmEntryOverlay;
    if (!overlay) return;
    const titleEl = overlay.querySelector('[data-farm-entry-title]');
    const subEl = overlay.querySelector('[data-farm-entry-sub]');
    if (titleEl && title) titleEl.textContent = title;
    if (subEl && sub) subEl.textContent = sub;
  }

  _showFarmEntryOverlay() {
    const overlay = this._ensureFarmEntryOverlay();
    overlay.classList.add('active', 'is-sky-bridge');
    document.body.classList.add('farm-entry-transition');
  }

  _hideFarmEntryOverlay() {
    this._farmEntryOverlay?.classList.remove('active', 'is-sky-bridge');
    document.body.classList.remove('farm-entry-transition');
  }

  async openFarmMonitor(plotId, options = {}) {
    if (this._farmEntryBusy) return;
    if (plotId !== this.state.currentPlotId) {
      this.selectPlot(plotId, { silent: true, syncView: false });
    }
    this.state.activeMainView = 'plot-detail';
    this.updatePlotContextVisibility('plot-detail');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const introAnimation = !reducedMotion && options.skipTransition !== true && options.introAnimation !== false;

    if (this.farmMonitor?.isOpen) {
      this.farmMonitor.setPlots(this.state.plots);
      await this.farmMonitor.open(plotId, { introAnimation: false });
      this.dom.headerCurrentView.textContent = '农田监测 (Digital Twin)';
      document.querySelectorAll('.module-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === 'plot-detail');
      });
      if (options.updateHash !== false) {
        this.navigate('plot-detail', { plotId });
      }
      return;
    }

    this._farmEntryBusy = true;
    try {
      this.cleanupActiveSubview();
      this.plotTelemetryView?.close();
      this.dom.subviewModal?.classList.remove('active');
      if (this.dom.homeFeedContent) this.dom.homeFeedContent.hidden = true;
      if (this.dom.plotTelemetryPanel) this.dom.plotTelemetryPanel.hidden = true;
      if (this.dom.decisionFeedPanel) this.dom.decisionFeedPanel.hidden = true;
      if (this.dom.moduleContentPanel) this.dom.moduleContentPanel.hidden = true;

      if (introAnimation) {
        this._showFarmEntryOverlay();
        this._setFarmEntryOverlayText('正在进入农田动态监测', '视角移向天空…');
        this.riumBackground?.restoreHomeCamera?.();
        this.riumBackground?.setVisible(true);
        const divePromise = this.riumBackground?.playFarmEntryDive?.() || Promise.resolve();

        // Mid-dive: start building the twin under the overlay so loading is real work
        await Promise.race([
          divePromise,
          new Promise(resolve => setTimeout(resolve, 1400))
        ]);
        this._setFarmEntryOverlayText('正在构建数字孪生场景', '田野模型与天空衔接中…');
        this.farmMonitor?.setPlots(this.state.plots);
        const openPromise = this.farmMonitor?.open(plotId, { introAnimation });

        await divePromise;
        this.riumBackground?.setVisible(false);
        this._setFarmEntryOverlayText('农田动态监测已就绪', '缓慢落回全景视角…');
        // Short sky bridge — don't wait for the whole intro before clearing overlay
        await new Promise(resolve => setTimeout(resolve, 280));
        this._hideFarmEntryOverlay();
        await openPromise;
      } else {
        this.riumBackground?.setVisible(false);
        this.farmMonitor?.setPlots(this.state.plots);
        await this.farmMonitor?.open(plotId, { introAnimation });
      }

      this.dom.headerCurrentView.textContent = '农田监测 (Digital Twin)';
      document.querySelectorAll('.module-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === 'plot-detail');
      });
      if (options.updateHash !== false) {
        this.navigate('plot-detail', { plotId });
      }
    } finally {
      this._hideFarmEntryOverlay();
      this._farmEntryBusy = false;
    }
  }

  closeModal(updateHash = true) {
    this.cleanupActiveSubview();
    this.dom.subviewModal.classList.remove('active');
    this.farmMonitor?.close(false);
    this.plotTelemetryView?.close();
    if (this.dom.plotTelemetryPanel) this.dom.plotTelemetryPanel.hidden = true;
    if (this.dom.decisionFeedPanel) this.dom.decisionFeedPanel.hidden = true;
    if (this.dom.moduleContentPanel) {
      this.dom.moduleContentPanel.hidden = true;
    }
    if (this.dom.moduleContentBody) this.dom.moduleContentBody.innerHTML = '';
    if (this.dom.homeFeedContent) this.dom.homeFeedContent.hidden = false;
    this.state.activeMainView = 'home';
    this.updatePlotContextVisibility('home');
    this.riumBackground?.setVisible(true);
    this.riumBackground?.restoreHomeCamera?.();
    this.dom.headerCurrentView.textContent = "Home (农智总览)";
    document.querySelectorAll('.module-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === 'home');
    });
    if (updateHash && window.location.hash) {
      this._setHash('', true);
    }

    // 关闭弹窗后恢复主页滚动位置（下一帧布局稳定后执行）
    if (this._savedScrollPos !== null) {
      const pos = this._savedScrollPos;
      this._savedScrollPos = null;
      const restoreScroll = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
      restoreScroll(() => {
        try { window.scrollTo(pos.x, pos.y); } catch (e) { /* noop */ }
      });
    }
  }

  showDecisionFeedView(options = {}) {
    this.cleanupActiveSubview();
    this.plotTelemetryView?.close();
    this.farmMonitor?.close(false);
    if (this.dom.homeFeedContent) this.dom.homeFeedContent.hidden = true;
    if (this.dom.moduleContentPanel) this.dom.moduleContentPanel.hidden = true;
    if (this.dom.plotTelemetryPanel) this.dom.plotTelemetryPanel.hidden = true;
    if (this.dom.decisionFeedPanel) this.dom.decisionFeedPanel.hidden = false;
    this.state.activeMainView = 'decision-feed';
    this.updatePlotContextVisibility('decision-feed');
    this.dom.headerCurrentView.textContent = '关键动态消息';
    document.querySelectorAll('.module-nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.view === 'decision-feed');
    });
    this.renderFeed();
    document.getElementById('mainFeedArea')?.scrollTo?.({ top: 0, behavior: 'smooth' });
    if (options.updateHash !== false) {
      this._setHash(new URLSearchParams({ view: 'decision-feed' }).toString());
    }
  }

  showPlotTelemetryView(plotId, options = {}) {
    if (plotId && plotId !== this.state.currentPlotId) {
      this.selectPlot(plotId, { silent: true, syncView: false });
    }
    this.closeModal(false);
    this.farmMonitor?.close(false);
    if (this.dom.homeFeedContent) this.dom.homeFeedContent.hidden = true;
    if (this.dom.moduleContentPanel) this.dom.moduleContentPanel.hidden = true;
    if (this.dom.decisionFeedPanel) this.dom.decisionFeedPanel.hidden = true;
    if (this.dom.plotTelemetryPanel) this.dom.plotTelemetryPanel.hidden = false;
    this.state.activeMainView = 'plot-telemetry';
    this.updatePlotContextVisibility('plot-telemetry');
    this.dom.headerCurrentView.textContent = '地块数据监测';
    document.querySelectorAll('.module-nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.view === 'plot-telemetry');
    });
    void this.plotTelemetryView?.open(plotId || this.state.currentPlotId);
    if (options.updateHash !== false) {
      this._setHash(new URLSearchParams({ view: 'plot-telemetry', plotId: plotId || this.state.currentPlotId }).toString());
    }
  }

  showHomeView(options = {}) {
    this.cleanupActiveSubview();
    this.plotTelemetryView?.close();
    if (this.dom.plotTelemetryPanel) this.dom.plotTelemetryPanel.hidden = true;
    if (this.dom.decisionFeedPanel) this.dom.decisionFeedPanel.hidden = true;
    if (this.dom.moduleContentPanel) {
      this.dom.moduleContentPanel.hidden = true;
    }
    if (this.dom.moduleContentBody) this.dom.moduleContentBody.innerHTML = '';
    if (this.dom.homeFeedContent) this.dom.homeFeedContent.hidden = false;
    this.state.activeMainView = 'home';
    this.updatePlotContextVisibility('home');
    this.dom.headerCurrentView.textContent = 'Home (农智总览)';
    document.querySelectorAll('.module-nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.view === 'home');
    });
    if (options.updateHash !== false && window.location.hash) {
      this._setHash('', true);
    }
  }

  getViewIcon(viewName) {
    const map = {
      'plot-detail': '📊',
      'decision-feed': '📡',
      'decision-console': '🧠',
      'work-orders': '📋',
      'risk-forecast': '🔮',
      'resource-coordination': '💧',
      'value-ledger': '💰',
      'decision-passport': '🛡️',
      'scenario-replay': '⚡',
      'crop-packs': '📦'
    };
    return map[viewName] || '🧩';
  }

  renderSubviewContextualContent(viewName, plot, container = this.dom.modalDynamicContent) {
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
      const moisture = plot?.metrics?.SOIL_MOISTURE;
      const temp = plot?.metrics?.AIR_TEMPERATURE;
      const deviceHealth = Number.isFinite(Number(plot?.healthScore))
        ? `${Math.round(Number(plot.healthScore) * 100)}%`
        : '—';
      const riskMap = { HIGH: { label: '高风险', cls: 'agri-pill-danger' }, MEDIUM: { label: '中风险', cls: 'agri-pill-warn' }, LOW: { label: '低风险', cls: 'agri-pill-ok' } };
      const risk = riskMap[plot?.riskLevel] || { label: '未知', cls: 'agri-pill-warn' };
      const statusMap = { ONLINE: '在线', OFFLINE: '离线', NORMAL: '正常', WARN: '偏低', ERROR: '异常' };
      const moistureStatus = statusMap[moisture?.status] || moisture?.status || '未知';
      const deviceStatusLabel = statusMap[plot?.deviceStatus] || plot?.deviceStatus || '未知';
      contentHtml = `
        <div class="agri-module dp-root">
          <div>
            <div class="agri-module-title">🛡️ 决策护照</div>
            <div class="agri-module-sub">每次决策的完整来龙去脉：用了什么数据、什么规则、谁批准、结果如何，全程可追溯。</div>
          </div>

          <div class="agri-card">
            <div class="agri-card-title">📍 当前地块</div>
            <div class="dp-plot-info">
              <div><span class="agri-kv-key">地块</span><span>${this.escapeHtml(plot?.name || '未知地块')}</span></div>
              <div><span class="agri-kv-key">作物</span><span>${this.escapeHtml(plot?.cropName || '—')} · ${this.escapeHtml(plot?.stageLabel || '—')}</span></div>
              <div><span class="agri-kv-key">风险</span><span class="agri-pill ${risk.cls}">${risk.label}</span></div>
            </div>
          </div>

          <div class="agri-card">
            <div class="agri-card-title">📊 数据来源</div>
            <ul class="agri-kv-list">
              <li><span class="agri-kv-key">土壤湿度</span><span>${this.escapeHtml(moisture?.value ?? '—')}${this.escapeHtml(moisture?.unit || '')}（${moistureStatus}）<em style="color:var(--text-muted)">· 模拟数据</em></span></li>
              <li><span class="agri-kv-key">空气温度</span><span>${this.escapeHtml(temp?.value ?? '—')}${this.escapeHtml(temp?.unit || '')}</span></li>
              <li><span class="agri-kv-key">设备</span><span>${this.escapeHtml(plot?.deviceId || '—')}（${deviceStatusLabel} · 健康 ${deviceHealth}）</span></li>
            </ul>
            <div class="agri-meta-line">本期所有数据来自模拟器，不是真实传感器读数。</div>
          </div>

          <div class="agri-card">
            <div class="agri-card-title">🔗 决策链路</div>
            <div class="dp-chain">
              <div class="dp-chain-step done"><span class="dp-chain-num">1</span><span>观测</span><span class="dp-chain-note">传感器读数</span></div>
              <div class="dp-chain-step done"><span class="dp-chain-num">2</span><span>诊断</span><span class="dp-chain-note">根因分析</span></div>
              <div class="dp-chain-step done"><span class="dp-chain-num">3</span><span>处方</span><span class="dp-chain-note">灌溉建议</span></div>
              <div class="dp-chain-step"><span class="dp-chain-num">4</span><span>审批</span><span class="dp-chain-note">人工确认</span></div>
              <div class="dp-chain-step"><span class="dp-chain-num">5</span><span>执行</span><span class="dp-chain-note">虚拟下发</span></div>
              <div class="dp-chain-step"><span class="dp-chain-num">6</span><span>验证</span><span class="dp-chain-note">效果回测</span></div>
            </div>
            <div class="agri-meta-line">已完成步骤标绿，待执行步骤需人工审批后继续。</div>
          </div>

          <div class="agri-card">
            <div class="agri-card-title">📦 版本追踪</div>
            <ul class="agri-kv-list">
              <li><span class="agri-kv-key">作物包</span><span>${this.escapeHtml(plot?.cropCode || '—')} v1.0</span></li>
              <li><span class="agri-kv-key">规则</span><span class="agri-mono">rule-v20260822</span></li>
              <li><span class="agri-kv-key">知识库</span><span class="agri-mono">kb-v20260822</span></li>
              <li><span class="agri-kv-key">智能体</span><span class="agri-mono">agent-v0.4</span></li>
            </ul>
            <div class="agri-meta-line">每次建议都会记录所用版本，确保结果可复现。</div>
          </div>

          <div class="agri-card">
            <div class="agri-card-title">✅ 护照保障</div>
            <ul class="agri-kv-list">
              <li><span class="agri-kv-key">追溯</span><span>从观测到执行，每一步都有记录</span></li>
              <li><span class="agri-kv-key">审计</span><span>原始输入、工具调用、审批人、执行结果全程留存</span></li>
              <li><span class="agri-kv-key">降级</span><span>数据不足时明确提示，不编造结果</span></li>
              <li><span class="agri-kv-key">安全</span><span>高风险动作必须人工确认，模型不能绕过</span></li>
            </ul>
          </div>
        </div>
      `;
    }

    if (!contentHtml) {
      contentHtml = `
        <div class="module-placeholder-card">
          <div class="module-placeholder-icon">${this.getViewIcon(viewName)}</div>
          <h3>${this.escapeHtml(MOCK_DATA.subviewsMeta[viewName]?.title || viewName)}</h3>
          <p>本模块的中心页面路由已接入，当前演示版本保留现有占位状态。</p>
          <span class="module-badge">待验收</span>
        </div>
      `;
    }
    if (container) container.innerHTML = contentHtml;
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  showToast(message, type = 'info') {
    if (!this.dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = document.createElement('span');
    icon.textContent = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);
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
  // 兜底：无论 init() 成功还是抛错，加载动画都不能永久卡住。
  const forceHideLoading = () => {
    const el = document.getElementById('appLoading');
    if (el) { el.classList.add('hidden'); setTimeout(() => el.remove(), 900); }
    document.documentElement.classList.remove('is-booting');
  };
  // 12s 硬超时：即使 WebGL/网络完全卡死，也强制进入界面。
  const bootTimeout = setTimeout(forceHideLoading, 12000);
  app.init().catch((err) => {
    console.error('[AgriLoop] app init failed', err);
    forceHideLoading();
  }).finally(() => clearTimeout(bootTimeout));
});
