/**
 * AgriLoop Frontend - Module: Crop Pack Registry (任务包 5 · crop-packs)
 * 作物包多阶段参数阅读器 + Markdown 农业知识文档阅读器 + 规则注册表
 * 数据与后端 crop-packs 目录下 pack.yaml 对齐（版本化注入，前端不复制作物分支）
 */
import { api } from '../api.js?v=20260824-module-v5';
import { escapeHtml } from '../charts.js';

const CROP_EMOJI = { tomato: '🍅', cucumber: '🥒', strawberry: '🍓', pepper: '🌶️' };
const STAGE_EMOJI = { seedling: '🌱', vegetative: '🌿', flowering: '🌸' };
const AV_CLS = {
  SUPPORTED: 'agri-pill-ok',
  SIMULATION_ONLY: 'agri-pill-blue',
  UNAVAILABLE: 'agri-pill-danger'
};
const AV_LABEL = {
  SUPPORTED: '已支持',
  SIMULATION_ONLY: '仅模拟',
  UNAVAILABLE: '不可用',
};
const RISK_LABEL = {
  WATER_DEFICIT: '水分亏缺',
  HEAT_STRESS: '高温胁迫',
  COLD_STRESS: '低温胁迫',
};
const OPERATOR_LABEL = {
  LT: '低于',
  LTE: '不高于',
  GT: '高于',
  GTE: '不低于',
  EQ: '等于',
};
const PRIORITY_LABEL = { HIGH: '高优先级', MEDIUM: '中优先级', LOW: '低优先级' };
const RISK_COLOR = { WATER_DEFICIT: '#d29922', HEAT_STRESS: '#f85149', COLD_STRESS: '#58a6ff' };
const SCENARIO_LABEL = {
  normal: '正常', drought: '持续干旱', 'heavy-rain': '暴雨积水',
  'sensor-drift': '传感器漂移', 'device-offline': '设备离线'
};

function metricLabel(metrics, code) {
  return metrics.find(item => item.code === code)?.label || code;
}

/** 轻量 Markdown 渲染（标题/段落/列表/引用），无外部依赖 */
function renderMarkdown(lines) {
  const out = [];
  let listOpen = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('# ')) {
      if (listOpen) { out.push('</ul>'); listOpen = false; }
      out.push(`<h4 class="cp-md-h">${escapeHtml(line.slice(2))}</h4>`);
    } else if (line.startsWith('> ')) {
      if (listOpen) { out.push('</ul>'); listOpen = false; }
      out.push(`<blockquote class="cp-md-quote">${escapeHtml(line.slice(2))}</blockquote>`);
    } else if (line.startsWith('- ')) {
      if (!listOpen) { out.push('<ul class="cp-md-list">'); listOpen = true; }
      out.push(`<li>${escapeHtml(line.slice(2))}</li>`);
    } else if (line === '') {
      if (listOpen) { out.push('</ul>'); listOpen = false; }
    } else {
      if (listOpen) { out.push('</ul>'); listOpen = false; }
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  if (listOpen) out.push('</ul>');
  return out.join('');
}

export async function renderCropPacks(container, context = {}) {
  try {
    return await paintCropPacks(container, context);
  } catch (error) {
    console.error('[AgriLoop] crop-packs render failed:', error);
    container.innerHTML = `
      <div class="agri-alert agri-alert-danger">
        <div class="agri-alert-icon">⚠️</div>
        <div>
          <strong>作物包渲染中断，已降级</strong>
          <p>${escapeHtml(error?.message || error)}</p>
        </div>
      </div>`;
    return () => {};
  }
}

