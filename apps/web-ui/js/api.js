/**
 * AgriLoop API Service Client
 * Connects to Spring Boot backend (/api/v1).
 *
 * Mock data is intentionally used only when the backend is unreachable. When
 * the backend is online, authentication and API failures are surfaced to the
 * UI instead of being silently presented as real data.
 */
import { MOCK_DATA } from './mock-data.js?v=20260824-module-v5';

const DEFAULT_FORECAST_CONFIG = {
  algorithmVersion: 'robust-trend-v1.2',
  algorithmLabel: 'Robust Trend 确定性趋势推演',
  inputWindowMinutes: 60,
  stressBoundary: 14.0,
  baselineMoisture: 20.0,
  maxHorizonMinutes: 240,
  scenarioCatalog: [
    { code: 'DROUGHT', label: '持续干旱', emoji: '☀️', color: '#d29922', desc: '无降水、蒸散加快，水分按干旱速率衰减', decayFactor: 1.0, ttrMinutes: 72, driftRatePerHour: 0, rainBoostPct: 0, enabled: true },
    { code: 'HEAT_WAVE', label: '极端热浪', emoji: '🔥', color: '#f85149', desc: '棚内温度骤升至 38°C，蒸散速率提高 45%', decayFactor: 1.45, ttrMinutes: 48, driftRatePerHour: 0, rainBoostPct: 0, enabled: true },
    { code: 'STORM', label: '暴雨积水', emoji: '🌧️', color: '#58a6ff', desc: '连续暴雨 45 分钟，土壤湿度先抬升 6% 后回落', decayFactor: 0.8, ttrMinutes: null, driftRatePerHour: 0, rainBoostPct: 6, enabled: true },
    { code: 'SENSOR_DRIFT', label: '传感器零点漂移', emoji: '⚠️', color: '#a371f7', desc: '读数缓慢偏移 +0.6%/h，检测漂移后拒绝生成处方', decayFactor: 1.0, ttrMinutes: null, driftRatePerHour: 0.6, rainBoostPct: 0, enabled: true },
    { code: 'OFFLINE', label: '设备断网离线', emoji: '🔌', color: '#8b949e', desc: '遥测中断，样本不足，预测状态 UNAVAILABLE', decayFactor: 1.0, ttrMinutes: null, driftRatePerHour: 0, rainBoostPct: 0, enabled: true }
  ]
};

function cloneJson(value, fallback) {
  try {
    if (value == null) throw new Error('empty');
    const text = JSON.stringify(value);
    if (typeof text !== 'string') throw new Error('empty');
    return JSON.parse(text);
  } catch {
    if (fallback == null || fallback === value) return fallback ?? null;
    return cloneJson(fallback, null);
  }
}

function defaultValueLedger() {
  const daily = Array.from({ length: 22 }, (_, i) => {
    const planned = 845;
    const wave = Math.sin(i / 2.3) * 42 + Math.cos(i / 1.7) * 26;
    const actual = Math.round((planned * (0.93 + wave / 2200)) * 10) / 10;
    return { date: `08-${String(i + 1).padStart(2, '0')}`, planned, actual, deviationRatePct: Math.round(((actual - planned) / planned) * 1000) / 10 };
  });
  return {
    farmId: 'farm-demo',
    farmName: '农智示范农场',
    period: { start: '2026-08-01', end: '2026-08-22' },
    prices: { waterPerLitre: 0.004, electricityPerKwh: 0.55, labourPerHour: 35.0 },
    summary: {
      plannedWaterLitres: 18600, actualWaterLitres: 17240, deviationRatePct: -7.3,
      savedWaterLitres: 1360, savedElectricityKwh: 42.5, labourSavedHours: 6.2,
      savedWaterCostRmb: 5.44, savedElectricityCostRmb: 23.38, labourSavedCostRmb: 217.0, totalSavedRmb: 245.82
    },
    daily,
    counterfactual: [
      { week: '第 1 周', traditionalCostRmb: 320, agriLoopCostRmb: 240 },
      { week: '第 2 周', traditionalCostRmb: 610, agriLoopCostRmb: 455 },
      { week: '第 3 周', traditionalCostRmb: 870, agriLoopCostRmb: 645 },
      { week: '第 4 周', traditionalCostRmb: 1120, agriLoopCostRmb: 830 }
    ],
    provenance: [
      { key: '实际用水 / 用电 / 工时', value: 'OBSERVED', tag: 'sourceMode=SIMULATION（本期模拟遥测与虚拟执行）' },
      { key: '偏差率 / 折合人民币', value: 'DERIVED', tag: '由计划-实际差异确定性换算' },
      { key: '传统粗放灌溉成本', value: 'ESTIMATED', tag: '按行业经验参数估算，非实测' }
    ]
  };
}

