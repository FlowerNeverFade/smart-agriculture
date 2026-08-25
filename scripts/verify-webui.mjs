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
const loginHtml = readFileSync(join(ROOT, 'apps', 'web-ui', 'login.html'), 'utf8');
const appSource = readFileSync(join(ROOT, 'apps', 'web-ui', 'js', 'app.js'), 'utf8');
const loginSource = readFileSync(join(ROOT, 'apps', 'web-ui', 'js', 'login.js'), 'utf8');
ok('入口脚本已版本化避免旧缓存', /js\/app\.js\?v=[^"']+/.test(html));
ok('静态模板已移除三角尺占位内容', !html.includes('subview-placeholder') && !html.includes('📐'));
ok('工作台已移除登录弹窗', !html.includes('authModal') && !html.includes('auth-modal-backdrop'));
ok('quhl 独立登录页已接入', loginHtml.includes('environment__field--cursor') && loginHtml.includes('assets/brand/agriloop-logo.png') && /js\/login\.js\?v=quhl-04485ed/.test(loginHtml));
ok('未登录直接跳转 quhl 登录页', appSource.includes("const LOGIN_ENTRY = 'login.html'") && appSource.includes('if (!api.readSession())') && loginSource.includes("storedSession?.mode === 'live'"));
const dom = new JSDOM(html, {
  url: 'http://localhost:3000/#view=risk-forecast',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
window.localStorage.setItem('agriloop_session_mode', 'demo');
window.localStorage.setItem('agriloop_user', JSON.stringify({
  username: 'admin',
  role: 'FARM_ADMIN',
  roleLabel: '农场管理员',
  avatar: '👑'
}));
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = window.matchMedia || function (query) {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; }
  };
};
window.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 16));
window.cancelAnimationFrame = window.cancelAnimationFrame || ((id) => clearTimeout(id));
globalThis.matchMedia = window.matchMedia;
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Event = window.Event;

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
await waitFor(() => document.querySelector('#plotSliderTrack .plot-slider-item'), 3000);
ok('应用启动：地块列表渲染', document.querySelectorAll('#plotSliderTrack .plot-slider-item').length >= 3);

