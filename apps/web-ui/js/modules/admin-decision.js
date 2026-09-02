import { api } from '../api.js?v=20260902-manager-plot-order-v1';
import { adminMetricLabel } from '../admin-state.js?v=20260902-v5911-zhcn-v1';
import { canExecuteIrrigation } from '../roles.js?v=20260902-v5911-zhcn-v1';
import { metricLabel, metricStatusLabel, provenanceLabel, sourceLabel, statusLabel } from '../live-data.js?v=20260902-ai-direct-v2';

const { ref, computed, watch, onMounted } = Vue;

const RISK_META = Object.freeze({
  WATER_DEFICIT: { label: '地块缺水', icon: '💧', tone: 'water', advice: '湿度持续偏低，可以进入补水试算。' },
  SENSOR_DRIFT: { label: '传感器读数可疑', icon: '〽', tone: 'drift', advice: '先用便携设备复测，禁止按可疑读数直接灌溉。' },
  DEVICE_FAULT: { label: '采集设备异常', icon: '⌁', tone: 'device', advice: '先恢复设备和新鲜数据，再重新诊断。' },
  HEAT_STRESS: { label: '高温胁迫', icon: '☀', tone: 'heat', advice: '补充温度、湿度与作物现场观察，先核验通风或遮阴。' },
  INSUFFICIENT_EVIDENCE: { label: '证据不足', icon: '?', tone: 'unknown', advice: '需要补充现场检查或更长时间的数据。' }
});

const READINESS_META = Object.freeze({
  READY: { label: '可以执行', tone: 'ready', description: '数据、设备、权限和安全限制均已通过。' },
  NEEDS_EVIDENCE: { label: '需要补充检查', tone: 'evidence', description: '当前只能参考，不能创建灌溉命令。' },
  HUMAN_REVIEW: { label: '等待人工复核', tone: 'review', description: '建议已生成，但仍缺少关键证据或确认。' },
  UNAVAILABLE: { label: '当前不可执行', tone: 'unavailable', description: '设备、数据或安全条件不满足。' }
});

const GATE_LABELS = Object.freeze({
  requiredMetrics: '关键数据', freshness: '数据是否新鲜', dataQuality: '数据是否可靠', deviceHealth: '设备是否在线',
  diagnosisSafety: '诊断是否安全', resourceCapacity: '水源是否充足', permission: '账号权限', safetyLimit: '用水是否超限'
});

const EVIDENCE_LABELS = Object.freeze({
  FLOW_RATE_CALIBRATION: '检查流量计', PORTABLE_METER_COMPARISON: '使用便携仪复测', FRESH_TELEMETRY: '获取最新传感器数据',
  DEVICE_HEALTH: '检查设备在线状态', MORE_TELEMETRY_HISTORY: '延长数据观察时间', CONTROL_PERMISSION: '当前账号无执行权限'
});

const CODE_LABELS = Object.freeze({
  WATER_DEFICIT: '地块缺水', SENSOR_DRIFT: '传感器漂移', DEVICE_FAULT: '设备异常',
  HEAT_STRESS: '高温胁迫', COLD_STRESS: '低温胁迫', INSUFFICIENT_EVIDENCE: '证据不足',
  REQUIRED_METRICS: '关键数据', FRESHNESS: '数据新鲜度', DATA_QUALITY: '数据质量',
  DEVICE_HEALTH: '设备健康', DIAGNOSIS_SAFETY: '诊断安全性', RESOURCE_CAPACITY: '水源容量',
  CONTROL_PERMISSION: '控制权限'
});

function readableCode(value, fallback = '未知') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/[㐀-鿿]/.test(raw)) return raw;
  return CODE_LABELS[raw.toUpperCase().replace(/[\s-]+/g, '_')] || metricLabel(raw, fallback);
}

function traceId() {
  return `decision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function asPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric * 100)}%` : '—';
}

function terminalStatus(command) {
  return String(command?.ack?.status || command?.status || '').toUpperCase();
}

