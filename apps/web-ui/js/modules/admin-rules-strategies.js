import { api } from '../api.js?v=20260901-v593-market-v3';
import { adminMetricLabel } from '../admin-state.js';

const { ref, computed, inject, onMounted, watch } = Vue;

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿', OFFLINE_VALIDATED: '离线验证通过', APPROVED: '已批准', ACTIVE: '已启用',
  REJECTED: '已拒绝', SUPERSEDED: '已替换', ROLLED_BACK: '已回滚', VERIFIED: '已验证', PENDING: '待验证',
  PUBLISHED: '已发布', DISABLED: '已停用', UNKNOWN: '待确认'
});
const OPERATOR_LABELS = Object.freeze({ LT: '低于', LTE: '不高于', GT: '高于', GTE: '不低于', EQ: '等于' });
const RULE_LABELS = Object.freeze({
  WATER_DEFICIT: '水分不足', HEAT_STRESS: '高温胁迫', COLD_STRESS: '低温冷害',
  SENSOR_DRIFT: '传感器漂移', DEVICE_FAULT: '设备故障', DATA_STALE: '数据过期',
  RAINFALL_EXCESS: '降雨过量'
});
const CROP_LABELS = Object.freeze({ tomato: '番茄', cucumber: '黄瓜', strawberry: '草莓', corn: '玉米', sunflower: '向日葵', rice: '水稻', maize: '玉米', eggplant: '茄子', lettuce: '生菜', pepper: '辣椒' });
const STAGE_LABELS = Object.freeze({ seedling: '苗期', vegetative: '营养生长期', flowering: '开花期', fruiting: '结果期',
  germination: '出苗期', tillering: '分蘖期', heading: '抽穗期', harvest: '采收期' });
const SOURCE_LABELS = Object.freeze({ learning: '历史案例学习', manual: '人工经验', rule: '规则推演', system: '系统分析', simulated: '模拟分析' });

function upper(value, fallback = 'DRAFT') {
  return String(value || fallback).trim().toUpperCase();
}

function statusLabel(value) {
  return STATUS_LABELS[upper(value, 'UNKNOWN')] || '待确认';
}

function statusTone(value) {
  return ({ ACTIVE: 'published', APPROVED: 'approved', OFFLINE_VALIDATED: 'verified', VERIFIED: 'verified', DRAFT: 'draft', PENDING: 'pending', REJECTED: 'rejected', SUPERSEDED: 'disabled', ROLLED_BACK: 'rejected' })[upper(value)] || 'info';
}

function formatCondition(rule = {}) {
  const rawMetric = adminMetricLabel(rule.metric || rule.metricCode, '') || '监测指标';
  const metric = /[A-Za-z_]/.test(rawMetric) ? '监测指标' : rawMetric;
  const operator = OPERATOR_LABELS[upper(rule.operator, '')] || '达到';
  const threshold = rule.threshold ?? rule.value ?? '—';
  const unit = rule.unit || '';
  return `${metric} ${operator} ${threshold}${unit}`;
}

function translateKnownText(value = '') {
  return String(value || '')
    .replace(/WATER_DEFICIT(?:_RULE)?/gi, '水分不足')
    .replace(/HEAT_STRESS/gi, '高温胁迫')
    .replace(/COLD_STRESS/gi, '低温冷害')
    .replace(/SENSOR_DRIFT(?:_RULE)?/gi, '传感器漂移')
    .replace(/DEVICE_FAULT(?:_RULE)?/gi, '设备故障')
    .replace(/\b(?:LEARNING|LEARNED)\b/gi, '案例学习')
    .replace(/\bCASE[-_]?/gi, '案例')
    .replace(/\bMANUAL\b/gi, '人工经验')
    .replace(/\b(?:GLOBAL|SYSTEM)\b/gi, '系统规则')
    .replace(/\bFARM\b/gi, '当前农场');
}

function cropLabel(value) {
  const normalized = String(value || '').trim();
  return CROP_LABELS[normalized.toLowerCase()] || (/[A-Za-z_]/.test(normalized) ? '其他作物' : normalized) || '全场作物';
}

