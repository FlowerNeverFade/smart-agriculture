const ROLE_LABELS = {
  FARM_ADMIN: '农场管理员',
  FARMER: '种植农户',
  SYSTEM_ADMIN: '系统管理员'
};

const METRIC_LABELS = {
  SOIL_MOISTURE: '土壤湿度',
  AIR_TEMPERATURE: '空气温度',
  AIR_HUMIDITY: '空气湿度',
  WATER_LEVEL: '水箱水位',
  LIGHT: '光照',
  CO2: '二氧化碳',
  PH: '土壤酸碱度',
  NITROGEN: '氮',
  PHOSPHORUS: '磷',
  POTASSIUM: '钾',
  RAINFALL: '降雨'
};

const STATUS_LABELS = {
  ONLINE: '在线',
  OFFLINE: '离线',
  UNKNOWN: '未知',
  ACTIVE: '进行中',
  OPEN: '待处理',
  ASSIGNED: '已分配',
  IN_PROGRESS: '执行中',
  SUBMITTED: '待验收',
  DONE: '已完成',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  REJECTED: '已退回',
  PENDING: '待处理',
  UP: '正常',
  DOWN: '中断',
  DEGRADED: '降级',
  FALLBACK_OR_IDLE: '待命/降级',
  READY: '就绪',
  AVAILABLE: '可用',
  UNAVAILABLE: '不可用',
  SUCCEEDED: '成功',
  FAILED: '失败',
  TIMEOUT: '超时',
  PARTIAL: '部分完成',
  AWAITING_CONFIRMATION: '待确认',
  EXECUTING: '执行中',
  CANCELED: '已取消'
};

const PRIORITY_LABELS = {
  CRITICAL: '紧急',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
  INFO: '提示'
};

const WORK_ACTION_LABELS = {
  SOWING: '播种',
  TRANSPLANTING: '移栽',
  HARVEST: '采收',
  FERTILIZATION: '施肥',
  PEST_CONTROL: '植保',
  WEEDING: '除草',
  PRUNING: '整枝',
  IRRIGATION: '灌溉',
  MANUAL_IRRIGATION: '灌溉',
  IRRIGATION_CHECK: '灌溉巡检',
  INSPECTION: '巡田核验',
  DEVICE_CHECK: '设备检查',
  IRRIGATION_REVIEW: '灌溉方案审批',
  FIELD_OPERATION: '田间作业'
};

const OUTCOME_LABELS = {
  SUCCEEDED: '成功',
  PARTIAL: '部分完成',
  FAILED: '失败',
  TIMEOUT: '超时',
  INCONCLUSIVE: '暂无法判断'
};

const AGENT_INTENT_LABELS = {
  IRRIGATION_RECOMMENDATION: '灌溉建议',
  DIAGNOSIS: '风险诊断',
  RISK_DIAGNOSIS: '风险诊断',
  RISK_FORECAST: '风险预测',
  PLATFORM_STATUS: '平台状态',
  PLATFORM_OVERVIEW: '平台风险概览',
  FARM_OVERVIEW: '农场风险概览',
  RULE_STRATEGY_STATUS: '规则与策略状态',
  TODAY_WORK: '今日农务',
  PLOT_STATUS: '地块状态',
  IMAGE_ANALYSIS: '图片分析',
  GREETING: '问候',
  CLARIFICATION: '需要补充信息',
  CAPABILITY_QUERY: '能力说明',
  FOLLOW_UP: '继续分析',
  RETEST_CHECKLIST: '复测清单',
  WATER_RESOURCE_STATUS: '水资源状态',
  AGENT_ACTION: '受控操作'
};

const AGENT_TOOL_LABELS = {
  get_plot_status: '读取地块状态',
  get_risk_forecast: '计算风险预测',
  generate_irrigation_plan: '生成灌溉方案',
  evaluate_diagnosis: '评估风险诊断',
  diagnose_root_cause: '分析异常根因',
  get_today_work_items: '汇总今日农务',
  get_water_resource_status: '读取水资源状态',
  transition_assigned_work_order: '更新本人任务',
  create_inspection_record: '提交巡田记录',
  create_evidence_request: '申请补证任务',
  execute_virtual_irrigation: '执行虚拟灌溉',
  create_plot: '新增地块',
  update_plot: '更新地块',
  set_plot_devices: '绑定设备',
  create_and_assign_work_order: '创建并下发任务',
  publish_alert_verification: '发布告警核查',
  close_alert: '关闭告警',
  get_platform_status: '读取平台服务状态',
  get_platform_risk_overview: '汇总全平台风险',
  get_rule_strategy_status: '读取规则与策略状态',
  get_farm_overview: '汇总当前农场'
};

