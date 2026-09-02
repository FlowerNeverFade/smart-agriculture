const config = require('./config');
const sessionStore = require('./session');

function appInstance() {
  try {
    return getApp();
  } catch (error) {
    return null;
  }
}

function queryString(params) {
  if (!params || typeof params !== 'object') return '';
  const parts = [];
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null || value === '') return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

function unwrap(payload) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
  return payload;
}

const ERROR_MESSAGES = {
  SYSTEM_ADMIN_CREATION_DISABLED: '系统管理员账号创建功能尚未启用',
  SYSTEM_ADMIN_AUTHORIZATION_INVALID: '系统管理员授权码无效',
  SYSTEM_ADMIN_AUTHORIZATION_RATE_LIMITED: '授权码尝试次数过多，请稍后再试',
  ACCOUNT_SYSTEM_ADMIN_PROTECTED: '系统管理员账号受永久保护，不能执行此操作',
  ACCOUNT_PERSISTENCE_UNAVAILABLE: '账号持久化服务暂不可用，请稍后再试',
  PLOT_PERSISTENCE_UNAVAILABLE: '地块持久化服务暂不可用，请稍后再试',
  RESOURCE_PERSISTENCE_UNAVAILABLE: '资源协同持久化服务暂不可用，当前仅可查看'
};

function localizedErrorMessage(message, code, statusCode) {
  const raw = String(message || '').trim();
  if (/[\u3400-\u9fff]/.test(raw)) return raw;
  const known = ERROR_MESSAGES[String(code || '').toUpperCase()];
  if (known) return known;
  if (statusCode === 400 || statusCode === 422) return '提交内容有误，请检查后重试';
  if (statusCode === 403) return '当前账号无权执行此操作';
  if (statusCode === 404) return '没有找到请求的内容';
  if (statusCode === 409) return '数据已发生变化，请刷新后重试';
  if (statusCode >= 500) return '服务处理异常，请稍后重试';
  return '操作未完成，请稍后重试';
}

function request(path, options) {
  const input = options || {};
  const authRequired = input.auth !== false;
  const timeout = Number(input.timeout || config.requestTimeout);
  const app = appInstance();
  const session = sessionStore.read();
  const header = Object.assign({
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }, input.header || {});
  if (authRequired && session?.token) header.Authorization = `Bearer ${session.token}`;
  const requestOptions = Object.assign({}, input);
  delete requestOptions.auth;
  delete requestOptions.timeout;
  requestOptions.header = header;

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.getApiBaseUrl()}${path}`,
      method: requestOptions.method || 'GET',
      data: requestOptions.data,
      header: requestOptions.header,
      timeout,
      success(response) {
        const payload = response.data || {};
        if (response.statusCode === 401) {
          if (app && typeof app.expireSession === 'function') app.expireSession();
          reject({ code: 'SESSION_EXPIRED', message: '登录已过期，请重新登录', statusCode: 401 });
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = payload.error || {};
          const code = error.code || `HTTP_${response.statusCode}`;
          const rawMessage = String(error.message || '').trim();
          reject({
            code,
            message: localizedErrorMessage(rawMessage, code, response.statusCode),
            rawMessage,
            statusCode: response.statusCode,
            details: error.details || {},
            payload
          });
          return;
        }
        resolve(unwrap(payload));
      },
      fail(error) {
        reject({
          code: 'NETWORK_ERROR',
          message: error?.errMsg?.includes('timeout') ? '请求超时，请稍后重试' : '暂时无法连接服务',
          cause: error
        });
      }
    });
  });
}

function get(path, params, options) {
  return request(`${path}${queryString(params)}`, Object.assign({ method: 'GET' }, options || {}));
}

function post(path, data, options) {
  return request(path, Object.assign({ method: 'POST', data: data || {} }, options || {}));
}

function put(path, data, options) {
  return request(path, Object.assign({ method: 'PUT', data: data || {} }, options || {}));
}

function login(username, password, role) {
  return post('/auth/login', { username, password, role }, { auth: false });
}

function getMe() { return get('/auth/me'); }
function getFarms() { return get('/farms'); }
function getOverview(farmId) { return get('/overview', farmId ? { farmId } : null); }
function getPlots(params) { return get('/plots', params || {}); }
function getWorkOrders(params) { return get('/work-orders', params || {}); }
function getTodayWork(params) { return get('/work-items/today', params || {}); }
function getAlerts(params) { return get('/alerts', params || {}); }
function getTelemetry(plotId, metric, limit) {
  return get(`/plots/${encodeURIComponent(plotId)}/telemetry`, { metric, limit: limit || 24 });
}
function getForecast(plotId, metric) {
  return get(`/plots/${encodeURIComponent(plotId)}/risk-forecast`, { metric: metric || 'SOIL_MOISTURE' });
}
function getSystemStatus() { return get('/system/status'); }
function getAgentHistory(conversationId, limit) {
  return get('/agent/history', { conversationId, limit: limit || 80 });
}
function getAgentConversations(plotId, limit) {
  return get('/agent/conversations', { plotId, limit: limit || 20, archived: false });
}
function agentChat(body) {
  const hasImages = Array.isArray(body?.images) && body.images.length > 0;
  return post('/agent/chat', body, { timeout: hasImages ? config.imageRequestTimeout : 65000 });
}
function getAgentAction(actionId) {
  return get(`/agent/actions/${encodeURIComponent(actionId)}`);
}
function getAgentRun(traceId) {
  return get(`/agent/runs/${encodeURIComponent(traceId)}`);
}
function renameAgentConversation(conversationId, title) {
  return put(`/agent/conversations/${encodeURIComponent(conversationId)}`, { title });
}
function archiveAgentConversation(conversationId, archived) {
  return post(`/agent/conversations/${encodeURIComponent(conversationId)}/archive`, { archived: archived !== false });
}
function deleteAgentConversation(conversationId) {
  return request(`/agent/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
}
function transitionWorkOrder(workOrderId, data) {
  return post(`/work-orders/${encodeURIComponent(workOrderId)}/transition`, data || {});
}
function reportIssue(workOrderId, data) {
  return post(`/work-orders/${encodeURIComponent(workOrderId)}/report-issue`, data || {});
}
function reviewWorkOrder(workOrderId, data) {
  return post(`/work-orders/${encodeURIComponent(workOrderId)}/review`, data || {});
}
function confirmAgentAction(actionId, data) {
  return post(`/agent/actions/${encodeURIComponent(actionId)}/confirm`, data || {});
}
function cancelAgentAction(actionId) {
  return post(`/agent/actions/${encodeURIComponent(actionId)}/cancel`, {});
}

module.exports = {
  request,
  login,
  getMe,
  getFarms,
  getOverview,
  getPlots,
  getWorkOrders,
  getTodayWork,
  getAlerts,
  getTelemetry,
  getForecast,
  getSystemStatus,
  getAgentHistory,
  getAgentConversations,
  agentChat,
  getAgentAction,
  getAgentRun,
  renameAgentConversation,
  archiveAgentConversation,
  deleteAgentConversation,
  transitionWorkOrder,
  reportIssue,
  reviewWorkOrder,
  confirmAgentAction,
  cancelAgentAction
};
