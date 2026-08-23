/**
 * AgriLoop Frontend - 3D 作物田块场景（对标 rium 麦田的材质/光照质量）
 * 与旧「单株盆栽」彻底不同：一片温室作物田块。
 *   - GLSL 大气天空：Rayleigh + 太阳/月亮盘 + 体积光柱 + 各向异性辉光
 *   - 起伏田垄地面（每行一条种植垄 + 行间沟）+ 草丛下木，随湿度/情景变色
 *   - 作物用「交叉平面 + 羽状/掌状复叶 + 果串」的几何，InstancedMesh 整田
 *   - 每像素光照：wrap 漫反射 + 边缘光 + 高光 + 叶片次表面散射（复刻 rium）
 *   - 顶点风场全田联动；天气：云 / 雨幕 / 太阳 / 月亮 / 闪烁星星 / 漂浮微粒
 * WebGL 不可用返回 null，调用方回退 SVG。
 */

function ensureThree() {
  if (typeof window !== 'undefined' && window.THREE) return Promise.resolve(window.THREE);
  return import('../vendor/three.module.min.js').then(m => m.default || null).catch(e => { console.warn('three load fail', e); return null; });
}

/* ------------------------------------------------------------------ 天空 */
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHaze;
  uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uSunGlow; uniform float uMoonGlow;
  varying vec3 vDir;
  void main(){
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.52 + 0.32, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.02, 0.78, h));
    float rayleigh = pow(1.0 - max(dir.y, 0.0), 2.6);
    col = mix(col, uHaze * vec3(1.08,0.9,0.68), rayleigh * mix(0.1,0.34,uSunGlow));
    float band = exp(-pow((h - 0.06)/0.12, 2.0));
    col = mix(col, uHaze, band * mix(0.18,0.58,uSunGlow));
    col += uHaze * exp(-pow(dir.y*4.4, 2.0)) * mix(0.06,0.2,uSunGlow);
    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float sunDisk = smoothstep(0.992, 0.9996, sunDot) * uSunGlow;
    col = mix(col, vec3(1.0,0.88,0.55), sunDisk);
    col += vec3(1.0,0.7,0.32) * pow(sunDot,5.0) * uSunGlow * 0.26;
    col += vec3(1.0,0.82,0.48) * pow(sunDot,16.0) * uSunGlow * 0.18;
    col += vec3(1.0,0.92,0.66) * pow(sunDot,80.0) * uSunGlow * 0.22;
    col += vec3(1.0,0.94,0.78) * pow(sunDot,220.0) * uSunGlow * 0.16;
    float ang = atan(dir.x, dir.z);
    float shafts = pow(sunDot,9.0) * (0.5 + 0.5*sin(ang*14.0 + dir.y*6.0));
    col += vec3(1.0,0.76,0.38) * shafts * uSunGlow * 0.1;
    float aniso = pow(sunDot,24.0) * abs(dir.x) * (1.0 - abs(dir.y));
    col += vec3(1.0,0.84,0.5) * aniso * uSunGlow * 0.12;
    float moonDot = max(dot(dir, normalize(uMoonDir)), 0.0);
    float moonDisk = smoothstep(0.993, 0.9997, moonDot) * uMoonGlow;
    col += vec3(0.94,0.96,1.0) * moonDisk;
    col += vec3(0.72,0.82,1.0) * pow(moonDot,14.0) * uMoonGlow * 0.32;
    col += vec3(0.82,0.88,1.0) * pow(moonDot,48.0) * uMoonGlow * 0.24;
    col += vec3(0.7,0.78,1.0) * pow(moonDot,6.0) * uMoonGlow * 0.1;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ 星星 */
const STAR_VERT = /* glsl */ `
  attribute float aSize; attribute float aPhase; uniform float uTime; varying float vAlpha;
  void main(){
    vAlpha = 0.45 + 0.55 * sin(uTime*1.8 + aPhase);
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    gl_PointSize = aSize * (180.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = /* glsl */ `
  varying float vAlpha;
  void main(){
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if(d > 0.5) discard;
    float core = smoothstep(0.5, 0.08, d);
    gl_FragColor = vec4(0.92,0.95,1.0, core*vAlpha);
  }
