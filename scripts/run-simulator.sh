#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/agriloop}"
cd "$APP_ROOT/app"
exec "$APP_ROOT/venv/bin/python" simulator/runner.py \
  --scenario "${SCENARIO:-normal}" \
  --scenario-id "${SCENARIO_ID:-remote-demo}" \
  --seed "${SCENARIO_SEED:-42}" \
  --mqtt --mqtt-host "${MQTT_HOST:-127.0.0.1}" \
  --speed "${SCENARIO_SPEED:-20}"
