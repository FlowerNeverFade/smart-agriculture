"""Generate historical agricultural telemetry without a live broker."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .config import build_devices


def backfill(
    config: dict[str, Any],
    days: int,
    step_minutes: int,
    output: str | Path,
) -> tuple[Path, int]:
    tz = ZoneInfo((config.get("simulation") or {}).get("timezone", "Asia/Shanghai"))
    end = datetime.now(tz).replace(second=0, microsecond=0)
    start = end - timedelta(days=days)
    dt_seconds = step_minutes * 60
    devices = build_devices(config)

    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        now = start
        while now <= end:
            for device in devices:
                payload = device.step(now, dt_seconds)
                handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
                count += 1
            now += timedelta(minutes=step_minutes)
    return path, count