`;

/* ------------------------------------------------------------------ 作物 */
const PLANT_VERT = /* glsl */ `
  attribute vec3 aPart;
  uniform float uTime; uniform vec2 uWindDir; uniform float uWind; uniform float uWilt;
  varying vec3 vPart; varying float vHeight; varying float vShade; varying vec3 vWorldPos; varying vec3 vNormal;
  #include <common>
  #include <fog_pars_vertex>
  void main(){
    vPart = aPart; vHeight = position.y;
    vec3 pos = position;
    vec4 world = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
    vec2 wpos = world.xz;
    vec2 windDir = normalize(uWindDir);
    vec2 crossDir = vec2(-windDir.y, windDir.x);
    float along = dot(wpos, windDir);
    float cross = dot(wpos, crossDir);
    float swell = sin(along*0.13 - uTime*0.78);
    float ripple = sin(along*0.26 - uTime*1.22 + cross*0.04)*0.32;
    float wind = swell*0.78 + ripple*0.22;
    float bend = pow(clamp(pos.y, 0.0, 1.6), 1.45);
    vec2 offset = windDir * wind * bend * (0.18 + uWind * 0.44);
    float flutter = sin(along*0.18 - uTime*1.6 + pos.y*2.0) * bend*bend * 0.05;
    offset += crossDir * flutter;
    float w = uWilt * bend;
    pos.x += offset.x - windDir.x * w * 0.6;
    pos.z += offset.y - windDir.y * w * 0.6;
    pos.y -= uWilt * bend*bend * 0.5;
    vShade = 0.82 + 0.18*sin(along*0.35);
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const PLANT_FRAG = /* glsl */ `
  uniform vec3 uStem; uniform vec3 uLeaf; uniform vec3 uLeafWilt; uniform vec3 uFruit;
  uniform vec3 uSunDir; uniform vec3 uRimColor; uniform float uDay; uniform float uMoisture;
  varying vec3 vPart; varying float vHeight; varying float vShade; varying vec3 vWorldPos; varying vec3 vNormal;
  #include <common>
  #include <fog_pars_fragment>
  void main(){
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    N = faceforward(N, -V, N);
    vec3 L = normalize(uSunDir);
    float wrap = clamp(dot(N,L)*0.46 + 0.54, 0.0, 1.0);
    float rim = pow(1.0 - clamp(dot(N,V),0.0,1.0), 2.2);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N,H),0.0), 40.0);
    float back = pow(max(dot(-N,L),0.0), 1.35);
    float sss = pow(max(dot(V,-L),0.0), 1.8);

    vec3 leaf = mix(uLeaf, uLeafWilt, 1.0 - uMoisture);
    vec3 col = vPart.r * uStem + vPart.g * leaf + vPart.b * uFruit;
    col = mix(uStem*0.85, col, smoothstep(0.0, 0.12, vHeight));
    float grain = fract(sin(dot(vWorldPos.xz, vec2(12.9898,78.233))) * 43758.5453);
    col *= 0.93 + grain * 0.12;
    col *= vShade * mix(0.8, 1.2, wrap);
    float leafAmt = vPart.g;
    float fruitAmt = vPart.b;
    col += leaf * sss * leafAmt * mix(0.12, 0.26, uDay);
    col += uRimColor * rim * mix(0.16, 0.4, leafAmt);
    col += vec3(1.0,0.9,0.5) * spec * leafAmt * (0.16 + 0.55*uDay);
    col += vec3(1.0,0.96,0.86) * spec * fruitAmt * (0.4 + 0.6*uDay);
    col += vec3(1.0,0.76,0.36) * back * mix(0.06, 0.12, uDay);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

/* ------------------------------------------------------------------ 地面 */
const TERRAIN_VERT = /* glsl */ `
  attribute vec3 aColor;
  varying vec3 vColor; varying vec3 vWorldPos; varying vec3 vNormal;
  #include <common>
  #include <fog_pars_vertex>
  void main(){
    vColor = aColor;
    vec4 wp = modelMatrix * vec4(position,1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
    #include <fog_vertex>
  }
`;
const TERRAIN_FRAG = /* glsl */ `
  uniform vec3 uSoilWet; uniform vec3 uSoilDry; uniform vec3 uSunDir; uniform vec3 uRimColor;
  uniform float uDay; uniform float uMoisture;
  varying vec3 vColor; varying vec3 vWorldPos; varying vec3 vNormal;
  #include <common>
  #include <fog_pars_fragment>
  void main(){
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    N = faceforward(N, -V, N);
    vec3 L = normalize(uSunDir);
    float wrap = clamp(dot(N,L)*0.5 + 0.5, 0.0, 1.0);
    float rim = pow(1.0 - clamp(dot(N,V),0.0,1.0), 2.0);
    vec3 dry = vec3(0.62,0.46,0.3);
    vec3 alb = mix(vColor, dry, (1.0 - uMoisture) * 0.55);
    float grain = fract(sin(dot(vWorldPos.xz, vec2(41.98,83.23))) * 43758.5453);
    alb *= 0.94 + grain * 0.1;
    vec3 col = alb * mix(0.7, 1.25, wrap);
    col += uRimColor * rim * 0.12;
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

/* ------------------------------------------------------------------ 调色板 */
const PALETTES = {
  normal:  { sky:0x7fb2e8, zenith:0x2f6fb0, horizon:0xf6ecd8, haze:0xbfd6ea, fog:0xcfdbe4, fogNear:9, fogFar:26, exposure:1.05, sunGlow:1.0, sun:0xfff3d0, sunI:1.35, ambient:0.5, hemi:0.55, fill:0xb8d4f0, fillI:0.3, rim:0xffd080, rimI:0.42, soilWet:0x3a2c1c, soilDry:0x8a6a34, grassLow:0x5a7a2c, grassHigh:0x9ab84a, leaf:0x3f9a4a, leafWilt:0x9a9a4a, stem:0x3a7a42, fruit:0xe5483a, wind:0.5 },
  drought: { sky:0xd8c79a, zenith:0x6f7fa8, horizon:0xf2d9a8, haze:0xd8b078, fog:0xe2cfae, fogNear:8, fogFar:22, exposure:1.12, sunGlow:1.3, sun:0xffdf90, sunI:1.7, ambient:0.52, hemi:0.5, fill:0xf0c078, fillI:0.3, rim:0xffc060, rimI:0.5, soilWet:0x6a4c28, soilDry:0xb08a48, grassLow:0x7a7a34, grassHigh:0xbfb860, leaf:0x8a9a42, leafWilt:0xc0a050, stem:0x6a7a38, fruit:0xd07038, wind:0.4 },
  heat:    { sky:0xd8a080, zenith:0x8a4a38, horizon:0xf2c090, haze:0xe09050, fog:0xe0ac88, fogNear:7, fogFar:20, exposure:1.2, sunGlow:1.6, sun:0xffc070, sunI:2.1, ambient:0.56, hemi:0.5, fill:0xf0a060, fillI:0.34, rim:0xff9040, rimI:0.55, soilWet:0x6a4426, soilDry:0xc08a48, grassLow:0x8a7a30, grassHigh:0xd8b050, leaf:0x7aa03c, leafWilt:0xc09040, stem:0x6a8038, fruit:0xe86030, wind:0.45 },
  storm:   { sky:0x2a3340, zenith:0x161c26, horizon:0x3c4654, haze:0x5a6a80, fog:0x2c3540, fogNear:5.5, fogFar:16, exposure:0.8, sunGlow:0.1, sun:0x9ab4ff, sunI:0.4, ambient:0.3, hemi:0.34, fill:0x4a5c88, fillI:0.26, rim:0x88a0cc, rimI:0.3, soilWet:0x2c2418, soilDry:0x4a3c28, grassLow:0x2c4a24, grassHigh:0x4a7a3a, leaf:0x2c8040, leafWilt:0x4a6a38, stem:0x2a6a38, fruit:0xc05040, wind:1.0 },
  drift:   { sky:0x6a5a8a, zenith:0x2c2450, horizon:0xc8a8d0, haze:0xa08ac0, fog:0x6a5c82, fogNear:8, fogFar:24, exposure:0.95, sunGlow:0.6, sun:0xffd8e0, sunI:1.0, ambient:0.42, hemi:0.44, fill:0xc0a0e0, fillI:0.3, rim:0xe0a0ff, rimI:0.42, soilWet:0x3a2c3e, soilDry:0x6a4c50, grassLow:0x3a5a3a, grassHigh:0x6a9a5a, leaf:0x4a8a52, leafWilt:0x8a8a5a, stem:0x3a7248, fruit:0xc058a0, wind:0.55 },
  offline: { sky:0x4a5056, zenith:0x2c3036, horizon:0x5c6268, haze:0x6a7076, fog:0x4a5056, fogNear:7, fogFar:20, exposure:0.85, sunGlow:0.32, sun:0xc8ccd0, sunI:0.55, ambient:0.34, hemi:0.32, fill:0x808890, fillI:0.22, rim:0x9aa0a8, rimI:0.26, soilWet:0x383a3c, soilDry:0x4c4e50, grassLow:0x3c403c, grassHigh:0x565a56, leaf:0x565a56, leafWilt:0x646864, stem:0x4a4e4a, fruit:0x707474, wind:0.15 }
};
const NUM_KEYS = ['fogNear','fogFar','exposure','sunGlow','sunI','ambient','hemi','fillI','rimI','wind'];
const COL_KEYS = ['sky','zenith','horizon','haze','fog','sun','fill','rim','soilWet','soilDry','grassLow','grassHigh','leaf','leafWilt','stem','fruit'];
function mixPalettes(a, b, t, THREE) {
  const o = {};
  NUM_KEYS.forEach(k => { o[k] = a[k] + (b[k] - a[k]) * t; });
  COL_KEYS.forEach(k => { o[k] = new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t).getHex(); });
  return o;
}

/* ------------------------------------------------------------------ 几何构建 */
const STEM = [1, 0, 0], LEAF = [0, 1, 0], FRUIT = [0, 0, 1];

function mergeParts(THREE, parts) {
  const P = [], I = [], H = [], C = []; let off = 0;
  parts.forEach(([g, part]) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); H.push(p.getY(i)); C.push(part[0], part[1], part[2]); }
    if (g.index) { for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + off); }
    else { for (let i = 0; i < p.count; i++) I.push(off + i); }
    off += p.count; g.dispose();
  });
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  m.setIndex(I);
  m.setAttribute('aPart', new THREE.Float32BufferAttribute(C, 3));
  m.computeVertexNormals();
  return m;
}

function leafShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.14, -0.11, 0.32, 0);
  s.quadraticCurveTo(0.14, 0.11, 0, 0);
  return s;
}

/** 单株作物构建器：返回 {geometry, climbing}。parts 收集后统一 merge。 */
function buildCrop(THREE, cropCode) {
  const parts = [];
  const ls = leafShape();
  const V = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0), Q = new THREE.Quaternion();
  const push = (g, part) => parts.push([g, part]);

  // 沿方向 dir 的圆台（茎/叶柄/卷须/竹竿）
  const tubeAt = (r0, r1, len, base, dir, part) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, 7);
    Q.setFromUnitVectors(U, V.copy(dir).normalize());
    g.applyQuaternion(Q);
    g.translate(base.x + dir.x * len / 2, base.y + dir.y * len / 2, base.z + dir.z * len / 2);
    push(g, part);
  };
  // 水平阔叶：基点在原点，沿 +x，先放平（法线 +y）再绕垂直轴偏转、再下垂
  const broadLeaf = (x, y, z, yaw, droop, scale, part) => {
    const g = new THREE.ShapeGeometry(ls, 6);
    g.rotateX(-Math.PI / 2);
    g.rotateY(yaw);
    g.rotateX(droop);
    g.scale(scale, scale, scale);
    g.translate(x, y, z);
    push(g, part);
  };
  // 一枚羽状复叶：叶柄（rachis）+ 成对小叶 + 顶叶
  const compoundLeaf = (y, yaw, size) => {
    const pitch = 0.5; // 叶柄上扬角
    const len = 0.42 * size;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    tubeAt(0.006 * size, 0.012 * size, len, new THREE.Vector3(0, y, 0), dir, STEM);
    const tip = new THREE.Vector3(dir.x * len, y + dir.y * len, dir.z * len);
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      const px = dir.x * len * t, py = y + dir.y * len * t, pz = dir.z * len * t;
      broadLeaf(px, py, pz, yaw + 0.9, -0.28, size * (0.72 - t * 0.28), LEAF);
      broadLeaf(px, py, pz, yaw - 0.9, -0.28, size * (0.72 - t * 0.28), LEAF);
    }
    broadLeaf(tip.x, tip.y, tip.z, yaw, -0.34, size * 0.55, LEAF);
  };
  // 一枚掌状叶（黄瓜）：5 裂自一点放射
  const palmateLeaf = (x, y, z, yaw, size) => {
    for (let k = 0; k < 5; k++) {
      const a = yaw + (k - 2) * 0.55;
      broadLeaf(x, y, z, a, -0.18, size * (k === 2 ? 0.7 : 0.52), LEAF);
    }
  };
  // 果串：沿垂向排布的小球
  const fruitCluster = (x, y, z, count, r, part) => {
    for (let i = 0; i < count; i++) {
      const f = new THREE.SphereGeometry(r * (1 - i * 0.07), 11, 9);
      f.scale(1, 0.98, 1);
      f.translate(x, y - i * r * 1.5, z);
      push(f, part);
    }
  };

  if (cropCode === 'tomato') {
    // 主茎（微弯，三段）+ 节点
    const segs = [[0, 0.32], [0.32, 0.66], [0.66, 1.02], [1.02, 1.3]];
    for (let i = 0; i < segs.length; i++) {
      const y0 = segs[i][0], y1 = segs[i][1];
      const dir = new THREE.Vector3(Math.sin(i * 0.7) * 0.05, 1, Math.cos(i * 0.7) * 0.05).normalize();
      tubeAt(0.018, 0.026, (y1 - y0) * 1.04, new THREE.Vector3(Math.sin(i * 0.7) * 0.03, y0, Math.cos(i * 0.7) * 0.03), dir, STEM);
      const node = new THREE.SphereGeometry(0.03, 8, 6); node.scale(1, 0.7, 1); node.translate(0, y0, 0); push(node, STEM);
    }
    // 羽状复叶（黄金角螺旋排布，6 枚）
    for (let i = 0; i < 6; i++) {
      const y = 0.2 + i * 0.19;
      compoundLeaf(y, i * 2.4 + 0.4, 1.0 - i * 0.055);
    }
    // 果串（4 串，各 4 果）
    const trusses = [[0.14, 0.42, 0.5], [-0.15, 0.72, 2.4], [0.16, 1.02, 0.9], [-0.12, 1.18, 3.6]];
    trusses.forEach(([fx, fy, fz]) => {
      fruitCluster(fx, fy, fz, 4, 0.075, FRUIT);
      const cal = new THREE.SphereGeometry(0.026, 8, 6); cal.scale(1.4, 0.5, 1.4); cal.translate(fx, fy + 0.06, fz); push(cal, STEM);
    });
  } else if (cropCode === 'cucumber') {
    // 攀援主蔓 + 竹竿
    const segs = [[0, 0.3], [0.3, 0.66], [0.66, 1.05], [1.05, 1.4]];
    for (let i = 0; i < segs.length; i++) {
      const y0 = segs[i][0], y1 = segs[i][1];
      const dir = new THREE.Vector3(Math.sin(i * 0.5) * 0.06, 1, 0).normalize();
      tubeAt(0.014, 0.02, (y1 - y0) * 1.04, new THREE.Vector3(Math.sin(i * 0.5) * 0.02, y0, 0), dir, STEM);
    }
    // 掌状叶（6 枚螺旋）
    for (let i = 0; i < 6; i++) {
      const y = 0.22 + i * 0.2;
      palmateLeaf(Math.sin(i * 2.4) * 0.08, y, Math.cos(i * 2.4) * 0.08, i * 2.4, 0.22);
    }
    // 卷须（细螺旋管）
    for (let i = 0; i < 4; i++) {
      const y = 0.28 + i * 0.34;
      const dir = new THREE.Vector3(Math.sin(i * 1.7 + 1) * 0.9, 0.4, Math.cos(i * 1.7 + 1) * 0.9).normalize();
      tubeAt(0.004, 0.004, 0.26, new THREE.Vector3(0, y, 0), dir, STEM);
    }
    // 长果
    [[0.16, 0.5, 0.4], [-0.16, 0.95, 2.2], [0.18, 1.22, 0.8]].forEach(([fx, fy, fz]) => {
      const c = new THREE.SphereGeometry(0.06, 11, 9); c.scale(0.72, 1.9, 0.72); c.translate(fx, fy, fz); push(c, FRUIT);
    });
  } else if (cropCode === 'strawberry') {
    // 矮生莲座：中央短茎 + 放射叶 + 匍匐茎 + 浆果
    tubeAt(0.014, 0.02, 0.16, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), STEM);
    for (let i = 0; i < 7; i++) {
      const a = i * (Math.PI * 2 / 7);
      broadLeaf(Math.sin(a) * 0.05, 0.05, Math.cos(a) * 0.05, a, -0.42, 0.24, LEAF);
    }
    // 匍匐茎 + 小株
    for (let r = 0; r < 2; r++) {
      const a = r * 2.4 + 0.5;
      tubeAt(0.005, 0.005, 0.34, new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(Math.sin(a), -0.1, Math.cos(a)).normalize(), STEM);
      const ex = Math.sin(a) * 0.3, ez = Math.cos(a) * 0.3;
      for (let k = 0; k < 3; k++) broadLeaf(ex, 0.03, ez, a + k * 0.7, -0.4, 0.16, LEAF);
    }
    fruitCluster(0.07, 0.12, 0.06, 3, 0.05, FRUIT);
    fruitCluster(-0.07, 0.1, -0.05, 3, 0.045, FRUIT);
  } else { // pepper
    // 灌木：短主干 + 密集叶 + 灯笼果
    tubeAt(0.016, 0.024, 0.3, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), STEM);
    tubeAt(0.01, 0.016, 0.26, new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(0.5, 0.6, 0.3).normalize(), STEM);
    tubeAt(0.01, 0.016, 0.26, new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(-0.5, 0.6, -0.3).normalize(), STEM);
    for (let i = 0; i < 8; i++) {
      const a = i * 2.3 + 0.3;
      const y = 0.16 + i * 0.06;
      broadLeaf(Math.sin(a) * 0.1, y, Math.cos(a) * 0.1, a, -0.24, 0.3, LEAF);
    }
    // 灯笼果（3 个，略拉长）
    [[0.12, 0.4, 0.3], [-0.12, 0.52, 1.7], [0.1, 0.6, 2.6]].forEach(([fx, fy, fz]) => {
      const p = new THREE.SphereGeometry(0.06, 11, 9); p.scale(0.9, 1.15, 0.9); p.translate(fx, fy, fz); push(p, FRUIT);
    });
  }

  return mergeParts(THREE, parts);
}

