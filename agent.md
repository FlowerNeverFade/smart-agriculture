# 水资源 Shader 升级 Agent 操作说明

> 工作区：`F:\AAA物联网实训\Smartagriculture-farm-ops`
>
> 目标分支：`feat/farm-operations`
>
> 任务范围：只升级“水资源协同排程”弹窗的背景水球、鼠标涟漪和点击水花效果。

## 1. 执行前必须阅读

1. 先完整阅读仓库根目录的 `AGENTS.md`，本文件不能覆盖其中的项目范围、数据来源、安全、测试和状态更新规则。
2. 检查当前分支必须是 `feat/farm-operations`。
3. 检查工作区状态，保留已有修改，不得覆盖或清理其他成员的内容。
4. 不得执行 `git reset --hard`、`git checkout --` 等破坏性命令。
5. 未获得用户明确授权时，不提交、不推送、不创建或合并 Pull Request。

## 2. 任务目标

将当前 CSS 水球和简单 Canvas 水圈升级为以下混合渲染结构：

```text
业务状态与精确数值（DOM）
        ↓
WebGL2 Shader 背景水球与水面扰动
        +
Canvas 2D 水花、液滴和二次落水粒子
        ↓
WebGL 不可用时回退到现有 CSS + Canvas 效果
```

最终视觉应满足：

- 水球占据水资源排程窗口主体，作为透明背景，不遮挡业务内容。
- 水位由剩余水量百分比驱动，用户可从球内液面判断大概余量。
- 精确余量、百分比、总配额、流量和试算结果继续由前景 DOM 展示。
- 球体具有透明球壳、边缘菲涅尔高光、缓慢内部流动、水下焦散和轻微折射。
- 鼠标在整个排程窗口移动时形成连续、顺滑、会衰减的水面尾流。
- 点击窗口任意非控件区域时出现主冲击波、次级波、皇冠状水花和飞散液滴。
- 较大液滴落回水面时产生较弱的二次涟漪。
- 所有效果不改变排程事实、不生成控制命令、不回写实际水量。

## 3. 不可突破的范围

### 3.1 禁止修改

- 不修改 Home 页面结构、主面板布局、全局导航和其他成员负责的功能入口。
- 不修改登录页面、JWT 获取、会话管理和 RBAC 逻辑。
- 不修改后端接口、数据库、MQTT、Redis、命令执行和 Agent 决策逻辑。
- 不修改今日农务透明沙盘和巡田抽屉的现有效果。
- 不合并 `main`，不把功能分支内容写入 `main`。
- 不复制 Active Theory、Hydra 或其他商业站点的代码、Shader、模型和素材。

### 3.2 必须保留

- `setResourceWaterProfile(nextProfile, provenance)` 的调用方式和数据语义。
- `setResourcePlanPreview(result)` 只更新试算结果，不回写实际水位。
- `syncWaterVisuals(root)` 的现有职责与外部调用兼容性。
- `SIMULATED`、`OBSERVED · SIMULATION` 等来源标记。
- 现有水资源表单、容量约束、未满足需求、排程按钮和执行状态逻辑。
- Home 侧栏现有迷你水球的展示结果；本任务不升级它的视觉。
- `prefers-reduced-motion` 降级行为。

## 4. 当前实现基线

开始修改前确认以下文件：

- `apps/web-ui/js/water-visual.js`
  - 保存资源状态并同步水位。
  - 当前鼠标每约 55ms 生成一个独立椭圆水圈。
  - 当前点击生成一圈波纹和一组简单重力圆点。
- `apps/web-ui/js/modules/work-orders.js`
  - `resourceTemplate(context)` 生成水资源排程弹窗。
  - `.backdrop-water-sphere` 是当前 CSS 大水球。
  - `[data-water-surface-canvas]` 是当前窗口级交互画布。
- `apps/web-ui/css/modules/work-orders.css`
  - `.resource-water-backdrop` 至 `.resource-window-effects-canvas` 是大水球和窗口特效样式。
  - `.water-orb-mini` 等样式属于侧栏迷你水球，不得改变视觉。
- `apps/web-ui/FARM_OPERATIONS.md`
  - 记录当前数据边界、接口和视觉说明。

## 5. 目标文件结构

### 5.1 新增文件

`apps/web-ui/js/water-shader.js`

职责：

