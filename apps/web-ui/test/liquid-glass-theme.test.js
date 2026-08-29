import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relativePath => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('farm admin uses the transparent readable sage liquid glass workspace', async () => {
  const [adminCss, resourceCss, index] = await Promise.all([
    read('../css/modules/admin.css'),
    read('../css/modules/admin-resource-planning.css'),
    read('../index.html')
  ]);

  assert.match(adminCss, /V5\.8\.2 FARM_ADMIN Liquid Glass transparency tuning/);
  assert.match(adminCss, /--admin-glass-surface:\s*rgba\(248, 252, 249, \.55\)/);
  assert.match(adminCss, /--admin-dashboard-card-surface:\s*rgba\(252, 255, 253, \.80\)/);
  assert.match(adminCss, /--admin-glass-control-outline:\s*rgba\(32, 74, 51, \.58\)/);
  assert.match(adminCss, /\.role-farm-admin\s*\{[\s\S]*radial-gradient[\s\S]*background-attachment:\s*fixed/);
  assert.match(adminCss, /\.role-farm-admin \.manager-dashboard \.manager-plot-grid > \.manager-plot-card[\s\S]*backdrop-filter:\s*blur/);
  assert.match(adminCss, /\[data-theme="dark"\] \.role-farm-admin[\s\S]*--admin-dashboard-card-surface/);

  assert.match(resourceCss, /--rp-glass-surface:\s*var\(--admin-glass-surface/);
  assert.match(resourceCss, /\.rp-card[\s\S]*backdrop-filter:\s*blur\(30px\)/);
  assert.match(resourceCss, /\.rp-button[\s\S]*--admin-liquid-control/);

  assert.match(index, /admin-resource-planning\.css\?v=20260830-v582-liquid-glass/);
  assert.match(index, /admin\.css\?v=20260830-v582-liquid-glass/);
});

test('farmer and system admin keep their existing role-specific glass layers', async () => {
  const [adminCss, farmerCss, farmerHtml] = await Promise.all([
    read('../css/modules/admin.css'),
    read('../css/farmer.css'),
    read('../farmer.html')
  ]);

  assert.match(adminCss, /\.role-system-admin\s*\{[\s\S]*--system-glass-surface/);
  assert.match(farmerCss, /--farmer-glass-surface:/);
  assert.match(farmerCss, /#farmer_app[\s\S]*backdrop-filter:\s*blur/);
  assert.match(farmerHtml, /farmer\.css\?v=20260828-role-glass-v578-2/);
});
