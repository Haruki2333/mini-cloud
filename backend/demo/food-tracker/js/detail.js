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
      '<div class="detail-section">' +
      '<h2 class="detail-section-title">食材</h2>' +
      '<div class="food-card-tags">' +
      record.ingredients
        .map(function (ing) {
          return '<span class="tag ingredient">' + escapeHtml(ing) + "</span>";
        })
        .join("") +
      "</div>" +
      "</div>";
  }

  var cookingHtml = "";
  if (record.cookingMethod) {
    cookingHtml =
      '<div class="detail-section">' +
      '<h2 class="detail-section-title">烹饪方式</h2>' +
      "<p>" +
      escapeHtml(record.cookingMethod) +
      "</p>" +
      "</div>";
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
      '<div class="detail-section">' +
      '<h2 class="detail-section-title">营养成分</h2>' +
      '<div class="nutrition-grid">' +
      items.map(function (item) {
        var val = item.value != null ? item.value : "-";
        return '<div class="nutrition-item">' +
          '<div class="nutrition-value">' + escapeHtml(String(val)) + '<span class="nutrition-unit">' + escapeHtml(item.unit) + '</span></div>' +
          '<div class="nutrition-label">' + escapeHtml(item.label) + '</div>' +
          '</div>';
      }).join("") +
      "</div>" +
      "</div>";
  }

  container.innerHTML =
    '<img class="detail-image" src="' +
    escapeHtml(record.imageBase64) +
    '" alt="' +
    escapeHtml(record.name) +
    '">' +
    '<div class="detail-content">' +
    '<h1 class="detail-name">' +
    escapeHtml(record.name) +
    "</h1>" +
    '<p class="detail-time">' +
    escapeHtml(dateStr) +
    '&emsp;&middot; <span class="tier-badge">' +
    escapeHtml(modelLabel) +
    "</span>" +
    "</p>" +
    ingredientsHtml +
    cookingHtml +
    nutritionHtml +
    '<div style="margin-top:24px">' +
    '<button class="btn btn-danger" id="deleteBtn">删除记录</button>' +
    "</div>" +
    "</div>";

  document.getElementById("deleteBtn").addEventListener("click", function () {
    if (confirm("确定要删除这条记录吗？")) {
      deleteRecord(record.id);
      location.href = "index.html";
    }
  });

  function showEmpty() {
    container.innerHTML =
      '<main class="content">' +
      '<div class="empty-state">' +
      '<span class="empty-icon">&#128269;</span>' +
      '<p class="empty-text">记录不存在</p>' +
      "</div>" +
      "</main>";
  }
})();
