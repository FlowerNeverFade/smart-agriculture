#!/usr/bin/env bash
set -euo pipefail

ROOT="/srv/agriloop"
BASE_URL="http://127.0.0.1"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="${2:?missing value for --root}"; shift 2 ;;
    --base-url) BASE_URL="${2:?missing value for --base-url}"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

ENV_FILE="$ROOT/shared/.env"
[[ -r "$ENV_FILE" ]] || { echo "missing environment file: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

health="$(curl --fail --silent --show-error "$BASE_URL/actuator/health")"
if ! grep -q '"status"[[:space:]]*:[[:space:]]*"UP"' <<<"$health"; then
  echo "health response is not UP: $health" >&2
  exit 1
fi

if [[ "${DEMO_SEED:-true}" != false ]]; then
  login="$(curl --fail --silent --show-error -X POST "$BASE_URL/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"demo123","role":"FARM_ADMIN"}')"
  if ! grep -q '"token"' <<<"$login"; then
    echo "demo login failed: $login" >&2
    exit 1
  fi
fi

curl --fail --silent --show-error "$BASE_URL/agriloop/" | grep -qi '<html' || {
  echo "web entry is unavailable" >&2
  exit 1
}
echo "agriloop health: OK"
