/**
 * AgriLoop API Service Client
 * Connects to Spring Boot backend (/api/v1) with seamless mock fallback
 */
import { MOCK_DATA } from './mock-data.js';
import { buildScenarioSeries, seededRandom, toNumber } from './modules/task5-utils.js';

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
    const random = seededRandom(`${plotId}:${metric}:telemetry-v1`);
    
    return Array.from({ length: 24 }, (_, i) => {
      const offset = (24 - i) * 10 * 60 * 1000;
      const noise = (Math.sin(i / 3) * 1.5) + (random() * 0.4 - 0.2);
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

  /**
   * CAP-09: short-horizon forecast with an explicit unavailable path. The
   * live contract is returned untouched; the fallback mirrors its shape so
   * the visual layer exercises the same renderer in offline demos.
   */
  async getRiskForecast(plotId = 'plot-a01', metric = 'SOIL_MOISTURE') {
    if (this.isLive) {
      try {
        const resp = await this._fetch(`/api/v1/plots/${encodeURIComponent(plotId)}/risk-forecast?metric=${encodeURIComponent(metric)}`);
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Falling back to deterministic risk forecast:', e);
      }
    }

    const plot = MOCK_DATA.plots.find(item => item.plotId === plotId) || MOCK_DATA.plots[0];
    const current = toNumber(plot?.metrics?.[metric]?.value, 24);
    const slope = plot?.riskLevel === 'HIGH' ? -0.026 : plot?.riskLevel === 'MEDIUM' ? -0.008 : 0.002;
    const horizons = [60, 120, 240].map(minutes => {
      const value = current + slope * minutes;
      const spread = 0.75 + minutes / 240 * 1.2;
      return {
        minutes,
        value: Number(value.toFixed(2)),
        lower: Number((value - spread).toFixed(2)),
        upper: Number((value + spread).toFixed(2))
      };
    });
    const timeToRiskMinutes = current <= 20 ? 0 : slope < 0 ? Math.ceil((current - 20) / -slope) : null;
    return {
      forecastId: `fc-demo-${plotId}`,
      plotId,
      metric,
      issuedAt: new Date().toISOString(),
      status: 'AVAILABLE',
      horizons,
      timeToRiskMinutes,
      riskBoundary: { operator: 'LT', value: 20, unit: '%' },
      inputWindow: { from: new Date(Date.now() - 12 * 60 * 1000).toISOString(), to: new Date().toISOString(), validSamples: 24 },
      quality: { coverage: 0.98, confidenceBandSource: 'RESIDUAL_MAD' },
      assumptions: ['NO_IRRIGATION', 'MOCK_WEATHER_STABLE'],
      algorithmVersion: 'robust-trend-v1',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      provenance: 'DERIVED'
    };
  }

  async evaluateForecast(plotId = 'plot-a01', metric = 'SOIL_MOISTURE') {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/forecasts/evaluate', {
          method: 'POST',
          body: JSON.stringify({ plotId, metric })
        });
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Live forecast evaluation failed, using GET snapshot:', e);
      }
    }
    return this.getRiskForecast(plotId, metric);
  }

  /** CAP-09 / Gate 2: start a deterministic, read-only scenario branch. */
  async runScenario({ scenario = 'drought', seed = 42, plotId = 'plot-a01', scenarioId, branchId = 'MAIN', generateSample = true } = {}) {
    const stableScenarioId = scenarioId || `task5-${scenario}-${seed}`;
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/scenarios/runs', {
          method: 'POST',
          body: JSON.stringify({ scenario, scenarioId: stableScenarioId, seed: Number(seed), plotId, branchId, generateSample })
        });
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Live scenario run failed, using deterministic local replay:', e);
      }
    }

    const plot = MOCK_DATA.plots.find(item => item.plotId === plotId) || MOCK_DATA.plots[0];
    const simulation = buildScenarioSeries({ scenario, seed: Number(seed), startValue: plot?.metrics?.SOIL_MOISTURE?.value });
    return {
      runId: `run-${stableScenarioId}-${branchId.toLowerCase()}`,
      scenarioId: stableScenarioId,
      scenario,
      seed: Number(seed),
      branchId,
      status: 'COMPLETED',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      replayEvents: simulation.points.length,
      mainEvents: 0,
      readOnly: true,
      provenance: 'SIMULATED',
      snapshotHash: simulation.snapshotHash
    };
  }

  async compareScenario({ scenarioId, scenario = 'drought', seed = 42, plotId = 'plot-a01', leftBranch = 'EXECUTE', rightBranch = 'NO_ACTION' } = {}) {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/scenarios/compare', {
          method: 'POST',
          body: JSON.stringify({ scenarioId, scenario, seed: Number(seed), plotId, leftBranch, rightBranch })
        });
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Live scenario compare failed, using deterministic local comparison:', e);
      }
    }

    const plot = MOCK_DATA.plots.find(item => item.plotId === plotId) || MOCK_DATA.plots[0];
    const simulation = buildScenarioSeries({ scenario, seed: Number(seed), startValue: plot?.metrics?.SOIL_MOISTURE?.value });
    return {
      scenarioId: scenarioId || `task5-${scenario}-${seed}`,
      leftBranch: simulation.branches[leftBranch] || simulation.branches.EXECUTE,
      rightBranch: simulation.branches[rightBranch] || simulation.branches.NO_ACTION,
      sameSeed: Number(seed),
      readOnly: true,
      comparisonVersion: 'branch-compare-v1',
      provenance: 'SIMULATED'
    };
  }

  async getValueLedgers() {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/value-ledgers');
        if (resp && resp.data) return Array.isArray(resp.data) ? resp.data : [resp.data];
      } catch (e) {
        console.warn('Falling back to local value ledger:', e);
      }
    }
    return MOCK_DATA.valueLedgers || [];
  }

  async createValueLedger(input = {}) {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/value-ledgers', {
          method: 'POST',
          body: JSON.stringify(input)
        });
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Live value ledger write failed, using local calculation:', e);
      }
    }
    const planned = toNumber(input.plannedWaterLitres, 0);
    const actual = toNumber(input.actualWaterLitres, planned);
    const unitCost = toNumber(input.waterPricePerLitre, 0.004);
    return {
      valueLedgerId: `value-local-${Date.now()}`,
      scope: input.scope || 'farm-demo',
      status: planned > 0 && unitCost > 0 ? 'COMPUTED' : 'INCOMPLETE',
      baseline: { waterLitres: planned, source: 'USER_PROVIDED' },
      actual: { waterLitres: actual, source: 'OBSERVED', sourceMode: 'SIMULATION' },
      counterfactual: { waterLitres: planned, source: 'SIMULATED' },
      metrics: {
        waterSavingLitres: planned - actual,
        waterCost: actual * unitCost,
        waterDeviationRate: planned ? (actual - planned) / planned : null,
        costSaving: (planned - actual) * unitCost
      },
      sourceLabels: ['OBSERVED', 'USER_PROVIDED', 'DERIVED', 'SIMULATED'],
      assumptions: [`水价 ${unitCost.toFixed(3)} 元/L`, '未提供产量/价格证据，不计算利润'],
      algorithmVersion: 'value-ledger-v1',
      formula: '(baselineWaterLitres - actualWaterLitres), actualWaterLitres × unitCost',
      createdAt: new Date().toISOString()
    };
  }

  async getCropPacks() {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/crop-packs');
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Falling back to crop packs:', e);
      }
    }
    return MOCK_DATA.cropPacks;
  }

  async getRules() {
    if (this.isLive) {
      try {
        const resp = await this._fetch('/api/v1/rules');
        if (resp && resp.data) return resp.data;
      } catch (e) {
        console.warn('Falling back to crop pack rules:', e);
      }
    }
    return MOCK_DATA.cropPacks.map(pack => ({ cropCode: pack.cropCode, version: pack.ruleVersion, rules: [] }));
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
