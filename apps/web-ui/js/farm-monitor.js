import * as THREE from '../vendor/three/three.module.min.js';

const WEATHER_LABELS = {
  sunny: '晴', cloudy: '多云', overcast: '阴', 'light-rain': '小雨',
  'moderate-rain': '中雨', 'heavy-rain': '大雨'
};

const CROP_PROFILES = {
  tomato: { label: '番茄', icon: '●', family: '茄果类', stem: 0x3d7c42, leaf: 0x3f9b4f, leafDark: 0x24713b, fruit: 0xe95a3f, height: 1.18, spacing: 0.5 },
  cucumber: { label: '黄瓜', icon: '◆', family: '瓜果类', stem: 0x3f8a47, leaf: 0x56ad55, leafDark: 0x2d7c3f, fruit: 0x7eb447, height: 1.38, spacing: 0.55 },
  rice: { label: '水稻', icon: '〽', family: '粮食类', stem: 0x8eb84f, leaf: 0xa6c95d, leafDark: 0x678c36, fruit: 0xd8bd59, height: 0.84, spacing: 0.37 },
  corn: { label: '玉米', icon: '▲', family: '粮食类', stem: 0x4c9348, leaf: 0x68ad4f, leafDark: 0x317b3d, fruit: 0xe1b84e, height: 1.62, spacing: 0.58 }
};

const STAGE_PROFILES = {
  seedling: { label: '苗期', height: 0.46, density: 0.68, fruit: 0 },
  vegetative: { label: '营养生长期', height: 0.76, density: 0.84, fruit: 0.08 },
  flowering: { label: '开花坐果期', height: 0.9, density: 0.94, fruit: 0.55 },
  fruiting: { label: '挂果采收期', height: 1, density: 1, fruit: 1 }
};

const PLOT_LAYOUT = {
  'plot-a01': { x: -7.18, z: 3.45, width: 7.1, depth: 7.35, rotation: -0.032 },
  'plot-a02': { x: 0.62, z: -1.5, width: 7.75, depth: 6.15, rotation: 0.018 },
  'plot-b01': { x: 4.55, z: 6.72, width: 8.35, depth: 8.55, rotation: 0.032 }
};

