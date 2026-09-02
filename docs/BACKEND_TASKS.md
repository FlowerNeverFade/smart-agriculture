# 农智闭环后端任务清单

> 项目：AgriLoop（农智闭环）
> 清单版本：v1.0（2026-08-27）
> 主任务看板：[`TASKS.md`](../TASKS.md)
> 进度事实：[`PROJECT_STATUS.md`](../PROJECT_STATUS.md)
> 2026-09-02 增量记录：T-145 已将光照系统接入与灌溉一致的“估算 → 诊断 → 就绪度 → 安全确认 → 虚拟执行 → ACK/效果评价 → 回执恢复”后端闭环，当前本地实现待用户验收。

本文件从总任务看板中**单独整理后端范围**，按模块归档、标注状态，并区分「后端已完成」「联调待验收」「未开始/不在范围」。前端专属任务不在此重复展开。

---

## 1. 当前结论

| 维度 | 状态 | 说明 |
| --- | --- | --- |
| 15 天 P0 后端 | **已完成** | 数据主线、规则告警、诊断处方、虚拟执行、Agent 降级、三角色 RBAC 均已落盘 |
| P1/P2 增强切片 | **已完成（后端）** | 预测、资源协同、价值账本、决策护照、策略候选、What-if 双轨 |
| 本轮增量（T-061~T-074） | **实现完成，部分待验收** | 健康分/手册、告警冷却、成员生命周期、地块模拟策略、多指标连续性、SSE 兜底 |
| 答辩物料 | **未开始** | PPT/录屏不属于后端代码范围（T-026） |
| 真实硬件输入 | **BearPi 已接入** | E53_IA1 串口/MQTT 遥测已完成联调；其他现场网关、真实执行器仍单独验收 |
| 光照决策闭环（T-145） | **实现完成，待验收** | 动态昼夜目标、LIGHTING 诊断、就绪度/安全门、1/2/4/6/8 小时计划、离线演示分流与虚拟执行效果链路已实现；不控制真实灯具 |

**后端代码主入口**

| 路径 | 职责 |
| --- | --- |
| `apps/api-service/` | Spring Boot 模块化单体，96+ REST/SSE 端点；含进程内 `SimulationEngine` |
| `hardware/bearpi_e53_bridge.py` | 串口/MQTT 真实遥测桥接 |
| `crop-packs/` + `apps/api-service/src/main/resources/crop-packs/` | 番茄/黄瓜 Crop Pack 配置 |
| `docs/api/openapi.yaml` | 冻结接口合同 |
| `infra/` + `scripts/` | Compose、Supervisor、部署与健康检查 |

**验收证据入口**：[`docs/acceptance/REMOTE_ACCEPTANCE.md`](acceptance/REMOTE_ACCEPTANCE.md)

---

## 2. 状态总览

### 2.1 按状态统计

| 状态 | 数量 | 后端任务 ID |
| --- | --- | --- |
| 已完成 | 47 | T-002~T-025、T-027~T-039、T-040、T-043、T-047~T-048、T-050、T-053~T-057、T-059~T-060、T-067、T-073、T-074 |
| 待验收（含后端交付） | 3 | T-061、T-063、T-066 |
| 前后端混合已完成 | 4 | T-028、T-047~T-048、T-050（后端侧已验收，见各任务证据） |
| 未开始 | 1 | T-026（答辩物料，非后端开发） |

### 2.2 待验收 — 后端侧检查项

