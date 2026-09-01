package com.agriloop;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class ScenarioRunReproTest {
    @Autowired AgriEngine engine;
    @Autowired AgriStore store;

    @Test
    void switchingPlotScenarioCreatesRunHistory() {
        UserPrincipal admin = new UserPrincipal("user-admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("plot-a01"));
        String plotId = "plot-switch-run-" + System.nanoTime();
        store.save("plot", plotId, new java.util.LinkedHashMap<>(Map.of(
                "plotId", plotId, "farmId", "farm-demo", "name", "切换测试地", "cropCode", "tomato")));
        try {
            long before = store.list("scenario-run").size();
            // 1. 切换到干旱场景
            engine.updatePlotSimulation(plotId, Map.of("scenario", "DROUGHT"), admin);
            List<Map<String, Object>> runs1 = store.list("scenario-run");
            Map<String, Object> current1 = runs1.stream().filter(r -> plotId.equals(r.get("plotId"))).findFirst().orElse(null);
            assertThat(current1).isNotNull();
            assertThat(current1.get("status")).isEqualTo("RUNNING");
            assertThat(current1.get("scenario")).isEqualTo("drought");
            // 2. 再切换到heavy rain：旧 run 应 COMPLETED（有 endedAt），新 run RUNNING
            engine.updatePlotSimulation(plotId, Map.of("scenario", "HEAVY_RAIN"), admin);
            List<Map<String, Object>> runs2 = store.list("scenario-run").stream().filter(r -> plotId.equals(r.get("plotId"))).toList();
            assertThat(runs2).hasSize(2);
            long running = runs2.stream().filter(r -> "RUNNING".equals(r.get("status"))).count();
            long completed = runs2.stream().filter(r -> "COMPLETED".equals(r.get("status")) && r.get("endedAt") != null).count();
            assertThat(running).isEqualTo(1);
            assertThat(completed).isEqualTo(1);
            assertThat(before).isLessThan(store.list("scenario-run").size());
        } finally {
            for (Map<String, Object> r : store.list("scenario-run")) {
                if (plotId.equals(r.get("plotId"))) store.delete("scenario-run", String.valueOf(r.get("runId")));
            }
            store.delete("plot", plotId);
        }
    }
}
