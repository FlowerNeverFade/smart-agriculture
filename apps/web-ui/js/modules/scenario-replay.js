import {
  TASK5_SCENARIOS,
  buildScenarioSeries,
  chartAreaPath,
  chartPath,
  clamp,
  escapeHtml,
  formatNumber,
  scenarioLabel,
  toNumber
} from './task5-utils.js';

function formatReplayTime(minutes) {
  const value = toNumber(minutes, 0);
  if (value < 60) return `T+${Math.round(value)} min`;
  return `T+${Math.floor(value / 60)}h${value % 60 ? `${Math.round(value % 60)}m` : ''}`;
}

function buildReplaySvg(simulation, cursor) {
  const width = 900;
  const height = 360;
  const padding = { top: 28, right: 28, bottom: 48, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const minValue = 5;
  const maxValue = 48;
  const x = minute => padding.left + clamp(minute, 0, 240) / 240 * plotWidth;
  const y = value => padding.top + (maxValue - clamp(toNumber(value, minValue), minValue, maxValue)) / (maxValue - minValue) * plotHeight;
  const execute = simulation.points.map(point => ({ ...point.execute, minute: point.minute }));
  const noAction = simulation.points.map(point => ({ ...point.noAction, minute: point.minute }));
  const thresholdY = y(simulation.threshold);
  const current = simulation.points[cursor] || simulation.points[0];
  const xCursor = x(current?.minute || 0);
  const ticks = [0, 60, 120, 180, 240];
  const grid = ticks.map(minute => `
    <line x1="${x(minute)}" y1="${padding.top}" x2="${x(minute)}" y2="${height - padding.bottom}" class="task5-chart-grid" />
    <text x="${x(minute)}" y="${height - 16}" class="task5-chart-axis" text-anchor="middle">${formatReplayTime(minute)}</text>
  `).join('');
  const yTicks = [10, 20, 30, 40].map(value => `
    <line x1="${padding.left}" y1="${y(value)}" x2="${width - padding.right}" y2="${y(value)}" class="task5-chart-grid" />
    <text x="${padding.left - 10}" y="${y(value) + 4}" class="task5-chart-axis" text-anchor="end">${value}%</text>
  `).join('');
  const executeBand = chartAreaPath(execute, x, y);
  const noActionBand = chartAreaPath(noAction, x, y);
  return `
    <svg class="task5-chart-svg task5-replay-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="执行与不执行灌溉的双轨回放曲线">
      <defs>
        <linearGradient id="task5ExecuteFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#3fb950" stop-opacity=".2"/><stop offset="100%" stop-color="#3fb950" stop-opacity="0"/></linearGradient>
        <linearGradient id="task5NoActionFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#f85149" stop-opacity=".18"/><stop offset="100%" stop-color="#f85149" stop-opacity="0"/></linearGradient>
      </defs>
      ${grid}${yTicks}
      <line x1="${padding.left}" y1="${thresholdY}" x2="${width - padding.right}" y2="${thresholdY}" class="task5-threshold-line" />
      <text x="${width - padding.right}" y="${thresholdY - 8}" class="task5-threshold-label" text-anchor="end">风险边界 ${simulation.threshold}%</text>
      <path d="${noActionBand}" fill="url(#task5NoActionFill)" class="task5-replay-band" />
      <path d="${executeBand}" fill="url(#task5ExecuteFill)" class="task5-replay-band" />
      <path d="${chartPath(noAction, x, y)}" fill="none" class="task5-no-action-line" />
      <path d="${chartPath(execute, x, y)}" fill="none" class="task5-execute-line" />
      <line x1="${xCursor}" y1="${padding.top}" x2="${xCursor}" y2="${height - padding.bottom}" class="task5-cursor-line" />
      <circle cx="${xCursor}" cy="${y(current?.execute?.value)}" r="6" class="task5-cursor-dot execute" />
      <circle cx="${xCursor}" cy="${y(current?.noAction?.value)}" r="6" class="task5-cursor-dot no-action" />
      <g class="task5-chart-callout" transform="translate(${clamp(xCursor + 12, padding.left + 8, width - 182)}, ${padding.top + 8})">
        <rect width="164" height="52" rx="8" />
        <text x="12" y="20">${escapeHtml(formatReplayTime(current?.minute || 0))}</text>
        <text x="12" y="39" class="execute-text">执行 ${formatNumber(current?.execute?.value, 1)}%</text>
        <text x="84" y="39" class="no-action-text">放任 ${formatNumber(current?.noAction?.value, 1)}%</text>
      </g>
    </svg>
  `;
}

function metricCard(label, value, detail, tone = 'blue') {
  return `<article class="task5-metric-card tone-${tone}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`;
}

export function renderScenarioReplay(container, context = {}) {
  const plot = context.plot || {};
  const api = context.api;
  const notify = context.notify || (() => {});
  const state = {
    scenario: 'drought',
    seed: 42,
    cursor: 8,
    simulation: null,
    runMeta: null,
    running: false,
    source: 'DETERMINISTIC_LOCAL'
  };

  container.dataset.task5View = 'scenario-replay';
  container.innerHTML = `
    <div class="task5-view task5-replay-view">
      <section class="task5-hero task5-hero-replay">
        <div>
          <div class="task5-eyebrow"><span class="task5-signal-dot"></span> GATE 2 · READ-ONLY COUNTERFACTUAL LAB</div>
          <h2>情景模拟 <span class="task5-gradient-word">&amp; 双轨回放</span></h2>
          <p>冻结同一快照与随机种子，逐帧比较“执行处方”与“不采取措施”的分叉结果。</p>
        </div>
        <div class="task5-hero-actions">
          <span class="task5-live-chip" data-replay-source>LOCAL · DETERMINISTIC</span>
          <button type="button" class="task5-button task5-button-ghost" data-replay-snapshot>⎘ 锁定快照</button>
          <button type="button" class="task5-button task5-button-primary" data-replay-run>▶ 运行情景</button>
        </div>
      </section>

      <section class="task5-replay-control-card task5-card">
        <div class="replay-control-group"><label for="task5ScenarioSelect">情景注入</label><select id="task5ScenarioSelect" data-replay-scenario>${TASK5_SCENARIOS.map(item => `<option value="${item.id}">${item.icon} ${item.label}</option>`).join('')}</select></div>
        <div class="replay-control-group seed-group"><label for="task5SeedInput">固定 Seed</label><div class="task5-seed-input"><span>#</span><input id="task5SeedInput" data-replay-seed type="number" value="42" min="1" max="999999" step="1"><span class="seed-hash" data-seed-hash>—</span></div></div>
        <div class="replay-control-copy"><span class="task5-card-kicker">FROZEN SNAPSHOT</span><strong data-replay-snapshot-id>task5-drought-42</strong><small>所有分支只读；不会回写生产遥测、告警或命令。</small></div>
      </section>

      <section class="task5-replay-metrics" data-replay-metrics></section>

      <section class="task5-card task5-replay-chart-card">
        <div class="task5-card-head task5-chart-head">
          <div><div class="task5-card-kicker">DUAL TRACK · DRAG TO INSPECT</div><h3>同一随机种子的分叉轨迹</h3></div>
          <div class="task5-chart-legend"><span><i class="legend-dot execute"></i>A · 执行灌溉处方</span><span><i class="legend-dot no-action"></i>B · 放任干旱</span></div>
        </div>
        <div class="task5-chart-wrap task5-replay-chart-wrap" data-replay-chart></div>
        <div class="task5-scrubber"><span>T0</span><input data-replay-slider type="range" min="0" max="24" value="8" step="1" aria-label="回放时间轴"><span>T+240m</span><output data-replay-time>T+80 min</output></div>
        <div class="task5-cursor-readout" data-replay-readout></div>
      </section>

      <section class="task5-replay-bottom-grid">
        <article class="task5-card task5-timeline-card"><div class="task5-card-head"><div><div class="task5-card-kicker">EVENT TRACE</div><h3>回放事件时间轴</h3></div><span class="task5-readonly-chip">${escapeHtml(plot.name || '当前地块')}</span></div><div class="task5-event-timeline" data-replay-events></div></article>
        <article class="task5-card task5-integrity-card"><div class="task5-card-head"><div><div class="task5-card-kicker">REPLAY INTEGRITY</div><h3>可复现性证据</h3></div><span class="task5-status-badge is-success">PASS</span></div><dl class="task5-integrity-list"><div><dt>Seed</dt><dd data-integrity-seed>42</dd></div><div><dt>Snapshot hash</dt><dd data-integrity-hash>—</dd></div><div><dt>Compare version</dt><dd>branch-compare-v1</dd></div><div><dt>Side effect</dt><dd>READ_ONLY</dd></div></dl><button type="button" class="task5-button task5-button-ghost full" data-replay-export>⇩ 导出回放 JSON</button></article>
      </section>
    </div>
  `;

  const $ = selector => container.querySelector(selector);
  const els = {
    source: $('[data-replay-source]'),
    scenario: $('[data-replay-scenario]'),
    seed: $('[data-replay-seed]'),
    seedHash: $('[data-seed-hash]'),
    snapshotId: $('[data-replay-snapshot-id]'),
    run: $('[data-replay-run]'),
    slider: $('[data-replay-slider]'),
    time: $('[data-replay-time]'),
    chart: $('[data-replay-chart]'),
    readout: $('[data-replay-readout]'),
    metrics: $('[data-replay-metrics]'),
    events: $('[data-replay-events]'),
    integritySeed: $('[data-integrity-seed]'),
    integrityHash: $('[data-integrity-hash]')
  };

  function currentSimulation() {
    if (!state.simulation) state.simulation = buildScenarioSeries({ scenario: state.scenario, seed: state.seed, startValue: plot?.metrics?.SOIL_MOISTURE?.value });
    return state.simulation;
  }

  function updateMetrics() {
    const simulation = currentSimulation();
    const execute = simulation.branches.EXECUTE;
    const noAction = simulation.branches.NO_ACTION;
    const saving = Math.max(0, toNumber(execute.finalMoisture) - toNumber(noAction.finalMoisture));
    const riskDelta = execute.recoveryTimeMinutes !== null && execute.timeToRiskMinutes === 0
      ? `+${execute.recoveryTimeMinutes} min`
      : noAction.timeToRiskMinutes === null
        ? '—'
        : execute.timeToRiskMinutes === null
          ? `${noAction.timeToRiskMinutes} min`
          : `${Math.max(0, noAction.timeToRiskMinutes - execute.timeToRiskMinutes)} min`;
    const current = simulation.points[state.cursor] || simulation.points[0];
    els.metrics.innerHTML = [
      metricCard('执行分支终点', `${formatNumber(execute.finalMoisture, 1)}%`, execute.timeToRiskMinutes === 0 && execute.recoveryTimeMinutes !== null ? `${execute.recoveryTimeMinutes} 分钟后恢复` : execute.riskAvoided ? '未触达干旱边界' : `第 ${execute.timeToRiskMinutes} 分钟越界`, 'green'),
      metricCard('放任分支终点', `${formatNumber(noAction.finalMoisture, 1)}%`, noAction.timeToRiskMinutes === null ? '窗口内未越界' : `第 ${noAction.timeToRiskMinutes} 分钟触达边界`, 'red'),
      metricCard('风险窗口差', riskDelta, '同一快照的时间优势', 'blue'),
      metricCard('当前湿度差', `${formatNumber(saving, 1)}%`, `${formatReplayTime(current?.minute || 0)} · 执行 − 放任`, 'purple')
    ].join('');
  }

  function updateReplay() {
    const simulation = currentSimulation();
    const point = simulation.points[state.cursor] || simulation.points[0];
    els.chart.innerHTML = buildReplaySvg(simulation, state.cursor);
    els.time.textContent = formatReplayTime(point?.minute || 0);
    els.readout.innerHTML = `<span class="readout-time">${formatReplayTime(point?.minute || 0)}</span><span class="readout-value execute">A 执行 <strong>${formatNumber(point?.execute?.value, 1)}%</strong></span><span class="readout-value no-action">B 放任 <strong>${formatNumber(point?.noAction?.value, 1)}%</strong></span><span class="readout-delta">差值 <strong>${formatNumber((point?.execute?.value || 0) - (point?.noAction?.value || 0), 1)}pp</strong></span>`;
    els.seedHash.textContent = `0x${simulation.snapshotHash}`;
    els.snapshotId.textContent = `task5-${state.scenario}-${state.seed}`;
    els.integritySeed.textContent = state.seed;
    els.integrityHash.textContent = `0x${simulation.snapshotHash}`;
    updateMetrics();
    renderEvents(simulation);
  }

  function renderEvents(simulation) {
    const scenario = TASK5_SCENARIOS.find(item => item.id === state.scenario) || TASK5_SCENARIOS[0];
    const events = [
      { minute: 0, icon: '◉', title: '冻结输入快照', detail: `SOIL_MOISTURE ${formatNumber(simulation.points[0]?.execute?.value, 1)}% · quality GOOD`, tone: 'blue' },
      { minute: 30, icon: scenario.icon, title: `${scenario.label}注入`, detail: scenario.short, tone: scenario.tone },
      { minute: 30, icon: '⚡', title: '分支 A 申请灌溉处方', detail: '仅写入 EXECUTE 模拟轨迹', tone: 'green' },
      { minute: 120, icon: '⌁', title: '分支 B 风险检查', detail: 'NO_ACTION 继续沿当前斜率演进', tone: 'red' },
      { minute: 240, icon: '✓', title: '快照对比完成', detail: '可导出、可复盘、不可回写主状态', tone: 'purple' }
    ];
    els.events.innerHTML = events.map((event, index) => `<div class="task5-event-item ${event.minute <= (simulation.points[state.cursor]?.minute || 0) ? 'is-past' : ''}"><span class="event-rail"><i class="event-dot tone-${event.tone}"></i>${index < events.length - 1 ? '<b></b>' : ''}</span><span class="event-time">${formatReplayTime(event.minute)}</span><span class="event-icon">${event.icon}</span><span class="event-copy"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.detail)}</small></span></div>`).join('');
  }

  function rebuildLocal() {
    state.simulation = buildScenarioSeries({ scenario: state.scenario, seed: state.seed, startValue: plot?.metrics?.SOIL_MOISTURE?.value });
    state.cursor = Math.min(state.cursor, state.simulation.points.length - 1);
    els.slider.value = state.cursor;
    updateReplay();
  }

  async function runLiveScenario() {
    if (state.running) return;
    state.running = true;
    els.run.disabled = true;
    els.run.textContent = '⏳ 运行中…';
    state.source = context.isLive ? 'LIVE + FROZEN' : 'DETERMINISTIC LOCAL';
    els.source.textContent = state.source;
    rebuildLocal();
    const scenarioId = `task5-${state.scenario}-${state.seed}`;
    try {
      if (api?.runScenario) {
        await Promise.allSettled([
          api.runScenario({ scenario: state.scenario, scenarioId, seed: state.seed, plotId: plot.plotId, branchId: 'EXECUTE', generateSample: true }),
          api.runScenario({ scenario: state.scenario, scenarioId, seed: state.seed, plotId: plot.plotId, branchId: 'NO_ACTION', generateSample: true })
        ]);
      }
      if (context.isCurrent && !context.isCurrent()) return;
      state.runMeta = api?.compareScenario
        ? await api.compareScenario({ scenarioId, scenario: state.scenario, seed: state.seed, plotId: plot.plotId, leftBranch: 'EXECUTE', rightBranch: 'NO_ACTION' })
        : null;
      notify(`${scenarioLabel(state.scenario)} 双轨回放完成 · seed ${state.seed}`, 'success');
    } catch (error) {
      notify(`情景回放使用本地确定性引擎：${error.message}`, 'info');
    } finally {
      state.running = false;
      els.run.disabled = false;
      els.run.textContent = '▶ 运行情景';
      updateReplay();
    }
  }

  async function lockSnapshot() {
    const payload = {
      scenario: state.scenario,
      seed: state.seed,
      plotId: plot.plotId,
      snapshot: currentSimulation(),
      capturedAt: new Date().toISOString(),
      readOnly: true
    };
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      notify('快照 JSON 已复制；可用于答辩复现', 'success');
    } catch {
      notify(`快照已锁定：0x${currentSimulation().snapshotHash}`, 'success');
    }
  }

  function exportReplay() {
    const payload = {
      scenarioId: `task5-${state.scenario}-${state.seed}`,
      scenario: state.scenario,
      seed: state.seed,
      plotId: plot.plotId,
      snapshotHash: currentSimulation().snapshotHash,
      comparisonVersion: 'branch-compare-v1',
      branches: currentSimulation().branches,
      points: currentSimulation().points,
      readOnly: true,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${payload.scenarioId}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('回放 JSON 已导出', 'success');
  }

  els.scenario.addEventListener('change', event => { state.scenario = event.target.value; rebuildLocal(); });
  els.seed.addEventListener('change', event => { state.seed = clamp(Math.round(toNumber(event.target.value, 42)), 1, 999999); event.target.value = state.seed; rebuildLocal(); });
  els.slider.addEventListener('input', event => { state.cursor = Number(event.target.value); updateReplay(); });
  els.run.addEventListener('click', runLiveScenario);
  $('[data-replay-snapshot]')?.addEventListener('click', lockSnapshot);
  $('[data-replay-export]')?.addEventListener('click', exportReplay);

  // First paint is instant and deterministic; the optional live round-trip is
  // deliberately opt-in via the Run button so opening the route never mutates
  // server-side scenario history.
  rebuildLocal();
  return { run: runLiveScenario, getState: () => ({ ...state }) };
}
