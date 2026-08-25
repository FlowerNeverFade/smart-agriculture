# 农场管理员双人开发接口冻结合同

> 合同编号：`ADMIN-IFACE-1`
>
> 合同状态：已冻结
>
> 生效基线：`admin` 分支中包含本文件的提交
>
> 适用开发线：A（生产运营与权限）、B（智能决策与经营）
>
> 注意：接口冻结表示双方约定已经确定，不表示对应功能代码已经完成。

## 1. 冻结目的

本合同只冻结会跨越 A、B 两条开发线的公共语义，使两位开发者可以从同一个 `admin` 提交开始长期并行开发，并在最后一轮完成集成。

合同不限制各自模块内部的合理设计。开发者遇到未定义问题时，应优先作出局部、可回退、向后兼容的决策，不需要等待对方逐项确认。

## 2. 硬冻结与可自主决定范围

| 级别 | 内容 | 处理规则 |
| --- | --- | --- |
| 硬冻结 | ID、角色权限边界、状态语义、公共方法签名、最小返回字段、路由 ID、数据来源语义 | 不可单方面删除、改名或改义；确需修改时记录合同变更 |
| 兼容冻结 | 现有方法、旧 Hash 路由、历史状态值 | 新实现可以增加新形式，但必须保留适配层直到最终集成完成 |
| 可自主决定 | 页面布局、组件拆分、CSS、内部变量、额外可选字段、加载动画、空状态具体文案 | 所属开发者自行决定 |
| 所属线内部合同 | 只被 A 或只被 B 使用的接口与模型 | 所属开发者自行决定，但不得突破权限、来源和农场范围规则 |

以下情况无需跨线确认：

- 修改自己模块中的 HTML、CSS 和局部 Vue 状态。
- 新增不会改变既有语义的可选字段。
- 在 `api.js` 公共外观之后调整后端内部路由或实现。
- 调整通俗文案，但不得把模拟数据描述成真实观测或真实设备执行。
- 增加局部测试、缓存、加载状态和错误恢复。

以下情况必须记录并通知另一位开发者：

- 删除或重命名本合同中的字段、状态、方法或路由。
- 改变角色权限或农场/地块范围。
- 改变工单、告警、命令或评价状态语义。
- 改变 `LIVE`、`DEMO`、`SIMULATED`、`OBSERVED` 等来源含义。
- 让对方已使用的字段从必有变为缺失。

## 3. 不变的产品边界

### 3.1 角色

对外角色继续固定为：

```text
FARM_ADMIN
FARMER
SYSTEM_ADMIN
```

`FIELD_OPERATOR` 只作为旧会话兼容别名，不新增为第四个页面角色。

### 3.2 农场管理员主导航

管理员主导航继续固定为五项：

| 路由 ID | 页面名称 |
| --- | --- |
| `dashboard` | 农场总览 |
| `work-orders` | 农务任务 |
| `decision-console` | 告警与诊断 |
| `resource-coordination` | 设备与灌溉 |
| `farm-members` | 农场成员 |

地块维护、生产计划、Crop Pack、价值对账和模拟器控制可以作为上述页面的子视图、页签或二级入口。是否增加独立内部路由由实现者决定，但不得破坏五个主入口和已有 Hash 路由。

### 3.3 执行边界

- 当前灌溉执行只允许描述为虚拟执行。
- 不承诺真实水泵、阀门、网关或真实硬件控制。
- 高风险动作必须有明确人工确认和幂等键。
- 命令失败、部分成功和超时不得显示为成功。

## 4. 公共上下文合同

### 4.1 管理员上下文

跨页面共享的管理员上下文至少包含：

```js
{
  farmId: string,
  plotId: string | null,
  sessionMode: 'live' | 'demo'
}
```

硬冻结规则：

1. `farmId`、`plotId` 都是不可解释的字符串 ID，页面不得从名称推导 ID。
2. 正式会话执行农场级读取或写入前必须存在 `farmId`。
3. 正式会话执行地块级动作前必须存在 `plotId`。
4. 正式会话不得静默回退到 `farm-demo` 或 `plot-a01`。
5. 演示会话可以使用 `farm-demo` 和固定演示地块，但必须显示演示/模拟来源。
6. 切换农场后，如果原 `plotId` 不属于新农场，应清空地块选择或选择新农场首个授权地块。
7. URL 中的 `farmId`、`plotId` 只能作为请求上下文，最终权限仍由后端验证。

