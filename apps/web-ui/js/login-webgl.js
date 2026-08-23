import * as THREE from 'three';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const roles = {
  admin: { role: 'FARM_ADMIN', label: '农场管理员' },
  farmer: { role: 'FARMER', label: '种植农户' },
  operator: { role: 'FIELD_OPERATOR', label: '田间操作员' },
  sysadmin: { role: 'SYSTEM_ADMIN', label: '系统管理员' }
};

const canvas = document.getElementById('farmCanvas');
const backdrop = document.getElementById('fieldBackdrop');
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

const growthDuration = 14800;
const state = {
  startedAt: performance.now(),
  progress: reducedMotion ? 1 : 0,
  pulse: 0,
  pointer: new THREE.Vector2(),
  smoothPointer: new THREE.Vector2(),
  width: window.innerWidth,
  height: window.innerHeight
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smoothstep = (value) => value * value * (3 - 2 * value);
const stage = (progress, start, end) => smoothstep(clamp((progress - start) / (end - start)));
let randomSeed = 93841;
function seededRandom() {
  randomSeed = (randomSeed * 16807) % 2147483647;
  return (randomSeed - 1) / 2147483646;
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
const maxPixelRatio = navigator.deviceMemory && navigator.deviceMemory <= 4 ? 1.45 : 1.85;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
renderer.setSize(state.width, state.height, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xeef3df, 0.042);
const camera = new THREE.PerspectiveCamera(35, state.width / state.height, 0.1, 50);
camera.position.set(0, 1.12, 8.7);

scene.add(new THREE.HemisphereLight(0xfffde7, 0x6b543b, 2.3));
const sun = new THREE.DirectionalLight(0xffedb2, 4.8);
sun.position.set(-4.8, 7.2, 5.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -5;
sun.shadow.camera.right = 5;
sun.shadow.camera.top = 6;
sun.shadow.camera.bottom = -4;
sun.shadow.bias = -0.0005;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9bd69d, 1.25);
fill.position.set(4.5, 2.5, 3);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xe6f6a8, 1.4);
rim.position.set(-2, 3, -5);
scene.add(rim);

const world = new THREE.Group();
world.position.set(-1.62, -0.48, 0);
scene.add(world);
const proceduralScene = new THREE.Group();
world.add(proceduralScene);

const soilMaterial = new THREE.MeshStandardMaterial({
  color: 0x745439,
  roughness: 1,
  metalness: 0,
  vertexColors: false
});
const topSoilMaterial = new THREE.MeshStandardMaterial({ color: 0x657540, roughness: .98 });
const mossMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x789155,
  roughness: .9,
  clearcoat: .04,
  sheen: .08,
  sheenColor: new THREE.Color(0xd7e49b)
});
const stoneMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x8c7659, roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: 0xb09a76, roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: 0x71624d, roughness: 1 })
];
const rootMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xd7c58f,
  emissive: 0x6a5b2a,
  emissiveIntensity: .12,
  roughness: .78,
  clearcoat: .08
});
const fineRootMaterial = new THREE.MeshBasicMaterial({
  color: 0xcab77e,
  transparent: true,
  opacity: .56
});
const stemMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x356b39,
  roughness: .68,
  clearcoat: .12,
  clearcoatRoughness: .76,
  sheen: .18,
  sheenColor: new THREE.Color(0xb7d78b),
  side: THREE.DoubleSide
});
const leafMaterials = [
  new THREE.MeshPhysicalMaterial({
    color: 0x346e38,
    roughness: .72,
    clearcoat: .08,
    sheen: .22,
    sheenColor: new THREE.Color(0xc8e29c),
    side: THREE.DoubleSide
  }),
  new THREE.MeshPhysicalMaterial({
    color: 0x4f8446,
    roughness: .7,
    clearcoat: .07,
    sheen: .18,
    sheenColor: new THREE.Color(0xe0efb2),
    side: THREE.DoubleSide
  })
];
const tomatoMaterials = {
  ripe: new THREE.MeshPhysicalMaterial({ color: 0xd95f34, roughness: .42, clearcoat: .2 }),
  warm: new THREE.MeshPhysicalMaterial({ color: 0xe67b44, roughness: .45, clearcoat: .18 }),
  green: new THREE.MeshPhysicalMaterial({ color: 0x779d4d, roughness: .58, clearcoat: .1 })
};
const flowerMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xf1d56a,
  roughness: .52,
  clearcoat: .14,
  side: THREE.DoubleSide
});

