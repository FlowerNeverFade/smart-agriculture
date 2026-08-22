#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/agriloop}"
APP_DIR="$APP_ROOT/app"
ENV_FILE="$APP_ROOT/.env"
if [[ ! -r "$ENV_FILE" ]]; then
  echo "missing protected environment file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
cd "$APP_DIR"
JAR="$(find apps/api-service/build/libs -maxdepth 1 -type f -name 'api-service-*.jar' ! -name '*-plain.jar' | sort | tail -n 1)"
[[ -n "$JAR" ]] || { echo "boot jar not found" >&2; exit 1; }
exec java -XX:+UseG1GC -XX:MaxRAMPercentage=70 -jar "$JAR"
