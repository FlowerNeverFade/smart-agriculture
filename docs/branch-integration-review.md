# 分支对比与合并复核记录

更新时间：2026-08-24（以 `git fetch origin --prune` 后的远端头为准）

本轮只处理 `feat/login-interface`、`feat/farm-operations`、`yyx`、`lxh-frontend`、`rium_dev`。按用户要求，`quhl`、`docs/multi-crop-agri-design` 和 `task5` 不参与合并，也不作为依赖。

## 远端头与处理结果

| 分支 | 远端头 | 处理结果 |
|---|---|---|
| `feat/login-interface` | `9e8bf9a` | 全量合并；登录页、WebGL 液态背景和降级样式保持分支版本 |
| `feat/farm-operations` | `55e4066` | 全量合并后兼容收口；保留工单、巡田、农田动态画布和 WebGL2 水务 Shader |
| `yyx` | `1c1798f` | 全量合并；保留风险预测、情景回放及四作物 3D 表现 |
| `lxh-frontend` | `53f6d82` | 全量合并；保留农田监测、地块复垦持久化和微观作物双轨沙盘 |
| `rium_dev` | `9d37fc2` | 全量合并后适配现有壳；保留地形、麦田、云层、昼夜和液态玻璃 |
| `quhl` | `37b1c93` | **本轮不处理** |
| `docs/multi-crop-agri-design` | `e0824bb` | **本轮不处理** |
| `task5` | `d4b3508` | **不合并** |

五个目标分支的远端头均是代码整合提交 `08a7b90` 的祖先；三个排除分支均不是其祖先。

## 冲突与取舍

### 登录界面

采用 `feat/login-interface` 的独立登录页，不使用工作台弹窗登录。`login.html`、`login-motion.css`、`login.js`、`login-webgl.js` 及品牌资源与分支选定文件无差异；公网在线时强制真实 JWT，后端离线时才允许演示会话。

### 农务执行与水务效果

保留 `feat/farm-operations` 的四态工单、巡田证据、资源约束、农田动态画布、水球和 WebGL2 Shader。两处适配不改变视觉或业务行为：

- 删除已经无对象可匹配的旧三角尺/接口栏隐藏规则，因为占位节点已从模板移除；
- `ResizeObserver` 增加无浏览器环境空值保护，使 Node 合同测试可运行。

### yyx 与 lxh-frontend

`yyx` 的风险预测、情景回放和作物 3D 场景继续使用原入口；`lxh-frontend` 的微观作物沙盘新增为独立导航项，避免覆盖前两者。`three-pot.js` 仅改为复用站点已有的 vendor Three.js，避免重复加载渲染运行时。

`lxh-frontend` 沙盘的结构、交互和 3D 场景保留；涉及收益、损失和工时的无证据金额改为 `SIMULATED` / `ESTIMATED` 风险与试算表述，不把演示结果冒充真实经营收益。

### rium_dev

保留最新地形、土壤、麦田、云层、星空、日月、主题过渡和液态玻璃效果，并适配当前 `#riumBackground` 容器及仓库内 Three.js。未采用会覆盖现有 JWT、路由、农田监测和 Agent 的整页壳。全局定位规则已收窄，避免固定弹窗被排到页面底部；主题动画增加 requestAnimationFrame/CustomEvent 的测试环境兼容降级。

## 验收证据

- `node scripts/verify-webui.mjs real`：`66/66` PASS。
- `node scripts/verify-webui.mjs stub`：`65/65` PASS。
- `node scripts/verify-webui.mjs svg`：`65/65` PASS。
- `node scripts/branch-integration-smoke.mjs`：真实 Chromium `15/15` PASS；覆盖独立登录、rium 背景、居中弹窗、无三角尺、独立 3D 沙盘、四态农务和运行时错误。
- 公网真实 JWT 浏览器复核：登录成功，后端返回 3 个地块；rium WebGL、固定居中弹窗、无三角尺和沙盘 WebGL 均通过，无 page error。
- 远端 Java 17：`./gradlew test` 为 `BUILD SUCCESSFUL`；Crop Pack 校验和 `scripts/acceptance_smoke.py` 均 PASS。
- 公网 Agent 非快捷请求返回 `adapter=openai-compatible`、`model=agriloop-qwen38-agri`、`degraded=false`。

后续若这些分支再次更新，必须重新记录远端头、逐项比较选定文件并复跑上述回归；排除分支不能因批量 merge 被间接带入。
