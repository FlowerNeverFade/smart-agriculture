import { api } from './api.js';
import {
  adminWorkActionMeta,
  adminWorkAttentionSummary,
  adminWorkLifecycleSummary,
  managerSummaryTarget,
  normalizeAdminWorkActionType,
  normalizeAdminWorkStatus,
  normalizeWorkSummaryScope,
  workOrderMatchesAttention,
  workOrderMatchesSummaryScope
} from './admin-state.js';
import { roleCan } from './roles.js';

const { ref, computed, watch, inject, nextTick, onMounted, onBeforeUnmount } = Vue;

const STATUS_META = Object.freeze({
  OPEN: { label: '待分配', tone: 'warning', step: '还没有负责人' },
  ASSIGNED: { label: '待执行', tone: 'info', step: '等待农户开始' },
  IN_PROGRESS: { label: '进行中', tone: 'info', step: '农户正在处理' },
  SUBMITTED: { label: '待验收', tone: 'review', step: '等待管理员验收' },
  REJECTED: { label: '需返工', tone: 'danger', step: '请按退回意见处理' },
  DONE: { label: '已完成', tone: 'success', step: '任务已验收' },
  CANCELLED: { label: '已取消', tone: 'muted', step: '任务不再执行' }
});

const TERMINAL_STATUSES = new Set(['DONE', 'CANCELLED']);
const TYPE_ORDER = Object.freeze(['INSPECTION', 'FIELD_INSPECTION', 'FIELD_OPERATION', 'IRRIGATION_REVIEW', 'IRRIGATION_CHECK', 'DEVICE_CHECK', 'FERTILIZATION']);
const INSPECTION_LABELS = Object.freeze({
  soil: { NORMAL: '正常', DRY: '干燥或开裂', WET: '过湿或积水' },
  crop: { NORMAL: '长势正常', LEAF_SLIGHT_WILT: '叶片轻微萎蔫', DISEASE_SUSPECTED: '疑似病害' },
  device: { NORMAL: '外观完好', LOOSE: '接头松动', LEAKING: '管线渗漏', OFFLINE: '离线或无显示' }
});

function workStatus(value) {
  return normalizeAdminWorkStatus(value);
}

function sourceCode(value) {
  return String(value || '').trim().toUpperCase();
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
    notes: '',
    photos: []
  };
}

