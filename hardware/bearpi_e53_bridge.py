#!/usr/bin/env python3
"""Bridge BearPi HM Nano E53_IA1 serial readings into AgriLoop MQTT.

The official E53_IA1 sample prints three human-readable lines per reading::

    Lux Value is 53.33
    Humidity is 44.10
    Temperature is 28.13

This adapter also accepts a compact JSON line, which is useful for custom
firmware.  It deliberately tags every event as REAL/HARDWARE; the API then
arbitrates it against the simulator for the same plot and metric.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

try:  # Optional so parser tests work without hardware packages installed.
    import paho.mqtt.client as mqtt  # type: ignore
except Exception:  # pragma: no cover - exercised only on a clean workstation
    mqtt = None

try:  # Optional for --stdin parser mode.
    import serial  # type: ignore
except Exception:  # pragma: no cover - exercised only without pyserial
    serial = None


METRIC_SPECS = {
    "light": ("LIGHT", "lux"),
    "lux": ("LIGHT", "lux"),
    "humidity": ("AIR_HUMIDITY", "%RH"),
    "air_humidity": ("AIR_HUMIDITY", "%RH"),
    "temperature": ("AIR_TEMPERATURE", "°C"),
    "air_temperature": ("AIR_TEMPERATURE", "°C"),
}

TEXT_PATTERNS = (
    (re.compile(r"\b(?:lux|light)\s*(?:value\s*)?(?:is|=|:)\s*([-+]?\d+(?:\.\d+)?)", re.I), "LIGHT", "lux"),
    (re.compile(r"\b(?:humidity|air[_ ]?humidity)\s*(?:value\s*)?(?:is|=|:)\s*([-+]?\d+(?:\.\d+)?)", re.I), "AIR_HUMIDITY", "%RH"),
    (re.compile(r"\b(?:temperature|temp|air[_ ]?temperature)\s*(?:value\s*)?(?:is|=|:)\s*([-+]?\d+(?:\.\d+)?)", re.I), "AIR_TEMPERATURE", "°C"),
    (re.compile(r"(?:光照|照度)\s*(?:值)?\s*(?:是|=|:)\s*([-+]?\d+(?:\.\d+)?)"), "LIGHT", "lux"),
    (re.compile(r"湿度\s*(?:值)?\s*(?:是|=|:)\s*([-+]?\d+(?:\.\d+)?)"), "AIR_HUMIDITY", "%RH"),
    (re.compile(r"温度\s*(?:值)?\s*(?:是|=|:)\s*([-+]?\d+(?:\.\d+)?)"), "AIR_TEMPERATURE", "°C"),
)


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def _json_samples(payload: Any) -> list[tuple[str, float, str]]:
    if not isinstance(payload, dict):
        return []
    result: list[tuple[str, float, str]] = []
    for raw_key, raw_value in payload.items():
        key = str(raw_key).strip().lower().replace("-", "_").replace(" ", "_")
        spec = METRIC_SPECS.get(key)
        if spec is None:
            continue
        value = _number(raw_value)
        if value is not None:
            result.append((spec[0], value, spec[1]))
    return result


def parse_line(line: str) -> list[tuple[str, float, str]]:
    """Parse one serial line into ``(metric, value, unit)`` tuples."""
    text = str(line or "").strip()
    if not text:
        return []
    if text.startswith("{"):
        try:
            parsed = _json_samples(json.loads(text))
            if parsed:
                return parsed
        except json.JSONDecodeError:
            pass
    values: list[tuple[str, float, str]] = []
    for pattern, metric, unit in TEXT_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        value = _number(match.group(1))
        if value is not None:
            values.append((metric, value, unit))
    return values


def parse_lines(lines: Iterable[str]) -> list[tuple[str, float, str]]:
    result: list[tuple[str, float, str]] = []
    for line in lines:
        result.extend(parse_line(line))
    return result


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def make_event(metric: str, value: float, unit: str, args: argparse.Namespace, ts: str | None = None) -> dict[str, Any]:
    return {
        "eventId": f"hardware-{args.device_id}-{uuid.uuid4().hex[:16]}",
        "farmId": args.farm_id,
        "plotId": args.plot_id,
        "deviceId": args.device_id,
        "metric": metric,
        "value": round(value, 3),
        "unit": unit,
        "ts": ts or iso_now(),
        "quality": {"status": "GOOD", "freshnessMs": 0, "confidence": 0.99},
        "scenarioId": "hardware-bearpi-e53-ia1",
        "branchId": "MAIN",
        "schemaVersion": "1.0",
        "sourceMode": "REAL",
        "provenance": "OBSERVED",
        "dataOrigin": "HARDWARE",
    }


def make_status(args: argparse.Namespace, ts: str | None = None) -> dict[str, Any]:
    return {
        "deviceId": args.device_id,
        "farmId": args.farm_id,
        "plotId": args.plot_id,
        "status": "ONLINE",
        "lastSeen": ts or iso_now(),
        "sourceMode": "REAL",
        "provenance": "OBSERVED",
        "dataOrigin": "HARDWARE",
        "scenarioId": "hardware-bearpi-e53-ia1",
    }


class Publisher:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.client = None
        if not args.mqtt:
            return
        if mqtt is None:
            raise RuntimeError("缺少 paho-mqtt，请先安装 hardware/requirements.txt")
        try:
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"agriloop-hardware-{uuid.uuid4().hex[:8]}")
        except AttributeError:  # paho 1.x compatibility
            self.client = mqtt.Client(client_id=f"agriloop-hardware-{uuid.uuid4().hex[:8]}")
        if args.mqtt_username:
            self.client.username_pw_set(args.mqtt_username, args.mqtt_password)
        self.client.connect(args.mqtt_host, args.mqtt_port, 30)
        self.client.loop_start()

    def send(self, event: dict[str, Any]) -> None:
        topic = f"agri/{self.args.farm_id}/{self.args.plot_id}/telemetry"
        if self.client is None:
            print(json.dumps(event, ensure_ascii=False), flush=True)
            return
        info = self.client.publish(topic, json.dumps(event, ensure_ascii=False), qos=1)
        if info.rc != 0:
            raise RuntimeError(f"MQTT 发布失败，rc={info.rc}")

    def heartbeat(self, status: dict[str, Any]) -> None:
        if self.client is None:
            return
        topic = f"agri/{self.args.farm_id}/{self.args.plot_id}/device/status"
        self.client.publish(topic, json.dumps(status, ensure_ascii=False), qos=1)

    def close(self) -> None:
        if self.client is not None:
            self.client.loop_stop()
            self.client.disconnect()


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="BearPi E53_IA1 -> AgriLoop MQTT bridge")
    p.add_argument("--port", default="COM5", help="串口，例如 COM5 或 /dev/ttyUSB0")
    p.add_argument("--baud", type=int, default=115200)
    p.add_argument("--serial-timeout", type=float, default=1.0)
    p.add_argument("--farm-id", default="farm-demo")
    p.add_argument("--plot-id", default="plot-a01")
    p.add_argument("--device-id", default="bearpi-e53-ia1-a01")
    p.add_argument("--mqtt", action="store_true", help="发布到 MQTT；不指定时输出标准化 JSON")
    p.add_argument("--mqtt-host", default="127.0.0.1")
    p.add_argument("--mqtt-port", type=int, default=1883)
    p.add_argument("--mqtt-username", default="")
    p.add_argument("--mqtt-password", default="")
    p.add_argument("--stdin", action="store_true", help="从标准输入读取串口样例，便于测试")
    p.add_argument("--once", action="store_true", help="收到至少一个指标后退出")
    return p


def run(args: argparse.Namespace) -> int:
    publisher = Publisher(args)
    last_heartbeat = 0.0
    try:
        if args.stdin:
            lines = sys.stdin
            for line in lines:
                samples = parse_line(line)
                if not samples:
                    continue
                ts = iso_now()
                for metric, value, unit in samples:
                    publisher.send(make_event(metric, value, unit, args, ts))
                publisher.heartbeat(make_status(args, ts))
                if args.once:
                    break
            return 0

        if serial is None:
            raise RuntimeError("缺少 pyserial，请先安装 hardware/requirements.txt")
        while True:
            try:
                with serial.Serial(args.port, args.baud, timeout=args.serial_timeout) as device:
                    print(f"已连接 {args.port} @ {args.baud} 8N1", file=sys.stderr)
                    while True:
                        raw = device.readline()
                        if not raw:
                            now = time.monotonic()
                            if now - last_heartbeat >= 30:
                                publisher.heartbeat(make_status(args))
                                last_heartbeat = now
                            continue
                        samples = parse_line(raw.decode("utf-8", errors="replace"))
                        if not samples:
                            continue
                        ts = iso_now()
                        for metric, value, unit in samples:
                            publisher.send(make_event(metric, value, unit, args, ts))
                        publisher.heartbeat(make_status(args, ts))
                        last_heartbeat = time.monotonic()
                        if args.once:
                            return 0
            except KeyboardInterrupt:
                return 0
            except Exception as error:
                print(f"串口/MQTT 暂时不可用：{error}；5 秒后重试", file=sys.stderr)
                time.sleep(5)
    finally:
        publisher.close()


if __name__ == "__main__":
    raise SystemExit(run(parser().parse_args()))
