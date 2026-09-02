const api = require('../../utils/api');
const formatter = require('../../utils/format');
const sessionStore = require('../../utils/session');
const config = require('../../utils/config');

const METRICS = [
  { code: 'SOIL_MOISTURE', label: '土壤湿度' },
  { code: 'AIR_TEMPERATURE', label: '空气温度' },
  { code: 'AIR_HUMIDITY', label: '空气湿度' },
  { code: 'WATER_LEVEL', label: '水箱水位' },
  { code: 'LIGHT', label: '光照' },
  { code: 'CO2', label: '二氧化碳' }
];

function settled(promise) {
  return promise.then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error }));
}

function listFrom(value, keys) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (let i = 0; i < keys.length; i += 1) if (Array.isArray(value[keys[i]])) return value[keys[i]];
  return [];
}

function addPlatformScope(farms, role) {
  return role === 'SYSTEM_ADMIN' ? [{ farmId: '', name: '全平台范围', isPlatform: true }].concat(farms) : farms;
}

function decoratedPlot(plot) {
  const normalized = formatter.normalizePlot(plot);
  return Object.assign(normalized, {
    deviceStatusLabel: formatter.statusLabel(normalized.deviceStatus),
    deviceTone: normalized.deviceStatus === 'ONLINE' ? 'online' : normalized.deviceStatus === 'OFFLINE' ? 'offline' : 'low',
    lastSeenLabel: formatter.relativeTime(normalized.lastSeen)
  });
}

function normalizeForecast(raw) {
  const value = raw || {};
  const status = String(value.status || value.readiness || (value.available === false ? 'UNAVAILABLE' : 'AVAILABLE')).toUpperCase();
  const available = value.available !== false && !['UNAVAILABLE', 'INSUFFICIENT_DATA'].includes(status);
  // The API exposes the detailed projection as `curve` and the compact
  // checkpoints as `horizons`; older adapters may still return `points` or
  // `series`. Prefer the curve, then sample it down for a readable mobile
  // list instead of silently rendering an empty forecast.
  const curve = Array.isArray(value.curve) && value.curve.length ? value.curve : [];
  const sourcePoints = curve.length ? curve : listFrom(value, ['horizons', 'points', 'forecast', 'series']);
  const stride = Math.max(1, Math.ceil(sourcePoints.length / 8));
  const sampled = sourcePoints.filter((point, index) => index % stride === 0 || index === sourcePoints.length - 1).slice(0, 8);
  const anchor = value.startTimestamp || value.issuedAt || value.generatedAt;
  const anchorMs = anchor ? new Date(anchor).getTime() : NaN;
  const points = sampled.map((point) => {
    const minuteValue = Number(point.minute ?? point.minutes ?? point.offsetMinutes);
    const explicitTime = point.ts || point.timestamp || point.at || point.time || point.predictedAt;
    const derivedTime = Number.isFinite(anchorMs) && Number.isFinite(minuteValue)
      ? new Date(anchorMs + minuteValue * 60 * 1000).toISOString()
      : '';
    const valuePoint = point.value ?? point.expected ?? point.expectedMoisture;
    return {
      minute: Number.isFinite(minuteValue) ? minuteValue : null,
      timeLabel: explicitTime || derivedTime
        ? formatter.formatTime(explicitTime || derivedTime)
        : Number.isFinite(minuteValue) ? (minuteValue === 0 ? '现在' : `${minuteValue} 分钟后`) : '预测时段',
      valueLabel: formatter.formatMetricValue(valuePoint, point.unit || ''),
      lowerLabel: formatter.formatMetricValue(point.lower, point.unit || ''),
      upperLabel: formatter.formatMetricValue(point.upper, point.unit || '')
    };
  });
  const summary = value.message || value.summary || value.reason || (available ? '预测结果已生成，具体趋势以当前地块实时数据为准。' : '当前样本不足，暂时无法生成风险趋势。');
  return {
    available,
    statusLabel: available ? '可用' : '暂不可用',
    tone: available ? 'good' : 'medium',
    summary,
    points
  };
}