/** 草丛下木（行间/垄侧填充）：几片竖直草叶 */
function buildGrass(THREE) {
  const parts = [];
  const push = (g, part) => parts.push([g, part]);
  const ls = leafShape();
  for (const yaw of [0, Math.PI / 2.4, Math.PI * 1.3]) {
    const g = new THREE.ShapeGeometry(ls, 5);
    g.rotateX(-Math.PI / 2);
    g.rotateY(yaw);
    g.rotateX(-0.7);
    g.scale(0.5, 0.5, 0.5);
    g.translate(0, 0, 0);
    push(g, LEAF);
  }
  return mergeParts(THREE, parts);
}

/* ------------------------------------------------------------------ 日月纹理 */
function celestialTex(THREE, kind) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); const cx = 128, cy = 128, r = 256 * 0.46;
  if (kind === 'sun') {
    const halo = x.createRadialGradient(cx, cy, r * 0.46, cx, cy, r);
    halo.addColorStop(0, 'rgba(255,220,150,0.14)'); halo.addColorStop(0.5, 'rgba(255,200,110,0.04)'); halo.addColorStop(1, 'rgba(255,190,80,0)');
    x.fillStyle = halo; x.fillRect(0, 0, 256, 256);
    const dr = r * 0.34;
    const b = x.createRadialGradient(cx - dr * 0.22, cy - dr * 0.22, 0, cx, cy, dr);
    b.addColorStop(0, 'rgba(255,240,185,1)'); b.addColorStop(0.6, 'rgba(252,222,150,1)'); b.addColorStop(1, 'rgba(238,192,92,1)');
    x.fillStyle = b; x.beginPath(); x.arc(cx, cy, dr, 0, 6.283); x.fill();
    x.strokeStyle = 'rgba(160,92,24,0.92)'; x.lineWidth = 3.5; x.beginPath(); x.arc(cx, cy, dr, 0, 6.283); x.stroke();
  } else {
    const halo = x.createRadialGradient(cx, cy, r * 0.28, cx, cy, r);
    halo.addColorStop(0, 'rgba(220,228,242,0.28)'); halo.addColorStop(0.5, 'rgba(200,210,228,0.07)'); halo.addColorStop(1, 'rgba(180,190,210,0)');
    x.fillStyle = halo; x.fillRect(0, 0, 256, 256);
    const dr = r * 0.3;
    const b = x.createRadialGradient(cx - dr * 0.25, cy - dr * 0.25, 0, cx, cy, dr);
    b.addColorStop(0, 'rgba(246,250,255,1)'); b.addColorStop(0.7, 'rgba(228,234,246,1)'); b.addColorStop(1, 'rgba(206,214,232,1)');
    x.fillStyle = b; x.beginPath(); x.arc(cx, cy, dr, 0, 6.283); x.fill();
    x.strokeStyle = 'rgba(148,160,186,0.5)'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, dr, 0, 6.283); x.stroke();
    x.fillStyle = 'rgba(168,178,198,0.4)';
    for (const [ox, oy, rr] of [[0.12, -0.08, 0.09], [-0.14, 0.1, 0.07], [0.05, 0.16, 0.06], [-0.06, -0.15, 0.05]]) { x.beginPath(); x.arc(cx + ox * r, cy + oy * r, rr * r, 0, 6.283); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ------------------------------------------------------------------ 主入口 */
export async function createPotScene(canvas, opts = {}) {
  const cropCode = opts.cropCode || 'tomato';
  const THREE = await ensureThree();
  if (!THREE) return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
  const HOME = { x: 0, y: 2.6, z: 6.6 };
  camera.position.set(HOME.x, HOME.y, HOME.z);
  camera.lookAt(0, 1.05, -0.6);

  let palette = { ...PALETTES.normal }, blended = { ...PALETTES.normal };
  let mouseX = 0, mouseY = 0, rafId = 0, visible = !document.hidden;
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.fog, palette.fogNear, palette.fogFar);

  const SUN_DIR = new THREE.Vector3(0.45, 0.62, -0.64).normalize();
  const MOON_DIR = new THREE.Vector3(-0.5, 0.58, -0.62).normalize();

  /* ---- 灯光 ---- */
  const hemi = new THREE.HemisphereLight(palette.zenith, palette.soilWet, palette.hemi); scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, palette.ambient); scene.add(ambient);
  const sun = new THREE.DirectionalLight(palette.sun, palette.sunI); sun.position.copy(SUN_DIR).multiplyScalar(20); scene.add(sun);
  const fill = new THREE.DirectionalLight(palette.fill, palette.fillI); fill.position.set(-6, 4, -3); scene.add(fill);
  const rim = new THREE.DirectionalLight(palette.rim, palette.rimI); rim.position.set(-7, 6, -9); scene.add(rim);

  /* ---- 天空 ---- */
  const skyGeo = new THREE.SphereGeometry(52, 36, 24);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(palette.zenith) }, uHorizon: { value: new THREE.Color(palette.horizon) },
      uHaze: { value: new THREE.Color(palette.haze) }, uSunDir: { value: SUN_DIR.clone() }, uMoonDir: { value: MOON_DIR.clone() },
      uSunGlow: { value: 1 }, uMoonGlow: { value: 0 },
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: celestialTex(THREE, 'sun'), transparent: true, depthTest: false, depthWrite: false, fog: false }));
  sunSprite.scale.set(4.2, 4.2, 1); sunSprite.position.copy(SUN_DIR).multiplyScalar(46); scene.add(sunSprite);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: celestialTex(THREE, 'moon'), transparent: true, depthTest: false, depthWrite: false, fog: false }));
  moonSprite.scale.set(3.0, 3.0, 1); moonSprite.position.copy(MOON_DIR).multiplyScalar(46); scene.add(moonSprite);

  /* ---- 星星 ---- */
  const SN = 600, sp = new Float32Array(SN * 3), ss = new Float32Array(SN), sph = new Float32Array(SN);
  for (let i = 0; i < SN; i++) {
    const th = Math.random() * 6.283, ph = Math.acos(0.08 + Math.random() * 0.92), rr = 48;
    sp[i * 3] = rr * Math.sin(ph) * Math.cos(th); sp[i * 3 + 1] = rr * Math.cos(ph); sp[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
    ss[i] = 0.5 + Math.random() * 1.6; sph[i] = Math.random() * 6.283;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sph, 1));
  const starMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Points(starGeo, starMat); stars.visible = false; scene.add(stars);

  /* ---- 起伏田垄地面 ---- */
  const ROW_Z = [-2.7, -1.35, 0, 1.35, 2.7];
  const terrainHeight = (x, z) => {
    const hills = Math.sin(x * 0.13) * 0.26 + Math.cos(z * 0.11) * 0.2 + Math.sin((x + z) * 0.075) * 0.14;
    let bed = 0;
    for (const zc of ROW_Z) { const dz = z - zc; bed += 0.14 * Math.exp(-dz * dz * 1.5); }
    return hills + bed;
  };
  const terrainGeo = new THREE.PlaneGeometry(12, 9, 64, 56); terrainGeo.rotateX(-Math.PI / 2);
  const tp = terrainGeo.attributes.position;
  const tcol = new Float32Array(tp.count * 3);
  const soilWetC = new THREE.Color(palette.soilWet), soilDryC = new THREE.Color(palette.soilDry);
  const soilBedC = soilWetC.clone().lerp(soilDryC, 0.35);
  const grassLowC = new THREE.Color(palette.grassLow), grassHighC = new THREE.Color(palette.grassHigh), tc = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    const y = terrainHeight(x, z);
    tp.setY(i, y);
    // 垄顶 = 土壤，沟底 = 草；高度混合
    const bedAmt = THREE.MathUtils.clamp((y - 0.02) / 0.16, 0, 1);
    tc.copy(grassLowC).lerp(grassHighC, THREE.MathUtils.clamp((y + 0.1) / 0.3, 0, 1));
    tc.lerp(soilBedC, bedAmt * 0.7);
    tcol[i * 3] = tc.r; tcol[i * 3 + 1] = tc.g; tcol[i * 3 + 2] = tc.b;
  }
  terrainGeo.setAttribute('aColor', new THREE.BufferAttribute(tcol, 3));
  terrainGeo.computeVertexNormals();
  const terrainMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uSoilWet: { value: new THREE.Color(palette.soilWet) }, uSoilDry: { value: new THREE.Color(palette.soilDry) },
      uSunDir: { value: SUN_DIR.clone() }, uRimColor: { value: new THREE.Color(palette.rim) },
      uDay: { value: 1 }, uMoisture: { value: 0.3 },
    }]),
    vertexShader: TERRAIN_VERT, fragmentShader: TERRAIN_FRAG, fog: true,
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat); scene.add(terrain);

  /* ---- 作物 InstancedMesh ---- */
  const plantGeo = buildCrop(THREE, cropCode);
  const windDir = new THREE.Vector2(0.92, 0.38).normalize();
  const plantMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uWindDir: { value: windDir.clone() }, uWind: { value: palette.wind }, uWilt: { value: 0 },
      uStem: { value: new THREE.Color(palette.stem) }, uLeaf: { value: new THREE.Color(palette.leaf) },
      uLeafWilt: { value: new THREE.Color(palette.leafWilt) }, uFruit: { value: new THREE.Color(palette.fruit) },
      uSunDir: { value: SUN_DIR.clone() }, uRimColor: { value: new THREE.Color(palette.rim) },
      uDay: { value: 1 }, uMoisture: { value: 0.3 },
    }]),
    vertexShader: PLANT_VERT, fragmentShader: PLANT_FRAG, side: THREE.DoubleSide, fog: true,
  });

  const COLS = 10, ROWS = ROW_Z.length, N = COLS * ROWS;
  const crops = new THREE.InstancedMesh(plantGeo, plantMat, N);
  const d = new THREE.Object3D(); let n = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = (c / (COLS - 1) - 0.5) * 6.6 + (Math.random() - 0.5) * 0.18;
    const z = ROW_Z[r] + (Math.random() - 0.5) * 0.18;
    const y = terrainHeight(x, z);
    d.position.set(x, y, z);
    d.rotation.set((Math.random() - 0.5) * 0.05, Math.random() * 6.283, (Math.random() - 0.5) * 0.05);
    const s = 0.82 + Math.random() * 0.36;
    d.scale.set(s, s * (0.9 + Math.random() * 0.25), s);
    d.updateMatrix(); crops.setMatrixAt(n, d.matrix); n++;
  }
  crops.instanceMatrix.needsUpdate = true; scene.add(crops);

  /* ---- 竹竿（番茄/黄瓜攀架） ---- */
  let stakes = null, stakeMat = null;
  if (cropCode === 'tomato' || cropCode === 'cucumber') {
    stakeMat = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.65 });
    stakes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.026, 1.6, 7), stakeMat, N);
    const d2 = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const m = new THREE.Matrix4(); crops.getMatrixAt(i, m);
      d2.position.setFromMatrixPosition(m); d2.position.y += 0.35; d2.position.x += 0.06;
      d2.rotation.set(0, 0, 0); d2.scale.set(1, 1, 1);
      d2.updateMatrix(); stakes.setMatrixAt(i, d2.matrix);
    }
    stakes.instanceMatrix.needsUpdate = true; scene.add(stakes);
  }

  /* ---- 草丛下木 ---- */
  const grassGeo = buildGrass(THREE);
  const grassMat = plantMat.clone();
  grassMat.uniforms = THREE.UniformsUtils.clone(grassMat.uniforms);
  grassMat.uniforms.uStem.value = plantMat.uniforms.uStem.value.clone();
  grassMat.uniforms.uLeaf.value = new THREE.Color(palette.grassHigh);
  grassMat.uniforms.uLeafWilt.value = new THREE.Color(palette.grassLow);
  grassMat.uniforms.uFruit.value = new THREE.Color(palette.grassHigh);
  const GN = 420;
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, GN);
  const d3 = new THREE.Object3D(); let gn = 0;
  for (let i = 0; i < GN; i++) {
    const x = (Math.random() - 0.5) * 8;
    const z = (Math.random() - 0.5) * 6.4;
    const y = terrainHeight(x, z) - 0.02;
    d3.position.set(x, y, z);
    d3.rotation.set(0, Math.random() * 6.283, 0);
    const s = 0.35 + Math.random() * 0.5;
    d3.scale.set(s, s * (0.6 + Math.random() * 0.7), s);
    d3.updateMatrix(); grass.setMatrixAt(gn, d3.matrix); gn++;
  }
  grass.instanceMatrix.needsUpdate = true; scene.add(grass);

  /* ---- 云 ---- */
  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  const cloudLayouts = [[-2.6, 3.4, -3.4, 1.3], [2.4, 3.8, -4.0, 1.0], [-0.4, 4.2, -4.6, 0.8], [3.4, 3.2, -2.8, 0.9]];
  for (const [cx, cy, cz, s] of cloudLayouts) {
    const puff = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      m.position.set((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 1.4);
      m.scale.set(0.7 + Math.random() * 0.8, 0.45 + Math.random() * 0.3, 0.7 + Math.random() * 0.6);
      puff.add(m);
    }
    puff.position.set(cx, cy, cz); puff.scale.set(s, s, s);
    scene.add(puff); clouds.push({ group: puff, baseX: cx, phase: Math.random() * 6 });
  }

  /* ---- 雨 ---- */
  const RN = 420, rp = new Float32Array(RN * 3);
  for (let i = 0; i < RN; i++) { rp[i * 3] = (Math.random() - 0.5) * 8; rp[i * 3 + 1] = Math.random() * 5 + 0.2; rp[i * 3 + 2] = (Math.random() - 0.5) * 6 - 0.3; }
  const rain = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(rp, 3)), new THREE.PointsMaterial({ color: 0x9fc0ff, size: 0.05, transparent: true, opacity: 0.65, depthWrite: false }));
  rain.visible = false; scene.add(rain);

  /* ---- 漂浮微粒（日间花粉 / 漂移雾滴） ---- */
  const MN = 160, mp = new Float32Array(MN * 3);
  for (let i = 0; i < MN; i++) { mp[i * 3] = (Math.random() - 0.5) * 8; mp[i * 3 + 1] = 0.6 + Math.random() * 4; mp[i * 3 + 2] = (Math.random() - 0.5) * 6; }
  const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(mp, 3)), new THREE.PointsMaterial({ color: 0xfff0c0, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(motes);

  /* ---- 状态与调色 ---- */
  const state = { scenario: 'normal', moisture: 20, target: PALETTES.normal };

  const applyPalette = (p) => {
    palette = p;
    const day = p.sunGlow > 0.45;
    const dayAmt = THREE.MathUtils.clamp(p.sunGlow, 0, 1);
    scene.background.setHex(p.sky);
    scene.fog.color.setHex(p.fog); scene.fog.near = p.fogNear; scene.fog.far = p.fogFar;
    renderer.toneMappingExposure = p.exposure;
    hemi.color.setHex(p.zenith); hemi.groundColor.setHex(p.soilWet); hemi.intensity = p.hemi;
    ambient.intensity = p.ambient;
    sun.color.setHex(p.sun); sun.intensity = p.sunI;
    fill.color.setHex(p.fill); fill.intensity = p.fillI;
    rim.color.setHex(p.rim); rim.intensity = p.rimI;
    skyMat.uniforms.uZenith.value.setHex(p.zenith);
    skyMat.uniforms.uHorizon.value.setHex(p.horizon);
    skyMat.uniforms.uHaze.value.setHex(p.haze);
    skyMat.uniforms.uSunGlow.value = day ? dayAmt : 0;
    skyMat.uniforms.uMoonGlow.value = day ? 0 : 1;
    sunSprite.visible = day; moonSprite.visible = !day; stars.visible = !day;
    sunSprite.material.opacity = Math.min(1, dayAmt);
    sunSprite.material.color.setHex(p.sun);
    clouds.visible = day;
    motes.visible = day || state.scenario === 'drift';
    motes.material.color.setHex(state.scenario === 'drift' ? 0xc9a0ff : 0xfff0c0);
    plantMat.uniforms.uStem.value.setHex(p.stem);
    plantMat.uniforms.uLeaf.value.setHex(p.leaf);
    plantMat.uniforms.uLeafWilt.value.setHex(p.leafWilt);
    plantMat.uniforms.uFruit.value.setHex(p.fruit);
    plantMat.uniforms.uRimColor.value.setHex(p.rim);
    plantMat.uniforms.uDay.value = dayAmt;
    plantMat.uniforms.uWind.value = p.wind;
    terrainMat.uniforms.uSoilWet.value.setHex(p.soilWet);
    terrainMat.uniforms.uSoilDry.value.setHex(p.soilDry);
    terrainMat.uniforms.uRimColor.value.setHex(p.rim);
    terrainMat.uniforms.uDay.value = dayAmt;
    grassMat.uniforms.uLeaf.value.setHex(p.grassHigh);
    grassMat.uniforms.uLeafWilt.value.setHex(p.grassLow);
    grassMat.uniforms.uRimColor.value.setHex(p.rim);
    grassMat.uniforms.uDay.value = dayAmt;
    grassMat.uniforms.uWind.value = p.wind;
    cloudMat.color.setHex(day ? 0xffffff : 0x8899aa);
    if (stakeMat) stakeMat.color.setHex(day ? 0xb08a4a : 0x8a8a8a);
  };
  const setScenario = (c) => { state.scenario = c || 'normal'; state.target = PALETTES[state.scenario] || PALETTES.normal; };
  const setMoisture = (m) => { state.moisture = Number(m) || 20; };
  const setSize = (w, h) => { if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const resize = () => { const r = canvas.parentElement ? canvas.parentElement.getBoundingClientRect() : { width: 400, height: 440 }; setSize(r.width, r.height); };

  canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return; mouseX = (e.clientX / r.width - 0.5) * 2; mouseY = -(e.clientY / r.height - 0.5) * 2; });
  canvas.addEventListener('mouseleave', () => { mouseX = 0; mouseY = 0; });

  const clock = new THREE.Clock();
  const frame = (t) => {
    const time = t * 0.001, dt = Math.min(clock.getDelta(), 0.05);
    blended = mixPalettes(blended, state.target, Math.min(1, dt * 2.2), THREE);
    applyPalette(blended);

    const mr = Math.min(1, Math.max(0, (state.moisture - 10) / 30));
    const m = plantMat.uniforms.uMoisture.value;
    plantMat.uniforms.uMoisture.value += (mr - m) * Math.min(1, dt * 3);
    terrainMat.uniforms.uMoisture.value += (mr - terrainMat.uniforms.uMoisture.value) * Math.min(1, dt * 3);
    grassMat.uniforms.uMoisture.value = plantMat.uniforms.uMoisture.value;

    const wilt = (state.scenario === 'drought' || state.moisture < 20) ? Math.min(1, (20 - state.moisture) / 6 + (state.scenario === 'drought' ? 0.35 : 0)) : 0;
    plantMat.uniforms.uWilt.value += (wilt - plantMat.uniforms.uWilt.value) * Math.min(1, dt * 3);
    plantMat.uniforms.uTime.value = time * (reducedMotion ? 0 : 1);
    grassMat.uniforms.uTime.value = plantMat.uniforms.uTime.value;
    starMat.uniforms.uTime.value = time;

    camera.position.x += (HOME.x + mouseX * 0.5 - camera.position.x) * 0.045;
    camera.position.y += (HOME.y + mouseY * 0.3 - camera.position.y) * 0.045;
    camera.lookAt(0, 1.05, -0.6);

    clouds.forEach((c) => {
      c.group.position.x = c.baseX + Math.sin(time * 0.06 + c.phase) * 1.3 * (state.scenario === 'storm' ? 1.8 : 1);
      cloudMat.opacity = (state.scenario === 'storm' ? 0.85 : 0.5) * (reducedMotion ? 1 : 1);
    });
    rain.visible = state.scenario === 'storm';
    if (rain.visible) {
      const pos = rain.geometry.attributes.position.array;
      for (let i = 0; i < RN; i++) {
        pos[i * 3 + 1] -= dt * (2.6 + (i % 3) * 0.7);
        if (pos[i * 3 + 1] < 0.1) { pos[i * 3 + 1] = 5 + Math.random() * 0.4; pos[i * 3] = (Math.random() - 0.5) * 8; }
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    if (motes.visible) {
      const pos = motes.geometry.attributes.position.array;
      for (let i = 0; i < MN; i++) {
        pos[i * 3] += Math.sin(time * 0.5 + i) * 0.004 + (state.scenario === 'drift' ? 0.004 : 0);
        pos[i * 3 + 1] += Math.sin(time * 0.6 + i * 1.7) * 0.004;
        if (pos[i * 3 + 1] > 5.5) pos[i * 3 + 1] = 0.5;
      }
      motes.geometry.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
  };
  const animate = (t) => { rafId = requestAnimationFrame(animate); if (!visible) return; frame(t); };
  const onVis = () => { visible = !document.hidden; if (visible && !reducedMotion) { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(animate); } };

  resize(); applyPalette(PALETTES.normal);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVis);
  if (!reducedMotion) rafId = requestAnimationFrame(animate); else frame(0);

  return {
    setScenario, setMoisture, resize,
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      try { renderer.dispose(); } catch (e) {}
      try { canvas.remove(); } catch (e) {}
    },
  };
}
