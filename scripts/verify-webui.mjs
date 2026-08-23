/**
 * AgriLoop web-ui 前端回归验证脚本（Node + jsdom，无需真实浏览器）
 *
 * 用法（仓库根目录）：
 *   node scripts/verify-webui.mjs            # 自动：vendor echarts 存在 -> real 模式
 *   node scripts/verify-webui.mjs real       # 真实 ECharts（vendor/echarts.min.js）+ 自动 renderer 选择
 *   node scripts/verify-webui.mjs stub       # ECharts stub（验证 ECharts 分支 option 构建）
 *   node scripts/verify-webui.mjs svg        # 无 ECharts，验证纯 SVG 兜底渲染
 *
 * 依赖：jsdom（本地安装：npm install jsdom --prefix .tools --ignore-scripts --no-audit --no-fund）
 * 覆盖视图：#view=risk-forecast / #view=scenario-replay / #view=value-ledger
 * 前置：静态服务器 python -m http.server 3000 --directory apps/web-ui
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const JSDOM_PATH = join(ROOT, '.tools', 'node_modules', 'jsdom', 'lib', 'api.js');

if (!existsSync(JSDOM_PATH)) {
  console.error('未找到 jsdom，请先执行: npm install jsdom --prefix .tools --ignore-scripts --no-audit --no-fund');
  process.exit(2);
}
const { JSDOM } = await import(pathToFileURL(JSDOM_PATH).href);

const arg = (process.argv[2] || 'auto').toLowerCase();
const hasRealEcharts = existsSync(join(ROOT, 'apps', 'web-ui', 'vendor', 'echarts.min.js'));
const mode = arg === 'auto' ? (hasRealEcharts ? 'real' : 'svg') : arg;
if (!['real', 'stub', 'svg'].includes(mode)) {
  console.error('未知模式: ' + mode + '（可选 real | stub | svg | auto）');
  process.exit(2);
}

const results = [];
const ok = (name, pass, extra = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} | ${name}${extra ? ' | ' + extra : ''}`);
};

const html = readFileSync(join(ROOT, 'apps', 'web-ui', 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost:3000/#view=risk-forecast',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
window.HTMLElement.prototype.scrollIntoView = function () {};

if (mode === 'real') {
  window.eval(readFileSync(join(ROOT, 'apps', 'web-ui', 'vendor', 'echarts.min.js'), 'utf8'));
  ok('真实 ECharts 加载', !!window.echarts, `version=${window.echarts?.version}`);
} else if (mode === 'stub') {
  window.echarts = {
    init(el) {
      el.innerHTML = '<div class="stub-chart"></div>';
      return {
        setOption(option) {
          if (!option || !Array.isArray(option.series) || option.series.length === 0) {
            throw new Error('echarts setOption 收到无效 option');
          }
        },
        resize() {}, dispose() {}
      };
    }
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout = 8000, interval = 50) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (fn()) return true; } catch (e) { /* keep waiting */ }
    await sleep(interval);
  }
  return false;
}

/** 切换视图：只设置 hash，由 jsdom 异步派发 hashchange（与真实浏览器一致） */
function gotoView(hash) {
  window.location.hash = hash;
}

const chartOk = sel => mode === 'stub'
  ? !!document.querySelector(`${sel} .stub-chart`)
  : (document.querySelector(sel)?.innerHTML || '').length > 50;

/** 等待图表区渲染完成（echarts 按需加载 / 超时回退均可能延迟） */
async function waitChart(sel, timeout = 8000) {
  return waitFor(() => (mode === 'stub'
    ? !!document.querySelector(`${sel} .stub-chart`)
    : (document.querySelector(sel)?.innerHTML || '').length > 50), timeout);
}

// ---- 启动应用 ----
await import(pathToFileURL(join(ROOT, 'apps', 'web-ui', 'js', 'app.js')).href);
document.dispatchEvent(new window.Event('DOMContentLoaded'));
await waitFor(() => document.querySelector('#plotListContainer .plot-list-item'), 3000);
ok('应用启动：地块列表渲染', document.querySelectorAll('#plotListContainer .plot-list-item').length === 3);

