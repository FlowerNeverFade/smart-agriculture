/**
 * Full-page plot telemetry view: plot slider + multi-metric time series charts.
 */
import { api } from './api.js?v=4';
import { TELEMETRY_METRICS, groupByMetric, drawLineChart } from './telemetry-charts.js';

export class PlotTelemetryView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.plotId = null;
    this.points = [];
    this.loading = false;
  }

  bind(container) {
    this.container = container;
  }

  async open(plotId) {
    if (!this.container) return;
    this.plotId = plotId || this.app.state.currentPlotId;
    this.app.state.activeMainView = 'plot-telemetry';
    this.container.hidden = false;
    this.renderFrame();
    await this.refresh(true);
  }

  close() {
    if (this.container) this.container.hidden = true;
    this.app.state.activeMainView = 'home';
  }

  renderFrame() {
    const plots = this.app.state.plots;
    this.container.innerHTML = `
      <div class="telemetry-view">
        <div class="telemetry-view-toolbar">
          <div>
            <h2 class="telemetry-view-title">地块监测数据时许可视化</h2>
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
        <div class="telemetry-charts-grid" id="telemetryChartsGrid"></div>
      </div>
    `;

    this.container.querySelector('#btnTelemetryBackHome')?.addEventListener('click', () => {
      this.app.showHomeView();
    });
    this.container.querySelector('#btnTelemetryRefresh')?.addEventListener('click', () => {
      void this.refresh(true);
    });
    this.container.querySelectorAll('.plot-slider-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.plotId;
        if (id && id !== this.plotId) {
          this.plotId = id;
          this.app.selectPlot(id, { silent: true });
          this.renderFrame();
          void this.refresh(true);
        }
      });
    });
  }

  async refresh(force = false) {
    if (!this.container || this.loading) return;
    this.loading = true;
    const statusEl = this.container.querySelector('#telemetryStatusLine');
    if (statusEl) statusEl.textContent = '正在加载遥测序列…';

    try {
      this.points = await api.getPlotTelemetryAll(this.plotId, 120);
      this.renderCharts();
      const latest = this.points[this.points.length - 1];
      const src = latest?.quality?.sourceMode === 'SIMULATION' ? '模拟' : '观测';
      if (statusEl) {
        statusEl.textContent = `共 ${this.points.length} 个采样点 · 最新 ${this.formatTs(latest?.ts)} · ${src} · 每 ${
          api.systemStatus?.virtualSensorIntervalSeconds || 5
        }s 更新`;
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = `加载失败：${e.message}`;
    } finally {
      this.loading = false;
    }
  }

  renderCharts() {
    const grid = this.container.querySelector('#telemetryChartsGrid');
    if (!grid) return;
    const byMetric = groupByMetric(this.points);
    const plot = this.app.state.plots.find((p) => p.plotId === this.plotId);

    grid.innerHTML = TELEMETRY_METRICS.map((meta) => {
      const series = byMetric[meta.code] || [];
      const latest = series[series.length - 1];
      const liveVal = latest ? Number(latest.value).toFixed(1) : (plot?.metrics?.[meta.code]?.value ?? '—');
      return `
        <article class="telemetry-chart-card">
          <header class="telemetry-chart-head">
            <div>
              <h3>${meta.label}</h3>
              <span class="telemetry-chart-code">${meta.code}</span>
            </div>
            <div class="telemetry-chart-latest">
              <strong>${liveVal}</strong><small>${meta.unit}</small>
            </div>
          </header>
          <canvas class="telemetry-chart-canvas" data-metric="${meta.code}" height="160"></canvas>
          <footer class="telemetry-chart-foot">
            ${meta.targetLow != null ? `目标区间 ${meta.targetLow}~${meta.targetHigh}${meta.unit}` : '仿真指标'}
            · ${series.length} 点
          </footer>
        </article>
      `;
    }).join('');

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
      void this.refresh();
    }
  }
}
