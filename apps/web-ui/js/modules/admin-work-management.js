import { api } from '../api.js?v=20260831-ai-role-v1';
import { adminMetricLabel, normalizeAdminTab } from '../admin-state.js?v=20260831-three-branch-v1';
import { WorkOrderLifecycleView } from '../work-order-lifecycle.js?v=20260831-three-branch-v1';
import { AdminResourcePlanningView } from './admin-resource-planning.js?v=20260831-three-branch-v1';
import { metricStatusLabel, priorityLabel, provenanceLabel, statusLabel } from '../live-data.js?v=20260831-ai-role-v1';

const { ref, computed, watch, inject, onMounted, onBeforeUnmount } = Vue;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export const AdminWorkManagementView = {
  components: {
    'work-order-lifecycle': WorkOrderLifecycleView,
    'admin-resource-planning': AdminResourcePlanningView
  },
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const activeTab = ref(normalizeAdminTab('work-orders', props.routeParams?.tab));
    const busy = ref(false);
    const selectedBatchId = ref('');
    const preview = ref(null);
    const selectedPackCode = ref('');
    const showPlanCreate = ref(false);
    const showPlanDetail = ref(false);
    const showPackDetail = ref(false);
    const showPackCreate = ref(false);
    const packSection = ref('models');
    const packCreateMode = ref('DRAFT');
    const packForm = ref({ cropCode: '', version: '1.0.0', name: '', variety: '', region: '', stagesJson: '[{"code":"seedling","label":"苗期","sequence":1,"target":{}}]', rulesJson: '[]', tasksJson: '[]', knowledgeJson: '[]' });
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
      if (!activePlots.value.some(plot => plot.plotId === form.value.plotId)) form.value.plotId = activePlots.value[0]?.plotId || '';
      if (!packs.value.some(pack => pack.cropCode === form.value.cropCode)) syncCropForPlot();
      if (!selectedPackCode.value) selectedPackCode.value = packs.value[0]?.cropCode || '';
    };

    const closePlanCreate = () => { if (!busy.value) showPlanCreate.value = false; };
    const closePlanDetail = () => { if (!busy.value) showPlanDetail.value = false; };
    const closePackDetail = () => { showPackDetail.value = false; };
    const closePackCreate = () => { if (!busy.value) showPackCreate.value = false; };
    const closePlanCreateOnBackdrop = event => {
      if (event.target === event.currentTarget) closePlanCreate();
    };
    const closePlanDetailOnBackdrop = event => {
      if (event.target === event.currentTarget) closePlanDetail();
    };
    const closePackDetailOnBackdrop = event => {
      if (event.target === event.currentTarget) closePackDetail();
    };
    const closeActiveDialogOnEscape = event => {
      if (event.key !== 'Escape') return;
      if (showPlanCreate.value) closePlanCreate();
      else if (showPlanDetail.value) closePlanDetail();
      else if (showPackDetail.value) closePackDetail();
      else if (showPackCreate.value) closePackCreate();
    };
    const closeDialogs = () => {
      showPlanCreate.value = false;
      showPlanDetail.value = false;
      showPackDetail.value = false;
      showPackCreate.value = false;
    };
    const openPlanCreate = () => { showPlanCreate.value = true; };
    const openPackDetail = (pack) => {
      selectedPackCode.value = pack.cropCode;
      showPackDetail.value = true;
    };
    const openPackCreate = () => { packForm.value = { cropCode: '', version: '1.0.0', name: '', variety: '', region: '', stagesJson: '[{"code":"seedling","label":"苗期","sequence":1,"target":{}}]', rulesJson: '[]', tasksJson: '[]', knowledgeJson: '[]' }; showPackCreate.value = true; };
    const validateSelectedPack = async () => {
      if (!selectedPack.value?.farmId || selectedPack.value.farmId !== farmId.value || busy.value) return;
      busy.value = true;
      try { const result = await api.validateFarmCropPack(farmId.value, selectedPack.value.cropCode, selectedPack.value.version); toast(result.valid ? '作物包校验通过，可以启用' : `校验未通过：${(result.errors || []).join('、')}`, result.valid ? 'success' : 'error'); }
      catch (error) { toast(error.message || '作物包校验失败', 'error'); }
      finally { busy.value = false; }
    };
    const activateSelectedPack = async () => {
      if (!selectedPack.value?.farmId || selectedPack.value.farmId !== farmId.value || busy.value) return;
      busy.value = true;
      try { const result = await api.activateFarmCropPack(farmId.value, selectedPack.value.cropCode, selectedPack.value.version, { expectedRevision: selectedPack.value.revision }); emit('data-invalidated', { domains: ['cropPacks', 'plots', 'overview'], record: result }); toast('作物包已启用，地块、计划和告警规则将统一使用新版本'); showPackDetail.value = false; }
      catch (error) { toast(error.message || '作物包启用失败', 'error'); }
      finally { busy.value = false; }
    };
    const transitionCandidate = async (candidate, target) => {
      const id = candidate?.candidateId || candidate?.id; if (!id || busy.value) return;
      busy.value = true;
      try { await api.transitionStrategyCandidate(id, target, { expectedRevision: candidate.revision, idempotencyKey: `strategy:${id}:${target}` }); emit('data-invalidated', { domains: ['alerts', 'overview'], record: candidate }); toast(target === 'ACTIVE' ? '学习策略已启用；相似告警将生成待确认决策预览' : `学习策略已${target === 'REJECTED' ? '拒绝' : '批准'}`); }
      catch (error) { toast(error.message || '学习策略状态更新失败', 'error'); }
      finally { busy.value = false; }
    };
    const submitPackCreate = async (event) => {
      event?.preventDefault();
      if (!farmId.value || !packForm.value.cropCode || !packForm.value.name || !packForm.value.variety) { toast('请填写作物编号、名称和品种', 'error'); return; }
      const parse = (value, fallback) => { try { const parsed = JSON.parse(value); return parsed; } catch { toast('阶段、规则、任务或知识 JSON 格式不正确', 'error'); return fallback; } };
      const stages = parse(packForm.value.stagesJson, null); const rules = parse(packForm.value.rulesJson, null); const taskTemplates = parse(packForm.value.tasksJson, null); const knowledge = parse(packForm.value.knowledgeJson, null); if (!stages || !rules || !taskTemplates || !knowledge) return;
      busy.value = true;
      try {
        const created = await api.createFarmCropPack(farmId.value, { cropCode: packForm.value.cropCode, version: packForm.value.version || '1.0.0', identity: { name: packForm.value.name, variety: packForm.value.variety, region: packForm.value.region }, stages, rules, taskTemplates, knowledge });
        showPackCreate.value = false; emit('data-invalidated', { domains: ['cropPacks', 'plots', 'overview'], record: created }); toast('作物包草稿已保存，可在校验通过后启用');
      } catch (error) { toast(error.message || '作物包保存失败', 'error'); } finally { busy.value = false; }
    };

    watch(() => props.routeParams?.tab, tab => {
      activeTab.value = normalizeAdminTab('work-orders', tab);
      closeDialogs();
    });
    watch(farmId, () => {
      closeDialogs();
      selectedBatchId.value = '';
      selectedPackCode.value = '';
      preview.value = null;
      form.value.plotId = '';
      form.value.cropCode = '';
      syncDefaults();
    });
    watch([activePlots, packs, batches], syncDefaults, { immediate: true });
    onMounted(() => document.addEventListener('keydown', closeActiveDialogOnEscape));
    onBeforeUnmount(() => document.removeEventListener('keydown', closeActiveDialogOnEscape));

    const setTab = (tab) => {
      closeDialogs();
      emit('navigate', 'work-orders', { tab, farmId: farmId.value });
    };
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
        showPlanCreate.value = false;
        showPlanDetail.value = true;
        emit('data-invalidated', { domains: ['batches'], record: batch });
        toast('生产计划预览已生成；日期可以调整，尚未派发任务');
      } catch (error) {
        toast(error.message || '生产计划生成失败', 'error');
      } finally { busy.value = false; }
    };
    const submitPlanCreate = event => {
      event.preventDefault();
      createPlan();
    };
    const loadPlan = async (batch) => {
      selectedBatchId.value = batch.batchId;
      busy.value = true;
      try {
        const result = await api.getCropBatchPlan(batch.batchId);
        preview.value = result?.plan || null;
        if (!preview.value) toast('该批次还没有计划预览', 'error');
        else showPlanDetail.value = true;
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
    const taskLabel = action => ({
      IRRIGATION_CHECK: '灌溉巡检',
      IRRIGATION_REVIEW: '灌溉审批',
      INSPECTION: '现场巡田',
      FIELD_INSPECTION: '现场巡田',
      FIELD_OPERATION: '田间作业',
      DEVICE_CHECK: '设备检查',
      FERTILIZATION: '施肥检查'
    }[String(action || '').toUpperCase()] || action || '农务任务');
    const stageLabel = stage => ({ seedling: '育苗期', vegetative: '营养生长期', flowering: '开花期', fruiting: '结果期' }[stage] || stage || '—');
    const metricLabel = metric => adminMetricLabel(metric?.code, metric?.label);
    const value = input => input === undefined || input === null || input === '' ? '—' : input;
    const plotName = plotId => activePlots.value.find(plot => plot.plotId === plotId)?.name || plotId || '—';
    const cropName = cropCode => packs.value.find(pack => pack.cropCode === cropCode)?.identity?.name || cropCode || '—';
    const dateLabel = input => input ? String(input).slice(0, 10).replaceAll('-', '/') : '—';
    const batchStatusLabel = status => ({ ACTIVE: '进行中', PLANNED: '待执行', COMPLETED: '已完成', INACTIVE: '已停用' }[String(status || '').toUpperCase()] || statusLabel(status, '进行中'));
    const batchStatusTone = status => ({ ACTIVE: 'active', PLANNED: 'planned', COMPLETED: 'completed', INACTIVE: 'inactive' }[String(status || '').toUpperCase()] || 'neutral');
    const planStatusLabel = status => ({ DRAFT: '待审批', APPROVED: '已审批', REJECTED: '已驳回' }[String(status || '').toUpperCase()] || status || '—');

    return {
      activeTab, busy, farmId, activePlots, batches, packs, selectedPack, selectedBatch, selectedBatchId, selectedPackCode, preview, form,
      showPlanCreate, showPlanDetail, showPackDetail, showPackCreate, packSection, packForm, packCreateMode, setTab, syncCropForPlot, createPlan, loadPlan, reviewPlan,
      openPlanCreate, closePlanCreate, closePlanDetail, openPackDetail, closePackDetail, openPackCreate, closePackCreate, submitPackCreate,
      validateSelectedPack, activateSelectedPack, transitionCandidate,
      closePlanCreateOnBackdrop, closePlanDetailOnBackdrop, closePackDetailOnBackdrop,
      submitPlanCreate,
      taskLabel, stageLabel, metricLabel, value, plotName, cropName, dateLabel, batchStatusLabel, batchStatusTone, planStatusLabel,
      metricStatusLabel, priorityLabel, provenanceLabel, statusLabel
    };
  },
  template: `
    <section class="admin-management-page">
      <header class="admin-section-header"><div><h1>农务任务</h1><p>任务执行、生产计划、资源安排与 Crop Pack 使用同一农场上下文。</p></div></header>
      <nav class="admin-local-tabs" aria-label="农务任务页签">
        <button :class="{active: activeTab === 'tasks'}" @click="setTab('tasks')">任务列表</button>
        <button :class="{active: activeTab === 'plans'}" @click="setTab('plans')">生产计划</button>
        <button :class="{active: activeTab === 'resources'}" @click="setTab('resources')">资源安排</button>
        <button :class="{active: activeTab === 'crop-packs'}" @click="setTab('crop-packs')">Crop Pack</button>
      </nav>

      <work-order-lifecycle v-if="activeTab === 'tasks'" :state="state" :route-params="routeParams" :embedded="true"
        @navigate="(view, params) => $emit('navigate', view, params)"
        @data-invalidated="payload => $emit('data-invalidated', payload)"></work-order-lifecycle>

      <section v-else-if="activeTab === 'plans'" class="admin-panel admin-work-collection" aria-labelledby="admin-plan-collection-title">
        <div class="admin-work-collection-header">
          <div><span>当前农场</span><h2 id="admin-plan-collection-title">种植批次与生产计划</h2></div>
          <em>{{ batches.length }} 个批次</em>
        </div>
        <div class="admin-plan-card-grid">
          <button v-for="batch in batches" :key="batch.batchId" type="button" class="admin-plan-summary-card"
            :class="['status-' + batchStatusTone(batch.status), { selected: selectedBatchId === batch.batchId && showPlanDetail }]"
            :aria-label="'查看生产计划：' + plotName(batch.plotId)" :disabled="busy" @click="loadPlan(batch)">
            <header>
              <span class="admin-work-status-chip" :class="'tone-' + batchStatusTone(batch.status)">{{ batchStatusLabel(batch.status) }}</span>
              <span>{{ provenanceLabel(batch.sourceMode || 'DERIVED') }}</span>
            </header>
            <div class="admin-work-card-identity">
              <h3>{{ plotName(batch.plotId) }}</h3>
              <p>{{ cropName(batch.cropCode) }} · {{ batch.cropCode || '—' }}</p>
            </div>
            <dl class="admin-work-card-facts">
              <div><dt>Crop Pack</dt><dd>{{ batch.cropPackVersion || '—' }}</dd></div>
              <div><dt>计划开始日</dt><dd>{{ dateLabel(batch.plantedAt) }}</dd></div>
              <div><dt>计划周期</dt><dd>{{ batch.plannedCycleDays ? batch.plannedCycleDays + ' 天' : '—' }}</dd></div>
              <div><dt>批次编号</dt><dd :title="batch.batchId">{{ batch.batchId }}</dd></div>
            </dl>
            <footer><span>{{ batch.planId ? '已有计划预览' : '尚未生成预览' }}</span><strong>查看计划 <app-icon name="chevron_right"></app-icon></strong></footer>
          </button>

          <button type="button" class="admin-plan-summary-card admin-add-work-card" @click="openPlanCreate">
            <span class="admin-add-work-icon"><app-icon name="add"></app-icon></span>
            <strong>新建生产计划</strong>
            <small>选择地块、作物和周期，生成可审批预览</small>
          </button>
        </div>
      </section>

      <admin-resource-planning v-else-if="activeTab === 'resources'" :state="state"
        :route-params="{ ...routeParams, farmId }"
        @data-invalidated="payload => $emit('data-invalidated', payload)"></admin-resource-planning>

      <section v-else class="admin-panel admin-work-collection" aria-labelledby="admin-pack-collection-title">
        <div class="admin-work-collection-header">
          <div><span>农场级作物模型与告警治理</span><h2 id="admin-pack-collection-title">Crop Pack</h2></div>
          <em>{{ packs.length }} 个版本</em>
        </div>
        <nav class="admin-local-tabs admin-pack-tabs" aria-label="Crop Pack 内容">
          <button type="button" :class="{active: packSection === 'models'}" @click="packSection = 'models'">作物模型</button>
          <button type="button" :class="{active: packSection === 'rules'}" @click="packSection = 'rules'">告警规则</button>
          <button type="button" :class="{active: packSection === 'candidates'}" @click="packSection = 'candidates'">学习候选</button>
        </nav>
        <div v-if="packSection === 'models'" class="admin-pack-card-grid">
          <button v-for="pack in packs" :key="pack.cropCode" type="button" class="admin-pack-summary-card"
            :data-crop="pack.cropCode" :aria-label="'查看 Crop Pack：' + (pack.identity?.name || pack.cropCode)" @click="openPackDetail(pack)">
            <header>
              <span class="admin-pack-glyph">{{ (pack.identity?.name || pack.cropCode || 'P').slice(0, 1) }}</span>
              <span>v{{ pack.version || '—' }}</span>
            </header>
            <div class="admin-work-card-identity">
              <h3>{{ pack.identity?.name || pack.cropCode }}</h3>
              <p>{{ pack.cropCode }} · {{ value(pack.identity?.region) }}</p>
            </div>
            <dl class="admin-work-card-facts">
              <div><dt>规则版本</dt><dd>{{ value(pack.ruleVersion) }}</dd></div>
              <div><dt>知识版本</dt><dd>{{ value(pack.knowledgeVersion) }}</dd></div>
              <div><dt>生长阶段</dt><dd>{{ pack.stages?.length || 0 }} 个</dd></div>
              <div><dt>指标阈值</dt><dd>{{ pack.metrics?.length || 0 }} 项</dd></div>
            </dl>
            <footer><span>{{ value(pack.identity?.variety) }}</span><strong>查看详情 <app-icon name="chevron_right"></app-icon></strong></footer>
          </button>
          <button type="button" class="admin-pack-summary-card admin-add-work-card" @click="openPackCreate">
            <span class="admin-add-work-icon"><app-icon name="add"></app-icon></span>
            <strong>添加作物</strong>
            <small>创建当前农场专属 Crop Pack 草稿</small>
          </button>
        </div>
        <p v-if="packSection === 'models' && !packs.length" class="admin-empty">后端没有返回 Crop Pack，可使用“添加作物”创建农场草稿。</p>
        <div v-else-if="packSection === 'rules'" class="admin-compact-table admin-governance-table">
          <div v-for="rule in (state.adminRules || [])" :key="rule.ruleId || rule.id || rule.code"><strong>{{ rule.name || rule.code || '告警规则' }}</strong><span>{{ rule.cropCode || '全局' }}</span><span>{{ rule.ruleVersion || '—' }}</span></div>
          <p v-if="!(state.adminRules || []).length" class="admin-empty">暂无可展示的告警规则。</p>
        </div>
        <div v-else class="admin-compact-table admin-governance-table">
          <div v-for="candidate in (state.adminStrategyCandidates || [])" :key="candidate.candidateId || candidate.id"><strong>{{ candidate.summary || candidate.description || candidate.signature || candidate.candidateId || candidate.id }}</strong><span>{{ candidate.status || 'DRAFT' }}</span><span>{{ candidate.evidenceCount || 0 }} 条案例</span><button v-if="['OFFLINE_VALIDATED','APPROVED','VERIFIED'].includes(String(candidate.status || '').toUpperCase())" type="button" class="g-btn small primary" :disabled="busy" @click="transitionCandidate(candidate, 'ACTIVE')">批准并启用</button><button v-else-if="String(candidate.status || '').toUpperCase() === 'DRAFT'" type="button" class="g-btn small secondary" :disabled="busy" @click="transitionCandidate(candidate, 'REJECTED')">拒绝</button></div>
          <p v-if="!(state.adminStrategyCandidates || []).length" class="admin-empty">尚未形成学习候选；完成同类告警闭环后自动生成。</p>
        </div>
      </section>

      <div v-if="showPlanCreate" class="g-modal-overlay admin-work-dialog-overlay" @click="closePlanCreateOnBackdrop">
        <form class="g-modal admin-work-data-dialog admin-plan-create-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-plan-create-title" @submit="submitPlanCreate">
          <div class="g-modal-header"><div><small>新建种植批次 · 推导数据</small><h3 id="admin-plan-create-title">生成生产计划预览</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭" :disabled="busy" @click="closePlanCreate"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body">
            <div class="admin-form-grid">
              <label><span>地块</span><select v-model="form.plotId" @change="syncCropForPlot"><option v-for="plot in activePlots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
              <label><span>作物</span><select v-model="form.cropCode"><option v-for="pack in packs" :key="pack.cropCode" :value="pack.cropCode">{{ pack.identity?.name || pack.cropCode }} · {{ pack.version || '—' }}</option></select></label>
              <label><span>计划开始日</span><input type="date" v-model="form.plantedAt"></label>
              <label><span>计划周期（天）</span><input type="number" min="1" max="1000" v-model.number="form.plannedCycleDays"></label>
            </div>
            <p class="admin-hint">阶段区间按周期与 Crop Pack 顺序等分，仅作为可编辑的 DERIVED 默认排期。</p>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" :disabled="busy" @click="closePlanCreate">取消</button><button type="submit" class="g-btn primary" :disabled="busy">{{ busy ? '处理中…' : '生成预览' }}</button></div>
        </form>
      </div>

      <div v-if="showPlanDetail && preview" class="g-modal-overlay admin-work-dialog-overlay" @click="closePlanDetailOnBackdrop">
        <section class="g-modal admin-work-data-dialog admin-plan-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-plan-detail-title">
          <div class="g-modal-header"><div><small>生产计划详情 · {{ preview.batchId }}</small><h3 id="admin-plan-detail-title">{{ preview.planId }}</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭" :disabled="busy" @click="closePlanDetail"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body admin-work-detail-body">
            <div class="admin-plan-detail-status"><span class="admin-work-status-chip" :class="'tone-' + String(preview.status || '').toLowerCase()">{{ planStatusLabel(preview.status) }}</span><span>{{ provenanceLabel(preview.sourceMode || 'DERIVED') }}</span></div>
            <dl class="admin-work-detail-facts">
              <div><dt>地块</dt><dd>{{ plotName(preview.plotId || selectedBatch?.plotId) }}</dd></div>
              <div><dt>作物</dt><dd>{{ cropName(preview.cropCode || selectedBatch?.cropCode) }}</dd></div>
              <div><dt>Crop Pack</dt><dd>{{ preview.cropPackVersion || '—' }}</dd></div>
              <div><dt>计划周期</dt><dd>{{ preview.plannedCycleDays || '—' }} 天</dd></div>
            </dl>
            <div class="admin-work-detail-heading"><div><h4>任务排期</h4><p>审批前可调整日期或标记“不派发”。</p></div><em>{{ preview.tasks?.length || 0 }} 项</em></div>
            <div class="admin-plan-tasks">
              <article v-for="task in preview.tasks" :key="task.taskKey" :class="{removed: task.removed}">
                <label><input type="checkbox" v-model="task.removed" :disabled="preview.status === 'APPROVED'">不派发</label>
                <div><strong>{{ taskLabel(task.actionType) }}</strong><small>{{ stageLabel(task.stageCode) }} · {{ task.templateRef }}</small></div>
                <input type="date" v-model="task.scheduleDate" :disabled="preview.status === 'APPROVED'">
              </article>
            </div>
            <p v-if="preview.status === 'APPROVED'" class="admin-success-note">已生成 {{ preview.workOrderIds?.length || 0 }} 项任务；重复审批不会重复生成。</p>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" :disabled="busy" @click="closePlanDetail">关闭</button><template v-if="preview.status !== 'APPROVED'"><button type="button" class="g-btn secondary" :disabled="busy" @click="reviewPlan('REJECT')">驳回</button><button type="button" class="g-btn primary" :disabled="busy" @click="reviewPlan('APPROVE')">审批并生成任务</button></template></div>
        </section>
      </div>

      <div v-if="showPackDetail && selectedPack" class="g-modal-overlay admin-work-dialog-overlay" @click="closePackDetailOnBackdrop">
        <section class="g-modal admin-work-data-dialog admin-pack-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-pack-detail-title">
          <div class="g-modal-header"><div><small>Crop Pack 详情 · {{ selectedPack.cropCode }}</small><h3 id="admin-pack-detail-title">{{ selectedPack.identity?.name || '—' }}</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭" @click="closePackDetail"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body admin-work-detail-body">
            <div class="admin-plan-detail-status"><span class="admin-work-status-chip tone-active">版本 {{ selectedPack.version || '—' }}</span><span>后端事实</span></div>
            <dl class="admin-work-detail-facts"><div><dt>规则版本</dt><dd>{{ value(selectedPack.ruleVersion) }}</dd></div><div><dt>知识版本</dt><dd>{{ value(selectedPack.knowledgeVersion) }}</dd></div><div><dt>地区</dt><dd>{{ value(selectedPack.identity?.region) }}</dd></div><div><dt>品种</dt><dd>{{ value(selectedPack.identity?.variety) }}</dd></div></dl>
            <div class="admin-work-detail-heading"><div><h4>阶段与任务模板</h4><p>阶段顺序、风险重点和默认农务均来自当前版本。</p></div><em>{{ selectedPack.stages?.length || 0 }} 个阶段</em></div>
            <div class="admin-pack-stage-list">
              <article class="admin-pack-stage" v-for="stage in selectedPack.stages" :key="stage.code">
                <div><strong>{{ stageLabel(stage.code) }}</strong><small>顺序 {{ value(stage.sequence) }} · 风险 {{ stage.riskFocus?.join(' / ') || '—' }}</small></div>
                <ul><li v-for="task in stage.taskTemplates || []" :key="task.actionType">{{ taskLabel(task.actionType) }} · 每 {{ value(task.intervalDays) }} 天 · {{ value(task.priority) }}</li><li v-if="!stage.taskTemplates?.length">任务模板：—</li></ul>
              </article>
            </div>
            <div class="admin-work-detail-heading"><div><h4>指标与阈值</h4><p>已知指标优先显示中文，接口编码保持不变。</p></div><em>{{ selectedPack.metrics?.length || 0 }} 项</em></div>
            <div class="admin-compact-table"><div v-for="metric in selectedPack.metrics" :key="metric.code"><strong>{{ metricLabel(metric) }}</strong><span>{{ metricStatusLabel(metric.availability, '未知') }}</span><span>{{ metric.range ? metric.range.min + '–' + metric.range.max + ' ' + (metric.unit || '') : '—' }}</span></div></div>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" :disabled="busy" @click="closePackDetail">关闭</button><template v-if="selectedPack.farmId === farmId && String(selectedPack.status || '').toUpperCase() !== 'ACTIVE'"><button type="button" class="g-btn secondary" :disabled="busy" @click="validateSelectedPack">校验草稿</button><button type="button" class="g-btn primary" :disabled="busy" @click="activateSelectedPack">启用作物包</button></template></div>
        </section>
      </div>

      <div v-if="showPackCreate" class="g-modal-overlay admin-work-dialog-overlay" @click.self="closePackCreate">
        <form class="g-modal admin-work-data-dialog admin-pack-create-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-pack-create-title" @submit="submitPackCreate">
          <div class="g-modal-header"><div><small>当前农场 · 草稿</small><h3 id="admin-pack-create-title">添加作物</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭" @click="closePackCreate"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body"><div class="admin-form-grid"><label><span>作物编号</span><input v-model.trim="packForm.cropCode" placeholder="例如 basil"></label><label><span>版本</span><input v-model.trim="packForm.version" placeholder="1.0.0"></label><label><span>名称</span><input v-model.trim="packForm.name" placeholder="作物名称"></label><label><span>品种</span><input v-model.trim="packForm.variety" placeholder="品种"></label><label><span>地区</span><input v-model.trim="packForm.region" placeholder="地区"></label></div><div class="admin-form-grid admin-form-grid-wide"><label><span>生长阶段 JSON</span><textarea v-model="packForm.stagesJson" rows="3"></textarea></label><label><span>告警规则 JSON</span><textarea v-model="packForm.rulesJson" rows="3"></textarea></label><label><span>任务模板 JSON</span><textarea v-model="packForm.tasksJson" rows="3"></textarea></label><label><span>知识文档 JSON</span><textarea v-model="packForm.knowledgeJson" rows="3"></textarea></label></div><p class="admin-hint">草稿可先保存；启用前后端会校验阶段顺序、阈值、规则与任务模板。</p></div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" :disabled="busy" @click="closePackCreate">取消</button><button type="submit" class="g-btn primary" :disabled="busy">{{ busy ? '保存中…' : '保存草稿' }}</button></div>
        </form>
      </div>
    </section>
  `
};
