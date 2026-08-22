import {
  escapeHtml,
  formatNumber,
  formatPercent,
  provenanceBadge,
  toNumber
} from './task5-utils.js';

function demoLedger() {
  return {
    valueLedgerId: 'value-demo-20260822',
    scope: 'farm-demo',
    status: 'COMPUTED',
    baseline: { waterLitres: 1680, source: 'USER_PROVIDED' },
    actual: { waterLitres: 1240, source: 'OBSERVED', sourceMode: 'SIMULATION' },
    counterfactual: { waterLitres: 1680, source: 'SIMULATED' },
    metrics: { waterSavingLitres: 440, waterCost: 4.96, waterDeviationRate: -0.2619, energySavingKwh: 8.4, labourSavingHours: 3.6, costSaving: 12.74 },
    periodSeries: [
      { label: '周一', planned: 380, actual: 318 }, { label: '周二', planned: 420, actual: 304 },
      { label: '周三', planned: 410, actual: 296 }, { label: '周四', planned: 390, actual: 322 },
      { label: '周五', planned: 430, actual: 318 }, { label: '周六', planned: 360, actual: 282 },
      { label: '周日', planned: 380, actual: 310 }
    ],
    counterfactualSeries: [
      { label: '基线', baseline: 0, closedLoop: 0 }, { label: '第 1 次', baseline: 8.4, closedLoop: 6.8 },
      { label: '第 2 次', baseline: 17.3, closedLoop: 12.9 }, { label: '第 3 次', baseline: 26.1, closedLoop: 18.1 },
      { label: '第 4 次', baseline: 35.5, closedLoop: 23.2 }, { label: '第 5 次', baseline: 45.1, closedLoop: 28.7 },
      { label: '第 6 次', baseline: 54.8, closedLoop: 34.1 }
    ],
    sourceLabels: ['OBSERVED', 'USER_PROVIDED', 'DERIVED', 'SIMULATED', 'ESTIMATED'],
    assumptions: ['水价 0.004 元/L', '泵功率与工时采用示范配置估算', '不包含产量和市场价格因果归因'],
    algorithmVersion: 'value-ledger-v1',
    formula: '(baselineWaterLitres - actualWaterLitres), actualWaterLitres × unitCost',
    createdAt: '2026-08-22T08:00:00.000Z'
  };
}

function normalizeLedger(value) {
  const base = demoLedger();
  const ledger = { ...base, ...(value || {}) };
  const hasRemoteValue = Boolean(value);
  ledger.baseline = { ...base.baseline, ...(value?.baseline || {}) };
  ledger.actual = { ...base.actual, ...(value?.actual || {}) };
  ledger.counterfactual = { ...base.counterfactual, ...(value?.counterfactual || {}) };
  ledger.metrics = {
    ...(hasRemoteValue ? { waterSavingLitres: 0, waterCost: 0, waterDeviationRate: null, energySavingKwh: 0, labourSavingHours: 0, costSaving: 0 } : base.metrics),
    ...(value?.metrics || {})
  };
  ledger.periodSeries = Array.isArray(value?.periodSeries) && value.periodSeries.length
    ? value.periodSeries
    : hasRemoteValue
      ? [{ label: '当前快照', planned: toNumber(ledger.baseline.waterLitres), actual: toNumber(ledger.actual.waterLitres) }]
      : base.periodSeries;
  ledger.counterfactualSeries = Array.isArray(value?.counterfactualSeries) && value.counterfactualSeries.length
    ? value.counterfactualSeries
    : hasRemoteValue
      ? []
      : base.counterfactualSeries;
  ledger.sourceLabels = value?.sourceLabels || base.sourceLabels;
  ledger.assumptions = value?.assumptions || base.assumptions;
  return ledger;
}

