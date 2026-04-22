// ===== 向导状态 =====

var STEP_TITLES = ["坐到了哪里？", "你的起手牌", "逐街还原行动", "最后结果"];
var TABLE_LABEL = { "6max": "six-max", "9max": "nine-max", "hu": "heads-up" };

var state = {
  step: 0,
  blind_level: "",
  blind_custom: false,
  table_type: "6max",
  hero_position: null,
  effective_stack_bb: "",
  played_at: "",
  hero_cards: [null, null],
  preflop_actions: "",
  flop_open: false,
  flop_cards: [null, null, null],
  flop_actions: "",
  turn_open: false,
  turn_card: [null],
  turn_actions: "",
  river_open: false,
  river_card: [null],
  river_actions: "",
  result_bb: "",
  showdown_opp_cards: [null, null],
  opponent_notes: "",
  notes: "",
};

// 当前正在选的牌槽：'hero:0' / 'flop:1' / 'turn:0' / 'river:0' / 'opp:0'
var pickerTarget = null;
var pickerRank = null;

// ===== 通用工具 =====

function $(id) { return document.getElementById(id); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

// 槽位 → state 数组、下标
function targetSlot(target) {
  var parts = target.split(":");
  var key = parts[0];
  var idx = parseInt(parts[1], 10);
  var arr;
  if (key === "hero")  arr = state.hero_cards;
  if (key === "flop")  arr = state.flop_cards;
  if (key === "turn")  arr = state.turn_card;
  if (key === "river") arr = state.river_card;
  if (key === "opp")   arr = state.showdown_opp_cards;
  return { key: key, arr: arr, idx: idx };
}

// ===== 步骤切换 =====

function gotoStep(idx) {
  if (idx < 0 || idx > 3) return;
  state.step = idx;

  $$(".wizard-pane").forEach(function (el) {
    el.hidden = parseInt(el.dataset.pane, 10) !== idx;
  });
  $$(".wizard-step").forEach(function (el) {
    var i = parseInt(el.dataset.idx, 10);
    el.classList.toggle("active", i === idx);
    el.classList.toggle("done", i < idx);
  });
  $("stepTitle").textContent = STEP_TITLES[idx];
  $("stepCounter").textContent = (idx + 1) + "/4";

  $("prevBtn").disabled = (idx === 0);
  $("nextBtn").textContent = (idx === 3) ? "保存并分析" : "下一步 →";

  $("scrollArea").scrollTop = 0;
  refreshAll();
}

function validateStep(idx) {
  if (idx === 0) {
    if (!state.blind_level)   return "请选择盲注级别";
    if (!state.hero_position) return "请选择 Hero 位置";
    return null;
  }
  if (idx === 1) {
    if (!state.hero_cards[0] || !state.hero_cards[1]) return "请选齐两张起手牌";
    if (state.hero_cards[0] === state.hero_cards[1])  return "两张牌不能相同";
    return null;
  }
  if (idx === 2) {
    if (!state.preflop_actions.trim()) return "请填写翻前行动";
    if (state.flop_open && state.flop_cards.some(function (c) { return !c; })) return "请补齐翻牌三张公共牌";
    if (state.turn_open && !state.turn_card[0])  return "请补齐转牌";
    if (state.river_open && !state.river_card[0]) return "请补齐河牌";
    return null;
  }
  return null;
}

function nextStep() {
  var err = validateStep(state.step);
  if (err) { showToast(err); return; }
  if (state.step === 3) { submit(); return; }
  gotoStep(state.step + 1);
}

function prevStep() { gotoStep(state.step - 1); }

// ===== 步骤 0: 局况 =====

function renderBlindChips() {
  $$("#blindChips .chip").forEach(function (btn) {
    var v = btn.dataset.blind;
    var isCustom = (v === "__custom__");
    var active = isCustom ? state.blind_custom : (!state.blind_custom && state.blind_level === v);
    btn.classList.toggle("active", active);
  });
  $("blindCustom").style.display = state.blind_custom ? "block" : "none";
  $("centerBlind").textContent = state.blind_level ? "$" + state.blind_level : "—";
}

function bindBlindChips() {
  $$("#blindChips .chip").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var v = btn.dataset.blind;
      if (v === "__custom__") {
        state.blind_custom = true;
        state.blind_level = $("blindCustom").value.trim();
      } else {
        state.blind_custom = false;
        state.blind_level = v;
        $("blindCustom").value = "";
      }
      renderBlindChips();
      if (state.blind_custom) setTimeout(function () { $("blindCustom").focus(); }, 0);
    });
  });
  $("blindCustom").addEventListener("input", function (e) {
    state.blind_level = e.target.value.trim();
    renderBlindChips();
  });
}

