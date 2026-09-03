package com.agriloop;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

final class Jsons {
    private Jsons() {}
    static Map<String, Object> map(ObjectMapper mapper, Object value) {
        if (value == null) return new LinkedHashMap<>();
        return mapper.convertValue(value, Map.class);
    }
    static List<Map<String, Object>> maps(ObjectMapper mapper, Object value) {
        if (value == null) return new ArrayList<>();
        return mapper.convertValue(value, List.class);
    }
    static String text(Map<String, Object> map, String key, String fallback) {
        Object v = map == null ? null : map.get(key);
        return v == null ? fallback : String.valueOf(v);
    }
    static double number(Map<String, Object> map, String key, double fallback) {
        Object v = map == null ? null : map.get(key);
        return numberValue(v, fallback);
    }
    static double numberValue(Object value, double fallback) {
        if (value instanceof Number n) {
            double parsed = n.doubleValue();
            return Double.isFinite(parsed) ? parsed : fallback;
        }
        try {
            if (value == null) return fallback;
            double parsed = Double.parseDouble(String.valueOf(value));
            return Double.isFinite(parsed) ? parsed : fallback;
        } catch (Exception ignored) { return fallback; }
    }
    static long whole(Map<String, Object> map, String key, long fallback) {
        return Math.round(number(map, key, fallback));
    }
    static boolean bool(Map<String, Object> map, String key, boolean fallback) {
        Object v = map == null ? null : map.get(key);
        return v == null ? fallback : Boolean.parseBoolean(String.valueOf(v));
    }
    static String json(ObjectMapper mapper, Object value) {
        try { return mapper.writeValueAsString(value == null ? Map.of() : value); }
        catch (JsonProcessingException e) { return "{}"; }
    }
    static Map<String, Object> parseMap(ObjectMapper mapper, String value) {
        try { return mapper.readValue(value == null ? "{}" : value, Map.class); }
        catch (Exception ignored) { return new LinkedHashMap<>(); }
    }
    static String id(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }
    static Instant instant(Object value, Instant fallback) {
        if (value == null) return fallback;
        try { return Instant.parse(String.valueOf(value)); }
        catch (Exception ignored) { return fallback; }
    }
    static List<String> strings(Object value) {
        if (value instanceof Collection<?> c) return c.stream().map(String::valueOf).toList();
        if (value == null || String.valueOf(value).isBlank()) return new ArrayList<>();
        return Arrays.stream(String.valueOf(value).split(",")).map(String::trim).filter(s -> !s.isBlank()).toList();
    }
    static Map<String, Object> copy(ObjectMapper mapper, Map<String, Object> value) {
        return map(mapper, value);
    }
}
