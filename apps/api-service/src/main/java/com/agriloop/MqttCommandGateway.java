package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
class MqttCommandGateway {
    private final AgriProperties properties;
    private final ObjectMapper mapper;
    private final AtomicBoolean available = new AtomicBoolean(false);

    MqttCommandGateway(AgriProperties properties, ObjectMapper mapper) { this.properties = properties; this.mapper = mapper; }

    void publish(Map<String, Object> command) {
        if (!"simulation".equalsIgnoreCase(properties.getMode())) return;
        org.eclipse.paho.client.mqttv3.MqttClient client = null;
        try {
            String farmId = Jsons.text(command, "farmId", "farm-demo");
            if (!farmId.matches("[A-Za-z0-9_-]{1,120}")) throw new IllegalArgumentException("unsafe farm id");
            String plotId = Jsons.text(command, "plotId", "plot-a01");
            if (!plotId.matches("[A-Za-z0-9_-]{1,120}")) throw new IllegalArgumentException("unsafe plot id");
            client = new org.eclipse.paho.client.mqttv3.MqttClient(properties.getMqttUrl(), properties.getMqttClientId() + "-command-" + UUID.randomUUID().toString().substring(0, 8));
            org.eclipse.paho.client.mqttv3.MqttConnectOptions options = new org.eclipse.paho.client.mqttv3.MqttConnectOptions();
            options.setAutomaticReconnect(false); options.setCleanSession(true); options.setConnectionTimeout(2);
            if (StringUtils.hasText(properties.getMqttUsername())) { options.setUserName(properties.getMqttUsername()); options.setPassword(properties.getMqttPassword().toCharArray()); }
            client.connect(options);
            org.eclipse.paho.client.mqttv3.MqttMessage message = new org.eclipse.paho.client.mqttv3.MqttMessage(mapper.writeValueAsBytes(command)); message.setQos(1);
            client.publish("agri/" + farmId + "/" + plotId + "/command", message); available.set(true);
        } catch (Exception ignored) { available.set(false); }
        finally { if (client != null) { try { if (client.isConnected()) client.disconnect(); } catch (Exception ignored) { } try { client.close(); } catch (Exception ignored) { } } }
    }

    boolean available() { return available.get(); }

    /** 真实测量 MQTT 连接+发布往返延迟（毫秒），失败返回 -1。 */
    long latencyMs() {
        org.eclipse.paho.client.mqttv3.MqttClient client = null;
        long start = System.nanoTime();
        try {
            client = new org.eclipse.paho.client.mqttv3.MqttClient(properties.getMqttUrl(), properties.getMqttClientId() + "-latency-" + UUID.randomUUID().toString().substring(0, 8));
            org.eclipse.paho.client.mqttv3.MqttConnectOptions options = new org.eclipse.paho.client.mqttv3.MqttConnectOptions();
            options.setAutomaticReconnect(false); options.setCleanSession(true); options.setConnectionTimeout(2);
            if (StringUtils.hasText(properties.getMqttUsername())) { options.setUserName(properties.getMqttUsername()); options.setPassword(properties.getMqttPassword().toCharArray()); }
            client.connect(options);
            org.eclipse.paho.client.mqttv3.MqttMessage message = new org.eclipse.paho.client.mqttv3.MqttMessage(mapper.writeValueAsBytes(Map.of("type", "latency-probe", "at", Instant.now().toString()))); message.setQos(1);
            client.publish("agri/farm-demo/latency-probe/command", message);
            return Math.max(0, Duration.ofNanos(System.nanoTime() - start).toMillis());
        } catch (Exception e) {
            return -1;
        } finally {
            if (client != null) { try { if (client.isConnected()) client.disconnect(); } catch (Exception ignored) { } try { client.close(); } catch (Exception ignored) { } }
        }
    }
}