function renderTableSeg() {
  $$("#tableSeg button").forEach(function (b) {
    b.classList.toggle("active", b.dataset.table === state.table_type);
  });
  $("centerType").textContent = TABLE_LABEL[state.table_type];
  // 切桌型时，若当前 hero_position 不在新桌型里，清空
  var positions = getPositions(state.table_type);
  if (state.hero_position && positions.indexOf(state.hero_position) === -1) {
    state.hero_position = null;
  }
  renderPositionTable();
}

function bindTableSeg() {
  $$("#tableSeg button").forEach(function (b) {
    b.addEventListener("click", function () {
      state.table_type = b.dataset.table;
      renderTableSeg();
    });
  });
}

function renderPositionTable() {
  var table = $("positionTable");
  table.innerHTML = "";
  var positions = getPositions(state.table_type);
  var n = positions.length;
  // 按容器实际尺寸算坐标，兼容小屏
  var rect = table.getBoundingClientRect();
  var size = rect.width || 280;
  var seatSize = size <= 250 ? 50 : 56;
  var cx = size / 2, cy = size / 2;
  var r = (size / 2) - seatSize * 0.55;
  positions.forEach(function (pos, i) {
    var a = (-Math.PI / 2) + (i * 2 * Math.PI / n);
    var x = cx + r * Math.cos(a);
    var y = cy + r * Math.sin(a);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "seat" + (state.hero_position === pos ? " selected" : "");
    btn.style.left = (x - seatSize / 2) + "px";
    btn.style.top  = (y - seatSize / 2) + "px";
    btn.textContent = pos;
    btn.addEventListener("click", function () {
      state.hero_position = pos;
      renderPositionTable();
    });
    table.appendChild(btn);
  });
  $("positionHint").textContent = state.hero_position
    ? "已选：" + state.hero_position
    : "点上方圆圈选你坐的位置";
  $("positionHint").classList.toggle("filled", !!state.hero_position);
}

// ===== 步骤 1: 起手牌（用通用 card-slot 渲染） =====

function renderHandTip() {
  var c1 = state.hero_cards[0];
  var c2 = state.hero_cards[1];
  if (!c1 || !c2) { $("handTip").textContent = ""; return; }
  var r1 = c1[0], s1 = c1[1], r2 = c2[0], s2 = c2[1];
  var label;
  if (r1 === r2) label = r1 + r1 + "（口袋对）";
  else if (s1 === s2) label = r1 + r2 + "s（同花）";
  else label = r1 + r2 + "o（杂色）";
  $("handTip").textContent = label;
}

// ===== 步骤 2: 行动 =====

function renderStreetVisibility() {
  ["flop", "turn", "river"].forEach(function (s) {
    var pane = document.querySelector('.street-pane[data-street="' + s + '"]');
    var addBtn = document.querySelector('.street-add[data-add="' + s + '"]');
    var open = state[s + "_open"];
    pane.hidden = !open;
    addBtn.hidden = open;
  });
  // turn/river 的 add 按钮仅在前一街已展开时可见
  var flopAdd = document.querySelector('.street-add[data-add="flop"]');
  var turnAdd = document.querySelector('.street-add[data-add="turn"]');
  var riverAdd = document.querySelector('.street-add[data-add="river"]');
  if (!state.flop_open) flopAdd.hidden = false;
  turnAdd.hidden = !state.flop_open || state.turn_open;
  riverAdd.hidden = !state.turn_open || state.river_open;
}

function bindStreetToggles() {
  $$(".street-add").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state[btn.dataset.add + "_open"] = true;
      renderStreetVisibility();
    });
  });
  $$(".street-remove").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var s = btn.dataset.remove;
      state[s + "_open"] = false;
      // 同时关闭其后的街道
      if (s === "flop")  { state.turn_open = false; state.river_open = false; }
      if (s === "turn")  { state.river_open = false; }
      // 清空对应数据
      if (s === "flop")  { state.flop_cards = [null, null, null]; state.flop_actions = ""; $("flopActions").value = ""; }
      if (s === "turn")  { state.turn_card = [null];  state.turn_actions = "";  $("turnActions").value = ""; }
      if (s === "river") { state.river_card = [null]; state.river_actions = ""; $("riverActions").value = ""; }
      renderAllSlots();
      renderStreetVisibility();
    });
  });
}

