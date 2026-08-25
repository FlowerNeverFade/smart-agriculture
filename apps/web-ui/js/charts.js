/**
 * AgriLoop Frontend - Pure SVG Chart Kit
 * 零外部依赖：离线演示模式下同样可渲染（无需 ECharts CDN）
 * 提供：折线+置信带 / 分组柱状+偏差线 / 双面积反事实 / 半圆仪表盘
 */

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/** 确定性伪随机数生成器（mulberry32）：同一 Seed 结果完全可重复 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
  const dSpan = domainMax - domainMin || 1;
  return v => rangeMin + ((v - domainMin) / dSpan) * (rangeMax - rangeMin);
}

/**
 * 按需加载 ECharts（vendor/echarts.min.js，约 1MB）：
 * 首页不再同步下载 1MB 库，仅在首次渲染图表时才动态注入 <script>。
 * 已存在（页面预先加载/测试环境注入）时直接复用。
 * 注入 3 秒未完成则回退纯 SVG 渲染（离线/异常环境不至于卡死）。
 */
let echartsLoading = null;
function ensureEcharts() {
  if (typeof window !== 'undefined' && window.echarts) return Promise.resolve(window.echarts);
  if (!echartsLoading) {
    echartsLoading = new Promise((resolve) => {
      try {
        if (typeof document === 'undefined' || !document.head) {
          resolve(null);
          return;
        }
        const script = document.createElement('script');
        script.src = new URL('../vendor/echarts.min.js', import.meta.url).href;
        const timer = setTimeout(() => {
          console.warn('ECharts load timeout, using SVG fallback');
          resolve(null);
        }, 1500);
        script.onload = () => {
          clearTimeout(timer);
          resolve(window.echarts || null);
        };
        script.onerror = () => {
          clearTimeout(timer);
          console.warn('ECharts load failed, using SVG fallback');
          resolve(null);
        };
        document.head.appendChild(script);
      } catch (error) {
        console.warn('ECharts inject failed, using SVG fallback:', error);
        resolve(null);
      }
    });
  }
  return echartsLoading;
}

/**
 * 安全初始化 ECharts（异步：首次调用会按需加载 vendor 库）：
 *  - echarts 不可用           -> 返回 null（调用方回退纯 SVG 渲染）
 *  - 当前环境不支持 canvas 2D -> 使用 ECharts 官方 SVG renderer（jsdom/低端环境）
 *  - 初始化异常               -> 返回 null（调用方回退纯 SVG 渲染）
 */
function isCanvasSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext && c.getContext('2d'));
  } catch (e) {
    return false;
  }
}

export async function initEChart(el) {
  if (!el || (typeof el.isConnected === 'boolean' && !el.isConnected)) return null;
  try {
    const echarts = await ensureEcharts();
    if (!echarts || !el.isConnected) return null;
    return echarts.init(el, null, isCanvasSupported() ? undefined : { renderer: 'svg' });
  } catch (e) {
    console.warn('ECharts init failed, falling back to SVG renderer:', e);
    return null;
  }
}

/**
 * 自定义 HTML Tooltip（替代 ECharts 原生 tooltip）
 * 原生 tooltip 容器样式由 ECharts 内部生成，部分浏览器中尺寸行为不可控；
 * 这里把浮窗挂到 body（position: fixed），尺寸/样式完全自控，内容按数据自适应。
 * @param chart       echarts 实例
 * @param getContent  (params) => html 字符串；返回 null 时不显示
 * @returns cleanup 函数（移除浮窗与监听）
 */
export function attachCustomTip(chart, getContent) {
  if (!chart || typeof chart.on !== 'function') return () => {}; // 无事件能力的环境（stub/SVG）直接跳过
  let tipEl = null;

  const ensureTip = () => {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'agri-custom-tip';
      document.body.appendChild(tipEl);
    }
    return tipEl;
  };

  const hide = () => {
    if (tipEl) tipEl.style.display = 'none';
  };

  const onMove = (params) => {
    if (!params || !params.event) return hide();
    const dataIndex = params.dataIndex;
    const content = dataIndex == null ? null : getContent(params);
    if (content == null) return hide();
    const tip = ensureTip();
    // 两阶段显示：先隐藏并完成定位，最后再可见，
    // 避免"先出现空黑/错位帧"（未就绪状态被绘制出来）
    tip.style.visibility = 'hidden';
    tip.innerHTML = content;
    tip.style.display = 'block';
    // 定位：跟随鼠标，超出视口时翻转
    const rect = chart.getDom().getBoundingClientRect();
    const px = rect.left + (params.event.offsetX || 0);
    const py = rect.top + (params.event.offsetY || 0);
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = px + 14;
    let top = py + 14;
    if (left + tw > window.innerWidth - 4) left = px - tw - 14;
    if (top + th > window.innerHeight - 4) top = py - th - 14;
    tip.style.left = Math.max(4, left) + 'px';
    tip.style.top = Math.max(4, top) + 'px';
    tip.style.visibility = 'visible';
  };

  chart.on('mousemove', onMove);
  chart.on('mouseout', hide);
  chart.on('mousedown', hide);

  return () => {
    chart.off('mousemove', onMove);
    chart.off('mouseout', hide);
    chart.off('mousedown', hide);
    if (tipEl && tipEl.parentNode) tipEl.parentNode.removeChild(tipEl);
    tipEl = null;
  };
}

