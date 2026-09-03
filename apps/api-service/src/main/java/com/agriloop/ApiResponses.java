package com.agriloop;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

final class ApiResponses {
    private ApiResponses() {}
    static Map<String, Object> success(Object data) { return Map.of("requestId", UUID.randomUUID().toString(), "timestamp", Instant.now().toString(), "schemaVersion", "1.0", "data", data); }
    static Map<String, Object> error(String code, String message, Object details) { Map<String, Object> body = new LinkedHashMap<>(); body.put("requestId", UUID.randomUUID().toString()); body.put("timestamp", Instant.now().toString()); body.put("schemaVersion", "1.0"); body.put("error", Map.of("code", code, "message", message, "details", details == null ? Map.of() : details)); return body; }
}
