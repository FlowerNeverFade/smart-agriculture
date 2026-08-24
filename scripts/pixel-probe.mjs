/** Probe exact pixel colors at grid points of an image. Usage: node scripts/pixel-probe.mjs <png> */
import { readFileSync } from 'node:fs';
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const png = process.argv[2] || 'artifacts/field-canvas.png';
const b64 = readFileSync(png).toString('base64');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.setContent(`<canvas id="c"></canvas>`);
const out = await page.evaluate(async ({ b64 }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await new Promise((r) => { img.onload = r; });
  const c = document.getElementById('c');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height).data;
  const probe = (fx, fy) => {
    const px = Math.floor(fx * img.width), py = Math.floor(fy * img.height);
    const i = (py * img.width + px) * 4;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  };
  const m = {};
  const grid = [];
  for (const [fx, fy, label] of [
    [0.5, 0.05, 'sky-top'], [0.85, 0.1, 'sky-right'], [0.15, 0.12, 'sky-left'],
    [0.15, 0.22, 'sky-ul'], [0.3, 0.28, 'sky-uc'],
    [0.5, 0.3, 'field-far'], [0.5, 0.5, 'field-mid'], [0.5, 0.72, 'field-near'],
    [0.5, 0.92, 'bottom'], [0.1, 0.5, 'left-mid'], [0.9, 0.5, 'right-mid'],
    [0.5, 0.68, 'center-low'], [0.2, 0.85, 'near-left'], [0.8, 0.85, 'near-right'],
  ]) grid.push({ label, rgba: probe(fx, fy) });
  return { w: img.width, h: img.height, grid };
}, { b64 });
console.log(`size=${out.w}x${out.h}`);
for (const g of out.grid) console.log(`${g.label.padEnd(12)} ${g.rgba.join(',')}`);
await browser.close();
