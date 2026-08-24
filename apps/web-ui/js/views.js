/**
 * AgriLoop 新前端 · 其它视图（今日 / 农务 / 风险 / 经营 / 设置 / 帮助）
 * 数据全部经 ApiService 获取；离线时使用显式标记的模拟数据。
 */
import { api } from './api.js';
import { MOCK_DATA } from './mock-data.js';
import { icon } from './icons.js';
import { esc, badge, num, fmtDue, snackbar, openDialog, alertDialog, PRIORITY_META, WO_STATUS_META } from './ui.js';
import { renderBizBarChart, renderCompareChart, autoResize } from './charts.js';

const viewEl = () => document.getElementById('view');

/* ---------------- 今日 ---------------- */
export async function renderToday(state) {
  const el = viewEl();
  el.innerHTML = `<div class="empty">加载中…</div>`;
  const items = await api.getTodayWorkItems('').catch(() => []);
  const openItems = items.filter(w => w.status !== 'DONE' && w.status !== 'CLOSED');
  const alertPlots = state.plots.filter(p => p.riskLevel === 'HIGH' || Object.values(p.metrics || {}).some(m => m.status && m.status !== 'NORMAL'));
  el.innerHTML = `
    <div class="stat-grid">
      <section class="card stat-card"><div class="label">${icon('work', 16)}待办事项</div><div class="v">${openItems.length} <small>项</small></div><div class="foot">含高优先级 ${openItems.filter(w => w.priority === 'HIGH').length} 项</div></section>
      <section class="card stat-card"><div class="label">${icon('risk', 16)}风险地块</div><div class="v">${alertPlots.length} <small>个</small></div><div class="foot">全场 ${state.plots.length} 个地块</div></section>
      <section class="card stat-card"><div class="label">${icon('device', 16)}设备在线率</div><div class="v">90<small>%</small></div><div class="foot">18 / 20 在线（演示口径）</div></section>
      <section class="card stat-card"><div class="label">${icon('chip', 16)}AI 模式</div><div class="v" style="font-size:17px;padding-top:6px">${state.live ? '在线智能体' : 'rules-only'}</div><div class="foot">${esc(MOCK_DATA.riskForecastConfig.algorithmLabel)}</div></section>
    </div>
    <section class="card" style="margin-top:16px">
      <div class="card-title">全场今日待办</div>
      ${openItems.length ? openItems.map(w => {
        const pm = PRIORITY_META[w.priority] || PRIORITY_META.LOW;
        const sm = WO_STATUS_META[w.status] || WO_STATUS_META.OPEN;
        const plot = state.plots.find(p => p.plotId === w.plotId);
        return `
        <div class="list-row">
          <span class="metric-ic ${w.priority === 'HIGH' ? 'mi-red' : w.priority === 'MEDIUM' ? 'mi-amber' : 'mi-blue'}">${icon(w.actionType === 'INSPECTION' ? 'sprout' : /IRRIG/.test(w.actionType) ? 'drop' : 'work', 18)}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${esc(w.title)} ${badge(pm.label, pm.tone)} ${badge(sm.label, sm.tone)}</div>
            <div style="color:var(--on-faint);font-size:12.5px;margin-top:5px">${esc(plot?.name || w.plotId)} · ${esc(w.reason || '')}</div>
          </div>
          <div style="color:var(--on-variant);font-size:12.5px">${fmtDue(w.dueAt)}</div>
        </div>`;
      }).join('') : `<div class="empty">${icon('check', 26)}今天没有待办，去巡田看看吧</div>`}
    </section>`;
}

