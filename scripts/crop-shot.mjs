/** Capture the field framebuffer for a specific crop plot. Usage: node scripts/crop-shot.mjs <plotId> */
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const plotId = process.argv[2] || 'plot-b01';
const url = `http://localhost:3000/index.html?dbg3d=1#view=scenario-replay&plotId=${plotId}`;
const errors = [];

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('actuator')) errors.push(`HTTP ${r.status()}: ${r.url()}`); });

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
// wait for WebGL canvas
await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 80; i++) {
    const c = document.querySelector('[data-role="pot-canvas"]');
    if (c && c.style.display === 'block') return;
    await wait(100);
  }
});
await page.waitForTimeout(1500);
const fb = await page.evaluate(() => {
  const c = document.querySelector('[data-role="pot-canvas"]');
  if (!c) return null;
  try { return c.toDataURL('image/png'); } catch (e) { return `ERR:${e.message}`; }
});
if (fb && !String(fb).startsWith('ERR') && String(fb).startsWith('data:image')) {
  const { writeFileSync } = await import('node:fs');
  const name = String(plotId).replace(/[^a-z0-9_-]/gi, '_');
  writeFileSync(`artifacts/crop-${name}.png`, Buffer.from(String(fb).split(',')[1], 'base64'));
  console.log(`saved artifacts/crop-${name}.png`);
} else console.log('FB_ERROR: ' + fb);
console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