| 任务 | 后端交付内容 | 剩余验收 |
| --- | --- | --- |
| **T-061** | Crop Pack 阶段解析；`/crop-manuals`、`/plots/{id}/health`、`/plots/{id}/crop-manual`；规则/诊断/预测按阶段阈值 | Gradle 39/39 已通过；待页面手册切换与健康分展示确认 |
| **T-063** | 设备绑定即时回写；成员 `POST/PATCH/DELETE /farm-members`；地块范围 `scope` 合同 | API 38/38 已通过；待正式会话绑定/成员 CRUD 页面确认 |
| **T-066** | 告警冷却复用；`HEAT_STRESS` 规则；`POST /auth/change-password`；成员启停；巡田照片附件 `USER_PROVIDED` | API 43/43 已通过；待应用内浏览器与三角色联调确认 |
| **T-145** | `POST /lighting/estimate`、`GET /plots/{plotId}/lighting-guard`；光照诊断、决策就绪度、安全门、计划版本与虚拟执行 ACK/效果评价关联 | 定向 Gradle 4/4、前端 151/151、Vite、JS 与 OpenAPI 检查通过；待用户验收 |

---

## 3. 按模块归档

### 3.1 合同、Schema 与 Crop Pack

| ID | 优先级 | 任务 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T-002 | P0 | 冻结模块边界、事件/命令/Agent Tool 合同 | 已完成 | `apps/api-service`、OpenAPI、JSON Schema |
| T-003 | P0 | Crop Pack Schema、任务模板、继承解析 | 已完成 | `crop-packs/schema`、解析接口 |
| T-004 | P0 | 作物包 A（番茄） | 已完成 | `crop-packs/tomato` |
| T-005 | P0 | 作物包 B（黄瓜） | 已完成 | `crop-packs/cucumber` |
| T-023 | P1 | 两 Pack Schema/规则/RAG 回归 | 已完成 | Spring 回归测试 |
| T-061 | P0 | 阶段解析、综合健康分、培养手册接口 | **待验收** | 见 §2.2 |

### 3.2 数据主线（MQTT → Streams → DB → SSE）

| ID | 优先级 | 任务 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T-006 | P0 | 模拟数据生成器与 `normal` 情景 | 已完成 | API `SimulationEngine`，seed 可重复 |
| T-007 | P0 | MQTT 接入、校验、去重 | 已完成 | eventId 幂等 |
| T-008 | P0 | Redis Streams、PostgreSQL 落库 | 已完成 | Flyway v1、1,080 条回放 |
| T-009 | P0 | 心跳、质量评分、质量门控 | 已完成 | 漂移处方阻断 |
| T-059 | P0 | BearPi 串口/MQTT 与 REAL 来源仲裁 | 已完成 | `hardware/`、Flyway V5 |
| T-067 | P1 | 地块独立模拟策略、热加载、REAL 优先 | 已完成 | 五场景 JSON、远端 a01/a02 黑盒 |
| T-073 | P1 | 八项指标历史/预测连续性 | 已完成 | 连续性回归、OpenAPI 指标枚举 |
| T-074 | P1 | SSE 断线恢复与 REST 兜底合同 | 已完成 | `/events/stream`、三角色轮询联调 |

### 3.3 规则、告警与工单

| ID | 优先级 | 任务 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T-010 | P0 | Crop Pack 规则、迟滞、冷却、多风险检测 | 已完成 | WATER_DEFICIT/SENSOR_DRIFT/DEVICE_FAULT/HEAT_STRESS |
| T-011 | P0 | 告警状态机、统一工单、今日农务聚合 | 已完成 | alerts/work-orders/today-work |
| T-066 | P0 | 告警冷却生效、高温告警 | **待验收** | 同地块同规则冷却复用 |
| T-028 | P1 | 田间核验、巡田证据、人机融合 | 已完成 | inspections API、USER_PROVIDED |
| T-133 | P0 | 农户任务状态刷新与具体问题上报 | **待验收** | `POST /work-orders/{workOrderId}/report-issue` 校验执行农户、描述长度、终态和重复上报；落库关联 `FARMER_REPORT` 工单并发布 `workorder.farmer-report`，农场管理员通过既有工单 REST/SSE 接收，农户列表排除报告工单。Java Gradle 全量测试、Web 定向 26/26、Vite、差异检查和本地浏览器关键路径已通过；`main@165aefd9` 已发布，待线上功能验收 |

### 3.4 诊断、就绪度、处方与虚拟执行

