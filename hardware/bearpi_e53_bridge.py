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
import queue
import re
import sys
import threading
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

ACTUATOR_TYPES = {"FAN", "GROW_LIGHT"}
ACTUATOR_COMMAND_TYPES = {"FAN_SET": "FAN", "LIGHT_SET": "GROW_LIGHT"}
ACK_PATTERN = re.compile(
    r"^AGRI_ACK\s+(?P<command_id>[A-Za-z0-9_.:-]{1,96})\s+"
    r"(?P<actuator>FAN|GROW_LIGHT|LIGHT)\s+(?P<state>ON|OFF)\s+"
    r"(?P<status>SUCCEEDED|FAILED)(?:\s+(?P<reason>[A-Za-z0-9_.:-]{1,96}))?$",
    re.I,
)
STATE_PATTERN = re.compile(
    r"^AGRI_STATE\s+FAN\s+(?P<fan>ON|OFF)\s+(?:GROW_)?LIGHT\s+(?P<light>ON|OFF)"
    r"(?:\s+REASON\s+(?P<reason>[A-Za-z0-9_.:-]{1,96}))?$",
    re.I,
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


def parse_actuator_ack(line: str) -> dict[str, str] | None:
    """Parse a firmware acknowledgement without accepting free-form output."""
    match = ACK_PATTERN.match(str(line or "").strip())
    if not match:
        return None
    values = {key: str(value or "").upper() for key, value in match.groupdict().items()}
    values["command_id"] = str(match.group("command_id"))
    if values["actuator"] == "LIGHT":
        values["actuator"] = "GROW_LIGHT"
    return values


def parse_actuator_state(line: str) -> dict[str, str] | None:
    match = STATE_PATTERN.match(str(line or "").strip())
    if not match:
        return None
    return {
        "FAN": str(match.group("fan")).upper(),
        "GROW_LIGHT": str(match.group("light")).upper(),
        "reason": str(match.group("reason") or "").upper(),
    }


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


def make_status(
    args: argparse.Namespace,
    ts: str | None = None,
    actuator_states: dict[str, Any] | None = None,
) -> dict[str, Any]:
    status = {
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
    if actuator_states:
        status["actuatorCapabilities"] = ["FAN", "GROW_LIGHT"]
        status["actuatorStates"] = actuator_states
    return status


class Publisher:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.client = None
        self.offline = False
        self._serial_commands: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=32)
        self._pending_commands: dict[str, dict[str, Any]] = {}
        self._completed_acks: dict[str, dict[str, Any]] = {}
        self._state_lock = threading.Lock()
        self._actuator_states: dict[str, dict[str, Any]] = {
            "FAN": {"state": "OFF", "status": "UNKNOWN"},
            "GROW_LIGHT": {"state": "OFF", "status": "UNKNOWN"},
        }
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
        self.client.on_message = self._on_message
        self.client.connect(args.mqtt_host, args.mqtt_port, 30)
        self.client.subscribe(f"agri/{args.farm_id}/{args.plot_id}/command", qos=1)
        self.client.loop_start()

    def apply_control_payload(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        if str(payload.get("deviceId") or "") != self.args.device_id:
            return None
        command_type = str(payload.get("type") or "").upper()
        actuator = ACTUATOR_COMMAND_TYPES.get(command_type)
        if actuator:
            target_state = str(payload.get("targetState") or "").upper()
            command_id = str(payload.get("commandId") or "").strip()
            duration_seconds = int(_number(payload.get("durationSeconds")) or 0)
            if (
                not command_id
                or target_state not in {"ON", "OFF"}
                or (target_state == "ON" and actuator == "FAN" and not 1 <= duration_seconds <= 3600)
                or (target_state == "ON" and actuator == "GROW_LIGHT" and not 0 <= duration_seconds <= 3600)
                or (target_state == "OFF" and duration_seconds != 0)
            ):
                return self._failed_actuator_ack(payload, actuator, "INVALID_COMMAND")
            with self._state_lock:
                completed = self._completed_acks.get(command_id)
                if completed is not None:
                    return dict(completed)
                if command_id in self._pending_commands:
                    return None
                self._pending_commands[command_id] = {
                    "payload": dict(payload),
                    "actuator": actuator,
                    "targetState": target_state,
                    "queuedAt": time.monotonic(),
                    "sentAt": None,
                }
                self._actuator_states[actuator] = {
                    **self._actuator_states.get(actuator, {}),
                    "desiredState": target_state,
                    "status": "PENDING",
                    "commandId": command_id,
                }
            try:
                self._serial_commands.put_nowait({
                    "commandId": command_id,
                    "actuator": actuator,
                    "targetState": target_state,
                    "durationSeconds": duration_seconds,
                })
            except queue.Full:
                with self._state_lock:
                    self._pending_commands.pop(command_id, None)
                return self._failed_actuator_ack(payload, actuator, "SERIAL_QUEUE_FULL")
            return None
        target = str(payload.get("targetStatus") or "").upper()
        if target not in {"ONLINE", "OFFLINE"}:
            return None
        self.offline = target == "OFFLINE"
        return {
            "ackId": f"ack-{uuid.uuid4().hex[:12]}",
            "commandId": payload.get("commandId"),
            "deviceId": self.args.device_id,
            "targetStatus": target,
            "status": "SUCCEEDED",
            "receivedAt": iso_now(),
            "result": "BEARPI_DEVICE_SWITCH",
            "sourceMode": "REAL",
            "dataOrigin": "HARDWARE",
            "provenance": "OBSERVED",
        }

    def _failed_actuator_ack(self, payload: dict[str, Any], actuator: str, reason: str) -> dict[str, Any]:
        return {
            "ackId": f"ack-{uuid.uuid4().hex[:12]}",
            "commandId": payload.get("commandId"),
            "deviceId": self.args.device_id,
            "actuator": actuator,
            "targetState": str(payload.get("targetState") or "").upper(),
            "status": "FAILED",
            "receivedAt": iso_now(),
            "reason": reason,
            "executionMode": "HARDWARE",
            "sourceMode": "REAL",
            "dataOrigin": "HARDWARE",
            "provenance": "OBSERVED",
        }

    def _publish_ack(self, ack: dict[str, Any]) -> None:
        if self.client is None:
            print(json.dumps(ack, ensure_ascii=False), flush=True)
            return
        topic = f"agri/{self.args.farm_id}/{self.args.plot_id}/command/ack"
        self.client.publish(topic, json.dumps(ack, ensure_ascii=False), qos=1)

    def _on_message(self, _client: Any, _userdata: Any, message: Any) -> None:
        try:
            payload = json.loads(message.payload.decode("utf-8"))
            ack = self.apply_control_payload(payload)
            if ack is None:
                return
            self._publish_ack(ack)
        except (ValueError, TypeError, UnicodeDecodeError):
            return

    def flush_serial_commands(self, device: Any) -> None:
        """Write queued commands from the MQTT callback on the serial owner thread."""
        while True:
            try:
                command = self._serial_commands.get_nowait()
            except queue.Empty:
                return
            actuator = "LIGHT" if command["actuator"] == "GROW_LIGHT" else command["actuator"]
            line = (
                f"AT+AGRI={command['commandId']},{actuator},{command['targetState']},"
                f"{command['durationSeconds']}\r\n"
            )
            try:
                device.write(line.encode("ascii"))
                device.flush()
                with self._state_lock:
                    pending = self._pending_commands.get(command["commandId"])
                    if pending is not None:
                        pending["sentAt"] = time.monotonic()
            except Exception as error:
                with self._state_lock:
                    pending = self._pending_commands.pop(command["commandId"], None)
                payload = pending.get("payload", {}) if pending else command
                self._publish_ack(self._failed_actuator_ack(payload, command["actuator"], f"SERIAL_WRITE_{type(error).__name__.upper()}"))

    def handle_serial_line(self, line: str) -> bool:
        """Consume firmware ACK/state lines; return whether the line was control data."""
        parsed = parse_actuator_ack(line)
        if parsed is not None:
            command_id = parsed["command_id"]
            with self._state_lock:
                pending = self._pending_commands.pop(command_id, None)
            if pending is None:
                return True
            actuator = pending["actuator"]
            target_state = pending["targetState"]
            status = parsed["status"]
            ack = {
                "ackId": f"ack-{uuid.uuid4().hex[:12]}",
                "commandId": command_id,
                "deviceId": self.args.device_id,
                "actuator": actuator,
                "targetState": target_state,
                "actualState": parsed["state"],
                "status": status,
                "receivedAt": iso_now(),
                "result": parsed["reason"] or "BEARPI_ACTUATOR_SWITCH",
                "executionMode": "HARDWARE",
                "sourceMode": "REAL",
                "dataOrigin": "HARDWARE",
                "provenance": "OBSERVED",
            }
            with self._state_lock:
                if status == "SUCCEEDED":
                    self._actuator_states[actuator] = {
                        "state": parsed["state"],
                        "desiredState": target_state,
                        "status": "SUCCEEDED",
                        "commandId": command_id,
                        "updatedAt": ack["receivedAt"],
                    }
                else:
                    self._actuator_states[actuator] = {
                        **self._actuator_states.get(actuator, {}),
                        "desiredState": target_state,
                        "status": "FAILED",
                        "commandId": command_id,
                        "updatedAt": ack["receivedAt"],
                        "error": ack["result"],
                    }
                self._completed_acks[command_id] = dict(ack)
                while len(self._completed_acks) > 32:
                    self._completed_acks.pop(next(iter(self._completed_acks)))
            self._publish_ack(ack)
            self.heartbeat(make_status(self.args, actuator_states=self.actuator_status()))
            return True

        state = parse_actuator_state(line)
        if state is None:
            return False
        now = iso_now()
        with self._state_lock:
            for actuator in ACTUATOR_TYPES:
                self._actuator_states[actuator] = {
                    **self._actuator_states.get(actuator, {}),
                    "state": state[actuator],
                    "desiredState": state[actuator],
                    "status": "SUCCEEDED",
                    "updatedAt": now,
                    "reason": state["reason"] or "FIRMWARE_STATE",
                }
        self.heartbeat(make_status(self.args, now, self.actuator_status()))
        return True

    def expire_serial_commands(self, timeout_seconds: float = 8.0) -> None:
        now = time.monotonic()
        expired: list[tuple[str, dict[str, Any]]] = []
        with self._state_lock:
            for command_id, pending in list(self._pending_commands.items()):
                started = pending.get("sentAt") or pending.get("queuedAt") or now
                if now - float(started) >= timeout_seconds:
                    expired.append((command_id, self._pending_commands.pop(command_id)))
        for command_id, pending in expired:
            payload = pending.get("payload", {})
            ack = self._failed_actuator_ack(payload, pending["actuator"], "FIRMWARE_ACK_TIMEOUT")
            ack["commandId"] = command_id
            ack["status"] = "TIMEOUT"
            with self._state_lock:
                self._actuator_states[pending["actuator"]] = {
                    **self._actuator_states.get(pending["actuator"], {}),
                    "status": "TIMEOUT",
                    "commandId": command_id,
                    "updatedAt": ack["receivedAt"],
                    "error": ack["reason"],
                }
            self._publish_ack(ack)

    def actuator_status(self) -> dict[str, Any]:
        with self._state_lock:
            return {key: dict(value) for key, value in self._actuator_states.items()}

    def send(self, event: dict[str, Any]) -> None:
        if self.offline:
            return
        topic = f"agri/{self.args.farm_id}/{self.args.plot_id}/telemetry"
        if self.client is None:
            print(json.dumps(event, ensure_ascii=False), flush=True)
            return
        info = self.client.publish(topic, json.dumps(event, ensure_ascii=False), qos=1)
        if info.rc != 0:
            raise RuntimeError(f"MQTT 发布失败，rc={info.rc}")

    def heartbeat(self, status: dict[str, Any]) -> None:
        if self.client is None or self.offline:
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
                with serial.Serial(args.port, args.baud, timeout=min(args.serial_timeout, 0.25), write_timeout=2) as device:
                    print(f"已连接 {args.port} @ {args.baud} 8N1", file=sys.stderr)
                    while True:
                        publisher.flush_serial_commands(device)
                        raw = device.readline()
                        if not raw:
                            publisher.expire_serial_commands()
                            now = time.monotonic()
                            if now - last_heartbeat >= 30:
                                publisher.heartbeat(make_status(args, actuator_states=publisher.actuator_status()))
                                last_heartbeat = now
                            continue
                        line = raw.decode("utf-8", errors="replace")
                        if publisher.handle_serial_line(line):
                            continue
                        samples = parse_line(line)
                        if not samples:
                            continue
                        ts = iso_now()
                        for metric, value, unit in samples:
                            publisher.send(make_event(metric, value, unit, args, ts))
                        publisher.heartbeat(make_status(args, ts, publisher.actuator_status()))
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
