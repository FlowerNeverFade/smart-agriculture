import json
import random
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

try:
    from .runner import (
        build_event,
        evolve_state,
        initial_state,
        irrigation_moisture_delta,
        load_plot_strategies,
        metric_value,
        scenario_parameters,
    )
except ImportError:  # Running this file directly from the repository root.
    from simulator.runner import (
        build_event,
        evolve_state,
        initial_state,
        irrigation_moisture_delta,
        load_plot_strategies,
        metric_value,
        scenario_parameters,
    )


class PlotSimulationTest(unittest.TestCase):
    def test_default_time_scale_is_ten_minutes_per_simulated_day(self):
        defaults = scenario_parameters("drought")
        legacy_realtime = scenario_parameters("drought", {"timeScale": 1})
        accelerated = scenario_parameters("drought", {"timeScale": 180})
        clamped = scenario_parameters("drought", {"timeScale": 999})
        self.assertEqual(defaults["timeScale"], 144.0)
        self.assertEqual(legacy_realtime["timeScale"], 144.0)
        self.assertEqual(accelerated["timeScale"], 180.0)
        self.assertEqual(clamped["timeScale"], 288.0)

    def test_plot_configuration_is_independent_and_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plot-simulation.json"
            path.write_text(json.dumps({
                "schemaVersion": "plot-simulation-1.0",
                "plots": {
                    "plot-a01": {"scenario": "drought", "revision": 3,
                                  "parameters": {"volatility": 9, "soilMoistureTrendPerHour": -99}},
                    "plot-a02": {"scenario": "heavy-rain", "parameters": {"rainfallRate": 48}},
                },
            }), encoding="utf-8")
            strategies = load_plot_strategies(path)
        self.assertEqual(strategies["plot-a01"]["scenario"], "drought")
        self.assertEqual(strategies["plot-a02"]["scenario"], "heavy-rain")
        self.assertEqual(strategies["plot-a01"]["parameters"]["volatility"], 3.0)
        self.assertEqual(strategies["plot-a01"]["parameters"]["soilMoistureTrendPerHour"], -12.0)
        self.assertNotEqual(strategies["plot-a01"]["scenario"], strategies["plot-a02"]["scenario"])

    def test_scenarios_are_visible_but_values_remain_physical(self):
        ts = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)
        drought_state = initial_state("plot-a01", random.Random(7))
        rain_state = initial_state("plot-a02", random.Random(7))
        drought_rng = random.Random(11)
        rain_rng = random.Random(11)
        for index in range(8):
            evolve_state(drought_state, drought_rng, "drought", ts, index, None, 20)
            evolve_state(rain_state, rain_rng, "heavy-rain", ts, index, None, 20)
        self.assertLess(drought_state["soil"], 35)
        self.assertGreater(rain_state["soil"], 35)
        self.assertGreater(drought_state["temperature"], rain_state["temperature"])
        self.assertLess(drought_state["humidity"], rain_state["humidity"])
        for state in (drought_state, rain_state):
            self.assertGreaterEqual(state["soil"], 4)
            self.assertLessEqual(state["soil"], 92)
            self.assertGreaterEqual(state["humidity"], 10)
            self.assertLessEqual(state["humidity"], 99.5)

    def test_values_have_bounded_random_variation_and_quality_signals(self):
        rng = random.Random(21)
        state = initial_state("plot-a01", rng)
        values = []
        ts = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)
        for index in range(6):
            evolve_state(state, rng, "normal", ts, index, None, 20)
            values.append(metric_value(state, rng, "normal", "SOIL_MOISTURE", ts, index, None, 20))
        self.assertGreater(max(values) - min(values), 0.05)
        self.assertTrue(all(4 <= value <= 92 for value in values))
        drift = build_event(random.Random(1), "sensor-drift", "drift", "MAIN", "plot-a01", "PH", "pH", 4, ts)
        self.assertIn(drift["quality"]["status"], {"BAD", "DEGRADED"})

    def test_one_simulated_day_follows_daily_soil_rates(self):
        ts = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)
        drought = initial_state("plot-a01", random.Random(3))
        rain = initial_state("plot-a02", random.Random(3))
        start_drought = drought["soil"]
        start_rain = rain["soil"]
        drought_rng = random.Random(5)
        rain_rng = random.Random(5)
        for index in range(30):
            evolve_state(drought, drought_rng, "drought", ts, index, None, 20)
            evolve_state(rain, rain_rng, "heavy-rain", ts, index, None, 20)
        self.assertLess(drought["soil"], start_drought - 4)
        self.assertGreater(drought["soil"], start_drought - 20)
        self.assertGreater(rain["soil"], start_rain + 6)
        self.assertLess(rain["soil"], start_rain + 25)

    def test_irrigation_moisture_follows_plan_water_and_area(self):
        self.assertAlmostEqual(irrigation_moisture_delta(51.2, 80), 8.0)
        self.assertAlmostEqual(irrigation_moisture_delta(64.0, 100), 8.0)
        self.assertEqual(irrigation_moisture_delta(0, 80), 0.0)


if __name__ == "__main__":
    unittest.main()
