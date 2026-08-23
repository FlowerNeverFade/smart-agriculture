/**
 * AgriLoop Farmland Dynamic Digital Twin (农田动态监测)
 * Ultra-smooth Three.js + Canvas 2.5D/3D Living Farmland World
 * Features:
 * - Living photorealistic composite backgrounds (Day/Sunrise/Sunset/Night/Rain)
 * - 6:00 Sunrise & 18:00 Sunset slow cinematic lighting transitions
 * - Dynamic 6-state weather engine (Sunny, Cloudy, Overcast, Light Rain, Moderate Rain, Heavy Rain)
 * - Directional wind physics reacting smoothly to mouse velocity & idle breeze waves
 * - Multi-crop layer switcher (Tomato, Cucumber, Rice, Corn, Auto) & growth stage progression
 * - Plot A01 pulsating warning beacon & neon bounding frames
 * - Expanding inspection modal with real-time IoT sensors & interactive environmental curves
 * - Double-click future risk sandbox simulation HUD
 */

import * as THREE from '../vendor/three/three.module.min.js';

const WEATHER_CONFIG = {
  sunny: { label: '晴', icon: 'ph-sun', clouds: 0.15, rain: false, rainDensity: 0, fog: 0.005, exposure: 1.15, color: 0xfff0b5 },
  cloudy: { label: '多云', icon: 'ph-cloud-sun', clouds: 0.52, rain: false, rainDensity: 0, fog: 0.010, exposure: 1.05, color: 0xe8eef5 },
  overcast: { label: '阴', icon: 'ph-cloud', clouds: 0.85, rain: false, rainDensity: 0, fog: 0.016, exposure: 0.92, color: 0xc4cdd5 },
  'light-rain': { label: '小雨', icon: 'ph-cloud-rain', clouds: 0.88, rain: true, rainDensity: 1200, rainSpeed: 16, fog: 0.020, exposure: 0.88, color: 0xb5c8d8 },
  'moderate-rain': { label: '中雨', icon: 'ph-cloud-rain', clouds: 0.94, rain: true, rainDensity: 2600, rainSpeed: 24, fog: 0.026, exposure: 0.80, color: 0x9cb4ca },
  'heavy-rain': { label: '大雨', icon: 'ph-cloud-lightning', clouds: 0.98, rain: true, rainDensity: 4500, rainSpeed: 34, fog: 0.035, exposure: 0.70, color: 0x829db5 }
};

const CROP_SPECS = {
  tomato: { label: '番茄', family: '茄果类 (Solanaceae)', stem: 0x2d6b38, leaf: 0x3da852, leafDark: 0x205f32, fruit: 0xed452a, height: 1.25, spacing: 0.52 },
  cucumber: { label: '黄瓜', family: '葫芦科 (Cucurbitaceae)', stem: 0x367c3e, leaf: 0x48b84d, leafDark: 0x246b30, fruit: 0x6bb83d, height: 1.45, spacing: 0.56 },
  rice: { label: '水稻', family: '禾本科 (Poaceae)', stem: 0x76ab3d, leaf: 0x98cb4a, leafDark: 0x568228, fruit: 0xe0c64a, height: 0.88, spacing: 0.38 },
  corn: { label: '玉米', family: '禾本科 (Poaceae)', stem: 0x3a7e3d, leaf: 0x5bb049, leafDark: 0x276630, fruit: 0xe8ba3c, height: 1.75, spacing: 0.60 }
};

const STAGE_SPECS = {
  seedling: { label: '苗期', scale: 0.42, density: 0.65, fruitScale: 0 },
  vegetative: { label: '营养生长期', scale: 0.74, density: 0.85, fruitScale: 0.1 },
  flowering: { label: '开花坐果期', scale: 0.92, density: 0.96, fruitScale: 0.55 },
  fruiting: { label: '挂果采收期', scale: 1.0, density: 1.0, fruitScale: 1.0 }
};

