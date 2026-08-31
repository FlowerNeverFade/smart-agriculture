export const ADMIN_TABS = Object.freeze({
  dashboard: ['overview'],
  'work-orders': ['tasks', 'plans', 'resources', 'crop-packs'],
  'resource-coordination': ['devices'],
  'farm-members': ['members']
});

const ADMIN_METRIC_LABELS = Object.freeze({
  SOIL_MOISTURE: '土壤湿度',
  SOIL_HUMIDITY: '土壤湿度',
  SOIL_TEMPERATURE: '土壤温度',
  AIR_TEMPERATURE: '空气温度',
  AIR_TEMP: '空气温度',
  TEMPERATURE: '温度',
  AIR_HUMIDITY: '空气湿度',
  HUMIDITY: '湿度',
  LIGHT: '光照',
  LIGHT_INTENSITY: '光照',
  ILLUMINANCE: '光照',
  CO2: '二氧化碳',
  CO2_CONCENTRATION: '二氧化碳',
  CARBON_DIOXIDE: '二氧化碳',
  SOIL_EC: '土壤电导率',
  EC: '电导率',
  ELECTRICAL_CONDUCTIVITY: '电导率',
  NPK_RATIO: '氮磷钾',
  NITROGEN: '速效氮',
  PHOSPHORUS: '速效磷',
  POTASSIUM: '速效钾',
  PH: '酸碱度',
  SOIL_PH: '土壤酸碱度',
  WATER_LEVEL: '水位',
  WATER_FLOW: '水流量',
  FLOW_RATE: '流量',
  WIND_SPEED: '风速',
  RAINFALL: '降雨量',
  DATA_FRESHNESS: '数据新鲜度',
  DEVICE_FRESHNESS: '设备数据新鲜度',
  DEVICE_HEALTH: '设备健康'
});

export const ADMIN_PLOT_METRIC_CODES = Object.freeze([
  'SOIL_MOISTURE',
  'AIR_TEMPERATURE',
  'AIR_HUMIDITY',
  'LIGHT',
  'CO2',
  'RAINFALL',
  'PH',
  'WATER_LEVEL',
  'NITROGEN',
  'PHOSPHORUS',
  'POTASSIUM'
]);

const ADMIN_DEVICE_TYPE_LABELS = Object.freeze({
  ENVIRONMENTAL_SENSOR: '环境传感器',
  IRRIGATION_CONTROLLER: '灌溉控制器',
  FLOW_METER: '流量计'
});

const ADMIN_CROP_ALIASES = Object.freeze([
  ['tomato', ['tomato', '番茄']],
  ['corn', ['corn', '玉米']],
  ['cucumber', ['cucumber', '黄瓜']],
  ['rice', ['rice', '水稻', '稻']],
  ['sunflower', ['sunflower', '向日葵', '油葵']],
  ['strawberry', ['strawberry', '草莓']],
  ['pepper', ['pepper', '辣椒']]
]);

const ADMIN_CROP_EMOJIS = Object.freeze({
  tomato: '🍅',
  corn: '🌽',
  cucumber: '🥒',
  rice: '🌾',
  sunflower: '🌻',
  strawberry: '🍓',
  pepper: '🌶️',
  unknown: '🌱'
});

export function adminCropKey(plot = {}) {
  const cropText = `${plot.cropCode || ''} ${plot.crop || ''} ${plot.cropName || ''}`.trim().toLowerCase();
  return ADMIN_CROP_ALIASES.find(([, aliases]) => aliases.some(alias => cropText.includes(alias)))?.[0] || 'unknown';
}

export function adminCropEmoji(plot = {}) {
  return ADMIN_CROP_EMOJIS[adminCropKey(plot)] || ADMIN_CROP_EMOJIS.unknown;
}

const ADMIN_WORK_ACTION_META = Object.freeze({
  INSPECTION: { label: '巡田核验', icon: 'fact_check', tone: 'inspection' },
  FIELD_INSPECTION: { label: '巡田核验', icon: 'fact_check', tone: 'inspection' },
  FIELD_OPERATION: { label: '田间作业', icon: 'eco', tone: 'field' },
  IRRIGATION_REVIEW: { label: '灌溉审批', icon: 'water_drop', tone: 'irrigation' },
  IRRIGATION_CHECK: { label: '灌溉巡检', icon: 'water_drop', tone: 'irrigation' },
  DEVICE_CHECK: { label: '设备检查', icon: 'monitoring', tone: 'device' },
  FERTILIZATION: { label: '施肥检查', icon: 'nutrition', tone: 'fertilization' }
});

