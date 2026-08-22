# 农智闭环后端远端验收记录

更新时间：2026-08-22（Asia/Shanghai）

## 环境

- 目标目录：`/srv/agriloop`
- 运行方式：Java 17 + Spring Boot 3 + Supervisor（容器无 Docker/systemd）
- 依赖：PostgreSQL 14、Redis 6、Mosquitto 2
- API：`127.0.0.1:8080`（仅 API 端口按远端网络策略暴露）
- 默认 AI：`rules-only`；虚拟执行器：`virtual`
- 演示账号：`farmer`、`operator`、`admin`、`sysadmin`，统一演示密码在受控环境中维护，不写入仓库。

## 已复现证据

| 验收项 | 结果 | 证据 |
|---|---|---|
| Flyway/PostgreSQL 迁移 | PASS | `flyway_schema_history` v1，核心表已创建 |
| API 健康 | PASS | `GET /actuator/health` 返回 `{"status":"UP"}` |
| 登录/JWT/RBAC | PASS | 管理员登录；越权地块请求返回 HTTP 403 |
| 认证错误合同 | PASS | 缺失/无效 Bearer token 返回 HTTP 401 的统一 `ApiEnvelope`，错误码 `AUTH_REQUIRED` |
| 统一响应 envelope | PASS | `requestId/timestamp/schemaVersion/data` 均返回 |
| 12 条 HTTP 遥测 + 重复事件 | PASS | 重复 `eventId` 返回 `duplicate=true`，数据库不重复 |
| Redis Streams | PASS | `agri.telemetry` 有消息；依赖状态 `redis=UP` |
| Redis Streams 消费组/死信 | PASS | group=`agriloop-api`、consumer=`api-worker`、pending=0、deadLetters=0；固定遥测后 acknowledged 持续增加 |
| MQTT 入站桥接 | PASS | 远端 `mqtt-check` 通过 Mosquitto 发布 18 条（3 地块 × 6 指标）；Redis stream 长度和 PostgreSQL `telemetry` 分组计数同步增加 |
| MQTT 模拟器 | PASS | 固定 seed `42`、`drought`、`NO_ACTION` 生成 1,080 条消息；PostgreSQL 总遥测数增加 1,080 |
| 干旱诊断 | PASS | `primaryCause=WATER_DEFICIT` |
| 传感器漂移分流 | PASS | `primaryCause=SENSOR_DRIFT`、`readinessStatus=NEEDS_EVIDENCE`、处方 `executable=false` |
| 处方安全门 | PASS | 正常新鲜 GOOD 数据返回 `READY`；质量 BAD/漂移不生成可执行处方 |
| 预测弃权/区间 | PASS | 预测使用 GOOD 样本；样本不足返回 `UNAVAILABLE` |
| 命令幂等/非成功路径 | PASS | 相同 `idempotencyKey` 只返回同一 command；FAILED ACK 评价为 `INCONCLUSIVE`，失败/超时不会占用成功灌溉冷却窗口 |
| MQTT 命令/成功闭环 | PASS | `cmd-261a1476f41c` 返回 `transport=MQTT`、ACK=`SUCCEEDED`、实际 108 L、效果=`COMPLETED`、结果=`GOOD`、评分 `0.94` |
| 资源容量 | PASS | 1,600 L 需求超过 900 L 容量，返回 `INFEASIBLE` |
| SSE | PASS | 首帧 `event:connected` 可读 |
| 回放隔离 | PASS | `NO_ACTION/EXECUTE` 写入 `scenario-event`，不改变主遥测/设备/告警 |
| 策略候选 | PASS | DRAFT 不能跳过离线验证；验证后才可 APPROVED |

## 自动化测试

远端执行：

```text
./gradlew :apps:api-service:test :apps:api-service:bootJar
BUILD SUCCESSFUL
```

覆盖 Spring Context、种子登录、Crop Pack、遥测幂等、漂移分流、READY 处方、资源不可行、策略状态机和回放隔离。

远端最新收口还复跑了 `scripts/acceptance_smoke.py`，输出 `status=PASS`；脚本为每次运行生成唯一前缀，同时保留同一运行内的重复事件/命令断言，因此可在持久化数据库上反复执行。随后用独立幂等键完成了一次 MQTT 成功 ACK 闭环。运行中的源码/JAR 已与工作区最后一版哈希一致。

## 已知边界

- 本期不实现真实传感器、GPIO、鸿蒙端、真实视觉/语音模型或真实生产控制器。
- Redis/MQTT/AI 依赖不可用时 API 会明确返回 `DEGRADED`/`rules-only`，核心规则流程继续运行；standalone profile 使用 H2/内存回退。
- 当前仓库未包含前端页面；REST/SSE/OpenAPI 已提供给前端或答辩演示使用。