function niceTicks(min, max, count) {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / count / step;
  const mag = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const s = step * mag;
  const ticks = [];
  for (let v = Math.ceil(min / s) * s; v <= max + s * 0.001; v += s) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return ticks;
}

function svgPolyline(points, scaleX, scaleY, attrs = '') {
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(p[0]).toFixed(2)},${scaleY(p[1]).toFixed(2)}`).join(' ');
  return `<path d="${d}" fill="none" ${attrs}/>`;
}

function svgArea(points, scaleX, scaleY, baselineY, attrs = '') {
  if (!points.length) return '';
  const d = `${svgPolyline(points, scaleX, scaleY)}L${scaleX(points[points.length - 1][0]).toFixed(2)},${baselineY.toFixed(2)}L${scaleX(points[0][0]).toFixed(2)},${baselineY.toFixed(2)}Z`;
  return `<path d="${d}" ${attrs}/>`;
}

/**
 * 通用折线图（支持置信带、标记线、填充）
 * opts: {
 *   width, height, padding, xMin, xMax, yMin, yMax, yTickCount, xTickCount,
 *   xFmt(v), yFmt(v), yTicks(自定义),
 *   series: [{name, color, points:[[x,y]], dashed, width, fill(opacity), opacity}],
 *   bands: [{upper:[[x,y]], lower:[[x,y]], color, opacity}],
 *   markers: [{x, label, color, dashed}],
 *   yAxisLabel, rightAxis: {ticks, fmt, series: [{color, points}]}
 * }
 */
export function svgLineChart(opts) {
  const { width = 760, height = 320 } = opts;
  const pad = opts.padding || { top: 18, right: 20, bottom: 30, left: 52 };
  const xMin = opts.xMin, xMax = opts.xMax;
  const yMin = opts.yMin, yMax = opts.yMax;
  const sx = linearScale(xMin, xMax, pad.left, width - pad.right);
  const sy = linearScale(yMin, yMax, height - pad.bottom, pad.top);
  const baselineY = sy(yMin);

  let html = `<svg class="agri-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">`;

  // 网格 + Y 轴刻度
  const yTicks = opts.yTicks || niceTicks(yMin, yMax, opts.yTickCount || 5);
  yTicks.forEach(v => {
    if (v < yMin - 1e-9 || v > yMax + 1e-9) return;
    const y = sy(v);
    html += `<line class="chart-grid-line" x1="${pad.left}" y1="${y.toFixed(2)}" x2="${width - pad.right}" y2="${y.toFixed(2)}"/>`;
    html += `<text class="chart-axis-label" x="${(pad.left - 6).toFixed(2)}" y="${(y + 3).toFixed(2)}" text-anchor="end">${opts.yFmt ? opts.yFmt(v) : v}</text>`;
  });
  if (opts.yAxisLabel) {
    html += `<text class="chart-axis-title" x="12" y="${(pad.top + 8).toFixed(2)}">${escapeHtml(opts.yAxisLabel)}</text>`;
  }

  // X 轴刻度
  const xTicks = opts.xTicks || niceTicks(xMin, xMax, opts.xTickCount || 6);
  xTicks.forEach(v => {
    if (v < xMin - 1e-9 || v > xMax + 1e-9) return;
    const x = sx(v);
    html += `<line class="chart-grid-line-v" x1="${x.toFixed(2)}" y1="${pad.top}" x2="${x.toFixed(2)}" y2="${height - pad.bottom}"/>`;
    html += `<text class="chart-axis-label" x="${x.toFixed(2)}" y="${(height - pad.bottom + 16).toFixed(2)}" text-anchor="middle">${opts.xFmt ? opts.xFmt(v) : v}</text>`;
  });

  // 右轴（偏差率等）
  if (opts.rightAxis) {
    const ra = opts.rightAxis;
    const ry = linearScale(ra.min, ra.max, height - pad.bottom, pad.top);
    ra.ticks.forEach(v => {
      const y = ry(v);
      html += `<text class="chart-axis-label chart-axis-right" x="${(width - pad.right + 8).toFixed(2)}" y="${(y + 3).toFixed(2)}">${ra.fmt ? ra.fmt(v) : v}</text>`;
    });
    html += `<line class="chart-axis-right-line" x1="${width - pad.right}" y1="${pad.top}" x2="${width - pad.right}" y2="${height - pad.bottom}"/>`;
    (ra.series || []).forEach(s => {
      html += svgPolyline(s.points, sx, ry, `stroke="${s.color}" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.9"`);
    });
  }

  // 置信带（upper/lower 之间填充）
  (opts.bands || []).forEach(b => {
    if (!b.upper || !b.lower) return;
    html += svgArea(
      [...b.upper.map(p => [p[0], p[1]]).reverse(), ...b.lower.map(p => [p[0], p[1]])],
      sx, sy, sy(b.lower[0][1]),
      `fill="${b.color || '#58a6ff'}" opacity="${b.opacity ?? 0.12}"`
    );
  });

  // 标记线（阈值 / 执行时刻）
  (opts.markers || []).forEach(m => {
    const x = sx(m.x);
    html += `<line class="chart-marker-line" x1="${x.toFixed(2)}" y1="${pad.top}" x2="${x.toFixed(2)}" y2="${height - pad.bottom}" stroke="${m.color || '#d29922'}" stroke-dasharray="${m.dashed === false ? '0' : '6 5'}" opacity="0.9"/>`;
    if (m.label) {
      html += `<text class="chart-marker-label" x="${x.toFixed(2)}" y="${(pad.top + 4).toFixed(2)}" text-anchor="${m.x > (xMin + xMax) / 2 ? 'end' : 'start'}">${escapeHtml(m.label)}</text>`;
    }
  });

  // 横向阈值线（基线 / 胁迫边界等）
  (opts.hMarkers || []).forEach(m => {
    const y = sy(m.y);
    html += `<line class="chart-marker-line" x1="${pad.left}" y1="${y.toFixed(2)}" x2="${width - pad.right}" y2="${y.toFixed(2)}" stroke="${m.color || '#f85149'}" stroke-dasharray="${m.dashed === false ? '0' : '6 5'}" opacity="0.85"/>`;
    if (m.label) {
      html += `<text class="chart-marker-label" x="${(width - pad.right - 4).toFixed(2)}" y="${(y - 4).toFixed(2)}" text-anchor="end">${escapeHtml(m.label)}</text>`;
    }
  });

  // 数据序列
  (opts.series || []).forEach(s => {
    if (s.fill) {
      html += svgArea(s.points, sx, sy, baselineY, `fill="${s.color}" opacity="${s.fill}"`);
    }
    const dash = s.dashed ? ' stroke-dasharray="7 5"' : '';
    html += svgPolyline(s.points, sx, sy, `stroke="${s.color}" stroke-width="${s.width || 2}"${dash} opacity="${s.opacity ?? 1}"`);
    // 数据点
    (s.dots === false ? [] : s.points).forEach(p => {
      html += `<circle class="chart-dot" cx="${sx(p[0]).toFixed(2)}" cy="${sy(p[1]).toFixed(2)}" r="2.4" fill="${s.color}"><title>${escapeHtml(s.name)} @ ${p[0]} : ${p[1]}</title></circle>`;
    });
  });

  html += `</svg>`;
  return html;
}

