import { api } from '../api.js?v=20260901-v59-resource-sync-v1';
import { agentHistoryUserText, agentIntentLabel, agentResponseSource, agentResponseText, agentRoleLabel, normalizeAgentEvidence, normalizeAgentFacts, normalizeAgentRecommendations } from '../live-data.js?v=20260901-v59-resource-sync-v1';
import { analyzeImageFiles } from './image-vision.js?v=20260901-v59-resource-sync-v1';
import { agentRolePresentation } from '../agent-presentation.js?v=20260901-v59-resource-sync-v1';

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
    .replace(/[^，。！？；;\n]{0,36}(?:置信度|confidence)[^，。！？；;\n]{0,36}/gi, '')
    .replace(/[^，。！？；;\n]{0,36}(?:识别概率|模型评分|识别评分)[^，。！？；;\n]{0,36}/gi, '')
    .replace(/[，,]{2,}/g, '，')
    .replace(/^[，,；;\s]+/gm, '')
    .replace(/[，,]\s*([。！？])/g, '$1')
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
  // History records may contain the model's original lightweight Markdown even
  // when a fresh response has already passed through agentResponseText.  Run
  // both paths through the same display normalizer so `**bold**`, headings and
  // inline code never leak into the plain-text chat surface.
  const content = role === 'assistant'
    ? cleanAssistantText(agentResponseText({ narrative: rawContent }, rawContent))
    : agentHistoryUserText(rawContent, '已上传现场图片');
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
      const accepted = [];
      let totalBytes = attachments.value.reduce((sum, item) => sum + Number(item.size || 0), 0);
      files.slice(0, available).forEach(file => {
        const supported = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
        if (!supported || file.size > 8 * 1024 * 1024 || totalBytes + file.size > 24 * 1024 * 1024) return;
        accepted.push(file);
        totalBytes += file.size;
      });
      if (files.length > accepted.length) toast('仅支持 JPG、PNG、WebP 原图，单张不超过 8MB、单次总计不超过 24MB，最多 4 张', 'error');
      attachments.value = [...attachments.value, ...accepted.map(file => ({ id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, size: file.size, type: file.type, url: URL.createObjectURL(file), file }))];
      if (event.target) event.target.value = '';
    };
    const formatAttachmentSize = bytes => {
      const size = Number(bytes || 0);
      return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
    };
    const qualityLabel = value => ({
      CLEAR: '画面质量正常', LOW_LIGHT: '画面偏暗', OVEREXPOSED: '画面偏亮', BLURRY: '画面细节较少', UNKNOWN: '画面质量未检查'
    })[String(value || '').toUpperCase()] || '画面质量正常';
    const visionSummary = (items, sourceAttachments) => items.map((item, index) =>
      `${sourceAttachments[index]?.name || `图片${index + 1}`}（${item.width}×${item.height}px，${formatAttachmentSize(item.byteSize)}，原文件未压缩，${qualityLabel(item.quality)}）`
    ).join('；');
    const visionPayloads = (items, sourceAttachments) => items.map((item, index) => ({
      name: sourceAttachments[index]?.name || `图片${index + 1}`,
      mimeType: item.mimeType,
      dataUrl: item.dataUrl,
      width: item.width,
      height: item.height,
      quality: item.quality
    }));
    const buildVisionRequest = (question, summary) => `${question || '请分析我上传的现场图片。'}\n\n图片会以原文件字节直接送入视觉模型，不缩放、不转码、不压缩。原图信息：${summary}。请只基于图片实际可见内容回答，不要输出置信度、概率、百分比、模型评分或识别过程。我只问“这是什么”时，直接说对象名称和一两个可见特征，不要自动追加无关的地块遥测或灌溉建议。只有关键部位确实看不清时才简短说明具体限制。`;
    const analyzePhoto = async () => {
      if (!attachments.value.length || sending.value) return;
      if (!selectedPlotId.value) return toast('请先选择一块地', 'error');
      const count = attachments.value.length;
      const displayMessage = `请分析我上传的${count}张现场照片`;
      const photoAttachments = attachments.value.map(({ file, ...item }) => ({ ...item }));
      messages.value.push({ id: `user-image-${Date.now()}`, role: 'user', content: displayMessage, attachments: photoAttachments, time: messageTime(), source: '' });
      sending.value = true;
      scrollToBottom();
      try {
        const analyses = await analyzeImageFiles(attachments.value.map(item => item.file));
        // Keep the readable question in `displayMessage`; the model still
        // receives the image-specific instructions and original-file metadata.
        const requestText = buildVisionRequest(displayMessage, visionSummary(analyses, attachments.value));
        if (!conversationId.value) conversationId.value = createConversationId();
        selectedConversationId.value = conversationId.value;
        const response = await api.agentChat(requestText, selectedPlotId.value, conversationId.value, {
          images: visionPayloads(analyses, attachments.value),
          displayMessage
        });
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
        visibleMessageCount.value = 20;
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
      const displayMessage = text || '已上传现场图片';
      let requestText = text || '我上传了现场图片，请分析图片内容。';
      messages.value.push({ id: `user-${Date.now()}`, role: 'user', content: displayMessage, attachments: messageAttachments, time: messageTime(), source: '', facts: [], recommendations: [] });
      sending.value = true;
      scrollToBottom();
      try {
        if (hasAttachments) {
          const analyses = await analyzeImageFiles(attachments.value.map(item => item.file));
          requestText = buildVisionRequest(requestText, visionSummary(analyses, attachments.value));
          const response = await api.agentChat(requestText, selectedPlotId.value, conversationId.value, {
            images: visionPayloads(analyses, attachments.value),
            displayMessage
          });
          conversationId.value = response?.conversationId || conversationId.value;
          selectedConversationId.value = conversationId.value;
          const assistant = normalizeAgentMessage({ ...response, role: 'ASSISTANT', agentRole: response.agentRole || response.role, content: agentResponseText(response, '暂时没有生成有效回答，请补充照片位置、症状和拍摄时间。') }, props.state.sessionMode, currentRole.value);
          messages.value.push(assistant);
          if (props.state.sessionMode !== 'live') api.persistDemoAgentTurn({ conversationId: conversationId.value, plotId: selectedPlotId.value, userMessage: text || '已上传现场图片', assistantResponse: response });
          await refreshConversations();
          updateRoute(conversationId.value);
          return;
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
      nextTick(() => messageList.value?.addEventListener('scroll', handleMessageScroll));
    });
    onBeforeUnmount(() => {
      stopSidebarResize();
      window.removeEventListener('resize', normalizeViewportWidth);
      messageList.value?.removeEventListener('scroll', handleMessageScroll);
      attachments.value.forEach(revokeAttachment);
      messages.value.flatMap(message => message.attachments || []).forEach(revokeAttachment);
    });

    // 历史对话管理：轻量确认 / 三点菜单 / 重命名 / 置顶 / 批量删除
    const lightConfirm = ref(null); // { type:'delete', conversation } | { type:'bulk', ids:[...] }
    const menuFor = ref('');
    const renamingId = ref('');
    const renameText = ref('');
    const pinnedIds = ref([]);
    try { pinnedIds.value = JSON.parse(localStorage.getItem('agriloop-ai-pinned-conversations') || '[]') || []; } catch (error) { /* ignore */ }
    const bulkMode = ref(false);
    const bulkSelected = ref(new Set());
    const persistPinned = () => { try { localStorage.setItem('agriloop-ai-pinned-conversations', JSON.stringify(pinnedIds.value)); } catch (error) { /* ignore */ } };
    const closeMenu = () => { menuFor.value = ''; };
    const menuPos = ref({ left: 0, top: 0 });
    const toggleMenu = (conversation, event) => {
      if (menuFor.value === conversation.conversationId) { menuFor.value = ''; return; }
      // 菜单 teleport 到 body 后 fixed 定位，避免被会话列表 overflow 裁剪
      const rect = event?.currentTarget?.getBoundingClientRect ? event.currentTarget.getBoundingClientRect() : null;
      if (rect) {
        const width = 148;
        menuPos.value = {
          left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width + 8)),
          top: Math.min(window.innerHeight - 132, rect.bottom + 4)
        };
      }
      menuFor.value = conversation.conversationId;
    };
    const startRename = (conversation) => { renamingId.value = conversation.conversationId; renameText.value = conversation.title || ''; closeMenu(); };
    const commitRename = async () => {
      const id = renamingId.value; const text = renameText.value;
      renamingId.value = ''; renameText.value = '';
      if (!id || !text.trim()) return;
      const original = conversations.value.find(c => c.conversationId === id)?.title;
      if (original && text.trim() === original) return; // 未更改，仅退出编辑
      try {
        const saved = await api.renameAgentConversation(id, text.trim());
        const target = conversations.value.find(c => c.conversationId === id);
        if (target) target.title = saved?.title || text.trim();
        toast('对话已重命名');
      } catch (error) { toast(error.message || '重命名失败', 'error'); }
    };
    const togglePin = (conversation) => {
      const id = conversation.conversationId;
      pinnedIds.value = pinnedIds.value.includes(id) ? pinnedIds.value.filter(x => x !== id) : [id, ...pinnedIds.value];
      persistPinned(); closeMenu();
    };
    const isPinned = id => pinnedIds.value.includes(id);
    const orderedConversations = computed(() => {
      const list = Array.isArray(conversations.value) ? [...conversations.value] : [];
      list.sort((a, b) => (Number(isPinned(b.conversationId)) - Number(isPinned(a.conversationId))) || 0);
      return list;
    });
    const requestArchiveConversation = (conversation) => {
      if (!conversation?.conversationId || sending.value) return;
      closeMenu();
      lightConfirm.value = { type: 'archive', conversation };
    };
    const requestUnarchiveConversation = (conversation) => {
      if (!conversation?.conversationId || sending.value) return;
      closeMenu();
      lightConfirm.value = { type: 'unarchive', conversation };
    };
    const requestDeleteConversation = (conversation) => {
      if (!conversation?.conversationId || sending.value) return;
      closeMenu();
      lightConfirm.value = { type: 'delete', conversation };
    };
    const requestBulkArchive = () => {
      const ids = [...bulkSelected.value];
      if (!ids.length) return;
      closeMenu();
      lightConfirm.value = { type: 'bulk-archive', ids };
    };
    const requestBulkDelete = () => {
      const ids = [...bulkSelected.value];
      if (!ids.length) return;
      closeMenu();
      lightConfirm.value = { type: 'bulk-delete', ids };
    };
    const closeConfirm = () => { lightConfirm.value = null; };
    const confirmDeleteConversation = async () => {
      const target = lightConfirm.value;
      if (!target) return;
      lightConfirm.value = null;
      sending.value = true;
      try {
        if (target.type === 'bulk-archive') {
          for (const id of target.ids) await api.archiveAgentConversation(id, true);
          const moved = new Set(target.ids);
          conversations.value = conversations.value.filter(c => !moved.has(c.conversationId));
          bulkSelected.value = new Set(); bulkMode.value = false;
          toast(`已归档 ${target.ids.length} 个历史对话`);
        } else if (target.type === 'bulk-delete') {
          for (const id of target.ids) await api.deleteAgentConversation(id);
          const removed = new Set(target.ids);
          archivedConversations.value = archivedConversations.value.filter(c => !removed.has(c.conversationId));
          bulkSelected.value = new Set(); bulkMode.value = false;
          if (removed.has(selectedConversationId.value) || removed.has(conversationId.value)) {
            selectedConversationId.value = '';
            startNewConversation({ updateHash: true });
          }
          toast(`已删除 ${target.ids.length} 个已归档对话`);
        } else if (target.type === 'archive') {
          const conversation = target.conversation;
          await api.archiveAgentConversation(conversation.conversationId, true);
          conversations.value = conversations.value.filter(c => c.conversationId !== conversation.conversationId);
          toast('对话已归档');
        } else if (target.type === 'unarchive') {
          const conversation = target.conversation;
          await api.archiveAgentConversation(conversation.conversationId, false);
          archivedConversations.value = archivedConversations.value.filter(c => c.conversationId !== conversation.conversationId);
          conversation.archived = false;
          conversations.value = [conversation, ...conversations.value.filter(c => c.conversationId !== conversation.conversationId)];
          toast('对话已取消归档');
        } else {
          const conversation = target.conversation;
          await api.deleteAgentConversation(conversation.conversationId);
          if (archivedView.value) {
            archivedConversations.value = archivedConversations.value.filter(c => c.conversationId !== conversation.conversationId);
          } else {
            conversations.value = conversations.value.filter(c => c.conversationId !== conversation.conversationId);
          }
          if (selectedConversationId.value === conversation.conversationId || conversationId.value === conversation.conversationId) {
            selectedConversationId.value = '';
            startNewConversation({ updateHash: true });
          }
          toast('历史对话已删除');
        }
      } catch (error) { toast(error.message || '操作失败', 'error'); }
      finally { sending.value = false; }
    };
    const toggleBulkSelect = (id) => {
      const next = new Set(bulkSelected.value);
      if (next.has(id)) next.delete(id); else next.add(id);
      bulkSelected.value = next;
    };
    const enterBulkMode = () => { bulkMode.value = true; bulkSelected.value = new Set(); };
    const exitBulkMode = () => { bulkMode.value = false; bulkSelected.value = new Set(); closeMenu(); };
    // 已归档视图
    const archivedView = ref(false);
    const archivedConversations = ref([]);
    const loadArchivedConversations = async () => {
      loadingConversations.value = true;
      try { archivedConversations.value = (await api.getAgentConversations(50, true)) || []; }
      catch (error) { archivedConversations.value = []; toast(error.message || '已归档对话读取失败', 'error'); }
      finally { loadingConversations.value = false; }
    };
    const enterArchivedView = () => { archivedView.value = true; exitBulkMode(); loadArchivedConversations(); };
    const exitArchivedView = () => { archivedView.value = false; exitBulkMode(); };
    // 地块编号 → 地块名
    const plotNameOf = (plotId) => {
      if (!plotId) return '';
      const plot = (props.state.plots || []).find(p => p.plotId === plotId);
      return plot?.name || plotId;
    };
    // 消息向上加载（内存分页：默认显示最新 20 条，向上触顶自动加载更早）
    const visibleMessageCount = ref(20);
    const visibleMessages = computed(() => messages.value.slice(-Math.max(1, visibleMessageCount.value)));
    const loadingOlder = ref(false);
    const loadOlderMessages = async () => {
      if (loadingOlder.value || visibleMessageCount.value >= messages.value.length) return;
      loadingOlder.value = true;
      const el = messageList.value;
      const before = el ? el.scrollHeight : 0;
      visibleMessageCount.value += 20;
      await nextTick();
      if (el) el.scrollTop += (el.scrollHeight - before);
      loadingOlder.value = false;
    };
    const handleMessageScroll = () => {
      const el = messageList.value;
      if (!el || loadingOlder.value || visibleMessageCount.value >= messages.value.length) return;
      if (el.scrollTop <= 90) loadOlderMessages();
    };
    // 点击侧栏任意处：关闭菜单；若仍处于重命名编辑态则提交并退出（blur 兜底）
    const onSectionClick = () => { closeMenu(); if (renamingId.value) commitRename(); };

    return { input, selectedPlotId, conversationId, selectedConversationId, conversations, messages, loadingHistory, loadingConversations, sending, actionBusy, isActionBusy, isActionRunning, messageList, chatRoot, sidebarCollapsed, sidebarWidth, draggingSidebar, imageInput, attachments, suggestions, selectedPlotName, currentRole, rolePresentation, conversationTime, formatAttachmentSize, send, startNewConversation, selectConversation, handleKeydown, confirmAction, cancelAction, toggleDetails, toggleSidebar, startSidebarResize, onImageSelected, removeAttachment, analyzePhoto, lightConfirm, closeConfirm, confirmDeleteConversation, requestDeleteConversation, requestArchiveConversation, requestUnarchiveConversation, requestBulkArchive, requestBulkDelete, menuFor, menuPos, toggleMenu, closeMenu, onSectionClick, renamingId, renameText, startRename, commitRename, togglePin, isPinned, orderedConversations, bulkMode, bulkSelected, enterBulkMode, exitBulkMode, toggleBulkSelect, archivedView, archivedConversations, enterArchivedView, exitArchivedView, plotNameOf, visibleMessages, loadOlderMessages };
  },
  template: `
    <section ref="chatRoot" class="admin-ai-chat" :class="{ 'is-sidebar-collapsed': sidebarCollapsed, 'is-sidebar-resizing': draggingSidebar }" :style="{ '--ai-sidebar-width': sidebarWidth + 'px' }" aria-label="AI助手" @click="onSectionClick">
      <aside class="admin-ai-conversation-sidebar" aria-label="历史对话">
        <div class="admin-ai-sidebar-heading"><div><span class="admin-ai-sidebar-kicker">AgriLoop</span><strong>{{ archivedView ? '已归档对话' : rolePresentation.historyTitle }}</strong></div><div class="admin-ai-sidebar-heading-actions"><button v-if="!archivedView && !bulkMode" class="g-btn text sm admin-ai-bulk-toggle" type="button" title="批量管理历史对话" @click="enterBulkMode">批量</button><button v-if="!archivedView" class="g-btn text sm admin-ai-archived-toggle" type="button" title="查看已归档对话" @click="enterArchivedView">已归档</button><button v-if="archivedView" class="g-btn text sm admin-ai-archived-toggle" type="button" @click="exitArchivedView">返回</button><button class="g-btn icon-only compact admin-ai-sidebar-collapse" type="button" aria-label="隐藏历史对话" title="隐藏历史对话" @click="toggleSidebar"><app-icon name="chevron_left"></app-icon></button></div></div>
        <div class="admin-ai-conversation-list" :class="{ 'is-bulk-mode': bulkMode }" aria-live="polite">
          <div v-if="loadingConversations" class="admin-ai-sidebar-state"><app-icon name="hourglass_empty"></app-icon><span>正在读取…</span></div>
          <template v-if="!loadingConversations && archivedView">
            <div v-if="!archivedConversations.length" class="admin-ai-sidebar-state"><app-icon name="chat_bubble_outline"></app-icon><span>暂无已归档对话</span></div>
            <div v-for="conversation in archivedConversations" :key="conversation.conversationId" class="admin-ai-conversation-item archived" :class="{ active: selectedConversationId === conversation.conversationId, 'is-selected': bulkSelected.has(conversation.conversationId) }" @click="bulkMode ? toggleBulkSelect(conversation.conversationId) : selectConversation(conversation.conversationId)">
              <label v-if="bulkMode" class="admin-ai-conversation-check" @click.stop><input type="checkbox" :checked="bulkSelected.has(conversation.conversationId)" @change="toggleBulkSelect(conversation.conversationId)" :aria-label="'选择对话 ' + (conversation.title || '')"></label>
              <span class="admin-ai-conversation-title">{{ conversation.title || rolePresentation.historyItemFallback }}</span><span class="admin-ai-conversation-meta"><span>{{ plotNameOf(conversation.plotId) || (rolePresentation.code === 'SYSTEM_ADMIN' ? '全平台' : '全农场') }}</span><span>{{ conversationTime(conversation.updatedAt || conversation.lastMessageAt) }}</span></span>
              <template v-if="!bulkMode">
                <button type="button" class="admin-ai-conversation-menu" :disabled="sending" :aria-label="'对话操作 ' + (conversation.title || '')" title="更多操作" @click.stop="toggleMenu(conversation, $event)"><app-icon name="more_vert"></app-icon></button>
              </template>
            </div>
          </template>
          <template v-if="!loadingConversations && !archivedView">
            <div v-if="!conversations.length" class="admin-ai-sidebar-state"><app-icon name="chat_bubble_outline"></app-icon><span>{{ rolePresentation.historyEmpty }}</span></div>
            <div v-for="conversation in orderedConversations" :key="conversation.conversationId" class="admin-ai-conversation-item" :class="{ active: selectedConversationId === conversation.conversationId, 'is-selected': bulkSelected.has(conversation.conversationId) }" @click="bulkMode ? toggleBulkSelect(conversation.conversationId) : selectConversation(conversation.conversationId)">
              <label v-if="bulkMode" class="admin-ai-conversation-check" @click.stop><input type="checkbox" :checked="bulkSelected.has(conversation.conversationId)" @change="toggleBulkSelect(conversation.conversationId)" :aria-label="'选择对话 ' + (conversation.title || '')"></label>
              <template v-if="renamingId === conversation.conversationId"><span class="admin-ai-conversation-rename"><input ref="renameInputEl" v-model="renameText" class="admin-ai-rename-input" maxlength="36" placeholder="对话标题" @click.stop @keydown.enter="commitRename" @keydown.esc="renamingId = ''" @blur="commitRename" @focus="$event.target.select()"></span></template>
              <template v-else><span class="admin-ai-conversation-title"><app-icon v-if="isPinned(conversation.conversationId)" name="push_pin" class="admin-ai-pin-mark"></app-icon>{{ conversation.title || rolePresentation.historyItemFallback }}</span><span class="admin-ai-conversation-meta"><span>{{ plotNameOf(conversation.plotId) || (rolePresentation.code === 'SYSTEM_ADMIN' ? '全平台' : rolePresentation.code === 'FARM_ADMIN' ? '全农场' : '本人地块') }}</span><span>{{ conversationTime(conversation.updatedAt || conversation.lastMessageAt) }}</span></span></template>
              <template v-if="!bulkMode">
                <button type="button" class="admin-ai-conversation-menu" :disabled="sending" :aria-label="'对话操作 ' + (conversation.title || '')" title="更多操作" @click.stop="toggleMenu(conversation, $event)"><app-icon name="more_vert"></app-icon></button>
              </template>
            </div>
          </template>
          <div v-if="bulkMode" class="admin-ai-bulk-bar">
            <span>已选 {{ bulkSelected.size }} 项</span>
            <button class="g-btn text sm" type="button" @click="exitBulkMode">取消</button>
            <button v-if="!archivedView" class="g-btn text sm" type="button" :disabled="!bulkSelected.size || sending" @click="requestBulkArchive">归档所选</button>
            <button v-else class="g-btn text sm danger-text" type="button" :disabled="!bulkSelected.size || sending" @click="requestBulkDelete">删除所选</button>
          </div>
        </div>
      </aside>
      <button v-if="!sidebarCollapsed" class="admin-ai-sidebar-resizer" type="button" aria-label="调整历史对话栏宽度" title="拖动调整历史对话栏宽度" @pointerdown="startSidebarResize"><span></span></button>
      <div class="admin-ai-chat-main">
        <div class="admin-ai-chat-toolbar"><div class="admin-ai-chat-session"><button class="g-btn icon-only compact admin-ai-sidebar-toggle" type="button" :aria-label="sidebarCollapsed ? '显示历史对话' : '隐藏历史对话'" :title="sidebarCollapsed ? '显示历史对话' : '隐藏历史对话'" @click="toggleSidebar"><app-icon :name="sidebarCollapsed ? 'chevron_right' : 'chevron_left'"></app-icon></button><span class="admin-ai-online-dot" aria-hidden="true"></span><strong>{{ rolePresentation.assistantName }}</strong><span aria-hidden="true">·</span><span>{{ selectedPlotName }}</span></div><div class="admin-ai-chat-tools"><label class="admin-ai-plot-picker"><app-icon name="location_on"></app-icon><span class="admin-ai-control-label">{{ rolePresentation.code === 'SYSTEM_ADMIN' ? rolePresentation.contextLabel : '当前地块' }}</span><select class="g-select" v-model="selectedPlotId"><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name || plot.plotId }}</option></select></label><button class="g-btn secondary admin-ai-new-chat" type="button" :disabled="sending" @click="startNewConversation()"><app-icon name="add"></app-icon><span>新对话</span></button></div></div>
        <div class="admin-ai-message-list" :class="{ 'is-empty': !messages.length && !loadingHistory }" ref="messageList" aria-live="polite">
          <div class="admin-ai-history-loading" v-if="loadingHistory"><app-icon name="hourglass_empty"></app-icon><span>正在读取对话记录…</span></div>
          <button v-else-if="visibleMessages.length && visibleMessages.length < messages.length" type="button" class="admin-ai-load-older" @click="loadOlderMessages">加载更早消息</button>
          <div class="admin-ai-empty-state ai-chat-empty-state" v-else-if="!messages.length"><div class="admin-ai-empty-mark"><app-icon name="smart_toy"></app-icon></div><p class="admin-ai-empty-brand ai-chat-empty-brand">{{ rolePresentation.assistantName }}</p><strong class="admin-ai-empty-greeting">{{ rolePresentation.emptyGreeting }}</strong><p class="admin-ai-empty-copy">{{ rolePresentation.emptyCopy }}</p><div class="admin-ai-suggestions ai-chat-shortcuts" aria-label="快捷问题"><button type="button" v-for="suggestion in suggestions" :key="suggestion" :disabled="sending" @click="send(suggestion)"><span>{{ suggestion }}</span><app-icon name="arrow_upward"></app-icon></button></div></div>
          <template v-else><article v-for="message in visibleMessages" :key="message.id" class="admin-ai-message ai-chat-message" :class="[message.role, { error: message.error }]">
            <div class="admin-ai-avatar ai-chat-avatar" v-if="message.role !== 'user'"><app-icon name="smart_toy"></app-icon></div><div class="admin-ai-bubble"><div v-if="message.role !== 'user'" class="admin-ai-message-meta ai-chat-message-meta"><span class="admin-ai-message-author"><strong>{{ rolePresentation.assistantName }}</strong></span><span class="admin-ai-source ai-chat-source" :class="message.degraded ? 'warning' : 'success'">{{ message.source || '智能助手' }}</span><span v-if="message.intentLabel" class="admin-ai-intent ai-chat-intent">{{ message.intentLabel }}</span></div><div v-else class="ai-chat-user-bubble">{{ message.content }}</div><p v-if="message.role !== 'user'" class="ai-chat-answer">{{ message.content }}</p><div v-if="message.facts?.length" class="ai-chat-facts" :aria-label="rolePresentation.factsTitle"><div v-for="fact in message.facts" :key="fact.label" class="ai-chat-fact"><small>{{ fact.label }}</small><strong>{{ fact.value }}</strong></div></div><div v-if="message.recommendations?.length" class="ai-chat-recommendations"><strong>{{ rolePresentation.recommendationsTitle }}</strong><ul><li v-for="item in message.recommendations" :key="item">{{ item }}</li></ul></div><div v-if="message.attachments?.length" class="admin-ai-message-attachments"><figure v-for="attachment in message.attachments" :key="attachment.id"><img :src="attachment.url" :alt="attachment.name"><figcaption>{{ attachment.name }}</figcaption></figure></div>
              <div v-if="message.actionProposal" class="admin-ai-action-card ai-chat-action-card"><div class="admin-ai-action-heading"><app-icon name="bolt"></app-icon><strong>{{ rolePresentation.actionTitle }}</strong><span>{{ message.actionProposal.status === 'SUCCEEDED' ? '已完成' : message.actionProposal.status === 'CANCELED' ? '已取消' : '待确认' }}</span></div><p>{{ message.actionProposal.summary }}</p><small>仅执行已展示的内容；确认后会再次校验权限和当前数据。</small><div class="admin-ai-action-buttons" v-if="message.actionProposal.status === 'AWAITING_CONFIRMATION'"><button type="button" class="g-btn primary compact" :disabled="isActionBusy()" @click="confirmAction(message.actionProposal)">{{ isActionRunning(message.actionProposal.actionId) ? '执行中…' : '确认执行' }}</button><button type="button" class="g-btn secondary compact" :disabled="isActionBusy()" @click="cancelAction(message.actionProposal)">取消</button></div></div><button v-if="message.evidence?.length || message.traceId" type="button" class="ai-chat-details-button" :aria-expanded="message.detailsOpen ? 'true' : 'false'" @click="toggleDetails(message)"><app-icon :name="message.detailsOpen ? 'expand_less' : 'fact_check'"></app-icon>{{ message.detailsOpen ? rolePresentation.detailsCollapseLabel : rolePresentation.detailsLabel }}</button><div v-if="message.detailsOpen" class="ai-chat-details"><div class="ai-chat-detail-grid"><span v-if="message.roleLabel"><small>回答身份</small><strong>{{ message.roleLabel }}</strong></span><span v-if="message.scopeLabel"><small>数据范围</small><strong>{{ message.scopeLabel }}</strong></span><span v-if="message.intentLabel"><small>意图</small><strong>{{ message.intentLabel }}</strong></span><span v-if="message.traceId"><small>记录编号</small><code>{{ message.traceId }}</code></span></div><ul v-if="message.evidence?.length" class="ai-chat-evidence"><li v-for="item in message.evidence" :key="item.id"><span>{{ item.type === 'knowledge' ? '知识' : item.type === 'tool' ? '工具' : '版本' }}</span><b>{{ item.label }}</b><small>{{ item.scope }} · {{ item.provenance }}<template v-if="item.durationMs"> · {{ item.durationMs }} 毫秒</template></small></li></ul></div><small class="ai-chat-message-time">{{ message.source ? message.source + ' · ' : '' }}{{ message.time }}</small>
            </div></article><article class="admin-ai-message ai-chat-message assistant" v-if="sending"><div class="admin-ai-avatar ai-chat-avatar"><app-icon name="smart_toy"></app-icon></div><div class="admin-ai-bubble admin-ai-typing"><span class="admin-ai-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>{{ rolePresentation.typingLabel }}</span></div></article></template>
        </div>
        <footer class="admin-ai-compose-area"><div v-if="attachments.length" class="admin-ai-attachment-strip" aria-label="待发送图片"><div v-for="attachment in attachments" :key="attachment.id" class="admin-ai-attachment-preview"><img :src="attachment.url" :alt="attachment.name"><div><strong>{{ attachment.name }}</strong><small>{{ formatAttachmentSize(attachment.size) }}</small></div><button type="button" class="g-btn icon-only compact" :aria-label="'移除 ' + attachment.name" @click="removeAttachment(attachment.id)"><app-icon name="close"></app-icon></button></div></div><div class="admin-ai-composer"><textarea v-model="input" rows="2" maxlength="1000" aria-label="向 AI 助手提问" :placeholder="rolePresentation.inputPlaceholder" @keydown="handleKeydown"></textarea><div class="admin-ai-compose-tools"><input ref="imageInput" class="admin-ai-image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="选择图片" @change="onImageSelected"><button class="g-btn icon-only compact admin-ai-attach" type="button" aria-label="上传图片" title="上传图片" :disabled="sending || attachments.length >= 4" @click="imageInput?.click()"><app-icon name="attach_file"></app-icon></button><button v-if="attachments.length" class="g-btn secondary compact admin-ai-analyze-photo" type="button" :disabled="sending" @click="analyzePhoto"><app-icon name="image_search"></app-icon><span>分析照片</span></button></div><button class="admin-ai-send" type="button" :disabled="sending || (!input.trim() && !attachments.length)" :aria-label="sending ? '正在回答' : '发送消息'" @click="send()"><app-icon :name="sending ? 'hourglass_empty' : 'arrow_upward'"></app-icon></button></div>        <p class="admin-ai-chat-footnote">{{ rolePresentation.composerFootnote }}</p></footer>
      </div>
      <div v-if="lightConfirm" class="admin-ai-confirm-overlay" @click.self="closeConfirm">
        <div class="admin-ai-confirm-dialog">
          <p class="admin-ai-confirm-title">
            <template v-if="lightConfirm.type === 'bulk-archive'">归档所选 {{ lightConfirm.ids.length }} 个历史对话？</template>
            <template v-else-if="lightConfirm.type === 'bulk-delete'">删除所选 {{ lightConfirm.ids.length }} 个已归档对话？</template>
            <template v-else-if="lightConfirm.type === 'archive'">归档「{{ lightConfirm.conversation.title || '该历史对话' }}」？</template>
            <template v-else-if="lightConfirm.type === 'unarchive'">取消归档「{{ lightConfirm.conversation.title || '该历史对话' }}」？</template>
            <template v-else>删除「{{ lightConfirm.conversation.title || '该历史对话' }}」？</template>
          </p>
          <p class="admin-ai-confirm-sub">{{ lightConfirm.type === 'delete' || lightConfirm.type === 'bulk-delete' ? '删除后对话及其中所有消息将无法恢复。' : lightConfirm.type === 'unarchive' ? '取消归档后对话将重新出现在历史列表。' : '归档后可在「已归档」中查看，不会出现在历史列表。' }}</p>
          <div class="admin-ai-confirm-actions">
            <button class="g-btn" type="button" @click="closeConfirm">取消</button>
            <button v-if="lightConfirm.type === 'delete' || lightConfirm.type === 'bulk-delete'" class="g-btn danger" type="button" :disabled="sending" @click="confirmDeleteConversation">删除</button>
            <button v-else-if="lightConfirm.type === 'unarchive'" class="g-btn" type="button" :disabled="sending" @click="confirmDeleteConversation">取消归档</button>
            <button v-else class="g-btn" type="button" :disabled="sending" @click="confirmDeleteConversation">归档</button>
          </div>
        </div>
      </div>
        <div v-if="menuFor" class="admin-ai-menu-backdrop" @click="closeMenu"></div>
      <teleport to="body">
        <div v-if="menuFor" class="admin-ai-conversation-menu-pop admin-ai-menu-fixed" :style="{ left: menuPos.left + 'px', top: menuPos.top + 'px' }" @click.stop>
          <template v-for="conversation in [...archivedConversations, ...orderedConversations]" :key="conversation.conversationId">
            <template v-if="conversation.conversationId === menuFor">
              <template v-if="archivedView">
                <button type="button" @click="requestUnarchiveConversation(conversation)"><app-icon name="inbox"></app-icon>取消归档</button>
                <button type="button" class="danger" @click="requestDeleteConversation(conversation)"><app-icon name="delete"></app-icon>删除</button>
              </template>
              <template v-else>
                <button type="button" @click="startRename(conversation)"><app-icon name="edit"></app-icon>重命名</button>
                <button type="button" @click="togglePin(conversation)"><app-icon name="push_pin"></app-icon>{{ isPinned(conversation.conversationId) ? '取消置顶' : '置顶' }}</button>
                <button type="button" @click="requestArchiveConversation(conversation)"><app-icon name="inbox"></app-icon>归档</button>
              </template>
            </template>
          </template>
        </div>
      </teleport>
    </section>
  `
};
