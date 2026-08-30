import { api } from './api.js?v=20260830-load-resilience-1';
import { adminMetricLabel } from './admin-state.js';
import { sourceLabel as localizedSourceLabel } from './live-data.js?v=20260827-boot-fix-1';

const { ref, computed, inject, watch } = Vue;

const STATUS_LABELS = Object.freeze({ ACTIVE: '待处理', ACKED: '处理中', ESCALATED: '需优先处理', CLOSED: '已关闭', RESOLVED: '已解决' });
const LEVEL_LABELS = Object.freeze({ CRITICAL: '严重', HIGH: '紧急', MEDIUM: '注意', LOW: '提示' });
const TERMINAL_WORK_STATUSES = new Set(['DONE', 'COMPLETED', 'CANCELLED', 'CANCELED', 'FAILED']);
const HIGH_CONFIDENCE_THRESHOLD = 0.8;

function normalized(value, fallback = 'UNKNOWN') {
  return String(value || fallback).trim().toUpperCase();
}

function replaceById(list, key, update) {
  const identity = item => {
    if (key === 'alertId') return item?.alertId || item?.id || '';
    if (key === 'workOrderId') return item?.workOrderId || item?.workItemId || '';
    return item?.[key] || '';
  };
  const targetId = String(identity(update));
  const index = list.findIndex(item => String(identity(item)) === targetId);
  if (index < 0) list.unshift(update);
  else list.splice(index, 1, { ...list[index], ...update });
}

function readableTime(value) {
  if (!value) return '时间未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function memberName(member) {
  return member?.displayName || member?.username || member?.userId || '未知农户';
}

function confidenceValue(diagnosis = {}) {
  const candidates = Array.isArray(diagnosis?.candidateCauses)
    ? diagnosis.candidateCauses
    : (Array.isArray(diagnosis?.candidates) ? diagnosis.candidates : []);
  const raw = [
    diagnosis?.confidence,
    diagnosis?.primaryCandidate?.confidence,
    candidates[0]?.confidence
  ].map(Number).find(Number.isFinite);
  if (!Number.isFinite(raw)) return 0;
  const normalizedValue = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, normalizedValue));
}

function primaryCauseValue(diagnosis = {}) {
  const candidates = Array.isArray(diagnosis?.candidateCauses)
    ? diagnosis.candidateCauses
    : (Array.isArray(diagnosis?.candidates) ? diagnosis.candidates : []);
  return normalized(
    diagnosis?.primaryCause
      || diagnosis?.riskType
      || diagnosis?.primaryCandidate?.code
      || candidates[0]?.code,
    'INSUFFICIENT_EVIDENCE'
  );
}

export function chooseBestFarmer(members = [], workOrders = [], plotId = '') {
  const eligible = members
    .filter(member => normalized(member?.role) === 'FARMER' && normalized(member?.status, 'ACTIVE') === 'ACTIVE')
    .filter(member => Array.isArray(member?.plotIds) && (member.plotIds.includes('*') || member.plotIds.includes(plotId)))
    .map(member => {
      const activeLoad = workOrders.filter(order => order?.assigneeId === member.userId
        && !TERMINAL_WORK_STATUSES.has(normalized(order?.status))).length;
      const plotExperience = workOrders.filter(order => order?.assigneeId === member.userId
        && order?.plotId === plotId).length;
      return { member, activeLoad, plotExperience };
    })
    .sort((a, b) => a.activeLoad - b.activeLoad
      || b.plotExperience - a.plotExperience
      || memberName(a.member).localeCompare(memberName(b.member), 'zh-CN'));

  if (!eligible.length) return null;
  const best = eligible[0];
  return {
    ...best,
    reason: `${memberName(best.member)}具备该地块权限，当前进行中任务 ${best.activeLoad} 项，过往处理该地块 ${best.plotExperience} 次。`
  };
}

