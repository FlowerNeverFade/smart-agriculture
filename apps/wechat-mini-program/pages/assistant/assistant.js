const api = require('../../utils/api');
const sessionStore = require('../../utils/session');
const formatter = require('../../utils/format');

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024;

const ROLE_PRESENTATIONS = {
  FARMER: {
    label: '种植农户',
    assistantName: '农智助手 · 种植农户',
    scopeLabel: '本人负责地块',
    emptyGreeting: '今天想先处理什么？',
    emptyCopy: '我会先读取当前地块的可用证据；涉及写入的操作都会先给你预览。',
    placeholder: '问问当前地块，或描述你想执行的农事操作…',
    typing: '正在分析当前地块…',
    factsTitle: '现场依据',
    recommendationsTitle: '下一步农事',
    evidenceTitle: '回答依据与执行记录',
    shortcuts: [
      { label: '查看今天待办', question: '查看今天待办' },
      { label: '当前地块有什么风险', question: '当前地块有什么风险' },
      { label: '生成补水建议', question: '生成当前地块补水建议' },
      { label: '记录一次巡田', question: '帮我记录一次巡田' }
    ]
  },
  FARM_ADMIN: {
    label: '农场管理员',
    assistantName: '农智助手 · 农场管理员',
    scopeLabel: '当前农场（全场地块）',
    emptyGreeting: '今天想先处理什么？',
    emptyCopy: '我会结合当前地块的实时数据、告警和农务记录回答，先核对平台事实，再给出清晰的下一步建议。',
    placeholder: '查询告警、任务、设备或灌溉计划…',
    typing: '正在分析农场数据和农务记录…',
    factsTitle: '运营依据',
    recommendationsTitle: '建议安排',
    evidenceTitle: '运营依据与执行记录',
    shortcuts: [
      { label: '农场风险概览', question: '总结当前农场现在最需要处理的问题' },
      { label: '分析最近告警', question: '分析当前农场最近的告警' },
      { label: '安排今日任务', question: '今天应该给农户安排哪些任务' },
      { label: '查看灌溉安排', question: '查看当前农场的灌溉建议和资源安排' }
    ]
  },
  SYSTEM_ADMIN: {
    label: '系统管理员',
    assistantName: '农智助手 · 系统管理员',
    scopeLabel: '全平台（跨农场）',
    emptyGreeting: '今天要排查哪条平台链路？',
    emptyCopy: '我会结合平台遥测、服务健康、规则版本和审计记录给出分析；不会直接修改农场业务数据。',
    placeholder: '查询平台状态、数据链路、规则版本或跨农场风险…',
    typing: '正在核对平台状态与审计记录…',
    factsTitle: '平台事实',
    recommendationsTitle: '排查建议',
    evidenceTitle: '平台依据与审计记录',
    shortcuts: [
      { label: '系统资源状态', question: '系统资源状态如何？' },
      { label: '关联地块异常', question: '分析关联地块的异常原因' },
      { label: '规则与策略状态', question: '查看当前规则与策略状态' },
      { label: '全局风险概览', question: '当前所有地块的风险概览' }
    ]
  }
};

function listFrom(value, keys) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (let index = 0; index < keys.length; index += 1) {
    if (Array.isArray(value[keys[index]])) return value[keys[index]];
  }
  return [];
}

function settled(promise) {
  return promise.then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error }));
}

function safeId(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 90);
}

function conversationIdFor(userId) {
  const actor = safeId(userId || 'user');
  return `wx-${actor}-${Date.now().toString(36)}`.slice(0, 120);
}

function currentUserId() {
  const user = getApp().globalData.user || {};
  return user.userId || user.username || 'user';
}

function mimeFor(path) {
  const extension = String(path || '').split('?')[0].split('.').pop().toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  return 'image/png';
}

function fileInfo(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileInfo({
      filePath,
      success: resolve,
      fail: () => resolve({ size: 0 })
    });
  });
}

function readBase64(filePath) {
  return new Promise((resolve, reject) => {
    const manager = wx.getFileSystemManager();
    manager.readFile({
      filePath,
      encoding: 'base64',
      success: (result) => resolve(result.data),
      fail: reject
    });
  });
}

function imagePayload(filePath, size) {
  return readBase64(filePath).then((base64) => ({
    dataUrl: `data:${mimeFor(filePath)};base64,${base64}`,
    path: filePath,
    size: Number(size || 0),
    name: String(filePath || '').split('/').pop() || '现场图片'
  }));
}

