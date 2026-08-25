/**
 * Lightweight canvas line charts for telemetry time series.
 */

export const TELEMETRY_METRICS = [
  { code: 'SOIL_MOISTURE', label: '土壤湿度', unit: '%', color: '#3fb950', targetLow: 20, targetHigh: 45 },
  { code: 'AIR_TEMPERATURE', label: '空气温度', unit: '°C', color: '#f85149', targetLow: 18, targetHigh: 32 },
  { code: 'LIGHT', label: '光照强度', unit: 'lux', color: '#d29922', targetLow: 10000, targetHigh: 70000 },
  { code: 'CO2', label: 'CO2 浓度', unit: 'ppm', color: '#58a6ff', targetLow: 350, targetHigh: 1200 },
  { code: 'PH', label: '土壤 pH', unit: 'pH', color: '#a371f7', targetLow: 5.5, targetHigh: 7.2 },
  { code: 'WATER_LEVEL', label: '水箱水位', unit: '%', color: '#39c5cf', targetLow: 20, targetHigh: 100 },
];

/** Parse "20~40%" / "10k~70k lux" or fall back to metric defaults. Do not invent a band. */
export function parseTargetRange(targetText, meta = {}) {
  const text = String(targetText || '').replace(/,/g, '');
  const match = text.match(/([\d.]+)\s*(k)?\s*[~～\-—至到]\s*([\d.]+)\s*(k)?/i);
  if (match) {
    const low = Number(match[1]) * (match[2] ? 1000 : 1);
    const high = Number(match[3]) * (match[4] ? 1000 : 1);
    if (Number.isFinite(low) && Number.isFinite(high) && high > low) {
      return { low, high, source: 'plot' };
    }
  }
  const low = Number(meta.targetLow);
  const high = Number(meta.targetHigh);
  if (Number.isFinite(low) && Number.isFinite(high) && high > low) {
    return { low, high, source: 'default' };
  }
  return null;
}

export function formatMetricNumber(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (unit === 'lux' || Math.abs(n) >= 1000) return Math.round(n).toLocaleString('zh-CN');
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return n.toFixed(1);
}

/**
 * Compare latest reading with the standard band.
 * Returns null when value or band is unavailable (never guess).
 * level: alert = already outside, warn = approaching boundary / plot WARN.
 */
export function assessMetricRisk(meta, series = [], plotMetric) {
  const latest = series.length ? Number(series[series.length - 1].value) : Number(plotMetric?.value);
  if (!Number.isFinite(latest)) return null;
  const range = parseTargetRange(plotMetric?.target, meta);
  if (!range) return null;

  const { low, high } = range;
  const span = high - low;
  const margin = span * 0.15;
  let level = 'ok';
  let side = null;
  if (latest < low) {
    level = 'alert';
    side = 'low';
  } else if (latest > high) {
    level = 'alert';
    side = 'high';
  } else if (latest <= low + margin) {
    level = 'warn';
    side = 'low';
  } else if (latest >= high - margin) {
    level = 'warn';
    side = 'high';
  }

  if (level === 'ok' && series.length >= 5) {
    const window = series.slice(-6);
    const first = Number(window[0].value);
    const last = Number(window[window.length - 1].value);
    if (Number.isFinite(first) && Number.isFinite(last)) {
      const delta = last - first;
      if ((latest - low) / span <= 0.28 && delta < -span * 0.04) {
        level = 'warn';
        side = 'low';
      } else if ((high - latest) / span <= 0.28 && delta > span * 0.04) {
        level = 'warn';
        side = 'high';
      }
    }
  }

  const status = String(plotMetric?.status || '').toUpperCase();
  if (level === 'ok' && (status === 'WARN' || status === 'ALERT' || status === 'CRITICAL')) {
    level = status === 'WARN' ? 'warn' : 'alert';
    side = latest < (low + high) / 2 ? 'low' : 'high';
  }

  const unit = plotMetric?.unit || meta.unit || '';
  const label = plotMetric?.label || meta.label || meta.code;
  const fmt = (v) => `${formatMetricNumber(v, unit)}${unit ? ` ${unit}` : ''}`;
  let hint = `标准区间 ${fmt(low)} ~ ${fmt(high)}`;
  if (level === 'alert' && side === 'low') hint = `已低于下限 ${fmt(low)} · 标准 ${fmt(low)} ~ ${fmt(high)}`;
  else if (level === 'alert' && side === 'high') hint = `已高于上限 ${fmt(high)} · 标准 ${fmt(low)} ~ ${fmt(high)}`;
  else if (level === 'warn' && side === 'low') hint = `接近下限 ${fmt(low)} · 标准 ${fmt(low)} ~ ${fmt(high)}`;
  else if (level === 'warn' && side === 'high') hint = `接近上限 ${fmt(high)} · 标准 ${fmt(low)} ~ ${fmt(high)}`;

  return {
    code: meta.code,
    label,
    unit,
    value: latest,
    low,
    high,
    level,
    side,
    hint,
    displayValue: formatMetricNumber(latest, unit)
  };
}

