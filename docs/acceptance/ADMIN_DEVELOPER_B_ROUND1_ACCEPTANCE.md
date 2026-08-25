# 农场管理员并行开发：开发者 B 第一轮验收

验收日期：2026-08-25

目标分支：`feat/admin-plot-management`
范围依据：`admin-parallel-development-plan (1).md`、`admin-interface-freeze.md`

## 1. 本轮范围

只完成开发者 B 的第一轮任务：

1. 地块诊断、灌溉剂量试算、决策就绪度；
2. 人工明确确认、虚拟命令、ACK、效果评价、决策护照；
3. 多地块需水量/优先级确认、水资源容量试算、缺口和未满足原因展示。

本轮没有实现开发者 A 的告警、正式工单生命周期、人员、设备、生产计划；也没有提前实现第二轮的农场切换、Crop Pack 查看、价值账本和模拟器控制。

## 2. 固定业务链路

```text
evaluateDiagnosis(plotId)
  -> estimateIrrigation({ plotId, diagnosisId })
  -> getDecisionReadiness(...)
  -> 当前操作人勾选确认
  -> executeIrrigation(planId, plotId, { approved: true })
  -> 轮询 getCommand(commandId)
  -> getCommandEvaluation(commandId)
  -> getDecisionPassport(traceId)
```

- 正式模式缺少 `plotId` 时返回 `PLOT_CONTEXT_REQUIRED`，不再默认使用 A01。
- `SENSOR_DRIFT`、设备离线、证据不足或就绪度非 `READY` 时，执行按钮不可用。
- FARM_ADMIN 也不能绕过人工确认；后端收到 `approved=false` 会返回 `APPROVAL_REQUIRED`。
- 执行均明确标记 `SIMULATED`；演示剂量来自当前处方，不再固定为 153L。
- `PARTIAL`、`FAILED`、`TIMEOUT` 与 `SUCCEEDED` 分别展示，非成功结果不会显示为已完成。

## 3. 水资源试算

- 管理员逐块选择是否纳入，填写申请水量，设置优先级并勾选“已核对”。
- 所有选中地块均确认后才调用 `evaluateResourcePlan()`。
- 页面展示容量、申请量、实际分配、缺口及每块地的未满足原因。
- 输入标记 `USER_PROVIDED`，结果标记 `ESTIMATED` / `SIMULATED`。
- 试算只保存计划记录，不修改 `resource-profile.capacityLitres`；页面明确提示“不回写真实剩余水量”。

## 4. 验收证据

| 检查项 | 结果 |
|---|---|
| Java/Spring 回归 | `20 tests, 0 failures, 0 errors` |
| Vite 生产构建 | `vite v7.1.5`，`21 modules transformed`，构建成功 |
| 漂移拦截 | 就绪度“需要补充检查”，执行按钮禁用 |
| 失败回执 | `FAILED`、实际用水 `0 L`、效果 `FAILED`，不显示成功 |
| 水量受限 | 3 块地申请 `1440 L`，容量 `900 L`，缺口 `540 L` |
| 来源标签 | `USER_PROVIDED`、`DERIVED`、`SIMULATED`、`ESTIMATED` 可见 |

浏览器截图：

- `design-qa-evidence/admin-b-round1-decision.png`
- `design-qa-evidence/admin-b-round1-resource.png`

## 5. 已知边界

- 当前执行端点是虚拟执行器，不代表真实水泵或现场硬件已接入。
- 资源模块是容量试算，不扣减真实水量。
- 第二轮功能继续按并行开发计划后续轮次实施。
