import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('farm Crop Pack UI exposes equal-size add tile and visual wizard', () => {
  const source = readFileSync(new URL('../js/modules/admin-work-management.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../css/modules/admin-management.css', import.meta.url), 'utf8');
  assert.match(source, /作物模型/);
  assert.match(source, /添加作物/);
  assert.match(source, /createFarmCropPack/);
  assert.match(source, /packWizardStep/);
  assert.match(source, /addStage/);
  assert.match(source, /addRule/);
  assert.match(source, /addTaskTemplate/);
  assert.match(source, /addKnowledge/);
  assert.match(source, /admin-pack-menu-trigger/);
  assert.match(source, /openPackEditFromMenu/);
  assert.match(source, /archivePackFromMenu/);
  assert.match(source, /已复制为当前农场草稿/);
  assert.match(source, /全局作物包属于平台共享数据/);
  assert.match(source, /修改作物包/);
  assert.match(source, /删除作物包/);
  assert.doesNotMatch(source, /stagesJson/);
  assert.match(styles, /\.admin-pack-card-grid \{ grid-auto-rows: 320px; \}/);
  assert.match(styles, /\.admin-pack-summary-card \{ height: 100%; min-height: 320px; \}/);
  assert.match(styles, /\.admin-pack-menu \{/);
});

test('farm governance page is a separate rules and strategies entry', () => {
  const source = readFileSync(new URL('../js/modules/admin-rules-strategies.js', import.meta.url), 'utf8');
  assert.match(source, /规则与策略/);
  assert.match(source, /规则集/);
  assert.match(source, /策略候选集/);
  assert.match(source, /批准并启用/);
  assert.match(source, /新增规则/);
  assert.match(source, /createRule/);
  assert.match(source, /水分不足/);
  assert.match(source, /候选方案/);
  assert.doesNotMatch(source, /FARM RULE/);
});

test('only farm administrators receive the rules and strategies route', () => {
  const source = readFileSync(new URL('../js/roles.js', import.meta.url), 'utf8');
  assert.match(source, /'rules-strategies'/);
  assert.match(source, /FARM_ADMIN[\s\S]*rules-strategies/);
  assert.doesNotMatch(source, /FARMER[\s\S]*rules-strategies/);
});

test('API client exposes farm-scoped governance endpoints', () => {
  const source = readFileSync(new URL('../js/api.js', import.meta.url), 'utf8');
  for (const method of ['getRuleSets', 'createFarmRule', 'getAlertLearningCases', 'activateStrategyCandidate', 'createFarmCropPack', 'validateFarmCropPack', 'activateFarmCropPack', 'archiveFarmCropPack']) {
    assert.match(source, new RegExp(`async ${method}\\b`));
  }
  assert.match(source, /includeDrafts/);
});

test('全局壳层不再显示农场标识和返回农户工作台按钮', () => {
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /g-nav-return-farmer/);
  assert.doesNotMatch(source, /返回农户工作台/);
  assert.match(source, /v-if="state\.currentUser\.role !== 'FARM_ADMIN'" class="g-header-center"/);
});
