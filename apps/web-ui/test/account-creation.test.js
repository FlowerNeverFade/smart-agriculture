import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [loginHtml, loginSource, apiSource, systemHtml, systemSource] = await Promise.all([
  readFile(new URL('login.html', root), 'utf8'),
  readFile(new URL('js/login.js', root), 'utf8'),
  readFile(new URL('js/api.js', root), 'utf8'),
  readFile(new URL('sysadmin.html', root), 'utf8'),
  readFile(new URL('js/sysadmin.js', root), 'utf8')
]);

test('registration exposes all three public roles and only requests authorization for SYSTEM_ADMIN', () => {
  assert.match(loginHtml, /option value="FARMER"/);
  assert.match(loginHtml, /option value="FARM_ADMIN"/);
  assert.match(loginHtml, /option value="SYSTEM_ADMIN"/);
  assert.match(loginHtml, /id="registerAuthorizationCode"/);
  assert.match(loginSource, /selectedRole === 'SYSTEM_ADMIN'/);
  assert.match(loginSource, /authorizationCode/);
  assert.match(apiSource, /JSON\.stringify\(\{ username, password, role, authorizationCode \}\)/);
});

test('SYSTEM_ADMIN workspace uses global account APIs and role-specific scope controls', () => {
  assert.match(systemHtml, /availableAccountPlots/);
  assert.match(systemHtml, /服务端授权码/);
  assert.match(systemHtml, /恢复码只显示一次/);
  assert.match(systemSource, /api\.getUserAccounts\(\)/);
  assert.match(systemSource, /api\.createUserAccount\(/);
  assert.match(systemSource, /api\.updateUserAccountStatus\(/);
  assert.doesNotMatch(systemSource, /api\.createFarmMember\(\{[\s\S]{0,240}newUser/);
});

test('demo global account contract keeps SYSTEM_ADMIN protected and farm members farmer-only', async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  globalThis.localStorage = storage;
  globalThis.sessionStorage = storage;
  globalThis.fetch = async () => { throw new Error('offline'); };
  const { ApiService } = await import(`../js/api.js?account-contract=${Date.now()}`);
  const service = new ApiService();
  service.sessionMode = 'demo';

  const suffix = Date.now().toString(36);
  const farmer = await service.createUserAccount({
    username: `qa.farmer.${suffix}`, password: 'StrongPass2026', role: 'FARMER',
    farmId: 'farm-demo', plotIds: ['plot-a01']
  });
  assert.deepEqual(farmer.plotIds, ['plot-a01']);
  assert.ok((await service.getFarmMembers({ farmId: 'farm-demo' })).some((member) => member.userId === farmer.userId));
  await service.updateUserAccountStatus(farmer.userId, { enabled: false });
  assert.equal((await service.getFarmMembers({ farmId: 'farm-demo' })).find((member) => member.userId === farmer.userId)?.status, 'INACTIVE');
  await service.updateUserAccountStatus(farmer.userId, { enabled: true });

  const manager = await service.createUserAccount({
    username: `qa.manager.${suffix}`, password: 'StrongPass2026', role: 'FARM_ADMIN', farmId: 'farm-demo'
  });
  assert.ok(manager.plotIds.includes('plot-a01'));
  assert.ok(manager.plotIds.length > 1);

  await assert.rejects(service.createUserAccount({
    username: `qa.system.missing.${suffix}`, password: 'StrongPass2026', role: 'SYSTEM_ADMIN'
  }), (error) => error.code === 'SYSTEM_ADMIN_AUTHORIZATION_INVALID');
  const protectedAdmin = await service.createUserAccount({
    username: `qa.system.${suffix}`, password: 'StrongPass2026', role: 'SYSTEM_ADMIN', authorizationCode: 'demo-authorization'
  });
  assert.deepEqual(protectedAdmin.farmIds, ['*']);
  await assert.rejects(service.updateUserAccountStatus(protectedAdmin.userId, { enabled: false }), (error) => error.code === 'ACCOUNT_SYSTEM_ADMIN_PROTECTED');
  await assert.rejects(service.deleteUserAccount(protectedAdmin.userId), (error) => error.code === 'ACCOUNT_SYSTEM_ADMIN_PROTECTED');
  await assert.rejects(service.createFarmMember({
    farmId: 'farm-demo', username: `qa.elevated.${suffix}`, password: 'StrongPass2026', role: 'FARM_ADMIN'
  }), (error) => error.code === 'MEMBER_ROLE_FORBIDDEN');
  await service.deleteUserAccount(farmer.userId);
  assert.ok(!(await service.getUserAccounts()).some((account) => account.userId === farmer.userId));
  assert.ok(!(await service.getFarmMembers({ farmId: 'farm-demo' })).some((member) => member.userId === farmer.userId));
});
