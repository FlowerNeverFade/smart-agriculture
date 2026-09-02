const MESSAGE_READ_STORAGE_PREFIX = 'agriloop_read_messages';

function resolve_storage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function normalize_id(value) {
  return String(value ?? '').trim();
}

/** Build a browser-local key that cannot mix read state between accounts. */
export function messageReadStorageKey(mode = 'demo', accountId = 'anonymous') {
  const normalizedMode = encodeURIComponent(normalize_id(mode).toLowerCase() || 'demo');
  const normalizedAccountId = encodeURIComponent(normalize_id(accountId) || 'anonymous');
  return `${MESSAGE_READ_STORAGE_PREFIX}:${normalizedMode}:${normalizedAccountId}`;
}

/** Read a malformed or unavailable store as an empty set. */
export function loadReadMessageIds(key, storage) {
  const target = resolve_storage(storage);
  if (!target || !key) return new Set();
  try {
    const parsed = JSON.parse(target.getItem(key) || '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(normalize_id).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Persist a de-duplicated, deterministic list without making storage fatal. */
export function saveReadMessageIds(key, ids, storage) {
  const target = resolve_storage(storage);
  if (!target || !key) return false;
  try {
    const normalized = [...new Set(Array.from(ids || [], normalize_id).filter(Boolean))].sort();
    target.setItem(key, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}
