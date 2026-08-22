# 前端任务 5 验收记录：预测与经营

> 范围：`risk-forecast`、`scenario-replay`、`value-ledger` 三个路由。
> 本记录区分实时后端数据、确定性模拟数据和估算值，不把模拟收益写成真实经营结果。

## 已交付

| 能力 | 页面证据 | 降级/安全边界 |
|---|---|---|
| CAP-09 风险预测 | 1/2/4 小时预测扇形带、Time-to-Risk 仪表、样本/覆盖率/算法版本、假设和过期时间 | 预测接口失败或质量不足时显示 `UNAVAILABLE`，不补造未来值 |
| 情景与双轨回放 | `drought`、`heatwave`、`heavy-rain`、`sensor-drift`、`device-offline` 注入；固定 Seed 的 `EXECUTE`/`NO_ACTION` 曲线；拖动时间轴和 JSON 导出 | 分支带 `readOnly` 标记，同一 `scenario + seed` 使用确定性 PRNG；不回写主状态 |
| CAP-12 价值账本 | 计划/实际用水柱状图、反事实成本面积图、节水/水费/节电/工时指标、逐项来源和公式 | `OBSERVED` 固定标记 `sourceMode=SIMULATION`；缺少产量/价格证据时不计算利润 |

## 接口对接

- `GET /api/v1/plots/{plotId}/risk-forecast?metric=SOIL_MOISTURE`
- `POST /api/v1/forecasts/evaluate`
- `POST /api/v1/scenarios/runs`
- `POST /api/v1/scenarios/compare`
- `GET /api/v1/value-ledgers`
- `POST /api/v1/value-ledgers`

后端不可用时，`apps/web-ui/js/api.js` 使用同形状的确定性 Mock；页面状态会显示 `LOCAL · DETERMINISTIC` 或 `LOCAL · COMPUTED`。

## 可复现检查

在仓库根目录执行：

```powershell
python scripts/acceptance_task5_frontend.py
git diff --check
```

预期输出包含 `TASK5_FRONTEND_STATIC_OK`。浏览器手工回归路径：

1. 打开 `apps/web-ui/index.html`，点击左侧“未来风险预测推演”，确认预测带和 1/2/4 小时卡片出现。
2. 点击“持续干旱”后进入“双轨回放”，拖动滑块，确认 A/B 数值和事件时间轴同步变化。
3. 点击“经营价值与效益对账”，提交一组计划/实际用水，确认账本 ID、偏差率、来源标签和公式更新。
