/**
 * Lightweight canvas line charts for telemetry time series.
 */

export const TELEMETRY_METRICS = [
  { code: 'SOIL_MOISTURE', label: '土壤湿度', unit: '%', color: '#3fb950', targetLow: 20, targetHigh: 45 },
  { code: 'AIR_TEMPERATURE', label: '空气温度', unit: '°C', color: '#f85149', targetLow: 18, targetHigh: 32 },
  { code: 'LIGHT', label: '光照强度', unit: 'lux', color: '#d29922', targetLow: null, targetHigh: null },
  { code: 'CO2', label: 'CO2 浓度', unit: 'ppm', color: '#58a6ff', targetLow: 350, targetHigh: 1200 },
  { code: 'PH', label: '土壤 pH', unit: 'pH', color: '#a371f7', targetLow: 5.5, targetHigh: 7.2 },
  { code: 'WATER_LEVEL', label: '水箱水位', unit: '%', color: '#39c5cf', targetLow: 20, targetHigh: 100 },
];

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
