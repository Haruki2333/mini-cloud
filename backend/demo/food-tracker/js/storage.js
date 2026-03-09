var RECORDS_KEY = "food-tracker-records";
var SETTINGS_KEY = "food-tracker-settings";
var defaultSettings = { tier: 1, apiKeys: {} };

function getRecords() {
  var raw = localStorage.getItem(RECORDS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveRecord(record) {
  var records = getRecords();
  records.unshift(record);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function getRecordById(id) {
  var records = getRecords();
  for (var i = 0; i < records.length; i++) {
    if (records[i].id === id) return records[i];
  }
  return null;
}

function deleteRecord(id) {
  var records = getRecords().filter(function (r) {
    return r.id !== id;
  });
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function getSettings() {
  var raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { tier: 1, apiKeys: {} };
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { tier: 1, apiKeys: {} };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function setTier(tier) {
  var settings = getSettings();
  settings.tier = tier;
  saveSettings(settings);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
