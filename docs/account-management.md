# 账号管理实现说明

## 已实现范围

登录页在原有液态背景和玻璃面板内提供登录、创建账号、忘记密码和恢复码确认四个状态。登录时必须选择账户身份，服务端会核对所选身份与账号角色；注册时可选择 `FARMER`（种植农户）或 `FIELD_OPERATOR`（田间操作员），两者均只获得示范农场与三个示范地块的既定访问范围。`FARM_ADMIN` 与 `SYSTEM_ADMIN` 仍需由系统授权，不能匿名自助注册。

## 接口与数据流

- `POST /api/v1/auth/register`：输入 `username`、`password`、`role`；校验账号格式、密码强度和可自助注册角色，使用 BCrypt 保存密码和恢复码哈希，返回 JWT、用户信息及仅展示一次的恢复码。兼容旧调用：省略 `role` 时仍注册为 `FARMER`。
- `POST /api/v1/auth/password/reset`：输入 `username`、`recoveryCode`、`newPassword`；校验成功后更新密码、轮换恢复码并递增 `credentialVersion`。
- `POST /api/v1/auth/login`：前端输入 `username`、`password`、`role`，后端同时核对凭据和身份；旧客户端省略 `role` 时继续按原合同登录。
- `GET /api/v1/auth/me`：返回 JWT 对应用户；JWT 携带 `credentialVersion`，密码重设后旧令牌立即失效。

恢复码格式为四组四位安全随机字符。服务端不保存明文恢复码，也不把密码或恢复码写入审计日志。

## 失败与降级路径

- 账号需为 4–32 位字母、数字、点、下划线或短横线；密码需为 8–64 位且包含字母和数字，不能包含账号。
- 登录身份不匹配与账号或密码错误统一返回 `401 AUTH_INVALID`，避免泄露账号对应角色。
- 自助注册只接受 `FARMER` 与 `FIELD_OPERATOR`；管理员角色返回 `403 ACCOUNT_ROLE_REQUIRES_ADMIN`，未知角色返回 `400 ACCOUNT_ROLE_INVALID`。
- 重复账号返回 `409 ACCOUNT_EXISTS`；账号或恢复码错误统一返回 `401 ACCOUNT_RECOVERY_INVALID`，避免暴露账号是否存在。
- 同一账号 15 分钟内连续失败 5 次后返回 `429 ACCOUNT_RECOVERY_LOCKED`。
- 注册和重置必须连接后端；网络不可用时不创建浏览器本地假账号。原有四个演示账号的离线降级逻辑保持不变。
- 种子演示账号没有恢复码，继续使用固定的 `demo123`；恢复功能只适用于自行注册的账号。

## 验收证据

- `./gradlew.bat :apps:api-service:test`：身份匹配、操作员注册、管理员自助注册阻断、重复账号、错误恢复码、密码轮换和旧凭据失效回归通过。
- `npx vite build`：登录页生产构建通过。
- 本地 API 黑盒：注册、`/auth/me`、密码重设、旧 JWT 返回 401、新密码登录均通过。
- 内置浏览器：四级登录身份、演示身份同步、两种安全注册身份及管理员选项隔离均通过；原有创建账号、恢复码和密码重设流程保持可用，控制台无错误。

生产部署若要求邮件找回，应在现有恢复码哈希与凭据版本机制之上接入受信任的邮件发送、分布式限流和管理员审核，不应由前端伪造“已发送邮件”。