Page({
  data: {
    roleCode: '',
    farms: [],
    farmIndex: 0,
    plots: [],
    selectedPlotId: '',
    selectedPlot: null,
    metricOptions: METRICS.map((item, index) => Object.assign({}, item, { active: index === 0 })),
    selectedMetric: 'SOIL_MOISTURE',
    selectedMetricLabel: '土壤湿度',
    selectedMetricValue: '—',
    telemetry: [],
    forecast: { available: false, summary: '选择地块后读取预测。', points: [], tone: 'medium', statusLabel: '待选择' },
    loading: false,
    loaded: false,
    detailLoading: false,
    error: ''
  },

  onLoad() {
    const app = getApp();
    if (!app.requireLogin()) return;
    this.setData({ roleCode: String(app.globalData.role || '').toUpperCase() });
    this.loadData(false);
  },

  onShow() {
    if (!getApp().requireLogin()) return;
    const pending = getApp().globalData.pendingPlotId;
    if (pending) {
      getApp().globalData.pendingPlotId = '';
      if (this.data.loaded) this.selectPlotById(pending);
    } else if (this.data.loaded) {
      this.loadData(true);
    }
    this.startPolling();
  },

  onHide() { this.stopPolling(); },
  onUnload() { this.stopPolling(); },

  startPolling() {
    this.stopPolling();
    const userId = getApp().globalData.user?.userId || getApp().globalData.user?.username || 'anonymous';
    let enabled = true;
    try {
      const stored = wx.getStorageSync(sessionStore.preferenceKey(userId, 'autoRefresh'));
      if (stored !== '' && stored !== null && stored !== undefined) enabled = stored !== false;
    } catch (error) { enabled = true; }
    if (!enabled) return;
    this.pollTimer = setInterval(() => {
      if (this.data.loaded && !this.data.detailLoading) this.loadData(true);
    }, config.pollInterval);
  },

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  },

  loadFarms() {
    const role = this.data.roleCode;
    if (role === 'FARMER') {
      const ids = getApp().globalData.user?.farmIds || [];
      return Promise.resolve(ids.filter((id) => id && id !== '*').map((id) => ({ farmId: id, name: id })));
    }
    return api.getFarms().then((value) => {
      const farms = listFrom(value, ['farms', 'items']).map((farm) => ({
        farmId: farm.farmId || farm.id,
        name: farm.name || farm.farmName || farm.farmId || farm.id
      })).filter((farm) => farm.farmId);
      return addPlatformScope(farms, role);
    });
  },

  currentFarmId() {
    if (this.data.roleCode === 'SYSTEM_ADMIN' && this.data.farmIndex === 0) return '';
    const farm = this.data.farms[this.data.farmIndex];
    if (farm?.farmId) return farm.farmId;
    const ids = getApp().globalData.user?.farmIds || [];
    return ids.find((id) => id && id !== '*') || '';
  },

  loadData(silent) {
    if (this.data.loading && !silent) return;
    if (this._loadInFlight && silent) return;
    const sequence = (this._loadSequence || 0) + 1;
    this._loadSequence = sequence;
    this._loadInFlight = true;
    this.setData({ loading: !silent, error: silent ? this.data.error : '' });
    const farmId = this.currentFarmId();
    Promise.all([settled(this.loadFarms()), settled(api.getPlots(farmId ? { farmId } : {}))])
      .then((results) => {
        if (sequence !== this._loadSequence) return;
        const farmsResult = results[0];
        const plotsResult = results[1];
        const farms = farmsResult.ok ? farmsResult.value : this.data.farms;
        const rawPlots = plotsResult.ok ? listFrom(plotsResult.value, ['plots', 'items']) : [];
        const plots = rawPlots.map(decoratedPlot);
        const selectedId = getApp().globalData.pendingPlotId || this.data.selectedPlotId;
        const selected = plots.find((plot) => plot.plotId === selectedId) || plots[0] || null;
        const selectedIndex = selected ? plots.findIndex((plot) => plot.plotId === selected.plotId) : -1;
        const hasAny = plots.length > 0 || plotsResult.ok;
        this.setData({ farms, farmIndex: Math.min(this.data.farmIndex, Math.max(0, farms.length - 1)), plots, loaded: hasAny, loading: false, error: hasAny ? '' : (plotsResult.error?.message || '暂时无法读取地块数据') });
        if (selected) {
          this.setData({ selectedPlotId: selected.plotId, selectedPlot: selected });
          this.loadDetail(selected.plotId, this.data.selectedMetric);
        } else if (selectedIndex < 0) {
          this.setData({ selectedPlotId: '', selectedPlot: null, telemetry: [], forecast: { available: false, summary: '当前范围还没有地块。', points: [], tone: 'medium', statusLabel: '暂无数据' } });
        }
        this._loadInFlight = false;
        wx.stopPullDownRefresh();
      })
      .catch((error) => {
        if (sequence !== this._loadSequence) return;
        this._loadInFlight = false;
        this.setData({ loading: false, error: error?.message || '暂时无法读取地块数据' });
        wx.stopPullDownRefresh();
      });
  },

  reload() { this.loadData(false); },
  onPullDownRefresh() { this.loadData(false); },

  onFarmChange(event) {
    this.setData({ farmIndex: Number(event.detail.value), loaded: false, selectedPlotId: '', selectedPlot: null });
    this.loadData(false);
  },

  selectPlot(event) { this.selectPlotById(event.currentTarget.dataset.id); },

  selectPlotById(plotId) {
    const selected = this.data.plots.find((plot) => plot.plotId === plotId) || this.data.plots[0];
    if (!selected) return;
    this.setData({ selectedPlotId: selected.plotId, selectedPlot: selected, telemetry: [], forecast: { available: false, summary: '正在读取预测…', points: [], tone: 'medium', statusLabel: '读取中' } });
    this.loadDetail(selected.plotId, this.data.selectedMetric);
  },

  onMetricChange(event) {
    const code = event.currentTarget.dataset.code || 'SOIL_MOISTURE';
    const option = METRICS.find((item) => item.code === code) || METRICS[0];
    this.setData({
      selectedMetric: option.code,
      selectedMetricLabel: option.label,
      metricOptions: METRICS.map((item) => Object.assign({}, item, { active: item.code === option.code }))
    });
    if (this.data.selectedPlotId) this.loadDetail(this.data.selectedPlotId, option.code);
  },

  loadDetail(plotId, metric) {
    const sequence = (this._detailSequence || 0) + 1;
    this._detailSequence = sequence;
    this.setData({ detailLoading: true });
    Promise.all([settled(api.getTelemetry(plotId, metric, 24)), settled(api.getForecast(plotId, metric))])
      .then((results) => {
        if (sequence !== this._detailSequence) return;
        const telemetryResult = results[0];
        const forecastResult = results[1];
        const telemetry = telemetryResult.ok ? formatter.normalizeTelemetry(telemetryResult.value) : [];
        const forecast = forecastResult.ok ? normalizeForecast(forecastResult.value) : { available: false, summary: forecastResult.error?.message || '预测服务暂时不可用。', points: [], tone: 'medium', statusLabel: '暂不可用' };
        const current = telemetry.length ? telemetry[0].valueLabel : this.data.selectedPlot ? formatter.formatMetricValue(formatter.metricValue(this.data.selectedPlot.metrics, metric), '') : '—';
        this.setData({ telemetry, forecast, selectedMetricValue: current, detailLoading: false });
      })
      .catch((error) => {
        if (sequence !== this._detailSequence) return;
        this.setData({ detailLoading: false, telemetry: [], forecast: { available: false, summary: error?.message || '暂时无法读取指标详情。', points: [], tone: 'medium', statusLabel: '暂不可用' } });
      });
  },

  askAssistant() {
    getApp().globalData.pendingPlotId = this.data.selectedPlotId;
    wx.switchTab({ url: '/pages/assistant/assistant' });
  }
});
