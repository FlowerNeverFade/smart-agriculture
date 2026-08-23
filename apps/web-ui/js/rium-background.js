/**
 * Three.js wheat-field background — rolling hills, wind-swept stalks, theme-aware dusk/day.
 */
import * as THREE from '../vendor/three/three.module.min.js';
const getTheme = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

let fieldInstance = null;

const HOME_POS = { x: 0, y: 7.2, z: 16.5 };
const HOME_LOOK = { x: 0, y: 2.6, z: -6 };

const PALETTES = {
  dark: {
    sky: 0x070b16,
    zenith: 0x050814,
    horizon: 0x1c2a4a,
    fog: 0x0c1220,
    fogNear: 22,
    fogFar: 68,
    soil: 0x2a2418,
    fieldLow: 0x1f2c14,
    fieldHigh: 0x8a7a38,
    wheatTip: 0xd8c47c,
    wheatStem: 0x32461c,
    wheatGrain: 0xe8cb72,
    particle: 0xd0daf0,
    sun: 0xc4d2ee,
    moon: 0xe8eef8,
    ambient: 0.28,
    sunIntensity: 0.58,
    fill: 0x4a5c88,
    fillIntensity: 0.32,
    rim: 0xb8d0ff,
    rimIntensity: 0.4,
    haze: 0x7a8ab8,
    hemi: 0.38,
    exposure: 0.92,
    skyGlow: 0.0,
  },
  light: {
    sky: 0xe8f1fa,
    zenith: 0xc5dbf0,
    horizon: 0xfff3e4,
    fog: 0xe8f0f6,
    fogNear: 38,
    fogFar: 92,
    soil: 0x8a6a28,
    fieldLow: 0x6a9a28,
    fieldHigh: 0xe8c547,
    wheatTip: 0xffe07a,
    wheatStem: 0x7aa832,
    wheatGrain: 0xffcc4a,
    particle: 0xffe9a0,
    sun: 0xfff1cc,
    moon: 0xffffff,
    cloud: 0xffffff,
    ambient: 0.58,
    sunIntensity: 1.48,
    fill: 0xb8d4f0,
    fillIntensity: 0.28,
    rim: 0xffd080,
    rimIntensity: 0.46,
    haze: 0xf0b45a,
    hemi: 0.52,
    exposure: 1.12,
    skyGlow: 1.0,
  },
};

function getPalette(theme) {
  return theme === 'light' ? PALETTES.light : PALETTES.dark;
}
function lerpNum(a, b, t) {
  return a + (b - a) * t;
}

function lerpHex(a, b, t) {
  const c1 = new THREE.Color(a);
  const c2 = new THREE.Color(b);
  return c1.lerp(c2, t).getHex();
}

const COLOR_KEYS = new Set([
  'sky', 'zenith', 'horizon', 'fog', 'soil', 'fieldLow', 'fieldHigh',
  'wheatTip', 'wheatStem', 'wheatGrain', 'particle', 'sun', 'moon', 'fill', 'cloud',
  'rim', 'haze',
]);

function blendPalettes(fromKey, toKey, t) {
  const a = PALETTES[fromKey];
  const b = PALETTES[toKey];
  const out = {};
  for (const key of Object.keys(a)) {
    if (COLOR_KEYS.has(key)) {
      out[key] = lerpHex(a[key], b[key] ?? a[key], t);
    } else if (typeof a[key] === 'number') {
      out[key] = lerpNum(a[key], b[key], t);
    }
  }
  return out;
}

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
  uniform vec3 uMoonDir;
  uniform float uSunGlow;
  uniform float uMoonGlow;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.52 + 0.32, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.02, 0.78, h));

    float rayleigh = pow(1.0 - max(dir.y, 0.0), 2.6);
    col = mix(col, uHaze * vec3(1.08, 0.9, 0.68), rayleigh * mix(0.1, 0.34, uSunGlow));

    float band = exp(-pow((h - 0.06) / 0.12, 2.0));
    col = mix(col, uHaze, band * mix(0.18, 0.58, uSunGlow));
    col += uHaze * exp(-pow(dir.y * 4.4, 2.0)) * mix(0.06, 0.2, uSunGlow);

    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float sunDisk = smoothstep(0.992, 0.9996, sunDot) * uSunGlow;
    col = mix(col, vec3(1.0, 0.88, 0.55), sunDisk);
    col += vec3(1.0, 0.7, 0.32) * pow(sunDot, 5.0) * uSunGlow * 0.26;
    col += vec3(1.0, 0.82, 0.48) * pow(sunDot, 16.0) * uSunGlow * 0.18;
    col += vec3(1.0, 0.92, 0.66) * pow(sunDot, 80.0) * uSunGlow * 0.22;
    col += vec3(1.0, 0.94, 0.78) * pow(sunDot, 220.0) * uSunGlow * 0.16;

    float ang = atan(dir.x, dir.z);
    float shafts = pow(sunDot, 9.0) * (0.5 + 0.5 * sin(ang * 14.0 + dir.y * 6.0));
    col += vec3(1.0, 0.76, 0.38) * shafts * uSunGlow * 0.1;
    float aniso = pow(sunDot, 24.0) * abs(dir.x) * (1.0 - abs(dir.y));
    col += vec3(1.0, 0.84, 0.5) * aniso * uSunGlow * 0.12;

    float moonDot = max(dot(dir, normalize(uMoonDir)), 0.0);
    float moonDisk = smoothstep(0.993, 0.9997, moonDot) * uMoonGlow;
    col += vec3(0.94, 0.96, 1.0) * moonDisk;
    col += vec3(0.72, 0.82, 1.0) * pow(moonDot, 14.0) * uMoonGlow * 0.32;
    col += vec3(0.82, 0.88, 1.0) * pow(moonDot, 48.0) * uMoonGlow * 0.24;
    col += vec3(0.7, 0.78, 1.0) * pow(moonDot, 6.0) * uMoonGlow * 0.1;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    vAlpha = 0.45 + 0.55 * sin(uTime * 1.8 + aPhase);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (180.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.08, d);
    gl_FragColor = vec4(0.92, 0.95, 1.0, core * vAlpha);
  }
