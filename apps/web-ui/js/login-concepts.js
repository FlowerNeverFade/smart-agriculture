const body = document.body;
const scene = document.querySelector('.scene');
const growthFrames = [...document.querySelectorAll('[data-growth-frame]')];
const growthProgress = document.getElementById('growthProgress');
const growthStatus = document.getElementById('growthStatus');
const motionToggle = document.getElementById('motionToggle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const GROWTH_DURATION = 9200;
const stageLabels = ['土壤苏醒', '种子萌发', '幼苗破土', '晨光生长', '农场已就绪'];

let animationFrame = 0;
let cycleStartedAt = 0;
let pausedAt = 0;
let hiddenAt = 0;
let isPaused = false;
let lastProgress = reducedMotion ? 1 : 0;

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function renderGrowth(progress) {
  lastProgress = Math.max(0, Math.min(1, progress));
  const timeline = lastProgress * (growthFrames.length - 1);
  const currentIndex = Math.min(growthFrames.length - 1, Math.floor(timeline));
  const nextIndex = Math.min(growthFrames.length - 1, currentIndex + 1);
  const blend = smoothStep(timeline - currentIndex);

  growthFrames.forEach((frame, index) => {
    let opacity = 0;
    if (index === currentIndex) opacity = 1 - blend;
    if (index === nextIndex) opacity = Math.max(opacity, blend);
    if (currentIndex === nextIndex && index === currentIndex) opacity = 1;
    frame.style.opacity = String(opacity);

    const zoom = 1.055 + lastProgress * .028 + index * .0015;
    const travelX = -.65 + lastProgress * 1.3;
    const travelY = .32 - lastProgress * .64;
    frame.style.transform = `translate3d(calc(var(--pointer-x) + ${travelX}%), calc(var(--pointer-y) + ${travelY}%), 0) scale(${zoom})`;
    frame.style.filter = `brightness(${.76 + lastProgress * .18}) saturate(${.88 + lastProgress * .14})`;
  });

  const value = Math.round(lastProgress * 100);
  const labelIndex = Math.min(stageLabels.length - 1, Math.floor(lastProgress * stageLabels.length));
  growthProgress.value = value;
  growthProgress.textContent = `${value}%`;
  growthStatus.textContent = stageLabels[labelIndex];
  body.classList.toggle('is-ready', lastProgress >= .54);

  if (lastProgress >= 1) {
    motionToggle.textContent = '重播动画';
    motionToggle.setAttribute('aria-label', '重播生长动画');
  } else if (isPaused) {
    motionToggle.textContent = '继续动画';
    motionToggle.setAttribute('aria-label', '继续生长动画');
  } else {
    motionToggle.textContent = '暂停动画';
    motionToggle.setAttribute('aria-label', '暂停生长动画');
  }
}

function growthTick(now) {
  if (!cycleStartedAt) cycleStartedAt = now;
  if (isPaused || document.hidden) return;

  const progress = Math.min(1, (now - cycleStartedAt) / GROWTH_DURATION);
  renderGrowth(progress);
  if (progress < 1) animationFrame = requestAnimationFrame(growthTick);
}

function startGrowth() {
  cancelAnimationFrame(animationFrame);
  cycleStartedAt = 0;
  pausedAt = 0;
  isPaused = false;
  renderGrowth(reducedMotion ? 1 : 0);
  if (!reducedMotion) animationFrame = requestAnimationFrame(growthTick);
}

motionToggle.addEventListener('click', () => {
  if (lastProgress >= 1) {
    startGrowth();
    return;
  }

  if (isPaused) {
    isPaused = false;
    cycleStartedAt += performance.now() - pausedAt;
    animationFrame = requestAnimationFrame(growthTick);
  } else {
    isPaused = true;
    pausedAt = performance.now();
    cancelAnimationFrame(animationFrame);
  }
  renderGrowth(lastProgress);
});

window.addEventListener('pointermove', (event) => {
  if (reducedMotion || event.pointerType === 'touch') return;
  const x = ((event.clientX / window.innerWidth) - .5) * -8;
  const y = ((event.clientY / window.innerHeight) - .5) * -5;
  scene.style.setProperty('--pointer-x', `${x}px`);
  scene.style.setProperty('--pointer-y', `${y}px`);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (reducedMotion || lastProgress >= 1) return;
  if (document.hidden) {
    hiddenAt = performance.now();
    cancelAnimationFrame(animationFrame);
  } else if (!isPaused) {
    cycleStartedAt += performance.now() - hiddenAt;
    animationFrame = requestAnimationFrame(growthTick);
  }
});

window.addEventListener('pagehide', () => cancelAnimationFrame(animationFrame));

Promise.all(growthFrames.map((frame) => frame.decode().catch(() => null))).then(startGrowth);
