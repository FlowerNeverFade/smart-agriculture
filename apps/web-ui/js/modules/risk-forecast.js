/**
 * AgriLoop Frontend - Module: Risk Forecast & Scenario Replay (PNG 第5点 · 预测与经营)
 *  - renderRiskForecast(container, plotId)   风险预测：Time-to-Risk 仪表盘 + 1/2/4h 置信带曲线
 *  - renderScenarioReplay(container, plotId) 情景注入 + 同一 Seed 双轨回放（EXECUTE vs NO_ACTION）
 * 图表优先使用本地 vendored ECharts（vendor/echarts.min.js，离线可用）；
 * 若 window.echarts 缺失，自动回退到纯 SVG 渲染（charts.js）。
 */
import { api } from '../api.js';
import { MOCK_DATA } from '../mock-data.js';
import { svgGauge, svgLineChart, initEChart, escapeHtml } from '../charts.js';

const BOUNDARY_COLOR = '#f85149';
const BASELINE_COLOR = '#d29922';
const MEAN_COLOR = '#58a6ff';
const AXIS_COLOR = '#8b949e';
const GRID_COLOR = '#21262d';

/** 统一深色主题 tooltip：内容紧凑、按内容自适应尺寸
 * 注意：ECharts 默认 shadowBlur:10 / shadowColor:rgba(0,0,0,.2) 会无条件注入
 * box-shadow，深色背景下形成一圈"空黑区域"，必须显式关闭；
 * line-height 由 ECharts 按 fontSize*1.5 强制生成（textStyle.lineHeight 不生效）。
 */
function darkTooltip() {
  return {
    trigger: 'axis',
    confine: true,
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    padding: [5, 8],
    shadowBlur: 0,
    shadowColor: 'transparent',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    textStyle: { color: '#f0f6fc', fontSize: 12 },
    // !important 覆盖 ECharts 默认 white-space:nowrap 与强制 line-height:fontSize*1.5
    extraCssText: 'white-space: normal !important; line-height: 16px !important; max-width: 320px; word-break: break-word;',
    axisPointer: { lineStyle: { color: '#58a6ff' } }
  };
}

/* ================================================================
 * 视图 1：未来风险预测推演 (renderRiskForecast)
 * ================================================================ */
export async function renderRiskForecast(container, plotId) {
  const loadingId = `rf-loading-${Date.now()}`;
  container.innerHTML = `
    <div class="agri-module-loading" id="${loadingId}">
      <div class="agri-spinner"></div>
      <span>正在运行确定性趋势推演 (robust-trend-v1.2)...</span>
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
  const gaugeEl = container.querySelector('[data-role="gauge"]');
  const chartEl = container.querySelector('[data-role="chart-body"]');

  const gauge = initEChart(gaugeEl);
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

  const renderChart = (horizon) => {
    const curve = data.curve.filter(p => p.minute <= horizon);
    const xMax = horizon;
    const yMin = Math.max(Math.floor(Math.min(...curve.map(p => p.lower)) - 2), 0);
    const yMax = Math.ceil(Math.max(...curve.map(p => p.upper)) + 2);

    let chart = chartEl._agriEChart || initEChart(chartEl);
    if (chart) {
      chartEl._agriEChart = chart;
      const option = {
        backgroundColor: 'transparent',
        grid: { left: 46, right: 20, top: 36, bottom: 30 },
        tooltip: darkTooltip(),
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
            tooltip: {
              // 紧凑内容：浮窗按内容自适应大小
              formatter: (params) => {
                const p = params[0];
                const c = curve.find(pt => pt.minute === Number(p.axisValue)) || {};
                return `<div style="line-height:16px">${p.axisValue === 0 ? '现在' : `+${p.axisValue}min`}</div>
                  <div style="line-height:16px">期望值：<b style="color:#58a6ff">${p.value}%</b></div>
                  <div style="line-height:16px;color:#8b949e">置信区间：${c.lower ?? '-'}% ~ ${c.upper ?? '-'}%</div>`;
              }
            },
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
    charts.forEach(c => { try { c.dispose(); } catch (e) { /* noop */ } });
    if (chartEl) chartEl._agriEChart = null;
  };
}

/* ================================================================
 * 视图 2：情景模拟器与双轨回放 (renderScenarioReplay)
 * ================================================================ */
export async function renderScenarioReplay(container, plotId) {
  const catalog = MOCK_DATA.riskForecastConfig.scenarioCatalog;
  let playTimer = null;

  container.innerHTML = `
    <div class="agri-module sr-root">

      <div class="agri-module-title">⚡ 情景模拟器与双轨回放</div>
      <div class="agri-module-sub">一键注入故障情景 → 同一冻结快照 + 同一随机种子 → 执行 vs 放任 双轨对比（只读推演，不写回主状态）</div>

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

  /** 只停止回放定时器（不销毁图表，避免画布变黑） */
  const stopPlayback = () => {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
  };

  /** 销毁全部 ECharts 实例（关闭弹窗 / 重新推演时调用） */
  const disposeCharts = () => {
    chartInstances.forEach(c => { try { c.dispose(); } catch (e) { /* noop */ } });
    chartInstances = [];
    activeChart = null;
  };

  const cleanup = () => {
    stopPlayback();
    disposeCharts();
  };

  runBtn.addEventListener('click', async () => {
    cleanup();
    const seed = Math.max(1, Math.min(99999, Number(seedInput.value) || 42));
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
        }
      ];
      return {
        backgroundColor: 'transparent',
        grid: { left: 46, right: 20, top: 36, bottom: 30 },
        tooltip: {
          ...darkTooltip(),
          // 紧凑内容：分支 A/B 数值 + 差值，浮窗按内容自适应大小
          formatter: (params) => {
            const a = params[0];
            const b = params[1];
            if (!a || !b) return '';
            const valOf = p => Number(Array.isArray(p.value) ? p.value[1] : p.value); // value 轴 data 为 [x, y]
            const av = valOf(a);
            const bv = valOf(b);
            const diff = av - bv;
            return `<div style="line-height:16px;color:#8b949e">t = ${a.axisValue} min</div>
              <div style="line-height:16px">分支 A 执行：<b style="color:#3fb950">${av.toFixed(1)}%</b></div>
              <div style="line-height:16px">分支 B 放任：<b style="color:#f85149">${bv.toFixed(1)}%</b></div>
              <div style="line-height:16px">差值：<b style="color:#d29922">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%</b></div>`;
          }
        },
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

    const renderChartAt = (t) => {
      if (!activeChart) {
        activeChart = initEChart(chartEl);
        if (activeChart) {
          chartInstances.push(activeChart);
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
      renderChartAt(t);
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
