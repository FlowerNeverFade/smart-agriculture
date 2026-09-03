/**
 * Normalisation helpers for the formal (backend-backed) session.
 *
 * The demo session intentionally uses mock-data.js.  These helpers never
 * read that module: they turn REST records into the small view models used
 * by the farmer and workbench shells, so a write made by one role can be
 * read by the other roles after the next refresh/SSE invalidation.
 */

const WORK_STATUS_ALIASES = Object.freeze({
  PENDING: 'OPEN',
  NEW: 'OPEN',
  CLAIMED: 'ASSIGNED',
  COMPLETED: 'DONE'
});

const CROP_LABELS = Object.freeze({
  tomato: '番茄',
  corn: '玉米',
  cucumber: '黄瓜',
  rice: '水稻',
  sunflower: '向日葵',
  strawberry: '草莓',
  pepper: '辣椒'
});

const STATUS_LABELS = Object.freeze({
  OPEN: '待分配',
  ASSIGNED: '待执行',
  IN_PROGRESS: '执行中',
  SUBMITTED: '待验收',
  REJECTED: '需返工',
  DONE: '已完成',
  CANCELLED: '已取消'
});

// Stable codes stay in the API and in CSS class names, but they should not
// leak into a user-facing card.  Keep the dictionaries here so the farmer,
// farm-admin and system-admin shells all render the same concise wording.
const SERVICE_STATUS_LABELS = Object.freeze({
  UP: '正常', ONLINE: '正常', HEALTHY: '正常', ACTIVE: '运行中', RUNNING: '运行中',
  DEGRADED: '降级', DOWN: '离线', OFFLINE: '离线', STOPPED: '已停止', INACTIVE: '已停用',
  ERROR: '异常', FAILED: '失败', SUCCESS: '成功', SUCCEEDED: '成功', PARTIAL: '部分完成',
  TIMEOUT: '超时', PASS: '通过', APPROVED: '已批准', REJECT: '否决', REJECTED: '已拒绝',
  ACK: '已确认', ACKED: '已确认', ACKNOWLEDGED: '已确认', DONE: '已完成', COMPLETED: '已完成',
  REVIEW: '待复核', READY: '就绪', RESET: '已重置', UNKNOWN: '未知', UNAVAILABLE: '不可用', AVAILABLE: '可用',
  GOOD: '正常', PENDING: '待处理', TODO: '待处理', COMPUTED: '已生成', ALLOCATED: '已分配',
  FEASIBLE: '可执行', INFEASIBLE: '不可满足', RECORDED: '已记录', PUBLISHED: '已发布', DRAFT: '草稿',
  IN_PROGRESS: '进行中', SUBMITTED: '待验收', OPEN: '待处理', VALIDATED: '已验证', VERIFIED: '已验证',
  ROLLED_BACK: '已回滚', CANCELLED: '已取消', ABORTED: '已中止', NOT_CONFIGURED: '未配置',
  DEMO_SESSION: '演示会话', BACKEND_OFFLINE: '后端离线', FAIL: '失败',
  HUMAN_REVIEW: '人工复核', NEEDS_EVIDENCE: '需要补证', INCONCLUSIVE: '无法判定', NOT_APPLICABLE: '不适用',
  BOUND: '已绑定', UNBOUND: '未绑定', NOT_BOUND: '未绑定', ENABLED: '已启用', DISABLED: '已停用'
});

const SERVICE_NAME_LABELS = Object.freeze({
  POSTGRESQL: '关系型数据库',
  REDIS: '高速消息流', REDIS_STREAMS: '高速消息流',
  MQTT: '设备消息代理', MQTT_BROKER: '设备消息代理',
  SSE: '实时推送服务', SSE_GATEWAY: '实时推送服务',
  API: '接口服务', API_SERVICE: '接口服务',
  AI: '智能模型服务', LLM: '智能模型服务', QWEN_LLM: '智能模型服务',
  SIMULATOR: '遥测模拟器', SIMULATION: '遥测模拟器',
  DATABASE: '数据库服务', STORAGE: '存储服务', MESSAGING: '消息服务'
});

const MODE_LABELS = Object.freeze({
  FULL: '完整模式', RULES_ONLY: '规则兜底', MOCK: '模拟模式', DEMO: '演示模式',
  OPENAI: '智能模型', OPENAI_COMPATIBLE: '智能模型', STANDALONE: '独立模式',
  RUNNING: '运行中', STOPPED: '已停止', AVAILABLE: '可用', UNAVAILABLE: '不可用',
  H2_STANDALONE: '本地持久化数据库', POSTGRESQL: '生产数据库',
  SIMULATED: '模拟模式', SIMULATION_ONLY: '仅模拟', USER_PROVIDED: '人工提供'
});

const ALERT_STATUS_LABELS = Object.freeze({
  ACTIVE: '未处理', OPEN: '未处理', UNACKNOWLEDGED: '未处理', ESCALATED: '已升级',
  ACK: '已确认', ACKED: '已确认', ACKNOWLEDGED: '已确认', CLOSED: '已关闭', RESOLVED: '已解决'
});

const SOURCE_LABELS = Object.freeze({
  BACKEND: '后端数据', API: '接口数据',
  SIMULATED: '模拟数据', SIMULATION: '模拟数据', MOCK: '演示数据',
  REAL: '真实设备', HARDWARE: '硬件数据',
  OBSERVED: '现场观测', USER_PROVIDED: '人工提供', DERIVED: '推导结果',
  ESTIMATED: '估算结果', RULE: '规则引擎', RULES: '规则引擎',
  AI: '智能模型', LLM: '智能模型', AGENT: '智能助手', ACCOUNT: '正式账号', SYSTEM: '系统',
  MANUAL: '人工录入', CROP_PLAN: '生产计划', READINESS: '补证请求', DEVICE_HEALTH: '设备检查',
  HUMAN_OBSERVATION: '人工观察', FIELD_INSPECTION: '现场巡田', CORE_AI: '智能内核',
  LEARNING: '案例学习', RULES_FAST_PATH: '安全澄清', SENSOR: '传感器', DEVICE: '设备',
  SOIL_MOISTURE: '土壤湿度', DEVICE_FRESHNESS: '设备数据新鲜度',
  WATER_DEFICIT_RULE: '缺水规则', SENSOR_DRIFT_RULE: '传感器漂移规则',
  DEVICE_FAULT_RULE: '设备异常规则', HEAT_STRESS_RULE: '高温胁迫规则',
  CROP_PACK: '作物模型包', PRESCRIPTION: '灌溉处方', FORECAST: '风险预测',
  WORK_ORDER: '农务工单', INSPECTION: '巡田记录',
  SIMULATOR: '模拟器', CONFIG: '系统配置', CONFIG_CHANGE: '配置变更'
});

const SCENARIO_LABELS = Object.freeze({
  NORMAL: '正常运行', NORMAL_RUN: '正常运行',
  DROUGHT: '干旱场景', HEAT_WAVE: '干旱场景',
  HEAVY_RAIN: '暴雨场景', HEAVYRAIN: '暴雨场景', STORM: '暴雨场景', RAIN: '暴雨场景',
  SENSOR_DRIFT: '传感器漂移', DEVICE_OFFLINE: '设备离线', OFFLINE: '设备离线',
  EVIDENCE_CONFLICT: '证据冲突',
  MULTI_SCENARIO: '多场景',
  PLOT_SCOPED: '按地块运行'
});

const SCENARIO_CODE_ALIASES = Object.freeze({
  STORM: 'HEAVY_RAIN', HEAVYRAIN: 'HEAVY_RAIN', RAIN: 'HEAVY_RAIN',
  OFFLINE: 'DEVICE_OFFLINE', DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  SENSOR_DRIFT: 'SENSOR_DRIFT', NORMAL_RUN: 'NORMAL',
  HEAT_WAVE: 'DROUGHT'
});

const PRIORITY_LABELS = Object.freeze({
  CRITICAL: '紧急', HIGH: '高', MEDIUM: '中', LOW: '低', NORMAL: '普通'
});

const LEVEL_LABELS = Object.freeze({
  CRITICAL: '严重', FATAL: '严重', ERROR: '错误', DANGER: '告警',
  ALERT: '告警', WARNING: '警告', WARN: '预警', INFO: '信息', NOTICE: '提示',
  HIGH: '高', MEDIUM: '中', LOW: '低', NORMAL: '正常'
});

const METRIC_STATUS_LABELS = Object.freeze({
  GOOD: '正常', NORMAL: '正常', OK: '正常', ONLINE: '在线',
  WARN: '预警', WARNING: '预警', ALERT: '告警', HIGH: '偏高', LOW: '偏低',
  DEGRADED: '降级', BAD: '异常', ERROR: '异常', OFFLINE: '离线',
  SUPPORTED: '已接入', SIMULATION_ONLY: '仅模拟', AVAILABLE: '可用',
  UNAVAILABLE: '不可用', UNKNOWN: '未知', PASS: '通过', FAIL: '失败', PENDING: '待处理'
});

const DEVICE_TYPE_LABELS = Object.freeze({
  ENVIRONMENTAL_SENSOR: '环境传感器', IRRIGATION_CONTROLLER: '灌溉控制器',
  FLOW_METER: '流量计', WEATHER_STATION: '气象站', CAMERA: '摄像头',
  GATEWAY: '网关', EDGE_GATEWAY: '边缘网关', WATER_PUMP: '水泵',
  SENSOR: '传感器', SOIL_SENSOR: '土壤传感器', SOIL_MOISTURE_SENSOR: '土壤湿度传感器',
  TEMPERATURE_HUMIDITY_SENSOR: '温湿度传感器', IRRIGATION_ACTUATOR: '灌溉执行器',
  ACTUATOR: '执行器', POWER_METER: '电力计量器'
});

const RESOURCE_TYPE_LABELS = Object.freeze({
  WATER: '水资源', WATER_RESOURCE: '水资源', ELECTRICITY: '电力', LABOUR: '人工工时',
  LABOR: '人工工时', FERTILIZER: '肥料', UNKNOWN: '资源'
});

