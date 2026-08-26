#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/agriloop}"
cd "$APP_ROOT/app"
if [[ ! -r "$APP_ROOT/.env" ]]; then
  echo "Create $APP_ROOT/.env (chmod 600) before deploying." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$APP_ROOT/.env"
set +a
export SPRING_PROFILES_ACTIVE=simulation
export APP_MODE=simulation
export DATABASE_URL="${DATABASE_URL:-jdbc:postgresql://localhost:5432/agri}"
export DATABASE_USER="${DATABASE_USER:-agri}"
export DATABASE_PASSWORD="${DATABASE_PASSWORD:-}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export MQTT_URL="${MQTT_URL:-tcp://localhost:1883}"
export JWT_SECRET="${JWT_SECRET:?Set JWT_SECRET in the protected environment file}"

# Never replace a boot JAR while the previous JVM is still reading it.  An
# in-place Gradle rewrite can make that old process lose lazily loaded classes
# during shutdown (and leaves misleading NoClassDefFoundError lines in the
# service log), so stop the managed process before compiling and guarantee a
# restart if the build fails.
SUPERVISOR_MODE=0
if command -v supervisorctl >/dev/null 2>&1 && [[ -f "$APP_ROOT/supervisor.conf" ]]; then
  SUPERVISOR_MODE=1
  supervisorctl -c "$APP_ROOT/supervisor.conf" stop agriloop-api >/dev/null 2>&1 || true
  supervisorctl -c "$APP_ROOT/supervisor.conf" stop agriloop-simulator >/dev/null 2>&1 || true
else
  pkill -f 'api-service-.*\.jar' >/dev/null 2>&1 || true
fi
restart_on_error() {
  if [[ "$SUPERVISOR_MODE" == "1" ]]; then
    supervisorctl -c "$APP_ROOT/supervisor.conf" start agriloop-api >/dev/null 2>&1 || true
    supervisorctl -c "$APP_ROOT/supervisor.conf" start agriloop-simulator >/dev/null 2>&1 || true
  fi
}
trap restart_on_error EXIT

./gradlew :apps:api-service:bootJar
mkdir -p "$APP_ROOT/venv"
python3 -m venv "$APP_ROOT/venv" || true
"$APP_ROOT/venv/bin/pip" install -r simulator/requirements.txt
chmod +x scripts/run-api.sh scripts/run-simulator.sh
install -m 0644 infra/logrotate/agriloop /etc/logrotate.d/agriloop 2>/dev/null || true
install -m 0644 infra/cron/agriloop-backup /etc/cron.d/agriloop-backup 2>/dev/null || true
if [[ "$SUPERVISOR_MODE" == "1" ]]; then
  supervisorctl -c "$APP_ROOT/supervisor.conf" reread || true
  supervisorctl -c "$APP_ROOT/supervisor.conf" update || true
  supervisorctl -c "$APP_ROOT/supervisor.conf" start agriloop-api
  # Keep the plot-level simulator running so strategy changes written by the
  # API are consumed without a second manual service command.
  supervisorctl -c "$APP_ROOT/supervisor.conf" start agriloop-simulator
else
  nohup scripts/run-api.sh >>"$APP_ROOT/logs/api.log" 2>&1 &
  echo $! > "$APP_ROOT/api.pid"
fi
trap - EXIT
sleep 5
curl --fail --silent http://127.0.0.1:8080/actuator/health
echo
