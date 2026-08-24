# 账号管理实现说明

## 已实现范围

登录页在原有液态背景和玻璃面板内提供登录、创建账号、忘记密码、恢复码确认，以及微信/QQ 一键注册。所有新用户固定为 `FARMER`，只获得示范农场与三个示范地块的普通访问范围，不能自行注册管理员角色。

## 接口与数据流

- `POST /api/v1/auth/register`：输入 `username`、`password`；校验账号格式与密码强度，使用 BCrypt 保存密码和恢复码哈希，返回 JWT、用户信息及仅展示一次的恢复码。
- `POST /api/v1/auth/password/reset`：输入 `username`、`recoveryCode`、`newPassword`；校验成功后更新密码、轮换恢复码并递增 `credentialVersion`。
- `POST /api/v1/auth/login` 与 `GET /api/v1/auth/me`：合同保持不变；JWT 增加 `credentialVersion`，密码重设后旧令牌立即失效。
- `GET /api/v1/auth/social/providers`：只返回微信、QQ 是否可用，不泄露平台密钥。
- `GET /api/v1/auth/social/{provider}/authorize`：生成十分钟有效的随机 `state`，写入 `HttpOnly + SameSite=Lax` 回调 Cookie，再跳转到微信开放平台或 QQ 互联。
- `GET /api/v1/auth/social/{provider}/callback`：同时校验查询参数和浏览器 Cookie 后一次性消费 `state`，服务端换取平台身份；首次授权自动建号，重复授权复用既有账号。
- `POST /api/v1/auth/social/session`：消费两分钟有效且只能使用一次的回调票据，返回与密码登录相同的 JWT 会话。JWT 和 AppSecret 均不会出现在浏览器回调 URL。

恢复码格式为四组四位安全随机字符。服务端不保存明文恢复码，也不把密码或恢复码写入审计日志。

## 失败与降级路径

- 账号需为 4–32 位字母、数字、点、下划线或短横线；密码需为 8–64 位且包含字母和数字，不能包含账号。
- 重复账号返回 `409 ACCOUNT_EXISTS`；账号或恢复码错误统一返回 `401 ACCOUNT_RECOVERY_INVALID`，避免暴露账号是否存在。
- 同一账号 15 分钟内连续失败 5 次后返回 `429 ACCOUNT_RECOVERY_LOCKED`。
- 注册和重置必须连接后端；网络不可用时不创建浏览器本地假账号。原有四个演示账号的离线降级逻辑保持不变。
- 种子演示账号没有恢复码，继续使用固定的 `demo123`；恢复功能只适用于自行注册的账号。
- 微信/QQ 账号没有本地密码或恢复码，需继续使用原平台授权登录；平台 `openid/unionid` 只作为服务端绑定标识，不写入 JWT 或审计日志。

## 开放平台配置

真实授权前必须分别申请已审核的网站应用，并在平台控制台登记与服务端完全一致的回调地址。密钥只通过部署环境注入：

```text
SOCIAL_CALLBACK_BASE_URL=https://api.example.com
SOCIAL_FRONTEND_URL=https://app.example.com/login.html
WECHAT_APP_ID=...
WECHAT_APP_SECRET=...
QQ_APP_ID=...
QQ_APP_SECRET=...
```

微信回调为 `${SOCIAL_CALLBACK_BASE_URL}/api/v1/auth/social/wechat/callback`，QQ 回调为 `${SOCIAL_CALLBACK_BASE_URL}/api/v1/auth/social/qq/callback`。未配置或 URL 非法时，页面保留入口并明确显示“开放平台尚未配置”，不会创建本地假账号。当前 `state` 与短期票据保存在单实例内存中；多实例生产部署必须迁移到 Redis，并启用粘性路由或共享票据存储。

## 验收证据

- `./gradlew.bat :apps:api-service:test`：注册、重复账号、错误恢复码、密码轮换和旧凭据失效回归通过。
- `npx vite build`：登录页生产构建通过。
- 社交账号回归：同一平台身份只创建一个本地用户，不同平台相互隔离，一次性票据不可重放；Flyway v3 外部身份绑定表通过 H2 测试迁移。
- 本地 API 黑盒：注册、`/auth/me`、密码重设、旧 JWT 返回 401、新密码登录均通过。
- 内置浏览器：创建账号、弱密码提示、恢复码一次性展示、错误恢复码、密码重设及新密码登录均通过，控制台无错误。

微信/QQ 的真实授权仍需项目方提供已审核应用、合法回调域名和对应密钥后进行平台联调。生产部署若要求邮件找回，应在现有恢复码哈希与凭据版本机制之上接入受信任的邮件发送、分布式限流和管理员审核，不应由前端伪造“已发送邮件”。
