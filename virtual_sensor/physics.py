"""Simple greenhouse / open-field microclimate and soil-moisture model."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from datetime import datetime


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


@dataclass
class SensorReading:
    soil_moisture: float
    soil_temperature: float
    air_temperature: float
    air_humidity: float
    light_lux: float
    raining: bool


class FieldPhysics:
    """Generate plausible agricultural readings from a lightweight physical model."""

    def __init__(
        self,
        kind: str = "greenhouse",
        soil_moisture: float = 45.0,
        air_temperature: float = 24.0,
        rng: random.Random | None = None,
    ) -> None:
        self.kind = kind
        self.soil_moisture = soil_moisture
        self.air_temperature = air_temperature
        self.soil_temperature = air_temperature - 1.5
        self.air_humidity = 65.0
        self.light_lux = 0.0
        self.raining = False
        self.irrigation_on = False
        self._rain_minutes_left = 0.0
        self._rng = rng or random.Random()

        if kind == "field":
            self._temp_mean = 22.0
            self._temp_amp = 8.5
            self._night_floor = 12.0
        else:
            self._temp_mean = 24.0
            self._temp_amp = 5.0
            self._night_floor = 16.0

    def step(self, now: datetime, dt_seconds: float) -> SensorReading:
        hour = now.hour + now.minute / 60.0 + now.second / 3600.0
        dt_min = dt_seconds / 60.0

        self._update_weather(dt_min)
        self._update_light(hour)
        self._update_temperature(hour, dt_min)
        self._update_humidity()
        self._update_soil_moisture(dt_min)

        return SensorReading(
            soil_moisture=round(self.soil_moisture, 2),
            soil_temperature=round(self.soil_temperature, 2),
            air_temperature=round(self.air_temperature, 2),
            air_humidity=round(self.air_humidity, 2),
            light_lux=round(self.light_lux, 1),
            raining=self.raining,
        )

    def _update_weather(self, dt_min: float) -> None:
        if self.kind != "field":
            self.raining = False
            return
        if self._rain_minutes_left > 0:
            self._rain_minutes_left -= dt_min
            self.raining = self._rain_minutes_left > 0
            return
        # Roughly one short shower every few simulated days.
        if self._rng.random() < 0.0008 * dt_min:
            self._rain_minutes_left = self._rng.uniform(20.0, 90.0)
            self.raining = True
        else:
            self.raining = False

    def _update_light(self, hour: float) -> None:
        sunrise, sunset = 6.0, 18.5
        if sunrise <= hour <= sunset:
            phase = (hour - sunrise) / (sunset - sunrise)
            solar = math.sin(phase * math.pi)
            peak = 85000.0 if self.kind == "field" else 42000.0
            if self.raining:
                solar *= 0.35
            self.light_lux = max(0.0, peak * solar + self._rng.gauss(0.0, 400.0))
        else:
            self.light_lux = max(0.0, self._rng.uniform(0.0, 15.0))

    def _update_temperature(self, hour: float, dt_min: float) -> None:
        # Daily air-temperature cycle, peak around 14:00.
        phase = 2.0 * math.pi * (hour - 14.0) / 24.0
        target = self._temp_mean + self._temp_amp * math.cos(phase)
        if self.raining:
            target -= 2.5
        if self.kind == "greenhouse" and hour < 6.0:
            target = max(target, self._night_floor)
        self.air_temperature += (target - self.air_temperature) * min(1.0, 0.15 * dt_min)
        self.air_temperature += self._rng.gauss(0.0, 0.08)

        soil_target = self.air_temperature - 1.2
        self.soil_temperature += (soil_target - self.soil_temperature) * min(1.0, 0.04 * dt_min)
        self.soil_temperature += self._rng.gauss(0.0, 0.03)

    def _update_humidity(self) -> None:
        # Higher humidity at night / when raining; lower when hot and bright.
        base = 88.0 - (self.air_temperature - 12.0) * 1.6
        if self.light_lux > 10000:
            base -= 8.0
        if self.raining:
            base += 12.0
        if self.kind == "greenhouse":
            base += 4.0
        self.air_humidity = _clamp(base + self._rng.gauss(0.0, 1.2), 35.0, 98.0)

    def _update_soil_moisture(self, dt_min: float) -> None:
        radiation = self.light_lux / 80000.0
        vapor_deficit = max(0.0, (100.0 - self.air_humidity) / 100.0)
        et = 0.035 * max(0.0, self.air_temperature - 8.0) * (0.3 + radiation) * vapor_deficit
        dry = et * dt_min
        if self.kind == "field":
            dry *= 1.15

        self.soil_moisture -= dry
        if self.irrigation_on:
            self.soil_moisture += 0.18 * dt_min
        if self.raining:
            self.soil_moisture += 0.12 * dt_min

        self.soil_moisture = _clamp(self.soil_moisture + self._rng.gauss(0.0, 0.02), 8.0, 95.0)