export function assessAlertCredibility(alert = {}, diagnosis = {}) {
  let score = confidenceValue(diagnosis);
  const reasons = [];
  const primaryCause = primaryCauseValue(diagnosis);
  const missingInformation = [
    ...(Array.isArray(diagnosis?.missingInformation) ? diagnosis.missingInformation : []),
    ...(Array.isArray(diagnosis?.missingEvidence) ? diagnosis.missingEvidence : [])
  ].filter(Boolean);
  const diagnosisStatus = normalized(diagnosis?.status, 'AVAILABLE');

  if (['INSUFFICIENT_EVIDENCE', 'UNKNOWN', 'UNAVAILABLE'].includes(primaryCause) || diagnosisStatus === 'UNAVAILABLE') {
    score = Math.min(score, 0.49);
    reasons.push('现有证据还不足以确认告警原因');
  }
  if (missingInformation.length) {
    score = Math.min(score, 0.74);
    reasons.push(`仍需补充 ${missingInformation.length} 项证据`);
  }
  if (normalized(alert?.ruleState, 'CONFIRMED') === 'CANDIDATE') {
    score = Math.min(score, 0.69);
    reasons.push('告警规则尚未完成持续时间确认');
  }

  const highConfidence = score >= HIGH_CONFIDENCE_THRESHOLD
    && !['INSUFFICIENT_EVIDENCE', 'UNKNOWN', 'UNAVAILABLE'].includes(primaryCause)
    && diagnosisStatus !== 'UNAVAILABLE'
    && !missingInformation.length;

  return {
    score,
    highConfidence,
    primaryCause,
    status: highConfidence ? 'AUTO_READY' : 'VERIFICATION_REQUIRED',
    label: highConfidence ? '可智能下发' : '需现场核查',
    reason: reasons.join('；') || (highConfidence
      ? '规则、遥测与诊断结果相互印证，达到智能下发阈值。'
      : `当前可信度未达到 ${Math.round(HIGH_CONFIDENCE_THRESHOLD * 100)}% 的智能下发阈值。`)
  };
}

function dueHours(level) {
  return ({ CRITICAL: 1, HIGH: 2, MEDIUM: 4, LOW: 8 })[normalized(level, 'MEDIUM')] || 4;
}

function workPriority(level) {
  const value = normalized(level, 'MEDIUM');
  if (value === 'CRITICAL') return 'HIGH';
  return ['HIGH', 'MEDIUM', 'LOW'].includes(value) ? value : 'MEDIUM';
}

function actionTypeFor(alert, audit = null) {
  const text = `${audit?.primaryCause || ''} ${alert?.title || ''} ${alert?.message || ''} ${alert?.source || ''}`.toLowerCase();
  return /device|sensor|设备|传感器|离线|漂移|fault/.test(text) ? 'INSPECTION' : 'FIELD_OPERATION';
}

export function finalizedAssignedTask(task = {}, response = {}, alert = {}, farmer = {}) {
  const taskId = response?.workOrderId || response?.workItemId || task?.workOrderId || task?.workItemId;
  return {
    ...task,
    ...(response || {}),
    workOrderId: taskId,
    workItemId: response?.workItemId || task?.workItemId || taskId,
    sourceType: 'ALERT',
    sourceRef: alert?.alertId || alert?.id || task?.sourceRef || '',
    assigneeId: farmer?.userId || response?.assigneeId || task?.assigneeId || null,
    assigneeName: response?.assigneeName || farmer?.displayName || farmer?.username || task?.assigneeName || '',
    status: response?.status || 'ASSIGNED'
  };
}

export function finalizedClosedAlert(alert = {}, response = {}) {
  return {
    ...alert,
    ...(response || {}),
    alertId: response?.alertId || alert?.alertId || alert?.id || '',
    status: 'CLOSED',
    updatedAt: response?.updatedAt || new Date().toISOString()
  };
}

