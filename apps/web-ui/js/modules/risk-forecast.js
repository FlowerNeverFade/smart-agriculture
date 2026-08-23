/**
 * AgriLoop Frontend - Module: Risk Forecast & Scenario Replay (PNG 第5点 · 预测与经营)
 *  - renderRiskForecast(container, plotId)   风险预测：Time-to-Risk 仪表盘 + 1/2/4h 置信带曲线
 *  - renderScenarioReplay(container, plotId) 情景注入 + 同一 Seed 双轨回放（EXECUTE vs NO_ACTION）
 * 图表优先使用本地 vendored ECharts（vendor/echarts.min.js，离线可用）；
 * 若 window.echarts 缺失，自动回退到纯 SVG 渲染（charts.js）。
 */
import { api } from '../api.js';
import { MOCK_DATA } from '../mock-data.js';
import { svgGauge, svgLineChart, initEChart, attachCustomTip, escapeHtml } from '../charts.js';

const BOUNDARY_COLOR = '#f85149';
const BASELINE_COLOR = '#d29922';
const MEAN_COLOR = '#58a6ff';
const AXIS_COLOR = '#8b949e';
const GRID_COLOR = '#21262d';

/** 统一深色主题 tooltip：内容紧凑、按内容自适应尺寸
 * 关键：modal 背景为 #161b22，tooltip 若同色会完全融入背景、看不见浮窗边界。
 * 因此 tooltip 背景提亮一档（--bg-card #21262d）+ 亮边框 + 投影，保证从页面浮起。
 */
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
    extraCssText: 'white-space: normal !important; line-height: 16px !important; font-size: 12px !important; color: #f0f6fc !important; padding: 6px 10px !important; background-color: #21262d !important; border: 1px solid #3d444d !important; border-radius: 6px !important; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.55) !important; max-width: 320px !important; word-break: break-word !important;',
    axisPointer: { lineStyle: { color: '#58a6ff' } }
  };
}

/* ================================================================
 * 视图 1：未来风险预测推演 (renderRiskForecast)
 * ================================================================ */