const ADMIN_WORK_STATUS_ALIASES = Object.freeze({
  PENDING: 'OPEN',
  NEW: 'OPEN',
  CLAIMED: 'ASSIGNED',
  COMPLETED: 'DONE'
});

const ADMIN_TERMINAL_WORK_STATUSES = new Set(['DONE', 'CANCELLED']);

function metricKey(value) {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

export function adminMetricLabel(code, fallbackLabel = '') {
  const normalized = metricKey(code);
  if (ADMIN_METRIC_LABELS[normalized]) return ADMIN_METRIC_LABELS[normalized];
  const fallback = String(fallbackLabel || '').trim();
  const fallbackKey = metricKey(fallback);
  if (ADMIN_METRIC_LABELS[fallbackKey]) return ADMIN_METRIC_LABELS[fallbackKey];
  return fallback || normalized.replaceAll('_', ' ') || '未知指标';
}

export function adminDeviceTypeLabel(type) {
  const value = String(type || '').trim();
  if (!value) return '类型未知';
  return ADMIN_DEVICE_TYPE_LABELS[metricKey(value)] || value;
}

function deviceIsBound(device) {
  return Boolean(device?.plotId) || metricKey(device?.bindingState) === 'BOUND';
}

export function adminDeviceSummary(devices = []) {
  const list = Array.isArray(devices) ? devices : [];
  return {
    all: list.length,
    online: list.filter(device => metricKey(device?.status) === 'ONLINE').length,
    attention: list.filter(device => metricKey(device?.status) !== 'ONLINE').length,
    unbound: list.filter(device => !deviceIsBound(device)).length
  };
}

export function adminDeviceMatchesFilters(device, filters = {}) {
  const status = metricKey(filters.status);
  const type = metricKey(filters.type);
  const binding = metricKey(filters.binding);
  const deviceStatus = metricKey(device?.status || 'OFFLINE');
  const bound = deviceIsBound(device);
  if (status === 'ATTENTION' && deviceStatus === 'ONLINE') return false;
  if (status && status !== 'ALL' && status !== 'ATTENTION' && deviceStatus !== status) return false;
  if (type && type !== 'ALL' && metricKey(device?.type) !== type) return false;
  if (binding === 'BOUND' && !bound) return false;
  if (binding === 'UNBOUND' && bound) return false;
  const query = String(filters.keyword || '').trim().toLowerCase();
  if (!query) return true;
  return [device?.name, device?.deviceId, device?.type, device?.plotName]
    .some(value => String(value || '').toLowerCase().includes(query));
}

const DEVICE_ALERT_SOURCES = new Set([
  'DEVICE_FRESHNESS', 'DEVICE_HEALTH', 'DEVICE_STATUS', 'DEVICE_FAULT', 'FLOW_METER', 'WATER_FLOW'
]);

export function deviceRelatedAlerts(device, alerts = []) {
  const deviceId = String(device?.deviceId || '').trim();
  const plotId = String(device?.plotId || '').trim();
  if (!deviceId && !plotId) return [];
  return (Array.isArray(alerts) ? alerts : []).filter(alert => {
    const directRef = String(alert?.deviceId || alert?.sourceRef || '').trim();
    if (deviceId && directRef === deviceId) return true;
    const source = metricKey(alert?.source || alert?.type);
    const deviceSource = DEVICE_ALERT_SOURCES.has(source) || source.includes('DEVICE');
    return Boolean(plotId && String(alert?.plotId || '').trim() === plotId && deviceSource);
  });
}

export function deviceRelatedWorkOrders(device, workOrders = []) {
  const deviceId = String(device?.deviceId || '').trim();
  const plotId = String(device?.plotId || '').trim();
  if (!deviceId && !plotId) return [];
  return (Array.isArray(workOrders) ? workOrders : []).filter(order => {
    if (normalizeAdminWorkActionType(order?.actionType) !== 'DEVICE_CHECK') return false;
    if (deviceId && String(order?.sourceRef || '').trim() === deviceId) return true;
    return Boolean(plotId && String(order?.plotId || '').trim() === plotId);
  });
}

export function legacyAdminTabTarget(view, tab, farmId = '', routeParams = {}) {
  const normalizedView = String(view || '').trim().toLowerCase();
  const farmParams = farmId ? { farmId } : {};
  const contextParams = ['plotId', 'targetPlot'].reduce((params, key) => {
    const value = String(routeParams?.[key] || '').trim();
    if (value) params[key] = value;
    return params;
  }, { ...farmParams });
  const normalizedTab = String(tab || '').trim().toLowerCase();
  if (normalizedView === 'decision-console' && ['chat', 'assistant', 'ai-assistant'].includes(normalizedTab)) {
    return { view: 'ai-assistant', params: contextParams };
  }
  if (['simulator', 'admin-simulator'].includes(normalizedView)) {
    return { view: 'resource-coordination', params: { tab: 'devices', ...farmParams } };
  }
  if (normalizedView !== 'resource-coordination') return null;
  if (['irrigation', 'value'].includes(normalizedTab)) {
    return { view: 'work-orders', params: { tab: 'resources', ...farmParams } };
  }
  if (normalizedTab === 'simulator') {
    return { view: 'resource-coordination', params: { tab: 'devices', ...farmParams } };
  }
  return null;
}

export function normalizeAdminWorkStatus(status) {
  const normalized = metricKey(status || 'OPEN');
  return ADMIN_WORK_STATUS_ALIASES[normalized] || normalized;
}

export function normalizeAdminWorkActionType(actionType) {
  return metricKey(actionType);
}

export function adminWorkActionMeta(actionType) {
  const value = String(actionType || '').trim();
  const code = normalizeAdminWorkActionType(value);
  const known = ADMIN_WORK_ACTION_META[code];
  return {
    code: code || 'UNKNOWN',
    key: (code || 'UNKNOWN').toLowerCase().replaceAll('_', '-'),
    label: known?.label || value || '类型未知',
    icon: known?.icon || 'task_alt',
    tone: known?.tone || 'neutral'
  };
}

export function adminWorkLifecycleSummary(workOrders = []) {
  const summary = { all: 0, open: 0, assigned: 0, inProgress: 0, submitted: 0, rejected: 0, finished: 0 };
  for (const order of Array.isArray(workOrders) ? workOrders : []) {
    const status = normalizeAdminWorkStatus(order?.status);
    summary.all += 1;
    if (status === 'OPEN') summary.open += 1;
    else if (status === 'ASSIGNED') summary.assigned += 1;
    else if (status === 'IN_PROGRESS') summary.inProgress += 1;
    else if (status === 'SUBMITTED') summary.submitted += 1;
    else if (status === 'REJECTED') summary.rejected += 1;
    else if (ADMIN_TERMINAL_WORK_STATUSES.has(status)) summary.finished += 1;
  }
  return summary;
}

function localDayWindow(now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(-1);
  return { start: start.getTime(), end: end.getTime() };
}

export function workOrderMatchesAttention(order, attention, now = Date.now()) {
  const normalized = metricKey(attention);
  if (!normalized) return true;
  if (ADMIN_TERMINAL_WORK_STATUSES.has(normalizeAdminWorkStatus(order?.status))) return false;
  if (normalized === 'HIGH') return metricKey(order?.priority) === 'HIGH';

  const dueAt = new Date(order?.dueAt || 0).getTime();
  if (!Number.isFinite(dueAt) || dueAt <= 0) return false;
  if (normalized === 'OVERDUE') return dueAt < now;

  const { end } = localDayWindow(now);
  if (normalized === 'DUE_TODAY') return dueAt >= now && dueAt <= end;
  if (normalized === 'UPCOMING') {
    const upcomingEnd = new Date(end);
    upcomingEnd.setDate(upcomingEnd.getDate() + 7);
    return dueAt > end && dueAt <= upcomingEnd.getTime();
  }
  return true;
}

export function adminWorkAttentionSummary(workOrders = [], now = Date.now()) {
  const orders = Array.isArray(workOrders) ? workOrders : [];
  return {
    overdue: orders.filter(order => workOrderMatchesAttention(order, 'OVERDUE', now)).length,
    dueToday: orders.filter(order => workOrderMatchesAttention(order, 'DUE_TODAY', now)).length,
    upcoming: orders.filter(order => workOrderMatchesAttention(order, 'UPCOMING', now)).length,
    high: orders.filter(order => workOrderMatchesAttention(order, 'HIGH', now)).length
  };
}

export function alertAcknowledgementAction(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'ACTIVE') {
    return {
      label: '确认收到',
      successMessage: '已确认收到，告警继续保留，方便后续处理'
    };
  }
  if (normalized === 'ESCALATED') {
    return {
      label: '降级处理',
      successMessage: '告警已降级为已确认，继续保留以便后续处理'
    };
  }
  return null;
}

