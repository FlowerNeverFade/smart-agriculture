/** Measure plant vertical extent (screen rows containing plant pixels) for normal vs drought.
 *  Usage: node scripts/height-check.mjs <plotId>
 */
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const plotId = process.argv[2] || 'plot-b01';
const url = `http://localhost:3000/index.html?dbg3d=1#view=scenario-replay&plotId=${plotId}`;
const errors = [];

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
await page.addInitScript(() => {
  localStorage.setItem('agriloop_session_mode', 'demo');
  localStorage.setItem('agriloop_user', JSON.stringify({ username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员', avatar: '👑' }));
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 80; i++) {
    const c = document.querySelector('[data-role="pot-canvas"]');
    if (c && c.style.display === 'block') return;
    await wait(100);
  }
});
await page.waitForTimeout(1500);

const grab = async () => await page.evaluate(() => {
  const c = document.querySelector('[data-role="pot-canvas"]');
  return c ? c.toDataURL('image/png') : null;
});

const measure = async (label) => {
  const fb = await grab();
  if (!fb) { console.log(`${label}: NO FB`); return; }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`artifacts/height-${label}.png`, Buffer.from(String(fb).split(',')[1], 'base64'));
};

await measure('normal');
// click drought button
const btn = await page.$('.sr-scenario-btn[data-scenario="DROUGHT"]');
if (btn) { await btn.click(); await page.waitForTimeout(5000); }
await measure('drought');

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