/**
 * 分组柱状图（支持右侧偏差率折线）
 * opts: { width, height, padding, xLabels:[], yMin, yMax, yFmt,
 *   bars: [{name, color, values:[]}], line: {name, color, values:[]},
 *   lineMin, lineMax, lineFmt, barWidthRatio }
 */
export function svgGroupedBarChart(opts) {
  const { width = 760, height = 320 } = opts;
  const pad = opts.padding || { top: 18, right: 52, bottom: 34, left: 52 };
  const labels = opts.xLabels;
  const n = labels.length;
  const groupW = (width - pad.left - pad.right) / n;
  const barW = Math.min(groupW * 0.28, 26);
  const yMin = opts.yMin || 0, yMax = opts.yMax;
  const sy = linearScale(yMin, yMax, height - pad.bottom, pad.top);
  const baselineY = sy(0);

  let html = `<svg class="agri-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">`;

  const yTicks = opts.yTicks || niceTicks(yMin, yMax, opts.yTickCount || 5);
  yTicks.forEach(v => {
    const y = sy(v);
    html += `<line class="chart-grid-line" x1="${pad.left}" y1="${y.toFixed(2)}" x2="${width - pad.right}" y2="${y.toFixed(2)}"/>`;
    html += `<text class="chart-axis-label" x="${(pad.left - 6).toFixed(2)}" y="${(y + 3).toFixed(2)}" text-anchor="end">${opts.yFmt ? opts.yFmt(v) : v}</text>`;
  });

  const barSeries = opts.bars || [];
  const nBars = barSeries.length;
  labels.forEach((label, i) => {
    const cx = pad.left + groupW * (i + 0.5);
    html += `<text class="chart-axis-label" x="${cx.toFixed(2)}" y="${(height - pad.bottom + 16).toFixed(2)}" text-anchor="middle">${escapeHtml(label)}</text>`;
    barSeries.forEach((s, si) => {
      const v = s.values[i];
      const x = cx - (nBars * barW) / 2 + si * barW;
      const y = sy(Math.max(v, 0));
      const h = Math.max(baselineY - y, 0.5);
      html += `<rect class="chart-bar" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="2" fill="${s.color}" opacity="0.9"><title>${escapeHtml(s.name)} ${escapeHtml(label)}: ${v}</title></rect>`;
    });
  });

  if (opts.line) {
    const l = opts.line;
    const ry = linearScale(opts.lineMin, opts.lineMax, height - pad.bottom, pad.top);
    const pts = l.values.map((v, i) => [pad.left + groupW * (i + 0.5), ry(v)]);
    html += `<line class="chart-axis-right-line" x1="${width - pad.right}" y1="${pad.top}" x2="${width - pad.right}" y2="${height - pad.bottom}"/>`;
    (opts.lineTicks || niceTicks(opts.lineMin, opts.lineMax, 5)).forEach(v => {
      html += `<text class="chart-axis-label chart-axis-right" x="${(width - pad.right + 8).toFixed(2)}" y="${(ry(v) + 3).toFixed(2)}">${opts.lineFmt ? opts.lineFmt(v) : v}</text>`;
    });
    html += svgPolyline(pts, v => v, v => v, `stroke="${l.color}" stroke-width="1.8" stroke-dasharray="5 4"`);
    pts.forEach(p => html += `<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="3" fill="${l.color}"><title>${escapeHtml(l.name)}: ${l.values[pts.indexOf(p)]}</title></circle>`);
  }

  html += `</svg>`;
  return html;
}

