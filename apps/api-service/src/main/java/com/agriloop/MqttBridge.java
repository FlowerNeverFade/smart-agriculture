package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
class MqttBridge {
    private final AgriProperties properties;
    private final AgriEngine engine;
    private final AgriStore store;
    private final AtomicBoolean connected = new AtomicBoolean(false);
    private volatile org.eclipse.paho.client.mqttv3.MqttClient client;

    MqttBridge(AgriProperties properties, AgriEngine engine, AgriStore store) { this.properties = properties; this.engine = engine; this.store = store; }

    @PostConstruct
    void start() {
        if (!"simulation".equalsIgnoreCase(properties.getMode())) return;
        CompletableFuture.runAsync(() -> {
            try {
                client = new org.eclipse.paho.client.mqttv3.MqttClient(properties.getMqttUrl(), properties.getMqttClientId() + "-" + UUID.randomUUID());
                org.eclipse.paho.client.mqttv3.MqttConnectOptions options = new org.eclipse.paho.client.mqttv3.MqttConnectOptions(); options.setAutomaticReconnect(true); options.setCleanSession(false);
                if (StringUtils.hasText(properties.getMqttUsername())) { options.setUserName(properties.getMqttUsername()); options.setPassword(properties.getMqttPassword().toCharArray()); }
                client.setCallback(new org.eclipse.paho.client.mqttv3.MqttCallback() {
                    public void connectionLost(Throwable cause) { connected.set(false); }
                    public void messageArrived(String topic, org.eclipse.paho.client.mqttv3.MqttMessage message) {
                        try {
                            Map<String, Object> body = new ObjectMapper().readValue(message.getPayload(), Map.class);
                            if (topic.endsWith("/telemetry")) engine.ingest(body);
                            else if (topic.endsWith("/device/status")) engine.ingestDeviceStatus(body);
                            else if (topic.endsWith("/command/ack")) {
                                String commandId = Jsons.text(body, "commandId", "");
                                if (!commandId.isBlank()) {
                                    Map<String, Object> c = store.find("command", commandId);
                                    if (c != null && c.get("ack") == null) {
                                        if ("DEVICE_STATUS_SET".equals(Jsons.text(c, "type", ""))) engine.handleDeviceControlAck(c, body);
                                        else if (Set.of("FAN_SET", "LIGHT_SET").contains(Jsons.text(c, "type", "").toUpperCase(Locale.ROOT))) engine.handleBearPiActuatorAck(c, body);
                                        else { c.put("ack", body); c.put("status", Jsons.text(body, "status", "TIMEOUT")); store.save("command", commandId, c); engine.evaluateCommand(c, body); }
                                    }
                                }
                            }
                        } catch (Exception ignored) { store.save("dead-letter", Jsons.id("dlq"), Map.of("topic", topic, "reason", "INVALID_MESSAGE", "receivedAt", Instant.now().toString())); }
                    }
                    public void deliveryComplete(org.eclipse.paho.client.mqttv3.IMqttDeliveryToken token) { }
                });
                client.connect(options); client.subscribe("agri/+/+/telemetry", 1); client.subscribe("agri/+/+/device/status", 1); client.subscribe("agri/+/+/command/ack", 1); connected.set(true);
            } catch (Exception ignored) { connected.set(false); }
        });
    }

    boolean connected() { return connected.get(); }
}
