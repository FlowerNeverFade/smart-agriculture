/**
 * AgriLoop Frontend - 3D 作物田块特写场景（对标 rium 麦田的材质/光照质量）
 * 立足点：站在田垄之间，近距离特写作物——
 *   - 低机位（近人视高）+ 前景植株占画面大半 + 行垄向远处雾中消退
 *   - GLSL 大气天空：Rayleigh + 太阳/月亮盘 + 体积光柱 + 各向异性辉光 + 雷电闪光
 *   - 每像素光照：wrap 漫反射 + 边缘光 + 高光 + 叶片次表面散射
 *   - 天气逼近真实：billboard 软云层、雨丝（拉长线段）、雨雾、漂浮微粒、
 *     地面薄雾、镜头眩光太阳；情景调色板平滑插值
 *   - 湿度 → 叶片枯萎+萎缩，土壤干燥化；风场全田联动
 * WebGL 不可用返回 null，调用方回退 SVG。
 */

function ensureThree() {
  if (typeof window !== 'undefined' && window.THREE) return Promise.resolve(window.THREE);
  // 复用全站同一份 Three.js，避免场景切换时加载两个渲染运行时。
  return import('../vendor/three/three.module.min.js').then(m => (m && (m.default || m)) || null).catch(e => { console.warn('three load fail', e); return null; });
}

