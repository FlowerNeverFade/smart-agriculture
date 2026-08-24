/**
 * AgriLoop - 3D Microscopic Crop Digital Twin & Future Risk Deduction Studio
 * Single Crop Physiological Sandbox, Scenario Injection, Dual-Track Replay & Value Ledger
 */
import * as THREE from '../vendor/three/three.module.min.js';

// Crop Specimen Configurations
const CROP_MODELS = {
  tomato: {
    name: '千禧水果番茄',
    scientific: 'Solanum lycopersicum',
    optimalMoisture: '20% ~ 40%',
    criticalWiltMoisture: 14.0,
    stages: {
      seedling: { label: '幼苗期', scale: 0.6, fruits: 0, flowers: 0 },
      vegetative: { label: '营养生长期', scale: 0.85, fruits: 0, flowers: 2 },
      flowering: { label: '开花坐果期', scale: 1.0, fruits: 3, flowers: 6 },
      fruiting: { label: '果实成熟期', scale: 1.15, fruits: 8, flowers: 3 }
    }
  },
  cucumber: {
    name: '金童水果黄瓜',
    scientific: 'Cucumis sativus',
    optimalMoisture: '25% ~ 45%',
    criticalWiltMoisture: 16.0,
    stages: {
      seedling: { label: '幼苗期', scale: 0.6, fruits: 0, flowers: 0 },
      vegetative: { label: '攀援蔓生期', scale: 0.9, fruits: 0, flowers: 2 },
      flowering: { label: '盛花初瓜期', scale: 1.05, fruits: 2, flowers: 5 },
      fruiting: { label: '高产采收期', scale: 1.2, fruits: 6, flowers: 3 }
    }
  },
  corn: {
    name: '鲜食糯玉米 8 号',
    scientific: 'Zea mays',
    optimalMoisture: '25% ~ 45%',
    criticalWiltMoisture: 15.0,
    stages: {
      seedling: { label: '拔节期', scale: 0.7, fruits: 0, flowers: 0 },
      vegetative: { label: '大喇叭口期', scale: 0.95, fruits: 0, flowers: 0 },
      flowering: { label: '抽雄吐丝期', scale: 1.1, fruits: 1, flowers: 1 },
      fruiting: { label: '灌浆乳熟期', scale: 1.25, fruits: 2, flowers: 1 }
    }
  },
  rice: {
    name: '渝香优 203 生态水稻',
    scientific: 'Oryza sativa',
    optimalMoisture: '30% ~ 55%',
    criticalWiltMoisture: 18.0,
    stages: {
      seedling: { label: '分蘖期', scale: 0.7, fruits: 0, flowers: 0 },
      vegetative: { label: '拔节孕穗期', scale: 0.9, fruits: 0, flowers: 0 },
      flowering: { label: '抽穗扬花期', scale: 1.05, fruits: 0, flowers: 1 },
      fruiting: { label: '灌浆结实期', scale: 1.15, fruits: 4, flowers: 0 }
    }
  },
  sunflower: {
    name: '金色阳光油葵',
    scientific: 'Helianthus annuus',
    optimalMoisture: '20% ~ 38%',
    criticalWiltMoisture: 13.5,
    stages: {
      seedling: { label: '苗期', scale: 0.6, fruits: 0, flowers: 0 },
      vegetative: { label: '现蕾期', scale: 0.9, fruits: 0, flowers: 0 },
      flowering: { label: '盛花结盘期', scale: 1.1, fruits: 0, flowers: 1 },
      fruiting: { label: '成熟结实期', scale: 1.2, fruits: 1, flowers: 1 }
    }
  },
  strawberry: {
    name: '红颜精品草莓',
    scientific: 'Fragaria × ananassa',
    optimalMoisture: '22% ~ 35%',
    criticalWiltMoisture: 15.0,
    stages: {
      seedling: { label: '缓苗期', scale: 0.6, fruits: 0, flowers: 0 },
      vegetative: { label: '旺盛生长期', scale: 0.85, fruits: 0, flowers: 1 },
      flowering: { label: '开花结果期', scale: 1.0, fruits: 4, flowers: 4 },
      fruiting: { label: '采收成熟期', scale: 1.1, fruits: 8, flowers: 2 }
    }
  }
};

// 6 Core Scenario Presets & Risk Data
const SCENARIO_PRESETS = {
  normal: {
    id: 'normal',
    name: '健康基准态 (Normal Baseline)',
    icon: 'ph-plant',
    badge: 'NORMAL',
    timeToRiskMinutes: 999,
    currentMoisture: 28.5,
    temp: 26.4,
    humidity: 58,
    rootCauses: [
      { name: '生理代谢平衡', prob: 98, color: '#3fb950' },
      { name: '土壤供水充足', prob: 96, color: '#3fb950' }
    ],
    forecastCurve: [
      { t: 0, val: 28.5, lower: 28.0, upper: 29.0 },
      { t: 1, val: 27.2, lower: 26.4, upper: 28.0 },
      { t: 2, val: 25.8, lower: 24.8, upper: 26.8 },
      { t: 4, val: 23.4, lower: 22.0, upper: 24.8 }
    ],
    trackA_loss: '0 元 (健康无损)',
    trackB_benefit: '节水 0L / 处方待命中',
    desc: '环境温湿度光照处于最佳舒适区，气孔开度正常，水分代谢健康。'
  },
  drought: {
    id: 'drought',
    name: '持续干旱失水 (Gradual Drydown)',
    icon: 'ph-sun-dim',
    badge: 'HIGH_RISK',
    timeToRiskMinutes: 72,
    currentMoisture: 16.8,
    temp: 31.2,
    humidity: 32,
    rootCauses: [
      { name: '真实土壤缺水 (WATER_DEFICIT)', prob: 94, color: '#f85149' },
      { name: '蒸腾拉力激增', prob: 88, color: '#d29922' },
      { name: '排除传感器漂移', prob: 6, color: '#8b949e' }
    ],
    forecastCurve: [
      { t: 0, val: 16.8, lower: 16.2, upper: 17.4 },
      { t: 1, val: 14.2, lower: 13.4, upper: 15.0 },
      { t: 2, val: 12.1, lower: 10.8, upper: 13.2 },
      { t: 4, val: 9.2, lower: 7.5, upper: 10.8 }
    ],
    trackA_loss: '¥1,850 (减产 38%)',
    trackB_benefit: '挽回损失 ¥1,850 / 补水 153L',
    desc: '若不采取补水措施，72分钟内将击穿凋萎临界点(14.0%)，导致细胞膨压丧失与永久落花落果。'
  },
  heatwave: {
    id: 'heatwave',
    name: '极端热浪强蒸散 (Heatwave VPD)',
    icon: 'ph-flame',
    badge: 'CRITICAL',
    timeToRiskMinutes: 45,
    currentMoisture: 18.2,
    temp: 38.6,
    humidity: 24,
    rootCauses: [
      { name: '高温强光灼伤 (HEAT_VPD)', prob: 92, color: '#f85149' },
      { name: '水分剧烈耗竭', prob: 90, color: '#f85149' },
      { name: '根系吸水滞后', prob: 82, color: '#d29922' }
    ],
    forecastCurve: [
      { t: 0, val: 18.2, lower: 17.5, upper: 18.9 },
      { t: 1, val: 12.8, lower: 11.5, upper: 13.9 },
      { t: 2, val: 9.5, lower: 7.8, upper: 11.0 },
      { t: 4, val: 6.8, lower: 5.0, upper: 8.5 }
    ],
    trackA_loss: '¥2,400 (严重灼伤)',
    trackB_benefit: '微喷降温挽回 ¥2,400 / 节水 280L',
    desc: '饱和水汽压差(VPD)超标3.8kPa，气孔被迫关闭，叶温超限，急需微喷雾化降温与脉冲微灌。'
  },
  flood: {
    id: 'flood',
    name: '特大暴雨积水 (Root Waterlogging)',
    icon: 'ph-cloud-rain',
    badge: 'WARNING',
    timeToRiskMinutes: 180,
    currentMoisture: 92.0,
    temp: 22.1,
    humidity: 98,
    rootCauses: [
      { name: '土壤过饱和积水 (WATERLOGGING)', prob: 96, color: '#58a6ff' },
      { name: '根系低氧窒息', prob: 89, color: '#d29922' },
      { name: '沤根腐烂风险', prob: 78, color: '#f85149' }
    ],
    forecastCurve: [
      { t: 0, val: 92.0, lower: 90.0, upper: 94.0 },
      { t: 1, val: 90.5, lower: 88.0, upper: 93.0 },
      { t: 2, val: 87.2, lower: 84.0, upper: 90.0 },
      { t: 4, val: 82.0, lower: 77.0, upper: 86.0 }
    ],
    trackA_loss: '¥1,200 (沤根减产)',
    trackB_benefit: '自动强排减损 ¥1,200 / 避免盲目灌水',
    desc: '田间含水率超90%，根际氧分压急剧下降，系统禁止任何灌溉动作并自动生成排涝工单。'
  },
  drift: {
    id: 'drift',
    name: '传感器零点漂移 (Sensor Zero Drift)',
    icon: 'ph-warning',
    badge: 'HARDWARE_ANOMALY',
    timeToRiskMinutes: 999,
    currentMoisture: 11.2, // False telemetry reading
    temp: 26.5,
    humidity: 56,
    rootCauses: [
      { name: '传感器零点漂移 (SENSOR_DRIFT)', prob: 93, color: '#bc8cff' },
      { name: '作物真实生理健康', prob: 95, color: '#3fb950' },
      { name: '排除真实缺水 (置信度 < 5%)', prob: 95, color: '#3fb950' }
    ],
    forecastCurve: [
      { t: 0, val: 11.2, lower: 11.0, upper: 11.4 },
      { t: 1, val: 11.1, lower: 10.9, upper: 11.3 },
      { t: 2, val: 11.0, lower: 10.8, upper: 11.2 },
      { t: 4, val: 10.8, lower: 10.5, upper: 11.1 }
    ],
    trackA_loss: '¥0 (作物健康)',
    trackB_benefit: '避免错误过量灌溉 180L / 派发校准工单',
    desc: '【关键可信决策亮点】：传感器读数突降至11%告警，但AI通过气象/蒸散模型与多源遥测比对，准确识别为传感器漂移假象，拒绝错误下发灌溉处方！'
  },
  stuck: {
    id: 'stuck',
    name: '执行器卡阀断网 (Actuator Stuck)',
    icon: 'ph-plugs',
    badge: 'ACTUATOR_FAULT',
    timeToRiskMinutes: 60,
    currentMoisture: 15.5,
    temp: 29.8,
    humidity: 38,
    rootCauses: [
      { name: '电磁阀机械卡滞 (VALVE_STUCK)', prob: 95, color: '#f85149' },
      { name: '命令已下发但无ACK回执', prob: 91, color: '#d29922' }
    ],
    forecastCurve: [
      { t: 0, val: 15.5, lower: 15.0, upper: 16.0 },
      { t: 1, val: 13.8, lower: 13.0, upper: 14.5 },
      { t: 2, val: 11.9, lower: 10.5, upper: 13.0 },
      { t: 4, val: 8.8, lower: 7.0, upper: 10.5 }
    ],
    trackA_loss: '¥1,600 (缺水干枯)',
    trackB_benefit: '转备用支管/人工复核挽回 ¥1,600',
    desc: '虚拟执行器反馈非成功超时回执，决策护照标记执行中断，自动降级并派发人工应急工单。'
  }
};

