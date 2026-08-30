import { api } from '../api.js?v=20260831-ai-role-v1';
import { sourceLabel } from '../live-data.js?v=20260831-ai-role-v1';

const { ref, computed, inject, onMounted, onBeforeUnmount } = Vue;

export const AdminMemberManagementView = {
  props: ['state', 'routeParams'],
  emits: ['navigate', 'data-invalidated'],
  setup(props, { emit }) {
    const toast = inject('toast');
    const busyUserId = ref('');
    const memberMenuId = ref('');
    const memberEditor = ref({ open: false, mode: 'create' });
    const memberDraft = ref({ userId: '', username: '', password: '', plotIds: [] });
    const farmId = computed(() => props.state.adminContext?.farmId || '');
    const members = computed(() => (props.state.farmMembers || []).filter(member => String(member.role).toUpperCase() === 'FARMER'));
    const plots = computed(() => (props.state.allPlots || props.state.plots || []).filter(plot => String(plot.status || 'ACTIVE').toUpperCase() !== 'INACTIVE'));

    const toggleEditorPlot = (plotId, checked) => {
      const values = new Set(memberDraft.value.plotIds || []);
      if (checked) values.add(plotId); else values.delete(plotId);
      memberDraft.value.plotIds = [...values];
    };
    const upsertMember = member => {
      const index = props.state.farmMembers.findIndex(item => item.userId === member.userId);
      if (index >= 0) props.state.farmMembers.splice(index, 1, { ...props.state.farmMembers[index], ...member });
      else props.state.farmMembers.push(member);
    };
    const toggleMemberMenu = userId => {
      memberMenuId.value = memberMenuId.value === userId ? '' : userId;
    };
    const closeMemberMenu = () => { memberMenuId.value = ''; };
    const openCreateMember = () => {
      closeMemberMenu();
      memberDraft.value = { userId: '', username: '', password: '', plotIds: [] };
      memberEditor.value = { open: true, mode: 'create' };
    };
    const openEditMember = member => {
      closeMemberMenu();
      memberDraft.value = {
        userId: member.userId,
        username: member.username || '',
        password: '',
        plotIds: [...(member.plotIds || [])]
      };
      memberEditor.value = { open: true, mode: 'edit' };
    };
    const closeMemberEditor = () => {
      if (busyUserId.value) return;
      memberEditor.value.open = false;
    };
    const submitMember = async () => {
      const draft = memberDraft.value;
      const editing = memberEditor.value.mode === 'edit';
      const username = String(draft.username || '').trim().toLowerCase();
      if (!username) return toast('请填写成员登录账号', 'error');
      if (!editing && !draft.password) return toast('请设置成员初始密码', 'error');
      busyUserId.value = editing ? draft.userId : 'creating';
      try {
        const saved = editing
          ? await api.updateFarmMemberScope(draft.userId, { farmId: farmId.value, plotIds: draft.plotIds })
          : await api.createFarmMember({ farmId: farmId.value, username, password: draft.password, plotIds: draft.plotIds });
        upsertMember(saved);
        emit('data-invalidated', { domains: ['members', 'workOrders'], record: saved });
        memberEditor.value.open = false;
        toast(editing ? `${username}的信息已更新` : `${username}已添加为种植农户`);
      } catch (error) { toast(error.message || (editing ? '成员修改失败' : '成员添加失败'), 'error'); }
      finally { busyUserId.value = ''; }
    };
    const deleteMember = async member => {
      closeMemberMenu();
      if (!window.confirm(`确认将 ${member.username} 从当前农场移除？`)) return;
      busyUserId.value = member.userId;
      try {
        await api.deleteFarmMember(member.userId, { farmId: farmId.value });
        props.state.farmMembers = props.state.farmMembers.filter(item => item.userId !== member.userId);
        emit('data-invalidated', { domains: ['members', 'workOrders'], record: { ...member, removed: true } });
        toast(`${member.username}已从当前农场移除`);
      } catch (error) { toast(error.message || '成员移除失败', 'error'); }
      finally { busyUserId.value = ''; }
    };
    const memberPlots = member => {
      if ((member.plotIds || []).includes('*')) return plots.value.map(plot => plot.name);
      return (member.plotIds || []).map(id => plots.value.find(plot => plot.plotId === id)?.name || id);
    };
    const openAssignments = member => emit('navigate', 'work-orders', { tab: 'tasks', assigneeId: member.userId, farmId: farmId.value });

    onMounted(() => document.addEventListener('click', closeMemberMenu));
    onBeforeUnmount(() => document.removeEventListener('click', closeMemberMenu));

    return {
      busyUserId, memberMenuId, memberEditor, memberDraft,
      farmId, members, plots, toggleEditorPlot,
      toggleMemberMenu, openCreateMember, openEditMember, closeMemberEditor,
      submitMember, deleteMember, memberPlots, openAssignments, sourceLabel
    };
  },
  template: `
    <section class="admin-management-page">
      <header class="admin-section-header"><div><h1>农场成员</h1><p>这里只管理种植农户账号及其负责地块。</p></div></header>

      <section class="admin-panel">
        <div class="admin-panel-title"><div><span>当前农场</span><h2>种植农户</h2></div><em>{{ members.length }} 人</em></div>
        <div class="admin-member-card-grid">
          <article v-for="member in members" :key="member.userId" class="admin-member-card">
            <header>
              <span class="admin-member-avatar">{{ String(member.username || '?').slice(0, 1).toUpperCase() }}</span>
              <div class="admin-member-identity"><strong>{{ member.username }}</strong><small>种植农户 · {{ sourceLabel(member.sourceMode || (state.sessionMode === 'demo' ? 'SIMULATED' : 'ACCOUNT')) }}</small></div>
              <div class="admin-member-card-actions" @click.stop>
                <button type="button" class="manager-more-button" :aria-expanded="memberMenuId === member.userId" :aria-label="member.username + '成员操作'" @click.stop="toggleMemberMenu(member.userId)"><app-icon name="more_vertical"></app-icon></button>
                <div v-if="memberMenuId === member.userId" class="manager-plot-menu admin-member-menu" role="menu">
                  <button type="button" role="menuitem" @click="openEditMember(member)"><app-icon name="edit"></app-icon><span>修改成员与地块</span></button>
                  <button type="button" class="is-danger" role="menuitem" @click="deleteMember(member)"><app-icon name="person_remove"></app-icon><span>删除成员</span></button>
                </div>
              </div>
            </header>
            <div class="admin-member-assignment"><span>负责地块</span><strong>{{ memberPlots(member).join('、') || '暂未分配' }}</strong></div>
            <footer><span class="admin-status-pill" :class="String(member.status || '').toLowerCase()">{{ String(member.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? '正常' : '已停用' }}</span><button class="g-btn secondary compact" @click="openAssignments(member)">查看任务</button></footer>
          </article>
          <button type="button" class="admin-member-card admin-add-member-card" @click="openCreateMember">
            <span class="manager-add-plot-icon"><app-icon name="add"></app-icon></span>
            <strong>添加种植农户</strong>
            <small>创建账号并分配负责地块</small>
          </button>
        </div>
        <p v-if="!members.length" class="admin-empty">当前农场还没有种植农户，请使用添加卡片创建。</p>
      </section>

      <div v-if="memberEditor.open" class="g-modal-overlay admin-member-editor-overlay" @click.self="closeMemberEditor">
        <form class="g-modal admin-member-editor" role="dialog" aria-modal="true" @submit.prevent="submitMember">
          <div class="g-modal-header"><div><p>{{ memberEditor.mode === 'edit' ? '修改成员' : '添加成员' }}</p><h2>{{ memberEditor.mode === 'edit' ? memberDraft.username : '添加种植农户' }}</h2></div><button type="button" class="g-btn icon-only" aria-label="关闭" @click="closeMemberEditor"><app-icon name="close"></app-icon></button></div>
          <div class="g-modal-body">
            <div class="admin-form-grid">
              <label><span>登录账号 *</span><input v-model.trim="memberDraft.username" :disabled="memberEditor.mode === 'edit'" maxlength="32" required placeholder="例如 farmer.li"></label>
              <label v-if="memberEditor.mode === 'create'"><span>初始密码 *</span><input v-model="memberDraft.password" type="password" minlength="8" maxlength="64" required placeholder="至少 8 位，含字母和数字"></label>
            </div>
            <div class="admin-member-editor-scopes"><span>负责地块</span><div class="admin-scope-checks"><label v-for="plot in plots" :key="plot.plotId"><input type="checkbox" :checked="memberDraft.plotIds.includes(plot.plotId)" @change="toggleEditorPlot(plot.plotId, $event.target.checked)"><span><strong>{{ plot.name }}</strong><small>{{ plot.plotId }}</small></span></label></div></div>
            <p class="admin-hint">成员身份固定为“种植农户”。修改成员时只调整其负责地块，不改变账号身份。</p>
          </div>
          <div class="g-modal-footer"><button type="button" class="g-btn secondary" :disabled="Boolean(busyUserId)" @click="closeMemberEditor">取消</button><button type="submit" class="g-btn primary" :disabled="Boolean(busyUserId)">{{ busyUserId ? '保存中…' : '保存成员' }}</button></div>
        </form>
      </div>
    </section>
  `
};
