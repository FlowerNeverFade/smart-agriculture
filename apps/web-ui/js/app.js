/**
 * AgriLoop Frontend - Main Application Controller
 * High-density operational dashboard with modular router & interactive closed-loop
 */
import { MOCK_DATA } from './mock-data.js';
import { api } from './api.js';
import { initCommandPalette } from './command-palette.js';
import { initTheme } from './theme.js';
import { PlotTelemetryView } from './plot-telemetry-view.js';
import { initWheatFallback } from './wheat-fallback.js';

const LOGIN_ENTRY = 'login.html';

function redirectToLogin() {
  api.logout();
  window.location.replace(LOGIN_ENTRY);
}

const VIEW_STYLES = {
  'plot-detail': 'css/farm-monitor.css?v=20260824-branch-refresh',
  'crop-sandbox': 'css/crop-sandbox.css?v=20260824-branch-refresh',
  'decision-console': 'css/modules/decision-console.css?v=20260824-decision-core',
  'risk-forecast': 'css/modules/forecast.css?v=20260824-branch-refresh',
  'scenario-replay': 'css/modules/forecast.css?v=20260824-branch-refresh',
  'value-ledger': 'css/modules/value-ledger.css?v=20260824-branch-refresh',
  'crop-packs': 'css/modules/crop-packs.css?v=20260824-branch-refresh',
  'work-orders': 'css/modules/work-orders.css?v=20260824-branch-refresh',
  'resource-coordination': 'css/modules/work-orders.css?v=20260824-branch-refresh'
};
const stylesheetTasks = new Map();

function ensureViewStyles(viewName) {
  const href = VIEW_STYLES[viewName];
  if (!href) return Promise.resolve();
  if (stylesheetTasks.has(href)) return stylesheetTasks.get(href);

  const absoluteHref = new URL(href, document.baseURI).href;
  const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .find(link => link.href === absoluteHref);
  if (existing?.sheet) return Promise.resolve();

  const task = new Promise((resolve, reject) => {
    const link = existing || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.agriLazyStyle = viewName;
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => {
      link.remove();
      reject(new Error(`样式加载失败：${href}`));
    }, { once: true });
    if (!existing) document.head.appendChild(link);

    // jsdom 不抓取外链样式；真实浏览器仍严格等待 load，避免未着色内容闪现。
    if (/jsdom/i.test(window.navigator?.userAgent || '')) resolve();
  }).catch(error => {
    stylesheetTasks.delete(href);
    throw error;
  });
  stylesheetTasks.set(href, task);
  return task;
}

