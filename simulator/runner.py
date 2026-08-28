#!/usr/bin/env python3
"""AgriLoop telemetry simulator and replay driver.

The live runner intentionally combines smooth physical dynamics with bounded
random variation.  A small JSON file may override the scenario and parameters
for every plot independently; the file is reloaded while the process is
running so the plot-detail UI can change a strategy without restarting the
simulator.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import paho.mqtt.client as mqtt  # type: ignore
except Exception:  # pragma: no cover - optional in standalone mode
    mqtt = None


class HttpIngestClient:
    """Push telemetry into the API without MQTT (standalone local fallback)."""

    def __init__(self, api_url: str, username: str, password: str, role: str = "FARM_ADMIN") -> None:
        self.api_url = api_url.rstrip("/")
        self.username = username
        self.password = password
        self.role = role
        self.token = ""
        self._login()

    def _request(self, method: str, path: str, body: dict | None = None, auth: bool = True) -> dict:
        payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if auth:
            if not self.token:
                self._login()
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(
            f"{self.api_url}{path}",
            data=payload,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            if error.code == 401 and auth:
                self._login()
                return self._request(method, path, body, auth=True)
            raise RuntimeError(f"HTTP {error.code} {path}: {detail}") from error
        except urllib.error.URLError as error:
            raise RuntimeError(f"无法连接 API {self.api_url}: {error.reason}") from error
        return json.loads(raw) if raw else {}

    def _login(self) -> None:
        response = self._request(
            "POST",
            "/api/v1/auth/login",
            {"username": self.username, "password": self.password, "role": self.role},
            auth=False,
        )
        session = response.get("data") or response
        token = session.get("accessToken")
        if not token:
            raise RuntimeError(f"登录失败，响应缺少 accessToken: {response}")
        self.token = token

    def publish_telemetry(self, event: dict) -> None:
        self._request("POST", "/api/v1/telemetry", event)

    def publish_device_status(self, status: dict) -> None:
        device_id = status.get("deviceId") or ""
        if not device_id:
            return
        payload = dict(status)
        payload.setdefault("ts", status.get("lastSeen") or datetime.now(UTC8).isoformat())
        self._request("POST", f"/api/v1/devices/{device_id}/heartbeat", payload)

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
    ("RAINFALL", "mm/h", 0.0, 250.0),
]

SCENARIO_ALIASES = {
    "normal": "normal",
    "drought": "drought",
    "heavy-rain": "heavy-rain",
    "heavy_rain": "heavy-rain",
    "storm": "heavy-rain",
    "sensor-drift": "sensor-drift",
    "sensor_drift": "sensor-drift",
    "device-offline": "device-offline",
    "device_offline": "device-offline",
    "offline": "device-offline",
    "heat-wave": "heat-wave",
    "gradual-drydown": "gradual-drydown",
    "forecast-miss": "forecast-miss",
    "limited-water": "limited-water",
    "repeated-case": "repeated-case",
    "cost-shift": "cost-shift",
}

SCENARIO_DEFAULTS = {
    "normal": {
        "volatility": 1.25, "timeScale": 60.0, "temperatureBias": 0.0,
        "humidityBias": 0.0, "rainfallRate": 0.2,
        "soilMoistureTrendPerHour": -0.18, "driftRatePerHour": 0.0,
        "offlineRatio": 0.0,
    },
    "drought": {
        "volatility": 1.75, "timeScale": 60.0, "temperatureBias": 7.0,
        "humidityBias": -20.0, "rainfallRate": 0.0,
        "soilMoistureTrendPerHour": -3.6, "driftRatePerHour": 0.0,
        "offlineRatio": 0.0,
    },
    "heavy-rain": {
        "volatility": 1.9, "timeScale": 60.0, "temperatureBias": -4.5,
        "humidityBias": 20.0, "rainfallRate": 32.0,
        "soilMoistureTrendPerHour": 7.2, "driftRatePerHour": 0.0,
        "offlineRatio": 0.0,
    },
    "sensor-drift": {
        "volatility": 1.45, "timeScale": 60.0, "temperatureBias": 0.0,
        "humidityBias": 0.0, "rainfallRate": 0.2,
        "soilMoistureTrendPerHour": -0.18, "driftRatePerHour": 2.4,
        "offlineRatio": 0.0,
    },
    "device-offline": {
        "volatility": 1.3, "timeScale": 60.0, "temperatureBias": 0.0,
        "humidityBias": 0.0, "rainfallRate": 0.2,
        "soilMoistureTrendPerHour": -0.18, "driftRatePerHour": 0.0,
        "offlineRatio": 0.55,
    },
}

PARAMETER_LIMITS = {
    "volatility": (0.2, 3.0),
    "timeScale": (1.0, 180.0),
    "temperatureBias": (-15.0, 15.0),
    "humidityBias": (-40.0, 40.0),
    "rainfallRate": (0.0, 120.0),
    "soilMoistureTrendPerHour": (-12.0, 12.0),
    "driftRatePerHour": (0.0, 10.0),
    "offlineRatio": (0.0, 1.0),
}


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


def normalize_scenario(value: object) -> str:
    key = str(value or "normal").strip().lower().replace(" ", "-")
    return SCENARIO_ALIASES.get(key, "normal")


def scenario_parameters(scenario: str, supplied: object = None) -> dict[str, float]:
    """Return a complete, bounded parameter set for a scenario."""
    normalized = normalize_scenario(scenario)
    defaults = SCENARIO_DEFAULTS.get(normalized, SCENARIO_DEFAULTS["normal"])
    raw = supplied if isinstance(supplied, dict) else {}
    result: dict[str, float] = {}
    for key, (low, high) in PARAMETER_LIMITS.items():
        try:
            value = float(raw.get(key, defaults.get(key, SCENARIO_DEFAULTS["normal"].get(key, 0.0))))
        except (TypeError, ValueError):
            value = float(defaults.get(key, SCENARIO_DEFAULTS["normal"].get(key, 0.0)))
        result[key] = _clamp(value, low, high)
    return result


def load_plot_strategies(path: str | Path | None) -> dict[str, dict]:
    """Read the API-generated strategy file; malformed files fail closed."""
    if not path:
        return {}
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        plots = payload.get("plots", {}) if isinstance(payload, dict) else {}
        if not isinstance(plots, dict):
            return {}
        result: dict[str, dict] = {}
        for plot_id, raw in plots.items():
            if not isinstance(raw, dict) or not str(plot_id).strip():
                continue
            scenario = normalize_scenario(raw.get("scenario", "normal"))
            result[str(plot_id)] = {
                "scenario": scenario,
                "revision": int(raw.get("revision", 1) or 1),
                "parameters": scenario_parameters(scenario, raw.get("parameters")),
            }
        return result
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return {}


def initial_state(plot_id: str, rng: random.Random) -> dict[str, float]:
    offsets = {"plot-a01": 0.0, "plot-a02": 1.0, "plot-b01": -0.8}
    return {
        "soil": 35.0 + offsets.get(plot_id, 0.0) + rng.uniform(-1.0, 1.0),
        "temperature": 24.0 + offsets.get(plot_id, 0.0) * 0.4,
        "humidity": 69.0 - offsets.get(plot_id, 0.0),
        "co2": 520.0 + rng.uniform(-20.0, 20.0),
        "ph": 6.25 + rng.uniform(-0.06, 0.06),
        "water": 78.0 + rng.uniform(-2.0, 2.0),
        "scenario_steps": 0.0,
    }


def evolve_state(state: dict[str, float], rng: random.Random, scenario: str,
                 ts: datetime, index: int, parameters: dict[str, float] | None = None,
                 step_seconds: float = 20.0) -> None:
    """Advance a plot by one sample using bounded first-order dynamics."""
    scenario = normalize_scenario(scenario)
    params = scenario_parameters(scenario, parameters)
    volatility = params["volatility"]
    simulated_hours = max(0.1, step_seconds) * params["timeScale"] / 3600.0
    daylight = daylight_fraction(ts)
    heat_offset = 7.0 if scenario == "heat-wave" else params["temperatureBias"]
    temperature_target = 20.5 + 8.0 * daylight + heat_offset
    humidity_target = 82.0 - 30.0 * daylight + params["humidityBias"]
    # Faster attraction and bounded noise make a scenario visibly active while
    # avoiding physically impossible one-sample jumps.
    state["temperature"] += (temperature_target - state["temperature"]) * 0.22 + rng.uniform(-0.32, 0.32) * volatility
    state["temperature"] = _clamp(state["temperature"], -20.0, 55.0)
    state["humidity"] += (humidity_target - state["humidity"]) * 0.20 + rng.uniform(-0.75, 0.75) * volatility
    state["humidity"] = _clamp(state["humidity"], 10.0, 99.5)

    legacy_soil_rate = {"gradual-drydown": -1.1, "limited-water": -0.7}.get(scenario, 0.0)
    soil_rate = (params["soilMoistureTrendPerHour"] + legacy_soil_rate) * simulated_hours
    rain_absorption = min(params["rainfallRate"], 80.0) * simulated_hours * 0.055
    soil_noise = rng.uniform(-0.22, 0.22) * volatility
    state["soil"] += soil_rate + rain_absorption + soil_noise
    state["soil"] = _clamp(state["soil"], 4.0, 92.0)

    co2_target = 430.0 + 180.0 * (1.0 - daylight)
    state["co2"] += (co2_target - state["co2"]) * 0.10 + rng.uniform(-9.0, 9.0) * volatility
    state["co2"] = _clamp(state["co2"], 300.0, 1400.0)
    state["ph"] += (6.25 - state["ph"]) * 0.04 + rng.uniform(-0.025, 0.025) * volatility
    water_rate = (-1.0 if scenario == "limited-water" else (2.6 if scenario == "heavy-rain" else -0.18)) * simulated_hours
    state["water"] = _clamp(state["water"] + water_rate + rng.uniform(-0.18, 0.18) * volatility, 8.0, 100.0)
    state["scenario_steps"] = state.get("scenario_steps", 0.0) + 1.0


def metric_value(state: dict[str, float], rng: random.Random, scenario: str,
                 metric: str, ts: datetime, index: int,
                 parameters: dict[str, float] | None = None,
                 step_seconds: float = 20.0) -> float:
    scenario = normalize_scenario(scenario)
    params = scenario_parameters(scenario, parameters)
    volatility = params["volatility"]
    simulated_hours = state.get("scenario_steps", index) * max(0.1, step_seconds) * params["timeScale"] / 3600.0
    if metric == "SOIL_MOISTURE":
        value = state["soil"]
        if scenario == "sensor-drift":
            value += params["driftRatePerHour"] * simulated_hours + math.sin(index / 2.0) * 0.8
    elif metric == "AIR_TEMPERATURE":
        value = state["temperature"]
    elif metric == "AIR_HUMIDITY":
        value = state["humidity"]
    elif metric == "LIGHT":
        cloud_factor = 0.35 if scenario == "heavy-rain" else (1.12 if scenario == "drought" else 1.0)
        value = 45.0 + daylight_fraction(ts) * 47_000.0 * cloud_factor
    elif metric == "CO2":
        value = state["co2"]
    elif metric == "PH":
        value = state["ph"]
        if scenario == "sensor-drift":
            value += params["driftRatePerHour"] * simulated_hours * 0.035
    elif metric == "WATER_LEVEL":
        value = state["water"]
    else:
        rainfall = params["rainfallRate"]
        if scenario == "heavy-rain":
            rainfall *= 0.78 + 0.28 * math.sin(index / 2.4) + rng.uniform(-0.12, 0.18) * volatility
        elif rainfall > 0:
            rainfall *= max(0.0, 0.25 + math.sin(index / 5.0) * 0.18 + rng.uniform(-0.2, 0.2))
        value = max(0.0, rainfall)
    noise = {
        "LIGHT": 680.0, "PH": 0.02, "AIR_HUMIDITY": 0.35,
        "AIR_TEMPERATURE": 0.16, "SOIL_MOISTURE": 0.12,
        "CO2": 5.0, "WATER_LEVEL": 0.16, "RAINFALL": 0.7,
    }.get(metric, 0.08) * volatility
    noisy = value + rng.uniform(-noise, noise)
    # Keep the published value inside the same physical range enforced by the
    # API.  Random noise must make the stream look alive, never manufacture an
    # impossible negative rainfall, pH, humidity or water level sample.
    bounds = next(((low, high) for code, _unit, low, high in METRICS if code == metric), (0.0, 100000.0))
    return _clamp(noisy, bounds[0], bounds[1])


def build_event(rng: random.Random, scenario: str, scenario_id: str, branch: str,
                plot_id: str, metric: str, unit: str, index: int, ts: datetime,
                state: dict[str, float] | None = None,
                parameters: dict[str, float] | None = None,
                step_seconds: float = 20.0) -> dict:
    # Keep the public helper useful for deterministic replay callers while the
    # live runner supplies a state object for smooth trajectories.
    if state is None:
        state = initial_state(plot_id, rng)
        for _ in range(max(0, index)):
            evolve_state(state, rng, scenario, ts, _, parameters, step_seconds)
    value = metric_value(state, rng, scenario, metric, ts, index, parameters, step_seconds)
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
    http_client = None
    disabled_devices: set[str] = set()
    if args.http:
        try:
            http_client = HttpIngestClient(args.api_url, args.api_user, args.api_password, args.api_role)
            print(f"HTTP 直推已连接 {args.api_url}（用户 {args.api_user}）", file=sys.stderr)
        except Exception as error:
            print(f"HTTP 直推初始化失败: {error}", file=sys.stderr)
            return 1
    if mqtt is not None and args.mqtt:
        try:
            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"agriloop-sim-{uuid.uuid4().hex[:8]}")
            if args.mqtt_username:
                client.username_pw_set(args.mqtt_username, args.mqtt_password)

            def on_command(_client, _userdata, message):
                try:
                    payload = json.loads(message.payload.decode("utf-8"))
                    device_id = str(payload.get("deviceId") or "")
                    target = str(payload.get("targetStatus") or "").upper()
                    if not device_id or target not in {"ONLINE", "OFFLINE"}:
                        return
                    expected_id = device_id.lower()
                    if not expected_id.startswith("mock-"):
                        return
                    if target == "OFFLINE":
                        disabled_devices.add(device_id)
                    else:
                        disabled_devices.discard(device_id)
                    ack_topic = message.topic.rsplit("/", 1)[0] + "/command/ack"
                    ack = {
                        "ackId": f"ack-{uuid.uuid4().hex[:12]}",
                        "commandId": payload.get("commandId"),
                        "deviceId": device_id,
                        "targetStatus": target,
                        "status": "SUCCEEDED",
                        "receivedAt": datetime.now(UTC8).isoformat(),
                        "result": "SIMULATED_DEVICE_SWITCH",
                    }
                    _client.publish(ack_topic, json.dumps(ack, ensure_ascii=False), qos=1)
                except (ValueError, TypeError, UnicodeDecodeError):
                    return

            client.on_message = on_command
            client.connect(args.mqtt_host, args.mqtt_port, 30)
            client.subscribe("agri/+/+/command", qos=1)
            client.loop_start()
        except OSError as error:
            client = None
            print(
                f"MQTT 连接失败（{args.mqtt_host}:{args.mqtt_port}）: {error}\n"
                "提示：Docker 的 mqtt 未启动时，请改用 --http 直推 API，例如：\n"
                "  python simulator/runner.py --scenario normal --seed 42 --http --interval 5 --continuous",
                file=sys.stderr,
            )
            if http_client is None:
                return 1
    elif args.mqtt:
        print("paho-mqtt 未安装，切换为 stdout/HTTP 回放模式", file=sys.stderr)

    start = datetime.now(UTC8) - timedelta(minutes=args.minutes)
    count = 0
    index = 0
    states = {plot_id: initial_state(plot_id, rng) for plot_id, _crop in PLOTS}
    plot_configs: dict[str, dict] = {}
    config_signatures: dict[str, str] = {}
    plot_config_path = Path(args.plot_config).expanduser() if args.plot_config else None
    config_mtime_ns = -1
    try:
        while args.continuous or index < args.samples:
            # The Supervisor-managed live stream must stay fresh instead of
            # replaying an ever more distant/future synthetic clock.  Values
            # repeat the deterministic sample window, while the event sequence
            # and timestamp continue to advance.
            value_index = index % max(args.samples, 1) if args.continuous else index
            ts = datetime.now(UTC8) if args.continuous else start + timedelta(seconds=index * args.interval)
            if plot_config_path:
                try:
                    mtime_ns = plot_config_path.stat().st_mtime_ns
                except OSError:
                    mtime_ns = -1
                if mtime_ns != config_mtime_ns:
                    plot_configs = load_plot_strategies(plot_config_path)
                    config_mtime_ns = mtime_ns
            known_plots = [plot_id for plot_id, _crop in PLOTS]
            known_plots.extend(plot_id for plot_id in plot_configs if plot_id not in known_plots)
            for plot_id in known_plots:
                config = plot_configs.get(plot_id, {})
                plot_scenario = normalize_scenario(config.get("scenario", args.scenario))
                params = scenario_parameters(plot_scenario, config.get("parameters"))
                revision = int(config.get("revision", 1) or 1)
                signature = json.dumps({"scenario": plot_scenario, "parameters": params, "revision": revision}, sort_keys=True)
                if plot_id not in states or config_signatures.get(plot_id) != signature:
                    states[plot_id] = initial_state(plot_id, rng)
                    # Prime scenario-specific starting conditions so a newly
                    # selected scenario is visible on the very next sample.
                    if plot_scenario == "drought":
                        states[plot_id].update(soil=min(states[plot_id]["soil"], 27.0), temperature=31.0, humidity=43.0)
                    elif plot_scenario == "heavy-rain":
                        states[plot_id].update(soil=max(states[plot_id]["soil"], 56.0), temperature=20.5, humidity=90.0, water=90.0)
                    config_signatures[plot_id] = signature

                offline_ratio = params["offlineRatio"] if plot_scenario == "device-offline" else 0.0
                phase = (index + sum(ord(char) for char in plot_id)) % 20
                device_id = f"mock-{plot_id}"
                controlled_offline = device_id in disabled_devices
                is_offline = controlled_offline or (offline_ratio > 0 and phase < max(1, round(offline_ratio * 20)))
                if not is_offline:
                    evolve_state(states[plot_id], rng, plot_scenario, ts, index, params, args.interval)
                for metric, unit, _low, _high in METRICS:
                    if is_offline:
                        continue
                    event = build_event(rng, plot_scenario, scenario_id, branch, plot_id, metric, unit, value_index, ts,
                                        states[plot_id], params, args.interval)
                    event["scenarioId"] = plot_scenario
                    event["simulationRunId"] = scenario_id
                    event["simulationRevision"] = revision
                    if args.continuous:
                        event["eventId"] = f"{scenario_id}-{revision}-{branch}-{plot_id}-{metric}-{index:09d}"
                    topic = f"agri/farm-demo/{plot_id}/telemetry"
                    delivered = False
                    if client is not None:
                        client.publish(topic, json.dumps(event, ensure_ascii=False), qos=1)
                        delivered = True
                    if http_client is not None:
                        http_client.publish_telemetry(event)
                        delivered = True
                    if not delivered:
                        print(json.dumps(event, ensure_ascii=False))
                    count += 1
                status = {
                    "deviceId": device_id, "farmId": "farm-demo", "plotId": plot_id,
                    "status": "OFFLINE" if is_offline else "ONLINE",
                    "lastSeen": now_iso(ts), "sourceMode": "SIMULATION", "dataOrigin": "SIMULATOR",
                    "provenance": "OBSERVED", "scenarioId": plot_scenario,
                    "simulationRunId": scenario_id, "simulationRevision": revision,
                    "bindingState": "BOUND", "type": "ENVIRONMENTAL_SENSOR"
                }
                if client is not None:
                    client.publish(f"agri/farm-demo/{plot_id}/device/status", json.dumps(status, ensure_ascii=False), qos=1)
                # Heartbeat endpoint always marks ONLINE; only call it while the
                # simulated device is supposed to be reachable.
                if http_client is not None and not is_offline:
                    http_client.publish_device_status(status)
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
    # 3 plots × 8 metrics × 60 samples = 1,440 deterministic events by default,
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
    p.add_argument("--http", action="store_true", help="无 MQTT 时通过 REST 直推 /api/v1/telemetry（standalone 本地推荐）")
    p.add_argument("--api-url", default="http://127.0.0.1:8080", help="HTTP 直推目标 API 根地址")
    p.add_argument("--api-user", default="admin", help="HTTP 直推登录用户（需覆盖全部模拟地块）")
    p.add_argument("--api-password", default="demo123", help="HTTP 直推登录密码")
    p.add_argument("--api-role", default="FARM_ADMIN", help="HTTP 直推登录角色")
    p.add_argument("--continuous", action="store_true", help="持续生成使用当前时间戳的实时遥测，直到进程被停止")
    p.add_argument("--plot-config", default="", help="地块级场景 JSON；运行中自动热加载")
    return p


if __name__ == "__main__":
    raise SystemExit(run(parser().parse_args()))
