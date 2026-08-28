import { api } from '../api.js';
import { agentResponseSource, agentResponseText } from '../live-data.js?v=20260827-boot-fix-1';

const { ref, computed, inject, onMounted, nextTick, watch } = Vue;

function messageTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit'
  });
}

function normalizeHistoryMessage(item = {}) {
  const role = normalizedRole(item.role);
  return {
    id: item.messageId || item.traceId || `history-${Math.random().toString(36).slice(2)}`,
    role,
    content: item.content || item.message || item.summary || '',
    time: messageTime(item.createdAt || item.timestamp),
    source: role === 'assistant' ? (item.sourceLabel || item.source || '历史回答') : '',
    actionProposal: item.actionProposal || null
  };
}

function normalizedRole(value) {
  return String(value || '').trim().toUpperCase() === 'USER' ? 'user' : 'assistant';
}

export const AdminAiChatView = {
  props: {
    state: { type: Object, required: true },
    routeParams: { type: Object, default: () => ({}) }
  },
  emits: ['data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const input = ref('');
    const selectedPlotId = ref(
      props.routeParams?.targetPlot
        || props.routeParams?.plotId
        || props.state.plots?.[0]?.plotId
        || ''
    );
    const conversationId = ref('');
    const messages = ref([]);
    const loadingHistory = ref(false);
    const sending = ref(false);
    const messageList = ref(null);
    const actionBusy = ref('');
    // Keep the template independent from Vue's ref auto-unwrapping details.
    // The app ships the view as a runtime-compiled plain component object, and
    // binding a ref object directly to `disabled` makes both action buttons
    // permanently disabled in that path.  These closures always read the
    // current ref value and return primitive booleans/strings to the template.
    const isActionBusy = () => Boolean(actionBusy.value);
    const isActionRunning = actionId => actionBusy.value === actionId;

    const selectedPlotName = computed(() => props.state.plots
      ?.find(item => item.plotId === selectedPlotId.value)?.name || '全农场');
    const suggestions = computed(() => {
      const name = selectedPlotName.value === '全农场' ? '当前农场' : selectedPlotName.value;
      return [
        `总结${name}现在最需要处理的问题`,
        `分析${name}的告警可信度`,
        `今天${name}应该给农户安排哪些任务`,
        '按紧急程度列出今天的农务建议'
      ];
    });

    watch(() => props.state.plots?.map(plot => plot.plotId).join('|'), () => {
      if (!selectedPlotId.value && props.state.plots?.[0]?.plotId) {
        selectedPlotId.value = props.state.plots[0].plotId;
      }
    });

    watch(() => props.routeParams?.plotId || props.routeParams?.targetPlot, value => {
      if (value) selectedPlotId.value = value;
    });

    const scrollToBottom = async () => {
      await nextTick();
      if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight;
    };

    const loadHistory = async () => {
      loadingHistory.value = true;
      try {
        const history = await api.getAgentHistory('', 60);
        conversationId.value = history?.conversation?.conversationId || '';
        const loaded = (history?.messages || [])
          .map(normalizeHistoryMessage)
          .filter(item => item.content);
        messages.value = loaded;
      } catch (error) {
        messages.value = [];
        toast(error.message || '历史对话加载失败', 'error');
      } finally {
        loadingHistory.value = false;
        scrollToBottom();
      }
    };

    const send = async (preset = '') => {
      const text = String(preset || input.value).trim();
      if (!text || sending.value) return;
      if (!selectedPlotId.value) return toast('请先选择一块地', 'error');

      input.value = '';
      messages.value.push({
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        time: messageTime(),
        source: ''
      });
      sending.value = true;
      scrollToBottom();

      try {
        const response = await api.agentChat(text, selectedPlotId.value, conversationId.value);
        conversationId.value = response?.conversationId || conversationId.value;
        messages.value.push({
          id: response?.traceId || `assistant-${Date.now()}`,
          role: 'assistant',
          content: agentResponseText(response, '暂时没有生成有效回答，请换一种问法。'),
          time: messageTime(),
          source: agentResponseSource(response, props.state.sessionMode),
          actionProposal: response?.actionProposal || null
        });
      } catch (error) {
        messages.value.push({
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `这次没有成功回答：${error.message || '服务暂时不可用'}`,
          time: messageTime(),
          source: '系统提示',
          error: true
        });
      } finally {
        sending.value = false;
        scrollToBottom();
      }
    };

    const confirmAction = async proposal => {
      if (!proposal?.actionId || actionBusy.value) return;
      actionBusy.value = proposal.actionId;
      try {
        const result = await api.confirmAgentAction(proposal.actionId, { idempotencyKey: `ui-agent:${proposal.actionId}` });
        proposal.status = result?.status || 'SUCCEEDED';
        proposal.result = result?.result || result;
        messages.value.push({ id: `agent-result-${Date.now()}`, role: 'assistant', content: `已确认执行：${proposal.summary || '操作'}。${result?.status === 'SUCCEEDED' ? '操作已完成，相关页面正在同步。' : '操作未成功完成。'}`, time: messageTime(), source: 'Agent 执行结果' });
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

    const startNewConversation = () => {
      conversationId.value = '';
      messages.value = [];
      input.value = '';
      scrollToBottom();
    };

    const handleKeydown = event => {
      if (event.isComposing) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    };

    onMounted(loadHistory);

    return {
      input,
      selectedPlotId,
      conversationId,
      messages,
      loadingHistory,
      sending,
      actionBusy,
      isActionBusy,
      isActionRunning,
      messageList,
      suggestions,
      selectedPlotName,
      send,
      startNewConversation,
      handleKeydown,
      confirmAction, cancelAction
    };
  },
  template: `
    <section class="admin-ai-chat" aria-label="AI 对话助手">
      <div class="admin-ai-chat-toolbar">
        <div class="admin-ai-chat-session">
          <span class="admin-ai-online-dot" aria-hidden="true"></span>
          <strong>AI 助手已就绪</strong>
          <span aria-hidden="true">·</span>
          <span>{{ selectedPlotName }}</span>
        </div>
        <div class="admin-ai-chat-tools">
          <label class="admin-ai-plot-picker">
            <app-icon name="location_on"></app-icon>
            <span class="admin-ai-control-label">咨询地块</span>
            <select class="g-select" v-model="selectedPlotId">
              <option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name || plot.plotId }}</option>
            </select>
          </label>
          <button class="g-btn secondary admin-ai-new-chat" type="button" :disabled="sending" @click="startNewConversation">
            <app-icon name="add"></app-icon><span>新对话</span>
          </button>
        </div>
      </div>

      <div class="admin-ai-message-list" :class="{ 'is-empty': !messages.length && !loadingHistory }" ref="messageList" aria-live="polite">
        <div class="admin-ai-history-loading" v-if="loadingHistory">
          <app-icon name="hourglass_empty"></app-icon><span>正在读取对话记录…</span>
        </div>
        <div class="admin-ai-empty-state" v-else-if="!messages.length">
          <div class="admin-ai-empty-mark"><app-icon name="smart_toy"></app-icon></div>
          <p class="admin-ai-empty-brand">AgriLoop AI</p>
          <strong class="admin-ai-empty-greeting">今天想先处理什么？</strong>
          <p class="admin-ai-empty-copy">我会结合 {{ selectedPlotName }} 的遥测、告警和农务记录回答，并明确区分事实、推断与建议。</p>
          <div class="admin-ai-suggestions" aria-label="快捷问题">
            <button type="button" v-for="suggestion in suggestions" :key="suggestion" :disabled="sending" @click="send(suggestion)">
              <span>{{ suggestion }}</span><app-icon name="arrow_upward"></app-icon>
            </button>
          </div>
        </div>
        <template v-else>
          <article v-for="message in messages" :key="message.id" class="admin-ai-message" :class="[message.role, { error: message.error }]">
            <div class="admin-ai-avatar" v-if="message.role !== 'user'">
              <app-icon name="smart_toy"></app-icon>
            </div>
            <div class="admin-ai-bubble">
              <span class="admin-ai-message-author">{{ message.role === 'user' ? '我' : 'AgriLoop AI' }}</span>
              <p>{{ message.content }}</p>
              <div v-if="message.actionProposal" class="admin-ai-action-card">
                <div class="admin-ai-action-heading"><app-icon name="bolt"></app-icon><strong>操作预览</strong><span>{{ message.actionProposal.status === 'SUCCEEDED' ? '已完成' : message.actionProposal.status === 'CANCELED' ? '已取消' : '待确认' }}</span></div>
                <p>{{ message.actionProposal.summary }}</p>
                <small>仅执行已展示的内容；确认后会再次校验权限和当前数据。</small>
                <div class="admin-ai-action-buttons" v-if="message.actionProposal.status === 'AWAITING_CONFIRMATION'">
                  <button type="button" class="g-btn primary compact" :disabled="isActionBusy()" @click="confirmAction(message.actionProposal)">{{ isActionRunning(message.actionProposal.actionId) ? '执行中…' : '确认执行' }}</button>
                  <button type="button" class="g-btn secondary compact" :disabled="isActionBusy()" @click="cancelAction(message.actionProposal)">取消</button>
                </div>
              </div>
              <small>{{ message.source ? message.source + ' · ' : '' }}{{ message.time }}</small>
            </div>
          </article>
          <article class="admin-ai-message assistant" v-if="sending">
            <div class="admin-ai-avatar"><app-icon name="smart_toy"></app-icon></div>
            <div class="admin-ai-bubble admin-ai-typing">
              <span class="admin-ai-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
              <span>正在分析地块数据和农务记录</span>
            </div>
          </article>
        </template>
      </div>

      <footer class="admin-ai-compose-area">
        <div class="admin-ai-composer">
          <textarea v-model="input" rows="2" maxlength="1000" aria-label="向 AI 助手提问"
            placeholder="给 AI 助手发送消息"
            @keydown="handleKeydown"></textarea>
          <button class="admin-ai-send" type="button" :disabled="sending || !input.trim()" :aria-label="sending ? '正在回答' : '发送消息'" @click="send()">
            <app-icon :name="sending ? 'hourglass_empty' : 'arrow_upward'"></app-icon>
          </button>
        </div>
        <p class="admin-ai-chat-footnote">AI 可能会出错，请核对重要信息。Enter 发送，Shift + Enter 换行。</p>
      </footer>
    </section>
  `
};
