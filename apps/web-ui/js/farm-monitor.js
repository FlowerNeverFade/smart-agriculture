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
    this.onFrame = options.onFrame || (() => {});

    this.windMaterials = [];
    this.plotMeshes = new Map();
    this.plotGlows = new Map();
    this.cropFields = new Map();
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
    this.lastPointer = null;
    this.frameCount = 0;
    this.isDestroyed = false;
    this.clickTimer = null;
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
    this.scene.fog = new THREE.FogExp2(0xcfe2d0, 0.009);

    // Wide Panoramic Camera Position (Stable, no camera jitter on mouse move!)
    this.camera = new THREE.PerspectiveCamera(48, this.host.clientWidth / Math.max(1, this.host.clientHeight), 0.1, 260);
    this.camera.position.set(0, 24, 38);
    this.camera.lookAt(0, 1.2, 0);
    this.baseCamera = this.camera.position.clone();

    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildWater();
    this.buildRoads();
    this.buildBuildings();
    this.buildPlots();
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
      uTop: { value: new THREE.Color(0x4aa4dc) },
      uHorizon: { value: new THREE.Color(0xeaf6db) },
      uSunDirection: { value: new THREE.Vector3(-0.35, 0.78, -0.5).normalize() },
      uSunColor: { value: new THREE.Color(0xfff0b5) },
      uSunStrength: { value: 1.15 }
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
          float heightMix = smoothstep(-0.05, 0.72, direction.y);
          vec3 sky = mix(uHorizon, uTop, heightMix);
          float halo = pow(max(dot(direction, normalize(uSunDirection)), 0.0), 32.0) * 0.5;
          float core = pow(max(dot(direction, normalize(uSunDirection)), 0.0), 650.0) * 1.8;
          sky += uSunColor * (halo + core) * uSunStrength;
          gl_FragColor = vec4(sky, 1.0);
        }
      `
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 22), material);
    this.scene.add(this.sky);
  }

  buildLights() {
    this.hemiLight = new THREE.HemisphereLight(0xe8f6ff, 0x486c38, 2.4);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff2cd, 4.4);
    this.sunLight.position.set(-24, 30, -18);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -38;
    this.sunLight.shadow.camera.right = 38;
    this.sunLight.shadow.camera.top = 32;
    this.sunLight.shadow.camera.bottom = -24;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 100;
    this.sunLight.shadow.bias = -0.00028;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Sun Visual Flare in Sky
    this.sunDisc = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 32, 22),
      new THREE.MeshBasicMaterial({ color: 0xfff9da, toneMapped: false })
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.85, 28, 18),
      new THREE.MeshBasicMaterial({ color: 0xffe285, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, toneMapped: false })
    );
    const glowWide = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 24, 14),
      new THREE.MeshBasicMaterial({ color: 0xffeca8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, toneMapped: false })
    );
    this.sunDisc.add(core, glow, glowWide);
    this.scene.add(this.sunDisc);
  }

  buildTerrain() {
    // Vast Main Farm Basin (100m x 80m)
    const geometry = new THREE.PlaneGeometry(100, 80, 90, 70);
    const position = geometry.attributes.position;
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index);
      const y = position.getY(index);
      const elevation = getTerrainElevation(x, -y);
      position.setZ(index, elevation - 0.25);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: 0xa4b988, roughness: 0.95, metalness: 0 });
    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.rotation.x = -Math.PI / 2;
    this.terrain.position.y = -0.2;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    // Natural Mountain Ranges at negative Z (No tree clipping!)
    const buildRidge = ({ z, heightScale, color, opacity = 1 }) => {
      const ridgeGeometry = new THREE.PlaneGeometry(110, 36, 120, 48);
      const ridgePosition = ridgeGeometry.attributes.position;
      for (let index = 0; index < ridgePosition.count; index++) {
        const x = ridgePosition.getX(index);
        const depth = ridgePosition.getY(index);
        const peaks =
          Math.exp(-((x + 36) ** 2) / 130) * 10.5 +
          Math.exp(-((x + 16) ** 2) / 95) * 13.0 +
          Math.exp(-((x - 6) ** 2) / 140) * 9.8 +
          Math.exp(-((x - 28) ** 2) / 110) * 12.5 +
          Math.exp(-((x - 46) ** 2) / 85) * 9.0;
        const depthShape = 0.55 + Math.sin((depth + 18) / 36 * Math.PI) * 0.45;
        const detail = Math.sin(x * 0.38 + depth * 0.18) * 0.55 + Math.cos(x * 0.15 - depth * 0.32) * 0.4;
        ridgePosition.setZ(index, Math.max(0, (peaks * depthShape + detail) * heightScale));
      }
      ridgeGeometry.computeVertexNormals();
      const ridgeMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.96, transparent: opacity < 1, opacity });
      this.ridgeMaterials.push(ridgeMaterial);
      const ridge = new THREE.Mesh(ridgeGeometry, ridgeMaterial);
      ridge.rotation.x = -Math.PI / 2;
      ridge.position.set(0, -0.15, z);
      ridge.receiveShadow = true;
      this.scene.add(ridge);
    };

    buildRidge({ z: -32, heightScale: 0.38, color: 0x6e9676 });
    buildRidge({ z: -48, heightScale: 0.28, color: 0x8aa5a3, opacity: 0.92 });
  }

  createWaterMaterial() {
    const uniforms = {
      uTime: { value: 0 },
      uColorDeep: { value: new THREE.Color(0x247799) },
      uColorLight: { value: new THREE.Color(0x7fd0c9) },
      uSun: { value: new THREE.Color(0xffe8a8) },
      uBrightness: { value: 1 }
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        varying float vWave;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 moved = position;
          float waveA = sin(position.x * 2.3 + uTime * 1.3) * 0.035;
          float waveB = cos(position.y * 3.5 - uTime * 0.95) * 0.026;
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
          float ripple = sin((vUv.x + vUv.y) * 36.0 + uTime * 1.9) * 0.04;
          float glint = pow(max(0.0, sin(vUv.x * 24.0 - uTime * 1.1) * cos(vUv.y * 19.0 + uTime * 0.75)), 9.0);
          vec3 color = mix(uColorDeep, uColorLight, 0.44 + vWave * 4.5 + ripple);
          color += uSun * glint * 0.32;
          gl_FragColor = vec4(color * uBrightness, 0.92);
        }
      `
    });
    material.userData.waterUniforms = uniforms;
    this.waterMaterials.push(material);
    return material;
  }

  buildWater() {
    // Retention Pond (蓄水池)
    const pond = new THREE.Mesh(new THREE.CircleGeometry(5.8, 48), this.createWaterMaterial());
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(0, -0.06, -2.5);
    pond.receiveShadow = true;
    this.scene.add(pond);

    // Canal Network
    const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x92aa6a, roughness: 0.94 });
    const addCanal = ({ width, depth, x, z, vertical = false }) => {
      const canal = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth, Math.max(4, Math.round(width * 2)), Math.max(3, Math.round(depth * 2))),
        this.createWaterMaterial()
      );
      canal.rotation.x = -Math.PI / 2;
      canal.position.set(x, -0.05, z);
      canal.receiveShadow = true;
      this.scene.add(canal);

      const sideOffset = (vertical ? width : depth) / 2 + 0.14;
      [-sideOffset, sideOffset].forEach(offset => {
        const bank = new THREE.Mesh(
          new THREE.BoxGeometry(vertical ? 0.24 : width + 0.36, 0.16, vertical ? depth + 0.36 : 0.24),
          bankMaterial
        );
        bank.position.set(x + (vertical ? offset : 0), -0.04, z + (vertical ? 0 : offset));
        bank.castShadow = true;
        bank.receiveShadow = true;
        this.scene.add(bank);
      });
    };

    addCanal({ width: 56.0, depth: 1.0, x: 0, z: 3.5 });
    addCanal({ width: 56.0, depth: 1.0, x: 0, z: 14.2 });
    addCanal({ width: 1.0, depth: 22.0, x: -14.8, z: 4.0, vertical: true });
    addCanal({ width: 1.0, depth: 22.0, x: 13.2, z: 4.0, vertical: true });
    addCanal({ width: 1.0, depth: 22.0, x: 0, z: 4.0, vertical: true });
  }

  buildRoads() {
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0xbaab78, roughness: 0.98 });
    const mainRoad = new THREE.Mesh(new THREE.BoxGeometry(58, 0.14, 1.2), roadMaterial);
    mainRoad.position.set(0, -0.06, 15.5);
    mainRoad.receiveShadow = true;
    this.scene.add(mainRoad);

    [-26.5, 26.5].forEach(x => {
      const path = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 24.0), roadMaterial);
      path.position.set(x, -0.05, 3.5);
      path.receiveShadow = true;
      this.scene.add(path);
    });
  }

  buildBuildings() {
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf4ecd2, roughness: 0.86 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xba5f3a, roughness: 0.78 });
    const frame = new THREE.MeshStandardMaterial({ color: 0xe5eee4, roughness: 0.45, metalness: 0.35 });

    // Modern Multi-Span Glass Greenhouse (智能连栋温室)
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xc4ede0,
      transmission: 0.58,
      transparent: true,
      opacity: 0.55,
      roughness: 0.16,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const greenhouse = new THREE.Group();
    const glassBody = new THREE.Mesh(new THREE.BoxGeometry(11.6, 2.2, 7.8), glass);
    glassBody.position.y = 1.1;
    glassBody.castShadow = true;
    greenhouse.add(glassBody);

    for (let offset = -5.5; offset <= 5.5; offset += 1.38) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.045, 2.9, 8.0), frame);
      rib.position.set(offset, 1.45, 0);
      rib.castShadow = true;
      greenhouse.add(rib);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.06, 0.06), frame);
    ridge.position.set(0, 2.55, 0);
    greenhouse.add(ridge);

    // Greenhouse Interior Grow Light (Glows at night)
    const growLight = new THREE.PointLight(0xffdf88, 0, 15);
    growLight.position.set(0, 1.8, 0);
    greenhouse.add(growLight);
    this.nightLights.push(growLight);

    greenhouse.position.set(-8.0, 0, -13.0);
    this.scene.add(greenhouse);

    // Weather Sensor Mast with LED
    const tower = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.08, 4.8, 8), frame);
    mast.position.y = 2.4;
    mast.castShadow = true;
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x50e396, toneMapped: false })
    );
    led.position.y = 4.85;
    this.towerLed = led;
    tower.add(mast, led);
    tower.position.set(-15.2, 0, -12.5);
    this.scene.add(tower);

    // Agricultural Barn & Logistics House
    const barn = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.2, 3.8), wallMaterial);
    body.position.y = 1.1;
    body.castShadow = true;
    body.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.5, 4), roofMaterial);
    roof.position.y = 2.85;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.78;
    roof.castShadow = true;
    barn.add(body, roof);
    barn.position.set(9.5, 0, -13.5);
    this.scene.add(barn);

    // Grain Silos
    const siloGroup = new THREE.Group();
    [-1.2, 1.2].forEach(offset => {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 3.8, 16), new THREE.MeshStandardMaterial({ color: 0xdde5e0, roughness: 0.4, metalness: 0.45 }));
      silo.position.set(offset, 1.9, 0);
      silo.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.8, 16), roofMaterial);
      cap.position.set(offset, 4.2, 0);
      siloGroup.add(silo, cap);
    });
    siloGroup.position.set(17.5, 0, -13.5);
    this.scene.add(siloGroup);

    // Gazebo Pavilion on the Pond
    const pavilion = new THREE.Group();
    const pavRoof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.0, 6), new THREE.MeshStandardMaterial({ color: 0x9a4e32, roughness: 0.8 }));
    pavRoof.position.y = 1.9;
    pavRoof.castShadow = true;
    const pavFloor = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xa48d68, roughness: 0.9 }));
    pavFloor.position.y = 0.1;
    pavilion.add(pavRoof, pavFloor);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), frame);
      pillar.position.set(Math.cos(angle) * 1.1, 0.9, Math.sin(angle) * 1.1);
      pillar.castShadow = true;
      pavilion.add(pillar);
    }
    pavilion.position.set(0, 0.0, -2.5);
    this.scene.add(pavilion);
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

  buildTrees() {
    // Trees placed strictly based on getTerrainElevation to guarantee zero clipping
    const positions = [];
    // Perimeter and mountain fringe trees
    for (let i = 0; i < 70; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (26.5 + (i % 6) * 2.2) + Math.sin(i * 3.2) * 1.5;
      const z = -20 + (i % 18) * 2.2 + Math.cos(i * 1.5) * 1.0;
      if (z > 14.0) continue;
      const y = getTerrainElevation(x, z);
      positions.push({ x, y, z, scale: 0.75 + (Math.sin(i * 4.2) + 1) * 0.25 });
    }
    // North hill forest
    for (let i = 0; i < 50; i++) {
      const x = -38 + i * 1.55;
      const z = -24.0 + Math.sin(i * 0.8) * 3.5;
      const y = getTerrainElevation(x, z);
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
      const terrainTexture = prepare(texture, 16, 12);
      this.terrain.material.map = terrainTexture;
      this.terrain.material.color.set(0xb2c39c);
      this.terrain.material.needsUpdate = true;
    }, undefined, () => {});
    loader.load('assets/textures/mountain-forest.png', texture => {
      this.ridgeMaterials.forEach((material, index) => {
        if (index === 0) {
          const ridgeTexture = prepare(texture.clone(), 3.6, 1.8);
          ridgeTexture.needsUpdate = true;
          material.map = ridgeTexture;
          material.color.set(0xb6c7a9);
          material.emissive = new THREE.Color(0x1a3220);
          material.emissiveIntensity = 0.12;
        } else {
          material.map = null;
          material.color.set(0x567979);
          material.emissive = new THREE.Color(0x12262b);
          material.emissiveIntensity = 0.08;
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
    const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, roughness: 1, depthWrite: false });
    for (let index = 0; index < 12; index++) {
      const group = new THREE.Group();
      const puffCount = 4 + (index % 3);
      for (let puff = 0; puff < puffCount; puff++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), cloudMaterial.clone());
        mesh.scale.set(1.8 + (puff % 2) * 0.8, 0.7 + (puff % 3) * 0.2, 1.1);
        mesh.position.set((puff - puffCount / 2) * 1.35, Math.sin(puff * 2.2) * 0.35, Math.cos(puff * 1.5) * 0.4);
        group.add(mesh);
      }
      group.position.set(-36 + index * 7.2, 12.5 + (index % 3) * 1.3, -46 - (index % 4) * 3.2);
      group.userData.speed = 0.18 + (index % 4) * 0.038;
      group.userData.baseY = group.position.y;
      this.clouds.push(group);
      this.scene.add(group);
    }
  }

  buildRain() {
    const count = 3500;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      positions[index * 3] = (Math.random() - 0.5) * 60;
      positions[index * 3 + 1] = Math.random() * 30;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 44;
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
    const count = 550;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const radius = 70 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45;
      positions[index * 3] = Math.cos(theta) * Math.cos(phi) * radius;
      positions[index * 3 + 1] = Math.sin(phi) * radius + 6;
      positions[index * 3 + 2] = Math.sin(theta) * Math.cos(phi) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xdfeaff, size: 0.22, transparent: true, opacity: 0, depthWrite: false }));
    this.scene.add(this.stars);
  }

  bindEvents() {
    this.handleResize = () => this.resize();
    this.handlePointerMove = event => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
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
      this.setHoveredPlot(null);
    };

    this.handleClick = event => {
      clearTimeout(this.clickTimer);
      this.clickTimer = setTimeout(() => {
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

  setHoveredPlot(plotId) {
    if (plotId === this.hoveredPlotId) return;
    this.hoveredPlotId = plotId;
    this.plotMeshes.forEach((mesh, id) => {
      mesh.material.color.copy(mesh.userData.baseColor);
      mesh.material.emissive.set(id === plotId ? 0x26491e : 0x000000);
      mesh.material.emissiveIntensity = id === plotId ? 0.38 : 0;
    });
    this.renderer.domElement.style.cursor = plotId ? 'pointer' : 'default';
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
      sunny: { clouds: 0.16, rain: false, fog: 0.005, exposure: 1.15 },
      cloudy: { clouds: 0.48, rain: false, fog: 0.009, exposure: 1.08 },
      overcast: { clouds: 0.75, rain: false, fog: 0.016, exposure: 0.94 },
      'light-rain': { clouds: 0.85, rain: true, rainOpacity: 0.45, fog: 0.019, exposure: 0.90 },
      'moderate-rain': { clouds: 0.92, rain: true, rainOpacity: 0.68, fog: 0.024, exposure: 0.82 },
      'heavy-rain': { clouds: 0.98, rain: true, rainOpacity: 0.88, fog: 0.032, exposure: 0.72 }
    }[this.weather];

    this.clouds.forEach((cloud, index) => cloud.children.forEach(mesh => {
      mesh.material.opacity = clamp(settings.clouds + (index % 3) * 0.025, 0, 0.98);
      mesh.material.color.set(this.weather === 'sunny' ? 0xffffff : this.weather === 'cloudy' ? 0xe9edf0 : 0xbfc8cc);
    }));

    this.rain.visible = settings.rain;
    this.rain.material.opacity = settings.rainOpacity || 0;
    this.scene.fog.density = settings.fog;
    this.renderer.toneMappingExposure = settings.exposure;
  }

  // INDIVIDUAL plot crop & stage updates!
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
    const dayTop = new THREE.Color(0x3f9fda);
    const dayHorizon = new THREE.Color(0xcbe8e9);
    const nightTop = new THREE.Color(0x061124);
    const nightHorizon = new THREE.Color(0x182e4e);
    const sunsetTop = new THREE.Color(0x7699c2);
    const sunsetHorizon = new THREE.Color(0xffad5f);

    this.skyUniforms.uTop.value.copy(nightTop).lerp(dayTop, daylight).lerp(sunsetTop, warm * 0.44);
    this.skyUniforms.uHorizon.value.copy(nightHorizon).lerp(dayHorizon, daylight).lerp(sunsetHorizon, warm * 0.78);
    this.skyUniforms.uSunColor.value.set(daylight > 0.5 ? 0xffefb1 : 0xff9b55);
    this.skyUniforms.uSunStrength.value = 0.18 + daylight * 0.92 + warm * 0.4;

    const sunProgress = clamp((hour - 5.8) / 13.4, 0, 1);
    const sunAngle = sunProgress * Math.PI;
    const sunX = lerp(-26, 12, sunProgress);
    const sunY = Math.max(-4, Math.sin(sunAngle) * 5.0 + 3.2 - (hour > 18 ? (hour - 18) * 6.5 : hour < 6 ? (6 - hour) * 6.5 : 0));
    const sunZ = -18;

    this.sunDisc.position.set(sunX, sunY, sunZ);
    this.sunLight.position.set(sunX, Math.max(2, 10 + Math.sin(sunAngle) * 18), -14);
    this.skyUniforms.uSunDirection.value.copy(this.sunDisc.position).normalize();
    this.sunLight.color.set(warm > 0.2 ? 0xffa25d : 0xffedc2);
    this.sunLight.intensity = 0.2 + daylight * 4.3;
    this.hemiLight.color.set(daylight > 0.2 ? 0xe6f5ff : 0x5772a1);
    this.hemiLight.groundColor.set(daylight > 0.2 ? 0x4f753c : 0x152333);
    this.hemiLight.intensity = 0.38 + daylight * 2.0;
    this.sunDisc.visible = hour >= 5.65 && hour <= 19.2;
    this.stars.material.opacity = clamp((0.34 - daylight) * 2.4, 0, 0.86);

    // Night lighting for greenhouse
    const isNight = daylight < 0.3;
    this.nightLights.forEach(light => {
      light.intensity = isNight ? 2.8 : 0;
    });
  }

  projectPlotMarkers() {
    const markers = {};
    this.plots.forEach(plot => {
      const layout = PLOT_LAYOUT[plot.plotId];
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
    this.onFrame(markers);
  }

  animate = () => {
    if (this.isDestroyed) return;
    this.animationFrame = requestAnimationFrame(this.animate);

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
        onFrame: markers => this.updateProjectedUi(markers)
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
          <span class="badge-plots"><i class="ph ph-squares-four"></i> 7 块独立监测示范区</span>
        </div>
      </header>

      <!-- Top Right Quick Plot Chips -->
      <div class="farm-top-actions">
        <nav class="farm-plot-chips" aria-label="快捷地块导航">
          ${this.plots.map(p => `
            <button class="farm-plot-chip ${p.plotId === this.selectedPlotId ? 'active' : ''} ${p.riskLevel === 'HIGH' ? 'has-warn' : ''}" 
                    type="button" data-select-plot="${p.plotId}">
              <span class="chip-dot"></span>
              <span>${p.plotId.replace('plot-', '').toUpperCase()} ${CROP_PROFILES[p.cropCode]?.icon || ''}</span>
            </button>
          `).join('')}
        </nav>
      </div>

      <!-- 2D Marker Overlay Layer -->
      <div class="farm-marker-layer" data-marker-layer></div>

      <!-- Bottom Floating Widgets -->
      <div class="farm-wind-readout"><span class="farm-live-dot"></span><span>作物动力学风场</span><strong data-wind-state>自然微风 · 移动鼠标触发作物飘扬</strong></div>
      <div class="farm-scene-hint"><i class="ph ph-mouse-left-click"></i><span>单击任意地块自定义作物与阶段 · 双击推演</span></div>

      <!-- Expanding Detail Inspection Modal (由小变大丝滑展开) -->
      <aside class="farm-detail-panel" data-detail-panel aria-live="polite"></aside>

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
      chipsNav: q('.farm-plot-chips'),
      timeDialog: q('[data-dialog="time"]'),
      weatherDialog: q('[data-dialog="weather"]'),
      timeSlider: q('[data-time-slider]'),
      sliderLabel: q('[data-slider-label]')
    };
  }

  bindUi() {
    this.dom.back.addEventListener('click', () => {
      this.close(false);
      this.onExit();
    });

    this.shell.querySelectorAll('[data-select-plot]').forEach(btn => {
      btn.addEventListener('click', () => {
        const plotId = btn.dataset.selectPlot;
        this.selectPlot(plotId);
      });
    });

    this.shell.querySelector('[data-camera-reset]').addEventListener('click', () => {
      if (this.world) {
        this.world.targetWind.set(0, 0);
        this.world.camera.position.copy(this.world.baseCamera);
      }
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
      });
    });

    // Time presets
    this.shell.querySelectorAll('[data-set-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hour = parseFloat(btn.dataset.setTime);
        this.simulatedHour = hour;
        this.world?.updateDaylight(hour);
        this.dom.sliderLabel.textContent = `${hour.toFixed(1)}:00 (模拟)`;
        this.dom.timeSlider.value = hour;
        this.dom.timeDialog.classList.remove('open');
        this.showToast(`已切换至 ${hour}:00 光影模拟`);
      });
    });

    this.dom.timeSlider.addEventListener('input', e => {
      const hour = parseFloat(e.target.value);
      this.simulatedHour = hour;
      this.world?.updateDaylight(hour);
      this.dom.sliderLabel.textContent = `${hour.toFixed(1)}:00 (模拟)`;
    });

    this.shell.querySelector('[data-reset-realtime]').addEventListener('click', () => {
      this.simulatedHour = null;
      this.dom.sliderLabel.textContent = '实时同步';
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
        this.updateTopChips();
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
        if (this.dom.timeDialog.classList.contains('open') || this.dom.weatherDialog.classList.contains('open')) {
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

  updateTopChips() {
    this.shell.querySelectorAll('[data-select-plot]').forEach(btn => {
      const id = btn.dataset.selectPlot;
      const plot = this.plots.find(p => p.plotId === id);
      btn.classList.toggle('active', id === this.selectedPlotId);
      if (plot) {
        btn.querySelector('span:last-child').textContent = `${plot.plotId.replace('plot-', '').toUpperCase()} ${CROP_PROFILES[plot.cropCode]?.icon || ''}`;
      }
    });
  }

  createMarkers() {
    this.dom.markerLayer.innerHTML = this.plots.map(plot => `
      <div class="farm-plot-marker ${plot.plotId === this.selectedPlotId ? 'active' : ''}" data-marker="${plot.plotId}">
        <div class="farm-plot-badge">
          <strong>${plot.plotId.replace('plot-', '').toUpperCase()} ${CROP_PROFILES[plot.cropCode]?.icon || ''}</strong>
          <span>${CROP_PROFILES[plot.cropCode]?.label || plot.cropName}</span>
        </div>
        ${plot.riskLevel === 'HIGH' ? '<span class="farm-warning-beacon"><i class="ph ph-warning"></i></span>' : ''}
      </div>
    `).join('');

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
  }

  updateProjectedUi(markers) {
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
  }

  selectPlot(plotId, origin = { x: window.innerWidth - 30, y: window.innerHeight / 2 }) {
    this.selectedPlotId = plotId;
    this.world?.setSelectedPlot(plotId);
    this.updateTopChips();
    this.shell.querySelectorAll('.farm-plot-marker').forEach(m => m.classList.toggle('active', m.dataset.marker === plotId));
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
