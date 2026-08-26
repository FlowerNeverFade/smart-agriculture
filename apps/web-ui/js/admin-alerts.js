import { api } from './api.js';

const { ref, computed, inject } = Vue;

const LEVEL_LABELS = Object.freeze({ CRITICAL: '严重', HIGH: '紧急', MEDIUM: '注意', LOW: '提示' });
const TERMINAL_WORK_STATUSES = new Set(['DONE', 'COMPLETED', 'CANCELLED', 'CANCELED', 'FAILED']);
const CONFIDENCE_THRESHOLD = 0.78;

function normalized(value, fallback = 'UNKNOWN') {
  return String(value || fallback).trim().toUpperCase();
}

function replaceById(list, key, update) {
  const index = list.findIndex(item => item?.[key] === update?.[key]);
  if (index < 0) list.unshift(update);
  else list.splice(index, 1, { ...list[index], ...update });
}

function readableTime(value) {
  if (!value) return '时间未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function memberName(member) {
  return member?.displayName || member?.username || member?.userId || '未知农户';
}

export function chooseBestFarmer(members = [], workOrders = [], plotId = '') {
  const eligible = members
    .filter(member => normalized(member?.role) === 'FARMER' && normalized(member?.status, 'ACTIVE') === 'ACTIVE')
    .filter(member => Array.isArray(member?.plotIds) && (member.plotIds.includes('*') || member.plotIds.includes(plotId)))
    .map(member => {
      const activeLoad = workOrders.filter(order => order?.assigneeId === member.userId && !TERMINAL_WORK_STATUSES.has(normalized(order?.status))).length;
      const plotExperience = workOrders.filter(order => order?.assigneeId === member.userId && order?.plotId === plotId).length;
      return { member, activeLoad, plotExperience };
    })
    .sort((a, b) => a.activeLoad - b.activeLoad
      || b.plotExperience - a.plotExperience
      || memberName(a.member).localeCompare(memberName(b.member), 'zh-CN'));

  if (!eligible.length) return null;
  const best = eligible[0];
  return {
    ...best,
    reason: `${memberName(best.member)}有这块地的作业权限，当前进行中任务 ${best.activeLoad} 项，过往处理该地块 ${best.plotExperience} 次。`
  };
}

export function assessAlertCredibility(alert = {}, diagnosis = {}) {
  const raw = Number(diagnosis?.confidence);
  let score = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  const reasons = [];
  const primaryCause = normalized(diagnosis?.primaryCause || diagnosis?.riskType, 'INSUFFICIENT_EVIDENCE');
  const missingInformation = Array.isArray(diagnosis?.missingInformation) ? diagnosis.missingInformation.filter(Boolean) : [];

  if (primaryCause === 'INSUFFICIENT_EVIDENCE') {
    score = Math.min(score, 0.49);
    reasons.push('现有数据还不足以确定原因');
  }
  if (missingInformation.length) {
    score = Math.min(score, 0.74);
    reasons.push(`还需补充 ${missingInformation.length} 项检查`);
  }
  if (normalized(alert?.ruleState, 'CONFIRMED') === 'CANDIDATE') {
    score = Math.min(score, 0.69);
    reasons.push('告警规则尚未完全确认');
  }

  const highConfidence = score >= CONFIDENCE_THRESHOLD && primaryCause !== 'INSUFFICIENT_EVIDENCE' && !missingInformation.length;
  return {
    score,
    highConfidence,
    primaryCause,
    status: highConfidence ? 'AUTO_READY' : 'HUMAN_REVIEW',
    label: highConfidence ? '可自动处理' : '需人工审核',
    reason: reasons.join('；') || (highConfidence ? '多项数据相互印证，告警可信。' : '置信度未达到自动派单标准。')
  };
}

function dueHours(level) {
  return ({ CRITICAL: 1, HIGH: 2, MEDIUM: 4, LOW: 8 })[normalized(level, 'MEDIUM')] || 4;
}

function actionTypeFor(alert) {
  const text = `${alert?.title || ''} ${alert?.message || ''} ${alert?.source || ''}`.toLowerCase();
  return /device|sensor|设备|传感器|离线|漂移/.test(text) ? 'INSPECTION' : 'FIELD_OPERATION';
}

