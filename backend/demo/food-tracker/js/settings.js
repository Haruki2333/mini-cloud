(function () {
  var settings = getSettings();

  // 渲染模型选择
  var currentModel = settings.model || DEFAULT_MODEL;
  var modelSwitch = document.getElementById("modelSwitch");
  Object.keys(MODEL_CONFIG).forEach(function (id) {
    var btn = document.createElement("button");
    btn.className = "tier-btn" + (id === currentModel ? " active" : "");
    btn.setAttribute("data-model", id);
    btn.textContent = MODEL_CONFIG[id].label;
    btn.addEventListener("click", function () {
      currentModel = id;
      setModel(id);
      modelSwitch.querySelectorAll(".tier-btn").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-model") === id);
      });
    });
    modelSwitch.appendChild(btn);
  });

  document.getElementById("zhipuKey").value = settings.apiKeys.zhipu || "";
  document.getElementById("qwenKey").value = settings.apiKeys.qwen || "";

  var saveBtn = document.getElementById("saveBtn");

  saveBtn.addEventListener("click", function () {
    settings.apiKeys.zhipu = document.getElementById("zhipuKey").value;
    settings.apiKeys.qwen = document.getElementById("qwenKey").value;
    saveSettings(settings);

    saveBtn.querySelector(".action-cmd").textContent = "SAVED";
    saveBtn.querySelector(".action-label").textContent = "已保存 \u2713";
    setTimeout(function () {
      saveBtn.querySelector(".action-cmd").textContent = "SAVE_CONFIG";
      saveBtn.querySelector(".action-label").textContent = "保存设置";
    }, 2000);
  });
})();
