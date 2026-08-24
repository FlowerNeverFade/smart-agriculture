/**
 * Role-first landing dashboard smoke test.
 * Requires the same local jsdom install used by verify-webui.mjs.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const jsdomPath = join(root, '.tools', 'node_modules', 'jsdom', 'lib', 'api.js');
if (!existsSync(jsdomPath)) {
  console.error('未找到 jsdom，请先执行: npm install jsdom --prefix .tools --ignore-scripts --no-audit --no-fund');
  process.exit(2);
}

const { JSDOM } = await import(pathToFileURL(jsdomPath).href);
const { MOCK_DATA } = await import(pathToFileURL(join(root, 'apps/web-ui/js/mock-data.js')).href);
const { ROLE_META, renderRoleDashboard } = await import(pathToFileURL(join(root, 'apps/web-ui/js/role-dashboard.js')).href);

const expectedTitles = {
  FARMER: '我的农场',
  FIELD_OPERATOR: '我的执行任务',
  FARM_ADMIN: '农场运营驾驶舱',
  SYSTEM_ADMIN: '平台运行状态'
};

for (const [role, title] of Object.entries(expectedTitles)) {
  const dom = new JSDOM('<main id="root"></main>');
  const container = dom.window.document.getElementById('root');
  renderRoleDashboard({
    container,
    user: { username: role.toLowerCase(), role },
    plots: MOCK_DATA.plots,
    feedItems: MOCK_DATA.feedItems,
    workOrders: MOCK_DATA.workOrders,
    resourceProfile: MOCK_DATA.resourceProfile,
    system: MOCK_DATA.system,
    simulator: { status: 'RUNNING' },
    isLive: false
  });
  if (!container.textContent.includes(title)) throw new Error(`${role}: missing ${title}`);
  const actions = container.querySelectorAll('[data-role-action]');
  if (actions.length < 2) throw new Error(`${role}: expected at least two understandable actions`);
  if (!container.querySelector(`[data-role-dashboard="${role}"]`)) throw new Error(`${role}: missing role marker`);
  if (!Array.isArray(ROLE_META[role].nav) || ROLE_META[role].nav.length < 4) {
    throw new Error(`${role}: role navigation metadata is incomplete`);
  }
  console.log(`PASS ${role} · ${title} · ${actions.length} actions`);
}

console.log('===== 角色 Dashboard: 4/4 通过 =====');
