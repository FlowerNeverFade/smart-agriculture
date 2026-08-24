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
      { name: '作物长势正常', prob: 98, color: '#3fb950' },
      { name: '土壤水分合适', prob: 96, color: '#3fb950' }
    ],
    forecastCurve: [
      { t: 0, val: 28.5, lower: 28.0, upper: 29.0 },
      { t: 1, val: 27.2, lower: 26.4, upper: 28.0 },
      { t: 2, val: 25.8, lower: 24.8, upper: 26.8 },
      { t: 4, val: 23.4, lower: 22.0, upper: 24.8 }
    ],
    trackA_loss: '无损失',
    trackB_benefit: '暂时不用操作',
    desc: '现在不用处理，按计划巡田即可。'
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
      { name: '土壤确实缺水', prob: 94, color: '#f85149' },
      { name: '天气导致水分蒸发快', prob: 88, color: '#d29922' }
    ],
    forecastCurve: [
      { t: 0, val: 16.8, lower: 16.2, upper: 17.4 },
      { t: 1, val: 14.2, lower: 13.4, upper: 15.0 },
      { t: 2, val: 12.1, lower: 10.8, upper: 13.2 },
      { t: 4, val: 9.2, lower: 7.5, upper: 10.8 }
    ],
    trackA_loss: '约 ¥1,850，可能减产',
    trackB_benefit: '浇水约 153 升，可避免减产',
    desc: '如果不浇水，约 72 分钟后叶片会明显下垂，并可能落花落果。'
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
      { name: '气温过高', prob: 92, color: '#f85149' },
      { name: '土壤水分下降太快', prob: 90, color: '#f85149' }
    ],
    forecastCurve: [
      { t: 0, val: 18.2, lower: 17.5, upper: 18.9 },
      { t: 1, val: 12.8, lower: 11.5, upper: 13.9 },
      { t: 2, val: 9.5, lower: 7.8, upper: 11.0 },
      { t: 4, val: 6.8, lower: 5.0, upper: 8.5 }
    ],
    trackA_loss: '约 ¥2,400，叶片可能晒伤',
    trackB_benefit: '开启喷雾降温，并少量多次补水',
    desc: '高温会让作物迅速失水。建议先喷雾降温，再少量多次浇水。'
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
      { name: '土里积水过多', prob: 96, color: '#58a6ff' },
      { name: '根部缺少空气', prob: 89, color: '#d29922' }
    ],
    forecastCurve: [
      { t: 0, val: 92.0, lower: 90.0, upper: 94.0 },
      { t: 1, val: 90.5, lower: 88.0, upper: 93.0 },
      { t: 2, val: 87.2, lower: 84.0, upper: 90.0 },
      { t: 4, val: 82.0, lower: 77.0, upper: 86.0 }
    ],
    trackA_loss: '约 ¥1,200，可能烂根减产',
    trackB_benefit: '立即停止浇水，并打开排水',
    desc: '积水会让根部缺少空气。现在应停止浇水，并尽快排出积水。'
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
      { name: '传感器可能读错', prob: 93, color: '#bc8cff' },
      { name: '作物实际长势正常', prob: 95, color: '#3fb950' }
    ],
    forecastCurve: [
      { t: 0, val: 11.2, lower: 11.0, upper: 11.4 },
      { t: 1, val: 11.1, lower: 10.9, upper: 11.3 },
      { t: 2, val: 11.0, lower: 10.8, upper: 11.2 },
      { t: 4, val: 10.8, lower: 10.5, upper: 11.1 }
    ],
    trackA_loss: '作物暂时没有损失',
    trackB_benefit: '先检查探头，避免多浇约 180 升水',
    desc: '读数显示缺水，但作物看起来正常。先现场检查探头，不要马上浇水。'
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
      { name: '水阀没有动作', prob: 95, color: '#f85149' },
      { name: '控制信号没有收到回复', prob: 91, color: '#d29922' }
    ],
    forecastCurve: [
      { t: 0, val: 15.5, lower: 15.0, upper: 16.0 },
      { t: 1, val: 13.8, lower: 13.0, upper: 14.5 },
      { t: 2, val: 11.9, lower: 10.5, upper: 13.0 },
      { t: 4, val: 8.8, lower: 7.0, upper: 10.5 }
    ],
    trackA_loss: '约 ¥1,600，可能缺水干枯',
    trackB_benefit: '切换备用水阀，并通知维修人员',
    desc: '系统已经发出浇水命令，但水阀没有动作。应切换备用水阀并通知维修。'
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
    this.heatParticles = null;
    this.floodWater = null;
    this.sensorMesh = null;
    this.sensorBadge = null;
    this.windMaterials = [];
    this.droughtCracks = null;
    this.outdoorGroup = null;
    this.cloudGroup = null;
    this.cloudMaterials = [];
    this.rainParticles = null;
    this.grassField = null;
    this.skyMaterial = null;
    this.lawnMaterial = null;
    this.sunLight = null;
    this.sunMesh = null;

    this.animationFrame = null;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.isActive = false;
    this.isDestroyed = false;
    this.cameraTarget = new THREE.Vector3(0.34, 0.08, 0);
    this.orbitRadius = 6.4;
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
              <i class="ph ph-plant"></i>
              <span data-plot-name>A01 番茄示范田</span> · 作物风险预演
            </h2>
            <div class="sandbox-title-meta">
              <span class="sandbox-meta-item"><i class="ph ph-leaf"></i> 品种：<strong data-crop-variety>千禧水果番茄</strong></span>
              <span class="sandbox-meta-item"><i class="ph ph-calendar"></i> 阶段：<strong data-crop-stage>果实成熟期</strong></span>
              <span class="sandbox-meta-item"><i class="ph ph-heart"></i> 长势：<strong data-crop-health>98%</strong></span>
            </div>
          </div>
        </div>

        <div class="sandbox-header-right">
          <div class="sandbox-sequence-chip">
            <span>天气 · <em data-weather-label>晴朗微风</em></span>
            <strong data-sequence-time>当前状态</strong>
          </div>
          <div class="sandbox-telemetry-strip" aria-label="作物环境数据">
            <span data-telemetry="temperature"><i class="ph ph-thermometer"></i><b>26.4°C</b><small>空气温度</small></span>
            <span data-telemetry="moisture"><i class="ph ph-drop"></i><b>28.5%</b><small>土壤水分</small></span>
          </div>
        </div>
      </header>

      <!-- Left Scenario Injection Dock -->
      <aside class="sandbox-left-dock">
        <div class="sandbox-card">
          <h3 class="sandbox-card-title">
            <span>模拟一种情况</span>
            <i class="ph ph-hand-tap"></i>
          </h3>
          <div class="sandbox-scenario-grid">
            <button class="sandbox-scenario-btn active" type="button" data-scenario="normal" aria-label="现在正常" title="现在正常">
              <i class="ph ph-plant" style="color: #3fb950;"></i>
              <div>
                <strong>现在正常</strong>
                <span class="sandbox-scenario-desc">作物长势良好</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-drought" type="button" data-scenario="drought" aria-label="长时间缺水" title="长时间缺水">
              <i class="ph ph-sun-dim" style="color: #d29922;"></i>
              <div>
                <strong>长时间缺水</strong>
                <span class="sandbox-scenario-desc">很久没有浇水</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-heat" type="button" data-scenario="heatwave" aria-label="连续高温" title="连续高温">
              <i class="ph ph-flame" style="color: #ff7b72;"></i>
              <div>
                <strong>连续高温</strong>
                <span class="sandbox-scenario-desc">气温升到 38.6°C</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-rain" type="button" data-scenario="flood" aria-label="暴雨积水" title="暴雨积水">
              <i class="ph ph-cloud-rain" style="color: #79c0ff;"></i>
              <div>
                <strong>暴雨积水</strong>
                <span class="sandbox-scenario-desc">土里积水排不出去</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn risk-drift" type="button" data-scenario="drift" aria-label="数据可能不准" title="数据可能不准">
              <i class="ph ph-warning" style="color: #d2a8ff;"></i>
              <div>
                <strong>数据可能不准</strong>
                <span class="sandbox-scenario-desc">读数低，但作物正常</span>
              </div>
            </button>
            <button class="sandbox-scenario-btn" type="button" data-scenario="stuck" aria-label="水阀没有反应" title="水阀没有反应">
              <i class="ph ph-plugs" style="color: #f85149;"></i>
              <div>
                <strong>水阀没有反应</strong>
                <span class="sandbox-scenario-desc">已经开阀，但没有出水</span>
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
              <span data-time-unit>分钟</span>
            </div>
          </div>
          <div class="sandbox-gauge-info">
            <h4 data-gauge-title>目前作物安全</h4>
            <p data-gauge-desc>现在不用处理，按计划巡田即可。</p>
          </div>
        </div>

        <!-- 1h/2h/4h Forecast Envelope Chart -->
        <div class="sandbox-chart-card">
          <h3 class="sandbox-card-title">
            <span>未来 4 小时土壤水分</span>
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
              <text data-safe-label x="6" y="38" fill="#3fb950" font-size="9" font-weight="bold">水分合适 20%~40%</text>
              <!-- Wilt Critical Line -->
              <line data-wilt-line x1="0" y1="88" x2="320" y2="88" stroke="#f85149" stroke-dasharray="4,3" stroke-width="1.2"/>
              <text data-wilt-label x="242" y="84" fill="#f85149" font-size="9">危险线 14%</text>
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
              <text x="14" y="116" fill="#8b949e" font-size="9">现在</text>
              <text x="90" y="116" fill="#8b949e" font-size="9">1小时后</text>
              <text x="170" y="116" fill="#8b949e" font-size="9">2小时后</text>
              <text x="282" y="116" fill="#8b949e" font-size="9">4小时后</text>
            </svg>
          </div>
        </div>

        <!-- Root Cause Probability & Diagnostic Confidence -->
        <div class="sandbox-card">
          <h3 class="sandbox-card-title">
            <span>系统判断</span>
            <i class="ph ph-check-circle"></i>
          </h3>
          <div class="sandbox-diagnostic-list" data-diag-list>
            <!-- Injected dynamically -->
          </div>
          <button class="sandbox-btn-prescribe" type="button" data-btn-prescribe style="margin-top: 12px;">
            <i class="ph ph-lightning"></i>
            <span>生成处理方案</span>
          </button>
        </div>
      </aside>

      <!-- Bottom Dual-Track Replay Scrubber (双轨对比时间轴) -->
      <footer class="sandbox-bottom-scrubber">
        <div class="sandbox-scrubber-top">
          <div class="sandbox-track-tabs">
            <span style="font-size: 11px; font-weight: 700; color: var(--sandbox-text-muted);">对比：</span>
            <button class="sandbox-track-tab active" type="button" data-track="trackA">
              <i class="ph ph-x-circle" style="color: #f85149;"></i>
              <span>不处理</span>
            </button>
            <button class="sandbox-track-tab tab-action" type="button" data-track="trackB">
              <i class="ph ph-check-circle" style="color: #3fb950;"></i>
              <span>按建议处理</span>
            </button>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11px; color: var(--sandbox-text-muted);">查看时间：</span>
            <strong style="font-family: var(--font-mono); color: #fff; font-size: 13px;" data-time-display>现在</strong>
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
              <span>现在</span>
              <span>1小时后</span>
              <span>2小时后</span>
              <span>3小时后</span>
              <span>4小时后</span>
            </div>
          </div>
        </div>

        <!-- Real-Time Value Ledger Ticker -->
        <div class="sandbox-value-ticker">
          <div class="sandbox-ticker-item">
            <i class="ph ph-coins" style="color: #d29922;"></i>
            <span>不处理可能损失：</span>
            <strong data-ticker-loss style="color: #f85149;">约 ¥1,850</strong>
          </div>
          <div class="sandbox-ticker-item">
            <i class="ph ph-drop" style="color: #58a6ff;"></i>
            <span>按建议处理：</span>
            <strong data-ticker-benefit style="color: #3fb950;">预计可避免损失</strong>
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
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    viewport.appendChild(this.renderer.domElement);

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9ed2ef);
    this.scene.fog = new THREE.Fog(0xc9e1d0, 8, 28);

    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    this.syncOrbitCamera();

    // Warm outdoor light rig. Weather scenarios continuously retune these lights.
    const ambientLight = new THREE.HemisphereLight(0xe8f6ff, 0x6d8b52, 2.35);
    this.scene.add(ambientLight);
    this.hemisphereLight = ambientLight;

    this.sunLight = new THREE.DirectionalLight(0xfff1c7, 2.8);
    this.sunLight.position.set(-5, 7, 5);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 24;
    this.sunLight.shadow.bias = -0.001;
    this.scene.add(this.sunLight);

    const softFill = new THREE.DirectionalLight(0xc8e8ff, 1.25);
    softFill.position.set(4, 3, 4);
    this.scene.add(softFill);

    // Build the outdoor garden before the foreground specimen.
    this.buildOutdoorEnvironment();
    this.buildSmartPlanter();
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

  buildOutdoorEnvironment() {
    this.outdoorGroup = new THREE.Group();

    // Procedural sky dome: no static backdrop is used.
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x6fbbe8) },
        uBottom: { value: new THREE.Color(0xeaf5d6) },
        uHorizon: { value: 0.22 }
      },
      vertexShader: `varying vec3 vWorld; void main(){ vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorld = worldPosition.xyz; gl_Position = projectionMatrix * viewMatrix * worldPosition; }`,
      fragmentShader: `varying vec3 vWorld; uniform vec3 uTop; uniform vec3 uBottom; uniform float uHorizon; void main(){ float h = normalize(vWorld).y; float t = smoothstep(-0.08, 0.72 + uHorizon, h); vec3 sky = mix(uBottom, uTop, pow(t, 0.72)); gl_FragColor = vec4(sky, 1.0); }`
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(32, 48, 24), this.skyMaterial);
    this.outdoorGroup.add(sky);

    // Soft rolling lawn and distant hills make the pot feel grounded outdoors.
    this.lawnMaterial = new THREE.MeshStandardMaterial({ color: 0x79aa56, roughness: 0.97, metalness: 0 });
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(18, 96), this.lawnMaterial);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -1.24;
    lawn.receiveShadow = true;
    this.outdoorGroup.add(lawn);

    this.hillMaterials = [];
    [[-7, -1.9, -11, 7.5, 2.1], [2, -2.1, -13, 9.5, 2.55], [9, -2.2, -10, 6.8, 2.1]].forEach((hill, index) => {
      const material = new THREE.MeshStandardMaterial({ color: index === 1 ? 0x648d4c : 0x719b52, roughness: 1 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 18), material);
      mesh.position.set(hill[0], hill[1], hill[2]);
      mesh.scale.set(hill[3], hill[4], 2.8);
      mesh.receiveShadow = true;
      this.hillMaterials.push(material);
      this.outdoorGroup.add(mesh);
    });

    // One instanced grass field keeps the meadow alive without hundreds of draw calls.
    const bladeGeometry = new THREE.BufferGeometry();
    bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.03, 0, 0, 0.03, 0, 0, 0, 0.14, 0,
      0, 0, -0.03, 0, 0, 0.03, 0, 0.14, 0
    ], 3));
    bladeGeometry.computeVertexNormals();
    const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x4e8d43, roughness: 0.9, side: THREE.DoubleSide });
    bladeMaterial.onBeforeCompile = shader => {
      shader.uniforms.uMeadowTime = { value: 0 };
      shader.uniforms.uMeadowWind = { value: 1 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uMeadowTime;\nuniform float uMeadowWind;')
        .replace('#include <begin_vertex>', `
          vec3 transformed = vec3(position);
          float meadowPhase = uMeadowTime * 1.18 + instanceMatrix[3].x * 0.42 + instanceMatrix[3].z * 0.28;
          transformed.x += sin(meadowPhase) * position.y * 0.16 * uMeadowWind;
          transformed.z += cos(meadowPhase * 0.73) * position.y * 0.07 * uMeadowWind;
        `);
      this.grassWindUniforms = shader.uniforms;
    };
    bladeMaterial.customProgramCacheKey = () => 'agriloop-outdoor-meadow-v1';
    const bladeCount = 860;
    this.grassField = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, bladeCount);
    this.grassField.position.y = -1.235;
    const dummy = new THREE.Object3D();
    for (let index = 0; index < bladeCount; index += 1) {
      const angle = index * 2.399963 + Math.sin(index * 4.17) * 0.18;
      const radius = 1.45 + Math.sqrt(index / bladeCount) * 10.5;
      dummy.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius - 1.6);
      dummy.rotation.set(0, angle + Math.sin(index * 0.91), Math.sin(index * 1.77) * 0.08);
      const height = 0.58 + ((index * 29) % 41) / 104;
      dummy.scale.set(0.68 + (index % 5) * 0.06, height, 0.68 + (index % 3) * 0.07);
      dummy.updateMatrix();
      this.grassField.setMatrixAt(index, dummy.matrix);
    }
    this.grassField.instanceMatrix.needsUpdate = true;
    this.grassField.receiveShadow = true;
    this.outdoorGroup.add(this.grassField);

    // Sun and drifting volumetric-style cloud clusters.
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 32, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe39a, transparent: true, opacity: 0.96, fog: false })
    );
    this.sunMesh.position.set(-2.7, 4.0, -10.5);
    // The scene uses diffuse skylight and volumetric rays instead of a solid
    // yellow disc, which looked like a floating "egg yolk" behind the plant.
    this.sunMesh.visible = false;
    this.outdoorGroup.add(this.sunMesh);

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const glowContext = glowCanvas.getContext('2d');
    const glowGradient = glowContext.createRadialGradient(128, 128, 8, 128, 128, 126);
    glowGradient.addColorStop(0, 'rgba(255,249,211,0.98)');
    glowGradient.addColorStop(0.22, 'rgba(255,223,139,0.58)');
    glowGradient.addColorStop(1, 'rgba(255,214,120,0)');
    glowContext.fillStyle = glowGradient;
    glowContext.fillRect(0, 0, 256, 256);
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), transparent: true, opacity: 0.82, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.sunGlow.position.copy(this.sunMesh.position);
    this.sunGlow.scale.set(6.2, 6.2, 1);
    this.outdoorGroup.add(this.sunGlow);

    const rayCanvas = document.createElement('canvas');
    rayCanvas.width = 128;
    rayCanvas.height = 512;
    const rayContext = rayCanvas.getContext('2d');
    const rayGradient = rayContext.createLinearGradient(0, 0, 0, 512);
    rayGradient.addColorStop(0, 'rgba(255,245,190,0)');
    rayGradient.addColorStop(0.16, 'rgba(255,240,172,0.52)');
    rayGradient.addColorStop(0.72, 'rgba(255,226,138,0.12)');
    rayGradient.addColorStop(1, 'rgba(255,226,138,0)');
    rayContext.fillStyle = rayGradient;
    rayContext.fillRect(18, 0, 92, 512);
    this.sunRays = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(rayCanvas),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      rotation: -0.42,
      fog: false
    }));
    this.sunRays.position.set(-1.8, 1.55, -6.8);
    this.sunRays.scale.set(3.5, 8.8, 1);
    this.outdoorGroup.add(this.sunRays);

    this.cloudGroup = new THREE.Group();
    this.cloudMaterials = [];
    const cloudSeeds = [[-5.6, 2.8, -11.5, 0.82], [0.8, 3.25, -13, 0.72], [6.3, 2.65, -11.8, 0.9]];
    cloudSeeds.forEach((seed, clusterIndex) => {
      const cluster = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.72, depthWrite: false });
      this.cloudMaterials.push(material);
      for (let puff = 0; puff < 7; puff += 1) {
        const cloudPuff = new THREE.Mesh(new THREE.SphereGeometry(0.58 + (puff % 3) * 0.16, 20, 12), material);
        cloudPuff.position.set((puff - 3) * 0.48, Math.sin(puff * 1.7) * 0.22, Math.cos(puff * 1.31) * 0.24);
        cloudPuff.scale.y = 0.58;
        cluster.add(cloudPuff);
      }
      cluster.position.set(seed[0], seed[1], seed[2]);
      cluster.scale.setScalar(seed[3]);
      cluster.userData.speed = 0.08 + clusterIndex * 0.025;
      this.cloudGroup.add(cluster);
    });
    this.outdoorGroup.add(this.cloudGroup);

    // Dynamic rain field used by the waterlogging scenario.
    const rainCount = 440;
    const rainPositions = new Float32Array(rainCount * 6);
    for (let index = 0; index < rainCount; index += 1) {
      const offset = index * 6;
      const x = (Math.sin(index * 12.41) * 0.5 + 0.5) * 12 - 6;
      const y = ((index * 37) % rainCount) / rainCount * 8 - 1.2;
      const z = (Math.sin(index * 7.73 + 1.4) * 0.5 + 0.5) * 11 - 6;
      rainPositions[offset] = x;
      rainPositions[offset + 1] = y;
      rainPositions[offset + 2] = z;
      rainPositions[offset + 3] = x + 0.035;
      rainPositions[offset + 4] = y - 0.24;
      rainPositions[offset + 5] = z;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    this.rainParticles = new THREE.LineSegments(
      rainGeometry,
      new THREE.LineBasicMaterial({ color: 0xc7e5f4, transparent: true, opacity: 0, depthWrite: false })
    );
    this.rainParticles.visible = false;
    this.outdoorGroup.add(this.rainParticles);

    this.scene.add(this.outdoorGroup);
  }

  buildSmartPlanter() {
    // The crop now lives in an opaque ceramic smart planter. No roots or soil profile are exposed.
    this.soilGroup = new THREE.Group();
    this.soilGroup.position.set(0, -0.35, 0);

    this.planterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd9855d,
      roughness: 0.48,
      metalness: 0.02,
      clearcoat: 0.2,
      clearcoatRoughness: 0.58
    });
    const planterBody = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.52, 0.78, 64, 8, true), this.planterMaterial);
    planterBody.position.y = -0.43;
    planterBody.castShadow = true;
    planterBody.receiveShadow = true;
    this.soilGroup.add(planterBody);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.735, 0.068, 18, 72),
      new THREE.MeshPhysicalMaterial({ color: 0xe7a27b, roughness: 0.4, clearcoat: 0.28 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.035;
    rim.castShadow = true;
    this.soilGroup.add(rim);

    const planterFoot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.62, 0.09, 64),
      new THREE.MeshPhysicalMaterial({ color: 0xc66f4e, roughness: 0.56, clearcoat: 0.12 })
    );
    planterFoot.position.y = -0.86;
    planterFoot.castShadow = true;
    planterFoot.receiveShadow = true;
    this.soilGroup.add(planterFoot);

    this.soilMaterial = new THREE.MeshStandardMaterial({ color: 0x4b2e1e, roughness: 1, metalness: 0, transparent: false });
    const soilTop = new THREE.Mesh(new THREE.CylinderGeometry(0.665, 0.665, 0.08, 64), this.soilMaterial);
    soilTop.position.y = -0.02;
    soilTop.receiveShadow = true;
    this.soilGroup.add(soilTop);

    // A discreet smart sensor replaces the visually heavy stake.
    const probeGroup = new THREE.Group();
    probeGroup.position.set(0.46, 0.02, 0.19);
    const probeMetal = new THREE.MeshStandardMaterial({ color: 0xb9c5c8, metalness: 0.72, roughness: 0.24 });
    const probeStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.25, 14), probeMetal);
    probeStem.position.y = 0.095;
    probeGroup.add(probeStem);
    const probeHead = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.07, 0.08, 5, 14),
      new THREE.MeshStandardMaterial({ color: 0xf2f5ef, metalness: 0.14, roughness: 0.3 })
    );
    probeHead.position.y = 0.25;
    probeHead.rotation.z = Math.PI / 2;
    probeGroup.add(probeHead);
    this.sensorLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 16, 10),
      new THREE.MeshStandardMaterial({ color: 0x3fb950, emissive: 0x3fb950, emissiveIntensity: 2 })
    );
    this.sensorLed.position.set(0.072, 0.25, 0);
    probeGroup.add(this.sensorLed);
    this.soilGroup.add(probeGroup);

    const badge = new THREE.Mesh(
      new THREE.CircleGeometry(0.14, 36),
      new THREE.MeshPhysicalMaterial({ color: 0xf9f1df, roughness: 0.34, metalness: 0.06, clearcoat: 0.3 })
    );
    badge.position.set(0, -0.48, 0.66);
    this.soilGroup.add(badge);
    const badgeLeaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.053, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0x3f8a59, roughness: 0.7 })
    );
    badgeLeaf.position.set(0, -0.47, 0.676);
    badgeLeaf.scale.set(0.68, 1, 0.18);
    this.soilGroup.add(badgeLeaf);

    const crackPositions = [];
    for (let branch = 0; branch < 14; branch += 1) {
      const angle = branch * 2.399;
      const startRadius = 0.07 + (branch % 3) * 0.03;
      const endRadius = 0.27 + (branch % 4) * 0.07;
      crackPositions.push(
        Math.cos(angle) * startRadius, 0.026, Math.sin(angle) * startRadius,
        Math.cos(angle + Math.sin(branch) * 0.22) * endRadius, 0.026, Math.sin(angle + Math.sin(branch) * 0.22) * endRadius
      );
    }
    const crackGeometry = new THREE.BufferGeometry();
    crackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(crackPositions, 3));
    this.droughtCracks = new THREE.LineSegments(crackGeometry, new THREE.LineBasicMaterial({ color: 0x21150d, transparent: true, opacity: 0.76 }));
    this.droughtCracks.visible = false;
    this.soilGroup.add(this.droughtCracks);

    this.floodWater = new THREE.Mesh(
      new THREE.CircleGeometry(0.665, 64),
      new THREE.MeshPhysicalMaterial({ color: 0x69aeda, roughness: 0.08, clearcoat: 0.9, transparent: true, opacity: 0.42, depthWrite: false })
    );
    this.floodWater.rotation.x = -Math.PI / 2;
    this.floodWater.position.y = 0.035;
    this.floodWater.visible = false;
    this.soilGroup.add(this.floodWater);

    this.scene.add(this.soilGroup);
  }

  updateWeatherEnvironment(scenarioKey, timeHours = 0) {
    if (!this.skyMaterial || !this.lawnMaterial) return;

    const weatherPresets = {
      normal: { label: '晴朗微风', top: 0x68b9e9, bottom: 0xeef4d1, lawn: 0x79aa56, hill: 0x668f4d, grass: 0x4f8e43, cloud: 0xffffff, cloudOpacity: 0.7, sun: 0xffe39a, sunPower: 2.8, sunVisibility: 1, rain: 0, fog: 0xc9e1d0 },
      drought: { label: '干燥晴热', top: 0x72b8df, bottom: 0xf4deb0, lawn: 0x9da65a, hill: 0x7d8f50, grass: 0x7f943f, cloud: 0xfff6de, cloudOpacity: 0.34, sun: 0xffca70, sunPower: 3.15, sunVisibility: 1, rain: 0, fog: 0xe2d6ae },
      heatwave: { label: '高温热浪', top: 0x73a9c8, bottom: 0xf2c285, lawn: 0x9b9850, hill: 0x7d7f47, grass: 0x8b8739, cloud: 0xf6ddba, cloudOpacity: 0.26, sun: 0xffae58, sunPower: 3.6, sunVisibility: 0.92, rain: 0, fog: 0xddbb87 },
      flood: { label: '强降雨 · 无直射阳光', top: 0x526778, bottom: 0x9dafb3, lawn: 0x3e7049, hill: 0x415f4a, grass: 0x31683d, cloud: 0x6f7b84, cloudOpacity: 1, sun: 0x9fb0b7, sunPower: 0.18, sunVisibility: 0, rain: 1, fog: 0x81979e },
      drift: { label: '晴朗 · 传感器复核', top: 0x68b9e9, bottom: 0xeef4d1, lawn: 0x79aa56, hill: 0x668f4d, grass: 0x4f8e43, cloud: 0xffffff, cloudOpacity: 0.7, sun: 0xffe39a, sunPower: 2.8, sunVisibility: 1, rain: 0, fog: 0xc9e1d0 },
      stuck: { label: '多云 · 执行异常', top: 0x799eb5, bottom: 0xd5dfce, lawn: 0x668f53, hill: 0x587a51, grass: 0x467b46, cloud: 0xcbd3d1, cloudOpacity: 0.9, sun: 0xe8dbb4, sunPower: 1.18, sunVisibility: 0.24, rain: 0, fog: 0xb8c9bf }
    };
    const normal = weatherPresets.normal;
    const target = weatherPresets[scenarioKey] || normal;
    let intensity = scenarioKey === 'normal' || scenarioKey === 'drift'
      ? 1
      : (scenarioKey === 'flood' ? 1 : 0.82 + Math.min(1, timeHours / 4) * 0.18);
    if (this.replayTrack === 'trackB' && timeHours > 0.55 && scenarioKey !== 'drift') {
      intensity *= Math.max(0.12, 1 - (timeHours - 0.55) / 2.4);
    }

    const mixColor = (baseHex, targetHex) => new THREE.Color(baseHex).lerp(new THREE.Color(targetHex), intensity);
    this.skyMaterial.uniforms.uTop.value.copy(mixColor(normal.top, target.top));
    this.skyMaterial.uniforms.uBottom.value.copy(mixColor(normal.bottom, target.bottom));
    this.lawnMaterial.color.copy(mixColor(normal.lawn, target.lawn));
    this.hillMaterials?.forEach((material, index) => material.color.copy(mixColor(index === 1 ? 0x648d4c : normal.hill, target.hill)));
    if (this.grassField?.material?.color) this.grassField.material.color.copy(mixColor(normal.grass, target.grass));

    const cloudOpacity = THREE.MathUtils.lerp(normal.cloudOpacity, target.cloudOpacity, intensity);
    this.cloudMaterials?.forEach(material => {
      material.color.copy(mixColor(normal.cloud, target.cloud));
      material.opacity = cloudOpacity;
    });

    const sunVisibility = THREE.MathUtils.lerp(normal.sunVisibility, target.sunVisibility, intensity);
    if (this.sunMesh?.material) this.sunMesh.material.opacity = 0;
    if (this.sunGlow?.material) {
      const glowOpacity = THREE.MathUtils.clamp((1.08 - cloudOpacity * 0.82) * sunVisibility, 0, 0.82);
      this.sunGlow.userData.baseOpacity = glowOpacity;
      this.sunGlow.material.opacity = glowOpacity;
    }
    if (this.sunRays?.material) {
      const rayOpacity = THREE.MathUtils.clamp((0.42 - cloudOpacity * 0.36) * sunVisibility, 0, 0.24);
      this.sunRays.userData.baseOpacity = rayOpacity;
      this.sunRays.material.opacity = rayOpacity;
    }
    if (this.sunLight) {
      this.sunLight.color.copy(mixColor(normal.sun, target.sun));
      this.sunLight.intensity = THREE.MathUtils.lerp(normal.sunPower, target.sunPower, intensity);
    }
    if (this.hemisphereLight) this.hemisphereLight.intensity = THREE.MathUtils.lerp(2.35, scenarioKey === 'flood' ? 1.7 : 2.15, intensity);

    const rainStrength = target.rain * intensity;
    if (this.rainParticles) {
      this.rainParticles.visible = rainStrength > 0.05;
      this.rainParticles.material.opacity = rainStrength;
    }
    const fogColor = mixColor(normal.fog, target.fog);
    if (this.scene.fog?.color) this.scene.fog.color.copy(fogColor);
    this.scene.background.copy(this.skyMaterial.uniforms.uTop.value);

    const weatherLabel = this.container.querySelector('[data-weather-label]');
    const recovering = this.replayTrack === 'trackB' && timeHours > 1 && !['normal', 'drift'].includes(scenarioKey);
    if (weatherLabel) weatherLabel.textContent = recovering ? `${target.label} · 处置恢复中` : target.label;
    this.container.dataset.weather = scenarioKey;
    this.container.dataset.weatherIntensity = intensity.toFixed(2);
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
    this.plantGroup.position.set(0, -0.33, 0); // Sits on the opaque planter soil surface
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
    const timeUnit = this.container.querySelector('[data-time-unit]');
    const tickerLoss = this.container.querySelector('[data-ticker-loss]');
    const tickerBenefit = this.container.querySelector('[data-ticker-benefit]');

    if (timeVal) timeVal.textContent = scenario.timeToRiskMinutes >= 999 ? '安全' : scenario.timeToRiskMinutes;
    if (timeUnit) timeUnit.textContent = scenario.timeToRiskMinutes >= 999 ? '' : '分钟';
    if (gaugeTitle) gaugeTitle.textContent = scenario.timeToRiskMinutes >= 999 ? '目前作物安全' : '距离明显受损还有';
    if (gaugeDesc) gaugeDesc.textContent = scenario.desc;
    if (tickerLoss) tickerLoss.textContent = scenario.trackA_loss;
    if (tickerBenefit) tickerBenefit.textContent = scenario.trackB_benefit;

    const actionLabel = this.container.querySelector('[data-btn-prescribe] span');
    const actionButton = this.container.querySelector('[data-btn-prescribe]');
    if (actionLabel) actionLabel.textContent = {
      normal: '目前无需处理',
      drought: '安排浇水约 153 升',
      heatwave: '开启喷雾降温并补水',
      flood: '停止浇水并打开排水',
      drift: '安排人员检查传感器',
      stuck: '切换备用水阀并报修'
    }[scenarioKey] || '生成处理方案';
    if (actionButton) actionButton.disabled = scenarioKey === 'normal';

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
        <div class="sandbox-diag-item sandbox-diag-simple">
          <i class="ph ${c.prob >= 94 ? 'ph-check-circle' : 'ph-warning-circle'}" style="color: ${c.color};"></i>
          <span class="sandbox-diag-name">${c.name}</span>
          <strong style="color: ${c.color};">${c.prob >= 94 ? '已确认' : '很可能'}</strong>
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
    if (sequence) sequence.textContent = timeHours === 0 ? '当前状态' : `已推演 ${timeHours.toFixed(1)} 小时`;
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
    if (timeDisplay) timeDisplay.textContent = timeHours === 0 ? '现在' : `${timeHours.toFixed(1)} 小时后`;

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
        wilting = Math.min(1.0, 0.32 + (timeHours / 4.0) * 0.82);
        chlorosis = Math.min(1.0, 0.14 + (timeHours / 4.0) * 0.72);
        soilWetness = Math.max(0.04, 0.22 - timeHours * 0.045);
        heatVaporOpacity = Math.min(0.36, 0.12 + timeHours * 0.06);
      } else {
        wilting = timeHours < 0.9 ? 0.32 * (1 - timeHours / 0.9) : 0.0;
        chlorosis = Math.max(0, 0.12 - timeHours * 0.16);
        soilWetness = timeHours < 0.5 ? 0.22 : 0.75;
      }
    } else if (s === 'heatwave') {
      if (isTrackA) {
        wilting = Math.min(1.0, 0.4 + (timeHours / 3.0) * 0.68);
        chlorosis = Math.min(1.0, 0.16 + (timeHours / 3.0) * 0.72);
        soilWetness = Math.max(0.04, 0.2 - timeHours * 0.042);
        heatVaporOpacity = Math.min(0.9, 0.52 + timeHours * 0.11);
      } else {
        wilting = timeHours < 0.6 ? 0.4 * (1 - timeHours / 0.6) : 0.0;
        chlorosis = Math.max(0, 0.14 - timeHours * 0.2);
        soilWetness = timeHours < 0.55 ? 0.22 : 0.72;
        heatVaporOpacity = 0.1;
      }
    } else if (s === 'flood') {
      floodVisible = isTrackA || timeHours < 1.15;
      soilWetness = isTrackA ? 0.95 : Math.max(0.62, 0.95 - timeHours * 0.22);
      wilting = isTrackA ? Math.min(0.78, 0.26 + (timeHours / 4.0) * 0.54) : Math.max(0, 0.24 - timeHours * 0.2);
      chlorosis = isTrackA ? Math.min(0.78, 0.2 + (timeHours / 4.0) * 0.58) : Math.max(0, 0.2 - timeHours * 0.18);
    } else if (s === 'drift') {
      sensorError = true;
      wilting = 0.0;
      chlorosis = 0.0;
      soilWetness = 0.65;
    } else if (s === 'stuck') {
      actuatorFault = true;
      if (isTrackA) {
        wilting = Math.min(1, 0.2 + timeHours / 3.8);
        chlorosis = Math.min(0.82, 0.08 + timeHours / 4.8);
        soilWetness = Math.max(0.08, 0.3 - timeHours * 0.06);
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
      if (baseRotation) leaf.rotation.set(baseRotation.x + wilting * 1.02, baseRotation.y, baseRotation.z + wilting * 0.14);
      if (baseScale) leaf.scale.copy(baseScale).multiplyScalar(1 - wilting * 0.24);
    });

    if (this.soilMaterial) {
      const moistSoil = new THREE.Color(floodVisible ? 0x29352e : 0x3d291c);
      const drySoil = new THREE.Color(0x93683f);
      this.soilMaterial.color.copy(moistSoil).lerp(drySoil, Math.max(0, 1 - soilWetness) * 0.9);
      this.soilMaterial.opacity = 1;
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

    let soilMoisture = this.forecastValueAt(scenario, timeHours);
    if (!isTrackA && ['drought', 'heatwave', 'stuck'].includes(s) && timeHours > 0.45) {
      soilMoisture += (30 - soilMoisture) * Math.min(1, (timeHours - 0.45) / 0.9);
    } else if (!isTrackA && s === 'flood') {
      soilMoisture = Math.max(48, soilMoisture - timeHours * 11);
    }
    this.updateTelemetry(scenario, timeHours, soilMoisture, wilting, chlorosis);
    this.updateWeatherEnvironment(s, timeHours);

    const timeValue = this.container.querySelector('[data-time-val]');
    const timeUnit = this.container.querySelector('[data-time-unit]');
    const gaugeTitle = this.container.querySelector('[data-gauge-title]');
    if (timeValue && gaugeTitle) {
      if (scenario.timeToRiskMinutes >= 999 || (!isTrackA && timeHours >= 0.75)) {
        timeValue.textContent = '安全';
        if (timeUnit) timeUnit.textContent = '';
        gaugeTitle.textContent = !isTrackA && timeHours >= 0.75 ? '处理后，风险已解除' : '目前作物安全';
      } else {
        timeValue.textContent = String(Math.max(0, Math.round(scenario.timeToRiskMinutes - timeHours * 60)));
        if (timeUnit) timeUnit.textContent = '分钟';
        gaugeTitle.textContent = '距离明显受损还有';
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
    this.cameraTarget.set(0.34, 0.08, 0);
    this.orbitRadius = 6.4;
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
    if (this.grassWindUniforms) {
      this.grassWindUniforms.uMeadowTime.value = elapsed;
      this.grassWindUniforms.uMeadowWind.value = 0.82 + Math.sin(elapsed * 0.29) * 0.2;
    }
    if (this.plantGroup) {
      const stress = this.currentMorph?.wilting || 0;
      this.plantGroup.rotation.z = Math.sin(elapsed * 0.82) * 0.014 * (1 - stress * 0.55) + stress * 0.035;
      this.plantGroup.rotation.x = Math.cos(elapsed * 0.61) * 0.006 + stress * 0.028;
    }

    this.cloudGroup?.children.forEach(cluster => {
      cluster.position.x += delta * (cluster.userData.speed || 0.08);
      cluster.position.y += Math.sin(elapsed * 0.22 + cluster.position.z) * delta * 0.012;
      if (cluster.position.x > 11.5) cluster.position.x = -11.5;
    });
    if (this.sunGlow?.material) {
      const weatherBase = this.sunGlow.userData.baseOpacity ?? this.sunGlow.material.opacity;
      this.sunGlow.scale.setScalar(5.35 + Math.sin(elapsed * 0.38) * 0.14);
      const glowPulse = weatherBase > 0.02 ? Math.sin(elapsed * 0.45) * 0.008 : 0;
      this.sunGlow.material.opacity = THREE.MathUtils.clamp(weatherBase + glowPulse, 0, 0.86);
    }
    if (this.sunRays?.material) {
      const rayBase = this.sunRays.userData.baseOpacity ?? 0.12;
      const rayPulse = rayBase > 0.01 ? Math.sin(elapsed * 0.31) * 0.009 : 0;
      this.sunRays.material.opacity = THREE.MathUtils.clamp(rayBase + rayPulse, 0, 0.27);
      this.sunRays.material.rotation = -0.42 + Math.sin(elapsed * 0.16) * 0.012;
    }

    if (this.rainParticles?.visible) {
      const rainPosition = this.rainParticles.geometry.attributes.position.array;
      for (let offset = 0; offset < rainPosition.length; offset += 6) {
        rainPosition[offset] += delta * 0.42;
        rainPosition[offset + 1] -= delta * 7.8;
        rainPosition[offset + 3] += delta * 0.42;
        rainPosition[offset + 4] -= delta * 7.8;
        if (rainPosition[offset + 1] < -1.2) {
          const resetY = 6.8 + ((offset * 13) % 17) * 0.08;
          rainPosition[offset + 1] = resetY;
          rainPosition[offset + 4] = resetY - 0.24;
        }
      }
      this.rainParticles.geometry.attributes.position.needsUpdate = true;
    }

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
      this.floodWater.position.y = 0.035 + Math.sin(elapsed * 1.35) * 0.006;
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
