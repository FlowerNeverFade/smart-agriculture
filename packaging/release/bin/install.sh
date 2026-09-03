#!/usr/bin/env bash
set -Eeuo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }
usage() {
  cat <<'USAGE'
Usage: install.sh [options]
  --root PATH             application root (default: /srv/agriloop)
  --env-file PATH         protected environment file (default: ROOT/shared/.env)
  --skip-apt              do not install missing Ubuntu packages
  --skip-demo-seed        do not import the virtual demonstration seed
  -h, --help              show this help
USAGE
}

ROOT="/srv/agriloop"
ENV_FILE=""
SKIP_APT=false
SKIP_SEED=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) [[ $# -ge 2 ]] || die "--root requires a path"; ROOT="$2"; shift 2 ;;
    --env-file) [[ $# -ge 2 ]] || die "--env-file requires a path"; ENV_FILE="$2"; shift 2 ;;
    --skip-apt) SKIP_APT=true; shift ;;
    --skip-demo-seed) SKIP_SEED=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/service-lib.sh"
[[ -n "$ENV_FILE" ]] || ENV_FILE="$ROOT/shared/.env"

[[ "$ROOT" = /* && "$ROOT" != "/" ]] || die "--root must be an absolute, non-root application directory"
[[ "$ROOT" != *'&'* && "$ROOT" != *'|'* ]] || die "--root must not contain '&' or '|'"

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "install.sh must run as root"
[[ "$(uname -m)" == "x86_64" ]] || die "this release targets x86_64; detected $(uname -m)"
[[ -f /etc/os-release ]] || die "cannot identify operating system"
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || die "Ubuntu is required; detected ${ID:-unknown}"

if [[ "$PACKAGE_DIR" == "$ROOT/releases/"* || "$PACKAGE_DIR" == "$ROOT/shared/"* ]]; then
  die "extract the release archive outside $ROOT/releases before installing"
fi
[[ -f "$PACKAGE_DIR/release-manifest.json" ]] || die "invalid release package: missing release-manifest.json"

VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PACKAGE_DIR/release-manifest.json" | head -n 1)"
VERSION="${VERSION:-0.1.0}"
[[ "$VERSION" =~ ^[0-9A-Za-z._-]+$ ]] || die "invalid release version in release-manifest.json"
[[ -f "$PACKAGE_DIR/api/api-service-$VERSION.jar" ]] || die "invalid release package: missing api/api-service-$VERSION.jar"
[[ -f "$PACKAGE_DIR/web/index.html" ]] || die "invalid release package: missing web/index.html"
[[ -f "$PACKAGE_DIR/db/demo-seed.sql" ]] || die "invalid release package: missing db/demo-seed.sql"
[[ -d "$PACKAGE_DIR/db/migrations" ]] || die "invalid release package: missing db/migrations"

if [[ "$SKIP_APT" != true ]]; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    openjdk-17-jre-headless postgresql postgresql-contrib redis-server \
    mosquitto nginx supervisor curl ca-certificates openssl gzip
fi

command -v java >/dev/null 2>&1 || die "Java 17 runtime is unavailable"
command -v psql >/dev/null 2>&1 || die "psql is unavailable"
command -v supervisorctl >/dev/null 2>&1 || die "supervisorctl is unavailable"

if ! id agriloop >/dev/null 2>&1; then
  useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin agriloop
fi
install -d -o agriloop -g agriloop -m 0755 "$ROOT" "$ROOT/releases" "$ROOT/shared"
install -d -o agriloop -g agriloop -m 0755 "$ROOT/shared/data" "$ROOT/shared/attachments" "$ROOT/shared/logs" "$ROOT/shared/backups"

if [[ ! -e "$ENV_FILE" ]]; then
  install -d -o agriloop -g agriloop -m 0755 "$(dirname "$ENV_FILE")"
  cp "$PACKAGE_DIR/config/env.example" "$ENV_FILE"
  jwt_secret="$(openssl rand -hex 32)"
  database_password="$(openssl rand -hex 24)"
  sed -i "s/CHANGE_ME_USE_AT_LEAST_32_RANDOM_BYTES/$jwt_secret/; s/CHANGE_ME_DATABASE_PASSWORD/$database_password/; s#^APP_ROOT=.*#APP_ROOT=$ROOT#; s#^SIMULATION_CONFIG_PATH=.*#SIMULATION_CONFIG_PATH=$ROOT/shared/data/plot-simulation.json#; s#^ATTACHMENT_DIR=.*#ATTACHMENT_DIR=$ROOT/shared/attachments#" "$ENV_FILE"
  echo "Created $ENV_FILE with generated local secrets; review it before production use."
fi
chmod 600 "$ENV_FILE"
chown agriloop:agriloop "$ENV_FILE"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
DATABASE_NAME="${DATABASE_NAME:-agri}"
DATABASE_USER="${DATABASE_USER:-agri}"
DATABASE_PASSWORD="${DATABASE_PASSWORD:-}"
DATABASE_HOST="${DATABASE_HOST:-127.0.0.1}"
DATABASE_PORT="${DATABASE_PORT:-5432}"
DEMO_SEED="${DEMO_SEED:-true}"
[[ "$DATABASE_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "DATABASE_NAME must be a simple PostgreSQL identifier"
[[ "$DATABASE_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "DATABASE_USER must be a simple PostgreSQL identifier"
[[ "$DATABASE_HOST" != *[[:space:]]* ]] || die "DATABASE_HOST must not contain whitespace"
[[ "$DATABASE_PORT" =~ ^[0-9]+$ && "$DATABASE_PORT" -ge 1 && "$DATABASE_PORT" -le 65535 ]] || die "DATABASE_PORT must be between 1 and 65535"
[[ -n "$DATABASE_PASSWORD" && "$DATABASE_PASSWORD" != CHANGE_ME* ]] || die "set DATABASE_PASSWORD in $ENV_FILE"
[[ ${#JWT_SECRET:-0} -ge 32 ]] || die "JWT_SECRET must contain at least 32 characters"

RELEASE_DIR="$ROOT/releases/$VERSION"
PREVIOUS=""
if [[ -L "$ROOT/current" ]]; then PREVIOUS="$(readlink -f "$ROOT/current" || true)"; fi
if [[ -e "$RELEASE_DIR" ]]; then
  [[ "$RELEASE_DIR" == "$ROOT/releases/"* ]] || die "refusing to replace an unsafe path"
  rm -rf -- "$RELEASE_DIR"
fi
install -d -o agriloop -g agriloop -m 0755 "$RELEASE_DIR"
cp -a "$PACKAGE_DIR"/. "$RELEASE_DIR"/
find "$RELEASE_DIR/bin" -type f -name '*.sh' -exec chmod 0755 {} +
chown -R agriloop:agriloop "$RELEASE_DIR"

sql_literal() {
  local value="$1"
  value="${value//\'/\'\'}"
  printf "%s" "$value"
}
SQL_USER="$(sql_literal "$DATABASE_USER")"
SQL_PASSWORD="$(sql_literal "$DATABASE_PASSWORD")"
SQL_DATABASE="$(sql_literal "$DATABASE_NAME")"
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${SQL_USER}'" | grep -q 1; then
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE ROLE \"$DATABASE_USER\" LOGIN PASSWORD '$SQL_PASSWORD'"
else
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$DATABASE_USER\" LOGIN PASSWORD '$SQL_PASSWORD'"
fi
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='${SQL_DATABASE}'" | grep -q 1; then
  runuser -u postgres -- createdb -O "$DATABASE_USER" "$DATABASE_NAME"
fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE \"$DATABASE_NAME\" TO \"$DATABASE_USER\""
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" -c "GRANT USAGE,CREATE ON SCHEMA public TO \"$DATABASE_USER\""

for unit in postgresql redis-server mosquitto; do
  agriloop_start_service "$unit" || die "unable to start required service: $unit"
done

# Install local-only broker, reverse proxy, process supervisor and maintenance jobs.
install -m 0644 "$RELEASE_DIR/config/mosquitto.conf" /etc/mosquitto/conf.d/agriloop.conf
agriloop_stop_service mosquitto
agriloop_start_service mosquitto || die "unable to start mosquitto with the AgriLoop configuration"

ROOT_SED="${ROOT//\\/\\\\}"
ROOT_SED="${ROOT_SED//\//\\/}"
sed "s/\/srv\/agriloop/$ROOT_SED/g" "$RELEASE_DIR/config/logrotate/agriloop" > /etc/logrotate.d/agriloop
sed "s/\/srv\/agriloop/$ROOT_SED/g" "$RELEASE_DIR/config/cron/agriloop-backup" > /etc/cron.d/agriloop-backup
sed "s/\/srv\/agriloop/$ROOT_SED/g" "$RELEASE_DIR/config/nginx/agriloop.conf" > /etc/nginx/sites-available/agriloop.conf
install -d /etc/nginx/sites-enabled
ln -sfn /etc/nginx/sites-available/agriloop.conf /etc/nginx/sites-enabled/agriloop.conf
if [[ -L /etc/nginx/sites-enabled/default ]]; then rm -f /etc/nginx/sites-enabled/default; fi
nginx -t

sed "s/\/srv\/agriloop/$ROOT_SED/g" "$RELEASE_DIR/config/supervisor/agriloop.conf" > /etc/supervisor/conf.d/agriloop.conf

supervisorctl stop agriloop-api >/dev/null 2>&1 || true
ln -sfn "$RELEASE_DIR" "$ROOT/current"
chown -h agriloop:agriloop "$ROOT/current" 2>/dev/null || true

agriloop_ensure_supervisor "$ROOT" || die "unable to start Supervisor"
supervisorctl reread >/dev/null
supervisorctl update >/dev/null
supervisorctl start agriloop-api >/dev/null 2>&1 || supervisorctl restart agriloop-api

healthy=false
for _ in $(seq 1 90); do
  if curl --fail --silent http://127.0.0.1:8080/actuator/health | grep -q '"status"[[:space:]]*:[[:space:]]*"UP"'; then
    healthy=true
    break
  fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  echo "API did not become healthy; recent log follows:" >&2
  tail -n 80 "$ROOT/shared/logs/api-error.log" 2>/dev/null || true
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$ROOT/current"
    supervisorctl restart agriloop-api >/dev/null 2>&1 || true
  fi
  exit 1
fi

if [[ "$SKIP_SEED" != true && "${DEMO_SEED,,}" != false ]]; then
  PGPASSWORD="$DATABASE_PASSWORD" psql \
    -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" \
    --set=ON_ERROR_STOP=1 --file="$RELEASE_DIR/db/demo-seed.sql"
fi

agriloop_start_service nginx || die "unable to start Nginx"
nginx -t
agriloop_reload_nginx
"$ROOT/current/bin/healthcheck.sh" --root "$ROOT"
echo "AgriLoop $VERSION installed under $ROOT"
