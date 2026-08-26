/**
 * AgriLoop Web UI regression smoke (Node + jsdom).
 *
 *   node scripts/verify-webui.mjs             # auto (real ECharts if present)
 *   node scripts/verify-webui.mjs real        # vendor ECharts smoke
 *   node scripts/verify-webui.mjs stub        # deterministic chart stub
 *   node scripts/verify-webui.mjs svg         # no ECharts; SVG/static checks
 *
 * This checks the current three-role shell and plot-level simulator contract;
 * it deliberately does not depend on removed legacy modules.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSDOM_PATH = join(ROOT, '.tools', 'node_modules', 'jsdom', 'lib', 'api.js');
if (!existsSync(JSDOM_PATH)) {
  console.error('未找到 jsdom，请先执行: npm install jsdom --prefix .tools --ignore-scripts --no-audit --no-fund');
  process.exit(2);
}
const { JSDOM } = await import(pathToFileURL(JSDOM_PATH).href);

const requestedMode = String(process.argv[2] || 'auto').toLowerCase();
const hasVendorEcharts = existsSync(join(ROOT, 'apps', 'web-ui', 'vendor', 'echarts.min.js'));
const mode = requestedMode === 'auto' ? (hasVendorEcharts ? 'real' : 'svg') : requestedMode;
if (!['real', 'stub', 'svg'].includes(mode)) {
  console.error('未知模式：' + requestedMode + '（可选 real | stub | svg | auto）');
  process.exit(2);
}

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
};
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

const indexHtml = read('apps/web-ui/index.html');
const farmerHtml = read('apps/web-ui/farmer.html');
const appSource = read('apps/web-ui/js/app.js');
const apiSource = read('apps/web-ui/js/api.js');
const farmerSource = read('apps/web-ui/js/farmer.js');
const liveDataSource = read('apps/web-ui/js/live-data.js');
const farmerStyle = read('apps/web-ui/css/farmer.css');
const openApi = read('docs/api/openapi.yaml');

ok('入口脚本带版本参数', /js\/app\.js\?v=[^"']+/.test(indexHtml));
ok('五个地块场景已注册', ['NORMAL', 'DROUGHT', 'HEAVY_RAIN', 'SENSOR_DRIFT', 'DEVICE_OFFLINE'].every((code) => apiSource.includes(`code: '${code}'`)));
ok('模拟策略 REST 与重置接口已接线', ['/simulation`', '/simulation/reset`', 'PLOT_SIMULATION_DEFAULTS'].every((part) => apiSource.includes(part)) && openApi.includes('/api/v1/plots/{plotId}/simulation/reset'));
ok('降雨指标贯通前端', appSource.includes('RAINFALL') && apiSource.includes("'RAINFALL'") && farmerSource.includes("code: 'RAINFALL'"));
ok('参数预览与保存控件存在', indexHtml.includes('simulationFields') && indexHtml.includes('保存到此地块') && appSource.includes('localPreviewCurve'));
ok('历史/预测重置按钮存在', indexHtml.includes('重置历史曲线') && indexHtml.includes('重置预测曲线') && apiSource.includes('resetPlotSimulation'));
ok('三类曲线支持局部浮窗', appSource.includes("trigger: 'axis'") && farmerHtml.includes('show_chart_tooltip') && farmerStyle.includes('.farmer-chart-tooltip'));
ok('硬件 REAL 状态优先', liveDataSource.includes('hardwareBound') && appSource.includes('hardwareLabel'));
ok('无冲突标记', ![indexHtml, appSource, apiSource, farmerHtml, farmerSource].some((source) => /^(?:<<<<<<<|=======|>>>>>>>)(?: |$)/m.test(source)));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (predicate, timeout = 5000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (predicate()) return true; } catch { /* keep polling */ }
    await sleep(40);
  }
  return false;
};

