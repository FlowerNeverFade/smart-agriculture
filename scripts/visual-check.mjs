/**
 * Browser smoke check for the current AgriLoop dashboard and plot detail.
 * Usage: node scripts/visual-check.mjs [base-url]
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '../.tools/node_modules/playwright-core/index.mjs';

const baseUrl = (process.argv[2] || process.env.WEB_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const outputDir = 'artifacts';
mkdirSync(outputDir, { recursive: true });
const errors = [];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  sessionStorage.setItem('agriloop_session_mode', 'demo');
  sessionStorage.setItem('agriloop_user', JSON.stringify({ username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员' }));
  sessionStorage.removeItem('agriloop_token');
});
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

try {
  await page.goto(`${baseUrl}/index.html#view=dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#app .g-header', { timeout: 15_000 });
  await page.waitForSelector('#app .manager-plot-card, #app .g-card', { timeout: 15_000 });
  const dashboard = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent?.trim() || '',
    plotCards: document.querySelectorAll('[data-plot-card], .manager-plot-card').length,
    hasBrand: Boolean(document.querySelector('.g-brand-logo')),
    hasNavigation: document.querySelectorAll('.g-nav-item').length > 0
  }));
  const plotCard = page.locator('[data-plot-card="plot-a01"], [data-plot-card]').first();
  if (await plotCard.count()) {
    await plotCard.click();
    await page.waitForSelector('.plot-detail-dialog', { timeout: 15_000 });
  }
  const detail = await page.evaluate(() => {
    const chart = document.querySelector('.plot-simulation-chart');
    const box = chart?.getBoundingClientRect();
    return {
      dialog: Boolean(document.querySelector('.plot-detail-dialog')),
      scenarioButtons: document.querySelectorAll('.plot-simulation-scenario').length,
      chartWidth: box ? Math.round(box.width) : 0,
      chartHeight: box ? Math.round(box.height) : 0,
      hasMetrics: document.querySelectorAll('.plot-detail-metric').length > 0
    };
  });
  await page.screenshot({ path: `${outputDir}/web-visual-check.png`, fullPage: false });
  const result = { url: `${baseUrl}/index.html#view=dashboard`, dashboard, detail, errors };
  console.log(JSON.stringify(result, null, 2));
  if (!dashboard.hasBrand || !dashboard.hasNavigation || dashboard.plotCards < 1
      || !detail.dialog || detail.scenarioButtons < 4 || detail.chartWidth < 200 || detail.chartHeight < 120 || errors.length) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`visual check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
