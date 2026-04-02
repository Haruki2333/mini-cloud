(function () {
  var profileName = document.getElementById("profileName");
  var apiKeyQwen = document.getElementById("apiKeyQwen");
  var apiKeyZhipu = document.getElementById("apiKeyZhipu");
  var modelGroup = document.getElementById("modelGroup");
  var saveBtn = document.getElementById("saveBtn");
  var clearChatBtn = document.getElementById("clearChatBtn");
  var toastEl = document.getElementById("toast");
  var categoryTags = document.getElementById("categoryTags");
  var categoryInput = document.getElementById("categoryInput");
  var categoryAddBtn = document.getElementById("categoryAddBtn");

  var monthlyBudget = document.getElementById("monthlyBudget");
  var currentModel = DEFAULT_MODEL;
  var currentCategories = [];

  function init() {
    loadProfile();
    loadSettings();
    renderModelOptions();
    loadMonthlyBudget();
    loadCategories();
    saveBtn.addEventListener("click", save);
    clearChatBtn.addEventListener("click", confirmClearChat);
    categoryAddBtn.addEventListener("click", addCategory);
    categoryInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); addCategory(); }
    });
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

  // ===== 支出分类 =====
  function loadCategories() {
    currentCategories = getExpenseCategories();
    renderCategories();
  }

  function renderCategories() {
    categoryTags.innerHTML = "";
    currentCategories.forEach(function (cat, idx) {
      var tag = document.createElement("span");
      tag.className = "category-tag";
      tag.innerHTML =
        escapeHtml(cat) +
        '<button class="category-tag-remove" data-idx="' + idx + '" aria-label="删除">×</button>';
      tag.querySelector(".category-tag-remove").addEventListener("click", function () {
        removeCategory(parseInt(this.getAttribute("data-idx")));
      });
      categoryTags.appendChild(tag);
    });

    var atLimit = currentCategories.length >= MAX_CATEGORIES;
    categoryInput.disabled = atLimit;
    categoryAddBtn.disabled = atLimit;
    categoryInput.placeholder = atLimit ? "已达上限 " + MAX_CATEGORIES + " 项" : "新分类名称";
  }

  function addCategory() {
    var name = categoryInput.value.trim();
    if (!name) return;
    if (currentCategories.length >= MAX_CATEGORIES) {
      showToast("最多只能添加 " + MAX_CATEGORIES + " 个分类");
      return;
    }
    if (currentCategories.indexOf(name) !== -1) {
      showToast("该分类已存在");
      return;
    }
    currentCategories.push(name);
    categoryInput.value = "";
    renderCategories();
  }

  function removeCategory(idx) {
    currentCategories.splice(idx, 1);
    renderCategories();
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
    saveExpenseCategories(currentCategories);

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
