import { api } from '../api.js';
import { adminMetricLabel, normalizeAdminTab } from '../admin-state.js';
import { WorkOrderLifecycleView } from '../work-order-lifecycle.js';

const { ref, computed, watch, inject } = Vue;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export const AdminWorkManagementView = {
  components: { 'work-order-lifecycle': WorkOrderLifecycleView },
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const activeTab = ref(normalizeAdminTab('work-orders', props.routeParams?.tab));
    const busy = ref(false);
    const selectedBatchId = ref('');
    const preview = ref(null);
    const selectedPackCode = ref('');
    const form = ref({ plotId: '', cropCode: '', plantedAt: todayInput(), plannedCycleDays: 120 });
    const farmId = computed(() => props.state.adminContext?.farmId || '');
    const activePlots = computed(() => (props.state.allPlots || props.state.plots || []).filter(plot => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE'));
    const batches = computed(() => props.state.cropBatches || []);
    const packs = computed(() => props.state.cropPacks || []);
    const selectedPack = computed(() => packs.value.find(pack => pack.cropCode === selectedPackCode.value) || packs.value[0] || null);
    const selectedBatch = computed(() => batches.value.find(batch => batch.batchId === selectedBatchId.value) || null);

    const syncCropForPlot = () => {
      const plotCrop = activePlots.value.find(plot => plot.plotId === form.value.plotId)?.cropCode || '';
      form.value.cropCode = packs.value.some(pack => pack.cropCode === plotCrop)
        ? plotCrop
        : (packs.value[0]?.cropCode || '');
    };

    const syncDefaults = () => {
      if (!form.value.plotId) form.value.plotId = activePlots.value[0]?.plotId || '';
      if (!packs.value.some(pack => pack.cropCode === form.value.cropCode)) syncCropForPlot();
      if (!selectedPackCode.value) selectedPackCode.value = packs.value[0]?.cropCode || '';
      if (!selectedBatchId.value) selectedBatchId.value = batches.value[0]?.batchId || '';
    };
    watch(() => props.routeParams?.tab, tab => { activeTab.value = normalizeAdminTab('work-orders', tab); });
    watch([activePlots, packs, batches], syncDefaults, { immediate: true });

    const setTab = (tab) => emit('navigate', 'work-orders', { tab, farmId: farmId.value });
    const createPlan = async () => {
      if (!farmId.value || !form.value.plotId || !form.value.cropCode || !Number(form.value.plannedCycleDays)) {
        toast('请完整填写地块、作物和计划周期', 'error');
        return;
      }
      busy.value = true;
      try {
        const batch = await api.createCropBatch({ ...form.value, farmId: farmId.value });
        selectedBatchId.value = batch.batchId;
        preview.value = await api.generateCropBatchPlan(batch.batchId, { plannedCycleDays: Number(form.value.plannedCycleDays), startDate: form.value.plantedAt });
        emit('data-invalidated', { domains: ['batches'], record: batch });
        toast('生产计划预览已生成；日期可以调整，尚未派发任务');
      } catch (error) {
        toast(error.message || '生产计划生成失败', 'error');
      } finally { busy.value = false; }
    };
    const loadPlan = async (batch) => {
      selectedBatchId.value = batch.batchId;
      busy.value = true;
      try {
        const result = await api.getCropBatchPlan(batch.batchId);
        preview.value = result?.plan || null;
        if (!preview.value) toast('该批次还没有计划预览', 'error');
      } catch (error) { toast(error.message || '读取生产计划失败', 'error'); }
      finally { busy.value = false; }
    };
    const reviewPlan = async (decision) => {
      if (!preview.value || busy.value) return;
      const note = decision === 'REJECT' ? window.prompt('请填写驳回原因') : '';
      if (decision === 'REJECT' && !String(note || '').trim()) return;
      busy.value = true;
      try {
        preview.value = await api.reviewCropBatchPlan(preview.value.batchId, {
          decision,
          note: note || '',
          idempotencyKey: `crop-plan:${preview.value.planId}`,
          tasks: preview.value.tasks
        });
        emit('data-invalidated', { domains: ['batches', 'workOrders', 'overview'], record: preview.value });
        toast(decision === 'APPROVE' ? '计划已审批，任务已进入统一工单队列' : '计划已驳回');
      } catch (error) { toast(error.message || '审批失败', 'error'); }
      finally { busy.value = false; }
    };
    const taskLabel = action => action === 'IRRIGATION_CHECK' ? '检查灌溉需要' : action === 'INSPECTION' ? '现场巡田' : action || '农务任务';
    const stageLabel = stage => ({ seedling: '育苗期', vegetative: '营养生长期', flowering: '开花期', fruiting: '结果期' }[stage] || stage || '—');
    const metricLabel = metric => adminMetricLabel(metric?.code, metric?.label);
    const value = input => input === undefined || input === null || input === '' ? '—' : input;

    return { activeTab, busy, farmId, activePlots, batches, packs, selectedPack, selectedBatch, selectedBatchId, selectedPackCode, preview, form, setTab, syncCropForPlot, createPlan, loadPlan, reviewPlan, taskLabel, stageLabel, metricLabel, value };
  },
  template: `
    <section class="admin-management-page">
      <header class="admin-section-header"><div><h1>农务任务</h1><p>任务执行、生产计划与 Crop Pack 使用同一农场上下文。</p></div></header>
      <nav class="admin-local-tabs" aria-label="农务任务页签">
        <button :class="{active: activeTab === 'tasks'}" @click="setTab('tasks')">任务列表</button>
        <button :class="{active: activeTab === 'plans'}" @click="setTab('plans')">生产计划</button>
        <button :class="{active: activeTab === 'crop-packs'}" @click="setTab('crop-packs')">Crop Pack</button>
      </nav>

      <work-order-lifecycle v-if="activeTab === 'tasks'" :state="state" :route-params="routeParams"
        @navigate="(view, params) => $emit('navigate', view, params)"
        @data-invalidated="payload => $emit('data-invalidated', payload)"></work-order-lifecycle>

      <div v-else-if="activeTab === 'plans'" class="admin-split-layout">
        <section class="admin-panel">
          <div class="admin-panel-title"><div><span>新建批次</span><h2>生成生产计划预览</h2></div><em>DERIVED</em></div>
          <div class="admin-form-grid">
            <label><span>地块</span><select v-model="form.plotId" @change="syncCropForPlot"><option v-for="plot in activePlots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
            <label><span>作物</span><select v-model="form.cropCode"><option v-for="pack in packs" :key="pack.cropCode" :value="pack.cropCode">{{ pack.identity?.name || pack.cropCode }} · {{ pack.version || '—' }}</option></select></label>
            <label><span>计划开始日</span><input type="date" v-model="form.plantedAt"></label>
            <label><span>计划周期（天）</span><input type="number" min="1" max="1000" v-model.number="form.plannedCycleDays"></label>
          </div>
          <p class="admin-hint">阶段区间按周期与 Crop Pack 顺序等分，仅作为可编辑的 DERIVED 默认排期。</p>
          <button class="g-btn primary" :disabled="busy" @click="createPlan">{{ busy ? '处理中…' : '生成预览' }}</button>

          <div class="admin-list-section">
            <h3>已有种植批次</h3>
            <button v-for="batch in batches" :key="batch.batchId" class="admin-list-row" :class="{selected: selectedBatchId === batch.batchId}" @click="loadPlan(batch)">
              <span><strong>{{ activePlots.find(plot => plot.plotId === batch.plotId)?.name || batch.plotId }}</strong><small>{{ batch.cropCode }} · {{ batch.cropPackVersion || '—' }}</small></span>
              <b>{{ batch.status || 'ACTIVE' }}</b>
            </button>
            <p v-if="!batches.length" class="admin-empty">当前农场还没有种植批次。</p>
          </div>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-title"><div><span>计划预览</span><h2>{{ preview?.planId || '尚未选择计划' }}</h2></div><em>{{ preview?.status || '—' }}</em></div>
          <template v-if="preview">
            <div class="admin-plan-meta"><span>Crop Pack {{ preview.cropPackVersion || '—' }}</span><span>{{ preview.scheduleMethod || '—' }}</span><span>{{ preview.plannedCycleDays || '—' }} 天</span></div>
            <div class="admin-plan-tasks">
              <article v-for="task in preview.tasks" :key="task.taskKey" :class="{removed: task.removed}">
                <label><input type="checkbox" v-model="task.removed">不派发</label>
                <div><strong>{{ taskLabel(task.actionType) }}</strong><small>{{ stageLabel(task.stageCode) }} · {{ task.templateRef }}</small></div>
                <input type="date" v-model="task.scheduleDate" :disabled="preview.status === 'APPROVED'">
              </article>
            </div>
            <div class="admin-action-row" v-if="preview.status !== 'APPROVED'">
              <button class="g-btn secondary" :disabled="busy" @click="reviewPlan('REJECT')">驳回</button>
              <button class="g-btn primary" :disabled="busy" @click="reviewPlan('APPROVE')">审批并生成任务</button>
            </div>
            <p v-else class="admin-success-note">已生成 {{ preview.workOrderIds?.length || 0 }} 项任务；重复审批不会重复生成。</p>
          </template>
          <p v-else class="admin-empty">选择批次或生成新计划后，在这里调整日期并审批。</p>
        </section>
      </div>

      <div v-else class="admin-split-layout">
        <section class="admin-panel admin-pack-list">
          <div class="admin-panel-title"><div><span>后端事实</span><h2>Crop Pack 版本</h2></div></div>
          <button v-for="pack in packs" :key="pack.cropCode" :class="{selected: selectedPack?.cropCode === pack.cropCode}" @click="selectedPackCode = pack.cropCode">
            <strong>{{ pack.identity?.name || pack.cropCode }}</strong><span>{{ pack.cropCode }} · {{ pack.version || '—' }}</span>
          </button>
          <p v-if="!packs.length" class="admin-empty">后端没有返回 Crop Pack。</p>
        </section>
        <section class="admin-panel" v-if="selectedPack">
          <div class="admin-panel-title"><div><span>{{ selectedPack.cropCode }}</span><h2>{{ selectedPack.identity?.name || '—' }}</h2></div><em>{{ selectedPack.version || '—' }}</em></div>
          <dl class="admin-fact-grid"><div><dt>规则版本</dt><dd>{{ value(selectedPack.ruleVersion) }}</dd></div><div><dt>知识版本</dt><dd>{{ value(selectedPack.knowledgeVersion) }}</dd></div><div><dt>地区</dt><dd>{{ value(selectedPack.identity?.region) }}</dd></div><div><dt>品种</dt><dd>{{ value(selectedPack.identity?.variety) }}</dd></div></dl>
          <h3>阶段与任务模板</h3>
          <article class="admin-pack-stage" v-for="stage in selectedPack.stages" :key="stage.code">
            <div><strong>{{ stageLabel(stage.code) }}</strong><small>顺序 {{ value(stage.sequence) }} · 风险 {{ stage.riskFocus?.join(' / ') || '—' }}</small></div>
            <ul><li v-for="task in stage.taskTemplates || []" :key="task.actionType">{{ taskLabel(task.actionType) }} · 每 {{ value(task.intervalDays) }} 天 · {{ value(task.priority) }}</li><li v-if="!stage.taskTemplates?.length">任务模板：—</li></ul>
          </article>
          <h3>指标与阈值</h3>
          <div class="admin-compact-table"><div v-for="metric in selectedPack.metrics" :key="metric.code"><strong>{{ metricLabel(metric) }}</strong><span>{{ metric.availability || '—' }}</span><span>{{ metric.range ? metric.range.min + '–' + metric.range.max + ' ' + (metric.unit || '') : '—' }}</span></div></div>
        </section>
      </div>
    </section>
  `
};