### 4.2 缺失上下文

正式会话缺少必要上下文时，不生成默认 ID，统一进入以下失败语义：

| 场景 | 建议错误码 | 用户提示原则 |
| --- | --- | --- |
| 缺少农场 | `FARM_CONTEXT_REQUIRED` | 请先选择农场 |
| 缺少地块 | `PLOT_CONTEXT_REQUIRED` | 请先选择地块 |
| 无权访问农场 | `FARM_FORBIDDEN` | 当前账号没有该农场权限 |
| 无权访问地块 | `PLOT_FORBIDDEN` | 当前账号没有该地块权限 |

错误码作为硬冻结语义，具体异常类和内部处理方式由开发者决定。

## 5. 数据来源合同

### 5.1 会话模式与事实来源分离

`sessionMode` 只表示登录方式：

```text
live
demo
```

业务记录的来源使用以下稳定值：

```text
OBSERVED
USER_PROVIDED
DERIVED
SIMULATED
ESTIMATED
```

当 `provenance=OBSERVED` 时，可以额外使用：

```text
sourceMode=SIMULATION
sourceMode=REAL
```

本期真实后端中的遥测也可能来自模拟器，因此不能仅凭 `sessionMode=live` 将数据标为真实硬件观测。

### 5.2 缺失值

- 数据层缺失值使用 `null`、字段缺失或空数组。
- 页面统一显示“—”或明确空状态。
- 不得用 `0`、正常状态或 Mock 值替代正式数据缺失。
- 正式接口失败时不得自动混入 Mock 数据；只有明确的 `sessionMode=demo` 可以使用演示数据。

## 6. 通用响应与错误合同

### 6.1 后端响应信封

现有响应信封继续保留：

```js
{
  requestId: string,
  timestamp: string,
  schemaVersion: string,
  data: unknown
}
```

错误响应至少保持：

```js
{
  requestId: string,
  timestamp: string,
  schemaVersion: string,
  error: {
    code: string,
    message: string,
    details: object
  }
}
```

前端 `api.js` 可以继续返回已解包的 `data`，但不能丢失错误的 `status`、`code` 和 `message`。

### 6.2 通用字段

- 所有时间使用 ISO 8601 字符串。
- 所有 ID 使用字符串。
- 物理量必须带明确单位或由稳定字段名声明单位。
- 列表接口无结果时返回空数组，不返回演示列表。
- 写操作成功后返回更新后的完整记录或能重新读取该记录的 ID。

## 7. 最小领域模型

以下字段是跨线最小合同。开发者可以增加字段，但不能单方面删除或改义。

### 7.1 Farm

```js
{
  farmId: string,
  name: string
}
```

### 7.2 Plot

```js
{
  plotId: string,
  farmId: string,
  name: string,
  cropCode: string | null,
  cropName: string | null,
  stageCode: string | null,
  areaM2: number | null,
  latest: object,
  device: object | null
}
```

### 7.3 Alert

```js
{
  alertId: string,
  farmId: string,
  plotId: string,
  level: string,
  status: string,
  source: string,
  createdAt: string,
  updatedAt: string | null
}
```

### 7.4 WorkOrder

```js
{
  workOrderId: string,
  farmId: string,
  plotId: string,
  title: string,
  actionType: string,
  priority: 'HIGH' | 'MEDIUM' | 'LOW',
  status: string,
  assigneeId: string | null,
  dueAt: string | null,
  reason: string,
  sourceType: string,
  sourceRef: string | null,
  createdAt: string,
  updatedAt: string | null
}
```

`workItemId` 可以作为今日农务聚合读模型中的兼容字段，但持久化农务任务以 `workOrderId` 为主 ID。

### 7.5 FarmMember

```js
{
  userId: string,
  username: string,
  displayName: string,
  role: 'FARMER' | 'FARM_ADMIN',
  farmIds: string[],
  plotIds: string[],
  status: string
}
```

### 7.6 Device

