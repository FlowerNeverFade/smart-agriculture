package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.annotation.PostConstruct;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Farm-manager mutation boundary introduced by the admin interface freeze.
 * Every method receives an effective (database-refreshed) principal and checks
 * farm/plot ownership again; the JWT schema is intentionally unchanged.
 */
@Service
class AdminManagementService {
    private static final List<String> PLOT_DEPENDENCY_TYPES = List.of(
            "crop-batch", "device", "alert", "diagnosis", "readiness",
            "irrigation-plan", "command", "evaluation", "inspection", "work-order");

    private final AgriStore store;
    private final AgriEngine engine;
    private final AgriEventBus events;
    private final CropPackCatalog cropPacks;
    private final ObjectMapper mapper;
    private final PasswordEncoder passwordEncoder;

    AdminManagementService(AgriStore store, AgriEngine engine, AgriEventBus events,
                           CropPackCatalog cropPacks, ObjectMapper mapper, PasswordEncoder passwordEncoder) {
        this.store = store;
        this.engine = engine;
        this.events = events;
        this.cropPacks = cropPacks;
        this.mapper = mapper;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Device records created by the frozen admin UI before source metadata was
     * added are safe to classify as simulators when they carry a registeredBy
     * actor. Telemetry-discovered records (including hardware) do not have that
     * marker and are deliberately left untouched.
     */
    @PostConstruct
    void backfillManagedDeviceSources() {
        for (Map<String, Object> device : store.list("device")) {
            String sourceMode = Jsons.text(device, "sourceMode", "").trim();
            String dataOrigin = Jsons.text(device, "dataOrigin", "").trim();
            String registeredBy = Jsons.text(device, "registeredBy", "").trim();
            if (registeredBy.isBlank() || !sourceMode.isBlank() || !dataOrigin.isBlank()) continue;
            device.put("sourceMode", "SIMULATION");
            device.put("dataOrigin", "SIMULATOR");
            device.putIfAbsent("desiredStatus", Jsons.text(device, "status", "OFFLINE"));
            device.putIfAbsent("controlStatus", "SUCCEEDED");
            store.save("device", Jsons.text(device, "deviceId", ""), device);
            publish("device.source.backfilled", device);
        }
    }

    List<Map<String, Object>> devices(String farmId, UserPrincipal principal) {
        requireVisibleFarm(farmId, principal);
        return store.list("device").stream()
                .filter(device -> farmId.equals(deviceFarmId(device)))
                .sorted(Comparator.comparing(device -> Jsons.text(device, "deviceId", "")))
                .toList();
    }

    Map<String, Object> registerDevice(Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        String farmId = requiredText(input, "farmId", "请选择设备所属农场");
        requireManagedFarm(farmId, principal);
        String deviceId = Jsons.text(input, "deviceId", Jsons.id("device")).trim();
        if (store.find("device", deviceId) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "DEVICE_EXISTS", "设备编号已存在");
        }
        Map<String, Object> device = new LinkedHashMap<>();
        device.put("deviceId", deviceId);
        device.put("farmId", farmId);
        device.put("name", Jsons.text(input, "name", deviceId));
        device.put("type", requiredText(input, "type", "请选择设备类型"));
        String sourceMode = Jsons.text(input, "sourceMode", "SIMULATION").trim().toUpperCase(Locale.ROOT);
        if ("SIMULATED".equals(sourceMode)) sourceMode = "SIMULATION";
        if (!Set.of("SIMULATION", "REAL").contains(sourceMode)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DEVICE_SOURCE_INVALID", "设备接入方式只能是模拟设备或真实设备");
        }
        device.put("sourceMode", sourceMode);
        device.put("dataOrigin", "REAL".equals(sourceMode) ? "HARDWARE" : "SIMULATOR");
        device.put("status", "OFFLINE");
        device.put("desiredStatus", "OFFLINE");
        device.put("controlStatus", "SUCCEEDED");
        device.put("bindingState", "UNBOUND");
        device.put("plotId", null);
        device.put("lastSeen", null);
        device.put("healthScore", null);
        device.put("registeredAt", Instant.now().toString());
        device.put("registeredBy", principal.userId);
        store.save("device", deviceId, device);
        publish("device.registered", device);
        return device;
    }

