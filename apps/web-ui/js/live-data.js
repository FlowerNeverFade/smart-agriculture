/**
 * Normalisation helpers for the formal (backend-backed) session.
 *
 * The demo session intentionally uses mock-data.js.  These helpers never
 * read that module: they turn REST records into the small view models used
 * by the farmer and workbench shells, so a write made by one role can be
 * read by the other roles after the next refresh/SSE invalidation.
 */

const WORK_STATUS_ALIASES = Object.freeze({
  PENDING: 'OPEN',
  NEW: 'OPEN',
  CLAIMED: 'ASSIGNED',
  COMPLETED: 'DONE'
});

const CROP_LABELS = Object.freeze({
  tomato: '番茄',
  corn: '玉米',
  cucumber: '黄瓜',
  rice: '水稻',
  sunflower: '向日葵',
  strawberry: '草莓',
  pepper: '辣椒'
});

const STATUS_LABELS = Object.freeze({
  OPEN: '待分配',
  ASSIGNED: '待执行',
  IN_PROGRESS: '执行中',
  SUBMITTED: '待验收',
  REJECTED: '需返工',
  DONE: '已完成',
  CANCELLED: '已取消'
});

/**
 * The API keeps a short deterministic `summary` for cards and audits, while
 * `narrative` is the answer intended for a person to read.  Always prefer the
 * latter in the chat surfaces so a successful LLM response is not replaced by
 * the generic intent summary.
 */
export function agentResponseText(response = {}, fallback = '') {
  for (const candidate of [response?.narrative, response?.summary, response?.message]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
        .replace(/^\s*#{1,6}\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^\s*[-*]\s+/gm, '• ');
    }
  }
  return fallback;
}

export function agentResponseSource(response = {}, sessionMode = 'live') {
  if (sessionMode !== 'live') return '演示规则';
  const adapter = String(response?.adapter || '').trim().toLowerCase();
  if (adapter === 'openai-compatible' && response?.degraded === false) return 'Qwen 实时回答';
  if (adapter === 'mock') return '模拟回答';
  if (response?.degraded) return '规则降级回答';
  if (adapter === 'rules-fast-path') return '规则快捷回答';
  return adapter ? '规则 + 知识' : 'AI 助手';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = '') {
  return value === undefined || value === null || String(value).trim() === '' ? fallback : String(value);
}

