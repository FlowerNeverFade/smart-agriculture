/**
 * AgriLoop Modern Farmland Digital Twin (智慧农田数字化孪生系统)
 * Pure 3D WebGL Living Farmland World (Three.js)
 * 
 * Features:
 * - Expansive Panoramic Farmland Park (7 customizable plots across 90m x 70m terrain)
 * - Zero-clipping procedural elevation system for terrain, mountains, trees, and buildings
 * - Stable cinematic camera with dedicated silky directional mouse-wind physics
 * - High-detail botanical 3D models for 6 crops: Tomato, Cucumber, Rice, Corn, Sunflower, Strawberry
 * - Per-plot INDIVIDUAL crop and growth stage customizer (each plot can be independently changed!)
 * - Plot A01 pulsating red warning beacon & ground radar pulse
 * - 06:00 Sunrise & 18:00 Sunset cinematic day/night cycle with night lights (greenhouse, streetlamps, fireflies)
 * - 6-state dynamic weather particle engine (Sunny, Cloudy, Overcast, Light Rain, Moderate Rain, Heavy Rain)
 * - Smooth expanding glassmorphism inspection modal with IoT sensors, 24h curve, and AI prescription
 */

import * as THREE from '../vendor/three/three.module.min.js';

const WEATHER_LABELS = {
  sunny: '晴天',
  cloudy: '多云',
  overcast: '阴天',
  'light-rain': '小雨',
  'moderate-rain': '中雨',
  'heavy-rain': '大雨'
};

const WEATHER_ICONS = {
  sunny: 'ph-sun',
  cloudy: 'ph-cloud-sun',
  overcast: 'ph-cloud',
  'light-rain': 'ph-cloud-rain',
  'moderate-rain': 'ph-cloud-rain',
  'heavy-rain': 'ph-cloud-lightning'
};

const CROP_PROFILES = {
  tomato: { label: '优质番茄', icon: '🍅', family: '茄果类 (Solanaceae)', stem: 0x3a7940, leaf: 0x3c994c, leafDark: 0x226e38, fruit: 0xe94e36, height: 1.25, spacing: 0.52 },
  cucumber: { label: '水果黄瓜', icon: '🥒', family: '瓜果类 (Cucurbitaceae)', stem: 0x3d8645, leaf: 0x54aa53, leafDark: 0x2a783c, fruit: 0x76ad40, height: 1.45, spacing: 0.56 },
  rice: { label: '生态水稻', icon: '🌾', family: '粮食类 (Poaceae)', stem: 0x8cb54c, leaf: 0xa4c75a, leafDark: 0x658a34, fruit: 0xd6bb56, height: 0.88, spacing: 0.36 },
  corn: { label: '鲜食玉米', icon: '🌽', family: '粮食类 (Poaceae)', stem: 0x488f44, leaf: 0x65a94c, leafDark: 0x2f773b, fruit: 0xdfb44b, height: 1.72, spacing: 0.60 },
  sunflower: { label: '油葵花海', icon: '🌻', family: '油料类 (Asteraceae)', stem: 0x4a8b42, leaf: 0x5da648, leafDark: 0x2c6f33, fruit: 0xf5bf28, height: 1.60, spacing: 0.58 },
  strawberry: { label: '红颊草莓', icon: '🍓', family: '浆果类 (Rosaceae)', stem: 0x38753e, leaf: 0x489f50, leafDark: 0x236c34, fruit: 0xe83838, height: 0.52, spacing: 0.42 }
};

const STAGE_PROFILES = {
  seedling: { label: '苗期', height: 0.45, density: 0.68, fruit: 0 },
  vegetative: { label: '营养生长期', height: 0.78, density: 0.85, fruit: 0.08 },
  flowering: { label: '开花坐果期', height: 0.92, density: 0.95, fruit: 0.55 },
  fruiting: { label: '挂果采收期', height: 1.0, density: 1.0, fruit: 1.0 }
};

const PLOT_LAYOUT = {
  'plot-a01': { x: -20.5, z: 8.5, width: 8.5, depth: 7.5, rotation: -0.02, name: 'A01 番茄示范田', defaultCrop: 'tomato', defaultStage: 'fruiting' },
  'plot-a02': { x: -9.5, z: 8.5, width: 8.5, depth: 7.5, rotation: 0.015, name: 'A02 玉米高产田', defaultCrop: 'corn', defaultStage: 'flowering' },
  'plot-a03': { x: -20.5, z: -2.0, width: 8.5, depth: 7.5, rotation: -0.018, name: 'A03 黄瓜立体架', defaultCrop: 'cucumber', defaultStage: 'vegetative' },
  'plot-b01': { x: 6.5, z: 9.0, width: 9.5, depth: 8.5, rotation: 0.022, name: 'B01 生态水稻田', defaultCrop: 'rice', defaultStage: 'vegetative' },
  'plot-b02': { x: 19.5, z: 9.0, width: 9.5, depth: 8.5, rotation: -0.015, name: 'B02 向日葵花海', defaultCrop: 'sunflower', defaultStage: 'flowering' },
  'plot-b03': { x: 19.5, z: -1.5, width: 9.5, depth: 8.0, rotation: 0.018, name: 'B03 草莓精品区', defaultCrop: 'strawberry', defaultStage: 'fruiting' },
  'plot-c01': { x: -8.0, z: -13.0, width: 12.0, depth: 8.5, rotation: 0.0, name: 'C01 智能连栋温室', defaultCrop: 'tomato', defaultStage: 'fruiting', isGreenhouse: true }
};

const RECLAMATION_SLOTS = [
  {
    slotId: 'plot-e01',
    zoneName: '东区现代高效示范带',
    name: 'E01 优质粮蔬扩展田',
    defaultCrop: 'corn',
    defaultStage: 'seedling',
    x: 32.0,
    z: -3.5,
    width: 8.5,
    depth: 7.0,
    rotation: -0.015,
    soilMoisture: '28.5%',
    estYield: '680 kg/亩',
    canalStart: { x: 13.2, z: -3.5 },
    canalEnd: { x: 27.5, z: -3.5 }
  },
  {
    slotId: 'plot-e02',
    zoneName: '东区现代高效示范带',
    name: 'E02 特色浆果栽培田',
    defaultCrop: 'strawberry',
    defaultStage: 'seedling',
    x: 32.0,
    z: 8.8,
    width: 8.5,
    depth: 7.0,
    rotation: 0.015,
    soilMoisture: '26.8%',
    estYield: '850 kg/亩',
    canalStart: { x: 13.2, z: 8.8 },
    canalEnd: { x: 27.5, z: 8.8 }
  },
  {
    slotId: 'plot-w01',
    zoneName: '西区绿色有机培育带',
    name: 'W01 水果黄瓜架栽田',
    defaultCrop: 'cucumber',
    defaultStage: 'seedling',
    x: -32.0,
    z: -3.5,
    width: 8.5,
    depth: 7.0,
    rotation: 0.015,
    soilMoisture: '27.2%',
    estYield: '920 kg/亩',
    canalStart: { x: -14.8, z: -3.5 },
    canalEnd: { x: -27.5, z: -3.5 }
  },
  {
    slotId: 'plot-w02',
    zoneName: '西区绿色有机培育带',
    name: 'W02 高品质番茄培育田',
    defaultCrop: 'tomato',
    defaultStage: 'seedling',
    x: -32.0,
    z: 8.8,
    width: 8.5,
    depth: 7.0,
    rotation: -0.015,
    soilMoisture: '25.9%',
    estYield: '1,100 kg/亩',
    canalStart: { x: -14.8, z: 8.8 },
    canalEnd: { x: -27.5, z: 8.8 }
  },
  {
    slotId: 'plot-s01',
    zoneName: '南区高产粮油核心带',
    name: 'S01 金秋油葵试验田',
    defaultCrop: 'sunflower',
    defaultStage: 'seedling',
    x: -14.0,
    z: 23.5,
    width: 8.5,
    depth: 7.0,
    rotation: 0.0,
    soilMoisture: '29.1%',
    estYield: '540 kg/亩',
    canalStart: { x: -14.0, z: 14.2 },
    canalEnd: { x: -14.0, z: 20.0 }
  },
  {
    slotId: 'plot-s02',
    zoneName: '南区高产粮油核心带',
    name: 'S02 绿色生态水稻田',
    defaultCrop: 'rice',
    defaultStage: 'seedling',
    x: 14.0,
    z: 23.5,
    width: 8.5,
    depth: 7.0,
    rotation: 0.0,
    soilMoisture: '34.2%',
    estYield: '720 kg/亩',
    canalStart: { x: 14.0, z: 14.2 },
    canalEnd: { x: 14.0, z: 20.0 }
  }
];

const SECTOR_VIEWS = {
  all: { name: '全域总览', icon: 'ph-globe', cam: { x: 0, y: 32, z: 46 }, target: { x: 0, y: 0, z: -2 } },
  core: { name: '核心示范区', icon: 'ph-squares-four', cam: { x: 0, y: 22, z: 28 }, target: { x: 0, y: 0, z: 4 } },
  east: { name: '东区高效带', icon: 'ph-arrow-right', cam: { x: 28, y: 20, z: 22 }, target: { x: 26, y: 0, z: 2 } },
  west: { name: '西区有机带', icon: 'ph-arrow-left', cam: { x: -28, y: 20, z: 22 }, target: { x: -26, y: 0, z: 2 } },
  south: { name: '南区高产带', icon: 'ph-arrow-down', cam: { x: 0, y: 22, z: 38 }, target: { x: 0, y: 0, z: 20 } },
  north: { name: '北区温室群', icon: 'ph-buildings', cam: { x: 0, y: 20, z: 8 }, target: { x: 0, y: 0, z: -14 } }
};

const DEFAULT_PLOTS = [
  {
    plotId: 'plot-a01', name: 'A01 号地块 (番茄示范田)', cropCode: 'tomato', cropName: '优质番茄', stageCode: 'fruiting', stageLabel: '挂果采收期',
    riskLevel: 'HIGH', healthScore: 0.94,
    metrics: {
      SOIL_MOISTURE: { label: '土壤湿度', value: 16.8, unit: '%', status: 'WARN', target: '20~40%' },
      AIR_TEMPERATURE: { label: '空气温度', value: 26.4, unit: '°C', status: 'NORMAL', target: '20~30°C' },
      LIGHT: { label: '光照强度', value: 43500, unit: 'lux', status: 'NORMAL', target: '30k~55k lux' },
      CO2: { label: 'CO₂ 浓度', value: 680, unit: 'ppm', status: 'NORMAL', target: '500~800 ppm' },
      SOIL_EC: { label: '土壤 EC 值', value: 1.4, unit: 'mS/cm', status: 'NORMAL', target: '1.0~2.2 mS/cm' },
      NPK_RATIO: { label: '氮磷钾肥力', value: '180:95:210', unit: 'mg/kg', status: 'NORMAL', target: '均衡充足' }
    }
  },
  {
    plotId: 'plot-a02', name: 'A02 号地块 (玉米高产田)', cropCode: 'corn', cropName: '鲜食玉米', stageCode: 'flowering', stageLabel: '开花抽雄期',
    riskLevel: 'LOW', healthScore: 0.98,
    metrics: {
      SOIL_MOISTURE: { label: '土壤湿度', value: 28.5, unit: '%', status: 'NORMAL', target: '25~45%' },
      AIR_TEMPERATURE: { label: '空气温度', value: 27.2, unit: '°C', status: 'NORMAL', target: '20~32°C' },
      LIGHT: { label: '光照强度', value: 46800, unit: 'lux', status: 'NORMAL', target: '30k~60k lux' },
      CO2: { label: 'CO₂ 浓度', value: 710, unit: 'ppm', status: 'NORMAL', target: '500~800 ppm' },
      SOIL_EC: { label: '土壤 EC 值', value: 1.6, unit: 'mS/cm', status: 'NORMAL', target: '1.2~2.4 mS/cm' },
      NPK_RATIO: { label: '氮磷钾肥力', value: '195:102:220', unit: 'mg/kg', status: 'NORMAL', target: '均衡充足' }
    }
  },
  {
    plotId: 'plot-a03', name: 'A03 号地块 (黄瓜立体架)', cropCode: 'cucumber', cropName: '水果黄瓜', stageCode: 'vegetative', stageLabel: '营养生长期',
    riskLevel: 'LOW', healthScore: 0.99,
    metrics: {
      SOIL_MOISTURE: { label: '土壤湿度', value: 26.2, unit: '%', status: 'NORMAL', target: '22~40%' },
      AIR_TEMPERATURE: { label: '空气温度', value: 25.8, unit: '°C', status: 'NORMAL', target: '20~30°C' },
      LIGHT: { label: '光照强度', value: 41200, unit: 'lux', status: 'NORMAL', target: '28k~50k lux' },
      CO2: { label: 'CO₂ 浓度', value: 660, unit: 'ppm', status: 'NORMAL', target: '500~800 ppm' },
      SOIL_EC: { label: '土壤 EC 值', value: 1.3, unit: 'mS/cm', status: 'NORMAL', target: '1.0~2.0 mS/cm' },
      NPK_RATIO: { label: '氮磷钾肥力', value: '170:90:200', unit: 'mg/kg', status: 'NORMAL', target: '均衡充足' }
    }
  },
  {
    plotId: 'plot-b01', name: 'B01 号地块 (生态水稻田)', cropCode: 'rice', cropName: '生态水稻', stageCode: 'vegetative', stageLabel: '分蘖生长期',
    riskLevel: 'LOW', healthScore: 0.99,
    metrics: {
      SOIL_MOISTURE: { label: '田面湿度', value: 35.4, unit: '%', status: 'NORMAL', target: '30~55%' },
      AIR_TEMPERATURE: { label: '空气温度', value: 25.1, unit: '°C', status: 'NORMAL', target: '20~30°C' },
      LIGHT: { label: '光照强度', value: 39500, unit: 'lux', status: 'NORMAL', target: '25k~50k lux' },
      CO2: { label: 'CO₂ 浓度', value: 650, unit: 'ppm', status: 'NORMAL', target: '500~800 ppm' },
      SOIL_EC: { label: '土壤 EC 值', value: 1.3, unit: 'mS/cm', status: 'NORMAL', target: '0.8~1.8 mS/cm' },
      NPK_RATIO: { label: '氮磷钾肥力', value: '175:88:190', unit: 'mg/kg', status: 'NORMAL', target: '均衡充足' }
    }
  },
  {
    plotId: 'plot-b02', name: 'B02 号地块 (向日葵花海)', cropCode: 'sunflower', cropName: '油葵花海', stageCode: 'flowering', stageLabel: '盛花结盘期',
    riskLevel: 'LOW', healthScore: 0.97,
    metrics: {
      SOIL_MOISTURE: { label: '土壤湿度', value: 24.8, unit: '%', status: 'NORMAL', target: '20~38%' },
      AIR_TEMPERATURE: { label: '空气温度', value: 27.6, unit: '°C', status: 'NORMAL', target: '20~32°C' },
      LIGHT: { label: '光照强度', value: 52000, unit: 'lux', status: 'NORMAL', target: '35k~65k lux' },
      CO2: { label: 'CO₂ 浓度', value: 690, unit: 'ppm', status: 'NORMAL', target: '500~800 ppm' },
      SOIL_EC: { label: '土壤 EC 值', value: 1.5, unit: 'mS/cm', status: 'NORMAL', target: '1.0~2.2 mS/cm' },
      NPK_RATIO: { label: '氮磷钾肥力', value: '185:92:205', unit: 'mg/kg', status: 'NORMAL', target: '均衡充足' }
    }
  },
  {
    plotId: 'plot-b03', name: 'B03 号地块 (草莓精品区)', cropCode: 'strawberry', cropName: '红颊草莓', stageCode: 'fruiting', stageLabel: '挂果采收期',
    riskLevel: 'LOW', healthScore: 0.99,
    metrics: {
      SOIL_MOISTURE: { label: '基质湿度', value: 31.0, unit: '%', status: 'NORMAL', target: '25~45%' },
      AIR_TEMPERATURE: { label: '空气温度', value: 23.8, unit: '°C', status: 'NORMAL', target: '18~28°C' },
      LIGHT: { label: '光照强度', value: 38000, unit: 'lux', status: 'NORMAL', target: '25k~48k lux' },
      CO2: { label: 'CO₂ 浓度', value: 740, unit: 'ppm', status: 'NORMAL', target: '600~900 ppm' },
      SOIL_EC: { label: '基质 EC 值', value: 1.2, unit: 'mS/cm', status: 'NORMAL', target: '0.8~1.6 mS/cm' },
      NPK_RATIO: { label: '氮磷钾肥力', value: '160:85:195', unit: 'mg/kg', status: 'NORMAL', target: '均衡充足' }
    }
  },
  {
    plotId: 'plot-c01', name: 'C01 号设施 (智能连栋温室)', cropCode: 'tomato', cropName: '设施番茄', stageCode: 'fruiting', stageLabel: '挂果采收期',
    riskLevel: 'LOW', healthScore: 0.99,
    metrics: {
      SOIL_MOISTURE: { label: '基质湿度', value: 32.5, unit: '%', status: 'NORMAL', target: '28~45%' },
      AIR_TEMPERATURE: { label: '室内温度', value: 24.5, unit: '°C', status: 'NORMAL', target: '22~28°C' },
      LIGHT: { label: '补光强度', value: 45000, unit: 'lux', status: 'NORMAL', target: '35k~55k lux' },
      CO2: { label: 'CO₂ 浓度', value: 820, unit: 'ppm', status: 'NORMAL', target: '700~1000 ppm' },
      SOIL_EC: { label: '营养液 EC', value: 1.8, unit: 'mS/cm', status: 'NORMAL', target: '1.4~2.2 mS/cm' },
      NPK_RATIO: { label: '水肥浓度', value: '210:110:240', unit: 'mg/L', status: 'NORMAL', target: '按配方精准供给' }
    }
  }
];

