(function () {
  // ===== DOM 引用 =====
  var settingsBtn = document.getElementById("settingsBtn");
  var settingsOverlay = document.getElementById("settingsOverlay");
  var settingsBackdrop = document.getElementById("settingsBackdrop");
  var settingsClose = document.getElementById("settingsClose");
  var saveSettingsBtn = document.getElementById("saveSettingsBtn");
  var qwenKeyInput = document.getElementById("qwenKeyInput");
  var zhipuKeyInput = document.getElementById("zhipuKeyInput");
  var modelOptions = document.getElementById("modelOptions");
  var startBtn = document.getElementById("startBtn");
  var continueBtn = document.getElementById("continueBtn");
  var storyList = document.getElementById("storyList");
  var toastEl = document.getElementById("toast");

  // 人物初始化相关 DOM
  var charInitBtn = document.getElementById("charInitBtn");
  var charProfilePanel = document.getElementById("charProfilePanel");
  var charProfileName = document.getElementById("charProfileName");
  var charProfileTags = document.getElementById("charProfileTags");
  var charProfileEditBtn = document.getElementById("charProfileEditBtn");
  var charOverlay = document.getElementById("charOverlay");
  var charBackdrop = document.getElementById("charBackdrop");
  var charClose = document.getElementById("charClose");
  var charNameInput = document.getElementById("charNameInput");
  var charAgeInput = document.getElementById("charAgeInput");
  var wizardPrev = document.getElementById("wizardPrev");
  var wizardNext = document.getElementById("wizardNext");

  var currentWizardStep = 1;
  var totalWizardSteps = 3;
  // 向导临时存储（保存中间选择，关闭弹层时丢弃）
  // roleType 和 tone 均为数组（多选）；playerAge 为玩家真实年龄
  var wizardDraft = { name: "", playerAge: 25, roleType: [], tone: [] };

  // 将可能来自旧数据/不同形态的字段归一化为字符串数组
  function normalizeArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return [value];
  }

  var toastTimer = null;

  // ===== Toast =====

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2500);
  }

  // ===== 设置浮层 =====

  function openSettings() {
    var settings = getSettings();
    qwenKeyInput.value = settings.apiKeys.qwen || "";
    zhipuKeyInput.value = settings.apiKeys.zhipu || "";
    renderModelOptions(settings.model);
    settingsOverlay.classList.add("open");
  }

  function closeSettings() {
    settingsOverlay.classList.remove("open");
  }

  function renderModelOptions(selectedModel) {
    var html = "";
    var keys = Object.keys(MODEL_CONFIG);
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var cfg = MODEL_CONFIG[id];
      var active = id === selectedModel ? " active" : "";
      html +=
        '<div class="model-option' +
        active +
        '" data-model="' +
        id +
        '">' +
        escapeHtml(cfg.label) +
        "</div>";
    }
    modelOptions.innerHTML = html;

    // 绑定点击
    var options = modelOptions.querySelectorAll(".model-option");
    for (var j = 0; j < options.length; j++) {
      options[j].addEventListener("click", function () {
        var all = modelOptions.querySelectorAll(".model-option");
        for (var k = 0; k < all.length; k++) all[k].classList.remove("active");
        this.classList.add("active");
      });
    }
  }

  function handleSaveSettings() {
    var activeOption = modelOptions.querySelector(".model-option.active");
    var model = activeOption ? activeOption.dataset.model : DEFAULT_MODEL;
    var settings = {
      model: model,
      apiKeys: {
        qwen: qwenKeyInput.value.trim(),
        zhipu: zhipuKeyInput.value.trim(),
      },
    };
    saveSettings(settings);
    closeSettings();
    showToast("设置已保存");
    checkApiKey();
  }

  settingsBtn.addEventListener("click", openSettings);
  settingsBackdrop.addEventListener("click", closeSettings);
  settingsClose.addEventListener("click", closeSettings);
  saveSettingsBtn.addEventListener("click", handleSaveSettings);

  // ===== 人物档案面板 =====

  function renderCharProfile() {
    var profile = getCharacterProfile();
    if (!profile || !profile.name) {
      charProfilePanel.style.display = "none";
      charInitBtn.textContent = "";
      // 重新插入图标和文字
      charInitBtn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
        '<circle cx="12" cy="7" r="4"/>' +
        "</svg>" +
        "人物初始化";
      return;
    }

    // 已有档案，展示面板
    charProfileName.textContent = profile.name + (profile.playerAge ? "（" + profile.playerAge + "岁）" : "");
    var roleList = normalizeArray(profile.roleType);
    var toneList = normalizeArray(profile.tone);
    var tags = roleList.concat(toneList);
    var tagsHtml = "";
    for (var i = 0; i < tags.length; i++) {
      tagsHtml += '<span class="char-tag">' + escapeHtml(tags[i]) + "</span>";
    }
    charProfileTags.innerHTML = tagsHtml;
    charProfilePanel.style.display = "block";

    // 按钮文字改为"修改档案"
    charInitBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
      '<circle cx="12" cy="7" r="4"/>' +
      "</svg>" +
      "修改档案";
  }

  // ===== 向导弹层 =====

  function openCharWizard() {
    // 用已有档案预填草稿
    var existing = getCharacterProfile() || {};
    wizardDraft = {
      name: existing.name || "",
      playerAge: existing.playerAge || 25,
      roleType: normalizeArray(existing.roleType),
      tone: normalizeArray(existing.tone),
    };
    charNameInput.value = wizardDraft.name;
    if (charAgeInput) charAgeInput.value = wizardDraft.playerAge;

    // 恢复选中状态（两步均为多选）
    setGridSelectionMulti("roleGrid", wizardDraft.roleType);
    setGridSelectionMulti("toneGrid", wizardDraft.tone);

    goToStep(1);
    charOverlay.classList.add("open");
    setTimeout(function () {
      charNameInput.focus();
    }, 300);
  }

  function closeCharWizard() {
    charOverlay.classList.remove("open");
  }

  function setGridSelection(gridId, value) {
    var grid = document.getElementById(gridId);
    if (!grid) return;
    var items = grid.querySelectorAll(".option-item");
    for (var i = 0; i < items.length; i++) {
      if (items[i].dataset.value === value) {
        items[i].classList.add("selected");
      } else {
        items[i].classList.remove("selected");
      }
    }
  }

  // 多选版本：values 为字符串数组
  function setGridSelectionMulti(gridId, values) {
    var grid = document.getElementById(gridId);
    if (!grid) return;
    var set = {};
    for (var i = 0; i < (values || []).length; i++) {
      set[values[i]] = true;
    }
    var items = grid.querySelectorAll(".option-item");
    for (var j = 0; j < items.length; j++) {
      if (set[items[j].dataset.value]) {
        items[j].classList.add("selected");
      } else {
        items[j].classList.remove("selected");
      }
    }
  }

  function getGridSelection(gridId) {
    var grid = document.getElementById(gridId);
    if (!grid) return "";
    var selected = grid.querySelector(".option-item.selected");
    return selected ? selected.dataset.value : "";
  }

  // 多选版本：返回选中的 value 数组
  function getGridSelectionMulti(gridId) {
    var grid = document.getElementById(gridId);
    if (!grid) return [];
    var items = grid.querySelectorAll(".option-item.selected");
    var result = [];
    for (var i = 0; i < items.length; i++) {
      result.push(items[i].dataset.value);
    }
    return result;
  }

  function goToStep(step) {
    currentWizardStep = step;

    // 切换步骤显示
    for (var i = 1; i <= totalWizardSteps; i++) {
      var stepEl = document.getElementById("wStep" + i);
      var dotEl = document.getElementById("wDot" + i);
      if (stepEl) stepEl.classList.toggle("active", i === step);
      if (dotEl) dotEl.classList.toggle("active", i <= step);
    }

    // 更新导航按钮
    wizardPrev.style.display = step > 1 ? "flex" : "none";
    wizardNext.textContent = step === totalWizardSteps ? "保存" : "下一步";
  }

  function handleWizardNext() {
    if (currentWizardStep === 1) {
      var name = (charNameInput.value || "").trim();
      if (!name) {
        showToast("请输入你的称呼");
        charNameInput.focus();
        return;
      }
      var age = parseInt((charAgeInput && charAgeInput.value) || "0", 10);
      if (!age || age < 10 || age > 80) {
        showToast("请输入有效年龄（10-80岁）");
        if (charAgeInput) charAgeInput.focus();
        return;
      }
      wizardDraft.name = name;
      wizardDraft.playerAge = age;
    } else if (currentWizardStep === 2) {
      var roleTypes = getGridSelectionMulti("roleGrid");
      if (!roleTypes || roleTypes.length === 0) {
        showToast("请至少选择一类武侠人物");
        return;
      }
      wizardDraft.roleType = roleTypes;
    } else if (currentWizardStep === 3) {
      var tones = getGridSelectionMulti("toneGrid");
      if (!tones || tones.length === 0) {
        showToast("请至少选择一种故事类型");
        return;
      }
      wizardDraft.tone = tones;
      // 保存并关闭
      saveCharacterProfile(wizardDraft);
      closeCharWizard();
      renderCharProfile();
      showToast("人物档案已保存");
      return;
    }

    goToStep(currentWizardStep + 1);
  }

  function handleWizardPrev() {
    if (currentWizardStep > 1) {
      goToStep(currentWizardStep - 1);
    }
  }

  // 绑定选项格子的点击事件（单选）
  function bindOptionGrid(gridId) {
    var grid = document.getElementById(gridId);
    if (!grid) return;
    grid.addEventListener("click", function (e) {
      var item = e.target.closest(".option-item");
      if (!item) return;
      var items = grid.querySelectorAll(".option-item");
      for (var i = 0; i < items.length; i++) {
        items[i].classList.remove("selected");
      }
      item.classList.add("selected");
    });
  }

  // 多选格子：点击切换自身 selected，不清其他项
  function bindOptionGridMulti(gridId) {
    var grid = document.getElementById(gridId);
    if (!grid) return;
    grid.addEventListener("click", function (e) {
      var item = e.target.closest(".option-item");
      if (!item) return;
      item.classList.toggle("selected");
    });
  }

  charInitBtn.addEventListener("click", openCharWizard);
  charProfileEditBtn.addEventListener("click", openCharWizard);
  charBackdrop.addEventListener("click", closeCharWizard);
  charClose.addEventListener("click", closeCharWizard);
  wizardNext.addEventListener("click", handleWizardNext);
  wizardPrev.addEventListener("click", handleWizardPrev);

  bindOptionGridMulti("roleGrid");
  bindOptionGridMulti("toneGrid");

  // ===== API Key 检查 =====

  function checkApiKey() {
    var settings = getSettings();
    var hasKey = settings.apiKeys.qwen || settings.apiKeys.zhipu;
    if (hasKey) {
      settingsBtn.classList.remove("show");
    } else {
      settingsBtn.classList.add("show");
    }
  }

  // ===== 开始游戏 / 继续游戏 =====

  startBtn.addEventListener("click", function () {
    var settings = getSettings();
    var apiKey = getApiKeyForModel(settings.model);
    if (!apiKey) {
      showToast("请先配置 API Key");
      openSettings();
      return;
    }
    // 清除旧的未完成故事，开始新游戏
    clearCurrentStory();
    window.location.href = "game.html";
  });

  continueBtn.addEventListener("click", function () {
    window.location.href = "game.html?continue=1";
  });

  // ===== 历史故事列表 =====

  function renderStories(stories) {
    if (!stories || stories.length === 0) {
      storyList.innerHTML = '<div class="empty-text">&gt; 暂无历史故事</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < stories.length; i++) {
      var s = stories[i];
      // 兼容本地存档（scenes 数组）和服务端存档（scene_count）
      var sceneCount = s.scene_count != null ? s.scene_count : (s.scenes ? s.scenes.length : 0);
      // 兼容本地 id 和服务端 story_id
      var storyId = s.story_id || s.id;
      var isServerStory = !!s.story_id;
      var statusBadge = s.status === "ended" ? " <span style='opacity:.5;font-size:11px;'>[完结]</span>" : "";
      var chapterInfo = s.current_chapter
        ? "第" + s.current_chapter + "章·" + (s.current_beat || 1) + "/10"
        : "";
      html +=
        '<div class="story-card" data-id="' +
        escapeHtml(storyId) +
        '" data-server="' +
        (isServerStory ? "1" : "0") +
        '">' +
        '<div class="story-card-body">' +
        '<div class="story-card-title">' +
        escapeHtml(s.title || "未命名的冒险") +
        statusBadge +
        "</div>" +
        '<div class="story-card-meta">' +
        '<span class="story-card-tag">' +
        escapeHtml(s.world_setting || s.worldSetting || "未知世界") +
        "</span>" +
        (chapterInfo ? "<span>" + chapterInfo + "</span>" : "<span>" + sceneCount + " 个场景</span>") +
        "<span>" +
        formatDate(s.last_played_at || s.startTime) +
        "</span>" +
        "</div>" +
        "</div>" +
        (isServerStory
          ? "" // 服务端存档暂不提供前端删除（数据在服务端）
          : '<button class="story-card-delete" data-delete="' +
            escapeHtml(storyId) +
            '" title="删除">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="3 6 5 6 21 6"/>' +
            '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
            "</svg>" +
            "</button>") +
        "</div>";
    }
    storyList.innerHTML = html;

    // 绑定点击事件
    var cards = storyList.querySelectorAll(".story-card");
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener("click", function (e) {
        if (e.target.closest(".story-card-delete")) return;
        var id = this.dataset.id;
        var isServer = this.dataset.server === "1";
        if (isServer) {
          // 服务端存档：跳转到续玩模式（game.js 会从服务端恢复）
          window.location.href = "game.html?story_id=" + encodeURIComponent(id) + "&resume=1";
        } else {
          window.location.href = "game.html?story=" + encodeURIComponent(id) + "&readonly=1";
        }
      });
    }

    // 绑定删除事件（仅本地存档）
    var deleteBtns = storyList.querySelectorAll(".story-card-delete");
    for (var k = 0; k < deleteBtns.length; k++) {
      deleteBtns[k].addEventListener("click", function (e) {
        e.stopPropagation();
        var id = this.dataset.delete;
        deleteStory(id);
        loadAndRenderStories();
        showToast("故事已删除");
      });
    }
  }

  /**
   * 从服务端加载存档列表（优先），降级到本地存档
   */
  function loadAndRenderStories() {
    var settings = getSettings();
    var hasKey = settings.apiKeys.qwen || settings.apiKeys.zhipu;
    if (!hasKey) {
      renderStories(getStories());
      return;
    }

    fetch(API_BASE + "/stories", {
      headers: { "X-Anon-Token": getAnonToken() },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("服务端请求失败");
        return res.json();
      })
      .then(function (data) {
        var serverStories = (data && data.stories) || [];
        if (serverStories.length > 0) {
          renderStories(serverStories);
        } else {
          // 服务端无数据时降级到本地
          renderStories(getStories());
        }
      })
      .catch(function () {
        renderStories(getStories());
      });
  }

  // ===== 检查未完成故事 =====

  function checkCurrentStory() {
    var current = getCurrentStory();
    if (current && !current.isEnding) {
      continueBtn.style.display = "flex";
    } else {
      continueBtn.style.display = "none";
    }
  }

  // ===== 初始化 =====

  checkApiKey();
  checkCurrentStory();
  loadAndRenderStories();
  renderCharProfile();
})();