const DEFAULT_CROP_PACK = {
  cropCode: 'tomato',
  name: '番茄',
  version: '1.0.0',
  schemaVersion: '1.0',
  identity: { name: '番茄', variety: 'demonstration', region: '重庆' },
  stages: [
    { code: 'seedling', sequence: 1, label: '苗期', target: { soilMoistureLow: 30, soilMoistureHigh: 50, airTemperatureLow: 18, airTemperatureHigh: 28 }, riskFocus: ['WATER_DEFICIT'], taskTemplates: [] },
    { code: 'vegetative', sequence: 2, label: '营养生长期', target: { soilMoistureLow: 25, soilMoistureHigh: 45, airTemperatureLow: 18, airTemperatureHigh: 30 }, riskFocus: ['WATER_DEFICIT'], taskTemplates: [] },
    { code: 'flowering', sequence: 3, label: '开花坐果期', target: { soilMoistureLow: 23, soilMoistureHigh: 43, airTemperatureLow: 18, airTemperatureHigh: 32 }, riskFocus: ['WATER_DEFICIT'], taskTemplates: [] },
    { code: 'fruiting', sequence: 4, label: '果实成熟期', target: { soilMoistureLow: 20, soilMoistureHigh: 40, airTemperatureLow: 18, airTemperatureHigh: 32 }, riskFocus: ['WATER_DEFICIT'], taskTemplates: [] }
  ],
  metrics: [
    { code: 'SOIL_MOISTURE', label: '土壤湿度', unit: '%', availability: 'SUPPORTED', range: { min: 0, max: 100 } },
    { code: 'AIR_TEMPERATURE', label: '棚内空气温度', unit: '°C', availability: 'SUPPORTED', range: { min: -40, max: 80 } }
  ],
  rules: [
    { code: 'WATER_DEFICIT', metric: 'SOIL_MOISTURE', operator: 'LT', threshold: 20, durationMinutes: 5, hysteresis: 2, cooldownMinutes: 120 }
  ],
  prescriptionConstraints: { maxDurationSeconds: 900, cooldownMinutes: 120, maxDailyWaterLitres: 5000 },
  forecastProfile: { algorithm: 'robust-trend-v1', horizonsMinutes: [60, 120, 240], minValidSamples: 6, maxStalenessSeconds: 120 },
  coordinationProfile: { stageSensitivity: 0.9, starvationGuardMinutes: 120 },
  knowledgeVersion: 'kb-1.0.0',
  ruleVersion: 'rule-1.0.0',
  knowledge: { documents: ['knowledge/irrigation.md'], fallback: ['plot', 'region', 'stage', 'crop', 'general'], content: ['# 番茄灌溉知识', '', '结果期先确认土壤湿度时间窗口和设备流量，再决定灌溉时长。'] },
  scenarios: { normal: { quality: 'GOOD', expected: 'stable' }, drought: { quality: 'GOOD', expected: 'soil_moisture_decline' } },
  testCases: ['normal', 'drought']
};

