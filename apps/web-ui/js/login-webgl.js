import * as THREE from 'three';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const roles = {
  admin: { role: 'FARM_ADMIN', label: '农场管理员' },
  farmer: { role: 'FARMER', label: '种植农户' },
  operator: { role: 'FIELD_OPERATOR', label: '田间操作员' },
  sysadmin: { role: 'SYSTEM_ADMIN', label: '系统管理员' }
};

const canvas = document.getElementById('farmCanvas');
const motionToggle = document.getElementById('motionToggle');
const timeScrubber = document.getElementById('timeScrubber');
const growthStatus = document.getElementById('growthStatus');
const form = document.getElementById('loginForm');
const username = document.getElementById('username');
const password = document.getElementById('password');
const revealPassword = document.getElementById('revealPassword');
const submitButton = document.getElementById('submitButton');
const demoToggle = document.getElementById('demoToggle');
const demoPanel = document.getElementById('demoPanel');
const forgotPassword = document.getElementById('forgotPassword');
const formError = document.getElementById('formError');
const toast = document.getElementById('toast');

const growthDuration = 14500;
const stageLabels = ['种子苏醒', '根系舒展', '嫩芽破土', '枝叶生长', '晨光成熟', '农场已就绪'];
const state = {
  startedAt: performance.now(), pausedAt: 0, paused: false, scrubbing: false,
  progress: reducedMotion ? 1 : 0, pointer: new THREE.Vector2(), smoothPointer: new THREE.Vector2(),
  pulses: [], width: window.innerWidth, height: window.innerHeight
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smoothstep = (value) => value * value * (3 - 2 * value);
const stage = (progress, start, end) => smoothstep(clamp((progress - start) / (end - start)));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(state.width, state.height, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xe7f0e4, 0.055);
const camera = new THREE.PerspectiveCamera(39, state.width / state.height, 0.1, 60);
camera.position.set(0, 1.15, 8.4);

const world = new THREE.Group();
world.position.set(-1.55, -0.34, 0);
scene.add(world);

scene.add(new THREE.HemisphereLight(0xf7ffe9, 0x745841, 2.45));
const sun = new THREE.DirectionalLight(0xfff1c2, 4.25);
sun.position.set(-4.2, 7, 5.8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -5;
sun.shadow.camera.right = 5;
sun.shadow.camera.top = 6;
sun.shadow.camera.bottom = -4;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x7fc58f, 1.7);
rim.position.set(5, 2, -4);
scene.add(rim);

const halo = new THREE.Mesh(
  new THREE.PlaneGeometry(5.4, 5.4),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uPulse;
      void main(){vec2 p=vUv-.5; float d=length(p); float ring=smoothstep(.32,.305,abs(d-(.245+sin(uTime*.45)*.008+uPulse*.035)));
      float glow=smoothstep(.49,.06,d)*.12; vec3 c=mix(vec3(.59,.79,.58),vec3(.98,.88,.55),vUv.y);
      gl_FragColor=vec4(c,(ring*.22+glow*1.35)*(1.-smoothstep(.38,.5,d)));}`
  })
);
halo.position.set(0, 1.35, -1.3);
world.add(halo);

const soilGroup = new THREE.Group();
world.add(soilGroup);
const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x6f5138, roughness: 1, metalness: 0 });
const soil = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.34, .72, 72, 4), soilMaterial);
soil.position.y = -.2;
soil.castShadow = soil.receiveShadow = true;
soilGroup.add(soil);
const topSoil = new THREE.Mesh(
  new THREE.CylinderGeometry(1.525, 1.525, .07, 72),
  new THREE.MeshStandardMaterial({ color: 0x6e7042, roughness: .96 })
);
topSoil.position.y = .19;
topSoil.castShadow = topSoil.receiveShadow = true;
soilGroup.add(topSoil);

const pebbleMaterial = new THREE.MeshStandardMaterial({ color: 0x9a795c, roughness: 1 });
for (let i = 0; i < 42; i += 1) {
  const a = i * 2.399;
  const r = .25 + ((i * 37) % 100) / 100 * 1.16;
  const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(.018 + (i % 4) * .009, 0), pebbleMaterial);
  pebble.position.set(Math.cos(a) * r, .235 + (i % 3) * .008, Math.sin(a) * r);
  pebble.scale.y = .45;
  pebble.rotation.set(i, i * .6, 0);
  soilGroup.add(pebble);
}

const rootMaterial = new THREE.MeshStandardMaterial({ color: 0xc9b97d, emissive: 0x796f3a, emissiveIntensity: .16, roughness: .8 });
const roots = new THREE.Group();
roots.position.y = .15;
soilGroup.add(roots);
for (let i = 0; i < 12; i += 1) {
  const angle = (i / 12) * Math.PI * 2;
  const length = .38 + (i % 5) * .075;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(Math.cos(angle) * .12, -length * .35, Math.sin(angle) * .12),
    new THREE.Vector3(Math.cos(angle + .25) * (.26 + i % 3 * .06), -length * .72, Math.sin(angle + .25) * (.26 + i % 3 * .06)),
    new THREE.Vector3(Math.cos(angle + .48) * (.42 + i % 4 * .07), -length, Math.sin(angle + .48) * (.42 + i % 4 * .07))
  ]);
  roots.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, .014 - (i % 3) * .0025, 7, false), rootMaterial));
}

const stemMaterial = new THREE.MeshPhysicalMaterial({ color: 0x327444, roughness: .64, clearcoat: .16, clearcoatRoughness: .72, side: THREE.DoubleSide });
const leafMaterial = new THREE.MeshPhysicalMaterial({ color: 0x438957, roughness: .58, clearcoat: .22, clearcoatRoughness: .64, sheen: .28, sheenColor: new THREE.Color(0xc4e2a5), side: THREE.DoubleSide });
const leafLightMaterial = new THREE.MeshPhysicalMaterial({ color: 0x65a96f, roughness: .6, clearcoat: .18, clearcoatRoughness: .68, sheen: .22, sheenColor: new THREE.Color(0xe0efb9), side: THREE.DoubleSide });
const veinMaterial = new THREE.LineBasicMaterial({ color: 0x2d6942, transparent: true, opacity: .38 });
const plant = new THREE.Group();
plant.position.y = .22;
world.add(plant);

function tube(points, radius, material) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, radius, 9, false), material);
}

const mainStem = tube([
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(-.05, .65, .03),
  new THREE.Vector3(.06, 1.38, 0), new THREE.Vector3(-.02, 2.18, .02)
], .055, stemMaterial);
mainStem.castShadow = true;
plant.add(mainStem);

function makeLeaf(index, y, side, scale, z = 0) {
  const leaf = new THREE.Group();
  const branch = tube([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(side * .24, .08, z * .3),
    new THREE.Vector3(side * .54, .14, z)
  ], .025, stemMaterial);
  leaf.add(branch);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(.22, .05, .4, .26, .5, .58);
  shape.bezierCurveTo(.19, .54, -.12, .29, 0, 0);
  const blade = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), index % 2 ? leafLightMaterial : leafMaterial);
  blade.scale.set(side * scale, scale * 1.08, scale);
  blade.rotation.x = -.24;
  blade.rotation.y = side * .16;
  blade.rotation.z = side * -.08;
  blade.position.set(side * .53, .15, z);
  blade.castShadow = true;
  const veinGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(.025, .025, .006),
    new THREE.Vector3(.43, .5, .006)
  ]);
  blade.add(new THREE.Line(veinGeometry, veinMaterial));
  leaf.add(blade);
  leaf.position.y = y;
  leaf.userData = { index, side, baseScale: 1 };
  plant.add(leaf);
  return leaf;
}

const leaves = [
  makeLeaf(0, .55, -1, 1.05, .16), makeLeaf(1, .82, 1, .96, -.22),
  makeLeaf(2, 1.08, -1, .9, -.12), makeLeaf(3, 1.34, 1, .82, .18),
  makeLeaf(4, 1.58, -1, .72, .09), makeLeaf(5, 1.78, 1, .64, -.05)
];

const bud = new THREE.Group();
bud.position.set(-.02, 2.2, .02);
plant.add(bud);
const tomatoMaterial = new THREE.MeshStandardMaterial({ color: 0xd86746, roughness: .56 });
const tomato = new THREE.Mesh(new THREE.SphereGeometry(.19, 32, 24), tomatoMaterial);
tomato.scale.y = .9;
tomato.castShadow = true;
bud.add(tomato);
for (let i = 0; i < 5; i += 1) {
  const sepal = new THREE.Mesh(new THREE.ConeGeometry(.035, .18, 5), stemMaterial);
  sepal.position.y = .17;
  sepal.rotation.z = Math.PI / 2;
  sepal.rotation.y = (i / 5) * Math.PI * 2;
  bud.add(sepal);
}

const rings = new THREE.Group();
world.add(rings);
for (let i = 0; i < 3; i += 1) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.7 + i * .12, .008, 8, 96),
    new THREE.MeshBasicMaterial({ color: i === 0 ? 0x7ab17b : 0xd2c46c, transparent: true, opacity: .16 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = .17 - i * .03;
  ring.scale.setScalar(.92 + i * .06);
  ring.userData.phase = i / 3;
  rings.add(ring);
}

const moteCount = 170;
const motePositions = new Float32Array(moteCount * 3);
for (let i = 0; i < moteCount; i += 1) {
  const angle = i * 2.399;
  const radius = 1.3 + ((i * 19) % 100) / 100 * 2.2;
  motePositions[i * 3] = Math.cos(angle) * radius;
  motePositions[i * 3 + 1] = -.35 + ((i * 43) % 100) / 100 * 4.2;
  motePositions[i * 3 + 2] = Math.sin(angle) * radius * .45 - .3;
}
const moteGeometry = new THREE.BufferGeometry();
moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
const motes = new THREE.Points(moteGeometry, new THREE.PointsMaterial({ color: 0x8bb88a, size: .022, transparent: true, opacity: .42, depthWrite: false }));
world.add(motes);

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(2.4, 64),
  new THREE.MeshBasicMaterial({ color: 0x2f5b3c, transparent: true, opacity: .08, depthWrite: false })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.set(0, -.72, 0);
shadow.scale.y = .34;
world.add(shadow);

function applyGrowth(progress, now) {
  const rootGrowth = stage(progress, .02, .3);
  const soilGrowth = stage(progress, 0, .16);
  const stemGrowth = stage(progress, .17, .67);
  const fruitGrowth = stage(progress, .74, .96);
  soilGroup.scale.setScalar(.82 + soilGrowth * .18);
  soilGroup.position.y = -.16 + soilGrowth * .16;
  roots.scale.y = rootGrowth;
  roots.visible = rootGrowth > .01;
  mainStem.scale.y = stemGrowth;
  mainStem.visible = stemGrowth > .01;
  leaves.forEach((leaf, index) => {
    const leafGrowth = stage(progress, .32 + index * .055, .53 + index * .06);
    leaf.scale.setScalar(leafGrowth);
    leaf.rotation.z = leaf.userData.side * (.13 - leafGrowth * .1) + Math.sin(now * .0012 + index) * .018 * leafGrowth;
    leaf.visible = leafGrowth > .01;
  });
  bud.scale.setScalar(fruitGrowth);
  bud.visible = fruitGrowth > .01;
  plant.rotation.z = Math.sin(now * .00072) * .018 * stemGrowth;
  const completedBreath = stage(progress, .94, 1);
  plant.position.y = .22 + Math.sin(now * .0011) * .012 * completedBreath;
  rings.children.forEach((ring, index) => {
    const wave = (now * .00022 + ring.userData.phase) % 1;
    ring.scale.setScalar(.88 + wave * .28);
    ring.material.opacity = (.18 * (1 - wave) + .03) * rootGrowth;
  });
}

function updateTimeline(progress) {
  if (!state.scrubbing) timeScrubber.value = String(Math.round(progress * 100));
  const index = Math.min(stageLabels.length - 1, Math.floor(progress * stageLabels.length));
  growthStatus.textContent = stageLabels[index];
  motionToggle.textContent = progress >= 1 ? '重新生长' : state.paused ? '继续动画' : '暂停动画';
}

function render(now) {
  if (!state.paused && !state.scrubbing && !reducedMotion) {
    state.progress = clamp((now - state.startedAt) / growthDuration);
  }
  state.smoothPointer.lerp(state.pointer, .045);
  applyGrowth(state.progress, now);
  world.rotation.y += ((state.smoothPointer.x * .1) - world.rotation.y) * .035;
  world.rotation.x += ((-state.smoothPointer.y * .035) - world.rotation.x) * .035;
  camera.position.x += (state.smoothPointer.x * .18 - camera.position.x) * .025;
  camera.position.y += (1.15 - state.smoothPointer.y * .1 - camera.position.y) * .025;
  camera.lookAt(world.position.x, .75, 0);
  motes.rotation.y = now * .000025;
  motes.position.y = Math.sin(now * .00022) * .06;
  halo.material.uniforms.uTime.value = now * .001;
  halo.material.uniforms.uPulse.value *= .94;
  renderer.render(scene, camera);
  updateTimeline(state.progress);
  requestAnimationFrame(render);
}

function setProgress(value) {
  state.progress = clamp(value);
  state.startedAt = performance.now() - state.progress * growthDuration;
}

function resize() {
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(state.width, state.height, false);
  camera.aspect = state.width / state.height;
  camera.fov = state.width < 900 ? 46 : 39;
  camera.updateProjectionMatrix();
  world.position.x = state.width < 900 ? 0 : -1.55;
  world.position.y = state.width < 560 ? .68 : state.width < 900 ? .32 : -.34;
  world.scale.setScalar(state.width < 560 ? .72 : state.width < 900 ? .83 : 1);
}

motionToggle.addEventListener('click', () => {
  if (state.progress >= 1) { state.paused = false; setProgress(0); return; }
  if (state.paused) {
    state.paused = false;
    state.startedAt += performance.now() - state.pausedAt;
  } else {
    state.paused = true;
    state.pausedAt = performance.now();
  }
});
timeScrubber.addEventListener('pointerdown', () => { state.scrubbing = true; });
timeScrubber.addEventListener('input', () => setProgress(Number(timeScrubber.value) / 100));
function finishScrubbing() {
  if (!state.scrubbing) return;
  state.scrubbing = false;
  state.paused = false;
  state.startedAt = performance.now() - state.progress * growthDuration;
}
timeScrubber.addEventListener('change', finishScrubbing);
timeScrubber.addEventListener('pointerup', finishScrubbing);
window.addEventListener('pointermove', (event) => {
  if (reducedMotion) return;
  state.pointer.set(event.clientX / state.width * 2 - 1, event.clientY / state.height * 2 - 1);
}, { passive: true });
canvas.addEventListener('pointerdown', () => {
  if (reducedMotion) return;
  halo.material.uniforms.uPulse.value = 1;
  rings.children.forEach((ring, index) => { ring.userData.phase = -index * .08; });
});
window.addEventListener('resize', resize, { passive: true });

revealPassword.addEventListener('click', () => {
  const showing = password.type === 'text';
  password.type = showing ? 'password' : 'text';
  revealPassword.textContent = showing ? '显示' : '隐藏';
  revealPassword.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
});
demoToggle.addEventListener('click', () => {
  const willOpen = demoPanel.hidden;
  demoPanel.hidden = !willOpen;
  demoToggle.setAttribute('aria-expanded', String(willOpen));
});
demoPanel.querySelectorAll('[data-user]').forEach((button) => {
  button.addEventListener('click', () => {
    const account = button.dataset.user;
    username.value = account;
    password.value = 'demo123';
    demoPanel.hidden = true;
    demoToggle.setAttribute('aria-expanded', 'false');
    formError.textContent = '';
    showToast(`已选择${roles[account].label}`);
    username.focus();
  });
});
forgotPassword.addEventListener('click', () => showToast('演示环境暂不发送重置邮件'));
async function authenticate(account, secret) {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username: account, password: secret })
  });
  const payload = await response.json().catch(() => null);
  const session = payload?.data || payload;
  if (!response.ok || !session?.accessToken) {
    const error = new Error(response.status === 401 ? '账号或密码不正确' : '登录服务暂时不可用');
    error.status = response.status;
    throw error;
  }
  localStorage.setItem('agriloop_token', session.accessToken);
  if (session.user) localStorage.setItem('agriloop_user', JSON.stringify(session.user));
  return session;
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const account = username.value.trim();
  if (!account || !password.value) {
    formError.textContent = '请输入账号和密码';
    (!account ? username : password).focus();
    return;
  }
  formError.textContent = '';
  submitButton.disabled = true;
  submitButton.classList.add('is-loading');
  const selected = roles[account] || roles.admin;
  try {
    const session = await authenticate(account, password.value);
    const user = session.user || { username: account, role: selected.role, roleLabel: selected.label, avatar: '' };
    localStorage.setItem('agriloop_user', JSON.stringify(user));
    showToast(`欢迎进入${user.roleLabel || selected.label}工作台`);
    window.setTimeout(() => { window.location.href = 'index.html'; }, reducedMotion ? 100 : 500);
  } catch (error) {
    formError.textContent = error.message || '登录失败，请稍后重试';
    submitButton.disabled = false;
    submitButton.classList.remove('is-loading');
  }
});
let toastTimer;
function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

resize();
applyGrowth(state.progress, performance.now());
requestAnimationFrame(render);
requestAnimationFrame(() => document.body.classList.add('is-mounted'));
