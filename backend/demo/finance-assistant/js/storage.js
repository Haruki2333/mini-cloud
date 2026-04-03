var SETTINGS_KEY = "finance-assistant-settings";
var CHAT_KEY = "finance-assistant-chat";
var ANON_TOKEN_KEY = "finance-assistant-anon-token";
var MAX_MESSAGES = 50;
var MAX_CATEGORIES = 20;
var DEFAULT_EXPENSE_CATEGORIES = ["餐饮", "交通", "购物", "娱乐", "医疗", "居住", "教育", "通讯", "日用", "其他"];

// ===== 匿名用户令牌 =====

function getOrCreateAnonToken() {
  var token = localStorage.getItem(ANON_TOKEN_KEY);
  if (token) return token;
  // 生成 UUID v4
  token = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  localStorage.setItem(ANON_TOKEN_KEY, token);
  return token;
}

// ===== 设置（模型、API Key，设备本地） =====

function getSettings() {
  var raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { model: DEFAULT_MODEL, apiKeys: {} };
  try {
    var s = JSON.parse(raw);
    if (!s.model) s.model = DEFAULT_MODEL;
    if (!s.apiKeys) s.apiKeys = {};
    return s;
  } catch (e) {
    return { model: DEFAULT_MODEL, apiKeys: {} };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ===== 聊天历史（仅本地，可选） =====

function getChatHistory() {
  var raw = localStorage.getItem(CHAT_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveChatHistory(messages) {
  if (messages.length > MAX_MESSAGES) {
    messages = messages.slice(messages.length - MAX_MESSAGES);
  }
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
}

function clearChatHistory() {
  localStorage.removeItem(CHAT_KEY);
}

// ===== 工具函数 =====

function getApiKeyForModel(model) {
  var settings = getSettings();
  var config = MODEL_CONFIG[model];
  if (!config) return null;
  return settings.apiKeys[config.provider] || null;
}
