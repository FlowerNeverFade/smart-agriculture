const api = require('../../utils/api');
const sessionStore = require('../../utils/session');
const formatter = require('../../utils/format');
const config = require('../../utils/config');

function settled(promise) {
  return promise.then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error }));
}

Page({
  data: {
    user: null,
    roleCode: '',
    roleLabel: '',
    roleInitial: '我',
    farmScope: '未读取',
    plotScope: '未读取',
    permissions: [],
    apiBaseUrl: config.defaultApiBaseUrl,
    autoRefresh: true,
    serviceEntries: [],
    serviceOverall: 'UNKNOWN',
    serviceOverallLabel: '状态未知',
    loading: false,
    serviceLoading: false,
    error: '',
    notice: '',
    showTechnical: false
  },

  onLoad() {
    if (!getApp().requireLogin()) return;
    this.loadPreferences();
    this.loadProfile();
  },

  onShow() {
    if (!getApp().requireLogin()) return;
    if (this.data.user) this.loadServiceStatus(true);
  },

  loadPreferences() {
    const user = getApp().globalData.user || {};
    const userId = user.userId || user.username || 'anonymous';
    let autoRefresh = true;
    try {
      const stored = wx.getStorageSync(sessionStore.preferenceKey(userId, 'autoRefresh'));
      if (stored !== '' && stored !== null && stored !== undefined) autoRefresh = stored !== false;
    } catch (error) { autoRefresh = true; }
    this.setData({ autoRefresh, apiBaseUrl: config.getApiBaseUrl() });
  },

  loadProfile() {
    const cached = getApp().globalData.user || {};
    this.setData({ loading: true, user: cached, roleCode: String(cached.role || '').toUpperCase(), roleLabel: formatter.roleLabel(cached.role), roleInitial: formatter.roleLabel(cached.role).slice(0, 1), error: '' });
    Promise.all([settled(api.getMe()), settled(api.getSystemStatus())]).then((results) => {
      const meResult = results[0];
      const user = meResult.ok && meResult.value ? meResult.value : cached;
      if (meResult.ok && user?.userId) {
        const app = getApp();
        app.globalData.user = user;
        app.globalData.role = user.role || app.globalData.role;
      }
      const farmIds = Array.isArray(user?.farmIds) ? user.farmIds.filter((id) => id && id !== '*') : [];
      const plotIds = Array.isArray(user?.plotIds) ? user.plotIds.filter((id) => id && id !== '*') : [];
      const status = results[1].ok ? formatter.normalizeSystemStatus(results[1].value) : { entries: [], overall: 'UNKNOWN' };
      this.setData({
        user,
        roleCode: String(user?.role || '').toUpperCase(),
        roleLabel: formatter.roleLabel(user?.role),
        roleInitial: formatter.roleLabel(user?.role).slice(0, 1),
        farmScope: user?.farmIds?.includes?.('*') ? '全部农场' : farmIds.length ? `${farmIds.length} 个授权农场` : '未分配农场',
        plotScope: user?.plotIds?.includes?.('*') ? '全部地块' : plotIds.length ? `${plotIds.length} 个授权地块` : '按任务授权',
        permissions: Array.isArray(user?.permissions) ? user.permissions.slice(0, 12) : [],
        serviceEntries: status.entries,
        serviceOverall: String(status.overall || 'UNKNOWN').toUpperCase(),
        serviceOverallLabel: status.overall === 'UP' || status.overall === 'ONLINE' ? '服务正常' : results[1].ok ? '部分服务需留意' : '状态暂不可用',
        loading: false,
        notice: results[1].ok ? '' : `服务状态暂不可用：${results[1].error?.message || '请稍后重试'}`
      });
    }).catch((error) => this.setData({ loading: false, error: error?.message || '账号信息读取失败' }));
  },

  loadServiceStatus(silent) {
    if (this.data.serviceLoading) return;
    this.setData({ serviceLoading: true });
    api.getSystemStatus().then((value) => {
      const status = formatter.normalizeSystemStatus(value);
      this.setData({ serviceEntries: status.entries, serviceOverall: String(status.overall || 'UNKNOWN').toUpperCase(), serviceOverallLabel: status.overall === 'UP' || status.overall === 'ONLINE' ? '服务正常' : '部分服务需留意', serviceLoading: false, notice: silent ? this.data.notice : '' });
    }).catch((error) => this.setData({ serviceLoading: false, notice: `服务状态暂不可用：${error?.message || '请稍后重试'}` }));
  },

  refreshStatus() { this.loadServiceStatus(false); },

  onAutoRefreshChange(event) {
    const enabled = Boolean(event.detail.value);
    const user = getApp().globalData.user || {};
    const userId = user.userId || user.username || 'anonymous';
    try {
      wx.setStorageSync(sessionStore.preferenceKey(userId, 'autoRefresh'), enabled);
      this.setData({ autoRefresh: enabled });
      wx.showToast({ title: enabled ? '已开启自动刷新' : '已关闭自动刷新', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: '设置保存失败', icon: 'none' });
    }
  },

  copyApiUrl() {
    wx.setClipboardData({ data: this.data.apiBaseUrl, success: () => wx.showToast({ title: '接口地址已复制', icon: 'none' }) });
  },

  toggleTechnical() { this.setData({ showTechnical: !this.data.showTechnical }); },

  logout() {
    wx.showModal({ title: '退出登录', content: '退出后需要重新输入账号密码。', confirmText: '退出', confirmColor: '#a43c34', success: (result) => { if (result.confirm) getApp().logout(); } });
  },

  noop() {}
});
