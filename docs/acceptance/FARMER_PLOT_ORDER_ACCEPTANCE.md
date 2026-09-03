# 农户端地块稳定排序与拖拽排序验收

> 验收日期：2026-09-01
> 功能编号：T-134
> 范围：本地 `main` 工作树与已发布服务器；发布提交 `165aefd9` 已同步 `/srv/agriloop`，服务级检查通过，登录后的拖拽浏览器验收待集中执行。

## 功能证据

- 后端 `/api/v1/plots` 按 `plotId` 排序，新增 `GET/PUT /api/v1/users/me/preferences/farmer-workspace`，配置按农户账号隔离并通过数据库 `entity_record` 持久化。
- PUT 使用 `expectedRevision`；版本不一致返回 `409 FARMER_WORKSPACE_PREFERENCE_CONFLICT`。请求只接受数组，地块权限、停用地块和数量上限在服务端校验。
- 当前可见地块按“已保存顺序 → 新/恢复地块按 `plotId` 追加”合并；遥测和工作区刷新只更新卡片内容，不重排。
- 农户首页、我的地块、地块下拉选择和工具入口均消费同一个顺序状态。
- “我的地块”使用 Pointer Events：约 400ms 长按激活，激活前移动超过 8px 取消；拖动中显示浮起卡片和目标位置，松开只保存一次；Escape、指针取消、冲突和保存失败均回滚。
- 农户与管理员复用十一项指标常量：土壤湿度、空气温度、空气湿度、光照、二氧化碳、降雨量、酸碱度、水位、速效氮、速效磷、速效钾；缺失值显示 `—`，未知扩展指标按编码稳定追加。

## 集中验证

| 验证项 | 结果 |
| --- | --- |
| Web 全量测试 | `npm test -- --test-concurrency=1`：114/114 |
| API 全量测试 | `AgriApplicationTest` 76/76，`SimulationEngineTest` 3/3；使用 ASCII 临时驱动映射执行 |
| 生产构建 | `npx vite build`：通过 |
| OpenAPI | `docs/api/openapi.yaml`：PyYAML 解析通过 |
| 差异检查 | `git diff --check`：通过 |

## 浏览器一轮验收

页面：`http://127.0.0.1:3001/farmer.html`

- 初始卡片顺序为 `plot-a01 → plot-a02`；长按第一张卡拖到第二张卡后变为 `plot-a02 → plot-a01`，页面显示“地块排列已保存”。
- 刷新页面后顺序仍为 `plot-a02 → plot-a01`。
- 首页“我的地块”卡片和“风险预测”工具地块下拉均为 `plot-a02 → plot-a01`。
- 普通点击地块仍打开对应详情；拖动后的第一张卡对应“温室2 · 批次阶段”。
- 地块卡十一项指标标签顺序固定，实测标签与公共常量一致。
- 390px × 844px 移动视口下地块卡正常单列，无横向溢出；控制台无 warning/error。

本次浏览器验收只执行一轮；未对远程服务器执行部署或线上写入。