export const AdminAlertCenter = {
  props: ['state'],
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const filter = ref('REVIEW');
    const busyKey = ref('');
    const selectedIds = ref([]);
    const activeAlertId = ref('');
    const dismissedAlertIds = ref([]);
    const aiAudits = ref({});
    const aiSummary = ref(null);

    const alertKey = alert => alert?.alertId || alert?.id || '';
    const isClosed = alert => ['CLOSED', 'RESOLVED'].includes(normalized(alert?.status));
    const existingTask = alert => (props.state.workOrders || []).find(order => normalized(order?.sourceType) === 'ALERT'
      && String(order?.sourceRef || order?.alertId || '') === String(alertKey(alert)));
    const isVerificationTask = task => normalized(task?.taskPurpose) === 'ALERT_VERIFICATION';
    const verificationBusy = alert => busyKey.value === 'batch:verify' || busyKey.value === `${alertKey(alert)}:verify`;
    const isDispatched = alert => Boolean(existingTask(alert)?.assigneeId);
    const sortedAlerts = computed(() => [...(props.state.alerts || [])].sort((a, b) => {
      const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (rank[normalized(b.level)] || 0) - (rank[normalized(a.level)] || 0)
        || new Date(b.raisedAt || b.createdAt || 0) - new Date(a.raisedAt || a.createdAt || 0);
    }));
    const reviewAlerts = computed(() => sortedAlerts.value.filter(alert => !isClosed(alert) && !isDispatched(alert)));
    const dispatchedAlerts = computed(() => sortedAlerts.value.filter(alert => !isClosed(alert) && isDispatched(alert)));
    const closedAlerts = computed(() => sortedAlerts.value.filter(isClosed));
    const activeAlerts = computed(() => sortedAlerts.value.filter(alert => !isClosed(alert)));
    const visibleAlerts = computed(() => ({
      REVIEW: reviewAlerts.value,
      DISPATCHED: dispatchedAlerts.value,
      CLOSED: closedAlerts.value,
      ALL: activeAlerts.value
    })[filter.value]?.filter(alert => filter.value === 'CLOSED' || !dismissedAlertIds.value.includes(alertKey(alert))) || reviewAlerts.value);
    const selectableAlerts = computed(() => visibleAlerts.value.filter(alert => !isClosed(alert)));
    const selectedAlerts = computed(() => sortedAlerts.value.filter(alert => selectedIds.value.includes(alertKey(alert)) && !isClosed(alert)));
    const allVisibleSelected = computed(() => selectableAlerts.value.length > 0
      && selectableAlerts.value.every(alert => selectedIds.value.includes(alertKey(alert))));
    const activeAlert = computed(() => sortedAlerts.value.find(alert => alertKey(alert) === activeAlertId.value) || null);

    const plotName = plotId => (props.state.plots || []).find(plot => plot.plotId === plotId)?.name || plotId || '未知地块';
    const statusLabel = status => STATUS_LABELS[normalized(status)] || '状态未知';
    const levelLabel = level => LEVEL_LABELS[normalized(level)] || '注意';
    const sourceLabel = source => localizedSourceLabel(source, adminMetricLabel(source, '系统规则'));
    const auditFor = alert => aiAudits.value[alertKey(alert)] || null;
    const confidenceText = audit => audit ? `${Math.round(audit.score * 100)}%` : '未分析';
    const nextStep = alert => {
      if (isClosed(alert)) return '告警已结束';
      if (isVerificationTask(existingTask(alert))) return '核查任务已下发，等待现场结果';
      if (isDispatched(alert)) return '处置任务已下发，等待农户处理';
      if (auditFor(alert) && !auditFor(alert).highConfidence) return '证据不确定，需发布现场核查任务';
      return '等待 AI 智能处理';
    };

    const toggleSelectAll = () => {
      const visibleIds = selectableAlerts.value.map(alertKey);
      selectedIds.value = allVisibleSelected.value
        ? selectedIds.value.filter(id => !visibleIds.includes(id))
        : [...new Set([...selectedIds.value, ...visibleIds])];
    };
    const openDetail = alert => { activeAlertId.value = alertKey(alert); };
    const closeDetail = () => { activeAlertId.value = ''; };
    const openDetailFromKeyboard = (event, alert) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openDetail(alert);
    };

    watch(() => props.state.adminContext?.farmId, () => {
      activeAlertId.value = '';
      selectedIds.value = [];
      dismissedAlertIds.value = [];
      aiAudits.value = {};
      aiSummary.value = null;
    });

    const invalidate = (records, reason) => emit('data-invalidated', {
      type: 'data-invalidated',
      domains: ['alerts', 'workOrders', 'overview'],
      farmId: props.state.adminContext?.farmId || records[0]?.farmId || '',
      plotIds: [...new Set(records.map(item => item?.plotId).filter(Boolean))],
      records: records.map(item => ({ ...item })),
      reason
    });

    const selectFarmer = alert => chooseBestFarmer(
      props.state.farmMembers || [],
      props.state.workOrders || [],
      alert?.plotId
    );

    const ensureDispatched = async (alert, assignment = selectFarmer(alert), audit = auditFor(alert)) => {
      if (!assignment?.member?.userId) throw new Error(`暂无具备 ${plotName(alert.plotId)} 权限的在岗农户`);
      let task = existingTask(alert);
      if (task?.assigneeId) return task;
      if (!task) {
        const draft = {
          farmId: props.state.adminContext?.farmId || alert.farmId || '',
          plotId: alert.plotId,
          title: `处理：${alert.title || '地块告警'}`,
          reason: alert.message || '根据告警分析安排现场检查与处理',
          sourceType: 'ALERT',
          sourceRef: alertKey(alert),
          actionType: actionTypeFor(alert, audit),
          priority: workPriority(alert.level),
          status: 'OPEN',
          assigneeId: null,
          dueAt: new Date(Date.now() + dueHours(alert.level) * 60 * 60 * 1000).toISOString(),
          provenance: props.state.sessionMode === 'demo' ? 'SIMULATED' : 'DERIVED'
        };
        const created = await api.createWorkOrder(draft);
        task = finalizedAssignedTask({ ...draft, ...(created || {}) }, {}, alert, {});
        task.assigneeId = null;
        task.status = created?.status || 'OPEN';
      }

      const taskId = task.workOrderId || task.workItemId;
      if (!taskId) throw new Error('任务创建成功，但后端没有返回任务编号');
      task = { ...task, workOrderId: taskId, workItemId: task.workItemId || taskId };
      replaceById(props.state.workOrders, 'workOrderId', task);
      const response = await api.assignWorkOrder(taskId, {
        assigneeId: assignment.member.userId,
        note: `智能派单依据：${assignment.reason}`
      });
      const assigned = finalizedAssignedTask(task, response, alert, assignment.member);
      replaceById(props.state.workOrders, 'workOrderId', assigned);
      return assigned;
    };

    const publishVerificationTasks = async (targetAlerts = null) => {
      const requested = Array.isArray(targetAlerts)
        ? targetAlerts
        : (selectedAlerts.value.length
          ? selectedAlerts.value
          : reviewAlerts.value.filter(alert => auditFor(alert) && !auditFor(alert).highConfidence));
      const alerts = requested.filter(alert => !isClosed(alert) && !existingTask(alert)?.assigneeId);
      if (!alerts.length) return toast('请先选择需要现场核查的告警，或先运行 AI 智能处理', 'error');
      if (busyKey.value) return;
      busyKey.value = alerts.length === 1 ? `${alertKey(alerts[0])}:verify` : 'batch:verify';
      let published = 0;
      const failed = [];
      for (const alert of alerts) {
        try {
          const audit = auditFor(alert);
          let task;
          if (props.state.sessionMode !== 'demo' && typeof api.publishAlertVerificationTask === 'function') {
            const response = await api.publishAlertVerificationTask(alertKey(alert), { idempotencyKey: `alert-verification:${alertKey(alert)}` });
            task = response?.workOrder || response?.task || response;
          } else {
            const assignment = selectFarmer(alert);
            if (!assignment?.member?.userId) throw new Error(`暂无具备 ${plotName(alert.plotId)} 权限的在岗农户`);
            const draft = { farmId: props.state.adminContext?.farmId || alert.farmId || '', plotId: alert.plotId, title: `核查：${alert.title || '地块告警'}`, reason: `${audit?.reason || '现有证据不足'}。请完成现场观察并提交核查结果。`, sourceType: 'ALERT', sourceRef: alertKey(alert), actionType: 'INSPECTION', taskPurpose: 'ALERT_VERIFICATION', followUpActionType: actionTypeFor(alert, audit), priority: workPriority(alert.level), dueAt: new Date(Date.now() + dueHours(alert.level) * 3600000).toISOString(), provenance: props.state.sessionMode === 'demo' ? 'SIMULATED' : 'DERIVED' };
            const created = await api.createWorkOrder(draft); const taskId = created?.workOrderId || created?.workItemId; if (!taskId) throw new Error('核查任务创建成功，但后端没有返回任务编号');
            const assignedResponse = await api.assignWorkOrder(taskId, { assigneeId: assignment.member.userId, note: `告警现场核查：${assignment.reason}` });
            task = { ...draft, ...(created || {}), ...(assignedResponse || {}), assigneeId: assignment.member.userId, assigneeName: memberName(assignment.member), status: assignedResponse?.status || 'ASSIGNED', workOrderId: taskId, workItemId: taskId };
          }
          if (!task?.workOrderId) throw new Error('核查任务发布成功，但后端没有返回任务编号');
          const assigned = finalizedAssignedTask(task, {}, alert, task.assigneeName ? { displayName: task.assigneeName } : {});
          replaceById(props.state.workOrders, 'workOrderId', assigned);
          aiAudits.value = {
            ...aiAudits.value,
            [alertKey(alert)]: {
              ...(audit || { score: 0, highConfidence: false }),
              highConfidence: false,
              status: 'VERIFICATION_DISPATCHED',
              label: '核查任务已下发',
              farmerName: assigned.assigneeName || '',
              reason: '等待农户提交现场核查结果；管理员确认结果后系统会自动下发处置任务。'
            }
          };
          published += 1;
        } catch (error) {
          failed.push(`${plotName(alert.plotId)}：${error.message || '核查任务发布失败'}`);
        }
      }
      selectedIds.value = selectedIds.value.filter(id => !alerts.some(alert => alertKey(alert) === id));
      busyKey.value = '';
      if (published) invalidate(alerts, 'alert-verification-dispatched');
      toast(published
        ? `已发布 ${published} 项核查任务${failed.length ? `，${failed.length} 项需检查人员权限` : ''}`
        : failed[0] || '没有可发布的核查任务', failed.length ? 'warning' : 'success');
    };

    const openAssignedTask = alert => {
      const task = existingTask(alert);
      if (!task?.assigneeId) return;
      activeAlertId.value = '';
      emit('navigate', 'work-orders', {
        highlight: task.workOrderId || task.workItemId,
        farmId: props.state.adminContext?.farmId || ''
      });
    };

    const closeAlerts = async alerts => {
      const targets = [...alerts].filter(alert => alertKey(alert) && !isClosed(alert));
      if (!targets.length) return toast('请先选择要关闭的告警', 'error');
      const targetIds = targets.map(alertKey);
      const previousById = new Map(targets.map(alert => [alertKey(alert), { ...alert }]));
      busyKey.value = targets.length > 1 ? 'batch:close' : `${alertKey(targets[0])}:close`;
      dismissedAlertIds.value = [...new Set([...dismissedAlertIds.value, ...targetIds])];
      targets.forEach(alert => replaceById(props.state.alerts, 'alertId', finalizedClosedAlert(alert)));
      selectedIds.value = selectedIds.value.filter(id => !targetIds.includes(id));
      if (targetIds.includes(activeAlertId.value)) activeAlertId.value = '';

      let completed = 0;
      const failed = [];
      const savedRecords = [];
      for (const alert of targets) {
        try {
          const response = await api.closeAlert(alertKey(alert));
          const closed = finalizedClosedAlert(alert, response);
          replaceById(props.state.alerts, 'alertId', closed);
          savedRecords.push(closed);
          completed += 1;
        } catch (error) {
          replaceById(props.state.alerts, 'alertId', previousById.get(alertKey(alert)));
          failed.push(`${plotName(alert.plotId)}：${error.message || '关闭失败'}`);
        }
      }
      const failedIds = new Set(targets.filter(alert => !savedRecords.some(record => alertKey(record) === alertKey(alert))).map(alertKey));
      dismissedAlertIds.value = dismissedAlertIds.value.filter(id => !failedIds.has(id));
      busyKey.value = '';
      if (savedRecords.length) invalidate(savedRecords, 'alerts-closed');
      toast(failed.length
        ? `已关闭 ${completed} 条，另有 ${failed.length} 条失败`
        : `已关闭 ${completed} 条告警`, failed.length ? 'error' : 'success');
    };

    const aiProcess = async (targetAlerts = null) => {
      const selectedPending = selectedAlerts.value.filter(alert => !existingTask(alert)?.assigneeId);
      const requested = Array.isArray(targetAlerts)
        ? targetAlerts
        : (selectedAlerts.value.length ? selectedPending : reviewAlerts.value);
      const alerts = requested.filter(alert => !isClosed(alert) && !existingTask(alert)?.assigneeId);
      if (!alerts.length) return toast(selectedAlerts.value.length
        ? '选中的告警均已下发，无需重复智能处理'
        : '当前没有需要智能处理的告警');

      busyKey.value = 'batch:ai';
      let dispatched = 0;
      let review = 0;
      let failed = 0;
      for (const alert of alerts) {
        try {
          const diagnosis = await api.evaluateDiagnosis(alert.plotId, {
            traceId: `alert-analysis-${Date.now()}-${alertKey(alert)}`,
            ...(props.state.sessionMode === 'demo' && alert.diagnosisScenario
              ? { scenarioId: alert.diagnosisScenario }
              : {})
          });
          const audit = assessAlertCredibility(alert, diagnosis);
          const assignment = audit.highConfidence ? selectFarmer(alert) : null;
          if (audit.highConfidence && assignment) {
            await ensureDispatched(alert, assignment, audit);
            aiAudits.value = {
              ...aiAudits.value,
              [alertKey(alert)]: {
                ...audit,
                farmerName: memberName(assignment.member),
                assignmentReason: assignment.reason
              }
            };
            dispatched += 1;
          } else {
            aiAudits.value = {
              ...aiAudits.value,
              [alertKey(alert)]: {
                ...audit,
                highConfidence: false,
                status: 'VERIFICATION_REQUIRED',
                label: '需现场核查',
                reason: audit.highConfidence && !assignment
                  ? `${audit.reason} 暂无具备该地块权限的在岗农户。`
                  : audit.reason
              }
            };
            review += 1;
          }
        } catch (error) {
          aiAudits.value = {
            ...aiAudits.value,
            [alertKey(alert)]: {
              score: 0,
              highConfidence: false,
              status: 'VERIFICATION_REQUIRED',
              label: '分析失败，需现场核查',
              reason: error.message || '无法获取诊断结果'
            }
          };
          failed += 1;
        }
      }

      aiSummary.value = { total: alerts.length, dispatched, review, failed };
      selectedIds.value = selectedIds.value.filter(id => !alerts.some(alert => alertKey(alert) === id));
      if (dispatched && alerts.some(alert => alertKey(alert) === activeAlertId.value)) activeAlertId.value = '';
      busyKey.value = '';
      invalidate(alerts, 'alerts-ai-processed');
      toast(`已分析 ${alerts.length} 条：智能下发 ${dispatched} 条，需现场核查 ${review + failed} 条`);
    };

    return {
      filter,
      busyKey,
      selectedIds,
      visibleAlerts,
      alertKey, verificationBusy,
      selectableAlerts,
      selectedAlerts,
      allVisibleSelected,
      activeAlert,
      reviewCount: computed(() => reviewAlerts.value.length),
      dispatchedCount: computed(() => dispatchedAlerts.value.length),
      closedCount: computed(() => closedAlerts.value.length),
      isClosed,
      existingTask,
      plotName,
      statusLabel,
      levelLabel,
      sourceLabel,
      auditFor,
      confidenceText,
      nextStep,
      readableTime,
      normalized,
      aiSummary,
      toggleSelectAll,
      openAssignedTask,
      closeAlerts,
      aiProcess,
      publishVerificationTasks,
      openDetail,
      closeDetail,
      openDetailFromKeyboard
    };
  },
  template: `
    <section class="admin-alert-view" aria-label="AI告警分析与智能处理">
      <div class="admin-alert-tabs" role="group" aria-label="告警筛选">
        <button type="button" :class="{ active: filter === 'REVIEW' }" @click="filter = 'REVIEW'">待审核 {{ reviewCount }}</button>
        <button type="button" :class="{ active: filter === 'DISPATCHED' }" @click="filter = 'DISPATCHED'">已下发 {{ dispatchedCount }}</button>
        <button type="button" :class="{ active: filter === 'CLOSED' }" @click="filter = 'CLOSED'">已关闭 {{ closedCount }}</button>
        <button type="button" :class="{ active: filter === 'ALL' }" @click="filter = 'ALL'">全部未关闭</button>
      </div>

      <div class="admin-alert-ai-summary" v-if="aiSummary" role="status">
        <span class="admin-alert-ai-icon"><app-icon name="smart_toy"></app-icon></span>
        <div>
          <strong>本次已分析 {{ aiSummary.total }} 条告警</strong>
          <p>智能下发 {{ aiSummary.dispatched }} 条，需现场核查 {{ aiSummary.review + aiSummary.failed }} 条；核查结果确认后自动下发处置任务。</p>
        </div>
      </div>

      <div class="admin-alert-batch-bar">
        <div class="admin-alert-selection-group">
          <label class="admin-alert-select-all" :class="{ disabled: !selectableAlerts.length }">
            <input type="checkbox" :checked="allVisibleSelected" :disabled="!selectableAlerts.length || busyKey !== ''" @change="toggleSelectAll">
            <span>全选当前列表</span>
          </label>
          <span class="admin-alert-selection">已选 {{ selectedAlerts.length }} 条</span>
        </div>
        <div class="admin-alert-batch-actions">
          <button class="g-btn primary" type="button" :disabled="busyKey !== '' || (!selectedAlerts.length && !reviewCount)" @click="aiProcess">
            <app-icon name="auto_awesome"></app-icon><span>{{ busyKey === 'batch:ai' ? '正在分析…' : 'AI智能处理' }}</span>
          </button>
          <button class="g-btn secondary admin-alert-verify-action" type="button" :disabled="busyKey !== '' || (!selectedAlerts.length && !reviewCount)" @click="publishVerificationTasks()">
            <app-icon name="fact_check"></app-icon><span>{{ busyKey === 'batch:verify' ? '正在发布…' : '一键发布核查任务' }}</span>
          </button>
          <button class="g-btn secondary admin-alert-close-action" type="button" :disabled="busyKey !== '' || !selectedAlerts.length" @click="closeAlerts(selectedAlerts)">
            <app-icon name="close"></app-icon><span>一键关闭告警</span>
          </button>
        </div>
      </div>

      <div class="admin-alert-empty" v-if="!visibleAlerts.length">当前列表没有告警。</div>
      <div class="admin-alert-list" v-else>
        <article class="admin-alert-card" v-for="alert in visibleAlerts" :key="alertKey(alert)"
          :class="['level-' + normalized(alert.level, 'MEDIUM').toLowerCase(), { 'is-selected': selectedIds.includes(alertKey(alert)) }]"
          role="button" tabindex="0" :aria-label="'查看告警详情：' + (alert.title || '地块需要处理')"
          @click="openDetail(alert)" @keydown="openDetailFromKeyboard($event, alert)">
          <div class="admin-alert-main">
            <div class="admin-alert-card-top">
              <label class="admin-alert-card-select" v-if="!isClosed(alert)" @click.stop>
                <input type="checkbox" v-model="selectedIds" :value="alertKey(alert)" :disabled="busyKey !== ''" @click.stop>
                <span>选择</span>
              </label>
              <div class="admin-alert-title-row">
                <span class="admin-alert-chip" :class="'state-' + normalized(alert.status, 'ACTIVE').toLowerCase()">{{ statusLabel(alert.status) }}</span>
                <span class="admin-alert-chip level">{{ levelLabel(alert.level) }}</span>
                <span class="admin-alert-chip dispatched" v-if="existingTask(alert)">{{ existingTask(alert).assigneeId ? '已下发农户' : '等待分配' }}</span>
              </div>
            </div>
            <h3>{{ alert.title || '地块需要处理' }}</h3>
            <p class="admin-alert-message">{{ alert.message || '该地块存在需要人工确认的问题。' }}</p>
            <dl class="admin-alert-card-facts">
              <div><dt>地块</dt><dd>{{ plotName(alert.plotId) }}</dd></div>
              <div><dt>发生时间</dt><dd>{{ readableTime(alert.raisedAt || alert.createdAt) }}</dd></div>
            </dl>
            <div class="admin-alert-audit" v-if="auditFor(alert)" :class="auditFor(alert).highConfidence ? 'is-ready' : 'needs-review'">
              <strong>可信度 {{ confidenceText(auditFor(alert)) }} · {{ auditFor(alert).label }}</strong>
              <span>{{ auditFor(alert).farmerName ? '已下发给 ' + auditFor(alert).farmerName + '。' : '' }}{{ auditFor(alert).reason }}</span>
            </div>
          </div>
          <footer class="admin-alert-card-footer">
            <span>来源：{{ sourceLabel(alert.source) }}</span>
            <div class="admin-alert-card-actions">
              <button v-if="!isClosed(alert) && !existingTask(alert)?.assigneeId" class="g-btn compact admin-alert-verify-action" type="button" :disabled="busyKey !== ''" @click.stop="publishVerificationTasks([alert])">{{ verificationBusy(alert) ? '发布中…' : '发布核查任务' }}</button>
              <strong>查看详情 <app-icon name="arrow_forward"></app-icon></strong>
            </div>
          </footer>
        </article>
      </div>

      <div v-if="activeAlert" class="g-modal-overlay admin-alert-detail-overlay" @click.self="closeDetail" @keydown.esc="closeDetail">
        <section class="g-modal admin-alert-detail" role="dialog" aria-modal="true" aria-labelledby="admin-alert-detail-title">
          <div class="g-modal-header">
            <div><small>告警详情</small><h3 id="admin-alert-detail-title">{{ activeAlert.title || '地块需要处理' }}</h3></div>
            <button type="button" class="g-btn icon-only" aria-label="关闭" @click="closeDetail"><app-icon name="close"></app-icon></button>
          </div>
          <div class="g-modal-body admin-alert-detail-body">
            <div class="admin-alert-detail-status">
              <div class="admin-alert-title-row">
                <span class="admin-alert-chip" :class="'state-' + normalized(activeAlert.status, 'ACTIVE').toLowerCase()">{{ statusLabel(activeAlert.status) }}</span>
                <span class="admin-alert-chip level">{{ levelLabel(activeAlert.level) }}</span>
              </div>
              <strong>{{ nextStep(activeAlert) }}</strong>
            </div>
            <p class="admin-alert-detail-message">{{ activeAlert.message || '该地块存在需要人工确认的问题。' }}</p>
            <dl class="admin-alert-detail-facts">
              <div><dt>地块</dt><dd>{{ plotName(activeAlert.plotId) }}</dd></div>
              <div><dt>发生时间</dt><dd>{{ readableTime(activeAlert.raisedAt || activeAlert.createdAt) }}</dd></div>
              <div><dt>告警来源</dt><dd>{{ sourceLabel(activeAlert.source) }}</dd></div>
              <div><dt>关联任务</dt><dd>{{ existingTask(activeAlert)?.title || '尚未下发' }}</dd></div>
            </dl>
            <div class="admin-alert-audit admin-alert-detail-audit" v-if="auditFor(activeAlert)" :class="auditFor(activeAlert).highConfidence ? 'is-ready' : 'needs-review'">
              <strong>AI 分析可信度 {{ confidenceText(auditFor(activeAlert)) }} · {{ auditFor(activeAlert).label }}</strong>
              <span>{{ auditFor(activeAlert).farmerName ? '已下发给 ' + auditFor(activeAlert).farmerName + '。' : '' }}{{ auditFor(activeAlert).reason }}</span>
            </div>
            <p class="admin-alert-detail-note" v-if="isClosed(activeAlert)">这条告警已经结束，处理记录继续保留为只读事实。</p>
          </div>
          <div class="g-modal-footer admin-alert-detail-footer">
            <button class="g-btn secondary" type="button" @click="closeDetail">返回</button>
            <template v-if="!isClosed(activeAlert)">
              <button v-if="!existingTask(activeAlert)?.assigneeId && (!auditFor(activeAlert) || auditFor(activeAlert).highConfidence)" class="g-btn primary" type="button" :disabled="busyKey !== ''" @click="aiProcess([activeAlert])">
                <app-icon name="auto_awesome"></app-icon><span>AI智能处理</span>
              </button>
              <button v-if="!existingTask(activeAlert)?.assigneeId" class="g-btn secondary admin-alert-verify-action" type="button" :disabled="busyKey !== ''" @click="publishVerificationTasks([activeAlert])">
                <app-icon name="fact_check"></app-icon><span>发布核查任务</span>
              </button>
              <button v-if="existingTask(activeAlert)?.assigneeId" class="g-btn secondary" type="button" :disabled="busyKey !== ''" @click="openAssignedTask(activeAlert)">
                <app-icon name="task_alt"></app-icon><span>查看已下发任务</span>
              </button>
              <button class="g-btn secondary admin-alert-close-action" type="button" :disabled="busyKey !== ''" @click="closeAlerts([activeAlert])">关闭告警</button>
            </template>
          </div>
        </section>
      </div>
    </section>
  `
};
