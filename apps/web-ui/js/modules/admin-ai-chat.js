import { api } from '../api.js?v=20260831-ai-role-v1';
import { agentIntentLabel, agentResponseSource, agentResponseText, agentRoleLabel, normalizeAgentEvidence, normalizeAgentFacts, normalizeAgentRecommendations } from '../live-data.js?v=20260831-ai-role-v1';
import { analyzeImageFiles } from './image-vision.js?v=20260831-three-branch-v1';
import { agentRolePresentation } from '../agent-presentation.js?v=20260831-ai-presentation-v1';

const { ref, computed, inject, onMounted, onBeforeUnmount, nextTick, watch } = Vue;

const AI_SIDEBAR_MIN = 184;
const AI_SIDEBAR_MAX = 560;
const AI_SIDEBAR_DEFAULT = 248;

function clampSidebarWidth(value, containerWidth = 1280) {
  const available = Number(containerWidth);
  const maxByLayout = Number.isFinite(available) && available > 0
    ? Math.min(AI_SIDEBAR_MAX, Math.max(AI_SIDEBAR_MIN, Math.floor(available * .48)))
    : AI_SIDEBAR_MAX;
  const minByLayout = Number.isFinite(available) && available > 0
    ? Math.min(AI_SIDEBAR_MIN, Math.max(160, Math.floor(available * .32)))
    : AI_SIDEBAR_MIN;
  return Math.min(maxByLayout, Math.max(minByLayout, Number(value) || AI_SIDEBAR_DEFAULT));
}

function messageTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function normalizedRole(value) {
  return String(value || '').trim().toUpperCase() === 'USER' ? 'user' : 'assistant';
}

function textValue(value) { return value === undefined || value === null ? '' : String(value).trim(); }

