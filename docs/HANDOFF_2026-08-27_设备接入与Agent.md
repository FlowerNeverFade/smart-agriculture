# 2026-08-27 开发交接文档：设备接入、双向绑定、告警核查与可执行 Agent

## 1. 交接目的

本文档用于交接本日对 AgriLoop（农智闭环）项目完成的开发工作。接手同学可直接从当前本地 `main` 分支继续，不需要重新设计本轮功能。

本轮本地代码已完成实现、Node 回归和 Vite 构建，并已在 2026-08-28 原地升级现有服务器；公网黑盒和 Java/Gradle 服务器编译均已完成。

## 2. 当前代码状态

- 仓库：`smart-agriculture-main-local`
- 分支：`main`
- 最近功能提交：`cdca92f fix: enable agent action confirmation buttons`
- GitHub 同步提交：`4e9326a merge: integrate latest GitHub main`，已推送到 `origin/main`（合并前远端为 `34a6a11`）
- 服务器运行发布仍为已验收的 `cdca92f`，本次 GitHub 同步未改变服务器运行版本
- 工作区：提交后无未提交改动（接手前请重新执行 `git status` 确认）
- 本地预览入口：`http://127.0.0.1:4173/login.html`
- 服务器路径：`/srv/agriloop`、`/srv/farm-admin`
- SSH：`connect.westd.seetacloud.com:22602`
- 服务器状态：已完成原地升级并通过公网验收；后续变更仍需先备份并保留回滚点。

## 2026-08-30 追加：告警智能处理与独立 AI 助手

- 农场管理员左侧导航已拆分为“告警智能处理”和独立“AI助手”；`ai-assistant` 仅加入 `FARM_ADMIN` 视图白名单，农户与系统管理员不会看到该入口。
- `RoleAwareDecisionConsoleView` 不再包含 AI 对话 tab，告警组件只处理待审核、已下发、已关闭和全部进行中的告警业务。旧 `decision-console&section=chat`、`highlight=chat`、`tab=assistant` 地址会保留农场/地块上下文并跳转到 `ai-assistant`。
- AI 助手读取正式接口 `GET /api/v1/agent/conversations?limit=20` 与 `GET /api/v1/agent/history?conversationId=&limit=60`；演示模式使用 `agriloop_agent_conversations:<actorId>` 本地存储，按账号隔离，最多保留 50 个会话、每个会话 60 条消息。新会话首条消息自动生成 36 字标题。
- 回答 UI 固定分为“已知事实、分析判断、执行建议”。已知事实只从 Agent 的 `result/diagnosis/plan/tools/knowledgeEvidence` 等结构化响应投影；没有返回的指标不补造，规则降级会明确标注。
- Agent 写操作预览、确认/取消、幂等和 `data-invalidated` 事实域刷新逻辑保持原合同；确认后仍通过 `plots/devices/workOrders/alerts/overview` 域刷新全平台。
- 本轮只完成本地代码、测试与文档，未部署服务器、未操作真实 BearPi、未推送 GitHub。接手后先运行 Web 回归和 Vite 构建，再做管理员桌面/窄屏浏览器验收。

## 3. 本日完成内容

### 3.1 设备接入与安全开关

1. 修复真实设备数据到达后设备与设施页面白屏的问题。
   - 根因是设备模板使用了未暴露的 `sourceLabel`。
   - 已将来源标签正确暴露到设备组件，并保留空数据到真实数据到达的渲染边界。

2. 新增设备接入方式。
   - 新建设备表单增加“接入方式”：`模拟设备`（默认）和 `真实设备`。
   - 模拟设备写入 `sourceMode=SIMULATION`、`dataOrigin=SIMULATOR`。
   - 真实设备写入 `sourceMode=REAL`、`dataOrigin=HARDWARE`。
   - 未绑定设备仍不能控制，页面提示先绑定地块；未知来源历史设备仍禁用，避免误操作真实硬件。

