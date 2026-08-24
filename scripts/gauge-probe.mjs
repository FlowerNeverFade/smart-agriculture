/** Render risk-forecast gauge, wait for app to settle, then open via internal navigate. */
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});

async function probeTheme(theme) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.addInitScript((th) => {
    localStorage.setItem('agriloop_session_mode', 'demo');
    localStorage.setItem('agriloop_user', JSON.stringify({ username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员', avatar: '👑' }));
    localStorage.setItem('agriloop-theme', th);
  }, theme);
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // wait for home plots to render (app booted), not the modal
  await page.waitForFunction(() => document.querySelectorAll('#plotListContainer > *').length > 0, null, { timeout: 40000 });
  // open risk-forecast via the module nav link (element always present in DOM)
  const opened = await page.evaluate(() => {
    const a = document.querySelector('a[data-view="risk-forecast"]');
    if (!a) return 'no-nav-link';
    a.click();
    return 'clicked';
  });
  await page.waitForFunction(() => !!document.querySelector('[data-role="gauge"]'), null, { timeout: 20000 });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const g = document.querySelector('[data-role="gauge"]');
    const th = document.documentElement.getAttribute('data-theme');
    const canvases = g ? [...g.querySelectorAll('canvas')].map(c => c.width + 'x' + c.height) : [];
    const svg = g ? !!g.querySelector('svg') : false;
    // computed fill of the gauge value text (CSS var resolves here)
    const valueFill = (() => {
      const el = g && g.querySelector('.chart-gauge-value');
      return el ? getComputedStyle(el).fill : null;
    })();
    const rect = g ? (() => { const r = g.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(g).display }; })() : null;
    return { th, canvases, svg, hasGauge: !!g, valueFill, rect };
  });
  let shotOk = false;
  const clip = info.rect && info.rect.w > 0 ? { x: info.rect.x, y: info.rect.y, width: info.rect.w, height: info.rect.h } : null;
  if (clip) { try { await page.screenshot({ path: `artifacts/gauge-${theme}.png`, clip }); shotOk = true; } catch (e) { shotOk = String(e); } }
  await page.close();
  return { theme, info, shotOk };
}

console.log(JSON.stringify(await probeTheme('light'), null, 2));
console.log(JSON.stringify(await probeTheme('dark'), null, 2));
await browser.close();