/**
 * 双面积反事实图（两条面积曲线，差值即节约）
 * opts: { width, height, padding, xLabels, series:[{name,color,values}], yMin, yMax, yFmt }
 */
export function svgAreaChart(opts) {
  const { width = 760, height = 320 } = opts;
  const pad = opts.padding || { top: 18, right: 20, bottom: 34, left: 56 };
  const labels = opts.xLabels;
  const n = labels.length;
  const yMin = opts.yMin || 0, yMax = opts.yMax;
  const sy = linearScale(yMin, yMax, height - pad.bottom, pad.top);
  const sx = linearScale(0, n - 1, pad.left, width - pad.right);
  const baselineY = sy(yMin);
  const toPts = values => values.map((v, i) => [i, v]);

  let html = `<svg class="agri-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">`;

  const yTicks = opts.yTicks || niceTicks(yMin, yMax, opts.yTickCount || 5);
  yTicks.forEach(v => {
    const y = sy(v);
    html += `<line class="chart-grid-line" x1="${pad.left}" y1="${y.toFixed(2)}" x2="${width - pad.right}" y2="${y.toFixed(2)}"/>`;
    html += `<text class="chart-axis-label" x="${(pad.left - 6).toFixed(2)}" y="${(y + 3).toFixed(2)}" text-anchor="end">${opts.yFmt ? opts.yFmt(v) : v}</text>`;
  });
  labels.forEach((label, i) => {
    html += `<text class="chart-axis-label" x="${sx(i).toFixed(2)}" y="${(height - pad.bottom + 16).toFixed(2)}" text-anchor="middle">${escapeHtml(label)}</text>`;
  });

  (opts.series || []).forEach(s => {
    const pts = toPts(s.values);
    html += svgArea(pts, sx, sy, baselineY, `fill="${s.color}" opacity="${s.fill ?? 0.18}"`);
    html += svgPolyline(pts, sx, sy, `stroke="${s.color}" stroke-width="2"`);
    pts.forEach(p => {
      html += `<circle cx="${sx(p[0]).toFixed(2)}" cy="${sy(p[1]).toFixed(2)}" r="3" fill="${s.color}"><title>${escapeHtml(s.name)} ${escapeHtml(labels[p[0]])}: ${p[1]}</title></circle>`;
    });
  });

  // 差值标注（节约区间）
  if (opts.gapSeries && opts.gapSeries.values.length) {
    const g = opts.gapSeries;
    const top = toPts(g.values.map(v => v.top));
    const bottom = toPts(g.values.map(v => v.bottom));
    html += svgArea([...top.map(p => [p[0], p[1]]).reverse(), ...bottom.map(p => [p[0], p[1]])], sx, sy, sy(bottom[0][1]), `fill="${g.color}" opacity="${g.opacity ?? 0.3}"`);
  }

  html += `</svg>`;
  return html;
}

