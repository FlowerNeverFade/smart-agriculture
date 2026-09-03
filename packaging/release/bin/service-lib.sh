#!/usr/bin/env bash

# Service helpers used by the release scripts.  Ubuntu installations normally
# use systemd.  The fallback paths keep the package usable in a minimal Ubuntu
# container where PID 1 is not systemd (the acceptance environment is such a
# container).

agriloop_systemd_available() {
  [[ -d /run/systemd/system ]] && command -v systemctl >/dev/null 2>&1
}

agriloop_port_open() {
  local host="$1" port="$2"
  (exec 3<>"/dev/tcp/$host/$port") >/dev/null 2>&1
}

agriloop_start_postgresql_fallback() {
  if command -v pg_isready >/dev/null 2>&1 && pg_isready -h 127.0.0.1 >/dev/null 2>&1; then
    return 0
  fi
  if command -v service >/dev/null 2>&1; then
    service postgresql start >/dev/null 2>&1 || true
  fi
  if command -v pg_isready >/dev/null 2>&1 && pg_isready -h 127.0.0.1 >/dev/null 2>&1; then
    return 0
  fi
  if command -v pg_lsclusters >/dev/null 2>&1 && command -v pg_ctlcluster >/dev/null 2>&1; then
    while read -r version name status _; do
      [[ -n "$version" && -n "$name" ]] || continue
      [[ "$status" == "online" ]] || pg_ctlcluster "$version" "$name" start >/dev/null 2>&1 || true
    done < <(pg_lsclusters --no-header 2>/dev/null || true)
  fi
  command -v pg_isready >/dev/null 2>&1 && pg_isready -h 127.0.0.1 >/dev/null 2>&1
}

agriloop_start_redis_fallback() {
  if command -v redis-cli >/dev/null 2>&1 && redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG; then
    return 0
  fi
  if command -v service >/dev/null 2>&1; then
    service redis-server start >/dev/null 2>&1 || true
  fi
  if command -v redis-cli >/dev/null 2>&1 && redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG; then
    return 0
  fi
  if command -v redis-server >/dev/null 2>&1; then
    redis-server /etc/redis/redis.conf --daemonize yes >/dev/null 2>&1 || true
  fi
  command -v redis-cli >/dev/null 2>&1 && redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG
}

agriloop_start_mosquitto_fallback() {
  if agriloop_port_open 127.0.0.1 1883; then return 0; fi
  if command -v service >/dev/null 2>&1; then
    service mosquitto start >/dev/null 2>&1 || true
  fi
  if agriloop_port_open 127.0.0.1 1883; then return 0; fi
  if command -v mosquitto >/dev/null 2>&1; then
    nohup mosquitto -c /etc/mosquitto/conf.d/agriloop.conf >/var/log/agriloop-mosquitto.log 2>&1 &
  fi
  for _ in $(seq 1 10); do
    agriloop_port_open 127.0.0.1 1883 && return 0
    sleep 1
  done
  return 1
}

agriloop_start_service() {
  local unit="$1"
  if agriloop_systemd_available; then
    systemctl enable --now "$unit"
    return
  fi
  case "$unit" in
    postgresql) agriloop_start_postgresql_fallback || return 1 ;;
    redis-server) agriloop_start_redis_fallback || return 1 ;;
    mosquitto) agriloop_start_mosquitto_fallback || return 1 ;;
    nginx)
      if pgrep -x nginx >/dev/null 2>&1; then return 0; fi
      if command -v service >/dev/null 2>&1; then service nginx start >/dev/null 2>&1 || true; fi
      if ! pgrep -x nginx >/dev/null 2>&1; then nginx; fi
      ;;
    supervisor) return 0 ;;
    *)
      command -v service >/dev/null 2>&1 || return 1
      service "$unit" start
      ;;
  esac
}

agriloop_stop_service() {
  local unit="$1"
  if agriloop_systemd_available; then
    systemctl stop "$unit" >/dev/null 2>&1 || true
    return 0
  fi
  case "$unit" in
    postgresql)
      if command -v pg_lsclusters >/dev/null 2>&1 && command -v pg_ctlcluster >/dev/null 2>&1; then
        while read -r version name status _; do
          [[ "$status" == "online" ]] && pg_ctlcluster "$version" "$name" stop >/dev/null 2>&1 || true
        done < <(pg_lsclusters --no-header 2>/dev/null || true)
      fi
      ;;
    redis-server)
      redis-cli -h 127.0.0.1 -p 6379 shutdown nosave >/dev/null 2>&1 || true
      ;;
    mosquitto)
      pkill -TERM -x mosquitto >/dev/null 2>&1 || true
      ;;
    nginx)
      nginx -s quit >/dev/null 2>&1 || true
      ;;
    supervisor)
      supervisorctl shutdown >/dev/null 2>&1 || true
      ;;
    *)
      command -v service >/dev/null 2>&1 && service "$unit" stop >/dev/null 2>&1 || true
      ;;
  esac
}

agriloop_reload_nginx() {
  if agriloop_systemd_available; then
    systemctl reload nginx
  else
    nginx -t >/dev/null
    nginx -s reload >/dev/null 2>&1 || nginx
  fi
}

agriloop_ensure_supervisor() {
  local root="$1"
  if agriloop_systemd_available; then
    systemctl enable --now supervisor
    return 0
  fi
  if supervisorctl status >/dev/null 2>&1; then return 0; fi
  mkdir -p "$root/shared/logs"
  nohup supervisord -c /etc/supervisor/supervisord.conf \
    >>"$root/shared/logs/supervisord.log" 2>&1 &
  for _ in $(seq 1 15); do
    supervisorctl status >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

agriloop_service_state() {
  local unit="$1"
  if agriloop_systemd_available; then
    systemctl is-active "$unit" 2>/dev/null || true
    return
  fi
  case "$unit" in
    postgresql) pg_isready -h 127.0.0.1 >/dev/null 2>&1 && echo active || echo inactive ;;
    redis-server) redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG && echo active || echo inactive ;;
    mosquitto) agriloop_port_open 127.0.0.1 1883 && echo active || echo inactive ;;
    nginx) pgrep -x nginx >/dev/null 2>&1 && echo active || echo inactive ;;
    supervisor) supervisorctl status >/dev/null 2>&1 && echo active || echo inactive ;;
    *) echo unknown ;;
  esac
}
