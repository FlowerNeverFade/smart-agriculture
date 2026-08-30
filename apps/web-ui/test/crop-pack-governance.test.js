import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('farm Crop Pack UI exposes model, rule, candidate tabs and add tile', () => {
  const source = readFileSync(new URL('../js/modules/admin-work-management.js', import.meta.url), 'utf8');
  assert.match(source, /作物模型/);
  assert.match(source, /告警规则/);
  assert.match(source, /学习候选/);
  assert.match(source, /添加作物/);
  assert.match(source, /createFarmCropPack/);
  assert.match(source, /stagesJson/);
});

test('API client exposes farm-scoped governance endpoints', () => {
  const source = readFileSync(new URL('../js/api.js', import.meta.url), 'utf8');
  for (const method of ['getRuleSets', 'getAlertLearningCases', 'activateStrategyCandidate', 'createFarmCropPack', 'validateFarmCropPack', 'activateFarmCropPack']) {
    assert.match(source, new RegExp(`async ${method}\\b`));
  }
  assert.match(source, /includeDrafts/);
});