```js
{
  deviceId: string,
  farmId: string,
  plotId: string | null,
  type: string,
  status: string,
  lastSeen: string | null,
  healthScore: number | null
}
```

### 7.7 CropBatch

```js
{
  batchId: string,
  farmId: string,
  plotId: string,
  cropCode: string,
  stageCode: string,
  cropPackVersion: string,
  plantedAt: string,
  status: string
}
```

### 7.8 Crop Pack 阶段任务模板

B 线提供给 A 线生产计划使用的稳定最小结构为：

```js
{
  stageCode: string,
  actionType: string,
  intervalDays: number,
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
}
```

标题、执行说明、技能、预计工时和设备需求均可作为后续可选字段，不影响第一版并行开发。

### 7.9 决策事实链 ID

以下关联 ID 保持现有语义：

```text
diagnosisId
readinessId
planId
commandId
evaluationId
traceId
```

任何页面不得用数组位置、标题或 `plotId` 代替上述事实 ID。

## 8. 状态语义冻结

### 8.1 工单状态

统一状态集合：

```text
OPEN
ASSIGNED
IN_PROGRESS
SUBMITTED
REJECTED
DONE
CANCELLED
```

兼容规则：读取到历史 `COMPLETED` 时，前端按 `DONE` 展示；写入新状态时使用 `DONE`。

| 当前状态 | 动作 | 目标状态 | 允许角色 |
| --- | --- | --- | --- |
| 新建 | 创建 | `OPEN` | `FARM_ADMIN` |
| `OPEN` | 分配农户 | `ASSIGNED` | `FARM_ADMIN` |
| `ASSIGNED` | 开始执行 | `IN_PROGRESS` | 被分配的 `FARMER` |
| `IN_PROGRESS` | 提交结果 | `SUBMITTED` | 被分配的 `FARMER` |
| `SUBMITTED` | 验收通过 | `DONE` | `FARM_ADMIN` |
| `SUBMITTED` | 退回 | `REJECTED` | `FARM_ADMIN` |
| `REJECTED` | 重新处理 | `IN_PROGRESS` | 被分配的 `FARMER` |
| 非终态 | 重新分配 | `ASSIGNED` | `FARM_ADMIN` |
| 非终态 | 取消 | `CANCELLED` | `FARM_ADMIN` |

开发者可以增加审计字段和业务限制，但不能允许未分配农户替他人提交，不能让农户自行验收。

### 8.2 告警状态

统一状态集合：

```text
ACTIVE
ACKED
ESCALATED
CLOSED
RESOLVED
```

冻结语义：

- `ACKED` 表示管理员已经看到并接手，不表示问题已经解决。
- `ESCALATED` 表示需要更高等级处理，不表示告警关闭。
- `CLOSED`、`RESOLVED` 为终态，不进入今日未处理告警。
- 告警转工单不自动关闭告警；关闭时机由处置流程决定。

### 8.3 设备状态

前端至少识别：

```text
ONLINE
OFFLINE
UNBOUND
ERROR
UNKNOWN
```

### 8.4 决策就绪度

继续使用现有稳定状态：

```text
READY
NEEDS_EVIDENCE
HUMAN_REVIEW
UNAVAILABLE
```

### 8.5 命令与评价

命令前端至少识别：

```text
PENDING
SUCCEEDED
PARTIAL
FAILED
TIMEOUT
```

效果评价前端至少识别：

```text
PENDING
COMPLETED
PARTIAL
INCONCLUSIVE
```

## 9. 前端 API 外观冻结

### 9.1 参数约定

新增的列表读取统一接受对象参数：

```js
{
  farmId: string,
  plotId?: string,
  status?: string,
  assigneeId?: string
}
```

现有 `getTodayWorkItems(plotId)` 等字符串参数调用在过渡期继续支持；新代码使用对象参数。适配层可以自行决定如何映射到 REST 查询参数。

### 9.2 公共读取方法

