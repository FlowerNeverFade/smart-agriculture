"""Virtual farm device: physics + irrigation + MQTT payload shaping."""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .physics import FieldPhysics, SensorReading


@dataclass
class AutoIrrigation:
    enabled: bool = False
    moisture_min: float = 30.0
    moisture_max: float = 55.0


class VirtualDevice:
    def __init__(
        self,
        device_id: str,
        plot_id: str,
        plot_name: str,
        crop: str,
        kind: str,
        initial: dict[str, float] | None = None,
        auto_irrigation: AutoIrrigation | None = None,
    ) -> None:
        initial = initial or {}
        self.device_id = device_id
        self.plot_id = plot_id
        self.plot_name = plot_name
        self.crop = crop
        self.kind = kind
        self.auto_irrigation = auto_irrigation or AutoIrrigation()
        self.started_at = datetime.now(timezone.utc)
        self.irrigation_on = False
        self.online = True
        self.rssi_dbm = -62
        self._physics = FieldPhysics(
            kind=kind,
            soil_moisture=float(initial.get("soil_moisture", 45.0)),
            air_temperature=float(initial.get("temperature", 24.0)),
        )
        self.last_reading: SensorReading | None = None

    def step(self, now: datetime, dt_seconds: float) -> dict[str, Any]:
        self._apply_auto_irrigation()
        self._physics.irrigation_on = self.irrigation_on
        reading = self._physics.step(now, dt_seconds)
        self.last_reading = reading
        self.rssi_dbm = max(-90, min(-40, self.rssi_dbm + int(random.gauss(0, 1))))
        return self.telemetry_payload(now, reading)

    def _apply_auto_irrigation(self) -> None:
        if not self.auto_irrigation.enabled or self.last_reading is None:
            return
        moisture = self.last_reading.soil_moisture
        if moisture < self.auto_irrigation.moisture_min:
            self.irrigation_on = True
        elif moisture > self.auto_irrigation.moisture_max:
            self.irrigation_on = False

    def handle_command(self, command: dict[str, Any]) -> dict[str, Any]:
        action = str(command.get("action", "")).lower()
        if action in {"irrigation", "irrigation_on", "irrigation_off"}:
            if action == "irrigation_on":
                self.irrigation_on = True
            elif action == "irrigation_off":
                self.irrigation_on = False
            else:
                state = command.get("state", command.get("on"))
                if isinstance(state, bool):
                    self.irrigation_on = state
                elif str(state).lower() in {"on", "open", "1", "true"}:
                    self.irrigation_on = True
                elif str(state).lower() in {"off", "close", "0", "false"}:
                    self.irrigation_on = False
                else:
                    return self._ack("error", f"unknown irrigation state: {state}")
            self.auto_irrigation.enabled = False
            return self._ack("ok", "irrigation updated")
        if action == "auto_irrigation":
            enabled = bool(command.get("enabled", True))
            self.auto_irrigation.enabled = enabled
            if "moisture_min" in command:
                self.auto_irrigation.moisture_min = float(command["moisture_min"])
            if "moisture_max" in command:
                self.auto_irrigation.moisture_max = float(command["moisture_max"])
            return self._ack("ok", "auto irrigation updated")
        return self._ack("error", f"unknown action: {action}")

    def telemetry_payload(self, now: datetime, reading: SensorReading) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "plot_id": self.plot_id,
            "plot_name": self.plot_name,
            "crop": self.crop,
            "kind": self.kind,
            "timestamp": now.isoformat(timespec="seconds"),
            "online": self.online,
            "irrigation": "on" if self.irrigation_on else "off",
            "sensors": {
                "soil_moisture": reading.soil_moisture,
                "soil_temperature": reading.soil_temperature,
                "temperature": reading.air_temperature,
                "air_humidity": reading.air_humidity,
                "light_lux": reading.light_lux,
            },
            "weather": {"raining": reading.raining},
        }

    def heartbeat_payload(self, now: datetime) -> dict[str, Any]:
        uptime = int((now.astimezone(timezone.utc) - self.started_at).total_seconds())
        return {
            "device_id": self.device_id,
            "plot_id": self.plot_id,
            "status": "online" if self.online else "offline",
            "timestamp": now.isoformat(timespec="seconds"),
            "uptime_s": max(0, uptime),
            "rssi_dbm": self.rssi_dbm,
            "irrigation": "on" if self.irrigation_on else "off",
        }

    def status_payload(self, now: datetime, message: str = "") -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "timestamp": now.isoformat(timespec="seconds"),
            "irrigation": "on" if self.irrigation_on else "off",
            "message": message,
        }

    def _ack(self, result: str, message: str) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "result": result,
            "message": message,
            "irrigation": "on" if self.irrigation_on else "off",
        }
