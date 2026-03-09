(function () {
  var imageBase64 = null;
  var aiDescription = "";
  var ingredientsInput = createTagInput("ingredientsContainer", "输入食材后按回车");
  var tagsInput = createTagInput("tagsContainer", "输入标签后按回车");

  // 图片上传
  var uploadArea = document.getElementById("uploadArea");
  var fileInput = document.getElementById("fileInput");

  uploadArea.addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

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
        imageBase64 = base64;

        // 更新 UI
        uploadArea.classList.add("has-image");
        uploadArea.innerHTML =
          '<input type="file" accept="image/*" capture="environment" id="fileInput" style="display:none">' +
          '<img src="' + escapeHtml(base64) + '" alt="已选择的食物照片">';
        // 重新绑定 fileInput
        var newFileInput = document.getElementById("fileInput");
        newFileInput.addEventListener("change", arguments.callee);

        updateSaveBtn();
        recognizeFood(base64);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // AI 识别
  function recognizeFood(base64) {
    var settings = getSettings();
    var currentTier = settings.tier;
    var config = TIER_CONFIG[currentTier];
    var apiKey = settings.apiKeys[config.provider];

    if (!apiKey) {
      showAiStatus(
        "error",
        "&#10007; 请先在设置页面配置 " + escapeHtml(config.label) + " 的 API Key"
      );
      return;
    }

    showAiStatus(
      "loading",
      '<span class="ai-spinner"></span> AI 识别中...（' +
        escapeHtml(config.label) +
        "）"
    );

    fetch("/api/food/recognize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ imageBase64: base64, tier: currentTier }),
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
        document.getElementById("nameInput").value = data.name || "";
        ingredientsInput.setTags(data.ingredients || []);
        document.getElementById("cookingMethodInput").value =
          data.cookingMethod || "";
        tagsInput.setTags(data.tags || []);
        aiDescription = data.description || "";

        if (aiDescription) {
          document.getElementById("descriptionGroup").style.display = "";
          document.getElementById("descriptionText").textContent =
            aiDescription;
        }

        showAiStatus("success", "&#10003; AI 识别完成，可手动修改");
        updateSaveBtn();
      })
      .catch(function (err) {
        showAiStatus(
          "error",
          "&#10007; " + escapeHtml(err.message || "识别失败，请重试")
        );
      });
  }

  function showAiStatus(type, html) {
    var el = document.getElementById("aiStatus");
    el.style.display = "";
    el.className = "ai-status " + type;
    el.innerHTML = html;
  }

  // 保存
  var saveBtn = document.getElementById("saveBtn");
  saveBtn.addEventListener("click", function () {
    var name = document.getElementById("nameInput").value.trim();
    if (!imageBase64 || !name) return;

    saveBtn.disabled = true;
    saveBtn.textContent = "保存中...";

    saveRecord({
      id: generateId(),
      imageBase64: imageBase64,
      name: name,
      ingredients: ingredientsInput.getTags(),
      cookingMethod: document.getElementById("cookingMethodInput").value.trim(),
      tags: tagsInput.getTags(),
      aiDescription: aiDescription,
      tier: getSettings().tier,
      createdAt: new Date().toISOString(),
    });

    location.href = "index.html";
  });

  function updateSaveBtn() {
    var name = document.getElementById("nameInput").value.trim();
    saveBtn.disabled = !imageBase64 || !name;
  }

  document.getElementById("nameInput").addEventListener("input", updateSaveBtn);

  // TagInput 组件
  function createTagInput(containerId, placeholder) {
    var container = document.getElementById(containerId);
    var tags = [];

    var input = document.createElement("input");
    input.className = "tag-input-field";
    input.placeholder = placeholder;
    container.appendChild(input);

    container.addEventListener("click", function () {
      input.focus();
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && input.value.trim()) {
        e.preventDefault();
        var newTag = input.value.trim();
        if (tags.indexOf(newTag) === -1) {
          tags.push(newTag);
          render();
        }
        input.value = "";
      } else if (e.key === "Backspace" && !input.value && tags.length > 0) {
        tags.pop();
        render();
      }
    });

    function render() {
      // 清除旧 tag（保留 input）
      var children = Array.prototype.slice.call(container.children);
      children.forEach(function (child) {
        if (child !== input) container.removeChild(child);
      });
      // 重新插入 tag
      tags.forEach(function (tag, i) {
        var span = document.createElement("span");
        span.className = "tag-removable";
        span.innerHTML =
          escapeHtml(tag) +
          '<button class="tag-remove-btn" data-index="' +
          i +
          '">&times;</button>';
        container.insertBefore(span, input);
      });
      input.placeholder = tags.length === 0 ? placeholder : "";

      container.querySelectorAll(".tag-remove-btn").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var idx = Number(btn.getAttribute("data-index"));
          tags.splice(idx, 1);
          render();
        });
      });
    }

    return {
      getTags: function () {
        return tags.slice();
      },
      setTags: function (newTags) {
        tags = newTags.slice();
        render();
      },
    };
  }
})();