const METRIC_LABELS = Object.freeze({
  SOIL_MOISTURE: '土壤湿度', SOIL_HUMIDITY: '土壤湿度', SOIL_TEMPERATURE: '土壤温度',
  AIR_TEMPERATURE: '空气温度', AIR_TEMP: '空气温度', TEMPERATURE: '温度',
  AIR_HUMIDITY: '空气湿度', HUMIDITY: '湿度', LIGHT: '光照', LIGHT_INTENSITY: '光照',
  ILLUMINANCE: '光照', CO2: '二氧化碳', CO2_CONCENTRATION: '二氧化碳',
  CARBON_DIOXIDE: '二氧化碳', SOIL_EC: '土壤电导率', EC: '电导率',
  ELECTRICAL_CONDUCTIVITY: '电导率', NITROGEN: '速效氮', PHOSPHORUS: '速效磷', POTASSIUM: '速效钾', PH: '酸碱度',
  SOIL_PH: '土壤酸碱度', WATER_LEVEL: '水位', WATER_FLOW: '水流量',
  FLOW_RATE: '流量', WIND_SPEED: '风速', RAINFALL: '降雨量',
  DATA_FRESHNESS: '数据新鲜度', DEVICE_HEALTH: '设备健康',
  WATER_DEFICIT: '缺水风险', HEAT_STRESS: '高温胁迫', COLD_STRESS: '低温冷害',
  DEVICE_FAULT: '设备异常', SENSOR_DRIFT: '传感器漂移'
});

function code(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function preserveChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value || ''));
}

export function serviceNameLabel(value, fallback = '服务') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw) && !/[A-Za-z]{2,}/.test(raw.split(/[（(]/)[0])) return raw;
  return SERVICE_NAME_LABELS[code(raw)] || fallback;
}

export function modeLabel(value, fallback = '未知模式') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw)) return raw;
  return MODE_LABELS[code(raw)] || fallback;
}

/** Generic status wording for cards that do not have a narrower domain. */
export function statusLabel(value, fallback = '未知') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw)) return raw;
  return SERVICE_STATUS_LABELS[code(raw)] || ALERT_STATUS_LABELS[code(raw)] || fallback;
}

export function serviceStatusLabel(value, fallback = '未知') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw)) return raw;
  return SERVICE_STATUS_LABELS[code(raw)] || fallback;
}

export function alertStatusLabel(value, fallback = '未知') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw)) return raw;
  return ALERT_STATUS_LABELS[code(raw)] || statusLabel(raw, fallback);
}

export function sourceLabel(value, fallback = '—') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  // Composite source labels such as "SIMULATED · 演示数据" are common in
  // older payloads.  Use the readable part and avoid repeating the code.
  const parts = raw.split(/[·|/]+/).map((part) => part.trim()).filter(Boolean);
  const mapped = SOURCE_LABELS[code(parts[0] || raw)];
  if (mapped) {
    const readableTail = parts.slice(1).find((part) => preserveChinese(part));
    return readableTail && readableTail !== mapped ? `${mapped} · ${readableTail}` : mapped;
  }
  if (preserveChinese(raw)) return raw;
  return parts.length > 1 && preserveChinese(parts[1]) ? parts[1] : fallback;
}

export function scenarioLabel(value, fallback = '未设置') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw)) return raw;
  const normalized = code(raw);
  if (SCENARIO_LABELS[normalized]) return SCENARIO_LABELS[normalized];
  if (normalized.startsWith('MULTI_SCENARIO')) {
    const count = raw.match(/\d+/)?.[0];
    return count ? `多场景（${count}）` : '多场景';
  }
  return fallback;
}

function normalizedScenarioCode(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = code(raw);
  if (SCENARIO_CODE_ALIASES[normalized]) return SCENARIO_CODE_ALIASES[normalized];
  if (SCENARIO_LABELS[normalized] && !normalized.startsWith('MULTI_SCENARIO')) return normalized;
  // Scenario IDs may include a replay/run suffix (for example
  // `drought-20260902-01`). Keep only the recognized scenario prefix.
  const known = Object.keys(SCENARIO_LABELS)
    .filter((item) => !['MULTI_SCENARIO', 'PLOT_SCOPED'].includes(item))
    .sort((left, right) => right.length - left.length);
  return known.find((item) => normalized.startsWith(`${item}_`)) || '';
}

/**
 * Resolve the scenario shown in a platform overview without inventing a
 * global value. The simulator itself is global, while strategies are stored
 * per plot, so plot values are authoritative whenever they are available.
 */
export function simulationScenarioSummary({ plots = [], overviewPlots = [], simulator = {} } = {}) {
  const scenariosByPlot = new Map();
  let anonymousIndex = 0;
  const collect = (items) => {
    if (!Array.isArray(items)) return;
    items.forEach((plot) => {
      if (code(plot?.status) === 'INACTIVE') return;
      const simulation = plot?.simulation || plot?.simulationConfig || {};
      const scenario = [
        simulation.scenario,
        simulation.scenarioId,
        plot?.simulationScenario,
        plot?.scenario,
        plot?.scenarioId
      ].map(normalizedScenarioCode).find(Boolean);
      if (!scenario) return;
      const plotKey = String(plot?.plotId || plot?.id || `anonymous-${anonymousIndex++}`);
      // `plots` is normally the normalized/authoritative list; the overview
      // cards are a fallback when the slower /plots request has not settled.
      if (!scenariosByPlot.has(plotKey)) scenariosByPlot.set(plotKey, scenario);
    });
  };
  collect(plots);
  collect(overviewPlots);

  const scenarios = [...new Set(scenariosByPlot.values())];
  if (scenarios.length === 1) return scenarios[0];
  if (scenarios.length > 1) return `多场景（${scenarios.length}）`;

  const globalScenario = [simulator?.scenario, simulator?.scenarioId]
    .map(normalizedScenarioCode)
    .find(Boolean);
  if (globalScenario) return globalScenario;

  // The status endpoint does not always include the active scenario. When
  // plot snapshots are still loading, use the latest running simulator
  // record as a traceable fallback instead of showing an empty overview.
  const historyRuns = Array.isArray(simulator?.history) ? simulator.history : [];
  const historyScenario = historyRuns
    .find((run) => code(run?.status) === 'RUNNING' && (run?.scenario || run?.scenarioId))
    || historyRuns.find((run) => run?.scenario || run?.scenarioId);
  const historicalScenario = normalizedScenarioCode(historyScenario?.scenario || historyScenario?.scenarioId);
  if (historicalScenario) return historicalScenario;

  const status = code(simulator?.status);
  return simulator?.running === true || status === 'RUNNING' ? 'PLOT_SCOPED' : '';
}

export function priorityLabel(value, fallback = '普通') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw)) return raw;
  return PRIORITY_LABELS[code(raw)] || fallback;
}

export function levelLabel(value, fallback = '提示') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw)) return raw;
  return LEVEL_LABELS[code(raw)] || fallback;
}

export function metricStatusLabel(value, fallback = '未知') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw)) return raw;
  return METRIC_STATUS_LABELS[code(raw)] || fallback;
}

export function metricLabel(value, fallback = '未知指标') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw)) return raw;
  return METRIC_LABELS[code(raw)] || fallback;
}

export function deviceTypeLabel(value, fallback = '类型未知') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw)) return raw;
  return DEVICE_TYPE_LABELS[code(raw)] || fallback;
}

export function resourceTypeLabel(value, fallback = '资源') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parts = raw.split(/[（(·|/]+/).map((part) => part.trim()).filter(Boolean);
  const mapped = RESOURCE_TYPE_LABELS[code(parts[0] || raw)];
  if (mapped) {
    const readableTail = raw.match(/[（(].*?[）)]/)?.[0] || parts.slice(1).find((part) => preserveChinese(part));
    return readableTail ? `${mapped}${readableTail}` : mapped;
  }
  if (preserveChinese(raw)) return raw;
  return fallback;
}

export function provenanceLabel(value, fallback = '—') {
  return sourceLabel(value, fallback);
}

export function eventTypeLabel(value, fallback = '系统事件') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (preserveChinese(raw)) return raw;
  const normalized = raw.toUpperCase().replace(/[._\s]+/g, '-');
  const labels = {
    DIAGNOSIS: '诊断', READINESS: '就绪度', 'IRRIGATION-PLAN': '灌溉处方',
    COMMAND: '控制命令', EVALUATION: '效果评价', PRESCRIPTION: '灌溉处方', INSPECTION: '巡田',
    'WORK-ORDER': '农务工单', ALERT: '告警', LOGIN: '登录', AUTH: '身份验证',
    TELEMETRY: '遥测更新', 'TELEMETRY-RECEIVED': '遥测更新', HEARTBEAT: '设备心跳',
    'DEVICE-HEARTBEAT': '设备心跳', 'SCENARIO-TELEMETRY': '情景数据',
    'DEVICE-CHECK': '设备检查', 'CONFIG-CHANGE': '配置变更', 'RULE-PUBLISH': '规则发布',
    SYSTEM: '系统事件'
  };
  return labels[normalized] || labels[normalized.replace(/-.*$/, '')] || fallback;
}

