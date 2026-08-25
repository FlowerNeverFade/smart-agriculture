const READINESS_META = {
  READY: { label: '可进入审批', icon: '✓', tone: 'ready', description: '数据、设备、资源与安全门均通过' },
  NEEDS_EVIDENCE: { label: '需要补证', icon: '!', tone: 'evidence', description: '仍可查看试算，但不能据此直接执行' },
  HUMAN_REVIEW: { label: '人工复核', icon: '◐', tone: 'review', description: '建议已生成，需要有权限人员确认' },
  UNAVAILABLE: { label: '当前不可用', icon: '×', tone: 'unavailable', description: '关键数据或设备不可用，请先恢复现场条件' }
};

const RISK_META = {
  WATER_DEFICIT: { label: '真实缺水', icon: '💧', tone: 'water', action: '优先核对持续低湿，再按阶段目标补水' },
  SENSOR_DRIFT: { label: '传感器漂移', icon: '〽', tone: 'drift', action: '便携仪比对与流量计校准，不把漂移当成缺水' },
  DEVICE_FAULT: { label: '设备故障', icon: '⌁', tone: 'device', action: '恢复设备心跳并取得新鲜遥测' },
  HEAT_STRESS: { label: '高温胁迫', icon: '♨', tone: 'heat', action: '核查温度持续时间与通风条件' },
  INSUFFICIENT_EVIDENCE: { label: '证据不足', icon: '?', tone: 'unknown', action: '延长观测窗口并补充人工巡田' }
};

const GATE_LABELS = {
  requiredMetrics: '关键指标',
  freshness: '数据新鲜度',
  dataQuality: '遥测质量',
  deviceHealth: '设备健康',
  diagnosisSafety: '诊断安全',
  resourceCapacity: '水源容量',
  permission: '账号权限',
  safetyLimit: '动作上限'
};

const EVIDENCE_LABELS = {
  FLOW_RATE_CALIBRATION: '流量计校准结果',
  PORTABLE_METER_COMPARISON: '便携仪对照测量',
  FRESH_TELEMETRY: '3 分钟内新鲜遥测',
  DEVICE_HEALTH: '设备在线与健康证明',
  GOOD_DATA_QUALITY: '质量合格的观测窗口',
  QUALITY_REVIEW: '异常质量人工复核',
  DIAGNOSIS_CONFIRMATION: '根因诊断人工确认',
  MORE_DIAGNOSIS_EVIDENCE: '更多根因证据',
  MORE_TELEMETRY_HISTORY: '更长遥测历史窗口',
  CONTROL_PERMISSION: '执行员或管理员审批',
  SOIL_MOISTURE: '土壤湿度观测'
};

