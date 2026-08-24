/**
 * Role-first landing dashboard.
 *
 * The agriculture data and decision engine are shared. The landing page is a
 * projection of that data for the question each role needs to answer first.
 */

export const ROLE_META = Object.freeze({
  FARMER: {
    label: '种植农户', title: '我的农场',
    subtitle: '只看分配给你的地块，以及今天需要你确认的事情。',
    scope: '我的地块', primaryLabel: '去巡田', primaryAction: 'open-view', primaryView: 'work-orders',
    navTitle: '我的工作', nav: [
      { view: 'home', icon: '⌂', label: '我的农场', badge: '首页' },
      { view: 'work-orders', icon: '✓', label: '今天要做什么', badge: '任务' },
      { view: 'plot-telemetry', icon: '⌁', label: '地块状态', badge: '查看' },
      { view: 'decision-console', icon: '!', label: '处理建议', badge: '确认' }
    ]
  },
  FIELD_OPERATOR: {
    label: '田间操作员', title: '我的执行任务',
    subtitle: '先做最紧急的任务，完成后留下现场记录。',
    scope: '我的任务和负责地块', primaryLabel: '打开任务清单', primaryAction: 'open-view', primaryView: 'work-orders',
    navTitle: '执行工作', nav: [
      { view: 'home', icon: '⌂', label: '我的任务', badge: '首页' },
      { view: 'work-orders', icon: '✓', label: '任务清单', badge: '执行' },
      { view: 'plot-telemetry', icon: '⌁', label: '现场数据', badge: '查看' },
      { view: 'plot-detail', icon: '◈', label: '农田地图', badge: '地图' }
    ]
  },
  FARM_ADMIN: {
    label: '农场管理员', title: '农场运营驾驶舱',
    subtitle: '先处理高风险地块和待审批事项，再看全场趋势。',
    scope: '全场地块', primaryLabel: '处理待审批', primaryAction: 'open-view', primaryView: 'decision-console',
    navTitle: '农场运营', nav: [
      { view: 'home', icon: '⌂', label: '运营驾驶舱', badge: '首页' },
      { view: 'decision-console', icon: '!', label: '诊断与审批', badge: '决策' },
      { view: 'work-orders', icon: '✓', label: '任务安排', badge: '调度' },
      { view: 'plot-telemetry', icon: '⌁', label: '全场监测', badge: '数据' },
      { view: 'resource-coordination', icon: '◌', label: '水资源安排', badge: '资源' },
      { view: 'risk-forecast', icon: '↗', label: '风险趋势', badge: '预警' }
    ]
  },
  SYSTEM_ADMIN: {
    label: '系统管理员', title: '平台运行状态',
    subtitle: '确认数据、服务和演示环境都在正常工作。',
    scope: '平台级信息', primaryLabel: '检查平台状态', primaryAction: 'focus-health', primaryView: '',
    navTitle: '平台管理', nav: [
      { view: 'home', icon: '⌂', label: '平台状态', badge: '首页' },
      { view: 'scenario-replay', icon: '↺', label: '情景回放', badge: '验证' },
      { view: 'decision-passport', icon: '▣', label: '操作记录', badge: '审计' },
      { view: 'crop-packs', icon: '□', label: '规则版本', badge: '配置' },
      { view: 'plot-telemetry', icon: '⌁', label: '数据链路', badge: '查看' }
    ]
  }
});

const ROLE_ALIASES = { FARMER: 'FARMER', FARM_ADMIN: 'FARM_ADMIN', FIELD_OPERATOR: 'FIELD_OPERATOR', SYSTEM_ADMIN: 'SYSTEM_ADMIN', ADMIN: 'FARM_ADMIN', OPERATOR: 'FIELD_OPERATOR' };

export function normalizeRole(role) {
  const key = String(role || '').trim().toUpperCase();
  return ROLE_ALIASES[key] || 'FARMER';
}

