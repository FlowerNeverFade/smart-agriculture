/**
 * AgriLoop API Service Client
 * Connects to Spring Boot backend (/api/v1) with seamless mock fallback
 */
import { MOCK_DATA } from './mock-data.js';

export class ApiService {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = localStorage.getItem('agriloop_token') || '';
    this.isLive = false;
    this.sseSource = null;
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
        if (resp && resp.data) return resp.data;
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

  /**
   * 风险预测（CAP-09）：GET /api/v1/plots/{plotId}/risk-forecast?metric=SOIL_MOISTURE
   * 返回确定性趋势：Time-to-Risk、1/2/4h 期望值与置信区间、算法版本与假设
   */
  async getRiskForecast(plotId = 'plot-a01', metric = 'SOIL_MOISTURE') {
    if (this.isLive) {
      try {
        const resp = await this._fetch(`/api/v1/plots/${plotId}/risk-forecast?metric=${metric}`);
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Live risk-forecast failed, falling back to mock:', e);
      }
    }

    const cfg = MOCK_DATA.riskForecastConfig;
    const plot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
    const start = plot.metrics[metric]?.value ?? 25.0;
    const boundary = cfg.stressBoundary;
    const now = new Date();

    // 样本不足或已越界 -> UNAVAILABLE，不得由模型补造
    if (plot.deviceStatus !== 'ONLINE' || start <= boundary + 0.5) {
      return {
        status: 'UNAVAILABLE',
        plotId, metric,
        reason: plot.deviceStatus !== 'ONLINE' ? '设备离线，遥测样本不足' : '当前湿度已低于极限胁迫边界，无可推演余量',
        generatedAt: now.toISOString(),
        algorithmVersion: cfg.algorithmVersion
      };
    }

    // 确定性衰减模型：m(t) = start * exp(-k * t)，k 使 plot-a01(16.8%) 的 Time-to-Risk 恰为 72 分钟
    const kRef = Math.log(16.8 / boundary) / 72;
    const timeToRisk = Math.min(Math.round(Math.log(start / boundary) / kRef), cfg.maxHorizonMinutes);
    const points = [];
    for (let t = 0; t <= cfg.maxHorizonMinutes; t += 5) {
      const expected = start * Math.exp(-kRef * t);
      const halfWidth = 0.6 + 0.007 * t; // 不确定性随时间线性放大
      points.push({
        minute: t,
        expected: Number(expected.toFixed(2)),
        lower: Number(Math.max(expected - halfWidth, 0).toFixed(2)),
        upper: Number((expected + halfWidth).toFixed(2))
      });
    }

    return {
      status: 'AVAILABLE',
      plotId, metric,
      generatedAt: now.toISOString(),
      inputWindowMinutes: cfg.inputWindowMinutes,
      forecastRangeMinutes: cfg.maxHorizonMinutes,
      algorithmVersion: cfg.algorithmVersion,
      algorithmLabel: cfg.algorithmLabel,
      startMoisture: start,
      stressBoundary: boundary,
      baselineMoisture: cfg.baselineMoisture,
      timeToRiskMinutes: timeToRisk,
      horizons: [60, 120, 240].map(m => {
        const p = points.find(pt => pt.minute === m);
        return {
          minute: m,
          expected: p.expected,
          band: `${p.lower.toFixed(1)}% ~ ${p.upper.toFixed(1)}%`,
          lower: p.lower,
          upper: p.upper
        };
      }),
      curve: points,
      assumptions: ['无降水 / 无外界灌溉', '棚室通风与外部光热保持稳定', '设备保持在线，遥测质量 GOOD'],
      uncertaintyNote: '置信区间随预测时距线性放大；超出 4h 不承诺，样本不足返回 UNAVAILABLE'
    };
  }

