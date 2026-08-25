#!/usr/bin/env python3
"""Deterministic AgriLoop telemetry simulator and replay driver."""
from __future__ import annotations

import argparse
import json
import math
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
    ("AIR_HUMIDITY", "%RH", 0.0, 100.0),
    ("LIGHT", "lux", 0.0, 100000.0),
    ("CO2", "ppm", 0.0, 10000.0),
    ("PH", "pH", 0.0, 14.0),
    ("WATER_LEVEL", "%", 0.0, 100.0),
]


def now_iso(dt: datetime) -> str:
    return dt.astimezone(UTC8).isoformat()


def daylight_fraction(ts: datetime) -> float:
    """A smooth daylight curve; the E53 light sensor should be dark at night."""
    hour = ts.astimezone(UTC8).hour + ts.astimezone(UTC8).minute / 60.0
    if hour <= 5.5 or hour >= 19.5:
        return 0.0
    phase = (hour - 5.5) / 14.0
    return max(0.0, min(1.0, math.sin(math.pi * phase)))


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def initial_state(plot_id: str, rng: random.Random) -> dict[str, float]:
    offsets = {"plot-a01": 0.0, "plot-a02": 1.0, "plot-b01": -0.8}
    return {
        "soil": 35.0 + offsets.get(plot_id, 0.0) + rng.uniform(-1.0, 1.0),
        "temperature": 24.0 + offsets.get(plot_id, 0.0) * 0.4,
        "humidity": 69.0 - offsets.get(plot_id, 0.0),
        "co2": 520.0 + rng.uniform(-20.0, 20.0),
        "ph": 6.25 + rng.uniform(-0.06, 0.06),
        "water": 78.0 + rng.uniform(-2.0, 2.0),
    }


def evolve_state(state: dict[str, float], rng: random.Random, scenario: str,
                 ts: datetime, index: int) -> None:
    """Advance a plot by one sample using bounded first-order dynamics."""
    daylight = daylight_fraction(ts)
    heat_offset = 7.0 if scenario == "heat-wave" else 0.0
    temperature_target = 20.5 + 8.0 * daylight + heat_offset
    humidity_target = 82.0 - 30.0 * daylight - (8.0 if scenario == "heat-wave" else 0.0)
    state["temperature"] += (temperature_target - state["temperature"]) * 0.16 + rng.uniform(-0.12, 0.12)
    state["humidity"] += (humidity_target - state["humidity"]) * 0.12 + rng.uniform(-0.25, 0.25)

    soil_rate = {"drought": -0.22, "gradual-drydown": -0.09, "heavy-rain": 0.45,
                 "limited-water": -0.06}.get(scenario, 0.0)
    state["soil"] += soil_rate + rng.uniform(-0.08, 0.08)
    state["soil"] = _clamp(state["soil"], 4.0, 92.0)

    co2_target = 430.0 + 180.0 * (1.0 - daylight)
    state["co2"] += (co2_target - state["co2"]) * 0.10 + rng.uniform(-3.0, 3.0)
    state["co2"] = _clamp(state["co2"], 300.0, 1400.0)
    state["ph"] += (6.25 - state["ph"]) * 0.04 + rng.uniform(-0.012, 0.012)
    water_rate = -0.05 if scenario == "limited-water" else (0.08 if scenario == "heavy-rain" else -0.015)
    state["water"] = _clamp(state["water"] + water_rate + rng.uniform(-0.06, 0.06), 8.0, 100.0)


def metric_value(state: dict[str, float], rng: random.Random, scenario: str,
                 metric: str, ts: datetime, index: int) -> float:
    if metric == "SOIL_MOISTURE":
        value = state["soil"]
        if scenario == "sensor-drift":
            value += math.sin(index / 2.0) * 1.5
    elif metric == "AIR_TEMPERATURE":
        value = state["temperature"]
    elif metric == "AIR_HUMIDITY":
        value = state["humidity"]
    elif metric == "LIGHT":
        value = 45.0 + daylight_fraction(ts) * 47_000.0
    elif metric == "CO2":
        value = state["co2"]
    elif metric == "PH":
        value = state["ph"]
    else:
        value = state["water"]
    noise = {"LIGHT": 250.0, "PH": 0.015, "AIR_HUMIDITY": 0.18}.get(metric, 0.08)
    return max(0.0, value + rng.uniform(-noise, noise)) if metric == "LIGHT" else value + rng.uniform(-noise, noise)


def build_event(rng: random.Random, scenario: str, scenario_id: str, branch: str,
                plot_id: str, metric: str, unit: str, index: int, ts: datetime,
                state: dict[str, float] | None = None) -> dict:
    # Keep the public helper useful for deterministic replay callers while the
    # live runner supplies a state object for smooth trajectories.
    if state is None:
        state = initial_state(plot_id, rng)
        for _ in range(max(0, index)):
            evolve_state(state, rng, scenario, ts, _)
    value = metric_value(state, rng, scenario, metric, ts, index)
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
        "value": round(value, 3),
        "unit": unit,
        "ts": now_iso(ts),
        "quality": {"status": quality_status, "freshnessMs": 200, "confidence": confidence},
        "scenarioId": scenario_id,
        "branchId": branch,
        "sourceMode": "SIMULATION",
        "provenance": "OBSERVED",
        "dataOrigin": "SIMULATOR",
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
    states = {plot_id: initial_state(plot_id, rng) for plot_id, _crop in PLOTS}
    try:
        while args.continuous or index < args.samples:
            # The Supervisor-managed live stream must stay fresh instead of
            # replaying an ever more distant/future synthetic clock.  Values
            # repeat the deterministic sample window, while the event sequence
            # and timestamp continue to advance.
            value_index = index % max(args.samples, 1) if args.continuous else index
            ts = datetime.now(UTC8) if args.continuous else start + timedelta(seconds=index * args.interval)
            for plot_id, _crop in PLOTS:
                evolve_state(states[plot_id], rng, args.scenario, ts, index)
                for metric, unit, _low, _high in METRICS:
                    event = build_event(rng, args.scenario, scenario_id, branch, plot_id, metric, unit, value_index, ts, states[plot_id])
                    if args.continuous:
                        event["eventId"] = f"{scenario_id}-{branch}-{plot_id}-{metric}-{index:09d}"
                    topic = f"agri/farm-demo/{plot_id}/telemetry"
                    if client is not None:
                        client.publish(topic, json.dumps(event, ensure_ascii=False), qos=1)
                    else:
                        print(json.dumps(event, ensure_ascii=False))
                    count += 1
                if client is not None:
                    status = {
                        "deviceId": f"mock-{plot_id}", "farmId": "farm-demo", "plotId": plot_id,
                        "status": "OFFLINE" if args.scenario == "device-offline" and index >= 15 else "ONLINE",
                        "lastSeen": now_iso(ts), "sourceMode": "SIMULATION", "dataOrigin": "SIMULATOR",
                        "provenance": "OBSERVED", "scenarioId": scenario_id
                    }
                    client.publish(f"agri/farm-demo/{plot_id}/device/status", json.dumps(status, ensure_ascii=False), qos=1)
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
    # 3 plots × 7 metrics × 60 samples = 1,260 deterministic events by default,
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
