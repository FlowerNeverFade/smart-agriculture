#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${APP_ROOT:-/srv/agriloop}"
mkdir -p "$APP_ROOT/backups"
STAMP=$(date +%Y%m%d-%H%M%S)
PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${DATABASE_USER:-agri}" \
PGPASSWORD="${DATABASE_PASSWORD:-}" pg_dump -d "${DATABASE_NAME:-agri}" | gzip > "$APP_ROOT/backups/agri-$STAMP.sql.gz"
find "$APP_ROOT/backups" -type f -name '*.sql.gz' -mtime +7 -delete
