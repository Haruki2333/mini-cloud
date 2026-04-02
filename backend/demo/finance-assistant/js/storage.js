var SETTINGS_KEY = "finance-assistant-settings";
var PROFILE_KEY = "finance-assistant-profile";
var CHAT_KEY = "finance-assistant-chat";
var CATEGORIES_KEY = "finance-assistant-categories";
var MAX_MESSAGES = 50;
var MAX_CATEGORIES = 20;
var DEFAULT_EXPENSE_CATEGORIES = ["餐饮", "交通", "购物", "娱乐", "医疗", "居住", "教育", "通讯", "日用", "其他"];

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
  if (!raw) return { name: "" };
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { name: "" };
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

function deleteRecord(type, id) {
  var all = getAllRecords();
  if (!all[type]) return;
  all[type] = all[type].filter(function (r) { return r.id !== id; });
  saveAllRecords(all);
}

function getRecordsByDate(type, date) {
  var all = getAllRecords();
  var records = all[type] || [];
  if (date) return records.filter(function (r) { return r.date === date; });
  return records;
}

function getRecordsByMonth(type, month) {
  var all = getAllRecords();
  var records = all[type] || [];
  if (month) return records.filter(function (r) { return r.date && r.date.slice(0, 7) === month; });
  return records;
}

function getRecordsSummaryByMonth(month) {
  var expenses = getRecordsByMonth("expense", month);
  var incomes = getRecordsByMonth("income", month);

  var totalExpense = 0;
  for (var i = 0; i < expenses.length; i++) {
    totalExpense += expenses[i].amount;
  }

  var totalIncome = 0;
  for (var i = 0; i < incomes.length; i++) {
    totalIncome += incomes[i].amount;
  }

  return {
    success: true,
    month: month,
    expense: { total: totalExpense, count: expenses.length },
    income: { total: totalIncome, count: incomes.length },
    netIncome: totalIncome - totalExpense,
  };
}

function getExpenseByCategoryByMonth(month) {
  var expenses = getRecordsByMonth("expense", month);
  var byCategory = {};
  var total = 0;
  for (var i = 0; i < expenses.length; i++) {
    total += expenses[i].amount;
    var cat = expenses[i].category;
    byCategory[cat] = (byCategory[cat] || 0) + expenses[i].amount;
  }
  return { byCategory: byCategory, total: total };
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

// ===== 支出分类持久化 =====

function getExpenseCategories() {
  var raw = localStorage.getItem(CATEGORIES_KEY);
  if (!raw) return DEFAULT_EXPENSE_CATEGORIES.slice();
  try {
    var cats = JSON.parse(raw);
    return Array.isArray(cats) && cats.length > 0 ? cats : DEFAULT_EXPENSE_CATEGORIES.slice();
  } catch (e) {
    return DEFAULT_EXPENSE_CATEGORIES.slice();
  }
}

function saveExpenseCategories(cats) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
}

function getApiKeyForModel(model) {
  var settings = getSettings();
  var config = MODEL_CONFIG[model];
  if (!config) return null;
  return settings.apiKeys[config.provider] || null;
}
