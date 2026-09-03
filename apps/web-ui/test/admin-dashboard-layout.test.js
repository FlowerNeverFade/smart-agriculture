import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const styleSource = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
const adminStyleSource = await readFile(new URL('../css/modules/admin.css', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

test('farm overview summary uses one compact bounded six-column row on desktop', () => {
  assert.match(
    styleSource,
    /\.manager-summary-strip\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*176px\)\);[^}]*justify-content:\s*space-between;/s
  );
  assert.match(
    styleSource,
    /#app\.role-farm-admin \.manager-summary-strip\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*176px\)\);[^}]*justify-content:\s*space-between;[^}]*gap:\s*10px;[^}]*min-height:\s*64px;/s
  );
  assert.match(
    styleSource,
    /#app\.role-farm-admin \.manager-summary-item\s*\{[^}]*min-height:\s*64px;[^}]*padding:\s*9px 11px;/s
  );
});

test('farm overview summary keeps responsive wrapping and refreshes both style assets', () => {
  assert.match(
    styleSource,
    /@media \(max-width:\s*900px\)[\s\S]*?\.manager-summary-strip,\s*#app\.role-farm-admin \.manager-summary-strip\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);\s*\}/
  );
  assert.match(
    styleSource,
    /@media \(max-width:\s*520px\)[\s\S]*?\.manager-summary-strip,\s*#app\.role-farm-admin \.manager-summary-strip\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);\s*\}/
  );
  assert.match(indexSource, /css\/style\.css\?v=20260903-v5919-main-merge-v1/);
  assert.match(indexSource, /css\/modules\/admin\.css\?v=20260903-v5919-main-merge-v1/);
  assert.match(indexSource, /js\/app\.js\?v=20260903-v5923-main-merge-v1/);
});

test('farm overview uses compact three-column plot cards on wide screens', () => {
  assert.match(styleSource, /\.manager-plot-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*14px;/s);
  assert.match(styleSource, /@media \(max-width:\s*1500px\)\s*\{\s*\.manager-plot-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s);
  assert.match(styleSource, /@media \(max-width:\s*1180px\)[\s\S]*?\.manager-plot-grid\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(adminStyleSource, /\.role-farm-admin article\.manager-plot-card\s*\{[^}]*padding:\s*10px;/s);
  assert.match(adminStyleSource, /\.role-farm-admin \.manager-crop-art\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*font-size:\s*28px;/s);
});

test('farm overview preserves server-synced ordering and keeps drop targets visible', () => {
  assert.match(indexSource, /class="manager-plot-drag-handle"/);
  assert.match(indexSource, /@pointerdown\.stop="startManagerPlotHandleDrag\(\$event, plot, plotIndex\)"/);
  assert.match(indexSource, /@keydown\.stop="handleManagerPlotOrderKeydown\(\$event, plot, plotIndex\)"/);
  assert.match(appSource, /api\.getFarmAdminWorkspacePreference\(normalizedFarmId\)/);
  assert.match(appSource, /api\.saveFarmAdminWorkspacePreference\(farmId, nextOrder, managerPlotOrderRevision\.value\)/);
  assert.match(appSource, /const managerPlotOrderOf = \(items\) => plotOrderIds\(items\)/);
  assert.match(appSource, /createManagerPlotDragPreview\(managerPlotDragElement\?\.closest\?\.\('\[data-manager-plot-id\]'\)/);
  assert.match(appSource, /moveManagerPlotDragPreview\([\s\S]*?targetPlot\?\.name \|\| ''/);
  assert.match(appSource, /`放到「\$\{targetName\}」的位置`/);
  assert.match(appSource, /preview\.removeAttribute\('data-manager-plot-id'\)/);
  assert.match(adminStyleSource, /\.manager-plot-drag-layer\s*\{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none;[^}]*background:\s*transparent\s*!important;/s);
  assert.match(adminStyleSource, /\.manager-plot-drag-context\s*\{\s*display:\s*contents;/);
  assert.match(adminStyleSource, /\.manager-plot-drag-target-badge\.has-target\s*\{/);
  assert.match(adminStyleSource, /\.manager-plot-card\.is-drop-target\s*\{[^}]*animation:\s*manager-plot-drop-pulse/s);
});
