#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/agriloop}"
mkdir -p "$APP_ROOT"/app "$APP_ROOT"/logs "$APP_ROOT"/backups "$APP_ROOT"/data
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y openjdk-17-jdk python3 python3-venv python3-pip postgresql redis-server mosquitto supervisor curl unzip
systemctl enable postgresql redis-server mosquitto supervisor || true
systemctl start postgresql redis-server mosquitto supervisor || true
if command -v pg_ctlcluster >/dev/null 2>&1; then pg_ctlcluster 14 main start >/dev/null 2>&1 || true; fi
if command -v redis-server >/dev/null 2>&1 && ! redis-cli ping >/dev/null 2>&1; then redis-server --daemonize yes || true; fi
if command -v mosquitto >/dev/null 2>&1 && ! mosquitto_pub -h 127.0.0.1 -t agriloop/health -m ping >/dev/null 2>&1; then mosquitto -d || true; fi
echo "Remote runtime installed. Copy the repository to $APP_ROOT/app and run scripts/remote-deploy.sh."
