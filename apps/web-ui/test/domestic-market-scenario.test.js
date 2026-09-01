import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDomesticMarketScenario } from '../js/modules/domestic-market-scenario.js';

test('domestic market scenario is deterministic, anchored and explicitly non-executable', () => {
  const crop = { cropCode: 'tomato', quoteDate: '2026-09-01', latestPrice: 4.25 };
  const first = buildDomesticMarketScenario(crop, 30);
  const second = buildDomesticMarketScenario(crop, 30);

  assert.deepEqual(first, second);
  assert.equal(first.length, 30);
  assert.equal(first[0].date, '2026-08-03');
  assert.equal(first.at(-1).date, '2026-09-01');
  assert.equal(first.at(-1).price, 4.25);
  assert.ok(first.every(point => point.price > 0));
  assert.ok(first.every(point => point.provenance === 'SIMULATED_SCENARIO' && point.executable === false));
});

test('domestic market scenario normalizes ranges and requires an observed price anchor', () => {
  assert.equal(buildDomesticMarketScenario({ cropCode: 'rice', quoteDate: '2026-09-01', latestPrice: 5 }, 6).length, 7);
  assert.equal(buildDomesticMarketScenario({ cropCode: 'rice', quoteDate: '2026-09-01', latestPrice: 5 }, 22).length, 30);
  assert.equal(buildDomesticMarketScenario({ cropCode: 'rice', quoteDate: '2026-09-01', latestPrice: 5 }, 50).length, 90);
  assert.deepEqual(buildDomesticMarketScenario({ cropCode: 'rice', latestPrice: null }, 30), []);
});
