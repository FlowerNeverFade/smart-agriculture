import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ApiError } from '../js/api.js?chinese-interface-test';
import {
  deviceTypeLabel,
  displayText,
  modeLabel,
  sourceLabel,
  statusLabel
} from '../js/live-data.js?chinese-interface-test';

const require = createRequire(import.meta.url);
const miniFormat = require('../../wechat-mini-program/utils/format.js');
const testDirectory = dirname(fileURLToPath(import.meta.url));
const webRoot = join(testDirectory, '..');
const miniRoot = join(testDirectory, '..', '..', 'wechat-mini-program');

function filesWithExtension(root, extension) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesWithExtension(fullPath, extension));
    else if (extname(entry.name) === extension) files.push(fullPath);
  }
  return files;
}

function visibleTemplateText(source) {
  return String(source || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<span\b[^>]*class=["'][^"']*material-symbols[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|ensp|emsp);/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const forbiddenVisibleCopy = /AgriLoop|Crop Pack|\bAI\b|AI\s*助手|\bAgent\b|\bAPI\b|\bREST\b|\bDEFRA\b|READ ONLY|SIMULATED|USER_PROVIDED|NO_ACTION|INTERNAL_ERROR|H2_STANDALONE|Qwen\s*实时回答/i;

test('公共展示映射不会把未知英文枚举直接暴露给用户', () => {
  assert.equal(statusLabel('UNRECOGNIZED_STATE'), '未知');
  assert.equal(sourceLabel('UNRECOGNIZED_SOURCE'), '—');
  assert.equal(deviceTypeLabel('UNRECOGNIZED_TYPE'), '类型未知');
  assert.equal(modeLabel('H2_STANDALONE'), '本地持久化数据库');
  assert.equal(displayText('SIMULATED · NO_ACTION · ACK'), '模拟 · 无干预 · 执行回执');

  assert.equal(miniFormat.statusLabel('UNRECOGNIZED_STATE'), '未知状态');
  assert.equal(miniFormat.provenanceLabel('UNRECOGNIZED_SOURCE'), '其他来源');
  assert.equal(miniFormat.serviceLabel('unrecognized-service'), '其他服务');
});

test('英文后端错误显示为中文并保留原始调试信息', () => {
  const error = new ApiError('No static resource api/v1/market-prices.', {
    status: 500,
    code: 'INTERNAL_ERROR',
    payload: { path: '/api/v1/market-prices' }
  });
  assert.equal(error.message, '服务处理异常，请稍后重试');
  assert.equal(error.rawMessage, 'No static resource api/v1/market-prices.');
  assert.equal(error.payload.path, '/api/v1/market-prices');
});

test('正式网页和小程序模板的可见系统文案不再混入英文状态或旧功能名', () => {
  const webTemplates = ['login.html', 'login-concepts.html', 'farmer.html', 'index.html', 'sysadmin.html']
    .map((name) => join(webRoot, name));
  const miniTemplates = filesWithExtension(join(miniRoot, 'pages'), '.wxml');

  for (const file of [...webTemplates, ...miniTemplates]) {
    const visible = visibleTemplateText(readFileSync(file, 'utf8'));
    assert.doesNotMatch(visible, forbiddenVisibleCopy, file);
  }
});

test('工作台固定使用系统默认字体、主登录页保留仿宋并保留 agriloop logo 资源', () => {
  const settings = readFileSync(join(webRoot, 'js', 'user-settings.js'), 'utf8');
  const workspace = readFileSync(join(webRoot, 'js', 'modules', 'workspace-settings.js'), 'utf8');
  const login = readFileSync(join(webRoot, 'login.html'), 'utf8');
  const loginStyle = readFileSync(join(webRoot, 'css', 'login-motion.css'), 'utf8');

  assert.match(settings, /FONT_FAMILY_OPTIONS\s*=\s*Object\.freeze\(\[\s*Object\.freeze\(\{\s*value:\s*'system'/);
  assert.doesNotMatch(workspace, /settings-font-family|font_family_options|fontFamilyLabel/);
  assert.match(loginStyle, /font-family:\s*"Times New Roman",\s*FangSong,\s*STFangsong,\s*"FangSong_GB2312",\s*"仿宋",\s*serif/);
  assert.match(login, /assets\/brand\/agriloop-logo\.png/);
});

test('三角色界面回归修复保持中文、键盘可达和精度一致', () => {
  const farmerHtml = readFileSync(join(webRoot, 'farmer.html'), 'utf8');
  const farmerScript = readFileSync(join(webRoot, 'js', 'farmer.js'), 'utf8');
  const adminScript = readFileSync(join(webRoot, 'js', 'app.js'), 'utf8');
  const sysadminHtml = readFileSync(join(webRoot, 'sysadmin.html'), 'utf8');
  const sysadminScript = readFileSync(join(webRoot, 'js', 'sysadmin.js'), 'utf8');

  assert.match(farmerHtml, /<button v-if="!nav\.is_footer" type="button"[\s\S]*?:aria-current=/);
  assert.match(farmerHtml, /<button v-if="nav\.is_footer" type="button"[\s\S]*?:aria-current=/);
  assert.match(farmerHtml, /chart\.quality\.statusLabel/);
  assert.doesNotMatch(farmerHtml, /\{\{\s*chart\.quality\.status\s*\}\}/);
  assert.match(farmerScript, /statusLabel:\s*metricStatusLabel\(quality\.status \|\| metric\.status \|\| 'UNKNOWN'\)/);
  assert.match(farmerScript, /soilMoistureTrendPerHour:[^\n]*step:\s*\.01/);
  assert.match(adminScript, /soilMoistureTrendPerHour:[^\n]*step:\s*\.01/);
  assert.match(sysadminHtml, /admin-account-create-modal" role="dialog" aria-modal="true" aria-labelledby="createUserDialogTitle"/);
  assert.match(sysadminHtml, /aria-label="关闭创建用户窗口"/);
  assert.match(sysadminScript, /handleCreateUserDialogKeydown/);
});
