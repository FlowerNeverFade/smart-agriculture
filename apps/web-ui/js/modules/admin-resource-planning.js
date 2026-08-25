import { api } from '../api.js';
import { roleCan } from '../roles.js';

const { ref, computed, watch, onMounted } = Vue;

const PRIORITIES = Object.freeze([
  { value: 'HIGH', label: '优先处理' },
  { value: 'MEDIUM', label: '正常安排' },
  { value: 'LOW', label: '可以延后' }
]);

function recommendedWater(plot) {
  const moisture = Number(plot?.metrics?.SOIL_MOISTURE?.value ?? 25);
  const area = Number(plot?.areaM2 || 80);
  const target = 30;
  return Math.max(20, Math.round(Math.max(0, target - moisture) * area * .08));
}

function allocationTone(status) {
  return String(status || '').toUpperCase() === 'ALLOCATED' ? 'success' : 'warning';
}

export const AdminResourcePlanningView = {
  props: {
    state: { type: Object, required: true },
    routeParams: { type: Object, default: () => ({}) }
  },
  emits: ['data-invalidated'],
  setup(props, { emit }) {
    const rows = ref([]);
    const loading = ref(false);
    const error = ref(null);
    const result = ref(null);
    const priorities = PRIORITIES;

    const plots = computed(() => props.state?.plots || []);
    const farmId = computed(() => props.state?.adminContext?.farmId || props.routeParams?.farmId || plots.value[0]?.farmId || '');
    const isDemo = computed(() => props.state?.sessionMode === 'demo');
    const canManage = computed(() => roleCan(props.state?.currentUser, 'resource:manage'));
    const selectedRows = computed(() => rows.value.filter((row) => row.included));
    const allConfirmed = computed(() => selectedRows.value.length > 0 && selectedRows.value.every((row) => row.confirmed && Number(row.requestedLitres) > 0));
    const requestedTotal = computed(() => selectedRows.value.reduce((sum, row) => sum + Number(row.requestedLitres || 0), 0));
    const capacity = computed(() => Number(result.value?.constraints?.waterCapacityLitres ?? props.state?.resourceProfile?.capacityLitres ?? 0));
    const allocatedTotal = computed(() => (result.value?.allocations || []).reduce((sum, row) => sum + Number(row.allocatedLitres || 0), 0));
    const shortageTotal = computed(() => (result.value?.unmetDemands || []).reduce((sum, row) => sum + Number(row.unmetLitres || 0), 0));
    const resultRows = computed(() => (result.value?.allocations || []).map((allocation) => {
      const request = rows.value.find((row) => row.plotId === allocation.plotId);
      const unmet = result.value?.unmetDemands?.find((row) => row.plotId === allocation.plotId);
      return {
        ...allocation,
        name: request?.name || allocation.plotId,
        priority: request?.priority || 'MEDIUM',
        unmetLitres: Number(unmet?.unmetLitres || 0),
        reason: unmet?.reason === 'WATER_CAPACITY' ? '当前水量不足，需延后或减少用水' : ''
      };
    }));
    const devices = computed(() => plots.value.map((plot) => ({
      id: plot.deviceId || `device-${plot.plotId}`,
      plotName: plot.name,
      status: plot.deviceStatus || 'UNKNOWN',
      updatedAt: plot.updatedAt || '—'
    })));

    const rebuildRows = () => {
      const previous = new Map(rows.value.map((row) => [row.plotId, row]));
      rows.value = plots.value.map((plot) => {
        const old = previous.get(plot.plotId);
        return old || {
          plotId: plot.plotId,
          name: plot.name,
          cropName: plot.cropName || plot.cropCode || '未设置作物',
          included: true,
          confirmed: false,
          requestedLitres: recommendedWater(plot),
          priority: Number(plot.metrics?.SOIL_MOISTURE?.value ?? 30) < 20 ? 'HIGH' : 'MEDIUM'
        };
      });
      result.value = null;
    };

    const evaluate = async () => {
      if (!canManage.value || !allConfirmed.value || loading.value) return;
      loading.value = true;
      error.value = null;
      result.value = null;
      try {
        result.value = await api.evaluateResourcePlan({
          farmId: farmId.value,
          scope: farmId.value,
          trialOnly: true,
          provenance: 'USER_PROVIDED',
          demands: selectedRows.value.map((row) => ({
            plotId: row.plotId,
            requestedLitres: Number(row.requestedLitres),
            waterLitre: Number(row.requestedLitres),
            priority: row.priority,
            confirmed: true,
            provenance: 'USER_PROVIDED'
          }))
        });
        emit('data-invalidated', { domains: ['resourcePlans'], farmId: farmId.value, plotIds: selectedRows.value.map((row) => row.plotId) });
      } catch (caught) {
        error.value = caught;
      } finally {
        loading.value = false;
      }
    };

    const loadRestrictedExample = () => {
      rows.value = rows.value.map((row, index) => ({
        ...row,
        included: index < Math.min(3, rows.value.length),
        confirmed: index < Math.min(3, rows.value.length),
        requestedLitres: index < Math.min(3, rows.value.length) ? 480 : row.requestedLitres,
        priority: index === 0 ? 'HIGH' : index === 1 ? 'MEDIUM' : 'LOW'
      }));
      result.value = null;
    };

    watch(plots, rebuildRows, { deep: true });
    onMounted(rebuildRows);

    return {
      rows, loading, error, result, priorities, plots, farmId, isDemo, canManage, selectedRows, allConfirmed,
      requestedTotal, capacity, allocatedTotal, shortageTotal, resultRows, devices, evaluate,
      loadRestrictedExample, allocationTone
    };
  },
  template: `
    <section class="rp-root" aria-labelledby="resource-title">
      <header class="rp-hero">
        <div><span>水资源安排 · 只试算不扣减</span><h2 id="resource-title">多地块灌溉用水试算</h2><p>管理员逐块核对需水量和先后顺序，系统按农场现有水量给出分配结果。</p></div>
        <div class="rp-mode"><strong>{{ isDemo ? 'SIMULATED' : 'ESTIMATED' }}</strong><small>试算结果不会修改真实剩余水量</small></div>
      </header>

      <div v-if="error" class="rp-error"><strong>{{ error.code || 'RESOURCE_PLAN_FAILED' }}</strong><span>{{ error.message || error }}</span></div>
      <div v-if="!canManage" class="rp-empty">当前身份没有安排农场水资源的权限。</div>

      <template v-else>
        <section class="rp-summary">
          <article><span>本次选择</span><strong>{{ selectedRows.length }}</strong><small>块地</small></article>
          <article><span>申请用水</span><strong>{{ requestedTotal }}</strong><small>升</small></article>
          <article><span>可用水量</span><strong>{{ result ? capacity : '试算后显示' }}</strong><small>{{ result ? '升' : '' }}</small></article>
          <article :class="{'is-warning': shortageTotal > 0}"><span>缺口</span><strong>{{ result ? shortageTotal : '—' }}</strong><small>{{ result ? '升' : '' }}</small></article>
        </section>

        <section class="rp-card">
          <div class="rp-card-heading"><div><span>第一步</span><h3>核对每块地的申请</h3></div><button class="rp-button secondary" @click="loadRestrictedExample">载入水量不足示例</button></div>
          <div class="rp-table-wrap">
            <table class="rp-table">
              <thead><tr><th>加入试算</th><th>地块</th><th>申请水量（升）</th><th>先后顺序</th><th>管理员确认</th></tr></thead>
              <tbody>
                <tr v-for="row in rows" :key="row.plotId" :class="{'is-muted': !row.included}">
                  <td><input type="checkbox" v-model="row.included" @change="row.confirmed = false; result = null"></td>
                  <td><strong>{{ row.name }}</strong><small>{{ row.plotId }} · {{ row.cropName }}</small></td>
                  <td><input class="rp-number" type="number" min="1" step="1" v-model.number="row.requestedLitres" :disabled="!row.included" @input="row.confirmed = false; result = null"><em>USER_PROVIDED</em></td>
                  <td><select v-model="row.priority" :disabled="!row.included" @change="row.confirmed = false; result = null"><option v-for="item in priorities" :key="item.value" :value="item.value">{{ item.label }}</option></select></td>
                  <td><label class="rp-confirm"><input type="checkbox" v-model="row.confirmed" :disabled="!row.included">{{ row.confirmed ? '已核对' : '请核对' }}</label></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="rp-submit"><p v-if="!allConfirmed">所选地块都完成核对后才能试算。</p><p v-else>已确认 {{ selectedRows.length }} 块地，共申请 {{ requestedTotal }} 升。</p><button class="rp-button primary" @click="evaluate" :disabled="!allConfirmed || loading">{{ loading ? '正在试算…' : '开始容量试算' }}</button></div>
        </section>

        <section v-if="result" class="rp-card">
          <div class="rp-card-heading"><div><span>第二步</span><h3>分配结果</h3></div><strong class="rp-result-state" :class="result.status === 'FEASIBLE' ? 'success' : 'warning'">{{ result.status === 'FEASIBLE' ? '水量充足' : '水量不足' }}</strong></div>
          <div class="rp-result-banner"><div><span>农场可用</span><strong>{{ capacity }} L</strong></div><i>→</i><div><span>本次分配</span><strong>{{ allocatedTotal }} L</strong></div><i>→</i><div><span>尚未满足</span><strong>{{ shortageTotal }} L</strong></div><em>ESTIMATED · 只试算，不回写</em></div>
          <div class="rp-allocation-list">
            <article v-for="item in resultRows" :key="item.plotId" :class="'tone-' + allocationTone(item.status)">
              <div><strong>{{ item.name }}</strong><span>{{ item.plotId }} · {{ item.priority }}</span></div>
              <div><span>申请 {{ item.requestedLitres }} L</span><strong>分配 {{ item.allocatedLitres }} L</strong></div>
              <p v-if="item.reason">{{ item.reason }}（缺 {{ item.unmetLitres }} L）</p><p v-else>本地块申请已全部满足</p>
            </article>
          </div>
        </section>

        <section class="rp-card rp-device-card">
          <div class="rp-card-heading"><div><span>只读信息</span><h3>相关设备在线状态</h3></div><small>设备管理由对应模块负责</small></div>
          <div class="rp-device-grid"><article v-for="device in devices" :key="device.id"><i :class="String(device.status).toLowerCase()"></i><div><strong>{{ device.id }}</strong><span>{{ device.plotName }}</span></div><b>{{ device.status }}</b></article></div>
        </section>
      </template>
    </section>
  `
};
