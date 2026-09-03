-- AgriLoop virtual demonstration seed
--
-- This script is intentionally limited to deterministic, fictional records.
-- It contains no production telemetry, audit history, credentials from a
-- running installation, attachments, backups, or model output.
--
-- Properties:
--   * PostgreSQL-compatible SQL (the API migrations are applied first).
--   * Safe to execute repeatedly: existing rows are left unchanged.
--   * All identifiers are reserved for the isolated demonstration dataset.

BEGIN;

INSERT INTO entity_record(entity_type, entity_id, payload)
VALUES
('farm', 'farm-demo', $$
{"farmId":"farm-demo","name":"农智示范农场","ownerId":"user-admin","region":"重庆","defaults":{"waterPricePerLitre":0.004,"labourPricePerHour":35}}
$$),
('plot', 'plot-a01', $$
{"plotId":"plot-a01","farmId":"farm-demo","name":"温室1","areaM2":80,"riskLevel":"MEDIUM","cropCode":"tomato","status":"ACTIVE","location":{"lat":29.56,"lng":106.55}}
$$),
('plot', 'plot-a02', $$
{"plotId":"plot-a02","farmId":"farm-demo","name":"温室2","areaM2":100,"riskLevel":"MEDIUM","cropCode":"tomato","status":"ACTIVE","location":{"lat":29.561,"lng":106.551}}
$$),
('plot', 'plot-b01', $$
{"plotId":"plot-b01","farmId":"farm-demo","name":"温室3","areaM2":120,"riskLevel":"HIGH","cropCode":"cucumber","status":"ACTIVE","location":{"lat":29.562,"lng":106.552}}
$$),
('crop-batch', 'batch-plot-a01', $$
{"batchId":"batch-plot-a01","farmId":"farm-demo","plotId":"plot-a01","cropCode":"tomato","stageCode":"fruiting","cropPackVersion":"1.0.0","plantedAt":"2026-07-20T00:00:00Z"}
$$),
('crop-batch', 'batch-plot-a02', $$
{"batchId":"batch-plot-a02","farmId":"farm-demo","plotId":"plot-a02","cropCode":"tomato","stageCode":"fruiting","cropPackVersion":"1.0.0","plantedAt":"2026-07-20T00:00:00Z"}
$$),
('crop-batch', 'batch-plot-b01', $$
{"batchId":"batch-plot-b01","farmId":"farm-demo","plotId":"plot-b01","cropCode":"cucumber","stageCode":"fruiting","cropPackVersion":"1.0.0","plantedAt":"2026-07-20T00:00:00Z"}
$$),
('device', 'mock-plot-a01', $$
{"deviceId":"mock-plot-a01","farmId":"farm-demo","plotId":"plot-a01","bindingState":"BOUND","type":"ENVIRONMENTAL_SENSOR","status":"ONLINE","healthScore":0.98,"lastSeen":"2026-01-01T00:00:00Z"}
$$),
('device', 'mock-plot-a02', $$
{"deviceId":"mock-plot-a02","farmId":"farm-demo","plotId":"plot-a02","bindingState":"BOUND","type":"ENVIRONMENTAL_SENSOR","status":"ONLINE","healthScore":0.98,"lastSeen":"2026-01-01T00:00:00Z"}
$$),
('device', 'mock-plot-b01', $$
{"deviceId":"mock-plot-b01","farmId":"farm-demo","plotId":"plot-b01","bindingState":"BOUND","type":"ENVIRONMENTAL_SENSOR","status":"ONLINE","healthScore":0.98,"lastSeen":"2026-01-01T00:00:00Z"}
$$),
('resource-profile', 'resource-default', $$
{"resourcePlanId":"resource-default","farmId":"farm-demo","resourceType":"WATER","capacityLitres":900.0,"flowRateLitresPerMinute":18.0,"unitCost":0.004,"availableFrom":"2020-01-01T00:00:00Z","availableTo":"2099-12-31T23:59:59Z"}
$$),
('decision-case', 'case-seed-001', $$
{"caseId":"case-seed-001","traceId":"trace-seed-001","planId":"plan-seed-001","evaluationId":"eval-seed-001","plotId":"plot-a01","cropCode":"tomato","primaryCause":"WATER_DEFICIT","effectivenessScore":0.85,"quality":"GOOD","ruleVersion":"rules-v1","cropPackVersion":"1.0.0","fingerprint":"demo-case-001","qualityStatus":"PENDING","qualityScore":null,"selectionReason":["等待确定性质量判断"],"excludedReason":[],"learningUses":["NONE"],"accountId":"seed","farmId":"farm-demo","sourceSnapshot":{},"scenarioId":"","agentVersion":"rules-only","createdAt":"2026-01-01T00:00:00Z"}
$$),
('decision-case', 'case-seed-002', $$
{"caseId":"case-seed-002","traceId":"trace-seed-002","planId":"plan-seed-002","evaluationId":"eval-seed-002","plotId":"plot-b01","cropCode":"cucumber","primaryCause":"WATER_DEFICIT","effectivenessScore":0.78,"quality":"GOOD","ruleVersion":"rules-v1","cropPackVersion":"1.0.0","fingerprint":"demo-case-002","qualityStatus":"PENDING","qualityScore":null,"selectionReason":["等待确定性质量判断"],"excludedReason":[],"learningUses":["NONE"],"accountId":"seed","farmId":"farm-demo","sourceSnapshot":{},"scenarioId":"","agentVersion":"rules-only","createdAt":"2026-01-01T00:00:00Z"}
$$),
('decision-case', 'case-seed-003', $$
{"caseId":"case-seed-003","traceId":"trace-seed-003","planId":"plan-seed-003","evaluationId":"eval-seed-003","plotId":"plot-a02","cropCode":"tomato","primaryCause":"SENSOR_DRIFT","effectivenessScore":0.72,"quality":"GOOD","ruleVersion":"rules-v1","cropPackVersion":"1.0.0","fingerprint":"demo-case-003","qualityStatus":"PENDING","qualityScore":null,"selectionReason":["等待确定性质量判断"],"excludedReason":[],"learningUses":["NONE"],"accountId":"seed","farmId":"farm-demo","sourceSnapshot":{},"scenarioId":"","agentVersion":"rules-only","createdAt":"2026-01-01T00:00:00Z"}
$$)
ON CONFLICT (entity_type, entity_id) DO NOTHING;

-- BCrypt (cost 10) for the documented temporary password: demo123.
-- The same hash is used only for these fictional accounts.
INSERT INTO user_account(
    user_id, username, password_hash, role_code, farm_ids, plot_ids,
    enabled, recovery_code_hash, credential_version
)
VALUES
('user-farmer', 'farmer', '$2b$10$6/dfkYMW/.v7dNX46SYX1.Kci9DaDksD54Pbf6zx7bDPIfM3HpS7m', 'FARMER', 'farm-demo', 'plot-a01,plot-a02', TRUE, NULL, 1),
('user-admin', 'admin', '$2b$10$6/dfkYMW/.v7dNX46SYX1.Kci9DaDksD54Pbf6zx7bDPIfM3HpS7m', 'FARM_ADMIN', 'farm-demo', 'plot-a01,plot-a02,plot-b01', TRUE, NULL, 1),
('user-system', 'sysadmin', '$2b$10$6/dfkYMW/.v7dNX46SYX1.Kci9DaDksD54Pbf6zx7bDPIfM3HpS7m', 'SYSTEM_ADMIN', 'farm-demo', '*', TRUE, NULL, 1)
ON CONFLICT DO NOTHING;

COMMIT;
