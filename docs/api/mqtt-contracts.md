# MQTT 合同

Broker 默认只绑定本机 `tcp://127.0.0.1:1883`。`farmId`、`plotId`、`deviceId` 只允许来自已授权/已绑定记录，命令主题由后端工具生成，Agent 不可直接拼接。

| 主题 | 方向 | QoS | 合同 |
|---|---|---:|---|
| `agri/{farmId}/{plotId}/telemetry` | 模拟器 -> API | 1 | `docs/api/schemas/telemetry.schema.json` |
| `agri/{farmId}/{plotId}/device/status` | 设备 -> API | 1 | `{deviceId,status,lastSeen,healthScore}` |
| `agri/{farmId}/{plotId}/command` | API -> 虚拟执行器 | 1 | `{commandId,planId,plotId,type,durationSeconds,idempotencyKey}` |
| `agri/{farmId}/{plotId}/command/ack` | 执行器 -> API | 1 | `docs/api/schemas/command-ack.schema.json` |

遥测进入 `agri.telemetry` Redis Stream；消费组为 `agriloop-api`。缺少 payload 或处理失败的记录进入 `agri.telemetry.dlq`，同时保留 `dead-letter` 审计记录。重复 `eventId` 不重复写入 PostgreSQL。
