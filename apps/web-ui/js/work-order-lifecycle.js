import { api } from './api.js?v=20260902-v5911-zhcn-v1';
import { managerSummaryTarget, normalizeWorkSummaryScope, workOrderMatchesSummaryScope } from './admin-state.js?v=20260902-v5911-zhcn-v1';
import { roleCan } from './roles.js?v=20260902-v5911-zhcn-v1';

const { ref, computed, watch, inject, nextTick, onUnmounted } = Vue;

const STATUS_META = Object.freeze({
  OPEN: { label: '待分配', tone: 'warning', step: '还没有负责人' },
  ASSIGNED: { label: '进行中', tone: 'info', step: '等待农户开始处理' },
  IN_PROGRESS: { label: '进行中', tone: 'info', step: '农户正在处理' },
  SUBMITTED: { label: '待验收', tone: 'review', step: '等待管理员验收' },
  REJECTED: { label: '进行中', tone: 'danger', step: '请按返工要求重新处理' },
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

const EVIDENCE_TYPE_LABELS = Object.freeze({
  FIELD_INSPECTION: '现场巡田',
  RETEST: '传感器复测',
  DEVICE_CHECK: '设备检查'
});

const MANAGER_SECTION_IDS = Object.freeze(['tasks', 'evidence', 'inspections']);

const WORK_ACTION_META = Object.freeze({
  SOWING: { label: '播种', title: '完成播种作业', reason: '按种植计划完成整地、播种并记录实际执行情况。', targetStageCode: 'seedling', targetStageLabel: '苗期' },
  TRANSPLANTING: { label: '移栽', title: '完成移栽作业', reason: '按定植要求完成移栽，检查缓苗和设施状态并记录结果。', targetStageCode: 'vegetative', targetStageLabel: '营养生长期' },
  FERTILIZATION: { label: '施肥', title: '完成施肥作业', reason: '按当前作物阶段完成施肥，记录用量、方式和现场结果。' },
  PEST_CONTROL: { label: '植保', title: '完成植保作业', reason: '按植保要求完成防治，记录药剂、范围和现场结果。' },
  WEEDING: { label: '除草', title: '完成除草作业', reason: '完成地块除草并检查作物周边环境，记录处理结果。' },
  PRUNING: { label: '整枝', title: '完成整枝作业', reason: '按作物阶段完成整枝、打杈或绑蔓，并记录处理结果。' },
  IRRIGATION: { label: '灌溉', title: '完成灌溉作业', reason: '按本次灌溉要求执行并记录用水、设备和现场情况。' },
  HARVEST: { label: '采收', title: '完成采收作业', reason: '按成熟度要求完成采收，记录采收结果和地块收尾情况。', targetStageCode: 'fruiting', targetStageLabel: '采收完成' },
  INSPECTION: { label: '巡田核验', title: '完成巡田核验', reason: '巡查作物、土壤和设施，并提交现场观察与证据。' },
  IRRIGATION_CHECK: { label: '灌溉巡检', title: '检查灌溉需要', reason: '检查土壤、作物需水和灌溉设施，提交是否需要灌溉的结论。' },
  DEVICE_CHECK: { label: '设备检查', title: '完成设备检查', reason: '检查绑定设备、供电、通信和传感器状态，记录异常与处理结果。' },
  FIELD_OPERATION: { label: '田间作业', title: '完成田间作业', reason: '按要求完成田间作业，并清楚记录实际处理结果。' },
  IRRIGATION_REVIEW: { label: '灌溉方案审批', title: '核对灌溉方案', reason: '核对灌溉方案、现场条件与用水安排，并提交审批意见。' }
});

const WORK_ACTION_OPTIONS = Object.freeze([
  'SOWING', 'TRANSPLANTING', 'FERTILIZATION', 'PEST_CONTROL', 'WEEDING', 'PRUNING',
  'IRRIGATION', 'HARVEST', 'INSPECTION', 'IRRIGATION_CHECK', 'DEVICE_CHECK', 'FIELD_OPERATION', 'IRRIGATION_REVIEW'
]);

function workActionType(value) {
  const action = String(value || 'FIELD_OPERATION').trim().toUpperCase().replaceAll('-', '_');
  return ({ SEEDING: 'SOWING', PLANTING: 'SOWING', TRANSPLANT: 'TRANSPLANTING', HARVESTING: 'HARVEST', FIELD_INSPECTION: 'INSPECTION', MANUAL_IRRIGATION: 'IRRIGATION' })[action] || action;
}

function workActionMeta(value) {
  const action = workActionType(value);
  return { code: action, ...(WORK_ACTION_META[action] || { label: String(value || '农务作业'), title: '完成农务作业', reason: '按要求完成农务作业并记录处理结果。' }) };
}

export function workStatus(value) {
  const status = String(value || 'OPEN').trim().toUpperCase();
  return STATUS_ALIASES[status] || status;
}

export function isWorkOrderOverdue(order, now = Date.now()) {
  const status = workStatus(order?.status);
  const dueAt = new Date(order?.dueAt || '').getTime();
  return !TERMINAL_STATUSES.has(status) && status !== 'SUBMITTED' && Number.isFinite(dueAt) && dueAt < now;
}

export function workOrderLane(order, now = Date.now()) {
  const status = workStatus(order?.status);
  if (TERMINAL_STATUSES.has(status)) return 'DONE';
  if (isWorkOrderOverdue(order, now)) return 'OVERDUE';
  if (status === 'OPEN') return 'OPEN';
  if (status === 'SUBMITTED') return 'SUBMITTED';
  return 'IN_PROGRESS';
}

export function isReworkOrder(order) {
  if (workStatus(order?.status) === 'REJECTED' || order?.reworkRequired === true || order?.rejectionReason) return true;
  return (Array.isArray(order?.history) ? order.history : []).some((entry) =>
    ['REJECT', 'RESTART', 'RESUME'].includes(String(entry?.action || '').trim().toUpperCase()));
}

export function isAlertVerificationOrder(order) {
  return String(order?.taskPurpose || '').trim().toUpperCase() === 'ALERT_VERIFICATION';
}

export function isFarmerIssueReport(order) {
  return String(order?.sourceType || '').trim().toUpperCase() === 'FARMER_REPORT';
}

export function chooseWorkOrderAssignee(members, workOrders, order, farmId = '', requireDifferent = false) {
  const currentAssigneeId = String(order?.assigneeId || '');
  const eligible = (Array.isArray(members) ? members : []).filter((member) => {
    const farmIds = Array.isArray(member?.farmIds) ? member.farmIds : [];
    const plotIds = Array.isArray(member?.plotIds) ? member.plotIds : [];
    return String(member?.role || '').toUpperCase() === 'FARMER'
      && String(member?.status || '').toUpperCase() === 'ACTIVE'
      && (!farmId || farmIds.includes('*') || farmIds.includes(farmId))
      && (plotIds.includes('*') || plotIds.includes(order?.plotId));
  });
  const alternatives = eligible.filter((member) => String(member.userId || '') !== currentAssigneeId);
  // Bulk overdue disposition must hand the work to somebody else.  Keep the
  // fallback for ordinary assignment flows, where retaining the current
  // assignee is still a valid choice when no alternative exists.
  const candidates = requireDifferent ? alternatives : (alternatives.length ? alternatives : eligible);
  const ranked = candidates.map((member) => {
    const assigned = (Array.isArray(workOrders) ? workOrders : []).filter((item) => item.assigneeId === member.userId);
    return {
      member,
      activeLoad: assigned.filter((item) => !TERMINAL_STATUSES.has(workStatus(item.status))).length,
      plotExperience: assigned.filter((item) => item.plotId === order?.plotId).length
    };
  }).sort((left, right) => left.activeLoad - right.activeLoad
    || right.plotExperience - left.plotExperience
    || String(left.member.displayName || left.member.username || left.member.userId)
      .localeCompare(String(right.member.displayName || right.member.username || right.member.userId), 'zh-CN'));
  return ranked[0] || null;
}

export function finalizedWorkOrderAssignment(order, response, member, renewedDueAt = '') {
  const responseStatus = String(response?.status || '').trim().toUpperCase();
  const assignedStatus = !responseStatus || ['OPEN', 'PENDING', 'NEW'].includes(responseStatus)
    ? 'ASSIGNED'
    : response.status;
  return {
    ...order,
    ...(response || {}),
    workOrderId: response?.workOrderId || response?.workItemId || order?.workOrderId || order?.workItemId,
    workItemId: response?.workItemId || response?.workOrderId || order?.workItemId || order?.workOrderId,
    status: assignedStatus,
    assigneeId: response?.assigneeId || member?.userId || order?.assigneeId || null,
    assigneeName: response?.assigneeName || member?.displayName || member?.username || order?.assigneeName || null,
    dueAt: renewedDueAt || response?.dueAt || order?.dueAt || null
  };
}

export function overdueRecoveryDueAt(order, now = Date.now()) {
  const hours = ({ HIGH: 4, MEDIUM: 8, LOW: 24 })[String(order?.priority || 'MEDIUM').toUpperCase()] || 8;
  return new Date(now + hours * 60 * 60 * 1000).toISOString();
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
    const showAllInspections = ref(false);
    const activeManagerSection = ref('tasks');
    const lifecycleNow = ref(Date.now());
    const statusFilter = ref('IN_PROGRESS');
    const scopeFilter = ref(normalizeWorkSummaryScope(props.routeParams?.scope));
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
    const showInspectionDetailModal = ref(false);
    const activeOrder = ref(null);
    const activeInspection = ref(null);
    const inspectionDetailTrigger = ref(null);
    const assignment = ref({ assigneeId: '', note: '', dueAt: '' });
    const submission = ref({ resultSummary: '', evidenceText: '' });
    const review = ref({ note: '', verificationResult: 'CONFIRMED_ABNORMAL' });
    const cancellation = ref({ note: '' });
    const taskForm = ref(emptyTaskForm(props.state.plots));
    const inspectionForm = ref(emptyInspectionForm(props.state.plots));
    const selectedOverdueIds = ref(new Set());
    const overdueClock = window.setInterval(() => { lifecycleNow.value = Date.now(); }, 30000);
    onUnmounted(() => window.clearInterval(overdueClock));

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
    const inspectionQualityLabel = (record) => ({ GOOD: '资料完整', INCOMPLETE: '资料待补充' }[String(record?.quality?.status || '').toUpperCase()] || '未评估');
    const inspectionCompletenessLabel = (record) => {
      const completeness = Number(record?.quality?.completeness);
      return Number.isFinite(completeness) ? `${Math.round(Math.min(1, Math.max(0, completeness)) * 100)}%` : '—';
    };
    const inspectionPhotoPreview = (photo) => {
      const value = String(photo?.previewUrl || photo?.url || photo?.downloadUrl || '').trim();
      return /^(?:data:image\/|blob:|https?:\/\/)/i.test(value) ? value : '';
    };
    const inspectionPhotoSize = (photo) => {
      const bytes = Number(photo?.sizeBytes);
      if (!Number.isFinite(bytes) || bytes < 0) return '大小未记录';
      if (bytes < 1024) return `${Math.round(bytes)} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const scopedOrders = computed(() => {
      const orders = Array.isArray(props.state.workOrders) ? props.state.workOrders : [];
      if (!isFarmer.value) return orders;
      return orders.filter((order) => {
        if (isFarmerIssueReport(order)) return false;
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

    const isOverdue = (order) => isWorkOrderOverdue(order, lifecycleNow.value);
    const orderLane = (order) => workOrderLane(order, lifecycleNow.value);

    const filteredOrders = computed(() => scopedOrders.value
      .filter((order) => workOrderMatchesSummaryScope(order, scopeFilter.value))
      .filter((order) => {
        return !statusFilter.value || orderLane(order) === statusFilter.value;
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
    const visibleInspections = computed(() => showAllInspections.value ? inspections.value : recentInspections.value);
    const evidenceRequests = computed(() => scopedOrders.value
      .filter((order) => String(order.sourceType || '').toUpperCase() === 'READINESS')
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    const evidenceTypeLabel = (value) => EVIDENCE_TYPE_LABELS[String(value || 'FIELD_INSPECTION').toUpperCase()] || '补证申请';
    const requesterName = (order) => order.requesterName || props.state.farmMembers.find((member) => member.userId === (order.requesterId || order.createdBy))?.displayName || order.requesterId || order.createdBy || '未记录';
    const relatedInspections = (order) => inspections.value.filter((record) =>
      record.workOrderId === order?.workOrderId || (order?.evidenceRefs || []).includes(record.inspectionId));
    const eligibleInspectionOrders = computed(() => scopedOrders.value.filter((order) => {
      const status = workStatus(order.status);
      if (order.plotId !== inspectionForm.value.plotId || TERMINAL_STATUSES.has(status)) return false;
      return !isFarmer.value || (order.assigneeId === currentActorId.value && status === 'IN_PROGRESS');
    }));

    const summary = computed(() => ({
      progressing: scopedOrders.value.filter((order) => orderLane(order) === 'IN_PROGRESS').length,
      open: scopedOrders.value.filter((order) => orderLane(order) === 'OPEN').length,
      submitted: scopedOrders.value.filter((order) => orderLane(order) === 'SUBMITTED').length,
      overdue: scopedOrders.value.filter((order) => orderLane(order) === 'OVERDUE').length,
      completed: scopedOrders.value.filter((order) => orderLane(order) === 'DONE').length
    }));

    const isOverdueView = computed(() => scopeFilter.value === 'overdue' || statusFilter.value === 'OVERDUE');
    const selectedOverdueOrders = computed(() => filteredOrders.value.filter((order) => selectedOverdueIds.value.has(order.workOrderId)));
    const allVisibleOverdueSelected = computed(() => filteredOrders.value.length > 0
      && filteredOrders.value.every((order) => selectedOverdueIds.value.has(order.workOrderId)));

    const pageTitle = computed(() => canManage.value ? '农务任务' : isFarmer.value ? '我的农务' : '工单审计');
    const pageHint = computed(() => canManage.value
      ? '先分配无人负责的任务，再处理等待验收的结果。'
      : isFarmer.value ? '这里显示分配给你的任务，以及你提交的补证请求。按顺序开始、提交或返工。' : '查看任务状态和操作记录，系统管理员不参与日常执行。');
    const scopeLabel = computed(() => ({
      today: '今日任务',
      overdue: '已逾期',
      unassigned: '待分配',
      approval: '待审批',
      'farmer-reports': '农户问题上报'
    }[scopeFilter.value] || ''));
    const taskFilterParams = (params = {}) => ({
      tab: 'tasks',
      farmId: currentFarmId.value,
      ...params,
      ...(assigneeFilter.value ? { assigneeId: assigneeFilter.value } : {})
    });
    const clearSummaryScope = () => emit('navigate', 'work-orders', taskFilterParams({ status: 'IN_PROGRESS' }));
    const applyStatusFilter = (status) => emit('navigate', 'work-orders', taskFilterParams({ status: status || 'ALL' }));
    const onStatusSelect = () => applyStatusFilter(statusFilter.value);
    const onAssigneeSelect = () => emit('navigate', 'work-orders', taskFilterParams({
      status: statusFilter.value || 'ALL',
      scope: scopeFilter.value || undefined
    }));
    const applySummaryScope = (scope) => {
      const target = managerSummaryTarget(scope, currentFarmId.value);
      if (target) emit('navigate', target.view, target.view === 'work-orders' ? { ...target.params, ...(assigneeFilter.value ? { assigneeId: assigneeFilter.value } : {}) } : target.params);
    };

    const statusMeta = (order) => STATUS_META[workStatus(order?.status)] || { label: '状态未知', tone: 'muted', step: '请联系管理员确认' };
    const priorityLabel = (priority) => ({ HIGH: '紧急', MEDIUM: '中', LOW: '普通' }[priority] || '普通');
    const sourceLabel = (source) => ({ ALERT: '告警转入', CROP_PLAN: '生产计划', READINESS: '补证请求', DEVICE_HEALTH: '设备检查', MANUAL: '人工创建', FARMER_REPORT: '农户问题上报' }[String(source || '').toUpperCase()] || '系统任务');
    const taskTypeLabel = (type) => workActionMeta(type).label;
    const actionLabel = (action) => ({ CREATE: '创建任务', ASSIGN: '分配任务', REASSIGN: '重新分配', START: '开始执行', RESTART: '重新处理', RESUME: '重新处理', EVIDENCE_ADDED: '补充巡田证据', ISSUE_REPORTED: '上报问题', SUBMIT: '提交结果', APPROVE: '验收通过', REJECT: '退回处理', CANCEL: '取消任务' }[String(action || '').toUpperCase()] || '更新任务');
    const formatTime = (value) => {
      if (!value) return '—';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const publishUpdate = (saved) => {
      const index = props.state.workOrders.findIndex((order) => order.workOrderId === saved.workOrderId);
      if (index >= 0) props.state.workOrders.splice(index, 1, { ...props.state.workOrders[index], ...saved });
      else props.state.workOrders.unshift(saved);
      emit('data-invalidated', { type: 'data-invalidated', domains: ['overview', 'workOrders', 'plots', 'inspections'], farmId: saved.farmId || currentFarmId.value, plotId: saved.plotId || null, reason: 'work-order-updated' });
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

    const applyTaskTypePreset = () => {
      const meta = workActionMeta(taskForm.value.actionType);
      taskForm.value.title = meta.title;
      taskForm.value.reason = meta.reason;
    };

    const createTask = async () => {
      const draft = taskForm.value;
      if (!draft.title.trim() || !draft.plotId || !draft.dueAt || !draft.reason.trim()) {
        toast('请完整填写任务标题、地块、截止时间和执行说明', 'error');
        return;
      }
      const saved = await runAction(() => api.createWorkOrder({
        ...draft,
        actionType: workActionType(draft.actionType),
        ...(workActionMeta(draft.actionType).targetStageCode ? {
          targetStageCode: workActionMeta(draft.actionType).targetStageCode,
          targetStageLabel: workActionMeta(draft.actionType).targetStageLabel
        } : {}),
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
      const renewedDueAt = isOverdue(order) ? overdueRecoveryDueAt(order, lifecycleNow.value) : '';
      assignment.value = {
        assigneeId: order.assigneeId || '',
        note: '',
        dueAt: renewedDueAt ? new Date(new Date(renewedDueAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
      };
      syncAssignmentFromMembers(order);
      showAssignModal.value = true;
      await refreshFarmMembers(false);
    };

    const assignTask = async () => {
      if (!assignment.value.assigneeId) {
        toast('这块地暂无可分配农户，请先检查成员的地块权限', 'error');
        return;
      }
      const member = props.state.farmMembers.find((item) => item.userId === assignment.value.assigneeId);
      const renewedDueAt = assignment.value.dueAt ? new Date(assignment.value.dueAt).toISOString() : '';
      const input = { ...assignment.value, ...(renewedDueAt ? { dueAt: renewedDueAt } : {}) };
      const saved = await runAction(async () => finalizedWorkOrderAssignment(
        activeOrder.value,
        await api.assignWorkOrder(activeOrder.value.workOrderId, input),
        member,
        renewedDueAt
      ), activeOrder.value.assigneeId ? '任务已重新分配并进入进行中' : '任务已分配并进入进行中');
      if (saved) showAssignModal.value = false;
    };

    const toggleOverdueSelection = (order) => {
      const next = new Set(selectedOverdueIds.value);
      if (next.has(order.workOrderId)) next.delete(order.workOrderId);
      else next.add(order.workOrderId);
      selectedOverdueIds.value = next;
    };

    const toggleAllOverdue = () => {
      const visibleIds = filteredOrders.value.map((order) => order.workOrderId);
      const next = new Set(selectedOverdueIds.value);
      if (allVisibleOverdueSelected.value) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      selectedOverdueIds.value = next;
    };

    const processOverdueTasks = async (mode = 'DISPOSE') => {
      const targets = selectedOverdueOrders.value.slice();
      if (!targets.length) {
        toast('请先选择需要处置的逾期任务', 'error');
        return;
      }
      if (isBusy.value) return;
      await refreshFarmMembers(false);
      isBusy.value = true;
      let reassigned = 0;
      const failures = [];
      try {
        for (const order of targets) {
          // Both bulk actions are a hand-off: the expired owner's task must be
          // assigned to another eligible, active farmer before it can return to
          // the in-progress lane.  Never silently send it back to the owner.
          const choice = chooseWorkOrderAssignee(
            props.state.farmMembers,
            props.state.workOrders,
            order,
            currentFarmId.value,
            true
          );
          if (!choice) {
            failures.push(`${order.title || order.workOrderId}：没有其他具备该地块权限的在岗农户可接手`);
            continue;
          }
          try {
            const renewedDueAt = overdueRecoveryDueAt(order, lifecycleNow.value);
            const actionLabel = mode === 'REASSIGN' ? '逾期任务重新分配' : '逾期任务处置并转交其他农户';
            const response = await api.assignWorkOrder(order.workOrderId, {
              assigneeId: choice.member.userId,
              dueAt: renewedDueAt,
              note: `${actionLabel}：新处理时限 ${formatTime(renewedDueAt)}，当前进行中任务 ${choice.activeLoad} 项`
            });
            publishUpdate(finalizedWorkOrderAssignment(order, response, choice.member, renewedDueAt));
            reassigned += 1;
          } catch (error) {
            failures.push(`${order.title || order.workOrderId}：${error?.message || '重新分配失败'}`);
          }
        }
        selectedOverdueIds.value = new Set();
        const successLabel = mode === 'REASSIGN' ? '重新分配' : '处置';
        if (reassigned) toast(`已${successLabel} ${reassigned} 项逾期任务并转入进行中${failures.length ? `，${failures.length} 项需人工处理` : ''}`, failures.length ? 'warning' : 'success');
        else toast(failures[0] || '没有可重新分配的逾期任务', 'error');
      } finally {
        isBusy.value = false;
      }
    };

    const autoReassignOverdue = () => processOverdueTasks('REASSIGN');
    const autoDisposeOverdue = () => processOverdueTasks('DISPOSE');

    const autoAssignUnassigned = async () => {
      if (!canManage.value || isBusy.value) return;
      const targets = filteredOrders.value.filter((order) => workStatus(order.status) === 'OPEN' && !order.assigneeId);
      if (!targets.length) {
        toast('当前筛选下没有待分配任务', 'error');
        return;
      }
      await refreshFarmMembers(false);
      isBusy.value = true;
      let assignedCount = 0;
      const failures = [];
      try {
        for (const order of targets) {
          const choice = chooseWorkOrderAssignee(props.state.farmMembers, props.state.workOrders, order, currentFarmId.value);
          if (!choice?.member?.userId) {
            failures.push(`${order.title || order.workOrderId}：没有具备地块权限的在岗农户`);
            continue;
          }
          try {
            const response = await api.assignWorkOrder(order.workOrderId, {
              assigneeId: choice.member.userId,
              note: `农智助手分配：已按地块权限、在岗状态和当前任务负载排序（当前待办 ${choice.activeLoad} 项）`
            });
            publishUpdate(finalizedWorkOrderAssignment(order, response, choice.member));
            assignedCount += 1;
          } catch (error) {
            failures.push(`${order.title || order.workOrderId}：${error?.message || '分配失败'}`);
          }
        }
        if (assignedCount) toast(`农智助手已分配 ${assignedCount} 项任务${failures.length ? `，${failures.length} 项需人工处理` : ''}`, failures.length ? 'warning' : 'success');
        else toast(failures[0] || '没有可分配的任务', 'error');
      } finally {
        isBusy.value = false;
      }
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
      review.value = { note: '', verificationResult: 'CONFIRMED_ABNORMAL' };
      showReviewModal.value = true;
    };

    const resolveApprovedVerification = async (verificationOrder, result) => {
      const alertId = String(verificationOrder?.sourceRef || '');
      if (result === 'CLEARED_NORMAL') {
        const response = await api.closeAlert(alertId);
        const alert = (props.state.alerts || []).find((item) => String(item.alertId || item.id || '') === alertId);
        if (alert) Object.assign(alert, response || {}, { status: 'CLOSED' });
        emit('data-invalidated', {
          type: 'data-invalidated', domains: ['alerts', 'overview'], farmId: currentFarmId.value,
          plotId: verificationOrder.plotId, reason: 'alert-cleared-by-verification'
        });
        return { mode: 'CLOSED' };
      }

      const existingFollowUp = props.state.workOrders.find((order) =>
        order.parentVerificationWorkOrderId === verificationOrder.workOrderId
        || (String(order.taskPurpose || '').toUpperCase() === 'ALERT_FOLLOW_UP'
          && String(order.sourceRef || '') === alertId));
      if (existingFollowUp) return { mode: 'DISPATCHED', task: existingFollowUp };

      const currentMember = eligibleFarmers(verificationOrder).find((member) => member.userId === verificationOrder.assigneeId);
      const choice = currentMember
        ? { member: currentMember }
        : chooseWorkOrderAssignee(props.state.farmMembers, props.state.workOrders, verificationOrder, currentFarmId.value);
      if (!choice?.member?.userId) throw new Error('核查已确认，但没有具备该地块权限的在岗农户，处置任务暂未下发');
      const dueAt = overdueRecoveryDueAt(verificationOrder, Date.now());
      const draft = {
        farmId: currentFarmId.value,
        plotId: verificationOrder.plotId,
        sourceType: 'ALERT',
        sourceRef: alertId,
        actionType: verificationOrder.followUpActionType || 'FIELD_OPERATION',
        taskPurpose: 'ALERT_FOLLOW_UP',
        parentVerificationWorkOrderId: verificationOrder.workOrderId,
        title: String(verificationOrder.title || '告警核查').replace(/^核查[：:]\s*/, '处置：'),
        reason: `现场核查已确认异常。核查结果：${verificationOrder.resultSummary || '已通过管理员确认'}。请按核查证据完成处置。`,
        priority: verificationOrder.priority || 'MEDIUM',
        status: 'OPEN',
        dueAt,
        provenance: props.state.sessionMode === 'demo' ? 'SIMULATED' : 'DERIVED'
      };
      const created = await api.createWorkOrder(draft);
      const taskId = created?.workOrderId || created?.workItemId;
      if (!taskId) throw new Error('核查已确认，但处置任务创建响应缺少任务编号');
      const response = await api.assignWorkOrder(taskId, {
        assigneeId: choice.member.userId,
        dueAt,
        note: `根据核查任务 ${verificationOrder.workOrderId} 的确认结果自动下发`
      });
      const assigned = finalizedWorkOrderAssignment({ ...draft, ...(created || {}), workOrderId: taskId }, response, choice.member, dueAt);
      publishUpdate(assigned);
      return { mode: 'DISPATCHED', task: assigned };
    };

    const reviewTask = async (action) => {
      if (action === 'REJECT' && !review.value.note.trim()) {
        toast('退回时请说明还需要补做什么', 'error');
        return;
      }
      if (isBusy.value) return;
      isBusy.value = true;
      const verificationOrder = activeOrder.value;
      try {
        const isVerification = isAlertVerificationOrder(verificationOrder);
        const verificationResult = review.value.verificationResult;
        const conclusion = verificationResult === 'CLEARED_NORMAL' ? '现场正常，关闭告警' : '确认异常，自动下发处置任务';
        const note = [isVerification && action === 'APPROVE' ? `核查结论：${conclusion}` : '', review.value.note.trim()].filter(Boolean).join('；');
        const saved = await api.reviewWorkOrder(verificationOrder.workOrderId, { action, note, ...(isVerification && action === 'APPROVE' ? { verificationResult } : {}) });
        publishUpdate(saved);
        showReviewModal.value = false;
        if (isVerification && action === 'APPROVE') {
          const resolution = saved?.verificationResolution || await resolveApprovedVerification({ ...verificationOrder, ...saved }, verificationResult);
          toast(resolution.mode === 'CLOSED'
            ? '核查结果已确认正常，原告警已自动关闭'
            : `核查结果已确认，处置任务已自动下发给 ${resolution.task.assigneeName || resolution.task.assigneeId}`);
        } else {
          toast(action === 'APPROVE' ? '验收通过，任务已进入已完成' : '任务已标记返工并重新进入进行中，仍由原农户处理');
        }
      } catch (error) {
        toast(error.message || '任务验收失败，请稍后重试', 'error');
      } finally {
        isBusy.value = false;
      }
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

    const loadInspections = async (announce = false) => {
      if (inspectionLoading.value) return false;
      inspectionLoading.value = true;
      inspectionLoadError.value = '';
      try {
        const scope = isFarmer.value ? {} : (currentFarmId.value ? { farmId: currentFarmId.value } : {});
        const records = Array.from(new Map((await api.getInspections(scope) || [])
          .map((record) => [record.inspectionId, record])).values())
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

    const openInspectionDetail = (record, event = null) => {
      if (!record?.inspectionId) return;
      inspectionDetailTrigger.value = event?.currentTarget || document.activeElement;
      activeInspection.value = record;
      showInspectionDetailModal.value = true;
      nextTick(() => document.querySelector('.inspection-detail-dialog [aria-label="关闭巡田详情"]')?.focus());
    };

    const closeInspectionDetail = () => {
      showInspectionDetailModal.value = false;
      activeInspection.value = null;
      nextTick(() => {
        inspectionDetailTrigger.value?.focus?.();
        inspectionDetailTrigger.value = null;
      });
    };

    const openInspectionDetailFromKeyboard = (event, record) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openInspectionDetail(record, event);
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
        const refreshed = await loadInspections(false);
        showInspectionModal.value = false;
        inspectionForm.value = emptyInspectionForm(props.state.plots, draft.plotId);
        emit('data-invalidated', { type: 'data-invalidated', domains: ['workOrders', 'inspections'], farmId: currentFarmId.value, plotId: saved.plotId, reason: 'inspection-created' });
        if (saved?.photoUploadError) toast(`巡田记录已保存，照片上传失败：${saved.photoUploadError}`, 'warning');
        else if (!refreshed) toast(`巡田记录已保存，但列表刷新失败：${inspectionLoadError.value || '请稍后重试'}`, 'warning');
        else toast(draft.workOrderId ? '巡田证据已保存，并已关联到任务' : '巡田证据已保存，可在下方历史记录中查看');
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

    const setManagerSection = (section) => {
      if (!isEmbeddedManager.value || !MANAGER_SECTION_IDS.includes(section)) return;
      activeManagerSection.value = section;
    };

    const onManagerSectionKeydown = (event, section) => {
      const currentIndex = MANAGER_SECTION_IDS.indexOf(section);
      if (currentIndex < 0) return;
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % MANAGER_SECTION_IDS.length;
      else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + MANAGER_SECTION_IDS.length) % MANAGER_SECTION_IDS.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = MANAGER_SECTION_IDS.length - 1;
      else return;
      event.preventDefault();
      const tabList = event.currentTarget?.closest('[role="tablist"]');
      activeManagerSection.value = MANAGER_SECTION_IDS[nextIndex];
      nextTick(() => tabList?.querySelectorAll('[role="tab"]')?.[nextIndex]?.focus());
    };

    watch(() => props.routeParams, (params) => {
      const nextScope = normalizeWorkSummaryScope(params?.scope);
      if (isEmbeddedManager.value && (params?.scope || params?.status || params?.assigneeId || params?.highlight || params?.openCreateTask)) {
        activeManagerSection.value = 'tasks';
      }
      scopeFilter.value = nextScope;
      const requestedAssignee = String(params?.assigneeId || '').trim();
      const hasLoadedMembers = props.state.farmMembers.length > 0;
      const matchingMember = props.state.farmMembers.find((member) => String(member?.userId || '') === requestedAssignee
        && String(member?.role || '').toUpperCase() === 'FARMER'
        && String(member?.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
        && (() => {
          const farmIds = Array.isArray(member?.farmIds) ? member.farmIds : [];
          return !farmIds.length || farmIds.includes('*') || farmIds.includes(currentFarmId.value);
        })());
      // Live member data can arrive after the route.  Keep the deep-link until
      // it is loaded, then reject stale or cross-role member ids.
      assigneeFilter.value = requestedAssignee && (!hasLoadedMembers || matchingMember) ? requestedAssignee : '';
      if (params?.openCreateTask && canManage.value) openCreate(params.plotId || '');
      const routeStatus = String(params?.status || '').toUpperCase();
      if (routeStatus === 'ALL') {
        statusFilter.value = '';
      } else if (['IN_PROGRESS', 'OPEN', 'SUBMITTED', 'OVERDUE', 'DONE'].includes(routeStatus)) {
        statusFilter.value = routeStatus;
      } else if (requestedAssignee && !nextScope) {
        statusFilter.value = '';
      } else {
        statusFilter.value = ({ overdue: 'OVERDUE', unassigned: 'OPEN', approval: 'SUBMITTED', today: '' }[nextScope] ?? 'IN_PROGRESS');
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

    watch(() => props.state.farmMembers.map((member) => `${member.userId}:${member.status}`).join('|'), () => {
      const requestedAssignee = String(props.routeParams?.assigneeId || '').trim();
      if (!requestedAssignee || !props.state.farmMembers.length) return;
      const matchingMember = props.state.farmMembers.some((member) => String(member?.userId || '') === requestedAssignee
        && String(member?.role || '').toUpperCase() === 'FARMER'
        && String(member?.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
        && (() => {
          const farmIds = Array.isArray(member?.farmIds) ? member.farmIds : [];
          return !farmIds.length || farmIds.includes('*') || farmIds.includes(currentFarmId.value);
        })());
      if (!matchingMember) assigneeFilter.value = '';
    }, { immediate: true });

    watch(() => inspectionForm.value.plotId, () => {
      const selected = props.state.workOrders.find((order) => order.workOrderId === inspectionForm.value.workOrderId);
      if (selected && selected.plotId !== inspectionForm.value.plotId) inspectionForm.value.workOrderId = '';
    });

    watch(() => filteredOrders.value.map((order) => order.workOrderId).join('|'), () => {
      const visible = new Set(filteredOrders.value.map((order) => order.workOrderId));
      selectedOverdueIds.value = new Set([...selectedOverdueIds.value].filter((id) => visible.has(id)));
    });

    return {
      role, canManage, canInspect, isFarmer, isAuditor, isEmbeddedManager, isLiveSession, isBusy, memberLoading, memberLoadError, inspectionLoading, inspectionLoadError,
      activeManagerSection, setManagerSection, onManagerSectionKeydown,
      statusFilter, scopeFilter, scopeLabel, plotFilter, assigneeFilter, keyword, scopedOrders, filteredOrders, summary,
      selectedOverdueIds, selectedOverdueOrders, allVisibleOverdueSelected, isOverdueView,
      pageTitle, pageHint, statusMeta, priorityLabel, sourceLabel, actionLabel, taskTypeLabel, plotName, farmerName, eligibleFarmers, assignmentMemberLabel,
      inspections, recentInspections, visibleInspections, showAllInspections, relatedInspections, eligibleInspectionOrders, inspectionOperatorName, inspectionObservationLabel, inspectionTaskName,
      inspectionQualityLabel, inspectionCompletenessLabel, inspectionPhotoPreview, inspectionPhotoSize,
      evidenceRequests, evidenceTypeLabel, requesterName,
      isOverdue, orderLane, isReworkOrder, isAlertVerificationOrder, isFarmerIssueReport, formatTime, workStatus, TERMINAL_STATUSES,
      showDetailModal, showTaskModal, showAssignModal, showSubmitModal, showReviewModal, showCancelModal, showInspectionModal, showInspectionDetailModal,
      activeOrder, activeInspection, assignment, submission, review, cancellation, taskForm, inspectionForm, WORK_ACTION_OPTIONS,
      openCreate, applyTaskTypePreset, createTask, openAssign, refreshFarmMembers, assignTask, toggleOverdueSelection, toggleAllOverdue, autoReassignOverdue, autoDisposeOverdue, autoAssignUnassigned,
      startTask, openSubmit, submitResult, openReview, reviewTask, openCancel, cancelTask,
      openDetail, closeDetail, openDetailAction, openDetailFromKeyboard,
      clearSummaryScope, applyStatusFilter, applySummaryScope, onStatusSelect, onAssigneeSelect,
      loadInspections, openInspection, onInspectionPhotos, submitInspection, openInspectionDetail, closeInspectionDetail, openInspectionDetailFromKeyboard
    };
  },
  template: `
    <section class="work-lifecycle" :class="{ 'is-embedded-manager': isEmbeddedManager }"
      :aria-labelledby="isEmbeddedManager ? null : 'work-lifecycle-title'"
      :aria-label="isEmbeddedManager ? '任务中心' : null">
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

      <nav v-if="isEmbeddedManager" class="work-manager-section-tabs" role="tablist" aria-label="任务中心内容">
        <button id="manager-section-tab-tasks" type="button" role="tab" aria-controls="manager-section-panel-tasks"
          :aria-selected="activeManagerSection === 'tasks'" :tabindex="activeManagerSection === 'tasks' ? 0 : -1"
          :class="{ active: activeManagerSection === 'tasks' }" @click="setManagerSection('tasks')" @keydown="onManagerSectionKeydown($event, 'tasks')">
          <span>任务列表</span><strong>{{ scopedOrders.length }}</strong>
        </button>
        <button id="manager-section-tab-evidence" type="button" role="tab" aria-controls="manager-section-panel-evidence"
          :aria-selected="activeManagerSection === 'evidence'" :tabindex="activeManagerSection === 'evidence' ? 0 : -1"
          :class="{ active: activeManagerSection === 'evidence' }" @click="setManagerSection('evidence')" @keydown="onManagerSectionKeydown($event, 'evidence')">
          <span>补证申请</span><strong>{{ evidenceRequests.length }}</strong>
        </button>
        <button id="manager-section-tab-inspections" type="button" role="tab" aria-controls="manager-section-panel-inspections"
          :aria-selected="activeManagerSection === 'inspections'" :tabindex="activeManagerSection === 'inspections' ? 0 : -1"
          :class="{ active: activeManagerSection === 'inspections' }" @click="setManagerSection('inspections')" @keydown="onManagerSectionKeydown($event, 'inspections')">
          <span>巡田记录</span><strong>{{ inspections.length }}</strong>
        </button>
      </nav>

      <section id="manager-section-panel-tasks" class="work-section-panel work-task-section"
        v-show="!isEmbeddedManager || activeManagerSection === 'tasks'"
        :role="isEmbeddedManager ? 'tabpanel' : null" :aria-labelledby="isEmbeddedManager ? 'manager-section-tab-tasks' : null">
        <div class="work-summary" aria-label="任务概况">
          <button type="button" :class="{ 'is-active': statusFilter === 'IN_PROGRESS' && !scopeFilter }" @click="applyStatusFilter('IN_PROGRESS')"><span>进行中</span><strong>{{ summary.progressing }}</strong></button>
          <button type="button" :class="{ 'is-active': statusFilter === 'OPEN' && !scopeFilter }" @click="applyStatusFilter('OPEN')"><span>待分配</span><strong>{{ summary.open }}</strong></button>
          <button type="button" :class="{ 'is-active': statusFilter === 'SUBMITTED' && !scopeFilter }" @click="applyStatusFilter('SUBMITTED')"><span>待验收</span><strong>{{ summary.submitted }}</strong></button>
          <button type="button" class="summary-danger" :class="{ 'is-active': scopeFilter === 'overdue' || (statusFilter === 'OVERDUE' && !scopeFilter) }" @click="applySummaryScope('overdue')"><span>已逾期</span><strong>{{ summary.overdue }}</strong></button>
          <button type="button" :class="{ 'is-active': statusFilter === 'DONE' && !scopeFilter }" @click="applyStatusFilter('DONE')"><span>已完成</span><strong>{{ summary.completed }}</strong></button>
        </div>

        <div v-if="scopeFilter" class="work-route-filter" role="status">
          <span>已从农场总览筛选：<strong>{{ scopeLabel }}</strong></span>
          <button type="button" @click="clearSummaryScope">查看全部任务</button>
        </div>

        <div class="work-filters">
          <label><span>任务状态</span><select class="g-select" v-model="statusFilter" @change="onStatusSelect">
            <option value="IN_PROGRESS">进行中</option><option value="OPEN">待分配</option><option value="SUBMITTED">待验收</option><option value="OVERDUE">已逾期</option><option value="DONE">已完成</option><option value="">全部状态</option>
          </select></label>
          <label><span>地块</span><select class="g-select" v-model="plotFilter"><option value="">全部地块</option><option v-for="plot in state.plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
          <label v-if="canManage"><span>执行农户</span><select class="g-select" v-model="assigneeFilter" @change="onAssigneeSelect"><option value="">全部农户</option><option v-for="member in state.farmMembers.filter(item => item.role === 'FARMER')" :key="member.userId" :value="member.userId">{{ member.displayName || member.username }}</option></select></label>
          <label class="work-search"><span>快速查找</span><input class="g-input" v-model.trim="keyword" placeholder="任务、地块或负责人"></label>
        </div>

        <section v-if="canManage && (scopeFilter === 'unassigned' || (statusFilter === 'OPEN' && !scopeFilter))" class="work-unassigned-disposition" aria-label="待分配任务智能分配">
          <div><strong>待分配任务</strong><span>农智助手将结合地块权限、农户在岗状态和当前待办负载进行分配，结果仍可逐项调整。</span></div>
          <button type="button" class="g-btn primary compact" :disabled="isBusy || !filteredOrders.some(order => workStatus(order.status) === 'OPEN' && !order.assigneeId)" @click="autoAssignUnassigned"><app-icon name="auto_awesome"></app-icon>{{ isBusy ? '分配中…' : 'AI一键分配任务' }}</button>
        </section>

        <section v-if="canManage && isOverdueView" class="work-overdue-disposition" aria-label="逾期任务处置">
          <div><strong>逾期任务处置</strong><span>一键处置和一键重新分配都会转交给其他合适农户；新负责人接手后任务进入进行中。</span></div>
          <div class="work-overdue-disposition-actions">
            <label><input type="checkbox" :checked="allVisibleOverdueSelected" :disabled="!filteredOrders.length || isBusy" @change="toggleAllOverdue"><span>全选当前任务</span></label>
            <span>已选 {{ selectedOverdueOrders.length }} 项</span>
            <button type="button" class="g-btn secondary compact work-overdue-reassign" :disabled="!selectedOverdueOrders.length || isBusy" @click="autoReassignOverdue"><app-icon name="group_add"></app-icon>一键重新分配</button>
            <button type="button" class="g-btn primary compact work-overdue-dispose" :disabled="!selectedOverdueOrders.length || isBusy" @click="autoDisposeOverdue"><app-icon name="task_alt"></app-icon>{{ isBusy ? '正在处置' : '一键处置' }}</button>
          </div>
        </section>

        <div class="work-section-scroll" :tabindex="isEmbeddedManager ? 0 : null" :aria-label="isEmbeddedManager ? '任务列表滚动区域' : null">
          <div v-if="filteredOrders.length" class="work-order-list" :class="{ 'is-manager-card-grid': canManage }">
        <article v-for="order in filteredOrders" :key="order.workOrderId" class="work-order-card"
          :class="['status-' + workStatus(order.status).toLowerCase(), { 'is-overdue': isOverdue(order), 'is-manager-summary': canManage }]"
          :data-work-order-id="order.workOrderId" :role="canManage ? 'button' : null" :tabindex="canManage ? 0 : null"
          :aria-label="canManage ? '查看任务详情：' + (order.title || '未命名任务') : null"
          @click="canManage && openDetail(order)" @keydown="openDetailFromKeyboard($event, order)">
          <header>
            <div class="work-order-heading">
              <div class="work-order-tags"><span class="work-status" :class="'tone-' + statusMeta(order).tone">{{ statusMeta(order).label }}</span><span class="work-source">{{ taskTypeLabel(order.actionType) }}</span><span v-if="isReworkOrder(order)" class="work-rework">返工任务</span><span v-if="isAlertVerificationOrder(order)" class="work-source">告警核查</span><span class="work-source">{{ sourceLabel(order.sourceType) }}</span><span v-if="isFarmerIssueReport(order)" class="work-source work-issue-report">农户问题</span><span v-if="relatedInspections(order).length" class="work-source">巡田证据 {{ relatedInspections(order).length }}</span><span v-if="isOverdue(order)" class="work-overdue">已逾期</span></div>
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

          <div v-if="!canManage && (order.resultSummary || order.rejectionReason)" class="work-result" :class="{ rejected: workStatus(order.status) === 'REJECTED' }">
            <strong>{{ order.rejectionReason ? '退回说明' : '农户提交结果' }}</strong>
            <p>{{ order.rejectionReason || order.resultSummary }}</p>
          </div>
          <div v-if="order.plotEffect?.summary" class="work-result"><strong>地块已同步</strong><p>{{ order.plotEffect.summary }}</p></div>

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
              <button v-if="String(order.actionType || '').toUpperCase() === 'IRRIGATION_REVIEW'" type="button" class="g-btn primary compact" @click="openDetailAction('decision')">打开原处方审批</button>
              <button v-if="canManage && !TERMINAL_STATUSES.has(workStatus(order.status))" type="button" class="g-btn secondary compact" @click="openAssign(order)">{{ order.assigneeId ? '重新分配' : '分配农户' }}</button>
              <button v-if="canManage && workStatus(order.status) === 'SUBMITTED'" type="button" class="g-btn primary compact" @click="openReview(order)">验收结果</button>
              <button v-if="canManage && !TERMINAL_STATUSES.has(workStatus(order.status))" type="button" class="g-btn danger-text compact" @click="openCancel(order)">取消</button>
              <button v-if="isFarmer && workStatus(order.status) === 'ASSIGNED'" type="button" class="g-btn primary compact" @click="startTask(order)">开始处理</button>
              <button v-if="isFarmer && workStatus(order.status) === 'IN_PROGRESS'" type="button" class="g-btn secondary compact" @click="openInspection(order)">记录巡田证据</button>
              <button v-if="isFarmer && workStatus(order.status) === 'IN_PROGRESS'" type="button" class="g-btn primary compact" @click="openSubmit(order)">提交结果</button>
              <button v-if="isFarmer && workStatus(order.status) === 'REJECTED'" type="button" class="g-btn primary compact" @click="startTask(order, true)">重新处理</button>
            </div>
          </footer>
          <footer v-else class="work-summary-card-footer" :class="{ 'has-disposition': isOverdueView }">
            <label v-if="isOverdueView" class="work-overdue-card-select" @click.stop @keydown.stop><input type="checkbox" :checked="selectedOverdueIds.has(order.workOrderId)" :disabled="isBusy" @change="toggleOverdueSelection(order)"><span>选中处置</span></label>
            <button v-if="isOverdueView" type="button" class="work-overdue-manual-action" :disabled="isBusy" @click.stop="openAssign(order)">选择人员处置</button>
            <span v-if="!isOverdueView">完整结果与操作记录</span>
            <strong>查看详情 <app-icon name="arrow_forward"></app-icon></strong>
          </footer>
          </article>
          </div>
          <div v-else class="work-empty"><app-icon name="task_alt"></app-icon><h2>没有符合条件的任务</h2><p>{{ isFarmer ? '管理员分配任务后会显示在这里。' : '可以调整筛选条件，或创建一项新任务。' }}</p></div>
        </div>
      </section>

      <section v-if="canManage" v-show="!isEmbeddedManager || activeManagerSection === 'evidence'" id="manager-section-panel-evidence"
        class="evidence-request-history work-section-panel" :role="isEmbeddedManager ? 'tabpanel' : null"
        :aria-labelledby="isEmbeddedManager ? 'manager-section-tab-evidence' : 'evidence-request-history-title'">
        <header>
          <div><p class="work-lifecycle-kicker">现场补证</p><h2 id="evidence-request-history-title">补证申请</h2><span>独立于任务状态筛选，当前农场的新申请会直接显示在这里。</span></div>
          <span class="evidence-request-count">共 {{ evidenceRequests.length }} 条</span>
        </header>
        <div class="work-section-scroll" :tabindex="isEmbeddedManager ? 0 : null" :aria-label="isEmbeddedManager ? '补证申请滚动区域' : null">
          <div v-if="evidenceRequests.length" class="evidence-request-list">
            <article v-for="request in evidenceRequests" :key="request.workOrderId" class="evidence-request-card" @click="openDetail(request)">
              <header>
                <div class="work-order-tags"><span class="work-status" :class="'tone-' + statusMeta(request).tone">{{ statusMeta(request).label }}</span><span class="work-source">{{ evidenceTypeLabel(request.evidenceType) }}</span></div>
                <time>{{ formatTime(request.createdAt) }}</time>
              </header>
              <h3>{{ request.title || evidenceTypeLabel(request.evidenceType) + '补证申请' }}</h3>
              <p>{{ request.reason || '申请补充现场证据' }}</p>
              <dl class="evidence-request-facts"><div><dt>提交人</dt><dd>{{ requesterName(request) }}</dd></div><div><dt>地块</dt><dd>{{ plotName(request.plotId) }}</dd></div></dl>
              <footer>
                <button type="button" class="g-btn secondary compact" @click.stop="openDetail(request)">查看详情</button>
                <button v-if="workStatus(request.status) === 'OPEN'" type="button" class="g-btn primary compact" @click.stop="openAssign(request)">进入分配</button>
              </footer>
            </article>
          </div>
          <div v-else class="inspection-empty-state"><app-icon name="assignment_late"></app-icon><strong>当前农场暂无补证申请</strong><span>农户提交后，新的 OPEN 申请会在这里显示。</span></div>
        </div>
      </section>

      <section v-show="!isEmbeddedManager || activeManagerSection === 'inspections'" id="manager-section-panel-inspections"
        class="inspection-history work-section-panel" :role="isEmbeddedManager ? 'tabpanel' : null"
        :aria-labelledby="isEmbeddedManager ? 'manager-section-tab-inspections' : 'inspection-history-title'">
        <header>
          <div><p class="work-lifecycle-kicker">人工巡田证据</p><h2 id="inspection-history-title">巡田记录</h2><span>共 {{ inspections.length }} 条；默认展示最新 8 条，人工记录不会覆盖传感器数据。</span></div>
          <div class="inspection-history-actions"><button v-if="inspections.length > 8" type="button" class="g-btn secondary compact" @click="showAllInspections = !showAllInspections">{{ showAllInspections ? '收起记录' : '查看全部' }}</button><button type="button" class="g-btn secondary compact" :disabled="inspectionLoading" @click="loadInspections(true)">{{ inspectionLoading ? '读取中' : '刷新记录' }}</button></div>
        </header>
        <div class="work-section-scroll" :tabindex="isEmbeddedManager ? 0 : null" :aria-label="isEmbeddedManager ? '巡田记录滚动区域' : null">
          <div v-if="inspectionLoadError" class="inspection-load-error"><span>{{ inspectionLoadError }}</span><button type="button" @click="loadInspections(true)">重新读取</button></div>
          <div v-if="visibleInspections.length" class="inspection-record-list">
            <article v-for="record in visibleInspections" :key="record.inspectionId" class="inspection-record-card" role="button" tabindex="0"
              :aria-label="'查看巡田记录详情：' + plotName(record.plotId) + '，' + formatTime(record.observedAt)"
              @click="openInspectionDetail(record, $event)" @keydown="openInspectionDetailFromKeyboard($event, record)">
              <header><div><strong>{{ plotName(record.plotId) }}</strong><span>{{ formatTime(record.observedAt) }}</span></div><span class="inspection-provenance">人工记录</span></header>
              <p>{{ record.notes || record.evidenceSummary || '已记录现场情况' }}</p>
              <div class="inspection-observations">
                <span>土壤：{{ inspectionObservationLabel('soil', record.soilSurface) }}</span>
                <span>作物：{{ inspectionObservationLabel('crop', record.cropCondition) }}</span>
                <span>设备：{{ inspectionObservationLabel('device', record.deviceStatus) }}</span>
                <span>便携仪：{{ record.portableSoilMoisture ?? '—' }}{{ record.portableSoilMoisture == null ? '' : '%' }}</span>
                <span>现场照片：{{ (record.photos || []).length }} 张 · 人工提供</span>
              </div>
              <footer><span>{{ inspectionOperatorName(record) }} · {{ inspectionTaskName(record) }}</span><span class="inspection-record-detail-link"><code>{{ record.inspectionId }}</code><strong>查看详情 <app-icon name="arrow_forward"></app-icon></strong></span></footer>
            </article>
          </div>
          <div v-else-if="!inspectionLoading" class="inspection-empty-state"><app-icon name="fact_check"></app-icon><strong>还没有巡田证据</strong><span>{{ canInspect ? '完成现场核验后，可以在这里保存第一条记录。' : '有权限的农户提交后会显示在这里。' }}</span></div>
        </div>
      </section>

      <div v-if="showInspectionDetailModal && activeInspection" class="g-modal-overlay" @click.self="closeInspectionDetail" @keydown.esc="closeInspectionDetail">
        <section class="g-modal work-dialog inspection-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="inspection-detail-title">
          <div class="g-modal-header">
            <div><small>巡田记录 · {{ activeInspection.inspectionId }}</small><h3 id="inspection-detail-title">{{ plotName(activeInspection.plotId) }}巡田详情</h3></div>
            <button type="button" class="g-btn icon-only" @click="closeInspectionDetail" aria-label="关闭巡田详情"><app-icon name="close"></app-icon></button>
          </div>
          <div class="g-modal-body inspection-detail-body">
            <div class="inspection-detail-lead"><span class="inspection-provenance">人工记录</span><time>巡田时间：{{ formatTime(activeInspection.observedAt) }}</time></div>
            <p class="inspection-detail-notes">{{ activeInspection.notes || activeInspection.evidenceSummary || '未填写现场说明' }}</p>
            <dl class="inspection-detail-facts">
              <div><dt>地块</dt><dd>{{ plotName(activeInspection.plotId) }}</dd></div>
              <div><dt>记录人员</dt><dd>{{ inspectionOperatorName(activeInspection) }}</dd></div>
              <div><dt>关联任务</dt><dd>{{ inspectionTaskName(activeInspection) }}</dd></div>
              <div><dt>记录编号</dt><dd>{{ activeInspection.inspectionId }}</dd></div>
              <div><dt>证据质量</dt><dd>{{ inspectionQualityLabel(activeInspection) }}</dd></div>
              <div><dt>资料完整度</dt><dd>{{ inspectionCompletenessLabel(activeInspection) }}</dd></div>
              <div><dt>创建时间</dt><dd>{{ formatTime(activeInspection.createdAt || activeInspection.observedAt) }}</dd></div>
              <div><dt>最近更新</dt><dd>{{ formatTime(activeInspection.updatedAt || activeInspection.createdAt || activeInspection.observedAt) }}</dd></div>
            </dl>
            <section class="inspection-detail-section" aria-labelledby="inspection-observation-title">
              <h4 id="inspection-observation-title">现场观察</h4>
              <div class="inspection-detail-observations">
                <article><span>土壤表层</span><strong>{{ inspectionObservationLabel('soil', activeInspection.soilSurface) }}</strong></article>
                <article><span>作物状态</span><strong>{{ inspectionObservationLabel('crop', activeInspection.cropCondition) }}</strong></article>
                <article><span>设备外观</span><strong>{{ inspectionObservationLabel('device', activeInspection.deviceStatus) }}</strong></article>
                <article><span>便携仪含水率</span><strong>{{ activeInspection.portableSoilMoisture ?? '未测量' }}{{ activeInspection.portableSoilMoisture == null ? '' : '%' }}</strong></article>
              </div>
            </section>
            <section class="inspection-detail-section" aria-labelledby="inspection-photo-title">
              <div class="inspection-detail-section-heading"><h4 id="inspection-photo-title">现场照片</h4><span>共 {{ (activeInspection.photos || []).length }} 张 · 人工提供</span></div>
              <div v-if="activeInspection.photos?.length" class="inspection-detail-photos">
                <figure v-for="photo in activeInspection.photos" :key="photo.photoId || photo.fileName">
                  <img v-if="inspectionPhotoPreview(photo)" :src="inspectionPhotoPreview(photo)" :alt="'巡田现场照片：' + (photo.fileName || '未命名照片')">
                  <div v-else class="inspection-photo-placeholder"><app-icon name="image"></app-icon><span>照片已安全存档</span></div>
                  <figcaption><strong>{{ photo.fileName || '未命名照片' }}</strong><span>{{ inspectionPhotoSize(photo) }}</span></figcaption>
                </figure>
              </div>
              <p v-else class="inspection-detail-empty">本条巡田记录未上传现场照片。</p>
            </section>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" @click="closeInspectionDetail">关闭</button></div>
        </section>
      </div>

      <div v-if="showDetailModal && activeOrder" class="g-modal-overlay" @click.self="closeDetail" @keydown.esc="closeDetail">
        <section class="g-modal work-dialog work-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="work-detail-title">
          <div class="g-modal-header">
            <div><small>任务详情 · {{ activeOrder.workOrderId }}</small><h3 id="work-detail-title">{{ activeOrder.title || '未命名任务' }}</h3></div>
            <button type="button" class="g-btn icon-only" @click="closeDetail" aria-label="关闭任务详情"><app-icon name="close"></app-icon></button>
          </div>
          <div class="g-modal-body work-detail-body">
            <div class="work-detail-status-row">
              <div class="work-order-tags"><span class="work-status" :class="'tone-' + statusMeta(activeOrder).tone">{{ statusMeta(activeOrder).label }}</span><span class="work-source">{{ taskTypeLabel(activeOrder.actionType) }}</span><span v-if="isReworkOrder(activeOrder)" class="work-rework">返工任务</span><span v-if="isAlertVerificationOrder(activeOrder)" class="work-source">告警核查</span><span class="work-source">{{ sourceLabel(activeOrder.sourceType) }}</span><span v-if="relatedInspections(activeOrder).length" class="work-source">巡田证据 {{ relatedInspections(activeOrder).length }}</span><span v-if="isOverdue(activeOrder)" class="work-overdue">已逾期</span></div>
              <span class="work-priority" :class="'priority-' + String(activeOrder.priority || 'LOW').toLowerCase()">{{ priorityLabel(activeOrder.priority) }}</span>
            </div>
            <p class="work-detail-reason">{{ activeOrder.reason || '暂无执行说明' }}</p>
            <div v-if="isFarmerIssueReport(activeOrder)" class="work-result work-issue-report-detail"><strong>农户具体描述</strong><p>{{ activeOrder.issueDescription || activeOrder.description || activeOrder.reason }}</p><small>上报人：{{ activeOrder.reporterName || activeOrder.reporterId || '农户' }}</small></div>
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
            <div v-if="activeOrder.plotEffect?.summary" class="work-result"><strong>完成后的地块影响</strong><p>{{ activeOrder.plotEffect.summary }}</p><small>生长状态：{{ activeOrder.plotEffect.after?.cultivationStatusLabel || '保持不变' }} · 阶段：{{ activeOrder.plotEffect.after?.stageLabel || '保持不变' }}</small></div>
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
            <label><span>优先级</span><select class="g-select" v-model="taskForm.priority"><option value="HIGH">紧急</option><option value="MEDIUM">中</option><option value="LOW">普通</option></select></label>
            <label><span>任务类型</span><select class="g-select" v-model="taskForm.actionType" @change="applyTaskTypePreset"><option v-for="type in WORK_ACTION_OPTIONS" :key="type" :value="type">{{ taskTypeLabel(type) }}</option></select></label>
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
            <label v-if="assignment.dueAt"><span>新处理时限</span><input type="datetime-local" class="g-input" v-model="assignment.dueAt" required><small>重新安排后任务将进入进行中，不再停留在已逾期。</small></label>
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
          <div class="g-modal-body work-form-stack"><div class="review-result-preview"><strong>农户提交结果</strong><p>{{ activeOrder?.resultSummary || '未填写结果说明' }}</p></div><div v-if="relatedInspections(activeOrder).length" class="review-evidence"><strong>巡田证据 {{ relatedInspections(activeOrder).length }} 条</strong><div v-for="record in relatedInspections(activeOrder)" :key="record.inspectionId"><span>{{ formatTime(record.observedAt) }} · {{ record.notes || record.evidenceSummary }}</span><small>{{ inspectionOperatorName(record) }} · {{ record.inspectionId }}</small></div></div><label v-if="isAlertVerificationOrder(activeOrder)"><span>核查结论</span><select class="g-select" v-model="review.verificationResult"><option value="CONFIRMED_ABNORMAL">确认异常，自动下发处置任务</option><option value="CLEARED_NORMAL">现场正常，自动关闭原告警</option></select><small>核查结论是后续动作的唯一依据，不再进入人工告警审核。</small></label><label><span>验收意见</span><textarea class="g-input" rows="4" v-model="review.note" placeholder="通过时可以选填；退回时请明确说明需要补做什么"></textarea></label></div>
          <div class="g-modal-footer split"><button type="button" class="g-btn secondary" @click="showReviewModal = false">稍后处理</button><div><button type="button" class="g-btn danger-text" :disabled="isBusy" @click="reviewTask('REJECT')">退回处理</button><button type="button" class="g-btn primary" :disabled="isBusy" @click="reviewTask('APPROVE')">{{ isAlertVerificationOrder(activeOrder) ? '确认结果并自动处理' : '验收通过' }}</button></div></div>
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
