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

const CROP_ICONS = {
  tomato: '🍅',
  corn: '🌽',
  cucumber: '🥒',
  rice: '🌾',
  sunflower: '🌻',
  strawberry: '🍓'
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
    const data_updated_label = ref('刚刚');

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
    const assigned_plot_names = new Set(fallback_user.plot_names || []);
    const assigned_plots = MOCK_DATA.plots.filter((plot) => assigned_plot_names.has(plot.name)).map((plot) => ({ ...plot }));
    if (assigned_plot_names.size > assigned_plots.length) {
      const cucumber_plot = MOCK_DATA.plots.find((plot) => plot.cropCode === 'cucumber');
      const missing_name = [...assigned_plot_names].find((name) => !assigned_plots.some((plot) => plot.name === name));
      if (cucumber_plot && missing_name) assigned_plots.push({ ...cucumber_plot, name: missing_name });
    }
    const plots = ref(assigned_plots);

    const messages = ref(MOCK_DATA.farmer_messages.map((msg) => ({ ...msg })));
    const tasks = ref(MOCK_DATA.farmer_tasks.map((task) => ({ ...task })));
    const inspection_records = ref((MOCK_DATA.inspections || []).map((record) => ({
      ...record,
      plotName: find_plot_by_id(MOCK_DATA.plots, record.plotId)?.name || record.plotId
    })));
    const evidence_requests = ref([]);

    const current_view = ref('dashboard');
    const selected_plot = ref(plots.value[0] || null);
    const selected_message = ref(null);
    const selected_task = ref(null);
    const analyzing = ref(false);
    const analysis_result = ref('');
    const analysis_error = ref('');
    const show_inspection_form = ref(false);
    const show_evidence_form = ref(false);
    const show_account_modal = ref(false);
    const inspection_form = ref({
      plot_id: plots.value[0]?.plotId || '',
      soil_surface: 'NORMAL',
      crop_condition: 'HEALTHY',
      moisture: plots.value[0]?.metrics?.SOIL_MOISTURE?.value || 0,
      notes: ''
    });
    const evidence_form = ref({
      plot_id: plots.value[0]?.plotId || '',
      type: 'FIELD_INSPECTION',
      reason: ''
    });
    const password_form = ref({ current: '', next: '', confirm: '' });
    const password_error = ref('');
    const irrigation_running = ref(false);
    const irrigation_progress = ref(0);
    const suggestion_feedback = ref('');
    const qa_input = ref('');
    const latest_answer = ref('');
    const qa_history = ref([]);

    const nav_items = computed(() => {
      const unread = messages.value.filter((m) => !m.read).length;
      const pending = tasks.value.filter((t) => t.status === 'PENDING' || t.status === 'ASSIGNED').length;
      const risks = plots.value.filter((plot) => plot.riskLevel !== 'LOW').length;
      return [
        { id: 'dashboard', label: '主面板', icon: 'dashboard' },
        { id: 'plots', label: '我的地块', icon: 'grass' },
        { id: 'tasks', label: '今日农务', icon: 'task', badge: pending || undefined },
        { id: 'advice', label: '灌溉建议', icon: 'water_drop', badge: risks || undefined },
        { id: 'messages', label: '消息中心', icon: 'forum', badge: unread || undefined },
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
      const risk_alerts = plots.value.filter((plot) => plot.riskLevel !== 'LOW').length;
      return { today_todo, dispatched, done, pending, in_progress, unread_messages, risk_alerts };
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
      const inspections = inspection_records.value.length;
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
      if (view_id !== 'plots') {
        selected_plot.value = null;
      } else if (!selected_plot.value) {
        selected_plot.value = plots.value[0] || null;
      }
      if (view_id !== 'tasks') {
        show_inspection_form.value = false;
        show_evidence_form.value = false;
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
    const crop_icon = (crop_code) => CROP_ICONS[crop_code] || '🌱';
    const health_ring_style = (plot) => {
      const score = Math.round((plot?.healthScore || 0) * 100);
      const color = plot?.riskLevel === 'LOW' ? 'var(--g-success)' : 'var(--g-warning)';
      return { background: `conic-gradient(${color} ${score}%, var(--g-border-subtle) 0)` };
    };
    const plot_metrics = (plot) => {
      if (!plot?.metrics) return {};
      return Object.fromEntries(Object.entries(plot.metrics).filter(([code]) => ['SOIL_MOISTURE', 'AIR_TEMPERATURE', 'LIGHT', 'SOIL_EC'].includes(code)));
    };
    const plot_history = (plot) => {
      const base = Number(plot?.metrics?.SOIL_MOISTURE?.value || 0);
      const offsets = [-3.4, -1.8, 0.6, 2.1, -0.7, 1.5, 0];
      return offsets.map((offset, index) => {
        const value = Math.max(0, Math.round((base + offset) * 10) / 10);
        return { label: index === 6 ? '今天' : `${6 - index}日`, value, height: Math.min(96, Math.max(18, value * 2.2)), warning: value < 20 };
      });
    };
    const format_record_time = (iso) => format_relative_label(iso) || '刚刚';

    const open_message = (msg) => {
      selected_message.value = msg;
      analysis_result.value = '';
      analysis_error.value = '';
      if (!msg.read) {
        msg.read = true;
      }
    };

    const open_message_from_dashboard = (msg) => {
      navigate('messages');
      open_message(msg);
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

    const open_task_from_dashboard = (task) => {
      navigate('tasks');
      open_task(task);
    };

    const open_plot = (plot) => {
      navigate('plots');
      selected_plot.value = plot;
    };

    const toggle_irrigation = () => {
      irrigation_running.value = !irrigation_running.value;
      irrigation_progress.value = irrigation_running.value ? 18 : 0;
      show_toast(irrigation_running.value ? '演示灌溉已开始，不会控制真实水泵' : '演示灌溉已停止');
    };

    const set_suggestion_feedback = (feedback) => {
      suggestion_feedback.value = feedback;
      show_toast(`已记录反馈：${feedback}`);
    };

    const ask_question = () => {
      const question = qa_input.value.trim();
      if (!question) {
        show_toast('请先输入想了解的农事问题', 'error');
        return;
      }
      const lower = question.toLowerCase();
      let answer = '建议先查看“我的地块”的最新数据，再结合现场观察决定是否操作；数据不足时请申请补证。';
      if (question.includes('水') || question.includes('浇') || lower.includes('irrig')) {
        answer = 'A01 当前土壤湿度为 16.8%，系统建议补水约 153 升、执行约 8 分 30 秒。请先完成现场核验，并等待管理员审批。';
      } else if (question.includes('温度') || question.includes('热')) {
        answer = '当前示范地块温度在 23.8~27.6°C，暂未触发高温告警；如果棚内持续升温，建议先通风并记录现场情况。';
      } else if (question.includes('病') || question.includes('虫')) {
        answer = '系统没有足够的图像证据判断病虫害。请在今日农务中申请巡田或上传现场观察，再由管理员复核。';
      }
      latest_answer.value = answer;
      qa_history.value.unshift({ id: Date.now(), question, answer });
      qa_history.value = qa_history.value.slice(0, 4);
      qa_input.value = '';
    };

    const open_inspection_form = (plot_id = selected_plot.value?.plotId || plots.value[0]?.plotId) => {
      navigate('tasks');
      inspection_form.value = {
        plot_id: plot_id || '',
        soil_surface: 'NORMAL',
        crop_condition: 'HEALTHY',
        moisture: find_plot_by_id(plots.value, plot_id)?.metrics?.SOIL_MOISTURE?.value || 0,
        notes: ''
      };
      show_inspection_form.value = true;
    };

    const close_inspection_form = () => { show_inspection_form.value = false; };

    const submit_inspection = () => {
      const plot = find_plot_by_id(plots.value, inspection_form.value.plot_id);
      if (!plot || !inspection_form.value.notes) {
        show_toast('请填写地块和现场说明', 'error');
        return;
      }
      inspection_records.value.unshift({
        inspectionId: `ins-${Date.now()}`,
        plotId: plot.plotId,
        plotName: plot.name,
        operatorId: user.value.userId || 'user-farmer',
        observedAt: new Date().toISOString(),
        soilSurface: inspection_form.value.soil_surface,
        cropCondition: inspection_form.value.crop_condition,
        portableSoilMoisture: inspection_form.value.moisture,
        notes: inspection_form.value.notes,
        provenance: 'USER_PROVIDED',
        sourceType: 'HUMAN_OBSERVATION',
        quality: { status: 'GOOD', completeness: 1.0 }
      });
      close_inspection_form();
      show_toast('巡田记录已保存，等待管理员复核');
    };

    const open_evidence_form = (plot_id = selected_plot.value?.plotId || plots.value[0]?.plotId) => {
      navigate('tasks');
      evidence_form.value = { plot_id: plot_id || '', type: 'FIELD_INSPECTION', reason: '' };
      show_evidence_form.value = true;
    };

    const close_evidence_form = () => { show_evidence_form.value = false; };

    const submit_evidence_request = () => {
      if (!evidence_form.value.reason) {
        show_toast('请填写申请原因', 'error');
        return;
      }
      evidence_requests.value.unshift({
        id: `evidence-${Date.now()}`,
        plotId: evidence_form.value.plot_id,
        type: evidence_form.value.type,
        reason: evidence_form.value.reason,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      });
      close_evidence_form();
      show_toast('补证申请已提交，管理员会安排处理');
    };

    const open_account_modal = () => {
      password_form.value = { current: '', next: '', confirm: '' };
      password_error.value = '';
      show_account_modal.value = true;
    };

    const close_account_modal = () => { show_account_modal.value = false; };

    const change_password = () => {
      password_error.value = '';
      if (password_form.value.next.length < 6) {
        password_error.value = '新密码至少需要 6 位';
        return;
      }
      if (password_form.value.next !== password_form.value.confirm) {
        password_error.value = '两次输入的新密码不一致';
        return;
      }
      close_account_modal();
      show_toast('演示密码修改成功，接入账号服务后将正式生效');
    };

    const forgot_password = () => {
      show_toast(`找回密码指引已发送到 ${user.value.contact}`);
    };

    const close_task = () => { selected_task.value = null; };

    const start_task = (task) => {
      const source = tasks.value.find((item) => item.id === task.id);
      if (source) source.status = 'IN_PROGRESS';
      task.status = 'IN_PROGRESS';
      show_toast(`已开始执行：${task.title}`);
      close_task();
    };

    const complete_task = (task) => {
      const source = tasks.value.find((item) => item.id === task.id);
      if (source) source.status = 'DONE';
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
      data_updated_label,
      user,
      farm,
      nav_items,
      current_view,
      messages,
      tasks,
      plots,
      selected_plot,
      selected_message,
      selected_task,
      analyzing,
      analysis_result,
      analysis_error,
      inspection_records,
      evidence_requests,
      show_inspection_form,
      show_evidence_form,
      show_account_modal,
      inspection_form,
      evidence_form,
      password_form,
      password_error,
      irrigation_running,
      irrigation_progress,
      suggestion_feedback,
      qa_input,
      latest_answer,
      qa_history,
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
      crop_icon,
      health_ring_style,
      plot_metrics,
      plot_history,
      format_record_time,
      open_message,
      open_message_from_dashboard,
      close_message,
      mark_read,
      generate_analysis,
      open_task,
      open_task_from_dashboard,
      close_task,
      open_plot,
      toggle_irrigation,
      set_suggestion_feedback,
      ask_question,
      open_inspection_form,
      close_inspection_form,
      submit_inspection,
      open_evidence_form,
      close_evidence_form,
      submit_evidence_request,
      open_account_modal,
      close_account_modal,
      change_password,
      forgot_password,
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
