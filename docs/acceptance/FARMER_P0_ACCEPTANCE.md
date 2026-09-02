# 农户端 P0 创新缺口验收记录

> 历史验收日期：2026-08-28；本轮安全门修复：2026-09-02
> 分支：`farmer-ui`
> 范围：模拟数据、虚拟执行器、本地页面和服务器发布验收；不代表真实传感器、水泵或现场网关已经接入。

## 1. 验收结论

I-01/I-02、I-03、I-04、I-05、I-07/I-13、I-08、I-10/I-11、I-28 已形成可复现的农户端演示闭环。I-06/I-12、I-14、I-15 回归通过。当前规则调整为：农户和农场管理员均可在安全门通过并完成当前操作人确认后执行虚拟灌溉；不要求管理员审批，真实水泵仍不在本期范围。2026-09-02 本地修复把正常低风险人工灌溉中的证据冲突降为提醒，但没有删除证据或审计记录；异常/漂移、坏数据、过期遥测、设备离线、暴雨、资源/权限/时长不通过及自动/应急完整安全门不足时仍阻断。线上未重新发布。

| 编号 | 实际实现 | 验收结果 |
| --- | --- | --- |
| I-01/I-02 | 地块详情展示 8 类指标；按 Crop Pack 阶段切换目标带，预览不修改真实批次；无定义指标显示 `UNAVAILABLE` | 通过 |
| I-03 | 指标卡展示新鲜度、30 分钟时间窗完整率、可信度和质量状态；正式数据由后端确定性计算，演示数据使用明确的模拟质量口径 | 通过 |
| I-04 | 诊断分别展示支持、反对、缺失证据、来源、时间和冲突提示；冲突即使降为提醒也保留在诊断和审计记录 | 通过 |
| I-05 | 展示触发阈值、复位阈值、迟滞状态、无时间冷却的可用状态、最近有效命令和低于 10% 自动浇水状态；失败/超时不改变湿度 | 通过 |
| I-07/I-13 | 相同冻结快照和 seed 的 `EXECUTE/NO_ACTION` 双轨曲线、最终湿度和风险时间；比较只读 | 通过 |
| I-08 | 农户和管理员均可对 `READY` 处方完成当前操作人确认并直接创建虚拟命令；正常低风险人工灌溉允许 `advisoryEvidence`，自动/应急仍需完整安全门；命令、ACK、实际水量和效果评价进入只读决策护照 | 待本轮集中验收 |
| I-10/I-11 | QA 按 trace 展示知识片段、范围、版本、工具入参/出参、Schema 校验和耗时；降级模式明确标为 `mock/rules-only` | 通过 |
| I-28 | 就绪度区分 `blockingEvidence`/`advisoryEvidence`；补证按地块+证据类型+未完成工单去重，申请后只提示工单状态，巡田/复测保存后重新生成处方并读取最新 readiness | 待本轮集中验收 |

### 1.1 本轮安全门简化与补证闭环

- readiness 合同统一返回 `blockingEvidence`、`advisoryEvidence` 和 `executionAllowed`；`missingEvidence`、`conflicts` 继续作为兼容及审计字段，前端不再用 `missingEvidence` 直接禁用执行。
- 仅在新鲜且 `GOOD` 的土壤湿度、设备在线、无高置信漂移/故障、非暴雨、资源/权限/时长通过、湿度不低于 Crop Pack 自动浇水阈值且模式为 `OPERATOR_CONFIRMED` 时，把 `MORE_DIAGNOSIS_EVIDENCE` 和 `HUMAN_EVIDENCE_REVIEW` 放入提醒；自动浇水和应急路径不适用此降级。
- 普通巡田没有便携仪值时只保存现场观察；`RETEST` 必须填写便携仪值。匹配复测将旧冲突标记为 `RESOLVED`，不匹配复测将旧冲突标记为 `SUPERSEDED`，不会删除历史证据。
- 线上/正式 API 与演示 API 使用同一字段和行为；本期只验证模拟数据、数据库记录和虚拟执行，不涉及真实硬件或线上发布。

## 2. API 与安全证据

- `GET /api/v1/decisions/{subjectType}/{subjectId}/readiness`：返回 `blockingEvidence`、`advisoryEvidence`、`executionAllowed`、兼容 `missingEvidence`/`conflicts` 和 `policyVersion=readiness-v2`。
- `GET /api/v1/plots/{plotId}/irrigation-guard`：统一返回迟滞、无时间冷却的灌溉可用状态和自动浇水阈值。
- `POST /api/v1/irrigation/auto`：对低于 10% 的合格土壤遥测发起虚拟浇水；同一事件只按幂等键处理一次。
- `GET /api/v1/irrigation/plans/{planId}`：按地块权限读取原处方。
- `POST /api/v1/decisions/{traceId}/feedback`：旧审批申请合同继续校验 trace/plan/plot 和幂等键；当前灌溉建议改用 `POST /api/v1/commands/virtual`，携带 `confirmed=true` 和幂等键。
- `POST /api/v1/commands/virtual`：农户和管理员均可在授权地块对 READY 处方直接创建虚拟灌溉命令；不创建管理员审批工单。
- `POST /api/v1/scenarios/compare`：校验地块权限，返回冻结快照和双轨分支，不写回遥测。
- 命令、评价和决策护照按地块鉴权；跨地块读取返回拒绝。
- 灌溉命令不从 ACK 推导时间冷却；`FAILED/TIMEOUT` 仍不会改变土壤湿度，告警静默期与执行保护分开计算。

