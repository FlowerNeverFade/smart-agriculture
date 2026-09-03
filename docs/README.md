# AgriLoop 文档索引

> 更新时间：2026-09-02

当前工作树只保留仍用于开发、运行、合同核对或验收追溯的文档。已完成的阶段分工、旧界面验收和截图证据由 Git 历史保存，不再与当前事实混放。

当前硬件口径：BearPi E53_IA1 的串口 -> MQTT -> API -> SSE 真实遥测链路已接入并有实测记录；模拟器仍负责未接入指标和情景演示，灌溉执行仍走虚拟执行器。各文档若描述更窄的历史验收范围，应以其记录日期为准，不覆盖上述当前口径。

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
- [基于合格经验的受控学习](controlled-learning.md)
- [角色化农业 Agent 工具合同](agent-tools.md)

## 当前验收证据

- [管理员综合验收](acceptance/ADMIN_ACCEPTANCE.md)
- [智能诊断与决策中枢](acceptance/DECISION_CONSOLE_ACCEPTANCE.md)
- [后端远端验收](acceptance/REMOTE_ACCEPTANCE.md)
- [Web 性能验收](acceptance/WEB_PERFORMANCE_ACCEPTANCE.md)
- [农户端 P0 创新闭环](acceptance/FARMER_P0_ACCEPTANCE.md)
- [农户主面板信息层级](acceptance/FARMER_DASHBOARD_ACCEPTANCE.md)
- [农户端农智助手](acceptance/FARMER_ASSISTANT_ACCEPTANCE.md)
- [农户端地块排序与拖拽排序](acceptance/FARMER_PLOT_ORDER_ACCEPTANCE.md)
- [农场管理员地块排序与拖拽排序](acceptance/FARM_ADMIN_PLOT_ORDER_ACCEPTANCE.md)
- [巡田记录与补证申请双角色可见](acceptance/INSPECTION_VISIBILITY_ACCEPTANCE.md)

## 历史材料

清理前的完整历史文档和截图仍可从 `c64ed84` 读取，例如：

```bash
git show c64ed84:FRONTEND_TASKS.md
git show c64ed84:docs/admin-parallel-development-plan.md
git show c64ed84:docs/branch-integration-review.md
git show c64ed84:docs/acceptance/FRONTEND_FARM_MONITOR_ACCEPTANCE.md
```

恢复历史材料时只用于追溯，不应覆盖当前代码、接口合同或状态文档。