function dateValue(value) {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function normalizeWorkStatus(value) {
  const status = text(value, 'OPEN').trim().toUpperCase();
  return WORK_STATUS_ALIASES[status] || status;
}

export function workStatusLabel(value) {
  const status = normalizeWorkStatus(value);
  return STATUS_LABELS[status] || status;
}

export function relativeTime(value, now = Date.now()) {
  const date = dateValue(value);
  if (!date) return '—';
  const diff = Math.max(0, now - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function dueLabel(value, now = Date.now()) {
  const date = dateValue(value);
  if (!date) return '时间待确认';
  if (date.getTime() < now) return '已逾期';
  const sameDay = date.toDateString() === new Date(now).toDateString();
  return sameDay
    ? `今日 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function metricFromLatest(code, event, current = {}) {
  if (!event || event.value === undefined || event.value === null) return current;
  return {
    ...current,
    label: current.label || code,
    value: event.value,
    unit: event.unit || current.unit || '',
    target: current.target || '—',
    status: event.quality?.status === 'GOOD' ? 'NORMAL' : (event.quality?.status || current.status || 'UNKNOWN'),
    observedAt: event.ts || event.observedAt || null,
    provenance: event.provenance || 'OBSERVED',
    sourceMode: event.sourceMode || current.sourceMode || 'SIMULATION',
    dataOrigin: event.dataOrigin || current.dataOrigin || 'BACKEND'
  };
}

export function normalizePlot(plot = {}, overviewCard = {}) {
  const metrics = { ...(plot.metrics || {}) };
  const history = plot.history || overviewCard.history || {};
  Object.entries(history).forEach(([code, points]) => {
    if (!Array.isArray(points) || !points.length) return;
    metrics[code] = { ...(metrics[code] || { label: code, target: '—' }), history: points };
  });
  Object.entries(overviewCard.latest || {}).forEach(([code, event]) => {
    metrics[code] = metricFromLatest(code, event, metrics[code]);
  });
  const device = overviewCard.device || plot.device || {};
  // A physical binding has precedence over the simulator device for the
  // plot's operational status.  Synthetic values may continue to exist as a
  // fallback, but the UI must never call a plot usable while its bound
  // hardware is offline.
  const hardware = overviewCard.hardware || plot.hardware || {};
  const hardwareBound = String(hardware.bindingState || '').toUpperCase() === 'BOUND';
  const effectiveDevice = hardwareBound
    ? { ...device, ...hardware, deviceId: hardware.deviceId || device.deviceId, sourceMode: 'REAL', dataOrigin: 'HARDWARE' }
    : device;
  const cropCode = text(plot.cropCode || overviewCard.cropCode, '');
  return {
    ...plot,
    ...overviewCard,
    plotId: text(plot.plotId || overviewCard.plotId),
    name: text(plot.name || overviewCard.name, text(plot.plotId || overviewCard.plotId, '未命名地块')),
    cropCode,
    cropName: text(plot.cropName || overviewCard.cropName, CROP_LABELS[cropCode] || cropCode || '—'),
    stageCode: text(plot.stageCode, ''),
    stageLabel: text(plot.stageLabel, '—'),
    metrics,
    history,
    deviceId: text(effectiveDevice.deviceId || plot.deviceId, ''),
    deviceStatus: text(effectiveDevice.status || plot.deviceStatus, 'UNKNOWN').toUpperCase(),
    hardware,
    hardwareStatus: hardwareBound ? text(hardware.status, 'OFFLINE').toUpperCase() : 'NOT_BOUND',
    healthScore: overviewCard.health?.score ?? plot.healthScore ?? effectiveDevice.healthScore ?? null,
    health: overviewCard.health || plot.health || null,
    lastSeen: effectiveDevice.lastSeen || plot.lastSeen || null,
    sourceMode: plot.sourceMode || overviewCard.sourceMode || Object.values(metrics).find(metric => metric?.sourceMode)?.sourceMode || 'SIMULATION',
    dataOrigin: plot.dataOrigin || overviewCard.dataOrigin || Object.values(metrics).find(metric => metric?.dataOrigin)?.dataOrigin || 'BACKEND'
  };
}

export function normalizeFarmerTask(work = {}, plotMap = new Map()) {
  const plotId = text(work.plotId || work.plot_id, '');
  const plot = plotMap.get(plotId) || {};
  const status = normalizeWorkStatus(work.status);
  const createdAt = work.createdAt || work.created_at || work.created_iso;
  const dueAt = work.dueAt || work.due_at || work.due_iso;
  const issuer = text(work.createdByName || work.createdBy || work.issuer, '—');
  return {
    ...work,
    id: text(work.workOrderId || work.workItemId || work.id, `work-${createdAt || Date.now()}`),
    workOrderId: work.workOrderId || null,
    title: text(work.title, '未命名农务任务'),
    reason: text(work.reason, '暂无执行说明'),
    instruction: text(work.instruction || work.description, ''),
    status,
    priority: text(work.priority, 'MEDIUM').toUpperCase(),
    plot_id: plotId || null,
    plot_name: text(work.plotName || work.plot_name || plot.name, plotId || '全场任务'),
    issuer,
    created_iso: createdAt || null,
    due_iso: dueAt || null,
    created_label: relativeTime(createdAt),
    due_label: dueLabel(dueAt),
    status_label: workStatusLabel(status),
    dataOrigin: 'BACKEND'
  };
}

function messageBase({ id, category, title, snippet, body, sender, at, read = false, plotId = '' }) {
  return {
    id,
    category,
    title,
    snippet,
    body_paragraphs: asArray(body).filter(Boolean),
    sender: sender || 'AgriLoop 后端',
    read: Boolean(read),
    time_iso: at || null,
    time_label: relativeTime(at),
    plotId: plotId || null,
    dataOrigin: 'BACKEND'
  };
}

export function buildFarmerMessages({ alerts = [], tasks = [], inspections = [], plots = [] } = {}) {
  const plotMap = new Map(asArray(plots).map((plot) => [String(plot.plotId), plot]));
  const messages = [];
  const seenAlertKeys = new Set();
  const sortedAlerts = asArray(alerts).slice().sort((a, b) =>
    (dateValue(b.updatedAt || b.raisedAt || b.createdAt)?.getTime() || 0)
    - (dateValue(a.updatedAt || a.raisedAt || a.createdAt)?.getTime() || 0));
  sortedAlerts.forEach((alert) => {
    const plotId = text(alert.plotId, '');
    const source = text(alert.source, 'RULE').toUpperCase();
    const status = text(alert.status, 'ACTIVE').toUpperCase();
    // Keep one live alert message per plot+source so a cooldown miss on the
    // backend cannot flood the farmer inbox with the same notice.
    if (['ACTIVE', 'ACKNOWLEDGED', 'OPEN'].includes(status)) {
      const dedupeKey = `${plotId}|${source}`;
      if (seenAlertKeys.has(dedupeKey)) return;
      seenAlertKeys.add(dedupeKey);
    }
    const plotName = plotMap.get(plotId)?.name || plotId || '相关地块';
    const title = text(alert.title, `${plotName}出现${text(alert.level, '提示')}告警`);
    const message = text(alert.message || alert.summary, '请打开告警详情查看后端提供的处理建议。');
    messages.push(messageBase({
      id: `alert:${text(alert.alertId || alert.id, `${plotId}:${alert.createdAt || alert.raisedAt}`)}`,
      category: 'alert',
      title,
      snippet: message,
      body: [message, `来源：${text(alert.source, '规则引擎')}`, `当前状态：${status}`],
      sender: 'AgriLoop 规则引擎',
      at: alert.updatedAt || alert.createdAt || alert.raisedAt,
      plotId,
      read: status === 'CLOSED' || status === 'RESOLVED'
    }));
  });
  asArray(tasks).forEach((task) => {
    const normalized = task.id ? task : normalizeFarmerTask(task, plotMap);
    messages.push(messageBase({
      id: `work:${text(task.workOrderId || task.id)}`,
      category: 'task',
      title: `任务：${normalized.title}`,
      snippet: normalized.reason,
      body: [normalized.reason, normalized.instruction, `当前状态：${workStatusLabel(normalized.status)}`],
      sender: normalized.issuer,
      at: task.createdAt || normalized.created_iso,
      plotId: normalized.plot_id,
      read: normalizeWorkStatus(normalized.status) === 'DONE' || normalizeWorkStatus(normalized.status) === 'CANCELLED'
    }));
  });
  asArray(inspections).forEach((record) => {
    const plotId = text(record.plotId, '');
    const plotName = plotMap.get(plotId)?.name || plotId || '相关地块';
    const note = text(record.notes || record.evidenceSummary, '已提交现场观察。');
    messages.push(messageBase({
      id: `inspection:${text(record.inspectionId, `${plotId}:${record.observedAt}`)}`,
      category: 'notice',
      title: `巡田记录已提交：${plotName}`,
      snippet: note,
      body: [note, `记录人：${text(record.operatorName || record.operatorId, '—')}`, `来源：${text(record.sourceType, 'HUMAN_OBSERVATION')}`],
      sender: text(record.operatorName || record.operatorId, '现场记录'),
      at: record.observedAt || record.createdAt,
      plotId,
      read: true
    }));
  });
  return messages
    .sort((a, b) => (dateValue(b.time_iso)?.getTime() || 0) - (dateValue(a.time_iso)?.getTime() || 0))
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);
}

export function buildFarmerProfile({ user = {}, farm = null, plots = [], tasks = [], inspections = [], messages = [] } = {}) {
  const completed = asArray(tasks).filter((task) => ['DONE', 'COMPLETED'].includes(normalizeWorkStatus(task.status))).length;
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthDone = asArray(tasks).filter((task) => ['DONE', 'COMPLETED'].includes(normalizeWorkStatus(task.status)) && String(task.completedAt || task.updatedAt || '').startsWith(monthKey)).length;
  const total = asArray(tasks).length;
  return {
    username: text(user.username, '—'),
    displayName: text(user.displayName || user.username, '—'),
    role_label: text(user.roleLabel, '种植农户'),
    farm_name: text(farm?.name, '—'),
    farm_id: text(farm?.farmId, ''),
    plot_names: asArray(plots).map((plot) => plot.name || plot.plotId).filter(Boolean),
    total_done: completed,
    month_done: monthDone,
    inspections: asArray(inspections).length,
    completion_rate: total ? Math.round((completed / total) * 100) : 0,
    messages: asArray(messages).length,
    unread: asArray(messages).filter((message) => !message.read).length,
    // Contact and employment dates are intentionally absent: the current
    // auth contract does not provide them, so the UI must not invent them.
    dataOrigin: 'BACKEND'
  };
}

export function buildLiveFeedItems({ alerts = [], workOrders = [], inspections = [], plots = [] } = {}) {
  const plotMap = new Map(asArray(plots).map((plot) => [String(plot.plotId), plot]));
  const items = [];
  asArray(alerts).forEach((alert) => {
    const plotId = text(alert.plotId, '');
    items.push({
      id: `alert:${text(alert.alertId || alert.id, Date.now())}`,
      type: 'ALERT',
      category: text(alert.level, '告警'),
      title: text(alert.title, `${plotMap.get(plotId)?.name || plotId}告警`),
      summary: text(alert.message || alert.summary, '后端告警记录'),
      timestamp: relativeTime(alert.createdAt || alert.raisedAt),
      timestampIso: alert.createdAt || alert.raisedAt || alert.updatedAt || null,
      badge: { color: 'amber' },
      actions: [],
      dataOrigin: 'BACKEND'
    });
  });
  asArray(workOrders).forEach((order) => {
    items.push({
      id: `work:${text(order.workOrderId || order.id, Date.now())}`,
      type: 'WORK_ORDER',
      category: '农务工单',
      title: text(order.title, '未命名任务'),
      summary: `${text(order.reason, '暂无说明')} · ${workStatusLabel(order.status)}`,
      timestamp: relativeTime(order.updatedAt || order.createdAt),
      timestampIso: order.updatedAt || order.createdAt || null,
      badge: { color: 'green' },
      actions: [],
      dataOrigin: 'BACKEND'
    });
  });
  asArray(inspections).forEach((record) => {
    const plotId = text(record.plotId, '');
    items.push({
      id: `inspection:${text(record.inspectionId, Date.now())}`,
      type: 'INFO',
      category: '人工观察',
      title: `巡田记录：${plotMap.get(plotId)?.name || plotId}`,
      summary: text(record.notes || record.evidenceSummary, '已收到现场观察'),
      timestamp: relativeTime(record.observedAt || record.createdAt),
      timestampIso: record.observedAt || record.createdAt || null,
      badge: { color: 'green' },
      actions: [],
      dataOrigin: 'BACKEND'
    });
  });
  return items
    .sort((a, b) => (dateValue(b.timestampIso)?.getTime() || 0) - (dateValue(a.timestampIso)?.getTime() || 0))
    .slice(0, 20);
}

export function mapAdminPlot(plot, farmMap = new Map()) {
  const normalized = normalizePlot(plot, plot);
  const status = normalized.deviceStatus === 'OFFLINE'
    ? 'OFFLINE'
    : ['HIGH', 'CRITICAL', 'DANGER'].includes(String(normalized.riskLevel || '').toUpperCase())
      ? 'CRITICAL'
      : ['WARN', 'WARNING', 'DEGRADED'].includes(String(normalized.riskLevel || '').toUpperCase())
        ? 'WARNING'
        : 'HEALTHY';
  const metrics = {};
  Object.entries(normalized.metrics || {}).forEach(([code, metric]) => {
    metrics[code] = metric?.value === undefined || metric?.value === null ? '—' : `${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`;
  });
  return {
    id: normalized.plotId,
    plotId: normalized.plotId,
    farmId: normalized.farmId || '',
    farm: farmMap.get(normalized.farmId)?.name || normalized.farmId || '—',
    crop: normalized.cropName || CROP_LABELS[normalized.cropCode] || normalized.cropCode || '—',
    status,
    updated: relativeTime(normalized.lastSeen || normalized.updatedAt),
    metrics,
    healthScore: normalized.healthScore,
    monitoredMetrics: Object.keys(metrics),
    issue: status === 'OFFLINE' ? '采集设备离线' : status === 'CRITICAL' ? '风险等级较高' : status === 'WARNING' ? '指标需要关注' : ''
  };
}

export function mapAdminDevice(device = {}, plotMap = new Map()) {
  return {
    ...device,
    deviceId: text(device.deviceId || device.id, '—'),
    plotId: text(device.plotId, '未绑定'),
    type: text(device.type, '未知设备'),
    lastHeartbeat: relativeTime(device.lastSeen || device.lastHeartbeat),
    status: text(device.status, 'UNKNOWN').toUpperCase(),
    plotName: plotMap.get(String(device.plotId))?.name || '—',
    dataOrigin: 'BACKEND'
  };
}

export function mapAdminAlert(alert = {}, plotMap = new Map()) {
  const status = text(alert.status, 'ACTIVE').toUpperCase();
  return {
    ...alert,
    id: text(alert.alertId || alert.id, `alert-${Date.now()}`),
    time: relativeTime(alert.createdAt || alert.raisedAt || alert.updatedAt),
    level: text(alert.level, 'INFO').toUpperCase(),
    source: plotMap.get(String(alert.plotId))?.name || text(alert.source || alert.plotId, '系统'),
    summary: text(alert.message || alert.summary || alert.title, '后端告警记录'),
    status: status === 'ACTIVE' ? 'OPEN' : status === 'ACKED' ? 'ACK' : status,
    dataOrigin: 'BACKEND'
  };
}

export function mapCropPack(pack = {}) {
  const identity = pack.identity || {};
  return {
    ...pack,
    id: text(pack.id || pack.cropCode, `pack-${Date.now()}`),
    icon: CROP_LABELS[pack.cropCode] ? ({ tomato: '🍅', corn: '🌽', cucumber: '🥒', rice: '🌾', sunflower: '🌻', strawberry: '🍓', pepper: '🌶️' }[pack.cropCode] || '🌱') : '🌱',
    name: text(identity.name || pack.cropName, text(pack.cropCode, '未命名作物')),
    status: text(pack.status, 'published').toLowerCase(),
    stages: asArray(pack.stages).map((stage) => typeof stage === 'string' ? stage : text(stage.label || stage.code, '未命名阶段')),
    knowledgeDocs: asArray(pack.knowledge?.content || pack.knowledgeDocs).map((doc) => typeof doc === 'string' ? { title: doc, content: '' } : { ...doc }),
    availableForPlanting: pack.availableForPlanting !== false,
    dataOrigin: 'BACKEND'
  };
}

export function mapAdminRule(rule = {}, index = 0) {
  return {
    ...rule,
    id: text(rule.id || rule.code, `rule-${index + 1}`),
    description: text(rule.description || rule.message || rule.code, '后端规则'),
    type: text(rule.type || rule.metric, '规则'),
    version: text(rule.version || rule.ruleVersion, '—'),
    status: text(rule.status, 'published').toLowerCase(),
    dataOrigin: 'BACKEND'
  };
}

export function mapStrategyCandidate(candidate = {}, index = 0) {
  const rawStatus = text(candidate.status, 'pending').toUpperCase();
  const status = ({ DRAFT: 'pending', OFFLINE_VALIDATED: 'verified', APPROVED: 'approved', REJECTED: 'rejected', ACTIVE: 'active', SUPERSEDED: 'superseded', ROLLED_BACK: 'rolled_back' }[rawStatus] || rawStatus.toLowerCase());
  return {
    ...candidate,
    id: text(candidate.id || candidate.candidateId || candidate.strategyId, `candidate-${index + 1}`),
    candidateId: text(candidate.candidateId || candidate.id || candidate.strategyId, `candidate-${index + 1}`),
    source: text(candidate.source || candidate.provenance, 'backend').toLowerCase(),
    description: text(candidate.description || candidate.summary || candidate.name, '后端策略候选'),
    status,
    dataOrigin: 'BACKEND'
  };
}

export function mapTimelineRecord(entry = {}, plotMap = new Map(), index = 0) {
  const record = entry.record || entry;
  const type = text(entry.type || record.type, 'event').toUpperCase();
  const plotId = text(record.plotId || entry.plotId, '—');
  const traceId = text(record.traceId || record.diagnosisId || record.planId || record.commandId || record.workOrderId || record.inspectionId, `event-${index + 1}`);
  const at = entry.at || record.createdAt || record.evaluatedAt || record.observedAt;
  const result = ['REJECTED', 'FAILED', 'ERROR', 'CANCELLED'].includes(text(record.status).toUpperCase()) ? 'REJECT' : ['DONE', 'COMPLETED', 'PASS', 'APPROVED'].includes(text(record.status).toUpperCase()) ? 'PASS' : 'PENDING';
  return {
    traceId,
    time: relativeTime(at),
    timeIso: at || null,
    operator: text(record.operatorName || record.operatorId || record.createdBy || record.updatedBy, '—'),
    plotId,
    type,
    typeLabel: ({ DIAGNOSIS: '诊断', READINESS: '就绪度', 'IRRIGATION-PLAN': '处方', COMMAND: '命令', EVALUATION: '评价', INSPECTION: '巡田', 'WORK-ORDER': '工单', ALERT: '告警' }[type] || type),
    summary: text(record.summary || record.message || record.title || record.reason || record.evidenceSummary, '后端审计记录'),
    result,
    passport: {
      trigger: text(record.source || record.sourceType, '后端记录'),
      cropPack: text(record.cropPackVersion, '—'),
      ruleVersion: text(record.ruleVersion, '—'),
      ragRef: text(record.knowledgeVersion, '—'),
      similarCase: '—',
      diagnosis: text(record.primaryCause || record.riskType, '—'),
      prescription: text(record.waterLitre || record.resultSummary, '—'),
      toolCall: text(record.action || record.type, '—'),
      safetyGates: text(record.readinessStatus || record.quality?.status, '—'),
      riskLevel: text(record.riskLevel || record.level, '—'),
      execution: record.status ? { status: text(record.status), evaluation: text(record.reviewNote || record.evaluation, '—') } : null
    },
    dataOrigin: 'BACKEND'
  };
}

export function emptyAdminOverview() {
  return {
    uptime: '—', apiVersion: '—', aiMode: '—', llmModel: '—',
    alerts: { open: 0, acknowledged: 0, closedToday: 0 },
    devices: { total: 0, online: 0, offline: 0 },
    simulator: { running: false, scenario: '', eventsEmitted: 0 },
    services: [], recentEvents: [], dataOrigin: 'BACKEND'
  };
}
