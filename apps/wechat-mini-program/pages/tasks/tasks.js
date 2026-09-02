const api = require('../../utils/api');
const sessionStore = require('../../utils/session');
const formatter = require('../../utils/format');
const config = require('../../utils/config');

const FILTERS = [
  { code: 'ALL', label: '全部任务' },
  { code: 'OPEN', label: '待处理' },
  { code: 'IN_PROGRESS', label: '执行中' },
  { code: 'SUBMITTED', label: '待验收' },
  { code: 'DONE', label: '已完成' },
  { code: 'ALERTS', label: '告警' }
];

const OUTCOMES = [
  { code: 'SUCCEEDED', label: '顺利完成' },
  { code: 'PARTIAL', label: '部分完成' },
  { code: 'FAILED', label: '执行失败' },
  { code: 'TIMEOUT', label: '执行超时' }
];

const ISSUE_PRIORITIES = [
  { code: 'HIGH', label: '高' },
  { code: 'MEDIUM', label: '中' },
  { code: 'LOW', label: '低' }
];

function settled(promise) {
  return promise.then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error }));
}

function listFrom(value, keys) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (let index = 0; index < keys.length; index += 1) {
    if (Array.isArray(value[keys[index]])) return value[keys[index]];
  }
  return [];
}

function addPlatformScope(farms, role) {
  return role === 'SYSTEM_ADMIN' ? [{ farmId: '', name: '全平台范围', isPlatform: true }].concat(farms) : farms;
}

function statusTone(status) {
  const key = String(status || '').toUpperCase();
  if (['DONE', 'COMPLETED'].includes(key)) return 'good';
  if (['IN_PROGRESS', 'ASSIGNED'].includes(key)) return 'active';
  if (['REJECTED', 'CANCELLED', 'FAILED'].includes(key)) return 'bad';
  if (key === 'SUBMITTED') return 'medium';
  return 'neutral';
}

function alertTone(level) {
  const key = String(level || '').toUpperCase();
  return ['CRITICAL', 'HIGH'].includes(key) ? 'bad' : key === 'MEDIUM' ? 'medium' : 'neutral';
}

function normalizeAlert(raw) {
  const alert = formatter.normalizeAlert(raw);
  return Object.assign(alert, { tone: alertTone(alert.level) });
}

function filterTasks(tasks, filterCode) {
  const list = Array.isArray(tasks) ? tasks : [];
  switch (filterCode) {
    case 'OPEN': return list.filter((item) => ['OPEN', 'ASSIGNED', 'REJECTED'].includes(item.status));
    case 'IN_PROGRESS': return list.filter((item) => item.status === 'IN_PROGRESS');
    case 'SUBMITTED': return list.filter((item) => item.status === 'SUBMITTED');
    case 'DONE': return list.filter((item) => ['DONE', 'CANCELLED'].includes(item.status));
    default: return list;
  }
}

