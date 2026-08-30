import { api } from '../api.js?v=20260828-v58';
import { roleCan } from '../roles.js';
import { priorityLabel, sourceLabel, statusLabel } from '../live-data.js?v=20260827-boot-fix-1';

const { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, inject } = Vue;

const PRIORITIES = Object.freeze([
  { value: 'HIGH', label: '优先处理' },
  { value: 'MEDIUM', label: '正常安排' },
  { value: 'LOW', label: '可以延后' }
]);

const METRICS = Object.freeze([
  { value: 'SOIL_MOISTURE', label: '土壤湿度', unit: '%' },
  { value: 'AIR_TEMPERATURE', label: '空气温度', unit: '°C' },
  { value: 'AIR_HUMIDITY', label: '空气湿度', unit: '%RH' }
]);

const RISK_RANK = Object.freeze({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 });

function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function recommendedWater(plot) {
  const moisture = numberOr(plot?.metrics?.SOIL_MOISTURE?.value, 25);
  const area = numberOr(plot?.areaM2, 80);
  const targetText = String(plot?.metrics?.SOIL_MOISTURE?.target || '30');
  const targetMatch = targetText.match(/(\d+(?:\.\d+)?)/g);
  const target = targetMatch?.length ? numberOr(targetMatch.at(-1), 30) : 30;
  return Math.max(20, Math.round(Math.max(0, target - moisture) * area * .08));
}

function deviceForPlot(plotId, devices = []) {
  const matches = devices.filter((device) => String(device?.plotId || '') === String(plotId || ''));
  return matches.find((device) => String(device?.status || '').toUpperCase() === 'ONLINE') || matches[0] || null;
}

export function buildResourceRows(plots = [], devices = [], previousRows = []) {
  const previous = new Map((previousRows || []).map((row) => [row.plotId, row]));
  return (plots || []).map((plot, index) => {
    const old = previous.get(plot.plotId);
    const moisture = numberOr(plot?.metrics?.SOIL_MOISTURE?.value, 30);
    const declaredRisk = String(plot?.riskLevel || '').toUpperCase();
    const riskLevel = declaredRisk || (moisture < 18 ? 'HIGH' : moisture < 24 ? 'MEDIUM' : 'LOW');
    const demand = recommendedWater(plot);
    const device = deviceForPlot(plot.plotId, devices);
    return {
      plotId: plot.plotId,
      name: plot.name || plot.plotId,
      cropName: plot.cropName || plot.cropCode || '未设置作物',
      included: old?.included ?? true,
      confirmed: old?.confirmed ?? false,
      requestedLitres: old?.requestedLitres ?? demand,
      aiSuggestedLitres: demand,
      priority: old?.priority || (RISK_RANK[riskLevel] >= 3 ? 'HIGH' : RISK_RANK[riskLevel] === 2 ? 'MEDIUM' : 'LOW'),
      riskLevel,
      riskScore: RISK_RANK[riskLevel] || 0,
      soilMoisture: moisture,
      deviceId: device?.deviceId || device?.id || '',
      deviceStatus: String(device?.status || 'UNBOUND').toUpperCase(),
      windowStart: old?.windowStart || `${String(6 + (index % 3) * 2).padStart(2, '0')}:00`,
      windowEnd: old?.windowEnd || `${String(8 + (index % 3) * 2).padStart(2, '0')}:00`,
      adjustmentReason: old?.adjustmentReason || '',
      provenance: old?.provenance || 'ESTIMATED'
    };
  }).sort((a, b) => b.riskScore - a.riskScore || b.aiSuggestedLitres - a.aiSuggestedLitres || a.name.localeCompare(b.name, 'zh-CN'));
}

export function resourceQuotaSummary(profile = {}, result = null, selectedRows = [], ledgers = []) {
  const capacityValue = result?.constraints?.waterCapacityLitres ?? profile.capacityLitres;
  const capacity = Number.isFinite(Number(capacityValue)) ? Number(capacityValue) : null;
  const ledgerActual = (ledgers || []).reduce((sum, ledger) => sum + numberOr(ledger?.metrics?.actualWaterLitres), 0);
  const actualValue = profile.usedTodayLitres ?? ((ledgers || []).length ? ledgerActual : null);
  const actual = Number.isFinite(Number(actualValue)) ? Number(actualValue) : null;
  const reserved = (result?.allocations || []).reduce((sum, row) => sum + numberOr(row.allocatedLitres), 0);
  const requested = (selectedRows || []).reduce((sum, row) => sum + numberOr(row.requestedLitres), 0);
  return { capacity, actual, reserved, requested, balance: capacity == null ? null : Math.max(0, capacity - reserved) };
}

