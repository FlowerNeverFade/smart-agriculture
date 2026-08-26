import { api } from './api.js';
import { adminMetricLabel, alertAcknowledgementAction } from './admin-state.js';

const { ref, computed, inject } = Vue;

const STATUS_LABELS = Object.freeze({ ACTIVE: '待确认', ACKED: '已确认', ESCALATED: '已升级', CLOSED: '已关闭', RESOLVED: '已解决' });
const LEVEL_LABELS = Object.freeze({ CRITICAL: '严重', HIGH: '紧急', MEDIUM: '注意', LOW: '提示' });

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

export const AdminAlertCenter = {
  props: ['state'],
  emits: ['show-diagnosis', 'navigate'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const filter = ref('OPEN');
    const busyKey = ref('');
    const isClosed = alert => ['CLOSED', 'RESOLVED'].includes(normalized(alert.status));
    const visibleAlerts = computed(() => (props.state.alerts || [])
      .filter(alert => filter.value === 'ALL' || (filter.value === 'CLOSED' ? isClosed(alert) : !isClosed(alert)))
      .sort((a, b) => {
        const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        return (rank[normalized(b.level)] || 0) - (rank[normalized(a.level)] || 0)
          || new Date(b.raisedAt || b.createdAt || 0) - new Date(a.raisedAt || a.createdAt || 0);
      }));
    const openCount = computed(() => (props.state.alerts || []).filter(alert => !isClosed(alert)).length);
    const closedCount = computed(() => (props.state.alerts || []).filter(isClosed).length);
    const plotName = plotId => props.state.plots.find(plot => plot.plotId === plotId)?.name || plotId || '未知地块';
    const statusLabel = status => STATUS_LABELS[normalized(status)] || '状态未知';
    const levelLabel = level => LEVEL_LABELS[normalized(level)] || '注意';
    const sourceLabel = source => adminMetricLabel(source, source || '系统规则');
    const existingTask = alert => props.state.workOrders.find(order => order.sourceType === 'ALERT' && order.sourceRef === alert.alertId);
    const acknowledgementAction = alert => alertAcknowledgementAction(alert?.status);

    const act = async (alert, action) => {
      busyKey.value = `${alert.alertId}:${action}`;
      try {
        const handler = { ack: api.ackAlert.bind(api), escalate: api.escalateAlert.bind(api), close: api.closeAlert.bind(api) }[action];
        if (!handler) throw new Error('不支持的告警操作');
        const acknowledgement = action === 'ack' ? acknowledgementAction(alert) : null;
        const saved = await handler(alert.alertId);
        replaceById(props.state.alerts, 'alertId', saved);
        toast(acknowledgement?.successMessage || (action === 'escalate' ? '告警已升级，请优先安排处理' : '告警已关闭'));
      } catch (error) {
        toast(error.message || '告警处理失败', 'error');
      } finally {
        busyKey.value = '';
      }
    };

    const convertToTask = async alert => {
      const existing = existingTask(alert);
      if (existing) {
        emit('navigate', 'work-orders', { highlight: existing.workOrderId || existing.workItemId });
        return;
      }
      busyKey.value = `${alert.alertId}:task`;
      try {
        const task = await api.createWorkOrder({
          plotId: alert.plotId,
          title: `处理：${alert.title || '地块告警'}`,
          reason: alert.message || '根据告警安排现场核查与处理',
          sourceType: 'ALERT',
          sourceRef: alert.alertId,
          actionType: 'FIELD_OPERATION',
          priority: normalized(alert.level, 'MEDIUM'),
          status: 'OPEN',
          assigneeId: null,
          dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          provenance: props.state.sessionMode === 'demo' ? 'SIMULATED' : 'USER_PROVIDED'
        });
        replaceById(props.state.workOrders, 'workOrderId', task);
        toast('已生成待分配任务，可在农务任务中继续分配');
      } catch (error) {
        toast(error.message || '告警转任务失败', 'error');
      } finally {
        busyKey.value = '';
      }
    };

    return {
      filter, busyKey, visibleAlerts, openCount, closedCount, isClosed, plotName, statusLabel, levelLabel, sourceLabel,
      existingTask, acknowledgementAction, readableTime, normalized, act, convertToTask, showDiagnosis: () => emit('show-diagnosis')
    };
  },
  template: `
    <section class="admin-alert-view" aria-labelledby="admin-alert-title">
      <header class="admin-alert-header">
        <div>
          <p class="admin-alert-eyebrow">农场管理员</p>
          <h2 id="admin-alert-title">告警处置</h2>
          <p>用容易理解的话说明问题，并给出下一步能直接执行的操作。</p>
        </div>
        <button class="g-btn g-btn-outline" type="button" @click="showDiagnosis">打开智能诊断</button>
      </header>

      <div class="admin-alert-tabs" role="group" aria-label="告警筛选">
        <button type="button" :class="{ active: filter === 'OPEN' }" @click="filter = 'OPEN'">待处理 {{ openCount }}</button>
        <button type="button" :class="{ active: filter === 'CLOSED' }" @click="filter = 'CLOSED'">已关闭 {{ closedCount }}</button>
        <button type="button" :class="{ active: filter === 'ALL' }" @click="filter = 'ALL'">全部</button>
      </div>

      <div class="admin-alert-empty" v-if="!visibleAlerts.length">当前筛选条件下没有告警。</div>
      <div class="admin-alert-list" v-else>
        <article class="admin-alert-card" v-for="alert in visibleAlerts" :key="alert.alertId" :class="'level-' + normalized(alert.level, 'MEDIUM').toLowerCase()">
          <div class="admin-alert-main">
            <div class="admin-alert-title-row">
              <h3>{{ alert.title || '地块需要处理' }}</h3>
              <span class="admin-alert-chip" :class="'state-' + normalized(alert.status, 'ACTIVE').toLowerCase()">{{ statusLabel(alert.status) }}</span>
              <span class="admin-alert-chip level">{{ levelLabel(alert.level) }}</span>
            </div>
            <p class="admin-alert-meta">{{ plotName(alert.plotId) }} · {{ readableTime(alert.raisedAt || alert.createdAt) }}</p>
            <p class="admin-alert-message">{{ alert.message || '该地块存在需要人工确认的问题。' }}</p>
            <p class="admin-alert-source">来源：{{ sourceLabel(alert.source) }}</p>
          </div>

          <div class="admin-alert-actions" v-if="!isClosed(alert)">
            <button class="g-btn g-btn-outline" type="button" v-if="acknowledgementAction(alert)" :disabled="busyKey !== ''" @click="act(alert, 'ack')">{{ acknowledgementAction(alert).label }}</button>
            <button class="g-btn g-btn-outline" type="button" v-if="normalized(alert.status) !== 'ESCALATED'" :disabled="busyKey !== ''" @click="act(alert, 'escalate')">升级处理</button>
            <button class="g-btn g-btn-tonal" type="button" :disabled="busyKey !== ''" @click="convertToTask(alert)">{{ existingTask(alert) ? '查看关联任务' : '转成任务' }}</button>
            <button class="g-btn g-btn-ghost" type="button" :disabled="busyKey !== ''" @click="act(alert, 'close')">关闭告警</button>
          </div>
        </article>
      </div>
    </section>
  `
};
