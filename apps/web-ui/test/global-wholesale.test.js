import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  GLOBAL_WHOLESALE_MARKETS,
  demoBuyerQuoteCnyKg,
  estimateGlobalWholesaleRoute,
  greatCircleDistanceKm,
  routeFacts
} from '../js/modules/global-wholesale-data.js';

const viewSource = readFileSync(new URL('../js/modules/admin-global-wholesale.js', import.meta.url), 'utf8');
const marketViewSource = readFileSync(new URL('../js/modules/admin-market-insights.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../css/modules/admin-market.css', import.meta.url), 'utf8');
const mapBytes = readFileSync(new URL('../assets/maps/official-world-gs2016-1663.jpg', import.meta.url));

test('global wholesale catalog stays compact and offers multiple transport modes', () => {
  assert.equal(GLOBAL_WHOLESALE_MARKETS.length, 9);
  assert.equal(GLOBAL_WHOLESALE_MARKETS.reduce((sum, market) => sum + market.modes.length, 0), 19);
  assert.ok(GLOBAL_WHOLESALE_MARKETS.every(market => market.coordinates.length === 2));
  assert.ok(GLOBAL_WHOLESALE_MARKETS.some(market => market.modes.includes('RAIL')));
  assert.ok(GLOBAL_WHOLESALE_MARKETS.every(market => market.complianceHint));
});

test('route model is deterministic and exposes cheaper slower sea tradeoffs', () => {
  const tokyo = GLOBAL_WHOLESALE_MARKETS.find(market => market.id === 'tokyo');
  const air = routeFacts(tokyo, 'AIR');
  const sea = routeFacts(tokyo, 'SEA');
  assert.ok(greatCircleDistanceKm([106.5516, 29.563], tokyo.coordinates) > 2000);
  assert.ok(air.transitDays < sea.transitDays);
  assert.ok(air.freightCnyKg > sea.freightCnyKg);
  assert.ok(air.expectedLossPct < sea.expectedLossPct);
  assert.equal(air.provenance, 'SIMULATED');
});

test('landed-cost model keeps simulated provenance and blocks routes beyond shelf life', () => {
  const tokyo = GLOBAL_WHOLESALE_MARKETS.find(market => market.id === 'tokyo');
  const tomatoAir = estimateGlobalWholesaleRoute({
    cropCode: 'tomato', market: tokyo, mode: 'AIR', quantityKg: 1000,
    originPriceCnyKg: 4.8, packingCnyKg: 1.2, buyerQuoteCnyKg: demoBuyerQuoteCnyKg('tomato', tokyo)
  });
  const strawberrySea = estimateGlobalWholesaleRoute({ cropCode: 'strawberry', market: tokyo, mode: 'SEA' });
  assert.equal(tomatoAir.readinessStatus, 'NEEDS_EVIDENCE');
  assert.equal(strawberrySea.readinessStatus, 'UNAVAILABLE');
  assert.equal(tomatoAir.provenance, 'SIMULATED');
  assert.equal(tomatoAir.executable, false);
  assert.ok(tomatoAir.totalCostCny > 0);
  assert.ok(tomatoAir.sellableKg < tomatoAir.quantityKg);
  assert.ok(Number.isFinite(tomatoAir.landedCostCnyKg));
});

test('world map uses the complete official standard map with a separate lightweight overlay', () => {
  assert.equal(mapBytes.length, 536_363);
  assert.equal(createHash('sha256').update(mapBytes).digest('hex').toUpperCase(), 'EBD1A68E4E700347E2A542816229519D385FBC536C0CD87DC2607E51DDD04DD2');
  assert.match(viewSource, /official-world-gs2016-1663\.jpg/);
  assert.match(viewSource, /GS\(2016\)1663号/);
  assert.match(viewSource, /自然资源部标准地图服务系统/);
  assert.match(viewSource, /loading="lazy" decoding="async" fetchpriority="low"/);
  assert.match(viewSource, /global-route-overlay/);
  assert.match(viewSource, /global-map-destination/);
  assert.match(viewSource, /未裁切、未重绘边界/);
  assert.match(viewSource, /公开发布含覆盖层的地图前仍需按规定履行地图审核/);
  assert.doesNotMatch(viewSource, /natural-earth-110m|registerMap/i);
  assert.match(styles, /aspect-ratio: 4655 \/ 2444/);
  assert.match(styles, /vector-effect: non-scaling-stroke/);
  assert.match(viewSource, /右侧目的地列表和下方表格仍可继续使用/);
});

test('market workspace separates observed prices from simulated global planning', () => {
  assert.match(marketViewSource, /国内行情/);
  assert.match(marketViewSource, /全球批发/);
  assert.match(marketViewSource, /SIMULATED/);
  assert.match(viewSource, /0<\/strong> 个实时运费报价/);
  assert.match(viewSource, /不换汇、不进入本页到岸或毛差计算/);
  assert.match(viewSource, /毛差未计汇率、税务、资金占用、退货、质量分级与实际询价差异/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.global-wholesale-map/);
});
