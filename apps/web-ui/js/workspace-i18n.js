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
  ['受控治理', 'Controlled governance'], ['全部未关闭', 'All open'], ['全部未Close', 'All open'], ['Select all in list', 'Select all in list'],
  ['设备已绑定，等待首次数据', 'Device bound; waiting for the first reading'], ['使用中', 'In use'], ['生长周期', 'Growth cycle'], ['示范', 'Demo'],
  ['温室', 'Greenhouse '], ['Crop Pack 使用同一农场上下文。', 'Crop Packs use the same farm context.'], ['任务执行、生产计划、资源安排与 Crop Pack 使用同一农场上下文。', 'Task execution, production plans, resource planning and Crop Packs use the same farm context.'],
  ['统一管理设备台账、运行状态、Plot绑定和现场运维关联。', 'Manage the device registry, runtime status, plot bindings and field operations in one place.'],
  ['登记台账', 'Registered devices'], ['心跳', 'Heartbeat'], ['心跳Normal', 'Heartbeat: Normal'], ['需要处理', 'Needs attention'], ['尚未绑定', 'Unbound'], ['关闭设备', 'Disable device'],
  ['历史对话', 'Conversation history'], ['发送第一条消息后会Save到这里', 'Your conversations will appear here after you send the first message'],
  ['You会结合', 'I will combine'], ['的实时数据、告警和', '’s live data, alerts and '], ['回答，先核对平台', ' to answer, first verifying platform '], ['再给出清晰的下一步建议。', ' before giving clear next steps.'],
  ['设备质量', 'data quality'], ['正常', 'Normal'], ['根区严重缺水', 'Severe root-zone water deficit'], ['局部缺水候选告警', 'Possible local water deficit'], ['环境采集器离线', 'Environment sensor offline'],
  ['流量计上报变慢', 'Flow meter reports slowly'], ['棚温短时偏高', 'Short-term high temperature'], ['湿度探头疑似漂移', 'Possible humidity probe drift'], ['首轮', 'First pass'], ['根区含水率连续下降', 'Root-zone moisture keeps falling'],
  ['建议立即安排现场复核与补水处理。', 'Schedule a field check and irrigation immediately.'], ['单个采样点出现偏低读数，规则仍处于候选状态，需要人工判断是否代表整块地。', 'A single sample is low; the rule is still a candidate and needs human review before applying to the whole plot.'],
  ['短时变化与相邻数据不一致，需要使用便携仪比对后再决定是否执行农务。', 'The short-term change conflicts with neighboring readings; compare with a portable meter before scheduling work.'],
  ['设备心跳已Timed out，缺少新鲜遥测，需先检查供电和网络连接。', 'The device heartbeat timed out and fresh telemetry is missing. Check power and network first.'],
  ['流量计最近一次数据到达较慢，已Confirm，等待现场复查。', 'The flow meter reported slowly. It was confirmed and is waiting for a field recheck.'],
  ['当前证据不足以定位明确根因，且该Plot暂时没有在岗处置农户，保留人工审核。', 'Current evidence is insufficient to identify a root cause, and no on-duty grower is available for this plot; keep it for human review.'],
  ['来源：', 'Source:'], ['条', ' items'], ['分钟', ' min'], ['所有Stage', 'All stages'], ['规则名称', 'Rule name'], ['告警规则集', 'Alert rule sets'], ['负责确定性判断', 'Responsible for deterministic decisions'],
  ['规则Threshold来自系统规则和Current farm已启用Crop models；Add rule写入Current farm，并供告警、预测和智能助手读取。', 'Rule thresholds come from system rules and active Crop Packs for the current farm. Add rule writes to this farm and feeds alerts, forecasts and the assistant.'],
  ['规则Threshold来自系统规则和当前农场已启用Crop models；Add rule写入Current farm，并供告警、预测和智能助手读取。', 'Rule thresholds come from system rules and active Crop Packs for the current farm. Add rule writes to this farm and feeds alerts, forecasts and the assistant.'],
  ['案例积累', 'case accumulation'], ['是否启用', 'whether to activate'], ['阶段', 'stage'], ['高温胁迫', 'Heat stress'], ['低温冷害', 'Cold injury'], ['水分不足', 'Water deficit'], ['确定性告警判断', 'Deterministic alert rule'], ['系统规则', 'System rule'], ['版本', 'version'], [' 版', ' version'], ['第 ', 'v'],
  ['任务执行', 'Task execution'], ['任务排期', 'Task schedule'], ['待验收', 'Awaiting acceptance'], ['返工任务', 'Rework task'], ['重新检查', 'Recheck'], ['复测', 'Retest'], ['便携仪比对', 'Portable meter comparison'], ['浇水', 'Irrigation'], ['施肥', 'Fertilization'],
  ['作物包', 'Crop Pack'], ['作物包草稿', 'Crop Pack draft'], ['种植农户', 'Grower'], ['模拟数据', 'Demo data'], [' 人', ' growers'], [' 条', ' items'], ['、', ', '],
  ['AI智能处理', 'AI smart handling'], ['一键', 'Batch'], ['已下发农户', 'Grower assigned'], ['等待现场结果', 'Waiting for field results'], ['需要人工判断', 'Needs human review'], ['告警原因', 'Alert cause'], ['现场核查', 'Field verification'], ['处理进度', 'Processing progress'],
  ['全部设备', 'All devices'], ['全部状态', 'All statuses'], ['全部类型', 'All types'], ['全部绑定状态', 'All binding statuses'], ['设备名称、编号、类型或Plot', 'Device name, ID, type or plot'], ['设备类型', 'Device type'], ['绑定状态', 'Binding status'], ['最近数据', 'Latest reading'], ['健康评分', 'Health score'], ['模拟数据', 'Demo data'],
  ['AI告警处理', 'AI alert handling'], ['告警处理', 'Alert handling'], ['总结', 'Summarize'], ['分析', 'Analyze'], ['最近的告警', 'recent alerts'], ['现在最需要处理的问题', 'the most urgent issue now'], ['今天', 'today'], ['应该给农户安排哪些任务', 'work to assign to growers'], ['按紧急程度列出', 'List by urgency: '], ['农务建议', 'work recommendations'],
  ['总结温室1现在最需要处理的问题', 'Summarize the most urgent issue for Greenhouse 1'], ['分析温室1最近的告警', 'Analyze recent alerts for Greenhouse 1'], ['今天温室1应该给农户安排哪些任务', 'What work should be assigned to growers for Greenhouse 1 today?'], ['按紧急程度列出今天的农务建议', 'List today’s work recommendations by urgency'], ['总结当前地块最需要处理的问题', 'Summarize the most urgent issue for the current plot'], ['分析当前地块最近的告警', 'Analyze recent alerts for the current plot'],
  ['扩展玉米田', 'Extended corn field'], ['扩展', 'Extended'], ['田间', 'field'], ['田', 'field'], ['黄瓜棚', 'Cucumber greenhouse'], ['番茄棚', 'Tomato greenhouse'], ['水肥', 'water & fertilizer'], ['核验', 'verification'], ['复核', 'review'], ['复查', 'follow-up check'], ['病斑', 'lesion'], ['疏花打杈', 'flower thinning & pruning'], ['种植', 'planting'], ['生产', 'production'], ['农事', 'farm work'], ['设备组', 'device team'], ['技术员', 'technician'], ['农户', 'grower'], ['处置', 'resolution'], ['现场', 'field'], ['采样点', 'sample point'], ['读数', 'reading'], ['含水率', 'water content'], ['合适范围', 'recommended range'], ['连续下降', 'keeps falling'], ['缺少新鲜遥测', 'fresh telemetry missing'], ['供电和网络连接', 'power and network connection'],
  ['我会结合', 'I will combine'], ['实时数据', 'live data'], ['回答', 'answer'], ['平台', 'platform'], ['下一步建议', 'next steps'], ['清晰的下一步建议', 'clear next steps'], ['告警', 'alerts'], ['建议', 'recommendation'], ['信息流', 'activity feed'], ['确定性', 'deterministic'], ['规则集', 'rule sets'], ['策略候选', 'strategy candidates'], ['离线验证', 'offline validation'],
  ['规则集负责确定性判断；策略候选只在案例积累和离线验证后，由管理员决定是否启用。', 'Rule sets drive deterministic decisions; strategy candidates become available after case accumulation and offline validation, then the administrator decides whether to activate them.'],
  ['规则集负责确定性判断; 策略候选只在案例积累和离线验证后, 由管理员决定是否启用.', 'Rule sets drive deterministic decisions; strategy candidates become available after case accumulation and offline validation, then the administrator decides whether to activate them.'],
  ['生长阶段', 'Growth stage'], ['农务记录', 'work records'], ['事实', 'facts'], ['由管理员决定', 'the administrator decides'], ['离线验证后', 'after offline validation'], ['示范番茄', 'Demo tomato'], ['示范黄瓜', 'Demo cucumber'], ['示范Tomato', 'Demo tomato'], ['示范Cucumber', 'Demo cucumber'],
  ['示范玉米', 'Demo corn'], ['示范向日葵', 'Demo sunflower'], ['示范草莓', 'Demo strawberry'], ['鲜食玉米', 'Sweet corn'], ['甜糯双色 8 号', 'Bicolor sweet-waxy 8'], ['第 4 穗花', '4th flower cluster'], ['第4穗花', '4th flower cluster'], ['花疏花打杈', 'flower thinning & pruning'], ['设备已绑定，等待首次数据', 'Device bound; waiting for the first reading'], ['设备已绑定', 'Device bound'], ['已绑定，等待首次数据', 'bound; waiting for the first reading'],
  ['黄瓜根区严重缺水', 'Cucumber severe root-zone water deficit'], ['黄瓜棚水肥', 'Cucumber greenhouse water & fertilizer'], ['番茄当前生长阶段', 'the tomato growth stage'], ['温室1番茄', 'Greenhouse 1 tomato'], ['温室2番茄', 'Greenhouse 2 tomato'], ['温室3黄瓜', 'Greenhouse 3 cucumber'], ['温室3 黄瓜', 'Greenhouse 3 cucumber'], ['温室1 黄瓜', 'Greenhouse 1 cucumber'], ['温室2 黄瓜', 'Greenhouse 2 cucumber'], ['温室1番茄田', 'Greenhouse 1 tomato field'], ['温室2番茄田', 'Greenhouse 2 tomato field'],
  ['光照强度', 'Light intensity'], ['CO2浓度', 'CO2 concentration'], ['土壤酸碱度', 'Soil pH'], ['水箱水位', 'Tank water level'], ['温湿度传感器', 'Temperature & humidity sensor'], ['土壤传感器', 'Soil sensor'], ['灌溉执行器', 'Irrigation actuator'], ['环境采集器', 'Environment sensor'], ['流量计', 'Flow meter'], ['控制器', 'Controller'], ['设备台账', 'Device registry'], ['现场运维', 'field operations'], ['运行状态', 'Runtime status'], ['在线运行', 'Online'], ['离线或异常', 'Offline or fault'], ['告警规则', 'Alert rule'], ['策略候选只在', 'strategy candidates become available only after'],
  ['：', ': '], ['；', '; '], ['，', ', '], ['。', '.'], ['（', '('], ['）', ')'],
  ['待验收', 'Awaiting acceptance'], ['返回任务', 'Back to tasks'], ['人工创建', 'Created manually'], ['下一步', 'Next step'], ['请按返工要求重新处理', 'Please rework this item according to the requirements'], ['农户正在处理', 'Grower is working'], ['等待农户开始处理', 'Waiting for the grower to start'], ['完整结果与操作记录', 'Complete result & activity log'], ['统一管理', 'Manage in one place'], ['当前账户', 'current account'], ['后端服务', 'backend service'], ['权限', 'permissions'], ['绑定', 'binding'], ['已绑定', 'Bound'], ['等待首次数据', 'waiting for the first reading'],

  ['农智示范农场', 'AgriLoop demo farm'], ['重庆 · 科学城', 'Chongqing · Science City'], ['挂果采收期', 'Fruit set & harvest'], ['开花抽雄期', 'Tasseling & flowering'], ['盛花结盘期', 'Full bloom & head set'], ['开花坐果期', 'Flowering & fruit set'], ['果实成熟期', 'Fruit maturity'], ['采收盛期', 'Peak harvest'],
  ['鲜食玉米', 'Sweet corn'], ['甜糯双色 8 号', 'Bicolor sweet-waxy 8'], ['油葵花海', 'Sunflower field'], ['金色阳光 3 号', 'Golden Sun 3'], ['红颊草莓', 'Red-cheek strawberry'], ['红颜高架草莓', 'Red Beauty trellised strawberry'], ['设施番茄', 'Greenhouse tomato'], ['荷兰瑞克斯水果番茄', 'Dutch Rijk Zwaan fruit tomato'], ['温室 1 号棚', 'Greenhouse 1'], ['全场未来趋势', 'Farm-wide future trend'], ['全场地块综合推演', 'Farm-wide plot forecast'],
  ['土壤湿度偏低', 'Low soil moisture'], ['湿度略低于目标', 'Moisture slightly below target'], ['灌溉执行超时', 'Irrigation execution timed out'], ['命令未收到回执', 'No command acknowledgement received'], ['心跳超时', 'Heartbeat timed out'], ['设备断网离线', 'Device offline'], ['设备异常', 'Device fault'], ['传感器漂移', 'Sensor drift'], ['传感器零点漂移', 'Sensor zero-point drift'], ['缺水风险', 'Water deficit risk'], ['高温风险', 'Heat risk'], ['干旱告警', 'Drought alert'],
  ['检测到土壤持续缺水风险，完成多因果排查', 'Persistent soil water deficit detected; multi-cause checks completed'], ['灌溉处方待审批', 'Irrigation prescription awaiting approval'], ['未来风险预测', 'Future risk forecast'], ['风险到达时间', 'Time to risk'], ['今日待办', 'Today’s tasks'], ['巡检与工单', 'Inspections & work orders'], ['结构化农业处方', 'Structured agricultural prescription'], ['就绪度通过', 'Readiness passed'], ['风险预测', 'Risk forecast'], ['处方决策引擎', 'Prescription decision engine'], ['灌溉处方', 'Irrigation prescription'], ['稳健趋势推演模型', 'Robust trend forecast model'], ['农务协同调度中心', 'Farm operations coordination'],
  ['土壤湿度持续低于安全阈值', 'Soil moisture remains below the safe threshold'], ['已触发干旱告警', 'Drought alert triggered'], ['智能助手检测到传感器漂移', 'The AI assistant detected sensor drift'], ['温度读数偏差', 'temperature reading deviation'], ['作物模型包已更新至', 'Crop model pack updated to'], ['接口服务重启完成', 'API service restart completed'], ['版本升级', 'version upgrade'], ['用户', 'User'], ['登录', 'signed in'], ['智能助手生成灌溉处方', 'AI assistant generated an irrigation prescription'], ['灌溉命令执行完成', 'Irrigation command completed'], ['模拟器启动', 'Simulator started'], ['正常运行', 'Normal operation'], ['系统配置更新', 'System configuration updated'], ['完整模式', 'Full mode'], ['规则与诊断内核', 'Rules & diagnosis core'], ['智能内核', 'Smart core'],
  ['根区含水率连续下降且设备质量正常，建议立即安排现场复核与补水处理。', 'Root-zone water content keeps falling and data quality is normal; schedule a field review and irrigation immediately.'], ['单个采样点出现偏低读数，规则仍处于候选态，需要人工判断是否代表整块地。', 'A single sample is low; the rule is still a candidate and needs human review before applying to the whole plot.'], ['短时变化与相邻数据不一致，需使用便携仪比对后再决定是否执行农务。', 'The short-term change conflicts with neighboring readings; compare with a portable meter before scheduling work.'], ['设备心跳已超时，缺少新鲜遥测，需先检查供电和网络连接。', 'The device heartbeat timed out and fresh telemetry is missing. Check power and network first.'], ['流量计最近一次数据到达较慢，已确认，等待现场复查。', 'The flow meter reported slowly. It was confirmed and is waiting for a field recheck.'], ['当前证据不足以定位明确根因，且该地块暂时没有在岗处置农户，保留人工审核。', 'Current evidence is insufficient to identify a root cause, and no on-duty grower is available for this plot; keep it for human review.'], ['补水处理', 'irrigation'], ['人工审核', 'human review'], ['候选态', 'candidate state'], ['明确根因', 'clear root cause'], ['整块地', 'the whole plot'], ['相邻数据', 'neighboring readings'],
  ['A01 土壤偏干', 'A01 Soil too dry'], ['土壤湿度持续低于番茄当前生长阶段的合适范围，请尽快确认是否需要浇水。', 'Soil moisture remains below the suitable range for the tomato growth stage. Confirm whether irrigation is needed.'], ['根区含水率连续下降且设备质量正常，建议立即安排现场复核与补水处理。', 'Root-zone water content keeps falling and data quality is normal; schedule a field review and irrigation immediately.'], ['设备心跳已超时，缺少新鲜遥测，需先检查供电和网络连接。', 'The device heartbeat timed out and fresh telemetry is missing. Check power and network first.'], ['流量计最近一次数据到达较慢，已确认，等待现场复查。', 'The flow meter reported slowly. It was confirmed and is waiting for a field recheck.'], ['当前证据不足以定位明确根因，且该地块暂时没有在岗处置农户，保留人工审核。', 'Current evidence is insufficient to identify a root cause, and no on-duty grower is available for this plot; keep it for human review.'],
  ['根因=持续干旱', 'Cause: persistent drought'], ['置信度=', 'Confidence: '], ['气象', 'weather'], ['数据新鲜度', 'data freshness'], ['校验状态', 'validation status'], ['无突发阶跃跳变，排除传感器接触不良', 'No sudden step change; poor sensor contact ruled out'], ['无匹配案例', 'No matching case'], ['人工决策', 'Human decision'], ['统计', 'Statistics'], ['有效率', 'Success rate'], ['平均恢复时间', 'Average recovery time'], ['保持当前策略', 'Keep the current strategy'], ['关注第4阶段灌溉频次', 'Watch irrigation frequency in stage 4'],
  ['当前农场还没有种植农户，请使用添加卡片创建。', 'This farm has no growers yet. Use the add card to create one.'], ['成员来自当前农场账号，任务只能分配给拥有对应地块权限的活跃农户。', 'Members come from this farm. Work can only be assigned to active growers with access to the plot.'], ['成员刷新失败，当前显示上一次成功读取的结果：', 'Member refresh failed; showing the last successful result:'], ['请选择一个地块后再开始诊断', 'Select a plot before starting diagnosis'], ['当前身份没有管理农场水资源的权限。', 'This role cannot manage farm water resources.'], ['当前没有需要智能处理的告警', 'There are no alerts requiring smart handling'], ['选中的告警均已下发，无需重复智能处理', 'All selected alerts are already dispatched; no duplicate handling is needed'],

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
