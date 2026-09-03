# 角色化农业 Agent 工具合同

> 版本：agent-tool-v2（2026-09-03）

## 检查结论与范围

现有系统已经有统一的 Agent 对话入口、角色权限策略、地块/设备/告警/工单事实、灌溉安全门、审计记录和受控学习服务。本次实现是在这些闭环上增量扩展，没有另建一套聊天、任务或命令系统。

Agent 可以理解自然语言、补充当前范围、读取已注册工具的真实结果，并在需要时生成受控操作预览。模型不能直接执行 SQL、Shell、MQTT、任意 HTTP 或任意 URL。当前实现不会在线修改模型权重、生产规则、阈值或设备控制逻辑；受控学习只产生检索证据、候选策略和离线训练导出。

## 三角色能力矩阵

| 角色 | 数据范围 | 可查询 | 可写入（均需预览和确认） |
|---|---|---|---|
| `FARM_ADMIN` 农场管理员 | 授权农场的全部地块 | 地块、遥测、设备、告警、任务、诊断、预测、用水、农场成员、作物手册、学习案例和策略候选 | 创建/启停农户、调整农户地块范围、地块、设备绑定、创建并下发任务、分派/改派任务、取消任务、验收/退回任务、告警核查/关闭、模拟策略、虚拟灌溉 |
| `FARMER` 种植农户 | 本账号负责的地块、任务和反馈 | 本人地块状态、遥测、曲线、告警、今日任务、诊断、预测、作物手册和用水建议 | 开始/重新处理/提交本人任务、提交巡田记录、申请补证、通过安全门后发起虚拟灌溉 |
| `SYSTEM_ADMIN` 系统管理员 | 平台治理和跨农场只读范围 | 平台服务、消息链路、跨农场风险、账号、规则/Crop Pack、学习案例、策略候选和审计 | 创建/启停/删除受保护范围外的平台账号、按地块设置模拟策略、审核学习案例、推进或回滚策略候选；不直接修改农场生产事实 |

农场管理员的任务状态变更遵循现有工单状态机：分派使用 `assign_work_order`，取消使用 `transition_work_order`，对农户提交结果的通过/退回使用 `review_work_order`。管理员不会借用仅限农户的 `transition_assigned_work_order`。

## 请求数据流

```text
用户消息/图片
  -> 账号、角色、conversationId、农场、地块和当前页面范围校验
  -> 读取最新遥测、设备、告警、任务、作物阶段、场景、规则和 Crop Pack 版本
  -> 意图识别（查询、跳转、配置、任务、诊断或操作）
  -> AgentToolRegistry 白名单与参数校验
  -> 只读工具直接执行，写工具生成预览
  -> 用户确认 + 权限/安全门/资源/新鲜度/幂等复核
  -> 领域服务执行并返回真实结果、ACK/效果或逐项失败
  -> agent-run、agent-action、conversation/message 和审计事件持久化
  -> 固定路由注册表生成 NAVIGATION_CARD
```

当前地块上下文只进入当前 `conversationId`。系统管理员平台范围对话不绑定地块；切换农场、地块或角色时，旧对话不能被静默重绑。

## 白名单工具

完整目录由 `GET /api/v1/agent/tools/catalog` 返回，旧客户端继续使用 `GET /api/v1/agent/tools`。目录中的 `roles`、`targetScope`、`riskLevel`、`requiresConfirmation` 和 `inputSchema` 是服务端合同，前端不能改写。

### 只读工具

`get_plot_status`、`get_risk_forecast`、`generate_irrigation_plan`、`evaluate_diagnosis`、`get_today_work_items`、`get_water_resource_status`、`get_platform_status`、`get_platform_risk_overview`、`get_rule_strategy_status`、`get_farm_overview`、`get_devices`、`get_alerts`、`get_work_orders`、`get_crop_manual`、`get_simulation_status`、`get_learning_cases`、`get_strategy_candidates`、`get_audit_records`、`get_inspections`、`get_feedback`、`get_execution_records`、`get_farm_members`、`get_user_accounts`、`get_crop_packs`、`get_rule_sets`、`get_farms`、`get_telemetry`。

