import { api } from '../api.js';
import { formatHealthScore, normalizeAdminTab } from '../admin-state.js';
import { AdminResourcePlanningView } from './admin-resource-planning.js';
import { deviceTypeLabel as localizedDeviceTypeLabel, provenanceLabel, scenarioLabel, serviceStatusLabel, sourceLabel, statusLabel } from '../live-data.js';

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
    const showDeviceRegistration = ref(false);
    const activeDeviceId = ref('');
    const bindSelections = ref({});
    const deviceForm = ref({ deviceId: '', name: '', type: 'ENVIRONMENTAL_SENSOR' });
    const ledgerForm = ref({ plotId: '', plannedWaterLitres: '', actualWaterLitres: '', waterPricePerLitre: '', sourceMode: 'USER_PROVIDED' });
    const farmId = computed(() => props.state.adminContext?.farmId || '');
    const plots = computed(() => (props.state.allPlots || props.state.plots || []).filter(plot => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE'));
    const devices = computed(() => props.state.devices || []);
    const activeDevice = computed(() => devices.value.find(device => device.deviceId === activeDeviceId.value) || null);
    const ledgers = computed(() => props.state.valueLedgers || []);
    const simulator = computed(() => props.state.simulatorStatus || { available: false, status: 'UNAVAILABLE', reason: 'BACKEND_OFFLINE' });
    const simulatorMessage = computed(() => SIMULATOR_REASONS[simulator.value.reason] || (simulator.value.reason && statusLabel(simulator.value.reason, simulator.value.reason)) || '模拟器状态暂不可用。');
    const upsertDevice = device => {
      if (!device?.deviceId) return;
      const index = props.state.devices.findIndex(item => item.deviceId === device.deviceId);
      if (index >= 0) props.state.devices.splice(index, 1, { ...props.state.devices[index], ...device });
      else props.state.devices.unshift(device);
    };
    const resetDeviceDialogs = () => {
      showDeviceRegistration.value = false;
      activeDeviceId.value = '';
      bindSelections.value = {};
    };
    const openDeviceRegistration = () => {
      activeDeviceId.value = '';
      deviceForm.value = { deviceId: '', name: '', type: 'ENVIRONMENTAL_SENSOR' };
      showDeviceRegistration.value = true;
    };
    const closeDeviceRegistration = () => {
      if (!busy.value) showDeviceRegistration.value = false;
    };
    const openDeviceDetail = device => {
      showDeviceRegistration.value = false;
      activeDeviceId.value = device?.deviceId || '';
    };
    const closeDeviceDetail = () => {
      if (!busy.value) activeDeviceId.value = '';
    };
    const openDeviceFromKeyboard = (event, device) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openDeviceDetail(device);
    };
    watch(() => props.routeParams?.tab, tab => {
      activeTab.value = normalizeAdminTab('resource-coordination', tab);
      resetDeviceDialogs();
    });
    watch(farmId, resetDeviceDialogs);
    watch(plots, value => {
      if (!ledgerForm.value.plotId) ledgerForm.value.plotId = value[0]?.plotId || '';
    }, { immediate: true });
    const setTab = tab => {
      resetDeviceDialogs();
      emit('navigate', 'resource-coordination', { tab, farmId: farmId.value });
    };
    const registerDevice = async () => {
      if (!deviceForm.value.deviceId.trim() || !deviceForm.value.name.trim()) return toast('请填写设备编号和名称', 'error');
      busy.value = true;
      try {
        const device = await api.registerDevice({ ...deviceForm.value, farmId: farmId.value });
        upsertDevice(device);
        deviceForm.value = { deviceId: '', name: '', type: 'ENVIRONMENTAL_SENSOR' };
        showDeviceRegistration.value = false;
        emit('data-invalidated', { domains: ['devices'], record: device });
        toast('设备已注册并显示在列表中，请继续选择地块完成绑定');
      } catch (error) { toast(error.message || '设备注册失败', 'error'); }
      finally { busy.value = false; }
    };
    const bind = async device => {
      const plotId = bindSelections.value[device.deviceId];
      if (!plotId) return toast('请选择要绑定的地块', 'error');
      busy.value = true;
      try {
        const saved = await api.bindDevice(device.deviceId, plotId);
        upsertDevice(saved);
        delete bindSelections.value[device.deviceId];
        emit('data-invalidated', { domains: ['devices', 'plots', 'overview'], record: saved });
        toast(`设备已绑定到${plotName(plotId)}；收到心跳后才会显示在线`);
      } catch (error) { toast(error.message || '设备绑定失败', 'error'); }
      finally { busy.value = false; }
    };
    const unbind = async device => {
      if (!window.confirm(`确认解除 ${device.name || device.deviceId} 与当前地块的绑定？`)) return;
      busy.value = true;
      try {
        const saved = await api.unbindDevice(device.deviceId);
        upsertDevice(saved);
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
    const bindingLabel = device => (device?.plotId || String(device?.bindingState || '').toUpperCase() === 'BOUND') ? '已绑定' : '未绑定';
    const deviceStatusLabel = status => serviceStatusLabel(status, '状态未知');
    const ledgerStatusLabel = status => statusLabel(status, '待补充');
    const deviceLastSeen = device => device?.lastSeen || device?.lastHeartbeat || null;
    const readableTime = value => {
      if (!value) return '尚无数据';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    };
    const healthLabel = device => {
      const score = formatHealthScore(device?.healthScore);
      return score === '—' ? '—' : `${score} 分`;
    };
    const display = value => value === undefined || value === null || value === '' ? '—' : value;
    const metric = (ledger, key) => display(ledger?.metrics?.[key]);
    return {
      activeTab, busy, farmId, plots, devices, activeDevice, ledgers, simulator, simulatorMessage, bindSelections, deviceForm, ledgerForm,
      showDeviceRegistration, setTab, registerDevice, bind, unbind, createLedger, controlSimulator, refreshSimulator, plotName,
      bindingLabel, deviceStatusLabel, ledgerStatusLabel, deviceLastSeen, readableTime, healthLabel, deviceTypeLabel: localizedDeviceTypeLabel, display, metric,
      sourceLabel, provenanceLabel, scenarioLabel, serviceStatusLabel,
      openDeviceRegistration, closeDeviceRegistration, openDeviceDetail, closeDeviceDetail, openDeviceFromKeyboard
    };
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

      <section v-if="activeTab === 'devices'" class="admin-panel admin-device-panel">
          <div class="admin-panel-title"><div><span>当前农场</span><h2>设备事实列表</h2></div><em>{{ devices.length }} 台</em></div>
          <div class="admin-device-card-grid">
            <article v-for="device in devices" :key="device.deviceId" class="admin-device-card" role="button" tabindex="0"
              :aria-label="'查看设备详情：' + (device.name || device.deviceId)" @click="openDeviceDetail(device)" @keydown="openDeviceFromKeyboard($event, device)">
              <header class="admin-device-card-header">
                <div class="admin-device-status" :class="String(device.status || 'offline').toLowerCase()"><i></i><span>{{ deviceStatusLabel(device.status) }}</span></div>
                <span class="admin-binding-state" :class="device.plotId ? 'bound' : 'unbound'">{{ bindingLabel(device) }}</span>
              </header>
              <div class="admin-device-identity"><h3>{{ device.name || device.deviceId }}</h3><small>{{ device.deviceId }}</small></div>
              <dl class="admin-device-card-facts">
                <div><dt>设备类型</dt><dd>{{ deviceTypeLabel(device.type) }}</dd></div>
                <div><dt>绑定地块</dt><dd>{{ plotName(device.plotId) }}</dd></div>
                <div><dt>最近数据</dt><dd>{{ readableTime(deviceLastSeen(device)) }}</dd></div>
                <div><dt>健康评分</dt><dd>{{ healthLabel(device) }}</dd></div>
              </dl>
              <footer><span>{{ sourceLabel(device.sourceMode || 'DEVICE') }}</span><strong>查看详情 <app-icon name="arrow_forward"></app-icon></strong></footer>
            </article>
            <button type="button" class="admin-device-card admin-add-device-card" @click="openDeviceRegistration">
              <span class="manager-add-plot-icon"><app-icon name="add"></app-icon></span>
              <strong>添加设备</strong>
              <small>登记设备事实，随后绑定地块</small>
            </button>
          </div>
          <p v-if="!devices.length" class="admin-empty">当前农场没有设备记录，请使用添加卡片登记。</p>
      </section>

      <admin-resource-planning v-else-if="activeTab === 'irrigation'" :state="state" :route-params="{...routeParams, farmId}"
        @data-invalidated="payload => $emit('data-invalidated', payload)"></admin-resource-planning>

      <div v-else-if="activeTab === 'value'" class="admin-split-layout">
        <section class="admin-panel">
          <div class="admin-panel-title"><div><span>新建对账</span><h2>录入用水事实</h2></div><em>人工提供</em></div>
          <div class="admin-form-grid one-column">
            <label><span>地块</span><select v-model="ledgerForm.plotId"><option v-for="plot in plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
            <label><span>计划用水（升）</span><input type="number" min="0" step="0.1" v-model="ledgerForm.plannedWaterLitres" placeholder="缺少时可留空"></label>
            <label><span>实际用水（升）</span><input type="number" min="0" step="0.1" v-model="ledgerForm.actualWaterLitres" placeholder="缺少时可留空"></label>
            <label><span>水价（元/升）</span><input type="number" min="0" step="0.001" v-model="ledgerForm.waterPricePerLitre" placeholder="留空使用后端农场配置"></label>
          </div>
          <p class="admin-hint">第一版只计算计划、实际、偏差、节水量和水费；没有产量或价格事实时不展示收益。</p>
          <button class="g-btn primary" :disabled="busy" @click="createLedger">保存对账</button>
        </section>
        <section class="admin-panel admin-wide-panel">
          <div class="admin-panel-title"><div><span>事实账本</span><h2>价值对账记录</h2></div><em>{{ ledgers.length }} 条</em></div>
          <div class="admin-ledger-list">
            <article v-for="ledger in ledgers" :key="ledger.valueLedgerId">
              <header><strong>{{ plotName(ledger.plotId) }}</strong><span>{{ ledgerStatusLabel(ledger.status) }}</span></header>
              <dl><div><dt>计划用水</dt><dd>{{ metric(ledger, 'plannedWaterLitres') }} 升</dd></div><div><dt>实际用水</dt><dd>{{ metric(ledger, 'actualWaterLitres') }} 升</dd></div><div><dt>节水量</dt><dd>{{ metric(ledger, 'waterSavingLitres') }} 升</dd></div><div><dt>水费</dt><dd>¥ {{ metric(ledger, 'waterCost') }}</dd></div></dl>
              <footer>{{ sourceLabel(ledger.sourceMode) }} · 计划 {{ sourceLabel(ledger.plannedSource) }} / 实际 {{ sourceLabel(ledger.actualSource) }}</footer>
            </article>
            <p v-if="!ledgers.length" class="admin-empty">还没有对账记录；系统不会用模拟收益填空。</p>
          </div>
        </section>
      </div>

      <section v-else class="admin-panel admin-simulator-panel">
        <div class="admin-panel-title"><div><span>模拟器控制服务</span><h2>遥测模拟器控制</h2></div><em>{{ serviceStatusLabel(simulator.status) }}</em></div>
        <div v-if="!simulator.available" class="admin-unavailable"><app-icon name="info"></app-icon><div><strong>当前环境不可控制模拟器</strong><p>{{ simulatorMessage }}</p></div></div>
        <div v-else class="admin-simulator-state"><i :class="String(simulator.status || '').toLowerCase()"></i><div><span>当前状态</span><strong>{{ serviceStatusLabel(simulator.status) }}</strong><small>{{ simulator.program || '—' }}</small></div></div>
        <div class="admin-action-row"><button class="g-btn secondary" :disabled="busy" @click="refreshSimulator">刷新状态</button><button class="g-btn primary" :disabled="busy || !simulator.available || simulator.status === 'RUNNING'" @click="controlSimulator('start')">启动</button><button class="g-btn danger" :disabled="busy || !simulator.available || simulator.status !== 'RUNNING'" @click="controlSimulator('stop')">停止</button></div>
      </section>

      <div v-if="showDeviceRegistration" class="g-modal-overlay admin-device-dialog-overlay" @click.self="closeDeviceRegistration" @keydown.esc="closeDeviceRegistration">
        <form class="g-modal admin-device-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-device-register-title" @submit.prevent="registerDevice">
          <div class="g-modal-header"><div><small>登记设备事实</small><h3 id="admin-device-register-title">添加设备</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭" :disabled="busy" @click="closeDeviceRegistration"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body">
            <div class="admin-form-grid one-column">
              <label><span>设备编号</span><input v-model.trim="deviceForm.deviceId" required placeholder="例如 SENSOR-A04"></label>
              <label><span>设备名称</span><input v-model.trim="deviceForm.name" required placeholder="例如 A04 环境采集器"></label>
              <label><span>设备类型</span><select v-model="deviceForm.type"><option value="ENVIRONMENTAL_SENSOR">环境传感器</option><option value="IRRIGATION_CONTROLLER">灌溉控制器</option><option value="FLOW_METER">流量计</option></select></label>
            </div>
            <p class="admin-hint">注册和绑定不会把设备标记为在线；只有后端收到心跳或遥测后才显示在线。</p>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" :disabled="busy" @click="closeDeviceRegistration">取消</button><button type="submit" class="g-btn primary" :disabled="busy">{{ busy ? '正在注册…' : '注册设备' }}</button></div>
        </form>
      </div>

      <div v-if="activeDevice" class="g-modal-overlay admin-device-dialog-overlay" @click.self="closeDeviceDetail" @keydown.esc="closeDeviceDetail">
        <section class="g-modal admin-device-dialog admin-device-detail" role="dialog" aria-modal="true" aria-labelledby="admin-device-detail-title">
          <div class="g-modal-header"><div><small>设备详情</small><h3 id="admin-device-detail-title">{{ activeDevice.name || activeDevice.deviceId }}</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭" :disabled="busy" @click="closeDeviceDetail"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body admin-device-detail-body">
            <div class="admin-device-detail-status">
              <div class="admin-device-status" :class="String(activeDevice.status || 'offline').toLowerCase()"><i></i><span>{{ deviceStatusLabel(activeDevice.status) }}</span></div>
              <span class="admin-binding-state" :class="activeDevice.plotId ? 'bound' : 'unbound'">{{ bindingLabel(activeDevice) }}</span>
            </div>
            <dl class="admin-device-detail-facts">
              <div><dt>设备编号</dt><dd>{{ activeDevice.deviceId }}</dd></div>
              <div><dt>设备类型</dt><dd>{{ deviceTypeLabel(activeDevice.type) }}</dd></div>
              <div><dt>绑定地块</dt><dd>{{ plotName(activeDevice.plotId) }}</dd></div>
              <div><dt>最近数据</dt><dd>{{ readableTime(deviceLastSeen(activeDevice)) }}</dd></div>
              <div><dt>注册时间</dt><dd>{{ readableTime(activeDevice.registeredAt) }}</dd></div>
              <div><dt>健康评分</dt><dd>{{ healthLabel(activeDevice) }}</dd></div>
              <div><dt>数据来源</dt><dd>{{ sourceLabel(activeDevice.sourceMode) }}</dd></div>
              <div><dt>所属农场</dt><dd>{{ display(activeDevice.farmId || farmId) }}</dd></div>
            </dl>
            <div v-if="!activeDevice.plotId" class="admin-device-binding-editor">
              <label><span>绑定地块</span><select v-model="bindSelections[activeDevice.deviceId]"><option value="">请选择地块</option><option v-for="plot in plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}</option></select></label>
              <p>绑定后仍保持当前在线事实；收到后端心跳或遥测后才会显示在线。</p>
            </div>
            <p v-else class="admin-device-detail-note">当前绑定到 {{ plotName(activeDevice.plotId) }}。解除绑定不会删除设备事实。</p>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" :disabled="busy" @click="closeDeviceDetail">关闭</button><button v-if="!activeDevice.plotId" type="button" class="g-btn primary" :disabled="busy || !bindSelections[activeDevice.deviceId]" @click="bind(activeDevice)">绑定设备</button><button v-else type="button" class="g-btn secondary" :disabled="busy" @click="unbind(activeDevice)">解除绑定</button></div>
        </section>
      </div>
    </section>
  `
};
