import { api } from '../api.js?v=20260904-alert-hardware-v1';
import { adminCropEmoji, adminMetricLabel, normalizeAdminTab } from '../admin-state.js?v=20260902-performance-v1';
import { WorkOrderLifecycleView } from '../work-order-lifecycle.js?v=20260904-alert-hardware-v1';
import { AdminResourcePlanningView } from './admin-resource-planning.js?v=20260902-v5911-zhcn-v1';
import { metricStatusLabel, priorityLabel, provenanceLabel, statusLabel } from '../live-data.js?v=20260902-performance-v1';

const { ref, computed, watch, inject, onMounted, onBeforeUnmount } = Vue;

function newPackForm(pack = {}) {
  const identity = pack.identity || {};
  return {
    cropCode: pack.cropCode || '', version: pack.version || '1.0.0', name: identity.name || '',
    variety: identity.variety || '', region: identity.region || '',
    stages: Array.isArray(pack.stages) && pack.stages.length ? pack.stages.map(stage => ({ ...stage, target: { SOIL_MOISTURE: { low: 30, high: 50, unit: '%' }, ...(stage.target || {}) } })) : [{ code: 'seedling', label: '苗期', sequence: 1, target: { SOIL_MOISTURE: { low: 30, high: 50, unit: '%' } } }],
    rules: Array.isArray(pack.rules) && pack.rules.length ? pack.rules.map(rule => ({ ...rule })) : [{ code: 'soil-moisture-low', metric: 'SOIL_MOISTURE', operator: 'LT', threshold: 30, durationMinutes: 15, cooldownMinutes: 60 }],
    taskTemplates: Array.isArray(pack.taskTemplates) && pack.taskTemplates.length ? pack.taskTemplates.map(task => ({ ...task })) : [{ actionType: 'INSPECTION', priority: 'MEDIUM', intervalDays: 1 }],
    knowledge: Array.isArray(pack.knowledge) && pack.knowledge.length ? pack.knowledge.map(item => typeof item === 'string' ? ({ title: '', content: item }) : ({ ...item })) : [{ title: '', content: '' }]
  };
}

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
    const packMenuId = ref('');
    const packCreateMode = ref('DRAFT');
    const packWizardStep = ref(1);
    const packForm = ref(newPackForm());
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
    const packKey = pack => `${pack?.farmId || 'global'}:${pack?.cropCode || ''}:${pack?.version || ''}`;
    const canManagePack = pack => Boolean(pack?.farmId && pack.farmId === farmId.value);
    const closePackMenu = () => { packMenuId.value = ''; };
    const togglePackMenu = pack => {
      const key = packKey(pack);
      packMenuId.value = packMenuId.value === key ? '' : key;
    };
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
      packMenuId.value = '';
    };
    const openPlanCreate = () => { showPlanCreate.value = true; };
    const openPackDetail = (pack) => {
      closePackMenu();
      selectedPackCode.value = pack.cropCode;
      showPackDetail.value = true;
    };
    const openPackCreate = () => { packCreateMode.value = 'DRAFT'; packForm.value = newPackForm(); packWizardStep.value = 1; showPackCreate.value = true; };
    const openPackEdit = pack => { packCreateMode.value = 'EDIT'; packForm.value = newPackForm(pack); packWizardStep.value = 1; showPackDetail.value = false; showPackCreate.value = true; };
    const openPackEditFromMenu = async pack => {
      closePackMenu();
      if (!farmId.value) { toast('请先选择当前农场', 'error'); return; }
      if (canManagePack(pack) && String(pack.status || '').toUpperCase() === 'ACTIVE') { toast('已启用版本不能原地修改，请新建版本', 'error'); return; }
      if (busy.value) return;
      busy.value = true;
      try {
        let editablePack = pack;
        if (!canManagePack(pack)) {
          editablePack = await api.createFarmCropPack(farmId.value, {
            cropCode: pack.cropCode,
            version: pack.version || '1.0.0',
            identity: pack.identity,
            stages: pack.stages,
            rules: pack.rules,
            taskTemplates: pack.taskTemplates,
            knowledge: pack.knowledge,
            metrics: pack.metrics,
            ruleVersion: pack.ruleVersion,
            knowledgeVersion: pack.knowledgeVersion
          });
          props.state.cropPacks = [...(props.state.cropPacks || []).filter(item => item.cropCode !== pack.cropCode), editablePack];
          emit('data-invalidated', { domains: ['cropPacks', 'plots', 'overview'], farmId: farmId.value, record: editablePack, reason: 'farm-crop-pack-cloned' });
          toast('已复制为当前农场草稿，现在可以修改');
        }
        openPackEdit(editablePack);
      } catch (error) { toast(error.message || '作物包复制失败', 'error'); }
      finally { busy.value = false; }
    };
    const archivePackFromMenu = async pack => {
      closePackMenu();
      if (busy.value) return;
      const name = pack.identity?.name || pack.cropCode || '该作物包';
      if (!window.confirm(`确定删除“${name}”作物包吗？删除后将从当前农场列表中移除。`)) return;
      busy.value = true;
      try {
        let archived;
        if (canManagePack(pack)) {
          archived = await api.archiveFarmCropPack(farmId.value, pack.cropCode, pack.version);
        } else {
          // Global packs remain platform facts. Create a farm-scoped archived
          // override so this farm can remove it without deleting the global pack.
          const hiddenVersion = `${pack.version || '1.0.0'}-farm-hidden-${Date.now()}`;
          await api.createFarmCropPack(farmId.value, {
            cropCode: pack.cropCode,
            version: hiddenVersion,
            identity: pack.identity,
            stages: pack.stages,
            rules: pack.rules,
            taskTemplates: pack.taskTemplates,
            knowledge: pack.knowledge,
            metrics: pack.metrics,
            ruleVersion: pack.ruleVersion,
            knowledgeVersion: pack.knowledgeVersion
          });
          archived = await api.archiveFarmCropPack(farmId.value, pack.cropCode, hiddenVersion);
        }
        props.state.cropPacks = (props.state.cropPacks || []).filter(item => packKey(item) !== packKey(pack));
        if (selectedPackCode.value === pack.cropCode) { selectedPackCode.value = ''; showPackDetail.value = false; }
        emit('data-invalidated', { domains: ['cropPacks', 'plots', 'overview', 'rulesStrategies'], farmId: farmId.value, record: archived, reason: 'farm-crop-pack-archived' });
        toast(canManagePack(pack) ? '作物包已删除，并已从当前农场列表移除' : '作物包已从当前农场移除，全局作物包仍保留');
      } catch (error) { toast(error.message || '作物包删除失败', 'error'); }
      finally { busy.value = false; }
    };
    const nextPackStep = () => {
      if (packWizardStep.value === 1 && (!packForm.value.cropCode.trim() || !packForm.value.name.trim() || !packForm.value.variety.trim())) { toast('请先填写作物编号、名称和品种', 'error'); return; }
      if (packWizardStep.value === 2 && !packForm.value.stages.length) { toast('至少添加一个生长阶段', 'error'); return; }
      packWizardStep.value = Math.min(5, packWizardStep.value + 1);
    };
    const previousPackStep = () => { packWizardStep.value = Math.max(1, packWizardStep.value - 1); };
    const addStage = () => packForm.value.stages.push({ code: '', label: '', sequence: packForm.value.stages.length + 1, target: { SOIL_MOISTURE: { low: 20, high: 50, unit: '%' } } });
    const removeStage = index => { if (packForm.value.stages.length > 1) packForm.value.stages.splice(index, 1); };
    const addRule = () => packForm.value.rules.push({ code: '', metric: 'SOIL_MOISTURE', operator: 'LT', threshold: 30, durationMinutes: 15, cooldownMinutes: 60 });
    const removeRule = index => packForm.value.rules.splice(index, 1);
    const addTaskTemplate = () => packForm.value.taskTemplates.push({ actionType: 'INSPECTION', priority: 'MEDIUM', intervalDays: 1 });
    const removeTaskTemplate = index => packForm.value.taskTemplates.splice(index, 1);
    const addKnowledge = () => packForm.value.knowledge.push({ title: '', content: '' });
    const removeKnowledge = index => { if (packForm.value.knowledge.length > 1) packForm.value.knowledge.splice(index, 1); };
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
    const submitPackCreate = async (event) => {
      event?.preventDefault();
      if (!farmId.value || !packForm.value.cropCode || !packForm.value.name || !packForm.value.variety) { toast('请填写作物编号、名称和品种', 'error'); return; }
      busy.value = true;
      try {
        const input = { cropCode: packForm.value.cropCode.trim(), version: packForm.value.version || '1.0.0', identity: { name: packForm.value.name.trim(), variety: packForm.value.variety.trim(), region: packForm.value.region.trim() }, stages: packForm.value.stages, rules: packForm.value.rules, taskTemplates: packForm.value.taskTemplates, knowledge: packForm.value.knowledge };
        const created = packCreateMode.value === 'EDIT'
          ? await api.updateFarmCropPack(farmId.value, input.cropCode, input.version, { ...input, expectedRevision: selectedPack.value?.revision })
          : await api.createFarmCropPack(farmId.value, input);
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
    onMounted(() => {
      document.addEventListener('keydown', closeActiveDialogOnEscape);
      document.addEventListener('click', closePackMenu);
    });
    onBeforeUnmount(() => {
      document.removeEventListener('keydown', closeActiveDialogOnEscape);
      document.removeEventListener('click', closePackMenu);
    });

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
    const cropEmoji = pack => String(pack?.icon || '').trim() || adminCropEmoji({ cropCode: pack?.cropCode, cropName: pack?.identity?.name, cropVariety: pack?.identity?.variety });
    const dateLabel = input => input ? String(input).slice(0, 10).replaceAll('-', '/') : '—';
    const batchStatusLabel = status => ({ ACTIVE: '进行中', PLANNED: '待执行', COMPLETED: '已完成', INACTIVE: '已停用' }[String(status || '').toUpperCase()] || statusLabel(status, '进行中'));
    const batchStatusTone = status => ({ ACTIVE: 'active', PLANNED: 'planned', COMPLETED: 'completed', INACTIVE: 'inactive' }[String(status || '').toUpperCase()] || 'neutral');
    const planStatusLabel = status => ({ DRAFT: '待审批', APPROVED: '已审批', REJECTED: '已驳回' }[String(status || '').toUpperCase()] || '—');

    return {
      activeTab, busy, farmId, activePlots, batches, packs, selectedPack, selectedBatch, selectedBatchId, selectedPackCode, preview, form,
      showPlanCreate, showPlanDetail, showPackDetail, showPackCreate, packForm, packCreateMode, packWizardStep, setTab, syncCropForPlot, createPlan, loadPlan, reviewPlan,
      openPlanCreate, closePlanCreate, closePlanDetail, openPackDetail, openPackEdit, openPackEditFromMenu, closePackDetail, openPackCreate, closePackCreate, submitPackCreate,
      packMenuId, packKey, canManagePack, togglePackMenu, archivePackFromMenu,
      validateSelectedPack, activateSelectedPack, nextPackStep, previousPackStep, addStage, removeStage, addRule, removeRule, addTaskTemplate, removeTaskTemplate, addKnowledge, removeKnowledge,
      closePlanCreateOnBackdrop, closePlanDetailOnBackdrop, closePackDetailOnBackdrop,
      submitPlanCreate,
      taskLabel, stageLabel, metricLabel, value, plotName, cropName, cropEmoji, dateLabel, batchStatusLabel, batchStatusTone, planStatusLabel,
      metricStatusLabel, priorityLabel, provenanceLabel, statusLabel
    };
  },
  template: `
    <section class="admin-management-page">
      <header class="admin-section-header"><div><h1>农务任务</h1><p>任务执行、生产计划、灌溉调度与作物模型包使用同一农场上下文。</p></div></header>
      <nav class="admin-local-tabs" aria-label="农务任务页签">
        <button :class="{active: activeTab === 'tasks'}" @click="setTab('tasks')">任务中心</button>
        <button :class="{active: activeTab === 'plans'}" @click="setTab('plans')">生产计划</button>
        <button :class="{active: activeTab === 'resources'}" @click="setTab('resources')">灌溉调度</button>
        <button :class="{active: activeTab === 'crop-packs'}" @click="setTab('crop-packs')">作物模型包</button>
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
              <div><dt>作物模型包</dt><dd>{{ batch.cropPackVersion || '—' }}</dd></div>
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
          <div><span>农场级作物模型与告警治理</span><h2 id="admin-pack-collection-title">作物模型包</h2></div>
          <em>{{ packs.length }} 个版本</em>
        </div>
        <div class="admin-pack-card-grid">
          <article v-for="pack in packs" :key="packKey(pack)" class="admin-pack-summary-card"
            :data-crop="pack.cropCode" :aria-label="'查看作物模型包：' + (pack.identity?.name || pack.cropCode)" role="button" tabindex="0"
            @click="openPackDetail(pack)" @keydown.enter="openPackDetail(pack)" @keydown.space.prevent="openPackDetail(pack)">
            <header>
              <span class="admin-pack-glyph" aria-hidden="true">{{ cropEmoji(pack) }}</span>
              <span>{{ pack.farmId ? (String(pack.status || 'DRAFT').toUpperCase() === 'ACTIVE' ? '已启用' : '农场草稿') : '全局' }} · v{{ pack.version || '—' }}</span>
              <div class="admin-pack-menu-wrap" @click.stop>
                <button type="button" class="admin-pack-menu-trigger" aria-label="打开作物包菜单" :aria-expanded="packMenuId === packKey(pack)" @click.stop="togglePackMenu(pack)"><app-icon name="more_vertical"></app-icon></button>
                <div v-if="packMenuId === packKey(pack)" class="admin-pack-menu" role="menu" @click.stop>
                  <button type="button" role="menuitem" @click="openPackEditFromMenu(pack)">修改作物包</button>
                  <button type="button" role="menuitem" @click="archivePackFromMenu(pack)">删除作物包</button>
                  <small v-if="!canManagePack(pack)">修改会先复制为当前农场草稿；删除只对当前农场生效</small>
                  <small v-else-if="String(pack.status || '').toUpperCase() === 'ACTIVE'">已启用版本不可原地修改</small>
                </div>
              </div>
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
          </article>
          <button type="button" class="admin-pack-summary-card admin-add-work-card" @click="openPackCreate">
            <span class="admin-add-work-icon"><app-icon name="add"></app-icon></span>
            <strong>添加作物</strong>
            <small>创建当前农场专属作物模型包草稿</small>
          </button>
        </div>
        <p v-if="!packs.length" class="admin-empty">后端没有返回作物模型包，可使用“添加作物”创建农场草稿。</p>
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
            <p class="admin-hint">阶段区间按周期与作物模型包顺序等分，仅作为可编辑的推导默认排期。</p>
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
              <div><dt>作物模型包</dt><dd>{{ preview.cropPackVersion || '—' }}</dd></div>
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
          <div class="g-modal-header"><div><small>作物模型包详情 · {{ selectedPack.cropCode }}</small><h3 id="admin-pack-detail-title">{{ selectedPack.identity?.name || '—' }}</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭" @click="closePackDetail"><app-icon name="close"></app-icon></button></div>
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
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" :disabled="busy" @click="closePackDetail">关闭</button><template v-if="selectedPack.farmId === farmId && String(selectedPack.status || '').toUpperCase() !== 'ACTIVE'"><button type="button" class="g-btn secondary" :disabled="busy" @click="openPackEdit(selectedPack)">编辑草稿</button><button type="button" class="g-btn secondary" :disabled="busy" @click="validateSelectedPack">校验草稿</button><button type="button" class="g-btn primary" :disabled="busy" @click="activateSelectedPack">启用作物包</button></template></div>
        </section>
      </div>

      <div v-if="showPackCreate" class="g-modal-overlay admin-work-dialog-overlay" @click.self="closePackCreate">
        <form class="g-modal admin-work-data-dialog admin-pack-create-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-pack-create-title" @submit="submitPackCreate">
          <div class="g-modal-header"><div><small>当前农场 · {{ packCreateMode === 'EDIT' ? '编辑草稿' : '新建草稿' }}</small><h3 id="admin-pack-create-title">添加作物</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭" @click="closePackCreate"><app-icon name="close"></app-icon></button></div>
          <div class="admin-pack-wizard-steps"><button v-for="step in [{n:1,label:'基础信息'},{n:2,label:'生长阶段'},{n:3,label:'告警规则'},{n:4,label:'任务模板'},{n:5,label:'知识与预览'}]" :key="step.n" type="button" :class="{active: packWizardStep === step.n, done: packWizardStep > step.n}" @click="packWizardStep = step.n"><span>{{ step.n }}</span>{{ step.label }}</button></div>
          <div class="g-modal-body admin-pack-wizard-body">
            <section v-if="packWizardStep === 1" class="admin-pack-wizard-panel"><h4>基础信息</h4><p>先建立当前农场专属的作物身份和版本。</p><div class="admin-form-grid"><label><span>作物编号</span><input v-model.trim="packForm.cropCode" pattern="[a-z0-9_-]{2,64}" placeholder="例如 basil"></label><label><span>版本</span><input v-model.trim="packForm.version" placeholder="1.0.0"></label><label><span>名称</span><input v-model.trim="packForm.name" placeholder="作物名称"></label><label><span>品种</span><input v-model.trim="packForm.variety" placeholder="品种"></label><label><span>地区</span><input v-model.trim="packForm.region" placeholder="地区"></label></div></section>
            <section v-else-if="packWizardStep === 2" class="admin-pack-wizard-panel"><div class="admin-pack-wizard-panel-head"><div><h4>生长阶段与目标</h4><p>阶段顺序必须递增；目标区间将用于预测和告警规则。</p></div><button type="button" class="g-btn secondary compact" @click="addStage"><app-icon name="add"></app-icon>添加阶段</button></div><div class="admin-pack-repeat-list"><article v-for="(stage, index) in packForm.stages" :key="index" class="admin-pack-repeat-card"><div class="admin-pack-repeat-head"><strong>阶段 {{ index + 1 }}</strong><button type="button" class="g-btn icon-only compact" :disabled="packForm.stages.length <= 1" aria-label="删除阶段" @click="removeStage(index)"><app-icon name="delete"></app-icon></button></div><div class="admin-form-grid"><label><span>阶段编号</span><input v-model.trim="stage.code" placeholder="seedling"></label><label><span>阶段名称</span><input v-model.trim="stage.label" placeholder="苗期"></label><label><span>顺序</span><input v-model.number="stage.sequence" type="number" min="1"></label><label><span>湿度下限 (%)</span><input v-model.number="stage.target.SOIL_MOISTURE.low" type="number" min="0" max="100"></label><label><span>湿度上限 (%)</span><input v-model.number="stage.target.SOIL_MOISTURE.high" type="number" min="0" max="100"></label></div></article></div></section>
            <section v-else-if="packWizardStep === 3" class="admin-pack-wizard-panel"><div class="admin-pack-wizard-panel-head"><div><h4>告警规则</h4><p>规则只用于确定性判断，启用前会校验阈值和引用。</p></div><button type="button" class="g-btn secondary compact" @click="addRule"><app-icon name="add"></app-icon>添加规则</button></div><div class="admin-pack-repeat-list"><article v-for="(rule, index) in packForm.rules" :key="index" class="admin-pack-repeat-card"><div class="admin-pack-repeat-head"><strong>规则 {{ index + 1 }}</strong><button type="button" class="g-btn icon-only compact" aria-label="删除规则" @click="removeRule(index)"><app-icon name="delete"></app-icon></button></div><div class="admin-form-grid"><label><span>规则编号</span><input v-model.trim="rule.code" placeholder="soil-moisture-low"></label><label><span>指标</span><select v-model="rule.metric"><option value="SOIL_MOISTURE">土壤湿度</option><option value="AIR_TEMPERATURE">空气温度</option><option value="AIR_HUMIDITY">空气湿度</option><option value="LIGHT">光照强度</option></select></label><label><span>运算</span><select v-model="rule.operator"><option value="LT">低于</option><option value="LTE">不高于</option><option value="GT">高于</option><option value="GTE">不低于</option></select></label><label><span>阈值</span><input v-model.number="rule.threshold" type="number"></label><label><span>持续分钟</span><input v-model.number="rule.durationMinutes" type="number" min="0"></label><label><span>冷却分钟</span><input v-model.number="rule.cooldownMinutes" type="number" min="0"></label></div></article></div></section>
            <section v-else-if="packWizardStep === 4" class="admin-pack-wizard-panel"><div class="admin-pack-wizard-panel-head"><div><h4>农务任务模板</h4><p>定义告警或阶段触发后的人工任务建议。</p></div><button type="button" class="g-btn secondary compact" @click="addTaskTemplate"><app-icon name="add"></app-icon>添加模板</button></div><div class="admin-pack-repeat-list"><article v-for="(task, index) in packForm.taskTemplates" :key="index" class="admin-pack-repeat-card"><div class="admin-pack-repeat-head"><strong>模板 {{ index + 1 }}</strong><button type="button" class="g-btn icon-only compact" aria-label="删除模板" @click="removeTaskTemplate(index)"><app-icon name="delete"></app-icon></button></div><div class="admin-form-grid"><label><span>任务类型</span><select v-model="task.actionType"><option value="INSPECTION">现场巡田</option><option value="IRRIGATION_CHECK">灌溉巡检</option><option value="FERTILIZATION">施肥检查</option></select></label><label><span>优先级</span><select v-model="task.priority"><option value="LOW">低</option><option value="MEDIUM">中</option><option value="HIGH">高</option></select></label><label><span>建议周期（天）</span><input v-model.number="task.intervalDays" type="number" min="1"></label></div></article></div></section>
            <section v-else class="admin-pack-wizard-panel"><div class="admin-pack-wizard-panel-head"><div><h4>知识文档与预览</h4><p>知识只作为解释证据，模型不会据此越过规则和人工确认。</p></div><button type="button" class="g-btn secondary compact" @click="addKnowledge"><app-icon name="add"></app-icon>添加文档</button></div><div class="admin-pack-repeat-list"><article v-for="(doc, index) in packForm.knowledge" :key="index" class="admin-pack-repeat-card"><div class="admin-pack-repeat-head"><strong>文档 {{ index + 1 }}</strong><button type="button" class="g-btn icon-only compact" :disabled="packForm.knowledge.length <= 1" aria-label="删除文档" @click="removeKnowledge(index)"><app-icon name="delete"></app-icon></button></div><label><span>标题</span><input v-model.trim="doc.title" placeholder="阶段管理要点"></label><label><span>内容</span><textarea v-model="doc.content" rows="3" placeholder="填写该作物的管理知识和证据边界"></textarea></label></article></div><div class="admin-pack-preview"><strong>{{ packForm.name || '未命名作物' }} · v{{ packForm.version || '—' }}</strong><span>{{ packForm.stages.length }} 个阶段 · {{ packForm.rules.length }} 条规则 · {{ packForm.taskTemplates.length }} 个任务模板</span></div></section>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" :disabled="busy" @click="closePackCreate">取消</button><button v-if="packWizardStep > 1" type="button" class="g-btn secondary" :disabled="busy" @click="previousPackStep">上一步</button><button v-if="packWizardStep < 5" type="button" class="g-btn primary" :disabled="busy" @click="nextPackStep">下一步</button><button v-else type="submit" class="g-btn primary" :disabled="busy">{{ busy ? '保存中…' : '保存草稿' }}</button></div>
        </form>
      </div>
    </section>
  `
};
