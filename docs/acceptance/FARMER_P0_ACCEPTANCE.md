# 农户端 P0 创新缺口验收记录

> 验收日期：2026-08-28
> 分支：`main`
> 范围：模拟数据、虚拟执行器和本地页面；不代表真实传感器、水泵或现场网关已经接入。

## 1. 验收结论

I-01/I-02、I-03、I-04、I-05、I-07/I-13、I-08、I-10/I-11、I-28、I-29 已形成可复现的农户端演示闭环。I-06/I-12、I-14、I-15 回归通过。在模拟数据源且就绪度满足安全门时，农户可确认并执行 `FARMER_VIRTUAL` 虚拟浇水；真实设备或证据不足仍转人工/管理员，不改变真实资源账本。

| 编号 | 实际实现 | 验收结果 |
| --- | --- | --- |
| I-01/I-02 | 地块详情展示 8 类指标；按 Crop Pack 阶段切换目标带，预览不修改真实批次；无定义指标显示 `UNAVAILABLE` | 通过 |
| I-03 | 指标卡展示新鲜度、30 分钟时间窗完整率、可信度和质量状态；正式数据由后端确定性计算，演示数据使用明确的模拟质量口径 | 通过 |
| I-04 | 诊断分别展示支持、反对、缺失证据、来源、时间和冲突提示 | 通过 |
| I-05 | 展示触发阈值、复位阈值、迟滞状态、冷却起止、剩余秒数和最近有效命令；失败/超时不进入冷却 | 通过 |
| I-07/I-13 | 相同冻结快照和 seed 的 `EXECUTE/NO_ACTION` 双轨曲线、最终湿度和风险时间；比较只读 | 通过 |
| I-08 | 管理员审批路径仍可由 `REQUEST_APPROVAL` 幂等创建 `IRRIGATION_REVIEW` 并加载原处方；农户可只读查看审批、命令、ACK、实际水量和效果评价 | 通过 |
| I-10/I-11 | QA 按 trace 展示知识片段、范围、版本、工具入参/出参、Schema 校验和耗时；降级模式明确标为 `mock/rules-only` | 通过 |
| I-28 | 就绪度展示缺失证据和最小补证动作，补证工单使用幂等键 | 通过 |
| I-29 | 灌溉系统确认后直接调用虚拟执行器；返回 ACK/评价，并回写土壤湿度上升、水库水位下降的模拟遥测 | 通过 |

## 2. API 与安全证据

- `GET /api/v1/plots/{plotId}/irrigation-guard`：统一返回迟滞与冷却保护状态。
- `GET /api/v1/irrigation/plans/{planId}`：按地块权限读取原处方。
- `POST /api/v1/decisions/{traceId}/feedback`：校验 trace/plan/plot 和幂等键，返回审批工单 ID。
- `POST /api/v1/scenarios/compare`：校验地块权限，返回冻结快照和双轨分支，不写回遥测。
- `POST /api/v1/commands/virtual`：校验农户地块权限、模拟来源、设备在线、就绪度、用水上限、冷却和幂等键；`executionMode=FARMER_VIRTUAL` 成功后返回 ACK/评价及 `sensorEffect`。
- 命令、评价和决策护照按地块鉴权；跨地块读取返回拒绝。
- 冷却只从持久化 `SUCCEEDED/PARTIAL` ACK 推导；`FAILED/TIMEOUT` 不触发冷却。
- 虚拟浇水成功/部分成功时仅写入 `SIMULATION` 来源的土壤湿度和水库水位遥测，记录 before/after、命令 ID 和 `VIRTUAL_ACTUATOR` 追溯信息。

## 3. 自动化结果

| 验证 | 结果 |
| --- | --- |
| `gradlew :apps:api-service:test --tests ...farmerVirtualIrrigationUpdatesSoilAndReservoirWithoutAdminWorkOrder` | `compileJava` 通过；测试依赖下载因 Maven Central TLS 握手失败，未完成执行 |
| `npm test` | 64/64 通过 |
| `python -m unittest simulator.test_runner` | 3/3 通过 |
| `python -m py_compile simulator/runner.py` | 通过 |
| `npx vite build` | 通过；仅保留既有 Vue/ECharts 非模块脚本提示 |
| JavaScript 语法检查 | `farmer.js`、`api.js`、管理员审批模块通过 |
| OpenAPI YAML 解析 | 通过 |

后端覆盖迟滞边界、有效/无效冷却结果、审批幂等、跨地块拒绝、双轨只读、审批—处方—命令—ACK—评价关联及农户虚拟浇水遥测回写。前端覆盖演示保护状态、双轨、Agent 审计、审批工单幂等和农户确认后虚拟执行。

## 4. 浏览器集中验收

复用 `http://127.0.0.1:3000/farmer.html` 的现有标签完成一次集中验收：

1. 地块页切换“果实成熟期/苗期”，目标带从土壤湿度 `20～40%` 更新为 `30～50%`，真实批次保持不变。
2. 8 类指标卡均渲染；已有指标展示质量字段，无数据指标显示 `UNAVAILABLE`。
3. 灌溉页展示支持/反对/缺失证据、就绪度、迟滞 `TRIGGERED` 和冷却 `AVAILABLE`。
4. 干旱情景展示 seed 42 的执行/不执行双轨，最终湿度分别为 21.22% 和 9.04%，且标明只读。
5. 农户确认虚拟浇水后获得命令 ACK/评价，执行证据显示 `FARMER_VIRTUAL`、实际水量、土壤湿度 before/after 和水库水位 before/after；重复确认复用幂等结果。
6. QA 审计展开后展示 2 条知识片段和 4 次工具调用，包含入参、出参、Schema 与耗时。
7. 390px 窄屏导航、单列指标卡和弹层复测通过；恢复桌面视口后页面结构正常。
8. 浏览器控制台 warning/error 均为 0。

## 5. 失败与降级边界

- 指标未声明或没有遥测时显示 `UNAVAILABLE`，不生成目标范围或曲线。
- 数据漂移、设备故障、低质量或证据不足时阻断可执行处方并引导补证/人工复核。
- 重复审批和补证请求复用幂等结果，不重复创建工单。
- 跨地块读取处方、命令、ACK、评价或双轨比较被拒绝。
- LLM/RAG 不可用时展示 `rules-only/mock`，不伪装为模型结果。
- 本记录中的观测和执行证据均为 `SIMULATED/DERIVED`；真实硬件闭环不在当前验收范围。
- `FARMER_VIRTUAL` 仅用于本地模拟测试，不代表真实水泵、阀门、传感器或现场网关已经接入。
