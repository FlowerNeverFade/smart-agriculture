package com.agriloop;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Canonical plot-facility metadata and the small set of physical response
 * coefficients shared by CRUD, live simulation and read-only forecasts.
 */
final class PlotFacility {
    static final String OPEN_FIELD = "OPEN_FIELD";
    static final String GREENHOUSE = "GREENHOUSE";
    static final String SHADE_HOUSE = "SHADE_HOUSE";
    static final String ORCHARD = "ORCHARD";
    static final Set<String> TYPES = Set.of(OPEN_FIELD, GREENHOUSE, SHADE_HOUSE, ORCHARD);

    private PlotFacility() { }

    static String canonical(Object value) {
        String raw = String.valueOf(value == null ? "" : value).trim();
        if (raw.isBlank()) return "";
        String normalized = raw.toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "OPEN", "BARE", "BARE_FIELD", "OUTDOOR", "露地", "裸地" -> OPEN_FIELD;
            case "GLASSHOUSE", "POLYTUNNEL", "大棚", "温室" -> GREENHOUSE;
            case "SHADE", "NET_HOUSE", "遮阳棚", "网棚" -> SHADE_HOUSE;
            case "果园" -> ORCHARD;
            default -> TYPES.contains(normalized) ? normalized : "";
        };
    }

    static String forPlot(Map<String, Object> plot) {
        String explicit = canonical(plot == null ? null : plot.get("facilityType"));
        if (!explicit.isBlank()) return explicit;
        String legacy = canonical(plot == null ? null : plot.get("plotType"));
        if (!legacy.isBlank()) return legacy;
        String name = String.valueOf(plot == null ? "" : plot.getOrDefault("name", ""));
        if (name.contains("温室") || name.contains("大棚") || name.contains("棚")) return GREENHOUSE;
        if (name.contains("果园")) return ORCHARD;
        return OPEN_FIELD;
    }

    static String label(String type) {
        return switch (canonical(type)) {
            case GREENHOUSE -> "大棚";
            case SHADE_HOUSE -> "遮阳棚";
            case ORCHARD -> "果园";
            default -> "露地（裸地）";
        };
    }

    /** Fraction of outside rain that can directly affect root-zone moisture. */
    static double rainExposure(String type) {
        return switch (canonical(type)) {
            case GREENHOUSE -> 0.10;
            case SHADE_HOUSE -> 0.48;
            case ORCHARD -> 0.76;
            default -> 1.0;
        };
    }

    /** Buffering of outside temperature/humidity changes by the facility. */
    static double climateResponse(String type) {
        return switch (canonical(type)) {
            case GREENHOUSE -> 0.55;
            case SHADE_HOUSE -> 0.78;
            case ORCHARD -> 0.88;
            default -> 1.0;
        };
    }

    static double soilTrendResponse(String type, String scenario) {
        String normalizedScenario = String.valueOf(scenario == null ? "" : scenario).toUpperCase(Locale.ROOT).replace('-', '_');
        if ("HEAVY_RAIN".equals(normalizedScenario)) return rainExposure(type);
        if ("DROUGHT".equals(normalizedScenario)) {
            return switch (canonical(type)) {
                case GREENHOUSE -> 0.68;
                case SHADE_HOUSE -> 0.82;
                case ORCHARD -> 0.90;
                default -> 1.0;
            };
        }
        return switch (canonical(type)) {
            case GREENHOUSE -> 0.82;
            case SHADE_HOUSE -> 0.91;
            default -> 1.0;
        };
    }

    static double lightTransmission(String type) {
        return switch (canonical(type)) {
            case GREENHOUSE -> 0.82;
            case SHADE_HOUSE -> 0.62;
            case ORCHARD -> 0.86;
            default -> 1.0;
        };
    }
}
