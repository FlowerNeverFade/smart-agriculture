const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
let cleanupActiveFieldSandbox = null;

function drawLeaf(context, point, alpha) {
  context.save();
  context.translate(point.x, point.y);
  context.rotate(point.rotation);
  context.scale(1, .58);
  context.beginPath();
  context.ellipse(0, 0, point.size, point.size * .56, 0, 0, Math.PI * 2);
  context.fillStyle = `rgba(116, 242, 166, ${alpha * .48})`;
  context.fill();
  context.restore();
}
function drawSmoothTrail(context, points, now, pointer) {
  if (points.length < 2) return;
  const first = points[0];
  const last = points.at(-1);
  const gradient = context.createLinearGradient(first.x, first.y, last.x, last.y);
  gradient.addColorStop(0, 'rgba(55, 189, 110, 0)');
  gradient.addColorStop(.52, 'rgba(76, 222, 135, .2)');
  gradient.addColorStop(1, 'rgba(145, 255, 188, .72)');

  context.save();
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midpointX = (current.x + next.x) * .5;
    const midpointY = (current.y + next.y) * .5;
    context.quadraticCurveTo(current.x, current.y, midpointX, midpointY);
  }
  context.lineTo(last.x, last.y);
  context.strokeStyle = gradient;
  context.lineWidth = 1.65;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.shadowColor = 'rgba(78, 241, 144, .44)';
  context.shadowBlur = 6;
  context.stroke();
  context.restore();

  for (let index = 0; index < points.length; index += 4) {
    const point = points[index];
    const alpha = clamp(1 - (now - point.bornAt) / point.duration, 0, 1);
    if (point.kind === 'leaf') {
      drawLeaf(context, point, alpha);
    } else {
      context.beginPath();
      context.arc(point.x, point.y, point.size * (.45 + alpha * .55), 0, Math.PI * 2);
      context.fillStyle = `rgba(197, 255, 219, ${alpha * .55})`;
      context.fill();
    }
  }

  if (pointer.active) {
    const glow = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 18);
    glow.addColorStop(0, 'rgba(218, 255, 232, .72)');
    glow.addColorStop(.2, 'rgba(105, 245, 162, .42)');
    glow.addColorStop(1, 'rgba(74, 225, 134, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(pointer.x, pointer.y, 18, 0, Math.PI * 2);
    context.fill();
  }
}

function drawSprout(context, burst) {
  const progress = clamp(1 - burst.life, 0, 1);
  const alpha = Math.max(0, burst.life);
  const radius = 12 + progress * 78;

  context.save();
  context.strokeStyle = `rgba(98, 232, 151, ${alpha * .7})`;
  context.lineWidth = 1.4;
  context.shadowColor = `rgba(74, 255, 149, ${alpha * .72})`;
  context.shadowBlur = 11;
  context.beginPath();
  context.ellipse(burst.x, burst.y, radius, radius * .38, 0, 0, Math.PI * 2);
  context.stroke();

  if (progress > .2) {
    const growth = clamp((progress - .2) / .55, 0, 1);
    const stemHeight = 30 * growth;
    context.strokeStyle = `rgba(124, 247, 168, ${alpha * .92})`;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(burst.x, burst.y);
    context.quadraticCurveTo(burst.x - 3, burst.y - stemHeight * .55, burst.x, burst.y - stemHeight);
    context.stroke();

    context.fillStyle = `rgba(115, 237, 160, ${alpha * .78})`;
    context.beginPath();
    context.ellipse(burst.x - 7, burst.y - stemHeight + 4, 8 * growth, 4 * growth, -.48, 0, Math.PI * 2);
    context.ellipse(burst.x + 7, burst.y - stemHeight + 1, 8 * growth, 4 * growth, .48, 0, Math.PI * 2);
    context.fill();
  }

  burst.droplets.forEach((drop) => {
    const x = burst.x + drop.vx * progress;
    const y = burst.y + drop.vy * progress + 30 * progress * progress;
    context.beginPath();
    context.arc(x, y, drop.size * alpha, 0, Math.PI * 2);
    context.fillStyle = `rgba(177, 247, 203, ${alpha * .68})`;
    context.fill();
  });
  context.restore();
}

