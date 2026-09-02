const SESSION_KEY = 'agriloop.wx.session.v1';

function read() {
  try {
    const raw = wx.getStorageSync(SESSION_KEY);
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || !value.token || !value.user || !value.user.userId) return null;
    if (value.expiresAt && Date.now() >= Number(value.expiresAt)) {
      clear();
      return null;
    }
    return value;
  } catch (error) {
    return null;
  }
}

function save(auth) {
  const user = auth && auth.user ? auth.user : null;
  const token = auth && (auth.accessToken || auth.token);
  if (!user || !token) throw new Error('登录响应缺少会话信息');
  const expiresIn = Number(auth.expiresInSeconds || 43200);
  const value = {
    token: String(token),
    user,
    issuedAt: Date.now(),
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000
  };
  wx.setStorageSync(SESSION_KEY, value);
  return value;
}

function clear() {
  try {
    wx.removeStorageSync(SESSION_KEY);
  } catch (error) {
    // Ignore a storage cleanup failure; the in-memory app state is cleared too.
  }
}

function scopedKey(userId, suffix) {
  const actor = encodeURIComponent(String(userId || 'anonymous'));
  return `agriloop.wx.${suffix}.${actor}`;
}

function conversationKey(userId, plotId) {
  const scope = plotId || 'platform';
  return scopedKey(userId, `conversation.${encodeURIComponent(scope)}`);
}

function readConversationId(userId, plotId) {
  try {
    return String(wx.getStorageSync(conversationKey(userId, plotId)) || '');
  } catch (error) {
    return '';
  }
}

function saveConversationId(userId, plotId, conversationId) {
  if (!conversationId) return;
  try {
    wx.setStorageSync(conversationKey(userId, plotId), conversationId);
  } catch (error) {
    // A missing local history pointer only means the next visit starts a new chat.
  }
}

function preferenceKey(userId, name) {
  return scopedKey(userId, `preference.${name}`);
}

module.exports = {
  read,
  save,
  clear,
  scopedKey,
  readConversationId,
  saveConversationId,
  preferenceKey
};
