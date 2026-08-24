#!/usr/bin/env python3
"""Deterministic AgriLoop telemetry simulator and replay driver."""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import paho.mqtt.client as mqtt  # type: ignore
except Exception:  # pragma: no cover - optional in standalone mode
    mqtt = None

UTC8 = timezone(timedelta(hours=8))
PLOTS = [
    ("plot-a01", "tomato"),
    ("plot-a02", "tomato"),
    ("plot-b01", "cucumber"),
]
METRICS = [
    ("SOIL_MOISTURE", "%", 0.0, 100.0),
    ("AIR_TEMPERATURE", "°C", -40.0, 80.0),
    ("LIGHT", "lux", 0.0, 100000.0),
    ("CO2", "ppm", 0.0, 10000.0),
    ("PH", "pH", 0.0, 14.0),
    ("WATER_LEVEL", "%", 0.0, 100.0),
]


def now_iso(dt: datetime) -> str:
    return dt.astimezone(UTC8).isoformat()


def build_event(rng: random.Random, scenario: str, scenario_id: str, branch: str,
                plot_id: str, metric: str, unit: str, index: int, ts: datetime) -> dict:
    if metric == "SOIL_MOISTURE":
        base = 34.0
        if scenario in {"drought", "gradual-drydown"}:
            base -= index * (0.65 if scenario == "drought" else 0.28)
        elif scenario == "heavy-rain":
            base += index * 0.34
        elif scenario == "sensor-drift":
            base += rng.uniform(-1.0, 1.0)
        value = base + rng.uniform(-0.4, 0.4)
    elif metric == "AIR_TEMPERATURE":
        value = 27.0 + (8.0 if scenario == "heat-wave" else 0.0) + rng.uniform(-0.8, 0.8)
    elif metric == "LIGHT":
        value = 38000 + rng.uniform(-3000, 3000)
    elif metric == "CO2":
        value = 650 + rng.uniform(-30, 30)
    elif metric == "PH":
        value = 6.2 + rng.uniform(-0.12, 0.12)
    else:
        value = 75.0 - (index * 0.2 if scenario == "limited-water" else 0) + rng.uniform(-1.0, 1.0)
    quality_status = "GOOD"
    confidence = 0.98
    if scenario == "sensor-drift" and metric in {"SOIL_MOISTURE", "PH"}:
        quality_status = "BAD" if index % 4 == 0 else "DEGRADED"
        confidence = 0.2 if quality_status == "BAD" else 0.55
    if scenario == "device-offline" and index >= 15:
        quality_status = "BAD"
        confidence = 0.1
    return {
        "eventId": f"{scenario_id}-{branch}-{plot_id}-{metric}-{index:05d}",
        "farmId": "farm-demo",
        "plotId": plot_id,
        "deviceId": f"mock-{plot_id}",
        "metric": metric,
        "value": round(max(-40.0, value), 3),
        "unit": unit,
        "ts": now_iso(ts),
        "quality": {"status": quality_status, "freshnessMs": 200, "confidence": confidence},
        "scenarioId": scenario_id,
        "branchId": branch,
        "schemaVersion": "1.0",
    }


def run(args: argparse.Namespace) -> int:
    rng = random.Random(args.seed)
    scenario_id = args.scenario_id or f"{args.scenario}-{args.seed}"
    branch = args.branch
    client = None
    if mqtt is not None and args.mqtt:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"agriloop-sim-{uuid.uuid4().hex[:8]}")
        if args.mqtt_username:
            client.username_pw_set(args.mqtt_username, args.mqtt_password)
        client.connect(args.mqtt_host, args.mqtt_port, 30)
        client.loop_start()
    elif args.mqtt:
        print("paho-mqtt 未安装，切换为 stdout 回放模式", file=sys.stderr)

    start = datetime.now(UTC8) - timedelta(minutes=args.minutes)
    count = 0
    index = 0
    try:
        while args.continuous or index < args.samples:
            # The Supervisor-managed live stream must stay fresh instead of
            # replaying an ever more distant/future synthetic clock.  Values
            # repeat the deterministic sample window, while the event sequence
            # and timestamp continue to advance.
            value_index = index % max(args.samples, 1) if args.continuous else index
            ts = datetime.now(UTC8) if args.continuous else start + timedelta(seconds=index * args.interval)
            for plot_id, _crop in PLOTS:
                for metric, unit, _low, _high in METRICS:
                    event = build_event(rng, args.scenario, scenario_id, branch, plot_id, metric, unit, value_index, ts)
                    if args.continuous:
                        event["eventId"] = f"{scenario_id}-{branch}-{plot_id}-{metric}-{index:09d}"
                    topic = f"agri/farm-demo/{plot_id}/telemetry"
                    if client is not None:
                        client.publish(topic, json.dumps(event, ensure_ascii=False), qos=1)
                    else:
                        print(json.dumps(event, ensure_ascii=False))
                    count += 1
            if args.speed > 0:
                time.sleep(max(0.0, args.interval / args.speed))
            index += 1
    finally:
        if client is not None:
            client.loop_stop()
            client.disconnect()
    print(json.dumps({"scenarioId": scenario_id, "branchId": branch, "events": count, "seed": args.seed}, ensure_ascii=False), file=sys.stderr)
    return 0


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="AgriLoop deterministic simulator")
    p.add_argument("--scenario", default="normal", choices=["normal", "drought", "sensor-drift", "heavy-rain", "heat-wave", "device-offline", "gradual-drydown", "forecast-miss", "limited-water", "repeated-case", "cost-shift"])
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--scenario-id")
    p.add_argument("--branch", default="MAIN", choices=["MAIN", "EXECUTE", "NO_ACTION"])
    # 3 plots × 6 metrics × 60 samples = 1,080 deterministic events by default,
    # making the documented >1,000-event replay gate a zero-argument check.
    p.add_argument("--samples", type=int, default=60)
    p.add_argument("--minutes", type=int, default=20)
    p.add_argument("--interval", type=float, default=20.0)
    p.add_argument("--speed", type=float, default=1.0)
    p.add_argument("--mqtt", action="store_true")
    p.add_argument("--mqtt-host", default="localhost")
    p.add_argument("--mqtt-port", type=int, default=1883)
    p.add_argument("--mqtt-username", default="")
    p.add_argument("--mqtt-password", default="")
    p.add_argument("--continuous", action="store_true", help="持续生成使用当前时间戳的实时遥测，直到进程被停止")
    return p


if __name__ == "__main__":
    raise SystemExit(run(parser().parse_args()))