export function initFieldSandbox(root) {
  if (!root || root.dataset.fieldFxBound === 'true') return;
  cleanupActiveFieldSandbox?.();
  const canvas = root.querySelector('[data-field-effects]');
  const context = canvas?.getContext('2d', { alpha: true });
  if (!canvas || !context) return;

  root.dataset.fieldFxBound = 'true';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollContainer = root.closest('.subview-modal-body');
  const plotResponses = [...root.querySelectorAll('.field-plot')].map((element) => ({
    element,
    intensity: 0,
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    centerX: 0,
    centerY: 0
  }));
  const trail = [];
  const bursts = [];
  const pointer = {
    active: false,
    initialized: false,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    lastInputAt: 0,
    lastRecordX: 0,
    lastRecordY: 0
  };
  let frameId = 0;
  let lastTime = performance.now();
  let rootRect = root.getBoundingClientRect();
  let cssWidth = 1;
  let cssHeight = 1;
  let pointSequence = 0;

  const measure = () => {
    rootRect = root.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1 : 1.25);
    cssWidth = Math.max(1, rootRect.width);
    cssHeight = Math.max(1, root.scrollHeight, rootRect.height);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    plotResponses.forEach((plot) => {
      plot.left = plot.element.offsetLeft;
      plot.top = plot.element.offsetTop;
      plot.width = Math.max(1, plot.element.offsetWidth);
      plot.height = Math.max(1, plot.element.offsetHeight);
      plot.centerX = plot.left + plot.width * .5;
      plot.centerY = plot.top + plot.height * .5;
    });
  };

  const pointFromEvent = (event) => ({
    x: clamp(event.clientX - rootRect.left, 0, cssWidth),
    y: clamp(event.clientY - rootRect.top, 0, cssHeight)
  });

  const updatePlotResponses = (delta) => {
    let isChanging = false;
    const smoothing = 1 - Math.exp(-delta * .014);
    plotResponses.forEach((plot) => {
      const normalizedX = (pointer.x - plot.centerX) / Math.max(190, plot.width * .82);
      const normalizedY = (pointer.y - plot.centerY) / Math.max(170, plot.height * .78);
      const distance = Math.hypot(normalizedX, normalizedY);
      const targetIntensity = pointer.active ? clamp(1 - distance, 0, 1) : 0;
      if (Math.abs(targetIntensity - plot.intensity) > .002) isChanging = true;
      plot.intensity = lerp(plot.intensity, targetIntensity, smoothing);

      const localX = clamp((pointer.x - plot.left) / plot.width * 100, 0, 100);
      const localY = clamp((pointer.y - plot.top) / plot.height * 100, 0, 100);
      const shiftX = clamp((pointer.x - plot.centerX) * .012, -5, 5) * plot.intensity;
      const shiftY = clamp((pointer.y - plot.centerY) * .009, -4, 4) * plot.intensity;
      plot.element.style.setProperty('--plot-response', plot.intensity.toFixed(3));
      plot.element.style.setProperty('--plot-glow-x', `${localX.toFixed(1)}%`);
      plot.element.style.setProperty('--plot-glow-y', `${localY.toFixed(1)}%`);
      plot.element.style.setProperty('--plot-shift-x', `${shiftX.toFixed(2)}px`);
      plot.element.style.setProperty('--plot-shift-y', `${shiftY.toFixed(2)}px`);
      plot.element.style.setProperty('--plot-scale', (1 + plot.intensity * .018).toFixed(4));
      plot.element.classList.toggle('field-plot-active', plot.intensity > .06);
    });
    return isChanging;
  };

  const recordTrailPoint = (now) => {
    const distance = Math.hypot(pointer.x - pointer.lastRecordX, pointer.y - pointer.lastRecordY);
    if (distance < 3.2) return;
    pointSequence += 1;
    trail.push({
      x: pointer.x,
      y: pointer.y,
      bornAt: now,
      duration: 720 + Math.random() * 220,
      size: 1.45 + Math.random() * 1.25,
      rotation: Math.atan2(pointer.y - pointer.lastRecordY, pointer.x - pointer.lastRecordX) + (pointSequence % 2 ? .65 : -.65),
      kind: pointSequence % 8 === 0 ? 'leaf' : 'dew'
    });
    pointer.lastRecordX = pointer.x;
    pointer.lastRecordY = pointer.y;
    if (trail.length > 56) trail.splice(0, trail.length - 56);
  };

  const animate = (time) => {
    const delta = Math.min(34, time - lastTime || 16);
    lastTime = time;
    const pointerSmoothing = 1 - Math.exp(-delta * .026);
    pointer.x = lerp(pointer.x, pointer.targetX, pointerSmoothing);
    pointer.y = lerp(pointer.y, pointer.targetY, pointerSmoothing);

    const stillFollowing = Math.hypot(pointer.targetX - pointer.x, pointer.targetY - pointer.y) > .8 || time - pointer.lastInputAt < 120;
    if (stillFollowing && time - pointer.lastInputAt < 120) recordTrailPoint(time);
    while (trail.length && time - trail[0].bornAt > trail[0].duration) trail.shift();

    root.style.setProperty('--field-pointer-x', `${pointer.x.toFixed(1)}px`);
    root.style.setProperty('--field-pointer-y', `${pointer.y.toFixed(1)}px`);
    root.style.setProperty('--field-pointer-opacity', pointer.active ? '1' : '0');
    const plotResponseChanging = updatePlotResponses(delta);

    context.clearRect(0, 0, cssWidth, cssHeight);
    drawSmoothTrail(context, trail, time, pointer);

    for (let index = bursts.length - 1; index >= 0; index -= 1) {
      const burst = bursts[index];
      burst.life -= delta / burst.duration;
      if (burst.life <= 0) {
        bursts.splice(index, 1);
      } else {
        drawSprout(context, burst);
      }
    }

    const needsFrame = trail.length || bursts.length || stillFollowing || plotResponseChanging;
    if (needsFrame) {
      frameId = requestAnimationFrame(animate);
    } else {
      frameId = 0;
    }
  };

  const ensureAnimation = () => {
    if (!frameId) {
      lastTime = performance.now();
      frameId = requestAnimationFrame(animate);
    }
  };

  const onPointerMove = (event) => {
    if (reducedMotion || (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
    const point = pointFromEvent(event);
    const now = performance.now();
    const jumpDistance = pointer.initialized ? Math.hypot(point.x - pointer.targetX, point.y - pointer.targetY) : 0;
    if (!pointer.initialized || jumpDistance > 150 || now - pointer.lastInputAt > 220) {
      pointer.x = point.x;
      pointer.y = point.y;
      pointer.lastRecordX = point.x;
      pointer.lastRecordY = point.y;
      trail.length = 0;
      pointer.initialized = true;
    }
    pointer.targetX = point.x;
    pointer.targetY = point.y;
    pointer.lastInputAt = now;
    pointer.active = true;
    ensureAnimation();
  };

  const onPointerLeave = () => {
    pointer.active = false;
    ensureAnimation();
  };

  const onPointerEnter = (event) => {
    rootRect = root.getBoundingClientRect();
    onPointerMove(event);
  };

  const onClick = (event) => {
    if (reducedMotion) return;
    const point = pointFromEvent(event);
    bursts.push({
      ...point,
      life: 1,
      duration: 980,
      droplets: Array.from({ length: 8 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 8 + Math.random() * .22;
        const speed = 21 + Math.random() * 32;
        return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 20, size: 1.3 + Math.random() * 1.5 };
      })
    });
    ensureAnimation();
  };

  const onScroll = () => {
    rootRect = root.getBoundingClientRect();
  };

  root.addEventListener('pointerenter', onPointerEnter, { passive: true });
  root.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('pointerleave', onPointerLeave, { passive: true });
  root.addEventListener('click', onClick);
  scrollContainer?.addEventListener('scroll', onScroll, { passive: true });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  observer?.observe(root);
  measure();
  cleanupActiveFieldSandbox = () => {
    root.removeEventListener('pointerenter', onPointerEnter);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerleave', onPointerLeave);
    root.removeEventListener('click', onClick);
    scrollContainer?.removeEventListener('scroll', onScroll);
    observer?.disconnect();
    if (frameId) cancelAnimationFrame(frameId);
    cleanupActiveFieldSandbox = null;
  };
}
