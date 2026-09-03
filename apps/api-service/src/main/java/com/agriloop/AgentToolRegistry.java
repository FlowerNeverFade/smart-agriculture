package com.agriloop;

import org.springframework.http.HttpStatus;

import java.util.*;
import java.util.regex.Pattern;

/**
 * The single allow-list for Agent capabilities.
 *
 * The registry is deliberately dependency-free.  It describes the public
 * contract and performs the checks that do not require a domain service.  The
 * domain methods still re-check authorization and safety gates at execution
 * time, so a model response can never become an unchecked command.
 */
final class AgentToolRegistry {
    private static final Set<String> ALL_ROLES = Set.of("FARMER", "FARM_ADMIN", "SYSTEM_ADMIN");
    private static final Set<String> FARM_ROLES = Set.of("FARMER", "FARM_ADMIN");
    private static final Set<String> FARM_ADMIN_ROLES = Set.of("FARM_ADMIN");
    private static final Set<String> SYSTEM_ROLES = Set.of("SYSTEM_ADMIN");
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_-]{0,119}");
    private static final Map<String, Definition> DEFINITIONS = buildDefinitions();

    private AgentToolRegistry() { }

    record Definition(String name, String title, String description, String sideEffect,
                      String riskLevel, boolean requiresConfirmation, String targetScope,
                      Set<String> roles, Map<String, Object> inputSchema,
                      Map<String, Object> navigation) {
        Map<String, Object> publicView() {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("name", name);
            result.put("title", title);
            result.put("description", description);
            result.put("sideEffect", sideEffect);
            result.put("riskLevel", riskLevel);
            result.put("requiresConfirmation", requiresConfirmation);
            result.put("targetScope", targetScope);
            result.put("roles", List.copyOf(roles));
            result.put("inputSchema", inputSchema);
            result.put("navigation", navigation);
            result.put("schemaVersion", "agent-tool-v2");
            return result;
        }
    }

    static Definition definition(String name) {
        return DEFINITIONS.get(name == null ? "" : name.trim());
    }

    static boolean registered(String name) {
        return definition(name) != null;
    }

    static boolean allowed(String name, UserPrincipal principal) {
        Definition definition = definition(name);
        return definition != null && principal != null && definition.roles().contains(RolePolicy.canonical(principal.role));
    }

    static List<Map<String, Object>> catalog(UserPrincipal principal) {
        if (principal == null) return List.of();
        return DEFINITIONS.values().stream()
                .filter(item -> allowed(item.name(), principal))
                .map(item -> {
                    Map<String, Object> view = item.publicView();
                    // A definition is shared by the three workspaces, but its
                    // destination must still be reachable by the current role.
                    // Keeping this mapping next to the allow-list prevents a
                    // catalog consumer from receiving a route that the client
                    // will (correctly) reject as out of scope.
                    view.put("navigation", routeFor(item.name(), RolePolicy.canonical(principal.role)));
                    return view;
                })
                .toList();
    }

    private static Map<String, Object> routeFor(String tool, String role) {
        String view = switch (tool) {
            // Farmer is a standalone shell with its own legacy view ids;
            // administrator workspaces use the shared role view registry.
            case "get_plot_status" -> "FARMER".equals(role) ? "plots" : "plot-detail";
            case "get_risk_forecast" -> "FARMER".equals(role) ? "tools"
                    : "FARM_ADMIN".equals(role) ? "decision-console" : "admin-overview";
            case "generate_irrigation_plan", "evaluate_diagnosis", "get_alerts" -> "FARMER".equals(role) ? "advice"
                    : "FARM_ADMIN".equals(role) ? "decision-console" : "admin-overview";
            case "get_today_work_items", "get_work_orders" -> "FARMER".equals(role) ? "tasks"
                    : "FARM_ADMIN".equals(role) ? "work-orders" : "admin-ops";
            case "get_water_resource_status" -> "FARMER".equals(role) ? "plots"
                    : "FARM_ADMIN".equals(role) ? "work-orders" : "admin-ops";
            case "get_devices" -> "FARMER".equals(role) ? "plots"
                    : "FARM_ADMIN".equals(role) ? "resource-coordination" : "admin-resources";
            case "get_crop_manual" -> "FARMER".equals(role) ? "tools"
                    : "FARM_ADMIN".equals(role) ? "rules-strategies" : "admin-rules";
            case "get_simulation_status" -> "SYSTEM_ADMIN".equals(role) ? "admin-simulator" : "resource-coordination";
            case "get_learning_cases", "get_strategy_candidates" -> "FARMER".equals(role) ? "tools"
                    : "FARM_ADMIN".equals(role) ? "rules-strategies" : "admin-rules";
            case "get_inspections" -> "FARMER".equals(role) ? "inspections"
                    : "FARM_ADMIN".equals(role) ? "work-orders" : "admin-ops";
            case "get_feedback" -> "FARMER".equals(role) ? "advice"
                    : "FARM_ADMIN".equals(role) ? "work-orders" : "admin-audit";
            case "get_execution_records" -> "FARMER".equals(role) ? "tasks"
                    : "FARM_ADMIN".equals(role) ? "work-orders" : "admin-ops";
            case "get_farm_members", "create_farm_member", "update_farm_member_scope", "update_farm_member_status", "delete_farm_member" -> "FARM_ADMIN".equals(role) ? "farm-members" : "admin-settings";
            case "get_user_accounts", "create_user_account", "update_user_account_status", "delete_user_account" -> "admin-settings";
            case "get_crop_packs", "get_rule_sets" -> "FARM_ADMIN".equals(role) ? "rules-strategies" : "admin-rules";
            case "get_farms" -> "admin-overview";
            case "get_telemetry" -> "FARMER".equals(role) ? "plots" : "plot-detail";
            case "get_platform_status" -> "admin-ops";
            case "get_platform_risk_overview", "get_farm_overview" -> "admin-overview";
            case "get_rule_strategy_status" -> "admin-rules";
            case "get_audit_records" -> "admin-audit";
            case "create_plot" -> "FARM_ADMIN".equals(role) ? "plot-detail" : "";
            case "update_plot" -> "plot-detail";
            case "set_plot_devices" -> "FARM_ADMIN".equals(role) ? "resource-coordination" : "admin-resources";
            case "create_and_assign_work_order", "assign_work_order", "transition_work_order", "review_work_order",
                    "transition_assigned_work_order" -> "FARMER".equals(role) ? "tasks" : "work-orders";
            case "publish_alert_verification", "close_alert", "execute_virtual_irrigation" -> "FARMER".equals(role) ? "advice"
                    : "FARM_ADMIN".equals(role) ? "decision-console" : "admin-ops";
            case "create_inspection_record", "create_evidence_request" -> "inspections";
            case "update_simulation_settings" -> "SYSTEM_ADMIN".equals(role) ? "admin-simulator" : "resource-coordination";
            case "review_learning_case", "transition_strategy_candidate" -> "admin-rules";
            default -> "";
        };
        return view.isBlank() ? Map.of() : route(view);
    }

    static void validate(String name, Map<String, Object> arguments, UserPrincipal principal) {
        Definition definition = definition(name);
        if (definition == null) throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_TOOL_NOT_REGISTERED", "该 Agent 工具未注册");
        if (!allowed(name, principal)) throw new ApiException(HttpStatus.FORBIDDEN, "AGENT_TOOL_NOT_ALLOWED", "当前身份不能使用该 Agent 工具");
        Map<String, Object> args = arguments == null ? Map.of() : arguments;
        Map<String, Object> schema = definition.inputSchema();
        for (String required : strings(schema.get("required"))) {
            Object value = args.get(required);
            if (value == null || String.valueOf(value).trim().isBlank()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_REQUIRED", "缺少参数：" + required);
            }
        }
        validateTypes(name, args);
        for (String key : List.of("farmId", "plotId", "deviceId", "workOrderId", "alertId", "planId", "candidateId", "caseId", "assigneeId", "userId")) {
            Object value = args.get(key);
            String text = value == null ? "" : String.valueOf(value).trim();
            if ("*".equals(text) && principal != null && principal.isSystemAdmin()) continue;
            if (value != null && !text.isBlank() && !IDENTIFIER.matcher(text).matches()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "参数格式无效：" + key);
            }
        }
        Object farm = args.get("farmId");
        if (farm != null && !String.valueOf(farm).isBlank() && !principal.canAccessFarm(String.valueOf(farm).trim())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "无权访问该农场");
        }
        Object plot = args.get("plotId");
        if (plot != null && !String.valueOf(plot).isBlank()
                && !principal.isFarmAdmin() && !principal.isSystemAdmin()
                && !principal.canAccessPlot(String.valueOf(plot).trim())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "PLOT_FORBIDDEN", "无权访问该地块");
        }
        if (args.containsKey("waterLitre")) {
            double water = number(args.get("waterLitre"), -1);
            if (!Double.isFinite(water) || water <= 0 || water > 5000) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "水量必须在 0 到 5000 L 之间");
            }
        }
        if (args.containsKey("durationSeconds")) {
            double duration = number(args.get("durationSeconds"), -1);
            if (!Double.isFinite(duration) || duration <= 0 || duration > 24 * 60 * 60) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "执行时长超出允许范围");
            }
        }
        if (args.containsKey("deviceIds") && !(args.get("deviceIds") instanceof Collection<?>)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "deviceIds 必须是数组");
        }
        if (args.get("deviceIds") instanceof Collection<?> devices) {
            if (devices.size() > 100) throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "设备数量超过上限");
            for (Object device : devices) {
                String id = String.valueOf(device == null ? "" : device).trim();
                if (!IDENTIFIER.matcher(id).matches()) throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "设备编号格式无效");
            }
        }
        if (args.containsKey("plotIds") && !(args.get("plotIds") instanceof Collection<?>)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "plotIds 必须是数组");
        }
        if (args.get("plotIds") instanceof Collection<?> plots) {
            if (plots.size() > 500) throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "地块数量超过上限");
            for (Object plotId : plots) {
                String id = String.valueOf(plotId == null ? "" : plotId).trim();
                if (!IDENTIFIER.matcher(id).matches()) throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "地块编号格式无效");
            }
        }
        if (args.containsKey("enabled") && !(args.get("enabled") instanceof Boolean)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "enabled 必须是布尔值");
        }
    }

    private static void validateTypes(String name, Map<String, Object> args) {
        for (String key : List.of("farmId", "plotId", "deviceId", "workOrderId", "alertId", "planId", "candidateId", "caseId", "assigneeId", "userId", "title", "name", "notes", "reason", "evidenceType", "decision", "target", "scenario", "dueAt", "resultSummary", "username", "password", "displayName", "role", "authorizationCode", "status", "scope")) {
            if (!args.containsKey(key) || args.get(key) == null) continue;
            if (!(args.get(key) instanceof CharSequence)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "参数必须是文本：" + key);
            }
            if (String.valueOf(args.get(key)).length() > 4000) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "参数长度超过上限：" + key);
            }
        }
        for (String key : List.of("waterLitre", "durationSeconds", "areaM2", "expectedRevision")) {
            if (!args.containsKey(key) || args.get(key) == null) continue;
            double value = number(args.get(key), Double.NaN);
            if (!Double.isFinite(value)) throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "数值参数无效：" + key);
        }
        String action = upper(args.get("action"));
        if (!action.isBlank() && "transition_assigned_work_order".equals(name)
                && !Set.of("START", "RESTART", "RESUME", "SUBMIT", "IN_PROGRESS", "SUBMITTED").contains(action)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "不支持的任务操作");
        }
        if (!action.isBlank() && "transition_work_order".equals(name)
                && !Set.of("CANCEL", "CANCELLED").contains(action)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "管理员任务操作目前只支持取消任务");
        }
        if (!action.isBlank() && "review_work_order".equals(name)
                && !Set.of("APPROVE", "ACCEPT", "DONE", "REJECT", "REJECTED").contains(action)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "任务验收只能选择通过或退回");
        }
        String decision = upper(args.get("decision"));
        if (!decision.isBlank() && "review_learning_case".equals(name)
                && !Set.of("QUALIFIED", "REJECTED", "QUALIFY", "REJECT", "APPROVE", "ACCEPT").contains(decision)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "审核结果只能是通过或驳回");
        }
        String target = upper(args.get("target"));
        if (!target.isBlank() && "transition_strategy_candidate".equals(name)
                && !Set.of("DRAFT", "OFFLINE_VALIDATED", "APPROVED", "ACTIVE", "REJECTED", "SUPERSEDED", "ROLLED_BACK").contains(target)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "策略状态无效");
        }
        String scenario = upper(args.get("scenario"));
        if (!scenario.isBlank() && "update_simulation_settings".equals(name)
                && !Set.of("NORMAL", "DROUGHT", "HEAVY_RAIN", "SENSOR_DRIFT", "DEVICE_OFFLINE", "HEAVY-RAIN", "SENSOR-DRIFT", "DEVICE-OFFLINE").contains(scenario)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "模拟场景无效");
        }
        String role = upper(args.get("role"));
        if (!role.isBlank() && "create_user_account".equals(name)
                && !Set.of("FARMER", "FARM_ADMIN", "SYSTEM_ADMIN").contains(role)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "账号角色无效");
        }
        if (Set.of("create_user_account", "update_user_account_status", "delete_user_account", "get_user_accounts").contains(name)
                && !"PLATFORM".equals(upper(args.get("scope")))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "AGENT_ARGUMENT_INVALID", "平台账号工具必须使用 PLATFORM 范围");
        }
    }

    private static String upper(Object value) {
        return value == null ? "" : String.valueOf(value).trim().toUpperCase(Locale.ROOT);
    }

    private static Map<String, Definition> buildDefinitions() {
        Map<String, Definition> definitions = new LinkedHashMap<>();
        add(definitions, read("get_plot_status", "读取地块状态", "读取最新遥测、设备和当前模拟场景", "PLOT", ALL_ROLES, route("plot-detail")));
        add(definitions, read("get_risk_forecast", "生成风险预测", "读取指定指标的短期风险预测", "PLOT", ALL_ROLES, route("plot-detail")));
        add(definitions, read("generate_irrigation_plan", "生成灌溉方案", "根据当前证据生成只读灌溉试算", "PLOT", FARM_ROLES, route("decision-console")));
        add(definitions, read("evaluate_diagnosis", "评估风险诊断", "结合遥测、设备和规则评估异常根因", "PLOT", ALL_ROLES, route("decision-console")));
        add(definitions, read("get_today_work_items", "汇总今日农务", "读取当前范围的任务与待办", "PLOT", ALL_ROLES, route("work-orders")));
        add(definitions, read("get_water_resource_status", "读取水资源状态", "读取农场水量余额和资源计划", "FARM", ALL_ROLES, route("work-orders")));
        add(definitions, read("get_platform_status", "读取平台状态", "读取数据库、消息链路和模型依赖状态", "PLATFORM", SYSTEM_ROLES, route("admin-ops")));
        add(definitions, read("get_platform_risk_overview", "汇总平台风险", "读取跨农场风险和待处理事项", "PLATFORM", SYSTEM_ROLES, route("admin-overview")));
        add(definitions, read("get_rule_strategy_status", "读取规则与策略", "读取 Crop Pack、规则和策略候选状态", "PLATFORM", SYSTEM_ROLES, route("admin-rules")));
        add(definitions, read("get_farm_overview", "汇总农场状态", "读取当前农场地块、告警、设备和任务", "FARM", Set.of("FARM_ADMIN", "SYSTEM_ADMIN"), route("dashboard")));
        add(definitions, read("get_devices", "读取设备状态", "读取授权范围内设备和绑定关系", "FARM", ALL_ROLES, route("resource-coordination")));
        add(definitions, read("get_alerts", "读取告警", "读取授权范围内告警和处理状态", "FARM", ALL_ROLES, route("decision-console")));
        add(definitions, read("get_work_orders", "读取任务", "读取授权范围内任务详情和状态", "FARM", ALL_ROLES, route("work-orders")));
        add(definitions, read("get_crop_manual", "读取作物手册", "读取当前作物包和培养手册", "PLOT", ALL_ROLES, route("tools")));
        add(definitions, read("get_simulation_status", "读取模拟状态", "读取地块模拟场景、参数和运行状态", "PLOT", Set.of("FARM_ADMIN", "SYSTEM_ADMIN"), route("resource-coordination")));
        add(definitions, read("get_learning_cases", "读取学习案例", "读取质量状态、学习用途和审计原因", "FARM", Set.of("FARM_ADMIN", "SYSTEM_ADMIN"), route("admin-rules")));
        add(definitions, read("get_strategy_candidates", "读取策略候选", "读取候选状态、证据和离线验证结果", "FARM", Set.of("FARM_ADMIN", "SYSTEM_ADMIN"), route("admin-rules")));
        add(definitions, read("get_audit_records", "读取审计记录", "读取 Agent、工具和治理审计记录", "PLATFORM", SYSTEM_ROLES, route("admin-audit")));
        add(definitions, read("get_inspections", "读取巡田记录", "读取授权范围内的现场观察、复测和设备核验记录", "FARM", ALL_ROLES, route("inspections")));
        add(definitions, read("get_feedback", "读取用户反馈", "读取当前角色和授权范围内的决策反馈", "FARM", ALL_ROLES, route("decision-console")));
        add(definitions, read("get_execution_records", "读取执行记录", "读取命令、确认、ACK 和效果评价的关联记录", "FARM", ALL_ROLES, route("work-orders")));
        add(definitions, read("get_farm_members", "读取农场成员", "读取授权农场的农户成员和地块范围", "FARM", Set.of("FARM_ADMIN", "SYSTEM_ADMIN"), route("farm-members")));
        add(definitions, read("get_user_accounts", "读取账号列表", "读取系统管理员可治理的账号、角色和授权范围", "PLATFORM", SYSTEM_ROLES, route("admin-settings")));
        add(definitions, read("get_crop_packs", "读取作物包", "读取授权农场可用的作物包版本和状态", "FARM", Set.of("FARM_ADMIN", "SYSTEM_ADMIN"), route("admin-rules")));
        add(definitions, read("get_rule_sets", "读取规则集", "读取授权农场的全局、农场和地块规则", "FARM", Set.of("FARM_ADMIN", "SYSTEM_ADMIN"), route("admin-rules")));
        add(definitions, read("get_farms", "读取农场列表", "读取当前系统管理员可治理的农场范围", "PLATFORM", SYSTEM_ROLES, route("admin-overview")));
        add(definitions, read("get_telemetry", "读取遥测历史", "读取指定地块的原始遥测和数据质量", "PLOT", ALL_ROLES, route("plot-detail")));

        add(definitions, mutation("create_plot", "新增地块", "创建一个新的农场地块", "FARM", FARM_ADMIN_ROLES, lowSchema(List.of("farmId", "name", "cropCode", "areaM2")), route("plots")));
        add(definitions, mutation("update_plot", "更新地块", "修改地块基础信息、类型或作物阶段", "PLOT", FARM_ADMIN_ROLES, lowSchema(List.of("plotId")), route("plot-detail")));
        add(definitions, mutation("set_plot_devices", "绑定设备", "更新地块与设备的绑定关系", "PLOT", FARM_ADMIN_ROLES, lowSchema(List.of("plotId", "deviceIds")), route("resource-coordination")));
        add(definitions, mutation("create_and_assign_work_order", "创建并下发任务", "创建农务任务并分配给授权农户", "PLOT", FARM_ADMIN_ROLES, lowSchema(List.of("farmId", "plotId", "title")), route("work-orders")));
        add(definitions, mutation("assign_work_order", "分派任务", "将已有任务分配或重新分配给授权农户", "PLOT", FARM_ADMIN_ROLES, lowSchema(List.of("workOrderId", "assigneeId")), route("work-orders")));
        add(definitions, mutation("transition_work_order", "取消任务", "由农场管理员取消尚未结束的任务", "PLOT", FARM_ADMIN_ROLES, lowSchema(List.of("workOrderId", "action")), route("work-orders"), "MEDIUM"));
        add(definitions, mutation("review_work_order", "验收任务", "验收农户提交的任务结果或退回补做", "PLOT", FARM_ADMIN_ROLES, lowSchema(List.of("workOrderId", "action")), route("work-orders"), "MEDIUM"));
        add(definitions, mutation("publish_alert_verification", "发布告警核查", "为告警创建核查任务", "PLOT", FARM_ADMIN_ROLES, lowSchema(List.of("alertId")), route("decision-console")));
        add(definitions, mutation("close_alert", "关闭告警", "关闭已完成处理的告警", "PLOT", FARM_ADMIN_ROLES, lowSchema(List.of("alertId")), route("decision-console")));
        add(definitions, mutation("transition_assigned_work_order", "更新本人任务", "开始、重新处理或提交本人被分配的任务", "PLOT", Set.of("FARMER"), lowSchema(List.of("workOrderId", "action")), route("work-orders"), "MEDIUM"));
        add(definitions, mutation("create_inspection_record", "提交巡田记录", "提交用户提供的现场观察记录", "PLOT", Set.of("FARMER"), lowSchema(List.of("plotId", "notes")), route("inspections")));
        add(definitions, mutation("create_evidence_request", "申请补证任务", "申请巡田、复测或设备检查", "PLOT", Set.of("FARMER"), lowSchema(List.of("plotId", "evidenceType")), route("inspections")));
        add(definitions, mutation("execute_virtual_irrigation", "执行虚拟灌溉", "在安全门通过并确认后执行虚拟灌溉", "PLOT", FARM_ROLES, lowSchema(List.of("plotId", "waterLitre", "durationSeconds")), route("decision-console"), "HIGH"));
        add(definitions, mutation("update_simulation_settings", "更新模拟策略", "修改当前地块的模拟场景或参数", "PLOT", Set.of("FARM_ADMIN", "SYSTEM_ADMIN"), lowSchema(List.of("plotId")), route("resource-coordination")));
        add(definitions, mutation("create_farm_member", "创建农户", "在授权农场创建种植农户账号并设置初始地块范围", "FARM", Set.of("FARM_ADMIN", "SYSTEM_ADMIN"), lowSchema(List.of("farmId", "username", "password")), route("farm-members")));
        add(definitions, mutation("update_farm_member_scope", "调整农户地块权限", "更新农户在指定农场负责的地块范围", "FARM", FARM_ADMIN_ROLES, lowSchema(List.of("userId", "farmId", "plotIds")), route("farm-members")));
        add(definitions, mutation("update_farm_member_status", "启停农户账号", "启用或停用指定农户账号", "FARM", Set.of("FARM_ADMIN", "SYSTEM_ADMIN"), lowSchema(List.of("userId", "farmId")), route("farm-members"), "MEDIUM"));
        add(definitions, mutation("delete_farm_member", "移除农场成员", "从当前农场移除农户及其地块授权", "FARM", FARM_ADMIN_ROLES, lowSchema(List.of("userId", "farmId")), route("farm-members"), "HIGH"));
        add(definitions, mutation("create_user_account", "创建系统账号", "由系统管理员创建农户、农场管理员或系统管理员账号", "PLATFORM", SYSTEM_ROLES, lowSchema(List.of("scope", "username", "password", "role")), route("admin-settings"), "MEDIUM"));
        add(definitions, mutation("update_user_account_status", "启停系统账号", "启用或停用系统管理员范围内的账号", "PLATFORM", SYSTEM_ROLES, lowSchema(List.of("scope", "userId", "enabled")), route("admin-settings"), "MEDIUM"));
        add(definitions, mutation("delete_user_account", "删除系统账号", "删除系统管理员范围内的非系统管理员账号", "PLATFORM", SYSTEM_ROLES, lowSchema(List.of("scope", "userId")), route("admin-settings"), "HIGH"));
        add(definitions, mutation("review_learning_case", "审核学习案例", "人工确认或驳回学习案例", "FARM", SYSTEM_ROLES, lowSchema(List.of("caseId", "decision")), route("admin-rules")));
        add(definitions, mutation("transition_strategy_candidate", "变更策略候选", "按状态机审核、启用或回滚策略候选", "FARM", SYSTEM_ROLES, lowSchema(List.of("candidateId", "target")), route("admin-rules"), "HIGH"));
        return Collections.unmodifiableMap(definitions);
    }

    private static Definition read(String name, String title, String description, String scope,
                                   Set<String> roles, Map<String, Object> navigation) {
        return new Definition(name, title, description, "READ_ONLY", "LOW", false, scope, roles,
                schemaForScope(scope), navigation);
    }

    private static Definition mutation(String name, String title, String description, String scope,
                                       Set<String> roles, Map<String, Object> schema,
                                       Map<String, Object> navigation) {
        return mutation(name, title, description, scope, roles, schema, navigation, "LOW");
    }

    private static Definition mutation(String name, String title, String description, String scope,
                                       Set<String> roles, Map<String, Object> schema,
                                       Map<String, Object> navigation, String risk) {
        return new Definition(name, title, description, "MUTATION_REQUIRES_CONFIRMATION", risk, true, scope, roles, schema, navigation);
    }

    private static Map<String, Object> lowSchema(List<String> required) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        Map<String, Object> properties = new LinkedHashMap<>();
        for (String field : required) properties.put(field, property(field));
        schema.put("properties", properties);
        schema.put("required", List.copyOf(required));
        schema.put("additionalProperties", true);
        return Collections.unmodifiableMap(schema);
    }

    private static Map<String, Object> property(String field) {
        return switch (field) {
            case "areaM2", "waterLitre", "durationSeconds", "expectedRevision" -> Map.of("type", "number");
            case "deviceIds", "plotIds", "caseIds", "evidenceCaseIds" -> Map.of(
                    "type", "array", "items", Map.of("type", "string"));
            case "enabled", "confirmed" -> Map.of("type", "boolean");
            case "action" -> Map.of("type", "string", "description", "要执行的受控状态动作");
            case "target" -> Map.of("type", "string", "description", "目标状态");
            case "decision" -> Map.of("type", "string", "description", "人工审核决定");
            case "scope" -> Map.of("type", "string", "enum", List.of("PLATFORM"));
            default -> Map.of("type", "string");
        };
    }

    private static Map<String, Object> schemaForScope(String scope) {
        return switch (scope) {
            case "PLATFORM" -> lowSchema(List.of("scope"));
            case "FARM" -> lowSchema(List.of("farmId"));
            default -> lowSchema(List.of("plotId"));
        };
    }

    private static Map<String, Object> route(String view) {
        return Map.of("view", view);
    }

    private static void add(Map<String, Definition> target, Definition definition) {
        target.put(definition.name(), definition);
    }

    private static List<String> strings(Object value) {
        if (value instanceof Collection<?> collection) return collection.stream().map(String::valueOf).toList();
        return value == null ? List.of() : List.of(String.valueOf(value));
    }

    private static double number(Object value, double fallback) {
        try { return value == null ? fallback : Double.parseDouble(String.valueOf(value)); }
        catch (RuntimeException ignored) { return fallback; }
    }
}
