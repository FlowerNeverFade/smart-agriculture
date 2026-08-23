/**
 * Three.js wheat-field background — rolling hills, wind-swept stalks, theme-aware dusk/day.
 */
import * as THREE from 'three';
import { getTheme } from './theme.js?v=19';

const PALETTES = {
  dark: {
    sky: 0x070b16,
    zenith: 0x050814,
    horizon: 0x1c2a4a,
    fog: 0x0c1220,
    fogNear: 22,
    fogFar: 68,
    soil: 0x2a2418,
    fieldLow: 0x243318,
    fieldHigh: 0x8a7a38,
    wheatTip: 0xd4c078,
    wheatStem: 0x3a4e22,
    particle: 0xc8d4f0,
    sun: 0xb8c8e8,
    moon: 0xe8eef8,
    ambient: 0.28,
    sunIntensity: 0.38,
    fill: 0x3a4a78,
    fillIntensity: 0.22,
    skyGlow: 0.0,
  },
  light: {
    sky: 0xf2f7fc,
    zenith: 0xe4eef8,
    horizon: 0xfafcfe,
    fog: 0xf0f6fb,
    fogNear: 42,
    fogFar: 98,
    soil: 0x8a6a28,
    fieldLow: 0x7aaa2e,
    fieldHigh: 0xe8c547,
    wheatTip: 0xffe07a,
    wheatStem: 0x8fbc3a,
    particle: 0xffe9a0,
    sun: 0xfff8e8,
    moon: 0xffffff,
    cloud: 0xffffff,
    ambient: 1.05,
    sunIntensity: 1.5,
    fill: 0xc8e0f8,
    fillIntensity: 0.42,
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
  'wheatTip', 'wheatStem', 'particle', 'sun', 'moon', 'fill', 'cloud',
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
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform float uSunGlow;
  uniform float uMoonGlow;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y * 0.5 + 0.35, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.05, 0.85, h));
    vec3 dir = normalize(vDir);

    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float sunDisk = smoothstep(0.992, 0.9996, sunDot) * uSunGlow;
    col = mix(col, vec3(1.0, 0.90, 0.66), sunDisk);
    col += vec3(1.0, 0.80, 0.50) * pow(sunDot, 128.0) * uSunGlow * 0.18;
    col += vec3(1.0, 0.86, 0.58) * pow(sunDot, 24.0) * uSunGlow * 0.06;

    float moonDot = max(dot(dir, normalize(uMoonDir)), 0.0);
    float moonDisk = smoothstep(0.993, 0.9997, moonDot) * uMoonGlow;
    col += vec3(0.94, 0.96, 1.0) * moonDisk;
    col += vec3(0.82, 0.88, 1.0) * pow(moonDot, 48.0) * uMoonGlow * 0.35;

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

  void main() {
    vHeight = position.y;
    vec3 pos = position;
    vec4 world = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 wpos = world.xz;
    vec2 windDir = normalize(uWindDir);
    vec2 crossDir = vec2(-windDir.y, windDir.x);

    float along = dot(wpos, windDir);
    float cross = dot(wpos, crossDir);

    // Coherent wind wave rolling across the field in one direction
    float swell = sin(along * 0.13 - uTime * 0.78);
    float ripple = sin(along * 0.26 - uTime * 1.22 + cross * 0.04) * 0.32;
    float wind = swell * 0.78 + ripple * 0.22;

    float bend = pow(clamp(pos.y, 0.0, 1.2), 1.45);
    vec2 offset = windDir * wind * bend * 0.34;

    // Subtle tip flutter, perpendicular to wind — much weaker than main sway
    float flutter = sin(along * 0.18 - uTime * 1.6 + pos.y * 2.0) * bend * bend * 0.045;
    offset += crossDir * flutter;

    pos.x += offset.x;
    pos.z += offset.y;

    vShade = 0.78 + 0.22 * sin(along * 0.35);
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const WHEAT_FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorHead;
  varying float vHeight;
  varying float vShade;

  void main() {
    vec3 stem = uColorB;
    vec3 leaf = mix(uColorB, uColorA, 0.45);
    vec3 head = uColorHead;
    vec3 col = mix(stem, leaf, smoothstep(0.18, 0.52, vHeight));
    col = mix(col, head, smoothstep(0.68, 0.86, vHeight));
    col *= vShade;
    gl_FragColor = vec4(col, 1.0);
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

function planeAt(w, h, x, y, z, rotX, rotY, rotZ) {
  const geo = new THREE.PlaneGeometry(w, h, 1, 2);
  geo.translate(0, h * 0.5, 0);
  geo.rotateX(rotX);
  geo.rotateY(rotY);
  geo.rotateZ(rotZ);
  geo.translate(x, y, z);
  return geo;
}

/** One wheat plant: crossed stem, leaves, grain head and awns. */
function createWheatPlantGeometry() {
  const parts = [];
  for (const yaw of [0, Math.PI / 2]) {
    parts.push(planeAt(0.028, 0.78, 0, 0, 0, 0, yaw, 0));
    parts.push(planeAt(0.22, 0.16, 0.02, 0.22, 0, -0.35, yaw, 0.55));
    parts.push(planeAt(0.2, 0.14, -0.02, 0.38, 0, 0.28, yaw, -0.5));
    parts.push(planeAt(0.16, 0.12, 0.01, 0.52, 0, -0.22, yaw, 0.38));
    for (let i = 0; i < 6; i++) {
      const gy = 0.74 + i * 0.055;
      const gw = 0.09 - i * 0.006;
      parts.push(planeAt(gw, 0.07, 0, gy, 0, 0, yaw, (i % 2 ? 0.08 : -0.08)));
    }
    parts.push(planeAt(0.012, 0.16, 0.02, 1.02, 0, 0.15, yaw, 0.25));
    parts.push(planeAt(0.012, 0.14, -0.018, 1.0, 0, -0.12, yaw, -0.22));
  }
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

export function initSceneBackground(containerId = 'sceneBackground') {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let palette = getPalette(getTheme());
  let mouseX = 0;
  let mouseY = 0;
  let rafId = 0;
  let visible = !document.hidden;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.fog, palette.fogNear, palette.fogFar);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 220);
  camera.position.set(0, 7.2, 16.5);
  camera.lookAt(0, 2.6, -6);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(palette.sky, 1);
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, palette.ambient);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(palette.sun, palette.sunIntensity);
  sun.position.set(18, 22, 8);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(palette.fill, palette.fillIntensity);
  fill.position.set(-8, 6, -4);
  scene.add(fill);

  const skyGeo = new THREE.SphereGeometry(110, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(palette.zenith) },
      uHorizon: { value: new THREE.Color(palette.horizon) },
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
    } else {
      fill.position.copy(moonDirWorld).multiplyScalar(-12);
      fill.position.y = Math.max(fill.position.y, 6);
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

  const terrainMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: false,
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  world.add(terrain);

  const wheatGeo = createWheatPlantGeometry();
  const underGeo = createUndergrowthGeometry();

  const windDir = new THREE.Vector2(0.92, 0.38).normalize();

  const wheatMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindDir: { value: windDir.clone() },
      uColorA: { value: new THREE.Color(palette.wheatTip) },
      uColorB: { value: new THREE.Color(palette.wheatStem) },
      uColorHead: { value: new THREE.Color(palette.wheatTip) },
    },
    vertexShader: WHEAT_VERT,
    fragmentShader: WHEAT_FRAG,
    side: THREE.DoubleSide,
  });

  const underMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: wheatMat.uniforms.uTime,
      uWindDir: wheatMat.uniforms.uWindDir,
      uColorA: { value: new THREE.Color(palette.fieldLow) },
      uColorB: { value: new THREE.Color(palette.wheatStem) },
      uColorHead: { value: new THREE.Color(palette.fieldHigh) },
    },
    vertexShader: WHEAT_VERT,
    fragmentShader: WHEAT_FRAG,
    side: THREE.DoubleSide,
  });

  const wheatCols = 132;
  const wheatRows = 92;
  const wheat = new THREE.InstancedMesh(wheatGeo, wheatMat, wheatCols * wheatRows);
  scatterInstances(wheat, wheatCols, wheatRows, 60, 44, 0.22, 0.92, 0.38, 1.05);
  world.add(wheat);

  const underCols = 110;
  const underRows = 76;
  const undergrowth = new THREE.InstancedMesh(underGeo, underMat, underCols * underRows);
  scatterInstances(undergrowth, underCols, underRows, 58, 42, 0.18, 0.7, 0.35, 0.72);
  world.add(undergrowth);

  const pollenCount = 90;
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
    size: 0.07,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
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
    scene.fog.color.setHex(palette.fog);
    scene.fog.near = palette.fogNear;
    scene.fog.far = palette.fogFar;
    renderer.setClearColor(palette.sky, 1);
    ambient.intensity = palette.ambient;
    sun.color.setHex(palette.sun);
    sun.intensity = palette.sunIntensity;
    fill.color.setHex(palette.fill);
    fill.intensity = palette.fillIntensity;
    skyMat.uniforms.uZenith.value.setHex(palette.zenith);
    skyMat.uniforms.uHorizon.value.setHex(palette.horizon);
    skyMat.uniforms.uSunGlow.value = sunGlow;
    skyMat.uniforms.uMoonGlow.value = moonGlow;
    wheatMat.uniforms.uColorA.value.setHex(palette.wheatTip);
    wheatMat.uniforms.uColorB.value.setHex(palette.wheatStem);
    wheatMat.uniforms.uColorHead.value.setHex(palette.wheatTip);
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
      wheatMat.uniforms.uTime.value = time;
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
    camera.position.x += (mouseX * 1.6 - camera.position.x) * 0.035;
    camera.position.y += (7.2 + mouseY * 0.8 - camera.position.y) * 0.035;
    camera.lookAt(0, 2.6, -6);
    renderer.render(scene, camera);
  }

  function animate(t) {
    if (!visible) return;
    renderFrame(t);
    rafId = requestAnimationFrame(animate);
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
    if (visible && !reducedMotion) {
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
  if (!reducedMotion) rafId = requestAnimationFrame(animate);

  return {
    dispose() {
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
      container.removeChild(renderer.domElement);
    },
  };
}
