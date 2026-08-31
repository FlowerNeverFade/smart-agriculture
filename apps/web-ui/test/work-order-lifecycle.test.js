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
  isReworkOrder,
  overdueRecoveryDueAt,
  workOrderLane
} = await import('../js/work-order-lifecycle.js');

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

test('逾期页提供全选、一键重新分配、一键处置和单任务人员处置', () => {
  assert.match(WorkOrderLifecycleView.template, /逾期任务处置/);
  assert.match(WorkOrderLifecycleView.template, /全选当前任务/);
  assert.match(WorkOrderLifecycleView.template, /一键重新分配/);
  assert.match(WorkOrderLifecycleView.template, /一键处置/);
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

test('农务任务与主应用复用同一 API 数据实例并定时刷新逾期分区', () => {
  const lifecycleSource = readFileSync(new URL('../js/work-order-lifecycle.js', import.meta.url), 'utf8');
  const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const managementSource = readFileSync(new URL('../js/modules/admin-work-management.js', import.meta.url), 'utf8');
  assert.match(lifecycleSource, /from '\.\/api\.js\?v=20260831-rules-ai-v1'/);
  assert.match(appSource, /from '\.\/api\.js\?v=20260831-crop-menu-v2'/);
  assert.match(managementSource, /from '\.\.\/api\.js\?v=20260831-crop-menu-v2'/);
  assert.match(lifecycleSource, /setInterval\(\(\) => \{ lifecycleNow\.value = Date\.now\(\); \}, 30000\)/);
});
