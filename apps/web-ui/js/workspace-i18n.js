/*
 * Lightweight workspace copy layer.
 *
 * The admin workbench is intentionally still authored in Chinese so domain
 * terminology remains canonical.  This adapter translates rendered copy at
 * the edge of the shell, which also covers strings emitted by Vue templates
 * and by the existing deterministic status mappers.  It is deliberately
 * limited to known UI phrases; user-entered names and measurements are never
 * translated.
 */

const COPY_PAIRS = Object.freeze([
  // Navigation and shell
  ['农智总览', 'Overview'], ['农场总览', 'Farm overview'], ['我的农场', 'My farm'], ['运行总览', 'Operations overview'],
  ['智能决策', 'Decisions'], ['智能建议', 'Smart advice'], ['告警智能处理', 'Alert decisions'], ['决策审计', 'Decision audit'],
  ['规则与策略', 'Rules & strategies'], ['AI助手', 'AI assistant'], ['农务工单', 'Work orders'], ['农务任务', 'Work orders'],
  ['农务记录', 'Field records'], ['工单审计', 'Work-order audit'], ['设备与设施', 'Equipment'], ['农场成员', 'Farm members'],
  ['作物培养手册', 'Crop guide'], ['作物模型', 'Crop models'], ['规则配置', 'Rule configuration'], ['平台总览', 'Platform'],
  ['运行监控', 'Monitoring'], ['仿真验证', 'Simulation'], ['规则与版本', 'Rules & versions'], ['系统管理', 'System admin'],
  ['工作台设置', 'Workspace settings'], ['选择农场', 'Choose farm'], ['切换主题', 'Toggle theme'], ['退出登录', 'Sign out'],
  ['打开个人中心', 'Open profile'], ['关闭个人中心', 'Close profile'], ['个人中心', 'Profile'], ['修改密码', 'Change password'],
  ['找回密码', 'Recover password'], ['仿真模式', 'Simulation mode'], ['系统在线', 'System online'], ['后端离线', 'Backend offline'],
  ['演示数据', 'Demo data'], ['正式账号', 'Live account'], ['正式模式', 'Live mode'], ['后端事实', 'Backend fact'],

  // Shared actions and statuses
  ['创建农务任务', 'Create work order'], ['创建任务', 'Create task'], ['新建任务', 'New task'], ['添加', 'Add'], ['保存', 'Save'],
  ['保存中…', 'Saving…'], ['保存并同步', 'Save & sync'], ['取消', 'Cancel'], ['关闭', 'Close'], ['返回', 'Back'], ['刷新', 'Refresh'],
  ['重新分析', 'Analyze again'], ['正在分析…', 'Analyzing…'], ['处理中…', 'Processing…'], ['正在读取', 'Loading'], ['读取中', 'Loading'],
  ['查看详情', 'View details'], ['查看任务', 'View tasks'], ['去分配任务', 'Assign tasks'], ['确认', 'Confirm'], ['确认修改', 'Confirm change'],
  ['确认执行', 'Confirm execution'], ['确认并自动灌溉', 'Confirm & auto-irrigate'], ['确认并虚拟执行', 'Confirm & run simulation'],
  ['一键发布核查任务', 'Dispatch verification'], ['发布核查任务', 'Dispatch verification'], ['一键关闭告警', 'Close alerts'], ['关闭告警', 'Close alert'],
  ['批准并启用', 'Approve & activate'], ['批准', 'Approve'], ['拒绝', 'Reject'], ['回滚', 'Roll back'], ['只读', 'Read-only'],
  ['待处理', 'Pending'], ['处理中', 'In progress'], ['已完成', 'Completed'], ['进行中', 'In progress'], ['已分配', 'Assigned'],
  ['待分配', 'Unassigned'], ['待审批', 'Awaiting approval'], ['已审批', 'Approved'], ['已驳回', 'Rejected'], ['已下发', 'Dispatched'],
  ['已关闭', 'Closed'], ['已解决', 'Resolved'], ['已取消', 'Cancelled'], ['已过期', 'Expired'], ['失败', 'Failed'], ['部分完成', 'Partial'],
  ['超时', 'Timed out'], ['成功', 'Succeeded'], ['正常', 'Normal'], ['已停用', 'Disabled'], ['等待分配', 'Awaiting assignment'],
  ['暂无', 'None yet'], ['未知', 'Unknown'], ['未设置', 'Not set'], ['未绑定', 'Unbound'], ['未配置', 'Not configured'],
  ['时间待确认', 'Time to be confirmed'], ['时间未知', 'Time unknown'], ['刚刚', 'Just now'], ['已逾期', 'Overdue'],

  // Dashboard and plots
  ['先看地块状态，再处理异常和农务。', 'Review plot status, then handle alerts and work.'], ['今日任务', "Today's tasks"],
  ['异常地块', 'At-risk plots'], ['暂无可显示的地块', 'No plots to display'],
  ['请确认后端服务和当前账户的地块权限；系统不会用演示指标代替正式数据。', 'Check the backend service and this account’s plot permissions. Demo metrics are never used as live data.'],
  ['修改地块信息', 'Edit plot information'], ['新增地块', 'New plot'], ['添加一个新地块', 'Add a new plot'], ['地块名称', 'Plot name'],
  ['作物种类', 'Crop type'], ['作物品种', 'Crop variety'], ['当前生长阶段', 'Current growth stage'], ['完整生长周期（天）', 'Full growth cycle (days)'],
  ['地块面积（㎡）', 'Plot area (m²)'], ['绑定设备（可多选）', 'Bound devices (multi-select)'],
  ['每台设备只能绑定一个地块；选择其他地块的设备，保存前会要求确认转移。', 'Each device can be bound to one plot. Selecting a device from another plot will ask for transfer confirmation.'],
  ['保存后，农场总览、地块详情、设备绑定和任务选择中的地块信息会同时更新。', 'After saving, the overview, plot details, device bindings and task selectors update together.'],
  ['永久删除已停用地块？', 'Permanently delete this disabled plot?'], ['永久删除', 'Delete permanently'], ['输入', 'Enter'], ['工作台', 'Workspace'],
  ['品种', 'Variety'], ['面积', 'Area'], ['阶段', 'Stage'], ['综合健康', 'Overall health'], ['智能警报与信息流', 'Smart alerts & activity'],
  ['关键数据', 'Key data'], ['建议范围', 'Recommended range'], ['相关农务', 'Related work'], ['安排农务', 'Schedule work'], ['未命名任务', 'Untitled task'],
  ['暂无执行说明', 'No execution notes'], ['这块地目前没有相关农务。', 'There is no related work for this plot.'], ['查看告警', 'View alerts'],
  ['二维地块详情', 'Plot detail'], ['地块模拟策略', 'Plot simulation strategy'], ['选择地块', 'Select a plot'], ['请选择地块', 'Please select a plot'],
  ['历史实测', 'Historical readings'], ['策略预测', 'Strategy forecast'], ['预测下界', 'Forecast lower bound'], ['预测上界', 'Forecast upper bound'],
  ['曲线指标', 'Chart metric'], ['鼠标悬停查看局部数据', 'Hover to inspect local data'], ['重置历史曲线', 'Reset history curve'],
  ['重置预测曲线', 'Reset forecast curve'], ['保存到此地块', 'Save to this plot'], ['正在同步…', 'Syncing…'], ['查看地块数据', 'View plot data'],

  // Metrics and crop terms
  ['土壤湿度', 'Soil moisture'], ['空气温度', 'Air temperature'], ['空气湿度', 'Air humidity'], ['光照', 'Light'], ['二氧化碳', 'Carbon dioxide'],
  ['酸碱度', 'pH'], ['水位', 'Water level'], ['降雨量', 'Rainfall'], ['土壤电导率', 'Soil EC'], ['氮磷钾', 'N-P-K'], ['指标', 'Metric'],
  ['靶标', 'Target'], ['番茄', 'Tomato'], ['玉米', 'Corn'], ['黄瓜', 'Cucumber'], ['水稻', 'Rice'], ['向日葵', 'Sunflower'], ['草莓', 'Strawberry'],
  ['育苗期', 'Seedling'], ['苗期', 'Seedling'], ['营养生长期', 'Vegetative'], ['开花期', 'Flowering'], ['结果期', 'Fruiting'], ['采收期', 'Harvest'],

  // Decision and alerts
  ['智能诊断与处方中枢', 'Smart diagnosis & prescription hub'], ['根因诊断', 'Root-cause diagnosis'], ['置信度', 'Confidence'], ['主因', 'Primary cause'],
  ['支持证据', 'Supporting evidence'], ['反对/排他证据', 'Contradicting evidence'], ['农业处方', 'Agricultural prescription'], ['已就绪', 'Ready'],
  ['建议补水量', 'Recommended water'], ['执行时长', 'Run time'], ['预估成本', 'Estimated cost'], ['执行安全门控', 'Execution safety gates'],
  ['虚拟执行', 'Virtual execution'], ['决策护照', 'Decision passport'], ['智能助手沙盘咨询', 'AI assistant sandbox'], ['双轨推演模拟', 'Dual-track simulation'],
  ['正式下发指令', 'Issue command'], ['来源输入', 'Source input'], ['推导诊断', 'Derived diagnosis'], ['参考知识', 'Reference knowledge'], ['输出处方', 'Output prescription'],
  ['本次决策记录', 'Decision record'], ['安全检查', 'Safety checks'], ['现在能不能执行', 'Can this run now?'], ['综合分', 'Overall score'],
  ['还需要做', 'Still needed'], ['创建补充检查任务', 'Create evidence task'], ['检查任务已创建', 'Evidence task created'], ['全程留痕', 'Full audit trail'],
  ['告警筛选', 'Alert filters'], ['待审核', 'Needs review'], ['全部进行中', 'All active'], ['本次已分析', 'Analyzed in this run'], ['智能下发', 'Smart dispatch'],
  ['需现场核查', 'Needs field verification'], ['证据不确定', 'Uncertain evidence'], ['地块需要处理', 'Plot needs attention'], ['发生时间', 'Raised at'], ['告警来源', 'Alert source'],
  ['关联任务', 'Related task'], ['尚未下发', 'Not dispatched'], ['告警详情', 'Alert details'], ['告警已结束', 'Alert closed'], ['查看已下发任务', 'View dispatched task'],
  ['选择', 'Select'], ['全选当前列表', 'Select all in list'], ['已选', 'Selected'], ['当前列表没有告警。', 'No alerts in this list.'],

  // Work orders, resources and members
  ['工单流转与人机协同', 'Work-order flow & human/AI collaboration'], ['录入巡田记录', 'Log field inspection'], ['当前身份可查看工单，操作由授权人员完成', 'This role can view work orders; authorized staff perform actions.'],
  ['待办任务总数', 'Total open work'], ['人工巡田报告', 'Field inspection reports'], ['系统调度工单', 'System-dispatched work'], ['人工核验记录', 'Manual verification records'],
  ['任务标题', 'Task title'], ['地块', 'Plot'], ['优先级', 'Priority'], ['任务类型', 'Task type'], ['截止时间', 'Due date'], ['执行说明', 'Instructions'],
  ['创建并进入待分配', 'Create & send to unassigned'], ['录入人工巡田数据', 'Enter field inspection data'], ['表层状况', 'Surface condition'], ['植被情况', 'Vegetation'],
  ['手持仪实测含水率 (%)', 'Portable meter moisture (%)'], ['备注说明', 'Notes'], ['提交核验', 'Submit verification'], ['当前农场', 'Current farm'],
  ['种植批次与生产计划', 'Planting batches & production plans'], ['生产计划', 'Production plan'], ['资源安排', 'Resource planning'], ['任务列表', 'Work-order list'],
  ['AI 配水运营台', 'AI water allocation desk'], ['固定日配额由后端统一核算。AI 先分析地块，管理员确认后按时段执行。', 'The backend calculates a fixed daily quota. AI analyzes plots first; an administrator confirms execution by time slot.'],
  ['今日固定配额', 'Today’s fixed quota'], ['实际已使用', 'Used'], ['已预留', 'Reserved'], ['可分配余额', 'Available balance'], ['次日自动重置', 'Resets tomorrow'], ['仅统计蓄水池水源', 'Reservoir source only'],
  ['确认计划锁定', 'Locked by confirmed plans'], ['水资源安全门', 'Water safety gate'], ['今日余额与未来配额', 'Today’s balance & future quota'], ['尚未生成计划', 'No plan yet'],
  ['次日或未来配额', 'Next-day or future quota'], ['生效日期', 'Effective date'], ['保存未来配额', 'Save future quota'], ['优先队列', 'Priority queue'], ['地块风险与需求', 'Plot risk & demand'],
  ['后端AI推演', 'Backend AI forecast'], ['趋势与目标', 'Trend & targets'], ['目标', 'Target'], ['阈值', 'Threshold'], ['暂无可用曲线', 'No curve available'],
  ['整批配水计划', 'Batch water plan'], ['申请、分配、缺口与执行状态', 'Requests, allocations, gaps & execution'], ['申请', 'Requested'], ['分配', 'Allocated'], ['缺口', 'Unmet'],
  ['设备 / 时段', 'Device / time slot'], ['调整方案', 'Adjust plan'], ['取消计划', 'Cancel plan'], ['还没有配水草案，请先运行AI分析。', 'No water plan yet. Run AI analysis first.'],
  ['农场成员', 'Farm members'], ['这里只管理种植农户账号及其负责地块。', 'Only grower accounts and their assigned plots are managed here.'], ['种植农户', 'Grower'], ['可分配农户', 'Assignable growers'],
  ['刷新成员', 'Refresh members'], ['负责地块', 'Assigned plots'], ['未完成任务', 'Open tasks'], ['当前状态', 'Current status'], ['数据来源', 'Data source'], ['正在读取农场成员', 'Loading farm members'],
  ['暂无农场成员', 'No farm members yet'], ['添加种植农户', 'Add grower'], ['创建账号并分配负责地块', 'Create an account and assign plots'], ['修改成员与地块', 'Edit member & plots'], ['删除成员', 'Delete member'],

  // Crop packs and rules
  ['农务任务 / 资源安排', 'Work orders / Resource planning'], ['农务任务页签', 'Work-order tabs'], ['农场级作物模型与告警治理', 'Farm crop models & alert governance'], ['个版本', 'versions'], ['全局', 'Global'],
  ['规则版本', 'Rule version'], ['知识版本', 'Knowledge version'], ['生长阶段', 'Growth stages'], ['指标阈值', 'Metric thresholds'], ['查看作物包', 'View Crop Pack'],
  ['添加作物', 'Add crop'], ['创建当前农场专属 Crop Pack 草稿', 'Create a Crop Pack draft for this farm'], ['作物包详情', 'Crop Pack details'], ['新建草稿', 'New draft'], ['编辑草稿', 'Edit draft'],
  ['校验草稿', 'Validate draft'], ['启用作物包', 'Activate Crop Pack'], ['作物包已启用', 'Crop Pack activated'], ['阶段与任务模板', 'Stages & task templates'], ['指标与阈值', 'Metrics & thresholds'],
  ['基础信息', 'Basic information'], ['告警规则', 'Alert rules'], ['任务模板', 'Task templates'], ['知识与预览', 'Knowledge & preview'], ['保存草稿', 'Save draft'], ['继续编辑', 'Continue editing'],
  ['规则集', 'Rule sets'], ['策略候选集', 'Strategy candidates'], ['新增规则', 'Add rule'], ['候选方案', 'Candidate'], ['案例数量', 'Cases'], ['一致率', 'Consistency'], ['离线验证', 'Offline validation'],
  ['规则编号', 'Rule ID'], ['适用作物/阶段', 'Crop / stage'], ['判断条件', 'Condition'], ['持续时间（分钟）', 'Duration (minutes)'], ['冷却时间（分钟）', 'Cooldown (minutes)'],
  ['规则仍由确定性引擎判断，智能助手仅解释原因，不会自动执行设备操作。', 'Rules are evaluated by the deterministic engine. The assistant only explains and never operates devices automatically.'],

  // AI assistant
  ['AI 助手已就绪', 'AI assistant ready'], ['当前地块', 'Current plot'], ['新对话', 'New conversation'], ['显示历史对话', 'Show conversation history'], ['隐藏历史对话', 'Hide conversation history'],
  ['调整历史对话栏宽度', 'Resize conversation history'], ['正在读取对话记录…', 'Loading conversations…'], ['今天想先处理什么？', 'What would you like to work on first?'],
  ['快捷问题', 'Quick questions'], ['我', 'You'], ['操作预览', 'Action preview'], ['待确认', 'Awaiting confirmation'], ['仅执行已展示的内容；确认后会再次校验权限和当前数据。', 'Only the content shown here will run. Permissions and current data are checked again after confirmation.'],
  ['执行中…', 'Running…'], ['取消操作', 'Cancel action'], ['正在分析地块数据和农务记录', 'Analyzing plot data and work records'], ['向 AI 助手提问', 'Ask the AI assistant'], ['给 AI 助手发送消息', 'Send a message to the AI assistant'],
  ['上传图片', 'Upload image'], ['选择图片', 'Choose image'], ['分析照片', 'Analyze photo'], ['移除', 'Remove'], ['发送消息', 'Send message'], ['正在回答', 'Responding'],
  ['图片未分析成功', 'Image analysis failed'], ['图片分析', 'Image analysis'], ['事实', 'Facts'], ['分析判断', 'Assessment'], ['执行建议', 'Next steps'],

  // Settings and security
  ['主题', 'Theme'], ['白色', 'Light'], ['黑色', 'Dark'], ['跟随系统', 'System'], ['显示密度', 'Display density'], ['舒适', 'Comfortable'], ['紧凑', 'Compact'],
  ['内容宽度', 'Content width'], ['标准', 'Standard'], ['宽屏', 'Wide'], ['减少动效', 'Reduce motion'], ['自动刷新', 'Auto refresh'], ['刷新间隔', 'Refresh interval'],
  ['界面语言', 'Interface language'], ['界面字体', 'Interface font'], ['卡片风格', 'Card style'], ['强调色', 'Accent color'], ['恢复默认设置', 'Restore defaults'],
  ['当前设置', 'Current settings'], ['实时预览', 'Live preview'], ['显示数据来源', 'Show data origin'], ['秒', 's'], ['当前密码', 'Current password'], ['新密码', 'New password'], ['确认新密码', 'Confirm new password']
]);

