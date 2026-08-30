/**
 * 农户首页信息层级静态回归检查。
 *
 * 该检查不启动后端，也不依赖浏览器；它用于在构建前阻止首页模块顺序、
 * 聚合入口和响应式关键类被意外移除。完整交互仍由浏览器验收覆盖。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');
const html = read('apps/web-ui/farmer.html');
const script = read('apps/web-ui/js/farmer.js');
const style = read('apps/web-ui/css/farmer.css');

const check = (name, condition) => {
  assert.ok(condition, name);
  console.log(`✅ PASS | ${name}`);
};

check('首页启用任务优先工作区', html.includes('farmer-dashboard-workspace'));
check('首页包含行动与风险双栏首层', html.includes('farmer-dashboard-hero-grid') && html.includes('farmer-risk-summary'));
check('首页展示聚合风险摘要', html.includes('dashboard_risk_summary') && script.includes('const dashboard_risk_summary = computed'));
check('首页动态使用统一入口', html.includes('farmer-activity-panel') && html.includes('recent_activity') && script.includes('const open_activity_item'));
check('首页动态过滤告警重复项', script.includes(".filter((message) => message.category !== 'alert')"));
check('优先行动仍限制为三项', script.includes('.slice(0, 3)'));
check('首页顺序为行动、统计、地块、辅助信息、动态',
  style.includes('> .farmer-dashboard-hero-grid { order: 1; }')
  && style.includes('> .farmer-stats-grid { order: 2; }')
  && style.includes('> .farmer-plots-panel { order: 3; }')
  && style.includes('> .farmer-insight-grid { order: 4; }')
  && style.includes('> .farmer-activity-panel { order: 5; }'));
check('首页统计卡有窄屏双列规则', style.includes('.farmer-dashboard-workspace > .farmer-stats-grid { grid-template-columns: repeat(2'));
check('首页风险摘要有窄屏单列规则', style.includes('.farmer-dashboard-hero-grid { grid-template-columns: 1fr; }'));
check('窄屏默认收起侧栏', script.includes('window.innerWidth > 760'));
check('首页使用新的资源版本参数', html.includes('20260830-startup-timeout'));

console.log('\n===== 农户首页静态检查通过 =====');
