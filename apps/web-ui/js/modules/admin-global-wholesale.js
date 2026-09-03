import {
  GLOBAL_ROUTE_PROFILES,
  GLOBAL_WHOLESALE_MARKETS,
  GLOBAL_WHOLESALE_ORIGIN,
  demoBuyerQuoteCnyKg,
  estimateGlobalWholesaleRoute,
  exportCropProfile,
  routeFacts
} from './global-wholesale-data.js?v=20260902-v5911-zhcn-v1';

const { ref, computed, watch } = Vue;
const OFFICIAL_WORLD_MAP_URL = new URL('../../assets/maps/official-world-gs2016-1663.jpg', import.meta.url).href;
const OFFICIAL_WORLD_MAP = Object.freeze({
  reviewNumber: 'GS(2016)1663号',
  width: 4655,
  height: 2444,
  sourceUrl: 'http://bzdt.ch.mnr.gov.cn/'
});
const MAP_VIEWBOX = Object.freeze({ width: 1000, height: 525 });
const OFFICIAL_MAP_BOUNDS = Object.freeze({ left: 3.1, right: 96.9, top: 5.7, bottom: 95.3, centralMeridian: 150 });
const ROUTE_FILTERS = Object.freeze([
  { value: 'ALL', label: '全部方式' },
  { value: 'AIR', label: '航空冷链' },
  { value: 'RAIL', label: '铁路冷链' },
  { value: 'SEA', label: '海运冷链' }
]);

