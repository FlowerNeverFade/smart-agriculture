/**
 * AgriLoop Frontend - Module: Crop Pack Registry (任务包 5 · crop-packs)
 * 作物包多阶段参数阅读器 + Markdown 农业知识文档阅读器 + 规则注册表
 * 数据与后端 crop-packs 目录下 pack.yaml 对齐（版本化注入，前端不复制作物分支）
 */
import { api } from '../api.js';
import { escapeHtml } from '../charts.js';

const CROP_EMOJI = { tomato: '🍅', cucumber: '🥒', strawberry: '🍓', pepper: '🌶️' };
const STAGE_EMOJI = { seedling: '🌱', vegetative: '🌿', flowering: '🌸' };
const AV_CLS = {
  SUPPORTED: 'agri-pill-ok',
  SIMULATION_ONLY: 'agri-pill-blue',
  UNAVAILABLE: 'agri-pill-danger'
};
const RISK_COLOR = { WATER_DEFICIT: '#d29922', HEAT_STRESS: '#f85149', COLD_STRESS: '#58a6ff' };
const SCENARIO_LABEL = {
  normal: '正常', drought: '持续干旱', 'heavy-rain': '暴雨积水',
  'sensor-drift': '传感器漂移', 'device-offline': '设备离线'
};

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

