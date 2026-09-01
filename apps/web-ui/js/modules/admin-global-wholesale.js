import {
  GLOBAL_ROUTE_PROFILES,
  GLOBAL_WHOLESALE_MARKETS,
  GLOBAL_WHOLESALE_ORIGIN,
  demoBuyerQuoteCnyKg,
  estimateGlobalWholesaleRoute,
  exportCropProfile,
  routeFacts
} from './global-wholesale-data.js?v=20260901-v595-global-v1';

const { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } = Vue;
const WORLD_MAP_NAME = 'agriloop-natural-earth-land-110m';
const WORLD_MAP_URL = new URL('../../assets/maps/natural-earth-110m-land.geojson', import.meta.url).href;
const ROUTE_FILTERS = Object.freeze([
  { value: 'ALL', label: '全部方式' },
  { value: 'AIR', label: '航空冷链' },
  { value: 'RAIL', label: '铁路冷链' },
  { value: 'SEA', label: '海运冷链' }
]);

let worldMapPromise = null;

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

async function ensureWorldMap() {
  if (!window.echarts) throw new Error('地图引擎未加载');
  if (window.echarts.getMap?.(WORLD_MAP_NAME)) return;
  if (!worldMapPromise) {
    worldMapPromise = fetch(WORLD_MAP_URL, { cache: 'force-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`地图底图加载失败（HTTP ${response.status}）`);
        return response.json();
      })
      .then(geoJson => {
        window.echarts.registerMap(WORLD_MAP_NAME, geoJson);
        return geoJson;
      })
      .catch(error => {
        worldMapPromise = null;
        throw error;
      });
  }
  await worldMapPromise;
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
    const mapEl = ref(null);
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
    let mapChart = null;
    let resizeObserver = null;
    let resizeFrame = 0;
    let idleHandle = 0;

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

    const renderMap = async () => {
      await nextTick();
      if (!mapEl.value) return;
      try {
        mapError.value = '';
        await ensureWorldMap();
        if (!mapEl.value) return;
        if (!mapChart || mapChart.getDom?.() !== mapEl.value) {
          mapChart?.dispose?.();
          mapChart = window.echarts.init(mapEl.value, null, { renderer: 'canvas' });
        }
        const selected = selectedMarket.value;
        const route = selectedRouteFacts.value;
        const destinations = filteredMarkets.value.map(market => ({
          name: market.city,
          value: [...market.coordinates, market.id === selected?.id ? 2 : 1],
          marketId: market.id,
          marketName: market.marketName,
          country: market.country,
          symbol: market.id === 'london' && selectedCrop.value?.internationalReference ? 'diamond' : 'circle',
          symbolSize: market.id === selected?.id ? 17 : 11,
          itemStyle: {
            color: market.id === 'london' && selectedCrop.value?.internationalReference ? '#6f5aa8' : '#2f9d84',
            borderColor: market.id === selected?.id ? '#1d2723' : '#ffffff',
            borderWidth: market.id === selected?.id ? 2.4 : 1.3
          },
          label: { show: market.id === selected?.id }
        }));
        mapChart.off('click');
        mapChart.on('click', params => {
          if (params?.data?.marketId) selectMarket(params.data.marketId);
        });
        mapChart.setOption({
          animation: false,
          backgroundColor: '#f8fbfa',
          textStyle: { color: '#262626', fontFamily: 'STIX Two Text, STIXGeneral, Times New Roman, DejaVu Serif, serif' },
          aria: { enabled: true, description: `全球批发目的地示意图，共${filteredMarkets.value.length}个城市级节点。当前选择${selected?.country || ''}${selected?.city || ''}，${route?.modeLabel || ''}为模拟路线。` },
          tooltip: {
            trigger: 'item', confine: true, backgroundColor: '#ffffff', borderColor: '#8f8f8f', borderWidth: 1,
            textStyle: { color: '#262626', fontFamily: 'STIX Two Text, STIXGeneral, Times New Roman, DejaVu Serif, serif' },
            formatter: params => params?.data?.marketId
              ? `<strong>${params.data.country} · ${params.data.name}</strong><br>${params.data.marketName}<br>点击查看销售测算`
              : ''
          },
          geo: {
            map: WORLD_MAP_NAME,
            roam: true,
            scaleLimit: { min: 1, max: 6 },
            layoutCenter: ['50%', '52%'],
            layoutSize: '106%',
            itemStyle: { areaColor: '#e4eee9', borderColor: '#8fa299', borderWidth: 0.65 },
            emphasis: { disabled: true },
            select: { disabled: true }
          },
          series: [
            {
              name: '当前销售关系', type: 'lines', coordinateSystem: 'geo', silent: true, polyline: false,
              data: selected && route ? [{ coords: [GLOBAL_WHOLESALE_ORIGIN.coordinates, selected.coordinates] }] : [],
              lineStyle: { color: route?.color || '#5b8dd9', width: 2, type: route?.lineType || 'dashed', opacity: 0.86, curveness: 0.16 }
            },
            {
              name: '当前农场', type: 'scatter', coordinateSystem: 'geo', silent: true, progressive: 0,
              data: [{ name: GLOBAL_WHOLESALE_ORIGIN.city, value: [...GLOBAL_WHOLESALE_ORIGIN.coordinates, 3] }],
              symbol: 'diamond', symbolSize: 15,
              itemStyle: { color: '#d68418', borderColor: '#ffffff', borderWidth: 1.5 },
              label: { show: true, formatter: '重庆农场', position: 'right', color: '#26332e', fontSize: 10, fontWeight: 700, backgroundColor: 'rgba(255,255,255,.86)', padding: [2, 4], borderRadius: 3 }
            },
            {
              name: '批发目的地', type: 'scatter', coordinateSystem: 'geo', progressive: 0,
              data: destinations,
              label: { show: false, formatter: params => params.data.name, position: 'right', color: '#26332e', fontSize: 10, fontWeight: 700, backgroundColor: 'rgba(255,255,255,.9)', padding: [2, 4], borderRadius: 3 },
              emphasis: { scale: 1.2, label: { show: true } }
            }
          ]
        }, { notMerge: true, lazyUpdate: true });
      } catch (error) {
        mapError.value = error?.message || '全球地图暂不可用';
      }
    };

    const queueMapRender = () => {
      if (idleHandle && window.cancelIdleCallback) window.cancelIdleCallback(idleHandle);
      const run = () => { idleHandle = 0; void renderMap(); };
      idleHandle = window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 320 }) : window.setTimeout(run, 0);
    };

    const resizeMap = () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => { resizeFrame = 0; mapChart?.resize?.(); });
    };

    const chooseCrop = event => emit('select-crop', event?.target?.value || '');
    const chooseFilter = value => {
      routeFilter.value = value;
      if (!filteredMarkets.value.some(market => market.id === selectedMarketId.value)) selectedMarketId.value = filteredMarkets.value[0]?.id || '';
      syncRoute();
      resetBuyerQuote();
      void renderMap();
    };
    const selectMarket = id => {
      selectedMarketId.value = id;
      syncRoute();
      resetBuyerQuote();
      void renderMap();
    };
    const chooseRoute = mode => {
      if (!selectedMarket.value?.modes?.includes(mode)) return;
      selectedRouteMode.value = mode;
      void renderMap();
    };
    const markOriginUserProvided = () => { originPriceSource.value = 'USER_PROVIDED'; };
    const markBuyerUserProvided = () => { buyerQuoteSource.value = 'USER_PROVIDED'; };

    watch(() => props.selectedCropCode, () => {
      resetCropInputs();
      queueMapRender();
    });
    onMounted(() => {
      syncRoute();
      resetCropInputs();
      queueMapRender();
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(resizeMap);
        if (mapEl.value) resizeObserver.observe(mapEl.value);
      } else window.addEventListener('resize', resizeMap);
    });
    onBeforeUnmount(() => {
      if (idleHandle) {
        if (window.cancelIdleCallback) window.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect?.();
      window.removeEventListener('resize', resizeMap);
      mapChart?.dispose?.();
      mapChart = null;
    });

    return {
      mapEl, mapError, routeFilter, selectedMarketId, selectedRouteMode, quantityKg, originPriceCnyKg, packingCnyKg,
      buyerQuoteCnyKg, originPriceSource, buyerQuoteSource, selectedCrop, cropProfile, filteredMarkets, selectedMarket,
      selectedEstimate, selectedReadiness, selectedInternationalReference, latestInternationalPoint, routeOptions, marketCards,
      availableRouteCount, selectedMarginTone, ROUTE_FILTERS, GLOBAL_WHOLESALE_MARKETS,
      numberText, moneyText, readinessMeta, chooseCrop, chooseFilter, selectMarket, chooseRoute,
      markOriginUserProvided, markBuyerUserProvided
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
            <div><span class="market-eyebrow">轻量目的地地图</span><h3>{{ selectedCrop?.emoji }} {{ selectedCrop?.cropName || '作物' }} · {{ selectedMarket?.country }} {{ selectedMarket?.city }}</h3></div>
            <span class="global-source-chip">Natural Earth · 1:110m</span>
          </header>
          <div v-if="mapError" class="global-map-error"><span class="ph ph-warning" aria-hidden="true"></span><strong>地图暂不可用</strong><p>{{ mapError }}。右侧目的地列表和下方表格仍可继续使用。</p></div>
          <div v-else ref="mapEl" class="global-wholesale-map" role="img" :aria-label="'重庆农场至' + selectedMarket?.city + '的全球批发目的地示意图'"></div>
          <div class="global-map-legend" aria-label="地图图例">
            <span><i class="is-origin"></i>重庆农场</span><span><i class="is-destination"></i>模拟目的地</span><span><i class="is-observed"></i>存在外部观测参考</span>
          </div>
          <p class="global-map-note">等经纬度世界陆地示意；目的地为城市级近似坐标，连线只表达销售关系，不代表实际航线。地图按需加载，不使用在线瓦片或持续动画。</p>
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
            <span class="market-eyebrow">SIMULATED · 不可执行</span>
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
          <p><strong>伦敦节点存在独立外部观测参考</strong>英国 DEFRA {{ selectedInternationalReference.label }}最近一期为 {{ moneyText(latestInternationalPoint?.price) }} {{ selectedInternationalReference.unitLabel }}（{{ latestInternationalPoint?.date }}）。该原币观测不换汇、不进入本页到岸或毛差计算。</p>
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
        <p><strong>口径与性能说明</strong>地图陆地轮廓来自 <a href="https://www.naturalearthdata.com/downloads/110m-physical-vectors/" target="_blank" rel="noopener noreferrer">Natural Earth 1:110m（Public Domain）</a>；市场节点为演示目录。运费按“方式固定成本 + 球面距离 × 模式系数”，时效按固定处理日与日均里程估算，损耗随时效递增。底图首次进入才加载，仅绘制当前一条关系线和最多 9 个节点，不连接在线地图 SDK。</p>
      </footer>
    </section>
  `
};
