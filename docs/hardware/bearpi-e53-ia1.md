# BearPi HM Nano E53_IA1 接入

> 当前状态（2026-09-03）：串口 -> MQTT -> API -> SSE 遥测链路，以及 API -> MQTT -> 串口 -> 固件 -> E53_IA1 风扇/补光灯 GPIO -> ACK 链路均已完成定向实测。真实水泵、阀门及其他硬件执行器不包含在本记录内。

`hardware/bearpi_e53_bridge.py` 是本地串口与 AgriLoop MQTT 的双向适配器。它把板卡的 SHT30 温度/湿度和 BH1750 光照读数转成统一遥测事件，并把经过后端权限、安全门与白名单校验的风扇/补光灯命令交给固件。所有真实数据和 ACK 明确标记：

```text
sourceMode=REAL  provenance=OBSERVED  dataOrigin=HARDWARE
```

后端会按“同一地块 + 同一指标 + 最近 120 秒”进行来源仲裁：真实读数优先，模拟器不会覆盖正在更新的真实指标；真实设备没有该指标时，模拟器仍可补齐其它指标。

## 一条命令启动实时链路

在仓库根目录执行下面一条命令即可同时建立 SSH 隧道、读取板卡串口并把数据发布到服务器 MQTT。SSH 密码会在终端提示时输入，不会写入命令或仓库：

```powershell
py hardware/connect_bearpi.py --port COM5 --plot-id plot-a01
```

默认映射如下：

```text
COM5 @ 115200
  -> SSH 127.0.0.1:1884
  -> connect.westd.seetacloud.com:22602 / 127.0.0.1:1883
  -> agri/farm-demo/plot-a01/telemetry
```

按 `Ctrl+C` 会先停止串口桥接，再关闭本次创建的 SSH 隧道。若本机已经有本项目隧道，可使用 `--reuse-tunnel` 复用它；端口被其它程序占用时，脚本会拒绝启动并给出提示。

## 手动运行（调试用）

先安装一次依赖：

```powershell
py -m pip install -r hardware/requirements.txt
```

服务器 MQTT 只监听远端回环地址，因此先建立 SSH 隧道（窗口保持打开）：

```powershell
ssh -p 22602 -L 1884:127.0.0.1:1883 root@connect.westd.seetacloud.com -N
```

再运行桥接器：

```powershell
py hardware/bearpi_e53_bridge.py --port COM5 --baud 115200 --mqtt --mqtt-host 127.0.0.1 --mqtt-port 1884 --plot-id plot-a01
```

串口输出采用官方样例的三行格式（`Lux Value is ...`、`Humidity is ...`、`Temperature is ...`）时会自动识别；自定义固件也可以每行发送 `{"temperature":26.1,"humidity":63.2,"lux":48000}`。

## 远端控制与安全边界

受控执行仅支持 `bearpi-e53-ia1-a01` 上的 `FAN` 与 `GROW_LIGHT`。默认自动联动如下：

| 执行器 | 开启条件 | 恢复条件 | 最长单次运行 |
|---|---|---|---:|
| 风扇 | `REAL/HARDWARE/OBSERVED/GOOD` 温度连续触发且 `>= 35°C` | 温度 `<= 33°C` | 15 分钟 |
| 补光灯 | 白天 `REAL/HARDWARE/OBSERVED/GOOD` 光照连续触发且 `< 50 lux` | 光照 `>= 60 lux` | 30 分钟 |

设备离线、绑定不符、遥测超过 30 秒、数据质量异常或已有待回执命令时不会自动开启。农场管理员手动开启需要明确确认与幂等键；关闭仍通过同一真实 ACK 链路。前端只在设备详情中显示该 BearPi 的联动设置，不会把规则应用到其他硬件。

固件源码位于 `hardware/firmware/bearpi_e53_ia1_remote/`。使用 HiBurn 时只选择一次生成的 `Hi3861_wifiiot_app_allinone.bin`，列表应只有 loader、app burn 和 boot signed 三行；勾选 `Select all` 与 `Auto burn`，不要勾选 `Formal`。固件通过 Hi3861 AT 白名单接受：

```text
AT+AGRI=<commandId>,FAN,ON,<seconds>
AT+AGRI=<commandId>,FAN,OFF,0
AT+AGRI=<commandId>,LIGHT,ON,<seconds>
AT+AGRI=<commandId>,LIGHT,OFF,0
```

成功启动会输出 `AGRI_BOOT READY REMOTE_ACTUATORS_V2`；GPIO 应用后输出 `AGRI_ACK ... SUCCEEDED APPLIED` 和 `AGRI_STATE ...`。输出默认关闭，固件也会按命令时长自动关闭。

## 先做无硬件解析测试

```powershell
@'
Lux Value is 53.33
Humidity is 44.10
Temperature is 28.13
'@ | py hardware/bearpi_e53_bridge.py --stdin
```

## 当前板卡状态（2026-09-03）

本次已将带远端执行白名单的 E53_IA1 固件刷入 `USB-SERIAL CH340 (COM5)`。复位后实测启动标识为 `AGRI_BOOT READY REMOTE_ACTUATORS_V2`，串口持续输出约 `25.1°C / 52.8%RH / 450 lux` 的变化读数。风扇与补光灯分别完成短时 ON、OFF，四条命令均返回 `SUCCEEDED APPLIED`；结束时 `AGRI_STATE FAN OFF LIGHT OFF`。

串口桥接器已通过 SSH 隧道与服务器联调；服务器 `/api/v1/plots/plot-a01/telemetry` 返回的最新事件带有 `sourceMode=REAL`、`provenance=OBSERVED`、`dataOrigin=HARDWARE`，同一地块的其他指标仍可由模拟器补齐。发布 `0f1034a` 后又完成服务器 API -> MQTT -> 本机桥 -> 固件 ACK 的线上复核：风扇和补光灯分别开启并收到 `SUCCEEDED`，随后关闭，服务器最终状态为 `FAN OFF / GROW_LIGHT OFF`。这里的真实执行范围只包括当前 E53_IA1 风扇与补光灯，不改变真实水泵、阀门、其他现场网关和生产级硬件仍需单独适配/验收的边界。

刷写后若板卡没有自动运行新固件，断开 HiBurn 并按一次板卡 `RESET`；正常运行时不需要保持 HiBurn 打开，只需保持一条命令启动的终端窗口运行。
