import { MOCK_DATA } from './mock-data.js';
import { createWaterShaderRenderer } from './water-shader.js';

const profile = MOCK_DATA.resourceProfile;
const resourceState = {
  dailyLimitLitres: Number(profile.dailyLimitLitres || 0),
  usedTodayLitres: Number(profile.usedTodayLitres || 0),
  remainingLitres: Number(profile.remainingLitres || 0),
  dispatchCapacityLitres: Number(profile.capacityLitres || 0),
  flowRateLitresPerMinute: Number(profile.flowRateLitresPerMinute || 0),
  activeConflicts: Number(profile.activeConflicts || 0),
  status: profile.status || 'FEASIBLE',
  provenance: 'SIMULATED',
  plannedLitres: 0,
  planStatus: 'NOT_EVALUATED'
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const formatLitres = (value) => `${Math.round(Number(value) || 0).toLocaleString('zh-CN')} L`;
const now = () => performance.now();

const miniControllers = new WeakMap();
const surfaceControllers = new WeakMap();
let activeSurfaceController = null;

function snapshot() {
  const dailyLimit = Math.max(1, resourceState.dailyLimitLitres);
  const remaining = clamp(resourceState.remainingLitres, 0, dailyLimit);
  const remainingPercent = remaining / dailyLimit * 100;
  const projectedRemaining = clamp(remaining - resourceState.plannedLitres, 0, dailyLimit);
  return {
    ...resourceState,
    remainingLitres: remaining,
    remainingPercent,
    projectedRemaining,
    projectedPercent: projectedRemaining / dailyLimit * 100
  };
}

function waterLevelClass(percent) {
  if (percent < 30) return 'water-level-critical';
  if (percent < 60) return 'water-level-warning';
  return 'water-level-safe';
}

function updateText(root, selector, value) {
  root.querySelectorAll(selector).forEach((node) => { node.textContent = value; });
}

function updateOrb(orb, state) {
  orb.style.setProperty('--water-level', `${state.remainingPercent.toFixed(1)}%`);
  orb.style.setProperty('--preview-water-level', `${state.projectedPercent.toFixed(1)}%`);
  orb.classList.remove('water-level-safe', 'water-level-warning', 'water-level-critical');
  orb.classList.add(waterLevelClass(state.remainingPercent));
  orb.classList.toggle('has-water-preview', state.plannedLitres > 0);
  orb.setAttribute('aria-label', `集中蓄水池今日剩余 ${formatLitres(state.remainingLitres)}，占总配额 ${state.remainingPercent.toFixed(1)}%`);
  updateText(orb, '[data-water-remaining]', formatLitres(state.remainingLitres));
  updateText(orb, '[data-water-percent]', `${state.remainingPercent.toFixed(1)}%`);
  updateText(orb, '[data-water-limit]', formatLitres(state.dailyLimitLitres));
  updateText(orb, '[data-water-source]', state.provenance);
  updateText(orb, '[data-water-preview]', state.plannedLitres > 0 ? `试算后 ${formatLitres(state.projectedRemaining)}` : '等待排程评估');
}

function updateWaterSurface(surface, state) {
  surface.style.setProperty('--water-level', `${state.remainingPercent.toFixed(1)}%`);
  surface.style.setProperty('--preview-water-level', `${state.projectedPercent.toFixed(1)}%`);
  surface.classList.remove('water-level-safe', 'water-level-warning', 'water-level-critical');
  surface.classList.add(waterLevelClass(state.remainingPercent));
  surface.classList.toggle('has-water-preview', state.plannedLitres > 0);
  updateText(surface, '[data-water-remaining]', formatLitres(state.remainingLitres));
  updateText(surface, '[data-water-percent]', `${state.remainingPercent.toFixed(1)}%`);
  updateText(surface, '[data-water-limit]', formatLitres(state.dailyLimitLitres));
  updateText(surface, '[data-water-source]', state.provenance);
  updateText(surface, '[data-water-preview]', state.plannedLitres > 0 ? `试算后 ${formatLitres(state.projectedRemaining)}` : '等待排程评估');
}

function shaderState(state) {
  const level = clamp(state.remainingPercent / 100, 0, 1);
  const projected = clamp(state.projectedPercent / 100, 0, 1);
  const riskState = level < 0.3 ? 2 : level < 0.6 ? 1 : 0;
  return {
    actualWaterLevel: level,
    projectedWaterLevel: projected,
    hasPreview: state.plannedLitres > 0,
    riskState
  };
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.('button, input, select, textarea, a, [contenteditable="true"], [role="button"]'));
}