export class CropSandbox {
  constructor(options = {}) {
    this.host = options.host || document.body;
    this.onExit = options.onExit || (() => {});
    this.onPrescribe = options.onPrescribe || (() => {});
    this.plotId = options.plotId || 'plot-a01';
    this.plotData = options.plotData || null;

    this.activeScenario = 'normal';
    this.replayTrack = 'trackA'; // 'trackA' (no intervention) vs 'trackB' (with AI prescription)
    this.replayTime = 0.0; // 0.0h ~ 4.0h
    this.isPlaying = false;
    this.playSpeed = 1.0;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.soilGroup = null;
    this.plantGroup = null;
    this.leafMeshes = [];
    this.fruitMeshes = [];
    this.flowerMeshes = [];
    this.rootLines = null;
    this.heatParticles = null;
    this.floodWater = null;
    this.sensorMesh = null;
    this.sensorBadge = null;
    this.rootMaterials = [];
    this.windMaterials = [];
    this.droughtCracks = null;

    this.animationFrame = null;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.isActive = false;
    this.isDestroyed = false;
    this.cameraTarget = new THREE.Vector3(0.38, 0.13, 0);
    this.orbitRadius = 5.7;
    this.orbitAzimuth = 0;
    this.orbitElevation = 0.16;

    this.initDom();
    this.init3D();
    this.bindEvents();
  }

  setPlot(plotId, plotData) {
    this.plotId = plotId;
    this.plotData = plotData;
    this.updateCropInfo();
    this.rebuildPlantModel();
    this.runScenario('normal');
  }

  initDom() {
    this.container = document.createElement('div');
    this.container.className = 'crop-sandbox-container';
    this.container.setAttribute('aria-hidden', 'true');
    this.container.innerHTML = `
      <!-- 3D Canvas Viewport -->
      <div class="sandbox-canvas-viewport" data-canvas-viewport></div>

      <!-- Top Header Navigation -->
      <header class="sandbox-header">
        <div class="sandbox-nav-left">
          <button type="button" class="sandbox-btn-back" data-btn-exit>
            <i class="ph ph-arrow-left"></i>
            <span>返回全景大地图</span>
          </button>
          <div class="sandbox-title-badge">
            <h2 data-crop-title>
              <i class="ph ph-microscope"></i>
              <span data-plot-name>A01 番茄示范田</span> · 微观数字孪生沙盘
            </h2>
            <div class="sandbox-title-meta">
              <span class="sandbox-meta-item"><i class="ph ph-dna"></i> 品种：<strong data-crop-variety>千禧水果番茄</strong></span>
              <span class="sandbox-meta-item sandbox-scientific"><i class="ph ph-flask"></i> <em data-crop-scientific>Solanum lycopersicum</em></span>
              <span class="sandbox-meta-item"><i class="ph ph-calendar"></i> 阶段：<strong data-crop-stage>果实成熟期</strong></span>
              <span class="sandbox-meta-item"><i class="ph ph-heartbeat"></i> 生理健康分：<strong data-crop-health>98%</strong></span>
            </div>
          </div>
        </div>

        <div class="sandbox-header-right">
          <div class="sandbox-sequence-chip">
            <span>SIMULATION WINDOW</span>
            <strong data-sequence-time>T+0.0h / 4.0h</strong>
          </div>
          <div class="sandbox-telemetry-strip" aria-label="推演环境遥测">
            <span data-telemetry="temperature"><i class="ph ph-thermometer"></i><b>26.4°C</b><small>温度</small></span>
            <span data-telemetry="moisture"><i class="ph ph-drop"></i><b>28.5%</b><small>土壤水分</small></span>
            <span data-telemetry="light"><i class="ph ph-sun"></i><b>48 klux</b><small>光照</small></span>
            <span data-telemetry="vpd"><i class="ph ph-wind"></i><b>1.4 kPa</b><small>VPD</small></span>
          </div>
        </div>
      </header>

      <div class="sandbox-depth-ruler" aria-hidden="true">
        <span style="--depth-y: 0%">0 cm</span>
        <span style="--depth-y: 33%">−15 cm</span>
        <span style="--depth-y: 66%">−30 cm</span>
        <span style="--depth-y: 100%">−45 cm</span>
      </div>

      <!-- Left Scenario Injection Dock -->
      <aside class="sandbox-left-dock">
        <div class="sandbox-card">
          <h3 class="sandbox-card-title">
            <span>风险情景发生器</span>
            <i class="ph ph-lightning"></i>
          </h3>
          <div class="sandbox-scenario-grid">
            <button class="sandbox-scenario-btn active" type="button" data-scenario="normal" aria-label="健康基准稳态" title="健康基准稳态">
              <i class="ph ph-plant" style="color: #3fb950;"></i>
              <div>
                <strong>健康基准态</strong>
                <span class="sandbox-scenario-desc">水温光适宜 · 稳态代谢</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-drought" type="button" data-scenario="drought" aria-label="持续干旱失水" title="持续干旱失水">
              <i class="ph ph-sun-dim" style="color: #d29922;"></i>
              <div>
                <strong>持续干旱失水</strong>
                <span class="sandbox-scenario-desc">72min 击穿极限凋萎边界</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-heat" type="button" data-scenario="heatwave" aria-label="极端热浪强蒸散" title="极端热浪强蒸散">
              <i class="ph ph-flame" style="color: #ff7b72;"></i>
              <div>
                <strong>极端热浪强蒸散</strong>
                <span class="sandbox-scenario-desc">气温 38.6°C · VPD 剧增</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-rain" type="button" data-scenario="flood" aria-label="特大暴雨积水" title="特大暴雨积水">
              <i class="ph ph-cloud-rain" style="color: #79c0ff;"></i>
              <div>
                <strong>特大暴雨积水</strong>
                <span class="sandbox-scenario-desc">田面过饱和 · 根系缺氧</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-drift" type="button" data-scenario="drift" aria-label="传感器零点漂移" title="传感器零点漂移">
              <i class="ph ph-warning" style="color: #d2a8ff;"></i>
              <div>
                <strong>传感器零点漂移</strong>
                <span class="sandbox-scenario-desc">误报 11% · 作物实测健康</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn" type="button" data-scenario="stuck" aria-label="执行器卡阀断网" title="执行器卡阀断网">
              <i class="ph ph-plugs" style="color: #f85149;"></i>
              <div>
                <strong>执行器卡阀断网</strong>
                <span class="sandbox-scenario-desc">下发超时 · 触发应急降级</span>
              </div>
            </button>
          </div>
        </div>
      </aside>

      <!-- Right Prognostics & Diagnostic HUD -->
      <aside class="sandbox-right-hud">
        <!-- Time-to-Risk Gauge -->
        <div class="sandbox-gauge-card">
          <div class="sandbox-gauge-circle">
            <svg viewBox="0 0 80 80">
              <circle class="sandbox-gauge-bg" cx="40" cy="40" r="32"></circle>
              <circle class="sandbox-gauge-progress" data-gauge-progress cx="40" cy="40" r="32"></circle>
            </svg>
            <div class="sandbox-gauge-val">
              <span data-time-val>72</span>
              <span>MINUTES</span>
            </div>
          </div>
          <div class="sandbox-gauge-info">
            <h4 data-gauge-title>Time-to-Risk 越界倒计时</h4>
            <p data-gauge-desc>预计在 72 分钟内触达极限水分胁迫边界 (14.0%)</p>
          </div>
        </div>

        <!-- 1h/2h/4h Forecast Envelope Chart -->
        <div class="sandbox-chart-card">
          <h3 class="sandbox-card-title">
            <span>未来 1~4h 水分衰减预测带</span>
            <i class="ph ph-chart-line-up"></i>
          </h3>
          <div class="sandbox-chart-wrap" data-chart-container>
            <svg width="100%" height="100%" viewBox="0 0 320 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="envelopeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#58a6ff" stop-opacity="0.35"/>
                  <stop offset="100%" stop-color="#58a6ff" stop-opacity="0.02"/>
                </linearGradient>
              </defs>
              <!-- Safe Target Band -->
              <rect data-safe-band x="0" y="24" width="320" height="42" fill="rgba(63, 185, 80, 0.12)" rx="4"/>
              <text data-safe-label x="6" y="38" fill="#3fb950" font-size="9" font-weight="bold">适宜带 20%~40%</text>
              <!-- Wilt Critical Line -->
              <line data-wilt-line x1="0" y1="88" x2="320" y2="88" stroke="#f85149" stroke-dasharray="4,3" stroke-width="1.2"/>
              <text data-wilt-label x="230" y="84" fill="#f85149" font-size="9">凋萎线 14%</text>
              <!-- Prediction Envelope Polygon -->
              <polygon data-chart-polygon points="20,40 100,56 180,72 300,98 300,112 180,90 100,68 20,48" fill="url(#envelopeGrad)"/>
              <!-- Median Trend Curve -->
              <path data-chart-line d="M 20,44 Q 100,62 180,81 T 300,105" fill="none" stroke="#58a6ff" stroke-width="2.5"/>
              <!-- Horizon Points -->
              <circle data-point-0 cx="20" cy="44" r="3.5" fill="#fff" stroke="#58a6ff" stroke-width="2"/>
              <circle data-point-1 cx="100" cy="62" r="3.5" fill="#fff" stroke="#58a6ff" stroke-width="2"/>
              <circle data-point-2 cx="180" cy="81" r="3.5" fill="#fff" stroke="#58a6ff" stroke-width="2"/>
              <circle data-point-4 cx="300" cy="105" r="3.5" fill="#fff" stroke="#f85149" stroke-width="2"/>
              <!-- Horizon Ticks -->
              <text x="14" y="116" fill="#8b949e" font-size="9">Now</text>
              <text x="94" y="116" fill="#8b949e" font-size="9">+1h</text>
              <text x="174" y="116" fill="#8b949e" font-size="9">+2h</text>
              <text x="290" y="116" fill="#8b949e" font-size="9">+4h</text>
            </svg>
          </div>
        </div>

        <!-- Root Cause Probability & Diagnostic Confidence -->
        <div class="sandbox-card">
          <h3 class="sandbox-card-title">
            <span>根因推断与置信排查</span>
            <i class="ph ph-tree-structure"></i>
          </h3>
          <div class="sandbox-diagnostic-list" data-diag-list>
            <!-- Injected dynamically -->
          </div>
          <button class="sandbox-btn-prescribe" type="button" data-btn-prescribe style="margin-top: 12px;">
            <i class="ph ph-lightning"></i>
            <span>一键生成智能灌溉处方</span>
          </button>
        </div>
      </aside>

      <!-- Bottom Dual-Track Replay Scrubber (双轨对比时间轴) -->
      <footer class="sandbox-bottom-scrubber">
        <div class="sandbox-scrubber-top">
          <div class="sandbox-track-tabs">
            <span style="font-size: 11px; font-weight: 700; color: var(--sandbox-text-muted); text-transform: uppercase;">推演分支：</span>
            <button class="sandbox-track-tab active" type="button" data-track="trackA">
              <i class="ph ph-x-circle" style="color: #f85149;"></i>
              <span>分支 A: 放任不管 (No Intervention)</span>
            </button>
            <button class="sandbox-track-tab tab-action" type="button" data-track="trackB">
              <i class="ph ph-check-circle" style="color: #3fb950;"></i>
              <span>分支 B: 执行智能处方 (AI Prescription)</span>
            </button>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11px; color: var(--sandbox-text-muted);">回放进度：</span>
            <strong style="font-family: var(--font-mono); color: #fff; font-size: 13px;" data-time-display>+0.0 小时 (当前时点)</strong>
          </div>
        </div>

        <!-- Timeline Slider -->
        <div class="sandbox-timeline-wrap">
          <button class="sandbox-play-btn" type="button" data-btn-play title="播放/暂停推演动画">
            <i class="ph ph-play" data-play-icon></i>
          </button>
          <button class="sandbox-speed-btn" type="button" data-speed aria-label="切换回放速度">1×</button>
          <div class="sandbox-slider-rail">
            <input class="sandbox-slider" type="range" min="0" max="4.0" step="0.05" value="0" data-timeline-slider>
            <div class="sandbox-time-ticks">
              <span>0h (Now)</span>
              <span>+1.0h</span>
              <span>+2.0h</span>
              <span>+3.0h</span>
              <span>+4.0h (极限推演)</span>
            </div>
          </div>
        </div>

        <!-- Real-Time Value Ledger Ticker -->
        <div class="sandbox-value-ticker">
          <div class="sandbox-ticker-item">
            <i class="ph ph-coins" style="color: #d29922;"></i>
            <span>经济影响预估：</span>
            <strong data-ticker-loss style="color: #f85149;">-¥1,850 (减产 38%)</strong>
          </div>
          <div class="sandbox-ticker-item">
            <i class="ph ph-drop" style="color: #58a6ff;"></i>
            <span>处方节水效能：</span>
            <strong data-ticker-benefit style="color: #3fb950;">智能补水 153L (挽回率 100%)</strong>
          </div>
          <div class="sandbox-ticker-item">
            <i class="ph ph-clock" style="color: #bc8cff;"></i>
            <span>工时节约：</span>
            <strong>避免无效巡检 2.5h</strong>
          </div>
        </div>
      </footer>
    `;

    this.host.appendChild(this.container);
  }

