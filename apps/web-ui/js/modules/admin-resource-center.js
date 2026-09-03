import { api } from '../api.js?v=20260902-manager-plot-order-v1';
import {
  adminDeviceMatchesFilters,
  adminDeviceSummary,
  adminDeviceTypeLabel,
  deviceRelatedAlerts,
  deviceRelatedWorkOrders,
  formatHealthScore
} from '../admin-state.js?v=20260902-performance-v1';
import { deviceTypeLabel, serviceStatusLabel, sourceLabel, statusLabel } from '../live-data.js?v=20260902-performance-v1';

const { ref, computed, watch, inject, onMounted, onBeforeUnmount } = Vue;

const ALERT_STATUS_LABELS = Object.freeze({ ACTIVE: '待确认', ACKED: '已确认', ESCALATED: '已升级', CLOSED: '已关闭', RESOLVED: '已解决' });
const ALERT_LEVEL_LABELS = Object.freeze({ CRITICAL: '严重', HIGH: '紧急', MEDIUM: '注意', LOW: '提示' });
const TASK_STATUS_LABELS = Object.freeze({ OPEN: '待分配', ASSIGNED: '待执行', IN_PROGRESS: '执行中', SUBMITTED: '待验收', REJECTED: '需返工', DONE: '已完成', COMPLETED: '已完成', CANCELLED: '已取消' });

