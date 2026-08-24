import { MOCK_DATA } from '../mock-data.js';
import { setResourcePlanPreview, syncWaterVisuals } from '../water-visual.js';
import { initFieldSandbox } from '../field-visual.js';

const STATUS_META = {
  OPEN: { label: '待认领', icon: '○', next: 'ASSIGNED', nextLabel: '认领' },
  ASSIGNED: { label: '已认领', icon: '◐', next: 'IN_PROGRESS', nextLabel: '开始执行' },
  IN_PROGRESS: { label: '执行中', icon: '◒', next: 'DONE', nextLabel: '完成工单' },
  DONE: { label: '已完成', icon: '●', next: null, nextLabel: '' }
};

const PRIORITY_META = {
  HIGH: { label: '紧急', rank: 3 },
  MEDIUM: { label: '中', rank: 2 },
  LOW: { label: '普通', rank: 1 }
};

const SOURCE_META = {
  ALERT: '告警触发',
  DIAGNOSIS: '诊断待办',
  CROP_PLAN: '作物计划',
  DEVICE_HEALTH: '设备健康',
  INSPECTION: '巡田补证',
  MANUAL: '人工创建'
};

const ROLE_CAPABILITIES = {
  FARMER: { label: '农户', avatar: '🧑‍🌾', canExecute: false, canDispatch: false },
  FIELD_OPERATOR: { label: '农务执行员', avatar: '👨‍🔧', canExecute: true, canDispatch: true },
  FARM_ADMIN: { label: '农场管理员', avatar: '🧑‍💼', canExecute: true, canDispatch: true },
  SYSTEM_ADMIN: { label: '系统管理员', avatar: '🛡️', canExecute: true, canDispatch: true }
};

function capabilitiesFor(user) {
  return ROLE_CAPABILITIES[user?.role] || ROLE_CAPABILITIES.FARMER;
}

function canExecute(user) {
  return capabilitiesFor(user).canExecute;
}

function canDispatch(user) {
  return capabilitiesFor(user).canDispatch;
}