只读工具仍会执行领域层权限检查；“只读”不等于可以跨农场或跨地块读取。

### 受控写工具

`create_plot`、`update_plot`、`set_plot_devices`、`create_and_assign_work_order`、`assign_work_order`、`transition_work_order`、`review_work_order`、`publish_alert_verification`、`close_alert`、`transition_assigned_work_order`、`create_inspection_record`、`create_evidence_request`、`execute_virtual_irrigation`、`update_simulation_settings`、`create_farm_member`、`update_farm_member_scope`、`update_farm_member_status`、`delete_farm_member`、`create_user_account`、`update_user_account_status`、`delete_user_account`、`review_learning_case`、`transition_strategy_candidate`。

每个写工具都必须在注册表中声明角色、目标范围和必填参数。当前管理员工单 `transition_work_order` 只接受 `CANCEL`，任务暂停状态尚未在现有工单状态机中定义，不能伪装成已支持。

## 参数、权限与安全门

- ID 参数使用受限标识符格式；水量、时长、面积、设备数组和文本长度均有服务端上限。
- `farmId`、`plotId`、`deviceId`、`workOrderId`、`alertId`、`caseId` 和 `candidateId` 会在注册表与领域服务中双重校验。
- 农户必须同时满足账号、农场和本人地块范围；农场管理员只能访问授权农场；系统管理员的跨农场能力仅限既有治理合同。
- 灌溉、设备/模拟控制、任务状态、告警、学习审核和策略状态变更先保存 `AWAITING_CONFIRMATION` 预览。
- 确认时重新检查权限、地块与农场一致性、遥测新鲜度、证据冲突、设备能力、水量/时长上限、安全门和当前状态。
- 每次确认使用 `idempotencyKey`；重复确认返回第一次结果，不重复创建任务或命令。预览有过期时间，过期后必须重新生成。
- 虚拟灌溉确认先进入 `EXECUTING`，前端在约 3 秒的有界窗口内查询后端 action，只有收到 ACK 后才展示 `SUCCEEDED`、`PARTIAL`、`FAILED` 或 `TIMEOUT`；超过窗口仍显示执行中，不把等待误报为失败。
- 异步效果评价或持久化异常会把 action 收敛到 `FAILED` 并记录原因；最终状态同步回账号、action 与幂等键组合记录，重复确认不会返回陈旧的执行中快照。
- 所有预览、确认、取消、成功、部分成功、超时和失败都写入 Agent 审计事件，并记录账号、角色、会话和目标对象。

## 多轮创建和敏感信息

创建地块或账号时，Agent 可以在当前 `conversationId` 内组合用户后续补充的信息。例如用户先说“创建一个地块”，再说“随机生成”，系统会补齐受支持的演示字段并生成真正的 `create_plot` 预览，而不是输出一段声称已经提交的模型文字。精确回复“确认”只会确认同账号、同会话中唯一的待确认 action；没有待确认项或存在多项候选时均拒绝猜测执行。

随机账号的初始密码和恢复码只在创建成功的当前 HTTP 响应中返回一次，不进入 Agent 对话历史、运行记录或事件日志。公开 action、导航卡片和审计投影会递归移除密码、密码哈希、授权码和内部幂等键。

## 导航卡片

服务端只从固定映射生成卡片，不接受模型拼接的 URL：

```json
{
  "type": "NAVIGATION_CARD",
  "title": "查看地块详情",
  "description": "查看温室 1 的实时数据、曲线和设备状态",
  "targetRole": "FARM_ADMIN",
  "route": {
    "view": "plot-detail",
    "params": { "farmId": "farm-demo", "plotId": "plot-a01" }
  },
  "label": "前往查看"
}
```