function bindActionInputs() {
  ["preflopActions", "flopActions", "turnActions", "riverActions"].forEach(function (id) {
    $(id).addEventListener("input", function (e) {
      var key = id.replace("Actions", "_actions");
      state[key] = e.target.value;
    });
  });
  // 快捷插入
  $$(".action-chips").forEach(function (group) {
    var targetId = group.dataset.target;
    group.querySelectorAll(".chip-sm").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var ta = $(targetId);
        var snip = chip.dataset.snip;
        var pos = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
        var before = ta.value.slice(0, pos);
        var after = ta.value.slice(pos);
        // 如果上一字符不是空格/逗号/换行，且新插入的不是逗号，前面补一个空格
        if (before.length && !/[\s，,]$/.test(before) && snip !== "，" && snip !== ",") {
          ta.value = before + " " + snip + after;
          var newPos = before.length + 1 + snip.length;
        } else {
          ta.value = before + snip + after;
          var newPos = before.length + snip.length;
        }
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
        var key = targetId.replace("Actions", "_actions");
        state[key] = ta.value;
      });
    });
  });
}

// ===== 步骤 3: 结果 =====

function bindResultStepper() {
  $$(".result-sign").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sign = parseInt(btn.dataset.sign, 10);
      var input = $("resultBB");
      var v = parseFloat(input.value);
      if (isNaN(v) || v === 0) { input.focus(); return; }
      input.value = (sign * Math.abs(v)).toString();
      state.result_bb = input.value;
    });
  });
  $("resultBB").addEventListener("input", function (e) { state.result_bb = e.target.value; });
  ["opponentNotes", "notes"].forEach(function (id) {
    $(id).addEventListener("input", function (e) {
      var key = id === "opponentNotes" ? "opponent_notes" : "notes";
      state[key] = e.target.value;
    });
  });
  $("oppClear").addEventListener("click", function () {
    state.showdown_opp_cards = [null, null];
    renderAllSlots();
  });
}

// ===== 通用：所有 card-slot 渲染 =====

function renderCardSlot(btn) {
  var target = btn.dataset.target;
  var slot = targetSlot(target);
  var card = slot.arr[slot.idx];
  if (card) {
    var rank = card[0];
    var suit = card[1];
    var glyph = { s: "♠", h: "♥", d: "♦", c: "♣" }[suit];
    var redClass = (suit === "h" || suit === "d") ? " red" : " black";
    btn.innerHTML = '<span class="card-face' + redClass + '"><span class="cf-rank">' + rank + '</span><span class="cf-suit">' + glyph + '</span></span>';
    btn.classList.add("filled");
  } else {
    var ph = btn.querySelector(".card-slot-placeholder");
    var phText = ph ? ph.textContent : "card";
    btn.innerHTML = '<span class="card-slot-placeholder">' + phText + '</span>';
    btn.classList.remove("filled");
  }
}

function renderAllSlots() {
  $$(".card-slot").forEach(renderCardSlot);
  renderHandTip();
}

function bindCardSlots() {
  $$(".card-slot").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openCardPicker(btn.dataset.target);
    });
  });
  $("heroClear").addEventListener("click", function () {
    state.hero_cards = [null, null];
    renderAllSlots();
  });
}

// ===== 选牌器 =====

function buildRankGrid() {
  var grid = $("rankGrid");
  grid.innerHTML = "";
  var ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  ranks.forEach(function (r) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = r;
    b.addEventListener("click", function () {
      pickerRank = r;
      $("pickedRank").textContent = "→ " + r;
      $$("#rankGrid button").forEach(function (x) { x.classList.toggle("active", x.textContent === r); });
    });
    grid.appendChild(b);
  });
}

function bindSuitGrid() {
  $$("#suitGrid button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!pickerRank) { showToast("先选点数"); return; }
      var card = pickerRank + b.dataset.suit;
      if (!pickerTarget) return;
      // 检查是否与其他位置牌重复
      if (isCardUsed(card, pickerTarget)) {
        showToast(card + " 已被其他位置占用");
        return;
      }
      var slot = targetSlot(pickerTarget);
      slot.arr[slot.idx] = card;
      closeCardPicker();
      renderAllSlots();
      // 起手牌：选完第一张自动移到第二张
      if (pickerTarget === "hero:0" && !state.hero_cards[1]) {
        setTimeout(function () { openCardPicker("hero:1"); }, 120);
      } else if (pickerTarget === "flop:0" && !state.flop_cards[1]) {
        setTimeout(function () { openCardPicker("flop:1"); }, 120);
      } else if (pickerTarget === "flop:1" && !state.flop_cards[2]) {
        setTimeout(function () { openCardPicker("flop:2"); }, 120);
      } else if (pickerTarget === "opp:0" && !state.showdown_opp_cards[1]) {
        setTimeout(function () { openCardPicker("opp:1"); }, 120);
      }
    });
  });
}

function isCardUsed(card, exceptTarget) {
  var groups = [
    ["hero:0", state.hero_cards[0]],
    ["hero:1", state.hero_cards[1]],
    ["flop:0", state.flop_cards[0]],
    ["flop:1", state.flop_cards[1]],
    ["flop:2", state.flop_cards[2]],
    ["turn:0", state.turn_card[0]],
    ["river:0", state.river_card[0]],
    ["opp:0", state.showdown_opp_cards[0]],
    ["opp:1", state.showdown_opp_cards[1]],
  ];
  return groups.some(function (g) { return g[1] === card && g[0] !== exceptTarget; });
}