- 检测 WebGL2 支持。
- 编译和链接顶点/片元 Shader。
- 创建全屏三角形或全屏四边形。
- 创建低分辨率水波模拟纹理和双缓冲 framebuffer。
- 更新实际水位、试算水位、风险配色、指针和时间 uniform。
- 提供初始化、调整尺寸、注入扰动、绘制、暂停、恢复和销毁接口。

建议导出：

```js
export function createWaterShaderRenderer(canvas, options = {})
```

返回对象至少包含：

```js
{
  ready,
  resize(),
  setState(state),
  setPointer(pointer),
  addImpulse(impulse),
  render(time),
  pause(),
  resume(),
  destroy()
}
```

不得引入 Three.js、PixiJS 或其他大型依赖。本项目当前是原生 ES Module 静态页面，优先使用原生 WebGL2。

### 5.2 修改文件

- `apps/web-ui/js/water-visual.js`
  - 保留资源状态管理。
  - 将窗口级交互重构为统一控制器。
  - 调用 `water-shader.js`。
  - 管理顺滑指针、Canvas 粒子、生命周期和降级。
- `apps/web-ui/js/modules/work-orders.js`
  - 只在 `resourceTemplate(context)` 内增加 Shader Canvas。
  - 不修改资源排程业务处理函数。
- `apps/web-ui/css/modules/work-orders.css`
  - 增加 Shader Canvas 层级和 ready/fallback 状态。
  - 保留原 CSS 水球作为回退。
  - 不调整 Home 和迷你水球选择器。
- `apps/web-ui/FARM_OPERATIONS.md`
  - 更新视觉实现、降级、输入、输出和服务器数据边界。
- `TASKS.md`、`PROJECT_STATUS.md`
  - 完成并取得可复现证据后更新为“待验收”，不得因为只有视觉代码就标记“已完成”。

## 6. DOM 和图层设计

仅在水资源排程模板内形成以下层级：

```html
<section class="farm-ops resource-ops" data-water-surface>
  <div class="resource-water-backdrop" aria-hidden="true">
    <canvas class="resource-water-shader" data-water-shader></canvas>
    <div class="backdrop-water-sphere">现有 CSS 回退水球</div>
  </div>
  <canvas class="resource-window-effects-canvas"
          data-water-surface-canvas
          aria-hidden="true"></canvas>
  <!-- 原有业务内容保持不变 -->
</section>
```

层级要求：

1. Shader Canvas 位于业务内容后方。
2. Canvas 2D 水花位于 Shader 上方、业务内容下方或视觉允许的覆盖层，但必须 `pointer-events: none`。
3. 业务面板、按钮、输入框和下拉框保持可点击。
4. Shader 第一帧成功后给根节点添加 `.webgl-water-ready`。
5. 只有 `.webgl-water-ready` 存在时才降低或隐藏 CSS 回退球体。
6. Shader 编译失败、context lost 或不支持 WebGL2 时移除 ready 状态并显示现有回退水球。

## 7. Shader 水球实现要求

### 7.1 顶点 Shader

- 使用一个覆盖视口的全屏三角形，避免额外几何体和索引缓冲。
- 输出标准化 UV。
- Shader 源码可作为模板字符串保存在 `water-shader.js` 中，避免额外加载和路径问题。

### 7.2 片元 Shader

使用屏幕空间圆形球体，不需要加载 3D 模型。最低应实现：

1. **球形遮罩**
   - 对 UV 进行宽高比修正。
   - 计算球心距离，圆外透明。
   - 根据圆内坐标恢复近似球面法线 `normal.z`。
2. **透明球壳**
   - 使用视线与法线夹角计算 Fresnel。
   - 边缘亮、中心透明，避免实心塑料球效果。
3. **水位裁切**
   - `uWaterLevel` 使用 `0.0～1.0`。
   - 水面在球内保持世界水平，不随球面弧度倾斜。
   - 水面加入低幅噪声和交互扰动，但水位中心值不得偏离业务数据。
4. **内部水体**
   - 使用两到三层低成本 value noise/fBM 形成缓慢流动。
   - 根据球面法线、水深和扰动偏移采样坐标，制造折射感。
   - 添加低强度焦散纹理，不得持续高频闪烁。
5. **高光**
   - 左上方主高光。
   - 边缘细高光和底部较深吸收色。
   - 鼠标靠近球体时只轻微移动高光，不得让球体大幅跟随鼠标。
6. **试算水位**
   - `uProjectedWaterLevel` 只显示为虚线、薄光带或短时脉冲。
   - 只有存在排程试算时才显示。
   - 不把试算水位写入 `uWaterLevel`。