function tube(points, radius, material, tubularSegments = 36, radialSegments = 8) {
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false),
    material
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createOrganicSoilGeometry() {
  const geometry = new THREE.CylinderGeometry(1.7, 1.36, .86, 96, 9, false);
  const position = geometry.attributes.position;
  const colors = [];
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    let y = position.getY(index);
    const z = position.getZ(index);
    const angle = Math.atan2(z, x);
    const vertical = (y + .43) / .86;
    const edgeNoise = Math.sin(angle * 5.0 + vertical * 3.1) * .026
      + Math.sin(angle * 11.0 - vertical * 4.2) * .012;
    const radial = Math.sqrt(x * x + z * z);
    if (radial > .7) {
      const nextRadius = radial * (1 + edgeNoise);
      position.setX(index, x / radial * nextRadius);
      position.setZ(index, z / radial * nextRadius);
    }
    if (vertical < .1) y += Math.sin(angle * 9.0) * .025;
    position.setY(index, y);
    const band = clamp(vertical);
    const shade = .62 + band * .32 + Math.sin(angle * 7 + vertical * 12) * .035;
    colors.push(.34 * shade, .24 * shade, .15 * shade);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const soilGroup = new THREE.Group();
proceduralScene.add(soilGroup);
const soilChunk = new THREE.Mesh(createOrganicSoilGeometry(), soilMaterial);
soilChunk.position.y = -.36;
soilChunk.castShadow = true;
soilChunk.receiveShadow = true;
soilGroup.add(soilChunk);

const topSoil = new THREE.Mesh(new THREE.CircleGeometry(1.69, 96), topSoilMaterial);
topSoil.rotation.x = -Math.PI / 2;
topSoil.position.y = .075;
topSoil.receiveShadow = true;
soilGroup.add(topSoil);

const moss = new THREE.Group();
soilGroup.add(moss);
for (let index = 0; index < 96; index += 1) {
  const angle = seededRandom() * Math.PI * 2;
  const radius = Math.sqrt(seededRandom()) * 1.57;
  const clump = new THREE.Mesh(
    new THREE.IcosahedronGeometry(.022 + seededRandom() * .026, 1),
    mossMaterial
  );
  clump.position.set(Math.cos(angle) * radius, .09 + seededRandom() * .025, Math.sin(angle) * radius);
  clump.scale.set(1.2 + seededRandom(), .45 + seededRandom() * .5, .8 + seededRandom() * .7);
  clump.rotation.set(seededRandom(), seededRandom() * Math.PI, seededRandom());
  clump.castShadow = true;
  moss.add(clump);
}

const pebbles = new THREE.Group();
soilGroup.add(pebbles);
for (let index = 0; index < 58; index += 1) {
  const angle = seededRandom() * Math.PI * 2;
  const radius = .18 + Math.sqrt(seededRandom()) * 1.43;
  const pebble = new THREE.Mesh(
    new THREE.DodecahedronGeometry(.018 + seededRandom() * .035, 0),
    stoneMaterials[index % stoneMaterials.length]
  );
  pebble.position.set(Math.cos(angle) * radius, .118 + seededRandom() * .018, Math.sin(angle) * radius);
  pebble.scale.set(1.1 + seededRandom(), .35 + seededRandom() * .45, .8 + seededRandom());
  pebble.rotation.set(seededRandom() * Math.PI, seededRandom() * Math.PI, 0);
  pebbles.add(pebble);
}

const roots = new THREE.Group();
roots.position.y = .02;
soilGroup.add(roots);
const rootMeshes = [];
function addRoot(points, radius, material = rootMaterial) {
  const mesh = tube(points, radius, material, 30, 7);
  roots.add(mesh);
  rootMeshes.push(mesh);
  return mesh;
}

const rootSpecs = [
  [-1, .95, -.7], [1, 1.02, -.76], [-1, .62, -.86], [1, .72, -.92],
  [-1, 1.2, -.55], [1, 1.3, -.62], [-1, .42, -.72], [1, .48, -.82]
];
rootSpecs.forEach((spec, index) => {
  const side = spec[0];
  const spread = spec[1];
  const depth = spec[2];
  const front = .52 + (index % 3) * .25;
  addRoot([
    new THREE.Vector3(0, .05, .12),
    new THREE.Vector3(side * .08, -.16, .5),
    new THREE.Vector3(side * spread * .42, depth * .52, 1.2),
    new THREE.Vector3(side * spread, depth, 1.36 - Math.abs(spread) * .07)
  ], .018 - index * .0009);

  for (let branch = 0; branch < 3; branch += 1) {
    const branchT = .35 + branch * .19;
    const branchSide = branch % 2 ? -1 : 1;
    addRoot([
      new THREE.Vector3(side * spread * branchT * .36, depth * branchT, front),
      new THREE.Vector3(side * spread * branchT * .56 + branchSide * .11, depth * (branchT + .14), front + .13),
      new THREE.Vector3(side * spread * branchT * .72 + branchSide * (.18 + branch * .04), depth * (branchT + .28), front + .18)
    ], .0065 - branch * .0008, fineRootMaterial);
  }
});

// A second root layer sits directly on the cut-away face so fine branching remains legible.
for (let index = 0; index < 18; index += 1) {
  const side = index % 2 ? 1 : -1;
  const spread = .18 + (index % 6) * .17;
  const endY = -.34 - (index % 5) * .085;
  addRoot([
    new THREE.Vector3((index % 3 - 1) * .025, .03, 1.72),
    new THREE.Vector3(side * .06, -.14, 1.71),
    new THREE.Vector3(side * spread * .48, endY * .62, 1.67),
    new THREE.Vector3(side * spread, endY, 1.56 - spread * .08)
  ], index < 4 ? .012 : .0065, index < 4 ? rootMaterial : fineRootMaterial);
}

const plant = new THREE.Group();
plant.position.y = .085;
proceduralScene.add(plant);

const seedMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xc6a260,
  emissive: 0x6c5525,
  emissiveIntensity: .2,
  roughness: .58,
  clearcoat: .18,
  transparent: true
});
const seed = new THREE.Group();
seed.position.set(0, .2, .05);
for (let side = -1; side <= 1; side += 2) {
  const half = new THREE.Mesh(new THREE.SphereGeometry(.105, 24, 18), seedMaterial);
  half.scale.set(.82, 1.08, .62);
  half.position.x = side * .052;
  half.rotation.z = side * .32;
  seed.add(half);
}
proceduralScene.add(seed);

