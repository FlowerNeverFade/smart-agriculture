package com.agriloop;

import java.util.Locale;
import java.util.Set;

/**
 * Public account roles are intentionally limited to the three roles shown by
 * the login screen. FIELD_OPERATOR is retained as a migration-only alias so
 * tokens issued by an older deployment can expire naturally without making a
 * running farm inaccessible during rollout.
 */
final class RolePolicy {
    static final Set<String> PUBLIC_ROLES = Set.of("FARM_ADMIN", "FARMER", "SYSTEM_ADMIN");
    static final Set<String> LEGACY_ROLES = Set.of("FIELD_OPERATOR");
    static final Set<String> ALL_ROLES = PUBLIC_ROLES;

    private RolePolicy() { }

    static String normalize(String value) {
        String role = String.valueOf(value == null ? "" : value).trim().toUpperCase(Locale.ROOT);
        return switch (role) {
            case "ADMIN" -> "FARM_ADMIN";
            case "SYSADMIN" -> "SYSTEM_ADMIN";
            default -> role;
        };
    }

    static String canonical(String value) {
        String role = normalize(value);
        return LEGACY_ROLES.contains(role) || "OPERATOR".equals(role) ? "FARMER" : role;
    }

    static String label(String value) {
        return switch (normalize(value)) {
            case "FARM_ADMIN" -> "农场管理员";
            case "SYSTEM_ADMIN" -> "系统管理员";
            case "FIELD_OPERATOR" -> "种植农户";
            default -> "种植农户";
        };
    }

    static boolean canControl(String value) {
        return Set.of("FARMER", "FARM_ADMIN", "SYSTEM_ADMIN").contains(canonical(value));
    }

    static boolean isAdmin(String value) {
        return Set.of("FARM_ADMIN", "SYSTEM_ADMIN").contains(canonical(value));
    }
}
