package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
class LightBoostPersistenceTest {
    @Autowired AgriEngine engine;
    @Autowired SimulationEngine simulationEngine;

    @Test
    void boostStateSurvivesTicksAndLiftsLightTelemetry() {
        simulationEngine.applyLighting("plot-a01", 6000, 8 * 3600L);
        SimulationEngine.PlotState before = simulationEngine.plotState("plot-a01");
        assertThat(before.activeLightBoost).isEqualTo(6000.0);
        assertThat(before.lightBoostUntil).isAfter(Instant.now());

        for (int i = 0; i < 3; i++) {
            simulationEngine.tickOnce();
            SimulationEngine.PlotState state = simulationEngine.plotState("plot-a01");
            assertThat(state.activeLightBoost).as("tick %d boost", i).isEqualTo(6000.0);
            assertThat(state.lightBoostUntil).as("tick %d until", i).isAfter(Instant.now());
            Map<String, Object> light = lightReading();
            double value = Jsons.number(light, "value", -1);
            assertThat(value).as("tick %d light value", i).isGreaterThanOrEqualTo(5000.0);
            assertThat(Jsons.text(light, "ts", "")).as("tick %d light ts", i).isNotBlank();
        }
    }

    @Test
    void boostSurvivesSimulationConfigChangeThatRebuildsPlotState() {
        simulationEngine.applyLighting("plot-a01", 6000, 8 * 3600L);
        simulationEngine.updateSettings(Map.of("timeScale", 200.0));
        simulationEngine.tickOnce();
        SimulationEngine.PlotState state = simulationEngine.plotState("plot-a01");
        assertThat(state.activeLightBoost).as("boost after config change").isEqualTo(6000.0);
        assertThat(state.lightBoostUntil).as("until after config change").isAfter(Instant.now());
    }

    private Map<String, Object> lightReading() {
        Map<String, Object> latest = engine.latestMetrics("plot-a01");
        return latest.get("LIGHT") instanceof Map<?, ?> v ? Jsons.map(new ObjectMapper(), v) : Map.of();
    }
}
