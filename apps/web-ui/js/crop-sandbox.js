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
    timeToRiskMinutes: 240,
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

    this.animationFrame = null;
    this.isDestroyed = false;

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
              <span class="sandbox-meta-item"><i class="ph ph-calendar"></i> 阶段：<strong data-crop-stage>果实成熟期</strong></span>
              <span class="sandbox-meta-item"><i class="ph ph-heartbeat"></i> 生理健康分：<strong data-crop-health>98%</strong></span>
            </div>
          </div>
        </div>

        <div class="sandbox-header-right">
          <div class="sandbox-status-chip">
            <span class="sandbox-live-dot"></span>
            <span data-studio-status>🔬 3D 动力学推演引擎 · 60 FPS</span>
          </div>
        </div>
      </header>

      <!-- Left Scenario Injection Dock -->
      <aside class="sandbox-left-dock">
        <div class="sandbox-card">
          <h3 class="sandbox-card-title">
            <span>⚡ 风险情景发生器</span>
            <i class="ph ph-lightning"></i>
          </h3>
          <div class="sandbox-scenario-grid">
            <button class="sandbox-scenario-btn active" type="button" data-scenario="normal">
              <i class="ph ph-plant" style="color: #3fb950;"></i>
              <div>
                <strong>健康基准态</strong>
                <span class="sandbox-scenario-desc">水温光适宜 · 稳态代谢</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-drought" type="button" data-scenario="drought">
              <i class="ph ph-sun-dim" style="color: #d29922;"></i>
              <div>
                <strong>☀️ 持续干旱失水</strong>
                <span class="sandbox-scenario-desc">72min 击穿极限凋萎边界</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-heat" type="button" data-scenario="heatwave">
              <i class="ph ph-flame" style="color: #ff7b72;"></i>
              <div>
                <strong>🔥 极端热浪强蒸散</strong>
                <span class="sandbox-scenario-desc">气温 38.6°C · VPD 剧增</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-rain" type="button" data-scenario="flood">
              <i class="ph ph-cloud-rain" style="color: #79c0ff;"></i>
              <div>
                <strong>🌧️ 特大暴雨积水</strong>
                <span class="sandbox-scenario-desc">田面过饱和 · 根系缺氧</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-drift" type="button" data-scenario="drift">
              <i class="ph ph-warning" style="color: #d2a8ff;"></i>
              <div>
                <strong>⚠️ 传感器零点漂移</strong>
                <span class="sandbox-scenario-desc">误报 11% · 作物实测健康</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn" type="button" data-scenario="stuck">
              <i class="ph ph-plugs" style="color: #f85149;"></i>
              <div>
                <strong>🔌 执行器卡阀断网</strong>
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
            <span>📈 未来 1~4h 水分衰减预测带</span>
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
              <rect x="0" y="24" width="320" height="42" fill="rgba(63, 185, 80, 0.12)" rx="4"/>
              <text x="6" y="38" fill="#3fb950" font-size="9" font-weight="bold">适宜带 20%~40%</text>
              <!-- Wilt Critical Line -->
              <line x1="0" y1="88" x2="320" y2="88" stroke="#f85149" stroke-dasharray="4,3" stroke-width="1.2"/>
              <text x="230" y="84" fill="#f85149" font-size="9">凋萎线 14%</text>
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
            <span>🧠 根因推断与置信排查</span>
            <i class="ph ph-tree-structure"></i>
          </h3>
          <div class="sandbox-diagnostic-list" data-diag-list>
            <!-- Injected dynamically -->
          </div>
          <button class="sandbox-btn-prescribe" type="button" data-btn-prescribe style="margin-top: 12px;">
            <i class="ph ph-lightning"></i>
            <span>⚡ 一键生成智能灌溉处方</span>
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

    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    this.camera.position.set(0, 1.5, 4.2);
    this.camera.lookAt(0, 0.6, 0);

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

    // Build Scene Geometry
    this.buildSoilCrossSection();
    this.rebuildPlantModel();
    this.buildHeatVaporParticles();

    // Resize Handler
    window.addEventListener('resize', () => {
      if (!this.container.classList.contains('active')) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    // Start 60 FPS Animation Loop
    this.animate();
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
      color: 0x4a3424,
      roughness: 0.95,
      metalness: 0.05
    });

    const soilGeo = new THREE.BoxGeometry(soilWidth, soilHeight, soilDepth);
    const soilMesh = new THREE.Mesh(soilGeo, this.soilMaterial);
    soilMesh.position.set(0, -soilHeight / 2, 0);
    soilMesh.receiveShadow = true;
    this.soilGroup.add(soilMesh);

    // 2. Transparent Front Glass Cutaway (剖面观察窗)
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x58a6ff,
      transparent: true,
      opacity: 0.18,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.7,
      ior: 1.4
    });
    const glassGeo = new THREE.PlaneGeometry(soilWidth + 0.02, soilHeight + 0.02);
    const glassMesh = new THREE.Mesh(glassGeo, glassMaterial);
    glassMesh.position.set(0, -soilHeight / 2, soilDepth / 2 + 0.01);
    this.soilGroup.add(glassMesh);

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

    // 5. IoT Sensor Probe inserted into soil at -15cm
    const probeStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.45, 12),
      new THREE.MeshStandardMaterial({ color: 0x22272e, metalness: 0.8, roughness: 0.3 })
    );
    probeStem.position.set(0.45, -0.15, 0.2);
    this.soilGroup.add(probeStem);

    // Sensor Head LED
    this.sensorLed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0x3fb950, emissive: 0x3fb950, emissiveIntensity: 2.0 })
    );
    this.sensorLed.position.set(0.45, 0.08, 0.2);
    this.soilGroup.add(this.sensorLed);

    // 6. Surface Water Plane for Flood Scenario
    const waterGeo = new THREE.PlaneGeometry(soilWidth + 0.05, soilDepth + 0.05);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x388bfd,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.75
    });
    this.floodWater = new THREE.Mesh(waterGeo, waterMat);
    this.floodWater.rotation.x = -Math.PI / 2;
    this.floodWater.position.set(0, 0.02, 0);
    this.floodWater.visible = false;
    this.soilGroup.add(this.floodWater);

    this.scene.add(this.soilGroup);
  }

  buildRootNetwork(parentGroup) {
    const rootMat = new THREE.MeshStandardMaterial({ color: 0xeadbb8, roughness: 0.85 });
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

    rootPoints.forEach((curvePts, i) => {
      const curve = new THREE.CatmullRomCurve3(curvePts);
      const radius = i < 3 ? 0.016 : 0.009;
      const rootGeo = new THREE.TubeGeometry(curve, 20, radius, 8, false);
      const rootMesh = new THREE.Mesh(rootGeo, rootMat);
      parentGroup.add(rootMesh);
    });
  }

  rebuildPlantModel() {
    if (this.plantGroup) {
      this.scene.remove(this.plantGroup);
    }

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

    this.scene.add(this.plantGroup);
  }

  buildTomatoSpecimen(group) {
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x3d7b42, roughness: 0.8 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e8540, roughness: 0.6, side: THREE.DoubleSide });
    const fruitGreenMat = new THREE.MeshStandardMaterial({ color: 0x76b852, roughness: 0.35 });
    const fruitRedMat = new THREE.MeshStandardMaterial({ color: 0xdf2929, roughness: 0.25, metalness: 0.1 });
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xfbd038, roughness: 0.4 });

    // 1. Central Vine Stem
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.04, 0.4, 0.02),
      new THREE.Vector3(-0.03, 0.85, 0.04),
      new THREE.Vector3(0.02, 1.3, -0.02),
      new THREE.Vector3(0, 1.65, 0)
    ]);
    const stemMesh = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 32, 0.028, 10, false), stemMat);
    stemMesh.castShadow = true;
    group.add(stemMesh);

    // 2. Bamboo Trellis Stake
    const stake = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 1.85, 8),
      new THREE.MeshStandardMaterial({ color: 0xb59a68, roughness: 0.9 })
    );
    stake.position.set(-0.06, 0.9, -0.05);
    stake.castShadow = true;
    group.add(stake);

    // 3. Foliage Branches with Compound Leaves
    const leafOffsets = [
      { y: 0.35, rotY: 0.4, angle: 0.6 },
      { y: 0.55, rotY: 2.1, angle: 0.55 },
      { y: 0.75, rotY: 3.8, angle: 0.5 },
      { y: 0.95, rotY: 5.2, angle: 0.45 },
      { y: 1.15, rotY: 1.2, angle: 0.4 },
      { y: 1.35, rotY: 2.9, angle: 0.35 },
      { y: 1.52, rotY: 4.6, angle: 0.3 }
    ];

    leafOffsets.forEach((spec, i) => {
      const branchGroup = new THREE.Group();
      branchGroup.position.set(0, spec.y, 0);
      branchGroup.rotation.y = spec.rotY;

      // Compound Leaf leaflets
      const leafGeo = new THREE.SphereGeometry(0.12, 8, 6);
      leafGeo.scale(0.5, 0.1, 1.0);
      [-0.15, 0, 0.15].forEach((offX, li) => {
        const leaflet = new THREE.Mesh(leafGeo, leafMat.clone());
        leaflet.position.set(offX * 0.8, 0.05 * (3 - Math.abs(li)), 0.2 + li * 0.08);
        leaflet.rotation.x = spec.angle;
        leaflet.rotation.z = (li - 1) * 0.3;
        leaflet.castShadow = true;
        branchGroup.add(leaflet);
        this.leafMeshes.push(leaflet);
      });

      group.add(branchGroup);
    });

    // 4. Tomato Fruit Clusters
    const fruitClusters = [
      { y: 0.65, rotY: 1.6, fruits: [{ x: 0.12, y: 0, z: 0.15, r: 0.075, mat: fruitRedMat }, { x: 0.18, y: -0.04, z: 0.18, r: 0.065, mat: fruitRedMat }] },
      { y: 0.95, rotY: 4.2, fruits: [{ x: -0.14, y: 0, z: 0.12, r: 0.07, mat: fruitRedMat }, { x: -0.2, y: -0.03, z: 0.16, r: 0.06, mat: fruitGreenMat }] },
      { y: 1.25, rotY: 0.8, fruits: [{ x: 0.1, y: 0, z: 0.12, r: 0.055, mat: fruitGreenMat }, { x: 0.15, y: -0.02, z: 0.14, r: 0.045, mat: fruitGreenMat }] }
    ];

    fruitClusters.forEach(cluster => {
      const clusterGroup = new THREE.Group();
      clusterGroup.position.set(0, cluster.y, 0);
      clusterGroup.rotation.y = cluster.rotY;

      cluster.fruits.forEach(f => {
        const fruitMesh = new THREE.Mesh(new THREE.SphereGeometry(f.r, 16, 14), f.mat);
        fruitMesh.position.set(f.x, f.y, f.z);
        fruitMesh.castShadow = true;
        clusterGroup.add(fruitMesh);
        this.fruitMeshes.push(fruitMesh);
      });

      group.add(clusterGroup);
    });

    // 5. Star Yellow Flowers
    const flowerGeo = new THREE.ConeGeometry(0.04, 0.06, 5);
    flowerGeo.rotateX(Math.PI / 2);
    [1.15, 1.42].forEach(y => {
      const flw = new THREE.Mesh(flowerGeo, flowerMat);
      flw.position.set(0.08, y, 0.08);
      flw.rotation.set(0.4, y * 2.5, 0);
      group.add(flw);
      this.flowerMeshes.push(flw);
    });
  }

  buildCucumberSpecimen(group) {
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x48944f, roughness: 0.8 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x328a42, roughness: 0.6, side: THREE.DoubleSide });
    const cukeMat = new THREE.MeshStandardMaterial({ color: 0x2e6b36, roughness: 0.4 });

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.75, 10), stemMat);
    stem.position.set(0, 0.875, 0);
    group.add(stem);

    for (let i = 0; i < 6; i++) {
      const leafGeo = new THREE.SphereGeometry(0.24, 8, 6);
      leafGeo.scale(0.8, 0.08, 0.8);
      const leaf = new THREE.Mesh(leafGeo, leafMat.clone());
      leaf.position.set(Math.cos(i * 1.6) * 0.25, 0.35 + i * 0.24, Math.sin(i * 1.6) * 0.25);
      leaf.rotation.set(0.3, i * 1.6, 0.2);
      leaf.castShadow = true;
      group.add(leaf);
      this.leafMeshes.push(leaf);
    }

    [0.75, 1.15].forEach(y => {
      const cuke = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.28, 12), cukeMat);
      cuke.position.set(0.18, y, 0.1);
      cuke.rotation.z = -0.3;
      group.add(cuke);
      this.fruitMeshes.push(cuke);
    });
  }

  buildCornSpecimen(group) {
    const stalkMat = new THREE.MeshStandardMaterial({ color: 0x4d9646, roughness: 0.7 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d8536, roughness: 0.6, side: THREE.DoubleSide });
    const cobMat = new THREE.MeshStandardMaterial({ color: 0x5a9438, roughness: 0.7 });

    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 12), stalkMat);
    stalk.position.set(0, 0.95, 0);
    group.add(stalk);

    for (let i = 0; i < 7; i++) {
      const leafGeo = new THREE.BoxGeometry(0.14, 0.015, 0.65);
      const leaf = new THREE.Mesh(leafGeo, leafMat.clone());
      leaf.position.set(Math.cos(i * 2.1) * 0.22, 0.35 + i * 0.22, Math.sin(i * 2.1) * 0.22);
      leaf.rotation.set(0.6, i * 2.1, 0);
      group.add(leaf);
      this.leafMeshes.push(leaf);
    }

    const cob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.32, 12), cobMat);
    cob.position.set(0.12, 1.05, 0.08);
    cob.rotation.z = -0.4;
    group.add(cob);
    this.fruitMeshes.push(cob);
  }

  buildRiceSpecimen(group) {
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x6e9f45, roughness: 0.7 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x7fae4b, roughness: 0.6, side: THREE.DoubleSide });

    for (let i = 0; i < 12; i++) {
      const bladeGeo = new THREE.BoxGeometry(0.025, 1.1 + (i % 3) * 0.15, 0.01);
      const blade = new THREE.Mesh(bladeGeo, leafMat.clone());
      const angle = (i / 12) * Math.PI * 2;
      blade.position.set(Math.cos(angle) * 0.06, 0.6, Math.sin(angle) * 0.06);
      blade.rotation.set(0.25 * Math.sin(angle), angle, 0.25 * Math.cos(angle));
      group.add(blade);
      this.leafMeshes.push(blade);
    }
  }

  buildSunflowerSpecimen(group) {
    const stalkMat = new THREE.MeshStandardMaterial({ color: 0x42823b, roughness: 0.8 });
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.3 });
    const discMat = new THREE.MeshStandardMaterial({ color: 0x4a2c11, roughness: 0.9 });

    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.6, 10), stalkMat);
    stalk.position.set(0, 0.8, 0);
    group.add(stalk);

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 20), discMat);
    disc.position.set(0, 1.62, 0.08);
    disc.rotation.x = Math.PI / 3;
    group.add(disc);

    const petals = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.34, 24), flowerMat);
    petals.position.set(0, 1.62, 0.09);
    petals.rotation.x = Math.PI / 3;
    group.add(petals);
  }

  buildStrawberrySpecimen(group) {
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d7e3a, roughness: 0.6, side: THREE.DoubleSide });
    const berryMat = new THREE.MeshStandardMaterial({ color: 0xe02828, roughness: 0.3 });

    for (let i = 0; i < 8; i++) {
      const leafGeo = new THREE.SphereGeometry(0.14, 8, 6);
      leafGeo.scale(0.8, 0.06, 0.9);
      const leaf = new THREE.Mesh(leafGeo, leafMat.clone());
      const angle = (i / 8) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 0.22, 0.12, Math.sin(angle) * 0.22);
      leaf.rotation.set(0.4 * Math.sin(angle), angle, 0.4 * Math.cos(angle));
      group.add(leaf);
      this.leafMeshes.push(leaf);
    }

    [0, 1.8, 3.6].forEach(a => {
      const berry = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.07, 8), berryMat);
      berry.position.set(Math.cos(a) * 0.26, 0.08, Math.sin(a) * 0.26);
      berry.rotation.x = Math.PI;
      group.add(berry);
      this.fruitMeshes.push(berry);
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
    const mat = new THREE.PointsMaterial({
      color: 0xffaa44,
      size: 0.06,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.heatParticles = new THREE.Points(geo, mat);
    this.scene.add(this.heatParticles);
  }

  runScenario(scenarioKey) {
    this.activeScenario = scenarioKey;
    const scenario = SCENARIO_PRESETS[scenarioKey] || SCENARIO_PRESETS.normal;

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

    // Reset timeline slider to 0h
    this.replayTime = 0;
    const slider = this.container.querySelector('[data-timeline-slider]');
    if (slider) slider.value = 0;
    this.updateTimelineMorphing(0);
  }

  updateTimelineMorphing(timeHours) {
    this.replayTime = timeHours;
    const timeDisplay = this.container.querySelector('[data-time-display]');
    if (timeDisplay) timeDisplay.textContent = `+${timeHours.toFixed(1)} 小时 (${timeHours === 0 ? '当前时点' : '推演态'})`;

    const isTrackA = this.replayTrack === 'trackA';
    const s = this.activeScenario;

    let wilting = 0.0;
    let chlorosis = 0.0;
    let soilWetness = 0.5;
    let heatVaporOpacity = 0.0;
    let floodVisible = false;
    let sensorError = false;

    if (s === 'drought') {
      if (isTrackA) {
        // Track A: Worsens over time
        wilting = Math.min(1.0, (timeHours / 4.0) * 1.2);
        chlorosis = Math.min(1.0, (timeHours / 4.0) * 0.85);
        soilWetness = Math.max(0.05, 0.4 - timeHours * 0.09);
        heatVaporOpacity = 0.4;
      } else {
        // Track B: Recovers rapidly after 0.5h
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
      floodVisible = true;
      soilWetness = 0.95;
      chlorosis = isTrackA ? Math.min(0.7, (timeHours / 4.0) * 0.8) : 0.0;
    } else if (s === 'drift') {
      sensorError = true;
      // Plant remains pristine healthy in both tracks!
      wilting = 0.0;
      chlorosis = 0.0;
      soilWetness = 0.65;
    }

    // Apply 3D Mesh Deformations
    this.leafMeshes.forEach(leaf => {
      if (leaf.material) {
        if (chlorosis > 0.05) {
          leaf.material.color.setRGB(0.18 + chlorosis * 0.45, 0.52 - chlorosis * 0.2, 0.25 - chlorosis * 0.15);
        } else {
          leaf.material.color.setHex(0x2e8540);
        }
      }
      leaf.rotation.x = 0.3 + wilting * 0.65;
      leaf.scale.set(1.0 - wilting * 0.15, 1.0 - wilting * 0.15, 1.0 - wilting * 0.1);
    });

    // Soil Color Shift
    if (this.soilMaterial) {
      this.soilMaterial.color.setRGB(0.2 + (1 - soilWetness) * 0.35, 0.15 + (1 - soilWetness) * 0.25, 0.1 + (1 - soilWetness) * 0.15);
    }

    // Flood & Heat Particles
    if (this.floodWater) this.floodWater.visible = floodVisible;
    if (this.heatParticles && this.heatParticles.material) {
      this.heatParticles.material.opacity = heatVaporOpacity;
    }

    // Sensor LED Blink
    if (this.sensorLed && this.sensorLed.material) {
      if (sensorError) {
        this.sensorLed.material.color.setHex(0xd2a8ff);
        this.sensorLed.material.emissive.setHex(0xd2a8ff);
      } else if (wilting > 0.4) {
        this.sensorLed.material.color.setHex(0xf85149);
        this.sensorLed.material.emissive.setHex(0xf85149);
      } else {
        this.sensorLed.material.color.setHex(0x3fb950);
        this.sensorLed.material.emissive.setHex(0x3fb950);
      }
    }
  }

  updateCropInfo() {
    const cropCode = this.plotData?.cropCode || 'tomato';
    const cfg = CROP_MODELS[cropCode] || CROP_MODELS.tomato;

    const plotName = this.container.querySelector('[data-plot-name]');
    const cropVar = this.container.querySelector('[data-crop-variety]');
    const cropStage = this.container.querySelector('[data-crop-stage]');
    const cropHealth = this.container.querySelector('[data-crop-health]');

    if (plotName) plotName.textContent = this.plotData?.name || 'A01 番茄示范田';
    if (cropVar) cropVar.textContent = this.plotData?.cropVariety || cfg.name;
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

    // Prescribe Action Button
    this.container.querySelector('[data-btn-prescribe]')?.addEventListener('click', () => {
      this.onPrescribe(this.plotId, this.activeScenario);
    });

    // Orbit Camera Drag / Pan
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    const vp = this.container.querySelector('[data-canvas-viewport]');

    vp.addEventListener('pointerdown', e => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    });

    window.addEventListener('pointerup', () => { isDragging = false; });

    vp.addEventListener('pointermove', e => {
      if (!isDragging || !this.plantGroup) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      // Rotate crop and soil
      this.soilGroup.rotation.y += dx * 0.008;
      this.plantGroup.rotation.y += dx * 0.008;

      // Tilt camera slightly
      this.camera.position.y = Math.max(0.5, Math.min(2.8, this.camera.position.y - dy * 0.008));
      this.camera.lookAt(0, 0.6, 0);
    });
  }

  open(plotId, plotData) {
    if (plotId) this.plotId = plotId;
    if (plotData) this.plotData = plotData;
    this.updateCropInfo();
    this.rebuildPlantModel();
    this.runScenario('normal');
    this.container.classList.add('active');
  }

  close() {
    this.container.classList.remove('active');
    this.isPlaying = false;
  }

  animate = () => {
    if (this.isDestroyed) return;
    this.animationFrame = requestAnimationFrame(this.animate);

    if (!this.container.classList.contains('active')) return;

    const elapsed = performance.now() * 0.001;

    // Timeline Auto-Play Progression
    if (this.isPlaying) {
      this.replayTime += 0.02 * this.playSpeed;
      if (this.replayTime > 4.0) {
        this.replayTime = 0.0;
      }
      const slider = this.container.querySelector('[data-timeline-slider]');
      if (slider) slider.value = this.replayTime;
      this.updateTimelineMorphing(this.replayTime);
    }

    // Heat vapor particles upward drift
    if (this.heatParticles && this.heatParticles.visible) {
      const pos = this.heatParticles.geometry.attributes.position.array;
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] += 0.006;
        if (pos[i] > 1.8) pos[i] = 0;
      }
      this.heatParticles.geometry.attributes.position.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  };

  destroy() {
    this.isDestroyed = true;
    cancelAnimationFrame(this.animationFrame);
    this.renderer?.dispose();
    this.container?.remove();
  }
}