/* ------------------------------------------------------------------ 天空 */
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHaze;
  uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uSunGlow; uniform float uMoonGlow;
  uniform float uFlash;
  varying vec3 vDir;
  void main(){
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.92 + 0.36, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.04, 0.6, h));
    float rayleigh = pow(1.0 - max(dir.y, 0.0), 2.6);
    col = mix(col, uHaze * vec3(1.08,0.9,0.68), rayleigh * mix(0.12, 0.26, uSunGlow));
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
    col += vec3(1.0,1.0,1.0) * uFlash * 2.4;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
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
  attribute vec4 aPart;
  uniform float uTime; uniform vec2 uWindDir; uniform float uWind; uniform float uWilt;
  varying vec4 vPart; varying float vHeight; varying float vShade; varying vec3 vWorldPos; varying vec3 vNormal;
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
    vec2 offset = windDir * wind * bend * (0.12 + uWind * 0.3);
    float flutter = sin(along*0.18 - uTime*1.6 + pos.y*2.0) * bend*bend * 0.035;
    offset += crossDir * flutter;
    float w = uWilt * bend;
    pos.x += offset.x - windDir.x * w * 0.5;
    pos.z += offset.y - windDir.y * w * 0.5;
    // 干旱凋萎：整株明显下垂 + 沿y压缩，体型缩小（不会反而长高）
    pos.y -= uWilt * bend * (0.55 + bend*bend * 0.4);
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
  uniform vec3 uStem; uniform vec3 uLeaf; uniform vec3 uLeafWilt; uniform vec3 uFruit; uniform vec3 uFruitVeg;
  uniform vec3 uSunDir; uniform vec3 uRimColor; uniform float uDay; uniform float uMoisture;
  varying vec4 vPart; varying float vHeight; varying float vShade; varying vec3 vWorldPos; varying vec3 vNormal;
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
    float spec = pow(max(dot(N,H),0.0), 24.0);
    float specVeg = pow(max(dot(N,H),0.0), 14.0); // 蔬果更宽、更哑的光泽
    float back = pow(max(dot(-N,L),0.0), 1.35);
    float sss = pow(max(dot(V,-L),0.0), 1.8);

    vec3 leaf = mix(uLeaf, uLeafWilt, 1.0 - uMoisture);
    vec3 col = vPart.r * uStem + vPart.g * leaf + vPart.b * uFruit + vPart.a * uFruitVeg;
    col = mix(uStem*0.85, col, smoothstep(0.0, 0.12, vHeight));
    float grain = fract(sin(dot(vWorldPos.xz, vec2(12.9898,78.233))) * 43758.5453);
    col *= 0.93 + grain * 0.12;
    col *= vShade * mix(0.8, 1.2, wrap);
    float leafAmt = vPart.g;
    col += leaf * sss * leafAmt * mix(0.12, 0.26, uDay);
    col += uRimColor * rim * mix(0.16, 0.4, leafAmt);
    col += vec3(1.0,0.9,0.5) * spec * leafAmt * (0.16 + 0.55*uDay);
    // 红果（番茄）保留较轻高光；蔬果（黄瓜）用更宽哑光，避免过亮
    col += vec3(1.0,0.97,0.9) * spec * vPart.b * (0.2 + 0.24*uDay);
    col += vec3(0.95,1.0,0.9) * specVeg * vPart.a * (0.14 + 0.14*uDay);
    col += vec3(1.0,0.76,0.36) * back * mix(0.06, 0.12, uDay);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <colorspace_fragment>
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
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
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
    vec3 dry = vec3(0.58,0.44,0.3);
    vec3 alb = mix(vColor, dry, (1.0 - uMoisture) * 0.5);
    // 沟垄明暗（沿 z 周期性），让地面有垄沟纹理
    float furrow = 0.5 + 0.5 * sin(vWorldPos.z * 4.65 + sin(vWorldPos.x * 0.7) * 0.4);
    alb *= 0.86 + furrow * 0.2;
    float grain = fract(sin(dot(vWorldPos.xz, vec2(41.98,83.23))) * 43758.5453);
    alb *= 0.94 + grain * 0.1;
    vec3 col = alb * mix(0.72, 1.28, wrap);
    col += uRimColor * rim * 0.12;
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ 调色板 */
const PALETTES = {
  normal:  { sky:0x5f9fe8, zenith:0x3a78cc, horizon:0xfdf3dc, haze:0xcfe0ea, fog:0xccdce8, fogNear:7, fogFar:26, exposure:1.0, sunGlow:1.0, sun:0xfff6dc, sunI:1.15, ambient:0.55, hemi:0.62, fill:0xb8d4f0, fillI:0.3, rim:0xffd080, rimI:0.45, soilWet:0x4a3520, soilDry:0x9a7440, grassLow:0x3f7426, grassHigh:0x86c04c, leaf:0x3fc35e, leafWilt:0x9a9a4a, stem:0x2f7a42, fruit:0xe5483a, fruitVeg:0x2f9a4a, wind:0.5 },
  drought: { sky:0xd8c090, zenith:0x6478a0, horizon:0xf2d8a4, haze:0xd8b078, fog:0xe2cfae, fogNear:5.5, fogFar:18, exposure:1.12, sunGlow:1.35, sun:0xffdf90, sunI:1.75, ambient:0.52, hemi:0.5, fill:0xf0c078, fillI:0.3, rim:0xffc060, rimI:0.5, soilWet:0x6a4c28, soilDry:0xbc9850, grassLow:0x6e7a30, grassHigh:0xb0aa58, leaf:0x8a9a42, leafWilt:0xc4a250, stem:0x6a7a38, fruit:0xd07038, fruitVeg:0x9a9440, wind:0.42 },
  heat:    { sky:0xd09070, zenith:0x7a4438, horizon:0xf2ba88, haze:0xe09050, fog:0xe0ac88, fogNear:5, fogFar:16, exposure:1.2, sunGlow:1.65, sun:0xffc070, sunI:2.15, ambient:0.56, hemi:0.5, fill:0xf0a060, fillI:0.34, rim:0xff9040, rimI:0.55, soilWet:0x64422a, soilDry:0xcaa050, grassLow:0x807638, grassHigh:0xc8a850, leaf:0x74983c, leafWilt:0xc49040, stem:0x648040, fruit:0xe86030, fruitVeg:0x8a9a3a, wind:0.45 },
  storm:   { sky:0x232c38, zenith:0x121820, horizon:0x36404e, haze:0x4e5e74, fog:0x262e38, fogNear:4, fogFar:13, exposure:0.8, sunGlow:0.08, sun:0x9ab4ff, sunI:0.4, ambient:0.3, hemi:0.34, fill:0x4a5c88, fillI:0.26, rim:0x88a0cc, rimI:0.3, soilWet:0x2c2418, soilDry:0x483a28, grassLow:0x28482a, grassHigh:0x46743a, leaf:0x2c8040, leafWilt:0x4a6a38, stem:0x2a6a38, fruit:0xc05040, fruitVeg:0x2a6a3a, wind:1.1 },
  drift:   { sky:0x6a5a8a, zenith:0x2c2450, horizon:0xc8a8d0, haze:0xa08ac0, fog:0x6a5c82, fogNear:5.5, fogFar:20, exposure:0.95, sunGlow:0.6, sun:0xffd8e0, sunI:1.0, ambient:0.42, hemi:0.44, fill:0xc0a0e0, fillI:0.3, rim:0xe0a0ff, rimI:0.42, soilWet:0x3a2c3e, soilDry:0x6e5058, grassLow:0x385c3a, grassHigh:0x64965a, leaf:0x4a8a52, leafWilt:0x8a8a5a, stem:0x3a7248, fruit:0xc058a0, fruitVeg:0x447a4a, wind:0.55 },
  offline: { sky:0x454b50, zenith:0x2a2e33, horizon:0x565c62, haze:0x666c72, fog:0x474d52, fogNear:5.5, fogFar:17, exposure:0.85, sunGlow:0.3, sun:0xc8ccd0, sunI:0.55, ambient:0.34, hemi:0.32, fill:0x808890, fillI:0.22, rim:0x9aa0a8, rimI:0.26, soilWet:0x37393b, soilDry:0x4a4c4e, grassLow:0x3a3e3a, grassHigh:0x545854, leaf:0x565a56, leafWilt:0x646864, stem:0x4a4e4a, fruit:0x707474, fruitVeg:0x5a5e5a, wind:0.15 }
};
const NUM_KEYS = ['fogNear','fogFar','exposure','sunGlow','sunI','ambient','hemi','fillI','rimI','wind'];
const COL_KEYS = ['sky','zenith','horizon','haze','fog','sun','fill','rim','soilWet','soilDry','grassLow','grassHigh','leaf','leafWilt','stem','fruit','fruitVeg'];
function mixPalettes(a, b, t, THREE) {
  const o = {};
  NUM_KEYS.forEach(k => { o[k] = a[k] + (b[k] - a[k]) * t; });
  COL_KEYS.forEach(k => { o[k] = new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t).getHex(); });
  return o;
}

