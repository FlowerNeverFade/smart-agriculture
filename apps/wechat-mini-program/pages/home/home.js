const api = require('../../utils/api');
const sessionStore = require('../../utils/session');
const formatter = require('../../utils/format');

const ROLE_TITLES = {
  FARM_ADMIN: '农场运行总览',
  FARMER: '今天先做什么',
  SYSTEM_ADMIN: '平台运行总览'
};

function settled(promise) {
  return promise.then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error }));
}

function listFrom(value, keys) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (let i = 0; i < keys.length; i += 1) {
    if (Array.isArray(value[keys[i]])) return value[keys[i]];
  }
  return [];
}

function addPlatformScope(farms, role) {
  return role === 'SYSTEM_ADMIN' ? [{ farmId: '', name: '全平台范围', isPlatform: true }].concat(farms) : farms;
}

Page({
  data: {
    roleCode: '',
    roleLabel: '',
    roleTitle: '工作台',
    farmLabel: '当前范围',
    farms: [],
    farmIndex: 0,
    loading: false,
    loaded: false,
    error: '',
    notice: '',
    lastUpdated: '',
    plots: [],
    alerts: [],
    tasks: [],
    summary: { plotCount: 0, alertCount: 0, pendingTaskCount: 0, onlineDeviceCount: 0, deviceCount: 0 }
  },

  onLoad() {
    const app = getApp();
    if (!app.requireLogin()) return;
    const user = app.globalData.user || {};
    const roleCode = String(user.role || '').toUpperCase();
    this.setData({ roleCode, roleLabel: formatter.roleLabel(roleCode), roleTitle: ROLE_TITLES[roleCode] || '工作台' });
    this.loadData(false);
  },

  onShow() {
    const app = getApp();
    if (!app.requireLogin()) return;
    if (this.data.loaded) {
      this.loadData(true);
    }
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  startPolling() {
    this.stopPolling();
    const app = getApp();
    const userId = app.globalData.user?.userId || app.globalData.user?.username || 'anonymous';
    let enabled = true;
    try {
      const value = wx.getStorageSync(sessionStore.preferenceKey(userId, 'autoRefresh'));
      if (value !== '' && value !== null && value !== undefined) enabled = value !== false;
    } catch (error) {
      enabled = true;
    }
    if (!enabled) return;
    this.pollTimer = setInterval(() => {
      if (this.data.loaded) this.loadData(true);
    }, 15000);
  },

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  },

  currentFarmId() {
    if (this.data.roleCode === 'SYSTEM_ADMIN' && this.data.farmIndex === 0) return '';
    const farm = this.data.farms[this.data.farmIndex];
    if (farm && farm.farmId) return farm.farmId;
    const ids = getApp().globalData.user?.farmIds || [];
    return ids.find((id) => id && id !== '*') || '';
  },

  loadFarms() {
    const role = this.data.roleCode;
    if (role === 'FARMER') {
      const ids = getApp().globalData.user?.farmIds || [];
      return Promise.resolve(ids.filter((id) => id && id !== '*').map((id) => ({ farmId: id, name: id })));
    }
    return api.getFarms().then((farms) => {
      const list = listFrom(farms, ['farms', 'items']).map((farm) => ({
        farmId: farm.farmId || farm.id,
        name: farm.name || farm.farmName || farm.farmId || farm.id
      })).filter((farm) => farm.farmId);
      return addPlatformScope(list, role);
    });
  },

  loadData(silent) {
    if (this.data.loading && !silent) return;
    if (!getApp().isLoggedIn()) return;
    if (this._loadInFlight && silent) return;
    const sequence = (this._loadSequence || 0) + 1;
    this._loadSequence = sequence;
    this._loadInFlight = true;
    this.setData({ loading: !silent, error: silent ? this.data.error : '', notice: silent ? this.data.notice : '' });
    const farmId = this.currentFarmId();
    const overviewRequest = api.getOverview(farmId);
    const plotsRequest = api.getPlots(farmId ? { farmId } : {});
    const tasksRequest = api.getWorkOrders(farmId ? { farmId } : {});
    const alertsRequest = api.getAlerts(farmId ? { farmId } : {});
    const farmsRequest = this.loadFarms();
    Promise.all([settled(overviewRequest), settled(plotsRequest), settled(tasksRequest), settled(alertsRequest), settled(farmsRequest)])
      .then((results) => {
        if (sequence !== this._loadSequence) return;
        const overviewResult = results[0];
        const plotsResult = results[1];
        const tasksResult = results[2];
        const alertsResult = results[3];
        const farmsResult = results[4];
        const overview = overviewResult.ok ? (overviewResult.value || {}) : {};
        const overviewPlots = listFrom(overview, ['plots']);
        const rawPlots = this.data.roleCode === 'SYSTEM_ADMIN'
          ? (plotsResult.ok ? listFrom(plotsResult.value, ['plots', 'items']) : overviewPlots)
          : (overviewPlots.length ? overviewPlots : plotsResult.ok ? listFrom(plotsResult.value, ['plots', 'items']) : []);
        const plots = rawPlots.map((plot) => {
          const normalized = formatter.normalizePlot(plot);
          const deviceTone = normalized.deviceStatus === 'ONLINE' ? 'online' : normalized.deviceStatus === 'OFFLINE' ? 'offline' : 'low';
          return Object.assign(normalized, {
            deviceStatusLabel: formatter.statusLabel(normalized.deviceStatus),
            deviceTone,
            lastSeenLabel: formatter.relativeTime(normalized.lastSeen)
          });
        });
        const tasks = (tasksResult.ok ? listFrom(tasksResult.value, ['workOrders', 'items']) : []).map(formatter.normalizeTask);
        const alerts = (alertsResult.ok ? listFrom(alertsResult.value, ['alerts', 'items']) : []).map((alert) => {
          const normalized = formatter.normalizeAlert(alert);
          const levelTone = normalized.level === 'HIGH' || normalized.level === 'CRITICAL' ? 'high' : normalized.level === 'MEDIUM' ? 'medium' : 'low';
          return Object.assign(normalized, { levelTone });
        }).filter((alert) => !['CLOSED', 'RESOLVED'].includes(alert.status));
        const pendingTasks = tasks.filter((task) => !['DONE', 'CANCELLED'].includes(task.status));
        const deviceCount = plots.filter((plot) => plot.deviceId && plot.deviceId !== '—').length;
        const onlineDeviceCount = plots.filter((plot) => plot.deviceStatus === 'ONLINE').length;
        const farms = farmsResult.ok ? farmsResult.value : this.data.farms;
        const selectedIndex = Math.min(this.data.farmIndex, Math.max(0, farms.length - 1));
        const selectedFarm = farms[selectedIndex];
        const partialFailures = results.filter((item) => !item.ok).length;
        const hasAny = plots.length || tasks.length || alerts.length || overviewResult.ok;
        this.setData({
          farms,
          farmIndex: selectedIndex,
          farmLabel: selectedFarm?.name || (this.data.roleCode === 'SYSTEM_ADMIN' ? '全平台范围' : farmId || '当前范围'),
          plots: plots.slice(0, 6),
          tasks: pendingTasks.slice(0, 8),
          alerts: alerts.slice(0, 4),
          summary: { plotCount: plots.length, alertCount: alerts.length, pendingTaskCount: pendingTasks.length, onlineDeviceCount, deviceCount },
          loaded: Boolean(hasAny),
          loading: false,
          error: hasAny ? '' : (results.find((item) => !item.ok)?.error?.message || '暂时无法读取工作台数据'),
          notice: partialFailures && hasAny ? '部分数据暂时不可用，页面会在下次刷新时补齐。' : '',
          lastUpdated: formatter.formatTime(new Date().toISOString())
        });
        this._loadInFlight = false;
        wx.stopPullDownRefresh();
      })
      .catch((error) => {
        if (sequence !== this._loadSequence) return;
        this._loadInFlight = false;
        this.setData({ loading: false, error: error?.message || '暂时无法读取工作台数据' });
        wx.stopPullDownRefresh();
      });
  },

  reload() { this.loadData(false); },

  onPullDownRefresh() { this.loadData(false); },

  onFarmChange(event) {
    this.setData({ farmIndex: Number(event.detail.value), loaded: false });
    this.loadData(false);
  },

  openPlot(event) {
    getApp().globalData.pendingPlotId = event.currentTarget.dataset.id || '';
    wx.switchTab({ url: '/pages/plots/plots' });
  },

  goPlots() { wx.switchTab({ url: '/pages/plots/plots' }); },
  goTasks() { wx.switchTab({ url: '/pages/tasks/tasks' }); },
  goAlerts() {
    getApp().globalData.pendingTaskFocus = 'alerts';
    wx.switchTab({ url: '/pages/tasks/tasks' });
  },
  goAssistant() { wx.switchTab({ url: '/pages/assistant/assistant' }); }
});