function recordTime(record, keys) {
  for (const key of keys) {
    const value = new Date(record?.[key] || 0).getTime();
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

export const AdminResourceCenterView = {
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const busy = ref(false);
    const controlBusyId = ref('');
    const showDeviceRegistration = ref(false);
    const activeDeviceId = ref('');
    const deviceMenuId = ref('');
    const deviceDeleteTarget = ref(null);
    const deviceDeleteConfirm = ref('');
    const bindSelections = ref({});
    const statusFilter = ref('ALL');
    const typeFilter = ref('ALL');
    const bindingFilter = ref('ALL');
    const keyword = ref('');
    const deviceForm = ref({ mode: 'create', deviceId: '', name: '', type: 'ENVIRONMENTAL_SENSOR', sourceMode: 'SIMULATION' });
    const farmId = computed(() => props.state.adminContext?.farmId || '');
    const plots = computed(() => (props.state.allPlots || props.state.plots || []).filter(plot => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE'));
    const devices = computed(() => props.state.devices || []);
    const activeDevice = computed(() => devices.value.find(device => device.deviceId === activeDeviceId.value) || null);
    const summary = computed(() => adminDeviceSummary(devices.value));
    const typeOptions = computed(() => {
      const types = new Map();
      devices.value.forEach(device => {
        const value = String(device?.type || '').trim();
        if (value && !types.has(value)) types.set(value, adminDeviceTypeLabel(value));
      });
      return [...types].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
    });
    const visibleDevices = computed(() => devices.value.filter(device => adminDeviceMatchesFilters({
      ...device,
      plotName: plotName(device.plotId)
    }, {
      status: statusFilter.value,
      type: typeFilter.value,
      binding: bindingFilter.value,
      keyword: keyword.value
    })));
    const activeDeviceAlerts = computed(() => deviceRelatedAlerts(activeDevice.value, props.state.alerts)
      .slice().sort((a, b) => recordTime(b, ['raisedAt', 'createdAt']) - recordTime(a, ['raisedAt', 'createdAt'])));
    const activeDeviceTasks = computed(() => deviceRelatedWorkOrders(activeDevice.value, props.state.workOrders)
      .slice().sort((a, b) => recordTime(b, ['updatedAt', 'createdAt', 'dueAt']) - recordTime(a, ['updatedAt', 'createdAt', 'dueAt'])));

    const upsertDevice = device => {
      if (!device?.deviceId) return;
      const index = props.state.devices.findIndex(item => item.deviceId === device.deviceId);
      if (index >= 0) props.state.devices.splice(index, 1, { ...props.state.devices[index], ...device });
      else props.state.devices.unshift(device);
    };
    const resetDeviceDialogs = () => {
      showDeviceRegistration.value = false;
      activeDeviceId.value = '';
      deviceMenuId.value = '';
      deviceDeleteTarget.value = null;
      deviceDeleteConfirm.value = '';
      bindSelections.value = {};
    };
    const resetFilters = () => {
      statusFilter.value = 'ALL';
      typeFilter.value = 'ALL';
      bindingFilter.value = 'ALL';
      keyword.value = '';
    };
    const openDeviceRegistration = () => {
      activeDeviceId.value = '';
      deviceForm.value = { mode: 'create', deviceId: '', name: '', type: 'ENVIRONMENTAL_SENSOR', sourceMode: 'SIMULATION' };
      showDeviceRegistration.value = true;
    };
    const closeDeviceRegistration = () => {
      if (!busy.value) showDeviceRegistration.value = false;
    };
    const openDeviceDetail = device => {
      deviceMenuId.value = '';
      showDeviceRegistration.value = false;
      activeDeviceId.value = device?.deviceId || '';
      if (device?.deviceId) bindSelections.value[device.deviceId] = device.plotId || '';
    };
    const closeDeviceDetail = () => {
      if (!busy.value) activeDeviceId.value = '';
    };
    const toggleDeviceMenu = deviceId => { deviceMenuId.value = deviceMenuId.value === deviceId ? '' : deviceId; };
    const closeDeviceMenu = () => { deviceMenuId.value = ''; };
    const openDeviceEdit = device => {
      closeDeviceMenu();
      activeDeviceId.value = '';
      deviceForm.value = { mode: 'edit', deviceId: device?.deviceId || '', name: device?.name || device?.deviceId || '', type: device?.type || 'ENVIRONMENTAL_SENSOR', sourceMode: device?.sourceMode || device?.dataOrigin || 'SIMULATION' };
      showDeviceRegistration.value = true;
    };
    const deleteDeviceBlockers = device => {
      if (!device) return ['设备不存在'];
      const blockers = [];
      if (String(device.status || '').toUpperCase() !== 'OFFLINE') blockers.push('请先关闭设备');
      if (device.plotId || String(device.bindingState || '').toUpperCase() === 'BOUND') blockers.push('请先解除绑定');
      if (controlPending(device)) blockers.push('请等待控制回执完成');
      return blockers;
    };
    const canDeleteDevice = device => deleteDeviceBlockers(device).length === 0;
    const requestDeleteDevice = device => {
      closeDeviceMenu();
      deviceDeleteTarget.value = device || null;
      deviceDeleteConfirm.value = '';
    };
    const closeDeleteDevice = (force = false) => { if (force || !busy.value) { deviceDeleteTarget.value = null; deviceDeleteConfirm.value = ''; } };
    const confirmDeleteDevice = async () => {
      const target = deviceDeleteTarget.value;
      if (!target || !canDeleteDevice(target) || deviceDeleteConfirm.value.trim() !== String(target.name || target.deviceId).trim()) return;
      busy.value = true;
      try {
        await api.deleteDevice(target.deviceId, deviceDeleteConfirm.value);
        props.state.devices.splice(props.state.devices.findIndex(item => item.deviceId === target.deviceId), 1);
        activeDeviceId.value = '';
        closeDeleteDevice(true);
        emit('data-invalidated', { domains: ['devices', 'plots', 'overview'], record: { deviceId: target.deviceId, deleted: true } });
        toast('设备已删除');
      } catch (error) { toast(error.message || '设备删除失败', 'error'); }
      finally { busy.value = false; }
    };
    const closeActiveDialogOnEscape = event => {
      if (event.key !== 'Escape') return;
      if (deviceMenuId.value) closeDeviceMenu();
      else if (deviceDeleteTarget.value) closeDeleteDevice();
      else if (showDeviceRegistration.value) closeDeviceRegistration();
      else if (activeDevice.value) closeDeviceDetail();
    };
    const openDeviceFromKeyboard = (event, device) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openDeviceDetail(device);
    };
    const setSummaryFilter = filter => {
      resetFilters();
      if (filter === 'online') statusFilter.value = 'ONLINE';
      if (filter === 'attention') statusFilter.value = 'ATTENTION';
      if (filter === 'unbound') bindingFilter.value = 'UNBOUND';
    };
    const summaryFilterActive = filter => {
      if (filter === 'online') return statusFilter.value === 'ONLINE' && bindingFilter.value === 'ALL';
      if (filter === 'attention') return statusFilter.value === 'ATTENTION' && bindingFilter.value === 'ALL';
      if (filter === 'unbound') return bindingFilter.value === 'UNBOUND' && statusFilter.value === 'ALL';
      return statusFilter.value === 'ALL' && typeFilter.value === 'ALL' && bindingFilter.value === 'ALL' && !keyword.value;
    };

    watch(farmId, () => {
      resetDeviceDialogs();
      resetFilters();
    });
    onMounted(() => document.addEventListener('keydown', closeActiveDialogOnEscape));
    onBeforeUnmount(() => document.removeEventListener('keydown', closeActiveDialogOnEscape));

    const registerDevice = async () => {
      if (!deviceForm.value.deviceId.trim() || !deviceForm.value.name.trim()) return toast('请填写设备编号和名称', 'error');
      busy.value = true;
      try {
        const editing = deviceForm.value.mode === 'edit';
        const device = editing
          ? await api.updateDevice(deviceForm.value.deviceId, { name: deviceForm.value.name, type: deviceForm.value.type })
          : await api.registerDevice({ ...deviceForm.value, farmId: farmId.value });
        upsertDevice(device);
        deviceForm.value = { mode: 'create', deviceId: '', name: '', type: 'ENVIRONMENTAL_SENSOR', sourceMode: 'SIMULATION' };
        showDeviceRegistration.value = false;
        emit('data-invalidated', { domains: ['devices', 'plots', 'overview'], record: device });
        toast(editing ? '设备信息已更新' : '设备已注册并显示在列表中，请继续选择地块完成绑定');
      } catch (error) { toast(error.message || '设备注册失败', 'error'); }
      finally { busy.value = false; }
    };
    const bind = async device => {
      const plotId = bindSelections.value[device.deviceId];
      if (!plotId) return toast('请选择要绑定的地块', 'error');
      if (device.plotId && device.plotId !== plotId && !window.confirm(`该设备当前绑定在“${plotName(device.plotId)}”，确认转移到“${plotName(plotId)}”吗？`)) return;
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

    const controlKind = device => {
      const source = String(device?.sourceMode || device?.dataOrigin || '').trim().toUpperCase();
      const id = String(device?.deviceId || '').toLowerCase();
      if (source === 'SIMULATION' || source === 'SIMULATED' || id.startsWith('mock-')) return 'SIMULATED';
      if (source === 'REAL' || source === 'HARDWARE') return 'REAL';
      return 'UNMANAGED';
    };
    const controlAvailable = device => Boolean(device?.plotId) && controlKind(device) !== 'UNMANAGED';
    const controlPending = device => String(device?.controlStatus || '').toUpperCase() === 'PENDING';
    const controlButtonLabel = device => {
      if (controlPending(device)) return String(device?.desiredStatus || '').toUpperCase() === 'OFFLINE' ? '正在关闭…' : '正在开启…';
      return String(device?.status || '').toUpperCase() === 'ONLINE' ? '关闭设备' : '开启设备';
    };
    const controlUnavailableReason = device => !device?.plotId ? '请先绑定地块' : controlKind(device) === 'UNMANAGED' ? '设备来源未确认，无法安全控制' : '';
    const controlDevice = async device => {
      if (!device?.deviceId || !controlAvailable(device) || controlPending(device) || controlBusyId.value) {
        if (device && !controlAvailable(device)) toast(controlUnavailableReason(device), 'error');
        return;
      }
      const targetStatus = String(device.status || '').toUpperCase() === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
      if (targetStatus === 'OFFLINE' && !window.confirm(`确认关闭 ${device.name || device.deviceId}？关闭后将停止该设备的遥测上报。`)) return;
      controlBusyId.value = device.deviceId;
      try {
        const randomKey = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const result = await api.controlDevice(device.deviceId, { targetStatus, idempotencyKey: `ui-${device.deviceId}-${targetStatus}-${randomKey}` });
        const saved = result?.device || result?.latestDevice || result;
        upsertDevice(saved);
        emit('data-invalidated', { domains: ['devices', 'plots', 'overview'], record: saved });
        const commandStatus = String(result?.commandStatus || saved?.controlStatus || '').toUpperCase();
        if (commandStatus === 'PENDING') toast(`已发送${targetStatus === 'ONLINE' ? '开启' : '关闭'}指令，等待设备回执`);
        else toast(`${targetStatus === 'ONLINE' ? '设备已开启' : '设备已关闭'}${controlKind(device) === 'REAL' ? '（已收到设备回执）' : ''}`);
      } catch (error) { toast(error.message || '设备控制失败', 'error'); }
      finally { controlBusyId.value = ''; }
    };

    function plotName(plotId) {
      return plots.value.find(plot => plot.plotId === plotId)?.name || plotId || '未绑定';
    }
    const bindingLabel = device => (device?.plotId || String(device?.bindingState || '').toUpperCase() === 'BOUND') ? '已绑定' : '未绑定';
    const deviceStatusLabel = status => serviceStatusLabel(status, '状态未知');
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
    const alertStatusLabel = status => ALERT_STATUS_LABELS[String(status || '').toUpperCase()] || display(status);
    const alertLevelLabel = level => ALERT_LEVEL_LABELS[String(level || '').toUpperCase()] || display(level);
    const taskStatusLabel = status => TASK_STATUS_LABELS[String(status || '').toUpperCase()] || display(status);
    const openRelatedTask = task => {
      activeDeviceId.value = '';
      emit('navigate', 'work-orders', { tab: 'tasks', highlight: task.workOrderId || task.workItemId, farmId: farmId.value });
    };
    const openAlertCenter = () => {
      activeDeviceId.value = '';
      emit('navigate', 'decision-console', { section: 'alerts', farmId: farmId.value });
    };
    const createDeviceTask = device => {
      if (!device?.plotId) return toast('请先为设备绑定地块，再创建现场任务', 'error');
      activeDeviceId.value = '';
      emit('navigate', 'work-orders', { tab: 'tasks', openCreateTask: true, plotId: device.plotId, farmId: farmId.value });
    };

    return {
      busy, controlBusyId, farmId, plots, devices, visibleDevices, summary, typeOptions, activeDevice, activeDeviceAlerts, activeDeviceTasks,
      statusFilter, typeFilter, bindingFilter, keyword, bindSelections, deviceForm, showDeviceRegistration, deviceMenuId, deviceDeleteTarget, deviceDeleteConfirm,
      registerDevice, bind, unbind, setSummaryFilter, summaryFilterActive, resetFilters,
      bindingLabel, deviceStatusLabel, deviceLastSeen, readableTime, healthLabel, sourceLabel, deviceTypeLabel: deviceTypeLabel || adminDeviceTypeLabel, display,
      alertStatusLabel, alertLevelLabel, taskStatusLabel, plotName, openAlertCenter, openRelatedTask, createDeviceTask,
      openDeviceRegistration, closeDeviceRegistration, openDeviceDetail, closeDeviceDetail, openDeviceFromKeyboard,
      openDeviceEdit, toggleDeviceMenu, closeDeviceMenu, requestDeleteDevice, closeDeleteDevice, confirmDeleteDevice, deleteDeviceBlockers, canDeleteDevice,
      controlKind, controlAvailable, controlPending, controlButtonLabel, controlUnavailableReason, controlDevice
    };
  },
  template: `
    <section class="admin-management-page admin-equipment-center">
      <header class="admin-section-header"><div><h1>设备与设施</h1><p>统一管理设备台账、运行状态、地块绑定和现场运维关联。</p></div></header>

      <section class="admin-device-summary" aria-label="设备概况">
        <button type="button" class="tone-teal" :class="{active: summaryFilterActive('all')}" :aria-pressed="summaryFilterActive('all')" @click="setSummaryFilter('all')"><span>全部设备</span><strong>{{ summary.all }}</strong><small>登记台账</small></button>
        <button type="button" class="tone-mint" :class="{active: summaryFilterActive('online')}" :aria-pressed="summaryFilterActive('online')" @click="setSummaryFilter('online')"><span>在线运行</span><strong>{{ summary.online }}</strong><small>心跳正常</small></button>
        <button type="button" class="tone-orange" :class="{active: summaryFilterActive('attention')}" :aria-pressed="summaryFilterActive('attention')" @click="setSummaryFilter('attention')"><span>需要处理</span><strong>{{ summary.attention }}</strong><small>离线或异常</small></button>
        <button type="button" class="tone-purple" :class="{active: summaryFilterActive('unbound')}" :aria-pressed="summaryFilterActive('unbound')" @click="setSummaryFilter('unbound')"><span>尚未绑定</span><strong>{{ summary.unbound }}</strong><small>等待配置地块</small></button>
      </section>

      <section class="admin-device-toolbar" aria-label="设备筛选">
        <label><span>运行状态</span><select v-model="statusFilter"><option value="ALL">全部状态</option><option value="ONLINE">在线</option><option value="ATTENTION">需要处理</option><option value="DEGRADED">状态异常</option><option value="OFFLINE">离线</option></select></label>
        <label><span>设备类型</span><select v-model="typeFilter"><option value="ALL">全部类型</option><option v-for="option in typeOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
        <label><span>绑定状态</span><select v-model="bindingFilter"><option value="ALL">全部绑定状态</option><option value="BOUND">已绑定</option><option value="UNBOUND">未绑定</option></select></label>
        <label class="admin-device-search"><span>快速查找</span><input v-model.trim="keyword" placeholder="设备名称、编号、类型或地块"></label>
        <button v-if="statusFilter !== 'ALL' || typeFilter !== 'ALL' || bindingFilter !== 'ALL' || keyword" type="button" class="g-btn text compact" @click="resetFilters">清除筛选</button>
      </section>

      <section class="admin-panel admin-device-panel">
        <div class="admin-panel-title"><div><span>当前农场</span><h2>设备台账</h2></div><em>{{ visibleDevices.length }} / {{ devices.length }} 台</em></div>
        <div class="admin-device-card-grid">
           <article v-for="device in visibleDevices" :key="device.deviceId" class="admin-device-card" :class="{ 'has-open-menu': deviceMenuId === device.deviceId }" role="button" tabindex="0"
            :aria-label="'查看设备详情：' + (device.name || device.deviceId)" @click="openDeviceDetail(device)" @keydown="openDeviceFromKeyboard($event, device)">
            <header class="admin-device-card-header">
              <div class="admin-device-card-header-main">
                <div class="admin-device-status" :class="String(device.status || 'offline').toLowerCase()"><i></i><span>{{ deviceStatusLabel(device.status) }}</span></div>
                <span class="admin-binding-state" :class="device.plotId ? 'bound' : 'unbound'">{{ bindingLabel(device) }}</span>
              </div>
              <div class="admin-device-card-tools" @click.stop>
                <div class="manager-plot-actions">
                  <button type="button" class="manager-more-button" :aria-expanded="deviceMenuId === device.deviceId ? 'true' : 'false'" :aria-label="'设备操作：' + (device.name || device.deviceId)" title="更多操作" @click.stop="toggleDeviceMenu(device.deviceId)"><app-icon name="more_vertical"></app-icon></button>
                  <div v-if="deviceMenuId === device.deviceId" class="manager-plot-menu" role="menu" @click.stop>
                    <button type="button" role="menuitem" @click="openDeviceEdit(device)"><app-icon name="edit"></app-icon>修改设备</button>
                    <button type="button" role="menuitem" class="is-danger" @click="requestDeleteDevice(device)"><app-icon name="delete"></app-icon>删除设备</button>
                  </div>
                </div>
              </div>
            </header>
            <div class="admin-device-identity"><h3>{{ device.name || device.deviceId }}</h3><small>{{ device.deviceId }}</small></div>
            <dl class="admin-device-card-facts">
              <div><dt>设备类型</dt><dd>{{ deviceTypeLabel(device.type) }}</dd></div>
              <div><dt>绑定地块</dt><dd>{{ plotName(device.plotId) }}</dd></div>
              <div><dt>最近数据</dt><dd>{{ readableTime(deviceLastSeen(device)) }}</dd></div>
              <div><dt>健康评分</dt><dd>{{ healthLabel(device) }}</dd></div>
            </dl>
             <footer>
               <span>{{ sourceLabel(device.sourceMode || device.dataOrigin || 'DEVICE') }}</span>
               <div class="admin-device-card-actions">
                 <button type="button" class="g-btn compact admin-device-control-button" :class="{offline: String(device.status || '').toUpperCase() === 'ONLINE'}" :disabled="!controlAvailable(device) || controlPending(device) || controlBusyId === device.deviceId" :title="controlAvailable(device) ? controlButtonLabel(device) : controlUnavailableReason(device)" @click.stop="controlDevice(device)">
                   {{ controlBusyId === device.deviceId ? '处理中…' : controlButtonLabel(device) }}
                 </button>
                 <strong>查看详情 <app-icon name="chevron_right"></app-icon></strong>
               </div>
             </footer>
          </article>
          <button type="button" class="admin-device-card admin-add-device-card" @click="openDeviceRegistration">
            <span class="manager-add-plot-icon"><app-icon name="add"></app-icon></span>
            <strong>添加设备</strong>
            <small>登记设备事实，随后绑定地块</small>
          </button>
        </div>
        <p v-if="devices.length && !visibleDevices.length" class="admin-empty">没有符合当前筛选条件的设备。</p>
        <p v-else-if="!devices.length" class="admin-empty">当前农场还没有设备记录，请使用添加卡片登记。</p>
      </section>

      <div v-if="showDeviceRegistration" class="g-modal-overlay admin-device-dialog-overlay" @click.self="closeDeviceRegistration">
        <form class="g-modal admin-device-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-device-register-title" @submit.prevent="registerDevice">
          <div class="g-modal-header"><div><small>登记设备事实</small><h3 id="admin-device-register-title">{{ deviceForm.mode === 'edit' ? '修改设备' : '添加设备' }}</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭" :disabled="busy" @click="closeDeviceRegistration"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body">
            <div class="admin-form-grid one-column">
              <label><span>设备编号</span><input v-model.trim="deviceForm.deviceId" required placeholder="例如 SENSOR-A04" :readonly="deviceForm.mode === 'edit'"></label>
              <label><span>设备名称</span><input v-model.trim="deviceForm.name" required placeholder="例如 A04 环境采集器"></label>
              <label><span>设备类型</span><select v-model="deviceForm.type"><option value="ENVIRONMENTAL_SENSOR">环境传感器</option><option value="IRRIGATION_CONTROLLER">灌溉控制器</option><option value="FLOW_METER">流量计</option></select></label>
              <label><span>接入方式</span><select v-model="deviceForm.sourceMode" :disabled="deviceForm.mode === 'edit'"><option value="SIMULATION">模拟设备</option><option value="REAL">真实设备（设备消息协议）</option></select></label>
            </div>
            <p class="admin-hint">登记和绑定不会把设备标记为在线；只有后端收到心跳或遥测后才显示在线。</p>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" :disabled="busy" @click="closeDeviceRegistration">取消</button><button type="submit" class="g-btn primary" :disabled="busy">{{ busy ? '正在保存…' : (deviceForm.mode === 'edit' ? '保存修改' : '注册设备') }}</button></div>
        </form>
      </div>

      <div v-if="deviceDeleteTarget" class="g-modal-overlay admin-device-dialog-overlay" @click.self="closeDeleteDevice">
        <section class="g-modal admin-device-dialog admin-device-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-device-delete-title">
          <div class="g-modal-header"><div><small>永久删除设备</small><h3 id="admin-device-delete-title">确认删除 {{ deviceDeleteTarget.name || deviceDeleteTarget.deviceId }}</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭" :disabled="busy" @click="closeDeleteDevice"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body">
            <p class="admin-danger-copy">删除只移除设备主记录，遥测、命令和审计历史会保留。该操作不可撤销。</p>
            <div v-if="deleteDeviceBlockers(deviceDeleteTarget).length" class="admin-device-delete-blockers"><strong>当前不能删除：</strong><ul><li v-for="blocker in deleteDeviceBlockers(deviceDeleteTarget)" :key="blocker">{{ blocker }}</li></ul><button type="button" class="g-btn text compact" @click="openDeviceDetail(deviceDeleteTarget); closeDeleteDevice()">打开设备详情处理</button></div>
            <label v-else><span>请输入完整设备名称确认</span><input v-model.trim="deviceDeleteConfirm" :placeholder="deviceDeleteTarget.name || deviceDeleteTarget.deviceId" autocomplete="off"></label>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" :disabled="busy" @click="closeDeleteDevice">取消</button><button type="button" class="g-btn danger" :disabled="busy || !canDeleteDevice(deviceDeleteTarget) || deviceDeleteConfirm.trim() !== String(deviceDeleteTarget.name || deviceDeleteTarget.deviceId).trim()" @click="confirmDeleteDevice">永久删除</button></div>
        </section>
      </div>

      <div v-if="activeDevice" class="g-modal-overlay admin-device-dialog-overlay" @click.self="closeDeviceDetail">
        <section class="g-modal admin-device-dialog admin-device-detail" role="dialog" aria-modal="true" aria-labelledby="admin-device-detail-title">
          <div class="g-modal-header"><div><small>设备详情</small><h3 id="admin-device-detail-title">{{ activeDevice.name || activeDevice.deviceId }}</h3></div><button type="button" class="g-btn icon-only" aria-label="关闭" :disabled="busy" @click="closeDeviceDetail"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body admin-device-detail-body">
            <div class="admin-device-detail-status">
              <div class="admin-device-status" :class="String(activeDevice.status || 'offline').toLowerCase()"><i></i><span>{{ deviceStatusLabel(activeDevice.status) }}</span></div>
              <span class="admin-binding-state" :class="activeDevice.plotId ? 'bound' : 'unbound'">{{ bindingLabel(activeDevice) }}</span>
              <span v-if="controlPending(activeDevice)" class="admin-device-control-pending">{{ controlButtonLabel(activeDevice) }}</span>
            </div>
            <div class="admin-device-control-panel">
              <div><strong>设备开关</strong><p v-if="controlAvailable(activeDevice)">{{ controlKind(activeDevice) === 'REAL' ? '真实设备：等待 MQTT 设备回执后更新状态。' : '模拟设备：切换后立即暂停或恢复模拟遥测。' }}</p><p v-else>{{ controlUnavailableReason(activeDevice) }}</p></div>
              <button type="button" class="g-btn compact admin-device-control-button" :class="{offline: String(activeDevice.status || '').toUpperCase() === 'ONLINE'}" :disabled="!controlAvailable(activeDevice) || controlPending(activeDevice) || controlBusyId === activeDevice.deviceId" @click.stop="controlDevice(activeDevice)">{{ controlBusyId === activeDevice.deviceId ? '处理中…' : controlButtonLabel(activeDevice) }}</button>
            </div>
            <dl class="admin-device-detail-facts">
              <div><dt>设备编号</dt><dd>{{ activeDevice.deviceId }}</dd></div>
              <div><dt>设备类型</dt><dd>{{ deviceTypeLabel(activeDevice.type) }}</dd></div>
              <div><dt>绑定地块</dt><dd>{{ plotName(activeDevice.plotId) }}</dd></div>
              <div><dt>最近数据</dt><dd>{{ readableTime(deviceLastSeen(activeDevice)) }}</dd></div>
              <div><dt>注册时间</dt><dd>{{ readableTime(activeDevice.registeredAt) }}</dd></div>
              <div><dt>健康评分</dt><dd>{{ healthLabel(activeDevice) }}</dd></div>
               <div><dt>数据来源</dt><dd>{{ sourceLabel(activeDevice.sourceMode || activeDevice.dataOrigin || 'DEVICE') }}</dd></div>
              <div><dt>所属农场</dt><dd>{{ display(activeDevice.farmId || farmId) }}</dd></div>
            </dl>
            <div class="admin-device-binding-editor">
              <label><span>{{ activeDevice.plotId ? '绑定地块（可直接换绑）' : '绑定地块' }}</span><select v-model="bindSelections[activeDevice.deviceId]"><option value="">未绑定</option><option v-for="plot in plots" :key="plot.plotId" :value="plot.plotId">{{ plot.name }}{{ plot.plotId === activeDevice.plotId ? '（当前）' : '' }}</option></select></label>
              <p>{{ activeDevice.plotId ? '选择其他地块可直接转移，确认后旧地块关系会同步解除。' : '绑定只建立设备与地块关系；收到心跳或模拟开关确认后才会显示在线。' }}</p>
            </div>

            <div class="admin-device-related-grid">
              <section>
                <header><div><h4>相关告警</h4><p>只显示该设备或当前地块的设备类告警。</p></div><em>{{ activeDeviceAlerts.length }} 条</em></header>
                <div v-if="activeDeviceAlerts.length" class="admin-device-related-list">
                  <article v-for="alert in activeDeviceAlerts.slice(0, 3)" :key="alert.alertId || alert.id"><div><strong>{{ alert.title || '设备告警' }}</strong><small>{{ readableTime(alert.raisedAt || alert.createdAt) }}</small></div><span>{{ alertStatusLabel(alert.status) }} · {{ alertLevelLabel(alert.level) }}</span></article>
                </div>
                <p v-else class="admin-device-related-empty">当前没有关联的设备告警。</p>
                <button type="button" class="g-btn text compact" @click="openAlertCenter">进入告警与诊断</button>
              </section>
              <section>
                <header><div><h4>设备检查任务</h4><p>来自统一农务任务，不另建运维事实。</p></div><em>{{ activeDeviceTasks.length }} 项</em></header>
                <div v-if="activeDeviceTasks.length" class="admin-device-related-list">
                  <button v-for="task in activeDeviceTasks.slice(0, 3)" :key="task.workOrderId || task.workItemId" type="button" @click="openRelatedTask(task)"><div><strong>{{ task.title || '设备检查任务' }}</strong><small>{{ readableTime(task.dueAt || task.createdAt) }}</small></div><span>{{ taskStatusLabel(task.status) }}</span></button>
                </div>
                <p v-else class="admin-device-related-empty">当前没有关联的设备检查任务。</p>
              </section>
            </div>
          </div>
          <div class="g-modal-footer admin-device-detail-footer">
            <button type="button" class="g-btn secondary" :disabled="busy" @click="closeDeviceDetail">关闭</button>
            <button v-if="activeDevice.plotId" type="button" class="g-btn g-btn-tonal" :disabled="busy" @click="createDeviceTask(activeDevice)">新建农务任务</button>
            <button type="button" class="g-btn primary" :disabled="busy || !bindSelections[activeDevice.deviceId] || bindSelections[activeDevice.deviceId] === activeDevice.plotId" @click="bind(activeDevice)">{{ activeDevice.plotId ? '保存绑定' : '绑定设备' }}</button>
            <button v-if="activeDevice.plotId" type="button" class="g-btn secondary" :disabled="busy" @click="unbind(activeDevice)">解除绑定</button>
          </div>
        </section>
      </div>
    </section>
  `
};