/* ---------------- 农务 ---------------- */
export async function renderWork(state) {
  const el = viewEl();
  el.innerHTML = `<div class="empty">加载中…</div>`;
  const [orders, inspections] = await Promise.all([
    api.getWorkOrders().catch(() => []),
    api.getInspections('').catch(() => []),
  ]);
  el.innerHTML = `
    <div class="view-head">
      <h2>农事工单</h2><span class="prov-tag">来源：计划 / 告警 / 设备健康</span>
      <div style="flex:1"></div>
      <button class="btn btn-filled" id="newInspection">${icon('plus', 15)} 录入巡田</button>
    </div>
    <section class="card">
      <table class="table">
        <thead><tr><th>事项</th><th>地块</th><th>优先级</th><th>状态</th><th>截止</th><th>来源</th></tr></thead>
        <tbody>
          ${orders.map(w => {
            const pm = PRIORITY_META[w.priority] || PRIORITY_META.LOW;
            const sm = WO_STATUS_META[w.status] || WO_STATUS_META.OPEN;
            const plot = state.plots.find(p => p.plotId === w.plotId);
            return `<tr>
              <td><div class="t-main">${esc(w.title)}</div><div class="t-sub">${esc(w.reason || '')}</div></td>
              <td>${esc(plot?.name || w.plotId)}</td>
              <td>${badge(pm.label, pm.tone)}</td>
              <td>${badge(sm.label, sm.tone)}</td>
              <td>${fmtDue(w.dueAt)}</td>
              <td><span class="prov-tag">${esc(w.sourceType)}</span></td>
            </tr>`;
          }).join('') || '<tr><td colspan="6">暂无工单</td></tr>'}
        </tbody>
      </table>
    </section>
    <section class="card">
      <div class="card-title">人工巡田核验记录 <span class="prov-tag">USER_PROVIDED · 不覆盖遥测</span></div>
      ${inspections.length ? inspections.map(i => {
        const plot = state.plots.find(p => p.plotId === i.plotId);
        return `
        <div class="list-row">
          <span class="metric-ic mi-green">${icon('sprout', 18)}</span>
          <div style="flex:1">
            <div style="font-weight:600">${esc(plot?.name || i.plotId)} · 便携仪湿度 ${num(i.portableSoilMoisture)}%</div>
            <div style="color:var(--on-faint);font-size:12.5px;margin-top:5px">土表 ${esc(i.soilSurface)} · 作物 ${esc(i.cropCondition)} · ${esc(i.notes || '')}</div>
          </div>
          <div style="color:var(--on-variant);font-size:12.5px">${fmtDue(i.observedAt)}</div>
        </div>`;
      }).join('') : `<div class="empty">暂无巡田记录</div>`}
    </section>`;
  el.querySelector('#newInspection').onclick = () => newInspectionDialog(state);
}

function newInspectionDialog(state) {
  openDialog({
    title: '录入人工巡田观察',
    bodyHTML: `
      <div class="field" style="margin-bottom:10px"><label>地块</label>
        <select id="insPlot" style="width:100%;height:42px;border-radius:10px;border:1px solid var(--outline-strong);padding:0 10px;font:inherit">
          ${state.plots.map(p => `<option value="${esc(p.plotId)}">${esc(p.name)}</option>`).join('')}
        </select></div>
      <div class="field" style="margin-bottom:10px"><label>土表状态</label>
        <select id="insSurface" style="width:100%;height:42px;border-radius:10px;border:1px solid var(--outline-strong);padding:0 10px;font:inherit">
          <option value="DRY">干燥</option><option value="NORMAL">正常</option><option value="WET">偏湿</option>
        </select></div>
      <div class="field" style="margin-bottom:10px"><label>便携仪土壤湿度（%）</label>
        <input id="insMoisture" type="number" min="0" max="100" step="0.1" value="20" /></div>
      <div class="field"><label>备注</label>
        <input id="insNotes" placeholder="现场观察描述…" /></div>`,
    actions: [
      { label: '取消', tone: 'text', onClick: () => {} },
      {
        label: '保存记录', tone: 'filled', onClick: async () => {
          const rec = {
            plotId: document.getElementById('insPlot').value,
            soilSurface: document.getElementById('insSurface').value,
            cropCondition: 'NORMAL',
            deviceStatus: 'NORMAL',
            portableSoilMoisture: Number(document.getElementById('insMoisture').value) || 0,
            notes: document.getElementById('insNotes').value || '',
          };
          try {
            await api.createInspection(rec);
            snackbar('巡田记录已保存（USER_PROVIDED）', { tone: 'green' });
            renderWork(state);
          } catch (e) { snackbar(`保存失败：${e.message}`, { tone: 'red' }); }
        },
      },
    ],
  });
}

