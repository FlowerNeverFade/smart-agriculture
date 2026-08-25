# BearPi HM Nano E53_IA1 接入

`hardware/bearpi_e53_bridge.py` 是本地串口到 AgriLoop MQTT 的适配器。它把板卡的 SHT30 温度/湿度和 BH1750 光照读数转成统一遥测事件，并明确标记：

```text
sourceMode=REAL  provenance=OBSERVED  dataOrigin=HARDWARE
```

后端会按“同一地块 + 同一指标 + 最近 120 秒”进行来源仲裁：真实读数优先，模拟器不会覆盖正在更新的真实指标；真实设备没有该指标时，模拟器仍可补齐其它指标。

## 本机运行

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

## 先做无硬件解析测试

```powershell
@'
Lux Value is 53.33
Humidity is 44.10
Temperature is 28.13
'@ | py hardware/bearpi_e53_bridge.py --stdin
```

## 当前板卡状态

本次联调识别到 `USB-SERIAL CH340 (COM5)`，但板上现有固件是 `StreetLight MQTT` 示例，串口只提供 AT 命令和联网日志，没有输出 E53_IA1 的温度/湿度/光照三行数据。因此桥接器和服务器链路已准备好，但要看到真实硬件事件，还需要把 E53_IA1 传感器示例固件烧录到 HM Nano。烧录会覆盖现有固件，需要在确认后由现场人员操作 HiBurn 并按下板卡 RESET；在此之前不要把“真实硬件已接入”作为验收结论。
