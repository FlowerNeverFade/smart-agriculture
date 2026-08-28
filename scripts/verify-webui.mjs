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
const resourceSource = read('apps/web-ui/js/modules/admin-resource-center.js');
const farmerStyle = read('apps/web-ui/css/farmer.css');
const openApi = read('docs/api/openapi.yaml');

const dashboardStart = farmerHtml.indexOf('key="dashboard"');
const plotsStart = farmerHtml.indexOf('key="plots"');
const farmerDashboard = dashboardStart >= 0 && plotsStart > dashboardStart
  ? farmerHtml.slice(dashboardStart, plotsStart)
  : '';

ok('入口脚本带版本参数', /js\/app\.js\?v=[^"']+/.test(indexHtml));
ok('五个地块场景已注册', ['NORMAL', 'DROUGHT', 'HEAVY_RAIN', 'SENSOR_DRIFT', 'DEVICE_OFFLINE'].every((code) => apiSource.includes(`code: '${code}'`)));
ok('模拟策略 REST 与重置接口已接线', ['/simulation`', '/simulation/reset`', 'PLOT_SIMULATION_DEFAULTS'].every((part) => apiSource.includes(part)) && openApi.includes('/api/v1/plots/{plotId}/simulation/reset'));
ok('降雨指标贯通前端', appSource.includes('RAINFALL') && apiSource.includes("'RAINFALL'") && farmerSource.includes("code: 'RAINFALL'"));
ok('参数预览与保存控件存在', indexHtml.includes('simulationFields') && indexHtml.includes('保存到此地块') && appSource.includes('localPreviewCurve'));
ok('历史/预测重置按钮存在', indexHtml.includes('重置历史曲线') && indexHtml.includes('重置预测曲线') && apiSource.includes('resetPlotSimulation'));
ok('地块详情支持八类曲线并与历史锚点连续', indexHtml.includes('simulationMetricOptions') && appSource.includes('alignForecastToHistory') && appSource.includes('forecastStart + item.minute * 60000'));
ok('三类曲线支持局部浮窗', appSource.includes("trigger: 'axis'") && farmerHtml.includes('show_chart_tooltip') && farmerStyle.includes('.farmer-chart-tooltip'));
ok('正式会话具备实时刷新与事件流重连', appSource.includes('LIVE_FARM_REFRESH_DOMAINS') && appSource.includes('setInterval(runLivePoll') && farmerSource.includes('setInterval(poll_live_telemetry, 5000)') && farmerSource.includes('if (refreshed) await load_farmer_enhancements()') && apiSource.includes('system event stream reconnect failed'));
ok('硬件 REAL 状态优先', liveDataSource.includes('hardwareBound') && appSource.includes('hardwareLabel'));
ok('系统管理员总览指标循环作用域安全', !indexHtml.includes('v-for="metric in telemetryMetrics" v-if='));
ok('无冲突标记', ![indexHtml, appSource, apiSource, farmerHtml, farmerSource].some((source) => /^(?:<<<<<<<|=======|>>>>>>>)(?: |$)/m.test(source)));
ok('农户首页优先事项与建议闭环契约', farmerDashboard.includes('今天先做什么') && farmerDashboard.includes('today_priorities') && farmerHtml.includes('farmer-suggestion-flow') && farmerHtml.includes('查看建议并执行') && farmerSource.includes('submitDecisionFeedback'));
ok('农户首页隐藏内部能力编号', !farmerDashboard.includes('I-16 · I-27') && !farmerDashboard.includes('I-18 · I-26'));
ok('首页地块摘要不渲染原始指标且详情保留曲线', !farmerDashboard.includes('farmer-plot-overview-metrics') && farmerHtml.includes('环境与肥力指标趋势'));
ok('农户灌溉安全边界', farmerSource.includes("open_suggestion('IRRIGATION'") && farmerSource.includes('api.executeIrrigation(plan.planId') && farmerSource.includes('confirmed: true') && farmerSource.includes('farmer-irrigation-'));
ok('共享入口支持当前操作人直接执行', appSource.includes('canExecuteIrrigationRole') && appSource.includes('api.executeIrrigation(plan.planId') && farmerHtml.includes('查看建议并执行'));
ok('设备组件暴露来源标签并接入安全开关', resourceSource.includes('healthLabel, sourceLabel, deviceTypeLabel')
  && resourceSource.includes('controlDevice(device)') && apiSource.includes('/control'));

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

  window.location.hash = '#view=decision-console&farmId=farm-demo';
  const alertCenter = await waitFor(() => Boolean(window.document.querySelector('.admin-alert-view[aria-label="AI告警分析与智能处理"]')), 3500);
  ok('农场管理员 AI 告警中心可打开', alertCenter);
  await waitFor(() => Boolean(window.document.querySelector('.admin-alert-batch-bar')), 1500);
  const batchBarText = window.document.querySelector('.admin-alert-batch-bar')?.textContent || '';
  ok('告警中心保留 main 卡片网格与批量入口', alertCenter
    && Boolean(window.document.querySelector('.admin-alert-batch-bar'))
    && batchBarText.includes('全选当前列表')
    && batchBarText.includes('AI智能处理')
    && batchBarText.includes('一键发布核查任务'));
  ok('告警中心已移除旧操作入口', alertCenter
    && !/\u786e认收到|\u5347级处理|\u8f6c成任务|一键下发任务/.test(window.document.querySelector('.admin-alert-view')?.textContent || '')
    && !window.document.querySelector('.admin-alert-view h2'));
  const initialAlertCards = window.document.querySelectorAll('.admin-alert-card').length;
  ok('告警中心提供至少七条不同场景的演示告警', initialAlertCards >= 7, `cards=${initialAlertCards}`);
  const selectAllAlerts = window.document.querySelector('.admin-alert-select-all input');
  selectAllAlerts?.click();
  const aiProcessButton = window.document.querySelector('.admin-alert-batch-actions .g-btn.primary');
  aiProcessButton?.click();
  const aiProcessed = await waitFor(() => {
    const summary = window.document.querySelector('.admin-alert-ai-summary')?.textContent || '';
    return summary.includes('本次已分析 7 条告警')
      && summary.includes('智能下发 2 条')
      && summary.includes('需现场核查 5 条');
  }, 2500);
  ok('AI 智能处理可自动下发高可信告警并保留不确定项', aiProcessed,
    window.document.querySelector('.admin-alert-ai-summary')?.textContent.replace(/\s+/g, ' ').trim() || 'no summary');
  const verificationButton = window.document.querySelector('.admin-alert-verify-action');
  verificationButton?.click();
  const verificationPublished = await waitFor(() => {
    const firstTab = window.document.querySelector('.admin-alert-tabs button:first-child')?.textContent || '';
    return firstTab.includes('待审核 0');
  }, 3000);
  ok('AI 不确定告警可一键发布现场核查任务', verificationPublished,
    window.document.querySelector('.g-toast:last-child')?.textContent.replace(/\s+/g, ' ').trim() || 'no toast');
  window.document.querySelector('.admin-alert-tabs button:nth-child(4)')?.click();
  await waitFor(() => window.document.querySelectorAll('.admin-alert-card').length === initialAlertCards, 1200);
  const cardsBeforeSingleClose = window.document.querySelectorAll('.admin-alert-card').length;
  window.document.querySelector('.admin-alert-card')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const alertDetailReady = await waitFor(() => Boolean(window.document.querySelector('.admin-alert-detail')), 1000);
  const detailCloseButton = window.document.querySelector('.admin-alert-detail-footer .admin-alert-close-action');
  detailCloseButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const singleCloseRemovedCard = await waitFor(() => window.document.querySelectorAll('.admin-alert-card').length === cardsBeforeSingleClose - 1, 2000);
  ok('详情关闭后卡片立即从未关闭列表移除', cardsBeforeSingleClose > 0 && alertDetailReady && singleCloseRemovedCard);
  await waitFor(() => Boolean(window.document.querySelector('.admin-decision-tabs button:nth-child(2)')), 1500);
  const chatTab = window.document.querySelector('.admin-decision-tabs button:nth-child(2)');
  chatTab?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const chatReady = await waitFor(() => Boolean(window.document.querySelector('.admin-ai-chat textarea')), 3500);
  if (!chatReady) {
    console.warn('AI 对话切换调试：', window.document.querySelector('.role-decision-shell')?.innerHTML?.slice(0, 1600) || '未挂载');
  }
  ok('农场管理员完整 AI 对话页可切换', chatReady
    && window.document.body.textContent.includes('新对话')
    && window.document.body.textContent.includes('AI 可能会出错，请核对重要信息'));
  await waitFor(() => chatReady && !window.document.querySelector('.admin-ai-history-loading'), 1500);
  const newConversationButton = window.document.querySelector('.admin-ai-chat-tools .g-btn');
  newConversationButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const suggestionsReady = await waitFor(() => window.document.querySelectorAll('.admin-ai-suggestions button').length === 4, 1500);
  ok('新对话后经典空白页快捷问题和底部输入框可见', suggestionsReady
    && Boolean(window.document.querySelector('.admin-ai-message-list.is-empty .admin-ai-empty-state .admin-ai-suggestions'))
    && Boolean(window.document.querySelector('.admin-ai-compose-area .admin-ai-composer'))
    && !window.document.querySelector('.admin-ai-chat h2'));

  window.location.hash = '#view=resource-coordination&tab=devices&farmId=farm-demo';
  const equipmentReady = await waitFor(() => Boolean(window.document.querySelector('.admin-equipment-center'))
    && Boolean(window.document.querySelector('.admin-device-panel')), 3500);
  const equipmentCards = window.document.querySelectorAll('.admin-device-card:not(.admin-add-device-card)');
  ok('设备真实数据到达后页面仍保持可见', equipmentReady && equipmentCards.length > 0,
    `cards=${equipmentCards.length}`);
  ok('设备卡片提供在线/离线控制入口', equipmentReady && Boolean(window.document.querySelector('.admin-device-control-button')));

  window.location.hash = '#view=work-orders&tab=tasks&farmId=farm-demo';
  const workOrdersReady = await waitFor(() => Boolean(window.document.querySelector('.work-lifecycle.is-embedded-manager')), 3500);
  const workSummaryLabels = [...window.document.querySelectorAll('.work-summary button span')].map((element) => element.textContent.trim());
  const statusOptions = [...window.document.querySelectorAll('.work-filters label:first-child option')].map((element) => element.textContent.trim());
  ok('农务任务导航与状态下拉统一为五个互斥分区', workOrdersReady
    && JSON.stringify(workSummaryLabels) === JSON.stringify(['进行中', '待分配', '待验收', '已逾期', '已完成'])
    && JSON.stringify(statusOptions) === JSON.stringify(workSummaryLabels));
  ok('返工任务在进行中卡片显示返工标记', workOrdersReady
    && Boolean(window.document.querySelector('.work-order-card.status-rejected .work-rework'))
    && !workSummaryLabels.some((label) => label.includes('返工')));

  window.location.hash = '#view=work-orders&tab=tasks&scope=overdue&farmId=farm-demo';
  const overdueReady = await waitFor(() => Boolean(window.document.querySelector('.work-overdue-disposition'))
    && window.document.querySelectorAll('.work-order-card.is-overdue').length > 0, 3500);
  const manualDisposition = window.document.querySelector('.work-overdue-manual-action');
  manualDisposition?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const assignmentReady = await waitFor(() => Boolean(window.document.querySelector('.work-dialog-small select')), 1500);
  const eligiblePeople = window.document.querySelectorAll('.work-dialog-small select option').length - 1;
  ok('逾期任务支持单独选择有地块权限的人员处置', overdueReady && assignmentReady && eligiblePeople >= 2);
  window.document.querySelector('.work-dialog-small .g-modal-header .icon-only')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor(() => !window.document.querySelector('.work-dialog-small'), 800);
  const initialOverdueCards = [...window.document.querySelectorAll('.work-order-card.is-overdue')];
  const reassignedOrderId = initialOverdueCards[0]?.dataset.workOrderId;
  const disposedOrderId = initialOverdueCards[1]?.dataset.workOrderId;
  initialOverdueCards[0]?.querySelector('.work-overdue-card-select input')?.click();
  await waitFor(() => Boolean(window.document.querySelector('.work-overdue-reassign:not(:disabled)')), 800);
  const batchReassignButton = window.document.querySelector('.work-overdue-reassign');
  const batchEnabled = Boolean(batchReassignButton && !batchReassignButton.disabled);
  batchReassignButton?.click();
  const reassignedLeftOverdue = await waitFor(() => window.document.querySelectorAll('.work-order-card.is-overdue').length === 1, 2000);
  const remainingOverdueCard = window.document.querySelector('.work-order-card.is-overdue');
  remainingOverdueCard?.querySelector('.work-overdue-card-select input')?.click();
  await waitFor(() => Boolean(window.document.querySelector('.work-overdue-dispose:not(:disabled)')), 800);
  const disposeButton = window.document.querySelector('.work-overdue-dispose');
  const disposeEnabled = Boolean(disposeButton && !disposeButton.disabled);
  disposeButton?.click();
  const disposedLeftOverdue = await waitFor(() => window.document.querySelectorAll('.work-order-card.is-overdue').length === 0, 2000);

  window.location.hash = '#view=work-orders&tab=tasks&status=IN_PROGRESS&farmId=farm-demo';
  const recoveredTasksVisible = await waitFor(() => {
    const reassignedCard = window.document.querySelector(`[data-work-order-id="${reassignedOrderId}"]`);
    const disposedCard = window.document.querySelector(`[data-work-order-id="${disposedOrderId}"]`);
    return reassignedCard?.textContent.includes('赵霞') && disposedCard?.textContent.includes('张明');
  }, 2500);
  ok('逾期一键重新分配会更换农户并立即转入进行中', overdueReady && initialOverdueCards.length >= 2
    && batchEnabled && reassignedLeftOverdue && recoveredTasksVisible,
  `reassigned=${reassignedOrderId} toast=${window.document.querySelector('.g-toast:last-child')?.textContent.replace(/\s+/g, ' ').trim() || 'none'}`);
  ok('逾期一键处置会保留原负责人并立即转入进行中', disposeEnabled && disposedLeftOverdue && recoveredTasksVisible,
    `disposed=${disposedOrderId} remaining=${window.document.querySelectorAll('.work-order-card.is-overdue').length}`);

  window.location.hash = '#view=plot-detail&plotId=plot-a01';
  const detail = await waitFor(() => window.document.body.textContent.includes('地块模拟策略'), 3500);
  ok('地块详情显示独立策略设置', detail);
  ok('地块详情显示五个场景', detail && window.document.querySelectorAll('.plot-simulation-scenario').length === 5);
  ok('地块详情显示曲线悬浮提示文案', detail && window.document.body.textContent.includes('鼠标悬停查看局部数据'));
  const metricSelector = window.document.querySelector('.plot-simulation-metric-picker select');
  ok('地块详情显示八个曲线指标', detail && metricSelector?.querySelectorAll('option').length === 8);
  if (metricSelector) {
    metricSelector.value = 'AIR_TEMPERATURE';
    metricSelector.dispatchEvent(new window.Event('change', { bubbles: true }));
    const switched = await waitFor(() => window.document.body.textContent.includes('空气温度：历史 + 策略预测'), 1500);
    ok('曲线指标切换可刷新标题', switched);
  }

  if (mode !== 'svg') {
    window.location.hash = '#view=risk-forecast';
    const risk = await waitFor(() => Boolean(window.document.querySelector('#riskChart')), 3500);
    ok('风险预测视图可打开', risk);
    ok('图表 renderer 已接收 option', risk && (!chart || Boolean(window.document.querySelector('#riskChart .stub-chart')) || window.document.querySelector('#riskChart').innerHTML.length > 50));
  } else {
    ok('SVG 模式不依赖 ECharts', typeof window.echarts === 'undefined');
  }
  await waitFor(() => !window.document.querySelector('.g-toast'), 4000);
  dom.window.close();
}

await mountIndex();
const failed = results.filter((item) => !item.pass);
console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过（mode=${mode}） =====`);
if (failed.length) {
  console.log('失败项：' + failed.map((item) => item.name).join('；'));
  process.exitCode = 1;
}
