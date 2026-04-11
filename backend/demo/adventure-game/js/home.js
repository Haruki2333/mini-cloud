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
})();
