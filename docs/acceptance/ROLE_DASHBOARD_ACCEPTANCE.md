# 角色化 Dashboard 简洁版验收记录

> 状态：独立分支本地验收，未部署公网。分支：`codex/role-based-dashboard-v2`

## 角色首屏

| 登录身份 | 登录后第一屏 | 首要问题 | 可见入口 |
|---|---|---|---|
| 种植农户 (`FARMER`) | 我的农场 | 我的地块现在是否需要处理？ | 我的农场、今天要做什么、地块状态、处理建议 |
| 田间操作员 (`FIELD_OPERATOR`) | 我的执行任务 | 现在先做哪一项现场任务？ | 我的任务、任务清单、现场数据、农田地图 |
| 农场管理员 (`FARM_ADMIN`) | 农场运营驾驶舱 | 哪些风险和审批需要我先决定？ | 运营驾驶舱、诊断与审批、任务安排、全场监测、水资源安排、风险趋势 |
| 系统管理员 (`SYSTEM_ADMIN`) | 平台运行状态 | 平台的数据和服务是否正常？ | 平台状态、情景回放、操作记录、规则版本、数据链路 |

## 数据边界

- 前端用角色元数据投影首屏、左侧导航和地块列表；旧版全量 Home DOM 没有删除，作为兼容回归内容保留，不再作为登录后的第一屏。
- `/api/v1/overview` 由服务端根据 JWT 的 `plotIds` 再过滤一次，浏览器端筛选不是安全边界。
- 内置演示账号的范围由 Flyway `V4__demo_role_scopes.sql` 对已有数据库幂等修正；系统管理员使用 `*` 全范围。
- 农户的“确认建议”只记录待主管处理的意图；操作员的按钮只更新本地演示态并引导进入工单模块，真实执行仍由既有服务端权限和安全门控制。

## 验收证据

```text
node scripts/verify-webui.mjs svg                         # 82/82
node scripts/verify-role-dashboard.mjs                   # 4/4
node --check apps/web-ui/js/role-dashboard.js
node --check apps/web-ui/js/app.js
./gradlew.bat :apps:api-service:test                     # Windows 中文路径需用 ASCII subst 盘运行
```

角色纯渲染检查覆盖四个角色的标题和可操作入口，结果为 `FARMER`、`FIELD_OPERATOR`、`FARM_ADMIN`、`SYSTEM_ADMIN` 4/4 通过。
