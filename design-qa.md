# Login WebGL Design QA

- source visual truth paths:
  - `design-qa-evidence/reference-active-theory-loaded.png`
  - `design-qa-evidence/reference-apple-airpods.png`
  - `design-qa-evidence/reference-cropx.png`
  - `design-qa-evidence/reference-lettuce-grow.png`
- implementation screenshot path: `design-qa-evidence/login-webgl-final.png`
- full-view comparison evidence: `design-qa-evidence/comparison-pass-2.png`
- viewport: 1600 x 775 CSS px, desktop, device scale factor 2; implementation screenshot 1600 x 775 px and source captures normalized into 520 x 300 tiles for the comparison board
- source pixels: Active Theory 1600 x 775; Apple 1585 x 768; CropX 1569 x 760; Lettuce Grow 1569 x 760
- implementation pixels: 1600 x 775
- state: mature plant at 100% growth, light agricultural theme, empty login form

## Findings

- No remaining P0, P1, or P2 issue.
- Fonts and typography: the implementation uses restrained sans-serif UI text and a single serif display heading, preserving the premium hierarchy and avoiding the dense promotional copy in the agriculture references.
- Spacing and layout rhythm: the singular WebGL subject and login form occupy distinct visual zones with stable negative space; primary controls remain aligned and readable at the target viewport.
- Colors and visual tokens: mist green, warm ivory, natural foliage green, soil brown, and one tomato accent map the selected agricultural direction without inheriting Active Theory's dark palette.
- Image quality and asset fidelity: the hero is a live Three.js object rather than a frame sequence. Antialiasing, soft shadows, physical materials, leaf veins, fog, particles, and lighting render cleanly at the captured desktop density.
- Copy and content: only identity, credentials, entry action, demo identity, password help, and subtle motion controls remain.
- Accessibility and behavior: semantic labels, keyboard-visible focus, password reveal, reduced-motion handling, pause/restart, and scrub controls are present.

## Focused Region Comparison

Not required for this directional synthesis: it is not a pixel clone of one source. The full implementation capture is readable at native size, and the combined comparison board is sufficient to judge the selected qualities: single dynamic subject, negative space, light agriculture palette, and minimal form hierarchy.

## Comparison History

### Pass 1

- Earlier P2 finding: the plant read as too schematic because the leaves were visually edge-on and the material response was flat.
- Fixes made: corrected leaf orientation, added alternating physical materials, subtle clearcoat and sheen, visible leaf veins, and a stronger but restrained environmental halo.
- Earlier evidence: `design-qa-evidence/login-webgl-mature-v2.png` and `design-qa-evidence/comparison-pass-1.png`.

### Pass 2

- Post-fix evidence: `design-qa-evidence/login-webgl-final.png` and `design-qa-evidence/comparison-pass-2.png`.
- Result: the central subject is legible as a growing crop, the form remains visually quiet, and no actionable P0/P1/P2 mismatch remains.

## Interaction and Runtime Checks

- browser-rendered implementation opened at `login.html`
- continuous growth, pointer parallax, click/root pulse, pause, restart, and range scrubber checked
- demo identity selection populated `farmer` / `demo123`
- form submission redirected to `index.html`
- dashboard logout redirected back to the new `login.html`, not the retired concept screen
- DOM runtime check returned `readyState: complete`, `is-mounted: true`, a 3200 x 1550 backing canvas, and the expected mature animation label
- no runtime error surfaced during the tested interaction path; WebGL rendered throughout the captured states
- responsive CSS includes tablet/mobile layout and reduced-motion fallbacks; a separate device-emulated capture was not available in the selected browser surface

## Farm Monitor 3D Visual QA (latest `lxh-frontend`)

- 默认入口：`index.html#view=plot-detail&plotId=plot-a01`；资源使用仓库内 `vendor/three/`、`vendor/phosphor/` 和 `assets/textures/`，不依赖 CDN。
- 视觉结论：采用最新 3D 数字孪生版本作为默认农田监测效果；它提供广角山地、水面、作物实例、昼夜光照、天气粒子、鼠标风场、风险标记和玻璃详情面板，覆盖并 supersede 旧 Canvas 切片。
- 分支验收证据：`docs/acceptance/FRONTEND_FARM_MONITOR_ACCEPTANCE.md` 记录了 WebGL、draw calls/三角面、地块拾取、响应式和控制台检查；外部机器路径的截图不作为本地可复现前提。
- 运行边界：WebGL 初始化失败时保留主站并在监测层记录错误；公共天气请求失败回退重庆演示天气；双击沙盘仍明确标为下一阶段入口。

## yyx Enhancement Visual/Interaction QA

- 已将 `yyx` 分支的相关实现适配当前主线：预测仪表盘与置信带、情景注入和 `EXECUTE/NO_ACTION` 双轨回放、价值账本、Crop Pack 阶段/规则/知识阅读器、⌘K 命令面板和首页三张摘要卡。
- 图表资源使用仓库内 `vendor/echarts.min.js` 按需加载；ECharts 不可用时自动回退纯 SVG，命令面板和动态模块均不阻断登录、Qwen 或 3D 监测主线。
- 回归证据：`scripts/verify-webui.mjs` 在 `svg`、`stub`、`real` 三种模式均通过（48/48、48/48、49/49；real 模式确认 ECharts 5.5.1）。
- 范围说明：未合并名为 `task5` 的独立分支；这不影响吸收 `yyx` 分支本身已经提交的相关功能。

final result: passed

## Latest quhl Login Integration

- 最新 `quhl` 提供的真实番茄/根系背景资产已替换旧登录纹理；当前保留 WebGL 视差、风场和 reduced-motion 降级，因此静态背景不可用时仍有明确回退。
- 登录脚本现在通过 `ApiService` 校验统一 envelope、保存 JWT、清理过期会话，并在后端不可达时仅以 `demo123` 进入标明的离线演示模式；不把演示身份冒充为在线 AI 会话。
- `rium_dev` 的整页液态玻璃/启动动画方案已做兼容性评审，因会删除当前认证与 3D 监测入口，不覆盖默认主线。