// yyx 分支的增强视图按需加载，首屏不阻塞；plot-detail 仍由 lxh 的
// Three.js Digital Twin 接管，避免两个渲染器争夺同一个全屏画布。
const SUBVIEW_RENDERERS = {
  'decision-console': async (container, plotId, app) => {
    const { renderDecisionConsole } = await import('./modules/decision-console.js');
    return renderDecisionConsole(container, plotId, {
      api,
      state: app.state,
      showToast: (message, type) => app.showToast(message, type)
    });
  },
  'risk-forecast': async (container, plotId) => (await import('./modules/risk-forecast.js')).renderRiskForecast(container, plotId),
  'scenario-replay': async (container, plotId) => (await import('./modules/risk-forecast.js')).renderScenarioReplay(container, plotId),
  'value-ledger': async (container) => (await import('./modules/value-ledger.js')).renderValueLedger(container),
  'crop-packs': async (container) => (await import('./modules/crop-packs.js')).renderCropPacks(container),
  'work-orders': async (container, plotId, app) => {
    const { renderWorkOrders } = await import('./modules/work-orders.js');
    return renderWorkOrders(container, {
      api,
      plots: app.state.plots,
      selectedPlotId: plotId,
      user: app.state.user || (!app.state.isLive ? MOCK_DATA.currentUser : null),
      showToast: (message, type) => app.showToast(message, type)
    });
  },
  'resource-coordination': async (container, plotId, app) => {
    const { renderResourceCoordination } = await import('./modules/work-orders.js');
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
      workOrders: [...(MOCK_DATA.workOrders || [])],
      resourceProfile: { ...(MOCK_DATA.resourceProfile || {}) },
      activeSubview: null,
      activeMainView: 'home',
      isLive: false,
      authenticated: api.isAuthenticated(),
      user: api.getUser(),
      backendAiMode: null,
      simulator: { available: false, status: 'UNAVAILABLE', reason: 'AUTH_REQUIRED' },
      conversationId: '',
      agentHistory: [],
      agentHistoryTurns: [],
      agentHistoryOpen: false,
      rightRailCollapsed: false
    };

    this.dom = {};
    this.farmMonitor = null;
    this.cropSandbox = null;
    this.plotTelemetryView = new PlotTelemetryView(this);
    this.riumBackground = null;
    this._farmMonitorPromise = null;
    this._cropSandboxPromise = null;
    this._cropSandboxLoadGen = 0;
    this._visualEnhancementTask = null;
    this._backgroundDesiredVisible = true;
    this._waterVisualsReady = false;
    this._particlesCleanup = null;
    this._wheatFallbackCleanup = null;
    this._webglBackgroundUnavailable = false;
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

    // 主题和命令面板很轻，先初始化；Three.js 场景延后到首屏已经绘制之后。
    this._themeCleanup = initTheme();
    this._paletteCleanup = initCommandPalette(this);

    // Check backend connection
    this.state.isLive = await api.checkHealth();
    if (this.state.isLive) {
      if (!api.isAuthenticated() || !await api.restoreSession()) {
        redirectToLogin();
        return;
      }
    }
    this.syncAuthState();
    this.updateSystemStatusPill();

    // 历史记录与模拟器状态和总览互不依赖，并行请求，避免真实后端下串行等待。
    const supportingDataTask = Promise.allSettled([
      this.loadAgentHistory(true),
      this.refreshSimulatorStatus(true)
    ]);
    await Promise.all([this.loadOverview(), this.loadHomeSupportingData()]);

    this.renderPlots();
    this.renderFeed();
    this.renderChangelog();
    this.renderHomeSummary();
    this.handleRoute();
    // 先挂载 2D 麦田兜底，再异步尝试 Three.js。这样在 WebGL 初始化慢或
    // 被浏览器/GPU 禁用时，首屏也不会只剩空的夜空和粒子。
    this.ensureWheatFallback();
    this.scheduleVisualEnhancements();
    void supportingDataTask;

    window.addEventListener('hashchange', () => this.handleRoute());

  }

  scheduleVisualEnhancements() {
    if (this._visualEnhancementTask) return this._visualEnhancementTask;

    // 两帧后再等待一次短空闲窗口：保证文字、卡片先完成首绘，随后仍加载原画质场景。
    const afterFirstPaint = new Promise(resolve => {
      const nextFrame = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
      nextFrame(() => nextFrame(() => {
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(resolve, { timeout: 350 });
        } else {
          window.setTimeout(resolve, 0);
        }
      }));
    });

    this._visualEnhancementTask = afterFirstPaint
      .then(async () => {
        this.ensureWheatFallback();
        if (!this._waterVisualsReady) {
          try {
            const { syncWaterVisuals } = await import('./water-visual.js?v=20260824-water-rail-fix');
            syncWaterVisuals(document);
            this._waterVisualsReady = true;
          } catch (error) {
            // 水球是增强视觉，不能阻止麦田回退和其他背景层启动。
            console.warn('Water visual enhancement unavailable:', error);
          }
        }
        await this.ensureAmbientVisuals();
      })
      .catch(error => {
        console.warn('Deferred visual enhancement unavailable; continuing with CSS shell:', error);
      })
      .finally(() => {
        this._visualEnhancementTask = null;
      });
    return this._visualEnhancementTask;
  }

  async ensureAmbientVisuals() {
    if (!this._backgroundDesiredVisible) return;

    this.ensureWheatFallback();

    const jobs = [];
    if (!this._particlesCleanup) {
      jobs.push(import('./particles.js?v=20260824-perf-1').then(({ initParticles }) => {
        if (!this._backgroundDesiredVisible || this._particlesCleanup) return;
        this._particlesCleanup = initParticles();
        this._particlesCleanup?.setVisible?.(true);
      }));
    }

    const webglAvailable = typeof window.WebGLRenderingContext === 'function'
      || typeof window.WebGL2RenderingContext === 'function';
    if (webglAvailable && !this.riumBackground && !this._webglBackgroundUnavailable) {
      jobs.push(import('./rium-background.js?v=20260824-wheat-fallback')
        .then(({ initRiumBackground }) => {
          if (!this._backgroundDesiredVisible || this.riumBackground) return;
          try {
            const background = initRiumBackground();
            if (!background) return;
            this.riumBackground = background;
            this.riumBackground.setVisible(true);
            // Three.js 已经接管背景后移除回退画布，避免两套场景叠加。
            if (this._wheatFallbackCleanup) {
              this._wheatFallbackCleanup();
              this._wheatFallbackCleanup = null;
            }
          } catch (error) {
            // 保留 2D 麦田；部分浏览器仍会暴露 WebGL 构造函数，但创建
            // renderer 或 shader 时才失败。
            this._webglBackgroundUnavailable = true;
            console.warn('WebGL wheat background unavailable; using 2D fallback:', error);
          }
        })
        .catch(error => {
          this._webglBackgroundUnavailable = true;
          console.warn('WebGL wheat background module unavailable; using 2D fallback:', error);
        }));
    }
    // 背景增强互相独立：任一可选层失败，都不能把其他层和回退层一起
    // 传播成未处理 Promise rejection。
    await Promise.allSettled(jobs);
  }

  ensureWheatFallback() {
    if (this._wheatFallbackCleanup || !this._backgroundDesiredVisible) return this._wheatFallbackCleanup;
    this._wheatFallbackCleanup = initWheatFallback();
    this._wheatFallbackCleanup?.setVisible?.(true);
    return this._wheatFallbackCleanup;
  }

  setAmbientVisualsVisible(value) {
    const visible = value !== false;
    this._backgroundDesiredVisible = visible;
    this.riumBackground?.setVisible(visible);
    this._particlesCleanup?.setVisible?.(visible);
    this._wheatFallbackCleanup?.setVisible?.(visible);
    if (visible && (!this.riumBackground || !this._particlesCleanup)) {
      this.scheduleVisualEnhancements();
    }
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
    this.dom.btnToggleCopilotHistory = document.getElementById('btnToggleCopilotHistory');
    this.dom.copilotHistoryCount = document.getElementById('copilotHistoryCount');
    this.dom.copilotHistoryList = document.getElementById('copilotHistoryList');
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
    this.dom.homeFeedContent = document.getElementById('homeFeedContent');
    this.dom.moduleContentPanel = document.getElementById('moduleContentPanel');
    this.dom.moduleContentBody = document.getElementById('moduleContentBody');
    this.dom.moduleContentIcon = document.getElementById('moduleContentIcon');
    this.dom.moduleContentTitle = document.getElementById('moduleContentTitle');
    this.dom.moduleContentDescription = document.getElementById('moduleContentDescription');
    this.dom.moduleContentTag = document.getElementById('moduleContentTag');
    this.dom.btnModuleBackHome = document.getElementById('btnModuleBackHome');
    this.dom.appContainer = document.querySelector('.app-container');
    this.dom.mainFeedArea = document.getElementById('mainFeedArea');
    this.dom.btnToggleRightRail = document.getElementById('btnToggleRightRail');
    this.dom.btnHomeNavMore = document.getElementById('btnHomeNavMore');
    this.dom.simpleHomeKpis = document.getElementById('simpleHomeKpis');
    this.dom.simplePlotMap = document.getElementById('simplePlotMap');
    this.dom.simpleRiskList = document.getElementById('simpleRiskList');
    this.dom.simpleTaskList = document.getElementById('simpleTaskList');
    this.dom.simpleWaterCard = document.getElementById('simpleWaterCard');
    this.dom.simpleHomeDataMode = document.getElementById('simpleHomeDataMode');
    this.dom.simpleHomeOverlay = document.getElementById('simpleHomeOverlay');
    this.dom.homeCopilotPanel = document.getElementById('homeCopilotPanel');
    this.dom.homeActivityPanel = document.getElementById('homeActivityPanel');
    this.dom.simpleHomeDialogKicker = document.getElementById('simpleHomeDialogKicker');
    this.dom.simpleHomeDialogTitle = document.getElementById('simpleHomeDialogTitle');
    if (this.dom.plotTelemetryPanel) this.plotTelemetryView.bind(this.dom.plotTelemetryPanel);
  }

  initRightRailCollapse() {
    let collapsed = false;
    try {
      collapsed = localStorage.getItem('agriloop-right-rail-collapsed') === '1';
    } catch (_) {
      collapsed = false;
    }
    this.state.rightRailCollapsed = collapsed;
    this.applyRightRailCollapsed(collapsed);
  }

  setRightRailCollapsed(collapsed) {
    const next = Boolean(collapsed);
    this.state.rightRailCollapsed = next;
    this.applyRightRailCollapsed(next);
    try {
      localStorage.setItem('agriloop-right-rail-collapsed', next ? '1' : '0');
    } catch (_) {
      /* storage can be unavailable in private/demo contexts */
    }
  }

  applyRightRailCollapsed(collapsed) {
    this.dom.appContainer?.classList.toggle('right-rail-collapsed', collapsed);
    const button = this.dom.btnToggleRightRail;
    if (!button) return;
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    button.setAttribute('title', collapsed ? '展开系统状态面板' : '收起系统状态面板');
    const label = button.querySelector('.right-rail-toggle-text');
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
    this.dom.btnModuleBackHome?.addEventListener('click', () => this.navigate('home'));
    this.dom.btnToggleRightRail?.addEventListener('click', () => {
      this.setRightRailCollapsed(!this.state.rightRailCollapsed);
    });
    this.dom.btnHomeNavMore?.addEventListener('click', () => {
      const expanded = !this.dom.moduleNavList?.classList.contains('home-nav-expanded');
      this.dom.moduleNavList?.classList.toggle('home-nav-expanded', expanded);
      this.dom.btnHomeNavMore.setAttribute('aria-expanded', String(expanded));
      const label = this.dom.btnHomeNavMore.querySelector('span:first-child');
      if (label) label.innerHTML = `<span class="icon">${expanded ? '↑' : '☰'}</span>${expanded ? '收起功能' : '更多功能'}`;
    });

    this.dom.homeFeedContent?.addEventListener('click', (event) => {
      const closeButton = event.target.closest('[data-home-close]');
      if (closeButton) {
        this.closeHomeDetail();
        return;
      }
      const panelButton = event.target.closest('[data-home-panel]');
      if (panelButton) {
        this.openHomeDetail(panelButton.dataset.homePanel);
        return;
      }
      const viewButton = event.target.closest('[data-home-view]');
      if (viewButton) {
        const plotId = viewButton.dataset.plotId || this.state.currentPlotId;
        this.closeHomeDetail();
        this.openSubview(viewButton.dataset.homeView, { plotId, inline: true });
        return;
      }
      const plotButton = event.target.closest('[data-home-plot-id]');
      if (plotButton) {
        const plotId = plotButton.dataset.homePlotId;
        this.selectPlot(plotId, { silent: true });
        this.showPlotTelemetryView(plotId);
      }
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
        if (this.dom.simpleHomeOverlay && !this.dom.simpleHomeOverlay.hidden) this.closeHomeDetail();
        else this.closeModal();
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

    this.dom.btnToggleCopilotHistory?.addEventListener('click', () => {
      this.state.agentHistoryOpen = !this.state.agentHistoryOpen;
      this.renderAgentHistory();
    });
    this.dom.copilotHistoryList?.addEventListener('click', (event) => {
      const item = event.target.closest('[data-history-trace]');
      if (item) this.showAgentHistoryTurn(item.dataset.historyTrace);
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
      } else {
        // Functional modules from the navigation rail are inline center-feed
        // views. Cards and command-palette links keep the modal route for now.
        this.openSubview(view, { plotId: this.state.currentPlotId, inline: true });
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

  async loadHomeSupportingData() {
    try {
      const workOrders = await api.getTodayWorkItems();
      if (Array.isArray(workOrders)) this.state.workOrders = workOrders;
    } catch (error) {
      if (error.status === 401 || error.code === 'AUTH_REQUIRED' || error.code === 'AUTH_INVALID') {
        this.handleSessionExpired(false);
      } else if (this.state.isLive) {
        console.warn('[AgriLoop] 首页今日农务读取失败，保留当前快照。', error);
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
          this.renderHomeSummary();
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

  renderPlots(filterKeyword = '') {
    if (!this.dom.plotListContainer) return;
    const filtered = this.state.plots.filter(p => {
      const match = (p.name + p.cropName + p.cropVariety + p.plotId).toLowerCase();
      return match.includes(filterKeyword.toLowerCase());
    });

    this.dom.plotsCountTag.textContent = `${filtered.length} 个地块`;

    this.dom.plotListContainer.innerHTML = filtered.map(plot => {
      const isActive = plot.plotId === this.state.currentPlotId;
      const moisture = plot.metrics.SOIL_MOISTURE.value;
      const isWarn = moisture < 20.0;

      return `
        <li class="plot-list-item ${isActive ? 'active' : ''}" data-plot-id="${plot.plotId}">
          <div class="plot-info">
            <span class="plot-name">
              ${plot.cropCode === 'tomato' ? '🍅' : '🥒'} ${plot.name}
            </span>
            <span class="plot-meta">${plot.cropName} · ${plot.stageLabel}</span>
          </div>
          <span class="plot-metric-pill ${isWarn ? 'warn' : ''}" title="土壤湿度当前值 (目标: ${plot.metrics.SOIL_MOISTURE.target})">
            ${moisture}%
          </span>
        </li>
      `;
    }).join('');

    // Attach click listeners to plot items
    this.dom.plotListContainer.querySelectorAll('.plot-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const plotId = item.dataset.plotId;
        this.selectPlot(plotId);
      });
    });
  }

  filterPlots(keyword) {
    this.renderPlots(keyword);
  }

  selectPlot(plotId, options = {}) {
    this.state.currentPlotId = plotId;
    const plot = this.state.plots.find(p => p.plotId === plotId);
    if (plot && this.dom.currentPlotContextBadge) {
      this.dom.currentPlotContextBadge.textContent = `/ 当前选中：${plot.name} (${plot.cropName} · ${plot.stageLabel})`;
    }
    this.renderPlots(this.dom.plotSearchInput?.value || '');
    if (this.state.activeMainView === 'plot-telemetry') {
      void this.plotTelemetryView.open(plotId);
    }
    if (!options.silent) this.showToast(`已切换当前工作地块至：${plot ? plot.name : plotId}`, 'info');
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
      const chatResult = await api.agentChat('生成灌溉处方', plotId, this.state.conversationId);
      if (chatResult?.conversationId) this.state.conversationId = chatResult.conversationId;
      this.displayCopilotBanner(chatResult);
      await this.loadAgentHistory(true);
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
      const response = await api.agentChat(query, this.state.currentPlotId, this.state.conversationId);
      if (response?.conversationId) this.state.conversationId = response.conversationId;
      this.displayCopilotBanner(response);
      await this.loadAgentHistory(true);
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

  async loadAgentHistory(silent = false) {
    if (!api.isAuthenticated()) {
      this.state.agentHistory = [];
      this.state.agentHistoryTurns = [];
      this.renderAgentHistory();
      return;
    }
    try {
      const history = await api.getAgentHistory(this.state.conversationId, 60);
      this.state.conversationId = history?.conversation?.conversationId || this.state.conversationId;
      this.state.agentHistory = Array.isArray(history?.messages) ? history.messages : [];
      this.state.agentHistoryTurns = this.groupAgentHistoryTurns(this.state.agentHistory);
      this.renderAgentHistory();
    } catch (error) {
      if (error.status === 401) this.handleSessionExpired();
      else if (!silent) this.showToast(`读取对话记录失败：${error.message || '后端未响应'}`, 'error');
    }
  }

  groupAgentHistoryTurns(messages) {
    const turns = [];
    const byTrace = new Map();
    for (const message of messages || []) {
      const traceId = String(message?.traceId || message?.messageId || '');
      if (!traceId) continue;
      let turn = byTrace.get(traceId);
      if (!turn) {
        turn = { traceId, user: null, assistant: null };
        byTrace.set(traceId, turn);
        turns.push(turn);
      }
      if (String(message?.role || '').toUpperCase() === 'USER') turn.user = message;
      if (String(message?.role || '').toUpperCase() === 'ASSISTANT') turn.assistant = message;
    }
    return turns.filter(turn => turn.user || turn.assistant).reverse();
  }

  renderAgentHistory() {
    const list = this.dom.copilotHistoryList;
    const toggle = this.dom.btnToggleCopilotHistory;
    if (!list || !toggle) return;
    const turns = this.state.agentHistoryTurns || [];
    toggle.setAttribute('aria-expanded', String(Boolean(this.state.agentHistoryOpen)));
    list.hidden = !this.state.agentHistoryOpen;
    if (this.dom.copilotHistoryCount) this.dom.copilotHistoryCount.textContent = `${turns.length} 轮`;
    if (!turns.length) {
      list.innerHTML = '<p class="copilot-history-empty">首次提问后，对话会按当前登录账号保存。</p>';
      return;
    }
    list.innerHTML = turns.map(turn => {
      const question = turn.user?.content || '历史提问';
      const answer = turn.assistant?.content || '回答生成中';
      const createdAt = turn.assistant?.createdAt || turn.user?.createdAt;
      const timestamp = createdAt ? new Date(createdAt).toLocaleString('zh-CN', { hour12: false }) : '';
      return `
        <button class="copilot-history-item" type="button" data-history-trace="${this.escapeHtml(turn.traceId)}">
          <span class="copilot-history-question">你：${this.escapeHtml(question)}</span>
          <span class="copilot-history-answer">农智助手：${this.escapeHtml(answer)}</span>
          <span class="copilot-history-meta">${this.escapeHtml(timestamp)} · ${this.escapeHtml(turn.assistant?.intent || '对话')}</span>
        </button>`;
    }).join('');
  }

  showAgentHistoryTurn(traceId) {
    const turn = (this.state.agentHistoryTurns || []).find(item => item.traceId === traceId);
    if (!turn?.assistant || !this.dom.copilotOutputBanner) return;
    this.dom.copilotOutputBanner.classList.add('active');
    this.dom.copilotOutputTitle.textContent = '🕘 历史回答';
    this.dom.copilotTraceId.textContent = '当前账号的持久化记录';
    this.dom.copilotOutputText.textContent = this.sanitizeNarrative(turn.assistant.content || '');
    if (turn.user?.content && this.dom.copilotInput) this.dom.copilotInput.value = turn.user.content;
    this.dom.copilotOutputBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    const leakage = /(traceid|sourcelabels|knowledgeevidence|adapter\s*:|intent\s*:|用户问题：|当前问题：|当前公开事实|系统提示：|不得生成|工具入参|工具出参|<think>)/i;
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

  /** 低密度 Home：所有数字从当前状态与已有农务合同推导。 */
  renderHomeSummary() {
    const plots = this.state.plots || MOCK_DATA.plots;
    if (!plots.length) return;

    const isOffline = plot => String(plot.deviceStatus || '').toUpperCase() !== 'ONLINE';
    const isRisk = plot => isOffline(plot) || ['HIGH', 'MEDIUM', 'CRITICAL'].includes(String(plot.riskLevel || '').toUpperCase());
    const riskPlots = plots.filter(isRisk);
    const onlineCount = plots.filter(plot => !isOffline(plot)).length;
    const normalCount = Math.max(plots.length - riskPlots.length, 0);
    const onlineRate = plots.length ? Math.round((onlineCount / plots.length) * 100) : 0;

    if (this.dom.simpleHomeDataMode) {
      this.dom.simpleHomeDataMode.textContent = this.state.isLive ? '服务器实时数据' : '本地演示数据';
    }

    if (this.dom.simpleHomeKpis) {
      const cards = [
        { icon: '🌱', label: '地块总数', value: plots.length, unit: '个', note: '当前农场全部生产地块', className: '' },
        { icon: '✅', label: '正常地块', value: normalCount, unit: '个', note: `${plots.length ? Math.round((normalCount / plots.length) * 100) : 0}% 状态正常`, className: '' },
        { icon: '⚠️', label: '风险地块', value: riskPlots.length, unit: '个', note: riskPlots.length ? '请优先查看风险建议' : '暂无需要处理的风险', className: 'risk' },
        { icon: '📡', label: '设备在线率', value: onlineRate, unit: '%', note: `${onlineCount} / ${plots.length} 台设备在线`, className: 'device' }
      ];
      this.dom.simpleHomeKpis.innerHTML = cards.map(card => `
        <article class="simple-kpi ${card.className}">
          <span class="simple-kpi-icon" aria-hidden="true">${card.icon}</span>
          <div><span class="simple-kpi-label">${card.label}</span><strong class="simple-kpi-value">${card.value}<small>${card.unit}</small></strong></div>
          <span class="simple-kpi-note">${card.note}</span>
        </article>`).join('');
    }

    const cropIcons = { tomato: '🍅', corn: '🌽', cucumber: '🥒', rice: '🌾', sunflower: '🌻', strawberry: '🍓' };
    if (this.dom.simplePlotMap) {
      this.dom.simplePlotMap.innerHTML = plots.map(plot => {
        const offline = isOffline(plot);
        const risk = isRisk(plot);
        const moisture = plot.metrics?.SOIL_MOISTURE;
        const statusText = offline ? '离线' : (risk ? '有风险' : '正常');
        return `
          <button class="simple-plot-tile ${offline ? 'is-offline' : risk ? 'is-risk' : ''}" type="button" data-home-plot-id="${this.escapeHtml(plot.plotId)}" aria-label="查看${this.escapeHtml(plot.name)}监测数据">
            <span class="simple-plot-top"><span class="simple-plot-name">${cropIcons[plot.cropCode] || '🌱'} ${this.escapeHtml(plot.name)}</span><span class="simple-plot-status">${offline ? '🔴' : risk ? '🟠' : '🟢'} ${statusText}</span></span>
            <span class="simple-plot-meta">${this.escapeHtml(plot.cropName || '作物')} · ${this.escapeHtml(plot.stageLabel || '当前阶段')}</span>
            <span class="simple-plot-metric">${this.escapeHtml(moisture?.label || '土壤湿度')} ${this.escapeHtml(String(moisture?.value ?? '—'))}${this.escapeHtml(moisture?.unit || '')}</span>
          </button>`;
      }).join('');
    }

    if (this.dom.simpleRiskList) {
      if (!riskPlots.length) {
        this.dom.simpleRiskList.innerHTML = '<div class="simple-safe-state"><div><span style="font-size:34px">✅</span><strong>全部正常</strong><span>当前没有需要立即处理的地块</span></div></div>';
      } else {
        this.dom.simpleRiskList.innerHTML = riskPlots.slice(0, 2).map(plot => {
          const offline = isOffline(plot);
          const moisture = Number(plot.metrics?.SOIL_MOISTURE?.value);
          const title = offline ? `${plot.name}：设备离线` : `${plot.name}：缺水风险`;
          const advice = offline ? '建议检查设备电源和网络连接' : `土壤湿度 ${Number.isFinite(moisture) ? `${moisture}%` : '偏低'}，建议核验后补水`;
          return `
            <button class="simple-risk-item" type="button" data-home-view="decision-console" data-plot-id="${this.escapeHtml(plot.plotId)}">
              <span class="simple-list-icon">${offline ? '📶' : '💧'}</span>
              <span><span class="simple-list-title">${this.escapeHtml(title)}</span><span class="simple-list-sub">${this.escapeHtml(advice)}</span></span>
              <span class="simple-list-arrow">›</span>
            </button>`;
        }).join('');
      }
    }

    if (this.dom.simpleTaskList) {
      const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const tasks = [...(this.state.workOrders || MOCK_DATA.workOrders || [])]
        .filter(item => !['DONE', 'CANCELLED'].includes(String(item.status || '').toUpperCase()))
        .sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9))
        .slice(0, 3);
      this.dom.simpleTaskList.innerHTML = tasks.length ? tasks.map(task => {
        const due = task.dueAt ? new Date(task.dueAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '今日';
        const plot = plots.find(item => item.plotId === task.plotId);
        return `
          <button class="simple-task-item" type="button" data-home-view="work-orders" data-plot-id="${this.escapeHtml(task.plotId || this.state.currentPlotId)}">
            <span class="simple-list-icon">${task.actionType === 'INSPECTION' ? '🔎' : task.actionType === 'IRRIGATION_REVIEW' ? '💧' : '🌿'}</span>
            <span><span class="simple-list-title">${this.escapeHtml(task.title)}</span><span class="simple-list-sub">${this.escapeHtml(plot?.name || '全场农务')} · ${due}前</span><span class="simple-task-priority ${String(task.priority).toLowerCase()}">${task.priority === 'HIGH' ? '紧急' : task.priority === 'MEDIUM' ? '普通' : '可稍后处理'}</span></span>
          </button>`;
      }).join('') : '<div class="simple-safe-state"><div><strong>今日任务已完成</strong><span>暂无待处理农务</span></div></div>';
    }

    if (this.dom.simpleWaterCard) {
      const water = this.state.resourceProfile || MOCK_DATA.resourceProfile || {};
      const limit = Number(water.dailyLimitLitres || 0);
      const used = Number(water.usedTodayLitres || 0);
      const remaining = Number(water.remainingLitres ?? Math.max(limit - used, 0));
      const usedPct = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;
      this.dom.simpleWaterCard.innerHTML = `
        <div class="simple-water-heading"><div><span class="section-kicker">今日用水</span><h2>水资源协同排程</h2></div><span class="simple-water-drop">💧</span></div>
        <div class="simple-water-values">
          <div><span>今日额度</span><strong>${limit.toLocaleString()} L</strong></div>
          <div><span>已使用</span><strong>${used.toLocaleString()} L</strong></div>
          <div><span>剩余</span><strong>${remaining.toLocaleString()} L</strong></div>
        </div>
        <div class="simple-water-progress" aria-label="今日用水进度 ${usedPct}%"><i style="width:${usedPct}%"></i></div>
        <div class="simple-water-foot"><span>已使用 ${usedPct}% · ${water.activeConflicts || 0} 个调度冲突</span><button class="simple-home-text-btn" type="button" data-home-view="resource-coordination">安排用水 →</button></div>`;
    }
  }

  applyHomeLayout(active) {
    this.dom.appContainer?.classList.toggle('home-simple-mode', Boolean(active));
    if (!active) {
      this.dom.moduleNavList?.classList.remove('home-nav-expanded');
      this.dom.btnHomeNavMore?.setAttribute('aria-expanded', 'false');
    }
  }

  openHomeDetail(panelName) {
    if (!this.dom.simpleHomeOverlay) return;
    const isActivity = panelName === 'activity';
    this.dom.homeCopilotPanel.hidden = isActivity;
    this.dom.homeActivityPanel.hidden = !isActivity;
    this.dom.simpleHomeDialogKicker.textContent = isActivity ? '农场记录' : '农智助手';
    this.dom.simpleHomeDialogTitle.textContent = isActivity ? '全部关键动态' : '智能分析';
    this.dom.simpleHomeOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    const focusTarget = isActivity ? this.dom.homeActivityPanel.querySelector('button') : this.dom.copilotInput;
    window.setTimeout(() => focusTarget?.focus(), 0);
  }

  closeHomeDetail() {
    if (!this.dom.simpleHomeOverlay) return;
    this.dom.simpleHomeOverlay.hidden = true;
    this.dom.homeCopilotPanel.hidden = true;
    this.dom.homeActivityPanel.hidden = true;
    document.body.style.overflow = '';
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
    const inline = params.get('inline') === '1';

    if (view === 'plot-telemetry') {
      this.showPlotTelemetryView(plotId, { updateHash: false });
    } else if (view && view !== 'home') {
      this.openSubview(view, { plotId, inline, updateHash: false });
    } else {
      this.showHomeView({ updateHash: false });
    }
  }

  /**
   * 更新 URL hash 而不触发浏览器锚点滚动：
   * location.hash 赋值会执行锚点定位，把主页 window 滚动位置重置；
   * history.pushState/replaceState 只改 URL（不滚动），再手动派发 hashchange。
   * jsdom 等环境 pushState 不更新 location.hash 时兜底赋值（该环境无布局，无滚动副作用）。
   */
  _setHash(hashStr, replace = false, notifyRoute = true) {
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
    if (!notifyRoute) {
      this._lastHandledHash = expect;
      return;
    }
    // 手动派发，驱动 handleRoute（幂等去重防重复渲染）
    const HashChange = window.HashChangeEvent || window.Event;
    window.dispatchEvent(new HashChange('hashchange'));
  }

  navigate(viewName, params = {}) {
    if (viewName === 'home') {
      this._setHash('', true, false);
      this.showHomeView({ updateHash: false });
    } else {
      this._setHash(new URLSearchParams({ view: viewName, ...params }).toString());
    }
  }

  async ensureFarmMonitor() {
    if (this.farmMonitor) return this.farmMonitor;
    if (!this._farmMonitorPromise) {
      this._farmMonitorPromise = Promise.all([
        ensureViewStyles('plot-detail'),
        import('./farm-monitor.js')
      ])
        .then(([, { FarmMonitor }]) => {
          this.farmMonitor = new FarmMonitor({
            plots: this.state.plots,
            onExit: () => this.navigate('home'),
            onSandbox: (plotId) => {
              this.state.currentPlotId = plotId;
              void this.openSubview('crop-sandbox', { plotId });
            },
            onPlotReclaimed: (newPlot) => {
              if (!this.state.plots.some(p => p.plotId === newPlot.plotId)) {
                this.state.plots.push(newPlot);
                this.renderPlots(this.dom.plotSearchInput?.value || '');
              }
            }
          });
          return this.farmMonitor;
        })
        .catch(error => {
          this._farmMonitorPromise = null;
          throw error;
        });
    }
    return this._farmMonitorPromise;
  }

  async ensureCropSandbox() {
    if (this.cropSandbox) return this.cropSandbox;
    if (!this._cropSandboxPromise) {
      const loadGen = ++this._cropSandboxLoadGen;
      this._cropSandboxPromise = Promise.all([
        ensureViewStyles('crop-sandbox'),
        import('./crop-sandbox.js')
      ])
        .then(([, { CropSandbox }]) => {
          if (loadGen !== this._cropSandboxLoadGen) return null;
          this.cropSandbox = new CropSandbox({
            onExit: () => this.navigate('plot-detail', { plotId: this.state.currentPlotId }),
            onPrescribe: (plotId, scenario) => {
              void this.openSubview('decision-console', { plotId });
              this.showToast(`已根据【${scenario}】模拟情景打开处方决策台`);
            }
          });
          return this.cropSandbox;
        })
        .catch(error => {
          if (loadGen === this._cropSandboxLoadGen) this._cropSandboxPromise = null;
          throw error;
        });
    }
    return this._cropSandboxPromise;
  }

  releaseCropSandbox() {
    this._cropSandboxLoadGen += 1;
    this.cropSandbox?.destroy();
    this.cropSandbox = null;
    this._cropSandboxPromise = null;
  }

  async openSubview(viewName, options = {}) {
    const plotId = options.plotId || this.state.currentPlotId;
    const inline = options.inline === true;
    this.closeHomeDetail();
    this.applyHomeLayout(false);
    this.cleanupActiveSubview();
    const viewGen = this._subviewGen;
    if (viewName === 'plot-detail') {
      this.state.activeMainView = 'plot-detail';
      this.dom.homeFeedContent.hidden = true;
      this.dom.moduleContentPanel.hidden = true;
      this.dom.plotTelemetryPanel.hidden = true;
      this.setAmbientVisualsVisible(false);
      this.dom.subviewModal.classList.remove('active');
      this.releaseCropSandbox();
      try {
        const farmMonitor = await this.ensureFarmMonitor();
        if (viewGen !== this._subviewGen) return;
        farmMonitor.setPlots(this.state.plots);
        farmMonitor.open(plotId);
      } catch (error) {
        if (viewGen !== this._subviewGen) return;
        this.setAmbientVisualsVisible(true);
        this.showToast(`农田监测启动失败：${error?.message || '浏览器不支持 WebGL'}`, 'error');
        return;
      }
      this.dom.headerCurrentView.textContent = '农田监测 (Digital Twin)';
      document.querySelectorAll('.module-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
      });
      if (options.updateHash !== false) {
        this._setHash(new URLSearchParams({ view: viewName, plotId }).toString(), false, false);
      }
      return;
    }

    if (viewName === 'crop-sandbox') {
      this.state.activeMainView = 'crop-sandbox';
      this.dom.homeFeedContent.hidden = true;
      this.dom.moduleContentPanel.hidden = true;
      this.dom.plotTelemetryPanel.hidden = true;
      this.setAmbientVisualsVisible(false);
      this.dom.subviewModal.classList.remove('active');
      this.farmMonitor?.close(false);
      const plot = this.state.plots.find(p => p.plotId === plotId) || this.state.plots[0];
      try {
        const cropSandbox = await this.ensureCropSandbox();
        if (!cropSandbox || viewGen !== this._subviewGen) {
          if (this.cropSandbox === cropSandbox) this.releaseCropSandbox();
          return;
        }
        cropSandbox.open(plotId, plot);
      } catch (error) {
        this.releaseCropSandbox();
        this.setAmbientVisualsVisible(true);
        this.showToast(`微观沙盘启动失败：${error?.message || '浏览器不支持 WebGL'}`, 'error');
        return;
      }
      this.dom.headerCurrentView.textContent = '微观作物双轨沙盘';
      document.querySelectorAll('.module-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
      });
      if (options.updateHash !== false) {
        this._setHash(new URLSearchParams({ view: viewName, plotId }).toString(), false, false);
      }
      return;
    }

    this.farmMonitor?.close(false);
    this.releaseCropSandbox();
    this.plotTelemetryView.close();
    this.setAmbientVisualsVisible(true);
    const meta = MOCK_DATA.subviewsMeta[viewName] || {
      title: viewName,
      desc: '预留独立子模块界面',
      tags: ['Reserved View'],
      status: '模块独立路由就绪'
    };

    const plot = this.state.plots.find(p => p.plotId === plotId) || this.state.plots[0];

    this.state.activeMainView = viewName;
    const target = inline ? this.dom.moduleContentBody : this.dom.modalDynamicContent;
    if (inline) {
      this.dom.homeFeedContent.hidden = true;
      this.dom.plotTelemetryPanel.hidden = true;
      this.dom.moduleContentPanel.hidden = false;
      this.dom.subviewModal.classList.remove('active');
      this.dom.moduleContentIcon.textContent = this.getViewIcon(viewName);
      this.dom.moduleContentTitle.textContent = `${meta.title} · 【${plot.name}】`;
      this.dom.moduleContentDescription.textContent = meta.desc || '功能模块';
      this.dom.moduleContentTag.textContent = meta.status || '模块已就绪';
    } else {
      this.dom.modalIcon.textContent = this.getViewIcon(viewName);
      this.dom.modalTitle.textContent = `${meta.title} · 【${plot.name}】`;
      this.dom.modalTag.textContent = meta.status;
      this.dom.subviewModal.classList.add('active');
    }

    // yyx 增强模块：异步渲染完整预测/回放/价值/Crop Pack 视图。
    const renderer = SUBVIEW_RENDERERS[viewName];
    if (renderer) {
      target.innerHTML = `<div class="agri-module-loading">正在加载${inline ? '功能模块' : '独立模块'}…</div>`;
      Promise.resolve(ensureViewStyles(viewName))
        .then(() => renderer(target, plotId, this))
        .then(cleanup => {
          if (viewGen !== this._subviewGen) {
            if (typeof cleanup === 'function') cleanup();
            return;
          }
          if (typeof cleanup === 'function') this._activeSubviewCleanup = cleanup;
        })
        .catch(error => {
          if (viewGen !== this._subviewGen) return;
          target.innerHTML = `<div class="agri-alert agri-alert-danger"><div class="agri-alert-icon">⚠️</div><div><strong>模块加载失败</strong><p>${this.escapeHtml(String(error?.message || error))}</p></div></div>`;
        });
    } else {
      // Render Contextual Data Preview
      this.renderSubviewContextualContent(viewName, plot, target);
    }

    this.dom.headerCurrentView.textContent = meta.title.split(' ')[0];

    // Highlight left nav item
    document.querySelectorAll('.module-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    // 仅弹窗路由需要保存主页滚动位置；导航区 inline 模块直接回到中心栏顶部。
    if (!inline && this._savedScrollPos === null) {
      this._savedScrollPos = { x: window.scrollX || 0, y: window.scrollY || 0 };
    }
    if (inline) this.dom.mainFeedArea?.scrollTo?.({ top: 0, behavior: 'smooth' });

    if (options.updateHash !== false) {
      const hash = new URLSearchParams({ view: viewName, plotId });
      if (inline) hash.set('inline', '1');
      this._setHash(hash.toString(), false, false);
    }
  }

  cleanupActiveSubview() {
    this._subviewGen = (this._subviewGen || 0) + 1;
    if (typeof this._activeSubviewCleanup === 'function') {
      try { this._activeSubviewCleanup(); } catch (error) { console.warn('Subview cleanup failed:', error); }
    }
    this._activeSubviewCleanup = null;
  }

  closeModal(updateHash = true) {
    this.cleanupActiveSubview();
    this.closeHomeDetail();
    this.dom.subviewModal.classList.remove('active');
    this.farmMonitor?.close(false);
    this.releaseCropSandbox();
    this.plotTelemetryView.close();
    if (this.dom.homeFeedContent) this.dom.homeFeedContent.hidden = false;
    if (this.dom.moduleContentPanel) this.dom.moduleContentPanel.hidden = true;
    if (this.dom.plotTelemetryPanel) this.dom.plotTelemetryPanel.hidden = true;
    if (this.dom.moduleContentBody) this.dom.moduleContentBody.innerHTML = '';
    this.state.activeMainView = 'home';
    this.applyHomeLayout(true);
    this.renderHomeSummary();
    this.setAmbientVisualsVisible(true);
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

  showHomeView(options = {}) {
    this.closeModal(options.updateHash !== false ? true : false);
    if (options.updateHash === false) this._lastHandledHash = window.location.hash;
  }

  showPlotTelemetryView(plotId, options = {}) {
    this.cleanupActiveSubview();
    this.closeHomeDetail();
    this.applyHomeLayout(false);
    this.farmMonitor?.close(false);
    this.releaseCropSandbox();
    this.dom.subviewModal.classList.remove('active');
    this.dom.homeFeedContent.hidden = true;
    this.dom.moduleContentPanel.hidden = true;
    this.dom.plotTelemetryPanel.hidden = false;
    this.setAmbientVisualsVisible(true);
    this.state.activeMainView = 'plot-telemetry';
    this.state.currentPlotId = plotId || this.state.currentPlotId;
    this.dom.headerCurrentView.textContent = '地块监测数据时序可视化';
    document.querySelectorAll('.module-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === 'plot-telemetry');
    });
    void this.plotTelemetryView.open(this.state.currentPlotId);
    if (options.updateHash !== false) {
      this._setHash(new URLSearchParams({ view: 'plot-telemetry', plotId: this.state.currentPlotId }).toString(), false, false);
    }
  }

  getViewIcon(viewName) {
    const map = {
      'plot-detail': '📊',
      'plot-telemetry': '📈',
      'decision-console': '🧠',
      'work-orders': '📋',
      'risk-forecast': '🔮',
      'crop-sandbox': '🧬',
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
    }

    container.innerHTML = contentHtml;
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
  app.init();
});
