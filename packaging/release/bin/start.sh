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
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "run as root" >&2; exit 1; }
for unit in postgresql redis-server mosquitto nginx; do
  agriloop_start_service "$unit"
done
agriloop_ensure_supervisor "$ROOT"
supervisorctl reread >/dev/null
supervisorctl update >/dev/null
supervisorctl start agriloop-api >/dev/null 2>&1 || supervisorctl restart agriloop-api
agriloop_reload_nginx
"$ROOT/current/bin/status.sh" --root "$ROOT"