const PLOT_LAYOUTS = {
  'plot-a01': { x: -6.85, z: 3.25, width: 6.9, depth: 7.15, rotation: -0.035, name: 'A01 号地块', defaultCrop: 'tomato', defaultStage: 'fruiting' },
  'plot-a02': { x: 0.85, z: -1.65, width: 7.6, depth: 6.2, rotation: 0.016, name: 'A02 号地块', defaultCrop: 'corn', defaultStage: 'flowering' },
  'plot-b01': { x: 4.85, z: 6.55, width: 8.2, depth: 8.4, rotation: 0.032, name: 'B01 号地块', defaultCrop: 'rice', defaultStage: 'vegetative' }
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
const smoothstep = (min, max, value) => {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
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

function createSwayMaterial(color, roughness = 0.75) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.05,
    side: THREE.DoubleSide
  });
  material.userData.windUniforms = null;
  material.onBeforeCompile = shader => {
    shader.uniforms.uFarmTime = { value: 0 };
    shader.uniforms.uWindVector = { value: new THREE.Vector2(0.2, 0.08) };
    shader.uniforms.uBreeze = { value: 0.05 };
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
        float wave = sin(uFarmTime * 1.8 + aPhase + farmInstance.x * 0.42 + farmInstance.z * 0.38);
        float flutter = sin(uFarmTime * 4.6 + aPhase * 2.1 + position.y * 6.0);
        float windSpeed = length(uWindVector);
        transformed.x += farmFlex * (wave * uBreeze + uWindVector.x * 0.12 + flutter * windSpeed * 0.025);
        transformed.z += farmFlex * (cos(uFarmTime * 1.35 + aPhase) * uBreeze * 0.6 + uWindVector.y * 0.12);
      `);
    material.userData.windUniforms = shader.uniforms;
  };
  material.customProgramCacheKey = () => 'agriloop-crop-sway-v3';
  return material;
}

function attachInstancePhases(geometry, count, offset = 0) {
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    phases[i] = (i * 2.39996 + offset) % (Math.PI * 2);
  }
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  return geometry;
}

class CropFieldMesh {
  constructor(scene, plotId, layout, windMaterials) {
    this.scene = scene;
    this.plotId = plotId;
    this.layout = layout;
    this.windMaterials = windMaterials;
    this.group = new THREE.Group();
    this.group.position.set(layout.x, 0.12, layout.z);
    this.group.rotation.y = layout.rotation;
    scene.add(this.group);
  }

  clear() {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
      const idx = this.windMaterials.indexOf(child.material);
      if (idx >= 0) this.windMaterials.splice(idx, 1);
    }
  }

  build(cropCode, stageCode) {
    this.clear();
    const crop = CROP_SPECS[cropCode] || CROP_SPECS.tomato;
    const stage = STAGE_SPECS[stageCode] || STAGE_SPECS.fruiting;
    const plantHeight = crop.height * stage.scale;
    const spacing = crop.spacing / Math.sqrt(stage.density);
    const cols = Math.max(4, Math.floor((this.layout.width - 0.7) / spacing));
    const rows = Math.max(4, Math.floor((this.layout.depth - 0.7) / spacing));
    const count = cols * rows;

    const transforms = [];
    const dummy = new THREE.Object3D();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const seed = r * cols + c;
        transforms.push({
          x: (c / Math.max(1, cols - 1) - 0.5) * (this.layout.width - 0.7) + Math.sin(seed * 7.9) * 0.06,
          z: (r / Math.max(1, rows - 1) - 0.5) * (this.layout.depth - 0.7) + Math.cos(seed * 4.3) * 0.05,
          scale: 0.92 + (Math.sin(seed * 3.1) + 1) * 0.06,
          rotation: Math.sin(seed * 5.2) * 0.6
        });
      }
    }

    const addInstances = (geometry, material, configFn) => {
      attachInstancePhases(geometry, count, this.layout.x * 0.2);
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      transforms.forEach((item, idx) => {
        dummy.position.set(item.x, 0, item.z);
        dummy.rotation.set(0, item.rotation, 0);
        dummy.scale.setScalar(item.scale);
        configFn?.(dummy, item, idx);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      this.windMaterials.push(material);
      return mesh;
    };

    // Stems
    const stemRadius = cropCode === 'corn' ? 0.055 : cropCode === 'rice' ? 0.024 : 0.038;
    const stemGeom = new THREE.CylinderGeometry(stemRadius * 0.7, stemRadius, plantHeight, 6, 3);
    stemGeom.translate(0, plantHeight / 2, 0);
    createFlexAttribute(stemGeom);
    addInstances(stemGeom, createSwayMaterial(crop.stem));

    // Leaves
    const makeLeaf = (h, side, level, yaw, scaleX, scaleY, scaleZ) => {
      const g = new THREE.SphereGeometry(1, 8, 6);
      g.scale(0.18 * scaleX, 0.025 * scaleY, 0.09 * scaleZ);
      g.rotateY(yaw);
      g.rotateZ(side * 0.45);
      g.translate(side * 0.16 * scaleX, h * level, 0);
      return createFlexAttribute(g);
    };

    const isCorn = cropCode === 'corn';
    const isRice = cropCode === 'rice';
    const isCucumber = cropCode === 'cucumber';

    const sx = isCorn ? 1.8 : isRice ? 0.45 : isCucumber ? 1.3 : 1.0;
    const sy = isRice ? 1.4 : 1.0;
    const sz = isCorn ? 0.7 : isRice ? 0.35 : 1.0;

    const leaf1 = makeLeaf(plantHeight, -1, 0.55, -0.35, sx, sy, sz);
    const leaf2 = makeLeaf(plantHeight * 1.05, 1, 0.65, 0.3, sx, sy, sz);
    const leaf3 = makeLeaf(plantHeight * 0.9, 1, 0.38, -0.6, sx, sy, sz);
    const leaf4 = makeLeaf(plantHeight * 1.02, -1, 0.78, 0.6, sx, sy, sz);

    addInstances(leaf1, createSwayMaterial(crop.leaf, 0.85));
    addInstances(leaf2, createSwayMaterial(crop.leafDark, 0.85));
    addInstances(leaf3, createSwayMaterial(crop.leafDark, 0.88));
    addInstances(leaf4, createSwayMaterial(crop.leaf, 0.82));

    // Fruit / Grain clusters
    if (stage.fruitScale > 0) {
      let fruitGeom;
      if (cropCode === 'tomato') {
        fruitGeom = new THREE.SphereGeometry(0.085 * stage.fruitScale, 10, 8);
        fruitGeom.translate(0.13, plantHeight * 0.65, 0.05);
      } else if (cropCode === 'cucumber') {
        fruitGeom = new THREE.CylinderGeometry(0.04 * stage.fruitScale, 0.052 * stage.fruitScale, 0.32, 7);
        fruitGeom.rotateZ(0.3);
        fruitGeom.translate(0.14, plantHeight * 0.62, 0.05);
      } else if (cropCode === 'rice') {
        fruitGeom = new THREE.SphereGeometry(0.055, 6, 4);
        fruitGeom.scale(0.7, 2.6 * stage.fruitScale, 0.7);
        fruitGeom.translate(0.04, plantHeight * 0.95, 0);
      } else {
        // Corn cob
        fruitGeom = new THREE.SphereGeometry(0.09, 8, 6);
        fruitGeom.scale(0.85, 2.4 * stage.fruitScale, 0.85);
        fruitGeom.translate(0.12, plantHeight * 0.68, 0);
      }
      createFlexAttribute(fruitGeom);
      addInstances(fruitGeom, createSwayMaterial(crop.fruit, 0.65));
    }
  }

  destroy() {
    this.clear();
    this.scene.remove(this.group);
  }
}

class LivingFarm3DWorld {
  constructor(container, options = {}) {
    this.container = container;
    this.plots = options.plots || DEFAULT_PLOTS;
    this.onSelectPlot = options.onSelectPlot || (() => {});
    this.onDoubleSelectPlot = options.onDoubleSelectPlot || (() => {});
    this.onFrameUpdate = options.onFrameUpdate || (() => {});

    this.windMaterials = [];
    this.plotMeshes = new Map();
    this.plotGlows = new Map();
    this.cropFields = new Map();
    this.waterMaterials = [];
    this.particles = [];

    this.pointer = new THREE.Vector2(0, 0);
    this.pointerTarget = new THREE.Vector2(0, 0);
    this.lastPointerPos = null;
    this.windVector = new THREE.Vector2(0.15, 0.05);
    this.targetWindVector = new THREE.Vector2(0, 0);

    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Timer ? new THREE.Timer() : new THREE.Clock();
    this.weather = 'sunny';
    this.daylight = 1.0;
    this.isDestroyed = false;
    this.clickTimer = null;
  }

  init() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = 'farm-webgl-canvas';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xcfe3d2, 0.008);

    this.camera = new THREE.PerspectiveCamera(46, width / Math.max(1, height), 0.1, 200);
    this.camera.position.set(0, 13.5, 24.0);
    this.camera.lookAt(0, 1.4, 1.2);
    this.baseCameraPos = this.camera.position.clone();

    this.buildLights();
    this.buildTerrainAndCanals();
    this.buildPlots();
    this.buildVegetationAndBuildings();
    this.buildAtmosphericParticles();
    this.bindEvents();
    this.animate();
  }

  buildLights() {
    this.hemiLight = new THREE.HemisphereLight(0xe8f6ff, 0x476b38, 2.4);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff2ce, 4.2);
    this.sunLight.position.set(-18, 24, -15);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -26;
    this.sunLight.shadow.camera.right = 26;
    this.sunLight.shadow.camera.top = 24;
    this.sunLight.shadow.camera.bottom = -18;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 70;
    this.sunLight.shadow.bias = -0.0003;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Sun Visual Flare
    this.sunDisc = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xfffae0, toneMapped: false })
    );
    const flare = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 28, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, toneMapped: false })
    );
    this.sunDisc.add(core, flare);
    this.scene.add(this.sunDisc);
  }

  createWaterShader() {
    const uniforms = {
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(0x277a9e) },
      uShallowColor: { value: new THREE.Color(0x7ecbc3) },
      uSunGlint: { value: new THREE.Color(0xffeeb0) },
      uOpacity: { value: 0.88 }
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
          float w1 = sin(position.x * 2.4 + uTime * 1.4) * 0.04;
          float w2 = cos(position.y * 3.6 - uTime * 1.1) * 0.03;
          moved.z += w1 + w2;
          vWave = w1 + w2;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying float vWave;
        uniform float uTime;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uSunGlint;
        uniform float uOpacity;
        void main() {
          float ripple = sin((vUv.x * 24.0 + vUv.y * 24.0) + uTime * 2.2) * 0.05;
          float glint = pow(max(0.0, sin(vUv.x * 30.0 - uTime * 1.2) * cos(vUv.y * 22.0 + uTime * 0.8)), 10.0);
          vec3 col = mix(uDeepColor, uShallowColor, 0.45 + vWave * 5.0 + ripple);
          col += uSunGlint * glint * 0.45;
          gl_FragColor = vec4(col, uOpacity);
        }
      `
    });
    this.waterMaterials.push(material);
    return material;
  }

  buildTerrainAndCanals() {
    // Subtle ground elevation plane
    const groundGeom = new THREE.PlaneGeometry(74, 54, 64, 48);
    groundGeom.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x9fb688,
      roughness: 0.95,
      metalness: 0.0
    });
    this.groundMesh = new THREE.Mesh(groundGeom, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = -0.28;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // Water reservoir pond
    const pondGeom = new THREE.CircleGeometry(5.4, 48);
    const pondMesh = new THREE.Mesh(pondGeom, this.createWaterShader());
    pondMesh.rotation.x = -Math.PI / 2;
    pondMesh.position.set(4.8, -0.08, -7.2);
    pondMesh.receiveShadow = true;
    this.scene.add(pondMesh);

    // Interconnecting Irrigation Canals
    const canalMat = this.createWaterShader();
    const addCanal = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), canalMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, -0.06, z);
      m.receiveShadow = true;
      this.scene.add(m);
    };
    addCanal(25.0, 0.92, -1.8, 1.88);
    addCanal(28.0, 0.90, 0.5, 11.55);
    addCanal(0.90, 16.0, -3.48, 4.1);
    addCanal(0.90, 16.0, 8.95, 4.15);
  }

  buildPlots() {
    const soilBaseMat = new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 0.95 });
    const furrowMat = new THREE.MeshStandardMaterial({ color: 0x462f1c, roughness: 1.0 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xaa8b58, roughness: 0.88 });

    this.plots.forEach(plot => {
      const layout = PLOT_LAYOUTS[plot.plotId] || PLOT_LAYOUTS['plot-a01'];

      // Soil Bed
      const soil = new THREE.Mesh(new THREE.BoxGeometry(layout.width, 0.22, layout.depth), soilBaseMat.clone());
      soil.position.set(layout.x, -0.02, layout.z);
      soil.rotation.y = layout.rotation;
      soil.receiveShadow = true;
      soil.userData.plotId = plot.plotId;
      soil.userData.baseColor = soil.material.color.clone();
      this.scene.add(soil);
      this.plotMeshes.set(plot.plotId, soil);

      // Raised Edge Frame
      const edgeGroup = new THREE.Group();
      edgeGroup.position.set(layout.x, 0.05, layout.z);
      edgeGroup.rotation.y = layout.rotation;

      // Furrows
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        const furrow = new THREE.Mesh(new THREE.BoxGeometry(layout.width - 0.35, 0.045, 0.14), furrowMat);
        furrow.position.set(0, 0.08, (r / (rows - 1) - 0.5) * (layout.depth - 0.6));
        furrow.receiveShadow = true;
        edgeGroup.add(furrow);
      }
      this.scene.add(edgeGroup);

      // Neon Selection Border
      const neonMat = new THREE.MeshStandardMaterial({
        color: 0xffea9f,
        emissive: 0xffc44d,
        emissiveIntensity: 3.5,
        roughness: 0.3,
        toneMapped: false
      });
      const glowGroup = new THREE.Group();
      glowGroup.position.set(layout.x, 0.14, layout.z);
      glowGroup.rotation.y = layout.rotation;
      [
        [layout.width + 0.12, 0.035, 0.045, 0, -layout.depth / 2],
        [layout.width + 0.12, 0.035, 0.045, 0, layout.depth / 2],
        [0.045, 0.035, layout.depth, -layout.width / 2, 0],
        [0.045, 0.035, layout.depth, layout.width / 2, 0]
      ].forEach(([w, h, d, x, z]) => {
        const borderMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), neonMat);
        borderMesh.position.set(x, 0, z);
        glowGroup.add(borderMesh);
      });
      glowGroup.visible = plot.plotId === 'plot-a01';
      this.plotGlows.set(plot.plotId, glowGroup);
      this.scene.add(glowGroup);

      // 3D Crops
      const field = new CropFieldMesh(this.scene, plot.plotId, layout, this.windMaterials);
      field.build(plot.cropCode || layout.defaultCrop, plot.stageCode || layout.defaultStage);
      this.cropFields.set(plot.plotId, field);
    });
  }

  buildVegetationAndBuildings() {
    // Glass Greenhouse
    const greenhouse = new THREE.Group();
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xc8ece0,
      transmission: 0.6,
      transparent: true,
      opacity: 0.5,
      roughness: 0.15,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xebf3ec, roughness: 0.4, metalness: 0.4 });
    const glassBody = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.4, 3.1), glassMat);
    glassBody.position.y = 0.75;
    glassBody.castShadow = true;
    greenhouse.add(glassBody);

    for (let offset = -2.1; offset <= 2.1; offset += 1.05) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.1, 3.25), frameMat);
      rib.position.set(offset, 0.98, 0);
      rib.castShadow = true;
      greenhouse.add(rib);
    }
    greenhouse.position.set(-5.6, 0, -7.2);
    this.scene.add(greenhouse);

    // Weather Mast / Sensor Tower with pulsing LED
    const tower = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 4.2, 8), frameMat);
    mast.position.y = 2.1;
    mast.castShadow = true;
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x50e396, toneMapped: false })
    );
    led.position.y = 4.25;
    this.towerLed = led;
    tower.add(mast, led);
    tower.position.set(-8.8, 0, -6.5);
    this.scene.add(tower);
  }

  buildAtmosphericParticles() {
    // Rain Particles
    const rainCount = 3500;
    const rainGeom = new THREE.BufferGeometry();
    const rainPos = new Float32Array(rainCount * 3);
    const rainSpeeds = new Float32Array(rainCount);
    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 50;
      rainPos[i * 3 + 1] = Math.random() * 26;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 35;
      rainSpeeds[i] = 18 + Math.random() * 14;
    }
    rainGeom.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    this.rainPoints = new THREE.Points(
      rainGeom,
      new THREE.PointsMaterial({
        color: 0xc8e6ff,
        size: 0.08,
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    this.rainSpeeds = rainSpeeds;
    this.scene.add(this.rainPoints);

    // Sun Pollen / Dust Spores
    const pollenCount = 180;
    const pollenGeom = new THREE.BufferGeometry();
    const pollenPos = new Float32Array(pollenCount * 3);
    for (let i = 0; i < pollenCount; i++) {
      pollenPos[i * 3] = (Math.random() - 0.5) * 36;
      pollenPos[i * 3 + 1] = 0.5 + Math.random() * 8;
      pollenPos[i * 3 + 2] = (Math.random() - 0.5) * 28;
    }
    pollenGeom.setAttribute('position', new THREE.BufferAttribute(pollenPos, 3));
    this.pollenPoints = new THREE.Points(
      pollenGeom,
      new THREE.PointsMaterial({
        color: 0xfff3a8,
        size: 0.12,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.scene.add(this.pollenPoints);

    // Night Fireflies
    const fireflyCount = 120;
    const fireflyGeom = new THREE.BufferGeometry();
    const fireflyPos = new Float32Array(fireflyCount * 3);
    for (let i = 0; i < fireflyCount; i++) {
      fireflyPos[i * 3] = (Math.random() - 0.5) * 30;
      fireflyPos[i * 3 + 1] = 0.3 + Math.random() * 3.5;
      fireflyPos[i * 3 + 2] = (Math.random() - 0.5) * 24;
    }
    fireflyGeom.setAttribute('position', new THREE.BufferAttribute(fireflyPos, 3));
    this.fireflyPoints = new THREE.Points(
      fireflyGeom,
      new THREE.PointsMaterial({
        color: 0x88ff88,
        size: 0.16,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.scene.add(this.fireflyPoints);
  }

  bindEvents() {
    this.handleResize = () => this.resize();
    this.handlePointerMove = e => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const normY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.pointer.set(normX, normY);
      this.pointerTarget.set(normX, normY);

      const now = performance.now();
      if (this.lastPointerPos) {
        const dt = Math.max(10, now - this.lastPointerPos.time);
        const dx = e.clientX - this.lastPointerPos.x;
        const dy = e.clientY - this.lastPointerPos.y;
        const speed = Math.min(2.5, Math.hypot(dx, dy) / dt);
        this.targetWindVector.x = clamp(this.targetWindVector.x + (dx * 0.035) * speed, -3.0, 3.0);
        this.targetWindVector.y = clamp(this.targetWindVector.y - (dy * 0.035) * speed, -3.0, 3.0);
      }
      this.lastPointerPos = { x: e.clientX, y: e.clientY, time: now };
    };

    this.handlePointerLeave = () => {
      this.pointer.set(10, 10);
      this.pointerTarget.set(0, 0);
      this.lastPointerPos = null;
      this.highlightPlot(null);
    };

    this.handleClick = e => {
      clearTimeout(this.clickTimer);
      this.clickTimer = setTimeout(() => {
        const hit = this.pickPlot(e.clientX, e.clientY);
        if (hit) this.onSelectPlot(hit.plotId, hit.screen);
      }, 200);
    };

    this.handleDoubleClick = e => {
      clearTimeout(this.clickTimer);
      const hit = this.pickPlot(e.clientX, e.clientY);
      if (hit) this.onDoubleSelectPlot(hit.plotId, hit.screen);
    };

    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.addEventListener('click', this.handleClick);
    this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick);
  }

  pickPlot(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ptr = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ptr, this.camera);
    const hits = this.raycaster.intersectObjects([...this.plotMeshes.values()], false);
    if (!hits.length) return null;
    const plotId = hits[0].object.userData.plotId;
    return { plotId, screen: { x: clientX, y: clientY } };
  }

  highlightPlot(plotId) {
    this.plotMeshes.forEach((mesh, id) => {
      mesh.material.color.copy(mesh.userData.baseColor);
      mesh.material.emissive.set(id === plotId ? 0x224818 : 0x000000);
      mesh.material.emissiveIntensity = id === plotId ? 0.45 : 0;
    });
    this.renderer.domElement.style.cursor = plotId ? 'pointer' : 'default';
  }

  setSelectedPlot(plotId) {
    this.plotGlows.forEach((glow, id) => { glow.visible = id === plotId; });
  }

  setCropOverride(cropCode) {
    this.plots.forEach(plot => {
      const field = this.cropFields.get(plot.plotId);
      field?.build(cropCode || plot.cropCode || 'tomato', plot.stageCode || 'vegetative');
    });
  }

  setPlotStage(plotId, stageCode) {
    const plot = this.plots.find(p => p.plotId === plotId);
    if (plot) plot.stageCode = stageCode;
    const field = this.cropFields.get(plotId);
    field?.build(plot.cropCode || 'tomato', stageCode);
  }

  setWeather(weatherKey) {
    this.weather = WEATHER_CONFIG[weatherKey] ? weatherKey : 'sunny';
    const cfg = WEATHER_CONFIG[this.weather];
    this.scene.fog.density = cfg.fog;
    this.renderer.toneMappingExposure = cfg.exposure;
    this.rainPoints.material.opacity = cfg.rain ? (weatherKey === 'heavy-rain' ? 0.9 : weatherKey === 'moderate-rain' ? 0.7 : 0.45) : 0;
  }

  updateDaylightCycle(hour) {
    let daylight = 1.0;
    let warmth = 0.0;

    if (hour < 5.8 || hour >= 19.4) {
      // Night
      daylight = 0.05;
      warmth = 0.0;
    } else if (hour < 6.8) {
      // Sunrise transition (6:00)
      const p = smoothstep(5.8, 6.8, hour);
      daylight = 0.05 + p * 0.95;
      warmth = Math.sin(p * Math.PI) * 0.85;
    } else if (hour < 17.8) {
      // Day
      daylight = 1.0;
      warmth = 0.0;
    } else if (hour < 18.9) {
      // Sunset transition (18:00)
      const p = smoothstep(17.8, 18.9, hour);
      daylight = 1.0 - p * 0.95;
      warmth = Math.sin(p * Math.PI) * 0.95;
    } else {
      // Dusk
      const p = smoothstep(18.9, 19.4, hour);
      daylight = 0.15 - p * 0.1;
      warmth = 0.3 * (1 - p);
    }

    this.daylight = daylight;

    // Sun trajectory
    const sunProgress = clamp((hour - 5.8) / 13.4, 0, 1);
    const sunAngle = sunProgress * Math.PI;
    const sunX = lerp(-22, 10, sunProgress);
    const sunY = Math.max(-5, Math.sin(sunAngle) * 22);
    const sunZ = -16;

    this.sunDisc.position.set(sunX, sunY, sunZ);
    this.sunLight.position.set(sunX, Math.max(3, sunY), -12);

    this.sunLight.color.set(warmth > 0.2 ? 0xff9f58 : 0xfffae0);
    this.sunLight.intensity = 0.2 + daylight * 4.2;
    this.hemiLight.intensity = 0.3 + daylight * 2.2;
    this.sunDisc.visible = hour >= 5.7 && hour <= 19.2;

    // Star / firefly opacity
    const isNight = daylight < 0.25;
    this.fireflyPoints.material.opacity = isNight ? 0.75 : 0;
    this.pollenPoints.material.opacity = !isNight ? 0.45 : 0;
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  animate = () => {
    if (this.isDestroyed) return;
    requestAnimationFrame(this.animate);

    if (this.clock.getDelta) {
      this.clock.getDelta();
    }
    const elapsed = performance.now() * 0.001;

    // Wind physics decay & lerp
    this.targetWindVector.multiplyScalar(0.92);
    this.windVector.lerp(this.targetWindVector, 0.08);

    this.windMaterials.forEach(mat => {
      const u = mat.userData.windUniforms;
      if (!u) return;
      u.uFarmTime.value = elapsed;
      u.uWindVector.value.set(this.windVector.x, this.windVector.y);
      u.uBreeze.value = 0.045 + Math.sin(elapsed * 0.5) * 0.015;
    });

    this.waterMaterials.forEach(mat => {
      mat.uniforms.uTime.value = elapsed;
    });

    // Rain particles motion
    if (this.rainPoints.material.opacity > 0) {
      const pos = this.rainPoints.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - this.rainSpeeds[i] * 0.016;
        let x = pos.getX(i) + this.windVector.x * 0.015;
        if (y < -0.3) {
          y = 20 + Math.random() * 6;
          x = (Math.random() - 0.5) * 50;
        }
        pos.setXY(i, x, y);
      }
      pos.needsUpdate = true;
    }

    // Firefly / pollen gentle floating
    if (this.fireflyPoints.material.opacity > 0) {
      const pos = this.fireflyPoints.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, pos.getY(i) + Math.sin(elapsed * 2.0 + i) * 0.008);
      }
      pos.needsUpdate = true;
    }

    // Camera 2.5D Parallax
    this.camera.position.x = lerp(this.camera.position.x, this.baseCameraPos.x + this.pointerTarget.x * 0.9, 0.03);
    this.camera.position.y = lerp(this.camera.position.y, this.baseCameraPos.y + this.pointerTarget.y * 0.35, 0.03);
    this.camera.lookAt(this.pointerTarget.x * 0.35, 1.4, 1.2 - this.pointerTarget.y * 0.15);

    // Hover picking
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.plotMeshes.values()], false);
    this.highlightPlot(hits[0]?.object?.userData?.plotId || null);

    // Render
    this.renderer.render(this.scene, this.camera);

    // Project screen coordinates for 2D UI markers
    const markers = {};
    this.plots.forEach(plot => {
      const layout = PLOT_LAYOUTS[plot.plotId];
      if (!layout) return;
      const pt = new THREE.Vector3(layout.x, 0.35, layout.z + layout.depth * 0.42);
      const warnPt = new THREE.Vector3(layout.x, 1.4, layout.z);
      pt.project(this.camera);
      warnPt.project(this.camera);
      markers[plot.plotId] = {
        x: (pt.x * 0.5 + 0.5) * this.container.clientWidth,
        y: (-pt.y * 0.5 + 0.5) * this.container.clientHeight,
        warningX: (warnPt.x * 0.5 + 0.5) * this.container.clientWidth,
        warningY: (-warnPt.y * 0.5 + 0.5) * this.container.clientHeight,
        visible: pt.z > -1 && pt.z < 1
      };
    });
    this.onFrameUpdate(markers);
  };

  destroy() {
    this.isDestroyed = true;
    window.removeEventListener('resize', this.handleResize);
    this.renderer?.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer?.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    this.renderer?.domElement.removeEventListener('click', this.handleClick);
    this.renderer?.domElement.removeEventListener('dblclick', this.handleDoubleClick);
    this.cropFields.forEach(f => f.destroy());
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
    this.shell.innerHTML = this.renderHtml();
    document.body.appendChild(this.shell);

    this.cacheDom();
    this.bindEvents();
    this.createMarkers();

    try {
      this.world = new LivingFarm3DWorld(this.dom.worldHost, {
        plots: this.plots,
        onSelectPlot: (id, origin) => this.selectPlot(id, origin),
        onDoubleSelectPlot: id => this.openSandbox(id),
        onFrameUpdate: markers => this.updateMarkerPositions(markers)
      });
      this.world.init();
      this.world.setSelectedPlot(this.selectedPlotId);
      this.world.setWeather(this.weather);
    } catch (err) {
      console.error('[FarmMonitor] WebGL init error:', err);
    }

    this.startClock();
    this.resolveWeather();
    requestAnimationFrame(() => this.shell?.classList.add('active'));
  }

  renderHtml() {
    return `
      <div class="farm-world-host" data-world-host>
        <div class="farm-bg-layer farm-bg-day" data-bg="day"></div>
        <div class="farm-bg-layer farm-bg-sunrise" data-bg="sunrise"></div>
        <div class="farm-bg-layer farm-bg-sunset" data-bg="sunset"></div>
        <div class="farm-bg-layer farm-bg-night" data-bg="night"></div>
        <div class="farm-bg-layer farm-bg-rain" data-bg="rain"></div>
      </div>

      <!-- Left Glass Tool Rail -->
      <aside class="farm-tool-rail" aria-label="环境遥测与控制">
        <button class="farm-rail-back" type="button" data-farm-back title="返回主面板"><i class="ph ph-arrow-left"></i></button>
        <div class="farm-rail-metrics">
          <div class="farm-rail-metric clickable" data-action="open-weather" title="点击切换天气模式">
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
          <div class="farm-rail-metric farm-rail-time clickable" data-action="open-time" title="点击调整昼夜/日落/日出时间">
            <i class="ph ph-clock"></i>
            <strong data-clock>14:20:00</strong>
            <span data-date>08-23 周六</span>
          </div>
        </div>
        <div class="farm-rail-actions">
          <button type="button" data-action="location" title="当前地理位置"><i class="ph ph-map-pin"></i><span>地理位置</span></button>
          <button type="button" data-action="layers" title="图层与作物管理"><i class="ph ph-stack"></i><span>图层管理</span></button>
          <button type="button" data-action="camera-reset" title="视角平滑复位"><i class="ph ph-crosshair"></i><span>视角复位</span></button>
        </div>
      </aside>

      <!-- Title Lockup -->
      <header class="farm-title-lockup">
        <p>AGRILOOP · DIGITAL TWIN</p>
        <h1>农田动态监测</h1>
        <span data-location-text><i class="ph ph-map-pin"></i> 重庆 · 智慧农业示范区</span>
      </header>

      <!-- Top Right Crop Switcher -->
      <nav class="farm-crop-switcher" aria-label="切换农作物图层">
        <button class="active" type="button" data-crop="auto">自动</button>
        <button type="button" data-crop="tomato">番茄</button>
        <button type="button" data-crop="cucumber">黄瓜</button>
        <button type="button" data-crop="rice">水稻</button>
        <button type="button" data-crop="corn">玉米</button>
      </nav>

      <!-- 2D Marker Overlay Layer -->
      <div class="farm-marker-layer" data-marker-layer></div>

      <!-- Bottom Floating Indicators -->
      <div class="farm-wind-readout"><span class="farm-live-dot"></span><span>作物风场交互</span><strong data-wind-desc>自然微风 · 随鼠标拂动</strong></div>
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
      <div class="farm-toast" data-toast role="status"></div>
    `;
  }

  cacheDom() {
    const q = s => this.shell.querySelector(s);
    this.dom = {
      worldHost: q('[data-world-host]'),
      bgDay: q('[data-bg="day"]'),
      bgSunrise: q('[data-bg="sunrise"]'),
      bgSunset: q('[data-bg="sunset"]'),
      bgNight: q('[data-bg="night"]'),
      bgRain: q('[data-bg="rain"]'),
      markerLayer: q('[data-marker-layer]'),
      detailPanel: q('[data-detail-panel]'),
      toast: q('[data-toast]'),
      clock: q('[data-clock]'),
      date: q('[data-date]'),
      weatherIcon: q('[data-weather-icon]'),
      weatherLabel: q('[data-weather-label]'),
      temperature: q('[data-temperature]'),
      humidity: q('[data-humidity]'),
      windSpeed: q('[data-wind-speed]'),
      windDesc: q('[data-wind-desc]'),
      locationText: q('[data-location-text]'),
      cropSwitcher: q('.farm-crop-switcher'),
      timeDialog: q('[data-dialog="time"]'),
      weatherDialog: q('[data-dialog="weather"]'),
      timeSlider: q('[data-time-slider]'),
      sliderLabel: q('[data-slider-label]')
    };
  }

  bindEvents() {
    // Back
    this.shell.querySelector('[data-farm-back]').addEventListener('click', () => {
      this.close(false);
      this.onExit();
    });

    // Crop Switcher
    this.shell.querySelectorAll('[data-crop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const crop = btn.dataset.crop;
        this.cropOverride = crop === 'auto' ? null : crop;
        this.shell.querySelectorAll('[data-crop]').forEach(b => b.classList.toggle('active', b === btn));
        this.world?.setCropOverride(this.cropOverride);
        this.showToast(crop === 'auto' ? '已恢复 Crop Pack 各地块规划作物' : `全部地块作物图层已切换为【${CROP_SPECS[crop]?.label || crop}】`);
      });
    });

    // Action buttons in rail
    this.shell.querySelector('[data-action="camera-reset"]').addEventListener('click', () => {
      if (this.world) {
        this.world.pointerTarget.set(0, 0);
        this.world.camera.position.copy(this.world.baseCameraPos);
      }
      this.showToast('视角已平滑复位');
    });

    this.shell.querySelector('[data-action="layers"]').addEventListener('click', () => {
      this.dom.cropSwitcher?.classList.add('attention');
      setTimeout(() => this.dom.cropSwitcher?.classList.remove('attention'), 1500);
      this.showToast('可在右上角切换农作物图层');
    });

    this.shell.querySelector('[data-action="location"]').addEventListener('click', () => {
      this.showToast(`当前定位：${this.locationLabel}`);
    });

    this.shell.querySelector('[data-action="open-time"]').addEventListener('click', () => {
      this.dom.timeDialog.classList.add('open');
    });

    this.shell.querySelector('[data-action="open-weather"]').addEventListener('click', () => {
      this.dom.weatherDialog.classList.add('open');
    });

    // Dialog close buttons
    this.shell.querySelectorAll('[data-dialog-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.timeDialog.classList.remove('open');
        this.dom.weatherDialog.classList.remove('open');
      });
    });

    // Time Presets
    this.shell.querySelectorAll('[data-set-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hour = parseFloat(btn.dataset.setTime);
        this.simulatedHour = hour;
        this.applyHour(hour);
        this.dom.sliderLabel.textContent = `${hour.toFixed(1)}:00 (模拟)`;
        this.dom.timeSlider.value = hour;
        this.dom.timeDialog.classList.remove('open');
        this.showToast(`已切换至 ${hour}:00 光影模拟`);
      });
    });

    this.dom.timeSlider.addEventListener('input', e => {
      const hour = parseFloat(e.target.value);
      this.simulatedHour = hour;
      this.applyHour(hour);
      this.dom.sliderLabel.textContent = `${hour.toFixed(1)}:00 (模拟)`;
    });

    this.shell.querySelector('[data-reset-realtime]').addEventListener('click', () => {
      this.simulatedHour = null;
      this.dom.sliderLabel.textContent = '实时同步';
      this.dom.timeDialog.classList.remove('open');
      this.showToast('已恢复系统实时时间');
    });

    // Weather Presets
    this.shell.querySelectorAll('[data-set-weather]').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = btn.dataset.setWeather;
        this.applyWeather({ weather: w, temperature: 28.4, humidity: 58, windSpeed: 2.7 });
        this.dom.weatherDialog.classList.remove('open');
        this.showToast(`已切换为【${WEATHER_CONFIG[w]?.label || w}】特效`);
      });
    });

    // Panel delegated clicks
    this.dom.detailPanel.addEventListener('click', e => {
      if (e.target.closest('[data-panel-close]')) this.closePanel();
      if (e.target.closest('[data-panel-sandbox]')) this.openSandbox(this.selectedPlotId);
      const stageBtn = e.target.closest('[data-stage]');
      if (stageBtn) {
        const stage = stageBtn.dataset.stage;
        this.world?.setPlotStage(this.selectedPlotId, stage);
        this.dom.detailPanel.querySelectorAll('[data-stage]').forEach(b => b.classList.toggle('active', b === stageBtn));
        this.showToast(`地块已切换至【${STAGE_SPECS[stage]?.label || stage}】阶段`);
      }
      if (e.target.closest('[data-action-irrigate]')) {
        this.showToast('已触发微喷灌电磁阀：计划灌溉 15 分钟');
      }
    });

    window.addEventListener('keydown', this.handleEsc = e => {
      if (e.key === 'Escape') {
        if (this.dom.timeDialog.classList.contains('open') || this.dom.weatherDialog.classList.contains('open')) {
          this.dom.timeDialog.classList.remove('open');
          this.dom.weatherDialog.classList.remove('open');
        } else if (this.dom.detailPanel.classList.contains('open')) {
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

  updateMarkerPositions(markers) {
    Object.entries(markers).forEach(([plotId, pos]) => {
      const marker = this.dom.markerLayer.querySelector(`[data-marker="${plotId}"]`);
      if (!marker) return;
      marker.style.setProperty('--marker-x', `${pos.x}px`);
      marker.style.setProperty('--marker-y', `${pos.y}px`);
      marker.classList.toggle('visible', pos.visible);
      const warn = marker.querySelector('.farm-warning-beacon');
      if (warn) {
        warn.style.setProperty('--warning-x', `${pos.warningX - pos.x}px`);
        warn.style.setProperty('--warning-y', `${pos.warningY - pos.y}px`);
      }
    });
  }

  selectPlot(plotId, origin = { x: window.innerWidth - 20, y: window.innerHeight / 2 }) {
    this.selectedPlotId = plotId;
    this.world?.setSelectedPlot(plotId);
    this.openPanel(plotId, origin);
  }

  openPanel(plotId, origin) {
    const plot = this.plots.find(p => p.plotId === plotId) || this.plots[0];
    if (!plot) return;
    const cropCode = this.cropOverride || plot.cropCode || 'tomato';
    const crop = CROP_SPECS[cropCode] || CROP_SPECS.tomato;
    const stageCode = plot.stageCode || 'fruiting';
    const stage = STAGE_SPECS[stageCode] || STAGE_SPECS.fruiting;
    const metrics = plot.metrics || {};

    this.dom.detailPanel.style.setProperty('--panel-origin-x', `${origin.x}px`);
    this.dom.detailPanel.style.setProperty('--panel-origin-y', `${origin.y}px`);

    this.dom.detailPanel.innerHTML = `
      <div class="farm-panel-head">
        <div>
          <span>${plot.plotId.replace('plot-', '').toUpperCase()} · ${crop.family}</span>
          <h2>${plot.name}</h2>
          <p>${crop.label} · 当前生长阶段：${stage.label}</p>
        </div>
        <button type="button" data-panel-close aria-label="关闭"><i class="ph ph-x"></i></button>
      </div>

      <div class="farm-health-row">
        <div>
          <span>作物健康度</span>
          <strong>${Math.round((plot.healthScore || 0.96) * 100)}%</strong>
        </div>
        <div>
          <span>设备在线</span>
          <strong class="online"><i class="ph ph-broadcast"></i> 正常</strong>
        </div>
        <div>
          <span>风险等级</span>
          <strong class="risk-${String(plot.riskLevel || 'LOW').toLowerCase()}">${plot.riskLevel || 'LOW'}</strong>
        </div>
      </div>

      <section class="farm-panel-section">
        <div class="farm-section-title">
          <span>实时遥测传感器 (IoT)</span>
          <small>1秒前更新</small>
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
        <canvas class="farm-chart" data-farm-chart></canvas>
        <div class="farm-chart-legend">
          <span><i></i>土壤湿度曲线</span>
          <strong>适宜区间 20~40%</strong>
        </div>
      </section>

      <section class="farm-panel-section">
        <div class="farm-section-title">
          <span>作物生长阶段调控</span>
          <small>点击即时切换3D生长状态</small>
        </div>
        <div class="farm-stage-track">
          ${Object.entries(STAGE_SPECS).map(([code, s]) => `
            <button class="farm-stage-btn ${code === stageCode ? 'active' : ''}" type="button" data-stage="${code}">
              <i></i><span>${s.label}</span>
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
        <small>双击地块亦可进入</small>
      </button>
    `;

    this.dom.detailPanel.classList.add('open');
    requestAnimationFrame(() => this.drawChart(plot));
  }

  drawChart(plot) {
    const canvas = this.dom.detailPanel.querySelector('[data-farm-chart]');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    const w = rect.width;
    const h = rect.height;
    const baseVal = Number(plot.metrics?.SOIL_MOISTURE?.value || 25);
    const dataPoints = Array.from({ length: 24 }, (_, i) => {
      return baseVal + Math.sin(i * 0.45) * 3.5 + Math.cos(i * 0.25) * 1.8 + (i - 23) * 0.15;
    });

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(18, 59, 46, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h / 4) * i);
      ctx.lineTo(w, (h / 4) * i);
      ctx.stroke();
    }

    const min = Math.min(...dataPoints) - 2;
    const max = Math.max(...dataPoints) + 2;

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(47, 158, 103, 0.35)');
    grad.addColorStop(1, 'rgba(47, 158, 103, 0.0)');

    ctx.beginPath();
    dataPoints.forEach((val, i) => {
      const x = (i / (dataPoints.length - 1)) * w;
      const y = h - ((val - min) / (max - min)) * (h - 16) - 8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    dataPoints.forEach((val, i) => {
      const x = (i / (dataPoints.length - 1)) * w;
      const y = h - ((val - min) / (max - min)) * (h - 16) - 8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#2f9e67';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  closePanel() {
    this.dom.detailPanel?.classList.remove('open');
  }

  openSandbox(plotId) {
    this.onSandbox(plotId);
    this.showToast(`正在构建【${plotId.replace('plot-', '').toUpperCase()}】数字孪生情景沙盘推演...`);
  }

  startClock() {
    const tick = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();
      const decimalHour = h + m / 60 + s / 3600;

      this.dom.clock.textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
      this.dom.date.textContent = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]}`;

      if (this.simulatedHour === null) {
        this.applyHour(decimalHour);
      }
    };
    tick();
    this.clockInterval = setInterval(tick, 1000);
  }

  applyHour(hour) {
    this.world?.updateDaylightCycle(hour);

    // Crossfade background layers
    let dayO = 0, sunriseO = 0, sunsetO = 0, nightO = 0, rainO = 0;

    if (this.weather.includes('rain')) {
      rainO = 1;
    } else if (hour < 5.8 || hour >= 19.4) {
      nightO = 1;
    } else if (hour < 6.8) {
      const p = smoothstep(5.8, 6.8, hour);
      sunriseO = 1 - Math.abs(p - 0.5) * 0.4;
      dayO = p;
      nightO = 1 - p;
    } else if (hour < 17.8) {
      dayO = 1;
    } else if (hour < 18.9) {
      const p = smoothstep(17.8, 18.9, hour);
      sunsetO = 1 - Math.abs(p - 0.5) * 0.4;
      dayO = 1 - p;
      nightO = p * 0.8;
    } else {
      nightO = 1;
    }

    if (this.dom.bgDay) this.dom.bgDay.style.opacity = dayO;
    if (this.dom.bgSunrise) this.dom.bgSunrise.style.opacity = sunriseO;
    if (this.dom.bgSunset) this.dom.bgSunset.style.opacity = sunsetO;
    if (this.dom.bgNight) this.dom.bgNight.style.opacity = nightO;
    if (this.dom.bgRain) this.dom.bgRain.style.opacity = rainO;
  }

  async resolveWeather() {
    const fallback = { latitude: 29.56, longitude: 106.55, label: '重庆 · 智慧农业示范区' };
    let place = fallback;

    if ('geolocation' in navigator) {
      place = await new Promise(res => {
        navigator.geolocation.getCurrentPosition(
          pos => res({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, label: '当前位置 · 智慧农业站' }),
          () => res(fallback),
          { timeout: 3000 }
        );
      });
    }

    this.locationLabel = place.label;
    if (this.dom.locationText) this.dom.locationText.innerHTML = `<i class="ph ph-map-pin"></i> ${place.label}`;

    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,precipitation,wind_speed_10m&timezone=auto`);
      if (res.ok) {
        const data = await res.json();
        const cur = data.current;
        let w = 'sunny';
        const code = cur.weather_code;
        const prec = cur.precipitation;
        if (code >= 65 || prec >= 7.5) w = 'heavy-rain';
        else if (code >= 63 || prec >= 2.5) w = 'moderate-rain';
        else if (code >= 51 || prec > 0) w = 'light-rain';
        else if ([3, 45, 48].includes(code)) w = 'overcast';
        else if ([1, 2].includes(code)) w = 'cloudy';

        this.applyWeather({
          weather: w,
          temperature: cur.temperature_2m,
          humidity: cur.relative_humidity_2m,
          windSpeed: (cur.wind_speed_10m / 3.6).toFixed(1)
        });
        return;
      }
    } catch (e) {
      console.info('[FarmMonitor] Weather API fallback to default.');
    }

    this.applyWeather({ weather: 'sunny', temperature: 28.4, humidity: 58, windSpeed: 2.7 });
  }

  applyWeather({ weather, temperature, humidity, windSpeed }) {
    this.weather = weather;
    this.temperature = Number(temperature);
    this.humidity = Math.round(Number(humidity));
    this.windSpeed = Number(windSpeed);

    const cfg = WEATHER_CONFIG[weather] || WEATHER_CONFIG.sunny;
    this.dom.weatherLabel.textContent = cfg.label;
    this.dom.weatherIcon.className = `ph ${cfg.icon}`;
    this.dom.temperature.textContent = `${this.temperature.toFixed(1)}°C`;
    this.dom.humidity.textContent = `${this.humidity}%`;
    this.dom.windSpeed.textContent = `${this.windSpeed} m/s`;

    this.world?.setWeather(weather);
    if (this.simulatedHour !== null) this.applyHour(this.simulatedHour);
    else this.applyHour(new Date().getHours());
  }

  showToast(msg) {
    clearTimeout(this.toastTimer);
    this.dom.toast.textContent = msg;
    this.dom.toast.classList.add('show');
    this.toastTimer = setTimeout(() => this.dom.toast?.classList.remove('show'), 2200);
  }

  close(notify = true) {
    if (!this.isOpen) return;
    this.isOpen = false;
    clearInterval(this.clockInterval);
    clearTimeout(this.toastTimer);
    window.removeEventListener('keydown', this.handleEsc);
    this.world?.destroy();
    this.world = null;
    this.shell?.remove();
    this.shell = null;
    document.body.classList.remove('farm-monitor-open');
    if (notify) this.onExit();
  }
}
