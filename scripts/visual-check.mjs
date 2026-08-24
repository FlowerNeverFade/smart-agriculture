/**
 * Headless-Chrome smoke test for the 3D field scene.
 * Loads scenario-replay for plot-a01, waits for the WebGL canvas, reports
 * console errors / page errors / renderer state, and screenshots the canvas.
 * Usage: node scripts/visual-check.mjs
 */
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const url = 'http://localhost:3000/index.html?dbg3d=1#view=scenario-replay&plotId=plot-a01';
const errors = [];
const consoleMsgs = [];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
// probe WebGL availability in this headless browser
const glProbe = await page.evaluate(async () => {
  const c = document.createElement('canvas');
  const out = {};
  // direct probe of createPotScene
  try {
    const THREE = await import('/vendor/three.module.min.js');
    const T = THREE.default || THREE;
    const cv = document.createElement('canvas');
    let renderer = null, err = null;
    try { renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch (e) { err = `ctor: ${e.message}`; }
    out.rendererCtor = renderer ? 'OK' : err || 'throw-null';
    if (renderer) {
      out.ctx = renderer.getContext() ? 'YES' : 'NO';
      renderer.dispose();
    }
    const mod = await import('/js/three-pot.js');
    out.crops = {};
    for (const cc of ['tomato', 'cucumber', 'strawberry', 'pepper']) {
      const cv2 = document.createElement('canvas');
      const inst = await mod.createPotScene(cv2, { cropCode: cc });
      out.crops[cc] = inst && typeof inst.setScenario === 'function' ? 'OK' : 'NULL';
      if (inst) { inst.dispose(); }
    }
  } catch (e) { out.createPotScene = `ERR: ${e.message} ${(e.stack || '').split('\n').slice(0, 3).join(' | ')}`; }
  return out;
});
// wait for canvas to become visible (pot3d success) OR 8s timeout
let state = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 80; i++) {
    const c = document.querySelector('[data-role="pot-canvas"]');
    const s = document.querySelector('[data-role="pot-scene"]');
    if (c && c.style.display === 'block') {
      return { mode: 'webgl', canvasW: c.width, canvasH: c.height, svg: s ? s.style.display : null };
    }
    if (s && s.style.display === 'none') break; // failed path already resolved
    await wait(100);
  }
  const c = document.querySelector('[data-role="pot-canvas"]');
  const s = document.querySelector('[data-role="pot-scene"]');
  return { mode: 'unknown', canvasDisplay: c ? c.style.display : null, svgDisplay: s ? s.style.display : null };
});
await page.waitForTimeout(2500); // let a few frames render

// pull a screenshot of the pot stage
// geometry + animation diagnostics
const diag = await page.evaluate(() => {
  const c = document.querySelector('[data-role="pot-canvas"]');
  const stage = document.querySelector('[data-role="pot-stage"]');
  const s = document.querySelector('[data-role="pot-scene"]');
  const r = c ? c.getBoundingClientRect() : null;
  return {
    canvasBuffer: c ? [c.width, c.height] : null,
    canvasCss: r ? [Math.round(r.width), Math.round(r.height)] : null,
    cssDisplay: c ? getComputedStyle(c).display : null,
    svgDisplay: s ? getComputedStyle(s).display : null,
    svgInline: s ? s.style.display : null,
    stage: stage ? [Math.round(stage.getBoundingClientRect().width), Math.round(stage.getBoundingClientRect().height)] : null,
    hidden: document.hidden,
  };
});
const canvasEl = await page.$('[data-role="pot-canvas"]');
if (canvasEl) { try { await canvasEl.screenshot({ path: 'artifacts/field-canvas.png' }); } catch (e) { errors.push(`SHOT0: ${e.message}`); } }
// raw framebuffer readout (preserveDrawingBuffer via ?dbg3d=1)
const grabFB = async (name, settleMs = 1800) => {
  await page.waitForTimeout(settleMs);
  const fb = await page.evaluate(() => {
    const c = document.querySelector('[data-role="pot-canvas"]');
    if (!c) return null;
    try { return c.toDataURL('image/png'); } catch (e) { return `ERR:${e.message}`; }
  });
  if (fb && !String(fb).startsWith('ERR') && String(fb).startsWith('data:image')) {
    const b64 = String(fb).split(',')[1];
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`artifacts/fb-${name}.png`, Buffer.from(b64, 'base64'));
  } else if (fb) console.log(`FB_ERROR(${name}): ` + fb);
};
await grabFB('normal', 600);
// click through scenario buttons and capture each
const scenBtns = await page.$$('.sr-scenario-btn');
for (const btn of scenBtns) {
  const code = await btn.getAttribute('data-scenario');
  if (!code) continue;
  try {
    await btn.click();
    // rAF frame-rate probe to understand headless blend speed
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 > 1000) res(n); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
    const cls = await page.evaluate(() => {
      const s = document.querySelector('[data-role="pot-scene"]');
      const b = document.querySelector('[data-role="pot-badge"]');
      return { cls: s ? s.className : null, badge: b ? b.textContent : null };
    });
    console.log(`SCEN(${code}) fps=${fps} cls=${cls.cls} badge=${cls.badge}`);
    await grabFB(code.toLowerCase(), 5000);
  } catch (e) { errors.push(`SCEN(${code}): ${e.message}`); }
}
const box = await canvasEl.boundingBox();
if (box) {
  const midY = box.y + box.height / 2;
  try { await page.screenshot({ path: 'artifacts/clip-top.png', clip: { x: box.x, y: box.y, width: box.width, height: box.height / 2 } }); } catch (e) { errors.push(`CLIPT: ${e.message}`); }
  try { await page.screenshot({ path: 'artifacts/clip-bottom.png', clip: { x: box.x, y: midY, width: box.width, height: box.height / 2 } }); } catch (e) { errors.push(`CLIPB: ${e.message}`); }
}
const el = await page.$('[data-role="pot-stage"]');
if (el) { try { await el.screenshot({ path: 'artifacts/field-scene.png' }); } catch (e) { errors.push(`SHOT1: ${e.message}`); } }
try { await page.screenshot({ path: 'artifacts/field-page.png', fullPage: false }); } catch (e) { errors.push(`SHOT2: ${e.message}`); }

console.log(JSON.stringify({ url, state, diag, glProbe, errors, console: consoleMsgs.slice(0, 40) }, null, 2));
await browser.close();