export async function renderRiskForecast(container, plotId) {
  const loadingId = `rf-loading-${Date.now()}`;
  container.innerHTML = `
    <div class="agri-skeleton-wrap" id="${loadingId}">
      <div class="agri-skeleton agri-skeleton-title"></div>
      <div class="agri-skeleton agri-skeleton-line"></div>
      <div class="agri-skeleton agri-skeleton-line short"></div>
      <div class="agri-skeleton agri-skeleton-line"></div>
    </div>`;

  const data = await api.getRiskForecast(plotId, 'SOIL_MOISTURE');
  const plot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
  if (!data || data.status !== 'AVAILABLE') {
    container.innerHTML = `
      <div class="agri-alert agri-alert-danger">
        <div class="agri-alert-icon">🚫</div>
        <div>
          <strong>预测状态：UNAVAILABLE</strong>
          <p>${escapeHtml((data && data.reason) || '样本或阶段上下文不足，拒绝生成伪预测')}</p>
          <p class="agri-meta-line">算法版本：${escapeHtml((data && data.algorithmVersion) || MOCK_DATA.riskForecastConfig.algorithmVersion)} · 按确定性策略弃权，不提供未来值</p>
        </div>
      </div>`;
    return () => {};
  }

  const fmtTime = new Date(data.generatedAt).toLocaleTimeString('zh-CN', { hour12: false });
  const zone = data.timeToRiskMinutes < 60
    ? { label: '高危 · 立即处置', cls: 'agri-pill-danger' }
    : data.timeToRiskMinutes < 150
      ? { label: '警示 · 计划补水', cls: 'agri-pill-warn' }
      : { label: '安全 · 维持观察', cls: 'agri-pill-ok' };

  container.innerHTML = `
    <div class="agri-module rf-root">

      <div class="rf-header">
        <div>
          <div class="agri-module-title">🔮 未来风险预测 · ${escapeHtml(plot.name)}</div>
          <div class="agri-module-sub">${escapeHtml(plot.cropName)} · ${escapeHtml(plot.stageLabel)} · 指标 SOIL_MOISTURE · 输入窗口 ${data.inputWindowMinutes}min · 预测范围 ${data.forecastRangeMinutes}min</div>
        </div>
        <div class="rf-header-right">
          <button class="cmd-nav-btn" data-nav="scenario-replay">⚡ 情景模拟</button>
          <button class="cmd-nav-btn" data-nav="value-ledger">💰 效益对账</button>
          <span class="agri-pill ${zone.cls}">${zone.label}</span>
          <span class="agri-pill agri-pill-blue">${escapeHtml(data.algorithmVersion)}</span>
        </div>
      </div>

      <div class="rf-top-grid">
        <div class="agri-card rf-gauge-card">
          <div class="agri-card-title">⏱️ Time-to-Risk 倒计时</div>
          <div class="rf-gauge-body" data-role="gauge"></div>
          <div class="rf-gauge-foot">当前湿度 <b class="agri-mono">${data.startMoisture}%</b> → 极限胁迫边界 <b class="agri-mono">${data.stressBoundary}%</b>（低于 ${data.baselineMoisture}% 即进入失水胁迫带）</div>
        </div>

        <div class="rf-horizons">
          ${data.horizons.map(h => `
            <div class="agri-card rf-horizon-card">
              <div class="rf-horizon-head">
                <span class="rf-horizon-label">+${h.minute} 分钟</span>
                <span class="rf-horizon-expected">${h.expected}%</span>
              </div>
              <div class="rf-horizon-band">置信区间 ${h.band}</div>
              <div class="rf-horizon-bar">
                <div class="rf-horizon-bar-fill" style="width: ${Math.min(Math.max((h.expected - data.stressBoundary) / (data.baselineMoisture - data.stressBoundary) * 100, 4), 100)}%;"></div>
              </div>
              <div class="rf-horizon-meta">基线 ${data.baselineMoisture}% · 边界 ${data.stressBoundary}%</div>
            </div>
          `).join('')}
          <div class="agri-card rf-assumption-card">
            <div class="agri-card-title">🧾 推演假设与失效条件</div>
            <ul class="agri-kv-list">
              ${data.assumptions.map(a => `<li><span class="agri-kv-key">假设</span><span>${escapeHtml(a)}</span></li>`).join('')}
              <li><span class="agri-kv-key">不确定性</span><span>${escapeHtml(data.uncertaintyNote)}</span></li>
            </ul>
          </div>
        </div>
      </div>

      <div class="agri-card rf-chart-card">
        <div class="rf-chart-head">
          <div class="agri-card-title">📉 土壤水分衰减预测曲线（含置信区间包络）</div>
          <div class="rf-horizon-toggles" data-role="horizon-toggles">
            ${[60, 120, 240].map(m => `
              <button class="rf-toggle-chip ${m === 240 ? 'active' : ''}" data-min="${m}">${m === 60 ? '1 小时' : m === 120 ? '2 小时' : '4 小时'}</button>
            `).join('')}
          </div>
        </div>
        <div class="rf-chart-body" data-role="chart-body"></div>
        <div class="rf-chart-legend">
          <span class="rf-legend-item"><i style="background:#58a6ff"></i>期望值（均值）</span>
          <span class="rf-legend-item"><i class="rf-legend-band"></i>置信区间 ±</span>
          <span class="rf-legend-item"><i style="background:#d29922"></i>最低适宜基线 ${data.baselineMoisture}%</span>
          <span class="rf-legend-item"><i style="background:#f85149"></i>极限胁迫边界 ${data.stressBoundary}%</span>
        </div>
      </div>

      <div class="agri-card rf-meta-card">
        <div class="agri-card-title">📋 预测元数据（决策护照输入）</div>
        <div class="rf-meta-grid">
          <div><span class="agri-kv-key">预测时点</span><span>${fmtTime}</span></div>
          <div><span class="agri-kv-key">输入窗口</span><span>近 ${data.inputWindowMinutes} 分钟遥测</span></div>
          <div><span class="agri-kv-key">预测范围</span><span>未来 ${data.forecastRangeMinutes} 分钟（1/2/4h 三档）</span></div>
          <div><span class="agri-kv-key">算法版本</span><span class="agri-mono">${escapeHtml(data.algorithmVersion)}</span></div>
          <div><span class="agri-kv-key">状态</span><span class="agri-pill agri-pill-ok">AVAILABLE</span></div>
        </div>
      </div>
    </div>`;

  const charts = [];
  const customTipCleanups = [];
  const gaugeEl = container.querySelector('[data-role="gauge"]');
  const chartEl = container.querySelector('[data-role="chart-body"]');

  const gauge = await initEChart(gaugeEl);
  // 异步加载期间视图可能已被切换/关闭：容器内容被清空则放弃本次渲染
  if (!container.isConnected || !container.querySelector('[data-role="horizon-toggles"]')) {
    if (gauge) { try { gauge.dispose(); } catch (e) { /* noop */ } }
    return () => {};
  }
  if (gauge) {
    gauge.setOption({
      series: [{
        type: 'gauge',
        startAngle: 180, endAngle: 0,
        min: 0, max: 240,
        radius: '100%',
        center: ['50%', '78%'],
        axisLine: {
          lineStyle: {
            width: 14,
            color: [[0.25, BOUNDARY_COLOR], [0.625, BASELINE_COLOR], [1, '#3fb950']]
          }
        },
        pointer: {
          length: '58%', width: 5,
          itemStyle: { color: '#f0f6fc' }
        },
        anchor: { show: true, size: 10, itemStyle: { color: '#f0f6fc' } },
        axisTick: { distance: -22, length: 5, lineStyle: { color: '#6e7681' } },
        splitLine: { distance: -28, length: 12, lineStyle: { color: '#6e7681', width: 1.5 } },
        axisLabel: { distance: 2, color: AXIS_COLOR, fontSize: 10, formatter: v => v >= 240 ? '240+' : v },
        detail: {
          valueAnimation: true,
          formatter: v => v >= 240 ? '>240' : v,
          color: '#f0f6fc', fontSize: 34, fontWeight: 700, fontFamily: 'SFMono-Regular, Consolas, monospace',
          offsetCenter: [0, '-48%']
        },
        title: { offsetCenter: [0, '-14%'], color: AXIS_COLOR, fontSize: 12 },
        data: [{ value: data.timeToRiskMinutes, name: '分钟 · 触达极限胁迫边界' }]
      }]
    });
    charts.push(gauge);
  } else {
    gaugeEl.innerHTML = svgGauge({
      width: 320, height: 190, value: data.timeToRiskMinutes, min: 0, max: 240,
      unit: '分钟 · 触达极限胁迫边界',
      format: v => v >= 240 ? '>240' : v,
      zones: [
        { from: 0, to: 60, color: BOUNDARY_COLOR },
        { from: 60, to: 150, color: BASELINE_COLOR, opacity: 0.75 },
        { from: 150, to: 240, color: '#3fb950', opacity: 0.6 }
      ]
    });
  }

  const renderChart = async (horizon) => {
    // 视图已切换时放弃（异步 echarts 加载期间容器可能被清空）
    if (!container.isConnected || !container.querySelector('[data-role="horizon-toggles"]')) return;
    const curve = data.curve.filter(p => p.minute <= horizon);
    const xMax = horizon;
    const yMin = Math.max(Math.floor(Math.min(...curve.map(p => p.lower)) - 2), 0);
    const yMax = Math.ceil(Math.max(...curve.map(p => p.upper)) + 2);

    let chart = chartEl._agriEChart || await initEChart(chartEl);
    if (!container.isConnected || !container.querySelector('[data-role="horizon-toggles"]')) return;
    if (chart) {
      chartEl._agriEChart = chart;
      // 原生 tooltip 仅保留 axisPointer 十字线，内容改由自定义浮窗渲染
      if (!chart._agriCustomTipAttached) {
        chart._agriCustomTipAttached = true;
        customTipCleanups.push(attachCustomTip(chart, (params) => {
          const p = data.curve[params.dataIndex];
          if (!p) return null;
          const tLabel = p.minute === 0 ? '现在' : `+${p.minute}min`;
          return `<div style="color:#8b949e">${tLabel}</div>
            <div>期望值：<b style="color:#58a6ff">${p.expected}%</b></div>
            <div style="color:#8b949e">置信区间：${p.lower}% ~ ${p.upper}%</div>`;
        }));
      }
      const option = {
        backgroundColor: 'transparent',
        animation: false, // 关闭入场动画：stack 置信带生长动画期间下半部分会短暂空黑
        grid: { left: 46, right: 20, top: 36, bottom: 30 },
        tooltip: { ...darkTooltip(), formatter: () => null },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: curve.map(p => p.minute),
          axisLine: { lineStyle: { color: '#30363d' } },
          axisLabel: { color: AXIS_COLOR, fontSize: 11, formatter: v => v === 0 ? '现在' : `+${v}min` },
          splitLine: { show: false }
        },
        yAxis: {
          type: 'value', min: yMin, max: yMax,
          axisLabel: { color: AXIS_COLOR, fontSize: 11, formatter: '{value}%' },
          splitLine: { lineStyle: { color: GRID_COLOR } }
        },
        series: [
          {
            name: '置信带上界', type: 'line', stack: 'band',
            data: curve.map(p => p.upper - p.lower),
            symbol: 'none', lineStyle: { opacity: 0 },
            areaStyle: { color: 'rgba(88, 166, 255, 0.14)' },
            tooltip: { show: false }
          },
          {
            name: '置信带下界', type: 'line', stack: 'band',
            data: curve.map(p => p.lower),
            symbol: 'none', lineStyle: { opacity: 0 },
            tooltip: { show: false }
          },
          {
            name: '期望值', type: 'line',
            data: curve.map(p => p.expected),
            symbol: 'circle', symbolSize: 4, showSymbol: false,
            lineStyle: { color: MEAN_COLOR, width: 2.4 },
            itemStyle: { color: MEAN_COLOR },
            markLine: {
              silent: true,
              symbol: 'none',
              label: { color: '#8b949e', fontSize: 10, position: 'insideEndTop' },
              lineStyle: { type: 'dashed' },
              data: [
                { yAxis: data.baselineMoisture, lineStyle: { color: BASELINE_COLOR }, label: { formatter: `最低适宜基线 ${data.baselineMoisture}%`, color: BASELINE_COLOR } },
                { yAxis: data.stressBoundary, lineStyle: { color: BOUNDARY_COLOR }, label: { formatter: `极限胁迫边界 ${data.stressBoundary}%`, color: BOUNDARY_COLOR } }
              ]
            }
          },
          {
            // 隐形宽线命中区：扩大鼠标靠近曲线的浮窗判定范围（±8px），不参与渲染
            name: '期望值命中区', type: 'line',
            data: curve.map(p => p.expected),
            symbol: 'none',
            lineStyle: { width: 16, opacity: 0 },
            tooltip: { show: false },
            z: 3
          }
        ]
      };
      chart.setOption(option, true);
      if (!charts.includes(chart)) charts.push(chart);
    } else {
      chartEl.innerHTML = svgLineChart({
        width: 760, height: 330,
        xMin: 0, xMax, yMin, yMax,
        xFmt: v => v === 0 ? '现在' : `+${v}min`,
        yFmt: v => `${v}%`,
        yTickCount: 5,
        series: [{
          name: '期望值', color: MEAN_COLOR, width: 2.4,
          points: curve.map(p => [p.minute, p.expected])
        }],
        bands: [{
          upper: curve.map(p => [p.minute, p.upper]),
          lower: curve.map(p => [p.minute, p.lower]),
          color: MEAN_COLOR, opacity: 0.14
        }],
        hMarkers: [
          { y: data.baselineMoisture, label: `最低适宜基线 ${data.baselineMoisture}%`, color: BASELINE_COLOR },
          { y: data.stressBoundary, label: `极限胁迫边界 ${data.stressBoundary}%`, color: BOUNDARY_COLOR }
        ]
      });
    }
  };

  const toggles = container.querySelector('[data-role="horizon-toggles"]');
  container.querySelectorAll('.cmd-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = `view=${btn.dataset.nav}&plotId=${plotId}`;
    });
  });
  toggles.addEventListener('click', (e) => {
    const btn = e.target.closest('.rf-toggle-chip');
    if (!btn) return;
    toggles.querySelectorAll('.rf-toggle-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderChart(Number(btn.dataset.min));
  });
  renderChart(240);

  const onResize = () => charts.forEach(c => c.resize());
  window.addEventListener('resize', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
    customTipCleanups.forEach(fn => { try { fn(); } catch (e) { /* noop */ } });
    charts.forEach(c => { try { c.dispose(); } catch (e) { /* noop */ } });
    if (chartEl) chartEl._agriEChart = null;
  };
}

