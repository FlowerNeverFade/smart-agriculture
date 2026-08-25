import { api } from './api.js';
import { roleCan } from './roles.js';

const { ref, computed, watch, inject, nextTick } = Vue;

const STATUS_META = Object.freeze({
  OPEN: { label: '待分配', tone: 'warning', step: '还没有负责人' },
  ASSIGNED: { label: '待执行', tone: 'info', step: '等待农户开始' },
  IN_PROGRESS: { label: '进行中', tone: 'info', step: '农户正在处理' },
  SUBMITTED: { label: '待验收', tone: 'review', step: '等待管理员验收' },
  REJECTED: { label: '需返工', tone: 'danger', step: '请按退回意见处理' },
  DONE: { label: '已完成', tone: 'success', step: '任务已验收' },
  CANCELLED: { label: '已取消', tone: 'muted', step: '任务不再执行' }
});

const STATUS_ALIASES = Object.freeze({ PENDING: 'OPEN', NEW: 'OPEN', CLAIMED: 'ASSIGNED', COMPLETED: 'DONE' });
const TERMINAL_STATUSES = new Set(['DONE', 'CANCELLED']);
const INSPECTION_LABELS = Object.freeze({
  soil: { NORMAL: '正常', DRY: '干燥或开裂', WET: '过湿或积水' },
  crop: { NORMAL: '长势正常', LEAF_SLIGHT_WILT: '叶片轻微萎蔫', DISEASE_SUSPECTED: '疑似病害' },
  device: { NORMAL: '外观完好', LOOSE: '接头松动', LEAKING: '管线渗漏', OFFLINE: '离线或无显示' }
});

function workStatus(value) {
  const status = String(value || 'OPEN').trim().toUpperCase();
  return STATUS_ALIASES[status] || status;
}

function actorId(user) {
  if (user?.userId) return user.userId;
  if (user?.username === 'farmer') return 'user-farmer';
  if (user?.username === 'admin') return 'user-admin';
  if (user?.username === 'sysadmin') return 'user-system';
  return user?.username || '';
}

function localDateTimeInput(hoursFromNow = 2) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function emptyTaskForm(plots, plotId = '') {
  return {
    title: '',
    plotId: plotId || plots?.[0]?.plotId || '',
    priority: 'MEDIUM',
    actionType: 'FIELD_OPERATION',
    dueAt: localDateTimeInput(),
    reason: ''
  };
}

function emptyInspectionForm(plots, plotId = '', workOrderId = '') {
  return {
    plotId: plotId || plots?.[0]?.plotId || '',
    workOrderId,
    observedAt: localDateTimeInput(0),
    soilSurface: 'NORMAL',
    cropCondition: 'NORMAL',
    deviceStatus: 'NORMAL',
    portableSoilMoisture: '',
    notes: ''
  };
}

