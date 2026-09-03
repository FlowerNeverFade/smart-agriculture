import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.Vue = {
  ref: value => ({ value }),
  computed: getter => ({ get value() { return getter(); } }),
  inject: () => () => {},
  watch: () => {},
  nextTick: async () => {},
  onUnmounted: () => {}
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const {
  WorkOrderLifecycleView,
  chooseWorkOrderAssignee,
  finalizedWorkOrderAssignment,
  isAlertVerificationOrder,
  isFarmerIssueReport,
  isReworkOrder,
  overdueRecoveryDueAt,
  workOrderDisplayText,
  workOrderLane
} = await import('../js/work-order-lifecycle.js');

const lifecycleSource = readFileSync(new URL('../js/work-order-lifecycle.js', import.meta.url), 'utf8');
const lifecycleCss = readFileSync(new URL('../css/modules/work-order-lifecycle.css', import.meta.url), 'utf8');
const managementSource = readFileSync(new URL('../js/modules/admin-work-management.js', import.meta.url), 'utf8');
const decisionSource = readFileSync(new URL('../js/modules/admin-decision.js', import.meta.url), 'utf8');

const future = '2026-08-28T08:00:00.000Z';
const past = '2026-08-26T08:00:00.000Z';
const now = Date.parse('2026-08-27T08:00:00.000Z');

test('任务只进入一个与五段导航一致的分区，逾期优先', () => {
  assert.equal(workOrderLane({ status: 'OPEN', dueAt: future }, now), 'OPEN');
  assert.equal(workOrderLane({ status: 'ASSIGNED', dueAt: future }, now), 'IN_PROGRESS');
  assert.equal(workOrderLane({ status: 'REJECTED', dueAt: future }, now), 'IN_PROGRESS');
  assert.equal(workOrderLane({ status: 'SUBMITTED', dueAt: future }, now), 'SUBMITTED');
  assert.equal(workOrderLane({ status: 'SUBMITTED', dueAt: past }, now), 'SUBMITTED');
  assert.equal(workOrderLane({ status: 'DONE', dueAt: past }, now), 'DONE');
  assert.equal(workOrderLane({ status: 'IN_PROGRESS', dueAt: past }, now), 'OVERDUE');
  assert.equal(workOrderLane({ status: 'OPEN', dueAt: past }, now), 'OVERDUE');
});

test('返工任务依靠卡片标记识别，不需要独立导航', () => {
  assert.equal(isReworkOrder({ status: 'REJECTED' }), true);
  assert.equal(isReworkOrder({ status: 'IN_PROGRESS', history: [{ action: 'REJECT' }] }), true);
  assert.equal(isReworkOrder({ status: 'IN_PROGRESS', history: [{ action: 'START' }] }), false);

  const options = [...WorkOrderLifecycleView.template.matchAll(/<option value="([A-Z_]*)">([^<]+)<\/option>/g)]
    .slice(0, 5)
    .map((match) => [match[1], match[2]]);
  assert.deepEqual(options, [
    ['IN_PROGRESS', '进行中'],
    ['OPEN', '待分配'],
    ['SUBMITTED', '待验收'],
    ['OVERDUE', '已逾期'],
    ['DONE', '已完成']
  ]);
  assert.doesNotMatch(WorkOrderLifecycleView.template, /未结束|执行与返工|<option value="REJECTED">/);
  assert.match(WorkOrderLifecycleView.template, /返工任务/);
});

test('逾期一键重新分配优先选择其他有权限且负载更低的在岗农户', () => {
  const order = { workOrderId: 'wo-overdue', farmId: 'farm-demo', plotId: 'plot-a01', assigneeId: 'farmer-old', status: 'IN_PROGRESS' };
  const members = [
    { userId: 'farmer-old', displayName: '原负责人', role: 'FARMER', status: 'ACTIVE', farmIds: ['farm-demo'], plotIds: ['plot-a01'] },
    { userId: 'farmer-busy', displayName: '忙碌农户', role: 'FARMER', status: 'ACTIVE', farmIds: ['farm-demo'], plotIds: ['plot-a01'] },
    { userId: 'farmer-free', displayName: '空闲农户', role: 'FARMER', status: 'ACTIVE', farmIds: ['farm-demo'], plotIds: ['plot-a01'] },
    { userId: 'wrong-plot', displayName: '无权人员', role: 'FARMER', status: 'ACTIVE', farmIds: ['farm-demo'], plotIds: ['plot-b01'] }
  ];
  const workOrders = [
    order,
    { workOrderId: 'wo-busy-1', plotId: 'plot-a01', assigneeId: 'farmer-busy', status: 'ASSIGNED' },
    { workOrderId: 'wo-busy-2', plotId: 'plot-a01', assigneeId: 'farmer-busy', status: 'IN_PROGRESS' },
    { workOrderId: 'wo-free-done', plotId: 'plot-a01', assigneeId: 'farmer-free', status: 'DONE' }
  ];

  const choice = chooseWorkOrderAssignee(members, workOrders, order, 'farm-demo');
  assert.equal(choice.member.userId, 'farmer-free');
  assert.equal(choice.activeLoad, 0);
});

test('逾期一键重新分配强制排除原负责人，没有替代人选时不回退原负责人', () => {
  const order = { workOrderId: 'wo-overdue', farmId: 'farm-demo', plotId: 'plot-a01', assigneeId: 'farmer-old', status: 'IN_PROGRESS' };
  const members = [
    { userId: 'farmer-old', displayName: '原负责人', role: 'FARMER', status: 'ACTIVE', farmIds: ['farm-demo'], plotIds: ['plot-a01'] },
    { userId: 'farmer-new', displayName: '接手农户', role: 'FARMER', status: 'ACTIVE', farmIds: ['farm-demo'], plotIds: ['plot-a01'] }
  ];

  const choice = chooseWorkOrderAssignee(members, [order], order, 'farm-demo', true);
  assert.equal(choice.member.userId, 'farmer-new');
  assert.notEqual(choice.member.userId, order.assigneeId);
  assert.equal(chooseWorkOrderAssignee(members.slice(0, 1), [order], order, 'farm-demo', true), null);
  assert.match(WorkOrderLifecycleView.template, /将逾期任务转交给其他合适农户/);
});

test('分配接口缺少字段时仍立即补齐进行中任务的负责人和状态', () => {
  const saved = finalizedWorkOrderAssignment(
    { workOrderId: 'wo-1', workItemId: 'wo-1', status: 'OPEN' },
    { workItemId: 'wo-1' },
    { userId: 'farmer-1', displayName: '张明' }
  );
  assert.equal(saved.status, 'ASSIGNED');
  assert.equal(saved.assigneeId, 'farmer-1');
  assert.equal(saved.assigneeName, '张明');
  assert.equal(workOrderLane({ ...saved, dueAt: future }, now), 'IN_PROGRESS');

  const openResponse = finalizedWorkOrderAssignment(
    { workOrderId: 'wo-2', status: 'OVERDUE' },
    { workOrderId: 'wo-2', status: 'OPEN' },
    { userId: 'farmer-2', displayName: '赵霞' },
    future
  );
  assert.equal(openResponse.status, 'ASSIGNED');
  assert.equal(workOrderLane(openResponse, now), 'IN_PROGRESS');
});

test('逾期处置生成未来时限并使任务离开逾期分区', () => {
  const renewedDueAt = overdueRecoveryDueAt({ priority: 'HIGH' }, now);
  assert.equal(renewedDueAt, '2026-08-27T12:00:00.000Z');
  const saved = finalizedWorkOrderAssignment(
    { workOrderId: 'wo-overdue', status: 'IN_PROGRESS', dueAt: past },
    { status: 'ASSIGNED' },
    { userId: 'farmer-2', displayName: '赵霞' },
    renewedDueAt
  );
  assert.equal(saved.dueAt, renewedDueAt);
  assert.equal(workOrderLane(saved, now), 'IN_PROGRESS');
});

test('逾期页提供全选、一键重新分配和单任务人员处置', () => {
  assert.match(WorkOrderLifecycleView.template, /逾期任务处置/);
  assert.match(WorkOrderLifecycleView.template, /全选当前任务/);
  assert.match(WorkOrderLifecycleView.template, /一键重新分配/);
  assert.doesNotMatch(WorkOrderLifecycleView.template, /一键处置/);
  assert.match(WorkOrderLifecycleView.template, /选择人员处置/);
});

test('待分配任务提供 AI 一键分配入口', () => {
  assert.match(WorkOrderLifecycleView.template, /待分配任务智能分配/);
  assert.match(WorkOrderLifecycleView.template, /AI一键分配任务/);
  assert.match(WorkOrderLifecycleView.template, /autoAssignUnassigned/);
});

test('告警核查任务验收时提供唯一核查结论并自动处理', () => {
  assert.equal(isAlertVerificationOrder({ taskPurpose: 'ALERT_VERIFICATION' }), true);
  assert.equal(isAlertVerificationOrder({ actionType: 'INSPECTION' }), false);
  assert.match(WorkOrderLifecycleView.template, /确认异常，自动下发处置任务/);
  assert.match(WorkOrderLifecycleView.template, /现场正常，自动关闭原告警/);
  assert.match(WorkOrderLifecycleView.template, /确认结果并自动处理/);
  assert.match(WorkOrderLifecycleView.template, /不再进入人工告警审核/);
});

test('农户问题上报作为管理员可识别的关联工单展示', () => {
  assert.equal(isFarmerIssueReport({ sourceType: 'FARMER_REPORT' }), true);
  assert.equal(isFarmerIssueReport({ sourceType: 'MANUAL' }), false);
  assert.match(WorkOrderLifecycleView.template, /农户问题/);
  assert.match(WorkOrderLifecycleView.template, /农户具体描述/);
  assert.match(WorkOrderLifecycleView.template, /issueDescription/);
});

test('历史任务枚举在卡片、详情和操作记录中统一显示中文', () => {
  assert.equal(
    workOrderDisplayText('任务异常：决策补充检查：MORE_DIAGNOSIS_EVIDENCE'),
    '任务异常：决策补充检查：补充诊断证据'
  );
  assert.equal(
    workOrderDisplayText('农户上报：当前就绪状态为 HUMAN_REVIEW'),
    '农户上报：当前就绪状态为等待人工复核'
  );
  assert.match(WorkOrderLifecycleView.template, /workOrderDisplayText\(activeOrder\.title/);
  assert.match(WorkOrderLifecycleView.template, /workOrderDisplayText\(activeOrder\.reason/);
  assert.match(WorkOrderLifecycleView.template, /workOrderDisplayText\(entry\.note\)/);
});

test('新建决策补证任务使用共享中文证据和就绪状态文案', () => {
  assert.match(decisionSource, /decisionEvidenceLabel\(item/);
  assert.match(decisionSource, /reason: `当前就绪状态：\$\{decisionReadinessLabel\(readiness\.value\.status\)\}`/);
  assert.doesNotMatch(decisionSource, /当前就绪状态为 \$\{readiness\.value\.status\}/);
});

test('管理员任务页独立展示补证申请并支持巡田记录展开全部', () => {
  assert.match(WorkOrderLifecycleView.template, /补证申请/);
  assert.match(WorkOrderLifecycleView.template, /独立于任务状态筛选/);
  assert.match(WorkOrderLifecycleView.template, /进入分配/);
  assert.match(WorkOrderLifecycleView.template, /evidenceRequests/);
  assert.match(WorkOrderLifecycleView.template, /默认展示最新 8 条/);
  assert.match(WorkOrderLifecycleView.template, /showAllInspections/);
  assert.match(WorkOrderLifecycleView.template, /查看全部/);
  assert.match(WorkOrderLifecycleView.template, /inspectionLoadError/);
});

test('巡田记录卡片可通过鼠标和键盘打开中文详情', () => {
  assert.match(WorkOrderLifecycleView.template, /class="inspection-record-card" role="button" tabindex="0"/);
  assert.match(WorkOrderLifecycleView.template, /@click="openInspectionDetail\(record, \$event\)"/);
  assert.match(WorkOrderLifecycleView.template, /@keydown="openInspectionDetailFromKeyboard\(\$event, record\)"/);
  assert.match(lifecycleSource, /if \(!\['Enter', ' '\]\.includes\(event\.key\)\) return/);
  assert.match(WorkOrderLifecycleView.template, /showInspectionDetailModal && activeInspection/);
  assert.match(WorkOrderLifecycleView.template, /aria-labelledby="inspection-detail-title"/);
  assert.match(WorkOrderLifecycleView.template, /现场观察/);
  assert.match(WorkOrderLifecycleView.template, /现场照片/);
  assert.match(WorkOrderLifecycleView.template, /证据质量/);
  assert.match(lifecycleCss, /\.inspection-record-card:focus-visible/);
  assert.match(lifecycleCss, /\.inspection-detail-dialog/);
  assert.match(WorkOrderLifecycleView.template, /人工巡田证据/);
  assert.doesNotMatch(WorkOrderLifecycleView.template, /HUMAN EVIDENCE|READINESS REQUESTS|WORK ORDERS/);
});

test('农场管理员任务中心使用三个计数页签且以任务列表为默认区域', () => {
  assert.match(managementSource, />任务中心<\/button>/);
  assert.match(lifecycleSource, /const activeManagerSection = ref\('tasks'\)/);
  assert.match(WorkOrderLifecycleView.template, /v-if="isEmbeddedManager" class="work-manager-section-tabs" role="tablist"/);
  assert.match(WorkOrderLifecycleView.template, /<span>任务列表<\/span><strong>\{\{ scopedOrders\.length \}\}<\/strong>/);
  assert.match(WorkOrderLifecycleView.template, /<span>补证申请<\/span><strong>\{\{ evidenceRequests\.length \}\}<\/strong>/);
  assert.match(WorkOrderLifecycleView.template, /<span>巡田记录<\/span><strong>\{\{ inspections\.length \}\}<\/strong>/);
  assert.match(WorkOrderLifecycleView.template, /v-show="!isEmbeddedManager \|\| activeManagerSection === 'tasks'"/);
  assert.match(WorkOrderLifecycleView.template, /v-show="!isEmbeddedManager \|\| activeManagerSection === 'evidence'"/);
  assert.match(WorkOrderLifecycleView.template, /v-show="!isEmbeddedManager \|\| activeManagerSection === 'inspections'"/);
});

test('任务中心页签支持键盘访问并在任务深链进入时回到任务列表', () => {
  assert.match(WorkOrderLifecycleView.template, /role="tab" aria-controls="manager-section-panel-tasks"/);
  assert.match(WorkOrderLifecycleView.template, /:aria-selected="activeManagerSection === 'evidence'"/);
  assert.match(lifecycleSource, /event\.key === 'ArrowRight'/);
  assert.match(lifecycleSource, /event\.key === 'ArrowLeft'/);
  assert.match(lifecycleSource, /event\.key === 'Home'/);
  assert.match(lifecycleSource, /event\.key === 'End'/);
  assert.match(lifecycleSource, /params\?\.scope \|\| params\?\.status \|\| params\?\.assigneeId \|\| params\?\.highlight \|\| params\?\.openCreateTask/);
  assert.match(lifecycleSource, /activeManagerSection\.value = 'tasks'/);
});

test('农场管理员三个区域使用视口自适应固定窗口和独立滚动', () => {
  assert.match(WorkOrderLifecycleView.template, /任务列表滚动区域/);
  assert.match(WorkOrderLifecycleView.template, /补证申请滚动区域/);
  assert.match(WorkOrderLifecycleView.template, /巡田记录滚动区域/);
  assert.match(lifecycleCss, /\.work-lifecycle\.is-embedded-manager \.work-section-panel \{[\s\S]*height: clamp\(620px, calc\(100dvh - 190px\), 900px\)/);
  assert.match(lifecycleCss, /\.work-lifecycle\.is-embedded-manager \.work-section-panel > :not\(\.work-section-scroll\) \{[\s\S]*flex: 0 0 auto/);
  assert.match(lifecycleCss, /\.work-lifecycle\.is-embedded-manager \.work-section-scroll \{[\s\S]*overflow-y: auto/);
  assert.match(lifecycleCss, /flex: 1 1 0/);
  assert.match(lifecycleCss, /@media \(max-width: 700px\) \{[\s\S]*height: clamp\(520px, 72dvh, 680px\)/);
  assert.match(lifecycleCss, /overscroll-behavior: contain/);
  assert.match(lifecycleCss, /scrollbar-gutter: stable/);
});

test('农务任务与主应用复用同一 API 数据实例并定时刷新逾期分区', () => {
  const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(lifecycleSource, /from '\.\/api\.js\?v=20260902-manager-plot-order-v1'/);
  assert.match(lifecycleSource, /from '\.\/live-data\.js\?v=20260903-v5923-work-order-zhcn-v1'/);
  assert.match(appSource, /from '\.\/api\.js\?v=20260902-manager-plot-order-v1'/);
  assert.match(managementSource, /from '\.\.\/api\.js\?v=20260902-manager-plot-order-v1'/);
  assert.match(lifecycleSource, /setInterval\(\(\) => \{ lifecycleNow\.value = Date\.now\(\); \}, 30000\)/);
});

test('成员查看任务会进入农户筛选并保留全部状态上下文', () => {
  const memberSource = readFileSync(new URL('../js/modules/admin-member-management.js', import.meta.url), 'utf8');
  assert.match(memberSource, /tab: 'tasks', assigneeId: member\.userId, farmId: farmId\.value/);
  assert.match(lifecycleSource, /const requestedAssignee = String\(params\?\.assigneeId \|\| ''\)\.trim\(\)/);
  assert.match(lifecycleSource, /routeStatus === 'ALL'/);
  assert.match(lifecycleSource, /statusFilter\.value = ''/);
  assert.match(lifecycleSource, /@change="onAssigneeSelect"/);
  assert.match(lifecycleSource, /assigneeId: assigneeFilter\.value/);
});