7. **状态配色**
   - 安全：蓝青色。
   - 预警：蓝色中加入少量暖金反光。
   - 紧张：深蓝中加入克制的红色边缘提示。
   - 状态色只作为辅助，不代替文字和数值。

建议 uniform：

```text
uTime
uResolution
uActualWaterLevel
uProjectedWaterLevel
uHasPreview
uPointer
uPointerVelocity
uRippleTexture
uRiskState
uMotionScale
```

## 8. 水波模拟要求

### 8.1 模拟结构

采用低分辨率 ping-pong framebuffer，不做生产级真实流体：

- 使用两个 RGBA8 纹理交替保存上一帧和下一帧状态。
- 建议分辨率按窗口宽高比生成，短边控制在 `96～160`，长边不超过 `256`。
- R 通道编码高度，G 通道编码速度，`0.5` 表示零值。
- 使用临近像素计算简化 Laplacian。
- 每帧加入阻尼，保证所有扰动最终归零。
- 不依赖浮点 framebuffer 扩展，提升兼容性。

建议更新逻辑：

```text
laplacian = left + right + top + bottom - 4 * center
velocity = (velocity + laplacian * stiffness) * damping
height = (height + velocity) * heightDamping
height += pointerImpulse + clickImpulse + dropletImpact
```

参数必须使用时间步长或固定步进，不能让 30 FPS 与 60 FPS 的速度明显不同。

### 8.2 鼠标轨迹

禁止继续采用“每 55ms 生成一个固定椭圆”的方式。

必须实现：

- 保存目标指针坐标、平滑指针坐标、上一帧坐标、速度和方向。
- 使用 `requestAnimationFrame` 指数插值更新平滑坐标。
- 每帧根据移动距离在上一点和当前点之间补点，避免快速移动断裂。
- 根据速度调整扰动强度和宽度。
- 慢速形成小而密的波纹，快速形成较长的 V 形尾流。
- 转向时通过前后方向差形成轻微旋涡，不生成尖锐折角。
- 停止移动后约 `0.9～1.3s` 完全衰减。
- 触摸设备不持续采集移动轨迹，只保留点击反馈。

### 8.3 点击扰动

一次有效点击至少注入：

- 一个较强中心冲击。
- 一个向外扩散的主波。
- 两个强度更低、速度不同的次级波。

点击按钮、输入框、选择框、文本域和可编辑元素时：

- 业务操作照常执行。
- 可以产生非常弱的背景反馈，但不得出现遮挡控件的大型水花。
- 不得阻止默认行为或停止业务事件传播。

## 9. Canvas 水花和液滴要求

Canvas 2D 只负责难以用背景 Shader 表达的窗口级粒子。

### 9.1 皇冠水花

- 点击瞬间显示 `120～220ms` 的皇冠状轮廓。
- 使用 8～12 个不完全对称的水冠尖峰。
- 中心高亮短暂增强后快速衰减。
- 不使用静态水滴图片。

### 9.2 液滴

- 桌面端每次点击生成约 `18～26` 枚。
- 窄屏或低性能模式生成约 `8～14` 枚。
- 每枚液滴保存位置、速度、半径、透明度、旋转、出生时间和寿命。
- 使用基于 delta time 的重力和空气阻力，不使用“每帧固定加 0.085”一类与帧率绑定的逻辑。
- 大液滴带短尾迹，小液滴以高光点为主。
- 液滴总数设置硬上限，建议不超过 `90`。
- 超过上限时优先移除最旧或最弱粒子。

### 9.3 二次落水

- 为较大的液滴保存落水基准线或最大飞行时间。
- 第一次落水时调用 Shader 控制器的 `addImpulse()`。
- 二次扰动强度不超过主点击的 `20%～30%`。
- 每枚液滴最多触发一次落水扰动。

## 10. 状态接入

资源状态仍由 `water-visual.js` 中的 `snapshot()` 统一计算。

传入 Shader 的状态映射：

| 业务字段 | Shader 参数 | 说明 |
| --- | --- | --- |
| `remainingPercent / 100` | `uActualWaterLevel` | 实际水位 |
| `projectedPercent / 100` | `uProjectedWaterLevel` | 试算水位 |
| `plannedLitres > 0` | `uHasPreview` | 是否显示试算线 |
| `remainingPercent >= 60` | `uRiskState = 0` | 安全 |
| `30 <= remainingPercent < 60` | `uRiskState = 1` | 预警 |
| `remainingPercent < 30` | `uRiskState = 2` | 紧张 |

