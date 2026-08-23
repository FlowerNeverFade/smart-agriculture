/**
 * AgriLoop Farmland Dynamic Digital Twin (农田动态监测)
 * Pure 3D WebGL Living Farmland World (Three.js)
 * 
 * Features:
 * - Full 3D procedural modeling (Lush mountains, glass greenhouse, water canals & pond, plots, crops, barn, weather mast)
 * - 06:00 Sunrise & 18:00 Sunset slow cinematic lighting and shadow transitions
 * - Dynamic 6-state weather engine (Sunny, Cloudy, Overcast, Light Rain, Moderate Rain, Heavy Rain)
 * - Directional wind physics reacting smoothly to mouse velocity & idle natural breeze waves
 * - Multi-crop layer switcher (Tomato, Cucumber, Rice, Corn, Auto) & growth stage progression
 * - Plot A01 pulsating red warning beacon & neon bounding frames
 * - Expanding inspection modal with real-time IoT sensors & interactive environmental curves
 * - Double-click future risk sandbox simulation HUD
 */

import * as THREE from '../vendor/three/three.module.min.js';

const WEATHER_LABELS = {
  sunny: '晴',
  cloudy: '多云',
  overcast: '阴',
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
  tomato: { label: '番茄', icon: '●', family: '茄果类 (Solanaceae)', stem: 0x3d7c42, leaf: 0x3f9b4f, leafDark: 0x24713b, fruit: 0xe95a3f, height: 1.22, spacing: 0.5 },
  cucumber: { label: '黄瓜', icon: '◆', family: '瓜类 (Cucurbitaceae)', stem: 0x3f8a47, leaf: 0x56ad55, leafDark: 0x2d7c3f, fruit: 0x7eb447, height: 1.42, spacing: 0.55 },
  rice: { label: '水稻', icon: '〽', family: '粮食类 (Poaceae)', stem: 0x8eb84f, leaf: 0xa6c95d, leafDark: 0x678c36, fruit: 0xd8bd59, height: 0.86, spacing: 0.36 },
  corn: { label: '玉米', icon: '▲', family: '粮食类 (Poaceae)', stem: 0x4c9348, leaf: 0x68ad4f, leafDark: 0x317b3d, fruit: 0xe1b84e, height: 1.68, spacing: 0.58 }
};

const STAGE_PROFILES = {
  seedling: { label: '苗期', height: 0.45, density: 0.68, fruit: 0 },
  vegetative: { label: '营养生长期', height: 0.76, density: 0.85, fruit: 0.08 },
  flowering: { label: '开花坐果期', height: 0.92, density: 0.95, fruit: 0.55 },
  fruiting: { label: '挂果采收期', height: 1.0, density: 1.0, fruit: 1.0 }
};

const PLOT_LAYOUT = {
  'plot-a01': { x: -7.18, z: 3.45, width: 7.1, depth: 7.35, rotation: -0.032, name: 'A01 号地块', defaultCrop: 'tomato', defaultStage: 'fruiting' },
  'plot-a02': { x: 0.62, z: -1.5, width: 7.75, depth: 6.15, rotation: 0.018, name: 'A02 号地块', defaultCrop: 'corn', defaultStage: 'flowering' },
  'plot-b01': { x: 4.55, z: 6.72, width: 8.35, depth: 8.55, rotation: 0.032, name: 'B01 号地块', defaultCrop: 'rice', defaultStage: 'vegetative' }
};

const DEFAULT_PLOTS = [
  {
    plotId: 'plot-a01', name: 'A01 号地块', cropCode: 'tomato', cropName: '番茄', stageCode: 'fruiting', stageLabel: '挂果采收期',
    riskLevel: 'HIGH', healthScore: 0.96,
    metrics: {
      SOIL_MOISTURE: { label: '土壤湿度', value: 16.8, unit: '%', status: 'WARN', target: '20~40%' },
      AIR_TEMPERATURE: { label: '空气温度', value: 26.4, unit: '°C', status: 'NORMAL', target: '20~30°C' },
      LIGHT: { label: '光照强度', value: 42500, unit: 'lux', status: 'NORMAL', target: '30k~55k lux' },
      CO2: { label: 'CO₂ 浓度', value: 680, unit: 'ppm', status: 'NORMAL', target: '500~800 ppm' },
      SOIL_EC: { label: '土壤 EC 值', value: 1.4, unit: 'mS/cm', status: 'NORMAL', target: '1.0~2.2 mS/cm' },
      NPK_RATIO: { label: '氮磷钾肥力', value: '180:95:210', unit: 'mg/kg', status: 'NORMAL', target: '均衡充足' }
    }
  },
  {
    plotId: 'plot-a02', name: 'A02 号地块', cropCode: 'corn', cropName: '玉米', stageCode: 'flowering', stageLabel: '开花坐果期',
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
    plotId: 'plot-b01', name: 'B01 号地块', cropCode: 'rice', cropName: '水稻', stageCode: 'vegetative', stageLabel: '分蘖生长期',
    riskLevel: 'LOW', healthScore: 0.99,
    metrics: {
      SOIL_MOISTURE: { label: '土壤湿度', value: 34.2, unit: '%', status: 'NORMAL', target: '30~50%' },
      AIR_TEMPERATURE: { label: '空气温度', value: 25.1, unit: '°C', status: 'NORMAL', target: '20~30°C' },
      LIGHT: { label: '光照强度', value: 39500, unit: 'lux', status: 'NORMAL', target: '25k~50k lux' },
      CO2: { label: 'CO₂ 浓度', value: 650, unit: 'ppm', status: 'NORMAL', target: '500~800 ppm' },
      SOIL_EC: { label: '土壤 EC 值', value: 1.3, unit: 'mS/cm', status: 'NORMAL', target: '0.8~1.8 mS/cm' },
      NPK_RATIO: { label: '氮磷钾肥力', value: '175:88:190', unit: 'mg/kg', status: 'NORMAL', target: '均衡充足' }
    }
  }
];