const farmOpsState = {
  workItems: [],
  inspections: [],
  plotFilter: '',
  priorityFilter: 'ALL',
  resourceResult: null,
  demands: null,
  loading: false
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statusOf(item) {
  const status = String(item.status || 'OPEN').toUpperCase();
  if (status === 'PENDING' || status === 'NEW') return 'OPEN';
  if (status === 'CLAIMED') return 'ASSIGNED';
  if (status === 'COMPLETED' || status === 'CLOSED') return 'DONE';
  return STATUS_META[status] ? status : 'OPEN';
}

function normalizeWorkItem(item) {
  const sourceType = String(item.sourceType || (item.workOrderId ? 'MANUAL' : 'ALERT')).toUpperCase();
  const workOrderId = item.workOrderId || '';
  const workItemId = item.workItemId || workOrderId || item.sourceRef || `wi-${Math.random().toString(36).slice(2, 9)}`;
  return {
    ...item,
    workItemId,
    workOrderId,
    sourceType,
    priority: PRIORITY_META[String(item.priority || '').toUpperCase()] ? String(item.priority).toUpperCase() : 'MEDIUM',
    status: statusOf(item),
    title: item.title || item.name || item.reason || '待处理农务任务',
    reason: item.reason || SOURCE_META[sourceType] || '需要执行人员处理',
    dueAt: item.dueAt || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  };
}

function formatTime(value) {
  if (!value) return '未设置';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return `${sameDay ? '今日 ' : `${date.getMonth() + 1}/${date.getDate()} `}${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

function plotLabel(plots, plotId) {
  return plots.find((plot) => plot.plotId === plotId)?.name || plotId || '未知地块';
}

function notify(context, message, type = 'info') {
  context.showToast?.(message, type);
}

function workCard(item, context) {
  const meta = STATUS_META[item.status];
  const canWrite = canDispatch(context.user);
  return `
    <article class="work-card priority-${item.priority.toLowerCase()}" draggable="${canWrite ? 'true' : 'false'}" data-work-id="${escapeHtml(item.workItemId)}">
      <div class="work-card-topline">
        <span class="source-chip source-${item.sourceType.toLowerCase()}">${escapeHtml(SOURCE_META[item.sourceType] || item.sourceType)}</span>
        <span class="priority-chip priority-${item.priority.toLowerCase()}">${PRIORITY_META[item.priority].label}</span>
      </div>
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.reason)}</p>
      <dl class="work-card-meta">
        <div><dt>地块</dt><dd>${escapeHtml(plotLabel(context.plots, item.plotId))}</dd></div>
        <div><dt>时限</dt><dd>${formatTime(item.dueAt)}</dd></div>
        <div><dt>执行人</dt><dd>${escapeHtml(item.assigneeName || item.assigneeId || '待分配')}</dd></div>
      </dl>
      <div class="work-card-footer">
        <span class="provenance-tag">${escapeHtml(item.provenance || 'DERIVED')}</span>
        <div class="work-card-actions">
          ${canExecute(context.user) ? `<button class="work-inspect-btn" data-inspect-work="${escapeHtml(item.workItemId)}">巡田记录</button>` : ''}
          ${meta.next && canWrite ? `<button class="work-next-btn" data-work-action="${meta.next}" data-work-id="${escapeHtml(item.workItemId)}">${meta.nextLabel} →</button>` : `<span class="work-state-label">${meta.icon} ${meta.label}</span>`}
        </div>
      </div>
    </article>
  `;
}

function filteredItems() {
  return farmOpsState.workItems.filter((item) => {
    const plotMatch = !farmOpsState.plotFilter || item.plotId === farmOpsState.plotFilter;
    const priorityMatch = farmOpsState.priorityFilter === 'ALL' || item.priority === farmOpsState.priorityFilter;
    return plotMatch && priorityMatch;
  });
}

function workBoardTemplate(context) {
  const items = filteredItems();
  const counts = Object.keys(STATUS_META).reduce((result, status) => {
    result[status] = items.filter((item) => item.status === status).length;
    return result;
  }, {});
  const urgentCount = items.filter((item) => item.priority === 'HIGH' && item.status !== 'DONE').length;
  const roleMeta = capabilitiesFor(context.user);
  const timelineItems = [...items]
    .sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0))
    .slice(0, 6);

  return `
    <section class="farm-ops field-ops" data-field-surface aria-label="今日农务与巡田透明农田沙盘">
      <div class="field-sandbox-backdrop" aria-hidden="true">
        <div class="field-map-grid"></div>
        <div class="field-plot field-plot-a"><span>01</span></div>
        <div class="field-plot field-plot-b"><span>02</span></div>
        <div class="field-plot field-plot-c"><span>03</span></div>
        <div class="field-mist field-mist-one"></div>
        <div class="field-mist field-mist-two"></div>
        <div class="field-scanline"></div>
        <div class="field-dew field-dew-a"></div>
        <div class="field-dew field-dew-b"></div>
        <div class="field-dew field-dew-c"></div>
      </div>
      <canvas class="field-effects-canvas" data-field-effects aria-hidden="true"></canvas>

      <header class="farm-ops-hero field-command-hero">
        <div>
          <p class="ops-kicker">FIELD MISSION CONTROL · ${new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</p>
          <h3>今日农务透明农田沙盘</h3>
          <p>计划、告警、诊断与设备任务沿地块生长脉络汇入同一执行队列；移动鼠标唤醒叶脉轨迹，点击任意区域播下一次现场反馈。</p>
        </div>
        <div class="ops-role-card">
          <span>${roleMeta.avatar}</span>
          <div><small>当前身份</small><strong>${escapeHtml(roleMeta.label)}</strong></div>
          <b class="${canDispatch(context.user) ? 'permission-write' : 'permission-read'}">${canDispatch(context.user) ? '可派发·可执行' : '只读视图'}</b>
        </div>
      </header>

      <section class="field-vine-timeline" aria-label="今日农务时间轴">
        <div class="field-timeline-heading">
          <div><span class="ops-kicker">TODAY'S ROUTE</span><h3>今日执行藤蔓</h3></div>
          <span>按截止时间生长 · 点击节点进入巡田记录</span>
        </div>
        <div class="field-timeline-track">
          ${timelineItems.length ? timelineItems.map((item, index) => `
            <button class="field-timeline-node status-${item.status.toLowerCase()} priority-${item.priority.toLowerCase()}" data-timeline-work="${escapeHtml(item.workItemId)}" style="--node-index:${index}">
              <i></i>
              <time>${formatTime(item.dueAt).replace('今日 ', '')}</time>
              <strong>${escapeHtml(plotLabel(context.plots, item.plotId))}</strong>
              <span>${escapeHtml(item.title)}</span>
              <b>${STATUS_META[item.status].label}</b>
            </button>
          `).join('') : '<div class="field-timeline-empty">今日没有符合筛选条件的任务</div>'}
        </div>
      </section>

      <div class="ops-metric-row">
        <article><span>待处理</span><strong>${counts.OPEN + counts.ASSIGNED}</strong><small>包含已认领</small></article>
        <article><span>执行中</span><strong>${counts.IN_PROGRESS}</strong><small>现场作业进行中</small></article>
        <article class="metric-alert"><span>紧急项</span><strong>${urgentCount}</strong><small>按风险与时限排序</small></article>
        <article><span>今日已完成</span><strong>${counts.DONE}</strong><small>可回溯执行证据</small></article>
      </div>

      <div class="ops-toolbar">
        <div class="ops-filter-group">
          <label>地块
            <select id="workPlotFilter">
              <option value="">全部地块</option>
              ${context.plots.map((plot) => `<option value="${escapeHtml(plot.plotId)}" ${farmOpsState.plotFilter === plot.plotId ? 'selected' : ''}>${escapeHtml(plot.name)}</option>`).join('')}
            </select>
          </label>
          <label>优先级
            <select id="workPriorityFilter">
              <option value="ALL">全部</option>
              ${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${farmOpsState.priorityFilter === value ? 'selected' : ''}>${meta.label}</option>`).join('')}
            </select>
          </label>
          <button class="ops-icon-btn" id="refreshWorkOrders" title="刷新今日农务">↻</button>
        </div>
        <div class="ops-action-group">
          <button class="btn btn-secondary" id="openInspectionForm" ${canExecute(context.user) ? '' : 'disabled'}>录入巡田记录</button>
          <button class="btn btn-primary" id="openWorkOrderForm" ${canDispatch(context.user) ? '' : 'disabled'}>+新建工单</button>
        </div>
      </div>

      <div class="work-kanban">
        ${Object.entries(STATUS_META).map(([status, meta]) => {
          const columnItems = items.filter((item) => item.status === status);
          return `
            <section class="kanban-column" data-drop-status="${status}">
              <header><span>${meta.icon} ${meta.label}</span><b>${columnItems.length}</b></header>
              <div class="kanban-stack">
                ${columnItems.length ? columnItems.map((item) => workCard(item, context)).join('') : '<div class="kanban-empty">暂无任务</div>'}
              </div>
            </section>
          `;
        }).join('')}
      </div>

      <section class="inspection-strip">
        <div class="section-title-row">
          <div><span class="ops-kicker">HUMAN EVIDENCE</span><h3>最近巡田核验</h3></div>
          <span class="provenance-tag">USER_PROVIDED 不覆盖遥测</span>
        </div>
        <div class="inspection-list">
          ${farmOpsState.inspections.length ? farmOpsState.inspections.slice(0, 4).map((record) => `
            <article>
              <div><strong>${escapeHtml(plotLabel(context.plots, record.plotId))}</strong><span>${formatTime(record.observedAt)}</span></div>
              <p>${escapeHtml(record.notes || record.observation || '已提交结构化巡田记录')}</p>
              <footer><span>土壤：${escapeHtml(record.soilSurface || '-')}</span><span>作物：${escapeHtml(record.cropCondition || '-')}</span><span>设备：${escapeHtml(record.deviceStatus || '-')}</span></footer>
            </article>
          `).join('') : '<div class="inspection-empty">当前地块尚无巡田证据，可创建第一条结构化核验记录。</div>'}
        </div>
      </section>

      ${workOrderDialog(context)}
      ${inspectionDialog(context)}
    </section>
  `;
}

function workOrderDialog(context) {
  return `
    <dialog class="ops-dialog" id="workOrderDialog">
      <form method="dialog" id="workOrderForm">
        <header><div><span class="ops-kicker">NEW WORK ORDER</span><h3>派发农务工单</h3></div><button type="button" data-close-dialog aria-label="关闭">×</button></header>
        <div class="ops-form-grid">
          <label class="span-2">任务标题<input name="title" required maxlength="80" placeholder="例：核对 1 号棚流量计与阀门"></label>
          <label>地块<select name="plotId" required>${context.plots.map((plot) => `<option value="${escapeHtml(plot.plotId)}">${escapeHtml(plot.name)}</option>`).join('')}</select></label>
          <label>优先级<select name="priority"><option value="HIGH">紧急</option><option value="MEDIUM" selected>中</option><option value="LOW">普通</option></select></label>
          <label>任务类型<select name="actionType"><option value="INSPECTION">巡田核验</option><option value="FIELD_OPERATION">田间作业</option><option value="DEVICE_CHECK">设备检查</option><option value="IRRIGATION_REVIEW">灌溉处方审核</option></select></label>
          <label>截止时间<input name="dueAt" type="datetime-local" required></label>
          <label class="span-2">执行说明<textarea name="reason" rows="3" required placeholder="说明任务来源、验收标准或安全注意事项"></textarea></label>
        </div>
        <footer><button type="button" data-close-dialog class="btn btn-ghost">取消</button><button type="submit" value="default" class="btn btn-primary">创建并进入待认领</button></footer>
      </form>
    </dialog>
  `;
}

function inspectionDialog(context) {
  return `
    <dialog class="ops-dialog inspection-drawer" id="inspectionDialog">
      <form method="dialog" id="inspectionForm">
        <header><div><span class="ops-kicker">FIELD INSPECTION DRAWER</span><h3>录入人工巡田证据</h3><small id="inspectionTaskContext">从今日沙盘创建现场核验</small></div><button type="button" data-close-dialog aria-label="关闭">×</button></header>
        <p class="inspection-guidance">人工观察会以 <strong>USER_PROVIDED</strong> 标签进入证据链，不会覆盖原始传感器遥测。</p>
        <div class="ops-form-grid">
          <label>地块<select name="plotId" required>${context.plots.map((plot) => `<option value="${escapeHtml(plot.plotId)}">${escapeHtml(plot.name)}</option>`).join('')}</select></label>
          <label>观测时间<input name="observedAt" type="datetime-local" required></label>
          <label>土壤表象<select name="soilSurface"><option value="NORMAL">正常</option><option value="DRY">干燥开裂</option><option value="WET">过湿积水</option></select></label>
          <label>作物状态<select name="cropCondition"><option value="NORMAL">长势正常</option><option value="LEAF_SLIGHT_WILT">叶片轻微萎蔫</option><option value="DISEASE_SUSPECTED">疑似病害</option></select></label>
          <label>设备外观<select name="deviceStatus"><option value="NORMAL">完好</option><option value="LOOSE">接头松动</option><option value="LEAKING">管线渗漏</option><option value="OFFLINE">离线/无显示</option></select></label>
          <label>便携仪土壤湿度（%）<input name="portableSoilMoisture" type="number" min="0" max="100" step="0.1" placeholder="可选"></label>
          <label class="span-2">现场说明<textarea name="notes" rows="3" required placeholder="记录叶片、土壤、阀门、流量计等可核验现象"></textarea></label>
          <label class="span-2 photo-field">现场照片预览（本期仅预览，不上传原图）<input name="photo" type="file" accept="image/*"><span id="inspectionPhotoPreview">未选择照片</span></label>
        </div>
        <footer><button type="button" data-close-dialog class="btn btn-ghost">取消</button><button type="submit" value="default" class="btn btn-primary">提交巡田证据</button></footer>
      </form>
    </dialog>
  `;
}

function bindWorkBoard(container, context) {
  container.querySelector('#workPlotFilter')?.addEventListener('change', (event) => {
    farmOpsState.plotFilter = event.target.value;
    paintWorkBoard(container, context);
  });
  container.querySelector('#workPriorityFilter')?.addEventListener('change', (event) => {
    farmOpsState.priorityFilter = event.target.value;
    paintWorkBoard(container, context);
  });
  container.querySelector('#refreshWorkOrders')?.addEventListener('click', () => renderWorkOrders(container, context, true));

  const workDialog = container.querySelector('#workOrderDialog');
  const inspectionDialog = container.querySelector('#inspectionDialog');
  container.querySelector('#openWorkOrderForm')?.addEventListener('click', () => workDialog?.showModal());
  const openInspection = (workItemId = '') => {
    if (!inspectionDialog) return;
    const item = farmOpsState.workItems.find((candidate) => candidate.workItemId === workItemId);
    const contextLabel = inspectionDialog.querySelector('#inspectionTaskContext');
    const plotSelect = inspectionDialog.querySelector('[name="plotId"]');
    const notesInput = inspectionDialog.querySelector('[name="notes"]');
    if (item) {
      plotSelect.value = item.plotId;
      notesInput.placeholder = `核验任务：${item.title}；请记录现场可复核现象`;
      if (contextLabel) contextLabel.textContent = `${plotLabel(context.plots, item.plotId)} · ${item.title}`;
    } else {
      plotSelect.value = context.selectedPlotId || context.plots[0]?.plotId || '';
      notesInput.placeholder = '记录叶片、土壤、阀门、流量计等可核验现象';
      if (contextLabel) contextLabel.textContent = '从今日沙盘创建现场核验';
    }
    inspectionDialog.showModal();
  };
  container.querySelector('#openInspectionForm')?.addEventListener('click', () => openInspection());
  container.querySelectorAll('[data-inspect-work], [data-timeline-work]').forEach((button) => {
    button.addEventListener('click', () => openInspection(button.dataset.inspectWork || button.dataset.timelineWork));
  });
  workDialog?.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => workDialog.close()));
  inspectionDialog?.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => inspectionDialog.close()));

  container.querySelectorAll('.work-next-btn').forEach((button) => {
    button.addEventListener('click', () => transitionWorkItem(container, context, button.dataset.workId, button.dataset.workAction));
  });

  container.querySelectorAll('.work-card[draggable="true"]').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', card.dataset.workId);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  container.querySelectorAll('.kanban-column').forEach((column) => {
    column.addEventListener('dragover', (event) => {
      event.preventDefault();
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', (event) => {
      event.preventDefault();
      column.classList.remove('drag-over');
      transitionWorkItem(container, context, event.dataTransfer.getData('text/plain'), column.dataset.dropStatus);
    });
  });

  const workForm = container.querySelector('#workOrderForm');
  if (workForm) {
    const dueInput = workForm.elements.dueAt;
    const defaultDue = new Date(Date.now() + 2 * 60 * 60 * 1000);
    dueInput.value = new Date(defaultDue.getTime() - defaultDue.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    workForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!workForm.reportValidity()) return;
      const data = Object.fromEntries(new FormData(workForm).entries());
      try {
        const saved = await context.api.saveWorkOrder({
          ...data,
          dueAt: new Date(data.dueAt).toISOString(),
          sourceType: 'MANUAL',
          provenance: 'USER_PROVIDED',
          status: 'OPEN'
        });
        farmOpsState.workItems.unshift(normalizeWorkItem(saved));
        workDialog.close();
        notify(context, '农务工单已创建并进入待认领队列。', 'success');
        paintWorkBoard(container, context);
      } catch (error) {
        notify(context, error.message || '工单创建失败。', 'error');
      }
    });
  }

  const inspectionForm = container.querySelector('#inspectionForm');
  if (inspectionForm) {
    const observedInput = inspectionForm.elements.observedAt;
    const now = new Date();
    observedInput.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    inspectionForm.elements.photo.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      const preview = container.querySelector('#inspectionPhotoPreview');
      if (!file) {
        preview.textContent = '未选择照片';
        preview.style.backgroundImage = '';
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        preview.textContent = file.name;
        preview.style.backgroundImage = `linear-gradient(rgba(13,17,23,.45), rgba(13,17,23,.8)), url("${reader.result}")`;
      });
      reader.readAsDataURL(file);
    });
    inspectionForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!inspectionForm.reportValidity()) return;
      const formData = new FormData(inspectionForm);
      const photo = inspectionForm.elements.photo.files?.[0];
      const portableValue = formData.get('portableSoilMoisture');
      const payload = {
        plotId: formData.get('plotId'),
        observedAt: new Date(formData.get('observedAt')).toISOString(),
        soilSurface: formData.get('soilSurface'),
        cropCondition: formData.get('cropCondition'),
        deviceStatus: formData.get('deviceStatus'),
        portableSoilMoisture: portableValue === '' ? null : Number(portableValue),
        notes: formData.get('notes'),
        photoEvidence: photo ? { fileName: photo.name, previewOnly: true } : null,
        quality: { status: 'GOOD', completeness: portableValue === '' ? 0.9 : 1.0 }
      };
      try {
        const saved = await context.api.createInspection(payload);
        farmOpsState.inspections.unshift(saved);
        inspectionDialog.close();
        notify(context, '巡田记录已作为 USER_PROVIDED 证据入库。', 'success');
        paintWorkBoard(container, context);
      } catch (error) {
        notify(context, error.message || '巡田记录提交失败。', 'error');
      }
    });
  }
}

