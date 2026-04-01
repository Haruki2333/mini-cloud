(function () {
  var profileName = document.getElementById("profileName");
  var apiKeyQwen = document.getElementById("apiKeyQwen");
  var apiKeyZhipu = document.getElementById("apiKeyZhipu");
  var modelGroup = document.getElementById("modelGroup");
  var saveBtn = document.getElementById("saveBtn");
  var clearChatBtn = document.getElementById("clearChatBtn");
  var budgetList = document.getElementById("budgetList");
  var budgetCategory = document.getElementById("budgetCategory");
  var budgetAmount = document.getElementById("budgetAmount");
  var budgetPeriod = document.getElementById("budgetPeriod");
  var addBudgetBtn = document.getElementById("addBudgetBtn");
  var toastEl = document.getElementById("toast");

  var currentModel = DEFAULT_MODEL;

  function init() {
    loadProfile();
    loadSettings();
    renderModelOptions();
    renderBudgetList();
    saveBtn.addEventListener("click", save);
    clearChatBtn.addEventListener("click", confirmClearChat);
    addBudgetBtn.addEventListener("click", addBudget);
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

  // ===== 预算管理 =====
  function renderBudgetList() {
    var budgets = getAllRecords().budget || [];
    budgetList.innerHTML = "";

    if (budgets.length === 0) {
      var empty = document.createElement("div");
      empty.style.cssText = "color:var(--color-text-muted);font-size:var(--font-size-sm);padding:8px 0;";
      empty.textContent = "暂无预算设置";
      budgetList.appendChild(empty);
      return;
    }

    budgets.forEach(function (b) {
      var item = document.createElement("div");
      item.className = "record-item";

      var desc = document.createElement("span");
      desc.className = "record-desc";
      desc.textContent = escapeHtml(b.category);

      var tag = document.createElement("span");
      tag.className = "record-tag";
      tag.textContent = b.period;

      var amount = document.createElement("span");
      amount.className = "record-amount";
      amount.textContent = "¥" + b.amount;

      var del = document.createElement("button");
      del.style.cssText =
        "background:none;border:none;cursor:pointer;color:var(--color-danger);font-size:16px;padding:0 4px;line-height:1;";
      del.textContent = "×";
      del.title = "删除";
      del.addEventListener("click", (function (id) {
        return function () { deleteBudget(id); };
      })(b.id));

      item.appendChild(desc);
      item.appendChild(tag);
      item.appendChild(amount);
      item.appendChild(del);
      budgetList.appendChild(item);
    });
  }

  function addBudget() {
    var category = budgetCategory.value.trim();
    var amount = parseFloat(budgetAmount.value);
    var period = budgetPeriod.value;

    if (!category) {
      showToast("请填写预算分类");
      budgetCategory.focus();
      return;
    }
    if (!amount || amount <= 0) {
      showToast("请填写有效金额");
      budgetAmount.focus();
      return;
    }

    var now = new Date();
    var dateStr = now.toISOString().slice(0, 10);
    var id = "budget-" + now.getTime() + "-" + Math.random().toString(36).slice(2, 7);

    addRecord("budget", {
      id: id,
      type: "budget",
      category: category,
      amount: amount,
      period: period,
      date: dateStr,
      createdAt: now.toISOString(),
    });

    budgetCategory.value = "";
    budgetAmount.value = "";
    budgetPeriod.value = "月";
    renderBudgetList();
    showToast("预算已添加");
  }

  function deleteBudget(id) {
    deleteRecord("budget", id);
    renderBudgetList();
    showToast("预算已删除");
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