    Map<String, Object> bindDevice(String deviceId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> device = require("device", deviceId, "设备不存在");
        String farmId = deviceFarmId(device);
        requireManagedFarm(farmId, principal);
        String plotId = requiredText(input, "plotId", "请选择绑定地块");
        Map<String, Object> plot = require("plot", plotId, "地块不存在");
        if (!farmId.equals(Jsons.text(plot, "farmId", ""))) {
            throw new ApiException(HttpStatus.CONFLICT, "DEVICE_PLOT_FARM_MISMATCH", "设备和地块不属于同一农场");
        }
        if ("INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE"))) {
            throw new ApiException(HttpStatus.CONFLICT, "PLOT_INACTIVE", "停用地块不能绑定设备");
        }
        engine.ensurePlotAccess(principal, plotId);
        String previousPlotId = Jsons.text(device, "plotId", "").trim();
        device.put("plotId", plotId);
        device.put("bindingState", "BOUND");
        device.put("boundAt", Instant.now().toString());
        device.put("boundBy", principal.userId);
        // A transfer invalidates the previous plot's confirmed status. A new
        // heartbeat or an explicit simulator control must confirm the device
        // again at its new location.
        if (!previousPlotId.isBlank() && !previousPlotId.equals(plotId)) {
            device.put("previousPlotId", previousPlotId);
            device.put("status", "OFFLINE");
            device.put("desiredStatus", "OFFLINE");
            device.put("controlStatus", "SUCCEEDED");
            device.remove("lastControlError");
        } else {
            device.putIfAbsent("status", "OFFLINE");
        }
        store.save("device", deviceId, device);
        publish("device.bound", device);
        return device;
    }

    @Transactional
    Map<String, Object> setPlotDevices(String plotId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> plot = managedPlot(plotId, principal);
        if ("INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE"))) {
            throw new ApiException(HttpStatus.CONFLICT, "PLOT_INACTIVE", "停用地块不能绑定设备");
        }
        Object rawDeviceIds = input == null ? null : input.get("deviceIds");
        if (!(rawDeviceIds instanceof Collection<?>)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DEVICE_IDS_REQUIRED", "请提供要绑定的设备列表");
        }
        LinkedHashSet<String> requested = new LinkedHashSet<>();
        for (Object value : (Collection<?>) rawDeviceIds) {
            String deviceId = String.valueOf(value == null ? "" : value).trim();
            if (!deviceId.isBlank()) requested.add(deviceId);
        }
        String farmId = Jsons.text(plot, "farmId", "");
        List<Map<String, Object>> allFarmDevices = store.list("device").stream()
                .filter(device -> farmId.equals(deviceFarmId(device)))
                .toList();
        Map<String, Map<String, Object>> byId = allFarmDevices.stream()
                .collect(Collectors.toMap(device -> Jsons.text(device, "deviceId", ""), device -> device, (left, right) -> left, LinkedHashMap::new));
        for (String deviceId : requested) {
            Map<String, Object> device = byId.get(deviceId);
            if (device == null) throw new ApiException(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "设备不存在或不属于当前农场");
        }

        Instant now = Instant.now();
        List<String> unbound = new ArrayList<>();
        List<String> moved = new ArrayList<>();
        List<Map<String, Object>> updatedDevices = new ArrayList<>();
        for (Map<String, Object> device : allFarmDevices) {
            String deviceId = Jsons.text(device, "deviceId", "");
            String currentPlotId = Jsons.text(device, "plotId", "").trim();
            boolean currentlyOnPlot = plotId.equals(currentPlotId);
            boolean shouldBeOnPlot = requested.contains(deviceId);
            if (currentlyOnPlot && shouldBeOnPlot) {
                updatedDevices.add(new LinkedHashMap<>(device));
                continue;
            }
            if (currentlyOnPlot && !shouldBeOnPlot) {
                device.put("plotId", null);
                device.put("bindingState", "UNBOUND");
                device.put("status", "OFFLINE");
                device.put("desiredStatus", "OFFLINE");
                device.put("controlStatus", "SUCCEEDED");
                device.put("previousPlotId", plotId);
                device.put("unboundAt", now.toString());
                device.put("unboundBy", principal.userId);
                store.save("device", deviceId, device);
                publish("device.unbound", device);
                unbound.add(deviceId);
                updatedDevices.add(new LinkedHashMap<>(device));
                continue;
            }
            if (!currentlyOnPlot && shouldBeOnPlot) {
                if (!currentPlotId.isBlank()) moved.add(deviceId);
                device.put("plotId", plotId);
                device.put("bindingState", "BOUND");
                device.put("boundAt", now.toString());
                device.put("boundBy", principal.userId);
                if (!currentPlotId.isBlank()) device.put("previousPlotId", currentPlotId);
                device.put("status", "OFFLINE");
                device.put("desiredStatus", "OFFLINE");
                device.put("controlStatus", "SUCCEEDED");
                device.remove("lastControlError");
                store.save("device", deviceId, device);
                publish("device.bound", device);
                updatedDevices.add(new LinkedHashMap<>(device));
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("plotId", plotId);
        result.put("deviceIds", new ArrayList<>(requested));
        result.put("devices", updatedDevices);
        result.put("movedDeviceIds", moved);
        result.put("unboundDeviceIds", unbound);
        result.put("updatedAt", now.toString());
        result.put("updatedBy", principal.userId);
        publish("plot.devices.updated", result);
        return result;
    }

    Map<String, Object> createPlot(Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        String farmId = Jsons.text(input, "farmId", "").trim();
        if (farmId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "FARM_ID_REQUIRED", "请选择地块所属农场");
        requireManagedFarm(farmId, principal);
        validatePlot(input);
        String plotId = Jsons.text(input, "plotId", Jsons.id("plot"));
        if (store.find("plot", plotId) != null) throw new ApiException(HttpStatus.CONFLICT, "PLOT_EXISTS", "地块编号已存在");
        Map<String, Object> plot = new LinkedHashMap<>(input);
        plot.put("plotId", plotId); plot.put("farmId", farmId); plot.put("status", "ACTIVE");
        plot.put("createdAt", Instant.now().toString()); plot.put("createdBy", principal.userId);
        store.save("plot", plotId, plot);
        engine.syncSimulationConfiguration();
        publish("plot.created", plot);
        return plot;
    }

    Map<String, Object> updatePlot(String plotId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> current = managedPlot(plotId, principal);
        Map<String, Object> updated = new LinkedHashMap<>(current);
        for (String field : List.of("name", "cropCode", "cropName", "cropVariety", "stageCode", "stageLabel", "growthCycleDays", "areaM2", "metrics", "riskLevel", "healthScore", "deviceStatus", "lastSeen")) {
            if (input.containsKey(field)) updated.put(field, input.get(field));
        }
        validatePlot(updated);
        updated.put("plotId", plotId); updated.put("updatedAt", Instant.now().toString()); updated.put("updatedBy", principal.userId);
        store.save("plot", plotId, updated);
        publish("plot.updated", updated);
        return updated;
    }

    Map<String, Object> unbindDevice(String deviceId, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> device = require("device", deviceId, "设备不存在");
        requireManagedFarm(deviceFarmId(device), principal);
        String previousPlotId = Jsons.text(device, "plotId", "");
        device.put("plotId", null);
        device.put("bindingState", "UNBOUND");
        device.put("status", "OFFLINE");
        device.put("desiredStatus", "OFFLINE");
        device.put("controlStatus", "SUCCEEDED");
        device.put("unboundAt", Instant.now().toString());
        device.put("unboundBy", principal.userId);
        device.put("previousPlotId", previousPlotId);
        store.save("device", deviceId, device);
        publish("device.unbound", device);
        return device;
    }

    Map<String, Object> deactivatePlot(String plotId, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> plot = managedPlot(plotId, principal);
        if ("INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE"))) return plot;
        plot.put("status", "INACTIVE");
        plot.put("deactivatedAt", Instant.now().toString());
        plot.put("deactivatedBy", principal.userId);
        plot.put("updatedAt", Instant.now().toString());
        store.save("plot", plotId, plot);
        publish("plot.deactivated", plot);
        return plot;
    }

    Map<String, Object> restorePlot(String plotId, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> plot = managedPlot(plotId, principal);
        if (!"INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE"))) return plot;
        plot.put("status", "ACTIVE");
        plot.remove("deactivatedAt");
        plot.remove("deactivatedBy");
        plot.put("restoredAt", Instant.now().toString());
        plot.put("restoredBy", principal.userId);
        plot.put("updatedAt", Instant.now().toString());
        store.save("plot", plotId, plot);
        publish("plot.restored", plot);
        return plot;
    }

    Map<String, Object> deletePlot(String plotId, String confirmationName, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> plot = managedPlot(plotId, principal);
        if (!"INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE"))) {
            throw new ApiException(HttpStatus.CONFLICT, "PLOT_MUST_BE_INACTIVE", "请先停用地块，再执行永久删除");
        }
        String name = Jsons.text(plot, "name", plotId);
        if (!Objects.equals(name, String.valueOf(confirmationName == null ? "" : confirmationName).trim())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_CONFIRMATION_MISMATCH", "请输入完整地块名称进行确认");
        }
        Map<String, Object> counts = new LinkedHashMap<>();
        long total = 0;
        for (String type : PLOT_DEPENDENCY_TYPES) {
            long count = store.countWhere(type, record -> plotId.equals(Jsons.text(record, "plotId", ""))
                    || ("device".equals(type) && plotId.equals(Jsons.text(record, "previousPlotId", ""))));
            counts.put(type, count);
            total += count;
        }
        int telemetry = store.telemetryCount(plotId);
        counts.put("telemetry", telemetry);
        total += telemetry;
        if (total > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "PLOT_HAS_DEPENDENCIES", "该地块仍有关联记录，不能永久删除")
                    .withDetails(Map.of("plotId", plotId, "counts", counts, "total", total));
        }
        store.delete("plot", plotId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("plotId", plotId); result.put("name", name); result.put("deleted", true);
        result.put("deletedAt", Instant.now().toString()); result.put("deletedBy", principal.userId);
        publish("plot.deleted", result);
        return result;
    }

    Map<String, Object> updateFarmMemberScope(String userId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        if (input.containsKey("role")) {
            throw new ApiException(HttpStatus.FORBIDDEN, "MEMBER_ROLE_IMMUTABLE", "地块权限维护不能修改成员角色");
        }
        String farmId = requiredText(input, "farmId", "请选择农场");
        requireManagedFarm(farmId, principal);
        Map<String, Object> member = store.userById(userId);
        if (member == null) throw new ApiException(HttpStatus.NOT_FOUND, "FARM_MEMBER_NOT_FOUND", "农场成员不存在");
        if (!"FARMER".equals(RolePolicy.canonical(Jsons.text(member, "role", "")))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "MEMBER_ROLE_IMMUTABLE", "这里只能维护种植农户的地块范围");
        }
        List<String> memberFarms = Jsons.strings(member.get("farmIds"));
        if (!memberFarms.contains(farmId) && !memberFarms.contains("*")) {
            throw new ApiException(HttpStatus.CONFLICT, "MEMBER_NOT_IN_FARM", "该成员不属于当前农场");
        }
        LinkedHashSet<String> requested = new LinkedHashSet<>(Jsons.strings(input.get("plotIds")));
        for (String plotId : requested) {
            Map<String, Object> plot = require("plot", plotId, "存在无效地块");
            if (!farmId.equals(Jsons.text(plot, "farmId", "")) || !engine.canAccessPlot(principal, plotId)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "MEMBER_SCOPE_FORBIDDEN", "只能授予当前农场内可管理的地块");
            }
        }
        LinkedHashSet<String> preserved = new LinkedHashSet<>();
        for (String existingPlotId : Jsons.strings(member.get("plotIds"))) {
            Map<String, Object> existingPlot = store.find("plot", existingPlotId);
            if (existingPlot == null || !farmId.equals(Jsons.text(existingPlot, "farmId", ""))) preserved.add(existingPlotId);
        }
        preserved.addAll(requested);
        Map<String, Object> updated = store.updateUserScope(userId, memberFarms, preserved);
        if (updated == null) throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "MEMBER_SCOPE_UPDATE_FAILED", "成员权限更新失败");
        Map<String, Object> result = memberView(updated, farmId);
        result.put("updatedAt", Instant.now().toString());
        result.put("updatedBy", principal.userId);
        publish("member.scope.updated", result);
        return result;
    }

    Map<String, Object> createFarmMember(Map<String, Object> input, UserPrincipal principal) {
        if (!principal.isAdmin()) {
            requireFarmAdmin(principal);
        }
        String farmId = Jsons.text(input, "farmId", "farm-demo");
        if (!principal.isAdmin()) {
            requireManagedFarm(farmId, principal);
        }

        String username = requiredText(input, "username", "请填写成员账号").toLowerCase(Locale.ROOT);
        if (!username.matches("^[a-z0-9][a-z0-9._-]{3,31}$")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "MEMBER_USERNAME_INVALID", "账号需为 4～32 位字母、数字、点、下划线或短横线");
        }
        String password = requiredText(input, "password", "请设置成员初始密码");
        if (password.length() < 8 || password.length() > 64 || !password.matches(".*[A-Za-z].*") || !password.matches(".*\\d.*")
                || password.toLowerCase(Locale.ROOT).contains(username)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "MEMBER_PASSWORD_WEAK", "初始密码需为 8～64 位并包含字母和数字，且不能包含账号");
        }

        String role = Jsons.text(input, "role", "FARMER");
        if (!principal.isAdmin() && !"FARMER".equals(role)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "MEMBER_ROLE_FORBIDDEN", "非系统管理员只能创建农户账号");
        }

        List<String> plotIds = "SYSTEM_ADMIN".equals(role) ? List.of("*") : validateMemberPlots(farmId, input.get("plotIds"), principal);
        Map<String, Object> member = new LinkedHashMap<>();
        member.put("userId", Jsons.id("user"));
        member.put("username", username);
        member.put("passwordHash", passwordEncoder.encode(password));
        member.put("role", role);
        member.put("farmIds", "SYSTEM_ADMIN".equals(role) ? List.of("*") : List.of(farmId));
        member.put("plotIds", plotIds);
        member.put("enabled", true);
        member.put("credentialVersion", 1);
        if (!store.createUser(member)) {
            throw new ApiException(HttpStatus.CONFLICT, "MEMBER_EXISTS", "该成员账号已存在");
        }
        Map<String, Object> result = memberView(member, farmId);
        result.put("createdAt", Instant.now().toString());
        result.put("createdBy", principal.userId);
        publish("member.created", result);
        return result;
    }

    Map<String, Object> deleteFarmMember(String userId, String farmId, UserPrincipal principal) {
        requireFarmAdmin(principal);
        requireManagedFarm(farmId, principal);
        Map<String, Object> member = store.userById(userId);
        if (member == null || !"FARMER".equals(RolePolicy.canonical(Jsons.text(member, "role", "")))) {
            throw new ApiException(HttpStatus.NOT_FOUND, "FARM_MEMBER_NOT_FOUND", "没有找到可移除的种植农户");
        }
        LinkedHashSet<String> farmIds = new LinkedHashSet<>(Jsons.strings(member.get("farmIds")));
        if (!farmIds.remove(farmId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "FARM_MEMBER_NOT_FOUND", "该农户不属于当前农场");
        }
        List<String> plotIds = Jsons.strings(member.get("plotIds")).stream().filter(plotId -> {
            Map<String, Object> plot = store.find("plot", plotId);
            return plot == null || !farmId.equals(Jsons.text(plot, "farmId", ""));
        }).toList();
        Map<String, Object> updated = store.updateUserScope(userId, farmIds, plotIds);
        if (updated == null) throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "FARM_MEMBER_DELETE_FAILED", "成员移除失败");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", userId);
        result.put("username", Jsons.text(member, "username", userId));
        result.put("farmId", farmId);
        result.put("removed", true);
        result.put("removedAt", Instant.now().toString());
        result.put("removedBy", principal.userId);
        publish("member.removed", result);
        return result;
    }

    List<Map<String, Object>> cropBatches(String farmId, UserPrincipal principal) {
        requireManagedFarm(farmId, principal);
        return store.list("crop-batch").stream()
                .filter(batch -> farmId.equals(batchFarmId(batch)))
                .filter(batch -> engine.canAccessPlot(principal, Jsons.text(batch, "plotId", "")))
                .sorted(Comparator.comparing(batch -> Jsons.text(batch, "createdAt", Jsons.text(batch, "plantedAt", "")), Comparator.reverseOrder()))
                .toList();
    }

    Map<String, Object> createCropBatch(Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        String farmId = requiredText(input, "farmId", "请选择农场");
        String plotId = requiredText(input, "plotId", "请选择地块");
        requireManagedFarm(farmId, principal);
        Map<String, Object> plot = managedPlot(plotId, principal);
        if (!farmId.equals(Jsons.text(plot, "farmId", ""))) {
            throw new ApiException(HttpStatus.CONFLICT, "BATCH_PLOT_FARM_MISMATCH", "地块不属于当前农场");
        }
        if ("INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE"))) {
            throw new ApiException(HttpStatus.CONFLICT, "PLOT_INACTIVE", "停用地块不能创建种植批次");
        }
        String cropCode = requiredText(input, "cropCode", "请选择作物");
        Map<String, Object> pack = cropPacks.require(cropCode, Jsons.text(input, "cropPackVersion", ""));
        long cycleDays = Jsons.whole(input, "plannedCycleDays", Jsons.whole(plot, "growthCycleDays", 0));
        if (cycleDays <= 0) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PLAN_CYCLE_REQUIRED", "Crop Pack 未提供阶段时长，请填写计划周期");
        }
        LocalDate plantedAt = parseDate(input.get("plantedAt"), LocalDate.now());
        String batchId = Jsons.text(input, "batchId", Jsons.id("batch"));
        if (store.find("crop-batch", batchId) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "CROP_BATCH_EXISTS", "种植批次编号已存在");
        }
        Map<String, Object> batch = new LinkedHashMap<>();
        batch.put("batchId", batchId); batch.put("farmId", farmId); batch.put("plotId", plotId);
        batch.put("cropCode", cropCode); batch.put("cropPackVersion", pack.get("version"));
        batch.put("stageCode", Jsons.text(input, "stageCode", firstStageCode(pack)));
        batch.put("plantedAt", plantedAt.toString()); batch.put("plannedCycleDays", cycleDays);
        batch.put("status", "ACTIVE"); batch.put("createdAt", Instant.now().toString()); batch.put("createdBy", principal.userId);
        store.save("crop-batch", batchId, batch);
        publish("cropbatch.created", batch);
        return batch;
    }

    @Transactional
    Map<String, Object> generateCropBatchPlan(String batchId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> batch = require("crop-batch", batchId, "种植批次不存在");
        managedPlot(Jsons.text(batch, "plotId", ""), principal);
        Map<String, Object> existing = store.find("crop-plan", "plan-" + batchId);
        if (existing != null && "APPROVED".equals(Jsons.text(existing, "status", ""))) {
            throw new ApiException(HttpStatus.CONFLICT, "CROP_PLAN_ALREADY_APPROVED", "已审批计划不能重新生成");
        }
        Map<String, Object> pack = cropPacks.require(Jsons.text(batch, "cropCode", ""), Jsons.text(batch, "cropPackVersion", ""));
        long cycleDays = Jsons.whole(input, "plannedCycleDays", Jsons.whole(batch, "plannedCycleDays", 0));
        if (cycleDays <= 0) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PLAN_CYCLE_REQUIRED", "请填写计划周期后再生成计划");
        LocalDate start = parseDate(input.get("startDate"), parseDate(batch.get("plantedAt"), LocalDate.now()));
        List<Map<String, Object>> stages = Jsons.maps(mapper, pack.get("stages")).stream()
                .sorted(Comparator.comparingLong(stage -> Jsons.whole(stage, "sequence", Long.MAX_VALUE))).toList();
        if (stages.isEmpty()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CROP_PACK_STAGES_MISSING", "Crop Pack 没有可用阶段");
        List<Map<String, Object>> tasks = derivePlanTasks(pack, stages, start, cycleDays);
        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("planId", "plan-" + batchId); plan.put("batchId", batchId);
        plan.put("farmId", batchFarmId(batch)); plan.put("plotId", batch.get("plotId"));
        plan.put("cropCode", batch.get("cropCode")); plan.put("cropPackVersion", pack.get("version"));
        plan.put("status", "DRAFT"); plan.put("sourceMode", "DERIVED");
        plan.put("scheduleMethod", "EVEN_STAGE_SPLIT"); plan.put("startDate", start.toString());
        plan.put("endDate", start.plusDays(cycleDays).toString()); plan.put("plannedCycleDays", cycleDays);
        plan.put("tasks", tasks); plan.put("generatedAt", Instant.now().toString()); plan.put("generatedBy", principal.userId);
        store.save("crop-plan", Jsons.text(plan, "planId", ""), plan);
        batch.put("planId", plan.get("planId")); batch.put("plannedCycleDays", cycleDays); batch.put("updatedAt", Instant.now().toString());
        store.save("crop-batch", batchId, batch);
        publish("cropplan.generated", plan);
        return plan;
    }

    @Transactional
    synchronized Map<String, Object> reviewCropBatchPlan(String batchId, Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        Map<String, Object> batch = require("crop-batch", batchId, "种植批次不存在");
        managedPlot(Jsons.text(batch, "plotId", ""), principal);
        String planId = Jsons.text(batch, "planId", "plan-" + batchId);
        Map<String, Object> plan = require("crop-plan", planId, "请先生成生产计划预览");
        if ("APPROVED".equals(Jsons.text(plan, "status", ""))) return plan;
        String decision = requiredText(input, "decision", "请选择审批结果").toUpperCase(Locale.ROOT);
        if ("REJECT".equals(decision)) {
            String note = requiredText(input, "note", "驳回时请填写原因");
            plan.put("status", "REJECTED"); plan.put("reviewNote", note);
            plan.put("reviewedAt", Instant.now().toString()); plan.put("reviewedBy", principal.userId);
            store.save("crop-plan", planId, plan); publish("cropplan.rejected", plan); return plan;
        }
        if (!"APPROVE".equals(decision)) throw new ApiException(HttpStatus.BAD_REQUEST, "PLAN_DECISION_INVALID", "审批结果只能是通过或驳回");
        List<Map<String, Object>> tasks = normalizedReviewedTasks(plan, input.get("tasks"));
        List<String> workOrderIds = new ArrayList<>();
        for (Map<String, Object> task : tasks) {
            if (Jsons.bool(task, "removed", false)) continue;
            Map<String, Object> workInput = new LinkedHashMap<>();
            workInput.put("farmId", plan.get("farmId")); workInput.put("plotId", plan.get("plotId"));
            workInput.put("title", taskTitle(task)); workInput.put("reason", "来自已审批生产计划");
            workInput.put("actionType", task.get("actionType")); workInput.put("priority", task.get("priority"));
            workInput.put("dueAt", dueAt(Jsons.text(task, "scheduleDate", "")));
            workInput.put("sourceType", "CROP_PLAN"); workInput.put("sourceRef", planId);
            Map<String, Object> work = engine.createWorkOrder(workInput, principal);
            work.put("cropBatchId", batchId); work.put("stageCode", task.get("stageCode"));
            work.put("cropPackVersion", plan.get("cropPackVersion")); work.put("templateRef", task.get("templateRef"));
            store.save("work-order", Jsons.text(work, "workOrderId", ""), work);
            workOrderIds.add(Jsons.text(work, "workOrderId", ""));
        }
        plan.put("tasks", tasks); plan.put("status", "APPROVED"); plan.put("workOrderIds", workOrderIds);
        plan.put("reviewNote", Jsons.text(input, "note", "")); plan.put("reviewedAt", Instant.now().toString());
        plan.put("reviewedBy", principal.userId); plan.put("idempotencyKey", Jsons.text(input, "idempotencyKey", planId));
        store.save("crop-plan", planId, plan);
        publish("cropplan.approved", plan);
        return plan;
    }

    Map<String, Object> cropBatchPlan(String batchId, UserPrincipal principal) {
        Map<String, Object> batch = require("crop-batch", batchId, "种植批次不存在");
        engine.ensurePlotAccess(principal, Jsons.text(batch, "plotId", ""));
        Map<String, Object> plan = store.find("crop-plan", Jsons.text(batch, "planId", "plan-" + batchId));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("batch", batch); result.put("plan", plan);
        result.put("tasks", store.list("work-order").stream()
                .filter(work -> batchId.equals(Jsons.text(work, "cropBatchId", ""))).toList());
        return result;
    }

    List<Map<String, Object>> valueLedgers(String farmId, UserPrincipal principal) {
        requireVisibleFarm(farmId, principal);
        return store.list("value-ledger").stream()
                .filter(ledger -> farmId.equals(Jsons.text(ledger, "farmId", Jsons.text(ledger, "scope", ""))))
                .sorted(Comparator.comparing(ledger -> Jsons.text(ledger, "createdAt", ""), Comparator.reverseOrder()))
                .toList();
    }

    Map<String, Object> createValueLedger(Map<String, Object> input, UserPrincipal principal) {
        requireFarmAdmin(principal);
        String farmId = requiredText(input, "farmId", "请选择农场");
        requireManagedFarm(farmId, principal);
        String plotId = Jsons.text(input, "plotId", "");
        if (!plotId.isBlank()) managedPlot(plotId, principal);

        Double planned = nullableNumber(input, "plannedWaterLitres");
        String plannedSource = planned == null ? null : "USER_PROVIDED";
        String planId = Jsons.text(input, "irrigationPlanId", "");
        Map<String, Object> irrigationPlan = planId.isBlank() ? null : store.find("irrigation-plan", planId);
        if (planned == null && irrigationPlan != null) {
            planned = Jsons.number(irrigationPlan, "waterLitre", 0);
            plannedSource = "OBSERVED";
            plotId = Jsons.text(irrigationPlan, "plotId", plotId);
            managedPlot(plotId, principal);
        }

        Double actual = nullableNumber(input, "actualWaterLitres");
        String actualSource = actual == null ? null : "USER_PROVIDED";
        String evaluationId = Jsons.text(input, "evaluationId", "");
        Map<String, Object> evaluation = evaluationId.isBlank() ? null : store.find("evaluation", evaluationId);
        if (actual == null && evaluation != null) {
            Map<String, Object> actualMap = Jsons.map(mapper, evaluation.get("actual"));
            if (actualMap.containsKey("waterLitre")) {
                actual = Jsons.number(actualMap, "waterLitre", 0); actualSource = "OBSERVED";
                plotId = Jsons.text(evaluation, "plotId", plotId);
                managedPlot(plotId, principal);
            }
        }
        Double unitCost = nullableNumber(input, "waterPricePerLitre");
        String priceSource = unitCost == null ? null : "USER_PROVIDED";
        Map<String, Object> farm = store.find("farm", farmId);
        Map<String, Object> defaults = farm == null ? Map.of() : Jsons.map(mapper, farm.get("defaults"));
        if (unitCost == null && defaults.containsKey("waterPricePerLitre")) {
            unitCost = Jsons.number(defaults, "waterPricePerLitre", 0); priceSource = "OBSERVED";
        }

        boolean complete = planned != null && actual != null && unitCost != null && planned > 0 && actual >= 0 && unitCost >= 0;
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("plannedWaterLitres", planned); metrics.put("actualWaterLitres", actual);
        metrics.put("waterDeviationRate", complete ? (actual - planned) / planned : null);
        metrics.put("waterSavingLitres", complete ? planned - actual : null);
        metrics.put("waterCost", complete ? actual * unitCost : null);
        Map<String, Object> ledger = new LinkedHashMap<>();
        ledger.put("valueLedgerId", Jsons.id("value")); ledger.put("farmId", farmId); ledger.put("plotId", blankToNull(plotId));
        ledger.put("status", complete ? "COMPUTED" : "INCOMPLETE"); ledger.put("sourceMode", Jsons.text(input, "sourceMode", "USER_PROVIDED"));
        ledger.put("plannedSource", plannedSource); ledger.put("actualSource", actualSource); ledger.put("priceSource", priceSource);
        ledger.put("irrigationPlanId", blankToNull(planId)); ledger.put("evaluationId", blankToNull(evaluationId));
        ledger.put("metrics", metrics); ledger.put("waterPricePerLitre", unitCost);
        ledger.put("createdAt", Instant.now().toString()); ledger.put("createdBy", principal.userId);
        store.save("value-ledger", Jsons.text(ledger, "valueLedgerId", ""), ledger);
        publish("valueledger.created", ledger);
        return ledger;
    }

    private List<Map<String, Object>> derivePlanTasks(Map<String, Object> pack, List<Map<String, Object>> stages,
                                                       LocalDate start, long cycleDays) {
        List<Map<String, Object>> tasks = new ArrayList<>();
        int stageCount = stages.size();
        for (int stageIndex = 0; stageIndex < stageCount; stageIndex++) {
            Map<String, Object> stage = stages.get(stageIndex);
            LocalDate stageStart = start.plusDays((cycleDays * stageIndex) / stageCount);
            LocalDate stageEnd = start.plusDays((cycleDays * (stageIndex + 1)) / stageCount);
            List<Map<String, Object>> templates = Jsons.maps(mapper, stage.get("taskTemplates"));
            for (int templateIndex = 0; templateIndex < templates.size(); templateIndex++) {
                Map<String, Object> template = templates.get(templateIndex);
                int interval = (int) Math.max(1, Jsons.whole(template, "intervalDays", 1));
                int occurrence = 0;
                for (LocalDate date = stageStart; date.isBefore(stageEnd); date = date.plusDays(interval)) {
                    Map<String, Object> task = new LinkedHashMap<>();
                    String actionType = Jsons.text(template, "actionType", "INSPECTION");
                    String templateRef = Jsons.text(pack, "cropCode", "") + "@" + Jsons.text(pack, "version", "") + "/"
                            + Jsons.text(stage, "code", "") + "/" + actionType + "/" + templateIndex;
                    task.put("taskKey", templateRef + "/" + occurrence++); task.put("templateRef", templateRef);
                    task.put("stageCode", stage.get("code")); task.put("actionType", actionType);
                    task.put("priority", Jsons.text(template, "priority", "MEDIUM")); task.put("scheduleDate", date.toString());
                    task.put("sourceMode", "DERIVED"); task.put("removed", false); tasks.add(task);
                    if (tasks.size() >= 1000) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CROP_PLAN_TOO_LARGE", "计划任务过多，请缩短周期或调整模板");
                }
            }
        }
        return tasks;
    }

    private List<Map<String, Object>> normalizedReviewedTasks(Map<String, Object> plan, Object rawTasks) {
        List<Map<String, Object>> original = Jsons.maps(mapper, plan.get("tasks"));
        if (rawTasks == null) return original;
        Map<String, Map<String, Object>> originals = new LinkedHashMap<>();
        original.forEach(task -> originals.put(Jsons.text(task, "taskKey", ""), task));
        List<Map<String, Object>> submitted = Jsons.maps(mapper, rawTasks);
        if (submitted.size() != original.size()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CROP_PLAN_TASKS_INVALID", "计划任务必须保留模板来源；如不执行请标记为移除");
        }
        List<Map<String, Object>> normalized = new ArrayList<>();
        for (Map<String, Object> candidate : submitted) {
            Map<String, Object> source = originals.get(Jsons.text(candidate, "taskKey", ""));
            if (source == null || !Objects.equals(source.get("templateRef"), candidate.get("templateRef"))) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "CROP_PLAN_TEMPLATE_INVALID", "计划任务的 Crop Pack 模板来源无效");
            }
            Map<String, Object> task = new LinkedHashMap<>(source);
            task.put("scheduleDate", parseDate(candidate.get("scheduleDate"), parseDate(source.get("scheduleDate"), LocalDate.now())).toString());
            task.put("priority", Jsons.text(candidate, "priority", Jsons.text(source, "priority", "MEDIUM")));
            task.put("removed", Jsons.bool(candidate, "removed", false));
            if (!Objects.equals(task.get("scheduleDate"), source.get("scheduleDate"))) task.put("scheduleSource", "USER_PROVIDED");
            normalized.add(task);
        }
        return normalized;
    }

    private String taskTitle(Map<String, Object> task) {
        return switch (Jsons.text(task, "actionType", "INSPECTION")) {
            case "IRRIGATION_CHECK" -> "检查灌溉需要";
            case "FERTILIZATION" -> "检查施肥安排";
            default -> "完成阶段巡田检查";
        };
    }

    private String dueAt(String date) {
        return parseDate(date, LocalDate.now()).atTime(17, 0).toInstant(ZoneOffset.UTC).toString();
    }

    private String firstStageCode(Map<String, Object> pack) {
        return Jsons.maps(mapper, pack.get("stages")).stream()
                .min(Comparator.comparingLong(stage -> Jsons.whole(stage, "sequence", Long.MAX_VALUE)))
                .map(stage -> Jsons.text(stage, "code", "")).orElse("");
    }

    private Map<String, Object> memberView(Map<String, Object> member, String farmId) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("userId", member.get("userId")); view.put("username", member.get("username"));
        view.put("displayName", Jsons.text(member, "displayName", Jsons.text(member, "username", "")));
        view.put("role", member.get("role")); view.put("roleLabel", RolePolicy.label(Jsons.text(member, "role", "")));
        view.put("farmIds", Jsons.strings(member.get("farmIds")));
        view.put("plotIds", Jsons.strings(member.get("plotIds")).stream().filter(plotId -> {
            Map<String, Object> plot = store.find("plot", plotId);
            return plot != null && farmId.equals(Jsons.text(plot, "farmId", ""));
        }).toList());
        view.put("status", Jsons.bool(member, "enabled", true) ? "ACTIVE" : "DISABLED");
        return view;
    }

    private List<String> validateMemberPlots(String farmId, Object rawPlotIds, UserPrincipal principal) {
        LinkedHashSet<String> requested = new LinkedHashSet<>(Jsons.strings(rawPlotIds));
        for (String plotId : requested) {
            Map<String, Object> plot = require("plot", plotId, "存在无效地块");
            if (!farmId.equals(Jsons.text(plot, "farmId", "")) || !engine.canAccessPlot(principal, plotId)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "MEMBER_SCOPE_FORBIDDEN", "只能分配当前农场内可管理的地块");
            }
            if ("INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE"))) {
                throw new ApiException(HttpStatus.CONFLICT, "PLOT_INACTIVE", "停用地块不能分配给成员");
            }
        }
        return new ArrayList<>(requested);
    }

    private Map<String, Object> managedPlot(String plotId, UserPrincipal principal) {
        Map<String, Object> plot = require("plot", plotId, "地块不存在");
        requireManagedFarm(Jsons.text(plot, "farmId", ""), principal);
        engine.ensurePlotAccess(principal, plotId);
        return plot;
    }

    private void requireManagedFarm(String farmId, UserPrincipal principal) {
        requireFarmAdmin(principal);
        requireVisibleFarm(farmId, principal);
    }

    private void requireVisibleFarm(String farmId, UserPrincipal principal) {
        if (farmId == null || farmId.isBlank() || !principal.canAccessFarm(farmId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权访问该农场");
        }
        if (store.find("farm", farmId) == null) throw new ApiException(HttpStatus.NOT_FOUND, "FARM_NOT_FOUND", "农场不存在");
    }

    private void requireFarmAdmin(UserPrincipal principal) {
        if (principal == null || !principal.isFarmAdmin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FARM_ADMIN_REQUIRED", "只有农场管理员可以执行此操作");
        }
    }

    private Map<String, Object> require(String type, String id, String message) {
        Map<String, Object> record = store.find(type, id);
        if (record == null) throw new ApiException(HttpStatus.NOT_FOUND, type.toUpperCase(Locale.ROOT).replace('-', '_') + "_NOT_FOUND", message);
        return record;
    }

    private String batchFarmId(Map<String, Object> batch) {
        String farmId = Jsons.text(batch, "farmId", "");
        if (!farmId.isBlank()) return farmId;
        Map<String, Object> plot = store.find("plot", Jsons.text(batch, "plotId", ""));
        return plot == null ? "" : Jsons.text(plot, "farmId", "");
    }

    private String deviceFarmId(Map<String, Object> device) {
        String farmId = Jsons.text(device, "farmId", "");
        if (!farmId.isBlank()) return farmId;
        Map<String, Object> plot = store.find("plot", Jsons.text(device, "plotId", ""));
        return plot == null ? "" : Jsons.text(plot, "farmId", "");
    }

    private String requiredText(Map<String, Object> input, String key, String message) {
        String value = Jsons.text(input, key, "").trim();
        if (value.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, key.toUpperCase(Locale.ROOT) + "_REQUIRED", message);
        return value;
    }

    private void validatePlot(Map<String, Object> plot) {
        if (Jsons.text(plot, "name", "").isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_NAME_REQUIRED", "请填写地块名称");
        if (Jsons.text(plot, "cropCode", "").isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_CROP_REQUIRED", "请选择作物种类");
        if (Jsons.text(plot, "cropVariety", "").isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_VARIETY_REQUIRED", "请填写作物品种");
        if (Jsons.number(plot, "areaM2", 0) <= 0) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_AREA_INVALID", "地块面积必须大于 0");
        if (Jsons.whole(plot, "growthCycleDays", 0) <= 0) throw new ApiException(HttpStatus.BAD_REQUEST, "PLOT_GROWTH_CYCLE_INVALID", "生长周期必须大于 0 天");
    }

    private LocalDate parseDate(Object value, LocalDate fallback) {
        if (value == null || String.valueOf(value).isBlank()) return fallback;
        String text = String.valueOf(value);
        try { return LocalDate.parse(text.length() >= 10 ? text.substring(0, 10) : text); }
        catch (Exception ignored) {
            try { return Instant.parse(text).atZone(ZoneOffset.UTC).toLocalDate(); }
            catch (Exception second) { throw new ApiException(HttpStatus.BAD_REQUEST, "DATE_INVALID", "日期格式无效"); }
        }
    }

    private Double nullableNumber(Map<String, Object> input, String key) {
        if (!input.containsKey(key) || input.get(key) == null || String.valueOf(input.get(key)).isBlank()) return null;
        try { return Double.parseDouble(String.valueOf(input.get(key))); }
        catch (Exception ignored) { throw new ApiException(HttpStatus.BAD_REQUEST, "NUMBER_INVALID", key + " 必须是数字"); }
    }

    private Object blankToNull(String value) { return value == null || value.isBlank() ? null : value; }

    private void publish(String type, Map<String, Object> payload) {
        events.publish(type, payload);
        store.logEvent(type, payload);
    }
}
