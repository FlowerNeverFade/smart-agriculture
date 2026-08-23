/**
 * AgriLoop Frontend - 3D 盆栽场景 v3（Three.js · rium 级着色器方案）
 * 架构对标 rium-background：GLSL 大气天空、顶点级风场与萎蔫（ShaderMaterial）、
 * 情景调色板插值、天体（太阳/月亮）升降、粒子雨、InstancedMesh 合并 draw call、60fps 优化。
 * WebGL 不可用时返回 null，调用方回退 SVG。
 */

function ensureThree() {
  if (typeof window !== 'undefined' && window.THREE) return Promise.resolve(window.THREE);
  return import('../vendor/three.module.min.js')
    .then((mod) => mod.default || null)
    .catch((e) => { console.warn('three.js load failed:', e); return null; });
}

/* ================= GLSL 大气天空 ================= */
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uSunDir;
  uniform float uSunGlow;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.52 + 0.32, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.02, 0.78, h));
    float rayleigh = pow(1.0 - max(dir.y, 0.0), 2.6);
    col = mix(col, uHaze * vec3(1.08, 0.9, 0.68), rayleigh * mix(0.1, 0.34, uSunGlow));
    float band = exp(-pow((h - 0.06) / 0.12, 2.0));
    col = mix(col, uHaze, band * mix(0.18, 0.58, uSunGlow));
    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float sunDisk = smoothstep(0.992, 0.9996, sunDot) * uSunGlow;
    col = mix(col, vec3(1.0, 0.88, 0.55), sunDisk);
    col += vec3(1.0, 0.7, 0.32) * pow(sunDot, 5.0) * uSunGlow * 0.26;
    col += vec3(1.0, 0.82, 0.48) * pow(sunDot, 16.0) * uSunGlow * 0.18;
    col += vec3(1.0, 0.92, 0.66) * pow(sunDot, 80.0) * uSunGlow * 0.22;
    float ang = atan(dir.x, dir.z);
    float shafts = pow(sunDot, 9.0) * (0.5 + 0.5 * sin(ang * 14.0 + dir.y * 6.0));
    col += vec3(1.0, 0.76, 0.38) * shafts * uSunGlow * 0.1;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ================= 植物着色器（顶点风场 + 萎蔫 + 部位分色） ================= */
