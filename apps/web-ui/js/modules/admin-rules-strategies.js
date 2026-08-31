import { api } from '../api.js?v=20260830-ai-assistant-state-v4';
import { adminMetricLabel } from '../admin-state.js';

const { ref, computed, inject, onMounted, watch } = Vue;

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿', OFFLINE_VALIDATED: '离线验证通过', APPROVED: '已批准', ACTIVE: '已启用',
  REJECTED: '已拒绝', SUPERSEDED: '已替换', ROLLED_BACK: '已回滚', VERIFIED: '已验证', PENDING: '待验证'
});
const OPERATOR_LABELS = Object.freeze({ LT: '低于', LTE: '不高于', GT: '高于', GTE: '不低于', EQ: '等于' });

function upper(value, fallback = 'DRAFT') {
  return String(value || fallback).trim().toUpperCase();
}

function statusLabel(value) {
  return STATUS_LABELS[upper(value)] || value || '未知';
}

function statusTone(value) {
  return ({ ACTIVE: 'published', APPROVED: 'approved', OFFLINE_VALIDATED: 'verified', VERIFIED: 'verified', DRAFT: 'draft', PENDING: 'pending', REJECTED: 'rejected', SUPERSEDED: 'disabled', ROLLED_BACK: 'rejected' })[upper(value)] || 'info';
}

function formatCondition(rule = {}) {
  const metric = adminMetricLabel(rule.metric || rule.metricCode, rule.metric || rule.metricCode || '指标');
  const operator = OPERATOR_LABELS[upper(rule.operator, '')] || rule.operator || '达到';
  const threshold = rule.threshold ?? rule.value ?? '—';
  const unit = rule.unit || '';
  return `${metric} ${operator} ${threshold}${unit}`;
}

