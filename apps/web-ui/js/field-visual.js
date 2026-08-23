const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
let cleanupActiveFieldSandbox = null;

function relativePoint(event, root) {
  const rect = root.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height)
  };
}

function drawLeaf(context, particle) {
  const alpha = Math.max(0, particle.life);
  context.save();
  context.translate(particle.x, particle.y);
  context.rotate(particle.rotation);
  context.scale(1, .62);
  context.beginPath();
  context.ellipse(0, 0, particle.size, particle.size * .58, 0, 0, Math.PI * 2);
  context.fillStyle = `rgba(103, 232, 156, ${alpha * .56})`;
  context.shadowColor = `rgba(67, 255, 150, ${alpha * .8})`;
  context.shadowBlur = 12;
  context.fill();
  context.restore();
}

function drawSprout(context, burst) {
  const progress = clamp(1 - burst.life, 0, 1);
  const alpha = Math.max(0, burst.life);
  const radius = 12 + progress * 78;

  context.save();
  context.strokeStyle = `rgba(98, 232, 151, ${alpha * .7})`;
  context.lineWidth = 1.4;
  context.shadowColor = `rgba(74, 255, 149, ${alpha})`;
  context.shadowBlur = 16;
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
    context.fillStyle = `rgba(177, 247, 203, ${alpha * .72})`;
    context.fill();
  });
  context.restore();
}

export function initFieldSandbox(root) {
  if (!root || root.dataset.fieldFxBound === 'true') return;
  cleanupActiveFieldSandbox?.();
  const canvas = root.querySelector('[data-field-effects]');
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;

  root.dataset.fieldFxBound = 'true';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const trail = [];
  const bursts = [];
  let frameId = 0;
  let lastTime = performance.now();
  let lastSpawnAt = 0;
  let previousPoint = null;
  let cssWidth = 1;
  let cssHeight = 1;

  const resize = () => {
    const rect = root.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, root.scrollHeight, rect.height);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const animate = (time) => {
    const delta = Math.min(40, time - lastTime || 16);
    lastTime = time;
    context.clearRect(0, 0, cssWidth, cssHeight);

    for (let index = trail.length - 1; index >= 0; index -= 1) {
      const particle = trail[index];
      particle.life -= delta / particle.duration;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      if (particle.life <= 0) {
        trail.splice(index, 1);
        continue;
      }

      if (particle.kind === 'leaf') {
        drawLeaf(context, particle);
      } else {
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
        context.fillStyle = `rgba(190, 255, 216, ${particle.life * .68})`;
        context.shadowColor = 'rgba(77, 255, 156, .85)';
        context.shadowBlur = 11;
        context.fill();
      }
    }

    if (trail.length > 1) {
      context.save();
      context.beginPath();
      context.moveTo(trail[0].x, trail[0].y);
      for (let index = 1; index < trail.length; index += 1) {
        context.lineTo(trail[index].x, trail[index].y);
      }
      const gradient = context.createLinearGradient(trail[0].x, trail[0].y, trail.at(-1).x, trail.at(-1).y);
      gradient.addColorStop(0, 'rgba(56, 193, 112, 0)');
      gradient.addColorStop(1, 'rgba(121, 255, 175, .46)');
      context.strokeStyle = gradient;
      context.lineWidth = 1.2;
      context.shadowColor = 'rgba(69, 242, 140, .65)';
      context.shadowBlur = 10;
      context.stroke();
      context.restore();
    }

    for (let index = bursts.length - 1; index >= 0; index -= 1) {
      const burst = bursts[index];
      burst.life -= delta / burst.duration;
      if (burst.life <= 0) {
        bursts.splice(index, 1);
        continue;
      }
      drawSprout(context, burst);
    }

    if (trail.length || bursts.length) {
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
    const now = performance.now();
    const elapsed = now - lastSpawnAt;
    if (elapsed < 28) return;
    const point = relativePoint(event, root);
    const distance = previousPoint ? Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) : 20;
    if (distance < 5) return;
    if (distance > 110 || elapsed > 180) trail.length = 0;
    lastSpawnAt = now;
    previousPoint = point;

    trail.push({
      ...point,
      vx: (Math.random() - .5) * .025,
      vy: -.012 - Math.random() * .012,
      size: 1.7 + Math.random() * 1.7,
      rotation: Math.random() * Math.PI,
      life: 1,
      duration: 900 + Math.random() * 450,
      kind: trail.length % 4 === 0 ? 'leaf' : 'dew'
    });
    if (trail.length > 44) trail.splice(0, trail.length - 44);
    ensureAnimation();
  };

  const onClick = (event) => {
    if (reducedMotion) return;
    const point = relativePoint(event, root);
    bursts.push({
      ...point,
      life: 1,
      duration: 1050,
      droplets: Array.from({ length: 9 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 9 + Math.random() * .25;
        const speed = 22 + Math.random() * 35;
        return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 22, size: 1.4 + Math.random() * 1.7 };
      })
    });
    ensureAnimation();
  };

  root.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('click', onClick);
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  resize();
  cleanupActiveFieldSandbox = () => {
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('click', onClick);
    observer.disconnect();
    if (frameId) cancelAnimationFrame(frameId);
    cleanupActiveFieldSandbox = null;
  };
}
