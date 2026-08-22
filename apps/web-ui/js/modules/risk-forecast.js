import {
  TASK5_SCENARIOS,
  chartAreaPath,
  chartPath,
  clamp,
  escapeHtml,
  formatNumber,
  scenarioLabel,
  toNumber
} from './task5-utils.js';

const RISK_BOUNDARY = 20;

function normalizeForecast(raw, plot) {
  const current = toNumber(plot?.metrics?.SOIL_MOISTURE?.value, 24);
  const horizons = (raw?.horizons || []).map(item => ({
    minutes: toNumber(item.minutes ?? item.minute, 0),
    value: toNumber(item.value ?? item.expectedMoisture, current),
    lower: toNumber(item.lower, toNumber(item.value ?? item.expectedMoisture, current) - 1),
    upper: toNumber(item.upper, toNumber(item.value ?? item.expectedMoisture, current) + 1)
  })).filter(item => item.minutes > 0);
  const riskBoundary = raw?.riskBoundary || { operator: 'LT', value: RISK_BOUNDARY, unit: '%' };
  return {
    ...(raw || {}),
    status: raw?.status || (horizons.length ? 'AVAILABLE' : 'UNAVAILABLE'),
    metric: raw?.metric || 'SOIL_MOISTURE',
    current,
    horizons,
    timeToRiskMinutes: current <= toNumber(riskBoundary.value, RISK_BOUNDARY) ? 0 : raw?.timeToRiskMinutes,
    riskBoundary,
    quality: raw?.quality || { coverage: 0, confidenceBandSource: 'UNKNOWN' },
    inputWindow: raw?.inputWindow || { validSamples: 0 },
    assumptions: raw?.assumptions || ['NO_IRRIGATION', 'MOCK_WEATHER_STABLE'],
    algorithmVersion: raw?.algorithmVersion || 'robust-trend-v1'
  };
}

