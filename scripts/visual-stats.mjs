/**
 * Rasterize a screenshot to a coarse ASCII map (color classes) so a text-only
 * model can "see" the composition without image input.
 * Usage: node scripts/visual-stats.mjs <png> [cols] [rows]
 */
import { readFileSync } from 'node:fs';
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const png = process.argv[2] || 'artifacts/field-scene.png';
const COLS = Number(process.argv[3] || 56);
const ROWS = Number(process.argv[4] || 24);
const b64 = readFileSync(png).toString('base64');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.setContent(`<canvas id="c"></canvas>`);
const out = await page.evaluate(async ({ b64, COLS, ROWS }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await new Promise((r) => { img.onload = r; });
  const c = document.getElementById('c');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height).data;
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const rows = [];
  for (let gy = 0; gy < ROWS; gy++) {
    const y = Math.floor((gy + 0.5) * img.height / ROWS);
    let line = '';
    for (let gx = 0; gx < COLS; gx++) {
      const px = Math.floor((gx + 0.5) * img.width / COLS);
      const i = (y * img.width + px) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      let ch = ' ';
      if (a > 20) {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (r > 150 && g > 130 && b < 140 && Math.abs(r - g) < 60) ch = 'y';        // warm bright (sun/light)
        else if (b > 130 && b > r * 1.05 && b > g * 1.02) ch = 'b';                  // blue sky
        else if (r > 120 && r > b * 1.6 && r > g * 1.35) ch = 'r';                   // red (fruit)
        else if (g > r * 1.12 && g > b * 1.12 && g > 60) ch = 'g';                   // green
        else if (r > 90 && g > 62 && b < 70 && r > b * 1.5) ch = 'n';                // brown soil
        else if (lum > 205) ch = 'w';                                                // near-white
        else if (lum < 42) ch = '#';                                                 // very dark
        else if (lum < 88) ch = '-';                                                 // dark grey
        else ch = '.';                                                               // mid grey / haze
      }
      line += ch;
    }
    rows.push(line);
  }
  return { w: img.width, h: img.height, rows };
}, { b64, COLS, ROWS });

const stats = {};
for (const line of out.rows) for (const ch of line) stats[ch] = (stats[ch] || 0) + 1;
console.log(`size=${out.w}x${out.h}`);
console.log(out.rows.join('\n'));
console.log(JSON.stringify(stats));
await browser.close();
