import { api } from '../api.js?v=20260830-ai-assistant-state-v2';
import { agentResponseSource, agentResponseText } from '../live-data.js?v=20260830-agent-assistant-v1';

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

function displayValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
  return textValue(value);
}

function addFact(facts, label, value, unit = '') {
  const shown = displayValue(value);
  if (!shown || shown === '—') return;
  facts.push({ label, value: `${shown}${unit}` });
}

/** Only projects values explicitly returned by the backend Agent contract. */
function deriveFacts(response = {}) {
  const facts = [];
  const result = response.result && typeof response.result === 'object' ? response.result : {};
  const latest = result.latest || result.latestTelemetry || result.telemetry || response.latest || {};
  const diagnosis = response.diagnosis && typeof response.diagnosis === 'object' ? response.diagnosis : {};
  const plan = response.plan && typeof response.plan === 'object' ? response.plan : {};
  addFact(facts, '土壤湿度', latest.soilMoisture ?? latest.soilMoisturePercent ?? latest.moisture, latest.soilMoistureUnit || '%');
  addFact(facts, '空气温度', latest.airTemperature ?? latest.temperature, latest.airTemperatureUnit || '°C');
  addFact(facts, '空气湿度', latest.airHumidity ?? latest.humidity, latest.airHumidityUnit || '%RH');
  addFact(facts, '风险等级', diagnosis.riskLevel ?? diagnosis.level ?? result.riskLevel ?? response.riskLevel);
  addFact(facts, '就绪状态', result.readinessStatus ?? plan.readinessStatus ?? response.readinessStatus);
  addFact(facts, '建议水量', result.waterLitre ?? result.waterLitres ?? plan.waterLitre ?? plan.waterLitres, ' L');
  addFact(facts, '执行时长', result.durationSeconds ?? plan.durationSeconds, ' 秒');
  const quality = response.quality || result.quality || response.dataQuality;
  if (typeof quality === 'string') addFact(facts, '数据质量', quality);
  const evidenceCount = Array.isArray(response.knowledgeEvidence) ? response.knowledgeEvidence.length : 0;
  if (evidenceCount) addFact(facts, '检索证据', evidenceCount, ' 条');
  (Array.isArray(response.tools) ? response.tools : []).forEach(tool => {
    const output = tool?.output && typeof tool.output === 'object' ? tool.output : {};
    addFact(facts, '工具结果', output.readinessStatus || output.status || output.executionStatus);
  });
  return facts.filter((fact, index, list) => list.findIndex(item => item.label === fact.label) === index).slice(0, 8);
}

function deriveRecommendations(response = {}) {
  const recommendations = [];
  const proposal = response.actionProposal;
  if (proposal?.summary) recommendations.push(`确认后执行：${textValue(proposal.summary)}`);
  const plan = response.plan && typeof response.plan === 'object' ? response.plan : {};
  [plan.nextStep, plan.recommendation, plan.advice, plan.action].forEach(value => { if (typeof value === 'string' && value.trim()) recommendations.push(value.trim()); });
  (Array.isArray(plan.alternatives) ? plan.alternatives : []).forEach(value => {
    const item = typeof value === 'string' ? value : value?.label || value?.summary;
    if (item) recommendations.push(String(item).trim());
  });
  (Array.isArray(response.warnings) ? response.warnings : []).filter(item => typeof item === 'string' && item.trim()).slice(0, 2).forEach(item => recommendations.push(`先处理：${item.trim()}`));
  return [...new Set(recommendations)].slice(0, 4);
}

