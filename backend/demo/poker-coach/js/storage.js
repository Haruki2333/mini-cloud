// ===== 存储键 =====

var SETTINGS_KEY = "poker-coach-settings";
var ANON_TOKEN_KEY = "poker-coach-anon-token";

// ===== 匿名用户令牌 =====

function getOrCreateAnonToken() {
  var token = localStorage.getItem(ANON_TOKEN_KEY);
  if (token) return token;
  token = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  localStorage.setItem(ANON_TOKEN_KEY, token);
  return token;
}

// ===== 设置（API Key）=====
// 主对话固定使用 DEFAULT_MODEL（gpt-5.4），不再提供模型选择。

function getSettings() {
  var raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { model: DEFAULT_MODEL, apiKeys: {} };
  try {
    var s = JSON.parse(raw);
    s.model = DEFAULT_MODEL;
    if (!s.apiKeys) s.apiKeys = {};
    return s;
  } catch (e) {
    return { model: DEFAULT_MODEL, apiKeys: {} };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getApiKeyForModel(model) {
  var settings = getSettings();
  var config = MODEL_CONFIG[model];
  if (!config) return null;
  return settings.apiKeys[config.provider] || null;
}

// ===== 通用请求头 =====

function buildHeaders(extraHeaders) {
  var settings = getSettings();
  var apiKey = getApiKeyForModel(settings.model);
  var token = getOrCreateAnonToken();
  var headers = {
    "Content-Type": "application/json",
    "X-Anon-Token": token,
  };
  if (apiKey) headers["X-Api-Key"] = apiKey;
  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function (k) {
      headers[k] = extraHeaders[k];
    });
  }
  return headers;
}
