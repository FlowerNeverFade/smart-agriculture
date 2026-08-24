/**
 * Chromium performance probe for the local AgriLoop dashboard.
 *
 * Prerequisite:
 *   python scripts/serve-webui.py 3000
 * Usage:
 *   node scripts/profile-webui.mjs [url]
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const candidates = [
  join(scriptDir, '..', '.tools', 'node_modules', 'playwright-core', 'index.mjs'),
  process.env.CODEX_NODE_MODULES ? join(process.env.CODEX_NODE_MODULES, 'playwright-core', 'index.mjs') : '',
  process.env.USERPROFILE
    ? join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright-core', 'index.mjs')
    : ''
].filter(Boolean);
const playwrightPath = candidates.find(existsSync);
if (!playwrightPath) throw new Error('playwright-core not found under .tools or CODEX_NODE_MODULES');
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const url = process.argv[2] || 'http://127.0.0.1:3000/index.html';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  localStorage.setItem('agriloop_session_mode', 'demo');
  localStorage.setItem('agriloop_user', JSON.stringify({
    username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员', avatar: '👑'
  }));
  window.__agriPerf = { longTasks: [] };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__agriPerf.longTasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch (_) { /* Long Tasks API may be unavailable in a test browser. */ }
});

const page = await context.newPage();
const runtimeErrors = [];
page.on('pageerror', error => runtimeErrors.push(`PAGEERROR ${error.message}`));
page.on('console', message => {
  // Demo mode intentionally probes /actuator/health on the static origin and receives 404.
  // HTTP failures are attributed with their URL by the response listener below.
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
    runtimeErrors.push(`CONSOLE ${message.text()}`);
  }
});
page.on('response', response => {
  if (response.status() < 400 || response.url().endsWith('/actuator/health')) return;
  runtimeErrors.push(`HTTP ${response.status()} ${response.url()}`);
});
page.on('requestfailed', request => {
  if (request.url().endsWith('/actuator/health')) return;
  runtimeErrors.push(`REQUEST_FAILED ${request.url()} ${request.failure()?.errorText || ''}`.trim());
});

const client = await context.newCDPSession(page);
await client.send('Performance.enable');
await client.send('Network.enable');
let transferredBytes = 0;
client.on('Network.loadingFinished', event => { transferredBytes += Number(event.encodedDataLength || 0); });

const started = performance.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
const domContentLoadedMs = performance.now() - started;
await page.waitForSelector('#plotListContainer .plot-list-item', { timeout: 15_000 });
const dashboardReadyMs = performance.now() - started;
await page.waitForSelector('#riumBackground canvas', { timeout: 15_000 });
const backgroundReadyMs = performance.now() - started;
await page.waitForTimeout(1_500);

const frameSample = await page.evaluate(() => new Promise(resolve => {
  const began = performance.now();
  let frames = 0;
  const tick = () => {
    frames += 1;
    const elapsed = performance.now() - began;
    if (elapsed >= 1_500) resolve({ frames, elapsed, fps: frames * 1000 / elapsed });
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));

const browserMetrics = await client.send('Performance.getMetrics');
const metricMap = Object.fromEntries(browserMetrics.metrics.map(item => [item.name, item.value]));
const pageMetrics = await page.evaluate(() => {
  const navigation = performance.getEntriesByType('navigation')[0];
  const paints = Object.fromEntries(performance.getEntriesByType('paint').map(item => [item.name, item.startTime]));
  const resources = performance.getEntriesByType('resource');
  const byType = {};
  for (const item of resources) {
    const type = item.initiatorType || 'other';
    byType[type] = (byType[type] || 0) + Number(item.transferSize || item.encodedBodySize || 0);
  }
  const longTasks = window.__agriPerf?.longTasks || [];
  const heavySubviewModules = resources
    .map(item => item.name)
    .filter(name => /\/(farm-monitor|crop-sandbox)\.js(?:\?|$)/.test(name));
  return {
    navigation: navigation ? {
      responseEnd: navigation.responseEnd,
      domContentLoaded: navigation.domContentLoadedEventEnd,
      load: navigation.loadEventEnd
    } : {},
    paints,
    resourceCount: resources.length,
    resourceBytesByType: byType,
    longTaskCount: longTasks.length,
    longTaskTotalMs: longTasks.reduce((sum, item) => sum + item.duration, 0),
    longestTaskMs: Math.max(0, ...longTasks.map(item => item.duration)),
    initialStylesheetCount: document.querySelectorAll('link[rel="stylesheet"]').length,
    heavySubviewModules,
    canvasCount: document.querySelectorAll('canvas').length,
    domNodes: document.getElementsByTagName('*').length
  };
});

console.log(JSON.stringify({
  url,
  domContentLoadedMs: Math.round(domContentLoadedMs),
  dashboardReadyMs: Math.round(dashboardReadyMs),
  backgroundReadyMs: Math.round(backgroundReadyMs),
  transferredKiB: Math.round(transferredBytes / 1024),
  frameSample: { ...frameSample, fps: Number(frameSample.fps.toFixed(1)) },
  mainThread: {
    taskMs: Math.round((metricMap.TaskDuration || 0) * 1000),
    scriptMs: Math.round((metricMap.ScriptDuration || 0) * 1000),
    layoutMs: Math.round((metricMap.LayoutDuration || 0) * 1000),
    styleMs: Math.round((metricMap.RecalcStyleDuration || 0) * 1000),
    jsHeapMiB: Number(((metricMap.JSHeapUsedSize || 0) / 1024 / 1024).toFixed(1))
  },
  ...pageMetrics,
  runtimeErrors
}, null, 2));

await browser.close();
if (runtimeErrors.length || pageMetrics.heavySubviewModules.length) process.exitCode = 1;
