const SCENARIOS = {
  normal: { quality: 'GOOD', expected: 'stable' },
  drought: { quality: 'GOOD', expected: 'soil_moisture_decline' },
  'heavy-rain': { quality: 'GOOD', expected: 'soil_moisture_rise' },
  'sensor-drift': { quality: 'DEGRADED', expected: 'quality_gate' },
  'device-offline': { quality: 'BAD', expected: 'device_gate' }
};

const METRICS = [
  { code: 'SOIL_MOISTURE', label: '土壤湿度', unit: '%', availability: 'SUPPORTED', range: { min: 0, max: 100 } },
  { code: 'AIR_TEMPERATURE', label: '空气温度', unit: '°C', availability: 'SUPPORTED', range: { min: -40, max: 80 } },
  { code: 'AIR_HUMIDITY', label: '空气湿度', unit: '%RH', availability: 'SUPPORTED', range: { min: 0, max: 100 } },
  { code: 'LIGHT', label: '光照强度', unit: 'lux', availability: 'SIMULATION_ONLY', range: { min: 0, max: 100000 } },
  { code: 'PH', label: '土壤酸碱度', unit: 'pH', availability: 'SIMULATION_ONLY', range: { min: 0, max: 14 } },
  { code: 'WATER_LEVEL', label: '水箱水位', unit: '%', availability: 'SUPPORTED', range: { min: 0, max: 100 } }
];

const COMMON_FIELDS = {
  schemaVersion: '1.0',
  status: 'ACTIVE',
  ruleVersion: 'rule-1.0.0',
  prescriptionConstraints: { maxDurationSeconds: 900, cooldownMinutes: 120, maxDailyWaterLitres: 5000 },
  forecastProfile: { algorithm: 'robust-trend-v1', horizonsMinutes: [60, 120, 240], minValidSamples: 6, maxStalenessSeconds: 120 },
  coordinationProfile: { stageSensitivity: 0.85, starvationGuardMinutes: 120 },
  scenarios: SCENARIOS,
  testCases: ['normal', 'drought', 'heavy-rain', 'sensor-drift', 'device-offline']
};

function createPack({ cropCode, name, variety, stages, rules, knowledgeVersion, documents, byStage, content, sourceNotes }) {
  return {
    ...COMMON_FIELDS,
    cropCode,
    version: '1.0.0',
    identity: { name, variety, region: '重庆', environment: 'greenhouse' },
    stages,
    metrics: METRICS,
    rules,
    healthProfile: {
      algorithm: 'crop-stage-health-v1',
      metricWeight: 0.70,
      deviceWeight: 0.14,
      riskWeight: 0.16,
      metricWeights: { SOIL_MOISTURE: 0.34, AIR_TEMPERATURE: 0.20, AIR_HUMIDITY: 0.18, LIGHT: 0.10, WATER_LEVEL: 0.10, PH: 0.08 }
    },
    knowledgeVersion,
    knowledge: {
      documents,
      fallback: ['plot', 'region', 'stage', 'crop', 'general'],
      byStage,
      content,
      sourceNotes
    }
  };
}

