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
      '<div style="position:relative;">' +
        '<a class="hand-item" href="/poker/analysis.html?hand_id=' + h.id + '" style="padding-right:36px;">' +
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
        "</a>" +
        '<button onclick="confirmDeleteHand(event,' + h.id + ')" title="删除" ' +
          'style="position:absolute;top:50%;right:8px;transform:translateY(-50%);' +
          'background:none;border:none;color:var(--ink-faint);font-size:15px;' +
          'cursor:pointer;padding:6px 4px;line-height:1;z-index:1;">✕</button>' +
      "</div>"
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

async function confirmDeleteHand(event, id) {
  event.stopPropagation();
  event.preventDefault();
  if (!confirm("确定要删除这手牌吗？此操作不可恢复。")) return;
  try {
    var resp = await fetch("/api/poker/hands/" + id, {
      method: "DELETE",
      headers: buildHeaders(),
    });
    if (!resp.ok) throw new Error("删除失败");
    showToast("已删除");
    hands = hands.filter(function (h) { return h.id !== id; });
    renderHands(hands, hands.length);
  } catch (e) {
    showToast("删除失败，请重试");
  }
}

// ===== 快速录入 =====

function bindQuickEntry() {
  var input = document.getElementById("quickInput");
  var btn = document.getElementById("quickSubmit");
  var hint = document.getElementById("quickHint");
  if (!input || !btn) return;

  function updateHint() {
    var len = input.value.trim().length;
    if (len === 0)        hint.textContent = "少于 20 字将无法解析";
    else if (len < 20)    hint.textContent = "还差 " + (20 - len) + " 字";
    else if (len > 4000)  hint.textContent = "已超 4000 字，将截断";
    else                  hint.textContent = len + " 字";
  }
  input.addEventListener("input", updateHint);
  updateHint();

  btn.addEventListener("click", function () { submitQuickEntry(); });
}

async function submitQuickEntry() {
  var input = document.getElementById("quickInput");
  var btn = document.getElementById("quickSubmit");
  var text = input.value.trim();
  if (text.length < 20) {
    showToast("讲详细点：盲注、位置、起手牌、行动");
    input.focus();
    return;
  }
  if (text.length > 4000) text = text.slice(0, 4000);

  var settings = getSettings();
  var apiKey = getApiKeyForModel(settings.model);
  if (!apiKey) {
    showToast("请先在设置页配置 API Key");
    setTimeout(function () { window.location.href = "/poker/profile.html"; }, 1200);
    return;
  }

  btn.disabled = true;
  btn.textContent = "coach is reading…";

  try {
    var resp = await fetch("/api/poker/hands/parse", {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ text: text }),
    });

    if (resp.status === 422) {
      // 解析失败：尽量带原始文本跳到 form.html 让用户手动补
      sessionStorage.setItem("quickEntryDraft", JSON.stringify({
        hand: {},
        missing: [],
        warnings: [],
        raw_input: text,
        parse_failed: true,
      }));
      showToast("解析失败，转到手动录入");
      setTimeout(function () { window.location.href = "/poker/form.html?prefill=1"; }, 800);
      return;
    }

    if (!resp.ok) throw new Error("请求失败 " + resp.status);
    var data = await resp.json();

    sessionStorage.setItem("quickEntryDraft", JSON.stringify({
      hand: data.hand || {},
      missing: data.missing || [],
      warnings: data.warnings || [],
      raw_input: data.raw_input || text,
    }));
    window.location.href = "/poker/confirm.html";
  } catch (e) {
    console.error("[QuickEntry]", e);
    showToast("网络异常，转到手动录入");
    setTimeout(function () { window.location.href = "/poker/form.html"; }, 800);
  } finally {
    btn.disabled = false;
    btn.textContent = "复盘 →";
  }
}

bindQuickEntry();
loadHands();
