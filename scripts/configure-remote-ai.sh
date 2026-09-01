#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/agriloop}"
ENV_FILE="$APP_ROOT/.env"
CONF_SOURCE="$APP_ROOT/app/infra/supervisor/agriloop.conf"
CONF_TARGET="$APP_ROOT/supervisor.conf"
[[ -r "$ENV_FILE" ]] || { echo "missing $ENV_FILE" >&2; exit 1; }
[[ -r "$CONF_SOURCE" ]] || { echo "missing $CONF_SOURCE" >&2; exit 1; }

update_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

chmod 600 "$ENV_FILE"
# A previous hand-written deployment can leave PowerShell-expanded lines such
# as `= ` in the protected env file.  Remove only invalid empty-key lines; all
# real settings and secrets are preserved.
sed -i -E '/^[[:space:]]*=[[:space:]]*$/d' "$ENV_FILE"
update_env LLM_ENABLE_THINKING true
update_env LLM_PRESERVE_THINKING false
update_env LLM_REASONING_EFFORT low
update_env LLM_TIMEOUT_MS 30000
update_env LLM_MAX_TOKENS 768
update_env QWEN_GPU_LIST 0,1
update_env QWEN_TENSOR_PARALLEL_SIZE 2
update_env QWEN_MAX_MODEL_LEN 8192
update_env QWEN_MAX_NUM_SEQS 8
update_env QWEN_MAX_NUM_BATCHED_TOKENS 8192
update_env QWEN_ATTENTION_BACKEND TRITON_ATTN
update_env VLLM_USE_FLASHINFER_SAMPLER 0
update_env VLLM_ALLREDUCE_USE_FLASHINFER 0
update_env QWEN_LORA_NAME agriloop-qwen38-agri
update_env QWEN_LORA_PATH "$APP_ROOT/models/agriloop-qwen38-lora-v3"
update_env QWEN_ENABLE_LORA false
lora_enabled="$(awk -F= '$1 == "QWEN_ENABLE_LORA" { print $2; exit }' "$ENV_FILE")"
if [[ "$lora_enabled" == "true" ]]; then
  update_env LLM_MODEL agriloop-qwen38-agri
else
  update_env LLM_MODEL Qwen3.8-27B
fi

cp "$CONF_SOURCE" "$CONF_TARGET"
mkdir -p "$APP_ROOT/logs" "$APP_ROOT/models"
pg_ctlcluster 14 main start >/dev/null 2>&1 || true
if ! redis-cli ping >/dev/null 2>&1; then redis-server --daemonize yes; fi
if ! pgrep -x mosquitto >/dev/null 2>&1; then mosquitto -d; fi

if [[ -r "$APP_ROOT/supervisord.pid" ]]; then
  old_pid="$(tr -dc '0-9' < "$APP_ROOT/supervisord.pid")"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" >/dev/null 2>&1; then
    supervisorctl -c "$CONF_TARGET" shutdown >/dev/null 2>&1 || true
    for _ in {1..20}; do
      kill -0 "$old_pid" >/dev/null 2>&1 || break
      sleep 0.25
    done
  fi
fi
rm -f "$APP_ROOT/supervisor.sock" "$APP_ROOT/supervisord.pid"
supervisord -c "$CONF_TARGET"
sleep 3
supervisorctl -c "$CONF_TARGET" status
