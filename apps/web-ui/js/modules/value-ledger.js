/**
 * AgriLoop Frontend - Module: Value Ledger (PNG 第5点 · 预测与经营)
 * 经营效益与节水账本：计划 vs 实际偏差率、累计节水/节电折合人民币、反事实推演
 * 图表优先使用本地 vendored ECharts；缺失时回退纯 SVG（charts.js）。
 */
import { api } from '../api.js';
import { svgGroupedBarChart, svgAreaChart, initEChart, attachCustomTip, escapeHtml } from '../charts.js';

const AXIS_COLOR = '#8b949e';
const GRID_COLOR = '#21262d';
const GREEN = '#3fb950';
const RED = '#f85149';
const AMBER = '#d29922';

function darkTooltip() {
  return {
    trigger: 'axis',
    confine: true,
    transitionDuration: 0, // 关闭原生容器位移过渡，避免过渡中间帧
    className: 'agri-native-tip-hidden', // 配合 CSS 强制隐藏原生容器（axisPointer 在 canvas 内，不受影响）
    backgroundColor: '#21262d',
    borderColor: '#3d444d',
    borderWidth: 1,
    padding: [5, 8],
    shadowBlur: 16,
    shadowColor: 'rgba(0, 0, 0, 0.55)',
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    textStyle: { color: '#f0f6fc', fontSize: 12 },
    extraCssText: 'white-space: normal !important; line-height: 16px !important; font-size: 12px !important; color: #f0f6fc !important; padding: 6px 10px !important; background-color: #21262d !important; border: 1px solid #3d444d !important; border-radius: 6px !important; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.55) !important; max-width: 320px !important; word-break: break-word !important;'
  };
}