const ZH_TO_EN = Object.freeze([...COPY_PAIRS].sort((a, b) => b[0].length - a[0].length));
const EN_TO_ZH = Object.freeze([...COPY_PAIRS].sort((a, b) => b[1].length - a[1].length).map(([zh, en]) => [en, zh]));

function replacePhrases(value, entries) {
  let next = String(value ?? '');
  entries.forEach(([from, to]) => {
    if (next.includes(from)) next = next.split(from).join(to);
  });
  return next;
}

export function translateWorkspaceText(value, language = 'en-US') {
  return replacePhrases(value, language === 'en-US' ? ZH_TO_EN : EN_TO_ZH);
}

function shouldSkip(element) {
  if (!element) return true;
  if (element.closest?.('[data-i18n-skip]')) return true;
  return ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(element.tagName);
}

function translateDom(root, language) {
  if (!root || typeof document === 'undefined') return;
  const entries = language === 'en-US' ? ZH_TO_EN : EN_TO_ZH;
  const walker = document.createTreeWalker(root, typeof NodeFilter === 'undefined' ? 4 : NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (!shouldSkip(node.parentElement) && node.nodeValue?.trim()) textNodes.push(node);
  }
  textNodes.forEach((textNode) => {
    const next = replacePhrases(textNode.nodeValue, entries);
    if (next !== textNode.nodeValue) textNode.nodeValue = next;
  });
  root.querySelectorAll?.('[placeholder],[title],[aria-label],[aria-description]').forEach((element) => {
    if (shouldSkip(element)) return;
    ['placeholder', 'title', 'aria-label', 'aria-description'].forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      const current = element.getAttribute(attribute);
      const next = replacePhrases(current, entries);
      if (next !== current) element.setAttribute(attribute, next);
    });
  });
}

/**
 * Install a small observer so copy emitted by a newly mounted page is also
 * translated. Returns a setter/disposer pair for the application shell.
 */
export function installWorkspaceI18n(initialLanguage = 'zh-CN') {
  const root = typeof document === 'undefined' ? null : document.querySelector?.('#app');
  if (!root || typeof MutationObserver === 'undefined') {
    return { setLanguage() {}, dispose() {} };
  }
  let language = initialLanguage;
  let applying = false;
  const apply = () => {
    if (applying) return;
    applying = true;
    try { translateDom(root, language); } finally { applying = false; }
  };
  const observer = new MutationObserver(() => apply());
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label', 'aria-description'] });
  apply();
  return {
    setLanguage(nextLanguage) {
      language = nextLanguage === 'en-US' ? 'en-US' : 'zh-CN';
      apply();
    },
    dispose() { observer.disconnect(); }
  };
}

export { COPY_PAIRS };
