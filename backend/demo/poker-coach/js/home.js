var hands = [];

async function loadHands() {
  var settings = getSettings();
  var apiKey = getApiKeyForModel(settings.model);

  if (!apiKey) {
    showToast("请先在设置页配置 API Key");
    document.getElementById("emptyState").style.display = "flex";
    return;
  }

  try {
    var resp = await fetch("/api/poker/hands", {
      headers: buildHeaders(),
    });
    if (!resp.ok) throw new Error("请求失败");
    var data = await resp.json();
    hands = data.hands || [];
    renderHands(hands, data.total || 0);
  } catch (e) {
    showToast("加载失败，请刷新重试");
  }
}

function renderHands(handList, total) {
  var emptyState = document.getElementById("emptyState");
  var listLabel = document.getElementById("listLabel");
  var handListCard = document.getElementById("handListCard");
  var leakBanner = document.getElementById("leakBanner");
  var leakLocked = document.getElementById("leakLocked");
  var leakBannerSub = document.getElementById("leakBannerSub");
  var leakLockedSub = document.getElementById("leakLockedSub");

  if (handList.length === 0) {
    emptyState.style.display = "flex";
    listLabel.style.display = "none";
    handListCard.style.display = "none";
    leakBanner.style.display = "none";
    leakLocked.style.display = "block";
    leakLockedSub.textContent = "累计录入 10 手后自动解锁（当前 0 手）";
    return;
  }

  emptyState.style.display = "none";
  listLabel.style.display = "block";
  handListCard.style.display = "block";

  if (total >= 10) {
    leakBanner.style.display = "block";
    leakLocked.style.display = "none";
    var analyzed = handList.filter(function (h) { return h.is_analyzed; }).length;
    leakBannerSub.textContent = "已分析 " + analyzed + " 手 · 点击识别重复问题";
  } else {
    leakBanner.style.display = "none";
    leakLocked.style.display = "block";
    leakLockedSub.textContent = "累计录入 10 手后自动解锁（当前 " + total + " 手）";
  }

  var body = document.getElementById("handListBody");
  body.innerHTML = handList.map(function (h) {
    var resultText = formatResultBB(h.result_bb);
    var resultClass = getResultClass(h.result_bb);
    var dot = h.is_analyzed
      ? '<span class="analysis-dot analyzed" title="已分析"></span>'
      : '<span class="analysis-dot pending" title="待分析"></span>';

    return (
      '<a class="hand-item" href="/poker/analysis.html?hand_id=' + h.id + '">' +
        '<div class="hand-cards">' + escapeHtml(h.hero_cards) + "</div>" +
        '<div class="hand-meta">' +
          '<div class="hand-meta-row">' +
            '<span class="hand-tag">' + escapeHtml(h.hero_position) + "</span>" +
            '<span class="hand-tag">' + escapeHtml(h.blind_level) + "</span>" +
            '<span class="hand-tag">' + tableTypeLabel(h.table_type) + "</span>" +
            dot +
          "</div>" +
          '<div class="hand-date">' + (formatDate(h.played_at) || formatDate(h.created_at)) + "</div>" +
        "</div>" +
        '<div class="hand-result ' + resultClass + '">' + (resultText || "—") + "</div>" +
      "</a>"
    );
  }).join("");
}

function tableTypeLabel(t) {
  if (t === "9max") return "9-Max";
  if (t === "hu") return "HU";
  return "6-Max";
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

loadHands();
