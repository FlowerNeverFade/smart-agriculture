import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const candidates = [
  join(scriptDir, '..', '.tools', 'node_modules', 'playwright-core', 'index.mjs'),
  process.env.CODEX_NODE_MODULES ? join(process.env.CODEX_NODE_MODULES, 'playwright-core', 'index.mjs') : ''
].filter(Boolean);
const playwrightPath = candidates.find(existsSync);
if (!playwrightPath) throw new Error('playwright-core not found');
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const baseUrl = (process.env.AGRILOOP_WEB_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const outputDir = join(scriptDir, '..', 'artifacts', 'simple-home');
mkdirSync(outputDir, { recursive: true });

const checks = [];
const errors = [];
const check = (name, passed, detail = '') => {
  checks.push({ name, passed: Boolean(passed) });
  console.log(`${passed ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await context.addInitScript(selectedTheme => {
      localStorage.setItem('agriloop-theme', selectedTheme);
      localStorage.setItem('agriloop_session_mode', 'demo');
      localStorage.setItem('agriloop_user', JSON.stringify({ username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员' }));
    }, theme);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${theme}: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`${theme}: ${message.text()}`);
    });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForSelector('.app-container.home-simple-mode .simple-plot-tile', { timeout: 15_000 });

    const home = await page.evaluate(() => {
      const rightRail = document.querySelector('#rightRail');
      const plotSwitcher = document.querySelector('.left-rail > .rail-section:first-child');
      const hiddenExtra = [...document.querySelectorAll('#moduleNavList > li:not(.home-primary-nav):not(.home-nav-more-item)')]
        .filter(item => getComputedStyle(item).display === 'none').length;
      return {
        kpis: document.querySelectorAll('.simple-kpi').length,
        plots: document.querySelectorAll('.simple-plot-tile').length,
        tasks: document.querySelectorAll('.simple-task-item').length,
        risks: document.querySelectorAll('.simple-risk-item').length,
        rightHidden: getComputedStyle(rightRail).display === 'none',
        plotSwitcherHidden: getComputedStyle(plotSwitcher).display === 'none',
        hiddenExtra,
        backgroundVisible: Boolean(document.querySelector('#riumBackground')),
        theme: document.documentElement.dataset.theme
      };
    });
    check(`${theme} 主题首页核心数据完整`, home.kpis === 4 && home.plots === 7 && home.tasks === 3 && home.risks >= 1,
      `kpi=${home.kpis}, plots=${home.plots}, tasks=${home.tasks}, risks=${home.risks}`);
    check(`${theme} 主题使用 Home 专属精简布局`, home.rightHidden && home.plotSwitcherHidden && home.hiddenExtra >= 6);
    check(`${theme} 主题保留原农田背景`, home.backgroundVisible && home.theme === theme);
    await page.screenshot({ path: join(outputDir, `simple-home-${theme}.png`), fullPage: true });

    if (theme === 'light') {
      await page.click('#btnHomeNavMore');
      const visibleNav = await page.locator('#moduleNavList > li').evaluateAll(items => items.filter(item => getComputedStyle(item).display !== 'none').length);
      check('更多功能可展开完整导航', visibleNav >= 12, `${visibleNav} items`);

      await page.click('[data-home-panel="activity"]');
      await page.waitForSelector('#simpleHomeOverlay:not([hidden]) #homeActivityPanel:not([hidden]) .feed-card');
      check('全部动态在弹层中复用原动态流', await page.locator('#homeActivityPanel .feed-card').count() >= 4);
      await page.click('.simple-home-dialog-close');

      await page.click('[data-home-panel="copilot"]');
      await page.waitForSelector('#simpleHomeOverlay:not([hidden]) #homeCopilotPanel:not([hidden]) #copilotInput');
      check('智能分析在弹层中复用 Copilot', await page.locator('#copilotInput').isVisible());
      await page.keyboard.press('Escape');

      await page.click('.simple-plot-tile');
      await page.waitForSelector('#plotTelemetryPanel:not([hidden]) .telemetry-chart-card', { state: 'attached', timeout: 15_000 });
      const moduleLayout = await page.evaluate(() => ({
        homeMode: document.querySelector('.app-container')?.classList.contains('home-simple-mode'),
        rightVisible: getComputedStyle(document.querySelector('#rightRail')).display !== 'none'
      }));
      check('点击地块进入监测且恢复完整布局', !moduleLayout.homeMode && moduleLayout.rightVisible);
      await page.click('#btnTelemetryBackHome');
      await page.waitForSelector('.app-container.home-simple-mode');

      await page.click('#simpleWaterCard [data-home-view="resource-coordination"]');
      await page.waitForSelector('#moduleContentPanel:not([hidden]) .resource-ops', { timeout: 15_000 });
      check('水资源卡片可进入协同排程', !await page.locator('#moduleContentPanel').getAttribute('hidden'));
    }
    await context.close();
  }

  const compactContext = await browser.newContext({ viewport: { width: 720, height: 1000 }, deviceScaleFactor: 1 });
  await compactContext.addInitScript(() => {
    localStorage.setItem('agriloop-theme', 'light');
    localStorage.setItem('agriloop_session_mode', 'demo');
    localStorage.setItem('agriloop_user', JSON.stringify({ username: 'admin', role: 'FARM_ADMIN' }));
  });
  const compactPage = await compactContext.newPage();
  compactPage.on('pageerror', error => errors.push(`compact: ${error.message}`));
  await compactPage.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle', timeout: 30_000 });
  await compactPage.waitForSelector('.app-container.home-simple-mode .simple-plot-tile', { timeout: 15_000 });
  const compactState = await compactPage.evaluate(() => ({
    leftHidden: getComputedStyle(document.querySelector('.left-rail')).display === 'none',
    noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    actionsVisible: [...document.querySelectorAll('.simple-home-action-btn')].every(button => button.getBoundingClientRect().width > 0),
    kpis: document.querySelectorAll('.simple-kpi').length
  }));
  check('窄屏首页无横向溢出且保留核心入口', compactState.leftHidden && compactState.noHorizontalOverflow && compactState.actionsVisible && compactState.kpis === 4);
  await compactPage.screenshot({ path: join(outputDir, 'simple-home-compact.png'), fullPage: true });
  await compactContext.close();
} finally {
  await browser.close();
}

const unexpectedErrors = errors.filter(message =>
  !message.includes('/actuator/health')
  && !message.includes('Failed to load resource: the server responded with a status of 404')
  && !message.includes('THREE.Clock: This module has been deprecated')
);
check('真实 Chromium 无未处理运行时错误', unexpectedErrors.length === 0, unexpectedErrors.join(' || '));

const failed = checks.filter(item => !item.passed);
console.log(`RESULT ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