// Translate technical tokens when they appear inside a sentence supplied by
// the backend or by the demo fixture.  API/CSS identifiers remain untouched;
// this helper is only used at presentation boundaries (cards, timelines and
// chat metadata), so trace IDs and machine-readable payloads stay stable.
const DISPLAY_TOKEN_LABELS = Object.freeze({
  WATER_DEFICIT: '缺水风险', HEAT_STRESS: '高温胁迫', COLD_STRESS: '低温冷害',
  DEVICE_FAULT: '设备异常', SENSOR_DRIFT: '传感器漂移', SOIL_MOISTURE: '土壤湿度',
  AIR_TEMPERATURE: '空气温度', AIR_HUMIDITY: '空气湿度', WATER_LEVEL: '水位',
  SOIL_EC: '土壤电导率', NITROGEN: '速效氮', PHOSPHORUS: '速效磷', POTASSIUM: '速效钾', RAINFALL: '降雨量',
  DIAGNOSIS: '诊断', PRESCRIPTION: '处方', FORECAST: '预测', PREDICTION: '预测',
  COMMAND: '命令', EVALUATION: '评价', INSPECTION: '巡田', DEVICE_CHECK: '设备检查',
  WORK_ORDER: '农务工单', CROP_PACK: '作物模型包', CORE_AI: '智能内核',
  BACKEND: '后端', SIMULATED: '模拟', SIMULATION: '模拟', MOCK: '演示',
  HARDWARE: '硬件', REAL: '真实设备', USER_PROVIDED: '人工提供', DERIVED: '推导',
  ESTIMATED: '估算', OBSERVED: '现场观测', RULES_ONLY: '规则兜底', FULL: '完整模式',
  READY: '就绪', PENDING: '待处理', OPEN: '待处理', ASSIGNED: '已分配',
  IN_PROGRESS: '进行中', SUBMITTED: '待验收', COMPLETED: '已完成', DONE: '已完成',
  FAILED: '失败', ERROR: '异常', OFFLINE: '离线', ONLINE: '在线', ACTIVE: '运行中',
  INACTIVE: '已停用', HEALTHY: '健康', WARNING: '警告', CRITICAL: '严重',
  HIGH: '高', MEDIUM: '中', LOW: '低', GOOD: '正常', BAD: '异常', DEGRADED: '降级',
  UP: '正常', DOWN: '离线', ACK: '执行回执', ACKED: '已确认', BOUND: '已绑定', UNBOUND: '未绑定',
  NO_ACTION: '无干预', SIMULATION_ONLY: '仅模拟',
  SECURITY: '安全', SYSTEM: '系统', LOGIN: '登录', CONFIG: '配置',
  AGENT: '智能助手', AI: '智能模型', LLM: '大语言模型', RAG: '知识检索',
  SCHEMA: '数据规范', REGISTRY: '注册表', CONSOLE: '控制台', FORECASTING: '预测',
  DEMONSTRATION: '示范品种', GREENHOUSE: '设施栽培', SUPERVISOR: '控制服务'
});

export function displayText(value, fallback = '—') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  let result = raw
    .replace(/\bTime-to-Risk\b/gi, '风险到达时间')
    .replace(/\bCrop\s+Pack\b/gi, '作物模型包')
    .replace(/\bWith\s+Action\b/gi, '有干预')
    .replace(/\bNo\s+Action\b/gi, '无干预')
    .replace(/\bRules[- ]only\b/gi, '规则兜底')
    .replace(/\bOpenAI(?:-compatible)?\b/gi, '智能模型')
    .replace(/\bN\/A\b/gi, '无')
    .replace(/(\d+)\s*m\s*(\d+)\s*s\b/gi, '$1 分 $2 秒')
    .replace(/(\d+(?:\.\d+)?)\s*L\s*\/\s*min\b/gi, '$1 升/分钟')
    .replace(/(\d+(?:\.\d+)?)\s*L\b/gi, '$1 升')
    .replace(/(\d+(?:\.\d+)?)\s*kWh\b/gi, '$1 千瓦时')
    .replace(/(\d+(?:\.\d+)?)\s*ms\b/gi, '$1 毫秒')
    .replace(/(\d+(?:\.\d+)?)\s*min\b/gi, '$1 分钟')
    .replace(/(\d+(?:\.\d+)?)\s*m(?=\d|\b)/gi, '$1 分钟')
    .replace(/(\d+(?:\.\d+)?)\s*s\b/gi, '$1 秒')
    .replace(/(\d+(?:\.\d+)?)\s*h\b/gi, '$1 小时')
    .replace(/\/h\b/gi, '/小时')
    .replace(/\bvs\.?\b/gi, '与');
  Object.entries(DISPLAY_TOKEN_LABELS)
    .sort(([left], [right]) => right.length - left.length)
    .forEach(([token, label]) => {
      result = result.replace(new RegExp(`\\b${token}\\b`, 'gi'), label);
    });
  return result;
}

/**
 * The API keeps a short deterministic `summary` for cards and audits, while
 * `narrative` is the answer intended for a person to read.  Always prefer the
 * latter in the chat surfaces so a successful LLM response is not replaced by
 * the generic intent summary.
 */
export function agentResponseText(response = {}, fallback = '') {
  for (const candidate of [response?.narrative, response?.summary, response?.message]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const cleaned = candidate.trim()
        .replace(/^\s*#{1,6}\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/__(.*?)__/g, '$1')
        .replace(/__/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^\s*[-*]\s+/gm, '• ');
      return displayText(cleaned, fallback);
    }
  }
  return displayText(fallback, fallback);
}

/**
 * Older image requests accidentally persisted the private model prompt as the
 * user's message. Trim that scaffolding when restoring a conversation while
 * leaving normal questions untouched.
 */
export function agentHistoryUserText(value, fallback = '已上传现场图片') {
  const raw = value === undefined || value === null
    ? ''
    : String(value).replace(/\r/g, '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
  if (!raw) return fallback;
  const marker = raw.search(/\s*(?:图片|图像)(?:会|将)(?:(?:随(?:本次)?请求)|(?:以原文件字节)|直接)?(?:直接)?送入视觉模型[\s\S]*$/i);
  if (marker >= 0) return raw.slice(0, marker).trim() || fallback;
  return raw;
}

export function agentResponseSource(response = {}, sessionMode = 'live') {
  // Offline/demo data is explicit so it cannot be mistaken for a live model.
  if (sessionMode !== 'live') return '演示助手（未连接模型）';
  const adapter = String(response?.adapter || '').trim().toLowerCase();
  if (adapter === 'openai-compatible' && response?.degraded === false) return '实时模型回答';
  if (adapter === 'mock') return '演示助手（未连接模型）';
  if (response?.degraded) return '安全降级回答';
  if (adapter === 'rules-fast-path' || adapter === 'deterministic-guard') return '安全澄清';
  if (adapter === 'rules-agent') return '受控操作预览';
  return '智能助手';
}

const AGENT_INTENT_LABELS = Object.freeze({
  IRRIGATION_RECOMMENDATION: '灌溉建议',
  DIAGNOSIS: '风险诊断',
  RISK_DIAGNOSIS: '风险诊断',
  RISK_FORECAST: '风险预测',
  PLATFORM_STATUS: '平台状态',
  PLATFORM_OVERVIEW: '平台风险概览',
  FARM_OVERVIEW: '农场风险概览',
  RULE_STRATEGY_STATUS: '规则与策略状态',
  DEVICE_STATUS: '设备状态',
  ALERT_STATUS: '告警状态',
  WORK_ORDER_STATUS: '任务状态',
  CROP_MANUAL: '作物培养手册',
  SIMULATION_STATUS: '模拟状态',
  LEARNING_CASES: '学习案例',
  STRATEGY_CANDIDATES: '策略候选',
  AUDIT_RECORDS: '审计记录',
  TODAY_WORK: '今日农务',
  PLOT_STATUS: '地块状态',
  IMAGE_ANALYSIS: '图片分析',
  GREETING: '问候',
  CLARIFICATION: '澄清',
  CAPABILITY_QUERY: '能力说明',
  FOLLOW_UP: '追问',
  RETEST_CHECKLIST: '复测清单'
});

const AGENT_ROLE_LABELS = Object.freeze({
  FARMER: '种植农户',
  FARM_ADMIN: '农场管理员',
  SYSTEM_ADMIN: '系统管理员'
});

const AGENT_PROVENANCE_LABELS = Object.freeze({
  OBSERVED: '观测',
  RETRIEVED: '检索',
  DERIVED: '推导',
  SIMULATED: '模拟',
  USER_PROVIDED: '人工'
});

const AGENT_TOOL_LABELS = Object.freeze({
  get_plot_status: '读取地块状态',
  get_risk_forecast: '计算风险预测',
  generate_irrigation_plan: '生成灌溉方案',
  evaluate_diagnosis: '评估风险诊断',
  diagnose_root_cause: '分析异常根因',
  get_today_work_items: '汇总今日农务',
  get_water_resource_status: '读取水资源状态',
  transition_assigned_work_order: '更新本人任务',
  create_inspection_record: '提交巡田记录',
  create_evidence_request: '申请补证任务',
  execute_virtual_irrigation: '执行虚拟灌溉',
  create_plot: '新增地块',
  update_plot: '更新地块',
  set_plot_devices: '绑定设备',
  create_and_assign_work_order: '创建并下发任务',
  publish_alert_verification: '发布告警核查',
  close_alert: '关闭告警',
  get_platform_status: '读取平台服务状态',
  get_platform_risk_overview: '汇总全平台风险',
  get_rule_strategy_status: '读取规则与策略状态',
  get_farm_overview: '汇总当前农场'
  ,get_devices: '读取设备状态'
  ,get_alerts: '读取告警状态'
  ,get_work_orders: '读取任务状态'
  ,get_crop_manual: '读取作物培养手册'
  ,get_simulation_status: '读取模拟状态'
  ,get_learning_cases: '读取学习案例'
  ,get_strategy_candidates: '读取策略候选'
  ,get_audit_records: '读取审计记录'
});

const AGENT_SCOPE_LABELS = Object.freeze({
  PLOT: '当前地块', FARM: '当前农场', FARM_PLOTS: '当前农场地块', PLATFORM: '全平台',
  CROP: '作物模型', GENERAL: '通用规则', USER: '当前账号', SYSTEM: '系统'
});

/**
 * Keep the small vocabulary used by all three chat shells in one place.
 * Stable API codes remain available on the normalized object, while the
 * labels are what the person using the workspace should see.
 */
export function agentIntentLabel(value) {
  const code = String(value || '').trim().toUpperCase();
  return AGENT_INTENT_LABELS[code] || (code ? displayText(code, '农事建议') : '农事建议');
}

export function agentRoleLabel(value) {
  const code = String(value || '').trim().toUpperCase();
  return AGENT_ROLE_LABELS[code] || (code ? displayText(code, '当前身份') : '当前身份');
}

export function agentToolLabel(value) {
  const code = String(value || '').trim();
  return AGENT_TOOL_LABELS[code] || (code ? displayText(code, '受控工具') : '受控工具');
}

export function agentScopeLabel(value) {
  const code = String(value || '').trim().toUpperCase();
  return AGENT_SCOPE_LABELS[code] || (code ? displayText(code, '当前范围') : '当前范围');
}

export function agentProvenanceLabel(value) {
  return agentProvenanceLabelInternal(value);
}

function agentToolOutput(response = {}, name = '') {
  return asArray(response.tools).find((tool) => tool?.name === name)?.output;
}

function formatAgentConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const percent = numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
  return `${percent}%`;
}

