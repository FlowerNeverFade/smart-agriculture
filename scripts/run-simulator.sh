#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/agriloop}"
cd "$APP_ROOT/app"
SCENARIO_ID_VALUE="${SCENARIO_ID:-}"
# Supervisor may restart the live demo repeatedly.  A fixed id would make
# every subsequent run look like a duplicate replay to the event de-duplicator.
if [[ -z "$SCENARIO_ID_VALUE" || "$SCENARIO_ID_VALUE" == "remote-demo" ]]; then
  SCENARIO_ID_VALUE="remote-$(date -u +%Y%m%d%H%M%S)-$$"
fi
exec "$APP_ROOT/venv/bin/python" simulator/runner.py \
  --scenario "${SCENARIO:-normal}" \
  --scenario-id "$SCENARIO_ID_VALUE" \
  --seed "${SCENARIO_SEED:-42}" \
  --mqtt --mqtt-host "${MQTT_HOST:-127.0.0.1}" \
  --plot-config "${SIMULATION_CONFIG_PATH:-$APP_ROOT/app/data/plot-simulation.json}" \
  --interval "${SCENARIO_INTERVAL:-5}" \
  --speed "${SCENARIO_SPEED:-1}" \
  --continuous
