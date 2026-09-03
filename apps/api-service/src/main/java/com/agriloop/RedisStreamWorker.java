package com.agriloop;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

@Component
class RedisStreamWorker {
    private static final String GROUP = "agriloop-api";
    private final StringRedisTemplate redis;
    private final AgriProperties properties;
    private final AgriStore store;
    private final String consumer = "api-worker";
    private final AtomicBoolean active = new AtomicBoolean(false);
    private final AtomicLong acknowledged = new AtomicLong();
    private final AtomicLong deadLetters = new AtomicLong();

    RedisStreamWorker(StringRedisTemplate redis, AgriProperties properties, AgriStore store) { this.redis = redis; this.properties = properties; this.store = store; }

    @Scheduled(fixedDelay = 1000)
    void poll() {
        try {
            String stream = properties.getTelemetryStream();
            if (!active.get()) {
                redis.opsForStream().add(stream, Map.of("bootstrap", "true", "createdAt", Instant.now().toString()));
                try { redis.opsForStream().createGroup(stream, ReadOffset.latest(), GROUP); } catch (Exception ignored) { }
                active.set(true);
            }
            List<MapRecord<String, Object, Object>> records = redis.opsForStream().read(Consumer.from(GROUP, consumer), StreamReadOptions.empty().count(50).block(Duration.ofMillis(50)), StreamOffset.create(stream, ReadOffset.lastConsumed()));
            if (records == null) return;
            for (MapRecord<String, Object, Object> record : records) {
                Map<?, ?> fields = record.getValue();
                if ("true".equalsIgnoreCase(String.valueOf(fields.get("bootstrap")))) {
                    redis.opsForStream().acknowledge(stream, GROUP, record.getId()); acknowledged.incrementAndGet();
                    continue;
                }
                String payload = fields.get("payload") == null ? null : String.valueOf(fields.get("payload"));
                if (payload == null || payload.isBlank()) {
                    redis.opsForStream().add(stream + ".dlq", Map.of("streamId", record.getId().getValue(), "reason", "MISSING_PAYLOAD", "failedAt", Instant.now().toString()));
                    store.save("dead-letter", "stream-" + record.getId().getValue(), Map.of("streamId", record.getId().getValue(), "reason", "MISSING_PAYLOAD", "createdAt", Instant.now().toString()));
                    deadLetters.incrementAndGet();
                }
                redis.opsForStream().acknowledge(stream, GROUP, record.getId()); acknowledged.incrementAndGet();
            }
        } catch (Exception ignored) { active.set(false); }
    }

    Map<String, Object> status() { return Map.of("active", active.get(), "group", GROUP, "consumer", consumer, "acknowledged", acknowledged.get(), "deadLetters", deadLetters.get()); }
}