| 方法 | 最小返回 | 主要消费者 |
| --- | --- | --- |
| `getFarms()` | `Farm[]` | A、B |
| `getOverview({ farmId })` | 总览对象 | B |
| `getPlots({ farmId })` | `Plot[]` | A、B |
| `getTodayWorkItems(filters)` | 今日农务数组 | A、B |
| `getWorkOrders(filters)` | `WorkOrder[]` | A、B |
| `getAlerts(filters)` | `Alert[]` | A、B |
| `getDevices(filters)` | `Device[]` | A、B |
| `getFarmMembers({ farmId })` | `FarmMember[]` | A、B |
| `getCropBatches(filters)` | `CropBatch[]` | A |
| `getCropPacks()` | Crop Pack 数组 | A、B |
| `getValueLedgers(filters)` | 价值账本数组或汇总 | B |

### 9.3 A 线操作方法

以下方法名和行为作为前端公共外观冻结；具体后端 REST 路径由 A 决定并在 OpenAPI 中记录：

```text
ackAlert(alertId, input?)
closeAlert(alertId, input?)
escalateAlert(alertId, input?)
createWorkOrder(input)
assignWorkOrder(workOrderId, input)
transitionWorkOrder(workOrderId, input)
reviewWorkOrder(workOrderId, input)
createInspection(input)
registerDevice(input)
bindDevice(deviceId, input)
unbindDevice(deviceId, input?)
createPlot(input)
updatePlot(plotId, input)
updateFarmMemberScope(userId, input)
createCropBatch(input)
generateCropBatchPlan(batchId, input?)
reviewCropBatchPlan(batchId, input)
```

兼容要求：现有 `saveWorkOrder(input)` 在迁移期继续可用，语义只视为创建或兼容保存入口；新状态转换不得继续依赖重复 `POST /work-orders` 覆盖记录。

### 9.4 B 线操作方法

以下现有方法签名继续保留：

```text
evaluateDiagnosis(plotId, input?)
estimateIrrigation(input?)
getDecisionReadiness(subjectType, subjectId, context?)
createDecisionEvidenceRequest(readinessId, input?)
getDecisionPassport(traceId)
executeIrrigation(planId, plotId, options?)
getCommand(commandId)
getCommandEvaluation(commandId)
evaluateResourcePlan(input?)
getSimulatorStatus()
startSimulator()
stopSimulator()
```

B 可以新增 `createValueLedger(input)`、资源计划查询和 Crop Pack 详情方法；只要不改变上述现有方法即可自行决定名称与内部实现。

### 9.5 后端路由弹性

- 已存在且被历史代码使用的 REST 路径保持兼容。
- 新能力的具体 REST 路径可以由负责开发者设计。
- 只要前端公共外观、模型和状态语义不变，后端内部方法名和存储方式不属于硬冻结范围。
- 新增或改变公开 REST 合同时同步更新 `docs/api/openapi.yaml`。

## 10. 路由与组件交互合同

### 10.1 Hash 路由

继续兼容：

```text
#dashboard
#work-orders
#decision-console
#resource-coordination
#farm-members
#view=plot-detail&plotId=<plotId>
```

带上下文的新路由推荐使用：

```text
#view=<viewId>&farmId=<farmId>&plotId=<plotId>
```

新参数可以增加，未知参数应被忽略；不得因为增加参数破坏旧 Hash。

### 10.2 视图输入

当前 Vue 视图继续至少接收：

```text
state
routeParams
```

是否进一步拆成独立 props 由开发者决定。

### 10.3 跨模块事件语义

事件如何实现可以选择 Vue `emit`、共享 store 或轻量事件总线，但语义固定为：

```js
{
  type: 'context-changed',
  farmId: string,
  plotId: string | null,
  sourceView: string
}
```

```js
{
  type: 'data-invalidated',
  domains: Array<'overview' | 'plots' | 'alerts' | 'workOrders' | 'devices' | 'members' | 'batches' | 'ledgers'>,
  farmId: string,
  plotId: string | null,
  reason: string
}
```

冻结原则：写操作成功后发布失效语义，由根应用或共享 store 重新读取事实；模块之间不得直接修改对方的私有数组。

## 11. A、B 两线的固定交接点