export function mergeAllocationRows(rows = [], result = null) {
  return rows.map((row) => {
    const allocation = (result?.allocations || []).find((item) => item.plotId === row.plotId) || {};
    const unmet = (result?.unmetDemands || []).find((item) => item.plotId === row.plotId) || {};
    const allocatedLitres = numberOr(allocation.allocatedLitres);
    const shortageLitres = numberOr(unmet.unmetLitres, Math.max(0, numberOr(row.requestedLitres) - allocatedLitres));
    return { ...row, allocatedLitres, shortageLitres, allocationStatus: !result ? 'WAITING' : shortageLitres > 0 ? 'SHORTAGE' : 'ALLOCATED' };
  });
}

export function validateResourceAdjustment(draft = {}) {
  if (!(numberOr(draft.requestedLitres) > 0)) return '申请水量必须大于 0 升';
  if (!String(draft.windowStart || '').trim() || !String(draft.windowEnd || '').trim()) return '请填写完整执行窗口';
  if (!String(draft.reason || '').trim()) return '人工调整必须填写原因';
  return '';
}

function riskLabel(level) {
  return ({ CRITICAL: '极高风险', HIGH: '高风险', MEDIUM: '中风险', LOW: '低风险' })[String(level || '').toUpperCase()] || '待评估';
}

function allocationLabel(status) {
  return ({ WAITING: '待试算', ALLOCATED: '已满足', SHORTAGE: '有缺口' })[status] || statusLabel(status, '待试算');
}