要求：

- 所有输入在进入 Shader 前进行有限数校验和 `0～1` 截断。
- 数据异常时使用上一次有效状态或安全默认值，不允许出现 NaN 导致全屏黑色。
- 后端接入后仍只需要调用现有公开函数，不增加业务页面对 Shader 的直接依赖。

## 11. 生命周期与资源清理

当前弹窗可能通过 `innerHTML` 重新渲染，必须处理旧 Canvas 和事件监听器：

- 每个水资源窗口最多存在一个活动控制器。
- 使用显式 `destroy()` 清理 RAF、ResizeObserver、事件监听器、WebGL program、texture、buffer 和 framebuffer。
- 重新执行 `syncWaterVisuals()` 时，先销毁已经断开 DOM 的旧控制器。
- `document.visibilityState === 'hidden'` 时暂停渲染。
- 页面恢复可见时重新测量尺寸并继续。
- `webglcontextlost` 时调用 `preventDefault()`、停止绘制并显示 CSS 回退。
- `webglcontextrestored` 时重新创建资源；无法恢复则继续使用回退。
- 不得因多次打开弹窗重复注册全局监听器。

## 12. 性能预算

目标：

- 桌面 `1280×720`、普通集成显卡下视觉目标接近 60 FPS。
- 持续交互时不得长期低于 45 FPS。
- 窄屏设备允许降低到 30 FPS，但交互不能明显断裂。
- Shader Canvas DPR 上限建议 `1.25～1.5`。
- Canvas 2D DPR 上限建议桌面 `1.25`、窄屏 `1.0`。
- 水波模拟使用低分辨率纹理，不按设备物理像素运行。
- 空闲时 Shader 背景可降至 30 FPS；发生鼠标或点击交互时提升到 60 FPS。
- 不可见时完全停止。
- 禁止在每帧创建大量数组、DOM 节点、渐变对象或 WebGL 资源。
- 禁止在每个液滴上使用大面积高强度 `shadowBlur`。

如果性能不达标，按以下顺序降级：

1. 降低水波纹理分辨率。
2. 降低 Canvas DPR。
3. 减少 fBM octave。
4. 减少液滴和尾迹数量。
5. 空闲帧率降到 24～30 FPS。
6. 最后才关闭二次落水，不得先删除数据水位和回退能力。

## 13. 无障碍和降级

- Shader 和特效 Canvas 必须 `aria-hidden="true"`。
- 精确水量信息必须留在可访问的 DOM 中。
- 不能仅依赖颜色表达紧张状态。
- `prefers-reduced-motion: reduce` 时：
  - 只渲染静态水球和实际水位。
  - 停止噪声流动、水波模拟、鼠标轨迹和飞溅粒子。
  - 保留试算水位静态标记。
- WebGL2 不可用时：
  - 保留现有 CSS 大水球。
  - 保留简化 Canvas 涟漪和点击反馈。
  - 页面不得显示错误弹窗或空白背景。
- Shader 编译日志只写入开发控制台，用户界面不显示底层错误细节。

## 14. 实施顺序

严格按以下顺序执行，每一步完成后都做一次本地检查：

### 阶段 A：建立基线

1. 记录 `git status --short`。
2. 运行当前页面并保存水资源弹窗桌面、窄屏截图。
3. 检查控制台错误。
4. 记录当前实际水位和试算水位行为。

### 阶段 B：搭建 Shader，不接交互

1. 新增 `water-shader.js`。
2. 加入 Shader Canvas 和 CSS 层级。
3. 完成圆形球壳、Fresnel、实际水位和基本流动。
4. 完成 ready/fallback 切换。
5. 验证 Shader 失败时现有 CSS 球仍显示。

### 阶段 C：接入状态

1. 将 `snapshot()` 结果传给 Shader。
2. 验证 `0%`、`20%`、`50%`、`75%`、`100%` 水位。
3. 验证安全、预警、紧张配色。
4. 验证排程试算线不改变实际液面。

### 阶段 D：水波模拟

1. 创建 ping-pong 水波纹理和模拟 Shader。
2. 实现固定时间步长、阻尼和边界衰减。
3. 将扰动纹理用于球体折射和水面起伏。
4. 确认无输入时扰动会归零，不产生永久震荡。

### 阶段 E：鼠标尾流

1. 实现逐帧指针插值。
2. 实现快速移动补点。
3. 按速度调整扰动宽度和强度。
4. 实现停止后的自然衰减。
5. 检查前景控件交互不受影响。

