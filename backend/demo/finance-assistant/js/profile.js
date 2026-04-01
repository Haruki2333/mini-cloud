(function () {
  var profileName = document.getElementById("profileName");
  var apiKeyQwen = document.getElementById("apiKeyQwen");
  var apiKeyZhipu = document.getElementById("apiKeyZhipu");
  var modelGroup = document.getElementById("modelGroup");
  var saveBtn = document.getElementById("saveBtn");
  var clearChatBtn = document.getElementById("clearChatBtn");
  var toastEl = document.getElementById("toast");

  var monthlyBudget = document.getElementById("monthlyBudget");
  var currentModel = DEFAULT_MODEL;

  function init() {
    loadProfile();
    loadSettings();
    renderModelOptions();
    loadMonthlyBudget();
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

  // ===== 月预算 =====
  function loadMonthlyBudget() {
    var budgets = getAllRecords().budget || [];
    var entry = null;
    for (var i = 0; i < budgets.length; i++) {
      if (budgets[i].id === "monthly") { entry = budgets[i]; break; }
    }
    monthlyBudget.value = entry ? entry.amount : "";
  }

  function saveMonthlyBudget() {
    var amount = parseFloat(monthlyBudget.value);
    var all = getAllRecords();
    if (!amount || amount <= 0) {
      all.budget = [];
    } else {
      all.budget = [{
        id: "monthly",
        type: "budget",
        category: "月预算",
        amount: amount,
        period: "月",
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
      }];
    }
    saveAllRecords(all);
  }

  // ===== 保存 =====
  function save() {
    saveProfile({
      name: profileName.value.trim(),
    });

    saveSettings({
      model: currentModel,
      apiKeys: {
        qwen: apiKeyQwen.value.trim(),
        zhipu: apiKeyZhipu.value.trim(),
      },
    });

    saveMonthlyBudget();

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
