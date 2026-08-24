/** Time the homepage boot: DOMContentLoaded -> init() resolution, and instrument the heavy init phases.
 *  Usage: node scripts/boot-timing.mjs
 */
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const url = 'http://localhost:3000/';
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

// Inject a demo session (matches readSession()/saveSession() shape) before the app boots
await page.addInitScript(() => {
  localStorage.setItem('agriloop_session_mode', 'demo');
  localStorage.setItem('agriloop_user', JSON.stringify({ username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员', avatar: '👑' }));
});

const net = [];
page.on('response', (r) => { if (r.url().startsWith('http://localhost:3000')) net.push({ url: r.url().replace('http://localhost:3000', ''), status: r.status() }); });
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') net.push({ log: `[${m.type()}] ${m.text().slice(0, 120)}` }); });

const perf = await page.evaluate(() => performance.getEntriesByType('navigation').map(e => ({ dcl: e.domContentLoadedEventEnd, load: e.loadEventEnd })));
const t0 = Date.now();

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
const dcl = Date.now() - t0;
await new Promise(r => setTimeout(r, 6000)); // let init + renders settle
const afterSettle = Date.now() - t0;

// instrument: how long app init took (window key if exposed) + network timing
const diag = await page.evaluate(() => ({
  hasWindowApp: !!window.__agriApp,
  pathname: window.location.pathname,
  lastHash: window.location.hash,
  canvases: [...document.querySelectorAll('canvas')].map(c => c.width + 'x' + c.height),
  webglBgs: document.querySelectorAll('#riumBackground canvas, [data-field-effects] canvas').length,
  plotListChildren: document.querySelectorAll('#plotListContainer > *').length,
  plotCards: document.querySelectorAll('.plot-card').length,
  feedItems: document.querySelectorAll('.feed-item').length,
  loadingMaskPresent: !!document.querySelector('.app-loading-mask, .loading-mask, [class*=loading]'),
  bodyClass: document.body.className.substring(0, 80),
  sessionMode: localStorage.getItem('agriloop_session_mode'),
  sessionUser: localStorage.getItem('agriloop_user'),
}));

console.log(JSON.stringify({ dcl, afterSettle, perf, diag, net: net.slice(0, 60) }, null, 2));
await browser.close();
