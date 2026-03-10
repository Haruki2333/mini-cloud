var RECORDS_KEY = "food-tracker-records";
var SETTINGS_KEY = "food-tracker-settings";

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
  if (!raw) return { model: DEFAULT_MODEL, apiKeys: {} };
  try {
    var s = JSON.parse(raw);
    // 向后兼容：旧版 tier 数据迁移
    if (s.tier && !s.model) {
      s.model = DEFAULT_MODEL;
      delete s.tier;
    }
    if (!s.model) s.model = DEFAULT_MODEL;
    return s;
  } catch (e) {
    return { model: DEFAULT_MODEL, apiKeys: {} };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function setModel(modelId) {
  var settings = getSettings();
  settings.model = modelId;
  saveSettings(settings);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
