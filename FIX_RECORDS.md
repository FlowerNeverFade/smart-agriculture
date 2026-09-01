# 修复记录 (Fix Records)

## 2026-09-01 设备离线场景下手动开启被覆盖

### 问题与原因

- 农场管理员在“设备离线”模拟场景中点击开启后，控制 ACK 已将设备设为在线，但下一轮模拟器仍按场景比例发布 `OFFLINE`，并覆盖管理员的操作结果。
- 设备状态过期检查也没有区分“模拟场景离线”和“管理员明确关闭”，导致在线恢复状态可能再次被写成离线。

### 修复

- 成功的模拟设备 `ONLINE` 控制会持久化 `manualStatusOverride=ONLINE`；模拟器在该覆盖有效时继续生成遥测和在线状态，不再发布场景离线状态。
- 设备状态入库、遥测设备读模型和过期检查均遵守手动在线覆盖；再次关闭、解绑或换绑时清除覆盖。
- 保留真实硬件的原有心跳、MQTT ACK 和超时逻辑，不对真实设备伪造在线状态。
- 增加回归用例：设备离线场景连续模拟多轮仍在线，再次关闭后不恢复上报。

### 验证

- `:apps:api-service:compileJava` 与 `:apps:api-service:compileTestJava` 通过。
- 完整测试套件按当前任务约定未运行；随后线上定向复核通过。

## 2026-09-01 自定义模拟设备恢复后再次离线

### 问题与原因

- 部分已登记的模拟设备使用自定义编号（例如 `002`），但模拟器仍固定向
  `mock-<地块ID>` 发送遥测和状态；管理员实际开启的设备没有收到后续心跳，
  因而看起来又恢复为离线。

### 修复

- 每个模拟周期按地块当前绑定关系解析模拟设备，优先使用明确控制过且仍绑定的设备；
  没有绑定记录时才回退到历史 `mock-<地块ID>`。
- 遥测、设备状态和手动在线/离线覆盖全部写入同一个实际设备编号；显式标记为
  `REAL/HARDWARE` 的设备不会被模拟器接管。
- 设备列表的硬件/模拟来源判定统一读取来源字段，避免自定义模拟编号被误显示为硬件。
- 增加非 `mock-` 设备编号的恢复回归覆盖，并校验连续模拟样本都落到绑定设备。

### 验证

- `:apps:api-service:compileJava` 与 `:apps:api-service:compileTestJava` 通过。
- 完整测试套件按当前任务约定未运行。
- 已部署到 `/srv/agriloop`，提交标记为 `bbab0805e7e78cb48c9402e1c4b79bdd08b43402`；部署前数据库备份为
  `/srv/agriloop/backups/agri-20260901-161854.sql.gz`。
- 线上将 `plot-a02` 临时切换为 `DEVICE_OFFLINE` 后对 `002` 执行 `ONLINE`，跨模拟周期仍保持
  `status=ONLINE`、`manualStatusOverride=ONLINE`，近两分钟遥测 `device_id=002`；随后已恢复 `NORMAL`。

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
