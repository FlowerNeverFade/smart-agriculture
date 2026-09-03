# 农智闭环 Linux 发布包

本目录是 AgriLoop `0.1.0` 的 Linux x86_64 可部署产物。发布包包含 Spring Boot 可执行 JAR、Vite 编译后的静态页面、Flyway 迁移、虚拟演示种子和运维脚本，不包含 Java/JavaScript/微信小程序源代码、依赖缓存、生产数据或模型权重。完整的环境要求、逐步命令、验证标准和故障处理见随项目交付的《部署文档.md》。

## 快速安装

在 Ubuntu 22.04 x86_64 服务器上，以 root 或具备 sudo 权限的账号执行：

```bash
sudo ./bin/install.sh --root /srv/agriloop --env-file /srv/agriloop/shared/.env
sudo ./bin/status.sh --root /srv/agriloop
sudo ./bin/healthcheck.sh --root /srv/agriloop
```

安装脚本会安装原生依赖、创建 PostgreSQL 数据库、启动 API 触发 Flyway、按 `DEMO_SEED` 导入虚拟演示数据并配置 Nginx 与 Supervisor。脚本同时支持 PID 1 非 systemd 的 Ubuntu 容器环境。安装前请将 ZIP 解压到 `/srv/agriloop/releases` 之外，并执行 `chmod 0755 bin/*.sh`。

Windows、macOS 或不便安装系统服务的 Linux 主机，可使用包内 `config/docker/docker-compose.yml`：复制 `config/docker/env.example` 为 `.env`，填入随机的 `POSTGRES_PASSWORD` 和至少 32 字符的 `JWT_SECRET`，然后执行：

```bash
docker compose --env-file .env -f config/docker/docker-compose.yml up -d --build
docker compose --env-file .env -f config/docker/docker-compose.yml ps -a
```

Compose 会按依赖顺序启动 PostgreSQL、Redis、Mosquitto、API、演示种子和 Web。详细的 Windows、macOS、Linux 原生及 Docker 步骤、验证命令和故障处理见随项目交付的《部署文档.md》。

## 运行入口

```text
http://<server>/agriloop/
http://<server>/farm-admin/
http://<server>/farmer/
http://<server>/system-admin/
```

当前公网演示入口：

```text
https://u558871-7873be733236.westd.seetacloud.com:8443/agriloop/
https://u558871-7873be733236.westd.seetacloud.com:8443/farm-admin/
https://u558871-7873be733236.westd.seetacloud.com:8443/farmer/
https://u558871-7873be733236.westd.seetacloud.com:8443/system-admin/
https://u558871-7873be733236.westd.seetacloud.com:8443/actuator/health
```

部署主机连接命令：

```bash
ssh -p 22602 root@connect.westd.seetacloud.com
```

部署主机账号：`root`  
部署主机密码：`NIaS3FH4N5fP`

默认演示账号为 `farmer`、`admin` 和 `sysadmin`，初始密码均为 `demo123`。首次登录后必须修改密码和密钥。

## 当前运行模式

发布包默认使用软件仿真和规则模式：

```text
SPRING_PROFILES_ACTIVE=simulation
APP_MODE=simulation
AI_MODE=rules-only
COMMAND_MODE=virtual
```

Qwen3.8-27B + vLLM 属于可选模型服务，不随发布包提供，也不会由本包自动下载。使用该模型时，推荐 GPU 总显存不低于 90 GB；没有模型服务时保持 `AI_MODE=rules-only`。

模型下载地址：

| 来源 | 地址 |
|---|---|
| Hugging Face 官方 | <https://huggingface.co/Qwen/Qwen3.8-27B> |
| Hugging Face 国内镜像 | <https://hf-mirror.com/Qwen/Qwen3.8-27B> |
| ModelScope 国内镜像 | <https://modelscope.cn/models/Qwen/Qwen3.8-27B> |

Linux/macOS：

~~~bash
python3 -m pip install --upgrade "huggingface_hub[cli]"
hf download Qwen/Qwen3.8-27B --local-dir /srv/models/Qwen3.8-27B
~~~

国内网络可将上述命令前置为 `export HF_ENDPOINT=https://hf-mirror.com`，或使用 ModelScope：

~~~bash
python3 -m pip install --upgrade modelscope
modelscope download --model Qwen/Qwen3.8-27B --local_dir /srv/models/Qwen3.8-27B
~~~

Windows PowerShell 使用 `py` 替换 `python3`，并将模型目录替换为 Windows 路径；下载完成后将 `QWEN_MODEL_PATH` 指向该目录。源码仓库地址为 <https://github.com/FlowerNeverFade/smart-agriculture>。