function cleanAssistantText(value) {
  return textValue(value)
    .replace(/(?:[，,；;]\s*)?(?:置信度|confidence)\s*(?:约|为|是|:|：)?\s*\d+(?:\.\d+)?\s*%?\s*[，,；;]?/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeAgentMessage(item = {}, sessionMode = 'live', fallbackRole = '') {
  const role = normalizedRole(item.role);
  const response = item.response && typeof item.response === 'object' ? item.response : item;
  const rawResponseRole = textValue(item.agentRole || item.roleCode || response.agentRole || response.role);
  const responseRole = ['ASSISTANT', 'USER'].includes(rawResponseRole.toUpperCase()) ? textValue(fallbackRole) : rawResponseRole;
  const fallbackPresentation = agentRolePresentation(responseRole || fallbackRole);
  const roleProfile = item.roleProfile || response.roleProfile || {
    label: fallbackPresentation.label,
    scopeLabel: fallbackPresentation.scopeLabel,
    capabilities: [],
    restrictions: []
  };
  const rawContent = textValue(item.content || item.message || item.summary || agentResponseText(response, ''));
  const content = role === 'assistant' ? cleanAssistantText(rawContent) : rawContent;
  const isError = Boolean(item.error);
  return {
    id: item.messageId || item.traceId || `history-${Math.random().toString(36).slice(2)}`,
    role, content, time: messageTime(item.createdAt || item.timestamp),
    source: role === 'assistant' ? (item.sourceLabel || agentResponseSource(response, sessionMode)) : '',
    intent: role === 'assistant' ? textValue(item.intent || response.intent) : '',
    intentLabel: role === 'assistant' ? agentIntentLabel(item.intent || response.intent) : '',
    attachments: Array.isArray(item.attachments) ? item.attachments : (Array.isArray(response.attachments) ? response.attachments : []),
    actionProposal: item.actionProposal || response.actionProposal || null,
    facts: role === 'assistant' && !isError ? normalizeAgentFacts(response) : [],
    inference: role === 'assistant' && !isError ? content : '',
    recommendations: role === 'assistant' && !isError ? normalizeAgentRecommendations(response) : [],
    evidence: role === 'assistant' && !isError ? normalizeAgentEvidence(response) : [],
    traceId: role === 'assistant' ? textValue(item.traceId || response.traceId) : '',
    agentRole: role === 'assistant' ? (responseRole || fallbackPresentation.code) : '',
    roleLabel: role === 'assistant' ? textValue(item.roleLabel || response.roleLabel || agentRoleLabel(responseRole || fallbackRole) || fallbackPresentation.label) : '',
    scopeLabel: role === 'assistant' ? textValue(roleProfile?.scopeLabel) : '',
    roleProfile,
    detailsOpen: false,
    degraded: Boolean(item.degraded || response.degraded), error: isError
  };
}

function createConversationId() { return `conversation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

function conversationTime(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.UTC(2000, 0, 1)) return '刚刚';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export const AdminAiChatView = {
  name: 'AdminAiChatView',
  props: {
    state: { type: Object, required: true },
    routeParams: { type: Object, default: () => ({}) },
    routeView: { type: String, default: '' }
  },
  emits: ['data-invalidated', 'navigate'],
  setup(props, { emit }) {
    const toast = inject('toast', () => {});
    const input = ref('');
    const selectedPlotId = ref(props.routeParams?.targetPlot || props.routeParams?.plotId || props.state.plots?.[0]?.plotId || '');
    const conversationId = ref(props.routeParams?.conversationId || '');
    const selectedConversationId = ref(props.routeParams?.conversationId || '');
    const conversations = ref([]);
    const messages = ref([]);
    const loadingHistory = ref(false);
    const loadingConversations = ref(false);
    const sending = ref(false);
    const messageList = ref(null);
    const chatRoot = ref(null);
    const sidebarCollapsed = ref(localStorage.getItem('agriloop-ai-sidebar-collapsed') === '1');
    const storedSidebarWidth = Number(localStorage.getItem('agriloop-ai-sidebar-width'));
    const sidebarWidth = ref(Number.isFinite(storedSidebarWidth) ? clampSidebarWidth(storedSidebarWidth) : AI_SIDEBAR_DEFAULT);
    const draggingSidebar = ref(false);
    const imageInput = ref(null);
    const attachments = ref([]);
    const actionBusy = ref('');
    const isActionBusy = () => Boolean(actionBusy.value);
    const isActionRunning = actionId => actionBusy.value === actionId;
    const currentRole = computed(() => props.state?.currentUser?.role || 'FARM_ADMIN');
    const rolePresentation = computed(() => agentRolePresentation(currentRole.value));
    const routeTarget = computed(() => props.routeView || (rolePresentation.value.code === 'SYSTEM_ADMIN' ? 'admin-agent' : rolePresentation.value.code === 'FARMER' ? 'assistant' : 'ai-assistant'));
    const selectedPlotName = computed(() => props.state.plots?.find(item => item.plotId === selectedPlotId.value)?.name || rolePresentation.value.scopeLabel);
    const suggestions = computed(() => {
      const name = selectedPlotName.value === '全农场' ? '当前农场' : selectedPlotName.value;
      if (rolePresentation.value.code === 'FARM_ADMIN') {
        return [`总结${name}现在最需要处理的问题`, `分析${name}最近的告警`, `今天${name}应该给农户安排哪些任务`, '按紧急程度列出今天的农务建议'];
      }
      return rolePresentation.value.shortcutQuestions.map(item => item.question);
    });

    const setSidebarWidth = (value, containerWidth = chatRoot.value?.clientWidth) => {
      const width = clampSidebarWidth(value, containerWidth);
      sidebarWidth.value = width;
      try { localStorage.setItem('agriloop-ai-sidebar-width', String(width)); } catch (error) { /* private browsing */ }
    };
    const toggleSidebar = () => {
      sidebarCollapsed.value = !sidebarCollapsed.value;
      try { localStorage.setItem('agriloop-ai-sidebar-collapsed', sidebarCollapsed.value ? '1' : '0'); } catch (error) { /* private browsing */ }
    };
    let resizeCleanup = null;
    const stopSidebarResize = () => {
      draggingSidebar.value = false;
      if (resizeCleanup) { resizeCleanup(); resizeCleanup = null; }
    };
    const startSidebarResize = event => {
      if (sidebarCollapsed.value) return;
      event.preventDefault();
      const rect = chatRoot.value?.getBoundingClientRect();
      if (!rect) return;
      draggingSidebar.value = true;
      const move = pointerEvent => setSidebarWidth(pointerEvent.clientX - rect.left, rect.width);
      const stop = () => stopSidebarResize();
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop, { once: true });
      resizeCleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    };

    const revokeAttachment = attachment => { if (attachment?.url) URL.revokeObjectURL(attachment.url); };
    const releaseMessageImages = () => { messages.value.flatMap(message => message.attachments || []).forEach(revokeAttachment); };
    const removeAttachment = id => {
      const removed = attachments.value.find(item => item.id === id);
      revokeAttachment(removed);
      attachments.value = attachments.value.filter(item => item.id !== id);
    };
    const onImageSelected = event => {
      const files = Array.from(event.target?.files || []);
      const available = Math.max(0, 4 - attachments.value.length);
      const accepted = files.slice(0, available).filter(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 8 * 1024 * 1024);
      if (files.length > accepted.length) toast('仅支持 JPG、PNG、WebP 图片，单张不超过 8MB，最多 4 张', 'error');
      attachments.value = [...attachments.value, ...accepted.map(file => ({ id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, size: file.size, type: file.type, url: URL.createObjectURL(file), file }))];
      if (event.target) event.target.value = '';
    };
    const formatAttachmentSize = bytes => {
      const size = Number(bytes || 0);
      return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
    };
    const visionSummary = (items, sourceAttachments) => items.map((item, index) => {
      const predictions = (item.predictions || []).slice(0, 5).map(prediction =>
        `${prediction.label} ${Math.round(prediction.confidence * 100)}%`).join('、');
      const quality = item.quality === 'CLEAR' ? '主要物体较清晰' : '画面识别不确定';
      return `${sourceAttachments[index]?.name || `图片${index + 1}`}（${item.width}×${item.height}px；${quality}；候选物体：${predictions || '无'}）`;
    }).join('；');
    const buildVisionRequest = (question, summary) => `${question || '请分析我上传的现场图片。'}\n\n图片已由浏览器端视觉模型真实读取像素，识别证据如下：${summary}。请先回答图中是什么，再根据用户问题分析；候选结果不确定时必须明说并请用户补拍，不得用地块遥测代替图片内容。`;
    const analyzePhoto = async () => {
      if (!attachments.value.length || sending.value) return;
      if (!selectedPlotId.value) return toast('请先选择一块地', 'error');
      const count = attachments.value.length;
      const photoAttachments = attachments.value.map(({ file, ...item }) => ({ ...item }));
      messages.value.push({ id: `user-image-${Date.now()}`, role: 'user', content: `请分析我上传的${count}张现场照片`, attachments: photoAttachments, time: messageTime(), source: '' });
      sending.value = true;
      scrollToBottom();
      try {
        const analyses = await analyzeImageFiles(attachments.value.map(item => item.file));
        const summary = visionSummary(analyses, attachments.value);
        const requestText = buildVisionRequest(`请分析我上传的${count}张图片。`, summary);
        if (!conversationId.value) conversationId.value = createConversationId();
        selectedConversationId.value = conversationId.value;
        const response = await api.agentChat(requestText, selectedPlotId.value, conversationId.value);
        conversationId.value = response?.conversationId || conversationId.value;
        selectedConversationId.value = conversationId.value;
        const assistant = normalizeAgentMessage({ ...response, role: 'ASSISTANT', agentRole: response.agentRole || response.role, content: agentResponseText(response, '暂时没有生成有效回答，请补充照片位置、症状和拍摄时间。') }, props.state.sessionMode, currentRole.value);
        messages.value.push(assistant);
        if (props.state.sessionMode !== 'live') api.persistDemoAgentTurn({ conversationId: conversationId.value, plotId: selectedPlotId.value, userMessage: `请分析我上传的${count}张现场照片`, assistantResponse: response });
        await refreshConversations();
        updateRoute(conversationId.value);
      } catch (error) {
        messages.value.push({ id: `image-error-${Date.now()}`, role: 'assistant', content: `这次没有成功读取图片：${error.message || '视觉模型暂时不可用'}。请刷新后重试，或换一张主体更清晰的图片。`, time: messageTime(), source: '图片分析失败', error: true });
      } finally {
        attachments.value = [];
        sending.value = false;
      }
      await scrollToBottom();
    };

    watch(() => props.state.plots?.map(plot => plot.plotId).join('|'), () => { if (!selectedPlotId.value && props.state.plots?.[0]?.plotId) selectedPlotId.value = props.state.plots[0].plotId; });
    watch(() => props.routeParams?.plotId || props.routeParams?.targetPlot, value => { if (value) selectedPlotId.value = value; });
    watch(() => props.routeParams?.conversationId, value => {
      if (value && value !== conversationId.value && !loadingHistory.value) loadConversation(value, { updateHash: false });
    });

    const scrollToBottom = async () => { await nextTick(); if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight; };
    const updateRoute = id => {
      const params = { ...props.routeParams, conversationId: id };
      if (!id) delete params.conversationId;
      emit('navigate', routeTarget.value, params);
    };

    const loadConversation = async (id, { updateHash = true } = {}) => {
      if (!id) return;
      loadingHistory.value = true;
      try {
        const history = await api.getAgentHistory(id, 60);
        conversationId.value = history?.conversation?.conversationId || id;
        selectedConversationId.value = conversationId.value;
        releaseMessageImages();
        messages.value = (history?.messages || []).map(item => normalizeAgentMessage(item, props.state.sessionMode, currentRole.value)).filter(item => item.content);
        if (updateHash) updateRoute(conversationId.value);
      } catch (error) {
        releaseMessageImages();
        messages.value = [];
        toast(error.message || '历史对话加载失败', 'error');
      } finally { loadingHistory.value = false; scrollToBottom(); }
    };

    const startNewConversation = ({ updateHash: shouldUpdateHash = true } = {}) => {
      conversationId.value = createConversationId();
      selectedConversationId.value = '';
      releaseMessageImages();
      messages.value = [];
      input.value = '';
      if (shouldUpdateHash) updateRoute('');
      scrollToBottom();
    };

    const loadConversations = async () => {
      loadingConversations.value = true;
      try {
        conversations.value = (await api.getAgentConversations(20) || []).map(item => ({ ...item }));
        const routeConversation = props.routeParams?.conversationId;
        const target = routeConversation || conversations.value[0]?.conversationId;
        if (target) await loadConversation(target, { updateHash: !routeConversation });
        else startNewConversation({ updateHash: false });
      } catch (error) {
        conversations.value = [];
        toast(error.message || '对话列表加载失败', 'error');
        startNewConversation({ updateHash: false });
      } finally { loadingConversations.value = false; }
    };

    const refreshConversations = async () => { try { conversations.value = (await api.getAgentConversations(20) || []).map(item => ({ ...item })); } catch (error) { /* keep current chat usable */ } };

    const send = async (preset = '') => {
      const text = String(preset || input.value).trim();
      const hasAttachments = attachments.value.length > 0;
      if ((!text && !hasAttachments) || sending.value) return;
      if (!selectedPlotId.value) return toast('请先选择一块地', 'error');
      if (!conversationId.value) conversationId.value = createConversationId();
      selectedConversationId.value = conversationId.value;
      input.value = '';
      const messageAttachments = attachments.value.map(({ file, ...item }) => ({ ...item }));
      let requestText = text || '我上传了现场图片，请分析图片内容。';
      messages.value.push({ id: `user-${Date.now()}`, role: 'user', content: text || '已上传现场图片', attachments: messageAttachments, time: messageTime(), source: '', facts: [], recommendations: [] });
      sending.value = true;
      scrollToBottom();
      try {
        if (hasAttachments) {
          const analyses = await analyzeImageFiles(attachments.value.map(item => item.file));
          requestText = buildVisionRequest(requestText, visionSummary(analyses, attachments.value));
        }
        const response = await api.agentChat(requestText, selectedPlotId.value, conversationId.value);
        conversationId.value = response?.conversationId || conversationId.value;
        selectedConversationId.value = conversationId.value;
        const assistant = normalizeAgentMessage({ ...response, role: 'ASSISTANT', agentRole: response.agentRole || response.role, content: agentResponseText(response, '暂时没有生成有效回答，请换一种问法。') }, props.state.sessionMode, currentRole.value);
        messages.value.push(assistant);
        if (props.state.sessionMode !== 'live') api.persistDemoAgentTurn({ conversationId: conversationId.value, plotId: selectedPlotId.value, userMessage: text || '已上传现场图片', assistantResponse: response });
        await refreshConversations();
        updateRoute(conversationId.value);
      } catch (error) {
        messages.value.push({ id: `error-${Date.now()}`, role: 'assistant', content: `这次没有成功回答：${error.message || '服务暂时不可用'}`, time: messageTime(), source: '系统提示', error: true, facts: [], recommendations: [] });
      } finally { attachments.value = []; sending.value = false; scrollToBottom(); }
    };

    const selectConversation = id => loadConversation(id);
    const toggleDetails = message => { if (message) message.detailsOpen = !message.detailsOpen; };
    const confirmAction = async proposal => {
      if (!proposal?.actionId || actionBusy.value) return;
      actionBusy.value = proposal.actionId;
      try {
        const result = await api.confirmAgentAction(proposal.actionId, { idempotencyKey: `ui-agent:${proposal.actionId}` });
        proposal.status = result?.status || 'SUCCEEDED'; proposal.result = result?.result || result;
        messages.value.push({ id: `agent-result-${Date.now()}`, role: 'assistant', content: `已确认执行：${proposal.summary || '操作'}。${result?.status === 'SUCCEEDED' ? '操作已完成，相关页面正在同步。' : '操作未成功完成。'}`, time: messageTime(), source: '智能助手执行结果', facts: [], inference: '执行结果以平台返回状态为准。', recommendations: [] });
        emit('data-invalidated', { domains: result?.affectedDomains || proposal.affectedDomains || ['plots', 'devices', 'workOrders', 'alerts', 'overview'], record: result?.result || result, actionResult: result });
      } catch (error) { proposal.status = 'FAILED'; toast(error.message || 'Agent 操作执行失败', 'error'); }
      finally { actionBusy.value = ''; }
    };
    const cancelAction = async proposal => {
      if (!proposal?.actionId || actionBusy.value) return;
      actionBusy.value = proposal.actionId;
      try { const result = await api.cancelAgentAction(proposal.actionId); proposal.status = result?.status || 'CANCELED'; toast('已取消这项 Agent 操作'); }
      catch (error) { toast(error.message || '取消操作失败', 'error'); }
      finally { actionBusy.value = ''; }
    };
    const handleKeydown = event => { if (event.isComposing) return; if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } };
    const normalizeViewportWidth = () => setSidebarWidth(sidebarWidth.value);
    onMounted(() => {
      normalizeViewportWidth();
      window.addEventListener('resize', normalizeViewportWidth);
      loadConversations();
    });
    onBeforeUnmount(() => {
      stopSidebarResize();
      window.removeEventListener('resize', normalizeViewportWidth);
      attachments.value.forEach(revokeAttachment);
      messages.value.flatMap(message => message.attachments || []).forEach(revokeAttachment);
    });

    return { input, selectedPlotId, conversationId, selectedConversationId, conversations, messages, loadingHistory, loadingConversations, sending, actionBusy, isActionBusy, isActionRunning, messageList, chatRoot, sidebarCollapsed, sidebarWidth, draggingSidebar, imageInput, attachments, suggestions, selectedPlotName, currentRole, rolePresentation, conversationTime, formatAttachmentSize, send, startNewConversation, selectConversation, handleKeydown, confirmAction, cancelAction, toggleDetails, toggleSidebar, startSidebarResize, onImageSelected, removeAttachment, analyzePhoto };
  },
  template: `
    <section ref="chatRoot" class="admin-ai-chat" :class="{ 'is-sidebar-collapsed': sidebarCollapsed, 'is-sidebar-resizing': draggingSidebar }" :style="{ '--ai-sidebar-width': sidebarWidth + 'px' }" aria-label="AI助手">
      <aside class="admin-ai-conversation-sidebar" aria-label="历史对话">
        <div class="admin-ai-sidebar-heading"><div><span class="admin-ai-sidebar-kicker">AgriLoop</span><strong>{{ rolePresentation.historyTitle }}</strong></div><div class="admin-ai-sidebar-heading-actions"><button class="g-btn icon-only compact admin-ai-sidebar-collapse" type="button" aria-label="隐藏历史对话" title="隐藏历史对话" @click="toggleSidebar"><app-icon name="chevron_left"></app-icon></button></div></div>
        <div class="admin-ai-conversation-list" aria-live="polite">
          <div v-if="loadingConversations" class="admin-ai-sidebar-state"><app-icon name="hourglass_empty"></app-icon><span>正在读取…</span></div>
          <div v-else-if="!conversations.length" class="admin-ai-sidebar-state"><app-icon name="chat_bubble_outline"></app-icon><span>{{ rolePresentation.historyEmpty }}</span></div>
          <button v-for="conversation in conversations" :key="conversation.conversationId" type="button" class="admin-ai-conversation-item" :class="{ active: selectedConversationId === conversation.conversationId }" @click="selectConversation(conversation.conversationId)"><span class="admin-ai-conversation-title">{{ conversation.title || rolePresentation.historyItemFallback }}</span><span class="admin-ai-conversation-meta"><span>{{ conversation.plotId || (rolePresentation.code === 'SYSTEM_ADMIN' ? '全平台' : rolePresentation.code === 'FARM_ADMIN' ? '全农场' : '本人地块') }}</span><span>{{ conversationTime(conversation.updatedAt || conversation.lastMessageAt) }}</span></span></button>
        </div>
      </aside>
      <button v-if="!sidebarCollapsed" class="admin-ai-sidebar-resizer" type="button" aria-label="调整历史对话栏宽度" title="拖动调整历史对话栏宽度" @pointerdown="startSidebarResize"><span></span></button>
      <div class="admin-ai-chat-main">
        <div class="admin-ai-chat-toolbar"><div class="admin-ai-chat-session"><button class="g-btn icon-only compact admin-ai-sidebar-toggle" type="button" :aria-label="sidebarCollapsed ? '显示历史对话' : '隐藏历史对话'" :title="sidebarCollapsed ? '显示历史对话' : '隐藏历史对话'" @click="toggleSidebar"><app-icon :name="sidebarCollapsed ? 'chevron_right' : 'chevron_left'"></app-icon></button><span class="admin-ai-online-dot" aria-hidden="true"></span><strong>{{ rolePresentation.assistantName }}</strong><span aria-hidden="true">·</span><span>{{ selectedPlotName }}</span></div><div class="admin-ai-chat-tools"><label class="admin-ai-plot-picker"><app-icon name="location_on"></app-icon><span class="admin-ai-control-label">{{ rolePresentation.contextLabel }}</span><select class="g-select" v-model="selectedPlotId"><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name || plot.plotId }}</option></select></label><button class="g-btn secondary admin-ai-new-chat" type="button" :disabled="sending" @click="startNewConversation()"><app-icon name="add"></app-icon><span>新对话</span></button></div></div>
        <div class="admin-ai-message-list" :class="{ 'is-empty': !messages.length && !loadingHistory }" ref="messageList" aria-live="polite">
          <div class="admin-ai-history-loading" v-if="loadingHistory"><app-icon name="hourglass_empty"></app-icon><span>正在读取对话记录…</span></div>
          <div class="admin-ai-empty-state ai-chat-empty-state" v-else-if="!messages.length"><div class="admin-ai-empty-mark"><app-icon name="smart_toy"></app-icon></div><p class="admin-ai-empty-brand ai-chat-empty-brand">{{ rolePresentation.assistantName }}</p><strong class="admin-ai-empty-greeting">{{ rolePresentation.emptyGreeting }}</strong><p class="admin-ai-empty-copy">{{ rolePresentation.emptyCopy }}</p><div class="admin-ai-suggestions ai-chat-shortcuts" aria-label="快捷问题"><button type="button" v-for="suggestion in suggestions" :key="suggestion" :disabled="sending" @click="send(suggestion)"><span>{{ suggestion }}</span><app-icon name="arrow_upward"></app-icon></button></div></div>
          <template v-else><article v-for="message in messages" :key="message.id" class="admin-ai-message ai-chat-message" :class="[message.role, { error: message.error }]">
            <div class="admin-ai-avatar ai-chat-avatar" v-if="message.role !== 'user'"><app-icon name="smart_toy"></app-icon></div><div class="admin-ai-bubble"><div v-if="message.role !== 'user'" class="admin-ai-message-meta ai-chat-message-meta"><span class="admin-ai-message-author"><strong>{{ rolePresentation.assistantName }}</strong></span><span class="admin-ai-source ai-chat-source" :class="message.degraded ? 'warning' : 'success'">{{ message.source || '智能助手' }}</span><span v-if="message.intentLabel" class="admin-ai-intent ai-chat-intent">{{ message.intentLabel }}</span></div><div v-else class="ai-chat-user-bubble">{{ message.content }}</div><p v-if="message.role !== 'user'" class="ai-chat-answer">{{ message.content }}</p><div v-if="message.facts?.length" class="ai-chat-facts" :aria-label="rolePresentation.factsTitle"><div v-for="fact in message.facts" :key="fact.label" class="ai-chat-fact"><small>{{ fact.label }}</small><strong>{{ fact.value }}</strong></div></div><div v-if="message.recommendations?.length" class="ai-chat-recommendations"><strong>{{ rolePresentation.recommendationsTitle }}</strong><ul><li v-for="item in message.recommendations" :key="item">{{ item }}</li></ul></div><div v-if="message.attachments?.length" class="admin-ai-message-attachments"><figure v-for="attachment in message.attachments" :key="attachment.id"><img :src="attachment.url" :alt="attachment.name"><figcaption>{{ attachment.name }}</figcaption></figure></div>
              <div v-if="message.actionProposal" class="admin-ai-action-card ai-chat-action-card"><div class="admin-ai-action-heading"><app-icon name="bolt"></app-icon><strong>{{ rolePresentation.actionTitle }}</strong><span>{{ message.actionProposal.status === 'SUCCEEDED' ? '已完成' : message.actionProposal.status === 'CANCELED' ? '已取消' : '待确认' }}</span></div><p>{{ message.actionProposal.summary }}</p><small>仅执行已展示的内容；确认后会再次校验权限和当前数据。</small><div class="admin-ai-action-buttons" v-if="message.actionProposal.status === 'AWAITING_CONFIRMATION'"><button type="button" class="g-btn primary compact" :disabled="isActionBusy()" @click="confirmAction(message.actionProposal)">{{ isActionRunning(message.actionProposal.actionId) ? '执行中…' : '确认执行' }}</button><button type="button" class="g-btn secondary compact" :disabled="isActionBusy()" @click="cancelAction(message.actionProposal)">取消</button></div></div><button v-if="message.evidence?.length || message.traceId" type="button" class="ai-chat-details-button" :aria-expanded="message.detailsOpen ? 'true' : 'false'" @click="toggleDetails(message)"><app-icon :name="message.detailsOpen ? 'expand_less' : 'fact_check'"></app-icon>{{ message.detailsOpen ? rolePresentation.detailsCollapseLabel : rolePresentation.detailsLabel }}</button><div v-if="message.detailsOpen" class="ai-chat-details"><div class="ai-chat-detail-grid"><span v-if="message.roleLabel"><small>回答身份</small><strong>{{ message.roleLabel }}</strong></span><span v-if="message.scopeLabel"><small>数据范围</small><strong>{{ message.scopeLabel }}</strong></span><span v-if="message.intentLabel"><small>意图</small><strong>{{ message.intentLabel }}</strong></span><span v-if="message.traceId"><small>记录编号</small><code>{{ message.traceId }}</code></span></div><ul v-if="message.evidence?.length" class="ai-chat-evidence"><li v-for="item in message.evidence" :key="item.id"><span>{{ item.type === 'knowledge' ? '知识' : item.type === 'tool' ? '工具' : '版本' }}</span><b>{{ item.label }}</b><small>{{ item.scope }} · {{ item.provenance }}<template v-if="item.durationMs"> · {{ item.durationMs }} 毫秒</template></small></li></ul></div><small class="ai-chat-message-time">{{ message.source ? message.source + ' · ' : '' }}{{ message.time }}</small>
            </div></article><article class="admin-ai-message ai-chat-message assistant" v-if="sending"><div class="admin-ai-avatar ai-chat-avatar"><app-icon name="smart_toy"></app-icon></div><div class="admin-ai-bubble admin-ai-typing"><span class="admin-ai-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>{{ rolePresentation.typingLabel }}</span></div></article></template>
        </div>
        <footer class="admin-ai-compose-area"><div v-if="attachments.length" class="admin-ai-attachment-strip" aria-label="待发送图片"><div v-for="attachment in attachments" :key="attachment.id" class="admin-ai-attachment-preview"><img :src="attachment.url" :alt="attachment.name"><div><strong>{{ attachment.name }}</strong><small>{{ formatAttachmentSize(attachment.size) }}</small></div><button type="button" class="g-btn icon-only compact" :aria-label="'移除 ' + attachment.name" @click="removeAttachment(attachment.id)"><app-icon name="close"></app-icon></button></div></div><div class="admin-ai-composer"><textarea v-model="input" rows="2" maxlength="1000" aria-label="向 AI 助手提问" :placeholder="rolePresentation.inputPlaceholder" @keydown="handleKeydown"></textarea><div class="admin-ai-compose-tools"><input ref="imageInput" class="admin-ai-image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="选择图片" @change="onImageSelected"><button class="g-btn icon-only compact admin-ai-attach" type="button" aria-label="上传图片" title="上传图片" :disabled="sending || attachments.length >= 4" @click="imageInput?.click()"><app-icon name="attach_file"></app-icon></button><button v-if="attachments.length" class="g-btn secondary compact admin-ai-analyze-photo" type="button" :disabled="sending" @click="analyzePhoto"><app-icon name="image_search"></app-icon><span>分析照片</span></button></div><button class="admin-ai-send" type="button" :disabled="sending || (!input.trim() && !attachments.length)" :aria-label="sending ? '正在回答' : '发送消息'" @click="send()"><app-icon :name="sending ? 'hourglass_empty' : 'arrow_upward'"></app-icon></button></div><p class="admin-ai-chat-footnote">{{ rolePresentation.composerFootnote }}</p></footer>
      </div>
    </section>
  `
};