const DEFAULT_PLOTS = [
  { plotId: 'plot-a01', name: 'A01 号地块', cropCode: 'tomato', cropName: '番茄', stageCode: 'fruiting', stageLabel: '挂果采收期', riskLevel: 'HIGH', healthScore: 0.96,
    metrics: { SOIL_MOISTURE: { label: '土壤湿度', value: 16.8, unit: '%', status: 'WARN', target: '20~40%' }, AIR_TEMPERATURE: { label: '空气温度', value: 26.4, unit: '°C', status: 'NORMAL' }, LIGHT: { label: '光照强度', value: 42500, unit: 'lux', status: 'NORMAL' }, CO2: { label: 'CO₂', value: 680, unit: 'ppm', status: 'NORMAL' } } },
  { plotId: 'plot-a02', name: 'A02 号地块', cropCode: 'tomato', cropName: '番茄', stageCode: 'flowering', stageLabel: '开花坐果期', riskLevel: 'MEDIUM', healthScore: 0.98,
    metrics: { SOIL_MOISTURE: { label: '土壤湿度', value: 24.5, unit: '%', status: 'NORMAL' }, AIR_TEMPERATURE: { label: '空气温度', value: 28.1, unit: '°C', status: 'NORMAL' }, LIGHT: { label: '光照强度', value: 45200, unit: 'lux', status: 'NORMAL' }, CO2: { label: 'CO₂', value: 710, unit: 'ppm', status: 'NORMAL' } } },
  { plotId: 'plot-b01', name: 'B01 号地块', cropCode: 'cucumber', cropName: '黄瓜', stageCode: 'vegetative', stageLabel: '营养生长期', riskLevel: 'LOW', healthScore: 0.99,
    metrics: { SOIL_MOISTURE: { label: '土壤湿度', value: 31.2, unit: '%', status: 'NORMAL' }, AIR_TEMPERATURE: { label: '空气温度', value: 24.6, unit: '°C', status: 'NORMAL' }, LIGHT: { label: '光照强度', value: 38900, unit: 'lux', status: 'NORMAL' }, CO2: { label: 'CO₂', value: 640, unit: 'ppm', status: 'NORMAL' } } }
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const ease = value => value * value * (3 - 2 * value);

function mapWeatherCode(code, precipitation = 0) {
  if ([65, 67, 82, 95, 96, 99].includes(code) || precipitation >= 7.6) return 'heavy-rain';
  if ([63, 81].includes(code) || precipitation >= 2.6) return 'moderate-rain';
  if ([51, 53, 55, 56, 57, 61, 66, 80].includes(code) || precipitation > 0) return 'light-rain';
  if ([3, 45, 48].includes(code)) return 'overcast';
  if ([1, 2].includes(code)) return 'cloudy';
  return 'sunny';
}

function isPlotWarning(plot) {
  return plot.riskLevel === 'HIGH' || Object.values(plot.metrics || {}).some(metric => metric.status === 'WARN');
}

function metricValue(metric, fallback = '—') {
  if (!metric || metric.value === undefined) return fallback;
  const value = Number(metric.value);
  const formatted = Math.abs(value) >= 1000 ? value.toLocaleString('zh-CN') : value;
  return `${formatted}${metric.unit || ''}`;
}

function createFlexAttribute(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const floor = Math.min(0, box.min.y);
  const span = Math.max(0.001, box.max.y - floor);
  const values = new Float32Array(geometry.attributes.position.count);
  for (let index = 0; index < values.length; index += 1) values[index] = clamp((geometry.attributes.position.getY(index) - floor) / span, 0, 1);
  geometry.setAttribute('aFlex', new THREE.BufferAttribute(values, 1));
  return geometry;
}

function createSwayMaterial(color, roughness = 0.8) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, side: THREE.DoubleSide });
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
        float farmWave = sin(uFarmTime * 1.48 + aPhase + farmInstance.x * 0.43 + farmInstance.z * 0.36);
        float farmLeafFlutter = sin(uFarmTime * 4.15 + aPhase * 1.73 + position.y * 5.0);
        float farmWind = length(uWindVector);
        transformed.x += farmFlex * (farmWave * uBreeze + uWindVector.x * 0.105 + farmLeafFlutter * farmWind * 0.018);
        transformed.z += farmFlex * (cos(uFarmTime * 1.12 + aPhase) * uBreeze * 0.55 + uWindVector.y * 0.105);
      `);
    material.userData.windUniforms = shader.uniforms;
  };
  material.customProgramCacheKey = () => 'agriloop-real-crop-sway-v2';
  return material;
}

function attachInstancePhases(geometry, count, offset = 0) {
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index += 1) phases[index] = (index * 2.399 + offset) % (Math.PI * 2);
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
  if (hour < 6 || hour >= 19.15) return { phase: 'night', daylight: 0, warm: 0 };
  if (hour < 6.75) {
    const progress = ease((hour - 6) / 0.75);
    return { phase: 'sunrise', daylight: progress, warm: 1 - Math.abs(progress - 0.55) * 0.65 };
  }
  if (hour < 18) return { phase: 'day', daylight: 1, warm: 0 };
  if (hour < 18.75) {
    const progress = ease((hour - 18) / 0.75);
    return { phase: 'sunset', daylight: 1 - progress, warm: 0.55 + progress * 0.45 };
  }
  const progress = clamp((19.15 - hour) / 0.4, 0, 1);
  return { phase: 'dusk', daylight: progress * 0.18, warm: progress };
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
    this.build(plot.cropCode || 'tomato', plot.stageCode || 'vegetative');
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
    const stage = STAGE_PROFILES[stageCode] || STAGE_PROFILES.vegetative;
    this.cropCode = cropCode;
    this.stageCode = stageCode;
    const plantHeight = crop.height * stage.height;
    const spacing = crop.spacing / Math.sqrt(stage.density);
    const columns = Math.max(5, Math.floor((this.layout.width - 0.65) / spacing));
    const rows = Math.max(4, Math.floor((this.layout.depth - 0.58) / spacing));
    const count = columns * rows;
    const transforms = [];
    const dummy = new THREE.Object3D();
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const seed = row * columns + column;
        transforms.push({
          x: (column / Math.max(1, columns - 1) - 0.5) * (this.layout.width - 0.65) + Math.sin(seed * 9.17) * 0.055,
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

    const stemRadius = cropCode === 'corn' ? 0.06 : cropCode === 'rice' ? 0.022 : 0.035;
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
        fruitGeometry = new THREE.SphereGeometry(0.075 + stage.fruit * 0.025, 10, 8);
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
    this.group.userData.plantCount = count;
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
    this.pointerTarget = new THREE.Vector2();
    this.currentWind = new THREE.Vector2(0.12, 0.03);
    this.targetWind = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Timer();
    this.weather = 'sunny';
    this.hoveredPlotId = null;
    this.lastPointer = null;
    this.frameCount = 0;
    this.isDestroyed = false;
    this.clickTimer = null;
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(this.host.clientWidth, this.host.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.className = 'farm-webgl-canvas';
    this.renderer.domElement.setAttribute('aria-label', '可交互三维农田场景');
    this.host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xcfe3d2, 0.012);
    this.camera = new THREE.PerspectiveCamera(48, this.host.clientWidth / Math.max(1, this.host.clientHeight), 0.1, 180);
    this.camera.position.set(0, 13.1, 24.5);
    this.camera.lookAt(0, 1.42, 1.15);
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
    this.host.dataset.renderer = 'webgl';
    this.animate();
  }

  buildSky() {
    this.skyUniforms = {
      uTop: { value: new THREE.Color(0x6fbee8) },
      uHorizon: { value: new THREE.Color(0xeaf7dc) },
      uSunDirection: { value: new THREE.Vector3(-0.4, 0.7, -0.5).normalize() },
      uSunColor: { value: new THREE.Color(0xfff0b5) },
      uSunStrength: { value: 1 }
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
          float heightMix = smoothstep(-0.08, 0.68, direction.y);
          vec3 sky = mix(uHorizon, uTop, heightMix);
          float halo = pow(max(dot(direction, normalize(uSunDirection)), 0.0), 38.0) * 0.42;
          float core = pow(max(dot(direction, normalize(uSunDirection)), 0.0), 750.0) * 1.45;
          sky += uSunColor * (halo + core) * uSunStrength;
          gl_FragColor = vec4(sky, 1.0);
        }
      `
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 18), material);
    this.scene.add(this.sky);
  }

  buildLights() {
    this.hemiLight = new THREE.HemisphereLight(0xe6f5ff, 0x4c6d39, 2.2);
    this.scene.add(this.hemiLight);
    this.sunLight = new THREE.DirectionalLight(0xffefc4, 4.1);
    this.sunLight.position.set(-18, 22, -14);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -25;
    this.sunLight.shadow.camera.right = 25;
    this.sunLight.shadow.camera.top = 22;
    this.sunLight.shadow.camera.bottom = -16;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 65;
    this.sunLight.shadow.bias = -0.00025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.sunDisc = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.58, 32, 22), new THREE.MeshBasicMaterial({ color: 0xfff8d2, toneMapped: false, depthTest: false, depthWrite: false }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.28, 28, 18), new THREE.MeshBasicMaterial({ color: 0xffdf85, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }));
    const glowWide = new THREE.Mesh(new THREE.SphereGeometry(2.15, 24, 14), new THREE.MeshBasicMaterial({ color: 0xffe9ae, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }));
    core.renderOrder = 4;
    glow.renderOrder = 4;
    glowWide.renderOrder = 4;
    this.sunDisc.add(core, glow, glowWide);
    this.sunDisc.renderOrder = 4;
    this.scene.add(this.sunDisc);
  }

  buildTerrain() {
    const geometry = new THREE.PlaneGeometry(72, 52, 72, 52);
    const position = geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const edge = clamp((Math.abs(x) - 18) / 16, 0, 1) + clamp((-y - 13) / 14, 0, 1);
      const relief = edge * (0.8 + Math.sin(x * 0.24) * 0.26 + Math.cos(y * 0.27) * 0.22);
      position.setZ(index, relief - 0.4);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: 0xa8b98f, roughness: 0.94, metalness: 0 });
    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.rotation.x = -Math.PI / 2;
    this.terrain.position.y = -0.32;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    const buildRidge = ({ z, heightScale, color, opacity = 1 }) => {
      const ridgeGeometry = new THREE.PlaneGeometry(86, 26, 112, 38);
      const ridgePosition = ridgeGeometry.attributes.position;
      for (let index = 0; index < ridgePosition.count; index += 1) {
        const x = ridgePosition.getX(index);
        const depth = ridgePosition.getY(index);
        const peaks =
          Math.exp(-((x + 29) ** 2) / 110) * 8.5 +
          Math.exp(-((x + 13) ** 2) / 82) * 10.5 +
          Math.exp(-((x - 4) ** 2) / 126) * 7.8 +
          Math.exp(-((x - 22) ** 2) / 94) * 10.2 +
          Math.exp(-((x - 36) ** 2) / 72) * 7.2;
        const depthShape = 0.58 + Math.sin((depth + 13) / 26 * Math.PI) * 0.42;
        const detail = Math.sin(x * 0.42 + depth * 0.21) * 0.46 + Math.cos(x * 0.17 - depth * 0.36) * 0.32;
        ridgePosition.setZ(index, Math.max(0, (peaks * depthShape + detail) * heightScale));
      }
      ridgeGeometry.computeVertexNormals();
      const ridgeMaterial = new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: opacity < 1, opacity });
      this.ridgeMaterials.push(ridgeMaterial);
      const ridge = new THREE.Mesh(ridgeGeometry, ridgeMaterial);
      ridge.rotation.x = -Math.PI / 2;
      ridge.position.set(0, -0.28, z);
      ridge.receiveShadow = true;
      this.scene.add(ridge);
    };
    buildRidge({ z: -25, heightScale: 0.32, color: 0x6f9878 });
    buildRidge({ z: -38, heightScale: 0.23, color: 0x8ca7a5, opacity: 0.92 });
  }

  createWaterMaterial() {
    const uniforms = {
      uTime: { value: 0 },
      uColorDeep: { value: new THREE.Color(0x2f83a7) },
      uColorLight: { value: new THREE.Color(0x8ed7d0) },
      uSun: { value: new THREE.Color(0xffe6a4) },
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
          float waveA = sin(position.x * 2.2 + uTime * 1.25) * 0.035;
          float waveB = cos(position.y * 3.4 - uTime * 0.9) * 0.025;
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
          float ripple = sin((vUv.x + vUv.y) * 38.0 + uTime * 1.8) * 0.035;
          float glint = pow(max(0.0, sin(vUv.x * 22.0 - uTime) * cos(vUv.y * 18.0 + uTime * 0.7)), 8.0);
          vec3 color = mix(uColorDeep, uColorLight, 0.42 + vWave * 4.0 + ripple);
          color += uSun * glint * 0.26;
          gl_FragColor = vec4(color * uBrightness, 0.9);
        }
      `
    });
    material.userData.waterUniforms = uniforms;
    this.waterMaterials.push(material);
    return material;
  }

  buildWater() {
    const pond = new THREE.Mesh(new THREE.CircleGeometry(5.2, 48), this.createWaterMaterial());
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(4.8, -0.1, -7.2);
    pond.receiveShadow = true;
    this.scene.add(pond);

    const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x9bb272, roughness: 0.94 });
    const addCanal = ({ width, depth, x, z, vertical = false }) => {
      const canal = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, Math.max(4, Math.round(width * 2)), Math.max(3, Math.round(depth * 2))), this.createWaterMaterial());
      canal.rotation.x = -Math.PI / 2;
      canal.position.set(x, -0.07, z);
      canal.receiveShadow = true;
      this.scene.add(canal);
      const sideOffset = (vertical ? width : depth) / 2 + 0.12;
      [-sideOffset, sideOffset].forEach(offset => {
        const bank = new THREE.Mesh(
          new THREE.BoxGeometry(vertical ? 0.22 : width + 0.34, 0.16, vertical ? depth + 0.34 : 0.22),
          bankMaterial
        );
        bank.position.set(x + (vertical ? offset : 0), -0.06, z + (vertical ? 0 : offset));
        bank.castShadow = true;
        bank.receiveShadow = true;
        this.scene.add(bank);
      });
    };
    addCanal({ width: 24.8, depth: 0.88, x: -1.8, z: 1.88 });
    addCanal({ width: 27.5, depth: 0.86, x: 0.5, z: 11.55 });
    addCanal({ width: 0.82, depth: 15.6, x: -3.48, z: 4.1, vertical: true });
    addCanal({ width: 0.82, depth: 15.4, x: 8.95, z: 4.15, vertical: true });
  }

  buildRoads() {
    const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xbba873, roughness: 1 });
    const mainPath = new THREE.Mesh(new THREE.BoxGeometry(31, 0.12, 1.05), pathMaterial);
    mainPath.position.set(0, -0.08, 12.6);
    mainPath.receiveShadow = true;
    this.scene.add(mainPath);
    [-11.25, 11.25].forEach(x => {
      const path = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 17.6), pathMaterial);
      path.position.set(x, -0.07, 3.75);
      path.receiveShadow = true;
      this.scene.add(path);
    });
  }

  buildBuildings() {
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf0e6c7, roughness: 0.86 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xb8613f, roughness: 0.78 });
    const barn = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.55, 2.6), wallMaterial);
    body.position.y = 0.76;
    body.castShadow = true;
    body.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.45, 1.15, 4), roofMaterial);
    roof.position.y = 1.95;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.76;
    roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x6e7f59 }));
    door.position.set(0, 0.52, 1.34);
    barn.add(body, roof, door);
    barn.position.set(-11.2, 0, -6.2);
    barn.rotation.y = 0.1;
    this.scene.add(barn);

    const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe3d7, transmission: 0.42, transparent: true, opacity: 0.55, roughness: 0.22, metalness: 0, side: THREE.DoubleSide });
    const frame = new THREE.MeshStandardMaterial({ color: 0xe5eee4, roughness: 0.48, metalness: 0.35 });
    const greenhouse = new THREE.Group();
    const glassBody = new THREE.Mesh(new THREE.BoxGeometry(4.3, 1.35, 3), glass);
    glassBody.position.y = 0.72;
    glassBody.castShadow = true;
    greenhouse.add(glassBody);
    for (let offset = -2; offset <= 2; offset += 1) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.05, 3.18), frame);
      rib.position.set(offset, 0.95, 0);
      rib.castShadow = true;
      greenhouse.add(rib);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.05, 0.05), frame);
    ridge.position.set(0, 1.78, 0);
    greenhouse.add(ridge);
    greenhouse.position.set(-5.4, 0, -7.1);
    this.scene.add(greenhouse);

    const silo = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 2.4, 14), new THREE.MeshStandardMaterial({ color: 0xd9e1dc, roughness: 0.4, metalness: 0.5 }));
    tank.position.y = 1.2;
    tank.castShadow = true;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.5, 14), roofMaterial);
    cap.position.y = 2.65;
    silo.add(tank, cap);
    silo.position.set(-14, 0, -4.8);
    this.scene.add(silo);
  }

  buildPlots() {
    const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x6c4b2f, roughness: 1 });
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xb59662, roughness: 0.88 });
    const furrowMaterial = new THREE.MeshStandardMaterial({ color: 0x4f3826, roughness: 1 });
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
      [[layout.width + 0.15, 0.11, 0.12, 0, -layout.depth / 2], [layout.width + 0.15, 0.11, 0.12, 0, layout.depth / 2], [0.12, 0.11, layout.depth, -layout.width / 2, 0], [0.12, 0.11, layout.depth, layout.width / 2, 0]].forEach(([w, h, d, x, z]) => {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeMaterial);
        edge.position.set(x, 0, z);
        edge.castShadow = true;
        edgeGroup.add(edge);
      });
      const rowCount = 8;
      for (let row = 0; row < rowCount; row += 1) {
        const furrow = new THREE.Mesh(new THREE.BoxGeometry(layout.width - 0.3, 0.04, 0.12), furrowMaterial);
        furrow.position.set(0, 0.08, (row / (rowCount - 1) - 0.5) * (layout.depth - 0.55));
        furrow.receiveShadow = true;
        edgeGroup.add(furrow);
      }
      this.scene.add(edgeGroup);
      const glowMaterial = new THREE.MeshStandardMaterial({
        color: 0xfff1c4,
        emissive: 0xffc75c,
        emissiveIntensity: 3.1,
        roughness: 0.38,
        toneMapped: false
      });
      const glowGroup = new THREE.Group();
      glowGroup.position.set(layout.x, 0.135, layout.z);
      glowGroup.rotation.y = layout.rotation;
      [[layout.width + 0.1, 0.035, 0.045, 0, -layout.depth / 2], [layout.width + 0.1, 0.035, 0.045, 0, layout.depth / 2], [0.045, 0.035, layout.depth, -layout.width / 2, 0], [0.045, 0.035, layout.depth, layout.width / 2, 0]].forEach(([w, h, d, x, z]) => {
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
    for (let column = 0; column < columns; column += 1) {
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
    for (let index = 0; index < 88; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const x = side * (13.8 + (index % 8) * 1.45) + Math.sin(index * 2.8) * 1.2;
      const z = -13 + (index % 15) * 1.35 + Math.cos(index * 1.3) * 0.7;
      if (z > 7.5) continue;
      positions.push({ x, z, scale: 0.7 + (Math.sin(index * 4.2) + 1) * 0.22 });
    }
    for (let index = 0; index < 44; index += 1) {
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
    }, undefined, error => console.info('[FarmMonitor] 草地纹理未加载，使用材质色。', error));
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
    }, undefined, error => console.info('[FarmMonitor] 山林纹理未加载，使用材质色。', error));
    loader.load('assets/textures/tilled-soil.png', texture => {
      this.soilMaterials.forEach((material, index) => {
        const soilTexture = prepare(texture.clone(), 4 + index * 0.35, 3.2);
        soilTexture.needsUpdate = true;
        material.map = soilTexture;
        material.color.set(0x9a7658);
        material.needsUpdate = true;
      });
    }, undefined, error => console.info('[FarmMonitor] 土壤纹理未加载，使用材质色。', error));
  }

  buildClouds() {
    const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.66, roughness: 1, depthWrite: false });
    for (let index = 0; index < 10; index += 1) {
      const group = new THREE.Group();
      const puffCount = 4 + (index % 3);
      for (let puff = 0; puff < puffCount; puff += 1) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMaterial.clone());
        mesh.scale.set(1.7 + (puff % 2) * 0.8, 0.65 + (puff % 3) * 0.18, 1.05);
        mesh.position.set((puff - puffCount / 2) * 1.25, Math.sin(puff * 2.2) * 0.3, Math.cos(puff * 1.5) * 0.38);
        group.add(mesh);
      }
      group.position.set(-29 + index * 6.4, 9.1 + (index % 3) * 1.22, -42 - (index % 4) * 2.8);
      group.userData.speed = 0.16 + (index % 4) * 0.035;
      group.userData.baseY = group.position.y;
      this.clouds.push(group);
      this.scene.add(group);
    }
  }

  buildRain() {
    const count = 2200;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 42;
      positions[index * 3 + 1] = Math.random() * 24;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 28;
      speeds[index] = 10 + Math.random() * 10;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xc7e8ff, size: 0.065, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.NormalBlending });
    this.rain = new THREE.Points(geometry, material);
    this.rain.userData.speeds = speeds;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  buildStars() {
    const count = 460;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = 55 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.43;
      positions[index * 3] = Math.cos(theta) * Math.cos(phi) * radius;
      positions[index * 3 + 1] = Math.sin(phi) * radius + 4;
      positions[index * 3 + 2] = Math.sin(theta) * Math.cos(phi) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xdfeaff, size: 0.17, transparent: true, opacity: 0, depthWrite: false }));
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
        const gain = clamp(22 / elapsed, 0.35, 1.6);
        this.targetWind.x = clamp(this.targetWind.x + dx * 0.022 * gain, -2.8, 2.8);
        this.targetWind.y = clamp(this.targetWind.y - dy * 0.022 * gain, -2.8, 2.8);
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
      }, 220);
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
      sunny: { clouds: 0.18, rain: false, fog: 0.0065, exposure: 1.12 },
      cloudy: { clouds: 0.48, rain: false, fog: 0.012, exposure: 1.08 },
      overcast: { clouds: 0.72, rain: false, fog: 0.017, exposure: 0.96 },
      'light-rain': { clouds: 0.82, rain: true, rainOpacity: 0.42, fog: 0.021, exposure: 0.92 },
      'moderate-rain': { clouds: 0.9, rain: true, rainOpacity: 0.62, fog: 0.026, exposure: 0.84 },
      'heavy-rain': { clouds: 0.96, rain: true, rainOpacity: 0.84, fog: 0.032, exposure: 0.74 }
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

  updatePlots(plots) {
    this.plots = plots?.length ? plots : DEFAULT_PLOTS;
    this.plots.forEach(plot => this.cropFields.get(plot.plotId)?.setCrop(plot.cropCode || 'tomato', plot.stageCode || 'vegetative'));
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

    const sunProgress = clamp((hour - 6) / 12, 0, 1);
    const sunAngle = sunProgress * Math.PI;
    const sunX = lerp(-20, 8, sunProgress);
    const sunY = Math.max(-4, Math.sin(sunAngle) * 4.15 + 2.75 - (hour > 18 ? (hour - 18) * 6.5 : hour < 6 ? (6 - hour) * 6.5 : 0));
    const sunZ = -15;
    this.sunDisc.position.set(sunX, sunY, sunZ);
    this.sunLight.position.set(sunX, Math.max(2, 8 + Math.sin(sunAngle) * 16), -12);
    this.skyUniforms.uSunDirection.value.copy(this.sunDisc.position).normalize();
    this.sunLight.color.set(warm > 0.2 ? 0xffa25d : 0xffedc2);
    this.sunLight.intensity = 0.16 + daylight * 4.15;
    this.hemiLight.color.set(daylight > 0.2 ? 0xe6f5ff : 0x5772a1);
    this.hemiLight.groundColor.set(daylight > 0.2 ? 0x4f753c : 0x152333);
    this.hemiLight.intensity = 0.38 + daylight * 1.95;
    this.sunDisc.visible = hour >= 5.65 && hour <= 19.2;
    this.stars.material.opacity = clamp((0.34 - daylight) * 2.4, 0, 0.84);
    this.host.dataset.dayPhase = day.phase;
  }

  projectPlotMarkers() {
    const markers = {};
    this.plots.forEach(plot => {
      const layout = PLOT_LAYOUT[plot.plotId];
      if (!layout) return;
      const profile = CROP_PROFILES[this.cropFields.get(plot.plotId)?.cropCode || plot.cropCode] || CROP_PROFILES.tomato;
      const stage = STAGE_PROFILES[plot.stageCode] || STAGE_PROFILES.vegetative;
      const warningPoint = new THREE.Vector3(layout.x, 0.62 + profile.height * stage.height, layout.z);
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
    this.onFrame(markers, this.renderer.info.render);
  }

  animate = () => {
    if (this.isDestroyed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    this.clock.update();
    const delta = Math.min(0.05, this.clock.getDelta() || 0.016);
    const elapsed = this.clock.getElapsed();
    this.targetWind.multiplyScalar(0.915);
    this.currentWind.lerp(this.targetWind, 0.09);
    this.windMaterials.forEach(material => {
      const uniforms = material.userData.windUniforms;
      if (!uniforms) return;
      uniforms.uFarmTime.value = elapsed;
      uniforms.uWindVector.value.set(this.currentWind.x, this.currentWind.y);
      uniforms.uBreeze.value = 0.042 + Math.sin(elapsed * 0.42) * 0.012;
    });
    this.waterMaterials.forEach(material => { material.userData.waterUniforms.uTime.value = elapsed; });

    this.clouds.forEach((cloud, index) => {
      cloud.position.x += cloud.userData.speed * 0.009;
      if (cloud.position.x > 34) cloud.position.x = -34;
      cloud.position.y = cloud.userData.baseY + Math.sin(elapsed * 0.19 + index) * 0.28;
    });
    if (this.rain.visible) {
      const positions = this.rain.geometry.attributes.position;
      const speeds = this.rain.userData.speeds;
      for (let index = 0; index < positions.count; index += 1) {
        let y = positions.getY(index) - speeds[index] * Math.max(delta, 0.014);
        let x = positions.getX(index) + this.currentWind.x * 0.014;
        if (y < -0.2) { y = 18 + Math.random() * 6; x = (Math.random() - 0.5) * 42; }
        positions.setXY(index, x, y);
      }
      positions.needsUpdate = true;
    }

    this.camera.position.x = lerp(this.camera.position.x, this.baseCamera.x + this.pointerTarget.x * 0.82, 0.025);
    this.camera.position.y = lerp(this.camera.position.y, this.baseCamera.y + this.pointerTarget.y * 0.32, 0.025);
    this.camera.lookAt(this.pointerTarget.x * 0.3, 1.42, 1.15 + this.pointerTarget.y * -0.16);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hoverHits = this.raycaster.intersectObjects([...this.plotMeshes.values()], false);
    this.setHoveredPlot(hoverHits[0]?.object?.userData?.plotId || null);
    this.renderer.render(this.scene, this.camera);
    this.frameCount += 1;
    if (this.frameCount % 2 === 0) this.projectPlotMarkers();
    if (this.frameCount % 12 === 0) {
      this.host.dataset.windStrength = this.currentWind.length().toFixed(2);
      this.host.dataset.drawCalls = String(this.renderer.info.render.calls);
      this.host.dataset.triangles = String(this.renderer.info.render.triangles);
    }
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
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
        else object.material?.dispose?.();
      }
    });
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function weatherIconClass(weather) {
  if (weather.includes('rain')) return 'ph-cloud-rain';
  if (weather === 'overcast') return 'ph-cloud';
  if (weather === 'cloudy') return 'ph-cloud-sun';
  return 'ph-sun';
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
  }

  setPlots(plots) {
    this.plots = plots?.length ? plots : DEFAULT_PLOTS;
    this.world?.updatePlots(this.plots);
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
    this.shell.setAttribute('aria-label', '农田动态监测');
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
        onFrame: (markers, renderInfo) => this.updateProjectedUi(markers, renderInfo)
      });
      this.world.init();
      this.world.setSelectedPlot(this.selectedPlotId);
      this.world.setWeather(this.weather);
      this.shell.dataset.webglStatus = 'ready';
    } catch (error) {
      console.error('[FarmMonitor] WebGL 场景初始化失败。', error);
      this.shell.dataset.webglStatus = 'error';
      this.dom.world.innerHTML = `<div class="farm-renderer-error"><i class="ph ph-warning-circle"></i><strong>三维场景启动失败</strong><span>请确认浏览器已启用 WebGL 硬件加速。</span></div>`;
    }
    this.startClock();
    this.resolveWeather();
    requestAnimationFrame(() => this.shell?.classList.add('active'));
  }

  renderShell() {
    return `
      <div class="farm-world-host" data-farm-world></div>
      <aside class="farm-tool-rail" aria-label="环境与视角工具">
        <button class="farm-rail-back" type="button" data-farm-back aria-label="返回总览"><i class="ph ph-arrow-left"></i></button>
        <div class="farm-rail-metrics">
          <div class="farm-rail-metric"><i class="ph ph-sun" data-weather-icon></i><strong data-temperature>28.4°C</strong><span data-weather-label>晴</span></div>
          <div class="farm-rail-metric"><i class="ph ph-drop"></i><strong data-humidity>58%</strong><span>湿度</span></div>
          <div class="farm-rail-metric"><i class="ph ph-wind"></i><strong data-wind-speed>2.7 m/s</strong><span>风速</span></div>
          <div class="farm-rail-metric"><i class="ph ph-leaf"></i><strong>35</strong><span>空气优</span></div>
          <div class="farm-rail-metric farm-rail-time"><i class="ph ph-clock"></i><strong data-clock>14:20:00</strong><span data-date>08-23 周日</span></div>
        </div>
        <div class="farm-rail-actions">
          <button type="button" data-location-action><i class="ph ph-map-pin"></i><span>地理位置</span></button>
          <button type="button" data-layer-action><i class="ph ph-stack"></i><span>图层管理</span></button>
          <button type="button" data-camera-reset><i class="ph ph-crosshair"></i><span>视角复位</span></button>
        </div>
      </aside>

      <header class="farm-title-lockup">
        <p>AGRI LOOP · LIVE FIELD</p>
        <h1>农田动态监测</h1>
        <span data-location-label>重庆 · 智慧农业示范区</span>
      </header>

      <nav class="farm-crop-switcher" aria-label="切换作物图层">
        <button class="active" type="button" data-crop="auto">自动</button>
        <button type="button" data-crop="tomato">番茄</button>
        <button type="button" data-crop="cucumber">黄瓜</button>
        <button type="button" data-crop="rice">水稻</button>
        <button type="button" data-crop="corn">玉米</button>
      </nav>

      <div class="farm-marker-layer" data-marker-layer aria-hidden="true"></div>
      <div class="farm-scene-hint"><i class="ph ph-mouse-left-click"></i><span>单击查看 · 双击推演</span></div>
      <div class="farm-wind-readout"><span class="farm-live-dot"></span><span>作物实时风场</span><strong data-wind-state>自然微风</strong></div>
      <aside class="farm-detail-panel" data-detail-panel aria-live="polite"></aside>
      <div class="farm-toast" data-farm-toast role="status"></div>
      <div class="farm-scene-loading" data-scene-loading><span></span><strong>正在生长三维农场</strong></div>
    `;
  }

  cacheDom() {
    const query = selector => this.shell.querySelector(selector);
    this.dom = {
      world: query('[data-farm-world]'),
      back: query('[data-farm-back]'),
      panel: query('[data-detail-panel]'),
      markerLayer: query('[data-marker-layer]'),
      toast: query('[data-farm-toast]'),
      loading: query('[data-scene-loading]'),
      clock: query('[data-clock]'),
      date: query('[data-date]'),
      weatherLabel: query('[data-weather-label]'),
      weatherIcon: query('[data-weather-icon]'),
      temperature: query('[data-temperature]'),
      humidity: query('[data-humidity]'),
      windSpeed: query('[data-wind-speed]'),
      windState: query('[data-wind-state]'),
      location: query('[data-location-label]')
    };
  }

  bindUi() {
    this.dom.back.addEventListener('click', () => {
      this.close(false);
      this.onExit();
    });
    this.shell.querySelectorAll('[data-crop]').forEach(button => button.addEventListener('click', () => {
      const value = button.dataset.crop;
      this.cropOverride = value === 'auto' ? null : value;
      this.shell.querySelectorAll('[data-crop]').forEach(item => item.classList.toggle('active', item === button));
      this.world?.setCropOverride(this.cropOverride);
      this.updateMarkerCropLabels();
      this.showToast(value === 'auto' ? '已恢复 Crop Pack 作物档案' : `全部地块已切换为${CROP_PROFILES[value].label}图层`);
    }));
    this.shell.querySelector('[data-camera-reset]').addEventListener('click', () => {
      if (!this.world) return;
      this.world.pointerTarget.set(0, 0);
      this.world.targetWind.set(0, 0);
      this.world.camera.position.copy(this.world.baseCamera);
      this.showToast('视角已复位');
    });
    this.shell.querySelector('[data-location-action]').addEventListener('click', () => this.showToast(this.locationLabel));
    this.shell.querySelector('[data-layer-action]').addEventListener('click', () => {
      this.shell.querySelector('.farm-crop-switcher')?.classList.toggle('attention');
      this.showToast('可在右上角切换作物图层');
    });
    this.dom.panel.addEventListener('click', event => {
      if (event.target.closest('[data-panel-close]')) this.closePanel();
      if (event.target.closest('[data-panel-sandbox]')) this.openSandbox(this.selectedPlotId);
    });
    window.addEventListener('keydown', this.handleKeydown = event => {
      if (!this.isOpen) return;
      if (event.key === 'Escape' && this.dom.panel.classList.contains('open')) this.closePanel();
      else if (event.key === 'Escape') { this.close(false); this.onExit(); }
    });
  }

  createMarkers() {
    this.dom.markerLayer.innerHTML = this.plots.map(plot => `
      <div class="farm-plot-marker" data-marker="${escapeHtml(plot.plotId)}">
        <span class="farm-plot-sign">${escapeHtml(plot.plotId.replace('plot-', '').toUpperCase())}</span>
        ${isPlotWarning(plot) ? '<span class="farm-warning-beacon"><i class="ph ph-warning"></i></span>' : ''}
      </div>
    `).join('');
    this.updateMarkerCropLabels();
  }

  updateMarkerCropLabels() {
    this.plots.forEach(plot => {
      const marker = this.dom.markerLayer?.querySelector(`[data-marker="${plot.plotId}"]`);
      if (!marker) return;
      const crop = CROP_PROFILES[this.cropOverride || plot.cropCode] || CROP_PROFILES.tomato;
      marker.dataset.cropLabel = crop.label;
    });
  }

  updateProjectedUi(markers, renderInfo) {
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
    if (this.dom.loading && renderInfo?.calls > 0) this.dom.loading.classList.add('done');
    if (this.world) {
      const force = Number(this.world.host.dataset.windStrength || 0);
      this.dom.windState.textContent = force > 0.48 ? '鼠标风场' : '自然微风';
    }
  }

  selectPlot(plotId, origin) {
    this.selectedPlotId = plotId;
    this.world?.setSelectedPlot(plotId);
    this.openPanel(plotId, origin);
  }

  openPanel(plotId, origin = { x: window.innerWidth - 24, y: window.innerHeight / 2 }) {
    const plot = this.plots.find(item => item.plotId === plotId) || this.plots[0];
    if (!plot) return;
    const cropCode = this.cropOverride || plot.cropCode || 'tomato';
    const crop = CROP_PROFILES[cropCode] || CROP_PROFILES.tomato;
    const stage = STAGE_PROFILES[plot.stageCode] || STAGE_PROFILES.vegetative;
    const metrics = plot.metrics || {};
    this.dom.panel.style.setProperty('--panel-origin-x', `${origin.x}px`);
    this.dom.panel.style.setProperty('--panel-origin-y', `${origin.y}px`);
    this.dom.panel.innerHTML = `
      <div class="farm-panel-head">
        <div><span>${escapeHtml(plot.plotId.replace('plot-', '').toUpperCase())} · ${escapeHtml(crop.family)}</span><h2>${escapeHtml(plot.name)}</h2><p>${escapeHtml(crop.label)} · ${escapeHtml(stage.label)}</p></div>
        <button type="button" data-panel-close aria-label="关闭详情"><i class="ph ph-x"></i></button>
      </div>
      <div class="farm-health-row">
        <div><span>作物健康度</span><strong>${Math.round((plot.healthScore || 0.96) * 100)}%</strong></div>
        <div><span>设备状态</span><strong class="online"><i class="ph ph-broadcast"></i> 在线</strong></div>
        <div><span>风险等级</span><strong class="risk-${escapeHtml(String(plot.riskLevel || 'LOW').toLowerCase())}">${escapeHtml(plot.riskLevel || 'LOW')}</strong></div>
      </div>
      <section class="farm-panel-section">
        <div class="farm-section-title"><span>实时传感器</span><small>模拟数据 · 刚刚更新</small></div>
        <div class="farm-metric-grid">
          ${['SOIL_MOISTURE', 'AIR_TEMPERATURE', 'LIGHT', 'CO2'].map(key => {
            const metric = metrics[key];
            return `<div class="farm-metric ${metric?.status === 'WARN' ? 'warning' : ''}"><span>${escapeHtml(metric?.label || key)}</span><strong>${escapeHtml(metricValue(metric))}</strong><small>${escapeHtml(metric?.target || '状态正常')}</small></div>`;
          }).join('')}
        </div>
      </section>
      <section class="farm-panel-section">
        <div class="farm-section-title"><span>环境曲线</span><small>最近 12 小时</small></div>
        <canvas class="farm-chart" data-farm-chart aria-label="最近12小时土壤湿度曲线"></canvas>
        <div class="farm-chart-legend"><span><i></i>土壤湿度</span><strong>目标 ${escapeHtml(metrics.SOIL_MOISTURE?.target || '20~40%')}</strong></div>
      </section>
      <section class="farm-panel-section">
        <div class="farm-section-title"><span>作物阶段</span><small>Crop Pack 驱动</small></div>
        <div class="farm-stage-track">
          ${Object.entries(STAGE_PROFILES).map(([key, item]) => `<span class="${key === plot.stageCode ? 'active' : ''}"><i></i>${escapeHtml(item.label)}</span>`).join('')}
        </div>
      </section>
      <button class="farm-sandbox-button" type="button" data-panel-sandbox><i class="ph ph-graph"></i><span>进入未来风险推演</span><small>双击地块也可进入</small></button>
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
    const values = Array.from({ length: 25 }, (_, index) => base + Math.sin(index * 0.52) * 2.1 + Math.cos(index * 0.19) * 1.2 + (index - 24) * 0.19);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = 'rgba(19, 62, 45, 0.1)';
    context.lineWidth = 1;
    for (let row = 1; row < 4; row += 1) {
      context.beginPath();
      context.moveTo(0, (height / 4) * row);
      context.lineTo(width, (height / 4) * row);
      context.stroke();
    }
    const min = Math.min(...values) - 2;
    const max = Math.max(...values) + 2;
    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / (max - min)) * height;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.strokeStyle = '#1f8f5f';
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
    this.showToast('未来风险推演与情景沙盘将在下一阶段接入');
  }

  startClock() {
    const params = new URLSearchParams(window.location.search);
    const demoTime = params.get('demoTime');
    this.clockAnchor = new Date();
    if (demoTime && /^\d{2}:\d{2}:\d{2}$/.test(demoTime)) {
      const [hours, minutes, seconds] = demoTime.split(':').map(Number);
      this.clockAnchor.setHours(hours, minutes, seconds, 0);
    }
    this.clockStartedAt = Date.now();
    const tick = () => {
      const now = new Date(this.clockAnchor.getTime() + (Date.now() - this.clockStartedAt));
      const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
      this.dom.clock.textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
      this.dom.date.textContent = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]}`;
      this.world?.updateDaylight(hours);
    };
    tick();
    this.clockTimer = window.setInterval(tick, 1000);
  }

  async resolveWeather() {
    const params = new URLSearchParams(window.location.search);
    const demoWeather = params.get('demoWeather');
    if (WEATHER_LABELS[demoWeather]) {
      this.applyWeather({ weather: demoWeather, temperature: 28.4, humidity: 58, windSpeed: 2.7 });
      return;
    }
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
    this.dom.location.textContent = place.label;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,precipitation,wind_speed_10m&timezone=auto`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`weather ${response.status}`);
      const current = (await response.json()).current;
      this.applyWeather({
        weather: mapWeatherCode(current.weather_code, current.precipitation),
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m / 3.6
      });
    } catch (error) {
      console.info('[FarmMonitor] 使用重庆演示天气。', error.name);
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
    this.dom.weatherIcon.className = `ph ${weatherIconClass(weather)}`;
    this.shell.dataset.weather = weather;
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