前端 `live-data.js` 只接受当前角色允许的 `view` 和限定参数键，并再次去重和截断卡片数量。农户、农场管理员和系统管理员分别映射到自己的工作台路由；作物手册在农户进入 `tools`，农场管理员进入 `rules-strategies`，系统管理员进入 `admin-rules`。无效路由被丢弃并保留当前对话，不会跳到空白页。

## 受控学习边界

告警/决策记录、冻结输入快照、诊断证据、执行 ACK、效果评价和反馈进入现有 `decision-case` 或 `alert-learning-case`。`ControlledLearningService` 用可重复的确定性质量门写入：

```text
PENDING -> QUALIFIED       （全部质量门通过）
PENDING -> REJECTED        （任一硬性排除条件命中）
```

遥测过期/缺失/坏质量、漂移或冲突、无 ACK、执行失败/超时、效果评价缺失或不可解释、规则/安全/资源/权限失败、纯模型猜测和未经明确确认的模拟结果都会进入 `REJECTED`。效果评价缺失是硬排除，不会因为等待或人工审核自动变成正向经验。模拟结果必须有明确的 `simulationConfirmed`、`userConfirmed` 或明确确认反馈；人工审核本身不替代该标记。

用途严格隔离：

- `QUALIFIED` 才能使用 `POSITIVE_RETRIEVAL` 和 `STRATEGY_CANDIDATE`；
- 至少两个合格案例、固定快照和固定随机种子的离线回放通过后，才生成候选；
- 只有人工批准的合格案例带 `OFFLINE_TRAINING` 并可导出；
- `REJECTED` 保留为 `NEGATIVE_EVALUATION`，只用于反例、拒答和回归测试；
- 任何候选都必须经过 `DRAFT -> OFFLINE_VALIDATED -> APPROVED -> ACTIVE`，失败或人工撤回进入 `REJECTED`/`ROLLED_BACK`，不能跳过验证。

案例查询、相似检索和训练导出都按账号、角色、农场、地块和会话过滤。跨农场复用需要系统管理员的显式批准标记；案例不会写入全局浏览器状态或其他会话。

## 回答与降级

模型收到的是当前公开事实和本轮会话历史，不接收其他账号或会话的内容。模型只生成自然语言解释，不能改变工具结果、权限或安全门；不向普通用户展示内部思考、`reasoning_content`、模型置信度或内部质量分数。

模型、工具、数据库或实时数据不可用时，Agent 返回已有规则/检索结果并标记 `degraded` 和降级原因；不会声称命令已执行，也不会生成未经验证的设备命令。写操作失败会保留已完成与未完成项、失败原因及可否重试，页面仍可浏览。

## 版本、审计与回滚

每条案例和策略候选保存 Crop Pack、规则、Agent、评估器版本、输入快照、审核人和时间。离线回放保存场景、随机种子、证据案例和哈希。策略启用、替换和回滚均由系统管理员操作并写审计；本实现不自动部署新模型或静默修改生产阈值。

## 验收清单

- 成功且评价完整的案例可以通过质量门；失败、超时、漂移、冲突、过期和无 ACK 案例不会进入正向检索。
- 排除案例仍可在治理/审计和反例用途列表中查询；重复评估保持幂等。
- 三角色工具目录只显示各自白名单；越权的农场、地块、账号和会话请求被拒绝。
- 写操作必须出现预览，确认后结果与领域记录、设备状态、ACK、遥测和页面上下文一致。
- “创建地块 -> 随机生成 -> 确认”会写入真实地块记录并返回新地块详情卡；“创建农户 -> 随机生成 -> 确认”会写入真实账号并返回农场成员卡和一次性登录信息。
- 虚拟灌溉的确认响应不会把 `EXECUTING` 显示成失败，最终卡片状态来自后端 ACK；异步异常会成为可审计失败而不是永久执行中。
- 导航卡片只落到当前角色注册路由，并携带已校验的上下文参数。
- 模型不可用时可安全降级，普通查询和既有安全控制不被学习服务阻塞。

完整自动化套件、浏览器验收和生产部署仍需在目标环境单独执行；本次提交只包含本地代码与合同文档。
