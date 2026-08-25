/**
 * Role-aware account profile data used by both workbench shells.
 *
 * The profile panel intentionally keeps the same information hierarchy for
 * every role. Only the scope and the metrics change with the role, so an
 * operator can understand the account at a glance without learning a new
 * layout on each page.
 */

const ROLE_CONFIG = Object.freeze({
  FARMER: Object.freeze({
    label: '种植农户',
    icon: 'agriculture',
    section: '农务概览',
    defaultUsername: 'farmer',
    defaultContact: '138****5826',
    defaultJoinedAt: '2026-03-15'
  }),
  FARM_ADMIN: Object.freeze({
    label: '农场管理员',
    icon: 'manage_accounts',
    section: '运营概览',
    defaultUsername: 'admin',
    defaultContact: '139****1024',
    defaultJoinedAt: '2026-03-01'
  }),
  SYSTEM_ADMIN: Object.freeze({
    label: '系统管理员',
    icon: 'admin_panel_settings',
    section: '平台概览',
    defaultUsername: 'sysadmin',
    defaultContact: '188****6789',
    defaultJoinedAt: '2026-02-18'
  })
});

const FINISHED_STATUSES = new Set(['DONE', 'COMPLETED', 'CANCELLED', 'CLOSED']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizedRole(user) {
  const role = String(user?.role || '').trim().toUpperCase();
  if (role === 'ADMIN') return 'FARM_ADMIN';
  if (role === 'SYSADMIN') return 'SYSTEM_ADMIN';
  if (role === 'FIELD_OPERATOR' || role === 'OPERATOR') return 'FARMER';
  return ROLE_CONFIG[role] ? role : 'FARMER';
}

function isFinished(item) {
  return FINISHED_STATUSES.has(String(item?.status || '').trim().toUpperCase());
}

function isPending(item) {
  return ['PENDING', 'ASSIGNED', 'OPEN', 'TODO', 'IN_PROGRESS'].includes(String(item?.status || '').trim().toUpperCase());
}

function isDueSoon(item) {
  if (!item?.due_iso && !item?.dueAt && !item?.due_at) return false;
  const due = new Date(item.due_iso || item.dueAt || item.due_at).getTime();
  if (!Number.isFinite(due)) return false;
  const delta = due - Date.now();
  return delta >= 0 && delta <= 48 * 60 * 60 * 1000;
}

function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || '';
}

function resolveFarm(context, state) {
  if (context.farm && typeof context.farm === 'object') return context.farm;
  const farmId = context.farmId || state?.adminContext?.farmId || '';
  return asArray(context.farms || state?.farms).find((farm) => !farmId || farm.farmId === farmId) || asArray(context.farms || state?.farms)[0] || null;
}

function resolvePlots(context, state, role) {
  if (Array.isArray(context.plots)) return context.plots;
  if (role === 'SYSTEM_ADMIN') return asArray(state?.adminGlobalPlots);
  return asArray(state?.allPlots?.length ? state.allPlots : (state?.plots?.length ? state.plots : state?.adminGlobalPlots));
}

function resolveTasks(context, state, role) {
  if (Array.isArray(context.tasks)) return context.tasks;
  if (role === 'FARMER') return asArray(state?.farmerTasks);
  return asArray(state?.workOrders?.length ? state.workOrders : state?.adminWorkOrders);
}

function resolveMessages(context, state) {
  if (Array.isArray(context.messages)) return context.messages;
  return asArray(state?.farmerMessages);
}

function resolveInspections(context, state) {
  if (Array.isArray(context.inspections)) return context.inspections;
  return asArray(state?.inspections);
}

function resolveAlerts(context, state) {
  if (Array.isArray(context.alerts)) return context.alerts;
  return asArray(state?.adminAlerts?.length ? state.adminAlerts : state?.alerts);
}

function resolveServices(context, state) {
  if (Array.isArray(context.services)) return context.services;
  return asArray(state?.adminOverview?.services);
}

function profileStatus(user, role) {
  const inactive = String(user?.status || '').toUpperCase() === 'INACTIVE' || user?.enabled === false;
  if (inactive) return { label: '已停用', tone: 'danger' };
  return { label: role === 'SYSTEM_ADMIN' ? '在线' : '在岗', tone: 'success' };
}