export async function renderValueLedger(container) {
  const loadingId = `vl-loading-${Date.now()}`;
  container.innerHTML = `
    <div class="agri-module-loading" id="${loadingId}">
      <div class="agri-spinner"></div>
      <span>正在拉取经营对账数据...</span>
    </div>`;

  const data = await api.getValueLedgers();
  const s = data.summary;

  container.innerHTML = `
    <div class="agri-module vl-root">

      <div class="rf-header">
        <div>
          <div class="agri-module-title">💰 经营效益与节水账本 · ${escapeHtml(data.farmName)}</div>
          <div class="agri-module-sub">统计周期 ${data.period.start} ~ ${data.period.end} · 口径 OBSERVED (sourceMode=SIMULATION) / DERIVED / ESTIMATED · 演示数据不宣称真实收益</div>
        </div>
        <div class="rf-header-right">
          <span class="agri-pill agri-pill-blue">CAP-12 价值账本</span>
          <span class="agri-pill agri-pill-ok">sourceMode=SIMULATION</span>
        </div>
      </div>

      <div class="vl-kpi-grid">
        <div class="agri-card vl-kpi">
          <div class="vl-kpi-label">计划 vs 实际用水偏差率</div>
          <div class="vl-kpi-value">${s.deviationRatePct}%</div>
          <div class="vl-kpi-foot">计划 ${s.plannedWaterLitres.toLocaleString()}L · 实际 ${s.actualWaterLitres.toLocaleString()}L</div>
        </div>
        <div class="agri-card vl-kpi vl-kpi-green">
          <div class="vl-kpi-label">累计节水</div>
          <div class="vl-kpi-value">${s.savedWaterLitres.toLocaleString()} <small>L</small></div>
          <div class="vl-kpi-foot">折合人民币 ¥ ${s.savedWaterCostRmb.toFixed(2)}（水价 ${data.prices.waterPerLitre} 元/L）</div>
        </div>
        <div class="agri-card vl-kpi vl-kpi-blue">
          <div class="vl-kpi-label">累计节电</div>
          <div class="vl-kpi-value">${s.savedElectricityKwh} <small>kWh</small></div>
          <div class="vl-kpi-foot">折合人民币 ¥ ${s.savedElectricityCostRmb.toFixed(2)}（电价 ${data.prices.electricityPerKwh} 元/kWh）</div>
        </div>
        <div class="agri-card vl-kpi vl-kpi-amber">
          <div class="vl-kpi-label">节省工时</div>
          <div class="vl-kpi-value">${s.labourSavedHours} <small>h</small></div>
          <div class="vl-kpi-foot">折合人民币 ¥ ${s.labourSavedCostRmb.toFixed(2)}（${data.prices.labourPerHour} 元/h）</div>
        </div>
        <div class="agri-card vl-kpi vl-kpi-total">
          <div class="vl-kpi-label">综合折算价值</div>
          <div class="vl-kpi-value">¥ ${s.totalSavedRmb.toFixed(2)}</div>
          <div class="vl-kpi-foot">节水 + 节电 + 工时（DERIVED 口径）</div>
        </div>
      </div>

      <div class="agri-card vl-chart-card">
        <div class="agri-card-title">📊 计划用水 vs 实际用水（每日偏差率）</div>
        <div class="vl-chart-body" data-role="bar-chart"></div>
        <div class="rf-chart-legend">
          <span class="rf-legend-item"><i style="background:#30363d"></i>计划用水（L）</span>
          <span class="rf-legend-item"><i style="background:#3fb950"></i>实际用水（L）</span>
          <span class="rf-legend-item"><i style="background:#d29922"></i>偏差率（%，右轴）</span>
        </div>
      </div>

      <div class="agri-card vl-chart-card">
        <div class="agri-card-title">🧮 反事实推演 · 传统粗放灌溉 vs 农智闭环（累计成本，元）</div>
        <div class="vl-chart-body" data-role="area-chart"></div>
        <div class="rf-chart-legend">
          <span class="rf-legend-item"><i style="background:#f85149"></i>传统粗放灌溉成本（ESTIMATED）</span>
          <span class="rf-legend-item"><i style="background:#3fb950"></i>农智闭环成本</span>
          <span class="rf-legend-item"><i style="background:#d29922"></i>累计节约（差值）</span>
        </div>
      </div>

      <div class="agri-card vl-provenance-card">
        <div class="agri-card-title">🛡️ 口径与来源标记（决策护照要求）</div>
        <table class="vl-provenance-table">
          <thead>
            <tr><th>数据项</th><th>来源标记</th><th>说明</th></tr>
          </thead>
          <tbody>
            ${data.provenance.map(p => `
              <tr>
                <td>${escapeHtml(p.key)}</td>
                <td><span class="agri-pill ${p.value === 'OBSERVED' ? 'agri-pill-ok' : p.value === 'DERIVED' ? 'agri-pill-blue' : 'agri-pill-warn'}">${escapeHtml(p.value)}</span></td>
                <td class="vl-provenance-note">${escapeHtml(p.tag)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p class="agri-meta-line">本期无产量、价格或因果证据，不宣称真实收益或避免损失；所有数值仅用于演示与答辩口径展示。</p>
      </div>
    </div>`;

  const charts = [];
  const tipCleanups = [];
  const barEl = container.querySelector('[data-role="bar-chart"]');
  const areaEl = container.querySelector('[data-role="area-chart"]');

  const bar = initEChart(barEl);
  if (bar) {
    // 自定义浮窗：内容自绘，不受原生 tooltip 容器行为影响
    tipCleanups.push(attachCustomTip(bar, (params) => {
      const d = data.daily[params.dataIndex];
      if (!d) return null;
      return `<div style="color:#8b949e">${d.date}</div>
        <div>计划用水：<b>${d.planned} L</b></div>
        <div style="color:#3fb950">实际用水：<b>${d.actual} L</b></div>
        <div style="color:#d29922">偏差率：<b>${d.deviationRatePct}%</b></div>`;
    }));
    // --- 柱状图：计划 vs 实际 + 偏差率折线 ---
    bar.setOption({
      backgroundColor: 'transparent',
      animation: false, // 关闭入场动画，避免首帧/切换时短暂空黑
      grid: { left: 50, right: 52, top: 30, bottom: 30 },
      tooltip: { ...darkTooltip(), formatter: () => null },
      legend: { show: false },
      xAxis: {
        type: 'category',
        data: data.daily.map(d => d.date),
        axisLine: { lineStyle: { color: '#30363d' } },
        axisLabel: { color: AXIS_COLOR, fontSize: 10, interval: 2 },
        axisTick: { show: false }
      },
      yAxis: [
        {
          type: 'value', name: '用水量 (L)',
          nameTextStyle: { color: AXIS_COLOR, fontSize: 10 },
          axisLabel: { color: AXIS_COLOR, fontSize: 10 },
          splitLine: { lineStyle: { color: GRID_COLOR } }
        },
        {
          type: 'value', min: -12, max: 6, name: '偏差率 (%)',
          nameTextStyle: { color: AXIS_COLOR, fontSize: 10 },
          axisLabel: { color: AXIS_COLOR, fontSize: 10, formatter: '{value}%' },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '计划用水', type: 'bar',
          data: data.daily.map(d => d.planned),
          barWidth: '22%',
          itemStyle: { color: '#30363d', borderRadius: [2, 2, 0, 0] }
        },
        {
          name: '实际用水', type: 'bar',
          data: data.daily.map(d => d.actual),
          barWidth: '22%',
          itemStyle: { color: GREEN, borderRadius: [2, 2, 0, 0] }
        },
        {
          name: '偏差率', type: 'line', yAxisIndex: 1,
          data: data.daily.map(d => d.deviationRatePct),
          symbol: 'circle', symbolSize: 3,
          lineStyle: { color: AMBER, width: 1.8, type: 'dashed' },
          itemStyle: { color: AMBER }
        }
      ]
    });
    charts.push(bar);
  } else {
    barEl.innerHTML = svgGroupedBarChart({
      width: 760, height: 300,
      xLabels: data.daily.map(d => d.date),
      yMin: 0, yMax: 1100, yFmt: v => `${v}`,
      bars: [
        { name: '计划用水', color: '#30363d', values: data.daily.map(d => d.planned) },
        { name: '实际用水', color: GREEN, values: data.daily.map(d => d.actual) }
      ],
      line: { name: '偏差率', color: AMBER, values: data.daily.map(d => d.deviationRatePct) },
      lineMin: -12, lineMax: 6, lineFmt: v => `${v}%`
    });
  }

  // --- 反事实推演面积图 ---
  const cf = data.counterfactual;
  const area = initEChart(areaEl);
  if (area) {
    tipCleanups.push(attachCustomTip(area, (params) => {
      const w = cf[params.dataIndex];
      if (!w) return null;
      const save = w.traditionalCostRmb - w.agriLoopCostRmb;
      return `<div style="color:#8b949e">${w.week}</div>
        <div style="color:#f85149">传统粗放：<b>¥${w.traditionalCostRmb}</b></div>
        <div style="color:#3fb950">农智闭环：<b>¥${w.agriLoopCostRmb}</b></div>
        <div style="color:#d29922">累计节约：<b>¥${save}</b></div>`;
    }));
    area.setOption({
      backgroundColor: 'transparent',
      animation: false, // 关闭入场动画，避免首帧/切换时短暂空黑
      grid: { left: 50, right: 24, top: 30, bottom: 30 },
      tooltip: { ...darkTooltip(), formatter: () => null },
      legend: { show: false },
      xAxis: {
        type: 'category',
        data: cf.map(c => c.week),
        axisLine: { lineStyle: { color: '#30363d' } },
        axisLabel: { color: AXIS_COLOR, fontSize: 11 },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value', name: '累计成本 (元)',
        nameTextStyle: { color: AXIS_COLOR, fontSize: 10 },
        axisLabel: { color: AXIS_COLOR, fontSize: 10 },
        splitLine: { lineStyle: { color: GRID_COLOR } }
      },
      series: [
        {
          name: '传统粗放灌溉成本', type: 'line',
          data: cf.map(c => c.traditionalCostRmb),
          symbol: 'circle', symbolSize: 5,
          lineStyle: { color: RED, width: 2 },
          itemStyle: { color: RED },
          areaStyle: { color: 'rgba(248, 81, 73, 0.14)' }
        },
        {
          name: '农智闭环成本', type: 'line',
          data: cf.map(c => c.agriLoopCostRmb),
          symbol: 'circle', symbolSize: 5,
          lineStyle: { color: GREEN, width: 2 },
          itemStyle: { color: GREEN },
          areaStyle: { color: 'rgba(63, 185, 80, 0.16)' }
        },
        {
          name: '累计节约', type: 'line',
          data: cf.map(c => Number((c.traditionalCostRmb - c.agriLoopCostRmb).toFixed(1))),
          symbol: 'diamond', symbolSize: 6,
          lineStyle: { color: AMBER, width: 1.8, type: 'dashed' },
          itemStyle: { color: AMBER },
          areaStyle: { color: 'rgba(210, 153, 34, 0.18)' }
        }
      ]
    });
    charts.push(area);
  } else {
    areaEl.innerHTML = svgAreaChart({
      width: 760, height: 300,
      xLabels: data.counterfactual.map(c => c.week),
      yMin: 0, yMax: 1200, yFmt: v => `¥${v}`,
      series: [
        { name: '传统粗放灌溉成本', color: RED, fill: 0.14, values: data.counterfactual.map(c => c.traditionalCostRmb) },
        { name: '农智闭环成本', color: GREEN, fill: 0.16, values: data.counterfactual.map(c => c.agriLoopCostRmb) }
      ]
    });
  }

  const onResize = () => charts.forEach(c => c.resize());
  window.addEventListener('resize', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
    tipCleanups.forEach(fn => { try { fn(); } catch (e) { /* noop */ } });
    charts.forEach(c => { try { c.dispose(); } catch (e) { /* noop */ } });
  };
}
