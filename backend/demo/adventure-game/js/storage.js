var SETTINGS_KEY = "adventure-game-settings";
var STORIES_KEY = "adventure-game-stories";
var CURRENT_STORY_KEY = "adventure-game-current";
var ANON_TOKEN_KEY = "adventure-game-anon-token";

// ===== 匿名用户标识 =====

/**
 * 获取或创建匿名用户令牌（持久化在 localStorage，用作服务端用户标识）
 */
function getAnonToken() {
  var raw = localStorage.getItem(ANON_TOKEN_KEY);
  if (raw) return raw;
  var token = generateId();
  localStorage.setItem(ANON_TOKEN_KEY, token);
  return token;
}

// ===== 设置管理 =====

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

function getApiKeyForModel(model) {
  var settings = getSettings();
  var config = MODEL_CONFIG[model];
  if (!config) return null;
  return settings.apiKeys[config.provider] || null;
}

// ===== 已完成故事存储 =====

function getStories() {
  var raw = localStorage.getItem(STORIES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveStory(story) {
  var stories = getStories();
  // 如果已有同 id 则替换
  var idx = -1;
  for (var i = 0; i < stories.length; i++) {
    if (stories[i].id === story.id) {
      idx = i;
      break;
    }
  }
  if (idx >= 0) {
    stories[idx] = story;
  } else {
    stories.unshift(story);
  }
  if (stories.length > MAX_STORIES) {
    stories = stories.slice(0, MAX_STORIES);
  }
  localStorage.setItem(STORIES_KEY, JSON.stringify(stories));
}

function getStoryById(id) {
  var stories = getStories();
  for (var i = 0; i < stories.length; i++) {
    if (stories[i].id === id) return stories[i];
  }
  return null;
}

function deleteStory(id) {
  var stories = getStories();
  stories = stories.filter(function (s) {
    return s.id !== id;
  });
  localStorage.setItem(STORIES_KEY, JSON.stringify(stories));
}

// ===== 当前进行中的故事（防刷新丢失） =====

function getCurrentStory() {
  var raw = localStorage.getItem(CURRENT_STORY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveCurrentStory(story) {
  // 只保存最近 12 条消息（6 轮），避免 localStorage 无限增长
  var trimmed = Object.assign({}, story);
  if (trimmed.messages && trimmed.messages.length > 12) {
    trimmed.messages = trimmed.messages.slice(-12);
  }
  localStorage.setItem(CURRENT_STORY_KEY, JSON.stringify(trimmed));
}

function clearCurrentStory() {
  localStorage.removeItem(CURRENT_STORY_KEY);
}

// ===== 人物档案存储 =====

var CHARACTER_KEY = "adventure-game-character";

function getCharacterProfile() {
  var raw = localStorage.getItem(CHARACTER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveCharacterProfile(profile) {
  localStorage.setItem(CHARACTER_KEY, JSON.stringify(profile));
}

function clearCharacterProfile() {
  localStorage.removeItem(CHARACTER_KEY);
}
