/**
 * AgriLoop Frontend - Module: Risk Forecast & Scenario Replay (PNG 第5点 · 预测与经营)
 *  - renderRiskForecast(container, plotId)   风险预测：Time-to-Risk 仪表盘 + 1/2/4h 置信带曲线
 *  - renderScenarioReplay(container, plotId) 情景注入 + 同一 Seed 双轨回放（EXECUTE vs NO_ACTION）
 * 图表优先使用本地 vendored ECharts（vendor/echarts.min.js，离线可用）；
 * 若 window.echarts 缺失，自动回退到纯 SVG 渲染（charts.js）。
 */
import { api } from '../api.js?v=20260824-module-v5';
import { MOCK_DATA } from '../mock-data.js?v=20260824-module-v5';
import { svgGauge, svgLineChart, initEChart, attachCustomTip, escapeHtml } from '../charts.js?v=20260824-gauge-outside';
import { getTheme } from '../theme.js';

const BOUNDARY_COLOR = '#f85149';
const BASELINE_COLOR = '#d29922';
const MEAN_COLOR = '#58a6ff';
const AXIS_COLOR = '#8b949e';
const GRID_COLOR = '#21262d';

function themeTextColor() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
  if (raw) return raw;
  return getTheme() === 'light' ? '#172231' : '#f0f6fc';
}

function themeMutedColor() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
  if (raw) return raw;
  return getTheme() === 'light' ? '#627487' : '#8b949e';
}

const PLAIN_ASSUMPTIONS = {
  '无降水 / 无外界灌溉': '这段时间不会再下雨，也没有额外浇水',
  '无降水/无外界灌溉': '这段时间不会再下雨，也没有额外浇水',
  '棚室通风与外部光热保持稳定': '大棚通风和外面温度变化不大',
  '设备保持在线，遥测质量 GOOD': '传感器在线，数据质量正常'
};

function plainAssumption(text) {
  return PLAIN_ASSUMPTIONS[text] || String(text || '').replace(/\s+/g, ' ').trim();
}

function plainUncertainty(note) {
  const raw = String(note || '');
  if (raw.includes('MAD') || raw.includes('UNAVAILABLE')) {
    return '预测越远误差可能越大；数据不够时系统会直接提示“无法预测”，不会乱猜。';
  }
  return raw.replace(/置信区间/g, '可能范围').replace(/样本不足/g, '数据不够');
}

function formatTimeToRisk(v) {
  return v >= 240 ? '>240' : String(v);
}

function gaugeOption(timeToRisk) {
  const needle = themeTextColor();
  const muted = themeMutedColor();
  return {
    series: [{
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min: 0,
      max: 240,
      splitNumber: 4,
      radius: '62%',
      center: ['50%', '78%'],
      axisLine: {
        lineStyle: {
          width: 14,
          color: [[0.25, BOUNDARY_COLOR], [0.625, BASELINE_COLOR], [1, '#3fb950']]
        }
      },
      pointer: {
        length: '52%',
        width: 4,
        itemStyle: { color: needle }
      },
      anchor: { show: true, size: 8, itemStyle: { color: needle } },
      axisTick: { show: false },
      splitLine: {
        show: true,
        length: 8,
        distance: 6,
        lineStyle: { color: muted, width: 1.5 }
      },
      axisLabel: {
        distance: -22,
        color: muted,
        fontSize: 11,
        formatter: (v) => (v >= 240 ? '240+' : `${v}`)
      },
      detail: { show: false },
      title: { show: false },
      data: [{ value: timeToRisk, name: '分钟后可能达到危险线' }]
    }]
  };
}

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
export async function renderRiskForecast(container, plotId, context = {}) {
  try {
    return await paintRiskForecast(container, plotId, context);
  } catch (error) {
    console.error('[AgriLoop] risk-forecast render failed:', error);
    container.innerHTML = `
      <div class="agri-alert agri-alert-danger">
        <div class="agri-alert-icon">⚠️</div>
        <div>
          <strong>预测视图渲染中断，已降级</strong>
          <p>${escapeHtml(error?.message || error)}</p>
          <p class="agri-meta-line">数据不足时回退本地演示算法；若仍失败请刷新后重试。</p>
        </div>
      </div>`;
    return () => {};
  }
}

