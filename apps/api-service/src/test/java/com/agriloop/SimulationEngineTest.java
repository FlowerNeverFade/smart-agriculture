package com.agriloop;

import org.junit.jupiter.api.Test;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Map;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;

class SimulationEngineTest {
    @Test
    void defaultTimeScaleIs144AndLegacyRealtimeIsTreatedAsUnset() {
        assertThat(SimulationEngine.scenarioParameters("drought", null).get("timeScale")).isEqualTo(144.0);
        assertThat(SimulationEngine.scenarioParameters("drought", Map.of("timeScale", 1.0)).get("timeScale")).isEqualTo(144.0);
        assertThat(SimulationEngine.scenarioParameters("drought", Map.of("timeScale", 180.0)).get("timeScale")).isEqualTo(180.0);
        assertThat(SimulationEngine.scenarioParameters("drought", Map.of("timeScale", 999.0)).get("timeScale")).isEqualTo(288.0);
    }

    @Test
    void irrigationMoistureFollowsPlanWaterAndArea() {
        assertThat(SimulationEngine.irrigationMoistureDelta(51.2, 80)).isEqualTo(8.0);
        assertThat(SimulationEngine.irrigationMoistureDelta(64.0, 100)).isEqualTo(8.0);
        assertThat(SimulationEngine.irrigationMoistureDelta(0, 80)).isEqualTo(0.0);
    }

    @Test
    void oneSimulatedDayFollowsDailySoilRates() {
        ZonedDateTime ts = ZonedDateTime.of(2026, 8, 26, 12, 0, 0, 0, ZoneOffset.UTC);
        SimulationEngine.PlotState drought = SimulationEngine.initialState("plot-a01", new Random(3));
        SimulationEngine.PlotState rain = SimulationEngine.initialState("plot-a02", new Random(3));
        double startDrought = drought.soil;
        double startRain = rain.soil;
        Random droughtRng = new Random(5);
        Random rainRng = new Random(5);
        for (int index = 0; index < 30; index++) {
            SimulationEngine.evolveState(drought, droughtRng, "drought", ts, index, null, 20);
            SimulationEngine.evolveState(rain, rainRng, "heavy-rain", ts, index, null, 20);
        }
        assertThat(drought.soil).isLessThan(startDrought - 4).isGreaterThan(startDrought - 20);
        assertThat(rain.soil).isGreaterThan(startRain + 6).isLessThan(startRain + 25);
    }
}
