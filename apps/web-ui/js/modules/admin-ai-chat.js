import { api } from '../api.js';
import { agentResponseSource, agentResponseText } from '../live-data.js';

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
    source: role === 'assistant' ? (item.sourceLabel || item.source || '历史回答') : ''
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
  setup(props) {
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

    const welcome = () => ({
      id: `welcome-${Date.now()}`,
      role: 'assistant',
      content: '你好，我是农场管理员的 AI 对话助手。你可以直接询问地块异常、告警可信度、农务安排或灌溉建议；我会结合当前地块的遥测、告警和农务记录回答，但不会自动执行设备操作。',
      time: messageTime(),
      source: 'AgriLoop AI'
    });

    const loadHistory = async () => {
      loadingHistory.value = true;
      try {
        const history = await api.getAgentHistory('', 60);
        conversationId.value = history?.conversation?.conversationId || '';
        const loaded = (history?.messages || [])
          .map(normalizeHistoryMessage)
          .filter(item => item.content);
        messages.value = loaded.length ? loaded : [welcome()];
      } catch (error) {
        messages.value = [welcome()];
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
          source: agentResponseSource(response, props.state.sessionMode)
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

    const startNewConversation = () => {
      conversationId.value = '';
      messages.value = [welcome()];
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
      messageList,
      suggestions,
      selectedPlotName,
      send,
      startNewConversation,
      handleKeydown
    };
  },
  template: `
    <section class="admin-ai-chat" aria-label="AI 对话助手">
      <div class="admin-ai-chat-toolbar">
        <div class="admin-ai-chat-context">
          <span class="admin-ai-chat-context-item is-online"><app-icon name="check_circle"></app-icon><strong>AI 助手已就绪</strong></span>
          <span class="admin-ai-chat-context-item"><app-icon name="psychiatry"></app-icon><span>当前上下文：{{ selectedPlotName }}</span></span>
          <span class="admin-ai-chat-context-item"><app-icon name="policy"></app-icon><span>不会自动执行设备操作</span></span>
        </div>
        <div class="admin-ai-chat-tools">
          <label>
            <span>咨询地块</span>
            <select class="g-select" v-model="selectedPlotId">
              <option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name || plot.plotId }}</option>
            </select>
          </label>
          <button class="g-btn secondary" type="button" :disabled="sending" @click="startNewConversation">
            <app-icon name="add"></app-icon><span>新对话</span>
          </button>
        </div>
      </div>

      <div class="admin-ai-message-list" ref="messageList" aria-live="polite">
        <div class="admin-ai-history-loading" v-if="loadingHistory">
          <app-icon name="hourglass_empty"></app-icon><span>正在读取对话记录…</span>
        </div>
        <article v-for="message in messages" :key="message.id" class="admin-ai-message" :class="[message.role, { error: message.error }]">
          <div class="admin-ai-avatar">
            <app-icon :name="message.role === 'user' ? 'record_voice_over' : 'smart_toy'"></app-icon>
          </div>
          <div class="admin-ai-bubble">
            <span class="admin-ai-message-author">{{ message.role === 'user' ? '我' : 'AgriLoop AI' }}</span>
            <p>{{ message.content }}</p>
            <small>{{ message.source ? message.source + ' · ' : '' }}{{ message.time }}</small>
          </div>
        </article>
        <article class="admin-ai-message assistant" v-if="sending">
          <div class="admin-ai-avatar"><app-icon name="smart_toy"></app-icon></div>
          <div class="admin-ai-bubble admin-ai-typing">
            <app-icon name="hourglass_empty"></app-icon><span>正在分析地块数据和农务记录…</span>
          </div>
        </article>
      </div>

      <footer class="admin-ai-compose-area">
        <div class="admin-ai-suggestions" v-if="!loadingHistory && messages.length <= 3" aria-label="快捷问题">
          <span class="admin-ai-suggestions-label">你可以这样问</span>
          <button type="button" v-for="suggestion in suggestions" :key="suggestion" :disabled="sending" @click="send(suggestion)">{{ suggestion }}</button>
        </div>
        <div class="admin-ai-composer">
          <textarea v-model="input" rows="3" maxlength="1000" aria-label="向 AI 助手提问"
            placeholder="例如：A01 地块的缺水告警可信吗？应该安排谁去处理？"
            @keydown="handleKeydown"></textarea>
          <button class="g-btn primary" type="button" :disabled="sending || !input.trim()" @click="send()">
            <app-icon name="send"></app-icon><span>{{ sending ? '正在回答' : '发送' }}</span>
          </button>
        </div>
        <p class="admin-ai-chat-footnote">Enter 发送，Shift + Enter 换行。关键操作仍需遵守现场确认、权限和安全规则。</p>
      </footer>
    </section>
  `
};
