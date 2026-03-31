var SETTINGS_KEY = "finance-assistant-settings";
var PROFILE_KEY = "finance-assistant-profile";
var CHAT_KEY = "finance-assistant-chat";
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
  if (messages.length > MAX_MESSAGES) {
    messages = messages.slice(messages.length - MAX_MESSAGES);
  }
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
}

function clearChatHistory() {
  localStorage.removeItem(CHAT_KEY);
}

// ===== Records 持久化（localStorage） =====
var RECORDS_KEY = "finance-assistant-records";

function getAllRecords() {
  var raw = localStorage.getItem(RECORDS_KEY);
  if (!raw) return { expense: [], income: [], budget: [] };
  try {
    var data = JSON.parse(raw);
    if (!data.expense) data.expense = [];
    if (!data.income) data.income = [];
    if (!data.budget) data.budget = [];
    return data;
  } catch (e) {
    return { expense: [], income: [], budget: [] };
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
  var incomes = getRecordsByDate("income", date);
  var budgets = getRecordsByDate("budget", date);

  var totalExpense = 0;
  var expenseByCategory = {};
  for (var i = 0; i < expenses.length; i++) {
    totalExpense += expenses[i].amount;
    var cat = expenses[i].category;
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + expenses[i].amount;
  }

  var totalIncome = 0;
  var incomeBySource = {};
  for (var i = 0; i < incomes.length; i++) {
    totalIncome += incomes[i].amount;
    var src = incomes[i].source;
    incomeBySource[src] = (incomeBySource[src] || 0) + incomes[i].amount;
  }

  return {
    success: true,
    date: date,
    expense: { total: totalExpense, count: expenses.length, byCategory: expenseByCategory },
    income: { total: totalIncome, count: incomes.length, bySource: incomeBySource },
    budget: { count: budgets.length },
    netIncome: totalIncome - totalExpense,
  };
}

function getApiKeyForModel(model) {
  var settings = getSettings();
  var config = MODEL_CONFIG[model];
  if (!config) return null;
  return settings.apiKeys[config.provider] || null;
}