const PLANT_VERT = /* glsl */ `
  attribute float aHeight;
  attribute vec3 aPart;      // 部位权重 (r=茎, g=叶, b=果)
  uniform float uTime;
  uniform vec2 uWindDir;
  uniform float uWind;       // 风速 0..1
  uniform float uWilt;       // 萎蔫 0..1
  varying vec3 vPart;
  varying float vH;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vPart = aPart;
    vH = aHeight;
    vec3 pos = position;
    vec2 wpos = position.xz * 0.8;
    vec2 windDir = normalize(uWindDir);
    vec2 crossDir = vec2(-windDir.y, windDir.x);
    float along = dot(wpos, windDir);
    float cross = dot(wpos, crossDir);
    float swell = sin(along * 1.7 - uTime * 1.5);
    float ripple = sin(along * 3.2 - uTime * 2.3 + cross * 1.4) * 0.3;
    float wind = (swell * 0.75 + ripple * 0.25) * uWind;
    float bend = pow(clamp(aHeight, 0.0, 1.0), 1.5);
    vec2 offset = windDir * wind * bend * 0.42;
    offset += crossDir * sin(along * 2.1 - uTime * 2.0 + aHeight * 3.2) * bend * bend * 0.07 * uWind;
    offset -= windDir * uWilt * bend * 0.5;
    pos.x += offset.x;
    pos.z += offset.y;
    pos.y -= uWilt * bend * bend * 0.5;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    #include <fog_vertex>
  }
`;
const PLANT_FRAG = /* glsl */ `
  uniform vec3 uStem;
  uniform vec3 uLeaf;
  uniform vec3 uLeafWilt;
  uniform vec3 uFruit;
  uniform vec3 uFruitDim;
  uniform float uMoisture;   // 0..1（干→湿）
  uniform float uOffline;    // 0/1
  uniform float uHueShift;   // 情景色偏
  varying vec3 vPart;
  varying float vH;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec3 leaf = mix(uLeaf, uLeafWilt, 1.0 - uMoisture);
    vec3 col = vPart.r * uStem + vPart.g * leaf + vPart.b * mix(uFruit, uFruitDim, 1.0 - uMoisture);
    // 简单光影：高度暗化 + 风侧高光感
    col *= 0.82 + 0.28 * smoothstep(0.0, 1.0, vH);
    col *= 0.94 + 0.08 * sin(vH * 40.0);
    col = mix(col, vec3(0.5), uOffline * 0.72);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

/* ================= 情景调色板（对标 rium 双主题，这里按情景） ================= */
const PALETTES = {
  normal: {
    sky: 0x070b16, zenith: 0x050814, horizon: 0x1c2a4a, haze: 0x7a8ab8, fog: 0x0c1220,
    fogNear: 7, fogFar: 16, exposure: 0.95, sunGlow: 1,
    sun: 0xc4d2ee, sunIntensity: 1.15, ambient: 0.3, hemi: 0.4,
    leaf: 0x3fb950, leafWilt: 0x8a8a4a, stem: 0x2f7a42, fruit: 0xf85149, fruitDim: 0x9a3a30,
    soil: 0x4a3624, wind: 0.55, hue: 0
  },
  drought: {
    sky: 0x141008, zenith: 0x1a1308, horizon: 0x6a4a22, haze: 0xa0804a, fog: 0x241a0c,
    fogNear: 6.5, fogFar: 15, exposure: 1.1, sunGlow: 1.3,
    sun: 0xffd080, sunIntensity: 1.6, ambient: 0.32, hemi: 0.42,
    leaf: 0x8a8a3a, leafWilt: 0xb89a50, stem: 0x6a6a30, fruit: 0xc07040, fruitDim: 0x7a4a2a,
    soil: 0x7a5c38, wind: 0.3, hue: 0.08
  },
  heat: {
    sky: 0x160a08, zenith: 0x1c0c08, horizon: 0x7a3a24, haze: 0xc06040, fog: 0x2a1008,
    fogNear: 6.5, fogFar: 15, exposure: 1.18, sunGlow: 1.6,
    sun: 0xff6a3a, sunIntensity: 2.0, ambient: 0.34, hemi: 0.4,
    leaf: 0x6a9a3a, leafWilt: 0xa88040, stem: 0x5a7a30, fruit: 0xe06040, fruitDim: 0x8a3a28,
    soil: 0x6a4a28, wind: 0.45, hue: 0.14
  },
  storm: {
    sky: 0x0a0e18, zenith: 0x080c14, horizon: 0x24344e, haze: 0x4a5a78, fog: 0x101820,
    fogNear: 5.5, fogFar: 13, exposure: 0.8, sunGlow: 0.06,
    sun: 0x88aaff, sunIntensity: 0.4, ambient: 0.24, hemi: 0.34,
    leaf: 0x2f8a4a, leafWilt: 0x4a6a3a, stem: 0x266a38, fruit: 0xb05048, fruitDim: 0x6a3a34,
    soil: 0x3a2c20, wind: 1.0, hue: -0.06
  },
  drift: {
    sky: 0x0c0a16, zenith: 0x0a0814, horizon: 0x2a2448, haze: 0x8a7ab8, fog: 0x141020,
    fogNear: 7, fogFar: 16, exposure: 0.95, sunGlow: 0.9,
    sun: 0xc0b0ee, sunIntensity: 1.05, ambient: 0.3, hemi: 0.4,
    leaf: 0x4a9a5a, leafWilt: 0x8a8a5a, stem: 0x3a7a4a, fruit: 0xc060a0, fruitDim: 0x8a3a6a,
    soil: 0x4a3a2c, wind: 0.5, hue: 0.12
  },
  offline: {
    sky: 0x0c0e10, zenith: 0x0a0c0e, horizon: 0x1c2024, haze: 0x4a4e52, fog: 0x141618,
    fogNear: 6, fogFar: 14, exposure: 0.85, sunGlow: 0.15,
    sun: 0x9aa0a8, sunIntensity: 0.5, ambient: 0.26, hemi: 0.3,
    leaf: 0x6a6e6a, leafWilt: 0x7a7e7a, stem: 0x5a5e5a, fruit: 0x808080, fruitDim: 0x6a6a6a,
    soil: 0x3a3c3e, wind: 0.1, hue: 0
  }
};

const NUM_KEYS = ['fogNear', 'fogFar', 'exposure', 'sunGlow', 'sunIntensity', 'ambient', 'hemi', 'wind', 'hue'];
const COL_KEYS = ['sky', 'zenith', 'horizon', 'haze', 'fog', 'sun', 'leaf', 'leafWilt', 'stem', 'fruit', 'fruitDim', 'soil'];

function lerpNum(a, b, t) { return a + (b - a) * t; }
function mixPalettes(a, b, t, THREE) {
  const out = {};
  for (const k of NUM_KEYS) out[k] = lerpNum(a[k], b[k], t);
  for (const k of COL_KEYS) out[k] = new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t).getHex();
  return out;
}

/* ================= 几何构建（全部 merge 成单 BufferGeometry，一次 draw call） ================= */
function mergeGeometries(THREE, geometries, parts, offsets) {
  const positions = [];
  const indices = [];
  const heights = [];
  const partColors = [];
  let offset = 0;
  geometries.forEach((geo, gi) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      heights.push(offsets[gi].h);
      partColors.push(parts[gi][0], parts[gi][1], parts[gi][2]);
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) indices.push(geo.index.getX(i) + offset);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(offset + i);
    }
    offset += pos.count;
    geo.dispose();
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setIndex(indices);
  merged.setAttribute('aHeight', new THREE.Float32BufferAttribute(heights, 1));
  merged.setAttribute('aPart', new THREE.Float32BufferAttribute(partColors, 3));
  merged.computeVertexNormals();
  return merged;
}

/** 单位叶形（UV 与叶脉纹理无关——v3 用顶点色分部位） */
function leafShape(THREE) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.14, -0.07, 0.32, 0);
  s.quadraticCurveTo(0.14, 0.07, 0, 0);
  return s;
}

function buildPlantGeometry(THREE, cropCode) {
  const geos = [];
  const parts = []; // [r,g,b] 部位权重
  const offsets = []; // {h: 高度 0..1}

  const push = (geo, part, h) => { geos.push(geo); parts.push(part); offsets.push({ h }); };

  // 分节茎（圆柱段，带节凸）
  const stemSegs = [
    { r0: 0.028, r1: 0.034, y: 0.0, hgt: 0.52, h: 0.06 },
    { r0: 0.023, r1: 0.028, y: 0.5, hgt: 0.5, h: 0.4 },
    { r0: 0.018, r1: 0.023, y: 0.98, hgt: 0.48, h: 0.75 }
  ];
  stemSegs.forEach(s => {
    const g = new THREE.CylinderGeometry(s.r1, s.r0, s.hgt, 10);
    g.translate(0, s.y + s.hgt / 2, 0);
    g.rotateZ((Math.random() - 0.5) * 0.12);
    push(g, [1, 0, 0], s.h);
    const node = new THREE.SphereGeometry(s.r1 * 1.35, 8, 6);
    node.scale(1, 0.55, 1);
    node.translate(0, s.y + s.hgt, 0);
    push(node, [1, 0, 0], s.h);
  });

  // 叶片（按作物）
  const leafGeo = new THREE.ShapeGeometry(leafShape(THREE));
  const makeLeafAt = (x, y, rot, size, height, back = false) => {
    const g = leafGeo.clone();
    g.translate(0.16 * size, 0, 0);
    g.rotateZ(rot);
    g.scale(size, size, 1);
    g.translate(x, y, back ? -0.01 : 0.01);
    push(g, [0, 1, 0], height);
  };

  if (cropCode === 'tomato') {
    // 羽状复叶 ×4 层（叶轴 + 4 对小叶）
    [[0.0, 0.5, 0.22, 0.3], [-0.06, 0.9, -0.2, 0.35], [0.05, 1.25, 0.24, 0.3], [-0.04, 1.55, -0.26, 0.26]].forEach(([x, y, rot, s], li) => {
      const h = 0.3 + li * 0.17;
      const axis = new THREE.BoxGeometry(0.34 * s, 0.006, 0.014);
      axis.translate(x + 0.17 * s, y, 0);
      axis.rotateZ(rot);
      push(axis, [1, 0, 0], h);
      // 顶小叶 + 4 对小叶
      makeLeafAt(x + 0.34 * s, y, rot - 0.15, 0.13 * s, h);
      for (let i = 0; i < 4; i++) {
        const ss = (0.13 - i * 0.018) * s;
        const px = x + (0.26 - i * 0.065) * s;
        makeLeafAt(px, y + 0.008, rot + 0.7 + i * 0.2, ss, h);
        makeLeafAt(px, y - 0.008, rot - 0.7 - i * 0.2, ss, h);
      }
    });
  } else if (cropCode === 'cucumber') {
    // 掌状叶 + 卷须
    [[0.04, 0.55, 0.15], [-0.06, 0.95, -0.12], [0.06, 1.3, 0.2], [-0.05, 1.55, -0.18]].forEach(([x, y, rot], li) => {
      const h = 0.3 + li * 0.17;
      for (let i = 0; i < 5; i++) {
        const ang = rot + (i - 2) * 0.5;
        makeLeafAt(x + Math.cos(ang) * 0.06, y + Math.sin(ang) * 0.02, ang, 0.14, h);
      }
      const tend = new THREE.CylinderGeometry(0.004, 0.004, 0.28, 6);
      tend.translate(x + 0.06, y + 0.14, 0);
      tend.rotateZ(rot + 0.5);
      push(tend, [1, 0, 0], h);
    });
  } else if (cropCode === 'strawberry') {
    [[0.02, 0.4, 0.1], [-0.05, 0.75, -0.08], [0.04, 1.05, 0.14]].forEach(([x, y, rot], li) => {
      const h = 0.25 + li * 0.2;
      for (let i = 0; i < 3; i++) {
        const ang = rot + (i - 1) * 0.7;
        makeLeafAt(x + Math.sin(ang) * 0.05, y + Math.cos(ang) * 0.02, ang * 0.7, 0.15, h);
      }
    });
  } else {
    // pepper：长叶对生
    [[0.02, 0.5, 0.12], [-0.05, 0.9, -0.1], [0.05, 1.3, 0.16], [-0.04, 1.58, -0.14]].forEach(([x, y, rot], li) => {
      const h = 0.3 + li * 0.17;
      makeLeafAt(x + 0.02, y, rot + 0.35, 0.17, h);
      makeLeafAt(x - 0.02, y, rot - 0.35, 0.17, h);
    });
  }

  // 果实
  const addFruit = (x, y, z, sx, sy, sz) => {
    const f = new THREE.SphereGeometry(0.075, 16, 14);
    f.scale(sx, sy, sz);
    f.translate(x, y, z);
    push(f, [0, 0, 1], 0.55);
    const cal = new THREE.SphereGeometry(0.03, 8, 6);
    cal.scale(1.3, 0.5, 1.3);
    cal.translate(x, y + 0.07 * sy, z);
    push(cal, [1, 0, 0], 0.6);
  };
  if (cropCode === 'tomato') {
    addFruit(0.12, 0.3, 0.03, 1, 1.05, 1);
    addFruit(-0.13, 0.62, -0.02, 0.9, 0.95, 0.9);
    addFruit(0.16, 0.98, 0.04, 0.95, 1, 0.95);
    addFruit(-0.1, 1.35, -0.03, 0.85, 0.9, 0.85);
  } else if (cropCode === 'cucumber') {
    addFruit(0.13, 0.32, 0.03, 0.7, 1.9, 0.7);
    addFruit(-0.14, 0.68, -0.02, 0.65, 1.7, 0.65);
  } else if (cropCode === 'strawberry') {
    addFruit(0.1, 0.2, 0.02, 1.05, 0.85, 1);
    addFruit(-0.12, 0.55, -0.02, 0.95, 0.8, 0.9);
  } else {
    addFruit(0.13, 0.32, 0.03, 0.55, 1.7, 0.55);
    addFruit(-0.13, 0.7, -0.02, 0.5, 1.5, 0.5);
    addFruit(0.15, 1.08, 0.04, 0.5, 1.4, 0.5);
  }

  return mergeGeometries(THREE, geos, parts, offsets);
}

/* ================= 天空/天体纹理 ================= */
function makeCelestialTexture(THREE, kind) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const cx = size / 2, cy = size / 2, r = size * 0.46;
  if (kind === 'sun') {
    const halo = x.createRadialGradient(cx, cy, r * 0.46, cx, cy, r);
    halo.addColorStop(0, 'rgba(255,220,150,0.16)');
    halo.addColorStop(0.5, 'rgba(255,200,110,0.05)');
    halo.addColorStop(1, 'rgba(255,190,80,0)');
    x.fillStyle = halo; x.fillRect(0, 0, size, size);
    const dr = r * 0.34;
    const body = x.createRadialGradient(cx - dr * 0.22, cy - dr * 0.22, 0, cx, cy, dr);
    body.addColorStop(0, 'rgba(255,240,185,1)');
    body.addColorStop(0.6, 'rgba(252,222,150,1)');
    body.addColorStop(1, 'rgba(238,192,92,1)');
    x.fillStyle = body;
    x.beginPath(); x.arc(cx, cy, dr, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(160,92,24,0.92)'; x.lineWidth = 3.5;
    x.beginPath(); x.arc(cx, cy, dr, 0, Math.PI * 2); x.stroke();
  } else {
    const halo = x.createRadialGradient(cx, cy, r * 0.28, cx, cy, r);
    halo.addColorStop(0, 'rgba(220,228,242,0.28)');
    halo.addColorStop(1, 'rgba(180,190,210,0)');
    x.fillStyle = halo; x.fillRect(0, 0, size, size);
    const dr = r * 0.3;
    const body = x.createRadialGradient(cx - dr * 0.25, cy - dr * 0.25, 0, cx, cy, dr);
    body.addColorStop(0, 'rgba(246,250,255,1)');
    body.addColorStop(1, 'rgba(206,214,232,1)');
    x.fillStyle = body;
    x.beginPath(); x.arc(cx, cy, dr, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(168,178,198,0.4)';
    for (const [ox, oy, rr] of [[0.12, -0.08, 0.09], [-0.14, 0.1, 0.07], [0.05, 0.16, 0.06]]) {
      x.beginPath(); x.arc(cx + ox * r, cy + oy * r, rr * r, 0, Math.PI * 2); x.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ================= 主场景 ================= */
export async function createPotScene(canvas, opts = {}) {
  const cropCode = opts.cropCode || 'tomato';
  const THREE = await ensureThree();
  if (!THREE) return null;

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
  const HOME = { x: 0.55, y: 2.1, z: 4.6 };
  camera.position.set(HOME.x, HOME.y, HOME.z);
  camera.lookAt(0, 1.4, 0);

  let palette = { ...PALETTES.normal };
  let mouseX = 0, mouseY = 0;
  let rafId = 0;
  let visible = !document.hidden;
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.fog, palette.fogNear, palette.fogFar);

  // 光照
  const hemi = new THREE.HemisphereLight(palette.zenith, palette.soil, palette.hemi);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, palette.ambient);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(palette.sun, palette.sunIntensity);
  sun.position.set(4, 6, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -3; sun.shadow.camera.right = 3;
  sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -1;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 14;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // GLSL 天空穹顶
  const skyGeo = new THREE.SphereGeometry(24, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(palette.zenith) },
      uHorizon: { value: new THREE.Color(palette.horizon) },
      uHaze: { value: new THREE.Color(palette.haze) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.55, -0.55).normalize() },
      uSunGlow: { value: palette.sunGlow }
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.renderOrder = 0;
  scene.add(skyDome);

  // 太阳/月亮 sprite
  const sunTex = makeCelestialTexture(THREE, 'sun');
  const moonTex = makeCelestialTexture(THREE, 'moon');
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  sunSprite.scale.set(3.4, 3.4, 1);
  sunSprite.position.set(4.2, 4.6, -5.5);
  scene.add(sunSprite);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0 }));
  moonSprite.scale.set(2.6, 2.6, 1);
  moonSprite.position.set(-4.5, 4.2, -5.2);
  scene.add(moonSprite);

  // 星星
  const STAR_N = 400;
  const starPos = new Float32Array(STAR_N * 3);
  for (let i = 0; i < STAR_N; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(0.05 + Math.random() * 0.9);
    const rr = 20;
    starPos[i * 3] = rr * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = rr * Math.cos(phi);
    starPos[i * 3 + 2] = rr * Math.sin(phi) * Math.sin(theta);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xd0daf0, size: 0.06, transparent: true, opacity: 0.8, depthWrite: false })
  );
  stars.visible = false;
  scene.add(stars);

  // 地面
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.9, 48),
    new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- 花盆（陶土 + 卷边） ----
  const potBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.44, 0.85, 40),
    new THREE.MeshStandardMaterial({ color: 0xa06a3e, roughness: 0.85 })
  );
  potBody.position.y = 0.425;
  potBody.castShadow = true;
  potBody.receiveShadow = true;
  scene.add(potBody);
  const potRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.66, 0.64, 0.07, 40),
    new THREE.MeshStandardMaterial({ color: 0xb57c4c, roughness: 0.78 })
  );
  potRim.position.y = 0.885;
  potRim.castShadow = true;
  scene.add(potRim);
  const rimLip = new THREE.Mesh(
    new THREE.TorusGeometry(0.65, 0.022, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0xb57c4c, roughness: 0.75 })
  );
  rimLip.rotation.x = Math.PI / 2;
  rimLip.position.y = 0.925;
  scene.add(rimLip);
  const potInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.05, 40),
    new THREE.MeshStandardMaterial({ color: 0x20140a, roughness: 1 })
  );
  potInner.position.y = 0.845;
  scene.add(potInner);

  // 土壤（湿度联动）
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.54, 40),
    new THREE.MeshStandardMaterial({ color: 0x4a3624, roughness: 1 })
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.85;
  soil.receiveShadow = true;
  scene.add(soil);

  // ---- 植物（单 merged geometry + ShaderMaterial，一次 draw call） ----
  const plantGeo = buildPlantGeometry(THREE, cropCode);
  const windDir = new THREE.Vector2(0.92, 0.38).normalize();
  const plantMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uWindDir: { value: windDir.clone() },
        uWind: { value: 0.55 },
        uWilt: { value: 0 },
        uStem: { value: new THREE.Color(palette.stem) },
        uLeaf: { value: new THREE.Color(palette.leaf) },
        uLeafWilt: { value: new THREE.Color(palette.leafWilt) },
        uFruit: { value: new THREE.Color(palette.fruit) },
        uFruitDim: { value: new THREE.Color(palette.fruitDim) },
        uMoisture: { value: 0.3 },
        uOffline: { value: 0 }
      }
    ]),
    vertexShader: PLANT_VERT,
    fragmentShader: PLANT_FRAG,
    side: THREE.DoubleSide,
    fog: true
  });
  const plant = new THREE.Mesh(plantGeo, plantMat);
  plant.castShadow = true;
  scene.add(plant);

  // ---- 云（体感球簇） ----
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xcfd8e3, roughness: 1, transparent: true, opacity: 0.5 });
  const makeCloud = (x, y, z, s) => {
    const g = new THREE.Group();
    [[0, 0, 0, 0.5], [0.45, -0.08, 0.1, 0.36], [-0.45, -0.06, -0.05, 0.32], [0.1, 0.2, 0, 0.3]].forEach(([cx, cy, cz, r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r * s, 14, 12), cloudMat);
      m.position.set(cx * s, cy * s, cz * s);
      g.add(m);
    });
    g.position.set(x, y, z);
    scene.add(g);
    clouds.push({ group: g, baseX: x, range: 1.4, phase: Math.random() * 6 });
  };
  makeCloud(-1.8, 3.6, -2.6, 1.15);
  makeCloud(2.1, 3.9, -3.0, 0.9);
  makeCloud(-0.4, 4.2, -3.4, 0.7);

  // ---- 雨（粒子雨幕，暴雨） ----
  const RAIN_N = 480;
  const rainPos = new Float32Array(RAIN_N * 3);
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 6;
    rainPos[i * 3 + 1] = Math.random() * 4.4 + 0.2;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 4 - 0.3;
  }
  const rain = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rainPos, 3)),
    new THREE.PointsMaterial({ color: 0x7fb4ff, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false })
  );
  rain.visible = false;
  scene.add(rain);

  // ---- 漂移/离线指示环 ----
  const driftRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.02, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xa371f7, transparent: true, opacity: 0.9 })
  );
  driftRing.position.set(-1.5, 1.15, 0.6);
  driftRing.visible = false;
  scene.add(driftRing);
  const offlineRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.02, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xf85149, transparent: true, opacity: 0.9 })
  );
  offlineRing.position.set(-1.5, 1.15, 0.6);
  offlineRing.visible = false;
  scene.add(offlineRing);

  // ---- 状态 ----
  const state = { scenario: 'normal', moisture: 20, targetPalette: PALETTES.normal };
  const soilColor = new THREE.Color(0x4a3624);

  const applyPalette = (next) => {
    palette = next;
    scene.background.setHex(palette.sky);
    scene.fog.color.setHex(palette.fog);
    scene.fog.near = palette.fogNear;
    scene.fog.far = palette.fogFar;
    renderer.toneMappingExposure = palette.exposure;
    hemi.color.setHex(palette.zenith);
    hemi.groundColor.setHex(palette.soil);
    hemi.intensity = palette.hemi;
    ambient.intensity = palette.ambient;
    sun.color.setHex(palette.sun);
    sun.intensity = palette.sunIntensity;
    skyMat.uniforms.uZenith.value.setHex(palette.zenith);
    skyMat.uniforms.uHorizon.value.setHex(palette.horizon);
    skyMat.uniforms.uHaze.value.setHex(palette.haze);
    skyMat.uniforms.uSunGlow.value = palette.sunGlow;
    plantMat.uniforms.uStem.value.setHex(palette.stem);
    plantMat.uniforms.uLeaf.value.setHex(palette.leaf);
    plantMat.uniforms.uLeafWilt.value.setHex(palette.leafWilt);
    plantMat.uniforms.uFruit.value.setHex(palette.fruit);
    plantMat.uniforms.uFruitDim.value.setHex(palette.fruitDim);
    plantMat.uniforms.uWind.value = palette.wind;
    soilColor.setHex(palette.soil);
    const isDay = palette.sunGlow > 0.5;
    sunSprite.material.opacity = isDay ? 1 : 0;
    moonSprite.material.opacity = isDay ? 0 : 0.9;
    stars.visible = !isDay;
    sunSprite.material.color.setHex(palette.sun);
  };

  const setScenario = (cls) => {
    state.scenario = cls || 'normal';
    state.targetPalette = PALETTES[state.scenario] || PALETTES.normal;
  };
  const setMoisture = (m) => { state.moisture = Number(m) || 20; };

  const setSize = (w, h) => {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const resize = () => {
    const r = canvas.parentElement ? canvas.parentElement.getBoundingClientRect() : { width: 400, height: 440 };
    setSize(r.width, r.height);
  };

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    mouseX = (e.clientX / r.width - 0.5) * 2;
    mouseY = -(e.clientY / r.height - 0.5) * 2;
  });
  canvas.addEventListener('mouseleave', () => { mouseX = 0; mouseY = 0; });

  const clock = new THREE.Clock();
  let running = true;
  let blended = { ...PALETTES.normal };

  const renderFrame = (t = 0) => {
    const time = t * 0.001;
    const dt = Math.min(clock.getDelta(), 0.05);

    // 调色板过渡（lerp）
    const tp = state.targetPalette;
    blended = mixPalettes(blended, tp, Math.min(1, dt * 2.2), THREE);
    applyPalette(blended);

    // 湿度 → 植物
    const mRatio = Math.min(1, Math.max(0, (state.moisture - 10) / 30));
    plantMat.uniforms.uMoisture.value += (mRatio - plantMat.uniforms.uMoisture.value) * Math.min(1, dt * 3);
    const wiltTarget = state.scenario === 'drought' || state.moisture < 20 ? Math.min(1, (20 - state.moisture) / 6 + (state.scenario === 'drought' ? 0.3 : 0)) : 0;
    plantMat.uniforms.uWilt.value += (wiltTarget - plantMat.uniforms.uWilt.value) * Math.min(1, dt * 3);
    plantMat.uniforms.uOffline.value = state.scenario === 'offline' ? 1 : 0;
    plantMat.uniforms.uTime.value = time * (reducedMotion ? 0 : 1);

    // 土壤色
    const sR = 0.46 - 0.2 * mRatio, sG = 0.33 - 0.16 * mRatio, sB = 0.2 - 0.11 * mRatio;
    soil.material.color.setRGB(sR, sG, sB);
    // 盆灰度（离线）
    const grey = state.scenario === 'offline' ? 0.5 : 0;
    potBody.material.color.lerp(new THREE.Color(grey ? 0x8a8a8a : 0xa06a3e), Math.min(1, dt * 2));
    potRim.material.color.lerp(new THREE.Color(grey ? 0x9a9a9a : 0xb57c4c), Math.min(1, dt * 2));

    // 相机视差 + 缓转
    camera.position.x += (HOME.x + mouseX * 0.28 - camera.position.x) * 0.045;
    camera.position.y += (HOME.y + mouseY * 0.16 - camera.position.y) * 0.045;
    camera.lookAt(0, 1.4, 0);

    // 天体方向同步（天空 shader 太阳方向）
    const sunDir = new THREE.Vector3(0.5, 0.55, -0.55).normalize();
    skyMat.uniforms.uSunDir.value.copy(sunDir);

    // 云
    clouds.forEach((c, i) => {
      c.group.position.x = c.baseX + Math.sin(time * 0.06 + c.phase) * c.range * (state.scenario === 'storm' ? 1.7 : 1);
      c.group.children.forEach(m => {
        m.material.color.lerp(new THREE.Color(state.scenario === 'storm' ? 0x3a4a66 : 0xcfd8e3), Math.min(1, dt * 2));
        m.material.opacity = state.scenario === 'storm' ? 0.85 : 0.45;
      });
    });

    // 雨
    rain.visible = state.scenario === 'storm';
    if (rain.visible) {
      const pos = rain.geometry.attributes.position.array;
      for (let i = 0; i < RAIN_N; i++) {
        pos[i * 3 + 1] -= dt * (2.4 + (i % 3) * 0.6);
        if (pos[i * 3 + 1] < 0.15) {
          pos[i * 3 + 1] = 4.5 + Math.random() * 0.4;
          pos[i * 3] = (Math.random() - 0.5) * 6;
        }
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }

    // 指示环
    driftRing.visible = state.scenario === 'drift';
    offlineRing.visible = state.scenario === 'offline';
    if (driftRing.visible) { driftRing.rotation.z = time * 2.4; driftRing.material.opacity = 0.5 + Math.sin(time * 5) * 0.4; }
    if (offlineRing.visible) { offlineRing.rotation.z = -time * 1.2; offlineRing.material.opacity = 0.5 + Math.sin(time * 4) * 0.4; }

    renderer.render(scene, camera);
  };

  const animate = (t) => {
    rafId = requestAnimationFrame(animate);
    if (!visible) return;
    renderFrame(t);
  };
  const onVis = () => {
    visible = !document.hidden;
    if (visible && !reducedMotion) { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(animate); }
  };

  resize();
  applyPalette(PALETTES.normal);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVis);
  if (!reducedMotion) rafId = requestAnimationFrame(animate);
  else renderFrame(0);

  return {
    setScenario,
    setMoisture,
    resize,
    dispose() {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      try { renderer.dispose(); } catch (e) { /* noop */ }
      canvas.remove();
    }
  };
}