const mainStemPoints = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(-.04, .52, .02),
  new THREE.Vector3(.09, 1.06, -.02),
  new THREE.Vector3(.02, 1.63, .04),
  new THREE.Vector3(.17, 2.17, -.01),
  new THREE.Vector3(.1, 2.72, .03),
  new THREE.Vector3(.22, 3.08, 0)
];
const mainStem = tube(mainStemPoints, .041, stemMaterial, 64, 11);
plant.add(mainStem);

function createSerratedLeafGeometry(length = .39, width = .15) {
  const shape = new THREE.Shape();
  const upper = [];
  const lower = [];
  const steps = 16;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const profile = Math.pow(Math.sin(Math.PI * t), .72) * (1 - t * .14);
    const tooth = index > 1 && index < steps - 1 ? (index % 2 ? .76 : 1.08) : 1;
    upper.push(new THREE.Vector2(t * length, profile * width * tooth));
    lower.push(new THREE.Vector2(t * length, -profile * width * (index % 2 ? 1.04 : .8)));
  }
  shape.moveTo(0, 0);
  upper.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  lower.reverse().forEach((point) => shape.lineTo(point.x, point.y));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 2);
  geometry.computeVertexNormals();
  return geometry;
}

const leafGeometry = createSerratedLeafGeometry(.45, .19);
const smallLeafGeometry = createSerratedLeafGeometry(.33, .14);
const growthItems = [];
const swayItems = [];

function registerGrowth(object, start, end, scale = 1) {
  object.userData.growth = { start, end, scale };
  growthItems.push(object);
}

function createLeaflet(scale, materialIndex, tilt, roll) {
  const group = new THREE.Group();
  const blade = new THREE.Mesh(scale < .78 ? smallLeafGeometry : leafGeometry, leafMaterials[materialIndex % 2]);
  blade.scale.setScalar(scale * 1.12);
  blade.rotation.x = tilt * .48;
  blade.rotation.y = roll;
  blade.castShadow = true;
  group.add(blade);

  const vein = new THREE.Mesh(
    new THREE.CylinderGeometry(.003, .005, .33 * scale, 5),
    stemMaterial
  );
  vein.rotation.z = -Math.PI / 2;
  vein.position.x = .165 * scale;
  vein.position.z = .004;
  group.add(vein);
  return group;
}

