import { api } from '../api.js';
import { agentResponseSource, agentResponseText, normalizeAgentEvidence } from '../live-data.js?v=20260830-agent-assistant-v1';

const { ref, computed, inject, onMounted, nextTick, watch } = Vue;

function messageTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function normalizedRole(value) {
  return String(value || '').trim().toUpperCase() === 'USER' ? 'user' : 'assistant';
}

function textValue(value) { return value === undefined || value === null ? '' : String(value).trim(); }

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
  addFact(facts, '置信度', typeof response.confidence === 'number' ? `${Math.round(response.confidence * 100)}%` : response.confidence);
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
  const content = textValue(item.content || item.message || item.summary || agentResponseText(response, ''));
  const isError = Boolean(item.error);
  return {
    id: item.messageId || item.traceId || `history-${Math.random().toString(36).slice(2)}`,
    role, content, time: messageTime(item.createdAt || item.timestamp),
    source: role === 'assistant' ? (item.sourceLabel || agentResponseSource(response, sessionMode)) : '',
    actionProposal: item.actionProposal || response.actionProposal || null,
    facts: role === 'assistant' && !isError ? deriveFacts(response) : [],
    inference: role === 'assistant' && !isError ? content : '',
    recommendations: role === 'assistant' && !isError ? deriveRecommendations(response) : [],
    evidence: role === 'assistant' && !isError ? normalizeAgentEvidence(response) : [],
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
    const actionBusy = ref('');
    const isActionBusy = () => Boolean(actionBusy.value);
    const isActionRunning = actionId => actionBusy.value === actionId;
    const selectedPlotName = computed(() => props.state.plots?.find(item => item.plotId === selectedPlotId.value)?.name || '全农场');
    const suggestions = computed(() => {
      const name = selectedPlotName.value === '全农场' ? '当前农场' : selectedPlotName.value;
      return [`总结${name}现在最需要处理的问题`, `分析${name}的告警可信度`, `今天${name}应该给农户安排哪些任务`, '按紧急程度列出今天的农务建议'];
    });

    watch(() => props.state.plots?.map(plot => plot.plotId).join('|'), () => { if (!selectedPlotId.value && props.state.plots?.[0]?.plotId) selectedPlotId.value = props.state.plots[0].plotId; });
    watch(() => props.routeParams?.plotId || props.routeParams?.targetPlot, value => { if (value) selectedPlotId.value = value; });

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
        messages.value = (history?.messages || []).map(item => normalizeAgentMessage(item, props.state.sessionMode)).filter(item => item.content);
        if (updateHash) updateRoute(conversationId.value);
      } catch (error) {
        messages.value = [];
        toast(error.message || '历史对话加载失败', 'error');
      } finally { loadingHistory.value = false; scrollToBottom(); }
    };

    const startNewConversation = ({ updateHash: shouldUpdateHash = true } = {}) => {
      conversationId.value = createConversationId();
      selectedConversationId.value = '';
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
      if (!text || sending.value) return;
      if (!selectedPlotId.value) return toast('请先选择一块地', 'error');
      if (!conversationId.value) conversationId.value = createConversationId();
      selectedConversationId.value = conversationId.value;
      input.value = '';
      messages.value.push({ id: `user-${Date.now()}`, role: 'user', content: text, time: messageTime(), source: '', facts: [], recommendations: [] });
      sending.value = true;
      scrollToBottom();
      try {
        const response = await api.agentChat(text, selectedPlotId.value, conversationId.value);
        conversationId.value = response?.conversationId || conversationId.value;
        selectedConversationId.value = conversationId.value;
        const assistant = normalizeAgentMessage({ ...response, role: 'ASSISTANT', content: agentResponseText(response, '暂时没有生成有效回答，请换一种问法。') }, props.state.sessionMode);
        messages.value.push(assistant);
        if (props.state.sessionMode !== 'live') api.persistDemoAgentTurn({ conversationId: conversationId.value, plotId: selectedPlotId.value, userMessage: text, assistantResponse: response });
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
        emit('data-invalidated', { domains: result?.affectedDomains || proposal.affectedDomains || ['plots', 'devices', 'workOrders', 'alerts', 'overview'], record: result });
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
    onMounted(loadConversations);

    return { input, selectedPlotId, conversationId, selectedConversationId, conversations, messages, loadingHistory, loadingConversations, sending, actionBusy, isActionBusy, isActionRunning, messageList, suggestions, selectedPlotName, conversationTime, send, startNewConversation, selectConversation, handleKeydown, confirmAction, cancelAction };
  },
  template: `
    <section class="admin-ai-chat" aria-label="AI助手">
      <aside class="admin-ai-conversation-sidebar" aria-label="历史对话">
        <div class="admin-ai-sidebar-heading"><div><span class="admin-ai-sidebar-kicker">AgriLoop</span><strong>历史对话</strong></div><button class="g-btn primary compact" type="button" :disabled="sending" @click="startNewConversation()"><app-icon name="add"></app-icon><span>新对话</span></button></div>
        <div class="admin-ai-conversation-list" aria-live="polite">
          <div v-if="loadingConversations" class="admin-ai-sidebar-state"><app-icon name="hourglass_empty"></app-icon><span>正在读取…</span></div>
          <div v-else-if="!conversations.length" class="admin-ai-sidebar-state"><app-icon name="chat_bubble_outline"></app-icon><span>发送第一条消息后会保存到这里</span></div>
          <button v-for="conversation in conversations" :key="conversation.conversationId" type="button" class="admin-ai-conversation-item" :class="{ active: selectedConversationId === conversation.conversationId }" @click="selectConversation(conversation.conversationId)"><span class="admin-ai-conversation-title">{{ conversation.title || '农事对话' }}</span><span class="admin-ai-conversation-meta"><span>{{ conversation.plotId || '全农场' }}</span><span>{{ conversationTime(conversation.updatedAt || conversation.lastMessageAt) }}</span></span></button>
        </div>
      </aside>
      <div class="admin-ai-chat-main">
        <div class="admin-ai-chat-toolbar"><div class="admin-ai-chat-session"><span class="admin-ai-online-dot" aria-hidden="true"></span><strong>AI 助手已就绪</strong><span aria-hidden="true">·</span><span>{{ selectedPlotName }}</span></div><label class="admin-ai-plot-picker"><app-icon name="location_on"></app-icon><span class="admin-ai-control-label">咨询地块</span><select class="g-select" v-model="selectedPlotId"><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name || plot.plotId }}</option></select></label></div>
        <div class="admin-ai-message-list" :class="{ 'is-empty': !messages.length && !loadingHistory }" ref="messageList" aria-live="polite">
          <div class="admin-ai-history-loading" v-if="loadingHistory"><app-icon name="hourglass_empty"></app-icon><span>正在读取对话记录…</span></div>
          <div class="admin-ai-empty-state" v-else-if="!messages.length"><div class="admin-ai-empty-mark"><app-icon name="smart_toy"></app-icon></div><p class="admin-ai-empty-brand">AgriLoop AI</p><strong class="admin-ai-empty-greeting">今天想先处理什么？</strong><p class="admin-ai-empty-copy">我会结合 {{ selectedPlotName }} 的遥测、告警和农务记录回答，并明确区分事实、推断与建议。</p><div class="admin-ai-suggestions" aria-label="快捷问题"><button type="button" v-for="suggestion in suggestions" :key="suggestion" :disabled="sending" @click="send(suggestion)"><span>{{ suggestion }}</span><app-icon name="arrow_upward"></app-icon></button></div></div>
          <template v-else><article v-for="message in messages" :key="message.id" class="admin-ai-message" :class="[message.role, { error: message.error }]">
            <div class="admin-ai-avatar" v-if="message.role !== 'user'"><app-icon name="smart_toy"></app-icon></div><div class="admin-ai-bubble"><span class="admin-ai-message-author">{{ message.role === 'user' ? '我' : 'AgriLoop AI' }}</span><p>{{ message.content }}</p>
              <div v-if="message.role === 'assistant' && !message.error" class="admin-ai-layered-answer"><div v-if="message.facts?.length" class="admin-ai-layer admin-ai-facts"><strong>已知事实</strong><ul><li v-for="fact in message.facts" :key="fact.label"><span>{{ fact.label }}</span><b>{{ fact.value }}</b></li></ul></div><div class="admin-ai-layer admin-ai-inference"><strong>分析判断</strong><p>{{ message.inference }}</p><small v-if="message.degraded">当前为规则降级回答，指标仍以平台数据为准。</small></div><div class="admin-ai-layer admin-ai-recommendations"><strong>执行建议</strong><ul v-if="message.recommendations?.length"><li v-for="item in message.recommendations" :key="item">{{ item }}</li></ul><p v-else>当前没有可执行建议，请先补充数据或核对安全门。</p></div></div>
              <div v-if="message.actionProposal" class="admin-ai-action-card"><div class="admin-ai-action-heading"><app-icon name="bolt"></app-icon><strong>操作预览</strong><span>{{ message.actionProposal.status === 'SUCCEEDED' ? '已完成' : message.actionProposal.status === 'CANCELED' ? '已取消' : '待确认' }}</span></div><p>{{ message.actionProposal.summary }}</p><small>仅执行已展示的内容；确认后会再次校验权限和当前数据。</small><div class="admin-ai-action-buttons" v-if="message.actionProposal.status === 'AWAITING_CONFIRMATION'"><button type="button" class="g-btn primary compact" :disabled="isActionBusy()" @click="confirmAction(message.actionProposal)">{{ isActionRunning(message.actionProposal.actionId) ? '执行中…' : '确认执行' }}</button><button type="button" class="g-btn secondary compact" :disabled="isActionBusy()" @click="cancelAction(message.actionProposal)">取消</button></div></div><small>{{ message.source ? message.source + ' · ' : '' }}{{ message.time }}</small>
            </div></article><article class="admin-ai-message assistant" v-if="sending"><div class="admin-ai-avatar"><app-icon name="smart_toy"></app-icon></div><div class="admin-ai-bubble admin-ai-typing"><span class="admin-ai-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>正在分析地块数据和农务记录</span></div></article></template>
        </div>
        <footer class="admin-ai-compose-area"><div class="admin-ai-composer"><textarea v-model="input" rows="2" maxlength="1000" aria-label="向 AI 助手提问" placeholder="给 AI 助手发送消息" @keydown="handleKeydown"></textarea><button class="admin-ai-send" type="button" :disabled="sending || !input.trim()" :aria-label="sending ? '正在回答' : '发送消息'" @click="send()"><app-icon :name="sending ? 'hourglass_empty' : 'arrow_upward'"></app-icon></button></div><p class="admin-ai-chat-footnote">AI 只解释平台事实，不会编造指标；Enter 发送，Shift + Enter 换行。</p></footer>
      </div>
    </section>
  `
};