function statsForFarmer(user, context, state) {
  const profile = context.profile || state?.farmerProfile || {};
  const tasks = resolveTasks(context, state, 'FARMER');
  const messages = resolveMessages(context, state);
  const inspections = resolveInspections(context, state);
  const totalDone = numberOr(firstNonEmpty(user?.total_done, profile.total_done), 0);
  const monthDone = numberOr(firstNonEmpty(user?.month_done, profile.month_done), 0);
  const inProgress = tasks.filter((item) => String(item?.status || '').toUpperCase() === 'IN_PROGRESS').length;
  const pending = tasks.filter((item) => ['PENDING', 'ASSIGNED'].includes(String(item?.status || '').toUpperCase())).length;
  const dueSoon = tasks.filter(isDueSoon).length;
  const completed = tasks.filter(isFinished).length;
  const completionRate = numberOr(firstNonEmpty(user?.completion_rate, profile.completion_rate), tasks.length ? Math.round((completed / tasks.length) * 100) : 0);
  const inspectionCount = inspections.length || numberOr(profile.inspections, 0);
  const messageCount = messages.length;
  const unread = messages.filter((item) => !item?.read).length;
  return [
    { value: totalDone, label: '累计完成', detail: `本月完成 ${monthDone} 项` },
    { value: inProgress, label: '执行中', detail: '请按时跟进' },
    { value: pending, label: '待办任务', detail: `即将到期 ${dueSoon} 项` },
    { value: `${completionRate}%`, label: '任务完成率', detail: '基于近 30 天' },
    { value: inspectionCount, label: '巡田记录', detail: '本月已提交' },
    { value: messageCount, label: '收到消息', detail: `未读 ${unread} 条` }
  ];
}

function statsForFarmAdmin(context, state) {
  const plots = resolvePlots(context, state, 'FARM_ADMIN');
  const tasks = resolveTasks(context, state, 'FARM_ADMIN');
  const alerts = resolveAlerts(context, state);
  const members = asArray(context.members || state?.farmMembers);
  const devices = asArray(
    Array.isArray(context.devices) ? context.devices : (state?.devices?.length ? state.devices : state?.adminDevices)
  );
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(isFinished).length;
  const completionRate = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 88;
  const openAlerts = alerts.filter((item) => ['OPEN', 'ACTIVE', 'UNACKNOWLEDGED'].includes(String(item?.status || '').toUpperCase())).length || numberOr(state?.adminOverview?.alerts?.open, 0);
  const pendingTasks = tasks.filter(isPending).length;
  const activeFarmers = members.filter((item) => item?.role === 'FARMER' && String(item?.status || 'ACTIVE').toUpperCase() !== 'INACTIVE' && item?.enabled !== false).length || 3;
  const onlineDevices = devices.filter((item) => ['ONLINE', 'UP', 'ACTIVE'].includes(String(item?.status || '').toUpperCase())).length;
  return [
    { value: plots.length || 0, label: '管理地块', detail: '当前农场范围' },
    { value: openAlerts, label: '待处理告警', detail: '需要及时跟进' },
    { value: pendingTasks, label: '待处理任务', detail: '含执行中工单' },
    { value: `${completionRate}%`, label: '任务完成率', detail: '当前农场工单' },
    { value: activeFarmers, label: '活跃农户', detail: '可接收任务' },
    { value: onlineDevices || '—', label: '在线设备', detail: '接入范围内' }
  ];
}

