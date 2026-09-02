# AgriLoop 微信小程序

这是 AgriLoop 的原生微信小程序端。页面使用微信小程序原生 WXML/WXSS/JavaScript 编写，复用现有 `/api/v1` REST 接口和服务端角色权限，不使用 `web-view`。

## 导入开发者工具

1. 打开微信开发者工具，选择“导入项目”。
2. 项目目录选择本目录：`apps/wechat-mini-program`。
3. 将 `project.config.json` 中的 `appid` 替换为自己的小程序 AppID。`touristappid` 只能用于本地预览，不能用于正式发布。
4. 在微信公众平台的“开发管理 → 开发设置 → 服务器域名”中配置 API 的 HTTPS 合法域名。默认服务地址为：
   `https://u558871-7873be733236.westd.seetacloud.com:8443`
5. 开发阶段可以在开发者工具中勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”；正式环境必须配置合法域名，不能依赖该选项。

## 账号与权限

当前登录页沿用服务端账号密码登录，支持 `FARM_ADMIN`（农场管理员）、`FARMER`（种植农户）和 `SYSTEM_ADMIN`（系统管理员）。登录成功后 Token 仅保存在当前小程序本地缓存，并按账号隔离会话、偏好和 AI 对话指针。服务端仍是最终权限边界，客户端传入的 `farmId`、`plotId` 和 `conversationId` 不会绕过后端校验。

“我的”页可以关闭自动刷新、查看服务状态和复制 API 地址。若需要临时切换测试 API，可在开发者工具控制台执行：

```js
wx.setStorageSync('agriloop.wx.apiBaseUrl', 'https://你的测试域名/api/v1')
```

清除该键即可恢复 `utils/config.js` 中的默认地址。不要把 JWT、密码、模型密钥或服务器令牌写入小程序源码。

## AI 助手与图片

AI 对话按账号、地块和 `conversationId` 隔离，历史读取、操作预览确认/取消均调用现有后端接口。角色只改变呈现和可用问题范围：农户聚焦本人地块和任务，农场管理员聚焦全场运营，系统管理员聚焦平台状态与审计。

图片选择使用 `sizeType: ['original']`，读取原文件后以 JPG/PNG/WebP data URL 发送到 `/api/v1/agent/chat`，不会在客户端压缩、缩放或转码。单张上限 8 MB、单次最多 4 张、总计 24 MB；图片数据保存在页面实例中，不放进 `setData`，以避免小程序数据包限制。服务端或模型不可用时页面显示规则降级提示，不伪装成模型回答，也不会在客户端直接执行设备命令。

## 微信登录后续接入

当前版本保留账号密码登录，便于和现有三角色账号直接联调。接入微信身份时，应在 `pages/login/login.js` 的 `submitLogin` 前增加 `wx.login`，把 `code` 交给服务端新增的身份绑定接口，再由服务端签发与现有会话格式兼容的 `accessToken` 和 `user`。不要在小程序端交换或保存服务端密钥，也不要仅凭 `openid` 在客户端决定角色。

## 当前范围与限制

- 现有后端的遥测、预测、工单、告警和 AI 接口可直接使用；页面只展示服务端返回的数据。
- 项目当前采用“BearPi E53_IA1 真实遥测 + 软件模拟器”混合输入；页面会按来源区分 `REAL/HARDWARE` 与 `SIMULATION`。灌溉和设备控制仍使用虚拟执行器，不能把模拟数据或虚拟结果描述为真实水泵/阀门闭环。
- 微信开发者工具真机调试、AppID、合法域名和隐私合规配置需要在目标小程序账号下完成；本仓库提供静态代码和接口联调，不代替微信平台审核。

## 静态校验

在仓库根目录运行：

```bash
node scripts/check-wechat-mini-program.mjs
```

脚本会检查页面文件完整性、JSON 语法、JavaScript 语法和冲突标记，不需要启动 API 或安装前端依赖。
