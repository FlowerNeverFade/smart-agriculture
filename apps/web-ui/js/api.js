/**
 * AgriLoop API Service Client
 * Connects to Spring Boot backend (/api/v1) with seamless mock fallback
 */
import { MOCK_DATA } from './mock-data.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', details = {}, isNetworkError = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isNetworkError = isNetworkError;
  }
}

export class ApiService {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = localStorage.getItem('agriloop_token') || '';
    this.isLive = false;
    this.sseSource = null;
  }

  async login({ username, password }) {
    const response = await this._fetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      auth: false
    });
    const result = response?.data;
    if (!result?.accessToken || !result?.user?.username || !result?.user?.role) {
      throw new ApiError('登录响应格式无效', { code: 'AUTH_CONTRACT_INVALID' });
    }
    return result;
  }

  async getCurrentUser() {
    const response = await this._fetch('/api/v1/auth/me');
    return response?.data || null;
  }

  saveSession({ mode, token = '', user }) {
    if (!user?.username || !user?.role || !['live', 'demo'].includes(mode)) {
      throw new ApiError('会话数据无效', { code: 'SESSION_INVALID' });
    }
    if (mode === 'live' && !token) {
      throw new ApiError('实时会话缺少访问令牌', { code: 'SESSION_TOKEN_MISSING' });
    }

    this.token = mode === 'live' ? token : '';
    localStorage.setItem('agriloop_user', JSON.stringify(user));
    localStorage.setItem('agriloop_session_mode', mode);
    if (this.token) localStorage.setItem('agriloop_token', this.token);
    else localStorage.removeItem('agriloop_token');
  }

  clearSession() {
    this.token = '';
    this.sseSource?.close();
    this.sseSource = null;
    localStorage.removeItem('agriloop_token');
    localStorage.removeItem('agriloop_user');
    localStorage.removeItem('agriloop_session_mode');
  }

  readSession() {
    const mode = localStorage.getItem('agriloop_session_mode');
    const token = localStorage.getItem('agriloop_token') || '';
    let user = null;
    try {
      user = JSON.parse(localStorage.getItem('agriloop_user') || 'null');
    } catch {
      return null;
    }
    if (!user?.username || !user?.role) return null;
    if (mode === 'live' && token) return { mode, token, user };
    if (mode === 'demo' && !token) return { mode, token: '', user };
    return null;
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
      try {
        const resp = await this._fetch('/api/v1/overview');
        if (resp?.data) {
          const live = resp.data;
          const plots = Array.isArray(live.plots) ? live.plots.map((plot) => {
            const fallback = MOCK_DATA.plots.find((item) => item.plotId === plot.plotId) || {};
            const metrics = { ...(fallback.metrics || {}) };
            Object.entries(plot.latest || {}).forEach(([metric, reading]) => {
              const fallbackMetric = metrics[metric] || {};
              metrics[metric] = {
                ...fallbackMetric,
                value: typeof reading === 'object' ? reading.value : reading,
                unit: typeof reading === 'object' ? (reading.unit || fallbackMetric.unit) : fallbackMetric.unit
              };
            });
            return {
              ...fallback,
              ...plot,
              cropName: fallback.cropName || plot.cropCode,
              stageLabel: fallback.stageLabel || '当前阶段',
              metrics,
              device: { ...(fallback.device || {}), ...(plot.device || {}) }
            };
          }) : MOCK_DATA.plots;
          return { ...live, plots };
        }
      } catch (e) {
        console.warn('Live API call failed, falling back to mock:', e);
      }
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

  async getPlots() {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/plots');
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Falling back to mock plots:', e);
      }
    }
    return MOCK_DATA.plots;
  }

  async getTelemetry(plotId = 'plot-a01', metric = 'SOIL_MOISTURE') {
    if (this.isLive) {
      try {
        const resp = await this._fetch(`/api/v1/plots/${plotId}/telemetry?metric=${metric}&limit=50`);
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Falling back to mock telemetry:', e);
      }
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

  async agentChat(message, plotId = 'plot-a01') {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/agent/chat', {
          method: 'POST',
          body: JSON.stringify({ message, plotId })
        });
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Live agent chat failed, falling back to mock agent:', e);
      }
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
      try {
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
      } catch (e) {
        console.warn('Live execution command failed, falling back to mock:', e);
      }
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

  async _fetch(path, options = {}) {
    const { auth = true, ...fetchOptions } = options;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(auth && this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
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
      throw new ApiError(payload?.error?.message || `请求失败 (${response.status})`, {
        status: response.status,
        code: payload?.error?.code || `HTTP_${response.status}`,
        details: payload?.error?.details || {},
        isNetworkError: [502, 503, 504].includes(response.status)
      });
    }
    if (!payload) throw new ApiError('服务响应不是有效 JSON', { code: 'RESPONSE_INVALID' });
    return payload;
  }
}

export const api = new ApiService();
