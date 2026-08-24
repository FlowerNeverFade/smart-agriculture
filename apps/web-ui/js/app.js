import { api } from './api.js';
import { MOCK_DATA } from './mock-data.js';

const { createApp, ref, onMounted, nextTick, watch, computed } = Vue;

// 1. Define Components
const DashboardView = {
  template: '#tmpl-dashboard',
  props: ['state']
};

const DecisionConsoleView = {
  template: '#tmpl-decision-console',
  props: ['state']
};

const RiskForecastView = {
  template: '#tmpl-risk-forecast',
  props: ['state'],
  setup(props) {
    let chart = null;
    
    const renderChart = async () => {
      await nextTick();
      const dom = document.getElementById('riskChart');
      if (!dom) return;
      if (!chart) {
        chart = echarts.init(dom);
        window.addEventListener('resize', () => chart.resize());
      }
      
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = isDark ? '#e8eaed' : '#202124';
      
      const times = ["当前", "1小时后", "2小时后", "4小时后"];
      const moisture = [16.8, 15.2, 13.8, 11.5]; // Data from mock horizons
      
      chart.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: times, axisLabel: { color: textColor } },
        yAxis: { 
          type: 'value', 
          name: '土壤湿度 (%)', 
          min: 10,
          axisLabel: { color: textColor },
          nameTextStyle: { color: textColor }
        },
        series: [{
          data: moisture,
          type: 'line',
          smooth: true,
          itemStyle: { color: '#f9ab00' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(249,171,0,0.4)' },
              { offset: 1, color: 'rgba(249,171,0,0.0)' }
            ])
          },
          markLine: {
            data: [{ yAxis: 14.0, name: '胁迫边界' }],
            lineStyle: { color: '#d93025', type: 'dashed' }
          }
        }]
      });
    };

    onMounted(renderChart);
    // Listen for theme changes to re-render
    const observer = new MutationObserver(() => renderChart());
    onMounted(() => observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }));
    
    return {};
  }
};

const WorkOrdersView = {
  template: '#tmpl-work-orders',
  props: ['state']
};

const CropPacksView = {
  template: '#tmpl-crop-packs',
  props: ['state']
};

const ValueLedgerView = {
  template: '#tmpl-value-ledger',
  props: ['state'],
  setup(props) {
    let chart = null;

    const renderChart = async () => {
      await nextTick();
      const dom = document.getElementById('ledgerChart');
      if (!dom) return;
      if (!chart) {
        chart = echarts.init(dom);
        window.addEventListener('resize', () => chart.resize());
      }

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = isDark ? '#e8eaed' : '#202124';
      const dailyData = props.state.valueLedger.daily;

      chart.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        xAxis: { 
          type: 'category', 
          data: dailyData.map(d => d.date),
          axisLabel: { color: textColor }
        },
        yAxis: { 
          type: 'value', 
          name: '偏差率 (%)',
          axisLabel: { color: textColor },
          nameTextStyle: { color: textColor }
        },
        series: [{
          data: dailyData.map(d => d.deviationRatePct),
          type: 'bar',
          itemStyle: {
            color: (params) => params.value < 0 ? '#1e8e3e' : '#d93025'
          }
        }]
      });
    };

    onMounted(renderChart);
    const observer = new MutationObserver(() => renderChart());
    onMounted(() => observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }));

    return {};
  }
};

// 2. Setup App
const app = createApp({
  components: {
    'dashboard-view': DashboardView,
    'decision-console-view': DecisionConsoleView,
    'risk-forecast-view': RiskForecastView,
    'work-orders-view': WorkOrdersView,
    'crop-packs-view': CropPacksView,
    'value-ledger-view': ValueLedgerView
  },
  setup() {
    const isLive = ref(false);
    const isDark = ref(false);
    const currentView = ref('dashboard');
    
    const navItems = [
      { id: 'dashboard', label: '农智总览', icon: 'dashboard' },
      { id: 'decision-console', label: '决策沙盘', icon: 'psychology' },
      { id: 'risk-forecast', label: '风险推演', icon: 'timeline' },
      { id: 'work-orders', label: '农务工单', icon: 'task' },
      { id: 'crop-packs', label: '作物模型', icon: 'library_books' },
      { id: 'value-ledger', label: '价值对账', icon: 'account_balance_wallet' }
    ];

    const currentViewComponent = computed(() => `${currentView.value}-view`);

    // Reactive State representing all the data originally rendered manually
    const state = ref({
      plots: MOCK_DATA.plots,
      feedItems: MOCK_DATA.feedItems,
      workOrders: MOCK_DATA.workOrders,
      cropPackDetails: MOCK_DATA.cropPackDetails,
      riskForecastConfig: MOCK_DATA.riskForecastConfig,
      valueLedger: MOCK_DATA.valueLedger
    });

    const toggleTheme = () => {
      isDark.value = !isDark.value;
      const theme = isDark.value ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.colorScheme = theme;
      localStorage.setItem('agriloop-theme', theme);
    };

    const navigate = (viewId) => {
      currentView.value = viewId;
    };

    onMounted(async () => {
      // 1. Session Check (Preserving original contract)
      const session = api.readSession();
      if (!session) {
        window.location.replace('login.html');
        return;
      }

      // 2. Theme Init
      const savedTheme = localStorage.getItem('agriloop-theme');
      if (savedTheme === 'dark') {
        isDark.value = true;
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
      }

      // 3. Health Check
      isLive.value = await api.checkHealth();
    });

    return {
      isLive,
      isDark,
      navItems,
      currentView,
      currentViewComponent,
      state,
      toggleTheme,
      navigate
    };
  }
});

app.mount('#app');
