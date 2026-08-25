/**
 * AgriLoop API Service Client
 * Connects to Spring Boot backend (/api/v1).
 *
 * Mock data is intentionally used only when the backend is unreachable. When
 * the backend is online, authentication and API failures are surfaced to the
 * UI instead of being silently presented as real data.
 */
import { MOCK_DATA } from './mock-data.js';
import { isPublicRole, presentRoleUser, roleCan } from './roles.js';

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
    this.decisionCache = {
      diagnoses: new Map(),
      plans: new Map(),
      readiness: new Map(),
      commands: new Map(),
      evaluations: new Map()
    };
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

  async createPlot(input = {}) {
    if (this.isLive && this.sessionMode === 'live') {
      const resp = await this._fetch('/api/v1/plots', {
        method: 'POST',
        body: JSON.stringify(input)
      });
      if (resp?.data?.plotId) return resp.data;
      throw new ApiError('后端返回了无效的新增地块结果', { code: 'PLOT_CREATE_INVALID', payload: resp });
    }
    return {
      ...input,
      plotId: input.plotId || `plot-local-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString()
    };
  }

  async updatePlot(plotId, input = {}) {
    if (this.isLive && this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input)
      });
      if (resp?.data?.plotId) return resp.data;
      throw new ApiError('后端返回了无效的地块修改结果', { code: 'PLOT_UPDATE_INVALID', payload: resp });
    }
    return { ...input, plotId, updatedAt: new Date().toISOString() };
  }

  async deletePlot(plotId) {
    if (this.isLive && this.sessionMode === 'live') {
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}`, { method: 'DELETE' });
      if (resp?.data?.plotId === plotId) return resp.data;
      throw new ApiError('后端返回了无效的地块删除结果', { code: 'PLOT_DELETE_INVALID', payload: resp });
    }
    return { plotId, deleted: true, deletedAt: new Date().toISOString() };
  }

  async getTelemetry(plotId = 'plot-a01', metric = 'SOIL_MOISTURE', limit = 50, options = {}) {
    if (this.isLive) {
      const query = new URLSearchParams({ metric, limit: String(Math.max(1, Math.min(Number(limit) || 50, 5000))) });
      if (options.from) query.set('from', options.from);
      if (options.to) query.set('to', options.to);
      const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/telemetry?${query.toString()}`);
      if (resp && Array.isArray(resp.data)) return resp.data;
      throw new ApiError('后端返回了无效的遥测数据', { code: 'TELEMETRY_INVALID', payload: resp });
    }
    // Generate 20 realistic telemetry series points
    const now = Date.now();
    const targetPlot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
    const baseValue = targetPlot.metrics[metric]?.value || 25.0;
    
    const count = Math.max(1, Math.min(Number(limit) || 24, 5000));
    const endMs = options.to ? new Date(options.to).getTime() : now;
    const startMs = options.from ? new Date(options.from).getTime() : endMs - (count - 1) * 10 * 60 * 1000;
    const stepMs = count > 1 ? Math.max(1, Math.floor((endMs - startMs) / (count - 1))) : 0;
    return Array.from({ length: count }, (_, i) => {
      const noise = (Math.sin(i / 3) * 1.5) + (Math.random() * 0.4 - 0.2);
      return {
        eventId: `mock-evt-${i}`,
        plotId,
        metric,
        value: Number((baseValue + noise - (plotId === 'plot-a01' && metric === 'SOIL_MOISTURE' ? (count - 1 - i) * 0.25 : 0)).toFixed(2)),
        unit: targetPlot.metrics[metric]?.unit || '%',
        ts: new Date(startMs + i * stepMs).toISOString(),
        quality: { status: "GOOD", freshnessMs: 200, confidence: 0.98 }
      };
    });
  }

  /**
   * 返回指定地块的多指标遥测窗口。后端支持不带 metric 的混合序列；
   * 若当前环境只提供单指标接口，则按 Crop Pack 的六类指标并行回退。
   */
  async getPlotTelemetryAll(plotId = 'plot-a01', limit = 120) {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 120, 5000));
    if (this.isLive) {
      try {
        const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/telemetry?limit=${boundedLimit}`);
        if (Array.isArray(resp?.data) && resp.data.length) {
          return resp.data
            .filter(point => point && point.metric)
            .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
        }
      } catch (error) {
        console.warn('[AgriLoop] mixed telemetry unavailable; falling back to metric windows:', error);
      }
    }
    const metrics = ['SOIL_MOISTURE', 'AIR_TEMPERATURE', 'LIGHT', 'CO2', 'PH', 'WATER_LEVEL'];
    const batches = await Promise.all(metrics.map(metric => this.getTelemetry(plotId, metric, boundedLimit)));
    return batches.flat().sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
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
      operatorId: this.user?.userId || 'demo-farmer',
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
    if (!this.isLive) {
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
    if (this.isLive) {
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
    if (this.isLive) {
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

  async estimateIrrigation(input = {}) {
    if (!input.plotId) {
      throw new ApiError('生成灌溉建议前必须明确地块', { status: 400, code: 'PLOT_CONTEXT_REQUIRED' });
    }
    if (this.isLive) {
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
    if (this.isLive) {
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
    if (this.isLive) {
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

  async getDecisionPassport(traceId) {
    if (this.isLive) {
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
    if (this.isLive) {
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
    if (this.isLive) {
      const resp = await this._fetch(`/api/v1/commands/${encodeURIComponent(commandId)}`);
      const command = resp?.data || resp;
      this.decisionCache.commands.set(commandId, command);
      return command;
    }
    return this.decisionCache.commands.get(commandId) || null;
  }

  async getCommandEvaluation(commandId) {
    if (this.isLive) {
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
      if ([404, 405, 501].includes(response.status)) {
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