const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = v => v * v * (3 - 2 * v);
const smoothstep = (min, max, val) => {
  const x = Math.max(0, Math.min(1, (val - min) / (max - min)));
  return x * x * (3 - 2 * x);
};

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

function createSwayMaterial(color, roughness = 0.8) {
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
        float farmWave = sin(uFarmTime * 1.55 + aPhase + farmInstance.x * 0.43 + farmInstance.z * 0.36);
        float farmLeafFlutter = sin(uFarmTime * 4.3 + aPhase * 1.8 + position.y * 5.2);
        float farmWind = length(uWindVector);
        transformed.x += farmFlex * (farmWave * uBreeze + uWindVector.x * 0.11 + farmLeafFlutter * farmWind * 0.02);
        transformed.z += farmFlex * (cos(uFarmTime * 1.15 + aPhase) * uBreeze * 0.55 + uWindVector.y * 0.11);
      `);
    material.userData.windUniforms = shader.uniforms;
  };
  material.customProgramCacheKey = () => 'agriloop-crop-sway-v4';
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
  geometry.scale(0.19, 0.026, 0.092);
  geometry.rotateY(yaw);
  geometry.rotateZ(side * 0.42);
  geometry.translate(side * 0.15, height * level, 0);
  return createFlexAttribute(geometry);
}

function getDayPhase(hour) {
  if (hour < 5.8 || hour >= 19.3) return { phase: 'night', daylight: 0.05, warm: 0 };
  if (hour < 6.8) {
    const p = smoothstep(5.8, 6.8, hour);
    return { phase: 'sunrise', daylight: 0.05 + p * 0.95, warm: Math.sin(p * Math.PI) * 0.85 };
  }
  if (hour < 17.8) return { phase: 'day', daylight: 1.0, warm: 0 };
  if (hour < 18.9) {
    const p = smoothstep(17.8, 18.9, hour);
    return { phase: 'sunset', daylight: 1.0 - p * 0.95, warm: Math.sin(p * Math.PI) * 0.95 };
  }
  const p = smoothstep(18.9, 19.3, hour);
  return { phase: 'dusk', daylight: 0.15 - p * 0.1, warm: 0.3 * (1 - p) };
}

class CropField {
  constructor(scene, plot, layout, windMaterials) {
    this.scene = scene;
    this.plot = plot;
    this.layout = layout;
    this.windMaterials = windMaterials;
    this.group = new THREE.Group();
    this.group.position.set(layout.x, 0.1, layout.z);
    this.group.rotation.y = layout.rotation;
    scene.add(this.group);
    this.build(plot.cropCode || 'tomato', plot.stageCode || 'fruiting');
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
    const columns = Math.max(5, Math.floor((this.layout.width - 0.65) / spacing));
    const rows = Math.max(4, Math.floor((this.layout.depth - 0.58) / spacing));
    const count = columns * rows;
    const transforms = [];
    const dummy = new THREE.Object3D();

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const seed = row * columns + col;
        transforms.push({
          x: (col / Math.max(1, columns - 1) - 0.5) * (this.layout.width - 0.65) + Math.sin(seed * 9.17) * 0.055,
          z: (row / Math.max(1, rows - 1) - 0.5) * (this.layout.depth - 0.62) + Math.cos(seed * 5.63) * 0.045,
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

    const stemRadius = cropCode === 'corn' ? 0.058 : cropCode === 'rice' ? 0.024 : 0.036;
    const stemGeometry = new THREE.CylinderGeometry(stemRadius * 0.72, stemRadius, plantHeight, 6, 4);
    stemGeometry.translate(0, plantHeight / 2, 0);
    createFlexAttribute(stemGeometry);
    addInstances(stemGeometry, createSwayMaterial(crop.stem));

    const leftLeaf = makeLeafGeometry(plantHeight, -1, 0.52, -0.34);
    const rightLeaf = makeLeafGeometry(plantHeight * 1.06, 1, 0.6, 0.28);
    const lowerLeaf = makeLeafGeometry(plantHeight * 0.92, 1, 0.37, -0.62);
    const upperLeaf = makeLeafGeometry(plantHeight * 1.04, -1, 0.76, 0.58);
    const leaves = [leftLeaf, rightLeaf, lowerLeaf, upperLeaf];
    if (cropCode === 'corn') leaves.forEach(leaf => leaf.scale(1.65, 0.84, 0.68));
    else if (cropCode === 'rice') leaves.forEach((leaf, index) => leaf.scale(0.42, index % 2 ? 1.18 : 1.34, 0.32));
    else if (cropCode === 'cucumber') leaves.forEach(leaf => leaf.scale(1.22, 1.05, 1.22));

    addInstances(leftLeaf, createSwayMaterial(crop.leaf, 0.9));
    addInstances(rightLeaf, createSwayMaterial(crop.leafDark, 0.88));
    addInstances(lowerLeaf, createSwayMaterial(crop.leafDark, 0.9));
    addInstances(upperLeaf, createSwayMaterial(crop.leaf, 0.87));

    if (stage.fruit > 0) {
      let fruitGeometry;
      if (cropCode === 'tomato') {
        fruitGeometry = new THREE.SphereGeometry(0.08 + stage.fruit * 0.025, 10, 8);
        fruitGeometry.translate(0.12, plantHeight * 0.66, 0.05);
      } else if (cropCode === 'cucumber') {
        fruitGeometry = new THREE.CylinderGeometry(0.045, 0.055, 0.3, 7);
        fruitGeometry.rotateZ(0.28);
        fruitGeometry.translate(0.14, plantHeight * 0.63, 0.05);
      } else if (cropCode === 'rice') {
        fruitGeometry = new THREE.SphereGeometry(0.055, 6, 4);
        fruitGeometry.scale(0.72, 2.8, 0.72);
        fruitGeometry.translate(0.03, plantHeight * 0.94, 0);
      } else {
        fruitGeometry = new THREE.SphereGeometry(0.09, 7, 5);
        fruitGeometry.scale(0.8, 2.45, 0.8);
        fruitGeometry.translate(0.12, plantHeight * 0.68, 0);
      }
      createFlexAttribute(fruitGeometry);
      addInstances(fruitGeometry, createSwayMaterial(crop.fruit, 0.72), dummyObject => dummyObject.scale.multiplyScalar(0.55 + stage.fruit * 0.45));
    }
  }

  setCrop(cropCode, stageCode = this.stageCode) {
    if (cropCode === this.cropCode && stageCode === this.stageCode) return;
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

    this.pointer = new THREE.Vector2(10, 10);
    this.pointerTarget = new THREE.Vector2(0, 0);
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
    this.scene.fog = new THREE.FogExp2(0xcfe3d2, 0.011);

    this.camera = new THREE.PerspectiveCamera(46, this.host.clientWidth / Math.max(1, this.host.clientHeight), 0.1, 200);
    this.camera.position.set(0, 13.2, 24.2);
    this.camera.lookAt(0, 1.4, 1.15);
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
      uTop: { value: new THREE.Color(0x56aee2) },
      uHorizon: { value: new THREE.Color(0xeaf7dc) },
      uSunDirection: { value: new THREE.Vector3(-0.4, 0.75, -0.5).normalize() },
      uSunColor: { value: new THREE.Color(0xfff0b5) },
      uSunStrength: { value: 1.1 }
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
          float heightMix = smoothstep(-0.06, 0.68, direction.y);
          vec3 sky = mix(uHorizon, uTop, heightMix);
          float halo = pow(max(dot(direction, normalize(uSunDirection)), 0.0), 32.0) * 0.48;
          float core = pow(max(dot(direction, normalize(uSunDirection)), 0.0), 650.0) * 1.6;
          sky += uSunColor * (halo + core) * uSunStrength;
          gl_FragColor = vec4(sky, 1.0);
        }
      `
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(95, 32, 20), material);
    this.scene.add(this.sky);
  }

  buildLights() {
    this.hemiLight = new THREE.HemisphereLight(0xe8f6ff, 0x486c38, 2.3);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff2cd, 4.3);
    this.sunLight.position.set(-18, 23, -14);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -26;
    this.sunLight.shadow.camera.right = 26;
    this.sunLight.shadow.camera.top = 23;
    this.sunLight.shadow.camera.bottom = -17;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 70;
    this.sunLight.shadow.bias = -0.00028;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Sun Visual Flare
    this.sunDisc = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 32, 22),
      new THREE.MeshBasicMaterial({ color: 0xfff9da, toneMapped: false })
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 28, 18),
      new THREE.MeshBasicMaterial({ color: 0xffe285, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, toneMapped: false })
    );
    const glowWide = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 24, 14),
      new THREE.MeshBasicMaterial({ color: 0xffeca8, transparent: true, opacity: 0.065, blending: THREE.AdditiveBlending, toneMapped: false })
    );
    this.sunDisc.add(core, glow, glowWide);
    this.scene.add(this.sunDisc);
  }

  buildTerrain() {
    const geometry = new THREE.PlaneGeometry(76, 54, 76, 54);
    const position = geometry.attributes.position;
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index);
      const y = position.getY(index);
      const edge = clamp((Math.abs(x) - 18) / 16, 0, 1) + clamp((-y - 13) / 14, 0, 1);
      const relief = edge * (0.85 + Math.sin(x * 0.24) * 0.28 + Math.cos(y * 0.27) * 0.24);
      position.setZ(index, relief - 0.38);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: 0xa6b88c, roughness: 0.95, metalness: 0 });
    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.rotation.x = -Math.PI / 2;
    this.terrain.position.y = -0.3;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    const buildRidge = ({ z, heightScale, color, opacity = 1 }) => {
      const ridgeGeometry = new THREE.PlaneGeometry(88, 28, 116, 40);
      const ridgePosition = ridgeGeometry.attributes.position;
      for (let index = 0; index < ridgePosition.count; index++) {
        const x = ridgePosition.getX(index);
        const depth = ridgePosition.getY(index);
        const peaks =
          Math.exp(-((x + 29) ** 2) / 110) * 8.8 +
          Math.exp(-((x + 13) ** 2) / 82) * 11.0 +
          Math.exp(-((x - 4) ** 2) / 126) * 8.2 +
          Math.exp(-((x - 22) ** 2) / 94) * 10.6 +
          Math.exp(-((x - 36) ** 2) / 72) * 7.5;
        const depthShape = 0.58 + Math.sin((depth + 14) / 28 * Math.PI) * 0.42;
        const detail = Math.sin(x * 0.42 + depth * 0.21) * 0.48 + Math.cos(x * 0.17 - depth * 0.36) * 0.34;
        ridgePosition.setZ(index, Math.max(0, (peaks * depthShape + detail) * heightScale));
      }
      ridgeGeometry.computeVertexNormals();
      const ridgeMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.96, transparent: opacity < 1, opacity });
      this.ridgeMaterials.push(ridgeMaterial);
      const ridge = new THREE.Mesh(ridgeGeometry, ridgeMaterial);
      ridge.rotation.x = -Math.PI / 2;
      ridge.position.set(0, -0.28, z);
      ridge.receiveShadow = true;
      this.scene.add(ridge);
    };

    buildRidge({ z: -25, heightScale: 0.34, color: 0x6e9676 });
    buildRidge({ z: -39, heightScale: 0.24, color: 0x8aa5a3, opacity: 0.92 });
  }

  createWaterMaterial() {
    const uniforms = {
      uTime: { value: 0 },
      uColorDeep: { value: new THREE.Color(0x277a9e) },
      uColorLight: { value: new THREE.Color(0x84d2cb) },
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
          float waveA = sin(position.x * 2.3 + uTime * 1.3) * 0.038;
          float waveB = cos(position.y * 3.5 - uTime * 0.95) * 0.028;
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
    const pond = new THREE.Mesh(new THREE.CircleGeometry(5.3, 48), this.createWaterMaterial());
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(4.8, -0.09, -7.2);
    pond.receiveShadow = true;
    this.scene.add(pond);

    const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x96ad6e, roughness: 0.94 });
    const addCanal = ({ width, depth, x, z, vertical = false }) => {
      const canal = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth, Math.max(4, Math.round(width * 2)), Math.max(3, Math.round(depth * 2))),
        this.createWaterMaterial()
      );
      canal.rotation.x = -Math.PI / 2;
      canal.position.set(x, -0.06, z);
      canal.receiveShadow = true;
      this.scene.add(canal);

      const sideOffset = (vertical ? width : depth) / 2 + 0.12;
      [-sideOffset, sideOffset].forEach(offset => {
        const bank = new THREE.Mesh(
          new THREE.BoxGeometry(vertical ? 0.22 : width + 0.34, 0.16, vertical ? depth + 0.34 : 0.22),
          bankMaterial
        );
        bank.position.set(x + (vertical ? offset : 0), -0.05, z + (vertical ? 0 : offset));
        bank.castShadow = true;
        bank.receiveShadow = true;
        this.scene.add(bank);
      });
    };

    addCanal({ width: 25.0, depth: 0.9, x: -1.8, z: 1.88 });
    addCanal({ width: 28.0, depth: 0.88, x: 0.5, z: 11.55 });
    addCanal({ width: 0.85, depth: 15.8, x: -3.48, z: 4.1, vertical: true });
    addCanal({ width: 0.85, depth: 15.6, x: 8.95, z: 4.15, vertical: true });
  }

  buildRoads() {
    const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xbca771, roughness: 0.98 });
    const mainPath = new THREE.Mesh(new THREE.BoxGeometry(32, 0.12, 1.05), pathMaterial);
    mainPath.position.set(0, -0.07, 12.6);
    mainPath.receiveShadow = true;
    this.scene.add(mainPath);

    [-11.25, 11.25].forEach(x => {
      const path = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.12, 17.8), pathMaterial);
      path.position.set(x, -0.06, 3.75);
      path.receiveShadow = true;
      this.scene.add(path);
    });
  }

  buildBuildings() {
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf2e8cb, roughness: 0.86 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xba623f, roughness: 0.78 });

    // Barn
    const barn = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.6, 2.7), wallMaterial);
    body.position.y = 0.8;
    body.castShadow = true;
    body.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.18, 4), roofMaterial);
    roof.position.y = 2.0;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.76;
    roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x6e7f59 }));
    door.position.set(0, 0.55, 1.38);
    barn.add(body, roof, door);
    barn.position.set(-11.2, 0, -6.2);
    barn.rotation.y = 0.1;
    this.scene.add(barn);

    // Greenhouse
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xc4ede0,
      transmission: 0.55,
      transparent: true,
      opacity: 0.52,
      roughness: 0.18,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const frame = new THREE.MeshStandardMaterial({ color: 0xe5eee4, roughness: 0.45, metalness: 0.35 });
    const greenhouse = new THREE.Group();
    const glassBody = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.38, 3.1), glass);
    glassBody.position.y = 0.72;
    glassBody.castShadow = true;
    greenhouse.add(glassBody);

    for (let offset = -2.1; offset <= 2.1; offset += 1.05) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.038, 2.1, 3.25), frame);
      rib.position.set(offset, 0.98, 0);
      rib.castShadow = true;
      greenhouse.add(rib);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.05, 0.05), frame);
    ridge.position.set(0, 1.82, 0);
    greenhouse.add(ridge);
    greenhouse.position.set(-5.4, 0, -7.1);
    this.scene.add(greenhouse);

    // Weather Sensor Mast with LED
    const tower = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 4.4, 8), frame);
    mast.position.y = 2.2;
    mast.castShadow = true;
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x50e396, toneMapped: false })
    );
    led.position.y = 4.45;
    this.towerLed = led;
    tower.add(mast, led);
    tower.position.set(-8.8, 0, -6.6);
    this.scene.add(tower);

    // Silo
    const silo = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.64, 2.45, 14), new THREE.MeshStandardMaterial({ color: 0xd9e1dc, roughness: 0.4, metalness: 0.5 }));
    tank.position.y = 1.22;
    tank.castShadow = true;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.52, 14), roofMaterial);
    cap.position.y = 2.7;
    silo.add(tank, cap);
    silo.position.set(-14, 0, -4.8);
    this.scene.add(silo);
  }

  buildPlots() {
    const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x6a482c, roughness: 0.98 });
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xb59662, roughness: 0.88 });
    const furrowMaterial = new THREE.MeshStandardMaterial({ color: 0x4c3523, roughness: 1.0 });

    this.plots.forEach((plot, index) => {
      const layout = PLOT_LAYOUT[plot.plotId] || Object.values(PLOT_LAYOUT)[index % 3];
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
        [layout.width + 0.15, 0.11, 0.12, 0, -layout.depth / 2],
        [layout.width + 0.15, 0.11, 0.12, 0, layout.depth / 2],
        [0.12, 0.11, layout.depth, -layout.width / 2, 0],
        [0.12, 0.11, layout.depth, layout.width / 2, 0]
      ].forEach(([w, h, d, x, z]) => {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeMaterial);
        edge.position.set(x, 0, z);
        edge.castShadow = true;
        edgeGroup.add(edge);
      });

      const rowCount = 8;
      for (let row = 0; row < rowCount; row++) {
        const furrow = new THREE.Mesh(new THREE.BoxGeometry(layout.width - 0.32, 0.045, 0.13), furrowMaterial);
        furrow.position.set(0, 0.08, (row / (rowCount - 1) - 0.5) * (layout.depth - 0.55));
        furrow.receiveShadow = true;
        edgeGroup.add(furrow);
      }
      this.scene.add(edgeGroup);

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

      const field = new CropField(this.scene, plot, layout, this.windMaterials);
      this.cropFields.set(plot.plotId, field);
      if (plot.plotId !== 'plot-a01') this.buildTrellis(layout, plot.plotId === 'plot-b01' ? 1.42 : 1.24);
    });
  }

  buildTrellis(layout, height) {
    const group = new THREE.Group();
    group.position.set(layout.x, 0.08, layout.z);
    group.rotation.y = layout.rotation;
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x827057, roughness: 0.86 });
    const wireMaterial = new THREE.MeshStandardMaterial({ color: 0x73866f, roughness: 0.62, metalness: 0.22 });
    const columns = 8;
    for (let column = 0; column < columns; column++) {
      const x = (column / (columns - 1) - 0.5) * (layout.width - 0.48);
      [-layout.depth * 0.42, layout.depth * 0.42].forEach(z => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.035, height, 8), postMaterial);
        post.position.set(x, height / 2, z);
        post.castShadow = true;
        group.add(post);
      });
      const crossWire = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, layout.depth * 0.84, 6), wireMaterial);
      crossWire.position.set(x, height * 0.82, 0);
      crossWire.rotation.x = Math.PI / 2;
      group.add(crossWire);
    }
    [-layout.depth * 0.42, 0, layout.depth * 0.42].forEach((z, index) => {
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, layout.width - 0.45, 6), wireMaterial);
      line.position.set(0, height * (0.52 + index * 0.15), z);
      line.rotation.z = Math.PI / 2;
      group.add(line);
    });
    this.scene.add(group);
  }

  buildTrees() {
    const positions = [];
    for (let index = 0; index < 90; index++) {
      const side = index % 2 === 0 ? -1 : 1;
      const x = side * (13.8 + (index % 8) * 1.45) + Math.sin(index * 2.8) * 1.2;
      const z = -13 + (index % 15) * 1.35 + Math.cos(index * 1.3) * 0.7;
      if (z > 7.5) continue;
      positions.push({ x, z, scale: 0.7 + (Math.sin(index * 4.2) + 1) * 0.22 });
    }
    for (let index = 0; index < 45; index++) {
      positions.push({ x: -20 + index * 0.94, z: -12.3 + Math.sin(index * 0.8) * 1.05, scale: 0.68 + (index % 5) * 0.07 });
    }
    const trunkGeometry = new THREE.CylinderGeometry(0.085, 0.145, 1.5, 10, 3);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x71543b, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, positions.length);
    const dummy = new THREE.Object3D();
    positions.forEach((item, index) => {
      dummy.position.set(item.x, 0.49 * item.scale, item.z);
      dummy.scale.set(item.scale, item.scale, item.scale);
      dummy.rotation.y = index * 1.93;
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
    });
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    this.scene.add(trunks);

    const crownSpecs = [
      { x: -0.28, y: 1.45, z: 0.02, sx: 0.88, sy: 1.04, sz: 0.88, color: 0x3b8648 },
      { x: 0.28, y: 1.5, z: 0.08, sx: 0.86, sy: 1.08, sz: 0.84, color: 0x438f4d },
      { x: 0.02, y: 1.82, z: -0.08, sx: 0.94, sy: 1.12, sz: 0.92, color: 0x4a9854 }
    ];
    crownSpecs.forEach((spec, crownIndex) => {
      const crownGeometry = new THREE.SphereGeometry(0.68, 12, 9);
      crownGeometry.scale(spec.sx, spec.sy, spec.sz);
      crownGeometry.translate(spec.x, spec.y, spec.z);
      createFlexAttribute(crownGeometry);
      attachInstancePhases(crownGeometry, positions.length, crownIndex * 1.37);
      const crownMaterial = createSwayMaterial(spec.color, 0.96);
      this.crownMaterials.push(crownMaterial);
      const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, positions.length);
      positions.forEach((item, index) => {
        dummy.position.set(item.x, 0, item.z);
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
      const terrainTexture = prepare(texture, 13, 9);
      this.terrain.material.map = terrainTexture;
      this.terrain.material.color.set(0xb5c49e);
      this.terrain.material.needsUpdate = true;
    }, undefined, () => {});
    loader.load('assets/textures/mountain-forest.png', texture => {
      this.ridgeMaterials.forEach((material, index) => {
        if (index === 0) {
          const ridgeTexture = prepare(texture.clone(), 3.2, 1.7);
          ridgeTexture.needsUpdate = true;
          material.map = ridgeTexture;
          material.color.set(0xb8c9ab);
          material.emissive = new THREE.Color(0x1c3422);
          material.emissiveIntensity = 0.12;
        } else {
          material.map = null;
          material.color.set(0x587b7b);
          material.emissive = new THREE.Color(0x14282d);
          material.emissiveIntensity = 0.08;
        }
        material.needsUpdate = true;
      });
      this.crownMaterials.forEach((material, index) => {
        const canopyTexture = prepare(texture.clone(), 1.2 + index * 0.12, 1.2 + index * 0.12);
        canopyTexture.needsUpdate = true;
        material.map = canopyTexture;
        material.color.set(index === 2 ? 0xe0efd5 : 0xd3e7c8);
        material.needsUpdate = true;
      });
    }, undefined, () => {});
    loader.load('assets/textures/tilled-soil.png', texture => {
      this.soilMaterials.forEach((material, index) => {
        const soilTexture = prepare(texture.clone(), 4 + index * 0.35, 3.2);
        soilTexture.needsUpdate = true;
        material.map = soilTexture;
        material.color.set(0x9a7658);
        material.needsUpdate = true;
      });
    }, undefined, () => {});
  }

  buildClouds() {
    const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.68, roughness: 1, depthWrite: false });
    for (let index = 0; index < 10; index++) {
      const group = new THREE.Group();
      const puffCount = 4 + (index % 3);
      for (let puff = 0; puff < puffCount; puff++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMaterial.clone());
        mesh.scale.set(1.7 + (puff % 2) * 0.8, 0.65 + (puff % 3) * 0.18, 1.05);
        mesh.position.set((puff - puffCount / 2) * 1.25, Math.sin(puff * 2.2) * 0.3, Math.cos(puff * 1.5) * 0.38);
        group.add(mesh);
      }
      group.position.set(-29 + index * 6.4, 9.2 + (index % 3) * 1.22, -42 - (index % 4) * 2.8);
      group.userData.speed = 0.16 + (index % 4) * 0.035;
      group.userData.baseY = group.position.y;
      this.clouds.push(group);
      this.scene.add(group);
    }
  }

  buildRain() {
    const count = 3000;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      positions[index * 3] = (Math.random() - 0.5) * 48;
      positions[index * 3 + 1] = Math.random() * 26;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 32;
      speeds[index] = 16 + Math.random() * 12;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xc8e8ff, size: 0.075, transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.Points(geometry, material);
    this.rain.userData.speeds = speeds;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  buildStars() {
    const count = 480;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const radius = 55 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.43;
      positions[index * 3] = Math.cos(theta) * Math.cos(phi) * radius;
      positions[index * 3 + 1] = Math.sin(phi) * radius + 4;
      positions[index * 3 + 2] = Math.sin(theta) * Math.cos(phi) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xdfeaff, size: 0.18, transparent: true, opacity: 0, depthWrite: false }));
    this.scene.add(this.stars);
  }

  bindEvents() {
    this.handleResize = () => this.resize();
    this.handlePointerMove = event => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      this.pointerTarget.set(this.pointer.x, this.pointer.y);
      const now = performance.now();
      if (this.lastPointer) {
        const elapsed = Math.max(8, now - this.lastPointer.time);
        const dx = event.clientX - this.lastPointer.x;
        const dy = event.clientY - this.lastPointer.y;
        const gain = clamp(24 / elapsed, 0.4, 1.8);
        this.targetWind.x = clamp(this.targetWind.x + dx * 0.025 * gain, -3.2, 3.2);
        this.targetWind.y = clamp(this.targetWind.y - dy * 0.025 * gain, -3.2, 3.2);
      }
      this.lastPointer = { x: event.clientX, y: event.clientY, time: now };
    };

    this.handlePointerLeave = () => {
      this.pointer.set(10, 10);
      this.pointerTarget.set(0, 0);
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
      sunny: { clouds: 0.16, rain: false, fog: 0.006, exposure: 1.15 },
      cloudy: { clouds: 0.48, rain: false, fog: 0.011, exposure: 1.08 },
      overcast: { clouds: 0.75, rain: false, fog: 0.018, exposure: 0.94 },
      'light-rain': { clouds: 0.85, rain: true, rainOpacity: 0.45, fog: 0.021, exposure: 0.90 },
      'moderate-rain': { clouds: 0.92, rain: true, rainOpacity: 0.68, fog: 0.026, exposure: 0.82 },
      'heavy-rain': { clouds: 0.98, rain: true, rainOpacity: 0.88, fog: 0.034, exposure: 0.72 }
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

  setCropOverride(cropCode = null) {
    this.plots.forEach(plot => {
      const field = this.cropFields.get(plot.plotId);
      field?.setCrop(cropCode || plot.cropCode || 'tomato', plot.stageCode || 'vegetative');
    });
  }

  setSelectedPlot(plotId) {
    this.plotGlows.forEach((group, id) => { group.visible = id === plotId; });
  }

  setPlotStage(plotId, stageCode) {
    const plot = this.plots.find(p => p.plotId === plotId);
    if (plot) plot.stageCode = stageCode;
    const field = this.cropFields.get(plotId);
    field?.build(plot?.cropCode || 'tomato', stageCode);
  }

  updateDaylight(hour) {
    const day = getDayPhase(hour);
    const daylight = day.daylight;
    const warm = day.warm;
    const dayTop = new THREE.Color(0x3f9fda);
    const dayHorizon = new THREE.Color(0xcbe8e9);
    const nightTop = new THREE.Color(0x071328);
    const nightHorizon = new THREE.Color(0x1a3152);
    const sunsetTop = new THREE.Color(0x789bc5);
    const sunsetHorizon = new THREE.Color(0xffae62);

    this.skyUniforms.uTop.value.copy(nightTop).lerp(dayTop, daylight).lerp(sunsetTop, warm * 0.44);
    this.skyUniforms.uHorizon.value.copy(nightHorizon).lerp(dayHorizon, daylight).lerp(sunsetHorizon, warm * 0.78);
    this.skyUniforms.uSunColor.value.set(daylight > 0.5 ? 0xffefb1 : 0xff9b55);
    this.skyUniforms.uSunStrength.value = 0.18 + daylight * 0.9 + warm * 0.38;

    const sunProgress = clamp((hour - 5.8) / 13.4, 0, 1);
    const sunAngle = sunProgress * Math.PI;
    const sunX = lerp(-20, 8, sunProgress);
    const sunY = Math.max(-4, Math.sin(sunAngle) * 4.2 + 2.75 - (hour > 18 ? (hour - 18) * 6.5 : hour < 6 ? (6 - hour) * 6.5 : 0));
    const sunZ = -15;

    this.sunDisc.position.set(sunX, sunY, sunZ);
    this.sunLight.position.set(sunX, Math.max(2, 8 + Math.sin(sunAngle) * 16), -12);
    this.skyUniforms.uSunDirection.value.copy(this.sunDisc.position).normalize();
    this.sunLight.color.set(warm > 0.2 ? 0xffa25d : 0xffedc2);
    this.sunLight.intensity = 0.2 + daylight * 4.2;
    this.hemiLight.color.set(daylight > 0.2 ? 0xe6f5ff : 0x5772a1);
    this.hemiLight.groundColor.set(daylight > 0.2 ? 0x4f753c : 0x152333);
    this.hemiLight.intensity = 0.38 + daylight * 1.95;
    this.sunDisc.visible = hour >= 5.65 && hour <= 19.2;
    this.stars.material.opacity = clamp((0.34 - daylight) * 2.4, 0, 0.84);
  }

  projectPlotMarkers() {
    const markers = {};
    this.plots.forEach(plot => {
      const layout = PLOT_LAYOUT[plot.plotId];
      if (!layout) return;
      const profile = CROP_PROFILES[this.cropFields.get(plot.plotId)?.cropCode || plot.cropCode] || CROP_PROFILES.tomato;
      const stage = STAGE_PROFILES[plot.stageCode] || STAGE_PROFILES.vegetative;
      const warningPoint = new THREE.Vector3(layout.x, 0.65 + profile.height * stage.height, layout.z);
      const labelPoint = new THREE.Vector3(layout.x - layout.width * 0.36, 0.28, layout.z + layout.depth * 0.42);
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
      if (cloud.position.x > 36) cloud.position.x = -36;
      cloud.position.y = cloud.userData.baseY + Math.sin(elapsed * 0.2 + index) * 0.28;
    });

    if (this.rain.visible) {
      const positions = this.rain.geometry.attributes.position;
      const speeds = this.rain.userData.speeds;
      for (let index = 0; index < positions.count; index++) {
        let y = positions.getY(index) - speeds[index] * 0.016;
        let x = positions.getX(index) + this.currentWind.x * 0.014;
        if (y < -0.2) {
          y = 18 + Math.random() * 6;
          x = (Math.random() - 0.5) * 48;
        }
        positions.setXY(index, x, y);
      }
      positions.needsUpdate = true;
    }

    this.camera.position.x = lerp(this.camera.position.x, this.baseCamera.x + this.pointerTarget.x * 0.85, 0.028);
    this.camera.position.y = lerp(this.camera.position.y, this.baseCamera.y + this.pointerTarget.y * 0.32, 0.028);
    this.camera.lookAt(this.pointerTarget.x * 0.3, 1.4, 1.15 - this.pointerTarget.y * 0.15);

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
    this.cropOverride = null;
    this.weather = 'sunny';
    this.temperature = 28.4;
    this.humidity = 58;
    this.windSpeed = 2.7;
    this.locationLabel = '重庆 · 智慧农业示范区';
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
            <span data-weather-label>晴</span>
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
          <button type="button" data-layer-action title="图层管理"><i class="ph ph-stack"></i><span>图层管理</span></button>
          <button type="button" data-camera-reset title="视角复位"><i class="ph ph-crosshair"></i><span>视角复位</span></button>
        </div>
      </aside>

      <!-- Title Lockup -->
      <header class="farm-title-lockup">
        <p>AGRILOOP · DIGITAL TWIN</p>
        <h1>农田动态监测</h1>
        <span data-location-label><i class="ph ph-map-pin"></i> 重庆 · 智慧农业示范区</span>
      </header>

      <!-- Top Right Crop Switcher -->
      <nav class="farm-crop-switcher" aria-label="切换作物图层">
        <button class="active" type="button" data-crop="auto">自动</button>
        <button type="button" data-crop="tomato">番茄</button>
        <button type="button" data-crop="cucumber">黄瓜</button>
        <button type="button" data-crop="rice">水稻</button>
        <button type="button" data-crop="corn">玉米</button>
      </nav>

      <!-- 2D Marker Overlay Layer -->
      <div class="farm-marker-layer" data-marker-layer></div>

      <!-- Bottom Floating Widgets -->
      <div class="farm-wind-readout"><span class="farm-live-dot"></span><span>作物风场交互</span><strong data-wind-state>自然微风 · 随鼠标拂动</strong></div>
      <div class="farm-scene-hint"><i class="ph ph-mouse-left-click"></i><span>单击查看 · 双击推演</span></div>

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
      cropSwitcher: q('.farm-crop-switcher'),
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

    this.shell.querySelectorAll('[data-crop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.crop;
        this.cropOverride = value === 'auto' ? null : value;
        this.shell.querySelectorAll('[data-crop]').forEach(b => b.classList.toggle('active', b === btn));
        this.world?.setCropOverride(this.cropOverride);
        this.showToast(value === 'auto' ? '已恢复 Crop Pack 作物规划' : `全部地块已切换为【${CROP_PROFILES[value]?.label || value}】图层`);
      });
    });

    this.shell.querySelector('[data-camera-reset]').addEventListener('click', () => {
      if (this.world) {
        this.world.pointerTarget.set(0, 0);
        this.world.targetWind.set(0, 0);
        this.world.camera.position.copy(this.world.baseCamera);
      }
      this.showToast('视角已平滑复位');
    });

    this.shell.querySelector('[data-location-action]').addEventListener('click', () => {
      this.showToast(`当前定位：${this.locationLabel}`);
    });

    this.shell.querySelector('[data-layer-action]').addEventListener('click', () => {
      this.dom.cropSwitcher?.classList.add('attention');
      setTimeout(() => this.dom.cropSwitcher?.classList.remove('attention'), 1500);
      this.showToast('可在右上角切换农作物图层');
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

    // Panel delegated clicks
    this.dom.panel.addEventListener('click', event => {
      if (event.target.closest('[data-panel-close]')) this.closePanel();
      if (event.target.closest('[data-panel-sandbox]')) this.openSandbox(this.selectedPlotId);
      const stageBtn = event.target.closest('[data-stage]');
      if (stageBtn) {
        const stage = stageBtn.dataset.stage;
        this.world?.setPlotStage(this.selectedPlotId, stage);
        this.dom.panel.querySelectorAll('[data-stage]').forEach(b => b.classList.toggle('active', b === stageBtn));
        this.showToast(`地块已切换至【${STAGE_PROFILES[stage]?.label || stage}】阶段`);
      }
      if (event.target.closest('[data-action-irrigate]')) {
        this.showToast('已触发微喷灌电磁阀：计划灌溉 15 分钟');
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

  createMarkers() {
    this.dom.markerLayer.innerHTML = this.plots.map(plot => `
      <div class="farm-plot-marker" data-marker="${plot.plotId}">
        <span class="farm-plot-sign">${plot.plotId.replace('plot-', '').toUpperCase()}</span>
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

  selectPlot(plotId, origin = { x: window.innerWidth - 24, y: window.innerHeight / 2 }) {
    this.selectedPlotId = plotId;
    this.world?.setSelectedPlot(plotId);
    this.openPanel(plotId, origin);
  }

  openPanel(plotId, origin) {
    const plot = this.plots.find(item => item.plotId === plotId) || this.plots[0];
    if (!plot) return;
    const cropCode = this.cropOverride || plot.cropCode || 'tomato';
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
          <p>${crop.label} · 当前生长阶段：${stage.label}</p>
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

      <section class="farm-panel-section">
        <div class="farm-section-title">
          <span>实时传感器 (IoT 遥测)</span>
          <small>1秒前已更新</small>
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

      <section class="farm-panel-section">
        <div class="farm-section-title">
          <span>24小时环境时序曲线</span>
          <small>土壤湿度趋势</small>
        </div>
        <canvas class="farm-chart" data-farm-chart aria-label="环境曲线"></canvas>
        <div class="farm-chart-legend">
          <span><i></i>土壤湿度曲线</span>
          <strong>适宜区间 20~40%</strong>
        </div>
      </section>

      <section class="farm-panel-section">
        <div class="farm-section-title">
          <span>作物阶段调控</span>
          <small>点击即时切换3D外观</small>
        </div>
        <div class="farm-stage-track">
          ${Object.entries(STAGE_PROFILES).map(([key, item]) => `
            <button class="farm-stage-btn ${key === stageCode ? 'active' : ''}" type="button" data-stage="${key}">
              <i></i><span>${item.label}</span>
            </button>
          `).join('')}
        </div>
      </section>

      ${plot.riskLevel === 'HIGH' ? `
        <div class="farm-ai-prescription">
          <div class="farm-ai-prescription-head"><i class="ph ph-sparkle"></i><span>AgriLoop 智能处方建议</span></div>
          <p>检测到土壤湿度 (16.8%) 持续低于作物临界下限，建议立即执行微喷灌作业。</p>
          <div class="farm-action-btn-row">
            <button class="farm-btn-action primary" type="button" data-action-irrigate><i class="ph ph-drop"></i><span>一键启动微喷灌</span></button>
          </div>
        </div>
      ` : ''}

      <button class="farm-sandbox-button" type="button" data-panel-sandbox>
        <i class="ph ph-graph"></i>
        <span>进入未来风险推演与情景沙盘</span>
        <small>双击地块也可进入</small>
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

    context.strokeStyle = 'rgba(19, 62, 45, 0.08)';
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
    grad.addColorStop(0, 'rgba(47, 158, 103, 0.32)');
    grad.addColorStop(1, 'rgba(47, 158, 103, 0.0)');

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
    context.strokeStyle = '#2f9e67';
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
    const fallback = { latitude: 29.56, longitude: 106.55, label: '重庆 · 智慧农业示范区' };
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
    this.dom.weatherLabel.textContent = WEATHER_LABELS[weather] || '晴';
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