async function transitionWorkItem(container, context, workItemId, targetStatus) {
  if (!canDispatch(context.user) || !STATUS_META[targetStatus]) return;
  const index = farmOpsState.workItems.findIndex((item) => item.workItemId === workItemId);
  if (index < 0) return;
  const current = farmOpsState.workItems[index];
  if (current.status === targetStatus) return;
  const payload = {
    ...(current.workOrderId ? { workOrderId: current.workOrderId } : {}),
    plotId: current.plotId,
    title: current.title,
    reason: current.reason,
    priority: current.priority,
    sourceType: current.sourceType,
    sourceRef: current.sourceRef || current.workItemId,
    actionType: current.actionType || 'FIELD_OPERATION',
    dueAt: current.dueAt,
    createdAt: current.createdAt,
    assigneeId: current.assigneeId || context.user?.userId,
    assigneeName: current.assigneeName || context.user?.username,
    status: targetStatus,
    ...(targetStatus === 'DONE' ? { completedAt: new Date().toISOString() } : {})
  };
  try {
    const saved = await context.api.saveWorkOrder(payload);
    farmOpsState.workItems[index] = normalizeWorkItem({ ...current, ...saved, status: targetStatus });
    notify(context, `工单已流转为“${STATUS_META[targetStatus].label}”。`, 'success');
    paintWorkBoard(container, context);
  } catch (error) {
    notify(context, error.message || '工单状态流转失败。', 'error');
  }
}