export const EXTENDED_CROP_PACK_DETAILS = Object.freeze([
  createPack({
    cropCode: 'lettuce',
    name: '生菜',
    variety: 'cool-season-leaf',
    knowledgeVersion: 'kb-1.0.0',
    stages: [
      { code: 'seedling', sequence: 1, label: '育苗期', target: { soilMoistureLow: 45, soilMoistureHigh: 65, airTemperatureLow: 18, airTemperatureHigh: 25, airHumidityLow: 60, airHumidityHigh: 80, lightLow: 8000, lightHigh: 18000, phLow: 6.0, phHigh: 7.0, waterLevelLow: 30, waterLevelHigh: 95 }, riskFocus: ['WATER_DEFICIT', 'HEAT_STRESS'], taskTemplates: [{ actionType: 'INSPECTION', intervalDays: 2, priority: 'MEDIUM' }], knowledgeRef: 'knowledge/seedling.md' },
      { code: 'vegetative', sequence: 2, label: '叶簇生长期', target: { soilMoistureLow: 40, soilMoistureHigh: 60, airTemperatureLow: 15, airTemperatureHigh: 22, airHumidityLow: 55, airHumidityHigh: 75, lightLow: 10000, lightHigh: 24000, phLow: 6.0, phHigh: 7.0, waterLevelLow: 30, waterLevelHigh: 95 }, riskFocus: ['WATER_DEFICIT', 'HEAT_STRESS'], taskTemplates: [{ actionType: 'IRRIGATION_CHECK', intervalDays: 1, priority: 'HIGH' }], knowledgeRef: 'knowledge/vegetative.md' },
      { code: 'flowering', sequence: 3, label: '结球/采收前期', target: { soilMoistureLow: 38, soilMoistureHigh: 58, airTemperatureLow: 15, airTemperatureHigh: 24, airHumidityLow: 50, airHumidityHigh: 70, lightLow: 10000, lightHigh: 26000, phLow: 6.0, phHigh: 7.0, waterLevelLow: 30, waterLevelHigh: 95 }, riskFocus: ['WATER_DEFICIT', 'HEAT_STRESS'], taskTemplates: [{ actionType: 'INSPECTION', intervalDays: 2, priority: 'MEDIUM' }], knowledgeRef: 'knowledge/flowering.md' },
      { code: 'fruiting', sequence: 4, label: '采收期', target: { soilMoistureLow: 35, soilMoistureHigh: 55, airTemperatureLow: 15, airTemperatureHigh: 24, airHumidityLow: 50, airHumidityHigh: 70, lightLow: 10000, lightHigh: 26000, phLow: 6.0, phHigh: 7.0, waterLevelLow: 30, waterLevelHigh: 95 }, riskFocus: ['WATER_DEFICIT', 'HEAT_STRESS'], taskTemplates: [{ actionType: 'IRRIGATION_CHECK', intervalDays: 1, priority: 'HIGH' }], knowledgeRef: 'knowledge/fruiting.md' }
    ],
    rules: [
      { code: 'WATER_DEFICIT', metric: 'SOIL_MOISTURE', operator: 'LT', threshold: 32, durationMinutes: 10, hysteresis: 2, cooldownMinutes: 120 },
      { code: 'HEAT_STRESS', metric: 'AIR_TEMPERATURE', operator: 'GT', threshold: 28, durationMinutes: 10, hysteresis: 1, cooldownMinutes: 60 },
      { code: 'COLD_STRESS', metric: 'AIR_TEMPERATURE', operator: 'LT', threshold: 8, durationMinutes: 10, hysteresis: 1, cooldownMinutes: 60 }
    ],
    documents: ['知识/生菜设施栽培技术要领', '农业农村部·2025年夏季蔬菜生产技术指导意见'],
    byStage: {
      seedling: ['生菜喜凉，育苗期保持苗床湿润但不积水，避免高温造成徒长。', '播后至出苗可保持 20~25°C；出苗后逐步降温，优先保证通风和整齐出苗。', '高温或低质量数据时先检查基质和滴灌，不能仅凭单次读数增加灌水。'],
      vegetative: ['叶簇生长期以稳定根区水分为主，土壤湿度参考 40%~60%，采用少量多次灌溉。', '晴热天气使用通风和适度遮阳，叶菜可在高温时段减少直射光和蒸腾压力。', '叶面有积水或棚内湿度过高时先通风排湿，降低病害风险。'],
      flowering: ['结球或采收前期避免忽干忽湿，灌溉前同时核对湿度趋势、排水和设备状态。', '追肥遵循薄肥勤施，叶菜以氮肥为主并兼顾磷钾，禁止把模型参考区间当成施肥处方。', '连续阴雨或低温时降低灌水频次，发现萎蔫先区分缺水、烂根和病害。'],
      fruiting: ['采收期保持根区湿润而不积水，清晨或傍晚小水灌溉，采收前避免大水造成品质波动。', '上市前 3~5 天可根据光照和品质目标调整遮阳，具体以当地品种和天气为准。', '传感器漂移、设备离线或数据质量不足时只做巡田和复测，不生成可执行处方。']
    },
    content: ['# 生菜设施栽培指导', '', '生菜属于喜凉叶菜，根区应保持湿润、通气，避免高温和积水。', '高温期采用通风、适度遮阳和少量多次供水；低温阴雨期减少灌水并及时排湿。', '以上参数是重庆温室演示参考，品种、季节和基质不同需由农技人员校准。'],
    sourceNotes: [
      '三明市农业农村局《温室生菜栽培技术要领》（2026-04-08）：http://smsnyj.sm.gov.cn/nyfw/nyjs/zzy/202604/t20260408_2200877.htm',
      '农业农村部《2025年夏季蔬菜生产技术指导意见》：https://www.moa.gov.cn/gk/nszd_1/2025n/202506/t20250623_6474873.htm'
    ]
  }),
  createPack({
    cropCode: 'eggplant',
    name: '茄子',
    variety: 'greenhouse-demo',
    knowledgeVersion: 'kb-1.0.0',
    stages: [
      { code: 'seedling', sequence: 1, label: '育苗期', target: { soilMoistureLow: 35, soilMoistureHigh: 55, airTemperatureLow: 22, airTemperatureHigh: 30, airHumidityLow: 65, airHumidityHigh: 85, lightLow: 12000, lightHigh: 28000, phLow: 6.0, phHigh: 6.8, waterLevelLow: 30, waterLevelHigh: 95 }, riskFocus: ['WATER_DEFICIT', 'COLD_STRESS'], taskTemplates: [{ actionType: 'INSPECTION', intervalDays: 2, priority: 'MEDIUM' }], knowledgeRef: 'knowledge/seedling.md' },
      { code: 'vegetative', sequence: 2, label: '营养生长期', target: { soilMoistureLow: 30, soilMoistureHigh: 50, airTemperatureLow: 20, airTemperatureHigh: 30, airHumidityLow: 60, airHumidityHigh: 80, lightLow: 18000, lightHigh: 36000, phLow: 6.0, phHigh: 6.8, waterLevelLow: 30, waterLevelHigh: 95 }, riskFocus: ['WATER_DEFICIT', 'HEAT_STRESS'], taskTemplates: [{ actionType: 'IRRIGATION_CHECK', intervalDays: 1, priority: 'HIGH' }], knowledgeRef: 'knowledge/vegetative.md' },
      { code: 'flowering', sequence: 3, label: '开花坐果期', target: { soilMoistureLow: 28, soilMoistureHigh: 48, airTemperatureLow: 23, airTemperatureHigh: 30, airHumidityLow: 55, airHumidityHigh: 75, lightLow: 20000, lightHigh: 42000, phLow: 6.0, phHigh: 6.8, waterLevelLow: 30, waterLevelHigh: 95 }, riskFocus: ['WATER_DEFICIT', 'HEAT_STRESS'], taskTemplates: [{ actionType: 'INSPECTION', intervalDays: 2, priority: 'MEDIUM' }], knowledgeRef: 'knowledge/flowering.md' },
      { code: 'fruiting', sequence: 4, label: '结果采收期', target: { soilMoistureLow: 28, soilMoistureHigh: 48, airTemperatureLow: 25, airTemperatureHigh: 30, airHumidityLow: 55, airHumidityHigh: 75, lightLow: 20000, lightHigh: 42000, phLow: 6.0, phHigh: 6.8, waterLevelLow: 30, waterLevelHigh: 95 }, riskFocus: ['WATER_DEFICIT', 'HEAT_STRESS'], taskTemplates: [{ actionType: 'IRRIGATION_CHECK', intervalDays: 1, priority: 'HIGH' }], knowledgeRef: 'knowledge/fruiting.md' }
    ],
    rules: [
      { code: 'WATER_DEFICIT', metric: 'SOIL_MOISTURE', operator: 'LT', threshold: 22, durationMinutes: 5, hysteresis: 2, cooldownMinutes: 120 },
      { code: 'HEAT_STRESS', metric: 'AIR_TEMPERATURE', operator: 'GT', threshold: 35, durationMinutes: 10, hysteresis: 1, cooldownMinutes: 60 },
      { code: 'COLD_STRESS', metric: 'AIR_TEMPERATURE', operator: 'LT', threshold: 15, durationMinutes: 10, hysteresis: 1, cooldownMinutes: 60 }
    ],
    documents: ['北京市农业技术推广站·春季大棚茄子生产前期技术要点', '农业农村部·2025年夏季蔬菜生产技术指导意见'],
    byStage: {
      seedling: ['茄子喜温，育苗期保持温度稳定和基质湿润，避免低温高湿导致根系受损。', '定植前应确认苗龄、真叶数和地温，缓苗期以保温为主，过热时小通风。', '浇水应看根区湿度和天气，不能用短时萎蔫直接替代诊断。'],
      vegetative: ['营养生长期适度控水蹲苗，促进根系下扎和营养生长向生殖生长过渡。', '白天温度接近 25~30°C 时加强通风，及时整枝、绑蔓，保持群体透光。', '水肥采用少量多次和薄肥勤施，果菜类需兼顾钙、镁等中微量元素。'],
      flowering: ['开花坐果期避免大幅温湿度波动；高温尤其是夜温偏高时关注落花落果。', '门茄坐稳前适度控水，坐果后再根据土壤湿度和负载逐步增加供水。', '雨后或棚内湿度过高时优先排水、通风，减少病害和沤根风险。'],
      fruiting: ['结果采收期每 7~10 天的管理节奏只作农艺参考，实际灌溉仍以根区湿度、天气和设备能力为准。', '高温期优先清晨或傍晚小水灌溉，避免午后大水造成根区温差和病害风险。', '数据质量不足或传感器漂移时先巡田、复测和检查流量，不直接生成可执行处方。']
    },
    content: ['# 茄子设施栽培指导', '', '茄子缓苗后逐步通风降温，开花坐果期适度控水，坐果后采用少量多次供水。', '高温期关注保花保果，雨后及时排水；水肥一体化应结合设备流量和土壤湿度校准。', '以上参数是重庆温室演示参考，露地、品种和季节变化时应重新校准。'],
    sourceNotes: [
      '北京市农业技术推广站《春季大棚茄子生产前期技术要点》：https://nyncj.beijing.gov.cn/nyj/jcsn/jqkxc_zxgjc78/jqsy/326161007/index.html',
      '农业农村部《2025年夏季蔬菜生产技术指导意见》：https://www.moa.gov.cn/gk/nszd_1/2025n/202506/t20250623_6474873.htm'
    ]
  })
]);
