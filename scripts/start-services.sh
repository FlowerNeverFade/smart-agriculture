#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/agriloop}"
pg_ctlcluster 14 main start >/dev/null 2>&1 || true
if ! redis-cli ping >/dev/null 2>&1; then redis-server --daemonize yes; fi
if ! pgrep -x mosquitto >/dev/null 2>&1; then mosquitto -d; fi
if [[ ! -S "$APP_ROOT/supervisor.sock" ]]; then supervisord -c "$APP_ROOT/supervisor.conf"; fi
supervisorctl -c "$APP_ROOT/supervisor.conf" status
