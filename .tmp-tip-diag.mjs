/** 诊断：触发 value-ledger 柱状图 tooltip，dump 其 DOM 与 cssText，检查 extraCssText 是否生效 */
import { readFileSync } from 'node:fs';
const { JSDOM } = await import('./.tools/node_modules/jsdom/lib/api.js');

const dom = new JSDOM(readFileSync('apps/web-ui/index.html', 'utf8'), {
  url: 'http://localhost:3000/', runScripts: 'outside-only', pretendToBeVisual: true
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.eval(readFileSync('apps/web-ui/vendor/echarts.min.js', 'utf8'));
console.log('echarts:', window.echarts?.version);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, t = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < t) {
    try { if (fn()) return true; } catch (e) {}
    await sleep(50);
  }
  return false;
};

await import('./apps/web-ui/js/app.js');
document.dispatchEvent(new window.Event('DOMContentLoaded'));
await waitFor(() => document.querySelector('#plotListContainer .plot-list-item'));
window.location.hash = '#view=value-ledger';
await waitFor(() => document.querySelector('.vl-kpi-grid'), 6000);
await sleep(500); // 等图表渲染

// 找所有 echarts 实例
const barEl = document.querySelector('[data-role="bar-chart"]');
console.log('bar-chart innerHTML length:', barEl.innerHTML.length);
const chart = window.echarts.getInstanceByDom(barEl) || window.echarts.getInstanceByDom(barEl.firstElementChild);
console.log('instance found:', !!chart, '| dom tag:', chart?.getDom()?.tagName, '| dom class:', chart?.getDom()?.className);

if (chart) {
  // 触发 tooltip 显示（dataIndex 11 -> 08-12）
  chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 11 });
  await sleep(400);
  const root = chart.getDom();
  const allDivs = [...root.querySelectorAll('div')];
  console.log('chart dom div count:', allDivs.length);
  allDivs.forEach((d, i) => {
    const css = d.getAttribute('style') || '';
    if (css.includes('position:absolute') || css.includes('z-index')) {
      console.log(`\n--- div[${i}] style ---`);
      console.log(css);
      console.log(`--- div[${i}] innerHTML (first 200) ---`);
      console.log(d.innerHTML.replace(/\s+/g, ' ').slice(0, 200));
      console.log(`--- parent: ${d.parentElement?.className || d.parentElement?.tagName}`);
    }
  });
  // 直接找 tooltip：z-index 9999999
  const tip = allDivs.find(d => (d.getAttribute('style') || '').includes('9999999'));
  if (tip) {
    const css = tip.getAttribute('style') || '';
    console.log('\n===== TOOLTIP style =====');
    console.log(css);
    console.log('max-width 生效:', /max-width:\s*320px/.test(css), '| !important:', css.includes('max-width: 320px !important'));
    console.log('line-height 16px !important:', css.includes('line-height: 16px !important'));
    console.log('background #21262d:', css.includes('#21262d'));
    console.log('===== TOOLTIP content =====');
    console.log(tip.innerHTML.replace(/\s+/g, ' ').slice(0, 300));
  } else {
    console.log('tooltip div (z-index 9999999) NOT found');
  }
}
dom.window.close();