function openCardPicker(target) {
  pickerTarget = target;
  pickerRank = null;
  var label = {
    "hero:0": "起手牌 · 第 1 张", "hero:1": "起手牌 · 第 2 张",
    "flop:0": "翻牌 · 第 1 张", "flop:1": "翻牌 · 第 2 张", "flop:2": "翻牌 · 第 3 张",
    "turn:0": "转牌", "river:0": "河牌",
    "opp:0": "对手底牌 · 第 1 张", "opp:1": "对手底牌 · 第 2 张",
  }[target] || "选张牌";
  $("cardPickerTitle").textContent = label;
  $("pickedRank").textContent = "";
  $$("#rankGrid button").forEach(function (x) { x.classList.remove("active"); });
  $("cardPickerMask").hidden = false;
  $("cardPickerSheet").hidden = false;
}

function closeCardPicker() {
  pickerTarget = null;
  pickerRank = null;
  $("cardPickerMask").hidden = true;
  $("cardPickerSheet").hidden = true;
}

// ===== 提交 =====

function buildPayload() {
  function joinCards(arr) {
    var cs = arr.filter(Boolean);
    return cs.length ? cs.join(" ") : null;
  }
  return {
    blind_level: state.blind_level,
    table_type: state.table_type,
    hero_position: state.hero_position,
    hero_cards: state.hero_cards.filter(Boolean).join(" "),
    effective_stack_bb: state.effective_stack_bb !== "" ? parseFloat(state.effective_stack_bb) : null,
    opponent_notes: state.opponent_notes.trim() || null,
    preflop_actions: state.preflop_actions.trim(),
    flop_cards:   state.flop_open  ? joinCards(state.flop_cards)  : null,
    flop_actions: state.flop_open  ? (state.flop_actions.trim() || null) : null,
    turn_card:    state.turn_open  ? (state.turn_card[0] || null) : null,
    turn_actions: state.turn_open  ? (state.turn_actions.trim() || null) : null,
    river_card:   state.river_open ? (state.river_card[0] || null) : null,
    river_actions:state.river_open ? (state.river_actions.trim() || null) : null,
    result_bb:    state.result_bb !== "" ? parseFloat(state.result_bb) : null,
    showdown_opp_cards: state.showdown_opp_cards.filter(Boolean).length === 2
      ? state.showdown_opp_cards.join(" ") : null,
    notes: state.notes.trim() || null,
    played_at: state.played_at || null,
  };
}

async function submit() {
  var settings = getSettings();
  var apiKey = getApiKeyForModel(settings.model);
  if (!apiKey) {
    showToast("请先在设置页配置 API Key");
    setTimeout(function () { window.location.href = "/poker/profile.html"; }, 1500);
    return;
  }
  var btn = $("nextBtn");
  btn.disabled = true;
  btn.textContent = "保存中…";
  try {
    var resp = await fetch("/api/poker/hands", {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(buildPayload()),
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
}

// ===== 初始化 =====

function refreshAll() {
  renderBlindChips();
  renderTableSeg();
  renderPositionTable();
  renderStreetVisibility();
  renderAllSlots();
}

(function init() {
  // 默认日期：今天
  var today = new Date().toISOString().slice(0, 10);
  $("playedAt").value = today;
  state.played_at = today;
  $("playedAt").addEventListener("input", function (e) { state.played_at = e.target.value; });
  $("effectiveStack").addEventListener("input", function (e) { state.effective_stack_bb = e.target.value; });

  bindBlindChips();
  bindTableSeg();
  bindStreetToggles();
  bindActionInputs();
  bindResultStepper();
  bindCardSlots();
  buildRankGrid();
  bindSuitGrid();

  $("cardPickerClose").addEventListener("click", closeCardPicker);
  $("cardPickerMask").addEventListener("click", closeCardPicker);

  $("prevBtn").addEventListener("click", prevStep);
  $("nextBtn").addEventListener("click", nextStep);

  // 步骤标签可点击跳转（仅允许跳到已校验通过的步骤）
  $$(".wizard-step").forEach(function (el) {
    el.addEventListener("click", function () {
      var target = parseInt(el.dataset.idx, 10);
      if (target <= state.step) { gotoStep(target); return; }
      // 向前跳：逐步校验
      for (var i = state.step; i < target; i++) {
        var err = validateStep(i);
        if (err) { showToast(err); return; }
      }
      gotoStep(target);
    });
  });

  gotoStep(0);
}());
