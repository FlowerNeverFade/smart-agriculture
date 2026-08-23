#!/usr/bin/env python3
"""Small, reproducible BF16 LoRA trainer for Qwen3.8-27B.

This intentionally avoids online rule changes. It trains only a user-facing
language adapter; the backend continues to own facts, tools and safety gates.
The script uses torchrun DDP so two 96GB GPUs each hold one frozen BF16 copy of
the language model.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import time
from pathlib import Path

import torch
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer

from peft import LoraConfig, get_peft_model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-steps", type=int, default=90)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--seq-len", type=int, default=2048)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--rank", type=int, default=16)
    parser.add_argument("--alpha", type=int, default=32)
    parser.add_argument("--dropout", type=float, default=0.05)
    parser.add_argument("--seed", type=int, default=20260823)
    return parser.parse_args()


def setup_distributed() -> tuple[int, int, int]:
    local_rank = int(os.environ.get("LOCAL_RANK", "0"))
    rank = int(os.environ.get("RANK", "0"))
    world_size = int(os.environ.get("WORLD_SIZE", "1"))
    if world_size > 1 and not dist.is_initialized():
        dist.init_process_group(backend="nccl")
    torch.cuda.set_device(local_rank)
    return local_rank, rank, world_size


def render(tokenizer, messages: list[dict], add_generation_prompt: bool) -> str:
    """Use the model chat template but remove empty/default thinking markers."""
    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=add_generation_prompt,
        enable_thinking=False,
    )
    text = re.sub(r"(?is)<think>.*?</think>\s*", "", text)
    text = re.sub(r"(?is)<thinking>.*?</thinking>\s*", "", text)
    return text


def load_rows(path: str) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            item = json.loads(line)
            if "messages" not in item or len(item["messages"]) < 3:
                raise ValueError("each row must contain system/user/assistant messages")
            rows.append(item)
    if not rows:
        raise ValueError("empty training dataset")
    return rows


def encode_rows(rows: list[dict], tokenizer, seq_len: int) -> list[dict[str, list[int]]]:
    encoded = []
    for item in rows:
        messages = item["messages"]
        prompt_text = render(tokenizer, messages[:2], add_generation_prompt=True)
        full_text = render(tokenizer, messages, add_generation_prompt=False)
        prompt_ids = tokenizer(prompt_text, add_special_tokens=False, truncation=True, max_length=seq_len)["input_ids"]
        full_ids = tokenizer(full_text, add_special_tokens=False, truncation=True, max_length=seq_len)["input_ids"]
        if len(full_ids) < 2:
            continue
        prompt_len = min(len(prompt_ids), len(full_ids) - 1)
        labels = [-100] * prompt_len + full_ids[prompt_len:]
        labels = labels[:seq_len]
        input_ids = full_ids[:seq_len]
        attention = [1] * len(input_ids)
        if any(token != -100 for token in labels):
            encoded.append({"input_ids": input_ids, "attention_mask": attention, "labels": labels})
    if not encoded:
        raise ValueError("all examples became empty after tokenization")
    return encoded


def collate(batch: list[dict], pad_id: int, device: torch.device) -> dict[str, torch.Tensor]:
    length = max(len(item["input_ids"]) for item in batch)
    ids, masks, labels = [], [], []
    for item in batch:
        pad = length - len(item["input_ids"])
        ids.append(item["input_ids"] + [pad_id] * pad)
        masks.append(item["attention_mask"] + [0] * pad)
        labels.append(item["labels"] + [-100] * pad)
    return {
        "input_ids": torch.tensor(ids, dtype=torch.long, device=device),
        "attention_mask": torch.tensor(masks, dtype=torch.long, device=device),
        "labels": torch.tensor(labels, dtype=torch.long, device=device),
    }


def main() -> None:
    args = parse_args()
    local_rank, rank, world_size = setup_distributed()
    device = torch.device("cuda", local_rank)
    random.seed(args.seed + rank)
    torch.manual_seed(args.seed + rank)
    torch.backends.cuda.matmul.allow_tf32 = True

    if rank == 0:
        print(f"loading {args.model_path} on {world_size} GPU(s)", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(args.model_path, trust_remote_code=True, use_fast=True)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token

    config = AutoConfig.from_pretrained(args.model_path, trust_remote_code=True)
    # Train the text-only language model while leaving the vision tower frozen.
    # Qwen3.8 exposes this as a config flag and vLLM exposes the same mode.
    config.language_model_only = True
    model = AutoModelForCausalLM.from_pretrained(
        args.model_path,
        config=config,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
        trust_remote_code=True,
    )
    model.to(device)
    model.config.use_cache = False
    if hasattr(model, "enable_input_require_grads"):
        model.enable_input_require_grads()
    if hasattr(model, "gradient_checkpointing_enable"):
        model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})

    lora_config = LoraConfig(
        r=args.rank,
        lora_alpha=args.alpha,
        lora_dropout=args.dropout,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules="all-linear",
    )
    model = get_peft_model(model, lora_config)
    if rank == 0:
        model.print_trainable_parameters()
    if world_size > 1:
        model = DDP(model, device_ids=[local_rank], output_device=local_rank, find_unused_parameters=False)

    rows = encode_rows(load_rows(args.data), tokenizer, args.seq_len)
    optimizer = torch.optim.AdamW(
        [parameter for parameter in model.parameters() if parameter.requires_grad],
        lr=args.learning_rate,
        betas=(0.9, 0.95),
        weight_decay=0.01,
    )

    output = Path(args.output)
    if rank == 0:
        output.mkdir(parents=True, exist_ok=True)
        (output / "training_config.json").write_text(json.dumps(vars(args), ensure_ascii=False, indent=2), encoding="utf-8")
    if world_size > 1:
        dist.barrier()

    model.train()
    optimizer.zero_grad(set_to_none=True)
    global_step = 0
    micro_step = 0
    started = time.time()
    for epoch in range(args.epochs):
        indices = list(range(rank, len(rows), world_size))
        random.Random(args.seed + epoch).shuffle(indices)
        for offset in range(0, len(indices), args.batch_size):
            batch_rows = [rows[index] for index in indices[offset : offset + args.batch_size]]
            batch = collate(batch_rows, tokenizer.pad_token_id, device)
            with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
                loss = model(**batch).loss / args.gradient_accumulation
            loss.backward()
            micro_step += 1
            if micro_step % args.gradient_accumulation != 0:
                continue
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            optimizer.zero_grad(set_to_none=True)
            global_step += 1
            if rank == 0 and (global_step == 1 or global_step % 5 == 0):
                print(f"step={global_step} loss={loss.item() * args.gradient_accumulation:.4f} elapsed={time.time() - started:.1f}s", flush=True)
            if global_step >= args.max_steps:
                break
        if global_step >= args.max_steps:
            break

    if rank == 0:
        unwrapped = model.module if isinstance(model, DDP) else model
        unwrapped.save_pretrained(output, safe_serialization=True)
        tokenizer.save_pretrained(output)
        (output / "training_complete.json").write_text(
            json.dumps({"globalSteps": global_step, "examples": len(rows), "worldSize": world_size, "finishedAt": time.time()}, indent=2),
            encoding="utf-8",
        )
        print(f"saved LoRA adapter to {output}", flush=True)
    if world_size > 1:
        dist.barrier()
        dist.destroy_process_group()


if __name__ == "__main__":
    main()

