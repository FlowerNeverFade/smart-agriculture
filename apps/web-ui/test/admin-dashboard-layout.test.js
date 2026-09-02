import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const styleSource = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

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
  assert.match(indexSource, /css\/style\.css\?v=20260902-v5913-summary-row-v2/);
  assert.match(indexSource, /css\/modules\/admin\.css\?v=20260902-v5913-summary-row-v2/);
});