  init3D() {
    const viewport = this.container.querySelector('[data-canvas-viewport]');
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    viewport.appendChild(this.renderer.domElement);

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e14);
    this.scene.fog = new THREE.FogExp2(0x0a0e14, 0.04);

    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    this.syncOrbitCamera();

    // Lighting (OceanX Sci-fi Lab Aesthetics)
    const ambientLight = new THREE.AmbientLight(0xd0e4ff, 1.2);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    sunLight.position.set(4, 8, 5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 20;
    sunLight.shadow.bias = -0.001;
    this.scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x58a6ff, 1.5);
    rimLight.position.set(-5, 3, -4);
    this.scene.add(rimLight);

    const specimenLight = new THREE.PointLight(0xaed6ff, 1.15, 6, 1.8);
    specimenLight.position.set(0.6, 1.25, 3.2);
    this.scene.add(specimenLight);

    const groundGrid = new THREE.GridHelper(18, 36, 0x315f8f, 0x18283a);
    groundGrid.position.y = -1.42;
    groundGrid.material.transparent = true;
    groundGrid.material.opacity = 0.16;
    groundGrid.material.depthWrite = false;
    this.scene.add(groundGrid);

    const underLight = new THREE.PointLight(0x2ea8a8, 0.9, 5.5, 2);
    underLight.position.set(0, -0.75, 1.2);
    this.scene.add(underLight);

