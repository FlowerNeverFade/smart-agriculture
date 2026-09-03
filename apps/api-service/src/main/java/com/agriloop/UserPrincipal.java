package com.agriloop;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class UserPrincipal {
    final String userId;
    final String username;
    final String role;
    final Set<String> farmIds;
    final Set<String> plotIds;
    final int credentialVersion;

    UserPrincipal(String userId, String username, String role, Collection<String> farms, Collection<String> plots) {
        this(userId, username, role, farms, plots, 1);
    }

    UserPrincipal(String userId, String username, String role, Collection<String> farms, Collection<String> plots, int credentialVersion) {
        this.userId = userId; this.username = username; this.role = RolePolicy.canonical(role);
        this.farmIds = new HashSet<>(farms == null ? List.of() : farms);
        this.plotIds = new HashSet<>(plots == null ? List.of() : plots);
        this.credentialVersion = Math.max(1, credentialVersion);
    }
    boolean canAccessPlot(String plotId) { return "SYSTEM_ADMIN".equals(role) || plotIds.contains("*") || plotIds.contains(plotId); }
    boolean canAccessFarm(String farmId) { return "SYSTEM_ADMIN".equals(role) || farmIds.contains("*") || farmIds.contains(farmId); }
    boolean canControl() { return RolePolicy.canControl(role); }
    boolean canInspect() { return Set.of("FARMER", "FARM_ADMIN").contains(role); }
    boolean canRequestIrrigation() { return Set.of("FARMER", "FARM_ADMIN").contains(role); }
    boolean isFarmer() { return "FARMER".equals(role); }
    boolean isFarmAdmin() { return "FARM_ADMIN".equals(role); }
    boolean isSystemAdmin() { return "SYSTEM_ADMIN".equals(role); }
    boolean isAdmin() { return RolePolicy.isAdmin(role); }
}