function normalizeAgentMessage(item = {}, sessionMode = 'live') {
  const role = normalizedRole(item.role);
  const response = item.response && typeof item.response === 'object' ? item.response : item;
  const rawContent = textValue(item.content || item.message || item.summary || agentResponseText(response, ''));
  const content = role === 'assistant' ? cleanAssistantText(rawContent) : rawContent;
  const isError = Boolean(item.error);
  return {
    id: item.messageId || item.traceId || `history-${Math.random().toString(36).slice(2)}`,
    role, content, time: messageTime(item.createdAt || item.timestamp),
    source: role === 'assistant' ? (item.sourceLabel || agentResponseSource(response, sessionMode)) : '',
    attachments: Array.isArray(item.attachments) ? item.attachments : (Array.isArray(response.attachments) ? response.attachments : []),
    actionProposal: item.actionProposal || response.actionProposal || null,
    facts: role === 'assistant' && !isError ? deriveFacts(response) : [],
    inference: role === 'assistant' && !isError ? content : '',
    recommendations: role === 'assistant' && !isError ? deriveRecommendations(response) : [],
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
  props: { state: { type: Object, required: true }, routeParams: { type: Object, default: () => ({}) } },
  emits: ['data-invalidated', 'navigate'],
  setup(props, { emit }) {
    const toast = inject('toast');
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
    const selectedPlotName = computed(() => props.state.plots?.find(item => item.plotId === selectedPlotId.value)?.name || '全农场');
    const suggestions = computed(() => {
      const name = selectedPlotName.value === '全农场' ? '当前农场' : selectedPlotName.value;
      return [`总结${name}现在最需要处理的问题`, `分析${name}最近的告警`, `今天${name}应该给农户安排哪些任务`, '按紧急程度列出今天的农务建议'];
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
    const inspectPhoto = attachment => new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const sampleSize = 32;
          canvas.width = sampleSize;
          canvas.height = sampleSize;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(image, 0, 0, sampleSize, sampleSize);
          const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
          let brightness = 0;
          let greenDominant = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            const red = pixels[index]; const green = pixels[index + 1]; const blue = pixels[index + 2];
            brightness += (red * 299 + green * 587 + blue * 114) / 1000;
            if (green > red * 1.08 && green > blue * 1.05) greenDominant += 1;
          }
          const count = pixels.length / 4;
          resolve({ width: image.naturalWidth, height: image.naturalHeight, brightness: Math.round(brightness / count), greenShare: Math.round(greenDominant / count * 100) });
        } catch (error) { resolve({ width: image.naturalWidth, height: image.naturalHeight }); }
      };
      image.onerror = () => resolve({});
      image.src = attachment.url;
    });
    const analyzePhoto = async () => {
      if (!attachments.value.length || sending.value) return;
      if (!selectedPlotId.value) return toast('请先选择一块地', 'error');
      const count = attachments.value.length;
      const photoAttachments = attachments.value.map(({ file, ...item }) => ({ ...item }));
      messages.value.push({ id: `user-image-${Date.now()}`, role: 'user', content: `请分析我上传的${count}张现场照片`, attachments: photoAttachments, time: messageTime(), source: '' });
      const analyses = await Promise.all(attachments.value.map(inspectPhoto));
      const summary = analyses.map((item, index) => {
        const dimensions = item.width && item.height ? `${item.width}×${item.height}px` : '无法读取分辨率';
        const visual = item.brightness === undefined ? '未能读取像素' : `亮度约 ${item.brightness}/255，绿色像素约 ${item.greenShare}%`;
        return `${attachments.value[index].name}（${dimensions}，${visual}）`;
      }).join('；');
      const requestText = `我上传了${count}张现场照片，请结合当前地块的平台数据分析下一步。浏览器仅提取到以下客观图像特征：${summary}。不要根据这些特征虚构病害结论，如需现场信息请明确告诉我。`;
      sending.value = true;
      scrollToBottom();
      try {
        if (!conversationId.value) conversationId.value = createConversationId();
        selectedConversationId.value = conversationId.value;
        const response = await api.agentChat(requestText, selectedPlotId.value, conversationId.value);
        conversationId.value = response?.conversationId || conversationId.value;
        selectedConversationId.value = conversationId.value;
        const assistant = normalizeAgentMessage({ ...response, role: 'ASSISTANT', content: agentResponseText(response, '暂时没有生成有效回答，请补充照片位置、症状和拍摄时间。') }, props.state.sessionMode);
        messages.value.push(assistant);
        if (props.state.sessionMode !== 'live') api.persistDemoAgentTurn({ conversationId: conversationId.value, plotId: selectedPlotId.value, userMessage: `请分析我上传的${count}张现场照片`, assistantResponse: response });
        await refreshConversations();
        updateRoute(conversationId.value);
      } catch (error) {
        messages.value.push({ id: `image-error-${Date.now()}`, role: 'assistant', content: `已完成图片基础分析：${summary}。当前 Agent 暂时无法继续结合平台数据回答：${error.message || '服务暂时不可用'}。`, time: messageTime(), source: '图片分析提示', error: true });
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
      emit('navigate', 'ai-assistant', params);
    };

    const loadConversation = async (id, { updateHash = true } = {}) => {
      if (!id) return;
      loadingHistory.value = true;
      try {
        const history = await api.getAgentHistory(id, 60);
        conversationId.value = history?.conversation?.conversationId || id;
        selectedConversationId.value = conversationId.value;
        releaseMessageImages();
        messages.value = (history?.messages || []).map(item => normalizeAgentMessage(item, props.state.sessionMode)).filter(item => item.content);
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
      const requestText = text || '我上传了现场图片，请结合平台数据告诉我下一步该怎么检查。';
      messages.value.push({ id: `user-${Date.now()}`, role: 'user', content: text || '已上传现场图片', attachments: messageAttachments, time: messageTime(), source: '', facts: [], recommendations: [] });
      attachments.value = [];
      sending.value = true;
      scrollToBottom();
      try {
        const response = await api.agentChat(requestText, selectedPlotId.value, conversationId.value);
        conversationId.value = response?.conversationId || conversationId.value;
        selectedConversationId.value = conversationId.value;
        const assistant = normalizeAgentMessage({ ...response, role: 'ASSISTANT', content: agentResponseText(response, '暂时没有生成有效回答，请换一种问法。') }, props.state.sessionMode);
        messages.value.push(assistant);
        if (props.state.sessionMode !== 'live') api.persistDemoAgentTurn({ conversationId: conversationId.value, plotId: selectedPlotId.value, userMessage: text || '已上传现场图片', assistantResponse: response });
        await refreshConversations();
        updateRoute(conversationId.value);
      } catch (error) {
        messages.value.push({ id: `error-${Date.now()}`, role: 'assistant', content: `这次没有成功回答：${error.message || '服务暂时不可用'}`, time: messageTime(), source: '系统提示', error: true, facts: [], recommendations: [] });
      } finally { sending.value = false; scrollToBottom(); }
    };

    const selectConversation = id => loadConversation(id);
    const confirmAction = async proposal => {
      if (!proposal?.actionId || actionBusy.value) return;
      actionBusy.value = proposal.actionId;
      try {
        const result = await api.confirmAgentAction(proposal.actionId, { idempotencyKey: `ui-agent:${proposal.actionId}` });
        proposal.status = result?.status || 'SUCCEEDED'; proposal.result = result?.result || result;
        messages.value.push({ id: `agent-result-${Date.now()}`, role: 'assistant', content: `已确认执行：${proposal.summary || '操作'}。${result?.status === 'SUCCEEDED' ? '操作已完成，相关页面正在同步。' : '操作未成功完成。'}`, time: messageTime(), source: 'Agent 执行结果', facts: [], inference: '执行结果以平台返回状态为准。', recommendations: [] });
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

    return { input, selectedPlotId, conversationId, selectedConversationId, conversations, messages, loadingHistory, loadingConversations, sending, actionBusy, isActionBusy, isActionRunning, messageList, chatRoot, sidebarCollapsed, sidebarWidth, draggingSidebar, imageInput, attachments, suggestions, selectedPlotName, conversationTime, formatAttachmentSize, send, startNewConversation, selectConversation, handleKeydown, confirmAction, cancelAction, toggleSidebar, startSidebarResize, onImageSelected, removeAttachment, analyzePhoto };
  },
  template: `
    <section ref="chatRoot" class="admin-ai-chat" :class="{ 'is-sidebar-collapsed': sidebarCollapsed, 'is-sidebar-resizing': draggingSidebar }" :style="{ '--ai-sidebar-width': sidebarWidth + 'px' }" aria-label="AI助手">
      <aside class="admin-ai-conversation-sidebar" aria-label="历史对话">
        <div class="admin-ai-sidebar-heading"><div><span class="admin-ai-sidebar-kicker">AgriLoop</span><strong>历史对话</strong></div><div class="admin-ai-sidebar-heading-actions"><button class="g-btn primary compact" type="button" :disabled="sending" @click="startNewConversation()"><app-icon name="add"></app-icon><span>新对话</span></button><button class="g-btn icon-only compact admin-ai-sidebar-collapse" type="button" aria-label="隐藏历史对话" title="隐藏历史对话" @click="toggleSidebar"><app-icon name="chevron_left"></app-icon></button></div></div>
        <div class="admin-ai-conversation-list" aria-live="polite">
          <div v-if="loadingConversations" class="admin-ai-sidebar-state"><app-icon name="hourglass_empty"></app-icon><span>正在读取…</span></div>
          <div v-else-if="!conversations.length" class="admin-ai-sidebar-state"><app-icon name="chat_bubble_outline"></app-icon><span>发送第一条消息后会保存到这里</span></div>
          <button v-for="conversation in conversations" :key="conversation.conversationId" type="button" class="admin-ai-conversation-item" :class="{ active: selectedConversationId === conversation.conversationId }" @click="selectConversation(conversation.conversationId)"><span class="admin-ai-conversation-title">{{ conversation.title || '农事对话' }}</span><span class="admin-ai-conversation-meta"><span>{{ conversation.plotId || '全农场' }}</span><span>{{ conversationTime(conversation.updatedAt || conversation.lastMessageAt) }}</span></span></button>
        </div>
      </aside>
      <button v-if="!sidebarCollapsed" class="admin-ai-sidebar-resizer" type="button" aria-label="调整历史对话栏宽度" title="拖动调整历史对话栏宽度" @pointerdown="startSidebarResize"><span></span></button>
      <div class="admin-ai-chat-main">
        <div class="admin-ai-chat-toolbar"><div class="admin-ai-chat-session"><button class="g-btn icon-only compact admin-ai-sidebar-toggle" type="button" :aria-label="sidebarCollapsed ? '显示历史对话' : '隐藏历史对话'" :title="sidebarCollapsed ? '显示历史对话' : '隐藏历史对话'" @click="toggleSidebar"><app-icon :name="sidebarCollapsed ? 'chevron_right' : 'chevron_left'"></app-icon></button><span class="admin-ai-online-dot" aria-hidden="true"></span><strong>AI 助手已就绪</strong><span aria-hidden="true">·</span><span>{{ selectedPlotName }}</span></div><div class="admin-ai-chat-tools"><label class="admin-ai-plot-picker"><app-icon name="location_on"></app-icon><span class="admin-ai-control-label">当前地块</span><select class="g-select" v-model="selectedPlotId"><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name || plot.plotId }}</option></select></label><button class="g-btn secondary admin-ai-new-chat" type="button" :disabled="sending" @click="startNewConversation()"><app-icon name="add"></app-icon><span>新对话</span></button></div></div>
        <div class="admin-ai-message-list" :class="{ 'is-empty': !messages.length && !loadingHistory }" ref="messageList" aria-live="polite">
          <div class="admin-ai-history-loading" v-if="loadingHistory"><app-icon name="hourglass_empty"></app-icon><span>正在读取对话记录…</span></div>
          <div class="admin-ai-empty-state" v-else-if="!messages.length"><div class="admin-ai-empty-mark"><app-icon name="smart_toy"></app-icon></div><p class="admin-ai-empty-brand">AgriLoop AI</p><strong class="admin-ai-empty-greeting">今天想先处理什么？</strong><p class="admin-ai-empty-copy">我会结合 {{ selectedPlotName }} 的实时数据、告警和农务记录回答，先核对平台事实，再给出清晰的下一步建议。</p><div class="admin-ai-suggestions" aria-label="快捷问题"><button type="button" v-for="suggestion in suggestions" :key="suggestion" :disabled="sending" @click="send(suggestion)"><span>{{ suggestion }}</span><app-icon name="arrow_upward"></app-icon></button></div></div>
          <template v-else><article v-for="message in messages" :key="message.id" class="admin-ai-message" :class="[message.role, { error: message.error }]">
            <div class="admin-ai-avatar" v-if="message.role !== 'user'"><app-icon name="smart_toy"></app-icon></div><div class="admin-ai-bubble"><span class="admin-ai-message-author">{{ message.role === 'user' ? '我' : 'AgriLoop AI' }}</span><p>{{ message.content }}</p><div v-if="message.attachments?.length" class="admin-ai-message-attachments"><figure v-for="attachment in message.attachments" :key="attachment.id"><img :src="attachment.url" :alt="attachment.name"><figcaption>{{ attachment.name }}</figcaption></figure></div>
              <div v-if="message.actionProposal" class="admin-ai-action-card"><div class="admin-ai-action-heading"><app-icon name="bolt"></app-icon><strong>操作预览</strong><span>{{ message.actionProposal.status === 'SUCCEEDED' ? '已完成' : message.actionProposal.status === 'CANCELED' ? '已取消' : '待确认' }}</span></div><p>{{ message.actionProposal.summary }}</p><small>仅执行已展示的内容；确认后会再次校验权限和当前数据。</small><div class="admin-ai-action-buttons" v-if="message.actionProposal.status === 'AWAITING_CONFIRMATION'"><button type="button" class="g-btn primary compact" :disabled="isActionBusy()" @click="confirmAction(message.actionProposal)">{{ isActionRunning(message.actionProposal.actionId) ? '执行中…' : '确认执行' }}</button><button type="button" class="g-btn secondary compact" :disabled="isActionBusy()" @click="cancelAction(message.actionProposal)">取消</button></div></div><small>{{ message.source ? message.source + ' · ' : '' }}{{ message.time }}</small>
            </div></article><article class="admin-ai-message assistant" v-if="sending"><div class="admin-ai-avatar"><app-icon name="smart_toy"></app-icon></div><div class="admin-ai-bubble admin-ai-typing"><span class="admin-ai-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>正在分析地块数据和农务记录</span></div></article></template>
        </div>
        <footer class="admin-ai-compose-area"><div v-if="attachments.length" class="admin-ai-attachment-strip" aria-label="待发送图片"><div v-for="attachment in attachments" :key="attachment.id" class="admin-ai-attachment-preview"><img :src="attachment.url" :alt="attachment.name"><div><strong>{{ attachment.name }}</strong><small>{{ formatAttachmentSize(attachment.size) }}</small></div><button type="button" class="g-btn icon-only compact" :aria-label="'移除 ' + attachment.name" @click="removeAttachment(attachment.id)"><app-icon name="close"></app-icon></button></div></div><div class="admin-ai-composer"><textarea v-model="input" rows="2" maxlength="1000" aria-label="向 AI 助手提问" placeholder="给 AI 助手发送消息" @keydown="handleKeydown"></textarea><div class="admin-ai-compose-tools"><input ref="imageInput" class="admin-ai-image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="选择图片" @change="onImageSelected"><button class="g-btn icon-only compact admin-ai-attach" type="button" aria-label="上传图片" title="上传图片" :disabled="sending || attachments.length >= 4" @click="imageInput?.click()"><app-icon name="attach_file"></app-icon></button><button v-if="attachments.length" class="g-btn secondary compact admin-ai-analyze-photo" type="button" :disabled="sending" @click="analyzePhoto"><app-icon name="image_search"></app-icon><span>分析照片</span></button></div><button class="admin-ai-send" type="button" :disabled="sending || (!input.trim() && !attachments.length)" :aria-label="sending ? '正在回答' : '发送消息'" @click="send()"><app-icon :name="sending ? 'hourglass_empty' : 'arrow_upward'"></app-icon></button></div><p class="admin-ai-chat-footnote">可以上传 JPG、PNG 或 WebP 图片；图片仅保留在当前对话，现有 Agent 接口会继续基于平台数据回答。</p></footer>
      </div>
    </section>
  `
};
