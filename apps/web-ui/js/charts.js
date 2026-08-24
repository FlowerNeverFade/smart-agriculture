/**
 * AgriLoop 新前端 · 图表辅助（ECharts，Google 风格配色）
 * 所有图表只读展示，数据来自 ApiService（在线后端 / 离线模拟）。
 */

export const CHART_COLORS = {
  blue: '#1a73e8',
  green: '#1e8e3e',
  red: '#d93025',
  amber: '#f9ab00',
  gray: '#9aa0a6',
  purple: '#8430ce',
};

const BASE_TEXT = { color: '#5f6368', fontSize: 11 };

function baseGrid() {
  return { left: 40, right: 40, top: 30, bottom: 28 };
}

/** 双 Y 轴趋势折线图（土壤湿度 % / 空气温度 °C） */
export function renderTrendChart(el, moisture, temperature) {
  if (!window.echarts || !el) return null;
  const chart = window.echarts.init(el);
  const xData = moisture.map(p => p.label);
  chart.setOption({
    color: [CHART_COLORS.blue, CHART_COLORS.green],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#dadce0',
      textStyle: { color: '#202124', fontSize: 12 },
      extraCssText: 'box-shadow:0 2px 8px rgba(60,64,67,.18);border-radius:8px;',
    },
    legend: {
      top: 0, left: 0, itemWidth: 14, itemHeight: 3, icon: 'roundRect',
      textStyle: { ...BASE_TEXT, color: '#3c4043' },
    },
    grid: baseGrid(),
    xAxis: {
      type: 'category', data: xData, boundaryGap: false,
      axisLine: { lineStyle: { color: '#dadce0' } },
      axisTick: { show: false },
      axisLabel: { ...BASE_TEXT, interval: Math.max(0, Math.ceil(xData.length / 6) - 1) },
    },
    yAxis: [
      {
        type: 'value', name: '%', nameTextStyle: BASE_TEXT,
        axisLabel: BASE_TEXT, splitLine: { lineStyle: { color: '#f1f3f4' } },
      },
      {
        type: 'value', name: '°C', nameTextStyle: BASE_TEXT,
        axisLabel: BASE_TEXT, splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '土壤湿度（%）', type: 'line', smooth: 0.25, symbol: 'circle', symbolSize: 4,
        lineStyle: { width: 2 }, data: moisture.map(p => p.value),
      },
      {
        name: '空气温度（°C）', type: 'line', smooth: 0.25, symbol: 'circle', symbolSize: 4,
        yAxisIndex: 1, lineStyle: { width: 2 }, data: temperature.map(p => p.value),
      },
    ],
  });
  return chart;
}

/** 经营视图：计划 vs 实际 柱状图 */
export function renderBizBarChart(el, daily) {
  if (!window.echarts || !el) return null;
  const chart = window.echarts.init(el);
  chart.setOption({
    color: [CHART_COLORS.gray, CHART_COLORS.green],
    tooltip: {
      trigger: 'axis', backgroundColor: '#ffffff', borderColor: '#dadce0',
      textStyle: { color: '#202124', fontSize: 12 },
      extraCssText: 'box-shadow:0 2px 8px rgba(60,64,67,.18);border-radius:8px;',
    },
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, icon: 'roundRect', textStyle: { ...BASE_TEXT, color: '#3c4043' } },
    grid: { left: 44, right: 12, top: 30, bottom: 28 },
    xAxis: {
      type: 'category', data: daily.map(d => d.date),
      axisLine: { lineStyle: { color: '#dadce0' } }, axisTick: { show: false },
      axisLabel: { ...BASE_TEXT, interval: 2 },
    },
    yAxis: { type: 'value', name: 'L', nameTextStyle: BASE_TEXT, axisLabel: BASE_TEXT, splitLine: { lineStyle: { color: '#f1f3f4' } } },
    series: [
      { name: '计划用水', type: 'bar', barWidth: 5, itemStyle: { borderRadius: 3 }, data: daily.map(d => d.planned) },
      { name: '实际用水', type: 'bar', barWidth: 5, itemStyle: { borderRadius: 3 }, data: daily.map(d => d.actual) },
    ],
  });
  return chart;
}

/** 风险视图：情景双轨对比折线图 */
export function renderCompareChart(el, compare) {
  if (!window.echarts || !el || !compare?.branches) return null;
  const chart = window.echarts.init(el);
  const exec = compare.branches.EXECUTE?.points || [];
  const noAct = compare.branches.NO_ACTION?.points || [];
  chart.setOption({
    tooltip: {
      trigger: 'axis', backgroundColor: '#ffffff', borderColor: '#dadce0',
      textStyle: { color: '#202124', fontSize: 12 },
      extraCssText: 'box-shadow:0 2px 8px rgba(60,64,67,.18);border-radius:8px;',
    },
    legend: { top: 0, left: 0, itemWidth: 14, itemHeight: 3, icon: 'roundRect', textStyle: { ...BASE_TEXT, color: '#3c4043' } },
    grid: baseGrid(),
    xAxis: {
      type: 'category', boundaryGap: false,
      data: exec.map(p => `${p.minute}m`),
      axisLine: { lineStyle: { color: '#dadce0' } }, axisTick: { show: false },
      axisLabel: { ...BASE_TEXT, interval: 5 },
    },
    yAxis: { type: 'value', name: '%', nameTextStyle: BASE_TEXT, axisLabel: BASE_TEXT, splitLine: { lineStyle: { color: '#f1f3f4' } } },
    series: [
      {
        name: compare.branches.EXECUTE?.label || '执行', type: 'line', showSymbol: false, smooth: 0.2,
        lineStyle: { width: 2, color: '#1e8e3e' }, itemStyle: { color: '#1e8e3e' },
        data: exec.map(p => p.value),
        markLine: {
          symbol: 'none', silent: true,
          lineStyle: { color: '#d93025', type: 'dashed' },
          label: { formatter: '胁迫边界', color: '#d93025', fontSize: 10 },
          data: [{ yAxis: compare.stressBoundary }],
        },
      },
      {
        name: compare.branches.NO_ACTION?.label || '不处理', type: 'line', showSymbol: false, smooth: 0.2,
        lineStyle: { width: 2, color: '#d93025' }, itemStyle: { color: '#d93025' },
        data: noAct.map(p => p.value),
      },
    ],
  });
  return chart;
}

/** SVG 圆环（设备在线率等） */
export function donutSVG(pct, { size = 96, stroke = 9, color = '#1e8e3e', track = '#e6e9e7', label = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, pct)) / 100;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${(c * filled).toFixed(1)} ${c.toFixed(1)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
      style="font:600 ${Math.round(size / 5.6)}px inherit;fill:#202124">${label || `${Math.round(pct)}%`}</text>
  </svg>`;
}

/** 窗口尺寸变化时重绘 */
export function autoResize(...charts) {
  const fn = () => charts.forEach(c => c?.resize?.());
  window.addEventListener('resize', fn);
  return () => window.removeEventListener('resize', fn);
}