| ID | 优先级 | 任务 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T-029 | P0 | 诊断 → 结构化 `irrigation_plan` 确定性链路 | 已完成 | 硬门、版本快照 |
| T-033 | P0 | 四态 `decision_readiness`、补证 | 已完成 | READY/NEEDS_EVIDENCE/HUMAN_REVIEW/UNAVAILABLE |
| T-014 | P0 | 虚拟灌溉、审批、幂等、ACK、非成功路径 | 已完成 | FAILED/TIMEOUT/PARTIAL/INCONCLUSIVE |
| T-018 | P0 | 决策台后端 contracts | 已完成 | 诊断/就绪度/处方 REST |
| T-019 | P0 | 决策账本、护照、最小双轨 | 已完成 | passport/snapshot/compare |
| T-030 | P1 | 处方-命令-ACK-效果评价关联 | 已完成 | planId/commandId/evaluationId |
| T-060 | P1 | 诊断 AI 解释层 `POST .../explain` | 已完成 | Qwen 只解释、rules-only 降级 |

### 3.5 智能体与 AI 接入

| ID | 优先级 | 任务 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T-015 | P0 | RAG 知识目录与 rules-only 回退 | 已完成 | Crop Pack knowledge |
| T-016 | P0 | 感知/诊断/处方/安全 Agent Tool | 已完成 | 白名单、trace、不可直连 SQL/MQTT |
| T-017 | P0 | AI 降级 rules-only / mock | 已完成 | degraded 字段 |
| T-043 | P0 | Agent 连续问答与账号级对话持久化 | 已完成 | `/agent/chat`、重启后历史保留 |
| T-057 | P0 | 正式问答 narrative 与降级边界 | 已完成 | 三角色 Qwen 远端验收 |

### 3.6 P1/P2 增强能力（后端）

| ID | 优先级 | 任务 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T-020 | P0 | 五类情景脚本 | 已完成 | drought/heavy-rain/sensor-drift/device-offline/evidence-conflict |
| T-021 | P1 | What-if 完整对比报告 | 已完成 | snapshot/compare，不污染主状态 |
| T-022 | P1 | 计划/实际、资源效率、价值查询 | 已完成 | plan-actual/resource/value REST |
| T-027 | P1 | 全周期计划与 task_templates | 已完成 | crop-batch plan |
| T-034 | P1 | forecast_snapshot、Time-to-Risk | 已完成 | robust-trend-v1 |
| T-035 | P1 | decision_case 与相似案例 | 已完成 | fingerprint 排序 |
| T-036 | P1 | limited-water 资源计划 | 已完成 | 900 L 硬门、INFEASIBLE |
| T-037 | P1 | value_ledger 计算与对账 | 已完成 | COMPUTED/INCOMPLETE |
| T-038 | P1 | 完整决策护照 | 已完成 | `/decision-passports/{traceId}` |
| T-039 | P2 | 策略候选发布工作流 | 已完成 | DRAFT→OFFLINE_VALIDATED→APPROVED |

### 3.7 账户、三角色与管理员 API

| ID | 优先级 | 任务 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T-047 | P0 | 注册、恢复码、凭据轮换 | 已完成 | Flyway v2/v3 |
| T-048 | P0 | 三角色收敛与 scope 迁移 | 已完成 | Flyway V4、RolePolicy |
| T-050 | P0 | 地块 CRUD 生命周期 | 已完成 | POST/PATCH/DELETE `/plots` |
| T-053 | P0 | 八项管理能力 API | 已完成 | 设备/成员/计划/Crop Pack/账本/模拟器 |
| T-054 | P0 | 跨模块统一接线 | 已完成 | 巡田→诊断、补证→工单 |
| T-056 | P0 | 正式数据闭环、演示隔离 | 已完成 | 正式会话不走 Mock 补数 |
| T-063 | P0 | 设备绑定、农户成员增删改 | **待验收** | farm-members scope |

### 3.8 部署、测试与集成