`;

function makeCelestialTexture(kind) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.46;

  if (kind === 'sun') {
    // Soft outer halo (does not wash out the disc).
    const halo = ctx.createRadialGradient(cx, cy, r * 0.46, cx, cy, r);
    halo.addColorStop(0, 'rgba(255,220,150,0.14)');
    halo.addColorStop(0.5, 'rgba(255,200,110,0.04)');
    halo.addColorStop(1, 'rgba(255,190,80,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);

    // Solid disc with a warm gradient so it stands out against a pale sky.
    const discR = r * 0.34;
    const body = ctx.createRadialGradient(cx - discR * 0.22, cy - discR * 0.22, 0, cx, cy, discR);
    body.addColorStop(0, 'rgba(255,240,185,1)');
    body.addColorStop(0.6, 'rgba(252,222,150,1)');
    body.addColorStop(1, 'rgba(238,192,92,1)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.fill();

    // Rim outline so the contour stays visible on bright backgrounds.
    ctx.strokeStyle = 'rgba(160,92,24,0.92)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const halo = ctx.createRadialGradient(cx, cy, r * 0.28, cx, cy, r);
    halo.addColorStop(0, 'rgba(220,228,242,0.28)');
    halo.addColorStop(0.5, 'rgba(200,210,228,0.07)');
    halo.addColorStop(1, 'rgba(180,190,210,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);

    const discR = r * 0.30;
    const body = ctx.createRadialGradient(cx - discR * 0.25, cy - discR * 0.25, 0, cx, cy, discR);
    body.addColorStop(0, 'rgba(246,250,255,1)');
    body.addColorStop(0.7, 'rgba(228,234,246,1)');
    body.addColorStop(1, 'rgba(206,214,232,1)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(148,160,186,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(168,178,198,0.4)';
    for (const [ox, oy, rr] of [
      [0.12, -0.08, 0.09],
      [-0.14, 0.1, 0.07],
      [0.05, 0.16, 0.06],
      [-0.06, -0.15, 0.05],
    ]) {
      ctx.beginPath();
      ctx.arc(cx + ox * r, cy + oy * r, rr * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSkySprite(texture, scale) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  sprite.renderOrder = 50;
  return sprite;
}

function terrainHeight(x, z) {
  return (
    Math.sin(x * 0.11) * 1.55 +
    Math.cos(z * 0.09) * 1.2 +
    Math.sin((x + z) * 0.065) * 0.7 +
    Math.cos(x * 0.04 - z * 0.05) * 0.35
  );
}

const WHEAT_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWindDir;
  varying float vHeight;
  varying float vShade;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  #include <common>
  #include <fog_pars_vertex>

  void main() {
    vHeight = position.y;
    vec3 pos = position;
    vec4 world = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 wpos = world.xz;
    vec2 windDir = normalize(uWindDir);
    vec2 crossDir = vec2(-windDir.y, windDir.x);

    float along = dot(wpos, windDir);
    float cross = dot(wpos, crossDir);

    float swell = sin(along * 0.13 - uTime * 0.78);
    float ripple = sin(along * 0.26 - uTime * 1.22 + cross * 0.04) * 0.32;
    float wind = swell * 0.78 + ripple * 0.22;

    float bend = pow(clamp(pos.y, 0.0, 1.2), 1.45);
    vec2 offset = windDir * wind * bend * 0.34;
    float flutter = sin(along * 0.18 - uTime * 1.6 + pos.y * 2.0) * bend * bend * 0.045;
    offset += crossDir * flutter;

    pos.x += offset.x;
    pos.z += offset.y;

    vShade = 0.82 + 0.18 * sin(along * 0.35);
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const WHEAT_FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorHead;
  uniform vec3 uSunDir;
  uniform vec3 uRimColor;
  uniform float uDay;
  varying float vHeight;
  varying float vShade;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  #include <common>
  #include <fog_pars_fragment>

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    N = faceforward(N, -V, N);
    vec3 L = normalize(uSunDir);

    float wrap = clamp(dot(N, L) * 0.46 + 0.54, 0.0, 1.0);
    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 32.0);
    float back = pow(max(dot(-N, L), 0.0), 1.35);
    float sss = pow(max(dot(V, -L), 0.0), 1.8);

    vec3 stem = uColorB * 0.88;
    vec3 leaf = mix(uColorB, uColorA, 0.4);
    vec3 head = mix(uColorHead, vec3(1.0, 0.84, 0.38), 0.22);
    vec3 col = mix(stem, leaf, smoothstep(0.14, 0.48, vHeight));
    float headMask = smoothstep(0.62, 0.8, vHeight);
    float awnMask = smoothstep(0.86, 1.04, vHeight);
    col = mix(col, head, headMask);
    col = mix(col, mix(head, vec3(0.96, 0.88, 0.58), 0.42), awnMask);

    float grain = fract(sin(dot(vWorldPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
    col *= 0.93 + grain * 0.12 * headMask;

    col *= vShade * mix(0.8, 1.2, wrap);
    col += head * sss * headMask * mix(0.12, 0.26, uDay);
    col += uRimColor * rim * mix(0.16, 0.4, headMask);
    col += vec3(1.0, 0.9, 0.5) * spec * headMask * (0.16 + 0.55 * uDay);
    col += vec3(1.0, 0.76, 0.36) * back * mix(0.06, 0.12, uDay);
    col += head * headMask * mix(0.04, 0.0, uDay);
    col += vec3(0.14, 0.1, 0.04) * (1.0 - smoothstep(0.0, 0.42, vHeight)) * 0.12;

    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

function mergeGeometries(geometries) {
  const positions = [];
  const indices = [];
  let offset = 0;
  for (const geo of geometries) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) {
        indices.push(geo.index.getX(i) + offset);
      }
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(offset + i);
    }
    offset += pos.count;
    geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

function planeAt(w, h, x, y, z, rotX, rotY, rotZ, sw = 1, sh = 2) {
  const geo = new THREE.PlaneGeometry(w, h, sw, sh);
  geo.translate(0, h * 0.5, 0);
  geo.rotateX(rotX);
  geo.rotateY(rotY);
  geo.rotateZ(rotZ);
  geo.translate(x, y, z);
  return geo;
}

/** One wheat plant: crossed stem, flag leaves, two-ranked ear with glumes, grains and awns. */
function createWheatPlantGeometry() {
  const parts = [];
  for (const yaw of [0, Math.PI / 2]) {
    parts.push(planeAt(0.03, 0.68, 0, 0, 0, 0, yaw, 0, 1, 3));
    parts.push(planeAt(0.27, 0.16, 0.032, 0.17, 0, -0.4, yaw, 0.6, 2, 2));
    parts.push(planeAt(0.23, 0.14, -0.028, 0.32, 0, 0.32, yaw, -0.54, 2, 1));
    parts.push(planeAt(0.19, 0.12, 0.02, 0.46, 0, -0.24, yaw, 0.42, 1, 1));
    parts.push(planeAt(0.15, 0.1, -0.016, 0.56, 0, 0.18, yaw, -0.34, 1, 1));
    parts.push(planeAt(0.21, 0.11, 0.024, 0.63, 0, -0.18, yaw, 0.48, 1, 1));
    parts.push(planeAt(0.013, 0.44, 0, 0.68, 0, 0, yaw, 0, 1, 2));
  }

  const rows = 14;
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const gy = 0.69 + t * 0.43;
    const taper = 1 - Math.pow(t, 1.55) * 0.62;
    const gw = 0.052 * taper;
    const gh = 0.036 + (1 - t) * 0.02;
    const spread = 0.012 + (1 - t) * 0.01;
    const twist = t * 0.18;
    const stagger = (i % 2) * 0.008;
    for (const yaw of [twist, Math.PI / 2 + twist]) {
      for (const side of [-1, 1]) {
        const sx = side * (spread + stagger);
        parts.push(planeAt(
          gw,
          gh,
          sx,
          gy,
          0.003 * side,
          0.1 * side,
          yaw,
          side * (0.18 + t * 0.1),
          1,
          1,
        ));
        parts.push(planeAt(
          gw * 0.72,
          gh * 0.82,
          sx * 0.62,
          gy + 0.006,
          0.008 * side,
          0.48,
          yaw + 0.38 * side,
          side * 0.1,
          1,
          1,
        ));
        parts.push(planeAt(
          0.0038,
          0.09 + (1 - t) * 0.08,
          side * (spread + 0.008),
          gy + gh * 0.58,
          0.001 * side,
          0.46 * side,
          yaw,
          side * (0.58 + t * 0.16),
          1,
          1,
        ));
        if (yaw === twist) {
          parts.push(planeAt(
            gw * 1.08,
            gh * 0.48,
            sx * 0.68,
            gy - 0.005,
            -0.002 * side,
            0.28 * side,
            yaw + 0.16 * side,
            side * 0.4,
            1,
            1,
          ));
        }
      }
    }
  }
  parts.push(planeAt(0.028, 0.05, 0, 1.1, 0, 0.12, 0.2, 0, 1, 1));
  parts.push(planeAt(0.022, 0.07, 0, 1.12, 0, 0.2, 1.1, 0.15, 1, 1));
  return mergeGeometries(parts);
}

function createUndergrowthGeometry() {
  const parts = [];
  for (const yaw of [0, Math.PI / 2.4]) {
    parts.push(planeAt(0.04, 0.42, 0, 0, 0, 0, yaw, 0));
    parts.push(planeAt(0.14, 0.1, 0.01, 0.14, 0, -0.2, yaw, 0.4));
    parts.push(planeAt(0.12, 0.09, -0.01, 0.22, 0, 0.18, yaw, -0.35));
  }
  return mergeGeometries(parts);
}

function scatterInstances(mesh, cols, rows, width, depth, stagger, scaleBase, scaleJitter, heightScale) {
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = c / Math.max(cols - 1, 1);
      const v = r / Math.max(rows - 1, 1);
      const x = (u - 0.5) * width + (Math.random() - 0.5) * 0.28 + (r % 2 ? stagger : 0);
      const z = (v - 0.5) * depth + (Math.random() - 0.5) * 0.28;
      dummy.position.set(x, terrainHeight(x, z), z);
      dummy.rotation.set(0, Math.atan2(0.38, 0.92) + (Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.04);
      const s = scaleBase + Math.random() * scaleJitter;
      dummy.scale.set(s, s * heightScale * (0.88 + Math.random() * 0.28), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      n += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export function initRiumBackground(containerId = 'riumBackground') {
  if (fieldInstance) return fieldInstance;

  const container = document.getElementById(containerId);
  if (!container) return null;

  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let palette = getPalette(getTheme());
  let mouseX = 0;
  let mouseY = 0;
  let rafId = 0;
  let visible = !document.hidden;
  // The dashboard keeps the background behind the glass shell; callers can pause it while
  // the full-screen farm monitor owns the GPU canvas.
  let externallyVisible = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.fog, palette.fogNear, palette.fogFar);

  const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 220);
  camera.position.set(0, 2.25, 4.8);
  camera.lookAt(0, 1.45, -0.8);

  let bootMode = false;
  let bootP = 1;
  let bootPTarget = 1;
  let bootHUD = 1;
  let bootLabel = '背景就绪';
  const bootStepEls = () => document.querySelectorAll('[data-boot-step]');
  const BOOT_STEP_THRESHOLDS = {
    scene: 0,
    render: 0.18,
    system: 0.36,
    link: 0.54,
    data: 0.72,
    ready: 0.88,
  };
  let revealT = 1;
  const revealFromPos = new THREE.Vector3();
  const revealFromLook = new THREE.Vector3();
  const lookTarget = new THREE.Vector3(0, 1.45, -0.8);
  let revealDone = null;
  if (reducedMotion) {
    bootMode = false;
    camera.fov = 48;
    camera.position.set(HOME_POS.x, HOME_POS.y, HOME_POS.z);
    camera.lookAt(HOME_LOOK.x, HOME_LOOK.y, HOME_LOOK.z);
    camera.updateProjectionMatrix();
  }

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(palette.sky, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = palette.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(palette.zenith, palette.soil, palette.hemi);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, palette.ambient);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(palette.sun, palette.sunIntensity);
  sun.position.set(18, 22, 8);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(palette.fill, palette.fillIntensity);
  fill.position.set(-8, 6, -4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(palette.rim, palette.rimIntensity);
  rim.position.set(-14, 9, -18);
  scene.add(rim);

  const skyGeo = new THREE.SphereGeometry(110, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(palette.zenith) },
      uHorizon: { value: new THREE.Color(palette.horizon) },
      uHaze: { value: new THREE.Color(palette.haze) },
      uSunDir: { value: new THREE.Vector3(0.55, 0.62, -0.55).normalize() },
      uMoonDir: { value: new THREE.Vector3(-0.5, 0.58, -0.64).normalize() },
      uSunGlow: { value: palette.skyGlow },
      uMoonGlow: { value: 0 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.renderOrder = 0;
  scene.add(skyDome);

  const sunTexture = makeCelestialTexture('sun');
  const moonTexture = makeCelestialTexture('moon');
  const sunSprite = createSkySprite(sunTexture, 24);
  const CELESTIAL_PEAK = { x: 18, y: 20, z: -58 };
  const CELESTIAL_ENTER_Y = 40;
  const CELESTIAL_EXIT_Y = -30;
  sunSprite.position.set(CELESTIAL_PEAK.x, CELESTIAL_PEAK.y, CELESTIAL_PEAK.z);
  camera.add(sunSprite);
  camera.updateMatrixWorld();
  const celestialBase = new THREE.Vector3();
  sunSprite.getWorldPosition(celestialBase);
  camera.remove(sunSprite);
  sunSprite.position.copy(celestialBase);

  const moonSprite = createSkySprite(moonTexture, 20);
  moonSprite.position.copy(celestialBase);

  const sunDirWorld = new THREE.Vector3();
  const moonDirWorld = new THREE.Vector3();

  const starCount = 2200;
  const starPos = new Float32Array(starCount * 3);
  const starSize = new Float32Array(starCount);
  const starPhase = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(0.08 + v * 0.92);
    const r = 88;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    starSize[i] = 0.6 + Math.random() * 1.8;
    starPhase[i] = Math.random() * Math.PI * 2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.94,
    fog: false,
    depthWrite: false,
  });
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  const cloudLayouts = [
    [18, 16, -28, 4.2, 1.4, 2.6],
    [-12, 14, -34, 5.0, 1.6, 3.0],
    [6, 18, -40, 3.4, 1.2, 2.2],
    [-24, 15, -22, 3.8, 1.3, 2.4],
    [30, 17, -18, 4.6, 1.5, 2.8],
    [-4, 20, -46, 6.0, 1.8, 3.4],
    [14, 13, -16, 2.8, 1.0, 1.8],
  ];
  for (const [x, y, z, sx, sy, sz] of cloudLayouts) {
    const puff = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      m.position.set((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 1.4);
      m.scale.set(0.7 + Math.random() * 0.8, 0.45 + Math.random() * 0.3, 0.7 + Math.random() * 0.6);
      puff.add(m);
    }
    puff.position.set(x, y, z);
    puff.scale.set(sx, sy, sz);
    clouds.add(puff);
  }
  scene.add(clouds);

  function syncSkyDirections() {
    sunSprite.getWorldPosition(sunDirWorld);
    moonSprite.getWorldPosition(moonDirWorld);
    sunDirWorld.sub(camera.position).normalize();
    moonDirWorld.sub(camera.position).normalize();
    skyMat.uniforms.uSunDir.value.copy(sunDirWorld);
    skyMat.uniforms.uMoonDir.value.copy(moonDirWorld);
    const dayAmt = skyMat.uniforms.uSunGlow.value;
    wheatMat.uniforms.uSunDir.value.copy(dayAmt > 0.45 ? sunDirWorld : moonDirWorld);
  }

  function setDayNight(isDay) {
    sunSprite.visible = isDay;
    moonSprite.visible = !isDay;
    clouds.visible = isDay;
    stars.visible = !isDay;
    pollen.visible = isDay;
    skyMat.uniforms.uSunGlow.value = isDay ? 1 : 0;
    skyMat.uniforms.uMoonGlow.value = isDay ? 0 : 1;
    syncSkyDirections();
    if (isDay) {
      sun.position.copy(sunDirWorld).multiplyScalar(40);
      rim.position.copy(sunDirWorld).multiplyScalar(-32);
      rim.position.y = Math.max(8, Math.abs(rim.position.y));
    } else {
      sun.position.copy(moonDirWorld).multiplyScalar(36);
      fill.position.copy(moonDirWorld).multiplyScalar(-12);
      fill.position.y = Math.max(fill.position.y, 6);
      rim.position.copy(moonDirWorld).multiplyScalar(-24);
      rim.position.y = Math.max(10, Math.abs(rim.position.y));
    }
  }

  const world = new THREE.Group();
  scene.add(world);

  const terrainGeo = new THREE.PlaneGeometry(72, 56, 72, 48);
  terrainGeo.rotateX(-Math.PI / 2);
  const terrainPos = terrainGeo.attributes.position;
  const terrainColors = new Float32Array(terrainPos.count * 3);
  const soil = new THREE.Color(palette.soil);
  const fieldHigh = new THREE.Color(palette.fieldHigh);
  const fieldLow = new THREE.Color(palette.fieldLow);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < terrainPos.count; i++) {
    const x = terrainPos.getX(i);
    const z = terrainPos.getZ(i);
    const y = terrainHeight(x, z);
    terrainPos.setY(i, y);
    tmpColor.copy(fieldLow).lerp(fieldHigh, THREE.MathUtils.clamp((y + 2.2) / 5.2, 0, 1));
    tmpColor.lerp(soil, 0.18);
    terrainColors[i * 3] = tmpColor.r;
    terrainColors[i * 3 + 1] = tmpColor.g;
    terrainColors[i * 3 + 2] = tmpColor.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 8,
    specular: 0x1a1810,
    flatShading: false,
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  world.add(terrain);

  const wheatGeo = createWheatPlantGeometry();
  const underGeo = createUndergrowthGeometry();

  const windDir = new THREE.Vector2(0.92, 0.38).normalize();

  const wheatMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uWindDir: { value: windDir.clone() },
        uColorA: { value: new THREE.Color(palette.wheatTip) },
        uColorB: { value: new THREE.Color(palette.wheatStem) },
        uColorHead: { value: new THREE.Color(palette.wheatGrain) },
        uSunDir: { value: new THREE.Vector3(0.55, 0.62, -0.55) },
        uRimColor: { value: new THREE.Color(palette.rim) },
        uDay: { value: palette.skyGlow },
      },
    ]),
    vertexShader: WHEAT_VERT,
    fragmentShader: WHEAT_FRAG,
    side: THREE.DoubleSide,
    fog: true,
  });

  const underMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: wheatMat.uniforms.uTime,
        uWindDir: wheatMat.uniforms.uWindDir,
        uColorA: { value: new THREE.Color(palette.fieldLow) },
        uColorB: { value: new THREE.Color(palette.wheatStem) },
        uColorHead: { value: new THREE.Color(palette.fieldHigh) },
        uSunDir: wheatMat.uniforms.uSunDir,
        uRimColor: wheatMat.uniforms.uRimColor,
        uDay: wheatMat.uniforms.uDay,
      },
    ]),
    vertexShader: WHEAT_VERT,
    fragmentShader: WHEAT_FRAG,
    side: THREE.DoubleSide,
    fog: true,
  });

  underMat.uniforms.uTime = wheatMat.uniforms.uTime;
  underMat.uniforms.uWindDir = wheatMat.uniforms.uWindDir;
  underMat.uniforms.uSunDir = wheatMat.uniforms.uSunDir;
  underMat.uniforms.uRimColor = wheatMat.uniforms.uRimColor;
  underMat.uniforms.uDay = wheatMat.uniforms.uDay;

  const wheatCols = 100;
  const wheatRows = 70;
  const wheat = new THREE.InstancedMesh(wheatGeo, wheatMat, wheatCols * wheatRows);
  scatterInstances(wheat, wheatCols, wheatRows, 60, 44, 0.22, 0.94, 0.36, 1.08);
  world.add(wheat);

  const underCols = 96;
  const underRows = 66;
  const undergrowth = new THREE.InstancedMesh(underGeo, underMat, underCols * underRows);
  scatterInstances(undergrowth, underCols, underRows, 58, 42, 0.18, 0.7, 0.35, 0.72);
  world.add(undergrowth);

  const pollenCount = 140;
  const pollenPos = new Float32Array(pollenCount * 3);
  for (let i = 0; i < pollenCount; i++) {
    pollenPos[i * 3] = (Math.random() - 0.5) * 50;
    pollenPos[i * 3 + 1] = 1.4 + Math.random() * 6;
    pollenPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  const pollenGeo = new THREE.BufferGeometry();
  pollenGeo.setAttribute('position', new THREE.BufferAttribute(pollenPos, 3));
  const pollenMat = new THREE.PointsMaterial({
    color: palette.particle,
    size: 0.09,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const pollen = new THREE.Points(pollenGeo, pollenMat);
  world.add(pollen);
  setDayNight(getTheme() === 'light');

  function applyPalette(next, transition = null) {
    palette = next;
    const isDay = next === PALETTES.light;
    const sunGlow = transition ? transition.sunGlow : (isDay ? 1 : 0);
    const moonGlow = transition ? transition.moonGlow : (isDay ? 0 : 1);

    scene.background.setHex(palette.sky);
    scene.fog.color.setHex(lerpHex(palette.fog, palette.haze, 0.32));
    scene.fog.near = palette.fogNear;
    scene.fog.far = palette.fogFar;
    renderer.setClearColor(palette.sky, 1);
    renderer.toneMappingExposure = palette.exposure;
    hemi.color.setHex(palette.zenith);
    hemi.groundColor.setHex(palette.soil);
    hemi.intensity = palette.hemi;
    ambient.intensity = palette.ambient;
    sun.color.setHex(palette.sun);
    sun.intensity = palette.sunIntensity;
    fill.color.setHex(palette.fill);
    fill.intensity = palette.fillIntensity;
    rim.color.setHex(palette.rim);
    rim.intensity = palette.rimIntensity;
    skyMat.uniforms.uZenith.value.setHex(palette.zenith);
    skyMat.uniforms.uHorizon.value.setHex(palette.horizon);
    skyMat.uniforms.uHaze.value.setHex(palette.haze);
    skyMat.uniforms.uSunGlow.value = sunGlow;
    skyMat.uniforms.uMoonGlow.value = moonGlow;
    wheatMat.uniforms.uColorA.value.setHex(palette.wheatTip);
    wheatMat.uniforms.uColorB.value.setHex(palette.wheatStem);
    wheatMat.uniforms.uColorHead.value.setHex(palette.wheatGrain);
    wheatMat.uniforms.uRimColor.value.setHex(palette.rim);
    wheatMat.uniforms.uDay.value = palette.skyGlow;
    underMat.uniforms.uColorA.value.setHex(palette.fieldLow);
    underMat.uniforms.uColorB.value.setHex(palette.wheatStem);
    underMat.uniforms.uColorHead.value.setHex(palette.fieldHigh);
    pollenMat.color.setHex(palette.particle);

    if (transition) {
      const { to, progress } = transition;
      const sunEntering = to === 'light';
      const moonEntering = to === 'dark';
      const sg = sunEntering ? progress : 1 - progress;
      const mg = moonEntering ? progress : 1 - progress;
      sunSprite.visible = true;
      moonSprite.visible = true;
      const sunLocalY = sunEntering
        ? THREE.MathUtils.lerp(CELESTIAL_ENTER_Y, CELESTIAL_PEAK.y, progress)
        : THREE.MathUtils.lerp(CELESTIAL_PEAK.y, CELESTIAL_EXIT_Y, progress);
      const moonLocalY = moonEntering
        ? THREE.MathUtils.lerp(CELESTIAL_ENTER_Y, CELESTIAL_PEAK.y, progress)
        : THREE.MathUtils.lerp(CELESTIAL_PEAK.y, CELESTIAL_EXIT_Y, progress);
      sunSprite.position.x = celestialBase.x;
      moonSprite.position.x = celestialBase.x;
      sunSprite.position.y = celestialBase.y + (sunLocalY - CELESTIAL_PEAK.y);
      moonSprite.position.y = celestialBase.y + (moonLocalY - CELESTIAL_PEAK.y);
      sunSprite.material.opacity = Math.pow(sg, 0.85);
      moonSprite.material.opacity = Math.pow(mg, 0.85);
      clouds.visible = sg > 0.06;
      cloudMat.opacity = 0.94 * sg;
      stars.visible = mg > 0.06;
      pollen.visible = sg > 0.45;
      syncSkyDirections();
    } else {
      sunSprite.position.copy(celestialBase);
      moonSprite.position.copy(celestialBase);
      sunSprite.material.opacity = 1;
      moonSprite.material.opacity = 1;
      setDayNight(isDay);
    }

    if (palette.cloud !== undefined && !transition) {
      cloudMat.color.setHex(palette.cloud);
      cloudMat.opacity = isDay ? 0.94 : 0;
    }

    soil.setHex(palette.soil);
    fieldHigh.setHex(palette.fieldHigh);
    fieldLow.setHex(palette.fieldLow);
    for (let i = 0; i < terrainPos.count; i++) {
      const y = terrainPos.getY(i);
      tmpColor.copy(fieldLow).lerp(fieldHigh, THREE.MathUtils.clamp((y + 2.2) / 5.2, 0, 1));
      tmpColor.lerp(soil, 0.18);
      terrainColors[i * 3] = tmpColor.r;
      terrainColors[i * 3 + 1] = tmpColor.g;
      terrainColors[i * 3 + 2] = tmpColor.b;
    }
    terrainGeo.attributes.color.needsUpdate = true;
  }

  function onThemeTransition(e) {
    const { from, to, progress } = e.detail;
    const sunGlow = to === 'light' ? progress : 1 - progress;
    const moonGlow = 1 - sunGlow;
    applyPalette(blendPalettes(from, to, progress), { sunGlow, moonGlow, to, progress });
  }

  function renderFrame(t = 0) {
    const time = t * 0.001;
    if (!reducedMotion) {
      wheatMat.uniforms.uTime.value = time * (bootMode ? 0.72 : 1);
      starMat.uniforms.uTime.value = time;
      syncSkyDirections();
      pollen.rotation.y = time * 0.02;
      const pp = pollenGeo.attributes.position;
      for (let i = 0; i < pollenCount; i++) {
        const y = pp.getY(i) + Math.sin(time * 0.6 + i) * 0.004;
        pp.setY(i, y > 8 ? 1.2 : y);
      }
      pp.needsUpdate = true;
      stars.rotation.y = time * 0.008;
      clouds.position.x = Math.sin(time * 0.03) * 2.4;
    }

    const bootDelta = bootPTarget - bootP;
    bootP += bootDelta * Math.min(0.09, 0.042 + Math.abs(bootDelta) * 0.14);
    bootHUD += (bootP - bootHUD) * 0.11;

    if (bootMode || bootHUD < 0.995) {
      updateBootHud(bootHUD);
    }

    if (bootMode) {
      const p = bootP;
      const angle = time * 0.13;
      const rise = THREE.MathUtils.smoothstep(p, 0.08, 0.62);
      const widen = THREE.MathUtils.smoothstep(p, 0.58, 1);
      const sway = Math.sin(angle) * THREE.MathUtils.lerp(0.48, 0.62, rise);
      camera.position.x = sway * (1 - widen * 0.18);
      camera.position.y = THREE.MathUtils.lerp(2.18, THREE.MathUtils.lerp(3.05, 3.92, widen), rise);
      camera.position.z = THREE.MathUtils.lerp(4.4, THREE.MathUtils.lerp(8.2, 10.6, widen), rise);
      lookTarget.set(
        Math.sin(angle * 0.45) * THREE.MathUtils.lerp(0.16, 0.24, rise),
        THREE.MathUtils.lerp(1.38, THREE.MathUtils.lerp(1.82, 2.18, widen), rise),
        THREE.MathUtils.lerp(-0.62, THREE.MathUtils.lerp(-2.8, -3.9, widen), rise),
      );
      camera.lookAt(lookTarget);
      camera.fov = THREE.MathUtils.lerp(32, 46, widen);
      camera.updateProjectionMatrix();
    } else if (revealT < 1) {
      revealT = Math.min(1, revealT + 0.012);
      const e = 1 - (1 - revealT) ** 3;
      camera.position.lerpVectors(revealFromPos, new THREE.Vector3(HOME_POS.x, HOME_POS.y, HOME_POS.z), e);
      lookTarget.lerpVectors(revealFromLook, new THREE.Vector3(HOME_LOOK.x, HOME_LOOK.y, HOME_LOOK.z), e);
      camera.lookAt(lookTarget);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 48, 0.08);
      camera.updateProjectionMatrix();
      if (revealT >= 1 && revealDone) {
        const done = revealDone;
        revealDone = null;
        done();
      }
    } else {
      camera.fov = 48;
      camera.position.x += (HOME_POS.x + mouseX * 1.6 - camera.position.x) * 0.035;
      camera.position.y += (HOME_POS.y + mouseY * 0.8 - camera.position.y) * 0.035;
      camera.position.z += (HOME_POS.z - camera.position.z) * 0.035;
      camera.lookAt(HOME_LOOK.x, HOME_LOOK.y, HOME_LOOK.z);
    }

    renderer.render(scene, camera);
  }

  function animate(t) {
    rafId = requestAnimationFrame(animate);
    const revealing = !bootMode && revealT < 1;
    if (!visible || !externallyVisible) return;
    renderFrame(t);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function onMouseMove(e) {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
  }

  function onThemeChange(e) {
    applyPalette(getPalette(e.detail?.theme || getTheme()));
  }

  function onVisibilityChange() {
    visible = !document.hidden;
    if (visible && externallyVisible && !reducedMotion) {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(animate);
    }
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('agriloop-theme-transition', onThemeTransition);
  document.addEventListener('agriloop-theme-change', onThemeChange);
  document.addEventListener('visibilitychange', onVisibilityChange);

  renderFrame(0);
  updateBootHud(bootHUD);
  if (!reducedMotion) rafId = requestAnimationFrame(animate);

  function updateBootHud(progress) {
    const pct = Math.round(progress * 100);
    const fillEl = document.getElementById('appLoadingBarFill');
    const percentEl = document.getElementById('appLoadingPercent');
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (percentEl) percentEl.textContent = `${pct}%`;

    const ordered = Object.keys(BOOT_STEP_THRESHOLDS);
    let currentKey = ordered[0];
    for (const key of ordered) {
      if (progress >= BOOT_STEP_THRESHOLDS[key] - 0.01) currentKey = key;
    }
    const curIdx = ordered.indexOf(currentKey);
    bootStepEls().forEach((step) => {
      const key = step.dataset.bootStep;
      const idx = ordered.indexOf(key);
      step.classList.toggle('active', key === currentKey);
      step.classList.toggle('done', idx < curIdx);
    });
  }

  function setBootProgress(value, label) {
    bootPTarget = Math.max(bootPTarget, Math.min(1, Number(value) || 0));
    if (label) {
      bootLabel = label;
      const textEl = document.getElementById('appLoadingText');
      if (textEl) textEl.textContent = label;
    }
  }

  function getBootProgress() {
    return bootHUD;
  }

  function waitUntilBootProgress(min = 0.94) {
    const target = Math.min(1, Math.max(0, min));
    if (bootHUD >= target && bootP >= target) return Promise.resolve();
    return new Promise((resolve) => {
      const tick = () => {
        if (bootHUD >= target && bootP >= target) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
  }

  function revealFromBoot() {
    if (!bootMode && revealT >= 1) return Promise.resolve();
    bootMode = false;
    revealT = 0;
    revealFromPos.copy(camera.position);
    revealFromLook.copy(lookTarget);
    return new Promise((resolve) => {
      revealDone = resolve;
    });
  }

  fieldInstance = {
    setVisible(value) {
      externallyVisible = value !== false;
      if (externallyVisible && visible && !reducedMotion && !rafId) rafId = requestAnimationFrame(animate);
    },
    setBootProgress,
    getBootProgress,
    waitUntilBootProgress,
    revealFromBoot,
    dispose() {
      fieldInstance = null;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('agriloop-theme-transition', onThemeTransition);
      document.removeEventListener('agriloop-theme-change', onThemeChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      sunTexture.dispose();
      moonTexture.dispose();
      sunSprite.material.dispose();
      moonSprite.material.dispose();
      starGeo.dispose();
      starMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      wheatGeo.dispose();
      wheatMat.dispose();
      underGeo.dispose();
      underMat.dispose();
      pollenGeo.dispose();
      pollenMat.dispose();
      if (renderer.domElement.parentNode) container.removeChild(renderer.domElement);
    },
  };
  return fieldInstance;
}
