# 分支对比与合并复核记录

更新时间：2026-08-23（以本次 `git fetch origin --prune` 结果为准）

本记录用于确认“分支当前内容”和“合并后 main 内容”的对应关系。合并策略遵循：能保持完整功能且无破坏性回退时采用分支版本；出现整树替换或删除 main 已验收能力时，保留 main 并只移植增量。

## 已核对的远端头

| 分支 | 远端头 | 处理 |
| --- | --- | --- |
| `lxh-frontend` | `57a5d2a` | 全量合并；农田 3D 文件与分支选定文件逐字节一致 |
| `yyx` | `176d38f` | 全量合并；风险/价值图表交互文件与分支一致 |
| `feat/farm-operations` | `d96499b`（含 `9b12cbc`） | 选择性移植；记录 ours 合并，不接受破坏性整树替换 |
| `rium_dev` | `f381832` | 背景与液态玻璃增量适配；不替换 main 路由/登录/3D 监测壳 |
| `quhl` | `5348e81` | 沿用此前已验证的混合方案；登录资源/会话改动已在 main，保留 main WebGL 登录壳 |
| `task5` | `d4b3508` | **明确不合并**（按用户要求） |

## 冲突与取舍

### lxh-frontend

`57a5d2a` 在 `farm-monitor.js` 中移除了标题锁定区和 FPS 切换按钮，同时保留 60 FPS 优化（共享 uniform、低分辨率阴影、实例绘制优化）。这与 main 的 3D 全景目标一致，且减少遮挡，因此采用分支版本。复核：

```text
git diff --exit-code origin/lxh-frontend -- apps/web-ui/css/farm-monitor.css apps/web-ui/js/farm-monitor.js
PASS (exit 0)
```

### yyx

`176d38f` 只改动风险预测和价值账本图表的 tooltip 命中范围，没有覆盖 main 的预测算法或 Crop Pack。采用全量版本。复核：

```text
git diff --exit-code origin/yyx -- apps/web-ui/js/modules/risk-forecast.js apps/web-ui/js/modules/value-ledger.js
PASS (exit 0)
```

### feat/farm-operations

该分支相对当前 main 是旧基线上的替代树：整树 diff 会删除模拟器控制、预测/情景、Crop Pack、命令面板、登录 WebGL、农田 3D 资源和大量验收文档。因此没有用普通 `merge -X theirs`，而是保留 main 的核心能力，并移植以下分支原始增量：

- `apps/web-ui/FARM_OPERATIONS.md`
- `apps/web-ui/css/modules/work-orders.css`
- `apps/web-ui/js/modules/work-orders.js`
- `apps/web-ui/js/field-visual.js`
- `apps/web-ui/js/water-visual.js`
- `api.js` 的工单、巡田、资源评估客户端方法
- `mock-data.js` 的工单/巡田模拟合同
- `app.js` 的工单/资源路由适配
- `index.html` 的工单样式、水源微型液态玻璃球和主题入口

其中新增模块文件与分支版本内容一致（`field-visual.js` 额外对 `ResizeObserver` 做了无 DOM/无浏览器环境的空值保护，其余逻辑保持一致），业务逻辑未改写；main 独有的 AI、预测、模拟器和安全门控文件没有被分支旧版本覆盖。

### rium_dev

rium 的普通三方合并会在 `style.css`、`index.html`、`app.js`、`package.json/lock` 以及 telemetry/theme/scene 文件上冲突，原因是它提供的是一套整页 shell。最终采用兼容适配：

- `js/rium-background.js` 保留 rium 麦田、天空、麦穗、星空、日/月和主题过渡算法；仅把 bare `three` 改为仓库已验收的 vendor Three，并将容器改为 `#riumBackground`。
- `css/rium-glass.css` 提取 rium 的半透明层、backdrop blur、内高光、主题变量与液态玻璃阴影，作为 main 的附加样式层。
- 背景在主面板显示，在 lxh 全屏 3D 监测时暂停；无 WebGL 时自动降级为 CSS 液态玻璃。
- 不接受 rium 的整页导航、plot telemetry 替换、旧 API/依赖树和启动遮罩，以免回退 main 已验收功能。

### quhl（此前合并复核）

quhl 的登录视觉与 main 的 WebGL 登录有同一入口但不同壳。main 保留当前 WebGL 交互登录，同时采用 quhl 已验证的会话/JWT 与真实背景资源；因此“文件树不完全相同”是有意的兼容合并，而不是遗漏。登录后 API 客户端、JWT/RBAC 和 AI 对话路径以 main 为准。

## 复核命令与结果

- `git merge-base --is-ancestor origin/lxh-frontend HEAD`：PASS
- `git merge-base --is-ancestor origin/yyx HEAD`：PASS
- `git merge-base --is-ancestor origin/rium_dev HEAD`：PASS（通过历史 review merge）
- `git merge-base --is-ancestor origin/quhl HEAD`：PASS（通过历史 review merge）
- `origin/task5` 未执行 merge，且未把其提交作为依赖。
- 前端回归：`node scripts/verify-webui.mjs svg|stub|real`，分别 `55/55`、`55/55`、`56/56` 通过（包含工单沙盘、资源超容量 `INFEASIBLE`、预测/回放/Crop Pack/命令面板）。

后续若远端分支再次更新，先重新执行本记录中的头指纹和选定文件 diff，再决定是否形成新的选择性移植提交。
