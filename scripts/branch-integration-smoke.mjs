/**
 * Real-Chromium visual smoke test for the refreshed UI branch integration.
 *
 * Prerequisite:
 *   python scripts/serve-webui.py 3000
 * Usage:
 *   node scripts/branch-integration-smoke.mjs
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const playwrightCandidates = [
  join(scriptDir, '..', '.tools', 'node_modules', 'playwright-core', 'index.mjs'),
  process.env.CODEX_NODE_MODULES
    ? join(process.env.CODEX_NODE_MODULES, 'playwright-core', 'index.mjs')
    : ''
].filter(Boolean);
const playwrightPath = playwrightCandidates.find(existsSync);
if (!playwrightPath) {
  throw new Error('playwright-core not found; install it under .tools or set CODEX_NODE_MODULES');
}
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const baseUrl = (process.env.AGRILOOP_WEB_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const outputDir = 'artifacts/branch-integration';
mkdirSync(outputDir, { recursive: true });

const results = [];
const runtimeErrors = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', error => runtimeErrors.push(`PAGEERROR ${error.message}`));
page.on('console', message => {
  if (message.type() === 'error') runtimeErrors.push(`CONSOLE ${message.text()}`);
});

try {
  await page.goto(`${baseUrl}/login.html`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForSelector('#loginForm');
  await page.waitForTimeout(1_500);
  const loginState = await page.evaluate(() => {
    const canvas = document.querySelector('#ambientLiquidCanvas');
    const form = document.querySelector('#loginForm');
    const canvasBox = canvas?.getBoundingClientRect();
    const formBox = form?.getBoundingClientRect();
    return {
      canvasVisible: Boolean(canvasBox && canvasBox.width > 0 && canvasBox.height > 0),
      formVisible: Boolean(formBox && formBox.width > 0 && formBox.height > 0),
      title: document.querySelector('#pageTitle')?.textContent || ''
    };
  });
  check('独立液态登录页可见', loginState.canvasVisible && loginState.formVisible);
  check('登录页保留 feat/login-interface 文案', loginState.title.includes('数字生命'));
  await page.screenshot({ path: `${outputDir}/01-login.png`, fullPage: true });

  await page.addInitScript(() => {
    localStorage.setItem('agriloop_session_mode', 'demo');
    localStorage.setItem('agriloop_user', JSON.stringify({
      username: 'admin',
      role: 'FARM_ADMIN',
      roleLabel: '农场管理员',
      avatar: '👑'
    }));
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForSelector('#plotListContainer .plot-list-item');
  await page.waitForTimeout(1_500);
  const dashboardState = await page.evaluate(() => {
    const background = document.querySelector('#riumBackground');
    const canvas = background?.querySelector('canvas');
    const box = background?.getBoundingClientRect();
    return {
      plotCount: document.querySelectorAll('#plotListContainer .plot-list-item').length,
      backgroundVisible: Boolean(box && box.width > 0 && box.height > 0),
      hasWebglCanvas: Boolean(canvas),
      sandboxNav: Boolean(document.querySelector('[data-view="crop-sandbox"]'))
    };
  });
  check('主面板渲染三块演示地块', dashboardState.plotCount >= 3, `${dashboardState.plotCount} plots`);
  check('rium_dev 背景容器与 WebGL 画布已接入', dashboardState.backgroundVisible && dashboardState.hasWebglCanvas);
  check('微观作物沙盘使用独立导航入口', dashboardState.sandboxNav);
  await page.screenshot({ path: `${outputDir}/02-dashboard.png`, fullPage: false });

  const openModalView = async (hash, readySelector, screenshotName) => {
    await page.evaluate(nextHash => { window.location.hash = nextHash; }, hash);
    await page.waitForSelector(readySelector, { timeout: 10_000 });
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => {
      const backdrop = document.querySelector('#subviewModal');
      const card = document.querySelector('.subview-modal-card');
      const box = card?.getBoundingClientRect();
      return {
        active: backdrop?.classList.contains('active') || false,
        position: backdrop ? getComputedStyle(backdrop).position : '',
        inViewport: Boolean(box && box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight + 1 && box.right <= innerWidth + 1),
        hasRuler: document.body.textContent.includes('📐') || Boolean(document.querySelector('.subview-placeholder-banner, .subview-placeholder-icon'))
      };
    });
    check(`${hash} 使用居中弹窗`, state.active && state.position === 'fixed' && state.inViewport);
    check(`${hash} 无三角尺占位`, !state.hasRuler);
    await page.screenshot({ path: `${outputDir}/${screenshotName}`, fullPage: false });
  };

  await openModalView('#view=risk-forecast&plotId=plot-a01', '.rf-root', '03-risk-forecast.png');
  await openModalView('#view=scenario-replay&plotId=plot-a01', '.sr-scenario-grid', '04-scenario-replay.png');

  await page.evaluate(() => { window.location.hash = '#view=crop-sandbox&plotId=plot-a01'; });
  await page.waitForSelector('.crop-sandbox-container.active', { timeout: 12_000 });
  await page.waitForTimeout(1_800);
  const sandboxState = await page.evaluate(() => {
    const root = document.querySelector('.crop-sandbox-container.active');
    const text = root?.textContent || '';
    return {
      canvas: Boolean(root?.querySelector('canvas')),
      simulated: text.includes('SIMULATED'),
      estimated: text.includes('ESTIMATED'),
      hasCurrencyClaim: text.includes('¥') || text.includes('元')
    };
  });
  check('lxh 微观作物沙盘 WebGL 场景已加载', sandboxState.canvas);
  check('沙盘明确标记 SIMULATED / ESTIMATED', sandboxState.simulated && sandboxState.estimated);
  check('沙盘未展示无证据货币收益', !sandboxState.hasCurrencyClaim);
  await page.screenshot({ path: `${outputDir}/05-crop-sandbox.png`, fullPage: false });

  await page.evaluate(() => { window.location.hash = '#view=work-orders&plotId=plot-a01'; });
  await page.waitForSelector('.field-ops .work-kanban', { timeout: 10_000 });
  await page.waitForTimeout(1_000);
  const farmOpsState = await page.evaluate(() => ({
    columns: document.querySelectorAll('.field-ops .kanban-column').length,
    fieldCanvas: Boolean(document.querySelector('.field-ops [data-field-effects]')),
    sourceLabel: document.querySelector('.field-ops')?.textContent.includes('USER_PROVIDED') || false
  }));
  check('feat/farm-operations 四态工单完整', farmOpsState.columns === 4);
  check('农务模块保留农田动态画布与来源标签', farmOpsState.fieldCanvas && farmOpsState.sourceLabel);
  await page.screenshot({ path: `${outputDir}/06-farm-operations.png`, fullPage: false });

  const unexpectedErrors = runtimeErrors.filter(message =>
    !message.includes('/actuator/health') &&
    !message.includes('Failed to load resource: the server responded with a status of 404')
  );
  check('真实 Chromium 无未处理运行时错误', unexpectedErrors.length === 0, unexpectedErrors.join(' || '));
} finally {
  await browser.close();
}

const failed = results.filter(result => !result.pass);
console.log(`RESULT ${results.length - failed.length}/${results.length}`);
if (failed.length) process.exitCode = 1;