const ROLE_META = {
  FARMER: { label: '农户', canControl: false },
  FIELD_OPERATOR: { label: '田间执行员', canControl: true },
  FARM_ADMIN: { label: '农场管理员', canControl: true },
  SYSTEM_ADMIN: { label: '系统管理员', canControl: true }
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function formatTime(value, includeDate = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString('zh-CN', includeDate
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
    : { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 60) return `${Math.round(value)} 秒`;
  return `${(value / 60).toFixed(value % 60 ? 1 : 0)} 分钟`;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function riskMeta(code) {
  return RISK_META[String(code || '').toUpperCase()] || { label: code || '未知风险', icon: '◇', tone: 'unknown', action: '结合现场证据人工判断' };
}

function evidenceText(item) {
  if (typeof item === 'string') return EVIDENCE_LABELS[item] || item;
  if (!item || typeof item !== 'object') return '未命名证据';
  if (item.type === 'telemetry') return `${item.metric || '遥测'} = ${item.value ?? '—'}${item.unit || ''}`;
  if (item.type === 'quality') return item.reason || `数据质量 ${item.status || '—'}${item.confidence == null ? '' : ` · 置信 ${(Number(item.confidence) * 100).toFixed(0)}%`}`;
  if (item.type === 'device') return item.reason || `设备状态 ${item.status || '—'}`;
  if (item.type === 'rule') return item.reason || '规则校验结果';
  return item.reason || item.metric || item.type || '结构化证据';
}

function sourceOf(item, fallback = 'DERIVED') {
  return String(item?.provenance || fallback).toUpperCase();
}

function evidenceColumn(title, icon, items, tone, emptyText) {
  const list = Array.isArray(items) ? items : [];
  return `
    <section class="dc-evidence-column tone-${tone}">
      <header><span>${icon}</span><div><strong>${escapeHtml(title)}</strong><small>${list.length} 项</small></div></header>
      <div class="dc-evidence-list">
        ${list.length ? list.map(item => `
          <article>
            <i></i>
            <div><p>${escapeHtml(evidenceText(item))}</p><span class="dc-source-tag source-${sourceOf(item).toLowerCase()}">${escapeHtml(sourceOf(item))}</span></div>
          </article>`).join('') : `<div class="dc-evidence-empty">${escapeHtml(emptyText)}</div>`}
      </div>
    </section>`;
}

function metricCards(plot, scenario) {
  const entries = Object.entries(plot?.metrics || {}).slice(0, 6);
  const simulated = scenario !== 'live';
  return entries.map(([code, metric]) => {
    let value = metric.value;
    let status = String(metric.status || 'NORMAL').toUpperCase();
    if (scenario === 'drought' && code === 'SOIL_MOISTURE') { value = 12.4; status = 'WARN'; }
    if (scenario === 'sensor-drift' && code === 'SOIL_MOISTURE') status = 'BAD';
    return `
      <article class="dc-metric ${status === 'NORMAL' || status === 'GOOD' ? 'is-good' : 'is-warn'}">
        <span>${escapeHtml(metric.label || code)}</span>
        <strong>${escapeHtml(value)}<small>${escapeHtml(metric.unit || '')}</small></strong>
        <footer><b>${escapeHtml(status)}</b><em>${simulated ? 'SIMULATED' : 'OBSERVED'}</em></footer>
      </article>`;
  }).join('');
}

function diagnosisPanel(state) {
  const diagnosis = state.diagnosis;
  if (!diagnosis) return '<div class="dc-empty-panel">等待诊断结果…</div>';
  const primary = riskMeta(diagnosis.primaryCause);
  const confidence = clamp(diagnosis.confidence);
  const candidates = Array.isArray(diagnosis.candidateCauses) ? diagnosis.candidateCauses : [];
  return `
    <section class="dc-card dc-diagnosis-card">
      <div class="dc-card-heading">
        <div><span class="dc-kicker">ROOT CAUSE · 确定性诊断</span><h3>多假设根因推断</h3></div>
        <span class="dc-version-chip">${escapeHtml(diagnosis.ruleVersion || 'rule —')}</span>
      </div>
      <div class="dc-primary-cause tone-${primary.tone}">
        <div class="dc-cause-icon">${primary.icon}</div>
        <div class="dc-cause-copy"><small>首要候选根因</small><strong>${escapeHtml(primary.label)}</strong><p>${escapeHtml(primary.action)}</p></div>
        <div class="dc-confidence"><strong>${Math.round(confidence * 100)}%</strong><span>诊断置信度</span></div>
      </div>
      <div class="dc-candidate-list">
        ${candidates.map((candidate, index) => {
          const meta = riskMeta(candidate.code);
          const score = clamp(candidate.confidence);
          return `<article class="${index === 0 ? 'is-primary' : ''}">
            <div><span>${meta.icon}</span><strong>${escapeHtml(meta.label)}</strong><em>${Math.round(score * 100)}%</em></div>
            <div class="dc-score-track"><i style="width:${Math.round(score * 100)}%"></i></div>
          </article>`;
        }).join('')}
      </div>
      <div class="dc-evidence-grid">
        ${evidenceColumn('支持证据', '＋', diagnosis.supportingEvidence, 'support', '暂无直接支持证据')}
        ${evidenceColumn('反对证据', '−', diagnosis.opposingEvidence, 'oppose', '没有发现反对证据')}
        ${evidenceColumn('缺失证据', '…', diagnosis.missingInformation, 'missing', '关键证据已覆盖')}
      </div>
    </section>`;
}

function readinessPanel(state) {
  const readiness = state.readiness;
  if (!readiness) return '<section class="dc-card dc-readiness-card"><div class="dc-empty-panel">正在核验安全门…</div></section>';
  const status = String(readiness.status || 'UNAVAILABLE').toUpperCase();
  const meta = READINESS_META[status] || READINESS_META.UNAVAILABLE;
  const score = clamp(readiness.score);
  const gates = Object.entries(readiness.hardGates || {});
  const missing = unique(readiness.missingEvidence || []);
  const evidenceCreated = state.evidenceWorkOrder;
  return `
    <section class="dc-card dc-readiness-card tone-${meta.tone}">
      <div class="dc-card-heading">
        <div><span class="dc-kicker">DECISION READINESS · 与置信度独立</span><h3>执行就绪度</h3></div>
        <span class="dc-policy">${escapeHtml(readiness.policyVersion || 'readiness-v1')}</span>
      </div>
      <div class="dc-readiness-summary">
        <div class="dc-score-ring" style="--dc-score:${Math.round(score * 360)}deg"><div><strong>${Math.round(score * 100)}</strong><span>综合分</span></div></div>
        <div><span class="dc-readiness-badge tone-${meta.tone}">${meta.icon} ${meta.label}</span><p>${meta.description}</p></div>
      </div>
      <div class="dc-state-rail" aria-label="四态决策就绪度">
        ${Object.entries(READINESS_META).map(([key, item]) => `<div class="${key === status ? 'is-active' : ''} tone-${item.tone}"><i>${item.icon}</i><span>${item.label}</span></div>`).join('')}
      </div>
      <div class="dc-gate-grid">
        ${gates.map(([key, value]) => `<article class="gate-${String(value).toLowerCase()}"><i>${value === 'PASS' ? '✓' : value === 'REVIEW' ? '◐' : '×'}</i><div><strong>${escapeHtml(GATE_LABELS[key] || key)}</strong><span>${escapeHtml(value)}</span></div></article>`).join('')}
      </div>
      ${missing.length ? `<div class="dc-missing-actions"><strong>最小补证清单</strong>${missing.map(item => `<span>${escapeHtml(EVIDENCE_LABELS[item] || item)}</span>`).join('')}</div>` : '<div class="dc-all-clear">✓ 所有硬门均已具备可审计证据</div>'}
      ${evidenceCreated ? `<div class="dc-work-created"><span>✓ 已创建</span><strong>${escapeHtml(evidenceCreated.title || '现场复测工单')}</strong><small>${escapeHtml(evidenceCreated.workOrderId || '')}</small></div>` : ''}
      ${status !== 'READY' ? `<button class="dc-button secondary wide" data-action="create-evidence" ${state.evidenceCreating ? 'disabled' : ''}>${state.evidenceCreating ? '正在创建…' : '＋ 创建最小补证工单'}</button>` : ''}
    </section>`;
}

function prescriptionPanel(state, plot) {
  const plan = state.plan;
  if (!plan) return '<section class="dc-card"><div class="dc-empty-panel">正在生成结构化试算…</div></section>';
  const executable = plan.executable === true && state.readiness?.status === 'READY';
  const readiness = READINESS_META[state.readiness?.status] || READINESS_META.UNAVAILABLE;
  const windowStart = plan.recommendedWindow?.start || plan.when?.start;
  const windowEnd = plan.recommendedWindow?.end || plan.when?.end;
  const alternatives = Array.isArray(plan.alternatives) ? plan.alternatives : ['延后复测后重新评估', '拆分为较小剂量并观察响应'];
  const expected = plan.expectedResult || {};
  const role = ROLE_META[state.user?.role] || ROLE_META.FARMER;
  return `
    <section class="dc-card dc-prescription-card">
      <div class="dc-card-heading">
        <div><span class="dc-kicker">STRUCTURED PRESCRIPTION · 规则计算</span><h3>精准补水处方试算</h3></div>
        <span class="dc-plan-state ${executable ? 'is-ready' : 'is-advisory'}">${executable ? '可审批' : '仅供参考'}</span>
      </div>
      <div class="dc-prescription-grid">
        <article><span>WHAT · 做什么</span><strong>阶段精准补水</strong><small>IRRIGATION</small></article>
        <article><span>WHERE · 在哪里</span><strong>${escapeHtml(plot?.name || plan.plotId)}</strong><small>${escapeHtml(plan.plotId)}</small></article>
        <article><span>WHEN · 何时</span><strong>${formatTime(windowStart)}–${formatTime(windowEnd)}</strong><small>建议执行窗口</small></article>
        <article class="is-dose"><span>HOW MUCH · 多少</span><strong>${Number(plan.waterLitre || 0).toFixed(1)} L</strong><small>${formatDuration(plan.durationSeconds)}</small></article>
      </div>
      <div class="dc-why-row">
        <div><span>WHY · 依据</span><p>${escapeHtml(plan.why || '根据阶段目标与最新遥测试算')}</p></div>
        <div><span>预期结果</span><p>${escapeHtml(expected.metric || 'SOIL_MOISTURE')}：${escapeHtml(expected.from ?? '—')}% → ${escapeHtml(expected.to ?? '—')}%</p></div>
      </div>
      <div class="dc-alternatives"><span>替代方案</span>${alternatives.map(item => `<p>↳ ${escapeHtml(item)}</p>`).join('')}</div>
      <div class="dc-version-row">
        <span>Crop Pack ${escapeHtml(plan.cropPackVersion || '—')}</span><span>规则 ${escapeHtml(plan.ruleVersion || '—')}</span><span>知识 ${escapeHtml(plan.knowledgeVersion || '—')}</span><span>Agent ${escapeHtml(plan.agentVersion || '—')}</span>
      </div>
      <div class="dc-decision-action tone-${readiness.tone}">
        <div><strong>${readiness.icon} ${readiness.label}</strong><p>${executable ? '处方已通过硬门；提交后仍需本账号人工确认，命令带幂等键。' : `${readiness.description}。参考剂量不会自动下发。`}</p></div>
        <button class="dc-button primary" data-action="prepare-execution" ${!executable || !role.canControl || state.executing || state.command ? 'disabled' : ''}>${state.executing ? '正在下发…' : state.command ? '已提交执行' : '申请虚拟执行'}</button>
      </div>
      ${state.approvalOpen ? approvalPanel(state, plan) : ''}
    </section>`;
}

function approvalPanel(state, plan) {
  return `
    <div class="dc-approval-panel">
      <header><div><span>人工审批确认</span><strong>虚拟执行器 · ${Number(plan.waterLitre || 0).toFixed(1)} L / ${formatDuration(plan.durationSeconds)}</strong></div><button data-action="cancel-approval" aria-label="取消审批">×</button></header>
      <label><input type="checkbox" data-role="approval-check"> 我已核对地块、剂量、设备与水源；同意本次虚拟灌溉。</label>
      <div><span>幂等保护：重复点击不会生成第二条命令</span><button class="dc-button danger" data-action="confirm-execution" disabled>确认并下发</button></div>
    </div>`;
}

function executionPanel(state) {
  const command = state.command;
  const evaluation = state.evaluation || command?.evaluation;
  const commandStatus = String(command?.status || '').toUpperCase();
  const ackStatus = String(command?.ack?.status || (['SUCCEEDED', 'PARTIAL', 'FAILED', 'TIMEOUT'].includes(commandStatus) ? commandStatus : '')).toUpperCase();
  const final = ['SUCCEEDED', 'PARTIAL', 'FAILED', 'TIMEOUT'].includes(ackStatus);
  const effectStatus = String(evaluation?.status || '').toUpperCase();
  const nodes = [
    { label: '处方生成', detail: state.plan?.status || 'PROPOSED', state: state.plan ? 'done' : 'pending' },
    { label: '人工审批', detail: command ? (command.approvedBy ? '已记录审批人' : '已确认') : '等待确认', state: command ? 'done' : state.approvalOpen ? 'active' : 'pending' },
    { label: '命令 / ACK', detail: command ? (ackStatus || commandStatus || 'APPROVED') : '尚未下发', state: final ? (ackStatus === 'SUCCEEDED' ? 'done' : 'warning') : command ? 'active' : 'pending' },
    { label: '效果评价', detail: effectStatus || (command ? 'PENDING' : '等待执行'), state: effectStatus === 'COMPLETED' ? 'done' : effectStatus ? 'warning' : 'pending' }
  ];
  return `
    <section class="dc-card dc-execution-card">
      <div class="dc-card-heading"><div><span class="dc-kicker">CONTROLLED EXECUTION · ACK 不混写</span><h3>执行与效果闭环</h3></div>${command ? `<span class="dc-command-id">${escapeHtml(command.commandId)}</span>` : '<span class="dc-plan-state is-advisory">尚未执行</span>'}</div>
      <div class="dc-execution-track">
        ${nodes.map((node, index) => `<article class="is-${node.state}"><i>${node.state === 'done' ? '✓' : node.state === 'warning' ? '!' : index + 1}</i><div><strong>${node.label}</strong><span>${escapeHtml(node.detail)}</span></div></article>`).join('')}
      </div>
      ${command ? `<div class="dc-execution-facts">
        <div><span>传输</span><strong>${escapeHtml(command.transport || 'MQTT / 虚拟适配器')}</strong></div>
        <div><span>ACK</span><strong class="status-${(ackStatus || commandStatus).toLowerCase()}">${escapeHtml(ackStatus || commandStatus || 'PENDING')}</strong></div>
        <div><span>实际用水</span><strong>${command.ack?.actualWaterLitre == null ? '待回传' : `${Number(command.ack.actualWaterLitre).toFixed(1)} L`}</strong></div>
        <div><span>效果</span><strong>${escapeHtml(effectStatus || 'PENDING')}</strong></div>
      </div>` : '<p class="dc-execution-empty">只有通过 READY、权限与人工确认后才会创建命令；失败、部分成功和超时会分别保留。</p>'}
    </section>`;
}

function passportPanel(state) {
  const passport = state.passport || {};
  const counts = {
    observations: Array.isArray(passport.observations) ? passport.observations.length : Object.keys(passport.observations || {}).length,
    diagnoses: passport.diagnoses?.length || (state.diagnosis ? 1 : 0),
    plans: passport.plans?.length || (state.plan ? 1 : 0),
    commands: passport.commands?.length || (state.command ? 1 : 0),
    evaluations: passport.evaluations?.length || (state.evaluation ? 1 : 0)
  };
  return `
    <section class="dc-card dc-passport-card">
      <div class="dc-card-heading"><div><span class="dc-kicker">DECISION PASSPORT · 全链路审计</span><h3>本次决策护照</h3></div><button class="dc-icon-button" data-action="refresh-passport" title="刷新护照">↻</button></div>
      <div class="dc-trace"><span>traceId</span><code>${escapeHtml(state.traceId || '—')}</code></div>
      <div class="dc-passport-flow">
        <article><strong>${counts.observations}</strong><span>观测</span></article><i>→</i>
        <article><strong>${counts.diagnoses}</strong><span>诊断</span></article><i>→</i>
        <article><strong>${counts.plans}</strong><span>处方</span></article><i>→</i>
        <article><strong>${counts.commands}</strong><span>命令</span></article><i>→</i>
        <article><strong>${counts.evaluations}</strong><span>评价</span></article>
      </div>
      <div class="dc-provenance-row">${(passport.provenance || ['OBSERVED', 'DERIVED', 'SIMULATED', 'ESTIMATED']).map(item => `<span class="source-${String(item).toLowerCase()}">${escapeHtml(item)}</span>`).join('')}</div>
      <p>模型只负责解释；根因分、剂量、安全门与命令均由确定性逻辑计算并留痕。</p>
    </section>`;
}

function renderDynamic(root, state, context) {
  const plot = context.plots.find(item => item.plotId === state.plotId) || context.plots[0] || {};
  const scenarioLabel = state.scenario === 'live' ? '实时主状态' : `情景试算 · ${state.scenario}`;
  root.querySelector('[data-role="dc-context"]').innerHTML = `
    <div><span class="dc-live-dot"></span><strong>${escapeHtml(plot.name || state.plotId)}</strong><small>${escapeHtml(plot.cropName || plot.cropCode || '作物')} · ${escapeHtml(plot.stageLabel || '当前阶段')}</small></div>
    <div class="dc-context-tags"><span>${escapeHtml(scenarioLabel)}</span><span>${state.scenario === 'live' ? 'OBSERVED' : 'SIMULATED'}</span><span>${formatTime(state.diagnosis?.evaluatedAt, true)}</span></div>`;
  root.querySelector('[data-role="dc-metrics"]').innerHTML = metricCards(plot, state.scenario);
  root.querySelector('[data-role="dc-diagnosis"]').innerHTML = diagnosisPanel(state);
  root.querySelector('[data-role="dc-readiness"]').innerHTML = readinessPanel(state);
  root.querySelector('[data-role="dc-prescription"]').innerHTML = prescriptionPanel(state, plot);
  root.querySelector('[data-role="dc-execution"]').innerHTML = executionPanel(state);
  root.querySelector('[data-role="dc-passport"]').innerHTML = passportPanel(state);
  root.classList.toggle('is-loading', state.loading);
  const refresh = root.querySelector('[data-action="reevaluate"]');
  if (refresh) {
    refresh.disabled = state.loading;
    refresh.innerHTML = state.loading ? '<span class="dc-spinner"></span> 正在联算' : '↻ 重新评估';
  }
  const error = root.querySelector('[data-role="dc-error"]');
  if (error) {
    error.hidden = !state.error;
    error.innerHTML = state.error ? `<strong>本次联算未完成</strong><span>${escapeHtml(state.error.message || state.error)}</span>` : '';
  }
}

function shellTemplate(context, selectedPlotId) {
  return `
    <section class="dc-root" aria-label="智能诊断与决策中枢">
      <header class="dc-hero">
        <div class="dc-hero-copy"><span class="dc-kicker">AGRILOOP DECISION CORE · CAP-04 / 05 / 13</span><h2>从异常证据到受控行动</h2><p>诊断、证据、就绪度、处方与虚拟执行共享同一条可追溯决策链。</p></div>
        <div class="dc-toolbar">
          <label>地块<select data-role="plot-select">${context.plots.map(plot => `<option value="${escapeHtml(plot.plotId)}" ${plot.plotId === selectedPlotId ? 'selected' : ''}>${escapeHtml(plot.name)}</option>`).join('')}</select></label>
          <label>评估上下文<select data-role="scenario-select"><option value="live">实时主状态</option><option value="drought">干旱试算</option><option value="sensor-drift">漂移分流</option><option value="device-offline">设备离线</option></select></label>
          <button class="dc-button primary" data-action="reevaluate">↻ 重新评估</button>
        </div>
      </header>
      <div class="dc-trust-strip"><span>规则计算根因分与剂量</span><i></i><span>数据库保存快照与审计</span><i></i><span>RAG 提供作物知识依据</span><i></i><span>AI 只解释、不越过安全门</span></div>
      <div class="dc-error" data-role="dc-error" hidden></div>
      <section class="dc-context-bar" data-role="dc-context"></section>
      <section class="dc-metric-grid" data-role="dc-metrics"></section>
      <div class="dc-main-grid">
        <main>
          <div data-role="dc-diagnosis"></div>
          <div data-role="dc-prescription"></div>
          <div data-role="dc-execution"></div>
        </main>
        <aside>
          <div data-role="dc-readiness"></div>
          <div data-role="dc-passport"></div>
        </aside>
      </div>
      <div class="dc-loading-mask"><span class="dc-spinner"></span><strong>冻结快照并联算诊断、处方与安全门…</strong></div>
    </section>`;
}

function delay(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

export async function renderDecisionConsole(container, selectedPlotId, app) {
  const context = {
    api: app?.api,
    plots: app?.state?.plots || [],
    user: app?.state?.user || null,
    showToast: (message, type = 'info') => app?.showToast?.(message, type)
  };
  if (!context.api) throw new Error('智能决策中枢缺少 API 上下文');
  if (!context.plots.length) throw new Error('当前账号没有可访问地块');

  const state = {
    plotId: selectedPlotId || context.plots[0].plotId,
    scenario: 'live',
    user: context.user,
    traceId: '',
    diagnosis: null,
    plan: null,
    readiness: null,
    passport: null,
    command: null,
    evaluation: null,
    evidenceWorkOrder: null,
    loading: false,
    evidenceCreating: false,
    executing: false,
    approvalOpen: false,
    error: null,
    generation: 0,
    destroyed: false,
    idempotencyKey: ''
  };

  container.innerHTML = shellTemplate(context, state.plotId);
  const root = container.querySelector('.dc-root');

  const refreshPassport = async () => {
    if (!state.traceId) return;
    try {
      state.passport = await context.api.getDecisionPassport(state.traceId);
      if (!state.destroyed) renderDynamic(root, state, context);
    } catch (error) {
      context.showToast(`决策护照刷新失败：${error.message || error}`, 'error');
    }
  };

  const evaluate = async () => {
    const generation = ++state.generation;
    state.loading = true;
    state.error = null;
    state.command = null;
    state.evaluation = null;
    state.evidenceWorkOrder = null;
    state.approvalOpen = false;
    state.traceId = `decision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    state.idempotencyKey = `web-${state.traceId}`;
    renderDynamic(root, state, context);
    try {
      const scenarioInput = state.scenario === 'live' ? {} : { scenarioId: state.scenario };
      const diagnosis = await context.api.evaluateDiagnosis(state.plotId, { ...scenarioInput, traceId: state.traceId });
      if (generation !== state.generation || state.destroyed) return;
      const plan = await context.api.estimateIrrigation({ plotId: state.plotId, diagnosisId: diagnosis.diagnosisId, traceId: state.traceId, ...scenarioInput });
      if (generation !== state.generation || state.destroyed) return;
      const readiness = await context.api.getDecisionReadiness('IRRIGATION_PLAN', plan.planId, { plotId: state.plotId, plan, diagnosis });
      if (generation !== state.generation || state.destroyed) return;
      state.diagnosis = diagnosis;
      state.plan = plan;
      state.readiness = readiness;
      state.passport = await context.api.getDecisionPassport(state.traceId);
    } catch (error) {
      if (generation !== state.generation || state.destroyed) return;
      state.error = error;
    } finally {
      if (generation === state.generation && !state.destroyed) {
        state.loading = false;
        renderDynamic(root, state, context);
      }
    }
  };

  const createEvidence = async () => {
    if (!state.readiness?.readinessId || state.evidenceCreating) return;
    state.evidenceCreating = true;
    renderDynamic(root, state, context);
    try {
      const missing = unique(state.readiness.missingEvidence || []);
      state.evidenceWorkOrder = await context.api.createDecisionEvidenceRequest(state.readiness.readinessId, {
        plotId: state.plotId,
        title: `决策补证：${missing.map(item => EVIDENCE_LABELS[item] || item).slice(0, 2).join('、') || '现场复测'}`,
        reason: `就绪度 ${state.readiness.status}；缺失 ${missing.join(', ') || '人工确认'}`,
        actionType: missing.includes('CONTROL_PERMISSION') ? 'APPROVAL' : missing.some(item => item.includes('DEVICE')) ? 'DEVICE_CHECK' : 'INSPECTION',
        priority: 'HIGH',
        dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      });
      context.showToast('最小补证工单已创建，可在“今日农务与巡田”继续处理', 'success');
    } catch (error) {
      context.showToast(`补证工单创建失败：${error.message || error}`, 'error');
    } finally {
      state.evidenceCreating = false;
      if (!state.destroyed) renderDynamic(root, state, context);
    }
  };

  const execute = async () => {
    const checkbox = root.querySelector('[data-role="approval-check"]');
    if (!checkbox?.checked || !state.plan?.executable || state.readiness?.status !== 'READY' || state.executing) return;
    state.executing = true;
    state.approvalOpen = false;
    renderDynamic(root, state, context);
    try {
      state.command = await context.api.executeIrrigation(state.plan.planId, state.plotId, {
        idempotencyKey: state.idempotencyKey,
        approved: true,
        source: 'web-decision-console'
      });
      renderDynamic(root, state, context);
      const commandId = state.command.commandId;
      for (let attempt = 0; attempt < 5 && !state.destroyed; attempt += 1) {
        const currentStatus = String(state.command?.ack?.status || state.command?.status || '').toUpperCase();
        if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'TIMEOUT'].includes(currentStatus)) break;
        await delay(650);
        try {
          state.command = await context.api.getCommand(commandId) || state.command;
          renderDynamic(root, state, context);
        } catch (_) { /* ACK 尚未产生时继续轮询 */ }
      }
      try { state.evaluation = await context.api.getCommandEvaluation(commandId); } catch (_) { /* 评价可能仍处于 PENDING */ }
      await refreshPassport();
      const status = state.command?.ack?.status || state.command?.status || 'PENDING';
      context.showToast(`虚拟命令已留痕，当前状态：${status}`, status === 'SUCCEEDED' ? 'success' : 'info');
    } catch (error) {
      state.error = error;
      context.showToast(`虚拟执行未提交：${error.message || error}`, 'error');
    } finally {
      state.executing = false;
      if (!state.destroyed) renderDynamic(root, state, context);
    }
  };

  const onClick = event => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.action;
    if (action === 'reevaluate') evaluate();
    if (action === 'create-evidence') createEvidence();
    if (action === 'prepare-execution') { state.approvalOpen = true; renderDynamic(root, state, context); }
    if (action === 'cancel-approval') { state.approvalOpen = false; renderDynamic(root, state, context); }
    if (action === 'confirm-execution') execute();
    if (action === 'refresh-passport') refreshPassport();
  };

  const onChange = event => {
    if (event.target.matches('[data-role="plot-select"]')) {
      state.plotId = event.target.value;
      if (app?.state) app.state.currentPlotId = state.plotId;
      evaluate();
    }
    if (event.target.matches('[data-role="scenario-select"]')) {
      state.scenario = event.target.value;
      evaluate();
    }
    if (event.target.matches('[data-role="approval-check"]')) {
      const button = root.querySelector('[data-action="confirm-execution"]');
      if (button) button.disabled = !event.target.checked;
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  renderDynamic(root, state, context);
  await evaluate();

  return () => {
    state.destroyed = true;
    state.generation += 1;
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
  };
}
