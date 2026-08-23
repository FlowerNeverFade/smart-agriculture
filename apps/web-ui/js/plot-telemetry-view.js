/**
 * Full-page plot telemetry view: plot slider + multi-metric time series charts.
 */
import { api } from './api.js?v=5';
import { TELEMETRY_METRICS, groupByMetric, drawLineChart } from './telemetry-charts.js';

export class PlotTelemetryView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.plotId = null;
    this.points = [];
    this.loading = false;
    this.pendingRefresh = false;
    this.liveTimer = null;
    this.expandedMetric = null;
    this.drumIndex = 0;
    this.drumOffset = 0;
    this.drumBound = false;
    this._drumRadius = 0;
    this._drumCardH = 0;
    this._drumLaidOut = false;
    this._drumAnim = null;
    this._drumSnapTimer = null;
    this._gestureOrigin = 0;
    this._gestureAcc = 0;
    this._suppressCardClick = false;
    this._onThemeChange = () => this.redrawCharts();
    this._onContainerClick = (e) => {
      if (e.target.closest('#btnTelemetryZoomBack')) {
        this.closeMetricZoom();
        return;
      }
      if (e.target.closest('#btnDrumPrev')) {
        this.nudgeDrum(-1);
        return;
      }
      if (e.target.closest('#btnDrumNext')) {
        this.nudgeDrum(1);
        return;
      }
      if (this._suppressCardClick) return;
      const card = e.target.closest('.telemetry-chart-card');
      if (!card || !this.container?.contains(card)) return;
      if (!card.classList.contains('is-focus')) return;
      const code = card.dataset.metricCard;
      if (code) this.openMetricZoom(code);
    };
    this._onZoomKeydown = (e) => {
      if (e.key === 'Escape') this.closeMetricZoom();
    };
    this._onDrumWheel = (e) => {
      if (this.expandedMetric) return;
      e.preventDefault();
      this.nudgeDrumByWheel(e);
    };
    this._onDrumPointerDown = (e) => this.beginDrumDrag(e);
    this._onDrumKeydown = (e) => {
      if (this.expandedMetric) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        this.nudgeDrum(1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        this.nudgeDrum(-1);
      } else if (e.key === 'Enter') {
        const meta = TELEMETRY_METRICS[this.drumIndex];
        if (meta) this.openMetricZoom(meta.code);
      }
    };
  }

  bind(container) {
    this.container = container;
    document.addEventListener('agriloop-theme-change', this._onThemeChange);
    container.addEventListener('click', this._onContainerClick);
  }

  getPollIntervalMs() {
    const sec = api.systemStatus?.virtualSensorIntervalSeconds || 5;
    return Math.max(2, sec) * 1000;
  }

  startLiveTimer() {
    this.stopLiveTimer();
    this.liveTimer = setInterval(() => this.onLiveTick(), this.getPollIntervalMs());
  }

  stopLiveTimer() {
    if (this.liveTimer) {
      clearInterval(this.liveTimer);
      this.liveTimer = null;
    }
  }

  playEnterAnimation() {
    const view = this.container?.querySelector('.telemetry-view');
    if (!view) return;
    view.classList.remove('telemetry-view--enter');
    void view.offsetWidth;
    view.classList.add('telemetry-view--enter');
  }

  async open(plotId) {
    if (!this.container) return;
    const plotChanged = plotId && plotId !== this.plotId;
    this.plotId = plotId || this.app.state.currentPlotId;
    this.app.state.activeMainView = 'plot-telemetry';
    this.container.hidden = false;
    this.container.classList.add('telemetry-panel--enter');
    setTimeout(() => this.container?.classList.remove('telemetry-panel--enter'), 520);

    if (plotChanged || !this.container.querySelector('#telemetryChartsGrid')) {
      this.renderFrame();
    } else {
      this.syncPlotSlider();
    }
    this.playEnterAnimation();

    await this.refresh({ force: true });
    this.startLiveTimer();
  }

  close() {
    this.stopLiveTimer();
    this.closeMetricZoom();
    if (this.container) this.container.hidden = true;
  }

  closeMetricZoom() {
    const wasExpanded = !!this.expandedMetric;
    this.expandedMetric = null;
    document.removeEventListener('keydown', this._onZoomKeydown);

    const drum = this.container?.querySelector('#telemetryDrum');
    const panel = this.container?.querySelector('#telemetryZoomPanel');
    if (!wasExpanded) {
      if (drum) drum.hidden = false;
      if (panel) {
        panel.hidden = true;
        panel.innerHTML = '';
      }
      return;
    }
    if (!panel || panel.hidden) return;

    if (drum) {
      drum.hidden = false;
      drum.style.opacity = '1';
      drum.style.transition = '';
    }
    this.renderCharts();
    const grid = this.container?.querySelector('#telemetryChartsGrid');
    const card = grid?.querySelector('.telemetry-chart-card.is-focus')
      || grid?.querySelector('.telemetry-chart-card.drum-focus');
    const cardRect = card?.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    panel.style.transition = 'none';
    panel.style.transformOrigin = '0 0';
    panel.style.transform = '';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.style.transition = 'transform 0.36s cubic-bezier(0.22,1,0.36,1), opacity 0.36s ease';
        if (cardRect && panelRect.width && panelRect.height) {
          const sx = cardRect.width / panelRect.width;
          const sy = cardRect.height / panelRect.height;
          const dx = cardRect.left - panelRect.left;
          const dy = cardRect.top - panelRect.top;
          panel.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
        } else {
          panel.style.transform = 'scale(0.7)';
          panel.style.opacity = '0';
        }
      });
    });

    setTimeout(() => {
      panel.hidden = true;
      panel.innerHTML = '';
      panel.style.transform = '';
      panel.style.transformOrigin = '';
      panel.style.transition = '';
      panel.style.opacity = '';
    }, 380);
  }

  openMetricZoom(code) {
    const meta = TELEMETRY_METRICS.find((m) => m.code === code);
    if (!meta || !this.plotId) return;

    this.expandedMetric = code;
    this.drumIndex = Math.max(0, TELEMETRY_METRICS.findIndex((m) => m.code === code));
    this.drumOffset = this.drumIndex;
    const plot = this.app.state.plots.find((p) => p.plotId === this.plotId);
    const drum = this.container.querySelector('#telemetryDrum');
    const panel = this.container.querySelector('#telemetryZoomPanel');
    if (!drum || !panel) return;

    document.addEventListener('keydown', this._onZoomKeydown);

    const grid = this.container.querySelector('#telemetryChartsGrid');
    const card = grid?.querySelector('.telemetry-chart-card.is-focus')
      || grid?.querySelector('.telemetry-chart-card.drum-focus');
    const cardRect = card?.getBoundingClientRect();

    panel.innerHTML = `
      <header class="telemetry-zoom-head">
        <div>
          <h3>${meta.label}</h3>
          <span class="telemetry-zoom-sub">${meta.code} · ${plot?.name || this.plotId} · 当天全时段</span>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" id="btnTelemetryZoomBack">返回多指标</button>
      </header>
      <div class="telemetry-zoom-status" id="telemetryZoomStatus">正在加载当天全时段数据…</div>
      <canvas class="telemetry-zoom-canvas" id="telemetryZoomCanvas" height="480"></canvas>
    `;
    panel.hidden = false;
    void this.loadZoomChart(code, meta);

    panel.style.transition = 'none';
    panel.style.transformOrigin = '0 0';
    panel.style.opacity = '1';
    const panelRect = panel.getBoundingClientRect();
    if (cardRect && panelRect.width && panelRect.height) {
      const sx = cardRect.width / panelRect.width;
      const sy = cardRect.height / panelRect.height;
      const dx = cardRect.left - panelRect.left;
      const dy = cardRect.top - panelRect.top;
      panel.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    } else {
      panel.style.transform = 'scale(0.7)';
      panel.style.opacity = '0';
    }

    drum.style.transition = 'opacity 0.24s ease';
    drum.style.opacity = '0';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.style.transition = 'transform 0.36s cubic-bezier(0.22,1,0.36,1), opacity 0.36s ease';
        panel.style.transform = '';
        panel.style.opacity = '1';
      });
    });

    setTimeout(() => {
      drum.hidden = true;
      drum.style.opacity = '';
      drum.style.transition = '';
      panel.style.transformOrigin = '';
      panel?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 380);
  }

  async loadZoomChart(code, meta) {
    const panel = this.container?.querySelector('#telemetryZoomPanel');
    if (!panel || this.expandedMetric !== code) return;

    const statusEl = panel.querySelector('#telemetryZoomStatus');
    const canvas = panel.querySelector('#telemetryZoomCanvas');
    try {
      const series = await api.getTelemetryDay(this.plotId, code, 5000);
      if (this.expandedMetric !== code || !panel.isConnected) return;

      const sorted = [...(series || [])].sort(
        (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
      );
      const first = sorted[0]?.ts ? this.formatTs(sorted[0].ts) : '—';
      const lastTs = sorted[sorted.length - 1]?.ts ? this.formatTs(sorted[sorted.length - 1].ts) : '—';
      if (statusEl) {
        statusEl.textContent = sorted.length
          ? `共 ${sorted.length} 个采样点 · ${first} ~ ${lastTs}`
          : '当天暂无数据';
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!canvas?.isConnected || this.expandedMetric !== code) return;
          drawLineChart(canvas, sorted, {
            color: meta.color,
            targetLow: meta.targetLow,
            targetHigh: meta.targetHigh,
          });
        });
      });
    } catch (err) {
      if (statusEl) statusEl.textContent = `加载失败：${err.message}`;
    }
  }

  renderFrame() {
    this.closeMetricZoom();
    this.drumBound = false;
    this._drumLaidOut = false;
    this.stopDrumAnim();
    const plots = this.app.state.plots;
    this.container.innerHTML = `
      <div class="telemetry-view">
        <div class="telemetry-view-toolbar">
          <div>
            <h2 class="telemetry-view-title">地块监测数据时序可视化</h2>
            <p class="telemetry-view-subtitle">选中地块各项环境指标随时间变化 · 数据来源：${
              api.isLive ? (api.liveSource === 'virtual-sensor' ? '内置虚拟传感器' : '后端 API') : 'Mock 演示'
            }</p>
          </div>
          <div class="telemetry-view-actions">
            <button type="button" class="btn btn-sm btn-outline" id="btnTelemetryRefresh">刷新</button>
            <button type="button" class="btn btn-sm btn-secondary" id="btnTelemetryBackHome">返回主面板</button>
          </div>
        </div>
        <div class="plot-slider-wrap">
          <div class="plot-slider" id="plotSliderTrack" role="tablist" aria-label="地块切换">
            ${plots
              .map(
                (p) => `
              <button type="button" class="plot-slider-item ${p.plotId === this.plotId ? 'active' : ''}"
                data-plot-id="${p.plotId}" role="tab"
                aria-selected="${p.plotId === this.plotId}">
                <span class="plot-slider-emoji">${p.cropCode === 'tomato' ? '🍅' : '🥒'}</span>
                <span class="plot-slider-name">${p.name}</span>
                <span class="plot-slider-meta">${p.cropName} · ${p.metrics?.SOIL_MOISTURE?.value ?? '—'}%</span>
              </button>`,
              )
              .join('')}
          </div>
        </div>
        <div class="telemetry-status-line" id="telemetryStatusLine">加载中…</div>
        <div class="telemetry-charts-area">
          <div class="telemetry-drum" id="telemetryDrum">
            <button type="button" class="telemetry-drum-nav telemetry-drum-nav--prev" id="btnDrumPrev" aria-label="上一指标">▲</button>
            <div class="telemetry-drum-stage" id="telemetryDrumStage" tabindex="0" aria-label="指标圆柱滚筒">
              <div class="telemetry-drum-tube" aria-hidden="true"></div>
              <div class="telemetry-drum-cylinder" id="telemetryChartsGrid"></div>
            </div>
            <button type="button" class="telemetry-drum-nav telemetry-drum-nav--next" id="btnDrumNext" aria-label="下一指标">▼</button>
            <p class="telemetry-drum-hint">滚轮 / 拖动切换 · 点击正面卡片查看全时段</p>
          </div>
          <div class="telemetry-zoom-inline" id="telemetryZoomPanel" hidden></div>
        </div>
      </div>
    `;

    this.container.querySelector('#btnTelemetryBackHome')?.addEventListener('click', () => {
      this.app.showHomeView();
    });
    this.container.querySelector('#btnTelemetryRefresh')?.addEventListener('click', () => {
      void this.refresh({ force: true });
    });
    this.container.querySelectorAll('.plot-slider-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.plotId;
        if (id && id !== this.plotId) {
          this.plotId = id;
          this.app.selectPlot(id, { silent: true });
          this.renderFrame();
          this.playEnterAnimation();
          void this.refresh({ force: true });
        }
      });
    });
  }

  syncPlotSlider() {
    const plots = this.app.state.plots;
    this.container.querySelectorAll('.plot-slider-item').forEach((btn) => {
      const plotId = btn.dataset.plotId;
      const plot = plots.find((p) => p.plotId === plotId);
      const active = plotId === this.plotId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
      const meta = btn.querySelector('.plot-slider-meta');
      if (meta && plot) {
        meta.textContent = `${plot.cropName} · ${plot.metrics?.SOIL_MOISTURE?.value ?? '—'}%`;
      }
    });
  }

  async refresh(options = {}) {
    const { silent = false, force = false } = options;
    if (!this.container) return;

    if (this.loading) {
      if (!force) {
        this.pendingRefresh = true;
        return;
      }
      this.pendingRefresh = false;
    }

    this.loading = true;
    const statusEl = this.container.querySelector('#telemetryStatusLine');
    if (!silent && statusEl) {
      statusEl.textContent = '正在加载遥测序列…';
      statusEl.classList.add('is-loading');
    }

    try {
      this.points = await api.getPlotTelemetryAll(this.plotId, 120);
      if (!this.expandedMetric) {
        this.renderCharts();
      }
      this.syncPlotSlider();
      this.updateStatusLine();
      if (this.expandedMetric) {
        const meta = TELEMETRY_METRICS.find((m) => m.code === this.expandedMetric);
        if (meta) void this.loadZoomChart(this.expandedMetric, meta);
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = `加载失败：${e.message}`;
    } finally {
      statusEl?.classList.remove('is-loading');
      this.loading = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.refresh({ silent: true });
      }
    }
  }

  updateStatusLine() {
    const statusEl = this.container?.querySelector('#telemetryStatusLine');
    if (!statusEl) return;
    const latest = this.points[this.points.length - 1];
    const src = latest?.quality?.sourceMode === 'SIMULATION' ? '模拟' : '观测';
    statusEl.textContent = `共 ${this.points.length} 个采样点 · 最新 ${this.formatTs(latest?.ts)} · ${src} · 每 ${
      api.systemStatus?.virtualSensorIntervalSeconds || 5
    }s 更新`;
  }

  renderCharts() {
    const grid = this.container.querySelector('#telemetryChartsGrid');
    if (!grid) return;

    const byMetric = groupByMetric(this.points);
    const existing = grid.querySelectorAll('.telemetry-chart-card');

    if (
      existing.length === TELEMETRY_METRICS.length
      && existing[0]?.querySelector('.telemetry-chart-card-inner')
    ) {
      this.updateCharts(byMetric);
      return;
    }

    const plot = this.app.state.plots.find((p) => p.plotId === this.plotId);
    grid.innerHTML = TELEMETRY_METRICS.map((meta) => {
      const series = byMetric[meta.code] || [];
      const latest = series[series.length - 1];
      const liveVal = latest ? Number(latest.value).toFixed(1) : (plot?.metrics?.[meta.code]?.value ?? '—');
      return `
        <article class="telemetry-chart-card" data-metric-card="${meta.code}" role="button" tabindex="-1" title="点击查看当天全时段曲线">
          <div class="telemetry-chart-card-inner">
            <div class="telemetry-chart-overlay">
              <span class="telemetry-chart-name">${meta.label}</span>
              <span class="telemetry-chart-latest" data-latest-for="${meta.code}"><strong>${liveVal}</strong><small>${meta.unit}</small></span>
            </div>
            <div class="telemetry-chart-body">
              <canvas class="telemetry-chart-canvas" data-metric="${meta.code}" height="168"></canvas>
            </div>
          </div>
        </article>
      `;
    }).join('');

    this.scheduleDrawCharts(byMetric);
    this.bindCylinder();
    this.updateCylinder();
  }

  updateCharts(byMetric) {
    const plot = this.app.state.plots.find((p) => p.plotId === this.plotId);
    const grid = this.container.querySelector('#telemetryChartsGrid');
    if (!grid) return;

    for (const meta of TELEMETRY_METRICS) {
      const series = byMetric[meta.code] || [];
      const latest = series[series.length - 1];
      const liveVal = latest ? Number(latest.value).toFixed(1) : (plot?.metrics?.[meta.code]?.value ?? '—');

      const latestEl = grid.querySelector(`[data-latest-for="${meta.code}"]`);
      if (latestEl) {
        latestEl.innerHTML = `<strong>${liveVal}</strong><small>${meta.unit}</small>`;
      }

      const canvas = grid.querySelector(`canvas[data-metric="${meta.code}"]`);
      if (canvas) {
        drawLineChart(canvas, series, {
          color: meta.color,
          targetLow: meta.targetLow,
          targetHigh: meta.targetHigh,
        });
      }
    }
    this.applyCylinder();
  }

  scheduleDrawCharts(byMetric) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const grid = this.container?.querySelector('#telemetryChartsGrid');
        if (!grid) return;
        grid.querySelectorAll('.telemetry-chart-canvas').forEach((canvas) => {
          const code = canvas.dataset.metric;
          const meta = TELEMETRY_METRICS.find((m) => m.code === code);
          const series = byMetric[code] || [];
          drawLineChart(canvas, series, {
            color: meta?.color,
            targetLow: meta?.targetLow,
            targetHigh: meta?.targetHigh,
          });
        });
        this.updateCylinder();
      });
    });
  }

  redrawCharts() {
    if (!this.container || this.container.hidden || !this.points.length) return;
    if (this.expandedMetric) {
      const meta = TELEMETRY_METRICS.find((m) => m.code === this.expandedMetric);
      if (meta) void this.loadZoomChart(this.expandedMetric, meta);
      return;
    }
    this.renderCharts();
  }

  bindCylinder() {
    const drum = this.container?.querySelector('#telemetryDrum');
    const stage = this.container?.querySelector('#telemetryDrumStage');
    if (!drum || !stage || this.drumBound) return;
    this.drumBound = true;
    drum.addEventListener('wheel', this._onDrumWheel, { passive: false });
    stage.addEventListener('pointerdown', this._onDrumPointerDown);
    stage.addEventListener('keydown', this._onDrumKeydown);
  }

  metricCount() {
    return TELEMETRY_METRICS.length;
  }

  wrapOffset(value) {
    const n = this.metricCount();
    if (!n) return 0;
    return ((value % n) + n) % n;
  }

  shortestDelta(index, offset, n) {
    let delta = index - this.wrapOffset(offset);
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;
    return delta;
  }

  stopDrumAnim() {
    if (this._drumAnim) {
      cancelAnimationFrame(this._drumAnim);
      this._drumAnim = null;
    }
    if (this._drumSnapTimer) {
      clearTimeout(this._drumSnapTimer);
      this._drumSnapTimer = null;
    }
  }

  nudgeDrum(dir) {
    const n = this.metricCount();
    if (!n) return;
    const from = this.drumOffset;
    const target = Math.round(from) + dir;
    this.animateDrumTo(target);
  }

  nudgeDrumByWheel(e) {
    const pixels = e.deltaMode === 1
      ? e.deltaY * 100
      : e.deltaMode === 2
        ? e.deltaY * 400
        : e.deltaY;
    if (!pixels) return;

    if (this._drumAnim) this.stopDrumAnim();
    if (this._gestureAcc === 0) this._gestureOrigin = this.drumOffset;

    this._gestureAcc -= pixels;
    const travel = Math.max(-2.4, Math.min(2.4, this._gestureAcc / 100));
    this.drumOffset = this._gestureOrigin + travel;
    this.applyCylinder();

    if (this._drumSnapTimer) clearTimeout(this._drumSnapTimer);
    this._drumSnapTimer = setTimeout(() => {
      this._gestureAcc = 0;
      this.snapDrum();
    }, 90);
  }

  animateDrumTo(target) {
    this.stopDrumAnim();
    const from = this.drumOffset;
    const start = performance.now();
    const duration = 200;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      this.drumOffset = from + (target - from) * eased;
      this.applyCylinder();
      if (t < 1) {
        this._drumAnim = requestAnimationFrame(tick);
        return;
      }
      this._drumAnim = null;
      this.drumOffset = target;
      this.applyCylinder();
    };
    this._drumAnim = requestAnimationFrame(tick);
  }

  snapDrum() {
    this._gestureAcc = 0;
    this.animateDrumTo(Math.round(this.drumOffset));
  }

  beginDrumDrag(e) {
    if (this.expandedMetric || e.button !== 0) return;
    if (e.target.closest('.telemetry-drum-nav')) return;
    const stage = this.container?.querySelector('#telemetryDrumStage');
    if (!stage) return;

    this.stopDrumAnim();
    const startY = e.clientY;
    const origin = this.drumOffset;
    let moved = false;
    this._suppressCardClick = false;

    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dy) < 6) return;
      moved = true;
      this._suppressCardClick = true;
      const travel = Math.max(-6, Math.min(6, -dy / Math.max(160, this._drumCardH || 220)));
      this.drumOffset = origin + travel;
      this.applyCylinder();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved) this.snapDrum();
      setTimeout(() => {
        this._suppressCardClick = false;
      }, 0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  updateCylinder() {
    this._drumLaidOut = false;
    this.layoutCylinder();
    this.applyCylinder();
  }

  layoutCylinder() {
    const drum = this.container?.querySelector('#telemetryDrum');
    const grid = this.container?.querySelector('#telemetryChartsGrid');
    if (!drum || !grid || drum.hidden) return;

    const cards = [...grid.querySelectorAll('.telemetry-chart-card')];
    const n = cards.length;
    if (!n) return;

    const cardH = cards[0].offsetHeight || 228;
    const radius = (cardH / 2) / Math.tan(Math.PI / n);
    this._drumRadius = radius;
    this._drumCardH = cardH;
    this._drumLaidOut = true;

    const stepDeg = 360 / n;
    cards.forEach((card, i) => {
      card.style.marginTop = `${-cardH / 2}px`;
      card.style.transform = `rotateX(${(i * stepDeg).toFixed(3)}deg) translateZ(${radius.toFixed(2)}px)`;
    });
  }

  applyCylinder() {
    const drum = this.container?.querySelector('#telemetryDrum');
    const grid = this.container?.querySelector('#telemetryChartsGrid');
    if (!drum || !grid || drum.hidden) return;

    const cards = [...grid.querySelectorAll('.telemetry-chart-card')];
    const n = cards.length;
    if (!n) return;
    if (!this._drumLaidOut || !this._drumRadius) this.layoutCylinder();

    const radius = this._drumRadius;
    const stepDeg = 360 / n;
    grid.style.transform = `translateZ(${(-radius).toFixed(2)}px) rotateX(${(-this.drumOffset * stepDeg).toFixed(3)}deg)`;

    const nearest = Math.round(this.drumOffset);
    this.drumIndex = this.wrapOffset(nearest);

    cards.forEach((card, i) => {
      const delta = this.shortestDelta(i, this.drumOffset, n);
      const abs = Math.abs(delta);
      const focused = abs < 0.5;

      card.classList.toggle('drum-focus', focused);
      card.classList.toggle('is-focus', focused);
      card.classList.toggle('drum-above', delta < -0.5 && delta > -1.55);
      card.classList.toggle('drum-below', delta > 0.5 && delta < 1.55);
      card.style.opacity = abs < 0.35 ? '1' : abs < 1.2 ? String(0.92 - abs * 0.12) : String(Math.max(0.28, 0.85 - abs * 0.22));
      card.style.pointerEvents = focused ? 'auto' : 'none';
      card.setAttribute('aria-hidden', focused ? 'false' : 'true');
    });
  }

  formatTs(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('zh-CN');
    } catch {
      return ts;
    }
  }

  onLiveTick() {
    if (this.app.state.activeMainView === 'plot-telemetry' && !this.container?.hidden) {
      void this.refresh({ silent: true });
    }
  }
}