function imageSizeLabel(size) {
  const bytes = Number(size || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return bytes ? `${bytes} B` : '原图';
}

Page({
  data: {
    roleCode: '',
    roleLabel: '',
    presentation: ROLE_PRESENTATIONS.FARMER,
    farms: [],
    farmIndex: 0,
    farmLabel: '当前范围',
    plots: [],
    selectedPlotId: '',
    selectedPlotIndex: 0,
    selectedPlotName: '当前地块',
    conversations: [],
    conversationId: '',
    messages: [],
    imageItems: [],
    input: '',
    loading: false,
    loadingHistory: false,
    sending: false,
    loaded: false,
    serviceStatus: 'CONNECTING',
    serviceStatusLabel: '连接中',
    error: '',
    notice: '',
    scrollIntoView: '',
    actionBusy: ''
  },

  onLoad() {
    const app = getApp();
    if (!app.requireLogin()) return;
    const roleCode = String(app.globalData.role || '').toUpperCase();
    const presentation = ROLE_PRESENTATIONS[roleCode] || ROLE_PRESENTATIONS.FARMER;
    this.setData({ roleCode, roleLabel: formatter.roleLabel(roleCode), presentation });
    this.pendingImages = [];
    this.loadPlots();
  },

  onShow() {
    if (!getApp().requireLogin()) return;
    if (this.data.loaded && !this.data.sending && !this.data.loadingHistory) this.loadConversations(false);
  },

  onUnload() {
    this.pendingImages = [];
  },

  currentFarmId() {
    const farm = this.data.farms[this.data.farmIndex];
    if (farm?.farmId) return farm.farmId;
    const ids = getApp().globalData.user?.farmIds || [];
    return ids.find((id) => id && id !== '*') || '';
  },

  loadPlots() {
    this.setData({ loading: true, error: '' });
    const role = this.data.roleCode;
    const user = getApp().globalData.user || {};
    const farmIds = (user.farmIds || []).filter((id) => id && id !== '*');
    const farmRequest = role === 'FARMER'
      ? Promise.resolve(farmIds.map((id) => ({ farmId: id, name: id })))
      : api.getFarms().then((value) => listFrom(value, ['farms', 'items']).map((farm) => ({ farmId: farm.farmId || farm.id, name: farm.name || farm.farmName || farm.farmId || farm.id })).filter((farm) => farm.farmId));
    const plotRequest = api.getPlots(role === 'FARMER' && farmIds.length === 1 ? { farmId: farmIds[0] } : {});
    Promise.all([settled(farmRequest), settled(plotRequest)]).then((results) => {
      const farmResult = results[0];
      const plotResult = results[1];
      const farms = farmResult.ok ? farmResult.value : [];
      const plots = plotResult.ok ? listFrom(plotResult.value, ['plots', 'items']).map((item) => formatter.normalizePlot(item)) : [];
      const pending = getApp().globalData.pendingPlotId;
      const selected = plots.find((item) => item.plotId === pending) || plots[0] || null;
      getApp().globalData.pendingPlotId = '';
      const hasAny = plotResult.ok;
      const serviceReady = plotResult.ok;
      this.setData({
        farms,
        farmIndex: 0,
        farmLabel: farms[0]?.name || (role === 'SYSTEM_ADMIN' ? '全平台范围' : this.currentFarmId() || '当前范围'),
        plots,
        selectedPlotId: selected?.plotId || '',
        selectedPlotIndex: selected ? plots.findIndex((item) => item.plotId === selected.plotId) : 0,
        selectedPlotName: selected?.name || (role === 'SYSTEM_ADMIN' ? '全平台范围（请选择地块后提问）' : '请选择地块'),
        loading: false,
        loaded: hasAny,
        error: hasAny ? '' : (plotResult.error?.message || '暂时无法读取地块数据'),
        serviceStatus: serviceReady ? 'READY' : 'DEGRADED',
        serviceStatusLabel: serviceReady ? '服务正常' : '地块数据不可用'
      });
      if (hasAny) this.loadConversations(true);
    }).catch((error) => {
      this.setData({ loading: false, serviceStatus: 'DEGRADED', serviceStatusLabel: '服务降级', error: error?.message || '暂时无法读取地块数据' });
    });
  },

  loadConversations(openRecent) {
    const sequence = (this._conversationSequence || 0) + 1;
    this._conversationSequence = sequence;
    const plotId = this.data.selectedPlotId;
    this.setData({ loadingHistory: true });
    api.getAgentConversations(plotId, 20).then((value) => {
      if (sequence !== this._conversationSequence) return;
      const list = listFrom(value, ['conversations', 'items', 'data']).filter((item) => !plotId || String(item.plotId || '') === String(plotId)).map((item) => ({
        conversationId: item.conversationId,
        title: item.title || '农事对话',
        plotId: item.plotId || '',
        plotName: this.data.plots.find((plot) => plot.plotId === item.plotId)?.name || item.plotId || '当前范围',
        messageCount: Number(item.messageCount || 0),
        updatedLabel: formatter.relativeTime(item.updatedAt || item.lastMessageAt),
        pinned: item.pinned === true
      })).filter((item) => item.conversationId);
      this.setData({ conversations: list, loadingHistory: false, error: '' });
      if (openRecent) {
        const remembered = sessionStore.readConversationId(currentUserId(), plotId);
        const target = list.find((item) => item.conversationId === remembered) || list[0];
        if (target) this.loadConversation(target.conversationId);
        else this.startConversation(false);
      }
    }).catch((error) => {
      if (sequence !== this._conversationSequence) return;
      this.setData({ conversations: [], loadingHistory: false, serviceStatus: 'DEGRADED', serviceStatusLabel: '历史不可用', notice: `历史对话暂不可用：${error?.message || '服务异常'}` });
      if (openRecent) this.startConversation(false);
    });
  },

  loadConversation(conversationId) {
    if (!conversationId || this.data.loadingHistory) return;
    const sequence = (this._historySequence || 0) + 1;
    this._historySequence = sequence;
    sessionStore.saveConversationId(currentUserId(), this.data.selectedPlotId, conversationId);
    this.setData({ loadingHistory: true, error: '', messages: [], conversationId });
    api.getAgentHistory(conversationId, 100).then((payload) => {
      if (sequence !== this._historySequence) return;
      const rawMessages = listFrom(payload, ['messages', 'items']);
      const messages = rawMessages.map((item) => formatter.normalizeAgentMessage(item, { sessionMode: 'live' }));
      this.setData({ messages, conversationId, loadingHistory: false, serviceStatus: 'READY', serviceStatusLabel: '服务正常', notice: '' });
      this.refreshActionStates(messages).then(() => this.scrollToBottom());
    }).catch((error) => {
      if (sequence !== this._historySequence) return;
      this.setData({ loadingHistory: false, error: error?.message || '历史消息读取失败', serviceStatus: 'DEGRADED', serviceStatusLabel: '服务降级' });
    });
  },

  refreshActionStates(messages) {
    const list = Array.isArray(messages) ? messages : this.data.messages;
    const proposals = list.map((message, index) => ({ message, index, proposal: message.actionProposal })).filter((item) => item.proposal?.actionId);
    if (!proposals.length) return Promise.resolve();
    return Promise.all(proposals.map((item) => api.getAgentAction(item.proposal.actionId).then((latest) => {
      const normalized = formatter.normalizeActionProposal(Object.assign({}, item.proposal, latest));
      item.message.actionProposal = normalized;
    }).catch(() => null))).then(() => this.setData({ messages: list }));
  },

  startConversation(showToast) {
    const userId = currentUserId();
    const conversationId = conversationIdFor(userId);
    this.pendingImages = [];
    sessionStore.saveConversationId(userId, this.data.selectedPlotId, conversationId);
    this.setData({ conversationId, messages: [], input: '', imageItems: [], error: '', notice: '' });
    if (showToast) wx.showToast({ title: '已新建对话', icon: 'none' });
  },

  onPlotChange(event) {
    const index = Number(event.detail.value);
    const plot = this.data.plots[index];
    if (!plot) return;
    this.pendingImages = [];
    this.setData({ selectedPlotIndex: index, selectedPlotId: plot.plotId, selectedPlotName: plot.name, conversations: [], messages: [], conversationId: '', imageItems: [], notice: '' });
    this.loadConversations(true);
  },

  selectConversation(event) { this.loadConversation(event.currentTarget.dataset.id); },
  newConversation() { this.startConversation(true); },

  onInput(event) { this.setData({ input: event.detail.value }); },
  onInputConfirm() { this.sendMessage(); },
  sendShortcut(event) {
    const question = String(event.currentTarget.dataset.question || '').trim();
    if (!question || this.data.sending) return;
    this.sendMessage(question);
  },

  chooseImage() {
    const remaining = MAX_IMAGES - this.pendingImages.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多选择 4 张图片', icon: 'none' });
      return;
    }
    wx.chooseImage({
      count: remaining,
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        const paths = result.tempFilePaths || [];
        Promise.all(paths.map((path) => fileInfo(path).then((info) => imagePayload(path, info.size))))
          .then((items) => {
            const accepted = [];
            let total = this.pendingImages.reduce((sum, item) => sum + Number(item.size || 0), 0);
            items.forEach((item) => {
              if (item.size > MAX_IMAGE_BYTES) {
                wx.showToast({ title: '单张图片不能超过 8MB', icon: 'none' });
                return;
              }
              if (total + item.size > MAX_TOTAL_IMAGE_BYTES) {
                wx.showToast({ title: '本次图片总大小不能超过 24MB', icon: 'none' });
                return;
              }
              total += item.size;
              accepted.push(item);
            });
            this.pendingImages = this.pendingImages.concat(accepted).slice(0, MAX_IMAGES);
            this.setData({ imageItems: this.pendingImages.map((item, index) => ({ id: `image-${index}-${Date.now()}`, path: item.path, name: item.name, sizeLabel: imageSizeLabel(item.size) })) });
          })
          .catch(() => wx.showToast({ title: '读取原图失败，请重试', icon: 'none' }));
      }
    });
  },

  removeImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.pendingImages.length) return;
    this.pendingImages.splice(index, 1);
    this.setData({ imageItems: this.pendingImages.map((item, itemIndex) => ({ id: `image-${itemIndex}-${Date.now()}`, path: item.path, name: item.name, sizeLabel: imageSizeLabel(item.size) })) });
  },

  sendMessage(providedQuestion) {
    if (this.data.sending) return;
    const question = String(providedQuestion === undefined ? this.data.input : providedQuestion || '').trim();
    const hasImages = this.pendingImages.length > 0;
    if (!question && !hasImages) {
      wx.showToast({ title: '请先输入问题或选择图片', icon: 'none' });
      return;
    }
    if (!this.data.selectedPlotId) {
      wx.showToast({ title: '请先选择可用地块', icon: 'none' });
      return;
    }
    const displayMessage = question || '请分析我上传的现场图片';
    const requestMessage = question || '请结合图片分析当前地块情况';
    const conversationId = this.data.conversationId || conversationIdFor(currentUserId());
    const userMessage = formatter.normalizeAgentMessage({ role: 'USER', messageId: `local-user-${Date.now()}`, content: displayMessage, plotId: this.data.selectedPlotId, createdAt: new Date().toISOString(), imageCount: this.pendingImages.length }, { sessionMode: 'live' });
    const images = this.pendingImages.map((item) => ({ dataUrl: item.dataUrl }));
    this.setData({ conversationId, messages: this.data.messages.concat(userMessage), input: '', sending: true, serviceStatus: 'CONNECTING', serviceStatusLabel: this.data.presentation.typing, error: '', notice: '' });
    api.agentChat({ message: requestMessage, displayMessage, plotId: this.data.selectedPlotId, conversationId, images }).then((response) => {
      const assistant = formatter.normalizeAgentMessage(Object.assign({}, response, { role: 'ASSISTANT', content: formatter.agentResponseText(response, '暂时没有生成有效回答，请换一种问法。') }), { sessionMode: 'live' });
      const nextId = response?.conversationId || conversationId;
      sessionStore.saveConversationId(currentUserId(), this.data.selectedPlotId, nextId);
      this.pendingImages = [];
      this.setData({ conversationId: nextId, messages: this.data.messages.concat(assistant), imageItems: [], sending: false, serviceStatus: response?.degraded ? 'DEGRADED' : 'READY', serviceStatusLabel: response?.degraded ? '规则降级' : '服务正常' });
      this.upsertConversation(response, displayMessage, nextId);
      this.scrollToBottom();
    }).catch((error) => {
      const failed = formatter.normalizeAgentMessage({ role: 'ASSISTANT', messageId: `error-${Date.now()}`, content: `这次没有成功回答：${error?.message || '服务暂时不可用'}。`, createdAt: new Date().toISOString(), degraded: true, adapter: 'rules' }, { sessionMode: 'live' });
      this.pendingImages = [];
      this.setData({ messages: this.data.messages.concat(failed), imageItems: [], sending: false, serviceStatus: 'DEGRADED', serviceStatusLabel: '服务降级', error: error?.message || '智能问答暂不可用' });
      this.scrollToBottom();
    });
  },

  upsertConversation(response, title, conversationId) {
    const existing = this.data.conversations.find((item) => item.conversationId === conversationId);
    const summary = Object.assign({}, existing || {}, {
      conversationId,
      title: existing?.title || title.slice(0, 36),
      plotId: this.data.selectedPlotId,
      plotName: this.data.selectedPlotName,
      messageCount: Number(existing?.messageCount || 0) + 2,
      updatedLabel: '刚刚'
    });
    this.setData({ conversations: [summary].concat(this.data.conversations.filter((item) => item.conversationId !== conversationId)) });
  },

  toggleDetails(event) {
    const index = Number(event.currentTarget.dataset.index);
    const messages = this.data.messages.slice();
    if (!messages[index]) return;
    messages[index].detailsOpen = !messages[index].detailsOpen;
    this.setData({ messages });
  },

  updateAction(actionId, changes) {
    const messages = this.data.messages.slice();
    messages.forEach((message) => {
      if (message.actionProposal?.actionId === actionId) {
        message.actionProposal = formatter.normalizeActionProposal(Object.assign({}, message.actionProposal, changes));
      }
    });
    this.setData({ messages });
  },

  confirmAction(event) {
    const actionId = event.currentTarget.dataset.id;
    if (!actionId || this.data.actionBusy) return;
    this.setData({ actionBusy: actionId });
    api.confirmAgentAction(actionId, { idempotencyKey: `wx-agent:${actionId}` }).then((result) => {
      const status = String(result?.status || '').toUpperCase();
      this.updateAction(actionId, Object.assign({}, result, { status: status || 'SUCCEEDED' }));
      if (status === 'EXECUTING') return this.waitForAction(actionId);
      return null;
    }).then(() => {
      wx.showToast({ title: '操作结果已更新', icon: 'success' });
    }).catch((error) => {
      this.updateAction(actionId, { status: error?.code === 'AGENT_ACTION_EXPIRED' ? 'EXPIRED' : 'FAILED', error: error?.message || '操作失败' });
      wx.showToast({ title: error?.message || '操作失败', icon: 'none' });
    }).finally(() => this.setData({ actionBusy: '' }));
  },

  waitForAction(actionId) {
    return new Promise((resolve) => {
      let attempts = 0;
      const poll = () => {
        attempts += 1;
        api.getAgentAction(actionId).then((latest) => {
          const status = String(latest?.status || '').toUpperCase();
          this.updateAction(actionId, latest);
          if (['SUCCEEDED', 'FAILED', 'PARTIAL', 'TIMEOUT', 'CANCELED', 'EXPIRED'].includes(status) || attempts >= 12) {
            resolve(latest);
          } else {
            setTimeout(poll, 350);
          }
        }).catch(() => resolve(null));
      };
      poll();
    });
  },

  cancelAction(event) {
    const actionId = event.currentTarget.dataset.id;
    if (!actionId || this.data.actionBusy) return;
    this.setData({ actionBusy: actionId });
    api.cancelAgentAction(actionId).then((result) => {
      this.updateAction(actionId, Object.assign({}, result, { status: result?.status || 'CANCELED' }));
      wx.showToast({ title: '已取消操作预览', icon: 'none' });
    }).catch((error) => {
      wx.showToast({ title: error?.message || '取消失败', icon: 'none' });
    }).finally(() => this.setData({ actionBusy: '' }));
  },

  scrollToBottom() {
    const messages = this.data.messages || [];
    if (!messages.length) return;
    const id = messages[messages.length - 1].domId || `message-${safeId(messages[messages.length - 1].messageId)}`;
    this.setData({ scrollIntoView: id });
  },

  goTasks() { wx.switchTab({ url: '/pages/tasks/tasks' }); },
  goPlots() { wx.switchTab({ url: '/pages/plots/plots' }); },
  noop() {}
});
