/**
 * Shared plot presentation rules.
 *
 * Plot data arrives from several backends and its object insertion order is
 * not a UI contract. Keep the farmer and admin cards anchored to these
 * stable codes instead of iterating arbitrary object keys.
 */
export const PLOT_METRIC_CODES = Object.freeze([
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

function stableText(value) {
  return String(value ?? '').trim();
}

function stablePlotId(plot) {
  return stableText(plot?.plotId || plot?.id);
}

function compareStableText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Return a copy in a deterministic order without changing the caller's array. */
export function stablePlotSort(plots = []) {
  return (Array.isArray(plots) ? plots : []).slice().sort((left, right) => (
    compareStableText(stablePlotId(left), stablePlotId(right))
  ));
}

export function normalizePlotOrder(order = []) {
  const seen = new Set();
  return (Array.isArray(order) ? order : [])
    .map(stableText)
    .filter((plotId) => plotId && !seen.has(plotId) && seen.add(plotId));
}

/**
 * Move one plot to the position occupied by another plot. Moving forward
 * places it after the target; moving backward places it before the target,
 * which matches the visual result users expect when dropping onto a card.
 */
export function movePlotOrder(order = [], sourcePlotId = '', targetPlotId = '') {
  const normalized = normalizePlotOrder(order);
  const sourceId = stableText(sourcePlotId);
  const targetId = stableText(targetPlotId);
  const sourceIndex = normalized.indexOf(sourceId);
  const targetIndex = normalized.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return normalized;
  const next = normalized.slice();
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

/** Keep farm-manager ordering isolated by both signed-in account and farm. */
export function managerPlotOrderStorageKey(user = {}, farmId = '') {
  const account = stableText(user?.userId || user?.id || user?.username) || 'anonymous';
  const farm = stableText(farmId) || 'unassigned';
  return `agriloop_manager_plot_order:${encodeURIComponent(account)}:${encodeURIComponent(farm)}`;
}

/**
 * Apply a saved order to the currently visible plots. Missing/new plots are
 * appended in stable plot-id order, so assignment changes cannot reshuffle
 * the cards on their own.
 */
export function reconcilePlotOrder(plots = [], savedOrder = []) {
  const available = new Map((Array.isArray(plots) ? plots : []).map((plot) => [stablePlotId(plot), plot]));
  const ordered = [];
  const seen = new Set();
  normalizePlotOrder(savedOrder).forEach((plotId) => {
    const plot = available.get(plotId);
    if (!plot || seen.has(plotId)) return;
    seen.add(plotId);
    ordered.push(plot);
  });
  stablePlotSort((Array.isArray(plots) ? plots : []).filter((plot) => !seen.has(stablePlotId(plot))))
    .forEach((plot) => ordered.push(plot));
  return ordered;
}

function normalizeMetric(code, metric, available) {
  const source = metric && typeof metric === 'object' ? metric : {};
  const value = source.value === undefined || source.value === null ? null : source.value;
  return {
    ...source,
    code,
    value,
    label: source.label || code,
    unit: source.unit || '',
    target: source.target || '—',
    status: source.status || (available && value !== null ? 'UNKNOWN' : 'UNAVAILABLE'),
    available: Boolean(available && value !== null)
  };
}

/**
 * Return the card metric slots in the shared order. Unknown future metrics
 * remain visible after the eleven P0 slots, sorted by code.
 */
export function orderedPlotMetrics(plot = {}) {
  const metrics = plot?.metrics && typeof plot.metrics === 'object' ? plot.metrics : {};
  const known = new Set(PLOT_METRIC_CODES);
  const result = PLOT_METRIC_CODES.map((code) => normalizeMetric(code, metrics[code], metrics[code] != null));
  Object.keys(metrics)
    .filter((code) => !known.has(code))
    .sort(compareStableText)
    .forEach((code) => result.push(normalizeMetric(code, metrics[code], true)));
  return result;
}

export function plotMetricValue(metric) {
  return metric?.value === undefined || metric?.value === null || metric?.value === '' ? '—' : metric.value;
}
