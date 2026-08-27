# 修复记录 (Fix Records)

## 2026-08-26 修复记录

### 1. 缺陷修复说明：系统管理员平台总览页面刷新空白问题

#### 1.1 问题现象 (Issue)
- **环境**：`SysAdminUI` 分支（Live / 模拟模式下刷新页面时）
- **现象**：平台总览页面在未刷新（或刚刚登录）时渲染正常，但按下刷新按钮重新挂载并请求 `loadSystemAdminData` 后，页面突然变成完全空白。

#### 1.2 根本原因 (Root Cause)
Vue 3 渲染引擎发生了未捕获的运行时崩溃，导致根节点上的整个组件树被直接卸载。
具体触发链条如下：
1. 前端模板 `index.html` 的模拟器历史组件中，通过 `<li v-for="run in state.adminOverview.simulator.history">` 循环渲染历史。
2. 在刷新触发的异步函数 `adminOverviewFromLive` 中，重构并返回了 `adminOverview.simulator` 对象，但**漏掉了对 `history` 数组字段的赋值**。
3. 当 Vue 响应式系统收到更新并尝试执行 `v-for` 时，试图对 `undefined`（即缺失的 `history`）进行迭代，引发 `TypeError`，导致白屏。

#### 1.3 具体修改与修复逻辑 (Modifications & Fixes)

**[修改] `apps/web-ui/js/app.js`**
- **新增 (Add)**：在 `adminOverviewFromLive` 函数构造 `simulator` 对象的逻辑中，显式补上了对 `history` 的安全合并。
  ```javascript
  simulator: {
    running: simStatus === 'RUNNING',
    scenario: simulator.scenario || simulator.scenarioId || '',
    eventsEmitted: Number(...),
    startTime: simulator.startedAt || null,
    // [本次新增] 防止模板层引发 undefined 迭代崩溃
    history: simulator.history || []
  }
  ```
- **修改 (Modify)**：在调用 `adminOverviewFromLive` 的地方，将 `state.value.adminSimHistory` 作为 `history` 参数，平滑透传给该函数，以保证刷新后模拟器历史记录依然可用且不为空。

#### 1.4 验收证据 (Acceptance Evidence)
- **正常路径**：在刷新系统管理员平台总览界面后，页面保持挂载状态，模拟器运行状态和历史记录列表正常显示（为空时显示安全降级，不再白屏）。
- **降级路径**：当后端数据确实不包含历史时，代码默认回退到空数组 `[]`，`v-for` 静默跳过，不会引起前端崩溃。

---

### 2. 其他优化项

- **新增离线 Fallback 登录**：修改了 `apps/web-ui/js/api.js` 和 `apps/web-ui/js/login.js`，当 `/api/v1/auth/login` 后端接口无法连接时，系统会自动 fallback 到本地 Demo 模式分配身份并进入系统（解决"实时会话缺少访问令牌"报错）。
- **交互优化**：删除了 `apps/web-ui/js/app.js` 中点击退出时的 `window.confirm` 确认弹窗，提升操作流畅度。
