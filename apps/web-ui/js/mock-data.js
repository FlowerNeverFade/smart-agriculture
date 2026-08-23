/**
 * AgriLoop Frontend - High-Fidelity Mock & Fallback Data
 * Matches backend contracts and domain schemas
 */

export const MOCK_DATA = {
  system: {
    mode: "standalone",
    aiMode: "rules-only",
    database: "UP",
    redis: "UP",
    redisStream: "agri.telemetry",
    mqtt: "UP",
    persistence: "POSTGRESQL",
    version: "v1.2-alpha",
    liveConnected: false
  },

  currentUser: {
    userId: "user-admin",
    username: "admin",
    role: "FARM_ADMIN",
    roleLabel: "农场管理员",
    farmIds: ["farm-demo"],
    plotIds: ["plot-a01", "plot-a02", "plot-b01"],
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=AgriLoopAdmin"
  },

  farms: [
    {
      farmId: "farm-demo",
      name: "农智示范农场",
      region: "重庆 · 科学城",
      areaTotalM2: 240,
      cropCount: 2,
      plotCount: 3,
      waterPricePerLitre: 0.004,
      labourPricePerHour: 35.0
    }
  ],

  plots: [
    {
      plotId: "plot-a01",
      name: "A01 番茄示范田",
      cropCode: "tomato",
      cropName: "优质番茄",
      cropVariety: "千禧水果番茄",
      stageCode: "fruiting",
      stageLabel: "挂果采收期",
      areaM2: 120,
      riskLevel: "HIGH",
      healthScore: 0.94,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-a01",
      lastSeen: "刚刚",
      metrics: {
        SOIL_MOISTURE: { value: 16.8, unit: "%", status: "WARN", label: "土壤湿度", target: "20~40%" },
        AIR_TEMPERATURE: { value: 26.4, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~32°C" },
        LIGHT: { value: 43500, unit: "lux", status: "NORMAL", label: "光照强度", target: "10k~70k lux" },
        CO2: { value: 680, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        SOIL_EC: { value: 1.4, unit: "mS/cm", status: "NORMAL", label: "土壤 EC 值", target: "1.0~2.2 mS/cm" },
        NPK_RATIO: { value: "180:95:210", unit: "mg/kg", status: "NORMAL", label: "氮磷钾肥力", target: "均衡充足" }
      }
    },
    {
      plotId: "plot-a02",
      name: "A02 玉米高产田",
      cropCode: "corn",
      cropName: "鲜食玉米",
      cropVariety: "甜糯双色 8 号",
      stageCode: "flowering",
      stageLabel: "开花抽雄期",
      areaM2: 120,
      riskLevel: "LOW",
      healthScore: 0.98,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-a02",
      lastSeen: "1分钟前",
      metrics: {
        SOIL_MOISTURE: { value: 28.5, unit: "%", status: "NORMAL", label: "土壤湿度", target: "25~45%" },
        AIR_TEMPERATURE: { value: 27.2, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~32°C" },
        LIGHT: { value: 46800, unit: "lux", status: "NORMAL", label: "光照强度", target: "10k~70k lux" },
        CO2: { value: 710, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        SOIL_EC: { value: 1.6, unit: "mS/cm", status: "NORMAL", label: "土壤 EC 值", target: "1.2~2.4 mS/cm" },
        NPK_RATIO: { value: "195:102:220", unit: "mg/kg", status: "NORMAL", label: "氮磷钾肥力", target: "均衡充足" }
      }
    },
    {
      plotId: "plot-a03",
      name: "A03 黄瓜立体架",
      cropCode: "cucumber",
      cropName: "水果黄瓜",
      cropVariety: "金童水果黄瓜",
      stageCode: "vegetative",
      stageLabel: "营养生长期",
      areaM2: 120,
      riskLevel: "LOW",
      healthScore: 0.99,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-a03",
      lastSeen: "2分钟前",
      metrics: {
        SOIL_MOISTURE: { value: 26.2, unit: "%", status: "NORMAL", label: "土壤湿度", target: "22~40%" },
        AIR_TEMPERATURE: { value: 25.8, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~30°C" },
        LIGHT: { value: 41200, unit: "lux", status: "NORMAL", label: "光照强度", target: "10k~60k lux" },
        CO2: { value: 660, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        SOIL_EC: { value: 1.3, unit: "mS/cm", status: "NORMAL", label: "土壤 EC 值", target: "1.0~2.0 mS/cm" },
        NPK_RATIO: { value: "170:90:200", unit: "mg/kg", status: "NORMAL", label: "氮磷钾肥力", target: "均衡充足" }
      }
    },
    {
      plotId: "plot-b01",
      name: "B01 生态水稻田",
      cropCode: "rice",
      cropName: "生态水稻",
      cropVariety: "渝香优 203",
      stageCode: "vegetative",
      stageLabel: "分蘖生长期",
      areaM2: 150,
      riskLevel: "LOW",
      healthScore: 0.99,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-b01",
      lastSeen: "刚刚",
      metrics: {
        SOIL_MOISTURE: { value: 35.4, unit: "%", status: "NORMAL", label: "田面湿度", target: "30~55%" },
        AIR_TEMPERATURE: { value: 25.1, unit: "°C", status: "NORMAL", label: "环境温度", target: "20~30°C" },
        LIGHT: { value: 39500, unit: "lux", status: "NORMAL", label: "光照强度", target: "10k~60k lux" },
        CO2: { value: 650, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        SOIL_EC: { value: 1.3, unit: "mS/cm", status: "NORMAL", label: "土壤 EC 值", target: "0.8~1.8 mS/cm" },
        NPK_RATIO: { value: "175:88:190", unit: "mg/kg", status: "NORMAL", label: "氮磷钾肥力", target: "均衡充足" }
      }
    },
    {
      plotId: "plot-b02",
      name: "B02 向日葵花海",
      cropCode: "sunflower",
      cropName: "油葵花海",
      cropVariety: "金色阳光 3 号",
      stageCode: "flowering",
      stageLabel: "盛花结盘期",
      areaM2: 150,
      riskLevel: "LOW",
      healthScore: 0.97,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-b02",
      lastSeen: "1分钟前",
      metrics: {
        SOIL_MOISTURE: { value: 24.8, unit: "%", status: "NORMAL", label: "土壤湿度", target: "20~38%" },
        AIR_TEMPERATURE: { value: 27.6, unit: "°C", status: "NORMAL", label: "空气温度", target: "20~32°C" },
        LIGHT: { value: 52000, unit: "lux", status: "NORMAL", label: "光照强度", target: "35k~65k lux" },
        CO2: { value: 690, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        SOIL_EC: { value: 1.5, unit: "mS/cm", status: "NORMAL", label: "土壤 EC 值", target: "1.0~2.2 mS/cm" },
        NPK_RATIO: { value: "185:92:205", unit: "mg/kg", status: "NORMAL", label: "氮磷钾肥力", target: "均衡充足" }
      }
    },
    {
      plotId: "plot-b03",
      name: "B03 草莓精品区",
      cropCode: "strawberry",
      cropName: "红颊草莓",
      cropVariety: "红颜高架草莓",
      stageCode: "fruiting",
      stageLabel: "挂果采收期",
      areaM2: 140,
      riskLevel: "LOW",
      healthScore: 0.99,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-b03",
      lastSeen: "2分钟前",
      metrics: {
        SOIL_MOISTURE: { value: 31.0, unit: "%", status: "NORMAL", label: "基质湿度", target: "25~45%" },
        AIR_TEMPERATURE: { value: 23.8, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~28°C" },
        LIGHT: { value: 38000, unit: "lux", status: "NORMAL", label: "光照强度", target: "25k~48k lux" },
        CO2: { value: 740, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "600~900 ppm" },
        SOIL_EC: { value: 1.2, unit: "mS/cm", status: "NORMAL", label: "基质 EC 值", target: "0.8~1.6 mS/cm" },
        NPK_RATIO: { value: "160:85:195", unit: "mg/kg", status: "NORMAL", label: "氮磷钾肥力", target: "均衡充足" }
      }
    },
    {
      plotId: "plot-c01",
      name: "C01 智能连栋温室",
      cropCode: "tomato",
      cropName: "设施番茄",
      cropVariety: "荷兰瑞克斯水果番茄",
      stageCode: "fruiting",
      stageLabel: "挂果采收期",
      areaM2: 260,
      riskLevel: "LOW",
      healthScore: 0.99,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-c01",
      lastSeen: "刚刚",
      metrics: {
        SOIL_MOISTURE: { value: 32.5, unit: "%", status: "NORMAL", label: "基质湿度", target: "28~45%" },
        AIR_TEMPERATURE: { value: 24.5, unit: "°C", status: "NORMAL", label: "室内温度", target: "22~28°C" },
        LIGHT: { value: 45000, unit: "lux", status: "NORMAL", label: "补光强度", target: "35k~55k lux" },
        CO2: { value: 820, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "700~1000 ppm" },
        SOIL_EC: { value: 1.8, unit: "mS/cm", status: "NORMAL", label: "营养液 EC", target: "1.4~2.2 mS/cm" },
        NPK_RATIO: { value: "210:110:240", unit: "mg/L", status: "NORMAL", label: "水肥浓度", target: "精准供给" }
      }
    }
  ],

  feedItems: [
    {
      id: "feed-101",
      type: "DIAGNOSIS",
      category: "根因诊断 · 风险分析",
      title: "【温室 1 号棚】检测到土壤持续缺水风险，完成多因果排查",
      plotId: "plot-a01",
      plotName: "温室 1 号棚 (番茄 · 结果期)",
      timestamp: "5 分钟前",
      timeIso: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      badge: { text: "WATER_DEFICIT", color: "amber" },
      author: { name: "AgriLoop 规则与诊断内核", tag: "Core AI", avatar: "🤖" },
      summary: "土壤湿度降至 16.8%（低于番茄结果期基线 20%），系统已完成干旱与传感器漂移分流校验，确认数据质量良好，置信度 92%。",
      details: {
        primaryCause: "WATER_DEFICIT (真实土壤缺水)",
        confidence: 0.92,
        sensorDriftScore: 0.08,
        deviceFaultScore: 0.05,
        supportingEvidence: [
          "遥测指标 SOIL_MOISTURE 连续 3 个采样周期低于 20%",
          "空气温度 26.4°C，光照 42,500 lux，蒸散速率加快",
          "数据新鲜度 200ms，校验状态 GOOD"
        ],
        opposingEvidence: ["无突发阶跃跳变，排除传感器接触不良"]
      },
      actions: [
        { label: "生成灌溉处方", type: "primary", action: "generate-prescription", plotId: "plot-a01" },
        { label: "查看诊断详情", type: "secondary", action: "open-subview", view: "decision-console", plotId: "plot-a01" },
        { label: "申请巡田核验", type: "ghost", action: "open-subview", view: "work-orders", plotId: "plot-a01" }
      ]
    },
    {
      id: "feed-102",
      type: "PRESCRIPTION",
      category: "结构化农业处方 · 就绪度通过",
      title: "【温室 1 号棚】灌溉处方待审批 (建议时长 8.5 分钟 / 153 升)",
      plotId: "plot-a01",
      plotName: "温室 1 号棚 (番茄 · 结果期)",
      timestamp: "3 分钟前",
      timeIso: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      badge: { text: "READY · 可执行", color: "green" },
      author: { name: "处方决策引擎", tag: "Prescription", avatar: "💧" },
      summary: "基于地块面积 80㎡、番茄果实膨大期耗水模型及水泵流量 (18L/min)，生成目标湿度由 16.8% 补至 30.0% 的结构化补水方案。",
      details: {
        planId: "plan-a01-20260822",
        waterLitre: 153.0,
        durationSeconds: 510,
        durationFormatted: "8 分 30 秒",
        window: "立即 ~ 35分钟内执行最佳",
        hardGates: {
          "遥测完整性": "PASS",
          "数据新鲜度 (200ms)": "PASS",
          "数据质量评分": "PASS (GOOD)",
          "设备在线状态": "PASS (ONLINE)",
          "水资源容量 (余量充足)": "PASS",
          "时长安全限值 (≤900s)": "PASS"
        },
        readinessScore: 0.98,
        costEstimate: "约 0.61 元 (水价 0.004元/L)"
      },
      actions: [
        { label: "⚡ 一键虚拟下发执行", type: "success", action: "execute-irrigation", planId: "plan-a01-20260822", plotId: "plot-a01" },
        { label: "调处方参数", type: "secondary", action: "open-subview", view: "decision-console", plotId: "plot-a01" },
        { label: "查看决策护照", type: "ghost", action: "open-subview", view: "decision-passport", traceId: "run-20260822-001" }
      ]
    },
    {
      id: "feed-103",
      type: "FORECAST",
      category: "未来风险预测 · Time-to-Risk",
      title: "【全场未来趋势】缺水与高温风险确定性演进推演",
      plotId: "plot-a01",
      plotName: "全场地块综合推演",
      timestamp: "15 分钟前",
      timeIso: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      badge: { text: "PREDICTION · 1~4h", color: "blue" },
      author: { name: "Robust Trend 趋势推演模型", tag: "Forecast", avatar: "🔮" },
      summary: "若维持当前蒸散速率且不采取补水措施，温室 1 号棚将在 72 分钟内触达极限水分胁迫边界 (14%)；温室 2 号棚与 3 号棚未来 4 小时内处于安全适宜带。",
      details: {
        timeToRiskMinutes: 72,
        horizons: [
          { minute: 60, expectedMoisture: 15.2, band: "14.4% ~ 16.0%" },
          { minute: 120, expectedMoisture: 13.8, band: "12.6% ~ 15.0%" },
          { minute: 240, expectedMoisture: 11.5, band: "9.8% ~ 13.2%" }
        ],
        assumptions: ["无降水/无外界灌溉", "棚室通风与外部光热保持稳定"]
      },
      actions: [
        { label: "查看风险曲线与推演", type: "secondary", action: "open-subview", view: "risk-forecast", plotId: "plot-a01" },
        { label: "一键情景模拟对比", type: "ghost", action: "open-subview", view: "scenario-replay" }
      ]
    },
    {
      id: "feed-104",
      type: "WORK_ORDER",
      category: "今日农务 · 巡检与工单",
      title: "【今日待办】温室 3 号棚例行水肥电导度核验 & 番茄地块疏叶",
      plotId: "plot-b01",
      plotName: "温室 3 号棚 (黄瓜 · 营养生长期)",
      timestamp: "35 分钟前",
      timeIso: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      badge: { text: "2 项待执行", color: "purple" },
      author: { name: "农务协同调度中心", tag: "Work Orders", avatar: "📋" },
      summary: "根据 Crop Pack 作物全周期计划生成常规巡田工单，含水肥 EC/pH 便携式仪器采样抽检、温室 1 号棚下部老叶摘除。",
      details: {
        tasks: [
          { name: "温室3号棚土壤便携仪校准比对", priority: "MEDIUM", status: "PENDING", due: "16:30 前" },
          { name: "温室1号棚番茄第4穗花疏花打杈", priority: "LOW", status: "PENDING", due: "18:00 前" }
        ]
      },
      actions: [
        { label: "进入工单中心", type: "secondary", action: "open-subview", view: "work-orders" },
        { label: "录入人工巡田数据", type: "ghost", action: "open-subview", view: "work-orders", actionType: "new-inspection" }
      ]
    }
  ],

  resourceProfile: {
    resourcePlanId: "resource-default",
    resourceType: "WATER (示范农场集中蓄水池)",
    capacityLitres: 900.0,
    dailyLimitLitres: 5000.0,
    usedTodayLitres: 1240.0,
    remainingLitres: 3760.0,
    flowRateLitresPerMinute: 18.0,
    activeConflicts: 0,
    status: "FEASIBLE"
  },

  cropPacks: [
    {
      cropCode: "tomato",
      name: "番茄 (Tomato)",
      version: "1.0.0",
      ruleVersion: "rule-1.0.0",
      stages: ["seedling (苗期)", "vegetative (营养生长)", "flowering (开花坐果)", "fruiting (果实成熟)"],
      rulesCount: 2,
      knowledgeDocs: ["knowledge/irrigation.md"],
      description: "番茄需水敏感，结果期土壤含水率维持在 20%~40% 最佳，过湿易裂果，过干易脐腐。"
    },
    {
      cropCode: "cucumber",
      name: "黄瓜 (Cucumber)",
      version: "1.0.0",
      ruleVersion: "rule-1.0.0",
      stages: ["seedling (苗期)", "vegetative (营养生长)", "flowering (初花期)", "fruiting (采收盛期)"],
      rulesCount: 2,
      knowledgeDocs: ["knowledge/irrigation.md"],
      description: "黄瓜根系浅、喜湿怕涝，要求空气湿度 70%~90%、土壤湿度 25%~45%。"
    }
  ],

  changelog: [
    {
      time: "2026-08-22 14:30",
      tag: "v1.2",
      title: "数据主线持久化去重与命令幂等锁升级",
      content: "重构持久化事件去重机制，命令超时或失败时不占用 120min 灌溉冷却。"
    },
    {
      time: "2026-08-21 17:00",
      tag: "CropPack",
      title: "加载番茄与黄瓜双作物标准化包",
      content: "新增 6 类统一指标（土壤湿度、气温、光照、CO2、pH、水位）及生长阶段动态包络。"
    },
    {
      time: "2026-08-20 10:15",
      tag: "Security",
      title: "RBAC 细粒度权限与决策护照全链路审计",
      content: "提供系统管理员、农场主管、田间操作员三级隔离；每次建议保留完整 TraceId。"
    }
  ],

  subviewsMeta: {
    "plot-detail": {
      title: "地块详情与时序遥测趋势 (Plot Telemetry Trends)",
      desc: "包含 7/24/168 小时多指标时序趋势、动态生长包络、设备健康度指标与硬件心跳状态",
      tags: ["B-01", "B-02", "B-03", "B-06"],
      status: "模块独立路由就绪 · 可单独定制"
    },
    "decision-console": {
      title: "智能诊断与决策中枢 (AI Diagnosis & Decision Console)",
      desc: "根因推断树、多假设因果打分、规则优先与 RAG 知识支撑、处方试算与下发控制台",
      tags: ["CAP-04", "CAP-05", "CAP-08", "B-07"],
      status: "模块独立路由就绪 · 可单独定制"
    },
    "work-orders": {
      title: "今日农务与巡田核验中心 (Today's Work & Field Inspection)",
      desc: "农事工单流转、巡田观察证据录入、人机证据融合与现场照片/参数核验",
      tags: ["CAP-01", "CAP-02", "CAP-03"],
      status: "模块独立路由就绪 · 可单独定制"
    },
    "risk-forecast": {
      title: "未来风险预测与推演 (Risk Forecast & Time-to-Risk)",
      desc: "1/2/4 小时确定性趋势推演、Time-to-Risk 倒计时、置信区间与气象失效假设",
      tags: ["CAP-09"],
      status: "模块独立路由就绪 · 可单独定制"
    },
    "resource-coordination": {
      title: "多地块水资源协同排程 (Resource & Water Coordination)",
      desc: "有限水源与管网容量约束下的多地块灌溉优先级排班、冲突检测与平抑算法",
      tags: ["CAP-11"],
      status: "模块独立路由就绪 · 可单独定制"
    },
    "value-ledger": {
      title: "经营价值与效益对账本 (Value Ledger & Accounting)",
      desc: "计划 vs 实际用水偏差率、节水量核算、电耗与工时节约估算、反事实推演",
      tags: ["CAP-07", "CAP-12"],
      status: "模块独立路由就绪 · 可单独定制"
    },
    "decision-passport": {
      title: "可信决策护照与全链路审计 (Decision Passport & Audit Log)",
      desc: "输入遥测快照、证据链、白名单工具调用、审批记录、执行 ACK 与效果闭环追溯",
      tags: ["CAP-13", "B-10"],
      status: "模块独立路由就绪 · 可单独定制"
    },
    "scenario-replay": {
      title: "情景模拟器与双轨回放 (Scenario Simulator & Dual Replay)",
      desc: "干旱、热浪、暴雨、传感器漂移一键推演；同一 Seed 下执行 vs 不执行双轨对比",
      tags: ["Gate 2", "Gate 3", "Simulator"],
      status: "模块独立路由就绪 · 可单独定制"
    },
    "crop-packs": {
      title: "作物包全景与规则注册表 (Crop Pack Registry)",
      desc: "番茄、黄瓜等作物生长阶段、指标定义、适宜区间、阈值规则与知识文档管理",
      tags: ["Crop Pack", "Schema 1.0"],
      status: "模块独立路由就绪 · 可单独定制"
    }
  }
};
