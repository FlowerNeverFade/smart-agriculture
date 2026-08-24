/** Report plant silhouette rows and detect the pink/red blossom ball (isolated red cluster above the bush).
 *  Usage: node scripts/plant-profile.mjs <png>
 */
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
  // classify per pixel
  const plant = (r, g, b) => !(b > 150 && b >= r && b >= g) && (g > 45 || r > 45);
  const redBall = (r, g, b) => r > 120 && r > g * 1.5 && r > b * 1.4 && b < 160;
  const sky = (r, g, b) => b > 150 && b >= r && b >= g;
  // per-row: topmost and bottommost plant pixel; count red pixels
  const rows = [];
  for (let y = 0; y < H; y++) {
    let topP = -1, botP = -1, red = 0;
    for (let px = 0; px < W; px++) {
      const i = (y * W + px) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (plant(r, g, b)) { if (topP < 0) topP = px; botP = px; }
      if (redBall(r, g, b)) red++;
    }
    rows.push({ y, topP, botP, red });
  }
  // plant belt = rows where plant pixels span > 10% width
  const belt = rows.filter(r => (r.botP - r.topP) > W * 0.10);
  const plantTop = belt.length ? belt[0].y : -1;
  const plantBot = belt.length ? belt[belt.length - 1].y : -1;
  // red cluster rows (the ball) = consecutive rows with red > 8
  const redRows = rows.filter(r => r.red > 8).map(r => r.y);
  // sky top (first row where >50% sky)
  let skyTop = -1;
  for (let y = 0; y < H; y++) {
    let skyN = 0;
    for (let px = 0; px < W; px++) { const i = (y*W+px)*4; if (sky(d[i],d[i+1],d[i+2])) skyN++; }
    if (skyN > W * 0.5) { skyTop = y; break; }
  }
  return { W, H, plantTop, plantBot, plantBeltPct: ((plantBot - plantTop) / H * 100).toFixed(1), skyTop, skyTopPct: (skyTop / H * 100).toFixed(1), redRows, redRowRange: redRows.length ? [redRows[0], redRows[redRows.length - 1]] : null, redCount: redRows.length };
}, { b64 });
console.log(`size=${out.W}x${out.H}`);
console.log(`plant-belt top=${out.plantTop} bottom=${out.plantBot} height=${out.plantBeltPct}% of frame`);
console.log(`sky starts at row ${out.skyTop} (${out.skyTopPct}% down)`);
console.log(`red/pink blob rows: ${out.redRowRange ? `rows ${out.redRowRange[0]}..${out.redRowRange[1]} (${out.redCount} rows)` : 'NONE'}`);
await browser.close();