export function roleMeta(role) {
  return ROLE_META[normalizeRole(role)] || ROLE_META.FARMER;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function cropIcon(plot) {
  return { tomato: '🍅', cucumber: '🥒', corn: '🌽', rice: '🌾', sunflower: '🌻', strawberry: '🍓', pepper: '🌶️' }[String(plot?.cropCode || '').toLowerCase()] || '🌱';
}

function metric(plot, code) { return plot?.metrics?.[code] || {}; }

function targetLow(target) {
  const match = String(target || '').match(/(-?\d+(?:\.\d+)?)\s*[~至-]/);
  return match ? Number(match[1]) : null;
}

export function isPlotAttentionNeeded(plot) {
  const moisture = Number(metric(plot, 'SOIL_MOISTURE').value);
  const low = targetLow(metric(plot, 'SOIL_MOISTURE').target);
  return ['HIGH', 'CRITICAL'].includes(String(plot?.riskLevel || '').toUpperCase())
    || (Number.isFinite(moisture) && Number.isFinite(low) && moisture < low);
}

function riskText(plot) {
  const risk = String(plot?.riskLevel || '').toUpperCase();
  if (risk === 'CRITICAL') return '紧急';
  if (risk === 'HIGH' || isPlotAttentionNeeded(plot)) return '需要关注';
  return '正常';
}

function riskClass(plot) { return riskText(plot) === '紧急' ? 'danger' : riskText(plot) === '需要关注' ? 'warn' : 'ok'; }

function formatDue(value) {
  if (!value) return '今天';
  const date = new Date(value); if (Number.isNaN(date.getTime())) return String(value);
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  if (minutes <= 0) return '已到时间';
  return minutes < 60 ? `${minutes} 分钟内` : `${Math.round(minutes / 60)} 小时内`;
}

function statusText(status) {
  return { OPEN: '待处理', ASSIGNED: '已分派', IN_PROGRESS: '进行中', DONE: '已完成', CANCELLED: '已取消', RUNNING: '运行中', STOPPED: '已停止' }[String(status || '').toUpperCase()] || '待查看';
}

function priorityText(priority) { return { HIGH: '优先处理', MEDIUM: '今天处理', LOW: '有空处理' }[String(priority || '').toUpperCase()] || '今天处理'; }

function actionButton(label, action, options = {}) {
  const attrs = Object.entries({ 'data-role-action': action, 'data-view': options.view, 'data-plot-id': options.plotId, 'data-work-order-id': options.workOrderId })
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`).join(' ');
  return `<button type="button" class="role-action role-action-${options.kind || 'secondary'}" ${attrs}>${escapeHtml(label)}</button>`;
}

function sectionHeader(title, hint = '') { return `<div class="role-section-header"><div><h2>${escapeHtml(title)}</h2>${hint ? `<p>${escapeHtml(hint)}</p>` : ''}</div></div>`; }

function kpiCard(item) {
  return `<article class="role-kpi-card role-kpi-${escapeHtml(item.tone || 'neutral')}"><span class="role-kpi-label">${escapeHtml(item.label)}</span><strong class="role-kpi-value">${escapeHtml(item.value)}</strong><span class="role-kpi-note">${escapeHtml(item.note || '')}</span></article>`;
}

function plotCard(plot, action = 'open-plot') {
  const moisture = metric(plot, 'SOIL_MOISTURE');
  const reading = moisture.value === undefined ? '—' : `${moisture.value}${moisture.unit || '%'}`;
  return `<article class="role-plot-card"><div class="role-plot-card-top"><span class="role-plot-icon">${cropIcon(plot)}</span><div class="role-plot-name"><strong>${escapeHtml(plot?.name || plot?.plotId || '未命名地块')}</strong><span>${escapeHtml(plot?.cropName || '作物')} · ${escapeHtml(plot?.stageLabel || '当前阶段')}</span></div><span class="role-status role-status-${riskClass(plot)}">${riskText(plot)}</span></div><div class="role-plot-reading"><span>土壤湿度</span><strong>${escapeHtml(reading)}</strong><span class="role-plot-device">${String(plot?.deviceStatus || '').toUpperCase() === 'ONLINE' ? '设备在线' : '设备待检查'}</span></div><div class="role-plot-card-bottom">${actionButton('查看地块', action, { view: 'plot-telemetry', plotId: plot?.plotId, kind: 'link' })}</div></article>`;
}

function priorityItem({ title, summary, hint, tone = 'warn', plotId, primaryLabel, primaryAction = 'open-view', primaryView = 'decision-console', secondaryLabel, secondaryAction, secondaryView }) {
  return `<article class="role-priority-item role-priority-${tone}"><span class="role-priority-mark">${tone === 'ok' ? '✓' : tone === 'danger' ? '!' : '•'}</span><div class="role-priority-copy"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(summary)}</p>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</div><div class="role-priority-actions">${actionButton(primaryLabel, primaryAction, { view: primaryView, plotId, kind: 'primary' })}${secondaryLabel ? actionButton(secondaryLabel, secondaryAction || 'open-view', { view: secondaryView || 'work-orders', plotId, kind: 'link' }) : ''}</div></article>`;
}

function emptyState(text, actionLabel, action, options = {}) { return `<div class="role-empty-state"><span>✓</span><p>${escapeHtml(text)}</p>${actionLabel ? actionButton(actionLabel, action, options) : ''}</div>`; }

function visibleOrders(workOrders, user, role, roleTaskStates = {}) {
  const orders = Array.isArray(workOrders) ? workOrders : [];
  const userId = String(user?.userId || '').toLowerCase(); const username = String(user?.username || '').toLowerCase();
  return orders.filter(order => {
    const state = roleTaskStates[order.workOrderId || order.workItemId] || order.status;
    if (role === 'FIELD_OPERATOR') {
      const assignee = String(order.assigneeId || '').toLowerCase();
      return assignee === userId || assignee === username || ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(String(state).toUpperCase());
    }
    if (role === 'FARMER') return !['DONE', 'CANCELLED'].includes(String(state).toUpperCase());
    return true;
  }).map(order => ({ ...order, status: roleTaskStates[order.workOrderId || order.workItemId] || order.status }));
}

function farmerDashboard({ plots, feedItems }) {
  const attention = plots.filter(isPlotAttentionNeeded);
  const prescriptions = (feedItems || []).filter(item => item.type === 'PRESCRIPTION' && plots.some(plot => plot.plotId === item.plotId));
  const priorities = [];
  if (attention[0]) {
    const plot = attention[0]; const moisture = metric(plot, 'SOIL_MOISTURE');
    priorities.push(priorityItem({ title: `${plot.name || '这块地'}需要先看一眼`, summary: `土壤湿度 ${moisture.value ?? '—'}${moisture.unit || '%' }，低于当前作物建议范围。`, hint: '先到地里确认，再决定是否补水。', tone: 'danger', plotId: plot.plotId, primaryLabel: '去巡田', primaryView: 'work-orders', secondaryLabel: '查看原因', secondaryView: 'decision-console' }));
  }
  if (prescriptions[0]) priorities.push(priorityItem({ title: '有一条补水建议等你确认', summary: '系统建议先补水，再观察湿度是否回到合适范围。', hint: '确认后会交给农场主管安排执行。', tone: 'warn', plotId: prescriptions[0].plotId, primaryLabel: '确认建议', primaryAction: 'confirm-suggestion', secondaryLabel: '先看看详情', secondaryView: 'decision-console' }));
  if (!priorities.length) priorities.push(priorityItem({ title: '今天的地块都在合适范围', summary: '暂时没有需要马上处理的异常。', hint: '按计划巡田即可。', tone: 'ok', primaryLabel: '查看地块', primaryView: 'plot-telemetry', plotId: plots[0]?.plotId }));
  return `<section class="role-dashboard-section">${sectionHeader('先处理这几件事', '系统只把需要你参与的事项放在这里')}<div class="role-priority-list">${priorities.slice(0, 3).join('')}</div></section><div class="role-dashboard-columns"><section class="role-dashboard-section">${sectionHeader('我的地块', '点开即可看湿度和设备状态')}<div class="role-plot-grid">${plots.slice(0, 6).map(plot => plotCard(plot)).join('') || emptyState('暂时没有分配给你的地块')}</div></section><section class="role-dashboard-section role-simple-guide">${sectionHeader('不知道下一步做什么？')}<div class="role-guide-card"><span class="role-guide-number">1</span><div><strong>先看现场</strong><p>到地块确认土壤和作物状态。</p></div></div><div class="role-guide-card"><span class="role-guide-number">2</span><div><strong>再确认建议</strong><p>不确定时，把现场情况记录下来。</p></div></div><div class="role-guide-card"><span class="role-guide-number">3</span><div><strong>需要帮助</strong><p>让农场主管看到你的记录。</p></div></div>${actionButton('打开农事清单', 'open-view', { view: 'work-orders', kind: 'primary' })}</section></div>`;
}

function operatorDashboard({ plots, workOrders, user, roleTaskStates }) {
  const orders = visibleOrders(workOrders, user, 'FIELD_OPERATOR', roleTaskStates).filter(order => !['DONE', 'CANCELLED'].includes(String(order.status).toUpperCase())).sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.priority] ?? 3) - ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[b.priority] ?? 3));
  const taskHtml = orders.slice(0, 5).map(order => { const plot = plots.find(item => item.plotId === order.plotId); const status = String(order.status || '').toUpperCase(); const action = status === 'IN_PROGRESS' ? 'complete-task' : 'start-task'; const label = status === 'IN_PROGRESS' ? '完成并记录' : '开始任务'; return `<article class="role-task-item"><div class="role-task-state role-task-${status.toLowerCase()}"><span>${statusText(status)}</span><small>${escapeHtml(priorityText(order.priority))}</small></div><div class="role-task-copy"><strong>${escapeHtml(order.title || '现场任务')}</strong><p>${escapeHtml(plot?.name || order.plotId || '指定地块')} · ${escapeHtml(order.reason || '按计划完成')}</p></div><div class="role-task-due">${escapeHtml(formatDue(order.dueAt))}</div><div class="role-task-actions">${actionButton(label, action, { workOrderId: order.workOrderId || order.workItemId, plotId: order.plotId, kind: 'primary' })}${actionButton('交接', 'handoff-task', { workOrderId: order.workOrderId || order.workItemId, plotId: order.plotId, kind: 'link' })}</div></article>`; }).join('');
  return `<section class="role-dashboard-section">${sectionHeader('现在要做什么', '按优先级排列，完成一项再做下一项')}<div class="role-task-list">${taskHtml || emptyState('暂时没有待执行任务，去看看现场数据吧', '查看现场数据', 'open-view', { view: 'plot-telemetry', plotId: plots[0]?.plotId })}</div></section><div class="role-dashboard-columns"><section class="role-dashboard-section">${sectionHeader('负责地块', '现场记录会自动带上地块名称')}<div class="role-plot-grid">${plots.slice(0, 6).map(plot => plotCard(plot, 'record-inspection')).join('') || emptyState('暂时没有负责地块')}</div></section><section class="role-dashboard-section role-simple-guide">${sectionHeader('现场记录要写什么？')}<div class="role-check-row"><span>✓</span><p>看土壤表面是否干燥</p></div><div class="role-check-row"><span>✓</span><p>看叶片、果实有没有异常</p></div><div class="role-check-row"><span>✓</span><p>设备异常要拍照并备注</p></div>${actionButton('录入巡田记录', 'record-inspection', { plotId: plots[0]?.plotId, kind: 'primary' })}</section></div>`;
}

function adminDashboard({ plots, workOrders, feedItems, resourceProfile }) {
  const attention = plots.filter(isPlotAttentionNeeded); const pendingOrders = visibleOrders(workOrders, null, 'FARM_ADMIN').filter(order => !['DONE', 'CANCELLED'].includes(String(order.status).toUpperCase())); const prescription = (feedItems || []).find(item => item.type === 'PRESCRIPTION'); const queue = [];
  if (attention[0]) { const plot = attention[0]; const moisture = metric(plot, 'SOIL_MOISTURE'); queue.push(priorityItem({ title: `${plot.name || '地块'}湿度偏低`, summary: `当前 ${moisture.value ?? '—'}${moisture.unit || '%'}，需要安排现场核验。`, hint: '先确认原因，再决定是否批准补水。', tone: 'danger', plotId: plot.plotId, primaryLabel: '查看诊断', primaryView: 'decision-console', secondaryLabel: '分派巡田', secondaryView: 'work-orders' })); }
  if (prescription) queue.push(priorityItem({ title: '补水处方待审批', summary: '系统已生成补水建议，等待主管确认后交给执行员。', hint: '审批动作会留下操作记录。', tone: 'warn', plotId: prescription.plotId, primaryLabel: '查看处方', primaryView: 'decision-console', secondaryLabel: '查看任务', secondaryView: 'work-orders' }));
  if (!queue.length) queue.push(priorityItem({ title: '目前没有紧急事项', summary: '全场地块运行平稳，可以查看今天的完成情况。', hint: '建议定时查看风险趋势。', tone: 'ok', primaryLabel: '看风险趋势', primaryView: 'risk-forecast', plotId: plots[0]?.plotId }));
  const water = resourceProfile || {}; const remaining = Number(water.remainingLitres ?? 3760); const capacity = Number(water.dailyLimitLitres ?? 5000); const percent = capacity ? Math.round(remaining / capacity * 100) : 0;
  return `<section class="role-dashboard-section">${sectionHeader('现在要处理', '只列需要主管做决定的事项')}<div class="role-priority-list">${queue.slice(0, 3).join('')}</div></section><div class="role-dashboard-columns role-admin-columns"><section class="role-dashboard-section">${sectionHeader('全场地块概况', '一眼看出哪里需要关注')}<div class="role-plot-grid role-plot-grid-admin">${plots.slice(0, 8).map(plot => plotCard(plot)).join('')}</div></section><section class="role-dashboard-section role-resource-card">${sectionHeader('今天的水资源', '安排灌溉前先看剩余量')}<div class="role-resource-number"><strong>${escapeHtml(remaining.toLocaleString())} L</strong><span>可用</span></div><div class="role-resource-bar"><i style="width:${Math.max(0, Math.min(100, percent))}%"></i></div><p>今日限额 ${escapeHtml(capacity.toLocaleString())} L · 已用 ${escapeHtml(Number(water.usedTodayLitres ?? 1240).toLocaleString())} L</p>${actionButton('打开水资源安排', 'open-view', { view: 'resource-coordination', kind: 'primary' })}</section></div><section class="role-dashboard-section role-admin-footer">${sectionHeader('今日安排概览', `已完成 ${Math.max(0, 4 - pendingOrders.length)} 项，待处理 ${pendingOrders.length} 项`)}<div class="role-admin-actions">${actionButton('安排任务', 'open-view', { view: 'work-orders', kind: 'primary' })}${actionButton('查看风险趋势', 'open-view', { view: 'risk-forecast', plotId: plots[0]?.plotId, kind: 'secondary' })}${actionButton('查看经营结果', 'open-view', { view: 'value-ledger', kind: 'link' })}</div></section>`;
}

function systemDashboard({ feedItems, system, simulator, isLive }) {
  const simStatus = String(simulator?.status || 'STOPPED').toUpperCase();
  const serviceRows = [{ label: '数据服务', detail: isLive ? '已连接到农场数据' : '当前使用本地演示数据', status: isLive ? '正常' : '演示', tone: isLive ? 'ok' : 'warn' }, { label: '消息通道', detail: '设备数据可以正常进入平台', status: '正常', tone: 'ok' }, { label: '智能分析', detail: system?.aiMode === 'rules-only' ? '使用规则分析' : '已连接智能分析服务', status: '正常', tone: 'ok' }, { label: '演示数据', detail: simStatus === 'RUNNING' ? '正在持续更新' : '已暂停', status: statusText(simStatus), tone: simStatus === 'RUNNING' ? 'ok' : 'warn' }];
  const events = (feedItems || []).slice(0, 4).map(item => `<li><span class="role-event-dot"></span><div><strong>${escapeHtml(item.title || '平台事件')}</strong><small>${escapeHtml(item.timestamp || '刚刚')}</small></div></li>`).join('');
  return `<div class="role-system-grid"><section class="role-dashboard-section">${sectionHeader('平台是否正常', '下面的文字就是当前状态，不需要看技术代码')}<div class="role-health-list">${serviceRows.map(row => `<div class="role-health-row"><div><strong>${escapeHtml(row.label)}</strong><p>${escapeHtml(row.detail)}</p></div><span class="role-status role-status-${row.tone}">${escapeHtml(row.status)}</span></div>`).join('')}</div></section><section class="role-dashboard-section role-system-actions">${sectionHeader('常用操作')}<div class="role-system-action-grid">${actionButton(simStatus === 'RUNNING' ? '暂停演示数据' : '启动演示数据', 'toggle-simulator', { kind: 'primary' })}${actionButton('查看操作记录', 'open-view', { view: 'decision-passport', kind: 'secondary' })}${actionButton('打开情景回放', 'open-view', { view: 'scenario-replay', kind: 'link' })}${actionButton('查看规则版本', 'open-view', { view: 'crop-packs', kind: 'link' })}</div><p class="role-system-tip">系统管理员负责“平台能不能正常运行”；农场里的日常决策请切换到农场管理员工作台。</p></section></div><section class="role-dashboard-section">${sectionHeader('最近发生的事', '用于快速判断数据是否还在流动')}<ul class="role-event-list">${events || '<li class="role-event-empty">暂时没有新的平台事件</li>'}</ul></section>`;
}

export function renderRoleDashboard({ container, user, plots = [], feedItems = [], workOrders = [], resourceProfile = {}, system = {}, simulator = {}, isLive = false, roleTaskStates = {} }) {
  if (!container) return;
  const role = normalizeRole(user?.role); const meta = roleMeta(role); const safePlots = Array.isArray(plots) ? plots : [];
  const attention = safePlots.filter(isPlotAttentionNeeded); const orders = visibleOrders(workOrders, user, role, roleTaskStates); const activeOrders = orders.filter(order => !['DONE', 'CANCELLED'].includes(String(order.status).toUpperCase())); const simulatorStatus = String(simulator?.status || 'STOPPED').toUpperCase();
  const kpis = role === 'FARMER' ? [{ label: '我的地块', value: safePlots.length, note: '已分配', tone: 'neutral' }, { label: '需要关注', value: attention.length, note: attention.length ? '请先看这里' : '目前正常', tone: attention.length ? 'danger' : 'ok' }, { label: '今日待办', value: activeOrders.length, note: activeOrders.length ? '按计划完成' : '暂时没有待办', tone: 'neutral' }, { label: '待我确认', value: feedItems.filter(item => item.type === 'PRESCRIPTION' && safePlots.some(plot => plot.plotId === item.plotId)).length, note: '确认后交给主管', tone: 'warn' }]
    : role === 'FIELD_OPERATOR' ? [{ label: '待执行', value: activeOrders.filter(order => String(order.status).toUpperCase() !== 'IN_PROGRESS').length, note: '优先处理高等级', tone: 'warn' }, { label: '即将到期', value: activeOrders.filter(order => formatDue(order.dueAt).includes('分钟')).length, note: '记得留下记录', tone: 'danger' }, { label: '进行中', value: activeOrders.filter(order => String(order.status).toUpperCase() === 'IN_PROGRESS').length, note: '完成后点完成', tone: 'neutral' }, { label: '负责地块', value: safePlots.length, note: '现场数据可查看', tone: 'ok' }]
    : role === 'FARM_ADMIN' ? [{ label: '高风险地块', value: attention.length, note: attention.length ? '需要先处理' : '目前正常', tone: attention.length ? 'danger' : 'ok' }, { label: '待审批', value: feedItems.filter(item => item.type === 'PRESCRIPTION').length, note: '审批后才能执行', tone: 'warn' }, { label: '今日未完成', value: activeOrders.length, note: activeOrders.length ? '可分派或跟进' : '目前已完成', tone: 'neutral' }, { label: '在线设备', value: `${safePlots.filter(plot => String(plot.deviceStatus).toUpperCase() === 'ONLINE').length}/${safePlots.length || 0}`, note: '看数据是否新鲜', tone: 'ok' }, { label: '水资源余量', value: `${Math.round(Number(resourceProfile.remainingLitres ?? 3760) / Math.max(1, Number(resourceProfile.dailyLimitLitres ?? 5000)) * 100)}%`, note: '今天可安排', tone: 'ok' }]
    : [{ label: '平台状态', value: isLive ? '正常' : '演示', note: isLive ? '服务在线' : '本地数据', tone: isLive ? 'ok' : 'warn' }, { label: '数据延迟', value: isLive ? '实时' : '模拟', note: '最近一次更新', tone: 'ok' }, { label: '演示数据', value: statusText(simulatorStatus), note: simulatorStatus === 'RUNNING' ? '正在更新' : '可随时启动', tone: simulatorStatus === 'RUNNING' ? 'ok' : 'warn' }, { label: '最近事件', value: feedItems.length, note: '可查看操作记录', tone: 'neutral' }];
  const body = role === 'FARMER' ? farmerDashboard({ plots: safePlots, feedItems }) : role === 'FIELD_OPERATOR' ? operatorDashboard({ plots: safePlots, workOrders, user, roleTaskStates }) : role === 'FARM_ADMIN' ? adminDashboard({ plots: safePlots, workOrders, feedItems, resourceProfile }) : systemDashboard({ feedItems, system, simulator, isLive });
  const primaryAttrs = meta.primaryView ? { view: meta.primaryView, plotId: safePlots[0]?.plotId, kind: 'primary' } : { kind: 'primary' };
  container.innerHTML = `<div class="role-dashboard-inner" data-role-dashboard="${role}"><header class="role-dashboard-hero"><div><span class="role-dashboard-eyebrow">${escapeHtml(meta.scope)} · ${escapeHtml(new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }))}</span><h1>${escapeHtml(meta.title)}</h1><p>${escapeHtml(meta.subtitle)}</p></div><div class="role-dashboard-hero-side"><span class="role-dashboard-mode">${isLive ? '实时数据' : '演示数据'}</span>${actionButton(meta.primaryLabel, meta.primaryAction, primaryAttrs)}</div></header><div class="role-kpi-grid">${kpis.map(kpiCard).join('')}</div>${body}</div>`;
}