/* ================================================================
 * 视图 2：情景模拟器与双轨回放 (renderScenarioReplay)
 * ================================================================ */

/** 盆栽可视化（大尺寸）：温室棚顶 + 分层环境 + 精细盆栽，情景通过 CSS 类切换，土壤色由 --soil-color 驱动 */
function buildPotSceneSvg(cropCode) {
  const fruit = {
    tomato: `<g class="pot-fruit">
        <circle cx="212" cy="182" r="9" fill="#f85149"/><circle cx="210" cy="182" r="3" fill="#ff9a8b"/>
        <circle cx="226" cy="200" r="8" fill="#f85149"/><circle cx="224" cy="200" r="2.8" fill="#ff9a8b"/>
        <circle cx="200" cy="204" r="7" fill="#f85149"/><circle cx="198" cy="204" r="2.5" fill="#ff9a8b"/>
      </g>`,
    cucumber: `<g class="pot-fruit">
        <rect x="216" y="168" width="11" height="34" rx="5.5" fill="#3fb950"/>
        <rect x="219" y="172" width="3" height="26" rx="1.5" fill="#7ee2a8"/>
        <rect x="198" y="192" width="10" height="28" rx="5" fill="#2ea043"/>
      </g>`,
    strawberry: `<g class="pot-fruit">
        <path d="M204 178 q-9 -12 -2 -19 q7 -7 2 19 M204 178 q9 -12 2 -19 q-7 -7 -2 19 Z" fill="#f85149"/>
        <circle cx="198" cy="170" r="2" fill="#ffd9a0"/><circle cx="206" cy="173" r="1.7" fill="#ffd9a0"/><circle cx="202" cy="167" r="1.5" fill="#ffd9a0"/>
        <path d="M222 192 q-8 -10 -2 -16 q6 -6 2 16 M222 192 q8 -10 2 -16 q-6 -6 -2 16 Z" fill="#e5433a"/>
      </g>`,
    pepper: `<g class="pot-fruit">
        <path d="M226 172 q13 -8 18 12 q4 15 -13 23 q-18 -5 -18 -20 q0 -12 13 -15 Z" fill="#d29922"/>
        <path d="M196 186 q-10 -5 -15 10 q-4 12 10 17 q14 4 14 -12 q0 -10 -9 -15 Z" fill="#2ea043"/>
        <path d="M204 196 q-7 -4 -10 7 q-3 8 7 11 q9 3 9 -8 q0 -7 -6 -10 Z" fill="#f85149"/>
      </g>`
  }[cropCode] || '<g class="pot-fruit"><circle cx="210" cy="190" r="8" fill="#f85149"/></g>';

  return `
  <svg viewBox="0 0 380 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="温室盆栽情景可视化">
    <defs>
      <linearGradient id="potSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0d1219"/>
        <stop offset="0.6" stop-color="#141c28"/>
        <stop offset="1" stop-color="#1c2634"/>
      </linearGradient>
      <radialGradient id="potGlow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="rgba(210,153,34,0.35)"/>
        <stop offset="1" stop-color="rgba(210,153,34,0)"/>
      </radialGradient>
      <!-- 圆台花盆侧壁：左暗右亮，立体感 -->
      <linearGradient id="potBody" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#5f3a20"/>
        <stop offset="0.28" stop-color="#8a5a33"/>
        <stop offset="0.55" stop-color="#a06a3e"/>
        <stop offset="0.8" stop-color="#7a4f2e"/>
        <stop offset="1" stop-color="#4a2d18"/>
      </linearGradient>
      <linearGradient id="potRim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b57c4c"/>
        <stop offset="1" stop-color="#7a4f2e"/>
      </linearGradient>
      <!-- 叶片立体渐变：顶部受光亮、基部暗 -->
      <linearGradient id="leafGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4cc760"/>
        <stop offset="1" stop-color="#227a3a"/>
      </linearGradient>
      <linearGradient id="leafGradDark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2f9c4a"/>
        <stop offset="1" stop-color="#195f2c"/>
      </linearGradient>
    </defs>

    <!-- 天空 -->
    <rect width="380" height="340" fill="url(#potSky)"/>

    <!-- 温室棚顶 -->
    <path d="M14 0 Q190 62 366 0 L366 0 L14 0 Z" fill="rgba(88,166,255,0.05)" stroke="rgba(139,148,158,0.35)" stroke-width="2"/>
    <line x1="34" y1="16" x2="346" y2="16" stroke="rgba(139,148,158,0.18)" stroke-width="1.5" stroke-dasharray="14 10"/>
    <line x1="58" y1="32" x2="322" y2="32" stroke="rgba(139,148,158,0.12)" stroke-width="1" stroke-dasharray="10 12"/>

    <!-- 太阳光晕 + 太阳 -->
    <circle class="pot-glow" cx="318" cy="66" r="52" fill="url(#potGlow)"/>
    <g class="pot-sun" transform="translate(318,66)">
      <circle r="16" fill="#d29922"/>
      <circle r="16" fill="none" stroke="rgba(210,153,34,0.5)" stroke-width="2"/>
      <g stroke="#d29922" stroke-width="2.5" stroke-linecap="round" opacity="0.75">
        <line x1="0" y1="-25" x2="0" y2="-18"/>
        <line x1="0" y1="18" x2="0" y2="25"/>
        <line x1="-25" y1="0" x2="-18" y2="0"/>
        <line x1="18" y1="0" x2="25" y2="0"/>
        <line x1="-17" y1="-17" x2="-12" y2="-12"/>
        <line x1="12" y1="12" x2="17" y2="17"/>
        <line x1="17" y1="-17" x2="12" y2="-12"/>
        <line x1="-12" y1="12" x2="-17" y2="17"/>
      </g>
    </g>

    <!-- 远云（常驻，淡） -->
    <g class="pot-cloud-far" opacity="0.35" transform="translate(120,64)">
      <ellipse cx="0" cy="0" rx="30" ry="10" fill="#3a4658"/>
      <ellipse cx="22" cy="3" rx="20" ry="8" fill="#3a4658"/>
      <ellipse cx="-20" cy="4" rx="18" ry="7" fill="#3a4658"/>
    </g>

    <!-- 近云（暴雨） -->
    <g class="pot-cloud" transform="translate(86,92)">
      <ellipse cx="0" cy="0" rx="38" ry="16" fill="#33415a"/>
      <ellipse cx="28" cy="6" rx="26" ry="12" fill="#3a4a66"/>
      <ellipse cx="-26" cy="6" rx="22" ry="11" fill="#2c3950"/>
      <ellipse cx="6" cy="-10" rx="20" ry="11" fill="#3f5070"/>
    </g>

    <!-- 雨幕（三层，暴雨） -->
    <g class="pot-rain" stroke="#58a6ff" stroke-width="2" stroke-linecap="round">
      <g opacity="0.5">
        <line class="drop r-bg" x1="52" y1="128" x2="46" y2="144"/>
        <line class="drop r-bg d2" x1="96" y1="140" x2="90" y2="156"/>
        <line class="drop r-bg d3" x1="140" y1="132" x2="134" y2="148"/>
        <line class="drop r-bg d4" x1="76" y1="160" x2="70" y2="176"/>
      </g>
      <g opacity="0.8">
        <line class="drop" x1="38" y1="176" x2="30" y2="196"/>
        <line class="drop d2" x1="70" y1="188" x2="62" y2="208"/>
        <line class="drop d3" x1="106" y1="180" x2="98" y2="200"/>
        <line class="drop d4" x1="132" y1="196" x2="124" y2="216"/>
        <line class="drop d5" x1="60" y1="216" x2="52" y2="236"/>
        <line class="drop d6" x1="94" y1="226" x2="86" y2="246"/>
      </g>
      <g opacity="0.9">
        <line class="drop d7" x1="46" y1="250" x2="36" y2="274"/>
        <line class="drop d8" x1="84" y1="258" x2="74" y2="282"/>
        <line class="drop d9" x1="120" y1="246" x2="110" y2="270"/>
      </g>
    </g>

    <!-- 热浪气流（极端热浪） -->
    <g class="pot-heat" stroke="#f85149" stroke-width="2" stroke-linecap="round" fill="none">
      <path d="M180 92 q7 -7 0 -14 q-7 -7 0 -14"/>
      <path class="h2" d="M214 104 q7 -7 0 -14 q-7 -7 0 -14"/>
      <path class="h3" d="M252 92 q7 -7 0 -14 q-7 -7 0 -14"/>
      <path class="h4" d="M146 108 q7 -7 0 -14 q-7 -7 0 -14"/>
    </g>

    <!-- 桌面平台 + 盆影 -->
    <rect x="0" y="340" width="380" height="100" fill="#121820"/>
    <rect x="0" y="340" width="380" height="3" fill="#1f2937"/>
    <ellipse cx="190" cy="402" rx="74" ry="12" fill="rgba(0,0,0,0.4)"/>

    <!-- 花盆（圆台透视 3D：椭圆盆口 + 侧壁明暗 + 高光） -->
    <!-- 盆口内部（深度阴影） -->
    <ellipse cx="190" cy="290" rx="54" ry="13" fill="#241608"/>
    <!-- 圆台侧壁 -->
    <path d="M136 290 L244 290 L256 398 Q190 412 124 398 Z" fill="url(#potBody)" stroke="#3f2715" stroke-width="2"/>
    <!-- 侧壁高光 -->
    <path d="M152 300 Q190 290 228 300 L236 390 Q190 402 144 390 Z" fill="rgba(255,255,255,0.06)"/>
    <!-- 盆口边沿（椭圆环：上缘亮、下缘暗，俯视立体） -->
    <ellipse cx="190" cy="290" rx="54" ry="13" fill="none" stroke="url(#potRim)" stroke-width="6"/>
    <path d="M138 289 Q190 276 242 289" stroke="rgba(255,255,255,0.3)" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- 侧壁装饰线（贴合圆台弧度） -->
    <path d="M143 330 Q190 324 237 330" stroke="rgba(0,0,0,0.22)" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M139 358 Q190 352 241 358" stroke="rgba(0,0,0,0.16)" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M134 384 Q190 378 246 384" stroke="rgba(0,0,0,0.12)" stroke-width="3" fill="none" stroke-linecap="round"/>

    <!-- 土壤（椭圆盘俯视 3D + 湿度联动色 + 颗粒 + 干旱裂纹） -->
    <ellipse class="pot-soil" cx="190" cy="290" rx="44" ry="10" fill="var(--soil-color, #4a3624)"/>
    <ellipse cx="190" cy="290" rx="44" ry="10" fill="rgba(0,0,0,0.18)"/>
    <ellipse cx="190" cy="287" rx="36" ry="7.5" fill="rgba(255,255,255,0.07)"/>
    <g class="pot-soil-grain" fill="rgba(255,255,255,0.09)">
      <circle cx="170" cy="289" r="1.4"/><circle cx="184" cy="292" r="1.2"/><circle cx="198" cy="288" r="1.5"/>
      <circle cx="210" cy="291" r="1.2"/><circle cx="220" cy="289" r="1.4"/><circle cx="176" cy="295" r="1.1"/>
      <circle cx="204" cy="295" r="1.3"/><circle cx="190" cy="291" r="1"/>
    </g>
    <g class="pot-soil-cracks" stroke="#c9a06a" stroke-width="1.4" fill="none">
      <path d="M174 287 q5 4 0 8"/>
      <path d="M192 286 q-4 3 0 8 q4 3 0 8"/>
      <path d="M208 287 q5 3 0 8"/>
      <path d="M220 288 q-3 3 3 7"/>
    </g>

    <!-- 主茎 + 侧枝（双线立体：暗底 + 亮面） -->
    <path class="pot-stem pot-stem-dark" d="M190 288 Q184 240 192 176" stroke="#1c6b33" stroke-width="6.5" fill="none" stroke-linecap="round"/>
    <path class="pot-stem" d="M190 288 Q184 240 192 176" stroke="#36ab52" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path class="pot-stem pot-stem-dark pot-branch" d="M188 246 Q214 232 226 240" stroke="#1c6b33" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path class="pot-stem pot-branch" d="M188 246 Q214 232 226 240" stroke="#36ab52" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path class="pot-stem pot-stem-dark pot-branch2" d="M191 210 Q166 196 154 204" stroke="#1c6b33" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path class="pot-stem pot-branch2" d="M191 210 Q166 196 154 204" stroke="#36ab52" stroke-width="2.2" fill="none" stroke-linecap="round"/>

    <!-- 后层叶片（暗色渐变，视觉在后） -->
    <path class="pot-leaf pot-leaf-back l2b" d="M192 192 Q230 174 244 188 Q228 198 192 192 Z" fill="url(#leafGradDark)"/>
    <path class="pot-leaf pot-leaf-back l4b" d="M190 232 Q226 218 236 232 Q222 242 190 232 Z" fill="url(#leafGradDark)"/>
    <path class="pot-leaf pot-leaf-back l6b" d="M191 258 Q162 248 156 262 Q168 270 191 258 Z" fill="url(#leafGradDark)"/>

    <!-- 前层叶片（亮色渐变 + 叶脉） -->
    <path class="pot-leaf l1" d="M192 206 Q156 190 142 204 Q158 214 192 206 Z" fill="url(#leafGrad)"/>
    <path class="pot-leaf l3" d="M190 238 Q156 226 148 240 Q162 248 190 238 Z" fill="url(#leafGrad)"/>
    <path class="pot-leaf l5" d="M192 172 Q168 158 156 170 Q170 180 192 172 Z" fill="url(#leafGrad)"/>
    <path class="pot-leaf l2" d="M192 192 Q224 178 238 190 Q224 200 192 192 Z" fill="url(#leafGrad)"/>
    <path class="pot-leaf l4" d="M190 232 Q220 220 230 232 Q218 242 190 232 Z" fill="url(#leafGrad)"/>
    <path class="pot-leaf l6" d="M191 258 Q162 250 156 262 Q168 270 191 258 Z" fill="url(#leafGrad)"/>

    ${fruit}

    <!-- 传感器漂移仪表（漂移情景） -->
    <g class="pot-drift" transform="translate(56,248)">
      <circle r="17" fill="none" stroke="#a371f7" stroke-width="2" stroke-dasharray="4 3"/>
      <g class="pot-gauge-arc" fill="none" stroke="#a371f7" stroke-width="3" stroke-linecap="round">
        <path d="M -11 8 A 13 13 0 0 1 11 8"/>
      </g>
      <line class="pot-gauge-needle" x1="0" y1="6" x2="0" y2="-8" stroke="#a371f7" stroke-width="2" stroke-linecap="round"/>
      <text x="0" y="20" text-anchor="middle" font-size="11" fill="#a371f7" font-weight="bold">漂移</text>
    </g>

    <!-- 设备离线信号（离线情景） -->
    <g class="pot-offline" transform="translate(56,248)">
      <path d="M-12 4 a 12 12 0 0 1 24 0" stroke="#f85149" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M-7 11 a 6 6 0 0 1 14 0" stroke="#f85149" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="0" cy="18" r="2.2" fill="#f85149"/>
      <line x1="-12" y1="-2" x2="12" y2="24" stroke="#f85149" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
      <text x="0" y="38" text-anchor="middle" font-size="11" fill="#f85149" font-weight="bold">离线</text>
    </g>
  </svg>`;
}

