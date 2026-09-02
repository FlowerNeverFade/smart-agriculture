const DEFAULT_API_BASE_URL = 'https://u558871-7873be733236.westd.seetacloud.com:8443/api/v1';
const API_OVERRIDE_KEY = 'agriloop.wx.apiBaseUrl';

function getApiBaseUrl() {
  try {
    const override = wx.getStorageSync(API_OVERRIDE_KEY);
    if (typeof override === 'string' && override.trim()) {
      return override.trim().replace(/\/+$/, '');
    }
  } catch (error) {
    // Storage may be unavailable during the very first app bootstrap.
  }
  return DEFAULT_API_BASE_URL;
}

module.exports = {
  appName: '农智闭环',
  defaultApiBaseUrl: DEFAULT_API_BASE_URL,
  apiOverrideKey: API_OVERRIDE_KEY,
  requestTimeout: 12000,
  imageRequestTimeout: 150000,
  pollInterval: 15000,
  getApiBaseUrl
};
