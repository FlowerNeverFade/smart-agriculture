#!/usr/bin/env bash
set -euo pipefail

# Simulated telemetry is generated inside the API process (SimulationEngine)
# and ingested directly. This script is kept as a no-op so older Supervisor
# or deploy references do not start a second publisher.
echo "AgriLoop 模拟器已内置到 API（SimulationEngine）。请启动 api-service，或在系统管理员「仿真模拟」页启停并调节采样间隔/时间流速。" >&2
exit 0
