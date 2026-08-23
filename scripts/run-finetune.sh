#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/agriloop}"
ENV_FILE="$APP_ROOT/.env"
[[ -r "$ENV_FILE" ]] || { echo "missing protected environment file: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

MODEL_PATH="${QWEN_MODEL_PATH:-/srv/models/Qwen3.8-27B}"
DATA_PATH="${FINETUNE_DATA_PATH:-$APP_ROOT/app/training/data/agriloop_sft.jsonl}"
OUTPUT_PATH="${FINETUNE_OUTPUT_PATH:-$APP_ROOT/models/agriloop-qwen38-lora}"
OVERLAY="${FINETUNE_PYTHON_OVERLAY:-$APP_ROOT/finetune-packages}"
PYTHON_BIN="${FINETUNE_PYTHON:-/srv/qwen-vllm312/bin/python}"
TRAINING_DIR="$APP_ROOT/app/training"

[[ -f "$DATA_PATH" ]] || { echo "training data not found: $DATA_PATH" >&2; exit 1; }
[[ -d "$MODEL_PATH" ]] || { echo "model path not found: $MODEL_PATH" >&2; exit 1; }

SUPERVISOR_MODE=0
if command -v supervisorctl >/dev/null 2>&1 && [[ -S "$APP_ROOT/supervisor.sock" ]]; then
  SUPERVISOR_MODE=1
  supervisorctl -c "$APP_ROOT/supervisor.conf" stop qwen-vllm >/dev/null 2>&1 || true
fi
restart_model() {
  if [[ "$SUPERVISOR_MODE" == "1" && "${FINETUNE_RESTART_MODEL:-true}" == "true" ]]; then
    supervisorctl -c "$APP_ROOT/supervisor.conf" start qwen-vllm >/dev/null 2>&1 || true
  fi
}
trap restart_model EXIT

export PYTHONPATH="$OVERLAY:/srv/qwen-vllm312/lib/python3.12/site-packages:${PYTHONPATH:-}"
export CUDA_VISIBLE_DEVICES="${QWEN_GPU_LIST:-0,1}"
cd "$APP_ROOT/app"
"$PYTHON_BIN" -m torch.distributed.run --standalone --nproc_per_node="${QWEN_TENSOR_PARALLEL_SIZE:-2}" \
  "$TRAINING_DIR/train_lora.py" \
  --model-path "$MODEL_PATH" \
  --data "$DATA_PATH" \
  --output "$OUTPUT_PATH" \
  --max-steps "${FINETUNE_MAX_STEPS:-90}" \
  --epochs "${FINETUNE_EPOCHS:-6}" \
  --seq-len "${FINETUNE_SEQ_LEN:-2048}" \
  --gradient-accumulation "${FINETUNE_GRADIENT_ACCUMULATION:-8}"

trap - EXIT
restart_model