3. 修复历史管理页设备来源。
   - 启动时只补标 `registeredBy` 非空且来源字段缺失的管理页历史设备为模拟设备。
   - BearPi/硬件来源和遥测自动发现设备不参与补标。

4. 设备开关逻辑保持安全边界。
   - 模拟设备：切换后立即更新状态，离线时暂停模拟遥测，重新上线后恢复。
   - 真实设备：发送 MQTT 控制命令，显示“正在开启/正在关闭”，收到 ACK 后才更新实际 `status`；失败/超时保留原状态并记录错误。
   - 重复点击使用幂等键，避免重复命令。
   - 设备详情页增加开关、来源、控制状态、错误信息和地块选择。
   - 本轮没有把设备开关与灌溉执行命令混用，也没有新增批量开关。

### 3.2 地块与设备双向绑定

1. 农场总览的地块编辑弹窗增加多选设备列表。
   - 每台设备显示：当前地块、未绑定或已绑定其他地块。
   - 一个地块可以绑定多台设备；一台设备只能属于一个地块。

2. 支持直接转移设备。
   - 选择已绑定其他地块的设备时显示原地块。
   - 保存前二次确认，确认后直接转移，不要求先解绑。
   - 被移除/转移的设备状态重置为离线，等待新地块心跳或模拟开关重新确认。

3. 设备详情页始终可以选择地块并直接换绑；旧的单设备绑定/解绑接口继续兼容。

4. 新增后端接口：

```text
PUT /api/v1/plots/{plotId}/devices
Body: { "deviceIds": ["device-a", "device-b"] }
```

后端统一校验管理员权限、农场归属、地块状态和设备归属，并发布设备、地块、总览更新事件。

### 3.3 告警单条核查流程

1. 每张待处理告警卡片和告警详情弹窗都增加“发布核查任务”按钮。
   - 不需要先点击 AI 智能处理。
   - 每条按钮有独立 loading 状态，不会阻塞其他告警。
   - 重复点击幂等返回已存在的核查任务。

2. 新增后端接口：

```text
POST /api/v1/alerts/{alertId}/verification-task
Body: { "idempotencyKey": "..." }
```

后端按地块权限、农户在岗状态、当前任务负载和历史地块经验选择执行人。

3. 保留两个批量入口：
   - “一键发布核查任务”：管理员主动批量发布。
   - “AI 智能处理”：高可信告警自动下发处置任务，低可信/证据不足告警进入现场核查。

4. 核查验收统一由后端决定后续动作。
   - `verificationResult=CLEARED_NORMAL`：关闭原告警。
   - `verificationResult=CONFIRMED_ABNORMAL`：自动创建并分配处置任务。
   - 验收未通过：核查工单返工。
   - 前端 `work-order-lifecycle.js` 会优先使用后端返回的 `verificationResolution`，避免前端自行推断事实。

### 3.4 可执行 AI Agent

1. Agent 从单纯问答升级为受控操作预览模式。当前白名单写工具：
   - `create_plot`
   - `update_plot`
   - `set_plot_devices`
   - `create_and_assign_work_order`
   - `publish_alert_verification`
   - `close_alert`

2. Agent 行为规则：
   - 缺少地块、设备、任务、告警或执行人等必要信息时先追问。
   - 信息完整后只生成“操作预览卡片”，不直接写入。
   - 管理员必须在对话中点击“确认执行”或“取消”。
   - 提案有效期 10 分钟；过期后需要重新生成。
   - 确认时后端重新校验权限、农场范围、当前对象状态和幂等键，禁止篡改前端参数。
   - 未指定执行人时由后端推荐农户，并返回分配依据。
   - Agent 不生成任意 SQL、HTTP 地址或 MQTT Topic。
   - 第一版不允许 Agent 开关设备或执行灌溉，物理控制继续留在专用安全页面。

3. 新增后端接口：

