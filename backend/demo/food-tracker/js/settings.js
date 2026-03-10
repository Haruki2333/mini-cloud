(function () {
  var settings = getSettings();

  document.getElementById("zhipuKey").value = settings.apiKeys.zhipu || "";
  document.getElementById("qwenKey").value = settings.apiKeys.qwen || "";

  var saveBtn = document.getElementById("saveBtn");

  saveBtn.addEventListener("click", function () {
    settings.apiKeys.zhipu = document.getElementById("zhipuKey").value;
    settings.apiKeys.qwen = document.getElementById("qwenKey").value;
    // 清理旧厂商的 Key
    delete settings.apiKeys.gemini;
    delete settings.apiKeys.openai;
    saveSettings(settings);

    saveBtn.textContent = "已保存 \u2713";
    setTimeout(function () {
      saveBtn.textContent = "保存设置";
    }, 2000);
  });
})();
