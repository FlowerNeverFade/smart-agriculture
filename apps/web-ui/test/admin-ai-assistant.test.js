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
const { AdminAiChatView, plotFacilityIcon } = await import('../js/modules/admin-ai-chat.js?assistant-history-test');
const { ICON_CLASS } = await import('../js/modules/icon-map.js?assistant-icons-test');
const { ruleCodeValue } = await import('../js/modules/admin-rules-strategies.js?assistant-rule-display-test');
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
  const visionSource = readFileSync(new URL('../js/modules/image-vision.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/modules/admin-ai-chat.css', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(source, /getAgentConversations/);
  assert.match(source, /persistDemoAgentTurn/);
  assert.match(source, /历史对话/);
  assert.match(source, /toggleSidebar/);
  assert.match(source, /startSidebarResize/);
  assert.match(source, /上传图片/);
  assert.match(source, /分析照片/);
  assert.match(source, /analyzeImageFiles/);
  assert.match(source, /原文件字节直接送入视觉模型/);
  assert.match(source, /images:\s*visionPayloads/);
  assert.doesNotMatch(source, /绿色像素/);
  assert.match(visionSource, /readAsDataURL\(file\)/);
  assert.match(visionSource, /original:\s*true/);
  assert.doesNotMatch(visionSource, /canvas\.toBlob/);
  assert.doesNotMatch(visionSource, /MAX_IMAGE_EDGE/);
  assert.match(visionSource, /dataUrl/);
  assert.match(visionSource, /inspectImageQuality/);
  assert.doesNotMatch(index, /vendor\/ort\/ort\.all\.min\.js/);
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
  assert.match(index, /keep-alive include="AdminAiChatView"/);
  assert.match(shell, /plot_greenhouse:\s*'ph-barn'/);
  assert.match(shell, /plot_open_field:\s*'ph-rows'/);
  assert.match(shell, /arrow_upward:\s*'ph-arrow-up'/);
  assert.match(shell, /inbox:\s*'ph-tray'/);
});

test('首条消息保留乐观历史摘要，并按设施类型选择地块图标', () => {
  assert.match(readFileSync(new URL('../js/modules/admin-ai-chat.js', import.meta.url), 'utf8'), /upsertConversationSummary/);
  assert.equal(plotFacilityIcon({ facilityType: 'OPEN_FIELD' }), 'plot_open_field');
  assert.equal(plotFacilityIcon({ facilityType: 'GREENHOUSE' }), 'plot_greenhouse');
  assert.equal(plotFacilityIcon({ facilityType: 'SHADE_HOUSE' }), 'plot_shade_house');
  assert.equal(plotFacilityIcon({ facilityType: 'ORCHARD' }), 'plot_orchard');
  assert.equal(plotFacilityIcon({ facilityType: 'UNKNOWN' }), 'location_on');
  assert.equal(ICON_CLASS.plot_open_field, 'ph-rows');
  assert.equal(ICON_CLASS.plot_greenhouse, 'ph-barn');
  assert.equal(ICON_CLASS.plot_shade_house, 'ph-umbrella-simple');
  assert.equal(ICON_CLASS.plot_orchard, 'ph-tree');
  assert.equal(ICON_CLASS.arrow_upward, 'ph-arrow-up');
});

test('规则展示编号稳定区分同一底层规则，且不改写底层 code', () => {
  const source = readFileSync(new URL('../js/modules/admin-rules-strategies.js', import.meta.url), 'utf8');
  assert.match(source, /displayRules = computed/);
  assert.match(source, /displayKey:/);
  assert.match(source, /底层编号/);
  assert.equal(ruleCodeValue({ code: 'WATER_DEFICIT' }), 'WATER_DEFICIT');
  assert.equal(ruleCodeValue({ ruleId: 'HEAT_STRESS' }), 'HEAT_STRESS');
});

test('设备菜单支持安全编辑/删除，助手历史按地块过滤并在顶部批量操作', async () => {
  const deviceSource = readFileSync(new URL('../js/modules/admin-resource-center.js', import.meta.url), 'utf8');
  const deviceCss = readFileSync(new URL('../css/modules/admin-management.css', import.meta.url), 'utf8');
  const chatSource = readFileSync(new URL('../js/modules/admin-ai-chat.js', import.meta.url), 'utf8');
  const chatCss = readFileSync(new URL('../css/modules/admin-ai-chat.css', import.meta.url), 'utf8');
  const apiSource = readFileSync(new URL('../js/api.js', import.meta.url), 'utf8');
  assert.match(deviceSource, /toggleDeviceMenu/);
  assert.match(deviceSource, /openDeviceEdit/);
  assert.match(deviceSource, /confirmDeleteDevice/);
  assert.match(deviceSource, /deleteDeviceBlockers/);
  assert.match(deviceSource, /manager-plot-menu/);
  assert.match(deviceCss, /admin-device-card\.has-open-menu/);
  assert.match(apiSource, /async updateDevice\(deviceId/);
  assert.match(apiSource, /async deleteDevice\(deviceId/);
  assert.match(apiSource, /plotId = String\(normalized\.plotId/);
  assert.match(chatSource, /getAgentConversations\(20, \{ plotId: selectedPlotId\.value/);
  assert.match(chatSource, /visibleArchivedConversations/);
  assert.match(chatSource, /requestBulkUnarchive/);
  assert.match(chatSource, /admin-ai-bulk-bar admin-ai-bulk-bar-top/);
  assert.doesNotMatch(chatSource, /admin-ai-sidebar-collapse/);
  assert.match(chatCss, /admin-ai-sidebar-toggle[^}]*border:\s*0/);
  assert.match(chatCss, /admin-ai-bulk-bar-top/);
});

test('演示设备更新只修改允许字段，删除保留安全门并按名称确认', async () => {
  api.sessionMode = 'demo';
  api.user = { userId: 'device-admin', username: '设备管理员', role: 'FARM_ADMIN', farmIds: ['farm-demo'], plotIds: ['*'] };
  const id = `device-test-${Date.now().toString(36)}`;
  const created = await api.registerDevice({ farmId: 'farm-demo', deviceId: id, name: '待删除设备', type: 'FLOW_METER', sourceMode: 'SIMULATION' });
  const updated = await api.updateDevice(id, { name: '已修改设备', type: 'ENVIRONMENTAL_SENSOR' });
  assert.equal(updated.name, '已修改设备');
  assert.equal(updated.sourceMode, 'SIMULATION');
  await assert.rejects(() => api.deleteDevice(id, '待删除设备'), { code: 'DEVICE_CONFIRMATION_MISMATCH' });
  const deleted = await api.deleteDevice(id, '已修改设备');
  assert.equal(deleted.deleted, true);
  assert.equal((await api.getDevices({ farmId: 'farm-demo' })).some(device => device.deviceId === id), false);
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
