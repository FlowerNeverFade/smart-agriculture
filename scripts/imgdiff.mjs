/** Mean per-channel difference between two images + worst region. Usage: node scripts/imgdiff.mjs a.png b.png */
import { readFileSync } from 'node:fs';
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const [a, b] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.setContent(`<canvas id="c"></canvas>`);
const out = await page.evaluate(async ({ a, b }) => {
  const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
  // decode via file:// not allowed; pass b64
  return null;
}, { a, b });
// simpler: decode locally with fresh pages of data URLs
const decode = async (path) => {
  const b64 = readFileSync(path).toString('base64');
  return await page.evaluate(async ({ b64 }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await new Promise((r) => { img.onload = r; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, d: Array.from(x.getImageData(0, 0, img.width, img.height).data) };
  }, { b64 });
};
const A = await decode(a), B = await decode(b);
const da = A.d, db = B.d;
let sum = 0, maxR = 0;
const n = da.length / 4;
const GRID = 24;
let grid = new Array(GRID).fill(0).map(() => new Array(GRID).fill(0));
for (let i = 0; i < da.length; i += 4) {
  const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
  sum += d;
  if (d > maxR) maxR = d;
  const px = i / 4;
  const gy = Math.floor(px / A.w), gx = px % A.w;
  grid[Math.min(GRID - 1, Math.floor(gy / A.h * GRID))][Math.min(GRID - 1, Math.floor(gx / A.w * GRID))] += d;
}
console.log(`mean-abs-diff=${(sum / n).toFixed(2)} max=${maxR}`);
for (const row of grid) console.log(row.map((v) => v < 60 ? '.' : v < 400 ? '-' : v < 1200 ? '+' : 'o').join(''));
await browser.close();
