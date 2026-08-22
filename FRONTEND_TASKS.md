# 农智闭环（AgriLoop）前端全景开发与团队分工方案

> **项目目标**：打造参考 **OceanX 2025（科考级数字驾驶舱）** 与 **GitHub Precision Dark** 风格的智慧农业数字孪生与 AI 决策中枢。  
> **当前状态**：主面板（Home Dashboard）及全局深色设计系统、路由分发器、后端 API/Mock 通信层已就绪；9 个核心功能子页面已预留插槽，现拆分为 **5 个并行开发任务包** 供团队成员分工实现。

---

## 目录
1. [设计风格基准与视觉规范](#一设计风格基准与视觉规范)
2. [团队多模块并行开发架构](#二团队多模块并行开发架构避免冲突)
3. [团队成员任务分工包（1 ~ 5）](#三团队成员任务分工明细)
   - [任务包 1：地块数字孪生与全景时序大屏](#任务包-1地块数字孪生与全景时序大屏-plot-detail)
   - [任务包 2：AI 智能诊断中枢与可信决策台](#任务包-2ai-智能诊断中枢与可信决策台-decision-console--passport)
   - [任务包 3：今日农务看板、巡田核验与水资源调度](#任务包-3今日农务看板巡田核验与水资源调度-work-orders--resource-coord)
   - [任务包 4：未来风险推演与情景模拟沙盘](#任务包-4未来风险推演与情景模拟沙盘-risk-forecast--scenario-replay)
   - [任务包 5：效益对账本、作物包管理与全局动效](#任务包-5效益对账本作物包管理与全局动效-value-ledger--crop-packs)
4. [本地启动与联调测试指引](#四本地启动与联调测试指引)

---

## 一、设计风格基准与视觉规范

参考标杆：[OceanX 2025](https://2025.oceanx.org/) 与现代深色系仪表盘（Linear / GitHub Dark）：

* **色彩体系**：
  - 页面主底色：`#0d1117`（Deep Canvas）
  - 卡片与面板底色：`#161b22` / `#1c2128`
  - 边框与分割线：`#30363d`
  - 核心发光主题色：荧光绿 `#3fb950`（作物生机）、科技蓝 `#58a6ff`（数据流/预测）、警示橙 `#d29922`（风险/缺水）、高危红 `#f85149`
* **排版字体**：
  - 界面中文：`-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`
  - 指标数值与 ID：`SFMono-Regular, Consolas, Monaco, monospace`（等宽字体）
* **交互体验**：
  - 高对比度荧光数据指标、渐变半透明发光区域（ECharts 包络线）；
  - 平滑的 Hover 悬浮抬升、粒子动效与毛玻璃抽屉弹窗（Glassmorphism）。

---

## 二、团队多模块并行开发架构（避免冲突）

前端目录采用**独立模块化结构**，每位成员在独立的子文件内开发，互不影响：

```text
apps/web-ui/
├── index.html                  # 主页面入口（已包含路由与公共容器）
├── css/
│   ├── style.css               # 全局设计系统（已有）
│   └── modules/                # 【每位成员编写独立的 CSS 文件】
│       ├── plot-detail.css     # 成员 1
│       ├── decision.css        # 成员 2
│       ├── work-orders.css     # 成员 3
│       ├── forecast.css        # 成员 4
│       └── value-ledger.css    # 成员 5
└── js/
    ├── app.js                  # 路由中枢与分发器（已有）
    ├── api.js                  # 后端 API / Mock 通信客户端（已有）
    ├── mock-data.js            # 基础数据字典（已有）
    └── modules/                # 【每位成员编写独立的 JS 模块文件】
        ├── plot-detail.js      # 成员 1 (export function renderPlotDetail(container, plotId))
        ├── decision-console.js # 成员 2 (export function renderDecisionConsole(container, plotId))
        ├── work-orders.js      # 成员 3 (export function renderWorkOrders(container))
        ├── risk-forecast.js    # 成员 4 (export function renderRiskForecast(container, plotId))
        └── value-ledger.js     # 成员 5 (export function renderValueLedger(container))
```

---

## 三、团队成员任务分工明细

### 任务包 1：地块数字孪生与全景时序大屏 (`plot-detail`)
> **负责成员**：成员 A  
> **核心定位**：解决“看见”的问题，实现多维农田环境全要素实时监控。

* **对应路由**：`#view=plot-detail&plotId=plot-a01`
* **具体开发内容**：
  1. **2.5D / SVG 农田数字孪生微缩沙盘**：
     - 绘制或引入 SVG 形式的温室大棚模型，带有可呼吸闪烁的传感器节点（土壤湿度探针、棚顶温湿度计、水肥一体化阀门）；
     - 点击沙盘上的不同传感器节点，下方曲线自动高亮联动。
  2. **多指标专业时序趋势图（ECharts）**：
     - 支持 **7 小时 / 24 小时 / 168 小时** 范围自由切换；
     - 6 大指标（土壤含水率、空气温湿度、光照、CO2、pH、水箱水位）多轴联动曲线；
     - **作物生长阶段适宜带包络线**：背景用半透明绿色标出当前阶段最佳生长区间，超出即标红警示。
  3. **传感器健康度与数据质量状态面板**：
     - 数据新鲜度实时倒计时（如 `Freshness: 180ms`）；
     - 质量评级指示灯（`GOOD` / `DEGRADED` / `BAD`）与心跳波形图。
* **对接 API 接口**：
  - `GET /api/v1/plots/{plotId}/telemetry?metric=SOIL_MOISTURE&limit=1000`
  - `GET /api/v1/plots/{plotId}/resolved-profile`

---

### 任务包 2：AI 智能诊断中枢与可信决策台 (`decision-console` + `passport`)
> **负责成员**：成员 B  
> **核心定位**：解决“理解与行动”的问题，展现多因果排查推断与安全处方生成。

* **对应路由**：`#view=decision-console` 与 `#view=decision-passport`
* **具体开发内容**：
  1. **根因分析因果推断拓扑树（Mermaid / SVG 渲染）**：
     - 直观展示推断链条：`光温遥测异常 -> 蒸散速率加快 -> 排除传感器漂移(置信度92%) -> 判定为真实土壤缺水`；
     - 多候选原因置信度对比条（`WATER_DEFICIT` 92% vs `SENSOR_DRIFT` 8% vs `DEVICE_FAULT` 5%）。
  2. **交互式处方微调与试算滑块**：
     - 允许操作员拖动滑块自定义微调建议灌溉时长（5~15 分钟）和水量；
     - 动态联动计算出“预计湿度回升至 X%”和“预估成本 Y 元”。
  3. **决策护照（Decision Passport）全链路审计流**：
     - 以卡片流展示：`[遥测输入] ➔ [知识引用高亮] ➔ [白名单Tool调用] ➔ [安全硬门校验] ➔ [虚拟执行ACK] ➔ [回升效果评分]`；
     - 展示当前决策的唯一 `traceId` 追溯码。
* **对接 API 接口**：
  - `POST /api/v1/diagnoses/evaluate { plotId: "..." }`
  - `POST /api/v1/irrigation/estimate { plotId: "..." }`
  - `GET /api/v1/decisions/IRRIGATION_PLAN/{planId}/readiness`
  - `GET /api/v1/decision-passports/{traceId}`

---

### 任务包 3：今日农务看板、巡田核验与水资源调度 (`work-orders` + `resource-coord`)
> **负责成员**：成员 C  
> **核心定位**：解决“协同与人机融合”的问题，排查农务优先级与有限资源分配。

* **对应路由**：`#view=work-orders` 与 `#view=resource-coordination`
* **具体开发内容**：
  1. **今日农务排程看板（Kanban / 甘特排程）**：
     - 分列展示 `紧急告警待办`、`智能处方待审批`、`作物全周期农务任务`；
     - 支持卡片拖拽流转、工单派发与认领状态。
  2. **田间人工巡检录入抽屉（人机证据融合表单）**：
     - 操作员录入便携仪实测比对读数、设备外观巡检状态、巡田现场拍照预览；
     - 提交后自动打上 `USER_PROVIDED` 来源标签，与遥测数据结合修正决策。
  3. **多地块水资源管网容量分配热力图**：
     - 示范农场集中蓄水池实时水位波浪动效（`1,240L / 5,000L`）；
     - 各温室水泵流量冲突检测图（直观展示是否超出了管网最大供水能力 18L/min）。
* **对接 API 接口**：
  - `GET /api/v1/work-items/today`
  - `POST /api/v1/work-orders`
  - `POST /api/v1/inspections`
  - `POST /api/v1/resource-plans/evaluate`

---

### 任务包 4：未来风险推演与情景模拟沙盘 (`risk-forecast` + `scenario-replay`)
> **负责成员**：成员 D  
> **核心定位**：解决“预测与实验”的问题，实现失水预警与双轨回放对比。

* **对应路由**：`#view=risk-forecast` 与 `#view=scenario-replay`
* **具体开发内容**：
  1. **未来风险预测扇形带与倒计时仪表（Time-to-Risk）**：
     - 仪表盘指针显示距离干旱极限的倒计时（如 `72 分钟`）；
     - 1h / 2h / 4h 带有置信区间散点阴影的未来水分衰减预测曲线。
  2. **一键情景注入与故障发生器**：
     - 提供一键注入按钮：`☀️ 持续干旱`、`🔥 极端热浪`、`🌧️ 暴雨积水`、`⚠️ 传感器零点漂移`、`🔌 设备断网离线`。
  3. **双轨对比时间轴（Dual-track Scrubber / 回放滑块）**：
     - 在同一随机种子（Seed）下，同屏呈现：**【分支 A：执行灌溉处方】vs 【分支 B：不采取措施放任干旱】** 两条对比折线；
     - 支持拖动时间轴滑块动态回放演变过程。
* **对接 API 接口**：
  - `GET /api/v1/plots/{plotId}/risk-forecast?metric=SOIL_MOISTURE`
  - `POST /api/v1/scenarios/runs`
  - `POST /api/v1/scenarios/compare`

---

### 任务包 5：效益对账本、作物包管理与全局动效 (`value-ledger` + `crop-packs`)
> **负责成员**：成员 E  
> **核心定位**：解决“经营账本与全局质感”的问题，提升系统综合答辩表现力。

* **对应路由**：`#view=value-ledger` 与 `#view=crop-packs`
* **具体开发内容**：
  1. **经营效益与节水账本（Value Ledger）**：
     - 计划用水 vs 实际用水偏差率（Deviation Rate）柱状对比图；
     - 累计节水、节电折合人民币资产对账卡片；
     - 反事实推演面积图（传统粗放灌溉成本 vs 农智闭环成本对比）。
  2. **作物包（Crop Pack）多阶段参数与知识阅读器**：
     - 番茄、黄瓜的多阶段参数卡片（苗期、生长期、开花期、结果期适宜指标）；
     - 内置 Markdown 农业知识文档阅读器（带语法高亮与规则引用）。
  3. **全局 OceanX 科考风交互与动效打磨**：
     - 背景粒子流动效、全局高斯模糊弹窗优化；
     - 快捷键系统（全局 `⌘K` 快速呼出搜索与跳转）；
     - 全局加载骨架屏与 Toast 交互反馈。
* **对接 API 接口**：
  - `GET /api/v1/value-ledgers`
  - `GET /api/v1/crop-packs`
  - `GET /api/v1/rules`

---

## 四、本地启动与联调测试指引

### 1. 启动静态前端开发服务器
在项目根目录运行（内置 Python 即可，无需安装复杂环境）：

```bash
# 进入前端静态资源目录启动
python -m http.server 3000 --directory apps/web-ui
```
浏览器直接访问：`http://localhost:3000`

### 2. 模式说明（后端在线 / 纯离线双模）
- **离线演示模式**：若未启动 Java 后端，前端会自动无缝切换到 `mock-data.js`，所有图表、按钮、Agent 提问均能正常交互体验。
- **后端联调模式**：启动 Spring Boot 后端服务（默认端口 8080）后，页面顶栏状态会自动切换为 `🟢 后端服务在线`，直接发起真实 REST/SSE 请求。