## 3. 自动化结果

| 验证 | 结果 |
| --- | --- |
| `gradlew :apps:api-service:compileJava/compileTestJava --no-daemon` | 通过；后端与新增定向测试可编译。当前中文工作区路径下 Gradle Test worker 对测试类报告 `ClassNotFoundException`，不是断言结果；同一新增定向测试在 ASCII 驱动映射路径下 3/3 通过 |
| `npm test -- --test-name-pattern="灌溉|巡田|补证|readiness|安全门|evidence"` | 17/17 通过；覆盖正常冲突提醒、匹配复测、补证去重和前端刷新相关场景 |
| `npx vite build` | 通过（78 modules transformed）；仅保留既有 Vue/ECharts 非模块脚本提示 |
| `node scripts/verify-webui.mjs svg` / `stub` / `real` | 30/30、31/31、31/31 通过；脚本退出码为 0，JSDOM 收尾提示为既有测试清理噪声 |
| JavaScript 语法检查 | `roles.js`、`api.js`、`farmer.js`、`live-data.js`、管理员决策模块和共享入口通过 |
| OpenAPI YAML 解析 | 通过 |

后端覆盖迟滞边界、有效/无效冷却结果、旧审批幂等、直接执行权限、命令幂等、跨地块拒绝、双轨只读和处方—命令—ACK—评价关联。前端覆盖演示保护状态、双轨、Agent 审计、当前操作人确认和农户直接执行调用。

## 4. 浏览器集中验收

本轮未将浏览器或线上页面点击写成通过：工作区没有运行中的 `127.0.0.1:4173` 页面；对用户提供的线上地址仅做只读加载尝试并超时。由于本轮未发布，未登录、未创建工单、未确认虚拟浇水。以下清单保留给后续本地页面可用时的一次集中验收：

1. 地块页切换“果实成熟期/苗期”，目标带从土壤湿度 `20～40%` 更新为 `30～50%`，真实批次保持不变。
2. 8 类指标卡均渲染；已有指标展示质量字段，无数据指标显示 `UNAVAILABLE`。
3. 灌溉页展示支持/反对/缺失证据、就绪度、迟滞 `TRIGGERED`、无时间冷却 `AVAILABLE` 和自动浇水阈值。
4. 干旱情景展示 seed 42 的执行/不执行双轨，最终湿度分别为 21.22% 和 9.04%，且标明只读。
5. 农户完成当前操作人确认后直接获得虚拟命令；只读页显示命令、ACK、实际用水和效果状态，不创建管理员审批工单，也没有“填写执行成功”入口。
6. QA 审计展开后展示 2 条知识片段和 4 次工具调用，包含入参、出参、Schema 与耗时。
7. 390px 窄屏导航、单列指标卡和弹层复测通过；恢复桌面视口后页面结构正常。
8. 浏览器控制台 warning/error 均为 0。
9. “我的地块”点击地块后展示当前模拟策略、场景芯片、参数摘要和策略预测曲线；策略卡只读，修改仍留在管理员侧。

## 5. 服务器发布验收

- 发布提交：`e8187ed`（`feat: allow direct farmer irrigation execution`）。
- 发布目录：`/srv/agriloop/app`、`/srv/farmer/app`、`/srv/farm-admin/app`、`/srv/system-admin/app`；四处 `DEPLOYED_COMMIT` 均指向该提交。
- 发布前数据库备份：`/srv/agriloop/backups/agri-20260828-114934.sql.gz`。
- 公网农户入口返回 HTTP 200，前端脚本包含“查看建议并执行”，不包含旧“查看建议并提交审批”文案；公网 `/actuator/health` 返回 `UP`。
- 角色黑盒复核：农户 `irrigation:execute=true`、`irrigation:approve=false`；农场管理员两项权限均为 `true`。农户未获得管理员审批能力，管理员仍可保留旧审批流程兼容入口。
- API 与模拟器由 Supervisor 正常运行；本期执行仍是虚拟命令，未在公网触发灌溉或修改在线演示数据。

## 6. 失败与降级边界

- 指标未声明或没有遥测时显示 `UNAVAILABLE`，不生成目标范围或曲线。
- 数据漂移、设备故障、坏/过期数据、设备离线、暴雨、资源/权限/时长限制或自动/应急安全门不足时阻断可执行处方；只有满足低风险人工确认条件时，证据不足/人工冲突才降为黄色提醒，证据本身仍保留。
- 补证申请创建后不宣称安全门已解除；匹配复测才会把旧冲突标记为 `RESOLVED`，新冲突则只让最新记录保持有效。普通巡田没有便携仪值时不伪造复测。
- 重复直接执行、旧审批和补证请求均复用幂等结果；直接执行不重复创建命令或审批工单。
- 跨地块读取处方、命令、ACK、评价或双轨比较被拒绝。
- LLM/RAG 不可用时展示 `rules-only/mock`，不伪装为模型结果。
- 本记录中的观测和执行证据均为 `SIMULATED/DERIVED`；真实硬件闭环不在当前验收范围。