  /**
   * 情景注入：POST /api/v1/scenarios/runs { scenario, seed, plotId }
   * 返回冻结快照 + 推演参数（同一 Seed 可重复，不写回主状态）
   */
  async runScenario({ scenario = 'DROUGHT', seed = 42, plotId = 'plot-a01' } = {}) {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/scenarios/runs', {
          method: 'POST',
          body: JSON.stringify({ scenario, seed, plotId })
        });
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Live scenario run failed, falling back to mock:', e);
      }
    }

    const catalog = MOCK_DATA.riskForecastConfig.scenarioCatalog;
    const def = catalog.find(s => s.code === scenario) || catalog[0];
    const plot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
    return {
      scenarioId: `${scenario.toLowerCase()}-${seed}`,
      scenario: def.code,
      scenarioLabel: def.label,
      seed,
      runStatus: 'COMPLETED',
      frozenSnapshot: {
        plotId,
        plotName: plot.name,
        startMoisture: plot.metrics.SOIL_MOISTURE?.value ?? 25.0,
        capturedAt: new Date().toISOString(),
        snapshotLabel: '冻结快照（只读，不写回主状态）'
      },
      params: def
    };
  }

  /**
   * 双轨对比：POST /api/v1/scenarios/compare { scenarioId, seed, plotId }
   * 同一冻结快照 + 同一随机种子：EXECUTE（执行灌溉处方）vs NO_ACTION（放任干旱）
   */
  async compareScenario({ scenario = 'DROUGHT', seed = 42, plotId = 'plot-a01' } = {}) {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/scenarios/compare', {
          method: 'POST',
          body: JSON.stringify({ scenarioId: `${scenario.toLowerCase()}-${seed}`, seed, plotId, leftBranch: 'EXECUTE', rightBranch: 'NO_ACTION' })
        });
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Live scenario compare failed, falling back to mock:', e);
      }
    }

    const catalog = MOCK_DATA.riskForecastConfig.scenarioCatalog;
    const def = catalog.find(s => s.code === scenario) || catalog[0];
    const plot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
    const start = plot.metrics.SOIL_MOISTURE?.value ?? 25.0;
    const boundary = MOCK_DATA.riskForecastConfig.stressBoundary;
    const baseline = MOCK_DATA.riskForecastConfig.baselineMoisture;
    const execTime = 30; // 虚拟执行开始时刻（分钟）

    if (scenario === 'OFFLINE') {
      return {
        status: 'UNAVAILABLE',
        scenarioId: `offline-${seed}`,
        seed, plotId,
        reason: '设备断网离线，遥测样本不足：按确定性策略拒绝预测（UNAVAILABLE），不生成可执行处方'
      };
    }

    // 物理衰减速率：使 DROUGHT 场景下 16.8% 在 72 分钟触达 14% 边界
    const kBase = Math.log(16.8 / boundary) / (def.ttrMinutes || 72);
    const k = kBase * (def.decayFactor || 1.0);
    const rnd = mulberry32(seed);
    const N = 49; // 0..240 分钟，步长 5
    const phys = (t) => start * Math.exp(-k * t);

    const buildBranch = (execute) => {
      return Array.from({ length: N }, (_, i) => {
        const t = i * 5;
        let m;
        if (def.code === 'STORM') {
          // 暴雨：前 45 分钟抬升 6%，随后回落
          const rainEnd = 45;
          if (t <= rainEnd) m = start + def.rainBoostPct * (t / rainEnd);
          else m = (start + def.rainBoostPct) * Math.exp(-k * (t - rainEnd));
          if (execute && t >= execTime) m = Math.min(m + 13.2, 42);
        } else if (execute && t >= execTime) {
          const jump = Math.min(phys(execTime) + 13.2, 42);
          m = jump * Math.exp(-k * 0.55 * (t - execTime));
        } else {
          m = phys(t);
        }
        // 传感器漂移：读数叠加偏移
        if (def.code === 'SENSOR_DRIFT') m = m + def.driftRatePerHour * (t / 60);
        return { minute: t, value: Number(Math.max(m, 0).toFixed(2)) };
      });
    };

    return {
      status: 'AVAILABLE',
      scenarioId: `${scenario.toLowerCase()}-${seed}`,
      scenario: def.code,
      scenarioLabel: def.label,
      seed, plotId,
      frozenSnapshot: { startMoisture: start, capturedAt: new Date().toISOString() },
      stressBoundary: boundary,
      baselineMoisture: baseline,
      execMinute: execTime,
      markers: [
        { minute: 0, label: '冻结快照' },
        { minute: execTime, label: '⚡ 虚拟执行 (补水 ≈13.2%)' }
      ],
      branches: {
        EXECUTE: { label: '分支 A · 执行灌溉处方', points: buildBranch(true), color: '#3fb950' },
        NO_ACTION: { label: '分支 B · 不采取措施放任干旱', points: buildBranch(false), color: '#f85149' }
      },
      note: '双轨使用同一冻结快照与随机种子；分支结果只读，不写回主状态'
    };
  }

  /**
   * 效益对账本：GET /api/v1/value-ledgers
   */
  async getValueLedgers() {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/value-ledgers');
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Live value-ledger failed, falling back to mock:', e);
      }
    }
    return JSON.parse(JSON.stringify(MOCK_DATA.valueLedger));
  }

  async _fetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  }
}

export const api = new ApiService();

/**
 * 确定性伪随机数生成器（mulberry32）
 * 保证同一 Seed 的双轨推演与回放完全可重复
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
