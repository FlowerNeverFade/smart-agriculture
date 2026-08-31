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
  assert.doesNotMatch(source, /stagesJson/);
  assert.match(styles, /\.admin-pack-card-grid \{ grid-auto-rows: 320px; \}/);
  assert.match(styles, /\.admin-pack-summary-card \{ height: 100%; min-height: 320px; \}/);
});

test('farm governance page is a separate rules and strategies entry', () => {
  const source = readFileSync(new URL('../js/modules/admin-rules-strategies.js', import.meta.url), 'utf8');
  assert.match(source, /规则与策略/);
  assert.match(source, /规则集/);
  assert.match(source, /策略候选集/);
  assert.match(source, /批准并启用/);
});

test('only farm administrators receive the rules and strategies route', () => {
  const source = readFileSync(new URL('../js/roles.js', import.meta.url), 'utf8');
  assert.match(source, /'rules-strategies'/);
  assert.match(source, /FARM_ADMIN[\s\S]*rules-strategies/);
  assert.doesNotMatch(source, /FARMER[\s\S]*rules-strategies/);
});

test('API client exposes farm-scoped governance endpoints', () => {
  const source = readFileSync(new URL('../js/api.js', import.meta.url), 'utf8');
  for (const method of ['getRuleSets', 'getAlertLearningCases', 'activateStrategyCandidate', 'createFarmCropPack', 'validateFarmCropPack', 'activateFarmCropPack']) {
    assert.match(source, new RegExp(`async ${method}\\b`));
  }
  assert.match(source, /includeDrafts/);
});
