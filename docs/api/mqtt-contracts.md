# MQTT 合同

Broker 默认只绑定本机 `tcp://127.0.0.1:1883`。`farmId`、`plotId`、`deviceId` 只允许来自已授权/已绑定记录，命令主题由后端工具生成，Agent 不可直接拼接。

| 主题 | 方向 | QoS | 合同 |
|---|---|---:|---|
| `agri/{farmId}/{plotId}/telemetry` | 模拟器或 BearPi/真实设备适配器 -> API | 1 | `docs/api/schemas/telemetry.schema.json`；真实输入必须带 `sourceMode=REAL`、`dataOrigin=HARDWARE` |
| `agri/{farmId}/{plotId}/device/status` | 模拟器或设备适配器 -> API | 1 | `{deviceId,status,lastSeen,healthScore}`；状态来源必须可追溯 |
| `agri/{farmId}/{plotId}/command` | API -> 虚拟执行器或已绑定硬件桥 | 1 | 虚拟灌溉沿用 `{commandId,planId,plotId,type,durationSeconds,idempotencyKey}`；BearPi 仅接受下述白名单合同 |
| `agri/{farmId}/{plotId}/command/ack` | 执行器或硬件桥 -> API | 1 | 虚拟命令使用 `docs/api/schemas/command-ack.schema.json`；BearPi 回执使用下述硬件 ACK 合同 |

遥测进入 `agri.telemetry` Redis Stream；消费组为 `agriloop-api`。缺少 payload 或处理失败的记录进入 `agri.telemetry.dlq`，同时保留 `dead-letter` 审计记录。重复 `eventId` 不重复写入 PostgreSQL。

## BearPi E53_IA1 风扇与补光灯

仅设备 `bearpi-e53-ia1-a01` 接受 `FAN_SET` 和 `LIGHT_SET`。后端生成主题和参数，桥接器不得接受任意串口、MQTT 或 Shell 命令。

```json
{
  "commandId": "bearpi-cmd-...",
  "farmId": "farm-demo",
  "plotId": "plot-a01",
  "deviceId": "bearpi-e53-ia1-a01",
  "type": "FAN_SET",
  "actuator": "FAN",
  "targetState": "ON",
  "durationSeconds": 900,
  "idempotencyKey": "bearpi-actuator:...",
  "executionMode": "HARDWARE",
  "sourceMode": "REAL",
  "dataOrigin": "HARDWARE",
  "provenance": "OBSERVED"
}
```

桥接器将命令映射为固定 `AT+AGRI` 格式，只有固件实际切换 GPIO 并返回 `AGRI_ACK` 后才发布终态：

```json
{
  "ackId": "ack-...",
  "commandId": "bearpi-cmd-...",
  "deviceId": "bearpi-e53-ia1-a01",
  "actuator": "FAN",
  "targetState": "ON",
  "actualState": "ON",
  "status": "SUCCEEDED",
  "result": "APPLIED",
  "executionMode": "HARDWARE",
  "sourceMode": "REAL",
  "dataOrigin": "HARDWARE",
  "provenance": "OBSERVED"
}
```

同一 `commandId` 幂等处理；串口写入失败、固件拒绝或 8 秒未收到固件 ACK 时桥接器返回 `FAILED/TIMEOUT`，后端 15 秒仍未收到 MQTT ACK 时也收敛为 `TIMEOUT`，不得把期望状态写成真实状态。
