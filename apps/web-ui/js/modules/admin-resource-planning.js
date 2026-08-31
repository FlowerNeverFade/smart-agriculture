import { api } from '../api.js?v=20260831-vision-v2-original';
import { roleCan } from '../roles.js?v=20260831-three-branch-v1';

// Compatibility helpers retained from the previous resource-planning view.
function numberOr(value, fallback = 0) { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback; }
function recommendedWater(plot) {
  const moisture = numberOr(plot?.metrics?.SOIL_MOISTURE?.value, 25);
  const area = numberOr(plot?.areaM2, 80);
  const target = numberOr(String(plot?.metrics?.SOIL_MOISTURE?.target || '30').match(/(\d+(?:\.\d+)?)/)?.[1], 30);
  return Math.max(20, Math.round(Math.max(0, target - moisture) * area * .08));
}
function deviceForPlot(plotId, devices = []) {
  const matches = devices.filter((device) => String(device?.plotId || '') === String(plotId || ''));
  return matches.find((device) => String(device?.status || '').toUpperCase() === 'ONLINE') || matches[0] || null;
}
export function buildResourceRows(plots = [], devices = [], previousRows = []) {
  const previous = new Map((previousRows || []).map((row) => [row.plotId, row]));
  return (plots || []).map((plot, index) => {
    const old = previous.get(plot.plotId); const moisture = numberOr(plot?.metrics?.SOIL_MOISTURE?.value, 30);
    const riskLevel = String(plot?.riskLevel || '').toUpperCase() || (moisture < 18 ? 'HIGH' : moisture < 24 ? 'MEDIUM' : 'LOW');
    const demand = recommendedWater(plot); const device = deviceForPlot(plot.plotId, devices);
    return { plotId: plot.plotId, name: plot.name || plot.plotId, cropName: plot.cropName || plot.cropCode || '未设置作物', included: old?.included ?? true, confirmed: old?.confirmed ?? false, requestedLitres: old?.requestedLitres ?? demand, aiSuggestedLitres: demand, priority: old?.priority || (riskLevel === 'HIGH' ? 'HIGH' : riskLevel === 'MEDIUM' ? 'MEDIUM' : 'LOW'), riskLevel, riskScore: ({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[riskLevel] || 0), soilMoisture: moisture, deviceId: device?.deviceId || device?.id || '', deviceStatus: String(device?.status || 'UNBOUND').toUpperCase(), windowStart: old?.windowStart || String(6 + (index % 3) * 2).padStart(2, '0') + ':00', windowEnd: old?.windowEnd || String(8 + (index % 3) * 2).padStart(2, '0') + ':00', adjustmentReason: old?.adjustmentReason || '', provenance: old?.provenance || 'ESTIMATED' };
  }).sort((a, b) => b.riskScore - a.riskScore || b.aiSuggestedLitres - a.aiSuggestedLitres || a.name.localeCompare(b.name, 'zh-CN'));
}
export function resourceQuotaSummary(profile = {}, result = null, selectedRows = [], ledgers = []) {
  const capacity = Number(profile.capacityLitres ?? profile.dailyQuotaLitres); const actual = Number(profile.usedTodayLitres ?? profile.actualUsedLitres);
  const reserved = (result?.allocations || []).reduce((sum, row) => sum + numberOr(row.allocatedLitres), 0);
  const requested = (selectedRows || []).reduce((sum, row) => sum + numberOr(row.requestedLitres), 0);
  const ledgerActual = (ledgers || []).reduce((sum, ledger) => sum + numberOr(ledger?.metrics?.actualWaterLitres), 0);
  return { capacity: Number.isFinite(capacity) ? capacity : null, actual: Number.isFinite(actual) ? actual : (ledgers.length ? ledgerActual : null), reserved, requested, balance: Number.isFinite(capacity) ? Math.max(0, capacity - reserved) : null };
}
export function mergeAllocationRows(rows = [], result = null) {
  return rows.map((row) => { const allocation = (result?.allocations || []).find((item) => item.plotId === row.plotId) || {}; const unmet = (result?.unmetDemands || []).find((item) => item.plotId === row.plotId) || {}; const allocatedLitres = numberOr(allocation.allocatedLitres); const shortageLitres = numberOr(unmet.unmetLitres, Math.max(0, numberOr(row.requestedLitres) - allocatedLitres)); return { ...row, allocatedLitres, shortageLitres, allocationStatus: !result ? 'WAITING' : shortageLitres > 0 ? 'SHORTAGE' : 'ALLOCATED' }; });
}
export function validateResourceAdjustment(draft = {}) {
  if (!(numberOr(draft.requestedLitres) > 0)) return '申请水量必须大于 0 升';
  if (!String(draft.windowStart || '').trim() || !String(draft.windowEnd || '').trim()) return '请填写完整执行窗口';
  if (!String(draft.reason || '').trim()) return '人工调整必须填写原因';
  return '';
}

const { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, inject } = Vue;

function readableTime(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) || date.getTime() <= 0
    ? '未排程'
    : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function litres(value) { return `${Number(value || 0).toFixed(1)} L`; }

const METRICS = Object.freeze([
  { code: 'SOIL_MOISTURE', label: '土壤湿度', unit: '%' },
  { code: 'AIR_TEMPERATURE', label: '空气温度', unit: '°C' },
  { code: 'AIR_HUMIDITY', label: '空气湿度', unit: '%RH' }
]);

export const AdminResourcePlanningView = {
  props: { state: { type: Object, required: true }, routeParams: { type: Object, default: () => ({}) } },
  emits: ['data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const loading = ref(false); const planBusy = ref(false); const quotaBusy = ref(false); const error = ref(null);
    const profile = ref(null); const plans = ref([]); const selectedPlotId = ref(''); const selectedPlanId = ref('');
    const adjustmentReason = ref(''); const adjustmentDraft = ref({ plotId: '', allocatedLitres: '' }); const adjustmentOpen = ref(false);
    const quotaForm = ref({ dailyQuotaLitres: '', effectiveFrom: '' });
    const selectedMetric = ref('SOIL_MOISTURE'); const forecast = ref(null); const telemetry = ref([]); const forecastBusy = ref(false); const forecastError = ref('');
    const forecastChartEl = ref(null); const forecastChart = ref(null); let forecastRequestSerial = 0;

    const farmId = computed(() => props.state?.adminContext?.farmId || props.routeParams?.farmId || props.state?.plots?.[0]?.farmId || 'farm-demo');
    const plots = computed(() => (props.state?.plots || []).filter(plot => (plot.farmId || farmId.value) === farmId.value));
    const canManage = computed(() => roleCan(props.state?.currentUser, 'resource:manage'));
    const currentPlan = computed(() => plans.value.find(plan => plan.resourcePlanId === selectedPlanId.value) || plans.value.find(plan => plan.status === 'DRAFT') || plans.value.find(plan => plan.status === 'CONFIRMED') || plans.value[0] || null);
    const allocations = computed(() => currentPlan.value?.allocations || []);
    const allocationFor = plotId => allocations.value.find(item => item.plotId === plotId) || null;
    const selectedAllocation = computed(() => allocationFor(selectedPlotId.value) || allocations.value[0] || null);
    const selectedPlot = computed(() => plots.value.find(plot => plot.plotId === selectedPlotId.value) || plots.value[0] || null);
    const selectedMetricMeta = computed(() => METRICS.find(item => item.code === selectedMetric.value) || METRICS[0]);
    const balance = computed(() => profile.value?.balance || profile.value || {});
    const quota = computed(() => Number(balance.value.dailyQuotaLitres ?? profile.value?.dailyQuotaLitres ?? 900));
    const reserved = computed(() => Number(balance.value.reservedLitres || 0));
    const used = computed(() => Number(balance.value.actualUsedLitres ?? balance.value.usedLitres ?? 0));
    const remaining = computed(() => Math.max(0, Number(balance.value.remainingLitres ?? quota.value - reserved.value - used.value)));
    const balancePercent = computed(() => quota.value > 0 ? Math.min(100, Math.max(0, remaining.value / quota.value * 100)) : 0);
    const hasDraft = computed(() => Boolean(currentPlan.value && currentPlan.value.status === 'DRAFT'));
    const canConfirm = computed(() => hasDraft.value && !planBusy.value);
    const manualTaskCount = computed(() => (props.state?.workOrders || []).filter(item => String(item.actionType || '').toUpperCase() === 'MANUAL_IRRIGATION').length);
    const autoLedgerCount = computed(() => (props.state?.valueLedgers || []).filter(item => item.sourceType === 'RESOURCE_PLAN').length);
    const plotName = plotId => plots.value.find(plot => plot.plotId === plotId)?.name || plotId || '未知地块';
    const allocationStatus = status => ({ PENDING: '待执行', SCHEDULED: '已排程', RUNNING: '执行中', COMPLETED: '已完成', PARTIAL: '部分完成', FAILED: '失败', FALLBACK_REQUIRED: '人工兜底', NO_ACTION: '无需浇水' }[String(status || '').toUpperCase()] || '待处理');
    const readinessLabel = status => ({ READY: '自动灌溉就绪', HUMAN_REVIEW: '需要人工复核', NEEDS_EVIDENCE: '待补证', UNAVAILABLE: '不可执行' }[String(status || '').toUpperCase()] || '待评估');
    const planStatusLabel = status => ({ DRAFT: '草案', CONFIRMED: '已确认', RUNNING: '执行中', COMPLETED: '已完成', PARTIAL: '部分完成', FAILED: '失败', CANCELLED: '已取消', EXPIRED: '已过期' }[String(status || '').toUpperCase()] || status || '未生成');
    const sortedPlots = computed(() => plots.value.slice().sort((a, b) => Number(allocationFor(b.plotId)?.needScore || 0) - Number(allocationFor(a.plotId)?.needScore || 0)));
    const selectedTarget = computed(() => selectedPlot.value?.metrics?.[selectedMetric.value]?.target || selectedAllocation.value?.targetMoisture || '—');
    const forecastReady = computed(() => String(forecast.value?.status || '').toUpperCase() === 'AVAILABLE' && Array.isArray(forecast.value?.curve) && forecast.value.curve.length > 0);
    const forecastProvenance = computed(() => forecast.value?.dataOrigin === 'SIMULATED' || forecast.value?.provenance === 'SIMULATED' ? '演示模型' : '后端模型');
    const forecastExplanation = computed(() => {
      const explanation = forecast.value?.explanation;
      if (typeof explanation === 'string' && explanation.trim()) return explanation;
      if (explanation && typeof explanation === 'object') {
        return explanation.summary || explanation.message || explanation.text || '后端模型已返回趋势、目标和置信区间。';
      }
      return '曲线以最新实测值为起点，等待后端模型返回阶段目标、趋势和置信区间。';
    });

    const renderForecast = async () => {
      await nextTick();
      if (!forecastChartEl.value || typeof echarts === 'undefined') return;
      if (!forecastChart.value) forecastChart.value = echarts.init(forecastChartEl.value);
      const metric = selectedMetricMeta.value;
      const history = telemetry.value.map(item => [new Date(item.ts || item.timestamp || item.createdAt || 0).getTime(), Number(item.value)]).filter(item => Number.isFinite(item[0]) && item[0] > 0 && Number.isFinite(item[1]));
      const curve = forecastReady.value ? forecast.value.curve : [];
      const startAt = new Date(forecast.value?.startTimestamp || 0).getTime() || Date.now();
      const predicted = curve.map(point => [startAt + Number(point.minute || 0) * 60000, Number(point.expected)]).filter(point => Number.isFinite(point[1]));
      const lower = curve.map(point => [startAt + Number(point.minute || 0) * 60000, Number(point.lower)]).filter(point => Number.isFinite(point[1]));
      const upper = curve.map(point => [startAt + Number(point.minute || 0) * 60000, Number(point.upper)]).filter(point => Number.isFinite(point[1]));
      const values = [...history, ...predicted, ...lower, ...upper].map(item => item[1]);
      const minValue = values.length ? Math.min(...values) : 0; const maxValue = values.length ? Math.max(...values) : 100; const padding = Math.max((maxValue - minValue) * .18, metric.code === 'AIR_TEMPERATURE' ? 2 : 3);
      const dark = document.documentElement.getAttribute('data-theme') === 'dark'; const text = dark ? '#dbe7df' : '#52605a';
      forecastChart.value.setOption({ animation: false, backgroundColor: 'transparent', tooltip: { trigger: 'axis', confine: true, valueFormatter: value => `${Number(value).toFixed(1)} ${metric.unit}` }, legend: { top: 0, right: 0, textStyle: { color: text, fontSize: 10 }, data: ['实测', 'AI推演', '置信区间'] }, grid: { left: 46, right: 18, top: 34, bottom: 28 }, xAxis: { type: 'time', axisLabel: { color: text, fontSize: 10 }, axisLine: { lineStyle: { color: dark ? '#415148' : '#d6e1d9' } } }, yAxis: { type: 'value', min: minValue - padding, max: maxValue + padding, name: metric.unit, nameTextStyle: { color: text }, axisLabel: { color: text, fontSize: 10 }, splitLine: { lineStyle: { color: dark ? '#26352b' : '#edf2ee' } } }, series: [{ name: '实测', type: 'line', data: history, showSymbol: false, smooth: true, lineStyle: { color: '#16834b', width: 2 } }, { name: 'AI推演', type: 'line', data: predicted, showSymbol: false, smooth: true, lineStyle: { color: '#2563eb', width: 2, type: 'dashed', opacity: forecastBusy.value ? .45 : 1 } }, { name: '置信区间', type: 'line', data: lower, showSymbol: false, lineStyle: { color: '#93c5fd', width: 1, type: 'dotted' }, areaStyle: { color: 'rgba(147,197,253,.12)' } }, { name: '置信区间上界', type: 'line', data: upper, showSymbol: false, lineStyle: { color: '#93c5fd', width: 1, type: 'dotted' } }] }, true);
    };

    const loadSelectedForecast = async () => {
      const plotId = selectedPlot.value?.plotId;
      if (!plotId) { forecast.value = null; telemetry.value = []; await renderForecast(); return; }
      const requestId = ++forecastRequestSerial; forecastBusy.value = true; forecastError.value = '';
      const [historyResult, forecastResult] = await Promise.allSettled([api.getTelemetry(plotId, selectedMetric.value, 120), api.getRiskForecast(plotId, selectedMetric.value)]);
      if (requestId !== forecastRequestSerial) return;
      telemetry.value = historyResult.status === 'fulfilled' ? (historyResult.value || []) : [];
      if (forecastResult.status === 'fulfilled') {
        forecast.value = forecastResult.value || { status: 'UNAVAILABLE', reason: '预测响应为空' };
        const explanation = forecast.value?.explanation;
        if (explanation && typeof explanation === 'object') {
          forecast.value = { ...forecast.value, explanation: explanation.summary || explanation.message || explanation.text || '后端模型已返回趋势、目标和置信区间。' };
        }
      }
      else { forecast.value = { status: 'UNAVAILABLE', reason: forecastResult.reason?.message || '预测服务暂不可用' }; forecastError.value = forecast.value.reason; }
      forecastBusy.value = false; await renderForecast();
    };

    const refresh = async () => {
      if (!canManage.value) return;
      loading.value = true; error.value = null;
      try { profile.value = await api.getWaterResourceProfile(farmId.value); plans.value = await api.listResourcePlans({ farmId: farmId.value, businessDate: profile.value.businessDate }); if (currentPlan.value) selectedPlanId.value = currentPlan.value.resourcePlanId; if (!selectedPlotId.value) selectedPlotId.value = plots.value[0]?.plotId || allocations.value[0]?.plotId || ''; quotaForm.value.dailyQuotaLitres = profile.value.dailyQuotaLitres || profile.value.balance?.dailyQuotaLitres || 900; await loadSelectedForecast(); }
      catch (caught) { error.value = caught; } finally { loading.value = false; }
    };
    const analyze = async () => {
      if (loading.value || !canManage.value) return; loading.value = true; error.value = null;
      try { const plan = await api.evaluateAutoResourcePlan({ farmId: farmId.value, businessDate: profile.value?.businessDate }); plans.value = [plan, ...plans.value.filter(item => item.resourcePlanId !== plan.resourcePlanId)]; selectedPlanId.value = plan.resourcePlanId; selectedPlotId.value = plan.allocations?.[0]?.plotId || selectedPlotId.value; toast?.('AI 已生成整批配水草案'); emit('data-invalidated', { domains: ['resourcePlans', 'resourceProfiles', 'overview'], record: plan }); }
      catch (caught) { error.value = caught; toast?.(caught.message || 'AI 配水分析失败', 'error'); } finally { loading.value = false; }
    };
    const openAdjustment = () => { if (!selectedAllocation.value || !currentPlan.value) return; adjustmentDraft.value = { plotId: selectedAllocation.value.plotId, allocatedLitres: Number(selectedAllocation.value.allocatedLitres || 0).toFixed(1) }; adjustmentOpen.value = true; };
    const adjust = async () => {
      if (!currentPlan.value || !adjustmentReason.value.trim() || planBusy.value) return;
      const value = Number(adjustmentDraft.value.allocatedLitres); if (!Number.isFinite(value) || value < 0) { toast?.('请输入有效的分配量', 'error'); return; }
      const allocation = allocationFor(adjustmentDraft.value.plotId); if (!allocation) return; planBusy.value = true;
      try { const next = await api.adjustResourcePlan(currentPlan.value.resourcePlanId, { expectedRevision: currentPlan.value.revision, reason: adjustmentReason.value.trim(), adjustments: [{ plotId: allocation.plotId, allocatedLitres: value, scheduledStart: allocation.scheduledStart }] }); plans.value = plans.value.map(item => item.resourcePlanId === next.resourcePlanId ? next : item); adjustmentReason.value = ''; adjustmentOpen.value = false; toast?.('方案已调整并重新校验'); emit('data-invalidated', { domains: ['resourcePlans', 'resourceProfiles', 'overview'], record: next }); }
      catch (caught) { toast?.(caught.message || '调整失败', 'error'); } finally { planBusy.value = false; }
    };
    const confirm = async () => { if (!currentPlan.value || !canConfirm.value) return; planBusy.value = true; try { const next = await api.confirmResourcePlan(currentPlan.value.resourcePlanId, { expectedRevision: currentPlan.value.revision, idempotencyKey: `web-resource-${currentPlan.value.resourcePlanId}` }); plans.value = plans.value.map(item => item.resourcePlanId === next.resourcePlanId ? next : item); toast?.('整批配水已确认，系统将按时段执行'); emit('data-invalidated', { domains: ['resourcePlans', 'resourceProfiles', 'workOrders', 'ledgers', 'overview'], record: next }); } catch (caught) { toast?.(caught.message || '确认失败', 'error'); } finally { planBusy.value = false; } };
    const cancel = async () => { if (!currentPlan.value || planBusy.value || !['DRAFT', 'CONFIRMED'].includes(currentPlan.value.status)) return; planBusy.value = true; try { const next = await api.cancelResourcePlan(currentPlan.value.resourcePlanId); plans.value = plans.value.map(item => item.resourcePlanId === next.resourcePlanId ? next : item); toast?.('配水计划已取消'); emit('data-invalidated', { domains: ['resourcePlans', 'resourceProfiles', 'overview'], record: next }); } catch (caught) { toast?.(caught.message || '取消失败', 'error'); } finally { planBusy.value = false; } };
    const updateQuota = async () => { if (quotaBusy.value || !quotaForm.value.effectiveFrom) return; quotaBusy.value = true; try { profile.value = await api.updateWaterQuota({ farmId: farmId.value, dailyQuotaLitres: Number(quotaForm.value.dailyQuotaLitres), effectiveFrom: quotaForm.value.effectiveFrom }); toast?.('未来配额已保存，当前日余额不变'); emit('data-invalidated', { domains: ['resourceProfiles', 'overview'], record: profile.value }); } catch (caught) { toast?.(caught.message || '配额保存失败', 'error'); } finally { quotaBusy.value = false; } };

    watch(() => props.state?.plots, () => { if (!selectedPlotId.value) selectedPlotId.value = plots.value[0]?.plotId || ''; }, { deep: true });
    watch([selectedPlotId, selectedMetric], loadSelectedForecast); watch(farmId, refresh); onMounted(refresh);
    onBeforeUnmount(() => { forecastRequestSerial += 1; forecastChart.value?.dispose(); forecastChart.value = null; });
    return { loading, planBusy, quotaBusy, error, profile, plans, plots, sortedPlots, farmId, canManage, currentPlan, allocations, selectedPlotId, selectedPlanId, selectedAllocation, selectedPlot, selectedMetric, selectedMetricMeta, selectedTarget, forecast, forecastBusy, forecastError, forecastChartEl, forecastReady, forecastProvenance, forecastExplanation, quota, reserved, used, remaining, balancePercent, hasDraft, canConfirm, manualTaskCount, autoLedgerCount, quotaForm, adjustmentReason, adjustmentDraft, adjustmentOpen, plotName, allocationFor, allocationStatus, readinessLabel, planStatusLabel, readableTime, litres, METRICS, refresh, analyze, openAdjustment, adjust, confirm, cancel, updateQuota };
  },
  template: `
    <section class="resource-ops rp-root" aria-labelledby="resource-title">
      <header class="resource-header"><div><span class="resource-eyebrow">农务任务 / 资源安排</span><h2 id="resource-title">AI 配水运营台</h2><p>固定日配额由后端统一核算。AI 先分析地块，管理员确认后按时段执行。</p></div><div class="resource-header-actions"><span class="resource-date">{{ profile?.businessDate || '今日计划' }}</span><button class="rp-button primary" type="button" @click="analyze" :disabled="loading">{{ loading ? '分析中…' : 'AI 重新分析' }}</button></div></header>
      <div v-if="error" class="rp-error"><strong>{{ error.code || 'RESOURCE_PLAN_FAILED' }}</strong><span>{{ error.message || error }}</span></div><div v-if="!canManage" class="rp-empty">当前身份没有管理农场水资源的权限。</div>
      <template v-else>
        <section class="resource-kpis" aria-label="今日蓄水池指标"><article><span>今日固定配额</span><strong>{{ litres(quota) }}</strong><small>次日自动重置</small></article><article><span>实际已使用</span><strong>{{ litres(used) }}</strong><small>仅统计蓄水池水源</small></article><article><span>已预留</span><strong>{{ litres(reserved) }}</strong><small>确认计划锁定</small></article><article :class="{'is-warning': remaining <= quota * .2}"><span>可分配余额</span><strong>{{ litres(remaining) }}</strong><small>{{ balancePercent.toFixed(0) }}% 可用</small></article></section>
        <section class="resource-panel quota-panel"><div class="panel-heading"><div><span class="resource-eyebrow">水资源安全门</span><h3>今日余额与未来配额</h3></div><span class="plan-status">{{ currentPlan ? planStatusLabel(currentPlan.status) : '尚未生成计划' }}</span></div><div class="quota-progress"><div><b :style="{width: balancePercent + '%'}"></b></div><span>{{ litres(remaining) }} / {{ litres(quota) }}</span></div><form class="quota-form" @submit.prevent="updateQuota"><label>次日或未来配额<input v-model.number="quotaForm.dailyQuotaLitres" type="number" min="0.1" step="0.1"></label><label>生效日期<input v-model="quotaForm.effectiveFrom" type="date" required></label><button class="rp-button secondary" :disabled="quotaBusy">{{ quotaBusy ? '保存中…' : '保存未来配额' }}</button></form></section>
        <section class="resource-workspace"><aside class="resource-panel plot-queue"><div class="panel-heading"><div><span class="resource-eyebrow">优先队列</span><h3>地块风险与需求</h3></div><small>{{ plots.length }} 块活跃地块</small></div><div class="plot-list"><button v-for="plot in sortedPlots" :key="plot.plotId" type="button" class="plot-row" :class="{'is-selected': selectedPlotId === plot.plotId}" @click="selectedPlotId = plot.plotId"><span class="plot-health-dot" :class="String(plot.riskLevel || '').toLowerCase()"></span><span class="plot-row-main"><strong>{{ plot.name || plot.plotId }}</strong><small>{{ plot.cropName || plot.cropCode || '未设置作物' }} · {{ plot.metrics?.SOIL_MOISTURE?.value ?? '—' }}% 湿度</small></span><span class="plot-row-score"><b>{{ allocationFor(plot.plotId)?.needScore != null ? Number(allocationFor(plot.plotId).needScore).toFixed(0) : '—' }}</b><small>需求分</small></span></button></div></aside><article class="resource-panel forecast-panel"><div class="panel-heading"><div><span class="resource-eyebrow">后端AI推演</span><h3>{{ selectedPlot?.name || '选择地块' }} · 趋势与目标</h3></div><label class="metric-picker"><span>指标</span><select v-model="selectedMetric"><option v-for="metric in METRICS" :key="metric.code" :value="metric.code">{{ metric.label }}（{{ metric.unit }}）</option></select></label></div><div class="forecast-meta"><span class="source-badge" :class="forecastReady ? 'is-ready' : 'is-muted'">{{ forecastBusy ? '正在推演…' : forecastReady ? forecastProvenance : '暂无可用曲线' }}</span><span>目标 {{ selectedTarget }}</span><span v-if="forecast?.riskBoundary">阈值 {{ forecast.riskBoundary.operator === 'LT' ? '低于' : '高于' }} {{ forecast.riskBoundary.value }} {{ forecast.riskBoundary.unit }}</span></div><div ref="forecastChartEl" class="resource-forecast-chart" role="img" :aria-label="(selectedPlot?.name || '地块') + selectedMetricMeta.label + '实测与AI推演曲线'"></div><p v-if="forecastError" class="forecast-error">{{ forecastError }}</p><p class="forecast-explanation">{{ forecast?.explanation || '曲线以最新实测值为起点，等待后端模型返回阶段目标、趋势和置信区间。' }}</p></article></section>
        <section class="resource-panel plan-panel"><div class="panel-heading"><div><span class="resource-eyebrow">整批配水计划</span><h3>申请、分配、缺口与执行状态</h3></div><span v-if="currentPlan" class="plan-revision">{{ planStatusLabel(currentPlan.status) }} · v{{ currentPlan.revision }}</span></div><div v-if="currentPlan" class="plan-summary"><strong>申请 {{ litres(currentPlan.totalRequestedLitres) }}</strong><strong>分配 {{ litres(currentPlan.totalAllocatedLitres) }}</strong><strong :class="{'is-warning': Number(currentPlan.totalUnmetLitres) > 0}">缺口 {{ litres(currentPlan.totalUnmetLitres) }}</strong><div class="plan-actions"><button class="rp-button secondary" type="button" @click="openAdjustment" :disabled="!selectedAllocation || planBusy">调整方案</button><button class="rp-button primary" type="button" @click="confirm" :disabled="!canConfirm">确认并自动灌溉</button><button class="rp-button danger" type="button" @click="cancel" :disabled="planBusy || !['DRAFT','CONFIRMED'].includes(currentPlan.status)">取消计划</button></div></div><p v-else class="rp-empty inline-empty">还没有配水草案，请先运行AI分析。</p><div v-if="currentPlan" class="allocation-table-wrap"><table class="allocation-table"><thead><tr><th>地块</th><th>申请</th><th>分配</th><th>缺口</th><th>设备 / 时段</th><th>状态</th></tr></thead><tbody><tr v-for="item in allocations" :key="item.plotId" :class="{'is-selected': selectedPlotId === item.plotId}" @click="selectedPlotId = item.plotId"><td><strong>{{ plotName(item.plotId) }}</strong><small>{{ readinessLabel(item.readinessStatus) }} · 需求 {{ Number(item.needScore || 0).toFixed(0) }}</small></td><td>{{ litres(item.requestedLitres) }}</td><td class="allocation-value">{{ litres(item.allocatedLitres) }}</td><td :class="{'is-warning': Number(item.unmetLitres) > 0}">{{ litres(item.unmetLitres) }}</td><td><small>{{ item.deviceId || '未绑定控制器' }}</small><small>{{ readableTime(item.scheduledStart) }} — {{ readableTime(item.scheduledEnd) }}</small></td><td><span class="status-chip" :class="String(item.executionStatus || '').toLowerCase()">{{ allocationStatus(item.executionStatus) }}</span></td></tr></tbody></table></div></section>
        <section class="resource-panel fallback-panel"><div class="panel-heading"><div><span class="resource-eyebrow">人工兜底与用水实绩</span><h3>自动执行证据与农户任务</h3></div><small>外部水源不扣蓄水池余额</small></div><div class="fallback-grid"><div><span>人工兜底任务</span><strong>{{ manualTaskCount }}</strong></div><div><span>自动执行账本</span><strong>{{ autoLedgerCount }}</strong></div><div><span>蓄水池实际扣减</span><strong>{{ litres(used) }}</strong></div></div><p>当配额不足、设备离线或自动命令失败时，系统会创建 MANUAL_IRRIGATION 任务；命令 ACK 和实际水量会回写到同一计划。</p></section>
        <div v-if="adjustmentOpen" class="adjustment-overlay" @click.self="adjustmentOpen = false"><form class="adjustment-dialog" @submit.prevent="adjust"><div class="panel-heading"><div><span class="resource-eyebrow">人工调整</span><h3>重新校验选中地块</h3></div><button type="button" class="dialog-close" @click="adjustmentOpen = false">×</button></div><label>地块<select v-model="adjustmentDraft.plotId"><option v-for="item in allocations" :key="item.plotId" :value="item.plotId">{{ plotName(item.plotId) }}</option></select></label><label>分配量（L）<input v-model.number="adjustmentDraft.allocatedLitres" type="number" min="0" step="0.1" required></label><label>调整原因<textarea v-model.trim="adjustmentReason" rows="3" placeholder="说明为什么需要调整，提交后会重新校验总量和执行条件" required></textarea></label><div class="dialog-actions"><button class="rp-button secondary" type="button" @click="adjustmentOpen = false">取消</button><button class="rp-button primary" type="submit" :disabled="planBusy || !adjustmentReason.trim()">提交并重新校验</button></div></form></div>
      </template>
    </section>
  `
};
