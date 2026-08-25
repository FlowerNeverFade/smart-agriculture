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
const liveUsername = process.env.AGRILOOP_TEST_USERNAME || '';
const livePassword = process.env.AGRILOOP_TEST_PASSWORD || '';
const testTheme = ['light', 'dark'].includes(process.env.AGRILOOP_TEST_THEME)
  ? process.env.AGRILOOP_TEST_THEME
  : '';
const viewportMatch = String(process.env.AGRILOOP_TEST_VIEWPORT || '').match(/^(\d+)x(\d+)$/);
const testViewport = viewportMatch
  ? { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) }
  : { width: 1440, height: 900 };
const disableWebgl = process.env.AGRILOOP_DISABLE_WEBGL === '1';
const outputDir = 'artifacts/branch-integration';
mkdirSync(outputDir, { recursive: true });

const results = [];
const runtimeErrors = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
};

const browserArgs = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-gpu-sandbox'
];
if (disableWebgl) browserArgs.push('--disable-webgl', '--disable-gpu');

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: browserArgs
});
const context = await browser.newContext({ viewport: testViewport, deviceScaleFactor: 1 });
if (testTheme) {
  await context.addInitScript(({ theme }) => {
    localStorage.setItem('agriloop-theme', theme);
  }, { theme: testTheme });
}
const page = await context.newPage();
// Headless Chromium may default to reduced transparency.  Exercise the
// normal production presentation here so the frosted blur contract is tested,
// while the CSS still keeps an opaque accessible fallback for that preference.
const mediaSession = await context.newCDPSession(page);
await mediaSession.send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }]
});
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

  if (liveUsername && livePassword) {
    await page.fill('#username', liveUsername);
    await page.fill('#password', livePassword);
    await Promise.all([
      page.waitForURL(/\/index\.html(?:[?#].*)?$/, { timeout: 30_000 }),
      page.click('#submitButton')
    ]);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  } else {
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
  }
  try {
    await page.waitForSelector('#plotListContainer .plot-list-item');
  } catch (error) {
    const debugState = await page.evaluate(() => ({
      url: location.href,
      readyState: document.readyState,
      sessionMode: localStorage.getItem('agriloop_session_mode'),
      bodyText: document.body?.innerText?.slice(0, 500) || '',
      resources: performance.getEntriesByType('resource').map(entry => entry.name)
    }));
    console.error('DASHBOARD DEBUG', JSON.stringify({ debugState, runtimeErrors }, null, 2));
    throw error;
  }
  await page.waitForSelector('#rightRailPanel .system-status-card', { state: 'attached', timeout: 12_000 });
  await page.waitForSelector('#btnToggleRightRail', { state: 'visible', timeout: 12_000 });
  await page.waitForTimeout(1_500);
  const dashboardState = await page.evaluate(() => {
    const background = document.querySelector('#riumBackground');
    const webglCanvas = background?.querySelector('.rium-webgl-canvas');
    const fallbackCanvas = background?.querySelector('.agri-wheat-fallback');
    const box = background?.getBoundingClientRect();
    const header = document.querySelector('.app-header');
    const headerStyle = header ? getComputedStyle(header) : null;
    const headerSheen = header ? getComputedStyle(header, '::before') : null;
    const fallbackBox = fallbackCanvas?.getBoundingClientRect();
    return {
      plotCount: document.querySelectorAll('#plotListContainer .plot-list-item').length,
      backgroundVisible: Boolean(box && box.width > 0 && box.height > 0),
      hasWebglCanvas: Boolean(webglCanvas),
      fallbackVisible: Boolean(fallbackBox && fallbackBox.width > 0 && fallbackBox.height > 0
        && getComputedStyle(fallbackCanvas).display !== 'none'),
      sandboxNav: Boolean(document.querySelector('[data-view="crop-sandbox"]')),
      frostedBlur: Boolean(headerStyle && `${headerStyle.backdropFilter || headerStyle.webkitBackdropFilter || ''}`.includes('blur')),
      frostedNoSheen: headerStyle?.backgroundImage === 'none' && headerSheen?.display === 'none'
    };
  });
  check('主面板渲染三块演示地块', dashboardState.plotCount >= 3, `${dashboardState.plotCount} plots`);
  check('rium_dev 背景容器与 WebGL/2D 麦田画布已接入',
    dashboardState.backgroundVisible && (dashboardState.hasWebglCanvas || dashboardState.fallbackVisible));
  if (disableWebgl) {
    check('WebGL 不可用时 2D 麦田回退仍可见', dashboardState.fallbackVisible);
  }
  check('微观作物沙盘使用独立导航入口', dashboardState.sandboxNav);
  check('主面板使用毛玻璃而非液态高光', dashboardState.frostedBlur && dashboardState.frostedNoSheen);
  const railLayout = await page.evaluate(() => {
    const rail = document.querySelector('#rightRail')?.getBoundingClientRect();
    const panel = document.querySelector('#rightRailPanel')?.getBoundingClientRect();
    const toggle = document.querySelector('#btnToggleRightRail');
    return {
      buttonPosition: toggle ? getComputedStyle(toggle).position : '',
      railTop: rail?.top || 0,
      panelTop: panel?.top || 0,
      panelRight: panel?.right || 0,
      appRight: document.querySelector('.app-container')?.getBoundingClientRect().right || 0
    };
  });
  check('右栏按钮悬浮且展开面板不推挤/覆盖中心',
    railLayout.buttonPosition === 'absolute'
      && Math.abs(railLayout.panelTop - railLayout.railTop) <= 1
      && railLayout.panelRight <= railLayout.appRight + 1);
  const railCardLayout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#rightRailPanel .system-status-card')];
    const rects = cards.map(card => {
      const rect = card.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        clientHeight: card.clientHeight,
        scrollHeight: card.scrollHeight,
        overflow: getComputedStyle(card).overflow,
        contentBottom: Math.max(...[...card.children].map(child => child.getBoundingClientRect().bottom), rect.top)
      };
    });
    return {
      cards: rects,
      gaps: rects.slice(1).map((card, index) => card.top - rects[index].bottom)
    };
  });
  check('右栏卡片按内容展开且不会被自身裁剪',
    railCardLayout.cards.length >= 6
      && railCardLayout.cards.every(card => card.contentBottom <= card.bottom + 1
        && (card.overflow !== 'hidden' || card.scrollHeight - card.clientHeight < 60)),
    railCardLayout.cards.map(card => `${card.clientHeight}/${card.scrollHeight}/${card.contentBottom.toFixed(1)}→${card.bottom.toFixed(1)}/${card.overflow}`).join(', '));
  check('右栏卡片之间保留独立间距不互相覆盖',
    railCardLayout.gaps.every(gap => gap >= 14),
    railCardLayout.gaps.map(gap => `${gap.toFixed(1)}px`).join(', '));
  const readWaterRailLayout = () => page.evaluate(() => {
    const card = document.querySelector('.water-rail-card');
    const orb = document.querySelector('.water-orb-mini');
    const canvas = document.querySelector('.water-orb-mini [data-water-canvas]');
    const cardBox = card?.getBoundingClientRect();
    const orbBox = orb?.getBoundingClientRect();
    const canvasBox = canvas?.getBoundingClientRect();
    return {
      cardHeight: cardBox?.height || 0,
      orbHeight: orbBox?.height || 0,
      canvasHeight: canvasBox?.height || 0,
      pageHeight: document.documentElement.scrollHeight,
      workOrdersCssLoaded: performance.getEntriesByType('resource')
        .some(entry => entry.name.includes('/css/modules/work-orders.css'))
    };
  });
  const waterRailBefore = await readWaterRailLayout();
  await page.waitForTimeout(1_200);
  const waterRailAfter = await readWaterRailLayout();
  const waterRailStable = waterRailBefore.cardHeight > 80
    && waterRailBefore.cardHeight < 300
    && Math.abs(waterRailBefore.cardHeight - waterRailAfter.cardHeight) <= 1
    && Math.abs(waterRailBefore.pageHeight - waterRailAfter.pageHeight) <= 2;
  check('首页水资源卡片未加载协同排程 CSS 也保持固定高度', waterRailStable && !waterRailBefore.workOrdersCssLoaded,
    `${waterRailBefore.cardHeight.toFixed(1)}→${waterRailAfter.cardHeight.toFixed(1)}px, page ${waterRailBefore.pageHeight}→${waterRailAfter.pageHeight}`);
  check('水资源 Canvas 被 82px 球体约束且不反向撑高布局',
    Math.abs(waterRailAfter.orbHeight - 82) <= 1 && Math.abs(waterRailAfter.canvasHeight - waterRailAfter.orbHeight) <= 2.5,
    `orb=${waterRailAfter.orbHeight.toFixed(1)}px canvas=${waterRailAfter.canvasHeight.toFixed(1)}px`);
  // rium_dev-v2 targeted regressions: the rail collapses in place and the
  // navigation rail mounts functional modules in the center feed (no modal).
  const railToggle = page.locator('#btnToggleRightRail');
  await railToggle.click();
  const railCollapsed = await page.evaluate(() => ({
    collapsed: document.querySelector('.app-container')?.classList.contains('right-rail-collapsed') || false,
    expanded: document.querySelector('#btnToggleRightRail')?.getAttribute('aria-expanded') || '',
    panelHidden: getComputedStyle(document.querySelector('#rightRailPanel')).display === 'none'
  }));
  check('右侧栏支持拉出/收回折叠', railCollapsed.collapsed && railCollapsed.expanded === 'false' && railCollapsed.panelHidden);
  await railToggle.click();
  const railExpanded = await page.evaluate(() => ({
    expanded: document.querySelector('#btnToggleRightRail')?.getAttribute('aria-expanded') || '',
    panelVisible: getComputedStyle(document.querySelector('#rightRailPanel')).display !== 'none'
  }));
  check('右侧栏再次展开恢复面板', railExpanded.expanded === 'true' && railExpanded.panelVisible);

  await page.click('[data-view="risk-forecast"]');
  await page.waitForSelector('#moduleContentPanel:not([hidden]) .rf-root', { timeout: 10_000 });
  const inlineModuleState = await page.evaluate(() => ({
    modalActive: document.querySelector('#subviewModal')?.classList.contains('active') || false,
    panelVisible: !document.querySelector('#moduleContentPanel')?.hidden,
    inlineHash: new URLSearchParams(location.hash.slice(1)).get('inline') === '1'
  }));
  check('导航功能子模块以内嵌中心页面呈现', inlineModuleState.panelVisible && !inlineModuleState.modalActive && inlineModuleState.inlineHash);

  await page.click('[data-view="plot-telemetry"]');
  // The cylinder track intentionally has zero layout height; its transformed
  // cards are the visible surface, so wait for an attached card rather than
  // Playwright's generic "visible" heuristic on the track itself.
  await page.waitForSelector('#plotTelemetryPanel:not([hidden]) #telemetryChartsGrid .telemetry-chart-card', { state: 'attached', timeout: 12_000 });
  const telemetryState = await page.evaluate(() => ({
    panelVisible: !document.querySelector('#plotTelemetryPanel')?.hidden,
    chartCount: document.querySelectorAll('#telemetryChartsGrid .telemetry-chart-card').length,
    metricNames: [...document.querySelectorAll('#telemetryChartsGrid .telemetry-chart-name')].map(el => el.textContent.trim()),
    modalActive: document.querySelector('#subviewModal')?.classList.contains('active') || false
  }));
  check('地块监测时序视图展示六类指标', telemetryState.panelVisible && telemetryState.chartCount === 6 && telemetryState.metricNames.includes('土壤湿度'));
  check('时序视图不打开底部弹窗', !telemetryState.modalActive);
  await page.click('#btnTelemetryBackHome');
  await page.waitForFunction(() => !document.querySelector('#plotTelemetryPanel') || document.querySelector('#plotTelemetryPanel').hidden);

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

  if (disableWebgl) {
    // 该运行专门验证 WebGL 失败时的麦田回退；微观沙盘本身也是
    // WebGL 画布，因此在此模式下跳过其正向渲染断言。
    check('WebGL 禁用回退运行跳过沙盘正向渲染', true);
  } else {
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
  }

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

  await page.evaluate(() => { window.location.hash = '#view=resource-coordination&plotId=plot-a01'; });
  await page.waitForSelector('.resource-ops .demand-list', { timeout: 10_000 });
  await page.waitForTimeout(900);
  const waterRailAfterCoordination = await readWaterRailLayout();
  check('打开水资源协同排程后首页水卡尺寸不发生跳变',
    waterRailAfterCoordination.workOrdersCssLoaded
      && Math.abs(waterRailAfterCoordination.cardHeight - waterRailAfter.cardHeight) <= 1,
    `${waterRailAfter.cardHeight.toFixed(1)}→${waterRailAfterCoordination.cardHeight.toFixed(1)}px`);

  const unexpectedErrors = runtimeErrors.filter(message =>
    !message.includes('/actuator/health') &&
    !message.includes('Failed to load resource: the server responded with a status of 404') &&
    !(disableWebgl && message.includes('WebGL'))
  );
  check('真实 Chromium 无未处理运行时错误', unexpectedErrors.length === 0, unexpectedErrors.join(' || '));
} finally {
  await browser.close();
}

const failed = results.filter(result => !result.pass);
console.log(`RESULT ${results.length - failed.length}/${results.length}`);
if (failed.length) process.exitCode = 1;
