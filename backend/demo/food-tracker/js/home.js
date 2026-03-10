(function () {
  // 问候语列表
  var greetings = [
    "你好！我是小当家，来看看今天吃了什么好吃的吧！",
    "嘿！把你的美食拍给我看看吧！",
    "民以食为天！快来记录今天的美味吧！",
    "料理是带给人幸福的东西！来，拍一张吧！",
    "欢迎回来！今天想记录什么美食呢？",
  ];

  var speechBubble = document.getElementById("speechBubble");
  var cameraBtn = document.getElementById("cameraBtn");
  var actionSheet = document.getElementById("actionSheet");
  var takePhotoBtn = document.getElementById("takePhotoBtn");
  var choosePhotoBtn = document.getElementById("choosePhotoBtn");
  var cancelBtn = document.getElementById("cancelBtn");
  var cameraInput = document.getElementById("cameraInput");
  var albumInput = document.getElementById("albumInput");
  var loadingOverlay = document.getElementById("loadingOverlay");

  // 逐字打出问候语
  var greeting = greetings[Math.floor(Math.random() * greetings.length)];
  var charIndex = 0;
  var typingTimer = setInterval(function () {
    if (charIndex < greeting.length) {
      speechBubble.textContent += greeting[charIndex];
      charIndex++;
    } else {
      clearInterval(typingTimer);
    }
  }, 80);

  // Action Sheet 显示/隐藏
  function showActionSheet() {
    actionSheet.classList.add("visible");
  }

  function hideActionSheet() {
    actionSheet.classList.remove("visible");
  }

  cameraBtn.addEventListener("click", showActionSheet);
  cancelBtn.addEventListener("click", hideActionSheet);

  // 点击遮罩关闭
  actionSheet.addEventListener("click", function (e) {
    if (e.target === actionSheet) {
      hideActionSheet();
    }
  });

  // 拍照
  takePhotoBtn.addEventListener("click", function () {
    hideActionSheet();
    cameraInput.click();
  });

  // 从相册选择
  choosePhotoBtn.addEventListener("click", function () {
    hideActionSheet();
    albumInput.click();
  });

  // 统一处理图片选择
  function handleFileSelect(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    compressAndRecognize(file);
    // 清空 input 以便重复选择同一文件
    e.target.value = "";
  }

  cameraInput.addEventListener("change", handleFileSelect);
  albumInput.addEventListener("change", handleFileSelect);

  // 图片压缩 + AI 识别
  function compressAndRecognize(file) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        var maxSize = 800;
        var width = img.width;
        var height = img.height;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        var base64 = canvas.toDataURL("image/jpeg", 0.8);

        recognizeFood(base64);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // 调用 AI 识别 API
  function recognizeFood(base64) {
    var settings = getSettings();
    var currentModel = settings.model || DEFAULT_MODEL;
    var config = MODEL_CONFIG[currentModel];

    if (!config) {
      showError("不支持的模型，请在设置中切换");
      return;
    }

    var apiKey = settings.apiKeys[config.provider];

    if (!apiKey) {
      showError("请先在设置页面配置 " + config.label + " 的 API Key");
      return;
    }

    // 显示 loading
    loadingOverlay.classList.add("visible");

    fetch("/api/food/recognize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ imageBase64: base64, model: currentModel }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.error || "识别失败");
          });
        }
        return res.json();
      })
      .then(function (data) {
        // 组装记录并保存
        var record = {
          id: generateId(),
          imageBase64: base64,
          name: data.name || "未知菜品",
          ingredients: data.ingredients || [],
          cookingMethod: data.cookingMethod || "",
          tags: data.tags || [],
          aiDescription: data.description || "",
          model: currentModel,
          createdAt: new Date().toISOString(),
        };

        saveRecord(record);

        // 跳转到详情页
        location.href = "detail.html?id=" + record.id;
      })
      .catch(function (err) {
        loadingOverlay.classList.remove("visible");
        showError(err.message || "识别失败，请重试");
      });
  }

  // 在对话气泡中显示错误
  function showError(msg) {
    speechBubble.textContent = "哎呀！" + msg;
    speechBubble.style.color = "var(--danger)";

    // 3 秒后恢复
    setTimeout(function () {
      speechBubble.style.color = "";
      speechBubble.textContent = "";
      charIndex = 0;
      var restoreGreeting = "没关系，再试一次吧！";
      var restoreTimer = setInterval(function () {
        if (charIndex < restoreGreeting.length) {
          speechBubble.textContent += restoreGreeting[charIndex];
          charIndex++;
        } else {
          clearInterval(restoreTimer);
        }
      }, 80);
    }, 3000);
  }
})();