function timeLabel(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return '暂不可判定';
  const value = Number(minutes);
  if (value <= 0) return '已触达';
  if (value < 60) return `${Math.round(value)} 分钟`;
  const hours = Math.floor(value / 60);
  const rest = Math.round(value % 60);
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function humanAssumption(value) {
  return ({
    NO_IRRIGATION: '假设未来窗口不执行灌溉',
    MOCK_WEATHER_STABLE: '模拟天气保持稳定',
    WEATHER_STALE: '天气输入已过期',
    SENSOR_QUALITY_LOW: '传感器质量不足'
  }[value] || value);
}

function formatIssuedAt(value) {
  if (!value) return '等待快照';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function buildForecastSvg(forecast, telemetry) {
  const width = 820;
  const height = 310;
  const padding = { top: 22, right: 24, bottom: 42, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const allValues = [
    forecast.current,
    ...forecast.horizons.flatMap(item => [item.lower, item.upper]),
    ...(telemetry || []).map(item => toNumber(item.value, forecast.current))
  ];
  const minValue = clamp(Math.floor(Math.min(...allValues, RISK_BOUNDARY) - 4), 0, 45);
  const maxValue = clamp(Math.ceil(Math.max(...allValues, 38) + 4), 30, 55);
  const maxMinute = 240;
  const x = minute => padding.left + (clamp(minute, -120, maxMinute) + 120) / (maxMinute + 120) * plotWidth;
  const y = value => padding.top + (maxValue - clamp(toNumber(value, minValue), minValue, maxValue)) / (maxValue - minValue) * plotHeight;

  const history = (telemetry || []).slice(-12).map((item, index, list) => ({
    minute: -((list.length - 1 - index) * 10),
    value: toNumber(item.value, forecast.current)
  }));
  if (!history.length) {
    for (let index = 0; index < 8; index += 1) history.push({ minute: -((7 - index) * 15), value: forecast.current + (7 - index) * 0.22 });
  }
  const future = [{ minute: 0, value: forecast.current, lower: forecast.current, upper: forecast.current }, ...forecast.horizons];
  const labels = [0, 60, 120, 180, 240];
  const grid = labels.map(minute => `
    <line x1="${x(minute)}" y1="${padding.top}" x2="${x(minute)}" y2="${height - padding.bottom}" class="task5-chart-grid" />
    <text x="${x(minute)}" y="${height - 14}" class="task5-chart-axis" text-anchor="middle">+${minute}m</text>
  `).join('');
  const yTicks = [minValue, Math.round((minValue + maxValue) / 2), maxValue].map(value => `
    <line x1="${padding.left}" y1="${y(value)}" x2="${width - padding.right}" y2="${y(value)}" class="task5-chart-grid" />
    <text x="${padding.left - 10}" y="${y(value) + 4}" class="task5-chart-axis" text-anchor="end">${value}%</text>
  `).join('');
  const thresholdY = y(RISK_BOUNDARY);
  const historyPath = chartPath(history, x, y);
  const bandPath = chartAreaPath(future, x, y);
  const forecastPath = chartPath(future, x, y);
  const historyDots = history.map(point => `<circle cx="${x(point.minute)}" cy="${y(point.value)}" r="2.7" class="task5-history-dot"><title>历史 ${point.value.toFixed(1)}%</title></circle>`).join('');
  const futureDots = future.slice(1).map(point => `<circle cx="${x(point.minute)}" cy="${y(point.value)}" r="4" class="task5-forecast-dot"><title>+${point.minutes ?? point.minute} 分钟 ${point.value.toFixed(1)}%（区间 ${point.lower.toFixed(1)}~${point.upper.toFixed(1)}）</title></circle>`).join('');

  return `
    <svg class="task5-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="土壤湿度历史与未来风险预测曲线">
      <defs>
        <linearGradient id="task5ForecastBand" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#58a6ff" stop-opacity="0.36" />
          <stop offset="100%" stop-color="#58a6ff" stop-opacity="0.03" />
        </linearGradient>
        <linearGradient id="task5ForecastLine" x1="0" x2="1">
          <stop offset="0%" stop-color="#58a6ff" />
          <stop offset="100%" stop-color="#a371f7" />
        </linearGradient>
      </defs>
      ${grid}
      ${yTicks}
      <line x1="${padding.left}" y1="${thresholdY}" x2="${width - padding.right}" y2="${thresholdY}" class="task5-threshold-line" />
      <text x="${width - padding.right}" y="${thresholdY - 8}" class="task5-threshold-label" text-anchor="end">干旱边界 ${RISK_BOUNDARY}%</text>
      <line x1="${x(0)}" y1="${padding.top}" x2="${x(0)}" y2="${height - padding.bottom}" class="task5-now-line" />
      <path d="${bandPath}" fill="url(#task5ForecastBand)" class="task5-forecast-band" />
      <path d="${historyPath}" fill="none" class="task5-history-line" />
      <path d="${forecastPath}" fill="none" stroke="url(#task5ForecastLine)" class="task5-forecast-line" />
      ${historyDots}
      ${futureDots}
      <text x="${x(-74)}" y="${padding.top + 14}" class="task5-chart-label">已观测窗口</text>
      <text x="${x(70)}" y="${padding.top + 14}" class="task5-chart-label task5-chart-label-accent">预测扇形带 · residual MAD</text>
    </svg>
  `;
}

function renderGauge(element, minutes, current) {
  if (!element) return;
  const progress = minutes === null || minutes === undefined ? 0.18 : clamp(1 - Number(minutes) / 240, 0.06, 1);
  element.style.setProperty('--task5-risk-progress', `${progress * 100}%`);
  const needle = element.querySelector('.task5-gauge-needle');
  if (needle) needle.style.transform = `rotate(${-90 + progress * 180}deg)`;
  const currentValue = element.querySelector('[data-gauge-current]');
  if (currentValue) currentValue.textContent = `${formatNumber(current, 1)}%`;
}

export function renderRiskForecast(container, context = {}) {
  const plot = context.plot || {};
  const api = context.api;
  const notify = context.notify || (() => {});
  const openSubview = context.openSubview || (() => {});
  const state = { forecast: null, telemetry: [], scenario: null, loading: false };

  container.dataset.task5View = 'risk-forecast';
  container.innerHTML = `
    <div class="task5-view task5-forecast-view">
      <section class="task5-hero task5-hero-forecast">
        <div>
          <div class="task5-eyebrow"><span class="task5-signal-dot"></span> CAP-09 · PREDICTIVE OPERATIONS</div>
          <h2>未来风险预测 <span class="task5-gradient-word">&amp; Time-to-Risk</span></h2>
          <p>把“可能发生”变成可操作的窗口：趋势、区间、边界与失效条件同时呈现。</p>
        </div>
        <div class="task5-hero-actions">
          <span class="task5-live-chip" data-forecast-status>连接中…</span>
          <button type="button" class="task5-button task5-button-ghost" data-forecast-refresh>↻ 重新计算</button>
          <button type="button" class="task5-button task5-button-primary" data-open-replay>⚡ 打开双轨回放</button>
        </div>
      </section>

      <section class="task5-forecast-top-grid">
        <article class="task5-card task5-gauge-card">
          <div class="task5-card-kicker">TIME-TO-RISK · SOIL_MOISTURE</div>
          <div class="task5-gauge-wrap" data-risk-gauge>
            <div class="task5-gauge-ring"></div>
            <div class="task5-gauge-center">
              <strong data-risk-minutes>—</strong>
              <span>预计触达边界</span>
              <small data-gauge-current>—</small>
            </div>
            <div class="task5-gauge-needle"></div>
          </div>
          <div class="task5-gauge-foot"><span>当前地块</span><strong>${escapeHtml(plot.name || plot.plotId || '示范地块')}</strong></div>
        </article>

        <article class="task5-card task5-forecast-signal-card">
          <div class="task5-card-head"><div><div class="task5-card-kicker">DECISION SIGNAL</div><h3 data-forecast-headline>正在读取快照</h3></div><span class="task5-status-badge" data-forecast-badge>SCANNING</span></div>
          <div class="task5-signal-meter"><span data-forecast-meter></span></div>
          <div class="task5-signal-grid">
            <div><span>输入有效样本</span><strong data-forecast-samples>—</strong></div>
            <div><span>质量覆盖率</span><strong data-forecast-coverage>—</strong></div>
            <div><span>算法版本</span><strong data-forecast-algorithm>—</strong></div>
            <div><span>快照签发</span><strong data-forecast-issued>—</strong></div>
          </div>
          <div class="task5-inline-note" data-forecast-note>预测带不是承诺：任何证据不足都会明确弃权。</div>
        </article>
      </section>

      <section class="task5-card task5-chart-card">
        <div class="task5-card-head task5-chart-head">
          <div><div class="task5-card-kicker">FROZEN WINDOW · 0—240 MIN</div><h3>土壤水分衰减预测带</h3></div>
          <div class="task5-chart-legend"><span><i class="legend-dot history"></i>历史观测</span><span><i class="legend-dot forecast"></i>预测中线</span><span><i class="legend-dot band"></i>不确定区间</span></div>
        </div>
        <div class="task5-chart-wrap" data-forecast-chart><div class="task5-chart-loading"><span class="task5-spinner"></span> 生成预测带…</div></div>
      </section>

      <section class="task5-horizon-grid" data-forecast-horizons>
        <div class="task5-skeleton-card"></div><div class="task5-skeleton-card"></div><div class="task5-skeleton-card"></div>
      </section>

      <section class="task5-card task5-scenario-injector">
        <div class="task5-card-head"><div><div class="task5-card-kicker">CONTROLLED EXPERIMENTS</div><h3>一键注入故障与天气情景</h3></div><span class="task5-readonly-chip">只写入模拟分支 · 不污染主状态</span></div>
        <div class="task5-scenario-buttons">
          ${TASK5_SCENARIOS.map(item => `<button type="button" class="task5-scenario-button tone-${item.tone}" data-scenario="${item.id}"><span class="scenario-icon">${item.icon}</span><span><strong>${item.label}</strong><small>${item.short}</small></span><span class="scenario-arrow">↗</span></button>`).join('')}
        </div>
        <div class="task5-scenario-result" data-scenario-result hidden></div>
      </section>

      <section class="task5-assumptions-row">
        <div class="task5-assumption-block"><span class="task5-card-kicker">ASSUMPTIONS</span><div data-forecast-assumptions class="task5-chip-list"></div></div>
        <div class="task5-assumption-block"><span class="task5-card-kicker">FAIL-SAFE</span><p>样本不足、阶段未知或质量降级时返回 <code>UNAVAILABLE</code>，不会补造未来值，也不会自动生成灌溉命令。</p></div>
      </section>
    </div>
  `;

  const $ = selector => container.querySelector(selector);
  const els = {
    status: $('[data-forecast-status]'),
    badge: $('[data-forecast-badge]'),
    headline: $('[data-forecast-headline]'),
    meter: $('[data-forecast-meter]'),
    samples: $('[data-forecast-samples]'),
    coverage: $('[data-forecast-coverage]'),
    algorithm: $('[data-forecast-algorithm]'),
    issued: $('[data-forecast-issued]'),
    note: $('[data-forecast-note]'),
    chart: $('[data-forecast-chart]'),
    horizons: $('[data-forecast-horizons]'),
    assumptions: $('[data-forecast-assumptions]'),
    gauge: $('[data-risk-gauge]'),
    minutes: $('[data-risk-minutes]'),
    scenarioResult: $('[data-scenario-result]')
  };

  function renderForecast() {
    const forecast = state.forecast;
    if (!forecast) return;
    const available = forecast.status === 'AVAILABLE' && forecast.horizons.length > 0;
    const minutes = available ? forecast.timeToRiskMinutes : null;
    const coverage = toNumber(forecast.quality?.coverage, 0);
    els.status.textContent = available ? (context.isLive ? 'LIVE · REST' : 'LOCAL · DETERMINISTIC') : 'UNAVAILABLE';
    els.status.classList.toggle('is-warning', !available);
    els.badge.textContent = available ? (minutes !== null && minutes < 120 ? 'ACTION WINDOW' : 'MONITORING') : 'NEEDS EVIDENCE';
    els.badge.classList.toggle('is-warning', !available);
    els.headline.textContent = available
      ? (minutes === 0 ? '当前已进入干旱边界 · 建议立即处置' : minutes !== null ? `约 ${timeLabel(minutes)} 后进入干旱边界` : '未来 4 小时未见越界')
      : `预测暂不可用 · ${forecast.reason || '输入窗口不足'}`;
    els.meter.style.width = `${clamp(coverage * 100, 4, 100)}%`;
    els.samples.textContent = `${formatNumber(forecast.inputWindow?.validSamples, 0)} 条`;
    els.coverage.textContent = `${formatNumber(coverage * 100, 0)}%`;
    els.algorithm.textContent = forecast.algorithmVersion;
    els.issued.textContent = formatIssuedAt(forecast.issuedAt);
    els.note.textContent = available
      ? `风险边界：${forecast.riskBoundary?.operator || 'LT'} ${forecast.riskBoundary?.value ?? RISK_BOUNDARY}${forecast.riskBoundary?.unit || '%'}`
      : '系统已主动弃权；请先补齐遥测、阶段或质量证据。';
    els.minutes.textContent = available && minutes !== null ? timeLabel(minutes) : '—';
    renderGauge(els.gauge, minutes, forecast.current);
    els.chart.innerHTML = available
      ? buildForecastSvg(forecast, state.telemetry)
      : `<div class="task5-unavailable"><span>⟡</span><strong>UNAVAILABLE</strong><small>${escapeHtml(forecast.reason || '没有足够的质量合格样本')}</small></div>`;

    els.horizons.innerHTML = forecast.horizons.length
      ? forecast.horizons.map(horizon => `
        <article class="task5-horizon-card">
          <div class="horizon-top"><span>+${horizon.minutes} min</span><span class="horizon-risk-dot ${horizon.value < RISK_BOUNDARY ? 'risk' : ''}"></span></div>
          <strong>${formatNumber(horizon.value, 1)}<small>%</small></strong>
          <div class="horizon-range"><span style="left:${clamp((horizon.lower / 50) * 100, 0, 100)}%"></span><i style="left:${clamp((horizon.value / 50) * 100, 0, 100)}%"></i><b style="left:${clamp((horizon.upper / 50) * 100, 0, 100)}%"></b></div>
          <div class="horizon-foot"><span>区间</span><span>${formatNumber(horizon.lower, 1)} ~ ${formatNumber(horizon.upper, 1)}%</span></div>
        </article>
      `).join('')
      : `<div class="task5-horizon-empty">等待质量合格的预测窗口</div>`;

    els.assumptions.innerHTML = (forecast.assumptions || []).map(item => `<span class="task5-chip">${escapeHtml(humanAssumption(item))}</span>`).join('');
  }

  async function loadForecast() {
    if (state.loading) return;
    state.loading = true;
    els.status.textContent = 'CALCULATING…';
    try {
      const [forecastResult, telemetryResult] = await Promise.all([
        api?.getRiskForecast ? api.getRiskForecast(plot.plotId, 'SOIL_MOISTURE') : null,
        api?.getTelemetry ? api.getTelemetry(plot.plotId, 'SOIL_MOISTURE') : []
      ]);
      if (context.isCurrent && !context.isCurrent()) return;
      state.forecast = normalizeForecast(forecastResult, plot);
      state.telemetry = Array.isArray(telemetryResult) ? telemetryResult : (telemetryResult?.data || []);
      renderForecast();
    } catch (error) {
      state.forecast = normalizeForecast({ status: 'UNAVAILABLE', reason: 'FRONTEND_FETCH_FAILED' }, plot);
      state.telemetry = [];
      renderForecast();
      notify(`预测快照生成失败：${error.message}`, 'error');
    } finally {
      state.loading = false;
    }
  }

  async function injectScenario(scenario) {
    const item = TASK5_SCENARIOS.find(entry => entry.id === scenario) || TASK5_SCENARIOS[0];
    const seed = 42;
    els.scenarioResult.hidden = false;
    els.scenarioResult.innerHTML = `<span class="task5-spinner"></span> 正在冻结 ${escapeHtml(item.label)} · seed ${seed} …`;
    try {
      const result = api?.runScenario
        ? await api.runScenario({ scenario, seed, plotId: plot.plotId, branchId: 'MAIN', generateSample: true })
        : { scenarioId: `task5-${scenario}-${seed}`, snapshotHash: 'local' };
      if (context.isCurrent && !context.isCurrent()) return;
      state.scenario = result;
      els.scenarioResult.innerHTML = `<span class="scenario-result-icon">✓</span><span><strong>${escapeHtml(item.label)} 已注入模拟沙盒</strong><small>scenarioId ${escapeHtml(result.scenarioId || `task5-${scenario}-${seed}`)} · snapshot ${escapeHtml(result.snapshotHash || 'deterministic')}</small></span><button type="button" data-scenario-open>查看双轨回放 →</button>`;
      els.scenarioResult.querySelector('[data-scenario-open]')?.addEventListener('click', () => openSubview('scenario-replay', { plotId: plot.plotId }));
      notify(`已创建 ${item.label} 情景；主状态保持只读`, 'success');
    } catch (error) {
      els.scenarioResult.innerHTML = `<span class="scenario-result-icon danger">!</span><span>情景创建失败：${escapeHtml(error.message)}</span>`;
      notify(`情景注入失败：${error.message}`, 'error');
    }
  }

  $('[data-forecast-refresh]')?.addEventListener('click', loadForecast);
  $('[data-open-replay]')?.addEventListener('click', () => openSubview('scenario-replay', { plotId: plot.plotId }));
  container.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => injectScenario(button.dataset.scenario)));
  loadForecast();

  return { refresh: loadForecast, getState: () => ({ ...state }) };
}
