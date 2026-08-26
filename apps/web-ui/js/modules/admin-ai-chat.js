import { api } from '../api.js';
import { agentResponseSource, agentResponseText } from '../live-data.js';

const { ref, computed, inject, onMounted, nextTick } = Vue;

function messageTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function normalizeHistoryMessage(item = {}) {
  const role = String(item.role || '').toUpperCase() === 'USER' ? 'user' : 'assistant';
  return {
    id: item.messageId || `history-${Math.random().toString(36).slice(2)}`,
    role,
    content: item.content || item.message || '',
    time: messageTime(item.createdAt),
    source: role === 'assistant' ? '历史回答' : ''
  };
}

export const AdminAiChatView = {
  props: {
    state: { type: Object, required: true },
    routeParams: { type: Object, default: () => ({}) }
  },
  setup(props) {
    const toast = inject('toast');
    const input = ref('');
    const selectedPlotId = ref(props.routeParams?.targetPlot || props.routeParams?.plotId || props.state.plots?.[0]?.plotId || '');
    const conversationId = ref('');
    const messages = ref([]);
    const loadingHistory = ref(false);
    const sending = ref(false);
    const messageList = ref(null);
    const suggestions = computed(() => {
      const plot = props.state.plots?.find(item => item.plotId === selectedPlotId.value);
      const name = plot?.name || '当前地块';
      return [
        `总结${name}现在最需要处理的问题`,
        `今天${name}应该给农户安排哪些任务`,
        `分析${name}的告警是否可信`,
        '按紧急程度列出今天的农务建议'
      ];
    });
    const selectedPlotName = computed(() => props.state.plots?.find(item => item.plotId === selectedPlotId.value)?.name || '全农场');

    const scrollToBottom = async () => {
      await nextTick();
      if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight;
    };

    const welcome = () => ({
      id: 'welcome',
      role: 'assistant',
      content: '你好，我是农场管理员的 AI 助手。你可以直接问我地块异常、告警可信度、农务安排或浇水建议；我会结合当前选中的地块回答。',
      time: messageTime(),
      source: 'AI 助手'
    });

    const loadHistory = async () => {
      loadingHistory.value = true;
      try {
        const history = await api.getAgentHistory('', 60);
        conversationId.value = history?.conversation?.conversationId || '';
        const loaded = (history?.messages || []).map(normalizeHistoryMessage).filter(item => item.content);
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
      messages.value.push({ id: `user-${Date.now()}`, role: 'user', content: text, time: messageTime() });
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
        messages.value.push({ id: `error-${Date.now()}`, role: 'assistant', content: `这次没有成功回答：${error.message || '服务暂时不可用'}`, time: messageTime(), source: '系统提示', error: true });
      } finally {
        sending.value = false;
        scrollToBottom();
      }
    };

    const startNewConversation = () => {
      conversationId.value = `conversation-admin-${Date.now()}`;
      messages.value = [welcome()];
      input.value = '';
      scrollToBottom();
    };

    const handleKeydown = event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    };

    onMounted(loadHistory);
    return { input, selectedPlotId, conversationId, messages, loadingHistory, sending, messageList, suggestions, selectedPlotName, send, startNewConversation, handleKeydown };
  },
  template: `
    <section class="admin-ai-chat" aria-labelledby="admin-ai-chat-title">
      <header class="admin-ai-chat-header">
        <div><p>AI 农场助手</p><h2 id="admin-ai-chat-title">直接说出你想解决的问题</h2><span>结合地块数据、告警和农务记录给出易懂的建议，不会自动执行设备操作。</span></div>
        <div class="admin-ai-chat-tools"><label><span>咨询地块</span><select v-model="selectedPlotId"><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name || plot.plotId }}</option></select></label><button class="g-btn g-btn-outline" type="button" @click="startNewConversation">新对话</button></div>
      </header>

      <div class="admin-ai-chat-context"><span class="admin-ai-online-dot"></span><strong>AI 助手在线</strong><span>·</span><span>当前结合“{{ selectedPlotName }}”回答</span></div>

      <div class="admin-ai-message-list" ref="messageList" aria-live="polite">
        <div class="admin-ai-history-loading" v-if="loadingHistory">正在读取对话记录…</div>
        <article v-for="message in messages" :key="message.id" class="admin-ai-message" :class="[message.role, { error: message.error }]">
          <div class="admin-ai-avatar">{{ message.role === 'user' ? '我' : 'AI' }}</div>
          <div class="admin-ai-bubble"><p>{{ message.content }}</p><small>{{ message.source ? message.source + ' · ' : '' }}{{ message.time }}</small></div>
        </article>
        <article class="admin-ai-message assistant" v-if="sending"><div class="admin-ai-avatar">AI</div><div class="admin-ai-bubble admin-ai-typing"><i></i><i></i><i></i><span>正在分析地块数据…</span></div></article>
      </div>

      <div class="admin-ai-suggestions" v-if="messages.length <= 3"><button type="button" v-for="suggestion in suggestions" :key="suggestion" :disabled="sending" @click="send(suggestion)">{{ suggestion }}</button></div>

      <div class="admin-ai-composer"><textarea v-model="input" rows="2" maxlength="1000" placeholder="例如：A01 地块的缺水告警可信吗？应该安排谁去处理？" @keydown="handleKeydown"></textarea><button class="g-btn g-btn-primary" type="button" :disabled="sending || !input.trim()" @click="send()">{{ sending ? '正在回答' : '发送' }}</button></div>
      <p class="admin-ai-chat-footnote">Enter 发送，Shift + Enter 换行。关键操作请以现场确认和安全规则为准。</p>
    </section>
  `
};