function agentProvenanceLabelInternal(value) {
  const key = String(value || '').trim().toUpperCase();
  return AGENT_PROVENANCE_LABELS[key] || (key ? '其他来源' : '—');
}

/**
 * Flatten knowledge/tool/context evidence from an agent response for chat UI.
 */
export function normalizeAgentEvidence(response = {}) {
  const items = [];
  asArray(response.knowledgeEvidence).forEach((entry, index) => {
    const source = text(entry.source || entry.title, '知识片段');
    items.push({
      id: `knowledge-${index}`,
      type: 'knowledge',
      label: source.split('/').pop() || source,
      detail: source,
       scope: agentScopeLabel(entry.scope),
      provenance: agentProvenanceLabelInternal(entry.provenance)
    });
  });
  asArray(response.tools).forEach((tool, index) => {
    const plotId = text(tool?.input?.plotId, '');
    const scope = plotId || text(tool?.input?.farmId, '') || agentScopeLabel(tool?.input?.scope);
    items.push({
      id: `tool-${index}`,
      type: 'tool',
      label: agentToolLabel(tool?.name),
      detail: plotId ? `地块 ${plotId}` : scope ? `${scope}只读结果` : '受控工具输出',
      scope: scope || '—',
      provenance: '观测',
      durationMs: tool?.durationMs
    });
  });
  const context = response.context || {};
  if (context.cropPackVersion) {
    items.push({
      id: 'context-pack',
      type: 'version',
      label: `作物模型包 v${context.cropPackVersion}`,
      detail: `规则 ${text(context.ruleVersion, '—')} · 知识 ${text(context.knowledgeVersion, '—')}`,
      scope: text(context.stageCode, '—'),
      provenance: '推导'
    });
  }
  return items.slice(0, 8);
}

function agentFactValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { value: value.value ?? value.current ?? value.reading, unit: value.unit || '' };
  }
  return { value, unit: '' };
}

function appendAgentFact(items, label, value, unit = '') {
  const normalized = agentFactValue(value);
  if (normalized.value === undefined || normalized.value === null || normalized.value === '') return;
  const numeric = Number(normalized.value);
  const shown = Number.isFinite(numeric)
    ? (Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, ''))
    : String(normalized.value);
  const suffix = normalized.unit || unit;
  items.push({ label, value: `${shown}${suffix ? ` ${suffix}` : ''}`.trim() });
}

/**
 * Project only explicit deterministic values into the shared chat facts row.
 * This is presentation data, not a second source of truth: missing fields are
 * omitted instead of being filled with demo values.
 */
export function normalizeAgentFacts(response = {}) {
  const result = response.result && typeof response.result === 'object' ? response.result : {};
  const latest = result.latest || result.latestTelemetry || result.telemetry || response.latest || {};
  const diagnosis = response.diagnosis && typeof response.diagnosis === 'object' ? response.diagnosis : {};
  const plan = response.plan && typeof response.plan === 'object' ? response.plan : {};
  const facts = [];
  // Newer responses may already contain a server-normalized facts row. Keep
  // it first so a refreshed conversation preserves the exact values shown at
  // the time of the answer, then fill any missing fields from the raw result.
  if (Array.isArray(response.facts)) {
    response.facts.forEach((fact) => {
      if (fact && fact.label && fact.value !== undefined && fact.value !== null) {
        facts.push({ label: String(fact.label), value: String(fact.value) });
      }
    });
  }
  const metric = (codes) => {
    for (const code of codes) {
      if (latest[code] !== undefined) return latest[code];
    }
    return undefined;
  };
  appendAgentFact(facts, '土壤湿度', metric(['SOIL_MOISTURE', 'soilMoisture', 'moisture']), '%');
  appendAgentFact(facts, '空气温度', metric(['AIR_TEMPERATURE', 'airTemperature', 'temperature']), '°C');
  appendAgentFact(facts, '空气湿度', metric(['AIR_HUMIDITY', 'airHumidity', 'humidity']), '%RH');
  appendAgentFact(facts, '风险等级', diagnosis.riskLevel ?? diagnosis.level ?? result.riskLevel ?? response.riskLevel);
  appendAgentFact(facts, '就绪状态', result.readinessStatus ?? plan.readinessStatus ?? response.readinessStatus);
  appendAgentFact(facts, '建议水量', result.waterLitre ?? result.waterLitres ?? plan.waterLitre ?? plan.waterLitres, 'L');
  appendAgentFact(facts, '执行时长', result.durationSeconds ?? plan.durationSeconds, '秒');
  appendAgentFact(facts, '规则版本', response.context?.ruleVersion || response.ruleVersion);
  appendAgentFact(facts, '场景', result.scenarioLabel || result.scenario || response.scenarioLabel);
  if (Array.isArray(result.plots)) appendAgentFact(facts, '地块数量', result.plots.length, '个');
  appendAgentFact(facts, '进行中告警', result.activeAlertCount, '条');
  appendAgentFact(facts, '待处理任务', result.pendingWorkOrderCount, '项');
  appendAgentFact(facts, '数据库', result.database);
  appendAgentFact(facts, '高速消息流', result.redis);
  appendAgentFact(facts, '设备消息链路', result.mqtt);
  appendAgentFact(facts, '作物包', result.cropPackCount, '个');
  appendAgentFact(facts, '规则', result.ruleCount, '条');
  appendAgentFact(facts, '策略候选', result.strategyCandidateCount, '个');
  appendAgentFact(facts, '已启用策略', result.activeStrategyCount, '个');
  const quality = response.quality || result.quality || response.dataQuality;
  if (typeof quality === 'string') appendAgentFact(facts, '数据质量', quality);
  const evidenceCount = Array.isArray(response.knowledgeEvidence) ? response.knowledgeEvidence.length : 0;
  if (evidenceCount) appendAgentFact(facts, '检索证据', evidenceCount, '条');
  asArray(response.tools).forEach((tool) => {
    const output = tool?.output && typeof tool.output === 'object' ? tool.output : {};
    appendAgentFact(facts, '工具结果', output.readinessStatus || output.status || output.executionStatus);
  });
  return facts.filter((fact, index, list) => list.findIndex(item => item.label === fact.label) === index).slice(0, 6);
}

/** Return concise, explicit next steps without duplicating the narrative. */
export function normalizeAgentRecommendations(response = {}) {
  const plan = response.plan && typeof response.plan === 'object' ? response.plan : {};
  const values = Array.isArray(response.recommendations)
    ? response.recommendations.filter((item) => item !== undefined && item !== null && String(item).trim()).map((item) => String(item).trim())
    : [];
  if (response.actionProposal?.summary) values.push(`确认后执行：${String(response.actionProposal.summary).trim()}`);
  [plan.nextStep, plan.recommendation, plan.advice, plan.action].forEach((value) => {
    if (typeof value === 'string' && value.trim()) values.push(value.trim());
  });
  (Array.isArray(plan.alternatives) ? plan.alternatives : []).forEach((value) => {
    const item = typeof value === 'string' ? value : value?.label || value?.summary;
    if (item) values.push(String(item).trim());
  });
  (Array.isArray(response.warnings) ? response.warnings : []).forEach((value) => {
    if (typeof value === 'string' && value.trim()) values.push(`先处理：${value.trim()}`);
  });
  const missing = response.readiness?.missingEvidence || response.result?.missingEvidence;
  if (Array.isArray(missing) && missing.length) values.push(`补充证据：${missing.slice(0, 2).join('、')}`);
  return [...new Set(values)].slice(0, 4);
}

/**
 * Build a farmer-facing decision card from deterministic agent output.
 * The card hands the farmer back to the inline assistant, which owns the
 * guarded preview, confirmation and execution flow for write operations.
 */
export function normalizeAgentDecisionCard(response = {}, plot = null) {
  const intent = String(response.intent || '').toUpperCase();
  const traceId = text(response.traceId, '');
  const plotId = text(response.plotId || plot?.plotId, '');
  const plotName = text(plot?.name, plotId || '关联地块');
  if (!intent || ['GREETING', 'CLARIFICATION', 'CAPABILITY_QUERY', 'FOLLOW_UP', 'PLOT_STATUS', 'IMAGE_ANALYSIS'].includes(intent)) {
    return null;
  }

  if (intent === 'IRRIGATION_RECOMMENDATION') {
    const plan = response.plan || agentToolOutput(response, 'generate_irrigation_plan') || {};
    const readiness = String(plan.readinessStatus || '').toUpperCase();
    const executable = Boolean(plan.executable) && readiness !== 'NEEDS_EVIDENCE' && readiness !== 'UNAVAILABLE';
    const water = plan.waterLitre ?? plan.howMuch?.waterLitre;
    const durationSeconds = plan.durationSeconds ?? plan.howMuch?.durationSeconds;
    const durationMinutes = Number.isFinite(Number(durationSeconds)) ? Math.round(Number(durationSeconds) / 6) / 10 : null;
    return {
      kind: 'IRRIGATION',
      title: '灌溉执行建议卡',
      summary: executable
        ? `建议补水约 ${water ?? '—'} L${durationMinutes != null ? `，时长约 ${durationMinutes} 分钟` : ''}`
        : '当前证据或安全门未通过，仅可作为参考，需人工复核',
      plotId,
      plotName,
      traceId,
      executable,
      actionLabel: executable ? '在对话中准备执行' : '在对话中检查执行条件',
      note: executable ? '当前用户可在安全门通过并确认后执行虚拟灌溉。' : '请先巡田、复测或联系管理员。'
    };
  }

  if (intent === 'DIAGNOSIS' || intent === 'RISK_DIAGNOSIS') {
    const diagnosis = response.diagnosis
      || agentToolOutput(response, 'evaluate_diagnosis')
      || agentToolOutput(response, 'diagnose_root_cause')
      || {};
    const cause = displayText(diagnosis.primaryCause || diagnosis.riskType, '待分析');
    return {
      kind: 'DIAGNOSIS',
      title: '诊断结论卡',
      summary: `主因 ${cause}`,
      plotId,
      plotName,
      traceId,
      executable: true,
      actionLabel: '查看智能诊断',
      note: '诊断结论需结合支持/反对证据与就绪度后再行动。'
    };
  }

  if (intent === 'TODAY_WORK') {
    const work = response.workItems || agentToolOutput(response, 'get_today_work_items') || [];
    const count = Array.isArray(work) ? work.length : 0;
    return {
      kind: 'TASK',
      title: '今日农务卡',
      summary: count ? `关联 ${count} 项待处理农务` : '当前暂无待办，可继续按计划巡查',
      plotId,
      plotName,
      traceId,
      executable: true,
      actionLabel: '查看今日农务',
      note: '任务结果提交后等待管理员验收。'
    };
  }

  if (intent === 'RISK_FORECAST') {
    const forecast = response.result || agentToolOutput(response, 'get_risk_forecast') || {};
    const ttr = Number(forecast.timeToRiskMinutes);
    return {
      kind: 'FORECAST',
      title: '风险预测卡',
      summary: Number.isFinite(ttr) && ttr > 0 ? `预计约 ${ttr} 分钟后进入风险区间` : '已生成短期含水率预测曲线',
      plotId,
      plotName,
      traceId,
      executable: true,
      actionLabel: '打开风险预警',
      note: '预测基于当前策略与遥测窗口，样本不足时会标记为不可用。'
    };
  }

  if (intent === 'RETEST_CHECKLIST') {
    return {
      kind: 'INSPECTION',
      title: '复测与补证卡',
      summary: '建议先完成现场巡田或传感器复测，再重新评估处方',
      plotId,
      plotName,
      traceId,
      executable: true,
      actionLabel: '去巡田 / 申请复测',
      note: '补证记录会进入诊断证据链，不会覆盖遥测。'
    };
  }

  return null;
}