function createCompoundLeaf(position, direction, length, scale, start, phase) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData.phase = phase;
  group.rotation.y = Math.sin(phase * .83) * .34;
  group.rotation.z = Math.sin(phase * .57) * .055;
  const side = Math.sign(direction) || 1;
  const rachisPoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(direction * length * .35, .05, .03),
    new THREE.Vector3(direction * length * .72, .09, -.025),
    new THREE.Vector3(direction * length, .13, .01)
  ];
  group.add(tube(rachisPoints, .014 * scale, stemMaterial, 28, 7));

  for (let pair = 0; pair < 4; pair += 1) {
    const t = .18 + pair * .19;
    const x = direction * length * t;
    const y = .035 + t * .09;
    for (let leafSide = -1; leafSide <= 1; leafSide += 2) {
      const leaflet = createLeaflet(
        scale * .68 * (1 - pair * .07),
        pair + (leafSide > 0 ? 1 : 0),
        -.5 + leafSide * .13,
        side * .1 + leafSide * .22
      );
      leaflet.position.set(x, y + leafSide * .018, leafSide * (.055 + pair * .018));
      leaflet.rotation.z = side * (.08 + pair * .03) + leafSide * (.72 - pair * .06);
      leaflet.rotation.y = leafSide * (.28 + pair * .045) + Math.sin(phase + pair) * .11;
      leaflet.rotation.x = Math.cos(phase * .7 + pair) * .09;
      group.add(leaflet);
    }
  }

  const tip = createLeaflet(scale * .58, 1, -.42, side * .14);
  tip.position.set(direction * length * .9, .12, 0);
  tip.rotation.z = side * .12;
  group.add(tip);
  registerGrowth(group, start, start + .18, 1);
  swayItems.push(group);
  plant.add(group);
  return group;
}

const branchSpecs = [
  { y: .54, x: -.04, side: -1, length: 1.02, z: .16, start: .32 },
  { y: .83, x: .03, side: 1, length: .94, z: -.1, start: .37 },
  { y: 1.12, x: .08, side: -1, length: .98, z: -.04, start: .42 },
  { y: 1.43, x: .04, side: 1, length: .88, z: .13, start: .47 },
  { y: 1.74, x: .06, side: -1, length: .86, z: .12, start: .52 },
  { y: 2.03, x: .13, side: 1, length: .78, z: -.08, start: .57 },
  { y: 2.32, x: .12, side: -1, length: .69, z: -.02, start: .62 },
  { y: 2.58, x: .14, side: 1, length: .58, z: .04, start: .67 },
  { y: 2.78, x: .17, side: -1, length: .47, z: .08, start: .7 }
];

const branchGroups = [];
branchSpecs.forEach((spec, index) => {
  const group = new THREE.Group();
  group.position.set(spec.x, spec.y, 0);
  group.userData.phase = index * .71;
  const endX = spec.side * spec.length;
  const branch = tube([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(endX * .3, .08, spec.z * .25),
    new THREE.Vector3(endX * .7, .17, spec.z * .72),
    new THREE.Vector3(endX, .24, spec.z)
  ], .017 - index * .00065, stemMaterial, 34, 8);
  group.add(branch);
  plant.add(group);
  registerGrowth(group, spec.start, spec.start + .19, 1);
  swayItems.push(group);
  branchGroups.push(group);

  const leafCount = index < 6 ? 2 : 1;
  for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
    const leafGroup = new THREE.Group();
    leafGroup.position.set(
      endX * (.48 + leafIndex * .3),
      .1 + leafIndex * .075,
      spec.z * (.45 + leafIndex * .35)
    );
    group.add(leafGroup);

    const direction = spec.side * (leafIndex === 0 ? .58 : .42);
    const spray = new THREE.Group();
    leafGroup.add(spray);
    const rachisLength = .62 - index * .02;
    spray.add(tube([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(direction * rachisLength * .55, .07, .04),
      new THREE.Vector3(direction * rachisLength, .12, -.02)
    ], .011, stemMaterial, 22, 6));
    for (let pair = 0; pair < 4; pair += 1) {
      const t = .18 + pair * .2;
      for (let leafSide = -1; leafSide <= 1; leafSide += 2) {
        const leaflet = createLeaflet(.56 - index * .018 - pair * .032, index + pair, -.48, leafSide * .24);
        leaflet.position.set(direction * rachisLength * t, .03 + t * .08, leafSide * (.05 + pair * .012));
        leaflet.rotation.z = Math.sign(direction) * .1 + leafSide * (.7 - pair * .07);
        leaflet.rotation.y = leafSide * (.24 + pair * .04) + Math.sin(index + pair) * .1;
        leaflet.rotation.x = Math.cos(index * .8 + pair) * .08;
        spray.add(leaflet);
      }
    }
    const tip = createLeaflet(.45 - index * .014, index + 1, -.42, .12);
    tip.position.set(direction * rachisLength * .88, .11, 0);
    tip.rotation.z = Math.sign(direction) * .1;
    spray.add(tip);
    registerGrowth(leafGroup, spec.start + .08 + leafIndex * .035, spec.start + .25 + leafIndex * .04, 1);
    swayItems.push(leafGroup);
  }
});