async function paintRiskForecast(container, plotId, context = {}) {
  const loadingId = `rf-loading-${Date.now()}`;
  container.innerHTML = `
    <div class="agri-skeleton-wrap" id="${loadingId}">
      <div class="agri-skeleton agri-skeleton-title"></div>
      <div class="agri-skeleton agri-skeleton-line"></div>
      <div class="agri-skeleton agri-skeleton-line short"></div>
      <div class="agri-skeleton agri-skeleton-line"></div>
    </div>`;

  const data = await api.getRiskForecast(plotId, 'SOIL_MOISTURE');
  const plot = context.plot || MOCK_DATA.plots.find(p => p.plotId === plotId) || MOCK_DATA.plots[0];
  const horizons = Array.isArray(data?.horizons) ? data.horizons : [];
  const assumptions = Array.isArray(data?.assumptions) ? data.assumptions : [];
  const curve = Array.isArray(data?.curve) ? data.curve : [];
  const timeToRisk = Number.isFinite(Number(data?.timeToRiskMinutes)) ? Number(data.timeToRiskMinutes) : 240;
  if (!data || data.status !== 'AVAILABLE' || !horizons.length || !curve.length) {
    container.innerHTML = `
      <div class="agri-alert agri-alert-danger">
        <div class="agri-alert-icon">🚫</div>
        <div>
          <strong>暂时无法预测</strong>
          <p>${escapeHtml((data && data.reason) || '最近数据不够或阶段信息不全，系统不会编造未来数值。')}</p>
          <p class="agri-meta-line">可补测土壤湿度或检查传感器；数据恢复后重开本页。</p>
        </div>
      </div>`;
    return () => {};
  }

  const fmtTime = new Date(data.generatedAt || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });
  const zone = timeToRisk < 60
    ? { label: '高危 · 建议马上处理', cls: 'agri-pill-danger' }
    : timeToRisk < 150
      ? { label: '注意 · 建议安排补水', cls: 'agri-pill-warn' }
      : { label: '暂时安全 · 继续观察', cls: 'agri-pill-ok' };
  const plotName = plot?.name || plotId || '示范地块';
  const plotCrop = plot?.cropName || plot?.cropCode || '作物';
  const plotStage = plot?.stageLabel || plot?.stageCode || '当前阶段';
  const inputHours = Math.max(1, Math.round(Number(data.inputWindowMinutes || 60) / 60));
  const forecastHours = Math.max(1, Math.round(Number(data.forecastRangeMinutes || 240) / 60));

  container.innerHTML = `
    <div class="agri-module rf-root">

      <div class="rf-header">
        <div>
          <div class="agri-module-title">🔮 未来风险预测 · ${escapeHtml(plotName)}</div>
          <div class="agri-module-sub">${escapeHtml(plotCrop)} · ${escapeHtml(plotStage)} · 土壤湿度 · 近 ${inputHours}h 数据 · 预测 ${forecastHours}h</div>
        </div>
        <div class="rf-header-right">
          <button class="cmd-nav-btn" data-nav="scenario-replay">⚡ 情景模拟</button>
          <button class="cmd-nav-btn" data-nav="value-ledger">💰 效益对账</button>
          <span class="agri-pill ${zone.cls}">${zone.label}</span>
        </div>
      </div>

      <div class="rf-top-grid">
        <div class="agri-card rf-gauge-card">
          <div class="agri-card-title">⏱️ 预计多久会缺水</div>
          <div class="rf-gauge-body">
            <div class="rf-gauge-readout">
              <strong class="rf-gauge-readout-value agri-mono">${formatTimeToRisk(timeToRisk)}</strong>
              <span class="rf-gauge-readout-label">分钟后可能达到危险线</span>
            </div>
            <div class="rf-gauge-chart" data-role="gauge"></div>
          </div>
          <div class="rf-gauge-foot">当前 <b class="agri-mono">${data.startMoisture}%</b>，低于 <b class="agri-mono">${data.stressBoundary}%</b> 进危险区（适宜下限 <b class="agri-mono">${data.baselineMoisture}%</b>）</div>
        </div>

        <div class="rf-horizons">
          ${horizons.map(h => `
            <div class="agri-card rf-horizon-card">
              <div class="rf-horizon-head">
                <span class="rf-horizon-label">${h.minute >= 60 ? `${Math.round(h.minute / 60)} 小时后` : `${h.minute} 分钟后`}</span>
                <span class="rf-horizon-expected">${h.expected}%</span>
              </div>
              <div class="rf-horizon-band">可能范围 ${h.band}</div>
              <div class="rf-horizon-bar">
                <div class="rf-horizon-bar-fill" style="width: ${Math.min(Math.max((h.expected - data.stressBoundary) / (data.baselineMoisture - data.stressBoundary) * 100, 4), 100)}%;"></div>
              </div>
              <div class="rf-horizon-meta">适宜下限 ${data.baselineMoisture}% · 危险线 ${data.stressBoundary}%</div>
            </div>
          `).join('')}
          <div class="agri-card rf-assumption-card">
            <div class="agri-card-title">🧾 预测前提</div>
            <ul class="agri-kv-list">
              ${assumptions.map(a => `<li><span class="agri-kv-key">前提</span><span>${escapeHtml(plainAssumption(a))}</span></li>`).join('')}
              <li><span class="agri-kv-key">说明</span><span>${escapeHtml(plainUncertainty(data.uncertaintyNote))}</span></li>
            </ul>
          </div>
        </div>
      </div>

      <div class="agri-card rf-chart-card">
        <div class="rf-chart-head">
          <div class="agri-card-title">📉 湿度趋势</div>
          <div class="rf-horizon-toggles" data-role="horizon-toggles">
            ${[60, 120, 240].map(m => `
              <button class="rf-toggle-chip ${m === 240 ? 'active' : ''}" data-min="${m}">${m === 60 ? '1 小时' : m === 120 ? '2 小时' : '4 小时'}</button>
            `).join('')}
          </div>
        </div>
        <div class="rf-chart-body" data-role="chart-body"></div>
        <div class="rf-chart-legend">
          <span class="rf-legend-item"><i style="background:#58a6ff"></i>最可能值</span>
          <span class="rf-legend-item"><i class="rf-legend-band"></i>可能范围</span>
          <span class="rf-legend-item"><i style="background:#d29922"></i>适宜下限 ${data.baselineMoisture}%</span>
          <span class="rf-legend-item"><i style="background:#f85149"></i>危险线 ${data.stressBoundary}%</span>
        </div>
      </div>

      <div class="agri-card rf-meta-card">
        <div class="agri-card-title">📋 预测信息</div>
        <div class="rf-meta-grid">
          <div><span class="agri-kv-key">生成时间</span><span>${fmtTime}</span></div>
          <div><span class="agri-kv-key">参考数据</span><span>近 ${data.inputWindowMinutes}min 传感器读数</span></div>
          <div><span class="agri-kv-key">预测时长</span><span>未来 ${forecastHours}h（1/2/4h 三档）</span></div>
          <div><span class="agri-kv-key">计算版本</span><span class="agri-mono">${escapeHtml(data.algorithmVersion)}</span></div>
          <div><span class="agri-kv-key">状态</span><span class="agri-pill agri-pill-ok">可查看</span></div>
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
    try {
    gauge.setOption(gaugeOption(timeToRisk));
    charts.push(gauge);
    } catch (error) {
      console.warn('Risk forecast gauge setOption failed:', error);
      try { gauge.dispose(); } catch (e) { /* noop */ }
      if (gaugeEl) {
        gaugeEl.innerHTML = svgGauge({
          width: 320, height: 220, value: timeToRisk, min: 0, max: 240,
          hideCenterText: true,
          format: v => v >= 240 ? '>240' : v,
          zones: [
            { from: 0, to: 60, color: BOUNDARY_COLOR },
            { from: 60, to: 150, color: BASELINE_COLOR, opacity: 0.75 },
            { from: 150, to: 240, color: '#3fb950', opacity: 0.6 }
          ]
        });
      }
    }
  } else if (gaugeEl) {
    gaugeEl.innerHTML = svgGauge({
      width: 320, height: 220, value: timeToRisk, min: 0, max: 240,
      hideCenterText: true,
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
    const seriesCurve = curve.filter(p => p.minute <= horizon);
    if (!seriesCurve.length || !chartEl) return;
    const xMax = horizon;
    const yMin = Math.max(Math.floor(Math.min(...seriesCurve.map(p => p.lower)) - 2), 0);
    const yMax = Math.ceil(Math.max(...seriesCurve.map(p => p.upper)) + 2);

    let chart = chartEl._agriEChart || await initEChart(chartEl);
    if (!container.isConnected || !container.querySelector('[data-role="horizon-toggles"]')) return;
    if (chart) {
      chartEl._agriEChart = chart;
      // 原生 tooltip 仅保留 axisPointer 十字线，内容改由自定义浮窗渲染
      if (!chart._agriCustomTipAttached) {
        chart._agriCustomTipAttached = true;
        customTipCleanups.push(attachCustomTip(chart, (params) => {
          const p = curve[params.dataIndex];
          if (!p) return null;
          const tLabel = p.minute === 0 ? '现在' : `+${p.minute}min`;
          return `<div style="color:#8b949e">${tLabel}</div>
            <div>最可能值：<b style="color:#58a6ff">${p.expected}%</b></div>
            <div style="color:#8b949e">可能范围：${p.lower}% ~ ${p.upper}%</div>`;
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
          data: seriesCurve.map(p => p.minute),
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
            data: seriesCurve.map(p => p.upper - p.lower),
            symbol: 'none', lineStyle: { opacity: 0 },
            areaStyle: { color: 'rgba(88, 166, 255, 0.14)' },
            tooltip: { show: false }
          },
          {
            name: '置信带下界', type: 'line', stack: 'band',
            data: seriesCurve.map(p => p.lower),
            symbol: 'none', lineStyle: { opacity: 0 },
            tooltip: { show: false }
          },
          {
            name: '期望值', type: 'line',
            data: seriesCurve.map(p => p.expected),
            symbol: 'circle', symbolSize: 4, showSymbol: false,
            lineStyle: { color: MEAN_COLOR, width: 2.4 },
            itemStyle: { color: MEAN_COLOR },
            markLine: {
              silent: true,
              symbol: 'none',
              label: { color: '#8b949e', fontSize: 10, position: 'insideEndTop' },
              lineStyle: { type: 'dashed' },
              data: [
                { yAxis: data.baselineMoisture, lineStyle: { color: BASELINE_COLOR }, label: { formatter: `适宜下限 ${data.baselineMoisture}%`, color: BASELINE_COLOR } },
                { yAxis: data.stressBoundary, lineStyle: { color: BOUNDARY_COLOR }, label: { formatter: `危险线 ${data.stressBoundary}%`, color: BOUNDARY_COLOR } }
              ]
            }
          },
          {
            // 隐形宽线命中区：扩大鼠标靠近曲线的浮窗判定范围（±8px），不参与渲染
            name: '期望值命中区', type: 'line',
            data: seriesCurve.map(p => p.expected),
            symbol: 'none',
            lineStyle: { width: 16, opacity: 0 },
            tooltip: { show: false },
            z: 3
          }
        ]
      };
      try {
        chart.setOption(option, true);
        if (!charts.includes(chart)) charts.push(chart);
      } catch (error) {
        console.warn('Risk forecast chart setOption failed:', error);
        try { chart.dispose(); } catch (e) { /* noop */ }
        chartEl._agriEChart = null;
        chart = null;
      }
    } else if (chartEl) {
      chartEl.innerHTML = svgLineChart({
        width: 760, height: 330,
        xMin: 0, xMax, yMin, yMax,
        xFmt: v => v === 0 ? '现在' : `+${v}min`,
        yFmt: v => `${v}%`,
        yTickCount: 5,
        series: [{
          name: '期望值', color: MEAN_COLOR, width: 2.4,
          points: seriesCurve.map(p => [p.minute, p.expected])
        }],
        bands: [{
          upper: seriesCurve.map(p => [p.minute, p.upper]),
          lower: seriesCurve.map(p => [p.minute, p.lower]),
          color: MEAN_COLOR, opacity: 0.14
        }],
        hMarkers: [
          { y: data.baselineMoisture, label: `适宜下限 ${data.baselineMoisture}%`, color: BASELINE_COLOR },
          { y: data.stressBoundary, label: `危险线 ${data.stressBoundary}%`, color: BOUNDARY_COLOR }
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
  toggles?.addEventListener('click', (e) => {
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
export async function renderScenarioReplay(container, plotId) {
  const catalog = Array.isArray(MOCK_DATA.riskForecastConfig?.scenarioCatalog)
    ? MOCK_DATA.riskForecastConfig.scenarioCatalog
    : [];
  let playTimer = null;

  container.innerHTML = `
    <div class="agri-module sr-root">

      <div class="agri-module-title">⚡ 情景模拟器</div>
      <div class="agri-module-sub">选择情景 → 同一种子双轨对比（只读推演，不写回主状态）
        <span style="margin-left:10px">
          <button class="cmd-nav-btn" data-nav="risk-forecast">🔮 风险预测</button>
          <button class="cmd-nav-btn" data-nav="value-ledger">💰 效益对账</button>
        </span>
      </div>

      <div class="agri-card sr-inject-card">
        <div class="agri-card-title">🎛️ 情景注入</div>
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
          <label class="sr-seed-label" for="srSeedInput">Seed</label>
          <input type="number" class="sr-seed-input" id="srSeedInput" value="42" min="1" max="99999">
          <span class="sr-seed-hint">同一种子可复现</span>
          <button class="btn btn-primary" data-role="run-btn" disabled>▶ 运行推演</button>
        </div>
      </div>

      <div data-role="run-output"></div>
    </div>`;

  const runBtn = container.querySelector('[data-role="run-btn"]');
  const runOutput = container.querySelector('[data-role="run-output"]');
  const seedInput = container.querySelector('#srSeedInput');
  let selectedScenario = 'DROUGHT';
  let chartInstances = [];
  let activeChart = null; // 当前双轨图的 ECharts 实例（跨 renderRunOutput 生命周期）

  container.querySelectorAll('.sr-scenario-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.sr-scenario-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedScenario = btn.dataset.scenario;
      runBtn.disabled = false;
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

  runBtn?.addEventListener('click', async () => {
    const seedRaw = String(seedInput.value).trim();
    if (seedRaw === '') {
      // 空种子必须拦截：缺失随机种子时推演不可复现，禁止运行
      seedInput.classList.add('sr-seed-error');
      runOutput.innerHTML = `
        <div class="agri-alert agri-alert-danger">
          <div class="agri-alert-icon">⚠️</div>
          <div><strong>缺少随机种子</strong><p>请填写 Seed（1 ~ 99999）后再运行。</p></div>
        </div>`;
      return;
    }
    seedInput.classList.remove('sr-seed-error');
    const seed = Math.max(1, Math.min(99999, Number(seedRaw)));
    stopPlayback();
    disposeCharts();
    runBtn.disabled = true;
    runBtn.innerHTML = '<span>⏳ 推演中...</span>';

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
      runBtn.innerHTML = '<span>▶ 运行推演</span>';
    }
  });

  const renderRunOutput = (run, cmp, seed) => {
    if (cmp.status !== 'AVAILABLE') {
      runOutput.innerHTML = `
        <div class="agri-card">
          <div class="agri-alert agri-alert-danger">
            <div class="agri-alert-icon">🚫</div>
            <div>
              <strong>推演不可用：${escapeHtml(run.scenarioLabel)}</strong>
              <p>${escapeHtml(cmp.reason)}</p>
              <p class="agri-meta-line">数据不足时不生成预测，已显示降级状态。</p>
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
      conclusion = `补水后 4h 未触达 ${cmp.stressBoundary}% 边界（放任 t=${breachNoop.minute}min 触达）`;
    } else if (breachNoop && breachExec) {
      const delay = breachExec.minute - breachNoop.minute;
      conclusionCls = delay > 0 ? 'ok' : 'warn';
      conclusion = delay > 0
        ? `越界推迟 ${delay} 分钟（A t=${breachExec.minute}min vs B t=${breachNoop.minute}min）`
        : '越界时刻未改变（补水量不足）';
    } else if (!breachNoop && !breachExec) {
      conclusion = '两分支 4h 均未触达边界，影响有限';
      conclusionCls = 'warn';
    } else {
      conclusion = '执行越界但放任未越界（需复核）';
      conclusionCls = 'warn';
    }
    const summaryHtml = `
      <div class="sr-summary">
        <div class="sr-summary-item">
          <span>4h 末端</span>
          <b class="agri-mono" style="color:#3fb950">A ${lastExec.value}%</b>
          <b class="agri-mono" style="color:#f85149">B ${lastNoop.value}%</b>
          <span class="agri-mono sr-summary-diff">Δ ${endDiff >= 0 ? '+' : ''}${endDiff.toFixed(1)}%</span>
        </div>
        <div class="sr-summary-item">
          <span>触达边界（${cmp.stressBoundary}%）</span>
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
            <span>快照：${escapeHtml(run.frozenSnapshot.plotName)} · ${cmp.frozenSnapshot.startMoisture}%</span>
          </div>
        </div>

        <div class="agri-card-title">🛤️ 双轨对比</div>
        <div class="sr-chart-body" data-role="sr-chart"></div>
        <div class="rf-chart-legend">
          <span class="rf-legend-item"><i style="background:#3fb950"></i>分支 A · 执行灌溉</span>
          <span class="rf-legend-item"><i style="background:#f85149"></i>分支 B · 放任干旱</span>
          <span class="rf-legend-item"><i style="background:#d29922"></i>适宜基线 ${cmp.baselineMoisture}%</span>
          <span class="rf-legend-item"><i style="background:#f85149"></i>胁迫边界 ${cmp.stressBoundary}%</span>
        </div>

        <div class="sr-scrubber">
          <div class="sr-scrubber-head">
            <span>⏪ 回放</span>
            <span class="sr-scrubber-time agri-mono" data-role="scrub-time">t = 0 min</span>
          </div>
          <div class="sr-scrubber-controls">
            <button class="btn btn-secondary" data-role="play-btn">▶ 播放</button>
            <input type="range" class="sr-range" data-role="scrub-range" min="0" max="240" step="5" value="0">
            <button class="btn btn-secondary" data-role="reset-btn">⏮ 复位</button>
          </div>
          <div class="sr-readouts">
            <div class="sr-readout" style="border-color:#3fb950">
              <span>A · 执行灌溉</span>
              <b class="agri-mono" data-role="val-exec">${bExec.points[0].value}%</b>
            </div>
            <div class="sr-readout" style="border-color:#f85149">
              <span>B · 放任干旱</span>
              <b class="agri-mono" data-role="val-noop">${bNoop.points[0].value}%</b>
            </div>
            <div class="sr-readout">
              <span>差值</span>
              <b class="agri-mono" data-role="val-diff">+0.0%</b>
            </div>
          </div>
        </div>

        ${summaryHtml}

        <div class="agri-meta-line">${escapeHtml(cmp.note)}</div>
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
              <div>A 执行：<b style="color:#3fb950">${pa.value.toFixed(1)}%</b></div>
              <div>B 放任：<b style="color:#f85149">${pb.value.toFixed(1)}%</b></div>
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

  return cleanup;
}
