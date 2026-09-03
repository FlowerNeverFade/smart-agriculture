#!/usr/bin/env bash
set -euo pipefail
ROOT="/srv/agriloop"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="${2:?missing value for --root}"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
"$ROOT/current/bin/stop.sh" --root "$ROOT"
"$ROOT/current/bin/start.sh" --root "$ROOT"