createCompoundLeaf(new THREE.Vector3(.13, 2.82, .02), -.72, .72, .75, .7, 4.2);
createCompoundLeaf(new THREE.Vector3(.2, 3.0, 0), .55, .6, .68, .74, 5.1);
[
  { p: [-.04, .58, .14], d: -.9, l: .96, s: 1.08, t: .33, ph: .2 },
  { p: [.03, .86, -.12], d: .88, l: .91, s: 1.03, t: .38, ph: .9 },
  { p: [.08, 1.16, .04], d: -.86, l: .9, s: 1.0, t: .43, ph: 1.6 },
  { p: [.04, 1.48, .16], d: .8, l: .84, s: .95, t: .49, ph: 2.3 },
  { p: [.07, 1.8, .1], d: -.76, l: .8, s: .9, t: .55, ph: 3.0 },
  { p: [.13, 2.08, -.1], d: .7, l: .74, s: .84, t: .61, ph: 3.7 },
  { p: [.13, 2.38, .02], d: -.63, l: .67, s: .78, t: .66, ph: 4.4 }
].forEach((leaf) => createCompoundLeaf(
  new THREE.Vector3(leaf.p[0], leaf.p[1], leaf.p[2]),
  leaf.d,
  leaf.l,
  leaf.s,
  leaf.t,
  leaf.ph
));

[
  { p: [-.01, .72, -.18], d: .68, l: .78, s: .88, t: .37, ph: 5.7 },
  { p: [.06, 1.02, .2], d: -.66, l: .76, s: .9, t: .42, ph: 6.4 },
  { p: [.04, 1.34, -.2], d: .64, l: .74, s: .86, t: .48, ph: 7.1 },
  { p: [.09, 1.66, .21], d: -.6, l: .71, s: .82, t: .54, ph: 7.8 },
  { p: [.1, 1.96, -.18], d: .57, l: .68, s: .77, t: .6, ph: 8.5 },
  { p: [.14, 2.24, .16], d: -.51, l: .62, s: .72, t: .65, ph: 9.2 },
  { p: [.15, 2.52, -.13], d: .45, l: .54, s: .66, t: .7, ph: 9.9 }
].forEach((leaf) => createCompoundLeaf(
  new THREE.Vector3(leaf.p[0], leaf.p[1], leaf.p[2]),
  leaf.d,
  leaf.l,
  leaf.s,
  leaf.t,
  leaf.ph
));

function addSepals(group, radius) {
  for (let index = 0; index < 5; index += 1) {
    const sepal = new THREE.Mesh(new THREE.ConeGeometry(.022, radius * .72, 5), stemMaterial);
    sepal.position.y = radius * .78;
    sepal.rotation.z = Math.PI / 2;
    sepal.rotation.y = index / 5 * Math.PI * 2;
    group.add(sepal);
  }
}

function createFruitCluster(position, colors, start, phase) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData.phase = phase;
  group.add(tube([
    new THREE.Vector3(0, .05, 0),
    new THREE.Vector3(.02, -.07, .01),
    new THREE.Vector3(-.03, -.18, .03)
  ], .011, stemMaterial, 18, 6));
  colors.forEach((color, index) => {
    const fruitGroup = new THREE.Group();
    const radius = .105 + index * .012;
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 22), tomatoMaterials[color]);
    fruit.scale.set(1, .9, 1);
    fruit.castShadow = true;
    fruitGroup.add(fruit);
    addSepals(fruitGroup, radius);
    fruitGroup.position.set((index - (colors.length - 1) / 2) * .16, -.19 - (index % 2) * .055, index * .035);
    group.add(fruitGroup);
  });
  registerGrowth(group, start, start + .16, 1);
  swayItems.push(group);
  plant.add(group);
  return group;
}