const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (min, max, val) => {
  const x = Math.max(0, Math.min(1, (val - min) / (max - min)));
  return x * x * (3 - 2 * x);
};

// Analytical Terrain Elevation (guarantees zero tree/mountain clipping)
function getTerrainElevation(x, z) {
  if (z > -16 && Math.abs(x) < 32) return 0.0; // flat farm basin
  let elevation = 0.0;
  if (z <= -16) {
    const depth = (-z - 16);
    elevation += depth * 0.28 + Math.sin(x * 0.18) * 1.2 + Math.cos(depth * 0.25) * 0.8;
  }
  if (Math.abs(x) >= 30) {
    const side = (Math.abs(x) - 30);
    elevation += side * 0.35 + Math.sin(z * 0.22) * 1.0;
  }
  return Math.max(0, elevation);
}

function createFlexAttribute(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const floor = Math.min(0, box.min.y);
  const span = Math.max(0.001, box.max.y - floor);
  const values = new Float32Array(geometry.attributes.position.count);
  for (let i = 0; i < values.length; i++) {
    values[i] = clamp((geometry.attributes.position.getY(i) - floor) / span, 0, 1);
  }
  geometry.setAttribute('aFlex', new THREE.BufferAttribute(values, 1));
  return geometry;
}

function createSwayMaterial(color, roughness = 0.78) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
  material.userData.windUniforms = null;
  material.onBeforeCompile = shader => {
    shader.uniforms.uFarmTime = { value: 0 };
    shader.uniforms.uWindVector = { value: new THREE.Vector2(0.2, 0.08) };
    shader.uniforms.uBreeze = { value: 0.045 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        attribute float aFlex;
        attribute float aPhase;
        uniform float uFarmTime;
        uniform vec2 uWindVector;
        uniform float uBreeze;
      `)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float farmFlex = aFlex * aFlex;
        vec3 farmInstance = vec3(instanceMatrix[3].xyz);
        float farmWave = sin(uFarmTime * 1.6 + aPhase + farmInstance.x * 0.38 + farmInstance.z * 0.32);
        float farmLeafFlutter = sin(uFarmTime * 4.5 + aPhase * 1.8 + position.y * 5.4);
        float farmWind = length(uWindVector);
        transformed.x += farmFlex * (farmWave * uBreeze + uWindVector.x * 0.12 + farmLeafFlutter * farmWind * 0.022);
        transformed.z += farmFlex * (cos(uFarmTime * 1.2 + aPhase) * uBreeze * 0.6 + uWindVector.y * 0.12);
      `);
    material.userData.windUniforms = shader.uniforms;
  };
  material.customProgramCacheKey = () => 'agriloop-crop-sway-v6';
  return material;
}

function attachInstancePhases(geometry, count, offset = 0) {
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    phases[i] = (i * 2.399 + offset) % (Math.PI * 2);
  }
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  return geometry;
}

function makeLeafGeometry(height, side = 1, level = 0.58, yaw = 0) {
  const geometry = new THREE.SphereGeometry(1, 10, 7);
  geometry.scale(0.20, 0.028, 0.096);
  geometry.rotateY(yaw);
  geometry.rotateZ(side * 0.42);
  geometry.translate(side * 0.16, height * level, 0);
  return createFlexAttribute(geometry);
}

function getDayPhase(hour) {
  if (hour < 5.8 || hour >= 19.3) return { phase: 'night', daylight: 0.04, warm: 0 };
  if (hour < 6.8) {
    const p = smoothstep(5.8, 6.8, hour);
    return { phase: 'sunrise', daylight: 0.04 + p * 0.96, warm: Math.sin(p * Math.PI) * 0.9 };
  }
  if (hour < 17.8) return { phase: 'day', daylight: 1.0, warm: 0 };
  if (hour < 18.9) {
    const p = smoothstep(17.8, 18.9, hour);
    return { phase: 'sunset', daylight: 1.0 - p * 0.96, warm: Math.sin(p * Math.PI) * 0.98 };
  }
  const p = smoothstep(18.9, 19.3, hour);
  return { phase: 'dusk', daylight: 0.12 - p * 0.08, warm: 0.3 * (1 - p) };
}

class CropField {
  constructor(scene, plot, layout, windMaterials) {
    this.scene = scene;
    this.plot = plot;
    this.layout = layout;
    this.windMaterials = windMaterials;
    this.group = new THREE.Group();
    this.group.position.set(layout.x, 0.12, layout.z);
    this.group.rotation.y = layout.rotation;
    scene.add(this.group);
    this.build(plot.cropCode || layout.defaultCrop || 'tomato', plot.stageCode || layout.defaultStage || 'fruiting');
  }

  clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
      const index = this.windMaterials.indexOf(child.material);
      if (index >= 0) this.windMaterials.splice(index, 1);
    }
  }

  build(cropCode, stageCode) {
    this.clear();
    const crop = CROP_PROFILES[cropCode] || CROP_PROFILES.tomato;
    const stage = STAGE_PROFILES[stageCode] || STAGE_PROFILES.fruiting;
    this.cropCode = cropCode;
    this.stageCode = stageCode;
    const plantHeight = crop.height * stage.height;
    const spacing = crop.spacing / Math.sqrt(stage.density);
    const columns = Math.max(5, Math.floor((this.layout.width - 0.7) / spacing));
    const rows = Math.max(4, Math.floor((this.layout.depth - 0.7) / spacing));
    const count = columns * rows;
    const transforms = [];
    const dummy = new THREE.Object3D();

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const seed = row * columns + col;
        transforms.push({
          x: (col / Math.max(1, columns - 1) - 0.5) * (this.layout.width - 0.7) + Math.sin(seed * 9.17) * 0.055,
          z: (row / Math.max(1, rows - 1) - 0.5) * (this.layout.depth - 0.7) + Math.cos(seed * 5.63) * 0.045,
          scale: 0.92 + (Math.sin(seed * 2.37) + 1) * 0.055,
          rotation: Math.sin(seed * 4.11) * 0.58
        });
      }
    }

    const addInstances = (geometry, material, configure) => {
      attachInstancePhases(geometry, count, this.layout.x * 0.17);
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      transforms.forEach((item, index) => {
        dummy.position.set(item.x, 0, item.z);
        dummy.rotation.set(0, item.rotation, 0);
        dummy.scale.setScalar(item.scale);
        configure?.(dummy, item, index);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      this.windMaterials.push(material);
      return mesh;
    };

    // Stems
    const stemRadius = cropCode === 'corn' ? 0.058 : cropCode === 'sunflower' ? 0.052 : cropCode === 'rice' ? 0.024 : 0.036;
    const stemGeometry = new THREE.CylinderGeometry(stemRadius * 0.72, stemRadius, plantHeight, 6, 4);
    stemGeometry.translate(0, plantHeight / 2, 0);
    createFlexAttribute(stemGeometry);
    addInstances(stemGeometry, createSwayMaterial(crop.stem));

    // Leaves
    const leftLeaf = makeLeafGeometry(plantHeight, -1, 0.52, -0.34);
    const rightLeaf = makeLeafGeometry(plantHeight * 1.06, 1, 0.6, 0.28);
    const lowerLeaf = makeLeafGeometry(plantHeight * 0.92, 1, 0.37, -0.62);
    const upperLeaf = makeLeafGeometry(plantHeight * 1.04, -1, 0.76, 0.58);
    const leaves = [leftLeaf, rightLeaf, lowerLeaf, upperLeaf];
    if (cropCode === 'corn') leaves.forEach(leaf => leaf.scale(1.68, 0.85, 0.7));
    else if (cropCode === 'sunflower') leaves.forEach(leaf => leaf.scale(1.45, 1.1, 1.2));
    else if (cropCode === 'rice') leaves.forEach((leaf, index) => leaf.scale(0.42, index % 2 ? 1.2 : 1.38, 0.32));
    else if (cropCode === 'cucumber') leaves.forEach(leaf => leaf.scale(1.25, 1.05, 1.25));
    else if (cropCode === 'strawberry') leaves.forEach(leaf => leaf.scale(1.35, 1.2, 1.35));

    addInstances(leftLeaf, createSwayMaterial(crop.leaf, 0.9));
    addInstances(rightLeaf, createSwayMaterial(crop.leafDark, 0.88));
    addInstances(lowerLeaf, createSwayMaterial(crop.leafDark, 0.9));
    addInstances(upperLeaf, createSwayMaterial(crop.leaf, 0.87));

    // Fruits / Flowers / Cobs
    if (stage.fruit > 0) {
      let fruitGeometry;
      if (cropCode === 'tomato') {
        fruitGeometry = new THREE.SphereGeometry(0.082 + stage.fruit * 0.026, 10, 8);
        fruitGeometry.translate(0.12, plantHeight * 0.66, 0.05);
      } else if (cropCode === 'cucumber') {
        fruitGeometry = new THREE.CylinderGeometry(0.045, 0.055, 0.32, 7);
        fruitGeometry.rotateZ(0.28);
        fruitGeometry.translate(0.14, plantHeight * 0.63, 0.05);
      } else if (cropCode === 'rice') {
        fruitGeometry = new THREE.SphereGeometry(0.055, 6, 4);
        fruitGeometry.scale(0.72, 2.8, 0.72);
        fruitGeometry.translate(0.03, plantHeight * 0.94, 0);
      } else if (cropCode === 'corn') {
        fruitGeometry = new THREE.SphereGeometry(0.092, 7, 5);
        fruitGeometry.scale(0.8, 2.5, 0.8);
        fruitGeometry.translate(0.12, plantHeight * 0.68, 0);
      } else if (cropCode === 'sunflower') {
        fruitGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 14);
        fruitGeometry.rotateX(Math.PI / 3);
        fruitGeometry.translate(0, plantHeight * 0.98, 0.1);
      } else if (cropCode === 'strawberry') {
        fruitGeometry = new THREE.ConeGeometry(0.065, 0.11, 7);
        fruitGeometry.rotateX(Math.PI);
        fruitGeometry.translate(0.08, plantHeight * 0.45, 0.06);
      }
      createFlexAttribute(fruitGeometry);
      addInstances(fruitGeometry, createSwayMaterial(crop.fruit, 0.72), dummyObject => dummyObject.scale.multiplyScalar(0.55 + stage.fruit * 0.45));
    }
  }

  setCrop(cropCode, stageCode = this.stageCode) {
    this.build(cropCode, stageCode);
  }

  destroy() {
    this.clear();
    this.scene.remove(this.group);
  }
}

