import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};
globalThis.Vue = { ref: value => ({ value }), computed: getter => ({ get value() { return getter(); } }), inject: () => () => {}, watch: () => {}, onMounted: () => {}, onBeforeUnmount: () => {}, nextTick: async () => {} };

const { api } = await import('../js/api.js?assistant-history-test');
const { AdminAiChatView } = await import('../js/modules/admin-ai-chat.js?assistant-history-test');
const { legacyAdminTabTarget } = await import('../js/admin-state.js?assistant-history-test');

test('管理员旧聊天地址跳转到独立 AI 助手并保留上下文', () => {
  assert.deepEqual(legacyAdminTabTarget('decision-console', 'chat', 'farm-demo', { plotId: 'plot-a01' }), { view: 'ai-assistant', params: { farmId: 'farm-demo', plotId: 'plot-a01' } });
});

test('演示 Agent 会话按账号持久化、排序并恢复最近消息', async () => {
  api.sessionMode = 'demo';
  api.user = { userId: 'user-history-a', username: '管理员甲', role: 'FARM_ADMIN' };
  const conversationId = 'conversation-history-a';
  api.persistDemoAgentTurn({ conversationId, plotId: 'plot-a01', userMessage: '分析温室一', assistantResponse: { traceId: 'run-history-a', narrative: '已根据当前平台事实完成分析。', confidence: .9 } });
  const conversations = await api.getAgentConversations(20);
  assert.equal(conversations[0].conversationId, conversationId);
  assert.equal(conversations[0].title, '分析温室一');
  const history = await api.getAgentHistory(conversationId, 60);
  assert.equal(history.messages.length, 2);
  assert.equal(history.messages[0].role, 'USER');
  assert.equal(history.messages[1].role, 'ASSISTANT');
  api.user = { userId: 'user-history-b', username: '管理员乙', role: 'FARM_ADMIN' };
  assert.deepEqual(await api.getAgentConversations(20), []);
});

test('AI 助手页面提供普通对话、历史栏折叠/拖拽和图片入口', () => {
  const source = readFileSync(new URL('../js/modules/admin-ai-chat.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/modules/admin-ai-chat.css', import.meta.url), 'utf8');
  assert.match(source, /getAgentConversations/);
  assert.match(source, /persistDemoAgentTurn/);
  assert.match(source, /历史对话/);
  assert.match(source, /toggleSidebar/);
  assert.match(source, /startSidebarResize/);
  assert.match(source, /上传图片/);
  assert.match(source, /分析照片/);
  assert.doesNotMatch(source, /admin-ai-layered-answer/);
  assert.match(source, /cleanAssistantText/);
  assert.match(css, /\.admin-ai-conversation-sidebar/);
  assert.match(css, /grid-template-columns:\s*var\(--ai-sidebar-width, 240px\) 8px minmax\(0, 1fr\)/);
  assert.match(css, /\.admin-ai-sidebar-resizer/);
  assert.match(source, /name:\s*'AdminAiChatView'/);
  assert.match(source, /当前地块/);
  assert.equal((source.match(/<button[^>]+@click="startNewConversation\(\)"/g) || []).length, 1);
  assert.match(source, /当前地块[\s\S]*admin-ai-new-chat/);
  assert.match(source, /clampSidebarWidth/);
  assert.match(css, /\.admin-ai-chat\.is-sidebar-collapsed\s*\{[\s\S]*--ai-content-max:\s*100%/);
  assert.match(css, /\.admin-ai-chat\.is-sidebar-collapsed\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.admin-ai-chat\.is-sidebar-collapsed \.admin-ai-conversation-sidebar\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /\.admin-ai-chat\.is-sidebar-collapsed \.admin-ai-sidebar-resizer\s*\{\s*display:\s*none/);
  assert.match(css, /\.admin-ai-control-label\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /keep-alive include="AdminAiChatView"/);
});

test('演示 Agent 创建地块在确认后写入同一地块事实集合', async () => {
  api.sessionMode = 'demo';
  api.user = { userId: 'user-plot-create', username: '管理员', role: 'FARM_ADMIN', farmIds: ['farm-demo'], plotIds: ['*'] };
  const response = await api.agentChat('新建地块：AI验收温室，种植黄瓜，面积 88㎡', 'plot-a01');
  assert.equal(response.actionProposal.toolName, 'create_plot');
  const result = await api.confirmAgentAction(response.actionProposal.actionId);
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.result.name, 'AI验收温室');
  assert.equal((await api.getPlots({ farmId: 'farm-demo', includeInactive: true })).some(plot => plot.plotId === result.result.plotId), true);
});
