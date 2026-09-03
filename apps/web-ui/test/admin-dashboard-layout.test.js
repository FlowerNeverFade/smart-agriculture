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
  assert.match(indexSource, /css\/style\.css\?v=20260903-v5917-admin-plot-order-v1/);
  assert.match(indexSource, /css\/modules\/admin\.css\?v=20260903-v5917-admin-plot-order-v1/);
});

test('farm overview uses compact three-column plot cards on wide screens', () => {
  assert.match(styleSource, /\.manager-plot-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*14px;/s);
  assert.match(styleSource, /@media \(max-width:\s*1500px\)[\s\S]*?\.manager-plot-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);\s*\}/);
  assert.match(adminStyleSource, /\.role-farm-admin \.manager-crop-art\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*font-size:\s*28px;/s);
  assert.match(adminStyleSource, /article\.manager-plot-card \.manager-metric\s*\{[^}]*min-height:\s*58px;[^}]*padding:\s*6px 7px;/s);
});

test('farm overview plot cards expose pointer and keyboard reordering without replacing card details', () => {
  assert.match(indexSource, /class="manager-plot-drag-handle"/);
  assert.match(indexSource, /@pointerdown\.stop="startPlotReorder\(\$event, plot\)"/);
  assert.match(indexSource, /@keydown="handlePlotOrderKeydown\(\$event, plot\)"/);
  assert.match(indexSource, /:style="plotDragStyle\(plot\)"/);
  assert.match(indexSource, /@click="openPlotDetail\(plot, \$event\)"/);
  assert.match(appSource, /managerPlotOrderStorageKey/);
  assert.match(appSource, /window\.localStorage\.setItem\(plotOrderKey\.value/);
  assert.match(appSource, /offsetX:\s*event\.clientX\s*-\s*plotDragState\.value\.originX/);
  assert.match(adminStyleSource, /\.manager-plot-card\.is-dragging\s*\{[^}]*translate3d\(var\(--manager-plot-drag-x[^}]*box-shadow:/s);
  assert.match(adminStyleSource, /\.manager-plot-card\.is-drop-target\s*\{[^}]*animation:\s*manager-plot-drop-pulse/s);
});