function paintWorkBoard(container, context) {
  container.innerHTML = workBoardTemplate(context);
  bindWorkBoard(container, context);
  initFieldSandbox(container.querySelector('[data-field-surface]'));
}

export async function renderWorkOrders(container, context, forceRefresh = false) {
  if (!container) return;
  container.innerHTML = '<div class="ops-loading"><span></span><p>正在汇总今日农务、巡田证据和执行状态…</p></div>';
  try {
    if (forceRefresh || !farmOpsState.workItems.length) {
      const items = await context.api.getTodayWorkItems();
      farmOpsState.workItems = items.map(normalizeWorkItem).sort((a, b) => PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank);
    }
    const selectedPlot = context.selectedPlotId || context.plots[0]?.plotId;
    farmOpsState.inspections = await context.api.getInspections(selectedPlot);
    paintWorkBoard(container, context);
  } catch (error) {
    container.innerHTML = `<div class="ops-error"><strong>无法加载农务数据</strong><p>${escapeHtml(error.message)}</p><button class="btn btn-secondary" id="retryFarmOps">重试</button></div>`;
    container.querySelector('#retryFarmOps')?.addEventListener('click', () => renderWorkOrders(container, context, true));
  }
}

function ensureDemands(plots) {
  if (farmOpsState.demands) return;
  const defaults = [420, 320, 260];
  farmOpsState.demands = plots.map((plot, index) => ({
    plotId: plot.plotId,
    requestedLitres: defaults[index] || 180,
    priority: plot.riskLevel === 'HIGH' ? 'HIGH' : plot.riskLevel === 'MEDIUM' ? 'MEDIUM' : 'LOW'
  }));
}