function statsForSystemAdmin(context, state) {
  const services = resolveServices(context, state);
  const devices = asArray(Array.isArray(context.devices) ? context.devices : state?.adminDevices);
  const users = asArray(context.users || state?.adminUsers);
  const rules = asArray(context.rules || state?.adminRules);
  const auditRecords = asArray(context.auditRecords || state?.adminAuditRecords);
  const overview = state?.adminOverview || {};
  const onlineServices = services.filter((item) => ['UP', 'ONLINE', 'HEALTHY'].includes(String(item?.status || '').toUpperCase())).length;
  const totalServices = services.length || 6;
  const activeUsers = users.filter((item) => item?.enabled !== false && String(item?.status || 'ACTIVE').toUpperCase() !== 'INACTIVE').length || 0;
  const publishedRules = rules.filter((item) => String(item?.status || '').toLowerCase() === 'published').length || rules.length;
  const running = Boolean(overview.simulator?.running || state?.simulatorStatus?.status === 'RUNNING');
  const events = numberOr(overview.simulator?.eventsEmitted, 0) || asArray(overview.recentEvents).length;
  return [
    { value: `${onlineServices}/${totalServices}`, label: '在线服务', detail: '平台服务节点' },
    { value: auditRecords.length, label: '决策审计', detail: '最近决策记录' },
    { value: publishedRules || '—', label: '生效规则', detail: '已发布版本' },
    { value: running ? '运行中' : '待机', label: '模拟器状态', detail: overview.simulator?.scenario ? `场景 ${overview.simulator.scenario}` : '可随时启动' },
    { value: activeUsers || '—', label: '启用账号', detail: '全平台账号' },
    { value: events || '—', label: '今日事件', detail: `${devices.length || 0} 个设备接入` }
  ];
}

export function buildAccountProfile(user, context = {}) {
  const state = context.state || {};
  const role = normalizedRole(user);
  const config = ROLE_CONFIG[role];
  const fallback = context.profile || {};
  const farm = resolveFarm(context, state);
  const plots = resolvePlots(context, state, role);
  const status = profileStatus(user, role);
  const username = firstNonEmpty(user?.username, fallback.username, config.defaultUsername);
  const roleLabel = firstNonEmpty(user?.roleLabel, user?.role_label, fallback.role_label, config.label);
  const contact = firstNonEmpty(user?.contact, user?.phone, fallback.contact, config.defaultContact);
  const joinedAt = firstNonEmpty(user?.joined_at, user?.joinedAt, user?.createdAt, fallback.joined_at, config.defaultJoinedAt);
  const farmName = firstNonEmpty(farm?.name, user?.farmName, fallback.farm_name, '农智示范农场');
  const plotNames = asArray(user?.plot_names || user?.plotNames).length
    ? asArray(user.plot_names || user.plotNames)
    : plots.map((plot) => plot?.name || plot?.plotName || plot?.plotId).filter(Boolean);
  const plotCount = plots.length || plotNames.length;

  let rows;
  let stats;
  if (role === 'SYSTEM_ADMIN') {
    const services = resolveServices(context, state);
    const online = services.filter((item) => ['UP', 'ONLINE', 'HEALTHY'].includes(String(item?.status || '').toUpperCase())).length;
    rows = [
      { label: '管理范围', value: '全平台' },
      { label: '服务节点', value: `${online || 0}/${services.length || 6} 在线` },
      { label: '联系方式', value: contact },
      { label: '任职时间', value: joinedAt },
      { label: '当前状态', value: status.label, tone: status.tone, badge: true }
    ];
    stats = statsForSystemAdmin(context, state);
  } else if (role === 'FARM_ADMIN') {
    const scope = plotCount ? `${plotCount} 个地块${farmName ? ` · ${farmName}` : ''}` : (farmName || '全场');
    rows = [
      { label: '所属农场', value: farmName },
      { label: '管理范围', value: scope },
      { label: '联系方式', value: contact },
      { label: '任职时间', value: joinedAt },
      { label: '当前状态', value: status.label, tone: status.tone, badge: true }
    ];
    stats = statsForFarmAdmin(context, state);
  } else {
    rows = [
      { label: '所属农场', value: farmName },
      { label: '负责地块', value: plotNames.length ? plotNames.join('、') : '暂未分配' },
      { label: '联系方式', value: contact },
      { label: '入职时间', value: joinedAt },
      { label: '当前状态', value: status.label, tone: status.tone, badge: true }
    ];
    stats = statsForFarmer(user, context, state);
  }

  return {
    role,
    roleClass: `is-${role.toLowerCase().replaceAll('_', '-')}`,
    username,
    displayName: firstNonEmpty(user?.displayName, user?.display_name, fallback.display_name, username),
    roleLabel,
    icon: config.icon,
    sectionLabel: config.section,
    contact,
    rows,
    stats
  };
}

export { ROLE_CONFIG };
