package com.agriloop;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.util.LinkedHashMap;
import java.util.Map;

/** Admin-only proxy for the in-process telemetry {@link SimulationEngine}. */
@Component
class SimulatorControl {
    private final AgriProperties properties;
    private final SimulationEngine engine;

    SimulatorControl(AgriProperties properties, SimulationEngine engine) {
        this.properties = properties;
        this.engine = engine;
    }

    Map<String, Object> status() {
        if (!properties.isSimulatorControlEnabled()) return unavailable("SIMULATOR_CONTROL_DISABLED");
        if (engine == null) return unavailable("SIMULATION_ENGINE_NOT_READY");
        return engine.status();
    }

    Map<String, Object> start() { return requireEngine().start(); }
    Map<String, Object> stop() { return requireEngine().stop(); }
    Map<String, Object> updateSettings(Map<String, Object> body) { return requireEngine().updateSettings(body); }

    private SimulationEngine requireEngine() {
        if (!properties.isSimulatorControlEnabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SIMULATOR_CONTROL_DISABLED", "服务器未启用模拟器控制");
        }
        if (engine == null) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SIMULATION_ENGINE_NOT_READY", "进程内模拟器尚未就绪");
        }
        return engine;
    }

    private Map<String, Object> unavailable(String reason) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("available", false);
        response.put("status", "UNAVAILABLE");
        response.put("reason", reason);
        response.put("program", "in-process");
        response.put("pid", "api");
        return response;
    }
}
