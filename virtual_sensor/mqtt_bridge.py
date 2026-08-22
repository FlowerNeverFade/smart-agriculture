"""MQTT publish / subscribe bridge for virtual sensors."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


class MqttBridge:
    def __init__(
        self,
        host: str,
        port: int,
        client_id: str,
        username: str = "",
        password: str = "",
        keepalive: int = 60,
        on_command: Callable[[str, dict[str, Any]], None] | None = None,
    ) -> None:
        self.host = host
        self.port = port
        self.keepalive = keepalive
        self.on_command = on_command
        self.connected = False
        self._client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=client_id,
            protocol=mqtt.MQTTv311,
        )
        if username:
            self._client.username_pw_set(username, password or None)
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message

    def connect(self) -> None:
        self._client.connect(self.host, self.port, keepalive=self.keepalive)
        self._client.loop_start()

    def disconnect(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()
        self.connected = False

    def subscribe(self, topic: str) -> None:
        self._client.subscribe(topic, qos=1)

    def publish(self, topic: str, payload: dict[str, Any], retain: bool = False) -> None:
        body = json.dumps(payload, ensure_ascii=False)
        self._client.publish(topic, body, qos=1, retain=retain)
        logger.debug("pub %s %s", topic, body)

    def _on_connect(self, client, userdata, flags, reason_code, properties) -> None:  # noqa: ANN001
        self.connected = reason_code == 0
        if self.connected:
            logger.info("MQTT connected to %s:%s", self.host, self.port)
        else:
            logger.error("MQTT connect failed: %s", reason_code)

    def _on_disconnect(self, client, userdata, flags, reason_code, properties) -> None:  # noqa: ANN001
        self.connected = False
        logger.warning("MQTT disconnected: %s", reason_code)

    def _on_message(self, client, userdata, message) -> None:  # noqa: ANN001
        if self.on_command is None:
            return
        try:
            payload = json.loads(message.payload.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            logger.warning("invalid JSON on %s: %s", message.topic, message.payload)
            return
        if not isinstance(payload, dict):
            logger.warning("command payload must be an object: %s", message.topic)
            return
        self.on_command(message.topic, payload)