createFruitCluster(new THREE.Vector3(-.42, 1.28, .22), ['ripe', 'warm'], .74, 1.4);
createFruitCluster(new THREE.Vector3(.48, 1.62, .13), ['ripe', 'ripe'], .79, 2.1);
createFruitCluster(new THREE.Vector3(-.3, 2.02, .04), ['green', 'green', 'warm'], .82, 2.9);
createFruitCluster(new THREE.Vector3(.34, 2.37, -.02), ['green', 'green'], .86, 3.6);

function createFlower(position, start, phase) {
  const flower = new THREE.Group();
  flower.position.copy(position);
  flower.userData.phase = phase;
  for (let index = 0; index < 5; index += 1) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(.045, 14, 9), flowerMaterial);
    petal.scale.set(1.35, .4, .2);
    const angle = index / 5 * Math.PI * 2;
    petal.position.set(Math.cos(angle) * .052, Math.sin(angle) * .052, 0);
    petal.rotation.z = angle;
    flower.add(petal);
  }
  const center = new THREE.Mesh(new THREE.SphereGeometry(.028, 12, 8), tomatoMaterials.green);
  flower.add(center);
  registerGrowth(flower, start, start + .12, 1);
  swayItems.push(flower);
  plant.add(flower);
}

createFlower(new THREE.Vector3(-.48, 2.45, .12), .72, .8);
createFlower(new THREE.Vector3(.36, 2.72, .08), .77, 1.8);
createFlower(new THREE.Vector3(.08, 3.08, .02), .8, 2.7);

const seedlings = new THREE.Group();
seedlings.position.y = .1;
proceduralScene.add(seedlings);
const seedlingItems = [];
for (let index = 0; index < 18; index += 1) {
  const angle = seededRandom() * Math.PI * 2;
  const radius = .45 + seededRandom() * 1.08;
  const sprout = new THREE.Group();
  sprout.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  sprout.rotation.y = -angle;
  const height = .075 + seededRandom() * .1;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.006, .01, height, 6), stemMaterial);
  stem.position.y = height / 2;
  sprout.add(stem);
  for (let side = -1; side <= 1; side += 2) {
    const leaf = createLeaflet(.22 + seededRandom() * .12, index, -.35, side * .15);
    leaf.position.set(side * .012, height * .82, 0);
    leaf.rotation.z = side * .92;
    sprout.add(leaf);
  }
  sprout.userData.start = .25 + seededRandom() * .2;
  sprout.userData.phase = index * .62;
  seedlings.add(sprout);
  seedlingItems.push(sprout);
}

const lightTrails = new THREE.Group();
world.add(lightTrails);
for (let index = 0; index < 3; index += 1) {
  const points = [];
  for (let point = 0; point <= 70; point += 1) {
    const t = point / 70;
    points.push(new THREE.Vector3(
      -2.2 + t * 4.4,
      -.08 + Math.sin(t * Math.PI) * (.22 + index * .1),
      -.8 - index * .18 + Math.sin(t * Math.PI * 2 + index) * .06
    ));
  }
  const trail = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: index === 1 ? 0xe5d38b : 0xb8d794,
      transparent: true,
      opacity: .08,
      depthWrite: false
    })
  );
  trail.userData.phase = index * 1.7;
  lightTrails.add(trail);
}

