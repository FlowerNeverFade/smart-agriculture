import { api } from '../api.js?v=20260901-v593-market-v3';
import { AdminGlobalWholesalePanel } from './admin-global-wholesale.js?v=20260901-v595-global-v1';

const { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, inject } = Vue;

const RANGE_OPTIONS = Object.freeze([
  { value: 7, label: '近7日' },
  { value: 30, label: '近30日' },
  { value: 90, label: '近90日' }
]);
const REFERENCE_PERIOD_OPTIONS = Object.freeze([
  { value: 6, label: '近6期' },
  { value: 12, label: '近12期' },
  { value: 24, label: '近24期' }
]);

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value); return Number.isFinite(number) ? number : null;
}
function price(value) { const number = finite(value); return number == null ? '—' : number.toFixed(2); }
function signed(value, suffix = '') {
  const number = finite(value); if (number == null) return '—';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}${suffix}`;
}
function changeTone(value) { const number = finite(value); return number == null || number === 0 ? 'flat' : number > 0 ? 'up' : 'down'; }
function localDateKey(date) {
  const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function sourceLabel(status) {
  return ({ LIVE: '官方日行情', CACHED: '最近归档行情', DEMO: '演示行情 · 非真实价格', DISABLED: '行情源已停用', UNAVAILABLE: '行情暂不可用' })[String(status || '').toUpperCase()] || '行情状态待确认';
}

function sortedReferencePoints(points = [], periods = 12) {
  return [...(Array.isArray(points) ? points : [])]
    .filter(point => point?.date && finite(point?.price) != null)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .slice(-Math.max(1, Number(periods) || 12));
}

export function buildReferenceChartHistory(points = [], periods = 12) {
  const selected = sortedReferencePoints(points, periods);
  const result = [];
  selected.forEach((point, index) => {
    if (index > 0) {
      const previous = new Date(`${selected[index - 1].date}T00:00:00Z`);
      const current = new Date(`${point.date}T00:00:00Z`);
      const gapDays = Math.round((current - previous) / 86400000);
      if (gapDays > 21) {
        const gap = new Date(previous); gap.setUTCDate(gap.getUTCDate() + 14);
        result.push({ date: gap.toISOString().slice(0, 10), price: null, isPublicationGap: true });
      }
    }
    result.push({ date: point.date, price: finite(point.price) });
  });
  return result;
}

export const AdminMarketInsightsView = {
  name: 'AdminMarketInsightsView',
  components: { AdminGlobalWholesalePanel },
  props: { state: { type: Object, required: true }, routeParams: { type: Object, default: () => ({}) } },
  setup(props) {
    const toast = inject('toast');
    const loading = ref(false); const error = ref(null); const market = ref(null);
    const workspaceMode = ref('local');
    const scope = ref('farm'); const rangeDays = ref(30); const referencePeriods = ref(12); const selectedCropCode = ref('');
    const chartMode = ref('local'); const chartModeByCrop = new Map();
    const chartEl = ref(null); let chart = null; let refreshTimer = null; let resizeObserver = null;

    const farmId = computed(() => props.state?.adminContext?.farmId || props.routeParams?.farmId || props.state?.plots?.[0]?.farmId || 'farm-demo');
    const crops = computed(() => Array.isArray(market.value?.crops) ? market.value.crops : []);
    const selectedCrop = computed(() => crops.value.find(item => item.cropCode === selectedCropCode.value) || crops.value[0] || null);
    const source = computed(() => market.value?.source || {});
    const status = computed(() => String(market.value?.sourceStatus || (props.state?.sessionMode === 'live' ? 'UNAVAILABLE' : 'DEMO')).toUpperCase());
    const sourceTone = computed(() => status.value === 'LIVE' ? 'live' : status.value === 'DEMO' ? 'demo' : status.value === 'CACHED' ? 'cached' : 'unavailable');
    const selectedQuotes = computed(() => Array.isArray(selectedCrop.value?.marketQuotes) ? selectedCrop.value.marketQuotes : []);
    const selectedHistory = computed(() => Array.isArray(selectedCrop.value?.history) ? selectedCrop.value.history : []);
    const selectedReference = computed(() => {
      const reference = selectedCrop.value?.internationalReference;
      return reference && Array.isArray(reference.points) && reference.points.length ? reference : null;
    });
    const selectedReferencePoints = computed(() => sortedReferencePoints(selectedReference.value?.points, referencePeriods.value));
    const chartHistory = computed(() => {
      if (chartMode.value === 'reference') return buildReferenceChartHistory(selectedReference.value?.points, referencePeriods.value);
      const observed = new Map(selectedHistory.value.map(point => [point.date, point]));
      const end = new Date(); end.setHours(0, 0, 0, 0);
      return Array.from({ length: rangeDays.value }, (_, index) => {
        const date = new Date(end); date.setDate(end.getDate() - (rangeDays.value - index - 1));
        const key = localDateKey(date);
        return observed.get(key) || { date: key, price: null, minPrice: null, maxPrice: null, marketCount: 0 };
      });
    });
    const availableCount = computed(() => crops.value.filter(item => item.available).length);
    const chartUnit = computed(() => chartMode.value === 'reference' ? selectedReference.value?.unitLabel || '原始单位' : '元/公斤');
    const chartRangeLabel = computed(() => chartMode.value === 'reference' ? `最近${referencePeriods.value}个发布期` : `近${rangeDays.value}日`);
    const axisDisclosure = computed(() => chartMode.value === 'reference'
      ? `当前为英国 DEFRA 国际参考；纵轴按可见范围缩放、不从 0 起，保留${chartUnit.value}原单位，不换算、不与重庆报价直接比较；超过一个发布周期的缺口断线。`
      : selectedHistory.value.length > 1
        ? `纵轴按当前${rangeDays.value}日可见价格范围缩放，不从 0 起；缺失日期不连线、不插值。`
        : '重庆真实历史由系统逐日归档；当前样本不足时可切换国际参考，但不会用参考值补写本地历史。');

    const renderChart = async () => {
      await nextTick();
      if (!chartEl.value || !window.echarts) return;
      if (!chart || chart.getDom?.() !== chartEl.value) {
        chart?.dispose?.(); chart = window.echarts.init(chartEl.value);
      }
      resizeObserver?.disconnect?.(); resizeObserver?.observe?.(chartEl.value);
      const history = chartHistory.value;
      const main = history.map(point => [point.date, finite(point.price)]);
      const minimum = history.map(point => [point.date, chartMode.value === 'local' ? finite(point.minPrice) : null]);
      const maximum = history.map(point => [point.date, chartMode.value === 'local' ? finite(point.maxPrice) : null]);
      const hasObservedPrice = main.some(point => point[1] != null);
      const cropName = selectedCrop.value?.cropName || '作物';
      const margin = values => Math.max(chartMode.value === 'reference' ? .08 : .2, (Number(values.max) - Number(values.min)) * .12);
      const seriesNames = chartMode.value === 'reference' ? ['英国批发参考'] : ['参考价', '市场最低', '市场最高'];
      const series = chartMode.value === 'reference'
        ? [{ name: '英国批发参考', type: 'line', data: main, connectNulls: false, showSymbol: true, symbol: 'diamond', symbolSize: 8, lineStyle: { color: '#6f5aa8', width: 2.3 }, itemStyle: { color: '#ffffff', borderColor: '#262626', borderWidth: 1.2 }, emphasis: { focus: 'series' } }]
        : [
            { name: '参考价', type: 'line', data: main, connectNulls: false, showSymbol: true, symbol: 'circle', symbolSize: 7, lineStyle: { color: '#35ae94', width: 2.4 }, itemStyle: { color: '#ffffff', borderColor: '#262626', borderWidth: 1.2 }, emphasis: { focus: 'series' } },
            { name: '市场最低', type: 'line', data: minimum, connectNulls: false, showSymbol: false, lineStyle: { color: '#5b8dd9', width: 1.3, type: 'dashed' } },
            { name: '市场最高', type: 'line', data: maximum, connectNulls: false, showSymbol: false, lineStyle: { color: '#ddb68d', width: 1.3, type: 'dotted' } }
          ];
      chart.setOption({
        animation: false,
        backgroundColor: '#ffffff',
        textStyle: { color: '#262626', fontFamily: 'STIX Two Text, STIXGeneral, Times New Roman, DejaVu Serif, serif' },
        aria: { enabled: true, description: `${cropName}${chartRangeLabel.value}价格折线，单位${chartUnit.value}。缺失日期保留为空白。` },
        title: hasObservedPrice ? undefined : { text: chartMode.value === 'reference' ? '当前作物没有国际参考序列' : selectedCrop.value?.available ? '重庆历史行情正在积累' : '当前没有重庆报价', left: 'center', top: 'middle', textStyle: { color: '#777777', fontSize: 14, fontWeight: 'normal' } },
        tooltip: {
          trigger: 'axis', confine: true, backgroundColor: '#ffffff', borderColor: '#8f8f8f', borderWidth: 1,
          textStyle: { color: '#262626', fontFamily: 'STIX Two Text, STIXGeneral, Times New Roman, DejaVu Serif, serif' },
          valueFormatter: value => value == null ? '缺失' : `${Number(value).toFixed(2)} ${chartUnit.value}`
        },
        legend: {
          show: hasObservedPrice, top: 8, right: 12, data: seriesNames,
          backgroundColor: '#ffffff', borderColor: '#8f8f8f', borderWidth: 1, borderRadius: 4, padding: [5, 8],
          textStyle: { color: '#303030', fontSize: 11, fontFamily: 'STIX Two Text, STIXGeneral, Times New Roman, DejaVu Serif, serif' }
        },
        grid: { left: 62, right: 28, top: 52, bottom: 48, containLabel: false },
        xAxis: {
          type: 'time', boundaryGap: false,
          axisLine: { show: true, lineStyle: { color: '#b8b8b8', width: 1 } },
          axisTick: { show: false }, axisLabel: { color: '#303030', fontSize: 10, hideOverlap: true },
          splitLine: { show: true, lineStyle: { color: '#d7d7d7', opacity: .42, width: 1 } }
        },
        yAxis: {
          type: 'value', scale: true, name: chartUnit.value, nameGap: 14,
          min: values => Math.max(0, Number(values.min) - margin(values)), max: values => Number(values.max) + margin(values),
          nameTextStyle: { color: '#262626', fontSize: 12 }, axisLabel: { color: '#303030', fontSize: 10, formatter: value => Number(value).toFixed(1) },
          axisLine: { show: true, lineStyle: { color: '#b8b8b8', width: 1 } }, axisTick: { show: false },
          splitLine: { show: true, lineStyle: { color: '#d7d7d7', opacity: .55, width: 1 } }
        },
        dataZoom: [{ type: 'inside', filterMode: 'none', zoomOnMouseWheel: 'ctrl', moveOnMouseMove: true }],
        series
      }, true);
      chart.resize();
    };

    const load = async ({ silent = false } = {}) => {
      if (!silent) loading.value = true;
      error.value = null;
      try {
        const result = await api.getMarketPrices({ farmId: farmId.value, rangeDays: rangeDays.value, scope: scope.value });
        market.value = result;
        if (!crops.value.some(item => item.cropCode === selectedCropCode.value)) {
          selectedCropCode.value = crops.value.find(item => item.available)?.cropCode || crops.value[0]?.cropCode || '';
        }
        syncChartMode();
        await renderChart();
      } catch (caught) {
        error.value = caught;
        if (!silent) toast?.(caught?.message || '市场行情加载失败', 'error');
      } finally { loading.value = false; }
    };

    const syncChartMode = () => {
      const cropCode = selectedCrop.value?.cropCode || '';
      const saved = chartModeByCrop.get(cropCode);
      const referenceAvailable = Boolean(selectedReference.value?.points?.length > 1);
      chartMode.value = saved === 'reference' && referenceAvailable
        ? 'reference'
        : saved === 'local'
          ? 'local'
          : selectedHistory.value.length < 3 && referenceAvailable ? 'reference' : 'local';
    };
    const chooseCrop = cropCode => {
      selectedCropCode.value = cropCode;
      syncChartMode();
      if (workspaceMode.value === 'local') void renderChart();
    };
    const chooseWorkspace = mode => {
      const nextMode = mode === 'global' ? 'global' : 'local';
      if (workspaceMode.value === nextMode) return;
      workspaceMode.value = nextMode;
      if (nextMode === 'local') void renderChart();
      else { resizeObserver?.disconnect?.(); chart?.dispose?.(); chart = null; }
    };
    const chooseChartMode = mode => {
      if (mode === 'reference' && !selectedReference.value?.points?.length) return;
      chartMode.value = mode === 'reference' ? 'reference' : 'local';
      chartModeByCrop.set(selectedCrop.value?.cropCode || '', chartMode.value);
      void renderChart();
    };
    const chooseRange = value => { if (rangeDays.value === value) return; rangeDays.value = value; void load(); };
    const chooseReferencePeriod = value => { if (referencePeriods.value === value) return; referencePeriods.value = value; void renderChart(); };
    const chooseScope = value => { if (scope.value === value) return; scope.value = value; selectedCropCode.value = ''; void load(); };
    const refresh = () => load();
    const observationTone = item => String(item?.salesObservation?.tone || 'NEUTRAL').toLowerCase();
    const quoteDifference = quote => {
      const reference = finite(selectedCrop.value?.latestPrice); const value = finite(quote?.price);
      return reference == null || value == null ? '—' : signed(value - reference);
    };

    watch(farmId, () => { selectedCropCode.value = ''; void load(); });
    watch(selectedCrop, () => { if (workspaceMode.value === 'local') void renderChart(); });
    onMounted(() => {
      void load();
      refreshTimer = window.setInterval(() => { if (!document.hidden) void load({ silent: true }); }, 15 * 60 * 1000);
      if (window.ResizeObserver) { resizeObserver = new ResizeObserver(() => chart?.resize?.()); if (chartEl.value) resizeObserver.observe(chartEl.value); }
      else window.addEventListener('resize', renderChart);
    });
    onBeforeUnmount(() => {
      if (refreshTimer) window.clearInterval(refreshTimer);
      resizeObserver?.disconnect?.(); window.removeEventListener('resize', renderChart); chart?.dispose?.(); chart = null;
    });

    return {
      loading, error, market, workspaceMode, scope, rangeDays, referencePeriods, chartMode, selectedCropCode, chartEl, farmId, crops, selectedCrop, source, status,
      sourceTone, selectedQuotes, selectedHistory, selectedReference, selectedReferencePoints, chartHistory, chartUnit, chartRangeLabel,
      availableCount, axisDisclosure, RANGE_OPTIONS, REFERENCE_PERIOD_OPTIONS,
      price, signed, changeTone, sourceLabel, chooseCrop, chooseWorkspace, chooseChartMode, chooseRange, chooseReferencePeriod, chooseScope, refresh, observationTone, quoteDifference
    };
  },
  template: `
    <section class="market-insights" aria-labelledby="market-insights-title">
      <header class="market-insights-header">
        <div>
          <span class="market-eyebrow">{{ workspaceMode === 'local' ? '经营决策 / 日度批发行情' : '经营决策 / 全球批发销售沙盘' }}</span>
          <h1 id="market-insights-title">{{ workspaceMode === 'local' ? '农产品市场行情' : '全球批发与到岸测算' }}</h1>
          <p>{{ workspaceMode === 'local' ? '关注本场作物的每日市场报价、历史变化与销售观察；界面类似行情终端，但不会把日均价伪装成实时成交。' : '从重庆农场筛选全球批发目的地，比较运输时效、冷链损耗与到岸成本；当前物流与买方价格为明确标注的模拟场景。' }}</p>
        </div>
        <div v-if="workspaceMode === 'local'" class="market-header-actions">
          <span class="market-source-badge" :class="'is-' + sourceTone"><i></i>{{ sourceLabel(status) }}</span>
          <span class="market-asof">报价日 <strong>{{ market?.asOf || '—' }}</strong></span>
          <button type="button" class="market-refresh" @click="refresh" :disabled="loading"><span class="ph ph-arrows-clockwise" aria-hidden="true"></span>{{ loading ? '刷新中…' : '刷新行情' }}</button>
        </div>
        <div v-else class="market-header-actions">
          <span class="market-source-badge is-demo"><i></i>模拟销售测算</span>
          <span class="market-asof">实时运费报价 <strong>0 个</strong></span>
        </div>
      </header>

      <div class="market-workspace-switch" role="tablist" aria-label="市场工作台模式">
        <button type="button" role="tab" :aria-selected="workspaceMode === 'local'" :class="{active: workspaceMode === 'local'}" @click="chooseWorkspace('local')"><span class="ph ph-chart-line-up" aria-hidden="true"></span>国内行情</button>
        <button type="button" role="tab" :aria-selected="workspaceMode === 'global'" :class="{active: workspaceMode === 'global'}" @click="chooseWorkspace('global')"><span class="ph ph-globe-hemisphere-west" aria-hidden="true"></span>全球批发 <em>SIMULATED</em></button>
      </div>

      <template v-if="workspaceMode === 'local'">
        <div class="market-source-strip" :class="'is-' + sourceTone">
          <div><strong>{{ source.name || '行情来源待确认' }}</strong><span>{{ source.provinceName || '当前区域' }} · {{ source.preferredMarket || '区域市场简单均值' }} · {{ source.cadence === 'DAILY' ? '每日更新' : '更新频率待确认' }}</span></div>
          <div class="market-source-strip-meta"><span>{{ availableCount }}/{{ market?.totalCropCount ?? crops.length }} 个品种有报价</span><span>历史归档：{{ market?.historyPersistence || '—' }}</span></div>
        </div>

        <div class="market-toolbar" aria-label="行情范围">
          <div class="market-scope-switch">
            <button type="button" :class="{active: scope === 'farm'}" @click="chooseScope('farm')">本场作物</button>
            <button type="button" :class="{active: scope === 'all'}" @click="chooseScope('all')">全部监测品种</button>
          </div>
          <span>重庆报价为元/公斤；国际参考保留原始英镑/公斤，不做汇率换算或价格拼接。</span>
        </div>

        <div v-if="error" class="market-error"><strong>{{ error.code || 'MARKET_PRICE_UNAVAILABLE' }}</strong><span>{{ error.message || error }}</span></div>
        <div v-else-if="!loading && !crops.length" class="market-empty"><span class="ph ph-plant" aria-hidden="true"></span><strong>当前农场没有已匹配的在种作物</strong><p>可切换“全部监测品种”查看九种作物；未匹配品种不会被猜测为其他商品。</p></div>

        <template v-else>
        <div class="market-ticker-grid" aria-label="作物行情列表">
          <button v-for="item in crops" :key="item.cropCode" type="button" class="market-ticker-card"
                  :class="[{active: selectedCrop?.cropCode === item.cropCode, unavailable: !item.available}, 'is-' + changeTone(item.changePct)]"
                  @click="chooseCrop(item.cropCode)" :aria-pressed="selectedCrop?.cropCode === item.cropCode">
            <span class="market-ticker-identity"><b>{{ item.emoji || '🌱' }}</b><span><strong>{{ item.cropName }}</strong><small>{{ item.marketVarietyName }}<em v-if="item.inFarm">本场</em></small></span></span>
            <span class="market-ticker-price"><strong>{{ price(item.latestPrice) }}</strong><small>元/公斤</small></span>
            <span class="market-ticker-change" :class="'is-' + changeTone(item.changePct)"><span aria-hidden="true">{{ changeTone(item.changePct) === 'up' ? '↑' : changeTone(item.changePct) === 'down' ? '↓' : '—' }}</span>{{ signed(item.changePct, '%') }}</span>
            <span class="market-ticker-date">{{ item.available ? item.quoteDate + ' · ' + item.marketCount + ' 个市场' : item.internationalReference ? '今日暂无重庆报价 · 有国际参考' : '今日暂无上报报价' }}</span>
          </button>
        </div>

        <div v-if="selectedCrop" class="market-terminal">
          <article class="market-chart-panel">
            <header class="market-panel-heading">
              <div class="market-selected-quote">
                <span>{{ selectedCrop.emoji }} {{ selectedCrop.cropName }} / {{ selectedCrop.marketVarietyName }}</span>
                <div><strong>{{ price(selectedCrop.latestPrice) }}</strong><small>元/公斤</small><em :class="'is-' + changeTone(selectedCrop.changePct)">{{ signed(selectedCrop.change, ' 元') }} · {{ signed(selectedCrop.changePct, '%') }}</em></div>
                <p>{{ selectedCrop.priceBasis === 'PREFERRED_MARKET' ? selectedCrop.preferredMarket + ' 报价' : '重庆市场简单均值（非成交量加权）' }}</p>
              </div>
              <div class="market-chart-controls">
                <div class="market-chart-mode-switch" aria-label="曲线数据来源">
                  <button type="button" :class="{active: chartMode === 'local'}" @click="chooseChartMode('local')">重庆归档 · {{ selectedHistory.length }}日</button>
                  <button type="button" :class="{active: chartMode === 'reference'}" :disabled="!selectedReference" @click="chooseChartMode('reference')">国际参考 · {{ selectedReference?.observationCount || 0 }}期</button>
                </div>
                <div v-if="chartMode === 'local'" class="market-range-switch" aria-label="重庆历史范围">
                  <button v-for="option in RANGE_OPTIONS" :key="option.value" type="button" :class="{active: rangeDays === option.value}" @click="chooseRange(option.value)">{{ option.label }}</button>
                </div>
                <div v-else class="market-range-switch" aria-label="国际参考范围">
                  <button v-for="option in REFERENCE_PERIOD_OPTIONS" :key="option.value" type="button" :class="{active: referencePeriods === option.value}" @click="chooseReferencePeriod(option.value)">{{ option.label }}</button>
                </div>
              </div>
            </header>
            <div v-if="chartMode === 'reference' && selectedReference" class="market-reference-banner">
              <span class="ph ph-globe-hemisphere-west" aria-hidden="true"></span>
              <p><strong>{{ selectedReference.name }}</strong>{{ selectedReference.region }} · {{ selectedReference.label }} · 截至 {{ selectedReference.publishedThrough }} · {{ selectedReference.unitLabel }}
                <a :href="selectedReference.sourceUrl" target="_blank" rel="noopener noreferrer">查看来源</a></p>
            </div>
            <div ref="chartEl" class="market-price-chart" role="img" :aria-label="selectedCrop.cropName + chartRangeLabel + chartUnit + '价格曲线'"></div>
            <p class="market-axis-note"><span class="ph ph-info" aria-hidden="true"></span>{{ axisDisclosure }}</p>
            <details v-if="chartMode === 'local'" class="market-history-details">
              <summary>查看已归档日价明细（{{ selectedHistory.length }} 日）</summary>
              <div class="market-table-wrap">
                <table><thead><tr><th scope="col">日期</th><th scope="col">参考价</th><th scope="col">市场低—高</th><th scope="col">上报市场</th></tr></thead>
                  <tbody><tr v-for="point in [...selectedHistory].reverse()" :key="point.date"><td>{{ point.date }}</td><td>{{ price(point.price) }} 元/公斤</td><td>{{ price(point.minPrice) }}—{{ price(point.maxPrice) }}</td><td>{{ point.marketCount || 0 }} 个</td></tr>
                    <tr v-if="!selectedHistory.length"><td colspan="4">尚未归档真实日价；缺失日期不会用模拟值补齐。</td></tr></tbody>
                </table>
              </div>
            </details>
            <details v-else class="market-history-details">
              <summary>查看国际参考原始观测（{{ selectedReferencePoints.length }} 期）</summary>
              <div class="market-table-wrap">
                <table><thead><tr><th scope="col">发布日期</th><th scope="col">原始报价</th><th scope="col">来源商品</th><th scope="col">数据属性</th></tr></thead>
                  <tbody><tr v-for="point in [...selectedReferencePoints].reverse()" :key="point.date"><td>{{ point.date }}</td><td>{{ price(point.price) }} {{ selectedReference?.unitLabel }}</td><td>{{ selectedReference?.label }}</td><td>外部观测 · 不可与重庆价格直接比较</td></tr>
                    <tr v-if="!selectedReferencePoints.length"><td colspan="4">当前作物没有可用的国际参考序列。</td></tr></tbody>
                </table>
              </div>
            </details>
          </article>

          <aside class="market-observation-panel">
            <span class="market-eyebrow">销售观察 · 非自动卖出信号</span>
            <div class="market-observation-state" :class="'is-' + observationTone(selectedCrop)">
              <span class="ph ph-trend-up" aria-hidden="true"></span>
              <div><strong>{{ selectedCrop.salesObservation?.label || '数据积累中' }}</strong><p>{{ selectedCrop.salesObservation?.message || '等待更多真实日价。' }}</p></div>
            </div>
            <dl class="market-stat-list">
              <div><dt>市场低—高</dt><dd>{{ price(selectedCrop.minPrice) }}—{{ price(selectedCrop.maxPrice) }}</dd></div>
              <div><dt>7日均价</dt><dd>{{ price(selectedCrop.movingAverage7) }}</dd></div>
              <div><dt>7日变化</dt><dd :class="'is-' + changeTone(selectedCrop.sevenDayChangePct)">{{ signed(selectedCrop.sevenDayChangePct, '%') }}</dd></div>
              <div><dt>已归档日数</dt><dd>{{ selectedCrop.historyDays || 0 }} / {{ selectedCrop.requestedRangeDays || rangeDays }}</dd></div>
            </dl>
            <p class="market-observation-basis">依据：{{ selectedCrop.salesObservation?.basis || '等待真实日价' }}</p>
          </aside>
        </div>

        <article v-if="selectedCrop" class="market-comparison-panel">
          <header class="market-panel-heading"><div><span class="market-eyebrow">同日市场横向比较</span><h2>{{ selectedCrop.quoteDate || '当前' }} 报价明细</h2></div><small>{{ selectedQuotes.length }} 个市场上报</small></header>
          <div class="market-table-wrap">
            <table><thead><tr><th scope="col">市场</th><th scope="col">报价</th><th scope="col">相对参考价</th><th scope="col">口径</th></tr></thead>
              <tbody><tr v-for="quote in selectedQuotes" :key="quote.marketName"><td><strong>{{ quote.marketName }}</strong><span v-if="quote.preferred">参考市场</span></td><td>{{ price(quote.price) }} 元/公斤</td><td :class="'is-' + changeTone(Number(quote.price) - Number(selectedCrop.latestPrice))">{{ quoteDifference(quote) }} 元</td><td>{{ quote.preferred ? '当前参考价' : '同日报价' }}</td></tr>
                <tr v-if="!selectedQuotes.length"><td colspan="4">当前没有市场明细；系统不会用演示值补齐正式行情。</td></tr></tbody>
            </table>
          </div>
        </article>
        </template>

        <footer class="market-disclaimer">
          <span class="ph ph-shield-check" aria-hidden="true"></span>
          <p><strong>数据说明</strong>{{ source.method || '日度报价按来源原样展示。' }} {{ source.disclaimer || '' }}
            <a v-if="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">查看原始来源</a></p>
        </footer>
      </template>

      <admin-global-wholesale-panel v-else :crops="crops" :selected-crop-code="selectedCropCode" :farm-id="farmId" :session-mode="state.sessionMode" @select-crop="chooseCrop"></admin-global-wholesale-panel>
    </section>
  `
};
