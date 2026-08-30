# 地块级模拟策略

## 目的

模拟器以“地块”为隔离边界。每个地块保存一条独立策略和一组参数，API 将配置原子写入 `data/plot-simulation.json`，运行中的 `simulator/runner.py` 按文件修改时间热加载；修改一个地块不会重置其他地块。

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

服务端会限制参数范围，并拒绝“干旱阈值大于或等于积水阈值”的配置。地块详情页的滑块/数值框先生成本地即时预览，保存后才写入服务器并热加载；风险预测页和灌溉建议复用同一策略记录。

模拟时间倍率默认是 `1x`，允许范围为 `1x`～`12x`。这意味着默认每个采样间隔只推进等长的模拟时间；旧配置中的 `60x` 或更高倍率会在 API 和模拟器热加载时收敛到 `12x`，避免持续运行时几分钟跨越数天。灌溉建议的默认执行窗口为生成后 `2`～`12` 分钟，过期后应重新获取建议。

重置目标可以是 `HISTORY`、`FORECAST` 或 `ALL`。重置只删除模拟遥测和预测快照，`sourceMode=REAL` 的硬件数据不会删除。硬件绑定状态按地块独立展示：有新鲜 `REAL/HARDWARE` 心跳时显示“硬件在线，可使用”，超时或断连显示“硬件离线”；硬件状态优先于模拟设备状态参与安全门。

地块详情的“曲线指标”选择器支持逐项查看 `SOIL_MOISTURE`、`AIR_TEMPERATURE`、`AIR_HUMIDITY`、`LIGHT`、`CO2`、`PH`、`WATER_LEVEL` 和 `RAINFALL`。每次只绘制一个指标，并按该指标的单位和物理范围设置纵轴，避免把温度、光照等不同量纲叠在土壤湿度百分比坐标上。切换指标只更换数据窗口，不会改变当前地块策略或其他地块配置。

预测曲线的 0 分钟点严格锚定当前指标最后一条有效历史值及其时间戳；服务端和浏览器预览均使用同一连续性约定。点击“重置预测曲线”后会重新读取该指标的预测快照，若服务暂不可用则显示以历史末点为起点的即时预览，不再从新的 `Date.now()` 位置漂移或放大短窗口噪声。鼠标悬停仍可同时查看历史、预测和置信区间的局部值。

## 数据与图表约定

- 模拟值使用有界随机扰动叠加平滑动力学，不产生超出指标物理范围的跳变；光照遵循昼夜曲线，降雨非负，pH/湿度/水位始终裁剪到合法范围。
- 历史曲线只展示实际返回的遥测；预测曲线同时返回 `expected/lower/upper`、风险边界、`timeToRiskMinutes` 和策略版本。
- ECharts 与农户 SVG 曲线均支持鼠标悬浮局部数据浮窗。正式会话缺少数据时显示 `UNAVAILABLE`，不使用演示值补造事实。

## 服务启动

Supervisor 配置默认自动启动 `agriloop-simulator`。手工运行时：

```bash
APP_ROOT=/srv/agriloop /srv/agriloop/app/scripts/run-simulator.sh
```

也可以通过 `SIMULATION_CONFIG_PATH` 指定策略文件路径。API 和模拟器都应在同一应用目录下运行，以保证相对路径一致。
