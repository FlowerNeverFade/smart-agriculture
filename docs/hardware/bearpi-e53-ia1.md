# BearPi HM Nano E53_IA1 接入

`hardware/bearpi_e53_bridge.py` 是本地串口到 AgriLoop MQTT 的适配器。它把板卡的 SHT30 温度/湿度和 BH1750 光照读数转成统一遥测事件，并明确标记：

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

## 先做无硬件解析测试

```powershell
@'
Lux Value is 53.33
Humidity is 44.10
Temperature is 28.13
'@ | py hardware/bearpi_e53_bridge.py --stdin
```

## 当前板卡状态（2026-08-26）

本次已按用户确认将 E53_IA1 温湿度/光照示例固件刷入 `USB-SERIAL CH340 (COM5)`：HiBurn 日志最后连续显示 `Execution Successful`，随后串口以 115200 读取到官方样例的连续读数，例如 `Lux Value is 470.83`、`Humidity is 60.88`、`Temperature is 30.31`，并且数值随采样变化。

串口桥接器已在本机实测通过 SSH 隧道发布到服务器；服务器 `/api/v1/plots/plot-a01/telemetry` 返回的最新事件带有 `sourceMode=REAL`、`provenance=OBSERVED`、`dataOrigin=HARDWARE`，同一地块的其它指标仍可由模拟器补齐。运行时代码由发布提交 `b1048ef` 验收，服务器本机 acceptance smoke 已通过，后续提交仅同步验收记录。这里是本次用户明确追加的真实硬件适配验收，不改变项目软件基线对生产现场网关、GPIO 执行器和生产级设备驱动的范围说明。

刷写后若板卡没有自动运行新固件，断开 HiBurn 并按一次板卡 `RESET`；正常运行时不需要保持 HiBurn 打开，只需保持一条命令启动的终端窗口运行。
