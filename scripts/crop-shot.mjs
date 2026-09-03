/** Capture the current plot detail view. Usage: node scripts/crop-shot.mjs <plotId> [base-url] */
import { mkdirSync } from 'node:fs';
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const plotId = process.argv[2] || 'plot-a01';
const baseUrl = (process.argv[3] || process.env.WEB_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const outputDir = 'artifacts';
mkdirSync(outputDir, { recursive: true });
const errors = [];
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(({ plot }) => {
  sessionStorage.setItem('agriloop_session_mode', 'demo');
  sessionStorage.setItem('agriloop_user', JSON.stringify({ username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员' }));
  sessionStorage.setItem('agriloop_visual_plot', plot);
}, { plot: plotId });
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

try {
  await page.goto(`${baseUrl}/index.html#view=dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector(`[data-plot-card="${plotId}"], [data-plot-card]`, { timeout: 15_000 });
  await page.locator(`[data-plot-card="${plotId}"], [data-plot-card]`).first().click();
  await page.waitForSelector('.plot-detail-dialog', { timeout: 15_000 });
  const safeId = plotId.replace(/[^a-z0-9_-]/gi, '_');
  await page.locator('.plot-detail-dialog').screenshot({ path: `${outputDir}/plot-${safeId}.png` });
  const state = await page.evaluate(() => ({
    plotTitle: document.querySelector('.plot-detail-dialog h2')?.textContent?.trim() || '',
    chart: Boolean(document.querySelector('.plot-simulation-chart')),
    metrics: document.querySelectorAll('.plot-detail-metric').length
  }));
  console.log(JSON.stringify({ plotId, state, errors }, null, 2));
  if (!state.plotTitle || !state.chart || state.metrics < 1 || errors.length) process.exitCode = 1;
} catch (error) {
  console.error(`crop shot failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