export async function renderCropPacks(container) {
  container.innerHTML = `
    <div class="agri-skeleton-wrap" id="cp-loading">
      <div class="agri-skeleton agri-skeleton-title"></div>
      <div class="agri-skeleton agri-skeleton-line"></div>
      <div class="agri-skeleton agri-skeleton-line short"></div>
      <div class="agri-skeleton agri-skeleton-line"></div>
    </div>`;

  const packs = await api.getCropPacks();
  if (!container.isConnected || !container.querySelector('#cp-loading')) return () => {};
  let activePack = packs[0];

  container.innerHTML = `
    <div class="agri-module cp-root">
      <div class="rf-header">
        <div>
          <div class="agri-module-title">📦 作物包全景与规则注册表</div>
          <div class="agri-module-sub">版本化 Crop Pack 注入作物差异：阶段参数 / 指标定义 / 规则阈值 / 知识文档 / 处方约束（Schema ${escapeHtml(packs[0]?.schemaVersion || '1.0')}）</div>
        </div>
        <div class="rf-header-right">
          <button class="cmd-nav-btn" data-nav="value-ledger">💰 效益对账</button>
          <button class="cmd-nav-btn" data-nav="risk-forecast">🔮 风险预测</button>
          <span class="agri-pill agri-pill-ok">Schema ${escapeHtml(packs[0]?.schemaVersion || '1.0')}</span>
        </div>
      </div>

      <div class="cp-tabs" data-role="cp-tabs">
        ${packs.map(p => `
          <button class="cp-tab ${p.cropCode === activePack.cropCode ? 'active' : ''}" data-crop="${p.cropCode}">
            ${CROP_EMOJI[p.cropCode] || '🌾'} ${escapeHtml(p.identity.name)}
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
      window.location.hash = `view=${btn.dataset.nav}`;
    });
  });

  const renderBody = (pack) => {
    const stageIdx = {};
    pack.stages.forEach((s, i) => { stageIdx[s.code] = i; });
    bodyEl.innerHTML = `
      <!-- 概览：身份与指标定义 -->
      <div class="agri-card cp-identity">
        <div class="agri-card-title">🧬 作物档案与指标定义</div>
        <div class="cp-id-grid">
          <div class="cp-id-item"><span class="agri-kv-key">作物</span><b>${escapeHtml(pack.identity.name)}</b>（${escapeHtml(pack.identity.variety)}）</div>
          <div class="cp-id-item"><span class="agri-kv-key">地区</span>${escapeHtml(pack.identity.region)}</div>
          <div class="cp-id-item"><span class="agri-kv-key">Pack</span><span class="agri-mono">v${escapeHtml(pack.version)}</span></div>
          <div class="cp-id-item"><span class="agri-kv-key">规则版本</span><span class="agri-mono">${escapeHtml(pack.ruleVersion)}</span></div>
          <div class="cp-id-item"><span class="agri-kv-key">知识版本</span><span class="agri-mono">${escapeHtml(pack.knowledgeVersion)}</span></div>
          <div class="cp-id-item"><span class="agri-kv-key">阶段数</span>${pack.stages.length} · 指标 ${pack.metrics.length} 项 · 规则 ${pack.rules.length} 条</div>
        </div>
        <div class="cp-metrics">
          ${pack.metrics.map(m => `
            <div class="cp-metric">
              <div class="cp-metric-head">
                <span class="agri-mono">${m.code}</span>
                <span class="agri-pill ${AV_CLS[m.availability] || 'agri-pill-blue'}">${m.availability}</span>
              </div>
              <div class="cp-metric-name">${escapeHtml(m.label)}（${escapeHtml(m.unit)}）</div>
              <div class="cp-metric-range agri-mono">${m.range.min} ~ ${m.range.max}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 多阶段参数卡片（时间线） -->
      <div class="agri-card">
        <div class="agri-card-title">🌱 生长阶段适宜参数（Crop Pack 注入）</div>
        <div class="cp-stages">
          ${pack.stages.map(s => `
            <div class="cp-stage">
              <div class="cp-stage-head">
                <span class="cp-stage-emoji">${STAGE_EMOJI[s.code] || CROP_EMOJI[pack.cropCode] || '🌾'}</span>
                <div>
                  <div class="cp-stage-name">${escapeHtml(s.label)}</div>
                  <div class="agri-mono cp-stage-code">${s.code} · 第 ${s.sequence} 阶段</div>
                </div>
              </div>
              <div class="cp-stage-targets">
                <div class="cp-target">
                  <span>土壤湿度</span>
                  <b class="agri-mono">${s.target.soilMoistureLow} ~ ${s.target.soilMoistureHigh}%</b>
                </div>
                <div class="cp-target">
                  <span>棚内温度</span>
                  <b class="agri-mono">${s.target.airTemperatureLow} ~ ${s.target.airTemperatureHigh}°C</b>
                </div>
              </div>
              <div class="cp-stage-risk">
                ${s.riskFocus.map(r => `<span class="cp-risk-chip" style="--rc:${RISK_COLOR[r] || '#8b949e'}">${r}</span>`).join('')}
              </div>
              ${s.taskTemplates.map(t => `
                <div class="cp-task-template agri-mono">${t.actionType} · 每 ${t.intervalDays} 天 · ${t.priority}</div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 规则注册表 -->
      <div class="agri-card">
        <div class="agri-card-title">⚖️ 阈值规则注册表</div>
        <table class="vl-provenance-table">
          <thead><tr><th>规则</th><th>指标</th><th>条件</th><th>阈值</th><th>持续(分)</th><th>迟滞</th><th>冷却(分)</th></tr></thead>
          <tbody>
            ${pack.rules.map(r => `
              <tr>
                <td><span class="agri-mono" style="color:${RISK_COLOR[r.code] || '#f0f6fc'}">${r.code}</span></td>
                <td class="agri-mono">${r.metric}</td>
                <td class="agri-mono">${r.operator}</td>
                <td class="agri-mono"><b>${r.threshold}</b></td>
                <td class="agri-mono">${r.durationMinutes}</td>
                <td class="agri-mono">${r.hysteresis}</td>
                <td class="agri-mono">${r.cooldownMinutes}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="rf-meta-grid cp-constraints">
          <div><span class="agri-kv-key">处方时长上限</span><span class="agri-mono">${pack.prescriptionConstraints.maxDurationSeconds}s</span></div>
          <div><span class="agri-kv-key">灌溉冷却</span><span class="agri-mono">${pack.prescriptionConstraints.cooldownMinutes}min</span></div>
          <div><span class="agri-kv-key">日用水上限</span><span class="agri-mono">${pack.prescriptionConstraints.maxDailyWaterLitres}L</span></div>
          <div><span class="agri-kv-key">预测算法</span><span class="agri-mono">${escapeHtml(pack.forecastProfile.algorithm)}</span></div>
          <div><span class="agri-kv-key">预测时距</span><span class="agri-mono">${pack.forecastProfile.horizonsMinutes.join('/')}min</span></div>
          <div><span class="agri-kv-key">阶段敏感度</span><span class="agri-mono">${pack.coordinationProfile.stageSensitivity}</span></div>
        </div>
      </div>

      <!-- 知识文档阅读器 -->
      <div class="agri-card cp-knowledge">
        <div class="agri-card-title">📚 农业知识文档阅读器</div>
        <div class="cp-knowledge-head">
          <span class="agri-mono cp-knowledge-doc">${escapeHtml(pack.knowledge.documents.join(', '))}</span>
          <span class="agri-pill agri-pill-blue">kb-${escapeHtml(pack.knowledgeVersion)}</span>
        </div>
        <div class="cp-md">${renderMarkdown(pack.knowledge.content)}</div>
        <div class="cp-fallback">
          <span class="agri-kv-key">检索回退链</span>
          <span class="agri-mono">${pack.knowledge.fallback.map(f => escapeHtml(f)).join(' → ')}</span>
          <span class="agri-meta-line" style="margin-left:auto">知识不足时按 地块→地区→阶段→作物→通用 逐级回退并标明证据范围</span>
        </div>
      </div>

      <!-- 情景映射与测试用例 -->
      <div class="agri-card">
        <div class="agri-card-title">🧪 情景映射与回归用例</div>
        <div class="cp-scenarios">
          ${Object.entries(pack.scenarios).map(([code, sc]) => `
            <div class="cp-scenario">
              <div class="cp-scenario-name">${escapeHtml(SCENARIO_LABEL[code] || code)} <span class="agri-mono">${code}</span></div>
              <div class="cp-scenario-quality agri-pill ${sc.quality === 'GOOD' ? 'agri-pill-ok' : sc.quality === 'DEGRADED' ? 'agri-pill-warn' : 'agri-pill-danger'}">${sc.quality}</div>
              <div class="cp-scenario-expected agri-mono">${escapeHtml(sc.expected)}</div>
            </div>
          `).join('')}
        </div>
        <div class="agri-meta-line">回归用例：${pack.testCases.map(t => escapeHtml(t)).join(' · ')}</div>
      </div>`;
  };

  tabs.addEventListener('click', (e) => {
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
