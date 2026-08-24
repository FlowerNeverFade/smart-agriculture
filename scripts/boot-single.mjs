/** Time home boot for a given origin URL, same conditions. Usage: node scripts/boot-single.mjs <baseUrl> <label> */
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const baseUrl = process.argv[2] || 'http://localhost:3000/';
const label = process.argv[3] || 'yyx';
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.addInitScript(() => {
  localStorage.setItem('agriloop_session_mode', 'demo');
  localStorage.setItem('agriloop_user', JSON.stringify({ username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员', avatar: '👑' }));
});

const perf0 = await page.evaluate(() => performance.now());
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
const dclMs = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? -1);
const loadMs = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.loadEventEnd ?? -1);

// measure main-thread blocking during the first 6s (busy frames)
const block = await page.evaluate(() => new Promise((res) => {
  const samples = [];
  let last = performance.now();
  const tick = (t) => {
    const delta = t - last; last = t;
    samples.push(delta);
    if (performance.now() - tickStart > 6000) res(finish(samples));
    else requestAnimationFrame(tick);
  };
  const tickStart = performance.now();
  const finish = (s) => {
    const sorted = [...s].sort((a, b) => b - a);
    const total = s.reduce((a, b) => a + b, 0);
    const blocked = s.filter(d => d > 33.4).length;
    // N biggest gaps (a single >100ms gap = main-thread stall / dropped frame)
    const maxGap = sorted[0];
    const over100 = s.filter(d => d > 100).length;
    return { frames: s.length, avg: (total / s.length).toFixed(1), maxGap: maxGap.toFixed(1), framesOver33ms: blocked, framesOver100ms: over100 };
  };
  requestAnimationFrame(tick);
}));

const diag = await page.evaluate(() => ({
  pathname: window.location.pathname,
  plotListChildren: document.querySelectorAll('#plotListContainer > *').length,
  plotIds: [...document.querySelectorAll('#plotListContainer .plot-list-item')].map(li => li.getAttribute('data-plot-id')),
  plotsCountTag: document.querySelector('#plotsCountTag')?.textContent,
  /* reclamation slots visible in farm monitor? */
  reclamationVisible: !!document.querySelector('.reclamation-slot, [data-slot], .plot-slot'),
  feedItems: document.querySelectorAll('.feed-item').length,
  webglBgs: document.querySelectorAll('#riumBackground canvas, [data-field-effects] canvas').length,
}));
console.log(JSON.stringify({ label, baseUrl, dclMs: dclMs.toFixed(0), loadMs: loadMs.toFixed(0), block, diag }, null, 2));
await browser.close();
