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

// ===== Records 持久化（localStorage） =====
var RECORDS_KEY = "life-assistant-records";

function getAllRecords() {
  var raw = localStorage.getItem(RECORDS_KEY);
  if (!raw) return { expense: [], food: [], todo: [], insight: [] };
  try {
    var data = JSON.parse(raw);
    if (!data.expense) data.expense = [];
    if (!data.food) data.food = [];
    if (!data.todo) data.todo = [];
    if (!data.insight) data.insight = [];
    return data;
  } catch (e) {
    return { expense: [], food: [], todo: [], insight: [] };
  }
}

function saveAllRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function addRecord(type, record) {
  var all = getAllRecords();
  if (!all[type]) all[type] = [];
  all[type].push(record);
  saveAllRecords(all);
}

function getRecordsByDate(type, date) {
  var all = getAllRecords();
  var records = all[type] || [];
  if (date) return records.filter(function (r) { return r.date === date; });
  return records;
}

function getRecordsSummary(date) {
  var expenses = getRecordsByDate("expense", date);
  var foods = getRecordsByDate("food", date);
  var todos = getRecordsByDate("todo", date);
  var insights = getRecordsByDate("insight", date);

  var totalExpense = 0;
  var expenseByCategory = {};
  for (var i = 0; i < expenses.length; i++) {
    totalExpense += expenses[i].amount;
    var cat = expenses[i].category;
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + expenses[i].amount;
  }

  return {
    success: true,
    date: date,
    expense: { total: totalExpense, count: expenses.length, byCategory: expenseByCategory },
    food: { count: foods.length },
    todo: { count: todos.length },
    insight: { count: insights.length },
  };
}

function getApiKeyForModel(model) {
  var settings = getSettings();
  var config = MODEL_CONFIG[model];
  if (!config) return null;
  return settings.apiKeys[config.provider] || null;
}
