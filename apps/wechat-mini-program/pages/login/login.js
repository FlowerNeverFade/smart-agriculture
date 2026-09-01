const api = require('../../utils/api');

const ROLE_LIST = [
  { code: 'FARM_ADMIN', label: '农场管理员', shortLabel: '管理员', description: '查看全场地块、告警、任务、设备和灌溉安排。' },
  { code: 'FARMER', label: '种植农户', shortLabel: '农户', description: '查看本人负责地块、任务进度和灌溉建议。' },
  { code: 'SYSTEM_ADMIN', label: '系统管理员', shortLabel: '系统', description: '查看平台状态、跨农场风险和审计信息。' }
];

Page({
  data: {
    roles: ROLE_LIST,
    roleIndex: 0,
    username: '',
    password: '',
    loading: false,
    error: ''
  },

  onLoad(options) {
    const app = getApp();
    if (app.isLoggedIn()) {
      wx.switchTab({ url: '/pages/home/home' });
      return;
    }
    if (options && options.reason === 'expired') {
      this.setData({ error: '登录已过期，请重新登录' });
    }
  },

  onRoleChange(event) {
    this.setData({ roleIndex: Number(event.detail.value), error: '' });
  },

  onUsernameInput(event) {
    this.setData({ username: event.detail.value, error: '' });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value, error: '' });
  },

  fillDemo(event) {
    const role = event.currentTarget.dataset.role;
    const index = ROLE_LIST.findIndex((item) => item.code === role);
    this.setData({
      roleIndex: index < 0 ? 0 : index,
      username: role === 'FARM_ADMIN' ? 'admin' : role === 'SYSTEM_ADMIN' ? 'sysadmin' : 'farmer',
      password: 'demo123',
      error: ''
    });
  },

  submitLogin() {
    if (this.data.loading) return;
    const username = String(this.data.username || '').trim();
    const password = String(this.data.password || '');
    const role = ROLE_LIST[this.data.roleIndex]?.code || 'FARM_ADMIN';
    if (!username) {
      this.setData({ error: '请输入账号' });
      return;
    }
    if (!password) {
      this.setData({ error: '请输入密码' });
      return;
    }
    this.setData({ loading: true, error: '' });
    api.login(username, password, role)
      .then((auth) => {
        if (!auth || !auth.accessToken || !auth.user) throw { message: '登录响应无效' };
        getApp().setSession(auth);
        wx.switchTab({ url: '/pages/home/home' });
      })
      .catch((error) => {
        this.setData({ error: error?.message || '登录失败，请检查账号和网络' });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});