```text
POST /api/v1/agent/actions/{actionId}/confirm
POST /api/v1/agent/actions/{actionId}/cancel
```

每次提案会保存工具输入、确认人、执行结果和失败原因，并发布数据刷新事件。

4. 前端 AI 对话页增加紧凑的操作预览卡片，显示动作类型、关键参数、状态、确认和取消按钮；执行完成后刷新相关的地块、设备、任务和告警数据。

## 4. 主要修改文件

### 后端

- `apps/api-service/src/main/java/com/agriloop/AdminManagementService.java`
  - 设备来源默认值与历史补标、直接换绑、多设备集合绑定、告警核查任务、Agent 执行工具。
- `apps/api-service/src/main/java/com/agriloop/AgriApplication.java`
  - 新增路由、Agent 预览/确认/取消、核查验收闭环和工具白名单。

### 前端

- `apps/web-ui/js/api.js`
  - 设备来源、地块设备集合绑定、演示模式告警核查、Agent 确认/取消。
- `apps/web-ui/js/app.js`
  - 地块编辑与设备多选、换绑确认、跨模块刷新。
- `apps/web-ui/js/modules/admin-resource-center.js`
  - 新建设备接入方式、设备详情换绑、来源和控制状态展示。
- `apps/web-ui/js/admin-alerts.js`
  - 单条发布核查任务、批量核查、幂等与独立加载状态。
- `apps/web-ui/js/work-order-lifecycle.js`
  - 核查结果传给后端并读取后端统一结论。
- `apps/web-ui/js/modules/admin-ai-chat.js`
  - Agent 操作预览、确认/取消、执行后数据域刷新。
- `apps/web-ui/css/modules/admin-ai-chat.css`
  - Agent 操作卡片样式。
- `apps/web-ui/index.html`
  - 地块编辑弹窗设备多选布局。

### 文档与测试

- `docs/api/openapi.yaml`：新增设备/地块/告警/Agent API 描述。
- `PROJECT_STATUS.md`、`TASKS.md`：增加本轮 T-083 记录。
- `apps/web-ui/test/api-session.test.js`：增加设备来源、地块设备转移、Agent 预览与幂等确认测试。

## 5. 已完成的本地验证

- Web Node 回归：`61/61` 通过。
- Vite 生产构建：通过。
- 关键前端文件 `node --check`：通过。
- `git diff --check`：通过。
- Java/Gradle：本地环境只有 JRE，未完成本地 Java 编译；需服务器恢复后执行 Gradle 编译和后端回归。

## 6. 服务器部署状态

2026-08-28 已完成现有服务器原地升级：

- 备份目录：`/srv/backups/agriloop-20260828-110354`（含两套目录、环境文件、Supervisor 配置和当前可运行 JAR；未记录任何凭据）。
- 发布代码：本地 `main@cdca92f`，同步 `/srv/agriloop` 与 `/srv/farm-admin`，两套目录 `DEPLOYED_COMMIT` 均为 `cdca92f`。
- `:api-service:test` 53/53、`bootJar`、本地 Web Node 61/61、Vite 构建通过；Supervisor 的 API、模拟器、Nginx、cron、Qwen 服务均 RUNNING，公网 `/actuator/health` 为 `UP`。
- 公网黑盒通过：模拟设备绑定后在线/离线幂等控制、设备详情与地块编辑跨地块转移、单条告警核查幂等、核查正常自动关闭告警、Agent 创建地块/创建任务预览确认、取消、幂等和 FARMER 越权 403。
- 验收数据留存：Agent 创建的“名称 Agent验收临时地块”已停用；因模拟器产生遥测历史而不能物理删除，验收模拟设备均已解绑，后续清理前请保留该依赖记录。
- 额外修复 `601fe08`：真实设备首次遥测不再被初始化的 OFFLINE 控制状态误抑制，只有存在实际控制命令后才按确认离线保护。
- 额外修复 `cdca92f`：运行时编译的 AI 对话组件不再把 `ref` 对象直接绑定到 `disabled`，确认执行和取消按钮恢复可点击；确认后仍通过 `data-invalidated` 刷新地块、设备、任务、告警和总览数据域。历史元数据不完整的地块支持字段级局部修改。
- 未操作真实 BearPi；GitHub `main` 已完成非强制推送，未改写既有历史。