export function selectAuthorizedFarm(farms = [], requestedFarmId = '') {
  const list = Array.isArray(farms) ? farms.filter(farm => farm?.farmId) : [];
  return list.find(farm => farm.farmId === requestedFarmId)?.farmId || list[0]?.farmId || '';
}

export function isLatestFarmResponse(requestVersion, currentVersion, farmId, currentFarmId) {
  return requestVersion === currentVersion && Boolean(farmId) && farmId === currentFarmId;
}

export function hasFarmPlotRefresh(results = {}) {
  return ['overview', 'plots'].some(key => results?.[key]?.status === 'fulfilled');
}

export function formatHealthScore(value) {
  if (value === undefined || value === null || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return String(Math.round(numeric <= 1 ? numeric * 100 : numeric));
}

export function adminHealthTone(value) {
  if (value === undefined || value === null || value === '') return 'unavailable';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'unavailable';
  const percent = Math.round(numeric <= 1 ? numeric * 100 : numeric);
  if (percent >= 86) return 'good';
  if (percent >= 55) return 'attention';
  return 'danger';
}

export function normalizeAdminTab(view, tab) {
  const allowed = ADMIN_TABS[view] || [];
  return allowed.includes(tab) ? tab : (allowed[0] || '');
}

export function adminSummary({ plots = [], workOrders = [] } = {}, now = Date.now()) {
  const activePlots = (plots || []).filter(plot => String(plot?.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');
  const activeWork = (workOrders || []).filter(item => !['DONE', 'COMPLETED', 'CANCELLED'].includes(String(item?.status || '').toUpperCase()));
  const abnormal = activePlots.filter(plot => {
    if (['OFFLINE', 'ERROR', 'FATAL', 'BAD'].includes(String(plot?.deviceStatus || '').toUpperCase())) return true;
    if (['WARN', 'WARNING', 'HIGH', 'CRITICAL', 'DANGER'].includes(String(plot?.riskLevel || '').toUpperCase())) return true;
    return Object.values(plot?.metrics || {}).some(metric => ['WARN', 'WARNING', 'DEGRADED', 'LOW', 'HIGH', 'ERROR', 'DANGER', 'CRITICAL', 'BAD', 'OFFLINE']
      .includes(String(metric?.status || '').toUpperCase()));
  }).length;
  return {
    today: workOrders.length,
    overdue: activeWork.filter(item => {
      const due = new Date(item?.dueAt || 0).getTime();
      return Number.isFinite(due) && due > 0 && due < now;
    }).length,
    abnormal,
    unassigned: activeWork.filter(item => !item?.assigneeId).length,
    approval: activeWork.filter(item => String(item?.actionType || '').toUpperCase() === 'IRRIGATION_REVIEW').length
  };
}

const MANAGER_SUMMARY_TARGETS = Object.freeze({
  today: { view: 'work-orders', params: { tab: 'tasks', scope: 'today' } },
  overdue: { view: 'work-orders', params: { tab: 'tasks', scope: 'overdue' } },
  abnormal: { view: 'decision-console', params: { section: 'alerts' } },
  unassigned: { view: 'work-orders', params: { tab: 'tasks', scope: 'unassigned' } },
  approval: { view: 'work-orders', params: { tab: 'tasks', scope: 'approval' } }
});

const WORK_SUMMARY_SCOPES = new Set(['today', 'overdue', 'unassigned', 'approval']);
const TERMINAL_WORK_STATUSES = new Set(['DONE', 'COMPLETED', 'CANCELLED']);

export function managerSummaryTarget(summaryId, farmId = '') {
  const target = MANAGER_SUMMARY_TARGETS[String(summaryId || '').toLowerCase()];
  if (!target) return null;
  return {
    view: target.view,
    params: { ...target.params, ...(farmId ? { farmId } : {}) }
  };
}

export function normalizeWorkSummaryScope(scope) {
  const normalized = String(scope || '').trim().toLowerCase();
  return WORK_SUMMARY_SCOPES.has(normalized) ? normalized : '';
}

export function workOrderMatchesSummaryScope(order, scope, now = Date.now()) {
  const normalizedScope = normalizeWorkSummaryScope(scope);
  if (!normalizedScope || normalizedScope === 'today') return true;
  const status = String(order?.status || '').trim().toUpperCase();
  if (TERMINAL_WORK_STATUSES.has(status)) return false;
  if (normalizedScope === 'unassigned') return !order?.assigneeId;
  if (normalizedScope === 'approval') return String(order?.actionType || '').trim().toUpperCase() === 'IRRIGATION_REVIEW';
  const dueAt = new Date(order?.dueAt || 0).getTime();
  return normalizedScope === 'overdue' && Number.isFinite(dueAt) && dueAt > 0 && dueAt < now;
}

export function domainsForEventType(type = '') {
  const value = String(type).toLowerCase();
  const domains = new Set();
  if (value.includes('plot.')) { domains.add('plots'); domains.add('overview'); }
  if (value.includes('workorder') || value.includes('work-order') || value.includes('cropplan')) { domains.add('workOrders'); domains.add('overview'); }
  if (value.includes('alert')) { domains.add('alerts'); domains.add('overview'); }
  if (value.includes('device') || value.includes('telemetry')) { domains.add('devices'); domains.add('plots'); domains.add('overview'); }
  if (value.includes('member')) domains.add('members');
  if (value.includes('inspection')) domains.add('inspections');
  if (value.includes('cropbatch') || value.includes('cropplan')) domains.add('batches');
  if (value.includes('valueledger') || value.includes('evaluation') || value.includes('command.ack')) domains.add('ledgers');
  if (value.includes('resource') || value.includes('water.balance') || value.includes('irrigation.plan')) {
    domains.add('resourceProfiles'); domains.add('resourcePlans'); domains.add('overview');
  }
  if (value.includes('command.approved') || value.includes('evaluation')) {
    domains.add('resourcePlans'); domains.add('resourceProfiles'); domains.add('workOrders'); domains.add('ledgers'); domains.add('overview');
  }
  return [...domains];
}

export function mergeFarmPlots(plotFacts = [], overviewCards = [], devices = []) {
  const cards = new Map((overviewCards || []).map(card => [String(card.plotId), card]));
  const plotDevices = new Map();
  (devices || []).forEach(device => {
    const plotId = String(device?.plotId || '');
    if (!plotId) return;
    const current = plotDevices.get(plotId);
    const candidateOnline = String(device?.status || '').toUpperCase() === 'ONLINE';
    const currentOnline = String(current?.status || '').toUpperCase() === 'ONLINE';
    const candidateTime = new Date(device?.lastSeen || device?.boundAt || 0).getTime();
    const currentTime = new Date(current?.lastSeen || current?.boundAt || 0).getTime();
    if (!current || (candidateOnline && !currentOnline) || (candidateOnline === currentOnline && candidateTime > currentTime)) {
      plotDevices.set(plotId, device);
    }
  });
  return (plotFacts || []).map(fact => {
    const card = cards.get(String(fact.plotId)) || {};
    const cardDevice = card.device && Object.keys(card.device).length ? card.device : null;
    const device = cardDevice || plotDevices.get(String(fact.plotId)) || null;
    const hasBoundDevice = Boolean(device?.deviceId || device?.plotId);
    const metrics = { ...(fact.metrics || {}), ...(card.metrics || {}) };
    Object.entries(card.latest || {}).forEach(([code, event]) => {
      if (!event || event.value === undefined) return;
      metrics[code] = {
        ...(metrics[code] || { label: code, target: '—' }),
        value: event.value,
        unit: event.unit || metrics[code]?.unit || '',
        status: event.quality?.status === 'GOOD' ? 'NORMAL' : (event.quality?.status || metrics[code]?.status || 'NORMAL'),
        observedAt: event.ts || event.observedAt || metrics[code]?.observedAt || null,
        provenance: event.provenance || 'OBSERVED',
        sourceMode: event.sourceMode || metrics[code]?.sourceMode || 'SIMULATION',
        dataOrigin: event.dataOrigin || metrics[code]?.dataOrigin || 'BACKEND'
      };
    });
    return {
      ...fact,
      ...card,
      metrics,
      history: fact.history || card.history || {},
      deviceId: device?.deviceId || card.deviceId || fact.deviceId || null,
      deviceStatus: device?.status || card.deviceStatus || fact.deviceStatus || (hasBoundDevice ? 'OFFLINE' : 'UNKNOWN'),
      healthScore: device?.healthScore ?? card.healthScore ?? fact.healthScore ?? null,
      lastSeen: device?.lastSeen || (hasBoundDevice ? '设备已绑定，等待首次数据' : (card.lastSeen || fact.lastSeen || null)),
      sourceMode: fact.sourceMode || card.sourceMode || Object.values(metrics).find(metric => metric?.sourceMode)?.sourceMode || 'SIMULATION',
      dataOrigin: fact.dataOrigin || card.dataOrigin || Object.values(metrics).find(metric => metric?.dataOrigin)?.dataOrigin || 'BACKEND'
    };
  });
}

export function routeHash(view, params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return entries.length
    ? `#${new URLSearchParams({ view, ...Object.fromEntries(entries) }).toString()}`
    : `#${view}`;
}