function finite(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberText(value, digits = 1) {
  const parsed = finite(value);
  return parsed == null ? '—' : parsed.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function moneyText(value) {
  const parsed = finite(value);
  return parsed == null ? '—' : parsed.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function readinessMeta(status) {
  return ({
    NEEDS_EVIDENCE: { label: '需补询价与合规证据', tone: 'evidence' },
    HUMAN_REVIEW: { label: '接近保鲜窗口 · 人工复核', tone: 'review' },
    UNAVAILABLE: { label: '超过保鲜窗口', tone: 'unavailable' }
  })[String(status || '').toUpperCase()] || { label: '待测算', tone: 'evidence' };
}

function officialMapPoint(coordinates) {
  const [longitude, latitude] = Array.isArray(coordinates) ? coordinates.map(Number) : [0, 0];
  const wrappedLongitude = ((longitude - OFFICIAL_MAP_BOUNDS.centralMeridian + 540) % 360) - 180;
  const longitudeRatio = (wrappedLongitude + 180) / 360;
  const latitudeRatio = (90 - Math.max(-90, Math.min(90, latitude))) / 180;
  const left = OFFICIAL_MAP_BOUNDS.left + longitudeRatio * (OFFICIAL_MAP_BOUNDS.right - OFFICIAL_MAP_BOUNDS.left);
  const top = OFFICIAL_MAP_BOUNDS.top + latitudeRatio * (OFFICIAL_MAP_BOUNDS.bottom - OFFICIAL_MAP_BOUNDS.top);
  return Object.freeze({
    left: Number(left.toFixed(2)),
    top: Number(top.toFixed(2)),
    x: Number((left * MAP_VIEWBOX.width / 100).toFixed(2)),
    y: Number((top * MAP_VIEWBOX.height / 100).toFixed(2))
  });
}

export const AdminGlobalWholesalePanel = {
  name: 'AdminGlobalWholesalePanel',
  props: {
    crops: { type: Array, default: () => [] },
    selectedCropCode: { type: String, default: '' },
    farmId: { type: String, default: '' },
    sessionMode: { type: String, default: 'demo' }
  },
  emits: ['select-crop'],
  setup(props, { emit }) {
    const mapError = ref('');
    const routeFilter = ref('ALL');
    const selectedMarketId = ref('tokyo');
    const selectedRouteMode = ref('AIR');
    const quantityKg = ref(1000);
    const originPriceCnyKg = ref(0);
    const packingCnyKg = ref(1.2);
    const buyerQuoteCnyKg = ref(0);
    const originPriceSource = ref('SIMULATED');
    const buyerQuoteSource = ref('SIMULATED');

    const selectedCrop = computed(() => props.crops.find(item => item.cropCode === props.selectedCropCode) || props.crops[0] || null);
    const cropProfile = computed(() => exportCropProfile(selectedCrop.value?.cropCode));
    const filteredMarkets = computed(() => routeFilter.value === 'ALL'
      ? GLOBAL_WHOLESALE_MARKETS
      : GLOBAL_WHOLESALE_MARKETS.filter(market => market.modes.includes(routeFilter.value)));
    const selectedMarket = computed(() => filteredMarkets.value.find(market => market.id === selectedMarketId.value)
      || GLOBAL_WHOLESALE_MARKETS.find(market => market.id === selectedMarketId.value)
      || filteredMarkets.value[0]
      || GLOBAL_WHOLESALE_MARKETS[0]);
    const selectedRouteFacts = computed(() => routeFacts(selectedMarket.value, selectedRouteMode.value));
    const selectedEstimate = computed(() => estimateGlobalWholesaleRoute({
      cropCode: selectedCrop.value?.cropCode,
      market: selectedMarket.value,
      mode: selectedRouteMode.value,
      quantityKg: quantityKg.value,
      originPriceCnyKg: originPriceCnyKg.value,
      packingCnyKg: packingCnyKg.value,
      buyerQuoteCnyKg: buyerQuoteCnyKg.value
    }));
    const selectedReadiness = computed(() => readinessMeta(selectedEstimate.value?.readinessStatus));
    const selectedInternationalReference = computed(() => selectedMarket.value?.id === 'london' ? selectedCrop.value?.internationalReference || null : null);
    const latestInternationalPoint = computed(() => {
      const points = selectedInternationalReference.value?.points;
      return Array.isArray(points) && points.length ? [...points].sort((left, right) => String(left.date).localeCompare(String(right.date))).at(-1) : null;
    });
    const routeOptions = computed(() => selectedMarket.value?.modes?.map(code => GLOBAL_ROUTE_PROFILES[code]).filter(Boolean) || []);
    const marketCards = computed(() => filteredMarkets.value.map(market => {
      const mode = routeFilter.value === 'ALL' ? market.modes[0] : routeFilter.value;
      const estimate = estimateGlobalWholesaleRoute({
        cropCode: selectedCrop.value?.cropCode,
        market,
        mode,
        quantityKg: quantityKg.value,
        originPriceCnyKg: originPriceCnyKg.value,
        packingCnyKg: packingCnyKg.value,
        buyerQuoteCnyKg: demoBuyerQuoteCnyKg(selectedCrop.value?.cropCode, market)
      });
      return { ...market, mode, estimate, readiness: readinessMeta(estimate?.readinessStatus), observedReference: market.id === 'london' && Boolean(selectedCrop.value?.internationalReference) };
    }).sort((left, right) => {
      const unavailableDelta = Number(left.estimate?.readinessStatus === 'UNAVAILABLE') - Number(right.estimate?.readinessStatus === 'UNAVAILABLE');
      return unavailableDelta || Number(left.estimate?.landedCostCnyKg || Infinity) - Number(right.estimate?.landedCostCnyKg || Infinity);
    }));
    const availableRouteCount = computed(() => GLOBAL_WHOLESALE_MARKETS.reduce((sum, market) => sum + market.modes.length, 0));
    const selectedMarginTone = computed(() => Number(selectedEstimate.value?.simulatedMarginCny || 0) > 0 ? 'positive' : Number(selectedEstimate.value?.simulatedMarginCny || 0) < 0 ? 'negative' : 'neutral');
    const originMapPoint = officialMapPoint(GLOBAL_WHOLESALE_ORIGIN.coordinates);
    const marketMapPoints = computed(() => filteredMarkets.value.map(market => ({ ...market, mapPoint: officialMapPoint(market.coordinates) })));
    const selectedMapPoint = computed(() => officialMapPoint(selectedMarket.value?.coordinates));
    const selectedRoutePath = computed(() => {
      const start = originMapPoint;
      const end = selectedMapPoint.value;
      const horizontalDistance = Math.abs(end.x - start.x);
      const verticalDistance = Math.abs(end.y - start.y);
      const arcHeight = Math.min(68, Math.max(13, horizontalDistance * 0.1 + verticalDistance * 0.05));
      const controlX = (start.x + end.x) / 2;
      const controlY = Math.max(20, (start.y + end.y) / 2 - arcHeight);
      return `M ${start.x} ${start.y} Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${end.x} ${end.y}`;
    });
    const selectedRouteColor = computed(() => selectedRouteFacts.value?.color || '#5b8dd9');
    const selectedRouteDasharray = computed(() => ({ dashed: '11 8', dotted: '2 7', solid: 'none' })[selectedRouteFacts.value?.lineType] || '11 8');

    const syncRoute = () => {
      const market = selectedMarket.value;
      if (!market) return;
      const preferred = routeFilter.value !== 'ALL' && market.modes.includes(routeFilter.value) ? routeFilter.value : market.modes[0];
      if (!market.modes.includes(selectedRouteMode.value) || (routeFilter.value !== 'ALL' && selectedRouteMode.value !== routeFilter.value)) {
        selectedRouteMode.value = preferred;
      }
    };

    const resetCropInputs = () => {
      const crop = selectedCrop.value;
      const profile = cropProfile.value;
      const observedOrigin = finite(crop?.latestPrice);
      originPriceCnyKg.value = observedOrigin ?? profile.demoOriginPriceCnyKg;
      originPriceSource.value = observedOrigin == null ? 'SIMULATED' : 'OBSERVED_LOCAL';
      packingCnyKg.value = profile.packingCnyKg;
      buyerQuoteCnyKg.value = demoBuyerQuoteCnyKg(crop?.cropCode, selectedMarket.value);
      buyerQuoteSource.value = 'SIMULATED';
    };

    const resetBuyerQuote = () => {
      buyerQuoteCnyKg.value = demoBuyerQuoteCnyKg(selectedCrop.value?.cropCode, selectedMarket.value);
      buyerQuoteSource.value = 'SIMULATED';
    };

    const chooseCrop = event => emit('select-crop', event?.target?.value || '');
    const chooseFilter = value => {
      routeFilter.value = value;
      if (!filteredMarkets.value.some(market => market.id === selectedMarketId.value)) selectedMarketId.value = filteredMarkets.value[0]?.id || '';
      syncRoute();
      resetBuyerQuote();
    };
    const selectMarket = id => {
      selectedMarketId.value = id;
      syncRoute();
      resetBuyerQuote();
    };
    const chooseRoute = mode => {
      if (!selectedMarket.value?.modes?.includes(mode)) return;
      selectedRouteMode.value = mode;
    };
    const onMapImageLoad = () => { mapError.value = ''; };
    const onMapImageError = () => { mapError.value = '官方标准地图文件加载失败'; };
    const markOriginUserProvided = () => { originPriceSource.value = 'USER_PROVIDED'; };
    const markBuyerUserProvided = () => { buyerQuoteSource.value = 'USER_PROVIDED'; };

    watch(() => props.selectedCropCode, () => {
      resetCropInputs();
    });
    syncRoute();
    resetCropInputs();

    return {
      mapError, routeFilter, selectedMarketId, selectedRouteMode, quantityKg, originPriceCnyKg, packingCnyKg,
      buyerQuoteCnyKg, originPriceSource, buyerQuoteSource, selectedCrop, cropProfile, filteredMarkets, selectedMarket,
      selectedEstimate, selectedReadiness, selectedInternationalReference, latestInternationalPoint, routeOptions, marketCards,
      availableRouteCount, selectedMarginTone, marketMapPoints, originMapPoint, selectedRoutePath, selectedRouteColor,
      selectedRouteDasharray, ROUTE_FILTERS, GLOBAL_WHOLESALE_MARKETS, GLOBAL_WHOLESALE_ORIGIN,
      OFFICIAL_WORLD_MAP_URL, OFFICIAL_WORLD_MAP, MAP_VIEWBOX,
      numberText, moneyText, readinessMeta, chooseCrop, chooseFilter, selectMarket, chooseRoute,
      markOriginUserProvided, markBuyerUserProvided, onMapImageLoad, onMapImageError
    };
  },
  template: `
    <section class="global-wholesale" aria-labelledby="global-wholesale-title">
      <header class="global-wholesale-disclosure">
        <div>
          <span class="market-eyebrow">全球销售沙盘 · 非下单系统</span>
          <h2 id="global-wholesale-title">从重庆农场到全球批发目的地</h2>
          <p>用城市级目的地、运输方式、时效、冷链损耗与到岸成本筛选询价方向；所有物流、边境成本和买方目标价均为模拟假设。</p>
        </div>
        <div class="global-evidence-counts" aria-label="数据范围">
          <span><strong>{{ GLOBAL_WHOLESALE_MARKETS.length }}</strong> 个目的地</span>
          <span><strong>{{ availableRouteCount }}</strong> 条运输场景</span>
          <span><strong>0</strong> 个实时运费报价</span>
        </div>
      </header>

      <div class="global-wholesale-controls">
        <label><span>销售作物</span><select :value="selectedCrop?.cropCode" @change="chooseCrop"><option v-for="crop in crops" :key="crop.cropCode" :value="crop.cropCode">{{ crop.emoji }} {{ crop.cropName }}</option></select></label>
        <div class="global-route-filter" role="group" aria-label="运输方式筛选">
          <button v-for="option in ROUTE_FILTERS" :key="option.value" type="button" :class="{active: routeFilter === option.value}" @click="chooseFilter(option.value)">{{ option.label }}</button>
        </div>
        <label><span>发货量</span><span class="global-number-input"><input v-model.number="quantityKg" type="number" min="1" max="1000000" step="100"><em>公斤</em></span></label>
      </div>

      <div class="global-wholesale-workspace">
        <article class="global-map-panel">
          <header class="global-panel-heading">
            <div><span class="market-eyebrow">官方标准底图 · 独立业务覆盖层</span><h3>{{ selectedCrop?.emoji }} {{ selectedCrop?.cropName || '作物' }} · {{ selectedMarket?.country }} {{ selectedMarket?.city }}</h3></div>
            <span class="global-source-chip">自然资源部 · {{ OFFICIAL_WORLD_MAP.reviewNumber }}</span>
          </header>
          <div v-if="mapError" class="global-map-error"><span class="ph ph-warning" aria-hidden="true"></span><strong>地图暂不可用</strong><p>{{ mapError }}。右侧目的地列表和下方表格仍可继续使用。</p></div>
          <div v-else class="global-wholesale-map" role="group" :aria-label="'自然资源部世界标准地图及重庆农场至' + selectedMarket?.city + '的模拟销售关系覆盖层'">
            <img class="global-official-map" :src="OFFICIAL_WORLD_MAP_URL" :width="OFFICIAL_WORLD_MAP.width" :height="OFFICIAL_WORLD_MAP.height" loading="lazy" decoding="async" fetchpriority="low" alt="自然资源部世界标准地图，审图号 GS(2016)1663号" @load="onMapImageLoad" @error="onMapImageError">
            <svg class="global-route-overlay" :viewBox="'0 0 ' + MAP_VIEWBOX.width + ' ' + MAP_VIEWBOX.height" preserveAspectRatio="none" aria-hidden="true">
              <path :d="selectedRoutePath" :stroke="selectedRouteColor" :stroke-dasharray="selectedRouteDasharray"></path>
            </svg>
            <span class="global-map-origin" :style="{ left: originMapPoint.left + '%', top: originMapPoint.top + '%' }" title="当前农场（重庆）"><i></i><b>重庆农场</b></span>
            <button v-for="market in marketMapPoints" :key="market.id" type="button" class="global-map-destination" :class="[{ active: selectedMarket?.id === market.id }, { observed: market.id === 'london' && selectedCrop?.internationalReference }]" :style="{ left: market.mapPoint.left + '%', top: market.mapPoint.top + '%' }" :title="market.country + ' · ' + market.city + '｜' + market.marketName" :aria-label="'选择' + market.country + market.city + '批发目的地'" :aria-pressed="selectedMarket?.id === market.id" @click="selectMarket(market.id)"><i></i><b v-if="selectedMarket?.id === market.id">{{ market.city }}</b></button>
          </div>
          <div class="global-map-legend" aria-label="地图图例">
            <span><i class="is-origin"></i>重庆农场</span><span><i class="is-destination"></i>模拟目的地</span><span><i class="is-observed"></i>存在外部观测参考</span>
          </div>
          <p class="global-map-note">底图为标准地图原图，未裁切、未重绘边界；目的地与关系线属于独立业务覆盖层，位置仅作城市级近似表达，不代表实际航线。公开发布含覆盖层的地图前仍需按规定履行地图审核。</p>
        </article>

        <aside class="global-market-list" aria-label="全球批发目的地">
          <header><div><span class="market-eyebrow">目的地队列</span><h3>{{ marketCards.length }} 个可选节点</h3></div><small>按模拟到岸成本排序</small></header>
          <div class="global-market-scroll">
            <button v-for="market in marketCards" :key="market.id" type="button" class="global-market-card" :class="[{active: selectedMarket?.id === market.id}, 'is-' + market.readiness.tone]" @click="selectMarket(market.id)" :aria-pressed="selectedMarket?.id === market.id">
              <span class="global-market-name"><strong>{{ market.country }} · {{ market.city }}</strong><small>{{ market.marketName }}</small></span>
              <span class="global-market-route">{{ market.estimate?.modeIcon }} {{ market.estimate?.transitDays }} 天 · {{ numberText(market.estimate?.distanceKm, 0) }} km</span>
              <span class="global-market-cost"><strong>{{ moneyText(market.estimate?.landedCostCnyKg) }}</strong><small>模拟到岸 元/可售公斤</small></span>
              <span class="global-market-status" :class="'is-' + market.readiness.tone">{{ market.readiness.label }}</span>
              <em v-if="market.observedReference">外部观测参考</em>
            </button>
          </div>
        </aside>
      </div>

      <article v-if="selectedEstimate" class="global-route-estimator">
        <header class="global-panel-heading">
          <div><span class="market-eyebrow">销售与物流测算</span><h3>{{ selectedMarket.country }} · {{ selectedMarket.marketName }}</h3><p>{{ selectedMarket.complianceHint }}</p></div>
          <span class="global-readiness" :class="'is-' + selectedReadiness.tone">{{ selectedReadiness.label }}</span>
        </header>
        <div class="global-estimator-grid">
          <section class="global-route-facts">
            <h4>运输方式</h4>
            <div class="global-route-tabs" role="group" aria-label="当前目的地运输方式">
              <button v-for="route in routeOptions" :key="route.code" type="button" :class="{active: selectedRouteMode === route.code}" @click="chooseRoute(route.code)">{{ route.icon }} {{ route.label }}</button>
            </div>
            <dl>
              <div><dt>球面距离</dt><dd>{{ numberText(selectedEstimate.distanceKm, 0) }} km</dd></div>
              <div><dt>模拟时效</dt><dd>{{ selectedEstimate.transitDays }} 天</dd></div>
              <div><dt>模拟运费</dt><dd>{{ moneyText(selectedEstimate.freightCnyKg) }} 元/kg</dd></div>
              <div><dt>预计损耗</dt><dd>{{ numberText(selectedEstimate.expectedLossPct, 1) }}%</dd></div>
              <div><dt>作物保鲜窗</dt><dd>{{ selectedEstimate.shelfLifeDays }} 天</dd></div>
            </dl>
          </section>

          <section class="global-cost-inputs">
            <h4>测算输入</h4>
            <label><span>产地价格 <em :class="'is-' + originPriceSource.toLowerCase()">{{ originPriceSource === 'OBSERVED_LOCAL' ? '重庆观测' : originPriceSource === 'USER_PROVIDED' ? '人工输入' : '模拟假设' }}</em></span><span class="global-number-input"><input v-model.number="originPriceCnyKg" type="number" min="0" step="0.1" @input="markOriginUserProvided"><em>元/kg</em></span></label>
            <label><span>冷链包装 <em class="is-simulated">模拟假设</em></span><span class="global-number-input"><input v-model.number="packingCnyKg" type="number" min="0" step="0.1"><em>元/kg</em></span></label>
            <label><span>买方目标价 <em :class="'is-' + buyerQuoteSource.toLowerCase()">{{ buyerQuoteSource === 'USER_PROVIDED' ? '人工输入' : '模拟假设' }}</em></span><span class="global-number-input"><input v-model.number="buyerQuoteCnyKg" type="number" min="0" step="0.1" @input="markBuyerUserProvided"><em>元/kg</em></span></label>
            <p>演示边境成本率 {{ numberText(selectedEstimate.demoBorderCostPct, 1) }}%，不是关税查询结果；正式报价需替换全部模拟输入。</p>
          </section>

          <section class="global-cost-result">
            <span class="market-eyebrow">模拟测算 · 不可执行</span>
            <div class="global-landed-cost"><small>到岸成本 / 可售公斤</small><strong>{{ moneyText(selectedEstimate.landedCostCnyKg) }}</strong><em>元/kg</em></div>
            <dl>
              <div><dt>预计可售量</dt><dd>{{ numberText(selectedEstimate.sellableKg, 1) }} kg</dd></div>
              <div><dt>总成本</dt><dd>¥ {{ moneyText(selectedEstimate.totalCostCny) }}</dd></div>
              <div><dt>目标销售额</dt><dd>¥ {{ moneyText(selectedEstimate.simulatedRevenueCny) }}</dd></div>
              <div :class="'is-' + selectedMarginTone"><dt>模拟毛差</dt><dd>¥ {{ moneyText(selectedEstimate.simulatedMarginCny) }}</dd></div>
            </dl>
            <p>毛差未计汇率、税务、资金占用、退货、质量分级与实际询价差异。</p>
          </section>
        </div>
        <div v-if="selectedInternationalReference" class="global-observed-reference">
          <span class="ph ph-chart-line-up" aria-hidden="true"></span>
          <p><strong>伦敦节点存在独立外部观测参考</strong>英国环境、食品与乡村事务部 {{ selectedInternationalReference.label }}最近一期为 {{ moneyText(latestInternationalPoint?.price) }} {{ selectedInternationalReference.unitLabel }}（{{ latestInternationalPoint?.date }}）。该原币观测不换汇、不进入本页到岸或毛差计算。</p>
        </div>
      </article>

      <details class="global-market-table-details">
        <summary>查看目的地与当前模拟路线明细（{{ marketCards.length }} 个）</summary>
        <div class="market-table-wrap">
          <table><thead><tr><th scope="col">目的地</th><th scope="col">批发市场</th><th scope="col">运输方式</th><th scope="col">时效 / 距离</th><th scope="col">到岸成本</th><th scope="col">就绪度</th></tr></thead>
            <tbody><tr v-for="market in marketCards" :key="market.id"><td>{{ market.country }} · {{ market.city }}</td><td>{{ market.marketName }}</td><td>{{ market.estimate?.modeIcon }} {{ market.estimate?.modeLabel }}</td><td>{{ market.estimate?.transitDays }} 天 / {{ numberText(market.estimate?.distanceKm, 0) }} km</td><td>{{ moneyText(market.estimate?.landedCostCnyKg) }} 元/可售公斤</td><td>{{ market.readiness.label }}</td></tr></tbody>
          </table>
        </div>
      </details>

      <footer class="global-wholesale-footer">
        <span class="ph ph-info" aria-hidden="true"></span>
        <p><strong>来源、口径与性能说明</strong>底图来自<a :href="OFFICIAL_WORLD_MAP.sourceUrl" target="_blank" rel="noopener noreferrer">自然资源部标准地图服务系统</a>，审图号 {{ OFFICIAL_WORLD_MAP.reviewNumber }}，原图审图号与“自然资源部 监制”信息完整保留。市场节点为演示目录；运费按“方式固定成本 + 球面距离 × 模式系数”，时效按固定处理日与日均里程估算，损耗随时效递增。官方图片仅在进入本页后低优先级加载，覆盖层只包含当前一条关系线和最多 9 个按钮，不解析地图矢量数据、不连接在线地图开发工具、无持续动画。</p>
      </footer>
    </section>
  `
};
