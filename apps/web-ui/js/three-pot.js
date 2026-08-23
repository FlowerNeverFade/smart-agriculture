/**
 * AgriLoop Frontend - 3D 盆栽场景（Three.js）
 * 真实感盆栽：PBR 陶土花盆 + 动态光照阴影 + 管状茎/曲面叶/球体果实 +
 * 粒子雨 + 体感云层 + 太阳光晕；情景与环境动画通过状态过渡（lerp）平滑切换。
 * WebGL 不可用时返回 null，调用方回退 SVG 场景。
 */

const THREE_LOADED = Symbol('three-loaded');

function ensureThree() {
  if (typeof window !== 'undefined' && window.THREE) return Promise.resolve(window.THREE);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/three.min.js', import.meta.url).href;
    const timer = setTimeout(() => { console.warn('three.js load timeout'); resolve(null); }, 3000);
    s.onload = () => { clearTimeout(timer); resolve(window.THREE || null); };
    s.onerror = () => { clearTimeout(timer); console.warn('three.js load failed'); resolve(null); };
    document.head.appendChild(s);
  });
}

function canvasGlowTexture(color, inner = 0.12) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 64 * inner, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 创建叶形 Shape（从基部向左/右伸出） */
function leafShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.13, -0.07, 0.3, 0);
  s.quadraticCurveTo(0.13, 0.07, 0, 0);
  return s;
}

