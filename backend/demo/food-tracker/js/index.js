(function () {
  var currentTier = getSettings().tier;

  function renderTierSwitch() {
    var container = document.getElementById("tierSwitch");
    var html = "";
    [1, 2, 3].forEach(function (t) {
      var active = t === currentTier ? " active" : "";
      html +=
        '<button class="tier-btn' +
        active +
        '" data-tier="' +
        t +
        '">' +
        escapeHtml(TIER_CONFIG[t].label) +
        "</button>";
    });
    container.innerHTML = html;

    container.querySelectorAll(".tier-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentTier = Number(btn.getAttribute("data-tier"));
        setTier(currentTier);
        renderTierSwitch();
      });
    });
  }

  function renderFoodCard(record) {
    var dateStr = formatDate(record.createdAt);
    var ingredientTags = (record.ingredients || [])
      .slice(0, 4)
      .map(function (ing) {
        return '<span class="tag ingredient">' + escapeHtml(ing) + "</span>";
      })
      .join("");
    var tagHtml = (record.tags || [])
      .slice(0, 2)
      .map(function (t) {
        return '<span class="tag">' + escapeHtml(t) + "</span>";
      })
      .join("");
    var tierConfig = TIER_CONFIG[record.tier] || TIER_CONFIG[1];

    return (
      '<div class="food-card" data-id="' +
      escapeHtml(record.id) +
      '">' +
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
      tagHtml +
      "</div>" +
      '<div class="food-card-meta">' +
      "<span>" +
      escapeHtml(dateStr) +
      "</span>" +
      '<span class="tier-badge" data-tier="' +
      record.tier +
      '">' +
      escapeHtml(tierConfig.label) +
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
        '<div class="empty-state">' +
        '<span class="empty-icon">&#127869;</span>' +
        '<p class="empty-text">还没有记录</p>' +
        '<p class="empty-hint">点击下方按钮记录你的第一道菜</p>' +
        "</div>";
      return;
    }

    container.innerHTML = records.map(renderFoodCard).join("");

    container.querySelectorAll(".food-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var id = card.getAttribute("data-id");
        location.href = "detail.html?id=" + encodeURIComponent(id);
      });
    });
  }

  renderTierSwitch();
  renderRecords();
})();