### 阶段 F：点击水花

1. 实现中心冲击、主波和次级波。
2. 实现皇冠水花。
3. 实现液滴、尾迹、重力和空气阻力。
4. 实现大液滴二次落水扰动。
5. 加入粒子总数与连续点击保护。

### 阶段 G：性能和回退

1. 增加 DPR、模拟纹理尺寸和粒子数量分级。
2. 增加页面隐藏暂停。
3. 增加减少动态效果模式。
4. 验证 WebGL context lost 处理。
5. 删除被 Shader 完全取代且不属于回退需要的重复动画，但保留回退完整性。

### 阶段 H：文档与验收

1. 更新 `FARM_OPERATIONS.md`。
2. 更新 `TASKS.md` 和 `PROJECT_STATUS.md`，状态保持“待验收”。
3. 完成语法、差异、视觉、交互、响应式和控制台验收。
4. 输出修改文件、测试证据、已知限制和服务器联调边界。

## 15. 验收用例

### 15.1 功能

- 打开 `#view=resource-coordination&plotId=plot-a01` 能看到 Shader 水球。
- 实际水量变化时液面平滑到达新高度。
- 生成排程试算后只出现预测水位，不改变实际水位。
- 关闭并重新打开弹窗不会出现多个动画控制器。
- 重新计算排程后状态和画面同步。

### 15.2 鼠标与点击

- 慢速直线移动：连续小涟漪，无离散圆圈串。
- 快速横向移动：尾流不断裂。
- 快速转弯：轨迹圆滑，无尖锐折线。
- 停止移动：`1.3s` 左右基本消失。
- 单击空白区：皇冠水花、主波、次级波和液滴完整出现。
- 连续点击 20 次：页面仍响应，粒子不会无限增加。
- 点击输入框和按钮：业务操作正常，无事件被特效拦截。

### 15.3 数据边界

- 页面明确显示 `SIMULATED` 或实际传入的 provenance。
- 试算结果不伪装成真实执行结果。
- Shader 视觉值与 DOM 百分比一致。
- 无数据或异常数据不会显示 NaN、Infinity 或黑屏。

### 15.4 兼容与降级

- 桌面宽屏正常。
- `390×844` 左右窄屏正常。
- `prefers-reduced-motion` 下为静态水球。
- WebGL2 不可用时 CSS 回退正常。
- 浏览器控制台无未处理错误和 Shader 编译错误。

### 15.5 不回归

- Home 页面没有代码和视觉变化。
- 今日农务、工单、巡田和执行状态仍可使用。
- 水资源表单、容量计算、排程试算和未满足需求显示正常。
- 登录和 RBAC 代码没有变化。

## 16. 必须执行的检查

修改后至少运行：

```powershell
node --check apps/web-ui/js/water-shader.js
node --check apps/web-ui/js/water-visual.js
node --check apps/web-ui/js/modules/work-orders.js
git diff --check
git status --short
git diff --name-status origin/main
```

本地视觉验收：

```powershell
python -m http.server 4173 --directory apps/web-ui
```

打开：

```text
http://127.0.0.1:4173/index.html#view=resource-coordination&plotId=plot-a01
```

验收时至少检查：

- 桌面截图。
- 窄屏截图。
- 水位 3 个状态。
- 鼠标慢速、快速和转向。
- 单击和连续点击。
- 控制台 warning/error。
- 页面关闭后的资源清理。

## 17. 完成定义

只有同时满足以下条件，才能向用户报告本次代码实现完成：

- Shader 水球已运行且水位和业务数据一致。
- 连续涟漪和点击水花达到本文件要求。
- WebGL、减少动态效果和窄屏均有可靠降级。
- Home、登录、后端和其他农务功能没有回归。
- JavaScript 语法检查和 `git diff --check` 通过。
- 本地视觉、交互和控制台验收通过。
- `FARM_OPERATIONS.md`、`TASKS.md`、`PROJECT_STATUS.md` 已同步。
- 当前仍准确标记为 Mock/SIMULATED 或实际 provenance。
- 未经用户授权没有提交、推送或合并。

## 18. 最终汇报格式

向用户汇报时依次说明：

1. 最终视觉与交互结果。
2. 具体修改文件。
3. 性能和降级策略。
4. 已执行的验收及结果。
5. 当前数据来源和服务器联调边界。
6. 是否提交、是否推送、是否修改 `main`。