class FarmWorld3D {
  constructor(host, options = {}) {
    this.host = host;
    this.plots = options.plots || DEFAULT_PLOTS;
    this.onSelect = options.onSelect || (() => {});
    this.onDoubleSelect = options.onDoubleSelect || (() => {});
    this.onSelectSlot = options.onSelectSlot || (() => {});
    this.onFrame = options.onFrame || (() => {});

    this.windMaterials = [];
    this.plotMeshes = new Map();
    this.plotGlows = new Map();
    this.cropFields = new Map();
    this.reclamationSlotMeshes = new Map();
    this.isReclamationMode = false;
    this.clouds = [];
    this.waterMaterials = [];
    this.soilMaterials = [];
    this.ridgeMaterials = [];
    this.crownMaterials = [];
    this.nightLights = [];

    this.pointer = new THREE.Vector2(10, 10);
    this.currentWind = new THREE.Vector2(0.15, 0.05);
    this.targetWind = new THREE.Vector2(0, 0);
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Timer ? new THREE.Timer() : new THREE.Clock();
    this.weather = 'sunny';
    this.hoveredPlotId = null;
    this.hoveredSlotId = null;
    this.lastPointer = null;
    this.frameCount = 0;
    this.isDestroyed = false;
    this.clickTimer = null;

    // Camera roaming & Pan controls
    this.cameraTarget = new THREE.Vector3(0, 0, -2);
    this.cameraAnimation = null;
    this.isPanning = false;
    this.isOrbiting = false;
    this.panStart = new THREE.Vector2();
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.setSize(this.host.clientWidth, this.host.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = 'farm-webgl-canvas';
    this.host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Ultra-clear atmospheric azure tint (Low density, zero chalky white wash on mountains)
    this.scene.fog = new THREE.FogExp2(0x82b2d4, 0.0014);

    // Elevated Panoramic Wide View Camera (High angle, fully reveals high sky, sun, and vast farmland)
    this.camera = new THREE.PerspectiveCamera(50, this.host.clientWidth / Math.max(1, this.host.clientHeight), 0.1, 350);
    this.camera.position.set(0, 32, 46);
    this.camera.lookAt(this.cameraTarget);
    this.baseCamera = this.camera.position.clone();

    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildWater();
    this.buildRoads();
    this.buildStreetLamps();
    this.buildBuildings();
    this.buildPlots();
    this.buildReclamationSlots();
    this.buildTrees();
    this.buildClouds();
    this.buildRain();
    this.buildStars();
    this.loadSurfaceTextures();
    this.bindEvents();
    this.resize();
    this.animate();
  }

  buildSky() {
    this.skyUniforms = {
      uTop: { value: new THREE.Color(0x2b8ece) },
      uHorizon: { value: new THREE.Color(0xd6eed0) },
      uSunDirection: { value: new THREE.Vector3(0, 0.6, -0.8).normalize() },
      uSunColor: { value: new THREE.Color(0xfff2be) },
      uSunStrength: { value: 1.2 }
    };
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform float uSunStrength;
        void main() {
          vec3 direction = normalize(vWorld - cameraPosition);
          float heightMix = smoothstep(-0.02, 0.68, direction.y);
          vec3 sky = mix(uHorizon, uTop, heightMix);
          float halo = pow(max(dot(direction, normalize(uSunDirection)), 0.0), 28.0) * 0.45;
          float core = pow(max(dot(direction, normalize(uSunDirection)), 0.0), 500.0) * 1.6;
          sky += uSunColor * (halo + core) * uSunStrength;
          gl_FragColor = vec4(sky, 1.0);
        }
      `
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 22), material);
    this.scene.add(this.sky);
  }

  buildLights() {
    this.hemiLight = new THREE.HemisphereLight(0xeaf5ff, 0x486c38, 2.4);
    this.scene.add(this.hemiLight);

    // Directional Sun Light synchronized with celestial sun
    this.sunLight = new THREE.DirectionalLight(0xfff2cd, 4.5);
    this.sunLight.position.set(0, 42, -50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -45;
    this.sunLight.shadow.camera.right = 45;
    this.sunLight.shadow.camera.top = 40;
    this.sunLight.shadow.camera.bottom = -30;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 180;
    this.sunLight.shadow.bias = -0.00025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Celestial High-Sky Sun Visual Disc (Shines clearly in high sky dome)
    this.sunDisc = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 32, 22),
      new THREE.MeshBasicMaterial({ color: 0xfffae0, toneMapped: false })
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(6.8, 28, 18),
      new THREE.MeshBasicMaterial({ color: 0xffe078, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, toneMapped: false })
    );
    const glowWide = new THREE.Mesh(
      new THREE.SphereGeometry(13.0, 24, 14),
      new THREE.MeshBasicMaterial({ color: 0xffeca0, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, toneMapped: false })
    );
    this.sunDisc.add(core, glow, glowWide);
    this.sunDisc.position.set(0, 38, -65);
    this.scene.add(this.sunDisc);
  }

  buildTerrain() {
    // Vast Seamless Grass Basin (280m x 200m)
    const geometry = new THREE.PlaneGeometry(280, 200, 48, 36);
    const material = new THREE.MeshStandardMaterial({ color: 0x92b270, roughness: 0.94, metalness: 0 });
    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.rotation.x = -Math.PI / 2;
    this.terrain.position.y = 0.0;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    // Aesthetic Layered Mountain Ranges (Aesthetic Gaussian Peaks + Sculpted Organic Ridges)
    const buildRidge = ({ width, depth, segmentsX, segmentsZ, z, heightScale, color, opacity = 1 }) => {
      const ridgeGeometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
      const ridgePosition = ridgeGeometry.attributes.position;
      for (let index = 0; index < ridgePosition.count; index++) {
        const x = ridgePosition.getX(index);
        const y = ridgePosition.getY(index);
        const normY = (y + depth / 2) / depth;
        const peaks =
          Math.exp(-((x + 72) ** 2) / 320) * 11.0 +
          Math.exp(-((x + 36) ** 2) / 260) * 14.5 +
          Math.exp(-((x + 8) ** 2) / 210) * 17.0 +
          Math.exp(-((x - 22) ** 2) / 280) * 13.5 +
          Math.exp(-((x - 58) ** 2) / 240) * 16.0 +
          Math.exp(-((x - 92) ** 2) / 340) * 12.0;
        const depthShape = Math.sin(normY * Math.PI * 0.85);
        const detail = Math.sin(x * 0.28 + normY * 3.2) * 0.65 + Math.cos(x * 0.14 - normY * 2.1) * 0.45;
        ridgePosition.setZ(index, Math.max(0, (peaks * depthShape + detail) * heightScale));
      }
      ridgeGeometry.computeVertexNormals();
      const ridgeMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.88, transparent: opacity < 1, opacity, depthWrite: true });
      this.ridgeMaterials.push(ridgeMaterial);
      const ridge = new THREE.Mesh(ridgeGeometry, ridgeMaterial);
      ridge.rotation.x = -Math.PI / 2;
      ridge.position.set(0, 0.0, z);
      ridge.receiveShadow = true;
      this.scene.add(ridge);
    };

    // Staggered Beautiful Mountain Silhouettes (Layered depth without overlapping planes)
    buildRidge({ width: 240, depth: 32, segmentsX: 110, segmentsZ: 32, z: -58, heightScale: 0.48, color: 0x5b8a68 });
    buildRidge({ width: 270, depth: 40, segmentsX: 120, segmentsZ: 36, z: -88, heightScale: 0.82, color: 0x769b93, opacity: 0.95 });
    buildRidge({ width: 300, depth: 48, segmentsX: 130, segmentsZ: 40, z: -124, heightScale: 1.25, color: 0x8eaeb6, opacity: 0.90 });
  }

  buildStreetLamps() {
    this.streetLights = [];
    this.streetLampBulbs = [];

    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x2e3b33, roughness: 0.45, metalness: 0.5 });
    const solarMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2e40, roughness: 0.25, metalness: 0.7 });

    const lampPositions = [
      // Front Main Road
      { x: -22.0, z: 15.5 }, { x: -7.5, z: 15.5 }, { x: 7.5, z: 15.5 }, { x: 22.0, z: 15.5 },
      // Mid Canal Road
      { x: -22.0, z: 3.5 }, { x: -7.5, z: 3.5 }, { x: 7.5, z: 3.5 }, { x: 22.0, z: 3.5 },
      // North Auxiliary Avenue
      { x: -11.0, z: -8.0 }, { x: 11.0, z: -8.0 }
    ];

    lampPositions.forEach((pos) => {
      const lamp = new THREE.Group();

      // Slender Dark Steel Mast (4.2m)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 4.2, 8), poleMaterial);
      pole.position.y = 2.1;
      pole.castShadow = true;
      lamp.add(pole);

      // Angled Cantilever Arm
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), poleMaterial);
      const armDir = pos.x < 0 ? 0.38 : -0.38;
      arm.position.set(armDir, 4.05, 0);
      arm.rotation.z = pos.x < 0 ? -Math.PI / 3.8 : Math.PI / 3.8;
      lamp.add(arm);

      // Top Solar Panel
      const solar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.5), solarMaterial);
      solar.position.set(armDir * 0.5, 4.25, 0);
      solar.rotation.x = -0.25;
      lamp.add(solar);

      // High-Glow LED Luminaire Head (Glows naturally at night)
      const lampHead = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 0.14, 12),
        new THREE.MeshBasicMaterial({ color: 0x728076, toneMapped: false })
      );
      const bulbPos = armDir * 1.8;
      lampHead.position.set(bulbPos, 3.82, 0);
      lamp.add(lampHead);
      this.streetLampBulbs.push(lampHead);

      // Realistic Soft Spotlight (Feathered natural illumination, NO artificial flat circles!)
      const spot = new THREE.SpotLight(0xffdf88, 0, 18, Math.PI / 3.0, 0.88, 1.3);
      spot.position.set(bulbPos, 3.8, 0);
      spot.target.position.set(bulbPos, 0, 0);
      lamp.add(spot);
      lamp.add(spot.target);
      this.streetLights.push(spot);

      lamp.position.set(pos.x, 0, pos.z);
      this.scene.add(lamp);
    });
  }

  createWaterMaterial() {
    const uniforms = {
      uTime: { value: 0 },
      uColorDeep: { value: new THREE.Color(0x1a6585) },
      uColorLight: { value: new THREE.Color(0x5cbdb7) },
      uSun: { value: new THREE.Color(0xfff0bc) },
      uBrightness: { value: 1 }
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits: -4.0,
      vertexShader: `
        varying vec2 vUv;
        varying float vWave;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 moved = position;
          float waveA = sin(position.x * 2.2 + uTime * 1.4) * 0.012;
          float waveB = cos(position.y * 3.0 - uTime * 1.1) * 0.008;
          moved.z += waveA + waveB;
          vWave = waveA + waveB;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying float vWave;
        uniform float uTime;
        uniform vec3 uColorDeep;
        uniform vec3 uColorLight;
        uniform vec3 uSun;
        uniform float uBrightness;
        void main() {
          float ripple = sin((vUv.x + vUv.y) * 36.0 + uTime * 2.0) * 0.04;
          float glint = pow(max(0.0, sin(vUv.x * 26.0 - uTime * 1.2) * cos(vUv.y * 20.0 + uTime * 0.8)), 8.0);
          vec3 color = mix(uColorDeep, uColorLight, 0.45 + vWave * 4.2 + ripple);
          color += uSun * glint * 0.35;
          gl_FragColor = vec4(color * uBrightness, 0.94);
        }
      `
    });
    material.userData.waterUniforms = uniforms;
    this.waterMaterials.push(material);
    return material;
  }

  buildWater() {
    // 1. Retention Pond: Raised cleanly with solid base basin
    const pondGroup = new THREE.Group();
    
    // Stone foundation bed under the pond
    const basinBase = new THREE.Mesh(
      new THREE.CylinderGeometry(5.35, 5.35, 0.16, 48),
      new THREE.MeshStandardMaterial({ color: 0x6e7872, roughness: 0.9 })
    );
    basinBase.position.y = 0.02;
    pondGroup.add(basinBase);

    // Water surface disc (y = 0.08)
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.2, 48), this.createWaterMaterial());
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.08;
    water.receiveShadow = true;
    pondGroup.add(water);

    // River Stone Rim Curb encasing the pond (y = 0.12)
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(5.25, 0.22, 16, 48),
      new THREE.MeshStandardMaterial({ color: 0x7a8680, roughness: 0.88 })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.12;
    rim.castShadow = true;
    rim.receiveShadow = true;
    pondGroup.add(rim);

    pondGroup.position.set(0, 0, -2.5);
    this.scene.add(pondGroup);

    // 2. Irrigation Canal Network: Elevated at y = 0.08 with solid raised curbs
    const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x7c8a82, roughness: 0.9 });
    const addCanal = ({ width, depth, x, z, vertical = false }) => {
      // Ditch bed
      const bed = new THREE.Mesh(
        new THREE.BoxGeometry(vertical ? width + 0.1 : width, 0.08, vertical ? depth : depth + 0.1),
        bankMaterial
      );
      bed.position.set(x, 0.03, z);
      this.scene.add(bed);

      // Water surface
      const canal = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth, Math.max(4, Math.round(width * 2)), Math.max(3, Math.round(depth * 2))),
        this.createWaterMaterial()
      );
      canal.rotation.x = -Math.PI / 2;
      canal.position.set(x, 0.075, z);
      canal.receiveShadow = true;
      this.scene.add(canal);

      // Raised retaining banks
      const sideOffset = (vertical ? width : depth) / 2 + 0.12;
      [-sideOffset, sideOffset].forEach(offset => {
        const bank = new THREE.Mesh(
          new THREE.BoxGeometry(vertical ? 0.24 : width + 0.32, 0.18, vertical ? depth + 0.32 : 0.24),
          bankMaterial
        );
        bank.position.set(x + (vertical ? offset : 0), 0.09, z + (vertical ? 0 : offset));
        bank.castShadow = true;
        bank.receiveShadow = true;
        this.scene.add(bank);
      });
    };

    addCanal({ width: 56.0, depth: 0.9, x: 0, z: 3.5 });
    addCanal({ width: 56.0, depth: 0.9, x: 0, z: 14.2 });
    addCanal({ width: 0.9, depth: 22.0, x: -14.8, z: 4.0, vertical: true });
    addCanal({ width: 0.9, depth: 22.0, x: 13.2, z: 4.0, vertical: true });
    addCanal({ width: 0.9, depth: 22.0, x: 0, z: 4.0, vertical: true });
  }

  buildRoads() {
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0xc8ba8d, roughness: 0.95 });
    const mainRoad = new THREE.Mesh(new THREE.BoxGeometry(64, 0.08, 1.4), roadMaterial);
    mainRoad.position.set(0, 0.03, 15.5);
    mainRoad.receiveShadow = true;
    this.scene.add(mainRoad);

    [-26.5, 26.5].forEach(x => {
      const path = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 26.0), roadMaterial);
      path.position.set(x, 0.03, 3.5);
      path.receiveShadow = true;
      this.scene.add(path);
    });
  }

  buildBuildings() {
    const whiteWall = new THREE.MeshStandardMaterial({ color: 0xf6f7f2, roughness: 0.8 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2b3831, roughness: 0.4, metalness: 0.45 });
    const timber = new THREE.MeshStandardMaterial({ color: 0xb58e65, roughness: 0.7 });
    const bluePanel = new THREE.MeshStandardMaterial({ color: 0x3d6b8c, roughness: 0.5 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xc9edf2,
      transmission: 0.65,
      transparent: true,
      opacity: 0.58,
      roughness: 0.14,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    // 1. Classical / Modern Garden Gazebo IN THE EXACT CENTER OF THE WATER POND (水池正中央)
    const pavilionGroup = new THREE.Group();
    // Central Island Stone Plinth Base (y = 0.12, solidly emerging from water)
    const pavPlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.80, 1.90, 0.24, 8),
      new THREE.MeshStandardMaterial({ color: 0x76827c, roughness: 0.88 })
    );
    pavPlinth.position.y = 0.12;
    pavilionGroup.add(pavPlinth);

    // Pavilion Timber Floor (y = 0.25)
    const pavFloor = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 0.06, 8), timber);
    pavFloor.position.y = 0.25;
    pavFloor.receiveShadow = true;
    pavilionGroup.add(pavFloor);

    // 4 Corner Timber Columns
    [[-0.82, -0.82], [0.82, -0.82], [-0.82, 0.82], [0.82, 0.82]].forEach(([cx, cz]) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), darkSteel);
      col.position.set(cx, 1.35, cz);
      col.castShadow = true;
      pavilionGroup.add(col);
    });

    // Sloped Hip Roof
    const pavRoof = new THREE.Mesh(
      new THREE.ConeGeometry(2.5, 1.1, 4),
      new THREE.MeshStandardMaterial({ color: 0x38453d, roughness: 0.7 })
    );
    pavRoof.rotation.y = Math.PI / 4;
    pavRoof.position.y = 2.95;
    pavRoof.castShadow = true;
    pavilionGroup.add(pavRoof);

    // Ambient Lantern in Pavilion
    const pavLight = new THREE.PointLight(0xffdd77, 0, 12, 1.8);
    pavLight.position.set(0, 2.1, 0);
    pavilionGroup.add(pavLight);
    this.nightLights.push(pavLight);

    // --- SOUTH CORRIDOR BRIDGE (直通南侧开阔草坪) ---
    // Span: connects Central Island Plinth (z = -0.65m) across water (z = 2.7m) deep into South Lawn (z = 5.2m)
    // Span length: 5.85m, Center: z = 2.275m, Deck height y = 0.24m
    const southBridge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 5.85), timber);
    southBridge.position.set(0, 0.24, 2.275);
    southBridge.receiveShadow = true;
    southBridge.castShadow = true;
    pavilionGroup.add(southBridge);

    // Water Support Piers (桥墩) under south bridge
    [0.3, 1.8, 3.4].forEach(pz => {
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(1.26, 0.28, 0.26),
        new THREE.MeshStandardMaterial({ color: 0x68746e, roughness: 0.9 })
      );
      pier.position.set(0, 0.10, pz);
      pier.castShadow = true;
      pavilionGroup.add(pier);
    });

    // South Bridge Railings / Balustrades
    [-0.56, 0.56].forEach(rx => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 5.85), darkSteel);
      rail.position.set(rx, 0.45, 2.275);
      rail.castShadow = true;
      pavilionGroup.add(rail);

      [-1.8, -0.6, 0.6, 1.8].forEach(bz => {
        const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), darkSteel);
        baluster.position.set(rx, 0.45, 2.275 + bz);
        pavilionGroup.add(baluster);
      });
    });

    // South Meadow Landing Apron & Stone Steps (直接与南侧草地无缝相接)
    const southLawnStep = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.16, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x76827c, roughness: 0.88 })
    );
    southLawnStep.position.set(0, 0.08, 5.35);
    southLawnStep.receiveShadow = true;
    pavilionGroup.add(southLawnStep);

    // --- NORTH CORRIDOR PROMENADE (直通北侧设施草坪) ---
    // Span: connects Central Island Plinth (z = -4.35m) across north water (z = -7.7m) to North Lawn (z = -9.2m)
    // Span length: 4.85m, Center: z = -6.775m, Deck height y = 0.24m
    const northBridge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 4.85), timber);
    northBridge.position.set(0, 0.24, -6.775);
    northBridge.receiveShadow = true;
    northBridge.castShadow = true;
    pavilionGroup.add(northBridge);

    // Water Support Piers under north bridge
    [-5.6, -7.2].forEach(pz => {
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(1.26, 0.28, 0.26),
        new THREE.MeshStandardMaterial({ color: 0x68746e, roughness: 0.9 })
      );
      pier.position.set(0, 0.10, pz);
      pier.castShadow = true;
      pavilionGroup.add(pier);
    });

    // North Bridge Railings
    [-0.56, 0.56].forEach(rx => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 4.85), darkSteel);
      rail.position.set(rx, 0.45, -6.775);
      rail.castShadow = true;
      pavilionGroup.add(rail);

      [-1.4, 0.0, 1.4].forEach(bz => {
        const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), darkSteel);
        baluster.position.set(rx, 0.45, -6.775 + bz);
        pavilionGroup.add(baluster);
      });
    });

    // North Meadow Landing Apron & Stone Steps (直接与北侧草地无缝相接)
    const northLawnStep = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.16, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x76827c, roughness: 0.88 })
    );
    northLawnStep.position.set(0, 0.08, -9.35);
    northLawnStep.receiveShadow = true;
    pavilionGroup.add(northLawnStep);

    pavilionGroup.position.set(0, 0, -2.5);
    this.scene.add(pavilionGroup);

    // 2. Modern Multi-Span High-Tech Glass Greenhouse (North Open Lawn, x: -14, z: -14.5)
    const greenhouse = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.45, 8.2), darkSteel);
    base.position.y = 0.225;
    greenhouse.add(base);

    const glassBody = new THREE.Mesh(new THREE.BoxGeometry(12.2, 2.4, 7.8), glass);
    glassBody.position.y = 1.65;
    greenhouse.add(glassBody);

    for (let offset = -5.8; offset <= 5.8; offset += 1.45) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.0, 8.0), darkSteel);
      rib.position.set(offset, 1.7, 0);
      greenhouse.add(rib);
    }

    const growLight = new THREE.PointLight(0xffdd80, 0, 16, 1.8);
    growLight.position.set(0, 2.2, 0);
    greenhouse.add(growLight);
    this.nightLights.push(growLight);

    greenhouse.position.set(-14.0, 0, -14.5);
    this.scene.add(greenhouse);

    // 3. Smart Farm Command & Dispatch Center (North Open Lawn, x: 14, z: -14.5)
    const center = new THREE.Group();
    const bldg = new THREE.Mesh(new THREE.BoxGeometry(9.2, 3.4, 6.8), whiteWall);
    bldg.position.y = 1.7;
    bldg.castShadow = true;
    bldg.receiveShadow = true;
    center.add(bldg);

    const glassFacade = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.6, 0.2), glass);
    glassFacade.position.set(0, 2.2, 3.45);
    center.add(glassFacade);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.2, 7.6), timber);
    roof.position.y = 3.5;
    center.add(roof);

    const solarGrid = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 0.08, 6.0),
      new THREE.MeshStandardMaterial({ color: 0x1f3448, roughness: 0.25, metalness: 0.8 })
    );
    solarGrid.position.set(0, 3.65, 0);
    center.add(solarGrid);

    const centerLight = new THREE.PointLight(0xfff0b8, 0, 14, 1.8);
    centerLight.position.set(0, 2.0, 1.5);
    center.add(centerLight);
    this.nightLights.push(centerLight);

    center.position.set(14.0, 0, -14.5);
    this.scene.add(center);

    // 4. Stainless Fertigation & Water Tanks (North Open Lawn, x: -28.0, z: -14.5)
    const siloGroup = new THREE.Group();
    const siloMat = new THREE.MeshStandardMaterial({ color: 0xd8e2dc, roughness: 0.35, metalness: 0.65 });
    [-1.3, 1.3].forEach(offset => {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 3.6, 18), siloMat);
      silo.position.set(offset, 1.8, 0);
      silo.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.0, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), siloMat);
      cap.position.set(offset, 3.6, 0);
      siloGroup.add(silo, cap);
    });
    siloGroup.position.set(-28.0, 0, -14.5);
    this.scene.add(siloGroup);

    // 5. WEST OUTER MEADOW FACILITIES (西侧空旷大草坪, x: -48.0, 彻底远离树木与田地)
    const westComplex = new THREE.Group();
    const shed = new THREE.Mesh(new THREE.BoxGeometry(8.2, 3.2, 6.0), whiteWall);
    shed.position.set(0, 1.6, 0);
    shed.castShadow = true;
    westComplex.add(shed);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 4.0), bluePanel);
    door.position.set(4.15, 1.1, 0);
    westComplex.add(door);

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.1, 4.4),
      new THREE.MeshStandardMaterial({ color: 0x222e38, roughness: 0.5 })
    );
    pad.position.set(0, 3.25, 0);
    westComplex.add(pad);

    const padLight = new THREE.PointLight(0x52e0a2, 0, 10, 2.0);
    padLight.position.set(0, 3.6, 0);
    westComplex.add(padLight);
    this.nightLights.push(padLight);

    westComplex.position.set(-48.0, 0, 3.5);
    this.scene.add(westComplex);

    // Automated Agro-Meteorology Station Mast (West Outer Lawn, x: -48.0, z: 11.5)
    const tower = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 5.8, 8), darkSteel);
    mast.position.y = 2.9;
    mast.castShadow = true;
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x50e396, toneMapped: false })
    );
    led.position.y = 5.85;
    tower.add(mast, led);
    tower.position.set(-48.0, 0, 11.5);
    this.scene.add(tower);

    // 6. EAST OUTER MEADOW FACILITIES (东侧空旷大草坪, x: +48.0, 彻底远离树木与田地)
    const eastComplex = new THREE.Group();
    const depot = new THREE.Mesh(new THREE.BoxGeometry(8.2, 3.2, 6.2), whiteWall);
    depot.position.set(0, 1.6, 0);
    depot.castShadow = true;
    eastComplex.add(depot);

    const depotGlass = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.8, 4.2), glass);
    depotGlass.position.set(-4.15, 1.6, 0);
    eastComplex.add(depotGlass);

    const depotRoof = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.18, 6.8), darkSteel);
    depotRoof.position.y = 3.3;
    eastComplex.add(depotRoof);

    const depotLight = new THREE.PointLight(0xfff0b8, 0, 12, 1.8);
    depotLight.position.set(-2.0, 2.0, 0);
    eastComplex.add(depotLight);
    this.nightLights.push(depotLight);

    eastComplex.position.set(48.0, 0, 3.5);
    this.scene.add(eastComplex);

    // Nursery Greenhouse Annex (East Outer Lawn, x: 48.0, z: 11.5)
    const nursery = new THREE.Group();
    const nurseryGlass = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.4, 4.8), glass);
    nurseryGlass.position.y = 1.2;
    nursery.add(nurseryGlass);
    const nurseryBase = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.3, 5.0), darkSteel);
    nurseryBase.position.y = 0.15;
    nursery.add(nurseryBase);
    const nurseryLight = new THREE.PointLight(0xffd577, 0, 10, 1.8);
    nurseryLight.position.set(0, 1.6, 0);
    nursery.add(nurseryLight);
    this.nightLights.push(nurseryLight);
    nursery.position.set(48.0, 0, 11.5);
    this.scene.add(nursery);

    // 7. South Park Entrance Welcome Archway (南侧主入口门廊)
    const arch = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.35, 0.8), timber);
    beam.position.y = 4.2;
    arch.add(beam);
    [-4.6, 4.6].forEach(px => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 0.8), darkSteel);
      p.position.set(px, 2.2, 0);
      arch.add(p);
    });
    arch.position.set(0, 0, 18.5);
    this.scene.add(arch);
  }

  buildPlots() {
    const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x6a482c, roughness: 0.98 });
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xb59662, roughness: 0.88 });
    const furrowMaterial = new THREE.MeshStandardMaterial({ color: 0x4c3523, roughness: 1.0 });

    this.plots.forEach((plot, index) => {
      const layout = PLOT_LAYOUT[plot.plotId] || Object.values(PLOT_LAYOUT)[index % Object.values(PLOT_LAYOUT).length];
      if (layout.isGreenhouse) return; // Greenhouse handled separately

      const soil = new THREE.Mesh(new THREE.BoxGeometry(layout.width, 0.22, layout.depth), soilMaterial.clone());
      soil.position.set(layout.x, -0.02, layout.z);
      soil.rotation.y = layout.rotation;
      soil.receiveShadow = true;
      soil.userData.plotId = plot.plotId;
      soil.userData.baseColor = soil.material.color.clone();
      this.soilMaterials.push(soil.material);
      this.scene.add(soil);
      this.plotMeshes.set(plot.plotId, soil);

      const edgeGroup = new THREE.Group();
      edgeGroup.position.set(layout.x, 0.05, layout.z);
      edgeGroup.rotation.y = layout.rotation;
      [
        [layout.width + 0.16, 0.12, 0.14, 0, -layout.depth / 2],
        [layout.width + 0.16, 0.12, 0.14, 0, layout.depth / 2],
        [0.14, 0.12, layout.depth, -layout.width / 2, 0],
        [0.14, 0.12, layout.depth, layout.width / 2, 0]
      ].forEach(([w, h, d, x, z]) => {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeMaterial);
        edge.position.set(x, 0, z);
        edge.castShadow = true;
        edgeGroup.add(edge);
      });

      const rowCount = 8;
      for (let row = 0; row < rowCount; row++) {
        const furrow = new THREE.Mesh(new THREE.BoxGeometry(layout.width - 0.35, 0.045, 0.14), furrowMaterial);
        furrow.position.set(0, 0.08, (row / (rowCount - 1) - 0.5) * (layout.depth - 0.6));
        furrow.receiveShadow = true;
        edgeGroup.add(furrow);
      }
      this.scene.add(edgeGroup);

      // Neon Highlight Border
      const glowMaterial = new THREE.MeshStandardMaterial({
        color: 0xfff1c4,
        emissive: 0xffc75c,
        emissiveIntensity: 3.3,
        roughness: 0.35,
        toneMapped: false
      });
      const glowGroup = new THREE.Group();
      glowGroup.position.set(layout.x, 0.135, layout.z);
      glowGroup.rotation.y = layout.rotation;
      [
        [layout.width + 0.1, 0.035, 0.045, 0, -layout.depth / 2],
        [layout.width + 0.1, 0.035, 0.045, 0, layout.depth / 2],
        [0.045, 0.035, layout.depth, -layout.width / 2, 0],
        [0.045, 0.035, layout.depth, layout.width / 2, 0]
      ].forEach(([w, h, d, x, z]) => {
        const glow = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glowMaterial);
        glow.position.set(x, 0, z);
        glowGroup.add(glow);
      });
      glowGroup.visible = plot.plotId === 'plot-a01';
      this.plotGlows.set(plot.plotId, glowGroup);
      this.scene.add(glowGroup);

      // Per Plot Crop Field
      const field = new CropField(this.scene, plot, layout, this.windMaterials);
      this.cropFields.set(plot.plotId, field);
    });
  }

  buildReclamationSlots() {
    this.reclamationSlotMeshes = new Map();
    const borderMat = new THREE.MeshBasicMaterial({ color: 0xffd359, transparent: true, opacity: 0.9 });
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 0.18, side: THREE.DoubleSide });

    RECLAMATION_SLOTS.forEach(slot => {
      if (this.plots.some(p => p.plotId === slot.slotId)) return;

      const group = new THREE.Group();
      group.position.set(slot.x, 0.05, slot.z);
      group.rotation.y = slot.rotation || 0;
      group.userData.slotId = slot.slotId;
      group.userData.slotConfig = slot;

      // Holographic surface plane
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(slot.width, slot.depth), fillMat);
      plane.rotation.x = -Math.PI / 2;
      plane.receiveShadow = false;
      group.add(plane);

      // Holographic boundary lines
      [
        [slot.width, 0.04, 0.08, 0, -slot.depth / 2],
        [slot.width, 0.04, 0.08, 0, slot.depth / 2],
        [0.08, 0.04, slot.depth, -slot.width / 2, 0],
        [0.08, 0.04, slot.depth, slot.width / 2, 0]
      ].forEach(([w, h, d, x, z]) => {
        const line = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), borderMat);
        line.position.set(x, 0.02, z);
        group.add(line);
      });

      // 4 Corner Survey Beacons
      [
        [-slot.width / 2, -slot.depth / 2],
        [slot.width / 2, -slot.depth / 2],
        [-slot.width / 2, slot.depth / 2],
        [slot.width / 2, slot.depth / 2]
      ].forEach(([cx, cz]) => {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 0.75, 8),
          new THREE.MeshStandardMaterial({ color: 0xffd359, emissive: 0xffb700, emissiveIntensity: 0.6 })
        );
        pillar.position.set(cx, 0.38, cz);
        group.add(pillar);

        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xfff077 })
        );
        beacon.position.set(cx, 0.78, cz);
        group.add(beacon);
      });

      group.visible = false;
      this.reclamationSlotMeshes.set(slot.slotId, group);
      this.scene.add(group);
    });
  }

  setReclamationMode(active) {
    this.isReclamationMode = active;
    this.reclamationSlotMeshes.forEach((group, slotId) => {
      const isAlreadyReclaimed = this.plots.some(p => p.plotId === slotId);
      group.visible = active && !isAlreadyReclaimed;
    });
  }

  reclaimPlot(slotId, userConfig = {}) {
    const slot = RECLAMATION_SLOTS.find(s => s.slotId === slotId);
    if (!slot) return null;

    // 1. Remove preview group
    const preview = this.reclamationSlotMeshes.get(slotId);
    if (preview) {
      this.scene.remove(preview);
      this.reclamationSlotMeshes.delete(slotId);
    }

    const cropCode = userConfig.cropCode || slot.defaultCrop || 'tomato';
    const stageCode = userConfig.stageCode || slot.defaultStage || 'seedling';
    const plotName = userConfig.plotName || slot.name;

    // 2. Build 3D Field Meshes
    const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x6a482c, roughness: 0.98 });
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xb59662, roughness: 0.88 });
    const furrowMaterial = new THREE.MeshStandardMaterial({ color: 0x4c3523, roughness: 1.0 });

    const soil = new THREE.Mesh(new THREE.BoxGeometry(slot.width, 0.22, slot.depth), soilMaterial.clone());
    soil.position.set(slot.x, -0.02, slot.z);
    soil.rotation.y = slot.rotation || 0;
    soil.receiveShadow = true;
    soil.userData.plotId = slotId;
    soil.userData.baseColor = soil.material.color.clone();
    this.soilMaterials.push(soil.material);
    this.scene.add(soil);
    this.plotMeshes.set(slotId, soil);

    // Soil Texture Mapping
    const loader = new THREE.TextureLoader();
    loader.load('assets/textures/tilled-soil.png', texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(4.5, 3.5);
      soil.material.map = texture;
      soil.material.color.set(0x987456);
      soil.material.needsUpdate = true;
    }, undefined, () => {});

    // Edges
    const edgeGroup = new THREE.Group();
    edgeGroup.position.set(slot.x, 0.05, slot.z);
    edgeGroup.rotation.y = slot.rotation || 0;
    [
      [slot.width + 0.16, 0.12, 0.14, 0, -slot.depth / 2],
      [slot.width + 0.16, 0.12, 0.14, 0, slot.depth / 2],
      [0.14, 0.12, slot.depth, -slot.width / 2, 0],
      [0.14, 0.12, slot.depth, slot.width / 2, 0]
    ].forEach(([w, h, d, x, z]) => {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeMaterial);
      edge.position.set(x, 0, z);
      edge.castShadow = true;
      edgeGroup.add(edge);
    });

    const rowCount = 8;
    for (let row = 0; row < rowCount; row++) {
      const furrow = new THREE.Mesh(new THREE.BoxGeometry(slot.width - 0.35, 0.045, 0.14), furrowMaterial);
      furrow.position.set(0, 0.08, (row / (rowCount - 1) - 0.5) * (slot.depth - 0.6));
      furrow.receiveShadow = true;
      edgeGroup.add(furrow);
    }
    this.scene.add(edgeGroup);

    // Neon Highlight Border
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff1c4,
      emissive: 0xffc75c,
      emissiveIntensity: 3.3,
      roughness: 0.35,
      toneMapped: false
    });
    const glowGroup = new THREE.Group();
    glowGroup.position.set(slot.x, 0.135, slot.z);
    glowGroup.rotation.y = slot.rotation || 0;
    [
      [slot.width + 0.1, 0.035, 0.045, 0, -slot.depth / 2],
      [slot.width + 0.1, 0.035, 0.045, 0, slot.depth / 2],
      [0.045, 0.035, slot.depth, -slot.width / 2, 0],
      [0.045, 0.035, slot.depth, slot.width / 2, 0]
    ].forEach(([w, h, d, x, z]) => {
      const glow = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glowMaterial);
      glow.position.set(x, 0, z);
      glowGroup.add(glow);
    });
    glowGroup.visible = false;
    this.plotGlows.set(slotId, glowGroup);
    this.scene.add(glowGroup);

    // 3. EXTEND IRRIGATION CANAL (自然延伸水渠至新农田)
    if (slot.canalStart && slot.canalEnd) {
      const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x7c8a82, roughness: 0.9 });
      const dx = slot.canalEnd.x - slot.canalStart.x;
      const dz = slot.canalEnd.z - slot.canalStart.z;
      const isX = Math.abs(dx) > Math.abs(dz);
      const canalLen = Math.max(0.5, isX ? Math.abs(dx) : Math.abs(dz));
      const midX = (slot.canalStart.x + slot.canalEnd.x) / 2;
      const midZ = (slot.canalStart.z + slot.canalEnd.z) / 2;
      const canalWidth = isX ? canalLen : 0.85;
      const canalDepth = isX ? 0.85 : canalLen;

      // Bed
      const bed = new THREE.Mesh(new THREE.BoxGeometry(canalWidth, 0.08, canalDepth), bankMaterial);
      bed.position.set(midX, 0.03, midZ);
      this.scene.add(bed);

      // Flowing Water surface
      const water = new THREE.Mesh(new THREE.PlaneGeometry(canalWidth, canalDepth), this.createWaterMaterial());
      water.rotation.x = -Math.PI / 2;
      water.position.set(midX, 0.075, midZ);
      this.scene.add(water);

      // Stone Retaining Banks
      if (isX) {
        [-0.54, 0.54].forEach(offZ => {
          const bank = new THREE.Mesh(new THREE.BoxGeometry(canalLen, 0.16, 0.22), bankMaterial);
          bank.position.set(midX, 0.09, midZ + offZ);
          bank.castShadow = true;
          this.scene.add(bank);
        });
      } else {
        [-0.54, 0.54].forEach(offX => {
          const bank = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, canalLen), bankMaterial);
          bank.position.set(midX + offX, 0.09, midZ);
          bank.castShadow = true;
          this.scene.add(bank);
        });
      }

      // Sluice Gate Valve at inlet
      const gate = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.6, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x2b3831, roughness: 0.4, metalness: 0.6 })
      );
      gate.position.set(slot.canalEnd.x, 0.3, slot.canalEnd.z);
      this.scene.add(gate);
    }

    // 4. Create Crop Field Instance
    const layout = { x: slot.x, z: slot.z, width: slot.width, depth: slot.depth, rotation: slot.rotation || 0 };
    const newPlotData = {
      plotId: slotId,
      name: plotName,
      cropCode,
      cropName: CROP_PROFILES[cropCode]?.label || '特色作物',
      stageCode,
      stageLabel: STAGE_PROFILES[stageCode]?.label || '苗期',
      riskLevel: 'LOW',
      healthScore: 0.99,
      metrics: {
        SOIL_MOISTURE: { label: '土壤湿度', value: parseFloat(slot.soilMoisture) || 28.5, unit: '%', status: 'NORMAL', target: '20~40%' },
        AIR_TEMPERATURE: { label: '空气温度', value: 26.5, unit: '°C', status: 'NORMAL', target: '20~30°C' },
        LIGHT: { label: '光照强度', value: 44000, unit: 'lux', status: 'NORMAL', target: '30k~55k lux' },
        CO2: { label: 'CO₂ 浓度', value: 680, unit: 'ppm', status: 'NORMAL', target: '500~800 ppm' },
        SOIL_EC: { label: '土壤 EC 值', value: 1.4, unit: 'mS/cm', status: 'NORMAL', target: '1.0~2.2 mS/cm' },
        NPK_RATIO: { label: '氮磷钾肥力', value: '185:98:210', unit: 'mg/kg', status: 'NORMAL', target: '均衡充足' }
      }
    };

    const field = new CropField(this.scene, newPlotData, layout, this.windMaterials);
    this.cropFields.set(slotId, field);
    this.plots.push(newPlotData);

    return newPlotData;
  }

  buildTrees() {
    // Trees placed according to original natural layout (zero clipping with crops and far perimeter buildings)
    const positions = [];
    // Perimeter and mountain fringe trees (Original layout)
    for (let i = 0; i < 70; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (26.5 + (i % 6) * 2.2) + Math.sin(i * 3.2) * 1.5;
      const z = -20 + (i % 18) * 2.2 + Math.cos(i * 1.5) * 1.0;
      if (z > 14.0) continue;
      const y = 0.0;
      positions.push({ x, y, z, scale: 0.75 + (Math.sin(i * 4.2) + 1) * 0.25 });
    }
    // North hill forest (Original layout)
    for (let i = 0; i < 50; i++) {
      const x = -38 + i * 1.55;
      const z = -24.0 + Math.sin(i * 0.8) * 3.5;
      const y = 0.0;
      positions.push({ x, y, z, scale: 0.72 + (i % 5) * 0.08 });
    }

    const trunkGeometry = new THREE.CylinderGeometry(0.09, 0.16, 1.6, 10, 3);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x71543b, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, positions.length);
    const dummy = new THREE.Object3D();
    positions.forEach((item, index) => {
      dummy.position.set(item.x, item.y + 0.52 * item.scale, item.z);
      dummy.scale.set(item.scale, item.scale, item.scale);
      dummy.rotation.y = index * 1.93;
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
    });
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    this.scene.add(trunks);

    const crownSpecs = [
      { x: -0.3, y: 1.5, z: 0.02, sx: 0.9, sy: 1.05, sz: 0.9, color: 0x388245 },
      { x: 0.3, y: 1.55, z: 0.08, sx: 0.88, sy: 1.1, sz: 0.86, color: 0x408d4a },
      { x: 0.02, y: 1.88, z: -0.08, sx: 0.96, sy: 1.15, sz: 0.94, color: 0x489652 }
    ];
    crownSpecs.forEach((spec, crownIndex) => {
      const crownGeometry = new THREE.SphereGeometry(0.72, 12, 9);
      crownGeometry.scale(spec.sx, spec.sy, spec.sz);
      crownGeometry.translate(spec.x, spec.y, spec.z);
      createFlexAttribute(crownGeometry);
      attachInstancePhases(crownGeometry, positions.length, crownIndex * 1.37);
      const crownMaterial = createSwayMaterial(spec.color, 0.96);
      this.crownMaterials.push(crownMaterial);
      const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, positions.length);
      positions.forEach((item, index) => {
        dummy.position.set(item.x, item.y, item.z);
        dummy.scale.set(item.scale, item.scale, item.scale);
        dummy.rotation.set(0, index * 1.17, 0);
        dummy.updateMatrix();
        crowns.setMatrixAt(index, dummy.matrix);
      });
      crowns.castShadow = true;
      crowns.receiveShadow = true;
      this.windMaterials.push(crownMaterial);
      this.scene.add(crowns);
    });
  }

  loadSurfaceTextures() {
    const loader = new THREE.TextureLoader();
    const prepare = (texture, repeatX, repeatY) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      return texture;
    };
    loader.load('assets/textures/terrain-grass.png', texture => {
      const terrainTexture = prepare(texture, 36, 26);
      this.terrain.material.map = terrainTexture;
      this.terrain.material.color.set(0x92b270);
      this.terrain.material.needsUpdate = true;
    }, undefined, () => {});
    loader.load('assets/textures/mountain-forest.png', texture => {
      this.ridgeMaterials.forEach((material, index) => {
        if (index === 0) {
          const ridgeTexture = prepare(texture.clone(), 8.0, 2.5);
          ridgeTexture.needsUpdate = true;
          material.map = ridgeTexture;
          material.color.set(0x5b8a68);
          material.emissive = new THREE.Color(0x1a3220);
          material.emissiveIntensity = 0.06;
        } else if (index === 1) {
          material.map = null;
          material.color.set(0x769b93);
          material.emissive = new THREE.Color(0x12262b);
          material.emissiveIntensity = 0.04;
        } else {
          material.map = null;
          material.color.set(0x8eaeb6);
          material.emissive = new THREE.Color(0x0e1e24);
          material.emissiveIntensity = 0.03;
        }
        material.needsUpdate = true;
      });
    }, undefined, () => {});
    loader.load('assets/textures/tilled-soil.png', texture => {
      this.soilMaterials.forEach((material, index) => {
        const soilTexture = prepare(texture.clone(), 4.2 + index * 0.3, 3.4);
        soilTexture.needsUpdate = true;
        material.map = soilTexture;
        material.color.set(0x987456);
        material.needsUpdate = true;
      });
    }, undefined, () => {});
  }

  buildClouds() {
    const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, roughness: 1, depthWrite: false });
    this.clouds = [];
    for (let index = 0; index < 16; index++) {
      const group = new THREE.Group();
      const puffCount = 5 + (index % 3);
      for (let puff = 0; puff < puffCount; puff++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), cloudMaterial.clone());
        mesh.scale.set(1.9 + (puff % 2) * 0.9, 0.75 + (puff % 3) * 0.22, 1.25);
        mesh.position.set((puff - puffCount / 2) * 1.7, Math.sin(puff * 2.2) * 0.45, Math.cos(puff * 1.5) * 0.5);
        group.add(mesh);
      }
      group.position.set(-45 + index * 6.8, 22.0 + (index % 4) * 2.5, -30 - (index % 5) * 6.5);
      group.userData.speed = 0.18 + (index % 4) * 0.04;
      group.userData.baseY = group.position.y;
      group.userData.cloudIndex = index;
      this.clouds.push(group);
      this.scene.add(group);
    }
  }

  buildRain() {
    const count = 3500;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      positions[index * 3] = (Math.random() - 0.5) * 65;
      positions[index * 3 + 1] = Math.random() * 32;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 48;
      speeds[index] = 18 + Math.random() * 14;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xc8e8ff, size: 0.08, transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.Points(geometry, material);
    this.rain.userData.speeds = speeds;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  buildStars() {
    const count = 600;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const radius = 85 + Math.random() * 35;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45;
      positions[index * 3] = Math.cos(theta) * Math.cos(phi) * radius;
      positions[index * 3 + 1] = Math.sin(phi) * radius + 8;
      positions[index * 3 + 2] = Math.sin(theta) * Math.cos(phi) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xdfeaff, size: 0.24, transparent: true, opacity: 0, depthWrite: false }));
    this.scene.add(this.stars);
  }

  bindEvents() {
    this.handleResize = () => this.resize();

    // Mouse Wheel Smooth Zooming (14m ~ 130m)
    this.handleWheel = event => {
      event.preventDefault();
      const zoomDelta = event.deltaY * 0.04;
      const dir = new THREE.Vector3().subVectors(this.camera.position, this.cameraTarget);
      const currentDist = dir.length();
      const newDist = clamp(currentDist + zoomDelta, 14, 130);
      dir.normalize().multiplyScalar(newDist);
      this.camera.position.copy(this.cameraTarget).add(dir);
    };

    // Pointer Down (Orbit vs Pan Roaming)
    this.handlePointerDown = event => {
      if (event.button === 2 || event.button === 1 || event.shiftKey) {
        this.isPanning = true;
        this.panStart.set(event.clientX, event.clientY);
        this.renderer.domElement.style.cursor = 'grabbing';
      } else if (event.button === 0) {
        this.isOrbiting = true;
        this.panStart.set(event.clientX, event.clientY);
      }
    };

    this.handlePointerUp = () => {
      this.isPanning = false;
      this.isOrbiting = false;
      this.renderer.domElement.style.cursor = (this.hoveredPlotId || this.hoveredSlotId) ? 'pointer' : 'default';
    };

    this.handleContextMenu = event => event.preventDefault();

    this.handlePointerMove = event => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);

      // Pan Roaming across vast terrain
      if (this.isPanning) {
        const dx = event.clientX - this.panStart.x;
        const dy = event.clientY - this.panStart.y;
        this.panStart.set(event.clientX, event.clientY);

        const dist = this.camera.position.distanceTo(this.cameraTarget);
        const panSpeed = dist * 0.0014;

        const right = new THREE.Vector3();
        this.camera.getWorldDirection(right);
        right.cross(this.camera.up).normalize();

        const forward = new THREE.Vector3(0, 0, 0);
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const offset = new THREE.Vector3()
          .addScaledVector(right, -dx * panSpeed)
          .addScaledVector(forward, dy * panSpeed);

        this.camera.position.add(offset);
        this.cameraTarget.add(offset);
        this.cameraTarget.x = clamp(this.cameraTarget.x, -70, 70);
        this.cameraTarget.z = clamp(this.cameraTarget.z, -50, 45);
      }

      // Directional Wind Physics
      const now = performance.now();
      if (this.lastPointer) {
        const elapsed = Math.max(8, now - this.lastPointer.time);
        const dx = event.clientX - this.lastPointer.x;
        const dy = event.clientY - this.lastPointer.y;
        const gain = clamp(24 / elapsed, 0.4, 2.0);
        this.targetWind.x = clamp(this.targetWind.x + dx * 0.028 * gain, -3.8, 3.8);
        this.targetWind.y = clamp(this.targetWind.y - dy * 0.028 * gain, -3.8, 3.8);
      }
      this.lastPointer = { x: event.clientX, y: event.clientY, time: now };
    };

    this.handlePointerLeave = () => {
      this.pointer.set(10, 10);
      this.lastPointer = null;
      this.isPanning = false;
      this.isOrbiting = false;
      this.setHoveredPlot(null);
      this.setHoveredSlot(null);
    };

    this.handleClick = event => {
      clearTimeout(this.clickTimer);
      this.clickTimer = setTimeout(() => {
        // 1. Check if clicking reclamation slot
        if (this.isReclamationMode) {
          const hitSlot = this.pickSlot(event.clientX, event.clientY);
          if (hitSlot) {
            this.onSelectSlot(hitSlot.slotId, hitSlot.screen);
            return;
          }
        }
        // 2. Check active plot
        const hit = this.pickPlot(event.clientX, event.clientY);
        if (hit) this.onSelect(hit.plotId, hit.screen);
      }, 200);
    };

    this.handleDoubleClick = event => {
      clearTimeout(this.clickTimer);
      const hit = this.pickPlot(event.clientX, event.clientY);
      if (hit) this.onDoubleSelect(hit.plotId, hit.screen);
    };

    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.addEventListener('click', this.handleClick);
    this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick);
  }

  pickPlot(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const intersections = this.raycaster.intersectObjects([...this.plotMeshes.values()], false);
    if (!intersections.length) return null;
    const plotId = intersections[0].object.userData.plotId;
    return { plotId, screen: { x: clientX, y: clientY } };
  }

  pickSlot(clientX, clientY) {
    if (!this.isReclamationMode) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const slots = [...this.reclamationSlotMeshes.values()].filter(g => g.visible);
    const intersections = this.raycaster.intersectObjects(slots, true);
    if (!intersections.length) return null;
    let curr = intersections[0].object;
    while (curr && !curr.userData?.slotId && curr.parent) curr = curr.parent;
    if (curr?.userData?.slotId) {
      return { slotId: curr.userData.slotId, screen: { x: clientX, y: clientY } };
    }
    return null;
  }

  setHoveredPlot(plotId) {
    if (plotId === this.hoveredPlotId) return;
    this.hoveredPlotId = plotId;
    this.plotMeshes.forEach((mesh, id) => {
      mesh.material.color.copy(mesh.userData.baseColor);
      mesh.material.emissive.set(id === plotId ? 0x26491e : 0x000000);
      mesh.material.emissiveIntensity = id === plotId ? 0.38 : 0;
    });
    if (!this.hoveredSlotId) {
      this.renderer.domElement.style.cursor = plotId ? 'pointer' : 'default';
    }
  }

  setHoveredSlot(slotId) {
    if (slotId === this.hoveredSlotId) return;
    this.hoveredSlotId = slotId;
    this.reclamationSlotMeshes.forEach((group, id) => {
      group.children.forEach(child => {
        if (child.material && child.material.opacity !== undefined) {
          child.material.opacity = id === slotId ? 0.45 : (child.geometry?.type === 'BoxGeometry' ? 0.9 : 0.18);
        }
      });
    });
    this.renderer.domElement.style.cursor = (slotId || this.hoveredPlotId) ? 'pointer' : 'default';
  }

  flyToSector(sectorId) {
    const s = SECTOR_VIEWS[sectorId] || SECTOR_VIEWS.all;
    this.animateCamera(s.cam, s.target, 850);
  }

  animateCamera(toPos, toTarget, duration = 800) {
    const fromPos = this.camera.position.clone();
    const fromTarget = this.cameraTarget.clone();
    const targetPos = new THREE.Vector3(toPos.x, toPos.y, toPos.z);
    const targetLookAt = new THREE.Vector3(toTarget.x, toTarget.y, toTarget.z);
    const startTime = performance.now();

    this.cameraAnimation = {
      update: () => {
        const now = performance.now();
        const progress = Math.min(1.0, (now - startTime) / duration);
        const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        this.camera.position.lerpVectors(fromPos, targetPos, ease);
        this.cameraTarget.lerpVectors(fromTarget, targetLookAt, ease);
        this.camera.lookAt(this.cameraTarget);
        if (progress >= 1.0) {
          this.cameraAnimation = null;
        }
      }
    };
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setWeather(weather) {
    this.weather = WEATHER_LABELS[weather] ? weather : 'sunny';
    const settings = {
      sunny: { maxClouds: 4, rain: false },
      cloudy: { maxClouds: 10, rain: false },
      overcast: { maxClouds: 16, rain: false },
      'light-rain': { maxClouds: 14, rain: true, rainOpacity: 0.45 },
      'moderate-rain': { maxClouds: 16, rain: true, rainOpacity: 0.68 },
      'heavy-rain': { maxClouds: 16, rain: true, rainOpacity: 0.88 }
    }[this.weather];

    this.clouds.forEach((cloud, index) => {
      const isVisible = index < settings.maxClouds;
      cloud.visible = isVisible;
      cloud.children.forEach(mesh => {
        mesh.material.opacity = isVisible ? (this.weather === 'sunny' ? 0.65 : 0.88) : 0;
        mesh.material.color.set(this.weather === 'sunny' ? 0xffffff : this.weather === 'cloudy' ? 0xecf0f2 : 0xcbd2d6);
      });
    });

    this.rain.visible = settings.rain;
    this.rain.material.opacity = settings.rainOpacity || 0;
    this.scene.fog.density = 0.0035;
    this.renderer.toneMappingExposure = 1.15;
  }

  setPlotCrop(plotId, cropCode) {
    const plot = this.plots.find(p => p.plotId === plotId);
    if (plot) plot.cropCode = cropCode;
    const field = this.cropFields.get(plotId);
    field?.build(cropCode, plot?.stageCode || 'fruiting');
  }

  setPlotStage(plotId, stageCode) {
    const plot = this.plots.find(p => p.plotId === plotId);
    if (plot) plot.stageCode = stageCode;
    const field = this.cropFields.get(plotId);
    field?.build(plot?.cropCode || 'tomato', stageCode);
  }

  setSelectedPlot(plotId) {
    this.plotGlows.forEach((group, id) => { group.visible = id === plotId; });
  }

  updateDaylight(hour) {
    const day = getDayPhase(hour);
    const daylight = day.daylight;
    const warm = day.warm;
    const dayTop = new THREE.Color(0x389adb);
    const dayHorizon = new THREE.Color(0xe2f2db);
    const nightTop = new THREE.Color(0x061124);
    const nightHorizon = new THREE.Color(0x162a46);
    const sunsetTop = new THREE.Color(0x7699c2);
    const sunsetHorizon = new THREE.Color(0xffad5f);

    this.skyUniforms.uTop.value.copy(nightTop).lerp(dayTop, daylight).lerp(sunsetTop, warm * 0.44);
    this.skyUniforms.uHorizon.value.copy(nightHorizon).lerp(dayHorizon, daylight).lerp(sunsetHorizon, warm * 0.78);
    this.skyUniforms.uSunColor.value.set(daylight > 0.5 ? 0xffefb1 : 0xff9b55);
    this.skyUniforms.uSunStrength.value = 0.18 + daylight * 0.94 + warm * 0.42;

    const sunProgress = clamp((hour - 5.7) / 13.6, 0, 1);
    const sunAngle = sunProgress * Math.PI;
    const sunX = lerp(-48, 48, sunProgress);
    const sunY = Math.sin(sunAngle) * 36.0 + 8.0;
    const sunZ = -65;

    this.sunDisc.position.set(sunX, sunY, sunZ);
    this.sunLight.position.set(sunX, sunY + 8, sunZ + 25);
    this.skyUniforms.uSunDirection.value.copy(this.sunDisc.position).normalize();
    this.sunLight.color.set(warm > 0.2 ? 0xffa25d : 0xffedc2);
    this.sunLight.intensity = 0.2 + daylight * 4.4;
    this.hemiLight.color.set(daylight > 0.2 ? 0xeaf5ff : 0x7fa2d8);
    this.hemiLight.groundColor.set(daylight > 0.2 ? 0x4f753c : 0x223624);
    this.hemiLight.intensity = 0.85 + daylight * 1.8;
    this.sunDisc.visible = hour >= 5.6 && hour <= 19.3;
    this.stars.material.opacity = clamp((0.34 - daylight) * 2.4, 0, 0.86);

    const isNight = daylight < 0.42;
    this.nightLights.forEach(light => {
      light.intensity = isNight ? 3.6 : 0;
    });
    this.streetLights?.forEach(light => {
      light.intensity = isNight ? 24.0 : 0;
    });
    this.streetLampBulbs?.forEach(bulb => {
      bulb.material.color.set(isNight ? 0xffe28a : 0x728076);
    });
  }

  projectPlotMarkers() {
    const markers = {};
    const reclamationMarkers = {};

    this.plots.forEach(plot => {
      const layout = PLOT_LAYOUT[plot.plotId] || RECLAMATION_SLOTS.find(s => s.slotId === plot.plotId);
      if (!layout || layout.isGreenhouse) return;
      const profile = CROP_PROFILES[plot.cropCode] || CROP_PROFILES.tomato;
      const stage = STAGE_PROFILES[plot.stageCode] || STAGE_PROFILES.fruiting;
      const warningPoint = new THREE.Vector3(layout.x, 0.75 + profile.height * stage.height, layout.z);
      const labelPoint = new THREE.Vector3(layout.x - layout.width * 0.36, 0.32, layout.z + layout.depth * 0.42);
      warningPoint.project(this.camera);
      labelPoint.project(this.camera);
      markers[plot.plotId] = {
        x: (labelPoint.x * 0.5 + 0.5) * this.host.clientWidth,
        y: (-labelPoint.y * 0.5 + 0.5) * this.host.clientHeight,
        warningX: (warningPoint.x * 0.5 + 0.5) * this.host.clientWidth,
        warningY: (-warningPoint.y * 0.5 + 0.5) * this.host.clientHeight,
        visible: labelPoint.z > -1 && labelPoint.z < 1
      };
    });

    if (this.isReclamationMode) {
      RECLAMATION_SLOTS.forEach(slot => {
        if (this.plots.some(p => p.plotId === slot.slotId)) return;
        const slotPoint = new THREE.Vector3(slot.x, 0.6, slot.z);
        slotPoint.project(this.camera);
        reclamationMarkers[slot.slotId] = {
          x: (slotPoint.x * 0.5 + 0.5) * this.host.clientWidth,
          y: (-slotPoint.y * 0.5 + 0.5) * this.host.clientHeight,
          visible: slotPoint.z > -1 && slotPoint.z < 1,
          slot
        };
      });
    }

    this.onFrame({ markers, reclamationMarkers });
  }

  animate = () => {
    if (this.isDestroyed) return;
    this.animationFrame = requestAnimationFrame(this.animate);

    if (this.cameraAnimation) {
      this.cameraAnimation.update();
    } else {
      this.camera.lookAt(this.cameraTarget);
    }

    if (this.clock.getDelta) this.clock.getDelta();
    const elapsed = performance.now() * 0.001;

    this.targetWind.multiplyScalar(0.915);
    this.currentWind.lerp(this.targetWind, 0.09);

    this.windMaterials.forEach(material => {
      const uniforms = material.userData.windUniforms;
      if (!uniforms) return;
      uniforms.uFarmTime.value = elapsed;
      uniforms.uWindVector.value.set(this.currentWind.x, this.currentWind.y);
      uniforms.uBreeze.value = 0.045 + Math.sin(elapsed * 0.45) * 0.015;
    });

    this.waterMaterials.forEach(material => {
      material.userData.waterUniforms.uTime.value = elapsed;
    });

    this.clouds.forEach((cloud, index) => {
      cloud.position.x += cloud.userData.speed * 0.009;
      if (cloud.position.x > 42) cloud.position.x = -42;
      cloud.position.y = cloud.userData.baseY + Math.sin(elapsed * 0.2 + index) * 0.3;
    });

    if (this.rain.visible) {
      const positions = this.rain.geometry.attributes.position;
      const speeds = this.rain.userData.speeds;
      for (let index = 0; index < positions.count; index++) {
        let y = positions.getY(index) - speeds[index] * 0.016;
        let x = positions.getX(index) + this.currentWind.x * 0.014;
        if (y < -0.2) {
          y = 20 + Math.random() * 8;
          x = (Math.random() - 0.5) * 60;
        }
        positions.setXY(index, x, y);
      }
      positions.needsUpdate = true;
    }

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hoverHits = this.raycaster.intersectObjects([...this.plotMeshes.values()], false);
    this.setHoveredPlot(hoverHits[0]?.object?.userData?.plotId || null);

    if (this.isReclamationMode) {
      const slotHits = this.raycaster.intersectObjects([...this.reclamationSlotMeshes.values()].filter(g => g.visible), true);
      let hitSlotId = null;
      if (slotHits.length) {
        let curr = slotHits[0].object;
        while (curr && !curr.userData?.slotId && curr.parent) curr = curr.parent;
        hitSlotId = curr?.userData?.slotId || null;
      }
      this.setHoveredSlot(hitSlotId);
    }

    this.renderer.render(this.scene, this.camera);
    this.frameCount++;
    if (this.frameCount % 2 === 0) this.projectPlotMarkers();
  };

  destroy() {
    this.isDestroyed = true;
    cancelAnimationFrame(this.animationFrame);
    clearTimeout(this.clickTimer);
    window.removeEventListener('resize', this.handleResize);
    this.renderer?.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer?.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    this.renderer?.domElement.removeEventListener('click', this.handleClick);
    this.renderer?.domElement.removeEventListener('dblclick', this.handleDoubleClick);
    this.cropFields.forEach(field => field.destroy());
    this.scene?.traverse(object => {
      if (object.isMesh || object.isPoints || object.isInstancedMesh) {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(m => m.dispose?.());
        else object.material?.dispose?.();
      }
    });
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}

export class FarmMonitor {
  constructor({ plots = DEFAULT_PLOTS, onExit, onSandbox } = {}) {
    this.plots = plots?.length ? plots : DEFAULT_PLOTS;
    this.onExit = onExit || (() => {});
    this.onSandbox = onSandbox || (() => {});
    this.selectedPlotId = this.plots[0]?.plotId || 'plot-a01';
    this.weather = 'sunny';
    this.temperature = 28.4;
    this.humidity = 58;
    this.windSpeed = 2.7;
    this.locationLabel = '重庆 · 现代智慧农业生态示范园';
    this.isOpen = false;
    this.simulatedHour = null;
  }

  setPlots(plots) {
    this.plots = plots?.length ? plots : DEFAULT_PLOTS;
  }

  open(plotId) {
    if (this.isOpen) {
      this.selectedPlotId = plotId || this.selectedPlotId;
      this.world?.setSelectedPlot(this.selectedPlotId);
      return;
    }
    this.isOpen = true;
    this.selectedPlotId = plotId || this.plots[0]?.plotId || 'plot-a01';
    document.body.classList.add('farm-monitor-open');

    this.shell = document.createElement('section');
    this.shell.className = 'farm-monitor-shell';
    this.shell.innerHTML = this.renderShell();
    document.body.appendChild(this.shell);

    this.cacheDom();
    this.bindUi();
    this.createMarkers();

    try {
      this.world = new FarmWorld3D(this.dom.world, {
        plots: this.plots,
        onSelect: (id, origin) => this.selectPlot(id, origin),
        onDoubleSelect: id => this.openSandbox(id),
        onSelectSlot: (slotId, origin) => this.openReclamationWizard(slotId),
        onFrame: data => this.updateProjectedUi(data)
      });
      this.world.init();
      this.world.setSelectedPlot(this.selectedPlotId);
      this.world.setWeather(this.weather);
    } catch (error) {
      console.error('[FarmMonitor] WebGL 启动异常:', error);
    }

    this.startClock();
    this.resolveWeather();
    requestAnimationFrame(() => this.shell?.classList.add('active'));
  }

  renderShell() {
    return `
      <div class="farm-world-host" data-farm-world></div>

      <!-- Left Tool Rail -->
      <aside class="farm-tool-rail" aria-label="环境与视角工具">
        <button class="farm-rail-back" type="button" data-farm-back aria-label="返回总览"><i class="ph ph-arrow-left"></i></button>
        <div class="farm-rail-metrics">
          <div class="farm-rail-metric clickable" data-action="open-weather" title="点击切换天气">
            <i class="ph ph-sun" data-weather-icon></i>
            <strong data-temperature>28.4°C</strong>
            <span data-weather-label>晴天</span>
          </div>
          <div class="farm-rail-metric">
            <i class="ph ph-drop"></i>
            <strong data-humidity>58%</strong>
            <span>湿度</span>
          </div>
          <div class="farm-rail-metric">
            <i class="ph ph-wind"></i>
            <strong data-wind-speed>2.7 m/s</strong>
            <span>风速</span>
          </div>
          <div class="farm-rail-metric">
            <i class="ph ph-leaf"></i>
            <strong>35</strong>
            <span>空气优</span>
          </div>
          <div class="farm-rail-metric farm-rail-time clickable" data-action="open-time" title="点击调整昼夜/日出/日落时间">
            <i class="ph ph-clock"></i>
            <strong data-clock>14:20:00</strong>
            <span data-date>08-23 周六</span>
          </div>
        </div>
        <div class="farm-rail-actions">
          <button type="button" data-location-action title="地理位置"><i class="ph ph-map-pin"></i><span>地理位置</span></button>
          <button type="button" data-camera-reset title="全景视角"><i class="ph ph-arrows-out-cardinal"></i><span>全景复位</span></button>
        </div>
      </aside>

      <!-- Title Lockup -->
      <header class="farm-title-lockup">
        <p>AGRILOOP · DIGITAL TWIN PARK</p>
        <h1>现代智慧农田数字孪生全景</h1>
        <div class="farm-title-meta">
          <span data-location-label><i class="ph ph-map-pin"></i> 重庆 · 现代智慧农业生态示范园</span>
          <span class="badge-plots" data-plot-counter><i class="ph ph-squares-four"></i> ${this.plots.length} 块独立监测示范区</span>
        </div>
      </header>

      <!-- Panoramic Sector Navigator (全景区域漫游切换栏) -->
      <nav class="farm-sector-nav" aria-label="全景区域漫游导航">
        <button class="farm-sector-btn active" type="button" data-sector="all"><i class="ph ph-globe"></i> 全域总览</button>
        <button class="farm-sector-btn" type="button" data-sector="core"><i class="ph ph-squares-four"></i> 核心示范区</button>
        <button class="farm-sector-btn" type="button" data-sector="east"><i class="ph ph-arrow-right"></i> 东区高效带</button>
        <button class="farm-sector-btn" type="button" data-sector="west"><i class="ph ph-arrow-left"></i> 西区有机带</button>
        <button class="farm-sector-btn" type="button" data-sector="south"><i class="ph ph-arrow-down"></i> 南区高产带</button>
        <button class="farm-sector-btn" type="button" data-sector="north"><i class="ph ph-buildings"></i> 北区温室群</button>
      </nav>

      <!-- Top Action Right Dock (新田开垦规划入口) -->
      <div class="farm-top-actions" style="position: absolute; top: 20px; right: 20px; z-index: 30; display: flex; align-items: center; gap: 8px;">
        <button class="farm-btn-reclaim" type="button" data-btn-reclaim><i class="ph ph-plant"></i><span>🌾 新田开垦规划</span></button>
      </div>

      <!-- Reclamation Mode Banner -->
      <div class="farm-reclaim-banner" data-reclaim-banner>
        <i class="ph ph-info"></i>
        <span>开垦规划模式已开启：点击草地上高亮的 <strong>【待开垦槽位】</strong> 即可选定作物并自动引水建渠！</span>
        <button class="farm-dialog-close" type="button" data-close-reclaim-mode style="background:transparent; border:0; color:#fff; cursor:pointer; font-size:14px; margin-left:8px;">✕</button>
      </div>

      <!-- 2D Marker Overlay Layer -->
      <div class="farm-marker-layer" data-marker-layer></div>

      <!-- Bottom Floating Widgets -->
      <div class="farm-wind-readout"><span class="farm-live-dot"></span><span>作物动力学风场</span><strong data-wind-state>自然微风 · 移动鼠标触发作物飘扬 · 滚轮缩放 / 右键拖拽漫游</strong></div>
      <div class="farm-scene-hint"><i class="ph ph-mouse-left-click"></i><span>单击地块自定义作物与阶段 · 双击推演 · 滚轮缩放</span></div>

      <!-- Floating Interactive Environment & Time Control Dock -->
      <section class="farm-env-dock" aria-label="环境与光影调控坞">
        <div class="farm-env-section">
          <span class="farm-env-label"><i class="ph ph-clock"></i> 昼夜光影</span>
          <div class="farm-env-btn-group">
            <button class="farm-dock-btn" type="button" data-dock-time="6.0" title="06:00 晨曦日出">🌅 06:00</button>
            <button class="farm-dock-btn" type="button" data-dock-time="12.0" title="12:00 正午艳阳">☀️ 12:00</button>
            <button class="farm-dock-btn" type="button" data-dock-time="18.0" title="18:00 晚霞日落">🌇 18:00</button>
            <button class="farm-dock-btn" type="button" data-dock-time="22.0" title="22:00 星空深夜">🌙 22:00</button>
            <button class="farm-dock-btn active" type="button" data-dock-time="realtime" title="实时系统时间">⏱️ 实时</button>
          </div>
          <div class="farm-dock-slider-wrap">
            <input class="farm-dock-slider" type="range" min="0" max="24" step="0.1" value="14.3" data-dock-time-slider title="拖动调整全天时间">
            <span class="farm-dock-time-val" data-dock-time-val>14:20</span>
          </div>
        </div>

        <div class="farm-env-divider"></div>

        <div class="farm-env-section">
          <span class="farm-env-label"><i class="ph ph-cloud-sun"></i> 气象特效</span>
          <div class="farm-env-btn-group">
            <button class="farm-dock-btn ${this.weather === 'sunny' ? 'active' : ''}" type="button" data-dock-weather="sunny" title="晴天">☀️ 晴</button>
            <button class="farm-dock-btn ${this.weather === 'cloudy' ? 'active' : ''}" type="button" data-dock-weather="cloudy" title="多云">⛅ 多云</button>
            <button class="farm-dock-btn ${this.weather === 'overcast' ? 'active' : ''}" type="button" data-dock-weather="overcast" title="阴天">☁️ 阴</button>
            <button class="farm-dock-btn ${this.weather === 'light-rain' ? 'active' : ''}" type="button" data-dock-weather="light-rain" title="小雨">🌦️ 小雨</button>
            <button class="farm-dock-btn ${this.weather === 'moderate-rain' ? 'active' : ''}" type="button" data-dock-weather="moderate-rain" title="中雨">🌧️ 中雨</button>
            <button class="farm-dock-btn ${this.weather === 'heavy-rain' ? 'active' : ''}" type="button" data-dock-weather="heavy-rain" title="大雨">⛈️ 大雨</button>
          </div>
        </div>
      </section>

      <!-- Expanding Detail Inspection Modal (由小变大丝滑展开) -->
      <aside class="farm-detail-panel" data-detail-panel aria-live="polite"></aside>

      <!-- Cultivation Wizard Dialog (新田开垦向导) -->
      <div class="farm-reclaim-dialog-backdrop" data-dialog="reclaim">
        <div class="farm-reclaim-card" data-reclaim-card>
          <div class="farm-reclaim-head">
            <div>
              <h3>🌾 规则化农田开垦与引水规划</h3>
              <p data-reclaim-subtitle>请选择该开垦地块的主栽作物与灌溉规划</p>
            </div>
            <button class="farm-dialog-close" type="button" data-dialog-close>✕</button>
          </div>

          <div class="farm-reclaim-grid-info">
            <div class="farm-reclaim-info-box">
              <span>所属片区</span>
              <strong data-reclaim-zone>东区现代高效示范带</strong>
            </div>
            <div class="farm-reclaim-info-box">
              <span>规划面积</span>
              <strong data-reclaim-area>8.5m × 7.0m (~60㎡)</strong>
            </div>
            <div class="farm-reclaim-info-box">
              <span>土壤本底水分</span>
              <strong data-reclaim-moisture>28.5% (适宜)</strong>
            </div>
          </div>

          <label class="farm-reclaim-field-label">🌱 选择主栽作物类型</label>
          <div class="farm-reclaim-crop-options" data-reclaim-crop-group>
            ${Object.entries(CROP_PROFILES).map(([key, item], idx) => `
              <button class="farm-reclaim-crop-btn ${idx === 0 ? 'active' : ''}" type="button" data-reclaim-crop="${key}">
                <span class="crop-icon">${item.icon}</span>
                <span>${item.label}</span>
              </button>
            `).join('')}
          </div>

          <label class="farm-reclaim-field-label">💧 自动引水建渠方案</label>
          <div class="farm-reclaim-info-box" style="margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <span style="color: #10382b; font-weight: 700;">临近主水渠自动延展接驳</span>
              <small style="color: #4c6c5e; display: block; margin-top: 2px;">计算最近主干水渠分支点，自动铺设石砌引水支渠与进水控制闸</small>
            </div>
            <span style="color: var(--farm-green-bright); font-weight: 800; font-size: 12px;">智能就绪</span>
          </div>

          <button class="farm-reclaim-submit-btn" type="button" data-submit-reclaim>
            <i class="ph ph-sparkle"></i>
            <span>✨ 立即开垦并引水建渠</span>
          </button>
        </div>
      </div>

      <!-- Time Simulation Dialog -->
      <div class="farm-dialog-backdrop" data-dialog="time">
        <div class="farm-dialog-card">
          <div class="farm-dialog-head">
            <h3>⏰ 昼夜与光影模拟控制</h3>
            <button class="farm-dialog-close" type="button" data-dialog-close>✕</button>
          </div>
          <div class="farm-preset-grid">
            <button class="farm-preset-btn" type="button" data-set-time="6.0"><i class="ph ph-sun-horizon"></i><span>06:00 晨曦日出</span></button>
            <button class="farm-preset-btn" type="button" data-set-time="12.0"><i class="ph ph-sun"></i><span>12:00 正午艳阳</span></button>
            <button class="farm-preset-btn" type="button" data-set-time="18.0"><i class="ph ph-sunset"></i><span>18:00 晚霞日落</span></button>
            <button class="farm-preset-btn" type="button" data-set-time="22.0"><i class="ph ph-moon-stars"></i><span>22:00 星空深夜</span></button>
          </div>
          <div class="farm-slider-control">
            <label><span>24小时时间滑块</span><strong data-slider-label>实时同步</strong></label>
            <input type="range" min="0" max="24" step="0.1" value="14.3" data-time-slider>
          </div>
          <button class="farm-sandbox-button" style="margin-top: 14px;" type="button" data-reset-realtime><span>恢复本地实时时间</span></button>
        </div>
      </div>

      <!-- Weather Switcher Dialog -->
      <div class="farm-dialog-backdrop" data-dialog="weather">
        <div class="farm-dialog-card">
          <div class="farm-dialog-head">
            <h3>🌧️ 天气气象特效控制</h3>
            <button class="farm-dialog-close" type="button" data-dialog-close>✕</button>
          </div>
          <div class="farm-preset-grid">
            <button class="farm-preset-btn" type="button" data-set-weather="sunny"><i class="ph ph-sun"></i><span>晴天 (Sunny)</span></button>
            <button class="farm-preset-btn" type="button" data-set-weather="cloudy"><i class="ph ph-cloud-sun"></i><span>多云 (Cloudy)</span></button>
            <button class="farm-preset-btn" type="button" data-set-weather="overcast"><i class="ph ph-cloud"></i><span>阴天 (Overcast)</span></button>
            <button class="farm-preset-btn" type="button" data-set-weather="light-rain"><i class="ph ph-cloud-rain"></i><span>小雨 (Light Rain)</span></button>
            <button class="farm-preset-btn" type="button" data-set-weather="moderate-rain"><i class="ph ph-cloud-rain"></i><span>中雨 (Moderate)</span></button>
            <button class="farm-preset-btn" type="button" data-set-weather="heavy-rain"><i class="ph ph-cloud-lightning"></i><span>大雨 (Heavy Rain)</span></button>
          </div>
        </div>
      </div>

      <!-- Toast Container -->
      <div class="farm-toast" data-farm-toast role="status"></div>
    `;
  }

  cacheDom() {
    const q = s => this.shell.querySelector(s);
    this.dom = {
      world: q('[data-farm-world]'),
      back: q('[data-farm-back]'),
      panel: q('[data-detail-panel]'),
      markerLayer: q('[data-marker-layer]'),
      toast: q('[data-farm-toast]'),
      clock: q('[data-clock]'),
      date: q('[data-date]'),
      weatherLabel: q('[data-weather-label]'),
      weatherIcon: q('[data-weather-icon]'),
      temperature: q('[data-temperature]'),
      humidity: q('[data-humidity]'),
      windSpeed: q('[data-wind-speed]'),
      windState: q('[data-wind-state]'),
      location: q('[data-location-label]'),
      plotCounter: q('[data-plot-counter]'),
      reclaimBtn: q('[data-btn-reclaim]'),
      reclaimBanner: q('[data-reclaim-banner]'),
      reclaimDialog: q('[data-dialog="reclaim"]'),
      timeDialog: q('[data-dialog="time"]'),
      weatherDialog: q('[data-dialog="weather"]'),
      timeSlider: q('[data-time-slider]'),
      sliderLabel: q('[data-slider-label]'),
      dockTimeSlider: q('[data-dock-time-slider]'),
      dockTimeVal: q('[data-dock-time-val]')
    };
  }

  bindUi() {
    this.dom.back.addEventListener('click', () => {
      this.close(false);
      this.onExit();
    });

    // Sector Navigator Clicks (Camera Roaming)
    this.shell.querySelectorAll('[data-sector]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sector = btn.dataset.sector;
        this.shell.querySelectorAll('[data-sector]').forEach(b => b.classList.toggle('active', b === btn));
        this.world?.flyToSector(sector);
        this.showToast(`已漫游至【${SECTOR_VIEWS[sector]?.name || sector}】`);
      });
    });

    // Reclamation Planning Mode Toggle
    this.dom.reclaimBtn?.addEventListener('click', () => {
      this.toggleReclamationMode();
    });

    this.shell.querySelector('[data-close-reclaim-mode]')?.addEventListener('click', () => {
      this.toggleReclamationMode(false);
    });

    this.shell.querySelector('[data-camera-reset]').addEventListener('click', () => {
      if (this.world) {
        this.world.targetWind.set(0, 0);
        this.world.flyToSector('all');
      }
      this.shell.querySelectorAll('[data-sector]').forEach(b => b.classList.toggle('active', b.dataset.sector === 'all'));
      this.showToast('已恢复全景广角视角');
    });

    this.shell.querySelector('[data-location-action]').addEventListener('click', () => {
      this.showToast(`当前定位：${this.locationLabel}`);
    });

    this.shell.querySelector('[data-action="open-time"]').addEventListener('click', () => {
      this.dom.timeDialog.classList.add('open');
    });

    this.shell.querySelector('[data-action="open-weather"]').addEventListener('click', () => {
      this.dom.weatherDialog.classList.add('open');
    });

    this.shell.querySelectorAll('[data-dialog-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.timeDialog.classList.remove('open');
        this.dom.weatherDialog.classList.remove('open');
        this.dom.reclaimDialog?.classList.remove('open');
      });
    });

    // Dock Time Controls
    this.shell.querySelectorAll('[data-dock-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.dockTime;
        this.shell.querySelectorAll('[data-dock-time]').forEach(b => b.classList.toggle('active', b === btn));
        if (val === 'realtime') {
          this.simulatedHour = null;
          if (this.dom.dockTimeVal) this.dom.dockTimeVal.textContent = '实时';
          if (this.dom.sliderLabel) this.dom.sliderLabel.textContent = '实时同步';
          this.showToast('已恢复系统实时时间');
        } else {
          const hour = parseFloat(val);
          this.simulatedHour = hour;
          this.world?.updateDaylight(hour);
          const hh = Math.floor(hour);
          const mm = Math.round((hour - hh) * 60);
          const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
          if (this.dom.dockTimeVal) this.dom.dockTimeVal.textContent = timeStr;
          if (this.dom.dockTimeSlider) this.dom.dockTimeSlider.value = hour;
          if (this.dom.timeSlider) this.dom.timeSlider.value = hour;
          if (this.dom.sliderLabel) this.dom.sliderLabel.textContent = `${timeStr} (模拟)`;
          this.showToast(`已切换至 ${timeStr} 昼夜光影`);
        }
      });
    });

    if (this.dom.dockTimeSlider) {
      this.dom.dockTimeSlider.addEventListener('input', e => {
        const hour = parseFloat(e.target.value);
        this.simulatedHour = hour;
        this.world?.updateDaylight(hour);
        const hh = Math.floor(hour);
        const mm = Math.round((hour - hh) * 60);
        const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        if (this.dom.dockTimeVal) this.dom.dockTimeVal.textContent = timeStr;
        if (this.dom.sliderLabel) this.dom.sliderLabel.textContent = `${timeStr} (模拟)`;
        if (this.dom.timeSlider) this.dom.timeSlider.value = hour;
        this.shell.querySelectorAll('[data-dock-time]').forEach(b => b.classList.remove('active'));
      });
    }

    // Dock Weather Controls
    this.shell.querySelectorAll('[data-dock-weather]').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = btn.dataset.dockWeather;
        this.shell.querySelectorAll('[data-dock-weather]').forEach(b => b.classList.toggle('active', b === btn));
        this.applyWeather({ weather: w, temperature: 28.4, humidity: 58, windSpeed: 2.7 });
        this.showToast(`已切换为【${WEATHER_LABELS[w] || w}】特效`);
      });
    });

    // Time presets (Dialog)
    this.shell.querySelectorAll('[data-set-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hour = parseFloat(btn.dataset.setTime);
        this.simulatedHour = hour;
        this.world?.updateDaylight(hour);
        this.dom.sliderLabel.textContent = `${hour.toFixed(1)}:00 (模拟)`;
        this.dom.timeSlider.value = hour;
        if (this.dom.dockTimeSlider) this.dom.dockTimeSlider.value = hour;
        if (this.dom.dockTimeVal) this.dom.dockTimeVal.textContent = `${hour.toFixed(0)}:00`;
        this.dom.timeDialog.classList.remove('open');
        this.showToast(`已切换至 ${hour}:00 光影模拟`);
      });
    });

    this.dom.timeSlider.addEventListener('input', e => {
      const hour = parseFloat(e.target.value);
      this.simulatedHour = hour;
      this.world?.updateDaylight(hour);
      this.dom.sliderLabel.textContent = `${hour.toFixed(1)}:00 (模拟)`;
      if (this.dom.dockTimeSlider) this.dom.dockTimeSlider.value = hour;
      if (this.dom.dockTimeVal) this.dom.dockTimeVal.textContent = `${hour.toFixed(0)}:00`;
    });

    this.shell.querySelector('[data-reset-realtime]').addEventListener('click', () => {
      this.simulatedHour = null;
      this.dom.sliderLabel.textContent = '实时同步';
      if (this.dom.dockTimeVal) this.dom.dockTimeVal.textContent = '实时';
      this.shell.querySelectorAll('[data-dock-time]').forEach(b => b.classList.toggle('active', b.dataset.dockTime === 'realtime'));
      this.dom.timeDialog.classList.remove('open');
      this.showToast('已恢复系统实时时间');
    });

    // Weather presets
    this.shell.querySelectorAll('[data-set-weather]').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = btn.dataset.setWeather;
        this.applyWeather({ weather: w, temperature: 28.4, humidity: 58, windSpeed: 2.7 });
        this.dom.weatherDialog.classList.remove('open');
        this.showToast(`已切换为【${WEATHER_LABELS[w] || w}】特效`);
      });
    });

    // Wizard crop picker
    this.shell.querySelectorAll('[data-reclaim-crop]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.shell.querySelectorAll('[data-reclaim-crop]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // Wizard submit cultivation
    this.shell.querySelector('[data-submit-reclaim]')?.addEventListener('click', () => {
      this.submitReclamation();
    });

    // Modal delegated clicks (Customizing THIS plot's crop and stage!)
    this.dom.panel.addEventListener('click', event => {
      if (event.target.closest('[data-panel-close]')) this.closePanel();
      if (event.target.closest('[data-panel-sandbox]')) this.openSandbox(this.selectedPlotId);

      // Per-Plot Crop Selection
      const cropBtn = event.target.closest('[data-set-plot-crop]');
      if (cropBtn) {
        const cropCode = cropBtn.dataset.setPlotCrop;
        this.world?.setPlotCrop(this.selectedPlotId, cropCode);
        this.dom.panel.querySelectorAll('[data-set-plot-crop]').forEach(b => b.classList.toggle('active', b === cropBtn));
        const plot = this.plots.find(p => p.plotId === this.selectedPlotId);
        if (plot) plot.cropCode = cropCode;
        this.createMarkers();
        this.showToast(`已将【${plot?.name || this.selectedPlotId}】独立定制为【${CROP_PROFILES[cropCode]?.label || cropCode}】`);
      }

      // Per-Plot Growth Stage Selection
      const stageBtn = event.target.closest('[data-set-plot-stage]');
      if (stageBtn) {
        const stage = stageBtn.dataset.setPlotStage;
        this.world?.setPlotStage(this.selectedPlotId, stage);
        this.dom.panel.querySelectorAll('[data-set-plot-stage]').forEach(b => b.classList.toggle('active', b === stageBtn));
        const plot = this.plots.find(p => p.plotId === this.selectedPlotId);
        if (plot) plot.stageCode = stage;
        this.showToast(`已将该地块阶段调控为【${STAGE_PROFILES[stage]?.label || stage}】`);
      }

      if (event.target.closest('[data-action-irrigate]')) {
        this.showToast('已触发该地块微喷灌电磁阀：计划灌溉 15 分钟');
      }
    });

    window.addEventListener('keydown', this.handleKeydown = event => {
      if (!this.isOpen) return;
      if (event.key === 'Escape') {
        if (this.dom.reclaimDialog?.classList.contains('open')) {
          this.dom.reclaimDialog.classList.remove('open');
        } else if (this.dom.timeDialog.classList.contains('open') || this.dom.weatherDialog.classList.contains('open')) {
          this.dom.timeDialog.classList.remove('open');
          this.dom.weatherDialog.classList.remove('open');
        } else if (this.dom.panel.classList.contains('open')) {
          this.closePanel();
        } else {
          this.close(false);
          this.onExit();
        }
      }
    });
  }

  toggleReclamationMode(forceState) {
    const isNowActive = forceState !== undefined ? forceState : !this.world?.isReclamationMode;
    this.world?.setReclamationMode(isNowActive);
    this.dom.reclaimBtn?.classList.toggle('active', isNowActive);
    this.dom.reclaimBanner?.classList.toggle('open', isNowActive);
    this.createMarkers();
    if (isNowActive) {
      this.showToast('🌾 已进入新田开垦规划模式，草地上高亮显示预留槽位');
    } else {
      this.showToast('已退出新田开垦规划模式');
    }
  }

  openReclamationWizard(slotId) {
    const slot = RECLAMATION_SLOTS.find(s => s.slotId === slotId);
    if (!slot) return;
    this.activeReclaimSlotId = slotId;

    const dialog = this.dom.reclaimDialog;
    if (!dialog) return;

    dialog.querySelector('[data-reclaim-subtitle]').textContent = `开垦槽位：${slot.name} · 规整农业网格`;
    dialog.querySelector('[data-reclaim-zone]').textContent = slot.zoneName;
    dialog.querySelector('[data-reclaim-area]').textContent = `${slot.width}m × ${slot.depth}m (~60㎡)`;
    dialog.querySelector('[data-reclaim-moisture]').textContent = `${slot.soilMoisture} (适宜作物生长)`;

    // Focus default crop
    dialog.querySelectorAll('[data-reclaim-crop]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.reclaimCrop === (slot.defaultCrop || 'corn'));
    });

    dialog.classList.add('open');
  }

  submitReclamation() {
    const slotId = this.activeReclaimSlotId;
    if (!slotId) return;

    const slot = RECLAMATION_SLOTS.find(s => s.slotId === slotId);
    const activeCropBtn = this.shell.querySelector('[data-reclaim-crop].active');
    const cropCode = activeCropBtn?.dataset.reclaimCrop || slot?.defaultCrop || 'corn';

    // Execute 3D World plot and canal construction
    const newPlot = this.world?.reclaimPlot(slotId, {
      cropCode,
      stageCode: 'seedling',
      plotName: slot?.name || '新开垦农田'
    });

    this.dom.reclaimDialog?.classList.remove('open');
    if (newPlot) {
      if (this.dom.plotCounter) {
        this.dom.plotCounter.innerHTML = `<i class="ph ph-squares-four"></i> ${this.plots.length} 块独立监测示范区`;
      }
      this.createMarkers();
      this.showToast(`🎉【${newPlot.name}】已成功开垦！已自动引水建渠并播种【${CROP_PROFILES[cropCode]?.label || cropCode}】`);

      // Fly camera to the new plot and open panel
      this.world?.animateCamera(
        { x: slot.x, y: 18, z: slot.z + 18 },
        { x: slot.x, y: 0, z: slot.z },
        900
      );
      setTimeout(() => {
        this.selectPlot(slotId);
      }, 700);
    }
  }

  createMarkers() {
    const plotsHtml = this.plots.map(plot => `
      <div class="farm-plot-marker ${plot.plotId === this.selectedPlotId ? 'active' : ''}" data-marker="${plot.plotId}">
        <div class="farm-plot-badge">
          <strong>${plot.plotId.replace('plot-', '').toUpperCase()} ${CROP_PROFILES[plot.cropCode]?.icon || ''}</strong>
          <span>${CROP_PROFILES[plot.cropCode]?.label || plot.cropName}</span>
        </div>
        ${plot.riskLevel === 'HIGH' ? '<span class="farm-warning-beacon"><i class="ph ph-warning"></i></span>' : ''}
      </div>
    `).join('');

    const slotsHtml = (this.world?.isReclamationMode ? RECLAMATION_SLOTS.filter(s => !this.plots.some(p => p.plotId === s.slotId)) : []).map(slot => `
      <div class="farm-reclaim-marker" data-reclaim-slot="${slot.slotId}">
        <div class="farm-reclaim-badge">
          <i class="ph ph-plus-circle"></i>
          <span>开垦：${slot.name.split(' ')[0]}</span>
        </div>
      </div>
    `).join('');

    this.dom.markerLayer.innerHTML = plotsHtml + slotsHtml;

    this.dom.markerLayer.querySelectorAll('.farm-plot-marker').forEach(marker => {
      marker.addEventListener('click', e => {
        e.stopPropagation();
        const plotId = marker.dataset.marker;
        this.selectPlot(plotId, { x: e.clientX, y: e.clientY });
      });
      marker.addEventListener('dblclick', e => {
        e.stopPropagation();
        const plotId = marker.dataset.marker;
        this.openSandbox(plotId);
      });
    });

    this.dom.markerLayer.querySelectorAll('.farm-reclaim-marker').forEach(marker => {
      marker.addEventListener('click', e => {
        e.stopPropagation();
        const slotId = marker.dataset.reclaimSlot;
        this.openReclamationWizard(slotId);
      });
    });
  }

  updateProjectedUi(data) {
    const markers = data.markers || data;
    const reclamationMarkers = data.reclamationMarkers || {};

    Object.entries(markers).forEach(([plotId, position]) => {
      const marker = this.dom.markerLayer?.querySelector(`[data-marker="${plotId}"]`);
      if (!marker) return;
      marker.style.setProperty('--marker-x', `${position.x}px`);
      marker.style.setProperty('--marker-y', `${position.y}px`);
      marker.classList.toggle('visible', position.visible);
      const warning = marker.querySelector('.farm-warning-beacon');
      if (warning) {
        warning.style.setProperty('--warning-x', `${position.warningX - position.x}px`);
        warning.style.setProperty('--warning-y', `${position.warningY - position.y}px`);
      }
    });

    Object.entries(reclamationMarkers).forEach(([slotId, position]) => {
      const marker = this.dom.markerLayer?.querySelector(`[data-reclaim-slot="${slotId}"]`);
      if (!marker) return;
      marker.style.setProperty('--marker-x', `${position.x}px`);
      marker.style.setProperty('--marker-y', `${position.y}px`);
      marker.classList.toggle('visible', position.visible);
    });
  }

  selectPlot(plotId, origin = { x: window.innerWidth - 30, y: window.innerHeight / 2 }) {
    this.selectedPlotId = plotId;
    this.world?.setSelectedPlot(plotId);
    this.shell?.querySelectorAll('.farm-plot-marker').forEach(m => m.classList.toggle('active', m.dataset.marker === plotId));
    this.openPanel(plotId, origin);
  }

  openPanel(plotId, origin) {
    const plot = this.plots.find(item => item.plotId === plotId) || this.plots[0];
    if (!plot) return;
    const cropCode = plot.cropCode || 'tomato';
    const crop = CROP_PROFILES[cropCode] || CROP_PROFILES.tomato;
    const stageCode = plot.stageCode || 'fruiting';
    const stage = STAGE_PROFILES[stageCode] || STAGE_PROFILES.fruiting;
    const metrics = plot.metrics || {};

    this.dom.panel.style.setProperty('--panel-origin-x', `${origin.x}px`);
    this.dom.panel.style.setProperty('--panel-origin-y', `${origin.y}px`);
    this.dom.panel.innerHTML = `
      <div class="farm-panel-head">
        <div>
          <span>${plot.plotId.replace('plot-', '').toUpperCase()} · ${crop.family}</span>
          <h2>${plot.name}</h2>
          <p>当前作物：${crop.label} (${crop.icon}) · 生长阶段：${stage.label}</p>
        </div>
        <button type="button" data-panel-close aria-label="关闭详情"><i class="ph ph-x"></i></button>
      </div>

      <div class="farm-health-row">
        <div>
          <span>作物健康度</span>
          <strong>${Math.round((plot.healthScore || 0.96) * 100)}%</strong>
        </div>
        <div>
          <span>设备状态</span>
          <strong class="online"><i class="ph ph-broadcast"></i> 在线</strong>
        </div>
        <div>
          <span>风险等级</span>
          <strong class="risk-${String(plot.riskLevel || 'LOW').toLowerCase()}">${plot.riskLevel || 'LOW'}</strong>
        </div>
      </div>

      <!-- Individual Plot Crop Customizer -->
      <section class="farm-panel-section">
        <div class="farm-section-title">
          <span>本块地作物自定义</span>
          <small>单独配置该地块作物类型</small>
        </div>
        <div class="farm-crop-grid">
          ${Object.entries(CROP_PROFILES).map(([key, item]) => `
            <button class="farm-crop-btn ${key === cropCode ? 'active' : ''}" type="button" data-set-plot-crop="${key}">
              <span class="crop-icon">${item.icon}</span>
              <span>${item.label}</span>
            </button>
          `).join('')}
        </div>
      </section>

      <!-- Individual Plot Stage Customizer -->
      <section class="farm-panel-section">
        <div class="farm-section-title">
          <span>生长阶段独立调控</span>
          <small>单独改变该地块 3D 外观</small>
        </div>
        <div class="farm-stage-track">
          ${Object.entries(STAGE_PROFILES).map(([key, item]) => `
            <button class="farm-stage-btn ${key === stageCode ? 'active' : ''}" type="button" data-set-plot-stage="${key}">
              <i></i><span>${item.label}</span>
            </button>
          `).join('')}
        </div>
      </section>

      <!-- Realtime IoT Telemetry -->
      <section class="farm-panel-section">
        <div class="farm-section-title">
          <span>实时传感器 (IoT 遥测)</span>
          <small>1秒前已刷新</small>
        </div>
        <div class="farm-metric-grid">
          ${Object.entries(metrics).map(([key, m]) => `
            <div class="farm-metric ${m.status === 'WARN' ? 'warning' : ''}">
              <span>${m.label || key}</span>
              <strong>${m.value}${m.unit || ''}</strong>
              <small>${m.status === 'WARN' ? '⚠️ ' + m.target : '正常 · ' + m.target}</small>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- 24h Trend Chart -->
      <section class="farm-panel-section">
        <div class="farm-section-title">
          <span>24小时环境时序曲线</span>
          <small>土壤/田面湿度趋势</small>
        </div>
        <canvas class="farm-chart" data-farm-chart aria-label="环境曲线"></canvas>
        <div class="farm-chart-legend">
          <span><i></i>湿度变化趋势</span>
          <strong>适宜区间 20~40%</strong>
        </div>
      </section>

      ${plot.riskLevel === 'HIGH' ? `
        <div class="farm-ai-prescription">
          <div class="farm-ai-prescription-head"><i class="ph ph-sparkle"></i><span>AgriLoop 智能处方建议</span></div>
          <p>检测到该地块土壤湿度 (16.8%) 偏低，建议立即启动该区微喷灌作业。</p>
          <div class="farm-action-btn-row">
            <button class="farm-btn-action primary" type="button" data-action-irrigate><i class="ph ph-drop"></i><span>一键启动本区微喷灌</span></button>
          </div>
        </div>
      ` : ''}

      <button class="farm-sandbox-button" type="button" data-panel-sandbox>
        <i class="ph ph-graph"></i>
        <span>进入未来风险推演与情景沙盘</span>
        <small>双击该地块也可进入</small>
      </button>
    `;

    this.dom.panel.classList.add('open');
    requestAnimationFrame(() => this.drawChart(plot));
  }

  drawChart(plot) {
    const canvas = this.dom.panel.querySelector('[data-farm-chart]');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    const width = rect.width;
    const height = rect.height;

    const base = Number(plot.metrics?.SOIL_MOISTURE?.value || 28);
    const values = Array.from({ length: 24 }, (_, index) => base + Math.sin(index * 0.48) * 3.2 + Math.cos(index * 0.22) * 1.6 + (index - 23) * 0.18);
    context.clearRect(0, 0, width, height);

    context.strokeStyle = 'rgba(16, 56, 43, 0.08)';
    context.lineWidth = 1;
    for (let row = 1; row < 4; row++) {
      context.beginPath();
      context.moveTo(0, (height / 4) * row);
      context.lineTo(width, (height / 4) * row);
      context.stroke();
    }

    const min = Math.min(...values) - 2;
    const max = Math.max(...values) + 2;

    const grad = context.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(40, 167, 109, 0.32)');
    grad.addColorStop(1, 'rgba(40, 167, 109, 0.0)');

    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / (max - min)) * (height - 16) - 8;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.closePath();
    context.fillStyle = grad;
    context.fill();

    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / (max - min)) * (height - 16) - 8;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = '#28a76d';
    context.lineWidth = 2.4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();
  }

  closePanel() {
    this.dom.panel?.classList.remove('open');
  }

  openSandbox(plotId) {
    this.onSandbox(plotId);
    this.showToast(`正在构建【${plotId.replace('plot-', '').toUpperCase()}】数字孪生情景沙盘推演...`);
  }

  startClock() {
    const tick = () => {
      const now = new Date();
      const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
      this.dom.clock.textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
      this.dom.date.textContent = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]}`;

      if (this.simulatedHour === null) {
        this.world?.updateDaylight(hours);
        if (this.dom.dockTimeVal) this.dom.dockTimeVal.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        if (this.dom.dockTimeSlider) this.dom.dockTimeSlider.value = hours;
      }
    };
    tick();
    this.clockTimer = window.setInterval(tick, 1000);
  }

  async resolveWeather() {
    const fallback = { latitude: 29.56, longitude: 106.55, label: '重庆 · 现代智慧农业生态示范园' };
    let place = fallback;

    if ('geolocation' in navigator) {
      place = await new Promise(resolve => navigator.geolocation.getCurrentPosition(
        position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, label: '当前位置 · 智慧农业站' }),
        () => resolve(fallback),
        { enableHighAccuracy: false, timeout: 3500, maximumAge: 600000 }
      ));
    }

    this.locationLabel = place.label;
    if (this.dom.location) this.dom.location.innerHTML = `<i class="ph ph-map-pin"></i> ${place.label}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,precipitation,wind_speed_10m&timezone=auto`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`weather ${response.status}`);
      const current = (await response.json()).current;

      let w = 'sunny';
      const code = current.weather_code;
      const prec = current.precipitation;
      if (code >= 65 || prec >= 7.5) w = 'heavy-rain';
      else if (code >= 63 || prec >= 2.5) w = 'moderate-rain';
      else if (code >= 51 || prec > 0) w = 'light-rain';
      else if ([3, 45, 48].includes(code)) w = 'overcast';
      else if ([1, 2].includes(code)) w = 'cloudy';

      this.applyWeather({
        weather: w,
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m / 3.6
      });
    } catch (error) {
      this.applyWeather({ weather: 'sunny', temperature: 28.4, humidity: 58, windSpeed: 2.7 });
    } finally {
      clearTimeout(timeout);
    }
  }

  applyWeather({ weather, temperature, humidity, windSpeed }) {
    this.weather = weather;
    this.temperature = Number(temperature);
    this.humidity = Math.round(Number(humidity));
    this.windSpeed = Number(windSpeed);
    this.dom.weatherLabel.textContent = WEATHER_LABELS[weather] || '晴天';
    this.dom.temperature.textContent = `${this.temperature.toFixed(1)}°C`;
    this.dom.humidity.textContent = `${this.humidity}%`;
    this.dom.windSpeed.textContent = `${this.windSpeed.toFixed(1)} m/s`;
    this.dom.weatherIcon.className = `ph ${WEATHER_ICONS[weather] || 'ph-sun'}`;
    this.shell?.querySelectorAll('[data-dock-weather]').forEach(b => b.classList.toggle('active', b.dataset.dockWeather === weather));
    this.world?.setWeather(weather);
  }

  showToast(message) {
    clearTimeout(this.toastTimer);
    this.dom.toast.textContent = message;
    this.dom.toast.classList.add('show');
    this.toastTimer = setTimeout(() => this.dom.toast?.classList.remove('show'), 2200);
  }

  close(notify = true) {
    if (!this.isOpen) return;
    this.isOpen = false;
    clearInterval(this.clockTimer);
    clearTimeout(this.toastTimer);
    window.removeEventListener('keydown', this.handleKeydown);
    this.world?.destroy();
    this.world = null;
    this.shell?.remove();
    this.shell = null;
    document.body.classList.remove('farm-monitor-open');
    if (notify) this.onExit();
  }
}
