import test from 'node:test';
import assert from 'node:assert/strict';
import { translateWorkspaceText } from '../js/workspace-i18n.js';

test('translates shared admin copy without changing user data', () => {
  assert.equal(translateWorkspaceText('农场总览'), 'Farm overview');
  assert.equal(translateWorkspaceText('创建农务任务 · plot-a01'), 'Create work order · plot-a01');
  assert.equal(translateWorkspaceText('Farm overview', 'zh-CN'), '农场总览');
  assert.equal(translateWorkspaceText('plot-a01 · 27.4 %'), 'plot-a01 · 27.4 %');
});

test('keeps Chinese as the canonical language', () => {
  assert.equal(translateWorkspaceText('规则与策略', 'zh-CN'), '规则与策略');
  assert.equal(translateWorkspaceText('Rules & strategies', 'zh-CN'), '规则与策略');
});
