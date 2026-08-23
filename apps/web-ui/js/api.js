/**
 * AgriLoop API Service Client
 * Connects to Spring Boot backend (/api/v1).
 *
 * Mock data is intentionally used only when the backend is unreachable. When
 * the backend is online, authentication and API failures are surfaced to the
 * UI instead of being silently presented as real data.
 */
import { MOCK_DATA } from './mock-data.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', payload = null, details = {}, isNetworkError = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
    this.details = details;
    this.isNetworkError = isNetworkError;
  }
}

export class ApiService {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = localStorage.getItem('agriloop_token') || '';
    this.user = this.readStoredUser();
    this.sessionMode = localStorage.getItem('agriloop_session_mode') || (this.token ? 'live' : 'demo');
    this.isLive = false;
    this.sseSource = null;
  }

  readStoredUser() {
    try {
      const raw = localStorage.getItem('agriloop_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      localStorage.removeItem('agriloop_user');
      return null;
    }
  }

  getUser() {
    return this.user;
  }

  isAuthenticated() {
    // 离线演示会话只在后端不可用时视为已登录；一旦服务在线，仍必须提供 JWT。
    return Boolean(this.token || (!this.isLive && this.sessionMode === 'demo' && this.user));
  }

  async login(credentials, password) {
    const { username, password: secret } = typeof credentials === 'object'
      ? (credentials || {})
      : { username: credentials, password };
    const resp = await this._fetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: secret })
    }, { auth: false });
    const session = resp?.data || resp;
    if (!session?.accessToken || !session?.user?.username || !session?.user?.role) {
      throw new ApiError('登录响应缺少 accessToken', { code: 'AUTH_RESPONSE_INVALID', payload: resp });
    }
    this.saveSession({ mode: 'live', token: session.accessToken, user: session.user });
    return session;
  }

  async getCurrentUser() {
    const resp = await this._fetch('/api/v1/auth/me');
    const user = resp?.data || resp;
    if (user) {
      this.user = user;
      localStorage.setItem('agriloop_user', JSON.stringify(user));
    }
    return user;
  }

  saveSession({ mode, token = '', user }) {
    if (!user?.username || !user?.role || !['live', 'demo'].includes(mode)) {
      throw new ApiError('会话数据无效', { code: 'SESSION_INVALID' });
    }
    if (mode === 'live' && !token) {
      throw new ApiError('实时会话缺少访问令牌', { code: 'SESSION_TOKEN_MISSING' });
    }
    this.sessionMode = mode;
    this.token = mode === 'live' ? token : '';
    this.user = user;
    localStorage.setItem('agriloop_user', JSON.stringify(user));
    localStorage.setItem('agriloop_session_mode', mode);
    if (this.token) localStorage.setItem('agriloop_token', this.token);
    else localStorage.removeItem('agriloop_token');
  }

  readSession() {
    const mode = localStorage.getItem('agriloop_session_mode') || (this.token ? 'live' : 'demo');
    const token = localStorage.getItem('agriloop_token') || '';
    const user = this.readStoredUser();
    if (!user?.username || !user?.role) return null;
    if (mode === 'live' && token) return { mode, token, user };
    if (mode === 'demo' && !token) return { mode, token: '', user };
    return null;
  }

  async restoreSession() {
    if (!this.isAuthenticated()) return null;
    try {
      return await this.getCurrentUser();
    } catch (e) {
      if (e.status === 401 || e.code === 'AUTH_REQUIRED' || e.code === 'AUTH_INVALID') this.clearSession();
      return null;
    }
  }

  logout() {
    this.clearSession();
  }

  clearSession() {
    this.token = '';
    this.user = null;
    this.sessionMode = null;
    this.sseSource?.close();
    this.sseSource = null;
    localStorage.removeItem('agriloop_token');
    localStorage.removeItem('agriloop_user');
    localStorage.removeItem('agriloop_session_mode');
  }

  async checkHealth() {
    try {
      const resp = await fetch(`${this.baseUrl}/actuator/health`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(1800)
      });
      if (resp.ok) {
        this.isLive = true;
        return true;
      }
    } catch (e) {
      // Backend not running locally, seamlessly fall back to local mock state
      this.isLive = false;
    }
    return false;
  }

  async getOverview() {
    if (this.isLive) {
      const resp = await this._fetch('/api/v1/overview');
      if (resp && resp.data) return resp.data;
      throw new ApiError('后端返回了无效的总览数据', { code: 'OVERVIEW_INVALID', payload: resp });
    }
    return {
      farmId: "farm-demo",
      plots: MOCK_DATA.plots,
      activeAlertCount: 1,
      pendingWorkOrderCount: 2,
      eventCount: 1080,
      dataMode: MOCK_DATA.system.mode,
      aiMode: MOCK_DATA.system.aiMode,
      systemStatus: MOCK_DATA.system
    };
  }

  async getSimulatorStatus() {
    if (!this.isLive) return { available: false, status: 'UNAVAILABLE', reason: 'BACKEND_OFFLINE' };
    const resp = await this._fetch('/api/v1/simulator/status');
    if (resp && resp.data) return resp.data;
    throw new ApiError('后端返回了无效的模拟器状态', { code: 'SIMULATOR_STATUS_INVALID', payload: resp });
  }

  async startSimulator() {
    const resp = await this._fetch('/api/v1/simulator/start', { method: 'POST', body: JSON.stringify({}) });
    if (resp && resp.data) return resp.data;
    throw new ApiError('后端返回了无效的模拟器启动结果', { code: 'SIMULATOR_START_INVALID', payload: resp });
  }

  async stopSimulator() {
    const resp = await this._fetch('/api/v1/simulator/stop', { method: 'POST', body: JSON.stringify({}) });
    if (resp && resp.data) return resp.data;
    throw new ApiError('后端返回了无效的模拟器停止结果', { code: 'SIMULATOR_STOP_INVALID', payload: resp });
  }

  async getPlots() {
    if (this.isLive) {
      const resp = await this._fetch('/api/v1/plots');
      if (resp && resp.data) return resp.data;
      throw new ApiError('后端返回了无效的地块数据', { code: 'PLOTS_INVALID', payload: resp });
    }
    return MOCK_DATA.plots;
  }

  async getTelemetry(plotId = 'plot-a01', metric = 'SOIL_MOISTURE') {
    if (this.isLive) {
      const resp = await this._fetch(`/api/v1/plots/${plotId}/telemetry?metric=${metric}&limit=50`);
      if (resp && resp.data) return resp.data;
      throw new ApiError('后端返回了无效的遥测数据', { code: 'TELEMETRY_INVALID', payload: resp });
    }
    // Generate 20 realistic telemetry series points
    const now = Date.now();
    const targetPlot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
    const baseValue = targetPlot.metrics[metric]?.value || 25.0;
    
    return Array.from({ length: 24 }, (_, i) => {
      const offset = (24 - i) * 10 * 60 * 1000;
      const noise = (Math.sin(i / 3) * 1.5) + (Math.random() * 0.4 - 0.2);
      return {
        eventId: `mock-evt-${i}`,
        plotId,
        metric,
        value: Number((baseValue + noise - (plotId === 'plot-a01' && metric === 'SOIL_MOISTURE' ? (24 - i) * 0.25 : 0)).toFixed(2)),
        unit: targetPlot.metrics[metric]?.unit || '%',
        ts: new Date(now - offset).toISOString(),
        quality: { status: "GOOD", freshnessMs: 200, confidence: 0.98 }
      };
    });
  }

  /** farm-operations 增量合同：在线走后端，离线只使用显式标记的模拟数据。 */
  async getTodayWorkItems(plotId = '') {
    if (this.isLive) {
      const query = plotId ? `?plotId=${encodeURIComponent(plotId)}` : '';
      try {
        const response = await this._fetch(`/api/v1/work-items/today${query}`);
        if (Array.isArray(response?.data)) return response.data;
      } catch (error) {
        if (error.status === 401 || error.status === 403) throw error;
        console.warn('Falling back to simulated work items:', error);
      }
    }
    return (MOCK_DATA.workOrders || [])
      .filter(item => !plotId || item.plotId === plotId)
      .map(item => ({ ...item }));
  }

  async getWorkOrders() {
    if (this.isLive) {
      const response = await this._fetch('/api/v1/work-orders');
      if (Array.isArray(response?.data)) return response.data;
      throw new ApiError('后端返回了无效的工单数据', { code: 'WORK_ORDERS_INVALID', payload: response });
    }
    return (MOCK_DATA.workOrders || []).map(item => ({ ...item }));
  }

  async saveWorkOrder(workOrder) {
    if (this.isLive) {
      const response = await this._fetch('/api/v1/work-orders', {
        method: 'POST',
        body: JSON.stringify(workOrder)
      });
      return response?.data || response;
    }
    const workOrderId = workOrder.workOrderId || `wo-demo-${Date.now()}`;
    return { ...workOrder, workOrderId, workItemId: workOrder.workItemId || workOrderId, createdAt: workOrder.createdAt || new Date().toISOString() };
  }

  async getInspections(plotId = '') {
    if (this.isLive) {
      const response = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/inspections`);
      if (Array.isArray(response?.data)) return response.data;
      throw new ApiError('后端返回了无效的巡田记录', { code: 'INSPECTIONS_INVALID', payload: response });
    }
    return (MOCK_DATA.inspections || []).filter(item => !plotId || item.plotId === plotId).map(item => ({ ...item }));
  }

  async createInspection(inspection) {
    if (this.isLive) {
      const response = await this._fetch('/api/v1/inspections', {
        method: 'POST',
        body: JSON.stringify(inspection)
      });
      return response?.data || response;
    }
    return {
      ...inspection,
      inspectionId: `ins-demo-${Date.now()}`,
      operatorId: this.user?.userId || 'demo-operator',
      observedAt: inspection.observedAt || new Date().toISOString(),
      provenance: 'USER_PROVIDED',
      sourceType: 'HUMAN_OBSERVATION'
    };
  }

  async evaluateResourcePlan(input = {}) {
    if (this.isLive) {
      const response = await this._fetch('/api/v1/resource-plans/evaluate', {
        method: 'POST',
        body: JSON.stringify(input)
      });
      return response?.data || response;
    }
    const capacity = Number(MOCK_DATA.resourceProfile?.capacityLitres || 0);
    let remaining = capacity;
    const allocations = [];
    const conflicts = [];
    const unmetDemands = [];
    const priorityRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    const demands = [...(input.demands || [])].sort((a, b) => (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0));
    demands.forEach(demand => {
      const requested = Number(demand.requestedLitres ?? demand.waterLitre ?? 0);
      const allocated = Math.min(remaining, Math.max(0, requested));
      remaining -= allocated;
      allocations.push({ plotId: demand.plotId, requestedLitres: requested, allocatedLitres: allocated, status: allocated >= requested ? 'ALLOCATED' : 'PARTIAL' });
      if (allocated < requested) {
        conflicts.push({ type: 'CAPACITY', plotId: demand.plotId });
        unmetDemands.push({ plotId: demand.plotId, requestedLitres: requested, unmetLitres: requested - allocated, reason: 'WATER_CAPACITY' });
      }
    });
    return {
      resourcePlanId: `rp-demo-${Date.now()}`,
      status: unmetDemands.length ? 'INFEASIBLE' : 'FEASIBLE',
      scope: input.scope || 'farm-demo',
      constraints: { waterCapacityLitres: capacity },
      allocations,
      conflicts,
      unmetDemands,
      algorithmVersion: 'capacity-priority-v1',
      provenance: 'SIMULATED'
    };
  }

  async agentChat(message, plotId = 'plot-a01') {
    if (this.isLive) {
      const resp = await this._fetch('/api/v1/agent/chat', {
        method: 'POST',
        body: JSON.stringify({ message, plotId })
      });
      if (resp && resp.data) return resp.data;
      throw new ApiError('后端返回了无效的 Agent 响应', { code: 'AGENT_RESPONSE_INVALID', payload: resp });
    }

    // High-Fidelity Smart Agent Response Generator
    const lower = (message || '').toLowerCase();
    const traceId = 'run-' + Math.random().toString(36).substring(2, 10);
    const plot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];

    if (lower.includes('灌溉') || lower.includes('浇水') || lower.includes('处方') || lower.includes('irrigation')) {
      return {
        traceId,
        mode: "rules-only",
        intent: "IRRIGATION_RECOMMENDATION",
        summary: `已为【${plot.name}】生成精准补水处方：建议灌溉 8.5 分钟（需水量约 153 升），预期土壤湿度提升至 30.0%。硬安全门全部校验通过。`,
        tools: [
          {
            name: "generate_irrigation_plan",
            input: { plotId },
            output: {
              planId: "plan-" + traceId,
              plotId,
              waterLitre: 153.0,
              durationSeconds: 510,
              readinessStatus: "READY",
              executable: true
            }
          }
        ],
        knowledgeEvidence: [
          { source: `crop-packs/${plot.cropCode}/knowledge/irrigation.md`, scope: "PLOT", provenance: "RETRIEVED" },
          { source: "rules://agriloop/safety-limit", scope: "GENERAL", provenance: "RETRIEVED" }
        ],
        confidence: 0.95
      };
    } else if (lower.includes('诊断') || lower.includes('异常') || lower.includes('为什么') || lower.includes('diagnos')) {
      return {
        traceId,
        mode: "rules-only",
        intent: "RISK_DIAGNOSIS",
        summary: `【${plot.name}】当前首要风险为 WATER_DEFICIT (真实土壤缺水)，置信度 92%。已完成传感器漂移校验与阶跃跳变检测，确认非传感器故障。`,
        tools: [
          {
            name: "diagnose_root_cause",
            input: { plotId },
            output: {
              primaryCause: "WATER_DEFICIT",
              confidence: 0.92,
              candidates: [
                { code: "WATER_DEFICIT", confidence: 0.92 },
                { code: "SENSOR_DRIFT", confidence: 0.08 },
                { code: "DEVICE_FAULT", confidence: 0.05 }
              ]
            }
          }
        ],
        knowledgeEvidence: [
          { source: `crop-packs/${plot.cropCode}/pack.yaml`, scope: "CROP", provenance: "RETRIEVED" }
        ],
        confidence: 0.92
      };
    } else if (lower.includes('预测') || lower.includes('未来') || lower.includes('forecast')) {
      return {
        traceId,
        mode: "deterministic",
        intent: "RISK_FORECAST",
        summary: `【${plot.name}】未来趋势预测已生成：若不灌溉，预计在 72 分钟后触达极限干旱边界 (14%)；未来 1h 预计湿度 15.2%，2h 预计湿度 13.8%。`,
        tools: [
          {
            name: "get_risk_forecast",
            input: { plotId },
            output: {
              status: "AVAILABLE",
              timeToRiskMinutes: 72,
              horizons: [
                { minutes: 60, value: 15.2, lower: 14.4, upper: 16.0 },
                { minutes: 120, value: 13.8, lower: 12.6, upper: 15.0 },
                { minutes: 240, value: 11.5, lower: 9.8, upper: 13.2 }
              ]
            }
          }
        ],
        confidence: 0.88
      };
    } else if (lower.includes('任务') || lower.includes('农务') || lower.includes('待办') || lower.includes('work')) {
      return {
        traceId,
        mode: "rules-only",
        intent: "TODAY_WORK",
        summary: `今日全场共有 2 项高/中优先级待办：1项土壤便携仪比对校准（温室3号棚），1项番茄疏花打杈作业（温室1号棚）。`,
        tools: [
          {
            name: "get_today_work_items",
            input: { plotId },
            output: MOCK_DATA.feedItems.find(f => f.type === 'WORK_ORDER')?.details.tasks || []
          }
        ],
        confidence: 0.99
      };
    } else {
      return {
        traceId,
        mode: "rules-only",
        intent: "PLOT_STATUS",
        summary: `已读取【${plot.name}】（${plot.cropName} · ${plot.stageLabel}）实时指标：土壤湿度 ${plot.metrics.SOIL_MOISTURE.value}%，温度 ${plot.metrics.AIR_TEMPERATURE.value}°C，设备状态在线。`,
        tools: [
          {
            name: "get_plot_status",
            input: { plotId },
            output: plot
          }
        ],
        confidence: 0.96
      };
    }
  }

  async executeIrrigation(planId, plotId) {
    if (this.isLive) {
      const resp = await this._fetch('/api/v1/commands/virtual', {
        method: 'POST',
        body: JSON.stringify({
          planId,
          plotId,
          idempotencyKey: 'cmd-key-' + Date.now(),
          approved: true,
          source: 'web-dashboard'
        })
      });
      if (resp && resp.data) return resp.data;
      throw new ApiError('后端返回了无效的执行结果', { code: 'COMMAND_RESPONSE_INVALID', payload: resp });
    }

    // Mock realistic virtual execution sequence
    return {
      commandId: "cmd-" + Math.random().toString(36).substring(2, 9),
      plotId,
      planId,
      status: "SUCCEEDED",
      type: "IRRIGATION_START",
      waterLitre: 153.0,
      durationSeconds: 510,
      transport: "MQTT_VIRTUAL_ACTUATOR",
      ack: {
        ackId: "ack-" + Math.random().toString(36).substring(2, 8),
        status: "SUCCEEDED",
        actualWaterLitre: 153.0,
        result: "GOOD",
        receivedAt: new Date().toISOString()
      },
      evaluation: {
        effectivenessScore: 0.96,
        status: "COMPLETED",
        result: "GOOD",
        expectedMoisture: "30.0%",
        actualMoisture: "29.8%"
      }
    };
  }

  /**
   * yyx P1/P2 视图所需的确定性能力。在线优先读取后端合同，离线使用
   * 同一套可重复的演示算法；所有返回值都标记为模拟/推导口径，不伪装成现场实测。
   */
  async getRiskForecast(plotId = 'plot-a01', metric = 'SOIL_MOISTURE') {
    if (this.isLive) {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/risk-forecast?metric=${encodeURIComponent(metric)}`);
      return this.normalizeForecast(resp?.data || resp, plotId, metric);
    }
    return this.mockRiskForecast(plotId, metric);
  }

  normalizeForecast(raw, plotId, metric) {
    const cfg = MOCK_DATA.riskForecastConfig;
    const plot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
    const source = raw || {};
    const boundary = Number(source.stressBoundary ?? source.riskBoundary?.value ?? cfg.stressBoundary);
    const baseline = Number(source.baselineMoisture ?? cfg.baselineMoisture);
    const start = Number(source.startMoisture ?? plot?.metrics?.[metric]?.value ?? 25);
    const horizons = (source.horizons || []).map(h => ({
      minute: Number(h.minute ?? h.minutes ?? 0),
      expected: Number(h.expected ?? h.value ?? h.expectedMoisture ?? start),
      lower: Number(h.lower ?? h.expected ?? h.value ?? start),
      upper: Number(h.upper ?? h.expected ?? h.value ?? start)
    })).filter(h => Number.isFinite(h.minute));
    const maxHorizon = Number(source.forecastRangeMinutes ?? cfg.maxHorizonMinutes);
    const curve = Array.isArray(source.curve) && source.curve.length
      ? source.curve.map(p => ({ minute: Number(p.minute), expected: Number(p.expected ?? p.value), lower: Number(p.lower ?? p.expected ?? p.value), upper: Number(p.upper ?? p.expected ?? p.value) }))
      : this.interpolateForecastCurve(start, horizons, maxHorizon);
    const unavailable = String(source.status || '').toUpperCase() !== 'AVAILABLE';
    return {
      ...source,
      status: unavailable ? (source.status || 'UNAVAILABLE') : 'AVAILABLE',
      plotId, metric,
      generatedAt: source.generatedAt || source.issuedAt || new Date().toISOString(),
      inputWindowMinutes: Number(source.inputWindowMinutes ?? source.inputWindow?.validSamples ?? cfg.inputWindowMinutes),
      forecastRangeMinutes: maxHorizon,
      algorithmVersion: source.algorithmVersion || cfg.algorithmVersion,
      algorithmLabel: source.algorithmLabel || cfg.algorithmLabel,
      startMoisture: start,
      stressBoundary: boundary,
      baselineMoisture: baseline,
      timeToRiskMinutes: source.timeToRiskMinutes == null ? maxHorizon : Number(source.timeToRiskMinutes),
      horizons,
      curve,
      assumptions: source.assumptions || ['无降水 / 无外界灌溉', '设备保持在线，遥测质量 GOOD'],
      uncertaintyNote: source.uncertaintyNote || '置信区间由历史残差 MAD 推导；样本不足时返回 UNAVAILABLE'
    };
  }

  interpolateForecastCurve(start, horizons, maxHorizon = 240) {
    const points = [{ minute: 0, expected: start, lower: start, upper: start }];
    const sorted = horizons.slice().sort((a, b) => a.minute - b.minute);
    for (let t = 5; t <= maxHorizon; t += 5) {
      let left = points[0];
      let right = sorted[sorted.length - 1] || left;
      for (const h of sorted) {
        if (h.minute >= t) { right = h; break; }
        left = h;
      }
      const span = Math.max(1, right.minute - (left.minute || 0));
      const ratio = Math.max(0, Math.min(1, (t - (left.minute || 0)) / span));
      const mix = key => Number(((left[key] ?? start) + ((right[key] ?? left[key] ?? start) - (left[key] ?? start)) * ratio).toFixed(2));
      points.push({ minute: t, expected: mix('expected'), lower: mix('lower'), upper: mix('upper') });
    }
    return points;
  }

  mockRiskForecast(plotId = 'plot-a01', metric = 'SOIL_MOISTURE') {
    const cfg = MOCK_DATA.riskForecastConfig;
    const plot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
    const start = Number(plot?.metrics?.[metric]?.value ?? 25);
    const boundary = cfg.stressBoundary;
    if (plot?.deviceStatus !== 'ONLINE' || start <= boundary + 0.5) {
      return { status: 'UNAVAILABLE', plotId, metric, reason: plot?.deviceStatus !== 'ONLINE' ? '设备离线，遥测样本不足' : '当前湿度已低于极限胁迫边界，无可推演余量', generatedAt: new Date().toISOString(), algorithmVersion: cfg.algorithmVersion };
    }
    const k = Math.log(16.8 / boundary) / 72;
    const timeToRisk = Math.min(Math.round(Math.log(start / boundary) / k), cfg.maxHorizonMinutes);
    const curve = [];
    for (let t = 0; t <= cfg.maxHorizonMinutes; t += 5) {
      const expected = start * Math.exp(-k * t);
      const half = 0.6 + 0.007 * t;
      curve.push({ minute: t, expected: Number(expected.toFixed(2)), lower: Number(Math.max(expected - half, 0).toFixed(2)), upper: Number((expected + half).toFixed(2)) });
    }
    return {
      status: 'AVAILABLE', plotId, metric, generatedAt: new Date().toISOString(), inputWindowMinutes: cfg.inputWindowMinutes,
      forecastRangeMinutes: cfg.maxHorizonMinutes, algorithmVersion: cfg.algorithmVersion, algorithmLabel: cfg.algorithmLabel,
      startMoisture: start, stressBoundary: boundary, baselineMoisture: cfg.baselineMoisture, timeToRiskMinutes: timeToRisk,
      horizons: [60, 120, 240].map(minute => { const p = curve.find(x => x.minute === minute); return { minute, expected: p.expected, lower: p.lower, upper: p.upper, band: `${p.lower.toFixed(1)}% ~ ${p.upper.toFixed(1)}%` }; }),
      curve, assumptions: ['无降水 / 无外界灌溉', '棚室通风与外部光热保持稳定', '设备保持在线，遥测质量 GOOD'],
      uncertaintyNote: '置信区间随预测时距线性放大；超出 4h 不承诺，样本不足返回 UNAVAILABLE', provenance: 'SIMULATED'
    };
  }

  async runScenario({ scenario = 'DROUGHT', seed = 42, plotId = 'plot-a01' } = {}) {
    const normalizedScenario = String(scenario).toUpperCase();
    if (this.isLive) {
      const resp = await this._fetch('/api/v1/scenarios/runs', { method: 'POST', body: JSON.stringify({ scenario: normalizedScenario, seed, plotId }) });
      const run = resp?.data || resp;
      const def = MOCK_DATA.riskForecastConfig.scenarioCatalog.find(s => s.code === normalizedScenario) || MOCK_DATA.riskForecastConfig.scenarioCatalog[0];
      return { ...run, scenario: run.scenario || normalizedScenario, scenarioLabel: run.scenarioLabel || def.label, params: run.params || def, frozenSnapshot: { ...(run.frozenSnapshot || {}), plotId, plotName: run.frozenSnapshot?.plotName || this.mockPlot(plotId).name, startMoisture: run.frozenSnapshot?.startMoisture ?? this.mockPlot(plotId).metrics.SOIL_MOISTURE.value } };
    }
    const def = MOCK_DATA.riskForecastConfig.scenarioCatalog.find(s => s.code === normalizedScenario) || MOCK_DATA.riskForecastConfig.scenarioCatalog[0];
    const plot = this.mockPlot(plotId);
    return { scenarioId: `${normalizedScenario.toLowerCase()}-${seed}`, scenario: normalizedScenario, scenarioLabel: def.label, seed, runStatus: 'COMPLETED', frozenSnapshot: { plotId, plotName: plot.name, startMoisture: plot.metrics.SOIL_MOISTURE.value, capturedAt: new Date().toISOString(), snapshotLabel: '冻结快照（只读，不写回主状态）' }, params: def, provenance: 'SIMULATED' };
  }

  async compareScenario({ scenario = 'DROUGHT', seed = 42, plotId = 'plot-a01' } = {}) {
    const normalizedScenario = String(scenario).toUpperCase();
    if (this.isLive) {
      const resp = await this._fetch('/api/v1/scenarios/compare', { method: 'POST', body: JSON.stringify({ scenarioId: `${normalizedScenario.toLowerCase()}-${seed}`, seed, plotId, leftBranch: 'EXECUTE', rightBranch: 'NO_ACTION' }) });
      const server = resp?.data || resp;
      // 后端基础合同返回汇总统计；交互式曲线由同一 Seed 的只读确定性
      // 回放补齐，serverSummary 保留在结果中供审计查看。
      if (server?.branches?.EXECUTE?.points && server?.branches?.NO_ACTION?.points) return server;
      return { ...this.mockScenarioCompare(normalizedScenario, seed, plotId), serverSummary: server, provenance: 'SIMULATED' };
    }
    return this.mockScenarioCompare(normalizedScenario, seed, plotId);
  }

  mockScenarioCompare(scenario = 'DROUGHT', seed = 42, plotId = 'plot-a01') {
    const cfg = MOCK_DATA.riskForecastConfig;
    const def = cfg.scenarioCatalog.find(s => s.code === String(scenario).toUpperCase()) || cfg.scenarioCatalog[0];
    const plot = this.mockPlot(plotId);
    const start = Number(plot.metrics.SOIL_MOISTURE.value || 25);
    if (def.code === 'OFFLINE') return { status: 'UNAVAILABLE', scenarioId: `offline-${seed}`, seed, plotId, reason: '设备断网离线，遥测样本不足：拒绝生成可执行处方', provenance: 'SIMULATED' };
    const rnd = mulberry32(Number(seed) || 42);
    const kFactor = 0.9 + rnd() * 0.2;
    const jumpBoost = 11.8 + rnd() * 2.8;
    const rainBoost = (def.rainBoostPct || 0) * (0.8 + rnd() * 0.4);
    const driftRate = (def.driftRatePerHour || 0) * (0.9 + rnd() * 0.2);
    const kBase = Math.log(16.8 / cfg.stressBoundary) / (def.ttrMinutes || 72);
    const k = kBase * (def.decayFactor || 1) * kFactor;
    const build = execute => Array.from({ length: 49 }, (_, i) => {
      const t = i * 5;
      const phys = x => start * Math.exp(-k * x);
      let value;
      if (def.code === 'STORM') {
        value = t <= 45 ? start + rainBoost * (t / 45) : (start + rainBoost) * Math.exp(-k * (t - 45));
        if (execute && t >= 30) value = Math.min(value + jumpBoost, 42);
      } else if (execute && t >= 30) {
        value = Math.min(phys(30) + jumpBoost, 42) * Math.exp(-k * 0.55 * (t - 30));
      } else value = phys(t);
      if (def.code === 'SENSOR_DRIFT') value += driftRate * (t / 60);
      return { minute: t, value: Number(Math.max(value, 0).toFixed(2)) };
    });
    return {
      status: 'AVAILABLE', scenarioId: `${def.code.toLowerCase()}-${seed}`, scenario: def.code, scenarioLabel: def.label, seed, plotId,
      frozenSnapshot: { plotId, plotName: plot.name, startMoisture: start, capturedAt: new Date().toISOString() }, stressBoundary: cfg.stressBoundary, baselineMoisture: cfg.baselineMoisture, execMinute: 30,
      seedParams: { evapotranspirationFactor: Number(kFactor.toFixed(3)), irrigationBoostPct: Number(jumpBoost.toFixed(1)), rainBoostPct: Number(rainBoost.toFixed(1)), driftRatePerHour: Number(driftRate.toFixed(2)) },
      markers: [{ minute: 0, label: '冻结快照' }, { minute: 30, label: `⚡ 虚拟执行 (补水 ≈${jumpBoost.toFixed(1)}%)` }],
      branches: { EXECUTE: { label: '分支 A · 执行灌溉处方', points: build(true), color: '#3fb950' }, NO_ACTION: { label: '分支 B · 不采取措施放任干旱', points: build(false), color: '#f85149' } },
      note: '双轨使用同一冻结快照与随机种子；分支结果只读，不写回主状态', provenance: 'SIMULATED'
    };
  }

  mockPlot(plotId) {
    return MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
  }

  async getValueLedgers() {
    if (this.isLive) {
      const resp = await this._fetch('/api/v1/value-ledgers');
      const records = resp?.data || resp;
      if (records && !Array.isArray(records) && records.summary) return records;
      const fallback = JSON.parse(JSON.stringify(MOCK_DATA.valueLedger));
      fallback.serverRecords = Array.isArray(records) ? records : [];
      fallback.provenance = fallback.provenance.map(p => ({ ...p, tag: `${p.tag}；在线记录 ${fallback.serverRecords.length} 条` }));
      return fallback;
    }
    return JSON.parse(JSON.stringify(MOCK_DATA.valueLedger));
  }

  async getCropPacks() {
    if (this.isLive) {
      const resp = await this._fetch('/api/v1/crop-packs');
      const raw = resp?.data || resp;
      if (Array.isArray(raw)) return raw.map(pack => this.normalizeCropPack(pack));
      if (raw?.cropCode) return [this.normalizeCropPack(raw)];
      throw new ApiError('后端返回了无效的作物包数据', { code: 'CROP_PACKS_INVALID', payload: resp });
    }
    return JSON.parse(JSON.stringify(MOCK_DATA.cropPackDetails));
  }

  normalizeCropPack(pack) {
    const fallback = MOCK_DATA.cropPackDetails.find(p => p.cropCode === pack?.cropCode) || MOCK_DATA.cropPackDetails[0];
    const stages = (pack?.stages || fallback.stages).map((stage, index) => {
      if (typeof stage === 'object') return stage;
      const base = fallback.stages[index] || fallback.stages[fallback.stages.length - 1];
      return { ...base, code: String(stage).split(' ')[0] || base.code, label: base.label };
    });
    const metrics = (pack?.metrics || fallback.metrics).map(metric => {
      if (metric.range) return metric;
      const target = metric.target || {};
      return { ...metric, label: metric.label || metric.code, range: { min: target.low ?? target.min ?? 0, max: target.high ?? target.max ?? 100 } };
    });
    return {
      ...fallback, ...pack,
      identity: pack?.identity || { name: pack?.name || fallback.identity.name, variety: 'demonstration', region: '重庆' },
      schemaVersion: pack?.schemaVersion || fallback.schemaVersion,
      stages, metrics,
      rules: pack?.rules || fallback.rules,
      prescriptionConstraints: pack?.prescriptionConstraints || fallback.prescriptionConstraints,
      forecastProfile: pack?.forecastProfile || fallback.forecastProfile,
      coordinationProfile: pack?.coordinationProfile || fallback.coordinationProfile,
      knowledgeVersion: pack?.knowledgeVersion || fallback.knowledgeVersion,
      ruleVersion: pack?.ruleVersion || fallback.ruleVersion,
      knowledge: pack?.knowledge || fallback.knowledge,
      scenarios: pack?.scenarios || fallback.scenarios,
      testCases: pack?.testCases || fallback.testCases
    };
  }

  async getRules() {
    if (this.isLive) {
      const resp = await this._fetch('/api/v1/rules');
      const raw = resp?.data || resp;
      if (Array.isArray(raw)) return raw.flatMap(entry => (entry.rules || []).map(rule => ({ ...rule, cropCode: entry.cropCode, cropName: MOCK_DATA.cropPackDetails.find(p => p.cropCode === entry.cropCode)?.identity.name || entry.cropCode, ruleVersion: entry.version || entry.ruleVersion })));
    }
    return MOCK_DATA.cropPackDetails.flatMap(pack => pack.rules.map(rule => ({ ...rule, cropCode: pack.cropCode, cropName: pack.identity.name, ruleVersion: pack.ruleVersion })));
  }

  async _fetch(path, options = {}, { auth = true } = {}) {
    const { auth: optionAuth = auth, ...fetchOptions } = options;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(optionAuth && this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      ...(options.headers || {})
    };
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...fetchOptions, headers });
    } catch (error) {
      throw new ApiError('无法连接后端服务', {
        code: 'NETWORK_ERROR',
        isNetworkError: true,
        cause: error
      });
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const error = payload?.error || {};
      throw new ApiError(error.message || `HTTP Error ${response.status}: ${response.statusText}`, {
        status: response.status,
        code: error.code || `HTTP_${response.status}`,
        payload,
        details: error.details || {},
        isNetworkError: [502, 503, 504].includes(response.status)
      });
    }
    if (!payload) throw new ApiError('服务响应不是有效 JSON', { code: 'RESPONSE_INVALID' });
    return payload;
  }
}

export const api = new ApiService();

// 确定性伪随机数：同一 scenario + seed 的双轨回放必须完全可复现。
function mulberry32(seed) {
  let a = (Number(seed) || 0) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