export function groupByMetric(points) {
  const map = {};
  for (const p of points || []) {
    const m = p.metric;
    if (!m) continue;
    if (!map[m]) map[m] = [];
    map[m].push(p);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  }
  return map;
}

export function drawLineChart(canvas, series, options = {}) {
  if (!canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 2 || h < 2) {
    const retries = (canvas._drawRetries || 0) + 1;
    canvas._drawRetries = retries;
    if (retries <= 12) {
      requestAnimationFrame(() => drawLineChart(canvas, series, options));
    }
    return;
  }
  canvas._drawRetries = 0;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, w, h);

  const values = series.map((p) => Number(p.value)).filter((v) => !Number.isNaN(v));
  if (!values.length) {
    ctx.fillStyle = '#8b949e';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('暂无数据', 44, 14 + (h - 14 - 28) / 2);
    return;
  }

  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (options.targetLow != null) yMin = Math.min(yMin, options.targetLow);
  if (options.targetHigh != null) yMax = Math.max(yMax, options.targetHigh);
  const yPad = (yMax - yMin) * 0.12 || 1;
  yMin -= yPad;
  yMax += yPad;

  const yLabelChars = Math.max(Math.abs(yMax), Math.abs(yMin)).toFixed(1).length;
  const pad = { top: 14, right: 16, bottom: 28, left: Math.max(44, yLabelChars * 6 + 12) };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const toX = (i) => pad.left + (series.length <= 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const toY = (v) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  // grid
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
    const val = yMax - ((yMax - yMin) * i) / 4;
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(1), pad.left - 6, y + 3);
  }

  // target band
  if (options.targetLow != null && options.targetHigh != null) {
    const yTop = toY(options.targetHigh);
    const yBot = toY(options.targetLow);
    ctx.fillStyle = 'rgba(63, 185, 80, 0.12)';
    ctx.fillRect(pad.left, yTop, plotW, yBot - yTop);
  }

  // line
  ctx.strokeStyle = options.color || '#58a6ff';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  series.forEach((p, i) => {
    const x = toX(i);
    const y = toY(Number(p.value));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // last point
  const last = series[series.length - 1];
  const lx = toX(series.length - 1);
  const ly = toY(Number(last.value));
  ctx.fillStyle = options.color || '#58a6ff';
  ctx.beginPath();
  ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fill();

  // time labels (first & last)
  ctx.fillStyle = '#8b949e';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const fmt = (ts) => {
    try {
      return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };
  if (series[0]?.ts) {
    ctx.textAlign = 'left';
    ctx.fillText(fmt(series[0].ts), toX(0), h - 8);
  }
  if (last?.ts && series.length > 1) {
    ctx.textAlign = 'right';
    ctx.fillText(fmt(last.ts), lx, h - 8);
  }
}