function stageLabel(value) {
  const normalized = String(value || '').trim();
  return STAGE_LABELS[normalized.toLowerCase()] || (/[A-Za-z_]/.test(normalized) ? '全生长期' : normalized) || '所有阶段';
}

function ruleDisplayName(rule = {}, index = 0) {
  const name = translateKnownText(rule.name || rule.description || '').trim();
  if (name && !/^[A-Z0-9_-]+$/.test(name)) return name;
  const code = upper(rule.code || rule.ruleId || rule.id, '');
  // 同 code 规则在不同作物下会重名（编号撞），追加作物名区分
  const label = RULE_LABELS[code];
  if (label) {
    const crop = cropLabel(rule.cropCode);
    return crop && crop !== '全场作物' ? `${label}（${crop}）` : label;
  }
  return `告警规则 ${index + 1}`;
}

export function ruleCodeValue(rule = {}) {
  return upper(rule.code || rule.ruleId || rule.id, 'RULE');
}

function ruleDescription(rule = {}) {
  const description = translateKnownText(rule.description || rule.name || '').trim();
  return description && !/^[A-Z0-9_-]+$/.test(description) ? description : '确定性告警判断';
}

function versionLabel(value) {
  const version = String(value || '').replace(/^(?:farm-)?rule-/i, '').trim();
  return version ? `第 ${version} 版` : '未设置版本';
}

function sourceLabel(candidate = {}) {
  const raw = String(candidate.sourceLabel || candidate.source || '').trim();
  const translated = SOURCE_LABELS[raw.toLowerCase()] || translateKnownText(raw);
  return translated && !/[A-Za-z_]/.test(translated) ? translated : '案例学习';
}

// Keep strategy evidence readable in the governance view without exposing
// internal JSON blobs or model-confidence wording to ordinary users.
const STRATEGY_FIELD_LABELS = Object.freeze({
  source: '来源', signature: '特征', action: '动作', metric: '指标',
  threshold: '阈值', durationMinutes: '持续时间', cooldownMinutes: '冷却时间',
  ruleVersion: '规则版本', scenarioId: '场景', scope: '范围'
});

function strategySummary(value) {
  if (value === null || value === undefined || value === '') return '未记录';
  if (typeof value !== 'object') return translateKnownText(String(value)) || '未记录';
  if (Array.isArray(value)) return value.map(item => strategySummary(item)).filter(Boolean).join('、') || '未记录';
  const parts = Object.entries(value)
    .slice(0, 6)
    .map(([key, item]) => `${STRATEGY_FIELD_LABELS[key] || key}：${strategySummary(item)}`);
  return translateKnownText(parts.join('；')) || '未记录';
}

function rollbackSummary(candidate = {}) {
  const actor = candidate.rolledBackBy || candidate.transitionedBy || '';
  const at = candidate.rolledBackAt || candidate.transitionedAt || '';
  const reason = candidate.rollbackReason || '';
  const detail = [actor && `操作人 ${actor}`, at && String(at).slice(0, 16).replace('T', ' '), reason && translateKnownText(reason)].filter(Boolean).join(' · ');
  return detail || '已回滚到上一版本';
}

