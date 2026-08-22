"""Load YAML config and interpolate MQTT topic templates."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .device import AutoIrrigation, VirtualDevice


def load_config(path: str | Path) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError("config root must be a mapping")
    return data


def topic(template: str, device_id: str) -> str:
    return template.format(device_id=device_id)


def build_devices(config: dict[str, Any]) -> list[VirtualDevice]:
    devices: list[VirtualDevice] = []
    for item in config.get("devices", []):
        auto = item.get("auto_irrigation") or {}
        devices.append(
            VirtualDevice(
                device_id=item["device_id"],
                plot_id=item.get("plot_id", item["device_id"]),
                plot_name=item.get("plot_name", item["device_id"]),
                crop=item.get("crop", ""),
                kind=item.get("kind", "greenhouse"),
                initial=item.get("initial") or {},
                auto_irrigation=AutoIrrigation(
                    enabled=bool(auto.get("enabled", False)),
                    moisture_min=float(auto.get("moisture_min", 30.0)),
                    moisture_max=float(auto.get("moisture_max", 55.0)),
                ),
            )
        )
    if not devices:
        raise ValueError("config.devices is empty")
    return devices
