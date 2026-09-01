import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLE_DEFINITIONS } from '../js/roles.js';

const viewSource = readFileSync(new URL('../js/modules/admin-market-insights.js', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../js/api.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../css/modules/admin-market.css', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('market workspace is visible only to farm administrators', () => {
  assert.ok(ROLE_DEFINITIONS.FARM_ADMIN.views.includes('market-insights'));
  assert.ok(ROLE_DEFINITIONS.FARM_ADMIN.permissions.includes('market-price:read'));
  assert.ok(!ROLE_DEFINITIONS.FARMER.views.includes('market-insights'));
  assert.ok(!ROLE_DEFINITIONS.SYSTEM_ADMIN.views.includes('market-insights'));
  assert.match(appSource, /id: 'market-insights', label: '市场行情'/);
});

test('formal market data uses the farm-scoped backend endpoint while demo stays explicit', () => {
  assert.match(apiSource, /async getMarketPrices\(/);
  assert.match(apiSource, /\/api\/v1\/market-prices\?/);
  assert.match(apiSource, /this\.sessionMode === 'live'/);
  assert.match(apiSource, /sourceStatus: 'DEMO'/);
  assert.match(apiSource, /当前为演示行情，不是真实市场价格，不得用于销售决策/);
  assert.match(viewSource, /官方日行情/);
  assert.match(viewSource, /最近归档行情/);
  assert.match(viewSource, /重庆优先 · 全国市场后备/);
  assert.match(viewSource, /全国上报市场简单均值/);
});

test('price chart preserves missing dates and discloses its scale and source limits', () => {
  assert.match(viewSource, /chartHistory = computed/);
  assert.match(viewSource, /if \(value == null \|\| value === ''\) return null/);
  assert.match(viewSource, /price: null, minPrice: null, maxPrice: null/);
  assert.match(viewSource, /connectNulls: false/);
  assert.doesNotMatch(viewSource, /history\.map\([^\n]+\)\.filter\(point => point\[1\] != null\)/);
  assert.match(viewSource, /纵轴按当前/);
  assert.match(viewSource, /不从 0 起/);
  assert.match(viewSource, /缺失日期不连线、不插值/);
  assert.match(viewSource, /STIX Two Text/);
  assert.match(viewSource, /aria: \{ enabled: true/);
  assert.match(viewSource, /查看真实归档日价明细/);
  assert.match(viewSource, /非自动卖出信号/);
});

test('domestic market uses observed national fallback and isolates simulated trend from real facts', () => {
  assert.match(viewSource, /真实当日价优先重庆、缺失时采用全国市场简单均值/);
  assert.match(viewSource, /buildDomesticMarketScenario/);
  assert.match(viewSource, /SIMULATED/);
  assert.match(viewSource, /不写入数据库、不参与涨跌、均价或销售观察/);
  assert.match(viewSource, /查看真实归档日价明细/);
  assert.match(viewSource, /aria-label="国内历史范围"/);
  assert.match(viewSource, /近7日/);
  assert.match(viewSource, /近30日/);
  assert.match(viewSource, /近90日/);
  assert.match(viewSource, /今日暂无上报报价/);
  assert.doesNotMatch(viewSource, /国际参考|DEFRA|referencePeriods|chartMode|buildReferenceChartHistory|market-reference-banner|market-chart-mode-switch/);
  assert.doesNotMatch(styles, /market-reference-banner|market-chart-mode-switch/);
});

test('market UI has redundant rise/fall encoding and responsive terminal layout', () => {
  assert.match(styles, /--market-up: #d64b45/);
  assert.match(styles, /--market-down: #16834b/);
  assert.match(viewSource, /changeTone\(item\.changePct\) === 'up' \? '↑'/);
  assert.match(styles, /@media \(max-width: 1100px\)/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(indexSource, /admin-market\.css\?v=20260901-v598-domestic-data-v1/);
  assert.match(indexSource, /js\/app\.js\?v=20260901-v5910-main-merge-v1/);
});
