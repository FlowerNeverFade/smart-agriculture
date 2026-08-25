import { api } from '../api.js';
import { normalizeAdminTab } from '../admin-state.js';

const { ref, computed, watch, inject } = Vue;

export const AdminMemberManagementView = {
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const activeTab = ref(normalizeAdminTab('farm-members', props.routeParams?.tab));
    const busyUserId = ref('');
    const draftScopes = ref({});
    const farmId = computed(() => props.state.adminContext?.farmId || '');
    const members = computed(() => props.state.farmMembers || []);
    const farmers = computed(() => members.value.filter(member => String(member.role).toUpperCase() === 'FARMER'));
    const plots = computed(() => (props.state.allPlots || props.state.plots || []).filter(plot => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE'));
    const syncDrafts = () => {
      const farmPlotIds = new Set(plots.value.map(plot => plot.plotId));
      const next = {};
      farmers.value.forEach(member => { next[member.userId] = (member.plotIds || []).filter(plotId => farmPlotIds.has(plotId)); });
      draftScopes.value = next;
    };
    watch(() => props.routeParams?.tab, tab => { activeTab.value = normalizeAdminTab('farm-members', tab); });
    watch([farmers, plots], syncDrafts, { immediate: true, deep: true });
    const setTab = tab => emit('navigate', 'farm-members', { tab, farmId: farmId.value });
    const togglePlot = (userId, plotId, checked) => {
      const values = new Set(draftScopes.value[userId] || []);
      if (checked) values.add(plotId); else values.delete(plotId);
      draftScopes.value = { ...draftScopes.value, [userId]: [...values] };
    };
    const saveScope = async member => {
      busyUserId.value = member.userId;
      try {
        const updated = await api.updateFarmMemberScope(member.userId, { farmId: farmId.value, plotIds: draftScopes.value[member.userId] || [] });
        emit('data-invalidated', { domains: ['members', 'workOrders'], record: updated });
        toast(`${member.displayName || member.username}的地块权限已更新，下一次请求立即生效`);
      } catch (error) { toast(error.message || '地块权限更新失败', 'error'); }
      finally { busyUserId.value = ''; }
    };
    const memberPlots = member => (member.plotIds || []).map(id => plots.value.find(plot => plot.plotId === id)?.name || id);
    const openAssignments = member => emit('navigate', 'work-orders', { tab: 'tasks', assigneeId: member.userId, farmId: farmId.value });
    return { activeTab, busyUserId, draftScopes, farmId, members, farmers, plots, setTab, togglePlot, saveScope, memberPlots, openAssignments };
  },
  template: `
    <section class="admin-management-page">
      <header class="admin-section-header"><div><h1>农场成员</h1><p>成员身份来自正式账户；这里只维护本农场的地块范围。</p></div></header>
      <nav class="admin-local-tabs" aria-label="农场成员页签"><button :class="{active: activeTab === 'members'}" @click="setTab('members')">成员列表</button><button :class="{active: activeTab === 'permissions'}" @click="setTab('permissions')">地块权限</button></nav>

      <section v-if="activeTab === 'members'" class="admin-panel">
        <div class="admin-panel-title"><div><span>当前农场</span><h2>成员列表</h2></div><em>{{ members.length }} 人</em></div>
        <div class="admin-member-list">
          <article v-for="member in members" :key="member.userId">
            <span class="admin-member-avatar">{{ String(member.displayName || member.username || '?').slice(0, 1) }}</span>
            <div><strong>{{ member.displayName || member.username }}</strong><small>{{ member.roleLabel || member.role }} · {{ member.sourceMode || (state.sessionMode === 'demo' ? 'SIMULATED' : 'ACCOUNT') }}</small></div>
            <div><span>负责地块</span><strong>{{ memberPlots(member).join('、') || '未分配' }}</strong></div>
            <span class="admin-status-pill" :class="String(member.status || '').toLowerCase()">{{ member.status || '—' }}</span>
            <button class="g-btn secondary compact" v-if="member.role === 'FARMER'" @click="openAssignments(member)">查看任务</button>
          </article>
          <p v-if="!members.length" class="admin-empty">正式后端没有返回成员记录；这里不会补入演示成员。</p>
        </div>
      </section>

      <section v-else class="admin-panel">
        <div class="admin-panel-title"><div><span>即时生效</span><h2>种植农户地块范围</h2></div><em>只改本农场</em></div>
        <p class="admin-hint">不会修改成员角色或其他农场权限。权限收回后，后端从下一次受保护请求起重新读取账户范围。</p>
        <div class="admin-permission-table">
          <article v-for="member in farmers" :key="member.userId">
            <header><div><strong>{{ member.displayName || member.username }}</strong><small>{{ member.username }}</small></div><button class="g-btn primary compact" :disabled="busyUserId === member.userId" @click="saveScope(member)">{{ busyUserId === member.userId ? '保存中…' : '保存权限' }}</button></header>
            <div class="admin-scope-checks"><label v-for="plot in plots" :key="plot.plotId"><input type="checkbox" :checked="draftScopes[member.userId]?.includes(plot.plotId)" @change="togglePlot(member.userId, plot.plotId, $event.target.checked)"><span><strong>{{ plot.name }}</strong><small>{{ plot.plotId }}</small></span></label></div>
          </article>
          <p v-if="!farmers.length" class="admin-empty">当前农场没有可维护的种植农户账户。</p>
        </div>
      </section>
    </section>
  `
};
