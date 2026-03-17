(function () {
  var params = new URLSearchParams(location.search);
  var id = params.get("id");
  var container = document.getElementById("detailContent");

  if (!id) {
    showEmpty();
    return;
  }

  var record = getRecordById(id);
  if (!record) {
    showEmpty();
    return;
  }

  var dateStr = formatDate(record.createdAt);

  // 拍摄时间展示
  var photoTimeStr = "";
  if (record.photoTime) {
    var photoFormatted = formatDate(record.photoTime);
    if (photoFormatted !== dateStr) {
      photoTimeStr = "拍摄于 " + photoFormatted + " · 记录于 " + dateStr;
    } else {
      photoTimeStr = dateStr;
    }
  } else {
    photoTimeStr = dateStr;
  }

  // 位置信息展示
  var locationStr = "";
  if (record.location) {
    if (record.location.address) {
      locationStr = record.location.address;
    } else if (record.location.lat != null && record.location.lng != null) {
      locationStr = record.location.lat.toFixed(4) + ", " + record.location.lng.toFixed(4);
    }
  }

  // 模型标签（向后兼容旧 tier 记录）
  var modelLabel = "";
  if (record.model && MODEL_CONFIG[record.model]) {
    modelLabel = MODEL_CONFIG[record.model].label;
  } else {
    modelLabel = "未知";
  }

  var ingredientsHtml = "";
  if (record.ingredients && record.ingredients.length > 0) {
    ingredientsHtml =
      '<div class="terminal-panel">' +
      '<div class="terminal-panel-header"><span class="terminal-dot"></span>INGREDIENTS</div>' +
      '<div class="terminal-panel-body">' +
      '<div class="food-card-tags">' +
      record.ingredients
        .map(function (ing) {
          return '<span class="tag ingredient">' + escapeHtml(ing) + "</span>";
        })
        .join("") +
      "</div>" +
      "</div></div>";
  }

  var cookingHtml = "";
  if (record.cookingMethod) {
    cookingHtml =
      '<div class="terminal-panel">' +
      '<div class="terminal-panel-header"><span class="terminal-dot"></span>COOKING_METHOD</div>' +
      '<div class="terminal-panel-body">' +
      "<p>" +
      escapeHtml(record.cookingMethod) +
      "</p>" +
      "</div></div>";
  }

  var nutritionHtml = "";
  if (record.nutrition && record.nutrition.calories) {
    var n = record.nutrition;
    var items = [
      { label: "热量", value: n.calories, unit: "kcal" },
      { label: "蛋白质", value: n.protein, unit: "g" },
      { label: "脂肪", value: n.fat, unit: "g" },
      { label: "碳水", value: n.carbs, unit: "g" },
      { label: "纤维", value: n.fiber, unit: "g" },
    ];
    nutritionHtml =
      '<div class="terminal-panel">' +
      '<div class="terminal-panel-header"><span class="terminal-dot"></span>NUTRITION_DATA</div>' +
      '<div class="terminal-panel-body">' +
      '<div class="nutrition-grid">' +
      items.map(function (item) {
        var val = item.value != null ? item.value : "-";
        return '<div class="nutrition-item">' +
          '<div class="nutrition-value">' + escapeHtml(String(val)) + '<span class="nutrition-unit">' + escapeHtml(item.unit) + '</span></div>' +
          '<div class="nutrition-label">' + escapeHtml(item.label) + '</div>' +
          '</div>';
      }).join("") +
      "</div>" +
      "</div></div>";
  }

  var isVoice = record.source === "voice";
  var sourceLabel = isVoice ? ' <span class="terminal-meta-label">SRC:</span>VOICE' : '';

  var topSection = "";
  if (record.imageBase64) {
    topSection =
      '<div class="terminal-image-wrap">' +
      '<img class="detail-image" src="' +
      escapeHtml(record.imageBase64) +
      '" alt="' +
      escapeHtml(record.name) +
      '">' +
      '<div class="terminal-image-scanline"></div>' +
      '</div>';
  } else if (isVoice && record.voiceText) {
    topSection =
      '<div class="terminal-panel">' +
      '<div class="terminal-panel-header"><span class="terminal-dot"></span>VOICE_TRANSCRIPT</div>' +
      '<div class="voice-text-display">' +
      escapeHtml(record.voiceText) +
      '</div></div>';
  }

  container.innerHTML =
    topSection +
    '<div class="terminal-panel">' +
    '<div class="terminal-panel-header"><span class="terminal-dot"></span>IDENTIFICATION</div>' +
    '<div class="terminal-panel-body">' +
    '<h1 class="detail-name">' +
    escapeHtml(record.name) +
    "</h1>" +
    '<p class="detail-time">' +
    escapeHtml(photoTimeStr) +
    '&emsp;&middot; <span class="terminal-meta-label">MODEL:</span>' +
    escapeHtml(modelLabel) +
    sourceLabel +
    "</p>" +
    (locationStr ? '<p class="detail-location"><span class="terminal-meta-label">LOC:</span> ' + escapeHtml(locationStr) + '</p>' : '') +
    "</div></div>" +
    ingredientsHtml +
    cookingHtml +
    nutritionHtml +
    '<button class="terminal-action-btn--danger" id="deleteBtn">' +
    '<span class="action-index">[!]</span>' +
    '<span class="action-content">' +
    '<span class="action-cmd">DELETE_RECORD</span>' +
    '<span class="action-label">删除此记录</span>' +
    '</span>' +
    '</button>';

  document.getElementById("deleteBtn").addEventListener("click", function () {
    if (confirm("确定要删除这条记录吗？")) {
      deleteRecord(record.id);
      location.href = "index.html";
    }
  });

  function showEmpty() {
    container.innerHTML =
      '<div class="terminal-panel" style="margin-top:var(--spacing-base)">' +
      '<div class="terminal-panel-header"><span class="terminal-dot"></span>ERROR</div>' +
      '<div class="terminal-panel-body" style="text-align:center;padding:48px 16px;color:var(--color-text-muted)">' +
      '<p style="font-family:var(--font-display);font-size:var(--font-size-xs);letter-spacing:0.05em;margin-bottom:8px">&gt; RECORD_NOT_FOUND</p>' +
      '<p style="font-size:var(--font-size-sm)">记录不存在</p>' +
      '</div></div>';
  }
})();
