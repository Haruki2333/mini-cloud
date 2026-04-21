// ===== 街道展开/收起 =====

function toggleStreet(street) {
  var fields = document.getElementById(street + "Fields");
  var toggle = document.getElementById(street + "Toggle");
  var isOpen = fields.classList.contains("open");
  if (isOpen) {
    fields.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  } else {
    fields.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
  }
}

// ===== 位置下拉动态填充 =====

function updatePositions() {
  var tableType = document.getElementById("tableType").value;
  var positions = getPositions(tableType);
  var select = document.getElementById("heroPosition");
  var current = select.value;
  select.innerHTML = positions.map(function (p) {
    return '<option value="' + p + '"' + (p === current ? " selected" : "") + ">" + p + "</option>";
  }).join("");
}

document.getElementById("tableType").addEventListener("change", updatePositions);
updatePositions();

// ===== 设置今天日期 =====

(function () {
  var dateInput = document.getElementById("playedAt");
  var today = new Date().toISOString().slice(0, 10);
  dateInput.value = today;
}());

// ===== 表单提交 =====

document.getElementById("handForm").addEventListener("submit", async function (e) {
  e.preventDefault();

  var settings = getSettings();
  var apiKey = getApiKeyForModel(settings.model);
  if (!apiKey) {
    showToast("请先在设置页配置 API Key");
    setTimeout(function () { window.location.href = "/poker/profile.html"; }, 1500);
    return;
  }

  var btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "保存中…";

  var resultBBRaw = document.getElementById("resultBB").value;
  var resultBBVal = resultBBRaw !== "" ? parseFloat(resultBBRaw) : null;

  var payload = {
    blind_level: document.getElementById("blindLevel").value.trim(),
    table_type: document.getElementById("tableType").value,
    hero_position: document.getElementById("heroPosition").value,
    hero_cards: document.getElementById("heroCards").value.trim(),
    effective_stack_bb: document.getElementById("effectiveStack").value
      ? parseFloat(document.getElementById("effectiveStack").value)
      : null,
    opponent_notes: document.getElementById("opponentNotes").value.trim() || null,
    preflop_actions: document.getElementById("preflopActions").value.trim(),
    flop_cards: document.getElementById("flopCards").value.trim() || null,
    flop_actions: document.getElementById("flopActions").value.trim() || null,
    turn_card: document.getElementById("turnCard").value.trim() || null,
    turn_actions: document.getElementById("turnActions").value.trim() || null,
    river_card: document.getElementById("riverCard").value.trim() || null,
    river_actions: document.getElementById("riverActions").value.trim() || null,
    result_bb: resultBBVal,
    showdown_opp_cards: document.getElementById("showdownOppCards").value.trim() || null,
    notes: document.getElementById("notes").value.trim() || null,
    played_at: document.getElementById("playedAt").value || null,
  };

  try {
    var resp = await fetch("/api/poker/hands", {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      var err = await resp.json();
      throw new Error(err.error || "保存失败");
    }

    var data = await resp.json();
    window.location.href = "/poker/analysis.html?hand_id=" + data.hand_id + "&auto=1";
  } catch (err) {
    showToast(err.message || "保存失败，请重试");
    btn.disabled = false;
    btn.textContent = "保存并分析";
  }
});
