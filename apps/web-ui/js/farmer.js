import { api } from './api.js';
import { MOCK_DATA } from './mock-data.js';
import { presentRoleUser } from './roles.js';

const { createApp, ref, computed, onMounted } = Vue;

const STATUS_LABELS = {
  PENDING: '未开始',
  ASSIGNED: '已分配',
  IN_PROGRESS: '执行中',
  DONE: '已完成'
};

const PRIORITY_LABELS = {
  HIGH: '高优先级',
  MEDIUM: '中优先级',
  LOW: '低优先级'
};

const CATEGORY_LABELS = {
  alert: '告警',
  task: '任务',
  system: '系统',
  notice: '通知'
};

function format_relative_label(iso) {
  if (!iso) return '';
  const diff_ms = Date.now() - new Date(iso).getTime();
  if (diff_ms < 0) return '即将到期';
  const min = Math.floor(diff_ms / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  return `${day} 天前`;
}

function is_today(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function is_due_soon(task) {
  if (!task.due_iso || task.status === 'DONE') return false;
  const diff_ms = new Date(task.due_iso).getTime() - Date.now();
  return diff_ms > 0 && diff_ms < 6 * 60 * 60 * 1000;
}

function find_plot_by_id(plots, plot_id) {
  return plots.find((plot) => plot.plotId === plot_id);
}

const app = createApp({
  setup() {
    const is_live = ref(false);
    const is_dark = ref(false);
    const is_sidebar_open = ref(true);
    const toasts = ref([]);

    const show_toast = (message, type = 'success') => {
      const id = Date.now() + Math.random();
      toasts.value.push({ id, message, type });
      setTimeout(() => {
        toasts.value = toasts.value.filter((t) => t.id !== id);
      }, 3000);
    };

    const session = api.readSession();
    const session_user = presentRoleUser(session?.user);
    const fallback_user = MOCK_DATA.farmer_profile;


    const initial_user = session_user;

    const user = ref({
      ...initial_user,
      joined_at: fallback_user.joined_at,
      contact: fallback_user.contact,
      plot_names: fallback_user.plot_names
    });

    const farm = ref(MOCK_DATA.farms[0]);
    const plots = ref(MOCK_DATA.plots);

    const messages = ref(MOCK_DATA.farmer_messages.map((msg) => ({ ...msg })));
    const tasks = ref(MOCK_DATA.farmer_tasks.map((task) => ({ ...task })));

    const current_view = ref('dashboard');
    const selected_message = ref(null);
    const selected_task = ref(null);
    const analyzing = ref(false);
    const analysis_result = ref('');
    const analysis_error = ref('');

    const nav_items = computed(() => {
      const unread = messages.value.filter((m) => !m.read).length;
      const pending = tasks.value.filter((t) => t.status === 'PENDING' || t.status === 'ASSIGNED').length;
      return [
        { id: 'dashboard', label: '主面板', icon: 'dashboard' },
        { id: 'messages', label: '消息中心', icon: 'forum', badge: unread || undefined },
        { id: 'tasks', label: '任务管理', icon: 'task', badge: pending || undefined },
        { id: 'profile', label: '个人中心', icon: 'account_circle' }
      ];
    });

    const greeting = computed(() => {
      const hr = new Date().getHours();
      if (hr < 6) return '凌晨好';
      if (hr < 12) return '上午好';
      if (hr < 14) return '中午好';
      if (hr < 18) return '下午好';
      return '晚上好';
    });

    const stats = computed(() => {
      const today_todo = tasks.value.filter((t) =>
        (t.status === 'PENDING' || t.status === 'ASSIGNED') && is_today(t.due_iso)
      ).length;
      const dispatched = tasks.value.length;
      const done = tasks.value.filter((t) => t.status === 'DONE').length;
      const pending = tasks.value.filter((t) => t.status === 'PENDING' || t.status === 'ASSIGNED').length;
      const in_progress = tasks.value.filter((t) => t.status === 'IN_PROGRESS').length;
      const unread_messages = messages.value.filter((m) => !m.read).length;
      return { today_todo, dispatched, done, pending, in_progress, unread_messages };
    });

    const recent_tasks = computed(() =>
      tasks.value
        .slice()
        .sort((a, b) => new Date(b.created_iso) - new Date(a.created_iso))
        .slice(0, 5)
    );

    const recent_messages = computed(() =>
      messages.value
        .slice()
        .sort((a, b) => new Date(b.time_iso) - new Date(a.time_iso))
        .slice(0, 5)
    );

    const sorted_messages = computed(() =>
      messages.value
        .slice()
        .sort((a, b) => new Date(b.time_iso) - new Date(a.time_iso))
    );

    const unread_count = computed(() => messages.value.filter((m) => !m.read).length);

    const task_columns = computed(() => [
      { status: 'PENDING', label: '未开始', items: tasks.value.filter((t) => t.status === 'PENDING') },
      { status: 'ASSIGNED', label: '已分配', items: tasks.value.filter((t) => t.status === 'ASSIGNED') },
      { status: 'IN_PROGRESS', label: '执行中', items: tasks.value.filter((t) => t.status === 'IN_PROGRESS') },
      { status: 'DONE', label: '已完成', items: tasks.value.filter((t) => t.status === 'DONE') }
    ]);

    const profile_stats = computed(() => {
      const total_done = user.value.total_done || MOCK_DATA.farmer_profile.total_done;
      const month_done = MOCK_DATA.farmer_profile.month_done;
      const in_progress = tasks.value.filter((t) => t.status === 'IN_PROGRESS').length;
      const pending = tasks.value.filter((t) => t.status === 'PENDING' || t.status === 'ASSIGNED').length;
      const due_soon = tasks.value.filter(is_due_soon).length;
      const completion_rate = MOCK_DATA.farmer_profile.completion_rate;
      const inspections = MOCK_DATA.farmer_profile.inspections;
      const messages_count = messages.value.length;
      const unread = messages.value.filter((m) => !m.read).length;
      return { total_done, month_done, in_progress, pending, due_soon, completion_rate, inspections, messages: messages_count, unread };
    });

    const navigate = (view_id) => {
      current_view.value = view_id;
      if (view_id !== 'messages') {
        selected_message.value = null;
        analysis_result.value = '';
        analysis_error.value = '';
      }
      if (view_id !== 'tasks') {
        selected_task.value = null;
      }
    };

    const toggle_sidebar = () => { is_sidebar_open.value = !is_sidebar_open.value; };

    const toggle_theme = () => {
      is_dark.value = !is_dark.value;
      const theme = is_dark.value ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.colorScheme = theme;
      localStorage.setItem('agriloop-theme', theme);
    };

    const logout = () => {
      api.clearSession();
      window.location.replace('login.html');
    };

    const status_label = (status) => STATUS_LABELS[status] || status;
    const priority_label = (priority) => PRIORITY_LABELS[priority] || priority;
    const category_label = (category) => CATEGORY_LABELS[category] || category;

    const open_message = (msg) => {
      selected_message.value = msg;
      analysis_result.value = '';
      analysis_error.value = '';
      if (!msg.read) {
        msg.read = true;
      }
    };

    const close_message = () => {
      selected_message.value = null;
      analysis_result.value = '';
      analysis_error.value = '';
    };

    const mark_read = (msg) => {
      if (msg.read) return;
      msg.read = true;
      show_toast('已标记为已读');
    };

    const generate_analysis = async (msg) => {
      analyzing.value = true;
      analysis_result.value = '';
      analysis_error.value = '';
      try {
        if (!is_live.value) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          throw Object.assign(new Error('OFFLINE'), { is_network: true });
        }
        const base_url = api.baseUrl || '';
        const response = await fetch(`${base_url}/api/v1/ai/message-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: msg.id, title: msg.title, body: msg.body_paragraphs })
        });
        if (!response.ok) throw new Error(`服务返回 ${response.status}`);
        const result = await response.json();
        analysis_result.value = result.summary || result.analysis || '分析完成，但未返回概括内容。';
      } catch (error) {
        if (error.is_network || !is_live.value) {
          analysis_error.value = '当前为离线模式，AI 概括服务不可用。请启动后端服务后再试，或联系农场管理员获取人工分析。';
        } else {
          analysis_error.value = error.message || 'AI 分析服务暂时不可用，请稍后重试。';
        }
      } finally {
        analyzing.value = false;
      }
    };

    const open_task = (task) => {
      const enriched = { ...task };
      if (task.plot_id) {
        const plot = find_plot_by_id(plots.value, task.plot_id);
        if (plot) {
          enriched.plot = {
            plotId: plot.plotId,
            name: plot.name,
            crop_name: plot.cropName,
            crop_variety: plot.cropVariety,
            stage_label: plot.stageLabel,
            device_status: plot.deviceStatus,
            metrics: plot.metrics
          };
        }
      }
      selected_task.value = enriched;
    };

    const close_task = () => { selected_task.value = null; };

    const start_task = (task) => {
      task.status = 'IN_PROGRESS';
      show_toast(`已开始执行：${task.title}`);
      close_task();
    };

    const complete_task = (task) => {
      task.status = 'DONE';
      show_toast(`已提交完成：${task.title}`);
      close_task();
    };

    const report_issue = (task) => {
      show_toast(`已上报问题：${task.title}，农场管理员将收到通知`, 'error');
      close_task();
    };

    onMounted(async () => {

      const saved_theme = localStorage.getItem('agriloop-theme');
      if (saved_theme === 'dark') {
        is_dark.value = true;
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
      }
      is_live.value = await api.checkHealth();
    });

    return {
      is_live,
      is_dark,
      is_sidebar_open,
      user,
      farm,
      nav_items,
      current_view,
      messages,
      tasks,
      selected_message,
      selected_task,
      analyzing,
      analysis_result,
      analysis_error,
      toasts,
      greeting,
      stats,
      recent_tasks,
      recent_messages,
      sorted_messages,
      unread_count,
      task_columns,
      profile_stats,
      navigate,
      toggle_sidebar,
      toggle_theme,
      logout,
      status_label,
      priority_label,
      category_label,
      open_message,
      close_message,
      mark_read,
      generate_analysis,
      open_task,
      close_task,
      start_task,
      complete_task,
      report_issue
    };
  }
});

const _session = api.readSession();
const _session_user = presentRoleUser(_session?.user);
if (!_session || !_session_user) {
  window.location.replace('login.html');
} else if (_session_user.role !== 'FARMER') {
  window.location.replace('index.html');
} else {
  app.mount('#farmer_app');
}