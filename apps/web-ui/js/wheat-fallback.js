/**
 * 2D 麦田回退层。
 *
 * Three.js 场景是首选背景，但某些浏览器、远程桌面或 GPU 驱动会让
 * WebGLRenderer 创建失败。此时仍应保留产品的农业场景，而不是只显示
 * 一层空的深色背景和粒子。因此这里用一个轻量、确定性的 Canvas 2D
 * 画出天空、地平线和麦穗；WebGL 成功后由 app.js 清理该画布。
 */

const FALLBACK_CLASS = 'agri-wheat-fallback';

function currentTheme() {
  return document.documentElement?.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function seeded(index, salt = 0) {
  // Integer hash: stable across reloads and independent from Math.random().
  let value = (index * 1664525 + salt * 1013904223 + 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 2246822519) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 3266489917) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function paintWheat(ctx, width, height, theme, time, stalks) {
  const light = theme === 'light';
  const horizon = height * 0.57;
  const palette = light
    ? {
      skyTop: '#dcebf8',
      skyBottom: '#fff4d6',
      haze: 'rgba(255, 246, 210, .58)',
      hillFar: 'rgba(117, 153, 91, .38)',
      hillNear: 'rgba(93, 133, 57, .56)',
      soil: '#8ea84a',
      stem: ['#587d2b', '#719c32', '#8fb43c', '#b9be42'],
      leaf: ['#4e7c2b', '#6d9630', '#91aa37'],
      head: ['#d9a52d', '#edbd3c', '#f5d16a'],
      glow: 'rgba(255, 228, 130, .22)'
    }
    : {
      skyTop: '#070b16',
      skyBottom: '#1e3150',
      haze: 'rgba(91, 116, 163, .18)',
      hillFar: 'rgba(65, 90, 55, .48)',
      hillNear: 'rgba(55, 76, 32, .82)',
      soil: '#3f5328',
      stem: ['#344b21', '#4b6624', '#6d7b2b', '#9a8b3d'],
      leaf: ['#2f5122', '#456b27', '#668231'],
      head: ['#ad913a', '#c5a84a', '#e0c266'],
      glow: 'rgba(205, 177, 85, .13)'
    };

  const sky = ctx.createLinearGradient(0, 0, 0, horizon * 1.18);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // A soft horizon glow prevents a failed WebGL scene from becoming a flat slab.
  const glow = ctx.createRadialGradient(width * 0.52, horizon * 0.9, 4, width * 0.52, horizon, width * 0.72);
  glow.addColorStop(0, palette.glow);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = palette.haze;
  ctx.beginPath();
  ctx.moveTo(0, horizon + 16);
  for (let x = 0; x <= width; x += Math.max(24, width / 26)) {
    const wave = Math.sin(x * 0.009 + 1.2) * 10 + Math.sin(x * 0.021) * 5;
    ctx.lineTo(x, horizon + wave);
  }
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  // Layered distant hills provide depth even when the visible viewport is tall.
  for (const [offset, color, amplitude] of [
    [0, palette.hillFar, 15],
    [22, palette.hillNear, 22]
  ]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, horizon + offset + 26);
    for (let x = 0; x <= width; x += Math.max(18, width / 36)) {
      const y = horizon + offset + 25
        + Math.sin(x * 0.007 + offset) * amplitude
        + Math.sin(x * 0.017 + 2.5) * amplitude * 0.36;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  }

  const field = ctx.createLinearGradient(0, horizon + 38, 0, height);
  field.addColorStop(0, palette.soil);
  field.addColorStop(1, light ? '#526f2a' : '#24391f');
  ctx.fillStyle = field;
  ctx.fillRect(0, horizon + 34, width, height - horizon - 34);

  // Back-to-front rows. The foreground is intentionally denser at the edges,
  // where the dashboard leaves the background visible, while the middle stays
  // visually quiet behind the primary glass cards.
  ctx.lineCap = 'round';
  for (const stalk of stalks) {
    const baseY = horizon + 25 + stalk.depth * (height - horizon + 24);
    const stalkHeight = stalk.height * (0.72 + 0.28 * stalk.depth);
    const sway = Math.sin(time * 0.00075 + stalk.phase) * (2.2 + stalk.depth * 4.8);
    const lean = stalk.lean * (0.45 + stalk.depth * 0.8);
    const topX = stalk.x + sway + lean;
    const topY = baseY - stalkHeight;
    const stemColor = palette.stem[stalk.colorIndex];
    ctx.strokeStyle = stemColor;
    ctx.globalAlpha = 0.42 + stalk.depth * 0.48;
    ctx.lineWidth = 0.55 + stalk.depth * 1.15;
    ctx.beginPath();
    ctx.moveTo(stalk.x, baseY + 3);
    ctx.quadraticCurveTo(stalk.x + sway * 0.32, baseY - stalkHeight * 0.45, topX, topY);
    ctx.stroke();

    // Two leaves on either side, kept as small tapered polygons for a wheat-like
    // silhouette rather than broad opaque foliage.
    const leafColor = palette.leaf[(stalk.colorIndex + stalk.row) % palette.leaf.length];
    ctx.fillStyle = leafColor;
    const leafCount = stalk.depth > 0.55 ? 3 : 2;
    for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
      const ratio = 0.38 + leafIndex * 0.16 + stalk.leafJitter;
      const y = baseY - stalkHeight * ratio;
      const direction = leafIndex % 2 === 0 ? -1 : 1;
      const length = (7 + stalk.depth * 15) * (0.85 + seeded(stalk.index, leafIndex + 4) * 0.28);
      const originX = stalk.x + sway * (1 - ratio * 0.32) + lean * ratio;
      ctx.globalAlpha = 0.32 + stalk.depth * 0.48;
      ctx.beginPath();
      ctx.moveTo(originX, y + 1);
      ctx.quadraticCurveTo(originX + direction * length * 0.45, y - 4, originX + direction * length, y - 1);
      ctx.quadraticCurveTo(originX + direction * length * 0.44, y + 2, originX, y + 3);
      ctx.closePath();
      ctx.fill();
    }

    // Wheat head and a few grains. This is deliberately subtle at the horizon
    // and brighter in the foreground so the field reads as depth, not noise.
    const headColor = palette.head[(stalk.index + stalk.row) % palette.head.length];
    ctx.strokeStyle = headColor;
    ctx.fillStyle = headColor;
    ctx.globalAlpha = 0.45 + stalk.depth * 0.45;
    ctx.lineWidth = 0.65 + stalk.depth * 0.65;
    ctx.beginPath();
    ctx.moveTo(topX, topY + 3);
    ctx.lineTo(topX + lean * 0.16, topY - 8 - stalk.depth * 7);
    ctx.stroke();
    const headY = topY - 5 - stalk.depth * 4;
    for (let grain = 0; grain < 4; grain += 1) {
      const gy = headY + grain * (2.1 + stalk.depth * 0.8);
      const side = grain % 2 === 0 ? -1 : 1;
      ctx.beginPath();
      ctx.ellipse(topX + side * (2.2 + stalk.depth * 2.4), gy, 1.4 + stalk.depth * 1.4, 0.8 + stalk.depth * 0.55, side * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // A faint foreground vignette blends the fallback into the existing glass UI.
  const vignette = ctx.createLinearGradient(0, height * 0.68, 0, height);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, light ? 'rgba(43, 67, 24, .16)' : 'rgba(0, 0, 0, .18)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, height * 0.68, width, height * 0.32);
}

function makeStalks(width, height) {
  const horizon = height * 0.57;
  const rows = 9;
  const stalks = [];
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    const depth = row / (rows - 1);
    const spacing = 24 - depth * 12;
    const count = Math.ceil(width / spacing) + 18;
    for (let col = -9; col < count; col += 1) {
      const jitter = (seeded(index, row + 3) - 0.5) * spacing * 0.9;
      const x = col * spacing + jitter;
      // Avoid an artificial hard line at the horizon while keeping foreground
      // silhouettes visible around both sides of the dashboard.
      const heightScale = 28 + depth * 112 + seeded(index, 17) * (14 + depth * 36);
      stalks.push({
        index,
        row,
        depth,
        x,
        height: heightScale + Math.max(0, (height - 720) * 0.025),
        lean: (seeded(index, 23) - 0.5) * (8 + depth * 22),
        phase: seeded(index, 31) * Math.PI * 2,
        leafJitter: (seeded(index, 37) - 0.5) * 0.09,
        colorIndex: Math.floor(seeded(index, 41) * 4)
      });
      index += 1;
    }
  }
  // The painter already goes from distant to foreground rows, so no sort is
  // needed; retaining row order keeps the draw cost predictable.
  void horizon;
  return stalks;
}

export function initWheatFallback(containerId = 'riumBackground') {
  const host = document.getElementById(containerId);
  if (!host) return null;
  const existing = host.querySelector(`.${FALLBACK_CLASS}`);
  if (existing && existing.__agriloopCleanup) return existing.__agriloopCleanup;

  const canvas = document.createElement('canvas');
  canvas.className = FALLBACK_CLASS;
  canvas.dataset.backgroundLayer = 'wheat-fallback';
  canvas.setAttribute('aria-hidden', 'true');
  host.insertBefore(canvas, host.firstChild);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return null;
  }

  let width = 0;
  let height = 0;
  let dpr = 1;
  let theme = currentTheme();
  let stalks = [];
  let rafId = 0;
  let lastFrameAt = 0;
  let documentVisible = !document.hidden;
  let externallyVisible = true;
  let disposed = false;

  const resize = () => {
    // The fallback is used most often on machines that cannot afford the
    // WebGL scene; cap its backing store a little more aggressively while
    // retaining crisp stalk edges on ordinary HiDPI screens.
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    stalks = makeStalks(width, height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintWheat(ctx, width, height, theme, performance.now(), stalks);
  };

  const stop = () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const draw = now => {
    rafId = 0;
    if (disposed || !documentVisible || !externallyVisible) return;
    if (now - lastFrameAt < 32) {
      rafId = window.requestAnimationFrame(draw);
      return;
    }
    lastFrameAt = now;
    paintWheat(ctx, width, height, theme, now, stalks);
    rafId = window.requestAnimationFrame(draw);
  };

  const sync = () => {
    const shouldRun = !disposed && documentVisible && externallyVisible;
    if (!shouldRun) {
      stop();
      return;
    }
    if (!rafId) rafId = window.requestAnimationFrame(draw);
  };

  const onResize = () => resize();
  const onVisibility = () => {
    documentVisible = !document.hidden;
    sync();
  };
  const onThemeChange = event => {
    theme = event.detail?.theme === 'light' ? 'light' : currentTheme();
    paintWheat(ctx, width, height, theme, performance.now(), stalks);
  };
  const onThemeTransition = event => {
    if (event.detail?.to) theme = event.detail.to === 'light' ? 'light' : 'dark';
  };

  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('agriloop-theme-change', onThemeChange);
  document.addEventListener('agriloop-theme-transition', onThemeTransition);
  resize();
  sync();

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    stop();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('agriloop-theme-change', onThemeChange);
    document.removeEventListener('agriloop-theme-transition', onThemeTransition);
    delete canvas.__agriloopCleanup;
    canvas.remove();
  };
  cleanup.setVisible = value => {
    externallyVisible = value !== false;
    canvas.style.display = externallyVisible ? 'block' : 'none';
    sync();
  };
  cleanup.setTheme = nextTheme => {
    theme = nextTheme === 'light' ? 'light' : 'dark';
    paintWheat(ctx, width, height, theme, performance.now(), stalks);
  };
  cleanup.canvas = canvas;
  canvas.__agriloopCleanup = cleanup;
  return cleanup;
}