function resourceTemplate(context) {
  ensureDemands(context.plots);
  const profile = MOCK_DATA.resourceProfile;
  const result = farmOpsState.resourceResult;
  const totalRequested = farmOpsState.demands.reduce((sum, demand) => sum + Number(demand.requestedLitres || 0), 0);
  const planCapacity = result?.constraints?.waterCapacityLitres || profile.capacityLitres;
  const overCapacity = Math.max(0, totalRequested - planCapacity);
  const canEvaluate = canDispatch(context.user);
  const allocations = result?.allocations || [];
  const allocatedTotal = allocations.reduce((sum, item) => sum + Number(item.allocatedLitres || 0), 0);
  const projectedRemaining = Math.max(0, profile.remainingLitres - allocatedTotal);
  const projectedPercent = Math.round(projectedRemaining / profile.dailyLimitLitres * 1000) / 10;

  return `
    <section class="farm-ops resource-ops" data-water-surface aria-label="水资源协同排程">
      <div class="resource-water-backdrop" aria-hidden="true">
        <canvas class="resource-water-shader" data-water-shader></canvas>
      </div>
      <canvas class="resource-window-effects-canvas" data-water-surface-canvas aria-hidden="true"></canvas>
      <header class="farm-ops-hero resource-hero">
        <div>
          <p class="ops-kicker">CAPACITY-AWARE SCHEDULING</p>
          <h3>多地块水资源协同排程</h3>
          <p>在固定可用水量与 18 L/min 管网流量下按风险优先级分配，不超容量、不隐藏未满足需求。</p>
        </div>
        <div class="resource-state ${result?.status === 'INFEASIBLE' || overCapacity > 0 ? 'state-conflict' : 'state-feasible'}">
          <small>当前计划状态</small>
          <strong>${result?.status || (overCapacity > 0 ? '待重排' : '可行')}</strong>
          <span>${result?.algorithmVersion || 'capacity-priority-v1'}</span>
        </div>
      </header>

      <div class="resource-grid">
        <article class="resource-balance-panel">
          <div class="resource-balance-heading">
            <span class="water-source-tag" data-water-source>SIMULATED</span>
            <small>WATER BALANCE</small>
            <h3>集中蓄水池余量</h3>
          </div>
          <div class="resource-balance-visual" aria-label="集中蓄水池实时水位">
            <div class="backdrop-water-sphere">
              <div class="backdrop-water-volume"><span></span><i></i></div>
              <div class="backdrop-water-rim"></div>
              <div class="backdrop-water-spray">
                <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
              </div>
            </div>
            <div class="resource-balance-visual-copy">
              <span>实时水位</span>
              <strong data-water-percent>${Math.round(profile.remainingLitres / profile.dailyLimitLitres * 1000) / 10}%</strong>
              <small>动态资源位 · SIMULATED</small>
            </div>
          </div>
          <div class="resource-balance-reading">
            <strong data-water-remaining>${profile.remainingLitres.toLocaleString()} L</strong>
            <span><b data-water-percent>${Math.round(profile.remainingLitres / profile.dailyLimitLitres * 1000) / 10}%</b> / 总配额 <b data-water-limit>${profile.dailyLimitLitres.toLocaleString()} L</b></span>
          </div>
          <div class="resource-balance-level"><i></i><span>当前水位约 ${Math.round(profile.remainingLitres / profile.dailyLimitLitres * 100)}%</span></div>
          <div class="resource-preview-reading ${result ? 'active' : ''}">
            <span>排程试算后</span>
            <strong data-water-preview>试算后 ${projectedRemaining.toLocaleString()} L</strong>
            <small>${result ? `预计剩余 ${projectedPercent}% · 不回写实际水位` : '尚未生成排程试算'}</small>
          </div>
          <dl class="resource-facts">
            <div><dt>本轮可调度容量</dt><dd>${planCapacity} L</dd></div>
            <div><dt>管网最大流量</dt><dd>${profile.flowRateLitresPerMinute} L/min</dd></div>
            <div><dt>本轮试算分配</dt><dd>${allocatedTotal.toLocaleString()} L</dd></div>
          </dl>
        </article>

        <article class="demand-panel">
          <div class="section-title-row"><div><span class="ops-kicker">DEMAND INPUT</span><h3>本轮地块需水</h3></div><span class="capacity-counter ${overCapacity > 0 ? 'over' : ''}">${totalRequested} / ${planCapacity} L</span></div>
          <div class="demand-list">
            ${farmOpsState.demands.map((demand) => {
              const plot = context.plots.find((item) => item.plotId === demand.plotId);
              const priorityClass = String(demand.priority || 'MEDIUM').toLowerCase();
              const riskClass = String(plot?.riskLevel || 'LOW').toLowerCase();
              return `
                <div class="demand-row priority-${priorityClass}" data-demand-plot="${escapeHtml(demand.plotId)}">
                  <div><strong>${escapeHtml(plot?.name || demand.plotId)}</strong><span>${escapeHtml(plot?.cropName || '')} · <b class="risk-label risk-${riskClass}">风险 ${escapeHtml(plot?.riskLevel || 'LOW')}</b></span></div>
                  <label><input type="number" min="0" max="2000" step="10" value="${demand.requestedLitres}" data-demand-value="${escapeHtml(demand.plotId)}"><span>L</span></label>
                  <select class="priority-select priority-${priorityClass}" data-demand-priority="${escapeHtml(demand.plotId)}"><option value="HIGH" ${demand.priority === 'HIGH' ? 'selected' : ''}>紧急</option><option value="MEDIUM" ${demand.priority === 'MEDIUM' ? 'selected' : ''}>中</option><option value="LOW" ${demand.priority === 'LOW' ? 'selected' : ''}>普通</option></select>
                </div>
              `;
            }).join('')}
          </div>
          <div class="capacity-summary">
            <span>请求总量 ${totalRequested} L</span>
            <span class="${overCapacity > 0 ? 'danger-text' : 'success-text'}">${overCapacity > 0 ? `超出 ${overCapacity} L，需按优先级裁剪` : `剩余 ${planCapacity - totalRequested} L`}</span>
          </div>
          <button class="btn btn-primary evaluate-resource-btn" id="evaluateResourcePlan" ${canEvaluate ? '' : 'disabled'}>${result ? '重新计算分配方案' : '评估容量与生成排程'}</button>
        </article>
      </div>

      <section class="allocation-panel">
        <div class="section-title-row"><div><span class="ops-kicker">ALLOCATION MAP</span><h3>管网分配热力图</h3></div><span class="provenance-tag">SIMULATED · ${escapeHtml(result?.resourcePlanId || '尚未评估')}</span></div>
        <div class="allocation-network">
          <div class="network-source"><span>💧</span><strong>集中蓄水池</strong><small>${planCapacity} L / 18 L·min⁻¹</small></div>
          <div class="network-trunk"></div>
          <div class="allocation-lanes">
            ${context.plots.map((plot) => {
              const demand = farmOpsState.demands.find((item) => item.plotId === plot.plotId);
              const allocation = allocations.find((item) => item.plotId === plot.plotId);
              const allocated = allocation ? allocation.allocatedLitres : 0;
              const requested = allocation ? allocation.requestedLitres : demand.requestedLitres;
              const ratio = result ? Math.round((requested ? allocated / requested : 0) * 100) : 0;
              return `
                <article class="allocation-lane priority-${String(demand.priority || 'MEDIUM').toLowerCase()} ${allocation?.status === 'PARTIAL' ? 'partial' : ''}">
                  <div class="pipe-line"><i style="--allocation:${ratio}%"></i></div>
                  <header><span>${escapeHtml(plot.name)}</span><b>${result ? `${allocated}/${requested} L` : `${requested} L 待分配`}</b></header>
                  <div class="allocation-heat"><span style="width:${ratio}%"></span></div>
                  <footer><span class="allocation-priority priority-${String(demand.priority || 'MEDIUM').toLowerCase()}">优先级 ${demand.priority}</span><strong>${result ? (allocation?.status || 'UNMET') : '待计算'}</strong></footer>
                </article>
              `;
            }).join('')}
          </div>
        </div>
        ${result?.unmetDemands?.length ? `<div class="resource-conflict-box"><strong>⚠ 未满足需求</strong>${result.unmetDemands.map((item) => `<span>${escapeHtml(plotLabel(context.plots, item.plotId))}：缺口 ${item.unmetLitres} L（${escapeHtml(item.reason)}）</span>`).join('')}</div>` : ''}
      </section>

      <section class="execution-status-panel">
        <div class="section-title-row"><div><span class="ops-kicker">EXECUTION STATUS</span><h3>关联农务执行状态</h3></div><a href="#view=work-orders">返回工单看板 →</a></div>
        <div class="execution-status-list">
          ${(farmOpsState.workItems.length ? farmOpsState.workItems : MOCK_DATA.workOrders).slice(0, 5).map((item) => {
            const normalized = normalizeWorkItem(item);
            return `<div><span class="status-dot status-${normalized.status.toLowerCase()}"></span><strong>${escapeHtml(normalized.title)}</strong><small>${escapeHtml(plotLabel(context.plots, normalized.plotId))}</small><b>${STATUS_META[normalized.status].label}</b></div>`;
          }).join('')}
        </div>
      </section>
    </section>
  `;
}

