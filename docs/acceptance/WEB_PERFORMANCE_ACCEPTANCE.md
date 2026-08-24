# Web 本地性能优化验收

> 日期：2026-08-24
>
> 范围：`apps/web-ui` 本地静态工作台首页及其 WebGL 背景
>
> 原则：不降低像素比、抗锯齿、植株数量、植株几何细节或着色器质量

## 1. 改动内容

- 首页只同步加载基础样式和轻量控制器；农田监测、作物沙盘及各业务子页的 JavaScript/CSS 在首次打开对应视图时加载。
- 历史记录、模拟器状态与总览数据并行请求，避免真实后端环境中的串行等待。
- Three.js 麦田背景在首页文字和卡片完成首绘后初始化，完整画质保持不变。
- 18,816 株植被实例仍全部生成，按 8 × 6 空间块组织，使 Three.js 可以剔除镜头外实例；没有减少模型数量或几何细节。
- 主页面被数字孪生/作物沙盘覆盖或浏览器页签隐藏时，Three.js 与粒子画布会取消动画帧；返回时恢复。
- 本地静态服务器对 HTML/JS/CSS 使用可重新验证缓存，对图片、字体和 vendor 依赖缓存 24 小时。

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

- `node scripts/verify-webui.mjs real`：79/79 通过。
- `node scripts/verify-webui.mjs stub`：78/78 通过。
- `node scripts/verify-webui.mjs svg`：78/78 通过。
- `node scripts/branch-integration-smoke.mjs`：真实 Chromium 15/15 通过，无未处理运行时错误。
- `node --check`：`app.js`、`particles.js`、`rium-background.js`、`profile-webui.mjs` 均通过。
- `python -m py_compile scripts/serve-webui.py`：通过。

## 4. 缓存行为

- `/vendor/three/three.module.min.js`：`Cache-Control: public, max-age=86400`。
- `/js/app.js`：`Cache-Control: no-cache, must-revalidate`，本地修改刷新后仍会立即校验。

`/actuator/health` 在纯静态服务器上返回 404 是演示模式探测后端的预期降级路径，不计为页面运行时错误。
