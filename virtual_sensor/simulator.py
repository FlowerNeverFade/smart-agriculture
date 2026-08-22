"""Live virtual-sensor loop: telemetry, heartbeat, irrigation commands."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .config import build_devices, topic
from .device import VirtualDevice
from .mqtt_bridge import MqttBridge

logger = logging.getLogger(__name__)


class SensorSimulator:
    def __init__(self, config: dict[str, Any], use_mqtt: bool = True) -> None:
        self.config = config
        self.use_mqtt = use_mqtt
        self.devices = build_devices(config)
        sim = config.get("simulation") or {}
        self.interval = float(sim.get("interval_seconds", 5))
        self.heartbeat_every = float(sim.get("heartbeat_seconds", 30))
        self.time_scale = float(sim.get("time_scale", 1.0))
        self.tz = ZoneInfo(sim.get("timezone", "Asia/Shanghai"))
        self.topics = (config.get("mqtt") or {}).get("topics") or {}
        self._by_id = {device.device_id: device for device in self.devices}
        self._mqtt: MqttBridge | None = None
        self._sim_now = datetime.now(self.tz)

    def start_mqtt(self) -> None:
        mqtt_cfg = self.config.get("mqtt") or {}
        self._mqtt = MqttBridge(
            host=mqtt_cfg.get("host", "127.0.0.1"),
            port=int(mqtt_cfg.get("port", 1883)),
            client_id="agri-virtual-sensors",
            username=mqtt_cfg.get("username") or "",
            password=mqtt_cfg.get("password") or "",
            keepalive=int(mqtt_cfg.get("keepalive", 60)),
            on_command=self._on_command,
        )
        self._mqtt.connect()
        deadline = time.time() + 5
        while time.time() < deadline and not self._mqtt.connected:
            time.sleep(0.05)
        if not self._mqtt.connected:
            raise ConnectionError("MQTT broker not reachable")
        command_tpl = self.topics.get("command", "agri/{device_id}/command")
        for device in self.devices:
            self._mqtt.subscribe(topic(command_tpl, device.device_id))

    def stop_mqtt(self) -> None:
        if self._mqtt is not None:
            self._mqtt.disconnect()
            self._mqtt = None

    def emit_once(
        self, dt_seconds: float | None = None, publish: bool = True
    ) -> list[dict[str, Any]]:
        dt = self.interval if dt_seconds is None else dt_seconds
        payloads = [device.step(self._sim_now, dt) for device in self.devices]
        if publish:
            self._publish_many("telemetry", payloads)
        return payloads

    def emit_heartbeat(self) -> list[dict[str, Any]]:
        payloads = [device.heartbeat_payload(self._sim_now) for device in self.devices]
        self._publish_many("heartbeat", payloads, retain=True)
        return payloads

    def run_forever(self) -> None:
        logger.info(
            "virtual sensors running: %s (interval=%ss, time_scale=%s)",
            ", ".join(device.device_id for device in self.devices),
            self.interval,
            self.time_scale,
        )
        last_heartbeat = 0.0
        while True:
            wall_start = time.monotonic()
            self.emit_once()
            if wall_start - last_heartbeat >= self.heartbeat_every:
                self.emit_heartbeat()
                last_heartbeat = wall_start
            elapsed = time.monotonic() - wall_start
            time.sleep(max(0.0, self.interval - elapsed))
            self._sim_now += timedelta(seconds=self.interval * self.time_scale)

    def _on_command(self, mqtt_topic: str, command: dict[str, Any]) -> None:
        device_id = command.get("device_id")
        if not device_id:
            device_id = mqtt_topic.rstrip("/").split("/")[-2] if "/command" in mqtt_topic else ""
        device = self._by_id.get(str(device_id))
        if device is None:
            logger.warning("command for unknown device on %s: %s", mqtt_topic, command)
            return
        ack = device.handle_command(command)
        logger.info("command %s -> %s", device.device_id, ack)
        status = device.status_payload(datetime.now(self.tz), message=ack["message"])
        status["result"] = ack["result"]
        self._publish("status", device, status)

    def _publish_many(
        self, kind: str, payloads: list[dict[str, Any]], retain: bool = False
    ) -> None:
        for payload in payloads:
            device = self._by_id[payload["device_id"]]
            self._publish(kind, device, payload, retain=retain)

    def _publish(
        self,
        kind: str,
        device: VirtualDevice,
        payload: dict[str, Any],
        retain: bool = False,
    ) -> None:
        line = json.dumps(payload, ensure_ascii=False)
        default_tpl = f"agri/{{device_id}}/{kind}"
        mqtt_topic = topic(self.topics.get(kind, default_tpl), device.device_id)
        if self._mqtt is not None and self._mqtt.connected:
            self._mqtt.publish(mqtt_topic, payload, retain=retain)
        else:
            print(f"{mqtt_topic} {line}", flush=True)
