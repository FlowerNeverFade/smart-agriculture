import { api } from '../api.js';
import { normalizeAdminTab } from '../admin-state.js';
import { AdminResourcePlanningView } from './admin-resource-planning.js';

const { ref, computed, watch, inject } = Vue;

const SIMULATOR_REASONS = Object.freeze({
  BACKEND_OFFLINE: '当前只启动了前端页面，无法控制模拟器。',
  SUPERVISOR_CONFIG_NOT_FOUND: '当前环境没有配置 Supervisor，不能启动或停止模拟器。',
  SUPERVISOR_NOT_AVAILABLE: 'Supervisor 服务当前不可用。',
  SIMULATOR_CONTROL_DISABLED: '服务器已关闭模拟器控制功能。'
});

export const AdminResourceCenterView = {
  components: { 'admin-resource-planning': AdminResourcePlanningView },
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const activeTab = ref(normalizeAdminTab('resource-coordination', props.routeParams?.tab));
    const busy = ref(false);
    const bindSelections = ref({});
    const deviceForm = ref({ deviceId: '', name: '', type: 'ENVIRONMENTAL_SENSOR' });
    const ledgerForm = ref({ plotId: '', plannedWaterLitres: '', actualWaterLitres: '', waterPricePerLitre: '', sourceMode: 'USER_PROVIDED' });
    const farmId = computed(() => props.state.adminContext?.farmId || '');
    const plots = computed(() => (props.state.allPlots || props.state.plots || []).filter(plot => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE'));
    const devices = computed(() => props.state.devices || []);
    const ledgers = computed(() => props.state.valueLedgers || []);
    const simulator = computed(() => props.state.simulatorStatus || { available: false, status: 'UNAVAILABLE', reason: 'BACKEND_OFFLINE' });
    const simulatorMessage = computed(() => SIMULATOR_REASONS[simulator.value.reason] || simulator.value.reason || '模拟器状态暂不可用。');
    watch(() => props.routeParams?.tab, tab => { activeTab.value = normalizeAdminTab('resource-coordination', tab); });
    watch(plots, value => {
      if (!ledgerForm.value.plotId) ledgerForm.value.plotId = value[0]?.plotId || '';
    }, { immediate: true });
    const setTab = tab => emit('navigate', 'resource-coordination', { tab, farmId: farmId.value });
    const registerDevice = async () => {
      if (!deviceForm.value.deviceId.trim() || !deviceForm.value.name.trim()) return toast('请填写设备编号和名称', 'error');
      busy.value = true;
      try {
        const device = await api.registerDevice({ ...deviceForm.value, farmId: farmId.value });
        deviceForm.value = { deviceId: '', name: '', type: 'ENVIRONMENTAL_SENSOR' };
        emit('data-invalidated', { domains: ['devices'], record: device });
        toast('设备已注册；心跳到达前保持离线、未绑定');
      } catch (error) { toast(error.message || '设备注册失败', 'error'); }
      finally { busy.value = false; }
    };
    const bind = async device => {
      const plotId = bindSelections.value[device.deviceId];
      if (!plotId) return toast('请选择要绑定的地块', 'error');
      busy.value = true;
      try {
        const saved = await api.bindDevice(device.deviceId, plotId);
        emit('data-invalidated', { domains: ['devices', 'plots', 'overview'], record: saved });
        toast('设备已绑定；在线状态仍等待真实心跳');
      } catch (error) { toast(error.message || '设备绑定失败', 'error'); }
      finally { busy.value = false; }
    };
    const unbind = async device => {
      if (!window.confirm(`确认解除 ${device.name || device.deviceId} 与当前地块的绑定？`)) return;
      busy.value = true;
      try {
        const saved = await api.unbindDevice(device.deviceId);
        emit('data-invalidated', { domains: ['devices', 'plots', 'overview'], record: saved });
        toast('设备已解绑');
      } catch (error) { toast(error.message || '设备解绑失败', 'error'); }
      finally { busy.value = false; }
    };
    const createLedger = async () => {
      busy.value = true;
      try {
        const ledger = await api.createValueLedger({ ...ledgerForm.value, farmId: farmId.value });
        emit('data-invalidated', { domains: ['ledgers'], record: ledger });
        toast(ledger.status === 'COMPUTED' ? '价值对账已生成' : '已保存不完整对账；缺少事实的字段保持为空');
      } catch (error) { toast(error.message || '价值对账失败', 'error'); }
      finally { busy.value = false; }
    };
    const controlSimulator = async action => {
      if (!simulator.value.available || busy.value) return;
      if (!window.confirm(`确认${action === 'start' ? '启动' : '停止'}遥测模拟器？`)) return;
      busy.value = true;
      try {
        props.state.simulatorStatus = action === 'start' ? await api.startSimulator() : await api.stopSimulator();
        toast(`模拟器${action === 'start' ? '启动' : '停止'}命令已返回`);
      } catch (error) {
        toast(error.message || '模拟器控制失败', 'error');
        await refreshSimulator();
      } finally { busy.value = false; }
    };
    const refreshSimulator = async () => {
      try { props.state.simulatorStatus = await api.getSimulatorStatus(); }
      catch (error) { props.state.simulatorStatus = { available: false, status: 'UNAVAILABLE', reason: error.code || error.message }; }
    };
    const plotName = plotId => plots.value.find(plot => plot.plotId === plotId)?.name || plotId || '未绑定';
    const display = value => value === undefined || value === null || value === '' ? '—' : value;
    const metric = (ledger, key) => display(ledger?.metrics?.[key]);
    return { activeTab, busy, farmId, plots, devices, ledgers, simulator, simulatorMessage, bindSelections, deviceForm, ledgerForm, setTab, registerDevice, bind, unbind, createLedger, controlSimulator, refreshSimulator, plotName, display, metric };
  },
  template: `
    <section class="admin-management-page">
      <header class="admin-section-header"><div><h1>设备与灌溉</h1><p>设备事实、用水安排、价值对账与模拟器控制分开管理。</p></div></header>
      <nav class="admin-local-tabs" aria-label="设备与灌溉页签">
        <button :class="{active: activeTab === 'devices'}" @click="setTab('devices')">设备管理</button>
        <button :class="{active: activeTab === 'irrigation'}" @click="setTab('irrigation')">灌溉与水资源</button>
        <button :class="{active: activeTab === 'value'}" @click="setTab('value')">价值对账</button>
        <button :class="{active: activeTab === 'simulator'}" @click="setTab('simulator')">模拟器</button>
      </nav>

      <div v-if="activeTab === 'devices'" class="admin-split-layout">
        <section class="admin-panel">
          <div class="admin-panel-title"><div><span>登记事实</span><h2>注册新设备</h2></div><em>初始离线</em></div>
          <div class="admin-form-grid one-column">
            <label><span>设备编号</span><input v-model.trim="deviceForm.deviceId" placeholder="例如 SENSOR-A04"></label>
            <label><span>设备名称</span><input v-model.trim="deviceForm.name" placeholder="例如 A04 环境采集器"></label>
            <label><span>设备类型</span><select v-model="deviceForm.type"><option value="ENVIRONMENTAL_SENSOR">环境传感器</option><option value="IRRIGATION_CONTROLLER">灌溉控制器</option><option value="FLOW_METER">流量计</option></select></label>
          </div>
          <p class="admin-hint">注册和绑定不会把设备标记为在线；只有后端收到心跳或遥测后才显示在线。</p>
          <button class="g-btn primary" :disabled="busy" @click="registerDevice">注册设备</button>
        </section>
        <section class="admin-panel admin-wide-panel">
          <div class="admin-panel-title"><div><span>当前农场</span><h2>设备事实列表</h2></div><em>{{ devices.length }} 台</em></div>
          <div class="admin-device-list">
            <article v-for="device in devices" :key="device.deviceId">
              <div class="admin-device-status" :class="String(device.status || 'offline').toLowerCase()"><i></i><span>{{ device.status || 'OFFLINE' }}</span></div>
              <div><strong>{{ device.name || device.deviceId }}</strong><small>{{ device.deviceId }} · {{ device.type || '—' }}</small></div>
              <div><span>绑定地块</span><strong>{{ plotName(device.plotId) }}</strong></div>
              <div class="admin-inline-actions" v-if="!device.plotId"><select v-model="bindSelections[device.deviceId]"><option value="">选择地块</option><option v-for="plot in plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select><button :disabled="busy" @click="bind(device)">绑定</button></div>
              <button v-else class="g-btn secondary compact" :disabled="busy" @click="unbind(device)">解绑</button>
            </article>
            <p v-if="!devices.length" class="admin-empty">当前农场没有设备记录。</p>
          </div>
        </section>
      </div>

      <admin-resource-planning v-else-if="activeTab === 'irrigation'" :state="state" :route-params="{...routeParams, farmId}"
        @data-invalidated="payload => $emit('data-invalidated', payload)"></admin-resource-planning>

      <div v-else-if="activeTab === 'value'" class="admin-split-layout">
        <section class="admin-panel">
          <div class="admin-panel-title"><div><span>新建对账</span><h2>录入用水事实</h2></div><em>USER_PROVIDED</em></div>
          <div class="admin-form-grid one-column">
            <label><span>地块</span><select v-model="ledgerForm.plotId"><option v-for="plot in plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
            <label><span>计划用水（L）</span><input type="number" min="0" step="0.1" v-model="ledgerForm.plannedWaterLitres" placeholder="缺少时可留空"></label>
            <label><span>实际用水（L）</span><input type="number" min="0" step="0.1" v-model="ledgerForm.actualWaterLitres" placeholder="缺少时可留空"></label>
            <label><span>水价（元/L）</span><input type="number" min="0" step="0.001" v-model="ledgerForm.waterPricePerLitre" placeholder="留空使用后端农场配置"></label>
          </div>
          <p class="admin-hint">第一版只计算计划、实际、偏差、节水量和水费；没有产量或价格事实时不展示收益。</p>
          <button class="g-btn primary" :disabled="busy" @click="createLedger">保存对账</button>
        </section>
        <section class="admin-panel admin-wide-panel">
          <div class="admin-panel-title"><div><span>事实账本</span><h2>价值对账记录</h2></div><em>{{ ledgers.length }} 条</em></div>
          <div class="admin-ledger-list">
            <article v-for="ledger in ledgers" :key="ledger.valueLedgerId">
              <header><strong>{{ plotName(ledger.plotId) }}</strong><span>{{ ledger.status }}</span></header>
              <dl><div><dt>计划用水</dt><dd>{{ metric(ledger, 'plannedWaterLitres') }} L</dd></div><div><dt>实际用水</dt><dd>{{ metric(ledger, 'actualWaterLitres') }} L</dd></div><div><dt>节水量</dt><dd>{{ metric(ledger, 'waterSavingLitres') }} L</dd></div><div><dt>水费</dt><dd>¥ {{ metric(ledger, 'waterCost') }}</dd></div></dl>
              <footer>{{ ledger.sourceMode || '—' }} · 计划 {{ ledger.plannedSource || '—' }} / 实际 {{ ledger.actualSource || '—' }}</footer>
            </article>
            <p v-if="!ledgers.length" class="admin-empty">还没有对账记录；系统不会用模拟收益填空。</p>
          </div>
        </section>
      </div>

      <section v-else class="admin-panel admin-simulator-panel">
        <div class="admin-panel-title"><div><span>Supervisor</span><h2>遥测模拟器控制</h2></div><em>{{ simulator.status || 'UNAVAILABLE' }}</em></div>
        <div v-if="!simulator.available" class="admin-unavailable"><app-icon name="info"></app-icon><div><strong>当前环境不可控制模拟器</strong><p>{{ simulatorMessage }}</p></div></div>
        <div v-else class="admin-simulator-state"><i :class="String(simulator.status || '').toLowerCase()"></i><div><span>当前状态</span><strong>{{ simulator.status }}</strong><small>{{ simulator.program || '—' }}</small></div></div>
        <div class="admin-action-row"><button class="g-btn secondary" :disabled="busy" @click="refreshSimulator">刷新状态</button><button class="g-btn primary" :disabled="busy || !simulator.available || simulator.status === 'RUNNING'" @click="controlSimulator('start')">启动</button><button class="g-btn danger" :disabled="busy || !simulator.available || simulator.status !== 'RUNNING'" @click="controlSimulator('stop')">停止</button></div>
      </section>
    </section>
  `
};
