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
    plotIds: ["plot-a01", "plot-a02", "plot-b01", "plot-a03", "plot-b02", "plot-b03", "plot-c01"],
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=AgriLoopAdmin"
  },

  farms: [
    {
      farmId: "farm-demo",
      name: "农智示范农场",
      region: "重庆 · 科学城",
      areaTotalM2: 240,
      cropCount: 5,
      plotCount: 7,
      // 演示主线与后端种子一致：温室1/2/3；a03/b02/b03/c01 仅管理端扩展样例
      waterPricePerLitre: 0.004,
      labourPricePerHour: 35.0
    }
  ],

  farmMembers: [
    {
      userId: "user-farmer",
      username: "farmer",
      displayName: "张明",
      role: "FARMER",
      roleLabel: "种植农户",
      farmIds: ["farm-demo"],
      plotIds: ["plot-a01", "plot-a02"],
      status: "ACTIVE",
      sourceMode: "SIMULATED"
    },
    {
      userId: "demo-farmer-b",
      username: "farmer-b",
      displayName: "李芳",
      role: "FARMER",
      roleLabel: "种植农户",
      farmIds: ["farm-demo"],
      plotIds: ["plot-b01"],
      status: "ACTIVE",
      sourceMode: "SIMULATED"
    },
    {
      userId: "demo-farmer-c",
      username: "farmer-c",
      displayName: "王强",
      role: "FARMER",
      roleLabel: "种植农户",
      farmIds: ["farm-demo"],
      plotIds: ["plot-a03", "plot-b02"],
      status: "INACTIVE",
      sourceMode: "SIMULATED"
    }
  ],

  plots: [
    {
      plotId: "plot-a01",
      name: "温室1",
      cropCode: "tomato",
      cropName: "番茄",
      cropVariety: "示范番茄",
      stageCode: "fruiting",
      stageLabel: "挂果采收期",
      areaM2: 80,
      riskLevel: "HIGH",
      healthScore: 0.52,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-a01",
      lastSeen: "刚刚",
      farmId: "farm-demo",
      status: "ACTIVE",
      metrics: {
        SOIL_MOISTURE: { value: 16.8, unit: "%", status: "ALERT", label: "土壤湿度", target: "20~40%" },
        AIR_TEMPERATURE: { value: 26.4, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~32°C" },
        AIR_HUMIDITY: { value: 64.2, unit: "%RH", status: "NORMAL", label: "空气湿度", target: "45~80%RH" },
        LIGHT: { value: 43500, unit: "lux", status: "NORMAL", label: "光照强度", target: "10k~70k lux" },
        CO2: { value: 680, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        PH: { value: 6.3, unit: "pH", status: "NORMAL", label: "酸碱度", target: "5.8~6.8" },
        WATER_LEVEL: { value: 42, unit: "%", status: "WARN", label: "水位", target: "20~90%" }
      }
    },
    {
      plotId: "plot-a02",
      name: "温室2",
      cropCode: "tomato",
      cropName: "番茄",
      cropVariety: "示范番茄",
      stageCode: "fruiting",
      stageLabel: "挂果采收期",
      areaM2: 100,
      riskLevel: "MEDIUM",
      healthScore: 0.78,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-a02",
      lastSeen: "1分钟前",
      farmId: "farm-demo",
      status: "ACTIVE",
      metrics: {
        SOIL_MOISTURE: { value: 28.5, unit: "%", status: "NORMAL", label: "土壤湿度", target: "20~40%" },
        AIR_TEMPERATURE: { value: 27.2, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~32°C" },
        AIR_HUMIDITY: { value: 61.7, unit: "%RH", status: "NORMAL", label: "空气湿度", target: "45~80%RH" },
        LIGHT: { value: 46800, unit: "lux", status: "NORMAL", label: "光照强度", target: "10k~70k lux" },
        CO2: { value: 710, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        PH: { value: 6.4, unit: "pH", status: "NORMAL", label: "酸碱度", target: "5.8~6.8" },
        WATER_LEVEL: { value: 68, unit: "%", status: "NORMAL", label: "水位", target: "20~90%" }
      }
    },
    {
      plotId: "plot-b01",
      name: "温室3",
      cropCode: "cucumber",
      cropName: "黄瓜",
      cropVariety: "示范黄瓜",
      stageCode: "vegetative",
      stageLabel: "营养生长期",
      areaM2: 120,
      riskLevel: "LOW",
      healthScore: 0.86,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-b01",
      lastSeen: "刚刚",
      farmId: "farm-demo",
      status: "ACTIVE",
      metrics: {
        SOIL_MOISTURE: { value: 26.2, unit: "%", status: "WARN", label: "土壤湿度", target: "28~48%" },
        AIR_TEMPERATURE: { value: 25.8, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~32°C" },
        AIR_HUMIDITY: { value: 68.5, unit: "%RH", status: "NORMAL", label: "空气湿度", target: "45~80%RH" },
        LIGHT: { value: 41200, unit: "lux", status: "NORMAL", label: "光照强度", target: "10k~70k lux" },
        CO2: { value: 660, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        PH: { value: 6.2, unit: "pH", status: "NORMAL", label: "酸碱度", target: "5.8~6.8" },
        WATER_LEVEL: { value: 72, unit: "%", status: "NORMAL", label: "水位", target: "20~90%" }
      }
    },
    {
      plotId: "plot-a03",
      name: "A03 扩展玉米田",
      cropCode: "corn",
      cropName: "鲜食玉米",
      cropVariety: "甜糯双色 8 号",
      stageCode: "flowering",
      stageLabel: "开花抽雄期",
      areaM2: 120,
      riskLevel: "LOW",
      healthScore: 0.88,
      deviceStatus: "ONLINE",
      deviceId: "mock-plot-a03",
      lastSeen: "2分钟前",
      farmId: "farm-demo",
      status: "ACTIVE",
      metrics: {
        SOIL_MOISTURE: { value: 29.0, unit: "%", status: "NORMAL", label: "土壤湿度", target: "25~45%" },
        AIR_TEMPERATURE: { value: 27.0, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~32°C" },
        AIR_HUMIDITY: { value: 60.0, unit: "%RH", status: "NORMAL", label: "空气湿度", target: "45~80%RH" },
        LIGHT: { value: 45000, unit: "lux", status: "NORMAL", label: "光照强度", target: "10k~70k lux" },
        CO2: { value: 700, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        PH: { value: 6.5, unit: "pH", status: "NORMAL", label: "酸碱度", target: "5.8~6.8" },
        WATER_LEVEL: { value: 70, unit: "%", status: "NORMAL", label: "水位", target: "20~90%" }
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
      farmId: "farm-demo",
      status: "ACTIVE",
      metrics: {
        SOIL_MOISTURE: { value: 24.8, unit: "%", status: "NORMAL", label: "土壤湿度", target: "20~38%" },
        AIR_TEMPERATURE: { value: 27.6, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~32°C" },
        AIR_HUMIDITY: { value: 58.9, unit: "%RH", status: "NORMAL", label: "空气湿度", target: "45~80%RH" },
        LIGHT: { value: 52000, unit: "lux", status: "NORMAL", label: "光照强度", target: "10k~70k lux" },
        CO2: { value: 690, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        PH: { value: 6.4, unit: "pH", status: "NORMAL", label: "酸碱度", target: "5.8~6.8" },
        WATER_LEVEL: { value: 65, unit: "%", status: "NORMAL", label: "水位", target: "20~90%" }
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
      farmId: "farm-demo",
      status: "ACTIVE",
      metrics: {
        SOIL_MOISTURE: { value: 31.0, unit: "%", status: "NORMAL", label: "土壤湿度", target: "25~45%" },
        AIR_TEMPERATURE: { value: 23.8, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~32°C" },
        AIR_HUMIDITY: { value: 70.4, unit: "%RH", status: "NORMAL", label: "空气湿度", target: "45~80%RH" },
        LIGHT: { value: 38000, unit: "lux", status: "NORMAL", label: "光照强度", target: "10k~70k lux" },
        CO2: { value: 740, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        PH: { value: 6.1, unit: "pH", status: "NORMAL", label: "酸碱度", target: "5.8~6.8" },
        WATER_LEVEL: { value: 60, unit: "%", status: "NORMAL", label: "水位", target: "20~90%" }
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
      farmId: "farm-demo",
      status: "ACTIVE",
      metrics: {
        SOIL_MOISTURE: { value: 32.5, unit: "%", status: "NORMAL", label: "土壤湿度", target: "28~45%" },
        AIR_TEMPERATURE: { value: 24.5, unit: "°C", status: "NORMAL", label: "空气温度", target: "18~32°C" },
        AIR_HUMIDITY: { value: 66.8, unit: "%RH", status: "NORMAL", label: "空气湿度", target: "45~80%RH" },
        LIGHT: { value: 45000, unit: "lux", status: "NORMAL", label: "光照强度", target: "10k~70k lux" },
        CO2: { value: 820, unit: "ppm", status: "NORMAL", label: "CO2浓度", target: "350~1200 ppm" },
        PH: { value: 6.3, unit: "pH", status: "NORMAL", label: "酸碱度", target: "5.8~6.8" },
        WATER_LEVEL: { value: 75, unit: "%", status: "NORMAL", label: "水位", target: "20~90%" }
      }
    }
  ],

  feedItems: [
    {
      id: "feed-101",
      type: "DIAGNOSIS",
      category: "根因诊断 · 风险分析",
      title: "【温室1】检测到土壤持续缺水风险，完成多因果排查",
      plotId: "plot-a01",
      plotName: "温室1 (番茄 · 挂果采收期)",
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
      plotName: "温室1 (番茄 · 挂果采收期)",
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
      title: "【今日待办】温室3 黄瓜水肥核验 & 温室1 番茄疏花",
      plotId: "plot-b01",
      plotName: "温室3 (黄瓜 · 营养生长期)",
      timestamp: "35 分钟前",
      timeIso: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      badge: { text: "2 项待执行", color: "purple" },
      author: { name: "农务协同调度中心", tag: "Work Orders", avatar: "📋" },
      summary: "根据 Crop Pack 作物全周期计划生成常规巡田工单：温室3 黄瓜 EC/pH 便携仪比对，以及温室1 番茄疏花打杈。",
      details: {
        tasks: [
          { name: "温室3 黄瓜棚土壤便携仪校准比对", priority: "MEDIUM", status: "PENDING", due: "16:30 前" },
          { name: "温室1 番茄第4穗花疏花打杈", priority: "LOW", status: "PENDING", due: "18:00 前" }
        ]
      },
      actions: [
        { label: "进入工单中心", type: "secondary", action: "open-subview", view: "work-orders" },
        { label: "录入人工巡田数据", type: "ghost", action: "open-subview", view: "work-orders", actionType: "new-inspection" }
      ]
    }
  ],

  alerts: [
    {
      alertId: "alert-water-a01",
      farmId: "farm-demo",
      plotId: "plot-a01",
      level: "HIGH",
      status: "ACTIVE",
      source: "SOIL_MOISTURE",
      title: "A01 土壤偏干",
      message: "土壤湿度持续低于番茄当前生长阶段的合适范围，请尽快确认是否需要浇水。",
      raisedAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
      provenance: "SIMULATED"
    },
    {
      alertId: "alert-device-a02",
      farmId: "farm-demo",
      plotId: "plot-a02",
      level: "MEDIUM",
      status: "ACKED",
      source: "DEVICE_FRESHNESS",
      title: "A02 流量计上报变慢",
      message: "流量计最近一次数据到达较慢，已确认，等待现场复查。",
      raisedAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
      provenance: "SIMULATED"
    }
  ],

  // farm-operations 分支的增量合同：只补充工单/巡田数据，不覆盖 main 的
  // 多作物、预测、Crop Pack 与价值账本演示数据。
  workOrders: [
    {
      workOrderId: "wo-alert-a01",
      workItemId: "wo-alert-a01",
      farmId: "farm-demo",
      plotId: "plot-a01",
      sourceType: "ALERT",
      sourceRef: "alert-water-a01",
      actionType: "IRRIGATION_REVIEW",
      title: "核对温室1 缺水告警并审批补水处方",
      reason: "土壤湿度连续低于番茄挂果采收期目标下限",
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
      farmId: "farm-demo",
      plotId: "plot-b01",
      sourceType: "CROP_PLAN",
      sourceRef: "task-template-cucumber-ec",
      actionType: "INSPECTION",
      title: "温室3 黄瓜棚水肥 EC/pH 便携仪比对",
      reason: "黄瓜营养生长期例行核验",
      priority: "MEDIUM",
      status: "ASSIGNED",
      assigneeId: "demo-farmer-b",
      assigneeName: "李芳",
      dueAt: new Date(Date.now() + 2.2 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      provenance: "DERIVED"
    },
    {
      workOrderId: "wo-prune-a02",
      workItemId: "wo-prune-a02",
      farmId: "farm-demo",
      plotId: "plot-a02",
      sourceType: "CROP_PLAN",
      sourceRef: "task-template-tomato-prune",
      actionType: "FIELD_OPERATION",
      title: "温室2 番茄第 4 穗花疏花打杈",
      reason: "挂果采收期标准农务",
      priority: "LOW",
      status: "IN_PROGRESS",
      assigneeId: "user-farmer",
      assigneeName: "张明",
      dueAt: new Date(Date.now() + 4.5 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      provenance: "DERIVED"
    },
    {
      workOrderId: "wo-device-a02",
      workItemId: "wo-device-a02",
      farmId: "farm-demo",
      plotId: "plot-a02",
      sourceType: "DEVICE_HEALTH",
      sourceRef: "mock-plot-a02",
      actionType: "DEVICE_CHECK",
      title: "检查温室2 流量计心跳延迟",
      reason: "设备新鲜度短时下降，需完成复测",
      priority: "MEDIUM",
      status: "DONE",
      assigneeId: "user-farmer",
      assigneeName: "张明",
      dueAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      provenance: "DERIVED"
    },
    {
      workOrderId: "wo-inspect-a01",
      workItemId: "wo-inspect-a01",
      farmId: "farm-demo",
      plotId: "plot-a01",
      sourceType: "MANUAL",
      sourceRef: null,
      actionType: "INSPECTION",
      title: "复测温室1 番茄田土壤湿度",
      reason: "使用便携仪复测三处取样点并记录结果",
      priority: "HIGH",
      status: "ASSIGNED",
      assigneeId: "user-farmer",
      assigneeName: "张明",
      dueAt: new Date(Date.now() + 80 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      provenance: "SIMULATED"
    },
    {
      workOrderId: "wo-review-a01",
      workItemId: "wo-review-a01",
      farmId: "farm-demo",
      plotId: "plot-a01",
      sourceType: "CROP_PLAN",
      sourceRef: "task-template-tomato-inspection",
      actionType: "FIELD_OPERATION",
      title: "清理番茄棚落叶并检查病斑",
      reason: "保持棚内通风，发现疑似病斑时单独标记",
      priority: "MEDIUM",
      status: "SUBMITTED",
      assigneeId: "user-farmer",
      assigneeName: "张明",
      resultSummary: "已清理两行落叶，未发现扩散性病斑，现场照片已留存。",
      evidenceRefs: ["inspection-demo-a01"],
      submittedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      dueAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      provenance: "SIMULATED"
    },
    {
      workOrderId: "wo-rework-a02",
      workItemId: "wo-rework-a02",
      farmId: "farm-demo",
      plotId: "plot-a02",
      sourceType: "MANUAL",
      sourceRef: null,
      actionType: "DEVICE_CHECK",
      title: "重新检查 A02 流量计接线",
      reason: "首次提交的照片未覆盖接线端子，需要补拍并复测",
      priority: "MEDIUM",
      status: "REJECTED",
      assigneeId: "user-farmer",
      assigneeName: "张明",
      rejectionReason: "请补充接线端子近照，并记录复测时间。",
      rejectedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      dueAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      provenance: "SIMULATED"
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
      rulesCount: 3,
      knowledgeDocs: [
        "knowledge/seedling.md",
        "knowledge/vegetative.md",
        "knowledge/flowering.md",
        "knowledge/fruiting.md",
        "knowledge/irrigation.md"
      ],
      description: "番茄需水敏感，结果期土壤含水率维持在 20%~40% 最佳，过湿易裂果，过干易脐腐；规则与阶段目标随生长阶段解析。"
    },
    {
      cropCode: "cucumber",
      name: "黄瓜 (Cucumber)",
      version: "1.0.0",
      ruleVersion: "rule-1.0.0",
      stages: ["seedling (苗期)", "vegetative (营养生长)", "flowering (初花期)", "fruiting (采收盛期)"],
      rulesCount: 3,
      knowledgeDocs: [
        "knowledge/seedling.md",
        "knowledge/vegetative.md",
        "knowledge/flowering.md",
        "knowledge/fruiting.md",
        "knowledge/irrigation.md"
      ],
      description: "黄瓜根系浅、喜湿怕涝；苗期土壤湿度 32%~52%，营养生长期 28%~48%，采收盛期 24%~44%。"
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
      status: "ACTIVE",
      identity: { name: "番茄", variety: "demonstration", region: "重庆", environment: "greenhouse" },
      stages: [
        { code: "seedling", sequence: 1, label: "苗期", target: { soilMoistureLow: 30, soilMoistureHigh: 50, airTemperatureLow: 18, airTemperatureHigh: 28, airHumidityLow: 60, airHumidityHigh: 80 }, riskFocus: ["WATER_DEFICIT", "COLD_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }], knowledgeRef: "knowledge/seedling.md" },
        { code: "vegetative", sequence: 2, label: "营养生长期", target: { soilMoistureLow: 25, soilMoistureHigh: 45, airTemperatureLow: 18, airTemperatureHigh: 30, airHumidityLow: 55, airHumidityHigh: 80 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }], knowledgeRef: "knowledge/vegetative.md" },
        { code: "flowering", sequence: 3, label: "开花坐果期", target: { soilMoistureLow: 23, soilMoistureHigh: 43, airTemperatureLow: 18, airTemperatureHigh: 32, airHumidityLow: 50, airHumidityHigh: 75 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }], knowledgeRef: "knowledge/flowering.md" },
        { code: "fruiting", sequence: 4, label: "果实成熟期", target: { soilMoistureLow: 20, soilMoistureHigh: 40, airTemperatureLow: 18, airTemperatureHigh: 32, airHumidityLow: 50, airHumidityHigh: 75 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }], knowledgeRef: "knowledge/fruiting.md" }
      ],
      metrics: [
        { code: "SOIL_MOISTURE", label: "土壤湿度", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } },
        { code: "AIR_TEMPERATURE", label: "空气温度", unit: "°C", availability: "SUPPORTED", range: { min: -40, max: 80 } },
        { code: "AIR_HUMIDITY", label: "空气湿度", unit: "%RH", availability: "SUPPORTED", range: { min: 0, max: 100 } },
        { code: "LIGHT", label: "光照强度", unit: "lux", availability: "SIMULATION_ONLY", range: { min: 0, max: 100000 } },
        { code: "CO2", label: "CO2", unit: "ppm", availability: "SIMULATION_ONLY", range: { min: 0, max: 10000 } },
        { code: "PH", label: "土壤酸碱度", unit: "pH", availability: "SIMULATION_ONLY", range: { min: 0, max: 14 } },
        { code: "WATER_LEVEL", label: "水箱水位", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } }
      ],
      rules: [
        { code: "WATER_DEFICIT", metric: "SOIL_MOISTURE", operator: "LT", durationMinutes: 5, hysteresis: 2, cooldownMinutes: 120 },
        { code: "HEAT_STRESS", metric: "AIR_TEMPERATURE", operator: "GT", durationMinutes: 10, hysteresis: 1, cooldownMinutes: 60 },
        { code: "COLD_STRESS", metric: "AIR_TEMPERATURE", operator: "LT", durationMinutes: 10, hysteresis: 1, cooldownMinutes: 60 }
      ],
      healthProfile: {
        algorithm: "crop-stage-health-v1",
        metricWeight: 0.68,
        deviceWeight: 0.14,
        riskWeight: 0.18,
        metricWeights: { SOIL_MOISTURE: 0.30, AIR_TEMPERATURE: 0.20, AIR_HUMIDITY: 0.16, LIGHT: 0.12, WATER_LEVEL: 0.12, CO2: 0.10 }
      },
      prescriptionConstraints: { maxDurationSeconds: 900, cooldownMinutes: 120, maxDailyWaterLitres: 5000 },
      forecastProfile: { algorithm: "robust-trend-v1", horizonsMinutes: [60, 120, 240], minValidSamples: 6, maxStalenessSeconds: 120 },
      coordinationProfile: { stageSensitivity: 0.9, starvationGuardMinutes: 120 },
      knowledgeVersion: "kb-1.0.0",
      ruleVersion: "rule-1.0.0",
      knowledge: {
        documents: ["knowledge/seedling.md", "knowledge/vegetative.md", "knowledge/flowering.md", "knowledge/fruiting.md", "knowledge/irrigation.md"],
        fallback: ["plot", "region", "stage", "crop", "general"],
        byStage: {
          seedling: [
            "苗期根系浅、叶片面积小，优先保持根区湿润和夜间保温，避免忽干忽湿。",
            "土壤湿度目标 30%~50%，气温 18~28°C；低于苗期湿度下限先复测，再决定是否补水。",
            "低质量或漂移数据只能触发巡田、复测和流量校准，不能直接生成可执行处方。"
          ],
          vegetative: [
            "营养生长期需水量上升，土壤湿度目标 25%~45%。",
            "高温时段注意通风，连续低于阶段下限才进入缺水规则；过湿同样会抑制根系。",
            "低质量或漂移数据只能触发巡田、复测和流量校准，不能直接生成可执行处方。"
          ],
          flowering: [
            "开花坐果期既要稳定根区水分，也要避免午后高温落花。",
            "土壤湿度目标 23%~43%，气温不宜长期超过 32°C。处方前确认设备流量和数据新鲜度。",
            "低质量或漂移数据只能触发巡田、复测和流量校准，不能直接生成可执行处方。"
          ],
          fruiting: [
            "结果期先确认土壤湿度时间窗口和设备流量，再决定灌溉时长。土壤湿度目标 20%~40%。",
            "灌溉时长受 900s 安全上限和 120 分钟冷却约束。",
            "数据质量不足时先巡田复测，不直接下发控制命令。"
          ]
        },
        content: [
          "# 番茄结果期灌溉知识",
          "",
          "结果期先确认土壤湿度时间窗口和设备流量，再决定灌溉时长。",
          "低质量或漂移数据只能触发巡田、复测和流量校准，不能直接生成可执行处方。",
          "",
          "- 结果期土壤含水率适宜区间：20%~40%",
          "- 灌溉时长受 900s 安全上限和 120 分钟冷却约束",
          "- 数据质量不足时先巡田复测，不直接下发控制命令",
          "",
          "> 证据范围：作物：番茄，阶段：fruiting，地区：重庆，知识版本：kb-1.0.0"
        ]
      },
      scenarios: { normal: { quality: "GOOD", expected: "stable" }, drought: { quality: "GOOD", expected: "soil_moisture_decline" }, "heavy-rain": { quality: "GOOD", expected: "soil_moisture_rise" }, "sensor-drift": { quality: "DEGRADED", expected: "quality_gate" }, "device-offline": { quality: "BAD", expected: "device_gate" } },
      testCases: ["normal", "drought", "heavy-rain", "sensor-drift", "device-offline"]
    },
    {
      cropCode: "cucumber",
      version: "1.0.0",
      schemaVersion: "1.0",
      status: "ACTIVE",
      identity: { name: "黄瓜", variety: "demonstration", region: "重庆", environment: "greenhouse" },
      stages: [
        { code: "seedling", sequence: 1, label: "苗期", target: { soilMoistureLow: 32, soilMoistureHigh: 52, airTemperatureLow: 19, airTemperatureHigh: 28, airHumidityLow: 65, airHumidityHigh: 85 }, riskFocus: ["WATER_DEFICIT", "COLD_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }], knowledgeRef: "knowledge/seedling.md" },
        { code: "vegetative", sequence: 2, label: "营养生长期", target: { soilMoistureLow: 28, soilMoistureHigh: 48, airTemperatureLow: 19, airTemperatureHigh: 30, airHumidityLow: 60, airHumidityHigh: 85 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }], knowledgeRef: "knowledge/vegetative.md" },
        { code: "flowering", sequence: 3, label: "初花期", target: { soilMoistureLow: 26, soilMoistureHigh: 46, airTemperatureLow: 19, airTemperatureHigh: 32, airHumidityLow: 55, airHumidityHigh: 80 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "INSPECTION", intervalDays: 2, priority: "MEDIUM" }], knowledgeRef: "knowledge/flowering.md" },
        { code: "fruiting", sequence: 4, label: "采收盛期", target: { soilMoistureLow: 24, soilMoistureHigh: 44, airTemperatureLow: 19, airTemperatureHigh: 32, airHumidityLow: 55, airHumidityHigh: 80 }, riskFocus: ["WATER_DEFICIT", "HEAT_STRESS"], taskTemplates: [{ actionType: "IRRIGATION_CHECK", intervalDays: 1, priority: "HIGH" }], knowledgeRef: "knowledge/fruiting.md" }
      ],
      metrics: [
        { code: "SOIL_MOISTURE", label: "土壤湿度", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } },
        { code: "AIR_TEMPERATURE", label: "空气温度", unit: "°C", availability: "SUPPORTED", range: { min: -40, max: 80 } },
        { code: "AIR_HUMIDITY", label: "空气湿度", unit: "%RH", availability: "SUPPORTED", range: { min: 0, max: 100 } },
        { code: "LIGHT", label: "光照强度", unit: "lux", availability: "SIMULATION_ONLY", range: { min: 0, max: 100000 } },
        { code: "CO2", label: "CO2", unit: "ppm", availability: "SIMULATION_ONLY", range: { min: 0, max: 10000 } },
        { code: "PH", label: "土壤酸碱度", unit: "pH", availability: "SIMULATION_ONLY", range: { min: 0, max: 14 } },
        { code: "WATER_LEVEL", label: "水箱水位", unit: "%", availability: "SUPPORTED", range: { min: 0, max: 100 } }
      ],
      rules: [
        { code: "WATER_DEFICIT", metric: "SOIL_MOISTURE", operator: "LT", durationMinutes: 5, hysteresis: 2, cooldownMinutes: 120 },
        { code: "HEAT_STRESS", metric: "AIR_TEMPERATURE", operator: "GT", durationMinutes: 10, hysteresis: 1, cooldownMinutes: 60 },
        { code: "COLD_STRESS", metric: "AIR_TEMPERATURE", operator: "LT", durationMinutes: 10, hysteresis: 1, cooldownMinutes: 60 }
      ],
      healthProfile: {
        algorithm: "crop-stage-health-v1",
        metricWeight: 0.68,
        deviceWeight: 0.14,
        riskWeight: 0.18,
        metricWeights: { SOIL_MOISTURE: 0.32, AIR_TEMPERATURE: 0.20, AIR_HUMIDITY: 0.16, LIGHT: 0.10, WATER_LEVEL: 0.12, CO2: 0.10 }
      },
      prescriptionConstraints: { maxDurationSeconds: 900, cooldownMinutes: 120, maxDailyWaterLitres: 5000 },
      forecastProfile: { algorithm: "robust-trend-v1", horizonsMinutes: [60, 120, 240], minValidSamples: 6, maxStalenessSeconds: 120 },
      coordinationProfile: { stageSensitivity: 0.85, starvationGuardMinutes: 120 },
      knowledgeVersion: "kb-1.0.0",
      ruleVersion: "rule-1.0.0",
      knowledge: {
        documents: ["knowledge/seedling.md", "knowledge/vegetative.md", "knowledge/flowering.md", "knowledge/fruiting.md", "knowledge/irrigation.md"],
        fallback: ["plot", "region", "stage", "crop", "general"],
        byStage: {
          seedling: [
            "黄瓜苗期喜湿怕涝，根系浅，土壤湿度目标 32%~52%，气温 19~28°C。",
            "夜间低温优先保温，不要把短时读数波动当成缺水。",
            "低质量或漂移数据只能触发巡田、复测，不能直接生成可执行处方。"
          ],
          vegetative: [
            "营养生长期需保持较稳定的根区水分，土壤湿度目标 28%~48%。",
            "高温强光时蒸散加快，但仍须先确认数据质量再试算补水。",
            "传感器漂移时优先人工核验，不把异常读数当成真实缺水。"
          ],
          flowering: [
            "初花期既要避免干旱落花，也要防止过湿诱发病害。土壤湿度目标 26%~46%。",
            "处方需同时参考阶段目标、趋势、设备健康和可用水量。",
            "数据质量 DEGRADED/BAD 时只触发巡田和复测。"
          ],
          fruiting: [
            "黄瓜根系浅、喜湿怕涝，采收盛期土壤含水率适宜区间 24%~44%。",
            "处方需同时参考阶段目标、趋势、设备健康和可用水量。",
            "传感器漂移时优先人工核验，不把异常读数当成真实缺水。"
          ]
        },
        content: [
          "# 黄瓜采收盛期灌溉知识",
          "",
          "黄瓜根系浅、喜湿怕涝，处方需同时参考阶段目标、趋势、设备健康和可用水量。",
          "传感器漂移时优先人工核验，不把异常读数当成真实缺水。",
          "",
          "- 采收盛期土壤含水率适宜区间：24%~44%",
          "- 数据质量 DEGRADED/BAD 时只触发巡田和复测",
          "- 根区水分保持稳定，避免过湿积水",
          "",
          "> 证据范围：作物：黄瓜，阶段：fruiting，地区：重庆，知识版本：kb-1.0.0"
        ]
      },
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
  // SYSTEM_ADMIN mock data — used exclusively by admin views
  // ============================================================

  adminGlobalDevices: [
    { id: 'dev-global-01', name: '全向网关 A 型', mac: '00:1A:2B:3C:4D:5E', status: 'ONLINE', farm: '科学城农场', bindStatus: 'BOUND' },
    { id: 'dev-global-02', name: '土壤四合一探头', mac: '00:1A:2B:3C:4D:5F', status: 'ONLINE', farm: '科学城农场', bindStatus: 'BOUND' },
    { id: 'dev-global-03', name: '智能灌溉控制柜', mac: '00:1A:2B:3C:4D:60', status: 'OFFLINE', farm: '白云基地', bindStatus: 'BOUND' },
    { id: 'dev-global-04', name: '高光谱摄像头', mac: '00:1A:2B:3C:4D:61', status: 'ONLINE', farm: '—', bindStatus: 'UNBOUND' }
  ],


  adminGlobalPlots: [
    { id: 'plot-a01', farm: '农智示范农场', crop: '番茄', status: 'CRITICAL', updated: '刚刚', issue: '土壤湿度偏低', metrics: { SOIL_MOISTURE: '16.8%', AIR_TEMPERATURE: '26.4°C', LIGHT: '43500 lux', CO2: '680 ppm', PH: '6.3', WATER_LEVEL: '42%' } },
    { id: 'plot-a02', farm: '农智示范农场', crop: '番茄', status: 'HEALTHY', updated: '1分钟前', metrics: { SOIL_MOISTURE: '28.5%', AIR_TEMPERATURE: '27.2°C', LIGHT: '46800 lux', CO2: '710 ppm', PH: '6.4', WATER_LEVEL: '68%' } },
    { id: 'plot-b01', farm: '农智示范农场', crop: '黄瓜', status: 'WARNING', updated: '刚刚', issue: '湿度略低于目标', metrics: { SOIL_MOISTURE: '26.2%', AIR_TEMPERATURE: '25.8°C', LIGHT: '41200 lux', CO2: '660 ppm', PH: '6.2', WATER_LEVEL: '72%' } },
    { id: 'plot-a03', farm: '农智示范农场', crop: '玉米', status: 'HEALTHY', updated: '2分钟前', metrics: { SOIL_MOISTURE: '29%', AIR_TEMPERATURE: '27°C', LIGHT: '45000 lux', CO2: '700 ppm', PH: '6.5', WATER_LEVEL: '70%' } },
    { id: 'plot-b02', farm: '农智示范农场', crop: '向日葵', status: 'HEALTHY', updated: '1分钟前', metrics: { SOIL_MOISTURE: '24.8%', AIR_TEMPERATURE: '27.6°C', LIGHT: '52000 lux', CO2: '690 ppm', PH: '6.4', WATER_LEVEL: '65%' } },
    { id: 'plot-b03', farm: '农智示范农场', crop: '草莓', status: 'HEALTHY', updated: '2分钟前', metrics: { SOIL_MOISTURE: '31%', AIR_TEMPERATURE: '23.8°C', LIGHT: '38000 lux', CO2: '740 ppm', PH: '6.1', WATER_LEVEL: '60%' } },
    { id: 'plot-c01', farm: '农智示范农场', crop: '番茄', status: 'HEALTHY', updated: '刚刚', metrics: { SOIL_MOISTURE: '32.5%', AIR_TEMPERATURE: '24.5°C', LIGHT: '45000 lux', CO2: '820 ppm', PH: '6.3', WATER_LEVEL: '75%' } }
  ],

  adminOverview: {
    uptime: '72h 34m',
    apiVersion: '1.4.0',
    aiMode: 'full',
    llmModel: 'Qwen-2.5-72B',
    alerts: { open: 3, acknowledged: 1, closedToday: 7 },
    devices: { total: 12, online: 10, offline: 2 },
    simulator: {
      running: true, scenario: 'NORMAL', eventsEmitted: 1847, startTime: '2026-08-25 08:00',
      history: [
        { id: 'sim-802', scenarioId: 'DROUGHT', timestamp: '2026-08-24 15:30', eventsEmitted: 450, status: 'COMPLETED' },
        { id: 'sim-803', scenarioId: 'STORM', timestamp: '2026-08-24 17:10', eventsEmitted: 210, status: 'ABORTED' },
        { id: 'sim-804', scenarioId: 'SENSOR_DRIFT', timestamp: '2026-08-25 09:00', eventsEmitted: 1200, status: 'COMPLETED' }
      ]
    },
    services: [
      { name: 'PostgreSQL', status: 'UP', latency: '3ms', version: '15.4' },
      { name: 'Redis Streams', status: 'UP', pending: 12, lag: '0.2s' },
      { name: 'MQTT Broker', status: 'UP', connections: 8, messagesPerSec: 45 },
      { name: 'SSE Gateway', status: 'UP', activeSessions: 3 },
      { name: 'API Service', status: 'UP', requestsPerMin: 120, p99: '85ms', version: '1.4.0' },
      { name: 'Qwen LLM', status: 'DEGRADED', mode: 'rules-only', lastCall: '2026-08-25 11:23' }
    ],
    recentEvents: [
      { id: 'ev-01', category: 'alert', icon: 'warning', title: 'plot-a01 土壤湿度低于阈值 (14%)', time: '11:45', traceId: 'trace-001' },
      { id: 'ev-02', category: 'agent', icon: 'psychology', title: 'Agent 生成灌溉处方 trace-001', time: '11:46', traceId: 'trace-001' },
      { id: 'ev-03', category: 'system', icon: 'check_circle', title: '灌溉命令执行完成 (45L)', time: '11:52', traceId: 'trace-001' },
      { id: 'ev-04', category: 'login', icon: 'login', title: '用户 admin 登录 (农场管理员)', time: '11:30' },
      { id: 'ev-05', category: 'simulator', icon: 'science', title: '模拟器启动 场景: NORMAL', time: '08:00' },
      { id: 'ev-06', category: 'config', icon: 'settings', title: '系统配置更新: AI模式 → full', time: '07:55' },
      { id: 'ev-07', category: 'alert', icon: 'warning', title: 'plot-b01 设备 dev-b01-th 心跳超时', time: '07:20' },
      { id: 'ev-08', category: 'agent', icon: 'psychology', title: 'Agent 诊断完成 trace-002 (传感器漂移)', time: '07:15', traceId: 'trace-002' },
      { id: 'ev-09', category: 'login', icon: 'login', title: '用户 farmer 登录 (种植农户)', time: '06:45' },
      { id: 'ev-10', category: 'system', icon: 'update', title: 'Crop Pack tomato 更新至 v2.1', time: '06:30' }
    ]
  },

  adminDevices: [
    { deviceId: 'dev-a01-soil', plotId: 'plot-a01', type: '土壤传感器', lastHeartbeat: '11:58', status: 'ONLINE' },
    { deviceId: 'dev-a01-th', plotId: 'plot-a01', type: '温湿度传感器', lastHeartbeat: '11:57', status: 'ONLINE' },
    { deviceId: 'dev-a01-pump', plotId: 'plot-a01', type: '灌溉执行器', lastHeartbeat: '11:55', status: 'ONLINE' },
    { deviceId: 'dev-a02-soil', plotId: 'plot-a02', type: '土壤传感器', lastHeartbeat: '11:56', status: 'ONLINE' },
    { deviceId: 'dev-a02-th', plotId: 'plot-a02', type: '温湿度传感器', lastHeartbeat: '11:56', status: 'ONLINE' },
    { deviceId: 'dev-a02-pump', plotId: 'plot-a02', type: '灌溉执行器', lastHeartbeat: '11:54', status: 'ONLINE' },
    { deviceId: 'dev-a03-soil', plotId: 'plot-a03', type: '土壤传感器', lastHeartbeat: '11:55', status: 'ONLINE' },
    { deviceId: 'dev-a03-th', plotId: 'plot-a03', type: '温湿度传感器', lastHeartbeat: '11:55', status: 'ONLINE' },
    { deviceId: 'dev-a03-pump', plotId: 'plot-a03', type: '灌溉执行器', lastHeartbeat: '11:53', status: 'ONLINE' },
    { deviceId: 'dev-b01-soil', plotId: 'plot-b01', type: '土壤传感器', lastHeartbeat: '11:50', status: 'ONLINE' },
    { deviceId: 'dev-b01-th', plotId: 'plot-b01', type: '温湿度传感器', lastHeartbeat: '07:10', status: 'OFFLINE' },
    { deviceId: 'dev-b03-soil', plotId: 'plot-b03', type: '土壤传感器', lastHeartbeat: '06:30', status: 'OFFLINE' }
  ],

  adminAlerts: [
    { id: 'alrt-01', time: '11:45', level: 'CRITICAL', source: 'plot-a01', summary: '土壤湿度持续低于安全阈值 14%，已触发干旱告警', status: 'OPEN' },
    { id: 'alrt-02', time: '07:20', level: 'WARNING', source: 'plot-b01', summary: '设备 dev-b01-th 心跳超时 >120s', status: 'OPEN' },
    { id: 'alrt-03', time: '07:15', level: 'WARNING', source: 'plot-b01', summary: 'Agent 检测到传感器漂移 (温度读数偏差 >3°C)', status: 'OPEN' },
    { id: 'alrt-04', time: '06:30', level: 'INFO', source: 'system', summary: 'Crop Pack tomato 已更新至 v2.1', status: 'ACK' },
    { id: 'alrt-05', time: '前日 22:10', level: 'CRITICAL', source: 'plot-a02', summary: '灌溉执行超时 (命令 cmd-042 未收到 ACK)', status: 'CLOSED' },
    { id: 'alrt-06', time: '前日 18:00', level: 'WARNING', source: 'system', summary: 'Redis Streams 消费延迟 >5s', status: 'CLOSED' },
    { id: 'alrt-07', time: '前日 15:30', level: 'INFO', source: 'system', summary: 'API Service 重启完成 (版本升级 1.3→1.4)', status: 'CLOSED' }
  ],

  adminAuditRecords: [
    {
      traceId: 'trace-001', time: '11:45', operator: 'Agent', plotId: 'plot-a01',
      type: 'DIAGNOSIS', typeLabel: '诊断→处方→执行', summary: '干旱根因诊断 → 灌溉处方 45L → 执行完成',
      result: 'PASS',
      passport: {
        trigger: 'SOIL_MOISTURE < 14% 持续 15min (plot-a01)',
        cropPack: 'tomato v2.1', ruleVersion: 'rules v1.3',
        ragRef: 'irrigation.md §3.2 "番茄开花期灌溉量"',
        similarCase: 'case-042 (相似度 0.87, 前次灌溉后 3h 恢复)',
        diagnosis: '根因=持续干旱, 置信度=0.82, 支持证据: 遥测+气象',
        prescription: '灌溉 45L, 分 3 次, 间隔 20min, 预期恢复至 22%',
        toolCall: 'estimateIrrigation({plotId:"plot-a01",volume:45,splits:3})',
        safetyGates: '✅ 全部通过 (5/5)', riskLevel: 'MEDIUM',
        execution: { status: 'COMPLETED', evaluation: '含水率 14%→19%, 评价=EFFECTIVE (3h后达标)' }
      }
    },
    {
      traceId: 'trace-002', time: '07:15', operator: 'Agent', plotId: 'plot-b01',
      type: 'DIAGNOSIS', typeLabel: '诊断 (传感器漂移)', summary: '温度传感器漂移 → 阻止灌溉处方生成',
      result: 'REJECT',
      passport: {
        trigger: 'AIR_TEMPERATURE 读数偏差 >3°C vs 相邻传感器',
        cropPack: 'strawberry v1.0', ruleVersion: 'rules v1.3',
        ragRef: 'sensor-calibration.md §2.1',
        similarCase: '无匹配案例',
        diagnosis: '根因=传感器漂移(非真实干旱), 置信度=0.91',
        prescription: '❌ 拒绝生成灌溉处方 (数据质量不达标)',
        toolCall: 'N/A (安全门阻断)',
        safetyGates: '❌ 数据质量门未通过 (传感器漂移)', riskLevel: 'HIGH',
        execution: null
      }
    },
    {
      traceId: 'trace-003', time: '前日 16:00', operator: 'admin', plotId: 'plot-a02',
      type: 'COMMAND', typeLabel: '手动灌溉命令', summary: '农场管理员手动下发灌溉 30L',
      result: 'PASS',
      passport: {
        trigger: '管理员手动操作',
        cropPack: 'cucumber v1.2', ruleVersion: 'rules v1.3',
        ragRef: 'N/A (手动操作)', similarCase: 'N/A',
        diagnosis: 'N/A (人工决策)', prescription: '灌溉 30L, 一次性',
        toolCall: 'executeIrrigation({planId:"plan-manual-001",plotId:"plot-a02"})',
        safetyGates: '✅ 全部通过 (权限+上限+冷却)', riskLevel: 'LOW',
        execution: { status: 'COMPLETED', evaluation: '含水率 18%→24%, 评价=EFFECTIVE' }
      }
    },
    {
      traceId: 'trace-004', time: '前日 14:30', operator: 'Agent', plotId: 'plot-a01',
      type: 'EVALUATION', typeLabel: '效果评价', summary: '历史灌溉效果回顾: 7次中5次有效',
      result: 'PASS',
      passport: {
        trigger: '定时效果评价任务',
        cropPack: 'tomato v2.1', ruleVersion: 'rules v1.3',
        ragRef: 'evaluation.md §1.3', similarCase: 'case-038, case-039',
        diagnosis: '统计: 有效率 71.4%, 平均恢复时间 2.8h',
        prescription: '建议: 保持当前策略, 关注第4阶段灌溉频次',
        toolCall: 'getCommandEvaluation({batchSize:7})',
        safetyGates: '✅ 通过', riskLevel: 'LOW',
        execution: null
      }
    }
  ],

  adminSimHistory: [
    { scenarioId: 'sim-20260825-001', type: '正常运行', startTime: '08:00', endTime: null, events: 1847, status: 'RUNNING' },
    { scenarioId: 'sim-20260824-003', type: '干旱场景', startTime: '前日 14:00', endTime: '前日 16:30', events: 892, status: 'COMPLETED' },
    { scenarioId: 'sim-20260824-002', type: '暴雨场景', startTime: '前日 10:00', endTime: '前日 12:15', events: 1203, status: 'COMPLETED' },
    { scenarioId: 'sim-20260824-001', type: '传感器漂移', startTime: '前日 07:00', endTime: '前日 08:30', events: 456, status: 'COMPLETED' },
    { scenarioId: 'sim-20260823-001', type: '设备离线恢复', startTime: '前2日 15:00', endTime: '前2日 16:00', events: 312, status: 'COMPLETED' }
  ],

  adminCropPacks: [
    { id: 'cp-tomato', icon: '🍅', name: '番茄', status: 'published', stages: ['苗期', '营养生长期', '开花坐果期', '果实成熟期'], knowledgeDocs: [{ title: '苗期管理', content: '苗期土壤湿度 30%~50%，气温 18~28°C；根系浅，避免忽干忽湿，低于下限先复测再补水。' }, { title: '营养生长期', content: '土壤湿度目标 25%~45%，高温注意通风；连续低于阶段下限才进入缺水规则。' }, { title: '开花坐果期', content: '土壤湿度 23%~43%，避免午后高温落花；处方前确认设备流量和数据新鲜度。' }, { title: '果实成熟期', content: '结果期土壤含水率 20%~40%，灌溉受 900s 上限与 120 分钟冷却约束；低质量数据不生成可执行处方。' }], availableForPlanting: true },
    { id: 'cp-cucumber', icon: '🥒', name: '黄瓜', status: 'published', stages: ['苗期', '营养生长期', '初花期', '采收盛期'], knowledgeDocs: [{ title: '苗期管理', content: '苗期喜湿怕涝，土壤湿度 32%~52%，气温 19~28°C；不要把短时读数波动当成缺水。' }, { title: '营养生长期', content: '土壤湿度目标 28%~48%；高温强光时先确认数据质量再试算补水，漂移优先人工核验。' }, { title: '初花期', content: '土壤湿度 26%~46%，既防干旱落花也防过湿诱病；DEGRADED/BAD 只触发巡田复测。' }, { title: '采收盛期', content: '采收盛期土壤含水率 24%~44%，保持根区稳定，避免过湿积水。' }], availableForPlanting: true },
    { id: 'cp-strawberry', icon: '🍓', name: '草莓', status: 'draft', stages: ['缓苗期', '营养生长期', '开花期', '膨果期', '采收期'], knowledgeDocs: [{ title: '草莓温湿度管理', content: '草莓开花和膨果期需关注温度、土壤湿度及设备在线状态，数据质量不足时转人工复核。' }], availableForPlanting: true },
    { id: 'cp-corn', icon: '🌽', name: '玉米', status: 'published', stages: ['播种出苗期', '拔节期', '抽雄吐丝期', '灌浆成熟期'], knowledgeDocs: [{ title: '玉米水分管理', content: '拔节期和抽雄吐丝期是需水关键期，灌溉前应核对土壤湿度和水位。' }, { title: '玉米生长巡查', content: '重点记录株高、叶片卷曲和倒伏情况，人工观察与遥测分别保存。' }], availableForPlanting: true },
    { id: 'cp-sunflower', icon: '🌻', name: '向日葵', status: 'published', stages: ['出苗期', '现蕾期', '开花期', '灌浆成熟期'], knowledgeDocs: [{ title: '向日葵灌溉管理', content: '现蕾至开花期关注土壤湿度连续变化，避免高温时段一次性过量灌溉。' }, { title: '向日葵田间识别', content: '巡查叶片萎蔫、花盘发育和病斑，异常时创建人工核验任务。' }], availableForPlanting: true }
  ],

  adminRules: [
    { id: 'RULE-SAFETY-001', description: '灌溉上限检查 (每次不超过 100L)', type: '安全门', version: '1.3', status: 'published' },
    { id: 'RULE-SAFETY-002', description: '命令冷却窗口 (同一设备 60s 内不重复)', type: '安全门', version: '1.3', status: 'published' },
    { id: 'RULE-DIAG-001', description: '干旱 vs 传感器漂移分流规则', type: '诊断', version: '1.3', status: 'published' },
    { id: 'RULE-DIAG-002', description: '多源证据融合置信度计算', type: '诊断', version: '1.2', status: 'published' },
    { id: 'RULE-THRESH-001', description: '土壤湿度告警阈值 (按作物阶段)', type: '阈值', version: '1.3', status: 'published' },
    { id: 'RULE-THRESH-002', description: '温湿度异常范围 (全局)', type: '阈值', version: '1.1', status: 'published' },
    { id: 'RULE-EVAL-001', description: '灌溉效果评价标准 (3h内恢复率)', type: '评价', version: '1.0', status: 'draft' }
  ],


  adminWorkOrders: [
    { id: "WO-2608-01", plot: "plot-a01", source: "SYSTEM", type: "IRRIGATION_CHECK", status: "COMPLETED", operator: "农户老王", time: "2026-08-22 09:30" },
    { id: "WO-2608-02", plot: "plot-a02", source: "MANUAL", type: "INSPECTION", status: "PENDING", operator: "技术员小李", time: "2026-08-22 10:15" },
    { id: "WO-2608-03", plot: "plot-b01", source: "SYSTEM", type: "MAINTENANCE", status: "IN_PROGRESS", operator: "设备组张工", time: "2026-08-22 14:00" }
  ],

  adminValueLedgerAudits: [
    { traceId: "VAL-9921", date: "2026-08-21", plot: "plot-a01", item: "节水核算", baseline: "1200L/天", actual: "850L/天", counterfactual: "基于邻区传统漫灌对照组", sourceTag: "OBSERVED, 模拟器", result: "节水 350L (省 ¥1.4)" },
    { traceId: "VAL-9922", date: "2026-08-21", plot: "plot-a02", item: "电费节约", baseline: "12 kWh/天", actual: "9.5 kWh/天", counterfactual: "水泵启停优化算法 v1.2", sourceTag: "DERIVED", result: "节电 2.5 kWh (省 ¥1.37)" }
  ],

  adminStrategyCandidates: [
    { id: 'SC-001', source: 'learning', description: '番茄开花期分段灌溉: 3次×15L 优于 1次×45L (基于 case-038~042)', status: 'verified' },
    { id: 'SC-002', source: 'manual', description: '高温天气 (>35°C) 自动增加灌溉频次 20%', status: 'pending' },
    { id: 'SC-003', source: 'learning', description: '黄瓜挂果期降低土壤湿度告警阈值至 16%', status: 'approved' }
  ],

  adminUsers: [
    { userId: 'user-sysadmin', username: 'sysadmin', role: 'SYSTEM_ADMIN', roleLabel: '系统管理员', farmName: '全局', plotIds: ['*'], enabled: true, createdAt: '2026-08-20' },
    { userId: 'user-admin', username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员', farmName: '农智示范农场', plotIds: ['plot-a01','plot-a02','plot-b01','plot-a03','plot-b02','plot-b03','plot-c01'], enabled: true, createdAt: '2026-08-20' },
    { userId: 'user-farmer', username: 'farmer', role: 'FARMER', roleLabel: '种植农户', farmName: '农智示范农场', plotIds: ['plot-a01','plot-a02'], enabled: true, createdAt: '2026-08-21' },
    { userId: 'demo-farmer-b', username: 'farmer-b', role: 'FARMER', roleLabel: '种植农户', farmName: '农智示范农场', plotIds: ['plot-b01'], enabled: true, createdAt: '2026-08-22' },
    { userId: 'demo-farmer-c', username: 'farmer-c', role: 'FARMER', roleLabel: '种植农户', farmName: '农智示范农场', plotIds: ['plot-a03','plot-b02'], enabled: false, createdAt: '2026-08-22' }
  ],

  adminAuditLogs: [
    { id: 'log-01', time: '11:30', operator: 'admin', action: 'LOGIN', actionLabel: '登录', detail: '农场管理员登录成功', ip: '192.168.1.100' },
    { id: 'log-02', time: '08:00', operator: 'sysadmin', action: 'CONFIG_CHANGE', actionLabel: '修改配置', detail: '启动模拟器: 场景 NORMAL, seed=42', ip: '192.168.1.50' },
    { id: 'log-03', time: '07:55', operator: 'sysadmin', action: 'CONFIG_CHANGE', actionLabel: '修改配置', detail: 'AI 模式切换: rules-only → full', ip: '192.168.1.50' },
    { id: 'log-04', time: '前日 22:00', operator: 'sysadmin', action: 'RULE_PUBLISH', actionLabel: '发布规则', detail: '发布 Crop Pack tomato v2.1', ip: '192.168.1.50' },
    { id: 'log-05', time: '前日 20:00', operator: 'sysadmin', action: 'USER_CREATE', actionLabel: '创建用户', detail: '创建用户 worker1 (种植农户)', ip: '192.168.1.50' },
    { id: 'log-06', time: '前日 18:30', operator: 'admin', action: 'LOGIN', actionLabel: '登录', detail: '农场管理员登录成功', ip: '10.0.0.15' },
    { id: 'log-07', time: '前日 15:00', operator: 'farmer', action: 'LOGIN', actionLabel: '登录', detail: '种植农户登录成功', ip: '10.0.0.22' },
    { id: 'log-08', time: '前日 10:00', operator: 'sysadmin', action: 'CONFIG_CHANGE', actionLabel: '修改配置', detail: '启动暴雨场景模拟', ip: '192.168.1.50' }
  ],

  // ============================================================
  // 种植农户工作台专用数据
  // ============================================================
  farmer_messages: [
    {
      id: "msg-001",
      category: "alert",
      title: "【紧急】温室1土壤湿度持续低于阈值",
      snippet: "近 3 个采样周期土壤湿度均低于 20%，已触发干旱风险告警，请尽快核实并处理。",
      body_paragraphs: [
        "地块 温室1近 3 个采样周期土壤湿度均低于 20% 目标下限，最新读数 16.8%。",
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
        "温室2流量计此前出现短时心跳延迟，最新一次设备健康检查已通过。",
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
      title: "【提醒】温室1灌溉处方待您确认",
      snippet: "系统已生成 温室1灌溉处方（建议时长 8.5 分钟 / 153 升），等待农场管理员审批。",
      body_paragraphs: [
        "系统已针对 温室1缺水风险生成结构化灌溉处方。",
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
      title: "温室2 番茄棚便携仪湿度复测",
      reason: "挂果采收期例行核验",
      instruction: "在温室2 五个标准采样点采集便携仪读数，与在线土壤湿度对比，偏差超过 3% 需上报。",
      status: "ASSIGNED",
      priority: "MEDIUM",
      plot_id: "plot-a02",
      plot_name: "温室2",
      issuer: "农场管理员",
      created_iso: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      due_iso: new Date(Date.now() + 2.2 * 60 * 60 * 1000).toISOString(),
      created_label: "45 分钟前",
      due_label: "今日 16:30"
    },
    {
      id: "ft-002",
      title: "温室1 番茄第 4 穗花疏花打杈",
      reason: "挂果采收期标准农务",
      instruction: "对温室1 番茄棚第 4 穗花进行疏花打杈，每穗保留 4-5 朵健花，去除多余花蕾与侧枝。",
      status: "IN_PROGRESS",
      priority: "LOW",
      plot_id: "plot-a01",
      plot_name: "温室1",
      issuer: "农场管理员",
      created_iso: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      due_iso: new Date(Date.now() + 4.5 * 60 * 60 * 1000).toISOString(),
      created_label: "1.5 小时前",
      due_label: "今日 18:00"
    },
    {
      id: "ft-003",
      title: "温室2 流量计心跳延迟复测",
      reason: "设备新鲜度短时下降，需完成复测",
      instruction: "现场检查温室2 流量计电源与通信线路，记录复测后心跳间隔。",
      status: "DONE",
      priority: "MEDIUM",
      plot_id: "plot-a02",
      plot_name: "温室2",
      issuer: "农场管理员",
      created_iso: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      due_iso: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      created_label: "3 小时前",
      due_label: "已完成"
    },
    {
      id: "ft-004",
      title: "负责地块设备例行巡检",
      reason: "每周一例行设备健康巡检",
      instruction: "巡查温室1、温室2 在线设备外观、电源、通信状态，填写巡检表并拍照上传。",
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
      title: "温室1 番茄缺水告警现场核实",
      reason: "土壤湿度连续低于番茄挂果采收期目标下限",
      instruction: "现场查看温室1 土壤表层与根系层湿度，观察植株萎蔫情况，与传感器读数对比。",
      status: "ASSIGNED",
      priority: "HIGH",
      plot_id: "plot-a01",
      plot_name: "温室1",
      issuer: "农场管理员",
      created_iso: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      due_iso: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
      created_label: "18 分钟前",
      due_label: "35 分钟内"
    },
    {
      id: "ft-006",
      title: "温室2 番茄挂果期田间观察记录",
      reason: "番茄挂果采收期长势记录",
      instruction: "在温室2 选取 5 个样点，记录穗花数、叶片色泽、病虫害情况。",
      status: "ASSIGNED",
      priority: "MEDIUM",
      plot_id: "plot-a02",
      plot_name: "温室2",
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
    plot_names: ["温室1", "温室2"],
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
        { type: "ALERT", sourceId: "alert-water-a01", plotId: "plot-a01", title: "温室1 缺水告警", priority: "HIGH", status: "OPEN" },
        { type: "DIAGNOSIS", sourceId: "diag-a01-001", plotId: "plot-a01", title: "温室1 根因诊断", priority: "HIGH", status: "DONE" },
        { type: "INSPECTION", sourceId: "wo-inspect-b01", plotId: "plot-b01", title: "温室3 黄瓜棚 EC 比对", priority: "MEDIUM", status: "ASSIGNED" },
        { type: "DEVICE_CHECK", sourceId: "wo-device-a02", plotId: "plot-a02", title: "温室2 流量计复测", priority: "MEDIUM", status: "DONE" }
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