| ID | 优先级 | 任务 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T-024 | P0 | 一键启动、健康检查 | 已完成 | Compose、Supervisor、healthcheck |
| T-025 | P0 | 集成/性能/安全/RBAC 评测 | 已完成 | Gradle、smoke、1,000+ 事件 |
| T-040 | P0 | 公网部署与 Qwen 接入 | 已完成 | AutoDL 6006、`degraded=false` |

---

## 4. 核心能力 → 后端出口映射

| 能力 | 主要后端任务 | 关键接口/模块 |
| --- | --- | --- |
| CAP-01 全周期计划 | T-003、T-027 | `/crop-batches/{id}/plan` |
| CAP-02 今日农务 | T-011、T-012 | `/work-items/today` |
| CAP-03 田间核验 | T-028 | `/inspections` |
| CAP-04 根因诊断 | T-010、T-029 | `/diagnoses/evaluate` |
| CAP-05 结构化处方 | T-016、T-029 | `/irrigation/estimate` |
| CAP-06 效果验证 | T-014、T-030 | `/commands/virtual`、`/evaluation` |
| CAP-07 计划实绩 | T-022、T-030 | `/plan-actual`、`/value-ledgers` |
| CAP-08 Agent 入口 | T-016、T-017 | `/agent/chat`、`/agent/runs/{traceId}` |
| CAP-09 风险预测 | T-034 | `/plots/{id}/risk-forecast` |
| CAP-10 决策记忆 | T-035、T-039 | `/decisions/{traceId}/similar-cases` |
| CAP-11 资源协同 | T-036 | `/resource-plans/evaluate` |
| CAP-12 经营价值 | T-037 | `/value-ledgers` |
| CAP-13 决策就绪度 | T-033、T-038 | `/decisions/.../readiness`、`/decision-passports` |

---

## 5. 阶段门（后端）

| 阶段门 | 必须满足 | 当前状态 |
| --- | --- | --- |
| Gate 1 / D5 数据可流动 | 1,000+ 事件、落库、SSE、离线恢复 | **已通过** |
| Gate 2 / D11 闭环可解释 | 告警→诊断→就绪度→处方→虚拟执行→ACK→效果 | **已通过** |
| Gate 3 / D14 可答辩 | 两 Crop Pack、测试、安全、固定演示脚本 | **后端已通过**；答辩物料未制作 |

---

## 6. 后端待办与边界（非阻塞）

以下项**不在当前后端待办**，或仅作演进说明：

| 项 | 说明 |
| --- | --- |
| 统一消息中心 API | 农户消息由前端聚合 `alerts` + `work-orders` + 通知事件；不单独建消息事实表 |
| 农户端 DEVICE_OFFLINE What-if | 前端已过滤；模拟器/管理端仍保留该情景 |
| 生产级对象存储 | 巡田照片当前为本地附件引用 `USER_PROVIDED`，非 OSS |
| 真实水泵/阀门/GPIO | P2 演进方向；当前灌溉仍为虚拟执行，不计入已完成 |
| 鸿蒙端、超出 BearPi 遥测的生产级端-智-云 | 不在当前软件交付承诺范围 |

---

## 7. 本地验证命令

```bash
# 后端单元/集成测试
./gradlew :apps:api-service:test --no-daemon

# 模拟遥测已内置到 API，启动 api-service 即可；系统管理员页可调采样间隔与流速

# API 健康
curl -s http://127.0.0.1:8080/actuator/health

# 冒烟（需服务已启动）
python3 scripts/acceptance_smoke.py
```

---

## 8. 维护规则

- 后端任务状态变更时，同步更新本文件与 [`TASKS.md`](../TASKS.md)、[`PROJECT_STATUS.md`](../PROJECT_STATUS.md)。
- 「已完成」必须附 Gradle/远端/黑盒证据；仅代码落盘写「待验收」。
- 新增后端接口必须同步 [`docs/api/openapi.yaml`](api/openapi.yaml) 与相关 Schema。
- 不将前端专属任务写入本清单；混合任务在后端侧验收通过后，前端仍可在总看板单独待验收。
