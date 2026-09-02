# 地块级模拟策略

## 目的

模拟器以“地块”为隔离边界。每个地块保存一条独立策略和一组参数。默认启动路径下，API 进程内的 `SimulationEngine` 直接读取这些记录并调用 `AgriEngine.ingest`，**不再经 MQTT 发布模拟遥测**，也不再依赖独立 Python 进程。

内置场景：

| 编码 | 页面名称 | 主要变化 |
| --- | --- | --- |
| `NORMAL` | ☀️ 正常运行 | 标准昼夜曲线、低幅随机扰动 |
| `DROUGHT` | 🏜️ 干旱场景 | 高温、低湿、土壤湿度持续下降 |
| `HEAVY_RAIN` | 🌧️ 暴雨场景 | 降雨强度、低温、高湿和土壤快速增湿；灌溉建议转人工复核 |
| `SENSOR_DRIFT` | 📡 传感器漂移 | 环境变化有限，读数按漂移速率逐步偏移并降低质量置信度 |
| `DEVICE_OFFLINE` | 🔌 设备离线 | 按离线比例间歇停止遥测，保留最后读数并拒绝无证据预测 |

## 操作接口

```http
GET  /api/v1/plots/{plotId}/simulation
PUT  /api/v1/plots/{plotId}/simulation
POST /api/v1/plots/{plotId}/simulation/reset
```

保存示例：

```json
{
  "scenario": "HEAVY_RAIN",
  "parameters": {
    "rainfallRate": 55,
    "soilMoistureTrendPerHour": 8.5,
    "waterloggingThreshold": 78,
    "forecastHours": 4
  }
}
```

服务端会限制参数范围，并拒绝“干旱阈值大于或等于积水阈值”的配置。地块详情页的滑块/数值框先生成本地即时预览，保存后才写入服务器；运行中的进程内引擎在下一拍读取新策略。风险预测页和灌溉建议复用同一策略记录。系统管理员「仿真模拟」页的全局采样间隔与时间流速保存后立即作用于引擎，不必重启 API；场景矩阵只改场景，不覆盖已保存的全局流速。

模拟时间倍率默认是 `144x`（墙上时钟 10 分钟 ≈ 1 个模拟日），允许范围为 `1x`～`288x`。旧配置中的实时 `1x` 会在未显式保存时升级为 `144x`；高于 `288x` 的值会在 API 和引擎中收敛到上限。土壤湿度、温度、降雨按**每模拟小时**的自然速率演化：正常日蒸发约 `3%/日`，干旱约 `11%/日`，暴雨日增湿约 `12%～20%/日`。虚拟灌溉后的土壤湿度增量按处方水量反算：`Δ湿度 = waterLitre / (areaM2 × 0.08)`，水位按 `900L` 水箱容量下降，并同步写入进程内引擎状态，避免下一拍把湿度冲回。灌溉建议的默认执行窗口为生成后 `2`～`12` 分钟，过期后应重新获取建议。

### 光照的动态目标

每个 Crop Pack 阶段的 `target.lightLow/lightHigh` 表示白天生长目标；`target.lightSchedule` 负责时段切换，默认配置为 `06:00`—`18:00` 白天、夜间 `0`—`1000 lux` 休息带。夜间不生成 `LIGHT_DEFICIT` 缺光告警，也不会开放虚拟补光；若夜间超过上限仍会提示光照过强。前端曲线按采样时间绘制昼/夜两段目标带，后端规则、健康评分、诊断和虚拟执行共用同一时区（`Asia/Shanghai`）和 Crop Pack 配置。该光照通道仍标记为 `SIMULATION_ONLY`，时段与阈值可随作物、设施和地区的 Crop Pack 版本调整。

重置目标可以是 `HISTORY`、`FORECAST` 或 `ALL`。重置只删除模拟遥测和预测快照，`sourceMode=REAL` 的硬件数据不会删除。硬件绑定状态按地块独立展示：有新鲜 `REAL/HARDWARE` 心跳时显示“硬件在线，可使用”，超时或断连显示“硬件离线”；硬件状态优先于模拟设备状态参与安全门。

地块详情的“曲线指标”选择器支持逐项查看 `SOIL_MOISTURE`、`AIR_TEMPERATURE`、`AIR_HUMIDITY`、`LIGHT`、`CO2`、`PH`、`WATER_LEVEL` 和 `RAINFALL`。每次只绘制一个指标，并按该指标的单位和物理范围设置纵轴，避免把温度、光照等不同量纲叠在土壤湿度百分比坐标上。切换指标只更换数据窗口，不会改变当前地块策略或其他地块配置。

预测曲线的 0 分钟点严格锚定当前指标最后一条有效历史值及其时间戳；服务端和浏览器预览均使用同一连续性约定。点击“重置预测曲线”后会重新读取该指标的预测快照，若服务暂不可用则显示以历史末点为起点的即时预览，不再从新的 `Date.now()` 位置漂移或放大短窗口噪声。鼠标悬停仍可同时查看历史、预测和置信区间的局部值。

## 数据与图表约定

- 模拟值使用有界随机扰动叠加平滑动力学，不产生超出指标物理范围的跳变；光照遵循昼夜曲线，降雨非负，pH/湿度/水位始终裁剪到合法范围。
- 历史曲线只展示实际返回的遥测；预测曲线同时返回 `expected/lower/upper`、风险边界、`timeToRiskMinutes` 和策略版本。
- ECharts 与农户 SVG 曲线均支持鼠标悬浮局部数据浮窗。正式会话缺少数据时显示 `UNAVAILABLE`，不使用演示值补造事实。

## 服务启动

`standalone` 与 `simulation` 模式下，API 启动后自动运行进程内模拟器。系统管理员可在「仿真模拟」页启停，并调节：

- 采样间隔：5–60 秒，默认 20 秒，控制墙上时钟多久产生一批遥测
- 时间流速：1–288 倍，默认 144（10 分钟 ≈ 1 个模拟日）

对应接口：

```http
GET  /api/v1/simulator/status
POST /api/v1/simulator/start
POST /api/v1/simulator/stop
PUT  /api/v1/simulator/settings
```

`scripts/run-simulator.sh` 为兼容旧部署的空操作脚本，不会启动任何外部进程。物理回归由 `SimulationEngineTest` 与 Gradle API 测试覆盖。

真实硬件（当前为 BearPi E53_IA1）已通过 MQTT 接入；模拟遥测由 API 进程内引擎直接写入，不走 MQTT。两类来源在事件和页面上明确区分。