const PROVENANCE_LABELS = {
  OBSERVED: '观测',
  RETRIEVED: '检索',
  DERIVED: '推导',
  SIMULATED: '模拟',
  USER_PROVIDED: '人工输入',
  ESTIMATED: '估算'
};

const SERVICE_LABELS = {
  database: '数据库',
  redis: '高速消息流',
  mqtt: '消息链路',
  qwen: '智能模型',
  ai: '智能模型',
  llm: '智能模型',
  simulator: '模拟器',
  api: '接口服务',
  sse: '实时推送'
};

function first(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value !== undefined && value !== null && String(value) !== '') return value;
  }
  return '';
}

function safeDomId(value, prefix) {
  const raw = String(value || 'item');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  const safe = raw.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'item';
  return `${prefix || 'item'}-${safe}-${(hash >>> 0).toString(36)}`;
}

function roleLabel(role) {
  return ROLE_LABELS[String(role || '').toUpperCase()] || '用户';
}

function statusLabel(status) {
  const key = String(status || 'UNKNOWN').toUpperCase();
  return STATUS_LABELS[key] || '未知状态';
}

function priorityLabel(priority) {
  const key = String(priority || 'MEDIUM').toUpperCase();
  return PRIORITY_LABELS[key] || '普通';
}

function workActionLabel(action) {
  const key = String(action || '').trim().toUpperCase().replace(/[- ]/g, '_');
  const aliases = {
    SOW: 'SOWING', SEED: 'SOWING', SEEDING: 'SOWING', PLANTING: 'SOWING',
    TRANSPLANT: 'TRANSPLANTING', HARVESTING: 'HARVEST',
    FERTILIZE: 'FERTILIZATION', FERTILIZING: 'FERTILIZATION',
    SPRAY: 'PEST_CONTROL', SPRAYING: 'PEST_CONTROL', PLANT_PROTECTION: 'PEST_CONTROL',
    WEED: 'WEEDING', PRUNE: 'PRUNING', WATERING: 'IRRIGATION', IRRIGATE: 'IRRIGATION',
    FIELD_WORK: 'FIELD_OPERATION', GENERAL_OPERATION: 'FIELD_OPERATION',
    FIELD_INSPECTION: 'INSPECTION'
  };
  const canonical = aliases[key] || key || 'FIELD_OPERATION';
  return WORK_ACTION_LABELS[canonical] || '农务作业';
}

function outcomeLabel(outcome) {
  const key = String(outcome || '').trim().toUpperCase();
  return OUTCOME_LABELS[key] || (key ? statusLabel(key) : '未记录');
}

function provenanceLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return PROVENANCE_LABELS[key] || (key ? '其他来源' : '—');
}

function serviceLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return SERVICE_LABELS[key] || '其他服务';
}

function agentIntentLabel(value) {
  const key = String(value || '').trim().toUpperCase();
  return AGENT_INTENT_LABELS[key] || '农事建议';
}

function agentToolLabel(value) {
  const key = String(value || '').trim();
  return AGENT_TOOL_LABELS[key] || '受控工具';
}

function agentSourceLabel(response, sessionMode) {
  if (sessionMode && sessionMode !== 'live') return '演示助手（未连接模型）';
  const adapter = String(response?.adapter || '').trim().toLowerCase();
  if (adapter === 'openai-compatible' && response?.degraded === false) return '实时模型';
  if (adapter === 'mock') return '演示助手（未连接模型）';
  if (response?.degraded) return '安全降级回答';
  if (adapter === 'rules-fast-path' || adapter === 'deterministic-guard') return '安全澄清';
  if (adapter === 'rules-agent') return '受控操作预览';
  return '智能助手';
}

function metricLabel(code) {
  const key = String(code || '').toUpperCase();
  return METRIC_LABELS[key] || '其他指标';
}

function metricObject(source, code) {
  if (!source || typeof source !== 'object') return null;
  const key = String(code || '').toUpperCase();
  return source[key] || source[code] || null;
}

