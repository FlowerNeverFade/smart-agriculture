import { MOCK_DATA } from './mock-data.js?v=20260824-module-v5';

const profile = MOCK_DATA?.resourceProfile || {
  dailyLimitLitres: 5000,
  usedTodayLitres: 1240,
  remainingLitres: 3760,
  capacityLitres: 900,
  flowRateLitresPerMinute: 18,
  activeConflicts: 0,
  status: 'FEASIBLE'
};
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

function bindWaterInteraction(target) {
  if (target.dataset.waterFxBound === 'true') return;
  const canvas = target.querySelector('[data-water-canvas], [data-water-surface-canvas]');
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  target.dataset.waterFxBound = 'true';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isWindowSurface = target.hasAttribute('data-water-surface');
  const ripples = [];
  const droplets = [];
  let animationFrame = 0;
  let lastPointerAt = 0;
  let cssWidth = 1;
  let cssHeight = 1;

  const resize = () => {
    const rect = target.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const animate = () => {
    animationFrame = 0;
    context.clearRect(0, 0, cssWidth, cssHeight);

    for (let index = ripples.length - 1; index >= 0; index -= 1) {
      const ripple = ripples[index];
      ripple.radius += ripple.speed;
      ripple.alpha -= isWindowSurface ? 0.012 : 0.018;
      if (ripple.alpha <= 0) {
        ripples.splice(index, 1);
        continue;
      }
      context.beginPath();
      context.ellipse(ripple.x, ripple.y, ripple.radius, ripple.radius * 0.42, 0, 0, Math.PI * 2);
      context.strokeStyle = `rgba(149, 224, 255, ${ripple.alpha})`;
      context.lineWidth = isWindowSurface ? 1.6 : 1.2;
      context.stroke();
    }

    for (let index = droplets.length - 1; index >= 0; index -= 1) {
      const drop = droplets[index];
      drop.x += drop.vx;
      drop.y += drop.vy;
      drop.vy += 0.085;
      drop.alpha -= isWindowSurface ? 0.014 : 0.022;
      if (drop.alpha <= 0 || drop.y > cssHeight + 8) {
        droplets.splice(index, 1);
        continue;
      }
      context.beginPath();
      context.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(126, 215, 255, ${drop.alpha})`;
      context.shadowBlur = isWindowSurface ? 12 : 8;
      context.shadowColor = 'rgba(79, 195, 247, .65)';
      context.fill();
      context.shadowBlur = 0;
    }

    if ((ripples.length || droplets.length) && target.isConnected) {
      animationFrame = requestAnimationFrame(animate);
    }
  };

  const startAnimation = () => {
    if (!animationFrame) animationFrame = requestAnimationFrame(animate);
  };

  const pointFromEvent = (event) => {
    const rect = target.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  target.addEventListener('pointermove', (event) => {
    if (reducedMotion.matches || event.pointerType === 'touch') return;
    const now = performance.now();
    if (now - lastPointerAt < 55) return;
    lastPointerAt = now;
    const point = pointFromEvent(event);
    ripples.push({ ...point, radius: isWindowSurface ? 5 : 3, alpha: isWindowSurface ? 0.34 : 0.42, speed: isWindowSurface ? 1.45 : 0.95 });
    if (ripples.length > (isWindowSurface ? 26 : 8)) ripples.shift();
    startAnimation();
  });

  target.addEventListener('pointerdown', (event) => {
    if (reducedMotion.matches) return;
    const point = pointFromEvent(event);
    ripples.push({ ...point, radius: isWindowSurface ? 8 : 5, alpha: 0.72, speed: isWindowSurface ? 2.5 : 1.8 });
    const count = isWindowSurface ? 22 : (target.dataset.waterSize === 'mini' ? 7 : 13);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.PI + Math.random() * Math.PI;
      const velocity = 1.2 + Math.random() * (isWindowSurface ? 4.5 : (target.dataset.waterSize === 'mini' ? 1.7 : 3.2));
      droplets.push({
        x: point.x,
        y: point.y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 0.8,
        radius: 1 + Math.random() * (isWindowSurface ? 3.1 : 2.2),
        alpha: 0.85
      });
    }
    startAnimation();
  });

  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(target);
  else window.addEventListener('resize', resize, { passive: true });
}

export function syncWaterVisuals(root = document) {
  const state = snapshot();
  const orbs = [];
  if (root.matches?.('[data-water-orb]')) orbs.push(root);
  root.querySelectorAll?.('[data-water-orb]').forEach((orb) => orbs.push(orb));
  orbs.forEach((orb) => {
    updateOrb(orb, state);
    bindWaterInteraction(orb);
  });

  const surfaces = [];
  if (root.matches?.('[data-water-surface]')) surfaces.push(root);
  root.querySelectorAll?.('[data-water-surface]').forEach((surface) => surfaces.push(surface));
  surfaces.forEach((surface) => {
    updateWaterSurface(surface, state);
    bindWaterInteraction(surface);
  });

  root.querySelectorAll?.('.resource-ops').forEach((panel) => {
    panel.style.setProperty('--water-level', `${state.remainingPercent.toFixed(1)}%`);
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