/* ---------------- 风险 ---------------- */
export async function renderRisk(state) {
  const el = viewEl();
  el.innerHTML = `<div class="empty">加载中…</div>`;
  const forecasts = await Promise.all(state.plots.map(p => api.getRiskForecast(p.plotId).catch(() => ({ status: 'UNAVAILABLE' }))));
  el.innerHTML = `
    <div class="view-head"><h2>未来 4 小时风险预测</h2>
      <span class="prov-tag">${esc(MOCK_DATA.riskForecastConfig.algorithmLabel)} · ${esc(MOCK_DATA.riskForecastConfig.algorithmVersion)}</span>
      <span class="prov-tag">样本/质量不足时返回 UNAVAILABLE</span></div>
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
      ${state.plots.map((p, i) => {
        const f = forecasts[i] || {};
        const ok = f.status === 'AVAILABLE';
        return `
        <section class="card stat-card">
          <div class="label">${icon('gauge', 16)}${esc(p.name)} ${ok ? badge('AVAILABLE', 'green') : badge('UNAVAILABLE', 'gray')}</div>
          ${ok ? `
            <div class="v">${num(f.timeToRiskMinutes, 0)} <small>分钟后触达胁迫边界</small></div>
            <div class="foot">当前 ${num(f.startMoisture)}% · 边界 ${num(f.stressBoundary)}%</div>
            <div class="foot">${(f.horizons || []).map(h => `${h.minute / 60}h ≈ ${num(h.expected ?? h.value)}%`).join(' ｜ ')}</div>
            <button class="link" data-sim="${esc(p.plotId)}" style="margin-top:8px">${icon('biz', 14)} 情景双轨推演</button>`
          : `<div class="foot" style="margin-top:10px">${esc(f.reason || '遥测样本不足，拒绝生成预测')}</div>`}
        </section>`;
      }).join('')}
    </div>
    <section class="card" style="margin-top:16px">
      <div class="card-title">情景目录 <span class="prov-tag">同一冻结快照 + 随机种子 · 不写回主状态</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        ${MOCK_DATA.riskForecastConfig.scenarioCatalog.map(s => `<button class="chip" data-scenario="${s.code}">${s.emoji} ${esc(s.label)}</button>`).join('')}
      </div>
    </section>`;
  el.querySelectorAll('[data-sim]').forEach(b => b.onclick = () => runScenario(state, b.dataset.sim));
  el.querySelectorAll('[data-scenario]').forEach(b => b.onclick = () => runScenario(state, state.plotId, b.dataset.scenario));
}

async function runScenario(state, plotId, scenario = 'DROUGHT') {
  try {
    const cmp = await api.compareScenario({ scenario, seed: 42, plotId });
    if (cmp.status === 'UNAVAILABLE') { alertDialog({ title: '情景推演', bodyHTML: `<div>${esc(cmp.reason || '该情景不可用')}</div>` }); return; }
    openDialog({
      title: `${cmp.scenarioLabel || scenario} · 执行 vs 不执行`,
      bodyHTML: `
        <div class="kv"><span>冻结快照</span><b>${esc(cmp.frozenSnapshot?.plotName || plotId)} · 起始 ${num(cmp.frozenSnapshot?.startMoisture)}%</b></div>
        <div class="kv"><span>随机种子</span><b>${cmp.seed}</b></div>
        <div class="chart-box" id="cmpChart"></div>
        <div style="margin-top:8px">${esc(cmp.note || '双轨只读，不写回主状态')} <span class="prov-tag">provenance: SIMULATED</span></div>`,
      actions: [{ label: '关闭', tone: 'filled', onClick: () => {} }],
    });
    const chart = renderCompareChart(document.getElementById('cmpChart'), cmp);
    if (chart) state.charts.push(chart, autoResize(chart));
  } catch (e) {
    snackbar(`情景推演失败：${e.message}`, { tone: 'red' });
  }
}

