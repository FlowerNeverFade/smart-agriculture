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
    const createForm = ref({ username: '', password: '', displayName: '', plotIds: [] });
    const creating = ref(false);
    const lastRecoveryCode = ref('');
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
    const toggleCreatePlot = (plotId, checked) => {
      const values = new Set(createForm.value.plotIds);
      if (checked) values.add(plotId); else values.delete(plotId);
      createForm.value = { ...createForm.value, plotIds: [...values] };
    };
    const createMember = async () => {
      if (!createForm.value.username || !createForm.value.password) {
        toast('请填写账号和初始密码', 'error');
        return;
      }
      creating.value = true;
      try {
        const created = await api.createFarmMember({
          farmId: farmId.value,
          username: createForm.value.username.trim(),
          password: createForm.value.password,
          displayName: createForm.value.displayName.trim(),
          plotIds: createForm.value.plotIds
        });
        lastRecoveryCode.value = created.recoveryCode || '';
        createForm.value = { username: '', password: '', displayName: '', plotIds: [] };
        emit('data-invalidated', { domains: ['members', 'workOrders'], record: created });
        toast(lastRecoveryCode.value
          ? `${created.displayName || created.username} 已创建，请立即抄录一次性恢复码`
          : `${created.displayName || created.username} 已创建`);
      } catch (error) { toast(error.message || '创建农户失败', 'error'); }
      finally { creating.value = false; }
    };
    const toggleMember = async member => {
      if (member.role !== 'FARMER') {
        toast('这里只能启用或停用种植农户', 'error');
        return;
      }
      busyUserId.value = member.userId;
      try {
        const nextStatus = String(member.status || '').toUpperCase() === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        const updated = await api.updateFarmMemberStatus(member.userId, { farmId: farmId.value, status: nextStatus });
        emit('data-invalidated', { domains: ['members', 'workOrders'], record: updated });
        toast(`${member.displayName || member.username} 已${nextStatus === 'ACTIVE' ? '启用' : '停用'}`);
      } catch (error) { toast(error.message || '成员状态更新失败', 'error'); }
      finally { busyUserId.value = ''; }
    };
    const memberPlots = member => (member.plotIds || []).map(id => plots.value.find(plot => plot.plotId === id)?.name || id);
    const openAssignments = member => emit('navigate', 'work-orders', { tab: 'tasks', assigneeId: member.userId, farmId: farmId.value });
    return { activeTab, busyUserId, draftScopes, createForm, creating, lastRecoveryCode, farmId, members, farmers, plots, setTab, togglePlot, saveScope, toggleCreatePlot, createMember, toggleMember, memberPlots, openAssignments };
  },
  template: `
    <section class="admin-management-page">
      <header class="admin-section-header"><div><h1>农场成员</h1><p>可创建种植农户、启用或停用账号，并维护本农场的地块范围。</p></div></header>
      <nav class="admin-local-tabs" aria-label="农场成员页签"><button :class="{active: activeTab === 'members'}" @click="setTab('members')">成员列表</button><button :class="{active: activeTab === 'permissions'}" @click="setTab('permissions')">地块权限</button></nav>

      <section v-if="activeTab === 'members'" class="admin-panel">
        <div class="admin-panel-title"><div><span>当前农场</span><h2>成员列表</h2></div><em>{{ members.length }} 人</em></div>
        <form class="admin-member-create" @submit.prevent="createMember">
          <strong>创建种植农户</strong>
          <div class="admin-member-create-grid">
            <label>账号<input class="g-input" v-model.trim="createForm.username" required placeholder="4–32 位字母数字" autocomplete="off"></label>
            <label>初始密码<input class="g-input" v-model="createForm.password" type="password" required placeholder="8 位以上，含字母和数字" autocomplete="new-password"></label>
            <label>显示名<input class="g-input" v-model.trim="createForm.displayName" placeholder="可选"></label>
          </div>
          <div class="admin-scope-checks">
            <label v-for="plot in plots" :key="'create-' + plot.plotId"><input type="checkbox" :checked="createForm.plotIds.includes(plot.plotId)" @change="toggleCreatePlot(plot.plotId, $event.target.checked)"><span><strong>{{ plot.name }}</strong><small>{{ plot.plotId }}</small></span></label>
          </div>
          <p v-if="lastRecoveryCode" class="admin-hint">一次性恢复码：<code>{{ lastRecoveryCode }}</code>，请立即交给农户，页面刷新后不再显示。</p>
          <button class="g-btn primary compact" type="submit" :disabled="creating">{{ creating ? '创建中…' : '创建农户' }}</button>
        </form>
        <div class="admin-member-list">
          <article v-for="member in members" :key="member.userId">
            <span class="admin-member-avatar">{{ String(member.displayName || member.username || '?').slice(0, 1) }}</span>
            <div>
              <strong>{{ member.displayName || member.username }}</strong>
              <small class="admin-member-meta">
                <span>{{ member.roleLabel || member.role }}</span>
                <span class="admin-member-meta-separator" aria-hidden="true">·</span>
                <span class="admin-member-meta-source">{{ member.sourceMode || (state.sessionMode === 'demo' ? 'SIMULATED' : 'ACCOUNT') }}</span>
              </small>
            </div>
            <div><span>负责地块</span><strong>{{ memberPlots(member).join('、') || '未分配' }}</strong></div>
            <span class="admin-status-pill" :class="String(member.status || '').toLowerCase()">{{ member.status === 'ACTIVE' ? '启用' : '停用' }}</span>
            <button class="g-btn secondary compact" v-if="member.role === 'FARMER'" :disabled="busyUserId === member.userId" @click="toggleMember(member)">{{ String(member.status || '').toUpperCase() === 'ACTIVE' ? '停用' : '启用' }}</button>
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
