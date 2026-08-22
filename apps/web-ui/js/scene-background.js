/**
 * Three.js wheat-field background — rolling hills, wind-swept stalks, theme-aware dusk/day.
 */
import * as THREE from 'three';
import { getTheme } from './theme.js';

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
  uniform float uSunGlow;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y * 0.5 + 0.35, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.05, 0.85, h));
    float sun = pow(max(dot(normalize(vDir), normalize(uSunDir)), 0.0), 48.0) * uSunGlow;
    col += vec3(1.0, 0.93, 0.72) * sun;
    col += vec3(1.0, 0.96, 0.86) * pow(max(dot(normalize(vDir), normalize(uSunDir)), 0.0), 8.0) * uSunGlow * 0.18;
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

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
}

function placeCelestial(group, azDeg, elDeg, radius = 96) {
  const az = THREE.MathUtils.degToRad(azDeg);
  const el = THREE.MathUtils.degToRad(elDeg);
  group.position.set(
    radius * Math.cos(el) * Math.sin(az),
    radius * Math.sin(el),
    -radius * Math.cos(el) * Math.cos(az),
  );
}

function createSunBody() {
  const group = new THREE.Group();
  group.renderOrder = 2;
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(5.4, 28, 28),
    new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false }),
  );
  group.add(core);
  for (const [r, color, opacity] of [
    [8.8, 0xffe8a8, 0.38],
    [13.5, 0xffd070, 0.16],
    [19.0, 0xffb848, 0.07],
  ]) {
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 20),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        fog: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ));
  }
  group.userData.core = core;
  return group;
}

function createMoonBody() {
  const group = new THREE.Group();
  group.renderOrder = 2;
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xf0f4fc, fog: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(4.2, 32, 32), coreMat);
  group.add(core);
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(7.2, 20, 20),
    new THREE.MeshBasicMaterial({
      color: 0xc8d8f0,
      transparent: true,
      opacity: 0.24,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  ));
  const craterMat = new THREE.MeshBasicMaterial({ color: 0xb0bcd0, fog: false });
  for (const [nx, ny, nz, s] of [
    [0.85, 0.45, 0.28, 0.5],
    [-0.55, 0.75, -0.32, 0.42],
    [0.18, -0.68, 0.58, 0.36],
    [-0.28, -0.38, -0.82, 0.44],
    [0.48, 0.08, -0.72, 0.32],
  ]) {
    const len = Math.hypot(nx, ny, nz) || 1;
    const spot = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 10), craterMat);
    spot.position.set((nx / len) * 4.25, (ny / len) * 4.25, (nz / len) * 4.25);
    group.add(spot);
  }
  group.userData.coreMat = coreMat;
  return group;
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
      uSunDir: { value: new THREE.Vector3(0.45, 0.72, 0.28).normalize() },
      uSunGlow: { value: palette.skyGlow },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.renderOrder = 0;
  scene.add(skyDome);

  const celestials = new THREE.Group();
  scene.add(celestials);

  const sunGroup = createSunBody();
  placeCelestial(sunGroup, 52, 34);
  celestials.add(sunGroup);

  const moonGroup = createMoonBody();
  placeCelestial(moonGroup, -128, 36);
  celestials.add(moonGroup);

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

  function setDayNight(isDay) {
    sunGroup.visible = isDay;
    moonGroup.visible = !isDay;
    clouds.visible = isDay;
    stars.visible = !isDay;
    pollen.visible = isDay;
    skyMat.uniforms.uSunGlow.value = isDay ? 1 : 0;
    const body = isDay ? sunGroup : moonGroup;
    skyMat.uniforms.uSunDir.value.copy(body.position).normalize();
    if (isDay) {
      sun.position.copy(sunGroup.position).normalize().multiplyScalar(40);
    } else {
      fill.position.set(-sunGroup.position.x * 0.3, 8, -sunGroup.position.z * 0.3);
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

  function applyPalette(next) {
    palette = next;
    const isDay = next === PALETTES.light;
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
    wheatMat.uniforms.uColorA.value.setHex(palette.wheatTip);
    wheatMat.uniforms.uColorB.value.setHex(palette.wheatStem);
    wheatMat.uniforms.uColorHead.value.setHex(palette.wheatTip);
    underMat.uniforms.uColorA.value.setHex(palette.fieldLow);
    underMat.uniforms.uColorB.value.setHex(palette.wheatStem);
    underMat.uniforms.uColorHead.value.setHex(palette.fieldHigh);
    pollenMat.color.setHex(palette.particle);
    moonGroup.userData.coreMat.color.setHex(palette.moon);
    if (palette.cloud !== undefined) {
      cloudMat.color.setHex(palette.cloud);
      cloudMat.opacity = isDay ? 0.94 : 0;
    }
    setDayNight(isDay);

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

  function renderFrame(t = 0) {
    const time = t * 0.001;
    if (!reducedMotion) {
      wheatMat.uniforms.uTime.value = time;
      starMat.uniforms.uTime.value = time;
      sunGroup.lookAt(camera.position);
      moonGroup.lookAt(camera.position);
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
  document.addEventListener('agriloop-theme-change', onThemeChange);
  document.addEventListener('visibilitychange', onVisibilityChange);

  renderFrame(0);
  if (!reducedMotion) rafId = requestAnimationFrame(animate);

  return {
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('agriloop-theme-change', onThemeChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      disposeGroup(sunGroup);
      disposeGroup(moonGroup);
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
