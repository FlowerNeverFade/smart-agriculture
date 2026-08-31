/**
 * Shared presentation contract for the three Agent entry points.
 *
 * The shell (avatar, source badge, facts, recommendations, action preview and
 * evidence disclosure) is intentionally shared by all roles.  The copy and
 * suggested questions remain role-specific so a farmer is never presented
 * with platform-admin work, and a system administrator is not prompted to do
 * field work.
 */

const ROLE_ALIASES = Object.freeze({
  ADMIN: 'FARM_ADMIN',
  FARM_ADMIN: 'FARM_ADMIN',
  FARMER: 'FARMER',
  FIELD_OPERATOR: 'FARMER',
  OPERATOR: 'FARMER',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  SYSADMIN: 'SYSTEM_ADMIN'
});

const ROLE_PRESENTATIONS = {
  FARMER: {
    code: 'FARMER',
    label: '种植农户',
    assistantName: '农智助手 · 种植农户',
    titleDescription: '围绕本人负责的地块、巡田记录和农务执行给出可操作建议。',
    scopeLabel: '本人负责地块',
    contextLabel: '当前地块',
    emptyGreeting: '今天想先处理什么？',
    emptyCopy: '我会先读取当前地块的可用证据；涉及写入的操作都会先给你预览。',
    inputPlaceholder: '问问当前地块，或描述你想执行的农事操作…',
    typingLabel: '正在分析当前地块…',
    composerFootnote: '回答只覆盖本人负责的地块；写入操作会先展示预览，并在确认后再次校验。',
    historyTitle: '我的农智对话',
    historyEmpty: '发送第一条消息后会保存到这里',
    historyItemFallback: '我的农事对话',
    factsTitle: '现场依据',
    recommendationsTitle: '下一步农事',
    evidenceTitle: '回答依据与执行记录',
    actionTitle: '农事操作预览',
    detailsLabel: '查看依据与执行记录',
    detailsCollapseLabel: '收起依据与执行记录',
    shortcutQuestions: Object.freeze([
      Object.freeze({ label: '查看今天待办', question: '查看今天待办', icon: 'task' }),
      Object.freeze({ label: '当前地块有什么风险', question: '当前地块有什么风险', icon: 'warning' }),
      Object.freeze({ label: '生成当前地块补水建议', question: '生成当前地块补水建议', icon: 'water_drop' }),
      Object.freeze({ label: '帮我记录一次巡田', question: '帮我记录一次巡田', icon: 'fact_check' })
    ])
  },
  FARM_ADMIN: {
    code: 'FARM_ADMIN',
    label: '农场管理员',
    assistantName: '农智助手 · 农场管理员',
    titleDescription: '围绕全农场告警、任务分派、设备健康和灌溉安排协助运营。',
    scopeLabel: '当前农场（全场地块）',
    contextLabel: '当前地块',
    emptyGreeting: '今天想先处理什么？',
    emptyCopy: '我会结合当前地块的实时数据、告警和农务记录回答，先核对平台事实，再给出清晰的下一步建议。',
    inputPlaceholder: '查询告警、任务、设备或灌溉计划…',
    typingLabel: '正在分析农场数据和农务记录…',
    composerFootnote: '回答只覆盖当前农场；派单、告警和灌溉等写入操作会先展示预览并等待确认。',
    historyTitle: '我的农场管理对话',
    historyEmpty: '发送第一条消息后会保存到这里',
    historyItemFallback: '农场管理对话',
    factsTitle: '运营依据',
    recommendationsTitle: '建议安排',
    evidenceTitle: '运营依据与执行记录',
    actionTitle: '运营操作预览',
    detailsLabel: '查看依据与执行记录',
    detailsCollapseLabel: '收起依据与执行记录',
    shortcutQuestions: Object.freeze([
      Object.freeze({ label: '农场风险概览', question: '总结当前农场现在最需要处理的问题', icon: 'warning' }),
      Object.freeze({ label: '分析最近告警', question: '分析当前农场最近的告警', icon: 'warning_amber' }),
      Object.freeze({ label: '安排今日任务', question: '今天应该给农户安排哪些任务', icon: 'task' }),
      Object.freeze({ label: '查看灌溉安排', question: '查看当前农场的灌溉建议和资源安排', icon: 'water_drop' })
    ])
  },
  SYSTEM_ADMIN: {
    code: 'SYSTEM_ADMIN',
    label: '系统管理员',
    assistantName: '农智助手 · 系统管理员',
    titleDescription: '面向平台运行、数据链路、规则版本和决策审计提供排查依据。',
    scopeLabel: '全平台（跨农场）',
    contextLabel: '关联地块',
    emptyGreeting: '今天要排查哪条平台链路？',
    emptyCopy: '我会结合平台遥测、服务健康、规则版本和审计记录给出分析；不会直接修改农场业务数据。',
    inputPlaceholder: '查询平台状态、数据链路、规则版本或跨农场风险…',
    typingLabel: '正在核对平台状态与审计记录…',
    composerFootnote: '回答可跨农场读取平台事实，但不会直接修改农场业务数据；请到受控配置页面执行变更。',
    historyTitle: '我的平台排查对话',
    historyEmpty: '发送第一条消息后会保存到这里',
    historyItemFallback: '平台排查对话',
    factsTitle: '平台事实',
    recommendationsTitle: '排查建议',
    evidenceTitle: '平台依据与审计记录',
    actionTitle: '受控操作预览',
    detailsLabel: '查看依据与审计记录',
    detailsCollapseLabel: '收起依据与审计记录',
    shortcutQuestions: Object.freeze([
      Object.freeze({ label: '系统资源状态', question: '系统资源状态如何？', icon: 'monitoring' }),
      Object.freeze({ label: '关联地块异常', question: '分析关联地块的异常原因', icon: 'warning' }),
      Object.freeze({ label: '规则与策略状态', question: '查看当前规则与策略状态', icon: 'rule_folder' }),
      Object.freeze({ label: '全局地块风险概览', question: '当前所有地块的风险概览', icon: 'grid_view' })
    ])
  }
};

Object.values(ROLE_PRESENTATIONS).forEach((presentation) => Object.freeze(presentation));

export const AGENT_ROLE_PRESENTATIONS = Object.freeze(ROLE_PRESENTATIONS);

export function normalizeAgentRole(value, fallback = 'FARMER') {
  const key = String(value || '').trim().toUpperCase();
  return ROLE_ALIASES[key] || (ROLE_PRESENTATIONS[key] ? key : fallback);
}

export function agentRolePresentation(value) {
  return AGENT_ROLE_PRESENTATIONS[normalizeAgentRole(value)] || AGENT_ROLE_PRESENTATIONS.FARMER;
}