/* ---------------- 经营 ---------------- */
export async function renderBiz(state) {
  const el = viewEl();
  el.innerHTML = `<div class="empty">加载中…</div>`;
  const ledger = await api.getValueLedgers().catch(() => MOCK_DATA.valueLedger);
  const s = ledger.summary || {};
  el.innerHTML = `
    <div class="view-head"><h2>经营价值账本</h2>
      <span class="prov-tag">OBSERVED(sourceMode=SIMULATION) / DERIVED / ESTIMATED</span></div>
    <div class="stat-grid">
      <section class="card stat-card"><div class="label">${icon('drop', 16)}节约用水</div><div class="v">${num(s.savedWaterLitres, 0)} <small>L</small></div><div class="foot">偏差率 ${num(s.deviationRatePct)}%</div></section>
      <section class="card stat-card"><div class="label">${icon('biz', 16)}折合节约</div><div class="v">¥${num(s.totalSavedRmb, 2)}</div><div class="foot">水 ¥${num(s.savedWaterCostRmb, 2)} · 电 ¥${num(s.savedElectricityCostRmb, 2)} · 工 ¥${num(s.labourSavedCostRmb, 0)}</div></section>
      <section class="card stat-card"><div class="label">${icon('clock', 16)}节约工时</div><div class="v">${num(s.labourSavedHours)} <small>h</small></div><div class="foot">人工单价 35 元/h</div></section>
      <section class="card stat-card"><div class="label">${icon('calendar', 16)}统计周期</div><div class="v" style="font-size:16px;padding-top:6px">${esc(ledger.period?.start)} ~ ${esc(ledger.period?.end)}</div><div class="foot">${esc(ledger.farmName || '')}</div></section>
    </div>
    <section class="card" style="margin-top:16px">
      <div class="card-title">每日计划 vs 实际用水（L）</div>
      <div class="chart-box" id="bizChart" style="min-height:260px"></div>
    </section>
    <section class="card">
      <div class="card-title">反事实对比（传统粗放灌溉 vs AgriLoop） <span class="prov-tag">ESTIMATED · 行业经验参数</span></div>
      <table class="table" style="margin-top:8px">
        <thead><tr><th>周</th><th>传统成本（元）</th><th>AgriLoop 成本（元）</th><th>节约</th></tr></thead>
        <tbody>${(ledger.counterfactual || []).map(c => `<tr><td>${esc(c.week)}</td><td>${num(c.traditionalCostRmb, 0)}</td><td>${num(c.agriLoopCostRmb, 0)}</td><td>${badge('¥' + num(c.traditionalCostRmb - c.agriLoopCostRmb, 0), 'green')}</td></tr>`).join('')}</tbody>
      </table>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        ${(ledger.provenance || []).map(p => `<span class="prov-tag">${esc(p.key)}：${esc(p.value)} · ${esc(p.tag)}</span>`).join('')}
      </div>
    </section>`;
  const chart = renderBizBarChart(document.getElementById('bizChart'), ledger.daily || []);
  if (chart) state.charts.push(chart, autoResize(chart));
}

/* ---------------- 设置 / 帮助 ---------------- */
export async function openSettings({ live } = {}) {
  const packs = await api.getCropPacks().catch(() => MOCK_DATA.cropPackDetails);
  alertDialog({
    title: '设置 · 系统信息',
    bodyHTML: `
      <div class="kv"><span>前端版本</span><b>material-ui v1.0（yyx1）</b></div>
      <div class="kv"><span>后端连接</span><b>${live ? '在线（/api/v1）' : '离线演示'}</b></div>
      <div class="kv"><span>会话模式</span><b>${api.sessionMode || '--'}</b></div>
      <div class="kv"><span>数据主线</span><b>MQTT → Streams → PostgreSQL → SSE</b></div>
      <h4>已加载作物包</h4>
      ${packs.map(p => `<div class="kv"><span>${esc(p.identity?.name || p.cropCode)}</span><b>pack ${esc(p.version || p.schemaVersion || '1.0')} · ${esc(p.ruleVersion || '')} · ${esc(p.knowledgeVersion || '')}</b></div>`).join('')}
      <div style="margin-top:10px" class="prov-tag">参数解析顺序：系统默认 → Crop Pack → 农场 → 地块</div>`,
    okText: '关闭',
  });
}

export function openHelp() {
  alertDialog({
    title: '帮助',
    bodyHTML: `
      <div>AgriLoop 农智闭环演示前端，覆盖三条主线：模拟数据传输 → 智能体决策 → 可视化呈现/操作。</div>
      <h4>基线文档</h4>
      <div>· 01_智慧农业_基本功能清单.md</div>
      <div>· 02_智慧农业_功能架构.md</div>
      <div>· 03_智慧农业_技术架构.md</div>
      <div>· 04_智慧农业_大致路线与流程.md</div>
      <h4>演示提示</h4>
      <div>· 地块视图支持 24h/7d/30d 趋势切换与灌溉处方下发（虚拟执行器）。</div>
      <div>· 风险视图提供 1~4h 确定性预测与情景双轨推演（只读，不写回主状态）。</div>
      <div>· 后端离线时自动进入离线演示模式，所有数据标记为 SIMULATED。</div>`,
    okText: '关闭',
  });
}