export const WorkOrderLifecycleView = {
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const role = computed(() => props.state.currentUser?.role || '');
    const currentActorId = computed(() => actorId(props.state.currentUser));
    const currentFarmId = computed(() => props.state.adminContext?.farmId || props.routeParams?.farmId || props.state.currentUser?.farmIds?.find((farmId) => farmId !== '*') ||
      (props.state.sessionMode === 'demo' ? 'farm-demo' : props.state.farms?.[0]?.farmId || ''));
    const canManage = computed(() => roleCan(props.state.currentUser, 'work-order:manage'));
    const canInspect = computed(() => roleCan(props.state.currentUser, 'inspection:create'));
    const isFarmer = computed(() => role.value === 'FARMER');
    const isAuditor = computed(() => role.value === 'SYSTEM_ADMIN');
    const isLiveSession = computed(() => props.state.sessionMode === 'live');
    const isBusy = ref(false);
    const memberLoading = ref(false);
    const memberLoadError = ref('');
    const inspectionLoading = ref(false);
    const inspectionLoadError = ref('');
    const statusFilter = ref('ACTIVE');
    const plotFilter = ref('');
    const assigneeFilter = ref('');
    const keyword = ref('');
    const showTaskModal = ref(false);
    const showAssignModal = ref(false);
    const showSubmitModal = ref(false);
    const showReviewModal = ref(false);
    const showCancelModal = ref(false);
    const showInspectionModal = ref(false);
    const activeOrder = ref(null);
    const assignment = ref({ assigneeId: '', note: '' });
    const submission = ref({ resultSummary: '', evidenceText: '' });
    const review = ref({ note: '' });
    const cancellation = ref({ note: '' });
    const taskForm = ref(emptyTaskForm(props.state.plots));
    const inspectionForm = ref(emptyInspectionForm(props.state.plots));

    const plotName = (plotId) => props.state.plots.find((plot) => plot.plotId === plotId)?.name || plotId || '—';
    const farmerName = (order) => order.assigneeName || props.state.farmMembers.find((member) => member.userId === order.assigneeId)?.displayName || order.assigneeId || '待分配';
    const eligibleFarmers = (order) => props.state.farmMembers.filter((member) => {
      const farmIds = Array.isArray(member?.farmIds) ? member.farmIds : [];
      const plotIds = Array.isArray(member?.plotIds) ? member.plotIds : [];
      return String(member?.role || '').toUpperCase() === 'FARMER' &&
        String(member?.status || '').toUpperCase() === 'ACTIVE' &&
        (farmIds.includes('*') || farmIds.includes(currentFarmId.value)) &&
        (plotIds.includes('*') || plotIds.includes(order?.plotId));
    });
    const memberActiveTaskCount = (userId) => props.state.workOrders.filter((order) =>
      order.assigneeId === userId && !TERMINAL_STATUSES.has(workStatus(order.status))).length;
    const assignmentMemberLabel = (member) => `${member.displayName || member.username} · ${memberActiveTaskCount(member.userId)} 项待办`;
    const inspectionOperatorName = (record) => record.operatorName || props.state.farmMembers.find((member) => member.userId === record.operatorId)?.displayName || record.operatorId || '未记录';
    const inspectionObservationLabel = (group, value) => INSPECTION_LABELS[group]?.[String(value || '').toUpperCase()] || value || '—';
    const inspectionTaskName = (record) => props.state.workOrders.find((order) => order.workOrderId === record.workOrderId)?.title || (record.workOrderId ? `任务 ${record.workOrderId}` : '未关联任务');

    const scopedOrders = computed(() => {
      const orders = Array.isArray(props.state.workOrders) ? props.state.workOrders : [];
      if (!isFarmer.value) return orders;
      return orders.filter((order) => order.assigneeId === currentActorId.value);
    });

    const filteredOrders = computed(() => scopedOrders.value
      .filter((order) => {
        const status = workStatus(order.status);
        if (statusFilter.value === 'ACTIVE') return !TERMINAL_STATUSES.has(status);
        if (statusFilter.value === 'FINISHED') return TERMINAL_STATUSES.has(status);
        return !statusFilter.value || status === statusFilter.value;
      })
      .filter((order) => !plotFilter.value || order.plotId === plotFilter.value)
      .filter((order) => !assigneeFilter.value || order.assigneeId === assigneeFilter.value)
      .filter((order) => {
        const query = keyword.value.trim().toLowerCase();
        return !query || [order.title, order.reason, order.workOrderId, plotName(order.plotId), farmerName(order)]
          .some((value) => String(value || '').toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const priorityRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const statusRank = { SUBMITTED: 7, OPEN: 6, REJECTED: 5, IN_PROGRESS: 4, ASSIGNED: 3, DONE: 2, CANCELLED: 1 };
        return (statusRank[workStatus(b.status)] || 0) - (statusRank[workStatus(a.status)] || 0) ||
          (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0) ||
          new Date(a.dueAt || 0) - new Date(b.dueAt || 0);
      }));

    const inspections = computed(() => (Array.isArray(props.state.inspections) ? props.state.inspections : [])
      .slice()
      .sort((a, b) => new Date(b.observedAt || b.createdAt || 0) - new Date(a.observedAt || a.createdAt || 0)));
    const recentInspections = computed(() => inspections.value.slice(0, 8));
    const relatedInspections = (order) => inspections.value.filter((record) =>
      record.workOrderId === order?.workOrderId || (order?.evidenceRefs || []).includes(record.inspectionId));
    const eligibleInspectionOrders = computed(() => scopedOrders.value.filter((order) => {
      const status = workStatus(order.status);
      if (order.plotId !== inspectionForm.value.plotId || TERMINAL_STATUSES.has(status)) return false;
      return !isFarmer.value || (order.assigneeId === currentActorId.value && status === 'IN_PROGRESS');
    }));

    const isOverdue = (order) => !TERMINAL_STATUSES.has(workStatus(order.status)) && order.dueAt && new Date(order.dueAt).getTime() < Date.now();
    const summary = computed(() => ({
      total: scopedOrders.value.filter((order) => !TERMINAL_STATUSES.has(workStatus(order.status))).length,
      open: scopedOrders.value.filter((order) => workStatus(order.status) === 'OPEN').length,
      progressing: scopedOrders.value.filter((order) => ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'].includes(workStatus(order.status))).length,
      submitted: scopedOrders.value.filter((order) => workStatus(order.status) === 'SUBMITTED').length,
      overdue: scopedOrders.value.filter(isOverdue).length
    }));

    const pageTitle = computed(() => canManage.value ? '农务任务' : isFarmer.value ? '我的农务' : '工单审计');
    const pageHint = computed(() => canManage.value
      ? '先分配无人负责的任务，再处理等待验收的结果。'
      : isFarmer.value ? '这里只显示分配给你的任务，按顺序开始、提交或返工。' : '查看任务状态和操作记录，系统管理员不参与日常执行。');

    const statusMeta = (order) => STATUS_META[workStatus(order?.status)] || { label: '状态未知', tone: 'muted', step: '请联系管理员确认' };
    const priorityLabel = (priority) => ({ HIGH: '紧急', MEDIUM: '中', LOW: '普通' }[priority] || '普通');
    const sourceLabel = (source) => ({ ALERT: '告警转入', CROP_PLAN: '生产计划', READINESS: '补证请求', DEVICE_HEALTH: '设备检查', MANUAL: '人工创建' }[String(source || '').toUpperCase()] || '系统任务');
    const actionLabel = (action) => ({ CREATE: '创建任务', ASSIGN: '分配任务', REASSIGN: '重新分配', START: '开始执行', RESTART: '重新处理', RESUME: '重新处理', EVIDENCE_ADDED: '补充巡田证据', SUBMIT: '提交结果', APPROVE: '验收通过', REJECT: '退回处理', CANCEL: '取消任务' }[String(action || '').toUpperCase()] || '更新任务');
    const formatTime = (value) => {
      if (!value) return '—';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const publishUpdate = (saved) => {
      const index = props.state.workOrders.findIndex((order) => order.workOrderId === saved.workOrderId);
      if (index >= 0) props.state.workOrders.splice(index, 1, { ...props.state.workOrders[index], ...saved });
      else props.state.workOrders.unshift(saved);
      emit('data-invalidated', { type: 'data-invalidated', domains: ['overview', 'workOrders'], farmId: saved.farmId || currentFarmId.value, plotId: saved.plotId || null, reason: 'work-order-updated' });
    };

    const runAction = async (operation, successMessage) => {
      if (isBusy.value) return;
      isBusy.value = true;
      try {
        const saved = await operation();
        publishUpdate(saved);
        toast(successMessage);
        return saved;
      } catch (error) {
        toast(error.message || '任务操作失败，请稍后重试', 'error');
        return null;
      } finally {
        isBusy.value = false;
      }
    };

    const openCreate = (plotId = '') => {
      taskForm.value = emptyTaskForm(props.state.plots, plotId);
      showTaskModal.value = true;
    };

    const createTask = async () => {
      const draft = taskForm.value;
      if (!draft.title.trim() || !draft.plotId || !draft.dueAt || !draft.reason.trim()) {
        toast('请完整填写任务标题、地块、截止时间和执行说明', 'error');
        return;
      }
      const saved = await runAction(() => api.createWorkOrder({
        ...draft,
        title: draft.title.trim(),
        reason: draft.reason.trim(),
        dueAt: new Date(draft.dueAt).toISOString(),
        farmId: currentFarmId.value,
        sourceType: 'MANUAL',
        provenance: 'USER_PROVIDED'
      }), '任务已创建，当前等待分配');
      if (saved) showTaskModal.value = false;
    };

    const syncAssignmentFromMembers = (order) => {
      const eligible = eligibleFarmers(order);
      const preferredId = assignment.value.assigneeId || order?.assigneeId || '';
      assignment.value.assigneeId = eligible.some((member) => member.userId === preferredId)
        ? preferredId
        : eligible[0]?.userId || '';
    };

    const refreshFarmMembers = async (announce = false) => {
      if (!canManage.value || !currentFarmId.value || memberLoading.value) return false;
      memberLoading.value = true;
      memberLoadError.value = '';
      try {
        const loaded = await api.getFarmMembers({ farmId: currentFarmId.value });
        props.state.farmMembers.splice(0, props.state.farmMembers.length, ...loaded);
        if (activeOrder.value) syncAssignmentFromMembers(activeOrder.value);
        if (announce) toast(`已刷新 ${loaded.filter((member) => member.role === 'FARMER').length} 名种植农户`);
        return true;
      } catch (error) {
        memberLoadError.value = error?.message || '成员读取失败';
        if (announce) toast('读取可分配农户失败：' + memberLoadError.value, 'error');
        return false;
      } finally {
        memberLoading.value = false;
      }
    };

    const openAssign = async (order) => {
      activeOrder.value = order;
      assignment.value = { assigneeId: order.assigneeId || '', note: '' };
      syncAssignmentFromMembers(order);
      showAssignModal.value = true;
      await refreshFarmMembers(false);
    };

    const assignTask = async () => {
      if (!assignment.value.assigneeId) {
        toast('这块地暂无可分配农户，请先检查成员的地块权限', 'error');
        return;
      }
      const saved = await runAction(() => api.assignWorkOrder(activeOrder.value.workOrderId, assignment.value), '任务已分配，农户现在可以开始处理');
      if (saved) showAssignModal.value = false;
    };

    const startTask = (order, restart = false) => runAction(
      () => api.transitionWorkOrder(order.workOrderId, { action: restart ? 'RESTART' : 'START', note: restart ? '按退回意见重新处理' : '开始执行任务' }),
      restart ? '任务已重新开始，请按退回意见处理' : '任务已开始'
    );

    const openSubmit = (order) => {
      activeOrder.value = order;
      submission.value = { resultSummary: '', evidenceText: '', inspectionRefs: relatedInspections(order).map((record) => record.inspectionId) };
      showSubmitModal.value = true;
    };

    const submitResult = async () => {
      if (!submission.value.resultSummary.trim()) {
        toast('请用一句话说明处理结果', 'error');
        return;
      }
      const evidenceRefs = Array.from(new Set([
        ...(submission.value.inspectionRefs || []),
        ...submission.value.evidenceText.split('\n').map((item) => item.trim()).filter(Boolean)
      ]));
      const saved = await runAction(() => api.transitionWorkOrder(activeOrder.value.workOrderId, {
        action: 'SUBMIT',
        resultSummary: submission.value.resultSummary.trim(),
        evidenceRefs
      }), '结果已提交，正在等待管理员验收');
      if (saved) showSubmitModal.value = false;
    };

    const openReview = (order) => {
      activeOrder.value = order;
      review.value = { note: '' };
      showReviewModal.value = true;
    };

    const reviewTask = async (action) => {
      if (action === 'REJECT' && !review.value.note.trim()) {
        toast('退回时请说明还需要补做什么', 'error');
        return;
      }
      const saved = await runAction(() => api.reviewWorkOrder(activeOrder.value.workOrderId, { action, note: review.value.note.trim() }), action === 'APPROVE' ? '验收通过，任务已完成' : '任务已退回，农户可以重新处理');
      if (saved) showReviewModal.value = false;
    };

    const openCancel = (order) => {
      activeOrder.value = order;
      cancellation.value = { note: '' };
      showCancelModal.value = true;
    };

    const cancelTask = async () => {
      const saved = await runAction(() => api.transitionWorkOrder(activeOrder.value.workOrderId, { action: 'CANCEL', note: cancellation.value.note.trim() || '管理员确认不再执行' }), '任务已取消');
      if (saved) showCancelModal.value = false;
    };

    const loadInspections = async (announce = false) => {
      if (inspectionLoading.value) return false;
      const plotIds = props.state.plots.map((plot) => plot.plotId).filter(Boolean);
      if (!plotIds.length) {
        props.state.inspections.splice(0, props.state.inspections.length);
        return true;
      }
      inspectionLoading.value = true;
      inspectionLoadError.value = '';
      try {
        const results = await Promise.all(plotIds.map((plotId) => api.getInspections(plotId)));
        const records = Array.from(new Map(results.flat().map((record) => [record.inspectionId, record])).values())
          .sort((a, b) => new Date(b.observedAt || b.createdAt || 0) - new Date(a.observedAt || a.createdAt || 0));
        props.state.inspections.splice(0, props.state.inspections.length, ...records);
        if (announce) toast(`已重新读取 ${records.length} 条巡田证据`);
        return true;
      } catch (error) {
        inspectionLoadError.value = error?.message || '巡田记录读取失败';
        if (announce) toast('刷新巡田证据失败：' + inspectionLoadError.value, 'error');
        return false;
      } finally {
        inspectionLoading.value = false;
      }
    };

    const openInspection = (order = null) => {
      inspectionForm.value = emptyInspectionForm(props.state.plots, order?.plotId || plotFilter.value, order?.workOrderId || '');
      showInspectionModal.value = true;
    };

    const submitInspection = async () => {
      const draft = inspectionForm.value;
      if (!draft.plotId || !draft.observedAt || !draft.soilSurface || !draft.cropCondition || !draft.deviceStatus || !draft.notes.trim()) {
        toast('请完整填写地块、时间、三项现场观察和现场说明', 'error');
        return;
      }
      if (isBusy.value) return;
      isBusy.value = true;
      try {
        const saved = await api.createInspection({
          farmId: currentFarmId.value,
          plotId: draft.plotId,
          ...(draft.workOrderId ? { workOrderId: draft.workOrderId } : {}),
          observedAt: new Date(draft.observedAt).toISOString(),
          soilSurface: draft.soilSurface,
          cropCondition: draft.cropCondition,
          deviceStatus: draft.deviceStatus,
          portableSoilMoisture: draft.portableSoilMoisture === '' ? null : Number(draft.portableSoilMoisture),
          notes: draft.notes.trim()
        });
        const oldIndex = props.state.inspections.findIndex((record) => record.inspectionId === saved.inspectionId);
        if (oldIndex >= 0) props.state.inspections.splice(oldIndex, 1, saved);
        else props.state.inspections.unshift(saved);
        if (draft.workOrderId) {
          const order = props.state.workOrders.find((item) => item.workOrderId === draft.workOrderId);
          if (order) order.evidenceRefs = Array.from(new Set([...(order.evidenceRefs || []), saved.inspectionId]));
          try {
            const refreshed = await api.getWorkOrders({ farmId: currentFarmId.value });
            props.state.workOrders.splice(0, props.state.workOrders.length, ...refreshed);
          } catch (_error) { /* 已保存的巡田记录仍保留，后续刷新会重新读取工单。 */ }
        }
        await loadInspections(false);
        showInspectionModal.value = false;
        inspectionForm.value = emptyInspectionForm(props.state.plots, draft.plotId);
        emit('data-invalidated', { type: 'data-invalidated', domains: ['workOrders'], farmId: currentFarmId.value, plotId: saved.plotId, reason: 'inspection-created' });
        toast(draft.workOrderId ? '巡田证据已保存，并已关联到任务' : '巡田证据已保存，可在下方历史记录中查看');
      } catch (error) {
        toast(error.message || '巡田记录保存失败', 'error');
      } finally {
        isBusy.value = false;
      }
    };

    const focusHighlightedTask = async (orderId) => {
      if (!orderId) return;
      statusFilter.value = '';
      await nextTick();
      const target = document.querySelector(`[data-work-order-id="${CSS.escape(String(orderId))}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.classList.add('is-highlighted');
      window.setTimeout(() => target?.classList.remove('is-highlighted'), 3200);
    };

    watch(() => props.routeParams, (params) => {
      if (params?.openCreateTask && canManage.value) openCreate(params.plotId || '');
      if (params?.status && [...Object.keys(STATUS_META), 'ACTIVE', 'FINISHED'].includes(String(params.status).toUpperCase())) {
        statusFilter.value = String(params.status).toUpperCase();
      }
      if (params?.highlight) focusHighlightedTask(params.highlight);
    }, { immediate: true, deep: true });

    watch(() => props.state.plots.map((plot) => plot.plotId).join('|'), (plotIds) => {
      if (!plotIds) return;
      if (!props.state.plots.some((plot) => plot.plotId === inspectionForm.value.plotId)) {
        inspectionForm.value.plotId = props.state.plots[0]?.plotId || '';
      }
      loadInspections(false);
    }, { immediate: true });

    watch(() => inspectionForm.value.plotId, () => {
      const selected = props.state.workOrders.find((order) => order.workOrderId === inspectionForm.value.workOrderId);
      if (selected && selected.plotId !== inspectionForm.value.plotId) inspectionForm.value.workOrderId = '';
    });

    return {
      role, canManage, canInspect, isFarmer, isAuditor, isLiveSession, isBusy, memberLoading, memberLoadError, inspectionLoading, inspectionLoadError,
      statusFilter, plotFilter, assigneeFilter, keyword, scopedOrders, filteredOrders, summary,
      pageTitle, pageHint, statusMeta, priorityLabel, sourceLabel, actionLabel, plotName, farmerName, eligibleFarmers, assignmentMemberLabel,
      inspections, recentInspections, relatedInspections, eligibleInspectionOrders, inspectionOperatorName, inspectionObservationLabel, inspectionTaskName,
      isOverdue, formatTime, workStatus, TERMINAL_STATUSES,
      showTaskModal, showAssignModal, showSubmitModal, showReviewModal, showCancelModal, showInspectionModal,
      activeOrder, assignment, submission, review, cancellation, taskForm, inspectionForm,
      openCreate, createTask, openAssign, refreshFarmMembers, assignTask, startTask, openSubmit, submitResult, openReview, reviewTask, openCancel, cancelTask,
      loadInspections, openInspection, submitInspection
    };
  },
  template: `
    <section class="work-lifecycle" aria-labelledby="work-lifecycle-title">
      <header class="work-lifecycle-header">
        <div>
          <p class="work-lifecycle-kicker">WORK ORDERS</p>
          <h1 id="work-lifecycle-title">{{ pageTitle }}</h1>
          <p>{{ pageHint }}</p>
        </div>
        <div class="work-lifecycle-actions">
          <button v-if="canInspect" type="button" class="g-btn secondary" @click="openInspection()"><app-icon name="fact_check"></app-icon>录入巡田证据</button>
          <button v-if="canManage" type="button" class="g-btn primary" @click="openCreate()"><app-icon name="add_task"></app-icon>创建任务</button>
        </div>
      </header>

      <div class="work-summary" aria-label="任务概况">
        <button type="button" @click="statusFilter = 'ACTIVE'"><span>未结束</span><strong>{{ summary.total }}</strong></button>
        <button type="button" @click="statusFilter = 'OPEN'"><span>待分配</span><strong>{{ summary.open }}</strong></button>
        <button type="button" @click="statusFilter = 'SUBMITTED'"><span>待验收</span><strong>{{ summary.submitted }}</strong></button>
        <button type="button" @click="statusFilter = 'ACTIVE'"><span>执行与返工</span><strong>{{ summary.progressing }}</strong></button>
        <button type="button" class="summary-danger" @click="statusFilter = 'ACTIVE'"><span>已逾期</span><strong>{{ summary.overdue }}</strong></button>
      </div>

      <div class="work-filters">
        <label><span>任务状态</span><select class="g-select" v-model="statusFilter">
          <option value="ACTIVE">未结束</option><option value="">全部状态</option><option value="OPEN">待分配</option><option value="ASSIGNED">待执行</option><option value="IN_PROGRESS">进行中</option><option value="SUBMITTED">待验收</option><option value="REJECTED">需返工</option><option value="FINISHED">已结束</option>
        </select></label>
        <label><span>地块</span><select class="g-select" v-model="plotFilter"><option value="">全部地块</option><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
        <label v-if="canManage"><span>执行农户</span><select class="g-select" v-model="assigneeFilter"><option value="">全部农户</option><option v-for="member in state.farmMembers.filter(item => item.role === 'FARMER')" :key="member.userId" :value="member.userId">{{ member.displayName || member.username }}</option></select></label>
        <label class="work-search"><span>快速查找</span><input class="g-input" v-model.trim="keyword" placeholder="任务、地块或负责人"></label>
      </div>

      <div v-if="filteredOrders.length" class="work-order-list">
        <article v-for="order in filteredOrders" :key="order.workOrderId" class="work-order-card" :class="['status-' + workStatus(order.status).toLowerCase(), { 'is-overdue': isOverdue(order) }]" :data-work-order-id="order.workOrderId">
          <header>
            <div class="work-order-heading">
              <div class="work-order-tags"><span class="work-status" :class="'tone-' + statusMeta(order).tone">{{ statusMeta(order).label }}</span><span class="work-source">{{ sourceLabel(order.sourceType) }}</span><span v-if="relatedInspections(order).length" class="work-source">巡田证据 {{ relatedInspections(order).length }}</span><span v-if="isOverdue(order)" class="work-overdue">已逾期</span></div>
              <h2>{{ order.title || '未命名任务' }}</h2>
              <p>{{ order.reason || '暂无执行说明' }}</p>
            </div>
            <span class="work-priority" :class="'priority-' + String(order.priority || 'LOW').toLowerCase()">{{ priorityLabel(order.priority) }}</span>
          </header>

          <dl class="work-order-facts">
            <div><dt>地块</dt><dd>{{ plotName(order.plotId) }}</dd></div>
            <div><dt>负责人</dt><dd :class="{ 'needs-owner': !order.assigneeId }">{{ farmerName(order) }}</dd></div>
            <div><dt>截止时间</dt><dd>{{ formatTime(order.dueAt) }}</dd></div>
            <div><dt>下一步</dt><dd>{{ statusMeta(order).step }}</dd></div>
          </dl>

          <div v-if="order.resultSummary || order.rejectionReason" class="work-result" :class="{ rejected: workStatus(order.status) === 'REJECTED' }">
            <strong>{{ order.rejectionReason ? '退回说明' : '农户提交结果' }}</strong>
            <p>{{ order.rejectionReason || order.resultSummary }}</p>
          </div>

          <footer class="work-order-footer">
            <details class="work-history">
              <summary>操作记录 {{ order.history?.length || 0 }} 条</summary>
              <ol v-if="order.history?.length">
                <li v-for="(entry, index) in [...order.history].reverse()" :key="entry.at + '-' + index">
                  <span></span><div><strong>{{ actionLabel(entry.action) }}</strong><small>{{ entry.actorName || entry.actorId || '系统' }} · {{ formatTime(entry.at) }}</small><p v-if="entry.note">{{ entry.note }}</p></div>
                </li>
              </ol>
              <p v-else class="work-history-empty">旧任务暂无操作记录，下一次操作起将自动保存。</p>
            </details>
            <div class="work-card-actions">
              <button v-if="canManage && !TERMINAL_STATUSES.has(workStatus(order.status))" type="button" class="g-btn secondary compact" @click="openAssign(order)">{{ order.assigneeId ? '重新分配' : '分配农户' }}</button>
              <button v-if="canManage && workStatus(order.status) === 'SUBMITTED'" type="button" class="g-btn primary compact" @click="openReview(order)">验收结果</button>
              <button v-if="canManage && !TERMINAL_STATUSES.has(workStatus(order.status))" type="button" class="g-btn danger-text compact" @click="openCancel(order)">取消</button>
              <button v-if="isFarmer && workStatus(order.status) === 'ASSIGNED'" type="button" class="g-btn primary compact" @click="startTask(order)">开始处理</button>
              <button v-if="isFarmer && workStatus(order.status) === 'IN_PROGRESS'" type="button" class="g-btn secondary compact" @click="openInspection(order)">记录巡田证据</button>
              <button v-if="isFarmer && workStatus(order.status) === 'IN_PROGRESS'" type="button" class="g-btn primary compact" @click="openSubmit(order)">提交结果</button>
              <button v-if="isFarmer && workStatus(order.status) === 'REJECTED'" type="button" class="g-btn primary compact" @click="startTask(order, true)">重新处理</button>
            </div>
          </footer>
        </article>
      </div>
      <div v-else class="work-empty"><app-icon name="task_alt"></app-icon><h2>没有符合条件的任务</h2><p>{{ isFarmer ? '管理员分配任务后会显示在这里。' : '可以调整筛选条件，或创建一项新任务。' }}</p></div>

      <section class="inspection-history" aria-labelledby="inspection-history-title">
        <header>
          <div><p class="work-lifecycle-kicker">HUMAN EVIDENCE</p><h2 id="inspection-history-title">最近巡田证据</h2><span>人工记录不会覆盖传感器数据，每条都保留人员、时间和关联任务。</span></div>
          <button type="button" class="g-btn secondary compact" :disabled="inspectionLoading" @click="loadInspections(true)">{{ inspectionLoading ? '读取中' : '刷新记录' }}</button>
        </header>
        <div v-if="inspectionLoadError" class="inspection-load-error"><span>{{ inspectionLoadError }}</span><button type="button" @click="loadInspections(true)">重新读取</button></div>
        <div v-if="recentInspections.length" class="inspection-record-list">
          <article v-for="record in recentInspections" :key="record.inspectionId">
            <header><div><strong>{{ plotName(record.plotId) }}</strong><span>{{ formatTime(record.observedAt) }}</span></div><span class="inspection-provenance">人工记录</span></header>
            <p>{{ record.notes || record.evidenceSummary || '已记录现场情况' }}</p>
            <div class="inspection-observations">
              <span>土壤：{{ inspectionObservationLabel('soil', record.soilSurface) }}</span>
              <span>作物：{{ inspectionObservationLabel('crop', record.cropCondition) }}</span>
              <span>设备：{{ inspectionObservationLabel('device', record.deviceStatus) }}</span>
              <span>便携仪：{{ record.portableSoilMoisture ?? '—' }}{{ record.portableSoilMoisture == null ? '' : '%' }}</span>
            </div>
            <footer><span>{{ inspectionOperatorName(record) }} · {{ inspectionTaskName(record) }}</span><code>{{ record.inspectionId }}</code></footer>
          </article>
        </div>
        <div v-else-if="!inspectionLoading" class="inspection-empty-state"><app-icon name="fact_check"></app-icon><strong>还没有巡田证据</strong><span>{{ canInspect ? '完成现场核验后，可以在这里保存第一条记录。' : '有权限的农户提交后会显示在这里。' }}</span></div>
      </section>

      <div v-if="showTaskModal" class="g-modal-overlay" @click.self="showTaskModal = false" @keydown.esc="showTaskModal = false">
        <form class="g-modal work-dialog" @submit.prevent="createTask">
          <div class="g-modal-header"><div><small>新建任务</small><h3>创建农务任务</h3></div><button type="button" class="g-btn icon-only" @click="showTaskModal = false" aria-label="关闭"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body work-form-grid">
            <label class="span-2"><span>任务标题</span><input class="g-input" v-model="taskForm.title" maxlength="80" required placeholder="例如：复测 A01 土壤湿度"></label>
            <label><span>地块</span><select class="g-select" v-model="taskForm.plotId" required><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
            <label><span>优先级</span><select class="g-select" v-model="taskForm.priority"><option value="HIGH">紧急</option><option value="MEDIUM">中</option><option value="LOW">普通</option></select></label>
            <label><span>任务类型</span><select class="g-select" v-model="taskForm.actionType"><option value="INSPECTION">巡田核验</option><option value="FIELD_OPERATION">田间作业</option><option value="DEVICE_CHECK">设备检查</option><option value="IRRIGATION_REVIEW">灌溉方案审批</option></select></label>
            <label><span>截止时间</span><input type="datetime-local" class="g-input" v-model="taskForm.dueAt" required></label>
            <label class="span-2"><span>执行说明</span><textarea class="g-input" rows="4" v-model="taskForm.reason" required placeholder="用通俗的话说明要做什么，以及怎样算完成"></textarea></label>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" @click="showTaskModal = false">取消</button><button type="submit" class="g-btn primary" :disabled="isBusy">创建并进入待分配</button></div>
        </form>
      </div>

      <div v-if="showAssignModal" class="g-modal-overlay" @click.self="showAssignModal = false" @keydown.esc="showAssignModal = false">
        <form class="g-modal work-dialog work-dialog-small" @submit.prevent="assignTask">
          <div class="g-modal-header"><div><small>{{ activeOrder?.assigneeId ? '调整负责人' : '分配任务' }}</small><h3>{{ activeOrder?.title }}</h3></div><button type="button" class="g-btn icon-only" @click="showAssignModal = false" aria-label="关闭"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body work-form-stack">
            <div class="work-member-source">
              <p>{{ isLiveSession ? '人员来自当前农场正式账号，并已按这块地的权限筛选。' : '当前使用明确标记的演示成员。' }}</p>
              <button type="button" class="g-btn secondary compact" :disabled="memberLoading" @click="refreshFarmMembers(true)">{{ memberLoading ? '读取中' : '刷新人员' }}</button>
            </div>
            <label><span>种植农户</span><select class="g-select" v-model="assignment.assigneeId" required :disabled="memberLoading"><option value="" disabled>{{ memberLoading ? '正在读取成员' : '请选择' }}</option><option v-for="member in eligibleFarmers(activeOrder)" :key="member.userId" :value="member.userId">{{ assignmentMemberLabel(member) }}</option></select><small v-if="memberLoadError">成员刷新失败：{{ memberLoadError }}</small><small v-else-if="!memberLoading && !eligibleFarmers(activeOrder).length">暂无拥有该地块权限的活跃农户。</small></label>
            <label><span>分配说明（选填）</span><textarea class="g-input" rows="3" v-model="assignment.note" placeholder="例如：请在中午前完成复测"></textarea></label>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" @click="showAssignModal = false">取消</button><button type="submit" class="g-btn primary" :disabled="isBusy || memberLoading || !assignment.assigneeId">确认分配</button></div>
        </form>
      </div>

      <div v-if="showSubmitModal" class="g-modal-overlay" @click.self="showSubmitModal = false" @keydown.esc="showSubmitModal = false">
        <form class="g-modal work-dialog work-dialog-small" @submit.prevent="submitResult">
          <div class="g-modal-header"><div><small>提交处理结果</small><h3>{{ activeOrder?.title }}</h3></div><button type="button" class="g-btn icon-only" @click="showSubmitModal = false" aria-label="关闭"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body work-form-stack">
            <label><span>处理结果</span><textarea class="g-input" rows="4" v-model="submission.resultSummary" required placeholder="例如：已复测三处，湿度分别为 21%、22%、21.5%"></textarea></label>
            <div v-if="relatedInspections(activeOrder).length" class="inspection-evidence-picker"><strong>关联本次巡田记录</strong><label v-for="record in relatedInspections(activeOrder)" :key="record.inspectionId"><input type="checkbox" :value="record.inspectionId" v-model="submission.inspectionRefs"><span><b>{{ formatTime(record.observedAt) }} · {{ record.notes || record.evidenceSummary }}</b><small>{{ record.inspectionId }}</small></span></label></div>
            <label><span>其他证据编号（选填，每行一个）</span><textarea class="g-input" rows="2" v-model="submission.evidenceText" placeholder="例如：设备检修单或其他证据编号"></textarea></label>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" @click="showSubmitModal = false">取消</button><button type="submit" class="g-btn primary" :disabled="isBusy">提交给管理员验收</button></div>
        </form>
      </div>

      <div v-if="showReviewModal" class="g-modal-overlay" @click.self="showReviewModal = false" @keydown.esc="showReviewModal = false">
        <div class="g-modal work-dialog work-dialog-small">
          <div class="g-modal-header"><div><small>任务验收</small><h3>{{ activeOrder?.title }}</h3></div><button type="button" class="g-btn icon-only" @click="showReviewModal = false" aria-label="关闭"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body work-form-stack"><div class="review-result-preview"><strong>农户提交结果</strong><p>{{ activeOrder?.resultSummary || '未填写结果说明' }}</p></div><div v-if="relatedInspections(activeOrder).length" class="review-evidence"><strong>巡田证据 {{ relatedInspections(activeOrder).length }} 条</strong><div v-for="record in relatedInspections(activeOrder)" :key="record.inspectionId"><span>{{ formatTime(record.observedAt) }} · {{ record.notes || record.evidenceSummary }}</span><small>{{ inspectionOperatorName(record) }} · {{ record.inspectionId }}</small></div></div><label><span>验收意见</span><textarea class="g-input" rows="4" v-model="review.note" placeholder="通过时可以选填；退回时请明确说明需要补做什么"></textarea></label></div>
          <div class="g-modal-footer split"><button type="button" class="g-btn secondary" @click="showReviewModal = false">稍后处理</button><div><button type="button" class="g-btn danger-text" :disabled="isBusy" @click="reviewTask('REJECT')">退回处理</button><button type="button" class="g-btn primary" :disabled="isBusy" @click="reviewTask('APPROVE')">验收通过</button></div></div>
        </div>
      </div>

      <div v-if="showCancelModal" class="g-modal-overlay" @click.self="showCancelModal = false" @keydown.esc="showCancelModal = false">
        <form class="g-modal work-dialog work-dialog-small" @submit.prevent="cancelTask">
          <div class="g-modal-header"><div><small>取消任务</small><h3>{{ activeOrder?.title }}</h3></div><button type="button" class="g-btn icon-only" @click="showCancelModal = false" aria-label="关闭"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body work-form-stack"><p class="cancel-warning">取消后任务将停止流转，但操作记录会继续保留。</p><label><span>取消原因（选填）</span><textarea class="g-input" rows="3" v-model="cancellation.note" placeholder="例如：现场情况已通过其他方式处理"></textarea></label></div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" @click="showCancelModal = false">返回</button><button type="submit" class="g-btn danger-text" :disabled="isBusy">确认取消</button></div>
        </form>
      </div>

      <div v-if="showInspectionModal" class="g-modal-overlay" @click.self="showInspectionModal = false" @keydown.esc="showInspectionModal = false">
        <form class="g-modal work-dialog inspection-dialog" @submit.prevent="submitInspection">
          <div class="g-modal-header"><div><small>人工核验 · USER_PROVIDED</small><h3>录入巡田证据</h3></div><button type="button" class="g-btn icon-only" @click="showInspectionModal = false" aria-label="关闭"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body work-form-grid">
            <p class="inspection-guidance span-2">请只记录现场看到或实际测到的情况。保存后会生成唯一证据编号，不会修改传感器原始数据。</p>
            <label><span>地块</span><select class="g-select" v-model="inspectionForm.plotId" required><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
            <label><span>巡田时间</span><input type="datetime-local" class="g-input" v-model="inspectionForm.observedAt" required></label>
            <label class="span-2"><span>关联任务（选填）</span><select class="g-select" v-model="inspectionForm.workOrderId"><option value="">不关联任务</option><option v-for="order in eligibleInspectionOrders" :key="order.workOrderId" :value="order.workOrderId">{{ order.title }} · {{ statusMeta(order).label }}</option></select><small v-if="isFarmer && !eligibleInspectionOrders.length">只有已开始、且分配给你的当前地块任务可以关联；也可以单独保存巡田记录。</small></label>
            <label><span>土壤表层状况</span><select class="g-select" v-model="inspectionForm.soilSurface" required><option value="NORMAL">正常</option><option value="DRY">干燥或开裂</option><option value="WET">过湿或积水</option></select></label>
            <label><span>作物状态</span><select class="g-select" v-model="inspectionForm.cropCondition" required><option value="NORMAL">长势正常</option><option value="LEAF_SLIGHT_WILT">叶片轻微萎蔫</option><option value="DISEASE_SUSPECTED">疑似病害</option></select></label>
            <label><span>设备外观</span><select class="g-select" v-model="inspectionForm.deviceStatus" required><option value="NORMAL">外观完好</option><option value="LOOSE">接头松动</option><option value="LEAKING">管线渗漏</option><option value="OFFLINE">离线或无显示</option></select></label>
            <label><span>便携仪实测含水率（选填）</span><div class="inspection-number"><input type="number" min="0" max="100" step="0.1" class="g-input" v-model="inspectionForm.portableSoilMoisture" placeholder="未测量"><b>%</b></div></label>
            <label class="span-2"><span>现场说明</span><textarea class="g-input" rows="3" v-model="inspectionForm.notes" required placeholder="例如：西侧两垄表层开裂，番茄叶片轻微下垂，阀门外观正常"></textarea></label>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" @click="showInspectionModal = false">取消</button><button type="submit" class="g-btn primary" :disabled="isBusy">{{ isBusy ? '正在保存' : '保存巡田证据' }}</button></div>
        </form>
      </div>
    </section>
  `
};
