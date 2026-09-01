# 账号管理实现说明

## 已实现范围

登录页在原有液态背景和玻璃面板内提供登录、创建账号、忘记密码和恢复码确认四个状态。登录时必须选择账户身份，服务端会核对所选身份与账号角色；系统公开三类角色：`FARMER`（种植农户）、`FARM_ADMIN`（农场管理员）和 `SYSTEM_ADMIN`（系统管理员）。`FARMER` 与 `FARM_ADMIN` 可直接注册并加入示范农场；`SYSTEM_ADMIN` 必须额外提交仅由部署环境保存的服务端授权码。

## 接口与数据流

- `POST /api/v1/auth/register`：输入 `username`、`password`、`role`，仅 `SYSTEM_ADMIN` 需要 `authorizationCode`；校验账号格式、密码强度和授权码后，使用 BCrypt 保存密码和恢复码哈希，返回 JWT、用户信息及仅展示一次的恢复码。兼容旧调用：省略 `role` 时仍注册为 `FARMER`。
- `GET /api/v1/users`：仅 `SYSTEM_ADMIN` 可读取全平台真实账号、安全角色范围和真实创建/更新时间；响应不包含密码、恢复码哈希或凭据版本。
- `POST /api/v1/users`：仅 `SYSTEM_ADMIN` 可创建三类账号。创建 `FARMER` 时选择农场并可选地块，创建 `FARM_ADMIN` 时选择农场并自动授予完整农场范围，创建 `SYSTEM_ADMIN` 时仍须再次填写服务端授权码。
- `PATCH /api/v1/users/{userId}/status`：仅 `SYSTEM_ADMIN` 可启停 `FARMER`、`FARM_ADMIN`。
- `DELETE /api/v1/users/{userId}`：仅 `SYSTEM_ADMIN` 可删除 `FARMER`、`FARM_ADMIN`；所有 `SYSTEM_ADMIN` 账号永久保护，不能停用或删除。
- `/api/v1/farm-members`：只用于本场种植农户读取和管理；即使调用者是管理员，也明确拒绝通过该接口创建或修改 `FARM_ADMIN`、`SYSTEM_ADMIN`。
- `POST /api/v1/auth/password/reset`：输入 `username`、`recoveryCode`、`newPassword`；校验成功后更新密码、轮换恢复码并递增 `credentialVersion`。
- `POST /api/v1/auth/login`：前端输入 `username`、`password`、`role`，后端同时核对凭据和身份；旧客户端省略 `role` 时继续按原合同登录。
- `GET /api/v1/auth/me`：返回 JWT 对应用户、角色标签和权限清单；JWT 携带 `credentialVersion`，密码重设后旧令牌立即失效。
- `GET /api/v1/auth/roles`：返回登录页可用的三类角色元数据。
- `GET /api/v1/overview`：按 JWT 的地块范围过滤总览，不把未分配地块返回给浏览器。

恢复码格式为四组四位安全随机字符。服务端不保存明文恢复码，也不把密码、恢复码或系统管理员授权码写入审计日志。`SYSTEM_ADMIN_AUTHORIZATION_CODE` 不提供仓库默认值；未配置时系统管理员创建功能关闭。授权码使用恒定时间比较，同一尝试主体连续失败 5 次后限制 15 分钟。

## 失败与降级路径

- 账号需为 4–32 位字母、数字、点、下划线或短横线；密码需为 8–64 位且包含字母和数字，不能包含账号。
- 登录身份不匹配与账号或密码错误统一返回 `401 AUTH_INVALID`，避免泄露账号对应角色。
- `FARMER` 与 `FARM_ADMIN` 可直接注册；`SYSTEM_ADMIN` 未配置授权码时返回 `503 SYSTEM_ADMIN_CREATION_DISABLED`，授权码错误返回 `403 SYSTEM_ADMIN_AUTHORIZATION_INVALID`，连续失败达到阈值返回 `429 SYSTEM_ADMIN_AUTHORIZATION_RATE_LIMITED`。旧操作员身份仍返回 `403 ACCOUNT_ROLE_REQUIRES_ADMIN`，未知角色返回 `400 ACCOUNT_ROLE_INVALID`。
- 所有账号创建、状态和删除操作必须先持久化成功；数据库不可用返回 `503 ACCOUNT_PERSISTENCE_UNAVAILABLE`，不会生成重启后消失的内存账号。
- 对任意系统管理员的停用或删除统一返回 `403 ACCOUNT_SYSTEM_ADMIN_PROTECTED`。
- 重复账号返回 `409 ACCOUNT_EXISTS`；账号或恢复码错误统一返回 `401 ACCOUNT_RECOVERY_INVALID`，避免暴露账号是否存在。
- 同一账号 15 分钟内连续失败 5 次后返回 `429 ACCOUNT_RECOVERY_LOCKED`。
- 注册和重置必须连接后端；网络不可用时不创建浏览器本地假账号。离线演示只提供三类演示身份，且与在线角色标签保持一致。
- 种子演示账号为 `farmer`、`admin`、`sysadmin`，没有恢复码，继续使用固定的 `demo123`；恢复功能只适用于自行注册的账号。升级已有数据库时，旧 `operator` 账号会幂等转换为 `FARMER`。

