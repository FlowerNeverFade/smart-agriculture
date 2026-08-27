/**
 * AgriLoop API Service Client
 * Connects to Spring Boot backend (/api/v1).
 *
 * Mock data is intentionally used only when the backend is unreachable. When
 * the backend is online, authentication and API failures are surfaced to the
 * UI instead of being silently presented as real data.
 */
import { MOCK_DATA } from './mock-data.js?v=20260827-device-control-v1';
import { isPublicRole, presentRoleUser, roleCan } from './roles.js';

const WORK_ORDER_STATUS_ALIASES = Object.freeze({ PENDING: 'OPEN', NEW: 'OPEN', CLAIMED: 'ASSIGNED', COMPLETED: 'DONE' });
const TERMINAL_WORK_ORDER_STATUSES = new Set(['DONE', 'CANCELLED']);

export const PLOT_SIMULATION_DEFAULTS = Object.freeze({
  NORMAL: { volatility: 1.25, timeScale: 60, temperatureBias: 0, humidityBias: 0, rainfallRate: .2, soilMoistureTrendPerHour: -.18, driftRatePerHour: 0, offlineRatio: 0, riskThreshold: 20, waterloggingThreshold: 82, forecastHours: 4 },
  DROUGHT: { volatility: 1.75, timeScale: 60, temperatureBias: 7, humidityBias: -20, rainfallRate: 0, soilMoistureTrendPerHour: -3.6, driftRatePerHour: 0, offlineRatio: 0, riskThreshold: 20, waterloggingThreshold: 82, forecastHours: 4 },
  HEAVY_RAIN: { volatility: 1.9, timeScale: 60, temperatureBias: -4.5, humidityBias: 20, rainfallRate: 32, soilMoistureTrendPerHour: 7.2, driftRatePerHour: 0, offlineRatio: 0, riskThreshold: 20, waterloggingThreshold: 82, forecastHours: 4 },
  SENSOR_DRIFT: { volatility: 1.45, timeScale: 60, temperatureBias: 0, humidityBias: 0, rainfallRate: .2, soilMoistureTrendPerHour: -.18, driftRatePerHour: 2.4, offlineRatio: 0, riskThreshold: 20, waterloggingThreshold: 82, forecastHours: 4 },
  DEVICE_OFFLINE: { volatility: 1.3, timeScale: 60, temperatureBias: 0, humidityBias: 0, rainfallRate: .2, soilMoistureTrendPerHour: -.18, driftRatePerHour: 0, offlineRatio: .55, riskThreshold: 20, waterloggingThreshold: 82, forecastHours: 4 }
});

export const PLOT_SIMULATION_SCENARIOS = Object.freeze([
  { code: 'NORMAL', emoji: '☀️', label: '正常运行', description: '标准环境参数运行', color: '#1e8e3e' },
  { code: 'DROUGHT', emoji: '🏜️', label: '干旱场景', description: '持续高温低湿，土壤逐步失水', color: '#d97706' },
  { code: 'HEAVY_RAIN', emoji: '🌧️', label: '暴雨场景', description: '大量降水、低温高湿，土壤快速增湿', color: '#2563eb' },
  { code: 'SENSOR_DRIFT', emoji: '📡', label: '传感器漂移', description: '物理环境稳定，读数逐步偏移', color: '#7c3aed' },
  { code: 'DEVICE_OFFLINE', emoji: '🔌', label: '设备离线', description: '按比例模拟采集设备断连', color: '#6b7280' }
]);

const PLOT_SIMULATION_LIMITS = Object.freeze({
  volatility: [.2, 3], timeScale: [1, 180], temperatureBias: [-15, 15], humidityBias: [-40, 40],
  rainfallRate: [0, 120], soilMoistureTrendPerHour: [-12, 12], driftRatePerHour: [0, 10],
  offlineRatio: [0, 1], riskThreshold: [1, 99], waterloggingThreshold: [40, 99], forecastHours: [1, 12]
});

// Defaults used only by the explicit demo session.  They mirror the
// simulator/API metric contract so a local preview never renders a missing
// rainfall or pH reading as an arbitrary 25% soil value.
const TELEMETRY_METRIC_PROFILES = Object.freeze({
  SOIL_MOISTURE: { defaultValue: 35, unit: '%', min: 0, max: 100, noise: .45, decimals: 2 },
  AIR_TEMPERATURE: { defaultValue: 25, unit: '°C', min: -40, max: 80, noise: .28, decimals: 2 },
  AIR_HUMIDITY: { defaultValue: 68, unit: '%RH', min: 0, max: 100, noise: 1.05, decimals: 2 },
  LIGHT: { defaultValue: 42000, unit: 'lux', min: 0, max: 100000, noise: 1200, decimals: 0 },
  CO2: { defaultValue: 520, unit: 'ppm', min: 0, max: 10000, noise: 18, decimals: 1 },
  PH: { defaultValue: 6.25, unit: 'pH', min: 0, max: 14, noise: .045, decimals: 2 },
  WATER_LEVEL: { defaultValue: 78, unit: '%', min: 0, max: 100, noise: .8, decimals: 2 },
  RAINFALL: { defaultValue: .2, unit: 'mm/h', min: 0, max: 250, noise: .8, decimals: 2 }
});

function telemetryMetricProfile(metric = 'SOIL_MOISTURE') {
  return TELEMETRY_METRIC_PROFILES[String(metric || '').toUpperCase()] || TELEMETRY_METRIC_PROFILES.SOIL_MOISTURE;
}

function normalizePlotSimulationScenario(value) {
  const key = String(value || 'NORMAL').trim().toUpperCase().replaceAll('-', '_');
  if (key === 'STORM' || key === 'HEAVYRAIN') return 'HEAVY_RAIN';
  if (key === 'OFFLINE') return 'DEVICE_OFFLINE';
  // Legacy replay names map to the current five plot-level strategies.
  if (key === 'HEAT_WAVE' || key === 'GRADUAL_DRYDOWN') return 'DROUGHT';
  if (key === 'FORECAST_MISS' || key === 'LIMITED_WATER' || key === 'REPEATED_CASE' || key === 'COST_SHIFT') return 'NORMAL';
  return PLOT_SIMULATION_DEFAULTS[key] ? key : 'NORMAL';
}

function cloneSimulationParameters(scenario, supplied = {}) {
  const code = normalizePlotSimulationScenario(scenario);
  const result = { ...(PLOT_SIMULATION_DEFAULTS[code] || PLOT_SIMULATION_DEFAULTS.NORMAL) };
  Object.entries(supplied || {}).forEach(([key, value]) => {
    if (!PLOT_SIMULATION_LIMITS[key]) return;
    const [min, max] = PLOT_SIMULATION_LIMITS[key];
    const numeric = Number(value);
    if (Number.isFinite(numeric)) result[key] = Math.min(max, Math.max(min, numeric));
  });
  if (result.riskThreshold >= result.waterloggingThreshold) {
    result.waterloggingThreshold = Math.min(99, Math.max(40, result.riskThreshold + .5));
    if (result.riskThreshold >= result.waterloggingThreshold) result.riskThreshold = Math.max(1, result.waterloggingThreshold - .5);
  }
  return result;
}

function normalizeWorkOrderStatus(value) {
  const status = String(value || 'OPEN').trim().toUpperCase();
  return WORK_ORDER_STATUS_ALIASES[status] || status;
}

function cloneWorkOrder(item) {
  const status = normalizeWorkOrderStatus(item?.status);
  const history = Array.isArray(item?.history) ? item.history.map((entry) => ({ ...entry })) : [];
  if (!history.length && item?.workOrderId) {
    history.push({
      action: 'CREATE',
      fromStatus: null,
      toStatus: status,
      actorId: item.createdBy || 'demo-seed',
      actorName: '演示数据',
      actorRole: 'SYSTEM',
      at: item.createdAt || new Date().toISOString(),
      note: '演示任务初始记录',
      evidenceRefs: []
    });
  }
  return {
    ...(item || {}),
    status,
    history
  };
}

