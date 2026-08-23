/**
 * AgriLoop Frontend - 3D 盆栽场景（Three.js · 真实感版）
 * 程序化纹理（无外部贴图）：陶土拉坯纹花盆、叶脉叶片、颗粒裂纹土壤；
 * 真实植物结构：分节茎、羽状复叶（番茄）/ 掌状叶+卷须（黄瓜）/ 三出复叶（草莓）/ 长叶（辣椒）、
 * 果实带萼片与高光；天气：雨丝、雾、太阳光斑、体感云层、粒子雨幕。
 * WebGL 不可用时返回 null，调用方回退 SVG。
 */

function ensureThree() {
  if (typeof window !== 'undefined' && window.THREE) return Promise.resolve(window.THREE);
  // r160：three.min.js 已弃用且不再挂全局，改用 ESM 模块动态 import（按需加载，浏览器/Node 均可用）
  return import('../vendor/three.module.min.js')
    .then((mod) => mod.default || null)
    .catch((e) => {
      console.warn('three.js load failed:', e);
      return null;
    });
}

/* ================= 程序化纹理工厂 ================= */

/** 陶土花盆纹理：拉坯横纹 + 噪点 + 斑驳 */
function potTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#9a6540';
  x.fillRect(0, 0, 128, 128);
  // 拉坯横纹（同心圆环感）
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * 128;
    const h = 1 + Math.random() * 2;
    const a = 0.05 + Math.random() * 0.1;
    x.fillStyle = `rgba(${Math.random() > 0.5 ? 60 : 190}, ${Math.random() > 0.5 ? 35 : 120}, ${Math.random() > 0.5 ? 15 : 80}, ${a})`;
    x.fillRect(0, y, 128, h);
  }
  // 噪点
  for (let i = 0; i < 900; i++) {
    const a = 0.02 + Math.random() * 0.07;
    x.fillStyle = `rgba(${Math.random() > 0.5 ? 70 : 220}, ${Math.random() > 0.5 ? 40 : 140}, ${Math.random() > 0.5 ? 18 : 95}, ${a})`;
    x.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
  }
  // 大斑驳
  for (let i = 0; i < 14; i++) {
    const g = x.createRadialGradient(Math.random() * 128, Math.random() * 128, 2, Math.random() * 128, Math.random() * 128, 14 + Math.random() * 22);
    g.addColorStop(0, `rgba(${Math.random() > 0.5 ? 110 : 205}, ${Math.random() > 0.5 ? 68 : 135}, ${Math.random() > 0.5 ? 30 : 92}, 0.10)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.6, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 叶片纹理：主脉 + 侧脉 + 渐变 + 噪点（画布比例 = 叶形比例，UV 不拉伸） */
function leafTexture(THREE, base = '3fb950', vein = '7ee2a8') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 118; // 1 : 0.46（叶形宽高比）
  const x = c.getContext('2d');
  // 底色渐变：基部深 → 中部亮 → 尖部亮
  const g = x.createLinearGradient(0, 110, 0, 6);
  g.addColorStop(0, '#1f7a3a');
  g.addColorStop(0.45, '#' + base);
  g.addColorStop(1, '#5ad07a');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 118);
  // 噪点
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `rgba(${Math.random() > 0.5 ? 30 : 120}, ${Math.random() > 0.5 ? 110 : 210}, ${Math.random() > 0.5 ? 45 : 130}, ${0.03 + Math.random() * 0.05})`;
    x.fillRect(Math.random() * 256, Math.random() * 118, 2, 2);
  }
  // 主脉（微弯）
  x.strokeStyle = '#' + vein;
  x.lineWidth = 3;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(128, 112);
  x.quadraticCurveTo(132, 55, 128, 8);
  x.stroke();
  // 侧脉（从主脉向两侧，渐短）
  x.lineWidth = 1.4;
  for (let i = 1; i <= 5; i++) {
    const y = 96 - i * 15;
    const len = 60 - i * 8;
    x.beginPath(); x.moveTo(128, y); x.quadraticCurveTo(128 - len * 0.5, y - 3, 128 - len, y + 4); x.stroke();
    x.beginPath(); x.moveTo(128, y); x.quadraticCurveTo(128 + len * 0.5, y - 3, 128 + len, y + 4); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 土壤纹理：颗粒 + 预置裂纹（干旱时显示裂纹层） */
function soilTexture(THREE, cracked = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = cracked ? '#7a5c38' : '#4a3624';
  x.fillRect(0, 0, 256, 256);
  // 颗粒
  for (let i = 0; i < 2200; i++) {
    const a = 0.03 + Math.random() * 0.1;
    x.fillStyle = `rgba(${Math.random() > 0.5 ? 20 : 240}, ${Math.random() > 0.5 ? 16 : 160}, ${Math.random() > 0.5 ? 8 : 110}, ${a})`;
    const r = 0.6 + Math.random() * 1.6;
    x.beginPath();
    x.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
    x.fill();
  }
  if (cracked) {
    // 干裂纹
    x.strokeStyle = 'rgba(201,160,106,0.85)';
    x.lineWidth = 2;
    const drawCrack = (sx, sy) => {
      x.beginPath();
      x.moveTo(sx, sy);
      let px = sx, py = sy;
      const seg = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < seg; i++) {
        px += (Math.random() - 0.5) * 34;
        py += 12 + Math.random() * 22;
        x.lineTo(px, py);
      }
      x.stroke();
    };
    for (let i = 0; i < 7; i++) drawCrack(40 + Math.random() * 176, 8 + Math.random() * 60);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 太阳光斑/光晕纹理 */
function glowTexture(THREE, color, inner = 0.1) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 64 * inner, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.28)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ================= 植物构件 ================= */

/** 单位叶形（0..1 x 0..0.46，UV 与叶脉纹理对齐） */
function unitLeafShape(THREE) {
  const s = new THREE.Shape();
  s.moveTo(0, 0.23);
  s.quadraticCurveTo(0.28, -0.02, 0.62, 0.2);
  s.quadraticCurveTo(0.86, 0.3, 1, 0.23);
  s.quadraticCurveTo(0.86, 0.16, 0.62, 0.26);
  s.quadraticCurveTo(0.28, 0.48, 0, 0.23);
  return s;
}

/** 单叶 mesh（带叶柄 pivot） */
function makeLeaf(THREE, tex, size, dark = false) {
  const geo = new THREE.ShapeGeometry(unitLeafShape(THREE));
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.65, side: THREE.DoubleSide,
    color: dark ? 0xbfcfc0 : 0xffffff
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(size, size * 0.46, 1);
  mesh.castShadow = true;
  return mesh;
}

/** 番茄羽状复叶（叶轴 + 两侧 4 对小叶，递减） */
function tomatoCompoundLeaf(THREE, tex) {
  const g = new THREE.Group();
  // 叶轴（细长条）
  const axis = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.008, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x2f9c4a, roughness: 0.7 })
  );
  axis.position.x = 0.21;
  axis.castShadow = true;
  g.add(axis);
  // 顶小叶
  const tip = makeLeaf(THREE, tex, 0.16);
  tip.position.set(0.42, 0.01, 0);
  tip.rotation.z = -0.12;
  g.add(tip);
  // 侧小叶（4 对，递减）
  for (let i = 0; i < 4; i++) {
    const s = 0.15 - i * 0.022;
    const px = 0.3 - i * 0.07;
    const left = makeLeaf(THREE, tex, s);
    left.position.set(px, 0.012, 0);
    left.rotation.z = 0.7 + i * 0.18;
    g.add(left);
    const right = makeLeaf(THREE, tex, s);
    right.position.set(px, 0.012, 0);
    right.rotation.z = -0.7 - i * 0.18;
    g.add(right);
  }
  return g;
}

/** 黄瓜掌状叶 + 卷须 */
function cucumberPalmLeaf(THREE, tex) {
  const g = new THREE.Group();
  // 掌状五裂（5 片小叶扇形展开）
  for (let i = 0; i < 5; i++) {
    const leaf = makeLeaf(THREE, tex, 0.17);
    const ang = (i - 2) * 0.55;
    leaf.position.set(Math.cos(ang) * 0.09, 0.012, Math.sin(ang) * 0.03);
    leaf.rotation.z = ang;
    g.add(leaf);
  }
  // 卷须（螺旋）
  const spiral = new THREE.CatmullRomCurve3(
    Array.from({ length: 14 }, (_, i) => {
      const t = i / 13;
      const r = 0.05 * (1 - t * 0.6);
      return new THREE.Vector3(
        Math.cos(t * Math.PI * 2.6) * r,
        t * 0.3 + 0.02,
        Math.sin(t * Math.PI * 2.6) * r
      );
    })
  );
  const tendril = new THREE.Mesh(
    new THREE.TubeGeometry(spiral, 14, 0.006, 6),
    new THREE.MeshStandardMaterial({ color: 0x3fb950, roughness: 0.6 })
  );
  tendril.position.set(-0.12, 0, 0.02);
  g.add(tendril);
  return g;
}

/** 草莓三出复叶 */
function strawberryLeaf(THREE, tex) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const leaf = makeLeaf(THREE, tex, 0.15);
    const ang = (i - 1) * 0.85;
    leaf.position.set(Math.sin(ang) * 0.06, 0.012, 0);
    leaf.rotation.z = ang * 0.7;
    g.add(leaf);
  }
  return g;
}

/** 辣椒长叶（对生） */
function pepperLeaf(THREE, tex) {
  const g = new THREE.Group();
  const l = makeLeaf(THREE, tex, 0.19);
  l.rotation.z = 0.35;
  g.add(l);
  const r = makeLeaf(THREE, tex, 0.19);
  r.rotation.z = -0.35;
  g.add(r);
  return g;
}

/** 番茄果实串（带萼片） */
function tomatoFruitCluster(THREE) {
  const g = new THREE.Group();
  const fruitMat = new THREE.MeshStandardMaterial({ color: 0xef4a3a, roughness: 0.3, metalness: 0.02 });
  const calyxMat = new THREE.MeshStandardMaterial({ color: 0x2f9c4a, roughness: 0.7 });
  const calyxShape = new THREE.Shape();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    calyxShape.lineTo(Math.cos(a) * 0.055, Math.sin(a) * 0.055);
  }
  calyxShape.closePath();
  const calyxGeo = new THREE.ShapeGeometry(calyxShape);
  const add = (x, y, z, s) => {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.085 * s, 22, 18), fruitMat);
    f.position.set(x, y, z);
    f.castShadow = true;
    g.add(f);
    const cal = new THREE.Mesh(calyxGeo, calyxMat);
    cal.position.set(x, y + 0.075 * s, z);
    cal.rotation.x = -0.5;
    g.add(cal);
  };
  add(0, 0, 0, 1);
  add(0.09, -0.08, 0.02, 0.85);
  add(-0.09, -0.07, -0.01, 0.8);
  return g;
}

/** 黄瓜果实 */
function cucumberFruit(THREE) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 18, 16),
    new THREE.MeshStandardMaterial({ color: 0x3fb950, roughness: 0.4 })
  );
  m.scale.set(1, 2.4, 1);
  m.position.y = 0.09;
  m.castShadow = true;
  g.add(m);
  return g;
}

/** 草莓果实 */
function strawberryFruit(THREE) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 18, 16),
    new THREE.MeshStandardMaterial({ color: 0xf04a3a, roughness: 0.35 })
  );
  m.scale.set(1, 0.85, 0.95);
  m.position.y = 0.06;
  m.castShadow = true;
  g.add(m);
  return g;
}

/** 辣椒果实 */
function pepperFruit(THREE, color) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 16, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35 })
  );
  m.scale.set(1, 2.6, 1);
  m.position.y = 0.1;
  m.castShadow = true;
  g.add(m);
  return g;
}

/* ================= 场景 ================= */

export async function createPotScene(canvas, opts = {}) {
  const cropCode = opts.cropCode || 'tomato';
  const THREE = await ensureThree();
  if (!THREE) return null;

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    return null;
  }
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d1219, 8.5, 17);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
  camera.position.set(0.6, 2.15, 4.7);
  camera.lookAt(0, 1.45, 0);

  // 光照
  scene.add(new THREE.HemisphereLight(0x8fb3ff, 0x1c2430, 0.5));
  scene.add(new THREE.AmbientLight(0xffffff, 0.16));
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.8);
  sun.position.set(3.6, 5.4, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 14;
  sun.shadow.camera.left = -3;
  sun.shadow.camera.right = 3;
  sun.shadow.camera.top = 4;
  sun.shadow.camera.bottom = -1;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  // 补光（阴影侧暖反射）
  const fill = new THREE.DirectionalLight(0x88aaff, 0.25);
  fill.position.set(-3, 2, -2);
  scene.add(fill);

  const potGroup = new THREE.Group();
  scene.add(potGroup);

  // 地面
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.8, 48),
    new THREE.MeshStandardMaterial({ color: 0x151b24, roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- 花盆（陶土纹理 + 卷边盆沿） ----
  const potTex = potTexture(THREE);
  const potBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.44, 0.85, 40),
    new THREE.MeshStandardMaterial({ map: potTex, roughness: 0.88, metalness: 0.02 })
  );
  potBody.position.y = 0.425;
  potBody.castShadow = true;
  potBody.receiveShadow = true;
  potGroup.add(potBody);

  // 盆沿（外翻卷边：环 + 上翻）
  const potRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.66, 0.64, 0.07, 40),
    new THREE.MeshStandardMaterial({ map: potTex, roughness: 0.8 })
  );
  potRim.position.y = 0.885;
  potRim.castShadow = true;
  potGroup.add(potRim);
  const rimLip = new THREE.Mesh(
    new THREE.TorusGeometry(0.65, 0.022, 8, 40),
    new THREE.MeshStandardMaterial({ map: potTex, roughness: 0.75 })
  );
  rimLip.rotation.x = Math.PI / 2;
  rimLip.position.y = 0.925;
  potGroup.add(rimLip);

  const potInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.05, 40),
    new THREE.MeshStandardMaterial({ color: 0x20140a, roughness: 1 })
  );
  potInner.position.y = 0.845;
  potGroup.add(potInner);

  // 土壤（湿度联动 + 裂纹纹理）
  const soilDryTex = soilTexture(THREE, true);
  const soilWetTex = soilTexture(THREE, false);
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.54, 48),
    new THREE.MeshStandardMaterial({ map: soilWetTex, roughness: 1 })
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.85;
  soil.receiveShadow = true;
  potGroup.add(soil);

  // ---- 植物 ----
  const plantGroup = new THREE.Group();
  plantGroup.position.y = 0.85;
  potGroup.add(plantGroup);

  const leafTex = leafTexture(THREE);
  const leafTexDark = leafTexture(THREE, '2f9c4a', '5ad07a');

  // 分节茎：3 段圆柱（节间感）+ 节点
  const stemGroup = new THREE.Group();
  plantGroup.add(stemGroup);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3a9c52, roughness: 0.6 });
  const stemSegs = [
    { r: 0.032, h: 0.52, y: 0.26, rx: 0.04, rz: -0.06 },
    { r: 0.027, h: 0.52, y: 0.77, rx: -0.05, rz: 0.07 },
    { r: 0.022, h: 0.5, y: 1.27, rx: 0.06, rz: -0.04 }
  ];
  stemSegs.forEach(s => {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.75, s.r, s.h, 10), stemMat);
    seg.position.set(0, s.y, 0);
    seg.rotation.x = s.rx;
    seg.rotation.z = s.rz;
    seg.castShadow = true;
    stemGroup.add(seg);
    // 节点（节凸）
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(s.r * 1.12, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2f7a42, roughness: 0.7 })
    );
    node.position.set(0, s.y + s.h / 2, 0);
    node.scale.y = 0.5;
    stemGroup.add(node);
  });

  // 叶片节点（沿茎分布，随作物变化）
  const leaves = [];
  const leafNodes = [
    { x: 0, y: 0.45, rz: 0.5 },
    { x: 0, y: 0.8, rz: -0.45 },
    { x: 0, y: 1.15, rz: 0.6 },
    { x: 0, y: 1.5, rz: -0.5 },
    { x: 0, y: 0.62, rz: -2.6 },
    { x: 0, y: 0.95, rz: 2.5 }
  ];
  const buildFoliage = () => {
    leaves.forEach(l => { stemGroup.remove(l.group); });
    leaves.length = 0;
    leafNodes.forEach((n, i) => {
      const g = new THREE.Group();
      g.position.set(0, n.y, 0);
      g.rotation.z = n.rz;
      let fol;
      if (cropCode === 'tomato') {
        fol = tomatoCompoundLeaf(THREE, i % 2 ? leafTex : leafTexDark);
      } else if (cropCode === 'cucumber') {
        fol = cucumberPalmLeaf(THREE, i % 2 ? leafTex : leafTexDark);
      } else if (cropCode === 'strawberry') {
        fol = strawberryLeaf(THREE, i % 2 ? leafTex : leafTexDark);
      } else if (cropCode === 'pepper') {
        fol = pepperLeaf(THREE, i % 2 ? leafTex : leafTexDark);
      } else {
        fol = makeLeaf(THREE, leafTex, 0.3);
        fol.position.x = 0.15;
      }
      fol.position.x = 0.1;
      g.add(fol);
      stemGroup.add(g);
      leaves.push({ group: g, base: n.rz, idx: i, meshes: collectMeshes(fol) });
    });
  };
  const collectMeshes = (obj, out = []) => {
    if (obj.isMesh) out.push(obj);
    obj.children.forEach(ch => collectMeshes(ch, out));
    return out;
  };
  buildFoliage();

  // 果实
  const fruitGroup = new THREE.Group();
  plantGroup.add(fruitGroup);
  const buildFruits = () => {
    while (fruitGroup.children.length) fruitGroup.remove(fruitGroup.children[0]);
    if (cropCode === 'tomato') {
      const c1 = tomatoFruitCluster(THREE);
      c1.position.set(0.16, 0.42, 0.05);
      c1.rotation.z = 0.3;
      fruitGroup.add(c1);
      const c2 = tomatoFruitCluster(THREE);
      c2.position.set(-0.2, 0.78, -0.03);
      c2.rotation.z = -0.25;
      fruitGroup.add(c2);
      const c3 = tomatoFruitCluster(THREE);
      c3.position.set(0.22, 1.12, 0.06);
      c3.rotation.z = 0.2;
      fruitGroup.add(c3);
    } else if (cropCode === 'cucumber') {
      const f1 = cucumberFruit(THREE); f1.position.set(0.18, 0.5, 0.04); fruitGroup.add(f1);
      const f2 = cucumberFruit(THREE); f2.position.set(-0.2, 0.9, -0.03); f2.rotation.z = 0.2; fruitGroup.add(f2);
    } else if (cropCode === 'strawberry') {
      const f1 = strawberryFruit(THREE); f1.position.set(0.14, 0.3, 0.04); fruitGroup.add(f1);
      const f2 = strawberryFruit(THREE); f2.position.set(-0.16, 0.72, -0.02); fruitGroup.add(f2);
    } else if (cropCode === 'pepper') {
      const f1 = pepperFruit(THREE, 0xd29922); f1.position.set(0.17, 0.52, 0.04); fruitGroup.add(f1);
      const f2 = pepperFruit(THREE, 0x2ea043); f2.position.set(-0.18, 0.98, -0.03); fruitGroup.add(f2);
      const f3 = pepperFruit(THREE, 0xf85149); f3.position.set(0.2, 1.3, 0.05); fruitGroup.add(f3);
    }
  };
  buildFruits();

  // ---- 太阳（光晕 + 光斑） ----
  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xd29922 })
  );
  sunCore.position.set(3.1, 4.2, -2.8);
  scene.add(sunCore);
  const glow1 = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(THREE, 'rgba(255,210,110,0.9)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  glow1.scale.set(3.2, 3.2, 1);
  glow1.position.copy(sunCore.position);
  scene.add(glow1);
  const glow2 = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(THREE, 'rgba(255,170,80,0.5)', 0.05),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  glow2.scale.set(6.4, 6.4, 1);
  glow2.position.copy(sunCore.position);
  scene.add(glow2);

  // ---- 云（体感球簇） ----
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xcfd8e3, roughness: 1, transparent: true, opacity: 0.5 });
  const makeCloud = (x, y, z, s) => {
    const g = new THREE.Group();
    [[0, 0, 0, 0.55], [0.5, -0.08, 0.12, 0.4], [-0.5, -0.05, -0.06, 0.35], [0.12, 0.22, 0.02, 0.32], [0.28, -0.16, 0.05, 0.3]].forEach(([cx, cy, cz, r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r * s, 16, 12), cloudMat);
      m.position.set(cx * s, cy * s, cz * s);
      g.add(m);
    });
    g.position.set(x, y, z);
    scene.add(g);
    clouds.push({ group: g, baseX: x, range: 1.5, speed: 0.05 + Math.random() * 0.05, phase: Math.random() * 6 });
  };
  makeCloud(-1.7, 3.3, -2.3, 1.2);
  makeCloud(2.0, 3.6, -2.7, 0.95);
  makeCloud(-0.3, 3.9, -3.1, 0.75);

  // ---- 雨丝（LineSegments，斜落） ----
  const RAIN_N = 150;
  const rainPos = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) {
    const x = (Math.random() - 0.5) * 6;
    const y = Math.random() * 4.2 + 0.2;
    const z = (Math.random() - 0.5) * 4 - 0.3;
    const len = 0.14 + Math.random() * 0.18;
    rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
    rainPos[i * 6 + 3] = x - len * 0.35; rainPos[i * 6 + 4] = y - len; rainPos[i * 6 + 5] = z;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({
    color: 0x7fb4ff, transparent: true, opacity: 0.55
  }));
  rain.visible = false;
  scene.add(rain);

  // ---- 漂移环 / 离线环 ----
  const driftRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.018, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xa371f7, transparent: true, opacity: 0.9 })
  );
  driftRing.position.set(-1.5, 1.15, 0.55);
  driftRing.visible = false;
  scene.add(driftRing);
  const offlineRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.018, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xf85149, transparent: true, opacity: 0.9 })
  );
  offlineRing.position.set(-1.5, 1.15, 0.55);
  offlineRing.visible = false;
  scene.add(offlineRing);

  // ---- 状态 ----
  const state = { scenario: 'normal', moisture: 20, tiltX: 0, tiltY: 0, tX: 0, tY: 0, time: 0 };
  const soilColor = new THREE.Color(0x4a3624);
  const leafWilt = new THREE.Color(0xb89a60);
  const fruitGrey = new THREE.Color(0x9a9aa0);

  const setScenario = (cls) => { state.scenario = cls || 'normal'; };
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
    state.tY = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
    state.tX = ((e.clientY - r.top) / r.height - 0.5) * 0.35;
  });
  canvas.addEventListener('mouseleave', () => { state.tX = 0; state.tY = 0; });

  const clock = new THREE.Clock();
  let raf = 0;
  let running = true;

  const tick = () => {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    state.time += dt;
    const t = state.time;
    const sc = state.scenario;

    state.tiltX += (state.tX - state.tiltX) * Math.min(1, dt * 6);
    state.tiltY += (state.tY - state.tiltY) * Math.min(1, dt * 6);
    potGroup.rotation.x = state.tiltX;
    potGroup.rotation.y = state.tiltY + Math.sin(t * 0.12) * 0.05;

    // 叶片状态
    const wilt = sc === 'drought' || state.moisture < 20;
    leaves.forEach(l => {
      const target = wilt ? (l.idx % 2 ? l.base + 0.6 : l.base - 0.6) : l.base + Math.sin(t * 1.6 + l.idx) * 0.06;
      l.group.rotation.z += (target - l.group.rotation.z) * Math.min(1, dt * 4);
      l.meshes.forEach(mesh => {
        if (!mesh.material) return;
        mesh.material.color.lerp(wilt ? leafWilt : new THREE.Color(0xffffff), Math.min(1, dt * 2.5));
        mesh.material.transparent = true;
        mesh.material.opacity = (sc === 'offline' || state.moisture < 14) ? 0.55 : 1;
      });
    });

    // 土壤
    const ratio = Math.min(1, Math.max(0, (state.moisture - 10) / 30));
    soilColor.setRGB(0.46 - 0.2 * ratio, 0.33 - 0.16 * ratio, 0.2 - 0.11 * ratio);
    soil.material.color.lerp(soilColor, Math.min(1, dt * 3));
    const cracked = sc === 'drought' || state.moisture < 16;
    if (soil.material.map !== (cracked ? soilDryTex : soilWetTex)) {
      soil.material.map = cracked ? soilDryTex : soilWetTex;
      soil.material.needsUpdate = true;
    }

    // 果实
    fruitGroup.children.forEach(f => {
      f.children.forEach(mesh => {
        if (!mesh.isMesh || !mesh.material || mesh.material.color === undefined) return;
        if (mesh.geometry.type === 'SphereGeometry') {
          mesh.material.color.lerp((sc === 'offline' || state.moisture < 14) ? fruitGrey : new THREE.Color(0xffffff), Math.min(1, dt * 2.5));
          mesh.material.transparent = true;
          mesh.material.opacity = (sc === 'offline' || state.moisture < 14) ? 0.55 : 1;
        }
      });
    });

    // 太阳
    const sunColor = sc === 'heat' ? 0xff6a4a : sc === 'storm' ? 0x88aaff : 0xd29922;
    sunCore.material.color.lerp(new THREE.Color(sunColor), Math.min(1, dt * 3));
    const sunScale = sc === 'heat' ? 1.5 : sc === 'drought' ? 1.2 : 1;
    glow1.scale.set(3.2 * sunScale, 3.2 * sunScale, 1);
    glow2.scale.set(6.4 * sunScale, 6.4 * sunScale, 1);
    const sunDim = sc === 'storm' || sc === 'offline';
    glow1.material.opacity = sunDim ? 0.12 : 0.9;
    glow2.material.opacity = sunDim ? 0.08 : 0.6;
    sunCore.material.opacity = sunDim ? 0.15 : 1;
    sunCore.material.transparent = true;
    sun.intensity = sc === 'storm' ? 0.45 : sc === 'heat' ? 2.3 : sc === 'drought' ? 1.9 : 1.7;
    sun.color.lerp(new THREE.Color(sc === 'storm' ? 0x88aaff : 0xffd9a0), Math.min(1, dt * 3));

    // 云
    clouds.forEach((c, i) => {
      const drift = Math.sin(t * c.speed + c.phase) * c.range * (sc === 'storm' ? 1.7 : 1);
      c.group.position.x = c.baseX + drift;
      c.group.children.forEach(m => {
        m.material.color.lerp(new THREE.Color(sc === 'storm' ? 0x3a4a66 : 0xcfd8e3), Math.min(1, dt * 2));
        m.material.opacity = sc === 'storm' ? 0.85 : 0.45;
      });
    });

    // 雨丝
    rain.visible = sc === 'storm';
    if (rain.visible) {
      const pos = rain.geometry.attributes.position.array;
      for (let i = 0; i < RAIN_N; i++) {
        pos[i * 6 + 1] -= dt * (2.2 + (i % 3) * 0.6);
        pos[i * 6 + 4] -= dt * (2.2 + (i % 3) * 0.6);
        if (pos[i * 6 + 1] < 0.05) {
          pos[i * 6] = (Math.random() - 0.5) * 6;
          pos[i * 6 + 1] = 4.3 + Math.random() * 0.3;
          pos[i * 6 + 2] = (Math.random() - 0.5) * 4 - 0.3;
          pos[i * 6 + 3] = pos[i * 6] - 0.14 * 0.35;
          pos[i * 6 + 4] = pos[i * 6 + 1] - 0.14;
          pos[i * 6 + 5] = pos[i * 6 + 2];
        }
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }

    // 漂移 / 离线环
    driftRing.visible = sc === 'drift';
    offlineRing.visible = sc === 'offline';
    if (driftRing.visible) { driftRing.rotation.z = t * 2.4; driftRing.material.opacity = 0.5 + Math.sin(t * 5) * 0.4; }
    if (offlineRing.visible) { offlineRing.rotation.z = -t * 1.2; offlineRing.material.opacity = 0.5 + Math.sin(t * 4) * 0.4; }

    // 离线整体灰度
    const grey = sc === 'offline' ? 0.55 : 0;
    potBody.material.color.lerp(new THREE.Color(grey ? 0x9a9a9a : 0xffffff), Math.min(1, dt * 2));
    potRim.material.color.lerp(new THREE.Color(grey ? 0xaaaaaa : 0xffffff), Math.min(1, dt * 2));
    stemMat.color.lerp(new THREE.Color(grey ? 0x7a8a7a : 0x3a9c52), Math.min(1, dt * 2));

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };

  const onVis = () => {
    running = !document.hidden;
    if (running) { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }
  };

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVis);
  raf = requestAnimationFrame(tick);

  return {
    setScenario,
    setMoisture,
    resize,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      try { renderer.dispose(); } catch (e) { /* noop */ }
      canvas.remove();
    }
  };
}