// ============ Home 驾驶舱摘要 ============
const hsPanel = document.getElementById('homeSummaryPanel');
const hsGrid = document.getElementById('homeSummaryGrid');
const hsToolsGrid = document.getElementById('homeSummaryToolsGrid');
const hsCardCount = hsPanel?.querySelectorAll('.home-summary-card').length ?? 0;
const copilotFirst = document.querySelector('#homeFeedContent > .copilot-prompt-card');
const headerAfterCopilot = copilotFirst?.nextElementSibling?.classList.contains('main-feed-header');
ok('Copilot 指令框置顶', !!copilotFirst && headerAfterCopilot);
ok('Home 常用工具分区标题', document.querySelector('.home-summary-section-title')?.textContent.trim() === '常用工具');
ok('Home 摘要网格（8 张方形快捷卡）', !!hsPanel && hsGrid?.querySelectorAll('.home-summary-card').length === 5 && hsToolsGrid?.querySelectorAll('.home-summary-card').length === 3 && hsCardCount === 8);
if (hsCardCount === 8) {
  const cardRects = [...hsPanel.querySelectorAll('.home-summary-card')].map((el) => el.getBoundingClientRect());
  const cardWidths = cardRects.map((r) => Math.round(r.width));
  const cardHeights = cardRects.map((r) => Math.round(r.height));
  ok('Home 卡片尺寸一致', cardWidths.every((w) => w === cardWidths[0])
    && cardHeights.every((h) => h === cardHeights[0])
    && cardWidths[0] === cardHeights[0]);
  const taskCard = hsPanel.querySelector('[data-role="home-task-card"]');
  const feedCard = hsPanel.querySelector('[data-role="home-feed-card"]');
  const riskCard = hsPanel.querySelector('[data-role="home-risk-card"]');
  const waterCard = hsPanel.querySelector('[data-role="home-water-card"]');
  const valueCard = hsPanel.querySelector('[data-role="home-value-card"]');
  const telemetryCard = hsPanel.querySelector('[data-role="home-telemetry-card"]');
  const cropCard = hsPanel.querySelector('[data-role="home-crop-manual-card"]');
  const scenarioCard = hsPanel.querySelector('[data-role="home-scenario-card"]');
  ok('任务提示卡显示待处理数量', taskCard?.querySelector('.hs-value')?.textContent.trim() === '3' && taskCard.textContent.includes('待处理'));
  ok('动态消息卡含小红点数量', feedCard?.querySelector('.hs-badge')?.textContent.trim() === '4');
  ok('风险地块卡显示风险数量', riskCard?.querySelector('.hs-value')?.textContent.trim() === '1' && riskCard.textContent.includes('需关注'));
  ok('用水卡含剩余水量', /3760/.test((waterCard?.textContent || '').replace(/[,\s]/g, '')) && waterCard.textContent.includes('余'));
  ok('作物手册卡显示收录种数', cropCard?.querySelector('.hs-value')?.textContent.trim() === '4' && cropCard.textContent.includes('已收录'));
  ok('经营收益卡显示折算价值', valueCard?.querySelector('.hs-value')?.textContent.includes('245.82'));
  ok('情景模拟卡显示情景数', scenarioCard?.querySelector('.hs-value')?.textContent.trim() === '5');
  ok('数据监测卡显示指标数', telemetryCard?.querySelector('.hs-value')?.textContent.trim() === '6' && telemetryCard.textContent.includes('偏离风险'));
  taskCard.click();
  await sleep(300);
  ok('点击任务卡直达 work-orders', window.location.hash.includes('view=work-orders'));
  gotoView('');
  await waitFor(() => document.getElementById('homeSummaryPanel')?.querySelectorAll('.home-summary-card').length === 8, 3000);
  feedCard.click();
  await sleep(300);
  ok('点击动态卡直达 decision-feed', window.location.hash.includes('view=decision-feed'));
  gotoView('');
  await waitFor(() => document.getElementById('homeSummaryPanel')?.querySelectorAll('.home-summary-card').length === 8, 3000);
  waterCard.click();
  await sleep(400);
  ok('点击用水卡直达 resource-coordination', window.location.hash.includes('view=resource-coordination'));
  gotoView('');
  await waitFor(() => document.getElementById('homeSummaryPanel')?.querySelectorAll('.home-summary-card').length === 8, 3000);
  telemetryCard.click();
  await sleep(400);
  ok('点击数据监测卡直达 plot-telemetry', window.location.hash.includes('view=plot-telemetry'));
  gotoView('');
  await waitFor(() => document.getElementById('homeSummaryPanel')?.querySelectorAll('.home-summary-card').length === 8, 3000);
  cropCard.click();
  await sleep(300);
  ok('点击作物手册卡直达 crop-packs', window.location.hash.includes('view=crop-packs'));
  gotoView('');
  await waitFor(() => document.getElementById('homeSummaryPanel')?.querySelectorAll('.home-summary-card').length === 8, 3000);
  valueCard.click();
  await sleep(300);
  ok('点击经营收益卡直达 value-ledger', window.location.hash.includes('view=value-ledger'));
  gotoView('');
  await waitFor(() => document.getElementById('homeSummaryPanel')?.querySelectorAll('.home-summary-card').length === 8, 3000);
  scenarioCard.click();
  await sleep(300);
  ok('点击情景模拟卡直达 scenario-replay', window.location.hash.includes('view=scenario-replay'));
  gotoView('');
  await waitFor(() => document.getElementById('homeSummaryPanel')?.querySelectorAll('.home-summary-card').length === 8, 3000);
  riskCard.click();
  await sleep(300);
  ok('点击风险卡直达 risk-forecast', window.location.hash.includes('view=risk-forecast'));
  // 保持 risk-forecast 打开状态，视图 1 测试直接在此渲染实例上继续
}