function bindMiniWaterInteraction(target) {
  if (!target || miniControllers.has(target)) return miniControllers.get(target);
  const canvas = target.querySelector('[data-water-canvas]');
  const context = canvas?.getContext('2d', { alpha: true });
  if (!canvas || !context) return null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ripples = [];
  const droplets = [];
  let animationFrame = 0;
  let lastPointerAt = 0;
  let cssWidth = 1;
  let cssHeight = 1;
  let destroyed = false;

  const resize = () => {
    const rect = target.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const pointFromEvent = (event) => {
    const rect = target.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const animate = (time) => {
    animationFrame = 0;
    if (destroyed || !target.isConnected) return;
    context.clearRect(0, 0, cssWidth, cssHeight);

    for (let index = ripples.length - 1; index >= 0; index -= 1) {
      const ripple = ripples[index];
      const delta = Math.min(32, time - ripple.lastTime || 16);
      ripple.lastTime = time;
      ripple.radius += ripple.speed * delta * 0.06;
      ripple.alpha -= delta / ripple.duration;
      if (ripple.alpha <= 0) {
        ripples.splice(index, 1);
        continue;
      }
      context.beginPath();
      context.ellipse(ripple.x, ripple.y, ripple.radius, ripple.radius * 0.42, 0, 0, Math.PI * 2);
      context.strokeStyle = `rgba(149, 224, 255, ${ripple.alpha * 0.66})`;
      context.lineWidth = 1.1;
      context.stroke();
    }

    for (let index = droplets.length - 1; index >= 0; index -= 1) {
      const drop = droplets[index];
      const delta = Math.min(32, time - drop.lastTime || 16) * 0.06;
      drop.lastTime = time;
      drop.x += drop.vx * delta;
      drop.y += drop.vy * delta;
      drop.vy += 0.045 * delta;
      drop.alpha -= 0.018 * delta;
      if (drop.alpha <= 0 || drop.y > cssHeight + 8) {
        droplets.splice(index, 1);
        continue;
      }
      context.beginPath();
      context.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(126, 215, 255, ${drop.alpha * 0.7})`;
      context.shadowBlur = 5;
      context.shadowColor = 'rgba(79, 195, 247, .48)';
      context.fill();
      context.shadowBlur = 0;
    }

    if ((ripples.length || droplets.length) && !destroyed) {
      animationFrame = requestAnimationFrame(animate);
    }
  };

  const startAnimation = () => {
    if (!animationFrame && !destroyed) animationFrame = requestAnimationFrame(animate);
  };

  const onPointerMove = (event) => {
    if (reducedMotion.matches || event.pointerType === 'touch') return;
    const current = now();
    if (current - lastPointerAt < 70) return;
    lastPointerAt = current;
    const point = pointFromEvent(event);
    ripples.push({ ...point, radius: 3, alpha: 0.34, speed: 0.95, duration: 860, lastTime: current });
    if (ripples.length > 8) ripples.shift();
    startAnimation();
  };

  const onPointerDown = (event) => {
    if (reducedMotion.matches || isInteractiveTarget(event.target)) return;
    const point = pointFromEvent(event);
    const current = now();
    ripples.push({ ...point, radius: 5, alpha: 0.58, speed: 1.8, duration: 620, lastTime: current });
    for (let index = 0; index < 7; index += 1) {
      const angle = Math.PI + Math.random() * Math.PI;
      const velocity = 1.2 + Math.random() * 1.7;
      droplets.push({
        x: point.x,
        y: point.y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 0.8,
        radius: 1 + Math.random() * 1.6,
        alpha: 0.8,
        lastTime: current
      });
    }
    if (droplets.length > 24) droplets.splice(0, droplets.length - 24);
    startAnimation();
  };

  target.addEventListener('pointermove', onPointerMove, { passive: true });
  target.addEventListener('pointerdown', onPointerDown, { passive: true });
  resize();
  const observer = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
  observer?.observe(target);

  const controller = {
    target,
    update() {},
    destroy() {
      if (destroyed) return;
      destroyed = true;
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerdown', onPointerDown);
      observer?.disconnect();
      if (animationFrame) cancelAnimationFrame(animationFrame);
      miniControllers.delete(target);
    }
  };
  miniControllers.set(target, controller);
  return controller;
}

function drawCrown(context, splash, time) {
  const progress = clamp((time - splash.startedAt) / splash.duration, 0, 1);
  const alpha = 1 - progress;
  const radius = 9 + progress * 30;
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = `rgba(208, 247, 255, ${0.66 * alpha})`;
  context.shadowColor = `rgba(72, 202, 246, ${0.72 * alpha})`;
  context.shadowBlur = 12;
  context.lineWidth = 1.2;
  context.beginPath();
  context.ellipse(splash.x, splash.y, radius * 1.75, radius * 0.44, 0, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  const spikes = 10;
  for (let index = 0; index <= spikes; index += 1) {
    const angle = Math.PI * 2 * index / spikes;
    const wobble = 1 + Math.sin(index * 2.7 + splash.seed) * 0.16;
    const x = splash.x + Math.cos(angle) * radius * 1.18 * wobble;
    const y = splash.y + Math.sin(angle) * radius * 0.42 * wobble;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.restore();
}

function createSurfaceController(target, initialState) {
  if (surfaceControllers.has(target)) {
    const existing = surfaceControllers.get(target);
    existing.update(initialState);
    return existing;
  }

  if (activeSurfaceController && !activeSurfaceController.target.isConnected) {
    activeSurfaceController.destroy();
    activeSurfaceController = null;
  }

  const effectsCanvas = target.querySelector('[data-water-surface-canvas]');
  const shaderCanvas = target.querySelector('[data-water-shader]');
  const sphereElement = target.querySelector('.backdrop-water-sphere');
  const context = effectsCanvas?.getContext('2d', { alpha: true });
  if (!effectsCanvas || !context) return null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = {
    active: false,
    initialized: false,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    previousX: 0,
    previousY: 0,
    velocityX: 0,
    velocityY: 0,
    lastInputAt: 0
  };
  const splashes = [];
  const droplets = [];
  const trailPoints = [];
  const pointerRipples = [];
  const rootState = { ...initialState };
  let rootRect = target.getBoundingClientRect();
  let cssWidth = 1;
  let cssHeight = 1;
  let pixelRatio = 1;
  let frameId = 0;
  let lastFrameAt = 0;
  let lastShaderRenderAt = 0;
  let destroyed = false;
  let reduced = reducedMotion.matches;
  let lastTrailX = 0;
  let lastTrailY = 0;
  let lastRippleX = 0;
  let lastRippleY = 0;
  let lastRippleAt = 0;
  let rippleInitialized = false;

  const shader = shaderCanvas ? createWaterShaderRenderer(shaderCanvas, {
    root: target,
    sphereElement,
    reducedMotion: reduced,
    state: shaderState(initialState),
    onReady: () => {
      target.classList.add('webgl-water-ready');
      target.classList.remove('water-shader-fallback');
    },
    onFailure: () => {
      target.classList.remove('webgl-water-ready');
      target.classList.add('water-shader-fallback');
    }
  }) : null;

  if (!shader) target.classList.add('water-shader-fallback');

  const resize = () => {
    if (destroyed) return;
    rootRect = target.getBoundingClientRect();
    cssWidth = Math.max(1, target.clientWidth || rootRect.width);
    cssHeight = Math.max(1, target.scrollHeight || rootRect.height);
    pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1 : 1.25);
    effectsCanvas.width = Math.round(cssWidth * pixelRatio);
    effectsCanvas.height = Math.round(cssHeight * pixelRatio);
    effectsCanvas.style.width = `${cssWidth}px`;
    effectsCanvas.style.height = `${cssHeight}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    shader?.resize();
  };

  const pointFromEvent = (event) => {
    rootRect = target.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rootRect.left, 0, cssWidth),
      y: clamp(event.clientY - rootRect.top, 0, cssHeight)
    };
  };

  const spawnSplash = (point) => {
    const startedAt = now();
    const seed = Math.random() * Math.PI * 2;
    splashes.push({ x: point.x, y: point.y, startedAt, duration: 260, seed });
    if (splashes.length > 8) splashes.shift();
    for (let index = 0; index < 22; index += 1) {
      const angle = Math.PI + Math.random() * Math.PI;
      const speed = 150 + Math.random() * 360;
      droplets.push({
        x: point.x,
        y: point.y,
        previousX: point.x,
        previousY: point.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 180 - Math.random() * 210,
        gravity: 680 + Math.random() * 260,
        radius: 1.2 + Math.random() * 3.1,
        alpha: 0.88,
        bornAt: startedAt,
        life: 760 + Math.random() * 420,
        impactY: point.y + 16 + Math.random() * 30,
        landed: false
      });
    }
    if (droplets.length > 90) droplets.splice(0, droplets.length - 90);
    shader?.addImpulse({ x: point.x, y: point.y, radius: 54, strength: 0.3 });
  };

  const recordTrailPoint = (timestamp) => {
    if (reduced || !pointer.active) return;
    const distance = Math.hypot(pointer.x - lastTrailX, pointer.y - lastTrailY);
    if (distance < 1.4) return;
    trailPoints.push({
      x: pointer.x,
      y: pointer.y,
      bornAt: timestamp,
      duration: 760 + Math.random() * 260,
      size: 1.1 + Math.min(2.6, distance * 0.06)
    });
    lastTrailX = pointer.x;
    lastTrailY = pointer.y;
    if (trailPoints.length > 90) trailPoints.splice(0, trailPoints.length - 90);
  };

  const drawTrail = (context, timestamp) => {
    while (trailPoints.length && timestamp - trailPoints[0].bornAt > trailPoints[0].duration) trailPoints.shift();
    if (trailPoints.length < 2) return false;
    const first = trailPoints[0];
    const last = trailPoints[trailPoints.length - 1];
    const age = clamp((timestamp - first.bornAt) / first.duration, 0, 1);
    const gradient = context.createLinearGradient(first.x, first.y, last.x, last.y);
    gradient.addColorStop(0, 'rgba(70, 199, 231, 0)');
    gradient.addColorStop(.32, `rgba(75, 218, 242, ${0.16 * (1 - age)})`);
    gradient.addColorStop(.76, `rgba(113, 240, 255, ${0.58 * (1 - age * .72)})`);
    gradient.addColorStop(1, 'rgba(218, 255, 255, .92)');

    context.save();
    context.globalCompositeOperation = 'screen';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < trailPoints.length - 1; index += 1) {
      const current = trailPoints[index];
      const next = trailPoints[index + 1];
      const midpointX = (current.x + next.x) * .5;
      const midpointY = (current.y + next.y) * .5;
      context.quadraticCurveTo(current.x, current.y, midpointX, midpointY);
    }
    context.lineTo(last.x, last.y);
    context.strokeStyle = gradient;
    context.lineWidth = 4.8;
    context.globalAlpha = .18;
    context.shadowColor = 'rgba(72, 213, 248, .72)';
    context.shadowBlur = 14;
    context.stroke();
    context.shadowBlur = 0;
    context.globalAlpha = 1;
    context.lineWidth = 1.8;
    context.strokeStyle = gradient;
    context.stroke();

    if (pointer.active) {
      const pulse = 0.78 + Math.sin(timestamp * .012) * .16;
      const head = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 22 * pulse);
      head.addColorStop(0, 'rgba(239, 255, 255, .9)');
      head.addColorStop(.16, 'rgba(119, 241, 255, .68)');
      head.addColorStop(1, 'rgba(49, 198, 236, 0)');
      context.fillStyle = head;
      context.beginPath();
      context.arc(pointer.x, pointer.y, 22 * pulse, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    return true;
  };

  const emitPointerRipple = (timestamp) => {
    if (reduced || !pointer.active) return false;
    const distance = Math.hypot(pointer.x - lastRippleX, pointer.y - lastRippleY);
    const shouldEmit = !rippleInitialized || (distance >= 18 && timestamp - lastRippleAt >= 36);
    if (!shouldEmit) return false;

    const speed = Math.hypot(pointer.velocityX, pointer.velocityY);
    pointerRipples.push({
      x: pointer.x,
      y: pointer.y,
      startedAt: timestamp,
      duration: 820 + speed * 280,
      startRadius: 4,
      maxRadius: 54 + speed * 84,
      strength: 0.08 + speed * 0.08
    });
    if (pointerRipples.length > 36) pointerRipples.splice(0, pointerRipples.length - 36);
    lastRippleX = pointer.x;
    lastRippleY = pointer.y;
    lastRippleAt = timestamp;
    rippleInitialized = true;
    shader?.addImpulse({
      x: pointer.x,
      y: pointer.y,
      radius: 22 + speed * 24,
      strength: 0.07 + speed * 0.08
    });
    return true;
  };

  const drawPointerRipples = (context, timestamp) => {
    if (!pointerRipples.length) return false;
    let hasEffects = false;
    context.save();
    context.globalCompositeOperation = 'screen';
    context.lineCap = 'round';
    for (let index = pointerRipples.length - 1; index >= 0; index -= 1) {
      const ripple = pointerRipples[index];
      const progress = clamp((timestamp - ripple.startedAt) / ripple.duration, 0, 1);
      if (progress >= 1) {
        pointerRipples.splice(index, 1);
        continue;
      }
      hasEffects = true;
      const fade = 1 - progress;
      const eased = 1 - (1 - progress) * (1 - progress);
      const radius = ripple.startRadius + (ripple.maxRadius - ripple.startRadius) * eased;
      const verticalScale = 0.42 + progress * 0.12;
      context.beginPath();
      context.ellipse(ripple.x, ripple.y, radius, radius * verticalScale, 0, 0, Math.PI * 2);
      context.strokeStyle = `rgba(143, 239, 255, ${0.72 * fade})`;
      context.lineWidth = 1.35 + fade * 1.15;
      context.shadowColor = `rgba(52, 204, 242, ${0.64 * fade})`;
      context.shadowBlur = 11 + fade * 7;
      context.stroke();

      if (progress < 0.46) {
        context.beginPath();
        context.ellipse(ripple.x, ripple.y, radius * 0.62, radius * verticalScale * 0.62, 0, 0, Math.PI * 2);
        context.strokeStyle = `rgba(224, 255, 255, ${0.28 * fade})`;
        context.lineWidth = 0.8 + fade * 0.45;
        context.shadowBlur = 5;
        context.stroke();
      }
    }
    context.restore();
    return hasEffects;
  };

  const drawEffects = (time, delta) => {
    context.clearRect(0, 0, cssWidth, cssHeight);
    let hasEffects = drawPointerRipples(context, time);
    hasEffects = drawTrail(context, time) || hasEffects;
    for (let index = splashes.length - 1; index >= 0; index -= 1) {
      const splash = splashes[index];
      if (time - splash.startedAt > splash.duration) {
        splashes.splice(index, 1);
        continue;
      }
      hasEffects = true;
      drawCrown(context, splash, time);
    }

    for (let index = droplets.length - 1; index >= 0; index -= 1) {
      const drop = droplets[index];
      const age = time - drop.bornAt;
      if (age > drop.life) {
        droplets.splice(index, 1);
        continue;
      }
      hasEffects = true;
      drop.previousX = drop.x;
      drop.previousY = drop.y;
      drop.x += drop.vx * delta;
      drop.y += drop.vy * delta;
      drop.vy += drop.gravity * delta;
      drop.alpha = clamp(1 - age / drop.life, 0, 1);
      if (!drop.landed && drop.vy > 0 && drop.y >= drop.impactY) {
        drop.landed = true;
        shader?.addImpulse({ x: drop.x, y: drop.impactY, radius: Math.max(12, drop.radius * 4), strength: 0.04 });
      }
      if (drop.y > cssHeight + 28) {
        droplets.splice(index, 1);
        continue;
      }
      context.save();
      context.globalAlpha = drop.alpha * 0.8;
      context.strokeStyle = 'rgba(145, 228, 255, .46)';
      context.lineWidth = Math.max(0.6, drop.radius * 0.4);
      context.beginPath();
      context.moveTo(drop.previousX, drop.previousY);
      context.lineTo(drop.x, drop.y);
      context.stroke();
      context.beginPath();
      context.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      context.fillStyle = 'rgba(205, 247, 255, .86)';
      context.shadowColor = 'rgba(76, 207, 255, .72)';
      context.shadowBlur = 8;
      context.fill();
      context.restore();
    }
    return hasEffects;
  };

  const smoothPointer = (delta) => {
    // `delta` is measured in seconds; 26 gives a responsive ~150–220 ms settle time.
    const smoothing = 1 - Math.exp(-delta * 26);
    const beforeX = pointer.x;
    const beforeY = pointer.y;
    pointer.x += (pointer.targetX - pointer.x) * smoothing;
    pointer.y += (pointer.targetY - pointer.y) * smoothing;
    pointer.velocityX = clamp((pointer.x - beforeX) / Math.max(cssWidth * delta, 1), -1, 1);
    pointer.velocityY = clamp((pointer.y - beforeY) / Math.max(cssHeight * delta, 1), -1, 1);
    return Math.hypot(pointer.targetX - pointer.x, pointer.targetY - pointer.y);
  };

  const injectTrail = (distance) => {
    if (!shader || reduced || !pointer.active || distance < 0.8) return;
    const speed = Math.hypot(pointer.velocityX, pointer.velocityY);
    const segments = clamp(Math.ceil(distance / 18), 1, 5);
    const startX = pointer.x - (pointer.targetX - pointer.x) * 0.2;
    const startY = pointer.y - (pointer.targetY - pointer.y) * 0.2;
    for (let index = 0; index < segments; index += 1) {
      const ratio = (index + 1) / segments;
      shader.addImpulse({
        x: startX + (pointer.targetX - startX) * ratio,
        y: startY + (pointer.targetY - startY) * ratio,
        radius: 13 + speed * 34,
        strength: 0.04 + speed * 0.11
      });
    }
  };

  const animate = (timestamp) => {
    frameId = 0;
    if (destroyed || !target.isConnected) return;
    const delta = lastFrameAt ? Math.min(0.04, Math.max(0.001, (timestamp - lastFrameAt) / 1000)) : 1 / 60;
    lastFrameAt = timestamp;
    const pointerDistance = reduced ? 0 : smoothPointer(delta);
    emitPointerRipple(timestamp);
    recordTrailPoint(timestamp);
    injectTrail(pointerDistance);
    shader?.setPointer({
      x: cssWidth ? pointer.x / cssWidth : 0.5,
      y: cssHeight ? pointer.y / cssHeight : 0.35,
      active: pointer.active && !reduced,
      velocityX: pointer.velocityX,
      velocityY: pointer.velocityY
    });
    const hasEffects = reduced ? false : drawEffects(timestamp, delta);
    const idleCadence = hasEffects || pointerDistance > 0.8 || timestamp - pointer.lastInputAt < 180 ? 0 : 33;
    if (shader && timestamp - lastShaderRenderAt >= idleCadence) {
      shader.render(timestamp);
      lastShaderRenderAt = timestamp;
    }
    const needsFrame = !reduced && (shader || hasEffects || pointerDistance > 0.8 || timestamp - pointer.lastInputAt < 220);
    if (needsFrame && !destroyed) frameId = requestAnimationFrame(animate);
  };

  const startAnimation = () => {
    if (!frameId && !destroyed) frameId = requestAnimationFrame(animate);
  };

  const onPointerMove = (event) => {
    if (reduced || event.pointerType === 'touch') return;
    const point = pointFromEvent(event);
    if (!pointer.initialized || Math.hypot(point.x - pointer.targetX, point.y - pointer.targetY) > 190) {
      pointer.x = point.x;
      pointer.y = point.y;
      pointer.previousX = point.x;
      pointer.previousY = point.y;
      lastTrailX = point.x;
      lastTrailY = point.y;
      trailPoints.length = 0;
      rippleInitialized = false;
      pointer.initialized = true;
    }
    pointer.targetX = point.x;
    pointer.targetY = point.y;
    pointer.active = true;
    pointer.lastInputAt = now();
    startAnimation();
  };

  const onPointerEnter = (event) => {
    rootRect = target.getBoundingClientRect();
    onPointerMove(event);
  };

  const onPointerLeave = () => {
    pointer.active = false;
    rippleInitialized = false;
    startAnimation();
  };

  const onPointerDown = (event) => {
    if (reduced || isInteractiveTarget(event.target)) return;
    const point = pointFromEvent(event);
    spawnSplash(point);
    pointer.targetX = point.x;
    pointer.targetY = point.y;
    pointer.active = true;
    pointer.lastInputAt = now();
    startAnimation();
  };

  const onScroll = () => {
    rootRect = target.getBoundingClientRect();
    shader?.resize();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      shader?.pause();
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    }
    else {
      shader?.resume();
      startAnimation();
    }
  };

  const onReducedMotionChange = (event) => {
    reduced = event.matches;
    shader?.setReducedMotion?.(reduced);
    if (reduced) {
      splashes.length = 0;
      droplets.length = 0;
      trailPoints.length = 0;
      pointerRipples.length = 0;
      rippleInitialized = false;
      pointer.active = false;
      shader?.setPointer({ active: false });
      shader?.render(now());
    } else {
      startAnimation();
    }
  };

  const update = (nextState) => {
    Object.assign(rootState, nextState);
    shader?.setState(shaderState(rootState));
    startAnimation();
  };

  const scrollContainer = target.closest('.subview-modal-body');
  const observer = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    target.removeEventListener('pointerenter', onPointerEnter);
    target.removeEventListener('pointermove', onPointerMove);
    target.removeEventListener('pointerleave', onPointerLeave);
    target.removeEventListener('pointerdown', onPointerDown);
    scrollContainer?.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.removeEventListener?.('change', onReducedMotionChange);
    observer?.disconnect();
    if (frameId) cancelAnimationFrame(frameId);
    shader?.destroy();
    target.classList.remove('webgl-water-ready');
    surfaceControllers.delete(target);
    if (activeSurfaceController?.target === target) activeSurfaceController = null;
  };

  target.addEventListener('pointerenter', onPointerEnter, { passive: true });
  target.addEventListener('pointermove', onPointerMove, { passive: true });
  target.addEventListener('pointerleave', onPointerLeave, { passive: true });
  target.addEventListener('pointerdown', onPointerDown, { passive: true });
  scrollContainer?.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange, { passive: true });
  reducedMotion.addEventListener?.('change', onReducedMotionChange);
  observer?.observe(target);
  resize();
  update(initialState);

  const controller = { target, update, destroy };
  surfaceControllers.set(target, controller);
  activeSurfaceController = controller;
  startAnimation();
  return controller;
}