| 生产者 | 交接内容 | 消费者 | 冻结要求 |
| --- | --- | --- | --- |
| A | `WorkOrder` | B | B 创建的补证任务必须能进入同一工单列表 |
| B | `createDecisionEvidenceRequest()` 返回的工单 | A | 返回值符合最小 `WorkOrder` 结构，带 `sourceType=READINESS` |
| B | Crop Pack 阶段任务模板 | A | 至少提供 `stageCode/actionType/intervalDays/priority` |
| A | Plot、Device | B | 设备绑定或地块变更后发布 `overview/plots/devices` 失效 |
| B | Command、Evaluation | A | 如执行产生跟进任务，通过工单接口创建，不直接写 A 的状态 |
| A | FarmMember | B | B 只读取成员和权限，不修改成员私有状态 |
| B | 农场上下文变更 | A | A 的告警、任务、设备和成员必须按新农场重新加载 |

## 12. 文件所有权与同一 admin 分支协作

两位开发者都从包含本合同的同一个 `admin` 提交开始。是否建立短期个人分支由开发者自行决定，不属于接口冻结要求。

### 12.1 默认所有权

| 区域 | 默认负责人 |
| --- | --- |
| 告警、工单、成员、设备、地块、生产计划业务模块 | A |
| 诊断、灌溉、资源、Crop Pack、价值、模拟器业务模块 | B |
| 新的工单、成员、地块和生产计划后端合同 | A |
| 现有诊断、命令、资源和模拟器接口接线 | B |
| 公共导航、根状态和最终接线 | 两人指定一名集成人，未指定前不同时修改 |

### 12.2 高冲突文件

以下文件同一时段只由一人修改：

```text
apps/web-ui/js/app.js
apps/web-ui/js/api.js
apps/web-ui/index.html
apps/web-ui/css/style.css
apps/web-ui/js/roles.js
apps/api-service/src/main/java/com/agriloop/AgriApplication.java
docs/api/openapi.yaml
```

推荐做法：

- 新功能放入按业务域命名的模块，不创建 `v2`、`new`、`final` 文件。
- 公共文件修改保持小提交，并在提交说明中写明接入了哪个模块。
- 如果两人直接向远端 `admin` 提交，开始共享文件前先拉取最新提交，完成后立即推送小提交。
- 不使用强制推送覆盖另一位开发者的提交。
- 后端单体文件需要双方修改时，以小提交串行进入，不在最后一次性解决大冲突。

## 13. 固定验收场景

双方至少使用以下稳定场景完成合同验收：

| 场景 | 必须验证 |
| --- | --- |
| `normal` | 正常数据可查看，不制造告警或执行需求 |
| `drought` | 缺水诊断、处方、审批、虚拟执行和评价可追踪 |
| `sensor-drift` | 诊断要求补证，不生成可执行灌溉命令 |
| `device-offline` | 设备异常通俗展示，可转检查任务 |
| 受限水源 | 分配不超过容量，缺口和原因明确 |
| 工单验收通过 | `SUBMITTED -> DONE`，保留验收人和时间 |
| 工单退回 | `SUBMITTED -> REJECTED -> IN_PROGRESS`，保留退回意见 |
| 越权访问 | 无权农场、地块和任务返回明确拒绝 |
| 正式后端离线 | 不进入未标记 Mock，显示通俗失败状态 |

演示地块和数值可以由开发者调整；场景语义和预期分流保持不变。

## 14. 开发者自主决策规则

遇到本合同没有写明的问题时，负责开发者按以下顺序自行决定：

1. 不扩大角色权限。
2. 不跨越当前农场和地块范围。
3. 不伪造正式数据或真实执行。
4. 优先保持现有接口和旧路由兼容。
5. 优先新增可选字段，而不是删除或改义已有字段。
6. 数据不足时返回不可用或空状态，不猜测结果。
7. 决策只影响自己模块时直接实施，并在提交说明中记录。
8. 决策影响本合同硬冻结内容时，先增加兼容适配，再更新下方变更记录。

## 15. 合同变更记录

发生硬冻结变更时，在同一提交中更新本表：

| 版本 | 日期 | 变更 | 原因 | 兼容措施 | 决策人 |
| --- | --- | --- | --- | --- | --- |
| `ADMIN-IFACE-1` | 2026-08-25 | 首次冻结管理员双人开发合同 | 支持 A、B 两线长期并行 | 保留现有 API 方法和 Hash 路由 | 项目负责人 |
