/**
 * Shared deterministic primitives for Task 5 (forecast / replay / value).
 *
 * The UI deliberately keeps these helpers dependency-free so the same
 * snapshot can be replayed in a disconnected demo and in the live dashboard.
 */

export const TASK5_SCENARIOS = [
  { id: 'drought', icon: '☀️', label: '持续干旱', short: '缺水斜率加速', tone: 'amber' },
  { id: 'heatwave', icon: '🔥', label: '极端热浪', short: '蒸散快速上升', tone: 'red' },
  { id: 'heavy-rain', icon: '🌧️', label: '暴雨积水', short: '过湿与涝害', tone: 'blue' },
  { id: 'sensor-drift', icon: '⚠️', label: '传感器零点漂移', short: '观测可信度下降', tone: 'purple' },
  { id: 'device-offline', icon: '🔌', label: '设备断网离线', short: '数据窗口冻结', tone: 'slate' }
];

export const PROVENANCE = {
  OBSERVED: '观测',
  USER_PROVIDED: '人工输入',
  DERIVED: '确定性推导',
  SIMULATED: '情景模拟',
  ESTIMATED: '估算'
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatNumber(value, digits = 0) {
  const parsed = toNumber(value, 0);
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(parsed);
}

export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${formatNumber(toNumber(value) * (Math.abs(toNumber(value)) <= 1 ? 100 : 1), digits)}%`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A small, reproducible PRNG. Never use Math.random for replayed evidence. */
export function seededRandom(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scenarioConfig(scenario) {
  return {
    drought: { decay: 0.62, boost: 5.8, actionAt: 30, noise: 0.22 },
    heatwave: { decay: 0.98, boost: 6.8, actionAt: 30, noise: 0.34 },
    'heavy-rain': { decay: -0.68, boost: -4.5, actionAt: 20, noise: 0.30 },
    'sensor-drift': { decay: 0.08, boost: 2.2, actionAt: 30, noise: 0.12 },
    'device-offline': { decay: 0.12, boost: 2.8, actionAt: 40, noise: 0.08 }
  }[scenario] || { decay: 0.42, boost: 10, actionAt: 30, noise: 0.22 };
}

function simulateBranch({ scenario, seed, startValue, branch, points = 25 }) {
  const random = seededRandom(`${scenario}:${seed}`);
  const config = scenarioConfig(scenario);
  const start = clamp(toNumber(startValue, 24), 8, 45);
  const result = [];
  let value = start;

  for (let index = 0; index < points; index += 1) {
    const minute = index * 10;
    const noise = (random() - 0.5) * config.noise;
    const actionActive = branch === 'EXECUTE' && minute >= config.actionAt;

    if (scenario === 'heavy-rain') {
      value += branch === 'EXECUTE' && minute >= config.actionAt ? 0.15 : 0.72;
    } else if (scenario === 'sensor-drift') {
      // The physical state is stable, but the reported signal drifts. Keeping
      // the series deterministic makes the uncertainty itself inspectable.
      value += branch === 'EXECUTE' && actionActive ? 0.06 : -config.decay;
    } else if (scenario === 'device-offline') {
      value += branch === 'EXECUTE' && actionActive ? 0.12 : -config.decay;
    } else if (actionActive) {
      value += config.boost / 8 - config.decay * 0.18;
    } else {
      value -= config.decay;
    }

    value += noise;
    value = clamp(value, 5.5, 48);

    const uncertainty = scenario === 'sensor-drift'
      ? 2.8 + index * 0.08
      : scenario === 'device-offline'
        ? 1.7 + index * 0.1
        : 0.55 + index * 0.035;

    result.push({
      minute,
      value: Number(value.toFixed(2)),
      lower: Number(clamp(value - uncertainty, 0, 50).toFixed(2)),
      upper: Number(clamp(value + uncertainty, 0, 50).toFixed(2)),
      actionActive,
      quality: scenario === 'sensor-drift' || scenario === 'device-offline' ? 'DEGRADED' : 'GOOD'
    });
  }

  return result;
}

function branchSummary(series, branch) {
  const threshold = 20;
  const firstRisk = series.find(point => point.value < threshold);
  const recovery = firstRisk ? series.find(point => point.minute > firstRisk.minute && point.value >= threshold) : null;
  const final = series[series.length - 1] || { value: null };
  const min = series.reduce((acc, point) => Math.min(acc, point.value), Infinity);
  return {
    branchId: branch,
    eventCount: series.length,
    soilSamples: series.length,
    soilMean: series.length ? Number((series.reduce((sum, point) => sum + point.value, 0) / series.length).toFixed(2)) : null,
    soilMin: Number.isFinite(min) ? Number(min.toFixed(2)) : null,
    finalMoisture: final.value,
    timeToRiskMinutes: firstRisk ? firstRisk.minute : null,
    recoveryTimeMinutes: recovery ? recovery.minute - firstRisk.minute : null,
    riskAvoided: !firstRisk || Boolean(recovery),
    provenance: 'SIMULATED'
  };
}

/**
 * Build both branches from one frozen snapshot. The same `scenario + seed`
 * always produces byte-for-byte equivalent numeric values.
 */
export function buildScenarioSeries({ scenario = 'drought', seed = 42, startValue = 24, points = 25 } = {}) {
  const execute = simulateBranch({ scenario, seed, startValue, branch: 'EXECUTE', points });
  const noAction = simulateBranch({ scenario, seed, startValue, branch: 'NO_ACTION', points });
  return {
    scenario,
    seed: Number(seed),
    threshold: 20,
    points: execute.map((point, index) => ({
      minute: point.minute,
      execute: point,
      noAction: noAction[index]
    })),
    branches: {
      EXECUTE: branchSummary(execute, 'EXECUTE'),
      NO_ACTION: branchSummary(noAction, 'NO_ACTION')
    },
    snapshotHash: hashSeed(`${scenario}:${seed}:${startValue}`).toString(16)
  };
}

export function scenarioLabel(scenario) {
  return TASK5_SCENARIOS.find(item => item.id === scenario)?.label || scenario;
}

export function provenanceBadge(source) {
  const label = PROVENANCE[source] || source || '未标注';
  return `<span class="task5-source-badge" data-source="${escapeHtml(source)}">${escapeHtml(source)} · ${escapeHtml(label)}</span>`;
}

export function chartPath(points, xScale, yScale, valueKey = 'value') {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(point.minute).toFixed(2)} ${yScale(point[valueKey]).toFixed(2)}`).join(' ');
}

export function chartAreaPath(points, xScale, yScale, lowerKey = 'lower', upperKey = 'upper') {
  if (!points.length) return '';
  const upper = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(point.minute).toFixed(2)} ${yScale(point[upperKey]).toFixed(2)}`).join(' ');
  const lower = [...points].reverse().map(point => `L ${xScale(point.minute).toFixed(2)} ${yScale(point[lowerKey]).toFixed(2)}`).join(' ');
  return `${upper} ${lower} Z`;
}