export const WorkOrderLifecycleView = {
  props: ['state', 'routeParams', 'embedded'],
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
    const isEmbeddedManager = computed(() => Boolean(props.embedded) && canManage.value);
    const isLiveSession = computed(() => props.state.sessionMode === 'live');
    const isBusy = ref(false);
    const memberLoading = ref(false);
    const memberLoadError = ref('');
    const inspectionLoading = ref(false);
    const inspectionLoadError = ref('');
    const statusFilter = ref(canManage.value ? '' : 'ACTIVE');
    const scopeFilter = ref(normalizeWorkSummaryScope(props.routeParams?.scope));
    const actionTypeFilter = ref('');
    const attentionFilter = ref('');
    const sourceFilter = ref('');
    const plotFilter = ref('');
    const assigneeFilter = ref('');
    const keyword = ref('');
    const showDetailModal = ref(false);
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
      return orders.filter((order) => {
        if (order.assigneeId === currentActorId.value) return true;
        // A farmer must be able to track an evidence request they created
        // before it is assigned.  The backend applies the same rule in
        // GET /work-orders; keeping it here prevents the shared workbench
        // from hiding a record that the farmer.html workspace can already
        // read.
        const createdByFarmer = order.createdBy === currentActorId.value;
        const evidenceRequest = String(order.sourceType || '').toUpperCase() === 'READINESS'
          || String(order.actionType || '').toUpperCase() === 'INSPECTION';
        return createdByFarmer && evidenceRequest;
      });
    });

    const isOverdue = (order) => workOrderMatchesAttention(order, 'OVERDUE');
    const actionTypeMeta = (actionType) => adminWorkActionMeta(actionType);
    const taskTypeOptions = computed(() => {
      const counts = new Map();
      for (const order of scopedOrders.value) {
        const code = normalizeAdminWorkActionType(order?.actionType) || 'UNKNOWN';
        const current = counts.get(code);
        counts.set(code, { count: (current?.count || 0) + 1, raw: current?.raw || String(order?.actionType || '').trim() });
      }
      return [...counts.entries()]
        .map(([code, item]) => ({ ...actionTypeMeta(item.raw), code, count: item.count }))
        .sort((a, b) => {
          const aRank = TYPE_ORDER.indexOf(a.code);
          const bRank = TYPE_ORDER.indexOf(b.code);
          return (aRank < 0 ? TYPE_ORDER.length : aRank) - (bRank < 0 ? TYPE_ORDER.length : bRank) || a.label.localeCompare(b.label, 'zh-CN');
        });
    });
    const sourceOptions = computed(() => {
      const counts = new Map();
      for (const order of scopedOrders.value) {
        const code = sourceCode(order?.sourceType) || 'UNKNOWN';
        counts.set(code, (counts.get(code) || 0) + 1);
      }
      return [...counts.entries()]
        .map(([code, count]) => ({ code, label: sourceLabel(code === 'UNKNOWN' ? '' : code), count }))
        .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
    });

    const filteredOrders = computed(() => scopedOrders.value
      .filter((order) => workOrderMatchesSummaryScope(order, scopeFilter.value))
      .filter((order) => {
        const status = workStatus(order.status);
        // 农户任务界面不展示「待分配」队列，只看已分配给自己的执行项。
        if (isFarmer.value && status === 'OPEN') return false;
        if (statusFilter.value === 'ACTIVE') return !TERMINAL_STATUSES.has(status);
        if (statusFilter.value === 'FINISHED') return TERMINAL_STATUSES.has(status);
        if (statusFilter.value === 'OVERDUE') return isOverdue(order);
        if (statusFilter.value === 'PROGRESSING') return ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'].includes(status);
        return !statusFilter.value || status === statusFilter.value;
      })
      .filter((order) => !actionTypeFilter.value || normalizeAdminWorkActionType(order.actionType) === actionTypeFilter.value)
      .filter((order) => workOrderMatchesAttention(order, attentionFilter.value))
      .filter((order) => !sourceFilter.value || sourceCode(order.sourceType) === sourceFilter.value)
      .filter((order) => !plotFilter.value || order.plotId === plotFilter.value)
      .filter((order) => !assigneeFilter.value || order.assigneeId === assigneeFilter.value)
      .filter((order) => {
        const query = keyword.value.trim().toLowerCase();
        return !query || [order.title, order.reason, order.workOrderId, plotName(order.plotId), farmerName(order), actionTypeMeta(order.actionType).label, sourceLabel(order.sourceType)]
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

    const summary = computed(() => {
      const visibleOrders = scopedOrders.value.filter((order) => !(isFarmer.value && workStatus(order.status) === 'OPEN'));
      const lifecycle = adminWorkLifecycleSummary(visibleOrders);
      return {
        ...lifecycle,
        total: lifecycle.all - lifecycle.finished,
        progressing: lifecycle.assigned + lifecycle.inProgress + lifecycle.rejected,
        overdue: visibleOrders.filter(isOverdue).length
      };
    });
    const attentionSummary = computed(() => adminWorkAttentionSummary(scopedOrders.value));

    const pageTitle = computed(() => canManage.value ? '农务任务' : isFarmer.value ? '我的农务' : '工单审计');
    const pageHint = computed(() => canManage.value
      ? '先分配无人负责的任务，再处理等待验收的结果。'
      : isFarmer.value ? '这里显示分配给你的任务，以及你提交的补证请求。按顺序开始、提交或返工。' : '查看任务状态和操作记录，系统管理员不参与日常执行。');
    const scopeLabel = computed(() => ({
      today: '今日任务',
      overdue: '已逾期',
      unassigned: '待分配',
      approval: '待审批'
    }[scopeFilter.value] || ''));
    const clearSummaryScope = () => emit('navigate', 'work-orders', { tab: 'tasks', farmId: currentFarmId.value });
    const applyStatusFilter = (status) => emit('navigate', 'work-orders', { tab: 'tasks', status, farmId: currentFarmId.value });
    const applySummaryScope = (scope) => {
      const target = managerSummaryTarget(scope, currentFarmId.value);
      if (target) emit('navigate', target.view, target.params);
    };
    const setActionTypeFilter = (actionType) => {
      const normalized = normalizeAdminWorkActionType(actionType);
      actionTypeFilter.value = actionTypeFilter.value === normalized ? '' : normalized;
    };
    const setAttentionFilter = (attention) => {
      const normalized = String(attention || '').trim().toUpperCase();
      const current = scopeFilter.value === 'overdue' ? 'OVERDUE' : attentionFilter.value;
      attentionFilter.value = current === normalized ? '' : normalized;
      if (scopeFilter.value) clearSummaryScope();
    };
    const resetManagerFilters = () => {
      actionTypeFilter.value = '';
      attentionFilter.value = '';
      sourceFilter.value = '';
      plotFilter.value = '';
      assigneeFilter.value = '';
      keyword.value = '';
      clearSummaryScope();
    };
    const hasManagerFilters = computed(() => Boolean(
      scopeFilter.value || statusFilter.value || actionTypeFilter.value || attentionFilter.value || sourceFilter.value || plotFilter.value || assigneeFilter.value || keyword.value
    ));

    const statusMeta = (order) => STATUS_META[workStatus(order?.status)] || { label: '状态未知', tone: 'muted', step: '请联系管理员确认' };
    const priorityLabel = (priority) => ({ HIGH: '高优先级', MEDIUM: '中优先级', LOW: '低优先级' }[String(priority || '').toUpperCase()] || '低优先级');
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

    const openDetail = (order) => {
      if (!canManage.value || !order) return;
      activeOrder.value = order;
      showDetailModal.value = true;
    };

    const closeDetail = () => {
      showDetailModal.value = false;
    };

    const openDetailAction = (action) => {
      const order = activeOrder.value;
      closeDetail();
      if (!order) return;
      if (action === 'assign') openAssign(order);
      if (action === 'review') openReview(order);
      if (action === 'cancel') openCancel(order);
      if (action === 'decision') emit('navigate', 'decision-console', { farmId: order.farmId || currentFarmId.value, plotId: order.plotId, planId: order.planId || order.sourceRef, traceId: order.traceId, workOrderId: order.workOrderId });
    };

    const openDetailFromKeyboard = (event, order) => {
      if (!canManage.value || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openDetail(order);
    };

    const closeActiveDialogOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (showDetailModal.value) closeDetail();
      else if (showTaskModal.value) showTaskModal.value = false;
      else if (showAssignModal.value) showAssignModal.value = false;
      else if (showSubmitModal.value) showSubmitModal.value = false;
      else if (showReviewModal.value) showReviewModal.value = false;
      else if (showCancelModal.value) showCancelModal.value = false;
      else if (showInspectionModal.value) showInspectionModal.value = false;
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
        const results = await Promise.allSettled(plotIds.map((plotId) => api.getInspections(plotId)));
        const rejected = results.filter((result) => result.status === 'rejected');
        const records = Array.from(new Map(results
          .filter((result) => result.status === 'fulfilled')
          .flatMap((result) => result.value || [])
          .map((record) => [record.inspectionId, record])).values())
          .sort((a, b) => new Date(b.observedAt || b.createdAt || 0) - new Date(a.observedAt || a.createdAt || 0));
        props.state.inspections.splice(0, props.state.inspections.length, ...records);
        if (rejected.length && !records.length) throw rejected[0].reason;
        if (rejected.length) inspectionLoadError.value = `${rejected.length} 个地块的巡田记录暂不可用`;
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

    const onInspectionPhotos = (event) => {
      inspectionForm.value = { ...inspectionForm.value, photos: Array.from(event.target.files || []).slice(0, 6) };
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
        }, draft.photos);
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

    watch(() => props.routeParams, (params, previousParams) => {
      const nextScope = normalizeWorkSummaryScope(params?.scope);
      const previousScope = normalizeWorkSummaryScope(previousParams?.scope);
      scopeFilter.value = nextScope;
      if (nextScope && nextScope !== previousScope) {
        actionTypeFilter.value = '';
        attentionFilter.value = '';
        sourceFilter.value = '';
        plotFilter.value = '';
        assigneeFilter.value = '';
        keyword.value = '';
      }
      if (params?.openCreateTask && canManage.value) openCreate(params.plotId || '');
      if (params?.status && [...Object.keys(STATUS_META), 'ACTIVE', 'FINISHED', 'OVERDUE', 'PROGRESSING'].includes(String(params.status).toUpperCase())) {
        const nextStatus = String(params.status).toUpperCase();
        statusFilter.value = (isFarmer.value && nextStatus === 'OPEN') ? 'ACTIVE' : nextStatus;
      } else {
        statusFilter.value = canManage.value || nextScope === 'today' ? '' : 'ACTIVE';
      }
      if (params?.highlight) focusHighlightedTask(params.highlight);
    }, { immediate: true, deep: true });

    watch(currentFarmId, (farmId, previousFarmId) => {
      if (!previousFarmId || farmId === previousFarmId) return;
      showDetailModal.value = false;
      showTaskModal.value = false;
      showAssignModal.value = false;
      showSubmitModal.value = false;
      showReviewModal.value = false;
      showCancelModal.value = false;
      showInspectionModal.value = false;
      activeOrder.value = null;
      actionTypeFilter.value = '';
      attentionFilter.value = '';
      sourceFilter.value = '';
      plotFilter.value = '';
      assigneeFilter.value = '';
      keyword.value = '';
    });

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

    onMounted(() => document.addEventListener('keydown', closeActiveDialogOnEscape));
    onBeforeUnmount(() => document.removeEventListener('keydown', closeActiveDialogOnEscape));

    return {
      role, canManage, canInspect, isFarmer, isAuditor, isEmbeddedManager, isLiveSession, isBusy, memberLoading, memberLoadError, inspectionLoading, inspectionLoadError,
      statusFilter, scopeFilter, scopeLabel, actionTypeFilter, attentionFilter, sourceFilter, plotFilter, assigneeFilter, keyword,
      scopedOrders, filteredOrders, summary, attentionSummary, taskTypeOptions, sourceOptions, hasManagerFilters,
      pageTitle, pageHint, statusMeta, priorityLabel, sourceLabel, actionLabel, actionTypeMeta, plotName, farmerName, eligibleFarmers, assignmentMemberLabel,
      inspections, recentInspections, relatedInspections, eligibleInspectionOrders, inspectionOperatorName, inspectionObservationLabel, inspectionTaskName,
      isOverdue, formatTime, workStatus, TERMINAL_STATUSES,
      showDetailModal, showTaskModal, showAssignModal, showSubmitModal, showReviewModal, showCancelModal, showInspectionModal,
      activeOrder, assignment, submission, review, cancellation, taskForm, inspectionForm,
      openCreate, createTask, openAssign, refreshFarmMembers, assignTask, startTask, openSubmit, submitResult, openReview, reviewTask, openCancel, cancelTask,
      openDetail, closeDetail, openDetailAction, openDetailFromKeyboard,
      clearSummaryScope, applyStatusFilter, applySummaryScope, setActionTypeFilter, setAttentionFilter, resetManagerFilters,
      loadInspections, openInspection, onInspectionPhotos, submitInspection
    };
  },
  template: `
    <section class="work-lifecycle" :class="{ 'is-embedded-manager': isEmbeddedManager }"
      :aria-labelledby="isEmbeddedManager ? null : 'work-lifecycle-title'"
      :aria-label="isEmbeddedManager ? '任务列表' : null">
      <header class="work-lifecycle-header" :class="{ 'is-actions-only': isEmbeddedManager }">
        <div v-if="!isEmbeddedManager">
          <p class="work-lifecycle-kicker">农务工单</p>
          <h1 id="work-lifecycle-title">{{ pageTitle }}</h1>
          <p>{{ pageHint }}</p>
        </div>
        <div class="work-lifecycle-actions">
          <button v-if="canInspect" type="button" class="g-btn secondary" @click="openInspection()"><app-icon name="fact_check"></app-icon>录入巡田证据</button>
          <button v-if="canManage" type="button" class="g-btn primary" @click="openCreate()"><app-icon name="add_task"></app-icon>创建任务</button>
        </div>
      </header>

      <section v-if="canManage" class="work-queue-section" aria-labelledby="work-queue-title">
        <header class="work-queue-heading">
          <div><strong id="work-queue-title">任务进度</strong><span>每项任务只归入一个执行阶段</span></div>
          <button type="button" class="work-all-tasks" :class="{ 'is-active': !hasManagerFilters }" @click="resetManagerFilters">
            <span>全部任务</span><b>{{ summary.all }}</b>
          </button>
        </header>
        <div class="work-summary is-lifecycle-summary" aria-label="任务生命周期">
          <button type="button" data-status="open" :class="{ 'is-active': statusFilter === 'OPEN' && !scopeFilter }" @click="applyStatusFilter('OPEN')"><span>待分配</span><strong>{{ summary.open }}</strong></button>
          <button type="button" data-status="assigned" :class="{ 'is-active': statusFilter === 'ASSIGNED' && !scopeFilter }" @click="applyStatusFilter('ASSIGNED')"><span>待执行</span><strong>{{ summary.assigned }}</strong></button>
          <button type="button" data-status="in-progress" :class="{ 'is-active': statusFilter === 'IN_PROGRESS' && !scopeFilter }" @click="applyStatusFilter('IN_PROGRESS')"><span>执行中</span><strong>{{ summary.inProgress }}</strong></button>
          <button type="button" data-status="submitted" :class="{ 'is-active': statusFilter === 'SUBMITTED' && !scopeFilter }" @click="applyStatusFilter('SUBMITTED')"><span>待验收</span><strong>{{ summary.submitted }}</strong></button>
          <button type="button" data-status="rejected" :class="{ 'is-active': statusFilter === 'REJECTED' && !scopeFilter }" @click="applyStatusFilter('REJECTED')"><span>需返工</span><strong>{{ summary.rejected }}</strong></button>
          <button type="button" data-status="finished" :class="{ 'is-active': statusFilter === 'FINISHED' && !scopeFilter }" @click="applyStatusFilter('FINISHED')"><span>已结束</span><strong>{{ summary.finished }}</strong></button>
        </div>
      </section>

      <div v-else class="work-summary" aria-label="任务概况">
        <button type="button" :class="{ 'is-active': statusFilter === 'ACTIVE' && !scopeFilter }" @click="applyStatusFilter('ACTIVE')"><span>未结束</span><strong>{{ summary.total }}</strong></button>
        <button v-if="!isFarmer" type="button" :class="{ 'is-active': statusFilter === 'OPEN' && !scopeFilter }" @click="applyStatusFilter('OPEN')"><span>待分配</span><strong>{{ summary.open }}</strong></button>
        <button type="button" :class="{ 'is-active': statusFilter === 'SUBMITTED' && !scopeFilter }" @click="applyStatusFilter('SUBMITTED')"><span>待验收</span><strong>{{ summary.submitted }}</strong></button>
        <button type="button" :class="{ 'is-active': statusFilter === 'PROGRESSING' && !scopeFilter }" @click="applyStatusFilter('PROGRESSING')"><span>执行与返工</span><strong>{{ summary.progressing }}</strong></button>
        <button type="button" class="summary-danger" :class="{ 'is-active': scopeFilter === 'overdue' || (statusFilter === 'OVERDUE' && !scopeFilter) }" @click="applySummaryScope('overdue')"><span>已逾期</span><strong>{{ summary.overdue }}</strong></button>
      </div>

      <div v-if="scopeFilter" class="work-route-filter" role="status">
        <span>已从农场总览筛选：<strong>{{ scopeLabel }}</strong></span>
        <button type="button" @click="clearSummaryScope">查看全部任务</button>
      </div>

      <section v-if="canManage" class="work-manager-filters" aria-label="任务分类与筛选">
        <div class="work-filter-group">
          <header><div><strong>任务类型</strong><span>按实际农务划分</span></div></header>
          <div class="work-filter-chips">
            <button type="button" class="work-filter-chip" :class="{ 'is-active': !actionTypeFilter }" :aria-pressed="!actionTypeFilter" @click="actionTypeFilter = ''"><span>全部类型</span><b>{{ summary.all }}</b></button>
            <button v-for="option in taskTypeOptions" :key="option.code" type="button" class="work-filter-chip work-type-filter" :class="['tone-' + option.tone, { 'is-active': actionTypeFilter === option.code }]" :aria-pressed="actionTypeFilter === option.code" @click="setActionTypeFilter(option.code)">
              <app-icon :name="option.icon"></app-icon><span>{{ option.label }}</span><b>{{ option.count }}</b>
            </button>
          </div>
        </div>

        <div class="work-filter-group">
          <header><div><strong>重点关注</strong><span>跨状态查看时间与优先级异常</span></div></header>
          <div class="work-filter-chips">
            <button type="button" class="work-filter-chip attention-overdue" :class="{ 'is-active': scopeFilter === 'overdue' || attentionFilter === 'OVERDUE' }" :aria-pressed="scopeFilter === 'overdue' || attentionFilter === 'OVERDUE'" @click="setAttentionFilter('OVERDUE')"><span>已逾期</span><b>{{ attentionSummary.overdue }}</b></button>
            <button type="button" class="work-filter-chip attention-today" :class="{ 'is-active': attentionFilter === 'DUE_TODAY' }" :aria-pressed="attentionFilter === 'DUE_TODAY'" @click="setAttentionFilter('DUE_TODAY')"><span>今日到期</span><b>{{ attentionSummary.dueToday }}</b></button>
            <button type="button" class="work-filter-chip attention-upcoming" :class="{ 'is-active': attentionFilter === 'UPCOMING' }" :aria-pressed="attentionFilter === 'UPCOMING'" @click="setAttentionFilter('UPCOMING')"><span>未来 7 天</span><b>{{ attentionSummary.upcoming }}</b></button>
            <button type="button" class="work-filter-chip attention-high" :class="{ 'is-active': attentionFilter === 'HIGH' }" :aria-pressed="attentionFilter === 'HIGH'" @click="setAttentionFilter('HIGH')"><span>高优先级</span><b>{{ attentionSummary.high }}</b></button>
          </div>
        </div>

        <div class="work-filters is-manager-controls">
          <label><span>任务来源</span><select class="g-select" v-model="sourceFilter"><option value="">全部来源</option><option v-for="source in sourceOptions" :key="source.code" :value="source.code">{{ source.label }}（{{ source.count }}）</option></select></label>
          <label><span>地块</span><select class="g-select" v-model="plotFilter"><option value="">全部地块</option><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
          <label><span>执行农户</span><select class="g-select" v-model="assigneeFilter"><option value="">全部农户</option><option v-for="member in state.farmMembers.filter(item => item.role === 'FARMER')" :key="member.userId" :value="member.userId">{{ member.displayName || member.username }}</option></select></label>
          <label class="work-search"><span>快速查找</span><input class="g-input" v-model.trim="keyword" placeholder="任务、类型、地块或负责人"></label>
        </div>
        <footer class="work-filter-footer"><span>当前显示 {{ filteredOrders.length }} / {{ summary.all }} 项任务</span><button type="button" :disabled="!hasManagerFilters" @click="resetManagerFilters">清除筛选</button></footer>
      </section>

      <div v-else class="work-filters">
        <label><span>任务状态</span><select class="g-select" v-model="statusFilter">
          <option value="ACTIVE">未结束</option><option value="">全部状态</option><option v-if="!isFarmer" value="OPEN">待分配</option><option value="ASSIGNED">待执行</option><option value="IN_PROGRESS">进行中</option><option value="SUBMITTED">待验收</option><option value="REJECTED">需返工</option><option value="PROGRESSING">执行与返工</option><option value="OVERDUE">已逾期</option><option value="FINISHED">已结束</option>
        </select></label>
        <label><span>地块</span><select class="g-select" v-model="plotFilter"><option value="">全部地块</option><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
        <label class="work-search"><span>快速查找</span><input class="g-input" v-model.trim="keyword" placeholder="任务、地块或负责人"></label>
      </div>

      <div v-if="filteredOrders.length" class="work-order-list" :class="{ 'is-manager-card-grid': canManage }">
        <article v-for="order in filteredOrders" :key="order.workOrderId" class="work-order-card"
          :class="['status-' + workStatus(order.status).toLowerCase(), { 'is-overdue': isOverdue(order), 'is-manager-summary': canManage }]"
          :data-work-order-id="order.workOrderId" :role="canManage ? 'button' : null" :tabindex="canManage ? 0 : null"
          :aria-label="canManage ? '查看任务详情：' + (order.title || '未命名任务') : null"
          @click="canManage && openDetail(order)" @keydown="openDetailFromKeyboard($event, order)">
          <header>
            <div class="work-order-heading">
              <div v-if="canManage" class="work-order-classification">
                <span class="work-type-label" :class="'tone-' + actionTypeMeta(order.actionType).tone"><app-icon :name="actionTypeMeta(order.actionType).icon"></app-icon>{{ actionTypeMeta(order.actionType).label }}</span>
                <div class="work-order-tags"><span class="work-status" :class="'tone-' + statusMeta(order).tone">{{ statusMeta(order).label }}</span><span v-if="isOverdue(order)" class="work-overdue">已逾期</span><span class="work-priority" :class="'priority-' + String(order.priority || 'LOW').toLowerCase()">{{ priorityLabel(order.priority) }}</span></div>
              </div>
              <div v-else class="work-order-tags"><span class="work-status" :class="'tone-' + statusMeta(order).tone">{{ statusMeta(order).label }}</span><span class="work-source">{{ sourceLabel(order.sourceType) }}</span><span v-if="relatedInspections(order).length" class="work-source">巡田证据 {{ relatedInspections(order).length }}</span><span v-if="isOverdue(order)" class="work-overdue">已逾期</span></div>
              <h2>{{ order.title || '未命名任务' }}</h2>
              <p>{{ order.reason || '暂无执行说明' }}</p>
            </div>
            <span v-if="!canManage" class="work-priority" :class="'priority-' + String(order.priority || 'LOW').toLowerCase()">{{ priorityLabel(order.priority) }}</span>
          </header>

          <dl class="work-order-facts">
            <div><dt>地块</dt><dd>{{ plotName(order.plotId) }}</dd></div>
            <div><dt>负责人</dt><dd :class="{ 'needs-owner': !order.assigneeId }">{{ farmerName(order) }}</dd></div>
            <div><dt>截止时间</dt><dd>{{ formatTime(order.dueAt) }}</dd></div>
            <div><dt>下一步</dt><dd>{{ statusMeta(order).step }}</dd></div>
          </dl>

          <div v-if="!canManage && (order.resultSummary || order.rejectionReason)" class="work-result" :class="{ rejected: workStatus(order.status) === 'REJECTED' }">
            <strong>{{ order.rejectionReason ? '退回说明' : '农户提交结果' }}</strong>
            <p>{{ order.rejectionReason || order.resultSummary }}</p>
          </div>

          <footer v-if="!canManage" class="work-order-footer">
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
              <button v-if="String(activeOrder.actionType || '').toUpperCase() === 'IRRIGATION_REVIEW'" type="button" class="g-btn primary compact" @click="openDetailAction('decision')">打开原处方审批</button>
              <button v-if="canManage && !TERMINAL_STATUSES.has(workStatus(order.status))" type="button" class="g-btn secondary compact" @click="openAssign(order)">{{ order.assigneeId ? '重新分配' : '分配农户' }}</button>
              <button v-if="canManage && workStatus(order.status) === 'SUBMITTED'" type="button" class="g-btn primary compact" @click="openReview(order)">验收结果</button>
              <button v-if="canManage && !TERMINAL_STATUSES.has(workStatus(order.status))" type="button" class="g-btn danger-text compact" @click="openCancel(order)">取消</button>
              <button v-if="isFarmer && workStatus(order.status) === 'ASSIGNED'" type="button" class="g-btn primary compact" @click="startTask(order)">开始处理</button>
              <button v-if="isFarmer && workStatus(order.status) === 'IN_PROGRESS'" type="button" class="g-btn secondary compact" @click="openInspection(order)">记录巡田证据</button>
              <button v-if="isFarmer && workStatus(order.status) === 'IN_PROGRESS'" type="button" class="g-btn primary compact" @click="openSubmit(order)">提交结果</button>
              <button v-if="isFarmer && workStatus(order.status) === 'REJECTED'" type="button" class="g-btn primary compact" @click="startTask(order, true)">重新处理</button>
            </div>
          </footer>
          <footer v-else class="work-summary-card-footer">
            <span class="work-card-source">来源 · {{ sourceLabel(order.sourceType) }}<template v-if="relatedInspections(order).length"> · 巡田证据 {{ relatedInspections(order).length }}</template></span>
            <strong>查看详情 <app-icon name="arrow_forward"></app-icon></strong>
          </footer>
        </article>
      </div>
      <div v-else class="work-empty"><app-icon name="task_alt"></app-icon><h2>没有符合条件的任务</h2><p>{{ isFarmer ? '管理员分配任务后会显示在这里。' : '可以调整筛选条件，或创建一项新任务。' }}</p></div>

      <section class="inspection-history" aria-labelledby="inspection-history-title">
        <header>
          <div><p class="work-lifecycle-kicker">人工证据</p><h2 id="inspection-history-title">最近巡田证据</h2><span>人工记录不会覆盖传感器数据，每条都保留人员、时间和关联任务。</span></div>
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
              <span>现场照片：{{ (record.photos || []).length }} 张 · 人工提供</span>
            </div>
            <footer><span>{{ inspectionOperatorName(record) }} · {{ inspectionTaskName(record) }}</span><code>{{ record.inspectionId }}</code></footer>
          </article>
        </div>
        <div v-else-if="!inspectionLoading" class="inspection-empty-state"><app-icon name="fact_check"></app-icon><strong>还没有巡田证据</strong><span>{{ canInspect ? '完成现场核验后，可以在这里保存第一条记录。' : '有权限的农户提交后会显示在这里。' }}</span></div>
      </section>

      <div v-if="showDetailModal && activeOrder" class="g-modal-overlay" @click.self="closeDetail" @keydown.esc="closeDetail">
        <section class="g-modal work-dialog work-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="work-detail-title">
          <div class="g-modal-header">
            <div><small>任务详情 · {{ activeOrder.workOrderId }}</small><h3 id="work-detail-title">{{ activeOrder.title || '未命名任务' }}</h3></div>
            <button type="button" class="g-btn icon-only" @click="closeDetail" aria-label="关闭任务详情"><app-icon name="close"></app-icon></button>
          </div>
          <div class="g-modal-body work-detail-body">
            <div class="work-detail-status-row">
              <div class="work-order-tags"><span class="work-type-label" :class="'tone-' + actionTypeMeta(activeOrder.actionType).tone"><app-icon :name="actionTypeMeta(activeOrder.actionType).icon"></app-icon>{{ actionTypeMeta(activeOrder.actionType).label }}</span><span class="work-status" :class="'tone-' + statusMeta(activeOrder).tone">{{ statusMeta(activeOrder).label }}</span><span class="work-source">来源 · {{ sourceLabel(activeOrder.sourceType) }}</span><span v-if="relatedInspections(activeOrder).length" class="work-source">巡田证据 {{ relatedInspections(activeOrder).length }}</span><span v-if="isOverdue(activeOrder)" class="work-overdue">已逾期</span></div>
              <span class="work-priority" :class="'priority-' + String(activeOrder.priority || 'LOW').toLowerCase()">{{ priorityLabel(activeOrder.priority) }}</span>
            </div>
            <p class="work-detail-reason">{{ activeOrder.reason || '暂无执行说明' }}</p>
            <dl class="work-order-facts work-detail-facts">
              <div><dt>地块</dt><dd>{{ plotName(activeOrder.plotId) }}</dd></div>
              <div><dt>负责人</dt><dd :class="{ 'needs-owner': !activeOrder.assigneeId }">{{ farmerName(activeOrder) }}</dd></div>
              <div><dt>截止时间</dt><dd>{{ formatTime(activeOrder.dueAt) }}</dd></div>
              <div><dt>下一步</dt><dd>{{ statusMeta(activeOrder).step }}</dd></div>
            </dl>
            <div v-if="activeOrder.resultSummary || activeOrder.rejectionReason" class="work-result" :class="{ rejected: workStatus(activeOrder.status) === 'REJECTED' }">
              <strong>{{ activeOrder.rejectionReason ? '退回说明' : '农户提交结果' }}</strong>
              <p>{{ activeOrder.rejectionReason || activeOrder.resultSummary }}</p>
            </div>
            <details class="work-history work-detail-history" open>
              <summary>操作记录 {{ activeOrder.history?.length || 0 }} 条</summary>
              <ol v-if="activeOrder.history?.length">
                <li v-for="(entry, index) in [...activeOrder.history].reverse()" :key="entry.at + '-' + index">
                  <span></span><div><strong>{{ actionLabel(entry.action) }}</strong><small>{{ entry.actorName || entry.actorId || '系统' }} · {{ formatTime(entry.at) }}</small><p v-if="entry.note">{{ entry.note }}</p></div>
                </li>
              </ol>
              <p v-else class="work-history-empty">旧任务暂无操作记录，下一次操作起将自动保存。</p>
            </details>
          </div>
          <div class="g-modal-footer work-detail-footer">
            <div class="work-detail-next"><small>当前下一步</small><strong>{{ statusMeta(activeOrder).step }}</strong></div>
            <div class="work-card-actions">
              <button v-if="!TERMINAL_STATUSES.has(workStatus(activeOrder.status))" type="button" class="g-btn secondary compact" @click="openDetailAction('assign')">{{ activeOrder.assigneeId ? '重新分配' : '分配农户' }}</button>
              <button v-if="workStatus(activeOrder.status) === 'SUBMITTED'" type="button" class="g-btn primary compact" @click="openDetailAction('review')">验收结果</button>
              <button v-if="!TERMINAL_STATUSES.has(workStatus(activeOrder.status))" type="button" class="g-btn danger-text compact" @click="openDetailAction('cancel')">取消</button>
              <button type="button" class="g-btn secondary compact" @click="closeDetail">关闭</button>
            </div>
          </div>
        </section>
      </div>

      <div v-if="showTaskModal" class="g-modal-overlay" @click.self="showTaskModal = false" @keydown.esc="showTaskModal = false">
        <form class="g-modal work-dialog" @submit.prevent="createTask">
          <div class="g-modal-header"><div><small>新建任务</small><h3>创建农务任务</h3></div><button type="button" class="g-btn icon-only" @click="showTaskModal = false" aria-label="关闭"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body work-form-grid">
            <label class="span-2"><span>任务标题</span><input class="g-input" v-model="taskForm.title" maxlength="80" required placeholder="例如：复测 A01 土壤湿度"></label>
            <label><span>地块</span><select class="g-select" v-model="taskForm.plotId" required><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
            <label><span>优先级</span><select class="g-select" v-model="taskForm.priority"><option value="HIGH">高</option><option value="MEDIUM">中</option><option value="LOW">低</option></select></label>
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
          <div class="g-modal-header"><div><small>人工核验 · 人工提供</small><h3>录入巡田证据</h3></div><button type="button" class="g-btn icon-only" @click="showInspectionModal = false" aria-label="关闭"><app-icon name="close"></app-icon></button></div>
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
            <label class="span-2"><span>现场照片（选填，最多 6 张）</span><input type="file" class="g-input" accept="image/jpeg,image/png,image/webp" multiple @change="onInspectionPhotos"><small>按人工提供证据保存，不覆盖遥测。{{ inspectionForm.photos?.length ? '已选 ' + inspectionForm.photos.length + ' 张。' : '' }}</small></label>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" @click="showInspectionModal = false">取消</button><button type="submit" class="g-btn primary" :disabled="isBusy">{{ isBusy ? '正在保存' : '保存巡田证据' }}</button></div>
        </form>
      </div>
    </section>
  `
};