function metricValue(source, code) {
  const item = metricObject(source, code);
  if (item && typeof item === 'object') return first(item.value, item.metricValue, item.currentValue);
  return item;
}

function formatNumber(value, digits) {
  if (value === undefined || value === null || value === '' || value === '—') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toFixed(digits === undefined ? 1 : digits);
}

function formatMetricValue(value, unit) {
  if (value === undefined || value === null || value === '' || value === '—') return '—';
  const number = Number(value);
  const formatted = Number.isFinite(number) ? formatNumber(number, Math.abs(number) >= 100 ? 0 : 1) : String(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatTime(value) {
  if (!value) return '暂无时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function relativeTime(value) {
  if (!value) return '暂无更新时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return formatTime(value);
}

function normalizePlot(raw) {
  const value = raw || {};
  const latest = value.latest || value.metrics || value.telemetry || {};
  const device = value.device || {};
  const hardware = value.hardware || {};
  const status = first(value.deviceStatus, device.status, hardware.status, 'UNKNOWN');
  const moisture = metricValue(latest, 'SOIL_MOISTURE');
  const temperature = metricValue(latest, 'AIR_TEMPERATURE');
  const humidity = metricValue(latest, 'AIR_HUMIDITY');
  const water = metricValue(latest, 'WATER_LEVEL');
  const firstMetric = metricObject(latest, 'SOIL_MOISTURE') || metricObject(latest, 'AIR_TEMPERATURE');
  return {
    plotId: first(value.plotId, value.id),
    name: first(value.name, value.plotName, value.plotId, '未命名地块'),
    cropName: first(value.cropName, value.crop?.name, value.cropCode, '未设置作物'),
    stageLabel: first(value.stageLabel, value.stageName, value.stageCode, '未设置阶段'),
    facilityLabel: first(value.facilityLabel, value.facilityType, '未设置设施'),
    scenarioLabel: first(value.scenarioLabel, value.simulation?.scenario, value.scenario, '正常运行'),
    riskLevel: String(first(value.riskLevel, value.risk, 'UNKNOWN')).toUpperCase(),
    deviceStatus: String(status).toUpperCase(),
    deviceLabel: first(device.name, device.deviceId, hardware.label, '未绑定设备'),
    deviceId: first(device.deviceId, value.deviceId, '—'),
    lastSeen: first(device.lastSeen, firstMetric?.ts, value.updatedAt),
    healthScore: value.healthScore !== undefined ? value.healthScore : value.health?.score,
    moisture: formatMetricValue(moisture, '%'),
    temperature: formatMetricValue(temperature, '°C'),
    humidity: formatMetricValue(humidity, '%RH'),
    waterLevel: formatMetricValue(water, '%'),
    metrics: latest
  };
}

function normalizeTask(raw) {
  const value = raw || {};
  const status = String(first(value.status, 'UNKNOWN')).toUpperCase();
  return {
    workOrderId: first(value.workOrderId, value.id),
    farmId: first(value.farmId, ''),
    title: first(value.title, '未命名任务'),
    reason: first(value.reason, value.description, '暂无说明'),
    description: first(value.description, value.reason, ''),
    plotId: first(value.plotId, ''),
    plotName: first(value.plotName, value.plotId, '未指定地块'),
    status,
    statusLabel: statusLabel(status),
    priority: String(first(value.priority, 'MEDIUM')).toUpperCase(),
    priorityLabel: priorityLabel(value.priority),
    actionType: String(first(value.actionType, 'FIELD_OPERATION')).toUpperCase(),
    actionLabel: first(value.actionLabel, workActionLabel(value.actionType), '农务处理'),
    dueAt: value.dueAt,
    dueLabel: value.dueAt ? formatTime(value.dueAt) : '未设置时限',
    assigneeName: first(value.assigneeName, value.assigneeId, '待分配'),
    assigneeId: first(value.assigneeId, ''),
    sourceType: first(value.sourceType, ''),
    outcome: String(first(value.outcome, '')).toUpperCase(),
    outcomeLabel: outcomeLabel(value.outcome),
    resultSummary: first(value.resultSummary, ''),
    issueReportStatus: first(value.issueReportStatus, ''),
    issueReportDescription: first(value.issueReportDescription, ''),
    reviewNote: first(value.reviewNote, value.rejectionReason, ''),
    history: Array.isArray(value.history) ? value.history.slice(-8).map((entry) => ({
      action: String(first(entry.action, '')).toUpperCase(),
      actionLabel: statusLabel(first(entry.toStatus, entry.action)),
      fromStatusLabel: statusLabel(entry.fromStatus),
      toStatusLabel: statusLabel(entry.toStatus),
      actorName: first(entry.actorName, entry.actorId, '系统'),
      atLabel: formatTime(entry.at || entry.createdAt),
      note: first(entry.note, '')
    })) : [],
    updatedLabel: relativeTime(first(value.updatedAt, value.createdAt)),
    canStart: ['ASSIGNED', 'REJECTED'].includes(status),
    canSubmit: status === 'IN_PROGRESS',
    canReport: !['DONE', 'CANCELLED'].includes(status)
  };
}

function normalizeAlert(raw) {
  const value = raw || {};
  const level = String(first(value.level, value.priority, 'INFO')).toUpperCase();
  return {
    alertId: first(value.alertId, value.id),
    title: first(value.title, '未命名告警'),
    message: first(value.message, value.reason, '暂无说明'),
    level,
    levelLabel: priorityLabel(level),
    status: String(first(value.status, 'ACTIVE')).toUpperCase(),
    statusLabel: statusLabel(value.status),
    plotId: first(value.plotId, ''),
    plotName: first(value.plotName, value.plotId, '未指定地块'),
    updatedLabel: relativeTime(first(value.updatedAt, value.lastObservedAt, value.createdAt))
  };
}

function normalizeTelemetry(raw) {
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
  return list.map((item) => ({
    value: item?.value,
    valueLabel: formatMetricValue(item?.value, item?.unit || ''),
    metric: item?.metric || item?.metricCode || '',
    metricLabel: metricLabel(item?.metric || item?.metricCode),
    ts: item?.ts || item?.timestamp || item?.eventTs,
    timeLabel: formatTime(item?.ts || item?.timestamp || item?.eventTs),
    quality: item?.quality?.status || item?.qualityStatus || 'UNKNOWN',
    scenario: item?.scenario || item?.scenarioId || 'normal'
  })).reverse();
}

function richTextNodes(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  return lines.map((line) => {
    const children = [];
    const pattern = /\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`/g;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      if (match.index > cursor) children.push({ type: 'text', text: line.slice(cursor, match.index) });
      const bold = match[1] || match[2];
      if (bold !== undefined) {
        children.push({ name: 'strong', attrs: { class: 'rich-bold' }, children: [{ type: 'text', text: bold }] });
      } else {
        children.push({ name: 'code', attrs: { class: 'rich-code' }, children: [{ type: 'text', text: match[3] }] });
      }
      cursor = match.index + match[0].length;
    }
    if (cursor < line.length || children.length === 0) children.push({ type: 'text', text: line.slice(cursor) });
    return { name: 'div', attrs: { class: 'rich-line' }, children };
  });
}

function cleanAgentText(value, fallback) {
  const raw = value === undefined || value === null ? '' : String(value).trim();
  if (!raw) return fallback || '';
  return raw
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function agentResponseText(response, fallback) {
  return cleanAgentText(first(response?.narrative, response?.summary, response?.message, response?.content), fallback || '暂时没有生成有效回答。');
}

function normalizeAgentFacts(response) {
  const result = response?.result && typeof response.result === 'object' ? response.result : {};
  const latest = result.latest || result.latestTelemetry || result.telemetry || response?.latest || {};
  const diagnosis = response?.diagnosis && typeof response.diagnosis === 'object' ? response.diagnosis : {};
  const plan = response?.plan && typeof response.plan === 'object' ? response.plan : {};
  const facts = [];
  const add = (label, value, unit) => {
    if (/置信度|confidence|概率|模型评分|模型分数/i.test(String(label || ''))) return;
    if (value && typeof value === 'object' && !Array.isArray(value)) value = first(value.value, value.current, value.reading);
    if (value === undefined || value === null || value === '') return;
    const numeric = Number(value);
    const shown = Number.isFinite(numeric) ? (Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, '')) : String(value);
    facts.push({ label, value: `${shown}${unit ? ` ${unit}` : ''}`.trim() });
  };
  if (Array.isArray(response?.facts)) response.facts.forEach((fact) => fact?.label && add(String(fact.label), fact.value));
  const metric = (codes) => codes.reduce((found, code) => found !== undefined ? found : latest[code], undefined);
  add('土壤湿度', metric(['SOIL_MOISTURE', 'soilMoisture', 'moisture']), '%');
  add('空气温度', metric(['AIR_TEMPERATURE', 'airTemperature', 'temperature']), '°C');
  add('空气湿度', metric(['AIR_HUMIDITY', 'airHumidity', 'humidity']), '%RH');
  add('风险等级', first(diagnosis.riskLevel, diagnosis.level, result.riskLevel, response?.riskLevel));
  add('就绪状态', first(result.readinessStatus, plan.readinessStatus, response?.readinessStatus));
  add('建议水量', first(result.waterLitre, result.waterLitres, plan.waterLitre, plan.waterLitres), 'L');
  add('待处理任务', result.pendingWorkOrderCount, '项');
  add('进行中告警', result.activeAlertCount, '条');
  add('地块数量', Array.isArray(result.plots) ? result.plots.length : undefined, '个');
  add('场景', first(result.scenarioLabel, result.scenario, response?.scenarioLabel));
  return facts.filter((fact, index, list) => list.findIndex((item) => item.label === fact.label) === index).slice(0, 6);
}

function normalizeAgentEvidence(response) {
  const items = [];
  (Array.isArray(response?.knowledgeEvidence) ? response.knowledgeEvidence : []).forEach((entry, index) => {
    const source = first(entry?.source, entry?.title, '知识片段');
    items.push({ id: `knowledge-${index}`, label: String(source).split('/').pop(), detail: String(source), provenance: provenanceLabel(entry?.provenance) });
  });
  (Array.isArray(response?.tools) ? response.tools : []).forEach((tool, index) => {
    const input = tool?.input || {};
    const scope = first(input.plotId ? `地块 ${input.plotId}` : '', input.farmId ? `农场 ${input.farmId}` : '', input.scope, '当前范围');
    items.push({ id: `tool-${index}`, label: agentToolLabel(tool?.name), detail: scope, provenance: '观测', durationLabel: tool?.durationMs ? `${tool.durationMs} 毫秒` : '' });
  });
  const context = response?.context || {};
  if (context.cropPackVersion) items.push({ id: 'context-pack', label: `作物模型 v${context.cropPackVersion}`, detail: `规则 ${first(context.ruleVersion, '—')} · 知识 ${first(context.knowledgeVersion, '—')}`, provenance: '推导' });
  return items.slice(0, 8);
}

function normalizeAgentRecommendations(response) {
  const values = [];
  const plan = response?.plan && typeof response.plan === 'object' ? response.plan : {};
  if (Array.isArray(response?.recommendations)) response.recommendations.forEach((item) => item && values.push(String(item).trim()));
  if (response?.actionProposal?.summary) values.push(`确认后执行：${response.actionProposal.summary}`);
  [plan.nextStep, plan.recommendation, plan.advice, plan.action].forEach((item) => item && values.push(String(item).trim()));
  if (Array.isArray(response?.warnings)) response.warnings.forEach((item) => item && values.push(`先处理：${String(item).trim()}`));
  return [...new Set(values.filter(Boolean))].slice(0, 4);
}

function normalizeActionProposal(raw) {
  if (!raw || typeof raw !== 'object' || !raw.actionId) return null;
  const status = String(first(raw.status, 'AWAITING_CONFIRMATION')).toUpperCase();
  return {
    actionId: String(raw.actionId),
    toolName: String(first(raw.toolName, '受控操作')),
    summary: first(raw.summary, '待确认操作'),
    argumentSummary: first(raw.argumentSummary, raw.message, '请核对操作范围和参数'),
    status,
    statusLabel: status === 'AWAITING_CONFIRMATION' ? '待确认' : status === 'EXECUTING' ? '执行中' : status === 'SUCCEEDED' ? '已完成' : ['CANCELED', 'CANCELLED'].includes(status) ? '已取消' : status === 'EXPIRED' ? '已过期' : status === 'PARTIAL' ? '部分完成' : status === 'TIMEOUT' ? '执行超时' : '未完成',
    statusTone: status === 'SUCCEEDED' || status === 'PARTIAL' ? 'good' : ['AWAITING_CONFIRMATION', 'EXECUTING'].includes(status) ? 'active' : ['CANCELED', 'CANCELLED'].includes(status) ? 'neutral' : 'bad',
    riskLabel: raw.riskLevel === 'HIGH' ? '高风险' : raw.riskLevel === 'MEDIUM' ? '中风险' : '低风险',
    expiresLabel: raw.expiresAt ? formatTime(raw.expiresAt) : '',
    requiresConfirmation: raw.requiresConfirmation !== false,
    resultLabel: raw.result ? (raw.result?.message && /[\u3400-\u9fff]/.test(String(raw.result.message))
      ? String(raw.result.message)
      : statusLabel(raw.result?.status)) : '',
    error: raw.error ? (/[\u3400-\u9fff]/.test(String(raw.error)) ? String(raw.error) : '操作未完成，请稍后重试') : ''
  };
}

function normalizeAgentMessage(item, options) {
  const value = item || {};
  const opts = options || {};
  const role = String(first(value.role, 'ASSISTANT')).toUpperCase();
  const messageId = String(first(value.messageId, value.id, `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`));
  const content = role === 'USER'
    ? cleanAgentText(value.content, '已上传现场图片')
    : agentResponseText(value, '暂时没有生成有效回答，请换一种问法。');
  return {
    messageId,
    domId: safeDomId(messageId, 'message'),
    role: role === 'USER' ? 'user' : 'assistant',
    content,
    nodes: richTextNodes(content),
    timeLabel: formatTime(first(value.createdAt, value.updatedAt)),
    sourceLabel: role === 'USER' ? '' : agentSourceLabel(value, opts.sessionMode || 'live'),
    intentLabel: role === 'USER' ? '' : agentIntentLabel(value.intent),
    degraded: Boolean(value.degraded),
    facts: role === 'USER' ? [] : normalizeAgentFacts(value),
    recommendations: role === 'USER' ? [] : normalizeAgentRecommendations(value),
    evidence: role === 'USER' ? [] : normalizeAgentEvidence(value),
    actionProposal: role === 'USER' ? null : normalizeActionProposal(value.actionProposal),
    detailsOpen: false,
    traceId: first(value.traceId, ''),
    plotId: first(value.plotId, ''),
    imageCount: Number(value.vision?.imageCount || value.imageCount || 0)
  };
}

function normalizeSystemStatus(raw) {
  const value = raw || {};
  const entries = [];
  const services = value.services || value.dependencies || value;
  const serviceKeys = ['database', 'redis', 'mqtt', 'mqttCommandTransport', 'ai', 'llm', 'simulator', 'api', 'sse'];
  if (services && typeof services === 'object') serviceKeys.filter((key) => Object.prototype.hasOwnProperty.call(services, key)).forEach((key) => {
    const item = services[key];
    if (item === null || item === undefined || typeof item === 'function') return;
    const status = typeof item === 'object' ? first(item.status, item.state, item.health) : item;
    entries.push({ key, label: serviceLabel(key), status: String(status || 'UNKNOWN').toUpperCase(), statusLabel: statusLabel(status), tone: String(status || '').toUpperCase() === 'UP' || String(status || '').toUpperCase() === 'ONLINE' ? 'good' : String(status || '').toUpperCase() === 'DOWN' || String(status || '').toUpperCase() === 'OFFLINE' ? 'bad' : 'medium' });
  });
  return { entries: entries.slice(0, 12), overall: first(value.status, value.overall, value.health, entries.every((item) => item.tone === 'good') ? 'UP' : 'UNKNOWN') };
}

module.exports = {
  ROLE_LABELS,
  METRIC_LABELS,
  roleLabel,
  statusLabel,
  priorityLabel,
  workActionLabel,
  outcomeLabel,
  provenanceLabel,
  serviceLabel,
  agentIntentLabel,
  agentToolLabel,
  agentSourceLabel,
  agentResponseText,
  normalizeAgentFacts,
  normalizeAgentEvidence,
  normalizeAgentRecommendations,
  normalizeActionProposal,
  normalizeAgentMessage,
  safeDomId,
  normalizeSystemStatus,
  metricLabel,
  metricValue,
  formatNumber,
  formatMetricValue,
  formatTime,
  relativeTime,
  normalizePlot,
  normalizeTask,
  normalizeAlert,
  normalizeTelemetry,
  richTextNodes
};
