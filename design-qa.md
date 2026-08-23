# Product Design 视觉验收

## 对照信息

- source visual truth path：`C:\Users\48397\.codex\generated_images\01a0290f-f5ed-7142-9d9e-84a86ecfbc1b\exec-be0f9a26-c8ec-4505-aeef-38915b3386b7.png`
- implementation screenshot path：`D:\26年暑期实训项目\farm-monitor-qa-lxh\farm-monitor\final-auto-wide.png`
- combined comparison path：`D:\26年暑期实训项目\farm-monitor-qa-lxh\farm-monitor\design-comparison.png`
- viewport：`1440 × 1024` CSS px，`deviceScaleFactor=1`
- source pixels：`1487 × 1058`
- implementation pixels：`1440 × 1024`
- normalization：两图等比缩放到约 `719 × 512` 后置于同一 `1440 × 512` 对照画布；两者宽高比差异低于 0.1%，未产生影响判断的密度或裁切偏差。
- state：晴天 `14:20:00`、自动作物、A01 预警、详情面板关闭。

## Findings

- 无剩余 P0/P1/P2 问题。
- [P3] 可进一步提高远景和建筑的模型细节
  - Location：山体、温室和附属建筑。
  - Evidence：目标图使用高细节渲染资产；实现图为保证浏览器实时风场和多天气性能，采用程序化网格与 PBR 表面材质。
  - Impact：不影响场景层级、交互和动态能力，但近距离观察时仍可辨认简化建模风格。
  - Fix：性能预算允许时换用经过 LOD/Draco 压缩的外部植物和建筑模型，并增加轻量 GPU 后处理光晕。

## 必查视觉面

- Fonts and typography：中文使用 `PingFang SC` / `Microsoft YaHei` / system fallback，标题、环境指标、标签和按钮层级清楚；原始尺寸检查未发现换行、截断或字重冲突。
- Spacing and layout rhythm：左侧 74px 工具轨、右上作物切换器、地块标签和右侧详情面板与目标信息架构一致；前后错落三地块和河渠填满首屏，没有首轮的大面积空前景。
- Colors and visual tokens：蓝天、自然绿、暖阳、象牙色路径和深绿玻璃界面保持统一；红色仅用于风险语义，夜间和暴雨状态仍有可读对比。
- Image quality and asset fidelity：草地、耕作土壤和林冠使用专用纹理作为三维表面材质；整幅农场没有使用静态背景图。真实运行态以 WebGL 山地、作物、树、水、云和雨构成，符合“对象必须真正运动”的产品约束。
- Copy and content：标题、天气、作物、地块、风险、详情和沙盘预留文案均为独立产品语义；没有设计提示词或占位文案泄漏。
- Icons：统一使用 Phosphor 图标字体，笔画、对齐和交互状态一致，没有手绘 SVG、emoji 或 CSS 图标替代。
- Accessibility and responsiveness：按钮为语义化控件，详情面板支持 Escape 和关闭按钮，提供 `prefers-reduced-motion`；`1440×1024`、`820×1180`、`390×844` 无页面横向溢出。

## Full-view comparison evidence

- 同一对照输入 `design-comparison.png` 显示：目标和实现均为明亮广角农场，阳光位于山脊上方，三块地形成前后层次，河渠分割地块，工具轨在左、作物切换在右上、地块标签和单一预警均保持低干扰。
- 实现保留目标视觉叙事，但不复制目标的单帧渲染；偏差来自必须保持实时三维对象、鼠标风场、天气和昼夜连续动画的约束，属于有意的实现语言差异。

## Focused region comparison evidence

- 目标原图和实现原图均以原始分辨率检查了左侧工具轨、标题、右上作物切换、A01 预警和地块标签；这些持久控件在全尺寸下清晰可读，因此无需额外裁切生成局部图。
- 详情态另用 `D:\26年暑期实训项目\farm-monitor-qa-lxh\farm-monitor\final-panel.png` 检查：418px 面板无遮挡，状态、4 项传感器、环境曲线、阶段和沙盘入口均在首屏内。

## Comparison history

### Iteration 1 — blocked

- Earlier finding [P1]：早期实现地块横向排成一排、前景空旷，未形成目标图的广角纵深。
- Earlier finding [P2]：山体过高、太阳光盘过大、树冠和作物过疏，画面偏低多边形玩具感。
- Earlier finding [P2]：移动端旧主站头部仅 `visibility:hidden`，仍造成 390px 视口横向溢出。
- Fixes：重排 A01/A02/B01 深度和河渠；扩大前景 B01，压低双层山脊；缩小太阳并增加连续光照；提高作物密度和曲面细分；接入草地/土壤/林冠纹理；移动端打开监测页时移除旧主站布局占位。

### Iteration 2 — passed

- Post-fix evidence：`final-auto-wide.png` 与 `design-comparison.png` 显示广角构图、阳光、地块层级、河渠和 UI 位置已稳定。
- Runtime evidence：WebGL ready；约 433 draw calls、1,171,454 triangles；3 个地块、1 个预警；详情和双击入口通过；控制台错误/警告为 0。
- Responsive evidence：390px 视口 `clientWidth=390`、`scrollWidth=390`。

## Open Questions

- 无阻塞问题。更高精度外部模型属于后续 P3 视觉升级，需要与首屏资源体积和低端显卡帧率共同评估。

## Implementation Checklist

- [x] 目标图与实现图在同一输入中完成归一化对照。
- [x] 修复首屏构图、阳光比例、地块密度和移动端溢出。
- [x] 验证点击、双击、作物切换、风场、昼夜、天气和响应式状态。
- [x] 检查控制台、WebGL 运行指标、语法和 Git 差异。

## Follow-up Polish

- P3：引入带 LOD 的高精度农作物/建筑资产和轻量 bloom，同时保持当前真实顶点风场及性能预算。

final result: passed
