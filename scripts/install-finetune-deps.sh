#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/agriloop}"
OVERLAY="${FINETUNE_PYTHON_OVERLAY:-$APP_ROOT/finetune-packages}"
mkdir -p "$OVERLAY"
# Reuse the tested CUDA/Transformers stack from the inference environment and
# install only the pure-Python training overlay. This keeps vLLM rollback-safe.
/root/miniconda3/bin/python -m pip install --upgrade --no-deps --target "$OVERLAY" \
  'peft>=0.18.0' 'accelerate>=1.10.0'
PYTHONPATH="$OVERLAY:/srv/qwen-vllm312/lib/python3.12/site-packages" \
  /srv/qwen-vllm312/bin/python - <<'PY'
import accelerate, peft, torch, transformers
print('training overlay ready', 'peft', peft.__version__, 'accelerate', accelerate.__version__)
print('torch', torch.__version__, 'transformers', transformers.__version__, 'gpus', torch.cuda.device_count())
PY
