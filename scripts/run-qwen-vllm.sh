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
BASE_MODEL_NAME="${QWEN_BASE_MODEL_NAME:-Qwen3.8-27B}"
LORA_NAME="${QWEN_LORA_NAME:-agriloop-qwen38-agri}"
LORA_PATH="${QWEN_LORA_PATH:-$APP_ROOT/models/agriloop-qwen38-lora}"
GPU_LIST="${QWEN_GPU_LIST:-0,1}"
export CUDA_VISIBLE_DEVICES="$GPU_LIST"
# Blackwell support in the bundled FlashInfer build is incomplete on this host.
# Keep attention on Triton and use vLLM's native sampler/all-reduce paths.
export VLLM_USE_FLASHINFER_SAMPLER="${VLLM_USE_FLASHINFER_SAMPLER:-0}"
export VLLM_ALLREDUCE_USE_FLASHINFER="${VLLM_ALLREDUCE_USE_FLASHINFER:-0}"

args=(
  serve "$MODEL_PATH"
  --host 127.0.0.1
  --port 8000
  --served-model-name "$BASE_MODEL_NAME"
  --dtype bfloat16
  --tensor-parallel-size "${QWEN_TENSOR_PARALLEL_SIZE:-2}"
  --gpu-memory-utilization "${QWEN_GPU_MEMORY_UTILIZATION:-0.90}"
  --max-model-len "${QWEN_MAX_MODEL_LEN:-8192}"
  --max-num-seqs "${QWEN_MAX_NUM_SEQS:-8}"
  --max-num-batched-tokens "${QWEN_MAX_NUM_BATCHED_TOKENS:-8192}"
  --attention-config "{\"backend\":\"${QWEN_ATTENTION_BACKEND:-TRITON_ATTN}\"}"
  --language-model-only
  --trust-remote-code
)

if [[ "${QWEN_ENABLE_LORA:-false}" == "true" && -f "$LORA_PATH/adapter_config.json" ]]; then
  args+=(--enable-lora --lora-modules "$LORA_NAME=$LORA_PATH" --max-lora-rank "${QWEN_MAX_LORA_RANK:-16}" --max-loras 1)
  echo "starting Qwen3.8 with LoRA adapter $LORA_NAME from $LORA_PATH"
else
  echo "starting base Qwen3.8-27B without an adapter"
fi

exec /srv/qwen-vllm312/bin/vllm "${args[@]}"
