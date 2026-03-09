(function () {
  var settings = getSettings();

  document.getElementById("zhipuKey").value = settings.apiKeys.zhipu || "";
  document.getElementById("geminiKey").value = settings.apiKeys.gemini || "";
  document.getElementById("openaiKey").value = settings.apiKeys.openai || "";

  var saveBtn = document.getElementById("saveBtn");

  saveBtn.addEventListener("click", function () {
    settings.apiKeys.zhipu = document.getElementById("zhipuKey").value;
    settings.apiKeys.gemini = document.getElementById("geminiKey").value;
    settings.apiKeys.openai = document.getElementById("openaiKey").value;
    saveSettings(settings);

    saveBtn.textContent = "已保存 \u2713";
    setTimeout(function () {
      saveBtn.textContent = "保存设置";
    }, 2000);
  });
})();