/** 情景 -> 盆栽视觉类 / 状态文案 / 环境指标 */
const SCENE_VISUAL = {
  DROUGHT: { cls: 'drought', label: '持续干旱 · 蒸散加快，土壤水分流失', temp: '30.2°C', light: '58.0k lux', badge: '☀️ 持续干旱' },
  HEAT_WAVE: { cls: 'heat', label: '极端热浪 · 棚温骤升，蒸散加剧', temp: '38.0°C', light: '71.0k lux', badge: '🔥 极端热浪' },
  STORM: { cls: 'storm', label: '暴雨积水 · 土壤过湿风险', temp: '24.1°C', light: '12.0k lux', badge: '🌧️ 暴雨积水' },
  SENSOR_DRIFT: { cls: 'drift', label: '传感器漂移 · 读数缓慢偏移', temp: '26.4°C', light: '42.5k lux', badge: '⚠️ 传感器漂移' },
  OFFLINE: { cls: 'offline', label: '设备断网离线 · 遥测中断', temp: '--', light: '--', badge: '🔌 设备离线' },
  NORMAL: { cls: 'normal', label: '正常生长 · 环境适宜', temp: '26.4°C', light: '42.5k lux', badge: '🌤️ 正常生长' }
};

export async function renderScenarioReplay(container, plotId) {
  const catalog = MOCK_DATA.riskForecastConfig.scenarioCatalog;
  const plot = MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
  let playTimer = null;

  container.innerHTML = `
    <div class="agri-module sr-root">

      <div class="agri-module-title">⚡ 情景模拟器与双轨回放</div>
      <div class="agri-module-sub">一键注入故障情景 → 同一冻结快照 + 同一随机种子 → 执行 vs 放任 双轨对比（只读推演，不写回主状态）
        <span style="margin-left:10px">
          <button class="cmd-nav-btn" data-nav="risk-forecast">🔮 风险预测</button>
          <button class="cmd-nav-btn" data-nav="value-ledger">💰 效益对账</button>
        </span>
      </div>

      <div class="sr-layout">
        <!-- 左栏：盆栽可视化（固定，不随右栏滚动） -->
        <div class="sr-left">
          <div class="agri-card sr-pot-card">
            <div class="sr-pot-head">
              <span class="sr-pot-title">🪴 温室盆栽环境模拟</span>
              <span class="agri-pill agri-pill-ok" data-role="pot-badge">🌤️ 正常生长</span>
            </div>
            <div class="sr-pot-stage" data-role="pot-stage">
              <div class="sr-pot-scene normal" data-role="pot-scene">${buildPotSceneSvg(plot.cropCode)}</div>
            </div>
            <div class="sr-pot-metrics">
              <div class="sr-pot-metric" title="土壤湿度（随回放滑块联动）">
                <span>💧 土壤湿度</span>
                <b class="agri-mono" data-role="pot-moisture">${plot.metrics.SOIL_MOISTURE.value}%</b>
              </div>
              <div class="sr-pot-metric">
                <span>🌡️ 棚内温度</span>
                <b class="agri-mono" data-role="pot-temp">26.4°C</b>
              </div>
              <div class="sr-pot-metric">
                <span>☀️ 光照</span>
                <b class="agri-mono" data-role="pot-light">42.5k lux</b>
              </div>
            </div>
            <div class="sr-pot-desc" data-role="pot-desc">${escapeHtml(plot.cropName)} · ${escapeHtml(plot.cropVariety)} · 当前湿度 ${plot.metrics.SOIL_MOISTURE.value}%</div>
            <div class="agri-meta-line">盆栽为可视化示意，推演曲线代表量化结果；运行推演后拖动回放滑块，盆栽土壤湿度与植物状态会随分支 A（执行）联动变化。</div>
          </div>
        </div>

        <!-- 右栏：情景注入 + 双轨回放（可滚动） -->
        <div class="sr-right">
          <div class="agri-card sr-inject-card">
            <div class="agri-card-title">🎛️ 一键情景注入与故障发生器</div>
            <div class="sr-scenario-grid" data-role="scenario-grid">
              ${catalog.map(s => `
                <button class="sr-scenario-btn" data-scenario="${s.code}" style="--scenario-color: ${s.color}" title="${escapeHtml(s.desc)}">
                  <span class="sr-scenario-emoji">${s.emoji}</span>
                  <span class="sr-scenario-name">${escapeHtml(s.label)}</span>
                  <span class="sr-scenario-desc">${escapeHtml(s.desc)}</span>
                </button>
              `).join('')}
            </div>
            <div class="sr-inject-bar">
              <label class="sr-seed-label" for="srSeedInput">随机种子 Seed</label>
              <input type="number" class="sr-seed-input" id="srSeedInput" value="42" min="1" max="99999">
              <span class="sr-seed-hint">同一种子可重复复现双轨推演</span>
              <button class="btn btn-primary" data-role="run-btn" disabled>▶ 运行双轨推演</button>
            </div>
          </div>

          <div data-role="run-output"></div>
        </div>
      </div>
    </div>`;

  const runBtn = container.querySelector('[data-role="run-btn"]');
  const runOutput = container.querySelector('[data-role="run-output"]');
  const seedInput = container.querySelector('#srSeedInput');
  const potScene = container.querySelector('[data-role="pot-scene"]');
  const potStage = container.querySelector('[data-role="pot-stage"]');
  const potBadge = container.querySelector('[data-role="pot-badge"]');
  const potDesc = container.querySelector('[data-role="pot-desc"]');
  const potMoisture = container.querySelector('[data-role="pot-moisture"]');
  const potTemp = container.querySelector('[data-role="pot-temp"]');
  const potLight = container.querySelector('[data-role="pot-light"]');
  let selectedScenario = 'DROUGHT';
  let chartInstances = [];
  let activeChart = null; // 当前双轨图的 ECharts 实例（跨 renderRunOutput 生命周期）

  // 3D 视差：鼠标在盆栽区域移动时场景跟随轻微旋转（perspective + rotate）
  if (potStage) {
    potStage.addEventListener('mousemove', (e) => {
      const rect = potStage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      potStage.style.transform = `rotateY(${(px * 10).toFixed(2)}deg) rotateX(${(-py * 8).toFixed(2)}deg)`;
    });
    potStage.addEventListener('mouseleave', () => {
      potStage.style.transform = '';
    });
  }

  /** 应用情景到盆栽可视化（CSS 类切换环境动画 + 环境指标） */
  const applySceneVisual = (scenario) => {
    const v = SCENE_VISUAL[scenario] || SCENE_VISUAL.NORMAL;
    potScene.classList.remove('drought', 'heat', 'storm', 'drift', 'offline', 'normal');
    potScene.classList.add(v.cls);
    potBadge.textContent = v.badge;
    potBadge.className = `agri-pill ${v.cls === 'drought' || v.cls === 'heat' ? 'agri-pill-danger' : v.cls === 'storm' || v.cls === 'drift' ? 'agri-pill-warn' : v.cls === 'offline' ? 'agri-pill-danger' : 'agri-pill-ok'}`;
    potTemp.textContent = v.temp;
    potLight.textContent = v.light;
    potDesc.textContent = v.label;
  };

  /** 土壤湿度联动：颜色插值 + 植物健康状态（运行推演后随回放滑块更新） */
  const updatePot = (moisture) => {
    potMoisture.textContent = `${Number(moisture).toFixed(1)}%`;
    const ratio = Math.min(1, Math.max(0, (moisture - 10) / 30)); // 10%~40% 映射到 干→湿
    const r = Math.round(138 - 80 * ratio);
    const g = Math.round(106 - 64 * ratio);
    const b = Math.round(63 - 35 * ratio);
    potScene.style.setProperty('--soil-color', `rgb(${r}, ${g}, ${b})`);
    potScene.classList.toggle('pot-wilt', moisture < 20);
    potScene.classList.toggle('pot-crit', moisture < 14);
  };

  container.querySelectorAll('.sr-scenario-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.sr-scenario-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedScenario = btn.dataset.scenario;
      runBtn.disabled = false;
      applySceneVisual(selectedScenario); // 选中情景即预览盆栽环境
    });
  });
  container.querySelectorAll('.cmd-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = `view=${btn.dataset.nav}&plotId=${plotId}`;
    });
  });

  /** 只停止回放定时器（不销毁图表，避免画布变黑） */
  const stopPlayback = () => {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
  };

  /** 销毁全部 ECharts 实例（关闭弹窗 / 重新推演时调用） */
  const disposeCharts = () => {
    if (activeChart && activeChart._agriCustomTipCleanup) {
      try { activeChart._agriCustomTipCleanup(); } catch (e) { /* noop */ }
      activeChart._agriCustomTipCleanup = null;
    }
    chartInstances.forEach(c => { try { c.dispose(); } catch (e) { /* noop */ } });
    chartInstances = [];
    activeChart = null;
  };

  const cleanup = () => {
    stopPlayback();
    disposeCharts();
  };

  runBtn.addEventListener('click', async () => {
    const seedRaw = String(seedInput.value).trim();
    if (seedRaw === '') {
      // 空种子必须拦截：缺失随机种子时推演不可复现，禁止运行
      seedInput.classList.add('sr-seed-error');
      runOutput.innerHTML = `
        <div class="agri-alert agri-alert-danger">
          <div class="agri-alert-icon">⚠️</div>
          <div><strong>缺少随机种子</strong><p>请先填写 Seed（1 ~ 99999）后再运行双轨推演，同一 Seed 才能复现同一条推演路径。</p></div>
        </div>`;
      return;
    }
    seedInput.classList.remove('sr-seed-error');
    const seed = Math.max(1, Math.min(99999, Number(seedRaw)));
    stopPlayback();
    disposeCharts();
    runBtn.disabled = true;
    runBtn.innerHTML = '<span>⏳ 正在冻结快照并推演...</span>';

    try {
      const run = await api.runScenario({ scenario: selectedScenario, seed, plotId });
      const cmp = await api.compareScenario({ scenario: selectedScenario, seed, plotId });
      renderRunOutput(run, cmp, seed);
    } catch (e) {
      console.error('Scenario run failed:', e);
      runOutput.innerHTML = `
        <div class="agri-alert agri-alert-danger">
          <div class="agri-alert-icon">⚠️</div>
          <div><strong>推演失败</strong><p>${escapeHtml(e.message)}</p></div>
        </div>`;
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = '<span>▶ 运行双轨推演</span>';
    }
  });

  const renderRunOutput = (run, cmp, seed) => {
    if (cmp.status !== 'AVAILABLE') {
      runOutput.innerHTML = `
        <div class="agri-card">
          <div class="agri-alert agri-alert-danger">
            <div class="agri-alert-icon">🚫</div>
            <div>
              <strong>推演状态：UNAVAILABLE（${escapeHtml(run.scenarioLabel)}）</strong>
              <p>${escapeHtml(cmp.reason)}</p>
              <p class="agri-meta-line">按确定性策略：样本/质量不足时不得生成预测与可执行处方，前端展示降级状态而非伪结果。</p>
            </div>
          </div>
          <div class="sr-run-meta">
            <span class="agri-mono">${escapeHtml(cmp.scenarioId)}</span>
            <span>Seed ${seed}</span>
            <span>地块 ${escapeHtml(run.frozenSnapshot.plotName)}</span>
          </div>
        </div>`;
      return;
    }

    const bExec = cmp.branches.EXECUTE;
    const bNoop = cmp.branches.NO_ACTION;
    const yAll = [...bExec.points.map(p => p.value), ...bNoop.points.map(p => p.value)];
    const yMin = Math.max(Math.floor(Math.min(...yAll, cmp.stressBoundary) - 2), 0);
    const yMax = Math.ceil(Math.max(...yAll, cmp.baselineMoisture) + 3);

    // 双轨摘要：末端对比 / 越界时刻 / 结论
    const lastExec = bExec.points[bExec.points.length - 1];
    const lastNoop = bNoop.points[bNoop.points.length - 1];
    const breachExec = bExec.points.find(p => p.value <= cmp.stressBoundary);
    const breachNoop = bNoop.points.find(p => p.value <= cmp.stressBoundary);
    const endDiff = lastExec.value - lastNoop.value;
    let conclusion = '';
    let conclusionCls = 'ok';
    if (breachNoop && !breachExec) {
      conclusion = `执行补水使地块在 4h 内未触达 ${cmp.stressBoundary}% 胁迫边界（放任将在 t=${breachNoop.minute}min 触达）`;
    } else if (breachNoop && breachExec) {
      const delay = breachExec.minute - breachNoop.minute;
      conclusionCls = delay > 0 ? 'ok' : 'warn';
      conclusion = delay > 0
        ? `执行补水将越界时刻推迟 ${delay} 分钟（A t=${breachExec.minute}min vs B t=${breachNoop.minute}min）`
        : '执行补水未能改变越界时刻（补水量不足以覆盖蒸散）';
    } else if (!breachNoop && !breachExec) {
      conclusion = '两分支 4h 内均未触达胁迫边界，本情景对当前地块影响有限';
      conclusionCls = 'warn';
    } else {
      conclusion = '执行分支出现越界但放任分支未越界（执行时刻或补水量需复核）';
      conclusionCls = 'warn';
    }
    const summaryHtml = `
      <div class="sr-summary">
        <div class="sr-summary-item">
          <span>4h 末端湿度</span>
          <b class="agri-mono" style="color:#3fb950">A ${lastExec.value}%</b>
          <b class="agri-mono" style="color:#f85149">B ${lastNoop.value}%</b>
          <span class="agri-mono sr-summary-diff">Δ ${endDiff >= 0 ? '+' : ''}${endDiff.toFixed(1)}%</span>
        </div>
        <div class="sr-summary-item">
          <span>触达极限边界（${cmp.stressBoundary}%）</span>
          <b class="agri-mono" style="color:#3fb950">A ${breachExec ? `t=${breachExec.minute}min` : '未触达'}</b>
          <b class="agri-mono" style="color:#f85149">B ${breachNoop ? `t=${breachNoop.minute}min` : '未触达'}</b>
        </div>
        <div class="sr-summary-conclusion ${conclusionCls}">💡 ${conclusion}</div>
      </div>`;

    runOutput.innerHTML = `
      <div class="agri-card sr-result-card">
        <div class="sr-run-head">
          <div>
            <span class="sr-run-badge">${escapeHtml(run.params.emoji)} ${escapeHtml(run.scenarioLabel)}</span>
            <span class="agri-mono sr-run-id">${escapeHtml(cmp.scenarioId)}</span>
          </div>
          <div class="sr-run-meta">
            <span>Seed <b class="agri-mono">${seed}</b></span>
            <span>冻结快照：${escapeHtml(run.frozenSnapshot.plotName)} · 湿度 ${cmp.frozenSnapshot.startMoisture}%</span>
          </div>
          <div class="sr-run-meta sr-seed-params">
            <span>本 Seed 推演参数：蒸散速率 ×<b class="agri-mono">${cmp.seedParams.evapotranspirationFactor}</b></span>
            <span>灌溉回升 <b class="agri-mono">+${cmp.seedParams.irrigationBoostPct}%</b></span>
            ${cmp.seedParams.rainBoostPct ? `<span>暴雨抬升 <b class="agri-mono">+${cmp.seedParams.rainBoostPct}%</b></span>` : ''}
            ${cmp.seedParams.driftRatePerHour ? `<span>漂移速率 <b class="agri-mono">${cmp.seedParams.driftRatePerHour}%/h</b></span>` : ''}
          </div>
        </div>

        <div class="agri-card-title">🛤️ 双轨对比 · 同一快照同一 Seed</div>
        <div class="sr-chart-body" data-role="sr-chart"></div>
        <div class="rf-chart-legend">
          <span class="rf-legend-item"><i style="background:#3fb950"></i>分支 A · 执行灌溉处方（t=30min 补水 ≈13.2%）</span>
          <span class="rf-legend-item"><i style="background:#f85149"></i>分支 B · 不采取措施放任干旱</span>
          <span class="rf-legend-item"><i style="background:#d29922"></i>最低适宜基线 ${cmp.baselineMoisture}%</span>
          <span class="rf-legend-item"><i style="background:#f85149"></i>极限胁迫边界 ${cmp.stressBoundary}%</span>
        </div>

        <div class="sr-scrubber">
          <div class="sr-scrubber-head">
            <span>⏪ 回放时间轴（拖动滑块动态回放）</span>
            <span class="sr-scrubber-time agri-mono" data-role="scrub-time">t = 0 min</span>
          </div>
          <div class="sr-scrubber-controls">
            <button class="btn btn-secondary" data-role="play-btn">▶ 播放</button>
            <input type="range" class="sr-range" data-role="scrub-range" min="0" max="240" step="5" value="0">
            <button class="btn btn-secondary" data-role="reset-btn">⏮ 复位</button>
          </div>
          <div class="sr-readouts">
            <div class="sr-readout" style="border-color:#3fb950">
              <span>分支 A · 执行灌溉</span>
              <b class="agri-mono" data-role="val-exec">${bExec.points[0].value}%</b>
            </div>
            <div class="sr-readout" style="border-color:#f85149">
              <span>分支 B · 放任干旱</span>
              <b class="agri-mono" data-role="val-noop">${bNoop.points[0].value}%</b>
            </div>
            <div class="sr-readout">
              <span>差值（A - B）</span>
              <b class="agri-mono" data-role="val-diff">+0.0%</b>
            </div>
          </div>
        </div>

        ${summaryHtml}

        <div class="agri-meta-line">${escapeHtml(cmp.note)} · 场景参数：${escapeHtml(run.params.desc)}</div>
      </div>`;

    const chartEl = runOutput.querySelector('[data-role="sr-chart"]');
    const range = runOutput.querySelector('[data-role="scrub-range"]');
    const timeEl = runOutput.querySelector('[data-role="scrub-time"]');
    const valExec = runOutput.querySelector('[data-role="val-exec"]');
    const valNoop = runOutput.querySelector('[data-role="val-noop"]');
    const valDiff = runOutput.querySelector('[data-role="val-diff"]');
    const playBtn = runOutput.querySelector('[data-role="play-btn"]');
    const resetBtn = runOutput.querySelector('[data-role="reset-btn"]');

    const buildMarkLineData = (t) => [
      { xAxis: t, lineStyle: { color: '#f0f6fc' }, label: { formatter: `◉ t=${t}min`, color: '#f0f6fc' } },
      { xAxis: cmp.execMinute, lineStyle: { color: '#3fb950' }, label: { formatter: '⚡ 虚拟执行', color: '#3fb950' } },
      { yAxis: cmp.baselineMoisture, lineStyle: { color: BASELINE_COLOR }, label: { formatter: `基线 ${cmp.baselineMoisture}%`, color: BASELINE_COLOR } },
      { yAxis: cmp.stressBoundary, lineStyle: { color: BOUNDARY_COLOR }, label: { formatter: `边界 ${cmp.stressBoundary}%`, color: BOUNDARY_COLOR } }
    ];

    const buildEChartsOption = (t) => {
      const series = [
        {
          name: bExec.label, type: 'line',
          data: bExec.points.map(p => [p.minute, p.value]), // value 轴：[分钟, 数值]
          symbol: 'circle', symbolSize: 4, showSymbol: false,
          lineStyle: { color: bExec.color, width: 2.4 },
          itemStyle: { color: bExec.color },
          markLine: {
            silent: true, symbol: 'none',
            label: { color: '#8b949e', fontSize: 10 },
            lineStyle: { type: 'dashed' },
            data: buildMarkLineData(t)
          }
        },
        {
          name: bNoop.label, type: 'line',
          data: bNoop.points.map(p => [p.minute, p.value]),
          symbol: 'circle', symbolSize: 4, showSymbol: false,
          lineStyle: { color: bNoop.color, width: 2.2, type: 'dashed' },
          itemStyle: { color: bNoop.color }
        },
        // 隐形宽线命中区：扩大鼠标靠近曲线的浮窗判定范围（±8px），不参与渲染
        { name: '命中区A', type: 'line', data: bExec.points.map(p => [p.minute, p.value]), symbol: 'none', lineStyle: { width: 16, opacity: 0 }, tooltip: { show: false }, z: 3 },
        { name: '命中区B', type: 'line', data: bNoop.points.map(p => [p.minute, p.value]), symbol: 'none', lineStyle: { width: 16, opacity: 0 }, tooltip: { show: false }, z: 3 }
      ];
      return {
        backgroundColor: 'transparent',
        // 双轨图为普通折线（无 stack 置信带），保留入场生长动画；
        // 播放时增量更新仅移动 markLine，不受此动画影响
        grid: { left: 46, right: 20, top: 36, bottom: 30 },
        // 原生 tooltip 仅保留 axisPointer，内容由自定义浮窗渲染（attachCustomTip）
        tooltip: { ...darkTooltip(), formatter: () => null },
        // value 轴：markLine 的 xAxis 直接按时间坐标定位，与曲线横轴严格对应
        xAxis: {
          type: 'value', min: 0, max: 240,
          axisLine: { lineStyle: { color: '#30363d' } },
          axisLabel: { color: AXIS_COLOR, fontSize: 11, formatter: v => v === 0 ? '现在' : `+${v}min` },
          splitLine: { show: false }
        },
        yAxis: {
          type: 'value', min: yMin, max: yMax,
          axisLabel: { color: AXIS_COLOR, fontSize: 11, formatter: '{value}%' },
          splitLine: { lineStyle: { color: GRID_COLOR } }
        },
        series
      };
    };

    const renderChartAt = async (t) => {
      if (!activeChart) {
        activeChart = await initEChart(chartEl);
        // 视图已切换时放弃（异步 echarts 加载期间容器可能被清空）
        if (!container.isConnected || !runOutput.isConnected) {
          disposeCharts();
          return;
        }
        if (activeChart) {
          chartInstances.push(activeChart);
          // 自定义浮窗：内容自绘，不受原生 tooltip 容器行为影响
          activeChart._agriCustomTipCleanup = attachCustomTip(activeChart, (params) => {
            const i = params.dataIndex;
            if (i == null) return null;
            const pa = bExec.points[i];
            const pb = bNoop.points[i];
            if (!pa || !pb) return null;
            const diff = pa.value - pb.value;
            return `<div style="color:#8b949e">t = ${pa.minute} min</div>
              <div>分支 A 执行：<b style="color:#3fb950">${pa.value.toFixed(1)}%</b></div>
              <div>分支 B 放任：<b style="color:#f85149">${pb.value.toFixed(1)}%</b></div>
              <div>差值：<b style="color:#d29922">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%</b></div>`;
          });
          activeChart.setOption(buildEChartsOption(t), true); // 首次全量渲染
        }
      } else {
        // 增量更新：只移动回放标记线，不重建数据序列（避免播放抽搐）
        activeChart.setOption({ series: [{ markLine: { animation: false, data: buildMarkLineData(t) } }] });
      }
      if (activeChart) return;
      // 纯 SVG 兜底
      const markers = cmp.markers.map(m => ({ x: m.minute, label: m.label, color: m.minute === cmp.execMinute ? '#3fb950' : '#8b949e' }));
      markers.push({ x: t, label: `◉ t=${t}min`, color: '#f0f6fc', dashed: false });
      chartEl.innerHTML = svgLineChart({
        width: 760, height: 340,
        xMin: 0, xMax: 240, yMin, yMax,
        xFmt: v => v === 0 ? '现在' : `+${v}min`,
        yFmt: v => `${v}%`,
        yTickCount: 5,
        series: [
          { name: bExec.label, color: bExec.color, width: 2.4, points: bExec.points.map(p => [p.minute, p.value]) },
          { name: bNoop.label, color: bNoop.color, width: 2.2, dashed: true, points: bNoop.points.map(p => [p.minute, p.value]) }
        ],
        markers,
        hMarkers: [
          { y: cmp.baselineMoisture, label: `基线 ${cmp.baselineMoisture}%`, color: BASELINE_COLOR },
          { y: cmp.stressBoundary, label: `边界 ${cmp.stressBoundary}%`, color: BOUNDARY_COLOR }
        ]
      });
    };

    const updateReadouts = (t) => {
      const pExec = bExec.points.find(p => p.minute === t) || bExec.points[bExec.points.length - 1];
      const pNoop = bNoop.points.find(p => p.minute === t) || bNoop.points[bNoop.points.length - 1];
      timeEl.textContent = `t = ${t} min`;
      valExec.textContent = `${pExec.value}%`;
      valNoop.textContent = `${pNoop.value}%`;
      valDiff.textContent = `${(pExec.value - pNoop.value) >= 0 ? '+' : ''}${(pExec.value - pNoop.value).toFixed(1)}%`;
      // 盆栽联动：土壤湿度/植物状态跟随分支 A（执行）走势
      updatePot(pExec.value);
      renderChartAt(t).catch(e => console.warn('renderChartAt failed:', e));
    };

    range.addEventListener('input', () => {
      stopPlayback(); // 只停定时器，不销毁图表实例
      playBtn.innerHTML = '▶ 播放';
      updateReadouts(Number(range.value));
    });
    playBtn.addEventListener('click', () => {
      if (playTimer) { stopPlayback(); playBtn.innerHTML = '▶ 播放'; return; }
      playBtn.innerHTML = '⏸ 暂停';
      playTimer = setInterval(() => {
        let t = Number(range.value) + 5;
        if (t > 240) { t = 0; }
        range.value = t;
        updateReadouts(t);
      }, 120);
    });
    resetBtn.addEventListener('click', () => {
      stopPlayback();
      playBtn.innerHTML = '▶ 播放';
      range.value = 0;
      updateReadouts(0);
    });

    updateReadouts(0);
  };

  // 初始土壤湿度联动（设置盆栽初始土壤色与植物状态）
  updatePot(plot.metrics.SOIL_MOISTURE.value);

  return cleanup;
}
