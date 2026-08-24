# 农智闭环后端远端验收记录

更新时间：2026-08-24（Asia/Shanghai）

## 环境

- 目标目录：`/srv/agriloop`
- 运行方式：Java 17 + Spring Boot 3 + Supervisor（容器无 Docker/systemd）
- 依赖：PostgreSQL 14、Redis 6、Mosquitto 2
- API：`127.0.0.1:8080`，由 Nginx 6006 自定义服务代理
- AI：`openai-compatible` -> 本机 vLLM `Qwen3.8-27B` + `agriloop-qwen38-agri` 保守 LoRA；规则/数据库/RAG 优先，虚拟执行器：`virtual`
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
| main 公网 Web/API | PASS | 代码整合提交 `08a7b90` 已部署；AutoDL 自定义服务 `https://u558871-7873be733236.westd.seetacloud.com:8443`；品牌入口 `/agriloop/`、根路径健康检查和 JWT API 可访问 |
| OpenAI-compatible Qwen | PASS | 非快捷诊断请求返回 `adapter=openai-compatible`、`model=agriloop-qwen38-agri`、`degraded=false`、`latencyMs=5130`；vLLM 仅监听 `127.0.0.1:8000` |
| Web Copilot 真实对话 | PASS | 独立 `/agriloop/login.html` 登录页保存 JWT；登录后网页显示 Qwen 实时回答、模型延迟和可读知识引用；思维标签、提示词、工具字段和 traceId 不进入对话正文；未登录/失败不会伪装成真实回答 |
| 五分支前端公网回归 | PASS | 真实 Chromium 通过 JWT 登录；返回 3 个后端地块；rium WebGL 背景、固定居中弹窗、无三角尺、独立作物沙盘 WebGL 均通过，未捕获 page error |
| Qwen LoRA 微调与安全回归 | PASS | 双 GPU BF16、LoRA q/k/v/o、rank=8、18 步保守训练；适配器只影响表达，离线/质量降级/控制命令仍由后端硬门拦截 |
| 数据服务隔离 | PASS | PostgreSQL/MQTT/vLLM 仅内部访问；Spring API 绑定 `127.0.0.1`，公网仅经 Nginx 代理 |

## 自动化测试

远端执行：

```text
./gradlew test
./gradlew :apps:api-service:bootJar
BUILD SUCCESSFUL
```

覆盖 Spring Context、种子登录、Crop Pack、遥测幂等、漂移分流、READY 处方、资源不可行、策略状态机和回放隔离。

远端最新收口复跑了 `scripts/acceptance_smoke.py`。为避免正在运行的模拟器恰好生成 `DEGRADED` 指标而触发预期的 `HUMAN_REVIEW`，验收时短暂停止模拟器，并用同一窗口已有值写入六类 `GOOD` 遥测；没有清库、改规则或绕过安全门。最终输出 `status=PASS`、`duplicateTelemetry=true`、`diagnosis=WATER_DEFICIT`、`readiness=READY`、失败命令效果 `INCONCLUSIVE`，随后模拟器恢复运行。运行代码对应 `main` 代码整合提交 `08a7b90`。

## 已知边界

- 本期不实现真实传感器、GPIO、鸿蒙端、真实视觉/语音模型或真实生产控制器。
- Redis/MQTT/AI 依赖不可用时 API 会明确返回 `DEGRADED`/`rules-only`，核心规则流程继续运行；当前远端 AI 已启用 Qwen，standalone profile 仍使用 H2/内存回退。
- AutoDL 分配的主机名不能在服务器内直接改成自定义域名；当前用 `/agriloop/` 作为稳定品牌入口。若要使用 `agri.example.com`，需将自有域名 DNS 指向一个能反代该 AutoDL 服务的入口。
- 静态 Web 已随 Nginx 自定义服务发布。首次打开 `/agriloop/` 会跳转到独立登录页；登录后 Copilot 才调用真实 Qwen，演示会话只在后端不可用时有效。
