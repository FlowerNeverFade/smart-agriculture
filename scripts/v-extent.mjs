/** Report plant-pixel vertical extent (top/bottom rows) + green fraction for a PNG. Usage: node scripts/v-extent.mjs <png> */
import { readFileSync } from 'node:fs';
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const png = process.argv[2];
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
  const W = img.width, H = img.height;
  const isPlant = (r, g, b) => (g > r * 1.02 && g > b * 1.05 && g > 55) || (r > 100 && r > g * 1.3 && b < 90);
  let top = -1, bottom = -1, plantCount = 0;
  let rowCount = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    for (let px = 0; px < W; px++) {
      const i = (y * W + px) * 4;
      if (isPlant(d[i], d[i + 1], d[i + 2])) {
        plantCount++; rowCount[y]++;
        if (top < 0) top = y;
        bottom = y;
      }
    }
  }
  return { W, H, top, bottom, plantCount, frac: plantCount / (W * H), rowSample: rowCount.filter((_, i) => i % 40 === 0) };
}, { b64 });
console.log(`size=${out.W}x${out.H}`);
console.log(`plant top row=${out.top} (${(out.top / out.H * 100).toFixed(1)}%)  bottom=${out.bottom} (${(out.bottom / out.H * 100).toFixed(1)}%)  height=${out.bottom - out.top}px (${((out.bottom - out.top) / out.H * 100).toFixed(1)}% of frame)`);
console.log(`plant pixel fraction=${(out.frac * 100).toFixed(1)}%`);
console.log('rows(step40): ' + out.rowSample.join(','));
await browser.close();