const AGENT_NAVIGATION_VIEWS = Object.freeze({
  FARMER: new Set(['dashboard', 'plots', 'tasks', 'tools', 'advice', 'inspections', 'assistant', 'settings']),
  FARM_ADMIN: new Set(['dashboard', 'plot-detail', 'decision-console', 'work-orders', 'resource-coordination', 'farm-members', 'rules-strategies', 'ai-assistant', 'settings']),
  SYSTEM_ADMIN: new Set(['plot-detail', 'admin-overview', 'admin-ops', 'admin-resources', 'admin-audit', 'admin-simulator', 'admin-rules', 'admin-settings', 'admin-agent', 'settings'])
});
const AGENT_NAVIGATION_PARAM_KEYS = new Set(['farmId', 'plotId', 'deviceId', 'taskId', 'workOrderId', 'alertId', 'caseId', 'candidateId', 'userId', 'tab', 'section', 'scope', 'metric', 'conversationId']);

/**
 * Normalize server navigation cards through a small client-side route
 * registry.  A model can describe a destination, but it cannot provide a
 * free URL or arbitrary query parameters.
 */
export function normalizeAgentNavigationCards(response = {}, options = {}) {
  const role = String(options.role || response.role || response.agentRole || '').trim().toUpperCase();
  const allowedViews = AGENT_NAVIGATION_VIEWS[role] || AGENT_NAVIGATION_VIEWS.FARMER;
  return asArray(response.navigationCards)
    .filter(card => card && String(card.type || 'NAVIGATION_CARD').toUpperCase() === 'NAVIGATION_CARD')
    .map((card, index) => {
      const targetRole = String(card.targetRole || role).trim().toUpperCase();
      const route = card.route && typeof card.route === 'object' ? card.route : {};
      const view = String(route.view || '').trim();
      if (!view || !allowedViews.has(view) || (targetRole && targetRole !== role)) return null;
      const paramsSource = route.params && typeof route.params === 'object' ? route.params : route;
      const params = {};
      AGENT_NAVIGATION_PARAM_KEYS.forEach(key => {
        const value = paramsSource[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') params[key] = String(value).trim();
      });
      return {
        id: String(card.id || `${view}-${index}`),
        type: 'NAVIGATION_CARD',
        title: text(card.title, '查看详情'),
        description: text(card.description, '打开相关农业工作台'),
        label: text(card.label, '前往查看'),
        targetRole: targetRole || role,
        route: { view, params }
      };
    })
    .filter(Boolean)
    .filter((card, index, list) => list.findIndex(item => item.route.view === card.route.view && JSON.stringify(item.route.params) === JSON.stringify(card.route.params)) === index)
    .slice(0, 4);
}

/** Normalize a full farmer QA turn for rendering evidence, traceId and decision cards. */
export function normalizeAgentTurn(response = {}, question = '', options = {}) {
  const plot = options.plot || null;
  const sessionMode = options.sessionMode || 'live';
  const intent = String(response.intent || '').toUpperCase();
  const responseRole = String(response.role || '').toUpperCase();
  const role = ['USER', 'ASSISTANT'].includes(responseRole) ? String(options.role || '').toUpperCase() : response.role || options.role;
  const roleCode = String(role || '').toUpperCase();
  return {
    id: `qa-${Date.now()}`,
    question,
    answer: agentResponseText(response, '暂时没有生成有效回答，请换一种问法。'),
    sourceLabel: agentResponseSource(response, sessionMode),
    traceId: text(response.traceId, ''),
    intent,
    intentLabel: agentIntentLabel(intent),
    role: text(role, ''),
    agentRole: text(role, ''),
    roleLabel: text(response.roleLabel || response.roleProfile?.label || agentRoleLabel(roleCode), ''),
    scopeLabel: text(response.roleProfile?.scopeLabel || options.scopeLabel, ''),
    roleProfile: response.roleProfile && typeof response.roleProfile === 'object' ? response.roleProfile : null,
    degraded: Boolean(response.degraded),
    evidence: normalizeAgentEvidence(response),
    facts: normalizeAgentFacts(response),
    recommendations: normalizeAgentRecommendations(response),
    navigationCards: normalizeAgentNavigationCards(response, { role: roleCode }),
    decisionCard: normalizeAgentDecisionCard(response, plot),
    actionProposal: response?.actionProposal ? { ...response.actionProposal } : null,
    plotId: text(plot?.plotId || response.plotId, ''),
    plotName: text(plot?.name, ''),
    dataOrigin: sessionMode === 'live' ? 'BACKEND' : 'SIMULATED'
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = '') {
  return value === undefined || value === null || String(value).trim() === '' ? fallback : String(value);
}

function dateValue(value) {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function normalizeWorkStatus(value) {
  const status = text(value, 'OPEN').trim().toUpperCase();
  return WORK_STATUS_ALIASES[status] || status;
}

export function workStatusLabel(value) {
  const status = normalizeWorkStatus(value);
  return STATUS_LABELS[status] || statusLabel(status, '状态未知');
}

export function relativeTime(value, now = Date.now()) {
  const date = dateValue(value);
  // A missing backend timestamp is sometimes serialised as `0`/epoch.  It
  // must not appear in a user-facing card as "20,000 days ago".
  if (!date || date.getTime() < Date.UTC(2000, 0, 1)) return '—';
  const diff = Math.max(0, now - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function dueLabel(value, now = Date.now()) {
  const date = dateValue(value);
  if (!date) return '时间待确认';
  if (date.getTime() < now) return '已逾期';
  const sameDay = date.toDateString() === new Date(now).toDateString();
  return sameDay
    ? `今日 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function metricFromLatest(code, event, current = {}) {
  if (!event || event.value === undefined || event.value === null) return current;
  return {
    ...current,
    label: current.label || metricLabel(code),
    value: event.value,
    unit: event.unit || current.unit || '',
    target: current.target || '—',
    status: event.quality?.status === 'GOOD' ? 'NORMAL' : (event.quality?.status || current.status || 'UNKNOWN'),
    observedAt: event.ts || event.observedAt || null,
    provenance: event.provenance || 'OBSERVED',
    sourceMode: event.sourceMode || current.sourceMode || 'SIMULATION',
    dataOrigin: event.dataOrigin || current.dataOrigin || 'BACKEND'
  };
}

export function normalizePlot(plot = {}, overviewCard = {}) {
  const metrics = { ...(plot.metrics || {}), ...(overviewCard.metrics || {}) };
  const history = { ...(plot.history || {}), ...(overviewCard.history || {}) };
  Object.entries(history).forEach(([code, points]) => {
    if (!Array.isArray(points) || !points.length) return;
    metrics[code] = { ...(metrics[code] || { label: code, target: '—' }), history: points };
  });
  Object.entries(overviewCard.latest || {}).forEach(([code, event]) => {
    metrics[code] = metricFromLatest(code, event, metrics[code]);
  });
  const device = overviewCard.device || plot.device || {};
  // A physical binding has precedence over the simulator device for the
  // plot's operational status.  Synthetic values may continue to exist as a
  // fallback, but the UI must never call a plot usable while its bound
  // hardware is offline.
  const hardware = overviewCard.hardware || plot.hardware || {};
  const hardwareBound = String(hardware.bindingState || '').toUpperCase() === 'BOUND';
  const effectiveDevice = hardwareBound
    ? { ...device, ...hardware, deviceId: hardware.deviceId || device.deviceId, sourceMode: 'REAL', dataOrigin: 'HARDWARE' }
    : device;
  const cropCode = text(plot.cropCode || overviewCard.cropCode, '');
  const explicitFacility = text(plot.facilityType || overviewCard.facilityType || plot.plotType, '').toUpperCase();
  const facilityType = explicitFacility || (/温室|大棚|棚/.test(text(plot.name || overviewCard.name, '')) ? 'GREENHOUSE' : /果园/.test(text(plot.name || overviewCard.name, '')) ? 'ORCHARD' : 'OPEN_FIELD');
  const facilityLabel = text(plot.facilityLabel || overviewCard.facilityLabel, ({
    GREENHOUSE: '大棚', SHADE_HOUSE: '遮阳棚', ORCHARD: '果园', OPEN_FIELD: '露地（裸地）'
  })[facilityType] || '露地（裸地）');
  return {
    ...plot,
    ...overviewCard,
    plotId: text(plot.plotId || overviewCard.plotId),
    name: text(plot.name || overviewCard.name, text(plot.plotId || overviewCard.plotId, '未命名地块')),
    cropCode,
    cropName: text(plot.cropName || overviewCard.cropName, CROP_LABELS[cropCode] || cropCode || '—'),
    stageCode: text(plot.stageCode || overviewCard.stageCode, ''),
    stageLabel: text(plot.stageLabel || overviewCard.stageLabel, '—'),
    facilityType,
    facilityLabel,
    cultivationStatus: text(plot.cultivationStatus || overviewCard.cultivationStatus, 'GROWING').toUpperCase(),
    cultivationStatusLabel: text(plot.cultivationStatusLabel || overviewCard.cultivationStatusLabel, '正常种植'),
    lastOperationType: text(plot.lastOperationType || overviewCard.lastOperationType, ''),
    lastOperationLabel: text(plot.lastOperationLabel || overviewCard.lastOperationLabel, ''),
    lastOperationAt: text(plot.lastOperationAt || overviewCard.lastOperationAt, ''),
    lastOperationBy: text(plot.lastOperationBy || overviewCard.lastOperationBy, ''),
    lastOperationSummary: text(plot.lastOperationSummary || overviewCard.lastOperationSummary, ''),
    operationRevision: Number(plot.operationRevision ?? overviewCard.operationRevision ?? 0),
    operationHistory: Array.isArray(plot.operationHistory) ? plot.operationHistory : (Array.isArray(overviewCard.operationHistory) ? overviewCard.operationHistory : []),
    metrics,
    history,
    deviceId: text(effectiveDevice.deviceId || plot.deviceId, ''),
    deviceStatus: text(effectiveDevice.status || plot.deviceStatus, 'UNKNOWN').toUpperCase(),
    hardware,
    hardwareStatus: hardwareBound ? text(hardware.status, 'OFFLINE').toUpperCase() : 'NOT_BOUND',
    healthScore: overviewCard.health?.score ?? overviewCard.healthScore ?? plot.healthScore ?? effectiveDevice.healthScore ?? null,
    health: overviewCard.health || plot.health || null,
    lastSeen: effectiveDevice.lastSeen || plot.lastSeen || null,
    sourceMode: plot.sourceMode || overviewCard.sourceMode || Object.values(metrics).find(metric => metric?.sourceMode)?.sourceMode || 'SIMULATION',
    dataOrigin: plot.dataOrigin || overviewCard.dataOrigin || Object.values(metrics).find(metric => metric?.dataOrigin)?.dataOrigin || 'BACKEND'
  };
}

/**
 * Merge the lightweight /plots facts and the richer /overview cards by plot.
 * A request can finish before the other one (or hit its UI budget), so keep
 * the previously rendered fields for matching plots while allowing fresh
 * facts/cards to replace them.  When both sources are unavailable the prior
 * snapshot is retained; an explicit empty response still clears the list.
 */
export function mergeOverviewPlotRecords(plotFacts = [], overviewCards = [], previousPlots = []) {
  const facts = Array.isArray(plotFacts) ? plotFacts : [];
  const cards = Array.isArray(overviewCards) ? overviewCards : [];
  const previous = Array.isArray(previousPlots) ? previousPlots : [];
  const factMap = new Map(facts
    .filter((plot) => plot && (plot.plotId || plot.id))
    .map((plot) => [String(plot.plotId || plot.id), plot]));
  const cardMap = new Map(cards
    .filter((plot) => plot && (plot.plotId || plot.id))
    .map((plot) => [String(plot.plotId || plot.id), plot]));
  const previousMap = new Map(previous
    .filter((plot) => plot && (plot.plotId || plot.id))
    .map((plot) => [String(plot.plotId || plot.id), plot]));
  const freshIds = new Set([...factMap.keys(), ...cardMap.keys()]);
  const ids = (freshIds.size ? [...freshIds] : [...previousMap.keys()])
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return ids.map((plotId) => {
    const fact = factMap.get(plotId) || {};
    const card = cardMap.get(plotId) || {};
    const prior = previousMap.get(plotId) || {};
    return normalizePlot({ ...prior, ...fact }, card);
  });
}

/**
 * Merge a fresh mixed-metric telemetry window into an existing plot card.
 * The newest sample updates the visible value as well as the history. This
 * keeps the fast farmer poll useful without waiting for a full overview.
 */
export function mergePlotTelemetryWindow(plot = {}, points = []) {
  const history = { ...(plot.history || {}) };
  Object.entries(plot.metrics || {}).forEach(([code, metric]) => {
    if (!history[code] && Array.isArray(metric?.history)) history[code] = metric.history.slice();
  });
  const grouped = {};
  (Array.isArray(points) ? points : []).forEach((point) => {
    const code = text(point?.metric, '');
    if (!code) return;
    (grouped[code] ||= []).push(point);
  });
  const latest = {};
  Object.entries(grouped).forEach(([code, samples]) => {
    const ordered = samples.slice().sort((left, right) => (
      dateValue(left?.ts || left?.observedAt)?.getTime() || 0
    ) - (
      dateValue(right?.ts || right?.observedAt)?.getTime() || 0
    ));
    if (!ordered.length) return;
    history[code] = ordered;
    latest[code] = ordered[ordered.length - 1];
  });
  return normalizePlot({ ...plot, history }, { history, latest });
}

export function normalizeFarmerTask(work = {}, plotMap = new Map()) {
  const plotId = text(work.plotId || work.plot_id, '');
  const plot = plotMap.get(plotId) || {};
  const workOrderId = text(work.workOrderId || work.workItemId || work.id, '');
  const rawStatus = text(work.status, 'OPEN').trim().toUpperCase();
  let status = normalizeWorkStatus(rawStatus);
  // Keep farmer-facing "not started" distinct from admin "unassigned".
  if (rawStatus === 'PENDING') status = 'PENDING';
  else if (status === 'OPEN' && (work.assigneeId || work.assignee_id)) status = 'ASSIGNED';
  const createdAt = work.createdAt || work.created_at || work.created_iso;
  const dueAt = work.dueAt || work.due_at || work.due_iso;
  const issuer = text(work.createdByName || work.createdBy || work.issuer, '—');
  const actionType = text(work.actionType, 'FIELD_OPERATION').trim().toUpperCase();
  const actionLabel = text(work.actionLabel, ({
    SOWING: '播种', TRANSPLANTING: '移栽', HARVEST: '采收', FERTILIZATION: '施肥',
    PEST_CONTROL: '植保', WEEDING: '除草', PRUNING: '整枝', IRRIGATION: '灌溉',
    MANUAL_IRRIGATION: '人工灌溉', IRRIGATION_CHECK: '灌溉巡检', INSPECTION: '巡田核验',
    FIELD_INSPECTION: '巡田核验', DEVICE_CHECK: '设备检查', FIELD_OPERATION: '田间作业',
    IRRIGATION_REVIEW: '灌溉方案审批'
  })[actionType] || '农务作业');
  return {
    ...work,
    id: workOrderId || `work-${createdAt || Date.now()}`,
    workOrderId: workOrderId || null,
    title: text(work.title, '未命名农务任务'),
    reason: text(work.reason, '暂无执行说明'),
    instruction: text(work.instruction || work.description, ''),
    status,
    priority: text(work.priority, 'MEDIUM').toUpperCase(),
    action_type: actionType,
    action_label: actionLabel,
    plot_id: plotId || null,
    plot_name: text(work.plotName || work.plot_name || plot.name, plotId || '全场任务'),
    issuer,
    created_iso: createdAt || null,
    due_iso: dueAt || null,
    created_label: relativeTime(createdAt),
    due_label: dueLabel(dueAt),
    status_label: workStatusLabel(status),
    dataOrigin: 'BACKEND'
  };
}

/**
 * The farmer workspace reads both the work-order collection and the
 * today-work read model.  They can briefly disagree while a completed order
 * is being indexed, so retain every real work-order record from either
 * response and ignore aggregate-only alert/diagnosis items.
 */
export function mergeFarmerWorkOrders(primary = [], supplemental = []) {
  const records = new Map();
  const add = (record) => {
    if (!record || typeof record !== 'object') return;
    const workOrderId = text(record.workOrderId, '');
    // `/work-items/today` also contains synthetic alert/diagnosis entries
    // identified only by workItemId; those are not executable task cards.
    if (!workOrderId) return;
    const recordId = workOrderId;
    const previous = records.get(recordId);
    records.set(recordId, previous ? { ...previous, ...record } : record);
  };
  asArray(primary).forEach(add);
  asArray(supplemental).forEach(add);
  return [...records.values()];
}

function messageBase({
  id,
  category,
  title,
  snippet,
  body,
  sender,
  at,
  read = false,
  plotId = '',
  plotName = '',
  alertId = '',
  alertLevel = '',
  alertStatus = '',
  alertSource = '',
  linkedWorkOrderId = '',
  workOrderId = '',
  taskStatus = ''
} = {}) {
  return {
    id,
    category,
    title,
    snippet,
    body_paragraphs: asArray(body).filter(Boolean),
    sender: sender || '农智闭环后端',
    read: Boolean(read),
    time_iso: at || null,
    time_label: relativeTime(at),
    plotId: plotId || null,
    plotName: plotName || null,
    alertId: alertId || null,
    alertLevel: alertLevel || null,
    alertStatus: alertStatus || null,
    alertSource: alertSource || null,
    linkedWorkOrderId: linkedWorkOrderId || null,
    workOrderId: workOrderId || null,
    taskStatus: taskStatus || null,
    dataOrigin: 'BACKEND'
  };
}

function findLinkedWorkOrder(tasks = [], alert = {}) {
  const alertKey = text(alert.alertId || alert.id, '');
  if (!alertKey) return '';
  return asArray(tasks).find((task) => (
    text(task.sourceRef, '') === alertKey
    || text(task.linkedAlert, '') === alertKey
    || text(task.source_ref, '') === alertKey
  ))?.workOrderId || asArray(tasks).find((task) => (
    text(task.sourceRef, '') === alertKey
    || text(task.linkedAlert, '') === alertKey
  ))?.id || '';
}

export function buildFarmerMessages({ alerts = [], tasks = [], inspections = [], plots = [] } = {}) {
  const plotMap = new Map(asArray(plots).map((plot) => [String(plot.plotId), plot]));
  const messages = [];
  const seenAlertKeys = new Set();
  const sortedAlerts = asArray(alerts).slice().sort((a, b) =>
    (dateValue(b.updatedAt || b.raisedAt || b.createdAt)?.getTime() || 0)
    - (dateValue(a.updatedAt || a.raisedAt || a.createdAt)?.getTime() || 0));
  sortedAlerts.forEach((alert) => {
    const plotId = text(alert.plotId, '');
    const source = text(alert.source, 'RULE').toUpperCase();
    const status = text(alert.status, 'ACTIVE').toUpperCase();
    // Keep one live alert message per plot+source so a cooldown miss on the
    // backend cannot flood the farmer inbox with the same notice.
    if (['ACTIVE', 'ACKNOWLEDGED', 'OPEN'].includes(status)) {
      const dedupeKey = `${plotId}|${source}`;
      if (seenAlertKeys.has(dedupeKey)) return;
      seenAlertKeys.add(dedupeKey);
    }
    const plotName = plotMap.get(plotId)?.name || plotId || '相关地块';
    const alertId = text(alert.alertId || alert.id, `${plotId}:${alert.createdAt || alert.raisedAt}`);
    const title = text(alert.title, `${plotName}出现${levelLabel(alert.level, '提示')}告警`);
    const message = text(alert.message || alert.summary, '请打开告警详情查看后端提供的处理建议。');
    const linkedWorkOrderId = findLinkedWorkOrder(tasks, alert);
    messages.push(messageBase({
      id: `alert:${alertId}`,
      category: 'alert',
      title,
      snippet: message,
      body: [
        message,
        `级别：${levelLabel(alert.level, '提示')}`,
        `来源：${sourceLabel(alert.source, '规则引擎')}`,
        `当前状态：${alertStatusLabel(status, '未知')}`,
        linkedWorkOrderId ? `关联任务：${linkedWorkOrderId}` : '关闭与派单由农场管理员在告警台账处理'
      ],
      sender: '农智闭环规则引擎',
      at: alert.updatedAt || alert.createdAt || alert.raisedAt,
      plotId,
      plotName,
      alertId,
      alertLevel: text(alert.level, 'MEDIUM').toUpperCase(),
      alertStatus: status,
      alertSource: source,
      linkedWorkOrderId,
      read: status === 'CLOSED' || status === 'RESOLVED'
    }));
  });
  asArray(tasks).forEach((task) => {
    const normalized = task.id ? task : normalizeFarmerTask(task, plotMap);
    messages.push(messageBase({
      id: `work:${text(task.workOrderId || task.id)}`,
      category: 'task',
      title: `任务：${normalized.title}`,
      snippet: normalized.reason,
      body: [normalized.reason, normalized.instruction, `当前状态：${workStatusLabel(normalized.status)}`],
      sender: normalized.issuer,
      at: task.createdAt || normalized.created_iso,
      plotId: normalized.plot_id,
      plotName: normalized.plot_name,
      workOrderId: text(task.workOrderId || task.id, normalized.id),
      taskStatus: normalized.status,
      read: normalizeWorkStatus(normalized.status) === 'DONE' || normalizeWorkStatus(normalized.status) === 'CANCELLED'
    }));
  });
  asArray(inspections).forEach((record) => {
    const plotId = text(record.plotId, '');
    const plotName = plotMap.get(plotId)?.name || plotId || '相关地块';
    const note = text(record.notes || record.evidenceSummary, '已提交现场观察。');
    messages.push(messageBase({
      id: `inspection:${text(record.inspectionId, `${plotId}:${record.observedAt}`)}`,
      category: 'notice',
      title: `巡田记录已提交：${plotName}`,
      snippet: note,
      body: [note, `记录人：${text(record.operatorName || record.operatorId, '—')}`, `来源：${sourceLabel(record.sourceType, '人工观察')}`],
      sender: text(record.operatorName || record.operatorId, '现场记录'),
      at: record.observedAt || record.createdAt,
      plotId,
      plotName,
      read: true
    }));
  });
  return messages
    .sort((a, b) => (dateValue(b.time_iso)?.getTime() || 0) - (dateValue(a.time_iso)?.getTime() || 0))
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);
}

export function buildFarmerProfile({ user = {}, farm = null, plots = [], tasks = [], inspections = [], messages = [] } = {}) {
  const completed = asArray(tasks).filter((task) => ['DONE', 'COMPLETED'].includes(normalizeWorkStatus(task.status))).length;
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthDone = asArray(tasks).filter((task) => ['DONE', 'COMPLETED'].includes(normalizeWorkStatus(task.status)) && String(task.completedAt || task.updatedAt || '').startsWith(monthKey)).length;
  const total = asArray(tasks).length;
  return {
    username: text(user.username, '—'),
    displayName: text(user.displayName || user.username, '—'),
    role_label: text(user.roleLabel, '种植农户'),
    farm_name: text(farm?.name, '—'),
    farm_id: text(farm?.farmId, ''),
    plot_names: asArray(plots).map((plot) => plot.name || plot.plotId).filter(Boolean),
    total_done: completed,
    month_done: monthDone,
    inspections: asArray(inspections).length,
    completion_rate: total ? Math.round((completed / total) * 100) : 0,
    messages: asArray(messages).length,
    unread: asArray(messages).filter((message) => !message.read).length,
    // Contact and employment dates are intentionally absent: the current
    // auth contract does not provide them, so the UI must not invent them.
    dataOrigin: 'BACKEND'
  };
}

export function buildLiveFeedItems({ alerts = [], workOrders = [], inspections = [], plots = [] } = {}) {
  const plotMap = new Map(asArray(plots).map((plot) => [String(plot.plotId), plot]));
  const items = [];
  asArray(alerts).forEach((alert) => {
    const plotId = text(alert.plotId, '');
    const title = text(alert.title, `${plotMap.get(plotId)?.name || plotId}告警`);
    const summary = text(alert.message || alert.summary, '后端告警记录');
    const category = levelLabel(alert.level, '告警');
    items.push({
      id: `alert:${text(alert.alertId || alert.id, Date.now())}`,
      type: 'ALERT',
      category,
      categoryLabel: displayText(category),
      title,
      titleLabel: displayText(title),
      summary,
      summaryLabel: displayText(summary),
      timestamp: relativeTime(alert.createdAt || alert.raisedAt),
      timestampIso: alert.createdAt || alert.raisedAt || alert.updatedAt || null,
      badge: { color: 'amber' },
      actions: [],
      dataOrigin: 'BACKEND'
    });
  });
  asArray(workOrders).forEach((order) => {
    const isFarmerIssueReport = String(order.sourceType || '').trim().toUpperCase() === 'FARMER_REPORT';
    const title = text(order.title, isFarmerIssueReport ? '农户问题上报' : '未命名任务');
    const reason = text(order.issueDescription || order.description || order.reason, '暂无说明');
    const summary = isFarmerIssueReport
      ? `${reason} · 上报人：${text(order.reporterName || order.reporterId, '农户')} · ${workStatusLabel(order.status)}`
      : `${reason} · ${workStatusLabel(order.status)}`;
    items.push({
      id: `work:${text(order.workOrderId || order.id, Date.now())}`,
      type: 'WORK_ORDER',
      category: isFarmerIssueReport ? '农户问题上报' : '农务工单',
      categoryLabel: isFarmerIssueReport ? '农户问题上报' : '农务工单',
      title,
      titleLabel: displayText(title),
      summary,
      summaryLabel: displayText(summary),
      timestamp: relativeTime(order.updatedAt || order.createdAt),
      timestampIso: order.updatedAt || order.createdAt || null,
      badge: { color: isFarmerIssueReport ? 'amber' : 'green' },
      actions: [],
      dataOrigin: 'BACKEND'
    });
  });
  asArray(inspections).forEach((record) => {
    const plotId = text(record.plotId, '');
    const title = `巡田记录：${plotMap.get(plotId)?.name || plotId}`;
    const summary = text(record.notes || record.evidenceSummary, '已收到现场观察');
    items.push({
      id: `inspection:${text(record.inspectionId, Date.now())}`,
      type: 'INFO',
      category: '人工观察',
      categoryLabel: '人工观察',
      title,
      titleLabel: displayText(title),
      summary,
      summaryLabel: displayText(summary),
      timestamp: relativeTime(record.observedAt || record.createdAt),
      timestampIso: record.observedAt || record.createdAt || null,
      badge: { color: 'green' },
      actions: [],
      dataOrigin: 'BACKEND'
    });
  });
  return items
    .sort((a, b) => (dateValue(b.timestampIso)?.getTime() || 0) - (dateValue(a.timestampIso)?.getTime() || 0))
    .slice(0, 20);
}

export function mapAdminPlot(plot, farmMap = new Map()) {
  const normalized = normalizePlot(plot, plot);
  const status = normalized.deviceStatus === 'OFFLINE'
    ? 'OFFLINE'
    : ['HIGH', 'CRITICAL', 'DANGER'].includes(String(normalized.riskLevel || '').toUpperCase())
      ? 'CRITICAL'
      : ['WARN', 'WARNING', 'DEGRADED'].includes(String(normalized.riskLevel || '').toUpperCase())
        ? 'WARNING'
        : 'HEALTHY';
  const metrics = {};
  Object.entries(normalized.metrics || {}).forEach(([code, metric]) => {
    metrics[code] = metric?.value === undefined || metric?.value === null ? '—' : `${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`;
  });
  return {
    id: normalized.plotId,
    plotId: normalized.plotId,
    name: normalized.name || normalized.plotId,
    farmId: normalized.farmId || '',
    farm: farmMap.get(normalized.farmId)?.name || normalized.farmId || '—',
    cropCode: normalized.cropCode || '',
    cropName: normalized.cropName || CROP_LABELS[normalized.cropCode] || normalized.cropCode || '—',
    crop: normalized.cropName || CROP_LABELS[normalized.cropCode] || normalized.cropCode || '—',
    status,
    updated: relativeTime(normalized.lastSeen || normalized.updatedAt),
    metrics,
    healthScore: normalized.healthScore,
    monitoredMetrics: Object.keys(metrics),
    issue: status === 'OFFLINE' ? '采集设备离线' : status === 'CRITICAL' ? '风险等级较高' : status === 'WARNING' ? '指标需要关注' : ''
  };
}

export function mapAdminDevice(device = {}, plotMap = new Map()) {
  const rawType = text(device.type, '未知设备');
  const rawStatus = text(device.status, 'UNKNOWN').toUpperCase();
  return {
    ...device,
    deviceId: text(device.deviceId || device.id, '—'),
    plotId: text(device.plotId, '未绑定'),
    type: rawType,
    typeLabel: deviceTypeLabel(rawType),
    lastHeartbeat: relativeTime(device.lastSeen || device.lastHeartbeat),
    status: rawStatus,
    statusLabel: serviceStatusLabel(rawStatus),
    plotName: plotMap.get(String(device.plotId))?.name || '—',
    sourceLabel: sourceLabel(device.sourceMode || device.dataOrigin, '后端数据'),
    dataOrigin: 'BACKEND'
  };
}

export function mapAdminAlert(alert = {}, plotMap = new Map()) {
  const status = text(alert.status, 'ACTIVE').toUpperCase();
  const normalizedStatus = status === 'ACTIVE' ? 'OPEN' : status === 'ACKED' ? 'ACK' : status;
  return {
    ...alert,
    id: text(alert.alertId || alert.id, `alert-${Date.now()}`),
    time: relativeTime(alert.createdAt || alert.raisedAt || alert.updatedAt),
    level: text(alert.level, 'INFO').toUpperCase(),
    source: plotMap.get(String(alert.plotId))?.name || text(alert.source || alert.plotId, '系统'),
    summary: text(alert.message || alert.summary || alert.title, '后端告警记录'),
    status: normalizedStatus,
    statusLabel: alertStatusLabel(normalizedStatus),
    levelLabel: levelLabel(alert.level, '提示'),
    sourceLabel: sourceLabel(alert.source || alert.sourceType, '系统'),
    dataOrigin: 'BACKEND'
  };
}

export function mapCropPack(pack = {}) {
  const identity = pack.identity || {};
  const backendStatus = text(pack.backendStatus || pack.status, 'ACTIVE').toUpperCase();
  const rawStatus = ['ACTIVE', 'PUBLISHED', 'ENABLED'].includes(backendStatus) ? 'published' : 'draft';
  const knowledge = pack.knowledge && typeof pack.knowledge === 'object' ? pack.knowledge : {};
  let docs = Array.isArray(knowledge.docs) ? knowledge.docs : Array.isArray(pack.knowledgeDocs) ? pack.knowledgeDocs : [];
  if (!docs.length && Array.isArray(knowledge.documents) && knowledge.documents.some((doc) => doc && typeof doc === 'object')) docs = knowledge.documents;
  if (!docs.length && Array.isArray(knowledge.content) && knowledge.content.length) {
    const content = knowledge.content.map((line) => String(line || '').trim()).filter(Boolean).join('\n');
    if (content) docs = [{ id: `${pack.cropCode || 'crop'}-summary`, title: '知识摘要', content }];
  }
  docs = docs.map((doc, index) => {
    if (typeof doc === 'string') return { id: `${pack.cropCode || 'crop'}-doc-${index + 1}`, title: doc.split('/').pop()?.replace(/\.md$/i, '') || `知识文档 ${index + 1}`, content: '' };
    return {
      ...doc,
      id: doc?.id || `${pack.cropCode || 'crop'}-doc-${index + 1}`,
      title: text(doc?.title || doc?.name, `知识文档 ${index + 1}`).replace(/^#+\s*/, '').trim(),
      content: text(doc?.content || doc?.body || doc?.markdown, '').replace(/^#+\s.*$/gm, '').replace(/^>\s?/gm, '').trim()
    };
  });
  return {
    ...pack,
    id: text(pack.id || pack.cropCode, `pack-${Date.now()}`),
    icon: text(pack.icon, CROP_LABELS[pack.cropCode] ? ({ tomato: '🍅', corn: '🌽', cucumber: '🥒', rice: '🌾', sunflower: '🌻', strawberry: '🍓', pepper: '🌶️' }[pack.cropCode] || '🌱') : '🌱'),
    name: text(identity.name || pack.cropName, text(pack.cropCode, '未命名作物')),
    status: rawStatus,
    backendStatus,
    statusLabel: rawStatus === 'published' ? '已发布' : '草稿',
    stages: asArray(pack.stages).map((stage) => typeof stage === 'string' ? stage : text(stage.label || stage.code, '未命名阶段')),
    knowledgeDocs: docs,
    knowledge: { ...knowledge, docs },
    availableForPlanting: pack.availableForPlanting !== false,
    dataOrigin: 'BACKEND'
  };
}

export function mapAdminRule(rule = {}, index = 0) {
  const rawStatus = text(rule.status, 'published').toLowerCase();
  return {
    ...rule,
    id: text(rule.id || rule.code, `rule-${index + 1}`),
    description: text(rule.description || rule.message || rule.code, '后端规则'),
    type: text(rule.type || rule.metric, '规则'),
    version: text(rule.version || rule.ruleVersion, '—'),
    status: rawStatus,
    statusLabel: rawStatus === 'published' ? '已发布' : '草稿',
    typeLabel: metricLabel(rule.type || rule.metric, '规则'),
    dataOrigin: 'BACKEND'
  };
}

export function mapStrategyCandidate(candidate = {}, index = 0) {
  const rawStatus = text(candidate.status, 'pending').toUpperCase();
  const status = ({ DRAFT: 'pending', OFFLINE_VALIDATED: 'verified', APPROVED: 'approved', REJECTED: 'rejected', ACTIVE: 'active', SUPERSEDED: 'superseded', ROLLED_BACK: 'rolled_back' }[rawStatus] || rawStatus.toLowerCase());
  const rawSource = text(candidate.source || candidate.provenance, 'backend').toLowerCase();
  return {
    ...candidate,
    id: text(candidate.id || candidate.candidateId || candidate.strategyId, `candidate-${index + 1}`),
    candidateId: text(candidate.candidateId || candidate.id || candidate.strategyId, `candidate-${index + 1}`),
    source: rawSource,
    sourceLabel: sourceLabel(rawSource, '后端数据'),
    description: text(candidate.description || candidate.summary || candidate.name, '后端策略候选'),
    status,
    statusLabel: ({ pending: '待验证', verified: '已验证', approved: '已批准', rejected: '已拒绝', active: '生效中', superseded: '已替代', rolled_back: '已回滚' }[status] || statusLabel(status, '未知')),
    dataOrigin: 'BACKEND'
  };
}

export function mapTimelineRecord(entry = {}, plotMap = new Map(), index = 0) {
  const record = entry.record || entry;
  const type = text(entry.type || record.type, 'event').toUpperCase();
  const plotId = text(record.plotId || entry.plotId, '—');
  const traceId = text(record.traceId || record.diagnosisId || record.planId || record.commandId || record.workOrderId || record.inspectionId, `event-${index + 1}`);
  const at = entry.at || record.createdAt || record.evaluatedAt || record.observedAt;
  const result = ['REJECTED', 'FAILED', 'ERROR', 'CANCELLED'].includes(text(record.status).toUpperCase()) ? 'REJECT' : ['DONE', 'COMPLETED', 'PASS', 'APPROVED'].includes(text(record.status).toUpperCase()) ? 'PASS' : 'PENDING';
  const explicitSummary = record.summary || record.message || record.title || record.reason || record.evidenceSummary;
  const derivedSummary = type === 'DIAGNOSIS'
    ? `诊断完成：${displayText(record.primaryCause || record.riskType, '待确认')}`
    : type === 'ALERT'
      ? `告警：${text(record.title || record.source || record.level, '平台规则')}`
      : type === 'IRRIGATION-PLAN'
        ? `生成灌溉处方${record.waterLitre !== undefined ? ` · ${record.waterLitre} 升` : ''}`
        : type === 'COMMAND'
          ? `控制命令：${text(record.action || record.commandType || (record.payload && record.payload.action), '已提交')}${record.deviceId ? ` (目标: ${record.deviceId})` : ''}`
          : type === 'READINESS'
            ? `决策就绪度：${text(record.readinessStatus || record.status, '待评估')}`
            : type === 'INSPECTION'
              ? `巡田记录：${text(record.notes || record.observation, '已提交')}`
              : type === 'WORK-ORDER'
                ? `工单：${text(record.title || record.actionType, '已更新')}`
                : '其他系统事件';
  return {
    traceId,
    time: relativeTime(at),
    timeIso: at || null,
    operator: text(record.operatorName || record.operatorId || record.createdBy || record.updatedBy, '—'),
    plotId,
    type,
    typeLabel: eventTypeLabel(type, '系统事件'),
    summary: displayText(explicitSummary, derivedSummary),
    result,
    passport: {
      trigger: sourceLabel(record.source || record.sourceType, '后端记录'),
      cropPack: text(record.cropPackVersion, '—'),
      ruleVersion: text(record.ruleVersion, '—'),
      ragRef: text(record.knowledgeVersion, '—'),
      similarCase: '—',
      diagnosis: displayText(record.primaryCause || record.riskType, '—'),
      prescription: text(record.waterLitre || record.resultSummary, '—'),
      toolCall: displayText(record.action || record.type, '—'),
      safetyGates: metricStatusLabel(record.readinessStatus || record.quality?.status, '—'),
      riskLevel: levelLabel(record.riskLevel || record.level, '—'),
      execution: record.status ? {
        status: text(record.status),
        rawStatus: text(record.status),
        statusLabel: statusLabel(record.status),
        evaluation: displayText(record.reviewNote || record.evaluation, '—')
      } : null
    },
    dataOrigin: 'BACKEND'
  };
}

export function emptyAdminOverview() {
  return {
    uptime: '—', apiVersion: '—', aiMode: '—', llmModel: '—',
    alerts: { open: 0, acknowledged: 0, closedToday: 0 },
    devices: { total: 0, online: 0, offline: 0 },
    simulator: { running: false, scenario: '', eventsEmitted: 0, sampleIntervalSeconds: 20, timeScale: 144 },
    services: [], recentEvents: [], dataOrigin: 'BACKEND'
  };
}
