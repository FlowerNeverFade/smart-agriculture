# 账号管理实现说明

## 已实现范围

登录页在原有液态背景和玻璃面板内提供登录、创建账号、忘记密码和恢复码确认四个状态。登录时必须选择账户身份，服务端会核对所选身份与账号角色；系统公开三类角色：`FARMER`（种植农户）、`FARM_ADMIN`（农场管理员）和 `SYSTEM_ADMIN`（系统管理员）。自助注册仅创建 `FARMER`，管理员身份需由系统授权。

## 接口与数据流

- `POST /api/v1/auth/register`：输入 `username`、`password`、`role`；校验账号格式、密码强度和可自助注册角色，使用 BCrypt 保存密码和恢复码哈希，返回 JWT、用户信息及仅展示一次的恢复码。兼容旧调用：省略 `role` 时仍注册为 `FARMER`。
- `POST /api/v1/auth/password/reset`：输入 `username`、`recoveryCode`、`newPassword`；校验成功后更新密码、轮换恢复码并递增 `credentialVersion`。
- `POST /api/v1/auth/login`：前端输入 `username`、`password`、`role`，后端同时核对凭据和身份；旧客户端省略 `role` 时继续按原合同登录。
- `GET /api/v1/auth/me`：返回 JWT 对应用户、角色标签和权限清单；JWT 携带 `credentialVersion`，密码重设后旧令牌立即失效。
- `GET /api/v1/auth/roles`：返回登录页可用的三类角色元数据。
- `GET /api/v1/overview`：按 JWT 的地块范围过滤总览，不把未分配地块返回给浏览器。

恢复码格式为四组四位安全随机字符。服务端不保存明文恢复码，也不把密码或恢复码写入审计日志。

## 失败与降级路径

- 账号需为 4–32 位字母、数字、点、下划线或短横线；密码需为 8–64 位且包含字母和数字，不能包含账号。
- 登录身份不匹配与账号或密码错误统一返回 `401 AUTH_INVALID`，避免泄露账号对应角色。
- 自助注册只接受 `FARMER`；管理员角色和旧操作员角色返回 `403 ACCOUNT_ROLE_REQUIRES_ADMIN`，未知角色返回 `400 ACCOUNT_ROLE_INVALID`。
- 重复账号返回 `409 ACCOUNT_EXISTS`；账号或恢复码错误统一返回 `401 ACCOUNT_RECOVERY_INVALID`，避免暴露账号是否存在。
- 同一账号 15 分钟内连续失败 5 次后返回 `429 ACCOUNT_RECOVERY_LOCKED`。
- 注册和重置必须连接后端；网络不可用时不创建浏览器本地假账号。离线演示只提供三类演示身份，且与在线角色标签保持一致。
- 种子演示账号为 `farmer`、`admin`、`sysadmin`，没有恢复码，继续使用固定的 `demo123`；恢复功能只适用于自行注册的账号。升级已有数据库时，旧 `operator` 账号会幂等转换为 `FARMER`。

## 验收证据

- `./gradlew.bat :apps:api-service:test`：三类角色登录、身份匹配、种植农户注册、管理员自助注册阻断、重复账号、错误恢复码、密码轮换和旧凭据失效回归通过。
- `node scripts/verify-webui.mjs real`、`stub`、`svg`：登录页账户表单、资源引用和降级路径探针通过。
- 本地 API 黑盒：注册、`/auth/me`、密码重设、旧 JWT 返回 401、新密码登录均通过。
- 内置浏览器：三类登录身份、演示身份同步、种植农户注册及管理员选项隔离均通过；原有创建账号、恢复码和密码重设流程保持可用，控制台无错误。

## 历史公网验收（2026-08-24，V4 三角色迁移之前）

以下记录对应账号管理提交 `0151405` 的当时公网版本；本轮 `V4__three_role_scopes.sql` 与三角色收口属于仓库变更，按本次 GitHub 推送记录，不宣称已同步到该公网服务。

- 合并提交 `0151405935815d8300613434f82e7ac8a9a3c36d` 已部署到 `/srv/agriloop`，API 由 Supervisor 管理，应用环境文件仍保持 `600` 权限。
- Flyway 日志确认 `V2__account_management.sql` 与 `V3__social_identity.sql` 均已成功应用，数据库版本为 v3。
- 公网黑盒：三类演示账号登录和 `/auth/me` 为 HTTP 200；选择错误身份为 HTTP 401 `AUTH_INVALID`；`FARMER` 自助注册为 HTTP 201 且恢复码仅返回一次；管理员身份自助注册返回 `403 ACCOUNT_ROLE_REQUIRES_ADMIN`；登录页三类账户表单从公网入口加载。
- 公网入口：`https://u558871-7873be733236.westd.seetacloud.com:8443/agriloop/`；健康检查：`https://u558871-7873be733236.westd.seetacloud.com:8443/actuator/health`。

生产部署若要求邮件找回，应在现有恢复码哈希与凭据版本机制之上接入受信任的邮件发送、分布式限流和管理员审核，不应由前端伪造“已发送邮件”。
