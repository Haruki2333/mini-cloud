(function () {
  function getModelLabel(record) {
    if (record.model && MODEL_CONFIG[record.model]) {
      return MODEL_CONFIG[record.model].label;
    }
    return "未知";
  }

  function renderFoodCard(record) {
    var dateStr = formatDate(record.createdAt);
    var ingredientTags = (record.ingredients || [])
      .slice(0, 4)
      .map(function (ing) {
        return '<span class="tag ingredient">' + escapeHtml(ing) + "</span>";
      })
      .join("");
    var caloriesHtml = "";
    if (record.nutrition && record.nutrition.calories) {
      caloriesHtml = '<span class="tag tag-warning">' + escapeHtml(String(record.nutrition.calories)) + ' kcal</span>';
    }
    var modelLabel = getModelLabel(record);

    return (
      '<div class="terminal-card" data-id="' +
      escapeHtml(record.id) +
      '">' +
      '<div class="terminal-card-header">' +
      '<span class="terminal-dot"></span>' +
      '<span class="terminal-label">FOOD_RECORD</span>' +
      '<span class="terminal-freq">' + escapeHtml(dateStr) + '</span>' +
      '</div>' +
      '<img class="food-card-image" src="' +
      escapeHtml(record.imageBase64) +
      '" alt="' +
      escapeHtml(record.name) +
      '">' +
      '<div class="food-card-body">' +
      '<div class="food-card-name">' +
      escapeHtml(record.name) +
      "</div>" +
      '<div class="food-card-tags">' +
      ingredientTags +
      caloriesHtml +
      "</div>" +
      '<div class="food-card-meta">' +
      "<span>" +
      '<span class="terminal-meta-label">MODEL:</span>' +
      escapeHtml(modelLabel) +
      "</span>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderRecords() {
    var container = document.getElementById("recordList");
    var records = getRecords();

    if (records.length === 0) {
      container.innerHTML =
        '<div class="terminal-panel">' +
        '<div class="terminal-panel-header"><span class="terminal-dot"></span>NO_DATA</div>' +
        '<div class="terminal-panel-body" style="text-align:center;padding:48px 16px;color:var(--color-text-muted)">' +
        '<p style="font-family:var(--font-display);font-size:var(--font-size-xs);letter-spacing:0.05em;margin-bottom:8px">&gt; NO_RECORDS_FOUND</p>' +
        '<p style="font-size:var(--font-size-sm)">点击下方按钮记录你的第一道菜</p>' +
        '</div></div>';
      return;
    }

    container.innerHTML = records.map(renderFoodCard).join("");

    container.querySelectorAll(".terminal-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var id = card.getAttribute("data-id");
        location.href = "detail.html?id=" + encodeURIComponent(id);
      });
    });
  }

  renderRecords();
})();