export const AdminRulesStrategiesView = {
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const activeTab = ref(props.routeParams?.tab === 'candidates' ? 'candidates' : 'rules');
    const busy = ref(false);
    const loadError = ref('');
    const farmId = computed(() => props.state.adminContext?.farmId || props.routeParams?.farmId || '');
    const rules = computed(() => props.state.adminRules || []);
    const candidates = computed(() => props.state.adminStrategyCandidates || []);
    const filteredRules = computed(() => rules.value);
    const filteredCandidates = computed(() => candidates.value);

    const refresh = async () => {
      if (!farmId.value || props.state.sessionMode !== 'live') return;
      loadError.value = '';
      try {
        const [nextRules, nextCandidates] = await Promise.all([
          api.getRuleSets(farmId.value),
          api.getStrategyCandidates({ farmId: farmId.value })
        ]);
        props.state.adminRules = nextRules || [];
        props.state.adminStrategyCandidates = nextCandidates || [];
      } catch (error) {
        loadError.value = error.message || '规则与策略读取失败';
      }
    };

    const candidateId = candidate => candidate?.candidateId || candidate?.id || '';
    const candidateDescription = candidate => candidate?.summary || candidate?.description || candidate?.signature || candidateId(candidate) || '未命名策略候选';
    const evidenceCount = candidate => Number(candidate?.evidenceCount || candidate?.caseCount || candidate?.evidenceCaseIds?.length || 0);
    const consistency = candidate => {
      const value = Number(candidate?.consistency);
      return Number.isFinite(value) ? `${Math.round((value <= 1 ? value : value / 100) * 100)}%` : '—';
    };
    const canActivate = candidate => ['OFFLINE_VALIDATED', 'APPROVED', 'VERIFIED'].includes(upper(candidate?.status));
    const canReject = candidate => ['DRAFT', 'OFFLINE_VALIDATED'].includes(upper(candidate?.status));
    const canRollback = candidate => upper(candidate?.status) === 'ACTIVE';

    const transition = async (candidate, target) => {
      const id = candidateId(candidate);
      if (!id || busy.value) return;
      busy.value = true;
      try {
        const options = { expectedRevision: candidate.revision, idempotencyKey: `strategy:${id}:${target}` };
        const saved = target === 'ACTIVE'
          ? await api.activateStrategyCandidate(id, options)
          : await api.transitionStrategyCandidate(id, target, options);
        const index = candidates.value.findIndex(item => candidateId(item) === id);
        if (index >= 0) candidates.value.splice(index, 1, { ...candidates.value[index], ...saved, status: saved?.status || target });
        emit('data-invalidated', { domains: ['rulesStrategies', 'alerts', 'overview'], record: saved });
        toast(target === 'ACTIVE' ? '策略候选已批准并启用；相似告警将生成待确认预览' : `策略候选已${statusLabel(target)}`);
      } catch (error) {
        toast(error.message || '策略候选状态更新失败', 'error');
      } finally {
        busy.value = false;
      }
    };

    watch(() => props.routeParams?.tab, value => { if (value === 'rules' || value === 'candidates') activeTab.value = value; });
    watch(farmId, refresh, { immediate: true });
    onMounted(refresh);

    return {
      activeTab, busy, loadError, farmId, filteredRules, filteredCandidates,
      statusLabel, statusTone, formatCondition, candidateId, candidateDescription,
      evidenceCount, consistency, canActivate, canReject, canRollback, transition, refresh
    };
  },
  template: `
    <section class="admin-governance-page" aria-labelledby="admin-governance-title">
      <header class="admin-section-header">
        <div><span class="admin-eyebrow">当前农场 · 受控治理</span><h1 id="admin-governance-title">规则与策略</h1><p>规则集负责确定性判断；策略候选只在案例积累和离线验证后，由管理员决定是否启用。</p></div>
        <div class="admin-governance-farm-badge"><app-icon name="verified_user"></app-icon><span>{{ farmId || '未选择农场' }}</span></div>
      </header>
      <div class="admin-tabs admin-governance-tabs" role="tablist" aria-label="规则与策略内容">
        <button class="admin-tab" :class="{active: activeTab === 'rules'}" role="tab" :aria-selected="activeTab === 'rules'" @click="activeTab = 'rules'">规则集 <small>{{ filteredRules.length }}</small></button>
        <button class="admin-tab" :class="{active: activeTab === 'candidates'}" role="tab" :aria-selected="activeTab === 'candidates'" @click="activeTab = 'candidates'">策略候选集 <small>{{ filteredCandidates.length }}</small></button>
      </div>
      <div v-if="loadError" class="admin-governance-error" role="alert"><app-icon name="error"></app-icon><span>{{ loadError }}</span><button type="button" class="g-btn secondary compact" @click="refresh">重新读取</button></div>
      <section v-if="activeTab === 'rules'" class="admin-governance-section" aria-label="农场告警规则集">
        <div class="admin-governance-section-head"><div><h2>告警规则集</h2><p>规则阈值来自全局规则和当前农场已启用 Crop Pack，策略模型不能改写这些判断边界。</p></div><span class="admin-governance-readonly"><app-icon name="lock"></app-icon>只读规则</span></div>
        <div v-if="!filteredRules.length" class="admin-governance-empty"><app-icon name="rule_folder"></app-icon><strong>暂无可展示的规则集</strong><span>启用 Crop Pack 后，相关规则会出现在这里。</span></div>
        <div v-else class="admin-table-wrap admin-governance-table-wrap"><table class="admin-table"><thead><tr><th>规则编号</th><th>适用作物 / 阶段</th><th>判断条件</th><th>持续时间</th><th>冷却时间</th><th>版本 / 范围</th></tr></thead><tbody><tr v-for="(rule, index) in filteredRules" :key="rule.ruleSetId || rule.ruleId || rule.id || index"><td><strong class="admin-governance-code">{{ rule.code || rule.ruleId || rule.id || 'RULE' }}</strong><small>{{ rule.name || rule.description || '确定性告警规则' }}</small></td><td>{{ rule.cropCode || '全局' }}<small>{{ rule.stageCode || rule.stage || '所有阶段' }}</small></td><td>{{ formatCondition(rule) }}</td><td>{{ rule.durationMinutes ?? rule.duration ?? '—' }}<span v-if="rule.durationMinutes || rule.duration"> 分钟</span></td><td>{{ rule.cooldownMinutes ?? rule.cooldown ?? '—' }}<span v-if="rule.cooldownMinutes || rule.cooldown"> 分钟</span></td><td><span class="status-pill info">{{ rule.ruleVersion || rule.version || '—' }}</span><small>{{ rule.scope === 'FARM' ? '当前农场' : '全局规则' }}</small></td></tr></tbody></table></div>
      </section>
      <section v-else class="admin-governance-section" aria-label="农场策略候选集">
        <div class="admin-governance-section-head"><div><h2>策略候选集</h2><p>案例达到门槛并通过确定性离线回放后，才允许批准启用；启用不会绕过人工确认。</p></div><span class="admin-governance-readonly"><app-icon name="fact_check"></app-icon>管理员决策</span></div>
        <div v-if="!filteredCandidates.length" class="admin-governance-empty"><app-icon name="auto_awesome"></app-icon><strong>尚未形成策略候选</strong><span>完成同类告警闭环后，系统会按农场自动聚合案例。</span></div>
        <div v-else class="admin-table-wrap admin-governance-table-wrap"><table class="admin-table"><thead><tr><th>候选编号</th><th>学习来源 / 特征</th><th>案例数量</th><th>一致率</th><th>离线验证</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="candidate in filteredCandidates" :key="candidateId(candidate)"><td><strong class="admin-governance-code">{{ candidateId(candidate) }}</strong><small>{{ candidate.createdAt ? String(candidate.createdAt).slice(0, 16).replace('T', ' ') : '—' }}</small></td><td><span class="status-pill agent">{{ candidate.sourceLabel || candidate.source || '案例学习' }}</span><small class="admin-governance-description">{{ candidateDescription(candidate) }}</small></td><td>{{ evidenceCount(candidate) }} 条</td><td>{{ consistency(candidate) }}</td><td><span class="status-pill" :class="statusTone(candidate.offlineValidation?.status || candidate.validationStatus || candidate.status)">{{ statusLabel(candidate.offlineValidation?.status || candidate.validationStatus || candidate.status) }}</span></td><td><span class="status-pill" :class="statusTone(candidate.status)">{{ statusLabel(candidate.status) }}</span></td><td class="admin-governance-actions"><button v-if="canActivate(candidate)" type="button" class="g-btn text sm" :disabled="busy" @click="transition(candidate, 'ACTIVE')">批准并启用</button><button v-if="canReject(candidate)" type="button" class="g-btn text sm danger-text" :disabled="busy" @click="transition(candidate, 'REJECTED')">拒绝</button><button v-if="canRollback(candidate)" type="button" class="g-btn text sm danger-text" :disabled="busy" @click="transition(candidate, 'ROLLED_BACK')">回滚</button><span v-if="!canActivate(candidate) && !canReject(candidate) && !canRollback(candidate)" class="admin-governance-muted">只读</span></td></tr></tbody></table></div>
      </section>
    </section>
  `
};
