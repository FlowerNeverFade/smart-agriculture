#!/usr/bin/env bash
set -euo pipefail

ROOT="/srv/agriloop"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="${2:?missing value for --root}"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

ENV_FILE="$ROOT/shared/.env"
[[ -r "$ENV_FILE" ]] || { echo "missing protected environment file: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

JAR="$(find "$ROOT/current/api" -maxdepth 1 -type f -name 'api-service-*.jar' ! -name '*-plain.jar' | sort | tail -n 1)"
[[ -n "$JAR" && -r "$JAR" ]] || { echo "executable API JAR not found under $ROOT/current/api" >&2; exit 1; }
mkdir -p "$ROOT/shared/data" "$ROOT/shared/attachments" "$ROOT/shared/logs"
cd "$ROOT/shared"
exec /usr/bin/java -XX:+UseG1GC -XX:MaxRAMPercentage=70 -jar "$JAR"