export const AdminDecisionView = {
  props: {
    state: { type: Object, required: true },
    routeParams: { type: Object, default: () => ({}) }
  },
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const selectedPlotId = ref('');
    const scenario = ref('normal');
    const loading = ref(false);
    const executing = ref(false);
    const evidenceCreating = ref(false);
    const confirmed = ref(false);
    const demoOutcome = ref('SUCCEEDED');
    const error = ref(null);
    const currentTraceId = ref('');
    const diagnosis = ref(null);
    const plan = ref(null);
    const readiness = ref(null);
    const command = ref(null);
    const evaluation = ref(null);
    const passport = ref(null);
    const evidenceRequest = ref(null);
    const aiExplanation = ref(null);
    const aiExplaining = ref(false);
    const aiExplanationError = ref(null);
    let aiExplanationRequest = 0;

    const plots = computed(() => props.state?.plots || []);
    const selectedPlot = computed(() => plots.value.find((item) => item.plotId === selectedPlotId.value) || null);
    const farmId = computed(() => props.state?.adminContext?.farmId || selectedPlot.value?.farmId || props.routeParams?.farmId || '');
    const isDemo = computed(() => props.state?.sessionMode === 'demo');
    const canApprove = computed(() => canExecuteIrrigation(props.state?.currentUser));
    const risk = computed(() => RISK_META[String(diagnosis.value?.primaryCause || '').toUpperCase()] || RISK_META.INSUFFICIENT_EVIDENCE);
    const readinessView = computed(() => READINESS_META[String(readiness.value?.status || 'UNAVAILABLE').toUpperCase()] || READINESS_META.UNAVAILABLE);
    const gates = computed(() => Object.entries(readiness.value?.hardGates || {}).map(([key, gateStatus]) => ({ key, label: GATE_LABELS[key] || readableCode(key, '检查项'), status: gateStatus })));
    const missingEvidence = computed(() => (readiness.value?.missingEvidence || []).map((item) => EVIDENCE_LABELS[item] || readableCode(item, '补充证据')));
    const canExecute = computed(() => canApprove.value && plan.value?.executable === true && readiness.value?.status === 'READY' && confirmed.value && !executing.value);
    const commandStatus = computed(() => terminalStatus(command.value));
    const isCommandSuccess = computed(() => commandStatus.value === 'SUCCEEDED');
    const metrics = computed(() => Object.entries(selectedPlot.value?.metrics || {}).slice(0, 6).map(([code, metric]) => ({
      code,
      ...metric,
      label: adminMetricLabel(code, metric?.label)
    })));
    const dataLabel = computed(() => {
      if (isDemo.value) return '演示数据';
      if (String(scenario.value).toUpperCase() !== 'NORMAL') return '情景数据';
      const backendSimulation = metrics.value.some((metric) =>
        String(metric.sourceMode || '').toUpperCase() === 'SIMULATION'
        || String(metric.provenance || '').toUpperCase() === 'SIMULATED');
      return backendSimulation ? '后端模拟遥测' : '现场数据';
    });
    const metricSource = (metric) => {
      if (isDemo.value) return '演示数据';
      if (String(scenario.value).toUpperCase() !== 'NORMAL') return '情景数据';
      return String(metric?.sourceMode || '').toUpperCase() === 'SIMULATION' ? '后端数据' : '现场数据';
    };
    const executionLabel = computed(() => isDemo.value ? '演示命令' : '后端虚拟命令');
    const passportCounts = computed(() => ({
      observations: Array.isArray(passport.value?.observations)
        ? passport.value.observations.length
        : Object.keys(passport.value?.observations || {}).length,
      humanObservations: passport.value?.humanObservations?.length || 0,
      diagnoses: passport.value?.diagnoses?.length || (diagnosis.value ? 1 : 0),
      plans: passport.value?.plans?.length || (plan.value ? 1 : 0),
      commands: passport.value?.commands?.length || (command.value ? 1 : 0),
      evaluations: passport.value?.evaluations?.length || (evaluation.value ? 1 : 0)
    }));
    const decisionTraceId = computed(() => passport.value?.traceId || diagnosis.value?.traceId || currentTraceId.value || '—');
    const humanTime = value => {
      const date = new Date(value || 0);
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const clearResult = () => {
      diagnosis.value = null;
      plan.value = null;
      readiness.value = null;
      command.value = null;
      evaluation.value = null;
      passport.value = null;
      evidenceRequest.value = null;
      aiExplanation.value = null;
      aiExplanationError.value = null;
      aiExplanationRequest += 1;
      aiExplaining.value = false;
      confirmed.value = false;
    };

    const requirePlot = () => {
      if (selectedPlotId.value) return true;
      const contextError = new Error('请选择一个地块后再开始诊断');
      contextError.code = 'PLOT_CONTEXT_REQUIRED';
      error.value = contextError;
      return false;
    };

    const requestAiExplanation = async (force = false) => {
      const diagnosisRecord = diagnosis.value;
      const plotId = selectedPlotId.value;
      const trace = currentTraceId.value;
      if (!diagnosisRecord?.diagnosisId || !plotId) return;
      const requestId = ++aiExplanationRequest;
      aiExplaining.value = true;
      aiExplanationError.value = null;
      try {
        const explained = await api.explainDiagnosis(diagnosisRecord.diagnosisId, plotId, { force });
        if (requestId !== aiExplanationRequest || trace !== currentTraceId.value || diagnosis.value?.diagnosisId !== diagnosisRecord.diagnosisId) return;
        diagnosis.value = explained;
        aiExplanation.value = explained.aiExplanation || null;
      } catch (caught) {
        if (requestId === aiExplanationRequest && trace === currentTraceId.value) aiExplanationError.value = caught;
      } finally {
        if (requestId === aiExplanationRequest) aiExplaining.value = false;
      }
    };

    const runDecisionChain = async () => {
      if (!requirePlot() || loading.value) return;
      loading.value = true;
      error.value = null;
      clearResult();
      currentTraceId.value = traceId();
      const scenarioInput = scenario.value === 'normal' ? {} : { scenarioId: scenario.value };
      try {
        diagnosis.value = await api.evaluateDiagnosis(selectedPlotId.value, { ...scenarioInput, traceId: currentTraceId.value });
        plan.value = await api.estimateIrrigation({
          plotId: selectedPlotId.value,
          diagnosisId: diagnosis.value.diagnosisId,
          traceId: currentTraceId.value,
          ...scenarioInput
        });
        readiness.value = await api.getDecisionReadiness('IRRIGATION_PLAN', plan.value.planId, {
          farmId: farmId.value,
          plotId: selectedPlotId.value,
          diagnosis: diagnosis.value,
          plan: plan.value
        });
        passport.value = await api.getDecisionPassport(currentTraceId.value);
      } catch (caught) {
        error.value = caught;
      } finally {
        loading.value = false;
        if (diagnosis.value && currentTraceId.value) void requestAiExplanation();
      }
    };

    const loadApprovalPlan = async () => {
      const requestedPlanId = props.routeParams?.planId;
      if (!requestedPlanId || loading.value) return false;
      loading.value = true;
      error.value = null;
      clearResult();
      try {
        plan.value = await api.getIrrigationPlan(requestedPlanId);
        selectedPlotId.value = plan.value.plotId;
        currentTraceId.value = props.routeParams?.traceId || plan.value.traceId;
        passport.value = currentTraceId.value ? await api.getDecisionPassport(currentTraceId.value) : null;
        diagnosis.value = (passport.value?.diagnoses || []).find(item => item.diagnosisId === plan.value.diagnosisId)
          || (passport.value?.diagnoses || [])[0]
          || await api.evaluateDiagnosis(plan.value.plotId, { traceId: currentTraceId.value });
        readiness.value = await api.getDecisionReadiness('IRRIGATION_PLAN', plan.value.planId, {
          farmId: farmId.value,
          plotId: plan.value.plotId,
          diagnosis: diagnosis.value,
          plan: plan.value
        });
        return true;
      } catch (caught) {
        error.value = caught;
        return false;
      } finally {
        loading.value = false;
        if (diagnosis.value && currentTraceId.value) void requestAiExplanation();
      }
    };

    const choosePlot = () => {
      error.value = null;
      if (!selectedPlotId.value) return;
      emit('navigate', 'decision-console', { farmId: farmId.value, plotId: selectedPlotId.value });
      runDecisionChain();
    };

    const createEvidenceRequest = async () => {
      if (!readiness.value?.readinessId || evidenceCreating.value) return;
      evidenceCreating.value = true;
      try {
        evidenceRequest.value = await api.createDecisionEvidenceRequest(readiness.value.readinessId, {
          farmId: farmId.value,
          plotId: selectedPlotId.value,
          title: `决策补充检查：${missingEvidence.value.slice(0, 2).join('、') || '现场复测'}`,
          reason: `当前就绪状态为 ${readiness.value.status}`,
          actionType: 'INSPECTION',
          priority: 'HIGH',
          dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        });
        emit('data-invalidated', { domains: ['workOrders'], farmId: farmId.value, plotIds: [selectedPlotId.value], record: evidenceRequest.value });
      } catch (caught) {
        error.value = caught;
      } finally {
        evidenceCreating.value = false;
      }
    };

    const executePlan = async () => {
      if (!canExecute.value) return;
      executing.value = true;
      error.value = null;
      try {
        command.value = await api.executeIrrigation(plan.value.planId, selectedPlotId.value, {
          confirmed: true,
          approved: true,
          idempotencyKey: `web-${currentTraceId.value}`,
          source: 'admin-decision-console',
          workOrderId: props.routeParams?.workOrderId,
          ...(isDemo.value ? { outcome: demoOutcome.value } : {})
        });
        for (let attempt = 0; attempt < 6; attempt += 1) {
          if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'TIMEOUT'].includes(terminalStatus(command.value))) break;
          await delay(650);
          command.value = await api.getCommand(command.value.commandId) || command.value;
        }
        evaluation.value = await api.getCommandEvaluation(command.value.commandId);
        passport.value = await api.getDecisionPassport(currentTraceId.value);
        emit('data-invalidated', { domains: ['commands', 'evaluations', 'plots'], farmId: farmId.value, plotIds: [selectedPlotId.value] });
      } catch (caught) {
        error.value = caught;
      } finally {
        executing.value = false;
      }
    };

    const refreshPassport = async () => {
      if (!currentTraceId.value) return;
      try {
        passport.value = await api.getDecisionPassport(currentTraceId.value);
      } catch (caught) {
        error.value = caught;
      }
    };

    watch(() => props.routeParams?.plotId, (routePlotId) => {
      if (!routePlotId || routePlotId === selectedPlotId.value) return;
      selectedPlotId.value = routePlotId;
      runDecisionChain();
    });

    watch(() => props.routeParams?.planId, (planId) => {
      if (planId) void loadApprovalPlan();
    });

    onMounted(() => {
      if (props.routeParams?.planId) {
        void loadApprovalPlan();
        return;
      }
      const routePlotId = props.routeParams?.plotId;
      if (routePlotId && plots.value.some((item) => item.plotId === routePlotId)) {
        selectedPlotId.value = routePlotId;
        runDecisionChain();
      } else if (isDemo.value && plots.value.length) {
        selectedPlotId.value = plots.value[0].plotId;
        runDecisionChain();
      } else {
        requirePlot();
      }
    });

    return {
      selectedPlotId, scenario, loading, executing, evidenceCreating, confirmed, demoOutcome, error,
      diagnosis, plan, readiness, command, evaluation, passport, evidenceRequest, plots, selectedPlot,
      aiExplanation, aiExplaining, aiExplanationError,
      farmId, isDemo, canApprove, risk, readinessView, gates, missingEvidence, canExecute, commandStatus,
      isCommandSuccess, metrics, dataLabel, metricSource, executionLabel, passportCounts, decisionTraceId, humanTime, RISK_META, readableCode, runDecisionChain, loadApprovalPlan, choosePlot, createEvidenceRequest,
      executePlan, refreshPassport, requestAiExplanation, asPercent,
      metricStatusLabel, provenanceLabel, sourceLabel, statusLabel
    };
  },
  template: `
    <section class="dc-root admin-decision" aria-labelledby="decision-title">
      <header class="dc-hero">
        <div class="dc-hero-copy">
          <span class="dc-kicker">诊断 · 确认 · 虚拟执行</span>
          <h2 id="decision-title">智能诊断与灌溉决策</h2>
          <p>选择地块后，系统按同一条链路完成诊断、补水试算、安全检查和执行留痕。</p>
        </div>
        <div class="dc-toolbar">
          <label>当前地块
            <select v-model="selectedPlotId" @change="choosePlot">
              <option value="">请选择地块</option>
              <option v-for="plot in plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}（{{ plot.plotId }}）</option>
            </select>
          </label>
          <label>诊断场景
            <select v-model="scenario" @change="runDecisionChain" :disabled="!selectedPlotId">
              <option value="normal">当前状态</option>
              <option value="drought">干旱测试</option>
              <option value="sensor-drift">读数漂移测试</option>
              <option value="device-offline">设备离线测试</option>
            </select>
          </label>
          <button class="dc-button primary" @click="runDecisionChain" :disabled="loading || !selectedPlotId">{{ loading ? '正在分析…' : '重新分析' }}</button>
        </div>
      </header>

      <div class="dc-trust-strip">
        <span>{{ dataLabel }}</span><i></i>
        <span>所有剂量由当前地块数据计算</span><i></i><span>未通过安全检查时禁止执行</span>
      </div>
      <div v-if="error" class="dc-error"><strong>诊断失败</strong><span>{{ error.message || error }}</span></div>

      <template v-if="selectedPlot">
        <section class="dc-context-bar">
          <div><span class="dc-live-dot"></span><strong>{{ selectedPlot.name }}</strong><small>{{ selectedPlot.cropName || selectedPlot.cropCode }} · {{ selectedPlot.stageLabel || selectedPlot.stage }}</small></div>
          <div class="dc-context-tags"><span>{{ selectedPlot.plotId }}</span><span>{{ farmId }}</span><span>{{ isDemo ? '演示' : '正式' }}</span></div>
        </section>

        <section class="dc-metric-grid">
          <article v-for="metric in metrics" :key="metric.code" class="dc-metric" :class="{'is-warn': !['NORMAL','GOOD'].includes(String(metric.status || '').toUpperCase())}">
            <span>{{ metric.label || metric.code }}</span><strong>{{ metric.value ?? '—' }}<small>{{ metric.unit }}</small></strong>
            <footer><b>{{ metricStatusLabel(metric.status) }}</b><em>{{ metricSource(metric) }}</em></footer>
          </article>
        </section>

        <div class="dc-main-grid">
          <main>
            <section class="dc-card">
              <div class="dc-card-heading"><div><span class="dc-kicker">第一步 · 找出原因</span><h3>智能辅助诊断</h3></div><span class="dc-version-chip">{{ diagnosis?.ruleVersion || '等待分析' }}</span></div>
              <div v-if="diagnosis" class="dc-primary-cause" :class="'tone-' + risk.tone">
                <div class="dc-cause-icon">{{ risk.icon }}</div>
                <div class="dc-cause-copy"><small>最可能原因</small><strong>{{ risk.label }}</strong><p>{{ risk.advice }}</p></div>
                <div class="dc-confidence"><strong>{{ asPercent(diagnosis.confidence) }}</strong><span>可信程度</span></div>
              </div>
              <div v-if="diagnosis" class="dc-candidate-list">
                <article v-for="candidate in diagnosis.candidateCauses" :key="candidate.code" :class="{'is-primary': candidate.code === diagnosis.primaryCause}">
                  <div><strong>{{ RISK_META?.[candidate.code]?.label || readableCode(candidate.code, '待确认原因') }}</strong><em>{{ asPercent(candidate.confidence) }}</em></div>
                  <div class="dc-score-track"><i :style="{width: asPercent(candidate.confidence)}"></i></div>
                </article>
              </div>
              <div v-if="diagnosis" class="dc-ai-explanation" :class="{'is-degraded': aiExplanation?.degraded}">
                <div class="dc-ai-explanation__head">
                  <div><span class="dc-kicker">证据解释层</span><strong>{{ aiExplanation?.sourceLabel ? sourceLabel(aiExplanation.sourceLabel) : '智能解释准备中' }}</strong></div>
                  <button class="dc-button secondary" @click="requestAiExplanation(true)" :disabled="aiExplaining">{{ aiExplaining ? '生成中…' : '重新解释' }}</button>
                </div>
                <p v-if="aiExplaining" class="dc-ai-explanation__text is-loading">正在结合当前证据生成简洁解释…</p>
                <p v-else-if="aiExplanation" class="dc-ai-explanation__text">{{ aiExplanation.text }}</p>
                <p v-else-if="aiExplanationError" class="dc-ai-explanation__text is-error">规则诊断已保留，智能解释暂时不可用：{{ aiExplanationError.message || '请稍后重试' }}</p>
                <p v-else class="dc-ai-explanation__text">正在准备解释，不影响规则诊断和安全检查。</p>
                <small class="dc-ai-explanation__meta">规则引擎负责主因、置信度和安全门；智能助手只解释证据，不改变执行结论。</small>
              </div>
              <div v-if="!diagnosis" class="dc-empty-panel">{{ loading ? '正在读取地块数据并分析…' : '等待开始分析' }}</div>
            </section>

            <section class="dc-card">
              <div class="dc-card-heading"><div><span class="dc-kicker">第二步 · 生成办法</span><h3>补水建议</h3></div><span class="dc-plan-state" :class="plan?.executable ? 'is-ready' : 'is-advisory'">{{ plan?.executable ? '可执行' : '仅供参考' }}</span></div>
              <template v-if="plan">
                <div class="dc-prescription-grid">
                  <article><span>做什么</span><strong>精准补水</strong><small>灌溉</small></article>
                  <article><span>在哪块地</span><strong>{{ selectedPlot.name }}</strong><small>{{ plan.plotId }}</small></article>
                  <article class="is-dose"><span>建议用水</span><strong>{{ Number(plan.waterLitre || 0).toFixed(1) }} 升</strong><small>{{ Math.ceil(Number(plan.durationSeconds || 0) / 60) }} 分钟</small></article>
                  <article><span>预计变化</span><strong>{{ plan.expectedResult?.from ?? '—' }}% → {{ plan.expectedResult?.to ?? '—' }}%</strong><small>土壤湿度</small></article>
                </div>
                <div class="dc-why-row"><div><span>为什么这样做</span><p>{{ plan.why }}</p></div><div><span>其他选择</span><p>{{ plan.alternatives?.[0] || '稍后复测再决定' }}</p></div></div>
              </template>
              <div v-else class="dc-empty-panel">尚未生成建议</div>
            </section>

            <section class="dc-card">
              <div class="dc-card-heading"><div><span class="dc-kicker">第三步 · 人工确认</span><h3>虚拟执行与回执</h3></div><span class="dc-command-id">{{ command?.commandId || '尚未创建命令' }}</span></div>
              <div class="dc-approval-panel embedded" v-if="plan">
                <label><input type="checkbox" v-model="confirmed" :disabled="!plan.executable || readiness?.status !== 'READY'"> 我已核对地块、用水量和设备状态，同意创建虚拟灌溉命令。</label>
                <label v-if="isDemo" class="dc-outcome-select">演示回执
                  <select v-model="demoOutcome"><option value="SUCCEEDED">成功</option><option value="PARTIAL">部分完成</option><option value="FAILED">失败</option><option value="TIMEOUT">超时</option></select>
                </label>
                <button class="dc-button primary" @click="executePlan" :disabled="!canExecute">{{ executing ? '等待设备回执…' : '确认并虚拟执行' }}</button>
              </div>
              <div v-if="command" class="dc-execution-facts">
                <div><span>执行方式</span><strong>{{ executionLabel }}</strong></div>
                <div><span>命令状态</span><strong :class="'status-' + commandStatus.toLowerCase()">{{ statusLabel(commandStatus) }}</strong></div>
                <div><span>实际用水</span><strong>{{ command.ack?.actualWaterLitre ?? '—' }} 升</strong></div>
                <div><span>效果评价</span><strong>{{ statusLabel(evaluation?.status, '等待评价') }}</strong></div>
              </div>
              <p v-if="command && !isCommandSuccess" class="dc-command-warning">本次结果不是成功：{{ statusLabel(commandStatus, '未知') }}。系统不会把它显示为已完成。</p>
            </section>
          </main>

          <aside>
            <section class="dc-card" :class="'tone-' + readinessView.tone">
              <div class="dc-card-heading"><div><span class="dc-kicker">安全检查</span><h3>现在能不能执行</h3></div><span class="dc-readiness-badge" :class="'tone-' + readinessView.tone">{{ readinessView.label }}</span></div>
              <div class="dc-readiness-summary" v-if="readiness"><div class="dc-score-ring" :style="{'--dc-score': Math.round(Number(readiness.score || 0) * 360) + 'deg'}"><div><strong>{{ Math.round(Number(readiness.score || 0) * 100) }}</strong><span>综合分</span></div></div><p>{{ readinessView.description }}</p></div>
              <div class="dc-gate-grid"><article v-for="gate in gates" :key="gate.key" :class="'gate-' + String(gate.status).toLowerCase()"><i>{{ gate.status === 'PASS' ? '✓' : gate.status === 'REVIEW' ? '◐' : '×' }}</i><div><strong>{{ gate.label }}</strong><span>{{ statusLabel(gate.status) }}</span></div></article></div>
              <div v-if="missingEvidence.length" class="dc-missing-actions"><strong>还需要做</strong><span v-for="item in missingEvidence" :key="item">{{ item }}</span></div>
              <button v-if="readiness && readiness.status !== 'READY'" class="dc-button secondary wide" @click="createEvidenceRequest" :disabled="evidenceCreating">{{ evidenceCreating ? '正在创建…' : evidenceRequest ? '检查任务已创建' : '创建补充检查任务' }}</button>
            </section>

            <section class="dc-card dc-passport-card">
              <div class="dc-card-heading"><div><span class="dc-kicker">全程留痕</span><h3>本次决策记录</h3></div><button class="dc-button secondary" @click="refreshPassport">刷新</button></div>
              <div class="dc-trace"><span>追踪编号</span><code>{{ decisionTraceId }}</code></div>
              <div class="dc-passport-flow"><article><strong>{{ passportCounts.observations }}</strong><span>数据</span></article><i>→</i><article><strong>{{ passportCounts.humanObservations }}</strong><span>巡田</span></article><i>→</i><article><strong>{{ passportCounts.diagnoses }}</strong><span>诊断</span></article><i>→</i><article><strong>{{ passportCounts.plans }}</strong><span>建议</span></article><i>→</i><article><strong>{{ passportCounts.commands }}</strong><span>命令</span></article><i>→</i><article><strong>{{ passportCounts.evaluations }}</strong><span>评价</span></article></div>
              <div v-if="passport?.humanObservations?.length" class="dc-human-evidence">
                <article v-for="observation in passport.humanObservations" :key="observation.inspectionId">
                  <strong>{{ observation.operatorName || observation.operatorId || '现场人员' }} · {{ provenanceLabel(observation.provenance || 'USER_PROVIDED') }}</strong>
                  <span>{{ humanTime(observation.observedAt || observation.createdAt) }} · {{ observation.inspectionId }}</span>
                  <small>{{ observation.workOrderId ? '关联任务 ' + observation.workOrderId : '未关联任务' }}</small>
                </article>
              </div>
              <div class="dc-provenance-row"><span v-for="source in (passport?.provenance || [])" :key="source">{{ provenanceLabel(source) }}</span><em v-if="!passport">等待后端记录</em></div>
            </section>
          </aside>
        </div>
      </template>
    </section>
  `
};