const moteCount = 210;
const motePositions = new Float32Array(moteCount * 3);
const moteSeeds = new Float32Array(moteCount);
for (let index = 0; index < moteCount; index += 1) {
  motePositions[index * 3] = -3.2 + seededRandom() * 6.4;
  motePositions[index * 3 + 1] = -.45 + seededRandom() * 4.5;
  motePositions[index * 3 + 2] = -1.4 + seededRandom() * 3.4;
  moteSeeds[index] = seededRandom();
}
const moteGeometry = new THREE.BufferGeometry();
moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
moteGeometry.setAttribute('aSeed', new THREE.BufferAttribute(moteSeeds, 1));
const moteMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uPulse: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() }
  },
  vertexShader: [
    'attribute float aSeed;',
    'uniform float uTime;',
    'uniform float uProgress;',
    'uniform float uPulse;',
    'uniform float uPixelRatio;',
    'varying float vAlpha;',
    'void main(){',
    '  float life=fract(aSeed+uTime*(.018+aSeed*.012));',
    '  vec3 p=position;',
    '  p.y=mod(p.y+life*1.55+.62,4.8)-.62;',
    '  p.x+=sin(uTime*.52+aSeed*23.0+p.y*2.1)*(.045+aSeed*.085);',
    '  p.z+=cos(uTime*.38+aSeed*17.0)*.035;',
    '  float lifeFade=smoothstep(0.0,.12,life)*(1.0-smoothstep(.72,1.0,life));',
    '  vAlpha=lifeFade*smoothstep(.08,.38,uProgress);',
    '  vec4 mvPosition=modelViewMatrix*vec4(p,1.0);',
    '  gl_PointSize=(2.0+aSeed*2.8+uPulse*1.8)*uPixelRatio*(7.2/-mvPosition.z);',
    '  gl_Position=projectionMatrix*mvPosition;',
    '}'
  ].join(''),
  fragmentShader: [
    'varying float vAlpha;',
    'void main(){',
    '  float d=distance(gl_PointCoord,vec2(.5));',
    '  float glow=1.0-smoothstep(.08,.5,d);',
    '  if(glow<.01) discard;',
    '  vec3 color=mix(vec3(.55,.72,.28),vec3(1.0,.94,.58),glow);',
    '  gl_FragColor=vec4(color,glow*vAlpha*.7);',
    '}'
  ].join('')
});
const motes = new THREE.Points(
  moteGeometry,
  moteMaterial
);
world.add(motes);

