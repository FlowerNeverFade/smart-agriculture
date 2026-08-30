/**
 * The three user-facing AgriLoop roles.
 *
 * A role is deliberately described in one place so the login screen, the
 * workspace navigation and action guards cannot drift apart.  The old
 * FIELD_OPERATOR code is accepted as a read-only compatibility alias for
 * existing sessions, but it is never offered as a fourth role in the UI.
 */

export const ROLE_DEFINITIONS = Object.freeze({
  FARM_ADMIN: Object.freeze({
    code: 'FARM_ADMIN',
    label: '农场管理员',
    description: '负责全场运营、任务安排、风险审批与资源调度。',
    avatar: '👑',
    defaultView: 'dashboard',
    views: Object.freeze(['dashboard', 'work-orders', 'decision-console', 'ai-assistant', 'resource-coordination', 'farm-members', 'settings']),
    permissions: Object.freeze([
      'plots:read', 'diagnosis:read', 'inspection:create', 'work-order:manage',
      'irrigation:request', 'irrigation:execute', 'irrigation:approve', 'simulator:control', 'strategy:manage',
      'resource:manage', 'strategy:read', 'value:manage'
    ])
  }),
  FARMER: Object.freeze({
    code: 'FARMER',
    label: '种植农户',
    description: '查看分配地块、提交巡田记录并确认和执行灌溉建议。',
    avatar: '🧑‍🌾',
    defaultView: 'dashboard',
    views: Object.freeze(['dashboard', 'decision-console', 'work-orders', 'crop-manual', 'settings']),
    permissions: Object.freeze(['plots:read', 'diagnosis:read', 'inspection:create', 'work-order:request', 'irrigation:request', 'irrigation:execute'])
  }),
  SYSTEM_ADMIN: Object.freeze({
    code: 'SYSTEM_ADMIN',
    label: '系统管理员',
    description: '负责平台配置、数据链路、策略版本与全局审计',
    avatar: '⚙️',
    defaultView: 'admin-overview',
    views: Object.freeze(['admin-overview', 'admin-ops', 'admin-audit', 'admin-simulator', 'admin-rules', 'admin-settings', 'settings']),
    permissions: Object.freeze([
      'plots:read', 'diagnosis:read', 'work-order:audit', 'simulator:control',
      'strategy:manage', 'value:audit', 'platform:manage', 'irrigation:execute', 'irrigation:approve'
    ])
  })
});

export const PUBLIC_ROLE_CODES = Object.freeze(Object.keys(ROLE_DEFINITIONS));

const ROLE_ALIASES = Object.freeze({
  ADMIN: 'FARM_ADMIN',
  FARM_ADMIN: 'FARM_ADMIN',
  FARMER: 'FARMER',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  SYSADMIN: 'SYSTEM_ADMIN',
  // Kept only so a session issued before the three-role migration can still
  // reach the workspace. It is rendered and authorized as a farmer.
  FIELD_OPERATOR: 'FARMER',
  OPERATOR: 'FARMER'
});

export const DEMO_ACCOUNTS = Object.freeze({
  admin: Object.freeze({ username: 'admin', role: 'FARM_ADMIN', roleLabel: '农场管理员', avatar: '👑' }),
  farmer: Object.freeze({ username: 'farmer', role: 'FARMER', roleLabel: '种植农户', avatar: '🧑‍🌾' }),
  sysadmin: Object.freeze({ username: 'sysadmin', role: 'SYSTEM_ADMIN', roleLabel: '系统管理员', avatar: '⚙️' })
});

export function normalizeRole(role) {
  const key = String(role || '').trim().toUpperCase();
  // An omitted role keeps the legacy farmer default; an unknown non-empty
  // value must stay invalid instead of silently receiving farmer privileges.
  return key ? (ROLE_ALIASES[key] || '') : 'FARMER';
}

export function roleDefinition(role) {
  return ROLE_DEFINITIONS[normalizeRole(role)] || null;
}

export function roleLabel(role) {
  return roleDefinition(role)?.label || '未知身份';
}

export function roleCan(roleOrUser, permission) {
  const role = typeof roleOrUser === 'object' ? roleOrUser?.role : roleOrUser;
  if (!String(role || '').trim()) return false;
  return roleDefinition(role)?.permissions.includes(permission) || false;
}

// Direct irrigation is a distinct capability from the legacy approval
// permission.  Keeping the alias makes older admin sessions and pages work
// while allowing farmers to execute only the guarded virtual irrigation flow.
export function canExecuteIrrigation(roleOrUser) {
  return roleCan(roleOrUser, 'irrigation:execute') || roleCan(roleOrUser, 'irrigation:approve');
}

export function roleViews(roleOrUser) {
  const role = typeof roleOrUser === 'object' ? roleOrUser?.role : roleOrUser;
  if (!String(role || '').trim()) return [];
  return roleDefinition(role)?.views || [];
}

export function presentRoleUser(user) {
  if (!user) return null;
  if (!isPublicRole(user.role)) return null;
  const definition = roleDefinition(user.role);
  return {
    ...user,
    role: definition.code,
    roleLabel: definition.label,
    roleDescription: definition.description,
    avatar: user.avatar || definition.avatar,
    roleCode: definition.code
  };
}

export function isPublicRole(role) {
  const key = String(role || '').trim().toUpperCase();
  return PUBLIC_ROLE_CODES.includes(ROLE_ALIASES[key] || '');
}