function cleanupDisconnectedSurface() {
  if (activeSurfaceController && !activeSurfaceController.target.isConnected) {
    activeSurfaceController.destroy();
    activeSurfaceController = null;
  }
}

export function syncWaterVisuals(root = document) {
  const state = snapshot();
  const orbs = [];
  if (root.matches?.('[data-water-orb]')) orbs.push(root);
  root.querySelectorAll?.('[data-water-orb]').forEach((orb) => orbs.push(orb));
  orbs.forEach((orb) => {
    updateOrb(orb, state);
    bindMiniWaterInteraction(orb);
  });

  cleanupDisconnectedSurface();
  const surfaces = [];
  if (root.matches?.('[data-water-surface]')) surfaces.push(root);
  root.querySelectorAll?.('[data-water-surface]').forEach((surface) => surfaces.push(surface));
  surfaces.forEach((surface) => {
    updateWaterSurface(surface, state);
    createSurfaceController(surface, state);
  });

  updateText(document, '[data-water-used]', formatLitres(state.usedTodayLitres));
  updateText(document, '[data-water-remaining-global]', formatLitres(state.remainingLitres));
  updateText(document, '[data-water-percent-global]', `${state.remainingPercent.toFixed(1)}%`);
  updateText(document, '[data-water-plan-status]', state.planStatus);
  updateText(document, '[data-water-planned]', formatLitres(state.plannedLitres));
  document.querySelectorAll('[data-water-progress]').forEach((bar) => {
    bar.style.width = `${state.remainingPercent.toFixed(1)}%`;
  });
  document.querySelectorAll('.water-rail-card').forEach((card) => {
    card.classList.toggle('plan-conflict', state.planStatus === 'INFEASIBLE');
    card.classList.toggle('plan-feasible', state.planStatus === 'FEASIBLE');
  });
}

