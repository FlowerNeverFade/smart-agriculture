import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [htmlSource, scriptSource, styleSource, iconSource] = await Promise.all([
  readFile(new URL('../farmer.html', import.meta.url), 'utf8'),
  readFile(new URL('../js/farmer.js', import.meta.url), 'utf8'),
  readFile(new URL('../css/farmer.css', import.meta.url), 'utf8'),
  readFile(new URL('../js/modules/icon-map.js', import.meta.url), 'utf8')
]);

test('farmer plot cards expose a pointer-only direct drag handle', () => {
  assert.match(htmlSource, /<article\s+v-for="\(plot, plot_index\) in plots"[\s\S]*?class="farmer-plot-overview-card"/);
  assert.match(htmlSource, /class="farmer-plot-drag-handle"/);
  assert.match(iconSource, /drag_indicator:\s*'ph-dots-six-vertical'/);
  assert.match(htmlSource, /@pointerdown\.stop="start_plot_handle_drag\(\$event, plot, plot_index\)"/);
  assert.match(htmlSource, /class="farmer-plot-drag-handle"[\s\S]*?tabindex="-1"/);
  assert.doesNotMatch(htmlSource, /handle_plot_order_keydown|方向键、Home 和 End 键移动/);
  assert.doesNotMatch(scriptSource, /handle_plot_order_keydown|targetIndexByKey/);
  assert.match(scriptSource, /const start_plot_handle_drag = \(event, plot, index\) => \{[\s\S]*?begin_plot_pointer_tracking\(event, plot, index\);\s*activate_plot_drag\(\);/);
  assert.match(htmlSource, /js\/farmer\.js\?v=20260903-v5922-plot-health-v1/);
});

test('farmer pointer sorting keeps long press while the handle activates immediately', () => {
  assert.match(scriptSource, /const handle_plot_pointer_down = \(event, plot, index\) => \{[\s\S]*?window\.setTimeout\(activate_plot_drag, 400\)/);
  assert.match(scriptSource, /if \(event\.target\?\.closest\?\.\('\.farmer-plot-drag-handle'\)\) return/);
  assert.match(scriptSource, /plot_order_ids\.value = nextOrder;\s*replace_ref_array\(plots, nextPlots\)/);
  assert.match(scriptSource, /api\.saveFarmerWorkspacePreference\(nextOrder, plot_order_revision\.value\)/);
});

test('farmer drag feedback uses a transparent layer, full card preview, and named target', () => {
  assert.match(scriptSource, /create_plot_drag_preview\(plot_drag_element\?\.closest\?\.\('\[data-farmer-plot-id\]'\)/);
  assert.match(scriptSource, /preview\.removeAttribute\('data-farmer-plot-id'\)/);
  assert.match(scriptSource, /`放到「\$\{target_name\}」的位置`/);
  assert.match(styleSource, /\.farmer-plot-drag-layer\s*\{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none;[^}]*background:\s*transparent\s*!important;/s);
  assert.match(styleSource, /\.farmer-plot-drag-preview\s*\{[^}]*position:\s*fixed;[^}]*translate3d\(var\(--farmer-plot-preview-x/s);
  assert.match(styleSource, /\.farmer-plot-overview-card\.is-drop-target\s*\{[^}]*animation:\s*farmer-plot-drop-pulse/s);
});
