#!/usr/bin/env bash
set -euo pipefail
ROOT="/srv/agriloop"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/service-lib.sh"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="${2:?missing value for --root}"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
echo "release: $(readlink -f "$ROOT/current" 2>/dev/null || echo unavailable)"
printf 'postgresql: '; agriloop_service_state postgresql
printf 'redis: '; agriloop_service_state redis-server
printf 'mosquitto: '; agriloop_service_state mosquitto
printf 'nginx: '; agriloop_service_state nginx
supervisorctl status agriloop-api || true