export function setResourcePlanPreview(result) {
  const allocations = Array.isArray(result?.allocations) ? result.allocations : [];
  resourceState.plannedLitres = allocations.reduce((sum, item) => sum + Number(item.allocatedLitres || 0), 0);
  resourceState.planStatus = result?.status || 'NOT_EVALUATED';
  resourceState.activeConflicts = Array.isArray(result?.conflicts) ? result.conflicts.length : 0;
  syncWaterVisuals(document);
}

export function setResourceWaterProfile(nextProfile = {}, provenance = 'OBSERVED · SIMULATION') {
  const dailyLimit = Number(nextProfile.dailyLimitLitres ?? resourceState.dailyLimitLitres);
  const used = Number(nextProfile.usedTodayLitres ?? resourceState.usedTodayLitres);
  resourceState.dailyLimitLitres = Math.max(0, dailyLimit);
  resourceState.usedTodayLitres = Math.max(0, used);
  resourceState.remainingLitres = Number(nextProfile.remainingLitres ?? Math.max(0, dailyLimit - used));
  resourceState.dispatchCapacityLitres = Number(nextProfile.capacityLitres ?? resourceState.dispatchCapacityLitres);
  resourceState.flowRateLitresPerMinute = Number(nextProfile.flowRateLitresPerMinute ?? resourceState.flowRateLitresPerMinute);
  resourceState.status = nextProfile.status || resourceState.status;
  resourceState.provenance = provenance;
  syncWaterVisuals(document);
}

export function getResourceWaterState() {
  return snapshot();
}
