import { api } from './api.js';
import { MOCK_DATA } from './mock-data.js';

const { createApp, ref, computed, onMounted, nextTick, watch } = Vue;

// 1. Define Components
const DashboardView = {
  template: '#tmpl-dashboard',
  props: ['state'],
  setup(props, { emit }) {
    const handleAction = (action) => {
      if (action.action === 'open-subview') {
        emit('navigate', action.view);
      } else {
        alert('Action Executed: ' + action.label);
      }
    };
    return { handleAction };
  }
};

const DecisionConsoleView = {
  template: '#tmpl-decision-console',
  props: ['state'],
  setup(props) {
    // Find the specific feed items
    const diagnosis = computed(() => props.state.feedItems.find(f => f.type === 'DIAGNOSIS'));
    const prescription = computed(() => props.state.feedItems.find(f => f.type === 'PRESCRIPTION'));
    
    // Chat Logic
    const chatInput = ref('');
    const chatHistory = ref([
      { role: 'agent', content: '您好，我是 AgriLoop 农业决策智能体。我已经接入了当前地块的传感器实时数据和生长阶段的阈值模型。<br><br>关于番茄当前阶段的灌溉处方，或者刚才生成的诊断结论，您有任何疑问都可以随时问我。' }
    ]);
    const isTyping = ref(false);
    const chatBox = ref(null);

    const sendMessage = () => {
      if (!chatInput.value.trim()) return;
      
      const userMessage = chatInput.value.trim();
      chatHistory.value.push({ role: 'user', content: userMessage });
      chatInput.value = '';
      
      isTyping.value = true;
      scrollToBottom();
      
      setTimeout(() => {
        isTyping.value = false;
        let reply = '基于当前环境遥测与生长模型，系统判断您的要求在安全阈值内，已为您记录参考。';
        if (userMessage.includes('为什么') || userMessage.includes('原因')) {
          reply = '我注意到当前的土壤湿度连续低于 20%（番茄结果期基线）。同时，空气温度 26.4°C 加速了蒸散，且传感器数据质量评分为 GOOD（排除了硬件漂移）。因此诊断为真实水分胁迫。';
        } else if (userMessage.includes('处方') || userMessage.includes('水')) {
          reply = '针对此情况，处方引擎计算出需要 153 升水。根据您农场主管道的 18L/min 恒定流速，换算出的执行时长为 8 分 30 秒。该时长低于 900 秒的安全阈值上限。';
        }
        
        chatHistory.value.push({ role: 'agent', content: reply });
        scrollToBottom();
      }, 1500);
    };

    const scrollToBottom = () => {
      nextTick(() => {
        if (chatBox.value) {
          chatBox.value.scrollTop = chatBox.value.scrollHeight;
        }
      });
    };
    
    const executePrescription = () => {
      alert('已成功触发下行控制指令 (Virtual Execution)。\nTrace ID: run-20260822-001\n请前往价值对账本查看仿真效益。');
    };

    return { diagnosis, prescription, chatInput, chatHistory, isTyping, chatBox, sendMessage, executePrescription };
  }
};

const RiskForecastView = {
  template: '#tmpl-risk-forecast',
  props: ['state'],
  setup(props) {
    let chart = null;
    const currentScenario = ref('DROUGHT');
    
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
      
      const scenario = props.state.riskForecastConfig.scenarioCatalog.find(s => s.code === currentScenario.value);
      const decay = scenario ? scenario.decayFactor : 1.0;
      
      // Calculate mock curve based on scenario
      const times = ["0h (Now)", "1h", "2h", "3h", "4h"];
      const baseMoisture = 20.0; // Current base
      const mockCurve = times.map((t, i) => {
        if (scenario && scenario.code === 'STORM') {
            return i === 0 ? baseMoisture : (i === 1 ? baseMoisture + 6 : baseMoisture + 4 - i);
        }
        return Math.max(8.0, baseMoisture - (i * 2.8 * decay));
      });
      
      chart.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: times, axisLabel: { color: textColor } },
        yAxis: { 
          type: 'value', 
          name: '推演含水率 (%)', 
          min: 5, max: 35,
          axisLabel: { color: textColor },
          nameTextStyle: { color: textColor }
        },
        series: [{
          data: mockCurve,
          type: 'line',
          smooth: true,
          itemStyle: { color: scenario ? scenario.color : '#1a73e8' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: scenario ? scenario.color : '#1a73e8' },
              { offset: 1, color: 'rgba(0,0,0,0.0)' }
            ]),
            opacity: 0.2
          },
          markLine: {
            data: [{ yAxis: props.state.riskForecastConfig.stressBoundary, name: '胁迫极限 14%' }],
            lineStyle: { color: '#d93025', type: 'dashed' },
            label: { position: 'insideStartTop', color: textColor, formatter: '{b}' }
          }
        }]
      });
    };

    const changeScenario = (scenario) => {
      currentScenario.value = scenario.code;
      renderChart();
    };

    onMounted(() => {
        currentScenario.value = props.state.riskForecastConfig.scenarioCatalog[0].code;
        renderChart();
    });
    
    const observer = new MutationObserver(() => renderChart());
    onMounted(() => observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }));
    
    return { currentScenario, changeScenario };
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
        tooltip: { trigger: 'axis', formatter: '{b}: {c}% 偏差' },
        xAxis: { 
          type: 'category', 
          data: dailyData.map(d => d.date.split('-')[1]),
          axisLabel: { color: textColor }
        },
        yAxis: { 
          type: 'value', 
          name: '水量偏差率 (%)',
          axisLabel: { color: textColor },
          nameTextStyle: { color: textColor }
        },
        series: [{
          data: dailyData.map(d => d.deviationRatePct),
          type: 'bar',
          itemStyle: {
            color: (params) => params.value <= 0 ? '#1e8e3e' : '#d93025'
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
      currentUser: MOCK_DATA.currentUser,
      farms: MOCK_DATA.farms,
      plots: MOCK_DATA.plots,
      feedItems: MOCK_DATA.feedItems,
      workOrders: MOCK_DATA.workOrders,
      inspections: MOCK_DATA.inspections,
      resourceProfile: MOCK_DATA.resourceProfile,
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