/* ------------------------------------------------------------------ 几何构建 */
const STEM = [1, 0, 0, 0], LEAF = [0, 1, 0, 0], FRUIT = [0, 0, 1, 0], VEG_FRUIT = [0, 0, 0, 1];

function mergeParts(THREE, parts) {
  const P = [], I = [], H = [], C = []; let off = 0;
  parts.forEach(([g, part]) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); H.push(p.getY(i)); C.push(part[0], part[1], part[2], part[3]); }
    if (g.index) { for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + off); }
    else { for (let i = 0; i < p.count; i++) I.push(off + i); }
    off += p.count; g.dispose();
  });
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  m.setIndex(I);
  m.setAttribute('aPart', new THREE.Float32BufferAttribute(C, 4));
  m.computeVertexNormals();
  return m;
}

function leafShape(THREE) {
  // 窄卵形尖叶：长 > 宽，便于排布成羽状复叶而不糊成一团
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.10, -0.072, 0.24, -0.048, 0.30, 0);
  s.bezierCurveTo(0.24, 0.048, 0.10, 0.072, 0, 0);
  return s;
}

/** 单株作物构建器：返回合并后的 BufferGeometry。 */
function buildCrop(THREE, cropCode) {
  const parts = [];
  const ls = leafShape(THREE);
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
  // 水平阔叶：沿 +x，先放平（法线 +y），沿长轴窝成弧形（避免纸片感），
  // 再绕宽度轴下垂 droop>0（叶片随自己的方向自然低垂，而非绕世界 X 轴扭转），
  // 最后绕垂直轴 yaw 指向外侧。
  const broadLeaf = (x, y, z, yaw, droop, scale, part) => {
    const g = new THREE.ShapeGeometry(ls, 7);
    g.rotateX(-Math.PI / 2);
    // 窝叶：尖端沿长度方向轻微下垂 + 边缘上翘，让叶片有体积感
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const lx = pp.getX(i), lz = pp.getZ(i);
      const t = Math.max(0, lx) / 0.30;
      pp.setY(i, pp.getY(i) - t * t * 0.055 + lz * lz * 0.9);
    }
    g.computeVertexNormals();
    g.rotateZ(-droop);
    g.rotateY(yaw);
    g.scale(scale, scale, scale);
    g.translate(x, y, z);
    push(g, part);
  };
  // 一枚羽状复叶：叶柄（rachis）上翘，成对小叶沿两侧羽状张开、大小向尖端收窄
  const compoundLeaf = (y, yaw, size, phase) => {
    const pitch = 0.44;
    const len = 0.46 * size;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    tubeAt(0.005 * size, 0.01 * size, len, new THREE.Vector3(0, y, 0), dir, STEM);
    const pairs = 4;
    for (let i = 1; i <= pairs; i++) {
      const t = i / (pairs + 1);
      const px = dir.x * len * t, py = y + dir.y * len * t, pz = dir.z * len * t;
      const leafScale = size * (0.46 - t * 0.16);
      const spread = 0.58 + phase * 0.18;
      const droop = 0.08 + t * 0.05;
      broadLeaf(px, py, pz, yaw + spread, droop, leafScale, LEAF);
      broadLeaf(px, py, pz, yaw - spread, droop, leafScale, LEAF);
    }
    broadLeaf(dir.x * len, y + dir.y * len, dir.z * len, yaw, 0.05, size * 0.3, LEAF);
  };
  // 一枚掌状叶（黄瓜）：宽大，5 浅裂 + 齿缘，自基点放射
  const palmateLeaf = (x, y, z, yaw, size) => {
    for (let k = 0; k < 6; k++) {
      const a = yaw + (k - 2.5) * 0.44;
      const mid = (k === 2 || k === 3);
      broadLeaf(x, y, z, a, 0.12, size * (mid ? 0.52 : 0.34), LEAF);
    }
  };
  // 一根黄瓜：长圆条微弯，两端收圆（悬挂）
  const cucumberFruit = (x, y, z, len, r, bend, part) => {
    const ROWS = 7, SEP = 0.16;
    const pts = [];
    for (let i = 0; i < ROWS; i++) {
      const t = i / (ROWS - 1);
      const yy = -t * len;
      const xx = Math.sin(t * Math.PI) * bend;
      pts.push(new THREE.Vector3(xx, yy, 0));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, r, 8, false);
    tube.translate(x, y, z);
    push(tube, part);
    // 两端圆头
    for (const [tt, ss] of [[0, 1], [1, 1]]) {
      const cap = new THREE.SphereGeometry(tt === 0 ? r : r * 0.9, 10, 8);
      cap.translate(x + (tt === 0 ? 0 : bend), y - len * tt, z);
      push(cap, part);
    }
  };
  // 果串：沿水平方向轻微铺展的簇（避免排成一串竖直糖葫芦）
  const fruitCluster = (x, y, z, count, r, part) => {
    const m = (count - 1) / 2;
    for (let i = 0; i < count; i++) {
      const f = new THREE.SphereGeometry(r * (1 - i * 0.05), 11, 9);
      f.scale(1, 0.97, 1);
      const off = (i - m);
      f.translate(x + off * r * 0.85, y - Math.abs(off) * r * 0.4, z + (i % 2 ? 0.02 : -0.02));
      push(f, part);
    }
  };

  if (cropCode === 'tomato') {
    const segs = [[0, 0.34], [0.34, 0.7], [0.7, 1.06], [1.06, 1.32]];
    for (let i = 0; i < segs.length; i++) {
      const y0 = segs[i][0], y1 = segs[i][1];
      const dir = new THREE.Vector3(Math.sin(i * 0.7) * 0.04, 1, Math.cos(i * 0.7) * 0.04).normalize();
      tubeAt(0.014, 0.02, (y1 - y0) * 1.04, new THREE.Vector3(Math.sin(i * 0.7) * 0.02, y0, Math.cos(i * 0.7) * 0.02), dir, STEM);
      const node = new THREE.SphereGeometry(0.022, 8, 6); node.scale(1, 0.7, 1); node.translate(0, y0, 0); push(node, STEM);
    }
    for (let i = 0; i < 6; i++) {
      const y = 0.2 + i * 0.17;
      compoundLeaf(y, i * 2.4 + 0.4, 1.0 - i * 0.05, (i % 3) / 3);
    }
    const trusses = [[0.12, 0.5, 0.5], [-0.13, 0.82, 2.4], [0.14, 1.1, 0.9], [-0.1, 1.24, 3.6]];
    trusses.forEach(([fx, fy, fz]) => {
      fruitCluster(fx, fy, fz, 3, 0.06, FRUIT);
      const cal = new THREE.SphereGeometry(0.022, 8, 6); cal.scale(1.4, 0.5, 1.4); cal.translate(fx, fy + 0.05, fz); push(cal, STEM);
    });
  } else if (cropCode === 'cucumber') {
    // 攀援主蔓：靠一根竹竿，逐节上爬
    const segs = [[0, 0.32], [0.32, 0.7], [0.7, 1.06], [1.06, 1.4]];
    for (let i = 0; i < segs.length; i++) {
      const y0 = segs[i][0], y1 = segs[i][1];
      const dir = new THREE.Vector3(Math.sin(i * 0.6) * 0.06, 1, 0).normalize();
      tubeAt(0.014, 0.02, (y1 - y0) * 1.04, new THREE.Vector3(Math.sin(i * 0.6) * 0.02, y0, 0), dir, STEM);
      const node = new THREE.SphereGeometry(0.024, 8, 6); node.scale(1, 0.7, 1); node.translate(0, y0, 0); push(node, STEM);
      // 每节出一片宽大掌状叶
      palmateLeaf(Math.sin(i * 2.4) * 0.12, y0 + 0.12, Math.cos(i * 2.4) * 0.12, i * 2.4, 0.62);
      // 每节一条螺旋卷须
      const ta = i * 2.4 + 1.2;
      const dirT = new THREE.Vector3(Math.sin(ta) * 0.9, 0.5, Math.cos(ta) * 0.9).normalize();
      tubeAt(0.004, 0.004, 0.24, new THREE.Vector3(0, y0 + 0.14, 0), dirT, STEM);
    }
    // 挂果：绿色长条黄瓜悬在蔓上
    cucumberFruit(0.16, 0.6, 0.4, 0.56, 0.055, 0.05, VEG_FRUIT);
    cucumberFruit(-0.17, 0.98, 2.2, 0.5, 0.05, -0.05, VEG_FRUIT);
    cucumberFruit(0.18, 1.24, 0.8, 0.44, 0.05, 0.04, VEG_FRUIT);
  } else if (cropCode === 'strawberry') {
    tubeAt(0.012, 0.017, 0.16, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), STEM);
    for (let i = 0; i < 7; i++) {
      const a = i * (Math.PI * 2 / 7);
      broadLeaf(Math.sin(a) * 0.04, 0.06, Math.cos(a) * 0.04, a, 0.22, 0.2, LEAF);
    }
    for (let r = 0; r < 2; r++) {
      const a = r * 2.4 + 0.5;
      tubeAt(0.004, 0.004, 0.32, new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(Math.sin(a), -0.08, Math.cos(a)).normalize(), STEM);
      const ex = Math.sin(a) * 0.3, ez = Math.cos(a) * 0.3;
      for (let k = 0; k < 3; k++) broadLeaf(ex, 0.04, ez, a + k * 0.6, 0.16, 0.13, LEAF);
    }
    fruitCluster(0.06, 0.1, 0.05, 3, 0.045, FRUIT);
    fruitCluster(-0.06, 0.09, -0.04, 3, 0.04, FRUIT);
  } else { // pepper
    tubeAt(0.014, 0.02, 0.3, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), STEM);
    tubeAt(0.009, 0.014, 0.24, new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(0.5, 0.6, 0.3).normalize(), STEM);
    tubeAt(0.009, 0.014, 0.24, new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(-0.5, 0.6, -0.3).normalize(), STEM);
    for (let i = 0; i < 8; i++) {
      const a = i * 2.3 + 0.3;
      const y = 0.16 + i * 0.055;
      broadLeaf(Math.sin(a) * 0.08, y, Math.cos(a) * 0.08, a, 0.14, 0.24, LEAF);
    }
    [[0.1, 0.42, 0.3], [-0.1, 0.54, 1.7], [0.09, 0.62, 2.6]].forEach(([fx, fy, fz]) => {
      const p = new THREE.SphereGeometry(0.055, 11, 9); p.scale(0.9, 1.15, 0.9); p.translate(fx, fy, fz); push(p, FRUIT);
    });
  }

  return mergeParts(THREE, parts);
}

