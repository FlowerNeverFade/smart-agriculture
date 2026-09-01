import { api } from '../api.js?v=20260901-v593-market-v3';
import { agentHistoryUserText, agentIntentLabel, agentResponseSource, agentResponseText, agentRoleLabel, normalizeAgentEvidence, normalizeAgentFacts, normalizeAgentRecommendations } from '../live-data.js?v=20260901-v593-market-v3';
import { analyzeImageFiles } from './image-vision.js?v=20260901-v593-market-v3';
import { agentRolePresentation } from '../agent-presentation.js?v=20260901-v593-market-v3';

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

export function plotFacilityIcon(plot = {}) {
  const raw = String(plot.facilityType || plot.plotType || plot.facilityLabel || plot.name || '').trim().toUpperCase();
  if (raw.includes('GREENHOUSE') || /温室|大棚/.test(raw)) return 'plot_greenhouse';
  if (raw.includes('SHADE_HOUSE') || raw.includes('SHADEHOUSE') || /遮阳棚/.test(raw)) return 'plot_shade_house';
  if (raw.includes('ORCHARD') || /果园/.test(raw)) return 'plot_orchard';
  if (raw.includes('OPEN_FIELD') || /露地|裸地/.test(raw)) return 'plot_open_field';
  return 'location_on';
}

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
    const expandedPlotIds = ref(new Set(selectedPlotId.value ? [selectedPlotId.value] : []));
    const archivedView = ref(Boolean(props.routeParams?.archived === true || props.routeParams?.archived === '1'));
    let selectingConversation = false;
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
        upsertConversationSummary({ conversationId: conversationId.value, plotId: selectedPlotId.value, title: displayMessage, response: response?.conversation });
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
    watch(() => props.routeParams?.archived, value => {
      const next = value === true || value === '1';
      if (next === archivedView.value) return;
      archivedView.value = next;
      exitBulkMode();
      if (next) loadArchivedConversations();
      else loadConversations();
    });
    watch(selectedPlotId, (value, oldValue) => { if (!selectingConversation) switchPlotContext(value, oldValue); });

    // 发送消息等用户动作后：平滑滚动到底部（保留 CSS scroll-behavior:smooth 动画）
    const scrollToBottom = async () => { await nextTick(); if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight; };
    // 打开/切换历史会话：瞬间定位到底部，禁用 smooth，避免打开时出现滚动动画。
    // 大列表/异步图片渲染会推高 scrollHeight，只滚一次可能停在半途看不到最新消息，
    // 因此追加几次延迟滚动，确保最新对话可见。
    const scrollToBottomInstant = async () => {
      await nextTick();
      const el = messageList.value;
      if (!el) return;
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      el.scrollTop = el.scrollHeight;
      el.style.scrollBehavior = prev;
      [0, 60, 180].forEach((delay) => setTimeout(() => {
        const target = messageList.value;
        if (!target) return;
        if (target.scrollTop + target.clientHeight < target.scrollHeight - 8) {
          const prevBehavior = target.style.scrollBehavior;
          target.style.scrollBehavior = 'auto';
          target.scrollTop = target.scrollHeight;
          target.style.scrollBehavior = prevBehavior;
        }
      }, delay));
    };
    const updateRoute = id => {
      const params = { ...props.routeParams, conversationId: id };
      if (!id) delete params.conversationId;
      if (selectedPlotId.value) params.plotId = selectedPlotId.value;
      if (!id) params.new = '1'; else delete params.new;
      emit('navigate', routeTarget.value, params);
    };

    const loadConversation = async (id, { updateHash = true } = {}) => {
      if (!id) return;
      loadingHistory.value = true;
      // 切换会话时先清空旧消息与分页计数，避免上一会话内容残留导致"先看到旧消息再下拉到最新"
      messages.value = [];
      visibleMessageCount.value = 20;
      try {
        const history = await api.getAgentHistory(id, 100);
        const historyPlotId = String(history?.conversation?.plotId || '').trim();
        if (historyPlotId && selectedPlotId.value && historyPlotId !== String(selectedPlotId.value)) {
          startNewConversation({ updateHash: true });
          return;
        }
        conversationId.value = history?.conversation?.conversationId || id;
        selectedConversationId.value = conversationId.value;
        releaseMessageImages();
        messages.value = (history?.messages || []).map(item => normalizeAgentMessage(item, props.state.sessionMode, currentRole.value)).filter(item => item.content);
        if (updateHash) updateRoute(conversationId.value);
      } catch (error) {
        releaseMessageImages();
        messages.value = [];
        toast(error.message || '历史对话加载失败', 'error');
      } finally { loadingHistory.value = false; scrollToBottomInstant(); }
    };

    const startNewConversation = ({ updateHash: shouldUpdateHash = true } = {}) => {
      // A new conversation is a local draft until the first message is sent.
      // Keeping the id empty prevents blank chats from being written to the
      // server or appearing in the history list.
      conversationId.value = '';
      selectedConversationId.value = '';
      releaseMessageImages();
      messages.value = [];
      input.value = '';
      attachments.value.forEach(revokeAttachment);
      attachments.value = [];
      if (shouldUpdateHash) updateRoute('');
      scrollToBottomInstant();
    };

    let plotContextReady = false;
    const loadConversations = async () => {
      loadingConversations.value = true;
      try {
        // Compatibility note: single-plot callers may still use
        // getAgentConversations(20, { plotId: selectedPlotId.value });
        conversations.value = (await api.getAgentConversations(50, { archived: false }) || []).map(item => ({ ...item }));
        if (selectedPlotId.value) expandedPlotIds.value = new Set([...expandedPlotIds.value, selectedPlotId.value]);
        const routeConversation = props.routeParams?.conversationId;
        if (props.routeParams?.new === '1' || props.routeParams?.new === true) {
          startNewConversation({ updateHash: false });
          return;
        }
        const routeTarget = conversations.value.find(item => item.conversationId === routeConversation && (!selectedPlotId.value || String(item.plotId || '') === String(selectedPlotId.value)));
        const currentPlotTarget = conversations.value
          .filter(item => !selectedPlotId.value || String(item.plotId || '') === String(selectedPlotId.value))
          .sort((a, b) => new Date(b.updatedAt || b.lastMessageAt || 0) - new Date(a.updatedAt || a.lastMessageAt || 0))[0];
        const target = routeTarget?.conversationId || currentPlotTarget?.conversationId;
        if (target) await loadConversation(target, { updateHash: !routeTarget });
        else startNewConversation({ updateHash: true });
      } catch (error) {
        conversations.value = [];
        toast(error.message || '对话列表加载失败', 'error');
        startNewConversation({ updateHash: false });
      } finally { loadingConversations.value = false; }
    };

    const refreshConversations = async () => {
      try {
        const serverItems = (await api.getAgentConversations(50, { archived: false }) || []).map(item => ({ ...item, pendingSync: false }));
        const serverIds = new Set(serverItems.map(item => item.conversationId));
        const now = Date.now();
        const pending = conversations.value.filter(item => item.pendingSync && item.conversationId && !serverIds.has(item.conversationId)
          && now - Number(item.pendingSyncAt || now) < 30_000);
        conversations.value = [...serverItems, ...pending];
      } catch (error) { /* keep the optimistic row usable while the store catches up */ }
    };

    const upsertConversationSummary = ({ conversationId: id, plotId, title, response } = {}) => {
      if (!id) return;
      const now = new Date().toISOString();
      const existing = conversations.value.find(item => item.conversationId === id);
      const cleanTitle = String(title || '已上传现场图片').replace(/\s+/g, ' ').trim().slice(0, 36);
      const summary = {
        ...(existing || {}),
        ...(response && typeof response === 'object' ? response : {}),
        conversationId: id,
        title: existing?.title || response?.title || cleanTitle,
        plotId: plotId || existing?.plotId || response?.plotId || '',
        messageCount: Number(response?.messageCount || existing?.messageCount || 0) + 2,
        updatedAt: response?.updatedAt || now,
        lastMessageAt: response?.lastMessageAt || now,
        pendingSync: true,
        pendingSyncAt: existing?.pendingSyncAt || Date.now()
      };
      conversations.value = [summary, ...conversations.value.filter(item => item.conversationId !== id)];
      if (summary.plotId) expandedPlotIds.value = new Set([...expandedPlotIds.value, String(summary.plotId)]);
    };

    const switchPlotContext = async (plotId, oldPlotId) => {
      if (!plotId || plotId === oldPlotId || !plotContextReady) return;
      selectedConversationId.value = '';
      conversationId.value = '';
      releaseMessageImages();
      messages.value = [];
      input.value = '';
      bulkSelected.value = new Set();
      bulkMode.value = false;
      closeMenu();
      renamingId.value = '';
      if (archivedView.value) await loadArchivedConversations();
      else {
        const target = conversations.value
          .filter(item => String(item.plotId || '') === String(plotId))
          .sort((a, b) => new Date(b.updatedAt || b.lastMessageAt || 0) - new Date(a.updatedAt || a.lastMessageAt || 0))[0];
        if (target) await loadConversation(target.conversationId, { updateHash: true });
        else startNewConversation({ updateHash: true });
      }
    };

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
          upsertConversationSummary({ conversationId: conversationId.value, plotId: selectedPlotId.value, title: displayMessage, response: response?.conversation });
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
        upsertConversationSummary({ conversationId: conversationId.value, plotId: selectedPlotId.value, title: displayMessage, response: response?.conversation });
        await refreshConversations();
        updateRoute(conversationId.value);
      } catch (error) {
        messages.value.push({ id: `error-${Date.now()}`, role: 'assistant', content: `这次没有成功回答：${error.message || '服务暂时不可用'}`, time: messageTime(), source: '系统提示', error: true, facts: [], recommendations: [] });
      } finally { attachments.value = []; sending.value = false; scrollToBottom(); }
    };

    const selectConversation = async id => {
      const conversation = [...conversations.value, ...archivedConversations.value].find(item => item.conversationId === id);
      if (conversation?.plotId && conversation.plotId !== selectedPlotId.value) {
        selectingConversation = true;
        selectedPlotId.value = conversation.plotId;
        expandedPlotIds.value = new Set([...expandedPlotIds.value, conversation.plotId]);
      }
      try { await loadConversation(id); } finally { selectingConversation = false; }
    };
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
      plotContextReady = true;
      if (archivedView.value) loadArchivedConversations(); else loadConversations();
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
    const searchQuery = ref('');
    const searchActive = ref(false);
    const searchInput = ref(null);
    const focusSearch = () => { searchActive.value = true; setTimeout(() => { if (searchInput.value) searchInput.value.focus(); }, 150); };
      const menuFor = ref('');
    const renamingId = ref('');
    const renameText = ref('');
    const pinnedIds = ref([]);
    const pinStorageKey = `agriloop-ai-pinned-conversations:${props.state?.currentUser?.userId || props.state?.currentUser?.username || 'demo'}`;
    try {
      const stored = localStorage.getItem(pinStorageKey) || localStorage.getItem('agriloop-ai-pinned-conversations');
      pinnedIds.value = JSON.parse(stored || '[]') || [];
    } catch (error) { /* ignore */ }
    const bulkMode = ref(false);
    const bulkSelected = ref(new Set());
    const persistPinned = () => { try { localStorage.setItem(pinStorageKey, JSON.stringify(pinnedIds.value)); } catch (error) { /* ignore */ } };
    const closeMenu = () => { menuFor.value = ''; };
    const menuPos = ref({ left: 0, top: 0 });
    const toggleMenu = (conversation, event) => {
      if (menuFor.value === conversation.conversationId) { menuFor.value = ''; return; }
      // 菜单 teleport 到 body 后 fixed 定位，避免被会话列表 overflow 裁剪
      const rect = event?.currentTarget?.getBoundingClientRect ? event.currentTarget.getBoundingClientRect() : null;
      if (rect) {
        const width = 148;
        menuPos.value = {
          left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.left)),
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
    const togglePin = async (conversation) => {
      const id = conversation.conversationId;
      const nextPinned = !isPinned(id);
      try {
        const saved = await api.setAgentConversationPinned(id, nextPinned);
        conversation.pinned = saved?.pinned === true || nextPinned;
        pinnedIds.value = nextPinned ? [id, ...pinnedIds.value.filter(x => x !== id)] : pinnedIds.value.filter(x => x !== id);
        persistPinned();
        closeMenu();
      } catch (error) { toast(error.message || '置顶状态更新失败', 'error'); }
    };
    const isPinned = id => pinnedIds.value.includes(id) || Boolean(conversations.value.find(item => item.conversationId === id)?.pinned);
    const orderedConversations = computed(() => {
      const list = Array.isArray(conversations.value) ? [...conversations.value] : [];
      list.sort((a, b) => (Number(isPinned(b.conversationId)) - Number(isPinned(a.conversationId)))
        || (new Date(b.updatedAt || b.lastMessageAt || 0) - new Date(a.updatedAt || a.lastMessageAt || 0)));
      return list;
    });
    const orderedArchivedConversations = computed(() => {
      const list = Array.isArray(archivedConversations.value) ? [...archivedConversations.value] : [];
      list.sort((a, b) => new Date(b.updatedAt || b.lastMessageAt || 0) - new Date(a.updatedAt || a.lastMessageAt || 0));
      return list;
    });
    const activeConversationTitle = computed(() => {
      const active = [...conversations.value, ...archivedConversations.value]
        .find(item => item.conversationId === selectedConversationId.value);
      return active?.title || (conversationId.value ? '当前对话' : '新对话');
    });
    const plotFolders = computed(() => {
      const folderMap = new Map();
      (props.state.plots || []).forEach(plot => folderMap.set(String(plot.plotId), { plotId: plot.plotId, name: plot.name || plot.plotId, icon: plotFacilityIcon(plot), conversations: [] }));
      const source = archivedView.value ? orderedArchivedConversations.value : orderedConversations.value;
      const sq = searchQuery.value.trim().toLowerCase();
      const filteredSource = sq ? source.filter(c => (c.title || '').toLowerCase().includes(sq)) : source;
      filteredSource.forEach(item => {
        const key = String(item.plotId || '__unassigned');
        if (!folderMap.has(key)) folderMap.set(key, { plotId: item.plotId || '', name: item.plotId ? item.plotId : '未关联地块', icon: item.plotId ? 'location_on' : 'chat_bubble_outline', conversations: [] });
        folderMap.get(key).conversations.push(item);
      });
      return (sq ? [...folderMap.values()].filter(f => f.conversations.length > 0) : [...folderMap.values()]).map(folder => ({ ...folder, expanded: sq ? true : expandedPlotIds.value.has(String(folder.plotId)) }));
    });
    const visibleConversationRows = computed(() => plotFolders.value.flatMap(folder => folder.conversations));
    const togglePlotFolder = folder => {
      const plotId = String(folder?.plotId || '');
      const next = new Set(expandedPlotIds.value);
      if (next.has(plotId)) next.delete(plotId); else next.add(plotId);
      expandedPlotIds.value = next;
      if (folder?.plotId && folder.plotId !== selectedPlotId.value) selectedPlotId.value = folder.plotId;
    };
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
    const requestBulkUnarchive = () => {
      const ids = [...bulkSelected.value];
      if (!ids.length) return;
      closeMenu();
      lightConfirm.value = { type: 'bulk-unarchive', ids };
    };
    const closeConfirm = () => { lightConfirm.value = null; };
    const confirmDeleteConversation = async () => {
      const target = lightConfirm.value;
      if (!target) return;
      lightConfirm.value = null;
      sending.value = true;
      try {
        if (target.type === 'bulk-archive') {
          const completed = []; const failed = [];
          for (const id of target.ids) { try { await api.archiveAgentConversation(id, true); completed.push(id); } catch (error) { failed.push(id); } }
          const moved = new Set(completed);
          conversations.value = conversations.value.filter(c => !moved.has(c.conversationId));
          bulkSelected.value = new Set(failed); bulkMode.value = failed.length > 0;
          toast(failed.length ? `已归档 ${completed.length} 个，${failed.length} 个失败，请重试` : `已归档 ${completed.length} 个历史对话`, failed.length ? 'error' : undefined);
        } else if (target.type === 'bulk-unarchive') {
          const completed = []; const failed = [];
          for (const id of target.ids) { try { await api.archiveAgentConversation(id, false); completed.push(id); } catch (error) { failed.push(id); } }
          const moved = new Set(completed);
          archivedConversations.value = archivedConversations.value.filter(c => !moved.has(c.conversationId));
          await refreshConversations();
          bulkSelected.value = new Set(failed); bulkMode.value = failed.length > 0;
          toast(failed.length ? `已取消归档 ${completed.length} 个，${failed.length} 个失败，请重试` : `已取消归档 ${completed.length} 个历史对话`, failed.length ? 'error' : undefined);
        } else if (target.type === 'bulk-delete') {
          const completed = []; const failed = [];
          for (const id of target.ids) { try { await api.deleteAgentConversation(id); completed.push(id); } catch (error) { failed.push(id); } }
          const removed = new Set(completed);
          archivedConversations.value = archivedConversations.value.filter(c => !removed.has(c.conversationId));
          bulkSelected.value = new Set(failed); bulkMode.value = failed.length > 0;
          if (removed.has(selectedConversationId.value) || removed.has(conversationId.value)) {
            selectedConversationId.value = '';
            startNewConversation({ updateHash: true });
          }
          toast(failed.length ? `已删除 ${completed.length} 个，${failed.length} 个失败，请重试` : `已删除 ${completed.length} 个已归档对话`, failed.length ? 'error' : undefined);
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
    const archivedConversations = ref([]);
    const visibleArchivedConversations = computed(() => orderedArchivedConversations.value);
    const loadArchivedConversations = async () => {
      loadingConversations.value = true;
      try { archivedConversations.value = (await api.getAgentConversations(50, { archived: true })) || []; }
      catch (error) { archivedConversations.value = []; toast(error.message || '已归档对话读取失败', 'error'); }
      finally { loadingConversations.value = false; }
    };
    const enterArchivedView = () => { archivedView.value = true; exitBulkMode(); loadArchivedConversations(); emit('navigate', routeTarget.value, { ...props.routeParams, archived: '1', plotId: selectedPlotId.value }); };
    const exitArchivedView = () => { archivedView.value = false; exitBulkMode(); emit('navigate', routeTarget.value, { ...props.routeParams, archived: '0', plotId: selectedPlotId.value }); };
    // 地块编号 → 地块名
    const plotNameOf = (plotId) => {
      if (!plotId) return '';
      const plot = (props.state.plots || []).find(p => p.plotId === plotId);
      return plot?.name || plotId;
    };
    // 消息向上加载（打开会话自动显示最新 20 条并定位最新；向上触顶自动加载更早，无需按钮）
    const visibleMessageCount = ref(20);
    const visibleMessages = computed(() => messages.value.slice(-Math.max(1, visibleMessageCount.value)));
    const loadingOlder = ref(false);
    const loadOlderMessages = async () => {
      if (loadingOlder.value || visibleMessageCount.value >= messages.value.length) return;
      loadingOlder.value = true;
      const el = messageList.value;
      const oldScrollHeight = el ? el.scrollHeight : 0;
      const oldScrollTop = el ? el.scrollTop : 0;
      
      visibleMessageCount.value += 20;
      await nextTick();
      
      if (el) {
        const newScrollHeight = el.scrollHeight;
        const heightDiff = newScrollHeight - oldScrollHeight;
        if (heightDiff > 0) {
          const prev = el.style.scrollBehavior;
          el.style.scrollBehavior = 'auto';
          el.scrollTop = oldScrollTop + heightDiff;
          el.style.scrollBehavior = prev;
        }
      }
      loadingOlder.value = false;
    };
    const handleMessageScroll = () => {
      const el = messageList.value;
      if (!el || loadingOlder.value || visibleMessageCount.value >= messages.value.length) return;
      if (el.scrollTop <= 90) loadOlderMessages();
    };
    // 点击侧栏任意处：关闭菜单；若仍处于重命名编辑态则提交并退出（blur 兜底）
    const onSectionClick = () => { closeMenu(); if (renamingId.value) commitRename(); };

    return { input, selectedPlotId, conversationId, selectedConversationId, conversations, messages, loadingHistory, loadingConversations, sending, actionBusy, isActionBusy, isActionRunning, messageList, chatRoot, sidebarCollapsed, sidebarWidth, draggingSidebar, imageInput, attachments, suggestions, selectedPlotName, activeConversationTitle, currentRole, rolePresentation, conversationTime, formatAttachmentSize, send, startNewConversation, selectConversation, handleKeydown, confirmAction, cancelAction, toggleDetails, toggleSidebar, startSidebarResize, onImageSelected, removeAttachment, analyzePhoto, lightConfirm, closeConfirm, confirmDeleteConversation, requestDeleteConversation, requestArchiveConversation, requestUnarchiveConversation, requestBulkArchive, requestBulkUnarchive, requestBulkDelete, menuFor, menuPos, toggleMenu, closeMenu, onSectionClick, renamingId, renameText, startRename, commitRename, togglePin, isPinned, orderedConversations, plotFolders, expandedPlotIds, togglePlotFolder, bulkMode, bulkSelected, enterBulkMode, exitBulkMode, toggleBulkSelect, archivedView, archivedConversations, visibleArchivedConversations, enterArchivedView, exitArchivedView, plotNameOf, visibleMessages, loadOlderMessages, searchQuery, searchActive, searchInput, focusSearch };
  },
  template: `
    <section ref="chatRoot" class="admin-ai-chat" :class="{ 'is-sidebar-collapsed': sidebarCollapsed, 'is-sidebar-resizing': draggingSidebar }" :style="{ '--ai-sidebar-width': sidebarWidth + 'px' }" aria-label="AI助手" @click="onSectionClick">
      <!-- 当前地块选择位于输入区上方；admin-ai-new-chat 是侧栏唯一的新建入口。 -->
      <aside class="admin-ai-conversation-sidebar" aria-label="地块与历史对话">
        <div class="admin-ai-sidebar-heading">
          <div><span class="admin-ai-sidebar-kicker">AgriLoop</span><strong>{{ archivedView ? '已归档对话' : '历史对话' }}</strong></div>
          <div class="admin-ai-sidebar-heading-actions">
            <button v-if="!archivedView" class="admin-ai-new-sidebar-button admin-ai-new-chat" type="button" title="创建新对话" @click="startNewConversation()"><app-icon name="add"></app-icon><span>新对话</span></button>
            <button v-else class="g-btn text sm admin-ai-archived-toggle" type="button" @click="exitArchivedView">返回活跃对话</button>
          </div>
        </div>
          <div class="admin-ai-sidebar-tools" style="display: flex; justify-content: flex-end; gap: 4px; padding: 0 8px 4px; align-items: center;">
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; width: 100%;">
              <div :class="{'is-active': searchActive || searchQuery}" style="display: flex; align-items: center; border-radius: 12px; background: var(--g-bg-subtle); transition: max-width 0.3s ease; max-width: 24px; overflow: hidden; height: 24px; flex: 0 0 auto;" :style="{ maxWidth: (searchActive || searchQuery) ? '180px' : '24px', flex: (searchActive || searchQuery) ? '1' : '0 0 auto' }">
                <button type="button" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 0; background: transparent; cursor: pointer; flex-shrink: 0; padding: 0; outline: none;" @click="focusSearch()" title="搜索">
                  <app-icon name="search" style="font-size: 15px; color: var(--g-text-secondary);"></app-icon>
                </button>
                <input type="text" ref="searchInput" v-model="searchQuery" placeholder="搜索历史对话..." style="border: 0 !important; background-color: transparent !important; box-shadow: none !important; appearance: none; outline: none; width: 100%; font-size: 12px; color: var(--g-text-primary); padding: 0 8px 0 0; margin: 0; opacity: 1;" @blur="!searchQuery && (searchActive = false)">
              </div>
              <button type="button" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 0; background: transparent; cursor: pointer; flex-shrink: 0; padding: 0; outline: none; border-radius: 4px;" @click="bulkMode ? exitBulkMode() : enterBulkMode()" :title="bulkMode ? '退出多选' : '批量选择'">
                <app-icon :name="bulkMode ? 'close' : 'checklist'" style="font-size: 16px; color: var(--g-text-secondary);"></app-icon>
              </button>
            </div>
          </div>
          <div v-if="bulkMode" class="admin-ai-bulk-bar admin-ai-bulk-bar-top">
          <span>已选 {{ bulkSelected.size }} 项</span>
          <button class="g-btn text sm" type="button" @click="exitBulkMode">取消</button>
          <button v-if="!archivedView" class="g-btn text sm" type="button" :disabled="!bulkSelected.size || sending" @click="requestBulkArchive">归档所选</button>
          <template v-else><button class="g-btn text sm" type="button" :disabled="!bulkSelected.size || sending" @click="requestBulkUnarchive">取消归档所选</button><button class="g-btn text sm danger-text" type="button" :disabled="!bulkSelected.size || sending" @click="requestBulkDelete">删除所选</button></template>
        </div>
        <div class="admin-ai-conversation-list" :class="{ 'is-bulk-mode': bulkMode }" aria-live="polite">
          <div v-if="loadingConversations" class="admin-ai-sidebar-state"><app-icon name="hourglass_empty"></app-icon><span>正在读取…</span></div>
          <div v-if="!loadingConversations && !plotFolders.length" class="admin-ai-sidebar-state"><app-icon name="chat_bubble_outline"></app-icon><span>{{ archivedView ? '暂无已归档对话' : rolePresentation.historyEmpty }}</span></div>
          <section v-for="folder in plotFolders" :key="folder.plotId || '__unassigned'" class="admin-ai-plot-folder" :class="{ 'is-current': folder.plotId === selectedPlotId }">
            <button type="button" class="admin-ai-plot-folder-heading" :aria-expanded="folder.expanded ? 'true' : 'false'" @click="togglePlotFolder(folder)">
              <app-icon :name="folder.expanded ? 'expand_more' : 'chevron_right'"></app-icon><app-icon :name="folder.icon" class="admin-ai-plot-icon" :title="folder.name"></app-icon><span>{{ folder.name }}</span><small>{{ folder.conversations.length }}</small>
            </button>
            <div v-if="folder.expanded" class="admin-ai-plot-folder-list">
              <div v-if="!folder.conversations.length" class="admin-ai-folder-empty">暂无对话</div>
              <div v-for="conversation in folder.conversations" :key="conversation.conversationId" class="admin-ai-conversation-item" :class="{ active: selectedConversationId === conversation.conversationId, archived: archivedView, 'is-selected': bulkSelected.has(conversation.conversationId) }" @click="bulkMode ? toggleBulkSelect(conversation.conversationId) : selectConversation(conversation.conversationId)">
                <label v-if="bulkMode" class="admin-ai-conversation-check" @click.stop><input type="checkbox" :checked="bulkSelected.has(conversation.conversationId)" @change="toggleBulkSelect(conversation.conversationId)" :aria-label="'选择对话 ' + (conversation.title || '')"></label>
                <template v-if="renamingId === conversation.conversationId">
                    <input type="text" class="g-input sm" style="width: 100%; margin: -4px 0 -4px -8px;" v-model="renameText" @click.stop @keyup.enter="commitRename" @blur="commitRename" placeholder="重命名对话..." autofocus>
                  </template>
                  <span v-else class="admin-ai-conversation-title"><app-icon v-if="isPinned(conversation.conversationId) && !archivedView" name="push_pin" class="admin-ai-pin-mark"></app-icon>{{ conversation.title || rolePresentation.historyItemFallback }}</span><span class="admin-ai-conversation-meta"><span>{{ conversationTime(conversation.updatedAt || conversation.lastMessageAt) }}</span></span>
                <div v-if="!bulkMode" class="admin-ai-conversation-actions" @click.stop>
                    <button type="button" class="admin-ai-conversation-action" aria-label="选项" title="选项" @click="toggleMenu(conversation, $event)"><app-icon name="more_vert"></app-icon></button>
                  </div>
              </div>
            </div>
          </section>
        </div>
        <div class="admin-ai-sidebar-footer">
          <button v-if="!archivedView" type="button" class="admin-ai-archived-entry" @click="enterArchivedView">
            <app-icon name="inbox"></app-icon><span>已归档对话</span>
          </button>
          <button v-else type="button" class="admin-ai-archived-entry" @click="exitArchivedView">
            <app-icon name="arrow_back"></app-icon><span>返回活跃对话</span>
          </button>
          <button v-if="archivedView && !bulkMode" type="button" class="admin-ai-archived-manage" @click="enterBulkMode">管理归档</button>
        </div>
      </aside>
      <button v-if="!sidebarCollapsed" class="admin-ai-sidebar-resizer" type="button" aria-label="调整历史对话栏宽度" title="拖动调整历史对话栏宽度" @pointerdown="startSidebarResize"><span></span></button>
      <div class="admin-ai-chat-main">
        <div class="admin-ai-chat-toolbar"><div class="admin-ai-chat-session"><button class="g-btn icon-only compact admin-ai-sidebar-toggle" type="button" :aria-label="sidebarCollapsed ? '显示地块与历史对话' : '隐藏地块与历史对话'" :title="sidebarCollapsed ? '显示地块与历史对话' : '隐藏地块与历史对话'" @click="toggleSidebar"><app-icon :name="sidebarCollapsed ? 'chevron_right' : 'chevron_left'"></app-icon></button><span class="admin-ai-online-dot" aria-hidden="true"></span><strong>{{ rolePresentation.assistantName }}</strong><span aria-hidden="true">·</span><span class="admin-ai-session-title">{{ activeConversationTitle }}</span></div></div>
        <div class="admin-ai-message-list" :class="{ 'is-empty': !messages.length && !loadingHistory }" ref="messageList" aria-live="polite">
          <div class="admin-ai-history-loading" v-if="loadingHistory"><app-icon name="hourglass_empty"></app-icon><span>正在读取对话记录…</span></div>

          <div class="admin-ai-empty-state ai-chat-empty-state" v-else-if="!messages.length"><div class="admin-ai-empty-mark"><app-icon name="smart_toy"></app-icon></div><p class="admin-ai-empty-brand ai-chat-empty-brand">{{ rolePresentation.assistantName }}</p><strong class="admin-ai-empty-greeting">{{ rolePresentation.emptyGreeting }}</strong><p class="admin-ai-empty-copy">{{ rolePresentation.emptyCopy }}</p><div class="admin-ai-suggestions ai-chat-shortcuts" aria-label="快捷问题"><button type="button" v-for="suggestion in suggestions" :key="suggestion" :disabled="sending" @click="send(suggestion)"><span>{{ suggestion }}</span><app-icon name="arrow_upward"></app-icon></button></div></div>
          <template v-else><article v-for="message in visibleMessages" :key="message.id" class="admin-ai-message ai-chat-message" :class="[message.role, { error: message.error }]">
            <div class="admin-ai-avatar ai-chat-avatar" v-if="message.role !== 'user'"><app-icon name="smart_toy"></app-icon></div><div class="admin-ai-bubble"><div v-if="message.role !== 'user'" class="admin-ai-message-meta ai-chat-message-meta"><span class="admin-ai-message-author"><strong>{{ rolePresentation.assistantName }}</strong></span><span class="admin-ai-source ai-chat-source" :class="message.degraded ? 'warning' : 'success'">{{ message.source || '智能助手' }}</span><span v-if="message.intentLabel" class="admin-ai-intent ai-chat-intent">{{ message.intentLabel }}</span></div><div v-else class="ai-chat-user-bubble">{{ message.content }}</div><p v-if="message.role !== 'user'" class="ai-chat-answer">{{ message.content }}</p><div v-if="message.facts?.length" class="ai-chat-facts" :aria-label="rolePresentation.factsTitle"><div v-for="fact in message.facts" :key="fact.label" class="ai-chat-fact"><small>{{ fact.label }}</small><strong>{{ fact.value }}</strong></div></div><div v-if="message.recommendations?.length" class="ai-chat-recommendations"><strong>{{ rolePresentation.recommendationsTitle }}</strong><ul><li v-for="item in message.recommendations" :key="item">{{ item }}</li></ul></div><div v-if="message.attachments?.length" class="admin-ai-message-attachments"><figure v-for="attachment in message.attachments" :key="attachment.id"><img :src="attachment.url" :alt="attachment.name"><figcaption>{{ attachment.name }}</figcaption></figure></div>
              <div v-if="message.actionProposal" class="admin-ai-action-card ai-chat-action-card"><div class="admin-ai-action-heading"><app-icon name="bolt"></app-icon><strong>{{ rolePresentation.actionTitle }}</strong><span>{{ message.actionProposal.status === 'SUCCEEDED' ? '已完成' : message.actionProposal.status === 'CANCELED' ? '已取消' : '待确认' }}</span></div><p>{{ message.actionProposal.summary }}</p><small>仅执行已展示的内容；确认后会再次校验权限和当前数据。</small><div class="admin-ai-action-buttons" v-if="message.actionProposal.status === 'AWAITING_CONFIRMATION'"><button type="button" class="g-btn primary compact" :disabled="isActionBusy()" @click="confirmAction(message.actionProposal)">{{ isActionRunning(message.actionProposal.actionId) ? '执行中…' : '确认执行' }}</button><button type="button" class="g-btn secondary compact" :disabled="isActionBusy()" @click="cancelAction(message.actionProposal)">取消</button></div></div><button v-if="message.evidence?.length || message.traceId" type="button" class="ai-chat-details-button" :aria-expanded="message.detailsOpen ? 'true' : 'false'" @click="toggleDetails(message)"><app-icon :name="message.detailsOpen ? 'expand_less' : 'fact_check'"></app-icon>{{ message.detailsOpen ? rolePresentation.detailsCollapseLabel : rolePresentation.detailsLabel }}</button><div v-if="message.detailsOpen" class="ai-chat-details"><div class="ai-chat-detail-grid"><span v-if="message.roleLabel"><small>回答身份</small><strong>{{ message.roleLabel }}</strong></span><span v-if="message.scopeLabel"><small>数据范围</small><strong>{{ message.scopeLabel }}</strong></span><span v-if="message.intentLabel"><small>意图</small><strong>{{ message.intentLabel }}</strong></span><span v-if="message.traceId"><small>记录编号</small><code>{{ message.traceId }}</code></span></div><ul v-if="message.evidence?.length" class="ai-chat-evidence"><li v-for="item in message.evidence" :key="item.id"><span>{{ item.type === 'knowledge' ? '知识' : item.type === 'tool' ? '工具' : '版本' }}</span><b>{{ item.label }}</b><small>{{ item.scope }} · {{ item.provenance }}<template v-if="item.durationMs"> · {{ item.durationMs }} 毫秒</template></small></li></ul></div><small class="ai-chat-message-time">{{ message.source ? message.source + ' · ' : '' }}{{ message.time }}</small>
            </div></article><article class="admin-ai-message ai-chat-message assistant" v-if="sending"><div class="admin-ai-avatar ai-chat-avatar"><app-icon name="smart_toy"></app-icon></div><div class="admin-ai-bubble admin-ai-typing"><span class="admin-ai-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>{{ rolePresentation.typingLabel }}</span></div></article></template>
        </div>
        <footer class="admin-ai-compose-area"><div v-if="attachments.length" class="admin-ai-attachment-strip" aria-label="待发送图片"><div v-for="attachment in attachments" :key="attachment.id" class="admin-ai-attachment-preview"><img :src="attachment.url" :alt="attachment.name"><div><strong>{{ attachment.name }}</strong><small>{{ formatAttachmentSize(attachment.size) }}</small></div><button type="button" class="g-btn icon-only compact" :aria-label="'移除 ' + attachment.name" @click="removeAttachment(attachment.id)"><app-icon name="close"></app-icon></button></div></div><label class="admin-ai-compose-context"><app-icon name="agriculture"></app-icon><span>关联地块</span><select class="g-select" v-model="selectedPlotId" aria-label="当前地块"><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name || plot.plotId }}</option></select></label><div class="admin-ai-composer"><textarea v-model="input" rows="2" maxlength="1000" aria-label="向 AI 助手提问" :placeholder="rolePresentation.inputPlaceholder" @keydown="handleKeydown"></textarea><div class="admin-ai-compose-tools"><input ref="imageInput" class="admin-ai-image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="选择图片" @change="onImageSelected"><button class="g-btn icon-only compact admin-ai-attach" type="button" aria-label="上传图片" title="上传图片" :disabled="sending || attachments.length >= 4" @click="imageInput?.click()"><app-icon name="attach_file"></app-icon></button><button v-if="attachments.length" class="g-btn secondary compact admin-ai-analyze-photo" type="button" :disabled="sending" @click="analyzePhoto"><app-icon name="image_search"></app-icon><span>分析照片</span></button></div><button class="admin-ai-send" type="button" :disabled="sending || (!input.trim() && !attachments.length)" :aria-label="sending ? '正在回答' : '发送消息'" @click="send()"><app-icon :name="sending ? 'hourglass_empty' : 'arrow_upward'"></app-icon></button></div>        <p class="admin-ai-chat-footnote">{{ rolePresentation.composerFootnote }}</p></footer>
      </div>
      <div v-if="lightConfirm" class="admin-ai-confirm-overlay" @click.self="closeConfirm">
        <div class="admin-ai-confirm-dialog">
          <p class="admin-ai-confirm-title">
            <template v-if="lightConfirm.type === 'bulk-archive'">归档所选 {{ lightConfirm.ids.length }} 个历史对话？</template>
            <template v-else-if="lightConfirm.type === 'bulk-unarchive'">取消归档所选 {{ lightConfirm.ids.length }} 个历史对话？</template>
            <template v-else-if="lightConfirm.type === 'bulk-delete'">删除所选 {{ lightConfirm.ids.length }} 个已归档对话？</template>
            <template v-else-if="lightConfirm.type === 'archive'">归档「{{ lightConfirm.conversation.title || '该历史对话' }}」？</template>
            <template v-else-if="lightConfirm.type === 'unarchive'">取消归档「{{ lightConfirm.conversation.title || '该历史对话' }}」？</template>
            <template v-else>删除「{{ lightConfirm.conversation.title || '该历史对话' }}」？</template>
          </p>
          <p class="admin-ai-confirm-sub">{{ lightConfirm.type === 'delete' || lightConfirm.type === 'bulk-delete' ? '删除后对话及其中所有消息将无法恢复。' : lightConfirm.type === 'unarchive' || lightConfirm.type === 'bulk-unarchive' ? '取消归档后对话将重新出现在历史列表。' : '归档后可在「已归档」中查看，不会出现在历史列表。' }}</p>
          <div class="admin-ai-confirm-actions">
            <button class="g-btn" type="button" @click="closeConfirm">取消</button>
            <button v-if="lightConfirm.type === 'delete' || lightConfirm.type === 'bulk-delete'" class="g-btn danger" type="button" :disabled="sending" @click="confirmDeleteConversation">删除</button>
            <button v-else-if="lightConfirm.type === 'unarchive' || lightConfirm.type === 'bulk-unarchive'" class="g-btn" type="button" :disabled="sending" @click="confirmDeleteConversation">取消归档</button>
            <button v-else class="g-btn" type="button" :disabled="sending" @click="confirmDeleteConversation">归档</button>
          </div>
        </div>
      </div>
        <div v-if="menuFor" class="admin-ai-menu-backdrop" @click="closeMenu"></div>
      <teleport to="body">
        <div v-if="menuFor" class="admin-ai-conversation-menu-pop admin-ai-menu-fixed" :style="{ left: menuPos.left + 'px', top: menuPos.top + 'px' }" @click.stop>
          <template v-for="conversation in [...visibleArchivedConversations, ...orderedConversations]" :key="conversation.conversationId">
            <template v-if="conversation.conversationId === menuFor">
              <template v-if="archivedView">
                <button type="button" @click="requestUnarchiveConversation(conversation)"><app-icon name="inbox"></app-icon>取消归档</button>
                <button type="button" class="danger" @click="requestDeleteConversation(conversation)"><app-icon name="delete"></app-icon>删除</button>
              </template>
              <template v-else>
                  <button type="button" @click="startRename(conversation)"><app-icon name="edit"></app-icon>重命名</button>
                  <button type="button" @click="togglePin(conversation)"><app-icon name="push_pin"></app-icon>{{ isPinned(conversation.conversationId) ? '取消置顶' : '置顶' }}</button>
                  <button type="button" @click="requestArchiveConversation(conversation)"><app-icon name="inbox"></app-icon>归档</button>
                  <button type="button" class="danger" @click="requestDeleteConversation(conversation)"><app-icon name="delete"></app-icon>删除</button>
                </template>
            </template>
          </template>
        </div>
      </teleport>
    </section>
  `
};



