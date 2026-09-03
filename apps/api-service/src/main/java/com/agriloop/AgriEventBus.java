package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
class AgriEventBus {
    private final ObjectMapper mapper;
    private final AgriStore store;
    private record ScopedEmitter(SseEmitter emitter, UserPrincipal principal) { }
    private final List<ScopedEmitter> emitters = new CopyOnWriteArrayList<>();
    private final ExecutorService executor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "agriloop-sse"); t.setDaemon(true); return t;
    });

    AgriEventBus(ObjectMapper mapper, AgriStore store) { this.mapper = mapper; this.store = store; }

    SseEmitter subscribe(UserPrincipal principal) {
        SseEmitter emitter = new SseEmitter(0L);
        ScopedEmitter subscription = new ScopedEmitter(emitter, principal);
        emitters.add(subscription);
        Runnable remove = () -> emitters.remove(subscription);
        emitter.onCompletion(remove); emitter.onTimeout(remove); emitter.onError(e -> remove.run());
        try { emitter.send(SseEmitter.event().name("connected").data(Map.of("connectedAt", Instant.now().toString()))); }
        catch (IOException e) { remove.run(); }
        return emitter;
    }

    boolean canReceive(UserPrincipal principal, Map<String, Object> payload) {
        return canReceive(principal, "", payload);
    }

    private boolean canReceive(UserPrincipal principal, String eventType, Map<String, Object> payload) {
        if (principal == null) return false;
        if (principal.isSystemAdmin()) return true;
        if (Jsons.bool(payload, "systemAdminOnly", false)) return false;
        String farmId = Jsons.text(payload, "farmId", Jsons.text(payload, "scope", "")).trim();
        String plotId = Jsons.text(payload, "plotId", "").trim();
        if (!farmId.isBlank() && !principal.canAccessFarm(farmId)) return false;
        if (!plotId.isBlank() && !canReceivePlot(principal, farmId, plotId)) return false;
        if (principal.isFarmer() && "inspection.created".equals(eventType)) {
            return principal.userId.equals(Jsons.text(payload, "operatorId", ""))
                    || principal.userId.equals(Jsons.text(payload, "assignedFarmerId", ""));
        }
        if (principal.isFarmer() && eventType.startsWith("workorder.")
                && "READINESS".equalsIgnoreCase(Jsons.text(payload, "sourceType", ""))) {
            return principal.userId.equals(Jsons.text(payload, "createdBy", ""))
                    || principal.userId.equals(Jsons.text(payload, "assigneeId", ""));
        }
        if (principal.isFarmer() && !Jsons.text(payload, "resourceRequestId", "").isBlank()) {
            return principal.userId.equals(Jsons.text(payload, "requestedBy", ""))
                    || principal.userId.equals(Jsons.text(payload, "assignedFarmerId", ""));
        }
        if (principal.isFarmer() && payload.get("allocations") instanceof Collection<?>) {
            return Jsons.maps(mapper, payload.get("allocations")).stream()
                    .anyMatch(allocation -> principal.canAccessPlot(Jsons.text(allocation, "plotId", "")));
        }
        // Unscoped platform events are intentionally withheld from farmers.
        // Their REST refresh remains the recovery path for secondary state.
        return !farmId.isBlank() || !plotId.isBlank() || principal.isFarmAdmin();
    }

    private boolean canReceivePlot(UserPrincipal principal, String payloadFarmId, String plotId) {
        if (!principal.isFarmAdmin()) return principal.canAccessPlot(plotId);
        String farmId = payloadFarmId;
        if (farmId == null || farmId.isBlank()) {
            Map<String, Object> plot = store.find("plot", plotId);
            farmId = Jsons.text(plot == null ? Map.of() : plot, "farmId", "");
        }
        return !farmId.isBlank() && principal.canAccessFarm(farmId);
    }

    private Map<String, Object> scopedPayload(UserPrincipal principal, Map<String, Object> payload) {
        Map<String, Object> copy = Jsons.copy(mapper, payload);
        if (!principal.isFarmer() || !(copy.get("allocations") instanceof Collection<?>)) return copy;
        List<Map<String, Object>> allocations = Jsons.maps(mapper, copy.get("allocations")).stream()
                .filter(allocation -> principal.canAccessPlot(Jsons.text(allocation, "plotId", ""))).toList();
        copy.put("allocations", allocations);
        copy.put("totalRequestedLitres", allocations.stream().mapToDouble(allocation -> Jsons.number(allocation, "requestedLitres", 0)).sum());
        copy.put("totalAllocatedLitres", allocations.stream().mapToDouble(allocation -> Jsons.number(allocation, "allocatedLitres", 0)).sum());
        copy.put("totalUnmetLitres", allocations.stream().mapToDouble(allocation -> Jsons.number(allocation, "unmetLitres", 0)).sum());
        return copy;
    }

    void publish(String type, Map<String, Object> payload) {
        String eventId = Jsons.id("evt"); String timestamp = Instant.now().toString();
        for (ScopedEmitter subscription : emitters) {
            if (!canReceive(subscription.principal(), type, payload)) continue;
            Map<String, Object> event = new LinkedHashMap<>(); event.put("eventType", type); event.put("eventId", eventId); event.put("ts", timestamp);
            event.put("payload", scopedPayload(subscription.principal(), payload));
            executor.submit(() -> {
                try { subscription.emitter().send(SseEmitter.event().name(type).id(Jsons.text(event, "eventId", "")).data(event)); }
                catch (Exception e) { emitters.remove(subscription); }
            });
        }
    }

    @Scheduled(fixedDelayString = "${agriloop.sse-heartbeat-seconds:15}000")
    void heartbeat() {
        for (ScopedEmitter subscription : emitters) {
            try { subscription.emitter().send(SseEmitter.event().name("heartbeat").data(Map.of("ts", Instant.now().toString()))); }
            catch (Exception e) { emitters.remove(subscription); }
        }
    }
}