export const AdminResourcePlanningView = {
  props: { state: { type: Object, required: true }, routeParams: { type: Object, default: () => ({}) } },
  emits: ['data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const rows = ref([]);
    const loading = ref(false);
    const analyzing = ref(false);
    const ledgerBusy = ref(false);
    const error = ref(null);
    const result = ref(null);
    const planState = ref('DRAFT');
    const quotaMode = ref('CURRENT');
    const selectedPlotId = ref('');
    const selectedMetric = ref('SOIL_MOISTURE');
    const forecast = ref(null);
    const forecastLoading = ref(false);
    const forecastError = ref('');
    const chartEl = ref(null);
    let chart = null;
    let forecastSerial = 0;
    const adjustmentOpen = ref(false);
    const adjustmentError = ref('');
    const adjustmentDraft = ref({ plotId: '', requestedLitres: 0, priority: 'MEDIUM', windowStart: '', windowEnd: '', reason: '' });
    const ledgerForm = ref({ plotId: '', plannedWaterLitres: '', actualWaterLitres: '', waterPricePerLitre: '', sourceMode: 'USER_PROVIDED' });

    const plots = computed(() => props.state?.plots || []);
    const devices = computed(() => props.state?.adminDevices || props.state?.devices || []);
    const farmId = computed(() => props.state?.adminContext?.farmId || props.routeParams?.farmId || plots.value[0]?.farmId || '');
    const isDemo = computed(() => props.state?.sessionMode === 'demo');
    const canManage = computed(() => roleCan(props.state?.currentUser, 'resource:manage'));
    const selectedRows = computed(() => rows.value.filter((row) => row.included));
    const allConfirmed = computed(() => selectedRows.value.length > 0 && selectedRows.value.every((row) => row.confirmed && numberOr(row.requestedLitres) > 0));
    const summary = computed(() => resourceQuotaSummary(props.state?.resourceProfile || {}, result.value, selectedRows.value, props.state?.valueLedgers || []));
    const plannedRows = computed(() => mergeAllocationRows(rows.value, result.value));
    const shortageTotal = computed(() => plannedRows.value.reduce((sum, row) => sum + row.shortageLitres, 0));
    const ledgers = computed(() => props.state?.valueLedgers || []);
    const currentMetric = computed(() => METRICS.find((item) => item.value === selectedMetric.value) || METRICS[0]);
    const currentPlot = computed(() => plots.value.find((plot) => plot.plotId === selectedPlotId.value) || plots.value[0] || null);
    const planStateLabel = computed(() => ({ DRAFT: '草案', EVALUATED: '已试算', CONFIRMED: '已确认', CANCELLED: '已取消', MANUAL_FALLBACK: '人工调整' })[planState.value] || planState.value);
    const futureQuota = computed(() => {
      const profile = props.state?.resourceProfile || {};
      if (Number.isFinite(Number(profile.remainingLitres))) return Number(profile.remainingLitres);
      if (!Number.isFinite(Number(profile.dailyLimitLitres))) return null;
      return Math.max(0, Number(profile.dailyLimitLitres) - numberOr(profile.usedTodayLitres));
    });

    const rebuildRows = () => {
      rows.value = buildResourceRows(plots.value, devices.value, rows.value);
      result.value = null;
      planState.value = 'DRAFT';
      if (!plots.value.some((plot) => plot.plotId === selectedPlotId.value)) selectedPlotId.value = plots.value[0]?.plotId || '';
      if (!plots.value.some((plot) => plot.plotId === ledgerForm.value.plotId)) ledgerForm.value.plotId = plots.value[0]?.plotId || '';
    };

    const resetPlan = () => { result.value = null; planState.value = 'DRAFT'; error.value = null; };

    const runAiAnalysis = async () => {
      analyzing.value = true;
      try {
        rows.value = buildResourceRows(plots.value, devices.value, []).map((row) => ({ ...row, included: true, confirmed: false, provenance: 'ESTIMATED' }));
        resetPlan();
        await loadForecast();
        toast?.('已按地块风险、缺水程度和面积刷新建议水量；请人工核对后再试算', 'success');
      } finally { analyzing.value = false; }
    };

    const evaluate = async () => {
      if (!canManage.value || !allConfirmed.value || loading.value) return;
      loading.value = true;
      error.value = null;
      result.value = null;
      try {
        result.value = await api.evaluateResourcePlan({
          farmId: farmId.value, scope: farmId.value, trialOnly: true,
          provenance: selectedRows.value.some((row) => row.provenance === 'USER_PROVIDED') ? 'USER_PROVIDED' : 'ESTIMATED',
          demands: selectedRows.value.map((row) => ({
            plotId: row.plotId, requestedLitres: numberOr(row.requestedLitres), waterLitre: numberOr(row.requestedLitres),
            priority: row.priority, windowStart: row.windowStart, windowEnd: row.windowEnd,
            confirmed: true, provenance: row.provenance
          }))
        });
        planState.value = 'EVALUATED';
      } catch (caught) { error.value = caught; }
      finally { loading.value = false; }
    };

    const confirmPlan = () => {
      if (!result.value) return;
      planState.value = 'CONFIRMED';
      toast?.('本次试算方案已在页面确认；未下发设备，也未扣减真实库存', 'success');
    };
    const cancelPlan = () => {
      if (!result.value) return;
      planState.value = 'CANCELLED';
      toast?.('已取消本次试算方案，未产生资源或设备变更');
    };
    const openAdjustment = (row) => {
      adjustmentDraft.value = { plotId: row.plotId, requestedLitres: numberOr(row.requestedLitres), priority: row.priority, windowStart: row.windowStart, windowEnd: row.windowEnd, reason: '' };
      adjustmentError.value = '';
      adjustmentOpen.value = true;
    };
    const closeAdjustment = () => { adjustmentOpen.value = false; adjustmentError.value = ''; };
    const applyAdjustment = () => {
      const validation = validateResourceAdjustment(adjustmentDraft.value);
      if (validation) { adjustmentError.value = validation; return; }
      const index = rows.value.findIndex((row) => row.plotId === adjustmentDraft.value.plotId);
      if (index < 0) return;
      rows.value[index] = {
        ...rows.value[index], requestedLitres: numberOr(adjustmentDraft.value.requestedLitres),
        priority: adjustmentDraft.value.priority, windowStart: adjustmentDraft.value.windowStart,
        windowEnd: adjustmentDraft.value.windowEnd, adjustmentReason: adjustmentDraft.value.reason.trim(),
        provenance: 'USER_PROVIDED', confirmed: true
      };
      result.value = null;
      planState.value = 'MANUAL_FALLBACK';
      closeAdjustment();
      toast?.('人工调整已记录，请重新执行容量试算', 'success');
    };
    const openManualFallback = () => {
      const target = plannedRows.value.find((row) => row.shortageLitres > 0) || selectedRows.value[0];
      if (target) openAdjustment(target);
    };

    const renderChart = async () => {
      await nextTick();
      if (!chartEl.value || typeof echarts === 'undefined') return;
      if (!chart) chart = echarts.init(chartEl.value);
      const curve = String(forecast.value?.status || '').toUpperCase() === 'AVAILABLE' && Array.isArray(forecast.value?.curve) ? forecast.value.curve : [];
      const measuredValue = numberOr(currentPlot.value?.metrics?.[selectedMetric.value]?.value, NaN);
      const measured = Number.isFinite(measuredValue) ? [[0, measuredValue]] : [];
      const expected = curve.map((point) => [numberOr(point.minute), numberOr(point.expected ?? point.value)]);
      const lower = curve.map((point) => [numberOr(point.minute), numberOr(point.lower ?? point.expected ?? point.value)]);
      const upper = curve.map((point) => [numberOr(point.minute), numberOr(point.upper ?? point.expected ?? point.value)]);
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const text = dark ? '#e8f0eb' : '#46584e';
      chart.setOption({
        animation: false, tooltip: { trigger: 'axis', confine: true },
        legend: { data: ['最新实测', 'AI 推演', '置信下界', '置信上界'], textStyle: { color: text, fontSize: 10 } },
        grid: { left: 48, right: 18, top: 42, bottom: 34 },
        xAxis: { type: 'value', name: '分钟', min: 0, axisLabel: { color: text } },
        yAxis: { type: 'value', name: currentMetric.value.unit, scale: true, axisLabel: { color: text }, nameTextStyle: { color: text } },
        series: [
          { name: '最新实测', type: 'scatter', data: measured, symbolSize: 10, itemStyle: { color: '#168554' } },
          { name: 'AI 推演', type: 'line', data: expected, showSymbol: false, smooth: true, lineStyle: { color: '#2563eb', width: 2 } },
          { name: '置信下界', type: 'line', data: lower, showSymbol: false, lineStyle: { color: '#8eb6e8', type: 'dashed', width: 1 } },
          { name: '置信上界', type: 'line', data: upper, showSymbol: false, lineStyle: { color: '#8eb6e8', type: 'dashed', width: 1 } }
        ]
      }, true);
    };

    const loadForecast = async () => {
      if (!selectedPlotId.value) { forecast.value = null; forecastError.value = ''; return; }
      const serial = ++forecastSerial;
      forecastLoading.value = true;
      forecastError.value = '';
      try {
        const row = rows.value.find((item) => item.plotId === selectedPlotId.value);
        const response = await api.evaluateRiskForecast({
          plotId: selectedPlotId.value, metric: selectedMetric.value, scenario: 'NORMAL', requestVersion: `resource-${serial}`,
          parameters: { forecastHours: 4, riskThreshold: Math.max(1, Math.min(40, numberOr(row?.soilMoisture, 20) - 4)) }
        });
        if (serial !== forecastSerial) return;
        forecast.value = response;
        if (String(response?.status || '').toUpperCase() !== 'AVAILABLE') forecastError.value = response?.reason || '当前数据不足，无法生成推演曲线';
      } catch (caught) {
        if (serial !== forecastSerial) return;
        forecast.value = null;
        forecastError.value = caught?.message || '风险推演暂不可用';
      } finally {
        if (serial === forecastSerial) { forecastLoading.value = false; renderChart(); }
      }
    };

    const createLedger = async () => {
      if (!ledgerForm.value.plotId || ledgerBusy.value) return;
      ledgerBusy.value = true;
      try {
        const ledger = await api.createValueLedger({ ...ledgerForm.value, farmId: farmId.value });
        emit('data-invalidated', { domains: ['ledgers'], record: ledger });
        toast?.(ledger.status === 'COMPUTED' ? '用水对账已生成' : '已保存不完整对账；缺少事实的字段保持为空', 'success');
      } catch (caught) { toast?.(caught.message || '用水对账失败', 'error'); }
      finally { ledgerBusy.value = false; }
    };

    const display = value => value === undefined || value === null || value === '' ? '—' : value;
    const metric = (ledger, key) => display(ledger?.metrics?.[key]);
    const ledgerStatusLabel = status => ({ COMPUTED: '已计算', INCOMPLETE: '待补充' })[String(status || '').toUpperCase()] || statusLabel(status, '待补充');
    const deviceStatusLabel = status => statusLabel(status, '未绑定');
    const readableTime = value => {
      const date = new Date(value || 0);
      return Number.isNaN(date.getTime()) || date.getTime() <= 0 ? '时间未记录' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    };

    watch([plots, devices], rebuildRows, { deep: true });
    watch(farmId, () => { rows.value = []; rebuildRows(); quotaMode.value = 'CURRENT'; closeAdjustment(); });
    watch([selectedPlotId, selectedMetric], loadForecast);
    onMounted(() => { rebuildRows(); loadForecast(); window.addEventListener('resize', renderChart); });
    onBeforeUnmount(() => { forecastSerial += 1; window.removeEventListener('resize', renderChart); chart?.dispose(); chart = null; });

    return {
      rows, loading, analyzing, ledgerBusy, error, result, planState, planStateLabel, quotaMode, futureQuota,
      priorities: PRIORITIES, metrics: METRICS, plots, farmId, isDemo, canManage, selectedRows, allConfirmed,
      summary, plannedRows, shortageTotal, selectedPlotId, selectedMetric, currentMetric, currentPlot, forecast,
      forecastLoading, forecastError, chartEl, adjustmentOpen, adjustmentDraft, adjustmentError, ledgers, ledgerForm,
      runAiAnalysis, evaluate, confirmPlan, cancelPlan, openAdjustment, closeAdjustment, applyAdjustment,
      openManualFallback, createLedger, resetPlan, riskLabel, allocationLabel, priorityLabel, sourceLabel,
      display, metric, ledgerStatusLabel, deviceStatusLabel, readableTime
    };
  },
  template: `
    <section class="rp-root" aria-labelledby="resource-title">
      <header class="rp-hero"><div><span>资源安排 · 当前仅接入水资源</span><h2 id="resource-title">配额、风险与用水计划</h2><p>先用风险与需求形成试算草案，再由管理员核对分配；灌溉审批、执行和验收仍在农务任务统一闭环。</p></div><div class="rp-hero-actions"><button class="rp-button secondary" type="button" @click="quotaMode = quotaMode === 'CURRENT' ? 'FUTURE' : 'CURRENT'">{{ quotaMode === 'CURRENT' ? '查看未来配额' : '返回当前配额' }}</button><button class="rp-button primary" type="button" :disabled="analyzing" @click="runAiAnalysis">{{ analyzing ? '分析中…' : 'AI 分析需求' }}</button></div></header>
      <div v-if="error" class="rp-error"><strong>{{ error.code || 'RESOURCE_PLAN_FAILED' }}</strong><span>{{ error.message || error }}</span></div><div v-if="!canManage" class="rp-empty">当前身份没有安排农场水资源的权限。</div>
      <template v-else>
        <section class="rp-summary" aria-label="用水配额概况"><article><span>{{ quotaMode === 'CURRENT' ? '当前可分配容量' : '未来 24 小时配额' }}</span><strong>{{ display(quotaMode === 'CURRENT' ? summary.capacity : futureQuota) }}</strong><small>{{ (quotaMode === 'CURRENT' ? summary.capacity : futureQuota) == null ? '等待容量事实' : '升' }}</small></article><article><span>今日实际用水</span><strong>{{ display(summary.actual) }}</strong><small>{{ summary.actual == null ? '等待实绩记录' : '升 · 事实记录' }}</small></article><article><span>本次计划预留</span><strong>{{ result ? summary.reserved : summary.requested }}</strong><small>升 · {{ result ? '试算分配' : '待试算申请' }}</small></article><article :class="{'is-warning': shortageTotal > 0}"><span>试算后余额</span><strong>{{ result ? display(summary.balance) : '—' }}</strong><small>{{ shortageTotal > 0 ? '存在 ' + shortageTotal + ' 升缺口' : (result && summary.balance != null ? '升' : '等待试算') }}</small></article></section>
        <section class="rp-intelligence-grid">
          <article class="rp-card rp-priority-card"><div class="rp-card-heading"><div><span>风险 / 需求队列</span><h3>优先安排地块</h3></div><small>按风险与建议水量排序</small></div><button v-for="(row, index) in rows" :key="row.plotId" type="button" class="rp-priority-row" :class="{active: selectedPlotId === row.plotId}" @click="selectedPlotId = row.plotId"><b>{{ index + 1 }}</b><div><strong>{{ row.name }}</strong><span>{{ row.cropName }} · 湿度 {{ row.soilMoisture }}%</span></div><em :class="'risk-' + String(row.riskLevel).toLowerCase()">{{ riskLabel(row.riskLevel) }}</em><small>{{ row.aiSuggestedLitres }} L</small></button><p v-if="!rows.length" class="rp-ledger-empty">当前农场没有可安排的地块。</p></article>
          <article class="rp-card rp-chart-card"><div class="rp-card-heading"><div><span>实测 + 只读试算</span><h3>{{ currentPlot?.name || '地块' }}趋势</h3></div><select v-model="selectedMetric"><option v-for="item in metrics" :key="item.value" :value="item.value">{{ item.label }}</option></select></div><div ref="chartEl" class="rp-chart" :class="{'is-loading': forecastLoading}" aria-label="资源安排风险趋势图"></div><p v-if="forecastLoading" class="rp-chart-status">正在读取后端确定性试算…</p><p v-else-if="forecastError" class="rp-chart-status is-error">{{ forecastError }}；不会用本地假曲线填充。</p><p v-else class="rp-chart-note">最新实测作为第一个锚点，AI 推演和置信区间均不写回策略。</p></article>
        </section>
        <section class="rp-card rp-plan-card"><div class="rp-card-heading"><div><span>多地块水资源计划</span><h3>申请、分配与执行窗口</h3></div><div class="rp-plan-state"><strong>{{ planStateLabel }}</strong><small>{{ isDemo ? '模拟试算' : '后端估算' }} · 不扣减库存</small></div></div><div class="rp-table-wrap"><table class="rp-table"><thead><tr><th>加入</th><th>地块 / 风险</th><th>申请</th><th>分配 / 缺口</th><th>设备</th><th>窗口</th><th>状态</th><th>调整</th></tr></thead><tbody><tr v-for="row in plannedRows" :key="row.plotId" :class="{'is-muted': !row.included}"><td><input type="checkbox" v-model="row.included" @change="rows.find(item => item.plotId === row.plotId).included = row.included; resetPlan()"></td><td><strong>{{ row.name }}</strong><small>{{ riskLabel(row.riskLevel) }} · {{ priorityLabel(row.priority) }}</small></td><td><strong>{{ row.requestedLitres }} L</strong><small>{{ row.provenance === 'USER_PROVIDED' ? '人工调整' : 'AI 建议 ' + row.aiSuggestedLitres + ' L' }}</small></td><td><strong>{{ result ? row.allocatedLitres + ' L' : '—' }}</strong><small :class="{'is-shortage': row.shortageLitres > 0}">{{ result ? (row.shortageLitres > 0 ? '缺 ' + row.shortageLitres + ' L' : '已满足') : '等待试算' }}</small></td><td><strong>{{ row.deviceId || '未绑定' }}</strong><small>{{ deviceStatusLabel(row.deviceStatus) }}</small></td><td><strong>{{ row.windowStart }}–{{ row.windowEnd }}</strong><small>{{ row.adjustmentReason || '建议窗口' }}</small></td><td><label class="rp-confirm"><input type="checkbox" :checked="row.confirmed" :disabled="!row.included" @change="rows.find(item => item.plotId === row.plotId).confirmed = $event.target.checked; resetPlan()">{{ row.confirmed ? '已核对' : '待核对' }}</label><span class="rp-allocation-state" :class="String(row.allocationStatus).toLowerCase()">{{ allocationLabel(row.allocationStatus) }}</span></td><td><button class="rp-button compact" type="button" @click="openAdjustment(row)">人工调整</button></td></tr></tbody></table></div><div class="rp-submit"><p v-if="!allConfirmed">请先核对所有已选地块的水量、优先级和时间窗口。</p><p v-else>已核对 {{ selectedRows.length }} 块地，共申请 {{ summary.requested }} 升。</p><button v-if="result" class="rp-button secondary" type="button" @click="openManualFallback">人工兜底</button><button class="rp-button primary" type="button" @click="evaluate" :disabled="!allConfirmed || loading">{{ loading ? '正在试算…' : result ? '重新试算' : '开始容量试算' }}</button></div><div v-if="result" class="rp-plan-actions"><span :class="result.status === 'FEASIBLE' ? 'success' : 'warning'">{{ result.status === 'FEASIBLE' ? '水量充足' : '水量不足，需要调整' }}</span><p>分配 {{ summary.reserved }} L · 缺口 {{ shortageTotal }} L · 结果只用于决策预览</p><button class="rp-button secondary" type="button" @click="cancelPlan">取消方案</button><button class="rp-button primary" type="button" @click="confirmPlan" :disabled="planState === 'CONFIRMED'">确认试算方案</button></div></section>
        <section class="rp-ledger-layout" aria-labelledby="resource-ledger-title"><form class="rp-card rp-ledger-form" @submit.prevent="createLedger"><div class="rp-card-heading"><div><span>用水实绩</span><h3 id="resource-ledger-title">录入计划与实际用水</h3></div><small>USER_PROVIDED</small></div><div class="rp-ledger-fields"><label><span>地块</span><select v-model="ledgerForm.plotId" required><option v-for="plot in plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label><label><span>计划用水（L）</span><input type="number" min="0" step="0.1" v-model="ledgerForm.plannedWaterLitres" placeholder="缺少时可留空"></label><label><span>实际用水（L）</span><input type="number" min="0" step="0.1" v-model="ledgerForm.actualWaterLitres" placeholder="缺少时可留空"></label><label><span>水价（元/L）</span><input type="number" min="0" step="0.001" v-model="ledgerForm.waterPricePerLitre" placeholder="留空使用农场配置"></label></div><p class="rp-ledger-note">这里只计算计划、实际、偏差、节水量和水费；没有产量或价格证据时不推导真实收益。</p><div class="rp-ledger-submit"><button class="rp-button primary" type="submit" :disabled="ledgerBusy || !ledgerForm.plotId">{{ ledgerBusy ? '正在保存…' : '保存用水对账' }}</button></div></form><section class="rp-card rp-ledger-records"><div class="rp-card-heading"><div><span>事实账本</span><h3>用水对账记录</h3></div><small>{{ ledgers.length }} 条</small></div><div v-if="ledgers.length" class="rp-ledger-list"><article v-for="ledger in ledgers" :key="ledger.valueLedgerId"><header><div><strong>{{ plots.find(plot => plot.plotId === ledger.plotId)?.name || ledger.plotId || '未知地块' }}</strong><small>{{ readableTime(ledger.createdAt) }}</small></div><span :class="String(ledger.status || '').toLowerCase()">{{ ledgerStatusLabel(ledger.status) }}</span></header><dl><div><dt>计划用水</dt><dd>{{ metric(ledger, 'plannedWaterLitres') }} 升</dd></div><div><dt>实际用水</dt><dd>{{ metric(ledger, 'actualWaterLitres') }} 升</dd></div><div><dt>节水量</dt><dd>{{ metric(ledger, 'waterSavingLitres') }} 升</dd></div><div><dt>水费</dt><dd>¥ {{ metric(ledger, 'waterCost') }}</dd></div></dl><footer>{{ sourceLabel(ledger.sourceMode) }} · 计划 {{ sourceLabel(ledger.plannedSource) }} / 实际 {{ sourceLabel(ledger.actualSource) }}</footer></article></div><p v-else class="rp-ledger-empty">还没有用水对账记录；系统不会用模拟收益填空。</p></section></section>
      </template>
      <div v-if="adjustmentOpen" class="g-modal-backdrop rp-modal-backdrop" @click.self="closeAdjustment"><form class="g-modal rp-adjust-modal" @submit.prevent="applyAdjustment"><header><div><span>人工兜底</span><h3>调整 {{ rows.find(row => row.plotId === adjustmentDraft.plotId)?.name || adjustmentDraft.plotId }}</h3></div><button class="rp-button compact" type="button" @click="closeAdjustment">关闭</button></header><div class="rp-adjust-fields"><label><span>申请水量（L）</span><input type="number" min="1" step="1" v-model.number="adjustmentDraft.requestedLitres"></label><label><span>优先级</span><select v-model="adjustmentDraft.priority"><option v-for="item in priorities" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label><span>开始时间</span><input type="time" v-model="adjustmentDraft.windowStart"></label><label><span>结束时间</span><input type="time" v-model="adjustmentDraft.windowEnd"></label><label class="is-wide"><span>调整原因（必填）</span><textarea rows="3" v-model.trim="adjustmentDraft.reason" placeholder="例如：高风险地块优先保障，其他地块顺延"></textarea></label></div><p v-if="adjustmentError" class="rp-adjust-error">{{ adjustmentError }}</p><footer><button class="rp-button secondary" type="button" @click="closeAdjustment">取消</button><button class="rp-button primary" type="submit">应用调整</button></footer></form></div>
    </section>
  `
};
