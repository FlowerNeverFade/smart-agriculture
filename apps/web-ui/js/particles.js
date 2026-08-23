/**
 * AgriLoop Frontend - 全局粒子背景（OceanX 科考风，任务包 5 · 全局动效）
 * 轻量实现：低粒子数 + 距离连线 + 视口隐藏时暂停，不干扰交互（pointer-events: none）
 */
export function initParticles() {
  const canvas = document.createElement('canvas');
  canvas.className = 'agri-particles';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  let particles = [];
  let raf = 0;
  let running = true;
  const COUNT = 26;
  const LINK_DIST = 130 * DPR;

  const resize = () => {
    w = canvas.width = Math.floor(window.innerWidth * DPR);
    h = canvas.height = Math.floor(window.innerHeight * DPR);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  };

  const spawn = () => Array.from({ length: COUNT }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.3 * DPR,
    vy: (Math.random() - 0.5) * 0.3 * DPR,
    r: (Math.random() * 1.6 + 0.6) * DPR
  }));

  const tick = () => {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);
    // 粒子
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -10 || p.x > w + 10) p.vx *= -1;
      if (p.y < -10 || p.y > h + 10) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(88, 166, 255, 0.22)';
      ctx.fill();
    }
    // 邻近连线（三角计数，26 粒子可忽略性能）
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK_DIST * LINK_DIST) {
          const alpha = 0.10 * (1 - Math.sqrt(d2) / LINK_DIST);
          ctx.strokeStyle = `rgba(88, 166, 255, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(tick);
  };

  const onResize = () => {
    resize();
    particles = spawn();
  };
  const onVis = () => {
    running = !document.hidden;
    if (running) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }
  };

  resize();
  particles = spawn();
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    canvas.remove();
  };
}
