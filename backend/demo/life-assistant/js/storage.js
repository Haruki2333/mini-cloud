var SETTINGS_KEY = "life-assistant-settings";
var PROFILE_KEY = "life-assistant-profile";
var CHAT_KEY = "life-assistant-chat";
var MAX_MESSAGES = 50;

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

function getProfile() {
  var raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return { name: "", age: "", gender: "", hobbies: "", bio: "" };
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { name: "", age: "", gender: "", hobbies: "", bio: "" };
  }
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

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
  // 只保留最近 MAX_MESSAGES 条
  if (messages.length > MAX_MESSAGES) {
    messages = messages.slice(messages.length - MAX_MESSAGES);
  }
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
}

function clearChatHistory() {
  localStorage.removeItem(CHAT_KEY);
}

function getApiKeyForModel(model) {
  var settings = getSettings();
  var config = MODEL_CONFIG[model];
  if (!config) return null;
  return settings.apiKeys[config.provider] || null;
}