    const haloGroup = new THREE.Group();
    haloGroup.position.set(0, 0.32, -0.86);
    [1.06, 1.31, 1.56].forEach((radius, index) => {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(radius, index === 0 ? 0.006 : 0.003, 6, 128),
        new THREE.MeshBasicMaterial({
          color: index === 0 ? 0x4ea1e8 : 0x315e89,
          transparent: true,
          opacity: index === 0 ? 0.12 : 0.065,
          depthWrite: false
        })
      );
      haloGroup.add(halo);
    });
    this.scene.add(haloGroup);
    this.specimenHalo = haloGroup;

    this.scanLine = new THREE.Mesh(
      new THREE.PlaneGeometry(2.35, 0.006),
      new THREE.MeshBasicMaterial({ color: 0x79c0ff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.scanLine.position.set(0, -0.34, -0.72);
    this.scene.add(this.scanLine);

    // Build Scene Geometry
    this.buildSoilCrossSection();
    this.rebuildPlantModel();
    this.buildHeatVaporParticles();

    // Resize Handler
    this.handleResize = () => {
      if (!this.container.classList.contains('active')) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this.handleResize);

    this.container.dataset.renderState = 'stopped';
  }

  syncOrbitCamera() {
    if (!this.camera) return;
    const cosElevation = Math.cos(this.orbitElevation);
    this.camera.position.set(
      this.cameraTarget.x + Math.sin(this.orbitAzimuth) * cosElevation * this.orbitRadius,
      this.cameraTarget.y + Math.sin(this.orbitElevation) * this.orbitRadius,
      this.cameraTarget.z + Math.cos(this.orbitAzimuth) * cosElevation * this.orbitRadius
    );
    this.camera.lookAt(this.cameraTarget);
    if (this.container) {
      this.container.dataset.cameraRadius = this.orbitRadius.toFixed(2);
      this.container.dataset.cameraAzimuth = this.orbitAzimuth.toFixed(2);
    }
  }

  buildSoilCrossSection() {
    this.soilGroup = new THREE.Group();
    this.soilGroup.position.set(0, -0.4, 0);

    // 1. Soil Cube Dimensions (Width: 2.2m, Height: 1.1m, Depth: 1.8m)
    const soilWidth = 2.2;
    const soilHeight = 1.0;
    const soilDepth = 1.8;

    // Soil Top Material & Body Material
    this.soilMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.02,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      vertexColors: true
    });

    const soilGeo = new THREE.BoxGeometry(soilWidth, soilHeight, soilDepth, 16, 8, 12);
    const soilPositions = soilGeo.attributes.position;
    const soilColors = [];
    const soilColor = new THREE.Color();
    for (let index = 0; index < soilPositions.count; index += 1) {
      const x = soilPositions.getX(index);
      const y = soilPositions.getY(index);
      const z = soilPositions.getZ(index);
      const layer = THREE.MathUtils.clamp((y + soilHeight * 0.5) / soilHeight, 0, 1);
      const grain = (Math.sin(x * 17.3 + z * 11.8 + index * 1.37) + 1) * 0.5;
      soilColor.setRGB(0.16 + layer * 0.085 + grain * 0.035, 0.085 + layer * 0.055 + grain * 0.024, 0.045 + layer * 0.026 + grain * 0.014);
      soilColors.push(soilColor.r, soilColor.g, soilColor.b);
    }
    soilGeo.setAttribute('color', new THREE.Float32BufferAttribute(soilColors, 3));
    const soilMesh = new THREE.Mesh(soilGeo, this.soilMaterial);
    soilMesh.position.set(0, -soilHeight / 2, 0);
    soilMesh.receiveShadow = true;
    soilMesh.renderOrder = 1;
    this.soilGroup.add(soilMesh);

    const grainGeometry = new THREE.IcosahedronGeometry(0.018, 1);
    const grainMaterial = new THREE.MeshStandardMaterial({ color: 0x886848, roughness: 1, transparent: true, opacity: 0.72 });
    const grains = new THREE.InstancedMesh(grainGeometry, grainMaterial, 96);
    const grainMatrix = new THREE.Matrix4();
    const grainQuaternion = new THREE.Quaternion();
    const grainScale = new THREE.Vector3();
    for (let index = 0; index < 96; index += 1) {
      const px = Math.sin(index * 17.17) * (soilWidth * 0.46);
      const py = -0.05 - ((index * 37) % 91) / 91 * (soilHeight * 0.88);
      const pz = 0.25 + ((index * 53) % 67) / 67 * (soilDepth * 0.38);
      const size = 0.5 + ((index * 19) % 13) / 13;
      grainScale.set(size, size * 0.72, size);
      grainMatrix.compose(new THREE.Vector3(px, py, pz), grainQuaternion, grainScale);
      grains.setMatrixAt(index, grainMatrix);
    }
    grains.renderOrder = 3;
    this.soilGroup.add(grains);

    const horizonColors = [0x332115, 0x4b3020, 0x62452e];
    horizonColors.forEach((color, index) => {
      const horizon = new THREE.Mesh(
        new THREE.BoxGeometry(soilWidth - 0.04, 0.012, soilDepth - 0.04),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62, depthWrite: false })
      );
      horizon.position.set(0, -0.2 - index * 0.27, 0);
      horizon.renderOrder = 2;
      this.soilGroup.add(horizon);
    });

    // 2. Transparent Front Glass Cutaway (剖面观察窗)
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x58a6ff,
      transparent: true,
      opacity: 0.18,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.7,
      ior: 1.4,
      depthWrite: false
    });
    const glassGeo = new THREE.PlaneGeometry(soilWidth + 0.02, soilHeight + 0.02);
    const glassMesh = new THREE.Mesh(glassGeo, glassMaterial);
    glassMesh.position.set(0, -soilHeight / 2, soilDepth / 2 + 0.01);
    glassMesh.renderOrder = 5;
    this.soilGroup.add(glassMesh);

    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(soilWidth + 0.025, soilHeight + 0.025, soilDepth + 0.025)),
      new THREE.LineBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.34, depthWrite: false })
    );
    frame.position.y = -soilHeight / 2;
    frame.renderOrder = 7;
    this.soilGroup.add(frame);

    // 3. Glowing Depth Ruler Ticks (0cm, -15cm, -30cm, -45cm)
    const rulerMaterial = new THREE.LineBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.6 });
    [-0.05, -0.25, -0.5, -0.75].forEach(y => {
      const pts = [
        new THREE.Vector3(-soilWidth / 2, y, soilDepth / 2 + 0.015),
        new THREE.Vector3(-soilWidth / 2 + 0.15, y, soilDepth / 2 + 0.015)
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      this.soilGroup.add(new THREE.Line(lineGeo, rulerMaterial));
    });

    // 4. Underground Root System (地下主根与毛细根系网络)
    this.buildRootNetwork(this.soilGroup);

    // 5. Three-prong in-situ IoT probe inserted to the -30cm horizon.
    const probeGroup = new THREE.Group();
    probeGroup.position.set(0.48, 0, 0.22);
    const probeMetal = new THREE.MeshStandardMaterial({ color: 0xb9c3cc, metalness: 0.86, roughness: 0.24 });
    [-0.055, 0, 0.055].forEach(offset => {
      const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.58, 12), probeMetal);
      prong.position.set(offset, -0.25, 0);
      probeGroup.add(prong);
    });
    const probeHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.11, 0.16, 2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0x202a35, metalness: 0.52, roughness: 0.36 })
    );
    probeHead.position.y = 0.055;
    probeGroup.add(probeHead);
    this.soilGroup.add(probeGroup);

    // Sensor Head LED
    this.sensorLed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0x3fb950, emissive: 0x3fb950, emissiveIntensity: 2.0 })
    );
    this.sensorLed.position.set(0, 0.12, 0.085);
    probeGroup.add(this.sensorLed);

    const crackPositions = [];
    for (let branch = 0; branch < 14; branch += 1) {
      const angle = branch * 2.399;
      const startRadius = 0.08 + (branch % 3) * 0.04;
      const endRadius = 0.35 + (branch % 5) * 0.09;
      crackPositions.push(
        Math.cos(angle) * startRadius, 0.016, Math.sin(angle) * startRadius,
        Math.cos(angle + Math.sin(branch) * 0.22) * endRadius, 0.016, Math.sin(angle + Math.sin(branch) * 0.22) * endRadius
      );
    }
    const crackGeometry = new THREE.BufferGeometry();
    crackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(crackPositions, 3));
    this.droughtCracks = new THREE.LineSegments(
      crackGeometry,
      new THREE.LineBasicMaterial({ color: 0x21150d, transparent: true, opacity: 0.76 })
    );
    this.droughtCracks.visible = false;
    this.soilGroup.add(this.droughtCracks);

    // 6. Surface Water Plane for Flood Scenario
    const waterGeo = new THREE.PlaneGeometry(soilWidth + 0.05, soilDepth + 0.05);
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x388bfd,
      roughness: 0.14,
      metalness: 0.18,
      transmission: 0.2,
      clearcoat: 0.75,
      clearcoatRoughness: 0.18,
      transparent: true,
      opacity: 0.38,
      depthWrite: false
    });
    this.floodWater = new THREE.Mesh(waterGeo, waterMat);
    this.floodWater.rotation.x = -Math.PI / 2;
    this.floodWater.position.set(0, 0.02, 0);
    this.floodWater.visible = false;
    this.soilGroup.add(this.floodWater);

    this.scene.add(this.soilGroup);
  }

  buildRootNetwork(parentGroup) {
    const rootMat = new THREE.MeshStandardMaterial({
      color: 0xeadbb8,
      roughness: 0.82,
      emissive: 0x2c6f72,
      emissiveIntensity: 0.34
    });
    this.rootMaterials.push(rootMat);
    const rootPoints = [
      // Primary taproots
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.1, -0.2, 0.05), new THREE.Vector3(-0.25, -0.45, 0.1), new THREE.Vector3(-0.4, -0.75, 0.15)],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.08, -0.22, -0.05), new THREE.Vector3(0.2, -0.5, 0.02), new THREE.Vector3(0.35, -0.8, -0.1)],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, -0.25, 0.12), new THREE.Vector3(0.05, -0.55, 0.18), new THREE.Vector3(-0.02, -0.85, 0.22)],
      // Lateral fibrous roots
      [new THREE.Vector3(-0.1, -0.2, 0.05), new THREE.Vector3(-0.35, -0.3, 0.12), new THREE.Vector3(-0.55, -0.38, 0.2)],
      [new THREE.Vector3(0.08, -0.22, -0.05), new THREE.Vector3(0.38, -0.32, 0.08), new THREE.Vector3(0.62, -0.42, 0.15)],
      [new THREE.Vector3(-0.25, -0.45, 0.1), new THREE.Vector3(-0.5, -0.58, 0.18)],
      [new THREE.Vector3(0.2, -0.5, 0.02), new THREE.Vector3(0.48, -0.65, 0.12)]
    ];

    for (let index = 0; index < 14; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const depth = 0.18 + (index % 5) * 0.14;
      const angle = index * 1.73;
      rootPoints.push([
        new THREE.Vector3(side * 0.05, -depth, Math.sin(angle) * 0.04),
        new THREE.Vector3(side * (0.24 + (index % 3) * 0.08), -depth - 0.08, Math.cos(angle) * 0.18),
        new THREE.Vector3(side * (0.48 + (index % 4) * 0.07), -depth - 0.16, Math.sin(angle * 1.4) * 0.28)
      ]);
    }

    rootPoints.forEach((curvePts, i) => {
      const curve = new THREE.CatmullRomCurve3(curvePts);
      const radius = i < 3 ? 0.016 : i < 7 ? 0.009 : 0.0045;
      const rootGeo = new THREE.TubeGeometry(curve, 20, radius, 8, false);
      const rootMesh = new THREE.Mesh(rootGeo, rootMat);
      parentGroup.add(rootMesh);
    });
  }

  rebuildPlantModel() {
    if (this.plantGroup) {
      this.scene.remove(this.plantGroup);
      this.plantGroup.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
        else object.material?.dispose?.();
      });
    }

    this.windMaterials = [];
    this.plantGroup = new THREE.Group();
    this.plantGroup.position.set(0, -0.4, 0); // Sits on top of soil surface
    this.leafMeshes = [];
    this.fruitMeshes = [];
    this.flowerMeshes = [];

    const cropCode = this.plotData?.cropCode || 'tomato';

    if (cropCode === 'cucumber') {
      this.buildCucumberSpecimen(this.plantGroup);
    } else if (cropCode === 'corn') {
      this.buildCornSpecimen(this.plantGroup);
    } else if (cropCode === 'rice') {
      this.buildRiceSpecimen(this.plantGroup);
    } else if (cropCode === 'sunflower') {
      this.buildSunflowerSpecimen(this.plantGroup);
    } else if (cropCode === 'strawberry') {
      this.buildStrawberrySpecimen(this.plantGroup);
    } else {
      this.buildTomatoSpecimen(this.plantGroup);
    }

    const cropScale = {
      tomato: 1.06,
      cucumber: 1.04,
      corn: 0.98,
      rice: 1.16,
      sunflower: 1.0,
      strawberry: 2.35
    }[cropCode] || 1;
    this.plantGroup.scale.setScalar(cropScale);
    this.preparePlantDynamics();
    this.scene.add(this.plantGroup);
  }

  createBotanicalLeafGeometry(length, width, options = {}) {
    const segments = options.segments || 18;
    const lobes = options.lobes || 0;
    const curve = options.curve ?? 0.035;
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const taper = Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.72);
      const lobeWave = lobes ? 1 + Math.sin(t * Math.PI * lobes * 2) * 0.13 : 1;
      const halfWidth = Math.max(0.001, width * taper * lobeWave);
      const rise = Math.sin(Math.PI * t) * curve;
      positions.push(-halfWidth, rise, t * length, halfWidth, rise, t * length);
      uvs.push(0, t, 1, t);
      if (index < segments) {
        const a = index * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  addTube(parent, points, radius, material, tubularSegments = 28, radialSegments = 10) {
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false),
      material
    );
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  addStarFlower(parent, position, scale, petalMaterial, centerMaterial) {
    const flower = new THREE.Group();
    flower.position.copy(position);
    const petalGeometry = this.createBotanicalLeafGeometry(scale * 1.7, scale * 0.58, { segments: 8, curve: scale * 0.2 });
    for (let index = 0; index < 5; index += 1) {
      const petal = new THREE.Mesh(petalGeometry, petalMaterial);
      petal.rotation.z = (index / 5) * Math.PI * 2;
      petal.position.z = 0.005;
      flower.add(petal);
      this.flowerMeshes.push(petal);
    }
    const center = new THREE.Mesh(new THREE.SphereGeometry(scale * 0.36, 14, 10), centerMaterial || petalMaterial);
    center.position.z = 0.018;
    flower.add(center);
    parent.add(flower);
    return flower;
  }

  preparePlantDynamics() {
    const dynamicMeshes = [...this.leafMeshes, ...this.fruitMeshes, ...this.flowerMeshes];
    const patchedMaterials = new Set();
    dynamicMeshes.forEach((mesh, index) => {
      mesh.userData.baseRotation = mesh.rotation.clone();
      mesh.userData.baseScale = mesh.scale.clone();
      mesh.userData.baseColor = mesh.material?.color?.clone?.() || null;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.filter(Boolean).forEach(material => {
        if (patchedMaterials.has(material)) return;
        patchedMaterials.add(material);
        material.userData.sandboxWindUniforms = null;
        material.onBeforeCompile = shader => {
          shader.uniforms.uSandboxTime = { value: 0 };
          shader.uniforms.uSandboxWind = { value: 1 };
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `
              #include <common>
              uniform float uSandboxTime;
              uniform float uSandboxWind;
            `)
            .replace('#include <begin_vertex>', `
              vec3 transformed = vec3(position);
              float sandboxWorldY = (modelMatrix * vec4(position, 1.0)).y;
              float sandboxFlex = smoothstep(-0.15, 1.75, sandboxWorldY);
              float sandboxWave = sin(uSandboxTime * 1.55 + sandboxWorldY * 3.6 + modelMatrix[3].x * 2.0);
              float sandboxFlutter = sin(uSandboxTime * 4.2 + position.x * 7.0 + position.z * 5.0);
              transformed.x += sandboxFlex * (sandboxWave * 0.034 + sandboxFlutter * 0.008) * uSandboxWind;
              transformed.z += sandboxFlex * cos(uSandboxTime * 1.17 + sandboxWorldY * 2.8) * 0.018 * uSandboxWind;
            `);
          material.userData.sandboxWindUniforms = shader.uniforms;
        };
        material.customProgramCacheKey = () => 'agriloop-microscopic-wind-v1';
        material.needsUpdate = true;
        this.windMaterials.push(material);
      });
      mesh.userData.windPhase = index * 0.73;
    });
  }

  buildTomatoSpecimen(group) {
    const stemMat = new THREE.MeshPhysicalMaterial({ color: 0x3f8249, roughness: 0.78, sheen: 0.22, sheenColor: 0x91bc8d });
    const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x348849, roughness: 0.68, side: THREE.DoubleSide, sheen: 0.4, sheenColor: 0xa3dfa5 });
    const leafLightMat = leafMat.clone();
    leafLightMat.color.setHex(0x48a259);
    const fruitGreenMat = new THREE.MeshPhysicalMaterial({ color: 0x70a944, roughness: 0.3, clearcoat: 0.28, clearcoatRoughness: 0.45 });
    const fruitBlushMat = new THREE.MeshPhysicalMaterial({ color: 0xd9582f, roughness: 0.26, clearcoat: 0.38, clearcoatRoughness: 0.32 });
    const fruitRedMat = new THREE.MeshPhysicalMaterial({ color: 0xe1252f, roughness: 0.22, clearcoat: 0.48, clearcoatRoughness: 0.28 });
    const flowerMat = new THREE.MeshPhysicalMaterial({ color: 0xf6ce36, roughness: 0.5, side: THREE.DoubleSide });
    const calyxMat = new THREE.MeshStandardMaterial({ color: 0x2f7637, roughness: 0.72, side: THREE.DoubleSide });

    this.addTube(group, [
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.035, 0.36, 0.01),
      new THREE.Vector3(-0.025, 0.72, 0.035), new THREE.Vector3(0.045, 1.08, -0.015),
      new THREE.Vector3(-0.02, 1.42, 0.02), new THREE.Vector3(0.03, 1.78, 0)
    ], 0.027, stemMat, 42, 12);

    // Trellis stays behind the specimen instead of splitting the visual axis.
    const stake = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.016, 1.92, 12),
      new THREE.MeshStandardMaterial({ color: 0x9b7b4e, roughness: 0.92 })
    );
    stake.position.set(-0.32, 0.94, -0.24);
    stake.rotation.z = -0.025;
    stake.castShadow = true;
    group.add(stake);

    const leafGeometry = this.createBotanicalLeafGeometry(0.22, 0.082, { segments: 18, lobes: 4, curve: 0.03 });
    const terminalGeometry = this.createBotanicalLeafGeometry(0.28, 0.102, { segments: 20, lobes: 4, curve: 0.04 });
    const leafLevels = [0.28, 0.48, 0.69, 0.9, 1.1, 1.3, 1.5, 1.67];
    leafLevels.forEach((y, level) => {
      const angle = 0.55 + level * 2.28;
      const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const branchLength = 0.39 + (level % 3) * 0.04;
      this.addTube(group, [
        new THREE.Vector3(0, y, 0),
        direction.clone().multiplyScalar(branchLength * 0.52).add(new THREE.Vector3(0, y + 0.035, 0)),
        direction.clone().multiplyScalar(branchLength).add(new THREE.Vector3(0, y + 0.015, 0))
      ], 0.009, stemMat, 16, 7);

      [0.32, 0.56, 0.77].forEach((distance, leafletIndex) => {
        [-1, 1].forEach(side => {
          const leaf = new THREE.Mesh(leafGeometry, (level + leafletIndex) % 2 ? leafMat : leafLightMat);
          const branchPoint = direction.clone().multiplyScalar(branchLength * distance);
          const perpendicular = new THREE.Vector3(direction.z, 0, -direction.x).multiplyScalar(side * 0.025);
          leaf.position.copy(branchPoint.add(perpendicular)).add(new THREE.Vector3(0, y + 0.01 + leafletIndex * 0.008, 0));
          leaf.rotation.set(-0.34 + leafletIndex * 0.035, angle + side * (0.72 - leafletIndex * 0.12), side * 0.06);
          leaf.castShadow = true;
          group.add(leaf);
          this.leafMeshes.push(leaf);
        });
      });

      const terminal = new THREE.Mesh(terminalGeometry, level % 2 ? leafLightMat : leafMat);
      terminal.position.copy(direction.clone().multiplyScalar(branchLength)).add(new THREE.Vector3(0, y + 0.01, 0));
      terminal.rotation.set(-0.31, angle, 0);
      terminal.castShadow = true;
      group.add(terminal);
      this.leafMeshes.push(terminal);
    });

    const fruitClusters = [
      { y: 0.58, angle: 1.25, mat: fruitRedMat, count: 4 },
      { y: 0.92, angle: 4.05, mat: fruitBlushMat, count: 3 },
      { y: 1.24, angle: 0.15, mat: fruitGreenMat, count: 4 }
    ];

    fruitClusters.forEach(cluster => {
      const clusterGroup = new THREE.Group();
      const direction = new THREE.Vector3(Math.sin(cluster.angle), 0, Math.cos(cluster.angle));
      clusterGroup.position.set(direction.x * 0.08, cluster.y, direction.z * 0.08);
      clusterGroup.rotation.y = cluster.angle;
      this.addTube(clusterGroup, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.025, 0.13), new THREE.Vector3(0, -0.06, 0.24)], 0.006, stemMat, 12, 6);

      for (let index = 0; index < cluster.count; index += 1) {
        const radius = 0.061 + (index % 2) * 0.008;
        const fruitMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 18), cluster.mat);
        fruitMesh.scale.y = 0.94;
        fruitMesh.position.set((index - (cluster.count - 1) / 2) * 0.07, -0.08 - (index % 2) * 0.045, 0.2 + index * 0.035);
        fruitMesh.castShadow = true;
        clusterGroup.add(fruitMesh);
        this.fruitMeshes.push(fruitMesh);

        const calyxGeometry = this.createBotanicalLeafGeometry(radius * 0.85, radius * 0.24, { segments: 6, curve: radius * 0.08 });
        for (let petal = 0; petal < 5; petal += 1) {
          const sepal = new THREE.Mesh(calyxGeometry, calyxMat);
          sepal.position.copy(fruitMesh.position).add(new THREE.Vector3(0, radius * 0.72, 0));
          sepal.rotation.set(Math.PI / 2, 0, (petal / 5) * Math.PI * 2);
          clusterGroup.add(sepal);
        }
      }

      group.add(clusterGroup);
    });

    [1.42, 1.6, 1.72].forEach((y, index) => {
      const angle = 2.2 + index * 1.05;
      const flower = this.addStarFlower(group, new THREE.Vector3(Math.sin(angle) * 0.14, y, Math.cos(angle) * 0.14), 0.052, flowerMat, calyxMat);
      flower.rotation.set(0.12, angle, 0);
    });
  }

  buildCucumberSpecimen(group) {
    const stemMat = new THREE.MeshPhysicalMaterial({ color: 0x3a8344, roughness: 0.76, sheen: 0.2 });
    const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x2d8241, roughness: 0.7, side: THREE.DoubleSide, sheen: 0.3, sheenColor: 0x8bcf86 });
    const cukeMat = new THREE.MeshPhysicalMaterial({ color: 0x25713d, roughness: 0.48, clearcoat: 0.16 });
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffcf35, roughness: 0.5, side: THREE.DoubleSide });
    this.addTube(group, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, 0.42, 0), new THREE.Vector3(-0.03, 0.85, 0.03), new THREE.Vector3(0.08, 1.3, -0.02), new THREE.Vector3(0, 1.76, 0)], 0.023, stemMat, 40, 10);
    const leafGeometry = this.createBotanicalLeafGeometry(0.34, 0.19, { segments: 22, lobes: 5, curve: 0.055 });
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.18 + 0.4;
      const leaf = new THREE.Mesh(leafGeometry, leafMat);
      leaf.position.set(Math.sin(angle) * 0.08, 0.28 + i * 0.215, Math.cos(angle) * 0.08);
      leaf.rotation.set(-0.42, angle, Math.sin(i) * 0.08);
      leaf.castShadow = true;
      group.add(leaf);
      this.leafMeshes.push(leaf);
      const tendrilPoints = [];
      for (let step = 0; step < 12; step += 1) {
        const t = step / 11;
        tendrilPoints.push(new THREE.Vector3(Math.sin(angle) * 0.08 + Math.cos(t * Math.PI * 3) * 0.035, 0.31 + i * 0.215 + t * 0.13, Math.cos(angle) * 0.08 + Math.sin(t * Math.PI * 3) * 0.035));
      }
      this.addTube(group, tendrilPoints, 0.003, stemMat, 18, 5);
    }

    [0.68, 1.04, 1.31].forEach((y, index) => {
      const cuke = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.22 + index * 0.018, 8, 20), cukeMat);
      const angle = 0.8 + index * 2.2;
      cuke.position.set(Math.sin(angle) * 0.19, y, Math.cos(angle) * 0.19);
      cuke.rotation.z = -0.13 + index * 0.06;
      group.add(cuke);
      this.fruitMeshes.push(cuke);
      const flower = this.addStarFlower(group, new THREE.Vector3(Math.sin(angle + 0.6) * 0.17, y + 0.17, Math.cos(angle + 0.6) * 0.17), 0.05, flowerMat, stemMat);
      flower.rotation.y = angle;
    });
  }

  buildCornSpecimen(group) {
    const stalkMat = new THREE.MeshPhysicalMaterial({ color: 0x4b9146, roughness: 0.73, sheen: 0.2 });
    const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x3b823c, roughness: 0.7, side: THREE.DoubleSide, sheen: 0.26 });
    const cobMat = new THREE.MeshStandardMaterial({ color: 0xa3b83f, roughness: 0.72 });
    const silkMat = new THREE.MeshStandardMaterial({ color: 0xd7b060, roughness: 0.85 });
    this.addTube(group, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 0.62, 0), new THREE.Vector3(-0.015, 1.28, 0), new THREE.Vector3(0.01, 1.95, 0)], 0.046, stalkMat, 42, 14);
    const leafGeometry = this.createBotanicalLeafGeometry(0.72, 0.09, { segments: 28, curve: 0.1 });
    for (let i = 0; i < 8; i++) {
      const angle = i * 2.35;
      const leaf = new THREE.Mesh(leafGeometry, leafMat);
      leaf.position.set(Math.sin(angle) * 0.035, 0.27 + i * 0.205, Math.cos(angle) * 0.035);
      leaf.rotation.set(-0.5 - i * 0.025, angle, Math.sin(i * 1.7) * 0.08);
      group.add(leaf);
      this.leafMeshes.push(leaf);
    }

    const cob = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.27, 8, 18), cobMat);
    cob.position.set(0.13, 1.08, 0.08);
    cob.rotation.z = -0.32;
    group.add(cob);
    this.fruitMeshes.push(cob);
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      this.addTube(group, [new THREE.Vector3(0, 1.92, 0), new THREE.Vector3(Math.sin(angle) * 0.08, 2.05, Math.cos(angle) * 0.08), new THREE.Vector3(Math.sin(angle) * 0.17, 2.14 - (i % 2) * 0.04, Math.cos(angle) * 0.17)], 0.004, silkMat, 12, 5);
    }
  }

  buildRiceSpecimen(group) {
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x789b43, roughness: 0.76 });
    const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x6d9a42, roughness: 0.68, side: THREE.DoubleSide, sheen: 0.25 });
    const grainMat = new THREE.MeshStandardMaterial({ color: 0xd2ac48, roughness: 0.74 });
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const height = 0.94 + (i % 4) * 0.09;
      const blade = new THREE.Mesh(this.createBotanicalLeafGeometry(height, 0.018, { segments: 20, curve: 0.065 + (i % 3) * 0.02 }), leafMat);
      blade.position.set(Math.cos(angle) * 0.075, 0, Math.sin(angle) * 0.075);
      blade.rotation.set(-Math.PI / 2 + 0.12 + (i % 3) * 0.05, angle, Math.sin(angle) * 0.1);
      group.add(blade);
      this.leafMeshes.push(blade);
      if (i % 3 === 0) {
        const stalkTop = new THREE.Vector3(Math.cos(angle) * 0.05, 1.22 + (i % 2) * 0.05, Math.sin(angle) * 0.05);
        this.addTube(group, [new THREE.Vector3(Math.cos(angle) * 0.045, 0, Math.sin(angle) * 0.045), new THREE.Vector3(Math.cos(angle) * 0.04, 0.72, Math.sin(angle) * 0.04), stalkTop], 0.006, stemMat, 22, 6);
        for (let grain = 0; grain < 7; grain += 1) {
          const side = grain % 2 ? -1 : 1;
          const seed = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.025, 4, 8), grainMat);
          seed.position.copy(stalkTop).add(new THREE.Vector3(side * (0.018 + grain * 0.006), -grain * 0.035, Math.sin(grain) * 0.018));
          seed.rotation.z = side * 0.45;
          group.add(seed);
          this.fruitMeshes.push(seed);
        }
      }
    }
  }

  buildSunflowerSpecimen(group) {
    const stalkMat = new THREE.MeshPhysicalMaterial({ color: 0x477b3d, roughness: 0.86, sheen: 0.16 });
    const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x438b4b, roughness: 0.74, side: THREE.DoubleSide, sheen: 0.3, sheenColor: 0x91c78f });
    const flowerMat = new THREE.MeshPhysicalMaterial({ color: 0xf5bd24, roughness: 0.48, side: THREE.DoubleSide });
    const discMat = new THREE.MeshStandardMaterial({ color: 0x4a2c11, roughness: 0.9 });
    this.addTube(group, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.015, 0.75, 0), new THREE.Vector3(-0.01, 1.5, 0), new THREE.Vector3(0, 1.72, 0)], 0.042, stalkMat, 36, 14);
    const leafGeometry = this.createBotanicalLeafGeometry(0.46, 0.19, { segments: 24, lobes: 2, curve: 0.06 });
    for (let index = 0; index < 7; index += 1) {
      const angle = index * 2.35;
      const leaf = new THREE.Mesh(leafGeometry, leafMat);
      leaf.position.set(Math.sin(angle) * 0.045, 0.34 + index * 0.18, Math.cos(angle) * 0.045);
      leaf.rotation.set(-0.42, angle, Math.sin(index) * 0.12);
      group.add(leaf);
      this.leafMeshes.push(leaf);
    }
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.07, 36), discMat);
    disc.position.set(0, 1.73, 0.08);
    disc.rotation.x = Math.PI / 2;
    group.add(disc);
    const petalGeometry = new THREE.SphereGeometry(1, 16, 8);
    petalGeometry.scale(0.043, 0.13, 0.012);
    for (let index = 0; index < 30; index += 1) {
      const angle = (index / 30) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeometry, flowerMat);
      petal.position.set(Math.cos(angle) * 0.268, 1.73 + Math.sin(angle) * 0.268, 0.145);
      petal.rotation.z = angle - Math.PI / 2;
      group.add(petal);
      this.flowerMeshes.push(petal);
    }
    const seedGeometry = new THREE.SphereGeometry(0.009, 7, 5);
    const seedMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5725, roughness: 0.88 });
    const seeds = new THREE.InstancedMesh(seedGeometry, seedMaterial, 96);
    const seedMatrix = new THREE.Matrix4();
    for (let index = 0; index < 96; index += 1) {
      const radius = 0.0135 * Math.sqrt(index);
      const angle = index * 2.39996;
      seedMatrix.makeTranslation(Math.cos(angle) * radius, 1.73 + Math.sin(angle) * radius, 0.158);
      seeds.setMatrixAt(index, seedMatrix);
    }
    group.add(seeds);
  }

  buildStrawberrySpecimen(group) {
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x497c3e, roughness: 0.8 });
    const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x2f7c3c, roughness: 0.72, side: THREE.DoubleSide, sheen: 0.3 });
    const berryMat = new THREE.MeshPhysicalMaterial({ color: 0xd92536, roughness: 0.3, clearcoat: 0.38 });
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xf8f6e9, roughness: 0.62, side: THREE.DoubleSide });
    const centerMat = new THREE.MeshStandardMaterial({ color: 0xf2c83a, roughness: 0.68 });
    const leafGeometry = this.createBotanicalLeafGeometry(0.2, 0.09, { segments: 18, lobes: 5, curve: 0.025 });
    for (let cluster = 0; cluster < 5; cluster += 1) {
      const angle = (cluster / 5) * Math.PI * 2;
      this.addTube(group, [new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(Math.sin(angle) * 0.1, 0.18, Math.cos(angle) * 0.1), new THREE.Vector3(Math.sin(angle) * 0.18, 0.24, Math.cos(angle) * 0.18)], 0.007, stemMat, 14, 6);
      for (let leaflet = -1; leaflet <= 1; leaflet += 1) {
        const leaf = new THREE.Mesh(leafGeometry, leafMat);
        leaf.position.set(Math.sin(angle) * 0.17, 0.22, Math.cos(angle) * 0.17);
        leaf.rotation.set(-0.42, angle + leaflet * 0.58, leaflet * 0.08);
        group.add(leaf);
        this.leafMeshes.push(leaf);
      }
    }
    const berryProfile = [
      new THREE.Vector2(0.004, -0.062), new THREE.Vector2(0.024, -0.048),
      new THREE.Vector2(0.044, -0.018), new THREE.Vector2(0.054, 0.018),
      new THREE.Vector2(0.048, 0.047), new THREE.Vector2(0.026, 0.062),
      new THREE.Vector2(0.008, 0.064)
    ];
    const berryGeometry = new THREE.LatheGeometry(berryProfile, 28);
    const seedMat = new THREE.MeshStandardMaterial({ color: 0xf0c84a, roughness: 0.58 });
    [0.25, 2.2, 4.1, 5.2].forEach((angle, index) => {
      this.addTube(group, [new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(Math.sin(angle) * 0.19, 0.14, Math.cos(angle) * 0.19), new THREE.Vector3(Math.sin(angle) * 0.29, 0.1, Math.cos(angle) * 0.29)], 0.005, stemMat, 12, 5);
      const berry = new THREE.Mesh(berryGeometry, berryMat);
      berry.position.set(Math.sin(angle) * 0.3, 0.07, Math.cos(angle) * 0.3);
      berry.rotation.z = Math.sin(index * 1.7) * 0.16;
      group.add(berry);
      this.fruitMeshes.push(berry);
      const calyxGeometry = this.createBotanicalLeafGeometry(0.045, 0.012, { segments: 6, curve: 0.004 });
      for (let calyxIndex = 0; calyxIndex < 5; calyxIndex += 1) {
        const sepal = new THREE.Mesh(calyxGeometry, leafMat);
        sepal.position.copy(berry.position).add(new THREE.Vector3(0, 0.064, 0));
        sepal.rotation.set(Math.PI / 2, 0, (calyxIndex / 5) * Math.PI * 2);
        group.add(sepal);
      }
      for (let seedIndex = 0; seedIndex < 10; seedIndex += 1) {
        const seedAngle = seedIndex * 2.399;
        const seedY = -0.035 + (seedIndex % 5) * 0.017;
        const seedRadius = 0.047 * (1 - Math.abs(seedY) * 5.4);
        const seed = new THREE.Mesh(new THREE.SphereGeometry(0.0038, 6, 5), seedMat);
        seed.position.copy(berry.position).add(new THREE.Vector3(Math.cos(seedAngle) * seedRadius, seedY, Math.sin(seedAngle) * seedRadius));
        group.add(seed);
      }
      if (index < 2) {
        const flower = this.addStarFlower(group, new THREE.Vector3(Math.sin(angle + 0.65) * 0.27, 0.19, Math.cos(angle + 0.65) * 0.27), 0.045, flowerMat, centerMat);
        flower.rotation.x = -0.3;
      }
    });
  }

  buildHeatVaporParticles() {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1.8;
      pos[i * 3 + 1] = Math.random() * 1.8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const particleCanvas = document.createElement('canvas');
    particleCanvas.width = 48;
    particleCanvas.height = 48;
    const particleContext = particleCanvas.getContext('2d');
    const particleGradient = particleContext.createRadialGradient(24, 24, 1, 24, 24, 23);
    particleGradient.addColorStop(0, 'rgba(255,255,255,0.82)');
    particleGradient.addColorStop(0.35, 'rgba(232,246,255,0.46)');
    particleGradient.addColorStop(1, 'rgba(232,246,255,0)');
    particleContext.fillStyle = particleGradient;
    particleContext.fillRect(0, 0, 48, 48);
    const particleTexture = new THREE.CanvasTexture(particleCanvas);
    const mat = new THREE.PointsMaterial({
      color: 0xe6f5ff,
      size: 0.075,
      map: particleTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.heatParticles = new THREE.Points(geo, mat);
    this.scene.add(this.heatParticles);
  }

  runScenario(scenarioKey) {
    this.activeScenario = scenarioKey;
    const scenario = SCENARIO_PRESETS[scenarioKey] || SCENARIO_PRESETS.normal;
    this.container.dataset.scenario = scenarioKey;

    // Update UI Elements
    this.container.querySelectorAll('[data-scenario]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.scenario === scenarioKey);
    });

    const timeVal = this.container.querySelector('[data-time-val]');
    const gaugeProg = this.container.querySelector('[data-gauge-progress]');
    const gaugeTitle = this.container.querySelector('[data-gauge-title]');
    const gaugeDesc = this.container.querySelector('[data-gauge-desc]');
    const tickerLoss = this.container.querySelector('[data-ticker-loss]');
    const tickerBenefit = this.container.querySelector('[data-ticker-benefit]');

    if (timeVal) timeVal.textContent = scenario.timeToRiskMinutes >= 999 ? '∞' : scenario.timeToRiskMinutes;
    if (gaugeTitle) gaugeTitle.textContent = scenario.timeToRiskMinutes >= 999 ? '状态安全正常' : 'Time-to-Risk 倒计时';
    if (gaugeDesc) gaugeDesc.textContent = scenario.desc;
    if (tickerLoss) tickerLoss.textContent = scenario.trackA_loss;
    if (tickerBenefit) tickerBenefit.textContent = scenario.trackB_benefit;

    const actionLabel = this.container.querySelector('[data-btn-prescribe] span');
    if (actionLabel) {
      actionLabel.textContent = scenarioKey === 'drift'
        ? '生成复测与传感器校准工单'
        : scenarioKey === 'flood'
          ? '生成排涝与根际复氧工单'
          : scenarioKey === 'stuck'
            ? '切换备用支管并派发应急工单'
            : '一键生成智能灌溉处方';
    }

    // Circle progress offset
    if (gaugeProg) {
      const pct = Math.min(1.0, scenario.timeToRiskMinutes / 200);
      gaugeProg.style.strokeDashoffset = String(200 - pct * 160);
      gaugeProg.style.stroke = scenario.timeToRiskMinutes < 60 ? '#f85149' : scenario.timeToRiskMinutes < 120 ? '#d29922' : '#3fb950';
    }

    // Diagnostic List
    const diagContainer = this.container.querySelector('[data-diag-list]');
    if (diagContainer) {
      diagContainer.innerHTML = scenario.rootCauses.map(c => `
        <div class="sandbox-diag-item">
          <span class="sandbox-diag-name">${c.name}</span>
          <div class="sandbox-diag-bar-wrap">
            <div class="sandbox-diag-bar-bg">
              <div class="sandbox-diag-bar-fill" style="width: ${c.prob}%; background: ${c.color};"></div>
            </div>
            <span class="sandbox-diag-val" style="color: ${c.color};">${c.prob}%</span>
          </div>
        </div>
      `).join('');
    }

    this.updateForecastChart(scenario);

    // Reset timeline slider to 0h
    this.replayTime = 0;
    const slider = this.container.querySelector('[data-timeline-slider]');
    if (slider) slider.value = 0;
    this.updateTimelineMorphing(0);
  }

  updateForecastChart(scenario) {
    const maxValue = this.activeScenario === 'flood' ? 100 : 50;
    const toY = value => 104 - (Math.max(0, Math.min(maxValue, value)) / maxValue) * 84;
    const xValues = [20, 100, 180, 300];
    const curve = scenario.forecastCurve;
    const median = curve.map((point, index) => `${xValues[index]},${toY(point.val).toFixed(1)}`);
    const upper = curve.map((point, index) => `${xValues[index]},${toY(point.upper).toFixed(1)}`);
    const lower = curve.map((point, index) => `${xValues[index]},${toY(point.lower).toFixed(1)}`).reverse();
    const polygon = this.container.querySelector('[data-chart-polygon]');
    const line = this.container.querySelector('[data-chart-line]');
    if (polygon) polygon.setAttribute('points', [...upper, ...lower].join(' '));
    if (line) line.setAttribute('d', `M ${median.join(' L ')}`);
    [0, 1, 2, 4].forEach((horizon, index) => {
      const point = this.container.querySelector(`[data-point-${horizon}]`);
      if (!point) return;
      point.setAttribute('cx', String(xValues[index]));
      point.setAttribute('cy', String(toY(curve[index].val).toFixed(1)));
      point.setAttribute('fill', curve[index].val <= 14 ? '#f85149' : '#ffffff');
    });
    const safeBand = this.container.querySelector('[data-safe-band]');
    const safeLabel = this.container.querySelector('[data-safe-label]');
    const safeTop = toY(40);
    const safeBottom = toY(20);
    safeBand?.setAttribute('y', String(safeTop.toFixed(1)));
    safeBand?.setAttribute('height', String((safeBottom - safeTop).toFixed(1)));
    safeLabel?.setAttribute('y', String((safeTop + 12).toFixed(1)));
    const wiltY = toY(14);
    const wiltLine = this.container.querySelector('[data-wilt-line]');
    const wiltLabel = this.container.querySelector('[data-wilt-label]');
    wiltLine?.setAttribute('y1', String(wiltY.toFixed(1)));
    wiltLine?.setAttribute('y2', String(wiltY.toFixed(1)));
    wiltLabel?.setAttribute('y', String((wiltY - 4).toFixed(1)));
  }

  forecastValueAt(scenario, timeHours) {
    const curve = scenario.forecastCurve;
    if (timeHours <= curve[0].t) return curve[0].val;
    for (let index = 1; index < curve.length; index += 1) {
      if (timeHours <= curve[index].t) {
        const previous = curve[index - 1];
        const next = curve[index];
        const ratio = (timeHours - previous.t) / Math.max(0.001, next.t - previous.t);
        return previous.val + (next.val - previous.val) * ratio;
      }
    }
    return curve[curve.length - 1].val;
  }

  updateTelemetry(scenario, timeHours, soilMoisture, wilting, chlorosis) {
    const values = {
      temperature: `${scenario.temp.toFixed(1)}°C`,
      moisture: `${soilMoisture.toFixed(1)}%`,
      light: `${this.activeScenario === 'flood' ? 12 : this.activeScenario === 'heatwave' ? 62 : 48} klux`,
      vpd: `${(0.6108 * Math.exp((17.27 * scenario.temp) / (scenario.temp + 237.3)) * (1 - scenario.humidity / 100)).toFixed(1)} kPa`
    };
    Object.entries(values).forEach(([key, value]) => {
      const target = this.container.querySelector(`[data-telemetry="${key}"] b`);
      if (target) target.textContent = value;
    });
    const sequence = this.container.querySelector('[data-sequence-time]');
    if (sequence) sequence.textContent = `T+${timeHours.toFixed(1)}h / 4.0h`;
    const health = Math.max(35, Math.round((this.plotData?.healthScore || 0.98) * 100 - wilting * 38 - chlorosis * 24));
    const healthNode = this.container.querySelector('[data-crop-health]');
    if (healthNode) {
      healthNode.textContent = `${health}%`;
      healthNode.style.color = health < 60 ? '#f85149' : health < 82 ? '#d29922' : '#3fb950';
    }
  }

  updateTimelineMorphing(timeHours) {
    this.replayTime = timeHours;
    const timeDisplay = this.container.querySelector('[data-time-display]');
    if (timeDisplay) timeDisplay.textContent = `+${timeHours.toFixed(1)} 小时 (${timeHours === 0 ? '当前时点' : '推演态'})`;

    const isTrackA = this.replayTrack === 'trackA';
    const s = this.activeScenario;
    const scenario = SCENARIO_PRESETS[s] || SCENARIO_PRESETS.normal;

    let wilting = 0.0;
    let chlorosis = 0.0;
    let soilWetness = 0.5;
    let heatVaporOpacity = 0.0;
    let floodVisible = false;
    let sensorError = false;
    let actuatorFault = false;

    if (s === 'drought') {
      if (isTrackA) {
        wilting = Math.min(1.0, (timeHours / 4.0) * 1.2);
        chlorosis = Math.min(1.0, (timeHours / 4.0) * 0.85);
        soilWetness = Math.max(0.05, 0.4 - timeHours * 0.09);
        heatVaporOpacity = 0.08;
      } else {
        wilting = timeHours < 0.8 ? 0.3 * (1 - timeHours / 0.8) : 0.0;
        soilWetness = timeHours < 0.5 ? 0.4 : 0.75;
      }
    } else if (s === 'heatwave') {
      if (isTrackA) {
        wilting = Math.min(1.0, (timeHours / 3.0) * 1.3);
        chlorosis = Math.min(1.0, (timeHours / 3.0) * 0.95);
        heatVaporOpacity = Math.min(0.85, 0.4 + timeHours * 0.15);
      } else {
        wilting = timeHours < 0.6 ? 0.4 * (1 - timeHours / 0.6) : 0.0;
        heatVaporOpacity = 0.1;
      }
    } else if (s === 'flood') {
      floodVisible = isTrackA || timeHours < 1.15;
      soilWetness = isTrackA ? 0.95 : Math.max(0.62, 0.95 - timeHours * 0.22);
      chlorosis = isTrackA ? Math.min(0.7, (timeHours / 4.0) * 0.8) : Math.max(0, 0.18 - timeHours * 0.18);
    } else if (s === 'drift') {
      sensorError = true;
      wilting = 0.0;
      chlorosis = 0.0;
      soilWetness = 0.65;
    } else if (s === 'stuck') {
      actuatorFault = true;
      if (isTrackA) {
        wilting = Math.min(1, timeHours / 3.2);
        chlorosis = Math.min(0.82, timeHours / 4.4);
        soilWetness = Math.max(0.08, 0.36 - timeHours * 0.075);
      } else {
        wilting = Math.max(0, 0.26 - timeHours * 0.28);
        soilWetness = timeHours < 0.7 ? 0.36 : 0.7;
      }
    }

    this.leafMeshes.forEach(leaf => {
      const baseColor = leaf.userData.baseColor;
      if (leaf.material?.color && baseColor) {
        leaf.material.color.copy(baseColor).lerp(new THREE.Color(0x9b6c2d), chlorosis * 0.82);
      }
      const baseRotation = leaf.userData.baseRotation;
      const baseScale = leaf.userData.baseScale;
      if (baseRotation) leaf.rotation.set(baseRotation.x + wilting * 0.72, baseRotation.y, baseRotation.z + wilting * 0.08);
      if (baseScale) leaf.scale.copy(baseScale).multiplyScalar(1 - wilting * 0.17);
    });

    if (this.soilMaterial) {
      const floodTint = floodVisible;
      this.soilMaterial.color.setRGB(
        floodTint ? 0.64 : 0.8 + (1 - soilWetness) * 0.34,
        floodTint ? 0.76 : 0.72 + (1 - soilWetness) * 0.24,
        floodTint ? 0.9 : 0.64 + (1 - soilWetness) * 0.16
      );
      this.soilMaterial.opacity = 0.64 + soilWetness * 0.12;
    }

    if (this.floodWater) this.floodWater.visible = floodVisible;
    if (this.droughtCracks) {
      this.droughtCracks.visible = soilWetness < 0.26;
      this.droughtCracks.material.opacity = Math.min(0.9, (0.28 - soilWetness) * 4.6);
    }
    if (this.heatParticles && this.heatParticles.material) {
      this.heatParticles.material.opacity = heatVaporOpacity;
      this.heatParticles.visible = heatVaporOpacity > 0.01;
    }

    if (this.sensorLed && this.sensorLed.material) {
      if (sensorError) {
        this.sensorLed.material.color.setHex(0xd29922);
        this.sensorLed.material.emissive.setHex(0xd29922);
      } else if (actuatorFault || wilting > 0.4) {
        this.sensorLed.material.color.setHex(0xf85149);
        this.sensorLed.material.emissive.setHex(0xf85149);
      } else {
        this.sensorLed.material.color.setHex(0x3fb950);
        this.sensorLed.material.emissive.setHex(0x3fb950);
        this.sensorLed.material.emissiveIntensity = 2;
      }
    }

    this.rootMaterials.forEach(material => {
      material.emissive.setHex(floodVisible ? 0x2478a8 : sensorError ? 0xd29922 : wilting > 0.35 ? 0xb66a2a : 0x2c6f72);
      material.emissiveIntensity = 0.32 + (1 - wilting) * 0.18;
    });

    let soilMoisture = this.forecastValueAt(scenario, timeHours);
    if (!isTrackA && ['drought', 'heatwave', 'stuck'].includes(s) && timeHours > 0.45) {
      soilMoisture += (30 - soilMoisture) * Math.min(1, (timeHours - 0.45) / 0.9);
    } else if (!isTrackA && s === 'flood') {
      soilMoisture = Math.max(48, soilMoisture - timeHours * 11);
    }
    this.updateTelemetry(scenario, timeHours, soilMoisture, wilting, chlorosis);

    const timeValue = this.container.querySelector('[data-time-val]');
    const gaugeTitle = this.container.querySelector('[data-gauge-title]');
    if (timeValue && gaugeTitle) {
      if (scenario.timeToRiskMinutes >= 999 || (!isTrackA && timeHours >= 0.75)) {
        timeValue.textContent = '∞';
        gaugeTitle.textContent = !isTrackA && timeHours >= 0.75 ? '处方介入 · 风险解除' : '状态安全正常';
      } else {
        timeValue.textContent = String(Math.max(0, Math.round(scenario.timeToRiskMinutes - timeHours * 60)));
        gaugeTitle.textContent = 'Time-to-Risk 倒计时';
      }
    }

    this.currentMorph = { wilting, chlorosis, soilWetness, floodVisible, sensorError, actuatorFault, soilMoisture };
    this.container.dataset.wilting = wilting.toFixed(2);
    this.container.dataset.soilMoisture = soilMoisture.toFixed(1);
    this.container.dataset.flood = String(floodVisible);
  }

  updateCropInfo() {
    const cropCode = this.plotData?.cropCode || 'tomato';
    const cfg = CROP_MODELS[cropCode] || CROP_MODELS.tomato;

    const plotName = this.container.querySelector('[data-plot-name]');
    const cropVar = this.container.querySelector('[data-crop-variety]');
    const scientific = this.container.querySelector('[data-crop-scientific]');
    const cropStage = this.container.querySelector('[data-crop-stage]');
    const cropHealth = this.container.querySelector('[data-crop-health]');

    if (plotName) plotName.textContent = this.plotData?.name || 'A01 番茄示范田';
    if (cropVar) cropVar.textContent = this.plotData?.cropVariety || cfg.name;
    if (scientific) scientific.textContent = cfg.scientific;
    if (cropStage) cropStage.textContent = this.plotData?.stageLabel || '果实成熟期';
    if (cropHealth) cropHealth.textContent = `${Math.round((this.plotData?.healthScore || 0.98) * 100)}%`;
  }

  bindEvents() {
    // Exit Button
    this.container.querySelector('[data-btn-exit]')?.addEventListener('click', () => {
      this.close();
      this.onExit();
    });

    // Scenario Injection Buttons
    this.container.querySelectorAll('[data-scenario]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.scenario;
        this.runScenario(s);
      });
    });

    // Dual-Track Tabs (Track A vs Track B)
    this.container.querySelectorAll('[data-track]').forEach(tab => {
      tab.addEventListener('click', () => {
        this.replayTrack = tab.dataset.track;
        this.container.querySelectorAll('[data-track]').forEach(t => t.classList.toggle('active', t === tab));
        this.updateTimelineMorphing(this.replayTime);
      });
    });

    // Timeline Slider Drag
    const slider = this.container.querySelector('[data-timeline-slider]');
    if (slider) {
      slider.addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        this.updateTimelineMorphing(val);
      });
    }

    // Play / Pause Animation
    const playBtn = this.container.querySelector('[data-btn-play]');
    const playIcon = this.container.querySelector('[data-play-icon]');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.isPlaying = !this.isPlaying;
        if (playIcon) playIcon.className = this.isPlaying ? 'ph ph-pause' : 'ph ph-play';
      });
    }

    this.container.querySelector('[data-speed]')?.addEventListener('click', event => {
      this.playSpeed = this.playSpeed === 1 ? 2 : 1;
      event.currentTarget.textContent = `${this.playSpeed}×`;
    });

    // Prescribe Action Button
    this.container.querySelector('[data-btn-prescribe]')?.addEventListener('click', () => {
      this.onPrescribe(this.plotId, this.activeScenario);
    });

    // Lightweight orbit controls: left drag rotates, right drag pans, wheel zooms.
    let isDragging = false;
    let dragButton = 0;
    let prevX = 0;
    let prevY = 0;
    const vp = this.container.querySelector('[data-canvas-viewport]');

    this.handleSandboxPointerDown = e => {
      isDragging = true;
      dragButton = e.button;
      prevX = e.clientX;
      prevY = e.clientY;
      vp.setPointerCapture?.(e.pointerId);
      vp.dataset.dragMode = dragButton === 2 ? 'pan' : 'orbit';
    };

    this.handleSandboxPointerUp = e => {
      isDragging = false;
      vp.releasePointerCapture?.(e.pointerId);
      delete vp.dataset.dragMode;
    };

    this.handleSandboxPointerMove = e => {
      if (!isDragging || !this.camera) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      if (dragButton === 2) {
        this.cameraTarget.x = Math.max(-0.7, Math.min(0.7, this.cameraTarget.x - dx * 0.0028 * this.orbitRadius));
        this.cameraTarget.y = Math.max(-0.45, Math.min(0.55, this.cameraTarget.y + dy * 0.0025 * this.orbitRadius));
      } else {
        this.orbitAzimuth = Math.max(-0.72, Math.min(0.72, this.orbitAzimuth - dx * 0.006));
        this.orbitElevation = Math.max(-0.02, Math.min(0.42, this.orbitElevation + dy * 0.004));
      }
      this.syncOrbitCamera();
    };

    this.handleSandboxWheel = e => {
      e.preventDefault();
      this.orbitRadius = Math.max(3.7, Math.min(7.2, this.orbitRadius + e.deltaY * 0.004));
      this.syncOrbitCamera();
    };
    this.handleSandboxContextMenu = e => e.preventDefault();
    this.handleSandboxKeydown = e => {
      if (e.key !== 'Escape' || !this.isActive) return;
      this.close();
      this.onExit();
    };

    vp.addEventListener('pointerdown', this.handleSandboxPointerDown);
    vp.addEventListener('pointermove', this.handleSandboxPointerMove);
    vp.addEventListener('wheel', this.handleSandboxWheel, { passive: false });
    vp.addEventListener('contextmenu', this.handleSandboxContextMenu);
    window.addEventListener('pointerup', this.handleSandboxPointerUp);
    window.addEventListener('keydown', this.handleSandboxKeydown);
  }

  open(plotId, plotData) {
    if (plotId) this.plotId = plotId;
    if (plotData) this.plotData = plotData;
    this.updateCropInfo();
    this.rebuildPlantModel();
    this.runScenario('normal');
    this.cameraTarget.set(0.38, 0.13, 0);
    this.orbitRadius = 5.7;
    this.orbitAzimuth = 0;
    this.orbitElevation = 0.16;
    this.syncOrbitCamera();
    document.body.classList.add('crop-sandbox-open');
    this.container.classList.add('active');
    this.container.setAttribute('aria-hidden', 'false');
    this.isActive = true;
    this.handleResize?.();
    this.startAnimation();
  }

  close() {
    if (!this.isActive && !this.container.classList.contains('active')) {
      document.body.classList.remove('crop-sandbox-open');
      return;
    }
    this.isActive = false;
    this.stopAnimation();
    this.container.classList.remove('active');
    this.container.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('crop-sandbox-open');
    this.isPlaying = false;
    const playIcon = this.container.querySelector('[data-play-icon]');
    if (playIcon) playIcon.className = 'ph ph-play';
  }

  startAnimation() {
    if (this.animationFrame !== null || this.isDestroyed || !this.isActive) return;
    this.lastFrameTime = performance.now();
    this.animationFrame = requestAnimationFrame(this.animate);
    this.container.dataset.renderState = 'running';
  }

  stopAnimation() {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.container.dataset.renderState = 'stopped';
  }

  animate = now => {
    if (this.isDestroyed || !this.isActive) {
      this.animationFrame = null;
      return;
    }
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    const elapsed = now * 0.001;

    if (this.isPlaying) {
      this.replayTime += delta * 0.32 * this.playSpeed;
      if (this.replayTime > 4.0) {
        this.replayTime = 0.0;
      }
      const slider = this.container.querySelector('[data-timeline-slider]');
      if (slider) slider.value = this.replayTime;
      this.updateTimelineMorphing(this.replayTime);
    }

    this.windMaterials.forEach(material => {
      const uniforms = material.userData.sandboxWindUniforms;
      if (!uniforms) return;
      uniforms.uSandboxTime.value = elapsed;
      uniforms.uSandboxWind.value = 0.82 + Math.sin(elapsed * 0.41) * 0.18;
    });
    if (this.plantGroup) {
      const stress = this.currentMorph?.wilting || 0;
      this.plantGroup.rotation.z = Math.sin(elapsed * 0.82) * 0.014 * (1 - stress * 0.55);
      this.plantGroup.rotation.x = Math.cos(elapsed * 0.61) * 0.006;
    }
    if (this.specimenHalo) this.specimenHalo.rotation.z = elapsed * 0.018;
    if (this.scanLine) {
      const scanProgress = (elapsed * 0.075) % 1;
      this.scanLine.position.y = -0.35 + scanProgress * 2.15;
      this.scanLine.material.opacity = 0.08 + Math.sin(scanProgress * Math.PI) * 0.16;
    }

    this.rootMaterials.forEach((material, index) => {
      material.emissiveIntensity = 0.34 + Math.sin(elapsed * 1.7 + index) * 0.12;
    });

    if (this.heatParticles && this.heatParticles.visible) {
      const pos = this.heatParticles.geometry.attributes.position.array;
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] += delta * 0.34;
        if (pos[i] > 1.8) pos[i] = 0;
      }
      this.heatParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (this.floodWater?.visible) {
      this.floodWater.material.opacity = 0.34 + Math.sin(elapsed * 1.8) * 0.045;
      this.floodWater.position.y = 0.025 + Math.sin(elapsed * 1.35) * 0.008;
    }
    if (this.sensorLed?.material && (this.currentMorph?.sensorError || this.currentMorph?.actuatorFault)) {
      this.sensorLed.material.emissiveIntensity = 1.25 + (Math.sin(elapsed * 5.2) + 1) * 1.2;
    }

    this.renderer.render(this.scene, this.camera);
    this.frameCount += 1;
    this.container.dataset.frameCount = String(this.frameCount);
    this.container.dataset.drawCalls = String(this.renderer.info.render.calls);
    this.container.dataset.triangles = String(this.renderer.info.render.triangles);
  };

  destroy() {
    this.isDestroyed = true;
    this.stopAnimation();
    document.body.classList.remove('crop-sandbox-open');
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointerup', this.handleSandboxPointerUp);
    window.removeEventListener('keydown', this.handleSandboxKeydown);
    const vp = this.container.querySelector('[data-canvas-viewport]');
    vp?.removeEventListener('pointerdown', this.handleSandboxPointerDown);
    vp?.removeEventListener('pointermove', this.handleSandboxPointerMove);
    vp?.removeEventListener('wheel', this.handleSandboxWheel);
    vp?.removeEventListener('contextmenu', this.handleSandboxContextMenu);
    this.scene?.traverse(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
      else object.material?.dispose?.();
    });
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.container?.remove();
  }
}
