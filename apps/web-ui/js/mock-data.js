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
      healthScore: 0.52,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-a01",
      lastSeen: "刚刚",
      metrics: {
        SOIL_MOISTURE: { value: 16.8, unit: "%", status: "ALERT", label: "土壤湿度", target: "20~40%" },
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
      healthScore: 0.88,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-a02",
      lastSeen: "1分钟前",
      metrics: {
        SOIL_MOISTURE: { value: 28.5, unit: "%", status: "NORMAL", label: "土壤湿度", target: "25~45%" },
        AIR_TEMPERATURE: { value: 27.2, unit: "°C", status: "NORMAL", label: "空气温度", target: "22~32°C" },
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
      healthScore: 0.72,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-a03",
      lastSeen: "2分钟前",
      metrics: {
        SOIL_MOISTURE: { value: 26.2, unit: "%", status: "WARN", label: "土壤湿度", target: "28~48%" },
        AIR_TEMPERATURE: { value: 25.8, unit: "°C", status: "NORMAL", label: "空气温度", target: "19~30°C" },
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
      healthScore: 0.88,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-b01",
      lastSeen: "刚刚",
      metrics: {
        SOIL_MOISTURE: { value: 35.4, unit: "%", status: "NORMAL", label: "田面湿度", target: "30~55%" },
        AIR_TEMPERATURE: { value: 25.1, unit: "°C", status: "NORMAL", label: "环境温度", target: "25~32°C" },
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
      healthScore: 0.88,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-b02",
      lastSeen: "1分钟前",
      metrics: {
        SOIL_MOISTURE: { value: 24.8, unit: "%", status: "NORMAL", label: "土壤湿度", target: "20~38%" },
        AIR_TEMPERATURE: { value: 27.6, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~28°C" },
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
      healthScore: 0.88,
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
      healthScore: 0.88,
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
      summary: "基于地块面积 120㎡、番茄果实膨大期耗水模型及水泵流量 (18L/min)，生成目标湿度由 16.8% 补至 30.0% 的结构化补水方案。",
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

  // farm-operations 分支的增量合同：只补充工单/巡田数据，不覆盖 main 的
  // 多作物、预测、Crop Pack 与价值账本演示数据。
  workOrders: [
    {
      workOrderId: "wo-alert-a01",
      workItemId: "wo-alert-a01",
      plotId: "plot-a01",
      sourceType: "ALERT",
      sourceRef: "alert-water-a01",
      actionType: "IRRIGATION_REVIEW",
      title: "核对缺水告警并审批补水处方",
      reason: "土壤湿度连续低于番茄结果期目标下限",
      priority: "HIGH",
      status: "OPEN",
      assigneeId: null,
      dueAt: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      provenance: "DERIVED"
    },
    {
      workOrderId: "wo-inspect-b01",
      workItemId: "wo-inspect-b01",
      plotId: "plot-b01",
      sourceType: "CROP_PLAN",
      sourceRef: "task-template-cucumber-ec",
      actionType: "INSPECTION",
      title: "黄瓜棚水肥 EC/pH 便携仪比对",
      reason: "Crop Pack 营养生长期例行核验",
      priority: "MEDIUM",
      status: "ASSIGNED",
      assigneeId: "user-farmer",
      dueAt: new Date(Date.now() + 2.2 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      provenance: "DERIVED"
    },
    {
      workOrderId: "wo-prune-a02",
      workItemId: "wo-prune-a02",
      plotId: "plot-a02",
      sourceType: "CROP_PLAN",
      sourceRef: "task-template-tomato-prune",
      actionType: "FIELD_OPERATION",
      title: "番茄第 4 穗花疏花打杈",
      reason: "开花坐果期标准农务",
      priority: "LOW",
      status: "IN_PROGRESS",
      assigneeId: "user-farmer",
      dueAt: new Date(Date.now() + 4.5 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      provenance: "DERIVED"
    },
    {
      workOrderId: "wo-device-a02",
      workItemId: "wo-device-a02",
      plotId: "plot-a02",
      sourceType: "DEVICE_HEALTH",
      sourceRef: "mock-plot-a02",
      actionType: "DEVICE_CHECK",
      title: "检查 A02 流量计心跳延迟",
      reason: "设备新鲜度短时下降，需完成复测",
      priority: "MEDIUM",
      status: "DONE",
      assigneeId: "user-farmer",
      dueAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      provenance: "DERIVED"
    }
  ],

  inspections: [
    {
      inspectionId: "ins-demo-a01",
      plotId: "plot-a01",
      operatorId: "user-farmer",
      observedAt: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
      soilSurface: "DRY",
      cropCondition: "LEAF_SLIGHT_WILT",
      deviceStatus: "NORMAL",
      portableSoilMoisture: 17.2,
      notes: "表层干燥，无明显渗漏，建议继续核对流量计。",
      provenance: "USER_PROVIDED",
      sourceType: "HUMAN_OBSERVATION",
      quality: { status: "GOOD", completeness: 1.0 }
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
      description: "黄瓜根系浅、喜湿怕涝，要求空气湿度 70%~90%、营养生长期土壤湿度 28%~48%。"
    },
    {
      cropCode: "corn",
      name: "玉米 (Corn)",
      version: "1.0.0",
      ruleVersion: "rule-1.0.0",
      stages: ["seedling (苗期)", "vegetative (拔节期)", "flowering (抽雄开花期)", "fruiting (灌浆成熟期)"],
      rulesCount: 2,
      knowledgeDocs: ["knowledge/irrigation.md"],
      description: "玉米拔节至灌浆期为需水临界期，抽雄开花期土壤湿度维持 60%~75% 最佳，缺水易秃尖缺粒。"
    },
    {
      cropCode: "rice",
      name: "水稻 (Rice)",
      version: "1.0.0",
      ruleVersion: "rule-1.0.0",
      stages: ["seedling (秧苗期)", "vegetative (分蘖期)", "flowering (抽穗扬花期)", "fruiting (灌浆成熟期)"],
      rulesCount: 2,
      knowledgeDocs: ["knowledge/irrigation.md"],
      description: "水稻喜水耐淹，分蘖期保持浅水层，抽穗扬花期田面湿度 85%~100%，需防范高温热害与干旱断水。"
    },
    {
      cropCode: "sunflower",
      name: "向日葵 (Sunflower)",
      version: "1.0.0",
      ruleVersion: "rule-1.0.0",
      stages: ["seedling (苗期)", "vegetative (现蕾期)", "flowering (开花结盘期)", "fruiting (灌浆成熟期)"],
      rulesCount: 2,
      knowledgeDocs: ["knowledge/irrigation.md"],
      description: "向日葵耐旱怕涝，现蕾至开花为需水临界期，土壤湿度 50%~65% 最佳，过湿易倒伏感病。"
    }
  ],

  // yyx 分支的 P1/P2 前端数据合同：作物包、确定性预测/情景和价值口径。
  // 这些数据只用于离线演示；在线时 ApiService 会优先读取后端并做合同归一化。
  cropPackDetails: [
    {
      cropCode: "tomato",
      version: "1.0.0",
      schemaVersion: "1.0",
      identity: { name: "番茄", variety: "demonstration", region: "重庆" },
      stages: [
        { code: "seedling", sequence: 1, label: "苗期", target: { soilMoistureLow: 30, soilMoistureHigh: 50, airTemperatureLow: 18, airTemperatureHigh: 28 }, riskFocus: ["WATER_DEFICIT", "COLD_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] },
        { code: "vegetative", sequence: 2, label: "营养生长期", target: { soilMoistureLow: 25, soilMoistureHigh: 45, airTemperatureLow: 18, airTemperatureHigh: 30 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] },
        { code: "flowering", sequence: 3, label: "开花坐果期", target: { soilMoistureLow: 23, soilMoistureHigh: 43, airTemperatureLow: 18, airTemperatureHigh: 32 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] },
        { code: "fruiting", sequence: 4, label: "果实成熟期", target: { soilMoistureLow: 20, soilMoistureHigh: 40, airTemperatureLow: 18, airTemperatureHigh: 32 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] }
      ],
      metrics: [
        { code: "SOIL_MOISTURE", label: "土壤湿度", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } },
        { code: "AIR_TEMPERATURE", label: "棚内空气温度", unit: "°C", availability: "SUPPORTED", range: { min: -40, max: 80 } },
        { code: "LIGHT", label: "光照强度", unit: "lux", availability: "SIMULATION_ONLY", range: { min: 0, max: 100000 } },
        { code: "CO2", label: "CO2 浓度", unit: "ppm", availability: "SIMULATION_ONLY", range: { min: 0, max: 10000 } },
        { code: "PH", label: "土壤酸碱度", unit: "pH", availability: "SIMULATION_ONLY", range: { min: 0, max: 14 } },
        { code: "WATER_LEVEL", label: "水箱储水位", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } }
      ],
      rules: [
        { code: "WATER_DEFICIT", metric: "SOIL_MOISTURE", operator: "LT", threshold: 20, durationMinutes: 5, hysteresis: 2, cooldownMinutes: 120 },
        { code: "HEAT_STRESS", metric: "AIR_TEMPERATURE", operator: "GT", threshold: 35, durationMinutes: 10, cooldownMinutes: 60 }
      ],
      prescriptionConstraints: { maxDurationSeconds: 900, cooldownMinutes: 120, maxDailyWaterLitres: 5000 },
      forecastProfile: { algorithm: "robust-trend-v1", horizonsMinutes: [60, 120, 240], minValidSamples: 6, maxStalenessSeconds: 120 },
      coordinationProfile: { stageSensitivity: 0.9, starvationGuardMinutes: 120 },
      knowledgeVersion: "kb-1.0.0",
      ruleVersion: "rule-1.0.0",
      knowledge: { documents: ["knowledge/irrigation.md"], fallback: ["plot", "region", "stage", "crop", "general"], content: [
        "# 番茄结果期灌溉知识", "", "结果期先确认土壤湿度时间窗口和设备流量，再决定灌溉时长。",
        "低质量或漂移数据只能触发巡田、复测和流量校准，不能直接生成可执行处方。", "",
        "- 结果期土壤含水率适宜区间：20%~40%", "- 灌溉时长受 900s 安全上限和 120 分钟冷却约束", "- 数据质量不足时先巡田复测，不直接下发控制命令", "",
        "> 证据范围：作物：番茄，阶段：fruiting，地区：重庆，知识版本：kb-1.0.0"
      ] },
      scenarios: { normal: { quality: "GOOD", expected: "stable" }, drought: { quality: "GOOD", expected: "soil_moisture_decline" }, "heavy-rain": { quality: "GOOD", expected: "soil_moisture_rise" }, "sensor-drift": { quality: "DEGRADED", expected: "quality_gate" }, "device-offline": { quality: "BAD", expected: "device_gate" } },
      testCases: ["normal", "drought", "heavy-rain", "sensor-drift", "device-offline"]
    },
    {
      cropCode: "cucumber",
      version: "1.0.0",
      schemaVersion: "1.0",
      identity: { name: "黄瓜", variety: "demonstration", region: "重庆" },
      stages: [
        { code: "seedling", sequence: 1, label: "苗期", target: { soilMoistureLow: 32, soilMoistureHigh: 52, airTemperatureLow: 19, airTemperatureHigh: 28 }, riskFocus: ["WATER_DEFICIT", "COLD_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] },
        { code: "vegetative", sequence: 2, label: "营养生长期", target: { soilMoistureLow: 28, soilMoistureHigh: 48, airTemperatureLow: 19, airTemperatureHigh: 30 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] },
        { code: "flowering", sequence: 3, label: "初花期", target: { soilMoistureLow: 26, soilMoistureHigh: 46, airTemperatureLow: 19, airTemperatureHigh: 32 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] },
        { code: "fruiting", sequence: 4, label: "采收盛期", target: { soilMoistureLow: 24, soilMoistureHigh: 44, airTemperatureLow: 19, airTemperatureHigh: 32 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] }
      ],
      metrics: [
        { code: "SOIL_MOISTURE", label: "土壤湿度", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } },
        { code: "AIR_TEMPERATURE", label: "棚内空气温度", unit: "°C", availability: "SUPPORTED", range: { min: -40, max: 80 } },
        { code: "LIGHT", label: "光照强度", unit: "lux", availability: "SIMULATION_ONLY", range: { min: 0, max: 100000 } },
        { code: "CO2", label: "CO2 浓度", unit: "ppm", availability: "SIMULATION_ONLY", range: { min: 0, max: 10000 } },
        { code: "PH", label: "土壤酸碱度", unit: "pH", availability: "SIMULATION_ONLY", range: { min: 0, max: 14 } },
        { code: "WATER_LEVEL", label: "水箱储水位", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } }
      ],
      rules: [
        { code: "WATER_DEFICIT", metric: "SOIL_MOISTURE", operator: "LT", threshold: 24, durationMinutes: 5, hysteresis: 2, cooldownMinutes: 120 },
        { code: "HEAT_STRESS", metric: "AIR_TEMPERATURE", operator: "GT", threshold: 35, durationMinutes: 10, cooldownMinutes: 60 }
      ],
      prescriptionConstraints: { maxDurationSeconds: 900, cooldownMinutes: 120, maxDailyWaterLitres: 5000 },
      forecastProfile: { algorithm: "robust-trend-v1", horizonsMinutes: [60, 120, 240], minValidSamples: 6, maxStalenessSeconds: 120 },
      coordinationProfile: { stageSensitivity: 0.85, starvationGuardMinutes: 120 },
      knowledgeVersion: "kb-1.0.0",
      ruleVersion: "rule-1.0.0",
      knowledge: { documents: ["knowledge/irrigation.md"], fallback: ["plot", "region", "stage", "crop", "general"], content: [
        "# 黄瓜采收期灌溉知识", "", "黄瓜根系浅、喜湿怕涝，处方需同时参考阶段目标、趋势、设备健康和可用水量。",
        "传感器漂移时优先人工核验，不把异常读数当成真实缺水。", "",
        "- 采收盛期土壤含水率适宜区间：24%~44%", "- 数据质量 DEGRADED/BAD 时只触发巡田和复测", "- 根区水分保持稳定，避免过湿积水", "",
        "> 证据范围：作物：黄瓜，阶段：fruiting，地区：重庆，知识版本：kb-1.0.0"
      ] },
      scenarios: { normal: { quality: "GOOD", expected: "stable" }, drought: { quality: "GOOD", expected: "soil_moisture_decline" }, "heavy-rain": { quality: "GOOD", expected: "soil_moisture_rise" }, "sensor-drift": { quality: "DEGRADED", expected: "quality_gate" }, "device-offline": { quality: "BAD", expected: "device_gate" } },
      testCases: ["normal", "drought", "heavy-rain", "sensor-drift", "device-offline"]
    },
    {
      cropCode: "strawberry",
      version: "1.0.0",
      schemaVersion: "1.0",
      identity: { name: "草莓", variety: "demonstration", region: "重庆" },
      stages: [
        { code: "seedling", sequence: 1, label: "苗期", target: { soilMoistureLow: 35, soilMoistureHigh: 55, airTemperatureLow: 15, airTemperatureHigh: 25 }, riskFocus: ["WATER_DEFICIT", "COLD_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] },
        { code: "vegetative", sequence: 2, label: "营养生长期", target: { soilMoistureLow: 30, soilMoistureHigh: 50, airTemperatureLow: 15, airTemperatureHigh: 28 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] },
        { code: "flowering", sequence: 3, label: "开花期", target: { soilMoistureLow: 28, soilMoistureHigh: 48, airTemperatureLow: 18, airTemperatureHigh: 30 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] },
        { code: "fruiting", sequence: 4, label: "果实膨大期", target: { soilMoistureLow: 25, soilMoistureHigh: 45, airTemperatureLow: 18, airTemperatureHigh: 30 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] }
      ],
      metrics: [
        { code: "SOIL_MOISTURE", label: "土壤湿度", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } },
        { code: "AIR_TEMPERATURE", label: "棚内空气温度", unit: "°C", availability: "SUPPORTED", range: { min: -40, max: 80 } },
        { code: "LIGHT", label: "光照强度", unit: "lux", availability: "SIMULATION_ONLY", range: { min: 0, max: 100000 } },
        { code: "CO2", label: "CO2 浓度", unit: "ppm", availability: "SIMULATION_ONLY", range: { min: 0, max: 10000 } },
        { code: "PH", label: "土壤酸碱度", unit: "pH", availability: "SIMULATION_ONLY", range: { min: 0, max: 14 } },
        { code: "WATER_LEVEL", label: "水箱储水位", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } }
      ],
      rules: [
        { code: "WATER_DEFICIT", metric: "SOIL_MOISTURE", operator: "LT", threshold: 22, durationMinutes: 5, hysteresis: 2, cooldownMinutes: 120 },
        { code: "HEAT_STRESS", metric: "AIR_TEMPERATURE", operator: "GT", threshold: 32, durationMinutes: 10, cooldownMinutes: 60 }
      ],
      prescriptionConstraints: { maxDurationSeconds: 900, cooldownMinutes: 120, maxDailyWaterLitres: 5000 },
      forecastProfile: { algorithm: "robust-trend-v1", horizonsMinutes: [60, 120, 240], minValidSamples: 6, maxStalenessSeconds: 120 },
      coordinationProfile: { stageSensitivity: 0.85, starvationGuardMinutes: 120 },
      knowledgeVersion: "kb-1.0.0",
      ruleVersion: "rule-1.0.0",
      knowledge: {
        documents: ["knowledge/irrigation.md"],
        fallback: ["plot", "region", "stage", "crop", "general"],
        content: [
          "# 草莓果实膨大期灌溉知识",
          "",
          "草莓根系浅、需水敏感，果实膨大期应保持根区水分稳定，避免忽干忽湿。",
          "低质量或漂移数据只能触发巡田、复测和流量校准，不能直接生成可执行处方。",
          "",
          "- 果实膨大期土壤含水率适宜区间：25%~45%，过湿易引发灰霉病",
          "- 灌溉时长受 900s 安全上限约束，冷却窗口 120 分钟",
          "- 高温时段（>32°C）蒸散加快，优先在清晨/傍晚补水",
          "",
          "> 证据范围：作物：草莓，阶段：fruiting，地区：重庆，知识版本：kb-1.0.0"
        ]
      },
      scenarios: {
        normal: { quality: "GOOD", expected: "stable" },
        drought: { quality: "GOOD", expected: "soil_moisture_decline" },
        "heavy-rain": { quality: "GOOD", expected: "soil_moisture_rise" },
        "sensor-drift": { quality: "DEGRADED", expected: "quality_gate" },
        "device-offline": { quality: "BAD", expected: "device_gate" }
      },
      testCases: ["normal", "drought", "heavy-rain", "sensor-drift", "device-offline"]
    },
    {
      cropCode: "pepper",
      version: "1.0.0",
      schemaVersion: "1.0",
      identity: { name: "辣椒", variety: "demonstration", region: "重庆" },
      stages: [
        { code: "seedling", sequence: 1, label: "苗期", target: { soilMoistureLow: 30, soilMoistureHigh: 50, airTemperatureLow: 20, airTemperatureHigh: 30 }, riskFocus: ["WATER_DEFICIT", "COLD_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] },
        { code: "vegetative", sequence: 2, label: "营养生长期", target: { soilMoistureLow: 25, soilMoistureHigh: 45, airTemperatureLow: 20, airTemperatureHigh: 32 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] },
        { code: "flowering", sequence: 3, label: "开花坐果期", target: { soilMoistureLow: 22, soilMoistureHigh: 42, airTemperatureLow: 20, airTemperatureHigh: 35 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] },
        { code: "fruiting", sequence: 4, label: "采收期", target: { soilMoistureLow: 20, soilMoistureHigh: 40, airTemperatureLow: 20, airTemperatureHigh: 35 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] }
      ],
      metrics: [
        { code: "SOIL_MOISTURE", label: "土壤湿度", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } },
        { code: "AIR_TEMPERATURE", label: "棚内空气温度", unit: "°C", availability: "SUPPORTED", range: { min: -40, max: 80 } },
        { code: "LIGHT", label: "光照强度", unit: "lux", availability: "SIMULATION_ONLY", range: { min: 0, max: 100000 } },
        { code: "CO2", label: "CO2 浓度", unit: "ppm", availability: "SIMULATION_ONLY", range: { min: 0, max: 10000 } },
        { code: "PH", label: "土壤酸碱度", unit: "pH", availability: "SIMULATION_ONLY", range: { min: 0, max: 14 } },
        { code: "WATER_LEVEL", label: "水箱储水位", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } }
      ],
      rules: [
        { code: "WATER_DEFICIT", metric: "SOIL_MOISTURE", operator: "LT", threshold: 18, durationMinutes: 5, hysteresis: 2, cooldownMinutes: 120 },
        { code: "HEAT_STRESS", metric: "AIR_TEMPERATURE", operator: "GT", threshold: 38, durationMinutes: 10, cooldownMinutes: 60 }
      ],
      prescriptionConstraints: { maxDurationSeconds: 900, cooldownMinutes: 120, maxDailyWaterLitres: 5000 },
      forecastProfile: { algorithm: "robust-trend-v1", horizonsMinutes: [60, 120, 240], minValidSamples: 6, maxStalenessSeconds: 120 },
      coordinationProfile: { stageSensitivity: 0.9, starvationGuardMinutes: 120 },
      knowledgeVersion: "kb-1.0.0",
      ruleVersion: "rule-1.0.0",
      knowledge: {
        documents: ["knowledge/irrigation.md"],
        fallback: ["plot", "region", "stage", "crop", "general"],
        content: [
          "# 辣椒采收期灌溉知识",
          "",
          "辣椒喜温耐旱不耐涝，采收期保持土壤见干见湿，避免积水沤根。",
          "低质量或漂移数据只能触发巡田、复测和流量校准，不能直接生成可执行处方。",
          "",
          "- 采收期土壤含水率适宜区间：20%~40%，高温强光时段需及时补水",
          "- 灌溉时长受 900s 安全上限约束，冷却窗口 120 分钟",
          "- 数据质量 DEGRADED/BAD 时只触发巡田、复测，不生成可执行处方",
          "",
          "> 证据范围：作物：辣椒，阶段：fruiting，地区：重庆，知识版本：kb-1.0.0"
        ]
      },
      scenarios: {
        normal: { quality: "GOOD", expected: "stable" },
        drought: { quality: "GOOD", expected: "soil_moisture_decline" },
        "heavy-rain": { quality: "GOOD", expected: "soil_moisture_rise" },
        "sensor-drift": { quality: "DEGRADED", expected: "quality_gate" },
        "device-offline": { quality: "BAD", expected: "device_gate" }
      },
      testCases: ["normal", "drought", "heavy-rain", "sensor-drift", "device-offline"]
    },
    {
      cropCode: "corn",
      version: "1.0.0",
      schemaVersion: "1.0",
      identity: { name: "玉米", variety: "demonstration", region: "重庆" },
      stages: [
        { code: "seedling", sequence: 1, label: "苗期", target: { soilMoistureLow: 30, soilMoistureHigh: 50, airTemperatureLow: 15, airTemperatureHigh: 30 }, riskFocus: ["WATER_DEFICIT", "COLD_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] },
        { code: "vegetative", sequence: 2, label: "拔节期", target: { soilMoistureLow: 28, soilMoistureHigh: 48, airTemperatureLow: 18, airTemperatureHigh: 32 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] },
        { code: "flowering", sequence: 3, label: "抽雄开花期", target: { soilMoistureLow: 25, soilMoistureHigh: 45, airTemperatureLow: 22, airTemperatureHigh: 32 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] },
        { code: "fruiting", sequence: 4, label: "灌浆成熟期", target: { soilMoistureLow: 22, soilMoistureHigh: 42, airTemperatureLow: 20, airTemperatureHigh: 30 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] }
      ],
      metrics: [
        { code: "SOIL_MOISTURE", label: "土壤湿度", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } },
        { code: "AIR_TEMPERATURE", label: "空气温度", unit: "°C", availability: "SUPPORTED", range: { min: -40, max: 80 } },
        { code: "LIGHT", label: "光照强度", unit: "lux", availability: "SIMULATION_ONLY", range: { min: 0, max: 100000 } },
        { code: "CO2", label: "CO2 浓度", unit: "ppm", availability: "SIMULATION_ONLY", range: { min: 0, max: 10000 } },
        { code: "PH", label: "土壤酸碱度", unit: "pH", availability: "SIMULATION_ONLY", range: { min: 0, max: 14 } },
        { code: "WATER_LEVEL", label: "水箱储水位", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } }
      ],
      rules: [
        { code: "WATER_DEFICIT", metric: "SOIL_MOISTURE", operator: "LT", threshold: 25, durationMinutes: 5, hysteresis: 2, cooldownMinutes: 120 },
        { code: "HEAT_STRESS", metric: "AIR_TEMPERATURE", operator: "GT", threshold: 35, durationMinutes: 10, cooldownMinutes: 60 }
      ],
      prescriptionConstraints: { maxDurationSeconds: 900, cooldownMinutes: 120, maxDailyWaterLitres: 5000 },
      forecastProfile: { algorithm: "robust-trend-v1", horizonsMinutes: [60, 120, 240], minValidSamples: 6, maxStalenessSeconds: 120 },
      coordinationProfile: { stageSensitivity: 0.9, starvationGuardMinutes: 120 },
      knowledgeVersion: "kb-1.0.0",
      ruleVersion: "rule-1.0.0",
      knowledge: { documents: ["knowledge/irrigation.md"], fallback: ["plot", "region", "stage", "crop", "general"], content: [
        "# 玉米抽雄开花期灌溉知识", "", "玉米拔节至灌浆期为需水临界期，抽雄开花期缺水易导致秃尖缺粒、授粉不良。",
        "低质量或漂移数据只能触发巡田、复测和流量校准，不能直接生成可执行处方。", "",
        "- 抽雄开花期土壤含水率适宜区间：25%~45%，需保持充足供水", "- 灌溉时长受 900s 安全上限和 120 分钟冷却约束", "- 高温（>35°C）伴随干旱会加重热害，优先早晚补水", "",
        "> 证据范围：作物：玉米，阶段：flowering，地区：重庆，知识版本：kb-1.0.0"
      ] },
      scenarios: { normal: { quality: "GOOD", expected: "stable" }, drought: { quality: "GOOD", expected: "soil_moisture_decline" }, "heavy-rain": { quality: "GOOD", expected: "soil_moisture_rise" }, "sensor-drift": { quality: "DEGRADED", expected: "quality_gate" }, "device-offline": { quality: "BAD", expected: "device_gate" } },
      testCases: ["normal", "drought", "heavy-rain", "sensor-drift", "device-offline"]
    },
    {
      cropCode: "rice",
      version: "1.0.0",
      schemaVersion: "1.0",
      identity: { name: "水稻", variety: "demonstration", region: "重庆" },
      stages: [
        { code: "seedling", sequence: 1, label: "秧苗期", target: { soilMoistureLow: 35, soilMoistureHigh: 55, airTemperatureLow: 20, airTemperatureHigh: 30 }, riskFocus: ["WATER_DEFICIT", "COLD_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] },
        { code: "vegetative", sequence: 2, label: "分蘖期", target: { soilMoistureLow: 30, soilMoistureHigh: 55, airTemperatureLow: 25, airTemperatureHigh: 32 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] },
        { code: "flowering", sequence: 3, label: "抽穗扬花期", target: { soilMoistureLow: 35, soilMoistureHigh: 60, airTemperatureLow: 25, airTemperatureHigh: 32 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] },
        { code: "fruiting", sequence: 4, label: "灌浆成熟期", target: { soilMoistureLow: 30, soilMoistureHigh: 50, airTemperatureLow: 20, airTemperatureHigh: 30 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] }
      ],
      metrics: [
        { code: "SOIL_MOISTURE", label: "田面湿度", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } },
        { code: "AIR_TEMPERATURE", label: "环境温度", unit: "°C", availability: "SUPPORTED", range: { min: -40, max: 80 } },
        { code: "LIGHT", label: "光照强度", unit: "lux", availability: "SIMULATION_ONLY", range: { min: 0, max: 100000 } },
        { code: "CO2", label: "CO2 浓度", unit: "ppm", availability: "SIMULATION_ONLY", range: { min: 0, max: 10000 } },
        { code: "PH", label: "土壤酸碱度", unit: "pH", availability: "SIMULATION_ONLY", range: { min: 0, max: 14 } },
        { code: "WATER_LEVEL", label: "田面水位", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } }
      ],
      rules: [
        { code: "WATER_DEFICIT", metric: "SOIL_MOISTURE", operator: "LT", threshold: 30, durationMinutes: 5, hysteresis: 2, cooldownMinutes: 120 },
        { code: "HEAT_STRESS", metric: "AIR_TEMPERATURE", operator: "GT", threshold: 35, durationMinutes: 10, cooldownMinutes: 60 }
      ],
      prescriptionConstraints: { maxDurationSeconds: 900, cooldownMinutes: 120, maxDailyWaterLitres: 5000 },
      forecastProfile: { algorithm: "robust-trend-v1", horizonsMinutes: [60, 120, 240], minValidSamples: 6, maxStalenessSeconds: 120 },
      coordinationProfile: { stageSensitivity: 0.85, starvationGuardMinutes: 120 },
      knowledgeVersion: "kb-1.0.0",
      ruleVersion: "rule-1.0.0",
      knowledge: { documents: ["knowledge/irrigation.md"], fallback: ["plot", "region", "stage", "crop", "general"], content: [
        "# 水稻分蘖期灌溉知识", "", "水稻喜水耐淹，分蘖期保持浅水层，抽穗扬花期田面湿度需维持 85%~100%。",
        "低质量或漂移数据只能触发巡田、复测和流量校准，不能直接生成可执行处方。", "",
        "- 分蘖期田面湿度适宜区间：30%~55%，需浅水勤灌", "- 灌溉时长受 900s 安全上限和 120 分钟冷却约束", "- 抽穗扬花期遇高温（>35°C）易导致空壳率上升，需深水调温", "",
        "> 证据范围：作物：水稻，阶段：vegetative，地区：重庆，知识版本：kb-1.0.0"
      ] },
      scenarios: { normal: { quality: "GOOD", expected: "stable" }, drought: { quality: "GOOD", expected: "soil_moisture_decline" }, "heavy-rain": { quality: "GOOD", expected: "soil_moisture_rise" }, "sensor-drift": { quality: "DEGRADED", expected: "quality_gate" }, "device-offline": { quality: "BAD", expected: "device_gate" } },
      testCases: ["normal", "drought", "heavy-rain", "sensor-drift", "device-offline"]
    },
    {
      cropCode: "sunflower",
      version: "1.0.0",
      schemaVersion: "1.0",
      identity: { name: "向日葵", variety: "demonstration", region: "重庆" },
      stages: [
        { code: "seedling", sequence: 1, label: "苗期", target: { soilMoistureLow: 30, soilMoistureHigh: 50, airTemperatureLow: 15, airTemperatureHigh: 25 }, riskFocus: ["WATER_DEFICIT", "COLD_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] },
        { code: "vegetative", sequence: 2, label: "现蕾期", target: { soilMoistureLow: 25, soilMoistureHigh: 45, airTemperatureLow: 18, airTemperatureHigh: 28 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] },
        { code: "flowering", sequence: 3, label: "开花结盘期", target: { soilMoistureLow: 20, soilMoistureHigh: 38, airTemperatureLow: 18, airTemperatureHigh: 28 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }] },
        { code: "fruiting", sequence: 4, label: "灌浆成熟期", target: { soilMoistureLow: 18, soilMoistureHigh: 35, airTemperatureLow: 20, airTemperatureHigh: 30 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }] }
      ],
      metrics: [
        { code: "SOIL_MOISTURE", label: "土壤湿度", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } },
        { code: "AIR_TEMPERATURE", label: "空气温度", unit: "°C", availability: "SUPPORTED", range: { min: -40, max: 80 } },
        { code: "LIGHT", label: "光照强度", unit: "lux", availability: "SIMULATION_ONLY", range: { min: 0, max: 100000 } },
        { code: "CO2", label: "CO2 浓度", unit: "ppm", availability: "SIMULATION_ONLY", range: { min: 0, max: 10000 } },
        { code: "PH", label: "土壤酸碱度", unit: "pH", availability: "SIMULATION_ONLY", range: { min: 0, max: 14 } },
        { code: "WATER_LEVEL", label: "水箱储水位", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } }
      ],
      rules: [
        { code: "WATER_DEFICIT", metric: "SOIL_MOISTURE", operator: "LT", threshold: 20, durationMinutes: 5, hysteresis: 2, cooldownMinutes: 120 },
        { code: "HEAT_STRESS", metric: "AIR_TEMPERATURE", operator: "GT", threshold: 38, durationMinutes: 10, cooldownMinutes: 60 }
      ],
      prescriptionConstraints: { maxDurationSeconds: 900, cooldownMinutes: 120, maxDailyWaterLitres: 5000 },
      forecastProfile: { algorithm: "robust-trend-v1", horizonsMinutes: [60, 120, 240], minValidSamples: 6, maxStalenessSeconds: 120 },
      coordinationProfile: { stageSensitivity: 0.8, starvationGuardMinutes: 120 },
      knowledgeVersion: "kb-1.0.0",
      ruleVersion: "rule-1.0.0",
      knowledge: { documents: ["knowledge/irrigation.md"], fallback: ["plot", "region", "stage", "crop", "general"], content: [
        "# 向日葵开花结盘期灌溉知识", "", "向日葵耐旱怕涝，现蕾至开花为需水临界期，过湿易倒伏感病。",
        "低质量或漂移数据只能触发巡田、复测和流量校准，不能直接生成可执行处方。", "",
        "- 开花结盘期土壤含水率适宜区间：20%~38%，需适度供水", "- 灌溉时长受 900s 安全上限和 120 分钟冷却约束", "- 高温强光时段（>38°C）蒸散加快，优先清晨补水", "",
        "> 证据范围：作物：向日葵，阶段：flowering，地区：重庆，知识版本：kb-1.0.0"
      ] },
      scenarios: { normal: { quality: "GOOD", expected: "stable" }, drought: { quality: "GOOD", expected: "soil_moisture_decline" }, "heavy-rain": { quality: "GOOD", expected: "soil_moisture_rise" }, "sensor-drift": { quality: "DEGRADED", expected: "quality_gate" }, "device-offline": { quality: "BAD", expected: "device_gate" } },
      testCases: ["normal", "drought", "heavy-rain", "sensor-drift", "device-offline"]
    }
  ],

  riskForecastConfig: {
    algorithmVersion: "robust-trend-v1.2",
    algorithmLabel: "Robust Trend 确定性趋势推演",
    inputWindowMinutes: 60,
    stressBoundary: 14.0,
    baselineMoisture: 20.0,
    maxHorizonMinutes: 240,
    scenarioCatalog: [
      { code: "DROUGHT", label: "持续干旱", emoji: "☀️", color: "#d29922", desc: "无降水、蒸散加快，水分按干旱速率衰减", decayFactor: 1.0, ttrMinutes: 72, driftRatePerHour: 0, rainBoostPct: 0, enabled: true },
      { code: "HEAT_WAVE", label: "极端热浪", emoji: "🔥", color: "#f85149", desc: "棚内温度骤升至 38°C，蒸散速率提高 45%", decayFactor: 1.45, ttrMinutes: 48, driftRatePerHour: 0, rainBoostPct: 0, enabled: true },
      { code: "STORM", label: "暴雨积水", emoji: "🌧️", color: "#58a6ff", desc: "连续暴雨 45 分钟，土壤湿度先抬升 6% 后回落", decayFactor: 0.8, ttrMinutes: null, driftRatePerHour: 0, rainBoostPct: 6, enabled: true },
      { code: "SENSOR_DRIFT", label: "传感器零点漂移", emoji: "⚠️", color: "#a371f7", desc: "读数缓慢偏移 +0.6%/h，检测漂移后拒绝生成处方", decayFactor: 1.0, ttrMinutes: null, driftRatePerHour: 0.6, rainBoostPct: 0, enabled: true },
      { code: "OFFLINE", label: "设备断网离线", emoji: "🔌", color: "#8b949e", desc: "遥测中断，样本不足，预测状态 UNAVAILABLE", decayFactor: 1.0, ttrMinutes: null, driftRatePerHour: 0, rainBoostPct: 0, enabled: true }
    ]
  },

  valueLedger: {
    farmId: "farm-demo",
    farmName: "农智示范农场",
    period: { start: "2026-08-01", end: "2026-08-22" },
    prices: { waterPerLitre: 0.004, electricityPerKwh: 0.55, labourPerHour: 35.0 },
    summary: { plannedWaterLitres: 18600, actualWaterLitres: 17240, deviationRatePct: -7.3, savedWaterLitres: 1360, savedElectricityKwh: 42.5, labourSavedHours: 6.2, savedWaterCostRmb: 5.44, savedElectricityCostRmb: 23.38, labourSavedCostRmb: 217.0, totalSavedRmb: 245.82 },
    daily: Array.from({ length: 22 }, (_, i) => {
      const planned = 845;
      const wave = Math.sin(i / 2.3) * 42 + Math.cos(i / 1.7) * 26;
      const actual = Math.round((planned * (0.93 + wave / 2200)) * 10) / 10;
      return { date: `08-${String(i + 1).padStart(2, '0')}`, planned, actual, deviationRatePct: Math.round(((actual - planned) / planned) * 1000) / 10 };
    }),
    counterfactual: [
      { week: "第 1 周", traditionalCostRmb: 320, agriLoopCostRmb: 240 }, { week: "第 2 周", traditionalCostRmb: 610, agriLoopCostRmb: 455 },
      { week: "第 3 周", traditionalCostRmb: 870, agriLoopCostRmb: 645 }, { week: "第 4 周", traditionalCostRmb: 1120, agriLoopCostRmb: 830 }
    ],
    provenance: [
      { key: "实际用水 / 用电 / 工时", value: "OBSERVED", tag: "sourceMode=SIMULATION（本期模拟遥测与虚拟执行）" },
      { key: "偏差率 / 折合人民币", value: "DERIVED", tag: "由计划-实际差异确定性换算" },
      { key: "传统粗放灌溉成本", value: "ESTIMATED", tag: "按行业经验参数估算，非实测" }
    ]
  },

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
      content: "提供系统管理员、农场管理员、种植农户三级隔离；每次建议保留完整 TraceId。"
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
      desc: "根因推断、支持/反对/缺失证据、四态就绪度、结构化处方、补证工单、受控执行与决策护照闭环",
      tags: ["CAP-04", "CAP-05", "CAP-08", "B-07"],
      status: "诊断 → 处方 → 执行闭环已接入"
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
  },

  // ============================================================
  // 种植农户工作台专用数据
  // ============================================================
  farmer_messages: [
    {
      id: "msg-001",
      category: "alert",
      title: "【紧急】A01 番茄棚土壤湿度持续低于阈值",
      snippet: "近 3 个采样周期土壤湿度均低于 20%，已触发干旱风险告警，请尽快核实并处理。",
      body_paragraphs: [
        "地块 A01 番茄示范田近 3 个采样周期土壤湿度均低于 20% 目标下限，最新读数 16.8%。",
        "系统已完成干旱与传感器漂移分流校验，置信度 92%，判定为真实缺水。",
        "建议尽快结合现场巡田核实，并联系农场管理员审批补水处方。"
      ],
      sender: "AgriLoop 监测内核",
      read: false,
      time_iso: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      time_label: "8 分钟前"
    },
    {
      id: "msg-002",
      category: "task",
      title: "【新任务】黄瓜棚水肥 EC/pH 便携仪比对",
      snippet: "农场管理员下达例行核验任务，要求今日 16:30 前完成便携仪与在线传感器读数比对。",
      body_paragraphs: [
        "农场管理员下达例行核验任务：温室 3 号棚黄瓜营养生长期 EC/pH 便携仪比对。",
        "请使用便携式电导度仪在棚内 5 个标准采样点采集读数，并与系统在线传感器读数对比。",
        "完成后请在任务管理中提交完成，并附上便携仪读数照片与现场备注。"
      ],
      sender: "农场管理员",
      read: false,
      time_iso: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      time_label: "35 分钟前"
    },
    {
      id: "msg-003",
      category: "notice",
      title: "【通知】A02 流量计心跳延迟已恢复",
      snippet: "A02 地块流量计短时心跳延迟已恢复，设备健康度回到 0.98，无需进一步操作。",
      body_paragraphs: [
        "A02 玉米高产田流量计此前出现短时心跳延迟，最新一次设备健康检查已通过。",
        "设备健康度回到 0.98，数据新鲜度恢复正常范围。",
        "您此前提交的设备复测任务已标记为完成，无需进一步操作。"
      ],
      sender: "设备运维中心",
      read: true,
      time_iso: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      time_label: "2 小时前"
    },
    {
      id: "msg-004",
      category: "system",
      title: "【系统】本周农务计划已生成",
      snippet: "基于 Crop Pack 作物全周期计划，本周共生成 12 项常规农务任务，已分配至各负责人。",
      body_paragraphs: [
        "基于 Crop Pack 作物全周期计划，本周共生成 12 项常规农务任务。",
        "其中您负责 5 项，包括番茄疏花打杈、黄瓜 EC 比对、设备例行巡检等。",
        "请在任务管理中查看您负责的任务详情，并按时执行。"
      ],
      sender: "农务协同调度中心",
      read: true,
      time_iso: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      time_label: "6 小时前"
    },
    {
      id: "msg-005",
      category: "alert",
      title: "【提醒】A01 番茄棚灌溉处方待您确认",
      snippet: "系统已生成 A01 番茄棚灌溉处方（建议时长 8.5 分钟 / 153 升），等待农场管理员审批。",
      body_paragraphs: [
        "系统已针对 A01 番茄棚缺水风险生成结构化灌溉处方。",
        "建议时长 8.5 分钟，水量 153 升，预计土壤湿度由 16.8% 回升至 30.0%。",
        "处方已提交农场管理员审批，审批通过后将通知您执行。"
      ],
      sender: "处方决策引擎",
      read: false,
      time_iso: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      time_label: "12 分钟前"
    }
  ],

  farmer_tasks: [
    {
      id: "ft-001",
      title: "黄瓜棚水肥 EC/pH 便携仪比对",
      reason: "Crop Pack 营养生长期例行核验",
      instruction: "在温室 3 号棚 5 个标准采样点采集便携仪读数，与在线传感器对比，误差超过 0.2 mS/cm 需上报。",
      status: "ASSIGNED",
      priority: "MEDIUM",
      plot_id: "plot-a03",
      plot_name: "A03 黄瓜立体架",
      issuer: "农场管理员",
      created_iso: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      due_iso: new Date(Date.now() + 2.2 * 60 * 60 * 1000).toISOString(),
      created_label: "45 分钟前",
      due_label: "今日 16:30"
    },
    {
      id: "ft-002",
      title: "番茄第 4 穗花疏花打杈",
      reason: "开花坐果期标准农务",
      instruction: "对 A01 番茄棚第 4 穗花进行疏花打杈，每穗保留 4-5 朵健花，去除多余花蕾与侧枝。",
      status: "IN_PROGRESS",
      priority: "LOW",
      plot_id: "plot-a01",
      plot_name: "A01 番茄示范田",
      issuer: "农场管理员",
      created_iso: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      due_iso: new Date(Date.now() + 4.5 * 60 * 60 * 1000).toISOString(),
      created_label: "1.5 小时前",
      due_label: "今日 18:00"
    },
    {
      id: "ft-003",
      title: "A02 流量计心跳延迟复测",
      reason: "设备新鲜度短时下降，需完成复测",
      instruction: "现场检查 A02 流量计电源与通信线路，记录复测后心跳间隔。",
      status: "DONE",
      priority: "MEDIUM",
      plot_id: "plot-a02",
      plot_name: "A02 玉米高产田",
      issuer: "农场管理员",
      created_iso: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      due_iso: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      created_label: "3 小时前",
      due_label: "已完成"
    },
    {
      id: "ft-004",
      title: "全场设备例行巡检",
      reason: "每周一例行设备健康巡检",
      instruction: "巡查所属地块所有在线设备外观、电源、通信状态，填写巡检表并拍照上传。",
      status: "PENDING",
      priority: "LOW",
      plot_id: null,
      plot_name: "",
      issuer: "农场管理员",
      created_iso: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      due_iso: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      created_label: "20 分钟前",
      due_label: "本周三前"
    },
    {
      id: "ft-005",
      title: "A01 番茄棚缺水告警现场核实",
      reason: "土壤湿度连续低于番茄结果期目标下限",
      instruction: "现场查看 A01 番茄棚土壤表层与根系层湿度，观察植株萎蔫情况，与传感器读数对比。",
      status: "PENDING",
      priority: "HIGH",
      plot_id: "plot-a01",
      plot_name: "A01 番茄示范田",
      issuer: "农场管理员",
      created_iso: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      due_iso: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
      created_label: "18 分钟前",
      due_label: "35 分钟内"
    },
    {
      id: "ft-006",
      title: "A02 玉米抽雄期田间观察记录",
      reason: "玉米开花抽雄期长势记录",
      instruction: "在 A02 玉米田选取 5 个样点，记录抽雄率、株高、病虫害情况。",
      status: "ASSIGNED",
      priority: "MEDIUM",
      plot_id: "plot-a02",
      plot_name: "A02 玉米高产田",
      issuer: "农场管理员",
      created_iso: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      due_iso: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      created_label: "5 小时前",
      due_label: "明日 18:00"
    }
  ],

  farmer_profile: {
    username: "farmer",
    role_label: "种植农户",
    avatar: "🧑‍🌾",
    joined_at: "2026-03-15",
    contact: "138****5826",
    plot_names: ["A01 番茄示范田", "A02 玉米高产田", "A03 黄瓜立体架"],
    total_done: 86,
    month_done: 12,
    inspections: 7,
    completion_rate: 92
  },

  // ============================================================
  // 缺口覆盖数据（对照 I-01 ~ I-15、I-28）
  // 集中维护各模块当前页面状态与主要缺口的演示数据。
  // ============================================================
  gapCoverage: {
    meta: {
      version: "gap-1.0.0",
      updatedAt: "2026-08-25T16:29:00+08:00",
      scope: "P0 演示范围 · 模拟数据",
      sourceMode: "SIMULATION"
    },

    // I-01 Crop Pack 与生长阶段
    cropPackSwitch: {
      currentPlotId: "plot-a01",
      currentCropCode: "tomato",
      currentStageCode: "fruiting",
      currentCropPackVersion: "1.0.0",
      currentRuleVersion: "rule-1.0.0",
      currentKnowledgeVersion: "kb-1.0.0",
      switchablePacks: [
        { cropCode: "tomato", label: "番茄", version: "1.0.0", stages: 4, rules: 2 },
        { cropCode: "cucumber", label: "黄瓜", version: "1.0.0", stages: 4, rules: 2 },
        { cropCode: "strawberry", label: "草莓", version: "1.0.0", stages: 4, rules: 2 },
        { cropCode: "pepper", label: "辣椒", version: "1.0.0", stages: 4, rules: 2 }
      ],
      stageTargets: {
        seedling: { SOIL_MOISTURE: "30~50%", AIR_TEMPERATURE: "18~28°C" },
        vegetative: { SOIL_MOISTURE: "25~45%", AIR_TEMPERATURE: "18~30°C" },
        flowering: { SOIL_MOISTURE: "23~43%", AIR_TEMPERATURE: "18~32°C" },
        fruiting: { SOIL_MOISTURE: "20~40%", AIR_TEMPERATURE: "18~32°C" }
      },
      stageRules: {
        fruiting: [
          { code: "WATER_DEFICIT", metric: "SOIL_MOISTURE", operator: "LT", threshold: 20, hysteresis: 2, cooldownMinutes: 120 },
          { code: "HEAT_STRESS", metric: "AIR_TEMPERATURE", operator: "GT", threshold: 35, cooldownMinutes: 60 }
        ]
      },
      qaContext: {
        linkedPlotId: "plot-a01",
        linkedStageCode: "fruiting",
        linkedCropPackVersion: "1.0.0",
        note: "问答上下文随当前地块/阶段/作物包版本动态联动"
      }
    },

    // I-02 动态目标曲线
    dynamicTargetCurve: {
      plotId: "plot-a01",
      metricCode: "SOIL_MOISTURE",
      unit: "%",
      rangeId: "7d",
      targetBand: { low: 20, high: 40, label: "结果期适宜带" },
      stageTransition: {
        atLabel: "4 日前",
        fromStage: "flowering",
        toStage: "fruiting",
        fromBand: { low: 23, high: 43 },
        toBand: { low: 20, high: 40 }
      },
      playbackMarkers: [
        { label: "5 日前", type: "INSPECTION", note: "巡田记录" },
        { label: "3 日前", type: "IRRIGATION", note: "补水 120L" },
        { label: "今天", type: "ALERT", note: "低于目标下限" }
      ]
    },

    // I-03 数据质量评分与门控
    dataQuality: {
      plotId: "plot-a01",
      overallScore: 0.92,
      grade: "GOOD",
      dimensions: [
        { code: "completeness", label: "完整度", value: 1.0, target: 0.95, status: "PASS" },
        { code: "freshness", label: "新鲜度", value: 0.98, target: 0.9, status: "PASS", stalenessSeconds: 200 },
        { code: "reliability", label: "可靠度", value: 0.88, target: 0.85, status: "PASS" },
        { code: "consistency", label: "一致性", value: 0.9, target: 0.85, status: "PASS" }
      ],
      gate: {
        prescriptionAllowed: true,
        blockedActions: [],
        reason: "数据质量 GOOD，允许生成可执行灌溉处方"
      },
      degradedExample: {
        plotId: "plot-a02",
        overallScore: 0.62,
        grade: "DEGRADED",
        prescriptionAllowed: false,
        blockedActions: ["IRRIGATION_PRESCRIPTION", "AUTO_EXECUTE"],
        reason: "可靠度 0.62 低于阈值 0.85，仅触发巡田/复测，不生成可执行处方"
      }
    },

    // I-04 多风险检测与根因诊断
    multiRiskDiagnosis: {
      plotId: "plot-a01",
      primaryCause: "WATER_DEFICIT",
      confidence: 0.92,
      evidenceStreams: [
        {
          code: "drought",
          label: "干旱证据",
          status: "SUPPORTED",
          score: 0.92,
          items: [
            "SOIL_MOISTURE 连续 3 个采样周期低于 20%",
            "空气温度 26.4°C，蒸散速率加快",
            "便携仪复测 17.2%，与在线读数一致"
          ]
        },
        {
          code: "sensor-drift",
          label: "传感器漂移证据",
          status: "REJECTED",
          score: 0.08,
          items: [
            "无突发阶跃跳变",
            "便携仪与在线读数偏差 < 0.5%",
            "设备心跳正常"
          ]
        }
      ],
      missingEvidence: [],
      conclusion: "支持干旱、排除传感器漂移，置信度 92%"
    },

    // I-05 迟滞与冷却窗口
    hysteresisAndCooldown: {
      ruleCode: "WATER_DEFICIT",
      metric: "SOIL_MOISTURE",
      threshold: 20,
      hysteresis: 2,
      boundaryState: "BELOW_LOWER",
      lastTriggeredAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      cooldownMinutes: 120,
      cooldownRemainingMinutes: 30,
      cooldownActive: true,
      idempotency: {
        lastCommandId: "cmd-a01-20260822-001",
        duplicateClicksBlocked: 1,
        note: "重复点击受幂等键保护，不产生重复执行"
      }
    },

    // I-06 结构化农业处方
    structuredPrescription: {
      planId: "plan-a01-20260822",
      plotId: "plot-a01",
      cropPackVersion: "1.0.0",
      ruleVersion: "rule-1.0.0",
      knowledgeVersion: "kb-1.0.0",
      agentVersion: "agent-1.2.0",
      inputs: {
        areaM2: 120,
        currentMoisture: 16.8,
        targetMoisture: 30.0,
        flowRateLitresPerMinute: 18.0,
        cropStage: "fruiting",
        deviceStatus: "ONLINE"
      },
      outputs: {
        waterLitre: 153.0,
        durationSeconds: 510,
        durationFormatted: "8 分 30 秒",
        costEstimateRmb: 0.61
      },
      basis: [
        "番茄结果期耗水模型 (Crop Pack v1.0.0)",
        "面积 120㎡ × 目标湿度提升 13.2%",
        "水泵流量 18L/min，时长受 900s 安全上限约束"
      ],
      approvalStatus: "PENDING",
      approverId: null,
      qualityGate: {
        status: "PASS",
        checks: [
          { code: "completeness", status: "PASS" },
          { code: "freshness", status: "PASS" },
          { code: "device", status: "PASS" },
          { code: "water_capacity", status: "PASS" },
          { code: "duration_limit", status: "PASS" }
        ]
      }
    },

    // I-07 What-if 情景模拟
    whatIfScenarios: {
      scenarioId: "scenario-a01-20260822-001",
      seed: 42,
      frozenSnapshot: {
        plotId: "plot-a01",
        moisture: 16.8,
        capturedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
      },
      scenarios: [
        { code: "DROUGHT", label: "持续干旱", enabled: true },
        { code: "STORM", label: "暴雨积水", enabled: true },
        { code: "HEAT_WAVE", label: "极端热浪", enabled: true },
        { code: "SENSOR_DRIFT", label: "传感器漂移", enabled: true }
      ],
      dualTrack: {
        EXECUTE: {
          label: "分支 A · 执行灌溉处方",
          color: "#3fb950",
          expectedMoistureAfter2h: 28.5,
          points: [
            { minute: 0, moisture: 16.8 },
            { minute: 30, moisture: 22.0 },
            { minute: 60, moisture: 26.5 },
            { minute: 120, moisture: 28.5 }
          ]
        },
        NO_ACTION: {
          label: "分支 B · 不采取措施放任干旱",
          color: "#f85149",
          expectedMoistureAfter2h: 13.8,
          points: [
            { minute: 0, moisture: 16.8 },
            { minute: 30, moisture: 15.6 },
            { minute: 60, moisture: 15.2 },
            { minute: 120, moisture: 13.8 }
          ]
        }
      },
      note: "双轨共用同一冻结快照与随机种子，任何分支不回写主状态"
    },

    // I-08 执行与效果验证闭环
    executionAndEffect: {
      commandId: "cmd-a01-20260822-001",
      planId: "plan-a01-20260822",
      plotId: "plot-a01",
      idempotencyKey: "idem-a01-20260822-001",
      ack: {
        received: true,
        receivedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
        executor: "virtual-executor-01"
      },
      actual: {
        waterLitre: 151.2,
        durationSeconds: 504,
        startedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
        endedAt: new Date(Date.now() - 30 * 1000).toISOString()
      },
      beforeAfter: {
        beforeMoisture: 16.8,
        afterMoisture: 29.6,
        deltaPct: 12.8
      },
      effectScore: 0.94,
      effectStatus: "SUCCESS",
      failurePaths: [
        { code: "TIMEOUT", label: "执行超时", handled: true },
        { code: "PARTIAL", label: "部分成功（水量不足）", handled: true },
        { code: "DEVICE_OFFLINE", label: "设备离线中断", handled: true }
      ]
    },

    // I-09 多角色智能体与统一操作入口
    agentToolchain: {
      agentVersion: "agent-1.2.0",
      roles: ["PERCEPTION", "DIAGNOSIS", "PRESCRIPTION", "SAFETY", "EFFECT"],
      steps: [
        { code: "PERCEPTION", label: "感知", status: "DONE", tool: "telemetry-reader", summary: "读取 A01 遥测快照" },
        { code: "DIAGNOSIS", label: "诊断", status: "DONE", tool: "root-cause-engine", summary: "WATER_DEFICIT 置信度 92%" },
        { code: "PRESCRIPTION", label: "处方", status: "DONE", tool: "prescription-builder", summary: "生成 153L / 8m30s 处方" },
        { code: "SAFETY", label: "安全", status: "PENDING", tool: "safety-gate", summary: "等待管理员审批" },
        { code: "EFFECT", label: "效果", status: "PENDING", tool: "effect-evaluator", summary: "待执行后评估" }
      ],
      unifiedEntry: {
        view: "decision-console",
        plotId: "plot-a01",
        note: "统一操作入口聚合工具链状态"
      }
    },

    // I-10 RAG 证据链
    ragEvidence: {
      query: "番茄结果期需要浇多少水",
      knowledgeVersion: "kb-1.0.0",
      snippets: [
        {
          id: "kb-tomato-fruiting-01",
          content: "结果期土壤含水率适宜区间：20%~40%",
          source: "knowledge/irrigation.md",
          citation: "番茄 Crop Pack v1.0.0 · 知识库 kb-1.0.0"
        },
        {
          id: "kb-tomato-fruiting-02",
          content: "灌溉时长受 900s 安全上限和 120 分钟冷却约束",
          source: "knowledge/irrigation.md",
          citation: "番茄 Crop Pack v1.0.0 · 知识库 kb-1.0.0"
        }
      ],
      fallbackScope: ["plot", "region", "stage", "crop", "general"],
      evidenceScope: "作物：番茄，阶段：fruiting，地区：重庆"
    },

    // I-11 工具调用审计
    toolCallAudit: {
      traceId: "run-20260822-001",
      agentVersion: "agent-1.2.0",
      calls: [
        {
          tool: "telemetry-reader",
          input: { plotId: "plot-a01", metric: "SOIL_MOISTURE" },
          output: { value: 16.8, unit: "%", status: "WARN" },
          durationMs: 42,
          status: "OK"
        },
        {
          tool: "root-cause-engine",
          input: { plotId: "plot-a01", window: "60min" },
          output: { primaryCause: "WATER_DEFICIT", confidence: 0.92 },
          durationMs: 128,
          status: "OK"
        },
        {
          tool: "prescription-builder",
          input: { plotId: "plot-a01", targetMoisture: 30.0 },
          output: { planId: "plan-a01-20260822", waterLitre: 153.0 },
          durationMs: 96,
          status: "OK"
        },
        {
          tool: "safety-gate",
          input: { planId: "plan-a01-20260822" },
          output: { approvalStatus: "PENDING", blocked: true },
          durationMs: 18,
          status: "OK"
        }
      ]
    },

    // I-12 人在回路安全闸门
    humanInLoopGate: {
      planId: "plan-a01-20260822",
      approvalStatus: "PENDING",
      approverId: null,
      ruleArbitration: {
        triggered: true,
        ruleVersion: "rule-1.0.0",
        decision: "BLOCK_UNTIL_APPROVED",
        reason: "高风险动作需人工确认，未审批前禁止执行"
      },
      interception: {
        attemptedAction: "execute-irrigation",
        blocked: true,
        message: "处方待审批，演示按钮已被安全闸门拦截"
      }
    },

    // I-13 决策回放与双轨对比
    decisionReplay: {
      scenarioId: "scenario-a01-20260822-001",
      seed: 42,
      replayable: true,
      comparisonCurves: {
        EXECUTE: [
          { minute: 0, moisture: 16.8 },
          { minute: 30, moisture: 22.0 },
          { minute: 60, moisture: 26.5 },
          { minute: 120, moisture: 28.5 }
        ],
        NO_ACTION: [
          { minute: 0, moisture: 16.8 },
          { minute: 30, moisture: 15.6 },
          { minute: 60, moisture: 15.2 },
          { minute: 120, moisture: 13.8 }
        ]
      },
      note: "固定 scenarioId 与随机种子，可重复回放，双轨不污染主状态"
    },

    // I-14 规则/模型双轨降级
    dualTrackDowngrade: {
      aiMode: "rules-only",
      aiModeLabel: "规则模式",
      indicators: [
        { code: "AI_MODEL", label: "AI 模型", status: "DEGRADED", note: "LLM 不可用，降级为 rules-only" },
        { code: "MESSAGING", label: "消息服务", status: "UP", note: "SSE/WebSocket 正常" },
        { code: "STORAGE", label: "存储分层", status: "UP", note: "PostgreSQL + Redis 正常" }
      ],
      frontendHint: "前端已显示降级状态，不伪装为模型结果"
    },

    // I-15 统一农务工单与今日农务中心
    unifiedWorkOrderCenter: {
      aggregatedItems: [
        { type: "ALERT", sourceId: "alert-water-a01", plotId: "plot-a01", title: "A01 缺水告警", priority: "HIGH", status: "OPEN" },
        { type: "DIAGNOSIS", sourceId: "diag-a01-001", plotId: "plot-a01", title: "A01 根因诊断", priority: "HIGH", status: "DONE" },
        { type: "INSPECTION", sourceId: "wo-inspect-b01", plotId: "plot-b01", title: "黄瓜棚 EC 比对", priority: "MEDIUM", status: "ASSIGNED" },
        { type: "DEVICE_CHECK", sourceId: "wo-device-a02", plotId: "plot-a02", title: "A02 流量计复测", priority: "MEDIUM", status: "DONE" }
      ],
      rawRecordLinks: [
        { workOrderId: "wo-alert-a01", refType: "ALERT", refId: "alert-water-a01" },
        { workOrderId: "wo-inspect-b01", refType: "INSPECTION_RECORD", refId: "ins-demo-a01" }
      ]
    },

    // I-28 决策就绪度与主动证据获取
    decisionReadiness: {
      plotId: "plot-a01",
      state: "READY", // READY / NEEDS_EVIDENCE / HUMAN_REVIEW / UNAVAILABLE
      score: 0.98,
      factors: [
        { code: "data_freshness", label: "数据新鲜度", status: "PASS" },
        { code: "coverage", label: "覆盖率", status: "PASS" },
        { code: "conflict", label: "证据冲突", status: "PASS" },
        { code: "device_health", label: "设备健康", status: "PASS" },
        { code: "permission", label: "权限", status: "PASS" },
        { code: "safety_gate", label: "安全门", status: "PENDING" }
      ],
      missingItems: [],
      autoBlocking: {
        triggered: false,
        note: "低质量或冲突证据将自动阻断可执行处方并生成补证任务"
      },
      autoTasks: [
        {
          workOrderId: "wo-evidence-a01",
          plotId: "plot-a01",
          actionType: "INSPECTION",
          title: "A01 数据质量不足，自动生成巡田复测任务",
          reason: "可靠度低于阈值，需补证后方可生成处方",
          autoGenerated: true,
          status: "PENDING"
        }
      ]
    }
  }
};