/**
 * 半圆仪表盘（Time-to-Risk 倒计时）
 * opts: { width, height, value, min, max, unit, zones:[{from,to,color}], label, format }
 */
export function svgGauge(opts) {
  const { width = 320, height = 248 } = opts;
  const cx = width / 2;
  const cy = height - 28;
  const r = Math.min(width / 2 - 42, height - 96);
  const val = Math.max(opts.min, Math.min(opts.max, opts.value));
  const span = opts.max - opts.min || 1;
  const ratio = (val - opts.min) / span;
  const angle = Math.PI * (1 - ratio);
  const px = cx + r * Math.cos(angle);
  const py = cy - r * Math.sin(angle);

  const polar = (aDeg, rr) => {
    const a = ((180 - aDeg) * Math.PI) / 180;
    return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)];
  };

  let html = `<svg class="agri-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">`;

  html += `<path d="M ${polar(180, r)[0].toFixed(2)} ${polar(180, r)[1].toFixed(2)} A ${r} ${r} 0 0 1 ${polar(0, r)[0].toFixed(2)} ${polar(0, r)[1].toFixed(2)}" fill="none" stroke="#21262d" stroke-width="14" stroke-linecap="round"/>`;

  (opts.zones || []).forEach(z => {
    const a0 = 180 - ((z.from - opts.min) / span) * 180;
    const a1 = 180 - ((z.to - opts.min) / span) * 180;
    html += `<path d="M ${polar(a0, r)[0].toFixed(2)} ${polar(a0, r)[1].toFixed(2)} A ${r} ${r} 0 0 1 ${polar(a1, r)[0].toFixed(2)} ${polar(a1, r)[1].toFixed(2)}" fill="none" stroke="${z.color}" stroke-width="14" stroke-linecap="butt" opacity="${z.opacity ?? 0.85}"/>`;
  });

  html += `<line x1="${cx.toFixed(2)}" y1="${cy.toFixed(2)}" x2="${px.toFixed(2)}" y2="${py.toFixed(2)}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`;
  html += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="5" fill="currentColor"/>`;

  const tickStep = span / 4;
  for (let v = opts.min; v <= opts.max + 0.01; v += tickStep) {
    const a = 180 - ((v - opts.min) / span) * 180;
    const [x1, y1] = polar(a, r + 10);
    const [x2, y2] = polar(a, r + 16);
    const [lx, ly] = polar(a, r + 30);
    html += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="currentColor" stroke-width="1.4" opacity="0.55"/>`;
    html += `<text class="chart-axis-label" x="${lx.toFixed(2)}" y="${(ly + 4).toFixed(2)}" text-anchor="middle">${v >= opts.max ? '240+' : Math.round(v)}</text>`;
  }

  if (!opts.hideCenterText) {
    html += `<text class="chart-gauge-value" x="${cx.toFixed(2)}" y="${(cy - 28).toFixed(2)}" text-anchor="middle">${opts.format ? opts.format(val) : val}</text>`;
    if (opts.unit) {
      html += `<text class="chart-gauge-unit" x="${cx.toFixed(2)}" y="${(cy - 8).toFixed(2)}" text-anchor="middle">${escapeHtml(opts.unit)}</text>`;
    }
    if (opts.label) {
      html += `<text class="chart-axis-label" x="${cx.toFixed(2)}" y="${(cy + 16).toFixed(2)}" text-anchor="middle">${escapeHtml(opts.label)}</text>`;
    }
  }

  html += `</svg>`;
  return html;
}