## 6.1 2026-08-28 AI 配水与自动灌溉重构（本地收尾）

- 本地 `main` 已增加固定日配额、按农场/业务日期的水量余额、`water-allocation-v2` 确定性配水、整批确认/取消/人工调整、模拟灌溉自动排程和人工兜底任务。
- 新增接口：`GET/PUT /api/v1/resource-profiles/water`、`GET /api/v1/resource-plans`、`PATCH /api/v1/resource-plans/{id}`、`POST .../{id}/confirm`、`POST .../{id}/cancel`；旧 `POST /resource-plans/evaluate` 的 `demands` 试算保持兼容，`mode=AUTO` 生成整批草案。
- 管理员资源安排页和农户灌溉页均读取后端计划事实；人工灌溉提交记录实际水量与水源，外部水源不扣蓄水池余额；资源、命令、评价、工单和账本事件会刷新相关页面。
- 本地 Web Node 回归 `61/61`、Vite 构建和 `git diff --check` 已通过；本地没有 JDK 17，Java 编译由服务器执行。
- 服务器本轮已在 `/srv/backups/20260828-153155` 完成 `/srv/agriloop` 与 `/srv/farm-admin` 备份；后端源码已同步并通过 `:api-service:test` 54/54、`bootJar`，管理员静态资源已同步，API/模拟器已恢复运行且健康检查为 `UP`。服务器公网浏览器黑盒尚未完成，后续仍需在可用窗口复核；不得记录或传播任何凭据，不操作真实 BearPi。

## 7. 接手同学优先级

### P0：服务器恢复后的验证与部署

- 检查 SSH、服务进程、环境变量和数据库迁移状态。
- 备份后同步代码并完成 Gradle/Vite 构建。
- 先验证模拟设备，不要用真实 BearPi 做开关测试。

### P1：功能验收

- 新建设备默认“模拟设备”且绑定地块后可立即控制。
- 新建真实设备显示等待 MQTT ACK，不得前端伪造状态。
- 地块编辑可绑定多台设备，跨地块转移有确认且原地块解绑。
- 每条告警可单独发布核查任务，重复点击不产生重复工单。
- 核查正常关闭告警，核查异常自动生成处置任务，退回进入返工。
- Agent 缺参追问、预览、确认、取消、过期、越权和幂等行为正确。

### P2：后续增强

- 如需生产硬件控制，补齐 BearPi 端真实 MQTT ACK、超时和断线恢复验收。
- 如需更多 Agent 工具，必须先补后端白名单、权限校验、幂等和确认卡片，不允许前端直接拼接接口。
- 服务器验收结果应回写 `PROJECT_STATUS.md`、`TASKS.md` 和本交接文档。

## 8. 安全与边界提醒

- 本文档不记录 SSH 密码、JWT、数据库密码或 MQTT 凭据。
- `status` 表示真实已确认状态；真实设备在 ACK 前不能乐观更新。
- 未知来源设备不能通过前端强制开启。
- Agent 的每个写操作必须逐项确认；不能因为对话看起来明确就绕过确认。
- 设备控制、灌溉执行和 Agent 任务管理是不同权限/业务边界，不要合并成一个前端按钮。

## 9. 交接结论

本日代码开发目标已落地并完成远端验收，服务器当前发布为 `main@cdca92f`；本地 `main` 已通过 `4e9326a` 与 GitHub 主分支同步。后续只需按用户页面集中验收；不要重新实现本轮功能，也不要操作真实 BearPi。
