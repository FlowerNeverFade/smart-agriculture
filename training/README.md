# AgriLoop Qwen3.8-27B 微调资产

这里的训练资产只用于让 Qwen3.8-27B 学会农智闭环的表达、意图和安全边界。

## 不可改变的边界

- 传感器事实仍来自 PostgreSQL/遥测链路。
- 阈值、质量门、就绪度、权限、资源上限和 MQTT 命令仍由规则与后端工具控制。
- RAG 仍从 Crop Pack 知识目录检索；微调不会把知识库当成静态事实灌进模型。
- 训练样本标记为 `SIMULATED`，不把模拟数据描述为现场真实观测。
- 适配器单独保存，可随时停用并回滚到基础 Qwen3.8-27B。

## 训练方法

采用两张 96GB GPU 上的 BF16 LoRA（文本域 SFT），基础权重保持冻结。先运行 20～30 步 smoke test，再运行完整的小数据集训练。Qwen3.8 默认 thinking，本项目训练和在线回答均使用 non-thinking 输出，避免把内部推理展示给用户。

```bash
python training/build_dataset.py --output training/data/agriloop_sft.jsonl
torchrun --nproc_per_node=2 training/train_lora.py \
  --model-path /srv/models/Qwen3.8-27B \
  --data training/data/agriloop_sft.jsonl \
  --output /srv/agriloop/models/agriloop-qwen38-lora \
  --max-steps 90
```

训练前应停止 vLLM，训练后先执行 `evaluate_adapter.py`，通过固定的 `normal`、`drought`、`sensor-drift`、`device-offline` 和低就绪度样本验收，再切换在线适配器。