const contactShadow = new THREE.Mesh(
  new THREE.CircleGeometry(2.2, 64),
  new THREE.MeshBasicMaterial({ color: 0x355238, transparent: true, opacity: .1, depthWrite: false })
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.set(0, -.82, .04);
contactShadow.scale.y = .34;
proceduralScene.add(contactShadow);

const pulseRings = new THREE.Group();
world.add(pulseRings);
for (let index = 0; index < 3; index += 1) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(.46, .49, 80),
    new THREE.MeshBasicMaterial({
      color: index === 1 ? 0xd7e89d : 0x8fb66b,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(.03, -.77 + index * .006, .22);
  ring.scale.y = .42;
  ring.userData.phase = index / 3;
  pulseRings.add(ring);
}

function applyGrowth(progress, now) {
  const soilGrowth = stage(progress, 0, .15);
  const rootGrowth = stage(progress, .03, .31);
  const stemGrowth = stage(progress, .14, .66);
  const seedGrowth = stage(progress, .015, .09);
  const seedOpen = stage(progress, .09, .25);
  soilGroup.scale.setScalar(.9 + soilGrowth * .1);
  soilGroup.position.y = -.09 + soilGrowth * .09;
  seed.scale.setScalar(seedGrowth * (1 - seedOpen * .18));
  seed.position.y = .2 + seedOpen * .045;
  seed.children.forEach((half, index) => {
    const side = index === 0 ? -1 : 1;
    half.position.x = side * (.052 + seedOpen * .055);
    half.rotation.z = side * (.32 + seedOpen * .42);
  });
  seedMaterial.opacity = 1 - stage(progress, .24, .37);
  seed.visible = seedGrowth > .01 && seedMaterial.opacity > .01;
  roots.scale.set(1, rootGrowth, 1);
  roots.visible = rootGrowth > .01;
  mainStem.scale.set(1, stemGrowth, 1);
  mainStem.visible = stemGrowth > .01;

  growthItems.forEach((object) => {
    const config = object.userData.growth;
    const growth = stage(progress, config.start, config.end);
    object.scale.setScalar(growth * config.scale);
    object.visible = growth > .005;
  });

  seedlingItems.forEach((sprout) => {
    const growth = stage(progress, sprout.userData.start, sprout.userData.start + .18);
    sprout.scale.setScalar(growth);
    sprout.rotation.z = Math.sin(now * .001 + sprout.userData.phase) * .04 * growth;
  });

  const mature = stage(progress, .88, 1);
  plant.rotation.z = Math.sin(now * .00065) * .016 * stemGrowth;
  plant.rotation.x = Math.cos(now * .00051) * .006 * stemGrowth;
  plant.position.y = .085 + Math.sin(now * .0009) * .009 * mature;
  swayItems.forEach((item, index) => {
    const growth = item.visible ? 1 : 0;
    if (!item.userData.baseRotation) item.userData.baseRotation = item.rotation.clone();
    const baseRotation = item.userData.baseRotation;
    const targetZ = baseRotation.z + Math.sin(now * .00078 + item.userData.phase + index * .19) * .018 * growth;
    item.rotation.z += (targetZ - item.rotation.z) * .055;
    item.rotation.x = baseRotation.x + Math.cos(now * .00062 + item.userData.phase) * .008 * growth;
    item.rotation.y = baseRotation.y + Math.sin(now * .00054 + item.userData.phase) * .006 * growth;
  });

  lightTrails.children.forEach((trail, index) => {
    const wave = Math.sin(now * .00072 + trail.userData.phase) * .5 + .5;
    trail.material.opacity = (.025 + wave * .08) * rootGrowth;
    trail.position.x = Math.sin(now * .00011 + index) * .08;
  });

  moteMaterial.uniforms.uTime.value = now * .001;
  moteMaterial.uniforms.uProgress.value = progress;
  moteMaterial.uniforms.uPulse.value = state.pulse;

  const ringEnergy = stage(progress, .12, .48);
  pulseRings.children.forEach((ring, index) => {
    const cycle = (now * .000085 + ring.userData.phase) % 1;
    const scale = .72 + cycle * 2.9 + state.pulse * .3;
    ring.scale.set(scale, scale * .42, scale);
    ring.material.opacity = Math.pow(1 - cycle, 2) * ringEnergy * (.075 + state.pulse * .11);
  });

  const arrival = stage(progress, .18, 1);
  sun.intensity = 3.55 + arrival * 1.25 + state.pulse * .35;
  fill.intensity = 1.0 + arrival * .34;
  rim.intensity = 1.12 + arrival * .42;
}

function render(now) {
  if (!reducedMotion) {
    state.progress = clamp((now - state.startedAt) / growthDuration);
  }
  state.pulse *= .94;
  state.smoothPointer.lerp(state.pointer, .038);
  applyGrowth(state.progress, now);
  world.rotation.y += (state.smoothPointer.x * .075 - world.rotation.y) * .025;
  world.rotation.x += (-state.smoothPointer.y * .022 - world.rotation.x) * .025;
  const cameraArrival = stage(state.progress, .05, .95);
  camera.position.x += (state.smoothPointer.x * .12 - camera.position.x) * .02;
  camera.position.y += (.93 + cameraArrival * .19 - state.smoothPointer.y * .06 - camera.position.y) * .02;
  camera.position.z += (9.12 - cameraArrival * .42 - camera.position.z) * .018;
  camera.lookAt(
    state.width < 900 ? world.position.x : world.position.x - .25,
    .34 + cameraArrival * .41,
    0
  );
  motes.rotation.y = now * .000014;
  if (backdrop && !reducedMotion) {
    const x = state.smoothPointer.x * -8;
    const y = state.smoothPointer.y * 4;
    backdrop.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(1.035)';
  }
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

function resize() {
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  moteMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  renderer.setSize(state.width, state.height, false);
  camera.aspect = state.width / state.height;
  camera.fov = state.width < 560 ? 48 : state.width < 900 ? 43 : 35;
  camera.updateProjectionMatrix();
  world.position.x = state.width < 900 ? 0 : -1.62;
  world.position.y = state.width < 560 ? .72 : state.width < 900 ? .34 : -.48;
  world.scale.setScalar(state.width < 560 ? .69 : state.width < 900 ? .82 : 1);
}

window.addEventListener('pointermove', (event) => {
  if (reducedMotion) return;
  state.pointer.set(event.clientX / state.width * 2 - 1, event.clientY / state.height * 2 - 1);
}, { passive: true });
window.addEventListener('pointerleave', () => {
  state.pointer.set(0, 0);
}, { passive: true });
canvas.addEventListener('pointerdown', () => {
  if (reducedMotion) return;
  state.pulse = 1;
  lightTrails.children.forEach((trail, index) => {
    trail.userData.phase = -index * .32;
    trail.material.opacity = .18;
  });
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
    showToast('已选择' + roles[account].label);
    username.focus();
  });
});
forgotPassword.addEventListener('click', () => showToast('演示环境暂不发送重置邮件'));
form.addEventListener('submit', (event) => {
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
  localStorage.setItem('agriloop_user', JSON.stringify({
    username: account,
    role: selected.role,
    roleLabel: selected.label,
    avatar: ''
  }));
  window.setTimeout(() => {
    showToast('欢迎进入' + selected.label + '工作台');
    window.setTimeout(() => { window.location.href = 'index.html'; }, reducedMotion ? 100 : 500);
  }, reducedMotion ? 100 : 520);
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