function buildBarChart(series) {
  const width = 780;
  const height = 280;
  const padding = { top: 20, right: 20, bottom: 44, left: 44 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(...series.flatMap(item => [toNumber(item.planned), toNumber(item.actual)]), 1) * 1.16;
  const groupWidth = chartWidth / series.length;
  const barWidth = Math.min(24, groupWidth * 0.22);
  const y = value => padding.top + (max - toNumber(value)) / max * chartHeight;
  const grid = [0, 0.5, 1].map(ratio => {
    const value = max * ratio;
    const yy = y(value);
    return `<line x1="${padding.left}" y1="${yy}" x2="${width - padding.right}" y2="${yy}" class="task5-chart-grid"/><text x="${padding.left - 9}" y="${yy + 4}" class="task5-chart-axis" text-anchor="end">${formatNumber(value, 0)}</text>`;
  }).join('');
  const bars = series.map((item, index) => {
    const center = padding.left + groupWidth * index + groupWidth / 2;
    const planned = toNumber(item.planned);
    const actual = toNumber(item.actual);
    const plannedY = y(planned);
    const actualY = y(actual);
    return `<g class="task5-bar-group"><rect x="${center - barWidth - 2}" y="${plannedY}" width="${barWidth}" height="${padding.top + chartHeight - plannedY}" rx="4" class="task5-bar planned"><title>${escapeHtml(item.label)} · 计划 ${formatNumber(planned)} L</title></rect><rect x="${center + 2}" y="${actualY}" width="${barWidth}" height="${padding.top + chartHeight - actualY}" rx="4" class="task5-bar actual"><title>${escapeHtml(item.label)} · 实际 ${formatNumber(actual)} L</title></rect><text x="${center}" y="${height - 16}" class="task5-chart-axis" text-anchor="middle">${escapeHtml(item.label)}</text></g>`;
  }).join('');
  return `<svg class="task5-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="计划用水与实际用水柱状对比"><defs><linearGradient id="task5PlanBar" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#8b949e"/><stop offset="1" stop-color="#30363d"/></linearGradient><linearGradient id="task5ActualBar" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#58a6ff"/><stop offset="1" stop-color="#1f6feb"/></linearGradient></defs>${grid}${bars}</svg>`;
}

function buildAreaChart(series) {
  if (!series?.length) return '<div class="task5-unavailable"><span>∅</span><strong>INCOMPLETE</strong><small>缺少可追溯的反事实成本窗口</small></div>';
  const width = 780;
  const height = 280;
  const padding = { top: 20, right: 20, bottom: 44, left: 44 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(...series.flatMap(item => [toNumber(item.baseline), toNumber(item.closedLoop)]), 1) * 1.16;
  const x = index => padding.left + index / Math.max(1, series.length - 1) * chartWidth;
  const y = value => padding.top + (max - toNumber(value)) / max * chartHeight;
  const grid = [0, 0.5, 1].map(ratio => { const value = max * ratio; const yy = y(value); return `<line x1="${padding.left}" y1="${yy}" x2="${width - padding.right}" y2="${yy}" class="task5-chart-grid"/><text x="${padding.left - 9}" y="${yy + 4}" class="task5-chart-axis" text-anchor="end">¥${formatNumber(value, 0)}</text>`; }).join('');
  const baseline = series.map((item, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(2)} ${y(item.baseline).toFixed(2)}`).join(' ');
  const closedLoop = series.map((item, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(2)} ${y(item.closedLoop).toFixed(2)}`).join(' ');
  const area = `${closedLoop} L ${x(series.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;
  const dots = series.map((item, index) => `<circle cx="${x(index)}" cy="${y(item.closedLoop)}" r="4" class="task5-area-dot"><title>${escapeHtml(item.label)} · 农智闭环 ¥${formatNumber(item.closedLoop, 1)}</title></circle>`).join('');
  const labels = series.map((item, index) => `<text x="${x(index)}" y="${height - 16}" class="task5-chart-axis" text-anchor="middle">${escapeHtml(item.label)}</text>`).join('');
  return `<svg class="task5-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="传统灌溉与农智闭环成本反事实推演"><defs><linearGradient id="task5CostArea" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#a371f7" stop-opacity=".28"/><stop offset="1" stop-color="#a371f7" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#task5CostArea)" class="task5-area-fill"/><path d="${baseline}" class="task5-baseline-line"/><path d="${closedLoop}" class="task5-closed-loop-line"/>${dots}${labels}</svg>`;
}

function ledgerRows(ledger) {
  const metrics = ledger.metrics || {};
  const saving = toNumber(metrics.waterSavingLitres, 0);
  return [
    { item: '水资源', value: `${formatNumber(saving, 0)} L`, detail: `基线 ${formatNumber(ledger.baseline.waterLitres, 0)} → 实际 ${formatNumber(ledger.actual.waterLitres, 0)}`, source: 'DERIVED', tone: 'blue' },
    { item: '水费折算', value: `¥${formatNumber(metrics.waterCost, 2)}`, detail: '实际用水 × 农场水价', source: 'DERIVED', tone: 'green' },
    { item: '节电等效', value: `${formatNumber(metrics.energySavingKwh, 1)} kWh`, detail: '泵功率 × 运行时长（估算）', source: metrics.energySavingKwh ? 'ESTIMATED' : 'UNAVAILABLE', tone: 'purple' },
    { item: '工时等效', value: `${formatNumber(metrics.labourSavingHours, 1)} h`, detail: '巡检/重复操作减少（估算）', source: metrics.labourSavingHours ? 'ESTIMATED' : 'UNAVAILABLE', tone: 'amber' },
    { item: '综合成本差', value: `¥${formatNumber(metrics.costSaving, 2)}`, detail: '仅展示可计算资源，不等同利润', source: metrics.costSaving ? 'SIMULATED' : 'UNAVAILABLE', tone: 'red' }
  ];
}

function metricCard(label, value, detail, tone) {
  return `<article class="task5-metric-card tone-${tone}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`;
}

export function renderValueLedger(container, context = {}) {
  const api = context.api;
  const notify = context.notify || (() => {});
  const state = { ledger: normalizeLedger(null), ledgers: [], loading: false, savedAt: null };

  container.dataset.task5View = 'value-ledger';
  container.innerHTML = `
    <div class="task5-view task5-ledger-view">
      <section class="task5-hero task5-hero-ledger">
        <div>
          <div class="task5-eyebrow"><span class="task5-signal-dot"></span> CAP-12 · VALUE PROVENANCE</div>
          <h2>经营价值 <span class="task5-gradient-word">&amp; 效益对账本</span></h2>
          <p>把节水、节电、工时和成本拆成可复算的证据链，不把模拟数字包装成利润。</p>
        </div>
        <div class="task5-hero-actions"><span class="task5-live-chip" data-ledger-status>LOCAL · COMPUTED</span><button type="button" class="task5-button task5-button-ghost" data-ledger-refresh>↻ 刷新账本</button></div>
      </section>

      <section class="task5-ledger-summary">
        <div class="task5-ledger-summary-copy"><span class="task5-card-kicker">RECONCILIATION WINDOW</span><h3>今日闭环资源表现</h3><p>计划、实际、基线与反事实分开保存；每一张卡片都能下钻到来源与公式。</p><div class="task5-source-row" data-ledger-sources></div></div>
        <div class="task5-ledger-status-block"><span class="task5-status-badge is-success" data-ledger-badge>COMPUTED</span><strong data-ledger-id>value-demo-20260822</strong><small data-ledger-updated>快照时间 —</small></div>
      </section>

      <section class="task5-ledger-metrics" data-ledger-metrics></section>

      <section class="task5-ledger-chart-grid">
        <article class="task5-card task5-ledger-chart-card"><div class="task5-card-head"><div><div class="task5-card-kicker">DEVIATION RATE · LITRES</div><h3>计划用水 vs 实际用水</h3></div><div class="task5-chart-legend"><span><i class="legend-dot planned"></i>计划</span><span><i class="legend-dot actual"></i>实际</span></div></div><div class="task5-chart-wrap" data-ledger-bars></div><div class="task5-chart-foot"><span>偏差率</span><strong data-ledger-deviation>—</strong><small>实际 − 计划 / 计划</small></div></article>
        <article class="task5-card task5-ledger-chart-card"><div class="task5-card-head"><div><div class="task5-card-kicker">COUNTERFACTUAL · CUMULATIVE COST</div><h3>粗放灌溉 vs 农智闭环</h3></div><div class="task5-chart-legend"><span><i class="legend-dot baseline"></i>传统基线</span><span><i class="legend-dot closed-loop"></i>农智闭环</span></div></div><div class="task5-chart-wrap" data-ledger-area></div><div class="task5-chart-foot"><span>当前可归因差异</span><strong data-ledger-cost-delta>—</strong><small>不包含产量与市场价格</small></div></article>
      </section>

      <section class="task5-ledger-bottom-grid">
        <article class="task5-card task5-ledger-table-card"><div class="task5-card-head"><div><div class="task5-card-kicker">LEDGER LINES</div><h3>资源价值逐项对账</h3></div><span class="task5-readonly-chip">来源可追溯</span></div><div class="task5-ledger-table" data-ledger-table></div></article>
        <article class="task5-card task5-ledger-form-card"><div class="task5-card-head"><div><div class="task5-card-kicker">RE-COMPUTE</div><h3>核算一笔新快照</h3></div><span class="task5-readonly-chip">POST /value-ledgers</span></div><form data-ledger-form><label>计划/基线用水 (L)<input name="planned" type="number" min="0" step="1" value="1680" required></label><label>实际用水 (L)<input name="actual" type="number" min="0" step="1" value="1240" required></label><label>水价 (元/L)<input name="unitCost" type="number" min="0" step="0.001" value="0.004" required></label><button class="task5-button task5-button-primary full" type="submit" data-ledger-submit>✦ 计算并保存快照</button></form><div class="task5-form-note">系统会保留 <code>USER_PROVIDED</code> 基线、<code>OBSERVED/SIMULATION</code> 实际值和可复算公式。</div></article>
      </section>

      <section class="task5-ledger-disclosure"><span>诚实边界</span><p>当前账本只覆盖资源与成本口径。没有产量、市场价格和因果实验数据时，系统不会输出“增产利润”或“避免损失”结论。</p><span class="task5-formula">(baselineWaterLitres − actualWaterLitres), actualWaterLitres × unitCost</span></section>
    </div>
  `;

  const $ = selector => container.querySelector(selector);
  const els = {
    status: $('[data-ledger-status]'), badge: $('[data-ledger-badge]'), id: $('[data-ledger-id]'), updated: $('[data-ledger-updated]'),
    sources: $('[data-ledger-sources]'), metrics: $('[data-ledger-metrics]'), bars: $('[data-ledger-bars]'), area: $('[data-ledger-area]'),
    deviation: $('[data-ledger-deviation]'), costDelta: $('[data-ledger-cost-delta]'), table: $('[data-ledger-table]'), form: $('[data-ledger-form]'), submit: $('[data-ledger-submit]')
  };

  function renderLedger() {
    const ledger = state.ledger;
    const metrics = ledger.metrics || {};
    const computed = ledger.status === 'COMPUTED';
    els.status.textContent = context.isLive ? 'LIVE · RECONCILED' : 'LOCAL · COMPUTED';
    els.badge.textContent = ledger.status || 'INCOMPLETE';
    els.badge.classList.toggle('is-warning', !computed);
    els.id.textContent = ledger.valueLedgerId || '—';
    els.updated.textContent = ledger.createdAt ? `快照 ${new Date(ledger.createdAt).toLocaleString('zh-CN')}` : '快照时间 —';
    els.sources.innerHTML = (ledger.sourceLabels || []).map(provenanceBadge).join('');
    els.metrics.innerHTML = [
      metricCard('累计节水', `${formatNumber(metrics.waterSavingLitres, 0)} L`, `偏差率 ${formatPercent(metrics.waterDeviationRate, 1)}`, 'blue'),
      metricCard('水费折算', `¥${formatNumber(metrics.waterCost, 2)}`, '实际用水 × 0.004 元/L', 'green'),
      metricCard('节电等效', `${formatNumber(metrics.energySavingKwh, 1)} kWh`, '泵功率/时长 · 估算', 'purple'),
      metricCard('工时等效', `${formatNumber(metrics.labourSavingHours, 1)} h`, '重复巡检减少 · 估算', 'amber'),
      metricCard('可计算成本差', `¥${formatNumber(metrics.costSaving, 2)}`, '不等同利润', 'red')
    ].join('');
    els.bars.innerHTML = buildBarChart(ledger.periodSeries);
    els.area.innerHTML = buildAreaChart(ledger.counterfactualSeries);
    els.deviation.textContent = formatPercent(metrics.waterDeviationRate, 1);
    if (ledger.counterfactualSeries?.length) {
      const counterfactual = ledger.counterfactualSeries.at(-1)?.baseline ?? ledger.baseline.waterLitres;
      const closedLoop = ledger.counterfactualSeries.at(-1)?.closedLoop ?? metrics.costSaving;
      els.costDelta.textContent = `¥${formatNumber(toNumber(counterfactual) - toNumber(closedLoop), 1)}`;
    } else {
      els.costDelta.textContent = '—';
    }
    els.table.innerHTML = ledgerRows(ledger).map(row => `<div class="task5-ledger-row"><span class="ledger-row-main"><i class="ledger-row-dot tone-${row.tone}"></i><strong>${row.item}</strong><small>${row.detail}</small></span><strong class="ledger-row-value">${row.value}</strong>${provenanceBadge(row.source)}</div>`).join('');
  }

  async function loadLedgers() {
    if (state.loading) return;
    state.loading = true;
    els.status.textContent = 'LOADING…';
    try {
      const response = api?.getValueLedgers ? await api.getValueLedgers() : [];
      if (context.isCurrent && !context.isCurrent()) return;
      state.ledgers = Array.isArray(response) ? response : [];
      state.ledger = normalizeLedger(state.ledgers[0] || null);
      renderLedger();
    } catch (error) {
      state.ledger = normalizeLedger(null);
      renderLedger();
      notify(`账本读取失败，已切换本地快照：${error.message}`, 'info');
    } finally {
      state.loading = false;
    }
  }

  async function createSnapshot(event) {
    event.preventDefault();
    const data = new FormData(els.form);
    const planned = toNumber(data.get('planned'));
    const actual = toNumber(data.get('actual'));
    const unitCost = toNumber(data.get('unitCost'));
    els.submit.disabled = true;
    els.submit.textContent = '⏳ 核算中…';
    try {
      const result = api?.createValueLedger ? await api.createValueLedger({ plannedWaterLitres: planned, actualWaterLitres: actual, waterPricePerLitre: unitCost, scope: 'farm-demo' }) : null;
      if (context.isCurrent && !context.isCurrent()) return;
      state.ledger = normalizeLedger(result || { baseline: { waterLitres: planned }, actual: { waterLitres: actual }, metrics: { waterSavingLitres: planned - actual, waterCost: actual * unitCost, waterDeviationRate: planned ? (actual - planned) / planned : null, costSaving: (planned - actual) * unitCost }, status: planned > 0 ? 'COMPUTED' : 'INCOMPLETE', valueLedgerId: `value-local-${Date.now()}`, createdAt: new Date().toISOString() });
      state.ledgers.unshift(state.ledger);
      renderLedger();
      notify(`价值快照 ${state.ledger.valueLedgerId} 已保存`, 'success');
    } catch (error) {
      notify(`账本核算失败：${error.message}`, 'error');
    } finally {
      els.submit.disabled = false;
      els.submit.textContent = '✦ 计算并保存快照';
    }
  }

  $('[data-ledger-refresh]')?.addEventListener('click', loadLedgers);
  els.form?.addEventListener('submit', createSnapshot);
  loadLedgers();
  return { refresh: loadLedgers, getState: () => ({ ...state }) };
}