export const AdminAlertCenter = {
  props: ['state'],
  emits: ['show-chat', 'navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const filter = ref('REVIEW');
    const busyKey = ref('');
    const selectedIds = ref([]);
    const aiAudits = ref({});
    const aiSummary = ref(null);
    const isClosed = alert => ['CLOSED', 'RESOLVED'].includes(normalized(alert?.status));
    const existingTask = alert => (props.state.workOrders || []).find(order => order?.sourceType === 'ALERT' && order?.sourceRef === alert?.alertId);
    const isDispatched = alert => Boolean(existingTask(alert)?.assigneeId);
    const sortedAlerts = computed(() => [...(props.state.alerts || [])].sort((a, b) => {
      const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (rank[normalized(b.level)] || 0) - (rank[normalized(a.level)] || 0)
        || new Date(b.raisedAt || b.createdAt || 0) - new Date(a.raisedAt || a.createdAt || 0);
    }));
    const reviewAlerts = computed(() => sortedAlerts.value.filter(alert => !isClosed(alert) && !isDispatched(alert)));
    const dispatchedAlerts = computed(() => sortedAlerts.value.filter(alert => !isClosed(alert) && isDispatched(alert)));
    const closedAlerts = computed(() => sortedAlerts.value.filter(isClosed));
    const visibleAlerts = computed(() => ({ REVIEW: reviewAlerts.value, DISPATCHED: dispatchedAlerts.value, CLOSED: closedAlerts.value, ALL: sortedAlerts.value })[filter.value] || reviewAlerts.value);
    const selectableAlerts = computed(() => visibleAlerts.value.filter(alert => !isClosed(alert)));
    const selectedAlerts = computed(() => sortedAlerts.value.filter(alert => selectedIds.value.includes(alert.alertId) && !isClosed(alert)));
    const allVisibleSelected = computed(() => selectableAlerts.value.length > 0 && selectableAlerts.value.every(alert => selectedIds.value.includes(alert.alertId)));
    const plotName = plotId => props.state.plots.find(plot => plot.plotId === plotId)?.name || plotId || '未知地块';
    const levelLabel = level => LEVEL_LABELS[normalized(level)] || '注意';
    const auditFor = alert => aiAudits.value[alert.alertId] || null;
    const confidenceText = audit => audit ? `${Math.round(audit.score * 100)}%` : '未分析';

    const toggleSelectAll = () => {
      const visibleIds = selectableAlerts.value.map(alert => alert.alertId);
      selectedIds.value = allVisibleSelected.value
        ? selectedIds.value.filter(id => !visibleIds.includes(id))
        : [...new Set([...selectedIds.value, ...visibleIds])];
    };

    const invalidate = records => emit('data-invalidated', {
      domains: ['alerts', 'workOrders', 'overview'],
      plotIds: [...new Set(records.map(item => item?.plotId).filter(Boolean))]
    });
    const selectFarmer = alert => chooseBestFarmer(props.state.farmMembers || [], props.state.workOrders || [], alert.plotId);

    const ensureDispatched = async (alert, assignment = selectFarmer(alert)) => {
      if (!assignment?.member?.userId) throw new Error(`暂无有 ${plotName(alert.plotId)} 权限的在岗农户`);
      let task = existingTask(alert);
      if (task?.assigneeId) return task;
      if (!task) {
        task = await api.createWorkOrder({
          plotId: alert.plotId,
          title: `处理：${alert.title || '地块告警'}`,
          reason: alert.message || '根据 AI 分析安排现场检查与处理',
          sourceType: 'ALERT', sourceRef: alert.alertId, actionType: actionTypeFor(alert),
          priority: normalized(alert.level, 'MEDIUM'), status: 'OPEN', assigneeId: null,
          dueAt: new Date(Date.now() + dueHours(alert.level) * 60 * 60 * 1000).toISOString(),
          provenance: props.state.sessionMode === 'demo' ? 'SIMULATED' : 'DERIVED'
        });
        replaceById(props.state.workOrders, 'workOrderId', task);
      }
      const assigned = await api.assignWorkOrder(task.workOrderId || task.workItemId, {
        assigneeId: assignment.member.userId,
        note: `AI 智能派单：${assignment.reason}`
      });
      replaceById(props.state.workOrders, 'workOrderId', assigned);
      return assigned;
    };

    const dispatchOne = async alert => {
      const task = existingTask(alert);
      if (task?.assigneeId) return emit('navigate', 'work-orders', { highlight: task.workOrderId || task.workItemId });
      busyKey.value = `${alert.alertId}:dispatch`;
      try {
        const assignment = selectFarmer(alert);
        const saved = await ensureDispatched(alert, assignment);
        selectedIds.value = selectedIds.value.filter(id => id !== alert.alertId);
        toast(`已下发给 ${saved.assigneeName || memberName(assignment.member)}：${assignment.reason}`);
        invalidate([alert]);
      } catch (error) {
        toast(error.message || '任务下发失败', 'error');
      } finally {
        busyKey.value = '';
      }
    };

    const closeAlerts = async alerts => {
      if (!alerts.length) return toast('请先选择要关闭的告警', 'error');
      busyKey.value = 'batch:close';
      let completed = 0;
      try {
        for (const alert of alerts) {
          const saved = await api.closeAlert(alert.alertId);
          replaceById(props.state.alerts, 'alertId', saved);
          completed += 1;
        }
        selectedIds.value = selectedIds.value.filter(id => !alerts.some(alert => alert.alertId === id));
        toast(`已关闭 ${completed} 条告警`);
        invalidate(alerts);
      } catch (error) {
        toast(`已处理 ${completed} 条，${error.message || '关闭告警失败'}`, 'error');
      } finally {
        busyKey.value = '';
      }
    };

    const dispatchSelected = async () => {
      const alerts = selectedAlerts.value.filter(alert => !existingTask(alert)?.assigneeId);
      if (!alerts.length) return toast('请先选择尚未下发的告警', 'error');
      busyKey.value = 'batch:dispatch';
      let completed = 0;
      const failed = [];
      for (const alert of alerts) {
        try {
          await ensureDispatched(alert);
          completed += 1;
        } catch (error) {
          failed.push(`${plotName(alert.plotId)}：${error.message}`);
        }
      }
      selectedIds.value = selectedIds.value.filter(id => !alerts.some(alert => alert.alertId === id));
      busyKey.value = '';
      invalidate(alerts);
      toast(failed.length ? `成功下发 ${completed} 条，${failed.length} 条需人工处理` : `AI 已为 ${completed} 条告警选择农户并下发任务`, failed.length ? 'error' : 'success');
    };

    const aiProcess = async () => {
      const chosen = selectedAlerts.value.filter(alert => !existingTask(alert)?.assigneeId);
      const alerts = chosen.length ? chosen : reviewAlerts.value;
      if (!alerts.length) return toast('当前没有需要 AI 处理的告警');
      busyKey.value = 'batch:ai';
      let dispatched = 0;
      let review = 0;
      let failed = 0;
      for (const alert of alerts) {
        try {
          const diagnosis = await api.evaluateDiagnosis(alert.plotId, { traceId: `alert-ai-${Date.now()}-${alert.alertId}` });
          const audit = assessAlertCredibility(alert, diagnosis);
          const assignment = audit.highConfidence ? selectFarmer(alert) : null;
          if (audit.highConfidence && assignment) {
            await ensureDispatched(alert, assignment);
            aiAudits.value = { ...aiAudits.value, [alert.alertId]: { ...audit, farmerName: memberName(assignment.member), assignmentReason: assignment.reason } };
            dispatched += 1;
          } else {
            aiAudits.value = { ...aiAudits.value, [alert.alertId]: { ...audit, reason: `${audit.reason}${audit.highConfidence ? '。暂无有符合地块权限的在岗农户。' : ''}` } };
            review += 1;
          }
        } catch (error) {
          aiAudits.value = { ...aiAudits.value, [alert.alertId]: { score: 0, highConfidence: false, label: '分析失败', reason: error.message || '无法获取诊断结果' } };
          failed += 1;
        }
      }
      aiSummary.value = { total: alerts.length, dispatched, review, failed };
      selectedIds.value = selectedIds.value.filter(id => !alerts.some(alert => alert.alertId === id));
      busyKey.value = '';
      invalidate(alerts);
      toast(`AI 已检查 ${alerts.length} 条：自动下发 ${dispatched} 条，保留审核 ${review + failed} 条`);
    };

    return {
      filter, busyKey, selectedIds, visibleAlerts, selectableAlerts, selectedAlerts, allVisibleSelected,
      reviewCount: computed(() => reviewAlerts.value.length), dispatchedCount: computed(() => dispatchedAlerts.value.length), closedCount: computed(() => closedAlerts.value.length),
      isClosed, existingTask, plotName, levelLabel, auditFor, confidenceText, readableTime, normalized,
      aiSummary, toggleSelectAll, dispatchOne, closeAlerts, dispatchSelected, aiProcess,
      showChat: () => emit('show-chat'),
      openTask: alert => {
        const task = existingTask(alert);
        if (task) emit('navigate', 'work-orders', { highlight: task.workOrderId || task.workItemId });
      }
    };
  },
  template: `
    <section class="admin-alert-view" aria-labelledby="admin-alert-title">
      <header class="admin-alert-header">
        <div><p class="admin-alert-eyebrow">AI 告警助手</p><h2 id="admin-alert-title">AI 告警处置</h2><p>先核对告警可信度，再结合地块权限和当前任务量，把任务直接下发给合适的农户。</p></div>
        <button class="g-btn g-btn-outline" type="button" @click="showChat">询问 AI 助手</button>
      </header>

      <div class="admin-alert-tabs" role="group" aria-label="告警筛选">
        <button type="button" :class="{ active: filter === 'REVIEW' }" @click="filter = 'REVIEW'">待审核 {{ reviewCount }}</button>
        <button type="button" :class="{ active: filter === 'DISPATCHED' }" @click="filter = 'DISPATCHED'">已下发 {{ dispatchedCount }}</button>
        <button type="button" :class="{ active: filter === 'CLOSED' }" @click="filter = 'CLOSED'">已关闭 {{ closedCount }}</button>
        <button type="button" :class="{ active: filter === 'ALL' }" @click="filter = 'ALL'">全部</button>
      </div>

      <div class="admin-alert-ai-summary" v-if="aiSummary">
        <span class="admin-alert-ai-icon">AI</span><div><strong>本次已检查 {{ aiSummary.total }} 条告警</strong><p>自动下发 {{ aiSummary.dispatched }} 条，保留人工审核 {{ aiSummary.review + aiSummary.failed }} 条。不确定的告警不会自动派单。</p></div>
      </div>

      <div class="admin-alert-batch-bar">
        <label class="admin-alert-select-all" :class="{ disabled: !selectableAlerts.length }"><input type="checkbox" :checked="allVisibleSelected" :disabled="!selectableAlerts.length || busyKey !== ''" @change="toggleSelectAll"><span>全选当前列表</span></label>
        <span class="admin-alert-selection">已选 {{ selectedAlerts.length }} 条</span>
        <div class="admin-alert-batch-actions">
          <button class="g-btn g-btn-primary" type="button" :disabled="busyKey !== '' || !reviewCount" @click="aiProcess">{{ busyKey === 'batch:ai' ? 'AI 正在分析…' : 'AI 智能处理' }}</button>
          <button class="g-btn g-btn-tonal" type="button" :disabled="busyKey !== '' || !selectedAlerts.length" @click="dispatchSelected">一键下发任务</button>
          <button class="g-btn g-btn-outline" type="button" :disabled="busyKey !== '' || !selectedAlerts.length" @click="closeAlerts(selectedAlerts)">一键关闭告警</button>
        </div>
      </div>

      <div class="admin-alert-empty" v-if="!visibleAlerts.length">当前列表没有告警。</div>
      <div class="admin-alert-list" v-else>
        <article class="admin-alert-card" v-for="alert in visibleAlerts" :key="alert.alertId" :class="'level-' + normalized(alert.level, 'MEDIUM').toLowerCase()">
          <label class="admin-alert-check" v-if="!isClosed(alert)" :aria-label="'选择' + (alert.title || '告警')"><input type="checkbox" v-model="selectedIds" :value="alert.alertId" :disabled="busyKey !== ''"></label>
          <div class="admin-alert-main">
            <div class="admin-alert-title-row"><h3>{{ alert.title || '地块需要处理' }}</h3><span class="admin-alert-chip level">{{ levelLabel(alert.level) }}</span><span class="admin-alert-chip dispatched" v-if="existingTask(alert)">{{ existingTask(alert).assigneeId ? '已下发农户' : '等待分配' }}</span></div>
            <p class="admin-alert-meta">{{ plotName(alert.plotId) }} · {{ readableTime(alert.raisedAt || alert.createdAt) }}</p>
            <p class="admin-alert-message">{{ alert.message || '该地块存在需要人工确认的问题。' }}</p>
            <div class="admin-alert-audit" v-if="auditFor(alert)" :class="auditFor(alert).highConfidence ? 'is-ready' : 'needs-review'"><strong>AI 可信度 {{ confidenceText(auditFor(alert)) }} · {{ auditFor(alert).label }}</strong><span>{{ auditFor(alert).farmerName ? '已派给 ' + auditFor(alert).farmerName + '。' : '' }}{{ auditFor(alert).reason }}</span></div>
            <p class="admin-alert-source">检测来源：{{ alert.source || '系统规则' }}</p>
          </div>
          <div class="admin-alert-actions" v-if="!isClosed(alert)"><button class="g-btn g-btn-tonal" type="button" :disabled="busyKey !== ''" @click="existingTask(alert)?.assigneeId ? openTask(alert) : dispatchOne(alert)">{{ existingTask(alert)?.assigneeId ? '查看已下发任务' : 'AI 派单' }}</button><button class="g-btn g-btn-ghost" type="button" :disabled="busyKey !== ''" @click="closeAlerts([alert])">关闭告警</button></div>
        </article>
      </div>
    </section>
  `
};
