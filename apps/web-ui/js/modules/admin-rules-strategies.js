import { api } from '../api.js?v=20260831-rules-ai-v1';
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
    const showRuleModal = ref(false);
    const ruleForm = ref({
      code: '', name: '', cropCode: '', stageCode: '', metric: 'soilMoisture', operator: 'LT',
      threshold: '', unit: '%', durationMinutes: 15, cooldownMinutes: 30, ruleVersion: 'farm-rule-1.0.0'
    });
    const farmId = computed(() => props.state.adminContext?.farmId || props.routeParams?.farmId || '');
    const rules = computed(() => props.state.adminRules || []);
    const candidates = computed(() => props.state.adminStrategyCandidates || []);
    const filteredRules = computed(() => rules.value);
    const filteredCandidates = computed(() => candidates.value);

    const refresh = async () => {
      if (!farmId.value) return;
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

    const openRuleCreate = () => {
      ruleForm.value = {
        code: '', name: '', cropCode: '', stageCode: '', metric: 'soilMoisture', operator: 'LT',
        threshold: '', unit: '%', durationMinutes: 15, cooldownMinutes: 30, ruleVersion: 'farm-rule-1.0.0'
      };
      showRuleModal.value = true;
    };

    const createRule = async () => {
      if (busy.value) return;
      const draft = { ...ruleForm.value, code: String(ruleForm.value.code || '').trim(), name: String(ruleForm.value.name || '').trim() };
      if (!draft.code || !draft.name || draft.threshold === '' || !farmId.value) {
        toast('请填写规则编号、名称和阈值', 'error');
        return;
      }
      busy.value = true;
      try {
        const saved = await api.createFarmRule(farmId.value, { ...draft, idempotencyKey: `farm-rule:${farmId.value}:${draft.code}` });
        const next = [...(props.state.adminRules || []).filter(rule => (rule.ruleId || rule.code) !== (saved.ruleId || saved.code)), saved];
        props.state.adminRules = next;
        showRuleModal.value = false;
        emit('data-invalidated', { domains: ['rulesStrategies', 'alerts', 'overview'], farmId: farmId.value, record: saved, reason: 'farm-rule-created' });
        toast('规则已新增并同步到当前农场数据源');
      } catch (error) {
        toast(error.message || '规则新增失败', 'error');
      } finally {
        busy.value = false;
      }
    };

    watch(() => props.routeParams?.tab, value => { if (value === 'rules' || value === 'candidates') activeTab.value = value; });
    watch(farmId, refresh, { immediate: true });
    onMounted(refresh);

    return {
      activeTab, busy, loadError, farmId, filteredRules, filteredCandidates, showRuleModal, ruleForm,
      statusLabel, statusTone, formatCondition, candidateId, candidateDescription,
      evidenceCount, consistency, canActivate, canReject, canRollback, transition, refresh, openRuleCreate, createRule
    };
  },
  template: `
    <section class="admin-governance-page" aria-labelledby="admin-governance-title">
      <header class="admin-section-header">
        <div><span class="admin-eyebrow">当前农场 · 受控治理</span><h1 id="admin-governance-title">规则与策略</h1><p>规则集负责确定性判断；策略候选只在案例积累和离线验证后，由管理员决定是否启用。</p></div>
      </header>
      <div class="admin-tabs admin-governance-tabs" role="tablist" aria-label="规则与策略内容">
        <button class="admin-tab" :class="{active: activeTab === 'rules'}" role="tab" :aria-selected="activeTab === 'rules'" @click="activeTab = 'rules'">规则集 <small>{{ filteredRules.length }}</small></button>
        <button class="admin-tab" :class="{active: activeTab === 'candidates'}" role="tab" :aria-selected="activeTab === 'candidates'" @click="activeTab = 'candidates'">策略候选集 <small>{{ filteredCandidates.length }}</small></button>
      </div>
      <div v-if="loadError" class="admin-governance-error" role="alert"><app-icon name="error"></app-icon><span>{{ loadError }}</span><button type="button" class="g-btn secondary compact" @click="refresh">重新读取</button></div>
      <section v-if="activeTab === 'rules'" class="admin-governance-section" aria-label="农场告警规则集">
        <div class="admin-governance-section-head"><div><h2>告警规则集</h2><p>规则阈值来自全局规则和当前农场已启用 Crop Pack；新增规则会写入当前农场，并供告警、预测和 AI 助手读取。</p></div><button type="button" class="g-btn primary compact" :disabled="busy || !farmId" @click="openRuleCreate"><app-icon name="add"></app-icon>新增规则</button></div>
        <div v-if="!filteredRules.length" class="admin-governance-empty"><app-icon name="rule_folder"></app-icon><strong>暂无可展示的规则集</strong><span>启用 Crop Pack 后，相关规则会出现在这里。</span></div>
        <div v-else class="admin-table-wrap admin-governance-table-wrap"><table class="admin-table"><thead><tr><th>规则编号</th><th>适用作物 / 阶段</th><th>判断条件</th><th>持续时间</th><th>冷却时间</th><th>版本 / 范围</th></tr></thead><tbody><tr v-for="(rule, index) in filteredRules" :key="rule.ruleSetId || rule.ruleId || rule.id || index"><td><strong class="admin-governance-code">{{ rule.code || rule.ruleId || rule.id || 'RULE' }}</strong><small>{{ rule.name || rule.description || '确定性告警规则' }}</small></td><td>{{ rule.cropCode || '全局' }}<small>{{ rule.stageCode || rule.stage || '所有阶段' }}</small></td><td>{{ formatCondition(rule) }}</td><td>{{ rule.durationMinutes ?? rule.duration ?? '—' }}<span v-if="rule.durationMinutes || rule.duration"> 分钟</span></td><td>{{ rule.cooldownMinutes ?? rule.cooldown ?? '—' }}<span v-if="rule.cooldownMinutes || rule.cooldown"> 分钟</span></td><td><span class="status-pill info">{{ rule.ruleVersion || rule.version || '—' }}</span><small>{{ rule.scope === 'FARM' ? '当前农场' : '全局规则' }}</small></td></tr></tbody></table></div>
      </section>
      <div v-if="showRuleModal" class="g-modal-overlay" @click.self="showRuleModal = false" @keydown.esc="showRuleModal = false">
        <form class="g-modal admin-rule-dialog" @submit.prevent="createRule">
          <div class="g-modal-header"><div><small>当前农场 · FARM RULE</small><h3>新增告警规则</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭新增规则" @click="showRuleModal = false"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body admin-rule-form-grid">
            <label><span>规则编号</span><input class="g-input" v-model="ruleForm.code" pattern="[a-z0-9][a-z0-9_-]{1,63}" placeholder="如 soil-dry-01" required><small>使用小写字母、数字、下划线或短横线。</small></label>
            <label><span>规则名称</span><input class="g-input" v-model="ruleForm.name" maxlength="80" placeholder="如 土壤湿度偏低" required></label>
            <label><span>适用作物</span><select class="g-select" v-model="ruleForm.cropCode"><option value="">全场作物</option><option v-for="pack in state.cropPacks || []" :key="pack.cropCode" :value="pack.cropCode">{{ pack.identity?.name || pack.cropName || pack.cropCode }}</option></select></label>
            <label><span>生长阶段</span><input class="g-input" v-model="ruleForm.stageCode" placeholder="留空表示所有阶段"></label>
            <label><span>监测指标</span><select class="g-select" v-model="ruleForm.metric"><option value="soilMoisture">土壤湿度</option><option value="airTemperature">空气温度</option><option value="airHumidity">空气湿度</option><option value="light">光照</option></select></label>
            <label><span>判断条件</span><div class="admin-rule-condition"><select class="g-select" v-model="ruleForm.operator"><option value="LT">低于</option><option value="LTE">不高于</option><option value="GT">高于</option><option value="GTE">不低于</option><option value="EQ">等于</option></select><input class="g-input" v-model="ruleForm.threshold" type="number" step="any" placeholder="阈值" required><input class="g-input" v-model="ruleForm.unit" maxlength="8" placeholder="单位"></div></label>
            <label><span>持续时间（分钟）</span><input class="g-input" v-model.number="ruleForm.durationMinutes" type="number" min="0" step="1"></label>
            <label><span>冷却时间（分钟）</span><input class="g-input" v-model.number="ruleForm.cooldownMinutes" type="number" min="0" step="1"></label>
            <label class="span-2"><span>规则版本</span><input class="g-input" v-model="ruleForm.ruleVersion" pattern="[A-Za-z0-9._-]+" placeholder="farm-rule-1.0.0"></label>
            <p class="admin-rule-form-note span-2"><app-icon name="info"></app-icon>新增规则会立即进入当前农场规则集。规则仍由确定性引擎判断，AI 仅解释原因，不会自动执行设备操作。</p>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" @click="showRuleModal = false">取消</button><button type="submit" class="g-btn primary" :disabled="busy">{{ busy ? '保存中…' : '保存并同步' }}</button></div>
        </form>
      </div>
      <section v-else-if="activeTab === 'candidates'" class="admin-governance-section" aria-label="农场策略候选集">
        <div class="admin-governance-section-head"><div><h2>策略候选集</h2><p>案例达到门槛并通过确定性离线回放后，才允许批准启用；启用不会绕过人工确认。</p></div><span class="admin-governance-readonly"><app-icon name="fact_check"></app-icon>管理员决策</span></div>
        <div v-if="!filteredCandidates.length" class="admin-governance-empty"><app-icon name="auto_awesome"></app-icon><strong>尚未形成策略候选</strong><span>完成同类告警闭环后，系统会按农场自动聚合案例。</span></div>
        <div v-else class="admin-table-wrap admin-governance-table-wrap"><table class="admin-table"><thead><tr><th>候选编号</th><th>学习来源 / 特征</th><th>案例数量</th><th>一致率</th><th>离线验证</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="candidate in filteredCandidates" :key="candidateId(candidate)"><td><strong class="admin-governance-code">{{ candidateId(candidate) }}</strong><small>{{ candidate.createdAt ? String(candidate.createdAt).slice(0, 16).replace('T', ' ') : '—' }}</small></td><td><span class="status-pill agent">{{ candidate.sourceLabel || candidate.source || '案例学习' }}</span><small class="admin-governance-description">{{ candidateDescription(candidate) }}</small></td><td>{{ evidenceCount(candidate) }} 条</td><td>{{ consistency(candidate) }}</td><td><span class="status-pill" :class="statusTone(candidate.offlineValidation?.status || candidate.validationStatus || candidate.status)">{{ statusLabel(candidate.offlineValidation?.status || candidate.validationStatus || candidate.status) }}</span></td><td><span class="status-pill" :class="statusTone(candidate.status)">{{ statusLabel(candidate.status) }}</span></td><td class="admin-governance-actions"><button v-if="canActivate(candidate)" type="button" class="g-btn text sm" :disabled="busy" @click="transition(candidate, 'ACTIVE')">批准并启用</button><button v-if="canReject(candidate)" type="button" class="g-btn text sm danger-text" :disabled="busy" @click="transition(candidate, 'REJECTED')">拒绝</button><button v-if="canRollback(candidate)" type="button" class="g-btn text sm danger-text" :disabled="busy" @click="transition(candidate, 'ROLLED_BACK')">回滚</button><span v-if="!canActivate(candidate) && !canReject(candidate) && !canRollback(candidate)" class="admin-governance-muted">只读</span></td></tr></tbody></table></div>
      </section>
    </section>
  `
};
