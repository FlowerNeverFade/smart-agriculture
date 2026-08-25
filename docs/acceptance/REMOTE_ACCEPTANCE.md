# 农智闭环后端远端验收记录

更新时间：2026-08-24（Asia/Shanghai）

## 环境

- 目标目录：`/srv/agriloop`
- 运行方式：Java 17 + Spring Boot 3 + Supervisor（容器无 Docker/systemd）
- 依赖：PostgreSQL 14、Redis 6、Mosquitto 2
- API：`127.0.0.1:8080`，由 Nginx 6006 自定义服务代理
- AI：`openai-compatible` -> 本机 vLLM `Qwen3.8-27B` + `agriloop-qwen38-agri` 保守 LoRA；规则/数据库/RAG 优先，虚拟执行器：`virtual`
- 演示账号：`farmer`（种植农户）、`admin`（农场管理员）、`sysadmin`（系统管理员），统一演示密码在受控环境中维护，不写入仓库。

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
| main 公网 Web/API | PASS | 当前运行发布提交 `3cdf4b7`（包含右栏功能修复 `7d33092`）；AutoDL 自定义服务 `https://u558871-7873be733236.westd.seetacloud.com:8443`；品牌入口 `/agriloop/`、根路径健康检查和 JWT API 可访问 |
| 智能诊断与决策中枢 | PASS | 公网主页及模块资源 HTTP 200；新鲜六指标数据 `WATER_DEFICIT -> READY`，命令幂等和决策护照通过；`SENSOR_DRIFT -> NEEDS_EVIDENCE / diagnosisSafety=FAIL / executable=false` |
| OpenAI-compatible Qwen | PASS | 非快捷诊断请求返回 `adapter=openai-compatible`、`model=agriloop-qwen38-agri`、`degraded=false`、`latencyMs=5130`；vLLM 仅监听 `127.0.0.1:8000` |
| Web Copilot 真实对话 | PASS | 独立 `/agriloop/login.html` 登录页保存 JWT；登录后网页显示 Qwen 实时回答、模型延迟和可读知识引用；思维标签、提示词、工具字段和 traceId 不进入对话正文；未登录/失败不会伪装成真实回答 |
| Agent 连续问答 | PASS | 同一会话依次查询状态、追问“复测清单”、询问离线含义，意图分别为 `PLOT_STATUS/RETEST_CHECKLIST/PLOT_STATUS`；三次均为 `adapter=openai-compatible`、`degraded=false`，回答内容互不相同且 512-token 配置下无截断 |
| 账号级对话历史 | PASS | `/agent/history` 保存同一会话 6 条 USER/ASSISTANT 消息；重启 API 后仍从 PostgreSQL 读取；消息归属仅为当前 `userId`，另一账号读取该 `conversationId` 返回 HTTP 403；公网 Web 已显示“我的对话记录” |
| 五分支前端公网回归 | PASS | 真实 Chromium 通过 JWT 登录；返回 3 个后端地块；rium WebGL 背景、固定居中弹窗、无三角尺、独立作物沙盘 WebGL 均通过，未捕获 page error |
| `rium_dev-v2` 增量前端回归 | PASS（公网） | 合并提交 `9066edb`，最终收口 `7d33092`；六指标地块时序、右侧栏真实折叠、卡片按内容展开不互相覆盖、中心内嵌子模块、背景动画兼容和无三角尺均通过；主面板毛玻璃检查通过；本地与公网 JWT 真实 Chromium 均为 27/27 |
| Qwen LoRA 微调与安全回归 | PASS | 双 GPU BF16、LoRA q/k/v/o、rank=8、18 步保守训练；适配器只影响表达，离线/质量降级/控制命令仍由后端硬门拦截 |
| 数据服务隔离 | PASS | PostgreSQL/MQTT/vLLM 仅内部访问；Spring API 绑定 `127.0.0.1`，公网仅经 Nginx 代理 |

## 自动化测试

远端执行：

```text
./gradlew test
./gradlew :apps:api-service:bootJar
BUILD SUCCESSFUL
```

当前 Spring 用例 14/14，通过 Spring Context、种子登录、Crop Pack、遥测幂等、按指标跳变阈值、漂移分流、READY 处方、资源不可行、策略状态机、回放隔离、复测追问路由、历史持久化和跨用户隔离。Web `scripts/verify-webui.mjs` 为 real 82/82（本轮加入毛玻璃合同检查），真实 Chromium `scripts/branch-integration-smoke.mjs` 为 27/27；通过诊断中枢、历史入口、右栏折叠、卡片内容高度/间距、中心内嵌模块、六指标时序和无三角尺回归。

远端最新收口通过公网域名复跑了 `scripts/acceptance_smoke.py`。脚本为六类指标各写入两条稳定且可审计的 `GOOD` 上下文数据，不清库、不改规则、不绕过安全门；正常模拟器保持运行。最终输出 `status=PASS`、`duplicateTelemetry=true`、`diagnosis=WATER_DEFICIT`、`readiness=READY`、失败命令效果 `INCONCLUSIVE`，决策护照可按同一 `traceId` 查询。另行复测漂移硬门及 Qwen：漂移不可执行；模型返回 `adapter=openai-compatible`、`llm.model=agriloop-qwen38-agri`、`degraded=false`。当前 `main` 运行发布提交为 `3cdf4b7`（功能修复 `7d33092`），可由 `/srv/agriloop/DEPLOYED_COMMIT` 与公网健康接口复核。

## 已知边界

- 本期不实现真实传感器、GPIO、鸿蒙端、真实视觉/语音模型或真实生产控制器。
- Redis/MQTT/AI 依赖不可用时 API 会明确返回 `DEGRADED`/`rules-only`，核心规则流程继续运行；当前远端 AI 已启用 Qwen，standalone profile 仍使用 H2/内存回退。
- AutoDL 分配的主机名不能在服务器内直接改成自定义域名；当前用 `/agriloop/` 作为稳定品牌入口。若要使用 `agri.example.com`，需将自有域名 DNS 指向一个能反代该 AutoDL 服务的入口。
- 静态 Web 已随 Nginx 自定义服务发布。首次打开 `/agriloop/` 会跳转到独立登录页；登录后 Copilot 才调用真实 Qwen，演示会话只在后端不可用时有效。
