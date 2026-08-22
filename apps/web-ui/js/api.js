/**
 * AgriLoop API client — prefers live backend (built-in virtual sensor), falls back to mock.
 */
import { MOCK_DATA } from './mock-data.js';

const DEFAULT_API_BASES = ['http://127.0.0.1:8080', 'http://localhost:8080'];
const DEMO_USER = { username: 'farmer', password: 'demo123' };

const CROP_LABELS = { tomato: '番茄', cucumber: '黄瓜' };
const METRIC_LABELS = {
  SOIL_MOISTURE: '土壤湿度',
  AIR_TEMPERATURE: '棚内空气温度',
  LIGHT: '光照强度',
  CO2: 'CO2浓度',
  PH: '土壤酸碱度',
  WATER_LEVEL: '水箱储水位',
};

function metricStatus(code, value) {
  if (code === 'SOIL_MOISTURE' && value < 20) return 'WARN';
  if (code === 'AIR_TEMPERATURE' && value > 35) return 'WARN';
  return 'NORMAL';
}

function mapPlotCard(card) {
  const template = MOCK_DATA.plots.find((p) => p.plotId === card.plotId) || MOCK_DATA.plots[0];
  const metrics = {};
  for (const key of Object.keys(template.metrics)) {
    const latest = card.latest?.[key];
    const value = latest && typeof latest === 'object' ? latest.value : template.metrics[key].value;
    metrics[key] = {
      value,
      unit: (latest && latest.unit) || template.metrics[key].unit,
      status: metricStatus(key, value),
      label: METRIC_LABELS[key] || template.metrics[key].label,
      target: template.metrics[key].target,
    };
  }
  return {
    plotId: card.plotId,
    name: card.name || template.name,
    cropCode: card.cropCode || template.cropCode,
    cropName: CROP_LABELS[card.cropCode] || template.cropName,
    cropVariety: template.cropVariety,
    stageCode: template.stageCode,
    stageLabel: template.stageLabel,
    areaM2: template.areaM2,
    riskLevel: card.riskLevel || template.riskLevel,
    healthScore: card.device?.healthScore ?? template.healthScore,
    deviceStatus: card.device?.status || template.deviceStatus,
    deviceId: card.device?.deviceId || template.deviceId,
    lastSeen: card.device?.lastSeen || template.lastSeen,
    metrics,
    alerts: card.alerts ?? 0,
  };
}