function normalizeFarmMember(item, sourceMode) {
  const role = String(item?.role || '').trim().toUpperCase();
  const status = String(item?.status || 'INACTIVE').trim().toUpperCase();
  return {
    userId: String(item?.userId || '').trim(),
    username: String(item?.username || '').trim(),
    displayName: String(item?.displayName || item?.username || '未命名成员').trim(),
    role,
    roleLabel: String(item?.roleLabel || (role === 'FARM_ADMIN' ? '农场管理员' : '种植农户')).trim(),
    farmIds: Array.isArray(item?.farmIds) ? [...item.farmIds] : [],
    plotIds: Array.isArray(item?.plotIds) ? [...item.plotIds] : [],
    status,
    sourceMode
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
    this.sseAbortController = null;
    this.decisionCache = {
      diagnoses: new Map(),
      plans: new Map(),
      readiness: new Map(),
      commands: new Map(),
      evaluations: new Map()
    };
    this.demoWorkOrders = new Map((MOCK_DATA.workOrders || []).map((item) => [item.workOrderId, cloneWorkOrder(item)]));
    this.demoAlerts = new Map((MOCK_DATA.alerts || []).map((item) => [item.alertId || item.id, { ...item }]));
    this.demoInspections = new Map((MOCK_DATA.inspections || []).map((item) => [item.inspectionId, { ...item }]));
    this.demoPlots = new Map((MOCK_DATA.plots || []).map((item) => [item.plotId, { ...item, farmId: item.farmId || 'farm-demo', status: item.status || 'ACTIVE', sourceMode: 'SIMULATED' }]));
    this.demoDevices = new Map((MOCK_DATA.adminDevices || []).map((item, index) => {
      const plot = MOCK_DATA.plots?.[index % Math.max(1, MOCK_DATA.plots.length)];
      const deviceId = item.deviceId || item.id || `device-demo-${index + 1}`;
      return [deviceId, {
        ...item,
        deviceId,
        farmId: item.farmId || plot?.farmId || 'farm-demo',
        plotId: item.plotId || plot?.plotId || null,
        status: item.status || 'OFFLINE',
        bindingState: (item.plotId || plot?.plotId) ? 'BOUND' : 'UNBOUND',
        sourceMode: 'SIMULATED',
        desiredStatus: item.status || 'OFFLINE',
        controlStatus: 'SUCCEEDED'
      }];
    }));
    this.demoSimulationStrategies = new Map((MOCK_DATA.plots || []).map((plot) => {
      const scenario = normalizePlotSimulationScenario(plot.simulation?.scenario || 'NORMAL');
      return [plot.plotId, {
        plotId: plot.plotId,
        scenario,
        parameters: cloneSimulationParameters(scenario, plot.simulation?.parameters),
        revision: 1,
        sourceMode: 'SIMULATION',
        updatedAt: new Date().toISOString(),
        hardware: { bindingState: 'UNBOUND', status: 'NOT_BOUND', usability: 'NOT_BOUND', label: '未绑定硬件' },
        simulatorDevice: { status: 'ONLINE', label: '模拟数据运行中' }
      }];
    }));
    this.demoCropBatches = new Map();
    this.demoCropPlans = new Map();
    this.demoAgentActions = new Map();
    this.demoValueLedgers = [];
    this.demoFarmMembers = new Map((MOCK_DATA.farmMembers || []).map(member => [member.userId, normalizeFarmMember({
      ...member,
      farmIds: member.farmIds || ['farm-demo']
    }, 'SIMULATED')]));
  }

  readStoredUser() {
    try {
      const raw = localStorage.getItem('agriloop_user');
      return raw ? presentRoleUser(JSON.parse(raw)) : null;
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
    const { username, password: secret, role = '' } = typeof credentials === 'object'
      ? (credentials || {})
      : { username: credentials, password };
    try {
      const resp = await this._fetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password: secret, role })
      }, { auth: false });
      const session = resp?.data || resp;
      if (!session?.accessToken || !session?.user?.username || !session?.user?.role) {
        throw new ApiError('登录响应缺少 accessToken', { code: 'AUTH_RESPONSE_INVALID', payload: resp });
      }
      this.saveSession({ mode: 'live', token: session.accessToken, user: session.user });
      return session;
    } catch (error) {
      if (!this.isLive) {
        const fallbackRole = role || (username.includes('admin') ? 'sysadmin' : 'farmer');
        console.warn('Backend unavailable, falling back to offline demo login');
        const session = {
          mode: 'demo',
          token: 'demo-token-' + Date.now(),
          user: { username, role: fallbackRole, id: 'demo-u-' + Date.now() }
        };
        this.saveSession(session);
        return session;
      }
      throw error;
    }
  }

  async register({ username, password, role }) {
    const resp = await this._fetch('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    }, { auth: false });
    const session = resp?.data || resp;
    if (!session?.accessToken || !session?.user?.username || !session?.user?.role || !session?.recoveryCode) {
      throw new ApiError('注册响应不完整', { code: 'ACCOUNT_REGISTER_RESPONSE_INVALID', payload: resp });
    }
    return session;
  }

  async resetPassword({ username, recoveryCode, newPassword }) {
    const resp = await this._fetch('/api/v1/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ username, recoveryCode, newPassword })
    }, { auth: false });
    const result = resp?.data || resp;
    if (!result?.username || !result?.recoveryCode) {
      throw new ApiError('密码重设响应不完整', { code: 'ACCOUNT_RESET_RESPONSE_INVALID', payload: resp });
    }
    return result;
  }

  async changePassword({ currentPassword, newPassword }) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const session = resp?.data || resp;
      if (!session?.accessToken || !session?.user?.username) {
        throw new ApiError('改密响应缺少新的登录令牌', { code: 'ACCOUNT_PASSWORD_RESPONSE_INVALID', payload: resp });
      }
      this.saveSession({ mode: 'live', token: session.accessToken, user: session.user });
      return session;
    }
    return { username: this.user?.username, demo: true };
  }

  async getCurrentUser() {
    const resp = await this._fetch('/api/v1/auth/me');
    const user = resp?.data || resp;
    if (user) {
      this.user = presentRoleUser(user);
      localStorage.setItem('agriloop_user', JSON.stringify(this.user));
    }
    return user;
  }

  saveSession({ mode, token = '', user }) {
    const normalizedUser = presentRoleUser(user);
    if (!normalizedUser?.username || !normalizedUser?.role || !isPublicRole(normalizedUser.role) || !['live', 'demo'].includes(mode)) {
      throw new ApiError('会话数据无效', { code: 'SESSION_INVALID' });
    }
    if (mode === 'live' && !token) {
      throw new ApiError('实时会话缺少访问令牌', { code: 'SESSION_TOKEN_MISSING' });
    }
    this.sessionMode = mode;
    this.token = mode === 'live' ? token : '';
    // A demo session must never inherit the previous live health flag.  That
    // flag is only a transport status; the session mode decides whether a
    // method may use the local demo store or must surface a backend error.
    if (mode !== 'live') this.isLive = false;
    this.user = normalizedUser;
    localStorage.setItem('agriloop_user', JSON.stringify(normalizedUser));
    localStorage.setItem('agriloop_session_mode', mode);
    if (this.token) localStorage.setItem('agriloop_token', this.token);
    else localStorage.removeItem('agriloop_token');
  }

  readSession() {
    const mode = localStorage.getItem('agriloop_session_mode') || (this.token ? 'live' : 'demo');
    const token = localStorage.getItem('agriloop_token') || '';
    const user = presentRoleUser(this.readStoredUser());
    if (!user?.username || !user?.role || !isPublicRole(user.role)) return null;
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
    this.sseAbortController?.abort();
    this.sseAbortController = null;
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
      // Consume the tiny health response before returning.  Leaving the body
      // unread makes Chromium report a spurious ERR_ABORTED when the next
      // long-lived SSE request is opened, even though the probe returned 200.
      await resp.text();
      if (resp.ok) {
        // A healthy backend does not turn an unauthenticated demo session
        // into a live session.  Demo mode must keep using its explicit MOCK
        // data instead of issuing tokenless requests that return 401.
        this.isLive = this.sessionMode === 'live' && Boolean(this.token);
        return this.isLive;
      }
    } catch (e) {
      // Backend not running locally, seamlessly fall back to local mock state
      this.isLive = false;
    }
    return false;
  }

  async subscribeEvents(onEvent) {
    if (!this.isLive || !this.token || typeof onEvent !== 'function') return () => {};
    this.sseAbortController?.abort();
    const controller = new AbortController();
    this.sseAbortController = controller;
    const request = () => fetch(`${this.baseUrl}/api/v1/events/stream`, {
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${this.token}` },
      signal: controller.signal
    }).then((response) => {
      if (!response.ok || !response.body) {
        throw new ApiError('系统消息流连接失败', { status: response.status, code: 'EVENT_STREAM_UNAVAILABLE' });
      }
      return response;
    });

    // Keep the first request synchronous so callers can still report an
    // authentication/transport failure.  Once connected, a dropped stream is
    // retried in the background; REST polling in the views remains the final
    // fallback when the server is temporarily unavailable.
    const response = await request();
    const sleep = (milliseconds) => new Promise((resolve) => {
      const timer = globalThis.setTimeout(resolve, milliseconds);
      controller.signal.addEventListener('abort', () => {
        globalThis.clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    const consume = async (streamResponse) => {
      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let event = { type: 'message', data: '' };
      const flush = () => {
        if (!event.data) {
          event = { type: 'message', data: '' };
          return;
        }
        let data = event.data.replace(/\n$/, '');
        try { data = JSON.parse(data); } catch (error) { /* plain-text event */ }
        try { onEvent({ type: event.type, data }); }
        catch (error) { console.warn('[AgriLoop] event handler failed:', error); }
        event = { type: 'message', data: '' };
      };
      const consumeLine = (line) => {
        if (!line) { flush(); return; }
        // SSE comments are keep-alive lines and carry no event data.
        if (line.startsWith(':')) return;
        const separator = line.indexOf(':');
        const field = separator === -1 ? line : line.slice(0, separator);
        const value = separator === -1 ? '' : line.slice(separator + 1).trimStart();
        if (field === 'event') event.type = value || 'message';
        if (field === 'data') event.data += `${value}\n`;
      };
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(consumeLine);
      }
      if (buffer) consumeLine(buffer);
      flush();
    };
    const run = async (initialResponse) => {
      let nextResponse = initialResponse;
      let retryDelay = 1000;
      while (!controller.signal.aborted) {
        try {
          await consume(nextResponse);
          retryDelay = 1000;
        } catch (error) {
          if (controller.signal.aborted) break;
          console.warn('[AgriLoop] system event stream read failed:', error);
        }
        if (controller.signal.aborted) break;
        // Keep retrying the connection itself until it succeeds.  The
        // consumed Response must never be fed to the parser a second time.
        while (!controller.signal.aborted) {
          await sleep(retryDelay);
          if (controller.signal.aborted) break;
          try {
            nextResponse = await request();
            retryDelay = 1000;
            break;
          } catch (error) {
            if (controller.signal.aborted) break;
            console.warn('[AgriLoop] system event stream reconnect failed:', error);
            retryDelay = Math.min(retryDelay * 2, 30000);
          }
        }
      }
    };
    run(response).catch(error => {
      if (!controller.signal.aborted) console.warn('[AgriLoop] system event stream closed:', error);
    });
    return () => {
      controller.abort();
      if (this.sseAbortController === controller) this.sseAbortController = null;
    };
  }

  async getFarms() {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/farms');
      if (Array.isArray(resp?.data)) return resp.data;
      throw new ApiError('后端返回了无效的农场数据', { code: 'FARMS_INVALID', payload: resp });
    }
    return (MOCK_DATA.farms || []).map(farm => ({ ...farm, sourceMode: 'SIMULATED' }));
  }

  async getOverview(filters = {}) {
    if (this.sessionMode === 'live') {
      const query = new URLSearchParams();
      if (filters?.farmId) query.set('farmId', filters.farmId);
      const resp = await this._fetch(`/api/v1/overview${query.size ? `?${query}` : ''}`);
      if (resp && resp.data) return resp.data;
      throw new ApiError('后端返回了无效的总览数据', { code: 'OVERVIEW_INVALID', payload: resp });
    }
    return {
      farmId: filters?.farmId || "farm-demo",
      plots: Array.from(this.demoPlots.values()).filter(plot => !filters?.farmId || plot.farmId === filters.farmId),
      activeAlertCount: 1,
      pendingWorkOrderCount: 2,
      eventCount: 1080,
      dataMode: MOCK_DATA.system.mode,
      aiMode: MOCK_DATA.system.aiMode,
      systemStatus: MOCK_DATA.system
    };
  }

  async getSystemStatus() {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/system/status');
      const status = resp?.data || resp;
      if (status && typeof status === 'object') return status;
      throw new ApiError('后端返回了无效的系统状态', { code: 'SYSTEM_STATUS_INVALID', payload: resp });
    }
    return { mode: 'demo', database: 'SIMULATED', redis: 'SIMULATED', mqtt: 'SIMULATED', ai: 'mock' };
  }

  async getPlotTimeline(plotId) {
    if (!plotId) return [];
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/timeline`);
      if (Array.isArray(resp?.data)) return resp.data;
      throw new ApiError('后端返回了无效的地块时间线', { code: 'PLOT_TIMELINE_INVALID', payload: resp });
    }
    return [];
  }

  async getScenarioRuns() {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/scenarios/runs');
      if (Array.isArray(resp?.data)) return resp.data;
      throw new ApiError('后端返回了无效的仿真运行记录', { code: 'SCENARIO_RUNS_INVALID', payload: resp });
    }
    return [];
  }

  async getScenarioSnapshot(runId) {
    if (!runId) throw new ApiError('缺少仿真运行编号', { status: 400, code: 'SCENARIO_RUN_ID_REQUIRED' });
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/scenarios/runs/${encodeURIComponent(runId)}/snapshot`);
      const snapshot = resp?.data || resp;
      if (snapshot && typeof snapshot === 'object') return snapshot;
      throw new ApiError('后端返回了无效的仿真快照', { code: 'SCENARIO_SNAPSHOT_INVALID', payload: resp });
    }
    return null;
  }

  async getStrategyCandidates() {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/strategy-candidates');
      if (Array.isArray(resp?.data)) return resp.data;
      throw new ApiError('后端返回了无效的策略候选', { code: 'STRATEGY_CANDIDATES_INVALID', payload: resp });
    }
    return [];
  }

  async transitionStrategyCandidate(id, status) {
    if (!id) throw new ApiError('缺少策略候选编号', { status: 400, code: 'STRATEGY_ID_REQUIRED' });
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/strategy-candidates/${encodeURIComponent(id)}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status })
      });
      return resp?.data || resp;
    }
    return { id, status, sourceMode: 'SIMULATED' };
  }

  async getSimulatorStatus() {
    if (this.sessionMode !== 'live') return { available: false, status: 'UNAVAILABLE', reason: 'DEMO_SESSION' };
    const resp = await this._fetch('/api/v1/simulator/status');
    if (resp && resp.data) return resp.data;
    throw new ApiError('后端返回了无效的模拟器状态', { code: 'SIMULATOR_STATUS_INVALID', payload: resp });
  }

  async startSimulator() {
    if (this.sessionMode !== 'live') {
      throw new ApiError('演示会话不能控制后端模拟器', { code: 'SIMULATOR_DEMO_ONLY', isNetworkError: false });
    }
    const resp = await this._fetch('/api/v1/simulator/start', { method: 'POST', body: JSON.stringify({}) });
    if (resp && resp.data) return resp.data;
    throw new ApiError('后端返回了无效的模拟器启动结果', { code: 'SIMULATOR_START_INVALID', payload: resp });
  }

  async updateCropPackStatus(cropCode, version, status) {
    const resp = await this._fetch(`/api/v1/crop-packs/${cropCode}/${version || 'unknown'}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    return resp;
  }

  async stopSimulator() {
    if (this.sessionMode !== 'live') {
      throw new ApiError('演示会话不能控制后端模拟器', { code: 'SIMULATOR_DEMO_ONLY', isNetworkError: false });
    }
    const resp = await this._fetch('/api/v1/simulator/stop', { method: 'POST', body: JSON.stringify({}) });
    if (resp && resp.data) return resp.data;
    throw new ApiError('后端返回了无效的模拟器停止结果', { code: 'SIMULATOR_STOP_INVALID', payload: resp });
  }

  async getPlots(filters = {}) {
    if (this.sessionMode === 'live') {
      const query = new URLSearchParams();
      Object.entries(filters || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
      });
      const resp = await this._fetch(`/api/v1/plots${query.size ? `?${query}` : ''}`);
      if (resp && resp.data) return resp.data;
      throw new ApiError('后端返回了无效的地块数据', { code: 'PLOTS_INVALID', payload: resp });
    }
    return Array.from(this.demoPlots.values())
      .filter(plot => !filters.farmId || plot.farmId === filters.farmId)
      .filter(plot => filters.includeInactive || String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE')
      .filter(plot => !filters.status || String(plot.status || 'ACTIVE').toUpperCase() === String(filters.status).toUpperCase())
      .map(plot => ({ ...plot }));
  }

  async createPlot(input = {}) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/plots', {
        method: 'POST',
        body: JSON.stringify(input)
      });
      if (resp?.data?.plotId) return resp.data;
      throw new ApiError('后端返回了无效的新增地块结果', { code: 'PLOT_CREATE_INVALID', payload: resp });
    }
    const saved = {
      ...input,
      plotId: input.plotId || `plot-local-${Date.now().toString(36)}`,
      status: 'ACTIVE',
      sourceMode: 'SIMULATED',
      createdAt: new Date().toISOString()
    };
    this.demoPlots.set(saved.plotId, saved);
    return { ...saved };
  }

  async updatePlot(plotId, input = {}) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input)
      });
      if (resp?.data?.plotId) return resp.data;
      throw new ApiError('后端返回了无效的地块修改结果', { code: 'PLOT_UPDATE_INVALID', payload: resp });
    }
    const saved = { ...(this.demoPlots.get(plotId) || {}), ...input, plotId, updatedAt: new Date().toISOString() };
    this.demoPlots.set(plotId, saved);
    return { ...saved };
  }

  async setPlotDevices(plotId, deviceIds = []) {
    const ids = [...new Set((Array.isArray(deviceIds) ? deviceIds : []).map(value => String(value || '').trim()).filter(Boolean))];
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/devices`, { method: 'PUT', body: JSON.stringify({ deviceIds: ids }) });
      const result = resp?.data || resp;
      if (result?.plotId) return result;
      throw new ApiError('后端返回了无效的地块设备绑定结果', { code: 'PLOT_DEVICES_INVALID', payload: resp });
    }
    const plot = this.demoPlots.get(plotId);
    if (!plot) throw new ApiError('没有找到该地块', { status: 404, code: 'PLOT_NOT_FOUND' });
    const all = [...this.demoDevices.values()].filter(device => device.farmId === plot.farmId);
    if (ids.some(id => !all.some(device => device.deviceId === id))) throw new ApiError('设备不存在或不属于当前农场', { status: 404, code: 'DEVICE_NOT_FOUND' });
    const selected = new Set(ids); const devices = []; const movedDeviceIds = []; const unboundDeviceIds = [];
    all.forEach(device => {
      const onPlot = device.plotId === plotId; const should = selected.has(device.deviceId);
      if (onPlot && !should) {
        const saved = { ...device, previousPlotId: plotId, plotId: null, bindingState: 'UNBOUND', status: 'OFFLINE', desiredStatus: 'OFFLINE', controlStatus: 'SUCCEEDED' };
        this.demoDevices.set(device.deviceId, saved); devices.push(saved); unboundDeviceIds.push(device.deviceId); return;
      }
      if (!onPlot && should) {
        if (device.plotId) movedDeviceIds.push(device.deviceId);
        const saved = { ...device, previousPlotId: device.plotId || undefined, plotId, bindingState: 'BOUND', status: 'OFFLINE', desiredStatus: 'OFFLINE', controlStatus: 'SUCCEEDED' };
        this.demoDevices.set(device.deviceId, saved); devices.push(saved); return;
      }
      if (onPlot) devices.push({ ...device });
    });
    return { plotId, deviceIds: ids, devices, movedDeviceIds, unboundDeviceIds, updatedAt: new Date().toISOString() };
  }

  async getPlotSimulation(plotId = 'plot-a01') {
    if (!plotId) throw new ApiError('缺少地块编号', { status: 400, code: 'PLOT_ID_REQUIRED' });
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/simulation`);
      const result = resp?.data || resp;
      if (result && typeof result === 'object') return result;
      throw new ApiError('后端返回了无效的地块模拟策略', { code: 'PLOT_SIMULATION_INVALID', payload: resp });
    }
    const plot = this.demoPlots.get(plotId) || MOCK_DATA.plots.find((item) => item.plotId === plotId) || MOCK_DATA.plots[0];
    if (!this.demoSimulationStrategies.has(plotId)) {
      const scenario = normalizePlotSimulationScenario(plot?.simulation?.scenario || 'NORMAL');
      this.demoSimulationStrategies.set(plotId, {
        plotId, scenario, parameters: cloneSimulationParameters(scenario, plot?.simulation?.parameters), revision: 1,
        sourceMode: 'SIMULATION', updatedAt: new Date().toISOString(),
        hardware: { bindingState: 'UNBOUND', status: 'NOT_BOUND', usability: 'NOT_BOUND', label: '未绑定硬件' },
        simulatorDevice: { status: 'ONLINE', label: '模拟数据运行中' }
      });
    }
    const current = this.demoSimulationStrategies.get(plotId);
    return {
      ...current,
      scenarioCatalog: PLOT_SIMULATION_SCENARIOS.map((item) => ({ ...item, desc: item.description, defaultParameters: cloneSimulationParameters(item.code) })),
      parameterLimits: {
        volatility: { min: .2, max: 3 }, timeScale: { min: 1, max: 180 }, temperatureBias: { min: -15, max: 15 },
        humidityBias: { min: -40, max: 40 }, rainfallRate: { min: 0, max: 120 }, soilMoistureTrendPerHour: { min: -12, max: 12 },
        driftRatePerHour: { min: 0, max: 10 }, offlineRatio: { min: 0, max: 1 }, riskThreshold: { min: 1, max: 99 },
        waterloggingThreshold: { min: 40, max: 99 }, forecastHours: { min: 1, max: 12 }
      }
    };
  }

  async updatePlotSimulation(plotId, { scenario = 'NORMAL', parameters = {} } = {}) {
    const normalized = normalizePlotSimulationScenario(scenario);
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/simulation`, {
        method: 'PUT', body: JSON.stringify({ scenario: normalized, parameters })
      });
      const result = resp?.data || resp;
      if (result?.plotId) return result;
      throw new ApiError('后端返回了无效的模拟策略保存结果', { code: 'PLOT_SIMULATION_UPDATE_INVALID', payload: resp });
    }
    const previous = await this.getPlotSimulation(plotId);
    const next = {
      ...previous, plotId, scenario: normalized,
      parameters: cloneSimulationParameters(normalized, parameters),
      revision: Number(previous.revision || 0) + 1, updatedAt: new Date().toISOString(), sourceMode: 'SIMULATION'
    };
    this.demoSimulationStrategies.set(plotId, next);
    return next;
  }

  async resetPlotSimulation(plotId, target = 'ALL') {
    const normalizedTarget = String(target || 'ALL').toUpperCase();
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/simulation/reset`, {
        method: 'POST', body: JSON.stringify({ target: normalizedTarget })
      });
      const result = resp?.data || resp;
      if (result?.plotId) return result;
      throw new ApiError('后端返回了无效的曲线重置结果', { code: 'PLOT_SIMULATION_RESET_INVALID', payload: resp });
    }
    const current = await this.getPlotSimulation(plotId);
    const next = { ...current, revision: Number(current.revision || 0) + 1, resetTarget: normalizedTarget, resetAt: new Date().toISOString() };
    this.demoSimulationStrategies.set(plotId, next);
    return { ...next, removedSimulationTelemetry: 0, removedForecasts: 0, hardwareTelemetryPreserved: true };
  }

  async deactivatePlot(plotId) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/deactivate`, { method: 'POST', body: '{}' });
      if (resp?.data?.plotId === plotId) return resp.data;
      throw new ApiError('后端返回了无效的地块停用结果', { code: 'PLOT_DEACTIVATE_INVALID', payload: resp });
    }
    const plot = this.demoPlots.get(plotId);
    if (!plot) throw new ApiError('没有找到该地块', { status: 404, code: 'PLOT_NOT_FOUND' });
    const saved = { ...plot, status: 'INACTIVE', deactivatedAt: new Date().toISOString(), sourceMode: 'SIMULATED' };
    this.demoPlots.set(plotId, saved);
    return { ...saved };
  }

  async restorePlot(plotId) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/restore`, { method: 'POST', body: '{}' });
      if (resp?.data?.plotId === plotId) return resp.data;
      throw new ApiError('后端返回了无效的地块恢复结果', { code: 'PLOT_RESTORE_INVALID', payload: resp });
    }
    const plot = this.demoPlots.get(plotId);
    if (!plot) throw new ApiError('没有找到该地块', { status: 404, code: 'PLOT_NOT_FOUND' });
    const saved = { ...plot, status: 'ACTIVE', restoredAt: new Date().toISOString(), sourceMode: 'SIMULATED' };
    this.demoPlots.set(plotId, saved);
    return { ...saved };
  }

  async deletePlot(plotId, confirmName = '') {
    if (this.sessionMode === 'live') {
      const query = new URLSearchParams({ confirmName });
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}?${query}`, { method: 'DELETE' });
      if (resp?.data?.plotId === plotId) return resp.data;
      throw new ApiError('后端返回了无效的地块删除结果', { code: 'PLOT_DELETE_INVALID', payload: resp });
    }
    const plot = this.demoPlots.get(plotId);
    if (!plot) throw new ApiError('没有找到该地块', { status: 404, code: 'PLOT_NOT_FOUND' });
    if (String(plot.status).toUpperCase() !== 'INACTIVE') throw new ApiError('请先停用地块，再执行永久删除', { status: 409, code: 'PLOT_MUST_BE_INACTIVE' });
    if (String(confirmName).trim() !== String(plot.name).trim()) throw new ApiError('请输入完整地块名称进行确认', { status: 400, code: 'PLOT_CONFIRMATION_MISMATCH' });
    this.demoPlots.delete(plotId);
    return { plotId, deleted: true, deletedAt: new Date().toISOString(), sourceMode: 'SIMULATED' };
  }

  async getTelemetry(plotId = 'plot-a01', metric = 'SOIL_MOISTURE', limit = 50, options = {}) {
    if (this.sessionMode === 'live') {
      const query = new URLSearchParams({ metric, limit: String(Math.max(1, Math.min(Number(limit) || 50, 5000))) });
      if (options.from) query.set('from', options.from);
      if (options.to) query.set('to', options.to);
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/telemetry?${query.toString()}`);
      if (resp && Array.isArray(resp.data)) return resp.data;
      throw new ApiError('后端返回了无效的遥测数据', { code: 'TELEMETRY_INVALID', payload: resp });
    }
    // Generate a realistic multi-metric window for the explicit demo session.
    // Each series follows its own physical range and the selected plot
    // strategy, so changing the chart metric does not silently reuse soil %.
    const now = Date.now();
    const code = String(metric || 'SOIL_MOISTURE').toUpperCase();
    const profile = telemetryMetricProfile(code);
    const targetPlot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
    const metricRecord = targetPlot?.metrics?.[code] || {};
    const configuredBase = Number(metricRecord.value);
    const baseValue = Number.isFinite(configuredBase) ? configuredBase : profile.defaultValue;
    const strategy = this.demoSimulationStrategies.get(plotId);
    const scenario = String(strategy?.scenario || 'NORMAL').toUpperCase();
    const params = strategy?.parameters || PLOT_SIMULATION_DEFAULTS.NORMAL;
    const driftRate = scenario === 'SENSOR_DRIFT' ? Number(params.driftRatePerHour || 0) : 0;
    const count = Math.max(1, Math.min(Number(limit) || 24, 5000));
    const requestedEnd = options.to ? new Date(options.to).getTime() : now;
    const endMs = Number.isFinite(requestedEnd) ? requestedEnd : now;
    const requestedStart = options.from ? new Date(options.from).getTime() : endMs - (count - 1) * 10 * 60 * 1000;
    const startMs = Number.isFinite(requestedStart) ? requestedStart : endMs - (count - 1) * 10 * 60 * 1000;
    const stepMs = count > 1 ? Math.max(1, Math.floor((endMs - startMs) / (count - 1))) : 0;
    const strategyTrend = {
      SOIL_MOISTURE: Number(params.soilMoistureTrendPerHour || 0) + (scenario === 'HEAVY_RAIN' ? Number(params.rainfallRate || 0) * .04 : 0) + driftRate,
      AIR_TEMPERATURE: Number(params.temperatureBias || 0) * .35,
      AIR_HUMIDITY: Number(params.humidityBias || 0) * .3,
      LIGHT: scenario === 'DROUGHT' ? 1800 : scenario === 'HEAVY_RAIN' ? -1400 : 0,
      CO2: scenario === 'HEAVY_RAIN' ? -30 : scenario === 'DROUGHT' ? 24 : 0,
      PH: scenario === 'SENSOR_DRIFT' ? Number(params.driftRatePerHour || 0) * .02 : 0,
      WATER_LEVEL: scenario === 'HEAVY_RAIN' ? Number(params.rainfallRate || 0) * .03 : scenario === 'DROUGHT' ? -1 : 0,
      RAINFALL: 0
    }[code] || 0;
    const trendWindowHours = Math.max(.25, (count - 1) * 10 / 60);
    const volatility = Math.max(.2, Number(params.volatility || 1.25));
    return Array.from({ length: count }, (_, i) => {
      const progress = count <= 1 ? 0 : i / (count - 1);
      const elapsedHours = progress * trendWindowHours;
      const wave = Math.sin(i / 3) * profile.noise * volatility;
      let value = baseValue + strategyTrend * elapsedHours + wave + (Math.random() * profile.noise * .65 - profile.noise * .325);
      if (code === 'LIGHT') value += Math.sin(i / 8) * 2200 * volatility;
      if (code === 'RAINFALL') {
        const rate = Math.max(0, Number(params.rainfallRate ?? profile.defaultValue));
        const pattern = .72 + .28 * Math.max(0, Math.sin(i / 2.4 + 1.2));
        value = (scenario === 'HEAVY_RAIN' ? rate : Math.max(.2, rate * .18)) * pattern + Math.random() * profile.noise;
      }
      value = Math.max(profile.min, Math.min(profile.max, value));
      const qualityStatus = scenario === 'DEVICE_OFFLINE' && i > count * .55 ? 'OFFLINE' : 'GOOD';
      return {
        eventId: `mock-evt-${code.toLowerCase()}-${i}`,
        plotId,
        metric: code,
        value: Number(value.toFixed(profile.decimals)),
        unit: metricRecord.unit || profile.unit,
        ts: new Date(startMs + i * stepMs).toISOString(),
        sourceMode: 'SIMULATION',
        dataOrigin: 'SIMULATOR',
        quality: { status: qualityStatus, freshnessMs: 200, confidence: qualityStatus === 'GOOD' ? 0.98 : 0.2 }
      };
    });
  }

  /**
   * 返回指定地块的多指标遥测窗口。后端支持不带 metric 的混合序列；
   * 若当前环境只提供单指标接口，则按统一八类指标并行回退。
   */
  async getPlotTelemetryAll(plotId = 'plot-a01', limit = 120) {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 120, 5000));
    let mixedError = null;
    if (this.sessionMode === 'live') {
      try {
        const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/telemetry?limit=${boundedLimit}`);
        if (Array.isArray(resp?.data) && resp.data.length) {
          return resp.data
            .filter(point => point && point.metric)
            .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
        }
      } catch (error) {
        mixedError = error;
        if (this.isLive) console.warn('[AgriLoop] mixed telemetry unavailable; falling back to metric windows:', error);
      }
    }
    const metrics = ['SOIL_MOISTURE', 'AIR_TEMPERATURE', 'AIR_HUMIDITY', 'LIGHT', 'CO2', 'PH', 'WATER_LEVEL', 'RAINFALL'];
    // A backend may legitimately omit one optional metric (for example PH or
    // WATER_LEVEL) while still serving the core soil/air series.  Keep the
    // successful backend windows instead of turning one partial endpoint
    // failure into an empty farmer workspace.
    const batches = await Promise.allSettled(metrics.map(metric => this.getTelemetry(plotId, metric, boundedLimit)));
    const successful = batches
      .filter(result => result.status === 'fulfilled')
      .flatMap(result => result.value || [])
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    if (!successful.length && batches.every(result => result.status === 'rejected')) {
      throw mixedError || batches.find(result => result.status === 'rejected')?.reason || new ApiError('正式遥测读取失败', { code: 'TELEMETRY_UNAVAILABLE', isNetworkError: true });
    }
    return successful;
  }

  async getTelemetryDay(plotId = 'plot-a01', metric = 'SOIL_MOISTURE', limit = 5000) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.getTelemetry(plotId, metric, Math.max(1, Math.min(Number(limit) || 5000, 5000)), {
      from: start.toISOString(),
      to: new Date().toISOString()
    });
  }

  /** farm-operations 增量合同：在线走后端，离线只使用显式标记的模拟数据。 */
  async getTodayWorkItems(filters = '') {
    const normalizedFilters = typeof filters === 'object' && filters !== null ? filters : { plotId: filters };
    const plotId = normalizedFilters.plotId || '';
    const farmId = normalizedFilters.farmId || '';
    if (this.sessionMode === 'live') {
      const queryParams = new URLSearchParams();
      if (farmId) queryParams.set('farmId', farmId);
      if (plotId) queryParams.set('plotId', plotId);
      const query = queryParams.size ? `?${queryParams}` : '';
      try {
        const response = await this._fetch(`/api/v1/work-items/today${query}`);
        if (Array.isArray(response?.data)) return response.data;
        throw new ApiError('后端返回了无效的今日工单数据', { code: 'TODAY_WORK_INVALID', payload: response });
      } catch (error) {
        throw error;
      }
    }
    return Array.from(this.demoWorkOrders.values())
      .filter(item => !farmId || item.farmId === farmId || (!item.farmId && farmId === 'farm-demo'))
      .filter(item => !plotId || item.plotId === plotId)
      .map(cloneWorkOrder);
  }

  async getWorkOrders(filters = {}) {
    const queryParams = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') queryParams.set(key, String(value));
    });
    if (this.sessionMode === 'live') {
      const query = queryParams.size ? `?${queryParams.toString()}` : '';
      const response = await this._fetch(`/api/v1/work-orders${query}`);
      if (Array.isArray(response?.data)) return response.data;
      throw new ApiError('后端返回了无效的工单数据', { code: 'WORK_ORDERS_INVALID', payload: response });
    }
    const currentActorId = this._demoActorId();
    return Array.from(this.demoWorkOrders.values())
      .filter((item) => this.user?.role !== 'FARMER' || item.assigneeId === currentActorId)
      .filter((item) => !filters.farmId || item.farmId === filters.farmId || (!item.farmId && filters.farmId === 'farm-demo'))
      .filter((item) => !filters.plotId || item.plotId === filters.plotId)
      .filter((item) => !filters.status || normalizeWorkOrderStatus(item.status) === normalizeWorkOrderStatus(filters.status))
      .filter((item) => !filters.assigneeId || item.assigneeId === filters.assigneeId)
      .map(cloneWorkOrder);
  }

  async saveWorkOrder(workOrder) {
    if (this.sessionMode === 'live') {
      const response = await this._fetch('/api/v1/work-orders', {
        method: 'POST',
        body: JSON.stringify(workOrder)
      });
      return response?.data || response;
    }
    const workOrderId = workOrder.workOrderId || `wo-demo-${Date.now()}`;
    const now = new Date().toISOString();
    const saved = cloneWorkOrder({
      ...workOrder,
      workOrderId,
      workItemId: workOrder.workItemId || workOrderId,
      farmId: workOrder.farmId || 'farm-demo',
      status: normalizeWorkOrderStatus(workOrder.status || 'OPEN'),
      assigneeId: workOrder.assigneeId || null,
      assigneeName: workOrder.assigneeName || null,
      createdAt: workOrder.createdAt || now,
      updatedAt: now,
      createdBy: workOrder.createdBy || this._demoActorId(),
      updatedBy: this._demoActorId(),
      history: [{
        action: 'CREATE',
        fromStatus: null,
        toStatus: normalizeWorkOrderStatus(workOrder.status || 'OPEN'),
        actorId: this._demoActorId(),
        actorName: this.user?.username || 'demo',
        actorRole: this.user?.role || 'FARM_ADMIN',
        at: now,
        note: workOrder.reason || '创建任务',
        evidenceRefs: []
      }]
    });
    this.demoWorkOrders.set(workOrderId, saved);
    return cloneWorkOrder(saved);
  }

  async createWorkOrder(workOrder) { return this.saveWorkOrder(workOrder); }

  async assignWorkOrder(workOrderId, input = {}) {
    if (this.sessionMode === 'live') {
      const response = await this._fetch(`/api/v1/work-orders/${encodeURIComponent(workOrderId)}/assign`, {
        method: 'POST',
        body: JSON.stringify(input)
      });
      return response?.data || response;
    }
    if (this.user?.role !== 'FARM_ADMIN') throw new ApiError('只有农场管理员可以分配任务', { status: 403, code: 'WORK_ORDER_FORBIDDEN' });
    const work = this._demoWorkOrder(workOrderId);
    if (TERMINAL_WORK_ORDER_STATUSES.has(normalizeWorkOrderStatus(work.status))) throw new ApiError('已结束的任务不能重新分配', { status: 409, code: 'WORK_ORDER_TERMINAL' });
    const member = (MOCK_DATA.farmMembers || []).find((item) => item.userId === input.assigneeId && item.role === 'FARMER' && item.status === 'ACTIVE');
    if (!member || (!member.plotIds?.includes(work.plotId) && !member.plotIds?.includes('*'))) {
      throw new ApiError('请选择有权处理这块地的种植农户', { status: 400, code: 'ASSIGNEE_SCOPE_MISMATCH' });
    }
    const assignedAt = new Date();
    let dueAt = work.dueAt || null;
    if (input.dueAt) {
      const renewedDueAt = new Date(input.dueAt);
      if (Number.isNaN(renewedDueAt.getTime()) || renewedDueAt.getTime() <= assignedAt.getTime()) {
        throw new ApiError('新处理时限必须晚于当前时间', { status: 400, code: 'WORK_ORDER_DUE_AT_INVALID' });
      }
      dueAt = renewedDueAt.toISOString();
    }
    return this._saveDemoTransition(work, {
      status: 'ASSIGNED',
      assigneeId: member.userId,
      assigneeName: member.displayName || member.username,
      assignedAt: assignedAt.toISOString(),
      assignedBy: this._demoActorId(),
      dueAt
    }, work.status === 'OPEN' ? 'ASSIGN' : 'REASSIGN', input.note || `分配给${member.displayName || member.username}`);
  }

  async transitionWorkOrder(workOrderId, input = {}) {
    if (this.sessionMode === 'live') {
      const response = await this._fetch(`/api/v1/work-orders/${encodeURIComponent(workOrderId)}/transition`, {
        method: 'POST',
        body: JSON.stringify(input)
      });
      return response?.data || response;
    }
    const work = this._demoWorkOrder(workOrderId);
    const current = normalizeWorkOrderStatus(work.status);
    let action = String(input.action || input.status || '').trim().toUpperCase();
    if (action === 'IN_PROGRESS') action = current === 'REJECTED' ? 'RESTART' : 'START';
    if (action === 'SUBMITTED') action = 'SUBMIT';
    if (action === 'CANCELLED') action = 'CANCEL';
    if (action === 'CANCEL') {
      if (this.user?.role !== 'FARM_ADMIN') throw new ApiError('只有农场管理员可以取消任务', { status: 403, code: 'WORK_ORDER_FORBIDDEN' });
      if (TERMINAL_WORK_ORDER_STATUSES.has(current)) throw new ApiError('已结束的任务不能取消', { status: 409, code: 'WORK_ORDER_TERMINAL' });
      return this._saveDemoTransition(work, { status: 'CANCELLED', cancelledAt: new Date().toISOString(), cancelledBy: this._demoActorId(), cancelReason: input.note || '管理员取消任务' }, 'CANCEL', input.note || '管理员取消任务');
    }
    this._requireDemoAssignee(work);
    if (action === 'START' && current === 'ASSIGNED') {
      return this._saveDemoTransition(work, { status: 'IN_PROGRESS', startedAt: new Date().toISOString(), startedBy: this._demoActorId() }, 'START', input.note || '开始执行');
    }
    if (['RESTART', 'RESUME'].includes(action) && current === 'REJECTED') {
      return this._saveDemoTransition(work, {
        status: 'IN_PROGRESS',
        restartedAt: new Date().toISOString(),
        restartedBy: this._demoActorId(),
        resultSummary: null,
        evidenceRefs: [],
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null,
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: null
      }, 'RESTART', input.note || '按退回意见重新处理');
    }
    if (action === 'SUBMIT' && current === 'IN_PROGRESS') {
      const resultSummary = String(input.resultSummary || input.note || '').trim();
      if (!resultSummary) throw new ApiError('请填写处理结果', { status: 400, code: 'WORK_RESULT_REQUIRED' });
      return this._saveDemoTransition(work, { status: 'SUBMITTED', resultSummary, evidenceRefs: input.evidenceRefs || [], submittedAt: new Date().toISOString(), submittedBy: this._demoActorId() }, 'SUBMIT', resultSummary, input.evidenceRefs || []);
    }
    throw new ApiError('当前任务不能执行这个操作', { status: 409, code: 'WORK_ORDER_TRANSITION_INVALID' });
  }

  async reviewWorkOrder(workOrderId, input = {}) {
    if (this.sessionMode === 'live') {
      const response = await this._fetch(`/api/v1/work-orders/${encodeURIComponent(workOrderId)}/review`, {
        method: 'POST',
        body: JSON.stringify(input)
      });
      return response?.data || response;
    }
    if (this.user?.role !== 'FARM_ADMIN') throw new ApiError('只有农场管理员可以验收任务', { status: 403, code: 'WORK_ORDER_FORBIDDEN' });
    const work = this._demoWorkOrder(workOrderId);
    if (normalizeWorkOrderStatus(work.status) !== 'SUBMITTED') throw new ApiError('只有等待验收的任务可以处理', { status: 409, code: 'WORK_ORDER_TRANSITION_INVALID' });
    const action = String(input.action || input.status || '').trim().toUpperCase();
    const approved = ['APPROVE', 'ACCEPT', 'DONE'].includes(action);
    const rejected = ['REJECT', 'REJECTED'].includes(action);
    const note = String(input.note || '').trim();
    if (!approved && !rejected) throw new ApiError('请选择验收通过或退回处理', { status: 400, code: 'WORK_REVIEW_ACTION_INVALID' });
    if (rejected && !note) throw new ApiError('退回任务时请填写原因', { status: 400, code: 'WORK_REVIEW_NOTE_REQUIRED' });
    const now = new Date().toISOString();
    return this._saveDemoTransition(work, approved
      ? { status: 'DONE', reviewedAt: now, reviewedBy: this._demoActorId(), reviewNote: note, completedAt: now, completedBy: this._demoActorId() }
      : { status: 'REJECTED', reviewedAt: now, reviewedBy: this._demoActorId(), reviewNote: note, rejectedAt: now, rejectedBy: this._demoActorId(), rejectionReason: note },
    approved ? 'APPROVE' : 'REJECT', note || '验收通过');
  }

  async getFarmMembers({ farmId } = {}) {
    if (this.sessionMode === 'live') {
      if (!farmId) throw new ApiError('请先选择农场', { status: 400, code: 'FARM_CONTEXT_REQUIRED' });
      const response = await this._fetch(`/api/v1/farm-members?farmId=${encodeURIComponent(farmId)}`);
      if (Array.isArray(response?.data)) {
        const members = response.data.map((member) => normalizeFarmMember(member, 'ACCOUNT'));
        const invalid = members.find((member) => !member.userId || !member.username || !['FARMER', 'FARM_ADMIN'].includes(member.role));
        if (!invalid) return members;
      }
      throw new ApiError('后端返回了无效的成员数据', { code: 'FARM_MEMBERS_INVALID', payload: response });
    }
    return Array.from(this.demoFarmMembers.values())
      .filter(member => !farmId || member.farmIds.includes('*') || member.farmIds.includes(farmId))
      .map(member => ({ ...member, plotIds: [...member.plotIds], farmIds: [...member.farmIds] }));
  }

  async updateFarmMemberScope(userId, { farmId, plotIds = [] } = {}) {
    if (this.sessionMode === 'live') {
      const response = await this._fetch(`/api/v1/farm-members/${encodeURIComponent(userId)}/scope`, {
        method: 'PATCH',
        body: JSON.stringify({ farmId, plotIds })
      });
      if (response?.data?.userId) return normalizeFarmMember(response.data, 'ACCOUNT');
      throw new ApiError('后端返回了无效的成员权限结果', { code: 'MEMBER_SCOPE_INVALID', payload: response });
    }
    const current = this.demoFarmMembers.get(userId);
    if (!current) throw new ApiError('没有找到该成员', { status: 404, code: 'FARM_MEMBER_NOT_FOUND' });
    if (current.role !== 'FARMER') throw new ApiError('这里只能维护种植农户的地块范围', { status: 403, code: 'MEMBER_ROLE_IMMUTABLE' });
    const farmPlotIds = new Set(Array.from(this.demoPlots.values()).filter(plot => plot.farmId === farmId).map(plot => plot.plotId));
    const preserved = current.plotIds.filter(plotId => !farmPlotIds.has(plotId));
    const updated = { ...current, plotIds: [...new Set([...preserved, ...plotIds])], sourceMode: 'SIMULATED' };
    this.demoFarmMembers.set(userId, updated);
    return { ...updated, plotIds: [...updated.plotIds] };
  }

  async createFarmMember({ farmId, username, password, displayName = '', plotIds = [] } = {}) {
    if (this.sessionMode === 'live') {
      const response = await this._fetch('/api/v1/farm-members', {
        method: 'POST',
        body: JSON.stringify({ farmId, username, password, displayName, plotIds })
      });
      if (response?.data?.userId) {
        return { ...normalizeFarmMember(response.data, 'ACCOUNT'), recoveryCode: response.data.recoveryCode || '' };
      }
      throw new ApiError('后端返回了无效的成员新增结果', { code: 'FARM_MEMBER_CREATE_INVALID', payload: response });
    }
    const normalized = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{3,31}$/i.test(normalized)) throw new ApiError('账号需为 4～32 位字母、数字、点、下划线或短横线', { status: 400, code: 'MEMBER_USERNAME_INVALID' });
    if (String(password || '').length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new ApiError('初始密码至少 8 位，并同时包含字母和数字', { status: 400, code: 'MEMBER_PASSWORD_WEAK' });
    if ([...this.demoFarmMembers.values()].some(member => member.username.toLowerCase() === normalized)) throw new ApiError('该成员账号已存在', { status: 409, code: 'MEMBER_EXISTS' });
    const farmPlotIds = new Set([...this.demoPlots.values()].filter(plot => plot.farmId === farmId && String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE').map(plot => plot.plotId));
    if (plotIds.some(plotId => !farmPlotIds.has(plotId))) throw new ApiError('只能分配当前农场正在使用的地块', { status: 403, code: 'MEMBER_SCOPE_FORBIDDEN' });
    const userId = `user-demo-${Date.now().toString(36)}`;
    const member = normalizeFarmMember({
      userId,
      username: normalized,
      displayName: displayName || normalized,
      role: 'FARMER',
      roleLabel: '种植农户',
      farmIds: [farmId],
      plotIds,
      status: 'ACTIVE'
    }, 'SIMULATED');
    this.demoFarmMembers.set(userId, member);
    return { ...member, farmIds: [...member.farmIds], plotIds: [...member.plotIds], recoveryCode: 'DEMO-ONLY-ONCE' };
  }

  async updateFarmMemberStatus(userId, { farmId, status, enabled } = {}) {
    const nextEnabled = typeof enabled === 'boolean' ? enabled : String(status || '').toUpperCase() !== 'INACTIVE' && String(status || '').toUpperCase() !== 'DISABLED';
    if (this.sessionMode === 'live') {
      const response = await this._fetch(`/api/v1/farm-members/${encodeURIComponent(userId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ farmId, status: nextEnabled ? 'ACTIVE' : 'INACTIVE', enabled: nextEnabled })
      });
      if (response?.data?.userId) return normalizeFarmMember(response.data, 'ACCOUNT');
      throw new ApiError('后端返回了无效的成员状态结果', { code: 'FARM_MEMBER_STATUS_INVALID', payload: response });
    }
    const current = this.demoFarmMembers.get(userId);
    if (!current) throw new ApiError('没有找到该成员', { status: 404, code: 'FARM_MEMBER_NOT_FOUND' });
    if (current.role !== 'FARMER') throw new ApiError('这里只能启用或停用种植农户', { status: 403, code: 'MEMBER_ROLE_IMMUTABLE' });
    const updated = { ...current, status: nextEnabled ? 'ACTIVE' : 'INACTIVE' };
    this.demoFarmMembers.set(userId, updated);
    return { ...updated, plotIds: [...updated.plotIds], farmIds: [...updated.farmIds] };
  }

  async deleteFarmMember(userId, { farmId } = {}) {
    if (this.sessionMode === 'live') {
      const response = await this._fetch(`/api/v1/farm-members/${encodeURIComponent(userId)}?farmId=${encodeURIComponent(farmId || '')}`, { method: 'DELETE' });
      if (response?.data?.userId) return response.data;
      throw new ApiError('后端返回了无效的成员移除结果', { code: 'FARM_MEMBER_DELETE_INVALID', payload: response });
    }
    const member = this.demoFarmMembers.get(userId);
    if (!member || member.role !== 'FARMER') throw new ApiError('没有找到可移除的种植农户', { status: 404, code: 'FARM_MEMBER_NOT_FOUND' });
    const farmPlotIds = new Set([...this.demoPlots.values()].filter(plot => plot.farmId === farmId).map(plot => plot.plotId));
    const farmIds = member.farmIds.filter(id => id !== farmId);
    const plotIds = member.plotIds.filter(id => !farmPlotIds.has(id));
    if (farmIds.length) this.demoFarmMembers.set(userId, { ...member, farmIds, plotIds });
    else this.demoFarmMembers.delete(userId);
    return { userId, username: member.username, farmId, removed: true, sourceMode: 'SIMULATED' };
  }

  _demoActorId() {
    if (this.user?.userId) return this.user.userId;
    if (this.user?.username === 'farmer') return 'user-farmer';
    if (this.user?.username === 'admin') return 'user-admin';
    if (this.user?.username === 'sysadmin') return 'user-system';
    return this.user?.username || 'demo-user';
  }

  _demoWorkOrder(workOrderId) {
    const work = this.demoWorkOrders.get(workOrderId);
    if (!work) throw new ApiError('没有找到这项任务', { status: 404, code: 'NOT_FOUND' });
    return cloneWorkOrder(work);
  }

  _requireDemoAssignee(work) {
    if (this.user?.role !== 'FARMER' || work.assigneeId !== this._demoActorId()) {
      throw new ApiError('只有这项任务的执行农户可以操作', { status: 403, code: 'WORK_ORDER_ASSIGNEE_REQUIRED' });
    }
  }

  _saveDemoTransition(work, changes, action, note, evidenceRefs = []) {
    const now = new Date().toISOString();
    const previousStatus = normalizeWorkOrderStatus(work.status);
    const nextStatus = normalizeWorkOrderStatus(changes.status || previousStatus);
    const history = [...(work.history || []), {
      action,
      fromStatus: previousStatus,
      toStatus: nextStatus,
      actorId: this._demoActorId(),
      actorName: this.user?.username || 'demo',
      actorRole: this.user?.role || 'FARMER',
      at: now,
      note: note || '',
      evidenceRefs: Array.isArray(evidenceRefs) ? evidenceRefs : []
    }];
    const saved = cloneWorkOrder({ ...work, ...changes, status: nextStatus, updatedAt: now, updatedBy: this._demoActorId(), history });
    this.demoWorkOrders.set(work.workOrderId, saved);
    return cloneWorkOrder(saved);
  }

  async getAlerts(filters = {}) {
    const queryParams = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') queryParams.set(key, String(value));
    });
    if (this.sessionMode === 'live') {
      const query = queryParams.size ? `?${queryParams.toString()}` : '';
      const response = await this._fetch(`/api/v1/alerts${query}`);
      if (Array.isArray(response?.data)) return response.data;
      throw new ApiError('后端返回了无效的告警数据', { code: 'ALERTS_INVALID', payload: response });
    }
    return Array.from(this.demoAlerts.values())
      .filter(alert => !filters.farmId || alert.farmId === filters.farmId)
      .filter(alert => !filters.plotId || alert.plotId === filters.plotId)
      .filter(alert => !filters.status || alert.status === filters.status)
      .map(alert => ({ ...alert }));
  }

  async transitionAlert(alertId, action) {
    const operation = String(action || '').toLowerCase();
    if (!['ack', 'close', 'escalate'].includes(operation)) throw new ApiError('不支持的告警操作', { code: 'ALERT_ACTION_INVALID' });
    if (this.sessionMode === 'live') {
      const response = await this._fetch(`/api/v1/alerts/${encodeURIComponent(alertId)}/${operation}`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      return response?.data || response;
    }
    const status = { ack: 'ACKED', close: 'CLOSED', escalate: 'ESCALATED' }[operation];
    const current = this.demoAlerts.get(alertId) || { alertId };
    const saved = { ...current, alertId: current.alertId || current.id || alertId, status, updatedAt: new Date().toISOString(), provenance: 'SIMULATED' };
    this.demoAlerts.set(alertId, saved);
    return { ...saved };
  }

  async ackAlert(alertId) { return this.transitionAlert(alertId, 'ack'); }
  async closeAlert(alertId) { return this.transitionAlert(alertId, 'close'); }
  async escalateAlert(alertId) { return this.transitionAlert(alertId, 'escalate'); }

  async publishAlertVerificationTask(alertId, input = {}) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/alerts/${encodeURIComponent(alertId)}/verification-task`, { method: 'POST', body: JSON.stringify(input) });
      return resp?.data || resp;
    }
    const alert = this.demoAlerts.get(alertId);
    if (!alert) throw new ApiError('没有找到该告警', { status: 404, code: 'ALERT_NOT_FOUND' });
    const existing = [...this.demoWorkOrders.values()].find(order => order.sourceRef === alertId && order.taskPurpose === 'ALERT_VERIFICATION' && !['DONE', 'CANCELLED'].includes(normalizeWorkOrderStatus(order.status)));
    if (existing) return { alertId, workOrder: cloneWorkOrder(existing), reused: true, taskPurpose: 'ALERT_VERIFICATION' };
    const farmers = [...this.demoFarmMembers.values()].filter(member => member.role === 'FARMER' && member.farmIds.includes(alert.farmId || 'farm-demo'));
    const assignee = farmers.find(member => member.plotIds.includes(alert.plotId)) || farmers[0];
    if (!assignee) throw new ApiError('暂无可分配的农户', { status: 409, code: 'ASSIGNEE_UNAVAILABLE' });
    const created = await this.createWorkOrder({ farmId: alert.farmId || 'farm-demo', plotId: alert.plotId, sourceType: 'ALERT', sourceRef: alertId, taskPurpose: 'ALERT_VERIFICATION', actionType: 'INSPECTION', title: `核查：${alert.title || '地块告警'}`, reason: alert.message || '现场核查告警', priority: alert.level || 'MEDIUM', dueAt: new Date(Date.now() + 2 * 3600000).toISOString(), followUpActionType: 'FIELD_OPERATION', provenance: 'DERIVED' });
    const assigned = await this.assignWorkOrder(created.workOrderId, { assigneeId: assignee.userId, note: '发布告警核查任务' });
    return { alertId, workOrder: assigned, reused: false, taskPurpose: 'ALERT_VERIFICATION' };
  }

  async confirmAgentAction(actionId, input = {}) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/agent/actions/${encodeURIComponent(actionId)}/confirm`, { method: 'POST', body: JSON.stringify(input) });
      return resp?.data || resp;
    }
    const action = this.demoAgentActions.get(actionId);
    if (!action) throw new ApiError('操作预览不存在或已过期', { status: 409, code: 'AGENT_ACTION_EXPIRED' });
    if (action.status !== 'AWAITING_CONFIRMATION') return { ...action };
    const message = action.message || '';
    let result;
    if (action.toolName === 'close_alert') {
      const alert = [...this.demoAlerts.values()].find(item => item.plotId === action.plotId && !['CLOSED', 'RESOLVED'].includes(item.status));
      if (!alert) throw new ApiError('当前地块没有待处理告警', { status: 404, code: 'ALERT_NOT_FOUND' });
      result = await this.closeAlert(alert.alertId || alert.id);
    } else if (action.toolName === 'publish_alert_verification') {
      const alert = [...this.demoAlerts.values()].find(item => item.plotId === action.plotId && !['CLOSED', 'RESOLVED'].includes(item.status));
      if (!alert) throw new ApiError('当前地块没有待处理告警', { status: 404, code: 'ALERT_NOT_FOUND' });
      result = await this.publishAlertVerificationTask(alert.alertId || alert.id);
    } else if (action.toolName === 'create_and_assign_work_order') {
      result = await this.createWorkOrder({ farmId: 'farm-demo', plotId: action.plotId, title: message.replace(/^.*?(任务|农务)[：:]?/, '').trim() || 'Agent 创建任务', reason: message, actionType: 'FIELD_OPERATION', priority: 'MEDIUM' });
      const farmer = [...this.demoFarmMembers.values()].find(member => member.role === 'FARMER' && (member.plotIds.includes(action.plotId) || member.plotIds.includes('*')));
      if (farmer) result = await this.assignWorkOrder(result.workOrderId, { assigneeId: farmer.userId, note: 'Agent 确认后下发' });
    } else {
      result = { message: '演示 Agent 已完成操作预览确认', plotId: action.plotId };
    }
    const saved = { ...action, status: 'SUCCEEDED', result, completedAt: new Date().toISOString() };
    this.demoAgentActions.set(actionId, saved);
    return saved;
  }

  async cancelAgentAction(actionId) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/agent/actions/${encodeURIComponent(actionId)}/cancel`, { method: 'POST', body: '{}' });
      return resp?.data || resp;
    }
    const action = this.demoAgentActions.get(actionId);
    if (!action) throw new ApiError('操作预览不存在或已过期', { status: 409, code: 'AGENT_ACTION_EXPIRED' });
    const saved = { ...action, status: 'CANCELED', canceledAt: new Date().toISOString() };
    this.demoAgentActions.set(actionId, saved);
    return saved;
  }

  async getInspections(plotId = '') {
    if (this.sessionMode === 'live') {
      const response = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/inspections`);
      if (Array.isArray(response?.data)) return response.data;
      throw new ApiError('后端返回了无效的巡田记录', { code: 'INSPECTIONS_INVALID', payload: response });
    }
    return Array.from(this.demoInspections.values()).filter(item => !plotId || item.plotId === plotId).map(item => ({ ...item }));
  }

  async createInspection(inspection, files = []) {
    const uploads = Array.from(files || []).filter(Boolean).slice(0, 6);
    if (this.sessionMode === 'live') {
      const response = await this._fetch('/api/v1/inspections', {
        method: 'POST',
        body: JSON.stringify(inspection)
      });
      const saved = response?.data || response;
      if (!saved?.inspectionId) throw new ApiError('巡田记录保存失败', { code: 'INSPECTION_CREATE_INVALID', payload: response });
      if (!uploads.length) return saved;
      return this.uploadInspectionPhotos(saved.inspectionId, uploads);
    }
    const now = new Date().toISOString();
    const photos = await Promise.all(uploads.map((file, index) => fileToInspectionPhoto(file, index)));
    const saved = {
      ...inspection,
      inspectionId: `ins-demo-${Date.now()}`,
      operatorId: this.user?.userId || 'demo-farmer',
      operatorName: this.user?.username || 'demo',
      operatorRole: this.user?.role || 'FARMER',
      observedAt: inspection.observedAt || now,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      provenance: 'USER_PROVIDED',
      sourceType: 'HUMAN_OBSERVATION',
      photos,
      quality: inspection.quality || { status: 'GOOD', completeness: 1 }
    };
    this.demoInspections.set(saved.inspectionId, saved);
    if (saved.workOrderId && this.demoWorkOrders.has(saved.workOrderId)) {
      const work = this.demoWorkOrders.get(saved.workOrderId);
      const evidenceRefs = Array.from(new Set([...(work.evidenceRefs || []), saved.inspectionId]));
      const history = [...(work.history || []), {
        action: 'EVIDENCE_ADDED',
        fromStatus: work.status,
        toStatus: work.status,
        actorId: saved.operatorId,
        actorName: saved.operatorName,
        actorRole: saved.operatorRole,
        at: now,
        note: '新增巡田证据',
        evidenceRefs: [saved.inspectionId]
      }];
      this.demoWorkOrders.set(saved.workOrderId, cloneWorkOrder({ ...work, evidenceRefs, history, updatedAt: now }));
    }
    return { ...saved };
  }

  async uploadInspectionPhotos(inspectionId, files = []) {
    const uploads = Array.from(files || []).filter(Boolean).slice(0, 6);
    if (!uploads.length) throw new ApiError('请选择至少一张现场照片', { status: 400, code: 'INSPECTION_PHOTO_REQUIRED' });
    if (this.sessionMode === 'live') {
      const body = new FormData();
      uploads.forEach((file) => body.append('files', file));
      const response = await this._fetch(`/api/v1/inspections/${encodeURIComponent(inspectionId)}/photos`, {
        method: 'POST',
        body
      });
      return response?.data || response;
    }
    const current = this.demoInspections.get(inspectionId);
    if (!current) throw new ApiError('没有找到该巡田记录', { status: 404, code: 'NOT_FOUND' });
    const photos = [...(current.photos || []), ...(await Promise.all(uploads.map((file, index) => fileToInspectionPhoto(file, index))))];
    const saved = { ...current, photos, updatedAt: new Date().toISOString(), revision: Number(current.revision || 1) + 1 };
    this.demoInspections.set(inspectionId, saved);
    return { ...saved };
  }

  async evaluateResourcePlan(input = {}) {
    if (this.sessionMode === 'live') {
      const response = await this._fetch('/api/v1/resource-plans/evaluate', {
        method: 'POST',
        body: JSON.stringify(input)
      });
      const plan = response?.data || response;
      return { ...plan, trialOnly: true, provenance: plan?.provenance || 'DERIVED', sourceMode: 'ESTIMATED' };
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
      provenance: 'SIMULATED',
      sourceMode: 'ESTIMATED',
      trialOnly: true
    };
  }

  async getAgentHistory(conversationId = '', limit = 40) {
    if (this.sessionMode !== 'live') {
      const userId = this.user?.userId || this.user?.username || 'demo';
      return {
        conversation: { conversationId: `conversation-${userId}`, title: '我的农智对话', messageCount: 0 },
        messages: []
      };
    }
    const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(Number(limit) || 40, 100))) });
    if (conversationId) params.set('conversationId', conversationId);
    const resp = await this._fetch(`/api/v1/agent/history?${params.toString()}`);
    if (resp?.data) return resp.data;
    throw new ApiError('后端返回了无效的对话历史', { code: 'AGENT_HISTORY_INVALID', payload: resp });
  }

  async agentChat(message, plotId = 'plot-a01', conversationId = '') {
    if (this.sessionMode === 'live') {
      const body = { message, plotId };
      if (conversationId) body.conversationId = conversationId;
      const resp = await this._fetch('/api/v1/agent/chat', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (resp && resp.data) return resp.data;
      throw new ApiError('后端返回了无效的 Agent 响应', { code: 'AGENT_RESPONSE_INVALID', payload: resp });
    }

    // High-Fidelity Smart Agent Response Generator
    const lower = (message || '').toLowerCase();
    const traceId = 'run-' + Math.random().toString(36).substring(2, 10);
    const plot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
    if (/(新增|新建|创建|修改|更新|绑定|换绑|解绑|下发|发布|关闭|安排|派发|添加)/.test(message || '') && this.user?.role === 'FARM_ADMIN') {
      const toolName = /(关闭).*(告警|报警)/.test(message) ? 'close_alert' : /(核查|复核).*(发布|下发|创建)/.test(message) ? 'publish_alert_verification' : /(绑定|换绑|解绑).*(设备|传感器)/.test(message) ? 'set_plot_devices' : /(任务|农务)/.test(message) ? 'create_and_assign_work_order' : /(修改|更新|编辑).*(地块|田|棚)/.test(message) ? 'update_plot' : 'create_plot';
      const actionId = `demo-agent-${Date.now().toString(36)}`;
      const proposal = { actionId, toolName, summary: `准备执行：${message}`, status: 'AWAITING_CONFIRMATION', requiresConfirmation: true, affectedDomains: ['plots', 'devices', 'workOrders', 'alerts', 'overview'] };
      this.demoAgentActions.set(actionId, { ...proposal, message, plotId });
      return { traceId, conversationId: conversationId || `conversation-${this._demoActorId()}`, plotId, mode: 'rules-agent', intent: 'AGENT_ACTION', summary: proposal.summary, narrative: '我已整理好操作内容，请核对预览后确认执行。', actionProposal: proposal, tools: [], confidence: 1 };
    }

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

  async evaluateDiagnosis(plotId, input = {}) {
    if (!plotId) {
      throw new ApiError('请选择要诊断的地块', { status: 400, code: 'PLOT_CONTEXT_REQUIRED' });
    }
    const body = { ...input, plotId };
    if (body.scenarioId === 'live') delete body.scenarioId;
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/diagnoses/evaluate', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const diagnosis = resp?.data || resp;
      if (!diagnosis?.diagnosisId) throw new ApiError('诊断响应缺少 diagnosisId', { code: 'DIAGNOSIS_INVALID', payload: resp });
      this.decisionCache.diagnoses.set(diagnosis.diagnosisId, diagnosis);
      return diagnosis;
    }

    const plot = this.mockPlot(plotId);
    const scenario = String(input.scenarioId || 'normal').toLowerCase();
    const sourceMode = 'SIMULATED';
    const moisture = scenario === 'drought' ? 12.4 : Number(plot?.metrics?.SOIL_MOISTURE?.value ?? 22);
    const deviceStatus = scenario === 'device-offline' ? 'OFFLINE' : (plot?.deviceStatus || 'ONLINE');
    const drift = scenario === 'sensor-drift';
    const waterScore = moisture < 20 ? Math.min(.96, .68 + (20 - moisture) * .035) : .18;
    const candidates = [
      { code: 'WATER_DEFICIT', confidence: Number(waterScore.toFixed(2)) },
      { code: 'SENSOR_DRIFT', confidence: drift ? .92 : .08 },
      { code: 'DEVICE_FAULT', confidence: deviceStatus === 'OFFLINE' ? .9 : .05 }
    ].sort((a, b) => b.confidence - a.confidence);
    const primary = candidates[0].confidence >= .55 ? candidates[0].code : 'INSUFFICIENT_EVIDENCE';
    const supportingEvidence = [
      { type: 'telemetry', metric: 'SOIL_MOISTURE', value: moisture, unit: '%', source: `demo-${plotId}-soil`, provenance: sourceMode },
      { type: 'device', status: deviceStatus, source: plot?.deviceId || `mock-${plotId}`, provenance: sourceMode },
      { type: 'quality', status: drift ? 'BAD' : 'GOOD', confidence: drift ? .42 : .98, provenance: 'DERIVED' }
    ];
    const opposingEvidence = [];
    if (!drift) opposingEvidence.push({ type: 'quality', reason: '连续性与突变检测未发现明显漂移', provenance: 'DERIVED' });
    if (deviceStatus !== 'OFFLINE') opposingEvidence.push({ type: 'device', reason: '设备心跳正常，设备故障可能性较低', provenance: sourceMode });
    const missingInformation = drift
      ? ['FLOW_RATE_CALIBRATION', 'PORTABLE_METER_COMPARISON']
      : deviceStatus === 'OFFLINE'
        ? ['FRESH_TELEMETRY', 'DEVICE_HEALTH']
        : primary === 'INSUFFICIENT_EVIDENCE' ? ['MORE_TELEMETRY_HISTORY'] : [];
    const diagnosis = {
      diagnosisId: `diag-demo-${Date.now()}`,
      plotId,
      riskType: primary,
      primaryCause: primary,
      confidence: primary === 'INSUFFICIENT_EVIDENCE' ? .24 : candidates[0].confidence,
      candidateCauses: candidates,
      supportingEvidence,
      opposingEvidence,
      missingInformation,
      scenarioId: scenario,
      traceId: input.traceId,
      ruleVersion: 'rule-1.0.0',
      cropPackVersion: '1.0.0',
      evaluatedAt: new Date().toISOString()
    };
    this.decisionCache.diagnoses.set(diagnosis.diagnosisId, diagnosis);
    return diagnosis;
  }

  /**
   * Ask the backend (or the demo rules adapter) to explain an existing,
   * deterministic diagnosis.  The diagnosis fields remain the source of truth;
   * this method only enriches the cached record with a readable explanation.
   */
  async explainDiagnosis(diagnosisId, plotId, options = {}) {
    if (!diagnosisId || !plotId) {
      throw new ApiError('生成诊断解释前必须明确诊断和地块', { status: 400, code: 'DIAGNOSIS_CONTEXT_REQUIRED' });
    }
    const force = options?.force === true;
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/diagnoses/${encodeURIComponent(diagnosisId)}/explain`, {
        method: 'POST',
        body: JSON.stringify({ plotId, force })
      });
      const diagnosis = resp?.data || resp;
      if (!diagnosis?.diagnosisId || !diagnosis?.aiExplanation?.text) {
        throw new ApiError('诊断解释响应不完整', { code: 'DIAGNOSIS_EXPLANATION_INVALID', payload: resp });
      }
      this.decisionCache.diagnoses.set(diagnosis.diagnosisId, diagnosis);
      return diagnosis;
    }

    const diagnosis = this.decisionCache.diagnoses.get(diagnosisId);
    if (!diagnosis) throw new ApiError('找不到待解释的演示诊断', { status: 404, code: 'DIAGNOSIS_NOT_FOUND' });
    if (!force && diagnosis.aiExplanation?.text) return diagnosis;
    const labels = {
      WATER_DEFICIT: '地块缺水',
      SENSOR_DRIFT: '传感器读数可疑',
      DEVICE_FAULT: '采集设备异常',
      HEAT_STRESS: '高温胁迫',
      INSUFFICIENT_EVIDENCE: '证据不足'
    };
    const cause = String(diagnosis.primaryCause || 'INSUFFICIENT_EVIDENCE').toUpperCase();
    const confidence = Math.round(Number(diagnosis.confidence || 0) * 100);
    const supporting = (diagnosis.supportingEvidence || []).slice(0, 2).map((item) => {
      if (item.type === 'telemetry') return `${item.metric || '指标'} ${item.value ?? '—'}${item.unit || ''}`;
      if (item.type === 'quality') return `数据质量 ${item.status || '未知'}`;
      if (item.type === 'device') return `设备状态 ${item.status || '未知'}`;
      return item.reason || item.message || '现场证据';
    });
    const missing = (diagnosis.missingInformation || []).slice(0, 2).join('、');
    const next = cause === 'SENSOR_DRIFT'
      ? '先用便携仪复测并检查探头、供电和流量计。'
      : cause === 'DEVICE_FAULT'
        ? '先检查设备供电、网关连接和最后心跳。'
        : cause === 'WATER_DEFICIT'
          ? '连续复测根区土壤湿度，确认缺水持续后再查看补水试算。'
          : '补充连续遥测和现场观察，再决定是否进入处方试算。';
    const text = [
      `结论：当前规则诊断更偏向 ${labels[cause] || labels.INSUFFICIENT_EVIDENCE}（置信度约 ${confidence}%，演示规则）。`,
      supporting.length ? `依据：${supporting.join('；')}` : '',
      missing ? `还缺：${missing}` : '',
      `下一步：${next}`,
      '规则引擎负责主因、置信度和安全门；这段 AI 只解释证据，不会生成或执行控制命令。'
    ].filter(Boolean).join('\n');
    const explained = {
      ...diagnosis,
      aiExplanation: {
        text,
        sourceLabel: '演示规则解释',
        adapter: 'mock',
        degraded: true,
        degradationReason: 'DEMO_RULES_CONFIGURED',
        provenance: 'DERIVED',
        version: 'diagnosis-explainer-1.0',
        cropPackVersion: diagnosis.cropPackVersion || '1.0.0',
        ruleVersion: diagnosis.ruleVersion || 'rule-1.0.0',
        knowledgeVersion: 'kb-1.0.0',
        agentVersion: 'diagnosis-explainer-1.0',
        generatedAt: new Date().toISOString(),
        traceId: `run-demo-${Date.now()}`
      }
    };
    this.decisionCache.diagnoses.set(diagnosisId, explained);
    return explained;
  }

  async estimateIrrigation(input = {}) {
    if (!input.plotId) {
      throw new ApiError('生成灌溉建议前必须明确地块', { status: 400, code: 'PLOT_CONTEXT_REQUIRED' });
    }
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/irrigation/estimate', {
        method: 'POST',
        body: JSON.stringify(input)
      });
      const plan = resp?.data || resp;
      if (!plan?.planId) throw new ApiError('处方响应缺少 planId', { code: 'IRRIGATION_PLAN_INVALID', payload: resp });
      this.decisionCache.plans.set(plan.planId, plan);
      return plan;
    }

    const plotId = input.plotId;
    const plot = this.mockPlot(plotId);
    const diagnosis = this.decisionCache.diagnoses.get(input.diagnosisId)
      || await this.evaluateDiagnosis(plotId, input);
    const primary = String(diagnosis.primaryCause || 'INSUFFICIENT_EVIDENCE');
    const hardBlock = ['SENSOR_DRIFT', 'DEVICE_FAULT'].includes(primary) && Number(diagnosis.confidence || 0) >= .6;
    const reviewOnly = primary === 'INSUFFICIENT_EVIDENCE';
    const canControl = roleCan(this.user, 'irrigation:approve');
    const simulatedMoisture = String(input.scenarioId || '').toLowerCase() === 'drought' ? 12.4 : null;
    const current = simulatedMoisture ?? Number(plot?.metrics?.SOIL_MOISTURE?.value ?? 22);
    const target = 30;
    const area = Number(plot?.areaM2 || 80);
    const flow = 18;
    const rawWater = Math.max(0, (target - current) * area * .08);
    const durationSeconds = Math.min(900, Math.max(0, Math.round(rawWater / flow * 60)));
    const waterLitre = Number((durationSeconds / 60 * flow).toFixed(1));
    const noAction = durationSeconds <= 0 && current >= target;
    const readinessStatus = hardBlock ? (primary === 'DEVICE_FAULT' ? 'UNAVAILABLE' : 'NEEDS_EVIDENCE')
      : reviewOnly || !canControl ? 'HUMAN_REVIEW' : 'READY';
    const executable = readinessStatus === 'READY' && durationSeconds > 0;
    const now = Date.now();
    const plan = {
      planId: `plan-demo-${now}`,
      plotId,
      diagnosisId: diagnosis.diagnosisId,
      traceId: input.traceId,
      cropPackVersion: '1.0.0',
      ruleVersion: 'rule-1.0.0',
      knowledgeVersion: 'kb-1.0.0',
      agentVersion: 'rules-agent-1.0',
      what: 'IRRIGATION',
      where: plotId,
      when: { start: new Date(now + 5 * 60000).toISOString(), end: new Date(now + 35 * 60000).toISOString() },
      recommendedWindow: { start: new Date(now + 5 * 60000).toISOString(), end: new Date(now + 35 * 60000).toISOString() },
      howMuch: { durationSeconds, waterLitre },
      durationSeconds,
      waterLitre,
      expectedResult: { metric: 'SOIL_MOISTURE', from: current, to: target },
      why: hardBlock ? '诊断或设备硬门未通过，先补证再决定是否灌溉' : reviewOnly ? '当前证据不足，仅提供人工复核参考' : noAction ? '当前湿度已达到阶段目标' : '土壤湿度低于当前作物阶段目标',
      alternatives: hardBlock ? ['便携仪比对复测', '检查设备心跳与流量计'] : ['延后 20 分钟复测', '分两段执行并观察湿度响应'],
      evidence: diagnosis.supportingEvidence,
      readinessId: `ready-demo-${now}`,
      readinessStatus,
      requiresApproval: true,
      advisoryOnly: !executable,
      executable,
      status: hardBlock ? 'BLOCKED' : noAction ? 'NO_ACTION' : reviewOnly || !canControl ? 'HUMAN_REVIEW' : 'PROPOSED',
      createdAt: new Date(now).toISOString()
    };
    this.decisionCache.plans.set(plan.planId, plan);
    return plan;
  }

  async getDecisionReadiness(subjectType, subjectId, context = {}) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/decisions/${encodeURIComponent(subjectType)}/${encodeURIComponent(subjectId)}/readiness`);
      const readiness = resp?.data || resp;
      if (!readiness?.readinessId) throw new ApiError('就绪度响应缺少 readinessId', { code: 'READINESS_INVALID', payload: resp });
      this.decisionCache.readiness.set(readiness.readinessId, readiness);
      return readiness;
    }

    const plan = context.plan || this.decisionCache.plans.get(subjectId) || {};
    const diagnosis = context.diagnosis || this.decisionCache.diagnoses.get(plan.diagnosisId) || {};
    const plot = this.mockPlot(context.plotId || plan.plotId || subjectId);
    const status = plan.readinessStatus || 'HUMAN_REVIEW';
    const drift = diagnosis.primaryCause === 'SENSOR_DRIFT';
    const deviceOffline = diagnosis.primaryCause === 'DEVICE_FAULT' || plot.deviceStatus === 'OFFLINE';
    const canControl = roleCan(this.user, 'irrigation:approve');
    const hardGates = {
      requiredMetrics: 'PASS',
      freshness: deviceOffline ? 'FAIL' : 'PASS',
      dataQuality: drift ? 'FAIL' : 'PASS',
      deviceHealth: deviceOffline ? 'FAIL' : 'PASS',
      diagnosisSafety: drift || deviceOffline ? 'FAIL' : diagnosis.primaryCause === 'INSUFFICIENT_EVIDENCE' ? 'REVIEW' : 'PASS',
      resourceCapacity: 'PASS',
      permission: canControl ? 'PASS' : 'REVIEW',
      safetyLimit: Number(plan.durationSeconds || 0) <= 900 ? 'PASS' : 'FAIL'
    };
    const missingEvidence = [
      ...(diagnosis.missingInformation || []),
      ...(canControl ? [] : ['CONTROL_PERMISSION'])
    ].filter((item, index, all) => all.indexOf(item) === index);
    const readiness = {
      readinessId: plan.readinessId || `ready-demo-${Date.now()}`,
      subject: { type: subjectType, id: subjectId },
      plotId: plan.plotId || context.plotId || subjectId,
      status,
      score: Number((Object.values(hardGates).reduce((sum, value) => sum + (value === 'PASS' ? 1 : value === 'REVIEW' ? .5 : 0), 0) / Object.keys(hardGates).length).toFixed(2)),
      hardGates,
      missingEvidence,
      conflicts: drift ? ['QUALITY_VS_MOISTURE_CONFLICT'] : [],
      requiredActions: missingEvidence.map(item => ({
        type: item === 'CONTROL_PERMISSION' ? 'REQUEST_APPROVAL' : 'CREATE_INSPECTION',
        action: item.includes('FLOW') ? 'CHECK_FLOW_METER' : item.includes('DEVICE') ? 'CHECK_DEVICE' : item === 'CONTROL_PERMISSION' ? 'REQUEST_APPROVAL' : 'REMEASURE',
        priority: 'HIGH'
      })),
      policyVersion: 'readiness-v1',
      evaluatedAt: new Date().toISOString()
    };
    this.decisionCache.readiness.set(readiness.readinessId, readiness);
    return readiness;
  }

  async createDecisionEvidenceRequest(readinessId, input = {}) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/decision-readiness/${encodeURIComponent(readinessId)}/evidence-requests`, {
        method: 'POST',
        body: JSON.stringify(input)
      });
      return resp?.data || resp;
    }
    return {
      ...input,
      workOrderId: `wo-evidence-${Date.now()}`,
      sourceType: 'READINESS',
      sourceRef: readinessId,
      actionType: input.actionType || 'INSPECTION',
      status: 'OPEN',
      priority: input.priority || 'HIGH',
      provenance: 'SIMULATED',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Persist a farmer decision outcome without changing a strategy or issuing
   * a control command.  Farmers use this contract to request administrator
   * approval and to record the result of an inspection/task; direct
   * irrigation execution remains guarded by irrigation:approve.
   */
  async submitDecisionFeedback(traceId, input = {}) {
    if (!traceId) {
      throw new ApiError('提交建议反馈前必须明确决策记录', { status: 400, code: 'TRACE_CONTEXT_REQUIRED' });
    }
    const payload = { ...input, traceId };
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/decisions/${encodeURIComponent(traceId)}/feedback`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return resp?.data || resp;
    }
    const feedback = {
      feedbackId: `feedback-demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
      actorId: this._demoActorId(),
      decision: payload.decision || 'ACCEPTED',
      provenance: 'SIMULATED',
      createdAt: new Date().toISOString()
    };
    this.decisionCache.feedback ||= new Map();
    this.decisionCache.feedback.set(feedback.feedbackId, feedback);
    return feedback;
  }

  async getSimilarCases(traceId, params = {}) {
    if (!traceId) {
      throw new ApiError('缺少决策 traceId', { status: 400, code: 'TRACE_ID_REQUIRED' });
    }
    if (this.sessionMode === 'live') {
      const query = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''))
      ).toString();
      const suffix = query ? `?${query}` : '';
      const resp = await this._fetch(`/api/v1/decisions/${encodeURIComponent(traceId)}/similar-cases${suffix}`);
      const data = resp?.data ?? resp;
      return Array.isArray(data) ? data : (data?.cases || []);
    }
    return [];
  }

  async getDecisionPassport(traceId) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/decision-passports/${encodeURIComponent(traceId)}`);
      return resp?.data || resp;
    }
    const diagnoses = [...this.decisionCache.diagnoses.values()].filter(item => item.traceId === traceId);
    const plans = [...this.decisionCache.plans.values()].filter(item => item.traceId === traceId);
    const planIds = new Set(plans.map(item => item.planId));
    const commands = [...this.decisionCache.commands.values()].filter(item => planIds.has(item.planId));
    const evaluations = [...this.decisionCache.evaluations.values()].filter(item => commands.some(command => command.commandId === item.commandId));
    return {
      traceId,
      observations: diagnoses[0]?.supportingEvidence || [],
      diagnoses,
      readiness: [...this.decisionCache.readiness.values()].filter(item => item.plotId === plans[0]?.plotId),
      plans,
      commands,
      evaluations,
      provenance: ['OBSERVED', 'USER_PROVIDED', 'DERIVED', 'SIMULATED', 'ESTIMATED'],
      generatedAt: new Date().toISOString()
    };
  }

  async executeIrrigation(planId, plotId, options = {}) {
    if (!plotId) {
      throw new ApiError('执行灌溉前必须明确地块', { status: 400, code: 'PLOT_CONTEXT_REQUIRED' });
    }
    if (!roleCan(this.user, 'irrigation:approve')) {
      throw new ApiError('当前身份没有灌溉执行权限', { status: 403, code: 'CONTROL_FORBIDDEN' });
    }
    if (options.approved !== true) {
      throw new ApiError('虚拟灌溉必须经过当前操作人明确确认', { status: 409, code: 'APPROVAL_REQUIRED' });
    }
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/commands/virtual', {
        method: 'POST',
        body: JSON.stringify({
          planId,
          plotId,
          idempotencyKey: options.idempotencyKey || 'cmd-key-' + Date.now(),
          approved: true,
          source: options.source || 'web-decision-console',
          ...(options.outcome ? { outcome: options.outcome } : {})
        })
      });
      if (resp && resp.data) {
        const command = { ...resp.data, executionMode: 'SIMULATED', provenance: resp.data.provenance || 'SIMULATED' };
        this.decisionCache.commands.set(command.commandId, command);
        return command;
      }
      throw new ApiError('后端返回了无效的执行结果', { code: 'COMMAND_RESPONSE_INVALID', payload: resp });
    }

    const plan = this.decisionCache.plans.get(planId);
    if (!plan || plan.plotId !== plotId) {
      throw new ApiError('未找到当前地块对应的可执行处方', { status: 409, code: 'IRRIGATION_PLAN_CONTEXT_MISMATCH' });
    }
    if (plan.executable !== true || plan.readinessStatus !== 'READY' || options.approved === false) {
      throw new ApiError('处方未通过安全门或尚未人工确认', { status: 409, code: 'IRRIGATION_NOT_READY' });
    }

    // 演示模式只创建虚拟命令；剂量来自当前处方，不使用固定演示数字。
    const requestedOutcome = String(options.outcome || 'SUCCEEDED').toUpperCase();
    const outcome = ['SUCCEEDED', 'PARTIAL', 'FAILED', 'TIMEOUT'].includes(requestedOutcome) ? requestedOutcome : 'FAILED';
    const plannedWater = Number(plan.waterLitre || plan.howMuch?.waterLitre || 0);
    const plannedDuration = Number(plan.durationSeconds || plan.howMuch?.durationSeconds || 0);
    const actualWater = outcome === 'SUCCEEDED' ? plannedWater : outcome === 'PARTIAL' ? Number((plannedWater * .55).toFixed(1)) : 0;
    const effectScore = outcome === 'SUCCEEDED' ? .96 : outcome === 'PARTIAL' ? .52 : 0;
    const evaluationStatus = ['SUCCEEDED', 'PARTIAL'].includes(outcome) ? 'COMPLETED' : outcome;
    const command = {
      commandId: "cmd-" + Math.random().toString(36).substring(2, 9),
      plotId,
      planId,
      traceId: plan.traceId,
      status: outcome,
      type: "IRRIGATION_START",
      waterLitre: plannedWater,
      durationSeconds: plannedDuration,
      transport: "MQTT_VIRTUAL_ACTUATOR",
      executionMode: 'SIMULATED',
      provenance: 'SIMULATED',
      ack: {
        ackId: "ack-" + Math.random().toString(36).substring(2, 8),
        status: outcome,
        actualWaterLitre: actualWater,
        result: outcome === 'SUCCEEDED' ? 'GOOD' : outcome,
        provenance: 'SIMULATED',
        receivedAt: new Date().toISOString()
      },
      evaluation: {
        effectivenessScore: effectScore,
        status: evaluationStatus,
        result: outcome === 'SUCCEEDED' ? 'GOOD' : outcome,
        expectedMoisture: `${Number(plan.expectedResult?.to ?? 30).toFixed(1)}%`,
        actualMoisture: outcome === 'SUCCEEDED'
          ? `${Number((Number(plan.expectedResult?.to ?? 30) - .2).toFixed(1))}%`
          : outcome === 'PARTIAL' ? `${Number((Number(plan.expectedResult?.from ?? 20) + 3).toFixed(1))}%` : '未改善',
        provenance: 'SIMULATED'
      }
    };
    this.decisionCache.commands.set(command.commandId, command);
    this.decisionCache.evaluations.set(command.commandId, { ...command.evaluation, commandId: command.commandId, planId });
    return command;
  }

  async getCommand(commandId) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/commands/${encodeURIComponent(commandId)}`);
      const command = resp?.data || resp;
      this.decisionCache.commands.set(commandId, command);
      return command;
    }
    return this.decisionCache.commands.get(commandId) || null;
  }

  async getCommandEvaluation(commandId) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/commands/${encodeURIComponent(commandId)}/evaluation`);
      const evaluation = resp?.data || resp;
      this.decisionCache.evaluations.set(commandId, evaluation);
      return evaluation;
    }
    return this.decisionCache.evaluations.get(commandId) || null;
  }

  /**
   * yyx P1/P2 视图所需的确定性能力。在线优先读取后端合同，离线使用
   * 同一套可重复的演示算法；所有返回值都标记为模拟/推导口径，不伪装成现场实测。
   */
  async getRiskForecast(plotId = 'plot-a01', metric = 'SOIL_MOISTURE') {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/risk-forecast?metric=${encodeURIComponent(metric)}`);
      return this.normalizeForecast(resp?.data || resp, plotId, metric);
    }
    return this.mockRiskForecast(plotId, metric);
  }

  normalizeForecast(raw, plotId, metric) {
    const live = this.sessionMode === 'live';
    const cfg = live ? {} : MOCK_DATA.riskForecastConfig;
    const plot = live ? null : (MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0]);
    const source = raw || {};
    const toFinite = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };
    const boundary = toFinite(source.stressBoundary ?? source.riskBoundary?.value ?? cfg.stressBoundary);
    const baseline = toFinite(source.baselineMoisture ?? cfg.baselineMoisture);
    const horizons = (source.horizons || []).map(h => ({
      minute: Number(h.minute ?? h.minutes ?? 0),
      expected: toFinite(h.expected ?? h.value ?? h.expectedMoisture),
      lower: toFinite(h.lower ?? h.expected ?? h.value),
      upper: toFinite(h.upper ?? h.expected ?? h.value)
    })).filter(h => Number.isFinite(h.minute));
    const start = toFinite(source.startValue ?? source.startMoisture ?? source.currentMoisture ?? horizons[0]?.expected ?? plot?.metrics?.[metric]?.value);
    const maxHorizon = toFinite(source.forecastRangeMinutes ?? cfg.maxHorizonMinutes) || (horizons.at(-1)?.minute || null);
    const curve = Array.isArray(source.curve) && source.curve.length
      ? source.curve.map(p => ({ minute: Number(p.minute), expected: toFinite(p.expected ?? p.value), lower: toFinite(p.lower ?? p.expected ?? p.value), upper: toFinite(p.upper ?? p.expected ?? p.value) }))
      : (live ? horizons : this.interpolateForecastCurve(start, horizons, maxHorizon || 240));
    const unavailable = String(source.status || '').toUpperCase() !== 'AVAILABLE';
    return {
      ...source,
      status: unavailable ? (source.status || 'UNAVAILABLE') : 'AVAILABLE',
      plotId, metric,
      generatedAt: source.generatedAt || source.issuedAt || new Date().toISOString(),
      inputWindowMinutes: toFinite(source.inputWindowMinutes ?? source.inputWindow?.minutes ?? source.inputWindow?.validSamples ?? cfg.inputWindowMinutes),
      forecastRangeMinutes: maxHorizon,
      algorithmVersion: source.algorithmVersion || (live ? '后端风险模型' : cfg.algorithmVersion),
      algorithmLabel: source.algorithmLabel || (live ? '后端风险模型' : cfg.algorithmLabel),
      startMoisture: start,
      stressBoundary: boundary,
      baselineMoisture: baseline,
      timeToRiskMinutes: source.timeToRiskMinutes == null ? null : toFinite(source.timeToRiskMinutes),
      horizons,
      curve,
      assumptions: source.assumptions || (live ? [] : ['无降水 / 无外界灌溉', '设备保持在线，遥测质量 GOOD']),
      uncertaintyNote: source.uncertaintyNote || (live ? '后端未提供不确定性说明' : '置信区间由历史残差 MAD 推导；样本不足时返回 UNAVAILABLE'),
      dataOrigin: live ? 'BACKEND' : 'SIMULATED'
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
    const code = String(metric || 'SOIL_MOISTURE').toUpperCase();
    const profile = telemetryMetricProfile(code);
    const currentRecord = plot?.metrics?.[code] || {};
    const currentValue = Number(currentRecord.value);
    const start = Number.isFinite(currentValue) ? currentValue : profile.defaultValue;
    const strategy = this.demoSimulationStrategies.get(plotId);
    const scenario = String(strategy?.scenario || 'NORMAL').toUpperCase();
    const params = strategy?.parameters || PLOT_SIMULATION_DEFAULTS.NORMAL;
    const driftRate = scenario === 'SENSOR_DRIFT' ? Number(params.driftRatePerHour || 0) : 0;
    const boundary = code === 'SOIL_MOISTURE' ? Number(params.riskThreshold ?? cfg.stressBoundary) : null;
    if (plot?.deviceStatus !== 'ONLINE' || scenario === 'DEVICE_OFFLINE') {
      return { status: 'UNAVAILABLE', plotId, metric: code, reason: scenario === 'DEVICE_OFFLINE' ? '设备断连，保留最后一条读数，拒绝生成可执行预测' : '设备离线，遥测样本不足', generatedAt: new Date().toISOString(), algorithmVersion: cfg.algorithmVersion };
    }
    const horizonMinutes = Math.max(60, Math.min(720, Math.round(Number(params.forecastHours || 4) * 60)));
    const trend = {
      SOIL_MOISTURE: Number(params.soilMoistureTrendPerHour || 0) + (scenario === 'HEAVY_RAIN' ? Number(params.rainfallRate || 0) * .04 : 0) + driftRate,
      AIR_TEMPERATURE: Number(params.temperatureBias || 0) * .75,
      AIR_HUMIDITY: Number(params.humidityBias || 0) * .65,
      LIGHT: scenario === 'DROUGHT' ? 900 : scenario === 'HEAVY_RAIN' ? -650 : 0,
      CO2: scenario === 'HEAVY_RAIN' ? -22 : scenario === 'DROUGHT' ? 16 : 0,
      PH: scenario === 'SENSOR_DRIFT' ? Number(params.driftRatePerHour || 0) * .035 : 0,
      WATER_LEVEL: scenario === 'HEAVY_RAIN' ? Number(params.rainfallRate || 0) * .035 : scenario === 'DROUGHT' ? -1.2 : 0,
      RAINFALL: 0
    }[code] || 0;
    const waveAmplitude = { SOIL_MOISTURE: .7, AIR_TEMPERATURE: .28, AIR_HUMIDITY: .85, LIGHT: 850, CO2: 14, PH: .035, WATER_LEVEL: .65, RAINFALL: .7 }[code] || .5;
    const identity = `${plotId}:${code}:${scenario}`;
    let hash = 0;
    for (let index = 0; index < identity.length; index += 1) hash = (hash * 31 + identity.charCodeAt(index)) >>> 0;
    const phase = (hash % 628) / 100;
    const initialWave = Math.sin(phase);
    const rainfallRate = Math.max(0, Number(params.rainfallRate || 0));
    const initialRainWave = .72 + .28 * Math.max(0, Math.sin(1.2));
    const volatility = Math.max(.2, Number(params.volatility || 1.25));
    const curve = [];
    for (let t = 0; t <= horizonMinutes; t += 5) {
      const hours = t / 60;
      const wave = (Math.sin(t / 5 / 2.7 + phase) - initialWave) * waveAmplitude * volatility;
      const rainWave = code === 'RAINFALL'
        ? rainfallRate * ((.72 + .28 * Math.max(0, Math.sin(hours * 3.1 + 1.2))) - initialRainWave)
        : 0;
      const expected = Math.max(profile.min, Math.min(profile.max, start + trend * hours + rainWave + wave));
      const spread = Math.max(code === 'PH' ? .03 : code === 'LIGHT' ? 120 : .45, t / 240 * volatility + (code === 'LIGHT' ? 120 : 0));
      curve.push({ minute: t, expected: Number(expected.toFixed(profile.decimals)), lower: Number(Math.max(profile.min, expected - spread).toFixed(profile.decimals)), upper: Number(Math.min(profile.max, expected + spread).toFixed(profile.decimals)) });
    }
    let timeToRisk = null;
    if (code === 'SOIL_MOISTURE' && Number.isFinite(boundary)) {
      const riskPoint = curve.find((point) => point.expected <= boundary);
      timeToRisk = riskPoint?.minute ?? null;
    }
    return {
      status: 'AVAILABLE', plotId, metric: code, generatedAt: new Date().toISOString(), inputWindowMinutes: cfg.inputWindowMinutes,
      forecastRangeMinutes: horizonMinutes, algorithmVersion: cfg.algorithmVersion, algorithmLabel: cfg.algorithmLabel,
      startMoisture: start, startValue: start, stressBoundary: boundary, baselineMoisture: cfg.baselineMoisture, timeToRiskMinutes: timeToRisk,
      horizons: [60, 120, 240].filter(minute => minute <= horizonMinutes).map(minute => { const p = curve.find(x => x.minute === minute); return { minute, expected: p.expected, lower: p.lower, upper: p.upper, band: `${p.lower.toFixed(profile.decimals)}${profile.unit} ~ ${p.upper.toFixed(profile.decimals)}${profile.unit}` }; }),
      curve, assumptions: ['无外界灌溉', `PLOT_STRATEGY=${scenario}`, '设备保持在线，遥测质量 GOOD'],
      uncertaintyNote: '置信区间随预测时距线性放大；超出 4h 不承诺，样本不足返回 UNAVAILABLE', provenance: 'SIMULATED'
    };
  }

  async runScenario({ scenario = 'DROUGHT', seed = 42, plotId = 'plot-a01', parameters = {} } = {}) {
    const normalizedScenario = normalizePlotSimulationScenario(scenario);
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/scenarios/runs', { method: 'POST', body: JSON.stringify({ scenario: normalizedScenario, seed, plotId, parameters }) });
      const run = resp?.data || resp;
      return { ...run, scenario: run.scenario || normalizedScenario, scenarioLabel: run.scenarioLabel || normalizedScenario, plotId, dataOrigin: 'BACKEND' };
    }
    const def = PLOT_SIMULATION_SCENARIOS.find((item) => item.code === normalizedScenario) || PLOT_SIMULATION_SCENARIOS[0];
    const plot = this.mockPlot(plotId);
    if (normalizedScenario === 'DEVICE_OFFLINE') {
      return {
        scenarioId: `device-offline-${seed}`,
        scenario: normalizedScenario,
        scenarioLabel: def.label,
        seed,
        status: 'UNAVAILABLE',
        runStatus: 'UNAVAILABLE',
        reason: '设备断连，保留最后一条读数，拒绝生成可执行预测',
        curve: [],
        horizons: [],
        frozenSnapshot: { plotId, plotName: plot.name, capturedAt: new Date().toISOString(), snapshotLabel: '冻结快照（只读，不写回主状态）' },
        params: def,
        provenance: 'SIMULATED'
      };
    }
    const start = Number(plot.metrics.SOIL_MOISTURE.value || 35);
    const curve = Array.from({ length: 49 }, (_, index) => {
      const minute = index * 5;
      const p = cloneSimulationParameters(normalizedScenario, parameters);
      const trend = Number(p.soilMoistureTrendPerHour || 0);
      const rain = Number(p.rainfallRate || 0) * .04;
      const drift = normalizedScenario === 'SENSOR_DRIFT' ? Number(p.driftRatePerHour || 0) : 0;
      const expected = Math.max(0, Math.min(100, start + (trend + rain + drift) * minute / 60 + Math.sin(index / 2.7 + seed) * Number(p.volatility || 1)));
      const spread = .6 + index * .04;
      return { minute, expected: Number(expected.toFixed(2)), lower: Number(Math.max(0, expected - spread).toFixed(2)), upper: Number(Math.min(100, expected + spread).toFixed(2)) };
    });
    return { scenarioId: `${normalizedScenario.toLowerCase()}-${seed}`, scenario: normalizedScenario, scenarioLabel: def.label, seed, runStatus: 'COMPLETED', curve, horizons: curve.filter((item) => [60, 120, 240].includes(item.minute)), frozenSnapshot: { plotId, plotName: plot.name, startMoisture: start, capturedAt: new Date().toISOString(), snapshotLabel: '冻结快照（只读，不写回主状态）' }, params: def, provenance: 'SIMULATED' };
  }

  async compareScenario({ scenario = 'DROUGHT', seed = 42, plotId = 'plot-a01', scenarioId = '' } = {}) {
    const normalizedScenario = normalizePlotSimulationScenario(scenario);
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/scenarios/compare', { method: 'POST', body: JSON.stringify({ scenarioId: scenarioId || `${normalizedScenario.toLowerCase()}-${seed}`, seed, plotId, leftBranch: 'EXECUTE', rightBranch: 'NO_ACTION' }) });
      const server = resp?.data || resp;
      return { ...(server || {}), scenario: normalizedScenario, seed, plotId, dataOrigin: 'BACKEND', provenance: 'BACKEND' };
    }
    return this.mockScenarioCompare(normalizedScenario === 'HEAVY_RAIN' ? 'STORM' : normalizedScenario, seed, plotId);
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

  async getDevices(filters = {}) {
    const farmId = filters?.farmId || '';
    if (!farmId) throw new ApiError('请先选择农场', { status: 400, code: 'FARM_CONTEXT_REQUIRED' });
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/devices?farmId=${encodeURIComponent(farmId)}`);
      if (Array.isArray(resp?.data)) return resp.data;
      throw new ApiError('后端返回了无效的设备数据', { code: 'DEVICES_INVALID', payload: resp });
    }
    return Array.from(this.demoDevices.values()).filter(device => device.farmId === farmId).map(device => ({ ...device }));
  }

  async registerDevice(input = {}) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/devices', { method: 'POST', body: JSON.stringify(input) });
      if (resp?.data?.deviceId) return resp.data;
      throw new ApiError('后端返回了无效的设备注册结果', { code: 'DEVICE_REGISTER_INVALID', payload: resp });
    }
    const deviceId = input.deviceId || `device-demo-${Date.now().toString(36)}`;
    if (this.demoDevices.has(deviceId)) throw new ApiError('设备编号已存在', { status: 409, code: 'DEVICE_EXISTS' });
    const requestedSourceMode = String(input.sourceMode || 'SIMULATION').toUpperCase();
    if (!['SIMULATION', 'SIMULATED', 'REAL'].includes(requestedSourceMode)) throw new ApiError('设备接入方式只能是模拟设备或真实设备', { status: 400, code: 'DEVICE_SOURCE_INVALID' });
    const sourceMode = requestedSourceMode === 'REAL' ? 'REAL' : 'SIMULATION';
    const device = { ...input, farmId: input.farmId || 'farm-demo', deviceId, plotId: null, status: 'OFFLINE', desiredStatus: 'OFFLINE', controlStatus: 'SUCCEEDED', bindingState: 'UNBOUND', lastSeen: null, healthScore: null, registeredAt: new Date().toISOString(), sourceMode, dataOrigin: sourceMode === 'REAL' ? 'HARDWARE' : 'SIMULATOR' };
    this.demoDevices.set(deviceId, device);
    return { ...device };
  }

  async bindDevice(deviceId, plotId) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/devices/${encodeURIComponent(deviceId)}/bind`, { method: 'POST', body: JSON.stringify({ plotId }) });
      if (resp?.data?.deviceId) return resp.data;
      throw new ApiError('后端返回了无效的设备绑定结果', { code: 'DEVICE_BIND_INVALID', payload: resp });
    }
    const device = this.demoDevices.get(deviceId);
    const plot = this.demoPlots.get(plotId);
    if (!device || !plot) throw new ApiError('没有找到设备或地块', { status: 404, code: 'DEVICE_OR_PLOT_NOT_FOUND' });
    if (device.farmId !== plot.farmId) throw new ApiError('设备和地块不属于同一农场', { status: 409, code: 'DEVICE_PLOT_FARM_MISMATCH' });
    if (String(plot.status).toUpperCase() === 'INACTIVE') throw new ApiError('停用地块不能绑定设备', { status: 409, code: 'PLOT_INACTIVE' });
    const saved = { ...device, previousPlotId: device.plotId || undefined, plotId, bindingState: 'BOUND', boundAt: new Date().toISOString(), status: 'OFFLINE', desiredStatus: 'OFFLINE', controlStatus: 'SUCCEEDED' };
    this.demoDevices.set(deviceId, saved);
    return { ...saved };
  }

  async unbindDevice(deviceId) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/devices/${encodeURIComponent(deviceId)}/unbind`, { method: 'POST', body: '{}' });
      if (resp?.data?.deviceId) return resp.data;
      throw new ApiError('后端返回了无效的设备解绑结果', { code: 'DEVICE_UNBIND_INVALID', payload: resp });
    }
    const device = this.demoDevices.get(deviceId);
    if (!device) throw new ApiError('没有找到该设备', { status: 404, code: 'DEVICE_NOT_FOUND' });
    const saved = { ...device, previousPlotId: device.plotId, plotId: null, bindingState: 'UNBOUND', status: 'OFFLINE', desiredStatus: 'OFFLINE', controlStatus: 'SUCCEEDED', unboundAt: new Date().toISOString() };
    this.demoDevices.set(deviceId, saved);
    return { ...saved };
  }

  async controlDevice(deviceId, input = {}) {
    const targetStatus = String(input.targetStatus || '').trim().toUpperCase();
    if (!['ONLINE', 'OFFLINE'].includes(targetStatus)) throw new ApiError('设备目标状态无效', { status: 400, code: 'DEVICE_TARGET_STATUS_INVALID' });
    const idempotencyKey = String(input.idempotencyKey || '').trim();
    if (!idempotencyKey) throw new ApiError('设备控制缺少幂等键', { status: 400, code: 'IDEMPOTENCY_REQUIRED' });
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/devices/${encodeURIComponent(deviceId)}/control`, {
        method: 'POST', body: JSON.stringify({ targetStatus, idempotencyKey })
      });
      if (resp?.data?.commandId) return resp.data;
      throw new ApiError('后端返回了无效的设备控制结果', { code: 'DEVICE_CONTROL_INVALID', payload: resp });
    }
    const device = this.demoDevices.get(deviceId);
    if (!device) throw new ApiError('没有找到该设备', { status: 404, code: 'DEVICE_NOT_FOUND' });
    if (!device.plotId || device.bindingState === 'UNBOUND') throw new ApiError('设备尚未绑定地块，暂不可控制', { status: 409, code: 'DEVICE_CONTROL_UNAVAILABLE' });
    const now = new Date().toISOString();
    const commandId = `device-cmd-${Date.now().toString(36)}`;
    const saved = { ...device, status: targetStatus, desiredStatus: targetStatus, controlStatus: 'SUCCEEDED', lastControlCommandId: commandId, lastControlAt: now };
    delete saved.lastControlError;
    this.demoDevices.set(deviceId, saved);
    return {
      commandId, deviceId, targetStatus, commandStatus: 'SUCCEEDED', status: targetStatus,
      device: { ...saved }, latestDevice: { ...saved }, command: { commandId, deviceId, targetStatus, commandStatus: 'SUCCEEDED' }
    };
  }

  async getCropBatches(filters = {}) {
    const query = new URLSearchParams();
    if (filters?.farmId) query.set('farmId', filters.farmId);
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/crop-batches${query.size ? `?${query}` : ''}`);
      if (Array.isArray(resp?.data)) return resp.data;
      throw new ApiError('后端返回了无效的种植批次数据', { code: 'CROP_BATCHES_INVALID', payload: resp });
    }
    return Array.from(this.demoCropBatches.values()).filter(batch => !filters.farmId || batch.farmId === filters.farmId).map(batch => ({ ...batch }));
  }

  async createCropBatch(input = {}) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/crop-batches', { method: 'POST', body: JSON.stringify(input) });
      if (resp?.data?.batchId) return resp.data;
      throw new ApiError('后端返回了无效的种植批次结果', { code: 'CROP_BATCH_CREATE_INVALID', payload: resp });
    }
    if (!Number(input.plannedCycleDays)) throw new ApiError('请填写计划周期', { status: 422, code: 'PLAN_CYCLE_REQUIRED' });
    const batchId = input.batchId || `batch-demo-${Date.now().toString(36)}`;
    const batch = { ...input, batchId, cropPackVersion: input.cropPackVersion || '1.0.0', status: 'ACTIVE', createdAt: new Date().toISOString(), sourceMode: 'SIMULATED' };
    this.demoCropBatches.set(batchId, batch);
    return { ...batch };
  }

  async getCropBatchPlan(batchId) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/crop-batches/${encodeURIComponent(batchId)}/plan`);
      return resp?.data || resp;
    }
    return { batch: this.demoCropBatches.get(batchId) || null, plan: this.demoCropPlans.get(batchId) || null, tasks: Array.from(this.demoWorkOrders.values()).filter(work => work.cropBatchId === batchId) };
  }

  async generateCropBatchPlan(batchId, input = {}) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/crop-batches/${encodeURIComponent(batchId)}/plan/generate`, { method: 'POST', body: JSON.stringify(input) });
      if (resp?.data?.planId) return resp.data;
      throw new ApiError('后端返回了无效的生产计划预览', { code: 'CROP_PLAN_INVALID', payload: resp });
    }
    const batch = this.demoCropBatches.get(batchId);
    if (!batch) throw new ApiError('没有找到种植批次', { status: 404, code: 'CROP_BATCH_NOT_FOUND' });
    const packs = await this.getCropPacks();
    const pack = packs.find(item => item.cropCode === batch.cropCode && (!batch.cropPackVersion || item.version === batch.cropPackVersion));
    if (!pack) throw new ApiError('没有找到该作物对应的 Crop Pack', { status: 422, code: 'CROP_PACK_NOT_FOUND' });
    const cycleDays = Number(input.plannedCycleDays || batch.plannedCycleDays || 0);
    if (!cycleDays) throw new ApiError('请填写计划周期', { status: 422, code: 'PLAN_CYCLE_REQUIRED' });
    const start = new Date(`${String(input.startDate || batch.plantedAt || new Date().toISOString()).slice(0, 10)}T00:00:00Z`);
    const stages = [...(pack.stages || [])].sort((a, b) => Number(a.sequence || 999) - Number(b.sequence || 999));
    const tasks = [];
    stages.forEach((stage, stageIndex) => {
      const stageStart = new Date(start.getTime() + Math.floor(cycleDays * stageIndex / stages.length) * 86400000);
      const stageEnd = new Date(start.getTime() + Math.floor(cycleDays * (stageIndex + 1) / stages.length) * 86400000);
      (stage.taskTemplates || []).forEach((template, templateIndex) => {
        const interval = Math.max(1, Number(template.intervalDays || 1));
        let occurrence = 0;
        for (let date = new Date(stageStart); date < stageEnd; date = new Date(date.getTime() + interval * 86400000)) {
          const templateRef = `${pack.cropCode}@${pack.version}/${stage.code}/${template.actionType}/${templateIndex}`;
          tasks.push({ taskKey: `${templateRef}/${occurrence++}`, templateRef, stageCode: stage.code, actionType: template.actionType, priority: template.priority || 'MEDIUM', scheduleDate: date.toISOString().slice(0, 10), sourceMode: 'DERIVED', removed: false });
        }
      });
    });
    const plan = { planId: `plan-${batchId}`, batchId, farmId: batch.farmId, plotId: batch.plotId, cropCode: batch.cropCode, cropPackVersion: pack.version, status: 'DRAFT', sourceMode: 'DERIVED', scheduleMethod: 'EVEN_STAGE_SPLIT', plannedCycleDays: cycleDays, tasks, generatedAt: new Date().toISOString() };
    this.demoCropPlans.set(batchId, plan);
    this.demoCropBatches.set(batchId, { ...batch, planId: plan.planId });
    return JSON.parse(JSON.stringify(plan));
  }

  async reviewCropBatchPlan(batchId, input = {}) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/crop-batches/${encodeURIComponent(batchId)}/plan/review`, { method: 'POST', body: JSON.stringify(input) });
      if (resp?.data?.planId) return resp.data;
      throw new ApiError('后端返回了无效的计划审批结果', { code: 'CROP_PLAN_REVIEW_INVALID', payload: resp });
    }
    const plan = this.demoCropPlans.get(batchId);
    if (!plan) throw new ApiError('请先生成生产计划预览', { status: 404, code: 'CROP_PLAN_NOT_FOUND' });
    if (plan.status === 'APPROVED') return JSON.parse(JSON.stringify(plan));
    const decision = String(input.decision || '').toUpperCase();
    if (decision === 'REJECT') {
      if (!String(input.note || '').trim()) throw new ApiError('驳回时请填写原因', { status: 400, code: 'NOTE_REQUIRED' });
      const rejected = { ...plan, status: 'REJECTED', reviewNote: input.note, reviewedAt: new Date().toISOString() };
      this.demoCropPlans.set(batchId, rejected);
      return JSON.parse(JSON.stringify(rejected));
    }
    if (decision !== 'APPROVE') throw new ApiError('请选择审批通过或驳回', { status: 400, code: 'PLAN_DECISION_INVALID' });
    const tasks = Array.isArray(input.tasks) ? input.tasks : plan.tasks;
    const workOrderIds = [];
    for (const task of tasks.filter(item => !item.removed)) {
      const saved = await this.saveWorkOrder({ farmId: plan.farmId, plotId: plan.plotId, title: task.actionType === 'IRRIGATION_CHECK' ? '检查灌溉需要' : '完成阶段巡田检查', reason: '来自已审批生产计划', actionType: task.actionType, priority: task.priority, dueAt: `${task.scheduleDate}T17:00:00Z`, sourceType: 'CROP_PLAN', sourceRef: plan.planId, cropBatchId: batchId, stageCode: task.stageCode, cropPackVersion: plan.cropPackVersion, templateRef: task.templateRef });
      workOrderIds.push(saved.workOrderId);
    }
    const approved = { ...plan, tasks, status: 'APPROVED', workOrderIds, reviewedAt: new Date().toISOString(), idempotencyKey: input.idempotencyKey || plan.planId };
    this.demoCropPlans.set(batchId, approved);
    return JSON.parse(JSON.stringify(approved));
  }

  async getValueLedgers(filters = {}) {
    const farmId = filters?.farmId || '';
    if (!farmId) throw new ApiError('请先选择农场', { status: 400, code: 'FARM_CONTEXT_REQUIRED' });
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/value-ledgers?farmId=${encodeURIComponent(farmId)}`);
      const records = resp?.data || resp;
      if (Array.isArray(records)) return records;
      throw new ApiError('后端返回了无效的价值对账数据', { code: 'VALUE_LEDGERS_INVALID', payload: resp });
    }
    return this.demoValueLedgers.filter(ledger => ledger.farmId === farmId).map(ledger => JSON.parse(JSON.stringify(ledger)));
  }

  async createValueLedger(input = {}) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/value-ledgers', { method: 'POST', body: JSON.stringify(input) });
      if (resp?.data?.valueLedgerId) return resp.data;
      throw new ApiError('后端返回了无效的价值对账结果', { code: 'VALUE_LEDGER_CREATE_INVALID', payload: resp });
    }
    const planned = input.plannedWaterLitres === '' || input.plannedWaterLitres == null ? null : Number(input.plannedWaterLitres);
    const actual = input.actualWaterLitres === '' || input.actualWaterLitres == null ? null : Number(input.actualWaterLitres);
    const price = input.waterPricePerLitre === '' || input.waterPricePerLitre == null ? null : Number(input.waterPricePerLitre);
    const complete = planned > 0 && actual >= 0 && price >= 0;
    const ledger = { valueLedgerId: `value-demo-${Date.now().toString(36)}`, ...input, status: complete ? 'COMPUTED' : 'INCOMPLETE', sourceMode: input.sourceMode || 'USER_PROVIDED', plannedSource: planned == null ? null : 'USER_PROVIDED', actualSource: actual == null ? null : 'USER_PROVIDED', priceSource: price == null ? null : 'USER_PROVIDED', metrics: { plannedWaterLitres: planned, actualWaterLitres: actual, waterDeviationRate: complete ? (actual - planned) / planned : null, waterSavingLitres: complete ? planned - actual : null, waterCost: complete ? actual * price : null }, createdAt: new Date().toISOString(), provenance: 'SIMULATED' };
    this.demoValueLedgers.unshift(ledger);
    return JSON.parse(JSON.stringify(ledger));
  }

  async getCropPacks() {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/crop-packs');
      const raw = resp?.data || resp;
      if (Array.isArray(raw)) return raw.map(pack => this.normalizeCropPack(pack));
      if (raw?.cropCode) return [this.normalizeCropPack(raw)];
      throw new ApiError('后端返回了无效的作物包数据', { code: 'CROP_PACKS_INVALID', payload: resp });
    }
    return JSON.parse(JSON.stringify(MOCK_DATA.cropPackDetails));
  }

  async getCropManuals() {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/crop-manuals');
      const raw = resp?.data || resp;
      if (Array.isArray(raw)) return raw;
      throw new ApiError('后端返回了无效的培养手册目录', { code: 'CROP_MANUALS_INVALID', payload: resp });
    }
    return (MOCK_DATA.cropPackDetails || []).map((pack) => ({
      cropCode: pack.cropCode,
      version: pack.version,
      name: pack.identity?.name,
      region: pack.identity?.region,
      stageCount: pack.stages?.length || 0,
      stages: (pack.stages || []).map((stage) => ({ code: stage.code, label: stage.label, sequence: stage.sequence }))
    }));
  }

  async getCropManual(cropCode, stageCode) {
    if (this.sessionMode === 'live') {
      const path = stageCode
        ? `/api/v1/crop-manuals/${encodeURIComponent(cropCode)}/stages/${encodeURIComponent(stageCode)}`
        : `/api/v1/crop-manuals/${encodeURIComponent(cropCode)}`;
      const resp = await this._fetch(path);
      const raw = resp?.data || resp;
      if (raw?.cropCode) return raw;
      throw new ApiError('后端返回了无效的培养手册', { code: 'CROP_MANUAL_INVALID', payload: resp });
    }
    const pack = (MOCK_DATA.cropPackDetails || []).find((item) => item.cropCode === cropCode) || MOCK_DATA.cropPackDetails?.[0];
    if (!pack) throw new ApiError('演示作物培养手册不存在', { code: 'CROP_MANUAL_NOT_FOUND' });
    const stage = (pack.stages || []).find((item) => item.code === stageCode) || pack.stages?.[0];
    const stageKnowledge = pack.knowledge?.byStage?.[stage?.code] || [];
    return {
      cropCode: pack.cropCode,
      version: pack.version,
      ruleVersion: pack.ruleVersion,
      knowledgeVersion: pack.knowledgeVersion,
      identity: pack.identity,
      stages: pack.stages,
      stage,
      envMetrics: [],
      guideParagraphs: [],
      rules: pack.rules,
      riskFocus: stage?.riskFocus || [],
      taskTemplates: stage?.taskTemplates || [],
      knowledge: {
        ...(pack.knowledge || {}),
        documents: pack.knowledge?.documents || [],
        stageDocuments: stage?.knowledgeRef ? [stage.knowledgeRef] : [],
        content: stageKnowledge.length ? stageKnowledge : (pack.knowledge?.content || [])
      },
      provenance: 'SIMULATED',
      sourceMode: 'CROP_PACK'
    };
  }

  async getPlotHealth(plotId) {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/health`);
      const raw = resp?.data || resp;
      if (raw && typeof raw.score === 'number') return raw;
      throw new ApiError('后端返回了无效的健康分', { code: 'PLOT_HEALTH_INVALID', payload: resp });
    }
    return null;
  }

  normalizeCropPack(pack) {
    return {
      ...(pack || {}),
      identity: pack?.identity || null,
      stages: Array.isArray(pack?.stages) ? pack.stages.map(stage => typeof stage === 'object' ? { ...stage } : { code: String(stage) }) : [],
      metrics: Array.isArray(pack?.metrics) ? pack.metrics.map(metric => ({ ...metric })) : [],
      rules: Array.isArray(pack?.rules) ? pack.rules.map(rule => ({ ...rule })) : []
    };
  }

  async getRules() {
    if (this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/rules');
      const raw = resp?.data || resp;
      if (Array.isArray(raw)) {
        // The rules endpoint intentionally returns codes only.  Resolve the
        // display name from the same backend Crop Pack response; never borrow
        // a demo crop name in a live session.
        const packs = await this.getCropPacks();
        const names = new Map(packs.map(pack => [pack.cropCode, pack.identity?.name || pack.cropCode]));
        return raw.flatMap(entry => (entry.rules || []).map(rule => ({
          ...rule,
          cropCode: entry.cropCode,
          cropName: names.get(entry.cropCode) || entry.cropCode,
          ruleVersion: entry.version || entry.ruleVersion
        })));
      }
      throw new ApiError('后端返回了无效的规则数据', { code: 'RULES_INVALID', payload: resp });
    }
    return MOCK_DATA.cropPackDetails.flatMap(pack => pack.rules.map(rule => ({ ...rule, cropCode: pack.cropCode, cropName: pack.identity.name, ruleVersion: pack.ruleVersion })));
  }

  async _fetch(path, options = {}, { auth = true } = {}) {
    const { auth: optionAuth = auth, ...fetchOptions } = options;
    const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
    const headers = {
      'Accept': 'application/json',
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(optionAuth && this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      ...(options.headers || {})
    };
    if (isFormData) delete headers['Content-Type'];
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...fetchOptions, headers });
    } catch (error) {
      if (this.sessionMode === 'live') this.isLive = false;
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
      if ([502, 503, 504].includes(response.status)) {
        throw new ApiError(`后端服务未运行: ${response.status}`, {
          code: 'NETWORK_ERROR',
          isNetworkError: true
        });
      }
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
    if (this.sessionMode === 'live') this.isLive = true;
    return payload;
  }
}

export const api = new ApiService();

function fileToInspectionPhoto(file, index = 0) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      photoId: `photo-demo-${Date.now()}-${index}`,
      fileName: file.name || `field-${index + 1}.jpg`,
      contentType: file.type || 'image/jpeg',
      sizeBytes: file.size || 0,
      provenance: 'USER_PROVIDED',
      sourceType: 'HUMAN_OBSERVATION',
      previewUrl: reader.result
    });
    reader.onerror = () => reject(new ApiError('现场照片读取失败', { code: 'INSPECTION_PHOTO_READ_FAILED' }));
    reader.readAsDataURL(file);
  });
}

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