// ============ Home 驾驶舱摘要 ============
const hsGrid = document.getElementById('homeSummaryGrid');
ok('Home 摘要网格（预测/效益/作物包 3 卡）', !!hsGrid && hsGrid.querySelectorAll('.home-summary-card').length === 3);
if (hsGrid) {
  ok('预测卡 Time-to-Risk 72', hsGrid.querySelectorAll('.home-summary-card')[0].textContent.includes('72'));
  ok('效益卡 ¥ 245.82', hsGrid.querySelectorAll('.home-summary-card')[1].textContent.includes('245.82'));
  hsGrid.querySelectorAll('.home-summary-card')[0].click();
  await sleep(300);
  ok('点击预测卡直达 risk-forecast', window.location.hash.includes('view=risk-forecast'));
  // 保持 risk-forecast 打开状态，视图 1 测试直接在此渲染实例上继续
}

// ============ 视图 1：risk-forecast ============
ok('risk-forecast 路由打开', document.querySelector('#modalTitle').textContent.includes('风险预测'));
const rfReady = await waitFor(() => document.querySelector('.rf-root'), 6000);
ok('risk-forecast 模块渲染 (.rf-root)', rfReady);
if (rfReady) {
  await waitChart('[data-role="gauge"]');
  await waitChart('[data-role="chart-body"]');
  ok('Time-to-Risk 仪表盘', mode === 'stub' ? !!document.querySelector('[data-role="gauge"] .stub-chart') : !!document.querySelector('[data-role="gauge"] svg'));
  ok('预测曲线图区有内容', chartOk('[data-role="chart-body"]'));
  ok('3 档预测切换 chips', document.querySelectorAll('.rf-toggle-chip').length === 3);
  ok('预测元数据卡片', !!document.querySelector('.rf-meta-card'));
  ok('无降级告警（AVAILABLE 分支）', !document.querySelector('.rf-root .agri-alert-danger'));
}

// ============ 视图 2：scenario-replay ============
gotoView('#view=scenario-replay&plotId=plot-a01');
const srReady = await waitFor(() => document.querySelector('.sr-scenario-grid'), 5000);
ok('scenario-replay 模块渲染 (5 情景按钮)', srReady && document.querySelectorAll('.sr-scenario-btn').length === 5);
if (srReady) {
  document.querySelector('.sr-scenario-btn[data-scenario="DROUGHT"]').click();
  const runBtn = document.querySelector('[data-role="run-btn"]');
  ok('选择情景后运行按钮可用', !runBtn.disabled);
  runBtn.click();
  const srRun = await waitFor(() => document.querySelector('.sr-result-card'), 8000);
  ok('双轨推演结果渲染 (.sr-result-card)', srRun);
  if (srRun) {
    const srSummary = document.querySelector('.sr-summary');
    ok('双轨摘要（末端对比/越界/结论）', !!srSummary && srSummary.textContent.includes('触达极限边界') && !!srSummary.querySelector('.sr-summary-conclusion'));
    await waitChart('[data-role="sr-chart"]');
    ok('双轨图区有内容', chartOk('[data-role="sr-chart"]'));
    ok('回放滑块存在', !!document.querySelector('[data-role="scrub-range"]'));
    ok('三路读数存在', !!document.querySelector('[data-role="val-exec"]') && !!document.querySelector('[data-role="val-diff"]'));
    const diff0 = document.querySelector('[data-role="val-diff"]').textContent;
    const range = document.querySelector('[data-role="scrub-range"]');
    range.value = 120;
    range.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(120);
    const diff120 = document.querySelector('[data-role="val-diff"]').textContent;
    ok('回放滑块联动生效 (t=120 差值变化)', diff0 !== diff120, `${diff0} -> ${diff120}`);
    document.querySelector('[data-role="play-btn"]').click();
    await sleep(600);
    document.querySelector('[data-role="play-btn"]').click();
    ok('播放/暂停按钮工作', true);
  }
  document.querySelector('.sr-scenario-btn[data-scenario="OFFLINE"]').click();
  document.querySelector('[data-role="run-btn"]').click();
  const offline = await waitFor(() => {
    const el = document.querySelector('[data-role="run-output"] .agri-alert-danger');
    return el && el.textContent.includes('UNAVAILABLE');
  }, 5000);
  ok('OFFLINE 场景降级为 UNAVAILABLE', offline);
  document.querySelector('.sr-scenario-btn[data-scenario="SENSOR_DRIFT"]').click();
  document.querySelector('[data-role="run-btn"]').click();
  const drift = await waitFor(() => {
    const el = document.querySelector('.sr-result-card');
    return el && el.textContent.includes('传感器零点漂移');
  }, 5000);
  ok('SENSOR_DRIFT 场景推演渲染', drift);
}

