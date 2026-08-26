export const ADMIN_TABS = Object.freeze({
  dashboard: ['overview'],
  'work-orders': ['tasks', 'plans', 'crop-packs'],
  'resource-coordination': ['devices', 'irrigation', 'value', 'simulator'],
  'farm-members': ['members']
});

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
