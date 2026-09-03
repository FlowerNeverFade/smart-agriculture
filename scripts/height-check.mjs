/**
 * Check stable dimensions of the current plot card and detail chart.
 * Usage: node scripts/height-check.mjs <plotId> [base-url]
 */
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const plotId = process.argv[2] || 'plot-a01';
const baseUrl = (process.argv[3] || process.env.WEB_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const errors = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => {
  sessionStorage.setItem('agriloop_session_mode', 'demo');
  sessionStorage.setItem('agriloop_user', JSON.stringify({ username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员' }));
});
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

try {
  await page.goto(`${baseUrl}/index.html#view=dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const card = page.locator(`[data-plot-card="${plotId}"], [data-plot-card]`).first();
  await card.waitFor({ state: 'visible', timeout: 15_000 });
  const cardBefore = await card.boundingBox();
  await card.click();
  await page.waitForSelector('.plot-detail-dialog', { timeout: 15_000 });
  const detail = await page.locator('.plot-detail-dialog').boundingBox();
  const chart = await page.locator('.plot-simulation-chart').boundingBox();
  const result = {
    plotId,
    cardHeight: Math.round(cardBefore?.height || 0),
    dialogHeight: Math.round(detail?.height || 0),
    chartWidth: Math.round(chart?.width || 0),
    chartHeight: Math.round(chart?.height || 0),
    errors
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.cardHeight < 120 || result.dialogHeight < 300 || result.chartWidth < 200 || result.chartHeight < 120 || errors.length) process.exitCode = 1;
} catch (error) {
  console.error(`height check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