## 验收证据

- 后端测试覆盖三类角色注册、SYSTEM_ADMIN 授权码禁用/错误/限流、范围生成、全局列表敏感字段隔离、越权创建、状态切换、永久保护和数据库拒写。
- 前端 Node 测试覆盖注册身份和条件授权码、全局账号接口、角色化范围、一次性恢复码，以及演示模式下相同的永久保护合同。
- `node scripts/verify-webui.mjs real`、`stub`、`svg`：登录页账户表单、资源引用和降级路径探针通过。
- 本地 API 黑盒：注册、`/auth/me`、密码重设、旧 JWT 返回 401、新密码登录均通过。
- 内置浏览器验收以本地登录页和 SYSTEM_ADMIN“系统管理 / 账号管理”为准；三类角色、条件字段、地块范围、永久保护和一次性恢复码均须在桌面与 698px 下无溢出或控制台错误。

## 历史公网验收（2026-08-24，V4 三角色迁移之前）

以下记录对应账号管理提交 `0151405` 的当时公网版本，保留用于区分 V4 发布前后的验收边界。

- 合并提交 `0151405935815d8300613434f82e7ac8a9a3c36d` 已部署到 `/srv/agriloop`，API 由 Supervisor 管理，应用环境文件仍保持 `600` 权限。
- Flyway 日志确认 `V2__account_management.sql` 与 `V3__social_identity.sql` 均已成功应用，数据库版本为 v3。
- 公网黑盒：三类演示账号登录和 `/auth/me` 为 HTTP 200；选择错误身份为 HTTP 401 `AUTH_INVALID`；`FARMER` 自助注册为 HTTP 201 且恢复码仅返回一次；管理员身份自助注册返回 `403 ACCOUNT_ROLE_REQUIRES_ADMIN`；登录页三类账户表单从公网入口加载。
- 公网入口：`https://u558871-7873be733236.westd.seetacloud.com:8443/agriloop/`；健康检查：`https://u558871-7873be733236.westd.seetacloud.com:8443/actuator/health`。

## 本轮远端交付（2026-08-25）

- 三角色收口、V4 迁移、角色权限与透明 Logo 已包含在实现提交 `ce98679ca3a6d0ba47b69eed54de9926b27664b6`，旧操作员全量迁移加固在 `6e0b1db`。
- 上述提交已通过交付提交 `85155db1f184e8a2c1b6806af2a7cd34f3e67193` 进入 GitHub `main` 并发布到 `/srv/agriloop`。发布前数据库备份成功，旧应用保存在 `/srv/agriloop/releases/pre-85155db1f184e8a2c1b6806af2a7cd34f3e67193-20260825-051853-backup`。
- Flyway 日志确认 v4 `three role scopes` 成功应用；数据库中的 `admin`、`farmer`、`operator`、`sysadmin` 分别归一为 `FARM_ADMIN`、`FARMER`、`FARMER`、`SYSTEM_ADMIN`，并同步各自地块范围。
- 服务器本机黑盒确认三类演示账号登录和 `/auth/me` 均为 HTTP 200，分别返回对应角色与权限；选择错误身份返回 HTTP 401 `AUTH_INVALID`，`/auth/roles` 只返回三类公开角色。Nginx 提供的新登录页和透明 Alpha Logo 均为 HTTP 200，API 健康状态为 `UP`。
- Supervisor 中 API、Nginx、模拟器、Cron 与 Qwen 均为 `RUNNING`。当前工作环境无法直连 AutoDL 公网代理，因此本轮不把浏览器级公网截图列为证据；公网映射地址保持不变。

生产部署若要求邮件找回，应在现有恢复码哈希与凭据版本机制之上接入受信任的邮件发送、分布式限流和管理员审核，不应由前端伪造“已发送邮件”。