export const AdminRulesStrategiesView = {
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const activeTab = ref(['candidates', 'learning'].includes(props.routeParams?.tab) ? props.routeParams.tab : 'rules');
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
    const cropPacks = computed(() => props.state.cropPacks || []);
    const cropDisplayName = rule => {
      const direct = String(rule?.cropName || rule?.crop?.name || '').trim();
      if (direct && !/^[A-Za-z0-9_-]+$/.test(direct)) return direct;
      const code = String(rule?.cropCode || '').trim().toLowerCase();
      const pack = cropPacks.value.find(item => String(item?.cropCode || '').trim().toLowerCase() === code);
      const fallback = cropLabel(rule?.cropCode);
      // Preserve custom crop identifiers when no pack name is available;
      // never collapse an administrator-created crop into “其他作物”.
      return String(pack?.identity?.name || pack?.cropName || direct || '').trim()
        || (fallback === '其他作物' ? String(rule?.cropCode || '').trim() || '全场作物' : fallback);
    };
    const displayRules = computed(() => {
      const rows = rules.value.map((rule, index) => ({ ...rule, __sourceIndex: index }));
      const sorted = [...rows].sort((a, b) => String(a.cropCode || '').localeCompare(String(b.cropCode || ''))
        || String(a.stageCode || a.stage || '').localeCompare(String(b.stageCode || b.stage || ''))
        || String(a.scope || '').localeCompare(String(b.scope || ''))
        || String(a.version || a.ruleVersion || '').localeCompare(String(b.version || b.ruleVersion || ''))
        || ruleCodeValue(a).localeCompare(ruleCodeValue(b))
        || a.__sourceIndex - b.__sourceIndex);
      const counters = new Map();
      const displayByIndex = new Map();
      sorted.forEach(rule => {
        const code = ruleCodeValue(rule);
        const next = (counters.get(code) || 0) + 1;
        counters.set(code, next);
        displayByIndex.set(rule.__sourceIndex, `${code}-${String(next).padStart(2, '0')}`);
      });
      return rows.map(rule => ({
        ...rule,
        displayCode: displayByIndex.get(rule.__sourceIndex) || `${ruleCodeValue(rule)}-01`,
        displayKey: [rule.scope || '', rule.cropCode || '', rule.version || rule.ruleVersion || '', ruleCodeValue(rule), rule.stageCode || rule.stage || '', rule.__sourceIndex].join(':')
      }));
    });
    const filteredRules = computed(() => displayRules.value);
    const filteredCandidates = computed(() => candidates.value);
    const learningCases = computed(() => props.state.adminLearningCases || []);
    const learningFilter = ref('ALL');
    const learningBusyId = ref('');
      const learningPageSize = 10;
      const learningCurrentPage = ref(1);
      const learningJumpInput = ref(1);
      const learningTotalPages = computed(() => Math.max(1, Math.ceil(filteredLearningCases.value.length / learningPageSize)));
      const learningPageRecords = computed(() => {
        const start = (learningCurrentPage.value - 1) * learningPageSize;
        return filteredLearningCases.value.slice(start, start + learningPageSize);
      });
      watch(learningFilter, () => { learningCurrentPage.value = 1; });

    const filteredLearningCases = computed(() => {
      const wanted = upper(learningFilter.value, 'ALL');
      return learningCases.value.filter((item) => wanted === 'ALL' || upper(item?.qualityStatus, 'PENDING') === wanted);
    });
    const learningCounts = computed(() => learningCases.value.reduce((counts, item) => {
      const status = upper(item?.qualityStatus, 'PENDING');
      if (status === 'QUALIFIED') counts.qualified += 1;
      else if (status === 'REJECTED') counts.rejected += 1;
      else counts.pending += 1;
      return counts;
    }, { qualified: 0, pending: 0, rejected: 0 }));

    const refresh = async () => {
      if (!farmId.value) return;
      loadError.value = '';
      try {
        const [nextRules, nextCandidates, nextLearningCases] = await Promise.all([
          api.getRuleSets(farmId.value),
          api.getStrategyCandidates({ farmId: farmId.value }),
          api.getLearningCases({ farmId: farmId.value })
        ]);
        props.state.adminRules = nextRules || [];
        props.state.adminStrategyCandidates = nextCandidates || [];
        props.state.adminLearningCases = nextLearningCases || [];
      } catch (error) {
        loadError.value = error.message || '规则与策略读取失败';
      }
    };

    const candidateId = candidate => candidate?.candidateId || candidate?.id || '';
    const candidateDescription = candidate => translateKnownText(candidate?.summary || candidate?.description || candidate?.signature || '').trim() || '基于历史案例形成的策略建议';
    const evidenceCount = candidate => Number(candidate?.evidenceCount || candidate?.caseCount || candidate?.evidenceCaseIds?.length || 0);
    const consistency = candidate => {
      const value = Number(candidate?.consistency);
      return Number.isFinite(value) ? `${Math.round((value <= 1 ? value : value / 100) * 100)}%` : '—';
    };
    // Enforce the controlled-learning state machine in the UI as well as the
    // API: a draft must be replay-validated, then approved, before activation.
    const canValidate = candidate => upper(candidate?.status) === 'DRAFT';
    const canApprove = candidate => upper(candidate?.status) === 'OFFLINE_VALIDATED';
    const canActivate = candidate => upper(candidate?.status) === 'APPROVED';
    const canReject = candidate => ['DRAFT', 'OFFLINE_VALIDATED'].includes(upper(candidate?.status));
    const canRollback = candidate => upper(candidate?.status) === 'ACTIVE';
    const offlineValidation = candidate => candidate?.offlineValidation || {};
    const offlineFailures = candidate => {
      const failures = offlineValidation(candidate)?.failures;
      return Array.isArray(failures) && failures.length ? failures.join('、') : '无';
    };
    const offlineEvidence = candidate => {
      const ids = offlineValidation(candidate)?.evidenceCaseIds || candidate?.evidenceCaseIds;
      return Array.isArray(ids) && ids.length ? ids.join('、') : '—';
    };

    const learningStatusLabel = value => ({ QUALIFIED: '合格', PENDING: '待审核', REJECTED: '已排除' }[upper(value, 'PENDING')] || '待审核');
    const learningReason = item => {
      const excluded = Array.isArray(item?.excludedReason) ? item.excludedReason : (item?.excludedReason ? [item.excludedReason] : []);
      const pending = Array.isArray(item?.pendingReason) ? item.pendingReason : (item?.pendingReason ? [item.pendingReason] : []);
      const selected = Array.isArray(item?.selectionReason) ? item.selectionReason : (item?.selectionReason ? [item.selectionReason] : []);
      return (excluded.length ? excluded : pending.length ? pending : selected).join('；') || '等待质量评估';
    };
    const learningUsesLabel = item => {
      const uses = Array.isArray(item?.learningUses) ? item.learningUses : [];
      const labels = { POSITIVE_RETRIEVAL: '允许检索', STRATEGY_CANDIDATE: '可生成策略', OFFLINE_TRAINING: '可导出训练', NEGATIVE_EVALUATION: '仅反例', NONE: '不参与学习' };
      return uses.map(use => labels[String(use).toUpperCase()] || use).join('、') || '不参与学习';
    };
    const learningSourceLabel = item => {
      const source = String(item?.sourceMode || item?.dataOrigin || '').toUpperCase();
      return source === 'REAL' ? '真实遥测' : source === 'SIMULATION' || source === 'SIMULATED' ? '模拟数据' : '记录快照';
    };
    const reviewLearning = async (item, decision) => {
      const id = item?.caseId;
      if (!id || learningBusyId.value) return;
      let note = '';
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') note = window.prompt(decision === 'QUALIFIED' ? '可填写审核备注（可选）' : '请填写排除原因（可选）', '') || '';
      learningBusyId.value = id;
      try {
        const saved = await api.reviewLearningCase(id, decision, note);
        const index = learningCases.value.findIndex((row) => row.caseId === id);
        if (index >= 0) learningCases.value.splice(index, 1, { ...learningCases.value[index], ...saved });
        toast(decision === 'QUALIFIED' ? '案例已通过人工审核，可用于正向经验' : '案例已标记为反例并从正向学习排除');
        emit('data-invalidated', { domains: ['rulesStrategies'], record: saved });
      } catch (error) { toast(error.message || '案例审核失败', 'error'); }
      finally { learningBusyId.value = ''; }
    };
    const reEvaluateLearning = async (item) => {
      const id = item?.caseId;
      if (!id || learningBusyId.value) return;
      learningBusyId.value = id;
      try {
        const saved = await api.reevaluateLearningCase(id);
        const index = learningCases.value.findIndex((row) => row.caseId === id);
        if (index >= 0) learningCases.value.splice(index, 1, { ...learningCases.value[index], ...saved });
        toast('案例已按确定性质量门重新评估');
      } catch (error) { toast(error.message || '案例重新评估失败', 'error'); }
      finally { learningBusyId.value = ''; }
    };

    const validateCandidate = async (candidate) => {
      const id = candidateId(candidate);
      if (!id || busy.value) return;
      busy.value = true;
      try {
        const saved = await api.offlineValidateLearningCandidate(id, { seed: 42, scenarioId: candidate.scenarioId || 'normal' });
        const index = candidates.value.findIndex(item => candidateId(item) === id);
        if (index >= 0) candidates.value.splice(index, 1, { ...candidates.value[index], ...saved });
        toast(saved?.offlineValidation?.status === 'PASSED' ? '离线回放通过，可提交人工批准' : '离线回放未通过，候选保持待处理');
      } catch (error) { toast(error.message || '离线验证失败', 'error'); }
      finally { busy.value = false; }
    };

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
        toast(target === 'ACTIVE' ? '策略候选已启用；相似告警将生成待确认预览' : target === 'APPROVED' ? '策略候选已批准，可继续启用' : `策略候选已${statusLabel(target)}`);
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

    watch(() => props.routeParams?.tab, value => { if (value === 'rules' || value === 'candidates' || value === 'learning') activeTab.value = value; });
    watch(farmId, refresh, { immediate: true });
    onMounted(refresh);

    return {
      activeTab, busy, loadError, farmId, filteredRules, filteredCandidates, learningCases, filteredLearningCases, learningFilter, learningCounts, learningBusyId, learningCurrentPage, learningTotalPages, learningJumpInput, learningPageRecords,
      learningStatusLabel, learningReason, learningUsesLabel, learningSourceLabel, reviewLearning, reEvaluateLearning,
      showRuleModal, ruleForm,
      statusLabel, statusTone, formatCondition, candidateId, candidateDescription, cropLabel, stageLabel,
      ruleDisplayName, ruleCodeValue, ruleDescription, versionLabel, sourceLabel, cropDisplayName,
      evidenceCount, consistency, canValidate, canApprove, canActivate, canReject, canRollback, offlineValidation, offlineFailures, offlineEvidence, strategySummary, rollbackSummary, validateCandidate, transition, refresh, openRuleCreate, createRule
    };
  },
  template: `
    <section class="admin-governance-page" aria-labelledby="admin-governance-title">
      <header class="admin-section-header">
        <div><span class="admin-eyebrow">当前农场 · 受控治理</span><h1 id="admin-governance-title">规则与策略</h1><p>规则集负责确定性判断；策略候选只在案例积累和离线验证后，由管理员决定是否启用。</p></div>
      </header>
      <div class="admin-tabs admin-governance-tabs" role="tablist" aria-label="规则与策略内容">
        <button class="admin-tab" :class="{active: activeTab === 'rules'}" role="tab" :aria-selected="activeTab === 'rules'" @click="activeTab = 'rules'">规则集 <small>{{ filteredRules.length }}</small></button>
        <button class="admin-tab" :class="{active: activeTab === 'learning'}" role="tab" :aria-selected="activeTab === 'learning'" @click="activeTab = 'learning'">经验学习 <small>{{ learningCases.length }}</small></button>
      </div>
      <div v-if="loadError" class="admin-governance-error" role="alert"><app-icon name="error"></app-icon><span>{{ loadError }}</span><button type="button" class="g-btn secondary compact" @click="refresh">重新读取</button></div>
      <section v-if="activeTab === 'rules'" class="admin-governance-section" aria-label="农场告警规则集">
        <div class="admin-governance-section-head"><div><h2>告警规则集</h2><p>规则阈值来自系统规则和当前农场已启用作物模型包；新增规则会写入当前农场，并供告警、预测和智能助手读取。</p></div><button type="button" class="g-btn primary compact" :disabled="busy || !farmId" @click="openRuleCreate"><app-icon name="add"></app-icon>新增规则</button></div>
        <div v-if="!filteredRules.length" class="admin-governance-empty"><app-icon name="rule_folder"></app-icon><strong>暂无可展示的规则集</strong><span>启用作物模型包后，相关规则会出现在这里。</span></div>
        <div v-else class="admin-table-wrap admin-governance-table-wrap"><table class="admin-table"><thead><tr><th>规则名称</th><th>规则编号</th><th>适用作物 / 阶段</th><th>判断条件</th><th>持续时间</th><th>冷却时间</th><th>版本与范围</th></tr></thead><tbody><tr v-for="(rule, index) in filteredRules" :key="rule.displayKey"><td><strong class="admin-governance-code">{{ ruleDisplayName(rule, index) }}</strong><small>{{ ruleDescription(rule) }}</small></td><td><strong class="admin-governance-code">{{ rule.displayCode }}</strong><small>底层编号：{{ ruleCodeValue(rule) }}</small></td><td>{{ cropDisplayName(rule) }}<small>{{ stageLabel(rule.stageCode || rule.stage) }}</small></td><td>{{ formatCondition(rule) }}</td><td>{{ rule.durationMinutes ?? rule.duration ?? '—' }}<span v-if="rule.durationMinutes || rule.duration"> 分钟</span></td><td>{{ rule.cooldownMinutes ?? rule.cooldown ?? '—' }}<span v-if="rule.cooldownMinutes || rule.cooldown"> 分钟</span></td><td><span class="status-pill info">{{ versionLabel(rule.ruleVersion || rule.version) }}</span><small>{{ rule.scope === 'FARM' ? '当前农场' : '系统规则' }}</small></td></tr></tbody></table></div>
      </section>
      <div v-if="showRuleModal" class="g-modal-overlay" @click.self="showRuleModal = false" @keydown.esc="showRuleModal = false">
        <form class="g-modal admin-rule-dialog" @submit.prevent="createRule">
          <div class="g-modal-header"><div><small>当前农场 · 自定义规则</small><h3>新增告警规则</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭新增规则" @click="showRuleModal = false"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body admin-rule-form-grid">
            <label><span>系统编号</span><input class="g-input" v-model="ruleForm.code" pattern="[a-z0-9][a-z0-9_-]{1,63}" placeholder="请输入内部编号" required><small>仅用于系统内部识别，列表中显示中文规则名称。</small></label>
            <label><span>规则名称</span><input class="g-input" v-model="ruleForm.name" maxlength="80" placeholder="如 土壤湿度偏低" required></label>
            <label><span>适用作物</span><select class="g-select" v-model="ruleForm.cropCode"><option value="">全场作物</option><option v-for="pack in state.cropPacks || []" :key="pack.cropCode" :value="pack.cropCode">{{ pack.identity?.name || pack.cropName || pack.cropCode }}</option></select></label>
            <label><span>生长阶段</span><input class="g-input" v-model="ruleForm.stageCode" placeholder="留空表示所有阶段"></label>
            <label><span>监测指标</span><select class="g-select" v-model="ruleForm.metric"><option value="soilMoisture">土壤湿度</option><option value="airTemperature">空气温度</option><option value="airHumidity">空气湿度</option><option value="light">光照</option></select></label>
            <label><span>判断条件</span><div class="admin-rule-condition"><select class="g-select" v-model="ruleForm.operator"><option value="LT">低于</option><option value="LTE">不高于</option><option value="GT">高于</option><option value="GTE">不低于</option><option value="EQ">等于</option></select><input class="g-input" v-model="ruleForm.threshold" type="number" step="any" placeholder="阈值" required><input class="g-input" v-model="ruleForm.unit" maxlength="8" placeholder="单位"></div></label>
            <label><span>持续时间（分钟）</span><input class="g-input" v-model.number="ruleForm.durationMinutes" type="number" min="0" step="1"></label>
            <label><span>冷却时间（分钟）</span><input class="g-input" v-model.number="ruleForm.cooldownMinutes" type="number" min="0" step="1"></label>
            <label class="span-2"><span>规则版本</span><input class="g-input" v-model="ruleForm.ruleVersion" pattern="[A-Za-z0-9._-]+" placeholder="请输入版本号"></label>
            <p class="admin-rule-form-note span-2"><app-icon name="info"></app-icon>新增规则会立即进入当前农场规则集。规则仍由确定性引擎判断，智能助手仅解释原因，不会自动执行设备操作。</p>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" @click="showRuleModal = false">取消</button><button type="submit" class="g-btn primary" :disabled="busy">{{ busy ? '保存中…' : '保存并同步' }}</button></div>
        </form>
      </div>
      <section v-else-if="activeTab === 'learning'" class="admin-governance-section" aria-label="受控学习案例">
        <div class="admin-governance-section-head"><div><h2>受控学习案例</h2><p>系统只会把通过确定性质量门的经验用于正向检索；失败、冲突或未经确认的模拟结果会保留为反例，不会删除。</p></div><label class="admin-governance-filter"><span>筛选</span><select class="g-select" v-model="learningFilter"><option value="ALL">全部（{{ learningCases.length }}）</option><option value="QUALIFIED">合格（{{ learningCounts.qualified }}）</option><option value="PENDING">待审核（{{ learningCounts.pending }}）</option><option value="REJECTED">已排除（{{ learningCounts.rejected }}）</option></select></label></div>
        <div class="admin-learning-summary"><div class="admin-learning-count qualified"><strong>{{ learningCounts.qualified }}</strong><span>合格经验</span></div><div class="admin-learning-count pending"><strong>{{ learningCounts.pending }}</strong><span>待质量判断</span></div><div class="admin-learning-count rejected"><strong>{{ learningCounts.rejected }}</strong><span>反例 / 已排除</span></div></div>
        <div v-if="!filteredLearningCases.length" class="admin-governance-empty"><app-icon name="fact_check"></app-icon><strong>暂无符合条件的案例</strong><span>案例会在反馈、告警闭环和效果评价完成后进入这里。</span></div>
        <div v-else class="admin-table-wrap admin-governance-table-wrap"><table class="admin-table admin-learning-table"><thead><tr><th>案例与范围</th><th>来源 / 场景</th><th>质量状态</th><th>判定依据</th><th>学习用途</th><th>效果</th><th>操作</th></tr></thead><tbody><tr v-for="item in learningPageRecords" :key="item.caseId"><td><strong class="admin-governance-code">{{ item.caseId }}</strong><small>{{ cropLabel(item.cropCode) }} · {{ item.plotId || '未指定地块' }}</small><small v-if="item.farmId">{{ item.farmId }}<span v-if="item.conversationId"> · 对话 {{ item.conversationId }}</span></small></td><td><span class="status-pill info">{{ learningSourceLabel(item) }}</span><small>{{ item.scenarioId || '标准场景' }} · {{ item.agentVersion || '规则链路' }}</small></td><td><span class="status-pill" :class="statusTone(item.qualityStatus)">{{ learningStatusLabel(item.qualityStatus) }}</span></td><td><span class="admin-governance-description" :title="learningReason(item)">{{ learningReason(item) }}</span></td><td><span class="admin-learning-uses">{{ learningUsesLabel(item) }}</span></td><td>{{ item.result || item.evaluationResult || '待评价' }}<small v-if="item.reviewedBy">审核：{{ item.reviewedBy }}</small></td><td class="admin-governance-actions"><button v-if="item.qualityStatus !== 'QUALIFIED'" type="button" class="g-btn text sm" :disabled="learningBusyId === item.caseId" @click="reEvaluateLearning(item)">{{ learningBusyId === item.caseId ? '处理中…' : '重新评估' }}</button><button v-if="item.qualityStatus !== 'QUALIFIED'" type="button" class="g-btn text sm" :disabled="learningBusyId === item.caseId" @click="reviewLearning(item, 'QUALIFIED')">审核纳入</button><button v-if="item.qualityStatus !== 'REJECTED'" type="button" class="g-btn text sm danger-text" :disabled="learningBusyId === item.caseId" @click="reviewLearning(item, 'REJECTED')">标记反例</button></td></tr></tbody></table></div>
      </section>
    </section>
  `
};