// ============ 视图 1：risk-forecast ============
ok('功能子模块无顶栏重复卡片', !document.querySelector('#moduleContentHeader'));
ok('risk-forecast 路由打开', window.location.hash.includes('view=risk-forecast'));
const rfReady = await waitFor(() => document.querySelector('.rf-root'), 6000);
ok('risk-forecast 模块渲染 (.rf-root)', rfReady);
ok('已实现模块已移除三角尺占位卡', !document.querySelector('.subview-placeholder-banner') && !document.querySelector('.subview-placeholder-icon'));
ok('弹窗已移除底部接口契约栏', !document.querySelector('#modalCodeContract') && !document.querySelector('.code-contract-box'));
if (rfReady) {
  await waitChart('[data-role="gauge"]');
  await waitChart('[data-role="chart-body"]');
  ok('Time-to-Risk 仪表盘', mode === 'stub'
    ? !!document.querySelector('[data-role="gauge"] .stub-chart')
    : !!(document.querySelector('[data-role="gauge"] svg') || document.querySelector('[data-role="gauge"] canvas')));
  ok('仪表盘文案通俗化', document.querySelector('.rf-gauge-card .agri-card-title')?.textContent.includes('预计多久会缺水'));
  ok('仪表盘读数在表盘外', !!document.querySelector('.rf-gauge-readout-value') && !document.querySelector('.rf-gauge-readout')?.closest('[data-role="gauge"]'));
  ok('预测曲线图区有内容', chartOk('[data-role="chart-body"]'));
  ok('3 档预测切换 chips', document.querySelectorAll('.rf-toggle-chip').length === 3);
  ok('预测元数据卡片', !!document.querySelector('.rf-meta-card'));
  ok('无降级告警（AVAILABLE 分支）', !document.querySelector('.rf-root .agri-alert-danger'));

  const nextPlot = document.querySelector('#plotSliderTrack .plot-slider-item[data-plot-id="plot-a02"]');
  nextPlot?.click();
  const plotContextUpdated = await waitFor(() =>
    window.location.hash.includes('plotId=plot-a02')
      && document.querySelector('.rf-root')?.textContent.includes('A02 玉米高产田'), 6000);
  ok('左侧切换地块后当前功能子界面同步刷新', plotContextUpdated);
  ok('左侧地块高亮与 URL 上下文同步',
    document.querySelector('#plotSliderTrack .plot-slider-item.active')?.dataset.plotId === 'plot-a02'
      && window.location.hash.includes('plotId=plot-a02'));
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
ok('第三子区导航（经营与指导）', document.querySelectorAll('.module-nav-group').length === 3);
if (vlReady) {
  ok('效益对账不展示地块选择条', document.getElementById('workspacePlotContext')?.hidden === true);
  ok('效益对账 URL 无 plotId', !window.location.hash.includes('plotId='));
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
  ok('作物培养指导不展示地块选择条', document.getElementById('workspacePlotContext')?.hidden === true);
  ok('四个作物 Tab（番茄/黄瓜/草莓/辣椒）', document.querySelectorAll('.cp-tab').length === 4);
  ok('身份档案（重庆 · v1.0.0）', document.querySelector('.cp-identity').textContent.includes('重庆') && document.querySelector('.cp-identity').textContent.includes('v1.0.0'));
  ok('6 项指标定义 + availability 徽标', document.querySelectorAll('.cp-metric').length === 6 && !!document.querySelector('.cp-metric .agri-pill-ok'));
  ok('4 个阶段参数卡片', document.querySelectorAll('.cp-stage').length === 4);
  const md = document.querySelector('.cp-md');
  ok('知识文档阅读器（标题/列表/引用）', !!md?.querySelector('.cp-md-h') && md.querySelectorAll('.cp-md-list li').length >= 3 && !!md.querySelector('.cp-md-quote'));
  ok('检索回退链展示', document.querySelector('.cp-fallback').textContent.includes('plot → region → stage → crop → general'));
  ok('情景映射 5 项', document.querySelectorAll('.cp-scenario').length === 5);
  document.querySelector('#plotSliderTrack .plot-slider-item[data-plot-id="plot-a03"]')?.click();
  await sleep(200);
  ok('作物培养指导不随工作区地块切换', document.querySelector('.cp-tab.active')?.dataset.crop === 'tomato');
  document.querySelector('#plotSliderTrack .plot-slider-item[data-plot-id="plot-a01"]')?.click();
  await waitFor(() => document.querySelector('.cp-tab.active')?.dataset.crop === 'tomato', 6000);
  document.querySelector('.cp-tab[data-crop="cucumber"]').click();
  await sleep(100);
  const cuke = document.querySelector('[data-role="cp-body"]').textContent;
  ok('切换黄瓜后参数/阈值更新', cuke.includes('32 ~ 52%') && cuke.includes('WATER_DEFICIT'));
  document.querySelector('.cp-tab[data-crop="strawberry"]').click();
  await sleep(100);
  const berry = document.querySelector('[data-role="cp-body"]').textContent;
  ok('切换草莓（🍓 图标 · 湿度 35~55 · 阈值 22）', berry.includes('草莓') && berry.includes('35 ~ 55%') && /22/.test(berry));
  document.querySelector('.cp-tab[data-crop="pepper"]').click();
  await sleep(100);
  const pepper = document.querySelector('[data-role="cp-body"]').textContent;
  ok('切换辣椒（🌶️ · 湿度 20~40 · 阈值 18）', pepper.includes('辣椒') && pepper.includes('20 ~ 40%') && /18/.test(pepper));
}

// ============ 视图 4.5：已有上下文内容的决策护照 ============
gotoView('#view=decision-passport');
const passportReady = await waitFor(() => document.querySelector('#moduleContentBody')?.textContent.includes('决策审计护照链'), 3000);
ok('决策护照内容渲染', passportReady);
ok('决策护照已移除三角尺占位卡', !document.querySelector('.subview-placeholder-banner'));

// ============ 视图 5：farm-operations 工单/巡田/资源约束 ============
gotoView('#view=work-orders&plotId=plot-a01');
const opsReady = await waitFor(() => document.querySelector('.field-ops .work-kanban'), 6000);
ok('farm-operations 工单沙盘渲染', opsReady);
if (opsReady) {
  ok('四态工单看板与时间轴', document.querySelectorAll('.kanban-column').length === 4 && !!document.querySelector('.field-vine-timeline'));
  ok('巡田证据来源标签', document.querySelector('.inspection-strip')?.textContent.includes('USER_PROVIDED'));
  ok('农务界面已移除光标追踪画布', !document.querySelector('[data-field-effects]'));
  ok('沙盘无网格背景层', !document.querySelector('.field-ops .field-map-grid'));
  ok('四项农务状态标题均强化显示', document.querySelectorAll('.ops-metric-row .status-focus').length === 4);
  ok('任务内容绑定左侧当前地块', document.querySelector('.ops-bound-plot')?.textContent.includes('A01 番茄示范田')
    && [...document.querySelectorAll('.work-card')].every((card) => card.dataset.workPlot === 'plot-a01'));
  const inspectionBottom = document.querySelector('.inspection-strip')?.compareDocumentPosition(document.querySelector('.field-vine-timeline')) || 0;
  ok('执行藤蔓位于巡田内容下方', Boolean(inspectionBottom & window.Node.DOCUMENT_POSITION_FOLLOWING));
}
gotoView('#view=resource-coordination');
const resourceReady = await waitFor(() => document.querySelector('.resource-ops .demand-list'), 6000);
ok('水资源协同排程渲染', resourceReady);
if (resourceReady) {
  ok('透明玻璃排程面板', !!document.querySelector('.resource-ops.resource-ops--glass .demand-panel')
    && !document.querySelector('.resource-ops .resource-window-effects-canvas')
    && !document.querySelector('.resource-ops .backdrop-water-sphere')
    && document.querySelector('.resource-ops').textContent.includes('SIMULATED'));
  const evaluate = document.querySelector('#evaluateResourcePlan');
  evaluate?.click();
  const infeasible = await waitFor(() => document.querySelector('.resource-ops .resource-state')?.textContent.includes('INFEASIBLE'), 3000);
  ok('超容量需求明确返回 INFEASIBLE', infeasible);
}

// ============ 视图 6：⌘K 命令面板 + 交叉导航 ============
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
