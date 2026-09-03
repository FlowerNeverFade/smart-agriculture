#!/usr/bin/env bash
set -euo pipefail
ROOT="/srv/agriloop"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/service-lib.sh"
STOP_ALL=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="${2:?missing value for --root}"; shift 2 ;;
    --all) STOP_ALL=true; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "run as root" >&2; exit 1; }
supervisorctl stop agriloop-api >/dev/null 2>&1 || true
agriloop_stop_service nginx
if [[ "$STOP_ALL" == true ]]; then
  agriloop_stop_service mosquitto
  agriloop_stop_service redis-server
  agriloop_stop_service postgresql
fi
echo "AgriLoop application services stopped."
