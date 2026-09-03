# 农智闭环数据库源文件

本目录是数据库交付材料的可追溯源文件。Flyway 迁移以
`apps/api-service/src/main/resources/db/migration/` 为代码运行时唯一来源；
交付构建脚本会复制并校验这五个文件到交付目录和 Linux 发布包。

`demo-seed.sql` 仅包含虚拟农场、三块虚拟地块、模拟设备、演示水资源、待复核案例和三个演示账号。脚本不包含任何生产遥测、生产账号、审计记录、附件或服务器运行数据；使用 `ON CONFLICT DO NOTHING`，可重复执行且不会删除或覆盖其他数据。

执行顺序：先启动 API 使 Flyway 完成五个迁移，再使用具有目标数据库写权限的 PostgreSQL 客户端执行 `demo-seed.sql`。正式环境应将 `SEED_DATA=false`，仅在隔离的验收/演示库导入此脚本。
