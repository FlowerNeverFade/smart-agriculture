# Web 等画质性能优化验收

> 日期：2026-08-24
>
> 范围：`apps/web-ui` 静态工作台首页、WebGL 背景及公网发布验证
>
> 原则：不降低像素比、抗锯齿、植株数量、植株几何细节或着色器质量

## 1. 改动内容

- 首页只同步加载基础样式和轻量控制器；农田监测、作物沙盘及各业务子页的 JavaScript/CSS 在首次打开对应视图时加载。
- 历史记录、模拟器状态与总览数据并行请求，避免真实后端环境中的串行等待。
- Three.js 麦田背景在首页文字和卡片完成首绘后初始化，完整画质保持不变。
- 18,816 株植被实例仍全部生成，按 8 × 6 空间块组织，使 Three.js 可以剔除镜头外实例；没有减少模型数量或几何细节。
- 主页面被数字孪生/作物沙盘覆盖或浏览器页签隐藏时，Three.js 与粒子画布会取消动画帧；返回时恢复。
- 本地静态服务器对 HTML/JS/CSS 使用可重新验证缓存，对图片、字体和 vendor 依赖缓存 24 小时。
- 首页水资源球的布局约束随首屏 CSS 加载；Canvas 只更新实际像素缓冲区，CSS 尺寸固定为父容器百分比，不再与 `ResizeObserver` 形成高度反馈。协同排程模块复用同一版本的水动画模块，避免重复实例。

## 2. Chromium 性能证据

环境：Chrome headless，1440 × 900，DPR 1，本地 `scripts/serve-webui.py`，演示会话。优化后取 3 次相同探针的中位数；数值会随机器和 GPU 驱动变化。

| 指标 | 优化前 | 优化后中位数 | 变化 |
|---|---:|---:|---:|
| Dashboard 可用 | 635 ms | 355 ms | -44.1% |
| First Contentful Paint | 864 ms | 488 ms | -43.5% |
| 首屏传输量 | 1,504 KiB | 1,158 KiB | -23.0% |
| 首屏阻塞样式 | 294 KiB | 136 KiB | -53.7% |
| 最长主线程任务 | 424 ms | 275 ms | -35.1% |

完整背景约在 809 ms 接入，比内容可用时间晚约 454 ms；这是把高质量场景移出首屏关键路径，不是降低场景质量。首屏只加载 3 张样式表，且不会下载 `farm-monitor.js` 或 `crop-sandbox.js`。

空间分块使用相同探针单独 A/B：单个全场实例网格的两次结果为 24.9/25.3 FPS（中位数 25.1），8 × 6 等画质分块最终三次为 32.5/34.5/33.6 FPS（中位数 33.6），提升约 33.9%。该数值来自 headless 软件 GPU，只用于相对比较，不代表用户机器的帧率上限。

运行命令：

```powershell
python scripts/serve-webui.py 3000
node scripts/profile-webui.mjs
```

## 3. 功能回归

- `node scripts/verify-webui.mjs real`：81/81 通过。
- `node scripts/verify-webui.mjs stub`：80/80 通过。
- `node scripts/verify-webui.mjs svg`：80/80 通过。
- `node scripts/branch-integration-smoke.mjs`：真实 Chromium 18/18 通过，无未处理运行时错误。
- `node --check`：`app.js`、`particles.js`、`rium-background.js`、`profile-webui.mjs` 均通过。
- `python -m py_compile scripts/serve-webui.py`：通过。

## 4. 缓存行为

- `/vendor/three/three.module.min.js`：`Cache-Control: public, max-age=86400`。
- `/js/app.js`：`Cache-Control: no-cache, must-revalidate`，本地修改刷新后仍会立即校验。

`/actuator/health` 在纯静态服务器上返回 404 是演示模式探测后端的预期降级路径，不计为页面运行时错误。

## 5. GitHub 与公网部署验收

- 性能实现提交：`e9dc042390e4d37fa556014291161dcdab0f58a7`，已推送到 GitHub `main`。
- 公网入口：`https://u558871-7873be733236.westd.seetacloud.com:8443/agriloop/`；健康检查返回 HTTP 200、`status=UP`。
- 公网首页加载 `js/app.js?v=20260824-perf-1`；脚本中已包含 FarmMonitor、CropSandbox 和 Rium 背景的按需加载路径。
- 真实 Chrome 管理员登录后可见 3 个地块及 Rium WebGL 画布；首次进入风险预测时，对应 JavaScript/CSS 均按需加载，浏览器控制台与网络请求无运行时错误。
- 性能提交首次验收时风险预测返回 `UNAVAILABLE / INSUFFICIENT_SAMPLES`，这是当时后端样本量硬门的确定性弃权结果，不是视图加载失败；后续实时窗口修复后的最新复验结果见第 6 节。
- 本轮只改静态前端、文档和本地开发服务器，采用静态热发布；Spring API、Qwen/vLLM、PostgreSQL、Redis、MQTT 未重启且 Supervisor 状态保持 `RUNNING`。
- 远端发布目录：`/srv/agriloop/app`；发布前快照：`/srv/agriloop/releases/pre-e9dc042-backup`；源码发布包与展开目录保存在 `/srv/agriloop/releases/`，可用于校验和回滚。

## 6. 首页水资源卡片后续稳定性验收

- 修复提交：`b08c664073c1526146fd82d3d60b6667c3799abc`，已推送 GitHub `main` 并热发布公网。
- 根因：`.water-orb-mini` 等约束此前只存在于按需加载的 `work-orders.css`；首页在该样式加载前初始化 Canvas，像素尺寸反向撑高自适应父容器并反复触发 `ResizeObserver`。点击“水资源协同排程”后样式到位，所以页面看似恢复。
- 修复：将共享水球与首页卡片约束移入核心样式、从按需样式删除重复定义、Canvas 使用 `100%` CSS 尺寸且仅在实际像素尺寸变化时重设缓冲区；首页和协同排程引用同一查询版本的 `water-visual.js`。
- 本地 Chrome：未加载 `work-orders.css` 时，卡片高度 `147.5px -> 147.5px`、页面高度 `2918px -> 2918px`；加载协同排程后卡片仍为 `147.5px`。
- 公网 Chrome（管理员 JWT）：卡片高度 `147.5px -> 147.5px`、页面高度 `2922px -> 2922px`；打开协同排程后仍为 `147.5px`，18/18 通过且无未处理运行时错误。
- 公网 `/actuator/health` 返回 `UP`；Supervisor 中 API、模拟器、Nginx、Cron 与 Qwen/vLLM 均为 `Running`。实时遥测最新窗口为当前时间并保持正序，`SOIL_MOISTURE` 风险预测返回 `AVAILABLE / robust-trend-v1`。