export class ApiService {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = localStorage.getItem('agriloop_token') || '';
    this.isLive = false;
    this.liveSource = 'mock';
    this.systemStatus = null;
    this.lastError = null;
  }

  /** Try backend (virtual sensor) first; fall back to mock on any failure. */
  async connect() {
    this.lastError = null;
    for (const base of this.resolveApiBases()) {
      try {
        this.baseUrl = base;
        if (!(await this._pingBackend())) continue;
        await this.ensureAuth();
        const overviewResp = await this._fetch('/api/v1/overview');
        if (!overviewResp?.data?.plots) continue;
        try {
          const statusResp = await this._fetch('/api/v1/system/status');
          this.systemStatus = statusResp?.data || null;
        } catch {
          this.systemStatus = null;
        }
        this.isLive = true;
        this.liveSource =
          this.systemStatus?.virtualSensor === 'UP' ? 'virtual-sensor' : 'api';
        if (base) localStorage.setItem('agriloop_api_base', base);
        return { ok: true, base, source: this.liveSource };
      } catch (e) {
        this.lastError = e;
        console.warn('[AgriLoop] connect failed for', base || '(same-origin)', e);
      }
    }
    this.degradeToMock('backend-unavailable');
    return { ok: false, source: 'mock' };
  }

  degradeToMock(reason) {
    this.isLive = false;
    this.liveSource = 'mock';
    this.lastError = reason;
  }

  resolveApiBases() {
    const stored = localStorage.getItem('agriloop_api_base');
    const port = window.location.port;
    const candidates = [];
    if (stored && stored.trim()) candidates.push(stored.trim());
    if (port === '8080') candidates.push('');
    candidates.push(...DEFAULT_API_BASES);
    return [...new Set(candidates)];
  }

  /** Backend reachable if actuator responds (503 = UP with degraded Redis, still usable). */
  async _pingBackend() {
    for (const path of ['/actuator/info', '/actuator/health']) {
      try {
        const resp = await fetch(`${this.baseUrl}${path}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(3000),
        });
        if (resp.status === 200 || resp.status === 503) return true;
      } catch {
        /* try next path / base */
      }
    }
    return false;
  }

  async ensureAuth() {
    if (this.token) {
      try {
        await this._fetch('/api/v1/auth/me');
        return;
      } catch {
        this.token = '';
        localStorage.removeItem('agriloop_token');
      }
    }
    const resp = await this._fetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(DEMO_USER),
      skipAuth: true,
    });
    if (!resp?.data?.accessToken) throw new Error('登录响应无效');
    this.token = resp.data.accessToken;
    localStorage.setItem('agriloop_token', this.token);
    if (resp.data.user) {
      localStorage.setItem('agriloop_user', JSON.stringify(resp.data.user));
    }
  }

  normalizeOverview(data) {
    return {
      farmId: data.farmId,
      plots: (data.plots || []).map(mapPlotCard),
      activeAlertCount: data.activeAlertCount ?? 0,
      pendingWorkOrderCount: data.pendingWorkOrderCount ?? 0,
      eventCount: data.eventCount ?? 0,
      dataMode: data.dataMode,
      aiMode: data.aiMode,
      generatedAt: data.generatedAt,
      systemStatus: this.systemStatus,
    };
  }

  mockOverview() {
    return {
      farmId: 'farm-demo',
      plots: MOCK_DATA.plots.map((p) => ({ ...p, metrics: { ...p.metrics } })),
      activeAlertCount: 1,
      pendingWorkOrderCount: 2,
      eventCount: 1080,
      dataMode: MOCK_DATA.system.mode,
      aiMode: MOCK_DATA.system.aiMode,
      systemStatus: MOCK_DATA.system,
    };
  }

  async getOverview() {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/overview');
        if (resp?.data) return this.normalizeOverview(resp.data);
      } catch (e) {
        console.warn('[AgriLoop] overview failed, using mock:', e);
        this.degradeToMock(e.message);
      }
    }
    return this.mockOverview();
  }

  async getPlots() {
    const overview = await this.getOverview();
    return overview.plots;
  }

  async getTelemetry(plotId = 'plot-a01', metric = 'SOIL_MOISTURE') {
    if (this.isLive) {
      try {
        const resp = await this._fetch(
          `/api/v1/plots/${plotId}/telemetry?metric=${encodeURIComponent(metric)}&limit=50`,
        );
        if (resp?.data?.length) return resp.data;
      } catch (e) {
        console.warn('[AgriLoop] telemetry failed, using mock series:', e);
      }
    }
    const now = Date.now();
    const targetPlot = MOCK_DATA.plots.find((p) => p.plotId === plotId) || MOCK_DATA.plots[0];
    const baseValue = targetPlot.metrics[metric]?.value || 25.0;
    return Array.from({ length: 24 }, (_, i) => {
      const offset = (24 - i) * 10 * 60 * 1000;
      const noise = Math.sin(i / 3) * 1.5 + (Math.random() * 0.4 - 0.2);
      return {
        eventId: `mock-evt-${i}`,
        plotId,
        metric,
        value: Number(
          (baseValue + noise - (plotId === 'plot-a01' && metric === 'SOIL_MOISTURE' ? (24 - i) * 0.25 : 0)).toFixed(2),
        ),
        unit: targetPlot.metrics[metric]?.unit || '%',
        ts: new Date(now - offset).toISOString(),
        quality: { status: 'GOOD', freshnessMs: 200, confidence: 0.98, sourceMode: 'SIMULATION' },
      };
    });
  }

  async agentChat(message, plotId = 'plot-a01') {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/agent/chat', {
          method: 'POST',
          body: JSON.stringify({ message, plotId }),
        });
        if (resp?.data) return resp.data;
      } catch (e) {
        console.warn('[AgriLoop] agent chat failed, using mock:', e);
      }
    }
    return this._mockAgentChat(message, plotId);
  }

  _mockAgentChat(message, plotId) {
    const lower = (message || '').toLowerCase();
    const traceId = 'run-' + Math.random().toString(36).substring(2, 10);
    const plot = MOCK_DATA.plots.find((p) => p.plotId === plotId) || MOCK_DATA.plots[0];

    if (lower.includes('灌溉') || lower.includes('浇水') || lower.includes('处方') || lower.includes('irrigation')) {
      return {
        traceId,
        mode: 'rules-only',
        intent: 'IRRIGATION_RECOMMENDATION',
        summary: `已为【${plot.name}】生成精准补水处方：建议灌溉 8.5 分钟（需水量约 153 升），预期土壤湿度提升至 30.0%。硬安全门全部校验通过。`,
        tools: [
          {
            name: 'generate_irrigation_plan',
            input: { plotId },
            output: {
              planId: 'plan-' + traceId,
              plotId,
              waterLitre: 153.0,
              durationSeconds: 510,
              readinessStatus: 'READY',
              executable: true,
            },
          },
        ],
        knowledgeEvidence: [
          { source: `crop-packs/${plot.cropCode}/knowledge/irrigation.md`, scope: 'PLOT', provenance: 'RETRIEVED' },
          { source: 'rules://agriloop/safety-limit', scope: 'GENERAL', provenance: 'RETRIEVED' },
        ],
        confidence: 0.95,
      };
    }
    if (lower.includes('诊断') || lower.includes('异常') || lower.includes('为什么') || lower.includes('diagnos')) {
      return {
        traceId,
        mode: 'rules-only',
        intent: 'RISK_DIAGNOSIS',
        summary: `【${plot.name}】当前首要风险为 WATER_DEFICIT (真实土壤缺水)，置信度 92%。已完成传感器漂移校验与阶跃跳变检测，确认非传感器故障。`,
        tools: [
          {
            name: 'diagnose_root_cause',
            input: { plotId },
            output: {
              primaryCause: 'WATER_DEFICIT',
              confidence: 0.92,
              candidates: [
                { code: 'WATER_DEFICIT', confidence: 0.92 },
                { code: 'SENSOR_DRIFT', confidence: 0.08 },
                { code: 'DEVICE_FAULT', confidence: 0.05 },
              ],
            },
          },
        ],
        knowledgeEvidence: [
          { source: `crop-packs/${plot.cropCode}/pack.yaml`, scope: 'CROP', provenance: 'RETRIEVED' },
        ],
        confidence: 0.92,
      };
    }
    if (lower.includes('预测') || lower.includes('未来') || lower.includes('forecast')) {
      return {
        traceId,
        mode: 'deterministic',
        intent: 'RISK_FORECAST',
        summary: `【${plot.name}】未来趋势预测已生成：若不灌溉，预计在 72 分钟后触达极限干旱边界 (14%)；未来 1h 预计湿度 15.2%，2h 预计湿度 13.8%。`,
        tools: [
          {
            name: 'get_risk_forecast',
            input: { plotId },
            output: {
              status: 'AVAILABLE',
              timeToRiskMinutes: 72,
              horizons: [
                { minutes: 60, value: 15.2, lower: 14.4, upper: 16.0 },
                { minutes: 120, value: 13.8, lower: 12.6, upper: 15.0 },
                { minutes: 240, value: 11.5, lower: 9.8, upper: 13.2 },
              ],
            },
          },
        ],
        confidence: 0.88,
      };
    }
    if (lower.includes('任务') || lower.includes('农务') || lower.includes('待办') || lower.includes('work')) {
      return {
        traceId,
        mode: 'rules-only',
        intent: 'TODAY_WORK',
        summary: '今日全场共有 2 项高/中优先级待办：1项土壤便携仪比对校准（温室3号棚），1项番茄疏花打杈作业（温室1号棚）。',
        tools: [
          {
            name: 'get_today_work_items',
            input: { plotId },
            output: MOCK_DATA.feedItems.find((f) => f.type === 'WORK_ORDER')?.details.tasks || [],
          },
        ],
        confidence: 0.99,
      };
    }
    return {
      traceId,
      mode: 'rules-only',
      intent: 'PLOT_STATUS',
      summary: `已读取【${plot.name}】（${plot.cropName} · ${plot.stageLabel}）实时指标：土壤湿度 ${plot.metrics.SOIL_MOISTURE.value}%，温度 ${plot.metrics.AIR_TEMPERATURE.value}°C，设备状态在线。`,
      tools: [{ name: 'get_plot_status', input: { plotId }, output: plot }],
      confidence: 0.96,
    };
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
            source: 'web-dashboard',
          }),
        });
        if (resp?.data) return resp.data;
      } catch (e) {
        console.warn('[AgriLoop] virtual command failed, using mock:', e);
      }
    }
    return {
      commandId: 'cmd-' + Math.random().toString(36).substring(2, 9),
      plotId,
      planId,
      status: 'SUCCEEDED',
      type: 'IRRIGATION_START',
      waterLitre: 153.0,
      durationSeconds: 510,
      transport: 'MQTT_VIRTUAL_ACTUATOR',
      ack: {
        ackId: 'ack-' + Math.random().toString(36).substring(2, 8),
        status: 'SUCCEEDED',
        actualWaterLitre: 153.0,
        result: 'GOOD',
        receivedAt: new Date().toISOString(),
      },
      evaluation: {
        effectivenessScore: 0.96,
        status: 'COMPLETED',
        result: 'GOOD',
        expectedMoisture: '30.0%',
        actualMoisture: '29.8%',
      },
    };
  }

  async _fetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.skipAuth || !this.token ? {} : { Authorization: `Bearer ${this.token}` }),
      ...(options.headers || {}),
    };
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      signal: options.signal || AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  }
}

export const api = new ApiService();