function installDomPolyfills(window) {
  window.matchMedia ||= (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.requestAnimationFrame ||= ((callback) => setTimeout(callback, 0));
  window.cancelAnimationFrame ||= ((id) => clearTimeout(id));
  window.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver ||= class { observe() {} unobserve() {} disconnect() {} };
  globalThis.MutationObserver = window.MutationObserver;
  globalThis.ResizeObserver = window.ResizeObserver;
  globalThis.IntersectionObserver = window.IntersectionObserver;
  window.HTMLElement.prototype.scrollIntoView ||= function () {};
}

function installChart(window) {
  if (mode === 'svg') return null;
  if (mode === 'real') {
    try {
      window.eval(read('apps/web-ui/vendor/echarts.min.js'));
      if (window.echarts) {
        // jsdom has no native canvas implementation.  Force the real vendor
        // build through its SVG renderer so this smoke test exercises the
        // production ECharts option/tooltip path without requiring the
        // optional native `canvas` package.
        const vendor = window.echarts;
        const vendorInit = vendor.init.bind(vendor);
        vendor.init = (element, theme, options = {}) => vendorInit(element, theme, { ...options, renderer: 'svg' });
        globalThis.echarts = vendor;
        return vendor;
      }
    } catch (error) {
      console.warn('真实 ECharts 在 jsdom 中不可初始化，改用 stub：', error.message);
    }
  }
  const stub = {
    graphic: { LinearGradient: class { constructor(...args) { this.args = args; } } },
    init(element) {
      element.innerHTML = '<div class="stub-chart" aria-label="chart-stub"></div>';
      return {
        setOption(option) {
          if (!option?.series?.length) throw new Error('无效的图表 option');
        },
        resize() {},
        dispose() {}
      };
    }
  };
  window.echarts = stub;
  globalThis.echarts = stub;
  return stub;
}

async function mountIndex() {
  const dom = new JSDOM(indexHtml, {
    url: 'http://localhost:3000/#view=dashboard',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  installDomPolyfills(window);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;
  window.localStorage.setItem('agriloop_session_mode', 'demo');
  window.localStorage.setItem('agriloop_user', JSON.stringify({ username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员' }));
  window.eval(read('apps/web-ui/vendor/vue.global.prod.js'));
  globalThis.Vue = window.Vue;
  const chart = installChart(window);
  await import(pathToFileURL(join(ROOT, 'apps/web-ui/js/app.js')).href + `?verify=${Date.now()}`);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const mounted = await waitFor(() => Boolean(window.document.querySelector('#app')) && window.document.body.textContent.includes('农场总览'), 3500);
  ok('三角色主壳可挂载（演示会话）', mounted);
  if (!mounted) { dom.window.close(); return; }

  window.location.hash = '#view=plot-detail&plotId=plot-a01';
  const detail = await waitFor(() => window.document.body.textContent.includes('地块模拟策略'), 3500);
  ok('地块详情显示独立策略设置', detail);
  ok('地块详情显示五个场景', detail && window.document.querySelectorAll('.plot-simulation-scenario').length === 5);
  ok('地块详情显示曲线悬浮提示文案', detail && window.document.body.textContent.includes('鼠标悬停查看局部数据'));

  if (mode !== 'svg') {
    window.location.hash = '#view=risk-forecast';
    const risk = await waitFor(() => Boolean(window.document.querySelector('#riskChart')), 3500);
    ok('风险预测视图可打开', risk);
    ok('图表 renderer 已接收 option', risk && (!chart || Boolean(window.document.querySelector('#riskChart .stub-chart')) || window.document.querySelector('#riskChart').innerHTML.length > 50));
  } else {
    ok('SVG 模式不依赖 ECharts', typeof window.echarts === 'undefined');
  }
  dom.window.close();
}

await mountIndex();
const failed = results.filter((item) => !item.pass);
console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过（mode=${mode}） =====`);
if (failed.length) {
  console.log('失败项：' + failed.map((item) => item.name).join('；'));
  process.exitCode = 1;
}