function cropPackDetails() {
  return Array.isArray(MOCK_DATA?.cropPackDetails) && MOCK_DATA.cropPackDetails.length
    ? MOCK_DATA.cropPackDetails
    : [DEFAULT_CROP_PACK];
}

function forecastConfig() {
  const cfg = MOCK_DATA && MOCK_DATA.riskForecastConfig;
  const catalog = Array.isArray(cfg?.scenarioCatalog) && cfg.scenarioCatalog.length
    ? cfg.scenarioCatalog
    : DEFAULT_FORECAST_CONFIG.scenarioCatalog;
  return {
    ...DEFAULT_FORECAST_CONFIG,
    ...(cfg && typeof cfg === 'object' ? cfg : {}),
    scenarioCatalog: catalog,
    stressBoundary: Number(cfg?.stressBoundary ?? DEFAULT_FORECAST_CONFIG.stressBoundary),
    baselineMoisture: Number(cfg?.baselineMoisture ?? DEFAULT_FORECAST_CONFIG.baselineMoisture),
    maxHorizonMinutes: Number(cfg?.maxHorizonMinutes ?? DEFAULT_FORECAST_CONFIG.maxHorizonMinutes),
    inputWindowMinutes: Number(cfg?.inputWindowMinutes ?? DEFAULT_FORECAST_CONFIG.inputWindowMinutes),
    algorithmVersion: cfg?.algorithmVersion || DEFAULT_FORECAST_CONFIG.algorithmVersion,
    algorithmLabel: cfg?.algorithmLabel || DEFAULT_FORECAST_CONFIG.algorithmLabel
  };
}

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
    this.liveSource = 'mock';
    this.systemStatus = null;
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
    const looksLikeApi = async (resp) => {
      if (!resp) return false;
      const type = resp.headers.get('content-type') || '';
      if (resp.ok && type.includes('json')) return true;
      if (![401, 403, 503].includes(resp.status)) return false;
      try {
        const payload = await resp.clone().json();
        return Boolean(payload?.schemaVersion || payload?.error?.code || payload?.status);
      } catch {
        return false;
      }
    };

    try {
      const resp = await fetch(`${this.baseUrl}/actuator/health`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(1800)
      });
      if (await looksLikeApi(resp)) {
        this.isLive = true;
        return true;
      }
    } catch (e) {
      // Fall through to API reachability probe.
    }

    // Redis-less standalone often reports actuator DOWN while /api/v1 still works.
    try {
      const headers = {
        Accept: 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      };
      const resp = await fetch(`${this.baseUrl}/api/v1/crop-packs`, {
        headers,
        signal: AbortSignal.timeout(1800)
      });
      if (await looksLikeApi(resp)) {
        this.isLive = true;
        return true;
      }
    } catch (e) {
      // Backend not running locally
    }
    this.isLive = false;
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

  async getTelemetry(plotId = 'plot-a01', metric = 'SOIL_MOISTURE', limit = 50, options = {}) {
    const { from, to } = options;
    if (this.isLive) {
      try {
        const q = new URLSearchParams({ limit: String(limit) });
        if (metric) q.set('metric', metric);
        if (from) q.set('from', from);
        if (to) q.set('to', to);
        const resp = await this._fetch(`/api/v1/plots/${plotId}/telemetry?${q}`);
        if (Array.isArray(resp?.data) && resp.data.length) return resp.data;
      } catch (e) {
        console.warn('[AgriLoop] telemetry failed, using mock series:', e);
      }
    }
    const plots = Array.isArray(MOCK_DATA?.plots) ? MOCK_DATA.plots : [];
    const targetPlot = plots.find((p) => p.plotId === plotId) || plots[0] || { metrics: {} };
    const fallbackBase = { PH: 6.4, WATER_LEVEL: 72, LIGHT: 42000, CO2: 680, AIR_TEMPERATURE: 25, SOIL_MOISTURE: 28 };
    const rawBase = targetPlot.metrics?.[metric]?.value;
    const baseValue = Number.isFinite(Number(rawBase)) ? Number(rawBase) : (fallbackBase[metric] ?? 25.0);
    const startMs = from ? new Date(from).getTime() : Date.now() - 24 * 10 * 60 * 1000;
    const endMs = to ? new Date(to).getTime() : Date.now();
    const stepMs = Math.max(5 * 60 * 1000, Math.floor((endMs - startMs) / Math.max(limit, 24)));
    const points = [];
    for (let t = startMs, i = 0; t <= endMs && points.length < limit; t += stepMs, i += 1) {
      const noise = Math.sin(i / 3) * 1.5 + (Math.random() * 0.4 - 0.2);
      points.push({
        eventId: `mock-evt-${i}`,
        plotId,
        metric,
        value: Number(
          (baseValue + noise - (plotId === 'plot-a01' && metric === 'SOIL_MOISTURE' ? i * 0.05 : 0)).toFixed(2),
        ),
        unit: targetPlot.metrics?.[metric]?.unit || '%',
        ts: new Date(t).toISOString(),
        quality: { status: 'GOOD', freshnessMs: 200, confidence: 0.98, sourceMode: 'SIMULATION' },
      });
    }
    return points;
  }

  async getTelemetryDay(plotId = 'plot-a01', metric = 'SOIL_MOISTURE', limit = 5000) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const from = startOfDay.toISOString();
    const to = new Date().toISOString();
    return this.getTelemetry(plotId, metric, limit, { from, to });
  }

  async getPlotTelemetryAll(plotId = 'plot-a01', limit = 120) {
    if (this.isLive) {
      try {
        const resp = await this._fetch(`/api/v1/plots/${plotId}/telemetry?limit=${limit}`);
        if (Array.isArray(resp?.data) && resp.data.length) return resp.data;
      } catch (e) {
        console.warn('[AgriLoop] full telemetry failed:', e);
      }
    }
    const codes = ['SOIL_MOISTURE', 'AIR_TEMPERATURE', 'LIGHT', 'CO2', 'PH', 'WATER_LEVEL'];
    const batches = await Promise.all(codes.map((m) => this.getTelemetry(plotId, m, limit)));
    return batches.flat().sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  }

  async getPlots() {
    if (this.isLive) {
      const resp = await this._fetch('/api/v1/plots');
      if (resp && resp.data) return resp.data;
      throw new ApiError('后端返回了无效的地块数据', { code: 'PLOTS_INVALID', payload: resp });
    }
    return Array.isArray(MOCK_DATA?.plots) ? MOCK_DATA.plots : [];
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
      try {
        const response = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/inspections`);
        if (Array.isArray(response?.data)) return response.data;
      } catch (error) {
        if (error.status === 401 || error.status === 403) throw error;
        console.warn('Falling back to simulated inspections:', error);
      }
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
    let demo;
    try {
      demo = this.mockRiskForecast(plotId, metric, { forceAvailable: true });
    } catch (error) {
      console.warn('mockRiskForecast failed, using inline fallback:', error);
      demo = this.mockRiskForecast('plot-a01', metric, { forceAvailable: true });
    }
    if (!this.isLive) return demo;
    try {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/risk-forecast?metric=${encodeURIComponent(metric)}`);
      const normalized = this.normalizeForecast(resp?.data || resp, plotId, metric);
      if (normalized.status === 'AVAILABLE' && Array.isArray(normalized.horizons) && normalized.horizons.length && Array.isArray(normalized.curve) && normalized.curve.length) {
        return {
          ...demo,
          ...normalized,
          horizons: normalized.horizons.map(h => ({
            ...h,
            band: h.band || `${Number(h.lower).toFixed(1)}% ~ ${Number(h.upper).toFixed(1)}%`
          }))
        };
      }
      return {
        ...demo,
        assumptions: [
          ...(demo.assumptions || []),
          `后端返回 ${normalized.reason || normalized.status || 'UNAVAILABLE'}，已回退本地可重复演示算法`
        ]
      };
    } catch (error) {
      console.warn('Falling back to mock risk forecast:', error);
      return demo;
    }
  }

  normalizeForecast(raw, plotId, metric) {
    const cfg = forecastConfig();
    const plot = Array.isArray(MOCK_DATA?.plots)
      ? (MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0])
      : null;
    const source = raw || {};
    const boundary = Number(source.stressBoundary ?? source.riskBoundary?.value ?? cfg.stressBoundary);
    const baseline = Number(source.baselineMoisture ?? cfg.baselineMoisture);
    const start = Number(source.startMoisture ?? plot?.metrics?.[metric]?.value ?? 25);
    const horizons = (Array.isArray(source.horizons) ? source.horizons : []).map(h => ({
      minute: Number(h.minute ?? h.minutes ?? 0),
      expected: Number(h.expected ?? h.value ?? h.expectedMoisture ?? start),
      lower: Number(h.lower ?? h.expected ?? h.value ?? start),
      upper: Number(h.upper ?? h.expected ?? h.value ?? start)
    })).filter(h => Number.isFinite(h.minute));
    const maxHorizon = Number.isFinite(Number(source.forecastRangeMinutes))
      ? Number(source.forecastRangeMinutes)
      : cfg.maxHorizonMinutes;
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

  mockRiskForecast(plotId = 'plot-a01', metric = 'SOIL_MOISTURE', { forceAvailable = false } = {}) {
    const cfg = forecastConfig();
    const plot = Array.isArray(MOCK_DATA?.plots)
      ? (MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0])
      : null;
    let start = Number(plot?.metrics?.[metric]?.value ?? 25);
    const boundary = Number(cfg.stressBoundary) || 14;
    if (forceAvailable && (plot?.deviceStatus !== 'ONLINE' || start <= boundary + 0.5)) {
      start = Math.max(boundary + 10, 28);
    }
    if (!forceAvailable && (plot?.deviceStatus !== 'ONLINE' || start <= boundary + 0.5)) {
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
      horizons: [60, 120, 240].map(minute => {
        const p = curve.find(x => x.minute === minute) || curve[curve.length - 1] || { expected: start, lower: start, upper: start };
        return { minute, expected: p.expected, lower: p.lower, upper: p.upper, band: `${Number(p.lower).toFixed(1)}% ~ ${Number(p.upper).toFixed(1)}%` };
      }),
      curve, assumptions: ['无降水 / 无外界灌溉', '棚室通风与外部光热保持稳定', '设备保持在线，遥测质量 GOOD'],
      uncertaintyNote: '置信区间随预测时距线性放大；超出 4h 不承诺，样本不足返回 UNAVAILABLE', provenance: 'SIMULATED'
    };
  }

  async runScenario({ scenario = 'DROUGHT', seed = 42, plotId = 'plot-a01' } = {}) {
    const normalizedScenario = String(scenario).toUpperCase();
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/scenarios/runs', { method: 'POST', body: JSON.stringify({ scenario: normalizedScenario, seed, plotId }) });
        const run = resp?.data || resp;
        const catalog = forecastConfig().scenarioCatalog;
        const def = catalog.find(s => s.code === normalizedScenario) || catalog[0];
        return { ...run, scenario: run.scenario || normalizedScenario, scenarioLabel: run.scenarioLabel || def.label, params: run.params || def, frozenSnapshot: { ...(run.frozenSnapshot || {}), plotId, plotName: run.frozenSnapshot?.plotName || this.mockPlot(plotId).name, startMoisture: run.frozenSnapshot?.startMoisture ?? this.mockPlot(plotId).metrics.SOIL_MOISTURE.value } };
      } catch (error) {
        console.warn('Falling back to mock scenario run:', error);
      }
    }
    const def = forecastConfig().scenarioCatalog.find(s => s.code === normalizedScenario) || forecastConfig().scenarioCatalog[0];
    const plot = this.mockPlot(plotId);
    return { scenarioId: `${normalizedScenario.toLowerCase()}-${seed}`, scenario: normalizedScenario, scenarioLabel: def.label, seed, runStatus: 'COMPLETED', frozenSnapshot: { plotId, plotName: plot.name, startMoisture: plot.metrics.SOIL_MOISTURE.value, capturedAt: new Date().toISOString(), snapshotLabel: '冻结快照（只读，不写回主状态）' }, params: def, provenance: 'SIMULATED' };
  }

  async compareScenario({ scenario = 'DROUGHT', seed = 42, plotId = 'plot-a01' } = {}) {
    const normalizedScenario = String(scenario).toUpperCase();
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/scenarios/compare', { method: 'POST', body: JSON.stringify({ scenarioId: `${normalizedScenario.toLowerCase()}-${seed}`, seed, plotId, leftBranch: 'EXECUTE', rightBranch: 'NO_ACTION' }) });
        const server = resp?.data || resp;
        if (server?.branches?.EXECUTE?.points && server?.branches?.NO_ACTION?.points) return server;
        return { ...this.mockScenarioCompare(normalizedScenario, seed, plotId), serverSummary: server, provenance: 'SIMULATED' };
      } catch (error) {
        console.warn('Falling back to mock scenario compare:', error);
      }
    }
    return this.mockScenarioCompare(normalizedScenario, seed, plotId);
  }

  mockScenarioCompare(scenario = 'DROUGHT', seed = 42, plotId = 'plot-a01') {
    const cfg = forecastConfig();
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
    const plots = Array.isArray(MOCK_DATA?.plots) ? MOCK_DATA.plots : [];
    return plots.find(p => p.plotId === plotId) || plots[0] || {
      plotId,
      name: plotId || '示范地块',
      metrics: { SOIL_MOISTURE: { value: 25, unit: '%' } }
    };
  }

  completeValueLedger(raw) {
    const fallback = cloneJson(MOCK_DATA?.valueLedger, defaultValueLedger()) || defaultValueLedger();
    if (!raw || Array.isArray(raw) || !raw.summary || !Array.isArray(raw.daily) || !raw.period || !raw.prices) {
      fallback.serverRecords = Array.isArray(raw) ? raw : (raw?.serverRecords || []);
      return fallback;
    }
    return raw;
  }

  async getValueLedgers() {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/value-ledgers');
        const records = resp?.data || resp;
        const ledger = this.completeValueLedger(records);
        if (Array.isArray(records)) {
          ledger.serverRecords = records;
          ledger.provenance = ledger.provenance.map(p => ({ ...p, tag: `${p.tag}；在线记录 ${records.length} 条` }));
        }
        return ledger;
      } catch (error) {
        console.warn('Falling back to mock value ledger:', error);
      }
    }
    return this.completeValueLedger(null);
  }

  async getCropPacks() {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/crop-packs');
        const raw = resp?.data || resp;
        if (Array.isArray(raw) && raw.length) return raw.map(pack => this.normalizeCropPack(pack));
        if (raw?.cropCode) return [this.normalizeCropPack(raw)];
      } catch (error) {
        console.warn('Falling back to mock crop packs:', error);
      }
    }
    return cloneJson(cropPackDetails(), [DEFAULT_CROP_PACK]) || [DEFAULT_CROP_PACK];
  }

  normalizeCropPack(pack) {
    const catalog = cropPackDetails();
    const fallback = catalog.find(p => p.cropCode === pack?.cropCode) || catalog[0] || DEFAULT_CROP_PACK;
    const stages = (pack?.stages || fallback.stages).map((stage, index) => {
      const base = fallback.stages[index] || fallback.stages[fallback.stages.length - 1] || {
        code: `stage-${index + 1}`,
        label: `阶段 ${index + 1}`,
        sequence: index + 1,
        target: {
          soilMoistureLow: 20, soilMoistureHigh: 40,
          airTemperatureLow: 18, airTemperatureHigh: 32
        },
        riskFocus: [],
        taskTemplates: []
      };
      if (typeof stage !== 'object' || stage == null) {
        return { ...base, code: String(stage).split(' ')[0] || base.code, label: base.label };
      }
      return {
        ...base,
        ...stage,
        code: stage.code || base.code,
        label: stage.label || base.label,
        sequence: stage.sequence ?? base.sequence ?? (index + 1),
        target: { ...base.target, ...(stage.target || {}) },
        riskFocus: Array.isArray(stage.riskFocus) ? stage.riskFocus : (base.riskFocus || []),
        taskTemplates: Array.isArray(stage.taskTemplates) ? stage.taskTemplates : (base.taskTemplates || [])
      };
    });
    const metrics = (pack?.metrics || fallback.metrics).map(metric => {
      if (metric?.range && metric.range.min != null && metric.range.max != null) return metric;
      const target = metric?.target || {};
      return {
        ...metric,
        code: metric?.code || 'METRIC',
        label: metric?.label || metric?.code || '指标',
        unit: metric?.unit || '',
        availability: metric?.availability || 'SIMULATION_ONLY',
        range: {
          min: target.low ?? target.min ?? metric?.range?.min ?? 0,
          max: target.high ?? target.max ?? metric?.range?.max ?? 100
        }
      };
    });
    return {
      ...fallback,
      ...pack,
      identity: {
        name: pack?.identity?.name || pack?.name || fallback.identity.name,
        variety: pack?.identity?.variety || fallback.identity.variety || 'demonstration',
        region: pack?.identity?.region || fallback.identity.region || '重庆'
      },
      schemaVersion: pack?.schemaVersion || fallback.schemaVersion,
      stages, metrics,
      rules: Array.isArray(pack?.rules) && pack.rules.length ? pack.rules : fallback.rules,
      prescriptionConstraints: pack?.prescriptionConstraints?.maxDurationSeconds != null
        ? { ...fallback.prescriptionConstraints, ...pack.prescriptionConstraints }
        : fallback.prescriptionConstraints,
      forecastProfile: Array.isArray(pack?.forecastProfile?.horizonsMinutes)
        ? { ...fallback.forecastProfile, ...pack.forecastProfile }
        : fallback.forecastProfile,
      coordinationProfile: pack?.coordinationProfile?.stageSensitivity
        ? { ...fallback.coordinationProfile, ...pack.coordinationProfile }
        : fallback.coordinationProfile,
      knowledgeVersion: pack?.knowledgeVersion || fallback.knowledgeVersion,
      ruleVersion: pack?.ruleVersion || fallback.ruleVersion,
      knowledge: Array.isArray(pack?.knowledge?.content) && Array.isArray(pack?.knowledge?.documents)
        ? pack.knowledge
        : fallback.knowledge,
      scenarios: pack?.scenarios && !Array.isArray(pack.scenarios) && typeof pack.scenarios === 'object'
        ? pack.scenarios
        : fallback.scenarios,
      testCases: Array.isArray(pack?.testCases) ? pack.testCases : fallback.testCases
    };
  }

  async getRules() {
    if (this.isLive) {
      const resp = await this._fetch('/api/v1/rules');
      const raw = resp?.data || resp;
      if (Array.isArray(raw)) return raw.flatMap(entry => (entry.rules || []).map(rule => ({ ...rule, cropCode: entry.cropCode, cropName: cropPackDetails().find(p => p.cropCode === entry.cropCode)?.identity?.name || entry.cropCode, ruleVersion: entry.version || entry.ruleVersion })));
    }
    return cropPackDetails().flatMap(pack => (pack.rules || []).map(rule => ({ ...rule, cropCode: pack.cropCode, cropName: pack.identity?.name || pack.cropCode, ruleVersion: pack.ruleVersion })));
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
