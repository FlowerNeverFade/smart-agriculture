#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
curl --fail --silent --show-error "$BASE_URL/actuator/health" >/dev/null
curl --fail --silent --show-error "$BASE_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"demo123"}' >/dev/null
echo "agriloop health: OK"
