# 智能诊断与决策中枢验收记录

> 验收日期：2026-08-24
>
> 验收范围：Web 决策中枢、前端 API 适配、后端就绪度一致性
>
> 数据边界：现场数据来自模拟器；情景试算明确标记为 `SIMULATED`

## 1. 实现范围

本板块把既有后端合同串成同一条可操作闭环：

```text
地块遥测快照
  -> 多候选根因与确定性置信度
  -> 支持 / 反对 / 缺失证据
  -> 四态决策就绪度与八道安全门
  -> WHAT / WHERE / WHEN / HOW MUCH 结构化补水试算
  -> READY 后当前操作人确认与幂等虚拟命令
  -> ACK / 效果评价
  -> traceId 决策护照
```

页面支持实时主状态、干旱试算、传感器漂移分流和设备离线四种上下文。低质量、漂移或离线状态仍会返回解释、参考试算和最小补证动作，但不会开放执行按钮。

## 2. 输入、处理与输出

| 环节 | 输入 | 确定性处理 | 页面输出 |
|---|---|---|---|
| 诊断 | 地块、最新遥测、质量、设备、情景 | 候选根因评分与排序 | 首要根因、候选置信度、支持/反对/缺失证据 |
| 就绪度 | 诊断、计划、数据新鲜度、质量、设备、资源、权限、上限 | 八道安全门与四态判定 | `READY` / `NEEDS_EVIDENCE` / `HUMAN_REVIEW` / `UNAVAILABLE` |
| 处方 | 诊断、阶段目标、面积、流量 | 确定性水量与时长试算 | WHAT、WHERE、WHEN、HOW MUCH、WHY、预期结果、替代方案、版本 |
| 补证 | 缺失证据与 `readinessId` | 生成受控工单 | 复测/设备检查工单编号与状态 |
| 执行 | READY 处方、角色、人工确认、幂等键 | 权限/确认/容量/冷却/上限校验 | 命令、ACK、实际量与效果评价 |
| 审计 | 同一 `traceId` | 聚合观测、诊断、就绪度、处方、命令和评价 | 决策护照及来源标签 |

## 3. 关键失败与降级路径

- `sensor-drift`：诊断安全门为 `FAIL`，状态为 `NEEDS_EVIDENCE`，创建流量计校准/便携仪复测工单，不可下发灌溉。
- `device-offline`：设备健康与新鲜度失败，状态为 `UNAVAILABLE`，保留解释和参考试算。
- 农户角色：拥有授权地块的 `irrigation:execute` 能力；通过安全门并完成当前操作人确认后可直接执行虚拟灌溉。
- 后端离线：使用同合同的本地演示算法，所有情景与执行结果标记为模拟，不冒充现场事实。
- 命令非成功：`PARTIAL`、`FAILED`、`TIMEOUT` 分别展示；效果不足时不标记 `COMPLETED`。

## 4. 自动化验收证据

| 验收项 | 命令 | 结果 |
|---|---|---|
| Java 编译与单元测试 | `gradlew :apps:api-service:test --rerun-tasks --no-daemon` | 14/14，通过 |
| Web 真实 ECharts 回归 | `node scripts/verify-webui.mjs real` | 79/79，通过 |
| Web ECharts stub 回归 | `node scripts/verify-webui.mjs stub` | 78/78，通过 |
| Web SVG 降级回归 | `node scripts/verify-webui.mjs svg` | 78/78，通过 |
| JavaScript 语法检查 | `node --check`（`app.js`、`api.js`、`decision-console.js`、验证脚本） | 通过 |
| 本地 JAR 黑盒 | 登录后调用诊断、处方、就绪度、护照、命令和评价 REST | 通过；standalone 健康状态 `UP` |

专项断言包括：

- 6 张实时指标卡、3 个根因候选、3 类证据、4 种就绪状态、8 道安全门；
- 结构化处方的 WHAT/WHERE/WHEN/HOW MUCH；
- 漂移场景不能执行且可以创建最小补证工单；
- 合格实时数据恢复 `READY`；
- 人工确认后命令、ACK、效果和决策护照可见；
- 后端将诊断安全与登录角色权限纳入就绪度，不再出现“处方已阻断但再次查询就绪度为 READY”的不一致。
- 决策护照按 trace 解析所属地块并执行 RBAC 校验，无权地块读取会被拒绝。

黑盒关键结果：`SENSOR_DRIFT -> NEEDS_EVIDENCE / diagnosisSafety=FAIL / executable=false`；新鲜合格数据则为 `WATER_DEFICIT -> READY / executable=true -> ACK SUCCEEDED -> evaluation COMPLETED`。

## 5. 公网部署验收

- 运行代码：`b0aefa9`（中枢页面）+ `405930d`（按指标校准跳变检测与稳定 smoke）。
- 公网入口：`https://u558871-7873be733236.westd.seetacloud.com:8443/agriloop/`，主页和 `decision-console.js` 均返回 HTTP 200。
- `scripts/acceptance_smoke.py` 经公网域名调用返回 `status=PASS`：12 条遥测全部接收、重复事件 `duplicate=true`、诊断 `WATER_DEFICIT`、处方 `READY`、失败命令效果 `INCONCLUSIVE`、决策护照可查询。
- 漂移专项返回 `SENSOR_DRIFT -> NEEDS_EVIDENCE`，`diagnosisSafety=FAIL` 且 `executable=false`；规则硬门没有因降低误报而被绕过。
- Qwen 专项返回 `adapter=openai-compatible`、`llm.model=agriloop-qwen38-agri`、`degraded=false`；同一账号会话随后可读取 2 条持久化消息。
- Supervisor 中 API、模拟器、Nginx、Cron 和 Qwen/vLLM 均为 `Running`，`GET /actuator/health` 返回 `UP`。

## 6. 代码位置

- 页面模块：`apps/web-ui/js/modules/decision-console.js`
- 页面样式：`apps/web-ui/css/modules/decision-console.css`
- API 适配：`apps/web-ui/js/api.js`
- 后端安全门：`apps/api-service/src/main/java/com/agriloop/AgriApplication.java`
- 自动化回归：`scripts/verify-webui.mjs`

本记录只证明当前代码与模拟环境下可复现的诊断/决策功能；不代表真实阀门或现场灌溉执行器已完成。BearPi E53_IA1 的真实遥测接入以独立硬件记录和事件来源字段为准。
