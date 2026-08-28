# AgriLoop 文档索引

> 更新时间：2026-08-27

当前工作树只保留仍用于开发、运行、合同核对或验收追溯的文档。已完成的阶段分工、旧界面验收和截图证据由 Git 历史保存，不再与当前事实混放。

## 项目基线

- [基础功能清单](../01_智慧农业_基本功能清单.md)
- [功能架构](../02_智慧农业_功能架构.md)
- [技术架构](../03_智慧农业_技术架构.md)
- [路线与流程](../04_智慧农业_大致路线与流程.md)
- [统一开发规则](../AGENTS.md)
- [当前项目状态](../PROJECT_STATUS.md)
- [任务看板](../TASKS.md)
- [后端任务清单](BACKEND_TASKS.md)

## 当前合同与运行说明

- [管理员接口冻结合同](admin-interface-freeze.md)
- [OpenAPI](api/openapi.yaml)
- [MQTT 合同](api/mqtt-contracts.md)
- [账号管理](account-management.md)
- [BearPi E53_IA1 接入](hardware/bearpi-e53-ia1.md)
- [农务执行前端说明](../apps/web-ui/FARM_OPERATIONS.md)

## 当前验收证据

- [管理员综合验收](acceptance/ADMIN_ACCEPTANCE.md)
- [智能诊断与决策中枢](acceptance/DECISION_CONSOLE_ACCEPTANCE.md)
- [后端远端验收](acceptance/REMOTE_ACCEPTANCE.md)
- [Web 性能验收](acceptance/WEB_PERFORMANCE_ACCEPTANCE.md)

## 历史材料

清理前的完整历史文档和截图仍可从 `c64ed84` 读取，例如：

```bash
git show c64ed84:FRONTEND_TASKS.md
git show c64ed84:docs/admin-parallel-development-plan.md
git show c64ed84:docs/branch-integration-review.md
git show c64ed84:docs/acceptance/FRONTEND_FARM_MONITOR_ACCEPTANCE.md
```

恢复历史材料时只用于追溯，不应覆盖当前代码、接口合同或状态文档。
