# 虚拟传感器

按《基本功能清单》生成农田监测数据：土壤湿度、空气温度、土壤温度、空气湿度、光照，并模拟设备心跳与灌溉开关。

默认 3 台设备：

| device_id | 地块 | 环境 | 作物 |
|-----------|------|------|------|
| `GH-001` | 北棚 | 温室 | 番茄 |
| `GH-002` | 南棚 | 温室 | 黄瓜 |
| `FD-001` | 东田 | 大田 | 水稻 |

温室数据更平稳；大田温差更大，并可能出现短时降雨。灌溉开启后土壤湿度会回升。

## 启动

```bash
cd /Users/previous_rium/Desktop/Smart_Agriculture
conda env create -f environment.yml
conda activate smart-agriculture
```

先看一轮实时数据（不需要 MQTT）：

```bash
python3 -m virtual_sensor --once
```

持续打印到终端：

```bash
python3 -m virtual_sensor --stdout
```

生成过去 7 天历史数据（给折线图用）：

```bash
python3 -m virtual_sensor --backfill 7 --output data/history.jsonl
```

接 MQTT（本地 Broker）：

```bash
docker compose up -d
python3 -m virtual_sensor
```

## MQTT 主题

| 方向 | 主题 | 说明 |
|------|------|------|
| 上报 | `agri/{device_id}/telemetry` | 传感器读数 |
| 心跳 | `agri/{device_id}/heartbeat` | 在线状态 |
| 下行 | `agri/{device_id}/command` | 灌溉等控制指令 |
| 回执 | `agri/{device_id}/status` | 执行结果 |

开启北棚灌溉：

```bash
mosquitto_pub -t agri/GH-001/command -m '{"action":"irrigation","state":"on"}'
```

关闭：

```bash
mosquitto_pub -t agri/GH-001/command -m '{"action":"irrigation","state":"off"}'
```

湿度过低自动开泵（设备侧演示，默认关闭，可在 `config.yaml` 打开）：

```json
{"action":"auto_irrigation","enabled":true,"moisture_min":30,"moisture_max":55}
```

遥测示例：

```json
{
  "device_id": "GH-001",
  "plot_id": "plot-north",
  "plot_name": "北棚",
  "crop": "番茄",
  "kind": "greenhouse",
  "timestamp": "2026-08-21T16:40:00+08:00",
  "online": true,
  "irrigation": "off",
  "sensors": {
    "soil_moisture": 47.82,
    "soil_temperature": 22.41,
    "temperature": 24.16,
    "air_humidity": 68.35,
    "light_lux": 28140.2
  },
  "weather": { "raining": false }
}
```

设备清单和采样间隔在 `virtual_sensor/config.yaml`。
