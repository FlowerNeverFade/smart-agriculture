/**
 * AgriLoop Frontend - Main Application Controller
 * High-density operational dashboard with modular router & interactive closed-loop
 */
import { MOCK_DATA } from './mock-data.js';
import { api } from './api.js';

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
      authenticated: api.isAuthenticated(),
      user: api.getUser(),
      backendAiMode: null
    };

    this.dom = {};
  }

  async init() {
    this.cacheDom();
    this.bindEvents();

    // Check backend connection
    this.state.isLive = await api.checkHealth();
    if (this.state.isLive && api.isAuthenticated()) {
      await api.restoreSession();
    }
    this.syncAuthState();
    this.updateSystemStatusPill();

    // Load initial data
    await this.loadOverview();
    this.renderPlots();
    this.renderFeed();
    this.renderChangelog();
    this.handleRoute();

    window.addEventListener('hashchange', () => this.handleRoute());

    // A healthy deployment still requires a JWT. Make that boundary visible
    // immediately instead of letting the first chat silently use demo data.
    if (this.state.isLive && !api.isAuthenticated()) this.openAuthModal();
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
    this.dom.authModal = document.getElementById('authModal');
    this.dom.authForm = document.getElementById('authForm');
    this.dom.authUsername = document.getElementById('authUsername');
    this.dom.authPassword = document.getElementById('authPassword');
    this.dom.authError = document.getElementById('authError');
    this.dom.btnAuthSubmit = document.getElementById('btnAuthSubmit');
    this.dom.btnCloseAuthModal = document.getElementById('btnCloseAuthModal');
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
  }

  bindEvents() {
    // Logo Click -> Go to Home
    this.dom.btnLogoHome?.addEventListener('click', () => this.navigate('home'));

    // Quick Action button
    this.dom.btnQuickAction?.addEventListener('click', () => {
      this.openSubview('decision-console', { plotId: this.state.currentPlotId });
    });

    // Resource schedule click
    this.dom.btnViewResourceDetail?.addEventListener('click', () => {
      this.openSubview('resource-coordination');
    });

    // Authentication entry points
    this.dom.btnUserMenu?.addEventListener('click', () => {
      if (api.isAuthenticated()) {
        api.logout();
        this.state.authenticated = false;
        this.state.user = null;
        this.syncAuthState();
        this.updateSystemStatusPill();
        this.showToast('已退出登录；再次发送问题时会要求重新登录。', 'info');
      } else {
        this.openAuthModal();
      }
    });
    this.dom.btnCopilotLogin?.addEventListener('click', () => {
      if (api.isAuthenticated()) {
        this.dom.btnUserMenu?.click();
      } else {
        this.openAuthModal();
      }
    });
    this.dom.authForm?.addEventListener('submit', (e) => this.submitLogin(e));
    this.dom.btnCloseAuthModal?.addEventListener('click', () => this.closeAuthModal());
    this.dom.authModal?.addEventListener('click', (e) => {
      if (e.target === this.dom.authModal) this.closeAuthModal();
    });

    // Search input filter for plots
    this.dom.plotSearchInput?.addEventListener('input', (e) => {
      this.filterPlots(e.target.value);
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
        if (this.dom.authModal?.classList.contains('active')) this.closeAuthModal();
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
  }

  openAuthModal() {
    if (!this.dom.authModal) return;
    this.dom.authModal.classList.add('active');
    this.dom.authModal.setAttribute('aria-hidden', 'false');
    if (this.dom.authError) this.dom.authError.textContent = '';
    if (this.dom.authUsername && !this.dom.authUsername.value) this.dom.authUsername.value = 'farmer';
    window.setTimeout(() => {
      (this.dom.authUsername?.value ? this.dom.authPassword : this.dom.authUsername)?.focus();
    }, 0);
  }

  closeAuthModal() {
    if (!this.dom.authModal) return;
    this.dom.authModal.classList.remove('active');
    this.dom.authModal.setAttribute('aria-hidden', 'true');
  }

  async submitLogin(event) {
    event?.preventDefault();
    const username = this.dom.authUsername?.value.trim();
    const password = this.dom.authPassword?.value || '';
    if (!username || !password) {
      if (this.dom.authError) this.dom.authError.textContent = '请输入账号和密码。';
      return;
    }
    if (!this.state.isLive) {
      if (this.dom.authError) this.dom.authError.textContent = '后端当前不可达，请先确认公网服务已启动。';
      return;
    }

    if (this.dom.btnAuthSubmit) {
      this.dom.btnAuthSubmit.disabled = true;
      this.dom.btnAuthSubmit.textContent = '正在验证…';
    }
    if (this.dom.authError) this.dom.authError.textContent = '';
    try {
      const session = await api.login(username, password);
      this.state.user = session.user || api.getUser();
      this.syncAuthState();
      this.updateSystemStatusPill();
      this.closeAuthModal();
      await this.loadOverview();
      this.renderPlots(this.dom.plotSearchInput?.value || '');
      this.renderFeed();
      this.showToast(`已登录 ${username}。Copilot 现在会调用真实后端 AI。`, 'success');
    } catch (e) {
      if (this.dom.authError) {
        this.dom.authError.textContent = e.status === 401
          ? '账号或密码错误，请重试。'
          : `登录失败：${e.message || '后端未响应'}`;
      }
    } finally {
      if (this.dom.btnAuthSubmit) {
        this.dom.btnAuthSubmit.disabled = false;
        this.dom.btnAuthSubmit.textContent = '登录并连接 AI';
      }
    }
  }

  handleSessionExpired(showMessage = true) {
    api.logout();
    this.syncAuthState();
    this.updateSystemStatusPill();
    if (showMessage) {
      this.showToast('登录已过期，请重新登录后继续对话。', 'error');
      this.openAuthModal();
    }
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

  selectPlot(plotId) {
    this.state.currentPlotId = plotId;
    const plot = this.state.plots.find(p => p.plotId === plotId);
    if (plot && this.dom.currentPlotContextBadge) {
      this.dom.currentPlotContextBadge.textContent = `/ 当前选中：${plot.name} (${plot.cropName} · ${plot.stageLabel})`;
    }
    this.renderPlots(this.dom.plotSearchInput?.value || '');
    this.showToast(`已切换当前工作地块至：${plot ? plot.name : plotId}`, 'info');
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
      this.openAuthModal();
      this.showToast('请先登录，再申请真实灌溉执行。', 'info');
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
      this.openAuthModal();
      this.showToast('请先登录，再生成真实处方。', 'info');
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
      this.openAuthModal();
      this.showToast('请先登录；登录后这里会调用真实 Qwen3.8-27B。', 'info');
      return;
    }

    this.dom.btnSendCopilot.disabled = true;
    this.dom.btnSendCopilot.innerHTML = `<span>⏳ 分析中...</span>`;

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

  displayCopilotBanner(response) {
    if (!this.dom.copilotOutputBanner) return;
    this.dom.copilotOutputBanner.classList.add('active');
    this.dom.copilotTraceId.textContent = `traceId: ${response.traceId || 'run-mock'}`;

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
        const model = response.llm?.model || 'Qwen3.8-27B';
        this.dom.copilotConnectionStatus.textContent = `已连接 · ${model} · 规则事实 + 模型解释`;
      } else if (response.degraded) {
        this.dom.copilotConnectionStatus.textContent = `后端在线 · ${response.degradationReason || 'AI 降级'} · 规则结果仍可用`;
      }
    }
    if (hasQwenNarrative) this.dom.rightAiModeTag.textContent = `${response.llm?.model || 'Qwen3.8-27B'} · 已连接`;

    let citations = '';
    const evidenceLabels = this.formatKnowledgeEvidence(response.knowledgeEvidence);
    if (evidenceLabels.length > 0) citations = `\n\n📚 依据：${[...new Set(evidenceLabels)].join(' · ')}`;

    const body = this.sanitizeNarrative(response.narrative || response.summary || '后端未返回可展示的回答。')
      || '后端未返回可展示的回答。';
    const metadata = response.llm
      ? `\n\n模型：${response.llm.model || 'openai-compatible'} · 延迟：${response.llm.latencyMs ?? '—'} ms`
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
    const plotId = options.plotId || this.state.currentPlotId;
    const meta = MOCK_DATA.subviewsMeta[viewName] || {
      title: viewName,
      desc: '预留独立子模块界面',
      tags: ['Reserved View'],
      status: '模块独立路由就绪'
    };

    const plot = this.state.plots.find(p => p.plotId === plotId) || this.state.plots[0];

    this.dom.modalIcon.textContent = this.getViewIcon(viewName);
    this.dom.modalTitle.textContent = `${meta.title} · 【${plot.name}】`;
    this.dom.modalTag.textContent = meta.status;
    this.dom.placeholderTitle.textContent = `${meta.title}`;
    this.dom.placeholderDesc.textContent = meta.desc;

    // Render Contextual Data Preview
    this.renderSubviewContextualContent(viewName, plot);

    // Render Code Contract / API Endpoint Spec
    this.dom.modalCodeContract.textContent = this.getViewCodeContract(viewName, plot);

    this.dom.subviewModal.classList.add('active');
    this.dom.headerCurrentView.textContent = meta.title.split(' ')[0];

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
    this.dom.headerCurrentView.textContent = "Home (农智总览)";
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