async function paintCropPacks(container, context = {}) {
  container.innerHTML = `
    <div class="agri-skeleton-wrap" id="cp-loading">
      <div class="agri-skeleton agri-skeleton-title"></div>
      <div class="agri-skeleton agri-skeleton-line"></div>
      <div class="agri-skeleton agri-skeleton-line short"></div>
      <div class="agri-skeleton agri-skeleton-line"></div>
    </div>`;

  const packs = await api.getCropPacks();
  if (!container.isConnected || !container.querySelector('#cp-loading')) return () => {};
  if (!Array.isArray(packs) || !packs.length) {
    container.innerHTML = `
      <div class="agri-alert agri-alert-danger">
        <div class="agri-alert-icon">📦</div>
        <div>
          <strong>暂无可用作物包</strong>
          <p>后端未返回 Crop Pack，或归一化后为空。请确认 seed-data / crop-packs 配置后重试。</p>
        </div>
      </div>`;
    return () => {};
  }
  let activePack = packs.find(pack => pack.cropCode === context.cropCode) || packs[0];

  container.innerHTML = `
    <div class="agri-module cp-root">
      <div class="rf-header">
        <div>
          <div class="agri-module-title">📦 作物培养指导</div>
          <div class="agri-module-sub">作物培养手册：阶段参数、指标定义、规则阈值、知识文档与处方约束 · 配置架构 Schema ${escapeHtml(packs[0]?.schemaVersion || '1.0')}</div>
        </div>
        <div class="rf-header-right">
          <button class="cmd-nav-btn" type="button" data-action="back-home">🏠 返回主面板</button>
          <button class="cmd-nav-btn" data-nav="value-ledger">💰 效益对账</button>
          <button class="cmd-nav-btn" data-nav="risk-forecast">🔮 风险预测</button>
          <span class="agri-pill agri-pill-ok">Schema ${escapeHtml(packs[0]?.schemaVersion || '1.0')}</span>
        </div>
      </div>

      <div class="cp-tabs" data-role="cp-tabs">
        ${packs.map(p => `
          <button class="cp-tab ${p.cropCode === activePack.cropCode ? 'active' : ''}" data-crop="${p.cropCode}">
            ${CROP_EMOJI[p.cropCode] || '🌾'} ${escapeHtml(p.identity?.name || p.name || p.cropCode)}
            <span class="agri-mono cp-tab-ver">v${escapeHtml(p.version)}</span>
          </button>
        `).join('')}
      </div>

      <div data-role="cp-body"></div>
    </div>`;

  const tabs = container.querySelector('[data-role="cp-tabs"]');
  const bodyEl = container.querySelector('[data-role="cp-body"]');
  container.querySelectorAll('.cmd-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'back-home') {
        context.app?.navigate?.('home') || (window.location.hash = '');
        return;
      }
      if (btn.dataset.nav) window.location.hash = `view=${btn.dataset.nav}`;
    });
  });

  const renderBody = (pack) => {
    if (!pack || !bodyEl) return;
    const stages = Array.isArray(pack.stages) ? pack.stages : [];
    const metrics = Array.isArray(pack.metrics) ? pack.metrics : [];
    const rules = Array.isArray(pack.rules) ? pack.rules : [];
    const identity = pack.identity || { name: pack.name || pack.cropCode, variety: '', region: '' };
    const constraints = pack.prescriptionConstraints || {};
    const forecast = pack.forecastProfile || {};
    const coordination = pack.coordinationProfile || {};
    const knowledge = pack.knowledge || { documents: [], content: [], fallback: [] };
    const scenarios = pack.scenarios && !Array.isArray(pack.scenarios) ? pack.scenarios : {};
    const testCases = Array.isArray(pack.testCases) ? pack.testCases : [];
    bodyEl.innerHTML = `
      <!-- 概览：身份与指标定义 -->
      <div class="agri-card cp-identity">
        <div class="agri-card-title">🧬 作物档案与指标定义</div>
        <div class="cp-id-grid">
          <div class="cp-id-item"><span class="agri-kv-key">作物</span><b>${escapeHtml(identity.name)}</b>（${escapeHtml(identity.variety)}）</div>
          <div class="cp-id-item"><span class="agri-kv-key">地区</span>${escapeHtml(identity.region)}</div>
          <div class="cp-id-item"><span class="agri-kv-key">配置包版本</span><span class="agri-mono">v${escapeHtml(pack.version)}</span></div>
          <div class="cp-id-item"><span class="agri-kv-key">规则版本</span><span class="agri-mono">${escapeHtml(pack.ruleVersion)}</span></div>
          <div class="cp-id-item"><span class="agri-kv-key">知识版本</span><span class="agri-mono">${escapeHtml(pack.knowledgeVersion)}</span></div>
          <div class="cp-id-item"><span class="agri-kv-key">阶段数</span>${stages.length} · 指标 ${metrics.length} 项 · 规则 ${rules.length} 条</div>
        </div>
        <div class="cp-metrics">
          ${metrics.map(m => `
            <div class="cp-metric">
              <div class="cp-metric-head">
                <div class="cp-metric-name cp-metric-name--primary">${escapeHtml(m.label)}<span class="cp-metric-unit">（${escapeHtml(m.unit)}）</span></div>
                <span class="agri-pill ${AV_CLS[m.availability] || 'agri-pill-blue'}">${AV_LABEL[m.availability] || m.availability}</span>
              </div>
              <div class="cp-metric-code agri-mono">${m.code}</div>
              <div class="cp-metric-range">适宜范围 <span class="agri-mono">${m.range?.min ?? '-'} ~ ${m.range?.max ?? '-'}</span></div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 多阶段参数卡片（时间线） -->
      <div class="agri-card">
        <div class="agri-card-title">🌱 生长阶段适宜参数</div>
        <div class="cp-stages">
          ${stages.map(s => `
            <div class="cp-stage">
              <div class="cp-stage-head">
                <span class="cp-stage-emoji">${STAGE_EMOJI[s.code] || CROP_EMOJI[pack.cropCode] || '🌾'}</span>
                <div>
                  <div class="cp-stage-name">${escapeHtml(s.label)}</div>
                  <div class="cp-stage-code">第 ${s.sequence} 阶段 · <span class="agri-mono">${s.code}</span></div>
                </div>
              </div>
              <div class="cp-stage-targets">
                <div class="cp-target">
                  <span>土壤湿度</span>
                  <b class="agri-mono">${s.target?.soilMoistureLow ?? '-'} ~ ${s.target?.soilMoistureHigh ?? '-'}%</b>
                </div>
                <div class="cp-target">
                  <span>棚内温度</span>
                  <b class="agri-mono">${s.target?.airTemperatureLow ?? '-'} ~ ${s.target?.airTemperatureHigh ?? '-'}°C</b>
                </div>
              </div>
              <div class="cp-stage-risk">
                ${(s.riskFocus || []).map(r => `<span class="cp-risk-chip" style="--rc:${RISK_COLOR[r] || '#8b949e'}">${RISK_LABEL[r] || r}</span>`).join('')}
              </div>
              ${(s.taskTemplates || []).map(t => `
                <div class="cp-task-template">${escapeHtml(t.actionType || '农务任务')} · 每 ${t.intervalDays} 天 · ${PRIORITY_LABEL[t.priority] || t.priority} <span class="agri-mono cp-task-code">${t.actionType}</span></div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 规则注册表 -->
      <div class="agri-card">
        <div class="agri-card-title">⚖️ 阈值规则注册表</div>
        <table class="vl-provenance-table">
          <thead><tr><th>规则名称</th><th>监测指标</th><th>触发条件</th><th>阈值</th><th>持续(分)</th><th>迟滞</th><th>冷却(分)</th></tr></thead>
          <tbody>
            ${rules.map(r => `
              <tr>
                <td><strong>${RISK_LABEL[r.code] || r.code}</strong><div class="cp-rule-code agri-mono">${r.code}</div></td>
                <td><span>${metricLabel(metrics, r.metric)}</span><div class="cp-rule-code agri-mono">${r.metric}</div></td>
                <td>${OPERATOR_LABEL[r.operator] || r.operator}</td>
                <td class="agri-mono"><b>${r.threshold}</b></td>
                <td class="agri-mono">${r.durationMinutes}</td>
                <td class="agri-mono">${r.hysteresis}</td>
                <td class="agri-mono">${r.cooldownMinutes}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="rf-meta-grid cp-constraints">
          <div><span class="agri-kv-key">处方时长上限</span><span class="agri-mono">${constraints.maxDurationSeconds ?? '-'}s</span></div>
          <div><span class="agri-kv-key">灌溉冷却</span><span class="agri-mono">${constraints.cooldownMinutes ?? '-'}min</span></div>
          <div><span class="agri-kv-key">日用水上限</span><span class="agri-mono">${constraints.maxDailyWaterLitres ?? '-'}L</span></div>
          <div><span class="agri-kv-key">预测算法</span><span class="agri-mono">${escapeHtml(forecast.algorithm)}</span></div>
          <div><span class="agri-kv-key">预测时距</span><span class="agri-mono">${(forecast.horizonsMinutes || []).join('/')}min</span></div>
          <div><span class="agri-kv-key">阶段敏感度</span><span class="agri-mono">${coordination.stageSensitivity ?? '-'}</span></div>
        </div>
      </div>

      <!-- 知识文档阅读器 -->
      <div class="agri-card cp-knowledge">
        <div class="agri-card-title">📚 农业知识文档阅读器</div>
        <div class="cp-knowledge-head">
          <span class="agri-mono cp-knowledge-doc">${escapeHtml((knowledge.documents || []).join(', '))}</span>
          <span class="agri-pill agri-pill-blue">kb-${escapeHtml(pack.knowledgeVersion)}</span>
        </div>
        <div class="cp-md">${renderMarkdown(Array.isArray(knowledge.content) ? knowledge.content : [])}</div>
        <div class="cp-fallback">
          <span class="agri-kv-key">检索回退链</span>
          <span class="agri-mono">${(knowledge.fallback || []).map(f => escapeHtml(f)).join(' → ')}</span>
          <span class="agri-meta-line" style="margin-left:auto">知识不足时按 地块→地区→阶段→作物→通用 逐级回退并标明证据范围</span>
        </div>
      </div>

      <!-- 情景映射与测试用例 -->
      <div class="agri-card">
        <div class="agri-card-title">🧪 情景映射与回归用例</div>
        <div class="cp-scenarios">
          ${Object.entries(scenarios).map(([code, sc]) => `
            <div class="cp-scenario">
              <div class="cp-scenario-name">${escapeHtml(SCENARIO_LABEL[code] || code)} <span class="cp-scenario-code agri-mono">${code}</span></div>
              <div class="cp-scenario-quality agri-pill ${sc.quality === 'GOOD' ? 'agri-pill-ok' : sc.quality === 'DEGRADED' ? 'agri-pill-warn' : 'agri-pill-danger'}">${sc.quality === 'GOOD' ? '质量良好' : sc.quality === 'DEGRADED' ? '质量下降' : sc.quality || '-'}</div>
              <div class="cp-scenario-expected agri-mono">${escapeHtml(sc.expected)}</div>
            </div>
          `).join('')}
        </div>
        <div class="agri-meta-line">回归用例：${testCases.map(t => escapeHtml(t)).join(' · ')}</div>
      </div>`;
  };

  tabs?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cp-tab');
    if (!btn) return;
    tabs.querySelectorAll('.cp-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const pack = packs.find(p => p.cropCode === btn.dataset.crop);
    if (pack) { activePack = pack; renderBody(pack); }
  });

  renderBody(activePack);
  return () => {};
}
