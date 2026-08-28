import { api } from '../api.js';
import { roleCan } from '../roles.js';
import { sourceLabel, statusLabel } from '../live-data.js?v=20260827-boot-fix-1';

const { ref, computed, watch, onMounted, inject } = Vue;

function readableTime(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) || date.getTime() <= 0 ? '未排程' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function litres(value) { return `${Number(value || 0).toFixed(1)} L`; }

export const AdminResourcePlanningView = {
  props: { state: { type: Object, required: true }, routeParams: { type: Object, default: () => ({}) } },
  emits: ['data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const loading = ref(false); const planBusy = ref(false); const quotaBusy = ref(false); const error = ref(null);
    const profile = ref(null); const plans = ref([]); const selectedPlotId = ref(''); const selectedPlanId = ref(''); const adjustmentReason = ref(''); const quotaForm = ref({ dailyQuotaLitres: '', effectiveFrom: '' });
    const farmId = computed(() => props.state?.adminContext?.farmId || props.routeParams?.farmId || props.state?.plots?.[0]?.farmId || 'farm-demo');
    const plots = computed(() => (props.state?.plots || []).filter(plot => (plot.farmId || farmId.value) === farmId.value));
    const canManage = computed(() => roleCan(props.state?.currentUser, 'resource:manage'));
    const currentPlan = computed(() => plans.value.find(plan => plan.resourcePlanId === selectedPlanId.value) || plans.value.find(plan => plan.status === 'DRAFT') || plans.value.find(plan => plan.status === 'CONFIRMED') || plans.value[0] || null);
    const allocations = computed(() => currentPlan.value?.allocations || []);
    const selectedAllocation = computed(() => allocations.value.find(item => item.plotId === selectedPlotId.value) || allocations.value[0] || null);
    const balance = computed(() => profile.value?.balance || profile.value || {});
    const quota = computed(() => Number(balance.value.dailyQuotaLitres ?? profile.value?.dailyQuotaLitres ?? 900));
    const reserved = computed(() => Number(balance.value.reservedLitres || 0));
    const used = computed(() => Number(balance.value.actualUsedLitres ?? balance.value.usedLitres ?? 0));
    const remaining = computed(() => Math.max(0, Number(balance.value.remainingLitres ?? quota.value - reserved.value - used.value)));
    const waterLevel = computed(() => quota.value > 0 ? `${Math.min(100, Math.max(0, remaining.value / quota.value * 100))}%` : '0%');
    const hasDraft = computed(() => Boolean(currentPlan.value && currentPlan.value.status === 'DRAFT'));
    const canConfirm = computed(() => hasDraft.value && !planBusy.value);
    const manualTaskCount = computed(() => (props.state?.workOrders || []).filter(item => item.actionType === 'MANUAL_IRRIGATION').length);
    const autoLedgerCount = computed(() => (props.state?.valueLedgers || []).filter(item => item.sourceType === 'RESOURCE_PLAN').length);
    const plotName = plotId => plots.value.find(plot => plot.plotId === plotId)?.name || plotId || '未知地块';
    const allocationStatus = status => ({ PENDING: '待执行', SCHEDULED: '已排程', RUNNING: '执行中', COMPLETED: '已完成', PARTIAL: '部分完成', FAILED: '失败', FALLBACK_REQUIRED: '人工兜底', NO_ACTION: '无需浇水' }[String(status || '').toUpperCase()] || statusLabel(status, '待处理'));
    const readinessLabel = status => ({ READY: '自动灌溉就绪', HUMAN_REVIEW: '需要人工复核', NEEDS_EVIDENCE: '待补证', UNAVAILABLE: '不可执行' }[String(status || '').toUpperCase()] || '待评估');

    const refresh = async () => {
      if (!canManage.value) return;
      loading.value = true; error.value = null;
      try {
        profile.value = await api.getWaterResourceProfile(farmId.value);
        plans.value = await api.listResourcePlans({ farmId: farmId.value, businessDate: profile.value.businessDate });
        if (currentPlan.value) selectedPlanId.value = currentPlan.value.resourcePlanId;
        if (!selectedPlotId.value) selectedPlotId.value = plots.value[0]?.plotId || allocations.value[0]?.plotId || '';
        quotaForm.value.dailyQuotaLitres = profile.value.dailyQuotaLitres || profile.value.balance?.dailyQuotaLitres || 900;
      } catch (caught) { error.value = caught; } finally { loading.value = false; }
    };
    const analyze = async () => {
      if (loading.value || !canManage.value) return; loading.value = true; error.value = null;
      try { const plan = await api.evaluateAutoResourcePlan({ farmId: farmId.value, businessDate: profile.value?.businessDate }); plans.value = [plan, ...plans.value.filter(item => item.resourcePlanId !== plan.resourcePlanId)]; selectedPlanId.value = plan.resourcePlanId; selectedPlotId.value = plan.allocations?.[0]?.plotId || selectedPlotId.value; toast('AI 已生成整批配水草案'); emit('data-invalidated', { domains: ['resourcePlans', 'resourceProfiles', 'overview'], record: plan }); }
      catch (caught) { error.value = caught; toast(caught.message || 'AI 配水分析失败', 'error'); } finally { loading.value = false; }
    };
    const adjust = async () => {
      if (!currentPlan.value || !adjustmentReason.value.trim() || planBusy.value) return;
      const allocation = selectedAllocation.value; if (!allocation) return; const raw = window.prompt(`请输入 ${plotName(allocation.plotId)} 的分配量（最多 ${allocation.requestedLitres} L）`, allocation.allocatedLitres); if (raw === null) return; const value = Number(raw); if (!Number.isFinite(value) || value < 0) return;
      planBusy.value = true; try { const next = await api.adjustResourcePlan(currentPlan.value.resourcePlanId, { expectedRevision: currentPlan.value.revision, reason: adjustmentReason.value.trim(), adjustments: [{ plotId: allocation.plotId, allocatedLitres: value, scheduledStart: allocation.scheduledStart }] }); plans.value = plans.value.map(item => item.resourcePlanId === next.resourcePlanId ? next : item); adjustmentReason.value = ''; toast('方案已调整并重新校验'); emit('data-invalidated', { domains: ['resourcePlans', 'resourceProfiles', 'overview'], record: next }); } catch (caught) { toast(caught.message || '调整失败', 'error'); } finally { planBusy.value = false; }
    };
    const confirm = async () => {
      if (!currentPlan.value || !canConfirm.value) return; planBusy.value = true; try { const next = await api.confirmResourcePlan(currentPlan.value.resourcePlanId, { expectedRevision: currentPlan.value.revision, idempotencyKey: `web-resource-${currentPlan.value.resourcePlanId}` }); plans.value = plans.value.map(item => item.resourcePlanId === next.resourcePlanId ? next : item); toast('整批配水已确认，系统将按时段执行'); emit('data-invalidated', { domains: ['resourcePlans', 'resourceProfiles', 'workOrders', 'ledgers', 'overview'], record: next }); } catch (caught) { toast(caught.message || '确认失败', 'error'); } finally { planBusy.value = false; }
    };
    const cancel = async () => { if (!currentPlan.value || planBusy.value || !['DRAFT', 'CONFIRMED'].includes(currentPlan.value.status)) return; planBusy.value = true; try { const next = await api.cancelResourcePlan(currentPlan.value.resourcePlanId); plans.value = plans.value.map(item => item.resourcePlanId === next.resourcePlanId ? next : item); toast('配水计划已取消'); emit('data-invalidated', { domains: ['resourcePlans', 'resourceProfiles', 'overview'], record: next }); } catch (caught) { toast(caught.message || '取消失败', 'error'); } finally { planBusy.value = false; } };
    const updateQuota = async () => { if (quotaBusy.value || !quotaForm.value.effectiveFrom) return; quotaBusy.value = true; try { profile.value = await api.updateWaterQuota({ farmId: farmId.value, dailyQuotaLitres: Number(quotaForm.value.dailyQuotaLitres), effectiveFrom: quotaForm.value.effectiveFrom }); toast('未来配额已保存，当前日余额不变'); emit('data-invalidated', { domains: ['resourceProfiles', 'overview'], record: profile.value }); } catch (caught) { toast(caught.message || '配额保存失败', 'error'); } finally { quotaBusy.value = false; } };
    watch(() => props.state?.plots, () => { if (!selectedPlotId.value) selectedPlotId.value = plots.value[0]?.plotId || ''; }, { deep: true });
    watch(farmId, refresh); onMounted(refresh);
    return { loading, planBusy, quotaBusy, error, profile, plans, plots, farmId, canManage, currentPlan, allocations, selectedPlotId, selectedPlanId, selectedAllocation, quota, reserved, used, remaining, waterLevel, hasDraft, canConfirm, manualTaskCount, autoLedgerCount, quotaForm, adjustmentReason, plotName, allocationStatus, readinessLabel, readableTime, litres, sourceLabel, refresh, analyze, adjust, confirm, cancel, updateQuota };
  },
  template: `
    <section class="resource-ops rp-root" :style="{'--water-level': waterLevel}" aria-labelledby="resource-title">
      <header class="resource-hero rp-hero"><div><span>农务任务 · 资源安排</span><h2 id="resource-title">AI 配水与自动灌溉</h2><p>固定日配额由后端统一核算，AI 先分析整批地块，管理员确认后按时段自动执行。</p></div><div class="resource-state"><small>今日可分配余额</small><strong>{{ litres(remaining) }}</strong><span>配额 {{ litres(quota) }} · 已预留 {{ litres(reserved) }}</span></div></header>
      <div v-if="error" class="rp-error"><strong>{{ error.code || 'RESOURCE_PLAN_FAILED' }}</strong><span>{{ error.message || error }}</span></div><div v-if="!canManage" class="rp-empty">当前身份没有管理农场水资源的权限。</div>
      <template v-else>
        <section class="resource-grid"><article class="resource-balance-panel"><div class="resource-balance-heading"><small>01 · 今日蓄水池</small><h3>固定日配额</h3></div><div class="resource-balance-reading"><strong>{{ litres(remaining) }}</strong><span>可分配余额 · 已使用 <b>{{ litres(used) }}</b></span></div><div class="resource-balance-level"><i :style="{width: waterLevel}"></i><span>次日自动重置</span></div><div class="resource-facts"><span>今日配额 {{ litres(quota) }}</span><span>预留 {{ litres(reserved) }}</span><span>实际使用 {{ litres(used) }}</span></div><form class="resource-quota-form" @submit.prevent="updateQuota"><label>次日/未来配额 <input type="number" min="0.1" step="0.1" v-model.number="quotaForm.dailyQuotaLitres"></label><label>生效日期 <input type="date" v-model="quotaForm.effectiveFrom" required></label><button class="rp-button secondary" :disabled="quotaBusy">{{ quotaBusy ? '保存中…' : '设置未来配额' }}</button></form></article><article class="reservoir-panel"><div class="resource-balance-heading"><small>安全门 · 统一事实源</small><h3>配水执行准备度</h3></div><div class="reservoir-visual"><div class="reservoir-water" :style="{height: waterLevel}"></div><span class="reservoir-label">{{ Math.round(Number(waterLevel.replace('%',''))) }}%</span></div><p>仅 READY 且绑定在线模拟灌溉控制器的地块会自动下发；真实设备继续等待 MQTT ACK。</p><div class="resource-actions"><button class="rp-button primary" @click="analyze" :disabled="loading">{{ loading ? 'AI 分析中…' : 'AI 重新分析全部地块' }}</button></div></article></section>
        <section class="rp-card resource-risk-panel"><div class="rp-card-heading"><div><span>02 · 地块风险卡</span><h3>先看湿度与 Crop Pack 阶段目标</h3></div><span>{{ allocations.length }} 个分析结果</span></div><div class="risk-card-grid"><button v-for="plot in plots" :key="plot.plotId" class="risk-card" :class="{'is-selected': selectedPlotId === plot.plotId}" @click="selectedPlotId = plot.plotId"><span>{{ plot.name || plot.plotId }}</span><strong>{{ plot.metrics?.SOIL_MOISTURE?.value ?? '—' }}%</strong><small>{{ plot.cropName || plot.cropCode || '未设置作物' }} · {{ plot.riskLevel || '待评估' }}</small><em>{{ allocations.find(item => item.plotId === plot.plotId)?.readinessStatus ? readinessLabel(allocations.find(item => item.plotId === plot.plotId).readinessStatus) : '尚未分析' }}</em></button></div></section>
        <section class="resource-grid analysis-grid"><article class="rp-card moisture-chart"><div class="rp-card-heading"><div><span>03 · 湿度趋势</span><h3>{{ plotName(selectedPlotId) }}</h3></div><small>目标带由 Crop Pack 提供</small></div><div class="trend-placeholder"><div class="trend-line"></div><span>实时遥测与目标带</span></div><div class="trend-facts"><span>当前湿度 <b>{{ selectedAllocation?.moisture ?? '—' }}%</b></span><span>阶段目标 <b>{{ selectedAllocation?.targetMoisture ?? '—' }}%</b></span></div></article><article class="rp-card recommendation-card"><div class="rp-card-heading"><div><span>AI 补水建议</span><h3>{{ plotName(selectedPlotId) }}</h3></div><strong>{{ litres(selectedAllocation?.requestedLitres) }}</strong></div><dl><div><dt>最终分配量</dt><dd>{{ litres(selectedAllocation?.allocatedLitres) }}</dd></div><div><dt>执行时段</dt><dd>{{ readableTime(selectedAllocation?.scheduledStart) }} — {{ readableTime(selectedAllocation?.scheduledEnd) }}</dd></div><div><dt>就绪度</dt><dd>{{ readinessLabel(selectedAllocation?.readinessStatus) }}</dd></div><div><dt>执行状态</dt><dd>{{ allocationStatus(selectedAllocation?.executionStatus) }}</dd></div></dl><p>{{ selectedAllocation?.explanation || '先点击 AI 重新分析，生成统一的后端配水事实。' }}</p><small v-if="selectedAllocation?.deviceId">设备 {{ selectedAllocation.deviceId }}</small></article></section>
        <section class="rp-card"><div class="rp-card-heading"><div><span>04 · 整体配水计划</span><h3>申请、分配、缺口与执行时间线</h3></div><div><span v-if="currentPlan">{{ currentPlan.status }} · 版本 {{ currentPlan.revision }}</span></div></div><div v-if="currentPlan" class="plan-toolbar"><strong>申请 {{ litres(currentPlan.totalRequestedLitres) }} · 分配 {{ litres(currentPlan.totalAllocatedLitres) }} · 缺口 {{ litres(currentPlan.totalUnmetLitres) }}</strong><input v-model="adjustmentReason" placeholder="调整方案必须填写原因"><button class="rp-button secondary" @click="adjust" :disabled="!adjustmentReason.trim() || !selectedAllocation">调整选中地块</button><button class="rp-button primary" @click="confirm" :disabled="!canConfirm">确认并自动灌溉</button><button class="rp-button danger" @click="cancel" :disabled="planBusy || !['DRAFT','CONFIRMED'].includes(currentPlan.status)">取消计划</button></div><p v-else class="rp-empty">尚未生成草案。</p><div class="allocation-table" v-if="currentPlan"><article v-for="item in allocations" :key="item.plotId" :class="{'is-selected': selectedPlotId === item.plotId}" @click="selectedPlotId = item.plotId"><div><strong>{{ plotName(item.plotId) }}</strong><small>{{ item.plotId }} · {{ readinessLabel(item.readinessStatus) }}</small></div><span>申请 {{ litres(item.requestedLitres) }}</span><b>分配 {{ litres(item.allocatedLitres) }}</b><span>缺口 {{ litres(item.unmetLitres) }}</span><em>{{ allocationStatus(item.executionStatus) }}</em></article></div></section>
        <section class="rp-card fallback-panel"><div class="rp-card-heading"><div><span>05 · 人工兜底与用水实绩</span><h3>系统任务、ACK、实际用水和价值账本</h3></div><small>人工外部水源不扣蓄水池余额</small></div><div class="fallback-summary"><span>人工兜底任务：{{ manualTaskCount }}</span><span>自动执行账本：{{ autoLedgerCount }}</span><span>实际扣减：{{ litres(used) }}</span></div><p>当配额不足、设备离线或自动命令 FAILED / TIMEOUT / PARTIAL 时，系统会创建 MANUAL_IRRIGATION 任务并自动选择有地块权限且在岗的农户。</p></section>
      </template>
    </section>
  `
};