export async function createPotScene(canvas, opts = {}) {
  const cropCode = opts.cropCode || 'tomato';
  const THREE = await ensureThree();
  if (!THREE) return null;

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    console.warn('WebGL unavailable, fallback to SVG pot:', e);
    return null;
  }
  const gl = renderer.getContext();
  if (!gl) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, 2.6, 5.1);
  camera.lookAt(0, 1.35, 0);

  // ---- 光照 ----
  const hemi = new THREE.HemisphereLight(0x8fb3ff, 0x1c2430, 0.55);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(amb);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.7);
  sun.position.set(3.6, 5.6, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 14;
  sun.shadow.camera.left = -3;
  sun.shadow.camera.right = 3;
  sun.shadow.camera.top = 4;
  sun.shadow.camera.bottom = -1;
  scene.add(sun);

  const potGroup = new THREE.Group();
  scene.add(potGroup);

  // ---- 地面（桌面） ----
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.7, 48),
    new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.9, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- 花盆（圆台 + 盆沿 + 内沿） ----
  const potBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.46, 0.86, 40),
    new THREE.MeshStandardMaterial({ color: 0xa06a3e, roughness: 0.82, metalness: 0.05 })
  );
  potBody.position.y = 0.43;
  potBody.castShadow = true;
  potBody.receiveShadow = true;
  potGroup.add(potBody);

  const potRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.66, 0.66, 0.09, 40),
    new THREE.MeshStandardMaterial({ color: 0xb57c4c, roughness: 0.7, metalness: 0.06 })
  );
  potRim.position.y = 0.885;
  potRim.castShadow = true;
  potGroup.add(potRim);

  const potInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.56, 0.06, 40),
    new THREE.MeshStandardMaterial({ color: 0x241608, roughness: 1 })
  );
  potInner.position.y = 0.84;
  potGroup.add(potInner);

  // ---- 土壤（湿度联动色） ----
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 40),
    new THREE.MeshStandardMaterial({ color: 0x4a3624, roughness: 1 })
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.845;
  soil.receiveShadow = true;
  potGroup.add(soil);

  // ---- 植物 ----
  const plantGroup = new THREE.Group();
  plantGroup.position.y = 0.845;
  potGroup.add(plantGroup);

  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.06, 0.5, 0),
    new THREE.Vector3(0.03, 1.05, 0),
    new THREE.Vector3(-0.04, 1.6, 0)
  ]);
  const stem = new THREE.Mesh(
    new THREE.TubeGeometry(stemCurve, 24, 0.035, 10),
    new THREE.MeshStandardMaterial({ color: 0x36ab52, roughness: 0.55 })
  );
  stem.castShadow = true;
  plantGroup.add(stem);

  // 侧枝
  const branchCurve1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.02, 0.78, 0),
    new THREE.Vector3(0.3, 0.92, 0.04),
    new THREE.Vector3(0.55, 1.05, 0.06)
  ]);
  const branch1 = new THREE.Mesh(
    new THREE.TubeGeometry(branchCurve1, 16, 0.018, 8),
    new THREE.MeshStandardMaterial({ color: 0x2f9c4a, roughness: 0.6 })
  );
  plantGroup.add(branch1);
  const branchCurve2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.01, 1.25, 0),
    new THREE.Vector3(-0.34, 1.38, -0.03),
    new THREE.Vector3(-0.6, 1.5, -0.05)
  ]);
  const branch2 = new THREE.Mesh(
    new THREE.TubeGeometry(branchCurve2, 16, 0.016, 8),
    new THREE.MeshStandardMaterial({ color: 0x2f9c4a, roughness: 0.6 })
  );
  plantGroup.add(branch2);

  // 叶片（带 pivot 的 Group，可摆动/下垂）
  const leafMatLight = new THREE.MeshStandardMaterial({ color: 0x3fb950, roughness: 0.6, side: THREE.DoubleSide });
  const leafMatDark = new THREE.MeshStandardMaterial({ color: 0x1f8f4d, roughness: 0.65, side: THREE.DoubleSide });
  const leafGeo = new THREE.ShapeGeometry(leafShape());
  const leafPositions = [
    { x: -0.05, y: 0.52, rot: 0.5, back: false, sx: 1, sy: 1 },
    { x: 0.02, y: 0.85, rot: -0.45, back: true, sx: 1.15, sy: 1.05 },
    { x: -0.06, y: 1.12, rot: 0.55, back: false, sx: 1.1, sy: 1 },
    { x: 0.04, y: 1.42, rot: -0.5, back: false, sx: 1, sy: 0.95 },
    { x: 0.55, y: 1.02, rot: 0.35, back: false, sx: 0.8, sy: 0.85 },
    { x: -0.6, y: 1.47, rot: 3.1, back: true, sx: 0.85, sy: 0.9 },
    { x: -0.02, y: 1.62, rot: 0.15, back: false, sx: 0.9, sy: 0.8 }
  ];
  const leaves = leafPositions.map((lp, i) => {
    const g = new THREE.Group();
    g.position.set(lp.x, lp.y, 0);
    g.rotation.z = lp.rot;
    const leaf = new THREE.Mesh(leafGeo, lp.back ? leafMatDark : leafMatLight);
    leaf.scale.set(lp.sx, lp.sy, 1);
    leaf.position.x = 0.15;
    leaf.castShadow = true;
    g.add(leaf);
    plantGroup.add(g);
    return { group: g, base: lp.rot, back: lp.back, idx: i };
  });

  // 果实（按作物）
  const fruitMat = new THREE.MeshStandardMaterial({ color: 0xf85149, roughness: 0.35, metalness: 0.05 });
  const fruitGroup = new THREE.Group();
  plantGroup.add(fruitGroup);
  const buildFruits = () => {
    while (fruitGroup.children.length) fruitGroup.remove(fruitGroup.children[0]);
    const addFruit = (x, y, z, geo, color, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 }));
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.castShadow = true;
      // 高光小点
      const hl = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
      );
      hl.position.set(0.3, 0.32, 0.32);
      m.add(hl);
      fruitGroup.add(m);
    };
    const sphere = new THREE.SphereGeometry(0.1, 20, 20);
    if (cropCode === 'tomato') {
      addFruit(0.28, 0.78, 0.05, sphere, 0xf85149, 1, 1.05, 1);
      addFruit(-0.32, 1.28, -0.04, sphere, 0xe5433a, 0.92, 0.95, 0.92);
      addFruit(0.36, 1.52, 0.06, sphere, 0xf85149, 0.85, 0.9, 0.85);
    } else if (cropCode === 'cucumber') {
      addFruit(0.3, 0.8, 0.05, sphere, 0x3fb950, 0.7, 1.9, 0.7);
      addFruit(-0.3, 1.3, -0.04, sphere, 0x2ea043, 0.65, 1.7, 0.65);
    } else if (cropCode === 'strawberry') {
      addFruit(0.26, 0.5, 0.03, sphere, 0xf85149, 1, 0.85, 0.95);
      addFruit(-0.28, 1.2, -0.03, sphere, 0xe5433a, 0.95, 0.8, 0.9);
    } else if (cropCode === 'pepper') {
      addFruit(0.3, 0.85, 0.04, sphere, 0xd29922, 0.6, 1.7, 0.6);
      addFruit(-0.28, 1.35, -0.04, sphere, 0x2ea043, 0.55, 1.5, 0.55);
      addFruit(0.34, 1.58, 0.06, sphere, 0xf85149, 0.5, 1.3, 0.5);
    } else {
      addFruit(0.28, 0.8, 0.05, sphere, 0xf85149);
    }
  };
  buildFruits();

  // ---- 太阳（光晕 Sprite + 核心球） ----
  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xd29922 })
  );
  sunCore.position.set(3.2, 4.3, -2.6);
  scene.add(sunCore);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasGlowTexture('rgba(210,153,34,0.85)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  sunGlow.scale.set(2.6, 2.6, 1);
  sunGlow.position.copy(sunCore.position);
  scene.add(sunGlow);

  // ---- 云（球簇，缓慢漂移） ----
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xcfd8e3, roughness: 1, transparent: true, opacity: 0.5
  });
  const makeCloud = (x, y, z, s) => {
    const g = new THREE.Group();
    [[0, 0, 0, 0.5], [0.45, -0.08, 0.1, 0.36], [-0.45, -0.06, -0.05, 0.32], [0.1, 0.2, 0, 0.3]].forEach(([cx, cy, cz, r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r * s, 14, 12), cloudMat);
      m.position.set(cx * s, cy * s, cz * s);
      g.add(m);
    });
    g.position.set(x, y, z);
    scene.add(g);
    clouds.push({ group: g, speed: 0.004 + Math.random() * 0.006, baseX: x, range: 1.6 });
  };
  makeCloud(-1.6, 3.4, -2.2, 1.15);
  makeCloud(1.9, 3.7, -2.6, 0.9);
  makeCloud(-0.4, 4.0, -3.0, 0.7);

  // ---- 雨（粒子系统） ----
  const RAIN_N = 420;
  const rainPos = new Float32Array(RAIN_N * 3);
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 5.4;
    rainPos[i * 3 + 1] = Math.random() * 3.4 + 0.3;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 3.6 - 0.4;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0x58a6ff, size: 0.045, transparent: true, opacity: 0.75,
    depthWrite: false
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  scene.add(rain);

  // ---- 漂移仪表环（3D 悬浮环） ----
  const driftRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.02, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xa371f7, transparent: true, opacity: 0.9 })
  );
  driftRing.position.set(-1.4, 1.1, 0.6);
  driftRing.visible = false;
  scene.add(driftRing);

  // ---- 离线信号（两个红色小球 + 环） ----
  const offlineRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.02, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xf85149, transparent: true, opacity: 0.9 })
  );
  offlineRing.position.set(-1.4, 1.1, 0.6);
  offlineRing.visible = false;
  scene.add(offlineRing);

  // ---- 状态管理 ----
  const state = {
    scenario: 'normal',
    moisture: 20,
    targetTiltX: 0,
    targetTiltY: 0,
    tiltX: 0,
    tiltY: 0,
    autoSpin: 0,
    time: 0
  };

  const soilColor = new THREE.Color(0x4a3624);
  const leafHealthy = new THREE.Color(0x3fb950);
  const leafWilt = new THREE.Color(0xc9a06a);
  const fruitHealthy = new THREE.Color(0xf85149);
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

  // 鼠标视差
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    state.targetTiltY = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
    state.targetTiltX = ((e.clientY - r.top) / r.height - 0.5) * 0.35;
  });
  canvas.addEventListener('mouseleave', () => {
    state.targetTiltX = 0;
    state.targetTiltY = 0;
  });

  const clock = new THREE.Clock();
  let raf = 0;
  let running = true;

  const tick = () => {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    state.time += dt;
    const t = state.time;
    const sc = state.scenario;

    // 视差 + 自动缓转
    state.tiltX += (state.targetTiltX - state.tiltX) * Math.min(1, dt * 6);
    state.tiltY += (state.targetTiltY - state.tiltY) * Math.min(1, dt * 6);
    potGroup.rotation.x = state.tiltX;
    potGroup.rotation.y = state.tiltY + Math.sin(t * 0.12) * 0.06;

    // 叶片：微风摆动 / 萎蔫下垂
    leaves.forEach(l => {
      const wilt = sc === 'drought' || state.moisture < 20;
      const targetRot = wilt ? (l.idx % 2 ? l.base + 0.55 : l.base - 0.55) : l.base + Math.sin(t * 1.8 + l.idx) * 0.07;
      l.group.rotation.z += (targetRot - l.group.rotation.z) * Math.min(1, dt * 4);
      const leafMesh = l.group.children[0];
      const targetColor = wilt ? leafWilt : (l.back ? new THREE.Color(0x1f8f4d) : leafHealthy);
      leafMesh.material.color.lerp(targetColor, Math.min(1, dt * 3));
      leafMesh.material.opacity = (sc === 'offline' || state.moisture < 14) ? 0.6 : 1;
      leafMesh.material.transparent = true;
    });

    // 土壤湿度颜色
    const ratio = Math.min(1, Math.max(0, (state.moisture - 10) / 30));
    soilColor.setRGB(0.54 - 0.28 * ratio, 0.42 - 0.26 * ratio, 0.24 - 0.15 * ratio);
    soil.material.color.lerp(soilColor, Math.min(1, dt * 4));
    // 果实灰化（离线/临界）
    fruitGroup.children.forEach(f => {
      f.material.color.lerp((sc === 'offline' || state.moisture < 14) ? fruitGrey : fruitHealthy, Math.min(1, dt * 3));
      f.material.transparent = true;
      f.material.opacity = (sc === 'offline' || state.moisture < 14) ? 0.55 : 1;
    });

    // 太阳：情景色/大小
    const sunColor = sc === 'heat' ? 0xf85149 : 0xd29922;
    sunCore.material.color.lerp(new THREE.Color(sunColor), Math.min(1, dt * 3));
    const sunScale = sc === 'heat' ? 1.6 : sc === 'drought' ? 1.25 : 1;
    sunGlow.scale.set(2.6 * sunScale, 2.6 * sunScale, 1);
    sunGlow.material.opacity = sc === 'storm' || sc === 'offline' ? 0.15 : 0.9;
    sunCore.material.opacity = sc === 'storm' ? 0.1 : 1;
    sunCore.material.transparent = true;
    sun.intensity = sc === 'storm' ? 0.5 : sc === 'heat' ? 2.4 : sc === 'drought' ? 1.9 : 1.7;
    sun.color.lerp(new THREE.Color(sc === 'storm' ? 0x88aaff : 0xffd9a0), Math.min(1, dt * 3));

    // 云：漂移 + 情景密度/速度
    clouds.forEach((c, i) => {
      c.group.position.x = c.baseX + Math.sin(t * 0.05 + i * 2) * c.range * (sc === 'storm' ? 1.6 : 1);
      c.group.position.y = 3.4 + Math.sin(t * 0.3 + i) * 0.05;
      c.group.children.forEach(m => {
        m.material.color.lerp(new THREE.Color(sc === 'storm' ? 0x3a4a66 : 0xcfd8e3), Math.min(1, dt * 2));
        m.material.opacity = sc === 'storm' ? 0.85 : 0.45;
      });
    });

    // 雨
    const rainVisible = sc === 'storm';
    rain.visible = rainVisible;
    if (rainVisible) {
      const pos = rain.geometry.attributes.position.array;
      for (let i = 0; i < RAIN_N; i++) {
        pos[i * 3 + 1] -= dt * (1.6 + (i % 3) * 0.5);
        if (pos[i * 3 + 1] < 0.2) {
          pos[i * 3 + 1] = 3.6 + Math.random() * 0.4;
          pos[i * 3] = (Math.random() - 0.5) * 5.4;
        }
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }

    // 漂移环 / 离线环
    driftRing.visible = sc === 'drift';
    offlineRing.visible = sc === 'offline';
    if (driftRing.visible) {
      driftRing.rotation.z = t * 2.4;
      driftRing.material.opacity = 0.5 + Math.sin(t * 5) * 0.4;
    }
    if (offlineRing.visible) {
      offlineRing.rotation.z = -t * 1.2;
      offlineRing.material.opacity = 0.5 + Math.sin(t * 4) * 0.4;
    }

    // 盆栽材质整体灰度（离线）
    const grey = sc === 'offline' ? 0.5 : 0;
    potBody.material.color.lerp(new THREE.Color(grey ? 0x8a8a8a : 0xa06a3e), Math.min(1, dt * 2));
    potRim.material.color.lerp(new THREE.Color(grey ? 0x9a9a9a : 0xb57c4c), Math.min(1, dt * 2));
    stem.material.color.lerp(new THREE.Color(grey ? 0x6a7a6a : 0x36ab52), Math.min(1, dt * 2));

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };

  const onVis = () => {
    running = !document.hidden;
    if (running) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }
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