/** 草丛下木（行间/垄侧填充）：几片竖直草叶 */
function buildGrass(THREE) {
  const parts = [];
  const push = (g, part) => parts.push([g, part]);
  const ls = leafShape(THREE);
  for (const yaw of [0, Math.PI / 2.4, Math.PI * 1.3]) {
    const g = new THREE.ShapeGeometry(ls, 5);
    g.rotateX(-Math.PI / 2);
    g.rotateY(yaw);
    g.rotateX(-0.7);
    g.scale(0.5, 0.5, 0.5);
    push(g, LEAF);
  }
  return mergeParts(THREE, parts);
}

/* ------------------------------------------------------------------ 程序化纹理 */
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
  x.globalCompositeOperation = 'destination-out';
  x.beginPath(); x.arc(cx, cy, 2, 0, 6.283); x.fill();
  x.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 软云纹理：多团径向渐变叠出蓬松云 */
function cloudTex(THREE) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const blobs = 12;
  for (let i = 0; i < blobs; i++) {
    const bx = 60 + Math.random() * 392;
    const by = 100 + (Math.random() - 0.5) * 70;
    const br = 34 + Math.random() * 58;
    const g = x.createRadialGradient(bx, by, br * 0.1, bx, by, br);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.55, 'rgba(250,250,252,0.38)');
    g.addColorStop(1, 'rgba(240,244,250,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(bx, by, br, 0, 6.283); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 横向薄雾条纹理（地面雾气） */
function mistTex(THREE) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 64);
  // 左右羽化
  const g2 = x.createLinearGradient(0, 0, 256, 0);
  g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.12, 'rgba(0,0,0,0)');
  g2.addColorStop(0.88, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = g2; x.fillRect(0, 0, 256, 64);
  x.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ------------------------------------------------------------------ 主入口 */
export async function createPotScene(canvas, opts = {}) {
  const cropCode = opts.cropCode || 'tomato';
  const THREE = await ensureThree();
  if (!THREE) return null;
  let renderer;
  const dbg = typeof location !== 'undefined' && new URLSearchParams(location.search).has('dbg3d');
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: dbg }); }
  catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // 低机位特写：站在田间，视线沿垄行向远方，太阳高处偏右（顺光+顶光，避免背光死黑）
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 90);
  const HOME = { x: 0, y: 1.52, z: 5.9 };
  const LOOK = { x: 0, y: 1.42, z: -4.0 };
  camera.position.set(HOME.x, HOME.y, HOME.z);
  camera.lookAt(LOOK.x, LOOK.y, LOOK.z);

  let palette = { ...PALETTES.normal }, blended = { ...PALETTES.normal };
  let mouseX = 0, mouseY = 0, rafId = 0, visible = !document.hidden;
  let flash = 0, nextFlash = 3;
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.fog, palette.fogNear, palette.fogFar);

  // 视觉太阳（仅天空盘面/眩光）：右上角贴边，制造斜阳+光柱
  const SUN_DIR = new THREE.Vector3(0.38, 0.52, -0.72).normalize();
  const MOON_DIR = new THREE.Vector3(-0.45, 0.6, -0.65).normalize();
  // 打光方向：来自相机后上方（顺光），避免面朝观察者的叶片落到 wrap 暗部
  const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.45).normalize();

  /* ---- 灯光 ---- */
  const hemi = new THREE.HemisphereLight(palette.zenith, palette.soilWet, palette.hemi); scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, palette.ambient); scene.add(ambient);
  const sun = new THREE.DirectionalLight(palette.sun, palette.sunI); sun.position.copy(LIGHT_DIR).multiplyScalar(20); scene.add(sun);
  const fill = new THREE.DirectionalLight(palette.fill, palette.fillI); fill.position.set(-6, 5, 4); scene.add(fill);
  const rim = new THREE.DirectionalLight(palette.rim, palette.rimI); rim.position.set(-7, 6, -9); scene.add(rim);

  /* ---- 天空 ---- */
  const skyGeo = new THREE.SphereGeometry(56, 36, 24);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(palette.zenith) }, uHorizon: { value: new THREE.Color(palette.horizon) },
      uHaze: { value: new THREE.Color(palette.haze) }, uSunDir: { value: SUN_DIR.clone() }, uMoonDir: { value: MOON_DIR.clone() },
      uSunGlow: { value: 1 }, uMoonGlow: { value: 0 }, uFlash: { value: 0 },
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // 太阳：光晕 + 核心 + 横向眩光条
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: celestialTex(THREE, 'sun'), transparent: true, depthTest: false, depthWrite: false, fog: false }));
  sunSprite.scale.set(2.2, 2.2, 1); sunSprite.position.copy(SUN_DIR).multiplyScalar(48); sunSprite.renderOrder = 51; scene.add(sunSprite);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: celestialTex(THREE, 'sun'), transparent: true, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  sunGlow.scale.set(7, 7, 1); sunGlow.position.copy(SUN_DIR).multiplyScalar(47.5); sunGlow.renderOrder = 50; scene.add(sunGlow);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: celestialTex(THREE, 'sun'), transparent: true, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.28 }));
  flare.scale.set(13, 0.55, 1); flare.position.copy(SUN_DIR).multiplyScalar(47); flare.renderOrder = 49; scene.add(flare);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: celestialTex(THREE, 'moon'), transparent: true, depthTest: false, depthWrite: false, fog: false }));
  moonSprite.scale.set(2.6, 2.6, 1); moonSprite.position.copy(MOON_DIR).multiplyScalar(48); moonSprite.renderOrder = 51; scene.add(moonSprite);

  /* ---- 星星 ---- */
  const SN = 600, sp = new Float32Array(SN * 3), ss = new Float32Array(SN), sph = new Float32Array(SN);
  for (let i = 0; i < SN; i++) {
    const th = Math.random() * 6.283, ph = Math.acos(0.1 + Math.random() * 0.9), rr = 50;
    sp[i * 3] = rr * Math.sin(ph) * Math.cos(th); sp[i * 3 + 1] = rr * Math.cos(ph); sp[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
    ss[i] = 0.5 + Math.random() * 1.6; sph[i] = Math.random() * 6.283;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sph, 1));
  const starMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Points(starGeo, starMat); stars.visible = false; scene.add(stars);

  /* ---- 起伏田垄地面（覆盖到相机身后） ---- */
  const ROW_Z = [-3.4, -2.05, -0.7, 0.65, 2.0, 3.35];
  const terrainHeight = (x, z) => {
    const hills = Math.sin(x * 0.13) * 0.16 + Math.cos(z * 0.11) * 0.12 + Math.sin((x + z) * 0.075) * 0.1;
    let bed = 0;
    for (const zc of ROW_Z) { const dz = z - zc; bed += 0.1 * Math.exp(-dz * dz * 2.2); }
    return hills + bed;
  };
  const terrainGeo = new THREE.PlaneGeometry(13, 11, 72, 60); terrainGeo.rotateX(-Math.PI / 2);
  const tp = terrainGeo.attributes.position;
  const tcol = new Float32Array(tp.count * 3);
  const soilWetC = new THREE.Color(palette.soilWet), soilDryC = new THREE.Color(palette.soilDry);
  const soilBedC = soilWetC.clone().lerp(soilDryC, 0.4);
  const grassLowC = new THREE.Color(palette.grassLow), grassHighC = new THREE.Color(palette.grassHigh), tc = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    const y = terrainHeight(x, z);
    tp.setY(i, y);
    const bedAmt = THREE.MathUtils.clamp((y - 0.0) / 0.14, 0, 1);
    tc.copy(grassLowC).lerp(grassHighC, THREE.MathUtils.clamp((y + 0.08) / 0.24, 0, 1));
    tc.lerp(soilBedC, bedAmt * 0.85);
    tcol[i * 3] = tc.r; tcol[i * 3 + 1] = tc.g; tcol[i * 3 + 2] = tc.b;
  }
  terrainGeo.setAttribute('aColor', new THREE.BufferAttribute(tcol, 3));
  terrainGeo.computeVertexNormals();
  const terrainMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uSoilWet: { value: new THREE.Color(palette.soilWet) }, uSoilDry: { value: new THREE.Color(palette.soilDry) },
      uSunDir: { value: LIGHT_DIR.clone() }, uRimColor: { value: new THREE.Color(palette.rim) },
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
      uLeafWilt: { value: new THREE.Color(palette.leafWilt) }, uFruit: { value: new THREE.Color(palette.fruit) }, uFruitVeg: { value: new THREE.Color(palette.fruitVeg) },
      uSunDir: { value: LIGHT_DIR.clone() }, uRimColor: { value: new THREE.Color(palette.rim) },
      uDay: { value: 1 }, uMoisture: { value: 0.3 },
    }]),
    vertexShader: PLANT_VERT, fragmentShader: PLANT_FRAG, side: THREE.DoubleSide, fog: true,
  });

  const COLS = 12, ROWS = ROW_Z.length, N = COLS * ROWS;
  const crops = new THREE.InstancedMesh(plantGeo, plantMat, N);
  const d = new THREE.Object3D(); let n = 0;
  // 靠相机的前排轻微放大作前景，但保持留有视线走廊
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = (c / (COLS - 1) - 0.5) * 6.4 + (Math.random() - 0.5) * 0.14;
    const z = ROW_Z[r] + (Math.random() - 0.5) * 0.14;
    const y = terrainHeight(x, z);
    d.position.set(x, y, z);
    d.rotation.set((Math.random() - 0.5) * 0.05, Math.random() * 6.283, (Math.random() - 0.5) * 0.05);
    const near = Math.max(0, 1 - Math.abs(z - 3.35) / 2.8);
    const s = 0.94 + Math.random() * 0.28 + near * 0.16;
    d.scale.set(s, s * (0.96 + Math.random() * 0.18), s);
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
      d2.position.setFromMatrixPosition(m); d2.position.y += 0.25; d2.position.x += 0.07;
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
  const GN = 460;
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, GN);
  const d3 = new THREE.Object3D(); let gn = 0;
  for (let i = 0; i < GN; i++) {
    const x = (Math.random() - 0.5) * 8.4;
    const z = (Math.random() - 0.5) * 7.2;
    const y = terrainHeight(x, z) - 0.02;
    d3.position.set(x, y, z);
    d3.rotation.set(0, Math.random() * 6.283, 0);
    const s = 0.38 + Math.random() * 0.55;
    d3.scale.set(s, s * (0.6 + Math.random() * 0.7), s);
    d3.updateMatrix(); grass.setMatrixAt(gn, d3.matrix); gn++;
  }
  grass.instanceMatrix.needsUpdate = true; scene.add(grass);

  /* ---- 云（billboard 软云 sprite 层） ---- */
  const cloudTexture = cloudTex(THREE);
  const cloudMats = new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, depthWrite: false, fog: false, opacity: 0.85, color: 0xffffff });
  const clouds = [];
  const cloudLayouts = [
    [-7, 7.5, -16, 9, 0.62], [4, 8.4, -19, 11, 0.5], [-3.5, 6.8, -13, 7.5, 0.66],
    [8, 7.2, -14, 8, 0.56], [-10, 8.8, -21, 12, 0.42], [1, 9.4, -24, 13, 0.38],
  ];
  for (const [cx, cy, cz, s, op] of cloudLayouts) {
    const m = new THREE.Sprite(cloudMats.clone());
    m.material.opacity = op;
    m.position.set(cx, cy, cz); m.scale.set(s, s * 0.34, 1);
    m.renderOrder = 45;
    m.userData.baseOp = op; m.userData.baseY = cy;
    scene.add(m); clouds.push({ sprite: m, baseX: cx, baseY: cy, phase: Math.random() * 6, speed: 0.05 + Math.random() * 0.03 });
  }

  /* ---- 雨丝（拉长线段） ---- */
  const RN = 320;
  const rainGeo = new THREE.BufferGeometry();
  const rpos = new Float32Array(RN * 6);
  const rainSpeed = new Float32Array(RN);
  for (let i = 0; i < RN; i++) {
    const x = (Math.random() - 0.5) * 9, y = Math.random() * 5, z = (Math.random() - 0.5) * 7 - 0.5;
    const len = 0.16 + Math.random() * 0.12;
    rpos[i * 6] = x; rpos[i * 6 + 1] = y; rpos[i * 6 + 2] = z;
    rpos[i * 6 + 3] = x - 0.06; rpos[i * 6 + 4] = y - len; rpos[i * 6 + 5] = z;
    rainSpeed[i] = 3.2 + Math.random() * 2.2;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xbcd4f5, transparent: true, opacity: 0.42, depthWrite: false }));
  rain.visible = false; scene.add(rain);

  /* ---- 地面薄雾 ---- */
  const mistTexture = mistTex(THREE);
  const mists = [];
  const mistLayouts = [[0, 0.55, -7, 7, 0.16], [-1.5, 0.42, -2.5, 5.5, 0.14], [1.2, 0.7, -12, 9, 0.18]];
  for (const [mx, my, mz, mw, mo] of mistLayouts) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(mw, mw * 0.24),
      new THREE.MeshBasicMaterial({ map: mistTexture, transparent: true, opacity: mo, depthWrite: false, fog: false, side: THREE.DoubleSide })
    );
    m.position.set(mx, my, mz); m.renderOrder = 44;
    scene.add(m); mists.push({ mesh: m, baseX: mx, phase: Math.random() * 6 });
  }

  /* ---- 漂浮微粒（日间花粉 / 漂移雾滴） ---- */
  const MN = 150, mp = new Float32Array(MN * 3);
  for (let i = 0; i < MN; i++) { mp[i * 3] = (Math.random() - 0.5) * 8; mp[i * 3 + 1] = 0.5 + Math.random() * 3.6; mp[i * 3 + 2] = (Math.random() - 0.5) * 6 - 0.5; }
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
    sunSprite.visible = day; sunGlow.visible = day; flare.visible = day;
    moonSprite.visible = !day; stars.visible = !day;
    sunSprite.material.opacity = Math.min(1, dayAmt);
    sunGlow.material.opacity = 0.75 * Math.max(0, dayAmt - 0.4);
    flare.material.opacity = 0.4 * Math.max(0, dayAmt - 0.5);
    clouds.forEach(c => { c.sprite.material.color.setHex(day ? 0xffffff : 0x8899aa); });
    motes.visible = day || state.scenario === 'drift';
    motes.material.color.setHex(state.scenario === 'drift' ? 0xc9a0ff : 0xfff0c0);
    plantMat.uniforms.uStem.value.setHex(p.stem);
    plantMat.uniforms.uLeaf.value.setHex(p.leaf);
    plantMat.uniforms.uLeafWilt.value.setHex(p.leafWilt);
    plantMat.uniforms.uFruit.value.setHex(p.fruit);
    plantMat.uniforms.uFruitVeg.value.setHex(p.fruitVeg);
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

    // 萎蔫强度恒为 [0,1]：干旱 + 低湿共同抬升；绝不允许为负（负值会把植株拉高）
    let wilt = 0;
    if (state.scenario === 'drought') wilt = Math.max(0, Math.min(1, 0.62 + Math.max(0, 20 - state.moisture) / 10));
    else if (state.moisture < 20) wilt = Math.min(1, (20 - state.moisture) / 5);
    plantMat.uniforms.uWilt.value += (wilt - plantMat.uniforms.uWilt.value) * Math.min(1, dt * 3);
    plantMat.uniforms.uTime.value = time * (reducedMotion ? 0 : 1);
    grassMat.uniforms.uTime.value = plantMat.uniforms.uTime.value;
    starMat.uniforms.uTime.value = time;

    // 雷电：随机触发，快速衰减
    if (state.scenario === 'storm') {
      nextFlash -= dt;
      if (nextFlash <= 0) { flash = 1; nextFlash = 3 + Math.random() * 5; }
    } else { flash = Math.max(0, flash - dt * 4); nextFlash = 3; }
    flash = Math.max(0, flash - dt * 6);
    skyMat.uniforms.uFlash.value = flash;
    ambient.intensity = palette.ambient * (1 + flash * 3.2);

    // 相机：轻微呼吸 + 鼠标视差（低机位特写幅度小）
    const breathe = reducedMotion ? 0 : Math.sin(time * 0.4) * 0.018;
    camera.position.x += (HOME.x + mouseX * 0.22 - camera.position.x) * 0.04;
    camera.position.y += (HOME.y + mouseY * 0.14 + breathe - camera.position.y) * 0.04;
    camera.lookAt(LOOK.x + mouseX * 0.1, LOOK.y, LOOK.z);

    // 云缓慢漂移（风暴时加快、加浓、压低）
    const stormy = state.scenario === 'storm';
    const cloudSpeedMul = stormy ? 4.5 : 1;
    clouds.forEach((c) => {
      c.sprite.position.x = c.baseX + Math.sin(time * 0.05 + c.phase) * 1.2 + time * c.speed * cloudSpeedMul * 0.35;
      c.sprite.position.y = (stormy ? c.sprite.userData.baseY - 0.8 : c.sprite.userData.baseY) + Math.sin(time * 0.12 + c.phase) * 0.15;
      c.sprite.material.opacity = c.sprite.userData.baseOp * (stormy ? 0.72 : 1);
    });

    // 地面薄雾漂移
    mists.forEach((mi) => {
      mi.mesh.position.x = mi.baseX + Math.sin(time * 0.08 + mi.phase) * 0.8;
      mi.mesh.material.opacity = (state.scenario === 'storm' ? 0.3 : state.scenario === 'drift' ? 0.24 : 0.15) * (reducedMotion ? 0.6 : 1);
    });

    rain.visible = state.scenario === 'storm';
    if (rain.visible) {
      const pos = rain.geometry.attributes.position.array;
      for (let i = 0; i < RN; i++) {
        const fall = dt * rainSpeed[i];
        pos[i * 6 + 1] -= fall; pos[i * 6 + 4] -= fall;
        if (pos[i * 6 + 4] < 0.05) {
          const nx = (Math.random() - 0.5) * 9, ny = 4.6 + Math.random() * 0.5, nz = (Math.random() - 0.5) * 7 - 0.5;
          const len = pos[i * 6 + 1] - pos[i * 6 + 4];
          pos[i * 6] = nx; pos[i * 6 + 1] = ny; pos[i * 6 + 2] = nz;
          pos[i * 6 + 3] = nx - 0.06; pos[i * 6 + 4] = ny - len; pos[i * 6 + 5] = nz;
        }
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    if (motes.visible) {
      const pos = motes.geometry.attributes.position.array;
      for (let i = 0; i < MN; i++) {
        pos[i * 3] += Math.sin(time * 0.5 + i) * 0.004 + (state.scenario === 'drift' ? 0.004 : 0);
        pos[i * 3 + 1] += Math.sin(time * 0.6 + i * 1.7) * 0.004;
        if (pos[i * 3 + 1] > 4.5) pos[i * 3 + 1] = 0.4;
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
    _debugState: dbg ? state : null,
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      try { renderer.dispose(); } catch (e) {}
      try { canvas.remove(); } catch (e) {}
    },
  };
}