Page({
  data: {
    roleCode: '',
    roleLabel: '',
    farms: [],
    farmIndex: 0,
    farmLabel: '当前范围',
    filters: FILTERS.map((item, index) => Object.assign({}, item, { active: index === 0 })),
    filterCode: 'ALL',
    tasks: [],
    filteredTasks: [],
    alerts: [],
    selectedTaskId: '',
    selectedTask: null,
    loading: false,
    loaded: false,
    error: '',
    notice: '',
    lastUpdated: '',
    submitVisible: false,
    submitTaskId: '',
    submitTitle: '',
    resultSummary: '',
    outcomeOptions: OUTCOMES,
    outcomeIndex: 0,
    issueVisible: false,
    issueTaskId: '',
    issueDescription: '',
    issuePriorities: ISSUE_PRIORITIES,
    issuePriorityIndex: 0,
    actionBusy: ''
  },

  onLoad() {
    const app = getApp();
    if (!app.requireLogin()) return;
    const roleCode = String(app.globalData.role || '').toUpperCase();
    this.setData({ roleCode, roleLabel: formatter.roleLabel(roleCode) });
    this.loadData(false);
  },

  onShow() {
    if (!getApp().requireLogin()) return;
    const pendingFocus = getApp().globalData.pendingTaskFocus;
    if (pendingFocus) {
      getApp().globalData.pendingTaskFocus = '';
      const focus = FILTERS.some((item) => item.code === String(pendingFocus).toUpperCase()) ? String(pendingFocus).toUpperCase() : 'ALERTS';
      this.setFilter(focus);
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
      if (this.data.loaded && !this.data.actionBusy) this.loadData(true);
    }, config.pollInterval);
  },

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  },

  currentFarmId() {
    if (this.data.roleCode === 'SYSTEM_ADMIN' && this.data.farmIndex === 0) return '';
    const farm = this.data.farms[this.data.farmIndex];
    if (farm?.farmId) return farm.farmId;
    const ids = getApp().globalData.user?.farmIds || [];
    return ids.find((id) => id && id !== '*') || '';
  },

  loadFarms() {
    if (this.data.roleCode === 'FARMER') {
      const ids = getApp().globalData.user?.farmIds || [];
      return Promise.resolve(ids.filter((id) => id && id !== '*').map((id) => ({ farmId: id, name: id })));
    }
    const role = this.data.roleCode;
    return api.getFarms().then((value) => {
      const farms = listFrom(value, ['farms', 'items']).map((farm) => ({
        farmId: farm.farmId || farm.id,
        name: farm.name || farm.farmName || farm.farmId || farm.id
      })).filter((farm) => farm.farmId);
      return addPlatformScope(farms, role);
    });
  },

  decorateTasks(value) {
    return listFrom(value, ['workOrders', 'items']).map((item) => {
      const task = formatter.normalizeTask(item);
      return Object.assign(task, {
        statusTone: statusTone(task.status),
        sourceLabel: task.sourceType === 'ALERT' ? '告警核查' : task.sourceType === 'READINESS' ? '补证申请' : task.sourceType ? formatter.workActionLabel(task.actionType) : '农务任务',
        canStart: this.data.roleCode === 'FARMER' && task.canStart,
        canSubmit: this.data.roleCode === 'FARMER' && task.canSubmit,
        canReport: this.data.roleCode === 'FARMER' && task.canReport
      });
    });
  },

  applyTaskView(tasks, alerts, extra) {
    const selected = this.data.selectedTaskId ? tasks.find((item) => item.workOrderId === this.data.selectedTaskId) : null;
    const selectedTask = selected || (this.data.selectedTask ? tasks.find((item) => item.workOrderId === this.data.selectedTask.workOrderId) : null);
    this.setData(Object.assign({
      tasks,
      filteredTasks: filterTasks(tasks, this.data.filterCode),
      alerts,
      selectedTaskId: selectedTask?.workOrderId || '',
      selectedTask: selectedTask || null
    }, extra || {}));
  },

  loadData(silent) {
    if (this.data.loading && !silent) return;
    const sequence = (this._loadSequence || 0) + 1;
    this._loadSequence = sequence;
    const farmId = this.currentFarmId();
    this.setData({ loading: !silent, error: silent ? this.data.error : '', notice: silent ? this.data.notice : '' });
    Promise.all([
      settled(this.loadFarms()),
      settled(api.getWorkOrders(farmId ? { farmId } : {})),
      settled(api.getAlerts(farmId ? { farmId } : {}))
    ]).then((results) => {
      if (sequence !== this._loadSequence) return;
      const farmsResult = results[0];
      const tasksResult = results[1];
      const alertsResult = results[2];
      const farms = farmsResult.ok ? farmsResult.value : this.data.farms;
      const tasks = tasksResult.ok ? this.decorateTasks(tasksResult.value) : this.data.tasks;
      const alerts = alertsResult.ok ? listFrom(alertsResult.value, ['alerts', 'items']).map(normalizeAlert).filter((item) => !['CLOSED', 'RESOLVED'].includes(item.status)) : this.data.alerts;
      const farmIndex = Math.min(this.data.farmIndex, Math.max(0, farms.length - 1));
      const selectedFarm = farms[farmIndex];
      const hasAny = tasksResult.ok || alertsResult.ok || tasks.length > 0;
      const failures = results.filter((item) => !item.ok).length;
      this.applyTaskView(tasks, alerts, {
        farms,
        farmIndex,
        farmLabel: selectedFarm?.name || (this.data.roleCode === 'SYSTEM_ADMIN' ? '全平台范围' : farmId || '当前范围'),
        loaded: Boolean(hasAny),
        loading: false,
        error: hasAny ? '' : (results.find((item) => !item.ok)?.error?.message || '暂时无法读取任务数据'),
        notice: failures && hasAny ? '部分数据暂时不可用，页面会在下次刷新时补齐。' : '',
        lastUpdated: formatter.formatTime(new Date().toISOString())
      });
      wx.stopPullDownRefresh();
    }).catch((error) => {
      if (sequence !== this._loadSequence) return;
      this.setData({ loading: false, error: error?.message || '暂时无法读取任务数据' });
      wx.stopPullDownRefresh();
    });
  },

  reload() { this.loadData(false); },
  onPullDownRefresh() { this.loadData(false); },

  onFarmChange(event) {
    this.setData({ farmIndex: Number(event.detail.value), loaded: false, selectedTask: null, selectedTaskId: '' });
    this.loadData(false);
  },

  onFilterChange(event) { this.setFilter(event.currentTarget.dataset.code); },

  setFilter(code) {
    const normalized = FILTERS.some((item) => item.code === code) ? code : 'ALL';
    this.setData({
      filterCode: normalized,
      filters: FILTERS.map((item) => Object.assign({}, item, { active: item.code === normalized })),
      filteredTasks: filterTasks(this.data.tasks, normalized)
    });
  },

  openTask(event) {
    const id = event.currentTarget.dataset.id || '';
    const task = this.data.tasks.find((item) => item.workOrderId === id);
    if (!task) return;
    this.setData({ selectedTaskId: id === this.data.selectedTaskId ? '' : id, selectedTask: id === this.data.selectedTaskId ? null : task });
  },

  openPlot(event) {
    const plotId = event.currentTarget.dataset.plotId || this.data.selectedTask?.plotId || '';
    if (!plotId) return;
    getApp().globalData.pendingPlotId = plotId;
    wx.switchTab({ url: '/pages/plots/plots' });
  },

  startTask(event) {
    const task = this.data.tasks.find((item) => item.workOrderId === event.currentTarget.dataset.id);
    if (!task || !task.canStart || this.data.actionBusy) return;
    wx.showModal({
      title: '开始执行任务',
      content: `确认开始“${task.title}”吗？`,
      confirmText: '开始',
      success: (result) => {
        if (result.confirm) this.performTransition(task, { action: task.status === 'REJECTED' ? 'RESTART' : 'START', note: '种植农户开始执行任务' }, '任务已开始');
      }
    });
  },

  performTransition(task, payload, successMessage) {
    this.setData({ actionBusy: task.workOrderId });
    api.transitionWorkOrder(task.workOrderId, payload).then(() => {
      wx.showToast({ title: successMessage, icon: 'success' });
      return this.loadData(true);
    }).catch((error) => {
      wx.showToast({ title: error?.message || '任务更新失败', icon: 'none' });
    }).finally(() => this.setData({ actionBusy: '' }));
  },

  openSubmit(event) {
    const task = this.data.tasks.find((item) => item.workOrderId === event.currentTarget.dataset.id);
    if (!task || !task.canSubmit || this.data.actionBusy) return;
    this.setData({ submitVisible: true, submitTaskId: task.workOrderId, submitTitle: task.title, resultSummary: '', outcomeIndex: 0 });
  },

  closeSubmit() { if (!this.data.actionBusy) this.setData({ submitVisible: false }); },
  onResultInput(event) { this.setData({ resultSummary: event.detail.value }); },
  onOutcomeChange(event) { this.setData({ outcomeIndex: Number(event.detail.value) }); },

  submitResult() {
    const task = this.data.tasks.find((item) => item.workOrderId === this.data.submitTaskId);
    const summary = String(this.data.resultSummary || '').trim();
    if (!task || !task.canSubmit) return;
    if (summary.length < 2) {
      wx.showToast({ title: '请填写处理结果', icon: 'none' });
      return;
    }
    const outcome = OUTCOMES[this.data.outcomeIndex]?.code || 'SUCCEEDED';
    this.setData({ actionBusy: task.workOrderId });
    api.transitionWorkOrder(task.workOrderId, { action: 'SUBMIT', resultSummary: summary, outcome, note: summary }).then(() => {
      this.setData({ submitVisible: false });
      wx.showToast({ title: '结果已提交', icon: 'success' });
      return this.loadData(true);
    }).catch((error) => {
      wx.showToast({ title: error?.message || '提交失败', icon: 'none' });
    }).finally(() => this.setData({ actionBusy: '' }));
  },

  openIssue(event) {
    const task = this.data.tasks.find((item) => item.workOrderId === event.currentTarget.dataset.id);
    if (!task || !task.canReport || this.data.actionBusy) return;
    this.setData({ issueVisible: true, issueTaskId: task.workOrderId, issueDescription: '', issuePriorityIndex: 0 });
  },

  closeIssue() { if (!this.data.actionBusy) this.setData({ issueVisible: false }); },
  onIssueInput(event) { this.setData({ issueDescription: event.detail.value }); },
  onIssuePriorityChange(event) { this.setData({ issuePriorityIndex: Number(event.detail.value) }); },

  noop() {},

  submitIssue() {
    const task = this.data.tasks.find((item) => item.workOrderId === this.data.issueTaskId);
    const description = String(this.data.issueDescription || '').trim();
    if (!task || !task.canReport) return;
    if (description.length < 2) {
      wx.showToast({ title: '请具体描述遇到的问题', icon: 'none' });
      return;
    }
    const priority = ISSUE_PRIORITIES[this.data.issuePriorityIndex]?.code || 'HIGH';
    this.setData({ actionBusy: task.workOrderId });
    api.reportIssue(task.workOrderId, { description, priority }).then(() => {
      this.setData({ issueVisible: false });
      wx.showToast({ title: '问题已上报', icon: 'success' });
      return this.loadData(true);
    }).catch((error) => {
      wx.showToast({ title: error?.message || '上报失败', icon: 'none' });
    }).finally(() => this.setData({ actionBusy: '' }));
  }
});
