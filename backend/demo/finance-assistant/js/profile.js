(function () {
  var profileName = document.getElementById("profileName");
  var profileAge = document.getElementById("profileAge");
  var profileGender = document.getElementById("profileGender");
  var profileHobbies = document.getElementById("profileHobbies");
  var profileBio = document.getElementById("profileBio");
  var apiKeyQwen = document.getElementById("apiKeyQwen");
  var apiKeyZhipu = document.getElementById("apiKeyZhipu");
  var modelGroup = document.getElementById("modelGroup");
  var saveBtn = document.getElementById("saveBtn");
  var clearChatBtn = document.getElementById("clearChatBtn");
  var toastEl = document.getElementById("toast");

  var currentModel = DEFAULT_MODEL;

  function init() {
    loadProfile();
    loadSettings();
    renderModelOptions();
    saveBtn.addEventListener("click", save);
    clearChatBtn.addEventListener("click", confirmClearChat);
  }

  // ===== Toast =====
  var toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2500);
  }

  // ===== 加载数据 =====
  function loadProfile() {
    var p = getProfile();
    profileName.value = p.name || "";
    profileAge.value = p.age || "";
    profileGender.value = p.gender || "";
    profileHobbies.value = p.hobbies || "";
    profileBio.value = p.bio || "";
  }

  function loadSettings() {
    var s = getSettings();
    currentModel = s.model || DEFAULT_MODEL;
    apiKeyQwen.value = s.apiKeys.qwen || "";
    apiKeyZhipu.value = s.apiKeys.zhipu || "";
  }

  // ===== 模型选择 =====
  function renderModelOptions() {
    modelGroup.innerHTML = "";
    var ids = Object.keys(MODEL_CONFIG);

    ids.forEach(function (id) {
      var config = MODEL_CONFIG[id];
      var div = document.createElement("div");
      div.className = "model-option" + (id === currentModel ? " active" : "");
      div.innerHTML =
        '<span class="model-radio"></span>' +
        '<span class="model-name">' + escapeHtml(config.label) + "</span>" +
        '<span class="model-provider">' + escapeHtml(config.provider) + "</span>";

      div.addEventListener("click", function () {
        currentModel = id;
        renderModelOptions();
      });

      modelGroup.appendChild(div);
    });
  }

  // ===== 保存 =====
  function save() {
    saveProfile({
      name: profileName.value.trim(),
      age: profileAge.value.trim(),
      gender: profileGender.value.trim(),
      hobbies: profileHobbies.value.trim(),
      bio: profileBio.value.trim(),
    });

    saveSettings({
      model: currentModel,
      apiKeys: {
        qwen: apiKeyQwen.value.trim(),
        zhipu: apiKeyZhipu.value.trim(),
      },
    });

    showToast("设置已保存");
  }

  // ===== 清除聊天记录 =====
  function confirmClearChat() {
    if (confirm("确定要清除所有聊天记录吗？此操作不可撤销。")) {
      clearChatHistory();
      showToast("聊天记录已清除");
    }
  }

  init();
})();