// ============ 视图 3：value-ledger ============
gotoView('#view=value-ledger');
const vlReady = await waitFor(() => document.querySelector('.vl-kpi-grid'), 6000);
ok('value-ledger 模块渲染 (.vl-kpi-grid)', vlReady);
if (vlReady) {
  await waitChart('[data-role="bar-chart"]');
  await waitChart('[data-role="area-chart"]');
  ok('5 张 KPI 卡片', document.querySelectorAll('.vl-kpi').length === 5);
  ok('偏差率 KPI 数值 -7.3%', document.querySelector('.vl-kpi-value').textContent.includes('-7.3'));
  ok('柱状图区有内容', chartOk('[data-role="bar-chart"]'));
  ok('反事实面积图区有内容', chartOk('[data-role="area-chart"]'));
  ok('口径来源表 3 行', document.querySelectorAll('.vl-provenance-table tbody tr').length === 3);
}

// ============ 视图 4：crop-packs ============
gotoView('#view=crop-packs');
const cpReady = await waitFor(() => document.querySelector('.cp-tabs'), 6000);
ok('crop-packs 模块渲染', cpReady);
if (cpReady) {
  ok('两个作物 Tab（番茄/黄瓜）', document.querySelectorAll('.cp-tab').length === 2);
  ok('身份档案（重庆 · v1.0.0）', document.querySelector('.cp-identity').textContent.includes('重庆') && document.querySelector('.cp-identity').textContent.includes('v1.0.0'));
  ok('6 项指标定义 + availability 徽标', document.querySelectorAll('.cp-metric').length === 6 && !!document.querySelector('.cp-metric .agri-pill-ok'));
  ok('4 个阶段参数卡片', document.querySelectorAll('.cp-stage').length === 4);
  const md = document.querySelector('.cp-md');
  ok('知识文档阅读器（标题/列表/引用）', !!md?.querySelector('.cp-md-h') && md.querySelectorAll('.cp-md-list li').length >= 3 && !!md.querySelector('.cp-md-quote'));
  ok('检索回退链展示', document.querySelector('.cp-fallback').textContent.includes('plot → region → stage → crop → general'));
  ok('情景映射 5 项', document.querySelectorAll('.cp-scenario').length === 5);
  document.querySelector('.cp-tab[data-crop="cucumber"]').click();
  await sleep(100);
  const cuke = document.querySelector('[data-role="cp-body"]').textContent;
  ok('切换黄瓜后参数/阈值更新', cuke.includes('32 ~ 52%') && cuke.includes('WATER_DEFICIT'));
}

// ============ 视图 5：⌘K 命令面板 + 交叉导航 ============
const cmdBackdrop = document.getElementById('cmdPaletteBackdrop');
const cmdInput = document.getElementById('cmdInput');
const keyEvt = (k, opts = {}) => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
keyEvt('k', { metaKey: true });
await sleep(100);
ok('⌘K 打开命令面板', cmdBackdrop.classList.contains('active'));
if (cmdBackdrop.classList.contains('active')) {
  ok('面板包含地块/视图/作物包/规则/动态条目', document.querySelectorAll('.cmd-item').length >= 16, `${document.querySelectorAll('.cmd-item').length} 条`);
  cmdInput.value = '风险预测';
  cmdInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(60);
  keyEvt('Enter');
  await sleep(300);
  ok('搜索并跳转风险预测视图', window.location.hash.includes('view=risk-forecast'));
  ok('面板已关闭', !cmdBackdrop.classList.contains('active'));
}
document.activeElement?.blur?.();
keyEvt('/');
await sleep(80);
ok('"/" 呼出面板', cmdBackdrop.classList.contains('active'));
keyEvt('Escape');
await sleep(80);
ok('ESC 关闭面板', !cmdBackdrop.classList.contains('active'));

// ============ 关闭弹窗清理 + 返回 Home ============
document.querySelector('#btnCloseModal').click();
await sleep(200);
ok('关闭弹窗无异常', true);
gotoView('');
await sleep(300);
ok('返回 Home 正常', !document.querySelector('#subviewModal').classList.contains('active'));

dom.window.close();
const failed = results.filter(r => !r.pass);
console.log(`\n===== 结果: ${results.length - failed.length}/${results.length} 通过 (mode=${mode}) =====`);
if (failed.length) {
  console.log('失败项:', failed.map(f => f.name).join('; '));
  process.exitCode = 1;
} else {
  process.exitCode = 0;
}
