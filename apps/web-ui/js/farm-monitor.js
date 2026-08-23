const WORLD = { width: 1590, height: 992 };

const CROP_PROFILES = {
  tomato: {
    label: '番茄', family: '茄果类', hue: -4, saturation: 1.18, scale: 0.88,
    source: { x: 560, y: 635, w: 430, h: 260 }
  },
  cucumber: {
    label: '黄瓜', family: '瓜果类', hue: 12, saturation: 1.05, scale: 1,
    source: { x: 1050, y: 470, w: 420, h: 235 }
  },
  rice: {
    label: '水稻', family: '粮食类', hue: 28, saturation: 1.28, scale: 0.68,
    source: { x: 1260, y: 265, w: 300, h: 205 }
  },
  corn: {
    label: '玉米', family: '粮食类', hue: 4, saturation: 1.34, scale: 1.15,
    source: { x: 770, y: 480, w: 420, h: 245 }
  }
};

const STAGE_PROFILES = {
  seedling: { label: '苗期', shortLabel: '苗期', density: 0.44, height: 0.58, tint: 32 },
  vegetative: { label: '营养生长期', shortLabel: '生长期', density: 0.7, height: 0.78, tint: 18 },
  flowering: { label: '开花坐果期', shortLabel: '开花期', density: 0.88, height: 0.92, tint: 7 },
  fruiting: { label: '挂果采收期', shortLabel: '结果期', density: 1, height: 1, tint: -4 }
};

const PLOT_GEOMETRY = {
  'plot-a01': {
    x: 338, y: 400, w: 510, h: 300,
    polygon: [[0.07, 0.08], [0.94, 0], [1, 0.73], [0.8, 1], [0, 0.86]]
  },
  'plot-a02': {
    x: 748, y: 376, w: 490, h: 236,
    polygon: [[0.06, 0.1], [0.93, 0], [1, 0.76], [0.12, 1], [0, 0.35]]
  },
  'plot-b01': {
    x: 1065, y: 470, w: 445, h: 244,
    polygon: [[0.08, 0.08], [0.96, 0], [1, 0.74], [0.11, 1], [0, 0.3]]
  }
};

const WEATHER_LABELS = {
  sunny: '晴',
  cloudy: '多云',
  overcast: '阴',
  'light-rain': '小雨',
  'moderate-rain': '中雨',
  'heavy-rain': '大雨'
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (from, to, progress) => from + (to - from) * progress;

function mapWeatherCode(code, precipitation = 0) {
  if ([65, 67, 82, 95, 96, 99].includes(code) || precipitation >= 7.6) return 'heavy-rain';
  if ([63, 81].includes(code) || precipitation >= 2.6) return 'moderate-rain';
  if ([51, 53, 55, 56, 57, 61, 66, 80].includes(code) || precipitation > 0) return 'light-rain';
  if ([3, 45, 48].includes(code)) return 'overcast';
  if ([1, 2].includes(code)) return 'cloudy';
  return 'sunny';
}

function formatCoordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
}

function polygonCss(geometry) {
  return geometry.polygon.map(([x, y]) => `${Math.round(x * 100)}% ${Math.round(y * 100)}%`).join(',');
}

class FarmWorldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ready = false;
    this.cropMasks = {};
    this.canopyMasks = [];
    this.waterMask = null;
    this.plotWind = new Map();
    canvas.width = WORLD.width;
    canvas.height = WORLD.height;
  }

  async init() {
    try {
      const image = new Image();
      image.src = 'assets/farm/farm-day.png';
      await image.decode();
      const base = document.createElement('canvas');
      base.width = WORLD.width;
      base.height = WORLD.height;
      base.getContext('2d').drawImage(image, 0, 0, WORLD.width, WORLD.height);
      this.base = base;

      Object.entries(CROP_PROFILES).forEach(([key, profile]) => {
        this.cropMasks[key] = this.createVegetationMask(base, profile.source);
      });

      this.canopyMasks = [
        { region: { x: 0, y: 70, w: 420, h: 420 }, strength: 0.18 },
        { region: { x: 1080, y: 45, w: 510, h: 390 }, strength: 0.17 },
        { region: { x: 420, y: 100, w: 590, h: 285 }, strength: 0.12 },
        { region: { x: 0, y: 700, w: 350, h: 292 }, strength: 0.22 }
      ].map(item => ({
        ...item,
        mask: this.createVegetationMask(base, item.region)
      }));

      this.waterMask = this.createWaterMask(base);
      this.ready = true;
    } catch (error) {
      console.warn('[FarmMonitor] 动态场景图层初始化失败，保留静态背景降级。', error);
    }
  }

  createVegetationMask(base, region) {
    const canvas = document.createElement('canvas');
    canvas.width = region.w;
    canvas.height = region.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(base, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
    const frame = ctx.getImageData(0, 0, region.w, region.h);
    const pixels = frame.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const dominance = green - Math.max(red, blue);
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      pixels[index + 3] = clamp((dominance - 2) * 12 + saturation * 1.25, 0, 230);
    }
    ctx.putImageData(frame, 0, 0);
    return canvas;
  }

  createWaterMask(base) {
    const canvas = document.createElement('canvas');
    canvas.width = WORLD.width;
    canvas.height = WORLD.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(base, 0, 0);
    const frame = ctx.getImageData(0, 0, WORLD.width, WORLD.height);
    const pixels = frame.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const score = blue - red + (green - red) * 0.42;
      pixels[index + 3] = clamp((score - 8) * 6, 0, 120);
    }
    ctx.putImageData(frame, 0, 0);
    return canvas;
  }

  tracePolygon(ctx, geometry) {
    ctx.beginPath();
    geometry.polygon.forEach(([px, py], index) => {
      const x = geometry.x + px * geometry.w;
      const y = geometry.y + py * geometry.h;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }

  render(timestamp, plots, cropOverride, stageOverride, plotStageOverrides, wind, weatherKind, nightAmount) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    if (!this.ready) return;
    const time = timestamp * 0.001;
    this.drawMovingCanopies(time, wind, nightAmount);
    this.drawWater(time, weatherKind, nightAmount);
    plots.forEach((plot, plotIndex) => {
      const geometry = PLOT_GEOMETRY[plot.plotId];
      if (!geometry) return;
      const cropCode = cropOverride === 'auto' ? plot.cropCode : cropOverride;
      const stageCode = stageOverride === 'auto'
        ? (plotStageOverrides.get(plot.plotId) || plot.stageCode)
        : stageOverride;
      this.drawCropField(time, plot, plotIndex, geometry, cropCode, stageCode, wind, nightAmount);
    });
    this.drawCloudShadow(time, weatherKind, nightAmount);
  }

  drawMovingCanopies(time, wind, nightAmount) {
    const ctx = this.ctx;
    this.canopyMasks.forEach((canopy, canopyIndex) => {
      const { region, mask, strength } = canopy;
      ctx.save();
      ctx.globalAlpha = (0.17 - nightAmount * 0.04);
      ctx.globalCompositeOperation = 'screen';
      const sliceHeight = 8;
      for (let sy = 0; sy < region.h; sy += sliceHeight) {
        const flexibility = Math.pow(1 - sy / region.h, 1.25);
        const idle = Math.sin(time * 0.82 + sy * 0.026 + canopyIndex * 1.8) * 1.7;
        const ripple = Math.sin(time * 1.5 - region.x * 0.005 + sy * 0.018) * 0.8;
        const offsetX = (idle + ripple + wind.x * strength) * flexibility;
        ctx.drawImage(
          mask,
          0, sy, region.w, sliceHeight,
          region.x + offsetX, region.y + sy, region.w, sliceHeight + 1
        );
      }
      ctx.restore();
    });
  }

  drawWater(time, weatherKind, nightAmount) {
    if (!this.waterMask) return;
    const ctx = this.ctx;
    const rainy = weatherKind.includes('rain');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (rainy ? 0.11 : 0.27) * (1 - nightAmount * 0.4);
    ctx.drawImage(this.waterMask, Math.sin(time * 0.78) * 2.5, Math.cos(time * 1.2) * 1.4);
    ctx.globalAlpha = rainy ? 0.07 : 0.18;
    for (let row = 0; row < 8; row += 1) {
      const y = 220 + row * 28 + Math.sin(time * 1.35 + row) * 4;
      const x = 700 + ((time * 26 + row * 83) % 430);
      const width = 24 + row * 4;
      const glow = ctx.createLinearGradient(x, y, x + width, y);
      glow.addColorStop(0, 'rgba(255,255,255,0)');
      glow.addColorStop(0.5, 'rgba(242,255,255,.9)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x, y, width, 1.2);
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.waterMask, 0, 0);
    ctx.restore();
  }

  drawCropField(time, plot, plotIndex, geometry, cropCode, stageCode, wind, nightAmount) {
    const source = this.cropMasks[cropCode] || this.cropMasks.tomato;
    const crop = CROP_PROFILES[cropCode] || CROP_PROFILES.tomato;
    const stage = STAGE_PROFILES[stageCode] || STAGE_PROFILES.vegetative;
    if (!source) return;

    const current = this.plotWind.get(plot.plotId) || { x: 0, y: 0 };
    const delay = 0.044 + plotIndex * 0.009;
    current.x += (wind.x * (0.78 + plotIndex * 0.1) - current.x) * delay;
    current.y += (wind.y - current.y) * delay;
    this.plotWind.set(plot.plotId, current);

    const ctx = this.ctx;
    const columns = cropCode === 'corn' ? 13 : 15;
    const rows = cropCode === 'rice' ? 13 : 12;
    const sourceCellW = source.width / columns;
    const sourceCellH = source.height / rows;
    const targetCellW = geometry.w / columns;
    const targetCellH = geometry.h / rows;

    ctx.save();
    this.tracePolygon(ctx, geometry);
    ctx.clip();
    ctx.filter = `hue-rotate(${crop.hue + stage.tint}deg) saturate(${crop.saturation}) brightness(${1.05 - nightAmount * 0.2})`;
    ctx.globalAlpha = 0.1 + stage.density * 0.2;
    ctx.globalCompositeOperation = 'soft-light';

    for (let row = 0; row < rows; row += 1) {
      const vertical = row / (rows - 1);
      const flex = Math.pow(1 - vertical, 1.55) * stage.height * crop.scale;
      for (let column = 0; column < columns; column += 1) {
        if (stageCode === 'seedling' && (column + row) % 3 === 0) continue;
        const worldX = geometry.x + column * targetCellW;
        const propagation = time * 2.15 - worldX * 0.012 - plotIndex * 1.25;
        const idle = Math.sin(propagation) * 2.2 + Math.sin(propagation * 0.48 + column * 0.33) * 1.15;
        const gust = Math.sin(time * 4.1 - column * 0.58 - plotIndex) * Math.abs(current.x) * 0.11;
        const bendX = (idle + current.x + gust) * flex;
        const bendY = (current.y * 0.22 - Math.abs(current.x) * 0.07) * flex;
        const dx = geometry.x + column * targetCellW + bendX;
        const dy = geometry.y + row * targetCellH + bendY + (1 - stage.height) * geometry.h * 0.14;
        ctx.drawImage(
          source,
          column * sourceCellW, row * sourceCellH, sourceCellW + 1, sourceCellH + 1,
          dx, dy, targetCellW + 1.8, targetCellH + 1.8
        );
      }
    }

    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.055 + Math.min(Math.abs(current.x) / 90, 0.08);
    const bandX = geometry.x + ((time * 45 + plotIndex * 150) % (geometry.w + 190)) - 95;
    const band = ctx.createLinearGradient(bandX - 62, 0, bandX + 62, 0);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(231,255,212,.92)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band;
    ctx.fillRect(geometry.x, geometry.y, geometry.w, geometry.h);
    ctx.restore();
  }

  drawCloudShadow(time, weatherKind, nightAmount) {
    const cloudy = weatherKind === 'cloudy' || weatherKind === 'overcast' || weatherKind.includes('rain');
    if (!cloudy || nightAmount > 0.7) return;
    const ctx = this.ctx;
    const travel = (time * 20) % (WORLD.width + 760) - 380;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = weatherKind === 'overcast' ? 0.14 : 0.075;
    const shadow = ctx.createRadialGradient(travel, 420, 40, travel, 420, 360);
    shadow.addColorStop(0, 'rgba(57,83,70,.78)');
    shadow.addColorStop(1, 'rgba(57,83,70,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.restore();
  }
}

export class FarmMonitor {
  constructor({ plots = [], onExit, onSandbox }) {
    this.plots = plots;
    this.onExit = onExit;
    this.onSandbox = onSandbox;
    this.active = false;
    this.mounted = false;
    this.activePlotId = null;
    this.cropOverride = 'auto';
    this.stageOverride = 'auto';
    this.plotStageOverrides = new Map();
    this.weather = {
      kind: 'sunny', label: '晴', temperature: 28.4, humidity: 68,
      windSpeed: 7.2, precipitation: 0, location: '重庆 · 科学城',
      source: '定位与天气加载中'
    };
    this.wind = {
      x: 0, y: 0, tx: 0, ty: 0,
      lastX: null, lastY: null, lastMove: 0
    };
    this.parallax = { x: 0, y: 0, tx: 0, ty: 0 };
    this.rainDrops = [];
    this.airParticles = [];
    this.clickTimer = null;
    this.lastSceneState = '';
  }

  setPlots(plots) {
    this.plots = plots || [];
    if (this.mounted) this.renderPlots();
  }

  mount() {
    if (this.mounted) return;
    const shell = document.createElement('section');
    shell.id = 'farmMonitorPage';
    shell.className = 'farm-monitor-shell';
    shell.hidden = true;
    shell.innerHTML = `
      <div class="farm-stage-surface" id="farmStageSurface">
        <img class="farm-scene-layer" data-scene="day" src="assets/farm/farm-day.png" alt="同一农场白昼场景">
        <img class="farm-scene-layer" data-scene="sunrise" src="assets/farm/farm-sunrise.png" alt="同一农场日出场景">
        <img class="farm-scene-layer" data-scene="sunset" src="assets/farm/farm-sunset.png" alt="同一农场日落场景">
        <img class="farm-scene-layer" data-scene="night" src="assets/farm/farm-night.png" alt="同一农场夜间场景">
        <img class="farm-scene-layer" data-scene="rain" src="assets/farm/farm-rain.png" alt="同一农场雨天场景">
        <div class="farm-sun-light" aria-hidden="true"></div>
        <div class="farm-cloud-bands" aria-hidden="true"><i></i><i></i><i></i></div>
        <canvas class="farm-world-canvas" id="farmWorldCanvas" width="1590" height="992" aria-hidden="true"></canvas>
        <div class="farm-plot-layer" id="farmPlotLayer"></div>
      </div>
      <canvas class="farm-weather-canvas" id="farmWeatherCanvas" aria-hidden="true"></canvas>
      <div class="farm-vignette" aria-hidden="true"></div>
      <div class="farm-pointer-wind" id="farmPointerWind" aria-hidden="true"><i></i><i></i><i></i></div>

      <header class="farm-topbar">
        <div class="farm-brand-block">
          <button class="farm-icon-button" id="farmBackButton" type="button" aria-label="返回农智总览">←</button>
          <div><b>AGRI LOOP</b><span>农田动态监测</span></div>
        </div>
        <div class="farm-clock-block">
          <span class="farm-live-dot"></span>
          <strong id="farmClock">--:--:--</strong>
          <span id="farmDate">----</span>
        </div>
        <div class="farm-weather-block">
          <div><strong id="farmWeatherLabel">晴</strong><b id="farmTemperature">28.4°C</b></div>
          <span id="farmLocation">重庆 · 科学城</span>
          <small id="farmWeatherSource">定位与天气加载中</small>
        </div>
      </header>

      <aside class="farm-crop-dock" aria-label="作物与阶段图层">
        <div class="farm-dock-title"><div><b>作物图层</b><span>全场实时联动</span></div><em>LIVE</em></div>
        <div class="farm-crop-options" id="farmCropOptions">
          <button class="active" type="button" data-crop="auto"><b>自动</b><span>地块档案</span></button>
          <button type="button" data-crop="tomato"><b>番茄</b><span>茄果类</span></button>
          <button type="button" data-crop="cucumber"><b>黄瓜</b><span>瓜果类</span></button>
          <button type="button" data-crop="rice"><b>水稻</b><span>粮食类</span></button>
          <button type="button" data-crop="corn"><b>玉米</b><span>粮食类</span></button>
        </div>
        <label class="farm-stage-select">
          <span>阶段演示</span>
          <select id="farmStageSelect">
            <option value="auto">跟随每块地 Crop Pack</option>
            <option value="seedling">全部切换为苗期</option>
            <option value="vegetative">全部切换为营养生长期</option>
            <option value="flowering">全部切换为开花坐果期</option>
            <option value="fruiting">全部切换为挂果采收期</option>
          </select>
        </label>
      </aside>

      <div class="farm-wind-status">
        <span class="farm-wind-glyph">WIND</span>
        <div><b id="farmWindSpeed">7.2 km/h</b><span id="farmWindText">自然微风 · 作物持续自主摇曳</span></div>
      </div>

      <div class="farm-scene-status" id="farmSceneStatus">
        <span>实时场景</span><b>明亮白昼</b><small>下一次日落动画 18:00</small>
      </div>

      <article class="farm-plot-panel" id="farmPlotPanel" aria-hidden="true">
        <div class="farm-panel-accent"></div>
        <header class="farm-panel-header">
          <div><span id="farmPanelPlotId">PLOT A-01</span><h2 id="farmPanelTitle">温室 1 号棚</h2><p id="farmPanelCrop">番茄 · 挂果采收期</p></div>
          <button class="farm-panel-close" id="farmPanelClose" type="button" aria-label="关闭地块详情">×</button>
        </header>
        <div class="farm-health-hero">
          <div><span>作物健康度</span><strong id="farmHealthScore">96</strong><small>/100</small></div>
          <span class="farm-status-badge" id="farmPanelStatus">健康良好</span>
        </div>
        <div class="farm-panel-status-row"><span id="farmPanelUpdated">设备心跳 · 刚刚</span><span>实时遥测</span></div>
        <section class="farm-panel-section">
          <div class="farm-panel-section-title"><span>传感器状态</span><span>5 项实时指标</span></div>
          <div class="farm-metric-grid" id="farmMetricGrid"></div>
        </section>
        <section class="farm-panel-section">
          <div class="farm-panel-section-title"><span>环境曲线</span><span>近 12 小时</span></div>
          <canvas class="farm-chart" id="farmEnvironmentChart"></canvas>
          <div class="farm-chart-legend"><span><i class="soil"></i>土壤湿度</span><span><i class="air"></i>空气温度</span><span id="farmChartRange">适宜 20%–40%</span></div>
        </section>
        <section class="farm-panel-section">
          <div class="farm-panel-section-title"><span>作物生长阶段</span><span id="farmStageProgress">75%</span></div>
          <div class="farm-stage-timeline" id="farmStageTimeline"></div>
        </section>
        <button class="farm-sandbox-entry" id="farmSandboxEntry" type="button">
          <span>未来风险推演与情景模拟沙盘</span><small>双击地块进入 · 当前仅预留入口</small>
        </button>
      </article>

      <div class="farm-monitor-toast" id="farmMonitorToast" role="status" aria-live="polite"></div>
    `;

    document.body.appendChild(shell);
    this.shell = shell;
    this.stage = shell.querySelector('#farmStageSurface');
    this.plotLayer = shell.querySelector('#farmPlotLayer');
    this.sceneLayers = [...shell.querySelectorAll('.farm-scene-layer')];
    this.weatherCanvas = shell.querySelector('#farmWeatherCanvas');
    this.weatherCtx = this.weatherCanvas.getContext('2d');
    this.pointerWind = shell.querySelector('#farmPointerWind');
    this.panel = shell.querySelector('#farmPlotPanel');
    this.chart = shell.querySelector('#farmEnvironmentChart');
    this.chartCtx = this.chart.getContext('2d');
    this.world = new FarmWorldRenderer(shell.querySelector('#farmWorldCanvas'));
    this.world.init();
    this.bindEvents();
    this.renderPlots();
    this.handleResize();
    this.mounted = true;
  }

  bindEvents() {
    this.shell.querySelector('#farmBackButton').addEventListener('click', () => this.close(true));
    this.shell.querySelector('#farmPanelClose').addEventListener('click', () => this.closePanel());
    this.shell.querySelector('#farmCropOptions').addEventListener('click', event => {
      const button = event.target.closest('[data-crop]');
      if (!button) return;
      this.cropOverride = button.dataset.crop;
      this.shell.querySelectorAll('[data-crop]').forEach(item => item.classList.toggle('active', item === button));
      this.renderPlots();
      if (this.activePlotId) this.openPanel(this.activePlotId, false);
    });
    this.shell.querySelector('#farmStageSelect').addEventListener('change', event => {
      this.stageOverride = event.target.value;
      this.renderPlots();
      if (this.activePlotId) this.openPanel(this.activePlotId, false);
    });
    this.shell.querySelector('#farmSandboxEntry').addEventListener('click', () => {
      this.openSandboxPlaceholder(this.activePlotId);
    });
    this.shell.addEventListener('pointermove', event => this.captureWind(event));
    this.shell.addEventListener('pointerleave', () => {
      this.wind.lastX = null;
      this.wind.lastY = null;
      this.pointerWind.classList.remove('active');
    });
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('keydown', event => {
      if (!this.active || event.key !== 'Escape') return;
      if (this.panel.classList.contains('active')) this.closePanel();
      else this.close(true);
    });
  }

  open(plotId) {
    this.mount();
    this.active = true;
    this.shell.hidden = false;
    document.body.classList.add('farm-monitor-open');
    document.title = '农田动态监测 · AgriLoop';
    requestAnimationFrame(() => this.shell.classList.add('active'));
    this.startRuntime();
    if (plotId && this.plots.some(plot => plot.plotId === plotId)) {
      this.activePlotId = plotId;
      this.highlightActivePlot();
    }
  }

  close(notify = false) {
    if (!this.mounted) return;
    this.closePanel();
    this.active = false;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.weatherTimer) clearInterval(this.weatherTimer);
    this.frameId = null;
    this.clockTimer = null;
    this.weatherTimer = null;
    this.shell.classList.remove('active');
    document.body.classList.remove('farm-monitor-open');
    document.title = 'AgriLoop · 农智闭环 - 智慧农业智能中枢';
    setTimeout(() => {
      if (!this.active) this.shell.hidden = true;
    }, 420);
    if (notify) this.onExit?.();
  }

  startRuntime() {
    if (!this.frameId) this.animate();
    this.updateClockAndScene();
    if (!this.clockTimer) this.clockTimer = setInterval(() => this.updateClockAndScene(), 1000);
    if (!this.weatherTimer) {
      this.refreshWeather();
      this.weatherTimer = setInterval(() => this.refreshWeather(), 10 * 60 * 1000);
    }
  }

  renderPlots() {
    if (!this.plotLayer) return;
    this.plotLayer.innerHTML = this.plots.map(plot => {
      const geometry = PLOT_GEOMETRY[plot.plotId];
      if (!geometry) return '';
      const cropCode = this.cropOverride === 'auto' ? plot.cropCode : this.cropOverride;
      const stageCode = this.stageOverride === 'auto'
        ? (this.plotStageOverrides.get(plot.plotId) || plot.stageCode)
        : this.stageOverride;
      const crop = CROP_PROFILES[cropCode] || CROP_PROFILES.tomato;
      const stage = STAGE_PROFILES[stageCode] || STAGE_PROFILES.vegetative;
      const warning = this.isWarning(plot);
      const style = [
        `--x:${geometry.x / WORLD.width * 100}%`,
        `--y:${geometry.y / WORLD.height * 100}%`,
        `--w:${geometry.w / WORLD.width * 100}%`,
        `--h:${geometry.h / WORLD.height * 100}%`,
        `--plot-polygon:${polygonCss(geometry)}`
      ].join(';');
      return `
        <button class="farm-plot stage-${stageCode} ${this.activePlotId === plot.plotId ? 'selected' : ''}"
          type="button" data-plot-id="${plot.plotId}" data-stage="${stageCode}" style="${style}"
          aria-label="查看${plot.name}，${crop.label}${stage.label}${warning ? '，存在预警' : ''}">
          <span class="farm-plot-shape"><i></i></span>
          ${warning ? '<span class="farm-warning-marker" aria-label="当前地块存在预警"><b>!</b></span>' : ''}
          <span class="farm-plot-label">
            <span class="farm-plot-label-top"><b>${plot.name.replace('温室 ', '地块 ')}</b><i></i></span>
            <span>${crop.label} · ${stage.shortLabel}</span>
            <small>湿度 ${plot.metrics?.SOIL_MOISTURE?.value ?? '--'}%</small>
          </span>
        </button>`;
    }).join('');

    this.plotLayer.querySelectorAll('.farm-plot').forEach(button => {
      button.addEventListener('click', () => {
        clearTimeout(this.clickTimer);
        this.clickTimer = setTimeout(() => this.openPanel(button.dataset.plotId, true), 230);
      });
      button.addEventListener('dblclick', event => {
        event.preventDefault();
        clearTimeout(this.clickTimer);
        this.openSandboxPlaceholder(button.dataset.plotId);
      });
    });
  }

  isWarning(plot) {
    return plot.riskLevel === 'HIGH'
      || Object.values(plot.metrics || {}).some(metric => metric.status === 'WARN');
  }

  captureWind(event) {
    const now = performance.now();
    if (this.wind.lastX !== null) {
      const dx = event.clientX - this.wind.lastX;
      const dy = event.clientY - this.wind.lastY;
      this.wind.tx = clamp(this.wind.tx * 0.4 + dx * 0.78, -29, 29);
      this.wind.ty = clamp(this.wind.ty * 0.42 + dy * 0.38, -13, 13);
      const magnitude = Math.hypot(dx, dy);
      if (magnitude > 1.6) {
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        this.pointerWind.style.left = `${event.clientX}px`;
        this.pointerWind.style.top = `${event.clientY}px`;
        this.pointerWind.style.setProperty('--wind-angle', `${angle}deg`);
        this.pointerWind.style.setProperty('--wind-scale', `${clamp(magnitude / 16, 0.65, 1.45)}`);
        this.pointerWind.classList.add('active');
      }
    }
    this.wind.lastX = event.clientX;
    this.wind.lastY = event.clientY;
    this.wind.lastMove = now;
    this.parallax.tx = clamp((event.clientX / innerWidth - 0.5) * -13, -7, 7);
    this.parallax.ty = clamp((event.clientY / innerHeight - 0.5) * -9, -5, 5);
  }

  animate(timestamp = performance.now()) {
    const idle = timestamp - this.wind.lastMove > 900;
    if (idle) {
      this.wind.tx = Math.sin(timestamp / 1750) * 3.6 + Math.sin(timestamp / 650) * 0.9;
      this.wind.ty = Math.cos(timestamp / 2350) * 0.75;
      this.parallax.tx = Math.sin(timestamp / 9000) * 1.8;
      this.parallax.ty = Math.cos(timestamp / 11000) * 1.1;
      this.pointerWind?.classList.remove('active');
    } else {
      this.wind.tx *= 0.94;
      this.wind.ty *= 0.93;
    }

    this.wind.x += (this.wind.tx - this.wind.x) * 0.082;
    this.wind.y += (this.wind.ty - this.wind.y) * 0.078;
    this.parallax.x += (this.parallax.tx - this.parallax.x) * 0.035;
    this.parallax.y += (this.parallax.ty - this.parallax.y) * 0.035;
    this.stage?.style.setProperty('--parallax-x', `${this.parallax.x}px`);
    this.stage?.style.setProperty('--parallax-y', `${this.parallax.y}px`);

    const nightAmount = Number(this.shell?.dataset.nightAmount || 0);
    this.world?.render(
      timestamp,
      this.plots,
      this.cropOverride,
      this.stageOverride,
      this.plotStageOverrides,
      this.wind,
      this.weather.kind,
      nightAmount
    );
    this.drawAtmosphere(timestamp, nightAmount);

    const windLabel = this.shell?.querySelector('#farmWindText');
    if (windLabel) {
      windLabel.textContent = idle
        ? '自然微风 · 作物持续自主摇曳'
        : `${this.wind.x >= 0 ? '向东' : '向西'}风场 · 阵风沿指针方向传播`;
    }
    this.frameId = requestAnimationFrame(time => this.animate(time));
  }

  getClock() {
    const now = new Date();
    const demo = new URLSearchParams(location.search).get('demoTime');
    if (demo) {
      const [hour, minute = '0', second = '0'] = demo.split(':');
      now.setHours(Number(hour), Number(minute), Number(second), 0);
    }
    return now;
  }

  getSceneWeights(minutes) {
    const weights = { day: 0, sunrise: 0, sunset: 0, night: 0, rain: 0 };
    let sceneLabel = '明亮白昼';
    let nextLabel = '下一次日落动画 18:00';
    let timeMode = 'day';
    let sceneFilter = 'brightness(1) saturate(1) sepia(0)';
    let nightAmount = 0;

    if (minutes < 360) {
      weights.night = 1;
      sceneLabel = '静谧夜间';
      nextLabel = '下一次日出动画 06:00';
      timeMode = 'night';
      nightAmount = 1;
      sceneFilter = 'brightness(.92) saturate(1.04) sepia(0)';
    } else if (minutes < 372) {
      const progress = (minutes - 360) / 12;
      weights.night = 1;
      sceneLabel = '日出进行中';
      nextLabel = `晨光展开 ${Math.round(progress * 100)}%`;
      timeMode = 'sunrise';
      nightAmount = 1 - progress;
      sceneFilter = `brightness(${mix(0.92, 1.08, progress).toFixed(3)}) saturate(${mix(1.04, 1.16, progress).toFixed(3)}) sepia(${mix(0, 0.1, progress).toFixed(3)})`;
    } else if (minutes < 390) {
      const progress = (minutes - 372) / 18;
      weights.sunrise = 1;
      sceneLabel = '晨光过渡';
      nextLabel = `白昼建立 ${Math.round(progress * 100)}%`;
      timeMode = 'sunrise';
      nightAmount = 0;
      sceneFilter = `brightness(${mix(1.08, 1.02, progress).toFixed(3)}) saturate(${mix(1.16, 1.04, progress).toFixed(3)}) sepia(${mix(0.1, 0, progress).toFixed(3)})`;
    } else if (minutes < 1080) {
      weights.day = 1;
    } else if (minutes < 1100) {
      const progress = (minutes - 1080) / 20;
      weights.day = 1;
      sceneLabel = '日落进行中';
      nextLabel = `金色时刻 ${Math.round(progress * 100)}%`;
      timeMode = 'sunset';
      nightAmount = progress * 0.18;
      sceneFilter = `brightness(${mix(1, 0.88, progress).toFixed(3)}) saturate(${mix(1, 1.18, progress).toFixed(3)}) sepia(${mix(0, 0.16, progress).toFixed(3)})`;
    } else if (minutes < 1125) {
      const progress = (minutes - 1100) / 25;
      weights.sunset = 1;
      sceneLabel = '暮色过渡';
      nextLabel = `夜幕降临 ${Math.round(progress * 100)}%`;
      timeMode = 'sunset';
      nightAmount = mix(0.18, 0.8, progress);
      sceneFilter = `brightness(${mix(0.9, 0.68, progress).toFixed(3)}) saturate(${mix(1.16, 0.92, progress).toFixed(3)}) sepia(${mix(0.14, 0.04, progress).toFixed(3)})`;
    } else {
      weights.night = 1;
      sceneLabel = '静谧夜间';
      nextLabel = '下一次日出动画 06:00';
      timeMode = 'night';
      nightAmount = 1;
      sceneFilter = 'brightness(.92) saturate(1.04) sepia(0)';
    }

    const rainOpacity = {
      'light-rain': 0.48,
      'moderate-rain': 0.68,
      'heavy-rain': 0.86
    }[this.weather.kind] || 0;
    weights.rain = rainOpacity ? 1 : 0;
    if (rainOpacity) {
      ['day', 'sunrise', 'sunset', 'night'].forEach(key => { weights[key] = 0; });
      sceneLabel = `${this.weather.label}动态天气`;
      nextLabel = '天气与昼夜层实时融合';
      const rainDarkness = this.weather.kind === 'heavy-rain' ? 0.84 : this.weather.kind === 'moderate-rain' ? 0.9 : 0.96;
      const nightDarkness = timeMode === 'night' ? 0.68 : timeMode === 'sunset' ? 0.82 : 1;
      sceneFilter = `brightness(${(rainDarkness * nightDarkness).toFixed(3)}) saturate(.88) sepia(${timeMode === 'sunset' ? 0.08 : 0})`;
    }

    return { weights, sceneLabel, nextLabel, timeMode, sceneFilter, nightAmount };
  }

  updateClockAndScene() {
    if (!this.mounted) return;
    const now = this.getClock();
    this.shell.querySelector('#farmClock').textContent = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(now);
    this.shell.querySelector('#farmDate').textContent = new Intl.DateTimeFormat('zh-CN', {
      month: 'long', day: 'numeric', weekday: 'short'
    }).format(now);

    const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const { weights, sceneLabel, nextLabel, timeMode, sceneFilter, nightAmount } = this.getSceneWeights(minutes);
    this.sceneLayers.forEach(layer => {
      layer.style.opacity = String(weights[layer.dataset.scene] || 0);
    });
    this.shell.dataset.nightAmount = String(nightAmount);
    this.shell.dataset.timeMode = timeMode;
    this.stage.style.filter = sceneFilter;
    const status = this.shell.querySelector('#farmSceneStatus');
    status.querySelector('b').textContent = sceneLabel;
    status.querySelector('small').textContent = nextLabel;
  }

  async refreshWeather() {
    const demo = new URLSearchParams(location.search).get('demoWeather');
    if (demo && WEATHER_LABELS[demo]) {
      this.weather = {
        ...this.weather,
        kind: demo,
        label: WEATHER_LABELS[demo],
        source: '演示天气参数',
        precipitation: demo === 'heavy-rain' ? 12.8 : demo === 'moderate-rain' ? 4.2 : demo === 'light-rain' ? 0.8 : 0
      };
      this.applyWeather();
      return;
    }

    const fallback = { latitude: 29.563, longitude: 106.5516, fallback: true };
    const coords = await new Promise(resolve => {
      if (!navigator.geolocation) return resolve(fallback);
      navigator.geolocation.getCurrentPosition(
        position => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          fallback: false
        }),
        () => resolve(fallback),
        { timeout: 6000, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false }
      );
    });

    try {
      const params = new URLSearchParams({
        latitude: coords.latitude,
        longitude: coords.longitude,
        current: 'temperature_2m,relative_humidity_2m,weather_code,precipitation,wind_speed_10m',
        timezone: 'auto'
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`weather-${response.status}`);
      const current = (await response.json()).current || {};
      const kind = mapWeatherCode(current.weather_code, current.precipitation);
      this.weather = {
        kind,
        label: WEATHER_LABELS[kind],
        temperature: current.temperature_2m ?? 28.4,
        humidity: current.relative_humidity_2m ?? 68,
        windSpeed: current.wind_speed_10m ?? 7.2,
        precipitation: current.precipitation ?? 0,
        location: coords.fallback
          ? '重庆 · 科学城'
          : `${formatCoordinate(coords.latitude, 'N', 'S')} · ${formatCoordinate(coords.longitude, 'E', 'W')}`,
        source: coords.fallback ? '定位未授权 · 重庆天气回退' : '当前位置 · Open-Meteo 实时天气'
      };
    } catch (error) {
      this.weather.source = '天气服务暂不可用 · 保留最近状态';
      console.warn('[FarmMonitor] 实时天气获取失败。', error);
    }
    this.applyWeather();
  }

  applyWeather() {
    if (!this.mounted) return;
    this.shell.dataset.weather = this.weather.kind;
    this.shell.querySelector('#farmWeatherLabel').textContent = this.weather.label;
    this.shell.querySelector('#farmTemperature').textContent = `${Number(this.weather.temperature).toFixed(1)}°C`;
    this.shell.querySelector('#farmLocation').textContent = this.weather.location;
    this.shell.querySelector('#farmWeatherSource').textContent = this.weather.source;
    this.shell.querySelector('#farmWindSpeed').textContent = `${Number(this.weather.windSpeed).toFixed(1)} km/h`;
    this.prepareAtmosphere();
    this.updateClockAndScene();
  }

  prepareAtmosphere() {
    const count = {
      'light-rain': 90,
      'moderate-rain': 180,
      'heavy-rain': 330
    }[this.weather.kind] || 0;
    this.rainDrops = Array.from({ length: count }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      length: 10 + Math.random() * 24,
      speed: 8 + Math.random() * 18,
      alpha: 0.11 + Math.random() * 0.34
    }));
    this.airParticles = Array.from({ length: 34 }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      radius: 0.6 + Math.random() * 1.5,
      speed: 0.08 + Math.random() * 0.2,
      phase: Math.random() * Math.PI * 2
    }));
  }

  drawAtmosphere(timestamp, nightAmount) {
    if (!this.weatherCtx) return;
    const width = this.weatherCanvas.clientWidth;
    const height = this.weatherCanvas.clientHeight;
    const ctx = this.weatherCtx;
    ctx.clearRect(0, 0, width, height);

    if (this.weather.kind.includes('rain')) {
      const intensity = this.weather.kind === 'heavy-rain' ? 1.35 : this.weather.kind === 'moderate-rain' ? 1 : 0.7;
      ctx.lineWidth = this.weather.kind === 'heavy-rain' ? 1.25 : 0.85;
      this.rainDrops.forEach(drop => {
        drop.x += 1.3 + this.wind.x * 0.06;
        drop.y += drop.speed * intensity;
        if (drop.y > height + drop.length) {
          drop.y = -drop.length;
          drop.x = Math.random() * width;
        }
        ctx.strokeStyle = `rgba(225,241,247,${drop.alpha})`;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 4 - this.wind.x * 0.025, drop.y + drop.length);
        ctx.stroke();
      });
      return;
    }

    if (this.weather.kind === 'sunny' || this.weather.kind === 'cloudy') {
      const time = timestamp * 0.001;
      ctx.globalCompositeOperation = 'screen';
      this.airParticles.forEach(particle => {
        particle.x += particle.speed + Math.max(this.wind.x, 0) * 0.008;
        particle.y += Math.sin(time * 0.45 + particle.phase) * 0.08;
        if (particle.x > width + 8) particle.x = -8;
        const alpha = (0.1 + Math.sin(time * 0.7 + particle.phase) * 0.04) * (1 - nightAmount);
        ctx.fillStyle = `rgba(255,246,194,${alpha})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  openPanel(plotId, animate = true) {
    const plot = this.plots.find(item => item.plotId === plotId);
    if (!plot) return;
    this.activePlotId = plotId;
    this.highlightActivePlot();
    const cropCode = this.cropOverride === 'auto' ? plot.cropCode : this.cropOverride;
    const stageCode = this.stageOverride === 'auto'
      ? (this.plotStageOverrides.get(plotId) || plot.stageCode)
      : this.stageOverride;
    const warning = this.isWarning(plot);

    const plotButton = this.plotLayer.querySelector(`[data-plot-id="${plotId}"]`);
    const plotRect = plotButton?.getBoundingClientRect();
    if (plotRect) {
      const panelWidth = this.panel.offsetWidth;
      const panelHeight = this.panel.offsetHeight;
      const panelLeft = innerWidth - 20 - panelWidth;
      const panelTop = 104;
      const originX = plotRect.left + plotRect.width / 2;
      const originY = plotRect.top + plotRect.height / 2;
      this.panel.style.setProperty('--panel-dx', `${originX - panelLeft - panelWidth / 2}px`);
      this.panel.style.setProperty('--panel-dy', `${originY - panelTop - panelHeight / 2}px`);
    }

    this.panel.classList.toggle('no-intro', !animate);
    this.shell.querySelector('#farmPanelPlotId').textContent = plot.plotId.replace('plot-', 'PLOT ').toUpperCase();
    this.shell.querySelector('#farmPanelTitle').textContent = plot.name;
    this.shell.querySelector('#farmPanelCrop').textContent = `${CROP_PROFILES[cropCode]?.label || plot.cropName} · ${STAGE_PROFILES[stageCode]?.label || plot.stageLabel}`;
    this.shell.querySelector('#farmHealthScore').textContent = Math.round((plot.healthScore || 0.96) * 100);
    const status = this.shell.querySelector('#farmPanelStatus');
    status.textContent = warning ? '需要关注' : '健康良好';
    status.classList.toggle('warning', warning);
    this.shell.querySelector('#farmPanelUpdated').textContent = `设备心跳 · ${plot.lastSeen || '刚刚'}`;
    this.renderMetrics(plot);
    this.renderStageTimeline(stageCode);
    this.shell.querySelector('#farmChartRange').textContent = `适宜 ${String(plot.metrics?.SOIL_MOISTURE?.target || '20~40%').replace('~', '–')}`;
    this.panel.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      this.panel.classList.add('active');
      requestAnimationFrame(() => this.drawChart(plot));
    });
  }

  renderMetrics(plot) {
    const keys = ['SOIL_MOISTURE', 'AIR_TEMPERATURE', 'LIGHT', 'CO2', 'PH'];
    this.shell.querySelector('#farmMetricGrid').innerHTML = keys.map(key => {
      const metric = plot.metrics?.[key];
      if (!metric) return '';
      return `
        <div class="farm-metric-card ${metric.status === 'WARN' ? 'warning' : ''}">
          <span>${metric.label}</span>
          <strong>${metric.value}<small>${metric.unit}</small></strong>
          <em>${metric.target}</em>
        </div>`;
    }).join('');
  }

  renderStageTimeline(activeStage) {
    const keys = Object.keys(STAGE_PROFILES);
    const index = Math.max(0, keys.indexOf(activeStage));
    this.shell.querySelector('#farmStageProgress').textContent = `${Math.round((index + 1) / keys.length * 100)}%`;
    this.shell.querySelector('#farmStageTimeline').innerHTML = keys.map((key, nodeIndex) => `
      <button type="button" class="farm-stage-node ${nodeIndex <= index ? 'complete' : ''} ${key === activeStage ? 'current' : ''}" data-stage="${key}">
        <i></i><span>${STAGE_PROFILES[key].shortLabel}</span>
      </button>`).join('');
    this.shell.querySelectorAll('.farm-stage-node').forEach(button => {
      button.addEventListener('click', () => {
        if (!this.activePlotId) return;
        this.stageOverride = 'auto';
        this.shell.querySelector('#farmStageSelect').value = 'auto';
        this.plotStageOverrides.set(this.activePlotId, button.dataset.stage);
        this.renderPlots();
        this.openPanel(this.activePlotId, false);
      });
    });
  }

  drawChart(plot) {
    const rect = this.chart.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.chart.width = rect.width * dpr;
    this.chart.height = rect.height * dpr;
    this.chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ctx = this.chartCtx;
    const width = rect.width;
    const height = rect.height;
    const moistureBase = Number(plot.metrics?.SOIL_MOISTURE?.value || 25);
    const airBase = Number(plot.metrics?.AIR_TEMPERATURE?.value || 26);
    const moisture = Array.from({ length: 13 }, (_, i) => moistureBase + Math.sin(i * 0.64 + 1.2) * 2.2 + (6 - i) * 0.24);
    const air = Array.from({ length: 13 }, (_, i) => airBase + Math.sin(i * 0.48 - 0.7) * 1.4 + i * 0.06);

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(23,71,49,.1)';
    ctx.lineWidth = 1;
    for (let row = 0; row < 4; row += 1) {
      const y = 14 + (height - 34) / 3 * row;
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(width - 8, y);
      ctx.stroke();
    }

    const drawSeries = (values, color, fill = false) => {
      const minValue = Math.min(...values) - 3;
      const maxValue = Math.max(...values) + 3;
      const points = values.map((value, index) => ({
        x: 8 + index * (width - 16) / (values.length - 1),
        y: 12 + (maxValue - value) / (maxValue - minValue) * (height - 34)
      }));
      if (fill) {
        const gradient = ctx.createLinearGradient(0, 10, 0, height);
        gradient.addColorStop(0, 'rgba(51,157,102,.22)');
        gradient.addColorStop(1, 'rgba(51,157,102,0)');
        ctx.beginPath();
        points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        ctx.lineTo(width - 8, height - 18);
        ctx.lineTo(8, height - 18);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    drawSeries(moisture, '#238a59', true);
    drawSeries(air, '#e8a13c');
  }

  closePanel() {
    if (!this.panel) return;
    this.panel.classList.remove('active', 'no-intro');
    this.panel.setAttribute('aria-hidden', 'true');
    this.activePlotId = null;
    this.highlightActivePlot();
  }

  highlightActivePlot() {
    this.plotLayer?.querySelectorAll('.farm-plot').forEach(button => {
      button.classList.toggle('selected', button.dataset.plotId === this.activePlotId);
    });
  }

  openSandboxPlaceholder(plotId) {
    const plot = this.plots.find(item => item.plotId === plotId);
    this.showToast(`【${plot?.name || plotId || '当前地块'}】未来风险推演沙盘入口已预留，本阶段不跳转。`);
    this.onSandbox?.(plotId);
  }

  showToast(message) {
    const toast = this.shell.querySelector('#farmMonitorToast');
    toast.textContent = message;
    toast.classList.add('active');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('active'), 4000);
  }

  handleResize() {
    if (!this.weatherCanvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.weatherCanvas.width = innerWidth * dpr;
    this.weatherCanvas.height = innerHeight * dpr;
    this.weatherCanvas.style.width = `${innerWidth}px`;
    this.weatherCanvas.style.height = `${innerHeight}px`;
    this.weatherCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.prepareAtmosphere();
    const plot = this.plots.find(item => item.plotId === this.activePlotId);
    if (plot) this.drawChart(plot);
  }
}
