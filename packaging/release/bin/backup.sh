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
[[ -r "$ENV_FILE" ]] || { echo "missing environment file: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
umask 077
mkdir -p "$ROOT/shared/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
PGPASSWORD="${DATABASE_PASSWORD:-}" pg_dump \
  -h "${DATABASE_HOST:-${PGHOST:-127.0.0.1}}" -p "${DATABASE_PORT:-${PGPORT:-5432}}" \
  -U "${DATABASE_USER:-agri}" -d "${DATABASE_NAME:-agri}" \
  --format=plain | gzip > "$ROOT/shared/backups/agri-$STAMP.sql.gz"
find "$ROOT/shared/backups" -type f -name '*.sql.gz' -mtime +7 -delete
echo "backup created: $ROOT/shared/backups/agri-$STAMP.sql.gz"