function bindResourceView(container, context) {
  container.querySelectorAll('[data-demand-value]').forEach((input) => {
    input.addEventListener('input', () => {
      const demand = farmOpsState.demands.find((item) => item.plotId === input.dataset.demandValue);
      if (demand) demand.requestedLitres = Math.max(0, Number(input.value || 0));
      farmOpsState.resourceResult = null;
      const capacity = MOCK_DATA.resourceProfile.capacityLitres;
      const total = farmOpsState.demands.reduce((sum, item) => sum + Number(item.requestedLitres || 0), 0);
      const overCapacity = Math.max(0, total - capacity);
      const counter = container.querySelector('.capacity-counter');
      const summary = container.querySelector('.capacity-summary');
      const evaluateButton = container.querySelector('#evaluateResourcePlan');
      if (counter) {
        counter.textContent = `${total} / ${capacity} L`;
        counter.classList.toggle('over', overCapacity > 0);
      }
      if (summary) {
        summary.innerHTML = `<span>请求总量 ${total} L</span><span class="${overCapacity > 0 ? 'danger-text' : 'success-text'}">${overCapacity > 0 ? `超出 ${overCapacity} L，需按优先级裁剪` : `剩余 ${capacity - total} L`}</span>`;
      }
      if (evaluateButton) evaluateButton.textContent = '评估容量与生成排程';
      setResourcePlanPreview(null);
    });
    input.addEventListener('change', () => paintResourceView(container, context));
  });
  container.querySelectorAll('[data-demand-priority]').forEach((select) => {
    select.addEventListener('change', () => {
      const demand = farmOpsState.demands.find((item) => item.plotId === select.dataset.demandPriority);
      if (demand) demand.priority = select.value;
      farmOpsState.resourceResult = null;
      setResourcePlanPreview(null);
      paintResourceView(container, context);
    });
  });
  container.querySelector('#evaluateResourcePlan')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = '正在进行容量约束评估…';
    try {
      farmOpsState.resourceResult = await context.api.evaluateResourcePlan({ scope: 'farm-demo', demands: farmOpsState.demands });
      setResourcePlanPreview(farmOpsState.resourceResult);
      notify(context, farmOpsState.resourceResult.status === 'FEASIBLE' ? '资源排程已生成，所有需求均在容量内。' : '已生成受约束方案，未满足需求已明确标记。', farmOpsState.resourceResult.status === 'FEASIBLE' ? 'success' : 'info');
      paintResourceView(container, context);
    } catch (error) {
      notify(context, error.message || '水资源方案评估失败。', 'error');
      paintResourceView(container, context);
    }
  });
}

function paintResourceView(container, context) {
  container.innerHTML = resourceTemplate(context);
  bindResourceView(container, context);
  syncWaterVisuals(container);
}

export async function renderResourceCoordination(container, context) {
  if (!container) return;
  container.innerHTML = '<div class="ops-loading"><span></span><p>正在加载地块需水、管网容量和执行队列…</p></div>';
  try {
    if (!farmOpsState.workItems.length) {
      const items = await context.api.getTodayWorkItems();
      farmOpsState.workItems = items.map(normalizeWorkItem);
    }
  } catch (_error) {
    farmOpsState.workItems = MOCK_DATA.workOrders.map(normalizeWorkItem);
  }
  paintResourceView(container, context);
}
