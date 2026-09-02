const config = require('./utils/config');
const sessionStore = require('./utils/session');
const formatter = require('./utils/format');

App({
  globalData: {
    apiBaseUrl: config.getApiBaseUrl(),
    user: null,
    token: '',
    role: '',
    pendingPlotId: '',
    pendingTaskFocus: '',
    theme: 'light'
  },

  onLaunch() {
    this.restoreSession();
  },

  restoreSession() {
    const session = sessionStore.read();
    if (!session) {
      this.clearSession();
      return null;
    }
    this.globalData.user = session.user;
    this.globalData.token = session.token;
    this.globalData.role = session.user.role || '';
    return session;
  },

  setSession(auth) {
    const session = sessionStore.save(auth);
    this.globalData.user = session.user;
    this.globalData.token = session.token;
    this.globalData.role = session.user.role || '';
    return session;
  },

  clearSession() {
    sessionStore.clear();
    this.globalData.user = null;
    this.globalData.token = '';
    this.globalData.role = '';
  },

  isLoggedIn() {
    return Boolean(this.globalData.token && this.globalData.user);
  },

  expireSession() {
    if (this._expiringSession) return;
    this._expiringSession = true;
    this.clearSession();
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const current = pages.length ? pages[pages.length - 1] : null;
    if (current && current.route === 'pages/login/login') {
      this._expiringSession = false;
      return;
    }
    wx.reLaunch({
      url: '/pages/login/login?reason=expired',
      complete: () => { this._expiringSession = false; }
    });
  },

  logout() {
    this.clearSession();
    wx.reLaunch({ url: '/pages/login/login' });
  },

  requireLogin() {
    if (this.isLoggedIn()) return true;
    wx.reLaunch({ url: '/pages/login/login' });
    return false;
  },

  roleLabel() {
    return formatter.roleLabel(this.globalData.role);
  }
});
