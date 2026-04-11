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
  var wizardPrev = document.getElementById("wizardPrev");
  var wizardNext = document.getElementById("wizardNext");

  var currentWizardStep = 1;
  var totalWizardSteps = 4;
  // 向导临时存储（保存中间选择，关闭弹层时丢弃）
  var wizardDraft = { name: "", genre: "", roleType: "", tone: "" };

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
    charProfileName.textContent = profile.name;
    var tags = [profile.genre, profile.roleType, profile.tone].filter(Boolean);
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
      genre: existing.genre || "",
      roleType: existing.roleType || "",
      tone: existing.tone || "",
    };
    charNameInput.value = wizardDraft.name;

    // 恢复选中状态
    setGridSelection("genreGrid", wizardDraft.genre);
    setGridSelection("roleGrid", wizardDraft.roleType);
    setGridSelection("toneGrid", wizardDraft.tone);

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

  function getGridSelection(gridId) {
    var grid = document.getElementById(gridId);
    if (!grid) return "";
    var selected = grid.querySelector(".option-item.selected");
    return selected ? selected.dataset.value : "";
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
      wizardDraft.name = name;
    } else if (currentWizardStep === 2) {
      var genre = getGridSelection("genreGrid");
      if (!genre) {
        showToast("请选择一种故事风格");
        return;
      }
      wizardDraft.genre = genre;
    } else if (currentWizardStep === 3) {
      var roleType = getGridSelection("roleGrid");
      if (!roleType) {
        showToast("请选择角色类型");
        return;
      }
      wizardDraft.roleType = roleType;
    } else if (currentWizardStep === 4) {
      var tone = getGridSelection("toneGrid");
      if (!tone) {
        showToast("请选择故事基调");
        return;
      }
      wizardDraft.tone = tone;
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

  charInitBtn.addEventListener("click", openCharWizard);
  charProfileEditBtn.addEventListener("click", openCharWizard);
  charBackdrop.addEventListener("click", closeCharWizard);
  charClose.addEventListener("click", closeCharWizard);
  wizardNext.addEventListener("click", handleWizardNext);
  wizardPrev.addEventListener("click", handleWizardPrev);

  bindOptionGrid("genreGrid");
  bindOptionGrid("roleGrid");
  bindOptionGrid("toneGrid");

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

  function renderStories() {
    var stories = getStories();
    if (stories.length === 0) {
      storyList.innerHTML = '<div class="empty-text">&gt; 暂无历史故事</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < stories.length; i++) {
      var s = stories[i];
      var sceneCount = s.scenes ? s.scenes.length : 0;
      html +=
        '<div class="story-card" data-id="' +
        s.id +
        '">' +
        '<div class="story-card-body">' +
        '<div class="story-card-title">' +
        escapeHtml(s.title || "未命名的冒险") +
        "</div>" +
        '<div class="story-card-meta">' +
        '<span class="story-card-tag">' +
        escapeHtml(s.worldSetting || "未知世界") +
        "</span>" +
        "<span>" +
        sceneCount +
        " 个场景</span>" +
        "<span>" +
        formatDate(s.startTime) +
        "</span>" +
        "</div>" +
        "</div>" +
        '<button class="story-card-delete" data-delete="' +
        s.id +
        '" title="删除">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="3 6 5 6 21 6"/>' +
        '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
        "</svg>" +
        "</button>" +
        "</div>";
    }
    storyList.innerHTML = html;

    // 绑定点击事件
    var cards = storyList.querySelectorAll(".story-card");
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener("click", function (e) {
        // 如果点击的是删除按钮，不跳转
        if (e.target.closest(".story-card-delete")) return;
        var id = this.dataset.id;
        window.location.href = "game.html?story=" + id + "&readonly=1";
      });
    }

    // 绑定删除事件
    var deleteBtns = storyList.querySelectorAll(".story-card-delete");
    for (var k = 0; k < deleteBtns.length; k++) {
      deleteBtns[k].addEventListener("click", function (e) {
        e.stopPropagation();
        var id = this.dataset.delete;
        deleteStory(id);
        renderStories();
        showToast("故事已删除");
      });
    }
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
  renderStories();
  renderCharProfile();
})();
